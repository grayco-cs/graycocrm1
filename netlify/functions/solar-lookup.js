// netlify/functions/solar-lookup.js
// RoofScout: "📡 Measure from address". Asks Google's Solar API for the roof of the
// building at a point and returns its area and pitch.
//
// Env vars: GOOGLE_SOLAR_API_KEY (Google Cloud key restricted to the Solar API),
//           SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY (already set).
//
//   POST { lat, lng }  →  { found: true, areaSqft, groundSqft, pitch, segments: [...],
//                           imageryDate, imageryQuality, usedThisMonth, limit }
//                       or { found: false, ... } when Google has no building there.
//   GET  ?action=usage →  { usedThisMonth, limit, connected }
//
// Only signed-in GrayCo staff may call it. The Google key never reaches the browser.
// The admin's monthly limit (RoofScout Settings, default 500) is enforced here, counted
// in rs_usage; a lookup that finds nothing is not billed by Google and not counted.

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

const SOLAR_URL = 'https://solar.googleapis.com/v1/buildingInsights:findClosest';
const SQFT = 10.7639104;
const DEFAULT_LIMIT = 500;

function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function svcHeaders(){ const k = svcKey(); return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; }
function month(){ return new Date().toISOString().slice(0, 7); }   // e.g. 2026-10 (UTC)

async function limitAndUsage(){
  let limit = DEFAULT_LIMIT, used = 0;
  const s = await fetch(sbUrl() + '/rest/v1/rs_settings?id=eq.main&select=data', { headers: svcHeaders() });
  if (s.ok) { const rows = await s.json(); const v = rows[0] && rows[0].data && rows[0].data.solar && rows[0].data.solar.monthlyLimit; if (v >= 0) limit = Number(v); }
  const u = await fetch(sbUrl() + '/rest/v1/rs_usage?kind=eq.solar&month=eq.' + month() + '&select=count', { headers: svcHeaders() });
  if (!u.ok) throw new Error('RoofScout usage table missing: run docs/roofscout-setup.sql again in Supabase.');
  const rows = await u.json();
  used = rows[0] ? Number(rows[0].count) || 0 : 0;
  return { limit, used };
}

async function bump(){
  const r = await fetch(sbUrl() + '/rest/v1/rpc/rs_bump_usage', { method: 'POST', headers: svcHeaders(), body: JSON.stringify({ p_kind: 'solar', p_month: month() }) });
  return r.ok ? Number(await r.json()) : null;
}

// Pitch in degrees → rise per 12 (6/12 etc.), to the nearest whole number.
function rise(deg){ return Math.round(Math.tan((Number(deg) || 0) * Math.PI / 180) * 12); }

function summarize(b){
  const sp = (b && b.solarPotential) || {};
  const whole = sp.wholeRoofStats || {};
  const segs = (sp.roofSegmentStats || []).map(function(s){
    const st = s.stats || {};
    return { areaSqft: Math.round((st.areaMeters2 || 0) * SQFT), pitchDeg: Math.round((s.pitchDegrees || 0) * 10) / 10, rise: rise(s.pitchDegrees) };
  }).filter(function(s){ return s.areaSqft > 0; });
  // The pitch covering the most roof area.
  const byRise = {};
  segs.forEach(function(s){ byRise[s.rise] = (byRise[s.rise] || 0) + s.areaSqft; });
  const main = Object.keys(byRise).sort(function(a, b){ return byRise[b] - byRise[a]; })[0];
  const d = b.imageryDate || {};
  const area = whole.areaMeters2 ? whole.areaMeters2 * SQFT : segs.reduce(function(t, s){ return t + s.areaSqft; }, 0);
  return {
    found: true,
    areaSqft: Math.round(area / 10) * 10,
    groundSqft: whole.groundAreaMeters2 ? Math.round(whole.groundAreaMeters2 * SQFT / 10) * 10 : null,
    pitch: main === undefined ? null : Number(main),
    segments: segs.length,
    imageryDate: d.year ? [d.year, String(d.month || 1).padStart(2, '0'), String(d.day || 1).padStart(2, '0')].join('-') : null,
    imageryQuality: b.imageryQuality || null,
    center: b.center ? { lat: b.center.latitude, lng: b.center.longitude } : null
  };
}

exports.handler = async function (event) {
  event = event || {};
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json' });
  const out = function(code, obj){ return { statusCode: code, headers, body: JSON.stringify(obj) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const who = await gcStaffAuth(event);
  if (!who.ok) return out(who.statusCode, { error: who.error });

  const key = process.env.GOOGLE_SOLAR_API_KEY || '';
  if (!svcKey()) return out(500, { error: 'SUPABASE_SERVICE_KEY not set.' });

  let lu;
  try { lu = await limitAndUsage(); } catch (e) { return out(500, { error: e.message }); }

  const q = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && q.action === 'usage') return out(200, { connected: !!key, usedThisMonth: lu.used, limit: lu.limit });
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST { lat, lng }' });
  if (!key) return out(503, { error: 'Google Solar is not connected yet: add GOOGLE_SOLAR_API_KEY in Netlify.', code: 'not-connected' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) || (!lat && !lng)) return out(400, { error: 'lat and lng are required.' });
  const m = await lookup(lat, lng, key, lu);
  return out(m.status, m.body);
};

/* one Google Solar lookup, inside the admin's monthly limit (counted in rs_usage; "nothing there" is not counted) */
async function lookup(lat, lng, key, lu){
  if (lu.used >= lu.limit) return { status: 429, body: { error: 'This month\'s Google Solar limit (' + lu.limit + ' lookups) is used up. An admin can raise it in RoofScout Settings.', code: 'limit', usedThisMonth: lu.used, limit: lu.limit } };
  const url = SOLAR_URL + '?location.latitude=' + lat.toFixed(7) + '&location.longitude=' + lng.toFixed(7) + '&requiredQuality=LOW&key=' + encodeURIComponent(key);
  let r;
  try { r = await fetch(url); } catch (e) { return { status: 502, body: { error: 'Could not reach Google Solar. Try again.' } }; }
  if (r.status === 404) return { status: 200, body: { found: false, usedThisMonth: lu.used, limit: lu.limit } };   // not billed by Google
  const j = await r.json().catch(function(){ return {}; });
  if (!r.ok) {
    const msg = (j.error && j.error.message) || ('Google Solar error ' + r.status);
    return { status: 502, body: { error: 'Google Solar: ' + msg } };
  }
  const used = await bump();
  return { status: 200, body: Object.assign(summarize(j), { usedThisMonth: used == null ? lu.used + 1 : used, limit: lu.limit }) };
}
/* patch WEB: the website's instant roof price (website-intake.js) measures through here — same key, same monthly
   limit, same counting as RoofScout's "📡 Measure from address". Never throws.
   → { ok:true, found, areaSqft, pitch, … } | { ok:false, code:'not-connected'|'limit'|'error', error } */
async function measure(lat, lng){
  const key = process.env.GOOGLE_SOLAR_API_KEY || '';
  if (!key) return { ok: false, code: 'not-connected', error: 'GOOGLE_SOLAR_API_KEY is not set.' };
  if (!svcKey()) return { ok: false, code: 'error', error: 'SUPABASE_SERVICE_KEY not set.' };
  lat = Number(lat); lng = Number(lng);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) || (!lat && !lng)) return { ok: false, code: 'error', error: 'no location' };
  try {
    const lu = await limitAndUsage();
    const m = await lookup(lat, lng, key, lu);
    if (m.status !== 200) return { ok: false, code: m.body.code || 'error', error: m.body.error || 'lookup failed' };
    return Object.assign({ ok: true }, m.body);
  } catch (e) { return { ok: false, code: 'error', error: String(e && e.message || e) }; }
}

exports._summarize = summarize;   // for tests
exports._measure = measure;     // patch WEB
