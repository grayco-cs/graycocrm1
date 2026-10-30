// netlify/functions/automation-pause.js — patch PAUSE: "⏸ Data-entry mode" (owner 10/23).
//   GET            → { paused, why, flag:{ on, by, at, note, since } }   (any signed-in staff member; `paused` is what the
//                     guard in _lib/pause.js really does right now, including "fail closed" when the flag cannot be read)
//   POST { on, note } → admins only: turn data-entry mode on / off (gc_kv "gc_automation_pause"; every change is also
//                     added to gc_kv "gc_automation_pause_log").
// While it is on, _lib/pause.js (installed on the first line of every function) skips every send to a customer, a sub,
// a GC or the public — see the rule at the top of _lib/pause.js and docs/DATA-ENTRY-MODE.md.
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
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
  /* patch PAUSEFIX: a throw or a 5xx from the sign-in service is tried once more before giving up (and a 5xx is "could not
     reach", not "your sign-in expired"). */
  for (let attempt = 0; attempt < 2; attempt++) {
    let busy = false;
    try {
      const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
      if (r.ok) user = await r.json();
      else if (r.status >= 500 || r.status === 429) busy = true;
    } catch (e) { busy = true; }
    if (!busy) break;
    if (attempt === 1) return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service. Try again.' };
    await new Promise(function(res){ setTimeout(res, 400); });
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

function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function svcHeaders(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function parse(v){ if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } } return v; }
async function kvGet(key){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: svcHeaders() });
  if (!r.ok) throw new Error('gc_kv read answered ' + r.status);
  const rows = await r.json(); return rows && rows[0] ? parse(rows[0].value) : null;
}
async function kvPut(key, value){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST',
    headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error('gc_kv write answered ' + r.status);
}

exports.handler = async function(event){
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  const J = function(code, body){ return { statusCode: code, headers, body: JSON.stringify(body) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const who = await gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode, { error: who.error });
  const pause = require('./_lib/pause');
  if (event.httpMethod === 'GET') {
    pause.reset();
    const paused = await pause.isPaused({ fresh: true });
    let flag = null, readError = '';
    try { flag = await kvGet(pause.KEY); } catch (e) { readError = String(e && e.message || e); }
    return J(200, { paused: paused, why: pause.why(), flag: flag || { on: false }, readError: readError || undefined });
  }
  if (event.httpMethod !== 'POST') return J(405, { error: 'Method not allowed' });
  if (!require('./_lib/staff-role.js').isAdmin(who)) return J(403, { error: 'Only an admin can turn data-entry mode on or off.' });
  if (!svcKey()) return J(500, { error: 'SUPABASE_SERVICE_KEY is not set on Netlify.' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'Invalid JSON' }); }
  if (typeof body.on !== 'boolean') return J(400, { error: 'Send { on: true } or { on: false }.' });
  const now = new Date().toISOString();
  const flag = { on: body.on, by: who.email, byName: who.name || '', at: now, note: String(body.note || '').slice(0, 300) };
  try {
    let prev = null; try { prev = await kvGet(pause.KEY); } catch (e) {}
    if (body.on) flag.since = prev && prev.on && prev.since ? prev.since : now;
    else if (prev && prev.on) { flag.lastPause = { from: prev.since || prev.at, to: now }; }
    await kvPut(pause.KEY, flag);
    let log = []; try { log = (await kvGet('gc_automation_pause_log')) || []; } catch (e) {}
    if (!Array.isArray(log)) log = [];
    log.unshift({ on: flag.on, by: who.email, at: now, note: flag.note });
    await kvPut('gc_automation_pause_log', log.slice(0, 100));
  } catch (e) { return J(502, { error: 'Could not save: ' + String(e && e.message || e) }); }
  pause.reset();
  console.log('[pause] data-entry mode ' + (flag.on ? 'ON' : 'OFF') + ' by ' + who.email);
  return J(200, { ok: true, flag: flag });
};
