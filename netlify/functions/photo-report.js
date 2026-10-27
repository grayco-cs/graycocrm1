// netlify/functions/photo-report.js
// GrayCo Photos (patch U2) — SHARE LINKS FOR PHOTO REPORTS.
//
// A PM picks photos on a job and taps "Copy share link". Anyone with the link (customer, sub,
// insurance adjuster) opens https://<site>/report.html#t=<code> — a read-only page with ONLY
// the photos that were picked. The code is 256 random bits, after the # (never in a log), and
// the link can be turned off at any time. Same approach as the customer portal (patch Q), in
// its OWN table, so a report link never opens the customer portal and the other way round.
//
// STAFF (signed in to the CRM + on gc_staff):
//   POST {action:'create', projectId, title, items:[{id}|{cc:1,t,f,at,tag,by}]} → {ok, id, url}
//   POST {action:'list',   projectId} → {ok, links:[{id,url,title,count,createdAt,revoked,lastViewedAt}]}
//   POST {action:'revoke', id}        → {ok}
// PUBLIC (only the link code, in the x-report-token header):
//   POST {action:'view'} → {ok, title, job:{name,address}, createdAt, photos:[{t,f,at,tag,by,note}]}
//   An unknown or turned-off code always gets the same "not active" answer. Rate limited.
// Data: table gc_photo_reports (docs/grayco-photos-setup.sql: RLS on, no policies — only this
// server, with the service key, can read it); photo records from gc_kv "gc_photos"; pictures
// from the private bucket crm-files as short-lived signed links.
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
        { headers: keyHeaders(svc) });
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
/* Supabase keys (as in portal.js): a classic service_role JWT goes as apikey AND Bearer; a new sb_secret_… key
   in apikey only. */
function isJwt(k){ return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(k || '')); }
function keyHeaders(k){ return isJwt(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }; }


const crypto = require('crypto');
const OFFICE_PHONE = '901-585-0944';
const NOT_ACTIVE = 'This link is not active. Please call GrayCo at ' + OFFICE_PHONE + '.';
const SIGN_SECS = 3600, MIN_FAIL_MS = 250, MAX_ITEMS = 300;
function s(v){ return v == null ? '' : String(v).trim(); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function arr(v){ return Array.isArray(v) ? v : []; }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function H(extra){ return Object.assign(keyHeaders(svcKey()), { 'Content-Type': 'application/json' }, extra || {}); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function httpsUrl(u){ const t = s(u); return /^https:\/\/[^\s"'<>]+$/i.test(t) ? t : ''; }
function firstName(v){ return s(v).split(/\s+/)[0] || ''; }
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
function newToken(){ return crypto.randomBytes(32).toString('base64url'); }
function baseUrl(event){
  const env = s(process.env.PORTAL_BASE_URL).replace(/\/$/, '');
  if (/^https:\/\//.test(env)) return env;
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event || {}, 'origin').replace(/\/$/, '');
  return allowed.indexOf(origin) > -1 ? origin : allowed[0];
}
function linkFor(event, token){ return baseUrl(event) + '/report.html#t=' + token; }

/* ── rate limit per address (per warm instance) ── */
const hits = new Map();
function ipOf(event){ return s(gcHeader(event, 'x-nf-client-connection-ip') || gcHeader(event, 'x-forwarded-for').split(',')[0] || 'unknown'); }
function limited(ip){ const now = Date.now(); let h = hits.get(ip); if (!h || now - h.start > 600e3) { h = { start: now, req: 0, bad: 0 }; hits.set(ip, h); } h.req++; if (hits.size > 5000) hits.delete(hits.keys().next().value); return h.req > 60 || h.bad >= 8; }
function noteBad(ip){ const h = hits.get(ip); if (h) h.bad++; }

/* ── the table ── */
function setupErr(){ const e = new Error('setup'); e.setup = true; return e; }
async function rowByToken(token){
  const r = await fetch(sbUrl() + '/rest/v1/gc_photo_reports?select=id,token,project_id,title,items,revoked,created_at,last_viewed_at&token=eq.' + encodeURIComponent(token), { headers: H() });
  if (!r.ok) return null;
  const rows = await r.json(); const row = Array.isArray(rows) && rows[0];
  if (!row || typeof row.token !== 'string') return null;
  const a = Buffer.from(row.token), b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return row;
}
async function photoRecords(){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.gc_photos', { headers: H() });
  if (!r.ok) throw new Error('gc_kv read ' + r.status);
  const rows = await r.json(); let v = Array.isArray(rows) && rows[0] ? rows[0].value : [];
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } }
  return arr(v);
}
function refPath(ref){ const m = /^sb:crm-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/.exec(s(ref)); return m ? m[1] : ''; }
async function sign(refs){
  const paths = Array.from(new Set(refs.map(refPath).filter(Boolean)));
  const out = {};
  for (let i = 0; i < paths.length; i += 100) {
    try {
      const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files', { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: SIGN_SECS, paths: paths.slice(i, i + 100) }) });
      if (!r.ok) continue;
      arr(await r.json()).forEach(function(x){ const u = s(x && (x.signedURL || x.signedUrl)); if (x && x.path && u && !x.error) out['sb:crm-files/' + x.path] = /^https:/.test(u) ? u : sbUrl() + '/storage/v1' + (u[0] === '/' ? '' : '/') + u; });
    } catch (e) {}
  }
  return out;
}
function cleanItems(items){
  return arr(items).slice(0, MAX_ITEMS).map(function(x){
    if (x && x.cc) { const t = httpsUrl(x.t), f = httpsUrl(x.f); return t && f ? { cc: 1, t: t, f: f, at: s(x.at).slice(0, 30), tag: clip(x.tag, 20), by: clip(firstName(x.by), 30) } : null; }
    const id = s(x && x.id); return /^[A-Za-z0-9_.:-]{1,80}$/.test(id) ? { id: id } : null;
  }).filter(Boolean);
}
async function viewOf(row, data){
  const recs = {}; arr(data.photos).forEach(function(r){ if (r && r.id) recs[r.id] = r; });
  const pid = s(row.project_id), chosen = [];
  arr(row.items).forEach(function(x){
    if (x.cc) { chosen.push({ t: x.t, f: x.f, at: x.at, tag: x.tag, by: x.by, note: '' }); return; }
    const r = recs[x.id];
    if (!r || r.deleted === true || s(r.jobId) !== pid) return;     /* deleted since, or not this job: left out */
    chosen.push({ ref: r.annotatedRef || r.ref, thumb: r.thumbRef || r.ref, at: s(r.at), tag: clip(r.tag, 20), by: clip(firstName(r.by), 30), note: clip(r.note, 500) });
  });
  const signed = await sign(chosen.reduce(function(a, c){ if (c.ref) a.push(c.ref, c.thumb); return a; }, []));
  const photos = chosen.map(function(c){
    if (!c.ref) return { t: c.t, f: c.f, at: c.at, tag: c.tag, by: c.by, note: c.note };
    const f = signed[c.ref], t = signed[c.thumb] || f; return f ? { t: t, f: f, at: c.at, tag: c.tag, by: c.by, note: c.note } : null;
  }).filter(Boolean);
  const p = data.project || {};
  return { ok: true, title: clip(row.title || 'Photo report', 80), createdAt: s(row.created_at).slice(0, 25), job: { name: clip(p.name, 90), address: clip(p.address || p.jobAddress, 160) }, office: { phone: OFFICE_PHONE }, photos: photos };
}
async function projectOf(pid){
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.projects', { headers: H() });
    if (!r.ok) return null;
    const rows = await r.json(); let v = Array.isArray(rows) && rows[0] ? rows[0].value : [];
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } }
    return arr(v).find(function(p){ return p && s(p.id) === pid; }) || null;
  } catch (e) { return null; }
}
function reply(code, headers, obj){ return { statusCode: code, headers: headers, body: JSON.stringify(obj) }; }

exports.handler = async function(event){
  event = event || {};
  const t0 = Date.now();
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS', 'x-report-token'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const action = s(b.action || 'view');

  if (action === 'create' || action === 'list' || action === 'revoke') {
    const who = await gcStaffAuth(event);
    if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
    if (!svcKey()) return reply(500, headers, { ok: false, error: 'SUPABASE_SERVICE_KEY not set on Netlify.' });
    try {
      if (action === 'revoke') {
        const id = s(b.id); if (!/^[0-9a-f-]{8,40}$/i.test(id)) return reply(400, headers, { ok: false, error: 'Which link?' });
        const r = await fetch(sbUrl() + '/rest/v1/gc_photo_reports?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ revoked: true, revoked_at: new Date().toISOString(), revoked_by: who.email }) });
        if (r.status === 404) throw setupErr(); if (!r.ok) throw new Error('update ' + r.status);
        return reply(200, headers, { ok: true });
      }
      const pid = s(b.projectId);
      if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return reply(400, headers, { ok: false, error: 'Which job? (projectId)' });
      if (action === 'list') {
        const r = await fetch(sbUrl() + '/rest/v1/gc_photo_reports?select=id,token,title,items,revoked,created_at,last_viewed_at&project_id=eq.' + encodeURIComponent(pid) + '&order=created_at.desc&limit=20', { headers: H() });
        if (r.status === 404) throw setupErr(); if (!r.ok) throw new Error('read ' + r.status);
        const rows = arr(await r.json());
        return reply(200, headers, { ok: true, links: rows.map(function(x){ return { id: x.id, url: x.revoked ? '' : linkFor(event, x.token), title: x.title, count: arr(x.items).length, createdAt: x.created_at, revoked: !!x.revoked, lastViewedAt: x.last_viewed_at || null }; }) });
      }
      const items = cleanItems(b.items);
      if (!items.length) return reply(400, headers, { ok: false, error: 'Pick at least one photo.' });
      const token = newToken(), id = crypto.randomUUID();
      const r = await fetch(sbUrl() + '/rest/v1/gc_photo_reports', { method: 'POST', headers: H({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ id: id, token: token, project_id: pid, title: clip(b.title || 'Photo report', 80), items: items, created_by: clip(who.email, 120), revoked: false }) });
      if (r.status === 404) throw setupErr(); if (!r.ok) throw new Error('write ' + r.status);
      return reply(200, headers, { ok: true, id: id, url: linkFor(event, token) });
    } catch (e) {
      if (e && e.setup) return reply(503, headers, { ok: false, setup: true, error: 'Share links are not set up yet — run docs/grayco-photos-setup.sql in Supabase.' });
      return reply(502, headers, { ok: false, error: 'Could not reach the database. Try again.' });
    }
  }

  if (action !== 'view') return reply(400, headers, { ok: false, error: 'Bad request' });
  const ip = ipOf(event);
  async function notActive(){ const w = MIN_FAIL_MS + Math.floor(Math.random() * 60) - (Date.now() - t0); if (w > 0) await sleep(w); return reply(404, headers, { ok: false, error: NOT_ACTIVE }); }
  if (limited(ip)) { await sleep(MIN_FAIL_MS); return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + OFFICE_PHONE + '.' }); }
  const token = s(gcHeader(event, 'x-report-token') || b.t);
  if (!TOKEN_RE.test(token) || !svcKey()) { noteBad(ip); return notActive(); }
  let row = null; try { row = await rowByToken(token); } catch (e) { row = null; }
  if (!row || row.revoked === true) { noteBad(ip); return notActive(); }
  let view;
  try { view = await viewOf(row, { photos: await photoRecords(), project: await projectOf(s(row.project_id)) }); }
  catch (e) { return reply(503, headers, { ok: false, error: 'We could not load the photos just now. Please try again in a minute.' }); }
  const last = row.last_viewed_at ? Date.parse(row.last_viewed_at) : 0;
  if (!last || Date.now() - last > 10 * 60e3) { try { await fetch(sbUrl() + '/rest/v1/gc_photo_reports?id=eq.' + encodeURIComponent(row.id), { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ last_viewed_at: new Date().toISOString() }) }); } catch (e) {} }
  return reply(200, headers, view);
};
exports._reset = function(){ hits.clear(); };
