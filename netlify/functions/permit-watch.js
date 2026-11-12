// netlify/functions/permit-watch.js — patch PERMITS: 🏗️ Permitted jobs (owner 11/12: "Can we go through building permits filed in Arkansas,
// TN, Mississippi in the leads scan …" — then: "permitted jobs don't alert a lead to anyone in the CRM — just have another tab 'Permitted
// jobs' and we can go through the jobs, companies that pulled them, phone numbers etc.").
//
// Once a day (permit-watch-scheduled.js, netlify.toml, early morning Central) and on "↻ Run now" this reads new building permits and
// keeps the ones that look like work for GrayCo (_lib/permits.js: the kinds of permit, the value, the damage words, the company hint):
//   · Nashville / Davidson Co. — Metro's public ArcGIS feed "Building Permits Issued" (free, no key; the contractor's NAME only);
//   · Shovels (api.shovels.ai; free key = 500 credits per rolling 30 days, ONE CREDIT PER RECORD RETURNED) — Memphis / Shelby Co.,
//     DeSoto Co. MS, Little Rock / North Little Rock, Jonesboro … by ZIP code, with what to pull set in the CRM (⚙ Filters → "What to
//     pull from Shovels": ZIP codes from a built-in county list, tags, a keyword, a minimum job value, the first window). Connected once
//     Netlify has SHOVELS_API_KEY; pulls are MANUAL ("Pull from Shovels now", after a free estimate) unless the daily pull is turned on.
//     Every pull stops at the per-pull cap (default 25) and at the credit budget (default 500 per 30 days, our own count + Shovels'
//     /usage); each ZIP only from the day after the last day pulled; everything returned is kept, so browsing never spends credits.
//     The contractor's phone / e-mail / website / license (GET /contractors, 1 credit) only when a person presses "Get phone / e-mail";
//     kept for good in gc_permit_contractors. It stops at once on 401 / 402 / 403 / 429. (Little Rock's own open data site is retired.)
// Matches are kept in the service-only lead-inbox table (gc_lead_inbox_kv, never synced to a browser):
//   gc_permit_settings  the filters (⚙ Filters, admins / office)   gc_permit_status  per source: last run, read, matched, error
//   gc_permit_leads     matched permits, newest first, one per source + permit id, the last 1500 (state new / lead / dismissed)
//   gc_permit_contractors  the Shovels contractor details by contractor id
// NO ALERTS of any kind: no e-mail, no push, no text, no To-Do, no Approvals, nothing into the Lead Inbox (gc_lead_inbox). The
// permits only show in the CRM's 🏗️ Permitted jobs tab; a person presses "➕ Make it a lead" there and the CRM makes the lead.
//
// STAFF (CRM sign-in + gc_staff, the same check as x10.js), POST {action, …}:
//   list                                 → { items, status, settings, active }
//   run                                  → Nashville now (+ Shovels only when its daily pull is on and has not run today)
//   shovels-preview                      → free estimate: the ZIPs and dates the next pull asks for, the most credits it can use
//   shovels-pull {confirm:true}          → pulls from Shovels now (admins / office), within the cap and the budget
//   contractor-lookup {contractorId}     → the contractor's phone / e-mail … (1 credit the first time, cached after)
//   zip-search {q, confirm:true}         → Shovels' ZIP search (uses credits; only when asked)
//   settings-get / settings-set {settings}  (set: admins and the office)
//   set-state {id, state:'lead'|'dismissed'|'new', leadId?}
// PERMITS_OFF=1 stops the daily run.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first (this file only reads) */
const P = require('./_lib/permits.js');
function inbox(){ return require('./bid-inbox.js'); }
const K = { SETTINGS: 'gc_permit_settings', LEADS: 'gc_permit_leads', STATUS: 'gc_permit_status', CONTRACTORS: 'gc_permit_contractors' };
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
  402: 'Shovels says the credits are used up (402). Raise the plan, or wait for the 30-day window to free credits.',
  429: 'Shovels: too many requests (429). Try again later.' };
/* Shovels charges ONE CREDIT PER RECORD RETURNED (its API docs: "one credit is one record returned"; the free key has 500 credits on a
   rolling 30-day window). So: every pull is capped by the CRM's own budget (gc_permit_status.shovels.spent — credits by day, our own
   count of the records returned) and by Shovels' own /usage when it answers; the page size is never more than what is left; each ZIP is
   pulled only from the day after the last day already pulled (an unfinished window resumes with its cursor); a ZIP already pulled
   through today is not asked at all; everything that comes back is kept (matching or not), so browsing the tab never spends credits.
   Contractor phone / e-mail costs a credit per contractor, so it is looked up only when a person presses "Get phone / e-mail", and kept. */
function addDays(day, n){ const t = Date.parse(day + 'T12:00:00Z') + n * 864e5; return new Date(t).toISOString().slice(0, 10); }
function spent30(ledger){ const since = centralDay(D.now() - 29 * 864e5); let n = 0; Object.keys(obj(ledger)).forEach(function(d){ if (d >= since) n += +ledger[d] || 0; }); return n; }
function trimLedger(ledger){ const since = centralDay(D.now() - 60 * 864e5), o = {}; Object.keys(obj(ledger)).forEach(function(d){ if (d >= since) o[d] = +ledger[d] || 0; }); return o; }
function budgetLeft(S, sh){
  sh = obj(sh);
  const ours = Math.max(0, S.shovels.budget - spent30(sh.spent));
  const u = sh.usage; let theirs = null;
  if (u && u.limit != null && u.used != null && Date.parse(u.at) > D.now() - 864e5) theirs = Math.max(0, u.limit - u.used);
  return theirs == null ? ours : Math.min(ours, theirs);
}
/* the ZIPs the next pull asks for (and the window of each) — no calls, so the preview is free */
function plan(S, sh){
  sh = obj(sh); const zs = obj(sh.zips), zips = S.shovels.zips, today = centralDay(D.now()), out = [];
  const start = zips.length ? Math.max(0, +sh.nextZip || 0) % zips.length : 0;
  for (let i = 0; i < zips.length; i++) {
    const z = zips[(start + i) % zips.length], x = obj(zs[z]);
    if (x.cursor && x.from && x.to) { out.push({ zip: z, area: P.areaOfZip(z), from: x.from, to: x.to, resume: true }); continue; }
    const from = x.through ? addDays(x.through, 1) : centralDay(D.now() - S.shovels.windowDays * 864e5);
    out.push({ zip: z, area: P.areaOfZip(z), from: from, to: today, upToDate: from > today });
  }
  return out;
}
function searchQuery(S, zip, from, to, size, cursor){
  const q = new URLSearchParams({ geo_id: zip, permit_from: from, permit_to: to, size: String(size) });
  S.shovels.tags.forEach(function(t){ q.append('permit_tags', t); });
  if (S.shovels.q) q.set('permit_q', S.shovels.q);
  if (S.shovels.minJobValue > 0) q.set('permit_min_job_value', String(Math.round(S.shovels.minJobValue * 100)));   /* cents */
  if (cursor) q.set('cursor', cursor);
  return q.toString();
}
function shovelsHeaders(){ return { 'X-API-Key': shovelsKey(), Accept: 'application/json', 'User-Agent': UA }; }
async function usage(st){
  try {
    const u = await getJson(SHOVELS + '/usage', { headers: shovelsHeaders() }, 8000);
    if (STOP[u.status]) return u.status;
    if (u.ok && u.json) st.usage = { used: u.json.credits_used == null ? null : +u.json.credits_used, limit: u.json.credit_limit == null ? null : +u.json.credit_limit, over: !!u.json.is_over_limit, availableAt: s(u.json.available_at), at: nowIso() };
  } catch (e) {}
  return 0;
}
async function runShovels(S, found, prev, deadline, t0, opts){
  opts = opts || {}; prev = obj(prev);
  const keep = { spent: trimLedger(prev.spent), zips: obj(prev.zips), nextZip: +prev.nextZip || 0, usage: prev.usage, lastPull: prev.lastPull, lastOk: prev.lastOk };
  const base = Object.assign(keep, { zipsTotal: S.shovels.zips.length, perRun: S.shovels.perRun, budget: S.shovels.budget, auto: S.shovels.auto });
  base.spent30 = spent30(base.spent);
  if (!S.shovels.on) return Object.assign(base, { active: false, configured: !!shovelsKey(), off: true, note: 'Off · for later (⚙ Admin settings → Integrations → 🏗️ Shovels).' });
  if (!shovelsKey()) return Object.assign(base, { active: false, configured: false, note: 'Switched on, but not connected — add SHOVELS_API_KEY in Netlify, then Trigger deploy.' });
  if (!S.shovels.on) return Object.assign(base, { active: false, configured: true, off: true, note: 'Turned off (⚙ Admin settings → Integrations → 🏗️ Shovels).' });
  const today = centralDay(D.now());
  if (!opts.manual) {
    if (!S.shovels.auto) return Object.assign(base, prev.lastRun ? { lastRun: prev.lastRun, read: prev.read, matched: prev.matched, added: prev.added, error: prev.error, code: prev.code } : {}, { active: true, configured: true, manualOnly: true, note: 'Pulls are manual: “Pull from Shovels now” (Integrations → 🏗️ Shovels); the daily pull is off.' });
    if (prev.autoDay === today) return Object.assign(base, { lastRun: prev.lastRun, read: prev.read, matched: prev.matched, added: prev.added, active: true, configured: true, autoDay: today, skipped: true, note: 'The daily pull already ran today.' });
  }
  const st = Object.assign(base, { active: true, configured: true, ok: false, lastRun: nowIso(), lastPull: nowIso(), by: opts.manual ? 'manual' : 'daily', read: 0, matched: 0, spentRun: 0, error: '', code: 0, zipErrors: [] });
  if (!opts.manual) st.autoDay = today;
  if (!S.shovels.zips.length) { st.ok = true; st.note = 'No ZIP codes picked (Integrations → 🏗️ Shovels).'; return st; }
  const code = await usage(st);
  if (code) { st.code = code; st.error = STOP[code]; return st; }
  if (st.usage && st.usage.over) { st.error = 'Shovels credits are used up' + (st.usage.availableAt ? ' until ' + st.usage.availableAt : '') + ' — nothing pulled.'; return st; }
  let left = Math.min(S.shovels.perRun, budgetLeft(S, st));
  st.capRun = left;
  if (left <= 0) { st.ok = true; st.note = 'The credit budget is used up (' + st.spent30 + ' of ' + S.shovels.budget + ' in the last 30 days) — nothing pulled. Raise it in Integrations → 🏗️ Shovels.'; return st; }
  const zips = S.shovels.zips, now = D.now(), spend = function(n){ st.spent[today] = (st.spent[today] || 0) + n; st.spentRun += n; left -= n; };
  let idx = Math.max(0, st.nextZip) % zips.length, stopped = false, asked = 0;
  try {
    for (let i = 0; i < zips.length && left > 0 && D.now() < deadline && !stopped; i++) {
      const z = zips[idx], x = obj(st.zips[z]);
      let from, to, cursor = '';
      if (x.cursor && x.from && x.to) { from = x.from; to = x.to; cursor = x.cursor; }
      else { from = x.through ? addDays(x.through, 1) : centralDay(now - S.shovels.windowDays * 864e5); to = today; }
      if (from > to) { idx = (idx + 1) % zips.length; continue; }   /* pulled through today already: not asked again */
      let done = false, retried = false;
      while (left > 0 && D.now() < deadline) {
        const size = Math.max(1, Math.min(100, left));
        const r = await getJson(SHOVELS + '/permits/search?' + searchQuery(S, z, from, to, size, cursor), { headers: shovelsHeaders() }, 12000);
        asked++;
        if (STOP[r.status]) { st.code = r.status; st.error = STOP[r.status]; stopped = true; break; }
        if ((r.status === 400 || r.status === 422) && cursor && !retried) { cursor = ''; retried = true; continue; }   /* an old cursor: the window again */
        if (r.status === 400 || r.status === 404 || r.status === 422) { st.zipErrors.push(z + ': ' + r.status); done = true; break; }
        if (!r.ok || !r.json) throw new Error('Shovels answered ' + r.status + ' (ZIP ' + z + ')');
        const items = arr(r.json.items);
        spend(items.length); st.read += items.length;
        items.forEach(function(it){
          const p = P.fromShovels(it, z); if (!p) return;
          const c = P.classify(p, S, now);
          if (c.match) { st.matched++; found.push(tag(p, c)); }
          else found.push(Object.assign(p, { reasons: [], hint: 'construction', bucket: c.bucket, nomatch: true, why: c.why }));   /* paid for: kept, shown under "Pulled, not matching" */
        });
        cursor = items.length ? s(r.json.next_cursor) : '';
        if (!cursor) { done = true; break; }
      }
      if (stopped) break;
      if (done) { st.zips[z] = { through: to, at: nowIso() }; idx = (idx + 1) % zips.length; }
      else { st.zips[z] = { through: x.through || '', from: from, to: to, cursor: cursor, at: nowIso() }; break; }   /* the cap or the clock: this ZIP resumes next time */
    }
    st.ok = !stopped;
  } catch (e) { st.error = clip(e && e.message || e, 200); }
  st.nextZip = idx; st.asked = asked;
  st.spent30 = spent30(st.spent); st.left = budgetLeft(S, st);
  if (st.ok) st.lastOk = st.lastRun;
  if (!st.zipErrors.length) delete st.zipErrors; else st.zipErrors = st.zipErrors.slice(0, 20);
  /* contractors already looked up (on demand earlier) go on the new permits for free */
  try { const cache = obj(await D.kvGet(K.CONTRACTORS)); found.forEach(function(p){ if (p.src === 'shovels' && p.contractorId && cache[p.contractorId]) applyContractor(p, cache[p.contractorId]); }); } catch (e) {}
  st.ms = D.now() - t0;
  return st;
}

/* ── the contractors (Shovels GET /contractors?id=…; ONE credit each) — only when a person asks, kept for good in gc_permit_contractors ── */
function phoneOf(v){ return clip(String(v == null ? '' : v).split(/[,;|]/)[0], 40); }
function contractorRow(c){
  const a = c.address || {};
  return { name: clip(c.business_name || c.name || c.dba, 160), person: c.business_name && c.name && c.name !== c.business_name ? clip(c.name, 120) : '',
    phone: phoneOf(c.primary_phone || c.phone), phones: clip(c.phone, 120), email: clip(String(c.primary_email || c.email || '').split(/[,;\s]+/)[0], 120), website: clip(c.website, 200),
    license: clip(c.license, 60), classification: clip(c.classification || arr(c.classification_derived).join(', '), 120),
    address: clip([s(a.street_no), s(a.street), s(a.city), [s(a.state), s(a.zip_code)].filter(Boolean).join(' ')].filter(Boolean).join(' ').replace(/\s+/g, ' '), 200),
    permitCount: c.permit_count == null ? null : +c.permit_count, at: nowIso() };
}
function applyContractor(p, c){
  if (!c) return;
  if (c.name) p.contractor = c.name;
  ['phone', 'email', 'website', 'license', 'address'].forEach(function(f){ if (c[f]) p['contractor' + f[0].toUpperCase() + f.slice(1)] = c[f]; });
  p.contractorLooked = true;
}
async function contractorLookup(id, who){
  id = s(id); if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) return { ok: false, code: 400, error: 'Bad contractor id.' };
  const cache = obj(await D.kvGet(K.CONTRACTORS));
  let c = cache[id], spentNow = 0;
  if (!c) {
    if (!shovelsKey()) return { ok: false, code: 400, error: 'Shovels is not connected (SHOVELS_API_KEY).' };
    const S = await settings(), st0 = obj(obj(await D.kvGet(K.STATUS)).shovels);
    if (budgetLeft(S, st0) < 1) return { ok: false, code: 402, error: 'The Shovels credit budget is used up — raise it in Integrations → 🏗️ Shovels.' };
    const r = await getJson(SHOVELS + '/contractors?id=' + encodeURIComponent(id), { headers: shovelsHeaders() }, 8000);
    if (STOP[r.status]) return { ok: false, code: r.status, error: STOP[r.status] };
    if (!r.ok || !r.json) return { ok: false, code: 502, error: 'Shovels answered ' + r.status + '.' };
    const items = arr(r.json.items); spentNow = items.length;
    const row = items.filter(function(x){ return s(x.id) === id; })[0] || items[0];
    const today = centralDay(D.now());
    await D.kvCas(K.STATUS, function(v){ v = obj(v); const sh = obj(v.shovels); sh.spent = trimLedger(sh.spent); sh.spent[today] = (sh.spent[today] || 0) + spentNow; sh.spent30 = spent30(sh.spent); v.shovels = sh; return v; });
    c = row ? contractorRow(row) : { name: '', none: true, at: nowIso() };
    c.by = clip(who, 80);
    await D.kvCas(K.CONTRACTORS, function(v){ v = obj(v); v[id] = c; return v; });
  }
  let n = 0;
  await D.kvCas(K.LEADS, function(cur){
    const list = arr(cur); let ch = false;
    list.forEach(function(p){ if (p.src === 'shovels' && p.contractorId === id) { applyContractor(p, c); n++; ch = true; } });
    return ch ? list : undefined;
  });
  return { ok: true, contractor: c, permits: n, spent: spentNow, cached: !spentNow };
}
async function zipSearch(q){
  q = clip(q, 40); if (!q) return { ok: false, code: 400, error: 'Type a city or ZIP.' };
  if (!shovelsKey()) return { ok: false, code: 400, error: 'Shovels is not connected (SHOVELS_API_KEY).' };
  const S = await settings(), st0 = obj(obj(await D.kvGet(K.STATUS)).shovels), size = Math.min(5, budgetLeft(S, st0));
  if (size < 1) return { ok: false, code: 402, error: 'The Shovels credit budget is used up.' };
  const r = await getJson(SHOVELS + '/zipcodes/search?' + new URLSearchParams({ q: q, size: String(size) }).toString(), { headers: shovelsHeaders() }, 8000);
  if (STOP[r.status]) return { ok: false, code: r.status, error: STOP[r.status] };
  if (!r.ok || !r.json) return { ok: false, code: 502, error: 'Shovels answered ' + r.status + '.' };
  const items = arr(r.json.items), today = centralDay(D.now());
  await D.kvCas(K.STATUS, function(v){ v = obj(v); const sh = obj(v.shovels); sh.spent = trimLedger(sh.spent); sh.spent[today] = (sh.spent[today] || 0) + items.length; sh.spent30 = spent30(sh.spent); v.shovels = sh; return v; });
  return { ok: true, items: items.map(function(z){ return { id: s(z.geo_id || z.id), zip: s(z.zip_code || z.name || z.geo_id), name: s(z.name || z.city), state: s(z.state) }; }), spent: items.length };
}

/* ── storing: one per source + permit id, newest first, the last 1500; what a person did is kept ── */
const SAME = ['type', 'subtype', 'desc', 'value', 'issued', 'filed', 'address', 'city', 'usState', 'zip', 'contractor', 'contractorPhone', 'contractorEmail', 'contractorWebsite', 'contractorLicense', 'contractorAddress', 'owner', 'yearBuilt', 'hint', 'bucket', 'nomatch'];
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
        if (!p.nomatch) { delete ex.nomatch; delete ex.why; }
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
    if (opts.shovelsOnly !== true) out.nashville = S.nashville.on ? await runNashville(S, found, t0) : { on: false, note: 'Turned off in ⚙ Filters.' };
    if (opts.nashvilleOnly !== true) out.shovels = await runShovels(S, found, prevStatus.shovels, deadline, t0, { manual: opts.manualShovels === true });
  } catch (e) { out.error = clip(e && e.message || e, 200); }
  let added = { nashville: 0, shovels: 0 };
  try { added = await store(found); } catch (e) { out.error = 'Could not save the permits (' + clip(e && e.message || e, 100) + ')'; }
  if (out.nashville && out.nashville.on !== false) out.nashville.added = added.nashville || 0;
  if (out.shovels && out.shovels.lastPull && !out.shovels.skipped && !out.shovels.manualOnly) out.shovels.added = added.shovels || 0;
  let status = null;
  await D.kvCas(K.STATUS, function(v){
    v = obj(v);
    if (out.nashville) v.nashville = out.nashville;
    if (out.shovels) { const cur = obj(v.shovels); out.shovels.spent = Object.assign({}, obj(cur.spent), out.shovels.spent); out.shovels.spent30 = spent30(out.shovels.spent); v.shovels = out.shovels; }   /* a contractor look-up during the pull keeps its credits */
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
    const stO = obj(st); if (stO.shovels) { stO.shovels = Object.assign({}, stO.shovels, { spent30: spent30(stO.shovels.spent), left: budgetLeft(S, stO.shovels) }); delete stO.shovels.zips; }
    return reply(200, headers, { ok: true, items: all.slice(0, Math.min(LIST_MAX, +body.limit || LIST_MAX)), total: all.length, counts: n, status: stO, settings: S,
      active: { nashville: S.nashville.on, shovels: !!shovelsKey() && S.shovels.on }, shovelsConfigured: !!shovelsKey(), admin: admin });
  }
  if (action === 'run') {   /* ↻ Run now: Nashville (free); Shovels only when its daily pull is on and has not run today */
    const r = await run({ by: s(who.email) || 'staff', budgetMs: 8500 });
    return reply(r.busy ? 409 : 200, headers, r);
  }
  if (action === 'shovels-preview') {   /* free: no call to Shovels */
    const [S, st] = await Promise.all([settings(), D.kvGet(K.STATUS)]); const sh = obj(obj(st).shovels), left = budgetLeft(S, sh), pl = plan(S, sh);
    const ask = pl.filter(function(z){ return !z.upToDate; });
    return reply(200, headers, { ok: true, configured: !!shovelsKey(), maxCredits: Math.min(S.shovels.perRun, left), perRun: S.shovels.perRun, budget: S.shovels.budget, spent30: spent30(sh.spent), left: left, usage: sh.usage || null,
      zips: ask.slice(0, 60), upToDate: pl.length - ask.length, search: { tags: S.shovels.tags, q: S.shovels.q, minJobValue: S.shovels.minJobValue, windowDays: S.shovels.windowDays } });
  }
  if (action === 'shovels-pull') {   /* "Pull from Shovels now" — never more than the per-pull cap or what is left of the budget */
    if (!admin) return reply(403, headers, { ok: false, error: 'Only an owner, an admin or the office can pull from Shovels (it uses credits).' });
    if (body.confirm !== true) return reply(400, headers, { ok: false, error: 'Look at the estimate first (it uses credits).' });
    const r = await run({ by: s(who.email) || 'staff', budgetMs: 8500, shovelsOnly: true, manualShovels: true });
    return reply(r.busy ? 409 : 200, headers, r);
  }
  if (action === 'contractor-lookup') {   /* "Get phone / e-mail": 1 credit the first time, free after that */
    const r = await contractorLookup(body.contractorId, who.name || who.email);
    return reply(r.ok ? 200 : (r.code || 400), headers, r);
  }
  if (action === 'zip-search') {   /* only when a person asks: uses a credit per ZIP found */
    if (!admin) return reply(403, headers, { ok: false, error: 'Only an owner, an admin or the office can search Shovels (it uses credits).' });
    if (body.confirm !== true) return reply(400, headers, { ok: false, error: 'This uses Shovels credits — confirm first.' });
    const r = await zipSearch(body.q);
    return reply(r.ok ? 200 : (r.code || 400), headers, r);
  }
  if (action === 'settings-get') return reply(200, headers, { ok: true, settings: await settings(), defaults: P.defaults(), include: P.INCLUDE, zipGroups: P.ZIP_GROUPS, tags: P.SHOVELS_TAGS, admin: admin, shovelsConfigured: !!shovelsKey() });
  if (action === 'settings-set') {
    if (!admin) return reply(403, headers, { ok: false, error: 'Only an owner, an admin or the office can change the permit filters.' });
    const cur = await settings(), nv = body.settings && typeof body.settings === 'object' ? body.settings : {};
    const S = P.clean(Object.assign({}, cur, nv, { nashville: Object.assign({}, cur.nashville, nv.nashville || {}), shovels: Object.assign({}, cur.shovels, nv.shovels || {}) }));   /* ⚙ Filters and Integrations → Shovels each send their own part */
    S.updatedAt = nowIso(); S.updatedBy = clip(who.name || who.email, 80);
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
exports._test = { D: D, K: K, run: run, store: store, runNashville: runNashville, runShovels: runShovels, plan: plan, budgetLeft: budgetLeft, spent30: spent30, contractorLookup: contractorLookup, centralDay: centralDay, STOP: STOP, KEEP: KEEP };
