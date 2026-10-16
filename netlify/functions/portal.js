// netlify/functions/portal.js
// GrayCo — THE CUSTOMER PORTAL (patch Q).
//
// A customer opens  https://<site>/portal.html#t=<link code>.  The page sends the code
// here (in the x-portal-token header — never in the address, so it is never in a log).
//
// PUBLIC (no sign-in, only the link code):
//   POST {action:'view'}    → a small, CLEANED view of that ONE job (a strict whitelist:
//                             see buildView). Nothing else ever leaves this function.
//   POST {action:'photos'}  → every CompanyCam photo of that job (server key, paged, cached).
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
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* CORS: only the CRM's own site may call from a browser (SITE_ORIGIN, comma list). */
function gcCors(event, methods, extraHeaders){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',')
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
        { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
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

const OFFICE_PHONE = '901-585-0944';
const NOT_ACTIVE = 'This link is not active — call GrayCo ' + OFFICE_PHONE;
const STAGES = ['Lead', 'Contacted', 'Appointment booked', 'Estimate sent', 'Contract signed + scheduled',
                'In progress', 'Punch list', 'Final invoice', 'Closed'];
const REVIEW_URL = 'https://share.google/quDuhdlL0ckxPLLY3';
const FACEBOOK_URL = 'https://www.facebook.com/p/GrayCo-Construction-Services-LLC-100092932745320/';
const KV_KEYS = ['projects', 'invs', 'invoices', 'cos', 'changeOrders', 'estimates', 'projectDocs', 'users',
                 'customers', 'leads', 'punch', 'projectPayments', 'gc_deleted_projects'];
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
function H(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
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
      out.push({ t: thumb, f: full, at: ymd(ph.captured_at || ph.created_at) });
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
  if (/draft|void|deleted|declined|denied|cancel/.test(low(r.status))) return false;
  if (r._pmDenied === true || r.deleted === true) return false;
  return true;
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
function stageOf(p, ctx){
  const o = p.portalStage;
  if (o != null && o !== '' && o !== 'auto') {
    const i = typeof o === 'number' ? o : STAGES.map(low).indexOf(low(o));
    if (i >= 0 && i < STAGES.length) return i;
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
function scrub(obj, words){
  if (!words.length) return obj;
  const res = words.map(function(w){ return new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); });
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

async function buildView(data, p, opts){
  opts = opts || {};
  const pid = s(p.id);
  const users = arr(data.users), customers = arr(data.customers);
  const invoices = listOf(data, ['invs', 'invoices']).filter(function(r){ return pidOf(r) === pid && isCustomerInvoice(r); });
  const cos = listOf(data, ['cos', 'changeOrders']).filter(function(r){ return pidOf(r) === pid && /approv|sign|accept/.test(low(r.status)) && r.deleted !== true; });
  const ests = arr(data.estimates).filter(function(e){ return proposalShown(e, pid, p); });
  const shownEst = {}; ests.forEach(function(e){ shownEst[s(e.id)] = 1; });
  const pdocs = arr(data.projectDocs).filter(function(d){ return docShown(d, pid, shownEst); });
  const openPunch = arr(data.punch).some(function(x){ return pidOf(x) === pid && !/complete|done|closed/.test(low(x.status)); });
  const lead = arr(data.leads).find(function(l){ return s(l.fromProjectId) === pid || pidOf(l) === pid; }) || null;

  const clientName = s(p.client || p.customer || p.clientName);
  const cust = customers.find(function(c){ return clientName && low(c.name || c.company) === low(clientName); }) || {};
  const pmName = s(p.pm || p.projectManager);
  const pmUser = users.find(function(u){ return pmName && low(u.name) === low(pmName); }) || {};

  /* files: every crm-files reference shown gets ONE short-lived signed link */
  const posts = arr(p.portalPosts).filter(function(x){ return x.hidden !== true && (s(x.text) || arr(x.files).length); })
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
      url: g ? g.url : (pdf ? (signed[pdf.ref] || httpsUrl(pdf.url)) : ''), preview: g ? g.preview : '' });
  });
  const pg = gdocInfo(p.gdocUrl);
  if (pg) addDoc({ kind: 'gdoc', title: 'Your proposal (Google Doc)', date: '', url: pg.url, preview: pg.preview });
  arr(p.portalLinks).forEach(function(l){
    if (l.hidden === true) return;
    const g = gdocInfo(l.url), u = httpsUrl(l.url);
    if (!u) return;
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

  /* money */
  const contract = money(num(p.contractAmount) || num(p.contract) || num(p.contractAmt));
  const invOut = invoices.map(function(r){
    const amount = money(num(r.amt != null ? r.amt : (r.amount != null ? r.amount : r.total)));
    const bal = invBalance(r);
    return { number: clip(r.invNum || r.num || r.number || r.docNumber || '', 30), date: ymd(r.date || r.sentDate || r.created || r.savedAt),
      due: ymd(r.dueDate || r.due), amount: amount, balance: bal, status: bal <= 0 ? 'Paid' : (/overdue|late/.test(low(r.status)) ? 'Past due' : 'Open'),
      isFinal: invFinal(r) };
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

  const stage = stageOf(p, { invoices: invoices, openPunch: openPunch, proposals: ests.length + (pg ? 1 : 0), leadStage: lead && (lead.stage || lead.status) });
  const ccId = ccIdOf(p);
  const view = {
    ok: true,
    office: { phone: OFFICE_PHONE },
    customer: { name: clip(clientName || cust.name, 80), firstName: firstName(clientName || cust.name),
      address: clip(p.address || p.jobAddress || cust.address, 160),
      phone: clip(p.clientPhone || p.customerPhone || p.phone || cust.phone, 40),
      email: clip(p.clientEmail || p.customerEmail || p.email || cust.email, 120) },
    job: { name: clip(p.name, 90), address: clip(p.address || p.jobAddress, 160), po: clip(p.autoPO || p.po, 20), stage: stage, stageName: STAGES[stage], stages: STAGES },
    pm: { name: clip(pmName, 60), phone: clip(pmUser.phone || pmUser.cell || pmUser.mobile || '', 40), email: clip(pmUser.email || '', 120) },
    money: { contract: contract, changeOrders: cos.map(function(c){ return { title: clip(c.desc || c.description || c.title || c.name || 'Change order', 120), amount: money(num(c.amt != null ? c.amt : (c.amount != null ? c.amount : c.total))), date: ymd(c.date || c.approvedDate || c.savedAt) }; }),
      invoices: invOut, payments: payments, paid: paid, due: due,
      finalInvoice: invOut.filter(function(x){ return x.isFinal; }).slice(-1)[0] || null },
    posts: posts.map(function(x){ return { id: clip(x.id, 40), at: s(x.at).slice(0, 25), by: firstName(x.by), text: clip(x.text, 2000),
      photos: arr(x.files).map(function(f){ return signed[f.ref] || ''; }).filter(Boolean).slice(0, 12) }; }),
    docs: docs.slice(0, 60),
    companyCam: { url: ccLinkOf(p), linked: !!ccId },
    warranty: warrantyOf(p, stage),
    showReview: stage >= 7,
    review: stage >= 7 ? { google: REVIEW_URL, facebook: FACEBOOK_URL } : null
  };
  return scrub(view, carrierWords(p));
}

/* ── warranty (owner rule): ALL roofs 5 years (residential, commercial, insurance); insurance /
   restoration 5 years; everything else 1 year. Starts at completion. ── */
function warrantyOf(p, stage){
  const t = low([p.type, p.name, p.scope, p.scopeOfWork, p.jobType].filter(function(x){ return typeof x === 'string'; }).join(' '));
  const roof = /roof|shingle|re-?roof/.test(t);
  const ins = p.isInsurance === true || /insurance|restoration|fire damage|water damage|storm|claim/.test(t);
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
async function activeFor(pid){
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal?select=token,created_at,last_viewed_at&revoked=eq.false&project_id=eq.' + encodeURIComponent(pid) + '&order=created_at.desc&limit=1', { headers: H() });
  if (r.status === 404 || r.status === 400) { const e = new Error('setup'); e.setup = true; throw e; }
  if (!r.ok) throw new Error('gc_portal read ' + r.status);
  const rows = await r.json();
  return (Array.isArray(rows) && rows[0]) || null;
}
async function createFor(pid, by){
  const have = await activeFor(pid);
  if (have) return have.token;
  const token = newToken();
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal', { method: 'POST', headers: H({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ token: token, project_id: pid, created_by: clip(by, 120), revoked: false }) });
  if (!r.ok) {
    const again = await activeFor(pid);     /* someone else made it this instant (one active link per job) */
    if (again) return again.token;
    if (r.status === 404) { const e = new Error('setup'); e.setup = true; throw e; }
    throw new Error('gc_portal write ' + r.status);
  }
  return token;
}
async function revokeFor(pid){
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal?revoked=eq.false&project_id=eq.' + encodeURIComponent(pid), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ revoked: true }) });
  if (!r.ok) throw new Error('gc_portal update ' + r.status);
}
function baseUrl(event){
  const env = s(process.env.PORTAL_BASE_URL).replace(/\/$/, '');
  if (/^https:\/\//.test(env)) return env;
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event || {}, 'origin').replace(/\/$/, '');
  return allowed.indexOf(origin) > -1 ? origin : allowed[0];
}
function linkFor(event, token){ return baseUrl(event) + '/portal.html#t=' + token; }

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
    '<p style="text-align:center;margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">See your invoice and job</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions? Call us at ' + OFFICE_PHONE + (v.pm.phone ? ' or ' + esc(pmName) + ' at ' + esc(v.pm.phone) : '') + '.</p>' +
    '</div></div>';
}
async function sendMail(to, subject, html){
  const key = s(process.env.RESEND_API_KEY);
  if (!key || mailOff()) return { ok: false, skipped: 'no-key' };
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'GrayCo Construction Services Billing <billing@grayco-cs.com>', reply_to: 'office@grayco-cs.com', to: [to], subject: subject, html: html }) });
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
async function officeTodo(id, label, note){
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.gc_office_tasks', { headers: H() });
    let list = []; if (r.ok) { const rows = await r.json(); list = arr(rows && rows[0] && rows[0].value); }
    if (list.some(function(t){ return t.id === id; })) return true;
    const now = new Date().toISOString();
    list.push({ id: id, label: label, note: note, addedBy: 'Customer portal', addedAt: now, updatedAt: now, done: false });
    const w = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ key: 'gc_office_tasks', value: list, updated_at: now }) });
    return w.ok;
  } catch (e) { return false; }
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
    const finals = invs.filter(function(r){ return pidOf(r) === pid && isCustomerInvoice(r) && invFinal(r) && invBalance(r) > 0; });
    if (!finals.length) continue;
    if (p.portalRemindersPaused === true) { report.paused++; continue; }
    for (const inv of finals) {
      const invId = s(inv.id); if (!invId) continue;
      const prev = rows[invId] || null;
      const first = !prev || !prev.first_sent_at;
      if (!first && prev.last_reminder_at && now - new Date(prev.last_reminder_at) < REMIND_EVERY) { report.skipped++; continue; }
      if (first && prev && prev.last_reminder_at && now - new Date(prev.last_reminder_at) < DAY) { report.skipped++; continue; }   /* a try today already */
      const view = await buildView(data, p);
      const to = s(view.customer.email);
      const okEmail = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to);
      if (!okEmail || !s(process.env.RESEND_API_KEY) || mailOff()) {
        if (!prev || !prev.todo_at) {
          if (!(await claim(invId, pid, prev, nowIso))) { report.skipped++; continue; }
          const why = !okEmail ? 'There is no good customer e-mail on file.' : 'E-mail is not set up on Netlify (RESEND_API_KEY).';
          await officeTodo('portal_final_' + invId, 'Send the final invoice by hand — ' + (p.name || 'job'),
            why + ' The invoice is in the customer portal. Text or call the customer with the portal link (job → Customer portal → Copy link).');
          await patchMail(invId, { todo_at: nowIso, last_result: !okEmail ? 'no-email' : 'no-mail-key' });
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
      try { res = await sendMail(to, subject, mailHtml(first ? 'first' : 'reminder', view, link)); } catch (e) { res = { ok: false }; }
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
function linkMailHtml(v, link){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E">' +
    '<div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center">' +
    '<img src="' + esc(baseUrl({}) + '/portal-logo.png') + '" alt="GrayCo Construction Services" width="180" style="display:block;margin:0 auto 6px">' +
    '<div style="font-size:18px;font-weight:bold">' + esc(v.job.name) + '</div></div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px">' +
    '<p style="font-size:15px">Hi ' + esc(v.customer.firstName || 'there') + ',</p>' +
    '<p style="font-size:15px;line-height:1.5">Thank you for choosing GrayCo! This is your own project page. Open it any time — no password needed. You will see updates from ' + esc(v.pm.name || 'your Project Manager') + ', every job photo, your proposal and documents, and your invoices.</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Open my project page</a></p>' +
    '<p style="font-size:13px;color:#55626F">Keep this e-mail — the button always opens your page. Questions? Call us at ' + OFFICE_PHONE + '.</p></div></div>';
}
async function sendLink(pid, event, who){
  const st = await settingsGet();
  if (!st.autoSend) return { ok: true, skipped: 'auto-send is turned off' };
  const now = Date.now();
  const data = await crmData(true);
  const p = findProject(data, pid);
  if (!p) return { ok: false, retry: true, error: 'The job is not in the cloud yet.' };
  if (/lost|dead|cancel/.test(low(p.status))) return { ok: true, skipped: 'lost job' };
  if (!isNewJob(p, now)) return { ok: true, skipped: 'not a new job' };
  const token = await createFor(pid, who || 'auto: new job');
  const rr = await fetch(sbUrl() + '/rest/v1/gc_portal?select=sent_at,sent_via,link_todo_at&token=eq.' + encodeURIComponent(token), { headers: H() });
  const row = rr.ok ? ((await rr.json()) || [])[0] || {} : {};
  if (row.sent_at) return { ok: true, already: true, sentAt: row.sent_at, via: row.sent_via || 'email' };
  const view = await buildView(data, p);
  const link = linkFor(event, token);
  const to = s(view.customer.email);
  const okEmail = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to);
  if (!okEmail || !s(process.env.RESEND_API_KEY) || mailOff()) {
    if (row.link_todo_at) return { ok: true, todo: true, already: true };
    const c = await fetch(sbUrl() + '/rest/v1/gc_portal?token=eq.' + encodeURIComponent(token) + '&link_todo_at=is.null', { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ link_todo_at: new Date(now).toISOString() }) });
    const got = c.ok ? await c.json().catch(function(){ return []; }) : [];
    if (!Array.isArray(got) || got.length !== 1) return { ok: true, todo: true, already: true };
    const name = view.customer.name || p.client || 'the customer';
    await officeTodo('portal_link_' + pid, 'Send portal link to ' + name,
      (!okEmail ? 'No customer e-mail on file' : 'E-mail is not set up on Netlify (RESEND_API_KEY)') + ' for ' + (p.name || 'the job') + '. Open the job → Customer portal → Text it or Copy link.');
    return { ok: true, todo: true };
  }
  const nowIso = new Date(now).toISOString();
  const c = await fetch(sbUrl() + '/rest/v1/gc_portal?token=eq.' + encodeURIComponent(token) + '&sent_at=is.null', { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ sent_at: nowIso, sent_via: 'email' }) });
  const got = c.ok ? await c.json().catch(function(){ return []; }) : [];
  if (!Array.isArray(got) || got.length !== 1) return { ok: true, already: true };
  let res;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + s(process.env.RESEND_API_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo Construction Services Portal <portal@grayco-cs.com>', reply_to: 'office@grayco-cs.com', to: [to], subject: 'Your GrayCo project page — ' + (view.job.name || 'your job'), html: linkMailHtml(view, link) }) });
    res = { ok: r.ok, status: r.status };
  } catch (e) { res = { ok: false }; }
  if (!res.ok) {
    await fetch(sbUrl() + '/rest/v1/gc_portal?token=eq.' + encodeURIComponent(token), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ sent_at: null, sent_via: null }) });
    return { ok: false, retry: true, error: 'The e-mail did not go out (' + (res.status || 'no answer') + ').' };
  }
  let via = 'email';
  if (st.text) { const tx = await sendText(view.customer.phone, 'GrayCo: your project page ' + link); if (tx.ok) via = 'email+text'; }
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
  const ests = arr(data.estimates).filter(function(e){ return proposalShown(e, pid, p); });
  const shownEst = {}; ests.forEach(function(e){ shownEst[s(e.id)] = 1; });
  ests.forEach(function(e){ out.push({ key: 'est:' + s(e.id), title: s(e.name) || 'Your proposal', kind: 'proposal', at: ymd(e.sentDate || e.finalizedDate || e.date || e.updatedAt) }); });
  arr(data.projectDocs).filter(function(d){ return docShown(d, pid, shownEst); }).forEach(function(d){
    if (d.estimateId && shownEst[s(d.estimateId)]) return;               /* the estimate already counts */
    if (/final invoice|\binvoice/i.test(s(d.name) + ' ' + s(d.cat)) && !/proposal/i.test(s(d.cat))) return;
    if (!(d.portalShare === true && /customer portal/i.test(s(d.cat))) && !NOTIFY_DOC.test(s(d.cat) + ' ' + s(d.name))) return;
    out.push({ key: 'doc:' + s(d.id), title: s(d.name) || 'Document', kind: 'doc', at: ymd(d.uploadedAt || d.uploaded || d.savedAt) });
  });
  arr(p.portalLinks).forEach(function(l){ if (l.hidden !== true && httpsUrl(l.url)) out.push({ key: 'link:' + s(l.id), title: s(l.title) || 'Document', kind: 'doc', at: ymd(l.at) }); });
  if (gdocInfo(p.gdocUrl)) out.push({ key: 'pgdoc:' + s(p.gdocUrl).slice(-40), title: 'Your proposal', kind: 'proposal', at: ymd(p.updatedAt) });
  listOf(data, ['cos', 'changeOrders']).filter(function(r){ return pidOf(r) === pid && /approv|sign|accept/.test(low(r.status)) && r.deleted !== true; })
    .forEach(function(c){ out.push({ key: 'co:' + s(c.id), title: 'Change order — ' + clip(c.desc || c.title || '', 60), kind: 'co', at: ymd(c.approvedDate || c.date || c.savedAt) }); });
  return out.filter(function(x){ return x.key.length > 4; });
}
async function notifyDocs(pid, event, opts){
  opts = opts || {};
  const now = opts.now || Date.now(), nowIso = new Date(now).toISOString();
  const data = opts.data || await crmData(true);
  const p = findProject(data, pid);
  if (!p) return { ok: false, retry: true, error: 'The job is not in the cloud yet.' };
  if (/lost|dead|cancel/.test(low(p.status))) return { ok: true, skipped: 'lost job' };
  const items = noticeItems(data, p);
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
  if (!okEmail || !s(process.env.RESEND_API_KEY) || mailOff()) {
    await officeTodo('portal_docs_' + pid, 'Tell ' + (view.customer.name || p.client || 'the customer') + ' about new papers in their portal',
      (!okEmail ? 'No customer e-mail on file' : 'E-mail is not set up on Netlify (RESEND_API_KEY)') + ' for ' + (p.name || 'the job') + ': ' + mine.map(function(x){ return x.title; }).join(', ') + '. Open the job → Customer portal → Text it.');
    await mark('todo');
    return { ok: true, todo: true, keys: done };
  }
  let token;
  try { token = await createFor(pid, 'auto: new document'); } catch (e) { await revert(); return { ok: false, retry: true, error: 'no link' }; }
  async function revert(){ await fetch(sbUrl() + '/rest/v1/gc_portal_notice?batch_id=eq.' + batch, { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ sent_at: null, batch_id: null }) }); }
  const link = linkFor(event, token);
  const titles = mine.map(function(x){ return s(x.title) || 'Document'; });
  const subject = titles.length === 1 ? 'New in your GrayCo portal: ' + titles[0] : titles.length + ' new papers in your GrayCo portal — ' + (view.job.name || 'your job');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E">' +
    '<div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center">' +
    '<img src="' + esc(baseUrl({}) + '/portal-logo.png') + '" alt="GrayCo Construction Services" width="180" style="display:block;margin:0 auto 6px">' +
    '<div style="font-size:18px;font-weight:bold">' + esc(view.job.name) + '</div></div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px">' +
    '<p style="font-size:15px">Hi ' + esc(view.customer.firstName || 'there') + ',</p>' +
    '<p style="font-size:15px;line-height:1.5">' + esc(view.pm.name || 'Your Project Manager') + ' just put ' + (titles.length === 1 ? 'something new' : 'a few new things') + ' in your project page:</p>' +
    '<ul style="font-size:15px;line-height:1.6">' + titles.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">View it in my portal</a></p>' +
    '<p style="font-size:13px;color:#55626F">Questions? Call ' + esc(view.pm.name || 'us') + (view.pm.phone ? ' at ' + esc(view.pm.phone) : '') + ' or the office at ' + OFFICE_PHONE + '.</p></div></div>';
  let res;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + s(process.env.RESEND_API_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo Construction Services Portal <portal@grayco-cs.com>', reply_to: 'office@grayco-cs.com', to: [to], subject: subject, html: html }) });
    res = { ok: r.ok, status: r.status };
  } catch (e) { res = { ok: false }; }
  if (!res.ok) { await revert(); return { ok: false, retry: true, error: 'The e-mail did not go out (' + (res.status || 'no answer') + ').' }; }
  await mark('emailed');
  return { ok: true, sent: 'email', sentAt: nowIso, keys: done, count: done.length };
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
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS', 'x-portal-token'), {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const action = s(body.action || 'view');

  /* STAFF */
  if (['create', 'revoke', 'regenerate', 'status', 'final-now', 'send-link', 'settings', 'notify-docs'].indexOf(action) >= 0) {
    const who = await gcStaffAuth(event);
    if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
    if (!svcKey()) return reply(500, headers, { ok: false, error: 'SUPABASE_SERVICE_KEY not set on Netlify.' });
    if (action === 'settings') {
      try {
        if (body.set && typeof body.set === 'object') return reply(200, headers, Object.assign({ ok: true }, await settingsSet(body.set, who.email)));
        return reply(200, headers, Object.assign({ ok: true }, await settingsGet()));
      } catch (e) { return reply(502, headers, { ok: false, error: 'Could not save the setting. Try again.' }); }
    }
    const pid = s(body.projectId);
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return reply(400, headers, { ok: false, error: 'Which job? (projectId)' });
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
      if (e && e.setup) return reply(503, headers, { ok: false, setup: true, error: 'The customer portal is not set up yet — run docs/portal-setup.sql in Supabase.' });
      return reply(502, headers, { ok: false, error: 'Could not reach the database. Try again.' });
    }
  }

  /* PUBLIC */
  if (action !== 'view' && action !== 'photos') return reply(400, headers, { ok: false, error: 'Bad request' });
  const ip = ipOf(event);
  if (limited(ip)) { await sleep(MIN_FAIL_MS); return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' }); }
  const token = s(gcHeader(event, 'x-portal-token') || body.t);
  if (!TOKEN_RE.test(token) || !svcKey()) { noteBad(ip); return notActive(headers, t0); }
  let row = null;
  try { row = await tokenRow(token); } catch (e) { row = null; }
  if (!row || row.revoked === true) { noteBad(ip); return notActive(headers, t0); }
  let data, p;
  try { data = await crmData(false); p = findProject(data, row.project_id); } catch (e) { return reply(503, headers, { ok: false, error: 'We could not load your job just now. Please try again in a minute, or call GrayCo ' + OFFICE_PHONE + '.' }); }
  if (!p) return notActive(headers, t0);
  if (action === 'photos') {
    const ccId = ccIdOf(p);
    const list = ccId ? await ccPhotos(ccId) : [];
    return reply(200, headers, { ok: true, photos: list, url: ccLinkOf(p) });
  }
  const view = await buildView(data, p);
  /* when was it last opened (at most once every 10 minutes per link) */
  const last = row.last_viewed_at ? Date.parse(row.last_viewed_at) : 0;
  if (!last || Date.now() - last > 10 * 60e3) {
    try { await fetch(sbUrl() + '/rest/v1/gc_portal?token=eq.' + encodeURIComponent(token), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ last_viewed_at: new Date().toISOString() }) }); } catch (e) {}
  }
  return reply(200, headers, view);
};

/* for portal-reminders.js and the tests */
exports._core = { notifyDocs: notifyDocs, notifyAll: notifyAll, noticeItems: noticeItems, sendLink: sendLink, settingsGet: settingsGet, warrantyOf: warrantyOf, buildView: buildView, runReminders: runReminders, stageOf: stageOf, gdocInfo: gdocInfo, ccIdOf: ccIdOf,
  newToken: newToken, STAGES: STAGES, NOT_ACTIVE: NOT_ACTIVE, _reset: function(){ kvCache = null; photoCache.clear(); hits.clear(); } };
