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

// netlify/functions/soc.js — GrayCo 📣 Marketing, part 3 (patch SOC): TikTok + LinkedIn, the 3-a-week plan, the media
// library's server data, listings, the approval stage. Server: _lib/soc.js + _lib/soc-content.js.
//   GET  ?callback=1&code&state                 → the TikTok / LinkedIn sign-in comes back here (signed state, 15 minutes)
//   GET  ?media=<signed token>                  → one marketing picture for TikTok to pull (signed, one day)
//   POST { op:'status' }                        → connected yes / no per platform (never a token), the stage, the hint
//   POST { op:'connect'|'disconnect', platform } admin → TikTok / LinkedIn sign-in link / forget the tokens
//   POST { op:'plan_week', week, replace }      office / admin → plan the Mon / Wed / Fri posts now (goes to Approvals)
//   POST { op:'swap', id, type, service }       office / admin → another post for that day
//   POST { op:'rewrite', id }                   office / admin → the per-platform versions written again
//   POST { op:'set_stage', stage, note }        admin → the approval stage (logged)
//   POST { op:'library' }                       staff → the AI photo tags + the approved testimonials (with the customer's OK)
//   POST { op:'listings_sync' }                 office / admin → BrightLocal (dormant without its keys)
// Signed-in GrayCo staff only (the two GETs are signed links). Nothing goes public from here: posts wait on ✅ Approvals.
'use strict';
const S = require('./_lib/soc.js');
const SC = require('./_lib/soc-content.js');
const M = require('./_lib/mkt.js');
function reply(code, headers, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; }
function page(title, msg, ok){
  return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head>' +
      '<body style="font-family:Arial,sans-serif;background:#F5F7FB;margin:0;padding:40px 16px"><div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #dce3ee;border-radius:12px;padding:22px">' +
      '<h2 style="color:' + (ok ? '#166534' : '#9a3412') + ';margin-top:0">' + (ok ? '✓ ' : '') + title + '</h2><p>' + String(msg).replace(/[<>&]/g, '') + '</p>' +
      '<p><a href="/" style="color:#1E2060;font-weight:bold">Back to the GrayCo CRM → Marketing → 🔌 Connections</a></p></div></body></html>' };
}
async function mediaReply(tok){
  const o = S.readMediaToken(tok); if (!o) return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: 'expired' };
  const url = await M.signRef(o.r, 600); if (!url) return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'not found' };
  const r = await fetch(url); if (!r.ok) return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'not found' };
  const ct = String(r.headers.get('content-type') || 'image/jpeg').split(';')[0];
  if (!/^(image|video)\//.test(ct)) return { statusCode: 415, headers: { 'Content-Type': 'text/plain' }, body: 'not media' };
  const b = Buffer.from(await r.arrayBuffer());
  return { statusCode: 200, headers: { 'Content-Type': ct, 'Cache-Control': 'private, max-age=600' }, body: b.toString('base64'), isBase64Encoded: true };
}
exports.handler = async function(event){
  const q = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && q.callback === '1') {
    try { const r = await S.callback(q); return r.ok ? page(r.platform + ' is connected', 'Approved posts go out on it at their time. You can close this tab.', true) : page('Not connected', r.error, false); }
    catch (e) { return page('Not connected', String(e && e.message || e).slice(0, 200), false); }
  }
  if (event.httpMethod === 'GET' && q.media) { try { return await mediaReply(String(q.media)); } catch (e) { return { statusCode: 500, headers: { 'Content-Type': 'text/plain' }, body: 'error' }; } }
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  const who = await gcStaffAuth(event);
  if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const op = String(body.op || '');
  let data = {}; try { data = await M.crmData(['users']); } catch (e) {}
  const role = M.roleOf(who, data), admin = role === 'admin', office = admin || role === 'office';
  try {
    if (op === 'status') {
      const st = await S.status(), doc = await M.readDoc(), sc = SC.stageCfg(M._cfg(doc));
      return reply(200, headers, { ok: true, role: role, platforms: st, stage: sc.stage, since: sc.since, flags: sc.flags, known: sc.known.length, hint: admin ? await S.stageHint(doc, data) : null, redirect: S.redirectUri() });
    }
    if (op === 'library') {
      const d = await M.crmData(['gc_photo_ai']); const map = (d.gc_photo_ai && d.gc_photo_ai.map) || {}, tags = {};
      Object.keys(map).slice(-4000).forEach(function(k){ const t = map[k] || {}; tags[k] = { stage: t.stage || '', materials: (t.materials || []).slice(0, 4), area: t.area || '' }; });
      let testi = []; try { testi = (await require('./bid-inbox.js')._lib.kvGet('gc_x10_testimonials')) || []; } catch (e) {}
      testi = (Array.isArray(testi) ? testi : (testi.list || [])).filter(function(t){ return t && !t.deleted && t.permission === true && t.status === 'approved'; })
        .map(function(t){ return { id: t.id, pid: t.pid, first: String(t.name || '').split(/\s+/)[0], city: t.city, text: t.text, video: t.video && t.video.ref ? t.video.ref : '', at: t.at }; });
      return reply(200, headers, { ok: true, tags: tags, testimonials: testi });
    }
    if (!office) return reply(403, headers, { ok: false, error: 'The office or an admin does that.' });
    if (op === 'plan_week') return reply(200, headers, await S.planWeek({ week: body.week || 'next', replace: body.replace === true, by: who.name || who.email }));
    if (op === 'swap') return reply(200, headers, await S.swapPost(String(body.id || ''), String(body.type || ''), String(body.service || ''), who.email));
    if (op === 'rewrite') return reply(200, headers, await S.readapt(String(body.id || '')));
    if (op === 'listings_sync') return reply(200, headers, await S.listingsSync(who.email));
    if (!admin) return reply(403, headers, { ok: false, error: 'Only an admin does that.' });
    if (op === 'connect') { const u = S.authUrl(String(body.platform || ''), who.email); return reply(u ? 200 : 400, headers, u ? { ok: true, url: u } : { ok: false, error: 'Not set up on Netlify yet — see the steps in 🔌 Connections.' }); }
    if (op === 'disconnect') { await S.forget(String(body.platform || '')); return reply(200, headers, { ok: true }); }
    if (op === 'set_stage') return reply(200, headers, await S.setStage(body.stage, { email: who.email, name: who.name }, body.note));
    return reply(400, headers, { ok: false, error: 'Unknown op' });
  } catch (e) { return reply(500, headers, { ok: false, error: 'Marketing hit a problem: ' + String(e && e.message || e).slice(0, 160) }); }
};
