// netlify/functions/roofscout-scan.js
// RoofScout "Scan an area": finds large commercial / industrial roofs from public data.
//
//   footprints  OpenStreetMap buildings via the Overpass API (one grid tile per call). Several
//               public instances are raced (primary first, a mirror if it is slow); when none
//               answers in time the browser asks Overpass itself and posts the raw elements here.
//   parcels     county ArcGIS REST parcel layers (owner, mailing address, land use, year built)
//   permits     City of Memphis building permits (ArcGIS layer): last roofing permit
//   hail        NOAA SPC daily hail reports
// Everything is cached in Supabase (rs_scan_cache) so the free services see few, small
// requests, and rate-limited (rs_scan_take). Google Solar is NOT called here: each result
// has a "📡 Measure" button that uses solar-lookup and its monthly limit.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY (already set).
//   Optional: OVERPASS_URL (tried first), OVERPASS_URLS (comma list: replaces the built-in
//             instances), OVERPASS_HEDGE_MS (3000), OVERPASS_BUDGET_MS (8200), OVERPASS_HOURLY_LIMIT (40),
//             OVERPASS_DAILY_LIMIT (100), SCAN_USER_HOURLY_LIMIT (400), SCAN_USER_DAILY_LIMIT (2000).
//
//   GET  ?action=status                       → limits, today's Overpass use, which sources are on
//   POST { action:'tile', tile, minSqft }      → { sites: [...footprints ≥ minSqft], fromCache, via }
//   POST { action:'elements', tile, minSqft, elements:[…] }
//                                              → same as 'tile', from Overpass elements the browser fetched
//   POST { action:'enrich', tile, ids:[≤60] }  → { sites: [{ id, parcel, permit, type, excluded }], sources }
//   POST { action:'hail', days }               → { reports: [...], more }
//
// Only signed-in GrayCo staff may call it (same check as every other function).
'use strict';

const Scan = require('../../roofscout/js/scan.js');

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

const USER_AGENT = 'GrayCoRoofScout/1.0 (+https://roofscout.grayco-cs.com; wjohnson@grayco-cs.com)';
const OVERPASS_HEDGE_MS = 3000;                // primary not answered by then: race the next instance
const OVERPASS_BUDGET_MS = 8200;               // all Overpass work in one call (the function has ~10 s)
const ELEMENTS_MAX_BYTES = 5.5e6;              // browser-posted elements (Netlify's request limit is 6 MB)
const SPC_BASE = 'https://www.spc.noaa.gov/climo/reports/';
const FLOOR_SQFT = 3000;                       // footprints kept in the cache (a scan's minimum is ≥ this)
const DAY = 864e5;
const TTL = { osm: 30 * DAY, parcels: 30 * DAY, permits: 7 * DAY, meta: 7 * DAY, spcOld: 365 * DAY, spcNew: 3600e3 };
// Shelby + DeSoto + Crittenden, with a margin: hail reports outside this are not kept.
const REGION = { s: 34.4, w: -90.9, n: 35.7, e: -89.3 };
// Tiles are accepted across TN / MS / AR only (GrayCo's licensed states).
const ALLOWED = { s: 30.0, w: -94.7, n: 36.7, e: -81.6 };

// Parcel layers. URL and on/off can be changed by an admin (Settings → Area scan).
const SOURCES = {
  shelby: { url: 'https://gis.shelbycountytn.gov/arcgis/rest/services/Parcel/CERT_Parcel/MapServer/0', on: false },
  desoto: { url: '', on: false },
  crittenden: { url: 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer/6', on: true }
};
const LAYER_URL = /^https:\/\/[a-z0-9.-]+(:\d+)?\/[^?#\s]*\/(MapServer|FeatureServer)\/\d+$/i;

function num(v, d) { const n = Number(v); return isFinite(n) && v !== '' && v !== null ? n : d; }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function svcHeaders(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }

// fetch with a time limit (a Netlify function has about 10 seconds in all).
async function fetchT(url, opts, ms) {
  const ac = new AbortController();
  const t = setTimeout(function(){ ac.abort(); }, ms || 6000);
  try { return await fetch(url, Object.assign({}, opts || {}, { signal: ac.signal })); }
  finally { clearTimeout(t); }
}

// ---- Cache (rs_scan_cache) and limits (rs_scan_take) ----------------------------

async function cacheGet(keys) {
  const out = {};
  if (!keys.length) return out;
  const list = keys.map(function(k){ return '"' + k.replace(/"/g, '') + '"'; }).join(',');
  const r = await fetch(sbUrl() + '/rest/v1/rs_scan_cache?select=key,data,expires_at&key=in.(' + encodeURIComponent(list) + ')', { headers: svcHeaders() });
  if (!r.ok) throw Object.assign(new Error('RoofScout scan tables missing: run docs/roofscout-setup.sql again in Supabase.'), { status: 500, code: 'no-tables' });
  const rows = await r.json();
  const now = Date.now();
  (rows || []).forEach(function(row){ if (Date.parse(row.expires_at) > now) out[row.key] = row.data; });
  return out;
}

async function cachePut(entries) {
  if (!entries.length) return;
  const now = Date.now();
  const rows = entries.map(function(e){ return { key: e.key, data: e.data, fetched_at: new Date(now).toISOString(), expires_at: new Date(now + e.ttl).toISOString() }; });
  await fetch(sbUrl() + '/rest/v1/rs_scan_cache?on_conflict=key', {
    method: 'POST', headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(rows)
  }).catch(function(){});
  // Now and then, clear out rows that expired a week ago.
  if (Math.random() < 0.03) {
    await fetch(sbUrl() + '/rest/v1/rs_scan_cache?expires_at=lt.' + encodeURIComponent(new Date(now - 7 * DAY).toISOString()), { method: 'DELETE', headers: svcHeaders({ Prefer: 'return=minimal' }) }).catch(function(){});
  }
}

// True when allowed (and counted). Fails closed if the table is missing.
async function take(bucket, perHour, perDay) {
  const r = await fetch(sbUrl() + '/rest/v1/rpc/rs_scan_take', { method: 'POST', headers: svcHeaders(), body: JSON.stringify({ p_bucket: bucket, p_hour_limit: perHour, p_day_limit: perDay }) });
  if (!r.ok) throw Object.assign(new Error('RoofScout scan tables missing: run docs/roofscout-setup.sql again in Supabase.'), { status: 500, code: 'no-tables' });
  return (await r.json()) === true;
}

async function usedToday(bucket) {
  const since = new Date(Date.now() - DAY).toISOString();
  const r = await fetch(sbUrl() + '/rest/v1/rs_scan_rate?select=count&bucket=eq.' + encodeURIComponent(bucket) + '&hour=gt.' + encodeURIComponent(since), { headers: svcHeaders() });
  if (!r.ok) return null;
  return (await r.json()).reduce(function(t, x){ return t + (Number(x.count) || 0); }, 0);
}

function limits() {
  return {
    overpassHour: num(process.env.OVERPASS_HOURLY_LIMIT, 40), overpassDay: num(process.env.OVERPASS_DAILY_LIMIT, 100),
    userHour: num(process.env.SCAN_USER_HOURLY_LIMIT, 400), userDay: num(process.env.SCAN_USER_DAILY_LIMIT, 2000)
  };
}

async function settings() {
  const r = await fetch(sbUrl() + '/rest/v1/rs_settings?id=eq.main&select=data', { headers: svcHeaders() });
  const rows = r.ok ? await r.json() : [];
  const a = (rows[0] && rows[0].data && rows[0].data.areaScan) || {};
  const src = a.sources || {};
  const sources = {};
  Object.keys(SOURCES).forEach(function(k){
    const mine = src[k] || {};
    const s = { on: mine.on === undefined ? SOURCES[k].on : !!mine.on };
    s.url = String(mine.url || SOURCES[k].url || '').trim();   // empty = the built-in address
    s.valid = LAYER_URL.test(s.url);
    sources[k] = s;
  });
  const p = src.permits || {};
  return {
    sources: sources,
    permits: { on: !!p.on, url: String(p.url || '').trim(), valid: LAYER_URL.test(String(p.url || '').trim()) },
    dnc: Scan.dncList(a.doNotContact),
    residential: a.residentialPattern || Scan.DEFAULT_RESIDENTIAL
  };
}

// ---- 1. Footprints (Overpass) -----------------------------------------------------

// Instances in the order to try: OVERPASS_URL first, then the list; one that failed in the last
// two minutes (this warm function instance) goes to the back, the last one that answered to the front.
const opState = { good: '', bad: {} };
function overpassEndpoints() {
  const list = (process.env.OVERPASS_URLS ? process.env.OVERPASS_URLS.split(',') : Scan.OVERPASS_ENDPOINTS.slice())
    .map(function(s){ return s.trim(); }).filter(function(s){ return /^https:\/\/[^\s]+$/.test(s); });
  if (process.env.OVERPASS_URL) list.unshift(process.env.OVERPASS_URL.trim());
  const uniq = list.filter(function(u, i){ return list.indexOf(u) === i; });
  const now = Date.now();
  const rank = function(u){ return (opState.bad[u] > now ? 2 : 0) + (u === opState.good ? -1 : 0); };
  return uniq.map(function(u, i){ return { u: u, i: i }; })
    .sort(function(a, b){ return rank(a.u) - rank(b.u) || a.i - b.i; }).map(function(x){ return x.u; });
}

// One Overpass request; resolves { j, url } or rejects with { kind: 'timeout' | 'busy' | 'error' }.
async function overpassOne(url, query, ac) {
  let r;
  try {
    r = await fetch(url, {
      method: 'POST', signal: ac.signal,
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: 'data=' + encodeURIComponent(query)
    });
  } catch (e) { throw { kind: 'timeout', url: url }; }
  if (r.status === 429 || r.status === 503 || r.status === 504) throw { kind: 'busy', url: url, status: r.status };
  if (!r.ok) throw { kind: 'error', url: url, status: r.status };
  const j = await r.json().catch(function(){ return null; });
  if (!Scan.overpassOk(j)) throw { kind: j && j.remark ? 'busy' : 'error', url: url, status: r.status };
  return { j: j, url: url };
}

// Primary at once; another instance after OVERPASS_HEDGE_MS without an answer, or at once when one
// fails. The first good answer wins and the others are cancelled. Never past `ms`.
function overpassRace(query, ms) {
  const urls = overpassEndpoints();
  const hedge = num(process.env.OVERPASS_HEDGE_MS, OVERPASS_HEDGE_MS);
  const start = Date.now();
  return new Promise(function(resolve, reject){
    const live = [];
    const fails = [];
    let next = 0, done = false, timer = null;
    const finish = function(){ done = true; clearTimeout(timer); clearTimeout(stop); live.forEach(function(ac){ ac.abort(); }); };
    const stop = setTimeout(function(){
      if (done) return;
      finish();
      urls.slice(0, next).forEach(function(u){ if (!fails.some(function(f){ return f.url === u; })) fails.push({ kind: 'timeout', url: u }); });
      reject(fails);
    }, ms);
    const launch = function(){
      clearTimeout(timer);
      if (done) return;
      if (next >= urls.length || Date.now() - start > ms - 1500) {
        if (!live.length) { finish(); reject(fails); }
        return;
      }
      const url = urls[next++];
      const ac = new AbortController();
      live.push(ac);
      overpassOne(url, query, ac).then(function(res){
        if (done) return;
        finish();
        opState.good = url;
        delete opState.bad[url];
        resolve(res);
      }, function(err){
        live.splice(live.indexOf(ac), 1);
        if (done) return;
        fails.push(err);
        opState.bad[url] = Date.now() + 120e3;
        launch();                                   // a fast failure: the next instance now
      });
      timer = setTimeout(launch, hedge);            // slow: race the next one too
    };
    launch();
  });
}

function overpassFailure(fails) {
  const list = Array.isArray(fails) ? fails : [];
  const host = function(u){ try { return new URL(u).host; } catch (e) { return u; } };
  const tried = list.map(function(f){ return host(f.url) + ' ' + (f.status || f.kind); }).join(', ');
  const busy = list.length && list.every(function(f){ return f.kind === 'busy'; });
  const timeout = list.some(function(f){ return f.kind === 'timeout'; });
  return Object.assign(new Error(busy ? 'OpenStreetMap (Overpass) is busy right now.' : timeout ? 'OpenStreetMap (Overpass) did not answer in time.' : 'OpenStreetMap (Overpass) sent an error.'),
    { status: busy ? 503 : timeout ? 504 : 502, code: busy ? 'overpass-busy' : timeout ? 'overpass-timeout' : 'overpass-error', tried: tried, fallback: true });
}

async function footprints(tile, who, deadline) {
  const key = 'osm:v1:' + tile;
  const hit = (await cacheGet([key]))[key];
  if (hit) return { fps: hit.fps, at: hit.at, fromCache: true, via: 'cache' };
  const L = limits();
  if (!(await take('overpass', L.overpassHour, L.overpassDay))) {
    throw Object.assign(new Error('The team has reached today\'s limit of fresh map downloads from OpenStreetMap (a fair-use limit). Areas already scanned still work; try new areas later.'), { status: 429, code: 'overpass-limit' });
  }
  const b = Scan.tileBbox(tile);
  const ms = Math.max(2000, Math.min(num(process.env.OVERPASS_BUDGET_MS, OVERPASS_BUDGET_MS), (deadline || Date.now() + OVERPASS_BUDGET_MS) - Date.now()));
  let got;
  try {
    got = await overpassRace(Scan.overpassQuery(b, { timeout: Math.ceil(ms / 1000), floorSqft: FLOOR_SQFT }), ms);
  } catch (fails) { throw overpassFailure(fails); }
  const fps = Scan.parseOverpass(got.j, FLOOR_SQFT);
  const at = new Date().toISOString();
  const via = new URL(got.url).host;
  await cachePut([{ key: key, data: { fps: fps, at: at, by: who, via: via }, ttl: TTL.osm }]);
  return { fps: fps, at: at, fromCache: false, via: via };
}

// Elements the browser fetched from Overpass itself (the server could not): same parsing, same
// floor and cache. A square already in the cache is served from the cache, not replaced.
async function footprintsFromBrowser(tile, who, raw, source) {
  const key = 'osm:v1:' + tile;
  const hit = (await cacheGet([key]))[key];
  if (hit) return { fps: hit.fps, at: hit.at, fromCache: true, via: 'cache' };
  const b = Scan.tileBbox(tile);
  const clean = Scan.cleanElements(raw, b);
  if (!clean) throw Object.assign(new Error('Map data not accepted (at most ' + Scan.EL_MAX + ' elements).'), { status: 400, code: 'bad-elements' });
  const margin = 0.0005;
  const fps = Scan.parseOverpass({ elements: clean.elements }, FLOOR_SQFT).filter(function(f){
    return Scan.inBbox([f.lat, f.lng], { s: b.s - margin, w: b.w - margin, n: b.n + margin, e: b.e + margin }) ||
      f.rings[0].some(function(p){ return Scan.inBbox(p, b); });
  });
  const at = new Date().toISOString();
  const via = 'browser' + (source ? ':' + source : '');
  await cachePut([{ key: key, data: { fps: fps, at: at, by: who, via: via }, ttl: TTL.osm }]);
  return { fps: fps, at: at, fromCache: false, via: via };
}

function siteOut(f) {
  return {
    id: f.id, lat: f.lat, lng: f.lng, areaSqft: f.areaSqft, outline: f.rings[0], tags: f.tags,
    name: f.tags.name || '', address: Scan.osmAddress(f.tags), type: Scan.classify(f.tags, '')
  };
}

// ---- 2. Parcels (county ArcGIS REST) ---------------------------------------------------

async function arcgisQuery(url, params, ms) {
  const body = new URLSearchParams(Object.assign({ f: 'json' }, params)).toString();
  const r = await fetchT(url.replace(/\/$/, '') + '/query', {
    method: 'POST', headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: body
  }, ms || 5000);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j && j.error) throw new Error((j.error.message || 'error') + (j.error.code ? ' (' + j.error.code + ')' : ''));
  return j;
}

// Points → the parcel polygon containing each. Returns { id: parcel } for points matched.
async function parcelsFor(source, url, pts) {
  const found = {};
  for (let i = 0; i < pts.length; i += 50) {
    const part = pts.slice(i, i + 50);
    const j = await arcgisQuery(url, {
      geometry: JSON.stringify({ points: part.map(function(p){ return [p.lng, p.lat]; }), spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryMultipoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: '*', returnGeometry: 'true', outSR: '4326'
    });
    (j.features || []).forEach(function(ft){
      const rings = Scan.esriRings(ft.geometry);
      if (!rings.length) return;
      part.forEach(function(p){
        if (found[p.id] || !Scan.pointInRings([p.lat, p.lng], rings)) return;
        const parcel = Scan.parcelFromAttrs(ft.attributes || {}, source);
        parcel.rings = rings;
        found[p.id] = parcel;
      });
    });
  }
  return found;
}

// ---- 3. Permits (Memphis, ArcGIS layer) ---------------------------------------------------

function pickName(fields, re, type) {
  const f = (fields || []).filter(function(x){ return (!type || x.type === type) && re.test(x.name); })[0];
  return f ? f.name : null;
}

async function permitMeta(url) {
  const key = 'pmeta:v1:' + url.slice(-180);
  const hit = (await cacheGet([key]))[key];
  if (hit) return hit;
  const r = await fetchT(url + '?f=json', { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }, 4000);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'layer error');
  const fields = j.fields || [];
  const meta = {
    date: pickName(fields, /issue/i, 'esriFieldTypeDate') || pickName(fields, /date/i, 'esriFieldTypeDate'),
    desc: pickName(fields, /desc|work|scope/i, 'esriFieldTypeString'),
    type: pickName(fields, /type|class|categ/i, 'esriFieldTypeString'),
    addr: pickName(fields, /addr|location|site/i, 'esriFieldTypeString'),
    number: pickName(fields, /permit.*(num|no|id)|^number$|record/i, 'esriFieldTypeString')
  };
  if (!meta.date || !(meta.desc || meta.type)) throw new Error('permit layer has no issue-date or description field');
  await cachePut([{ key: key, data: meta, ttl: TTL.meta }]);
  return meta;
}

async function permitsForTile(url, tile) {
  const key = 'pmt:v1:' + tile;
  const hit = (await cacheGet([key]))[key];
  if (hit) return hit.list;
  const m = await permitMeta(url);
  const b = Scan.tileBbox(tile);
  const like = [m.desc, m.type].filter(Boolean).map(function(f){ return 'UPPER(' + f + ") LIKE '%ROOF%'"; }).join(' OR ');
  const j = await arcgisQuery(url, {
    where: like, geometry: [b.w, b.s, b.e, b.n].join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: [m.date, m.desc, m.type, m.addr, m.number].filter(Boolean).join(','),
    returnGeometry: 'true', outSR: '4326', resultRecordCount: '2000'
  });
  const list = (j.features || []).map(function(ft){
    const a = ft.attributes || {}, g = ft.geometry || {};
    const t = Number(a[m.date]);
    if (!t) return null;
    return {
      date: new Date(t).toISOString().slice(0, 10),
      desc: String(a[m.desc] || a[m.type] || '').slice(0, 160),
      number: m.number ? String(a[m.number] || '') : '',
      address: m.addr ? String(a[m.addr] || '') : '',
      lat: typeof g.y === 'number' ? Math.round(g.y * 1e6) / 1e6 : null,
      lng: typeof g.x === 'number' ? Math.round(g.x * 1e6) / 1e6 : null
    };
  }).filter(Boolean);
  await cachePut([{ key: key, data: { list: list }, ttl: TTL.permits }]);
  return list;
}

// Latest roofing permit for a footprint: on its parcel, on / beside the building, or at its address.
function matchPermit(fp, parcel, permits) {
  const near = Math.max(40, Math.sqrt(fp.areaSqft / Scan.SQFT_PER_M2) / 2 + 20);
  const addrs = [parcel && parcel.situs, Scan.osmAddress(fp.tags)].map(Scan.normAddress).filter(Boolean);
  let best = null;
  (permits || []).forEach(function(p){
    let hit = false;
    if (p.lat != null && p.lng != null) {
      const pt = [p.lat, p.lng];
      hit = (parcel && parcel.rings && Scan.pointInRings(pt, parcel.rings)) || Scan.pointInRings(pt, fp.rings) || Scan.haversineM(pt, [fp.lat, fp.lng]) <= near;
    }
    if (!hit && p.address) hit = addrs.indexOf(Scan.normAddress(p.address)) > -1;
    if (hit && (!best || p.date > best.date)) best = p;
  });
  return best ? { date: best.date, desc: best.desc, number: best.number } : null;
}

async function enrich(tile, ids) {
  const key = 'osm:v1:' + tile;
  const cached = (await cacheGet([key]))[key];
  if (!cached) throw Object.assign(new Error('Scan this area first.'), { status: 409, code: 'tile-first' });
  const want = {};
  ids.forEach(function(id){ want[id] = 1; });
  const fps = cached.fps.filter(function(f){ return want[f.id]; });
  const cfg = await settings();
  const b = Scan.tileBbox(tile);
  const sources = {};

  // Parcels: cached per tile; ask the county only for buildings not looked up yet.
  const pkey = 'pcl:v1:' + tile;
  const pc = ((await cacheGet([pkey]))[pkey] || { map: {} }).map;
  const missing = fps.filter(function(f){ return !(f.id in pc); });
  let anyFailed = false, anyAsked = false;
  const fresh = {};
  for (const name of Object.keys(cfg.sources)) {
    const s = cfg.sources[name];
    if (!Scan.bboxesTouch(Scan.COUNTIES[name].bbox, b)) continue;
    if (!s.on) { sources[name] = 'off'; continue; }
    if (!s.valid) { sources[name] = 'no-url'; continue; }
    const todo = missing.filter(function(f){ return !fresh[f.id] && Scan.inBbox([f.lat, f.lng], Scan.COUNTIES[name].bbox); });
    if (!todo.length) { sources[name] = 'ok'; continue; }
    anyAsked = true;
    try {
      Object.assign(fresh, await parcelsFor(name, s.url, todo));
      sources[name] = 'ok';
    } catch (e) {
      anyFailed = true;
      sources[name] = 'error: ' + String(e.message || e).slice(0, 120);
    }
  }
  if (missing.length && anyAsked) {
    // A building no source matched is remembered as "no parcel" only when every source answered.
    missing.forEach(function(f){ if (fresh[f.id]) pc[f.id] = fresh[f.id]; else if (!anyFailed) pc[f.id] = null; });
    await cachePut([{ key: pkey, data: { map: pc }, ttl: TTL.parcels }]);
  }

  // Permits (Memphis only).
  let permits = null;
  if (cfg.permits.on && cfg.permits.valid && Scan.bboxesTouch(Scan.COUNTIES.shelby.bbox, b)) {
    try { permits = await permitsForTile(cfg.permits.url, tile); sources.permits = 'ok'; }
    catch (e) { sources.permits = 'error: ' + String(e.message || e).slice(0, 120); }
  } else sources.permits = cfg.permits.on ? 'no-url' : 'off';

  const sites = fps.map(function(f){
    const parcel = f.id in pc ? pc[f.id] : (fresh[f.id] || null);
    const out = { id: f.id, parcel: null, permit: null, permitsChecked: !!permits, type: Scan.classify(f.tags, parcel && parcel.landUse), excluded: null };
    if (parcel) {
      out.parcel = Object.assign({}, parcel);
      delete out.parcel.rings;
      if (Scan.isSingleFamily(parcel.landUse, cfg.residential)) out.excluded = 'residential';
      else if (Scan.isDnc(parcel, cfg.dnc)) out.excluded = 'do-not-contact';
    }
    if (out.excluded) { out.parcel = null; return out; }   // nothing about skipped owners leaves the server
    if (permits) out.permit = matchPermit(f, parcel, permits);
    return out;
  });
  return { sites: sites, sources: sources };
}

// ---- 4. Hail (NOAA SPC) -------------------------------------------------------------------

async function spcDay(day) {
  for (const name of [day + '_rpts_filtered_hail.csv', day + '_rpts_hail.csv']) {
    let r;
    try { r = await fetchT(SPC_BASE + name, { headers: { 'User-Agent': USER_AGENT } }, 4000); } catch (e) { return null; }
    if (r.status === 404) continue;
    if (!r.ok) return null;
    return Scan.parseSpcCsv(await r.text(), day, REGION);
  }
  return [];   // no file for that day (yet): no reports
}

async function hail(days) {
  const now = Date.now();
  const list = Scan.spcDays(days, now);
  const keys = list.map(function(d){ return 'spc:v1:' + d; });
  const have = await cacheGet(keys);
  const missing = list.filter(function(d){ return !have['spc:v1:' + d]; }).slice(0, 12);
  const put = [];
  for (let i = 0; i < missing.length; i += 6) {
    const got = await Promise.all(missing.slice(i, i + 6).map(spcDay));
    got.forEach(function(reports, k){
      const d = missing[i + k];
      if (!reports) return;                      // SPC unreachable: try again next time
      const recent = now - Date.UTC(2000 + Number(d.slice(0, 2)), Number(d.slice(2, 4)) - 1, Number(d.slice(4, 6))) < 3 * DAY;
      have['spc:v1:' + d] = { reports: reports };
      put.push({ key: 'spc:v1:' + d, data: { reports: reports }, ttl: recent ? TTL.spcNew : TTL.spcOld });
    });
  }
  await cachePut(put);
  const reports = [];
  keys.forEach(function(k){ if (have[k]) reports.push.apply(reports, have[k].reports); });
  const left = list.filter(function(d){ return !have['spc:v1:' + d]; }).length;
  return { reports: reports.filter(function(h){ return now - h.ts <= days * DAY; }), more: left > 0 && missing.length > 0, missingDays: left };
}

// ---- Handler --------------------------------------------------------------------------------

exports.handler = async function (event) {
  event = event || {};
  const deadline = Date.now() + 8800;      // leaves time for the cache write inside ~10 s
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json' });
  const out = function(code, obj){ return { statusCode: code, headers, body: JSON.stringify(obj) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const who = await gcStaffAuth(event);
  if (!who.ok) return out(who.statusCode, { error: who.error });
  if (!svcKey()) return out(500, { error: 'SUPABASE_SERVICE_KEY not set.' });

  const q = event.queryStringParameters || {};
  const L = limits();
  try {
    if (event.httpMethod === 'GET' && q.action === 'status') {
      const cfg = await settings();
      const used = await usedToday('overpass');
      if (used === null) return out(500, { error: 'RoofScout scan tables missing: run docs/roofscout-setup.sql again in Supabase.', code: 'no-tables' });
      const src = {};
      Object.keys(cfg.sources).forEach(function(k){ src[k] = cfg.sources[k].on ? (cfg.sources[k].valid ? 'on' : 'no-url') : 'off'; });
      src.permits = cfg.permits.on ? (cfg.permits.valid ? 'on' : 'no-url') : 'off';
      return out(200, { ready: true, overpassToday: used, limits: L, sources: src });
    }
    if (event.httpMethod !== 'POST') return out(405, { error: 'POST { action: tile | enrich | hail }' });

    if (String(event.body || '').length > ELEMENTS_MAX_BYTES) return out(413, { error: 'Too much map data in one request.', code: 'too-big' });
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) {}
    if (!(await take('u:' + who.email, L.userHour, L.userDay))) {
      return out(429, { error: 'You have run a lot of scans in a short time. Please wait a while and try again.', code: 'user-limit' });
    }

    if (body.action === 'hail') {
      const days = Math.max(1, Math.min(90, Math.round(num(body.days, 30))));
      return out(200, await hail(days));
    }

    const tile = String(body.tile || '');
    const b = Scan.tileBbox(tile);
    if (!b) return out(400, { error: 'tile is required.' });
    if (!Scan.inBbox([b.s, b.w], ALLOWED) || !Scan.inBbox([b.n, b.e], ALLOWED)) return out(400, { error: 'RoofScout scans Tennessee, Mississippi and Arkansas only.', code: 'outside' });

    if (body.action === 'tile' || body.action === 'elements') {
      const min = Math.max(FLOOR_SQFT, num(body.minSqft, 10000));
      const fp = body.action === 'tile' ? await footprints(tile, who.email, deadline)
        : await footprintsFromBrowser(tile, who.email, body.elements, String(body.source || '').replace(/[^a-z0-9.-]/gi, '').slice(0, 60));
      return out(200, {
        tile: tile, fromCache: fp.fromCache, fetchedAt: fp.at, via: fp.via,
        sites: fp.fps.filter(function(f){ return f.areaSqft >= min; }).map(siteOut),
        attribution: '© OpenStreetMap contributors (ODbL)'
      });
    }
    if (body.action === 'enrich') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(function(s){ return /^[wr]\d{1,15}$/.test(s); }).slice(0, 60);
      if (!ids.length) return out(400, { error: 'ids are required.' });
      return out(200, Object.assign({ tile: tile }, await enrich(tile, ids)));
    }
    return out(400, { error: 'Unknown action.' });
  } catch (e) {
    const o = { error: e.message || String(e), code: e.code || 'error' };
    if (e.tried) o.tried = e.tried;
    if (e.fallback) o.fallback = true;     // the browser may ask Overpass itself
    return out(e.status || 500, o);
  }
};

// for tests
exports._matchPermit = matchPermit;
exports._limits = limits;
exports._overpassEndpoints = overpassEndpoints;
exports._resetOverpass = function(){ opState.good = ''; opState.bad = {}; };
