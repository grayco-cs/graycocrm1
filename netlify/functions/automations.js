// netlify/functions/automations.js — patch AUTOPANEL: ⚙ Admin → ⚡ Automations (owner 11/02: "make sure nothing is
// automatic in my CRM until I tell it to be auto").
//   GET                                → { settings:{key:bool}, row, held, log, admin }   (any signed-in staff member)
//   POST { set: { key: bool, … } }     → admins only: switch automations ON / OFF (gc_kv "gc_automations"; who / when kept
//                                        in its _log, newest first, 200 kept)
//   POST { op: 'before' }              → admins only: "Turn on everything I had before" (every key ON)
//   POST { op: 'defaults' }            → admins only: back to the defaults (safety / intake / sync / staff ON, the rest OFF)
//   POST { op: 'held', key, n, sample } → any staff: the page records "held: would have done N" for a page automation
//   POST { op: 'ran', key }            → any staff: the page records "last run" for a page automation
// The list and the rule are in _lib/automations.js (the page carries the same file).
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

const AUTO = require('./_lib/automations.js');
function s(v){ return v == null ? '' : String(v).trim(); }
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
function view(row, held, who){
  const r = AUTO.parse(row);
  return { ok: true, settings: AUTO.all(r), row: Object.keys(r).filter(function(k){ return k !== '_log'; }).reduce(function(o, k){ o[k] = r[k]; return o; }, {}),
    log: Array.isArray(r._log) ? r._log.slice(0, 50) : [], held: AUTO.parse(held), admin: require('./_lib/staff-role.js').isAdmin(who) };
}

exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  const J = function(code, body){ return { statusCode: code, headers, body: JSON.stringify(body) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const who = await gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode, { error: who.error });
  if (!svcKey()) return J(500, { error: 'SUPABASE_SERVICE_KEY is not set on Netlify.' });
  if (event.httpMethod === 'GET') {
    try { return J(200, view(await kvGet(AUTO.KEY), await kvGet(AUTO.HELD_KEY), who)); }
    catch (e) { return J(502, { error: 'Could not read the automations: ' + s(e && e.message) }); }
  }
  if (event.httpMethod !== 'POST') return J(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'Invalid JSON' }); }
  const now = new Date().toISOString();
  /* the page's own held / ran records (any staff; counts only, never a switch) */
  if (body.op === 'held' || body.op === 'ran') {
    /* one { key, n, sample } or a batch: items [{ key, n, sample }] (held) / keys [key] (ran) */
    const items = body.op === 'held' ? (Array.isArray(body.items) ? body.items : [{ key: body.key, n: body.n, sample: body.sample }]) : (Array.isArray(body.keys) ? body.keys : [body.key]).map(function(k){ return { key: k }; });
    const ok = items.filter(function(x){ return x && AUTO.BY[s(x.key)]; }).slice(0, 100);
    if (!ok.length) return J(400, { error: 'Unknown automation.' });
    try {
      let next = await kvGet(AUTO.HELD_KEY);
      ok.forEach(function(x){ next = body.op === 'held' ? AUTO.heldMerge(next, s(x.key), x.n == null ? null : +x.n || 0, Array.isArray(x.sample) ? x.sample : [], now) : AUTO.ranMerge(next, s(x.key), now); });
      await kvPut(AUTO.HELD_KEY, next);
      return J(200, { ok: true, n: ok.length });
    } catch (e) { return J(502, { error: 'Could not record it: ' + s(e && e.message) }); }
  }
  if (!require('./_lib/staff-role.js').isAdmin(who)) return J(403, { error: 'Only an admin can switch automations on or off.' });
  let changes = {};
  if (body.op === 'before') changes = AUTO.before();
  else if (body.op === 'defaults') changes = AUTO.defaults();
  else if (body.set && typeof body.set === 'object') {
    Object.keys(body.set).forEach(function(k){ if (AUTO.BY[k] && !AUTO.BY[k].fixed && typeof body.set[k] === 'boolean') changes[k] = body.set[k]; });
    if (!Object.keys(changes).length) return J(400, { error: 'Send { set: { <automation>: true | false } }.' });
  } else return J(400, { error: 'Send { set: { … } }, { op: "before" } or { op: "defaults" }.' });
  try {
    const row = AUTO.parse(await kvGet(AUTO.KEY)), held = AUTO.parse(await kvGet(AUTO.HELD_KEY));
    const log = Array.isArray(row._log) ? row._log : [];
    let heldChanged = false;
    Object.keys(changes).forEach(function(k){
      const was = AUTO.valueOf(row, k);
      row[k] = changes[k];
      if (was !== changes[k]) {
        log.unshift({ key: k, on: changes[k], by: who.email, byName: who.name || '', at: now, op: body.op || 'set' });
        if (held[k]) { held[k] = { n: 0, since: now, last: null, would: null, total: 0, sample: [], ran: held[k].ran || null }; heldChanged = true; }   /* "held N times since …" starts again */
      }
    });
    row._log = log.slice(0, 200);
    await kvPut(AUTO.KEY, row);
    if (heldChanged) await kvPut(AUTO.HELD_KEY, held);
    AUTO._t.reset();
    console.log('[automations] ' + who.email + ' ' + (body.op || 'set') + ' ' + JSON.stringify(changes).slice(0, 300));
    return J(200, view(row, held, who));
  } catch (e) { return J(502, { error: 'Could not save: ' + s(e && e.message) }); }
};
