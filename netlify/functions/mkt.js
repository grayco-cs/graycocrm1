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

// netlify/functions/mkt.js — GrayCo 📣 Marketing (patch MKT): the tab's server calls.
//   POST { op:'status' }                         → which networks / e-mail are connected (true / false only), autopilot state
//   POST { op:'audience', aud }                  → how many customers a campaign would reach, how many are unsubscribed (skipped)
//   POST { op:'run' }                    admin   → send / post what is approved and due now (the 15-minute job does this too)
//   POST { op:'autopilot', force, forceWeek, forceMonth }  admin → draft this week's posts / this month's e-mail now
//   POST { op:'review_reply', id, text } office or admin → approve a Google review reply (posted when the Business Profile is connected)
//   POST { op:'insights' }               admin   → likes / reach / clicks for recent posts
//   POST { op:'sendlog', id }                    → the send log of one campaign (sent / unsubscribed-skipped / failed)
// Signed-in GrayCo staff only. Nothing customer-facing is sent from here without an approval on THE approvals list.
'use strict';
const L = require('./_lib/mkt.js');
function reply(code, headers, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; }
exports.handler = async function(event){
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  const who = await gcStaffAuth(event);
  if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const op = String(body.op || '');
  let data = {}; try { data = await L.crmData(['users']); } catch (e) {}
  const role = L.roleOf(who, data), admin = role === 'admin';
  try {
    if (op === 'status') {
      const st = require('./_lib/social.js').status();
      const doc = await L.readDoc(); const a = (doc.cfg && doc.cfg.main && doc.cfg.main.autopilot) || {};
      return reply(200, headers, { ok: true, role: role, social: st, email: !!process.env.RESEND_API_KEY, ai: !!process.env.ANTHROPIC_API_KEY, autopilot: !!a.on,
        leadKeys: Object.keys(process.env).filter(function(k){ return k.indexOf('LEAD_KEY_') === 0 && process.env[k]; }).map(function(k){ return k.slice(9); }) });
    }
    if (op === 'audience') {
      const d = await L.crmData(['customers', 'projects']);
      try { const a = await L.audienceFor({ aud: body.aud || { type: 'all' } }, d); return reply(200, headers, { ok: true, count: a.send.length, skipped: a.skipped.length }); }
      catch (e) { return reply(503, headers, { ok: false, setup: true, error: 'The GrayCo News unsubscribe list is not set up (docs/news-unsubscribe.sql).' }); }
    }
    if (op === 'sendlog') {
      const r = await fetch(((process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, '')) + '/rest/v1/gc_kv?select=value&key=eq.' + L.LOG_KEY, { headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY } });
      let v = r.ok ? ((await r.json())[0] || {}).value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
      const one = (v && v[String(body.id || '')]) || {};
      const rows = Object.keys(one).map(function(e){ return { email: admin || role === 'office' ? e : e.replace(/^(.).*(@.*)$/, '$1…$2'), st: one[e].st, at: one[e].at, err: one[e].err || '' }; });
      return reply(200, headers, { ok: true, rows: rows });
    }
    if (op === 'review_reply') { const a = await L.approveReply(String(body.id || ''), body.text, Object.assign({}, who, { role: role })); return reply(a.status, headers, a.out); }
    if (!admin) return reply(403, headers, { ok: false, error: 'Only Wesley or Nick can do that.' });
    if (op === 'run') return reply(200, headers, Object.assign({ ok: true }, await L.runDue({ budgetMs: 16000 })));
    if (op === 'autopilot') return reply(200, headers, Object.assign({ ok: true }, await L.autopilot({ force: body.force === true, forceWeek: body.forceWeek === true, forceMonth: body.forceMonth === true })));
    if (op === 'insights') return reply(200, headers, { ok: true, updated: await L.refreshInsights() });
    return reply(400, headers, { ok: false, error: 'Unknown op' });
  } catch (e) { return reply(500, headers, { ok: false, error: 'Marketing hit a problem: ' + String(e && e.message || e).slice(0, 160) }); }
};
