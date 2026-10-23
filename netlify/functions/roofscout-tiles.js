// netlify/functions/roofscout-tiles.js
// RoofScout imagery switcher → "Google satellite". Serves Google Map Tiles API 2D satellite
// tiles to signed-in GrayCo staff without the Google key ever reaching the browser.
//
// Env vars: GOOGLE_MAPS_TILES_KEY (optional; a key allowed to call the Map Tiles API), else
//           GOOGLE_SOLAR_API_KEY (the same Google Cloud project, with "Map Tiles API" enabled
//           on it), SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY (already set).
//
//   GET ?action=usage           (signed in)  → { connected, usedThisMonth, limit }
//   GET ?action=ticket          (signed in)  → { ticket, exp, usedThisMonth, limit }
//   GET ?t=<ticket>&z=&x=&y=                 → the tile image (proxied from Google)
//   GET ?action=viewport&t=<ticket>&zoom=&north=&south=&east=&west=
//                                            → { copyright, maxZoomRects } (Google's attribution
//                                              text and the deepest zoom for the view)
//
// Why a ticket: Leaflet loads tiles as <img> requests, which cannot carry the sign-in header,
// and checking the sign-in with Supabase for every tile would cost two database calls per
// tile. So a signed-in person first gets a ticket (staff check, monthly limit check), and the
// tile URLs carry it. A ticket is an HMAC (secret derived from the server-only keys) of the
// end of the current 6-hour window, so it is the same for everyone in that window: the
// browser cache keeps working, and nothing about the person is in the tile URLs. Someone
// removed from the staff list keeps tile access until the window ends (at most 6 hours).
//
// Google's rules followed here (developers.google.com/maps/documentation/tile/policies):
//   - one session token (createSession, mapType satellite), reused until shortly before it
//     expires (about two weeks), kept in memory and in rs_scan_cache (server-only table);
//   - tiles are never stored: each one is passed straight through, with Google's own
//     Cache-Control (marked private so no shared cache keeps it);
//   - the page shows Google's attribution text from the viewport answer and the
//     "Google Maps" mark on the map.
//
// Cost: Google bills each 2D tile (and viewport) request ("Map Tiles API: 2D Map Tiles":
// 100,000 free a month, then about $0.60 per 1,000). Every request passed to Google is
// counted in rs_usage (kind 'gtiles'), in batches; the admin's monthly limit (RoofScout
// Settings, default 90,000, under the free amount) stops tiles when it is reached. Counting is
// batched per warm function instance, so it can lag by a few dozen tiles: for a hard stop,
// also set a daily quota on the Map Tiles API in Google Cloud (docs/ROOFSCOUT-SETUP.md step 8).
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');

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

const GOOGLE = 'https://tile.googleapis.com';
const DEFAULT_LIMIT = 90000;
const WINDOW = 6 * 3600;              // ticket window, seconds
const SESSION_KEY = 'gtiles:session:v1';
const KIND = 'gtiles';

function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function svcHeaders(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function gKey(){ return process.env.GOOGLE_MAPS_TILES_KEY || process.env.GOOGLE_SOLAR_API_KEY || ''; }
function month(){ return new Date().toISOString().slice(0, 7); }
function nowSec(){ return Math.floor(Date.now() / 1000); }

// ---- tickets ------------------------------------------------------------------
function secret(){ return crypto.createHash('sha256').update('roofscout-tiles|' + svcKey() + '|' + gKey()).digest(); }
function sign(exp){ return crypto.createHmac('sha256', secret()).update('tiles|' + exp).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
// The end of the current window; with under 30 minutes left, the next window's ticket.
function newTicket(){
  let exp = (Math.floor(nowSec() / WINDOW) + 1) * WINDOW;
  if (exp - nowSec() < 1800) exp += WINDOW;
  return { ticket: exp + '.' + sign(exp), exp };
}
function checkTicket(t){
  const m = /^(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(String(t || ''));
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp < nowSec() || exp > nowSec() + 2 * WINDOW + 60) return false;
  const want = Buffer.from(sign(exp)), got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// ---- usage (rs_usage, kind 'gtiles') -------------------------------------------
// Kept per warm instance: the known count (refreshed at most once a minute) and the
// requests not yet written (written every 25 requests or 30 seconds).
const usage = { month: '', used: 0, limit: DEFAULT_LIMIT, at: 0, pending: 0, flushedAt: 0 };

async function readUsage(force){
  if (!force && usage.month === month() && Date.now() - usage.at < 60e3) return usage;
  let limit = DEFAULT_LIMIT;
  const s = await fetch(sbUrl() + '/rest/v1/rs_settings?id=eq.main&select=data', { headers: svcHeaders() });
  if (s.ok) { const rows = await s.json(); const v = rows[0] && rows[0].data && rows[0].data.mapTiles && rows[0].data.mapTiles.monthlyLimit; if (v != null && v >= 0) limit = Number(v); }
  const u = await fetch(sbUrl() + '/rest/v1/rs_usage?kind=eq.' + KIND + '&month=eq.' + month() + '&select=count', { headers: svcHeaders() });
  if (!u.ok) throw new Error('RoofScout usage table missing: run docs/roofscout-setup.sql again in Supabase.');
  const rows = await u.json();
  if (usage.month !== month()) usage.pending = 0;
  usage.month = month();
  usage.used = (rows[0] ? Number(rows[0].count) || 0 : 0) + usage.pending;   // + requests not yet written
  usage.limit = limit;
  usage.at = Date.now();
  return usage;
}

async function flush(force){
  if (!usage.pending) return;
  if (!force && usage.pending < 25 && Date.now() - usage.flushedAt < 30e3) return;
  const n = usage.pending;
  usage.pending = 0;
  usage.flushedAt = Date.now();
  try {
    const r = await fetch(sbUrl() + '/rest/v1/rpc/rs_add_usage', { method: 'POST', headers: svcHeaders(), body: JSON.stringify({ p_kind: KIND, p_month: month(), p_n: n }) });
    if (r.ok) { const c = Number(await r.json()); if (c >= 0) { usage.used = c; usage.at = Date.now(); } return; }
    // Setup script not run again yet (no rs_add_usage): count one at a time instead.
    if (r.status === 404) {
      for (let i = 0; i < n; i++) {
        const b = await fetch(sbUrl() + '/rest/v1/rpc/rs_bump_usage', { method: 'POST', headers: svcHeaders(), body: JSON.stringify({ p_kind: KIND, p_month: month() }) });
        if (b.ok) { usage.used = Number(await b.json()) || usage.used; usage.at = Date.now(); }
      }
      return;
    }
  } catch (e) { /* fall through */ }
  usage.pending += n;   // try again with the next batch
}
function count(){ usage.pending++; usage.used++; }
function overLimit(){ return usage.used >= usage.limit; }

// ---- Google session token ------------------------------------------------------
let session = null;   // { session, expiry (seconds) }

function usable(s){ return s && s.session && Number(s.expiry) - nowSec() > 86400; }

async function getSession(fresh){
  if (!fresh && usable(session)) return session;
  if (!fresh) {
    try {
      const r = await fetch(sbUrl() + '/rest/v1/rs_scan_cache?select=key,data,expires_at&key=in.(' + encodeURIComponent('"' + SESSION_KEY + '"') + ')', { headers: svcHeaders() });
      if (r.ok) { const rows = await r.json(); const d = rows && rows[0] && rows[0].data; if (usable(d)) { session = d; return session; } }
    } catch (e) { /* create a new one */ }
  }
  let r;
  try {
    r = await fetch(GOOGLE + '/v1/createSession?key=' + encodeURIComponent(gKey()), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapType: 'satellite', language: 'en-US', region: 'US' })
    });
  } catch (e) { const err = new Error('Could not reach Google Map Tiles. Try again.'); err.status = 502; throw err; }
  const j = await r.json().catch(function(){ return {}; });
  if (!r.ok || !j.session) {
    const msg = (j.error && j.error.message) || ('error ' + r.status);
    const err = new Error(r.status === 403 || r.status === 400
      ? 'Google satellite is not available yet: turn on the "Map Tiles API" in the Google Cloud project of the key (docs/ROOFSCOUT-SETUP.md step 8). Google says: ' + msg
      : 'Google Map Tiles: ' + msg);
    err.status = 503; err.code = 'not-enabled';
    throw err;
  }
  session = { session: j.session, expiry: Number(j.expiry) || nowSec() + 13 * 86400 };
  try {
    await fetch(sbUrl() + '/rest/v1/rs_scan_cache?on_conflict=key', {
      method: 'POST', headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ key: SESSION_KEY, data: session, expires_at: new Date(session.expiry * 1000).toISOString() }])
    });
  } catch (e) { /* memory is enough */ }
  return session;
}

// Ask Google with the session; once more with a new session if Google refuses the old one.
async function google(pathAndQuery){
  let s = await getSession(false);
  const url = function(){ return GOOGLE + pathAndQuery + (pathAndQuery.indexOf('?') > -1 ? '&' : '?') + 'session=' + encodeURIComponent(s.session) + '&key=' + encodeURIComponent(gKey()); };
  let r = await fetch(url());
  if (r.status === 401 || r.status === 403) { s = await getSession(true); r = await fetch(url()); }
  return r;
}

function int(v, lo, hi){ const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; }
function num(v, lo, hi){ const n = Number(v); return v !== undefined && v !== '' && isFinite(n) && n >= lo && n <= hi ? n : null; }

exports.handler = async function (event) {
  event = event || {};
  const cors = gcCors(event, 'GET, OPTIONS');
  const headers = Object.assign({}, cors, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  const out = function(code, obj){ return { statusCode: code, headers, body: JSON.stringify(obj) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return out(405, { error: 'GET only.' });
  const q = event.queryStringParameters || {};
  if (!svcKey()) return out(500, { error: 'SUPABASE_SERVICE_KEY not set.' });

  // Signed-in calls: usage and ticket.
  if (q.action === 'usage' || q.action === 'ticket') {
    const who = await gcStaffAuth(event);
    if (!who.ok) return out(who.statusCode, { error: who.error });
    let u;
    try { u = await readUsage(true); } catch (e) { return out(500, { error: e.message }); }
    if (q.action === 'usage') return out(200, { connected: !!gKey(), usedThisMonth: u.used, limit: u.limit });
    if (!gKey()) return out(503, { error: 'Google satellite is not connected: add GOOGLE_MAPS_TILES_KEY (or GOOGLE_SOLAR_API_KEY) in Netlify.', code: 'not-connected' });
    if (overLimit()) return out(429, { error: 'This month\'s Google satellite limit (' + u.limit + ' tiles) is used up. An admin can raise it in RoofScout Settings. Esri imagery still works.', code: 'limit', usedThisMonth: u.used, limit: u.limit });
    try { await getSession(false); } catch (e) { return out(e.status || 502, { error: e.message, code: e.code || 'error' }); }
    return out(200, Object.assign(newTicket(), { usedThisMonth: u.used, limit: u.limit }));
  }

  // Ticket calls: tiles and viewport.
  if (!checkTicket(q.t)) return out(401, { error: 'Tile ticket missing or expired.', code: 'ticket' });
  if (!gKey()) return out(503, { error: 'Google satellite is not connected.', code: 'not-connected' });
  try { await readUsage(false); } catch (e) { return out(500, { error: e.message }); }
  if (overLimit()) { await flush(true); return out(429, { error: 'Monthly Google satellite limit reached.', code: 'limit' }); }

  if (q.action === 'viewport') {
    const zoom = int(q.zoom, 0, 22), north = num(q.north, -90, 90), south = num(q.south, -90, 90), east = num(q.east, -180, 180), west = num(q.west, -180, 180);
    if (zoom == null || north == null || south == null || east == null || west == null) return out(400, { error: 'zoom, north, south, east, west are required.' });
    let r;
    try { r = await google('/tile/v1/viewport?zoom=' + zoom + '&north=' + north + '&south=' + south + '&east=' + east + '&west=' + west); }
    catch (e) { return out(e.status || 502, { error: e.message }); }
    count(); await flush(false);
    const j = await r.json().catch(function(){ return {}; });
    if (!r.ok) return out(502, { error: 'Google Map Tiles: ' + ((j.error && j.error.message) || r.status) });
    return out(200, { copyright: j.copyright || '', maxZoomRects: Array.isArray(j.maxZoomRects) ? j.maxZoomRects : [] });
  }

  const z = int(q.z, 0, 22);
  const x = z == null ? null : int(q.x, 0, Math.pow(2, z) - 1), y = z == null ? null : int(q.y, 0, Math.pow(2, z) - 1);
  if (z == null || x == null || y == null) return out(400, { error: 'z, x, y are required.' });
  let r;
  try { r = await google('/v1/2dtiles/' + z + '/' + x + '/' + y); }
  catch (e) { return out(e.status || 502, { error: e.message }); }
  count(); await flush(false);
  if (!r.ok) return { statusCode: r.status === 404 ? 404 : 502, headers, body: JSON.stringify({ error: 'No Google tile (' + r.status + ').' }) };
  const buf = Buffer.from(await r.arrayBuffer());
  const cc = String((r.headers && r.headers.get && r.headers.get('cache-control')) || '');
  const maxAge = /max-age=(\d+)/.exec(cc);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': (r.headers && r.headers.get && r.headers.get('content-type')) || 'image/jpeg',
      // Google's own caching rule, kept private (only this browser may keep it).
      'Cache-Control': 'private, max-age=' + (maxAge ? Math.min(Number(maxAge[1]), 86400) : 3600),
      'Access-Control-Allow-Origin': cors['Access-Control-Allow-Origin'], 'Vary': 'Origin'
    },
    body: buf.toString('base64'),
    isBase64Encoded: true
  };
};

exports._checkTicket = checkTicket;   // for tests
exports._newTicket = newTicket;
exports._reset = function(){ session = null; Object.assign(usage, { month: '', used: 0, limit: DEFAULT_LIMIT, at: 0, pending: 0, flushedAt: 0 }); };
exports._flush = function(){ return flush(true); };
