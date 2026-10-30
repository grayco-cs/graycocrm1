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

// netlify/functions/agency.js — the marketing AGENCY portal (patch AGY; page: agency.html at crm.grayco-cs.com/agency).
//   Public:   POST { op:'link', email }   → e-mails a sign-in link to an agency member (same answer for anyone)
//             POST { op:'exchange', k }   → the link from the e-mail → a 14-day session { session, email }
//   Signed in (header x-agency-session: <session>, or the CRM sign-in: Authorization: Bearer <token>):
//             POST { op:'me' } · { op:'dashboard', months } · { op:'plan' } · { op:'plan_save', item } · { op:'spend' }
//             { op:'spend_add', month, channel, amount, campaign, note } · { op:'spend_del', id } · { op:'calls' }
//             { op:'setup' } · { op:'notes' } · { op:'note_add', text } · { op:'report_preview', month }
//   Admins:   { op:'members' } · { op:'member_save', email, name, company, active } · { op:'settings_save', … }
//             { op:'report_send', month } · { op:'log' }
// What each side may see and change: _lib/agency.js (top of the file).
'use strict';
require('./_lib/pause').install();   /* data-entry mode: every outbound send is checked here first */
const A = require('./_lib/agency.js');
function s(v){ return v == null ? '' : String(v).trim(); }
const HITS = new Map();
function limited(ip, key, max, ms){ const k = key + '|' + ip, now = Date.now(); const l = (HITS.get(k) || []).filter(function(t){ return now - t < ms; }); l.push(now); HITS.set(k, l); if (HITS.size > 5000) HITS.clear(); return l.length > max; }
function reply(code, headers, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; }

exports.handler = async function(event){
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS', 'x-agency-session'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  const ip = s(gcHeader(event, 'x-nf-client-connection-ip') || gcHeader(event, 'client-ip') || s(gcHeader(event, 'x-forwarded-for')).split(',')[0]) || 'x';
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const op = s(b.op);
  try {
    if (op === 'link') {
      if (s(b.website)) return reply(200, headers, { ok: true, message: 'If that address is on the GrayCo marketing team, the link is on its way.' });
      if (limited(ip, 'link', 5, 3600e3)) return reply(429, headers, { ok: false, error: 'Too many tries — wait an hour or call (901) 585-0944.' });
      const r = await A.sendLink(b.email);
      if (r.ok === false) return reply(503, headers, r);
      return reply(200, headers, { ok: true, message: 'If that address is on the GrayCo marketing team, the link is on its way. Check your inbox (and spam).' });
    }
    if (op === 'exchange') {
      if (limited(ip, 'ex', 20, 3600e3)) return reply(429, headers, { ok: false, error: 'Too many tries.' });
      const x = A.exchange(b.k);
      if (!x) return reply(401, headers, { ok: false, expired: true, error: 'This sign-in link has expired — ask for a new one.' });
      const v = await A.read(); if (!A.memberOf(v, x.email)) return reply(403, headers, { ok: false, error: 'This address is not on the GrayCo marketing team any more.' });
      return reply(200, headers, Object.assign({ ok: true }, x));
    }

    /* who is asking */
    let who = null;
    const sess = gcHeader(event, 'x-agency-session');
    if (sess) who = await A.whoFromSession(sess);
    else if (gcHeader(event, 'authorization')) {
      const st = await gcStaffAuth(event);
      if (!st.ok) return reply(st.statusCode, headers, { ok: false, error: st.error });
      let data = {}; try { data = await require('./_lib/mkt.js').crmData(['users']); } catch (e) {}
      const role = require('./_lib/mkt.js').roleOf(st, data);
      who = { kind: 'staff', email: st.email, name: st.name || st.email, company: 'GrayCo', admin: role === 'admin', role: role };
    }
    if (!who) return reply(401, headers, { ok: false, signin: true, error: 'Please sign in.' });
    if (limited(who.email, 'op', 240, 600e3)) return reply(429, headers, { ok: false, error: 'Too many requests — slow down a little.' });
    const v = await A.read();

    if (op === 'me') return reply(200, headers, { ok: true, who: who, settings: v.settings, channels: A.CHANNEL_CHOICES, statuses: A.STATUSES, owners: A.OWNERS, lastReport: v.lastReport || null });
    if (op === 'dashboard') {
      const months = [3, 6, 12, 24].indexOf(+b.months) >= 0 ? +b.months : 12;
      const S = await A.summary({ months: months });
      return reply(200, headers, { ok: true, summary: A.share(S.sum, who.admin ? { shareRevenue: true, shareProfit: true } : v.settings, months) });
    }
    if (op === 'plan') { const doc = await require('./_lib/mkt.js').readDoc(); const sig = await A.setup(v, doc); return reply(200, headers, { ok: true, plan: A.planList(v, sig) }); }
    if (op === 'plan_save') { let r; await A.change(function(v2){ r = A.savePlan(v2, who, b.item || {}); return r.ok ? undefined : false; }); return reply(r.ok ? 200 : 400, headers, r); }
    if (op === 'spend') { const S = await require('./_lib/mkt.js').readDoc(); const list = Object.keys(S.spend || {}).map(function(k){ return S.spend[k]; }).filter(function(x){ return x && !x.del; }); return reply(200, headers, { ok: true, spend: A.spendView(list, who) }); }
    if (op === 'spend_add') { const r = await A.addSpend(who, b); return reply(r.ok ? 200 : 400, headers, r); }
    if (op === 'spend_del') { const r = await A.delSpend(who, b.id); return reply(r.ok ? 200 : 400, headers, r); }
    if (op === 'calls') return reply(200, headers, { ok: true, calls: await A.callList() });
    if (op === 'setup') { const doc = await require('./_lib/mkt.js').readDoc(); return reply(200, headers, { ok: true, setup: await A.setup(v, doc) }); }
    if (op === 'notes') return reply(200, headers, { ok: true, notes: v.notes.slice(-200) });
    if (op === 'note_add') { if (limited(who.email, 'note', 20, 3600e3)) return reply(429, headers, { ok: false, error: 'That is a lot of notes in an hour — try again later.' }); const r = await A.addNote(who, b.text); return reply(r.ok ? 200 : 400, headers, r); }
    if (op === 'report_preview') { const r = await A.report({ month: b.month }); return reply(200, headers, { ok: true, month: r.month, subject: r.subject, html: r.html }); }

    if (!who.admin) return reply(403, headers, { ok: false, error: 'Only a GrayCo admin can do that.' });
    if (op === 'members') return reply(200, headers, { ok: true, members: A.memberList(v), settings: v.settings });
    if (op === 'member_save') { let r; await A.change(function(v2){ r = A.saveMember(v2, who, b); return r.ok ? undefined : false; }); return reply(r.ok ? 200 : 400, headers, r); }
    if (op === 'settings_save') { let r; await A.change(function(v2){ r = A.saveSettings(v2, who, b); }); return reply(200, headers, r); }
    if (op === 'report_send') { const r = await A.sendReport({ month: b.month, all: true }); return reply(r.ok ? 200 : 502, headers, Object.assign(r, r.ok ? {} : { error: 'The e-mail did not go out (RESEND_API_KEY?).' })); }
    if (op === 'log') return reply(200, headers, { ok: true, log: v.log.slice(-200).reverse() });
    return reply(400, headers, { ok: false, error: 'Unknown request' });
  } catch (e) { return reply(500, headers, { ok: false, error: 'The marketing portal hit a problem: ' + String(e && e.message || e).slice(0, 200) }); }
};
exports._test = { limited: limited, reset: function(){ HITS.clear(); } };
