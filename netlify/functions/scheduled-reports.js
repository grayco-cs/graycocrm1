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

// ── patch AUTOC 6: THE WEEKLY OWNER REPORT (owner 10/29 "20 yes") ──────────────────────────────────────────────
// Netlify Scheduled Function (netlify.toml): Mondays at 12:05 and 13:05 UTC; only the run that is 7 AM in Memphis sends
// (daylight saving or not), and each week is sent once (gc_lead_inbox_kv "gc_owner_weekly"). To: OWNER_EMAILS (Wesley,
// Nick) + WEEKLY_REPORT_TO (GrayCo addresses only). What is in it: _lib/ownerweekly.js. The earlier hand-run report
// (never scheduled) is replaced by this one.
//   GET  ?view=1  → admins: { ok, html, week } — last week's report, built now (Admin → 📊 Weekly owner report)
//   POST ?send=1  → admins: build and e-mail it now (does not count as the Monday send)
const OW = require('./_lib/ownerweekly.js');
const STATE = 'gc_owner_weekly';
function L(){ return require('./bid-inbox.js')._lib; }
function centralHM(d){ const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(d).forEach(function(x){ o[x.type] = x.value; }); return { wd: o.weekday, hour: parseInt(o.hour, 10) % 24 }; }
async function scheduled(nowMs){
  const c = centralHM(new Date(nowMs));
  if (c.wd !== 'Mon' || c.hour !== 7) return { notNow: true };
  if (String(process.env.OWNER_WEEKLY_OFF || '') === '1') return { off: true };
  const m = OW.build(await OW.load(), nowMs), week = m.week.from;
  let mine = false;
  await L().kvCas(STATE, function(v){ const st = v && typeof v === 'object' ? v : {}; if (st.week === week && (st.ok || (Date.now() - Date.parse(st.at || 0)) < 30 * 60e3)) return undefined; mine = true; return Object.assign({}, st, { week: week, at: new Date().toISOString(), ok: false }); });
  if (!mine) return { already: week };
  const r = await OW.send(m, OW.html(m, { site: process.env.CRM_URL }));
  await L().kvCas(STATE, function(v){ const st = v && typeof v === 'object' ? v : {}; return Object.assign({}, st, { week: week, at: new Date().toISOString(), ok: !!r.ok, to: r.to || [], why: r.why || '' }); }).catch(function(){});
  return { week: week, sent: !!r.ok, why: r.why || '' };
}
exports.handler = async function(event) {
  event = event || {};
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) {}
  if (b.next_run) {   /* Netlify's scheduled call */
    let r; try { r = await scheduled(exports._now ? exports._now() : Date.now()); } catch (e) { r = { error: String(e && e.message || e) }; }
    try { console.log('[owner-weekly]', JSON.stringify(r).slice(0, 300)); } catch (e) {}
    return { statusCode: 200, body: JSON.stringify(r) };
  }
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const who = await gcStaffAuth(event);
  if (!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ ok: false, error: who.error }) };
  if (who.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  const qs = event.queryStringParameters || {};
  try {
    const m = OW.build(await OW.load(), Date.now()), page = OW.html(m, { site: process.env.CRM_URL });
    if (qs.send && event.httpMethod === 'POST') { const r = await OW.send(m, page); return { statusCode: 200, headers, body: JSON.stringify({ ok: !!r.ok, to: r.to || [], why: r.why || '', week: m.week }) }; }
    let last = null; try { last = await L().kvGet(STATE); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, html: page, week: m.week, model: m, lastSent: last }) };
  } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) }; }
};
exports._test = { scheduled: scheduled, centralHM: centralHM };
