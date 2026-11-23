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
//   POST {action:'invite-groups', op, …}            → (staff) patch INVGROUPS: saved invite groups (get / save / archive)
//   POST {action:'po-link', jobId, projectId}       → (staff) patch BIDPO: link the bid job to a CRM job (its PO); '__none' = own PO, '' = match again
//   POST {action:'po-cands', jobId, q}              → (staff) the CRM jobs to pick from
//   POST {action:'ai-plans', fileRef}               → (staff) read a plan PDF with Claude → title / scope …
//
// Data: table sp_rows (docs/subportal-setup.sql: RLS on, no rules — only this function, with the
// service key, can read it) and the private bucket subportal-files. Files leave only as signed
// links that run out after 8 hours, and only inside records the person may see.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (already set), RESEND_API_KEY (already set; e-mail),
//      ANTHROPIC_API_KEY (already set; plan reading), optional SUBPORTAL_NOTIFY (who hears about
//      new sign-ups, default office@grayco-cs.com), SUBPORTAL_AI_MODEL, PORTAL_MAIL_OFF=1.

require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
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
const COLLECTIONS = ['users', 'jobs', 'bids', 'estimates', 'activity', 'messages', 'invites', 'links', 'questions', 'acks', 'mquotes'];   /* patch SUPPLIER: mquotes = a supplier's material quote */   /* patch SYS2: acks = a sub's "I acknowledge addendum #n" */
const KEYED = ['plans', 'subdocs', 'takeoff', 'bid-draft'];
const CLOSED = ['closed', 'won', 'lost'];
/* patch LD2: the Lead Inbox writes DRAFT bid jobs here (netlify/functions/_lib/bid-portal.js: status "draft",
   visibility "private", draft:true). A draft is for GrayCo staff only — never shown to a sub, invited or not,
   until an admin publishes it (CRM Lead Inbox "Publish to bid portal", or the same button on the job here). */
function isDraft(j){ return !!j && (j.draft === true || low(j.status) === 'draft'); }
/* patch SYS2: deleted from the CRM's 🏗 Bid portal tab (a soft delete, restorable for 30 days) — no sub sees it any more */
function isGone(j){ return !!j && (low(j.status) === 'archived' || !!j.archivedAt); }
/* patch SYS2: what a sub sees of a bid job — trade scopes of their own trades only (all of them when they gave no trade),
   published addenda without GrayCo's sending details, never the CRM's posting log */
function subJobView(j, trades){
  const v = Object.assign({}, j);
  delete v.log; delete v.archivedFrom; delete v.scopeAsks; delete v.scopeReview;   /* patch SUBSIMPLE: staff only (who was asked about what) */
  delete v._po; delete v.poHistory; delete v.poNoMatch; delete v.poNoMatchBy; delete v.poNoMatchAt; delete v.crmProjectAuto; delete v.crmProjectAt; delete v.crmProjectBy; delete v.poAssignedAt;   /* patch BIDPO: staff only */
  delete v.internalNotes; delete v.crmFileRefs; delete v.ourDue; delete v.ourDueTime;   /* patch PLANREQ-F: subs see only the sub due date */ if (!v.showOwnerGc) delete v.ownerGc;   /* patch PLANREQ-E: internal notes never; the owner / GC only when GrayCo ticks "show it" */
  if (v.siteWalk && typeof v.siteWalk === 'object') v.siteWalk = pick(v.siteWalk, ['date', 'time', 'location', 'mandatory']);   /* never the RSVP list */
  const mine = (Array.isArray(trades) ? trades : []).map(function(x){ return low(x); }).filter(Boolean);   /* arr() keeps objects only */
  if (Array.isArray(v.tradeScopes) && mine.length) v.tradeScopes = v.tradeScopes.filter(function(ts){ const t = low(ts && ts.trade); return !t || mine.some(function(m){ return t.indexOf(m) > -1 || m.indexOf(t) > -1; }); });
  if (Array.isArray(v.tradeScopes)) v.tradeScopes = v.tradeScopes.map(function(ts){ return pick(ts, ['id', 'trade', 'scope', 'files']); })   /* patch PLANREQ-C: + the trade's scope files */
    .filter(function(ts){ return s(ts.scope) || (Array.isArray(ts.files) && ts.files.length); });   /* patch QAA: a trade with no scope written yet is not an empty box on the sub's page (the trades are listed under "We are bidding") */
  if (Array.isArray(v.addenda)) v.addenda = v.addenda.filter(function(a){ return a && a.publishedAt; }).map(function(a){ return pick(a, ['num', 'date', 'title', 'text', 'files', 'dueFrom', 'dueTo', 'publishedAt']); });
  /* patch BIDVIS (owner 11/19: "just the plans, addendums and scopes"): no invitation to bid / solicitation / bid form, no bid board's page,
     unless an admin ticked "Visible to subs" (_lib/subvis.js); the Lead Inbox's source link and its notes lines with those links go too */
  const V = SV(), hidLinks = arr(v.plansLinks).filter(function(l){ return !V.visible(l, 'link'); });
  if (Array.isArray(v.plansLinks)) v.plansLinks = V.list(v.plansLinks, 'link');
  if (Array.isArray(v.plans)) v.plans = V.list(v.plans, 'plan');
  if (Array.isArray(v.specDocs)) v.specDocs = V.list(v.specDocs, 'spec');
  if (Array.isArray(v.scopeDocs)) v.scopeDocs = V.list(v.scopeDocs, 'scope');
  if (Array.isArray(v.tradeScopes)) v.tradeScopes = v.tradeScopes.map(function(ts){ return Array.isArray(ts.files) ? Object.assign({}, ts, { files: V.list(ts.files, 'scope') }) : ts; });
  if (Array.isArray(v.addenda)) v.addenda = v.addenda.map(function(a){ return Array.isArray(a.files) ? Object.assign({}, a, { files: V.list(a.files, 'addendum') }) : a; });
  if (v.notes) v.notes = V.notesFor(v.notes, hidLinks.concat(s(j.sourceLink) && !arr(v.plansLinks).some(function(l){ return s(l.url) === s(j.sourceLink); }) ? [{ url: j.sourceLink }] : []));
  delete v.sourceLink; delete v.leadInbox; delete v._estAuto;
  /* patch BIDSITE3 (owner 11/20: "never show GrayCo pricing to subs/suppliers"): no GrayCo price / cost / margin field on a job ever leaves */
  GC_PRICE_FIELDS.forEach(function(k){ delete v[k]; }); delete v.resultMailed; delete v.dueReminderAt;
  if (v.materialList) v.materialList = noPrices(v.materialList);
  return v;
}
/* patch BIDSITE3: GrayCo's own pricing fields (an estimate's value, a budget, our bid …) — never on what a sub / supplier gets */
const GC_PRICE_FIELDS = ['estValue', 'estimatedValue', 'estimateValue', 'estimateTotal', 'budget', 'projectValue', 'contractValue', 'contractAmount', 'contract', 'ourBid', 'ourPrice', 'gcPrice', 'gcBid', 'gcBidAmount', 'totalCharge', 'totalCost', 'margin', 'markup', 'gp', 'sellPrice', 'ourTotal', 'bidTotal'];
/* a dollar amount typed into a list a sub / supplier sees ("4 RTUs @ $9,000") is taken out */
function noPrices(t){ return s(t).replace(/(@\s*)?\$\s?\d[\d,]*(\.\d+)?(\s*(ea|each|\/\s*\w+))?/gi, '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '').slice(0, 20000); }
function SV(){ return require('./_lib/subvis.js'); }
/* patch BIDVIS: a job's plan files a sub may open — the admin's toggle is kept on the job's plan list (job.plans, by name) */
function subPlans(items, job){
  const meta = arr(job && job.plans);
  return arr(items).filter(function(f){
    const m = meta.find(function(x){ return s(x.name) === s(f.name); });
    const flag = m && typeof m.subsVisible === 'boolean' ? m.subsVisible : f.subsVisible;
    return SV().visible(Object.assign({}, f, { subsVisible: flag, category: s(f.category) || s(m && m.category) }), 'plan');
  });
}
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
/* the papers a sub must have on file to bid: W-9, general liability, workers' comp — on file and not expired → '' or the reason */
const REQUIRED_PAPERS = [['w9', 'W-9'], ['insurance_general', 'general liability insurance certificate'], ['insurance_workers_comp', "workers' comp insurance certificate"]];
/* patch PAPERS1 (owner 11/20: "papers from portal for insurance etc go directly into crm too"): the CRM sub record is the single source of truth.
   The bid site's My Documents shows (and the bid check counts) each W-9 / GL / WC / license the CRM has on file when it is newer than the
   bid site's own copy — sent from portal.grayco-cs.com, dropped in by the office, or one from here already filed. Read-only here ("On file
   with GrayCo"); never saved back into subdocs. */
const CRM_PAPER = [['w9', 'w9', 'w9', ''], ['insurance_general', 'coi', 'coi', 'insExp'], ['insurance_workers_comp', 'wc', 'wc', 'wcExp'], ['license', 'license', 'license', 'licenseExp']];
async function crmPapersOf(profile){
  let sub = null;
  try { const PA = require('./portal-access.js')._acct; sub = PA.crmSubOf(await PA.crmData(), profile); } catch (e) { return []; }
  if (!sub) return [];
  const out = [], files = arr(sub.files).filter(function(f){ return f && typeof f === 'object' && !f.rejected && /^sb:crm-files\/[0-9a-f]{64}\.[a-z0-9]{1,5}$/.test(s(f.ref)); });
  CRM_PAPER.forEach(function(k){
    const exp = k[3] ? s(sub[k[3]] || (k[3] === 'insExp' ? sub.coiExp || sub.insuranceExp : '')).slice(0, 10) : '';
    const on = k[1] === 'license' ? !!s(sub.license) || !!exp : k[1] === 'wc' ? sub.wc === true || sub.wcExempt === true || !!exp : sub[k[1]] === true || !!exp;
    if (!on) return;
    const f = files.filter(function(x){ return s(x.kind) === k[2]; }).sort(function(a, b){ return s(b.exp || b.date).localeCompare(s(a.exp || a.date)); })[0];
    out.push({ id: 'crm_' + k[1], type: k[0], label: 'On file with GrayCo', fileName: f ? clip(f.name, 160) : 'On file with GrayCo', fileType: f ? s(f.type) : '', crmRef: f ? s(f.ref).replace(/^sb:crm-files\//, '') : '',
      expirationDate: exp || null, wcExempt: k[1] === 'wc' && sub.wcExempt === true ? true : undefined, uploadedAt: f ? s(f.date || f.at) : '', fromCrm: true });
  });
  return out;
}
function clip(v, n){ return s(v).slice(0, n); }
function mergeCrm(items, crm){
  const add = crm.filter(function(c){
    const mine = items.filter(function(d){ return d && d.type === c.type && !d.rejected; });
    if (!mine.length) return true;
    if (!c.expirationDate) return false;
    return !mine.some(function(d){ return !s(d.expirationDate) || s(d.expirationDate).slice(0, 10) >= c.expirationDate; });
  });
  return add.concat(items);
}
async function withCrmPapers(profile, items){
  const crm = await crmPapersOf(profile).catch(function(){ return []; });
  const list = mergeCrm(items, crm), refs = list.filter(function(d){ return d.fromCrm && d.crmRef; }).map(function(d){ return d.crmRef; });
  if (refs.length) {
    try { const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files', { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: SIGN_SECS, paths: refs }) });
      const m = {}; (r.ok ? await r.json() : []).forEach(function(x){ if (x && x.path && x.signedURL && !x.error) m[x.path] = sbUrl() + '/storage/v1' + x.signedURL; });
      list.forEach(function(d){ if (d.fromCrm && m[d.crmRef]) d.dataUrl = m[d.crmRef]; delete d.crmRef; }); } catch (e) {}
  }
  list.forEach(function(d){ if (d.fromCrm) delete d.crmRef; });
  return list;
}
async function papersMissing(userId, profile){
  let items = []; try { const r = await getRow('subdocs', userId); items = arr(r && r.data && r.data.items); } catch (e) { items = []; }
  if (profile) items = mergeCrm(items, await crmPapersOf(profile).catch(function(){ return []; }));   /* patch PAPERS1 */
  const today = new Date().toISOString().slice(0, 10), bad = [];
  REQUIRED_PAPERS.forEach(function(p){
    const have = items.filter(function(d){ return d && d.type === p[0] && !d.rejected; });   /* patch SUBDOCDENY: a paper GrayCo denied is not on file */
    if (!have.length) bad.push(p[1] + ' is missing');
    else if (!have.some(function(d){ return !s(d.expirationDate) || s(d.expirationDate).slice(0, 10) >= today; })) bad.push(p[1] + ' has expired');
  });
  return bad.length ? 'Before you can bid: your ' + bad.join(', your ') + '. Upload it in My Documents, then send your bid.' : '';
}
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
  else if (collection === 'acks' || collection === 'mquotes') { r.job_id = s(rec.jobId); r.user_id = s(rec.userId); }   /* patch SUPPLIER: + mquotes */
  else if (collection === 'planreqs') { r.job_id = s(rec.jobId); r.user_id = s(rec.userId); r.email = low(rec.email); }   /* patch PLANREQ */
  else if (collection === 'matreqs') { r.job_id = s(rec.jobId); r.user_id = s(rec.userId); r.email = low(rec.userEmail); }   /* patch BIDSITE3: a sub's "Request more materials" */
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
    /* patch SUBSESS: only Supabase saying the token is bad (401/403) means "signed out" — a 5xx / 429 / odd answer from the
       sign-in service is a hiccup (503: the bid site keeps the sign-in and tries again), not an expired sign-in */
    else if (r.status !== 401 && r.status !== 403) throw Fail(503, 'Could not reach the sign-in service. Try again.');
  } catch (e) { if (e && e.status === 503) throw e; throw Fail(503, 'Could not reach the sign-in service. Try again.'); }
  const email = low(user && user.email);
  if (!email) throw Fail(401, 'Your sign-in has expired. Please sign in again.');
  return { email: email, uid: s(user.id), at: signedInAt(m[1]) };
}
/* patch SUBACCT: when this sign-in was made (the token's amr time — kept through token renewals; Supabase checked the token above).
   Admin → 🔐 Sub portal accounts → 🚪 Sign out everywhere / a temporary password refuse sign-ins made before profile.signedOutAt. */
function signedInAt(tok){
  try { const p = JSON.parse(Buffer.from(String(tok).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const ts = (Array.isArray(p.amr) ? p.amr : []).map(function(x){ return Number(x && x.timestamp) || 0; }).filter(Boolean);
    const t = ts.length ? Math.min.apply(null, ts) : Number(p.iat) || 0; return t ? t * 1000 : 0; } catch (e) { return 0; }
}
function subAcctCheck(profile, t){
  if (profile.signinDisabled === true) throw Fail(401, 'This account is turned off. Please call GrayCo ' + OFFICE_PHONE + '.');
  const out = Date.parse(s(profile.signedOutAt));
  if (out && t.at && t.at < out - 2000) throw Fail(401, 'Please sign in again.');
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
  { const tw = await teamWho(t, profile); if (tw) return tw; }   /* patch PORTALTEAM: a team member signs in as their company */
  if (!profile || (profile.role !== 'sub' && profile.role !== 'supplier')) return { email: t.email, uid: t.uid, staff: null, profile: null, isAdmin: false, isSub: false, approved: false };
  if (svUnconfirmed(profile)) throw Fail(403, SV_MSG);   /* SIGNUPVERIFY: nothing until the e-mail is confirmed */
  subAcctCheck(profile, t);   /* patch SUBACCT: turned off / signed out everywhere by an owner */
  if (profile.authUserId !== t.uid) {
    profile = Object.assign({}, profile, { authUserId: t.uid });
    await upsertRows([rowFor('users', profile)], t.email);
  }
  /* patch SUPPLIER: a supplier signs in the same way (isSub: the same account paths); isSupplier keeps the sub-only parts (labour bids,
     COI papers) away from them and gives them material quotes + their POs / bills */
  return { email: t.email, uid: t.uid, staff: null, profile: profile, isAdmin: false, isSub: true, isSupplier: profile.role === 'supplier', approved: profile.approved === true };
}
/* patch PORTALTEAM (owner 11/23: "let their sign up be for everyone in their companies"): an ACTIVE team member of a bid-site company
   (_lib/portalteam.js, company 'sp:<profile id>') is that company here — its jobs, bids, papers, messages — with their own sign-in
   (updated_by = their e-mail). The company's own off / signed-out-everywhere switches apply to them too. A removed member is refused;
   a primary contact a teammate (or staff) removed is refused on their own e-mail. Never writes the company's profile. */
function TEAM(){ return require('./_lib/portalteam.js'); }
async function teamWho(t, own){
  const TM = TEAM();
  let rows = [];
  try { rows = await TM.find({ kind: 'email', value: t.email }); } catch (e) { if (own) return null; throw e; }
  rows = rows.filter(function(m){ return /^sp:/.test(s(m.company)); });
  const pri = own ? rows.find(function(m){ return m.primary === true && m.company === TM.keySub(own.id); }) : null;
  if (pri && pri.status === 'removed') throw Fail(401, 'You were taken off your company\'s GrayCo portal team. Ask a coworker to add you back, or call GrayCo ' + OFFICE_PHONE + '.');
  const m = rows.filter(function(x){ return x.primary !== true && TM.active(x); }).sort(function(a, b){ return s(a.addedAt).localeCompare(s(b.addedAt)); })[0];
  if (!m) {
    if (!own && rows.some(function(x){ return x.primary !== true && x.status === 'verify'; })) throw Fail(403, TEAM_VERIFY_MSG);   /* SECURITY: not confirmed = no access */
    if (!own && rows.some(function(x){ return x.primary !== true && x.status === 'removed'; })) throw Fail(401, 'You were taken off your company\'s GrayCo portal team. Ask a coworker to add you back, or call GrayCo ' + OFFICE_PHONE + '.');
    return null;
  }
  const row = await getRow('users', s(m.company).slice(3)), comp = row && row.data;
  if (!comp || (comp.role !== 'sub' && comp.role !== 'supplier')) return null;
  if (comp.signinDisabled === true) throw Fail(401, 'This account is turned off. Please call GrayCo ' + OFFICE_PHONE + '.');
  const out = Date.parse(s(m.signedOutAt)); if (out && t.at && t.at < out - 2000) throw Fail(401, 'Please sign in again.');
  return { email: t.email, uid: t.uid, staff: null, profile: comp, isAdmin: false, isSub: true, isSupplier: comp.role === 'supplier', approved: comp.approved === true,
    member: { id: s(m.id), name: s(m.name), email: low(m.email), company: s(m.company) } };
}
function needSub(who, approvedOnly){
  if (who.isAdmin) return;
  if (!who.isSub) throw Fail(403, 'This sign-in has no subcontractor portal account. Register first, or call GrayCo ' + OFFICE_PHONE + '.');
  if (approvedOnly && !who.approved) throw Fail(403, 'Your account is waiting for GrayCo to approve it.');
}

/* patch TRADEVIS (owner 11/23: "On the sub and bid portal only show jobs that have their trade requested or their trade in it … If there
   is no electrical for a GC job then don't show to electrical companies etc. Anything they do on their profile show to them"):
   a PUBLIC job shows to a sub only when one of the trades on their profile is among the job's trades (Trades we are bidding /
   tradesSought + the trade scopes). Always shown: a job they were invited to, one they bid on, a job with no trades listed yet, and
   every job to a sub whose profile has no trades yet. */
const TRADE_SYN = [/\belectric/, /\b(hvac|mechanical|heating|air condition|a\/c)\b/, /\bplumb/, /\b(drywall|sheetrock|gypsum|metal stud)/, /\bpaint/, /\broof/, /\b(concrete|flatwork|foundation)/, /\b(masonry|brick|block|stone)/, /\b(fire (sprinkler|protection)|sprinkler)/, /\b(low voltage|data cabling|security|alarm)/, /\b(demo|demolition)/, /\binsulation/, /\b(glass|glazing|storefront)/, /\b(doors?|hardware)\b/, /\b(cabinet|millwork|casework)/, /\btile/, /\b(carpet|flooring|vinyl|lvt|lvp)/, /\b(framing|carpentry|framer)/, /\b(site ?work|excavat|grading|earthwork)/, /\b(landscap|irrigation)/, /\b(paving|asphalt)/, /\b(steel|welding|structural)/, /\bgutter/, /\bsiding/, /\b(ceiling|acoustic)/, /\b(abatement|asbestos|mold remediation)/, /\b(janitorial|final clean)/, /\belevator/, /\bfenc/, /\bsignage/];
function tvList(v){ return (Array.isArray(v) ? v.map(function(x){ return x && typeof x === 'object' ? s(x.trade || x.name) : s(x); }) : s(v).split(/\s*[,;\n]\s*/)).map(function(x){ return low(x).replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim(); }).filter(Boolean); }
function jobTrades(j){ return tvList(j && j.tradesSought).concat(tvList((Array.isArray(j && j.tradeScopes) ? j.tradeScopes : []).map(function(t){ return t && t.trade; }))); }
function tradeOne(a, b){ if (a === b || (a.length > 3 && b.indexOf(a) > -1) || (b.length > 3 && a.indexOf(b) > -1)) return true; return TRADE_SYN.some(function(rx){ return rx.test(a) && rx.test(b); }); }
function tradeFit(j, profile){
  const want = jobTrades(j); if (!want.length) return true;
  const mine = tvList((Array.isArray(profile && profile.trades) ? profile.trades : []).concat([s(profile && profile.trade)]).filter(Boolean)); if (!mine.length) return true;
  return want.some(function(w){ return mine.some(function(m){ return tradeOne(w, m); }); });
}
/* ── what a subcontractor may see ─────────────────────────────────────────── */
async function subScope(who){
  if (who.isSupplier) return supplierScope(who);   /* patch SUPPLIER */
  const me = who.profile.id;
  const [jobs, invites, myBids] = await Promise.all([
    listRows([eq('collection', 'jobs')]),
    listRows([eq('collection', 'invites'), inList('email', Array.from(new Set([low(who.email), low(who.profile.email)].filter(Boolean))))]),   /* patch SUBFLOW: a team member sees the jobs their COMPANY was invited to (was: only invites to their own e-mail) */
    listRows([eq('collection', 'bids'), eq('user_id', me)])
  ]);
  const invited = new Set(invites.map(function(r){ return r.job_id; }));
  const bidOn = new Set(myBids.map(function(r){ return r.job_id; }));
  const visible = {}, biddable = {};
  if (who.approved) {
    jobs.forEach(function(r){
      const j = r.data || {};
      if (isDraft(j) || isGone(j)) return;   /* patch SYS2: a deleted bid job is gone for every sub, even one who bid on it */
      const canSee = ((j.visibility || 'public') === 'public' && tradeFit(j, who.profile)) || invited.has(r.id);   /* patch TRADEVIS */
      const open = CLOSED.indexOf(low(j.status)) < 0;
      if (bidOn.has(r.id) || (canSee && open)) visible[r.id] = r;
      if (canSee && open && !j.biddingClosed && !dueOver(j)) biddable[r.id] = true;   /* patch PLANREQ-E: ⏸ Close bidding — still visible, no new bids · patch SUBFLOW: past the due date too */
    });
  }
  return { me: me, jobs: visible, biddable: biddable, invites: invites, myBids: myBids };
}

/* ── patch SUPPLIER (owner 11/19: "Vendors, not subs, should also be able to have a portal and see these jobs for bid and their own jobs
   too. Basically a sub portal but for suppliers.") ── a supplier account (users row role 'supplier', signed up / approved like a sub):
   · sees only the jobs an admin opened for MATERIAL quotes (job.suppliersCanQuote, public or invited, open, not a draft) and the jobs
     they already quoted — the plans / specs / addenda subs see (_lib/subvis.js), the job's material list, never the trades' labour scopes,
     the bid form lines or anyone else's quote;
   · sends material quotes (mquotes: line items, lead time, valid until, notes, files) — never a labour bid; no COI needed (a W-9 helps);
   · sees their own POs (gc_kv gc_supplier_pos, sent ones) and supplier bills (invs type 'supplier') from the CRM, read-only, once GrayCo
     linked the account to the CRM vendor (crmVendorId; Suppliers → CRM record, a likely match by e-mail or tax ID offered). */
async function supplierScope(who){
  const me = who.profile.id;
  const [jobs, invites, mine] = await Promise.all([
    listRows([eq('collection', 'jobs')]),
    listRows([eq('collection', 'invites'), inList('email', Array.from(new Set([low(who.email), low(who.profile.email)].filter(Boolean))))]),   /* patch SUBFLOW: a team member sees the jobs their COMPANY was invited to (was: only invites to their own e-mail) */
    listRows([eq('collection', 'mquotes'), eq('user_id', me)])
  ]);
  const invited = new Set(invites.map(function(r){ return r.job_id; }));
  const quoted = new Set(mine.map(function(r){ return r.job_id; }));
  const visible = {}, quotable = {};
  if (who.approved) {
    jobs.forEach(function(r){
      const j = r.data || {};
      if (isDraft(j) || isGone(j)) return;
      const canSee = j.suppliersCanQuote === true && ((j.visibility || 'public') === 'public' || invited.has(r.id));
      const open = CLOSED.indexOf(low(j.status)) < 0;
      if (quoted.has(r.id) || (canSee && open)) visible[r.id] = r;
      if (canSee && open && !j.quotesClosed) quotable[r.id] = true;
    });
  }
  return { me: me, jobs: visible, biddable: {}, quotable: quotable, invites: invites, myBids: [], myQuotes: mine, supplier: true };
}
/* what a supplier sees of a job: the sub view without the trades' labour scopes / bid form, plus the material list */
function supplierJobView(j){
  const v = subJobView(j, []);
  delete v.tradeScopes; delete v.bidForm; delete v.bidLines; delete v.bidResultsSharing;
  v.materialList = noPrices(j.materialList);   /* patch BIDSITE3: never a price */
  return v;
}
const MQ_STATUS = ['submitted', 'accepted', 'declined'];
function mqLines(v){
  return arr(v).slice(0, 200).map(function(l, i){
    const qty = num(l.qty), price = num(l.unitPrice);
    return { id: s(l.id).slice(0, 40) || 'l' + (i + 1), desc: s(l.desc).slice(0, 300), spec: s(l.spec).slice(0, 300), qty: qty, unit: s(l.unit).slice(0, 20), unitPrice: money(price), total: money(qty * price) };   /* patch BIDSITE3: + spec (model / size / brand) */
  }).filter(function(l){ return l.desc; });
}
async function supplierWork(profile){
  const data = await crmData();
  const gone = deletedTest(data);
  const vendors = arr(data.vendors).filter(function(v){ return v && s(v.id) && !gone('vendors', v.id); });
  const v = profile.crmVendorId ? vendors.find(function(x){ return s(x.id) === s(profile.crmVendorId); }) : null;
  if (!v) return { linked: false, supplier: true };
  const names = new Set([norm(v.name), norm(v.company)].filter(Boolean));
  const isMine = function(name, id){ return (id && s(id) === s(v.id)) || (name && names.has(norm(name))); };
  const projects = arr(data.projects).filter(function(p){ return !gone('projects', p.id); });
  const projById = {}; projects.forEach(function(p){ projById[s(p.id)] = p; });
  let pos = []; try { pos = arr((await kvRead(['gc_supplier_pos'])).gc_supplier_pos); } catch (e) { pos = []; }
  const DRAFT = /^(waiting|needs-supplier|draft|cancel+ed|void|deleted)$/i;
  const poOut = pos.filter(function(po){ return po && isMine(po.supplier, po.vendorId) && !DRAFT.test(s(po.status)); }).map(function(po){
    const p = projById[s(po.pid)] || {};
    return { id: s(po.id), poNo: s(po.poNo), job: s(p.name), address: s(p.address || p.jobAddress), status: s(po.status), sentAt: ymd(po.sentAt || po.updatedAt || po.createdAt),
      items: arr(po.items).slice(0, 200).map(function(i){ return { desc: s(i.desc).slice(0, 300), qty: num(i.qty), unit: s(i.unit).slice(0, 20) }; }) };   /* no GrayCo cost */
  }).sort(function(a, b){ return b.sentAt.localeCompare(a.sentAt); });
  const seen = {};
  const bills = arr(data.invs).concat(arr(data.invoices)).filter(function(iv){
    if (!iv || low(iv.type) !== 'supplier' || gone('invs', iv.id) || seen[s(iv.id)]) return false; seen[s(iv.id)] = 1;
    return isMine(iv.supplier || iv.vendor || iv.company, iv.vendorId);
  }).map(function(iv){
    const paid = low(iv.status) === 'paid' || iv.paid === true, p = projById[s(iv.pid)] || {};
    return { id: s(iv.id), number: s(iv.invNum || iv.ref), job: s(p.name), po: s(iv.po || p.autoPO), amount: money(iv.amt), billDate: ymd(iv.billDate || iv.date), due: ymd(iv.dueDate || iv.due),
      state: paid ? 'paid' : low(iv.status) === 'void' ? 'void' : 'open', paidDate: paid ? ymd(iv.paidDate) : '', checkNo: paid ? s(iv.checkNo) : '' };
  }).filter(function(b){ return b.state !== 'void'; }).sort(function(a, b){ return (b.paidDate || b.billDate).localeCompare(a.paidDate || a.billDate); });
  const jobIds = {}; poOut.forEach(function(x){ if (x.job) jobIds[x.job] = 1; }); bills.forEach(function(x){ if (x.job) jobIds[x.job] = 1; });
  const sum = function(f){ return money(bills.filter(f).reduce(function(t, x){ return t + x.amount; }, 0)); };
  return { linked: true, supplier: true, crm: { name: s(v.name || v.company), email: low(v.email), phone: s(v.phone) },
    pos: poOut, bills: bills, jobs: Object.keys(jobIds).sort(), totals: { open: sum(function(x){ return x.state === 'open'; }), paidThisYear: sum(function(x){ return x.state === 'paid' && x.paidDate.slice(0, 4) === String(new Date().getFullYear()); }) } };
}
/* the CRM's vendors (not subs) for linking a supplier account — staff only; tax ID last 4 for the "likely match" */
async function crmVendors(){
  const data = await crmData(), gone = deletedTest(data);
  return arr(data.vendors).filter(function(v){ return v && s(v.id) && v.isSub !== true && !gone('vendors', v.id); }).map(function(v){
    const tax = s(v.taxId || v.ein || v.tin).replace(/\D/g, '');
    return { id: s(v.id), name: s(v.name || v.company), email: low(v.email), phone: s(v.phone), cat: s(v.cat || v.category || v.trade), taxLast4: tax ? tax.slice(-4) : '' };
  }).sort(function(a, b){ return a.name.localeCompare(b.name); });
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
  return rows.map(function(r){ return r.data; }).filter(function(u){ return !svUnconfirmed(u); }).concat(add).map(function(u){   /* SIGNUPVERIFY: an unconfirmed sign-up is no one's card yet */
    // someone taken off the staff list stops showing as a GrayCo contact
    if (u.role === 'admin' && !active.has(low(u.email))) return Object.assign({}, u, { role: 'former' });
    return u;
  });
}

/* patch BIDEST (owner 11/19: "Estimator on bid portal should always default to [the Senior Estimator] when they are commercial bids, so his number is next
   to the PM number"): a commercial bid job (project type commercial or not set) with no estimator — or one no longer on GrayCo's staff —
   shows the Senior Estimator (the CRM's setting: Admin → 🧮 Senior Estimator / the one person with the Estimator role, _lib/estimator.js),
   never a name in the code. Only the view: _estAuto marks it, and a save keeps the job's own (empty) estimator until an admin picks one
   on ✎ Edit Job Details. */
function commercialJob(j){ const t = low(j && j.projectType); return !t || t === 'commercial'; }
async function seniorEst(ctx){
  if (ctx && ctx.senior !== undefined) return ctx.senior;
  let out = null;
  try {
    const email = low(await defaultEstimatorEmail(true));
    const staff = await staffList();
    const rows = (await listRows([eq('collection', 'users')])).filter(function(r){ return r.data && r.data.role === 'admin' && staff.some(function(x){ return x.email === low(r.email); }); });
    const hit = rows.find(function(r){ return low(r.email) === email; });
    out = { id: okEmail(email) && hit ? s(hit.id) : '', email: email, adminIds: rows.map(function(r){ return s(r.id); }) };
  } catch (e) { out = { id: '', email: '', adminIds: [] }; }
  if (ctx) ctx.senior = out;
  return out;
}
async function estFill(list, ctx){
  if (!arr(list).some(commercialJob)) return list;
  const se = await seniorEst(ctx);
  if (!se.id) return list;
  return list.map(function(j){
    if (!j || !commercialJob(j)) return j;
    const id = s(j.estimatorId);
    if (id && se.adminIds.indexOf(id) > -1) return j;
    return Object.assign({}, j, { estimatorId: se.id, _estAuto: true });
  });
}

/* ── patch BIDSITE3 (owner 11/20) E: "Subs can see supplier quotes' materials/specs/quantities (no supplier pricing, no our pricing) once
   we win the job, or during bidding if an admin per-job toggle 'Show supplier materials to subs while bidding' is on." ──
   v.supplierMaterials = [{ lines: [{ desc, spec, qty, unit }], leadTime }] — the accepted quotes when there are any, else every quote not
   declined; no supplier name, no price, no total. */
function materialsShown(j){ return !!j && (low(j.status) === 'won' || j.showSupplierMaterials === true); }
async function withSupplierMaterials(list){
  const ids = list.filter(materialsShown).map(function(j){ return j.id; });
  if (!ids.length) return list;
  const rows = await listRows([eq('collection', 'mquotes'), inList('job_id', ids)]);
  return list.map(function(j){
    if (!materialsShown(j)) return j;
    const qs = rows.filter(function(r){ return r.job_id === j.id; }).map(function(r){ return r.data || {}; }).filter(function(q){ return q.status !== 'declined'; });
    const acc = qs.filter(function(q){ return q.status === 'accepted'; }), use = acc.length ? acc : qs;
    const out = use.map(function(q){ return { lines: arr(q.lines).map(function(l){ return { desc: s(l.desc), spec: s(l.spec), qty: num(l.qty), unit: s(l.unit) }; }).filter(function(l){ return l.desc; }), leadTime: s(q.leadTime) }; }).filter(function(q){ return q.lines.length; });
    return out.length ? Object.assign({}, j, { supplierMaterials: out }) : j;
  });
}
async function loadKey(who, key, ctx){
  const parts = key.split(':');
  const head = parts[0];
  if (key === 'planreqs') {   /* plans requests: GrayCo sees all, a sub only their own */
    if (who.isAdmin) return (await listRows([eq('collection', 'planreqs')])).map(function(r){ return r.data; });
    if (!who.profile) return [];
    if (!who.approved) return [];
    return (await listRows([eq('collection', 'planreqs'), eq('user_id', who.profile.id)])).map(function(r){ return subReqView(r.data); });   /* patch PLANREQ: their own, never anyone else's */
  }
  if (COLLECTIONS.indexOf(key) > -1) {
    if (who.isAdmin) {
      if (key === 'users') { const us = await staffUsers(), se = await seniorEst(ctx);   /* patch BIDEST: who the Senior Estimator is (the edit form's default) */
        return us.map(function(u){ return se.id && u && u.id === se.id && u.role === 'admin' ? Object.assign({}, u, { seniorEstimator: true }) : u; }); }
      if (key === 'jobs') {   /* patch BIDPO: the CRM's PO on every job (+ what an admin needs to link one) */
        const list = (await listRows([eq('collection', 'jobs')])).map(function(r){ return r.data; });
        const ps = await poSync(list, { by: who.email });
        return estFill(ps.jobs.map(function(j){ return poView(j, j && ps.info[j.id], ps.data); }), ctx);   /* patch BIDEST */
      }
      return (await listRows([eq('collection', key)])).map(function(r){ return r.data; });
    }
    const sc = ctx.scope || (ctx.scope = await subScope(who));
    if (key === 'users') {
      const all = await listRows([eq('collection', 'users')]);
      const staff = new Set((await staffList()).map(function(x){ return x.email; }));
      return all.filter(function(r){ return r.id === sc.me || (r.data.role === 'admin' && staff.has(low(r.email))); })
        .map(function(r){ return r.id === sc.me ? r.data : pick(r.data, STAFF_PUBLIC_FIELDS); });
    }
    if (key === 'mquotes') return sc.supplier ? sc.myQuotes.map(function(r){ return r.data; }) : [];   /* patch SUPPLIER: their own quotes only */
    if (key === 'jobs' && sc.supplier) {   /* patch SUPPLIER */
      const ps = await poSync(Object.keys(sc.jobs).map(function(id){ return sc.jobs[id].data; }), { noAssign: true, by: 'bidpo-sync' });
      return (await estFill(ps.jobs, ctx)).map(function(j){ const v = supplierJobView(j); v.quotable = !!sc.quotable[j.id]; return v; });
    }
    if (key === 'bids' && sc.supplier) return [];
    if (key === 'jobs') { const tr = who.profile && Array.isArray(who.profile.trades) ? who.profile.trades : [];   /* patch SYS2 */
      const ps = await poSync(Object.keys(sc.jobs).map(function(id){ return sc.jobs[id].data; }), { noAssign: true, by: 'bidpo-sync' });   /* patch BIDPO: the CRM's PO (never a new one from a sub's load) */
      return withSupplierMaterials((await estFill(ps.jobs, ctx)).map(function(j){   /* patch BIDEST: the Senior Estimator next to the PM · patch BIDSITE3: + supplier materials */
        const v = subJobView(j, tr);
        if (!v.biddingClosed && dueOver(j)) { v.biddingClosed = true; v.pastDue = true; }   /* patch SUBFLOW: past the due date → the bid site shows "Bidding is closed" (the server refuses it too) */
        if (ps.data && !(v.siteWalk && v.siteWalk.date)) { try { const w = BPO().crmSiteWalk(j, ps.data); if (w) v.siteWalk = { date: w.date, time: w.time, location: w.location, mandatory: w.mandatory }; } catch (e) {} }   /* the CRM's site walk when the bid site has none */
        return v;
      })); }
    if (key === 'acks') return (await listRows([eq('collection', 'acks'), eq('user_id', sc.me)])).map(function(r){ return r.data; });
    if (key === 'bids') return bidsWithResults(sc);
    if (key === 'messages') {
      if (!who.approved) return [];
      const own = (await listRows([eq('collection', 'messages'), eq('user_id', sc.me)])).map(function(r){ return r.data; });
      return own.concat(await crmReplies(who, sc).catch(function(){ return []; }));   /* patch SUBMSG: GrayCo's replies in the CRM job's messages */
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
    if (!who.isAdmin) { const sc = ctx.scope || (ctx.scope = await subScope(who)); if (!sc.jobs[parts[1]]) return [];
      const r0 = await getRow('plans', parts[1]); return r0 ? subPlans(r0.data.items, sc.jobs[parts[1]].data) : []; }   /* patch BIDVIS */
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
    const items = r ? arr(r.data.items) : [];
    if (who.isAdmin || !who.profile || who.isSupplier) return items;
    return withCrmPapers(who.profile, items);   /* patch PAPERS1: the CRM sub record is the truth — a newer paper on file there shows (and counts) here */
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
        rec.role = staff.has(rec.email) ? 'admin' : (old && old.role === 'admin' ? 'former' : ((old ? old.role : rec.role) === 'supplier' ? 'supplier' : 'sub'));   /* patch SUPPLIER: a supplier stays one */
        if (old) { rec.authUserId = old.authUserId; rec.createdAt = old.createdAt || rec.createdAt; }
        if (old) ['signinDisabled', 'signinDisabledAt', 'signinDisabledBy', 'signedOutAt', 'signedOutBy', 'tempPasswordAt', 'tempPasswordBy'].forEach(function(k){ if (old[k] !== undefined) rec[k] = old[k]; else delete rec[k]; });   /* patch SUBACCT: only Admin → 🔐 Sub portal accounts sets these */
        if ((rec.role === 'sub' || rec.role === 'supplier') && rec.approved === true && old && old.approved !== true) notes.push({ kind: 'approved', user: rec });
        rows.push(rowFor('users', rec));
      }
      for (const id of del) {
        const old = existing[id] && existing[id].data;
        if (!old || old.role === 'admin') continue;
        dropKeys.push('users/' + id, 'subdocs/' + id);
        if (old.authUserId && !staff.has(low(old.email))) await deleteAuthUser(old.authUserId);
      }
    } else {
      let poD = null, poAll = [];   /* patch BIDPO: the CRM's lists for the PO of the jobs being saved */
      if (key === 'jobs' && upsert.length) { try { poD = await poData(); poAll = (await listRows([eq('collection', 'jobs')])).map(function(r){ return r.data || {}; }); } catch (e) { poD = null; } }
      if (key === 'questions') {
        const jobNums = {};
        for (const rec0 of upsert) {
          const old = existing[rec0.id] && existing[rec0.id].data;
          const rec = Object.assign({}, old || {}, rec0);
          if (old) ['userId', 'userName', 'userCompany', 'at', 'body', 'attachments'].forEach(function(k){ rec[k] = old[k]; });   /* what the sub asked stays as asked */
          rec.visibility = rec.visibility === 'public' ? 'public' : 'private';
          if (s(rec.answer) && (!old || s(old.answer) !== s(rec.answer))) { rec.answeredAt = new Date().toISOString(); rec.answeredBy = who.profile && who.profile.name || who.email; notes.push({ kind: 'sf-done', what: 'question', id: rec.id, by: who.email }); }   /* patch SUBFLOW: its To-Do is done */
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
      } else if (key === 'mquotes') {   /* patch SUPPLIER: GrayCo marks a material quote accepted / declined (with a note); the supplier's lines stay as sent */
        for (const rec0 of upsert) {
          const old = existing[rec0.id] && existing[rec0.id].data; if (!old) continue;
          const st = MQ_STATUS.indexOf(s(rec0.status)) > -1 ? s(rec0.status) : old.status;
          const rec = Object.assign({}, old, { status: st, gcNote: s(rec0.gcNote).slice(0, 2000) });
          if (st !== old.status) { rec.decidedAt = new Date().toISOString(); rec.decidedBy = who.email; }
          if (st === 'accepted' && old.status !== 'accepted' && !old.acceptMailedAt && okEmail(low(old.userEmail))) { rec.acceptMailedAt = new Date().toISOString(); notes.push({ kind: 'accepted-mail', email: low(old.userEmail), jobId: s(old.jobId), quote: true }); }   /* patch BIDSITE3 C */
          rows.push(rowFor('mquotes', rec));
        }
      } else upsert.forEach(function(rec){
        if (key === 'jobs') {   /* patch LD2: a draft stays a draft until "Publish to bid portal" */
          const old = existing[rec.id] && existing[rec.id].data;
          const publish = rec._publish === true; delete rec._publish;
          if (old) ['leadInbox', 'specDocs', 'sourceLink', 'createdBy', 'createdByName', 'createdAt', 'resultMailed', 'dueReminderAt'].forEach(function(k){ if (rec[k] === undefined && old[k] !== undefined) rec[k] = old[k]; });   /* + patch BIDSITE3: the e-mail stamps */
          if (rec.showSupplierMaterials !== undefined) rec.showSupplierMaterials = rec.showSupplierMaterials === true;
          /* patch BIDSITE3 C: marked WON / LOST → the result e-mails (each once per job; their switches decide) */
          if (old && !isDraft(old) && low(rec.status) !== low(old.status) && /^(won|lost)$/i.test(s(rec.status))) {
            const kind = low(rec.status), rm = Object.assign({}, rec.resultMailed || {});
            if (!rm[kind]) { rm[kind] = new Date().toISOString(); rec.resultMailed = rm; notes.push({ kind: 'job-result', result: kind, job: rec }); }
          }
          /* patch BIDSITE3 C: an addendum published on the bid site → "Addendum #n posted" (when switched on) */
          if (old && !isDraft(old)) arr(rec.addenda).forEach(function(a){ if (a && a.publishedAt && !arr(old.addenda).some(function(o){ return o && o.publishedAt && Number(o.num) === Number(a.num); })) notes.push({ kind: 'addendum-mail', job: rec, add: a }); });
          /* patch BIDPO: nobody types a PO on the bid site — it and the CRM link are the server's (🔗 Link to CRM job is its own action) */
          if (rec._estAuto === true) rec.estimatorId = old ? s(old.estimatorId) : '';   /* patch BIDEST: the shown default is not saved as a pick */
          delete rec._estAuto;
          delete rec._po; const detailsSave = rec._detailsSave === true || typeof rec._detailsSave === 'number'; delete rec._detailsSave;
          PO_FIELDS.forEach(function(k){ if (old && old[k] !== undefined) rec[k] = old[k]; else delete rec[k]; });
          if (poD && arr(poD.projects).length && !isGone(rec)) { const pr = BPO().apply(rec, poD, { jobs: poAll.concat(rows.map(function(x){ return x.data; })), by: who.email }); Object.keys(rec).forEach(function(k){ if (!(k in pr.job)) delete rec[k]; }); Object.assign(rec, pr.job); }
          /* the site walk / questions deadline set on ✎ Edit Job Details: kept clean; subs who can see the job hear through the same
             automatic update as 📂 Manage → Details (on the bid site at once, the e-mail waits on ✅ Approvals) */
          if (rec.siteWalk && typeof rec.siteWalk === 'object') { const w = rec.siteWalk; rec.siteWalk = { date: day10(w.date), time: /^\d{2}:\d{2}$/.test(s(w.time)) ? s(w.time) : '', location: s(w.location).slice(0, 240), mandatory: w.mandatory === true, rsvp: arr(w.rsvp).length ? arr(w.rsvp) : arr(old && old.siteWalk && old.siteWalk.rsvp) }; if (!rec.siteWalk.rsvp.length) delete rec.siteWalk.rsvp; }
          if (rec.questionsDue !== undefined) rec.questionsDue = day10(rec.questionsDue);
          if (detailsSave && old && !isDraft(old) && !isGone(old)) {
            const pubW = function(x){ x = x || {}; return JSON.stringify([day10(x.date), s(x.time), s(x.location), x.mandatory === true]); }, lines = [];
            if (pubW(old.siteWalk) !== pubW(rec.siteWalk)) { const w = rec.siteWalk || {}; lines.push(day10(w.date) ? 'Site walk / pre-bid meeting: ' + day10(w.date) + (w.time ? ' ' + w.time : '') + (w.location ? ' at ' + w.location : '') + (w.mandatory ? ' (mandatory)' : '') : 'The site walk was taken off'); }
            if (day10(old.questionsDue) !== day10(rec.questionsDue)) lines.push('Questions due by ' + (day10(rec.questionsDue) || '— (no deadline)'));
            if (lines.length) notes.push({ kind: 'details-changed', jobId: rec.id, lines: lines, who: { email: who.email, name: s(who.profile && who.profile.name) || who.email } });
          }
          /* patch BIDPO (decision 6): ✎ Edit Job Details on a job linked to a CRM job → its ONE "Site walk / pre-bid" schedule item */
          if (detailsSave && (s(rec.crmProjectId) || (old && old.siteWalk && day10(old.siteWalk.date)))) notes.push({ kind: 'crm-sitewalk', jobId: rec.id, by: s(who.profile && who.profile.name) || who.email });
          if (publish && (isDraft(old) || isDraft(rec))) {
            Object.assign(rec, { status: 'open', visibility: 'public', draft: false, publishedAt: new Date().toISOString(), publishedBy: who.email });
          } else if (isDraft(old) || (!old && isDraft(rec))) {
            Object.assign(rec, { status: 'draft', visibility: 'private', draft: true });
          }
          if (old && arr(rec.plansLinks).length > arr(old.plansLinks).length) notes.push({ kind: 'plans-added', jobId: rec.id });
          if (old && !isDraft(old) && (s(old.bidDueDate).slice(0, 10) !== s(rec.bidDueDate).slice(0, 10) || s(old.bidDueTime) !== s(rec.bidDueTime)))   /* patch PLANREQ-D: the bid due date changed on the bid site */
            notes.push({ kind: 'due-changed', jobId: rec.id, from: s(old.bidDueDate).slice(0, 10) ? s(old.bidDueDate).slice(0, 10) + (s(old.bidDueTime) ? ' ' + s(old.bidDueTime) : '') : 'no due date', who: { email: who.email, name: s(who.profile && who.profile.name) || who.email } });   /* patch PLANREQ: a 🔗 plan link added on the bid site → whoever asked hears */
        }
        if (key === 'messages' && !existing[rec.id] && rec.senderRole !== 'sub' && rec.recipientSubId) notes.push({ kind: 'message-to-sub', msg: rec });
        if (key === 'bids') {   /* patch BIDSITE3 C: an admin accepts a sub's bid on the bid site → "Your bid was accepted" (once; the CRM's 🏆 Award stamps the same) */
          const old = existing[rec.id] && existing[rec.id].data;
          if (old && old.awardMailedAt && !rec.awardMailedAt) rec.awardMailedAt = old.awardMailedAt;
          if (rec.accepted === true && !(old && old.accepted === true) && !rec.awardMailedAt && okEmail(low(rec.userEmail || (old && old.userEmail)))) { rec.awardMailedAt = new Date().toISOString(); notes.push({ kind: 'accepted-mail', email: low(rec.userEmail || old.userEmail), jobId: s(rec.jobId || (old && old.jobId)), quote: false }); }
        }
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
    } else if (key === 'bids' && who.isSupplier) {
      if (upsert.length) throw Fail(403, 'Suppliers send material quotes, not labour bids.');   /* patch SUPPLIER */
    } else if (key === 'mquotes') {   /* patch SUPPLIER: a supplier's material quote — only on a job open for material quotes */
      if (!who.isSupplier) { if (upsert.length) throw Fail(403, 'Material quotes are for supplier accounts.'); }
      else for (const x of upsert) {
        const old = existing[x.id];
        if (old && old.user_id !== me) continue;
        const prev = old ? old.data : null;
        const jobId = prev ? prev.jobId : s(x.jobId);
        if (prev && prev.status && prev.status !== 'submitted') throw Fail(409, 'GrayCo has already decided on this quote; it can no longer be changed.');
        if (!sc.quotable[jobId]) throw Fail(403, 'This job is not open for material quotes.');
        checkRefs(x, prev, me);
        const lines = mqLines(x.lines);
        if (!lines.length) throw Fail(400, 'Add at least one line to the quote.');
        const q = Object.assign({}, prev || {}, {
          id: x.id, jobId: jobId, userId: me, userName: p.name, userCompany: p.company, userEmail: p.email, userPhone: p.phone || '',
          lines: lines, subtotal: money(lines.reduce(function(t, l){ return t + l.total; }, 0)), tax: money(x.tax), freight: money(x.freight),
          leadTime: s(x.leadTime).slice(0, 120), validUntil: day10(x.validUntil), notes: s(x.notes).slice(0, 4000), docs: arr(x.docs).slice(0, 10),
          status: 'submitted', submittedAt: prev ? prev.submittedAt : new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        q.total = money(q.subtotal + q.tax + q.freight);
        if (!prev) notes.push({ kind: 'new-mquote', q: q, job: sc.jobs[jobId] && sc.jobs[jobId].data });
        rows.push(rowFor('mquotes', q));
      }
      del.forEach(function(id){ const old = existing[id]; if (who.isSupplier && old && old.user_id === me && s(old.data.status || 'submitted') === 'submitted') dropKeys.push('mquotes/' + id); });
    } else if (key === 'bids') {
      /* PAPERS (owner 11/11: "have to have valid credentials in the portal before a bid is accepted"): the server checks too, not only the page */
      if (upsert.length) { const miss = await papersMissing(me, p); if (miss) throw Fail(403, miss); }
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
        ['trade', 'inclusions', 'exclusions', 'notesOwn'].forEach(function(k){ if (x[k] !== undefined) b[k] = s(x[k]).slice(0, k === 'trade' ? 80 : 4000); });   /* patch BIDMULTI: the sub portal's bid form (the bid site's own page leaves them as they are) */
        if (!s(b.trade)) { const jt = (function(j){ return (Array.isArray(j.tradesSought) ? j.tradesSought.map(function(z){ return s(z && typeof z === 'object' ? z.trade : z); }) : s(j.tradesSought).split(/\s*[,;\n]\s*/)).concat((Array.isArray(j.tradeScopes) ? j.tradeScopes : []).map(function(z){ return s(z && z.trade); })).filter(Boolean); })((sc.jobs[jobId] && sc.jobs[jobId].data) || {});
          const hit = jt.filter(function(z, i){ return jt.indexOf(z) === i && tradeFit({ tradesSought: z }, p); }); if (hit.length === 1) b.trade = hit[0].slice(0, 80); }   /* patch SUBFLOW: a bid-site bid (no trade box) gets the job's trade that is theirs, when there is exactly one — so 🏆 Award marks the other bids of that trade Not selected and 📨 Bids compares it by trade */
        if (Array.isArray(x.lines)) b.lines = bidLines(x.lines, sc.jobs[jobId] && sc.jobs[jobId].data);
        if (x.attachTakeoff === true) {   /* patch MEASURE: 📐 Attach my takeoff — the totals of their own saved takeoffs on this job (made here, never typed in) */
          const tr = (await listRows([eq('collection', 'takeoffs'), eq('user_id', me), eq('job_id', jobId)])).map(function(r){ return r.data || {}; });
          const tt = TK().totals(tr).slice(0, 80); if (tt.length) { b.takeoff = tt; b.takeoffAt = new Date().toISOString(); }
        } else if (x.attachTakeoff === false) { delete b.takeoff; delete b.takeoffAt; }   /* patch PLANREQ-E: the bid form's line items, filled in by the sub */
        ['_rank', '_total', '_amounts'].forEach(function(k){ delete b[k]; });
        if (prev && prev.read && JSON.stringify(arr(prev.docs)) !== JSON.stringify(arr(b.docs))) delete b.read;   /* patch SUBSIMPLE: a new PDF → GrayCo reads it again ("Not read yet") */
        if (!prev && x.via === 'portal') b.via = 'portal';   /* patch SUBFLOW: sent from the sub portal's 📋 Jobs to bid */
        if (!prev) notes.push({ kind: 'new-bid', bid: b, job: sc.jobs[jobId] && sc.jobs[jobId].data });
        rows.push(rowFor('bids', b));
      }
      del.forEach(function(id){
        const old = existing[id];
        if (old && old.user_id === me && !old.data.accepted) dropKeys.push('bids/' + id);
      });
    } else if (key === 'messages') {
      const crmRead = upsert.filter(function(x){ return /^crm_M/.test(s(x.id)) && Array.isArray(x.readBy) && x.readBy.indexOf(me) > -1; }).map(function(x){ return s(x.id).slice(4); });
      if (crmRead.length) await crmMarkRead(who, crmRead).catch(function(){});   /* patch SUBMSG: a CRM reply they opened → read in the CRM */
      for (const x of upsert) {
        if (/^crm_/.test(s(x.id))) continue;
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
        notes.push({ kind: 'message-from-sub', msg: m, job: sc.jobs[jobId].data, prof: p });
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
        if (x.via === 'portal') q.via = 'portal';   /* patch SUBFLOW: asked from the sub portal's 📋 Jobs to bid */
        notes.push({ kind: 'new-question', q: q, job: sc.jobs[jobId].data });
        rows.push(rowFor('questions', q));
      }
    } else if (key === 'acks') {   /* patch SYS2: "I acknowledge addendum #n" — only for a published addendum of a job they may see */
      if (!who.approved) throw Fail(403, 'Your account is waiting for GrayCo to approve it.');
      for (const x of upsert) {
        const jobId = s(x.jobId), n = parseInt(x.num, 10);
        const jr = sc.jobs[jobId]; if (!jr || !(n > 0)) continue;
        if (!arr(jr.data.addenda).some(function(a){ return a && a.publishedAt && Number(a.num) === n; })) continue;
        const id = jobId + '__a' + n + '__' + me;
        if (existing[id]) continue;
        rows.push(rowFor('acks', { id: id, jobId: jobId, num: n, userId: me, userName: p.name, userCompany: p.company, userEmail: p.email, at: new Date().toISOString() }));
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
/* patch PLANREQ-E: a sub's answers to the job's bid form (only its own line ids; a price per line, a note) */
function bidLines(v, job){
  const ids = {}; arr(job && job.bidForm).forEach(function(x){ if (x && x.id) ids[x.id] = x; });
  return arr(v).filter(function(l){ return ids[s(l.id)]; }).slice(0, 80).map(function(l){ const f = ids[s(l.id)]; return { id: s(l.id), trade: s(f.trade), item: s(f.item), unit: s(f.unit), amount: l.amount === '' || l.amount == null ? null : num(l.amount), note: s(l.note).slice(0, 300) }; });
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
    value = arr(value).filter(function(d){ return d && !d.fromCrm; });   /* patch PAPERS1: what the CRM has on file is shown, never saved back here */
    if (!who.isAdmin) checkRefs({ items: arr(value) }, old && old.data, who.profile.id);
    row = { collection: 'subdocs', id: parts[1], user_id: parts[1], data: { items: arr(value) } };
    if (!who.isAdmin) {   /* patch PAPERS1: a new paper → the CRM sub record (the same road as the sub portal's Papers → ✅ Approvals Read & confirm) */
      const had = new Set(arr(old && old.data && old.data.items).map(function(d){ return s(d && d.id); }));
      const added = value.filter(function(d){ return d && d.fileRef && !had.has(s(d.id)) && /^(w9|insurance_general|insurance_workers_comp|license)$/.test(s(d.type)); }).map(function(d){ return s(d.id); });
      if (added.length) { const prof = who.profile; ctx.afterSave = function(){ return require('./portal-access.js')._papers.bidPapersToCrm(prof, added); }; }
    }
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
  { const ux = users.find(function(r){ return low(r.email) === email; });
    if (ux && svUnconfirmed(ux.data)) return svResend(email);   /* SIGNUPVERIFY: not confirmed yet → a fresh link to that mailbox (same answer) */
    if (ux) throw Fail(409, 'That e-mail already has a portal account. Sign in, or use "Forgot password".'); }
  /* patch PORTALTEAM: a business e-mail on an approved company's domain joins that company at once (its access, its jobs); a free-mail
     sign-up naming an approved company asks to join it (the office decides in 🔐 Sub portal accounts) and keeps its own sign-up meanwhile */
  let teamRows = []; try { teamRows = await TEAM().all(); } catch (e) { teamRows = []; }
  { const vr = teamRows.find(function(m){ return low(m.email) === email && m.primary !== true && m.status === 'verify'; });   /* SECURITY: signed up on the domain, not confirmed yet → a fresh 24-hour link to that mailbox */
    if (vr) { const nv = await TEAM().reVerify(vr, email); await teamConfirmMail(nv.member, nv.token); return { ok: true, approved: false, verify: true, joined: s(vr.companyName), message: TEAM_VERIFY_MSG }; } }
  if (teamRows.some(function(m){ return low(m.email) === email && m.primary !== true && (m.status === 'active' || m.status === 'requested'); })) throw Fail(409, 'That e-mail is already on a company\'s portal team. Sign in, or use "Forgot password".');
  const roleWanted = p.acctType === 'supplier' ? 'supplier' : 'sub';
  /* a sign-up GrayCo invited (link or an open invite to this e-mail) keeps its own invited account, as before */
  const invitedFirst = !!body.invite || (await listRows([eq('collection', 'invites'), eq('email', email)])).some(function(r){ return !(r.data || {}).usedAt; });
  const tmatch = invitedFirst ? {} : TEAM().signupMatch(email, p.company, users.map(function(r){ return r.data || {}; }).filter(function(u){ return u.role === roleWanted; }), sameCompany, teamRows);
  if (tmatch.join) return teamJoin(email, pw, p, tmatch.join);
  if (!body.force) {
    // Possible duplicates: only the company name and why it matched go back — no contact details.
    const digits = function(v){ return s(v).replace(/\D/g, ''); };
    const dupes = users.filter(function(r){ return r.data.role === (p.acctType === 'supplier' ? 'supplier' : 'sub'); }).map(function(r){
      const u = r.data, why = [];
      if (sameCompany(p.company, u.company) || (p.dbaName && sameCompany(p.dbaName, u.company)) || (u.dbaName && sameCompany(p.company, u.dbaName))) why.push('company name');
      if (p.businessAddress && u.businessAddress && norm(p.businessAddress) === norm(u.businessAddress)) why.push('address');
      if (digits(p.phone).length >= 7 && digits(p.phone) === digits(u.phone)) why.push('phone');
      if (p.einLast4 && u.einLast4 && s(p.einLast4) === s(u.einLast4) && why.length) why.push('EIN');
      return why.length ? { company: u.company, dbaName: u.dbaName || '', reasons: why } : null;
    }).filter(Boolean).slice(0, 5);
    if (dupes.length) return { duplicates: dupes };
  }
  let inv = body.invite ? await findInvite(body.invite, body.job) : null;
  let invited = !!(inv && (!inv.data.email || low(inv.data.email) === email || /^sms:/.test(low(inv.data.email))));   /* patch BIDINVITE: a texted sign-up link ("sms:<cell>") */
  /* patch BIDSITE3 (owner 11/20) A: a sub we INVITED is approved on sign-up — by the invite link, or by an invite to the same e-mail
     (the newest open invite); a self sign-up still waits for an admin; a SUPPLIER sign-up is approved at once */
  if (!invited) {
    const byMail = (await listRows([eq('collection', 'invites'), eq('email', email)])).filter(function(r){ const j = r.data || {}; return !j.usedAt; })
      .sort(function(a, b){ return s(b.data && b.data.createdAt).localeCompare(s(a.data && a.data.createdAt)); });
    if (byMail[0]) { inv = byMail[0]; invited = true; }
  }
  const supplierAcct = p.acctType === 'supplier';

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
    username: email, email: email, role: p.acctType === 'supplier' ? 'supplier' : 'sub', approved: invited || supplierAcct,   /* patch SUPPLIER: a supplier account · patch BIDSITE3: approved at once */
    approvedAuto: supplierAcct ? 'supplier' : invited ? (inv.job_id === 'signup' ? 'signup-link' : 'invited') : undefined,   /* patch BIDINVITE: + a 📨 sign-up link */
    name: clip(p.name, 80), phone: clip(p.phone, 40), contactTitle: clip(p.contactTitle, 80),
    company: clip(p.company, 120), dbaName: clip(p.dbaName, 120),
    businessAddress: clip(p.businessAddress), businessCity: clip(p.businessCity, 80),
    businessState: clip(p.businessState, 2).toUpperCase(), businessZip: clip(p.businessZip, 10),
    website: clip(p.website), yearsInBusiness: p.yearsInBusiness ? parseInt(p.yearsInBusiness, 10) || null : null,
    numEmployees: p.numEmployees ? parseInt(p.numEmployees, 10) || null : null,
    unionAffiliation: clip(p.unionAffiliation, 20), serviceArea: clip(p.serviceArea), licenseNumbers: clip(p.licenseNumbers, 400),
    einLast4: s(p.einLast4).replace(/\D/g, '').slice(0, 4),
    trades: (Array.isArray(p.trades) ? p.trades : []).map(function(x){ return clip(x, 60); }).filter(Boolean).slice(0, 30),
    invitedJobId: invited && inv.job_id !== 'signup' ? inv.job_id : undefined,   /* patch BIDINVITE: a sign-up link has no job */
    vetPending: invited && !supplierAcct ? true : undefined,   /* SUBSIGNUP: (owner 11/16) an invited sub sees that job at once, but GrayCo still checks them: a card in ✅ Approvals */
    lang: s(p.lang) === 'es' ? 'es' : 'en',   /* patch SIGNUPPAPERS: their language, and the papers they SAY they have (not papers on file) */
    papersClaimed: (function(c){ c = c && typeof c === 'object' ? c : {}; return { w9: c.w9 === true, gl: c.gl === true, wc: c.wc === true, wcExempt: c.wcExempt === true, at: new Date().toISOString() }; })(p.papersClaimed),
    createdAt: new Date().toISOString()
  };
  if (tmatch.ask) profile.wantsJoin = { companyId: s(tmatch.ask.id), company: clip(tmatch.ask.company, 120), at: profile.createdAt };   /* patch PORTALTEAM */
  /* SIGNUPVERIFY (owner 11/23: "Yes subs should confirm their email"): only the invite link e-mailed to THIS address proves the mailbox;
     every other sign-up is held — no approval, no invited job, no papers token, no office card — until the confirm link is used */
  const svProven = !!(body.invite && invited && inv && low(inv.data && inv.data.email) === email);
  const svTok = svProven ? '' : svHold(profile, invited ? inv : null);
  if (svProven) { profile.emailVerifiedAt = profile.createdAt; profile.emailVerifiedVia = 'invite-link'; }
  try { await upsertRows([rowFor('users', profile)], email); }
  catch (e) { if (profile.authUserId) await deleteAuthUser(profile.authUserId); throw e; }
  if (svTok) { const sent = await svMail(profile, svTok); return { ok: true, approved: false, verify: true, sent: !!sent, message: SV_MSG }; }   /* SIGNUPVERIFY */
  if (tmatch.ask) { try { await TEAM().add(TEAM().keySub(tmatch.ask.id), { name: p.name, email: email, phone: p.phone }, { email: email, name: s(p.name), role: 'signup' }, { kind: 'sub', companyName: tmatch.ask.company, status: 'requested', via: 'request', primary: { email: tmatch.ask.email, phone: tmatch.ask.phone } }); } catch (e) { console.warn('[subportal] join request', e.message); } }
  if (invited) await upsertRows([rowFor('invites', Object.assign({}, inv.data, { usedAt: new Date().toISOString(), usedBy: profile.id }))], email);
  try { await notify({ kind: 'registered', user: profile }); } catch (e) { console.warn('[subportal] mail', e.message); }
  return { ok: true, approved: profile.approved, paperToken: paperToken(profile.id) };   /* patch SIGNUPPAPERS: upload the papers right after signing up */
}
/* ═══ SIGNUPVERIFY — a self sign-up confirms its mailbox (one-time link, only its SHA-256 kept, 24 h, POST to confirm) ═══
   Grandfathered at read time: only a profile made by register() after this change carries emailUnverified; every older account
   has no flag and is confirmed. Until confirmed the account gets nothing (bid site, portal, pending page, papers, office card). */
const SV_MSG = 'Check your e-mail to confirm it — tap the link we sent (it works for 24 hours). No e-mail? Tap "Resend link", or sign up again with the same e-mail.';
function svUnconfirmed(u){ return !!u && u.emailUnverified === true && !s(u.emailVerifiedAt); }
function svHold(profile, inv){
  profile.onConfirm = { approved: profile.approved === true, approvedAuto: profile.approvedAuto, invitedJobId: profile.invitedJobId, vetPending: profile.vetPending, inviteId: inv ? s(inv.id) : '' };
  profile.approved = false; delete profile.approvedAuto; delete profile.invitedJobId; delete profile.vetPending;
  const v = TEAM().verifyToken(); profile.emailUnverified = true; profile.emailVerify = { hash: v.hash, exp: v.exp };
  return v.token;
}
function svUrl(token){ return PORTAL_ORIGIN + '/.netlify/functions/subportal?signup-confirm=' + encodeURIComponent(token); }
async function svMail(prof, token){   /* tagged 'trade': a sub's own sign-up mail — data-entry mode lets it go */
  const es = prof.lang === 'es';
  const html = mailHtml(es ? 'Confirme su correo' : 'Confirm your e-mail', es
    ? ['Hola ' + esc(s(prof.name).split(' ')[0]) + ',', 'Usted creó una cuenta de GrayCo con ' + esc(prof.email) + '. Toque el botón para confirmar que es su correo.', 'El enlace sirve una vez, por 24 horas. Si usted no se registró, ignore este correo.']
    : ['Hi ' + esc(s(prof.name).split(' ')[0] || 'there') + ',', 'You signed up for GrayCo with ' + esc(prof.email) + '. Tap the button to confirm it is your e-mail.', 'The link works once, for 24 hours. If you did not sign up, ignore this e-mail — nothing happens.'],
    { href: svUrl(token), label: es ? 'Confirmar mi correo' : 'Confirm my e-mail' });
  try { return await require('./_lib/custquiet.js').run('trade', function(){ return sendMail(low(prof.email), es ? 'Confirme su correo para GrayCo' : 'Confirm your e-mail for GrayCo', html); }); } catch (e) { return false; }
}
const SV_SEEN = new Map();
async function svResend(email){
  email = low(email); const same = { ok: true, approved: false, verify: true, message: SV_MSG };
  if (!okEmail(email)) return same;
  const last = SV_SEEN.get(email) || 0; if (Date.now() - last < 60e3) return same;   /* one link a minute per address */
  SV_SEEN.set(email, Date.now()); if (SV_SEEN.size > 2000) SV_SEEN.clear();
  const row = (await listRows([eq('collection', 'users'), eq('email', email)]))[0], prof = row && row.data;
  if (!svUnconfirmed(prof)) return same;
  const v = TEAM().verifyToken(), next = Object.assign({}, prof, { emailVerify: { hash: v.hash, exp: v.exp } });
  await upsertRows([rowFor('users', next)], email);
  await svMail(next, v.token);
  return same;
}
async function svConfirm(token){
  token = s(token); if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw Fail(400, 'That confirm link is not right. Tap "Resend link" to get a new one.');
  const h = crypto.createHash('sha256').update(token).digest('hex');
  const row = (await listRows([eq('collection', 'users')])).find(function(r){ const v = r.data && r.data.emailVerify; return v && s(v.hash).length === 64 && crypto.timingSafeEqual(Buffer.from(s(v.hash)), Buffer.from(h)); });
  if (!row || !svUnconfirmed(row.data)) throw Fail(400, 'That confirm link was already used or is not right. Sign in, or tap "Resend link".');
  const u = row.data;
  if (Date.parse(s(u.emailVerify.exp)) < Date.now()) throw Fail(410, 'That confirm link has run out (24 hours). Tap "Resend link" to get a new one.');
  const oc = u.onConfirm || {}, now = new Date().toISOString();
  const prof = Object.assign({}, u, { emailVerifiedAt: now, emailVerifiedVia: 'link' });
  delete prof.emailVerify; delete prof.onConfirm;
  if (oc.approved === true) { prof.approved = true; ['approvedAuto', 'invitedJobId', 'vetPending'].forEach(function(k){ if (oc[k] !== undefined) prof[k] = oc[k]; }); }
  await upsertRows([rowFor('users', prof)], low(prof.email));
  if (oc.inviteId) { try { const ir = await getRow('invites', oc.inviteId); if (ir && ir.data && !ir.data.usedAt) await upsertRows([rowFor('invites', Object.assign({}, ir.data, { usedAt: now, usedBy: prof.id }))], low(prof.email)); } catch (e) {} }
  if (prof.wantsJoin && prof.wantsJoin.companyId) { try { const c = await getRow('users', prof.wantsJoin.companyId); if (c && c.data) await TEAM().add(TEAM().keySub(c.data.id), { name: prof.name, email: prof.email, phone: prof.phone }, { email: prof.email, name: s(prof.name), role: 'signup' }, { kind: 'sub', companyName: c.data.company, status: 'requested', via: 'request', primary: { email: c.data.email, phone: c.data.phone } }); } catch (e) {} }
  try { await notify({ kind: 'registered', user: prof }); } catch (e) { console.warn('[subportal] mail', e.message); }   /* the office's card / e-mail only now */
  return prof;
}
/* patch PORTALTAPS: the confirm pages' link was written with bare \" inside the page script's "…" string — a syntax error, so
   "Confirm my e-mail" (and the team invite's confirm) did nothing; now \\" in the source (\" in the page). */
function svPage(token){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>GrayCo — confirm your e-mail</title>'
    + '<style>body{margin:0;background:#F6F3EC;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#14202E}main{max-width:520px;margin:0 auto;padding:28px 16px}.c{background:#fff;border-radius:14px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.06)}'
    + 'button{margin-top:14px;width:100%;min-height:50px;border:none;border-radius:10px;background:#D4A017;color:#14202E;font:700 17px inherit;cursor:pointer}a{color:#14202E}</style></head><body><main><div class="c" id="c"><h1 style="font-size:22px;margin:0 0 10px">Confirm your e-mail</h1>'
    + '<p>Tap the button to confirm your e-mail and finish your GrayCo sign-up.</p><button id="b" type="button">Confirm my e-mail</button></div></main>'
    + '<script>(function(){var b=document.getElementById("b");b.onclick=function(){b.disabled=true;b.textContent="Confirming…";fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"signup-confirm",token:' + JSON.stringify(token) + '})}).then(function(r){return r.json();}).then(function(j){document.getElementById("c").innerHTML=j.ok?"<h1>✅ Confirmed</h1><p>"+(j.approved?"You can sign in now":"GrayCo reviews new accounts (usually the same day) and e-mails you when you are approved. Then sign in")+" at <a href=\\"' + CUSTOMER_PORTAL_ORIGIN + '/\\">' + CUSTOMER_PORTAL_ORIGIN.replace(/^https:\/\//, '') + '</a> or ' + PORTAL_ORIGIN.replace(/^https:\/\//, '') + '.</p>":"<h1>Hmm</h1><p>"+String(j.error||"That did not work.").replace(/[<>&]/g,"")+"</p>";},function(){b.disabled=false;b.textContent="Try again";});};})();</script></body></html>';
}
/* ═══ end SIGNUPVERIFY ═══ */
/* ── patch SIGNUPPAPERS (owner 11/12: "for expedited approval to our bid portal see if they can enter COI and workman's comp and
   licenses when they sign up") ─ the sub portal's sign-up (portal-app.js) has no bid-site sign-in yet, so register hands back a
   2-hour token for THIS new profile only: signup-upload (a signed upload into u/<id>/, the same 50 MB limit as every portal
   upload) and signup-papers (saved as the profile's subdocs — w9, insurance_general, insurance_workers_comp, license — the same
   record My Documents and the bid-papers check use). The bid site's own sign-up signs in and saves them the normal way. */
/* patch PORTALTEAM: the sign-up joins company `comp` (same business e-mail domain): its own Supabase sign-in + an active team row — no
   profile of its own (the company's approval, papers and jobs are theirs at once) */
async function teamJoin(email, pw, p, comp){
  const cr = await fetch(sbUrl() + '/auth/v1/admin/users', { method: 'POST', headers: H(),
    body: JSON.stringify({ email: email, password: pw, email_confirm: true, user_metadata: { name: s(p.name).slice(0, 80), portal: 'team' } }) });
  if (!cr.ok) {
    const t = await cr.text();
    if (/already|registered|exists/i.test(t)) throw Fail(409, 'That e-mail already has a sign-in. Sign in, or use "Forgot password".');
    if (/password/i.test(t)) throw Fail(400, 'That password is too weak. Use at least 8 characters with letters and numbers.');
    throw Fail(502, 'The sign-in could not be created (' + cr.status + '). Call GrayCo ' + OFFICE_PHONE + '.');
  }
  const au = await cr.json().catch(function(){ return {}; });
  let m;
  /* SECURITY: status 'verify' — no access until the one-time link e-mailed to THIS address is used (24 h). Anyone can type
     bob@<company domain>; only the owner of that mailbox can finish joining. */
  try { m = await TEAM().add(TEAM().keySub(comp.id), { name: p.name, email: email, phone: p.phone }, { email: email, name: s(p.name), role: 'signup' }, { kind: 'sub', companyName: comp.company, via: 'domain', status: 'verify', primary: { email: comp.email, phone: comp.phone } }); }
  catch (e) { const id = s(au.id || (au.user && au.user.id)); if (id) await deleteAuthUser(id); throw e; }
  const sent = await teamConfirmMail(m, m.verifyToken);
  try { await sendMail([process.env.SUBPORTAL_NOTIFY || OFFICE], '👥 ' + s(p.name) + ' is joining ' + s(comp.company) + ' on the portal', mailHtml('New team member (confirming their e-mail)', [
    '<b>' + esc(p.name) + '</b> (' + esc(email) + ') signed up with the same company e-mail domain as <b>' + esc(comp.company) + '</b>. They join that company\'s portal team once they tap the confirm link sent to that address (24 hours).',
    'See or remove them in the CRM: Admin → 🔐 Sub portal accounts → ' + esc(comp.company) + ' → 👥 Team.'], { href: crmUrl(), label: 'Open the CRM' })); } catch (e) {}
  return { ok: true, approved: false, verify: true, sent: !!sent, joined: s(comp.company), memberId: s(m && m.id), message: TEAM_VERIFY_MSG };
}
const TEAM_VERIFY_MSG = 'Check your e-mail: tap the confirm link we sent to finish joining your company on the GrayCo portal (the link works for 24 hours).';
function teamConfirmUrl(token){ return PORTAL_ORIGIN + '/.netlify/functions/subportal?team-confirm=' + encodeURIComponent(token); }
/* the confirm e-mail — tagged 'trade' (a sub sign-up's own mail: data-entry mode lets it go, like the other sub invites) */
async function teamConfirmMail(m, token){
  if (!m || !token || !okEmail(low(m.email))) return false;
  const html = mailHtml('Confirm your e-mail', ['Hi ' + esc(s(m.name).split(' ')[0] || 'there') + ',', 'You signed up for the GrayCo portal with ' + esc(m.email) + '. Tap the button to confirm it is your e-mail and join <b>' + esc(m.companyName) + '</b>\'s team.',
    'The link works once, for 24 hours. If you did not sign up, ignore this e-mail — nothing happens.'], { href: teamConfirmUrl(token), label: 'Confirm my e-mail' });
  try { return await require('./_lib/custquiet.js').run('trade', function(){ return sendMail(low(m.email), 'Confirm your e-mail to join ' + s(m.companyName) + ' on GrayCo', html); }); } catch (e) { return false; }
}
/* the link's page: one button that POSTs the code (a mail scanner opening the link confirms nothing) */
function teamConfirmPage(token){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>GrayCo — confirm your e-mail</title>'
    + '<style>body{margin:0;background:#F6F3EC;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#14202E}main{max-width:520px;margin:0 auto;padding:28px 16px}.c{background:#fff;border-radius:14px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.06)}'
    + 'button{margin-top:14px;width:100%;min-height:50px;border:none;border-radius:10px;background:#D4A017;color:#14202E;font:700 17px inherit;cursor:pointer}a{color:#14202E}</style></head><body><main><div class="c" id="c"><h1 style="font-size:22px;margin:0 0 10px">Confirm your e-mail</h1>'
    + '<p>Tap the button to finish joining your company\'s team on the GrayCo portal.</p><button id="b" type="button">Confirm my e-mail</button></div></main>'
    + '<script>(function(){var b=document.getElementById("b");b.onclick=function(){b.disabled=true;b.textContent="Confirming…";fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"team-confirm",token:' + JSON.stringify(token) + '})}).then(function(r){return r.json();}).then(function(j){document.getElementById("c").innerHTML=j.ok?"<h1>✅ Confirmed</h1><p>You are on "+String(j.company||"your company").replace(/[<>&]/g,"")+"\'s team. Sign in at <a href=\\"' + CUSTOMER_PORTAL_ORIGIN + '/\\">' + CUSTOMER_PORTAL_ORIGIN.replace(/^https:\/\//, '') + '</a> or ' + PORTAL_ORIGIN.replace(/^https:\/\//, '') + ' with your e-mail and password.</p>":"<h1>Hmm</h1><p>"+String(j.error||"That did not work.").replace(/[<>&]/g,"")+"</p>";},function(){b.disabled=false;b.textContent="Try again";});};})();</script></body></html>';
}
const BASE_TRADES = ['Drywall', 'Paint', 'Framing', 'Flooring', 'Tile', 'Roofing', 'Siding', 'Gutters', 'Electrical', 'Plumbing', 'HVAC', 'Concrete', 'Masonry', 'Insulation', 'Ceilings', 'Cabinets', 'Windows & Doors', 'Demolition', 'Landscaping', 'Cleaning', 'Mitigation', 'Abatement'];
let tradeCache = null;
async function tradeList(){
  if (tradeCache && Date.now() - tradeCache.at < 600e3) return tradeCache.v;
  const seen = {}, out = [];
  let extra = []; try { extra = crmSubList(await crmData()).map(function(x){ return s(x && (x.trade || x.cat2)); }); } catch (e) { extra = []; }
  BASE_TRADES.concat(extra.join(',').split(/[,;\/]/)).forEach(function(x){ x = s(x); const k = low(x); if (!x || seen[k] || x.length > 40 || /^(subcontractor|sub|other|vendor)$/i.test(x)) return; seen[k] = 1; out.push(x.charAt(0).toUpperCase() + x.slice(1)); });
  tradeCache = { at: Date.now(), v: out.slice(0, 40) };
  return tradeCache.v;
}
const PAPER_TYPES = ['w9', 'insurance_general', 'insurance_workers_comp', 'license', 'other'];
function paperSig(id, exp){ return crypto.createHmac('sha256', 'signup-papers|' + (svcKey() || 'dev')).update(id + '.' + exp).digest('hex').slice(0, 32); }
function paperToken(id){ const exp = Date.now() + 2 * 3600e3; return id + '.' + exp + '.' + paperSig(id, exp); }
function paperUser(tok){
  const m = /^(u_[A-Za-z0-9]{4,40})\.(\d{10,16})\.([0-9a-f]{32})$/.exec(s(tok)); if (!m) throw Fail(401, 'The sign-up link has expired. Sign in and add your papers in My Documents.');
  if (Number(m[2]) < Date.now()) throw Fail(401, 'The sign-up link has expired. Sign in and add your papers in My Documents.');
  const a = Buffer.from(paperSig(m[1], m[2])), b = Buffer.from(m[3]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw Fail(401, 'The sign-up link is not valid.');
  return m[1];
}
function day10(v){ const d = s(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''; }
function cleanPaper(x, id){
  const type = PAPER_TYPES.indexOf(s(x && x.type)) > -1 ? s(x.type) : '';
  const ref = s(x && x.fileRef); if (!type || ref.indexOf('u/' + id + '/') !== 0 || /\.\./.test(ref)) return null;
  const exempt = type === 'insurance_workers_comp' && x.wcExempt === true;
  const exp = day10(x.expirationDate);
  if ((type === 'insurance_general' || (type === 'insurance_workers_comp' && !exempt)) && !exp) return null;   /* insurance needs its expiration date */
  const o = { id: 'd' + crypto.randomBytes(5).toString('hex'), type: type, label: s(x.label).slice(0, 120), fileName: s(x.fileName).slice(0, 160) || 'file', fileSize: Number(x.fileSize) || 0, fileType: s(x.fileType).slice(0, 80),
    fileRef: ref, expirationDate: exp || null, uploadedAt: new Date().toISOString(), atSignup: true };
  if (exempt) { o.wcExempt = true; o.label = o.label || 'Workers\' comp exemption (sole proprietor)'; }
  if (type === 'license') { o.licState = s(x.licState).toUpperCase().slice(0, 2); o.licType = s(x.licType).slice(0, 80); o.licNumber = s(x.licNumber).slice(0, 60); o.label = o.label || ['License', o.licState, o.licType, o.licNumber].filter(Boolean).join(' '); }
  return o;
}
async function signupUpload(body){
  const id = paperUser(body.paperToken), size = Number(body.size) || 0;
  if (size <= 0 || size > MAX_FILE) throw Fail(413, 'Files can be up to 50 MB.');
  const path = 'u/' + id + '/' + crypto.randomBytes(8).toString('hex') + '-' + safeName(body.name);
  const r = await fetch(sbUrl() + '/storage/v1/object/upload/sign/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'POST', headers: H(), body: '{}' });
  if (!r.ok) throw Fail(502, 'Could not prepare the upload (' + r.status + ').');
  const j = await r.json();
  return { path: path, url: sbUrl() + '/storage/v1' + j.url, apikey: anonKey() };
}
async function signupPapers(body){
  const id = paperUser(body.paperToken);
  const u = await getRow('users', id); if (!u || u.data.role !== 'sub') throw Fail(404, 'That account is gone.');
  const add = arr(body.items).slice(0, 20).map(function(x){ return cleanPaper(x, id); }).filter(Boolean);
  if (!add.length) return { ok: true, saved: 0 };
  const old = await getRow('subdocs', id), have = arr(old && old.data && old.data.items);
  const one = { w9: 1, insurance_general: 1, insurance_workers_comp: 1 };
  const keep = have.filter(function(d){ return !(d && one[d.type] && add.some(function(a){ return a.type === d.type; })); });
  await upsertRows([{ collection: 'subdocs', id: id, user_id: id, data: { items: keep.concat(add) } }], s(u.data.email) || 'signup');
  return { ok: true, saved: add.length };
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
/* patch RESETMAIL (owner 11/13: "the link didn't send to one guy for forgot password … fix this right now"): the bid site's
   "Forgot password?" no longer depends on Supabase's own mailer (it only e-mails a few addresses an hour, and only addresses
   allowed on the Supabase project). The server makes the one-time Supabase reset link (admin generate_link, type recovery)
   and e-mails it from portal@grayco-cs.com through Resend — tagged as a reply the person asked for, so ⏸ data-entry mode
   lets it go. Same answer whether or not the address has an account (no account lookup by strangers). */
const RESET_SEEN = new Map();
function resetBack(v){
  try { const u = new URL(s(v)); const ok = [new URL(PORTAL_ORIGIN).host, 'bids.grayco-cs.com', 'crm.grayco-cs.com', 'graycocrm1.netlify.app'];
    if (u.protocol === 'https:' && ok.indexOf(u.host) > -1) return u.origin + u.pathname; } catch (e) {}
  return PORTAL_ORIGIN + '/';
}
async function resetPassword(body){
  const email = low(body.email);
  if (!okEmail(email)) throw Fail(400, 'Enter the e-mail you signed up with.');
  const now = Date.now(), last = RESET_SEEN.get(email) || 0;
  if (now - last < 45e3) return { ok: true, sent: true };   /* one e-mail per address every 45 s (a double tap) */
  RESET_SEEN.set(email, now); if (RESET_SEEN.size > 2000) RESET_SEEN.clear();
  const back = resetBack(body.back);
  let link = '';
  try {
    const r = await fetch(sbUrl() + '/auth/v1/admin/generate_link', { method: 'POST', headers: H(), body: JSON.stringify({ type: 'recovery', email: email, redirect_to: back }) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    link = s(j.action_link || (j.properties && j.properties.action_link));
    if (!r.ok || !link) { try { console.log('[reset] no link for an address (' + r.status + ')'); } catch (e) {} return { ok: true, sent: true }; }
  } catch (e) { throw Fail(503, 'The sign-in service did not answer. Try again in a minute.'); }
  let es = false;
  try { const rows = await fetch(sbUrl() + '/rest/v1/sp_rows?select=data&collection=eq.users&email=eq.' + encodeURIComponent(email) + '&limit=1', { headers: H() }).then(function(x){ return x.ok ? x.json() : []; }); es = !!(rows[0] && rows[0].data && rows[0].data.lang === 'es'); } catch (e) {}
  const subj = es ? 'Cambie su contraseña de GrayCo Bids' : 'Reset your GrayCo Bids password';
  const html = mailHtml(es ? 'Cambiar la contraseña' : 'Reset your password', es
    ? ['Alguien (esperamos que usted) pidió cambiar la contraseña de ' + esc(email) + ' en bids.grayco-cs.com.', 'Toque el botón para elegir una contraseña nueva. El enlace sirve una sola vez.', 'Si no lo pidió, ignore este correo.']
    : ['Someone (hopefully you) asked to reset the password for ' + esc(email) + ' on bids.grayco-cs.com.', 'Tap the button to choose a new password. The link works once.', 'If you did not ask, you can ignore this e-mail.'],
    { href: link, label: es ? 'Elegir una contraseña nueva' : 'Choose a new password' });
  const ok = await require('./_lib/custquiet.js').run('reply', function(){ return sendMail(email, subj, html); });
  if (!ok) throw Fail(502, 'The e-mail could not be sent. Call GrayCo ' + OFFICE_PHONE + '.');
  return { ok: true, sent: true };
}
async function staffEmailsFor(job){
  const out = [process.env.SUBPORTAL_NOTIFY || OFFICE];
  if (job) [job.postedBy, job.pmEmail].forEach(function(e){ if (okEmail(low(e))) out.push(low(e)); });   /* patch BIDPOST: the person who posted it and its PM hear too */
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
/* patch PLANREQ-B: every common file type (was PDF / pictures / DWG only) — the ZIP itself is unpacked, not stored */
const PLAN_EXT = (function(){ const T = require('./_lib/tradeguess.js').TYPES, o = {}; Object.keys(T).forEach(function(k){ if (k !== 'zip') o[k] = T[k]; }); return o; })();
const ZIP_LIMITS = { files: 300, total: 250 * 1024 * 1024, each: MAX_FILE };
/* patch SUBFLOW: "Addendum 2.pdf", "ADD-01 Revised doors.pdf", "Addendum #3", "Addenda No. 4" → its number (0 = an addendum with no number); null = not an addendum */
function addendumNum(n){
  const w = s(n).replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_]+/g, ' ');
  let m = /\baddend(?:um|a)\b\s*(?:no\.?|number|#)?\s*0*(\d{1,2})\b/i.exec(w) || /(?:^|[^A-Za-z])add\s*[-#.]?\s*0*(\d{1,2})(?:\b|[^0-9])/i.exec(w);
  if (m) return parseInt(m[1], 10);
  return /\baddend(?:um|a)\b/i.test(w) ? 0 : null;
}
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
    if (!PLAN_EXT[ext]) { skipped.push({ name: name, why: 'not a file type a bid job takes' }); continue; }
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
/* patch PLANREQ-B/C (owner 11/12: "make sure I can add all types of files … if I add scopes and plans and specs put them in scopes by trade"):
   every common file type goes on a bid job (PDF, pictures incl. HEIC / TIFF, Word, Excel / CSV, PowerPoint, TXT / RTF, DWG / DXF, ZIP — 50 MB
   each; bigger → a 🔗 link), and each file is sorted (_lib/tradeguess.js — the name, and the start of a PDF / Word / Excel file's text):
     plans  → the job's plans (category Plans or the ZIP folder), linked to the trades a sheet number names (E-101 → Electrical);
     specs  → the plans list, category Specs, linked to their trades (Div 09 → Drywall, Paint, Flooring, Tile, Ceilings);
     scope  → that trade's scope on the job (tradeScopes[].files — a sub sees the scopes of their own trades only); no trade → category Scope.
   The person's choice wins: body.sort { "<ZIP path or file name>": { kind, trades } } (CRM 📂 Manage shows the guesses with a ▾ to change),
   or body.kind / body.trades for one file (a trade's own 📎 Add files). */
function TG(){ return require('./_lib/tradeguess.js'); }
function sortOf(body, key, name, buf){
  const pick = body && body.sort && typeof body.sort === 'object' ? (body.sort[key] || body.sort[name]) : null;
  const want = pick || (body && (body.kind || body.trades) && !body.sort ? { kind: body.kind, trades: body.trades } : null);
  const g = TG().guess(key || name, buf && buf.length <= 20 * 1024 * 1024 ? TG().text(buf, extOf(name)) : '');
  const kind = want && TG().KINDS.indexOf(s(want.kind)) > -1 ? s(want.kind) : g.kind;
  const trades = want && Array.isArray(want.trades) ? want.trades.map(function(x){ return s(x).slice(0, 60); }).filter(Boolean).slice(0, 8) : g.trades;
  return { kind: kind, trades: trades, why: want ? 'picked' : g.why };
}
async function plansGuess(who, body){   /* staff: what each file (or each file inside a ZIP) looks like, before it is saved */
  const ref = s(body.fileRef), name = s(body.name) || ref.split('/').pop(), ext = extOf(name);
  if (!/^staff\/[A-Za-z0-9._\/-]{3,300}$/.test(ref) || ref.indexOf('..') > -1) throw Fail(400, 'Upload the file first.');
  if (ext === 'zip') {
    const z = unzip(await storageGet(ref));
    return { ok: true, zip: true, files: z.files.map(function(f){ const key = (f.folder ? f.folder + '/' : '') + f.name, g = sortOf({}, key, f.name, f.data); return { key: key, name: f.name, folder: f.folder, size: f.data.length, kind: g.kind, trades: g.trades, why: g.why }; }), skipped: z.skipped };
  }
  if (!PLAN_EXT[ext]) throw Fail(400, 'That kind of file can not go on a bid job: ' + name);
  let buf = null; if ((Number(body.size) || 0) <= 20 * 1024 * 1024 && /^(pdf|docx|xlsx|xlsm|pptx|txt|csv|rtf)$/.test(ext)) { try { buf = await storageGet(ref); } catch (e) { buf = null; } }
  const g = sortOf({}, name, name, buf);
  return { ok: true, zip: false, files: [{ key: name, name: name, folder: '', size: Number(body.size) || 0, kind: g.kind, trades: g.trades, why: g.why }] };
}
async function plansImport(who, body){
  const jobId = s(body.jobId), ref = s(body.fileRef);
  if (!okId(jobId)) throw Fail(400, 'Pick a bid job first.');
  const job = await getRow('jobs', jobId); if (!job) throw Fail(404, 'That bid job is not in the bid site.');
  if (!/^staff\/[A-Za-z0-9._\/-]{3,300}$/.test(ref) || ref.indexOf('..') > -1) throw Fail(400, 'Upload the file first.');
  const name = s(body.name) || ref.split('/').pop(), ext = extOf(name);
  /* patch SUBFLOW (owner 11/23: "when I put an addendum it should put it under Addendums on the bid portal"): a file named as an addendum
     is never filed with the plans — it is posted as that addendum (subportal 'addendum-post'); the page asks first */
  if (ext !== 'zip' && addendumNum(name) !== null && body.asPlan !== true) return { ok: true, added: [], scoped: [], skipped: [], total: (await plansOf(jobId)).length, notified: 0,
    addenda: [{ name: name, fileRef: ref, size: Number(body.size) || 0, type: PLAN_EXT[ext] || 'application/octet-stream', num: addendumNum(name) }] };
  const have = await plansOf(jobId), known = {}; have.forEach(function(x){ if (x && x.sha) known[x.sha] = 1; });
  const jd = Object.assign({}, job.data); jd.tradeScopes = arr(jd.tradeScopes).map(function(x){ return Object.assign({}, x, { files: arr(x.files).slice() }); });
  const added = [], skipped = [], toScope = [];
  const place = function(item, srt){
    item.kind = srt.kind; item.trades = srt.trades;
    if (srt.kind === 'scope' && srt.trades.length) { toScope.push(item); return; }
    if (srt.kind === 'specs' && (!item.category || item.category === 'Plans')) item.category = 'Specs';
    if (srt.kind === 'scope') item.category = 'Scope — all subs';   /* patch PLANREQ-I: a scope for every sub, with the plans */
    added.push(item);
  };
  if (ext === 'zip') {
    const z = unzip(await storageGet(ref));
    skipped.push.apply(skipped, z.skipped);
    for (const f of z.files) {
      const sha = crypto.createHash('sha256').update(f.data).digest('hex'), key = (f.folder ? f.folder + '/' : '') + f.name;
      if (known[sha]) { skipped.push({ name: key, why: 'already on the job' }); continue; }
      const path = 'staff/plans/' + jobId + '/' + sha.slice(0, 16) + '-' + safeName(f.name);
      await storagePut(path, f.data, PLAN_EXT[f.ext]);
      known[sha] = 1;
      place({ name: f.name, size: f.data.length, type: PLAN_EXT[f.ext], fileRef: path, category: f.folder || 'Plans', sha: sha, from: name, at: new Date().toISOString(), by: who.email }, sortOf(body, key, f.name, f.data));
    }
  } else if (PLAN_EXT[ext]) {
    let buf = null; if ((Number(body.size) || 0) <= 20 * 1024 * 1024 && !body.sort && !body.kind && /^(pdf|docx|xlsx|xlsm|pptx|txt|csv|rtf)$/.test(ext)) { try { buf = await storageGet(ref); } catch (e) { buf = null; } }
    place({ name: name, size: Number(body.size) || 0, type: PLAN_EXT[ext], fileRef: ref, category: s(body.category).slice(0, 80) || 'Plans', at: new Date().toISOString(), by: who.email }, sortOf(body, name, name, buf));
  } else throw Fail(400, 'That kind of file can not go on a bid job (' + (ext || 'no extension') + '). PDF, pictures, Word, Excel, PowerPoint, text, DWG / DXF or a ZIP.');
  if (added.length) {
    /* the same name twice (A1.pdf in two folders): the folder goes in front, so each one is its own download */
    const names = {}; have.forEach(function(x){ names[low(x.name)] = 1; });
    added.forEach(function(x){ if (names[low(x.name)] && x.category && x.category !== 'Plans') x.name = x.category.split(' / ').pop() + ' — ' + x.name; names[low(x.name)] = 1; });
    await upsertRows([{ collection: 'plans', id: jobId, job_id: jobId, data: { items: have.concat(added) } }], who.email);
    /* the job record lists the plans too (name / size / type / category / trades — what the bid site shows) */
    jd.plans = arr(jd.plans).concat(added.map(function(x){ return { name: x.name, size: x.size, type: x.type, category: x.category, trades: x.trades || [] }; }));
  }
  toScope.forEach(function(x){   /* a scope file → each trade it is for (a new trade box when the job has none yet) */
    x.trades.forEach(function(tr){
      let ts = jd.tradeScopes.find(function(y){ return low(y.trade) === low(tr); });
      if (!ts) { ts = { id: 'ts_' + crypto.randomBytes(4).toString('hex'), trade: tr, scope: '', mode: 'manual', files: [] }; jd.tradeScopes.push(ts); }
      if (!ts.files.some(function(f){ return f.fileRef === x.fileRef; })) ts.files.push({ name: x.name, size: x.size, type: x.type, fileRef: x.fileRef, at: x.at, by: x.by });
    });
  });
  if (added.length || toScope.length) {
    if (toScope.length) { const want = arr([]).concat(s(jd.tradesSought).split(/\s*,\s*/).filter(Boolean)); jd.tradeScopes.forEach(function(ts){ if (s(ts.trade) && !want.some(function(w){ return low(w) === low(ts.trade); })) want.push(s(ts.trade)); }); jd.tradesSought = want.join(', '); }
    jd.updatedAt = new Date().toISOString();
    await upsertRows([{ collection: 'jobs', id: jobId, job_id: jobId, data: jd }], who.email);
  }
  const told = added.length ? await notifyPlanRequests(jobId) : 0;
  const out = function(x){ return { name: x.name, category: x.category, size: x.size, type: x.type, kind: x.kind, trades: x.trades || [] }; };
  return { ok: true, added: added.map(out), scoped: toScope.map(out), skipped: skipped, total: have.length + added.length, notified: told };
}
async function estimatorEmail(job){
  const id = s(job && job.estimatorId);
  if (id) {
    const st = await staffList(); const hit = st.find(function(x){ return staffId(x.email) === id; }); if (hit) return hit.email;
    const r = await getRow('users', id); if (r && r.email) return low(r.email);
  }
  return defaultEstimatorEmail();   /* patch EST4: the Senior Estimator (the Estimator role / Leads ⚙), never a name */
}
async function defaultEstimatorEmail(noOwner){
  let settings = null;
  for (const table of ['gc_lead_inbox_kv', 'gc_kv']) {
    try { const r = await fetch(sbUrl() + '/rest/v1/' + table + '?select=value&key=eq.gc_lead_inbox_settings', { headers: H() }); if (r.ok) { const v = ((await r.json())[0] || {}).value; if (v) { settings = typeof v === 'string' ? JSON.parse(v) : v; break; } } } catch (e) {}
  }
  const sbf = function(path){ return fetch(sbUrl() + '/rest/v1/' + path, { headers: H() }); };
  const r = await require('./_lib/estimator.js').resolve({ sb: sbf, settings: settings || {} });
  return r.email || (noOwner ? '' : ownerEmails()[0] || '');   /* patch PLANREQ: noOwner — the request falls back to office@ instead */
}
function ownerEmails(){ return String(process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(okEmail); }
function loadWebPush(){ try { return require('web-push'); } catch (e) { try { return require('./_lib/staffpush.js').compat(); } catch (x) { return null; } } }   /* AWAY: web-push is not installed — Node's own crypto */
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
/* a shared list in gc_kv (gc_office_tasks, gc_job_messages — JSON text, the CRM's format) changed without losing anybody's save:
   read, change, read again just before writing (changed meanwhile: start over), write, read back (the same careful way portal.js does) */
async function kvListUpd(key, mutate){
  const read = async function(){ const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value,updated_at&key=eq.' + encodeURIComponent(key), { headers: H() }); if (!r.ok) return null; const rows = await r.json().catch(function(){ return null; }); if (!Array.isArray(rows)) return null; let v = rows[0] ? rows[0].value : ''; if (v == null || v === '') v = []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } } return Array.isArray(v) ? { list: v, at: s(rows[0] && rows[0].updated_at) } : null; };
  for (let tries = 0; tries < 5; tries++) {
    const cur = await read(); if (!cur) return { ok: false };
    const m = mutate(clone(cur.list)); if (!m || !m.list) return { ok: true, unchanged: true };
    const again = await read(); if (!again || again.at !== cur.at || JSON.stringify(again.list) !== JSON.stringify(cur.list)) { await new Promise(function(r){ setTimeout(r, 150 + 200 * tries); }); continue; }
    const now = new Date().toISOString();
    const w = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: key, value: JSON.stringify(m.list), updated_at: now }) });
    if (!w.ok) return { ok: false };
    const after = await read(); if (!after || !m.check || m.check(after.list)) return { ok: true };
  }
  return { ok: false };
}
/* the CRM's office to-do list (gc_kv gc_office_tasks, JSON text) — added once per id */
async function officeTodo(id, label, note){
  const has = function(l){ return l.some(function(t){ return t && s(t.id) === id; }); }, now = new Date().toISOString();
  const r = await kvListUpd('gc_office_tasks', function(l){ return has(l) ? null : { list: l.concat([{ id: id, label: label, note: note, addedBy: 'Bid site', addedAt: now, updatedAt: now, done: false }]), check: has }; });
  return !!r.ok;
}
/* ── patch PLANREQ (owner 11/12: "on bid portal if I don't have plans have where sub can request plans or more info and it emails and
   messages the PM or estimator") ─────────────────────────────────────────────────────────────────────────────────────────────────
   A sub (approved, and the job open to them for bids — the same rule as bidding) taps "📩 Request plans / more info" on the bid site's
   job page or the sub portal's 📋 Jobs to bid sheet: what they need (Plans · Specs · Site walk / access · Other) + a note; their company,
   name, phone and e-mail come from their profile. ONE open request per sub per job (planreqs/<jobId>__<userId>; a new one only after the
   last was answered or plans were posted).
   Who hears: the job's PM AND its estimator, whoever is set (the bid job's pmEmail / pmId / estimatorId, else the CRM project's PM and the
   CRM lead's PM / estimator); neither → the person who posted it → the Senior Estimator (Owner setup "Set the default estimator") →
   office@. Each of them gets
     • an e-mail (staff only — it goes in ⏸ data-entry mode too, the same sendMail as the ❓ question e-mail),
     • a 💬 Job Messages post on the job's thread (the CRM project, else the lead, else the bid job) naming them → 🔔 For you,
     • a To-Do "📩 <Sub> asked for plans — <job>" (gc_office_tasks, assignees = them), done when plans / a plan link are added to the job
       or someone taps ✅ Mark sent / ↩ Reply (CRM 🏗 Bid portal → 📂 Manage → 💬 Q&A, bid-hub op planreq).
   Plans added later (a file or a 🔗 link, from the bid site, the CRM drawer, 📢 Put on bid portal or the Lead Inbox): every sub who asked
   gets "Plans are now posted for <job>" on the bid site / sub portal at once, and by e-mail — that e-mail goes to a sub, so ⏸ data-entry
   mode HOLDS it (sent on a later look once the pause is off). Never a price; never another sub's name. */
const PR_NEEDS = { plans: 'Plans', specs: 'Specs', sitewalk: 'Site walk / access', other: 'Other' };
const PR_NEEDS_ES = { plans: 'Planos', specs: 'Especificaciones', sitewalk: 'Visita al sitio / acceso', other: 'Otro' };
function prNeeds(v){ return Array.from(new Set((Array.isArray(v) ? v : []).map(low).filter(function(k){ return PR_NEEDS[k]; }))); }
function prOpen(q){ return !!q && s(q.status) !== 'closed' && !s(q.closedAt) && !s(q.notifiedAt); }
function prWhat(q, es){ const n = prNeeds(q && q.needs); return (n.length ? n : ['plans']).map(function(k){ return (es ? PR_NEEDS_ES : PR_NEEDS)[k]; }).join(', '); }
function prAsk(q){ const n = prNeeds(q && q.needs); return !n.length || n.indexOf('plans') > -1 ? 'plans' : 'more info'; }
function plansCount(job, items){ return arr(items).length + arr(job && job.plansLinks).filter(function(l){ return /^https?:\/\//i.test(s(l && l.url)); }).length; }
function crmUrl(){ const v = s(process.env.CRM_URL).replace(/\/$/, ''); return (/^https:\/\//.test(v) ? v : 'https://crm.grayco-cs.com') + '/'; }
/* what a sub sees of their own request (never who else asked) */
function subReqView(q){ return q ? { jobId: s(q.jobId), at: s(q.at), needs: prNeeds(q.needs).length ? prNeeds(q.needs) : ['plans'], note: s(q.note), status: prOpen(q) ? 'open' : 'closed',
  notifiedAt: s(q.notifiedAt), closedAt: s(q.closedAt), closedHow: s(q.closedHow) || (s(q.notifiedAt) ? 'plans' : ''), reply: s(q.reply), repliedAt: s(q.repliedAt), sentNote: s(q.sentNote) } : null; }
/* the GrayCo people a request goes to: [{ email, name, roles, crmId }] */
async function planReqContacts(job){
  const out = [], seen = {};
  const add = function(email, name, role){ email = low(email); if (!okEmail(email)) return; if (seen[email]) { if (seen[email].roles.indexOf(role) < 0) seen[email].roles.push(role); return; } seen[email] = { email: email, name: s(name), roles: [role], crmId: '' }; out.push(seen[email]); };
  let crm = {}; try { crm = await kvRead(['users', 'projects', 'leads']); } catch (e) { crm = {}; }
  let staff = []; try { staff = await staffList(); } catch (e) { staff = []; }
  const users = arr(crm.users).filter(function(u){ return u && u.active !== false; });
  const byName = function(n){ n = low(n); return n ? users.find(function(u){ return low(u.name) === n; }) || null : null; };
  const byStaffId = function(id){ id = s(id); return id ? staff.find(function(x){ return staffId(x.email) === id; }) || null : null; };
  const proj = s(job.crmProjectId) ? arr(crm.projects).find(function(p){ return p && s(p.id) === s(job.crmProjectId); }) : null;
  const lead = s(job.crmLeadId) ? arr(crm.leads).find(function(l){ return l && s(l.id) === s(job.crmLeadId); }) : null;
  /* the PM */
  let pmE = low(job.pmEmail), pmN = s(job.pmName);
  if (!okEmail(pmE)) { const st = byStaffId(job.pmId); if (st) { pmE = st.email; pmN = pmN || st.name; } }
  if (!okEmail(pmE)) { const u = byName(s(proj && proj.pm) || s(lead && lead.pm)); if (u) { pmE = low(u.email); pmN = s(u.name); } else if (okEmail(low(proj && proj.pmEmail))) pmE = low(proj.pmEmail); }
  add(pmE, pmN, 'PM');
  /* the estimator */
  let esE = '', esN = '';
  const est = byStaffId(job.estimatorId);
  if (est) { esE = est.email; esN = est.name; }
  else if (s(job.estimatorId)) { try { const r = await getRow('users', s(job.estimatorId)); if (r && r.data && r.data.role === 'admin') { esE = low(r.email || r.data.email); esN = s(r.data.name); } } catch (e) {} }
  if (!okEmail(esE)) { const u = byName(s(lead && lead.estimator) || s(proj && proj.estimator)); if (u) { esE = low(u.email); esN = s(u.name); } else if (okEmail(low(lead && lead.estimatorEmail))) esE = low(lead.estimatorEmail); }
  add(esE, esN, 'Estimator');
  /* nobody set: the poster → the Senior Estimator (Owner setup) → the office */
  if (!out.length && !/^(auto|lead-inbox)$/.test(s(job.postedBy))) add(job.postedBy, job.postedByName, 'Posted it');
  if (!out.length) { try { add(await defaultEstimatorEmail(true), '', 'Estimator'); } catch (e) {} }
  if (!out.length) add(process.env.SUBPORTAL_NOTIFY || OFFICE, 'Office', 'Office');
  out.forEach(function(c){
    const u = users.find(function(x){ return low(x.email) === c.email; }) || byName(c.name);
    if (!c.name) c.name = s(u && u.name) || s((staff.find(function(x){ return x.email === c.email; }) || {}).name) || (KNOWN_STAFF[c.email] || {}).name || c.email.split('@')[0];
    c.name = c.name.replace(/\s+/g, ' ').trim(); c.crmId = s(u && u.id);
  });
  return out;
}
/* the CRM side of a new request: a 💬 Job Messages post naming them (→ 🔔 For you) and their To-Do */
async function planReqCrm(job, rec, contacts){
  const pid = s(job.crmProjectId) || s(job.crmLeadId) || ('bidjob:' + s(job.id));
  const contact = [rec.name, rec.phone, rec.email].filter(Boolean).join(' · ');
  const text = '📩 ' + contacts.map(function(c){ return '@' + c.name; }).join(' ') + ' — ' + rec.company + (contact ? ' (' + contact + ')' : '') + ' asked for ' + prWhat(rec).toLowerCase() +
    ' on the bid portal job "' + s(job.title) + '"' + (rec.note ? ': “' + rec.note + '”' : '.') + ' Answer in 🏗 Bid portal → 📂 Manage → 💬 Q&A (↩ Reply / ✅ Mark sent), or add the plans there — everyone who asked is told.';
  const mid = 'M_PR_' + crypto.createHash('sha256').update(rec.id + '|' + rec.at).digest('hex').slice(0, 14);
  const notify = contacts.map(function(c){ return { id: c.crmId, e: c.email, n: c.name, why: 'mention' }; });
  const msg = { id: mid, pid: pid, authorId: 'bidsite:' + rec.userId, authorName: rec.company + ' (bid site)', text: text, tags: contacts.map(function(c){ return c.crmId || c.email; }),
    mentions: notify.map(function(x){ return { id: x.id, e: x.e, n: x.n }; }), notify: notify, at: rec.at, source: 'bidsite', bidJobId: s(job.id), planReqId: rec.id,
    sf: { kind: 'planreq', id: rec.id, userId: rec.userId, company: rec.company, jobTitle: s(job.title) } };   /* patch SUBFLOW: ↩ Reply in the thread */
  const hasM = function(l){ return l.some(function(m){ return m && s(m.id) === mid; }); };
  let r1 = { ok: false }; try { r1 = await kvListUpd('gc_job_messages', function(l){ return hasM(l) ? null : { list: l.concat([msg]), check: hasM }; }); } catch (e) {}
  const tid = 'planreq_' + rec.id;
  const task = { id: tid, kind: 'planreq', label: '📩 ' + rec.company + ' asked for ' + prAsk(rec) + ' — ' + s(job.title).slice(0, 90),
    note: prWhat(rec) + (rec.note ? ' — “' + rec.note.slice(0, 300) + '”' : '') + (contact ? ' · ' + contact : '') + ' · Answer: 🏗 Bid portal → 📂 Manage → 💬 Q&A, or add the plans (it clears itself).',
    pid: s(job.crmProjectId), bidJobId: s(job.id), planReqId: rec.id, assignees: contacts.map(function(c){ return c.email; }), assignee: contacts.map(function(c){ return c.name; }).join(', '),
    personal: contacts.length === 1, shared: contacts.length > 1, prio: 'high', due: rec.at.slice(0, 10), addedBy: 'Bid site', addedAt: rec.at, updatedAt: rec.at, done: false };
  const hasT = function(l){ return l.some(function(t){ return t && s(t.id) === tid; }); };
  let r2 = { ok: false }; try { r2 = await kvListUpd('gc_office_tasks', function(l){ return hasT(l) ? null : { list: l.concat([task]), check: hasT }; }); } catch (e) {}
  return { msgId: r1.ok ? mid : '', todoId: r2.ok ? tid : '', pid: pid };
}
/* close requests (plans posted / answered / sent): the record, and each one's To-Do is done */
async function planReqClose(rows, how, by, extra){
  if (!rows.length) return [];
  const at = new Date().toISOString();
  const out = rows.map(function(r){ return { collection: 'planreqs', id: r.id, job_id: r.job_id, user_id: r.user_id, email: r.email,
    data: Object.assign({}, r.data, { status: 'closed', closedAt: at, closedHow: how, closedBy: s(by) }, extra || {}) }; });
  await upsertRows(out, s(by) || 'plans');
  const ids = {}; rows.forEach(function(r){ ids['planreq_' + r.id] = 1; if (how === 'plans') ids['planreq_' + r.job_id] = 1; });   /* + the older one-per-job to-do */
  const why = how === 'plans' ? 'plans posted' : how === 'answered' ? 'answered' : 'marked sent';
  try { await kvListUpd('gc_office_tasks', function(l){ let ch = false; l.forEach(function(t){ if (t && ids[s(t.id)] && !t.done) { t.done = true; t.doneAt = at; t.doneBy = s(by) || 'Bid site'; t.doneWhy = why; t.updatedAt = at; ch = true; } });
    return ch ? { list: l, check: function(l2){ return l2.every(function(t){ return !t || !ids[s(t.id)] || t.done; }); } } : null; }); } catch (e) {}
  return out;
}
/* a notice on the bid site (the job's "Updates from GrayCo" + Messages) for the sub who asked — never an e-mail from here */
function prNotice(q, job, body){
  return rowFor('messages', { id: 'prn_' + crypto.randomBytes(5).toString('hex'), jobId: s(q.jobId), recipientSubId: s(q.userId), senderId: 'st_grayco', senderName: 'GrayCo',
    senderCompany: 'GrayCo Construction Services', senderRole: 'admin', body: body, at: new Date().toISOString(), readBy: [], kind: 'update', postId: 'planreq_' + q.id });
}
async function mailPaused(){ try { return await require('./_lib/pause').isPaused({ fresh: true }); } catch (e) { return true; } }
async function requestPlans(who, body, ctx){
  if (who.isAdmin) throw Fail(403, 'This button is for subcontractors — GrayCo answers requests in the CRM (🏗 Bid portal → 📂 Manage → 💬 Q&A).');
  needSub(who, true);
  const jobId = s(body.jobId); if (!okId(jobId)) throw Fail(400, 'Pick a job.');
  const sc = ctx.scope || (ctx.scope = await subScope(who));
  if (!sc.jobs[jobId]) throw Fail(404, 'That job is not open to you.');
  if (!sc.biddable[jobId]) throw Fail(403, 'Bids are closed on this job.');
  const job = sc.jobs[jobId].data, p = who.profile, id = jobId + '__' + p.id;
  const old = await getRow('planreqs', id);
  if (old && prOpen(old.data)) return { ok: true, already: true, request: subReqView(old.data) };   /* one open request per sub per job */
  const needs = prNeeds(body.needs); if (!needs.length) needs.push('plans');   /* the older button sent only a note: plans */
  const note = s(body.note).slice(0, 1000);
  if (needs.length === 1 && needs[0] === 'other' && !note) throw Fail(400, 'Write what you need.');
  const at = new Date().toISOString();
  const rec = { id: id, jobId: jobId, userId: p.id, email: low(p.email || who.email), name: s(p.name), company: s(p.company) || s(p.name), phone: s(p.phone),
    trade: s(body.trade).slice(0, 80) || arr([]).concat(Array.isArray(p.trades) ? p.trades : []).join(', ').slice(0, 80), needs: needs, note: note, lang: p.lang === 'es' ? 'es' : 'en',
    at: at, notifiedAt: '', status: 'open', plansAtAsk: plansCount(job, await plansOf(jobId)), via: body.via === 'portal' ? 'portal' : 'bidsite',
    history: old ? arr(old.data.history).concat([pick(old.data, ['at', 'needs', 'note', 'closedAt', 'closedHow', 'reply'])]).slice(-5) : [] };
  const contacts = await planReqContacts(job);
  rec.to = contacts.map(function(c){ return { email: c.email, name: c.name, roles: c.roles }; });
  await upsertRows([{ collection: 'planreqs', id: id, job_id: jobId, user_id: p.id, email: rec.email, data: rec }], who.email);
  const title = '📩 ' + rec.company + ' asked for ' + prAsk(rec) + ' — ' + s(job.title);
  const lines = ['<b>' + esc(rec.company) + '</b> asked for <b>' + esc(prWhat(rec)) + '</b> on the bid job <b>' + esc(job.title) + '</b>' + (s(job.address) ? ' (' + esc(job.address) + ')' : '') + '.',
    rec.note ? '“' + esc(rec.note).replace(/\n/g, '<br>') + '”' : '',
    'Contact: ' + esc([rec.name, rec.phone, rec.email].filter(Boolean).join(' · ')) + (rec.trade ? ' · ' + esc(rec.trade) : ''),
    'Sent to ' + esc(contacts.map(function(c){ return c.name + ' (' + c.roles.join(', ') + ')'; }).join(', ')) + '.',
    'Answer it in the CRM: 🏗 Bid portal → 📂 Manage → 💬 Q&A (↩ Reply or ✅ Mark sent) — or add the plans / a plan link there; everyone who asked is told when they are posted.'];
  try { rec.mailed = !!(await sendMail(contacts.map(function(c){ return c.email; }), title, mailHtml(title.replace(/^📩 /, ''), lines.filter(Boolean), { href: crmUrl(), label: 'Open the CRM' }))); } catch (e) { rec.mailed = false; }
  const crm = await planReqCrm(job, rec, contacts).catch(function(){ return {}; });
  /* patch SUBFLOW: the push + staff text go through the job-message rules (🌙 staff quiet hours, 🏖 Away) — was a raw push at any hour */
  try { rec.ping = !!(await sfPing(s(crm.pid) || sfPid(job), s(crm.msgId) || ('planreq_' + rec.id), contacts, rec.company + ' (' + (rec.via === 'portal' ? 'sub portal' : 'bid site') + ') on ' + s(job.title), '📩 ' + rec.company + ' asked for ' + prWhat(rec).toLowerCase() + (rec.note ? ': ' + rec.note : ''))).ok; } catch (e) {}
  Object.assign(rec, { msgId: s(crm.msgId), todoId: s(crm.todoId), threadPid: s(crm.pid) });
  await upsertRows([{ collection: 'planreqs', id: id, job_id: jobId, user_id: p.id, email: rec.email, data: rec }], who.email);
  return { ok: true, request: subReqView(rec), to: contacts.map(function(c){ return { name: c.name, roles: c.roles }; }) };
}
/* GrayCo answers a request (CRM 📂 Manage → 💬 Q&A; bid-hub op planreq checks who may): ↩ reply / ✅ mark sent */
async function planReqAct(who, body){
  const r = await getRow('planreqs', s(body.id)); if (!r) throw Fail(404, 'No such request.');
  const q = r.data, act = s(body.act), text = s(body.text).slice(0, 4000), by = low(who.email), byName = s(who.name) || by;
  const jr = await getRow('jobs', s(q.jobId)), job = jr ? jr.data : { id: q.jobId, title: '' }, es = q.lang === 'es';
  if (act === 'reply') {
    if (!text) throw Fail(400, 'Write the reply.');
    const row = (await planReqClose([r], 'answered', by, { reply: text, repliedAt: new Date().toISOString(), repliedBy: by, repliedByName: byName }))[0];
    await upsertRows([prNotice(q, job, (es ? 'GrayCo contestó su pedido (' : 'GrayCo answered your request (') + prWhat(q, es) + '): ' + text)], by);
    let mail = 'off';
    if (await mailPaused()) mail = 'held';   /* it goes to a sub: ⏸ data-entry mode holds it (they see it on the bid site) */
    else { try { mail = (await sendMail(q.email, (es ? 'Respuesta de GrayCo — ' : 'GrayCo answered your request — ') + s(job.title), mailHtml(es ? 'Respuesta a su pedido' : 'Answer to your request',
      [(es ? 'Hola ' : 'Hi ') + esc(q.name) + ',', (es ? 'Usted pidió <b>' : 'You asked for <b>') + esc(prWhat(q, es)) + '</b> ' + (es ? 'en ' : 'on ') + '<b>' + esc(job.title) + '</b>.', esc(text).replace(/\n/g, '<br>')],
      { href: PORTAL_ORIGIN + '/', label: es ? 'Abrir el sitio de licitaciones' : 'Open the bid site' }))) ? 'sent' : 'off'; } catch (e) { mail = 'off'; } }
    row.data.replyMail = mail; await upsertRows([row], by);
    return { ok: true, request: row.data, mail: mail };
  }
  if (act === 'sent') {
    const row = (await planReqClose([r], 'sent', by, { sentNote: text, sentAt: new Date().toISOString(), sentBy: by, sentByName: byName }))[0];
    await upsertRows([prNotice(q, job, (es ? 'GrayCo le envió lo que pidió (' : 'GrayCo sent what you asked for (') + prWhat(q, es) + ')' + (text ? ': ' + text : '.'))], by);
    return { ok: true, request: row.data };
  }
  throw Fail(400, 'Reply or Mark sent?');
}
async function planReqsFor(jobId){ return (await listRows([eq('collection', 'planreqs'), eq('job_id', s(jobId))])).map(function(r){ return r.data || {}; }).sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); }); }
/* plans (a file or a link) are on the job: every sub who asked since hears — on the bid site at once, by e-mail when not paused */
async function notifyPlanRequests(jobId){
  const all = await listRows([eq('collection', 'planreqs'), eq('job_id', jobId)]);
  if (!all.length) return 0;
  const jr = await getRow('jobs', jobId), jd = jr ? jr.data : {};
  const count = plansCount(jd, await plansOf(jobId));
  if (!count) return 0;
  const title = s(jd.title) || 'a GrayCo job';
  const fresh = all.filter(function(r){ return prOpen(r.data) && count > (Number(r.data.plansAtAsk) || 0); });
  if (fresh.length) {
    const closed = await planReqClose(fresh, 'plans', 'plans posted', { plansPostedAt: new Date().toISOString() });
    await upsertRows(fresh.map(function(r){ const es = r.data.lang === 'es'; return prNotice(r.data, jd, es ? 'Los planos ya están publicados para ' + title + '. Abra el trabajo para verlos.' : 'Plans are now posted for ' + title + '. Open the job to see them.'); }), 'plans posted');
    closed.forEach(function(c){ const i = all.findIndex(function(r){ return r.id === c.id; }); if (i > -1) all[i] = Object.assign({}, all[i], { data: c.data }); });
  }
  const due = all.filter(function(r){ return s(r.data.closedHow) === 'plans' && !s(r.data.notifiedAt); });
  if (!due.length) return 0;
  if (await mailPaused()) {   /* ⏸ data-entry mode: the e-mail to a sub waits; a later look sends it */
    const mark = due.filter(function(r){ return !r.data.mailHeld; }).map(function(r){ return { collection: 'planreqs', id: r.id, job_id: r.job_id, user_id: r.user_id, email: r.email, data: Object.assign({}, r.data, { mailHeld: true }) }; });
    if (mark.length) await upsertRows(mark, 'plans posted');
    return 0;
  }
  let n = 0;
  for (const r of due) {
    const q = r.data, es = q.lang === 'es', link = PORTAL_ORIGIN + '/';
    const ok = await sendMail(q.email, (es ? 'Los planos están publicados — ' : 'Plans are now posted for ') + title,
      mailHtml(es ? 'Los planos están publicados' : 'Plans are now posted',
        es ? ['Hola ' + esc(q.name || '') + ',', 'Los planos de <b>' + esc(title) + '</b> ya están en el sitio de licitaciones de GrayCo.', 'Entre en ' + esc(link.replace(/^https:\/\//, '').replace(/\/$/, '')) + ' (o en su Portal GrayCo → 📋 Trabajos para licitar) para verlos y enviar su oferta.']
           : ['Hi ' + esc(q.name || '') + ',', 'The plans for <b>' + esc(title) + '</b> are now posted on the GrayCo bid site.', 'Sign in at ' + esc(link.replace(/^https:\/\//, '').replace(/\/$/, '')) + ' (or your GrayCo Portal → 📋 Jobs to bid) to see them and send your bid.'],
        { href: link, label: es ? 'Ver los planos' : 'See the plans' })).catch(function(){ return false; });
    if (ok) { await upsertRows([{ collection: 'planreqs', id: r.id, job_id: jobId, user_id: r.user_id, email: r.email, data: Object.assign({}, q, { notifiedAt: new Date().toISOString(), mailHeld: false }) }], 'plans-ready'); n++; }
  }
  return n;
}
/* plans that arrived some other way (the Lead Inbox, the bid site's own Save): a quick look on every load */
async function sweepPlanRequests(){
  try {
    const open = (await listRows([eq('collection', 'planreqs')])).filter(function(r){ return prOpen(r.data) || (s(r.data.closedHow) === 'plans' && !s(r.data.notifiedAt)); });   /* patch PLANREQ */
    const jobs = Array.from(new Set(open.map(function(r){ return r.job_id; })));
    for (const j of jobs.slice(0, 20)) await notifyPlanRequests(j);
  } catch (e) { console.warn('[subportal] plans sweep', e.message); }
}

/* ── patch SUBFLOW (owner 11/23: "Make sure my sub portal is correctly taking bids … bid portal should take bids, make sure they can download
   plans, request plans; when a sub requests anything or messages on bid or sub portal directed towards PM or estimator they should get
   notification and be able to answer on their app or CRM") ───────────────────────────────────────────────────────────────────────────
   ONE way every sub → GrayCo item from the bid site or the sub portal's 📋 Jobs to bid reaches the job's PM AND estimator (planReqContacts:
   the bid job's PM / estimator, else the CRM job's / lead's; nobody → the poster → the Senior Estimator → the office):
     · a 💬 Job Messages post on the job's thread (the CRM job, else the lead, else "bidjob:<id>") naming them → 🔔 For you on the desk and in
       GrayCo Field. It carries what it answers (m.sf = { kind, id, … }) so the thread shows "↩ Reply to <sub>" (bid-hub op subreply): the
       answer goes back to the sub on the bid site AND the sub portal;
     · a phone push + staff text alert through _lib/jobmsgnotify.js — the job-message rules: 🌙 staff quiet hours (_lib/staffquiet.js; held for
       the morning, 🚨 = emergency), 🏖 Away cover, one per person per thread per 5 minutes (was: a raw push that ignored the quiet hours);
     · a question gets a To-Do too ("❓ <Sub> asked a question — <job>", done when it is answered), as a 📩 plan request always had.
   Kinds: question · message · bid · matreq · mquote (planreq keeps its own post + To-Do above and pings through sfPing).
   Never a price in the post or the text; never another sub's name. */
function sfPid(job){ return s(job && job.crmProjectId) || s(job && job.crmLeadId) || ('bidjob:' + s(job && job.id)); }
function JMN(){ return require('./_lib/jobmsgnotify.js'); }
async function sfPing(pid, msgId, contacts, head, text){
  try { return await JMN().run({ email: 'bidsite@portal.invalid', name: head }, { pid: pid, msgId: msgId, text: s(text).slice(0, 1900), tags: contacts.map(function(c){ return c.email; }), head: s(head).slice(0, 140) }); }
  catch (e) { console.warn('[subportal] SUBFLOW ping', e.message); return { ok: false }; }
}
const SF_ICON = { question: '❓', message: '💬', bid: '📨', matreq: '🧱', mquote: '🧱', planreq: '📩' };
async function sfTell(job, o){
  /* o = { kind, id, userId, company, name, via ('bid site' | 'sub portal'), what ("asked a question"), body (their words), todo, contacts } */
  if (!job) return {};
  const contacts = o.contacts || await planReqContacts(job).catch(function(){ return []; });
  if (!contacts.length) return {};
  const pid = sfPid(job), at = new Date().toISOString(), via = o.via || 'bid site';
  const mid = 'M_SF_' + crypto.createHash('sha256').update(o.kind + '|' + s(o.id) + '|' + s(o.stamp || at)).digest('hex').slice(0, 14);
  const words = s(o.body).replace(/\s+/g, ' ').slice(0, 600);
  const text = (SF_ICON[o.kind] || '🔔') + ' ' + contacts.map(function(c){ return '@' + c.name; }).join(' ') + ' — ' + s(o.company) + (s(o.name) && s(o.name) !== s(o.company) ? ' (' + s(o.name) + ')' : '') + ' ' + o.what +
    ' on the bid job "' + s(job.title) + '"' + (words ? ': “' + words + '”' : '.') + (o.hint ? ' ' + o.hint : '');
  const notify = contacts.map(function(c){ return { id: c.crmId, e: c.email, n: c.name, why: 'mention' }; });
  const msg = { id: mid, pid: pid, authorId: 'bidsite:' + s(o.userId), authorName: s(o.company) + ' (' + via + ')', text: text, tags: contacts.map(function(c){ return c.crmId || c.email; }),
    mentions: notify.map(function(x){ return { id: x.id, e: x.e, n: x.n }; }), notify: notify, at: at, source: 'bidsite', bidJobId: s(job.id),
    sf: { kind: o.kind, id: s(o.id), userId: s(o.userId), company: s(o.company), jobTitle: s(job.title) } };
  const hasM = function(l){ return l.some(function(m){ return m && s(m.id) === mid; }); };
  let posted = false; try { posted = !!(await kvListUpd('gc_job_messages', function(l){ return hasM(l) ? null : { list: l.concat([msg]), check: hasM }; })).ok; } catch (e) {}
  let todoId = '';
  if (o.todo) {
    const tid = 'sf_' + o.kind + '_' + s(o.id);
    const task = { id: tid, kind: 'subflow', sfKind: o.kind, sfId: s(o.id), label: (SF_ICON[o.kind] || '🔔') + ' ' + s(o.company) + ' ' + o.what + ' — ' + s(job.title).slice(0, 90),
      note: (words ? '“' + words.slice(0, 300) + '” · ' : '') + 'Answer: tap ↩ Reply in the job\'s 💬 Messages (desk or GrayCo Field), or 🏗 Bid portal → 📂 Manage → 💬 Q&A. It clears itself when answered.',
      pid: s(job.crmProjectId), msgPid: pid, bidJobId: s(job.id), assignees: contacts.map(function(c){ return c.email; }), assignee: contacts.map(function(c){ return c.name; }).join(', '),
      personal: contacts.length === 1, shared: contacts.length > 1, prio: 'high', due: at.slice(0, 10), addedBy: 'Bid site', addedAt: at, updatedAt: at, done: false };
    const hasT = function(l){ return l.some(function(t){ return t && s(t.id) === tid; }); };
    try { if ((await kvListUpd('gc_office_tasks', function(l){ return hasT(l) ? null : { list: l.concat([task]), check: hasT }; })).ok) todoId = tid; } catch (e) {}
  }
  const ping = await sfPing(pid, mid, contacts, s(o.company) + ' (' + via + ') on ' + s(job.title), text);
  return { msgId: posted ? mid : '', pid: pid, todoId: todoId, to: contacts.map(function(c){ return c.email; }), ping: ping };
}
/* a question / request answered → its To-Do is done */
async function sfDone(kind, id, by){
  const tid = 'sf_' + kind + '_' + s(id), at = new Date().toISOString();
  try { await kvListUpd('gc_office_tasks', function(l){ let ch = false; l.forEach(function(t){ if (t && s(t.id) === tid && !t.done) { t.done = true; t.doneAt = at; t.doneBy = s(by) || 'Bid site'; t.doneWhy = 'answered'; t.updatedAt = at; ch = true; } });
    return ch ? { list: l, check: function(l2){ return l2.every(function(t){ return !t || s(t.id) !== tid || t.done; }); } } : null; }); } catch (e) {}
}
/* the e-mail list for a sub → GrayCo item: the old list (office, poster, PM) + the job's PM and estimator */
async function sfEmails(job, contacts){ const base = await staffEmailsFor(job); return Array.from(new Set(base.concat((contacts || []).map(function(c){ return c.email; })))); }
/* patch SUBFLOW: a job is past its sub due date (the bid due date + time, Central; no time = the end of that day) → no new bids or changes */
function chiOff(d){ try { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'shortOffset' }).formatToParts(new Date(d + 'T18:00:00Z')).find(function(x){ return x.type === 'timeZoneName'; }); const m = /GMT([+-])(\d{1,2})/.exec(p ? p.value : ''); return m ? m[1] + ('0' + m[2]).slice(-2) + ':00' : '-06:00'; } catch (e) { return '-06:00'; } }
function dueOver(j, nowMs){
  const d = s(j && j.bidDueDate).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const tm = /^\d{2}:\d{2}$/.test(s(j.bidDueTime)) ? s(j.bidDueTime) + ':00' : '23:59:59';
  const t = Date.parse(d + 'T' + tm + chiOff(d)); return !!t && (nowMs || Date.now()) > t;
}
/* patch SUBFLOW: "⬇ All plans (ZIP)" — every plan file the sub may open on the job, in one ZIP (a phone opened only the first of several
   files). Built once per set of files (kept in the bucket under zips/), a signed 8-hour link back. Stored (no compression: plans are PDFs). */
const ZIP_MAX = 150 * 1024 * 1024;
function crc32(buf){ let c, r = 0xFFFFFFFF; if (!crc32.T) { crc32.T = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc32.T[n] = c >>> 0; } } for (let i = 0; i < buf.length; i++) r = crc32.T[(r ^ buf[i]) & 0xFF] ^ (r >>> 8); return (r ^ 0xFFFFFFFF) >>> 0; }
function zipBuild(files){
  const parts = [], central = []; let off = 0; const seen = {};
  files.forEach(function(f){
    let nm = s(f.name).replace(/[\\/:*?"<>|]+/g, '_') || 'plan'; const k = nm.toLowerCase(); if (seen[k]) { const m = /^(.*?)(\.[^.]*)?$/.exec(nm); nm = m[1] + ' (' + (++seen[k]) + ')' + (m[2] || ''); } else seen[k] = 1;
    const name = Buffer.from((s(f.folder) ? s(f.folder).replace(/[\\/:*?"<>|]+/g, '_') + '/' : '') + nm, 'utf8'), data = f.buf, c = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, data); central.push(ch, name); off += 30 + name.length + data.length;
  });
  const cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cd, e]));
}
async function plansZip(who, body, ctx){
  const jobId = s(body.jobId); if (!okId(jobId)) throw Fail(400, 'Pick a job.');
  let job = null, items = [];
  if (who.isAdmin) { const jr = await getRow('jobs', jobId); if (!jr) throw Fail(404, 'No such bid job.'); job = jr.data; items = await plansOf(jobId); }
  else {
    needSub(who, true);
    const sc = ctx.scope || (ctx.scope = await subScope(who));
    if (!sc.jobs[jobId]) throw Fail(404, 'That job is not open to you.');
    job = sc.jobs[jobId].data; items = subPlans(await plansOf(jobId), job);
  }
  items = items.filter(function(f){ return f && s(f.fileRef); }).slice(0, 300);
  if (!items.length) throw Fail(404, 'No plan files on this job yet.');
  const total = items.reduce(function(t, f){ return t + (Number(f.size) || 0); }, 0);
  if (total > ZIP_MAX) throw Fail(413, 'The plan set is too big for one ZIP (' + Math.round(total / 1048576) + ' MB) — download the files one by one.');
  const key = crypto.createHash('sha256').update(items.map(function(f){ return s(f.fileRef); }).join('|')).digest('hex').slice(0, 24);
  const path = 'zips/' + jobId + '-' + key + '.zip', name = (s(job.title) || 'GrayCo plans').replace(/[^A-Za-z0-9 ._-]+/g, '').trim().slice(0, 80) + ' - plans.zip';
  const sign = async function(){ const r = await fetch(sbUrl() + '/storage/v1/object/sign/' + BUCKET, { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: SIGN_SECS, paths: [path] }) }); const l = r.ok ? await r.json() : []; const x = Array.isArray(l) ? l[0] : null; return x && x.signedURL && !x.error ? sbUrl() + '/storage/v1' + x.signedURL + (/\?/.test(x.signedURL) ? '&' : '?') + 'download=' + encodeURIComponent(name) : ''; };
  let have = false; try { const r = await fetch(sbUrl() + '/storage/v1/object/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'HEAD', headers: H() }); have = r.ok; } catch (e) { have = false; }
  if (!have) {
    const files = [];
    for (const f of items) { let b = null; try { b = await storageGet(f.fileRef); } catch (e) { b = null; } if (!b) throw Fail(502, 'Could not read ' + s(f.name) + ' — try again.'); files.push({ name: f.name, folder: s(f.category) && !/^plans?$/i.test(s(f.category)) ? f.category : '', buf: b }); }
    await storagePut(path, zipBuild(files), 'application/zip');
  }
  const url = await sign(); if (!url) throw Fail(502, 'Could not make the download link — try again.');
  if (!who.isAdmin) { try { await upsertRows([rowFor('activity', { id: 'a_zip_' + crypto.randomBytes(5).toString('hex'), jobId: jobId, userId: who.profile.id, userName: s(who.profile.name), userCompany: s(who.profile.company), kind: 'download', planName: 'All plans (ZIP)', at: new Date().toISOString() })], who.email); } catch (e) {} }
  return { ok: true, url: url, name: name, files: items.length, size: total };
}
function notifyApproved(n){ return notify(Object.assign({}, n, { kind: '__approved_inner' })); }   /* patch SIGNUPNOTE */
async function notify(n){
  if (n.kind === 'job-result') return require('./_lib/bidmail.js').result(n.job, n.result);   /* patch BIDSITE3 */
  if (n.kind === 'addendum-mail') return require('./_lib/bidmail.js').addendum(n.job, n.add);
  if (n.kind === 'accepted-mail') { const r = await getRow('jobs', n.jobId); return require('./_lib/bidmail.js').accepted(r ? r.data : { id: n.jobId, title: '' }, n.email, n.quote); }
  if (n.kind === 'plans-added') return notifyPlanRequests(n.jobId);   /* patch PLANREQ */
  if (n.kind === 'sf-done') return sfDone(n.what, n.id, n.by);   /* patch SUBFLOW */
  if (n.kind === 'crm-sitewalk') return crmSiteWalkPush(n.jobId, n.by);
  if (n.kind === 'details-changed') {   /* patch BIDPO: ✎ Edit Job Details changed the site walk / questions deadline → the same update as 📂 Manage → Details */
    const r = await getRow('jobs', n.jobId); if (!r) return;
    const H = require('./bid-hub.js')._test, job = Object.assign({}, r.data);
    job.log = arr(job.log).concat([{ at: new Date().toISOString(), by: s(n.who.name || n.who.email), what: '📝 Details changed on the bid site: ' + n.lines.join(' · ') }]).slice(-300);
    const notice = await H.subNotice(n.who, job, 'GrayCo updated this bid job:\n• ' + n.lines.join('\n• '));
    job.updatedAt = new Date().toISOString(); await upsertRows([rowFor('jobs', job)], n.who.email);
    return notice;
  }
  if (n.kind === 'due-changed') {   /* patch PLANREQ-D: 🗂 Activity + the automatic "Bid due date changed" update (bid-hub.js, the same as 📂 Manage) */
    const r = await getRow('jobs', n.jobId); if (!r) return;
    const job = Object.assign({}, r.data);
    const notice = await require('./bid-hub.js')._test.dueChanged(n.who, job, n.from);
    if (notice) { job.updatedAt = new Date().toISOString(); await upsertRows([rowFor('jobs', job)], n.who.email); }
    return notice;
  }
  if (n.kind === 'registered') {
    const u = n.user;
    const owners = String(process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(okEmail);
    /* patch SIGNUPNOTE (owner 11/13: "make sure we get the approval notification"): a phone notice to the owners too, and the e-mail opens ✅ Approvals in the CRM */
    try { await pushTo(owners, u.role === 'supplier' ? '🧱 New supplier signed up (approved automatically)' : u.approved ? '🔨 New sub signed up (job invite) — please check' : '🔨 New sub waiting for approval', s(u.company) + (u.trades && u.trades.length ? ' — ' + u.trades.slice(0, 3).join(', ') : '') + ' · open ✅ Approvals'); } catch (e) {}   /* SUBSIGNUP: an invited one too */
    return sendMail([process.env.SUBPORTAL_NOTIFY || OFFICE].concat(owners), (u.role === 'supplier' ? '🧱 New supplier — ' : u.approved ? '🔨 Check new sub (job invite) — ' : '🔨 Approve new sub — ') + u.company,
      mailHtml(u.role === 'supplier' ? 'New supplier sign-up' : 'New subcontractor sign-up', [
        '<b>' + esc(u.company) + '</b>' + (u.dbaName ? ' (DBA ' + esc(u.dbaName) + ')' : ''),
        esc(u.name) + ' · ' + esc(u.email) + (u.phone ? ' · ' + esc(u.phone) : ''),
        u.trades && u.trades.length ? 'Trades: ' + esc(u.trades.join(', ')) : '',
        u.role === 'supplier' ? 'A <b>supplier</b> (materials) account — approved automatically (supplier sign-ups need no approval). Link it to the CRM vendor under <b>Suppliers</b> on the bid site (bids.grayco-cs.com).' : u.approved ? 'They came from a job invite, so they already see that job. Please check them: <b>✅ Approvals → 🏗 Bid portal</b> (✅ Approve, or ✕ Deny to take their access away).' : 'They are signed in and waiting for your approval — they see no jobs until you approve them. In the CRM: <b>✅ Approvals → 🏗 Bid portal</b> (⚡ Approve, or 📋 Review first).'
      ].filter(Boolean), u.role === 'supplier' ? { href: portalLink(), label: 'Open the bid site' } : { href: crmUrl(), label: 'Open ✅ Approvals' }));
  }
  if (n.kind === 'approved') {
    /* patch SIGNUPNOTE: the 'you are approved' e-mail answers their own sign-up — it goes in ⏸ data-entry mode too */
    return require('./_lib/custquiet.js').run('reply', function(){ return notifyApproved(n); });
  }
  if (n.kind === '__approved_inner') {
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
  if (n.kind === 'new-mquote' && n.job) {   /* patch SUPPLIER */
    const q = n.q;
    const sfC = await planReqContacts(n.job).catch(function(){ return []; });   /* patch SUBFLOW: the PM + estimator hear (🔔 + push / text) */
    try { await sfTell(n.job, { kind: 'mquote', id: q.id, userId: q.userId, company: q.userCompany, name: q.userName, what: 'sent a material quote (' + q.lines.length + ' line' + (q.lines.length === 1 ? '' : 's') + ')', body: q.leadTime ? 'Lead time: ' + q.leadTime : '', hint: 'See it on the bid site (Suppliers → quotes).', contacts: sfC }); } catch (e) {}
    return sendMail(await sfEmails(n.job, sfC), 'New material quote — ' + s(n.job.title) + ' — ' + q.userCompany,
      mailHtml('New material quote on ' + s(n.job.title), [
        '<b>' + esc(q.userCompany) + '</b> (' + esc(q.userName) + ') quoted <b>$' + num(q.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</b> for ' + q.lines.length + ' line(s).',
        q.leadTime ? 'Lead time: ' + esc(q.leadTime) : ''
      ].filter(Boolean), { href: portalLink(), label: 'Review the quote' }));
  }
  if (n.kind === 'new-bid' && n.job) {
    const b = n.bid;
    const sfC = await planReqContacts(n.job).catch(function(){ return []; });   /* patch SUBFLOW: the PM + estimator hear (🔔 + push / text) — never the price in the post */
    try { await sfTell(n.job, { kind: 'bid', id: b.id, userId: b.userId, company: b.userCompany, name: b.userName, via: b.via === 'portal' ? 'sub portal' : 'bid site', what: 'sent a bid' + (s(b.trade) ? ' for ' + s(b.trade) : ''), body: '', hint: 'Compare it in 🏗 Bid portal → 📨 Bids.', contacts: sfC }); } catch (e) {}
    return sendMail(await sfEmails(n.job, sfC), 'New bid — ' + s(n.job.title) + ' — ' + b.userCompany,
      mailHtml('New bid on ' + s(n.job.title), [
        '<b>' + esc(b.userCompany) + '</b> (' + esc(b.userName) + ') bid <b>$' + num(b.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</b>.',
        b.scope ? 'Scope: ' + esc(b.scope.slice(0, 600)) : ''
      ].filter(Boolean), { href: portalLink(), label: 'Review the bid' }));
  }
  if (n.kind === 'message-from-sub' && n.job) {
    const m = n.msg;
    const sfC = await planReqContacts(n.job).catch(function(){ return []; });
    let inCrm = false; try { inCrm = await toCrmThread(n.prof, n.job, m, sfC); } catch (e) { console.warn('[subportal] crm message', e.message); }   /* patch SUBMSG */
    /* patch SUBFLOW: the PM + estimator hear; in the CRM job's sub thread already (SUBMSG) → that post names them, only the push / text here */
    try { if (inCrm) await sfPing(s(n.job.crmProjectId), 'SPM_' + s(inCrm), sfC, m.senderCompany + ' (bid site) on ' + s(n.job.title), '💬 ' + m.senderCompany + ': ' + m.body);
      else await sfTell(n.job, { kind: 'message', id: m.id, userId: m.senderId, company: m.senderCompany, name: m.senderName, what: 'sent a message', body: m.body, contacts: sfC }); } catch (e) {}
    return sendMail(await sfEmails(n.job, sfC), 'Message from ' + m.senderCompany + ' — ' + s(n.job.title),
      mailHtml('New message on ' + s(n.job.title), ['<b>' + esc(m.senderCompany) + '</b> (' + esc(m.senderName) + ') wrote:', esc(m.body.slice(0, 1500)).replace(/\n/g, '<br>')],
        { href: portalLink(), label: 'Reply in the portal' }));
  }
  if (n.kind === 'new-question' && n.job) {
    const q = n.q;
    const sfC = await planReqContacts(n.job).catch(function(){ return []; });   /* patch SUBFLOW: 🔔 + push / text + a To-Do for the PM + estimator */
    try { await sfTell(n.job, { kind: 'question', id: q.id, userId: q.userId, company: q.userCompany, name: q.userName, via: q.via === 'portal' ? 'sub portal' : 'bid site', what: 'asked a question', body: q.body, todo: true, contacts: sfC }); } catch (e) {}
    return sendMail((await sfEmails(n.job, sfC)).concat(String(process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',')),
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
    const teamCc = await TEAM().notifyList(TEAM().keySub(sub.id));   /* patch PORTALTEAM: + the coworkers who turned "Notify me" on */
    return sendMail([sub.email].concat(teamCc), 'New message from GrayCo', mailHtml('You have a new message from GrayCo',
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
    if (k === 'schedule') out[k] = require('./_lib/schedvis.js').visible(out[k]);   /* patch SCHEDPICK: template suggestions are not the schedule (no sub sees them) */
  }
  return out;
}
async function crmData(){
  if (kvCache && Date.now() - kvCache.at < 30e3) return kvCache.data;
  const data = await kvRead(CRM_KEYS);
  kvCache = { at: Date.now(), data: data };
  return data;
}
/* ── patch BIDPO (owner 11/19: "Should auto-fill in POs, match or use the job's PO. Always have the same PO throughout, but shouldn't
   have to enter one here."): the bid job's PO is the CRM's — rules in _lib/bidpo.js. Read when jobs are loaded or saved (so a PO changed
   in the CRM follows), matched / assigned on the server, never typed on the bid site; 🔗 Link to CRM job (admins) when it is not sure. */
const BIDPO_KEYS = ['projects', 'leads', 'schedule', 'gc_tombstones', 'gc_deleted_projects'];
let poCache = null;
async function poData(){
  if (poCache && Date.now() - poCache.at < 30e3) return poCache.data;
  const data = await kvRead(BIDPO_KEYS);
  poCache = { at: Date.now(), data: data };
  return data;
}
function BPO(){ return require('./_lib/bidpo.js'); }
const PO_FIELDS = ['poNumber', 'poSource', 'poHistory', 'poAssignedAt', 'poNoMatch', 'poNoMatchBy', 'poNoMatchAt', 'crmProjectId', 'crmProjectName', 'crmProjectAuto', 'crmProjectAt', 'crmProjectBy'];
/* jobs (their data) → the same jobs with the CRM's PO; changed ones are saved. opts.noAssign: a sub's load never hands out a new PO.
   A CRM that cannot be read changes nothing. → { jobs, info: { id: info } } */
async function poSync(list, opts){
  opts = opts || {};
  let data; try { data = await poData(); } catch (e) { return { jobs: list, info: {}, data: null }; }
  if (!arr(data.projects).length) return { jobs: list, info: {}, data: null };   /* the CRM's job list did not come back — never assign against nothing */
  const all = opts.allJobs || list, info = {}, save = [];
  const out = list.map(function(j){
    if (!j || !j.id || isGone(j)) return j;
    const r = BPO().apply(j, data, { jobs: all, noAssign: !!opts.noAssign, by: opts.by });
    info[j.id] = r.info;
    if (r.changed) { save.push(r.job); return r.job; }
    return j;
  });
  if (save.length && !opts.dry) { try { await upsertRows(save.map(function(j){ return rowFor('jobs', j); }), opts.by || 'bidpo-sync'); } catch (e) { console.warn('[subportal] PO sync', e.message); } }
  return { jobs: out, info: info, data: data };
}
/* what an admin's page gets with each job (never stored: storage.js leaves _po out of saves) */
function poView(job, info, data){
  if (!info) return job;
  let walk = null; try { walk = data ? BPO().crmSiteWalk(job, data) : null; } catch (e) {}
  return Object.assign({}, job, { _po: Object.assign({}, info, { crmSiteWalk: walk }) });
}
async function poLink(who, body){   /* 🔗 Link to CRM job / Change link — an admin's pick */
  if (!who.isAdmin) throw Fail(403, 'GrayCo staff only.');
  const r = await getRow('jobs', s(body.jobId)); if (!r) throw Fail(404, 'No such bid job.');
  let job = Object.assign({}, r.data);
  const data = await poData(), pid = s(body.projectId), at = new Date().toISOString();
  if (pid === '__none') {   /* none of those CRM jobs: its own PO (a PO that was another CRM job's is not kept) */
    if (s(job.poSource) === 'crm' && s(job.poNumber)) { job.poHistory = arr(job.poHistory).concat([{ from: s(job.poNumber), to: '', at: at, why: 'not that CRM job (' + (who.email) + ')' }]).slice(-20); job.poNumber = ''; }
    ['crmProjectId', 'crmProjectName', 'crmProjectAuto', 'crmProjectAt', 'crmProjectBy'].forEach(function(k){ delete job[k]; });
    job.poNoMatch = true; job.poNoMatchBy = who.email; job.poNoMatchAt = at;
  } else if (pid) {
    const p = arr(data.projects).find(function(x){ return x && s(x.id) === pid; });
    if (!p || !BPO().resolve({ id: job.id, crmProjectId: pid }, data).project) throw Fail(404, 'That CRM job is not there any more.');
    Object.assign(job, { crmProjectId: pid, crmProjectAuto: 'admin', crmProjectAt: at, crmProjectBy: who.email }); delete job.poNoMatch;
  } else { ['crmProjectId', 'crmProjectName', 'crmProjectAuto', 'crmProjectAt', 'crmProjectBy', 'poNoMatch'].forEach(function(k){ delete job[k]; }); }   /* "match again" */
  const jobs = (await listRows([eq('collection', 'jobs')])).map(function(x){ return x.data || {}; });
  const out = BPO().apply(job, data, { jobs: jobs, by: who.email });
  job = out.job;
  job.log = arr(job.log).concat([{ at: at, by: s(who.profile && who.profile.name) || who.email, what: (pid === '__none' ? '🧾 Not a CRM job — its own PO ' : pid ? '🔗 Linked to the CRM job ' + s(job.crmProjectName) + ' — PO ' : '🔗 CRM link matched again — PO ') + (s(job.poNumber) || '(none yet)') }]).slice(-300);
  job.updatedAt = at;
  await upsertRows([rowFor('jobs', job)], who.email);
  return { ok: true, job: poView(job, out.info, data) };
}
/* patch BIDPO (decision 6): the site walk → the linked CRM job's schedule (gc_kv "schedule", the CRM's own list; written as the
   list it is, re-read before and after like every server write to a CRM list). Nothing is sent to anyone from here. */
async function schedKvUpd(mutate){
  const read = async function(){
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value,updated_at&key=in.("schedule","schedule__manifest")', { headers: H() });
    if (!r.ok) return null; const rows = await r.json().catch(function(){ return null; }); if (!Array.isArray(rows)) return null;
    const one = rows.find(function(x){ return x && x.key === 'schedule'; }), man = rows.find(function(x){ return x && x.key === 'schedule__manifest'; });
    let mv = man && man.value; if (typeof mv === 'string') { try { mv = JSON.parse(mv); } catch (e) { mv = null; } }
    if (mv && mv.chunked && mv.count > 0 && (!one || s(man.updated_at) >= s(one.updated_at))) return { chunked: true };   /* the pieces are the newer copy: never write over them */
    let v = one ? one.value : []; if (v == null || v === '') v = []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
    return Array.isArray(v) ? { list: v, at: s(one && one.updated_at) } : null;
  };
  for (let tries = 0; tries < 5; tries++) {
    const cur = await read(); if (!cur) return { ok: false, why: 'unreadable' }; if (cur.chunked) return { ok: false, why: 'chunked' };
    const m = mutate(clone(cur.list)); if (!m || !m.list) return { ok: true, unchanged: true };
    const again = await read(); if (!again || again.chunked || again.at !== cur.at || JSON.stringify(again.list) !== JSON.stringify(cur.list)) { await new Promise(function(r){ setTimeout(r, 150 + 200 * tries); }); continue; }
    const w = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: 'schedule', value: m.list, updated_at: new Date().toISOString() }) });
    if (!w.ok) return { ok: false, why: 'write ' + w.status };
    const after = await read(); if (after && after.list && (!m.check || m.check(after.list))) return { ok: true };
  }
  return { ok: false, why: 'busy' };
}
async function crmSiteWalkPush(jobId, by){
  const r = await getRow('jobs', jobId); if (!r) return { ok: false, why: 'no job' };
  const job = r.data || {}; poCache = null;
  const data = await poData(); if (!arr(data.projects).length) return { ok: false, why: 'no CRM jobs' };
  const res = BPO().resolve(job, data), p = res.state === 'linked' ? res.project : null;
  const out = await schedKvUpd(function(list){ return BPO().schedMutate(list, job, p, { by: by ? by + ' (bid site)' : 'Bid site' }); });
  if (!out.ok) console.warn('[subportal] site walk → CRM schedule', out.why);
  return out;
}
async function poCands(who, body){
  if (!who.isAdmin) throw Fail(403, 'GrayCo staff only.');
  const r = await getRow('jobs', s(body.jobId)); if (!r) throw Fail(404, 'No such bid job.');
  const data = await poData(), jobs = (await listRows([eq('collection', 'jobs')])).map(function(x){ return x.data || {}; });
  return { ok: true, cands: BPO().search(r.data, data, s(body.q).slice(0, 80), { jobs: jobs }) };
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
      jobs.push({ id: s(p.id) + ':' + s(x.id), pid: s(p.id), job: s(p.name),   /* patch SUBSCHED: pid → 📅 My schedule for this job (the portal) */
        address: s(p.address || p.jobAddress), po: s(p.autoPO || p.po),
        trade: s(x.trade), status: s(x.status) || 'Bidding', scope: s(x.scope).slice(0, 4000), amount: money(x.bidAmt),
        start: ymd(x.startDate), end: ymd(x.endDate), pm: pmOf(p), jobStatus: s(p.status || p.stage) });
    });
  });
  try {   /* patch INSPECT2: each job's inspections that touch this sub's trade (all when no trade) — date, time, type, status only */
    const IN2 = require('./_lib/inspect2.js'), ist = (await kvRead([IN2.KEY]))[IN2.KEY], tday = new Date(Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    jobs.forEach(function(j){ const p = projById[j.pid]; j.inspections = p ? IN2.subView(ist, p, j.trade || s(crm.trade || crm.cat), tday) : []; });
  } catch (e) {}
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

/* ═══ patch BIDSITE3 (owner 11/20) ═══════════════════════════════════════════════════════════════════════════════════
   B. 📧 Invite (a sub or a supplier) on a bid job → the invite e-mail goes out AT ONCE (no approval queue): "GrayCo invited you to bid:
      <project>" with their sign-in link (an account already) or their sign-up link (the invite token: approved on sign-up, linked to
      the job; ?as=supplier opens the supplier sign-up). Its switch: Admin → 📧 Bid site e-mails → Invite e-mail (on). */
async function inviteSend(who, body){
  if (!who.isAdmin) throw Fail(403, 'GrayCo staff only.');
  const jobId = s(body.jobId), jr = okId(jobId) ? await getRow('jobs', jobId) : null;
  if (!jr || isGone(jr.data)) throw Fail(404, 'No such bid job.');
  const emails = Array.from(new Set(arr([]).concat(Array.isArray(body.emails) ? body.emails : [body.email]).map(low).filter(okEmail))).slice(0, 100);
  if (!emails.length) throw Fail(400, 'Enter an e-mail address.');
  let skippedDnu = 0;
  if (body.skipDnu) {   /* patch INVGROUPS: a bulk invite never reaches a ⛔ Do-not-use sub (a saved group could still hold one) */
    let dnu = {}; try { (await crmSubs()).forEach(function(c){ if (c.flag === 'dnu' && c.email) dnu[c.email] = 1; }); } catch (e) { dnu = {}; }
    const keep = emails.filter(function(e){ return !dnu[e]; }); skippedDnu = emails.length - keep.length; emails.length = 0; keep.forEach(function(e){ emails.push(e); });
    if (!emails.length) return { ok: true, invites: [], mailed: 0, skippedDnu: skippedDnu, mailOff: false };
  }
  const asSup = s(body.as) === 'supplier';
  const coName = emails.length === 1 ? s(body.company).slice(0, 120) : '';   /* patch INVCO: the company name typed / picked on Invite subs */
  const BM = require('./_lib/bidmail.js'), sw = await BM.cfg();
  const have = {}; (await listRows([eq('collection', 'invites'), eq('job_id', jobId)])).forEach(function(r){ have[low(r.email)] = r.data; });
  const accts = {}; (await listRows([eq('collection', 'users')])).forEach(function(r){ const d = r.data || {}; if (d.role === 'sub' || d.role === 'supplier') accts[low(r.email)] = d; });
  const at = new Date().toISOString(), rows = [], out = [];
  let mailed = 0;
  for (const e of emails) {
    const acct = accts[e], sup = acct ? acct.role === 'supplier' : asSup;
    const inv = Object.assign({}, have[e] || { id: 'i_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'), jobId: jobId, email: e, token: crypto.randomBytes(16).toString('hex'), createdAt: at, createdBy: who.email, via: 'bidsite' }, { as: sup ? 'supplier' : 'sub' }, coName ? { company: coName } : {});
    if (sw.invite) {
      const link = acct ? PORTAL_ORIGIN + '/' : PORTAL_ORIGIN + '/?invite=' + inv.token + '&job=' + encodeURIComponent(jobId) + (sup ? '&as=supplier' : '');
      const m = BM.inviteMail(jr.data, link, !!(acct && acct.lang === 'es'), sup, !!acct);
      let ok = false; try { ok = !!(await BM.trade(function(){ return sendMail(e, m.subject, m.html); })); } catch (x) { ok = false; }
      if (ok) { mailed++; inv.mailedAt = at; inv.mailedBy = who.email; }
    }
    rows.push(rowFor('invites', inv)); out.push(pick(inv, ['id', 'jobId', 'email', 'company', 'token', 'createdAt', 'createdBy', 'as', 'mailedAt', 'usedAt', 'usedBy']));
  }
  if (isDraft(jr.data)) {   /* an invite opens a draft as PRIVATE (the CRM's invite does the same): only invited accounts see it */
    await upsertRows([rowFor('jobs', Object.assign({}, jr.data, { draft: false, visibility: 'private', status: 'open', openedPrivateAt: jr.data.openedPrivateAt || at, openedBy: who.email, updatedAt: at }))], who.email);
  }
  await upsertRows(rows, who.email);
  return { ok: true, invites: out, mailed: mailed, mailOff: !sw.invite, skippedDnu: skippedDnu };
}
/* C. Admin → 📧 Bid site e-mails: the switches */
async function bidmailCfg(who, body){
  if (!who.isAdmin) throw Fail(403, 'GrayCo staff only.');
  const BM = require('./_lib/bidmail.js');
  if (s(body.op) === 'set') return { ok: true, switches: await BM.save(body.switches, who.email), list: BM.LIST };
  return { ok: true, switches: await BM.cfg(), list: BM.LIST };
}
/* ═══ patch INVGROUPS (owner 11/23 "invite all subs, or recent invitees too, or if I have a special group of who I usually invite let them be
   group 1"): the admin's saved invite groups on the bid site's ✉️ Invite Subs — one settings row (sp_rows "settings/invite_groups", like
   settings/bidmail) so every admin and device sees the same groups. Members by e-mail (+ name / company). Deleting ARCHIVES a group (kept
   with archivedAt/archivedBy, never purged). Nothing is sent from here: the invites still go only through invite-send on the admin's click. */
const IG_ROW = 'invite_groups', IG_MAX = 60, IG_MAX_MEMBERS = 600;
function igMember(m){ m = m || {}; const e = low(m.email); if (!okEmail(e)) return null; return { email: e, name: s(m.name).slice(0, 120), company: s(m.company).slice(0, 120) }; }
function igView(g){ return pick(g, ['id', 'name', 'members', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'archivedAt', 'archivedBy']); }
async function igRead(){ const r = await getRow('settings', IG_ROW); const d = (r && r.data) || {}; return Array.isArray(d.groups) ? d.groups.filter(function(g){ return g && s(g.id); }) : []; }
async function inviteGroups(who, body){
  if (!who.isAdmin) throw Fail(403, 'GrayCo staff only.');
  const op = s(body.op) || 'get';
  let groups = await igRead();
  const out = function(){ return { ok: true, groups: groups.filter(function(g){ return !g.archivedAt; }).map(igView), archived: groups.filter(function(g){ return g.archivedAt; }).length }; };
  if (op === 'get') return out();
  const at = new Date().toISOString();
  if (op === 'save') {
    const g = body.group || {}, id = s(g.id);
    const seen = {}, members = (Array.isArray(g.members) ? g.members : []).map(igMember).filter(function(m){ return m && !seen[m.email] && (seen[m.email] = 1); }).slice(0, IG_MAX_MEMBERS);
    const name = s(g.name).replace(/\s+/g, ' ').slice(0, 60);
    if (!name) throw Fail(400, 'Give the group a name.');
    const old = id ? groups.filter(function(x){ return x.id === id && !x.archivedAt; })[0] : null;
    if (id && !old) throw Fail(404, 'That group was deleted.');
    if (!old && groups.filter(function(x){ return !x.archivedAt; }).length >= IG_MAX) throw Fail(400, 'Too many groups — delete one first.');
    const rec = old ? Object.assign({}, old, { name: name, members: members, updatedAt: at, updatedBy: who.email })
      : { id: 'g_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), name: name, members: members, createdAt: at, createdBy: who.email, updatedAt: at, updatedBy: who.email };
    groups = old ? groups.map(function(x){ return x.id === old.id ? rec : x; }) : groups.concat([rec]);
  } else if (op === 'archive') {
    const id = s(body.id); if (!groups.some(function(x){ return x.id === id && !x.archivedAt; })) throw Fail(404, 'No such group.');
    groups = groups.map(function(x){ return x.id === id ? Object.assign({}, x, { archivedAt: at, archivedBy: who.email }) : x; });
  } else throw Fail(400, 'Unknown op.');
  await upsertRows([{ collection: 'settings', id: IG_ROW, data: { id: IG_ROW, groups: groups, updatedAt: at, updatedBy: who.email } }], who.email);
  return out();
}
/* F. "Request more materials" (a sub on a job they bid on / may bid on, or an awarded job): item, quantity, reason → an approval card for
   the job's PM in the CRM (✅ Approvals, bid-hub ?matreqs). Approve → a line on the job's supplier PO draft (gc_supplier_pos, never sent
   by itself); Decline with a note → the sub sees the answer here. Never a price; no customer contact. */
const MR_MAX_OPEN = 30;
function mrView(d){ return pick(d, ['id', 'jobId', 'item', 'qty', 'unit', 'reason', 'status', 'answer', 'at', 'decidedAt', 'poNo']); }
async function matReq(who, body, ctx){
  const op = s(body.op) || 'list';
  if (who.isAdmin) {
    const f = [eq('collection', 'matreqs')]; if (okId(s(body.jobId))) f.push(eq('job_id', s(body.jobId)));
    return { ok: true, requests: (await listRows(f)).map(function(r){ return r.data; }).sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); }) };
  }
  needSub(who, true);
  if (who.isSupplier) throw Fail(403, 'Material requests are for subcontractors.');
  const me = who.profile.id;
  if (op === 'list') return { ok: true, requests: (await listRows([eq('collection', 'matreqs'), eq('user_id', me)])).map(function(r){ return mrView(r.data || {}); }).sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); }) };
  if (op !== 'add') throw Fail(400, 'Unknown request.');
  const sc = ctx.scope || (ctx.scope = await subScope(who));
  const jobId = s(body.jobId), jr = sc.jobs[jobId];
  if (!jr) throw Fail(403, 'This job is not open to you.');
  const item = s(body.item).slice(0, 200), qty = num(body.qty), reason = s(body.reason).slice(0, 1000);
  if (!item) throw Fail(400, 'What material do you need?');
  if (!(qty > 0)) throw Fail(400, 'How many? Enter a quantity.');
  if (!reason) throw Fail(400, 'Tell GrayCo why it is needed.');
  const mine = await listRows([eq('collection', 'matreqs'), eq('user_id', me), eq('job_id', jobId)]);
  if (mine.filter(function(r){ return r.data && r.data.status === 'pending'; }).length >= MR_MAX_OPEN) throw Fail(429, 'You have many requests waiting on this job — wait for GrayCo to answer them.');
  const p = who.profile, job = jr.data || {};
  const rec = { id: 'mr_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), jobId: jobId, jobTitle: s(job.title), item: item, qty: qty, unit: s(body.unit).slice(0, 20), reason: reason,
    userId: me, userName: s(p.name), userCompany: s(p.company), userEmail: low(p.email), status: 'pending', at: new Date().toISOString(),
    awarded: arr(sc.myBids).some(function(r){ return r.job_id === jobId && r.data && r.data.accepted === true; }) };
  await upsertRows([rowFor('matreqs', rec)], who.email);
  /* patch SUBFLOW: the job's PM (+ estimator) hear through the job-message rules — a bid job with no PM e-mail of its own uses the CRM job's PM
     (was: a raw push to the bid job's PM e-mail only, so most requests told nobody) */
  try { await sfTell(job, { kind: 'matreq', id: rec.id, userId: me, company: rec.userCompany, name: rec.userName, what: 'asked for material: ' + qty + ' ' + (rec.unit ? rec.unit + ' ' : '') + item, body: reason, hint: 'Approve or decline it in ✅ Approvals.' }); } catch (e) {}
  return { ok: true, request: mrView(rec) };
}
/* the job's PM (the bid job's PM e-mail, else its PM profile's) */
async function jobPmEmail(job){
  if (okEmail(low(job && job.pmEmail))) return low(job.pmEmail);
  if (job && okId(s(job.pmId))) { const r = await getRow('users', s(job.pmId)); if (r && okEmail(low(r.email))) return low(r.email); }
  /* patch SUBFLOW: no PM on the bid job itself → the CRM job's / lead's PM (the same person the 🔔 post names) — was nobody, so only an admin could answer */
  if (job && (s(job.crmProjectId) || s(job.crmLeadId))) { try { const c = (await planReqContacts(job)).find(function(x){ return x.roles.indexOf('PM') > -1; }); if (c) return c.email; } catch (e) {} }
  return '';
}
/* the CRM's ✅ Approvals (bid-hub.js): the waiting requests with their PM, and the decision */
async function matReqsOpen(){
  const rows = (await listRows([eq('collection', 'matreqs')])).map(function(r){ return r.data || {}; }).filter(function(d){ return d.status === 'pending'; });
  const jobs = {}; for (const id of Array.from(new Set(rows.map(function(d){ return s(d.jobId); })))) { const jr = await getRow('jobs', id); if (jr) jobs[id] = jr.data; }
  const out = [];
  for (const d of rows) { const j = jobs[s(d.jobId)] || {}; out.push(Object.assign({}, d, { jobTitle: s(j.title) || s(d.jobTitle), pmEmail: await jobPmEmail(j), crmProjectId: s(j.crmProjectId), poNumber: s(j.poNumber) })); }
  return out.sort(function(a, b){ return s(a.at).localeCompare(s(b.at)); });
}
async function matReqDecide(by, b){
  const r = await getRow('matreqs', s(b.id)); if (!r) throw Fail(404, 'No such material request.');
  const d = Object.assign({}, r.data), jr = await getRow('jobs', s(d.jobId)), job = jr ? jr.data : {};
  if (!by.admin && low(by.email) !== await jobPmEmail(job)) throw Fail(403, 'Only the job\'s PM or an admin answers a material request.');
  if (d.status !== 'pending') return { ok: true, already: d.status, request: d };
  const at = new Date().toISOString();
  if (s(b.act) === 'decline') {
    const note = s(b.note).slice(0, 1000); if (!note) throw Fail(400, 'Add a note for the sub (why not).');
    Object.assign(d, { status: 'declined', answer: note, decidedAt: at, decidedBy: low(by.email), decidedByName: s(by.name) });
    await upsertRows([rowFor('matreqs', d)], low(by.email));
    return { ok: true, request: d };
  }
  if (s(b.act) !== 'approve') throw Fail(400, 'Approve or decline?');
  const po = await mrToPo(d, job);
  Object.assign(d, { status: 'approved', answer: s(b.note).slice(0, 1000) || 'Approved — GrayCo is ordering it.', decidedAt: at, decidedBy: low(by.email), decidedByName: s(by.name), poId: po.id || '', poNo: po.poNo || '' });
  await upsertRows([rowFor('matreqs', d)], low(by.email));
  if (!po.id) { try { await officeTodo('matreq_' + d.id, '🧱 Order material for ' + (s(job.title) || 'a bid job'), d.userCompany + ' asked for ' + d.qty + ' ' + (d.unit ? d.unit + ' ' : '') + d.item + ' (approved by ' + (s(by.name) || by.email) + '). The bid job is not linked to a CRM job — add it to a supplier PO by hand.'); } catch (e) {} }
  return { ok: true, request: d, po: po };
}
/* the approved line on the job's DRAFT supplier PO (gc_kv gc_supplier_pos; the 📨 Proposals → POs list): one bid-site PO draft per CRM job,
   status 'draft' (never sent by itself); the supplier of an accepted material quote when there is one, else picked in the CRM */
async function mrToPo(d, job){
  const pid = s(job && job.crmProjectId); if (!pid) return { id: '', why: 'no CRM job linked' };
  let proj = {}; try { proj = arr((await crmData()).projects).find(function(x){ return s(x.id) === pid; }) || {}; } catch (e) {}
  let sup = { name: '', id: '' };
  try { const q = (await listRows([eq('collection', 'mquotes'), eq('job_id', s(job.id))])).map(function(r){ return r.data || {}; }).find(function(x){ return x.status === 'accepted'; });
    if (q) { const u = await getRow('users', s(q.userId)); sup = { name: s(q.userCompany), id: s(u && u.data && u.data.crmVendorId) }; } } catch (e) {}
  const at = new Date().toISOString(), item = { desc: d.item, qty: num(d.qty) || 1, unit: s(d.unit), cost: 0, note: 'Requested by ' + s(d.userCompany) + ': ' + s(d.reason).slice(0, 300), matreqId: d.id };
  let made = null;
  const res = await kvListUpd('gc_supplier_pos', function(list){
    if (list.some(function(po){ return po && arr(po.items).some(function(i){ return i && i.matreqId === d.id; }); })) return null;   /* already on a PO */
    const base = 'PO_mr_' + pid.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    let po = list.find(function(x){ return x && s(x.id).indexOf(base) === 0 && s(x.status) === 'draft'; });
    if (po) { po.items = arr(po.items).concat([item]); po.updatedAt = at; }
    else {
      const n = list.filter(function(x){ return x && s(x.id).indexOf(base) === 0; }).length;
      po = { id: base + (n ? '_' + (n + 1) : ''), pid: pid, poNo: (s(proj.autoPO) || s(job.poNumber) || 'PO') + '-M' + (n + 1), supplier: sup.name, vendorId: sup.id, items: [item], cost: 0, status: 'draft',
        createdAt: at, updatedAt: at, by: 'Bid site material request' };
      list.push(po);
    }
    made = { id: po.id, poNo: po.poNo };
    return { list: list, check: function(l){ return l.some(function(x){ return x && arr(x.items).some(function(i){ return i && i.matreqId === d.id; }); }); } };
  });
  if (!res.ok) throw Fail(502, 'The purchase order list could not be saved — try again.');
  return made || { id: '', why: 'already on a PO' };
}

/* patch MEASURE: the plan measure tool's saved takeoffs (_lib/takeoffs.js) — per person + job + plan file, every page inside.
   A sub: their own only, on a job they may see and a plan file they may open. GrayCo staff: owner 'gc' (saved to the job).
   A measure ticket (portal.grayco-cs.com → a CRM job's plan): that sub + that CRM job + that one file, nothing else. */
function TK(){ return require('./_lib/takeoffs.js'); }
async function takeoffsAct(who, body){
  const op = s(body.op), T = TK();
  let owner, job, file, tk = null;
  if (body.mt) {
    tk = T.read(body.mt); if (!tk) throw Fail(403, 'This measure link has expired. Open the plan again from your portal.');
    owner = 'crm.' + tk.s; job = 'crm.' + tk.p; file = { name: tk.n, type: tk.t };
  } else {
    needSub(who, true);
    if (who.isSupplier) throw Fail(403, 'Subcontractors only.');
    const jobId = s(body.jobId); if (!okId(jobId)) throw Fail(400, 'Pick a job.');
    owner = who.isAdmin ? 'gc' : who.profile.id; job = jobId;
    if (!who.isAdmin) { const sc = await subScope(who); if (!sc.jobs[jobId]) throw Fail(403, 'That job is not open to you.'); body._job = sc.jobs[jobId].data; }
    if (op !== 'job') {
      file = { name: s(body.file && body.file.name).slice(0, 200), type: s(body.file && body.file.type).slice(0, 60) };
      if (!file.name) throw Fail(400, 'Pick a plan file.');
      if (!who.isAdmin) { const r0 = await getRow('plans', jobId); const ok = r0 && subPlans(r0.data.items, body._job).some(function(f){ return s(f.name) === file.name; });
        if (!ok) throw Fail(403, 'That plan file is not open to you.'); }
    }
  }
  if (op === 'open') {
    if (!tk) throw Fail(400, 'Bad request');
    let url = '';
    try { const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files', { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: SIGN_SECS, paths: [tk.r] }) });
      const l = r.ok ? await r.json() : []; const x = Array.isArray(l) ? l[0] : null; if (x && x.signedURL && !x.error) url = sbUrl() + '/storage/v1' + x.signedURL; } catch (e) {}
    if (!url) throw Fail(404, 'The plan file could not be opened. Try again from your portal.');
    return { ok: true, file: { name: file.name, type: file.type, url: url }, job: s(tk.j) };
  }
  if (op === 'job') {
    const rows = (await listRows([eq('collection', 'takeoffs'), eq('user_id', owner), eq('job_id', job)])).map(function(r){ return r.data || {}; });
    return { ok: true, plans: rows.map(function(d){ return { file: d.file, totals: T.totals([d]), updatedAt: d.updatedAt }; }), totals: T.totals(rows) };
  }
  const id = T.rowId(owner, job, T.fileKey(file.name));
  if (op === 'get') { const r = await getRow('takeoffs', id); return { ok: true, doc: r ? r.data : null }; }
  if (op === 'put') {
    const d = T.clean(body.doc, file);
    d.updatedAt = new Date().toISOString(); d.by = tk ? 'portal' : who.email;
    if (JSON.stringify(d).length > MAX_ROW) throw Fail(413, 'This takeoff is too big to save. Split it over another plan file.');
    await upsertRows([{ collection: 'takeoffs', id: id, user_id: owner, job_id: job, data: d }], tk ? 'portal:' + tk.s : who.email);
    return { ok: true, saved: d.items.length, updatedAt: d.updatedAt, totals: T.totals([d]) };
  }
  throw Fail(400, 'Unknown takeoff step.');
}

/* patch SUBMSG (owner 11/20): the bid site's Messages and the CRM job's messages are one conversation.
   A sub's message on a bid job that is linked to a CRM job (crmProjectId, 🔗 PO link) goes into that CRM job's sub thread
   (gc_portal_msg, party s:<CRM sub id>; the job's 💬 Messages via _lib/subthread.js) — the same thread as portal.grayco-cs.com.
   GrayCo's replies there come back to the bid site as messages to that sub (id crm_<id>, read-only; opening them marks them read).
   Only the sub's own thread on jobs they may see; never another sub's. */
function PAX(){ return require('./portal-access.js'); }
async function crmSubFor(prof){ try { const A = PAX()._acct; return A.crmSubOf(await A.crmData(), prof) || null; } catch (e) { return null; } }
async function toCrmThread(prof, job, m, contacts){
  const pid = s(job && job.crmProjectId); if (!pid || !prof) return false;
  const sub = await crmSubFor(prof); if (!sub) return false;
  const files = arr(m.attachments).length ? '\n📎 ' + arr(m.attachments).length + ' file(s) on bids.grayco-cs.com' : '';
  /* patch SUBFLOW: the job's 💬 Messages post names the PM + estimator (→ 🔔 For you); the id is kept for the push / text */
  const tell = arr(contacts).map(function(c){ return { id: c.crmId, e: c.email, n: c.name, why: 'mention' }; });
  const id = await PAX()._core.msgInsert(pid, 's:' + s(sub.id), 'them', s(prof.name || prof.company).slice(0, 80), s(m.body).slice(0, 3900) + files, [], tell.length ? { tell: tell } : undefined);
  return id || true;
}
async function crmReplies(who, sc){
  const map = {}; Object.keys(sc.jobs).forEach(function(id){ const j = sc.jobs[id].data || {}; if (s(j.crmProjectId)) map[s(j.crmProjectId)] = id; });
  const pids = Object.keys(map); if (!pids.length) return [];
  const sub = await crmSubFor(who.profile); if (!sub) return [];
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal_msg?select=id,project_id,side,author,text,created_at,read_at&party=eq.' + encodeURIComponent('s:' + s(sub.id)) +
    '&side=eq.gc&project_id=in.(' + pids.map(function(x){ return '"' + x.replace(/"/g, '') + '"'; }).join(',') + ')&order=created_at.asc&limit=500', { headers: H() });
  if (!r.ok) return [];
  const me = sc.me;
  return (await r.json()).map(function(m){ return { id: 'crm_' + s(m.id), jobId: map[s(m.project_id)], senderId: 'gc', senderName: s(m.author) || 'GrayCo', senderCompany: 'GrayCo', senderRole: 'admin',
    recipientSubId: me, body: s(m.text), at: m.created_at, readBy: m.read_at ? [me] : [], fromCrm: true }; });
}
async function crmMarkRead(who, ids){
  const sub = await crmSubFor(who.profile); if (!sub) return;
  ids = ids.filter(function(x){ return /^M[A-Za-z0-9_-]{3,60}$/.test(x); }).slice(0, 100); if (!ids.length) return;
  await fetch(sbUrl() + '/rest/v1/gc_portal_msg?party=eq.' + encodeURIComponent('s:' + s(sub.id)) + '&side=eq.gc&read_at=is.null&id=in.(' + ids.map(function(x){ return '"' + x + '"'; }).join(',') + ')',
    { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ read_at: new Date().toISOString() }) });
}
exports.handler = async function (event) {
  const headers = gcCors(event);
  const J = function(code, body){ return { statusCode: code, headers: headers, body: JSON.stringify(body) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  { const sc = event.httpMethod === 'GET' && event.queryStringParameters ? s(event.queryStringParameters['signup-confirm']) : '';   /* SIGNUPVERIFY: the confirm link's page */
    if (sc) return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' }, body: svPage(sc) }; }
  { const tc = event.httpMethod === 'GET' && event.queryStringParameters ? s(event.queryStringParameters['team-confirm']) : '';   /* patch PORTALTEAM: the confirm link's page */
    if (tc) return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' }, body: teamConfirmPage(tc) }; }
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
    if (action === 'signup-confirm') {   /* SIGNUPVERIFY */
      if (limited(ipOf(event), 20)) return J(429, { error: 'Too many tries. Wait a few minutes and try again.' });
      const pf = await svConfirm(body.token);
      return J(200, { ok: true, approved: pf.approved === true });
    }
    if (action === 'signup-resend') {   /* SIGNUPVERIFY: "Resend link" (the same answer whether or not the address is waiting) */
      if (limited(ipOf(event), 8)) return J(429, { error: 'Please wait a minute before asking for another e-mail.' });
      return J(200, await svResend(body.email));
    }
    if (action === 'team-confirm') {   /* patch PORTALTEAM (security): the domain sign-up's e-mail confirm → access */
      if (limited(ipOf(event), 20)) return J(429, { error: 'Too many tries. Wait a few minutes and try again.' });
      const m = await TEAM().confirm(body.token);
      return J(200, { ok: true, company: s(m.companyName) });
    }
    if (action === 'reset-password') {   /* patch RESETMAIL */
      if (limited(ipOf(event), 20)) return J(429, { error: 'Please wait a minute before asking for another e-mail.' });
      return J(200, await resetPassword(body));
    }
    if (action === 'trade-list') {   /* patch SIGNUPPAPERS: the sign-up's trade buttons — GrayCo's list + the trades of the CRM's subs */
      if (limited(ipOf(event), 60)) return J(429, { error: 'Too many tries.' });
      return J(200, { trades: await tradeList() });
    }
    if (action === 'signup-upload' || action === 'signup-papers') {   /* patch SIGNUPPAPERS */
      if (limited(ipOf(event), 60)) return J(429, { error: 'Too many tries. Wait a few minutes and try again.' });
      return J(200, action === 'signup-upload' ? await signupUpload(body) : await signupPapers(body));
    }
    if (action === 'invite-info') {
      if (limited(ipOf(event), 40)) return J(429, { error: 'Too many tries. Wait a few minutes.' });
      const inv = await findInvite(body.invite, body.job);
      if (!inv) return J(200, { ok: false });
      if (inv.job_id === 'signup') return J(200, { ok: true, email: /^sms:/.test(s(inv.data.email)) ? '' : s(inv.data.email), jobTitle: 'the GrayCo bid site — every public bid job' });   /* patch BIDINVITE: a 📨 sign-up link */
      const job = await getRow('jobs', inv.job_id);
      return J(200, { ok: true, email: s(inv.data.email), jobTitle: job && !isDraft(job.data) ? s(job.data.title) : '' });
    }

    if (action === 'takeoffs' && body.mt) {   /* patch MEASURE: a measure ticket from portal.grayco-cs.com (no bid-site sign-in) */
      if (limited(ipOf(event), 120)) return J(429, { error: 'Too many tries. Wait a minute.' });
      return J(200, await takeoffsAct(null, body));
    }
    const who = await whoAmI(event);
    const ctx = {};
    if (action === 'me') {
      if (!who.profile) return J(200, { user: null, error: 'This sign-in has no subcontractor portal account. Register first, or call GrayCo ' + OFFICE_PHONE + '.' });
      return J(200, { user: who.profile, role: who.isAdmin ? 'admin' : (who.isSupplier ? 'supplier' : 'sub'), team: who.member ? { member: who.member.name, email: who.member.email } : undefined });   /* patch PORTALTEAM */
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
    if (action === 'plans-zip') return J(200, await plansZip(who, body, ctx));   /* patch SUBFLOW: ⬇ All plans (ZIP) */
    if (action === 'addendum-post') {   /* patch SUBFLOW: 📎 Post addendum on the bid site — the CRM's own rule and code (bid-hub op addendum: who may, the number, the e-mail on ✅ Approvals / held in ⏸) */
      if (!who.isAdmin) return J(403, { error: 'GrayCo staff only.' });
      const BH = require('./bid-hub.js')._test, bw = await BH.whoIs(event);
      if (!bw.ok) return J(bw.code || 401, { error: bw.error });
      const r = await BH.addendum(bw, body);
      return r.code ? J(r.code, { error: r.error }) : J(200, r);
    }
    if (action === 'plans-guess') {   /* patch PLANREQ-C: the trade / kind of each file before it is saved */
      if (!who.isAdmin) return J(403, { error: 'GrayCo staff only.' });
      return J(200, await plansGuess(who, body));
    }
    if (action === 'my-work') {
      if (who.isAdmin && !body.userId) return J(400, { error: 'Pick a subcontractor.' });
      const target = who.isAdmin ? (await getRow('users', s(body.userId)) || {}).data : who.profile;
      if (!target || (target.role !== 'sub' && target.role !== 'supplier')) return J(404, { error: 'No such subcontractor.' });
      if (!who.isAdmin && !who.approved) return J(403, { error: 'Your account is waiting for GrayCo to approve it.' });
      if (target.role === 'supplier') return J(200, await supplierWork(target));   /* patch SUPPLIER: their POs + supplier bills */
      return J(200, await myWork(target));
    }
    if (action === 'takeoffs') return J(200, await takeoffsAct(who, body));   /* patch MEASURE */
    if (action === 'invite-send') return J(200, await inviteSend(who, body));   /* patch BIDSITE3 B: Invite → the e-mail at once */
    if (action === 'bidmail-cfg') return J(200, await bidmailCfg(who, body));   /* patch BIDSITE3 C: Admin → 📧 Bid site e-mails */
    if (action === 'invite-groups') return J(200, await inviteGroups(who, body));   /* patch INVGROUPS: saved invite groups (admin) */
    if (action === 'matreq') return J(200, await matReq(who, body, ctx));       /* patch BIDSITE3 F: "Request more materials" */
    if (action === 'po-link') return J(200, await poLink(who, body));   /* patch BIDPO: 🔗 Link to CRM job / Change link */
    if (action === 'po-cands') return J(200, await poCands(who, body));
    if (action === 'crm-vendors') {   /* patch SUPPLIER: the CRM's vendors, for linking a supplier account */
      if (!who.isAdmin) return J(403, { error: 'GrayCo staff only.' });
      return J(200, { vendors: await crmVendors() });
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
/* patch SYS: the CRM's 🏗 Bid portal tab (bid-hub.js) works on the same rows with the same helpers — one copy of each */
exports._sv = { svUnconfirmed, svConfirm, svResend, SV_MSG };   /* SIGNUPVERIFY: portal-access / sub-accounts / tests */
exports._papers = { paperToken, paperUser, cleanPaper, signupPapers, signupUpload, PAPER_TYPES };   /* patch SIGNUPPAPERS: tests */
exports._hub = { crmPapersOf: function(){ return crmPapersOf.apply(null, arguments); }, mergeCrm: mergeCrm, kvListUpd, matReqsOpen, matReqDecide, inviteSend, withSupplierMaterials, noPrices, crmSiteWalkPush, poSync, poData, poView, poLink, poCands, poCacheClear: function(){ poCache = null; kvCache = null; }, kvRead, listRows, eq, inList, getRow, upsertRows, rowFor, crmSubs, crmData, crmSubList, sendMail, mailHtml, esc, okEmail, PORTAL_ORIGIN, saveCollection, isGone, subJobView, subPlans, plansOf, subScope, signAll, isDraft, papersMissing, plansImport, plansGuess, bidLines,
  requestPlans, planReqAct, planReqsFor, notifyPlanRequests, subReqView, planReqContacts, prOpen, plansCount };   /* patch PLANREQ */   /* patch SYS2: + the Q&A save, the sub view, plans · patch SUBBIDS: + subScope / signAll / isDraft (the sub portal's 📋 Jobs to bid) */
exports._hub.tradeFit = tradeFit; exports._hub.jobTrades = jobTrades;   /* patch TRADEVIS */
Object.assign(exports._hub, { addendumNum, sfTell, sfDone, sfPing, sfPid, dueOver, plansZip, zipBuild, planReqAct, toCrmThread, crmSubFor });   /* patch SUBFLOW */
/* patch LOGOALL (owner 10/23: "should have our logo on it"): every customer / sub / GC e-mail this file sends
   straight to Resend gets the GrayCo shell (centered logo, office line, licenses). Internal @grayco-cs.com mail is untouched. */
try { require('./_lib/brand.js').installResend(); } catch (e) {}
