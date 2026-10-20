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
const PORTAL_ORIGIN = 'https://portal.grayco-cs.com';
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* CORS: the CRM's own addresses (SITE_ORIGIN) and the portal's address. */
function gcCors(event){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').concat([PORTAL_ORIGIN])
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
const COLLECTIONS = ['users', 'jobs', 'bids', 'estimates', 'activity', 'messages', 'invites', 'links'];
const KEYED = ['plans', 'subdocs', 'takeoff', 'bid-draft'];
const CLOSED = ['closed', 'won', 'lost'];
// What a subcontractor may change on their own profile. Never role, approval, e-mail or the CRM link.
const SUB_PROFILE_FIELDS = ['name', 'phone', 'contactTitle', 'company', 'dbaName', 'businessAddress', 'businessCity',
  'businessState', 'businessZip', 'website', 'yearsInBusiness', 'numEmployees', 'unionAffiliation', 'serviceArea',
  'licenseNumbers', 'einLast4', 'trades', 'suggestPasswordChange', 'lang'];
// What a subcontractor sees of a GrayCo person (the PM / estimator on a job).
const STAFF_PUBLIC_FIELDS = ['id', 'name', 'email', 'phone', 'title', 'role', 'company'];
// Phone and title for the people already at GrayCo, used the first time they open the portal.
const KNOWN_STAFF = {
  'nthomas@grayco-cs.com': { name: 'Nick Thomas', phone: '901-634-4354', title: 'Owner' },
  'wjohnson@grayco-cs.com': { name: 'Wesley Johnson', phone: '901-692-7255', title: 'Owner' },
  'sbiffle@grayco-cs.com': { name: 'Steven Biffle', phone: '901-456-6922', title: 'Project Manager' },
  'gmiller@grayco-cs.com': { name: 'Glenn Miller', phone: '901-860-8251', title: 'Commercial Estimator' },
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
    const known = KNOWN_STAFF[t.email] || {};
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
  const add = staff.filter(function(x){ return !have.has(x.email); }).map(function(x){
    const known = KNOWN_STAFF[x.email] || {};
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
      upsert.forEach(function(rec){
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
    '<div style="background:#140665;color:#fff;padding:16px 20px;font-weight:700;font-size:16px">GrayCo Subcontractor Portal</div>' +
    '<div style="padding:20px;border:1px solid #EDE9E0;border-top:0"><h2 style="margin:0 0 12px;font-size:18px">' + esc(title) + '</h2>' +
    lines.map(function(l){ return '<p style="margin:0 0 10px;line-height:1.5">' + l + '</p>'; }).join('') +
    (button ? '<p style="margin:18px 0 0"><a href="' + esc(button.href) + '" style="background:#D4A017;color:#140665;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:700">' + esc(button.label) + '</a></p>' : '') +
    '<p style="margin:18px 0 0;font-size:12px;color:#64748B">GrayCo Construction Services, LLC · Bartlett, TN · ' + OFFICE_PHONE + '</p></div></div>';
}
async function sendMail(to, subject, html){
  const key = s(process.env.RESEND_API_KEY);
  to = (Array.isArray(to) ? to : [to]).map(low).filter(okEmail);
  to = Array.from(new Set(to));
  if (!key || mailOff() || !to.length) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'GrayCo Subcontractor Portal <portal@grayco-cs.com>', reply_to: OFFICE, to: to, subject: subject, html: html }) });
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
async function notify(n){
  if (n.kind === 'registered') {
    const u = n.user;
    return sendMail(process.env.SUBPORTAL_NOTIFY || OFFICE, 'New subcontractor sign-up — ' + u.company,
      mailHtml('New subcontractor sign-up', [
        '<b>' + esc(u.company) + '</b>' + (u.dbaName ? ' (DBA ' + esc(u.dbaName) + ')' : ''),
        esc(u.name) + ' · ' + esc(u.email) + (u.phone ? ' · ' + esc(u.phone) : ''),
        u.trades && u.trades.length ? 'Trades: ' + esc(u.trades.join(', ')) : '',
        u.approved ? 'They came from a job invite, so they are already approved.' : 'They are waiting for approval: open the portal → <b>Pending Subs</b>.'
      ].filter(Boolean), { href: portalLink(), label: 'Open the portal' }));
  }
  if (n.kind === 'approved') {
    return sendMail(n.user.email, 'You are approved on the GrayCo Subcontractor Portal',
      mailHtml('Welcome, ' + s(n.user.name).split(' ')[0], [
        'GrayCo Construction Services approved <b>' + esc(n.user.company) + '</b> on the subcontractor portal.',
        'Sign in to see open jobs, bid, upload your W-9 and insurance certificates, and follow your work and payments with us.'
      ], { href: portalLink(), label: 'Sign in' }));
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
  return crmSubList(data).filter(function(r){ return s(r.id); }).map(function(r){
    return { id: s(r.id), name: s(r.name || r.company), company: s(r.company), email: low(r.email), phone: s(r.phone), trade: s(r.trade || r.cat) };
  }).sort(function(a, b){ return a.name.localeCompare(b.name); });
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
      return J(200, { ok: true, email: s(inv.data.email), jobTitle: job ? s(job.data.title) : '' });
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
      return J(200, { data: await signAll(data) });
    }
    if (action === 'save') {
      const key = s(body.key);
      if (COLLECTIONS.indexOf(key) > -1) return J(200, await saveCollection(who, key, body.upsert, body.del, ctx));
      if (KEYED.indexOf(key.split(':')[0]) > -1) return J(200, await saveKeyed(who, key, body.value === undefined ? null : body.value, ctx));
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
