// netlify/functions/password-reset.js
// GrayCo — "Forgot password?" on the CRM sign-in screen (patch PWRESET). No sign-in needed (that is the point).
//
//   POST { email }  →  ALWAYS  200 { ok: true, message: NEUTRAL }   (same answer for every e-mail: no account fishing)
//
// Only when the e-mail is on gc_staff and active (or the Marketing Manager profile, mkt_active) does anything happen:
//   1. Supabase admin  POST /auth/v1/admin/generate_link { type: 'recovery', email, redirect_to: CRM }   (service key)
//   2. one e-mail through Resend (RESEND_API_KEY) from 'GrayCo CRM <noreply@grayco-cs.com>' with a link to
//        https://crm.grayco-cs.com/#token_hash=<hashed_token>&type=recovery
//      The CRM page itself turns that into a recovery session (POST /auth/v1/verify) and asks for a new password.
//      The link points at our own page, not at Supabase's /verify, so a mail scanner that "clicks" links to check
//      them cannot use the one-time code up, and Supabase's built-in mailer / redirect list is not needed.
//      (When Supabase gives no hashed_token, its own action_link is sent instead.)
// Rate limits: 3 requests per e-mail and 10 per IP address per hour (kept in memory and in gc_kv
// "gc_pwreset_limits" as keyed hashes only — never the e-mail or the address itself). Over the limit: the same
// neutral answer, nothing sent.
// Nothing here ever sees or stores a password. Data-entry mode (patch PAUSE) still lets this staff security
// e-mail out when the address is @grayco-cs.com, like every other staff alert.

require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');

const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const NEUTRAL = 'If that e-mail is on the team, a reset link is on its way. It can take a few minutes — check spam too. Nothing came? Ask Wesley or Nick (💎 → 🔐 Team access).';
const KV_KEY = 'gc_pwreset_limits';
const HOUR = 3600e3;
const LIMIT_EMAIL = 3, LIMIT_IP = 10;
const MIN_MS = 900;   /* every answer takes about as long, sent or not */

function s(v){ return v == null ? '' : String(v); }
function hdr(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? s(h[k]) : '';
}
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
}
function sbUrl(){ return s(process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function svcHeaders(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function crmUrl(){
  let u = s(process.env.CRM_URL || 'https://crm.grayco-cs.com/').trim();
  if (!/^https:\/\//i.test(u)) u = 'https://crm.grayco-cs.com/';
  return u.replace(/\/*$/, '/');
}
function cleanEmail(e){ return s(e).trim().toLowerCase(); }
function okEmail(e){ return e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function ipOf(event){ return s(hdr(event, 'x-nf-client-connection-ip') || hdr(event, 'x-forwarded-for').split(',')[0] || hdr(event, 'client-ip') || 'unknown').trim(); }
/* a keyed hash: the e-mail / address cannot be read back from gc_kv */
function hk(kind, v){ return kind + ':' + crypto.createHmac('sha256', 'gc-pwreset|' + svcKey()).update(s(v)).digest('hex').slice(0, 32); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
const wait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };

/* ── rate limit: memory (this warm instance) + gc_kv (every instance) ─────── */
const mem = new Map();
function prune(list, t){ return (Array.isArray(list) ? list : []).filter(function(x){ return typeof x === 'number' && t - x < HOUR; }); }
async function kvRead(){
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + KV_KEY, { headers: svcHeaders() });
    if (!r.ok) return {};
    const rows = await r.json();
    let v = Array.isArray(rows) && rows[0] ? rows[0].value : null;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) { return {}; }
}
async function kvWrite(v){
  try {
    await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ key: KV_KEY, value: v, updated_at: new Date().toISOString() }) });
  } catch (e) {}
}
/* counts this request; true = over the limit (nothing is sent) */
async function overLimit(email, ip){
  const t = Date.now(), ke = hk('e', email), ki = hk('i', ip);
  const kv = await kvRead(), out = {};
  Object.keys(kv).forEach(function(k){ const l = prune(kv[k], t); if (l.length) out[k] = l; });
  [ke, ki].forEach(function(k){ const m = prune(mem.get(k), t); const l = prune(out[k], t); out[k] = (m.length > l.length ? m : l); });
  const over = out[ke].length >= LIMIT_EMAIL || out[ki].length >= LIMIT_IP;
  if (!over) { out[ke].push(t); out[ki].push(t); }
  mem.set(ke, out[ke].slice()); mem.set(ki, out[ki].slice());
  if (mem.size > 5000) mem.delete(mem.keys().next().value);
  await kvWrite(out);
  return over;
}

/* ── who may get a link: on gc_staff and active ─────────────────────────────── */
async function activeStaff(email){
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=*&email=eq.' + encodeURIComponent(email), { headers: svcHeaders() });
    if (!r.ok) return null;
    const rows = await r.json();
    const row = Array.isArray(rows) && rows[0];
    if (!row) return null;
    const mkt = row.active === false && row.mkt_active === true && s(row.profile).toLowerCase() === 'marketing';   /* patch MM */
    return (row.active !== false || mkt) ? row : null;
  } catch (e) { return null; }
}

async function makeLink(email){
  const r = await fetch(sbUrl() + '/auth/v1/admin/generate_link', { method: 'POST', headers: svcHeaders(),
    body: JSON.stringify({ type: 'recovery', email: email, redirect_to: crmUrl() }) });
  if (!r.ok) return null;
  const j = await r.json().catch(function(){ return {}; });
  const p = (j && j.properties) || j || {};
  const th = s(p.hashed_token || j.hashed_token);
  if (th) return crmUrl() + '#token_hash=' + encodeURIComponent(th) + '&type=recovery';
  const al = s(p.action_link || j.action_link);
  return /^https:\/\//i.test(al) ? al : null;
}

function mailHtml(name, link){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;color:#0f172a;line-height:1.5">'
    + '<div style="font-size:22px;font-weight:800;color:#0f2440">GrayCo</div>'
    + '<p>Hi' + (name ? ' ' + esc(name) : '') + ',</p>'
    + '<p>Someone (we hope you) asked to reset your GrayCo CRM password. Click the button to choose a new one. The link works once and only for a short time (about an hour).</p>'
    + '<p><a href="' + esc(link) + '" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">Choose a new password</a></p>'
    + '<p style="font-size:12px;color:#475569">Or paste this into your browser: <br><span style="word-break:break-all">' + esc(link) + '</span></p>'
    + '<p style="font-size:12px;color:#475569">Did not ask for this? Ignore this e-mail — your password stays as it is. Tell Wesley or Nick if it keeps happening.</p>'
    + '</div>';
}
async function sendMail(email, name, link){
  const key = s(process.env.RESEND_API_KEY);
  if (!key) { console.log('[password-reset] RESEND_API_KEY is not set — no reset e-mail sent'); return false; }
  let subject = 'Reset your GrayCo CRM password';
  try { subject = require('./_lib/mailtag.js').tag(subject, email, 'area:Security'); } catch (e) {}
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: [email], subject: subject, html: mailHtml(name, link),
        text: 'Choose a new GrayCo CRM password (the link works once, for about an hour):\n' + link + '\n\nDid not ask for this? Ignore this e-mail.' }) });
    return r.ok;
  } catch (e) { return false; }
}

async function handle(event){
  const email = cleanEmail(event.__body.email);
  if (!okEmail(email)) return 'bad';
  if (!svcKey()) { console.log('[password-reset] SUPABASE_SERVICE_KEY is not set'); return 'done'; }
  if (await overLimit(email, ipOf(event))) { console.log('[password-reset] over the hourly limit — nothing sent'); return 'done'; }
  const row = await activeStaff(email);
  if (!row) return 'done';
  const link = await makeLink(email);
  if (!link) { console.log('[password-reset] Supabase did not give a recovery link'); return 'done'; }
  const sent = await sendMail(email, s(row.name).split(' ')[0], link);
  console.log('[password-reset] reset e-mail ' + (sent ? 'sent' : 'NOT sent (Resend refused)'));
  return 'done';
}

exports.handler = async function (event) {
  const headers = cors(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const t0 = Date.now();
  let res = 'done';
  try { res = await handle(Object.assign({}, event, { __body: body })); } catch (e) { console.log('[password-reset] error: ' + s(e && e.message).slice(0, 200)); }
  if (res === 'bad') return { statusCode: 400, headers, body: JSON.stringify({ error: 'Enter your work e-mail address.' }) };
  const left = (exports._minMs == null ? MIN_MS : exports._minMs) - (Date.now() - t0);
  if (left > 0) await wait(left + Math.floor(Math.random() * 200));
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: NEUTRAL }) };
};
exports._test = { NEUTRAL, hk, mem, crmUrl, LIMIT_EMAIL, LIMIT_IP };
