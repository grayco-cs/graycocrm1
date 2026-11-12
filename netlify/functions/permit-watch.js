// netlify/functions/permit-watch.js — patch PERMITS: 🏗️ Permits (owner 11/12: "Can we go through building permits filed in Arkansas,
// TN, Mississippi in the leads scan … do whatever you can to make these active and scan in leads").
//
// Once a day (permit-watch-scheduled.js, netlify.toml, early morning Central) and on "Run now" this reads new building permits and
// keeps the ones that look like work for GrayCo (_lib/permits.js: the kinds of permit, the value, the damage words, the company hint):
//   · Nashville / Davidson Co. — Metro's public ArcGIS feed "Building Permits Issued" (free, no key);
//   · Shovels (api.shovels.ai, PAID) — Memphis / Shelby Co., DeSoto Co. MS, Little Rock / North Little Rock, Jonesboro … by ZIP code.
//     Active by itself once Netlify has SHOVELS_API_KEY. Credits: one pass over the ZIP list a day, at most "max per run" permits read,
//     and it stops at once on 401 / 402 / 403 / 429 (the reason shows in the status strip). (Little Rock's own open data site is retired.)
// Matches are kept in the service-only lead-inbox table (gc_lead_inbox_kv, never synced to a browser):
//   gc_permit_settings  the filters (⚙ Filters, admins)        gc_permit_status  per source: last run, read, matched, error
//   gc_permit_leads     matched permits, newest first, one per source + permit id, the last 1500 (state new / lead / dismissed)
// Nothing goes into the Lead Inbox (gc_lead_inbox) by itself — that would draft bids and alert people. A person presses
// "➕ Make it a lead" in Leads → 🏗️ Permits; the CRM makes the lead and marks the permit "lead" here.
//
// STAFF (CRM sign-in + gc_staff, the same check as x10.js), POST {action, …}:
//   list                                 → { items, status, settings, active }
//   run                                  → runs now (Shovels only if it has not run today) → { status, added }
//   settings-get / settings-set {settings}  (set: admins and the office)
//   set-state {id, state:'lead'|'dismissed'|'new', leadId?}
// PERMITS_OFF=1 stops the daily run.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first (this file only reads) */
const P = require('./_lib/permits.js');
function inbox(){ return require('./bid-inbox.js'); }
const K = { SETTINGS: 'gc_permit_settings', LEADS: 'gc_permit_leads', STATUS: 'gc_permit_status' };
const KEEP = 1500, LIST_MAX = 1500;
const SHOVELS = 'https://api.shovels.ai/v2';
const UA = 'GrayCo-CRM permit-watch (read-only)';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
/* everything that reaches outside goes through D (the tests swap it) */
const D = {
  fetch: function(u, o){ return fetch(u, o); },
  kvGet: function(k){ return inbox()._lib.kvGet(k); },
  kvCas: function(k, f){ return inbox()._lib.kvCas(k, f); },
  staffAuth: function(e){ return inbox()._test.staffAuth(e); },
  env: function(k){ return process.env[k] == null ? '' : String(process.env[k]).trim(); },
  now: function(){ return Date.now(); }
};
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function nowIso(){ return new Date(D.now()).toISOString(); }
function centralDay(ms){ try { return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); } catch (e) { return new Date(ms).toISOString().slice(0, 10); } }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function reply(code, headers, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; }
async function getJson(url, opts, ms){
  let ctl = null, timer = null;
  try { if (typeof AbortController === 'function') { ctl = new AbortController(); timer = setTimeout(function(){ try { ctl.abort(); } catch (e) {} }, ms || 12000); } } catch (e) {}
  try {
    const r = await D.fetch(url, Object.assign({ headers: { Accept: 'application/json', 'User-Agent': UA } }, opts || {}, ctl ? { signal: ctl.signal } : {}));
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    return { status: r.status, ok: !!r.ok, json: j };
  } finally { if (timer) clearTimeout(timer); }
}
async function settings(){ return P.clean(await D.kvGet(K.SETTINGS)); }
function shovelsKey(){ return D.env('SHOVELS_API_KEY'); }
function tag(p, c){ return Object.assign(p, { reasons: c.reasons, hint: c.hint, bucket: c.bucket }); }

/* ── Nashville (free) ── */
async function runNashville(S, found, t0){
  const st = { on: true, ok: false, lastRun: nowIso(), read: 0, matched: 0, error: '' };
  const since = centralDay(D.now() - S.maxAgeDays * 864e5);
  const now = D.now();
  try {
    for (let off = 0, page = 0; page < 6; page++) {
      const q = { where: "Date_Issued >= TIMESTAMP '" + since + " 00:00:00'", outFields: P.NASH_FIELDS.join(','), orderByFields: 'Date_Issued DESC', resultOffset: String(off), resultRecordCount: '1000', returnGeometry: 'false', f: 'json' };
      const r = await getJson(P.NASH_URL + '?' + new URLSearchParams(q).toString(), {}, 15000);
      if (!r.ok || !r.json) throw new Error('Nashville answered ' + r.status);
      if (r.json.error) throw new Error('Nashville: ' + clip(r.json.error.message || JSON.stringify(r.json.error), 120));
      const feats = arr(r.json.features);
      feats.forEach(function(f){ const p = P.fromNashville(f); if (!p) return; st.read++; const c = P.classify(p, S, now); if (c.match) { st.matched++; found.push(tag(p, c)); } });
      if (feats.length < 1000 && !r.json.exceededTransferLimit) break;
      off += feats.length;
    }
    st.ok = true;
  } catch (e) { st.error = clip(e && e.message || e, 200); }
  st.ms = D.now() - t0; st.window = since + ' → today';
  return st;
}

/* ── Shovels (paid; by ZIP) ── */
const STOP = { 401: 'Shovels did not accept the API key (401). Check SHOVELS_API_KEY in Netlify, then Trigger deploy.',
  403: 'Shovels refused the key (403) — the plan may not include API access.',
  402: 'Shovels says payment is needed (402) — no credits left on the plan.',
  429: 'Shovels: too many requests or the credit limit was reached (429). It tries again tomorrow.' };
async function runShovels(S, found, prev, deadline, t0){
  const key = shovelsKey();
  const base = { zipsTotal: S.shovels.zips.length, maxPerRun: S.shovels.maxPerRun };
  if (!key) return Object.assign(base, { active: false, configured: false, note: 'Not connected — add SHOVELS_API_KEY in Netlify (Owner setup → Building permits).' });
  if (!S.shovels.on) return Object.assign(base, { active: false, configured: true, note: 'Turned off in ⚙ Filters.' });
  prev = obj(prev);
  const today = centralDay(D.now());
  if (prev.day === today && prev.dayDone) return Object.assign({}, prev, base, { active: true, configured: true, skipped: true, note: 'Already ran today — one pass a day to save Shovels credits. Next: tomorrow morning.' });
  const st = Object.assign(base, { active: true, configured: true, ok: false, lastRun: nowIso(), day: today, read: 0, matched: 0, error: '', code: 0, zipErrors: [] });
  const sameDay = prev.day === today;
  st.zipsToday = sameDay ? (+prev.zipsToday || 0) : 0;
  st.readToday = sameDay ? (+prev.readToday || 0) : 0;
  const H = { 'X-API-Key': key, Accept: 'application/json', 'User-Agent': UA };
  const zips = S.shovels.zips;
  if (!zips.length) { st.ok = true; st.dayDone = true; st.note = 'No ZIP codes in ⚙ Filters.'; return st; }
  /* credits first (Shovels' own /usage) */
  try {
    const u = await getJson(SHOVELS + '/usage', { headers: H }, 8000);
    if (STOP[u.status]) { st.code = u.status; st.error = STOP[u.status]; st.dayDone = true; return st; }
    if (u.ok && u.json) {
      st.credits = { used: u.json.credits_used == null ? null : +u.json.credits_used, limit: u.json.credit_limit == null ? null : +u.json.credit_limit, over: !!u.json.is_over_limit, availableAt: s(u.json.available_at) };
      if (u.json.is_over_limit) { st.error = 'Shovels credits are used up' + (st.credits.availableAt ? ' until ' + st.credits.availableAt : '') + ' — nothing read.'; st.dayDone = true; return st; }
    }
  } catch (e) {}
  const lb = prev.lastOk ? Math.min(S.maxAgeDays, S.shovels.lookbackDays) : S.maxAgeDays;
  const from = centralDay(D.now() - lb * 864e5), to = today;
  st.window = from + ' → ' + to;
  let idx = Math.max(0, +prev.nextZip || 0) % zips.length, stopped = false, now = D.now();
  const cap = S.shovels.maxPerRun;
  try {
    while (st.zipsToday < zips.length && st.readToday < cap && D.now() < deadline) {
      const zip = zips[idx];
      let cursor = '', pages = 0;
      do {
        const size = Math.max(1, Math.min(100, cap - st.readToday));
        const q = new URLSearchParams({ geo_id: zip, permit_from: from, permit_to: to, size: String(size) });
        if (cursor) q.set('cursor', cursor);
        const r = await getJson(SHOVELS + '/permits/search?' + q.toString(), { headers: H }, 12000);
        if (STOP[r.status]) { st.code = r.status; st.error = STOP[r.status]; stopped = true; break; }
        if (r.status === 400 || r.status === 404 || r.status === 422) { st.zipErrors.push(zip + ': ' + r.status); break; }
        if (!r.ok || !r.json) throw new Error('Shovels answered ' + r.status + ' (ZIP ' + zip + ')');
        const items = arr(r.json.items);
        st.read += items.length; st.readToday += items.length;
        items.forEach(function(it){ const p = P.fromShovels(it, zip); if (!p) return; const c = P.classify(p, S, now); if (c.match) { st.matched++; found.push(tag(p, c)); } });
        cursor = items.length ? s(r.json.next_cursor) : '';
        pages++;
      } while (cursor && st.readToday < cap && pages < 20 && D.now() < deadline);
      if (stopped) break;
      st.zipsToday++; idx = (idx + 1) % zips.length;
    }
    st.ok = !stopped;
  } catch (e) { st.error = clip(e && e.message || e, 200); }
  st.nextZip = idx;
  st.dayDone = stopped || st.zipsToday >= zips.length || st.readToday >= cap;
  if (st.ok) st.lastOk = st.lastRun; else if (prev.lastOk) st.lastOk = prev.lastOk;
  if (!st.zipErrors.length) delete st.zipErrors; else st.zipErrors = st.zipErrors.slice(0, 20);
  /* the contractors' names (only for the permits that matched) */
  if (S.shovels.contractorNames && !stopped) {
    const ids = found.filter(function(p){ return p.src === 'shovels' && p.contractorId && !p.contractor; }).map(function(p){ return p.contractorId; }).filter(function(x, i, a){ return a.indexOf(x) === i; }).slice(0, 100);
    for (let i = 0; i < ids.length && D.now() < deadline; i += 50) {
      try {
        const q = new URLSearchParams(); ids.slice(i, i + 50).forEach(function(id){ q.append('id', id); });
        const r = await getJson(SHOVELS + '/contractors?' + q.toString(), { headers: H }, 8000);
        if (STOP[r.status]) { st.code = r.status; st.error = STOP[r.status]; st.dayDone = true; break; }
        if (!r.ok || !r.json) break;
        const names = {}; arr(r.json.items).forEach(function(c){ names[s(c.id)] = clip(c.business_name || c.name || c.dba, 160); });
        found.forEach(function(p){ if (p.src === 'shovels' && names[p.contractorId]) p.contractor = names[p.contractorId]; });
      } catch (e) { break; }
    }
  }
  st.ms = D.now() - t0;
  return st;
}

/* ── storing: one per source + permit id, newest first, the last 1500; what a person did is kept ── */
const SAME = ['type', 'subtype', 'desc', 'value', 'issued', 'filed', 'address', 'city', 'state', 'zip', 'contractor', 'owner', 'yearBuilt', 'hint', 'bucket'];
function sortKey(x){ return s(x.issued || x.filed || '').slice(0, 10) + '|' + s(x.firstSeen); }
async function store(found){
  const added = { nashville: 0, shovels: 0 };
  if (!found.length) return added;
  const at = nowIso();
  await D.kvCas(K.LEADS, function(cur){
    const list = arr(cur); const by = {}; list.forEach(function(x){ if (x.key) by[x.key] = x; });
    let changed = false; added.nashville = 0; added.shovels = 0;
    found.forEach(function(p){
      const k = P.keyOf(p), ex = by[k];
      if (ex) {
        const diff = SAME.some(function(f){ return JSON.stringify(ex[f]) !== JSON.stringify(p[f] == null ? ex[f] : p[f]); }) || JSON.stringify(ex.reasons) !== JSON.stringify(p.reasons);
        if (!diff) return;
        Object.keys(p).forEach(function(f){ if (p[f] != null && p[f] !== '' && f !== 'state' && f !== 'firstSeen') ex[f] = p[f]; });
        ex.updatedAt = at; changed = true; return;
      }
      const n = Object.assign({}, p, { key: k, state: 'new', firstSeen: at });
      list.push(n); by[k] = n; added[p.src] = (added[p.src] || 0) + 1; changed = true;
    });
    if (!changed) return undefined;
    list.sort(function(a, b){ const x = sortKey(a), y = sortKey(b); return x < y ? 1 : x > y ? -1 : 0; });
    return list.slice(0, KEEP);
  });
  return added;
}

/* ── one run ── */
async function run(opts){
  opts = opts || {};
  const t0 = D.now(), deadline = t0 + (opts.budgetMs || 22000);
  /* one run at a time (the morning run and a "Run now" never both spend Shovels credits) */
  let mine = false, prevStatus = {};
  await D.kvCas(K.STATUS, function(v){
    v = obj(v); prevStatus = JSON.parse(JSON.stringify(v));
    if (v.running && D.now() - Date.parse(v.running.at) < 120000) return undefined;
    v.running = { at: nowIso(), by: s(opts.by) || 'schedule' }; mine = true; return v;
  });
  if (!mine) return { ok: false, busy: true, error: 'A permit scan is running right now — try again in a minute.', status: prevStatus };
  const S = await settings();
  const found = [];
  const out = {};
  try {
    out.nashville = S.nashville.on ? await runNashville(S, found, t0) : { on: false, note: 'Turned off in ⚙ Filters.' };
    out.shovels = await runShovels(S, found, prevStatus.shovels, deadline, t0);
  } catch (e) { out.error = clip(e && e.message || e, 200); }
  let added = { nashville: 0, shovels: 0 };
  try { added = await store(found); } catch (e) { out.error = 'Could not save the permits (' + clip(e && e.message || e, 100) + ')'; }
  if (out.nashville && out.nashville.on !== false) out.nashville.added = added.nashville || 0;
  if (out.shovels && out.shovels.active && !out.shovels.skipped) out.shovels.added = added.shovels || 0;
  let status = null;
  await D.kvCas(K.STATUS, function(v){
    v = obj(v);
    if (out.nashville) v.nashville = out.nashville;
    if (out.shovels) v.shovels = out.shovels;
    v.lastRun = nowIso(); v.lastBy = s(opts.by) || 'schedule'; if (out.error) v.error = out.error; else delete v.error;
    delete v.running; status = v; return v;
  });
  return { ok: !out.error, status: status, added: added, found: found.length, error: out.error || '' };
}

/* ── the CRM's calls ── */
async function staffAction(body, who, headers){
  const action = s(body.action);
  const admin = who.admin === true || who.office === true;
  if (action === 'list') {
    const [items, st, S] = await Promise.all([D.kvGet(K.LEADS), D.kvGet(K.STATUS), settings()]);
    const all = arr(items), n = { new: 0, lead: 0, dismissed: 0 };
    all.forEach(function(x){ n[x.state] = (n[x.state] || 0) + 1; });
    return reply(200, headers, { ok: true, items: all.slice(0, Math.min(LIST_MAX, +body.limit || LIST_MAX)), total: all.length, counts: n, status: obj(st), settings: S,
      active: { nashville: S.nashville.on, shovels: !!shovelsKey() && S.shovels.on }, shovelsConfigured: !!shovelsKey(), admin: admin });
  }
  if (action === 'run') {
    const r = await run({ by: s(who.email) || 'staff', budgetMs: 8500 });
    return reply(r.busy ? 409 : 200, headers, r);
  }
  if (action === 'settings-get') return reply(200, headers, { ok: true, settings: await settings(), defaults: P.defaults(), include: P.INCLUDE, zipGroups: P.ZIP_GROUPS, admin: admin, shovelsConfigured: !!shovelsKey() });
  if (action === 'settings-set') {
    if (!admin) return reply(403, headers, { ok: false, error: 'Only an owner, an admin or the office can change the permit filters.' });
    const S = P.clean(body.settings); S.updatedAt = nowIso(); S.updatedBy = clip(who.name || who.email, 80);
    await D.kvCas(K.SETTINGS, function(){ return S; });
    return reply(200, headers, { ok: true, settings: S });
  }
  if (action === 'set-state') {
    const id = s(body.id), state = s(body.state);
    if (!id || ['lead', 'dismissed', 'new'].indexOf(state) < 0) return reply(400, headers, { ok: false, error: 'Bad request' });
    let item = null;
    await D.kvCas(K.LEADS, function(cur){
      const list = arr(cur), x = list.find(function(y){ return y.key === id; }); if (!x) return undefined;
      x.state = state; x.stateBy = clip(who.name || who.email, 80); x.stateAt = nowIso();
      if (state === 'lead' && s(body.leadId)) x.leadId = clip(body.leadId, 80);
      if (state === 'new') delete x.leadId;
      item = x; return list;
    });
    if (!item) return reply(404, headers, { ok: false, error: 'That permit is not on the list any more.' });
    return reply(200, headers, { ok: true, item: item });
  }
  return reply(400, headers, { ok: false, error: 'Bad request' });
}

exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign(cors(event), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  const q = event.queryStringParameters || {};
  try {
    if (event.httpMethod === 'GET' && q.ping === '1') return reply(200, headers, { ok: true, service: 'GrayCo permit watch' });
    if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
    if (String(event.body || '').length > 100000) return reply(413, headers, { ok: false, error: 'Too big' });
    let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
    const who = await D.staffAuth(event); if (!who || !who.ok) return reply((who && who.code) || 401, headers, { ok: false, error: (who && who.error) || 'Sign in first.' });
    return await staffAction(body, who, headers);
  } catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong: ' + clip(e && e.message || e, 120) }); }
};
exports.run = run;
exports._test = { D: D, K: K, run: run, store: store, runNashville: runNashville, runShovels: runShovels, centralDay: centralDay, STOP: STOP, KEEP: KEEP };
