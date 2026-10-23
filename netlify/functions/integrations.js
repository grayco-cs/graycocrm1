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

// netlify/functions/integrations.js
// GrayCo — THE INTEGRATIONS OUTBOX SENDER (patch BB, Insurance restoration).
// "This is the master CRM and I'll always have to use APIs to put information on other programs."
//
// The CRM queues every claim note / status change / document / estimate per connected program
// (gc_kv "gc_integration_outbox") and calls this function to send each one. Signed-in GrayCo
// staff only (the staff check above). Credentials live ONLY here, as Netlify env vars:
//
//   Email to program  RESEND_API_KEY (already set)  [+ CLAIMS_FROM, default office@grayco-cs.com]
//   Generic webhook   GC_WEBHOOK_URL  [+ GC_WEBHOOK_SECRET → X-GrayCo-Signature: sha256=<hmac>]
//   DASH              DASH_API_BASE + DASH_API_KEY      — needs Cotality API access (Digital Hub
//                     Alliance self-service API). Adapter below; the endpoint path is a placeholder
//                     until Cotality's documentation is in hand (DASH_NOTES_PATH overrides it).
//   XactAnalysis      XA_API_BASE + XA_API_KEY + XA_COMPANY_ID — needs a Verisk / Xactware partner
//                     integration (PRS partner program). Same: placeholder path (XA_NOTES_PATH).
//
// POST {action:'status'}           → { programs: { dash|xa|email|webhook: { ready, needs } } }
// POST {action:'send', item:{…}}   → { ok, remoteId } | { ok:false, error, needsAccess?, permanent? }
// The same item id is never sent twice (gc_kv "gc_integration_sent", service key) — two devices
// or a retry after a lost answer cannot double-post a note into DASH.

const crypto = require('crypto');
const RESEND_URL = 'https://api.resend.com/emails';
function s(v){ return v == null ? '' : String(v).trim(); }
function env(k){ return s(process.env[k]); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function SH(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function escH(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ n = Number(n) || 0; return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function status(){
  const P = {};
  P.email = env('RESEND_API_KEY') ? { ready: true } : { ready: false, needs: 'RESEND_API_KEY' };
  P.webhook = env('GC_WEBHOOK_URL') ? { ready: true } : { ready: false, needs: 'GC_WEBHOOK_URL (+ GC_WEBHOOK_SECRET)' };
  P.dash = env('DASH_API_BASE') && env('DASH_API_KEY') ? { ready: true } : { ready: false, needs: 'DASH API access (Cotality Digital Hub Alliance) → DASH_API_BASE + DASH_API_KEY' };
  P.xa = env('XA_API_BASE') && env('XA_API_KEY') && env('XA_COMPANY_ID') ? { ready: true } : { ready: false, needs: 'XactAnalysis partner integration (Verisk) → XA_API_BASE + XA_API_KEY + XA_COMPANY_ID' };
  return P;
}

/* ── never the same item twice ── */
async function sentMap(){
  if (!svcKey()) return null;
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.gc_integration_sent', { headers: SH() });
    if (!r.ok) return null;
    const rows = await r.json(); const v = rows && rows[0] && rows[0].value;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) { return null; }
}
async function markSent(id, rec){
  if (!svcKey()) return;
  try {
    const m = (await sentMap()) || {};
    m[id] = rec;
    const keys = Object.keys(m); if (keys.length > 5000) keys.sort(function(a, b){ return s(m[a].at) < s(m[b].at) ? -1 : 1; }).slice(0, keys.length - 5000).forEach(function(k){ delete m[k]; });
    await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: SH({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: 'gc_integration_sent', value: m, updated_at: new Date().toISOString() }) });
  } catch (e) {}
}
/* a document from the private bucket: bytes (to attach) or a 7-day signed link (for webhooks) */
function refPath(ref){ const m = /^sb:crm-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/.exec(s(ref)); return m ? m[1] : ''; }
async function fileBytes(ref){
  const path = refPath(ref); if (!path || !svcKey()) return null;
  try { const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + path, { headers: SH() }); if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return b.length <= 9 * 1024 * 1024 ? b : null; } catch (e) { return null; }
}
async function signedLink(ref){
  const path = refPath(ref); if (!path || !svcKey()) return '';
  try { const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files/' + path, { method: 'POST', headers: SH(), body: JSON.stringify({ expiresIn: 7 * 86400 }) }); if (!r.ok) return ''; const j = await r.json(); const u = s(j.signedURL || j.signedUrl); return !u ? '' : /^https:/.test(u) ? u : sbUrl() + '/storage/v1' + (u[0] === '/' ? '' : '/') + u; } catch (e) { return ''; }
}

/* ── what one event says, as plain text (the same words go to every program) ── */
function describe(item){
  const c = item.claim || {}, ev = item.event || {};
  const ref = [c.claimNumber ? 'Claim #' + c.claimNumber : '', c.dashJobId ? 'DASH job ' + c.dashJobId : '', c.xaAssignmentId ? 'XA ' + c.xaAssignmentId : ''].filter(Boolean).join(' · ');
  const what = s(ev.what) || { note: 'Note', phase: 'Status', doc: 'Document', estimate: 'Estimate', photos: 'Photos' }[ev.kind] || 'Update';
  let text = s(ev.text);
  if (ev.kind === 'estimate' && ev.estimate && ev.estimate.totals) { const T = ev.estimate.totals; text = s(ev.estimate.label) + ' (v' + ev.estimate.version + '): RCV ' + money(T.rcv) + ', depreciation ' + money(T.dep) + ', ACV ' + money(T.acv) + ', O&P ' + money(T.op) + ', tax ' + money(T.tax); }
  /* "Claim #… — insured — what": the claim # keeps replies threaded and lets the claim inbox match them */
  const subject = (c.claimNumber ? 'Claim #' + c.claimNumber : 'GrayCo claim') + ' — ' + (s(c.insured) || s(c.projectName) || s(c.address)) + ' — ' + what;
  return { subject: subject.slice(0, 200), ref: ref, what: what, text: text, by: s(ev.by), at: s(ev.at) };
}

/* ── the adapters ── */
async function sendEmail(item){
  const key = env('RESEND_API_KEY'); if (!key) return { ok: false, needsAccess: true, error: 'RESEND_API_KEY is not set on Netlify.' };
  const c = item.claim || {};
  const to = s(c.emailTo).split(/[,;\s]+/).map(s).filter(function(x){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
  if (!to.length) return { ok: false, permanent: true, error: 'No e-mail address for this claim — add one in the claim’s Sync tab (DASH job e-mail, desk adjuster, TPA inbox).' };
  const d = describe(item), ev = item.event || {};
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#171A2B">' +
    '<p style="margin:0 0 6px;color:#5B5F75">' + escH(d.ref || 'GrayCo Construction Services') + '</p>' +
    '<p style="margin:0 0 6px"><b>' + escH(d.what) + '</b>' + (d.by ? ' by ' + escH(d.by) : '') + (d.at ? ' · ' + escH(d.at.replace('T', ' ').slice(0, 16)) + ' UTC' : '') + '</p>' +
    '<div style="white-space:pre-wrap;border-left:3px solid #F2A51A;padding:6px 10px;margin:8px 0">' + escH(d.text) + '</div>' +
    '<p style="margin:12px 0 0;color:#5B5F75;font-size:12px">' + escH([c.insured, c.address, c.dateOfLoss ? 'Loss ' + c.dateOfLoss : ''].filter(Boolean).join(' · ')) + '<br>GrayCo Construction Services · 901-585-0944</p></div>';
  const payload = { from: env('CLAIMS_FROM') || 'GrayCo Construction Services Claims <claims@grayco-cs.com>', reply_to: env('CLAIMS_REPLY_TO') || 'claims@grayco-cs.com', to: to, subject: d.subject, html: html, text: d.ref + '\n' + d.what + (d.by ? ' by ' + d.by : '') + '\n\n' + d.text, headers: { 'X-GrayCo-Item': s(item.id), 'X-GrayCo-CRM': 'claims' } };
  const att = ev.doc || ev.estimate;
  if (att && att.ref) { const b = await fileBytes(att.ref); if (b) payload.attachments = [{ filename: s(att.name) || 'document', content: b.toString('base64') }]; }
  const r = await fetch(RESEND_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': s(item.id).slice(0, 256) }, body: JSON.stringify(payload) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) return { ok: false, permanent: r.status === 422 || r.status === 400, error: 'E-mail: ' + (s(j.message) || ('HTTP ' + r.status)) };
  return { ok: true, remoteId: s(j.id) };
}
async function sendWebhook(item){
  const url = env('GC_WEBHOOK_URL'); if (!url) return { ok: false, needsAccess: true, error: 'GC_WEBHOOK_URL is not set on Netlify.' };
  if (!/^https:\/\//i.test(url)) return { ok: false, permanent: true, error: 'GC_WEBHOOK_URL must start with https://' };
  const ev = Object.assign({}, item.event || {});
  if (ev.doc && ev.doc.ref) ev.doc = Object.assign({}, ev.doc, { url: await signedLink(ev.doc.ref) });
  if (ev.estimate && ev.estimate.ref) ev.estimate = Object.assign({}, ev.estimate, { url: await signedLink(ev.estimate.ref) });
  const body = JSON.stringify({ id: s(item.id), source: 'grayco-crm', type: 'claim.' + s(ev.kind || 'update'), sentAt: new Date().toISOString(), claim: item.claim || {}, event: ev, summary: describe(item) });
  const h = { 'Content-Type': 'application/json', 'Idempotency-Key': s(item.id), 'User-Agent': 'GrayCo-CRM/1' };
  const sec = env('GC_WEBHOOK_SECRET'); if (sec) h['X-GrayCo-Signature'] = 'sha256=' + crypto.createHmac('sha256', sec).update(body).digest('hex');
  const r = await fetch(url, { method: 'POST', headers: h, body: body });
  if (!r.ok) return { ok: false, permanent: r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429, error: 'Webhook: HTTP ' + r.status };
  let id = ''; try { const j = await r.json(); id = s(j && (j.id || j.request_id)); } catch (e) {}
  return { ok: true, remoteId: id };
}
/* DASH: needs Cotality API access. Shape kept to "add a note to a job"; the real path comes from
   Cotality's Digital Hub Alliance documentation (DASH_NOTES_PATH, {job} is replaced). */
async function sendDash(item){
  const base = env('DASH_API_BASE'), key = env('DASH_API_KEY');
  const c = item.claim || {};
  if (!base || !key) {
    /* no API yet: if the DASH job has an e-mail address (check with Cotality that your DASH files
       e-mail into the job), the note goes there by e-mail; otherwise it waits for API access */
    if (s(c.dashEmail) && env('RESEND_API_KEY')) { const r0 = await sendEmail(Object.assign({}, item, { claim: Object.assign({}, c, { emailTo: c.dashEmail }) })); if (r0.ok) r0.via = 'email'; return r0; }
    return { ok: false, needsAccess: true, error: 'Needs DASH API access (Cotality) — DASH_API_BASE + DASH_API_KEY on Netlify (or a DASH job e-mail address on the claim).' };
  } if (!s(c.dashJobId)) return { ok: false, permanent: true, error: 'No DASH job # on this claim (Sync tab).' };
  const path = (env('DASH_NOTES_PATH') || '/jobs/{job}/notes').replace('{job}', encodeURIComponent(c.dashJobId));
  const d = describe(item);
  const r = await fetch(base.replace(/\/$/, '') + path, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': s(item.id) },
    body: JSON.stringify({ externalId: s(item.id), category: d.what, text: d.text, author: d.by, createdAt: d.at, claimNumber: s(c.claimNumber) }) });
  if (r.status === 401 || r.status === 403) return { ok: false, needsAccess: true, error: 'DASH refused the key (HTTP ' + r.status + ').' };
  if (!r.ok) return { ok: false, permanent: r.status >= 400 && r.status < 500 && r.status !== 429, error: 'DASH: HTTP ' + r.status };
  let id = ''; try { const j = await r.json(); id = s(j && (j.id || j.noteId)); } catch (e) {}
  return { ok: true, remoteId: id };
}
/* XactAnalysis: needs a Verisk partner integration (assignment notes). Same pattern. */
async function sendXa(item){
  const base = env('XA_API_BASE'), key = env('XA_API_KEY'), co = env('XA_COMPANY_ID');
  if (!base || !key || !co) return { ok: false, needsAccess: true, error: 'Needs an XactAnalysis partner integration (Verisk) — XA_API_BASE + XA_API_KEY + XA_COMPANY_ID on Netlify.' };
  const c = item.claim || {}; if (!s(c.xaAssignmentId)) return { ok: false, permanent: true, error: 'No XactAnalysis assignment # on this claim (Sync tab).' };
  const path = (env('XA_NOTES_PATH') || '/assignments/{assignment}/notes').replace('{assignment}', encodeURIComponent(c.xaAssignmentId));
  const d = describe(item);
  const r = await fetch(base.replace(/\/$/, '') + path, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'X-Company-Id': co, 'Content-Type': 'application/json', 'Idempotency-Key': s(item.id) },
    body: JSON.stringify({ externalId: s(item.id), subject: d.subject, text: d.text, author: d.by, public: true }) });
  if (r.status === 401 || r.status === 403) return { ok: false, needsAccess: true, error: 'XactAnalysis refused the key (HTTP ' + r.status + ').' };
  if (!r.ok) return { ok: false, permanent: r.status >= 400 && r.status < 500 && r.status !== 429, error: 'XactAnalysis: HTTP ' + r.status };
  let id = ''; try { const j = await r.json(); id = s(j && (j.id || j.noteId)); } catch (e) {}
  return { ok: true, remoteId: id };
}
const ADAPTERS = { email: sendEmail, webhook: sendWebhook, dash: sendDash, xa: sendXa };

async function send(item){
  if (!item || !s(item.id) || !ADAPTERS[item.program]) return { ok: false, permanent: true, error: 'Bad outbox item.' };
  const sent = await sentMap();
  if (sent && sent[item.id]) return { ok: true, duplicate: true, remoteId: s(sent[item.id].remoteId) };
  let res;
  try { res = await ADAPTERS[item.program](item); }
  catch (e) { res = { ok: false, error: s(item.program) + ': ' + s(e && e.message || e) }; }
  if (res.ok) await markSent(item.id, { at: new Date().toISOString(), program: item.program, remoteId: s(res.remoteId) });
  return res;
}

exports.handler = async function(event){
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  const who = await gcStaffAuth(event);
  if (!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };
  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  if (body.action === 'status') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, programs: status() }) };
  if (body.action === 'send') { const r = await send(body.item); return { statusCode: 200, headers, body: JSON.stringify(r) }; }
  return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
};
exports._core = { status: status, send: send, describe: describe, adapters: ADAPTERS };
/* patch LOGOALL (owner 10/23: "should have our logo on it"): every customer / sub / GC e-mail this file sends
   straight to Resend gets the GrayCo shell (centered logo, office line, licenses). Internal @grayco-cs.com mail is untouched. */
try { require('./_lib/brand.js').installResend(); } catch (e) {}
