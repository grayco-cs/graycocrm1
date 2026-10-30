/* ============================================================================
   GrayCo — AI ASSIST FOR THE CRM.   netlify/functions/ai-assist.js   (patch X12)
   POST { action: 'extract', text, kind: 'lead'|'job', jobType }  → the visit note's fields (staff)
   GET  ?usage=1                                                  → photo-tag usage today (staff)
   POST { action: 'tag-now' }                                     → tag a batch of new photos now (admins)
   The AI key stays on the server (ANTHROPIC_API_KEY). Nothing is saved here: the CRM shows the fields for the
   person to check and edit, and saves them only when they press Save.
   ========================================================================== */
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
'use strict';
const X = require('./_lib/x12.js');
const PT = require('./_lib/phototag.js');
function J(event, code, b){ return { statusCode: code, headers: Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }), body: JSON.stringify(b) }; }
const PROMPT = 'Site-visit notes from a GrayCo Construction Services project manager (Bartlett, TN), dictated or typed. Record the facts with record_visit. Use only what the notes say; never invent a number. Quantities in the units said (squares, linear feet, sheets). Do not repeat any door, gate or lockbox code number.';
exports.handler = async function(event){
  if (event.httpMethod === 'OPTIONS') return J(event, 200, {});
  const who = await gcStaffAuth(event); if (!who.ok) return J(event, who.statusCode, { ok: false, error: who.error });
  const qs = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && qs.usage) return J(event, 200, Object.assign({ ok: true }, await PT.usage()));
  if (event.httpMethod !== 'POST') return J(event, 405, { ok: false, error: 'Method not allowed' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(event, 400, { ok: false, error: 'Body must be JSON.' }); }
  if (b.action === 'tag-now') {
    if (!require('./_lib/staff-role.js').isAdmin(who)) return J(event, 403, { ok: false, error: 'Only an admin can do that.' });
    return J(event, 200, Object.assign({ ok: true }, await PT.run({ limit: 8 })));
  }
  if (b.action === 'extract') {
    const text = String(b.text || '').trim().slice(0, 12000);
    if (text.length < 8) return J(event, 400, { ok: false, error: 'Type or say a few words about the visit first.' });
    if (!process.env.ANTHROPIC_API_KEY) return J(event, 503, { ok: false, error: 'The AI is not switched on (ANTHROPIC_API_KEY on Netlify). Your note is kept; fill the fields by hand.' });
    const r = await X.aiTool(X.EXTRACT_TOOL, [{ type: 'text', text: PROMPT + (b.jobType ? '\nJob type on file: ' + String(b.jobType).slice(0, 40) : '') + '\n\nNOTES:\n' + text }], { max: 2000 });
    if (!r.ok) return J(event, 502, { ok: false, error: 'The AI could not read it (' + r.why + '). Your note is kept; try again in a minute.' });
    return J(event, 200, { ok: true, fields: X.normExtract(r.input), model: r.model });
  }
  return J(event, 400, { ok: false, error: 'Unknown action.' });
};
exports._test = { X };
