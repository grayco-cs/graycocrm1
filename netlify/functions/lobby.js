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
const JA = require('./_lib/job-auto.js');   /* patch QAB: companyOf (with the MISFILED read-side repair) */
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

// netlify/functions/lobby.js — patch OFFICETV: the 📺 LOBBY TV's content (owner 11/01: "a front room TV for customers … it
// must look impressive and show NO internal numbers"). READ ONLY.
//
// PUBLIC (no sign-in — the lobby screen is never a signed-in CRM):
//   GET  (header x-lobby-token: <the lobby link's code>)  → the lobby: ONLY owner-approved public content —
//        the playlist the admin / office set (gc_kv gc_lobby), each slide's text CLEANED (a line with a customer's
//        name or address, an insurance company, subs / the sub portal, HVAC, a phone number that is not GrayCo's or an
//        e-mail is left out), approved photos only (GrayCo Photos marked "Customer sees it" — the customer portal's own
//        rule — or a photo uploaded in the editor) as short-lived signed links, 5★ reviews as first name + last initial,
//        live offers (gc_lobby_offers: on, approved, not past their end date), the GrayCo brand line, the maintenance
//        tiers (no prices that are not set), the referral amounts, the weather (api.weather.gov, Bartlett).
//        The link must be ON and the code must match (gc_kv gc_lobby_access { on, token }); anything else → 404 with
//        nothing in it. Per-address rate limit.
// STAFF (the GrayCo staff check below):
//   POST {action:'preview', lobby, offers, only} → the same cleaning on the editor's unsaved playlist: what the TV would
//        show (the editor's live preview and "Preview full rotation").
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (already set), TWILIO_FROM (the 24/7 line the call order answers).
const crypto = require('crypto');
const TY = require('./_lib/lobby-types.js');
const M = require('./_lib/maint.js');
const BR = require('./_lib/brand.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function clip(v, n){ return s(v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n); }
function sbUrl(){ return s(process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function H(){ const k = svcKey(); return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; }
function centralDay(){ try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10); } }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, extra || {}), body: JSON.stringify(body) }; }
const NOPE = { ok: false, error: 'This lobby screen is not active.' };
/* patch MITWS (owner 11/12: the TVs per company): GrayCo Mitigation and GrayCo Environmental each have their own lobby — their own
   playlist, offers and link (gc_kv <key>__mitigation / <key>__environmental, header x-lobby-co), their name and logo, and only the
   photos of their own jobs. No company → GrayCo Construction's lobby, exactly as before. */
const COS = { mitigation: { name: 'GrayCo Mitigation', logo: '/img/grayco-mitigation-logo.png', color: '#0e7490' }, environmental: { name: 'GrayCo Environmental', logo: '/img/grayco-environmental-logo.png', color: '#15803d' } };
function coOf(v){ v = low(v); return COS[v] ? v : ''; }
function coKey(k, co){ return co ? k + '__' + co : k; }
const CO_DEFAULTS = { mitigation: ['welcome', 'restoration', 'emergency', 'claims', 'process', 'review', 'beforeafter', 'leavereview'], environmental: ['welcome', 'emergency', 'process', 'review', 'leavereview'] };

/* the CRM's records (gc_kv), read with the service key; a big list may be in pieces (<key>__manifest + __chunkN) */
async function kvRead(keys){
  const want = []; keys.forEach(function(k){ want.push(k, k + '__manifest'); });
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value,updated_at&key=in.(' + want.map(function(k){ return '"' + k + '"'; }).join(',') + ')', { headers: H() });
  if (!r.ok) throw new Error('gc_kv read ' + r.status);
  const rows = await r.json(), byKey = {}; (Array.isArray(rows) ? rows : []).forEach(function(x){ if (x && x.key) byKey[x.key] = x; });
  const out = {};
  for (const k of keys) {
    let val = byKey[k] ? byKey[k].value : null; const man = byKey[k + '__manifest']; const mv = obj(man && man.value);
    if (mv.chunked && mv.count > 0 && (!byKey[k] || s(man.updated_at) >= s(byKey[k].updated_at))) {
      try { const names = []; for (let i = 0; i < Math.min(mv.count, 60); i++) names.push('"' + k + '__chunk' + i + '"');
        const rr = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value&key=in.(' + names.join(',') + ')', { headers: H() });
        if (rr.ok) { const parts = await rr.json(), by = {}; (Array.isArray(parts) ? parts : []).forEach(function(x){ by[x.key] = x.value; }); let all = []; for (let i = 0; i < mv.count; i++) all = all.concat(arr(by[k + '__chunk' + i])); if (all.length) val = all; } } catch (e) {}
    }
    out[k] = typeof val === 'string' ? (function(){ try { return JSON.parse(val); } catch (e) { return val; } })() : val;
  }
  return out;
}

/* ── the cleaning: what never reaches the lobby ── */
const CARRIERS = /\b(state\s*farm|allstate|usaa|farmers|liberty\s*mutual|nationwide|progressive|travelers|geico|american\s*family|erie|shelter\s*insurance|auto[-\s]?owners|chubb|hartford|safeco|farm\s*bureau|amica|kemper|cincinnati\s*insurance|westfield|hanover|metlife|encompass|homesite|citizens\s*insurance|assurant|american\s*strategic|universal\s*property|tower\s*hill|foremost|stillwater|openly|lemonade|hippo|kin\s*insurance|mercury\s*insurance|the\s*general|grange|cigna)\b/i;
const SUBS = /\bsub[-\s]?contractors?\b|\bsubs\b|sub[-\s]?portal|portal\.grayco|bids\.grayco/i;
const HVAC = /\bhvac\b|\bheating\b|air[-\s]?condition|\ba\/c\b|rooftop\s+units?|\brtus?\b|furnace|heat\s*pump/i;
const ADDR = /\b\d{2,6}\s+(?:[nsew]\.?\s+)?[a-z0-9.'-]+(?:\s+[a-z0-9.'-]+){0,3}\s+(st|street|rd|road|ave|avenue|dr|drive|ln|lane|cv|cove|blvd|boulevard|ct|court|way|pl|place|pkwy|parkway|hwy|highway|cir|circle|trl|trail|ter|terrace|loop|pike|run|xing|crossing|sq|square)\b\.?/i;
const PHONE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g;
const EMAIL = /[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/i;
const OURS = { '9015850944': 1, '9015828255': 1 };
function cleaner(data){
  const names = [], streets = [];
  function addName(v){ v = low(v).replace(/[^a-zÀ-ɏ' -]/g, ' ').replace(/\s+/g, ' ').trim(); if (v.split(' ').length >= 2 && v.length >= 5) names.push(v); }
  function addStreet(v){ const st = low(s(v).split(',')[0]).replace(/^\d+[a-z]?\s+/, '').replace(/\b(st|street|rd|road|ave|avenue|dr|drive|ln|lane|cv|cove|blvd|ct|court|way|pl|pkwy|hwy|cir|n|s|e|w)\b\.?/g, ' ').replace(/\s+/g, ' ').trim(); if (st.length >= 5 && /\d/.test(s(v))) streets.push(st); }
  arr(data.projects).forEach(function(p){ if (!p) return; addName(p.client); addName(p.customerName); addStreet(p.address); });
  arr(data.customers).forEach(function(c){ if (!c) return; addName(c.name); addName(s(c.first) + ' ' + s(c.last)); addName(c.company && /\b(llc|inc)\b/i.test(c.company) ? '' : ''); addStreet(c.address); });
  arr(data.leads).forEach(function(l){ if (!l) return; addName(l.client); addName(l.contactName); addName(obj(l.contact).name); addStreet(l.address); });
  const nameSet = Array.from(new Set(names)), streetSet = Array.from(new Set(streets));
  function bad(t){
    const x = low(t).replace(/\s+/g, ' ');
    if (!x) return false;
    if (CARRIERS.test(t) || SUBS.test(t) || HVAC.test(t) || ADDR.test(t) || EMAIL.test(t)) return true;
    let m; PHONE.lastIndex = 0; while ((m = PHONE.exec(t))) { if (!OURS[m[1] + m[2] + m[3]] && !(EMERG_DIGITS && m[1] + m[2] + m[3] === EMERG_DIGITS)) return true; }
    for (const n of nameSet) if (x.indexOf(n) >= 0) return true;
    for (const st of streetSet) if (x.indexOf(st) >= 0) return true;
    return false;
  }
  return { bad: bad, text: function(v, n){ v = clip(v, n || 300); return bad(v) ? '' : v; }, list: function(v, n){ return arr(v).map(function(x){ return clip(x, 120); }).filter(function(x){ return x && !bad(x); }).slice(0, n || 8); } };
}
let EMERG_DIGITS = '';
function phoneFmt(v){ const d = s(v).replace(/\D/g, '').replace(/^1(\d{10})$/, '$1'); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : ''; }
/* patch TVMUSIC: the company music for the lobby TV (gc_kv gc_tv_goals.lobbyMusic, set in ⚙ Admin → 📺 TVs → 🎵 Music). Only
   the plain forms the CRM saves — a YouTube video / playlist / live stream or a Spotify playlist / album / song / artist /
   podcast — anything else is not served. */
const MUSIC_RE = /^(https:\/\/www\.youtube\.com\/(watch\?v=[A-Za-z0-9_-]{11}(&list=[A-Za-z0-9_-]{2,80})?(&t=\d{1,6})?|playlist\?list=[A-Za-z0-9_-]{2,80}|live\/[A-Za-z0-9_-]{11}|channel\/UC[A-Za-z0-9_-]{22}\/live)|https:\/\/open\.spotify\.com\/(playlist|album|track|artist|episode|show)\/[A-Za-z0-9]{22})$/;
function musicUrl(v){ v = s(v); return v.length <= 200 && MUSIC_RE.test(v) ? v : ''; }
function httpsUrl(v){ v = s(v); return /^https:\/\/[^\s<>"']{3,400}$/i.test(v) ? v : ''; }
function shortName(n){ const p = s(n).replace(/[^A-Za-zÀ-ɏ' .-]/g, '').split(/\s+/).filter(Boolean); if (!p.length) return 'A GrayCo customer'; return p[0].charAt(0).toUpperCase() + p[0].slice(1).toLowerCase() + (p.length > 1 ? ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.' : ''); }
/* the photos: GrayCo Photos the customer may see (the portal's rule) or an upload made in the editor */
function refPath(ref){ const m = /^sb:crm-files\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/.exec(s(ref)); return m ? m[1] : ''; }
function sharedOf(r){ return r.shared === true || (r.shared == null && s(r.tag) !== 'Damage'); }
async function signRefs(refs){
  const paths = Array.from(new Set(refs.map(refPath).filter(Boolean))).slice(0, 120), out = {};
  if (!paths.length || !svcKey()) return out;
  try { const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files', { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: 6 * 3600, paths: paths }) });
    if (!r.ok) return out; const j = await r.json();
    (Array.isArray(j) ? j : []).forEach(function(x){ const u = s(x && (x.signedURL || x.signedUrl)); if (x && x.path && u && !x.error) out['sb:crm-files/' + x.path] = /^https:/.test(u) ? u : sbUrl() + '/storage/v1' + (u[0] === '/' ? '' : '/') + u; });
  } catch (e) {}
  return out;
}
const CITIES = ['Bartlett', 'Memphis', 'Cordova', 'Collierville', 'Germantown', 'Arlington', 'Lakeland', 'Millington', 'Atoka', 'Munford', 'Oakland', 'Somerville', 'Brighton', 'Covington', 'Eads', 'Southaven', 'Olive Branch', 'Horn Lake', 'Hernando', 'West Memphis', 'Marion', 'Rossville', 'Piperton', 'Mason', 'Drummonds'];
function cityOf(p){ const hay = ' ' + s(p && p.city) + ' ' + s(p && p.address).split(',').slice(1).join(' ') + ' '; for (const c of CITIES) if (new RegExp('\\b' + c + '\\b', 'i').test(hay)) return c; return ''; }
function workOf(p){
  const t = low(p && (p.type + ' ' + p.name));
  if (/roof/.test(t)) return 'Roof replacement'; if (/water/.test(t)) return 'Water damage restoration'; if (/fire/.test(t)) return 'Fire restoration'; if (/mold/.test(t)) return 'Mold remediation';
  if (/insurance|claim|storm/.test(t)) return 'Storm restoration'; if (/commercial ti|tenant/.test(t)) return 'Commercial build-out'; if (/commercial/.test(t)) return 'Commercial renovation';
  if (/kitchen/.test(t)) return 'Kitchen remodel'; if (/bath/.test(t)) return 'Bathroom remodel'; if (/new construction/.test(t)) return 'New construction'; return 'Renovation';
}
async function photoSet(ids, ctx, max){
  const out = [];
  for (const raw of arr(ids).slice(0, max || 6)) {
    const id = s(typeof raw === 'object' ? raw.id : raw); if (!id) continue;
    if (/^up:/.test(id)) { const ref = id.slice(3); if (refPath(ref) && ctx.uploads[ref]) out.push({ ref: ref, cap: '' }); continue; }
    const r = ctx.photos[id]; if (!r) continue;
    const ref = refPath(r.annotatedRef) ? r.annotatedRef : r.ref; if (!refPath(ref)) continue;
    const p = ctx.P[s(r.jobId)], city = cityOf(p);
    out.push({ ref: ref, cap: p ? workOf(p) + (city ? ' · ' + city : '') : '' });
  }
  return out;
}
/* ── the weather (Bartlett, TN — api.weather.gov; cached 30 min) ── */
let WX = { at: 0, v: null };
async function weather(){
  if (WX.at && Date.now() - WX.at < 30 * 60e3) return WX.v;
  WX.at = Date.now();
  try {
    const hd = { 'User-Agent': 'GrayCo Lobby TV (office@grayco-cs.com)', Accept: 'application/geo+json' };
    const ac = new AbortController(), tm = setTimeout(function(){ ac.abort(); }, 4000);
    const p = await fetch('https://api.weather.gov/points/35.2045,-89.873', { headers: hd, signal: ac.signal }).then(function(r){ return r.ok ? r.json() : null; });
    const u = p && p.properties && p.properties.forecast;
    const f = u ? await fetch(u, { headers: hd, signal: ac.signal }).then(function(r){ return r.ok ? r.json() : null; }) : null;
    clearTimeout(tm);
    const per = arr(f && f.properties && f.properties.periods).slice(0, 4);
    WX.v = per.length ? { place: 'Bartlett, TN', days: per.map(function(x){ return { name: clip(x.name, 20), temp: Math.round(+x.temperature || 0), short: clip(x.shortForecast, 40) }; }) } : null;
  } catch (e) { WX.v = null; }
  return WX.v;
}
/* ── build the lobby from a playlist ── */
async function build(doc, offersDoc, opts){
  opts = opts || {};
  const data = await kvRead(['gc_photos', 'gc_mkt_v1', 'projects', 'customers', 'leads', 'gc_maint_plans'].concat(opts.co ? ['gc_companies'] : []));   /* patch QAB: + the company's own settings */
  const C = cleaner(data), P = {}, photos = {}, uploads = {};
  arr(data.projects).forEach(function(p){ if (p && p.id) P[s(p.id)] = p; });
  arr(data.gc_photos).forEach(function(r){
    if (!r || r.deleted === true || r.source === 'ccflag' || !s(r.id)) return;
    { const pj = P[s(r.jobId)]; if ((opts.co || 'construction') !== (pj ? JA.companyOf(pj) : 'construction')) return; }   /* patch MITWS: a company's lobby — its own jobs' photos; patch QAB: by the job's real company (the MISFILED repair), and GrayCo Construction's lobby never shows a Mitigation / Environmental job's photos */
    if (!sharedOf(r)) return; if (r.source === 'sub' && !(r.shared === true && s(r.custOkBy))) return;
    photos[s(r.id)] = r;
  });
  arr(doc.uploads).forEach(function(ref){ if (refPath(ref)) uploads[s(ref)] = 1; });
  const ctx = { P: P, photos: photos, uploads: uploads };
  const mk = obj(data.gc_mkt_v1), rvAll = Object.keys(obj(mk.reviews)).map(function(k){ return mk.reviews[k]; })
    .filter(function(r){ return r && !r.del && (+r.rating || 0) >= 5 && s(r.text); }).sort(function(a, b){ return s(a.date || a.at) < s(b.date || b.at) ? 1 : -1; });
  function revs(pick, n){
    let l = arr(pick).length ? arr(pick).map(function(id){ return rvAll.filter(function(r){ return s(r.id) === s(id); })[0]; }).filter(Boolean) : rvAll;
    return l.map(function(r){ const t = clip(r.text, 320); return C.bad(t) ? null : { name: shortName(r.author), text: t, stars: 5 }; }).filter(Boolean).slice(0, n);
  }
  const day = centralDay(), want = [], slides = [], types = {};
  const list = arr(doc.slides).filter(function(x){ return x && TY.by[x.type] && (opts.all || x.on !== false); }).slice(0, 60);
  for (const x of list) {
    const T = TY.by[x.type], o = { id: clip(x.id, 40) || x.type, type: x.type };
    if (T.chk && x.ok !== true && !opts.all) continue;   /* default words nobody checked yet: never on the lobby */
    types[x.type] = 1;
    ['h', 'sub', 't', 'label'].forEach(function(k){ if (T.f.indexOf(k) >= 0 || (k === 'label' && T.f.indexOf('url') >= 0)) { const v = C.text(x[k], k === 't' ? 600 : 160); if (v) o[k] = v; } });
    if (T.f.indexOf('items') >= 0) { const l = C.list(x.items, 8); if (l.length) o.items = l; }
    if (T.f.indexOf('url') >= 0) { const u = httpsUrl(x.url); if (u && !C.bad(u)) o.url = u; }
    if (T.f.indexOf('end') >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(s(x.end))) o.end = s(x.end);
    if (T.f.indexOf('rating') >= 0) { const r = parseFloat(x.rating), n = parseInt(x.count, 10); if (r > 0 && r <= 5) o.rating = Math.round(r * 10) / 10; if (n > 0 && n < 100000) o.count = n; if (!o.rating && rvAll.length >= 3) { o.rating = 5; o.count = rvAll.length; } }
    if (T.f.indexOf('offer') >= 0 && s(x.offer)) o.offer = clip(x.offer, 40);
    if (T.f.indexOf('reviews') >= 0) o.reviews = revs(x.reviews, T.max || 6);
    if (T.f.indexOf('photos') >= 0) { o._ph = await photoSet(x.photos, ctx, T.max || 6); o._ph.forEach(function(p){ want.push(p.ref); }); }
    if (T.f.indexOf('pairs') >= 0) { o._pr = []; for (const pr of arr(x.pairs).slice(0, 8)) { const b = (await photoSet([pr.b], ctx, 1))[0], a = (await photoSet([pr.a], ctx, 1))[0]; if (b && a) { want.push(b.ref, a.ref); const cap = C.text(pr.cap, 80) || a.cap || b.cap; o._pr.push({ b: b, a: a, cap: cap }); } } }
    if (T.f.indexOf('people') >= 0) { o._pp = []; for (const pp of arr(x.people).slice(0, 5)) { const nm = clip(pp.name, 40), ro = C.text(pp.role, 60); if (!nm) continue; const ph = s(pp.photo) ? (await photoSet([pp.photo], ctx, 1))[0] : null; if (ph) want.push(ph.ref); o._pp.push({ name: nm, role: ro, ph: ph }); } }
    if (x.type === 'countdown' && !opts.all && o.end && o.end < day) continue;
    slides.push(o);
  }
  /* offers: on, approved (marketing's rule), not past their end date */
  const offers = [];
  Object.keys(obj(offersDoc.offers)).map(function(k){ return offersDoc.offers[k]; }).filter(function(f){ return f && !f.del && f.on && !f.pending && (!s(f.end) || s(f.end) >= day) && (!s(f.start) || s(f.start) <= day); })
    .sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; }).slice(0, 8).forEach(function(f){
      const h = C.text(f.h, 90); if (!h) return;
      const of = { id: clip(f.id, 40), h: h, t: C.text(f.t, 220), fine: C.text(f.fine, 300), end: /^\d{4}-\d{2}-\d{2}$/.test(s(f.end)) ? s(f.end) : '', label: C.text(f.label, 60), kick: f.src === 'coupon' ? 'Limited-time offer' : 'Special offer' };
      const u = httpsUrl(f.url); if (u && !C.bad(u)) of.url = u;
      offers.push(of);
    });
  const signed = await signRefs(want);
  const U = function(p){ return p && signed[p.ref] ? { u: signed[p.ref], cap: p.cap || '' } : null; };
  slides.forEach(function(o){
    if (o._ph) { o.photos = o._ph.map(U).filter(Boolean); delete o._ph; }
    if (o._pr) { o.pairs = o._pr.map(function(pr){ const b = U(pr.b), a = U(pr.a); return b && a ? { b: { u: b.u }, a: { u: a.u }, cap: pr.cap } : null; }).filter(Boolean); delete o._pr; }
    if (o._pp) { o.people = o._pp.map(function(pp){ const ph = U(pp.ph); return { name: pp.name, role: pp.role, u: ph ? ph.u : '' }; }); delete o._pp; }
  });
  /* the maintenance tiers (what each includes — never a price that is not set) and the Handyman Day */
  const T3 = M.TIERS || {}, mp = obj(data.gc_maint_plans);
  const tiers = ['bronze', 'silver', 'gold'].filter(function(k){ return T3[k]; }).map(function(k){
    const t = T3[k], items = [s(t.visits)];
    if (+t.discount > 0) items.push(Math.round(+t.discount) + '% off repairs');
    items.push('Photo report after every visit');   /* t.note (the Gold drawing) is never shown: the owner decides it later */
    return { k: k, name: s(t.name), items: items.map(function(x){ return C.text(x, 80); }).filter(Boolean) };
  });
  let hm = arr(M.ADDONS).filter(function(a){ return a.id === 'handyman'; })[0] || null;
  const hmOver = arr(mp.addons).filter(function(a){ return a && a.id === 'handyman'; })[0]; if (hmOver) hm = Object.assign({}, hm || {}, hmOver);
  const handyman = hm && hm.priceSet === true && +hm.price > 0 ? { price: '$' + (+hm.price).toFixed(2).replace(/\.00$/, ''), note: 'Materials billed separately' } : {};
  handyman.tasks = arr(M.HANDYMAN_TASKS).filter(function(x){ return !HVAC.test(x) && !/filter|pressure[-\s]?wash/i.test(x); }).map(function(x){ return C.text(x, 60); }).filter(Boolean);
  /* GrayCo Care: the residential plans of the catalog GrayCo itself performs (no HVAC, no pressure washing, no sub-performed plan) */
  let cpl = []; try { cpl = arr((M.settingsOf ? M.settingsOf(data.gc_maint_plans) : {}).plans); } catch (e) {} if (!cpl.length) cpl = arr(M.DEFAULT_PLANS);
  const care = { plans: cpl };
  care.plans = care.plans.filter(function(p){ return p && p.on !== false && s(p.market || 'residential') === 'residential' && !p.performer && !HVAC.test(s(p.name)) && !/pressure[-\s]?wash/i.test(s(p.name)); })
    .map(function(p){ return C.text(s(p.name).replace(/^[^A-Za-z]+/, ''), 50); }).filter(Boolean);
  let referral = { min: 100, max: 500 };
  try { const rs = await fetch(sbUrl() + '/rest/v1/gc_lead_inbox_kv?select=value&key=eq.gc_ref_settings', { headers: H() }); if (rs.ok) { const rows = await rs.json(); const v = obj(rows && rows[0] && rows[0].value); const am = arr(v.tiers).map(function(t){ return +t.amount; }).filter(function(n){ return n > 0 && n < 100000; }); if (am.length) referral = { min: Math.min.apply(null, am), max: Math.max.apply(null, am) }; } } catch (e) {}
  const B = BR.BRAND || {};
  const emergency = phoneFmt(doc.emergency) || phoneFmt(process.env.TWILIO_FROM) || '(901) 582-8255';
  const states = (s(B.licenses).match(/\b(TN|AR|MS|AL|KY|MO|GA|LA|TX)\b/g) || []).filter(function(v, i, a){ return a.indexOf(v) === i; }).join(' · ');
  const out = { ok: true, at: new Date().toISOString(), interval: Math.max(12, Math.min(15, +doc.interval || 14)), slides: slides, offers: offers, tiers: tiers, handyman: handyman, referral: referral, care: care,
    brand: { name: s(B.name) || 'GrayCo Construction Services', phone: s(B.phone) || '(901) 585-0944', emergency: emergency, licenses: s(B.licenses), states: states, reviewUrl: httpsUrl(obj(mk.cfg).reviewLink) || s(B.reviewUrl) || TY.reviewUrl } };
  if (opts.co && COS[opts.co]) { out.brand.name = COS[opts.co].name; out.brand.logo = COS[opts.co].logo; out.brand.color = COS[opts.co].color; out.brand.co = opts.co; }   /* patch MITWS */
  /* patch QAB (overnight QA 11/12): a Mitigation / Environmental lobby never sends people to GrayCo Construction's Google review page or shows its
     contractor licenses — that company's own review link (🏢 Companies → its Marketing, when an admin turned it on), license line and phone, else none */
  if (opts.co && COS[opts.co]) {
    let cv = data.gc_companies; if (typeof cv === 'string') { try { cv = JSON.parse(cv); } catch (e) { cv = null; } }
    const cc = arr(cv && cv.list).filter(function(c){ return c && c.id === opts.co; })[0] || {}, mk = obj(cc.marketing), rl = s(obj(mk.accounts).reviewLink);
    out.brand.reviewUrl = mk.active === true && /^https:\/\//.test(rl) ? rl : '';
    out.brand.licenses = s(cc.license);
    out.brand.states = (s(cc.license).match(/\b(TN|AR|MS|AL|KY|MO|GA|LA|TX)\b/g) || []).filter(function(v, i, a){ return a.indexOf(v) === i; }).join(' · ');
    if (s(cc.phone)) out.brand.phone = s(cc.phone);
  }
  if (types.weather) out.weather = await weather();
  return out;
}
function digest(v){ return crypto.createHash('sha256').update(s(v)).digest(); }
const RL = new Map();
function limited(ip){ const now = Date.now(), k = s(ip) || '?', r = RL.get(k) || { at: now, n: 0 }; if (now - r.at > 10 * 60e3) { r.at = now; r.n = 0; } r.n++; RL.set(k, r); if (RL.size > 5000) RL.delete(RL.keys().next().value); return r.n > 120; }
let CACHE = { key: '', at: 0, body: null };
exports.handler = async function(event){
  const method = s(event.httpMethod).toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, headers: gcCors(event, 'GET, POST, OPTIONS', 'x-lobby-token'), body: '' };
  if (!svcKey()) return J(503, { ok: false, error: 'The lobby is not set up (no SUPABASE_SERVICE_KEY).' });
  EMERG_DIGITS = s(process.env.TWILIO_FROM).replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
  if (method === 'POST') {
    let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (e) {}
    if (body.action !== 'preview') return J(400, { ok: false, error: 'Unknown action.' });
    const who = await gcStaffAuth(event); if (!who.ok) return J(who.statusCode || 401, { ok: false, error: who.error }, gcCors(event));
    const doc = obj(body.lobby), offers = obj(body.offers), only = body.only == null || body.only === '' ? null : Math.max(0, parseInt(body.only, 10) || 0);
    try {
      const data = await build(doc, offers, { all: only != null, co: coOf(body.co) });   /* patch MITWS */
      return J(200, { ok: true, data: data, only: only == null ? null : Math.min(only, Math.max(0, data.slides.length - 1)) }, gcCors(event));
    } catch (e) { return J(500, { ok: false, error: 'The preview could not be made (' + s(e && e.message).slice(0, 120) + ').' }, gcCors(event)); }
  }
  if (method !== 'GET') return J(405, { ok: false });
  const ip = gcHeader(event, 'x-nf-client-connection-ip') || gcHeader(event, 'x-forwarded-for').split(',')[0];
  if (limited(ip)) return J(429, { ok: false, error: 'Slow down.' });
  const tok = gcHeader(event, 'x-lobby-token').trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(tok)) return J(404, NOPE);
  const co = coOf(gcHeader(event, 'x-lobby-co'));   /* patch MITWS: which company's lobby */
  try {
    const kv = await kvRead([coKey('gc_lobby_access', co)]);
    const acc = obj(kv[coKey('gc_lobby_access', co)]);
    if (!acc.on || !/^[A-Za-z0-9_-]{32,128}$/.test(s(acc.token)) || !crypto.timingSafeEqual(digest(acc.token), digest(tok))) return J(404, NOPE);
    const key = digest(tok).toString('hex') + '|' + s(acc.at) + '|' + co;
    if (CACHE.key === key && Date.now() - CACHE.at < 60e3) return J(200, CACHE.body);
    const kv2 = await kvRead([coKey('gc_lobby', co), coKey('gc_lobby_offers', co), 'gc_tv_goals']);   /* patch TVMUSIC: + the lobby's company music */
    const doc = obj(kv2[coKey('gc_lobby', co)]);
    if (!arr(doc.slides).length) doc.slides = (co ? CO_DEFAULTS[co].filter(function(k){ return TY.by[k]; }) : TY.defaults).map(function(k){ return { id: 'd_' + k, type: k, on: true }; });
    const out = await build(doc, obj(kv2[coKey('gc_lobby_offers', co)]), { co: co });
    const mu = musicUrl(obj(kv2.gc_tv_goals).lobbyMusic); if (mu) out.music = mu;   /* patch TVMUSIC */
    CACHE = { key: key, at: Date.now(), body: out };
    return J(200, out);
  } catch (e) { return J(503, { ok: false, error: 'The lobby could not be loaded right now.' }); }
};
exports._test = { coOf: coOf, coKey: coKey, cleaner: cleaner, build: build, musicUrl: musicUrl, reset: function(){ CACHE = { key: '', at: 0, body: null }; RL.clear(); WX = { at: 0, v: null }; } };
