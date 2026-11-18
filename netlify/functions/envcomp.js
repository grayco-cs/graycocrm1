// netlify/functions/envcomp.js — ENVCOMP: the private medical & exposure records (owner 11/16). The rules: _lib/envcomp.js.
//   POST { op: 'mine', open }                  the signed-in worker's OWN records (open: true stamps "seen" on every new result)
//   POST { op: 'status' }                      anyone on staff: current / due / over per person and job kind (no dates, no results)
//   POST { op: 'person' | 'all' | 'removals' } admins + the Office Manager (gc_staff.payroll) only
//   POST { op: 'add', email, cat: 'visit' | 'exposure' | 'removal', rec }   visit: the worker or admins / Office Manager; exposure: any
//        staff may add one (the person taking the sample) but never read someone else's; removal: admins / Office Manager
//   POST { op: 'update' | 'due' }              admins / Office Manager;  { op: 'appt' } the worker or admins / Office Manager
// The records live in the table gc_medical (docs/envcomp-medical.sql: no browser may read it). Nothing is ever deleted here.
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
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
/* the Office Manager = the payroll grant (gc_staff.payroll), like the pay stubs; admins always */
async function canPayroll(who){
  if (require('./_lib/staff-role.js').isAdmin(who)) return true;
  if (!svcKey()) return false;
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=payroll,active&email=eq.' + encodeURIComponent(who.email), { headers: { apikey: svcKey(), Authorization: 'Bearer ' + svcKey() } });
    if (!r.ok) return false;
    const rows = await r.json(); const row = Array.isArray(rows) && rows[0];
    return !!(row && row.active !== false && row.payroll === true);
  } catch (e) { return false; }
}
exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, gcCors(event, 'POST, OPTIONS'));
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'POST only.' }) };
  const auth = await gcStaffAuth(event);
  if (!auth.ok) return { statusCode: auth.statusCode, headers, body: JSON.stringify({ ok: false, error: auth.error }) };
  let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Bad request.' }) }; }
  const who = { email: auth.email, name: auth.name || auth.email, priv: await canPayroll(auth), admin: require('./_lib/staff-role.js').isAdmin(auth) };
  try {
    const r = await require('./_lib/envcomp.js').medOp(who, body);
    return { statusCode: r.code, headers, body: JSON.stringify(r.out) };
  } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) }; }
};
