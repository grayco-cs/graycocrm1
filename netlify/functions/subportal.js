// netlify/functions/subportal.js
// GrayCo — THE SUBCONTRACTOR PORTAL's server (portal.grayco-cs.com, and the 🔨 Sub Portal tab in the CRM).
//
// The portal page (subportal/) never talks to the database itself. Every read and write comes
// here with the signed-in person's Supabase token, and this function decides what they may see:
//
//   GrayCo staff (on gc_staff)  → the portal's admins: every job, bid, subcontractor and document.
//   A subcontractor             → ONLY their own profile, their own bids, documents, drafts and
//                                 message threads, the jobs they may bid on (public, invited, or
//                                 already bid on), and the GrayCo contacts on those jobs.
//                                 Never another sub's name, bid amount or paper.
//
// PUBLIC (no sign-in; rate limited per address):
//   POST {action:'register', email, password, profile, invite, job, force} → a new sub sign-in
//   POST {action:'invite-info', invite, job}                                → the invited email + job title
// SIGNED IN:
//   POST {action:'me'}                              → who am I (profile, role)
//   POST {action:'load', keys:[…]}                  → the records for those keys, already filtered
//   POST {action:'save', key, upsert:[…], del:[…]}  → change records in a list (users, jobs, bids …)
//   POST {action:'save', key, value}                → replace one record (plans:<job>, subdocs:<user> …)
//   POST {action:'upload', name, type, size}        → a one-time upload link into the private bucket
//   POST {action:'my-work'}                         → (sub) jobs, pay and 1099 / insurance info from the CRM
//   POST {action:'crm-subs'}                        → (staff) the CRM's subcontractor list, for linking
//   POST {action:'ai-plans', fileRef}               → (staff) read a plan PDF with Claude → title / scope …
//
// Data: table sp_rows (docs/subportal-setup.sql: RLS on, no rules — only this function, with the
// service key, can read it) and the private bucket subportal-files. Files leave only as signed
// links that run out after 8 hours, and only inside records the person may see.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (already set), RESEND_API_KEY (already set; e-mail),
//      ANTHROPIC_API_KEY (already set; plan reading), optional SUBPORTAL_NOTIFY (who hears about
//      new sign-ups, default office@grayco-cs.com), SUBPORTAL_AI_MODEL, PORTAL_MAIL_OFF=1.

const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
/* 33.151: the bid site is bids.grayco-cs.com (BIDS_URL); the working portal (scopes, messages, pay) is
   portal.grayco-cs.com (PORTAL_BASE_URL, netlify/functions/portal-access.js). Both may call this function. */
const PORTAL_ORIGIN = (function(){ const v = String(process.env.BIDS_URL || '').trim().replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : 'https://bids.grayco-cs.com'; })();
const CUSTOMER_PORTAL_ORIGIN = (function(){ const v = String(process.env.PORTAL_BASE_URL || '').trim().replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : 'https://portal.grayco-cs.com'; })();
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* CORS: the CRM's own addresses (SITE_ORIGIN) and the portal's address. */
function gcCors(event){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').concat([PORTAL_ORIGIN, CUSTOMER_PORTAL_ORIGIN])
    .map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event, 'origin').replace(/\/$/, '');
  return {
    'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };
}

const crypto = require('crypto');

const BUCKET = 'subportal-files';
const MAX_FILE = 50 * 1024 * 1024;
const SIGN_SECS = 8 * 3600;
const MAX_ROW = 900 * 1024;
const OFFICE = 'office@grayco-cs.com';
const OFFICE_PHONE = '901-585-0944';
const COLLECTIONS = ['users', 'jobs', 'bids', 'estimates', 'activity', 'messages', 'invites', 'links', 'questions'];
const KEYED = ['plans', 'subdocs', 'takeoff', 'bid-draft'];
const CLOSED = ['closed', 'won', 'lost'];
/* patch LD2: the Lead Inbox writes DRAFT bid jobs here (netlify/functions/_lib/bid-portal.js: status "draft",
   visibility "private", draft:true). A draft is for GrayCo staff only — never shown to a sub, invited or not,
   until an admin publishes it (CRM Lead Inbox "Publish to bid portal", or the same button on the job here). */
function isDraft(j){ return !!j && (j.draft === true || low(j.status) === 'draft'); }
// What a subcontractor may change on their own profile. Never role, approval, e-mail or the CRM link.
const SUB_PROFILE_FIELDS = ['name', 'phone', 'contactTitle', 'company', 'dbaName', 'businessAddress', 'businessCity',
  'businessState', 'businessZip', 'website', 'yearsInBusiness', 'numEmployees', 'unionAffiliation', 'serviceArea',
  'licenseNumbers', 'einLast4', 'trades', 'suggestPasswordChange', 'lang'];
// What a sub sees of a pre-bid question (never another sub's name or company).
const QUESTION_FIELDS = ['id', 'jobId', 'body', 'attachments', 'at', 'answer', 'answerAttachments', 'answeredAt', 'visibility', 'num'];
// What a subcontractor sees of a GrayCo person (the PM / estimator on a job).
const STAFF_PUBLIC_FIELDS = ['id', 'name', 'email', 'phone', 'title', 'role', 'company'];
// Phone and title for the people already at GrayCo, used the first time they open the portal. Anyone else (a new
// PM, APM or super) gets theirs from the CRM's people list (knownStaff) — patch PMG: no PM is listed by name here.
const KNOWN_STAFF = {
  'nthomas@grayco-cs.com': { name: 'Nick Thomas', phone: '901-634-4354', title: 'Owner' },
  'wjohnson@grayco-cs.com': { name: 'Wesley Johnson', phone: '901-692-7255', title: 'Owner' },
  'office@grayco-cs.com': { name: 'Brittany', phone: '901-585-0944', title: 'Office Manager' }
};

/* ── small helpers ─────────────────────────────────────────────────────────── */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function num(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isFinite(n) ? n : 0;
}
function arr(v){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
  return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : [];
}
function okEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200; }
function okId(v){ return typeof v === 'string' && v.length >= 1 && v.length <= 120 && !/[\/\s]/.test(v); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }
function pick(o, fields){ const out = {}; fields.forEach(function(f){ if (o && o[f] !== undefined) out[f] = o[f]; }); return out; }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function anonKey(){ return process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON; }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function H(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function Fail(status, message){ const e = new Error(message); e.status = status; return e; }
function mailOff(){ return process.env.PORTAL_MAIL_OFF === '1' || process.env.PORTAL_MAIL_OFF === 'true'; }

/* ── sp_rows ───────────────────────────────────────────────────────────────── */
// filters: PostgREST query parts, e.g. ['collection=eq.bids', 'user_id=eq.u_1']
async function listRows(filters){
  const out = [];
  const q = sbUrl() + '/rest/v1/sp_rows?select=key,collection,id,job_id,user_id,email,data&order=key.asc&' + filters.join('&');
  for (let from = 0; from < 100000; from += 1000) {
    const r = await fetch(q, { headers: H({ Range: from + '-' + (from + 999), 'Range-Unit': 'items' }) });
    if (r.status === 404) throw Fail(503, 'The portal is not set up in the database yet (run docs/subportal-setup.sql).');
    if (!r.ok && r.status !== 206) {
      const t = await r.text();
      if (/sp_rows/.test(t) && /does not exist|schema cache/.test(t)) throw Fail(503, 'The portal is not set up in the database yet (run docs/subportal-setup.sql).');
      throw Fail(502, 'Database read failed (' + r.status + ').');
    }
    const rows = await r.json();
    out.push.apply(out, Array.isArray(rows) ? rows : []);
    if (!Array.isArray(rows) || rows.length < 1000) break;
  }
  return out;
}
function eq(col, v){ return col + '=eq.' + encodeURIComponent(v); }
function inList(col, vals){ return col + '=in.(' + vals.map(function(v){ return '"' + String(v).replace(/"/g, '') + '"'; }).join(',') + ')'; }
async function getRow(collection, id){
  const rows = await listRows([eq('key', collection + '/' + id)]);
  return rows[0] || null;
}
async function upsertRows(rows, who){
  if (!rows.length) return;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200).map(function(x){
      return { key: x.collection + '/' + x.id, collection: x.collection, id: x.id, job_id: x.job_id || null,
               user_id: x.user_id || null, email: x.email || null, data: x.data, updated_at: now, updated_by: who };
    });
    const r = await fetch(sbUrl() + '/rest/v1/sp_rows?on_conflict=key', {
      method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(part) });
    if (!r.ok) {
      const t = (await r.text()).slice(0, 200);
      if (/sp_rows_one_profile_per_email/.test(t)) throw Fail(409, 'That e-mail already has a portal account.');
      throw Fail(502, 'Database write failed (' + r.status + ').');
    }
  }
}
async function deleteKeys(keys){
  for (let i = 0; i < keys.length; i += 100) {
    const part = keys.slice(i, i + 100);
    const r = await fetch(sbUrl() + '/rest/v1/sp_rows?' + inList('key', part), { method: 'DELETE', headers: H({ Prefer: 'return=minimal' }) });
    if (!r.ok) throw Fail(502, 'Database delete failed (' + r.status + ').');
  }
}
// The scoping columns are always worked out here from the record itself, never taken from the browser.
function rowFor(collection, rec){
  const r = { collection: collection, id: s(rec.id), data: rec };
  if (collection === 'users') { r.user_id = r.id; r.email = low(rec.email); }
  else if (collection === 'jobs') r.job_id = r.id;
  else if (collection === 'bids' || collection === 'activity') { r.job_id = s(rec.jobId); r.user_id = s(rec.userId); }
  else if (collection === 'estimates') r.job_id = s(rec.jobId);
  else if (collection === 'messages') { r.job_id = s(rec.jobId); r.user_id = threadOf(rec); }
  else if (collection === 'invites') { r.job_id = s(rec.jobId); r.email = low(rec.email); }
  else if (collection === 'questions') { r.job_id = s(rec.jobId); r.user_id = s(rec.userId); }
  return r;
}
function threadOf(m){ return s(m.senderRole === 'sub' ? m.senderId : m.recipientSubId); }

/* ── files ─────────────────────────────────────────────────────────────────── */
function walkFiles(v, fn){
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) { v.forEach(function(x){ walkFiles(x, fn); }); return; }
  if (typeof v.fileRef === 'string' && v.fileRef) fn(v);
  Object.keys(v).forEach(function(k){ if (v[k] && typeof v[k] === 'object') walkFiles(v[k], fn); });
}
function refsIn(v){ const out = []; walkFiles(v, function(o){ out.push(o.fileRef); }); return out; }
// Before saving: a file is kept as its reference only (the signed link is not stored), and a
// big inline file that was never uploaded is refused instead of bloating the database.
function cleanFiles(v){
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) { v.forEach(cleanFiles); return; }
  if (typeof v.dataUrl === 'string') {
    if (v.fileRef || /^https:\/\//.test(v.dataUrl)) delete v.dataUrl;
    else if (v.dataUrl.length > 300000) throw Fail(413, 'A file was not uploaded. Try attaching it again.');
  }
  Object.keys(v).forEach(function(k){ if (v[k] && typeof v[k] === 'object') cleanFiles(v[k]); });
}
async function signAll(value){
  const objs = [];
  walkFiles(value, function(o){ objs.push(o); });
  if (!objs.length) return value;
  const paths = Array.from(new Set(objs.map(function(o){ return o.fileRef; })));
  const map = {};
  for (let i = 0; i < paths.length; i += 200) {
    const r = await fetch(sbUrl() + '/storage/v1/object/sign/' + BUCKET, {
      method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: SIGN_SECS, paths: paths.slice(i, i + 200) }) });
    if (!r.ok) continue;
    const list = await r.json();
    (Array.isArray(list) ? list : []).forEach(function(x){
      if (x && x.path && x.signedURL && !x.error) map[x.path] = sbUrl() + '/storage/v1' + x.signedURL;
    });
  }
  objs.forEach(function(o){ if (map[o.fileRef]) o.dataUrl = map[o.fileRef]; else delete o.dataUrl; });
  return value;
}
function safeName(n){ return s(n).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(-80) || 'file'; }

/* ── who is asking ────────────────────────────────────────────────────────── */
let staffCache = null;
async function staffList(){
  if (staffCache && Date.now() - staffCache.at < 30e3) return staffCache.list;
  const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=email,name,role,active', { headers: H() });
  if (!r.ok) throw Fail(503, 'The GrayCo staff list (gc_staff) could not be read.');
  const list = (await r.json()).filter(function(x){ return x && x.active !== false; })
    .map(function(x){ return { email: low(x.email), name: s(x.name), role: low(x.role) || 'staff' }; });
  staffCache = { at: Date.now(), list: list };
  return list;
}
/* patch PMG: a GrayCo person's phone / title from the CRM's people list (gc_kv "users") */
async function crmUsers(){ try { const d = await kvRead(['users']); return arr(d.users); } catch (e) { return []; } }
function fromCrm(list, email){ const u = list.find(function(x){ return low(x.email) === low(email); }); return u ? { name: s(u.name), phone: s(u.phone || u.cell || u.mobile), title: s(u.title || u.role) } : {}; }
async function knownStaff(email){ return KNOWN_STAFF[email] || fromCrm(await crmUsers(), email); }
async function staffByEmail(email){
  const list = await staffList();
  return list.find(function(x){ return x.email === email; }) || null;
}
function staffId(email){ return 'st_' + email.split('@')[0].replace(/[^a-z0-9]+/g, '_').slice(0, 40); }

async function tokenUser(event){
  const m = /^Bearer\s+(\S+)$/i.exec(gcHeader(event, 'authorization').trim());
  if (!m) throw Fail(401, 'Please sign in.');
  let user = null;
  try {
    const r = await fetch(sbUrl() + '/auth/v1/user', { headers: { apikey: anonKey(), Authorization: 'Bearer ' + m[1] } });
    if (r.ok) user = await r.json();
  } catch (e) { throw Fail(503, 'Could not reach the sign-in service. Try again.'); }
  const email = low(user && user.email);
  if (!email) throw Fail(401, 'Your sign-in has expired. Please sign in again.');
  return { email: email, uid: s(user.id) };
}

// → { email, uid, staff: {…}|null, profile: {…}|null, isAdmin, isSub, approved }
async function whoAmI(event){
  const t = await tokenUser(event);
  const staff = await staffByEmail(t.email);
  let row = (await listRows([eq('collection', 'users'), eq('email', t.email)]))[0] || null;
  let profile = row ? row.data : null;
  if (staff) {
    // GrayCo staff: make sure their portal profile exists and says admin.
    const known = profile ? {} : await knownStaff(t.email);
    const base = profile || { id: staffId(t.email), email: t.email, company: 'GrayCo Construction Services',
      name: staff.name || known.name || t.email, phone: known.phone || '', title: known.title || '',
      trades: [], createdAt: new Date().toISOString() };
    if (!profile || profile.role !== 'admin' || profile.approved !== true || profile.authUserId !== t.uid) {
      profile = Object.assign({}, base, { role: 'admin', approved: true, authUserId: t.uid });
      await upsertRows([rowFor('users', profile)], t.email);
    }
    return { email: t.email, uid: t.uid, staff: staff, profile: profile, isAdmin: true, isSub: false, approved: true };
  }
  if (!profile || profile.role !== 'sub') return { email: t.email, uid: t.uid, staff: null, profile: null, isAdmin: false, isSub: false, approved: false };
  if (profile.authUserId !== t.uid) {
    profile = Object.assign({}, profile, { authUserId: t.uid });
    await upsertRows([rowFor('users', profile)], t.email);
  }
  return { email: t.email, uid: t.uid, staff: null, profile: profile, isAdmin: false, isSub: true, approved: profile.approved === true };
}
function needSub(who, approvedOnly){
  if (who.isAdmin) return;
  if (!who.isSub) throw Fail(403, 'This sign-in has no subcontractor portal account. Register first, or call GrayCo ' + OFFICE_PHONE + '.');
  if (approvedOnly && !who.approved) throw Fail(403, 'Your account is waiting for GrayCo to approve it.');
}

/* ── what a subcontractor may see ─────────────────────────────────────────── */
async function subScope(who){
  const me = who.profile.id;
  const [jobs, invites, myBids] = await Promise.all([
    listRows([eq('collection', 'jobs')]),
    listRows([eq('collection', 'invites'), eq('email', who.email)]),
    listRows([eq('collection', 'bids'), eq('user_id', me)])
  ]);
  const invited = new Set(invites.map(function(r){ return r.job_id; }));
  const bidOn = new Set(myBids.map(function(r){ return r.job_id; }));
  const visible = {}, biddable = {};
  if (who.approved) {
    jobs.forEach(function(r){
      const j = r.data || {};
      if (isDraft(j)) return;
      const canSee = (j.visibility || 'public') === 'public' || invited.has(r.id);
      const open = CLOSED.indexOf(low(j.status)) < 0;
      if (bidOn.has(r.id) || (canSee && open)) visible[r.id] = r;
      if (canSee && open) biddable[r.id] = true;
    });
  }
  return { me: me, jobs: visible, biddable: biddable, invites: invites, myBids: myBids };
}

async function staffUsers(){
  const [rows, staff] = await Promise.all([listRows([eq('collection', 'users')]), staffList()]);
  // Everyone on the staff list gets a profile, so they can be picked as PM / estimator.
  const have = new Set(rows.map(function(r){ return low(r.email); }));
  const crmPeople = staff.some(function(x){ return !have.has(x.email) && !KNOWN_STAFF[x.email]; }) ? await crmUsers() : [];
  const add = staff.filter(function(x){ return !have.has(x.email); }).map(function(x){
    const known = KNOWN_STAFF[x.email] || fromCrm(crmPeople, x.email);
    return { id: staffId(x.email), email: x.email, role: 'admin', approved: true, name: x.name || known.name || x.email,
      phone: known.phone || '', title: known.title || '', company: 'GrayCo Construction Services', trades: [],
      createdAt: new Date().toISOString() };
  });
  if (add.length) { await upsertRows(add.map(function(u){ return rowFor('users', u); }), 'subportal'); }
  const active = new Set(staff.map(function(x){ return x.email; }));
  return rows.map(function(r){ return r.data; }).concat(add).map(function(u){
    // someone taken off the staff list stops showing as a GrayCo contact
    if (u.role === 'admin' && !active.has(low(u.email))) return Object.assign({}, u, { role: 'former' });
    return u;
  });
}

async function loadKey(who, key, ctx){
  const parts = key.split(':');
  const head = parts[0];
  if (key === 'planreqs') {   /* plans requests: GrayCo sees all, a sub only their own */
    if (who.isAdmin) return (await listRows([eq('collection', 'planreqs')])).map(function(r){ return r.data; });
    if (!who.profile) return [];
    return (await listRows([eq('collection', 'planreqs'), eq('user_id', who.profile.id)])).map(function(r){ return { jobId: r.data.jobId, at: r.data.at, notifiedAt: r.data.notifiedAt }; });
  }
  if (COLLECTIONS.indexOf(key) > -1) {
    if (who.isAdmin) {
      if (key === 'users') return staffUsers();
      return (await listRows([eq('collection', key)])).map(function(r){ return r.data; });
    }
    const sc = ctx.scope || (ctx.scope = await subScope(who));
    if (key === 'users') {
      const all = await listRows([eq('collection', 'users')]);
      const staff = new Set((await staffList()).map(function(x){ return x.email; }));
      return all.filter(function(r){ return r.id === sc.me || (r.data.role === 'admin' && staff.has(low(r.email))); })
        .map(function(r){ return r.id === sc.me ? r.data : pick(r.data, STAFF_PUBLIC_FIELDS); });
    }
    if (key === 'jobs') return Object.keys(sc.jobs).map(function(id){ return sc.jobs[id].data; });
    if (key === 'bids') return bidsWithResults(sc);
    if (key === 'messages') {
      if (!who.approved) return [];
      return (await listRows([eq('collection', 'messages'), eq('user_id', sc.me)])).map(function(r){ return r.data; });
    }
    if (key === 'invites') return sc.invites.map(function(r){ return pick(r.data, ['id', 'jobId', 'email', 'usedAt', 'usedBy']); });
    if (key === 'questions') {
      /* 33.151 pre-bid Q&A: their own questions, and every ANSWERED question GrayCo shared with all bidders —
         someone else's never with a name, company or private part */
      if (!who.approved) return [];
      const ids = Object.keys(sc.jobs); if (!ids.length) return [];
      return (await listRows([eq('collection', 'questions'), inList('job_id', ids)])).map(function(r){ return r.data; })
        .filter(function(q){ return q.userId === sc.me || (q.visibility === 'public' && s(q.answer)); })
        .map(function(q){ return q.userId === sc.me ? pick(q, QUESTION_FIELDS.concat(['userId'])) : Object.assign(pick(q, QUESTION_FIELDS), { userId: '', mine: false, attachments: [] }); });   /* the asker's own files could show who they are */
    }
    return [];   // estimates, activity, links: GrayCo only
  }
  if (head === 'plans' && parts.length === 2) {
    if (!who.isAdmin) { const sc = ctx.scope || (ctx.scope = await subScope(who)); if (!sc.jobs[parts[1]]) return []; }
    const r = await getRow('plans', parts[1]);
    return r ? arr(r.data.items) : [];
  }
  if (head === 'subdocs' && parts.length === 2) {
    if (parts[1] === '*') {
      if (!who.isAdmin) throw Fail(403, 'GrayCo staff only.');
      const out = {};
      (await listRows([eq('collection', 'subdocs')])).forEach(function(r){ out[r.id] = arr(r.data.items); });
      return out;
    }
    if (!who.isAdmin && parts[1] !== who.profile.id) throw Fail(403, 'Not your documents.');
    const r = await getRow('subdocs', parts[1]);
    return r ? arr(r.data.items) : [];
  }
  if (head === 'takeoff' && parts.length >= 4) {
    if (!who.isAdmin && parts[1] !== who.profile.id) throw Fail(403, 'Not your takeoff.');
    const r = await getRow('takeoff', parts.slice(1).join(':'));
    return r ? r.data.value : null;
  }
  if (head === 'bid-draft' && parts.length === 3) {
    if (!who.isAdmin && parts[2] !== who.profile.id) throw Fail(403, 'Not your draft.');
    const r = await getRow('bid-draft', parts[1] + ':' + parts[2]);
    return r ? r.data.value : null;
  }
  throw Fail(400, 'Unknown record: ' + key);
}

// A sub's own bids, plus — only where GrayCo turned on results sharing for that job — their
// place among the bids (and, for "full", the amounts with no names). Nothing else of anyone else.
async function bidsWithResults(sc){
  const mine = sc.myBids.map(function(r){ return clone(r.data); });
  const shareJobs = mine.map(function(b){ return sc.jobs[b.jobId] && sc.jobs[b.jobId].data; })
    .filter(function(j){ return j && j.bidResultsSharing && j.bidResultsSharing !== 'private'; })
    .map(function(j){ return j.id; });
  if (!shareJobs.length) return mine;
  const all = await listRows([eq('collection', 'bids'), inList('job_id', Array.from(new Set(shareJobs)))]);
  mine.forEach(function(b){
    const job = sc.jobs[b.jobId] && sc.jobs[b.jobId].data;
    if (!job || !job.bidResultsSharing || job.bidResultsSharing === 'private') return;
    const sorted = all.filter(function(r){ return r.job_id === b.jobId; }).map(function(r){ return r.data; })
      .sort(function(x, y){ return num(x.amount) - num(y.amount); });
    b._rank = sorted.findIndex(function(x){ return x.id === b.id; }) + 1;
    b._total = sorted.length;
    if (job.bidResultsSharing === 'full') {
      b._amounts = sorted.map(function(x){ return { amount: num(x.amount), accepted: !!x.accepted, mine: x.id === b.id }; });
    }
  });
  return mine;
}

/* ── saving ───────────────────────────────────────────────────────────────── */
async function saveCollection(who, key, upsert, del, ctx){
  upsert = Array.isArray(upsert) ? upsert.filter(function(x){ return x && typeof x === 'object' && okId(x.id); }) : [];
  del = Array.isArray(del) ? del.filter(okId) : [];
  upsert.forEach(cleanFiles);
  upsert.forEach(function(x){ if (JSON.stringify(x).length > MAX_ROW) throw Fail(413, 'That record is too big to save.'); });
  const existing = {};
  const ids = upsert.map(function(x){ return x.id; }).concat(del);
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      (await listRows([inList('key', ids.slice(i, i + 100).map(function(id){ return key + '/' + id; }))]))
        .forEach(function(r){ existing[r.id] = r; });
    }
  }
  const notes = [];   // e-mails to send after the save
  let rows = [], dropKeys = [];

  if (who.isAdmin) {
    if (key === 'users') {
      const staff = new Set((await staffList()).map(function(x){ return x.email; }));
      for (const rec0 of upsert) {
        const rec = Object.assign({}, rec0);
        delete rec.password;
        const old = existing[rec.id] && existing[rec.id].data;
        rec.email = old ? low(old.email) : low(rec.email);
        if (!okEmail(rec.email)) continue;
        if (!old && (rec.role === 'admin' || staff.has(rec.email))) continue;   // GrayCo people come from Team access in the CRM
        rec.role = staff.has(rec.email) ? 'admin' : (old && old.role === 'admin' ? 'former' : 'sub');
        if (old) { rec.authUserId = old.authUserId; rec.createdAt = old.createdAt || rec.createdAt; }
        if (rec.role === 'sub' && rec.approved === true && old && old.approved !== true) notes.push({ kind: 'approved', user: rec });
        rows.push(rowFor('users', rec));
      }
      for (const id of del) {
        const old = existing[id] && existing[id].data;
        if (!old || old.role === 'admin') continue;
        dropKeys.push('users/' + id, 'subdocs/' + id);
        if (old.authUserId && !staff.has(low(old.email))) await deleteAuthUser(old.authUserId);
      }
    } else {
      if (key === 'questions') {
        const jobNums = {};
        for (const rec0 of upsert) {
          const old = existing[rec0.id] && existing[rec0.id].data;
          const rec = Object.assign({}, old || {}, rec0);
          if (old) ['userId', 'userName', 'userCompany', 'at', 'body', 'attachments'].forEach(function(k){ rec[k] = old[k]; });   /* what the sub asked stays as asked */
          rec.visibility = rec.visibility === 'public' ? 'public' : 'private';
          if (s(rec.answer) && (!old || s(old.answer) !== s(rec.answer))) { rec.answeredAt = new Date().toISOString(); rec.answeredBy = who.profile && who.profile.name || who.email; }
          if (rec.visibility === 'public' && s(rec.answer) && !rec.num) {
            if (!(rec.jobId in jobNums)) jobNums[rec.jobId] = Math.max(0, ...(await listRows([eq('collection', 'questions'), eq('job_id', rec.jobId)])).map(function(r){ return Number(r.data.num) || 0; }));
            rec.num = ++jobNums[rec.jobId];
          }
          /* an answer to all bidders e-mails every invited / bidding sub — only after a person approves it (owner rule) */
          if (rec.visibility === 'public' && s(rec.answer) && !rec.noticeStatus) rec.noticeStatus = process.env.PORTAL_AUTO_EMAIL === '1' ? 'approve' : 'waiting';
          if (rec.noticeStatus === 'approve' && (!old || old.noticeStatus !== 'sent')) { notes.push({ kind: 'answer-to-bidders', q: rec }); rec.noticeStatus = 'sent'; rec.noticeSentAt = new Date().toISOString(); rec.noticeBy = who.email; }
          if (rec.visibility === 'private' && rec.noticeStatus === 'waiting') delete rec.noticeStatus;
          rows.push(rowFor('questions', rec));
        }
      } else upsert.forEach(function(rec){
        if (key === 'jobs') {   /* patch LD2: a draft stays a draft until "Publish to bid portal" */
          const old = existing[rec.id] && existing[rec.id].data;
          const publish = rec._publish === true; delete rec._publish;
          if (old) ['leadInbox', 'specDocs', 'sourceLink', 'createdBy', 'createdByName', 'createdAt'].forEach(function(k){ if (rec[k] === undefined && old[k] !== undefined) rec[k] = old[k]; });
          if (publish && (isDraft(old) || isDraft(rec))) {
            Object.assign(rec, { status: 'open', visibility: 'public', draft: false, publishedAt: new Date().toISOString(), publishedBy: who.email });
          } else if (isDraft(old) || (!old && isDraft(rec))) {
            Object.assign(rec, { status: 'draft', visibility: 'private', draft: true });
          }
        }
        if (key === 'messages' && !existing[rec.id] && rec.senderRole !== 'sub' && rec.recipientSubId) notes.push({ kind: 'message-to-sub', msg: rec });
        rows.push(rowFor(key, rec));
      });
      dropKeys = del.filter(function(id){ return existing[id]; }).map(function(id){ return key + '/' + id; });
    }
  } else {
    needSub(who, key !== 'users');
    const p = who.profile, me = p.id;
    const sc = key === 'users' ? null : (ctx.scope || (ctx.scope = await subScope(who)));
    if (key === 'users') {
      upsert.filter(function(x){ return x.id === me; }).forEach(function(x){
        rows.push(rowFor('users', Object.assign({}, p, pick(x, SUB_PROFILE_FIELDS), { updatedAt: new Date().toISOString() })));
      });
    } else if (key === 'bids') {
      for (const x of upsert) {
        const old = existing[x.id];
        if (old && old.user_id !== me) continue;
        const prev = old ? old.data : null;
        const jobId = prev ? prev.jobId : s(x.jobId);
        if (prev && (prev.accepted || prev.rejected)) throw Fail(409, 'This bid has already been decided by GrayCo and can no longer be changed.');
        if (!sc.biddable[jobId]) throw Fail(403, 'This job is not open for bids.');
        checkRefs(x, prev, me);
        const b = Object.assign({}, prev || {}, {
          id: x.id, jobId: jobId, userId: me, userName: p.name, userCompany: p.company, userEmail: p.email, userPhone: p.phone || '',
          amount: num(x.amount), scope: s(x.scope).slice(0, 20000), notes: s(x.notes).slice(0, 20000),
          docs: arr(x.docs), submittedAt: x.submittedAt || new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        ['_rank', '_total', '_amounts'].forEach(function(k){ delete b[k]; });
        if (!prev) notes.push({ kind: 'new-bid', bid: b, job: sc.jobs[jobId] && sc.jobs[jobId].data });
        rows.push(rowFor('bids', b));
      }
      del.forEach(function(id){
        const old = existing[id];
        if (old && old.user_id === me && !old.data.accepted) dropKeys.push('bids/' + id);
      });
    } else if (key === 'messages') {
      for (const x of upsert) {
        const old = existing[x.id];
        if (old) {
          if (old.user_id !== me) continue;
          // only "I have read this" may change on an existing message
          const readBy = arr([]).concat(Array.isArray(old.data.readBy) ? old.data.readBy : []);
          if (readBy.indexOf(me) < 0) readBy.push(me);
          rows.push(rowFor('messages', Object.assign({}, old.data, { readBy: readBy })));
          continue;
        }
        const jobId = s(x.jobId);
        if (!sc.jobs[jobId]) continue;
        checkRefs(x, null, me);
        const m = { id: x.id, jobId: jobId, senderId: me, senderName: p.name, senderCompany: p.company, senderRole: 'sub',
          recipientSubId: null, body: s(x.body).slice(0, 5000), at: new Date().toISOString(), readBy: [me],
          graycoRecipients: arr(x.graycoRecipients).slice(0, 5).map(function(g){ return pick(g, ['id', 'name', 'role']); }) };
        if (Array.isArray(x.attachments)) m.attachments = arr(x.attachments).slice(0, 10);
        notes.push({ kind: 'message-from-sub', msg: m, job: sc.jobs[jobId].data });
        rows.push(rowFor('messages', m));
      }
    } else if (key === 'questions') {
      if (!who.approved) throw Fail(403, 'Your account is waiting for GrayCo to approve it.');
      for (const x of upsert) {
        if (existing[x.id]) continue;                          /* a question is not changed once asked */
        const jobId = s(x.jobId);
        if (!sc.jobs[jobId]) continue;
        checkRefs(x, null, me);
        const body = s(x.body).slice(0, 4000); if (!body) continue;
        const q = { id: x.id, jobId: jobId, userId: me, userName: p.name, userCompany: p.company, body: body, attachments: arr(x.attachments).slice(0, 5),
          at: new Date().toISOString(), answer: '', visibility: 'private', lang: p.lang === 'es' ? 'es' : 'en' };
        notes.push({ kind: 'new-question', q: q, job: sc.jobs[jobId].data });
        rows.push(rowFor('questions', q));
      }
    } else if (key === 'activity') {
      upsert.filter(function(x){ return !existing[x.id] && sc.jobs[s(x.jobId)]; }).slice(0, 50).forEach(function(x){
        rows.push(rowFor('activity', { id: x.id, jobId: s(x.jobId), userId: me, userName: p.name, userCompany: p.company,
          kind: x.kind === 'download' ? 'download' : 'view', planName: x.planName ? s(x.planName).slice(0, 200) : undefined,
          at: new Date().toISOString() }));
      });
    }
    // jobs, estimates, invites, links: GrayCo only — anything sent is ignored.
  }
  await upsertRows(rows, who.email);
  if (dropKeys.length) await deleteKeys(dropKeys);
  for (const n of notes) { try { await notify(n); } catch (e) { console.warn('[subportal] mail', e.message); } }
  return { saved: rows.length, removed: dropKeys.length };
}
// A subcontractor may only point at files they uploaded themselves (or that were already on the record).
function checkRefs(rec, prev, me){
  const allowed = new Set(prev ? refsIn(prev) : []);
  refsIn(rec).forEach(function(ref){
    if (ref.indexOf('u/' + me + '/') !== 0 && !allowed.has(ref)) throw Fail(403, 'A file on this record does not belong to you.');
  });
}

async function saveKeyed(who, key, value, ctx){
  const parts = key.split(':');
  const head = parts[0];
  if (value != null) { cleanFiles(value); if (JSON.stringify(value).length > MAX_ROW) throw Fail(413, 'That record is too big to save.'); }
  let row = null;
  if (head === 'plans' && parts.length === 2 && okId(parts[1])) {
    if (!who.isAdmin) throw Fail(403, 'GrayCo staff only.');
    row = { collection: 'plans', id: parts[1], job_id: parts[1], data: { items: arr(value) } };
    ctx.afterSave = function(){ return notifyPlanRequests(parts[1]); };   /* plans saved in the bid site: whoever asked hears */
  } else if (head === 'subdocs' && parts.length === 2 && okId(parts[1])) {
    if (!who.isAdmin) { needSub(who, false); if (parts[1] !== who.profile.id) throw Fail(403, 'Not your documents.'); }
    const old = await getRow('subdocs', parts[1]);
    if (!who.isAdmin) checkRefs({ items: arr(value) }, old && old.data, who.profile.id);
    row = { collection: 'subdocs', id: parts[1], user_id: parts[1], data: { items: arr(value) } };
  } else if (head === 'takeoff' && parts.length >= 4 && okId(parts[1]) && okId(parts[2])) {
    if (!who.isAdmin) { needSub(who, true); if (parts[1] !== who.profile.id) throw Fail(403, 'Not your takeoff.'); }
    row = { collection: 'takeoff', id: parts.slice(1).join(':').slice(0, 360), user_id: parts[1], job_id: parts[2], data: { value: value } };
  } else if (head === 'bid-draft' && parts.length === 3 && okId(parts[1]) && okId(parts[2])) {
    if (!who.isAdmin) { needSub(who, true); if (parts[2] !== who.profile.id) throw Fail(403, 'Not your draft.'); }
    row = { collection: 'bid-draft', id: parts[1] + ':' + parts[2], user_id: parts[2], job_id: parts[1], data: { value: value } };
  } else throw Fail(400, 'Unknown record: ' + key);
  if (value == null) await deleteKeys([row.collection + '/' + row.id]);
  else await upsertRows([row], who.email);
  return { saved: 1 };
}

/* ── sign-ups ─────────────────────────────────────────────────────────────── */
async function findInvite(token, jobId){
  if (!/^[a-f0-9]{16,64}$/.test(s(token)) || !okId(s(jobId))) return null;
  const rows = await listRows([eq('collection', 'invites'), eq('job_id', jobId)]);
  const hit = rows.find(function(r){ return r.data && r.data.token && crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String(r.data.token)).digest(), crypto.createHash('sha256').update(String(token)).digest()); });
  return hit || null;
}
function norm(v){ return low(v).replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); }
function sameCompany(a, b){
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 5 && y.length >= 5 && (x.indexOf(y) > -1 || y.indexOf(x) > -1));
}
async function register(body){
  const email = low(body.email), pw = String(body.password || '');
  const p = (body.profile && typeof body.profile === 'object') ? body.profile : {};
  if (!okEmail(email)) throw Fail(400, 'Please enter a valid e-mail address.');
  if (pw.length < 8) throw Fail(400, 'The password must be at least 8 characters.');
  if (!s(p.name) || !s(p.company)) throw Fail(400, 'Please fill all required fields (marked with *).');
  if (await staffByEmail(email)) throw Fail(409, 'That is a GrayCo staff e-mail. Sign in with your CRM password instead.');
  const users = await listRows([eq('collection', 'users')]);
  if (users.some(function(r){ return low(r.email) === email; })) throw Fail(409, 'That e-mail already has a portal account. Sign in, or use "Forgot password".');
  if (!body.force) {
    // Possible duplicates: only the company name and why it matched go back — no contact details.
    const digits = function(v){ return s(v).replace(/\D/g, ''); };
    const dupes = users.filter(function(r){ return r.data.role === 'sub'; }).map(function(r){
      const u = r.data, why = [];
      if (sameCompany(p.company, u.company) || (p.dbaName && sameCompany(p.dbaName, u.company)) || (u.dbaName && sameCompany(p.company, u.dbaName))) why.push('company name');
      if (p.businessAddress && u.businessAddress && norm(p.businessAddress) === norm(u.businessAddress)) why.push('address');
      if (digits(p.phone).length >= 7 && digits(p.phone) === digits(u.phone)) why.push('phone');
      if (p.einLast4 && u.einLast4 && s(p.einLast4) === s(u.einLast4) && why.length) why.push('EIN');
      return why.length ? { company: u.company, dbaName: u.dbaName || '', reasons: why } : null;
    }).filter(Boolean).slice(0, 5);
    if (dupes.length) return { duplicates: dupes };
  }
  const inv = body.invite ? await findInvite(body.invite, body.job) : null;
  const invited = !!(inv && (!inv.data.email || low(inv.data.email) === email));

  const cr = await fetch(sbUrl() + '/auth/v1/admin/users', { method: 'POST', headers: H(),
    body: JSON.stringify({ email: email, password: pw, email_confirm: true, user_metadata: { name: s(p.name).slice(0, 80), portal: 'sub' } }) });
  if (!cr.ok) {
    const t = await cr.text();
    if (/already|registered|exists/i.test(t)) throw Fail(409, 'That e-mail already has a sign-in. Sign in, or use "Forgot password".');
    if (/password/i.test(t)) throw Fail(400, 'That password is too weak. Use at least 8 characters with letters and numbers.');
    throw Fail(502, 'The sign-in could not be created (' + cr.status + '). Call GrayCo ' + OFFICE_PHONE + '.');
  }
  const authUser = await cr.json();
  const clip = function(v, n){ return s(v).slice(0, n || 200); };
  const profile = {
    id: 'u_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
    authUserId: s(authUser.id || (authUser.user && authUser.user.id)),
    username: email, email: email, role: 'sub', approved: invited,
    name: clip(p.name, 80), phone: clip(p.phone, 40), contactTitle: clip(p.contactTitle, 80),
    company: clip(p.company, 120), dbaName: clip(p.dbaName, 120),
    businessAddress: clip(p.businessAddress), businessCity: clip(p.businessCity, 80),
    businessState: clip(p.businessState, 2).toUpperCase(), businessZip: clip(p.businessZip, 10),
    website: clip(p.website), yearsInBusiness: p.yearsInBusiness ? parseInt(p.yearsInBusiness, 10) || null : null,
    numEmployees: p.numEmployees ? parseInt(p.numEmployees, 10) || null : null,
    unionAffiliation: clip(p.unionAffiliation, 20), serviceArea: clip(p.serviceArea), licenseNumbers: clip(p.licenseNumbers, 400),
    einLast4: s(p.einLast4).replace(/\D/g, '').slice(0, 4),
    trades: (Array.isArray(p.trades) ? p.trades : []).map(function(x){ return clip(x, 60); }).filter(Boolean).slice(0, 30),
    invitedJobId: invited ? inv.job_id : undefined,
    createdAt: new Date().toISOString()
  };
  try { await upsertRows([rowFor('users', profile)], email); }
  catch (e) { if (profile.authUserId) await deleteAuthUser(profile.authUserId); throw e; }
  if (invited) await upsertRows([rowFor('invites', Object.assign({}, inv.data, { usedAt: new Date().toISOString(), usedBy: profile.id }))], email);
  try { await notify({ kind: 'registered', user: profile }); } catch (e) { console.warn('[subportal] mail', e.message); }
  return { ok: true, approved: invited };
}
async function deleteAuthUser(id){
  try { await fetch(sbUrl() + '/auth/v1/admin/users/' + encodeURIComponent(id), { method: 'DELETE', headers: H() }); } catch (e) {}
}

/* ── e-mail ───────────────────────────────────────────────────────────────── */
function portalLink(){ return PORTAL_ORIGIN + '/'; }
function mailHtml(title, lines, button){
  return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F172A">' +
    '<div style="background:#0F1D2F;color:#fff;padding:16px 20px;font-weight:700;font-size:16px;text-align:center"><img src="' + esc(CUSTOMER_PORTAL_ORIGIN + '/portal-logo.png') + '" alt="GrayCo Construction Services" width="160" style="display:block;margin:0 auto 6px">GrayCo Bids</div>' +
    '<div style="padding:20px;border:1px solid #EDE9E0;border-top:0"><h2 style="margin:0 0 12px;font-size:18px">' + esc(title) + '</h2>' +
    lines.map(function(l){ return '<p style="margin:0 0 10px;line-height:1.5">' + l + '</p>'; }).join('') +
    (button ? '<p style="margin:18px 0 0"><a href="' + esc(button.href) + '" style="background:#D4A017;color:#140665;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:700">' + esc(button.label) + '</a></p>' : '') +
    '<p style="margin:18px 0 0;font-size:12px;color:#64748B">GrayCo Construction Services, LLC · ' + require('./_lib/brand.js').companyAddress() + ' · ' + OFFICE_PHONE + '</p></div></div>';
}
async function sendMail(to, subject, html){
  const key = s(process.env.RESEND_API_KEY);
  to = (Array.isArray(to) ? to : [to]).map(low).filter(okEmail);
  to = Array.from(new Set(to));
  if (!key || mailOff() || !to.length) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'GrayCo Bids <portal@grayco-cs.com>', reply_to: (String(process.env.REPLY_TO_ADMIN || '').trim() || 'replies@grayco-cs.com'), to: to, subject: require('./_lib/mailtag.js').tag(subject, to, 'subs bids'), html: html }) });
  return r.ok;
}
async function staffEmailsFor(job){
  const out = [process.env.SUBPORTAL_NOTIFY || OFFICE];
  if (job) {
    const ids = [job.pmId, job.estimatorId].filter(Boolean);
    if (ids.length) {
      (await listRows([eq('collection', 'users'), inList('id', ids)])).forEach(function(r){ if (r.data.role === 'admin') out.push(r.email); });
    }
  }
  return out;
}
/* ── PLANS: ZIP / PDF upload, "Request plans", "Plans are ready" (owner request, 21 Oct 2026) ──────────────
   • An admin uploads a ZIP or a PDF (CRM Subs tab → Plans requested, or the bid job here). A ZIP is unpacked
     HERE, on the server: one file per drawing, the folder names kept as the category, PDF / image / DWG only,
     size limits below. Every file goes to the subportal-files bucket and onto the job's plans list (the same
     plans/<jobId> row the bid site and the Lead Inbox (patch LD2, _lib/bid-portal.js) use).
   • A sub on a job with no plans taps "Request plans — I'm interested in bidding": recorded (who, when, note,
     trade) in planreqs/<jobId>__<userId>; Wesley, Nick and the job's estimator (the Senior Estimator — the Estimator role — when none
     is set) get an e-mail, a phone push when push is set up, and one CRM to-do per job.
   • As soon as the job has plans (uploaded here, saved in the bid site, or copied by the Lead Inbox), every
     sub who asked gets "Plans are ready for <job>" once, in their language. It is a transactional notice
     (no approval step).
   • Subs see plans only of jobs they may see (approved, and the job public or they are invited; never a draft). */
const zlib = require('zlib');
const PLAN_EXT = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', dwg: 'application/acad', dxf: 'image/vnd.dxf' };
const ZIP_LIMITS = { files: 300, total: 250 * 1024 * 1024, each: MAX_FILE };
function extOf(n){ const m = /\.([A-Za-z0-9]{2,5})$/.exec(s(n)); return m ? m[1].toLowerCase() : ''; }
/* a small ZIP reader (stored + deflate; no encryption, no ZIP64) — every size is checked before anything is unpacked */
function unzip(buf){
  const out = [], skipped = [];
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw Fail(400, 'That is not a ZIP file (or it is damaged).');
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16), total = 0;
  if (n > 2000) throw Fail(413, 'That ZIP has too many files.');
  for (let k = 0; k < n; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw Fail(400, 'That ZIP file is damaged.');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString(flags & 0x800 ? 'utf8' : 'latin1').replace(/\\/g, '/');
    p += 46 + nl + xl + cl;
    const base = name.split('/').pop();
    if (!base || name.endsWith('/')) continue;                                         /* a folder */
    if (/(^|\/)(__MACOSX|\.)/.test(name) || /^\./.test(base) || /^thumbs\.db$/i.test(base)) continue;   /* Mac / Windows extras */
    const ext = extOf(base);
    if (!PLAN_EXT[ext]) { skipped.push({ name: name, why: 'not a PDF, picture or DWG' }); continue; }
    if (flags & 1) { skipped.push({ name: name, why: 'password-protected' }); continue; }
    if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF) { skipped.push({ name: name, why: 'too big' }); continue; }
    if (usize > ZIP_LIMITS.each) { skipped.push({ name: name, why: 'over 50 MB' }); continue; }
    if (out.length >= ZIP_LIMITS.files) { skipped.push({ name: name, why: 'more than ' + ZIP_LIMITS.files + ' files in one ZIP' }); continue; }
    if (total + usize > ZIP_LIMITS.total) { skipped.push({ name: name, why: 'the ZIP is over 250 MB unpacked' }); continue; }
    if (off + 30 > buf.length || buf.readUInt32LE(off) !== 0x04034b50) { skipped.push({ name: name, why: 'damaged' }); continue; }
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.slice(start, start + csize);
    let data;
    try { data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, usize) }) : null; } catch (e) { data = null; }
    if (!data || data.length !== usize) { skipped.push({ name: name, why: 'could not be unpacked' }); continue; }
    total += usize;
    const dirs = name.split('/').slice(0, -1).filter(Boolean);
    out.push({ name: base, folder: dirs.join(' / '), ext: ext, data: data });
  }
  return { files: out, skipped: skipped };
}
async function storageGet(path){
  const r = await fetch(sbUrl() + '/storage/v1/object/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), { headers: H() });
  if (!r.ok) throw Fail(404, 'The uploaded file was not found — upload it again.');
  return Buffer.from(await r.arrayBuffer());
}
async function storagePut(path, buf, type){
  const r = await fetch(sbUrl() + '/storage/v1/object/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), {
    method: 'POST', headers: H({ 'Content-Type': type || 'application/octet-stream', 'x-upsert': 'true' }), body: buf });
  if (!r.ok && r.status !== 409) throw Fail(502, 'Could not store ' + path.split('/').pop() + ' (' + r.status + ').');
}
async function plansOf(jobId){ const r = await getRow('plans', jobId); return r ? arr(r.data.items) : []; }
async function plansImport(who, body){
  const jobId = s(body.jobId), ref = s(body.fileRef);
  if (!okId(jobId)) throw Fail(400, 'Pick a bid job first.');
  const job = await getRow('jobs', jobId); if (!job) throw Fail(404, 'That bid job is not in the bid site.');
  if (!/^staff\/[A-Za-z0-9._\/-]{3,300}$/.test(ref) || ref.indexOf('..') > -1) throw Fail(400, 'Upload the file first.');
  const name = s(body.name) || ref.split('/').pop(), ext = extOf(name);
  const have = await plansOf(jobId), known = {}; have.forEach(function(x){ if (x && x.sha) known[x.sha] = 1; });
  const added = [], skipped = [];
  if (ext === 'zip') {
    const z = unzip(await storageGet(ref));
    skipped.push.apply(skipped, z.skipped);
    for (const f of z.files) {
      const sha = crypto.createHash('sha256').update(f.data).digest('hex');
      if (known[sha]) { skipped.push({ name: (f.folder ? f.folder + '/' : '') + f.name, why: 'already on the job' }); continue; }
      const path = 'staff/plans/' + jobId + '/' + sha.slice(0, 16) + '-' + safeName(f.name);
      await storagePut(path, f.data, PLAN_EXT[f.ext]);
      known[sha] = 1;
      added.push({ name: f.name, size: f.data.length, type: PLAN_EXT[f.ext], fileRef: path, category: f.folder || 'Plans', sha: sha, from: name, at: new Date().toISOString(), by: who.email });
    }
  } else if (PLAN_EXT[ext]) {
    added.push({ name: name, size: Number(body.size) || 0, type: PLAN_EXT[ext], fileRef: ref, category: s(body.category).slice(0, 80) || 'Plans', at: new Date().toISOString(), by: who.email });
  } else throw Fail(400, 'Upload a ZIP, a PDF, a picture or a DWG.');
  if (added.length) {
    /* the same name twice (A1.pdf in two folders): the folder goes in front, so each one is its own download */
    const names = {}; have.forEach(function(x){ names[low(x.name)] = 1; });
    added.forEach(function(x){ if (names[low(x.name)] && x.category && x.category !== 'Plans') x.name = x.category.split(' / ').pop() + ' — ' + x.name; names[low(x.name)] = 1; });
    await upsertRows([{ collection: 'plans', id: jobId, job_id: jobId, data: { items: have.concat(added) } }], who.email);
    /* the job record lists the plans too (name / size / type / category — what the bid site shows) */
    const jd = Object.assign({}, job.data);
    jd.plans = arr(jd.plans).concat(added.map(function(x){ return { name: x.name, size: x.size, type: x.type, category: x.category }; }));
    jd.updatedAt = new Date().toISOString();
    await upsertRows([{ collection: 'jobs', id: jobId, job_id: jobId, data: jd }], who.email);
  }
  const told = added.length ? await notifyPlanRequests(jobId) : 0;
  return { ok: true, added: added.map(function(x){ return { name: x.name, category: x.category, size: x.size, type: x.type }; }), skipped: skipped, total: have.length + added.length, notified: told };
}
async function estimatorEmail(job){
  const id = s(job && job.estimatorId);
  if (id) {
    const st = await staffList(); const hit = st.find(function(x){ return staffId(x.email) === id; }); if (hit) return hit.email;
    const r = await getRow('users', id); if (r && r.email) return low(r.email);
  }
  return defaultEstimatorEmail();   /* patch EST4: the Senior Estimator (the Estimator role / Leads ⚙), never a name */
}
async function defaultEstimatorEmail(){
  let settings = null;
  for (const table of ['gc_lead_inbox_kv', 'gc_kv']) {
    try { const r = await fetch(sbUrl() + '/rest/v1/' + table + '?select=value&key=eq.gc_lead_inbox_settings', { headers: H() }); if (r.ok) { const v = ((await r.json())[0] || {}).value; if (v) { settings = typeof v === 'string' ? JSON.parse(v) : v; break; } } } catch (e) {}
  }
  const sbf = function(path){ return fetch(sbUrl() + '/rest/v1/' + path, { headers: H() }); };
  const r = await require('./_lib/estimator.js').resolve({ sb: sbf, settings: settings || {} });
  return r.email || ownerEmails()[0] || '';
}
function ownerEmails(){ return String(process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(okEmail); }
function loadWebPush(){ try { return require('web-push'); } catch (e) { return null; } }
async function pushTo(emails, title, text){
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY, wp = pub && priv ? loadWebPush() : null;
  if (!wp) return 0;
  try { wp.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:office@grayco-cs.com', pub, priv); } catch (e) { return 0; }
  let sent = 0;
  for (const email of emails) {
    let subs = [];
    try { const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent('gc_push_subs__' + email), { headers: H() }); const rows = r.ok ? await r.json() : []; let v = rows && rows[0] ? rows[0].value : []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } subs = arr(v).filter(function(x){ return x && x.endpoint && x.keys; }); } catch (e) {}
    for (const sb of subs) { try { await wp.sendNotification({ endpoint: sb.endpoint, keys: sb.keys }, JSON.stringify({ title: title, body: text, link: '/#subs', tag: 'plans-request' }), { TTL: 86400 }); sent++; } catch (e) {} }
  }
  return sent;
}
/* the CRM's office to-do list (gc_kv gc_office_tasks, JSON text) — added once per job, the same careful way portal.js does */
async function officeTodo(id, label, note){
  for (let tries = 0; tries < 5; tries++) {
    const read = async function(){ const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value,updated_at&key=eq.gc_office_tasks', { headers: H() }); if (!r.ok) return null; const rows = await r.json().catch(function(){ return null; }); if (!Array.isArray(rows)) return null; let v = rows[0] ? rows[0].value : ''; if (v == null || v === '') v = []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } } return Array.isArray(v) ? { list: v, at: s(rows[0] && rows[0].updated_at) } : null; };
    const cur = await read(); if (!cur) return false;
    if (cur.list.some(function(t){ return t && s(t.id) === id; })) return true;
    const now = new Date().toISOString();
    const next = cur.list.concat([{ id: id, label: label, note: note, addedBy: 'Bid site', addedAt: now, updatedAt: now, done: false }]);
    const again = await read(); if (!again || again.at !== cur.at) { await new Promise(function(r){ setTimeout(r, 150 + 200 * tries); }); continue; }
    const w = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: 'gc_office_tasks', value: JSON.stringify(next), updated_at: now }) });
    if (!w.ok) return false;
    const after = await read(); if (after && after.list.some(function(t){ return t && s(t.id) === id; })) return true;
  }
  return false;
}
async function requestPlans(who, body, ctx){
  needSub(who, true);
  const jobId = s(body.jobId); if (!okId(jobId)) throw Fail(400, 'Pick a job.');
  const sc = ctx.scope || (ctx.scope = await subScope(who));
  if (!sc.jobs[jobId]) throw Fail(404, 'That job is not open to you.');
  const job = sc.jobs[jobId].data, p = who.profile, id = jobId + '__' + p.id;
  const old = await getRow('planreqs', id);
  if (old) return { ok: true, already: true, request: old.data };
  const rec = { id: id, jobId: jobId, userId: p.id, email: low(p.email || who.email), name: s(p.name), company: s(p.company), trade: s(body.trade).slice(0, 80) || arr(p.trades).join(', ').slice(0, 80),
    note: s(body.note).slice(0, 600), lang: p.lang === 'es' ? 'es' : 'en', at: new Date().toISOString(), notifiedAt: '' };
  await upsertRows([{ collection: 'planreqs', id: id, job_id: jobId, user_id: p.id, email: rec.email, data: rec }], who.email);
  const all = await listRows([eq('collection', 'planreqs'), eq('job_id', jobId)]);
  const to = Array.from(new Set(ownerEmails().concat([await estimatorEmail(job)])));
  const title = 'Plans requested — ' + s(job.title);
  await sendMail(to, title + ' — ' + rec.company, mailHtml(title, ['<b>' + esc(rec.company) + '</b> (' + esc(rec.name) + (rec.trade ? ', ' + esc(rec.trade) : '') + ') is interested in bidding and asked for the plans.',
    rec.note ? '“' + esc(rec.note) + '”' : '', all.length + ' sub' + (all.length === 1 ? ' has' : 's have') + ' asked so far. Upload the plans (ZIP or PDF) in the CRM — Subs tab → Plans requested — or on the job in the bid site. Everyone who asked gets an e-mail as soon as they are there.'].filter(Boolean),
    { href: portalLink(), label: 'Open the bid site' })).catch(function(){});
  try { await pushTo(to, title, rec.company + ' asked for the plans (' + all.length + ' so far)'); } catch (e) {}
  await officeTodo('planreq_' + jobId, 'Upload plans for ' + s(job.title).slice(0, 80) + ' (bid site)', 'Subs asked for the plans. CRM → Subs tab → Plans requested → Upload plans (ZIP/PDF).');
  return { ok: true, request: rec, count: all.length };
}
/* every sub who asked hears once, when the job has plans */
async function notifyPlanRequests(jobId){
  const reqs = (await listRows([eq('collection', 'planreqs'), eq('job_id', jobId)])).filter(function(r){ return !s(r.data.notifiedAt); });
  if (!reqs.length) return 0;
  if (!(await plansOf(jobId)).length) return 0;
  const job = await getRow('jobs', jobId); const title = job ? s(job.data.title) : 'a GrayCo job';
  let n = 0;
  for (const r of reqs) {
    const q = r.data, es = q.lang === 'es', link = PORTAL_ORIGIN + '/';
    const ok = await sendMail(q.email, (es ? 'Los planos están listos — ' : 'Plans are ready for ') + title,
      mailHtml(es ? 'Los planos están listos' : 'Plans are ready',
        es ? ['Hola ' + esc(q.name || '') + ',', 'Los planos de <b>' + esc(title) + '</b> ya están en el sitio de licitaciones de GrayCo.', 'Entre en ' + esc(link.replace(/^https:\/\//, '').replace(/\/$/, '')) + ' para verlos y enviar su oferta (o envíe su oferta por correo a bids@grayco-cs.com).']
           : ['Hi ' + esc(q.name || '') + ',', 'The plans for <b>' + esc(title) + '</b> are now on the GrayCo bid site.', 'Sign in at ' + esc(link.replace(/^https:\/\//, '').replace(/\/$/, '')) + ' to see them and send your bid (or e-mail your bid to bids@grayco-cs.com).'],
        { href: link, label: es ? 'Ver los planos' : 'See the plans' })).catch(function(){ return false; });
    if (ok) { await upsertRows([{ collection: 'planreqs', id: r.id, job_id: jobId, user_id: r.user_id, email: r.email, data: Object.assign({}, q, { notifiedAt: new Date().toISOString() }) }], 'plans-ready'); n++; }
  }
  return n;
}
/* plans that arrived some other way (the Lead Inbox, the bid site's own Save): a quick look on every load */
async function sweepPlanRequests(){
  try {
    const open = (await listRows([eq('collection', 'planreqs')])).filter(function(r){ return !s(r.data.notifiedAt); });
    const jobs = Array.from(new Set(open.map(function(r){ return r.job_id; })));
    for (const j of jobs.slice(0, 20)) await notifyPlanRequests(j);
  } catch (e) { console.warn('[subportal] plans sweep', e.message); }
}

async function notify(n){
  if (n.kind === 'registered') {
    const u = n.user;
    return sendMail([process.env.SUBPORTAL_NOTIFY || OFFICE].concat(String(process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',')), 'New subcontractor sign-up — ' + u.company,
      mailHtml('New subcontractor sign-up', [
        '<b>' + esc(u.company) + '</b>' + (u.dbaName ? ' (DBA ' + esc(u.dbaName) + ')' : ''),
        esc(u.name) + ' · ' + esc(u.email) + (u.phone ? ' · ' + esc(u.phone) : ''),
        u.trades && u.trades.length ? 'Trades: ' + esc(u.trades.join(', ')) : '',
        u.approved ? 'They came from a job invite, so they are already approved.' : 'They are waiting for approval: open the portal → <b>Pending Subs</b>.'
      ].filter(Boolean), { href: portalLink(), label: 'Open the portal' }));
  }
  if (n.kind === 'approved') {
    /* 33.151: in the sub's language; the address is the bid site */
    if (n.user.lang === 'es') return sendMail(n.user.email, 'Ya puede entrar en bids.grayco-cs.com',
      mailHtml('Bienvenido, ' + s(n.user.name).split(' ')[0], [
        'GrayCo Construction Services aprobó a <b>' + esc(n.user.company) + '</b> para el sitio de licitaciones de GrayCo.',
        'Entre en bids.grayco-cs.com con su correo y su contraseña para ver los trabajos abiertos, los planos y licitar.'
      ], { href: portalLink(), label: 'Abrir bids.grayco-cs.com' }));
    return sendMail(n.user.email, 'You can now sign in at bids.grayco-cs.com',
      mailHtml('Welcome, ' + s(n.user.name).split(' ')[0], [
        'GrayCo Construction Services approved <b>' + esc(n.user.company) + '</b> for the GrayCo bid site.',
        'Sign in at bids.grayco-cs.com with your e-mail and password to see open jobs and plans, and to bid.'
      ], { href: portalLink(), label: 'Open bids.grayco-cs.com' }));
  }
  if (n.kind === 'new-bid' && n.job) {
    const b = n.bid;
    return sendMail(await staffEmailsFor(n.job), 'New bid — ' + s(n.job.title) + ' — ' + b.userCompany,
      mailHtml('New bid on ' + s(n.job.title), [
        '<b>' + esc(b.userCompany) + '</b> (' + esc(b.userName) + ') bid <b>$' + num(b.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</b>.',
        b.scope ? 'Scope: ' + esc(b.scope.slice(0, 600)) : ''
      ].filter(Boolean), { href: portalLink(), label: 'Review the bid' }));
  }
  if (n.kind === 'message-from-sub' && n.job) {
    const m = n.msg;
    return sendMail(await staffEmailsFor(n.job), 'Message from ' + m.senderCompany + ' — ' + s(n.job.title),
      mailHtml('New message on ' + s(n.job.title), ['<b>' + esc(m.senderCompany) + '</b> (' + esc(m.senderName) + ') wrote:', esc(m.body.slice(0, 1500)).replace(/\n/g, '<br>')],
        { href: portalLink(), label: 'Reply in the portal' }));
  }
  if (n.kind === 'new-question' && n.job) {
    const q = n.q;
    return sendMail((await staffEmailsFor(n.job)).concat(String(process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',')),
      'Bid question — ' + s(n.job.title) + ' — ' + q.userCompany,
      mailHtml('New question on ' + s(n.job.title), ['<b>' + esc(q.userCompany) + '</b> (' + esc(q.userName) + ') asked:', esc(q.body.slice(0, 1500)).replace(/\n/g, '<br>'),
        'Answer it in the CRM (Subs tab → Bid questions, or the field view) or in the bid site: privately, or to all bidders.'], { href: portalLink(), label: 'Answer the question' }));
  }
  if (n.kind === 'answer-to-bidders') {
    const q = n.q;
    const job = await getRow('jobs', q.jobId); const title = job ? s(job.data.title) : 'a GrayCo job';
    const emails = new Set();
    (await listRows([eq('collection', 'invites'), eq('job_id', q.jobId)])).forEach(function(r){ if (okEmail(low(r.email))) emails.add(low(r.email)); });
    (await listRows([eq('collection', 'bids'), eq('job_id', q.jobId)])).forEach(function(r){ const e = low(r.data.userEmail); if (okEmail(e)) emails.add(e); });
    const users = await listRows([eq('collection', 'users')]);
    let n2 = 0;
    for (const e of emails) {
      const u = users.find(function(r){ return low(r.email) === e; }); const es = u && u.data.lang === 'es';
      const ok = await sendMail(e, (es ? 'Aclaración de licitación Q' : 'Bid clarification Q') + (q.num || '') + ' — ' + title,
        mailHtml((es ? 'Pregunta y respuesta Q' : 'Question and answer Q') + (q.num || '') + ' — ' + title, [
          '<b>' + (es ? 'Pregunta' : 'Question') + ':</b> ' + esc(s(q.body).slice(0, 1500)).replace(/\n/g, '<br>'),
          '<b>' + (es ? 'Respuesta de GrayCo' : "GrayCo's answer") + ':</b> ' + esc(s(q.answer).slice(0, 3000)).replace(/\n/g, '<br>'),
          es ? 'Esta aclaración es para todos los licitantes de este trabajo.' : 'This clarification goes to every bidder on this job.'
        ], { href: portalLink(), label: es ? 'Ver el trabajo' : 'See the job' }));
      if (ok) n2++;
    }
    return n2;
  }
  if (n.kind === 'message-to-sub') {
    const sub = await getRow('users', s(n.msg.recipientSubId));
    if (!sub || sub.data.role !== 'sub') return false;
    return sendMail(sub.email, 'New message from GrayCo', mailHtml('You have a new message from GrayCo',
      [esc(s(n.msg.senderName)) + ' wrote:', esc(s(n.msg.body).slice(0, 1500)).replace(/\n/g, '<br>')], { href: portalLink(), label: 'Read and reply' }));
  }
  return false;
}

/* ── reading plans with Claude (GrayCo staff only) ───────────────────────── */
async function aiPlans(fileRef){
  const key = s(process.env.ANTHROPIC_API_KEY);
  if (!key) throw Fail(503, 'Plan reading is not set up (ANTHROPIC_API_KEY on Netlify).');
  if (!/^(staff|u)\/[A-Za-z0-9._\/-]+$/.test(s(fileRef))) throw Fail(400, 'Upload the plan first.');
  const f = await fetch(sbUrl() + '/storage/v1/object/' + BUCKET + '/' + fileRef.split('/').map(encodeURIComponent).join('/'), { headers: H() });
  if (!f.ok) throw Fail(404, 'The plan file was not found.');
  const buf = Buffer.from(await f.arrayBuffer());
  if (buf.length > 30 * 1024 * 1024) throw Fail(413, 'That PDF is too large to read automatically (30 MB at most).');
  const prompt = 'You are reading construction plans for a subcontractor bid portal. Return ONLY a JSON object (no markdown, no code fences) with these keys:\n' +
    '- "title": a short project name (e.g. "Tractor Supply - Jackson TN")\n' +
    '- "address": the full project address as written on the plans\n' +
    '- "scope": a bulleted summary of the major work scopes shown (drywall, framing, paint, flooring, ACT, insulation, specialty items — whatever is visible). Use \\n for line breaks.\n' +
    '- "specifications": key technical specifications (wall types, ceiling heights, finishes, materials, GWB types, insulation R-values …)\n' +
    '- "notes": special conditions, deadlines, addenda, RFI references, or anything a subcontractor should know when bidding.\n' +
    'Use an empty string for anything the plans do not show. Do not make anything up.';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.SUBPORTAL_AI_MODEL || 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low' },
      fallbacks: 'default',
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
        { type: 'text', text: prompt }
      ] }]
    })
  });
  const j = await r.json().catch(function(){ return {}; });
  if (!r.ok) throw Fail(502, 'Plan reading failed: ' + s(j.error && j.error.message).slice(0, 200));
  if (j.stop_reason === 'refusal') throw Fail(422, 'The plans could not be read automatically. Fill the fields in by hand.');
  const text = arr(j.content).filter(function(c){ return c.type === 'text'; }).map(function(c){ return c.text; }).join('\n');
  const m = text.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
  let parsed = null; try { parsed = m ? JSON.parse(m[0]) : null; } catch (e) {}
  if (!parsed) throw Fail(422, 'The plans could not be read automatically. Fill the fields in by hand.');
  const out = {};
  ['title', 'address', 'scope', 'specifications', 'notes'].forEach(function(k){ out[k] = s(parsed[k]).slice(0, 8000); });
  return out;
}

/* ── the CRM's records (gc_kv), read with the service key ──────────────────── */
/* A big list may be stored in pieces (<key>__manifest + <key>__chunkN); the newer of the single
   row and the pieces wins, exactly as the CRM itself reads it (same as portal.js). Cached 30 s. */
const CRM_KEYS = ['vendors', 'subs', 'projects', 'invs', 'invoices', 'scopes', 'users',
                  'gc_tombstones', 'gc_deleted_subs', 'gc_deleted_vendors', 'gc_deleted_projects', 'gc_deleted_invs'];
let kvCache = null;
async function kvRead(keys){
  const want = [];
  keys.forEach(function(k){ want.push(k, k + '__manifest'); });
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value,updated_at&key=in.(' + want.map(function(k){ return '"' + k + '"'; }).join(',') + ')', { headers: H() });
  if (!r.ok) throw Fail(502, 'The CRM records could not be read (' + r.status + ').');
  const rows = await r.json();
  const byKey = {};
  (Array.isArray(rows) ? rows : []).forEach(function(x){ if (x && x.key) byKey[x.key] = x; });
  const out = {};
  for (const k of keys) {
    let val = byKey[k] ? byKey[k].value : null;
    const man = byKey[k + '__manifest'];
    let mv = man && man.value; if (typeof mv === 'string') { try { mv = JSON.parse(mv); } catch (e) { mv = null; } }
    if (mv && mv.chunked && mv.count > 0 && (!byKey[k] || s(man.updated_at) >= s(byKey[k].updated_at))) {
      try {
        const names = []; for (let i = 0; i < Math.min(mv.count, 60); i++) names.push('"' + k + '__chunk' + i + '"');
        const rr = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value&key=in.(' + names.join(',') + ')', { headers: H() });
        if (rr.ok) {
          const parts = await rr.json(); const by = {};
          (Array.isArray(parts) ? parts : []).forEach(function(x){ by[x.key] = x.value; });
          let all = [];
          for (let i = 0; i < mv.count; i++) all = all.concat(arr(by[k + '__chunk' + i]));
          if (all.length) val = all;
        }
      } catch (e) {}
    }
    out[k] = (typeof val === 'string') ? (function(){ try { return JSON.parse(val); } catch (e) { return val; } })() : val;
  }
  return out;
}
async function crmData(){
  if (kvCache && Date.now() - kvCache.at < 30e3) return kvCache.data;
  const data = await kvRead(CRM_KEYS);
  kvCache = { at: Date.now(), data: data };
  return data;
}
// Deleted in the CRM: the tombstone map ("<list>:<id>") or the older gc_deleted_<list> lists.
function deletedTest(data){
  const tomb = (data.gc_tombstones && typeof data.gc_tombstones === 'object' && !Array.isArray(data.gc_tombstones)) ? data.gc_tombstones : {};
  const lists = {};
  ['subs', 'vendors', 'projects', 'invs'].forEach(function(k){
    lists[k] = new Set((Array.isArray(data['gc_deleted_' + k]) ? data['gc_deleted_' + k] : []).map(String));
  });
  return function(list, id){ id = s(id); return !!id && (!!tomb[list + ':' + id] || (lists[list] && lists[list].has(id))); };
}
// The CRM keeps subs and vendors in one list (keys "vendors" and "subs"); a sub is isSub:true,
// or a row from "subs" with no isSub at all.
function crmSubList(data){
  const gone = deletedTest(data);
  const seen = {}, out = [];
  function add(r, fromSubs){
    if (!r || typeof r !== 'object') return;
    const isSub = r.isSub === true || (fromSubs && r.isSub === undefined);
    if (!isSub) return;
    const id = s(r.id);
    if (id && (gone('subs', id) || gone('vendors', id))) return;
    const k = id ? 'id:' + id : 'nm:' + norm(r.name || r.company);
    if (seen[k]) return;
    seen[k] = 1;
    out.push(r);
  }
  arr(data.vendors).forEach(function(r){ add(r, false); });
  arr(data.subs).forEach(function(r){ add(r, true); });
  return out;
}
async function crmSubs(){
  const data = await crmData();
  /* patch AUTO7: each sub's scorecard (0–100 + a letter) — the best first when picking who gets the bid package */
  let more = {}; try { more = await kvRead(['schedule', 'punch', 'gc_warranty_tickets', 'gc_sub_ratings']); } catch (e) {}
  const FA = require('./_lib/fa-core.js');
  return crmSubList(data).filter(function(r){ return s(r.id); }).map(function(r){
    let sc = null; try { sc = FA.subScore(r, { schedule: more.schedule, punch: more.punch, tickets: more.gc_warranty_tickets, ratings: more.gc_sub_ratings }); } catch (e) {}
    return { id: s(r.id), name: s(r.name || r.company), company: s(r.company), email: low(r.email), phone: s(r.phone), trade: s(r.trade || r.cat), score: sc ? sc.score : null, grade: sc ? sc.letter : '', flag: /^(preferred|dnu)$/.test(low(r.subFlag)) ? low(r.subFlag) : '' };
  }).sort(function(a, b){ const fw = function(x){ return x.flag === 'preferred' ? 1 : x.flag === 'dnu' ? -1 : 0; };   /* patch DEPTH1: ⭐ Preferred first, ⛔ Do not use last */
    return fw(b) - fw(a) || (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) || a.name.localeCompare(b.name); });
}
function ymd(v){
  if (!v) return '';
  const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function money(n){ return Math.round(num(n) * 100) / 100; }
function daysUntil(d){ const t = ymd(d); if (!t) return null; return Math.ceil((new Date(t + 'T12:00:00Z') - Date.now()) / 864e5); }

// Everything a subcontractor may see of their own work with GrayCo, from the CRM.
// Only once GrayCo has linked the portal account to the CRM record (Approved Subs → "CRM record"):
// sign-up e-mails are not verified, so a matching name or e-mail alone never opens anyone's pay.
async function myWork(profile){
  const data = await crmData();
  const subs = crmSubList(data);
  const crm = profile.crmSubId ? (subs.find(function(r){ return s(r.id) === s(profile.crmSubId); }) || null) : null;
  const how = 'linked';
  if (!crm) return { linked: false };

  const gone = deletedTest(data);
  const names = new Set([norm(crm.name), norm(crm.company)].filter(Boolean));
  const isMine = function(name, subId){ return (subId && s(subId) === s(crm.id)) || (name && names.has(norm(name))); };
  const projects = arr(data.projects).filter(function(p){ return !gone('projects', p.id); });
  const projById = {}; projects.forEach(function(p){ projById[s(p.id)] = p; });
  const crmUsers = arr(data.users);
  const pmOf = function(p){
    const n = s(p.pm || p.projectManager);
    const u = crmUsers.find(function(x){ return n && low(x.name) === low(n); }) || {};
    return { name: n, phone: s(u.phone || u.cell || u.mobile), email: low(u.email) };
  };

  // Jobs: the CRM job's subcontractor list (project.subs[]), plus scopes of work sent to this sub.
  const jobs = [];
  projects.forEach(function(p){
    arr(p.subs).filter(function(x){ return isMine(x.name, x.vendorId || x.subId); }).forEach(function(x){
      jobs.push({ id: s(p.id) + ':' + s(x.id), job: s(p.name), address: s(p.address || p.jobAddress), po: s(p.autoPO || p.po),
        trade: s(x.trade), status: s(x.status) || 'Bidding', scope: s(x.scope).slice(0, 4000), amount: money(x.bidAmt),
        start: ymd(x.startDate), end: ymd(x.endDate), pm: pmOf(p), jobStatus: s(p.status || p.stage) });
    });
  });
  const scopes = arr(data.scopes).filter(function(sc){ return s(sc.subId) && s(sc.subId) === s(crm.id); }).map(function(sc){
    const p = projById[s(sc.pid)] || {};
    return { id: s(sc.id), job: s(sc.projectName || p.name), status: s(sc.status), sent: ymd(sc.sentDate), body: s(sc.body).slice(0, 6000) };
  });
  const agreements = [];
  projects.forEach(function(p){
    arr(p.subAgreements).filter(function(a){ return isMine(a.sub); }).forEach(function(a){
      agreements.push({ id: s(a.id), job: s(p.name), amount: money(a.amount), scope: s(a.scope).slice(0, 3000),
        terms: s(a.terms).slice(0, 2000), date: ymd(a.createdAt) });
    });
  });

  // Pay: the sub invoices / bills GrayCo has on file for this sub.
  const seenInv = {};
  const invoices = arr(data.invs).concat(arr(data.invoices)).filter(function(iv){
    if (s(iv.type) !== 'sub' || gone('invs', iv.id)) return false;
    if (seenInv[s(iv.id)]) return false; seenInv[s(iv.id)] = 1;
    return isMine(iv.sub || iv.vendor || iv.company, iv.subId);
  }).map(function(iv){
    const st = low(iv.status) || 'received';
    const paid = st === 'paid' || iv.paid === true;
    const p = projById[s(iv.pid)] || {};
    let state, label;
    if (paid) { state = 'paid'; label = 'Paid'; }
    else if (['rejected', 'denied'].indexOf(st) > -1) { state = 'declined'; label = 'Not approved — call the office'; }
    else if (st === 'void') { state = 'void'; label = 'Voided'; }
    else if (st === 'approved' || st === 'ready' || iv.approved === true) { state = 'approved'; label = 'Approved — scheduled to pay'; }
    else { state = 'received'; label = 'Received — waiting for approval'; }
    return { id: s(iv.id), number: s(iv.invNum), job: s(p.name), po: s(iv.po || p.autoPO), desc: s(iv.desc).slice(0, 300),
      amount: money(iv.amt), received: ymd(iv.recvDate || iv.date), approved: ymd(iv.approvedDate || iv.approvedAt),
      payDate: paid ? '' : ymd(iv.payDateOverride || iv.payDate), paidDate: paid ? ymd(iv.paidDate || iv.date) : '',
      checkNo: paid ? s(iv.checkNo) : '', state: state, label: label };
  }).filter(function(iv){ return iv.state !== 'void'; })
    .sort(function(a, b){ return (b.paidDate || b.received).localeCompare(a.paidDate || a.received); });

  const yr = new Date().getFullYear();
  const sum = function(f){ return money(invoices.filter(f).reduce(function(t, x){ return t + x.amount; }, 0)); };
  const byYear = {};
  invoices.filter(function(x){ return x.state === 'paid' && x.paidDate; }).forEach(function(x){
    const y = x.paidDate.slice(0, 4); byYear[y] = money((byYear[y] || 0) + x.amount);
  });

  const ins = daysUntil(crm.insExp || crm.insuranceExp || crm.coiExpiration);
  const wc = daysUntil(crm.wcExp);
  const hasW9 = crm.w9 === true || !!s(crm.taxId || crm.ein);
  const taxId = s(crm.taxId || crm.ein).replace(/\D/g, '');
  return {
    linked: true, how: how,
    crm: { name: s(crm.name || crm.company), trade: s(crm.trade || crm.cat), email: low(crm.email), phone: s(crm.phone) },
    jobs: jobs, scopes: scopes, agreements: agreements, invoices: invoices,
    totals: {
      waitingApproval: sum(function(x){ return x.state === 'received'; }),
      approvedUnpaid: sum(function(x){ return x.state === 'approved'; }),
      paidThisYear: sum(function(x){ return x.state === 'paid' && x.paidDate.slice(0, 4) === String(yr); }),
      paidAllTime: sum(function(x){ return x.state === 'paid'; })
    },
    tax: { year: yr, paidByYear: byYear, threshold: 600, w9OnFile: hasW9, taxIdLast4: taxId ? taxId.slice(-4) : '' },
    compliance: {
      glExp: ymd(crm.insExp || crm.insuranceExp || crm.coiExpiration), glCarrier: s(crm.insCarrier), glDays: ins,
      wcExp: ymd(crm.wcExp), wcCarrier: s(crm.wcCarrier), wcExempt: !!crm.wcExempt, wcDays: wc,
      autoExp: ymd(crm.autoInsExp), autoCarrier: s(crm.autoInsCarrier),
      w9: hasW9, coi: !!crm.coi, subAgreement: !!crm.subAgreement, lienWaiver: !!crm.lien,
      // the same test the CRM uses before it pays: GL current, WC current (or exempt), W-9 on file
      okToPay: ins != null && ins > 0 && (!!crm.wcExempt || (wc != null && wc > 0)) && hasW9
    }
  };
}

/* ── a simple per-address rate limit for the public actions (per warm instance) ─ */
const hits = new Map();
function ipOf(event){ return s(gcHeader(event, 'x-nf-client-connection-ip') || gcHeader(event, 'x-forwarded-for').split(',')[0] || 'unknown'); }
function limited(ip, max){
  const now = Date.now(); let h = hits.get(ip);
  if (!h || now - h.at > 10 * 60e3) { h = { at: now, n: 0 }; hits.set(ip, h); }
  h.n++;
  if (hits.size > 5000) hits.clear();
  return h.n > max;
}

exports.handler = async function (event) {
  const headers = gcCors(event);
  const J = function(code, body){ return { statusCode: code, headers: headers, body: JSON.stringify(body) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return J(405, { error: 'Method not allowed' });
  if (!svcKey()) return J(500, { error: 'SUPABASE_SERVICE_KEY is not set on Netlify.' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'Invalid JSON' }); }
  if (!body || typeof body !== 'object') return J(400, { error: 'Invalid request' });
  const action = s(body.action);
  try {
    if (action === 'register') {
      if (limited(ipOf(event), 12)) return J(429, { error: 'Too many tries. Wait a few minutes and try again.' });
      return J(200, await register(body));
    }
    if (action === 'invite-info') {
      if (limited(ipOf(event), 40)) return J(429, { error: 'Too many tries. Wait a few minutes.' });
      const inv = await findInvite(body.invite, body.job);
      if (!inv) return J(200, { ok: false });
      const job = await getRow('jobs', inv.job_id);
      return J(200, { ok: true, email: s(inv.data.email), jobTitle: job && !isDraft(job.data) ? s(job.data.title) : '' });
    }

    const who = await whoAmI(event);
    const ctx = {};
    if (action === 'me') {
      if (!who.profile) return J(200, { user: null, error: 'This sign-in has no subcontractor portal account. Register first, or call GrayCo ' + OFFICE_PHONE + '.' });
      return J(200, { user: who.profile, role: who.isAdmin ? 'admin' : 'sub' });
    }
    needSub(who, false);
    if (action === 'load') {
      const keys = Array.isArray(body.keys) ? body.keys.map(s).filter(Boolean).slice(0, 40) : [];
      const data = {};
      for (const k of keys) {
        if (!who.isAdmin && !who.approved && !/^subdocs:|^users$/.test(k)) { data[k] = COLLECTIONS.indexOf(k) > -1 ? [] : null; continue; }
        data[k] = await loadKey(who, k, ctx);
      }
      if (keys.indexOf('jobs') > -1) await sweepPlanRequests();
      return J(200, { data: await signAll(data) });
    }
    if (action === 'save') {
      const key = s(body.key);
      if (COLLECTIONS.indexOf(key) > -1) return J(200, await saveCollection(who, key, body.upsert, body.del, ctx));
      if (KEYED.indexOf(key.split(':')[0]) > -1) { const out = await saveKeyed(who, key, body.value === undefined ? null : body.value, ctx); if (ctx.afterSave) { try { await ctx.afterSave(); } catch (e) { console.warn('[subportal] plans ready', e.message); } } return J(200, out); }
      return J(400, { error: 'Unknown record: ' + key });
    }
    if (action === 'upload') {
      const size = Number(body.size) || 0;
      if (size <= 0 || size > MAX_FILE) return J(413, { error: 'Files can be up to 50 MB.' });
      const path = (who.isAdmin ? 'staff/' + new Date().toISOString().slice(0, 7) : 'u/' + who.profile.id) + '/' +
        crypto.randomBytes(8).toString('hex') + '-' + safeName(body.name);
      const r = await fetch(sbUrl() + '/storage/v1/object/upload/sign/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'POST', headers: H(), body: '{}' });
      if (!r.ok) {
        const t = await r.text();
        if (/bucket/i.test(t) && /not.?found/i.test(t)) return J(503, { error: 'File storage is not set up yet (run docs/subportal-setup.sql).' });
        return J(502, { error: 'Could not prepare the upload (' + r.status + ').' });
      }
      const j = await r.json();
      return J(200, { path: path, url: sbUrl() + '/storage/v1' + j.url });
    }
    if (action === 'plans-import') {
      if (!who.isAdmin) return J(403, { error: 'GrayCo staff only.' });
      return J(200, await plansImport(who, body));
    }
    if (action === 'request-plans') return J(200, await requestPlans(who, body, ctx));
    if (action === 'my-work') {
      if (who.isAdmin && !body.userId) return J(400, { error: 'Pick a subcontractor.' });
      const target = who.isAdmin ? (await getRow('users', s(body.userId)) || {}).data : who.profile;
      if (!target || target.role !== 'sub') return J(404, { error: 'No such subcontractor.' });
      if (!who.isAdmin && !who.approved) return J(403, { error: 'Your account is waiting for GrayCo to approve it.' });
      return J(200, await myWork(target));
    }
    if (action === 'crm-subs') {
      if (!who.isAdmin) return J(403, { error: 'GrayCo staff only.' });
      return J(200, { subs: await crmSubs() });
    }
    if (action === 'ai-plans') {
      if (!who.isAdmin) return J(403, { error: 'GrayCo staff only.' });
      return J(200, await aiPlans(s(body.fileRef)));
    }
    return J(400, { error: 'Unknown action.' });
  } catch (e) {
    if (e.status) return J(e.status, { error: e.message });
    console.error('[subportal]', action, e);
    return J(500, { error: 'Something went wrong. Try again, or call GrayCo ' + OFFICE_PHONE + '.' });
  }
};
