// netlify/functions/x10.js — patch X10: the CRM's side of 📟 on call, 🚚 vehicles & gas, 🎯 the company goal,
// 📊 "My data", 🏠 home profiles and 💬 testimonials. Plus the public ✅ Accept link of an on-call page.
//
// STAFF (CRM sign-in + gc_staff), POST {action, …}:
//   oncall-get                         → the rotation, who is on call now, after hours or not, the last pages
//   oncall-set {cfg}                   → admins and the mitigation profile: the rotation / hours / holidays / minutes
//   fleet-get                          → vehicles + gas (admins: all; everyone else: the ones they drive)
//   fleet-set {vehicle}                → admins: add / change / retire a vehicle
//   fleet-log {vehicleId, miles?, oil?:true, gas?:{date, amount, gallons, note}}  → the driver or an admin
//   goal-get / goal-set {goal, basis}  → the yearly revenue goal (admins set it)
//   mydata-get {email?}                → the server's numbers for me (admins: anyone) + the last commission snapshot
//   mydata-snap {email, name, snap}    → the CRM's commission statement for that person (themselves, or an admin)
//   home-get {pid} / home-set {pid, fields}   → the job's home profile (staff; edits kept with who + when)
//   testimonials / testimonial-set {id, status: 'approved'|'hidden'|'new', note?}
// PUBLIC: GET ?accept=<pageId>&e=<email>&s=<sig> → accepts the on-call page (HMAC-signed link from the page e-mail).
// Everything is kept in the service-only lead-inbox table (never synced to a browser): gc_x10_*.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const X = require('./_lib/x10.js');
const OC = require('./_lib/oncall.js');
function inbox(){ return require('./bid-inbox.js'); }
function L(){ return inbox()._lib; }
function C(){ return require('./portal.js')._core; }
const K = { FLEET: 'gc_x10_fleet', GAS: 'gc_x10_gas', GOAL: 'gc_x10_goal', MYDATA: 'gc_x10_mydata', HOME: 'gc_x10_home', TESTI: 'gc_x10_testimonials', CODES: 'gc_x10_codes', INSP: 'gc_x10_insp', INSP_TPL: 'gc_x10_insp_tpl', SUBAVAIL: 'gc_x10_subavail' };
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : (v && Array.isArray(v.list) ? v.list : []); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function reply(code, headers, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; }
function nowIso(){ return new Date(typeof exports._now === 'function' ? exports._now() : Date.now()).toISOString(); }
function oc(){ return OC.make({ env: function(k){ return s(process.env[k]); }, kvGet: L().kvGet, kvCas: L().kvCas, now: exports._now, push: function(to, p){ return C().pushTo(to, p); } }); }
async function profileOf(email){
  try { const r = await L().sb('gc_staff?select=profile&email=eq.' + encodeURIComponent(low(email))); if (r.ok) { const row = ((await r.json()) || [])[0]; return low(row && row.profile); } } catch (e) {}
  return '';
}
async function listGet(key){ return arr(await L().kvGet(key)); }
async function listSet(key, fn){ return L().kvCas(key, function(v){ const l = arr(v).slice(); const n = fn(l); return n === undefined ? undefined : n; }); }

/* ── the public Accept link ── */
async function acceptPage(event){
  const q = event.queryStringParameters || {};
  const r = await oc().accept(s(q.accept), low(q.e), s(q.s));
  const page = function(title, body, ok){ return { statusCode: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GrayCo on call</title><div style="font:17px Arial;max-width:520px;margin:30px auto;padding:0 16px;color:#1b1640"><div style="text-align:center;margin:0 0 16px"><img src="/portal-logo.png" alt="GrayCo Construction Services" width="170" style="width:170px;max-width:60%;height:auto;display:inline-block"></div><h2>' + esc(title) + '</h2>' + body + '<p style="text-align:center;font-size:13px;color:#55626F;margin:18px 0 0">GrayCo Construction Services · <a href="tel:9015850944" style="color:inherit">(901) 585-0944</a></p></div>' }; };   /* patch PORTALLOGO */
  if (!r.ok) return page('This link does not work', '<p>It may be old or cut off. Open the CRM → 💧 Mitigation → 📟 On call.</p>', false);
  const p = r.page, c = p.contact || {}, mine = low(p.acceptedBy) === low(q.e);
  return page(mine ? '✅ You have it' : 'Already taken', (mine ? '<p>Thanks — it is logged on the lead. Nobody else will be paged.</p>' : '<p>' + esc(p.acceptedName || p.acceptedBy) + ' accepted it at ' + esc(new Date(p.acceptedAt).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })) + '.</p>') +
    '<p><b>' + esc(p.title) + '</b><br>' + esc(p.detail) + '</p>' + (c.phone ? '<p><a href="tel:' + esc(s(c.phone).replace(/[^\d+]/g, '')) + '" style="font-size:20px;font-weight:700">📞 Call ' + esc(c.name || '') + ' ' + esc(c.phone) + '</a></p>' : ''), true);
}

/* ── the home profile: what the job shows by itself + what the PM wrote ── */
const HOME_FIELDS = [['roof', 'Roof (brand, line, color)'], ['siding', 'Siding / exterior'], ['paintExt', 'Exterior paint colors'], ['paintInt', 'Interior paint colors'], ['gutters', 'Gutters'],
  ['windows', 'Windows & doors'], ['flooring', 'Flooring'], ['cabinets', 'Cabinets & countertops'], ['fixtures', 'Fixtures & finishes'], ['hvac', 'HVAC / water heater'], ['notes', 'Other notes for the homeowner']];
function homeAuto(data, p){
  const out = {};
  try {
    const sel = require('./selections.js')._sel;
    const ch = typeof sel.choicesOf === 'function' ? sel.choicesOf(data, p) : [];
    const resps = arr(data.selectionResponses);
    ch.forEach(function(c){
      const st = sel.stateOf(c, resps); if (!st || !st.pick) return;
      const cat = low(c.cat), val = [s(c.brand), s(c.line), s(st.pick.label || st.pick.color)].filter(Boolean).join(' — ');
      const k = /roof|shingle/.test(cat) ? 'roof' : /sid|exterior|trim/.test(cat) ? 'siding' : /paint/.test(cat) ? (/ext/.test(cat) ? 'paintExt' : 'paintInt') : /gutter/.test(cat) ? 'gutters'
        : /window|door/.test(cat) ? 'windows' : /floor|tile|carpet|lvp/.test(cat) ? 'flooring' : /cabinet|counter|granite|quartz/.test(cat) ? 'cabinets' : 'fixtures';
      out[k] = out[k] ? out[k] + '; ' + (s(c.cat) ? s(c.cat) + ': ' : '') + val : (k === 'fixtures' && s(c.cat) ? s(c.cat) + ': ' : '') + val;
    });
  } catch (e) {}
  const shingle = [s(p.shingleBrand || p.shingleMfr), s(p.shingleLine || p.shingleType), s(p.shingleColor)].filter(Boolean).join(' ');
  if (shingle && !out.roof) out.roof = shingle;
  return out;
}
async function homeRecord(pid){ const l = await listGet(K.HOME); return l.find(function(x){ return s(x.pid) === s(pid); }) || null; }

async function staffAction(event, headers, body, who){
  const action = s(body.action);
  const prof = who.admin ? 'admin' : await profileOf(who.email);
  if (action === 'oncall-get') {
    const o = oc(), c = await o.cfg(), t = typeof exports._now === 'function' ? exports._now() : Date.now();
    const pages = (await o.pages()).slice(-60).reverse().map(function(p){ return { id: p.id, leadKey: p.leadKey, title: p.title, detail: p.detail, source: p.source, createdAt: p.createdAt, step: p.step || 0,
      chain: (p.chain || []).map(function(x){ return x.name || x.email; }), acceptedAt: p.acceptedAt || '', acceptedBy: p.acceptedName || p.acceptedBy || '', adminsAt: p.adminsAt || '' }; });
    return reply(200, headers, { ok: true, cfg: c, now: X.onCallNow(t, c), afterHours: X.afterHours(t, c), canEdit: who.admin || prof === 'mitigation', pages: pages });
  }
  if (action === 'oncall-set') {
    if (!(who.admin || prof === 'mitigation')) return reply(403, headers, { ok: false, error: 'Only an admin or the mitigation lead sets the on-call rotation.' });
    const c = X.oncallCfg(body.cfg); c.updatedAt = nowIso(); c.updatedBy = who.email;
    await L().kvCas(OC.KCFG, function(){ return c; });
    return reply(200, headers, { ok: true, cfg: c });
  }
  if (action === 'fleet-get') {
    const v = await listGet(K.FLEET), g = await listGet(K.GAS);
    const mineV = who.admin ? v : v.filter(function(x){ return low(x.driver) === low(who.email); });
    const ids = {}; mineV.forEach(function(x){ ids[x.id] = 1; });
    const today = X.wall(Date.now()).day;
    return reply(200, headers, { ok: true, admin: !!who.admin, vehicles: mineV.map(function(x){ return Object.assign({}, x, { due: X.vehicleDue(x, today) }); }),
      gas: g.filter(function(x){ return !x.deleted && (who.admin || ids[x.vehicleId] || low(x.driver) === low(who.email)); }).slice(-800) });
  }
  if (action === 'fleet-set') {
    if (!who.admin) return reply(403, headers, { ok: false, error: 'Only an admin adds or changes vehicles.' });
    const v = X.vehicleClean(body.vehicle); if (!v.name) return reply(400, headers, { ok: false, error: 'Give the vehicle a name (e.g. "2019 F-150 white").' });
    if (!v.id) v.id = 'VH-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    v.updatedAt = nowIso(); v.updatedBy = who.email;
    await listSet(K.FLEET, function(l){ const i = l.findIndex(function(x){ return x.id === v.id; }); if (i >= 0) l[i] = Object.assign({}, l[i], v); else l.push(v); return l; });
    return reply(200, headers, { ok: true, vehicle: v });
  }
  if (action === 'fleet-log') {
    const v = (await listGet(K.FLEET)).find(function(x){ return x.id === s(body.vehicleId); });
    if (!v) return reply(404, headers, { ok: false, error: 'No such vehicle.' });
    if (!who.admin && low(v.driver) !== low(who.email)) return reply(403, headers, { ok: false, error: 'Only its driver or an admin logs this vehicle.' });
    const at = nowIso(), miles = Math.round(Number(body.miles) || 0);
    if (miles || body.oil === true) {
      await listSet(K.FLEET, function(l){ const x = l.find(function(y){ return y.id === v.id; }); if (!x) return undefined;
        if (miles) { if (miles < (x.miles || 0) - 50) return undefined; x.miles = miles; x.milesAt = at; }
        if (body.oil === true) { x.oilAtMiles = x.miles || miles || 0; x.oilDate = at.slice(0, 10); }
        x.log = (x.log || []).concat([{ at: at, by: who.email, miles: miles || undefined, oil: body.oil === true || undefined }]).slice(-200); x.updatedAt = at; return l; });
    }
    const g = body.gas && typeof body.gas === 'object' ? body.gas : null;
    if (g) {
      const amount = Math.round(Number(String(g.amount).replace(/[$,]/g, '')) * 100) / 100;
      if (!(amount > 0 && amount < 2000)) return reply(400, headers, { ok: false, error: 'Enter the gas amount.' });
      const rec = { id: 'GS-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), vehicleId: v.id, driver: low(v.driver) || low(who.email), date: /^\d{4}-\d{2}-\d{2}$/.test(s(g.date)) ? s(g.date) : at.slice(0, 10),
        amount: amount, gallons: Math.round((Number(g.gallons) || 0) * 100) / 100 || undefined, how: /^(card|receipt|cash)$/.test(s(g.how)) ? s(g.how) : 'card', note: clip(g.note, 200), by: who.email, at: at };
      await listSet(K.GAS, function(l){ return l.concat([rec]).slice(-5000); });
    }
    return reply(200, headers, { ok: true });
  }
  if (action === 'goal-get') return reply(200, headers, { ok: true, goal: (await L().kvGet(K.GOAL)) || null, canEdit: !!who.admin });
  if (action === 'goal-set') {
    if (!who.admin) return reply(403, headers, { ok: false, error: 'Only an admin sets the company goal.' });
    const goal = Math.round(Number(String(body.goal).replace(/[$,]/g, '')) || 0); if (!(goal > 0)) return reply(400, headers, { ok: false, error: 'Enter the yearly revenue goal.' });
    const rec = { goal: goal, year: /^\d{4}$/.test(s(body.year)) ? s(body.year) : nowIso().slice(0, 4), basis: s(body.basis) === 'billed' ? 'billed' : 'collected', by: who.email, at: nowIso() };
    await L().kvCas(K.GOAL, function(){ return rec; });
    return reply(200, headers, { ok: true, goal: rec });
  }
  if (action === 'mydata-get') {
    const email = low(body.email) || low(who.email);
    if (email !== low(who.email) && !who.admin) return reply(403, headers, { ok: false, error: 'You can only see your own numbers.' });
    const data = await C().crmData(false);
    const u = arr(data.users).find(function(x){ return low(x.email) === email; }) || {};
    const month = nowIso().slice(0, 7);
    const nums = X.personNumbers(email, s(u.name || body.name), data, month, { invoices: function(d){ return arr(d.invs).concat(arr(d.invoices)).filter(C().isCustomerInvoice); }, invAmount: C().invAmount, invBalance: C().invBalance });
    const snaps = await L().kvGet(K.MYDATA) || {};
    return reply(200, headers, { ok: true, email: email, name: s(u.name), numbers: nums, snap: snaps[email] || null });
  }
  if (action === 'mydata-snap') {
    const email = low(body.email); if (!email) return reply(400, headers, { ok: false });
    if (email !== low(who.email) && !who.admin) return reply(403, headers, { ok: false, error: 'You can only save your own.' });
    const snap = body.snap && typeof body.snap === 'object' ? body.snap : {};
    const clean = { at: nowIso(), by: who.email, name: clip(body.name, 80), expected: X.r2(snap.expected), paid: X.r2(snap.paid), pending: X.r2(snap.pending), jobs: (Array.isArray(snap.jobs) ? snap.jobs : []).slice(0, 80).map(function(j){ return { name: clip(j.name, 80), po: clip(j.po, 20), share: X.r2(j.share), state: clip(j.state, 20) }; }) };
    await L().kvCas(K.MYDATA, function(v){ v = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; v[email] = clean; return v; });
    return reply(200, headers, { ok: true });
  }
  if (action === 'home-get') {
    const data = await C().crmData(false), p = C().findProject(data, s(body.pid)); if (!p) return reply(404, headers, { ok: false, error: 'The job is not in the cloud yet.' });
    const rec = await homeRecord(p.id);
    const selD = await C().kvRead(['selectionChoices', 'selectionResponses']).catch(function(){ return {}; });
    return reply(200, headers, { ok: true, fields: HOME_FIELDS, auto: homeAuto(Object.assign({}, data, selD), p), saved: rec ? rec.fields || {} : {}, history: rec ? (rec.history || []).slice(-20) : [] });
  }
  if (action === 'home-set') {
    const pid = s(body.pid), f = body.fields && typeof body.fields === 'object' ? body.fields : {};
    const clean = {}; HOME_FIELDS.forEach(function(x){ if (x[0] in f) clean[x[0]] = clip(f[x[0]], 400); });
    const at = nowIso();
    await listSet(K.HOME, function(l){ let r = l.find(function(x){ return s(x.pid) === pid; }); if (!r) { r = { pid: pid, fields: {}, history: [] }; l.push(r); }
      r.fields = Object.assign({}, r.fields, clean); r.updatedAt = at; r.history = (r.history || []).concat([{ at: at, by: who.name || who.email, keys: Object.keys(clean) }]).slice(-40); return l; });
    return reply(200, headers, { ok: true });
  }
  if (action === 'testimonials') {
    const l = (await listGet(K.TESTI)).filter(function(x){ return !x.deleted; }).slice(-500).reverse();
    return reply(200, headers, { ok: true, list: l });
  }
  if (action === 'testimonial-set') {
    const id = s(body.id), st = /^(approved|hidden|new)$/.test(s(body.status)) ? s(body.status) : '';
    if (!st) return reply(400, headers, { ok: false });
    await listSet(K.TESTI, function(l){ const t = l.find(function(x){ return x.id === id; }); if (!t) return undefined;
      if (st === 'approved' && !t.permission) return undefined;   /* only with the customer's permission */
      t.status = st; t.reviewedBy = who.name || who.email; t.reviewedAt = nowIso(); if (body.note != null) t.note = clip(body.note, 300); return l; });
    return reply(200, headers, { ok: true });
  }
  /* ── 🔐 access codes (lockbox / gate / door) — service-only, revealed one at a time with a log ── */
  if (/^codes-/.test(action)) {
    const data = await C().crmData(false), p = C().findProject(data, s(body.pid)); if (!p) return reply(404, headers, { ok: false, error: 'The job is not in the cloud yet.' });
    const u = arr(data.users).find(function(x){ return low(x.email) === low(who.email); }) || {};
    const allowed = who.admin || X.onJobTeam(p, low(who.email), low(u.name || who.name));
    if (!allowed) return reply(403, headers, { ok: false, error: 'Only the job’s PM, APM, superintendent or an admin can see its access codes.' });
    if (X.jobClosed(p)) { await listSet(K.CODES, function(l){ const n = l.filter(function(x){ return s(x.pid) !== s(p.id); }); return n.length === l.length ? undefined : n; }); return reply(200, headers, { ok: true, codes: [], closed: true }); }
    const at = nowIso(), by = who.name || who.email;
    if (action === 'codes-get') { const r = (await listGet(K.CODES)).find(function(x){ return s(x.pid) === s(p.id); }); return reply(200, headers, { ok: true, codes: r ? arr(r.codes).map(function(c){ return { id: c.id, label: c.label, last: '•'.repeat(Math.min(6, s(c.code).length)), addedBy: c.addedBy, at: c.at }; }) : [], log: r ? arr(r.log).slice(-30).reverse() : [] }); }
    if (action === 'codes-add') {
      const code = clip(body.code, 60), label = clip(body.label, 60) || 'Lockbox'; if (!code) return reply(400, headers, { ok: false, error: 'Enter the code.' });
      const id = 'AC-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await listSet(K.CODES, function(l){ let r = l.find(function(x){ return s(x.pid) === s(p.id); }); if (!r) { r = { pid: s(p.id), codes: [], log: [] }; l.push(r); } r.codes = arr(r.codes).concat([{ id: id, label: label, code: code, addedBy: by, at: at }]).slice(-12); r.log = arr(r.log).concat([{ at: at, by: by, what: 'added ' + label }]).slice(-200); return l; });
      return reply(200, headers, { ok: true, id: id });
    }
    if (action === 'codes-reveal' || action === 'codes-del') {
      let out = null;
      await listSet(K.CODES, function(l){ const r = l.find(function(x){ return s(x.pid) === s(p.id); }); if (!r) return undefined; const c = arr(r.codes).find(function(x){ return x.id === s(body.id); }); if (!c) return undefined;
        out = c; if (action === 'codes-del') r.codes = arr(r.codes).filter(function(x){ return x.id !== c.id; });
        r.log = arr(r.log).concat([{ at: at, by: by, what: (action === 'codes-del' ? 'removed ' : 'revealed ') + c.label }]).slice(-200); return l; });
      if (!out) return reply(404, headers, { ok: false, error: 'No such code.' });
      return reply(200, headers, action === 'codes-del' ? { ok: true } : { ok: true, label: out.label, code: out.code });
    }
  }
  /* ── 📋 permit & inspection checklists (per city templates, admin-editable) ── */
  if (action === 'insp-tpl-get') { const v = await L().kvGet(K.INSP_TPL); return reply(200, headers, { ok: true, templates: X.inspTemplates(v), canEdit: !!who.admin }); }
  if (action === 'insp-tpl-set') {
    if (!who.admin) return reply(403, headers, { ok: false, error: 'Only an admin changes the inspection templates.' });
    const t = X.inspTemplates(body.templates); t.updatedAt = nowIso(); t.by = who.email;
    await L().kvCas(K.INSP_TPL, function(){ return t; }); return reply(200, headers, { ok: true, templates: t });
  }
  if (action === 'insp-get' || action === 'insp-set') {
    const data = await C().crmData(false), p = C().findProject(data, s(body.pid)); if (!p) return reply(404, headers, { ok: false, error: 'The job is not in the cloud yet.' });
    const tpl = X.inspTemplates(await L().kvGet(K.INSP_TPL));
    let rec = (await listGet(K.INSP)).find(function(x){ return s(x.pid) === s(p.id); }) || null;
    if (action === 'insp-get') return reply(200, headers, { ok: true, rec: rec, suggest: X.inspFor(p, tpl), cities: Object.keys(tpl.cities) });
    const at = nowIso(), by = who.name || who.email, b = body;
    let failed = null;
    await listSet(K.INSP, function(l){
      let r = l.find(function(x){ return s(x.pid) === s(p.id); });
      if (!r) { const sug = X.inspFor(p, tpl, b.city); r = { pid: s(p.id), city: sug.city, steps: sug.steps, createdAt: at, history: [] }; l.push(r); }
      if (b.notNeeded != null) r.notNeeded = b.notNeeded === true;
      if (b.city && tpl.cities[b.city] && b.city !== r.city && !arr(r.steps).some(function(x){ return x.done || x.result; })) { r.city = b.city; r.steps = X.inspFor(p, tpl, b.city).steps; }
      if (b.step && typeof b.step === 'object') {
        const st = arr(r.steps).find(function(x){ return x.id === s(b.step.id); }); if (!st) return undefined;
        if ('done' in b.step) st.done = b.step.done === true;
        if ('date' in b.step) st.date = /^\d{4}-\d{2}-\d{2}$/.test(s(b.step.date)) ? s(b.step.date) : '';
        if ('result' in b.step) { const res = /^(pass|fail|)$/.test(s(b.step.result)) ? s(b.step.result) : ''; if (res === 'fail' && st.result !== 'fail') failed = Object.assign({}, st); st.result = res; if (res === 'pass') st.done = true; }
        if ('notes' in b.step) st.notes = clip(b.step.notes, 500);
        st.by = by; st.at = at;
      }
      r.updatedAt = at; r.history = arr(r.history).concat([{ at: at, by: by, what: b.step ? s(b.step.id) : (b.notNeeded != null ? 'not needed: ' + b.notNeeded : 'city ' + s(b.city)) }]).slice(-80);
      return l;
    });
    if (failed) {   /* a failed inspection → a punch item + a To-Do to reschedule */
      const label = 'Failed inspection: ' + failed.label;
      try { await C().kvListUpdate('punch', function(l){ const id = 'PI-insp-' + s(p.id) + '-' + failed.id + '-' + at.slice(0, 10); if (l.some(function(x){ return s(x.id) === id; })) return null;
        return { list: l.concat([{ id: id, pid: s(p.id), item: label + (s(body.step.notes) ? ' — ' + clip(body.step.notes, 200) : ''), status: 'open', createdAt: at, addedBy: by, source: 'inspection' }]), check: function(a){ return a.some(function(x){ return s(x.id) === id; }); } }; }); } catch (e) {}
      try { await C().officeTodo('insp_fail_' + s(p.id) + '_' + failed.id + '_' + at.slice(0, 10), '📋 Reschedule the inspection — ' + clip(p.name, 80), label + '. Fix the punch item, then call the city to reschedule' + (p.pm ? ' (PM ' + s(p.pm) + ')' : '') + '.'); } catch (e) {}
    }
    rec = (await listGet(K.INSP)).find(function(x){ return s(x.pid) === s(p.id); }) || null;
    return reply(200, headers, { ok: true, rec: rec, failed: !!failed });
  }
  /* ── 🗓 the subs' busy days (the scheduler warns, never blocks) ── */
  if (action === 'subavail-get') return reply(200, headers, { ok: true, avail: (await L().kvGet(K.SUBAVAIL)) || {} });
  return reply(400, headers, { ok: false, error: 'Bad request' });
}

exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign(cors(event), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  const q = event.queryStringParameters || {};
  try {
    if (event.httpMethod === 'GET' && q.accept) return await acceptPage(event);
    if (event.httpMethod === 'GET' && q.ping === '1') return reply(200, headers, { ok: true, service: 'GrayCo X10' });
    if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
    if (String(event.body || '').length > 200000) return reply(413, headers, { ok: false, error: 'Too big' });
    let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
    const who = await inbox()._test.staffAuth(event); if (!who.ok) return reply(who.code || 401, headers, { ok: false, error: who.error });
    return await staffAction(event, headers, body, who);
  } catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong: ' + clip(e && e.message || e, 120) }); }
};
exports._test = { homeAuto: homeAuto, HOME_FIELDS: HOME_FIELDS, K: K, oc: oc };
exports.K = K; exports.HOME_FIELDS = HOME_FIELDS; exports.homeAuto = homeAuto; exports.homeRecord = homeRecord; exports.listGet = listGet; exports.listSet = listSet;
