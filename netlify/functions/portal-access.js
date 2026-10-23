// netlify/functions/portal-access.js
// GrayCo — THE PORTAL DOOR (portal.grayco-cs.com) and the sub portal's server.   build 33.151
//
// portal.grayco-cs.com is ONE address for customers and subs ("GrayCo Portal"). The page (portal.html)
// sends a link code (x-portal-token) or a signed-in session (x-portal-session) here, and this function
// says which portal it opens. Customers keep using netlify/functions/portal.js for their job page.
//
// PUBLIC (rate limited per address; a wrong / unknown code always gets the same answer):
//   open            {}                     link code → { kind:'customer' } | { kind:'partner', session } | { need:'device' }
//   device-start / device-verify {code}    first open of a sub link on a new phone: a 6-digit code
//   signin-start    {who}                  e-mail or mobile → a 6-digit code (only to an address on file;
//                                          the same answer whether or not it is on file)
//   signin-verify   {who, code}            → { kind, session } (30 days on that device)
//   signout         {}                     ends this device's session
// CUSTOMER (link code or customer session):  c-jobs, c-msgs {projectId}, c-send {projectId, text}
// SUB (sub session):                          p-home, p-job, p-scope, p-upload, p-invoice, p-photos-add,
//                                             p-progress, p-punch, p-paper, p-msgs, p-send, p-lang,
//                                             p-photos, p-bids
// STAFF (signed in to the CRM + on gc_staff): s-sync, s-thread, s-send, s-scopes, s-scope-save,
//                                             s-scope-approve, s-scope-void, s-link, s-link-send, s-ack,
//                                             s-bids-approve, s-settings
//
// What a sub sends never writes the CRM's lists from here: it is stored in gc_sub_event and the CRM
// (index.html patch SUB) files it into its own lists with its own save (merge by id, updatedAt), so a
// CRM edit made at the same moment is never lost. The CRM's records are only READ here (gc_kv).
//
// Data: docs/subportal-setup.sql (gc_sub_link, gc_sub_device, gc_portal_code, gc_portal_session,
// gc_sub_scope, gc_portal_msg, gc_sub_event; sp_rows for the bid site account) + docs/portal-setup.sql
// (gc_portal). Files: the CRM's private bucket crm-files (content-addressed, the CRM opens them as is).
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY (already set). Optional: PORTAL_BASE_URL
// (https://portal.grayco-cs.com), BIDS_URL (https://bids.grayco-cs.com), OWNER_EMAILS (who approves
// bid-site requests), PORTAL_TEXT_PROVIDER (texting — not connected yet), PORTAL_MAIL_OFF=1.

/* ── GrayCo staff check (same as portal.js; kept inline: each function is bundled alone) ── */
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const PORTAL_DEFAULT = 'https://portal.grayco-cs.com';
const BIDS_DEFAULT = 'https://bids.grayco-cs.com';
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
function origins(){
  return (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').concat([portalBase(), bidsBase()])
    .map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
}
function gcCors(event){
  const allowed = origins();
  const origin = gcHeader(event, 'origin').replace(/\/$/, '');
  return {
    'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-portal-token, x-portal-session, x-portal-device',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer'
  };
}
async function gcStaffAuth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(gcHeader(event, 'authorization').trim());
  if (!m) return { ok: false, statusCode: 401, error: 'Sign in to the GrayCo CRM first (no sign-in token was sent).' };
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  let user = null;
  try {
    const r = await fetch(sbUrl() + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + m[1] } });
    if (r.ok) user = await r.json();
  } catch (e) { return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service. Try again.' }; }
  const email = low(user && user.email);
  if (!email) return { ok: false, statusCode: 401, error: 'Your sign-in has expired. Sign in again.' };
  let role = null, listed = false, name = '';
  if (svcKey()) {
    try {
      const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email), { headers: H() });
      if (r.ok) { listed = true; const rows = await r.json(); const row = Array.isArray(rows) && rows[0];
        if (row && row.active !== false) { role = low(row.role || 'staff'); name = s(row.name); } }
    } catch (e) {}
  }
  if (!listed) { const env = s(process.env.STAFF_EMAILS).split(',').map(low).filter(Boolean); if (env.indexOf(email) > -1) role = 'staff'; }
  if (!role) return { ok: false, statusCode: 403, error: 'This account (' + email + ') is not on the GrayCo staff list.' };
  return { ok: true, email: email, role: role, name: name };
}

const crypto = require('crypto');
const OFFICE_PHONE = '901-585-0944';
const OFFICE_EMAIL = 'office@grayco-cs.com';
const NOT_ACTIVE = 'This link is not active — call GrayCo ' + OFFICE_PHONE;
const SESSION_DAYS = 30, CODE_MIN = 10, CODE_TRIES = 5, MIN_FAIL_MS = 250, SIGN_SECS = 3600;
const MAX_UPLOAD = 4.5 * 1024 * 1024;
const KV_KEYS = ['gc_senior_pm', 'projects', 'subs', 'vendors', 'users', 'invs', 'invoices', 'punch', 'schedule', 'projectDocs', 'customers',
                 'gc_tombstones', 'gc_deleted_projects', 'gc_deleted_subs', 'gc_deleted_vendors', 'gc_deleted_invs', 'gc_sub_portal_settings'];

/* ── small helpers ─────────────────────────────────────────────────────────── */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function num(v){ if (v == null || v === '') return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function money(n){ return Math.round(num(n) * 100) / 100; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n) : t; }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function ymd(v){
  if (!v) return '';
  if (typeof v === 'number') { const d = new Date(v > 1e12 ? v : v * 1000); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
  const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function norm(v){ return low(v).replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); }
function digits(v){ return s(v).replace(/\D/g, ''); }
function phone10(v){ const d = digits(v); return d.length >= 10 ? d.slice(-10) : ''; }
function okEmail(e){ return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s(e)) && s(e).length <= 200; }
function okId(v){ return /^[A-Za-z0-9_.:-]{1,80}$/.test(s(v)); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sha(v){ return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function hmac(v){ return crypto.createHmac('sha256', svcKey() || 'gc').update(String(v)).digest('hex'); }
function newToken(){ return crypto.randomBytes(32).toString('base64url'); }
function newId(p){ return p + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function isJwt(k){ return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(k || '')); }
function keyHeaders(k){ return isJwt(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }; }
function H(extra){ return Object.assign(keyHeaders(svcKey()), { 'Content-Type': 'application/json' }, extra || {}); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function portalBase(){ const v = s(process.env.PORTAL_BASE_URL).replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : PORTAL_DEFAULT; }
function bidsBase(){ const v = s(process.env.BIDS_URL).replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : BIDS_DEFAULT; }
function linkFor(token){ return portalBase() + '/#t=' + token; }
function mailOff(){ return process.env.PORTAL_MAIL_OFF === '1' || process.env.PORTAL_MAIL_OFF === 'true'; }
function Fail(status, message, extra){ const e = new Error(message); e.status = status; e.extra = extra; return e; }
function lang(v){ return low(v) === 'es' ? 'es' : 'en'; }

/* ── the database (service key) ────────────────────────────────────────────── */
async function dbGet(table, qs){
  let r;
  try { r = await fetch(sbUrl() + '/rest/v1/' + table + '?' + qs, { headers: H() }); } catch (e) { throw Fail(503, 'The portal cannot reach the database just now. Try again in a minute.'); }
  if (r.status === 404 || r.status === 400) throw Fail(503, 'The portal is not set up yet (run docs/subportal-setup.sql).', { setup: true });
  if (!r.ok) throw Fail(502, 'The database answered ' + r.status + '.');
  const j = await r.json().catch(function(){ return []; });
  return Array.isArray(j) ? j : [];
}
async function dbPost(table, rows, prefer){
  const r = await fetch(sbUrl() + '/rest/v1/' + table, { method: 'POST', headers: H({ Prefer: prefer || 'return=minimal' }), body: JSON.stringify(rows) });
  if (!r.ok) { const e = Fail(r.status === 409 ? 409 : 502, 'The database refused the save (' + r.status + ').'); e.code = r.status; throw e; }
  return /representation/.test(prefer || '') ? r.json().catch(function(){ return []; }) : null;
}
async function dbPatch(table, qs, body, rep){
  const r = await fetch(sbUrl() + '/rest/v1/' + table + '?' + qs, { method: 'PATCH', headers: H({ Prefer: rep ? 'return=representation' : 'return=minimal' }), body: JSON.stringify(body) });
  if (!r.ok) throw Fail(502, 'The database refused the change (' + r.status + ').');
  return rep ? r.json().catch(function(){ return []; }) : null;
}
function eq(v){ return 'eq.' + encodeURIComponent(s(v)); }
function inq(vals){ return 'in.(' + vals.map(function(v){ return '"' + String(v).replace(/["\\]/g, '') + '"'; }).join(',') + ')'; }

/* ── the CRM's records (gc_kv), read only. Pieces (__manifest/__chunkN) as the CRM reads them. ── */
let kvCache = null;
async function kvRead(keys){
  const want = []; keys.forEach(function(k){ want.push(k, k + '__manifest'); });
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value,updated_at&key=in.(' + want.map(function(k){ return '"' + k + '"'; }).join(',') + ')', { headers: H() });
  if (!r.ok) throw Fail(502, 'The CRM records could not be read (' + r.status + ').');
  const rows = await r.json(); const byKey = {};
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
        if (rr.ok) { const parts = await rr.json(); const by = {}; (Array.isArray(parts) ? parts : []).forEach(function(x){ by[x.key] = x.value; });
          let all = []; for (let i = 0; i < mv.count; i++) all = all.concat(arr(by[k + '__chunk' + i])); if (all.length) val = all; }
      } catch (e) {}
    }
    out[k] = (typeof val === 'string') ? (function(){ try { return JSON.parse(val); } catch (e) { return val; } })() : val;
  }
  return out;
}
async function crmData(force){
  if (!force && kvCache && Date.now() - kvCache.at < 15e3) return kvCache.data;
  const data = await kvRead(KV_KEYS);
  kvCache = { at: Date.now(), data: data };
  return data;
}
function deletedTest(data){
  const tomb = (data.gc_tombstones && typeof data.gc_tombstones === 'object' && !Array.isArray(data.gc_tombstones)) ? data.gc_tombstones : {};
  const lists = {};
  ['subs', 'vendors', 'projects', 'invs'].forEach(function(k){ lists[k] = new Set((Array.isArray(data['gc_deleted_' + k]) ? data['gc_deleted_' + k] : []).map(String)); });
  return function(list, id){ id = s(id); return !!id && (!!tomb[list + ':' + id] || (lists[list] && lists[list].has(id))); };
}
/* the CRM keeps subs and vendors in one list: a sub is isSub:true, or a row in "subs" with no isSub. The same record
   can be in both keys; the "vendors" copy is the current one. */
function crmSubs(data){
  const gone = deletedTest(data), seen = {}, out = [];
  function add(r, fromSubs){
    if (!r || typeof r !== 'object') return;
    if (!(r.isSub === true || (fromSubs && r.isSub === undefined))) return;
    const id = s(r.id); if (!id || gone('subs', id) || gone('vendors', id) || seen[id]) return;
    seen[id] = 1; out.push(r);
  }
  /* "vendors" is the CRM's live combined list (its changes land there); "subs" is only ever added to */
  arr(data.vendors).forEach(function(r){ add(r, false); });
  arr(data.subs).forEach(function(r){ add(r, true); });
  return out;
}
function subById(data, id){ return crmSubs(data).find(function(r){ return s(r.id) === s(id); }) || null; }
function rowIsSub(row, sub){
  if (!row || !sub) return false;
  const rid = s(row.subId || row.vendorId);
  if (rid) return rid === s(sub.id);
  const n = norm(row.name || row.sub || row.vendor || row.company);
  return !!n && (n === norm(sub.name) || n === norm(sub.company));
}
function liveProjects(data){
  const gone = deletedTest(data);
  const del = new Set((Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).map(String));
  return arr(data.projects).filter(function(p){ return s(p.id) && !gone('projects', p.id) && !del.has(s(p.id)) && !/lost|dead|cancel/.test(low(p.status)); });
}
function pmOf(data, p){
  let n = s(p.pm || p.projectManager);
  let u = arr(data.users).find(function(x){ return n && low(x.name) === low(n); }) || {};
  /* patch PMG: a PM who has left is not shown — the Senior PM instead (Admin → Employees), else the office */
  if (u.name && !require('./_lib/people.js').isActive(u)) { const h = require('./_lib/people.js').seniorPm(data.users, data.gc_senior_pm); u = h || {}; n = h ? s(h.name) : ''; }
  return { name: n || 'GrayCo office', phone: s(u.phone || u.cell || u.mobile) || OFFICE_PHONE, email: low(u.email) || OFFICE_EMAIL };
}
function settingsOf(data){ const v = data.gc_sub_portal_settings; return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }

/* ── files: the CRM's private bucket (content-addressed: sb:crm-files/<sha256>.<ext>) ── */
const FILE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
function sniff(buf){
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.length > 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length > 5 && buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length > 12 && buf.slice(4, 8).toString('latin1') === 'ftyp' && /heic|heix|mif1/.test(buf.slice(8, 12).toString('latin1'))) return 'image/heic';
  return '';
}
async function storeFile(b64, name){
  const raw = String(b64 || '').replace(/^data:[^,]*,/, '');
  if (!raw || raw.length > Math.ceil(MAX_UPLOAD * 4 / 3) + 8) throw Fail(413, 'That file is too big (4 MB at most). Take a smaller photo or send the PDF by e-mail.');
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length || buf.length > MAX_UPLOAD) throw Fail(413, 'That file is too big (4 MB at most).');
  const type = sniff(buf);
  if (!type) throw Fail(415, 'Send a photo (JPG / PNG) or a PDF.');
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const path = hash + '.' + FILE_TYPES[type];
  const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: Object.assign(keyHeaders(svcKey()), { 'Content-Type': type, 'x-upsert': 'false' }), body: buf });
  if (!r.ok) {
    const t = await r.text().catch(function(){ return ''; });
    if (!(r.status === 409 || /exists|duplicate/i.test(t))) throw Fail(502, 'The file could not be stored (' + r.status + '). Try again.');
  }
  return { ref: 'sb:crm-files/' + path, name: clip(name || ('file.' + FILE_TYPES[type]), 120), type: type, size: buf.length, hash: hash };
}
function refPath(ref){ const m = /^sb:crm-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/.exec(s(ref)); return m ? m[1] : ''; }
async function signRefs(refs){
  const paths = Array.from(new Set(refs.map(refPath).filter(Boolean))).slice(0, 200);
  const out = {};
  if (!paths.length) return out;
  try {
    const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files', { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: SIGN_SECS, paths: paths }) });
    if (!r.ok) return out;
    (await r.json() || []).forEach(function(x){
      const u = s(x && (x.signedURL || x.signedUrl));
      if (x && x.path && u && !x.error) out['sb:crm-files/' + x.path] = /^https:/.test(u) ? u : sbUrl() + '/storage/v1' + (u[0] === '/' ? '' : '/') + u;
    });
  } catch (e) {}
  return out;
}
function fileOut(f, signed){ const ref = s(f && f.ref); const url = signed[ref] || ''; return url ? { name: clip(f.name || 'File', 120), type: s(f.type), url: url } : null; }

/* ── rate limits (per warm instance) ───────────────────────────────────────── */
const hits = new Map();
const LIMITS = { pub: { req: 120, bad: 10 }, signin: { req: 12, bad: 10 }, verify: { req: 25, bad: 10 }, app: { req: 600, bad: 20 } };
function ipOf(event){ return s(gcHeader(event, 'x-nf-client-connection-ip') || gcHeader(event, 'x-forwarded-for').split(',')[0] || gcHeader(event, 'client-ip') || 'unknown'); }
function limited(ip, kind){
  const L = LIMITS[kind] || LIMITS.pub, key = kind + '|' + ip, now = Date.now();
  let h = hits.get(key);
  if (!h || now - h.start > 10 * 60e3) { h = { start: now, req: 0, bad: 0 }; hits.set(key, h); }
  h.req++;
  if (hits.size > 8000) hits.delete(hits.keys().next().value);
  return h.req > L.req || h.bad >= L.bad;
}
function noteBad(ip, kind){ const h = hits.get((kind || 'pub') + '|' + ip); if (h) h.bad++; }

/* ── e-mail (EN / ES) ───────────────────────────────────────────────────────── */
const MAIL = {
  en: {
    codeSubj: 'Your GrayCo Portal code', codeHead: 'Your sign-in code', codeBody: 'Enter this code on the GrayCo Portal. It works for 10 minutes. If you did not ask for it, ignore this e-mail.',
    linkSubj: 'Your GrayCo Portal', linkHead: 'Your own GrayCo page', linkBody: 'This is your private GrayCo Portal: your jobs with GrayCo, scopes, messages with your Project Manager, photos, invoices and payments, and your paperwork. No password needed — keep this e-mail.',
    linkBtn: 'Open my GrayCo Portal', scopeSubj: 'Sub agreement to sign — ', scopeBody: 'GrayCo sent you a sub agreement: the scope of work and what you will be paid on this job. Open your portal to review it and sign it, or ask a question.', scopeBtn: 'Review and sign',
    coSignSubj: 'Change order to sign — ', coSignBody: 'GrayCo sent you a change order to your scope on this job. Open your portal to review it and sign it, or ask a question.',
    approvedSubj: 'You can now sign in at bids.grayco-cs.com', approvedBody: 'GrayCo approved your company for the GrayCo bid site. Sign in with the e-mail and password you chose.', approvedBtn: 'Open the bid site',
    foot: 'Questions? Call GrayCo at ' + OFFICE_PHONE + '.'
  },
  es: {
    codeSubj: 'Su código del Portal GrayCo', codeHead: 'Su código para entrar', codeBody: 'Escriba este código en el Portal GrayCo. Sirve por 10 minutos. Si usted no lo pidió, ignore este correo.',
    linkSubj: 'Su Portal GrayCo', linkHead: 'Su propia página de GrayCo', linkBody: 'Este es su Portal GrayCo privado: sus trabajos con GrayCo, alcances, mensajes con su Gerente de Proyecto, fotos, facturas y pagos, y sus papeles. No necesita contraseña — guarde este correo.',
    linkBtn: 'Abrir mi Portal GrayCo', scopeSubj: 'Acuerdo de subcontrato para firmar — ', scopeBody: 'GrayCo le envió un acuerdo de subcontrato: el alcance del trabajo y lo que se le pagará en este trabajo. Abra su portal para revisarlo y firmarlo, o hacer una pregunta.', scopeBtn: 'Revisar y firmar',
    coSignSubj: 'Orden de cambio para firmar — ', coSignBody: 'GrayCo le envió una orden de cambio a su alcance en este trabajo. Abra su portal para revisarla y firmarla, o hacer una pregunta.',
    approvedSubj: 'Ya puede entrar en bids.grayco-cs.com', approvedBody: 'GrayCo aprobó a su compañía para el sitio de licitaciones de GrayCo. Entre con el correo y la contraseña que escogió.', approvedBtn: 'Abrir el sitio de licitaciones',
    foot: '¿Preguntas? Llame a GrayCo al ' + OFFICE_PHONE + '.'
  }
};
function mailHtml(head, body, big, button){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E">' +
    '<div style="background:#0F1D2F;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;text-align:center">' +
    '<img src="' + esc(portalBase() + '/portal-logo.png') + '" alt="GrayCo Construction Services" width="180" style="display:block;margin:0 auto 6px">' +
    '<div style="font-size:18px;font-weight:bold">' + esc(head) + '</div></div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:20px;border-radius:0 0 12px 12px">' +
    '<p style="font-size:15px;line-height:1.5">' + esc(body) + '</p>' +
    (big ? '<p style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;margin:18px 0">' + esc(big) + '</p>' : '') +
    (button ? '<p style="text-align:center;margin:22px 0"><a href="' + esc(button.href) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">' + esc(button.label) + '</a></p>' : '') +
    '<p style="font-size:12px;color:#55626F">GrayCo Construction Services · TN #85034 BCB · AR #0486990627 · MS #27769</p></div></div>';
}
async function sendMail(to, subject, html){
  const key = s(process.env.RESEND_API_KEY);
  to = (Array.isArray(to) ? to : [to]).map(low).filter(okEmail);
  if (!key || mailOff() || !to.length) return { ok: false, skipped: !key ? 'no-key' : (mailOff() ? 'mail-off' : 'no-address') };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo Portal <portal@grayco-cs.com>', reply_to: (String(process.env.REPLY_TO_ADMIN || '').trim() || 'replies@grayco-cs.com'), to: to, subject: subject, html: html }) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false }; }
}
/* texting: Twilio, once TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are set on Netlify (A2P 10DLC
   registration first). Until then nothing is texted from here: the CRM offers "Text from my phone" instead. */
function textReady(){ return !!(s(process.env.TWILIO_ACCOUNT_SID) && s(process.env.TWILIO_AUTH_TOKEN) && s(process.env.TWILIO_FROM)) && !mailOff(); }
async function sendText(to, body){
  const p = phone10(to);
  if (!textReady()) return { ok: false, skipped: 'text-not-set-up' };
  if (!p) return { ok: false, skipped: 'no-number' };
  const sid = s(process.env.TWILIO_ACCOUNT_SID);
  try {
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', { method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + s(process.env.TWILIO_AUTH_TOKEN)).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+1' + p, From: s(process.env.TWILIO_FROM), Body: clip(body, 600) }).toString() });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false }; }
}
function ownerEmails(){ const v = s(process.env.OWNER_EMAILS); return (v ? v.split(',') : ['wjohnson@grayco-cs.com', 'nthomas@grayco-cs.com']).map(low).filter(okEmail); }
function maskEmail(e){ e = low(e); const m = /^(.)(.*)(@.*)$/.exec(e); return m ? m[1] + '•••' + m[3] : ''; }

/* ── links ──────────────────────────────────────────────────────────────────── */
async function custLinkRow(token){
  const rows = await dbGet('gc_portal', 'select=token,project_id,revoked&token=' + eq(token));
  const row = rows[0]; if (!row || row.revoked === true) return null;
  const a = Buffer.from(String(row.token)), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? row : null;
}
async function subLinkRow(token){
  const rows = await dbGet('gc_sub_link', 'select=token,sub_id,revoked,last_viewed_at&token=' + eq(token));
  const row = rows[0]; if (!row || row.revoked === true) return null;
  const a = Buffer.from(String(row.token)), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? row : null;
}
async function subLinkActive(subId){
  const rows = await dbGet('gc_sub_link', 'select=token,sub_id,created_at,last_viewed_at,sent_at,sent_via&revoked=eq.false&sub_id=' + eq(subId) + '&order=created_at.desc&limit=1');
  return rows[0] || null;
}
async function subLinkCreate(subId, subName, by){
  const have = await subLinkActive(subId); if (have) return have;
  const token = newToken();
  try { await dbPost('gc_sub_link', { token: token, sub_id: s(subId), sub_name: clip(subName, 120), created_by: clip(by, 120), revoked: false }); }
  catch (e) { const again = await subLinkActive(subId); if (again) return again; throw e; }
  return { token: token, sub_id: s(subId) };
}
async function subLinkRevoke(subId){
  const now = new Date().toISOString();
  await dbPatch('gc_sub_link', 'revoked=eq.false&sub_id=' + eq(subId), { revoked: true, revoked_at: now });
  /* every signed-in device of that sub ends now, and no phone stays "remembered" */
  await dbPatch('gc_portal_session', 'kind=eq.partner&sub_id=' + eq(subId), { revoked: true });
  await dbPatch('gc_sub_device', 'sub_id=' + eq(subId), { verified_at: null });
  /* and the GrayCo Photos codes this portal made for them (patch U2's gc_sub_portal) */
  try { await fetch(sbUrl() + '/rest/v1/gc_sub_portal?revoked=eq.false&sub_id=' + eq(subId), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ revoked: true }) }); } catch (e) {}
}
/* GrayCo Photos (patch U2, netlify/functions/sub-photos.js) checks its own short codes (table gc_sub_portal). This
   portal hands a signed-in sub one of those codes, good for a day and turned off with their link; the page then asks
   sub-photos for that job's photos and sends the sub's photos there (tagged with the sub). No photos code is kept here. */
async function photosCode(sub){
  try {
    const now = Date.now();
    const r = await fetch(sbUrl() + '/rest/v1/gc_sub_portal?select=token,expires_at&revoked=eq.false&sub_id=' + eq(sub.id) + '&expires_at=gt.' + encodeURIComponent(new Date(now + 3600e3).toISOString()) + '&order=expires_at.desc&limit=1', { headers: H() });
    if (!r.ok) return null;                                        /* GrayCo Photos is not set up: the portal shows its own list */
    const have = ((await r.json()) || [])[0];
    if (have && TOKEN_RE.test(have.token)) return have.token;
    const token = newToken();
    const w = await fetch(sbUrl() + '/rest/v1/gc_sub_portal', { method: 'POST', headers: H({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ token: token, sub_id: s(sub.id), sub_name: clip(sub.name, 120), sub_email: low(sub.email) || null, job_ids: [], revoked: false, expires_at: new Date(now + 86400e3).toISOString() }) });
    return w.ok ? token : null;
  } catch (e) { return null; }
}

/* ── sessions ───────────────────────────────────────────────────────────────── */
async function sessionCreate(kind, ident, subId, links){
  const token = newToken(), now = Date.now();
  await dbPost('gc_portal_session', { id: sha(token), kind: kind, ident: ident || null, sub_id: subId || null, links: links || [],
    created_at: new Date(now).toISOString(), expires_at: new Date(now + SESSION_DAYS * 86400e3).toISOString(), revoked: false });
  return token;
}
/* → { kind, sub_id, pids (customer) } or null. A session ends when it runs out, is signed out, or its link is turned off. */
async function sessionOf(token){
  if (!TOKEN_RE.test(s(token))) return null;
  const rows = await dbGet('gc_portal_session', 'select=*&id=' + eq(sha(token)));
  const row = rows[0];
  if (!row || row.revoked === true || Date.parse(row.expires_at) < Date.now()) return null;
  const links = (Array.isArray(row.links) ? row.links : []).map(String).filter(function(t){ return TOKEN_RE.test(t); });
  if (!links.length) return null;
  if (row.kind === 'partner') {
    const live = await dbGet('gc_sub_link', 'select=token,sub_id&revoked=eq.false&token=' + inq(links));
    if (!live.some(function(x){ return s(x.sub_id) === s(row.sub_id); })) return null;
    touchSession(row);
    return { kind: 'partner', sub_id: s(row.sub_id), id: row.id };
  }
  const live = await dbGet('gc_portal', 'select=token,project_id&revoked=eq.false&token=' + inq(links));
  if (!live.length) return null;
  touchSession(row);
  return { kind: 'customer', pids: live.map(function(x){ return s(x.project_id); }), id: row.id };
}
function touchSession(row){
  if (row.last_seen_at && Date.now() - Date.parse(row.last_seen_at) < 15 * 60e3) return;
  dbPatch('gc_portal_session', 'id=' + eq(row.id), { last_seen_at: new Date().toISOString() }).catch(function(){});
}

/* ── who is on file (sign-in) ───────────────────────────────────────────────── */
function identOf(who){
  const w = low(who);
  if (okEmail(w)) return { kind: 'email', value: w, key: 'e:' + w };
  const p = phone10(w);
  if (p) return { kind: 'phone', value: p, key: 'p:' + p };
  return null;
}
/* customers: a job whose customer e-mail / phone matches AND that has an active link */
async function customerMatch(data, id){
  const custs = arr(data.customers);
  const pids = [];
  liveProjects(data).forEach(function(p){
    const c = custs.find(function(x){ return low(x.name || x.company) === low(p.client) && s(p.client); }) || {};
    const emails = [p.clientEmail, p.email, c.email].map(low).filter(Boolean);
    const phones = [p.clientPhone, p.phone, c.phone].map(phone10).filter(Boolean);
    if ((id.kind === 'email' && emails.indexOf(id.value) > -1) || (id.kind === 'phone' && phones.indexOf(id.value) > -1)) pids.push(s(p.id));
  });
  if (!pids.length) return null;
  const live = await dbGet('gc_portal', 'select=token,project_id&revoked=eq.false&project_id=' + inq(pids));
  if (!live.length) return null;
  const p0 = arr(data.projects).find(function(p){ return s(p.id) === s(live[0].project_id); }) || {};
  const c0 = custs.find(function(x){ return low(x.name || x.company) === low(p0.client); }) || {};
  return { kind: 'customer', links: live.map(function(x){ return x.token; }), pids: live.map(function(x){ return s(x.project_id); }), name: s(p0.client), email: low(p0.clientEmail || p0.email || c0.email), lang: 'en' };
}
async function partnerMatch(data, id){
  const subs = crmSubs(data).filter(function(r){ return id.kind === 'email' ? low(r.email) === id.value : phone10(r.phone) === id.value; });
  for (const sub of subs) {
    const link = await subLinkActive(sub.id);
    if (link) return { kind: 'partner', sub: sub, links: [link.token], email: low(sub.email), lang: lang(sub.lang) };
  }
  return null;
}
const SAME = { ok: true, sent: true };
async function signinStart(body, ip){
  const id = identOf(body.who);
  if (!id) throw Fail(400, 'Enter your e-mail or mobile number.');
  const t0 = Date.now();
  const recent = await dbGet('gc_portal_code', 'select=id&ident=' + eq(hmac(id.key)) + '&created_at=gt.' + encodeURIComponent(new Date(Date.now() - 3600e3).toISOString()));
  if (recent.length >= 5) { await padTo(t0); return SAME; }            /* five codes an hour per address, then quiet */
  const data = await crmData(true);
  const m = (await partnerMatch(data, id)) || (await customerMatch(data, id));
  if (m) {
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    const rid = newId('C');
    await dbPost('gc_portal_code', { id: rid, purpose: 'signin', ident: hmac(id.key), code_hash: hmac(rid + ':' + code), link_token: m.kind === 'partner' ? m.links[0] : null,
      sub_id: m.kind === 'partner' ? s(m.sub.id) : null, expires_at: new Date(Date.now() + CODE_MIN * 60e3).toISOString(), tries: 0, ip: clip(ip, 60) });
    const L = MAIL[m.lang];
    if (id.kind === 'phone' && textReady()) await sendText(id.value, 'GrayCo Portal code: ' + code + ' (10 min)');
    else if (id.kind === 'email' || okEmail(m.email)) await sendMail(id.kind === 'email' ? id.value : m.email, L.codeSubj, mailHtml(L.codeHead, L.codeBody, code));
    else {
      /* no texting yet and no e-mail on file: the code waits in the CRM for the PM to text it from their phone */
      await dbPatch('gc_portal_code', 'id=' + eq(rid), { relay: { phone: id.value, code: code, pids: m.pids || [], who: m.name || '' } });
    }
  }
  await padTo(t0);
  return SAME;
}
async function padTo(t0){ const w = 700 + Math.floor(Math.random() * 120) - (Date.now() - t0); if (w > 0) await sleep(w); }
async function codeCheck(identKey, code, purpose, extraQs){
  const rows = await dbGet('gc_portal_code', 'select=*&purpose=eq.' + purpose + '&ident=' + eq(hmac(identKey)) + '&used_at=is.null' + (extraQs || '') + '&order=created_at.desc&limit=1');
  const row = rows[0];
  if (!row || Date.parse(row.expires_at) < Date.now() || row.tries >= CODE_TRIES) return null;
  const good = /^\d{6}$/.test(s(code)) && crypto.timingSafeEqual(Buffer.from(hmac(row.id + ':' + s(code))), Buffer.from(row.code_hash));
  if (!good) { await dbPatch('gc_portal_code', 'id=' + eq(row.id), { tries: row.tries + 1 }); return null; }
  const used = await dbPatch('gc_portal_code', 'id=' + eq(row.id) + '&used_at=is.null', { used_at: new Date().toISOString() }, true);
  return Array.isArray(used) && used.length === 1 ? row : null;
}
async function signinVerify(body){
  const id = identOf(body.who);
  const bad = Fail(401, 'That code is not right or has run out. Ask for a new one.');
  if (!id) throw bad;
  const row = await codeCheck(id.key, body.code, 'signin');
  if (!row) throw bad;
  const data = await crmData(true);
  if (row.sub_id) {
    const m = await partnerMatch(data, id);
    if (!m || s(m.sub.id) !== s(row.sub_id)) throw bad;
    return { ok: true, kind: 'partner', session: await sessionCreate('partner', hmac(id.key), s(m.sub.id), m.links) };
  }
  const m = await customerMatch(data, id);
  if (!m) throw bad;
  return { ok: true, kind: 'customer', session: await sessionCreate('customer', hmac(id.key), null, m.links) };
}

/* ── e-mail + password ──────────────────────────────────────────────────────────
   Customers (owner, 20 Oct 2026): user name = the e-mail on the job, starter password = their FIRST NAME
   (case and spaces don't matter). Only a scrypt fingerprint is ever stored, and only once they choose their
   own password; until then the starter is checked against the job's customer name. 5 wrong tries → 15 minutes
   locked, per e-mail and per address, with the same message every time. The login works only while the
   job's portal link is on. Subs: their bid-site account (Supabase sign-in), and only while their link is on. */
const LOCK_TRIES = 5, LOCK_MIN = 15;
function pwHash(pw, salt){ salt = salt || crypto.randomBytes(16).toString('hex'); return 'scrypt$' + salt + '$' + crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
function pwOk(pw, stored){
  const m = /^scrypt\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(s(stored)); if (!m) return false;
  const a = Buffer.from(crypto.scryptSync(String(pw), m[1], 32).toString('hex')), b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function starterOf(name){ return low(s(name).split(/\s+/)[0]).replace(/[^a-z0-9'-]/g, ''); }
async function lockState(keys){
  const rows = await dbGet('gc_portal_lock', 'select=*&id=' + inq(keys));
  const now = Date.now();
  return rows.some(function(r){ return r.locked_until && Date.parse(r.locked_until) > now; });
}
async function lockFail(keys){
  const now = Date.now();
  const rows = await dbGet('gc_portal_lock', 'select=*&id=' + inq(keys));
  for (const k of keys) {
    const r = rows.find(function(x){ return x.id === k; });
    const fresh = !r || (r.updated_at && now - Date.parse(r.updated_at) > LOCK_MIN * 60e3 && !(r.locked_until && Date.parse(r.locked_until) > now));
    const fails = (fresh ? 0 : Number(r.fails) || 0) + 1;
    const row = { id: k, fails: fails >= LOCK_TRIES ? 0 : fails, locked_until: fails >= LOCK_TRIES ? new Date(now + LOCK_MIN * 60e3).toISOString() : (r && r.locked_until) || null, updated_at: new Date(now).toISOString() };
    await dbPost('gc_portal_lock?on_conflict=id', row, 'resolution=merge-duplicates,return=minimal');
  }
}
async function lockClear(keys){ await dbPatch('gc_portal_lock', 'id=' + inq(keys), { fails: 0, locked_until: null, updated_at: new Date().toISOString() }); }
const BADLOGIN = "That e-mail and password don't match. Try again, or tap \"Forgot password?\" to get a code.";
/* the jobs this e-mail may open with a password (active link), and the first names it may use as the starter */
async function customerLogin(data, id){
  const m = await customerMatch(data, id);
  if (!m) return null;
  const live = new Set((await dbGet('gc_portal', 'select=token,project_id&revoked=eq.false&token=' + inq(m.links))).map(function(x){ return s(x.project_id); }));
  const names = [];
  const custs = arr(data.customers);
  liveProjects(data).forEach(function(p){
    if (!live.has(s(p.id))) return;
    const c = custs.find(function(x){ return low(x.name || x.company) === low(p.client) && s(p.client); }) || {};
    const st = starterOf(c.firstName || p.clientFirstName || p.client || c.name);
    if (st && names.indexOf(st) < 0) names.push(st);
  });
  /* a customer with an e-mail AND a phone has one login: their own password is kept under each of them */
  const rows = await dbGet('gc_portal_login', 'select=login,pw_hash,changed&login=' + eq(id.key));
  return { links: m.links, starters: names, row: rows[0] || null };
}
async function subPasswordLogin(data, email, password){
  /* the bid-site account (Supabase); the portal opens only for a sub linked to the CRM with an active link */
  let ok = false;
  try {
    const r = await fetch(sbUrl() + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }) });
    ok = r.ok;
  } catch (e) { ok = false; }
  if (!ok) return null;
  let crmId = '';
  try { const rows = await dbGet('sp_rows', 'select=data&collection=eq.users&email=' + eq(email)); const prof = rows[0] && rows[0].data; if (prof && prof.role === 'sub') crmId = s(prof.crmSubId); } catch (e) {}
  const sub = crmId ? subById(data, crmId) : crmSubs(data).find(function(r){ return low(r.email) === email; });
  if (!sub) return { noPortal: true };
  const link = await subLinkActive(sub.id);
  if (!link) return { noPortal: true };
  return { sub: sub, links: [link.token] };
}
async function passwordSignin(body, ip){
  const id = identOf(body.email || body.who), password = String(body.password || '').trim();
  if (!id || !password) throw Fail(400, 'Enter your e-mail (or mobile number) and password.');
  const email = id.kind === 'email' ? id.value : '';
  const keys = ['e:' + hmac(id.key), 'ip:' + hmac(ip)];
  const t0 = Date.now();
  if (await lockState(keys)) { await padTo(t0); throw Fail(429, 'Too many tries. Wait 15 minutes, or tap "Forgot password?" to get a code.'); }
  const data = await crmData(true);
  const cl = await customerLogin(data, id);
  if (cl) {
    const good = cl.row && cl.row.pw_hash ? pwOk(password, cl.row.pw_hash) : (cl.starters.indexOf(starterOf(password)) > -1 && starterOf(password).length > 0 && low(password).replace(/\s+/g, '') === starterOf(password));
    if (good) {
      await lockClear(keys);
      return { ok: true, kind: 'customer', starter: !(cl.row && cl.row.changed), session: await sessionCreate('customer', hmac(id.key), null, cl.links) };
    }
  }
  if ((!cl || !cl.row) && email) {
    const sp = await subPasswordLogin(data, email, String(body.password || ''));
    if (sp && sp.noPortal) { await padTo(t0); throw Fail(403, 'Your GrayCo Portal is not turned on yet. Call GrayCo ' + OFFICE_PHONE + '.'); }
    if (sp) { await lockClear(keys); return { ok: true, kind: 'partner', lang: lang(sp.sub.lang), session: await sessionCreate('partner', hmac(id.key), s(sp.sub.id), sp.links) }; }
  }
  await lockFail(keys);
  await padTo(t0);
  throw Fail(401, BADLOGIN);
}
async function customerPassword(event, body){
  const sess = await sessionOf(gcHeader(event, 'x-portal-session'));
  if (!sess || sess.kind !== 'customer') return null;
  const pw = String(body.password || '');
  if (pw.length < 8) throw Fail(400, 'Use at least 8 characters.');
  const rows = await dbGet('gc_portal_session', 'select=ident&id=' + eq(sess.id));
  const data = await crmData(true);
  /* this customer's logins: the e-mail and the mobile number on their jobs (one password for both) */
  const keys = [];
  const custs = arr(data.customers);
  liveProjects(data).filter(function(p){ return sess.pids.indexOf(s(p.id)) > -1; }).forEach(function(p){
    const c = custs.find(function(x){ return low(x.name || x.company) === low(p.client) && s(p.client); }) || {};
    [p.clientEmail, p.email, c.email].map(low).filter(okEmail).forEach(function(e){ if (keys.indexOf('e:' + e) < 0) keys.push('e:' + e); });
    [p.clientPhone, p.phone, c.phone].map(phone10).filter(Boolean).forEach(function(x){ if (keys.indexOf('p:' + x) < 0) keys.push('p:' + x); });
  });
  if (!keys.some(function(k){ return hmac(k) === (rows[0] || {}).ident; })) throw Fail(400, 'Sign in with your e-mail (or mobile number) and password first.');
  const now = new Date().toISOString(), hash = pwHash(pw);
  await dbPost('gc_portal_login?on_conflict=login', keys.map(function(k){ return { login: k, pw_hash: hash, changed: true, updated_at: now }; }), 'resolution=merge-duplicates,return=minimal');
  return { ok: true };
}

/* ── opening a link: which portal, and the new-phone check for subs ─────────── */
async function deviceOk(link, devToken){
  if (!TOKEN_RE.test(s(devToken))) return false;
  const rows = await dbGet('gc_sub_device', 'select=id,verified_at,link_token&id=' + eq(sha(devToken)));
  const d = rows[0];
  return !!(d && d.verified_at && d.link_token === link.token);
}
function deviceCheckNeeded(data, sub){
  const mode = low(settingsOf(data).deviceCode || 'auto');
  if (mode === 'off') return false;
  /* the code needs a way to reach the sub: text (not connected yet) or e-mail on file + e-mail set up */
  return textReady() || (okEmail(sub.email) && !!s(process.env.RESEND_API_KEY) && !mailOff());
}
async function openLink(event){
  const token = s(gcHeader(event, 'x-portal-token'));
  if (!TOKEN_RE.test(token)) return null;
  const c = await custLinkRow(token);
  if (c) return { ok: true, kind: 'customer' };
  const l = await subLinkRow(token);
  if (!l) return null;
  const data = await crmData(false);
  const sub = subById(data, l.sub_id);
  if (!sub) return null;
  if (deviceCheckNeeded(data, sub) && !(await deviceOk(l, gcHeader(event, 'x-portal-device')))) {
    return { ok: true, kind: 'partner', need: 'device', to: maskEmail(sub.email), lang: lang(sub.lang) };
  }
  if (!l.last_viewed_at || Date.now() - Date.parse(l.last_viewed_at) > 10 * 60e3) dbPatch('gc_sub_link', 'token=' + eq(token), { last_viewed_at: new Date().toISOString() }).catch(function(){});
  return { ok: true, kind: 'partner', lang: lang(sub.lang), session: await sessionCreate('partner', null, s(sub.id), [token]) };
}
async function deviceStart(event){
  const token = s(gcHeader(event, 'x-portal-token'));
  const l = TOKEN_RE.test(token) ? await subLinkRow(token) : null;
  if (!l) return null;
  const data = await crmData(false);
  const sub = subById(data, l.sub_id); if (!sub) return null;
  const key = 'd:' + token;
  const recent = await dbGet('gc_portal_code', 'select=id&ident=' + eq(hmac(key)) + '&created_at=gt.' + encodeURIComponent(new Date(Date.now() - 3600e3).toISOString()));
  if (recent.length >= 5) return { ok: true, sent: true };
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0'), rid = newId('C');
  await dbPost('gc_portal_code', { id: rid, purpose: 'device', ident: hmac(key), code_hash: hmac(rid + ':' + code), link_token: token, sub_id: s(sub.id),
    expires_at: new Date(Date.now() + CODE_MIN * 60e3).toISOString(), tries: 0 });
  const L = MAIL[lang(sub.lang)];
  if (textReady() && phone10(sub.phone)) await sendText(phone10(sub.phone), 'GrayCo: ' + code);
  else await sendMail(sub.email, L.codeSubj, mailHtml(L.codeHead, L.codeBody, code));
  return { ok: true, sent: true, to: maskEmail(sub.email) };
}
async function deviceVerify(event, body){
  const token = s(gcHeader(event, 'x-portal-token'));
  const l = TOKEN_RE.test(token) ? await subLinkRow(token) : null;
  if (!l) return null;
  const row = await codeCheck('d:' + token, body.code, 'device');
  if (!row) throw Fail(401, 'That code is not right or has run out. Ask for a new one.');
  const dev = newToken();
  await dbPost('gc_sub_device', { id: sha(dev), link_token: token, sub_id: l.sub_id, verified_at: new Date().toISOString(), label: clip(gcHeader(event, 'user-agent'), 120) });
  return { ok: true, device: dev, kind: 'partner', session: await sessionCreate('partner', null, s(l.sub_id), [token]) };
}

/* ═══ THE SUB PORTAL ════════════════════════════════════════════════════════
   Whitelist only. A sub never gets GrayCo's prices, margins, the job's contract, other subs, or the
   customer's phone / e-mail (unless the PM turned on "sub may see the customer" for that job). */
async function partnerCtx(sess){
  const data = await crmData(false);
  const sub = subById(data, sess.sub_id);
  if (!sub) throw Fail(404, NOT_ACTIVE);
  const scopes = await dbGet('gc_sub_scope', 'select=*&sub_id=' + eq(sub.id) + '&status=in.(published,accepted,question)');
  const scopePids = new Set(scopes.map(function(x){ return s(x.project_id); }));
  const jobs = liveProjects(data).filter(function(p){
    return arr(p.subs).some(function(r){ return rowIsSub(r, sub) && !/reject|declin/i.test(s(r.status)); }) || scopePids.has(s(p.id));
  });
  return { data: data, sub: sub, jobs: jobs, scopes: scopes };
}
function rowFor(p, sub){ return arr(p.subs).find(function(r){ return rowIsSub(r, sub); }) || {}; }
function invState(iv){
  const st = low(iv.status) || 'received';
  if (st === 'paid' || iv.paid === true) return 'paid';
  if (/reject|denied|declin/.test(st)) return 'declined';
  if (st === 'void' || iv.deleted === true) return 'void';
  if (st === 'approved' || st === 'ready' || iv.approved === true) return 'approved';
  return 'submitted';
}
function payDateFor(recv){
  const d = new Date((ymd(recv) || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
  const day = d.getUTCDay(), cut = new Date(d);
  if (day <= 3) cut.setUTCDate(d.getUTCDate() + (3 - day)); else cut.setUTCDate(d.getUTCDate() + (7 - day) + 3);
  const pay = new Date(cut); pay.setUTCDate(cut.getUTCDate() + 2 + 7);
  return pay.toISOString().slice(0, 10);
}
async function partnerInvoices(ctx){
  const gone = deletedTest(ctx.data), seen = {};
  const list = arr(ctx.data.invs).concat(arr(ctx.data.invoices)).filter(function(iv){
    if (s(iv.type) !== 'sub' || gone('invs', iv.id) || seen[s(iv.id)]) return false;
    seen[s(iv.id)] = 1;
    const sid = s(iv.subId); return sid ? sid === s(ctx.sub.id) : rowIsSub({ name: iv.sub || iv.vendor }, ctx.sub);
  });
  const jobName = {}; ctx.jobs.forEach(function(p){ jobName[s(p.id)] = s(p.name); });
  const out = list.map(function(iv){
    const st = invState(iv);
    return { id: s(iv.id), pid: s(iv.pid), job: jobName[s(iv.pid)] || '', number: s(iv.invNum), po: s(iv.po), amount: money(iv.amt),
      state: st, submitted: ymd(iv.recvDate || iv.date), approved: ymd(iv.approvedDate || iv.approvedAt),
      payDate: st === 'approved' ? ymd(iv.payDateOverride || iv.payDate) || payDateFor(iv.recvDate || iv.date) : '', paidDate: st === 'paid' ? ymd(iv.paidDate || iv.date) : '' };
  }).filter(function(x){ return x.state !== 'void'; });
  /* sent from the portal, not filed by the CRM yet */
  const have = new Set(out.map(function(x){ return x.id; }));
  (await dbGet('gc_sub_event', 'select=id,project_id,data,created_at&kind=eq.invoice&sub_id=' + eq(ctx.sub.id) + '&order=created_at.desc&limit=200')).forEach(function(e){
    const d = e.data || {}; if (have.has(s(d.invId))) return;
    out.push({ id: s(d.invId), pid: s(e.project_id), job: jobName[s(e.project_id)] || '', number: s(d.invNum), po: s(d.po), amount: money(d.amount), state: 'submitted',
      submitted: ymd(e.created_at), approved: '', payDate: '', paidDate: '' });
  });
  out.sort(function(a, b){ return (b.paidDate || b.submitted).localeCompare(a.paidDate || a.submitted); });
  return out;
}
function scopeOut(x, signed){
  const d = x.data || {};
  const files = arr(d.files).map(function(f){ return fileOut(f, signed); }).filter(Boolean);
  const photos = arr(d.photos).map(function(f){ return fileOut(f, signed); }).filter(Boolean);
  return { id: s(x.id), kind: x.kind === 'co' ? 'co' : 'scope', version: Number(x.version) || 1, date: ymd(x.approved_at || x.updated_at), title: clip(x.title || d.title, 160),
    lines: arr(d.lines).slice(0, 400).map(function(l){ return { area: clip(l.room || l.area, 80), desc: clip(l.desc || l.description, 400), qty: l.qty === '' || l.qty == null ? '' : num(l.qty), unit: clip(l.unit, 20), meas: clip(l.meas || l.measurement, 120) }; }),
    included: clip(d.included, 4000), excluded: clip(d.excluded, 4000), matGc: clip(d.matGc, 2000), matSub: clip(d.matSub, 2000), notes: clip(d.notes, 4000),
    start: ymd(d.start), end: ymd(d.end), total: money(x.total), files: files, photos: photos,
    status: x.status === 'accepted' && Number(x.accepted_version) === Number(x.version) ? 'accepted' : (x.status === 'question' ? 'question' : 'new'),
    acceptedAt: x.status === 'accepted' ? ymd(x.accepted_at) : '', question: x.status === 'question' ? clip(x.question, 2000) : '',
    signedName: x.status === 'accepted' && d.signature && Number(d.signature.version) === Number(x.version) ? clip(d.signature.name, 80) : '' };
}
function papersOf(sub, events){
  const exp = ymd(sub.insExp || sub.insuranceExp || sub.coiExpiration);
  const days = exp ? Math.ceil((Date.parse(exp + 'T12:00:00Z') - Date.now()) / 864e5) : null;
  const pend = function(k){ return events.some(function(e){ return e.kind === 'paper' && !e.applied_at && (e.data || {}).paper === k; }); };
  return { w9: { onFile: sub.w9 === true, sent: pend('w9') }, coi: { onFile: sub.coi === true || !!exp, exp: exp, days: days, sent: pend('coi') },
    agreement: { onFile: !!sub.subAgreement, sent: pend('agreement') }, lien: { required: sub.lien === true, sent: pend('lien') } };
}
async function bidsState(sub){
  try {
    const rows = await dbGet('sp_rows', 'select=id,data&collection=eq.users&order=key.asc');
    const p = rows.map(function(r){ return r.data || {}; }).find(function(u){ return u.role === 'sub' && (s(u.crmSubId) === s(sub.id) || (okEmail(sub.email) && low(u.email) === low(sub.email))); });
    if (!p) return { state: 'invite', url: bidsBase(), email: maskEmail(sub.email), canAccept: okEmail(sub.email) };
    if (p.approved === true) return { state: 'approved', url: bidsBase() };
    if (p.bidsRevoked === true) return { state: 'off', url: bidsBase() };
    return { state: 'waiting', url: bidsBase() };
  } catch (e) { return { state: 'unavailable', url: bidsBase() }; }
}
async function unreadFor(pids, party){
  if (!pids.length) return {};
  const rows = await dbGet('gc_portal_msg', 'select=project_id&side=eq.gc&read_at=is.null&party=eq.' + encodeURIComponent(party) + '&project_id=' + inq(pids));
  const out = {}; rows.forEach(function(r){ out[r.project_id] = (out[r.project_id] || 0) + 1; }); return out;
}
async function pHome(ctx){
  const sub = ctx.sub, data = ctx.data, pids = ctx.jobs.map(function(p){ return s(p.id); });
  const events = await dbGet('gc_sub_event', 'select=id,kind,project_id,data,applied_at,created_at&sub_id=' + eq(sub.id) + '&kind=in.(paper,punch)&order=created_at.desc&limit=200');
  const unread = await unreadFor(pids, 's:' + sub.id);
  const today = new Date().toISOString().slice(0, 10), week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const punchDone = new Set(events.filter(function(e){ return e.kind === 'punch'; }).map(function(e){ return s((e.data || {}).punchId); }));
  const punch = arr(data.punch).filter(function(x){ return pids.indexOf(s(x.pid)) > -1 && punchIsSub(x, sub) && !/complete|done|closed/.test(low(x.status)) && !punchDone.has(s(x.id)); });
  const sched = schedFor(data, ctx.jobs, sub).filter(function(x){ return x.date >= today && x.date <= week; });
  const scopes = ctx.scopes.map(function(x){ return scopeOut(x, {}); });
  const inv = await partnerInvoices(ctx), mon = today.slice(0, 7);
  const papers = papersOf(sub, events);
  const needs = [];
  scopes.filter(function(x){ return x.status === 'new'; }).forEach(function(x){ const p = ctx.jobs.find(function(j){ return s(j.id) === s(ctx.scopes.find(function(y){ return s(y.id) === x.id; }).project_id); }) || {}; needs.push({ kind: x.kind === 'co' ? 'co' : 'scope', pid: s(p.id), job: s(p.name), title: x.title }); });
  punch.forEach(function(x){ const p = ctx.jobs.find(function(j){ return s(j.id) === s(x.pid); }) || {}; needs.push({ kind: 'punch', pid: s(p.id), job: s(p.name), title: clip(x.item, 160) }); });
  Object.keys(unread).forEach(function(pid){ const p = ctx.jobs.find(function(j){ return s(j.id) === pid; }) || {}; needs.push({ kind: 'message', pid: pid, job: s(p.name), count: unread[pid] }); });
  if (papers.coi.days != null && papers.coi.days <= 30 && !papers.coi.sent) needs.push({ kind: papers.coi.days < 0 ? 'coi-expired' : 'coi-expiring', days: papers.coi.days, exp: papers.coi.exp });
  if (!papers.w9.onFile && !papers.w9.sent) needs.push({ kind: 'w9' });
  return {
    ok: true, kind: 'partner', lang: lang(sub.lang),
    me: { name: s(sub.contact) || s(sub.name), company: s(sub.company || sub.name), trade: s(sub.trade || sub.cat) },
    office: { phone: OFFICE_PHONE, email: OFFICE_EMAIL },
    jobs: ctx.jobs.map(function(p){ const r = rowFor(p, sub); const pm = pmOf(data, p);
      return { id: s(p.id), name: s(p.name), address: s(p.address), status: s(r.status) || 'Awarded', start: ymd(r.startDate || p.startDate), end: ymd(r.endDate || p.endDate),
        pct: num(r.pct), unread: unread[s(p.id)] || 0, newScope: scopes.some(function(x){ return x.status === 'new' && s((ctx.scopes.find(function(y){ return s(y.id) === x.id; }) || {}).project_id) === s(p.id); }), pm: pm }; }),
    needs: needs, week: sched,
    money: { submitted: money(inv.filter(function(x){ return x.state === 'submitted'; }).reduce(function(t, x){ return t + x.amount; }, 0)),
             approved: money(inv.filter(function(x){ return x.state === 'approved'; }).reduce(function(t, x){ return t + x.amount; }, 0)),
             paidMonth: money(inv.filter(function(x){ return x.state === 'paid' && x.paidDate.slice(0, 7) === mon; }).reduce(function(t, x){ return t + x.amount; }, 0)) },
    invoices: inv.slice(0, 60), papers: papers, bids: await bidsState(sub),
    payRule: 'wed-fri'
  };
}
/* patch X10: the sub's own schedule (60 days) and their busy days (the CRM's scheduler warns when a sub is booked on one) */
function x10Lib(){ return require('./bid-inbox.js')._lib; }
function todayCentral(){ return require('./_lib/x10.js').wall(Date.now()).day; }
async function pAvail(ctx, body, action){
  const L = x10Lib(), K = 'gc_x10_subavail', id = s(ctx.sub.id), today = todayCentral();
  if (action === 'p-avail-set') {
    const days = (Array.isArray(body.days) ? body.days : []).map(s).filter(function(d){ return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today; }).slice(0, 60);
    const busy = body.busy !== false, note = clip(body.note, 120);
    await L.kvCas(K, function(v){ v = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; const r = v[id] = v[id] || { name: s(ctx.sub.company || ctx.sub.name), days: {} };
      days.forEach(function(d){ if (busy) r.days[d] = { at: new Date().toISOString(), note: note }; else delete r.days[d]; });
      Object.keys(r.days).forEach(function(d){ if (d < today) delete r.days[d]; }); r.name = s(ctx.sub.company || ctx.sub.name); r.updatedAt = new Date().toISOString(); return v; });
  }
  const all = (await L.kvGet(K)) || {}, mine = (all[id] && all[id].days) || {};
  const end = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  const sched = schedFor(ctx.data, ctx.jobs, ctx.sub).filter(function(x){ return x.date >= today && x.date <= end; });
  return { ok: true, today: today, busy: Object.keys(mine).filter(function(d){ return d >= today; }).sort().map(function(d){ return { date: d, note: s(mine[d].note) }; }), sched: sched };
}
async function pCodes(ctx, pid){
  const p = jobOf(ctx, pid), today = todayCentral(), X = require('./_lib/x10.js');
  if (X.jobClosed(p)) return { ok: true, codes: [], why: 'closed' };
  const r = rowFor(p, ctx.sub), start = ymd(r.startDate), end = ymd(r.endDate) || start;
  const onSched = schedFor(ctx.data, ctx.jobs, ctx.sub).some(function(x){ return s(x.pid) === s(p.id) && x.date === today; }) || (start && start <= today && today <= end);
  if (!onSched) return { ok: true, codes: [], why: 'not-today' };
  const L = x10Lib(); let out = [];
  await L.kvCas('gc_x10_codes', function(v){ const l = Array.isArray(v) ? v : []; const rec = l.find(function(x){ return s(x.pid) === s(p.id); }); if (!rec || !arr(rec.codes).length) return undefined;
    out = arr(rec.codes).map(function(c){ return { label: s(c.label), code: s(c.code) }; });
    rec.log = arr(rec.log).concat([{ at: new Date().toISOString(), by: 'sub: ' + s(ctx.sub.company || ctx.sub.name), what: 'viewed in the sub portal' }]).slice(-200); return l; });
  return { ok: true, codes: out, why: out.length ? '' : 'none' };
}
/* patch AUTO7: the sub scorecard — only this sub's own numbers, never anyone else's */
async function pScore(ctx){
  const more = await kvRead(['schedule', 'punch', 'gc_warranty_tickets', 'gc_sub_ratings']);
  const FA = require('./_lib/fa-core.js');
  const sc = FA.subScore(ctx.sub, { schedule: arr(ctx.data.schedule).length ? ctx.data.schedule : more.schedule, punch: arr(ctx.data.punch).length ? ctx.data.punch : more.punch, tickets: more.gc_warranty_tickets, ratings: more.gc_sub_ratings });
  return { ok: true, score: sc };
}
function punchIsSub(x, sub){ return s(x.subId) ? s(x.subId) === s(sub.id) : rowIsSub({ name: x.assignee || x.sub }, sub); }
function schedFor(data, jobs, sub){
  const pids = new Set(jobs.map(function(p){ return s(p.id); })), nm = jobs.reduce(function(m, p){ m[s(p.id)] = s(p.name); return m; }, {});
  return arr(data.schedule).filter(function(x){ return pids.has(s(x.pid)) && (s(x.subId) === s(sub.id) || rowIsSub({ name: x.vendor || x.sub || x.assignee }, sub)); })
    .map(function(x){ return { date: ymd(x.date), time: clip(x.time, 10), endTime: clip(x.endTime, 10), title: clip(x.title, 160), pid: s(x.pid), job: nm[s(x.pid)] || '' }; })
    .filter(function(x){ return x.date; }).sort(function(a, b){ return (a.date + a.time).localeCompare(b.date + b.time); });
}
async function pJob(ctx, pid){
  const p = ctx.jobs.find(function(j){ return s(j.id) === s(pid); });
  if (!p) throw Fail(404, 'That job is not one of yours.');
  const sub = ctx.sub, data = ctx.data, r = rowFor(p, sub);
  const scopes = ctx.scopes.filter(function(x){ return s(x.project_id) === s(p.id); });
  const events = await dbGet('gc_sub_event', 'select=id,kind,data,created_at,applied_at&sub_id=' + eq(sub.id) + '&project_id=' + eq(p.id) + '&kind=in.(punch,progress,photos,upload)&order=created_at.desc&limit=300');
  const refs = [];
  scopes.forEach(function(x){ arr((x.data || {}).files).concat(arr((x.data || {}).photos)).forEach(function(f){ refs.push(f.ref); }); });
  events.forEach(function(e){ arr((e.data || {}).files).forEach(function(f){ refs.push(f.ref); }); });
  const signed = await signRefs(refs);
  const doneBy = {}; events.filter(function(e){ return e.kind === 'punch'; }).forEach(function(e){ doneBy[s((e.data || {}).punchId)] = e; });
  const site = (p.siteNotes && typeof p.siteNotes === 'object') ? p.siteNotes : {};
  const showCust = p.subCustomerContact === true || r.customerContact === true;
  const inv = (await partnerInvoices(ctx)).filter(function(x){ return x.pid === s(p.id); });
  const out = {
    ok: true,
    job: { id: s(p.id), name: s(p.name), address: s(p.address), maps: s(p.address) ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s(p.address)) : '',
      po: s(p.autoPO || p.po), status: s(r.status) || 'Awarded', start: ymd(r.startDate || p.startDate), end: ymd(r.endDate || p.endDate), pct: num(r.pct),
      site: { gate: clip(site.gate, 200), parking: clip(site.parking, 300), hours: clip(site.hours, 200), dumpster: clip(site.dumpster, 300), power: clip(site.power, 300), water: clip(site.water, 300), notes: clip(site.notes, 2000) },
      customer: showCust ? { name: s(p.client), phone: s(p.clientPhone || p.phone), email: low(p.clientEmail || p.email) } : null },
    pm: pmOf(data, p), office: { phone: OFFICE_PHONE, email: OFFICE_EMAIL },
    schedule: schedFor(data, [p], sub),
    scopes: scopes.filter(function(x){ return x.kind !== 'co'; }).map(function(x){ return scopeOut(x, signed); }),
    cos: scopes.filter(function(x){ return x.kind === 'co'; }).map(function(x){ return scopeOut(x, signed); }),
    punch: arr(data.punch).filter(function(x){ return s(x.pid) === s(p.id) && punchIsSub(x, sub); }).map(function(x){
      const ev = doneBy[s(x.id)];
      const done = /complete|done|closed/.test(low(x.status)) || !!ev;
      return { id: s(x.id), item: clip(x.item || x.title, 200), details: clip(x.details, 1000), due: ymd(x.dueDate), priority: clip(x.priority, 20), done: done,
        doneAt: ev ? ymd(ev.created_at) : ymd(x.completedAt || x.doneAt), photo: ev ? (arr(ev.data.files).map(function(f){ return fileOut(f, signed); }).filter(Boolean)[0] || null) : null };
    }),
    progress: events.filter(function(e){ return e.kind === 'progress'; }).slice(0, 40).map(function(e){ return { at: e.created_at, pct: num((e.data || {}).pct), note: clip((e.data || {}).note, 1000),
      photos: arr((e.data || {}).files).map(function(f){ return fileOut(f, signed); }).filter(Boolean) }; }),
    files: events.filter(function(e){ return e.kind === 'photos'; }).slice(0, 60).map(function(e){ return { at: e.created_at, note: clip((e.data || {}).note, 500),
      files: arr((e.data || {}).files).map(function(f){ return fileOut(f, signed); }).filter(Boolean) }; }),
    invoices: inv, unread: (await unreadFor([s(p.id)], 's:' + sub.id))[s(p.id)] || 0,
    lien: { required: sub.lien === true || p.lienRequired === true }
  };
  return out;
}
async function uploadsOf(sub, ids, pid){
  ids = (Array.isArray(ids) ? ids : []).map(s).filter(okId).slice(0, 12);
  if (!ids.length) return [];
  const rows = await dbGet('gc_sub_event', 'select=id,project_id,data&kind=eq.upload&sub_id=' + eq(sub.id) + '&id=' + inq(ids));
  return rows.filter(function(r){ return !pid || !r.project_id || s(r.project_id) === s(pid); }).map(function(r){ const d = r.data || {}; return { ref: d.ref, name: d.name, type: d.type, size: d.size, hash: d.hash }; });
}
/* patch AUTO6: a drawn signature — at most 40 strokes of 600 points, numbers on the 600 × 200 pad */
function cleanStrokes(v){
  return (Array.isArray(v) ? v : []).slice(0, 40).map(function(st){
    return (Array.isArray(st) ? st : []).slice(0, 600).map(function(p){
      const x = Number(Array.isArray(p) ? p[0] : NaN), y = Number(Array.isArray(p) ? p[1] : NaN);
      return isFinite(x) && isFinite(y) ? [Math.round(Math.max(0, Math.min(600, x)) * 10) / 10, Math.round(Math.max(0, Math.min(200, y)) * 10) / 10] : null;
    }).filter(Boolean);
  }).filter(function(st){ return st.length; });
}
async function addEvent(kind, sub, pid, data){
  const id = newId('E');
  await dbPost('gc_sub_event', { id: id, kind: kind, project_id: pid || null, sub_id: s(sub.id), data: Object.assign({ subName: s(sub.name || sub.company) }, data) });
  return id;
}
/* patch AUTO6: "PO · job · address" for a sub's e-mail subject (never the insurance carrier) */
function jobTagOf(data, pid){
  const p = arr(data && data.projects).find(function(j){ return j && s(j.id) === s(pid); });
  if (!p) return '';
  const own = ['insCarrier', 'carrier', 'insurer', 'insuranceCompany', 'insuranceCarrier', 'insCompany'].map(function(k){ return s(p[k]); }).filter(function(w){ return w.length >= 3; });
  const strip = function(v){ own.forEach(function(w){ v = s(v).split(w).join(''); }); return s(v).replace(/\b(state\s*farm|allstate|usaa|liberty\s*mutual|nationwide|travelers|progressive|farmers|geico|chubb|safeco|erie|auto[\s-]*owners|homesite|metlife|amica|kemper|foremost|assurant|stillwater)\b[^·—-]*/gi, '').replace(/\s*[—-]\s*(claim)?\s*$/i, '').trim(); };
  return [s(p.autoPO || p.po) ? 'PO ' + s(p.autoPO || p.po) : '', strip(p.name), strip(p.address || p.jobAddress)].filter(Boolean).join(' \u00b7 ').slice(0, 160);
}
function jobOf(ctx, pid){ const p = ctx.jobs.find(function(j){ return s(j.id) === s(pid); }); if (!p) throw Fail(404, 'That job is not one of yours.'); return p; }
async function partnerAction(action, body, ctx){
  const sub = ctx.sub;
  if (action === 'p-home') return pHome(ctx);
  if (action === 'p-score') return pScore(ctx);
  if (action === 'p-avail' || action === 'p-avail-set') return pAvail(ctx, body, action);   /* patch X10: my schedule + the days I can't work */
  if (action === 'p-codes') return pCodes(ctx, body.projectId);   /* patch X10: the job's access codes — only on my scheduled days, every look logged */   /* patch AUTO7: the sub's own scorecard (Papers, at the bottom) */
  if (action === 'p-job') return pJob(ctx, body.projectId);
  if (action === 'p-upload') {
    if (body.projectId) jobOf(ctx, body.projectId);
    const f = await storeFile(body.data, body.name);
    const id = await addEvent('upload', sub, body.projectId ? s(body.projectId) : null, Object.assign({ purpose: clip(body.purpose, 20) }, f));
    await dbPatch('gc_sub_event', 'id=' + eq(id), { applied_at: new Date().toISOString(), applied_by: 'upload' });   /* a raw upload is not something for the CRM to file */
    return { ok: true, id: id, name: f.name, type: f.type };
  }
  if (action === 'p-scope') {
    const rows = await dbGet('gc_sub_scope', 'select=*&id=' + eq(body.id) + '&sub_id=' + eq(sub.id));
    const x = rows[0];
    if (!x || ['published', 'accepted', 'question'].indexOf(x.status) < 0) throw Fail(404, 'That scope is not available.');
    const now = new Date().toISOString();
    if (body.op === 'accept' || body.op === 'sign') {
      /* patch AUTO6 (owner 10/21): the sub agreement / change order is SIGNED — typed full name + the drawn signature
         (points on a 600 × 200 pad, like the customer portal), with the time, the IP and the version signed */
      if (Number(body.version) && Number(body.version) !== Number(x.version)) throw Fail(409, 'GrayCo changed this a moment ago. Look it over again, then sign.');
      const signName = clip(String(body.signName == null ? '' : body.signName).replace(/\s+/g, ' '), 80);
      if (signName.length < 3 || !/[A-Za-z\u00C0-\u024F]{2}/.test(signName)) throw Fail(400, 'Type your full name to sign.');
      if (body.agree !== true) throw Fail(400, 'Tick the box to agree, then sign.');
      const strokes = cleanStrokes(body.strokes);
      const sig = { name: signName, strokes: strokes, at: now, ip: clip(ctx.ip || 'unknown', 60), ua: clip(ctx.ua || '', 200), version: Number(x.version), total: money(x.total), title: clip(x.title, 160), by: s(sub.id) };
      const d = Object.assign({}, x.data || {}, { signature: sig });
      const done = await dbPatch('gc_sub_scope', 'id=' + eq(x.id) + '&version=eq.' + Number(x.version), { status: 'accepted', accepted_at: now, accepted_version: x.version, data: d, updated_at: now }, true);
      if (Array.isArray(done) && !done.length) throw Fail(409, 'GrayCo changed this a moment ago. Look it over again, then sign.');
      await addEvent('scope', sub, x.project_id, { scopeId: x.id, kind: x.kind, op: 'accepted', signed: true, signedName: signName, signedAt: now, version: x.version, title: x.title, total: money(x.total) });
      return { ok: true, status: 'accepted', signed: true, signedName: signName, signedAt: now };
    }
    if (body.op === 'question') {
      const q = clip(body.text, 2000); if (!q) throw Fail(400, 'Type your question.');
      await dbPatch('gc_sub_scope', 'id=' + eq(x.id), { status: 'question', question: q, question_at: now, updated_at: now });
      await msgInsert(x.project_id, 's:' + sub.id, 'them', s(sub.contact || sub.name), (x.kind === 'co' ? 'Question on change order "' : 'Question on scope "') + clip(x.title, 80) + '": ' + q, []);
      await addEvent('scope', sub, x.project_id, { scopeId: x.id, kind: x.kind, op: 'question', version: x.version, title: x.title, question: q });
      return { ok: true, status: 'question' };
    }
    throw Fail(400, 'Bad request');
  }
  if (action === 'p-invoice') {
    const p = jobOf(ctx, body.projectId);
    const amount = money(body.amount);
    if (!(amount > 0) || amount > 1e7) throw Fail(400, 'Enter the invoice amount.');
    const files = await uploadsOf(sub, [body.uploadId], p.id);
    let scopeTitle = '';
    if (body.scopeId) { const sc = ctx.scopes.find(function(x){ return s(x.id) === s(body.scopeId) && s(x.project_id) === s(p.id); }); if (sc) scopeTitle = clip(sc.title, 120); }
    const today = new Date().toISOString().slice(0, 10);
    const eid = newId('E');
    await dbPost('gc_sub_event', { id: eid, kind: 'invoice', project_id: s(p.id), sub_id: s(sub.id), data: { subName: s(sub.name || sub.company), invId: 'SPI_' + eid,
      amount: amount, po: clip(s(p.autoPO || p.po) || body.po, 40), invNum: clip(body.invNum, 40), note: clip(body.note, 500), scopeId: clip(body.scopeId, 80), scopeTitle: scopeTitle,
      recvDate: today, payDate: payDateFor(today), files: files } });
    return { ok: true, id: 'SPI_' + eid, payDate: payDateFor(today) };
  }
  if (action === 'p-photos-add') {
    const p = jobOf(ctx, body.projectId);
    const files = await uploadsOf(sub, body.uploadIds, p.id);
    const inPhotos = Math.max(0, Math.min(50, Math.round(num(body.gphotos))));     /* sent straight into GrayCo Photos (sub-photos) */
    if (!files.length && !inPhotos) throw Fail(400, 'Add a photo first.');
    await addEvent('photos', sub, p.id, { note: clip(body.note, 500), files: files, gphotos: inPhotos });
    return { ok: true, count: files.length + inPhotos };
  }
  if (action === 'p-progress') {
    const p = jobOf(ctx, body.projectId);
    const pct = Math.max(0, Math.min(100, Math.round(num(body.pct))));
    await addEvent('progress', sub, p.id, { pct: pct, note: clip(body.note, 1000), files: await uploadsOf(sub, body.uploadIds, p.id) });
    return { ok: true, pct: pct };
  }
  if (action === 'p-punch') {
    const p = jobOf(ctx, body.projectId);
    const item = arr(ctx.data.punch).find(function(x){ return s(x.id) === s(body.punchId) && s(x.pid) === s(p.id) && punchIsSub(x, sub); });
    if (!item) throw Fail(404, 'That punch item is not yours.');
    await addEvent('punch', sub, p.id, { punchId: s(item.id), item: clip(item.item, 200), note: clip(body.note, 500), files: await uploadsOf(sub, [body.uploadId], p.id) });
    return { ok: true };
  }
  if (action === 'p-paper') {
    const k = low(body.paper);
    if (['w9', 'coi', 'agreement', 'lien'].indexOf(k) < 0) throw Fail(400, 'Bad request');
    const files = await uploadsOf(sub, [body.uploadId], null);
    if (!files.length) throw Fail(400, 'Add the file first.');
    const exp = ymd(body.exp);
    if (k === 'coi' && !exp) throw Fail(400, 'Enter the date the insurance runs out.');
    let pid = null; if (body.projectId) pid = s(jobOf(ctx, body.projectId).id);
    await addEvent('paper', sub, pid, { paper: k, exp: exp, files: files });
    return { ok: true };
  }
  if (action === 'p-msgs') {
    const p = jobOf(ctx, body.projectId);
    return threadOut(p.id, 's:' + sub.id, 'them');
  }
  if (action === 'p-send') {
    const p = jobOf(ctx, body.projectId);
    const files = await uploadsOf(sub, body.uploadIds, p.id);
    const text = clip(body.text, 4000);
    if (!text && !files.length) throw Fail(400, 'Type a message.');
    const m = await msgInsert(p.id, 's:' + sub.id, 'them', s(sub.contact || sub.name), text, files);
    return { ok: true, id: m };
  }
  if (action === 'p-lang') {
    await addEvent('lang', sub, null, { lang: lang(body.lang) });
    return { ok: true };
  }
  if (action === 'p-photos') {
    const p = jobOf(ctx, body.projectId);
    return { ok: true, photos: await jobPhotos(ctx.data, p, sub) };
  }
  if (action === 'p-photos-code') return { ok: true, code: await photosCode(sub) };
  if (action === 'p-bids') return bidsAccept(sub, body);
  throw Fail(400, 'Bad request');
}
/* photos a sub may see (until the GrayCo Photos API takes over): their own photos on the job, and the job's
   photos GrayCo shared with subs (a job document that is a picture, not marked "hide from subs") */
async function jobPhotos(data, p, sub){
  const ev = await dbGet('gc_sub_event', 'select=data,created_at&kind=in.(photos,progress,punch)&project_id=' + eq(p.id) + '&sub_id=' + eq(sub.id) + '&order=created_at.desc&limit=200');
  const items = [];
  ev.forEach(function(e){ arr((e.data || {}).files).forEach(function(f){ if (/^image\//.test(s(f.type))) items.push({ ref: f.ref, at: ymd(e.created_at), by: 'you' }); }); });
  arr(data.projectDocs).filter(function(d){ return s(d.pid) === s(p.id) && refPath(d.ref) && /image|photo|jpe?g|png/i.test(s(d.type) + ' ' + s(d.cat)) && d.hideFromSubs !== true && d.deleted !== true; })
    .forEach(function(d){ items.push({ ref: d.ref, at: ymd(d.uploadedAt || d.uploaded || d.savedAt), by: 'GrayCo' }); });
  const signed = await signRefs(items.map(function(x){ return x.ref; }));
  return items.map(function(x){ const u = signed[x.ref]; return u ? { t: u, f: u, at: x.at, by: x.by } : null; }).filter(Boolean).slice(0, 400);
}
/* "You're invited to bid": the bid-site account (sp_rows users, as the bid site keeps it) waits for an owner's approval */
async function bidsAccept(sub, body){
  if (!okEmail(sub.email)) throw Fail(400, 'GrayCo needs your e-mail on file first — call ' + OFFICE_PHONE + '.');
  const email = low(sub.email);
  const rows = await dbGet('sp_rows', 'select=key,id,data&collection=eq.users&email=' + eq(email));
  const now = new Date().toISOString();
  let profile = rows[0] && rows[0].data;
  if (profile && profile.role !== 'sub') throw Fail(409, 'That e-mail belongs to a GrayCo account. Call ' + OFFICE_PHONE + '.');
  if (!profile) {
    const pw = String(body.password || '');
    if (pw.length < 8) throw Fail(400, 'Choose a password with at least 8 characters.');
    const cr = await fetch(sbUrl() + '/auth/v1/admin/users', { method: 'POST', headers: H(),
      body: JSON.stringify({ email: email, password: pw, email_confirm: true, user_metadata: { name: clip(sub.contact || sub.name, 80), portal: 'sub' } }) });
    let uid = '';
    if (cr.ok) { const j = await cr.json().catch(function(){ return {}; }); uid = s(j.id || (j.user && j.user.id)); }
    else { const t = await cr.text().catch(function(){ return ''; }); if (!/already|registered|exists/i.test(t)) throw Fail(502, 'The bid site sign-in could not be made (' + cr.status + ').'); }
    profile = { id: 'u_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), authUserId: uid, username: email, email: email, role: 'sub', approved: false,
      name: clip(sub.contact || sub.name, 80), phone: clip(sub.phone, 40), company: clip(sub.company || sub.name, 120), trades: s(sub.trade) ? [clip(sub.trade, 60)] : [],
      crmSubId: s(sub.id), bidsRequested: true, bidsRequestedAt: now, lang: lang(sub.lang), createdAt: now };
  } else {
    if (profile.approved === true) return { ok: true, state: 'approved' };
    profile = Object.assign({}, profile, { crmSubId: profile.crmSubId || s(sub.id), bidsRequested: true, bidsRequestedAt: now, bidsRevoked: false });
  }
  await dbPost('sp_rows?on_conflict=key', [{ key: 'users/' + profile.id, collection: 'users', id: profile.id, user_id: profile.id, email: email, data: profile, updated_at: now, updated_by: 'portal' }],
    'resolution=merge-duplicates,return=minimal');
  await sendMail(ownerEmails(), 'Bid site request — ' + s(sub.company || sub.name),
    mailHtml('Approve a company for the bid site', s(sub.company || sub.name) + ' (' + s(sub.trade) + ') asked to bid on GrayCo jobs at bids.grayco-cs.com. Approve or deny it in the CRM: Subs tab → Bid site requests, or the 🔨 Sub Portal tab → Pending Subs.', '', { href: 'https://crm.grayco-cs.com/', label: 'Open the CRM' }));
  return { ok: true, state: 'waiting' };
}

/* ── messages (customer per job; sub per job + sub) ─────────────────────────── */
async function msgInsert(pid, party, side, author, text, files){
  const id = newId('M');
  await dbPost('gc_portal_msg', { id: id, project_id: s(pid), party: party, side: side, author: clip(author, 80), text: clip(text, 4000),
    files: (files || []).map(function(f){ return { ref: s(f.ref), name: clip(f.name, 120), type: s(f.type) }; }).filter(function(f){ return refPath(f.ref); }) });
  return id;
}
/* reader = 'them' (customer / sub reading GrayCo's messages) or 'gc' (GrayCo reading theirs) */
async function threadOut(pid, party, reader, noMark){
  const rows = await dbGet('gc_portal_msg', 'select=*&project_id=' + eq(pid) + '&party=eq.' + encodeURIComponent(party) + '&order=created_at.asc&limit=500');
  const other = reader === 'them' ? 'gc' : 'them';
  if (!noMark && rows.some(function(m){ return m.side === other && !m.read_at; })) {
    await dbPatch('gc_portal_msg', 'project_id=' + eq(pid) + '&party=eq.' + encodeURIComponent(party) + '&side=eq.' + other + '&read_at=is.null', { read_at: new Date().toISOString() });
  }
  const refs = []; rows.forEach(function(m){ arr(m.files).forEach(function(f){ refs.push(f.ref); }); });
  const signed = await signRefs(refs);
  return { ok: true, messages: rows.map(function(m){ return { id: m.id, mine: m.side === reader, by: m.side === 'gc' ? (s(m.author) || 'GrayCo') : s(m.author), text: s(m.text), at: m.created_at,
    read: !!m.read_at, readAt: m.read_at || null, files: arr(m.files).map(function(f){ return fileOut(f, signed); }).filter(Boolean) }; }) };
}

/* ── customer actions (link or session) ─────────────────────────────────────── */
async function customerPids(event){
  const token = s(gcHeader(event, 'x-portal-token'));
  if (TOKEN_RE.test(token)) { const c = await custLinkRow(token); return c ? [s(c.project_id)] : null; }
  const sess = await sessionOf(gcHeader(event, 'x-portal-session'));
  return sess && sess.kind === 'customer' ? sess.pids : null;
}
async function customerAction(action, body, pids){
  const data = await crmData(false);
  const projects = liveProjects(data).filter(function(p){ return pids.indexOf(s(p.id)) > -1; });
  if (action === 'c-jobs') {
    const unread = await unreadFor(projects.map(function(p){ return s(p.id); }), 'c');
    return { ok: true, kind: 'customer', jobs: projects.map(function(p){ return { id: s(p.id), name: s(p.name), address: s(p.address), unread: unread[s(p.id)] || 0 }; }) };
  }
  const pid = s(body.projectId) || (projects.length === 1 ? s(projects[0].id) : '');
  const p = projects.find(function(x){ return s(x.id) === pid; });
  if (!p) throw Fail(404, NOT_ACTIVE);
  if (action === 'c-msgs') { const th = await threadOut(p.id, 'c', 'them', body.preview === true);   /* a staff preview (patch INSP) does not mark anything read */
  th.pm = pmOf(data, p); return th; }
  if (action === 'c-send') {
    if (body.preview === true) throw Fail(400, 'This is a preview — messages are sent from the customer\'s own portal.');
    const text = clip(body.text, 4000); if (!text) throw Fail(400, 'Type a message.');
    return { ok: true, id: await msgInsert(p.id, 'c', 'them', s(p.client).split(/\s+/)[0] || 'Customer', text, []) };
  }
  throw Fail(400, 'Bad request');
}

/* ═══ STAFF (the CRM) ═══════════════════════════════════════════════════════ */
function staffName(data, who){ const u = arr(data.users).find(function(x){ return low(x.email) === who.email; }); return s(u && u.name) || who.name || who.email; }
function isAdmin(who){ return /admin|owner/.test(low(who.role)); }
function canApproveFor(data, who, pid){
  if (isAdmin(who)) return true;
  const p = arr(data.projects).find(function(x){ return s(x.id) === s(pid); });
  return !!(p && low(p.pm || p.projectManager) && low(p.pm || p.projectManager) === low(staffName(data, who)));
}
function cleanScope(sc){
  const d = sc && typeof sc === 'object' ? sc : {};
  const lines = arr(d.lines).slice(0, 400).map(function(l){ return { room: clip(l.room || l.area, 80), desc: clip(l.desc || l.description, 400), qty: l.qty === '' || l.qty == null ? '' : num(l.qty), unit: clip(l.unit, 20), meas: clip(l.meas || l.measurement, 120), srcId: clip(l.srcId || l.id, 80) }; })
    .filter(function(l){ return l.desc || l.meas || l.room; });
  const files = function(v){ return arr(v).slice(0, 30).map(function(f){ return { ref: s(f.ref), name: clip(f.name, 120), type: clip(f.type, 60) }; }).filter(function(f){ return refPath(f.ref); }); };
  /* NO line prices, cost or margin are ever stored here — the scope keeps the sub's ONE total only */
  return { title: clip(d.title, 160), lines: lines, included: clip(d.included, 4000), excluded: clip(d.excluded, 4000), matGc: clip(d.matGc, 2000), matSub: clip(d.matSub, 2000),
    notes: clip(d.notes, 4000), start: ymd(d.start), end: ymd(d.end), files: files(d.files), photos: files(d.photos), source: clip(d.source, 40), scId: clip(d.scId, 80) };
}
async function staffAction(action, body, who){
  const data = await crmData(true);
  const me = staffName(data, who);
  if (action === 's-sync') {
    const events = await dbGet('gc_sub_event', 'select=*&applied_at=is.null&kind=neq.upload&order=created_at.asc&limit=300');
    /* sign-in codes for customers with only a phone (no texting yet): the PM texts them from their phone */
    const relays = (await dbGet('gc_portal_code', 'select=id,relay,expires_at&used_at=is.null&purpose=eq.signin&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&limit=50'))
      .filter(function(c){ return c.relay && c.relay.phone; }).map(function(c){ return { id: c.id, phone: c.relay.phone, who: s(c.relay.who), pids: c.relay.pids || [],
        sms: 'sms:' + c.relay.phone + '?body=' + encodeURIComponent('GrayCo Portal code: ' + c.relay.code + ' (10 min)'), text: 'GrayCo Portal code: ' + c.relay.code }; });
    const unreadRows = await dbGet('gc_portal_msg', 'select=project_id,party,created_at&side=eq.them&read_at=is.null&limit=2000');
    const unread = {};
    unreadRows.forEach(function(m){ const k = s(m.project_id); unread[k] = unread[k] || { c: 0, subs: {}, total: 0, last: '' }; if (m.party === 'c') unread[k].c++; else { const sid = m.party.slice(2); unread[k].subs[sid] = (unread[k].subs[sid] || 0) + 1; } unread[k].total++; if (m.created_at > unread[k].last) unread[k].last = m.created_at; });
    const links = {}; (await dbGet('gc_sub_link', 'select=sub_id,created_at,last_viewed_at,sent_at,sent_via&revoked=eq.false&limit=2000')).forEach(function(l){ links[s(l.sub_id)] = { active: true, created: l.created_at, viewed: l.last_viewed_at, sent: l.sent_at, via: l.sent_via }; });
    const waiting = (await dbGet('gc_sub_scope', 'select=id,project_id,sub_id,kind,title,total,version,created_by,updated_at&status=eq.waiting&limit=500')).map(function(x){
      return Object.assign({}, x, { canApprove: canApproveFor(data, who, x.project_id) }); });
    let bidsReq = [];
    try { bidsReq = (await dbGet('sp_rows', 'select=id,data&collection=eq.users&order=key.asc')).map(function(r){ return r.data || {}; })
      .filter(function(u){ return u.role === 'sub' && u.approved !== true && u.bidsRequested === true && u.bidsRevoked !== true; })
      .map(function(u){ return { id: s(u.id), company: s(u.company), name: s(u.name), email: low(u.email), crmSubId: s(u.crmSubId), at: s(u.bidsRequestedAt) }; }); } catch (e) {}
    return { ok: true, events: events, unread: unread, links: links, waiting: waiting, bids: bidsReq, codes: relays, text: textReady(), admin: isAdmin(who), me: me, at: new Date().toISOString() };
  }
  if (action === 's-thread') {
    if (!okId(body.projectId) || !/^(c|s:[A-Za-z0-9_.:-]{1,80})$/.test(s(body.party))) throw Fail(400, 'Bad request');
    return threadOut(s(body.projectId), s(body.party), 'gc');
  }
  if (action === 's-send') {
    if (!okId(body.projectId) || !/^(c|s:[A-Za-z0-9_.:-]{1,80})$/.test(s(body.party))) throw Fail(400, 'Bad request');
    const text = clip(body.text, 4000), files = arr(body.files).slice(0, 10);
    if (!text && !files.length) throw Fail(400, 'Type a message.');
    return { ok: true, id: await msgInsert(s(body.projectId), s(body.party), 'gc', me, text, files) };
  }
  if (action === 's-scopes') {
    if (!okId(body.projectId)) throw Fail(400, 'Open a job first.');
    const rows = await dbGet('gc_sub_scope', 'select=*&project_id=' + eq(body.projectId) + '&order=created_at.asc');
    return { ok: true, scopes: rows.map(function(x){ return Object.assign({}, x, { canApprove: canApproveFor(data, who, x.project_id) }); }) };
  }
  if (action === 's-scope-save') {
    const sc = body.scope || {};
    const pid = s(sc.projectId), sid = s(sc.subId);
    if (!okId(pid) || !okId(sid)) throw Fail(400, 'Pick the job and the sub.');
    if (!subById(data, sid)) throw Fail(404, 'That sub is not in the CRM.');
    const now = new Date().toISOString(), clean = cleanScope(sc), total = money(sc.total);
    const status = body.submit ? 'waiting' : 'draft';
    if (sc.id) {
      const rows = await dbGet('gc_sub_scope', 'select=*&id=' + eq(sc.id));
      const old = rows[0]; if (!old) throw Fail(404, 'That scope is gone.');
      if (Number(sc.baseVersion) && Number(sc.baseVersion) !== Number(old.version) && old.status !== 'draft') throw Fail(409, 'Someone changed this scope a moment ago. Open it again.');
      const wasOut = ['published', 'accepted', 'question'].indexOf(old.status) > -1;
      const version = wasOut ? Number(old.version) + 1 : Number(old.version);
      const hist = (Array.isArray(old.history) ? old.history : []).concat(wasOut ? [{ version: old.version, title: old.title, total: old.total, data: old.data, status: old.status, at: old.updated_at }] : []).slice(-20);
      await dbPatch('gc_sub_scope', 'id=' + eq(old.id), { title: clean.title, data: clean, total: total, status: status, version: version, history: hist, updated_at: now, approved_by: null, approved_at: null });
      return { ok: true, id: old.id, version: version, status: status };
    }
    const id = newId(s(sc.kind) === 'co' ? 'SCO' : 'SSC');
    await dbPost('gc_sub_scope', { id: id, project_id: pid, sub_id: sid, kind: s(sc.kind) === 'co' ? 'co' : 'scope', version: 1, status: status, title: clean.title, data: clean, total: total, created_by: me, created_at: now, updated_at: now });
    return { ok: true, id: id, version: 1, status: status };
  }
  if (action === 's-scope-approve') {
    const rows = await dbGet('gc_sub_scope', 'select=*&id=' + eq(body.id));
    const x = rows[0]; if (!x) throw Fail(404, 'That scope is gone.');
    if (x.status !== 'waiting') throw Fail(409, 'That scope is not waiting for approval.');
    if (!canApproveFor(data, who, x.project_id)) throw Fail(403, "Only the job's PM (or an admin) approves a scope going to a sub.");
    const now = new Date().toISOString();
    const done = await dbPatch('gc_sub_scope', 'id=' + eq(x.id) + '&status=eq.waiting', { status: 'published', approved_by: me, approved_at: now, updated_at: now }, true);
    if (!Array.isArray(done) || done.length !== 1) throw Fail(409, 'Someone else just approved it.');
    const sub = subById(data, x.sub_id) || {};
    await dbPost('gc_sub_event', { id: newId('E'), kind: 'scope', project_id: x.project_id, sub_id: x.sub_id, data: { subName: s(sub.name), scopeId: x.id, kind: x.kind, op: 'published', version: x.version, title: x.title, total: money(x.total), by: me } });
    /* the e-mail to the sub is part of this approval (the PM's click); a sub link is made if there is none */
    let mailed = false;
    if (okEmail(sub.email)) {
      const link = await subLinkCreate(sub.id, sub.name, me);
      const L = MAIL[lang(sub.lang)];
      const co = x.kind === 'co', tag = jobTagOf(data, x.project_id);   /* patch AUTO6: sign it in the portal; the job in the subject */
      const subj = (co ? L.coSignSubj : L.scopeSubj) + clip(x.title, 80) + (tag ? ' — ' + tag : '');
      mailed = (await sendMail(sub.email, subj, mailHtml(subj, co ? L.coSignBody : L.scopeBody, '', { href: linkFor(link.token), label: L.scopeBtn }))).ok;
    }
    return { ok: true, status: 'published', mailed: mailed };
  }
  if (action === 's-scope-void') {
    await dbPatch('gc_sub_scope', 'id=' + eq(body.id), { status: 'void', updated_at: new Date().toISOString() });
    return { ok: true };
  }
  if (action === 's-link') {
    const sid = s(body.subId); if (!okId(sid)) throw Fail(400, 'Pick a sub.');
    const sub = subById(data, sid); if (!sub) throw Fail(404, 'That sub is not in the CRM.');
    const op = s(body.op || 'status');
    if (op === 'revoke' || op === 'regenerate') await subLinkRevoke(sid);
    if (op === 'revoke') return { ok: true, active: false };
    if (op === 'status') { const l = await subLinkActive(sid); return { ok: true, active: !!l, url: l ? linkFor(l.token) : '', viewed: l ? l.last_viewed_at : null, sent: l ? l.sent_at : null }; }
    const l = await subLinkCreate(sid, sub.name, me);
    return { ok: true, active: true, url: linkFor(l.token) };
  }
  if (action === 's-link-send') {
    /* the person's click IS the approval (owner rule: nothing goes to a sub by itself) */
    const sid = s(body.subId); const sub = subById(data, sid); if (!sub) throw Fail(404, 'That sub is not in the CRM.');
    const to = low(body.to || sub.email);
    if (!okEmail(to)) throw Fail(400, 'This sub has no e-mail on file. Use Text or Copy link.');
    const l = await subLinkCreate(sid, sub.name, me);
    const L = MAIL[lang(body.lang || sub.lang)];
    const res = await sendMail(to, L.linkSubj, mailHtml(L.linkHead, L.linkBody, '', { href: linkFor(l.token), label: L.linkBtn }));
    if (!res.ok) throw Fail(502, res.skipped === 'no-key' ? 'E-mail is not set up on Netlify (RESEND_API_KEY). Use Text or Copy link.' : 'The e-mail did not go out. Try again, or use Text / Copy link.');
    await dbPatch('gc_sub_link', 'token=' + eq(l.token), { sent_at: new Date().toISOString(), sent_via: 'email' });
    return { ok: true, sent: true, url: linkFor(l.token) };
  }
  if (action === 's-ack') {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(s).filter(okId).slice(0, 300);
    if (ids.length) await dbPatch('gc_sub_event', 'applied_at=is.null&id=' + inq(ids), { applied_at: new Date().toISOString(), applied_by: clip(me, 80) });
    return { ok: true, acked: ids.length };
  }
  if (action === 's-bids-approve') {
    if (!isAdmin(who)) throw Fail(403, 'Only an owner (Wesley or Nick) approves the bid site.');
    const rows = await dbGet('sp_rows', 'select=key,id,data&collection=eq.users&id=' + eq(body.id));
    const r = rows[0]; if (!r || (r.data || {}).role !== 'sub') throw Fail(404, 'That request is gone.');
    const ok = body.approve !== false, now = new Date().toISOString();
    const prof = Object.assign({}, r.data, ok ? { approved: true, bidsRevoked: false, bidsApprovedAt: now, bidsApprovedBy: me } : { approved: false, bidsRevoked: true, bidsRevokedAt: now });
    await dbPost('sp_rows?on_conflict=key', [{ key: r.key, collection: 'users', id: r.id, user_id: r.id, email: low(prof.email), data: prof, updated_at: now, updated_by: who.email }], 'resolution=merge-duplicates,return=minimal');
    if (ok) { const L = MAIL[lang(prof.lang)]; await sendMail(prof.email, L.approvedSubj, mailHtml(L.approvedSubj, L.approvedBody, '', { href: bidsBase(), label: L.approvedBtn })); }
    return { ok: true, approved: ok };
  }
  if (action === 's-login') {
    /* the customer's portal login, for the job's portal card: e-mail, starter = first name, changed yes/no */
    if (!okId(body.projectId)) throw Fail(400, 'Open a job first.');
    const p = arr(data.projects).find(function(x){ return s(x.id) === s(body.projectId); });
    if (!p) throw Fail(404, 'That job is not in the cloud yet.');
    const custs = arr(data.customers);
    const c = custs.find(function(x){ return low(x.name || x.company) === low(p.client) && s(p.client); }) || {};
    const email = okEmail(low(p.clientEmail || p.email || c.email)) ? low(p.clientEmail || p.email || c.email) : '';
    const phone = phone10(p.clientPhone || p.phone || c.phone);
    const first = starterOf(c.firstName || p.clientFirstName || p.client || c.name);
    const keys = [email ? 'e:' + email : '', phone ? 'p:' + phone : ''].filter(Boolean);
    const linkRow = (await dbGet('gc_portal', 'select=token&revoked=eq.false&project_id=' + eq(p.id) + '&limit=1'))[0];
    if (body.op === 'reset') {
      if (!isAdmin(who)) throw Fail(403, 'Only an owner resets a customer password.');
      if (keys.length) { await dbPatch('gc_portal_login', 'login=' + inq(keys), { pw_hash: null, changed: false, updated_at: new Date().toISOString() }); await lockClear(keys.map(function(k){ return 'e:' + hmac(k); })); }
    }
    const rows = keys.length ? await dbGet('gc_portal_login', 'select=login,changed,updated_at&login=' + inq(keys)) : [];
    const ch = rows.find(function(x){ return x.changed; });
    const out = { ok: true, email: email, phone: phone, hasFirstName: !!first, linkOn: !!linkRow, changed: !!ch, changedAt: ch ? ch.updated_at : null,
      loginWorks: !!(keys.length && first && linkRow), text: textReady(),
      why: !keys.length ? 'Add an e-mail or mobile number to give this customer a portal login.' : (!first ? 'No customer first name on the job — only the link works.' : (!linkRow ? 'The portal link is off, so the login is off too.' : '')) };
    if (body.op === 'welcome' && linkRow) {
      /* the welcome note (the PM's click is the approval): by text when Twilio is set up, else from the PM's own phone */
      const link = portalBase() + '/#t=' + linkRow.token;
      const firstName = s(p.client).split(/\s+/)[0];
      const msg = 'Hi ' + (firstName || 'there') + ', this is GrayCo. Your project page: ' + link + ' — or sign in at ' + portalBase().replace(/^https:\/\//, '') + ' · ' + (phone && !email ? 'Phone: ' + phone : 'E-mail: ' + email) + ' · Password: your first name';
      out.message = msg;
      if (phone && textReady() && body.via !== 'pm-phone') { const tx = await sendText(phone, msg); out.sent = tx.ok ? 'text' : ''; }
      if (!out.sent && phone) out.sms = 'sms:' + phone + '?body=' + encodeURIComponent(msg);
    }
    return out;
  }
  if (action === 's-settings') {
    if (body.set && typeof body.set === 'object') {
      if (!isAdmin(who)) throw Fail(403, 'Only an owner changes portal settings.');
      const cur = settingsOf(data);
      const next = Object.assign({}, cur, { deviceCode: low(body.set.deviceCode) === 'off' ? 'off' : 'auto', by: me, updatedAt: new Date().toISOString() });
      const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ key: 'gc_sub_portal_settings', value: next, updated_at: next.updatedAt }) });
      if (!r.ok) throw Fail(502, 'Could not save the setting.');
      kvCache = null;
      return { ok: true, settings: next };
    }
    return { ok: true, settings: Object.assign({ deviceCode: 'auto' }, settingsOf(data)), text: textReady(), mail: !!s(process.env.RESEND_API_KEY) && !mailOff() };
  }
  throw Fail(400, 'Bad request');
}

/* ── the door ──────────────────────────────────────────────────────────────── */
async function notActive(headers, t0){
  const wait = MIN_FAIL_MS + Math.floor(Math.random() * 60) - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  return { statusCode: 404, headers: headers, body: JSON.stringify({ ok: false, error: NOT_ACTIVE }) };
}
exports.handler = async function (event) {
  event = event || {};
  const t0 = Date.now();
  const headers = gcCors(event);
  const reply = function(code, obj){ return { statusCode: code, headers: headers, body: JSON.stringify(obj) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });
  if (String(event.body || '').length > 7e6) return reply(413, { ok: false, error: 'That is too big to send.' });
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, { ok: false, error: 'Bad request' }); }
  const action = s(body.action);
  const ip = ipOf(event);
  try {
    if (!svcKey()) return reply(500, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
    if (/^s-/.test(action)) {
      const who = await gcStaffAuth(event);
      if (!who.ok) return reply(who.statusCode, { ok: false, error: who.error });
      return reply(200, await staffAction(action, body, who));
    }
    if (action === 'signin-password') {
      if (limited(ip, 'verify')) return reply(429, { ok: false, error: 'Too many tries. Wait 15 minutes, or tap "Forgot password?" to get a code.' });
      return reply(200, await passwordSignin(body, ip));
    }
    if (action === 'c-password') {
      if (limited(ip, 'pub')) return reply(429, { ok: false, error: 'Too many tries. Wait a few minutes.' });
      const r = await customerPassword(event, body); if (!r) return notActive(headers, t0);
      return reply(200, r);
    }
    if (action === 'signin-start') {
      if (limited(ip, 'signin')) return reply(429, { ok: false, error: 'Too many tries. Wait a few minutes.' });
      return reply(200, await signinStart(body, ip));
    }
    if (action === 'signin-verify' || action === 'device-verify') {
      if (limited(ip, 'verify')) return reply(429, { ok: false, error: 'Too many tries. Wait a few minutes.' });
      try { return reply(200, action === 'signin-verify' ? await signinVerify(body) : ((await deviceVerify(event, body)) || (await notActive(headers, t0)))); }
      catch (e) { noteBad(ip, 'verify'); throw e; }
    }
    if (limited(ip, /^p-/.test(action) ? 'app' : 'pub')) { await sleep(MIN_FAIL_MS); return reply(429, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' }); }
    if (action === 'open') { const r = await openLink(event); if (!r) { noteBad(ip, 'pub'); return notActive(headers, t0); } return reply(200, r); }
    if (action === 'device-start') { const r = await deviceStart(event); if (!r) { noteBad(ip, 'pub'); return notActive(headers, t0); } return reply(200, r); }
    if (action === 'signout') {
      const tok = s(gcHeader(event, 'x-portal-session'));
      if (TOKEN_RE.test(tok)) await dbPatch('gc_portal_session', 'id=' + eq(sha(tok)), { revoked: true });
      return reply(200, { ok: true });
    }
    if (action === 'whoami') {
      const sess = await sessionOf(gcHeader(event, 'x-portal-session'));
      if (!sess) { noteBad(ip, 'pub'); return notActive(headers, t0); }
      return reply(200, { ok: true, kind: sess.kind });
    }
    if (/^c-/.test(action)) {
      const pids = await customerPids(event);
      if (!pids) { noteBad(ip, 'pub'); return notActive(headers, t0); }
      return reply(200, await customerAction(action, body, pids));
    }
    if (/^p-/.test(action)) {
      const sess = await sessionOf(gcHeader(event, 'x-portal-session'));
      if (!sess || sess.kind !== 'partner') { noteBad(ip, 'app'); return notActive(headers, t0); }
      { const ctx = await partnerCtx(sess); ctx.ip = ipOf(event); ctx.ua = clip(gcHeader(event, 'user-agent'), 200); return reply(200, await partnerAction(action, body, ctx)); }
    }
    return reply(400, { ok: false, error: 'Bad request' });
  } catch (e) {
    if (e && e.status) return reply(e.status, Object.assign({ ok: false, error: e.message }, e.extra || {}));
    console.error('[portal-access]', action, e);
    return reply(500, { ok: false, error: 'Something went wrong. Try again, or call GrayCo ' + OFFICE_PHONE + '.' });
  }
};
exports._core = { _reset: function(){ kvCache = null; hits.clear(); }, payDateFor: payDateFor, sha: sha, hmac: hmac, linkFor: linkFor, cleanScope: cleanScope, crmSubs: crmSubs, pwHash: pwHash, pwOk: pwOk, starterOf: starterOf };
