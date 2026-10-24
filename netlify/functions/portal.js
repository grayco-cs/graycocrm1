// netlify/functions/portal.js
// GrayCo — THE CUSTOMER PORTAL (patch Q).
//
// A customer opens  https://<site>/portal.html#t=<link code>.  The page sends the code
// here (in the x-portal-token header — never in the address, so it is never in a log).
//
// PUBLIC (no sign-in, only the link code):
//   POST {action:'view'}    → a small, CLEANED view of that ONE job (a strict whitelist:
//                             see buildView). Nothing else ever leaves this function.
//   POST {action:'photos'}  → that ONE job's photos the customer may see (patch U2): GrayCo Photos marked
//                             "Customer sees it" (gc_kv gc_photos) + its CompanyCam photos (server key) unless
//                             a person hid one — signed links that expire. Never a CompanyCam link.
//   A link code that is unknown or turned off gets the SAME answer every time:
//   "This link is not active — call GrayCo 901-585-0944". Per-address rate limit.
//
// STAFF (signed in to the CRM + on gc_staff — the "GrayCo staff check" below):
//   POST {action:'create',     projectId} → the job's link (the active one if it has one)
//   POST {action:'revoke',     projectId} → turn the link off
//   POST {action:'regenerate', projectId} → turn it off and make a new one
//   POST {action:'status',     projectId} → is there a link, when was it last opened
//   POST {action:'final-now',  projectId} → email the final invoice now (once; see portal-reminders.js)
//
// Data: the CRM's own synced records (gc_kv rows: projects, invs, cos, estimates, projectDocs,
// users, customers …) read with the SERVICE key, and the link table gc_portal
// (docs/portal-setup.sql: RLS on, no policies — only this server can read it).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (already set), COMPANYCAM_TOKEN (already set),
//      RESEND_API_KEY (already set; e-mail), optional PORTAL_BASE_URL, PORTAL_MAIL_OFF=1.

/* ── GrayCo staff check (security build) ──────────────────────────────────────
   A call from the CRM must carry the signed-in person's Supabase token:
       Authorization: Bearer <access token>
   The token is checked with Supabase (/auth/v1/user) and the email must be on
   the staff list: table gc_staff (read with the service key) once it exists —
   it is then the ONLY list, so removing someone there blocks them here at
   once — and the STAFF_EMAILS variable only before that table exists.
   No token / bad token → 401.  Signed in but not staff → 403.
   (Kept inline in every function on purpose: each function is bundled alone.) */
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const GC_PORTAL_ORIGIN = 'https://portal.grayco-cs.com';
function portalOrigin(){ const v = String(process.env.PORTAL_BASE_URL || '').trim().replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : GC_PORTAL_ORIGIN; }
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* CORS: only the CRM's own site may call from a browser (SITE_ORIGIN, comma list). */
function gcCors(event, methods, extraHeaders){
  /* 33.151: the portal's own address (PORTAL_BASE_URL, default portal.grayco-cs.com) may call too */
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').concat([portalOrigin()])
    .map(function(s){ return s.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event, 'origin').replace(/\/$/, '');
  return {
    'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization' + (extraHeaders ? ', ' + extraHeaders : ''),
    'Access-Control-Allow-Methods': methods || 'POST, OPTIONS'
  };
}
async function gcStaffAuth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(gcHeader(event, 'authorization').trim());
  if (!m) return { ok: false, statusCode: 401, error: 'Sign in to the GrayCo CRM first (no sign-in token was sent).' };
  const token = m[1];
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  let user = null;
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (r.ok) user = await r.json();
  } catch (e) {
    return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service. Try again.' };
  }
  const email = String((user && user.email) || '').trim().toLowerCase();
  if (!email) return { ok: false, statusCode: 401, error: 'Your sign-in has expired. Sign in again.' };
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let role = null, listed = false, name = '';
  if (svc) {
    try {
      const r = await fetch(url + '/rest/v1/gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email),
        { headers: keyHeaders(svc) });
      if (r.ok) {
        listed = true;
        const rows = await r.json();
        const row = Array.isArray(rows) && rows[0];
        if (row && row.active !== false) { role = String(row.role || 'staff').toLowerCase(); name = row.name || ''; }
      }
    } catch (e) {}
  }
  if (!listed) {
    const env = (process.env.STAFF_EMAILS || '').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
    if (env.indexOf(email) > -1) role = 'staff';
  }
  if (!role) return { ok: false, statusCode: 403, error: 'This account (' + email + ') is not on the GrayCo staff list.' };
  return { ok: true, email: email, role: role, name: name, userId: user.id || '' };
}
/* ── end GrayCo staff check ────────────────────────────────────────────────── */

const crypto = require('crypto');
const JA = require('./_lib/job-auto.js');   /* patch JA: the job's automations (project.auto) */
try { require('./_lib/brand.js').installResend(); } catch (e) {}   /* patch AUT2: every customer e-mail gets the GrayCo shell */

const OFFICE_PHONE = '901-585-0944';
const NOT_ACTIVE = 'This link is not active — call GrayCo ' + OFFICE_PHONE;
const STAGES = ['Lead', 'Contacted', 'Appointment booked', 'Estimate sent', 'Contract signed + scheduled',
                'In progress', 'Punch list', 'Final invoice', 'Closed'];
const REVIEW_URL = 'https://share.google/quDuhdlL0ckxPLLY3';
const FACEBOOK_URL = 'https://www.facebook.com/p/GrayCo-Construction-Services-LLC-100092932745320/';
const KV_KEYS = ['projects', 'invs', 'invoices', 'cos', 'changeOrders', 'estimates', 'projectDocs', 'users',
                 'customers', 'leads', 'punch', 'projectPayments', 'gc_deleted_projects', 'gc_claims', 'jobAutoDefaults',
                 'gc_portal_auto_posts',   /* patch AUTAI: approved weekly updates / voice posts */
                 'gc_senior_pm', 'gc_team_settings'];   /* patch PMG: the Senior PM, "APMs may approve" (Admin → Employees) */
const KV_TTL = 30e3, PHOTO_TTL = 5 * 60e3, SIGN_SECS = 3600, MIN_FAIL_MS = 250;

/* ── small helpers ─────────────────────────────────────────────────────────── */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function num(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isFinite(n) ? n : 0;
}
function money(n){ return Math.round(num(n) * 100) / 100; }
function ymd(v){
  if (!v) return '';
  if (typeof v === 'number') { const d = new Date(v > 1e12 ? v : v * 1000); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
  const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function firstName(v){ return s(v).split(/\s+/)[0] || ''; }
function pidOf(r){ return s(r && (r.pid || r.projectId || r.jobId || r.project_id)); }
function arr(v){
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
  return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : [];
}
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
/* Supabase keys: the classic service_role key is a JWT (sent as apikey AND Bearer). The newer
   "sb_secret_…" keys are NOT JWTs: Supabase refuses them in the Authorization header, so they go
   in apikey only (the gateway does the rest). Sending one as Bearer is what fails as "not accepted". */
function isJwt(k){ return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(k || '')); }
function keyHeaders(k){ return isJwt(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }; }
function keyKind(k){
  k = String(k || '').trim();
  if (!k) return 'missing';
  if (/^sb_secret_/.test(k)) return 'secret key (sb_secret_…) — ok';
  if (/^sb_publishable_/.test(k)) return 'WRONG: this is the publishable key — use the secret / service_role key';
  if (isJwt(k)) { try { const role = JSON.parse(Buffer.from(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role; return role === 'service_role' ? 'service_role key — ok' : 'WRONG: this key is the "' + role + '" key — use the service_role key'; } catch (e) { return 'a JWT that could not be read'; } }
  return 'not a Supabase key format';
}
function H(extra){ return Object.assign(keyHeaders(svcKey()), { 'Content-Type': 'application/json' }, extra || {}); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

/* ── the CRM's records (gc_kv), read with the service key ─────────────────────
   A big list may be stored in pieces (<key>__manifest + <key>__chunkN); the newer of the
   single row and the pieces wins, exactly as the CRM itself reads it. Cached 30 s. */
let kvCache = null;
async function kvRead(keys){
  const want = [];
  keys.forEach(function(k){ want.push(k, k + '__manifest'); });
  const q = sbUrl() + '/rest/v1/gc_kv?select=key,value,updated_at&key=in.(' + want.map(function(k){ return '"' + k + '"'; }).join(',') + ')';
  const r = await fetch(q, { headers: H() });
  if (!r.ok) throw new Error('gc_kv read ' + r.status);
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
async function crmData(force){
  if (!force && kvCache && Date.now() - kvCache.at < KV_TTL) return kvCache.data;
  const data = await kvRead(KV_KEYS);
  kvCache = { at: Date.now(), data: data };
  return data;
}
function listOf(data, keys){
  const seen = {}, out = [];
  keys.forEach(function(k){ arr(data[k]).forEach(function(r){ const id = s(r.id); if (id && seen[id]) return; if (id) seen[id] = 1; out.push(r); }); });
  return out;
}
/* patch JA: what this job's automations say (its own choices, else the company defaults for its type) */
function jaAdmin(data){ return JA.parseAdmin(data && data.jobAutoDefaults); }
function jaAllows(data, p, key){ return JA.allows(p, key, jaAdmin(data)); }
function findProject(data, pid){
  const delList = Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : [];
  if (delList.map(String).indexOf(String(pid)) >= 0) return null;
  return arr(data.projects).find(function(p){ return s(p.id) === String(pid); }) || null;
}

/* ── CompanyCam ─────────────────────────────────────────────────────────────── */
function ccIdFromAny(v){
  if (v == null || v === '') return '';
  const t = String(v); const m = t.match(/companycam\.com\/projects\/(\d+)/) || t.match(/^PRJcc_(\d+)$/);
  if (m) return m[1];
  if (/^\d{3,}$/.test(t.trim())) return t.trim();
  return '';
}
function ccIdOf(p){
  const f = ['ccProjectId', 'companyCamId', 'companycamId', 'ccamId', 'ccId', 'companyCamUrl', 'ccamUrl', 'ccUrl', 'ccProjectUrl', 'id'];
  for (const k of f) { const id = ccIdFromAny(p[k]); if (id) return id; }
  return '';
}
function httpsUrl(u){ const t = s(u); return /^https:\/\/[^\s"'<>]+$/i.test(t) ? t : ''; }
function ccLinkOf(p){
  const f = ['ccamUrl', 'companyCamUrl', 'ccUrl', 'ccProjectUrl', 'ccShareUrl'];
  for (const k of f) { const u = httpsUrl(p[k]); if (u && /(^|\.)companycam\.com\//i.test(u.replace(/^https:\/\//, ''))) return u; }
  const id = ccIdOf(p); return id ? 'https://app.companycam.com/projects/' + id : '';
}
const photoCache = new Map();
async function ccPhotos(ccId){
  const hit = photoCache.get(ccId);
  if (hit && Date.now() - hit.at < PHOTO_TTL) return hit.list;
  const token = s(process.env.COMPANYCAM_TOKEN);
  if (!token || !/^\d{3,}$/.test(ccId)) return [];
  const out = [];
  for (let page = 1; page <= 50; page++) {
    let r;
    try {
      r = await fetch('https://api.companycam.com/v2/projects/' + ccId + '/photos?per_page=100&page=' + page,
        { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
    } catch (e) { break; }
    if (!r.ok) break;
    const chunk = await r.json().catch(function(){ return null; });
    if (!Array.isArray(chunk) || !chunk.length) break;
    chunk.forEach(function(ph){
      if (!ph || !Array.isArray(ph.uris)) return;
      const by = {};
      ph.uris.forEach(function(u){ if (u && u.type) by[u.type] = httpsUrl(u.uri || u.url); });
      const full = by.web || by.original || by.large || '';
      const thumb = by.thumbnail || by.web || full;
      if (!full || !thumb) return;
      out.push({ id: 'cc_' + s(ph.id), t: thumb, f: full, at: ymd(ph.captured_at || ph.created_at), src: 'companycam' });
    });
    if (chunk.length < 100) break;
  }
  out.sort(function(a, b){ return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  photoCache.set(ccId, { at: Date.now(), list: out });
  if (photoCache.size > 200) photoCache.delete(photoCache.keys().next().value);
  return out;
}

/* ── files in the private bucket: short-lived signed links, only for what is shown ── */
function refPath(ref){ const m = /^sb:crm-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/.exec(s(ref)); return m ? m[1] : ''; }
async function signRefs(refs){
  const paths = Array.from(new Set(refs.map(refPath).filter(Boolean))).slice(0, 120);
  const out = {};
  if (!paths.length || !svcKey()) return out;
  try {
    const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files', { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: SIGN_SECS, paths: paths }) });
    if (!r.ok) return out;
    const j = await r.json();
    (Array.isArray(j) ? j : []).forEach(function(x){
      const u = s(x && (x.signedURL || x.signedUrl));
      if (x && x.path && u && !x.error) out['sb:crm-files/' + x.path] = /^https:/.test(u) ? u : sbUrl() + '/storage/v1' + (u[0] === '/' ? '' : '/') + u;
      if (x && x.path && /\.(docx?|rtf)$/i.test(x.path) && out['sb:crm-files/' + x.path]) out['sb:crm-files/' + x.path] += (out['sb:crm-files/' + x.path].indexOf('?') >= 0 ? '&' : '?') + 'download=';
    });
  } catch (e) {}
  return out;
}

/* ── GrayCo Photos (patch U2): the photos of the job the customer may see ─────────────────────
   Records live in gc_kv "gc_photos" (never in the projects row). Shown: not deleted, this job, not a flag record,
   "Customer sees it" (shared true, or not set and not a Damage photo). A CompanyCam photo is hidden when its flag
   record ccf_<id> says shared:false. One per picture (the same fingerprint twice is one photo). The marked-up copy
   is shown when there is one. Notes and who took it are NOT sent — only the picture, its tag and its date. */
function gcSharedOf(r, f){ if (f && f.deleted !== true && f.shared != null) return f.shared === true; return r.shared === true || (r.shared == null && s(r.tag) !== 'Damage'); }
async function grayCoRecords(){ try { return arr((await kvRead(['gc_photos'])).gc_photos); } catch (e) { return null; } }
async function grayCoPhotos(pid, recs){
  const list = recs || await grayCoRecords() || [];
  const seen = {}, pick = [];
  list.forEach(function(r){
    if (r.deleted === true || r.source === 'ccflag' || s(r.jobId) !== String(pid)) return;
    if (!gcSharedOf(r)) return;
    const full = refPath(r.annotatedRef) ? r.annotatedRef : r.ref;
    if (!refPath(full)) return;
    const k = s(r.hash) || full; if (seen[k]) return; seen[k] = 1;
    pick.push({ id: s(r.id), full: full, thumb: refPath(r.thumbRef) ? r.thumbRef : full, at: s(r.at), tag: s(r.tag) });
  });
  pick.sort(function(a, b){ return a.at < b.at ? 1 : -1; });
  const top = pick.slice(0, 300), signed = {};
  for (let i = 0; i < top.length; i += 50) {
    const refs = []; top.slice(i, i + 50).forEach(function(x){ refs.push(x.full, x.thumb); });
    Object.assign(signed, await signRefs(refs));
  }
  return top.map(function(x){ const f = signed[x.full], t = signed[x.thumb] || f; return f ? { id: clip(x.id, 60), t: t, f: f, at: ymd(x.at), src: 'grayco', tag: clip(x.tag, 20) } : null; }).filter(Boolean);
}
function ccHidden(recs){ const out = {}; arr(recs).forEach(function(r){ if (r.source === 'ccflag' && s(r.ccId) && !gcSharedOf({ shared: true }, r)) out[s(r.ccId)] = 1; }); return out; }

/* ── Google Docs: a docs.google.com / drive.google.com link and its preview ── */
function gdocInfo(u){
  const t = httpsUrl(u); if (!t) return null;
  let m = /^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{15,})/.exec(t);
  if (m) return { url: t, preview: 'https://docs.google.com/' + m[1] + '/d/' + m[2] + '/preview' };
  m = /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{15,})/.exec(t);
  if (m) return { url: t, preview: 'https://drive.google.com/file/d/' + m[1] + '/preview' };
  return null;
}

/* ── where the job is (the customer's progress tracker) ───────────────────── */
function isCustomerInvoice(r){
  const ty = low(r.type);
  if (r.needsReview === true || r.reviewHold === true || ty === 'client-review') return false;
  if (/sub|vendor|bill|expense|cost/.test(ty)) return false;
  if (ty && !/client|customer|draw|progress|final|invoice/.test(ty)) return false;
  if (!ty && (r.sub || r.subId || r.vendor)) return false;
  if (/draft|pm_review|void|deleted|declined|denied|cancel/.test(low(r.status))) return false;
  if (r._pmDenied === true || r.deleted === true) return false;
  return true;
}
/* patch AP2 — every client invoice made in the CRM is in the customer's portal, with its PDF.
   The number the CRM prints (invoice number, else INV-<PO>, else INV-<last 6 of the id>); what the customer
   sees as its state: Approved / Sent / Due / Overdue / Paid (a draft or one in PM review is not shown). */
function invNumber(r){
  const n = s(r.invNum || r.num || r.number || r.docNumber || r.qbNum);
  if (n) return clip(n, 30);
  return s(r.po) ? clip('INV-' + s(r.po), 30) : 'INV-' + s(r.id).slice(-6);
}
function invAmount(r){ return money(num(r.amt != null ? r.amt : (r.amount != null ? r.amount : r.total))); }
function invCustStatus(r, bal, today){
  const st = low(r.status);
  if (bal <= 0 && (invPaid(r) || invAmount(r) > 0)) return 'Paid';
  const due = ymd(r.dueDate || r.due);
  if (/overdue|late|past/.test(st) || (due && due < (today || new Date().toISOString().slice(0, 10)))) return 'Overdue';
  if (/sent|emailed|mailed/.test(st) || r.emailedAt || r.firstSentDate) return 'Sent';
  if (/approv/.test(st) || r.approved === true || r._approvedAt) return 'Approved';
  return 'Due';
}
function invOfProject(r, p){
  const pid = pidOf(r);
  if (pid) return pid === s(p.id);
  const nm = low(r.projectName || r.project || r.jobName);
  return !!(nm && nm === low(p.name));
}
function invPaid(r){ return /paid/.test(low(r.status)) && !/unpaid|partial/.test(low(r.status)) || r.paidInFull === true; }
function invBalance(r){
  if (invPaid(r)) return 0;
  const amt = num(r.amt != null ? r.amt : (r.amount != null ? r.amount : r.total));
  if (r.openBalance != null && r.openBalance !== '' && isFinite(num(r.openBalance))) return money(num(r.openBalance));
  if (r.balance != null && r.balance !== '') return money(num(r.balance));
  const paid = typeof r.paid === 'number' ? r.paid : num(r.amountPaid || r.paidAmount);
  return money(Math.max(0, amt - paid));
}
function invFinal(r){ return r.isFinal === true || r.final === true || /^final/i.test(s(r.drawType)) || /^final/i.test(s(r.draw)); }
/* patch AUT3: the job's real stage (the CRM moves it: status, the progress slider, schedule milestones) and the
   schedule-template steps the customer may see (p.schedPlan.steps with portal: true) */
const AUT_STAGE = { signed: 4, materials: 4, in_progress: 5, inspection: 5, substantial: 6, complete: 7 };
function portalSteps(p){
  const pl = p && p.schedPlan; if (!pl || !Array.isArray(pl.steps)) return [];
  const t = new Date().toISOString().slice(0, 10);
  const l = pl.steps.filter(function(x){ return x && x.portal === true && s(x.name); }).slice(0, 40).map(function(x){ const e = ymd(x.end) || ymd(x.date); return { name: clip(x.name, 90), date: ymd(x.date), end: ymd(x.end), done: !!x.done || (!!e && e < t) }; });
  const i = l.findIndex(function(x){ return !x.done; }); if (i >= 0) l[i].now = true;
  return l;
}
function stageOf(p, ctx){
  const o = p.portalStage;
  if (o != null && o !== '' && o !== 'auto') {
    const i = typeof o === 'number' ? o : STAGES.map(low).indexOf(low(o));
    if (i >= 0 && i < STAGES.length) return i;
  }
  if (AUT_STAGE[s(p.jobStage)] != null && !/lost|dead|cancel|complete|closed|done|paid/.test(low(p.status))) {   /* patch AUT3 */
    const a = AUT_STAGE[s(p.jobStage)];
    if (a === 7) { const f = ctx.invoices.filter(invFinal); return f.length && !f.some(function(r){ return invBalance(r) > 0; }) ? 8 : 7; }
    return Math.max(a, ctx.openPunch ? 6 : 0);
  }
  const st = low(p.status);
  const finals = ctx.invoices.filter(invFinal);
  const finalOpen = finals.some(function(r){ return invBalance(r) > 0; });
  if (/complete|closed|done|paid/.test(st) || p.paidInFull === true) return finalOpen ? 7 : 8;
  if (finals.length) return finalOpen ? 7 : 8;
  if (/active|approved|progress|on_hold|hold|contract|scheduled/.test(st)) {
    if (ctx.openPunch) return 6;
    if (num(p.pct) >= 95) return 6;
    const today = new Date().toISOString().slice(0, 10), start = ymd(p.startDate);
    if (num(p.pct) > 0 || (start && start <= today)) return 5;
    if (/approved|contract|scheduled/.test(st) || (start && start > today)) return 4;
    return 5;
  }
  /* bidding / estimating / lead */
  if (ctx.proposals > 0 || /estimat|sent|negotiat/.test(st)) return 3;
  const ls = low(ctx.leadStage);
  if (/estimate|negotiat/.test(ls)) return 3;
  if (/site|visit|appoint/.test(ls) || p.appointmentAt || p.siteVisit) return 2;
  if (/contact/.test(ls) || (Array.isArray(p.followUps) && p.followUps.length)) return 1;
  return 0;
}

/* ── THE WHITELIST: the only things a customer ever gets ───────────────────── */
function methodOf(x){
  const t = low([x.method, x.payMethod, x.type, x.note, x.memo, x.ref].filter(function(v){ return typeof v === 'string'; }).join(' '));
  if (/cash/.test(t)) return 'Cash';
  if (/check|chk|cheque|#\s*\d/.test(t)) return 'Check';
  return 'Payment';
}
function carrierWords(p){
  const out = [];
  ['insCarrier', 'carrier', 'insurer', 'insuranceCompany', 'insuranceCarrier', 'insCompany', 'insuranceCo', 'carrierName'].forEach(function(k){
    const v = s(p[k]); if (v.length >= 3) out.push(v);
  });
  return out;
}
/* patch BB2: every claim on the job (gc_kv gc_claims, also a deleted one) — its carrier, program / TPA and the
   adjusting companies are scrubbed from everything the customer gets, like the job's own carrier field */
function claimWords(data, pid, keepCarrier){
  const out = [];
  arr(data && data.gc_claims).forEach(function(c){
    if (!c || s(c.projectId) !== s(pid)) return;
    [keepCarrier ? '' : c.carrier, c.adjuster && c.adjuster.company, c.deskAdjuster && c.deskAdjuster.company, /^none/i.test(s(c.program)) ? '' : c.program].forEach(function(v){ v = s(v); if (v.length >= 3) out.push(v); });
  });
  return out;
}
function scrub(obj, words){
  if (!words.length) return obj;
  const res = words.map(function(w){ return w instanceof RegExp ? w : new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); });
  (function walk(o){
    Object.keys(o).forEach(function(k){
      const v = o[k];
      if (typeof v === 'string' && !/^https?:/.test(v)) { let t = v; res.forEach(function(re){ t = t.replace(re, 'your insurance company'); }); o[k] = t; }
      else if (v && typeof v === 'object') walk(v);
    });
  })(obj);
  return obj;
}
function streetKey(a){ const m = /^\s*(\d+)\s+([A-Za-z]+)/.exec(s(a)); return m ? (m[1] + ' ' + m[2]).toLowerCase() : ''; }
function proposalShown(e, pid, p){
  if (!e || e.portalHide === true) return false;
  let linked = pidOf(e) === pid || (s(e.id) && (s(e.id) === s(p.estimateId) || s(e.id) === s(p._lastEstId)));
  if (!linked && !pidOf(e) && gdocInfo(e.gdocUrl)) {      /* gdocs-sync brings a Doc in without a job: match it */
    const cl = low(p.client), st = streetKey(p.address);
    if ((cl && cl.length >= 4 && (low(e.client) === cl || low(e.name).indexOf(cl) >= 0)) || (st && low(e.name + ' ' + e.address).indexOf(st) >= 0)) linked = true;
  }
  if (!linked) return false;
  if (e.portalShare === true) return true;
  if (/sent|sign|approv|accept|final|won|contract/.test(low(e.status))) return true;
  return !!gdocInfo(e.gdocUrl);   /* a Google Doc proposal linked to the job (gdocs-sync) */
}
function docShown(d, pid, shownEst){
  if (!d || pidOf(d) !== pid) return false;
  if (d.needsReview === true || d.deleted === true) return false;
  if (d.portalShare === true) return true;
  if (d.portalShare === false) return false;
  if (/companycam/i.test(s(d.cat) + s(d.source))) return false;
  if (d.estimateId && shownEst[s(d.estimateId)]) return true;
  return customerFacing(d);
}
/* the papers a customer gets (owner list + the PM Operations Manual forms); never the internal ones */
const CUSTOMER_DOC = /proposal|contract|change.?order|\binvoice|warrant|welcome|faq|completion|certificate of (substantial )?completion|final inspection|sign.?off|lien|waiver|work auth|customer portal|closeout|receipt/i;
const INTERNAL_DOC = /\bsub(contract(or)?)?\b|subcontract|sub.?agreement|job sheet|w-?9|\bcoi\b|certificate of insurance|onboarding|\bbid|vendor|supplier|\bcost|budget|payroll|commission|internal|operations manual|takeoff|purchase order|timesheet|tax return/i;
function customerFacing(d){
  const t = s(d.cat) + ' | ' + s(d.name) + ' | ' + s(d.kind);
  if (INTERNAL_DOC.test(t)) return false;
  return CUSTOMER_DOC.test(t);
}

/* ── patch PORTALGATE (owner, 10/24): "it should be approved for customer portal … even in crm you still have to
   approve in your approvals to put it in the portal for them … it has to go through channels."
   Nothing NEW reaches a customer's portal page without an approval: a proposal / estimate (the estimate builder's,
   a Google Doc's, a Word / PDF upload's — the job's PM approves it; the APM only when "APMs may approve" is on;
   admins always), a document marked for the customer (Docs / Files, Google Docs papers, the default job papers,
   the closeout papers, the warranty), a Google Doc or link on the job. INVOICES ARE NOT GATED (owner, 10/24):
   they go into the portal as before. Each gated thing has a key (e:<estimate> d:<doc> l:<link> g:<job>:<doc url>); gc_kv "gc_portal_gate" (a JSON list) holds
     · one "_meta" row: when the gate started, and the keys every job already showed then (gf) — those stay;
     · one row per key a person decided: approved / rejected / recorded (record-only: never shown) / pending.
   A key the page would show that is neither in gf nor approved is hidden and goes on ✅ Approvals as a
   "portal_publish" item for the job's PM (an admin can approve anything). Approving it shows it in the portal.
   An approved "please sign" e-mail for an estimate / paper approves that key too.
   Not gated (they already need a person): the PM's own 📣 posts and the 🟢 Crew arrived / 🏁 Done for today
   posts, the change orders and papers the customer signs (their e-mails wait on Approvals), payments.
   History / record-only jobs and records (importedHistory / noSend / historyOnly) never go up and never make
   an approval. Data-entry mode: an approval cannot put anything in a portal (use "Approve as record-only").
   Unreadable gate → fail closed: nothing new is shown. ── */
const GATE_KEY = 'gc_portal_gate';
const GATE_TTL = 15e3;
let GATE_LAST = null, GATE_AT = 0;
function gHash(v){ return crypto.createHash('sha256').update(s(v)).digest('hex').slice(0, 12); }
function gateKeyOf(type, x, p){
  if (type === 'g') return 'g:' + s(p && p.id) + ':' + gHash(p && p.gdocUrl);
  if (type === 'l') return 'l:' + (s(x && x.id) || gHash(x && x.url));
  return type + ':' + s(x && x.id);
}
function historyJob(p){ return !!(p && (p.importedHistory === true || p.noSend === true || p.historyOnly === true)); }
function historyRec(r){ return !!(r && (r.importedHistory === true || r.noSend === true || r.historyOnly === true || r.recordOnly === true)); }
function gateParse(list){
  const meta = list.find(function(x){ return x && x.id === '_meta'; }) || null;
  const map = {};
  list.forEach(function(x){ if (x && x.id && x.id !== '_meta') map[s(x.id)] = x; });
  const gf = {};
  if (meta && meta.gf && typeof meta.gf === 'object') Object.keys(meta.gf).forEach(function(pid){ const o = {}; (Array.isArray(meta.gf[pid]) ? meta.gf[pid] : []).forEach(function(k){ o[s(k)] = 1; }); gf[pid] = o; });
  return { ok: !!meta, since: meta ? s(meta.since) : '', map: map, gf: gf };
}
/* what a job's portal page would show WITHOUT the gate (the keys) — the snapshot the gate starts from */
function gateRawKeys(data, p){
  const pid = s(p.id), out = [];
  const ests = arr(data.estimates).filter(function(e){ return proposalShown(e, pid, p); });
  const shownEst = {}; ests.forEach(function(e){ shownEst[s(e.id)] = 1; out.push(gateKeyOf('e', e)); });
  const ins = isInsJob(p) || (p.isInsurance !== false && !!insClaim(data, pid));
  arr(data.projectDocs).filter(function(d){ return ins ? insDocShown(d, pid, shownEst) : docShown(d, pid, shownEst); }).forEach(function(d){ out.push(gateKeyOf('d', d)); });
  if (gdocInfo(p.gdocUrl)) out.push(gateKeyOf('g', null, p));
  arr(p.portalLinks).forEach(function(l){ if (l && l.hidden !== true && httpsUrl(l.url)) out.push(gateKeyOf('l', l)); });
  return out;
}
async function gateGet(data, force){
  if (!force && GATE_LAST && Date.now() - GATE_AT < GATE_TTL) return GATE_LAST;
  let cur = null; try { cur = await kvListRead(GATE_KEY); } catch (e) { cur = null; }
  if (!cur) { return GATE_LAST && Date.now() - GATE_AT < 10 * 60e3 ? GATE_LAST : { ok: false, map: {}, gf: {}, since: '' }; }   /* unreadable: the last good copy (10 min), else closed */
  let G = gateParse(cur.list);
  if (!G.ok) {   /* the first look: everything every job shows today stays; from now on new things wait for an approval */
    try {
      const d = data || await crmData(true);
      const gf = {};
      arr(d.projects).forEach(function(p){ if (p && p.id != null && findProject(d, p.id)) { const k = gateRawKeys(d, p); if (k.length) gf[s(p.id)] = k; } });
      const meta = { id: '_meta', since: new Date().toISOString(), gf: gf, v: 1 };
      const w = await kvListUpdate(GATE_KEY, function(l){ return l.some(function(x){ return x && x.id === '_meta'; }) ? null : { list: [meta].concat(l), check: function(l2){ return l2.some(function(x){ return x && x.id === '_meta'; }); } }; });
      const again = await kvListRead(GATE_KEY);
      G = again ? gateParse(again.list) : (w.ok ? gateParse([meta]) : G);
    } catch (e) { try { console.log('[portal-gate] start failed: ' + (e && e.message || e)); } catch (x) {} }
  }
  if (G.ok) { GATE_LAST = G; GATE_AT = Date.now(); }
  return G;
}
/* may this thing be on the job's portal page? (sync: the gate read last; buildView / notices read it first) */
function gateAllows(G, p, key, rec, pending, info){
  G = G || GATE_LAST;
  if (!G || !G.ok) return false;
  const e = G.map[key];
  if (e && e.st === 'approved') return true;
  if (G.gf[s(p.id)] && G.gf[s(p.id)][key]) return true;
  if (e) return false;                                           /* pending / rejected / recorded */
  if (historyJob(p) || historyRec(rec)) return false;           /* history never goes up and never asks */
  if (pending && info) pending.push(Object.assign({ key: key }, info));
  return false;
}
function gateLabel(t){ return { e: 'Proposal / estimate', d: 'Document', l: 'Link', g: 'Google Doc' }[t] || 'Document'; }
/* a new thing → "pending" on the gate + one approval for the job's PM (idempotent by key) */
async function gateQueue(data, p, pending){
  if (!pending || !pending.length) return 0;
  const now = new Date().toISOString(), pid = s(p.id);
  const add = pending.filter(function(x, i, a){ return a.findIndex(function(y){ return y.key === x.key; }) === i; }).slice(0, 25);
  const r = await kvListUpdate(GATE_KEY, function(l){
    const have = {}; l.forEach(function(x){ if (x && x.id) have[s(x.id)] = 1; });
    const nw = add.filter(function(x){ return !have[x.key]; }).map(function(x){ return { id: x.key, pid: pid, type: x.type, title: clip(x.title, 120), refId: s(x.refId), st: 'pending', at: now, aq: 'aq_gate_' + gHash(x.key) }; });
    if (!nw.length) return null;
    return { list: l.concat(nw), check: function(l2){ return nw.every(function(n){ return l2.some(function(y){ return y && y.id === n.id; }); }); }, result: nw };
  });
  const made = (r && r.ok && Array.isArray(r.result)) ? r.result : [];
  if (made.length) GATE_AT = 0;
  const pm = pmOf(data, p), cust = s(p.client || p.customer || p.clientName) || 'the customer';
  let n = 0;
  for (const g of made) {
    const label = gateLabel(g.type);
    const html = '<p><b>' + esc(label) + ':</b> ' + esc(g.title || label) + '</p><p>Job: ' + esc(jobTag(p) || s(p.name)) + '</p>' +
      '<p>Approve to show it on ' + esc(cust) + '’s GrayCo Portal page. Nothing is e-mailed by this approval. Until then it stays in the CRM only (⏳ Waiting for approval — not in portal).</p>';
    const ok = await queueApproval({ id: g.aq, kind: 'portal_publish', pid: pid, jobName: s(p.name), pm: pm, to: '', channel: 'portal',
      title: '📄 Put in the customer portal — ' + label + ': ' + clip(g.title || label, 90),
      subject: 'Show in ' + cust + '’s portal: ' + clip(g.title || label, 120), html: html, attachments: [],
      meta: { gateKey: g.id, type: g.type, refId: g.refId, urgency: 'soon' } });
    if (ok) n++;
  }
  return n;
}
/* set a key's decision (approved / rejected / recorded); approved also closes its own waiting approval item */
async function gateSet(key, st, me, why){
  key = s(key); if (!key) return false;
  const now = new Date().toISOString();
  const r = await kvListUpdate(GATE_KEY, function(l){
    const x = l.find(function(y){ return y && y.id === key; });
    if (x && x.st === st) return null;
    const row = Object.assign({}, x || { id: key, at: now }, { st: st, by: s(me && me.by), byEmail: s(me && me.email), decidedAt: now, why: clip(why, 120) });
    const nl = x ? l.map(function(y){ return y && y.id === key ? row : y; }) : l.concat([row]);
    return { list: nl, check: function(l2){ return l2.some(function(y){ return y && y.id === key && y.st === st; }); }, result: row };
  });
  GATE_AT = 0;
  if (st === 'approved') {   /* its own "Put in the portal" item, if one waits, is done */
    try { await kvListUpdate(AQ_KEY, function(l){ const it = l.find(function(y){ return y && y.kind === 'portal_publish' && (y.meta || {}).gateKey === key && (y.status === 'waiting' || y.status === 'sending'); }); if (!it) return null;
      it.status = 'sent'; it.sentAt = now; it.sentBy = s(me && me.by) || 'GrayCo'; it.updatedAt = now; it.note = 'Approved with ' + clip(why || 'another approval', 80);
      return { list: l, check: function(l2){ return l2.some(function(y){ return y && y.id === it.id && y.status === 'sent'; }); } }; }); } catch (e) {}
  }
  return !!(r && r.ok);
}
async function gateOnApproved(item, now){
  const m = item.meta || {}, key = s(m.gateKey);
  if (!key) return { ok: false, error: 'This approval has no portal item.' };
  let paused = false; try { paused = await require('./_lib/pause').isPaused(); } catch (e) { paused = false; }
  if (paused) return { ok: false, error: 'Data-entry mode is on: nothing goes to customers, so it was not put in the portal. Use “Approve as record-only”, or approve again after ▶ Resume sending.' };
  const ap = (item.approvals || []).slice(-1)[0] || {};
  const ok = await gateSet(key, 'approved', { by: ap.by, email: ap.email }, 'its approval');
  return ok ? { ok: true, posted: true } : { ok: false, error: 'Could not save it just now — try again.' };
}
/* another approved e-mail that carries the same thing (an invoice e-mail, a "please sign" e-mail) approves it too */
async function gateFromMail(item, me){
  try {
    const m = item.meta || {}, k = s(item.kind);
    if (/^sign_/.test(k) && m.refId) await gateSet((/contract|estimate/.test(k + ' ' + s(m.kind)) ? 'e:' : 'd:') + s(m.refId), 'approved', me, 'the signature e-mail');
  } catch (e) {}
}
/* the 15-minute run (approval-escalate.js) and the CRM ("gate-scan" for one job): every job's new things → Approvals */
async function gateScan(opts){
  opts = opts || {};
  const data = await crmData(true);
  const G = await gateGet(data, true);
  if (!G.ok) return { ok: false, error: 'The portal gate could not be read.' };
  let queued = 0, jobs = 0;
  for (const p of arr(data.projects)) {
    if (!p || p.id == null || !findProject(data, p.id)) continue;
    if (opts.pid && s(p.id) !== s(opts.pid)) continue;
    if (historyJob(p)) continue;
    const pending = [];
    gateCandidates(data, p).forEach(function(c){ gateAllows(G, p, c.key, c.rec, pending, c.info); });
    if (pending.length) { jobs++; queued += await gateQueue(data, p, pending); }
  }
  return { ok: true, queued: queued, jobs: jobs };
}
function gateCandidates(data, p){
  const pid = s(p.id), out = [];
  const ests = arr(data.estimates).filter(function(e){ return proposalShown(e, pid, p); });
  const shownEst = {}; ests.forEach(function(e){ shownEst[s(e.id)] = 1; out.push({ key: gateKeyOf('e', e), rec: e, info: { type: 'e', title: s(e.name) || 'Proposal', refId: s(e.id) } }); });
  const ins = isInsJob(p) || (p.isInsurance !== false && !!insClaim(data, pid));
  arr(data.projectDocs).filter(function(d){ return ins ? insDocShown(d, pid, shownEst) : docShown(d, pid, shownEst); }).forEach(function(d){ if (d.estimateId && shownEst[s(d.estimateId)]) return;   /* an estimate's own PDF follows the estimate's approval */
    out.push({ key: gateKeyOf('d', d), rec: d, info: { type: 'd', title: s(d.name) || 'Document', refId: s(d.id) } }); });
  if (gdocInfo(p.gdocUrl)) out.push({ key: gateKeyOf('g', null, p), rec: p, info: { type: 'g', title: 'Proposal (Google Doc)', refId: '' } });
  arr(p.portalLinks).forEach(function(l){ if (l && l.hidden !== true && httpsUrl(l.url)) out.push({ key: gateKeyOf('l', l), rec: l, info: { type: 'l', title: s(l.title) || 'Link', refId: s(l.id) } }); });
  return out;
}
/* what is waiting on the gate (the CRM shows "⏳ Waiting for approval — not in portal") */
async function gateState(pid){
  const G = await gateGet(null, true);
  if (!G.ok) return { ok: false, error: 'The portal gate could not be read.' };
  const items = Object.keys(G.map).map(function(k){ return G.map[k]; }).filter(function(x){ return !pid || s(x.pid) === s(pid); })
    .map(function(x){ return { key: x.id, pid: x.pid, type: x.type, title: x.title, refId: x.refId, st: x.st, at: x.at, by: x.by || '', decidedAt: x.decidedAt || '' }; });
  return { ok: true, since: G.since, items: items };
}

async function buildView(data, p, opts){
  opts = opts || {};
  const pid = s(p.id);
  const G = await gateGet(data), gatePend = [];   /* patch PORTALGATE */
  const users = arr(data.users), customers = arr(data.customers);
  const invoices = listOf(data, ['invs', 'invoices']).filter(function(r){ return invOfProject(r, p) && isCustomerInvoice(r); });   /* invoices: not gated (owner, 10/24) */
  const cos = listOf(data, ['cos', 'changeOrders']).filter(function(r){ return pidOf(r) === pid && /approv|sign|accept/.test(low(r.status)) && r.deleted !== true; });
  const rawEsts = arr(data.estimates).filter(function(e){ return proposalShown(e, pid, p); });
  const rawEst = {}; rawEsts.forEach(function(e){ rawEst[s(e.id)] = 1; });
  const ests = rawEsts.filter(function(e){ return gateAllows(G, p, gateKeyOf('e', e), e, gatePend, { type: 'e', title: s(e.name) || 'Proposal', refId: s(e.id) }); });   /* patch PORTALGATE */
  const shownEst = {}; ests.forEach(function(e){ shownEst[s(e.id)] = 1; });
  const ins = isInsJob(p) || (p.isInsurance !== false && !!insClaim(data, pid));   /* patch INSP; patch BB2: a job with a claim (gc_claims) is an insurance job */
  const pdocs = arr(data.projectDocs).filter(function(d){ return ins ? insDocShown(d, pid, rawEst) : docShown(d, pid, rawEst); })
    .filter(function(d){ const ek = s(d.estimateId); if (ek && rawEst[ek]) return !!shownEst[ek] || gateAllows(G, p, gateKeyOf('d', d), d, null, null);   /* an estimate's own PDF follows the estimate's approval */
      return gateAllows(G, p, gateKeyOf('d', d), d, gatePend, { type: 'd', title: s(d.name) || 'Document', refId: s(d.id) }); });
  const openPunch = arr(data.punch).some(function(x){ return pidOf(x) === pid && !/complete|done|closed/.test(low(x.status)); });
  const lead = arr(data.leads).find(function(l){ return s(l.fromProjectId) === pid || pidOf(l) === pid; }) || null;

  const clientName = s(p.client || p.customer || p.clientName);
  const cust = customers.find(function(c){ return clientName && low(c.name || c.company) === low(clientName); }) || {};
  const pmName = s(p.pm || p.projectManager);
  const pmUser = users.find(function(u){ return pmName && low(u.name) === low(pmName); }) || {};

  /* files: every crm-files reference shown gets ONE short-lived signed link */
  const postSeen = {};   /* patch AUTAI: approved posts kept by the server (gc_portal_auto_posts) join the job's own */
  const posts = arr(p.portalPosts).concat(arr(data.gc_portal_auto_posts).filter(function(x){ return s(x.pid) === pid; }))
    .filter(function(x){ const k = s(x.id); if (k && postSeen[k]) return false; if (k) postSeen[k] = 1; return true; })
    .filter(function(x){ return x.hidden !== true && (s(x.text) || arr(x.files).length); })
    .sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; }).slice(0, 40);
  const refs = [];
  posts.forEach(function(x){ arr(x.files).forEach(function(f){ refs.push(f.ref); }); });
  pdocs.forEach(function(d){ refs.push(d.ref); });
  invoices.concat(cos).forEach(function(r){ arr(r.files).concat(arr(r._files)).forEach(function(f){ refs.push(f.ref); }); });
  const signed = await signRefs(refs);

  const docs = [];
  const seenUrl = {};
  function addDoc(d){ const key = d.url || d.title; if (seenUrl[key]) return; seenUrl[key] = 1; docs.push(d); }
  ests.forEach(function(e){
    const g = gdocInfo(e.gdocUrl);
    const pdf = arr(data.projectDocs).find(function(d){ return s(d.estimateId) === s(e.id) && pidOf(d) === pid && (refPath(d.ref) || httpsUrl(d.url)); });
    const total = num(e.totalCharge || e.quoteTotal || e.total || e.contract);
    addDoc({ kind: 'proposal', title: clip(e.name || 'Your proposal', 90), date: ymd(e.sentDate || e.date || e.updatedAt),
      total: total > 0 ? money(total) : null,
      status: /sign|approv|accept|won|contract/.test(low(e.status)) ? 'Signed' : 'Sent',
      url: (pdf && (signed[pdf.ref] || httpsUrl(pdf.url))) || (g ? g.url : ''), preview: (pdf && (signed[pdf.ref] || httpsUrl(pdf.url))) ? '' : (g ? g.preview : '') });   /* patch GDOCS: the PDF first — a private Google Doc does not open for the customer */
  });
  const pg = gdocInfo(p.gdocUrl);
  const pgOk = !!pg && gateAllows(G, p, gateKeyOf('g', null, p), p, gatePend, { type: 'g', title: 'Proposal (Google Doc)', refId: '' });   /* patch PORTALGATE */
  if (pgOk) addDoc({ kind: 'gdoc', title: 'Your proposal (Google Doc)', date: '', url: pg.url, preview: pg.preview });
  arr(p.portalLinks).forEach(function(l){
    if (l.hidden === true) return;
    const g = gdocInfo(l.url), u = httpsUrl(l.url);
    if (!u) return;
    if (!gateAllows(G, p, gateKeyOf('l', l), l, gatePend, { type: 'l', title: s(l.title) || 'Link', refId: s(l.id) })) return;   /* patch PORTALGATE */
    addDoc({ kind: g ? 'gdoc' : 'link', title: clip(l.title || (g ? 'Google Doc' : 'Document'), 90), date: ymd(l.at), url: u, preview: g ? g.preview : '' });
  });
  function fileType(ty){ ty = low(ty); return /pdf/.test(ty) ? 'pdf' : (/word|\.docx?\b|msword|rtf/.test(ty) ? 'word' : (/image|jpe?g|png|heic|webp/.test(ty) ? 'image' : 'file')); }
  pdocs.forEach(function(d){
    const u = signed[d.ref] || (d.ref ? '' : httpsUrl(d.url));
    if (!u) return;
    addDoc({ kind: 'file', title: clip(d.name || 'Document', 90), date: ymd(d.uploadedAt || d.uploaded || d.savedAt),
      type: fileType(d.type + ' ' + d.name), url: u });
  });
  /* the papers behind approved change orders and customer invoices (when a PDF is attached) */
  cos.forEach(function(c){ arr(c.files).forEach(function(f, i){ const u = signed[f.ref]; if (u) addDoc({ kind: 'file', title: clip('Change order — ' + (c.desc || c.title || '') , 90), date: ymd(c.date || c.savedAt), type: fileType(f.type + ' ' + f.name), url: u }); }); });
  invoices.forEach(function(r){ arr(r.files).concat(arr(r._files)).forEach(function(f){ const u = signed[f.ref]; if (u && r.needsReview !== true) addDoc({ kind: 'file', title: clip((invFinal(r) ? 'Final invoice ' : 'Invoice ') + s(r.invNum || r.num || ''), 90), date: ymd(r.date || r.sentDate || r.savedAt), type: fileType(f.type + ' ' + f.name), url: u }); }); });

  if (gatePend.length && opts.noGateQueue !== true) { try { await gateQueue(data, p, gatePend); } catch (e) {} }   /* patch PORTALGATE: new things → ✅ Approvals */
  /* money */
  const contract = money(num(p.contractAmount) || num(p.contract) || num(p.contractAmt));
  const invOut = invoices.map(function(r){
    const amount = invAmount(r);
    const bal = invBalance(r);
    return { id: clip(r.id, 80), number: invNumber(r), date: ymd(r.date || r.sentDate || r.created || r.savedAt),
      due: ymd(r.dueDate || r.due), amount: amount, balance: bal, status: invCustStatus(r, bal),
      isFinal: invFinal(r), title: clip(r.drawType || r.desc || '', 90) };   /* the PDF: action 'invoice' with this id */
  }).sort(function(a, b){ return a.date < b.date ? -1 : 1; });
  let payments = [];
  arr(p.drawPayments).concat(arr(p.payments)).forEach(function(x){ const a = money(num(x.amt != null ? x.amt : x.amount)); if (a > 0) payments.push({ date: ymd(x.date || x.at), amount: a, method: methodOf(x) }); });
  arr(data.projectPayments).filter(function(x){ return pidOf(x) === pid && x.deleted !== true; }).forEach(function(x){
    const a = money(num(x.amt != null ? x.amt : x.amount)); if (a > 0) payments.push({ date: ymd(x.date || x.at), amount: a, method: methodOf(x) });
  });
  if (!payments.length) invoices.forEach(function(r){ if (invPaid(r)) payments.push({ date: ymd(r.paidDate || r.payDate || r.date), amount: money(num(r.amt != null ? r.amt : r.amount)), method: methodOf(r) }); });
  const dedupe = {}; payments = payments.filter(function(x){ const k = x.date + '|' + x.amount; if (dedupe[k]) return false; dedupe[k] = 1; return true; })
    .sort(function(a, b){ return a.date < b.date ? -1 : 1; });
  const paid = money(payments.reduce(function(t, x){ return t + x.amount; }, 0));
  const due = money(invOut.reduce(function(t, x){ return t + x.balance; }, 0));

  const stage = stageOf(p, { invoices: invoices, openPunch: openPunch, proposals: ests.length + (pgOk ? 1 : 0), leadStage: lead && (lead.stage || lead.status) });
  const ccId = ccIdOf(p);
  const view = {
    ok: true,
    office: { phone: OFFICE_PHONE },
    customer: { name: clip(clientName || cust.name, 80), firstName: firstName(clientName || cust.name),
      address: clip(p.address || p.jobAddress || cust.address, 160),
      phone: clip(p.clientPhone || p.customerPhone || p.phone || cust.phone, 40),
      email: clip(p.clientEmail || p.customerEmail || p.email || cust.email, 120) },
    job: { name: clip(p.name, 90), address: clip(p.address || p.jobAddress, 160), po: clip(p.autoPO || p.po, 20), stage: stage, stageName: STAGES[stage], stages: STAGES, steps: portalSteps(p) },
    pm: { name: clip(pmName, 60), phone: clip(pmUser.phone || pmUser.cell || pmUser.mobile || '', 40), email: clip(pmUser.email || '', 120) },
    money: { contract: contract, changeOrders: cos.map(function(c){ return { title: clip(c.desc || c.description || c.title || c.name || 'Change order', 120), amount: money(num(c.amt != null ? c.amt : (c.amount != null ? c.amount : c.total))), date: ymd(c.date || c.approvedDate || c.savedAt) }; }),
      invoices: invOut, payments: payments, paid: paid, due: due,
      finalInvoice: invOut.filter(function(x){ return x.isFinal; }).slice(-1)[0] || null },
    posts: posts.map(function(x){ return { id: clip(x.id, 40), at: s(x.at).slice(0, 25), by: firstName(x.by), text: clip(x.text, 2000),
      photos: arr(x.files).map(function(f){ return signed[f.ref] || ''; }).filter(Boolean).slice(0, 12) }; }),
    docs: docs.slice(0, 60),
    companyCam: { url: '', linked: !!ccId },          /* patch U2: the portal never links to CompanyCam */
    warranty: warrantyOf(insClaim(data, pid) ? Object.assign({}, p, { isInsurance: true }) : p, stage),   /* patch BB2: claim jobs = insurance / restoration, 5 years */
    showReview: stage >= 7,
    review: stage >= 7 && jaAllows(data, p, 'reviewRequest') ? { google: REVIEW_URL, facebook: FACEBOOK_URL } : null
  };
  if (ins) {   /* patch INSP: the insurance-claim view */
    insTagDocs(view.docs, pdocs, signed);
    view.insurance = insuranceView(data, p, { stage: stage, cos: cos, invoices: invoices, docs: view.docs,
      payments: arr(p.drawPayments).concat(arr(p.payments), arr(data.projectPayments).filter(function(x){ return pidOf(x) === pid && x.deleted !== true; })) });
    return scrub(view, insWords(data, p));
  }
  const showC = jaAllows(data, p, 'showCarrier') && p.portalShowCarrier !== false;   /* patch BB2: the claim's TPA / adjusting companies are always scrubbed, its carrier unless shown */
  return scrub(view, (showC ? [] : carrierWords(p)).concat(claimWords(data, pid, showC)));
}

/* ── INSURANCE JOBS (patch INSP) ────────────────────────────────────────────────
   "insurance jobs are also going to be in the portal … claim numbers, PDF estimates, etc. When a job is
    marked as insurance, some different things will show for them than for a regular or commercial job."
   A job MARKED insurance (isInsurance true, or type "Insurance Claim") gets view.insurance: the claim box,
   the claim timeline (instead of the 9 job steps), its papers grouped by kind, and the money the insurance
   way. Regular and commercial jobs get exactly what they got before (no view.insurance at all).
   Owner rules kept here:
   • the carrier's name never reaches the customer ("your insurance company") unless the PM turns on
     "Show carrier name to customer" for that job (project.portalShowCarrier — default OFF);
   • the adjuster's name and phone only when the PM allows it (project.portalShowAdjuster — default OFF);
   • internal papers (GrayCo-vs-carrier compare, margins / O&P / costs, sub scopes, anything marked internal)
     are NEVER shown, even if someone ticked them;
   • never GrayCo's costs, margins, O&P or the compare — only the customer's own numbers.
   Data: the job's own fields (claimNumber, deductible, rcv, acv, recoverableDep … as the CRM writes them),
   plus the claim record of patch BB (gc_kv "gc_claims") when that ships — read, never required. */
const INS_STEPS = ['Inspection', 'Claim filed', 'Adjuster meeting', 'Estimate approved by insurance', 'Supplements',
                   'Work scheduled', 'In progress', 'Complete', 'Depreciation released', 'Closed'];
const BB_PHASE_STEP = { 'new loss': 0, 'inspection': 0, 'estimate written': 1, 'submitted to carrier': 2, 'approved': 3, 'supplement': 4,
                        'work': 6, 'final invoice': 7, 'depreciation released': 8, 'closed': 9 };
const INS_GROUPS = [   /* [key, title the customer sees, what it matches (name / category / kind)] — first match wins */
  ['carrier', 'Your insurance company’s estimate', /\b(insurance|carrier|adjuster'?s?|xactimate|claim|insurer)\b.{0,30}\b(estimate|scope|report|summary|approval|letter)|statement of loss|loss (report|summary)|carrier (letter|approval)|\bcarrier\b/i],
  ['supplement', 'Supplements', /supplement/i],
  ['auth', 'Signed work authorization / assignment', /work.?auth|authori[sz]ation|assignment|\baob\b|direction to pay|contract/i],
  ['coc', 'Certificate of completion', /certificate of (substantial )?completion|completion (certificate|cert)|\bcoc\b|satisfaction|completion/i],
  ['invoice', 'Final invoice', /final invoice|\bfinal\b.{0,20}\binvoice/i],
  ['mortgage', 'Mortgage company endorsement', /mortgage|endorse/i],
  ['mitigation', 'Mitigation reports & moisture readings', /mitigation|moisture|drying|dry.?log|readings|psychrometric|dry.?out/i],
  ['photos', 'Damage photos', /damage photo|photo report|photos?\b/i],
  ['grayco', 'GrayCo’s estimate / scope', /estimate|scope|proposal|quote/i]
];
const INS_GROUP_ORDER = ['carrier', 'grayco', 'supplement', 'auth', 'coc', 'invoice', 'mortgage', 'mitigation', 'photos'];   /* how the customer sees them */
const INS_GROUP_TITLE = {}; INS_GROUPS.forEach(function(g){ INS_GROUP_TITLE[g[0]] = g[1]; });
const BB_KIND_GROUP = { workauth: 'auth', aob: 'auth', dtp: 'auth', photos: 'photos', moisture: 'mitigation', dryreport: 'mitigation',
                        coc: 'coc', invoice: 'invoice', letter: 'carrier', check: 'mortgage', estimate: 'grayco', supplement: 'supplement' };
/* never to a customer: the compare, money internals, subs' papers, anything marked internal */
const INS_INTERNAL = /compar|\bvs\.?\b|versus|\bdiff\b|margin|profit|\bo\s*&\s*p\b|o-and-p|overhead|\bcosts?\b|budget|\bsub(contract(or)?)?\b|subcontract|sub.?scope|sub.?bid|commission|payroll|vendor|supplier|takeoff|purchase order|job sheet|internal|\bw-?9\b|\bcoi\b|certificate of insurance/i;
const COMMON_CARRIERS = /\b(state\s*farm|allstate|usaa|liberty\s*mutual|nationwide|travelers|progressive|american\s*family|erie\s*insurance|chubb|the\s*hartford|auto[\s-]*owners|safeco|geico|homesite|metlife|amica|tennessee\s*farmers|farmers\s*insurance|farm\s*bureau|shelter\s*insurance|cincinnati\s*insurance|universal\s*property|citizens\s*property|kemper|hippo\s*insurance|foremost|assurant|american\s*strategic|asi\s*insurance|stillwater)\b/gi;

function isInsJob(p){
  if (!p) return false;
  if (p.isInsurance === true) return true;
  if (p.isInsurance === false) return false;   /* ruled out by hand — final, as in the CRM */
  return /insurance\s*claim/i.test(s(p.type) + ' ' + s(p.jobType));
}
function insClaim(data, pid){ return arr(data && data.gc_claims).find(function(c){ return c && c.deleted !== true && s(c.projectId) === s(pid); }) || null; }
function insWords(data, p){
  /* what is replaced by "your insurance company": the carrier (unless the PM shows it), the TPA / program, the adjusting company */
  const c = insClaim(data, p.id) || {}, out = [];
  const showCarrier = p.portalShowCarrier === true || (p.portalShowCarrier !== false && JA.effective(p, jaAdmin(data)).showCarrier === true);   /* patch JA */
  if (!showCarrier) { carrierWords(p).forEach(function(w){ out.push(w); }); if (s(c.carrier).length >= 3) out.push(s(c.carrier)); out.push(COMMON_CARRIERS); }
  claimWords(data, p.id).forEach(function(w){ if (w !== s(c.carrier) || !showCarrier) out.push(w); });   /* patch BB2: TPA / adjusting company always; the carrier unless shown */
  [p.adjusterCompany, p.adjustingCompany, p.tpa, c.adjuster && c.adjuster.company, c.deskAdjuster && c.deskAdjuster.company, /^none/i.test(s(c.program)) ? '' : c.program]
    .forEach(function(v){ v = s(v); if (v.length >= 3) out.push(v); });
  return out;
}
function insInternal(d){
  if (!d) return true;
  if (d.internal === true || d.portalNever === true) return true;
  return INS_INTERNAL.test([d.cat, d.name, d.kind, d.insKind, d.title].filter(function(v){ return typeof v === 'string'; }).join(' | '));
}
function insGroupOf(d){
  const k = low(d.portalGroup || d.insKind);
  if (INS_GROUP_TITLE[k]) return k;
  if (BB_KIND_GROUP[low(d.kind)]) return BB_KIND_GROUP[low(d.kind)];
  const t = [d.cat, d.name, d.kind, d.title].filter(function(v){ return typeof v === 'string'; }).join(' | ');
  if (/grayco.{0,40}(estimate|scope)|(estimate|scope).{0,40}grayco/i.test(t) && !/supplement/i.test(t)) return 'grayco';   /* GrayCo writes Xactimate estimates too */
  for (const g of INS_GROUPS) if (g[2].test(t)) return g[0];
  return '';
}
/* insurance job: the claim papers show by themselves (each can be turned off); internal ones never */
function insDocShown(d, pid, shownEst){
  if (!d || pidOf(d) !== pid || d.needsReview === true || d.deleted === true) return false;
  if (insInternal(d)) return false;
  if (d.portalShare === true) return true;
  if (d.portalShare === false) return false;
  if (/companycam/i.test(s(d.cat) + s(d.source))) return false;
  if (insGroupOf(d)) return true;
  return docShown(d, pid, shownEst);
}
/* each paper in view.docs gets its group (the customer page shows them under these headings) */
function insTagDocs(docs, pdocs, signed){
  const byUrl = {};
  pdocs.forEach(function(d){ const u = signed[d.ref] || (d.ref ? '' : httpsUrl(d.url)); if (u) byUrl[u] = d; });
  docs.forEach(function(x){
    if (x.kind === 'proposal') { x.group = 'grayco'; return; }
    x.group = insGroupOf(byUrl[x.url] || { name: x.title }) || (x.kind === 'gdoc' ? 'grayco' : 'other');
  });
}
function insLossType(p, c){
  const t = s(c.causeOfLoss || p.lossType || p.typeOfLoss || p.causeOfLoss);   /* patch BB2: the claim first */
  if (t) return clip(t, 40);
  const h = low([p.type, p.jobType, p.name, p.scope].filter(function(v){ return typeof v === 'string'; }).join(' '));
  if (/water|flood|leak|pipe/.test(h)) return 'Water';
  if (/fire|smoke/.test(h)) return 'Fire / smoke';
  if (/hail|wind|storm|tornado/.test(h)) return 'Wind / hail';
  if (/tree/.test(h)) return 'Tree';
  if (/mold/.test(h)) return 'Mold';
  return '';
}
function insIsPay(x){
  if (x.fromInsurance === true || x.insurance === true) return true;
  const t = low([x.from, x.payer, x.source, x.kind, x.type, x.note, x.memo, x.method, x.desc].filter(function(v){ return typeof v === 'string'; }).join(' '));
  return /insur|carrier|mortgage|claim check|\bacv\b|deprec|supplement/.test(t);
}
function insCheckKind(x){
  const t = low([x.kind, x.type, x.note, x.memo, x.desc, x.label].filter(function(v){ return typeof v === 'string'; }).join(' '));
  if (/deprec|recover/.test(t)) return 'Depreciation';
  if (/supplement/.test(t)) return 'Supplement';
  if (/\bacv\b|first|initial/.test(t)) return 'First check (ACV)';
  return 'Insurance check';
}
function insToEndorse(x){
  if (x.endorsedAt || /deposit|cleared|received|endorsed|cashed/.test(low(x.status)) && !/to endorse|not endorsed/.test(low(x.status))) return false;
  return x.endorse === true || /endorse|held|pending|to sign|needs signature|mortgage|waiting/.test(low(x.status));
}
/* patch BB2: the claim's carrier estimate (patch BB versions): the latest approved one, else the latest carrier one */
function claimTotals(c){
  const l = arr(c && c.estimates).filter(function(e){ return e && e.deleted !== true && e.totals && !/grayco/i.test(s(e.side)); });
  const ok = l.filter(function(e){ return /approved/i.test(s(e.status)); });
  const e = (ok.length ? ok : l).slice(-1)[0];
  return e ? { rcv: num(e.totals.rcv), acv: num(e.totals.acv), recDep: num(e.totals.recDep) } : { rcv: 0, acv: 0, recDep: 0 };
}
function claimRecDep(c){ return claimTotals(c).recDep; }
function insMoney(p, c, ctx){
  const today = new Date().toISOString().slice(0, 10);
  const deductible = money(num(c.deductible) || num(p.deductible));   /* patch BB2: the claim first */
  /* what the customer pays on top of the deductible: upgrades / items the insurance does not cover.
     An approved change order counts unless it is a supplement (the insurance pays those). */
  const upgrades = [];
  ctx.cos.forEach(function(co){
    const t = [co.desc, co.description, co.title, co.name, co.type, co.payer].filter(function(v){ return typeof v === 'string'; }).join(' ');
    if (co.supplement === true || /supplement|insurance pays|carrier/i.test(t) || /insur|carrier/i.test(s(co.payer))) return;
    const a = money(num(co.amt != null ? co.amt : (co.amount != null ? co.amount : co.total)));
    if (a > 0) upgrades.push({ title: clip(co.desc || co.description || co.title || co.name || 'Upgrade', 120), amount: a });
  });
  arr(p.nonCovered).concat(arr(p.upgrades)).forEach(function(x){
    if (x.deleted === true) return;
    const a = money(num(x.amt != null ? x.amt : x.amount)); if (a > 0) upgrades.push({ title: clip(x.title || x.desc || x.name || 'Upgrade', 120), amount: a });
  });
  const extras = num(p.ownerExtras) || num(c.ownerExtras);
  if (!upgrades.length && extras > 0) upgrades.push({ title: 'Upgrades / items your insurance does not cover', amount: money(extras) });
  const upgradesTotal = money(upgrades.reduce(function(t, x){ return t + x.amount; }, 0));

  /* every payment, split into the customer's own and the insurance checks */
  const yours = [], checks = [], seen = {};
  function addPay(x, forceIns){
    const a = money(num(x.amt != null ? x.amt : x.amount)); if (!(a > 0) || x.deleted === true || /void/i.test(s(x.status))) return;
    const date = ymd(x.date || x.at || x.receivedAt), ins = forceIns || insIsPay(x);
    const k = date + '|' + a; if (seen[k]) return; seen[k] = 1;
    if (ins) checks.push({ date: date, amount: a, kind: insCheckKind(x), endorse: insToEndorse(x) });
    else yours.push({ date: date, amount: a, method: methodOf(x) });
  }
  arr(p.insChecks).forEach(function(x){ addPay(x, true); });
  arr(c.payments).forEach(function(x){ if (/carrier|mortgage|insur/i.test(s(x.from))) addPay(x, true); else if (/owner|home|customer/i.test(s(x.from))) addPay(x, false); });
  ctx.payments.forEach(function(x){ addPay(x, false); });
  if (!yours.length && !checks.length) ctx.invoices.forEach(function(r){ if (invPaid(r)) addPay({ date: r.paidDate || r.payDate || r.date, amount: num(r.amt != null ? r.amt : r.amount), method: r.method, note: r.payer }, false); });
  yours.sort(function(a, b){ return a.date < b.date ? -1 : 1; }); checks.sort(function(a, b){ return a.date < b.date ? -1 : 1; });
  const paidByYou = money(yours.reduce(function(t, x){ return t + x.amount; }, 0));
  const youOwe = money(deductible + upgradesTotal);

  /* recoverable depreciation: held back by the insurance company until the work is done */
  const ct = claimTotals(c);   /* patch BB2: the carrier's approved estimate on the claim */
  const rcv = money(num(p.rcv) || num(p.totalRCV) || ct.rcv), acv = money(num(p.acv) || num(p.totalACV) || ct.acv);
  let recDep = money(num(c.recoverableDep) || claimRecDep(c) || num(p.recoverableDep) || num(p.recoverableDepreciation) || num(p.depreciation) || num(p.totalDepreciation) || (rcv > acv && acv > 0 ? rcv - acv : 0));
  const depChecks = checks.filter(function(x){ return x.kind === 'Depreciation' && !x.endorse; });
  const released = money(depChecks.reduce(function(t, x){ return t + x.amount; }, 0) || num(p.depReleasedAmount));
  const ds = low(c.depStatus || p.depStatus);
  let status = '';
  if (/released|paid|received/.test(ds) || p.depReleased === true || (recDep > 0 && released >= recDep - 0.5)) status = 'released';
  else if (/request|asked|sent/.test(ds) || p.depRequestedAt) status = 'requested';
  else if (/none|n\/a|no dep/.test(ds)) status = 'none';
  else if (recDep > 0 || released > 0 || /held/.test(ds)) status = ctx.complete ? 'requested' : 'held';
  const depText = {
    held: 'Your insurance company holds this back until the work is done. When we finish, we send them the completion papers and they release it.',
    requested: 'The work is done — we have asked your insurance company to release it. It usually takes 2–4 weeks.',
    released: 'Released by your insurance company.',
    none: 'No depreciation was held back on this claim.'
  }[status] || '';
  return {
    deductible: deductible, upgrades: upgrades, upgradesTotal: upgradesTotal, youOwe: youOwe, paidByYou: paidByYou,
    balance: money(Math.max(0, youOwe - paidByYou)),
    claimTotal: rcv > 0 ? rcv : null,
    checksReceived: checks.filter(function(x){ return !x.endorse; }).map(function(x){ return { date: x.date, amount: x.amount, kind: x.kind }; }),
    checksToEndorse: checks.filter(function(x){ return x.endorse; }).map(function(x){ return { date: x.date, amount: x.amount, kind: x.kind }; }),
    depreciation: status ? { amount: recDep > 0 ? recDep : null, released: released > 0 ? released : null, status: status, text: depText } : null,
    payments: yours.map(function(x){ return { date: x.date, amount: x.amount, from: 'You', method: x.method }; })
      .concat(checks.filter(function(x){ return !x.endorse; }).map(function(x){ return { date: x.date, amount: x.amount, from: 'Insurance check', method: x.kind }; }))
      .sort(function(a, b){ return a.date < b.date ? -1 : 1; }),
    today: today
  };
}
function insTimeline(p, c, stage, f, m, groups, cos, invoices){
  /* the step the claim is IN = the furthest step reached; everything before it is done */
  const today = new Date().toISOString().slice(0, 10);
  const st = low(p.status);
  const complete = stage >= 7 || !!ymd(p.completionDate || p.completedAt);
  const supps = arr(p.supplements).concat(arr(c.supplements)).filter(function(x){ return x.deleted !== true; });
  const suppPending = /pending|sent|submitted|waiting|requested/.test(low(p.supplementStatus)) ||
    supps.some(function(x){ return !/approv|paid|denied|declin|closed|done/.test(low(x.status)); });
  const suppAny = suppPending || supps.length > 0 || !!groups.supplement || cos.some(function(co){ return /supplement/i.test(s(co.desc) + s(co.title)) || co.supplement === true; });
  const depReleased = !!m.depreciation && m.depreciation.status === 'released';
  const depNone = !m.depreciation || m.depreciation.status === 'none';
  const reached = [
    true,
    !!f.claimNumber || !!p.claimFiledAt,
    !!f.adjusterMeeting || !!p.adjusterMetAt,
    p.insApproved === true || !!p.insApprovedAt || num(p.rcv) > 0 || num(p.totalRCV) > 0 || !!groups.carrier,
    suppPending,
    stage >= 5 || (stage === 4 && (!!ymd(p.startDate) || /schedul|contract/.test(st))),
    stage >= 5,
    complete,
    complete && depReleased,
    /closed/.test(st) || ((p.paidInFull === true || /\bpaid\b/.test(st) || (invoices.some(invFinal) && !invoices.some(function(r){ return invFinal(r) && invBalance(r) > 0; }))) && (depReleased || depNone))
  ];
  let now = 0;
  for (let i = reached.length - 1; i >= 0; i--) if (reached[i]) { now = i; break; }
  const ph = BB_PHASE_STEP[low(c.phase)]; if (ph != null && ph > now) now = ph;   /* the claim record (patch BB) */
  const o = p.portalInsStage;
  if (o != null && o !== '' && o !== 'auto') {
    const i = typeof o === 'number' ? o : INS_STEPS.map(low).indexOf(low(o));
    if (i >= 0 && i < INS_STEPS.length) now = i;
  }
  const steps = INS_STEPS.map(function(n, i){
    let state = i < now ? 'done' : (i === now ? 'now' : 'todo'), note = '';
    if (i === 4 && i !== now) { if (i < now && !suppAny) { state = 'skipped'; note = 'none needed'; } else if (i > now) note = 'only if needed'; }
    if (i === 8 && i < now && depNone && !depReleased) { state = 'skipped'; note = 'none held back'; }
    if (i === 2 && f.adjusterMeeting) note = (f.adjusterMeeting > today ? 'set for ' : '') + f.adjusterMeeting;
    if (i === 5 && ymd(p.startDate) && now <= 5) note = 'start ' + ymd(p.startDate);
    return { name: n, state: state, note: note };
  });
  return { steps: steps, now: now, nowName: INS_STEPS[now] };
}
function insuranceView(data, p, ctx){
  const c = insClaim(data, p.id) || {};
  const adj = (c.adjuster && typeof c.adjuster === 'object') ? c.adjuster : {};
  const pa = (p.adjuster && typeof p.adjuster === 'object') ? p.adjuster : {};
  const f = {
    /* patch BB2: one set of claim data — once the job has a claim (gc_claims) the claim holds these; the job's own
       fields (patch INSP, before the claim was opened) are the fallback */
    claimNumber: clip(c.claimNumber || p.claimNumber || p.claimNo, 40),
    dateOfLoss: ymd(c.dateOfLoss || p.dateOfLoss || p.lossDate),
    lossType: insLossType(p, c),
    deductible: money(num(c.deductible) || num(p.deductible)),
    carrier: s(c.carrier || carrierWords(p)[0]),
    adjusterName: clip(adj.name || p.adjusterName || (typeof p.adjuster === 'string' ? p.adjuster : pa.name), 60),
    adjusterPhone: clip(adj.phone || p.adjusterPhone || pa.phone, 40),
    adjusterMeeting: ymd(c.adjusterMeetingAt || p.adjusterMeetingAt || p.adjusterMeeting || p.adjusterVisit),
    mortgageCo: clip(c.mortgageCo || p.mortgageCo || p.mortgageCompany, 80)
  };
  const groups = {}; ctx.docs.forEach(function(d){ if (d.group) groups[d.group] = (groups[d.group] || 0) + 1; });
  ctx.complete = ctx.stage >= 7 || !!ymd(p.completionDate || p.completedAt);
  const m = insMoney(p, c, ctx);
  const tl = insTimeline(p, c, ctx.stage, f, m, groups, ctx.cos, ctx.invoices);
  const showCarrier = p.portalShowCarrier === true && !!f.carrier;
  const showAdj = p.portalShowAdjuster === true && !!(f.adjusterName || f.adjusterPhone);
  delete m.today;
  return {
    claim: {
      number: f.claimNumber, dateOfLoss: f.dateOfLoss, lossType: f.lossType, deductible: f.deductible > 0 ? f.deductible : null,
      company: showCarrier ? clip(f.carrier, 60) : 'your insurance company', companyShown: showCarrier,
      adjuster: showAdj ? { name: f.adjusterName, phone: f.adjusterPhone } : null,
      adjusterMeeting: f.adjusterMeeting, mortgage: f.mortgageCo
    },
    timeline: tl.steps, now: tl.now, nowName: tl.nowName,
    groups: INS_GROUP_ORDER.map(function(k){ return { key: k, title: INS_GROUP_TITLE[k] }; }),
    money: m
  };
}

/* ── warranty (owner rule, final 10/21 — patch WAR): 5 years on ALL roof jobs (insurance or not) and on insurance
   jobs (restoration, water, fire, rebuild-only, mitigation-only); 1 year on everything else. Manufacturer warranties
   on materials are separate. Starts at completion. ── */
function warrantyOf(p, stage){
  const t = low([p.type, p.name, p.scope, p.scopeOfWork, p.jobType].filter(function(x){ return typeof x === 'string'; }).join(' '));
  const roof = /roof|shingle|re-?roof/.test(t);
  const ins = p.isInsurance === true || /insurance|restoration|fire damage|water damage|storm|claim|mitigation|rebuild/.test(t);
  const years = roof || ins ? 5 : 1;
  const kind = roof ? 'Roof' : (ins ? 'Insurance / restoration' : 'Workmanship');
  const start = ymd(p.completionDate || p.completedAt) || (stage >= 8 ? ymd(p.endDate) : '');
  let end = '';
  if (start) { const d = new Date(start + 'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + years); end = d.toISOString().slice(0, 10); }
  return { years: years, title: kind + ' warranty — ' + years + ' year' + (years > 1 ? 's' : ''), start: start, end: end };
}

/* ── the link table ────────────────────────────────────────────────────────── */
function newToken(){ return crypto.randomBytes(32).toString('base64url'); }   // 256 bits
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
async function tokenRow(token){
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal?select=token,project_id,revoked,last_viewed_at&token=eq.' + encodeURIComponent(token), { headers: H() });
  if (!r.ok) return null;
  const rows = await r.json();
  const row = Array.isArray(rows) && rows[0];
  if (!row || typeof row.token !== 'string') return null;
  const a = Buffer.from(row.token), b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return row;
}
/* 33.151: a customer signed in with a code (portal-access.js). The session row lists the link codes of the jobs
   it may open; a link turned off in the CRM closes that job (and with no link left, the session). */
async function sessionRow(sessTok, pid){
  const id = crypto.createHash('sha256').update(sessTok).digest('hex');
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal_session?select=kind,links,expires_at,revoked&id=eq.' + id, { headers: H() });
  if (!r.ok) return null;
  const ses = ((await r.json()) || [])[0];
  if (!ses || ses.kind !== 'customer' || ses.revoked === true || Date.parse(ses.expires_at) < Date.now()) return null;
  const links = (Array.isArray(ses.links) ? ses.links : []).map(String).filter(function(t){ return TOKEN_RE.test(t); });
  if (!links.length) return null;
  const q = await fetch(sbUrl() + '/rest/v1/gc_portal?select=token,project_id,revoked,last_viewed_at&revoked=eq.false&token=in.(' + links.map(function(t){ return '"' + t + '"'; }).join(',') + ')', { headers: H() });
  if (!q.ok) return null;
  const live = (await q.json()) || [];
  return live.find(function(x){ return String(x.project_id) === String(pid); }) || (!pid && live.length === 1 ? live[0] : null);
}
/* what went wrong, in plain words (shown on the job card) */
function dbError(status, what){
  const e = new Error(what || 'db');
  if (status === 0) e.plain = 'The server cannot reach Supabase — check SUPABASE_URL on Netlify.';
  else if (status === 401 || status === 403) e.plain = 'Server setting wrong: Supabase does not accept SUPABASE_SERVICE_KEY (it must be the service_role key).';
  else if (status === 404 || status === 400) { e.setup = true; e.plain = 'Portal not set up: run docs/portal-setup.sql in Supabase.'; }
  else e.plain = 'The database answered ' + status + ' — try again in a minute.';
  return e;
}
async function sbFetch(url, init){
  try { return await fetch(url, init); } catch (e) { throw dbError(0); }
}
async function activeFor(pid){
  const r = await sbFetch(sbUrl() + '/rest/v1/gc_portal?select=token,created_at,last_viewed_at&revoked=eq.false&project_id=eq.' + encodeURIComponent(pid) + '&order=created_at.desc&limit=1', { headers: H() });
  if (!r.ok) throw dbError(r.status, 'gc_portal read');
  const rows = await r.json();
  return (Array.isArray(rows) && rows[0]) || null;
}
async function createFor(pid, by){
  const have = await activeFor(pid);
  if (have) return have.token;
  const token = newToken();
  const r = await sbFetch(sbUrl() + '/rest/v1/gc_portal', { method: 'POST', headers: H({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ token: token, project_id: pid, created_by: clip(by, 120), revoked: false }) });
  if (!r.ok) {
    const again = await activeFor(pid);     /* someone else made it this instant (one active link per job) */
    if (again) return again.token;
    throw dbError(r.status, 'gc_portal write');
  }
  return token;
}
async function revokeFor(pid){
  const r = await sbFetch(sbUrl() + '/rest/v1/gc_portal?revoked=eq.false&project_id=eq.' + encodeURIComponent(pid), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ revoked: true }) });
  if (!r.ok) throw dbError(r.status, 'gc_portal update');
}
function baseUrl(event){
  const env = s(process.env.PORTAL_BASE_URL).replace(/\/$/, '');
  if (/^https:\/\//.test(env)) return env;
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event || {}, 'origin').replace(/\/$/, '');
  return allowed.indexOf(origin) > -1 ? origin : allowed[0];
}
/* 33.151: on the portal's own address (PORTAL_BASE_URL = https://portal.grayco-cs.com) a link is <address>/#t=…;
   on the CRM's address it stays /portal.html#t=… — and every link already sent (crm.grayco-cs.com/portal.html#t=…) keeps working */
function linkFor(event, token){ const b = baseUrl(event); return b + (/^https:\/\/portal\./.test(b) ? '/#t=' : '/portal.html#t=') + token; }

/* ── a simple per-address rate limit (per warm instance) ──────────────────── */
const hits = new Map();
const LIMIT = { req: 60, bad: 8, windowMs: 10 * 60e3 };
function ipOf(event){
  return s(gcHeader(event, 'x-nf-client-connection-ip') || gcHeader(event, 'x-forwarded-for').split(',')[0] || gcHeader(event, 'client-ip') || 'unknown');
}
function limited(ip){
  const now = Date.now(); let h = hits.get(ip);
  if (!h || now - h.start > LIMIT.windowMs) { h = { start: now, req: 0, bad: 0 }; hits.set(ip, h); }
  h.req++;
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return h.req > LIMIT.req || h.bad >= LIMIT.bad;
}
function noteBad(ip){ const h = hits.get(ip); if (h) h.bad++; }

/* ── final invoice e-mail + the 15-day reminder (shared with portal-reminders.js) ── */
const DAY = 86400e3, REMIND_EVERY = 15 * DAY;
function mailOff(){ return process.env.PORTAL_MAIL_OFF === '1' || process.env.PORTAL_MAIL_OFF === 'true'; }
/* Owner rule (19 Oct 2026): no automatic e-mail goes to a customer without a person approving it.
   Until the approval list ships, every automatic send (new-job link, new-paper notice, final invoice and
   its reminders) becomes an Office to-do instead. PORTAL_AUTO_EMAIL=1 on Netlify turns automatic sending back on. */
function needsApproval(){ return process.env.PORTAL_AUTO_EMAIL !== '1'; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function usd(n){ return '$' + money(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function mailHtml(kind, v, link){
  const pmName = v.pm.name || 'your Project Manager';
  const inv = v.money.finalInvoice || {};
  const lead = kind === 'first'
    ? 'Your job is done, and your final invoice is ready. Thank you for choosing GrayCo!'
    : 'Just a friendly reminder — your final invoice is still open. If you already paid, thank you, and please ignore this note.';
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E">' +
    '<div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center">' +
    '<img src="' + esc(baseUrl({}) + '/portal-logo.png') + '" alt="GrayCo Construction Services" width="180" style="display:block;margin:0 auto 6px">' +
    '<div style="font-size:18px;font-weight:bold">' + esc(v.job.name) + '</div></div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px">' +
    '<p style="font-size:15px">Hi ' + esc(v.customer.firstName || 'there') + ',</p>' +
    '<p style="font-size:15px;line-height:1.5">' + lead + '</p>' +
    '<p style="font-size:15px;line-height:1.5"><b>Amount due: ' + usd(v.money.due) + '</b>' + (inv.number ? ' (invoice ' + esc(inv.number) + ')' : '') + '</p>' +
    '<p style="font-size:15px;line-height:1.5">How to pay: a <b>check</b> made out to GrayCo Construction Services, or <b>cash</b> — hand it to ' + esc(pmName) + '. Every payment shows on your final invoice.</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">See your invoice in my GrayCo Portal</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions about this invoice? ' + esc(billingEmail()) + ' · ' + OFFICE_PHONE + (v.pm.phone ? ' (or ' + esc(pmName) + ' at ' + esc(v.pm.phone) + ')' : '') + '.</p>' +   /* patch BILL */
    '</div></div>';
}
async function sendMail(to, subject, html){
  const key = s(process.env.RESEND_API_KEY);
  if (!key || mailOff()) return { ok: false, skipped: 'no-key' };
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: billingFrom(), reply_to: billingEmail(), to: [to], subject: subject, html: html }) });   /* patch BILL */
  return { ok: r.ok, status: r.status };
}
async function mailRows(){
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal_mail?select=*&limit=5000', { headers: H() });
  if (!r.ok) return null;
  const rows = await r.json(); const by = {};
  (Array.isArray(rows) ? rows : []).forEach(function(x){ by[x.invoice_id] = x; });
  return by;
}
/* claim the send: the row only changes if nobody else changed it first — no double send */
async function claim(invId, pid, prev, now){
  if (!prev) {
    const r = await fetch(sbUrl() + '/rest/v1/gc_portal_mail', { method: 'POST', headers: H({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({ invoice_id: invId, project_id: pid, last_reminder_at: now, reminders: 0 }) });
    if (!r.ok) return false;
    const rows = await r.json().catch(function(){ return []; });
    return Array.isArray(rows) && rows.length === 1;
  }
  const cond = prev.last_reminder_at ? 'last_reminder_at=eq.' + encodeURIComponent(prev.last_reminder_at) : 'last_reminder_at=is.null';
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal_mail?invoice_id=eq.' + encodeURIComponent(invId) + '&' + cond,
    { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ last_reminder_at: now }) });
  if (!r.ok) return false;
  const rows = await r.json().catch(function(){ return []; });
  return Array.isArray(rows) && rows.length === 1;
}
async function patchMail(invId, fields){
  await fetch(sbUrl() + '/rest/v1/gc_portal_mail?invoice_id=eq.' + encodeURIComponent(invId), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify(fields) });
}
/* The office to-do list (gc_kv "gc_office_tasks") is the CRM's: it keeps it as JSON TEXT (a string), and its sync
   reads it that way. An array written here was dropped by the CRM and then written over, so the to-do never showed.
   Read either shape, add the to-do once (stable id), write it back as the CRM writes it (a string), and look again
   just before writing and right after, so a save from the CRM in between never loses either side's to-dos. */
function taskListOf(v){
  if (v == null || v === '') return [];
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
  return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : null;
}
async function kvListRead(key){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value,updated_at&key=eq.' + encodeURIComponent(key), { headers: H() });
  if (!r.ok) return null;
  const rows = await r.json().catch(function(){ return null; });
  if (!Array.isArray(rows)) return null;
  const list = taskListOf(rows[0] && rows[0].value);
  return list ? { list: list, at: s(rows[0] && rows[0].updated_at) } : null;   /* unreadable: never write over it */
}
/* change a shared list in gc_kv without losing anybody's save: read, change, read again just before writing
   (changed meanwhile: start over), write it as JSON text (the CRM's format), read back (a save that landed at
   the same moment took ours out: start over). mutate(list) returns null (nothing to write) or { list, check, result }. */
async function kvListUpdate(key, mutate){
  for (let tries = 0; tries < 5; tries++) {
    const cur = await kvListRead(key);
    if (!cur) return { ok: false, error: 'unreadable' };
    const m = mutate(JSON.parse(JSON.stringify(cur.list)));
    if (!m || !m.list) return { ok: true, result: m && m.result, list: cur.list, unchanged: true };
    const again = await kvListRead(key);                        /* re-read just before writing */
    if (!again) return { ok: false, error: 'unreadable' };
    if (again.at !== cur.at || JSON.stringify(again.list) !== JSON.stringify(cur.list)) { await sleep(150 + 200 * tries); continue; }
    const w = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ key: key, value: JSON.stringify(m.list), updated_at: new Date().toISOString() }) });
    if (!w.ok) return { ok: false, error: 'write ' + w.status };
    const after = await kvListRead(key);
    if (!after || !m.check || m.check(after.list)) return { ok: true, result: m.result, list: after ? after.list : m.list };
    await sleep(150 + 200 * tries);
  }
  return { ok: false, error: 'busy' };
}
async function officeTodo(id, label, note){
  try {
    id = s(id);
    const now = new Date().toISOString();
    const item = { id: id, label: label, note: note, addedBy: 'Customer portal', addedAt: now, updatedAt: now, done: false };
    const has = function(l){ return l.some(function(t){ return s(t.id) === id; }); };
    const r = await kvListUpdate('gc_office_tasks', function(l){ return has(l) ? null : { list: l.concat([item]), check: has }; });
    return r.ok;
  } catch (e) { return false; }
}

/* ── patch AP2: the invoice PDF (portal + e-mail attachment), the invoice e-mail approval, GrayCo News ── */
function invPdfLib(){ return require('./_lib/invoice-pdf.js'); }
function newsLib(){ return require('./_lib/news.js'); }
function mktLib(){ return require('./_lib/mkt.js'); }   /* patch MKT: marketing e-mails, social posts, door hangers */
function invoiceDoc(data, p, r){
  const users = arr(data.users), customers = arr(data.customers);
  const clientName = s(p.client || p.customer || p.clientName || r.client || r.customer);
  const cust = customers.find(function(c){ return clientName && low(c.name || c.company) === low(clientName); }) || {};
  const pmName = s(p.pm || p.projectManager);
  const pmUser = users.find(function(u){ return pmName && low(u.name) === low(pmName); }) || {};
  const total = invAmount(r), bal = invBalance(r);
  let lines = arr(r.lines).map(function(l){ return { desc: s(l.desc || l.description || l.name || l.item), amt: l.amt != null ? num(l.amt) : (l.amount != null ? num(l.amount) : (l.total != null ? num(l.total) : null)) }; })
    .filter(function(l){ return l.desc || l.amt; });
  if (!lines.length) lines = [{ desc: s(r.desc || r.description || r.drawType || 'Invoice'), amt: total }];
  return { number: invNumber(r), date: ymd(r.date || r.sentDate || r.created || r.savedAt), due: ymd(r.dueDate || r.due), terms: s(r.terms),
    status: invCustStatus(r, bal), client: clip(clientName || cust.name, 80), address: clip(p.address || p.jobAddress || cust.address, 160),
    email: clip(p.clientEmail || p.customerEmail || p.email || cust.email, 120), job: clip(p.name, 90), jobAddress: clip(p.address || p.jobAddress, 160),
    po: clip(p.autoPO || r.po || p.po, 20), lines: lines, total: total, paid: money(Math.max(0, total - bal)), balance: bal, isFinal: invFinal(r),
    pm: clip(pmName, 60), pmPhone: clip(pmUser.phone || pmUser.cell || pmUser.mobile || '', 40) };
}
function invoicePdf(data, p, r){
  const doc = invoiceDoc(data, p, r);
  return { doc: doc, filename: 'GrayCo Invoice ' + doc.number.replace(/[^A-Za-z0-9 _.-]/g, '') + '.pdf', pdf: invPdfLib().build(doc) };
}
/* the invoice and its job, for a staff preview or the send (null: not one the customer may see) */
function invoiceAndJob(data, invId){
  const r = listOf(data, ['invs', 'invoices']).find(function(x){ return s(x.id) === s(invId); });
  if (!r) return null;
  let p = pidOf(r) ? findProject(data, pidOf(r)) : null;
  if (!p) { const nm = low(r.projectName || r.project || r.jobName); p = nm ? arr(data.projects).find(function(x){ return low(x.name) === nm; }) || null : null; }
  return p ? { r: r, p: p } : null;
}
function invoiceMailHtml(doc, pmPhone){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E">' +
    '<div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center">' +
    '<img src="' + esc(baseUrl({}) + '/portal-logo.png') + '" alt="GrayCo Construction Services" width="180" style="display:block;margin:0 auto 6px">' +
    '<div style="font-size:18px;font-weight:bold">' + esc(doc.job) + '</div></div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px">' +
    '<p style="font-size:15px">Hi ' + esc(firstName(doc.client) || 'there') + ',</p>' +
    '<p style="font-size:15px;line-height:1.5">Your ' + (doc.isFinal ? 'final ' : '') + 'invoice from GrayCo is attached as a PDF.</p>' +
    '<p style="font-size:15px;line-height:1.5"><b>Invoice #' + esc(doc.number) + ' \u2014 ' + usd(doc.total) + '</b>' + (doc.balance !== doc.total ? ' (balance due ' + usd(doc.balance) + ')' : '') + (doc.due ? '<br>Due ' + esc(doc.due) : '') + '</p>' +
    '<p style="font-size:15px;line-height:1.5">How to pay: a <b>check</b> made out to GrayCo Construction Services, or <b>cash</b> \u2014 hand it to ' + esc(doc.pm || 'your Project Manager') + '.</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + LINK_PH + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">See your invoices in my GrayCo Portal</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions? Call us at ' + OFFICE_PHONE + (pmPhone ? ' or ' + esc(doc.pm) + ' at ' + esc(pmPhone) : '') + '.</p>' +
    '</div></div>';
}
/* a client invoice made in the CRM (not a draft, not paid, not a QuickBooks copy, made since AP2 went in) */
const INV_MAIL_SINCE = '2026-10-21';
/* patch LCLEAN (owner 10/23, back-entering 2025): history is a record, never mail — an invoice imported or entered as
   history (importedHistory / noSend / historyOnly), or one whose own date is before AP2 went in */
function isHistoryInvoice(r){
  if (!r) return false;
  if (r.importedHistory === true || r.noSend === true || r.historyOnly === true) return true;
  const d = s(r.date || r.invoiceDate || r.invDate).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d < INV_MAIL_SINCE;
}
function invMailWanted(r){
  if (!isCustomerInvoice(r) || invPaid(r) || invBalance(r) <= 0) return false;
  if (isHistoryInvoice(r)) return false;   /* patch LCLEAN */
  if (/pending|ready_for_review/.test(low(r.status)) || r._autoDrafted === true && /draft/.test(low(r.status))) return false;
  if (/quickbooks|^qb/i.test(s(r.source)) || r.qbId || r.qbKey) return false;
  const made = s(r.createdAt || r.created || r.savedAt || r.date).slice(0, 10);
  return !!made && made >= INV_MAIL_SINCE;
}
async function queueInvoiceMail(invId, who, opts){
  opts = opts || {};
  const data = opts.data || await crmData(true);
  const ij = invoiceAndJob(data, invId);
  if (!ij) return { status: 404, out: { ok: false, retry: true, error: 'The invoice (or its job) is not in the cloud yet.' } };
  const r = ij.r, p = ij.p;
  if (!jaAllows(data, p, 'invoiceEmail')) return { status: 200, out: { ok: true, off: 'invoiceEmail', queued: false, error: 'Invoice e-mails are turned off for this job (⚙ Automations).' } };   /* patch JA */
  if (!isCustomerInvoice(r)) return { status: 400, out: { ok: false, notReady: true, error: 'A draft (or an invoice still in review) is not e-mailed.' } };
  const qid = 'appr_inv_' + s(r.id);
  const cur = await kvListRead(AQ_KEY);
  if (cur && cur.list.some(function(x){ return s(x.id) === qid || (x.status !== 'rejected' && s((x.meta || {}).invoiceId) === s(r.id)); }))
    return { status: 200, out: { ok: true, id: qid, already: true } };
  const view = await buildView(data, p);
  const to = s(view.customer.email);
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to)) return { status: 200, out: { ok: false, noEmail: true, error: 'No customer e-mail on this job.' } };
  const doc = invoiceDoc(data, p, r);
  const title = 'Invoice #' + doc.number + ' ' + usd(doc.total) + ' to ' + (doc.client || to);
  const q = await queueApproval({ id: qid, kind: 'invoice', pid: s(p.id), jobName: p.name, pm: pmOf(data, p), to: to, title: title,
    subject: 'Invoice #' + doc.number + ' from GrayCo Construction Services \u2014 ' + usd(doc.balance || doc.total),
    html: invoiceMailHtml(doc, doc.pmPhone), attachments: [{ name: 'GrayCo Invoice ' + doc.number + '.pdf', kind: 'pdf', invoiceId: s(r.id) }],
    meta: { invoiceId: s(r.id), invoiceNumber: doc.number, amount: doc.total, balance: doc.balance, isFinal: doc.isFinal, by: who && who.email || 'server' } });
  return { status: q ? 200 : 502, out: { ok: !!q, id: qid, queued: !!q, title: title } };
}
/* every new client invoice gets its e-mail approval (portal-reminders runs this every hour; the CRM asks at once) */
async function queueNewInvoices(opts){
  opts = opts || {};
  if (!approvalNeeded('invoice')) return { ok: true, off: true };
  const data = await crmData(true);
  const cur = await kvListRead(AQ_KEY);
  if (!cur) return { ok: false, error: 'approvals list unreadable' };
  const have = {}; cur.list.forEach(function(x){ have[s(x.id)] = 1; if ((x.meta || {}).invoiceId && x.status !== 'rejected') have['inv:' + s(x.meta.invoiceId)] = 1; });
  const out = { ok: true, queued: 0, skipped: 0 };
  for (const r of listOf(data, ['invs', 'invoices'])) {
    if (!invMailWanted(r) || have['appr_inv_' + s(r.id)] || have['inv:' + s(r.id)]) continue;
    const q = await queueInvoiceMail(s(r.id), null, { data: data });
    if (q.out && q.out.queued) out.queued++; else out.skipped++;
  }
  return out;
}
/* the thank-you's newsletter part (only for someone still on GrayCo News) */
function thankYouNewsBlock(){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:14px auto 0;padding:16px 18px;background:#F5F1E8;border-radius:12px;color:#14202E;font-size:14px;line-height:1.55">' +
    '<b>\uD83D\uDCF0 GrayCo News</b><br>A few times a year we send seasonal home-care tips, storm-season reminders and news from GrayCo to our customers. ' +
    'Nothing to do \u2014 it just shows up in your inbox.</div>';
}

/* ── customer e-mail / text approvals (owner rule, 20 Oct 2026) ─────────────────────────────────────────
   Every automatic e-mail or text to a customer waits in ONE shared list, gc_kv "gc_approval_queue" (JSON
   text, changed only through kvListUpdate here; the CRM reads it and merges by id). The job's PM approves;
   money / legal papers (final invoice and its reminders, lien waivers, contracts) then also need an admin
   (Wesley or Nick). An admin may approve anything at any step. No PM on the job: the admins approve.
   Still automatic (never queued): the customer's copy of a paper they just signed, and payment receipts.
   "Approve & send" sends it here (Resend), records "sent", and the CRM marks the invoice Sent.
   An item: { id, kind, jobId, jobName, pm, pmEmail, channel, to, subject, html, text, attachments, steps,
   step, approvals:[{step,by,email,role,at}], status: waiting|sending|sent|rejected, createdAt, updatedAt,
   sentAt, sentBy, rejectedBy, rejectedAt, reason, editedBy, lastError, meta } */
const AQ_KEY = 'gc_approval_queue';
const LINK_PH = '{{PORTAL_LINK}}';
const AQ_RANK = { waiting: 0, sending: 1, approved: 2, rejected: 3, sent: 4 };
const MONEY_KIND = /final|invoice|lien|waiver|contract|thank_you|pay_app/;   /* patch AP2: 'invoice' = the invoice PDF e-mail */   /* PM, then an admin (owner: the thank-you e-mail too) */
const AUTO_OK = { signed_copy: 1, receipt: 1 };   /* the exceptions: these still go out by themselves */
function approvalNeeded(kind){ return needsApproval() && !AUTO_OK[kind]; }
function aqDone(st){ return st === 'sent' || st === 'rejected'; }
function aqPick(a, b){
  if (aqDone(a.status) !== aqDone(b.status)) return aqDone(a.status) ? a : b;
  const x = s(a.updatedAt || a.createdAt), y = s(b.updatedAt || b.createdAt);
  if (x !== y) return x > y ? a : b;
  return (AQ_RANK[b.status] || 0) > (AQ_RANK[a.status] || 0) ? b : a;
}
/* the same merge the CRM uses: by id, nothing dropped; a finished item beats an open one, then the newer one */
function aqMerge(a, b){
  const out = [], at = {};
  (a || []).concat(b || []).forEach(function(x){
    const id = s(x && x.id); if (!id) return;
    if (!(id in at)) { at[id] = out.length; out.push(x); return; }
    out[at[id]] = aqPick(out[at[id]], x);
  });
  return out;
}
function pmOf(data, p){
  const name = s(p.pm || p.projectManager || p.pmName);
  if (!name) return null;
  const u = arr(data.users).find(function(x){ return low(x.name) === low(name); });
  /* patch PMG: a PM who is no longer active → the Senior PM (Admin → Employees), else the no-PM path (the admins) */
  if (u && !PEOPLE().isActive(u)) { const h = PEOPLE().seniorPm(data.users, data.gc_senior_pm); return h ? { name: s(h.name), email: low(h.email), phone: s(h.phone || h.cell || h.mobile) } : null; }
  return { name: name, email: low((u && u.email) || p.pmEmail || ''), phone: s(u && (u.phone || u.cell || u.mobile)) };
}
function PEOPLE(){ return require('./_lib/people.js'); }
/* where a customer's reply to an automatic e-mail goes (owner, 10/21): a job's PM for job mail; billing, the
   newsletter and anything without a PM go to the shared replies box (REPLY_TO_ADMIN, default replies@grayco-cs.com).
   Never office@. */
function adminReplyTo(){ const v = low(process.env.REPLY_TO_ADMIN || ''); return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(v) ? v : 'replies@grayco-cs.com'; }
/* patch BILL: money e-mails go From and Reply-To billing@ (brand.js billingEmail, Netlify BILLING_EMAIL overrides) */
function billingEmail(){ try { return require('./_lib/brand.js').billingEmail(); } catch (e) { return 'billing@grayco-cs.com'; } }
function billingFrom(){ return 'GrayCo Construction Services Billing <' + billingEmail() + '>'; }
function isMoneyKind(kind){ try { return require('./_lib/brand.js').isMoneyKind(kind); } catch (e) { return /final|invoice|pay_app|receipt/.test(s(kind)); } }
function replyToFor(pmEmail, kind){
  if (isMoneyKind(kind)) return billingEmail();   /* patch BILL */
  if (/final|invoice|receipt|payment|billing|news|thank|pay_app|offer_letter/i.test(s(kind))) return adminReplyTo();
  const e = low(pmEmail || ''); return /@grayco-cs\.com$/.test(e) && !/^office@/.test(e) ? e : adminReplyTo();
}
/* owner 10/21: every e-mail about a job carries the job in its subject — PO · name · address — so a reply
   ("Re: …") says which job it is for. Added once; never twice. */
function jobTag(p){
  if (!p) return '';
  const po = s(p.autoPO || p.po), name = s(p.name), addr = s(p.address || p.jobAddress);
  return [po ? 'PO ' + po : '', name, addr && low(addr) !== low(name) ? addr : ''].filter(Boolean).join(' \u00b7 ');
}
function withJob(subject, p){
  subject = s(subject); if (!p) return clip(subject, 240);
  const po = s(p.autoPO || p.po);
  if (po && subject.indexOf('PO ' + po) >= 0) return clip(subject, 240);
  const words = p.portalShowCarrier === true ? [] : carrierWords(p).map(function(w){ return new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }).concat([COMMON_CARRIERS]);
  const clean = function(x){ x = s(x); words.forEach(function(re){ re.lastIndex = 0; x = x.replace(re, ''); }); return x.replace(/\s*[\u2014\-\u2013]\s*(claim)?\s*$/i, '').replace(/\s{2,}/g, ' ').trim(); };   /* owner rule: never the carrier in a customer subject */
  const name = clean(p.name), addr = clean(p.address || p.jobAddress), has = function(x){ return x && low(subject).indexOf(low(x)) >= 0; };
  const t = [po ? 'PO ' + po : '', has(name) ? '' : name, addr && !has(addr) && low(addr) !== low(name) ? addr : ''].filter(Boolean).join(' \u00b7 ');
  return clip(t ? subject + ' \u2014 ' + t : subject, 240);
}
function stepsFor(kind, pm){ return !pm ? ['admin'] : (MONEY_KIND.test(kind) ? ['pm', 'admin'] : ['pm']); }
function htmlText(html){
  return s(String(html || '').replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2: $1').replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'));
}
function textHtml(text){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.5;white-space:pre-wrap">' +
    esc(text).split(esc(LINK_PH)).join('<a href="' + LINK_PH + '" style="color:#0F1D2F;font-weight:bold">Open my project page</a>') + '</div>';
}
async function queueApproval(o){
  if (o && o.pid && JA.KIND_KEY[s(o.kind)]) {   /* patch JA: the job's automations, checked once more here */
    let d = null; try { d = await crmData(false); } catch (e) {}
    const jp = d && findProject(d, o.pid);
    const off = jp ? JA.blockedKind(jp, o.kind, jaAdmin(d)) : '';
    if (off) { try { console.log('[portal] not queued, ' + off + ' is off for job ' + s(o.pid) + ': ' + s(o.kind)); } catch (e) {} return true; }
  }
  const now = new Date().toISOString();
  const steps = stepsFor(o.kind, o.pm);
  const item = { id: s(o.id), kind: o.kind, title: s(o.title), jobId: s(o.pid), jobName: s(o.jobName), pm: o.pm ? o.pm.name : '', pmEmail: o.pm ? o.pm.email : '', channel: o.channel || 'email',
    to: s(o.to), subject: s(o.subject), html: s(o.html), text: htmlText(o.html), attachments: o.attachments || [], steps: steps, step: steps[0], approvals: [],
    status: 'waiting', createdAt: now, updatedAt: now, meta: o.meta || {} };
  if (o.officeOk === true) item.officeOk = true;   /* patch SOC: the marketing approval stage — the office may approve this one */
  if (o.mmOk === true) item.mmOk = true;   /* patch MM: the Marketing Manager may approve this one (stage 2+, not flagged, never paid ads) */
  if (Array.isArray(o.flags) && o.flags.length) item.flags = o.flags.slice(0, 8);
  if (item.step === 'admin') item.adminSince = now;   /* patch AP4: when it reached the admin step */
  const has = function(l){ return l.some(function(x){ return s(x.id) === item.id; }); };
  const r = await kvListUpdate(AQ_KEY, function(l){ return has(l) ? null : { list: l.concat([item]), check: has }; });
  return r.ok;
}
async function aqOpenFor(test){
  const cur = await kvListRead(AQ_KEY);
  return !!(cur && cur.list.some(function(x){ return (x.status === 'waiting' || x.status === 'sending') && test(x); }));
}
async function aqSend(item, now){
  if (item && item.jobId && JA.KIND_KEY[s(item.kind)]) {   /* patch JA: approved after the job turned it off: it does not go out */
    let d = null; try { d = await crmData(false); } catch (e) {}
    const jp = d && findProject(d, item.jobId), k = jp ? JA.blockedKind(jp, item.kind, jaAdmin(d)) : '';
    if (k) return { ok: false, off: k, error: 'Turned off for this job (⚙ Automations) — not sent. Turn it back on on the job to send it.' };
  }
  if (s(item.kind) === 'portal_publish') return gateOnApproved(item, now);   /* patch PORTALGATE: approved → it shows in the portal (no e-mail) */
  if (mktLib().isMktKind(item.kind)) return mktLib().onApproved(item);
  if (s(item.kind) === 'bp_notice') return require('./_lib/bp-notice.js').onApproved(item, now);   /* patch SYS2: a bid-job addendum / update to the invited subs */
  if (/^gcp_/.test(s(item.kind))) return require('./_lib/gcp.js').onApproved(item, now);   /* patch GCP: GC pay apps / change orders / company COI / inspection offers */
  if (item.kind === 'refcredit' || item.kind === 'refgift') return require('./_lib/referral.js').onApproved(item, now);   /* patch REF: approved → credit on the member's balance / a one-time gift code (only its hash kept) */
  if (item.kind === 'warranty_check') return require('./_lib/care11.js').onApproved(item, now);   /* patch AUTO11: warranty check-up offers, one e-mail each from news@ */
  if (item.kind === 'cneeds_remind') { try { await require('./_lib/care11.js').needsApproved(item); } catch (e) {} }   /* patch AUTO11: the first "We need from you" reminder was approved — it goes out below; day 7 then goes by itself */
  if (item.kind === 'winback') return require('./_lib/winback.js').onApproved(item, now);   /* patch AUTO6: lost-lead check-ins, one e-mail each from news@ */   /* patch MKT: approved → posts / sends at its time (mkt-scheduled.js) */
  if (item.kind === 'maint_invoice') return require('./portal-plus.js').maintInvoiceSend(item, now);   /* patch X9: the yearly maintenance-plan invoice, with its PDF */
  /* patch AUTAI: a weekly update / a voice note's portal post goes on the customer's portal page when approved
     (then its e-mail, if it has one); a staff announcement goes to the company messages */
  if (AUTAI_POST[item.kind]) { const pr = await autaiPost(item, now); if (!pr.ok) return pr; if (item.channel === 'portal') { await autaiText(item); return { ok: true, posted: true }; } }
  if (item.kind === 'announcement') return autaiAnnounce(item, now);
  if (item.kind === 'anniversary') {   /* patch AUTO7: the one-year note goes from news@ with the unsubscribe footer */
    let h = s(item.html); try { h = await require('./_lib/brand.js').shellFor(h, { email: item.pmEmail, name: item.pm }); } catch (e) {}
    const nr = await newsLib().sendNews({ to: item.to, subject: item.subject, html: h });
    return nr.ok ? (nr.skipped ? { ok: true, skipped: nr.skipped } : { ok: true }) : { ok: false, error: nr.error || 'The e-mail did not go out (' + (nr.status || 'no answer') + ').' };
  }
  if (item.channel === 'sms') { const t = await sendText(item.to, item.text); return t.ok ? { ok: true } : { ok: false, error: 'Texting is not set up yet (' + (t.skipped || 'no provider') + ').' }; }
  if (!s(process.env.RESEND_API_KEY)) return { ok: false, error: 'E-mail is not set up on Netlify (RESEND_API_KEY).' };
  if (mailOff()) return { ok: false, error: 'E-mail is switched off (PORTAL_MAIL_OFF).' };
  let html = s(item.html), token = '';
  if (html.indexOf(LINK_PH) >= 0) {
    try { token = await createFor(item.jobId, 'approved: ' + item.kind); } catch (e) { return { ok: false, error: 'Could not make the portal link.' }; }
    html = html.split(LINK_PH).join(esc(linkFor(null, token)));
  }
  if (item.channel !== 'sms') { try { html = await require('./_lib/brand.js').shellFor(html, isMoneyKind(item.kind) ? { email: billingEmail(), name: 'GrayCo Billing' } : { email: item.pmEmail, name: item.pm }); } catch (e) {} }   /* patch BILL: money mail signs as Billing */   /* patch AUT2: the GrayCo shell + the PM's signature */
  let from = (isMoneyKind(item.kind) || /final|invoice|pay_app/.test(item.kind)) ? billingFrom()   /* patch BILL */
    : (/thank_you|lead|offer_letter/.test(item.kind) ? 'GrayCo Construction Services <office@grayco-cs.com>' : 'GrayCo Construction Services Portal <portal@grayco-cs.com>');
  /* patch AUTO5: a signature request / an estimate follow-up goes out from the job's PM (replies go to the PM) */
  if (!isMoneyKind(item.kind) && item.meta && item.meta.fromPm === true && /^[^@\s<>"]+@grayco-cs\.com$/i.test(s(item.pmEmail)) && !/^office@/i.test(s(item.pmEmail))) from = s(item.pm).replace(/[<>"]/g, '') + ' \u2014 GrayCo Construction Services <' + low(item.pmEmail) + '>';
  let subj = item.subject; if (item.jobId) { try { const dj = await crmData(false); subj = withJob(subj, findProject(dj, item.jobId)); } catch (e) {} }
  const payload = { from: from, reply_to: replyToFor(item.pmEmail, item.kind), to: [item.to], subject: subj, html: html };
  if (Array.isArray(item.cc) && item.cc.length) payload.cc = item.cc.slice(0, 5);   /* patch AP2: an approver's CC */
  /* patch AP2: the invoice PDF, made fresh from the CRM's record, goes with the e-mail */
  const pdfs = (item.attachments || []).filter(function(a){ return a && a.kind === 'pdf' && a.invoiceId; });
  if (pdfs.length) {
    try {
      const data = await crmData(true);
      payload.attachments = pdfs.map(function(a){
        const ij = invoiceAndJob(data, a.invoiceId); if (!ij) throw new Error('invoice ' + a.invoiceId + ' not found');
        const f = invoicePdf(data, ij.p, ij.r);
        return { filename: f.filename, content: f.pdf.toString('base64') };
      });
    } catch (e) { return { ok: false, error: 'Could not make the invoice PDF (' + clip(e && e.message || e, 80) + ').' }; }
  }
  /* patch AUTO8: a stored PDF (a pay application, an offer letter) goes with the e-mail, read from the private file storage */
  const stored = (item.attachments || []).filter(function(a){ return a && a.kind === 'file' && refPath(a.ref); }).slice(0, 3);
  if (stored.length) {
    try {
      const more = [];
      for (const a of stored) {
        const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + refPath(a.ref), { headers: keyHeaders(svcKey()) });
        if (!r.ok) throw new Error('file ' + r.status);
        more.push({ filename: clip(a.name || 'document.pdf', 120).replace(/[^\w .()#-]+/g, '-'), content: Buffer.from(await r.arrayBuffer()).toString('base64') });
      }
      payload.attachments = (payload.attachments || []).concat(more);
    } catch (e) { return { ok: false, error: 'Could not attach the PDF (' + clip(e && e.message || e, 80) + ').' }; }
  }
  /* patch AP2: the thank-you comes from news@ with the newsletter part, the unsubscribe footer and the
     List-Unsubscribe headers — unless the customer unsubscribed (or the list cannot be read): then it is a
     plain thank-you from office@ with no newsletter part */
  if (item.kind === 'thank_you') {
    const N = newsLib();
    let off = true; try { off = await N.isUnsubscribed(item.to); } catch (e) { off = true; }
    if (!off) {
      payload.from = N.NEWS_FROM; payload.reply_to = N.REPLY_TO;
      payload.html = html + thankYouNewsBlock() + N.footerHtml(item.to);
      payload.headers = N.listHeaders(item.to);
    }
  }
  let res;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + s(process.env.RESEND_API_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload) });
    res = { ok: r.ok, status: r.status };
  } catch (e) { res = { ok: false }; }
  if (!res.ok) return { ok: false, error: 'The e-mail did not go out (' + (res.status || 'no answer') + ').' };
  if (AUTAI_POST[item.kind]) await autaiText(item);   /* patch AUTAI: the job's text switch */
  const m = item.meta || {};
  try {   /* patch AP2: a FINAL invoice e-mailed this way is the first final-invoice e-mail: the 15-day reminders follow */
    if (item.kind === 'invoice' && m.isFinal && m.invoiceId) await fetch(sbUrl() + '/rest/v1/gc_portal_mail?on_conflict=invoice_id', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ invoice_id: s(m.invoiceId), project_id: s(item.jobId), first_sent_at: now, last_reminder_at: now, last_result: 'sent' }) });
  } catch (e) {}
  try {
    if (item.kind === 'portal_link' && token) await fetch(sbUrl() + '/rest/v1/gc_portal?token=eq.' + encodeURIComponent(token), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ sent_at: now, sent_via: 'email' }) });
    if (item.kind === 'portal_docs' && m.batch) await fetch(sbUrl() + '/rest/v1/gc_portal_notice?batch_id=eq.' + encodeURIComponent(m.batch), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ result: 'emailed' }) });
    if (item.kind === 'final_invoice' && m.invoiceId) await patchMail(m.invoiceId, { first_sent_at: now, last_reminder_at: now, last_result: 'sent' });
    if (item.kind === 'final_reminder' && m.invoiceId) await patchMail(m.invoiceId, { reminders: num(m.reminders) || 1, last_reminder_at: now, last_result: 'reminded' });
  } catch (e) {}
  return { ok: true };
}
/* patch AP2: an approver's edits (To, CC, subject, body / text message), recorded with who and when */
const EMAIL_RE = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i;
function ccList(v){ return (Array.isArray(v) ? v : s(v).split(/[,;\s]+/)).map(function(x){ return low(x); }).filter(Boolean); }
function editProblem(edit){
  if (!edit) return '';
  if (edit.to != null && s(edit.to) && !EMAIL_RE.test(s(edit.to)) && !/^\+?[0-9 ()-]{7,20}$/.test(s(edit.to))) return 'The "To" address does not look right.';
  if (edit.cc != null) { const bad = ccList(edit.cc).filter(function(e){ return !EMAIL_RE.test(e); }); if (bad.length) return 'CC: ' + bad[0] + ' does not look right.'; if (ccList(edit.cc).length > 5) return 'At most 5 CC addresses.'; }
  return '';
}
function applyEdit(x, edit, me){
  const ch = [];
  if (edit.to != null && s(edit.to) && low(edit.to) !== low(x.to)) { x.to = clip(edit.to, 200); ch.push('to'); }
  if (edit.cc != null) { const cc = ccList(edit.cc); if (JSON.stringify(cc) !== JSON.stringify(x.cc || [])) { x.cc = cc; ch.push('cc'); } }
  if (s(edit.subject) && s(edit.subject) !== s(x.subject)) { x.subject = clip(edit.subject, 200); ch.push('subject'); }
  if (s(edit.text) && String(edit.text) !== String(x.text)) {
    let tx = String(edit.text).slice(0, 8000);
    if (x.channel !== 'sms' && String(x.html || '').indexOf(LINK_PH) >= 0 && tx.indexOf(LINK_PH) < 0) tx += '\n\n' + LINK_PH;
    x.text = tx; if (x.channel !== 'sms') x.html = textHtml(tx); ch.push(x.channel === 'sms' ? 'message' : 'body');
  }
  x.editedBy = me.by; x.editedEmail = me.email; x.editedAt = me.at;
  x.edits = (x.edits || []).concat([{ by: me.by, email: me.email, at: me.at, step: x.step, fields: ch }]).slice(-20);
  return ch;
}
/* approve / reject / edit-then-approve, from the CRM. who = the signed-in person (gcStaffAuth). */
async function approvalAction(body, who){
  const op = s(body.op), id = s(body.id);
  const admin = low(who.role) === 'admin';
  let myName = s(who.name);
  if (op === 'escalate') { const e = await escalateDue({}); return { status: e.ok ? 200 : 502, out: e }; }   /* patch AP4: the page asks when a list is shown */
  const cur = await kvListRead(AQ_KEY);
  if (!cur) return { status: 502, out: { ok: false, error: 'Could not read the approvals list.' } };
  if (op === 'list') return { status: 200, out: { ok: true, items: cur.list } };
  if (op === 'queue') {
    /* the CRM's automatic thank-you e-mail (job complete + paid): it waits here for the PM, then an admin.
       The recipient is the job's own customer e-mail (never one the page sends). */
    if (mktLib().isMktKind(body.kind)) return mktLib().queueForApproval(body, who, { queueApproval: queueApproval, officeTodo: officeTodo });   /* patch MKT */
    if (s(body.kind) === 'invoice') return queueInvoiceMail(s(body.invoiceId), who);   /* patch AP2 */
    if (s(body.kind) === 'portal_post' || s(body.kind) === 'announcement') return autaiQueue(body, who);   /* patch AUTAI */
    if (require('./_lib/auto-queue.js').handles(body.kind)) return require('./_lib/auto-queue.js').queue(body, who, { crmData: crmData, findProject: findProject, pmOf: pmOf, queueApproval: queueApproval, kvListRead: kvListRead, kvListUpdate: kvListUpdate, aqSend: aqSend, AQ_KEY: AQ_KEY });   /* patch AUT2 */
    if (s(body.kind) !== 'thank_you') return { status: 400, out: { ok: false, error: 'Only the thank-you and invoice e-mails are queued from the CRM.' } };
    const pid = s(body.projectId);
    const data = await crmData(true); const p = pid && findProject(data, pid);
    if (!p) return { status: 404, out: { ok: false, retry: true, error: 'The job is not in the cloud yet.' } };
    if (!jaAllows(data, p, 'thankYou')) return { status: 200, out: { ok: true, off: 'thankYou', queued: false, error: 'The thank-you e-mail is turned off for this job (⚙ Automations).' } };   /* patch JA */
    const to = s(p.clientEmail || p.customerEmail || p.email);
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to)) return { status: 200, out: { ok: false, noEmail: true, error: 'No customer e-mail on this job.' } };
    const qid = 'appr_thanks_' + pid;
    const q = await queueApproval({ id: qid, kind: 'thank_you', pid: pid, jobName: p.name, pm: pmOf(data, p), to: to,
      subject: clip(body.subject || 'Thank you from GrayCo Construction!', 200), html: String(body.html || '').slice(0, 100000), attachments: [], meta: { by: who.email } });
    return { status: q ? 200 : 502, out: { ok: !!q, id: qid, queued: !!q } };
  }
  const it0 = cur.list.find(function(x){ return s(x.id) === id; });
  if (!it0) return { status: 404, out: { ok: false, error: 'That approval is not on the list any more.' } };
  if (!myName) { try { const d = await crmData(false); const u = arr(d.users).find(function(x){ return low(x.email) === low(who.email); }); myName = s(u && u.name); } catch (e) {} }
  let isPm = (it0.pmEmail && low(it0.pmEmail) === low(who.email)) || (it0.pm && myName && low(it0.pm) === low(myName));
  /* patch PMG: the job's APM may take the PM's step only when an admin turned "APMs may approve" on (Admin → Employees) */
  let isApmStep = false;
  if (!isPm && it0.step === 'pm') {
    try {
      const d = await crmData(false); let ts = d.gc_team_settings; if (typeof ts === 'string') { try { ts = JSON.parse(ts); } catch (e) { ts = {}; } }
      if (ts && ts.apmCanApprove === true) {
        const P = PEOPLE(), u = P.findUser(d.users, who.email), job = listOf(d, ['projects']).find(function(x){ return s(x.id) === s(it0.jobId); }) || {};
        if (u && P.isActive(u) && P.isApm(u) && P.apmsFor(d.users, job, P.findUser(d.users, it0.pmEmail || it0.pm)).some(function(a){ return a.email === low(who.email); })) { isPm = true; isApmStep = true; }
      }
    } catch (e) {}
  }
  const stale = it0.status === 'sending' && Date.now() - Date.parse(it0.updatedAt || 0) > 10 * 60e3;
  if (it0.status !== 'waiting' && !stale) return { status: 409, out: { ok: false, error: 'Already ' + it0.status + '.', item: it0 } };
  /* patch AP4: an item the admins left at their step for 24 hours is the office's too (whoever acts first wins) */
  const mmOk = !admin && !!who && who.marketing === true && it0.mmOk === true && it0.step === 'admin' && (op === 'approve' || op === 'reject');   /* patch MM */
  if (who && who.marketing === true && !mmOk) return { status: 403, out: { ok: false, error: 'This one needs an admin.' } };
  const office = mmOk || (!admin && it0.step === 'admin' && (it0.officeOk === true || escalatedOrDue(it0, Date.now())) && await isOffice(who));   /* patch SOC: officeOk (approval stage 2 / 3) */
  if (!admin && !office && !(it0.step === 'pm' && isPm)) return { status: 403, out: { ok: false, error: it0.step === 'admin' ? 'This one needs Wesley or Nick now (the office can take it after 24 hours).' : 'Only the job\'s PM (' + (it0.pm || 'none') + ') or an admin can approve this.' } };
  const now = new Date().toISOString(), me = { by: myName || who.email, email: low(who.email), role: admin ? 'admin' : mmOk ? 'marketing' : (office ? 'office' : (isApmStep ? 'apm' : 'pm')), at: now };
  if (office && !it0.escalated && !it0.officeOk) { try { await escalateDue({ only: id }); } catch (e) {} }
  const upd = async function(fn, check){ return kvListUpdate(AQ_KEY, function(l){ const x = l.find(function(y){ return s(y.id) === id; }); if (!x) return null; const ok = fn(x); if (ok === false) return { list: null, result: x }; x.updatedAt = new Date().toISOString(); return { list: l, check: function(l2){ const z = l2.find(function(y){ return s(y.id) === id; }); return !!(z && check(z)); }, result: x }; }); };
  if (op === 'reject') {
    const r = await upd(function(x){ if (x.status !== 'waiting' && !stale) return false; x.status = 'rejected'; x.rejectedBy = me.by; x.rejectedEmail = me.email; x.rejectedAt = now; x.reason = clip(body.reason, 500); }, function(z){ return z.status === 'rejected'; });
    if (!r.ok || !r.result || r.result.status !== 'rejected') return { status: 409, out: { ok: false, error: 'Could not record it — try again.', item: r.result } };
    const m = it0.meta || {};
    if (mktLib().isMktKind(it0.kind)) { try { await mktLib().onRejected(r.result, me); } catch (e) {} }   /* patch MKT */
    if (s(it0.kind) === 'portal_publish' && (it0.meta || {}).gateKey) { try { await gateSet(it0.meta.gateKey, 'rejected', me, clip(body.reason, 100)); } catch (e) {} }   /* patch PORTALGATE: not approved → never in the portal */
    try {
      if (/final/.test(it0.kind) && m.invoiceId) await patchMail(m.invoiceId, { last_reminder_at: now, last_result: 'rejected' });
      if (it0.kind === 'portal_docs' && m.batch) await fetch(sbUrl() + '/rest/v1/gc_portal_notice?batch_id=eq.' + encodeURIComponent(m.batch), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ result: 'rejected' }) });
    } catch (e) {}
    return { status: 200, out: { ok: true, item: r.result } };
  }
  /* patch PAUSE: "✅ Approve as record-only" — admins back-entering old work. The item is closed as handled
     (status "recorded"), the approval is kept on it, and NOTHING is sent — on or off data-entry mode. A final
     invoice's mail row is stamped like a "don't approve" so the automatic run does not send it later either. */
  if (op === 'record') {
    if (!admin) return { status: 403, out: { ok: false, error: 'Only an admin can record an approval without sending it.' } };
    const r = await upd(function(x){
      if (x.status !== 'waiting' && !stale) return false;
      x.status = 'recorded'; x.recordOnly = true; x.recordedBy = me.by; x.recordedEmail = me.email; x.recordedAt = now;
      x.approvals = (x.approvals || []).concat([Object.assign({ step: x.step, recordOnly: true }, me)]);
    }, function(z){ return z.status === 'recorded' && z.recordedAt === now; });
    if (!r.ok || !r.result || r.result.status !== 'recorded') return { status: 409, out: { ok: false, error: 'Could not record it — try again.', item: r.result } };
    const m = it0.meta || {};
    try {
      if (/final/.test(it0.kind) && m.invoiceId) await patchMail(m.invoiceId, { last_reminder_at: now, last_result: 'recorded' });
      if (s(it0.kind) === 'portal_publish' && m.gateKey) await gateSet(m.gateKey, 'recorded', me, 'record-only');   /* patch PORTALGATE: recorded, never shown */
      if (it0.kind === 'portal_docs' && m.batch) await fetch(sbUrl() + '/rest/v1/gc_portal_notice?batch_id=eq.' + encodeURIComponent(m.batch), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ result: 'recorded' }) });
    } catch (e) {}
    return { status: 200, out: { ok: true, recorded: true, sent: false, item: r.result } };
  }
  const edit = body.edit && typeof body.edit === 'object' ? body.edit : null;
  /* patch AP2: whoever must act now can open it, change To / CC / subject / body (a text: the message) and save it
     without approving; the next approver sees the edited e-mail and "edited by X" */
  const bad = editProblem(edit);
  if (bad) return { status: 400, out: { ok: false, error: bad } };
  if (op === 'edit') {
    if (!edit) return { status: 400, out: { ok: false, error: 'Nothing to save.' } };
    const re = await upd(function(x){ if (x.status !== 'waiting') return false; applyEdit(x, edit, me); }, function(z){ return z.editedAt === now; });
    if (!re.ok || !re.result || re.result.editedAt !== now) return { status: 409, out: { ok: false, error: 'Could not save it — look again.', item: re.result } };
    return { status: 200, out: { ok: true, saved: true, item: re.result } };
  }
  if (op !== 'approve') return { status: 400, out: { ok: false, error: 'Bad request' } };
  const last = admin || office || it0.steps.indexOf(it0.step) >= it0.steps.length - 1;
  const claim = 'c' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  let r = await upd(function(x){
    if (x.status !== 'waiting' && !(x.status === 'sending' && stale)) return false;
    if (edit) applyEdit(x, edit, me);
    x.approvals = (x.approvals || []).concat([Object.assign({ step: x.step }, me)]);
    if (last) { x.status = 'sending'; x.claim = claim; }
    else { x.step = x.steps[x.steps.indexOf(x.step) + 1]; if (x.step === 'admin') x.adminSince = now; }   /* patch AP4: the 24 hours start */
  }, function(z){ return last ? z.claim === claim : z.step !== it0.step; });
  if (!r.ok || !r.result || (last && r.result.claim !== claim)) return { status: 409, out: { ok: false, error: 'Someone else is on this one — look again.', item: r.result } };
  if (!last) return { status: 200, out: { ok: true, item: r.result, next: r.result.step } };
  const sent = await aqSend(r.result, now);
  r = await upd(function(x){
    if (x.claim !== claim) return false;
    if (sent.ok) { x.status = 'sent'; x.sentAt = new Date().toISOString(); x.sentBy = me.by; x.lastError = ''; }
    else { x.status = 'waiting'; x.lastError = sent.error; }
  }, function(z){ return z.status === (sent.ok ? 'sent' : 'waiting'); });
  const item = r.result || it0;
  if (sent.ok && s(item.kind) !== 'portal_publish') { try { await gateFromMail(item, me); } catch (e) {} }   /* patch PORTALGATE */
  if (!sent.ok) return { status: 502, out: { ok: false, error: sent.error, item: item } };
  return { status: 200, out: { ok: true, item: item, sent: true, invoiceId: s((item.meta || {}).invoiceId) } };
}
/* ── patch AP4 (owner, 21 Oct 2026): "If Nick and Wesley do not approve by 24 hours, then it goes to the office to
   approve." An item at the ADMIN step (money / legal after the PM, or a job with no PM) that nobody approved or
   rejected within 24 hours of reaching that step is escalated: the office (gc_staff role office, or a CRM user whose
   role says Office) may then approve, edit or not approve it; the admins still can too — whoever acts first wins,
   and the approval records who, with which role, and when. PM-step items are never escalated. Run every 15 minutes
   (approval-escalate.js) and whenever the CRM shows a list (op "escalate"). On escalation: once, an office to-do,
   a CRM notice for the office and for the admins (gc_kv "gc_appr_notices"), and a phone push to both. ── */
const ESC_MS = 24 * 3600e3;
function adminSinceMs(x){
  if (x.adminSince) return Date.parse(x.adminSince);
  const ap = (x.approvals || []).filter(function(a){ return a && a.step === 'pm'; }).slice(-1)[0];   /* older items: when the PM approved */
  return Date.parse((ap && ap.at) || x.createdAt || 0);
}
function escalatedOrDue(x, nowMs){ return !!(x && x.status === 'waiting' && x.step === 'admin' && (x.escalated || nowMs - adminSinceMs(x) >= ESC_MS)); }
async function isOffice(who){
  if (/office/.test(low(who.role))) return true;
  try { const d = await crmData(false); const u = arr(d.users).find(function(x){ return low(x.email) === low(who.email); }); return !!(u && u.active !== false && /office/i.test(s(u.role))); } catch (e) { return false; }
}
function peopleOf(data, test){ return arr(data.users).filter(function(u){ return u && u.active !== false && /@/.test(s(u.email)) && test(u); }).map(function(u){ return low(u.email); }).filter(function(e, i, a){ return a.indexOf(e) === i; }); }
function officeEmails(data){ return peopleOf(data, function(u){ return /office/i.test(s(u.role)) && !/^admin$/i.test(s(u.role)); }); }
function adminEmails(data){ return peopleOf(data, function(u){ return /^admin$/i.test(s(u.role)) || low(u.payType) === 'owner'; }); }
let webPushLib;
async function pushTo(emails, p){
  const pub = s(process.env.VAPID_PUBLIC_KEY), priv = s(process.env.VAPID_PRIVATE_KEY);
  const wp = exports._core && exports._core._webPush || (webPushLib !== undefined ? webPushLib : (webPushLib = (function(){ try { return require('web-push'); } catch (e) { return null; } })()));
  if (!wp || ((!pub || !priv) && !(exports._core && exports._core._webPush))) return { sent: 0, why: 'phone push is not set up' };
  try { if (pub && priv) wp.setVapidDetails(s(process.env.VAPID_SUBJECT) || 'mailto:office@grayco-cs.com', pub, priv); } catch (e) { return { sent: 0, why: 'bad VAPID keys' }; }
  const payload = JSON.stringify({ title: p.title, body: p.body, link: baseUrl({}) + '/#todo', tag: p.tag });
  let sent = 0;
  for (const email of emails) {
    let subs = []; try { subs = arr((await kvRead(['gc_push_subs__' + email]))['gc_push_subs__' + email]).filter(function(x){ return x && x.endpoint && x.keys; }); } catch (e) {}
    for (const sub of subs) { try { await wp.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 86400 }); sent++; } catch (e) {} }
  }
  return { sent: sent };
}
async function escalateDue(opts){
  opts = opts || {};
  const nowMs = opts.now ? +new Date(opts.now) : Date.now(), at = new Date(nowMs).toISOString();
  let fresh = [];
  const r = await kvListUpdate(AQ_KEY, function(l){
    fresh = [];
    l.forEach(function(x){
      if (!x || x.escalated || (opts.only && s(x.id) !== s(opts.only))) return;
      if (!escalatedOrDue(x, nowMs)) return;
      x.escalated = { at: at, why: 'Wesley and Nick did not answer in 24 hours' }; x.updatedAt = at; fresh.push(x);
    });
    if (!fresh.length) return null;
    const ids = fresh.map(function(x){ return s(x.id); });
    return { list: l, check: function(l2){ return ids.every(function(id){ const z = l2.find(function(y){ return s(y.id) === id; }); return !!(z && z.escalated); }); }, result: ids };
  });
  if (!r.ok) return { ok: false, error: r.error };
  if (!fresh.length) return { ok: true, escalated: 0 };
  /* tell them, once (only this run marked these) */
  let data = {}; try { data = await crmData(true); } catch (e) {}
  const office = officeEmails(data), admins = adminEmails(data), notices = [];
  for (const x of fresh) {
    const title = s(x.title) || ((x.kind || '').replace(/_/g, ' ') + ' — ' + s(x.jobName));
    await officeTodo('appr_esc_' + s(x.id), '⏫ Approve: ' + clip(title, 120), 'Wesley and Nick did not answer in 24 hours. You can approve, edit or not approve it now: ✅ Approvals in To-Do, or the green APPROVE button.');
    notices.push({ id: 'esc_office_' + s(x.id), to: 'office', itemId: s(x.id), at: at, text: '⏫ For you to approve: ' + clip(title, 120) + ' — Wesley and Nick did not answer in 24 hours.' });
    notices.push({ id: 'esc_admins_' + s(x.id), to: 'admins', itemId: s(x.id), at: at, text: '⏫ Sent to the office after 24h: ' + clip(title, 120) + '. You can still approve it.' });
    await pushTo(office, { title: '⏫ Approval for the office', body: clip(title, 120) + ' — admins didn\'t answer in 24h', tag: 'appr-esc-' + s(x.id) });
    await pushTo(admins, { title: 'Sent to the office after 24h', body: clip(title, 120), tag: 'appr-esc-admin-' + s(x.id) });
  }
  await kvListUpdate('gc_appr_notices', function(l){
    const have = {}; l.forEach(function(n){ have[s(n && n.id)] = 1; });
    const add = notices.filter(function(n){ return !have[n.id]; }); if (!add.length) return null;
    return { list: l.concat(add).slice(-300), check: function(l2){ return add.every(function(n){ return l2.some(function(m){ return m && m.id === n.id; }); }); } };
  });
  return { ok: true, escalated: fresh.length, ids: fresh.map(function(x){ return s(x.id); }), office: office, admins: admins };
}
/* patch AP3: the approved first reminder of an invoice (the newest one sent), the template for the later ones */
async function approvedReminder(invId){
  const cur = await kvListRead(AQ_KEY); if (!cur) return null;
  const l = cur.list.filter(function(x){ return x && x.kind === 'final_reminder' && x.status === 'sent' && s((x.meta || {}).invoiceId) === s(invId) && (x.approvals || []).length; })
    .sort(function(a, b){ return s(b.sentAt) < s(a.sentAt) ? -1 : 1; });
  return l[0] || null;
}
async function sendApprovedReminder(tpl, pid){
  if (!s(process.env.RESEND_API_KEY) || mailOff()) return { ok: false, error: 'mail off' };
  let html = s(tpl.html);
  if (html.indexOf(LINK_PH) >= 0) {
    let token; try { token = await createFor(pid, 'auto: approved reminder'); } catch (e) { return { ok: false, error: 'no link' }; }
    html = html.split(LINK_PH).join(esc(linkFor(null, token)));
  }
  const payload = { from: billingFrom(), reply_to: billingEmail(), to: [tpl.to], subject: await (async function(){ try { return withJob(tpl.subject, findProject(await crmData(false), pid)); } catch (e) { return tpl.subject; } })(), html: html };
  if (Array.isArray(tpl.cc) && tpl.cc.length) payload.cc = tpl.cc.slice(0, 5);
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + s(process.env.RESEND_API_KEY), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { ok: r.ok, error: r.ok ? '' : String(r.status) };
  } catch (e) { return { ok: false, error: 'no answer' }; }
}
/* one pass over every job (or just one): first e-mail, then every 15 days while unpaid */
async function runReminders(opts){
  opts = opts || {};
  const now = opts.now ? new Date(opts.now) : new Date();
  const nowIso = now.toISOString();
  const data = await crmData(true);
  const rows = await mailRows();
  if (!rows) return { ok: false, error: 'Run docs/portal-setup.sql first (gc_portal_mail is missing).' };
  const report = { sent: 0, reminded: 0, todos: 0, skipped: 0, paused: 0, details: [] };
  const projects = arr(data.projects).filter(function(p){ return !opts.projectId || s(p.id) === s(opts.projectId); });
  const invs = listOf(data, ['invs', 'invoices']);
  for (const p of projects) {
    const pid = s(p.id);
    if (/lost|dead|cancel/.test(low(p.status))) continue;
    const finals = invs.filter(function(r){ return pidOf(r) === pid && isCustomerInvoice(r) && invFinal(r) && invBalance(r) > 0 && !(r.importedHistory === true || r.noSend === true || r.historyOnly === true); });   /* patch LCLEAN: an invoice imported / entered as history is never e-mailed or reminded */
    if (!finals.length) continue;
    if (p.portalRemindersPaused === true || (p.importedHistory === true || p.noSend === true || p.historyOnly === true)) { report.paused++; continue; }   /* patch LCLEAN-H: a history job is never reminded */
    if (!jaAllows(data, p, 'finalReminders')) { report.off = (report.off || 0) + 1; continue; }   /* patch JA: off for this job */
    for (const inv of finals) {
      const invId = s(inv.id); if (!invId) continue;
      const prev = rows[invId] || null;
      const first = !prev || !prev.first_sent_at;
      if (!first && prev.last_reminder_at && now - new Date(prev.last_reminder_at) < REMIND_EVERY) { report.skipped++; continue; }
      if (first && prev && prev.last_reminder_at && now - new Date(prev.last_reminder_at) < DAY) { report.skipped++; continue; }   /* a try today already */
      const view = await buildView(data, p);
      const to = s(view.customer.email);
      const okEmail = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to);
      if (okEmail && s(process.env.RESEND_API_KEY) && !mailOff() && approvalNeeded(first ? 'final_invoice' : 'final_reminder')) {
        /* owner rule: the PM approves, then an admin; it waits on the approvals list (gc_approval_queue) */
        if (prev && /rejected/.test(s(prev.last_result)) && prev.last_reminder_at && now - new Date(prev.last_reminder_at) < REMIND_EVERY) { report.skipped++; continue; }
        if (await aqOpenFor(function(x){ return s((x.meta || {}).invoiceId) === invId; })) { report.skipped++; continue; }   /* already waiting */
        /* patch AP3 (owner, 21 Oct 2026): only the FIRST 15-day reminder needs approval (PM, then admin). Every later
           reminder for the same invoice goes out by itself with the approved text (subject, body, To / CC as approved),
           unless the invoice is paid (it is no longer on this list) or reminders are paused on the job (above). */
        if (!first && num(prev.reminders) >= 1) {
          const tpl = await approvedReminder(invId);
          if (tpl) {
            if (!(await claim(invId, pid, prev, nowIso))) { report.skipped++; continue; }
            const sent = await sendApprovedReminder(tpl, pid);
            if (sent.ok) {
              await patchMail(invId, { reminders: num(prev.reminders) + 1, last_result: 'reminded (auto, approved text)' });
              report.reminded++; report.autoReminders = (report.autoReminders || 0) + 1;
              report.details.push({ project: pid, invoice: invId, kind: 'reminder', auto: true, template: tpl.id });
            } else await patchMail(invId, { last_reminder_at: prev.last_reminder_at || null, last_result: 'failed ' + (sent.error || '') });
            continue;
          }
        }
        if (!(await claim(invId, pid, prev, nowIso))) { report.skipped++; continue; }
        const n = first ? 0 : num(prev.reminders) + 1;
        const fi = view.money.finalInvoice || {};
        await queueApproval({ id: 'appr_final_' + invId + '_' + n + '_' + nowIso.slice(0, 10), kind: first ? 'final_invoice' : 'final_reminder', pid: pid, jobName: p.name, pm: pmOf(data, p), to: to,
          subject: first ? 'Your final invoice from GrayCo — ' + (view.job.name || 'your job') : 'Friendly reminder: your GrayCo invoice — ' + (view.job.name || 'your job'),
          html: mailHtml(first ? 'first' : 'reminder', view, LINK_PH), attachments: [{ name: 'Final invoice' + (fi.number ? ' ' + fi.number : '') + ' (in the customer portal)', kind: 'portal' }],
          meta: { invoiceId: invId, invoiceNumber: s(fi.number), amount: money(view.money.due), reminders: n } });
        await patchMail(invId, { todo_at: nowIso, last_result: 'approval' });
        report.approvals = (report.approvals || 0) + 1;
        continue;
      }
      if (!okEmail || !s(process.env.RESEND_API_KEY) || mailOff() || needsApproval()) {
        if (!prev || !prev.todo_at) {
          if (!(await claim(invId, pid, prev, nowIso))) { report.skipped++; continue; }
          const appr = false;   /* an approval goes to the approvals list above, never to the office */
          const why = !okEmail ? 'There is no good customer e-mail on file.' : (mailOff() ? 'E-mail is switched off (PORTAL_MAIL_OFF).' : 'E-mail is not set up on Netlify (RESEND_API_KEY).');
          await officeTodo('portal_final_' + invId, 'Send the final invoice by hand — ' + (p.name || 'job'),
            why + ' The invoice is in the customer portal. Send it yourself: job → Customer portal → Email it or Text it (or call the customer).');
          await patchMail(invId, { todo_at: nowIso, last_result: appr ? 'approval' : (!okEmail ? 'no-email' : 'no-mail-key') });
          report.todos++;
        } else report.skipped++;   /* already on the to-do list: no second to-do (an e-mail added later is used on the next run) */
        continue;
      }
      if (!(await claim(invId, pid, prev, nowIso))) { report.skipped++; continue; }
      let token;
      try { token = await createFor(pid, 'auto: final invoice'); } catch (e) { await patchMail(invId, { last_reminder_at: prev ? prev.last_reminder_at : null, last_result: 'no-link' }); continue; }
      const link = linkFor(null, token);
      const subject = first ? 'Your final invoice from GrayCo — ' + (view.job.name || 'your job') : 'Friendly reminder: your GrayCo invoice — ' + (view.job.name || 'your job');
      let res;
      try { res = await sendMail(to, withJob(subject, p), mailHtml(first ? 'first' : 'reminder', view, link)); } catch (e) { res = { ok: false }; }
      if (res.ok) {
        await patchMail(invId, first ? { first_sent_at: nowIso, last_result: 'sent' } : { reminders: num(prev.reminders) + 1, last_result: 'reminded' });
        if (first) report.sent++; else report.reminded++;
        report.details.push({ project: pid, invoice: invId, kind: first ? 'first' : 'reminder' });
      } else {
        /* give the claim back so tomorrow tries again */
        await patchMail(invId, { last_reminder_at: prev ? prev.last_reminder_at : null, last_result: 'failed' + (res.status ? ' ' + res.status : '') });
      }
    }
  }
  return Object.assign({ ok: true }, report);
}

/* ── the portal link goes to the customer by itself when the job is made (owner rule) ──
   E-mail now (Resend). Text: a switch that stays OFF until A2P 10DLC registration is done — no
   texting provider is connected, so sendText() is only the hook. Never twice: gc_portal.sent_at
   (+ sent_via) is claimed before anything is sent. No e-mail on file: ONE Office to-do. */
const SETTINGS_KEY = 'gc_portal_settings';
async function settingsGet(){
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + SETTINGS_KEY, { headers: H() });
    if (r.ok) { const rows = await r.json(); let v = rows && rows[0] && rows[0].value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
      if (v && typeof v === 'object') return { autoSend: v.autoSend !== false, text: v.text === true, by: s(v.by), at: s(v.at) }; }
  } catch (e) {}
  return { autoSend: true, text: false, by: '', at: '' };   /* the owner asked for ON */
}
async function settingsSet(patch, by){
  const cur = await settingsGet();
  const next = { autoSend: patch.autoSend == null ? cur.autoSend : !!patch.autoSend, text: patch.text == null ? cur.text : !!patch.text, by: clip(by, 120), at: new Date().toISOString() };
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: SETTINGS_KEY, value: next, updated_at: next.at }) });
  if (!r.ok) throw new Error('settings write ' + r.status);
  return next;
}
/* the hook for texting. A no-op until a provider is connected AND A2P 10DLC is registered
   (PORTAL_TEXT_PROVIDER on Netlify + the office switch "text"). Nothing is ever texted from here today. */
async function sendText(to, body){
  if (!s(process.env.PORTAL_TEXT_PROVIDER)) return { ok: false, skipped: 'text-not-set-up' };
  return { ok: false, skipped: 'text-provider-not-built' };
}
function isNewJob(p, now){
  const t = Date.parse(s(p.createdAt) || s(p.created)); if (!isFinite(t)) return false;
  return now - t <= (p._ccAuto === true || /^PRJcc_/.test(s(p.id)) ? 30 : 14) * DAY;
}
/* the portal's name and address as every GrayCo document prints it (owner 10/20: "all info for documents will be in
   your portal"). The link itself comes from PORTAL_BASE_URL (https://portal.grayco-cs.com once that address is live). */
const PORTAL_HOST = 'portal.grayco-cs.com';
function linkMailHtml(v, link){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E">' +
    '<div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center">' +
    '<img src="' + esc(baseUrl({}) + '/portal-logo.png') + '" alt="GrayCo Construction Services" width="180" style="display:block;margin:0 auto 6px">' +
    '<div style="font-size:18px;font-weight:bold">' + esc(v.job.name) + '</div></div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px">' +
    '<p style="font-size:15px">Hi ' + esc(v.customer.firstName || 'there') + ',</p>' +
    '<p style="font-size:15px;line-height:1.5">Thank you for choosing GrayCo! This is your <b>GrayCo Portal</b>, your own private project page. See your project\u2019s progress and updates from ' + esc(v.pm.name || 'your Project Manager') + ', job photos, every document (proposal, contract, change orders, invoices, warranty) and your payments, all in one place, on your phone or computer. No app or password needed.</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Open my GrayCo Portal</a></p>' +
    /* 33.151: the login too (owner rule): user name = this e-mail, starter password = the first name */
    '<p style="font-size:14px;line-height:1.5;background:#F6F3EC;border-radius:8px;padding:10px 12px">Or sign in at <b>' + esc(PORTAL_HOST) + '</b> · E-mail: <b>' + esc(v.customer.email) + '</b> · Password: <b>your first name</b> (you can change it after you sign in).</p>' +
    '<p style="font-size:13px;color:#55626F">Keep this e-mail — the button is your personal link and always opens your portal (' + PORTAL_HOST + '). Questions? Call us at ' + OFFICE_PHONE + '.</p></div></div>';
}
async function sendLink(pid, event, who){
  const st = await settingsGet();
  if (!st.autoSend) return { ok: true, skipped: 'auto-send is turned off' };
  const now = Date.now();
  const data = await crmData(true);
  const p = findProject(data, pid);
  if (!p) return { ok: false, retry: true, error: 'The job is not in the cloud yet.' };
  if (/lost|dead|cancel/.test(low(p.status))) return { ok: true, skipped: 'lost job' };
  if (!jaAllows(data, p, 'portalLink')) return { ok: true, skipped: 'the portal link is turned off for this job', off: 'portalLink' };   /* patch JA */
  if (!jaAllows(data, p, 'portalInvite')) return { ok: true, skipped: 'the portal invite is turned off for this job', off: 'portalInvite' };
  if (!isNewJob(p, now)) return { ok: true, skipped: 'not a new job' };
  const token = await createFor(pid, who || 'auto: new job');
  const rr = await fetch(sbUrl() + '/rest/v1/gc_portal?select=sent_at,sent_via,link_todo_at&token=eq.' + encodeURIComponent(token), { headers: H() });
  const row = rr.ok ? ((await rr.json()) || [])[0] || {} : {};
  if (row.sent_at) return { ok: true, already: true, sentAt: row.sent_at, via: row.sent_via || 'email' };
  const view = await buildView(data, p);
  const link = linkFor(event, token);
  const to = s(view.customer.email);
  const okEmail = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to);
  if (!okEmail || !s(process.env.RESEND_API_KEY) || mailOff() || approvalNeeded('portal_link')) {
    if (row.link_todo_at) return { ok: true, todo: true, approval: needsApproval(), already: true };
    const c = await fetch(sbUrl() + '/rest/v1/gc_portal?token=eq.' + encodeURIComponent(token) + '&link_todo_at=is.null', { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ link_todo_at: new Date(now).toISOString() }) });
    const got = c.ok ? await c.json().catch(function(){ return []; }) : [];
    if (!Array.isArray(got) || got.length !== 1) return { ok: true, todo: true, already: true };
    const name = view.customer.name || p.client || 'the customer';
    const apprL = okEmail && s(process.env.RESEND_API_KEY) && !mailOff();
    if (apprL) {
      const q = await queueApproval({ id: 'appr_link_' + pid, kind: 'portal_link', pid: pid, jobName: p.name, pm: pmOf(data, p), to: to,
        subject: 'Your GrayCo project page — ' + (view.job.name || 'your job'), html: linkMailHtml(view, LINK_PH), attachments: [], meta: {} });
      return { ok: true, todo: true, approval: true, queued: !!q };
    }
    await officeTodo('portal_link_' + pid, (apprL ? 'Approve & send portal link to ' : 'Send portal link to ') + name,
      (apprL ? 'Waiting for approval — nothing was e-mailed' : (!okEmail ? 'No customer e-mail on file' : 'E-mail is not set up on Netlify (RESEND_API_KEY)')) + ' for ' + (p.name || 'the job') + '. Open the job → Customer portal → Email it, Text it or Copy link.');
    return { ok: true, todo: true, approval: apprL };
  }
  const nowIso = new Date(now).toISOString();
  const c = await fetch(sbUrl() + '/rest/v1/gc_portal?token=eq.' + encodeURIComponent(token) + '&sent_at=is.null', { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ sent_at: nowIso, sent_via: 'email' }) });
  const got = c.ok ? await c.json().catch(function(){ return []; }) : [];
  if (!Array.isArray(got) || got.length !== 1) return { ok: true, already: true };
  let res;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + s(process.env.RESEND_API_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo Construction Services Portal <portal@grayco-cs.com>', reply_to: replyToFor((function(){ try { const m = pmOf(data, p); return m && m.email; } catch (e) { return ''; } })(), 'portal_link'), to: [to], subject: withJob('Your GrayCo Portal — ' + (view.job.name || 'your job'), p), html: linkMailHtml(view, link) }) });
    res = { ok: r.ok, status: r.status };
  } catch (e) { res = { ok: false }; }
  if (!res.ok) {
    await fetch(sbUrl() + '/rest/v1/gc_portal?token=eq.' + encodeURIComponent(token), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ sent_at: null, sent_via: null }) });
    return { ok: false, retry: true, error: 'The e-mail did not go out (' + (res.status || 'no answer') + ').' };
  }
  let via = 'email';
  if (st.text) { const tx = await sendText(view.customer.phone, 'GrayCo: your GrayCo Portal (progress, photos, documents, payments; no app or password) ' + link); if (tx.ok) via = 'email+text'; }
  return { ok: true, sent: via, sentAt: nowIso };
}

/* ── "something new is in your portal" e-mail (owner rule, 33.144) ─────────────
   A proposal/estimate (CRM estimate marked sent, a Google Doc from gdocs-sync, a Google Doc link
   or a PDF/Word the PM uploaded), an approved change order, or a completion / warranty paper
   reaches the portal → the customer gets ONE short e-mail with a button to their page.
   • once per document: gc_portal_notice (one row per job+document) is claimed before sending,
     so two computers (or the hourly run) never send the same one twice;
   • several in a few minutes → one e-mail (sent after QUIET minutes with nothing new, or MAXWAIT);
   • the office switch (auto-send) and the job's pause switch are respected;
   • no e-mail on file → ONE Office to-do for the job;
   • the final invoice is NOT here (portal-reminders sends that one);
   • papers already older than 14 days the first time the job is looked at are only recorded. */
const QUIET = 3 * 60e3, MAXWAIT = 10 * 60e3, OLD = 14 * DAY;
const NOTIFY_DOC = /proposal|contract|change.?order|completion|warrant|customer portal|estimate|quote/i;
function noticeItems(data, p){
  const pid = s(p.id), out = [];
  const ests = arr(data.estimates).filter(function(e){ return proposalShown(e, pid, p) && gateAllows(null, p, gateKeyOf('e', e), e); });   /* patch PORTALGATE: only what the portal shows */
  const shownEst = {}; ests.forEach(function(e){ shownEst[s(e.id)] = 1; });
  ests.forEach(function(e){ if (e.noNotice === true) return;   /* patch GDOCS: brought in from Google Docs — no e-mail unless the admin turned it on */
    out.push({ key: 'est:' + s(e.id), title: s(e.name) || 'Your proposal', kind: 'proposal', at: ymd(e.sentDate || e.finalizedDate || e.date || e.updatedAt) }); });
  const insJ = isInsJob(p);   /* patch INSP */
  arr(data.projectDocs).filter(function(d){ return (insJ ? insDocShown(d, pid, shownEst) : docShown(d, pid, shownEst)) && gateAllows(null, p, gateKeyOf('d', d), d); }).forEach(function(d){   /* patch PORTALGATE */
    if (d.estimateId && shownEst[s(d.estimateId)]) return;               /* the estimate already counts */
    if (d.noNotice === true) return;                                       /* patch GDOCS */
    if (/final invoice|\binvoice/i.test(s(d.name) + ' ' + s(d.cat)) && !/proposal/i.test(s(d.cat))) return;
    if (!(d.portalShare === true && /customer portal/i.test(s(d.cat))) && !NOTIFY_DOC.test(s(d.cat) + ' ' + s(d.name)) && !(insJ && insGroupOf(d))) return;
    out.push({ key: 'doc:' + s(d.id), title: s(d.name) || 'Document', kind: 'doc', at: ymd(d.uploadedAt || d.uploaded || d.savedAt) });
  });
  arr(p.portalLinks).forEach(function(l){ if (l.hidden !== true && httpsUrl(l.url) && gateAllows(null, p, gateKeyOf('l', l), l)) out.push({ key: 'link:' + s(l.id), title: s(l.title) || 'Document', kind: 'doc', at: ymd(l.at) }); });
  if (gdocInfo(p.gdocUrl) && gateAllows(null, p, gateKeyOf('g', null, p), p)) out.push({ key: 'pgdoc:' + s(p.gdocUrl).slice(-40), title: 'Your proposal', kind: 'proposal', at: ymd(p.updatedAt) });
  listOf(data, ['cos', 'changeOrders']).filter(function(r){ return pidOf(r) === pid && /approv|sign|accept/.test(low(r.status)) && r.deleted !== true; })
    .forEach(function(c){ out.push({ key: 'co:' + s(c.id), title: 'Change order — ' + clip(c.desc || c.title || '', 60), kind: 'co', at: ymd(c.approvedDate || c.date || c.savedAt) }); });
  if (insJ) { const w = insWords(data, p); out.forEach(function(x){ x.title = scrub({ t: s(x.title) }, w).t; }); }   /* patch INSP */
  return out.filter(function(x){ return x.key.length > 4; });
}
async function notifyDocs(pid, event, opts){
  opts = opts || {};
  const now = opts.now || Date.now(), nowIso = new Date(now).toISOString();
  const data = opts.data || await crmData(true);
  const p = findProject(data, pid);
  if (!p) return { ok: false, retry: true, error: 'The job is not in the cloud yet.' };
  if (/lost|dead|cancel/.test(low(p.status))) return { ok: true, skipped: 'lost job' };
  if (!jaAllows(data, p, 'docsNotice')) return { ok: true, skipped: 'the new-papers notice is turned off for this job', off: 'docsNotice' };   /* patch JA */
  await gateGet(data);   /* patch PORTALGATE: the notice lists only what the portal shows */
  const items = noticeItems(data, p).filter(function(x){   /* patch JA: a paper the job does not send by itself is not announced */
    const t = low(x.title);
    if (x.kind === 'co' && !jaAllows(data, p, 'coSign')) return false;
    if (/warrant/.test(t) && !jaAllows(data, p, 'warrantyCert')) return false;
    if (/contract/.test(t) && x.kind !== 'co' && !jaAllows(data, p, 'contractSign')) return false;
    if (/faq|your grayco portal/.test(t) && !jaAllows(data, p, 'faqPacket')) return false;
    return true;
  });
  if (!items.length) return { ok: true, nothing: true };
  const r0 = await fetch(sbUrl() + '/rest/v1/gc_portal_notice?select=doc_key,first_seen_at,sent_at,result&project_id=eq.' + encodeURIComponent(pid), { headers: H() });
  if (!r0.ok) return { ok: false, error: 'Run docs/portal-setup.sql (gc_portal_notice).' };
  const have = {}; ((await r0.json()) || []).forEach(function(x){ have[x.doc_key] = x; });
  const firstLook = !Object.keys(have).length;
  const fresh = items.filter(function(x){ return !have[pid + '|' + x.key]; });
  if (fresh.length) {
    const rows = fresh.map(function(x){
      const old = firstLook && (!x.at || now - Date.parse(x.at + 'T12:00:00Z') > OLD);
      return { doc_key: pid + '|' + x.key, project_id: pid, title: clip(x.title, 120), first_seen_at: nowIso, sent_at: old ? nowIso : null, result: old ? 'already there' : null };
    });
    await fetch(sbUrl() + '/rest/v1/gc_portal_notice', { method: 'POST', headers: H({ Prefer: 'resolution=ignore-duplicates,return=minimal' }), body: JSON.stringify(rows) });
    rows.forEach(function(r){ have[r.doc_key] = r; });
  }
  const pending = Object.keys(have).map(function(k){ return have[k]; }).filter(function(x){ return !x.sent_at; });
  if (!pending.length) return { ok: true, nothing: true };
  const st = await settingsGet();
  if (!st.autoSend || p.portalRemindersPaused === true || p.portalNotifyPaused === true) return { ok: true, skipped: !st.autoSend ? 'auto-send is turned off' : 'paused for this job', pending: pending.length };
  const newest = Math.max.apply(null, pending.map(function(x){ return Date.parse(x.first_seen_at) || now; }));
  const oldest = Math.min.apply(null, pending.map(function(x){ return Date.parse(x.first_seen_at) || now; }));
  if (!opts.force && now - newest < QUIET && now - oldest < MAXWAIT) return { ok: true, waitMs: Math.min(QUIET - (now - newest), MAXWAIT - (now - oldest)) + 1000, pending: pending.length };
  /* claim exactly these rows; whatever another computer claimed first is not returned here */
  const batch = 'b' + now.toString(36) + crypto.randomBytes(3).toString('hex');
  const keys = pending.map(function(x){ return '"' + String(x.doc_key).replace(/"/g, '') + '"'; }).join(',');
  const c = await fetch(sbUrl() + '/rest/v1/gc_portal_notice?project_id=eq.' + encodeURIComponent(pid) + '&sent_at=is.null&doc_key=in.(' + encodeURIComponent(keys) + ')',
    { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ sent_at: nowIso, batch_id: batch }) });
  const mine = c.ok ? await c.json().catch(function(){ return []; }) : [];
  if (!Array.isArray(mine) || !mine.length) return { ok: true, already: true };
  const view = await buildView(data, p);
  const to = s(view.customer.email);
  const okEmail = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to);
  const done = mine.map(function(x){ return String(x.doc_key).split('|').slice(1).join('|'); });
  async function mark(result){ await fetch(sbUrl() + '/rest/v1/gc_portal_notice?batch_id=eq.' + batch, { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ result: result }) }); }
  if (!okEmail || !s(process.env.RESEND_API_KEY) || mailOff() || approvalNeeded('portal_docs')) {
    const apprD = okEmail && s(process.env.RESEND_API_KEY) && !mailOff();
    if (apprD) {
      const titlesA = mine.map(function(x){ return s(x.title) || 'Document'; });
      await queueApproval({ id: 'appr_docs_' + pid + '_' + batch, kind: 'portal_docs', pid: pid, jobName: p.name, pm: pmOf(data, p), to: to,
        subject: titlesA.length === 1 ? 'New in your GrayCo portal: ' + titlesA[0] : titlesA.length + ' new papers in your GrayCo portal — ' + (view.job.name || 'your job'),
        html: docsMailHtml(view, titlesA, LINK_PH), attachments: titlesA.map(function(x){ return { name: x, kind: 'portal' }; }), meta: { batch: batch, keys: done } });
      await mark('approval');
      return { ok: true, todo: true, approval: true, queued: true, keys: done };
    }
    await officeTodo('portal_docs_' + pid, (apprD ? 'Approve & tell ' : 'Tell ') + (view.customer.name || p.client || 'the customer') + ' about new papers in their portal',
      (apprD ? 'Waiting for approval — nothing was e-mailed' : (!okEmail ? 'No customer e-mail on file' : 'E-mail is not set up on Netlify (RESEND_API_KEY)')) + ' for ' + (p.name || 'the job') + ': ' + mine.map(function(x){ return x.title; }).join(', ') + '. Open the job → Customer portal → Email it or Text it.');
    await mark(apprD ? 'approval' : 'todo');
    return { ok: true, todo: true, approval: apprD, keys: done };
  }
  let token;
  try { token = await createFor(pid, 'auto: new document'); } catch (e) { await revert(); return { ok: false, retry: true, error: 'no link' }; }
  async function revert(){ await fetch(sbUrl() + '/rest/v1/gc_portal_notice?batch_id=eq.' + batch, { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ sent_at: null, batch_id: null }) }); }
  const link = linkFor(event, token);
  const titles = mine.map(function(x){ return s(x.title) || 'Document'; });
  const subject = withJob(titles.length === 1 ? 'New in your GrayCo portal: ' + titles[0] : titles.length + ' new papers in your GrayCo portal — ' + (view.job.name || 'your job'), p);
  const html = docsMailHtml(view, titles, link);
  let res;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + s(process.env.RESEND_API_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo Construction Services Portal <portal@grayco-cs.com>', reply_to: replyToFor((function(){ try { const m = pmOf(data, p); return m && m.email; } catch (e) { return ''; } })(), 'portal_docs'), to: [to], subject: subject, html: html }) });
    res = { ok: r.ok, status: r.status };
  } catch (e) { res = { ok: false }; }
  if (!res.ok) { await revert(); return { ok: false, retry: true, error: 'The e-mail did not go out (' + (res.status || 'no answer') + ').' }; }
  await mark('emailed');
  return { ok: true, sent: 'email', sentAt: nowIso, keys: done, count: done.length };
}
function docsMailHtml(view, titles, link){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E">' +
    '<div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center">' +
    '<img src="' + esc(baseUrl({}) + '/portal-logo.png') + '" alt="GrayCo Construction Services" width="180" style="display:block;margin:0 auto 6px">' +
    '<div style="font-size:18px;font-weight:bold">' + esc(view.job.name) + '</div></div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px">' +
    '<p style="font-size:15px">Hi ' + esc(view.customer.firstName || 'there') + ',</p>' +
    '<p style="font-size:15px;line-height:1.5">' + esc(view.pm.name || 'Your Project Manager') + ' just put ' + (titles.length === 1 ? 'something new' : 'a few new things') + ' in your GrayCo Portal:</p>' +
    '<ul style="font-size:15px;line-height:1.6">' + titles.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">View it in my portal</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions? Call ' + esc(view.pm.name || 'us') + (view.pm.phone ? ' at ' + esc(view.pm.phone) : '') + ' or the office at ' + OFFICE_PHONE + '.</p></div></div>';
}
/* the hourly run: every job with something waiting */
async function notifyAll(opts){
  opts = opts || {};
  const data = await crmData(true);
  const out = { sent: 0, todos: 0, waiting: 0 };
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal_notice?select=project_id&sent_at=is.null&limit=2000', { headers: H() });
  const pids = {};
  if (r.ok) ((await r.json()) || []).forEach(function(x){ pids[x.project_id] = 1; });
  for (const pid of Object.keys(pids)) {
    const res = await notifyDocs(pid, null, { data: data, now: opts.now });
    if (res.sent) out.sent++; else if (res.todo) out.todos++; else if (res.waitMs || res.skipped) out.waiting++;
  }
  return out;
}

/* ── health check: GET /.netlify/functions/portal?ping=1 — which settings are present (yes/no only,
   never a value) and whether each portal table answers ── */
async function ping(){
  const has = function(k){ return !!s(process.env[k]); };
  const out = { ok: true, portal: 'GrayCo customer portal', env: {
    SUPABASE_URL: has('SUPABASE_URL'), SUPABASE_SERVICE_KEY: has('SUPABASE_SERVICE_KEY') || has('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_ANON_KEY: has('SUPABASE_ANON_KEY'), STAFF_EMAILS: has('STAFF_EMAILS'), SITE_ORIGIN: has('SITE_ORIGIN'),
    SUPABASE_SERVICE_KEY_kind: keyKind(svcKey()),
    SUPABASE_URL_looks_right: /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(s(process.env.SUPABASE_URL || GC_SB_DEFAULT_URL)),
    COMPANYCAM_TOKEN: has('COMPANYCAM_TOKEN'), RESEND_API_KEY: has('RESEND_API_KEY'), PORTAL_MAIL_OFF: has('PORTAL_MAIL_OFF') }, tables: {} };
  const lower = Object.keys(process.env).filter(function(k){ return /^supabase_|^staff_emails$|^resend_api_key$|^companycam_token$/.test(k); });
  if (lower.length) out.lowercaseNames = lower;   /* names only — a lowercase name is not read */
  if (!svcKey()) { out.ok = false; out.problem = 'Server setting missing: SUPABASE_SERVICE_KEY'; return out; }
  for (const t of ['gc_portal', 'gc_portal_mail', 'gc_portal_notice', 'gc_kv']) {
    let st;
    try { const r = await fetch(sbUrl() + '/rest/v1/' + t + '?select=*&limit=0', { headers: H() }); st = r.status; } catch (e) { st = 0; }
    out.tables[t] = st >= 200 && st < 300 ? 'ok' : (st === 0 ? 'cannot reach Supabase (SUPABASE_URL)' : (st === 401 || st === 403 ? 'key not accepted (SUPABASE_SERVICE_KEY)' : (st === 404 || st === 400 ? 'missing — run docs/portal-setup.sql' : 'answered ' + st)));
    if (out.tables[t] !== 'ok') { out.ok = false; if (!out.problem) out.problem = t + ': ' + out.tables[t]; }
  }
  return out;
}


/* ── patch AUTAI (automations 10 + 11 + payments) ───────────────────────────────────────────────────────────
   · weekly_update (weekly-update.js) and portal_post (a voice note's "customer update"): approved → the post goes on
     the customer's portal page (gc_kv "gc_portal_auto_posts", shown with the job's own posts; the CRM also copies
     it onto project.portalPosts with the same id), then the e-mail when the item has one (channel email), and a
     text when the job's text switch is on (meta.sms; only once a texting provider exists — sendText).
   · announcement: a staff member's company message from a voice note; an admin approves, then it is added to the
     company messages (gc_adm_msgs: Admin → Message employees, or gc_pm_broadcasts: the PM alerts).
   · payment-receipt: a payment someone CONFIRMED against an invoice → the customer's receipt e-mail at once (the
     owner rule's exception: receipts send by themselves), recorded on the approvals list as sent, never twice. */
const AUTAI_POST = { weekly_update: 1, portal_post: 1 };
const AUTAI_STORES = { gc_adm_msgs: 1, gc_pm_broadcasts: 1 };
function autaiRefs(v){ return arr(v).map(function(f){ return { ref: s(f.ref), name: clip(f.name, 120), type: clip(f.type || 'image/jpeg', 40) }; }).filter(function(f){ return refPath(f.ref); }).slice(0, 12); }
async function autaiPost(item, now){
  const m = item.meta || {};
  const ap = (item.approvals || []).slice(-1)[0] || {};
  const post = { id: 'pp_aq_' + s(item.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60), pid: s(item.jobId), at: now, by: s(m.by || ap.by || item.pm || 'GrayCo'),
    text: clip(m.postText || item.text, 2000), files: autaiRefs(m.photos), src: item.kind, approvedBy: s(ap.by) };
  if (!post.pid) return { ok: false, error: 'No job on this item.' };
  const has = function(l){ return l.some(function(x){ return s(x.id) === post.id; }); };
  const r = await kvListUpdate('gc_portal_auto_posts', function(l){ return has(l) ? null : { list: l.concat([post]).slice(-3000), check: has }; });
  return r.ok ? { ok: true } : { ok: false, error: 'Could not put it on the portal page (' + r.error + ').' };
}
async function autaiText(item){
  const sm = (item.meta || {}).sms;
  if (!sm || !s(sm.to)) return;
  let body = clip(sm.text || item.text, 600);
  if (body.indexOf(LINK_PH) >= 0) { let tok = ''; try { tok = await createFor(item.jobId, 'approved: ' + item.kind); } catch (e) {} body = body.split(LINK_PH).join(tok ? linkFor(null, tok) : ''); }
  let t; try { t = await sendText(s(sm.to), body); } catch (e) { t = { ok: false, skipped: 'error' }; }
  item.meta.smsResult = t && t.ok ? 'sent' : 'not sent (' + (t && t.skipped || 'no provider') + ')';
}
async function autaiAnnounce(item, now){
  const m = item.meta || {};
  if (!AUTAI_STORES[m.store] || !m.record || typeof m.record !== 'object') return { ok: false, error: 'Nothing to post.' };
  const rec = JSON.parse(JSON.stringify(m.record)); rec.id = s(rec.id) || ('AN' + Date.now().toString(36)); rec.at = now; rec.approvedBy = s(((item.approvals || []).slice(-1)[0] || {}).by);
  const has = function(l){ return l.some(function(x){ return s(x.id) === rec.id; }); };
  const r = await kvListUpdate(m.store, function(l){ return has(l) ? null : { list: (m.store === 'gc_adm_msgs' ? [rec].concat(l) : l.concat([rec])).slice(0, 2000), check: has }; });
  return r.ok ? { ok: true } : { ok: false, error: 'Could not post it (' + r.error + ').' };
}
async function autaiQueue(body, who){
  const kind = s(body.kind), now = new Date().toISOString();
  const qid = 'appr_' + (kind === 'portal_post' ? 'post' : 'ann') + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const text = String(body.text || '').slice(0, 2000).trim();
  if (!text) return { status: 400, out: { ok: false, error: 'Nothing to post.' } };
  if (kind === 'announcement') {
    const store = AUTAI_STORES[s(body.store)] ? s(body.store) : 'gc_pm_broadcasts';
    const rec = body.record && typeof body.record === 'object' && JSON.stringify(body.record).length < 20000 ? body.record : { msg: text, pri: 'normal', target: 'ALL', expires: 0 };
    rec.by = rec.by || who.email; rec.source = 'voice'; rec.requestedBy = who.email;
    const q = await queueApproval({ id: qid, kind: 'announcement', pid: '', jobName: 'Company', pm: null, to: 'Everyone at GrayCo (CRM)', channel: 'crm',
      title: '📣 Company announcement from ' + (s(who.name) || who.email), subject: clip(body.subject || 'Company announcement', 200), html: textHtml(text), meta: { store: store, record: rec, by: who.email } });
    return { status: q ? 200 : 502, out: { ok: !!q, id: qid, queued: !!q } };
  }
  const pid = s(body.projectId);
  const data = await crmData(true); const p = pid && findProject(data, pid);
  if (!p) return { status: 404, out: { ok: false, retry: true, error: 'The job is not in the cloud yet.' } };
  const q = await queueApproval({ id: qid, kind: 'portal_post', pid: pid, jobName: p.name, pm: pmOf(data, p), to: 'Customer portal — ' + (s(p.client) || 'customer'), channel: 'portal',
    title: '📣 Portal post — ' + s(p.name), subject: 'Update on ' + s(p.name), html: textHtml(text),
    meta: { postText: text, photos: autaiRefs(body.photos), by: s(body.by) || who.name || who.email, source: s(body.source) || 'voice' } });
  return { status: q ? 200 : 502, out: { ok: !!q, id: qid, queued: !!q } };
}
function autaiReceiptHtml(doc, amt, date, method){   /* the body: _lib/brand.js puts the GrayCo shell around it */
  return '<p style="margin:0 0 4px;font-size:12px;font-weight:bold;letter-spacing:.06em;color:#D4A017">PAYMENT RECEIVED — THANK YOU</p>' +
    '<p>Hi ' + esc(firstName(doc.client) || 'there') + ',</p>' +
    '<p>We received your payment of <b>' + usd(amt) + '</b>' + (date ? ' on ' + esc(date) : '') + (method ? ' (' + esc(method) + ')' : '') + ' for <b>' + esc(doc.job) + '</b>, invoice #' + esc(doc.number) + '.</p>' +
    '<p>Invoice total ' + usd(doc.total) + ' · balance now <b>' + usd(Math.max(0, doc.balance)) + '</b>.</p>' +
    '<p style="margin:20px 0"><a href="' + LINK_PH + '" style="display:inline-block;background:#0F1D2F;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">See it on my GrayCo project page</a></p>';
}
async function autaiReceipt(body, who){
  const invId = s(body.invoiceId), amt = money(num(body.amount));
  if (!invId || !(amt > 0)) return { status: 400, out: { ok: false, error: 'Which invoice and how much?' } };
  const rid = 'rcpt_' + invId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) + '_' + s(body.paymentId || (ymd(body.date) + '_' + Math.round(amt * 100))).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  const cur = await kvListRead(AQ_KEY);
  if (cur && cur.list.some(function(x){ return s(x.id) === rid && x.status === 'sent'; })) return { status: 200, out: { ok: true, already: true, id: rid } };
  const data = await crmData(true); const ij = invoiceAndJob(data, invId);
  if (!ij) return { status: 404, out: { ok: false, retry: true, error: 'That invoice (or its job) is not in the cloud yet.' } };
  const doc = invoiceDoc(data, ij.p, ij.r);
  if (body.balanceAfter != null && body.balanceAfter !== '' && isFinite(num(body.balanceAfter))) doc.balance = money(num(body.balanceAfter));   /* the CRM's copy may be newer than the cloud's */
  const to = s(doc.email);
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to)) return { status: 200, out: { ok: false, noEmail: true, error: 'No customer e-mail on this job.' } };
  if (!s(process.env.RESEND_API_KEY) || mailOff()) return { status: 200, out: { ok: false, error: 'E-mail is not set up on Netlify (RESEND_API_KEY).' } };
  let token = ''; try { token = await createFor(s(ij.p.id), 'receipt'); } catch (e) {}
  let html = autaiReceiptHtml(doc, amt, ymd(body.date), clip(body.method, 40)).split(LINK_PH).join(token ? esc(linkFor(null, token)) : esc(baseUrl({}) + '/portal.html'));
  try { html = await require('./_lib/brand.js').shellFor(html, { email: billingEmail(), name: 'GrayCo Billing' }); } catch (e) {}
  const subject = withJob('Payment received — ' + clip(doc.job, 80) + ' (invoice #' + doc.number + ')', ij.p);
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + s(process.env.RESEND_API_KEY), 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: billingFrom(), reply_to: billingEmail(), to: [to], subject: subject, html: html }) });   /* patch BILL */
  if (!r.ok) return { status: 502, out: { ok: false, error: 'The receipt did not go out (' + r.status + ').' } };
  const now = new Date().toISOString();
  const item = { id: rid, kind: 'receipt', title: '🧾 Payment receipt — ' + clip(doc.job, 80), jobId: s(ij.p.id), jobName: s(ij.p.name), pm: '', pmEmail: '', channel: 'email', to: to, subject: subject,
    html: html, text: htmlText(html), attachments: [], steps: [], step: '', approvals: [], status: 'sent', createdAt: now, updatedAt: now, sentAt: now, sentBy: s(who.name) || who.email,
    meta: { invoiceId: invId, amount: amt, auto: true, confirmedBy: who.email } };
  const has = function(l){ return l.some(function(x){ return s(x.id) === rid; }); };
  await kvListUpdate(AQ_KEY, function(l){ return has(l) ? null : { list: l.concat([item]), check: has }; });
  return { status: 200, out: { ok: true, sent: true, id: rid, to: to } };
}

/* ── the door ──────────────────────────────────────────────────────────────── */
function reply(statusCode, headers, obj){ return { statusCode: statusCode, headers: headers, body: JSON.stringify(obj) }; }
async function notActive(headers, t0){
  const wait = MIN_FAIL_MS + Math.floor(Math.random() * 60) - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  return reply(404, headers, { ok: false, error: NOT_ACTIVE });
}

exports.handler = async function (event) {
  event = event || {};
  const t0 = Date.now();
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS', 'x-portal-token, x-portal-session'), {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  const qsp = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && (qsp.ping === '1' || qsp.ping === 'true')) {
    const ip0 = ipOf(event);
    if (limited(ip0)) return reply(429, headers, { ok: false, error: 'Too many tries.' });
    return reply(200, headers, await ping());
  }
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const action = s(body.action || 'view');

  /* STAFF */
  if (['create', 'revoke', 'regenerate', 'status', 'final-now', 'send-link', 'settings', 'notify-docs', 'approval', 'invoice-pdf', 'news', 'links', 'payment-receipt', 'gate'].indexOf(action) >= 0) {
    const who = await gcStaffAuth(event);
    if (!who.ok && who.statusCode === 403 && !svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY (without it the staff list cannot be read).' });
    if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
    if (!svcKey()) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY (Netlify → Environment variables).' });
    if (action === 'settings') {
      try {
        if (body.set && typeof body.set === 'object') return reply(200, headers, Object.assign({ ok: true }, await settingsSet(body.set, who.email)));
        return reply(200, headers, Object.assign({ ok: true }, await settingsGet()));
      } catch (e) { return reply(502, headers, { ok: false, error: 'Could not save the setting. Try again.' }); }
    }
    if (action === 'links') {        /* patch ADM: every portal link's state for Admin → System check (no link codes) */
      if (low(who.role) !== 'admin') return reply(403, headers, { ok: false, error: 'Admins only.' });
      try {
        const r = await sbFetch(sbUrl() + '/rest/v1/gc_portal?select=project_id,created_at,last_viewed_at,revoked,sent_at&order=created_at.desc&limit=2000', { headers: H() });
        if (!r.ok) return reply(r.status === 404 ? 503 : 502, headers, { ok: false, error: r.status === 404 ? 'Portal not set up: run docs/portal-setup.sql in Supabase.' : 'gc_portal read ' + r.status });
        const rows = await r.json();
        return reply(200, headers, { ok: true, links: (Array.isArray(rows) ? rows : []).map(function(x){ return { projectId: x.project_id, createdAt: x.created_at, lastViewedAt: x.last_viewed_at, revoked: !!x.revoked, sentAt: x.sent_at }; }) });
      } catch (e) { return reply(500, headers, { ok: false, error: 'The portal server hit a problem: ' + clip(e && e.message || e, 120) }); }
    }
    if (action === 'gate') {   /* patch PORTALGATE: what waits to go in a portal (op state), or look for new things now (op scan) */
      try {
        if (s(body.op) === 'scan') return reply(200, headers, await gateScan({ pid: s(body.projectId) }));
        return reply(200, headers, await gateState(s(body.projectId)));
      } catch (e) { return reply(502, headers, { ok: false, error: 'The portal gate hit a problem: ' + clip(e && e.message || e, 120) }); }
    }
    if (action === 'approval') {
      try { const a = await approvalAction(body, who); return reply(a.status, headers, a.out); }
      catch (e) { return reply(500, headers, { ok: false, error: 'The approval hit a problem: ' + clip(e && e.message || e, 120) }); }
    }
    if (action === 'invoice-pdf') {   /* patch AP2: the PDF the customer gets, for the approval preview */
      try {
        const data = await crmData(true); const ij = invoiceAndJob(data, s(body.invoiceId));
        if (!ij) return reply(404, headers, { ok: false, error: 'That invoice (or its job) is not in the cloud yet.' });
        const f = invoicePdf(data, ij.p, ij.r);
        return reply(200, headers, { ok: true, filename: f.filename, pdf: f.pdf.toString('base64'), number: f.doc.number });
      } catch (e) { return reply(500, headers, { ok: false, error: 'Could not make the PDF: ' + clip(e && e.message || e, 120) }); }
    }
    if (action === 'news') {          /* patch AP2: "News: subscribed / unsubscribed (date)" and an admin's re-subscribe */
      const N = newsLib(), op = s(body.op), admin = low(who.role) === 'admin';
      try {
        if (op === 'status') return reply(200, headers, { ok: true, status: await N.status((Array.isArray(body.emails) ? body.emails : []).filter(function(e){ return typeof e === 'string'; }).slice(0, 500)) });
        if (!admin) return reply(403, headers, { ok: false, error: 'Only Wesley or Nick can change who gets GrayCo News.' });
        if (op === 'resubscribe') {
          if (body.customerAsked !== true) return reply(400, headers, { ok: false, error: 'Re-subscribe only when the customer asked for it.' });
          const okR = await N.resubscribe(s(body.email), 'admin ' + who.email + ' (customer asked)');
          return reply(okR ? 200 : 502, headers, { ok: okR, status: okR ? await N.status([s(body.email)]) : null });
        }
        if (op === 'unsubscribe') { const okU = await N.unsubscribe(s(body.email), 'admin ' + who.email); return reply(okU ? 200 : 502, headers, { ok: okU }); }
        if (op === 'subscribers') { const list = await N.subscribers(await crmData(true)); return reply(200, headers, { ok: true, count: list.length, subscribers: list }); }
        return reply(400, headers, { ok: false, error: 'Bad request' });
      } catch (e) { return reply(503, headers, { ok: false, setup: true, error: 'GrayCo News list is not set up: run docs/news-unsubscribe.sql in Supabase.' }); }
    }
    if (action === 'payment-receipt') {   /* patch AUTAI: the customer's receipt once a payment is confirmed (never asks) */
      try { const rc = await autaiReceipt(body, who); return reply(rc.status || 200, headers, rc.out); }
      catch (e) { return reply(500, headers, { ok: false, error: 'The receipt hit a problem: ' + clip(e && e.message || e, 120) }); }
    }
    const pid = s(body.projectId);
    if (!pid) return reply(400, headers, { ok: false, error: 'Open a job first.' });
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return reply(400, headers, { ok: false, error: 'That job id is not one the portal can use (' + clip(pid, 30) + ').' });
    try {
      if (action === 'status') {
        const row = await activeFor(pid);
        return reply(200, headers, { ok: true, active: !!row, url: row ? linkFor(event, row.token) : '', lastViewedAt: row ? row.last_viewed_at : null });
      }
      if (action === 'revoke' || action === 'regenerate') await revokeFor(pid);
      if (action === 'revoke') return reply(200, headers, { ok: true, active: false });
      if (action === 'final-now') {
        const rep = await runReminders({ projectId: pid });
        return reply(200, headers, rep);
      }
      if (action === 'send-link') return reply(200, headers, await sendLink(pid, event, who.email));
      if (action === 'notify-docs') return reply(200, headers, await notifyDocs(pid, event, {}));
      const token = await createFor(pid, who.email);
      return reply(200, headers, { ok: true, active: true, url: linkFor(event, token) });
    } catch (e) {
      if (e && e.setup) return reply(503, headers, { ok: false, setup: true, error: 'Portal not set up: run docs/portal-setup.sql in Supabase.' });
      if (e && e.plain) return reply(502, headers, { ok: false, error: e.plain });
      return reply(500, headers, { ok: false, error: 'The portal server hit a problem: ' + clip(e && e.message || e, 120) });
    }
  }

  /* PUBLIC */
  if (action !== 'view' && action !== 'photos' && action !== 'invoice' && action !== 'referral') return reply(400, headers, { ok: false, error: 'Bad request' });
  const ip = ipOf(event);
  if (limited(ip)) { await sleep(MIN_FAIL_MS); return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' }); }
  const token = s(gcHeader(event, 'x-portal-token') || body.t);
  let row = null;
  const sessTok = s(gcHeader(event, 'x-portal-session'));
  if (!TOKEN_RE.test(token) && TOKEN_RE.test(sessTok) && svcKey()) {
    /* 33.151: signed in with a code (portal-access.js) — the session opens only jobs whose link is still on */
    try { row = await sessionRow(sessTok, s(body.projectId)); } catch (e) { row = null; }
    if (!row) { noteBad(ip); return notActive(headers, t0); }
  } else {
  if (!TOKEN_RE.test(token) || !svcKey()) { noteBad(ip); return notActive(headers, t0); }
  try { row = await tokenRow(token); } catch (e) { row = null; }
  if (!row || row.revoked === true) { noteBad(ip); return notActive(headers, t0); }
  }
  let data, p;
  try { data = await crmData(false); p = findProject(data, row.project_id); } catch (e) { return reply(503, headers, { ok: false, error: 'We could not load your job just now. Please try again in a minute, or call GrayCo ' + OFFICE_PHONE + '.' }); }
  if (!p) return notActive(headers, t0);
  if (action === 'photos') {
    const ccId = ccIdOf(p);
    const recs = await grayCoRecords();
    const hide = ccHidden(recs);
    const cc = (ccId ? await ccPhotos(ccId) : []).filter(function(x){ return !hide[String(x.id).replace(/^cc_/, '')]; });
    const gc = await grayCoPhotos(p.id, recs || []);
    const list = gc.concat(cc).sort(function(a, b){ return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
    /* patch X12: the AI photo tag's STAGE label only ("Tear-off", "Finished") — never a damage word */
    try { const ai = (await kvRead(['gc_photo_ai'])).gc_photo_ai; const map = (ai && ai.map) || {}; const X12 = require('./_lib/x12.js');
      list.forEach(function(x){ const k = /^cc_/.test(s(x.id)) ? 'cc:' + s(x.id).slice(3) : s(x.id), lab = X12.portalLabel(map[k]); if (lab) x.stage = lab; }); } catch (e) {}
    return reply(200, headers, { ok: true, photos: list, expiresIn: SIGN_SECS });
  }
  if (action === 'referral') {   /* patch REF: the referral program card — join, refer a friend, the member's gift cards, use a gift card on this job */
    if (body.preview === true && s(body.op) && s(body.op) !== 'state') return reply(200, headers, { ok: false, error: 'Preview — nothing is saved.' });
    const rr = await require('./_lib/referral.js').portal(data, p, body, { ip: ip });
    return reply(rr.code || 200, headers, rr.body);
  }
  if (action === 'invoice') {   /* patch AP2: one of this job's invoices as a PDF (never a draft, never another job's) */
    const r = listOf(data, ['invs', 'invoices']).find(function(x){ return s(x.id) === s(body.id) && invOfProject(x, p) && isCustomerInvoice(x); });
    if (!r) return reply(404, headers, { ok: false, error: 'That invoice is not in your portal.' });
    const f = invoicePdf(data, p, r);
    return reply(200, headers, { ok: true, filename: f.filename, pdf: f.pdf.toString('base64') });
  }
  const view = await buildView(data, p);
  /* when was it last opened (at most once every 10 minutes per link) */
  const last = row.last_viewed_at ? Date.parse(row.last_viewed_at) : 0;
  if (row.token && body.preview !== true && (!last || Date.now() - last > 10 * 60e3)) {   /* patch INSP: a staff preview is not a visit */
    try { await fetch(sbUrl() + '/rest/v1/gc_portal?token=eq.' + encodeURIComponent(row.token), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ last_viewed_at: new Date().toISOString() }) }); } catch (e) {}
  }
  return reply(200, headers, view);
};

/* for portal-reminders.js and the tests */
exports._core = { seniorPm: async function(){ let d = {}; try { d = await crmData(true); } catch (e) {} return PEOPLE().seniorPm(d.users, d.gc_senior_pm); }, people: PEOPLE, JA: JA, jaAllows: jaAllows, pmByName: async function(name){ const n = s(name); if (!n) return null; let d = {}; try { d = await crmData(true); } catch (e) {} return pmOf(d, { pm: n }); }, officeTodo: officeTodo, taskListOf: taskListOf, kvListUpdate: kvListUpdate, queueApproval: queueApproval, gateScan: gateScan, gateState: gateState, gateGet: gateGet, gateAllows: gateAllows, gateKeyOf: gateKeyOf, gateSet: gateSet, GATE_KEY: GATE_KEY, _gateReset: function(){ GATE_LAST = null; GATE_AT = 0; }, approvalAction: approvalAction, aqMerge: aqMerge, AQ_KEY: AQ_KEY, LINK_PH: LINK_PH, notifyDocs: notifyDocs, notifyAll: notifyAll, noticeItems: noticeItems, sendLink: sendLink, settingsGet: settingsGet, warrantyOf: warrantyOf, buildView: buildView, runReminders: runReminders, stageOf: stageOf, gdocInfo: gdocInfo, ccIdOf: ccIdOf,
  newToken: newToken, grayCoPhotos: grayCoPhotos, escalateDue: escalateDue, escalatedOrDue: escalatedOrDue, ESC_MS: ESC_MS, approvedReminder: approvedReminder, aqSend: aqSend, replyToFor: replyToFor, invoiceDoc: invoiceDoc, invoicePdf: invoicePdf, invNumber: invNumber, invCustStatus: invCustStatus,
  queueInvoiceMail: queueInvoiceMail, queueNewInvoices: queueNewInvoices, invMailWanted: invMailWanted, news: function(){ return newsLib(); }, STAGES: STAGES, NOT_ACTIVE: NOT_ACTIVE, _reset: function(){ kvCache = null; photoCache.clear(); hits.clear(); GATE_LAST = null; GATE_AT = 0; } };
/* patch AUTAI */
Object.assign(exports._core, { crmData: crmData, kvRead: kvRead, activeFor: activeFor, sendText: sendText, LINK_PH_: LINK_PH, pmOf: pmOf, findProject: findProject, textHtml: textHtml, kvListRead: kvListRead, autaiReceipt: autaiReceipt, autaiQueue: autaiQueue, AUTAI_POST: AUTAI_POST });
/* patch GCP: the GC portal and the customer-portal extras (gc-portal.js, _lib/gcp.js) */
Object.assign(exports._core, { gcStaffAuth: gcStaffAuth, signRefs: signRefs, tokenRow: tokenRow, sessionRow: sessionRow, ccPhotos: ccPhotos, ccHidden: ccHidden, grayCoRecords: grayCoRecords, withJob: withJob, jobTag: jobTag, pushTo: pushTo, ipOf: ipOf, limited: limited, noteBad: noteBad, gcCors: gcCors, gcHeader: gcHeader, adminEmails: adminEmails, officeEmails: officeEmails, listOf: listOf, TOKEN_RE: TOKEN_RE, OFFICE_PHONE: OFFICE_PHONE, MIN_FAIL_MS: MIN_FAIL_MS, SIGN_SECS: SIGN_SECS });
/* patch INSP */
Object.assign(exports._core, { isInsJob: isInsJob, insDocShown: insDocShown, insInternal: insInternal, insGroupOf: insGroupOf, insuranceView: insuranceView, INS_STEPS: INS_STEPS });
/* patch AUTO5: portal-sign.js (signatures in the portal, estimate follow-ups) */
Object.assign(exports._core, { createFor: createFor, linkFor: linkFor, withJob: withJob, replyToFor: replyToFor });
/* patch WEB: the website intake (website-intake.js) and the Business Brain (brain.js) read the CRM's records the same way */
Object.assign(exports._core, { isHistoryInvoice: isHistoryInvoice });   /* patch LCLEAN */
Object.assign(exports._core, { kvRead: kvRead, crmData: crmData, kvListRead: kvListRead, isCustomerInvoice: isCustomerInvoice, invBalance: invBalance, invPaid: invPaid, invAmount: invAmount, invNumber: invNumber, pmOf: pmOf });
/* patch AUTO7: portal-extra.js (the customer's "Report an issue", materials arriving) and field-auto.js read the same way */
Object.assign(exports._core, { tokenRow: tokenRow, sessionRow: sessionRow, withJob: withJob, replyToFor: replyToFor, adminReplyTo: adminReplyTo, scrub: scrub, insWords: insWords, insClaim: insClaim,
  ipOf: ipOf, limited: limited, noteBad: noteBad, sbUrl: sbUrl, svcKey: svcKey, keyHeaders: keyHeaders, H: H, TOKEN_RE: TOKEN_RE, OFFICE_PHONE: OFFICE_PHONE, NOT_ACTIVE: NOT_ACTIVE,
  pushTo: pushTo, adminEmails: adminEmails, officeEmails: officeEmails, REVIEW_URL: REVIEW_URL });
