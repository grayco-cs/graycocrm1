// netlify/functions/geocode.js
// GrayCo Photos (patch U2) — where a job is, with NO key: the US Census Bureau geocoder
// (geocoding.geo.census.gov, free, public, no account). Staff only (signed-in CRM token).
//   POST {addresses:[...up to 20]} → {ok, results:[{lat,lng,matched}|null, ...]} (same order)
//   POST {geo:1, addresses:[...]}  → {ok, results:[{lat,lng,matched,county,city,incorporated,state,zip,postalCity}|null]}  (patch AUT1)
// The CRM keeps the answer on the job (geoLat / geoLng), so an address is looked up once.
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


const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
/* patch AUT1 (audit #12): {geo:1} also returns the jurisdiction — county, incorporated city (or unincorporated),
   state, ZIP — from the Census "geographies" geocoder (same service, free, no key). */
const CENSUS_GEO = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const cache = new Map();
const STATE_FIPS = { '47': 'TN', '05': 'AR', '28': 'MS', '01': 'AL', '29': 'MO', '21': 'KY', '22': 'LA', '13': 'GA' };
async function geoOne(addr){
  const a = s(addr).replace(/\s+/g, ' ').slice(0, 200);
  if (a.length < 6) return null;
  const k = 'geo|' + a.toLowerCase();
  if (cache.has(k)) return cache.get(k);
  let out = null;
  try {
    const r = await fetch(CENSUS_GEO + '?benchmark=Public_AR_Current&vintage=Current_Current&layers=' + encodeURIComponent('Counties,Incorporated Places') + '&format=json&address=' + encodeURIComponent(a), { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const m = j && j.result && Array.isArray(j.result.addressMatches) && j.result.addressMatches[0];
    if (m) {
      const g = m.geographies || {}, co = (g.Counties || [])[0] || {}, pl = (g['Incorporated Places'] || [])[0] || null, ac = m.addressComponents || {};
      out = { lat: m.coordinates && isFinite(+m.coordinates.y) ? +(+m.coordinates.y).toFixed(6) : null, lng: m.coordinates && isFinite(+m.coordinates.x) ? +(+m.coordinates.x).toFixed(6) : null,
        matched: s(m.matchedAddress).slice(0, 200), county: s(co.NAME || co.BASENAME), city: pl ? s(pl.BASENAME || String(pl.NAME || '').replace(/ (city|town|village)$/i, '')) : '',
        incorporated: !!pl, state: s(ac.state) || STATE_FIPS[s(co.STATE)] || '', zip: s(ac.zip), postalCity: s(ac.city) };
    }
  } catch (e) { return null; }
  cache.set(k, out); if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return out;
}
function s(v){ return v == null ? '' : String(v).trim(); }
async function one(addr){
  const a = s(addr).replace(/\s+/g, ' ').slice(0, 200);
  if (a.length < 6) return null;
  const k = a.toLowerCase();
  if (cache.has(k)) return cache.get(k);
  let out = null;
  try {
    const r = await fetch(CENSUS + '?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(a), { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      const m = j && j.result && Array.isArray(j.result.addressMatches) && j.result.addressMatches[0];
      if (m && m.coordinates && isFinite(+m.coordinates.x) && isFinite(+m.coordinates.y))
        out = { lat: +(+m.coordinates.y).toFixed(6), lng: +(+m.coordinates.x).toFixed(6), matched: s(m.matchedAddress).slice(0, 200) };
    } else return null;        /* not cached: try again later */
  } catch (e) { return null; }
  cache.set(k, out); if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return out;
}
exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  const who = await gcStaffAuth(event);
  if (!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ ok: false, error: who.error }) };
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Bad request' }) }; }
  const list = (Array.isArray(b.addresses) ? b.addresses : [b.address]).slice(0, 20);
  const results = [];
  const fn = b.geo ? geoOne : one;   /* patch AUT1 */
  for (let i = 0; i < list.length; i += 4) results.push.apply(results, await Promise.all(list.slice(i, i + 4).map(fn)));
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results: results }) };
};
exports._reset = function(){ cache.clear(); };
