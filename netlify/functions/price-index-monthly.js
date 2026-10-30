// netlify/functions/price-index-monthly.js — patch PRICEUP (owner, 25 Oct 2026): "monthly automatic price update from the
// national Producer Price Index — no review, applied automatically".
//
// Once a month (netlify.toml: the 3rd, 12:00 UTC = 7 AM Central in summer, 6 AM in winter) every Products price is moved by
// the month-over-month change of the BLS Producer Price Index series that fits its category. BLS publishes a month's PPI in
// the middle of the following month, so on the 3rd the newest month is always the one released the month before.
//   factor = newest month ÷ month before it   (per series, e.g. WPU081 lumber: 2026-09 ÷ 2026-08)
//   • Source: the free BLS public API (POST https://api.bls.gov/publicAPI/v2/timeseries/data/ with a seriesid list;
//     works without a key at low volume, env BLS_API_KEY is used when present).
//   • Where the new price goes (never the built-in code array): built-in catalog item (P0001 …) -> gc_kv "priceEdits"
//     {id: cost}; custom / supplier-sheet item -> gc_kv "customProducts" (its own cost). Both are what the Products tab reads
//     and syncs. Rounded to cents. Per-product history -> gc_kv "gc_price_hist" {id: [[date, old, new, 'index:SERIES', 'YYYY-MM'], …]}.
//   • State -> gc_kv "gc_price_index": per series the last month applied (a month is never applied twice; the history entry
//     carries the month too, so even a half-finished run cannot move a product twice), plus the last summary the Products tab shows.
//     _lib/products-base.json is a read-only copy of the built-in catalog (id, category, cost, name, SKU, unit) cut from the
//     `ll=[{id:"P0001"…` array in index.html, so the function knows each built-in item's starting price and category.
//     Regenerate it if the built-in catalog is ever changed.
//   • NOT touched: the Estimate Builder Rate Book (gc_rates_v3) and Price Log (gc_matlog_v2) — this file never reads or writes them.
//   • Skipped: a product whose price was set by hand (gc_kv "gc_price_manual" stamp written by the Products tab, a changed
//     price nobody explains in the history, or a supplier-sheet / receipt price) in the last 30 days.
//   • Safety cap: a series whose factor is more than +/-15% in one month is NOT applied (it looks like a data error); the
//     admins (GrayCo addresses only) get one e-mail. Data-entry mode (_lib/pause.js) lets staff-only mail and the BLS read through.
//
// CATEGORY -> PPI SERIES (BLS commodity codes; ids confirmed against FRED / BLS titles when this was written):
//   Lumber/Framing, Decking                 WPU081       Lumber                                   (composite / PVC decking -> WPU0721)
//   Engineered Wood, Sheathing, Sheathing/Plywood, OSB   WPU083   Plywood (BLS has no separate OSB commodity series)
//   Drywall                                 WPU137       Gypsum products
//   Roofing                                 WPU1361      Prepared asphalt & tar roofing & siding   (metal roofing/panels -> WPU101)
//   Insulation                              WPU1392      Insulation materials
//   Paint, Paint/Primer/Caulk               WPU0621      Prepared paint
//   Electrical                              WPU117       Electrical machinery & equipment          (wire / cable / Romex / THHN -> WPU10260314 copper wire & cable)
//   Plumbing, Fixtures, Water Heaters       WPU105       Plumbing fixtures & fittings              (PVC / CPVC / ABS / PEX pipe -> WPU0721 plastic construction products)
//   Concrete, Masonry, Grout/Mortar         WPU1333      Ready-mix concrete
//   Fasteners, Hardware, Metal Framing      WPU101       Iron & steel   (PROXY: no fastener commodity code was verified; nails, screws, studs and track are steel)
//   Doors/Windows                           WPU082       Millwork                                  (names with "window" -> WPU08210112 wood window units)
//   Trim/Molding                            WPU082       Millwork
//   Siding                                  WPU0721      Plastic construction products (vinyl / PVC / Azek siding; wood / cedar siding -> WPU082)
//   Flooring                                WPU123       Floor coverings
//   Tile                                    WPU1344      Ceramic floor & wall tile
//   everything else (HVAC, Cabinets, Countertops, Adhesives, Gutters, Ceilings, Equipment, Safety, any custom category)
//                                           WPUSI012011  Construction materials (the overall index)
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const BLS_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const CAP = 0.15;                  /* a month's factor beyond +/-15% is treated as a data error */
const HAND_DAYS = 30;              /* a price set by hand / by a supplier sheet this recently is left alone */
const UNEXPLAINED_DAYS = 35;       /* a price that differs from what we last wrote, with no stamp: counts as a hand edit if our last write is this recent */
const HIST_KEEP = 12;              /* history entries kept per product */
const DEFAULT_SERIES = 'WPUSI012011';

/* id -> [short name used on the Products tab line, BLS title] */
const SERIES = {
  WPU081: ['lumber', 'Lumber'],
  WPU083: ['plywood', 'Plywood'],
  WPU137: ['drywall', 'Gypsum products'],
  WPU1361: ['roofing', 'Prepared asphalt and tar roofing and siding products'],
  WPU1392: ['insulation', 'Insulation materials'],
  WPU0621: ['paint', 'Prepared paint'],
  WPU117: ['electrical', 'Electrical machinery and equipment'],
  WPU10260314: ['wire', 'Copper wire and cable'],
  WPU105: ['plumbing', 'Plumbing fixtures and fittings'],
  WPU0721: ['plastics', 'Plastic construction products'],
  WPU1333: ['concrete', 'Ready-mixed concrete'],
  WPU101: ['steel', 'Iron and steel'],
  WPU082: ['millwork', 'Millwork'],
  WPU08210112: ['windows', 'Wood window units'],
  WPU123: ['flooring', 'Floor coverings'],
  WPU1344: ['tile', 'Ceramic floor and wall tile'],
  WPUSI012011: ['all materials', 'Construction materials (overall)']
};
/* name checks come first (they can override the category), then the category rules */
const NAME_RULES = [
  [/\b(romex|nm-?b|thhn|thwn|xhhw|uf-?b|mc cable|coax|cat ?[56]e?|wire|cable)\b/i, /electrical/i, 'WPU10260314'],
  [/\b(pvc|cpvc|abs|pex|polyethylene pipe|poly pipe)\b/i, /plumbing|fixtures/i, 'WPU0721'],
  [/\bwindows?\b/i, /doors\/windows|window/i, 'WPU08210112'],
  [/\b(osb|oriented strand)\b/i, null, 'WPU083'],
  [/\b(drywall|sheetrock|gypsum|joint compound)\b/i, null, 'WPU137'],
  [/\b(composite|pvc|azek|trex|timbertech)\b/i, /decking/i, 'WPU0721'],
  [/\b(metal|steel|standing seam|r-?panel)\b/i, /^roofing$/i, 'WPU101'],
  [/\b(cedar|wood|redwood)\b/i, /^siding$/i, 'WPU082']
];
const CAT_RULES = [
  [/lumber|framing|decking/i, 'WPU081'],
  [/engineered wood|sheathing|plywood/i, 'WPU083'],
  [/drywall|gypsum/i, 'WPU137'],
  [/roofing/i, 'WPU1361'],
  [/insulation/i, 'WPU1392'],
  [/paint|primer/i, 'WPU0621'],
  [/electrical/i, 'WPU117'],
  [/plumbing|fixtures|water heater/i, 'WPU105'],
  [/concrete|masonry|grout|mortar/i, 'WPU1333'],
  [/fastener|hardware|metal framing/i, 'WPU101'],
  [/door|window|trim|molding|millwork/i, 'WPU082'],
  [/siding/i, 'WPU0721'],
  [/flooring/i, 'WPU123'],
  [/^tile$|tile\b/i, 'WPU1344']
];
function seriesFor(cat, name){
  const c = String(cat == null ? '' : cat), n = String(name == null ? '' : name);
  for (const r of NAME_RULES) if (r[0].test(n) && (!r[1] || r[1].test(c))) return r[2];
  for (const r of CAT_RULES) if (r[0].test(c)) return r[1];
  return DEFAULT_SERIES;
}

function hdr(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* the same staff check as every function, admins only */
async function isAdmin(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim());
  if (!m) return false;
  const url = sbUrl();
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return false;
    const u = await r.json();
    const email = String((u && u.email) || '').trim().toLowerCase();
    if (!email || !svc) return false;
    const s2 = await fetch(url + '/rest/v1/gc_staff?select=role,active&email=eq.' + encodeURIComponent(email), { headers: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(svc) ? { apikey: svc, Authorization: 'Bearer ' + svc } : { apikey: svc } });
    if (!s2.ok) return false;
    const rows = await s2.json();
    return !!(rows && rows[0] && rows[0].active !== false && require('./_lib/staff-role.js').isAdmin({ role: rows[0].role, email: email }));   /* patch AUTHFIX */
  } catch (e) { return false; }
}
function isScheduled(event){
  try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; }
}

function s(v){ return v == null ? '' : String(v).trim(); }
function num(v){ const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function r2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcH(){ const k = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; const h = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }; return Object.assign(h, { 'Content-Type': 'application/json' }); }
function centralDay(ms){ try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); } catch (e) { return new Date(ms).toISOString().slice(0, 10); } }
function pct(f){ const p = Math.round((f - 1) * 1000) / 10; return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(1) + '%'; }

/* ── the cloud store (gc_kv); tests pass their own { read, put } ── */
const KV_KEYS = ['priceEdits', 'customProducts', 'gc_price_hist', 'gc_price_index', 'gc_price_manual', 'users'];
const kvDefault = {
  async read(keys){ const portal = require('./portal.js'); return portal._core.kvRead(keys); },
  async put(key, value){
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign(svcH(), { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
    if (!r.ok) throw new Error('gc_kv write ' + key + ' ' + r.status);
    return true;
  }
};

/* ── BLS ── */
async function blsFetch(ids, year){
  const body = { seriesid: ids, startyear: String(year - 1), endyear: String(year) };
  if (process.env.BLS_API_KEY) body.registrationkey = process.env.BLS_API_KEY;
  const r = await fetch(BLS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('BLS answered ' + r.status);
  return r.json();
}
/* BLS answer -> { SERIES: [{ ym: '2026-09', v: 123.4 }, … oldest first] } */
function parseBls(j){
  if (!j || j.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS: ' + s(j && j.status) + ' ' + ((j && j.message) || []).join(' ').slice(0, 200));
  const out = {};
  arr(j.Results && j.Results.series).forEach(function(se){
    const id = s(se.seriesID); if (!id) return;
    const pts = [];
    arr(se.data).forEach(function(d){
      const m = /^M(\d\d)$/.exec(s(d.period)); if (!m || m[1] === '13') return;
      const v = parseFloat(d.value); if (!(v > 0)) return;
      pts.push({ ym: s(d.year) + '-' + m[1], v: v });
    });
    pts.sort(function(a, b){ return a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0; });
    out[id] = pts;
  });
  return out;
}
function prevYm(ym){ const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); }
/* newest month and the one right before it; null when either is missing */
function latestPair(pts){
  if (!pts || pts.length < 2) return null;
  const last = pts[pts.length - 1], prev = pts.find(function(p){ return p.ym === prevYm(last.ym); });
  return prev ? { ym: last.ym, v: last.v, prev: prev.v, prevYm: prev.ym } : null;
}

/* ── who is told ── */
function adminEmails(users){
  const out = [];
  arr(users).forEach(function(u){
    if (!u || u.active === false || !u.email) return;
    if (!/admin|owner/i.test(s(u.role) + ' ' + s(u.payType))) return;
    out.push(s(u.email).toLowerCase());
  });
  if (!out.length) s(process.env.OWNER_EMAILS).split(/[,;\s]+/).forEach(function(e){ if (e) out.push(e.toLowerCase()); });
  return Array.from(new Set(out.filter(function(e){ return /@([a-z0-9-]+\.)*grayco-cs\.com$/.test(e); })));   /* staff only, never an outside address */
}
async function sendCapMail(held, to, site){
  const key = process.env.RESEND_API_KEY;
  if (!to.length) return { sent: false, why: 'no admin address' };
  if (!key) return { sent: false, why: 'RESEND_API_KEY is not set' };
  const subject = '⚠️ Price index update held back: ' + held.map(function(h){ return h.label; }).join(', ');
  const rows = held.map(function(h){ return '<li><b>' + esc(h.label) + '</b> (' + esc(h.id) + ', ' + esc(h.title) + '): ' + esc(h.prevYm) + ' ' + h.prev + ' → ' + esc(h.ym) + ' ' + h.v + ' = <b>' + pct(h.factor) + '</b></li>'; }).join('');
  const html = '<div style="font:14px Arial;color:#1b1640;max-width:620px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">GrayCo — monthly price update: a series was held back</div><div style="padding:6px 18px 18px">' +
    '<p>One month moved by more than 15%, which usually means a data error at the source, so <b>no product price was changed for these series</b>:</p><ul>' + rows + '</ul>' +
    '<p>Check the series at bls.gov. If the move is real, change the prices by hand on the Products tab. The other series were applied normally.</p><p style="color:#777;font-size:12px">' + esc(site) + ' · sent to GrayCo admins only.</p></div></div>';
  const text = subject + '\n\n' + held.map(function(h){ return h.label + ' (' + h.id + '): ' + h.prevYm + ' ' + h.prev + ' -> ' + h.ym + ' ' + h.v + ' = ' + pct(h.factor); }).join('\n') + '\n\nNo product price was changed for these series.';
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EST_WATCH_FROM || 'GrayCo Prices <noreply@grayco-cs.com>', to: to, subject: subject, html: html, text: text, headers: { 'X-GrayCo-CRM': 'price-index-monthly' } }) });
    return r.ok ? { sent: true, to: to } : { sent: false, why: 'Resend answered ' + r.status };
  } catch (e) { return { sent: false, why: 'Resend unreachable' }; }
}

/* ── the update ── */
function lastHist(h){ return Array.isArray(h) && h.length ? h[h.length - 1] : null; }
function daysBetween(nowMs, day){ const t = Date.parse(s(day).length === 10 ? s(day) + 'T12:00:00Z' : s(day)); return isFinite(t) ? (nowMs - t) / 864e5 : 1e9; }
/* why a product is left alone this month, or '' */
function handReason(id, cur, p, hist, manual, nowMs){
  const st = manual[id]; if (st && daysBetween(nowMs, st) <= HAND_DAYS) return 'hand-edited';
  if (p && p._priceDate && (nowMs - Number(p._priceDate)) / 864e5 <= HAND_DAYS) return 'supplier-or-receipt price';
  const l = lastHist(hist[id]);
  if (l) {
    if (l[2] !== cur) { if (daysBetween(nowMs, l[0]) <= UNEXPLAINED_DAYS) return 'hand-edited'; }
    else if (/^supplier:/.test(s(l[3])) && daysBetween(nowMs, l[0]) <= HAND_DAYS) return 'supplier-or-receipt price';
  }
  return '';
}
async function run(opts){
  opts = opts || {};
  const nowMs = opts.now || Date.now(), day = centralDay(nowMs), kv = opts.kv || kvDefault;
  const fetchBls = opts.fetchBls || blsFetch, sendMail = opts.sendMail || sendCapMail;
  const data = await kv.read(KV_KEYS);
  const base = opts.base || require('./_lib/products-base.json');   /* [id, cat, cost, name, sku, unit] — copy of the built-in array, read only */
  const edits = Object.assign({}, obj(data.priceEdits));
  const custom = arr(data.customProducts).map(function(p){ return p && typeof p === 'object' ? Object.assign({}, p) : p; });
  const hist = obj(data.gc_price_hist), manual = obj(data.gc_price_manual);
  const state = obj(data.gc_price_index); state.series = obj(state.series);
  const out = { ok: true, day: day, dry: !!opts.dry, applied: [], held: [], skippedSeries: [], changed: 0, skipped: { handEdited: 0, supplierPrice: 0, seriesNotApplied: 0, tiny: 0, alreadyThisMonth: 0 }, mail: null };

  /* 1. the index */
  const raw = parseBls(await fetchBls(Object.keys(SERIES), new Date(nowMs).getUTCFullYear()));
  const plan = {};
  Object.keys(SERIES).forEach(function(id){
    const pr = latestPair(raw[id]), done = state.series[id];
    if (!pr) { out.skippedSeries.push({ id: id, label: SERIES[id][0], why: 'BLS sent no two consecutive months' }); return; }
    if (done && done.month >= pr.ym) { out.skippedSeries.push({ id: id, label: SERIES[id][0], why: 'month ' + pr.ym + ' already handled' }); return; }
    const f = pr.v / pr.prev;
    if (Math.abs(f - 1) > CAP) { out.held.push({ id: id, label: SERIES[id][0], title: SERIES[id][1], ym: pr.ym, prevYm: pr.prevYm, v: pr.v, prev: pr.prev, factor: f }); return; }
    plan[id] = { factor: f, ym: pr.ym, n: 0 };
  });

  /* 2. every product */
  const histAdd = {}, editsNew = {}, customChanged = {};
  function consider(id, cat, name, cur, p, isCustom){
    if (!(cur > 0)) return;
    const sid = seriesFor(cat, name), pl = plan[sid];
    if (!pl) { out.skipped.seriesNotApplied++; return; }   /* held by the cap, already done this month, or BLS sent nothing */
    const src = 'index:' + sid, lh = lastHist(hist[id]);
    if (lh && lh[3] === src && lh[4] === pl.ym) { out.skipped.alreadyThisMonth++; return; }
    const why = handReason(id, cur, p, hist, manual, nowMs);
    if (why) { if (why === 'hand-edited') out.skipped.handEdited++; else out.skipped.supplierPrice++; return; }
    const nw = r2(cur * pl.factor);
    if (nw === cur) { out.skipped.tiny++; return; }
    pl.n++; out.changed++;
    (histAdd[id] = histAdd[id] || []).push([day, cur, nw, src, pl.ym]);
    if (isCustom) customChanged[id] = nw; else editsNew[id] = nw;
  }
  base.forEach(function(b){ const cur = edits[b[0]] != null ? num(edits[b[0]]) : num(b[2]); consider(b[0], b[1], b[3], cur, null, false); });
  custom.forEach(function(p){ if (p && p.id) consider(s(p.id), p.cat, p.name, num(p.cost), p, true); });

  const baseIds = {}; base.forEach(function(b){ baseIds[b[0]] = 1; });
  out.series = Object.keys(plan).map(function(id){ return { id: id, label: SERIES[id][0], ym: plan[id].ym, factor: Math.round(plan[id].factor * 10000) / 10000, pct: pct(plan[id].factor), products: plan[id].n }; });
  out.applied = out.series;
  if (opts.dry) return out;

  /* 3. write: history first, then the prices, then the state (see the header) */
  if (out.changed) {
    Object.keys(histAdd).forEach(function(id){ hist[id] = (Array.isArray(hist[id]) ? hist[id] : []).concat(histAdd[id]).slice(-HIST_KEEP); });
    await kv.put('gc_price_hist', hist);
    if (Object.keys(editsNew).length) { Object.keys(editsNew).forEach(function(id){ edits[id] = editsNew[id]; }); await kv.put('priceEdits', edits); }
    if (Object.keys(customChanged).length) {
      const next = custom.map(function(p){ if (p && p.id && customChanged[s(p.id)] != null) { p.cost = customChanged[s(p.id)]; p._idxAt = day; } return p; });
      await kv.put('customProducts', next);
    }
  }
  const at = new Date(nowMs).toISOString();
  Object.keys(plan).forEach(function(id){ state.series[id] = { month: plan[id].ym, factor: plan[id].factor, status: 'applied', at: at, products: plan[id].n }; });
  out.held.forEach(function(h){ state.series[h.id] = { month: h.ym, factor: h.factor, status: 'held', at: at }; });
  state.lastRunAt = at; state.lastError = '';
  if (out.series.length || out.held.length) {
    state.last = { date: day, at: at, changed: out.changed, skipped: out.skipped,
      parts: out.series.map(function(x){ return { id: x.id, label: x.label, pct: x.pct, f: x.factor, n: x.products }; }),
      held: out.held.map(function(h){ return { id: h.id, label: h.label, pct: pct(h.factor) }; }) };
  }
  if (out.held.length) {
    const site = (process.env.CRM_URL || 'https://crm.grayco-cs.com').replace(/\/$/, '');
    out.mail = await sendMail(out.held, adminEmails(data.users), site);
    if (state.last) state.last.mail = out.mail.sent ? 'sent' : out.mail.why;
  }
  await kv.put('gc_price_index', state);
  return out;
}

exports.handler = async function (event) {
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const sched = isScheduled(event);
  if (!sched && !(await isAdmin(event))) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  const qs = event.queryStringParameters || {};
  try {
    const out = await run({ dry: !sched && qs.dry === '1' });
    try { console.log('[price-index-monthly]', JSON.stringify({ day: out.day, series: out.series.length, held: out.held.length, changed: out.changed })); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (e) {
    try { const st = obj((await kvDefault.read(['gc_price_index'])).gc_price_index); st.lastError = s(e && e.message).slice(0, 300); st.lastErrorAt = new Date().toISOString(); await kvDefault.put('gc_price_index', st); } catch (e2) {}
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Could not update from the index: ' + (e && e.message || e) }) };
  }
};
exports._t = { run: run, seriesFor: seriesFor, parseBls: parseBls, latestPair: latestPair, SERIES: SERIES, adminEmails: adminEmails, handReason: handReason, pct: pct };
