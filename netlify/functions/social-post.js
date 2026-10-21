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

// netlify/functions/social-post.js — GrayCo direct posting (patch MKT): Facebook Page, Instagram Business, Google Business
// Profile — or every network through one Ayrshare key. ADMINS ONLY, and only a post an admin APPROVED (on the approvals
// list) is ever published; the address / insurance-carrier guard runs again right before it goes out.
// Keys: Netlify environment variables only (docs/SOCIAL-SETUP.md) — never in a file, never sent to the browser.
//   POST { op:'status' }            → { facebook, instagram, gbp, ayrshare } true / false
//   POST { op:'publish', postId }   → posts that approved post now (instead of waiting for its time)
//   POST { op:'insights' }          → refresh likes / reach / clicks of recent posts
'use strict';
const L = require('./_lib/mkt.js');
const S = require('./_lib/social.js');
function reply(code, headers, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; }
exports.handler = async function(event){
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  const who = await gcStaffAuth(event);
  if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  if (body.op === 'status') return reply(200, headers, Object.assign({ ok: true }, S.status()));
  let data = {}; try { data = await L.crmData(['users']); } catch (e) {}
  if (L.roleOf(who, data) !== 'admin') return reply(403, headers, { ok: false, error: 'Only Wesley or Nick can post for GrayCo.' });
  try {
    if (body.op === 'publish') {
      const doc = await L.readDoc(); const p = doc.posts && doc.posts[String(body.postId || '')];
      if (!p || p.del) return reply(404, headers, { ok: false, error: 'That post is not in the cloud yet.' });
      if (p.status !== 'approved' && p.status !== 'failed') return reply(409, headers, { ok: false, error: p.status === 'posted' ? 'Already posted.' : 'Approve it first (Approvals).' });
      if (p.status === 'failed') await L.update(function(d){ const r = d.posts[p.id]; r.status = 'approved'; return [['posts', p.id]]; });
      const r = await L.runDue({ budgetMs: 15000 });
      const after = (await L.readDoc()).posts[p.id];
      return reply(200, headers, { ok: after && after.status === 'posted', post: after, run: r });
    }
    if (body.op === 'insights') return reply(200, headers, { ok: true, updated: await L.refreshInsights() });
    return reply(400, headers, { ok: false, error: 'Unknown op' });
  } catch (e) { return reply(500, headers, { ok: false, error: 'Posting hit a problem: ' + String(e && e.message || e).slice(0, 160) }); }
};
