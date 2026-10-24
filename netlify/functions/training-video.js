// GrayCo CRM — the built-in 🎓 Training videos, for signed-in staff only (patch TRAIN2)
// The videos are NOT on the public site any more: they ship with this function (netlify.toml included_files:
// the .mp4 files in netlify/functions/_assets/training/, and everything under /netlify/ answers 404 on the site).
//   POST ?op=sign           (the CRM, signed in: Authorization: Bearer <Supabase token>, added by the CRM's fetch)
//        → checks the staff sign-in (the same check as every staff function) → { ok, exp, urls: { '01': '/.netlify/functions/training-video?v=01&t=…' } }
//        Each link carries a token signed here (HMAC-SHA256, key derived from SUPABASE_SERVICE_KEY) naming the person
//        and an expiry 4 hours out, so a <video> element (which cannot send headers) can play it.
//   GET / HEAD ?v=01&t=…    → the mp4, with Range support (206 + Content-Range) so seeking works; at most 4 MB per answer
//        (a function answer is limited to 6 MB). No / bad / expired token → 401. Unknown video → 404.
//        Cache-Control: private, max-age=14400 — the browser keeps it; nothing in between does.
require('./_lib/pause').install();   // patch PAUSE: data-entry mode — every outbound send is checked here first
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const TTL_MS = 4 * 60 * 60 * 1000;
const CHUNK = 4 * 1024 * 1024;

/* ── GrayCo staff check (security build) — kept inline in every function on purpose: each function is bundled alone ── */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
function gcCors(event, methods){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(s){ return s.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range', 'Access-Control-Allow-Methods': methods || 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges' };
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
  let role = null, listed = false;
  if (svc) {
    try {
      const r = await fetch(url + '/rest/v1/gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email),
        { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
      if (r.ok) {
        listed = true;
        const rows = await r.json();
        const row = Array.isArray(rows) && rows[0];
        if (row && row.active !== false) role = String(row.role || 'staff').toLowerCase();
      }
    } catch (e) {}
  }
  if (!listed) {
    const env = (process.env.STAFF_EMAILS || '').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
    if (env.indexOf(email) > -1) role = 'staff';
  }
  if (!role) return { ok: false, statusCode: 403, error: 'This account (' + email + ') is not on the GrayCo staff list.' };
  return { ok: true, email: email, role: role };
}
/* ── end GrayCo staff check ── */

/* the videos that ship with this function */
function videoDir(){
  const cands = [
    path.join(__dirname, '_assets', 'training'),
    path.resolve(process.env.LAMBDA_TASK_ROOT || process.cwd(), 'netlify', 'functions', '_assets', 'training'),
    path.resolve(__dirname, '..', '..', 'netlify', 'functions', '_assets', 'training'),
    path.resolve(process.cwd(), 'netlify', 'functions', '_assets', 'training')
  ];
  if (process.env.GC_TRAINING_DIR) cands.unshift(process.env.GC_TRAINING_DIR);
  for (const d of cands) { try { if (fs.statSync(d).isDirectory()) return d; } catch (e) {} }
  return null;
}
function listVideos(){
  const d = videoDir(); if (!d) return {};
  const out = {};
  fs.readdirSync(d).filter(function(f){ return /^\d\d-[a-z0-9-]+\.mp4$/.test(f); }).forEach(function(f){ out[f.slice(0, 2)] = path.join(d, f); });
  return out;
}

/* the signed link */
function key(){
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return svc ? crypto.createHash('sha256').update('grayco-training-video:v1:' + svc).digest() : null;
}
const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
function sign(email, now){
  const k = key(); if (!k) return '';
  const payload = b64u(JSON.stringify({ e: email, x: (now || Date.now()) + TTL_MS }));
  return payload + '.' + b64u(crypto.createHmac('sha256', k).update(payload).digest());
}
function check(t, now){
  const k = key(), parts = String(t || '').split('.');
  if (!k || parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, why: 'missing' };
  const want = crypto.createHmac('sha256', k).update(parts[0]).digest(), got = unb64u(parts[1]);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return { ok: false, why: 'bad' };
  let p = null; try { p = JSON.parse(unb64u(parts[0]).toString('utf8')); } catch (e) {}
  if (!p || !p.e || !p.x) return { ok: false, why: 'bad' };
  if (Number(p.x) < (now || Date.now())) return { ok: false, why: 'expired' };
  return { ok: true, email: String(p.e) };
}

function json(code, obj, cors){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors || {}), body: JSON.stringify(obj) }; }
function text(code, msg, cors){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, cors || {}), body: msg }; }

exports.handler = async function(event){
  const cors = gcCors(event);
  const method = String(event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const q = event.queryStringParameters || {};

  if (q.op === 'sign') {
    if (method !== 'POST') return json(405, { ok: false, error: 'POST only' }, cors);
    const who = await gcStaffAuth(event);
    if (!who.ok) return json(who.statusCode, { ok: false, error: who.error }, cors);
    const now = Date.now(), t = sign(who.email, now);
    if (!t) return json(503, { ok: false, error: 'The training videos are not set up on the server (SUPABASE_SERVICE_KEY is missing).' }, cors);
    const urls = {};
    Object.keys(listVideos()).sort().forEach(function(id){ urls[id] = '/.netlify/functions/training-video?v=' + id + '&t=' + encodeURIComponent(t); });
    return json(200, { ok: true, exp: now + TTL_MS, urls: urls }, cors);
  }

  if (method !== 'GET' && method !== 'HEAD') return text(405, 'GET only', cors);
  const tok = check(q.t);
  if (!tok.ok) return text(401, tok.why === 'expired' ? 'This video link has expired. Reopen the Training tab in the CRM.' : 'Sign in to the GrayCo CRM to watch the training videos.', cors);
  const file = listVideos()[String(q.v || '')];
  if (!file) return text(404, 'No such training video.', cors);
  let size = 0; try { size = fs.statSync(file).size; } catch (e) { return text(404, 'No such training video.', cors); }
  const base = Object.assign({ 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=14400', 'X-Content-Type-Options': 'nosniff' }, cors);
  const range = gcHeader(event, 'range');
  let start = 0, end = size - 1, partial = false;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === '' && m[2] === '')) return { statusCode: 416, headers: Object.assign({}, base, { 'Content-Range': 'bytes */' + size }), body: '' };
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
    else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
    if (start >= size || start > end) return { statusCode: 416, headers: Object.assign({}, base, { 'Content-Range': 'bytes */' + size }), body: '' };
    partial = true;
  }
  if (end - start + 1 > CHUNK) { end = start + CHUNK - 1; partial = true; }
  const len = end - start + 1;
  const headers = Object.assign({}, base, { 'Content-Length': String(len) });
  if (partial) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  if (method === 'HEAD') return { statusCode: partial ? 206 : 200, headers: headers, body: '' };
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, buf, 0, len, start); } finally { fs.closeSync(fd); }
  return { statusCode: partial ? 206 : 200, headers: headers, body: buf.toString('base64'), isBase64Encoded: true };
};
exports._t = { sign: sign, check: check, listVideos: listVideos, videoDir: videoDir };
