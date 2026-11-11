// PlanBuilder ↔ GrayCo CRM prices.
//
// When PlanBuilder runs on the CRM's own address (crm.grayco-cs.com/planbuilder/) it can read the price
// data the CRM keeps in this browser, so there is one set of prices for both:
//   • Estimate Builder Rate Book   localStorage "__est__gc_rates_v3"  [{desc, cost, unit, cat, type: material|labor|sub, supplier}]
//   • Estimate Builder settings    localStorage "__est__gc_settings_v1"  {tax, marginPct}
//   • Products (built-in catalog)  data/crm-products.json (copy of netlify/functions/_lib/products-base.json:
//                                  [id, cat, cost, name, sku, unit]) with the CRM's own edits "priceEdits" {id: cost}
//   • Products (added / supplier)  IndexedDB grayco_crm → kv "customProducts"  [{id, name, cat, unit, cost, sku}]
//   • Labor rates (per hour)       IndexedDB grayco_crm → kv "laborRates"  [{cat, desc, rate}]
// PlanBuilder only READS these. Nothing is written back to the CRM.
//
// A PlanBuilder product is linked to a CRM line for its material price and one for its labor price:
//   p.crm = { mat: {key, per?}, lab: {key, per?, hrs?} }
//   per = how many CRM units make one PlanBuilder unit (only needed when the units can't be converted)
//   hrs = hours per PlanBuilder unit, for a labor rate that is priced per hour.

export const SHEET_SF = 32;
const AREA = { SF: 1, SY: 9, SQ: 100 };

const s = v => (v == null ? '' : String(v)).trim();
export const norm = v => s(v).toLowerCase().replace(/[^a-z0-9"'./-]+/g, ' ').trim();

// CRM unit words → PlanBuilder units.
export function normUnit(u) {
  const x = s(u).toLowerCase().replace(/^per\s+/, '').replace(/\.$/, '');
  const M = {
    sf: 'SF', 'sq ft': 'SF', sqft: 'SF', 'square foot': 'SF', 'square feet': 'SF',
    lf: 'LF', 'lin ft': 'LF', 'linear foot': 'LF', 'linear feet': 'LF', ft: 'LF', foot: 'LF',
    square: 'SQ', sq: 'SQ', squares: 'SQ',
    sheet: 'SHEET', sht: 'SHEET', sh: 'SHEET', sheets: 'SHEET',
    yard: 'CY', cy: 'CY', cyd: 'CY', 'cubic yard': 'CY', sy: 'SY', 'square yard': 'SY',
    gal: 'GAL', gallon: 'GAL',
    ea: 'EA', each: 'EA', unit: 'EA', piece: 'EA', pc: 'EA', window: 'EA', door: 'EA', brick: 'EA', block: 'EA', fixture: 'EA',
    job: 'LS', flat: 'LS', ls: 'LS', 'lump sum': 'LS',
    hr: 'HR', hour: 'HR', hours: 'HR', day: 'DAY', wk: 'WK', week: 'WK', mo: 'MO', month: 'MO',
  };
  return M[x] || x.toUpperCase();
}

// Square feet in one sheet, from a size in its name ("4x12", "4.5x12", "2x8ft"); 32 (4×8) when none is given.
export function sheetSF(name) {
  const m = s(name).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (m) { const a = +m[1], b = +m[2]; if (a >= 1 && a <= 12 && b >= 2 && b <= 16) return a * b; }
  return SHEET_SF;
}
// How many CRM units make one PlanBuilder unit, or null when the two can't be converted.
// name: the CRM line's name, for the size of a sheet.
export function unitFactor(crmUnit, pbUnit, name = '') {
  const a = normUnit(crmUnit), b = (pbUnit || '').toUpperCase();
  if (!a || !b) return null;
  if (a === b) return 1;
  if (AREA[a] && AREA[b]) return AREA[b] / AREA[a];
  const sh = sheetSF(name);
  if (a === 'SHEET' && AREA[b]) return AREA[b] / sh;
  if (AREA[a] && b === 'SHEET') return sh / AREA[a];
  return null;
}

// ---------- reading what the CRM keeps in this browser ----------
function lsJSON(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

// Read keys from the CRM's IndexedDB without ever creating that database.
export function readCrmIDB(keys, name = 'grayco_crm', store = 'kv') {
  return new Promise(res => {
    const out = {};
    let req;
    try { req = indexedDB.open(name); } catch (e) { return res(out); }
    req.onupgradeneeded = () => { try { req.transaction.abort(); } catch (e) { /* ignore */ } };   // it did not exist: leave it that way
    req.onerror = () => res(out);
    req.onblocked = () => res(out);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(store)) { db.close(); return res(out); }
      try {
        const tx = db.transaction(store, 'readonly'), st = tx.objectStore(store);
        keys.forEach(k => { const g = st.get(k); g.onsuccess = () => { if (g.result !== undefined) out[k] = g.result; }; });
        tx.oncomplete = () => { db.close(); res(out); };
        tx.onerror = tx.onabort = () => { db.close(); res(out); };
      } catch (e) { db.close(); res(out); }
    };
  });
}

let BASE = null;
async function baseProducts() {
  if (BASE) return BASE;
  try { const r = await fetch(new URL('../data/crm-products.json', import.meta.url)); if (r.ok) BASE = await r.json(); } catch (e) { /* offline */ }
  return BASE || [];
}

// Everything the CRM has, as one list of price sources.
export async function loadCRM() {
  const idb = await readCrmIDB(['laborRates', 'customProducts', 'priceEdits', '__est__gc_rates_v3', '__est__gc_settings_v1']);
  const asArr = v => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch (e) { return null; } })() : v);
  const rateBook = asArr(lsJSON('__est__gc_rates_v3') || lsJSON('gc_rates_v3') || idb['__est__gc_rates_v3']);
  const settings = asArr(lsJSON('__est__gc_settings_v1') || lsJSON('gc_settings_v1') || idb['__est__gc_settings_v1']);
  const raw = {
    rateBook: Array.isArray(rateBook) ? rateBook : [],
    custom: Array.isArray(asArr(idb.customProducts)) ? asArr(idb.customProducts) : [],
    edits: asArr(idb.priceEdits) && typeof asArr(idb.priceEdits) === 'object' ? asArr(idb.priceEdits) : {},
    laborRates: Array.isArray(asArr(idb.laborRates)) ? asArr(idb.laborRates) : [],
    settings: settings && typeof settings === 'object' ? settings : null,
  };
  const found = raw.rateBook.length > 0 || raw.custom.length > 0 || raw.laborRates.length > 0 || Object.keys(raw.edits).length > 0 || !!raw.settings;
  return buildCRM(raw, found ? await baseProducts() : [], found);
}

// Pure: raw CRM data → { found, sources: [...], byKey, settings, counts, loadedAt }.
export function buildCRM(raw, base = [], found = true) {
  const src = [];
  (raw.rateBook || []).forEach(r => {
    if (!r || !s(r.desc)) return;
    const type = /labor/i.test(r.type) ? 'labor' : /sub/i.test(r.type) ? 'sub' : 'material';
    src.push({ key: 'rb:' + norm(r.desc) + '|' + norm(r.unit), from: 'Rate Book', kind: type, name: s(r.desc), cat: s(r.cat || r.category), unit: normUnit(r.unit), unitText: s(r.unit), cost: +r.cost || 0, note: s(r.supplier || r.notes) });
  });
  const edits = raw.edits || {};
  (base || []).forEach(b => {
    const [id, cat, cost, name, sku, unit] = b;
    const c = edits[id] !== undefined && isFinite(+edits[id]) ? +edits[id] : +cost;
    src.push({ key: 'prod:' + id, from: 'Products', kind: 'material', name: s(name), cat: s(cat), unit: normUnit(unit), unitText: s(unit), cost: c || 0, note: sku ? 'SKU ' + sku : '' });
  });
  (raw.custom || []).forEach(p => {
    if (!p || !p.id) return;
    src.push({ key: 'prod:' + p.id, from: 'Products', kind: 'material', name: s(p.name || p.desc), cat: s(p.cat || p.category), unit: normUnit(p.unit), unitText: s(p.unit), cost: +(p.cost != null ? p.cost : p.price) || 0, note: p.sku ? 'SKU ' + p.sku : s(p.vendor || p.supplier) });
  });
  (raw.laborRates || []).forEach(l => {
    if (!l || !(s(l.cat) || s(l.desc))) return;
    src.push({ key: 'hr:' + norm(l.cat) + '|' + norm(l.desc), from: 'Labor Rates', kind: 'hourly', name: [s(l.cat), s(l.desc)].filter(Boolean).join(' – '), cat: s(l.cat), unit: 'HR', unitText: 'per hour', cost: +l.rate || 0, note: '' });
  });
  const byKey = new Map(); src.forEach(x => byKey.set(x.key, x));   // later rows win (a custom product with a built-in id)
  const sources = [...byKey.values()];
  const st = raw.settings || {};
  const settings = raw.settings ? { tax: isFinite(+st.tax) ? +st.tax : null, marginPct: isFinite(+st.marginPct) ? +st.marginPct : null } : null;
  const counts = { rateBook: sources.filter(x => x.from === 'Rate Book').length, products: sources.filter(x => x.from === 'Products').length, laborRates: sources.filter(x => x.from === 'Labor Rates').length };
  return { found, sources, byKey, settings, counts, loadedAt: new Date().toISOString() };
}

// ---------- prices from links ----------
// One linked price, per PlanBuilder unit: { value, ok, note, src }.
export function resolveLink(link, crm, pbUnit) {
  if (!link || !link.key) return null;
  const x = crm && crm.byKey.get(link.key);
  if (!x) return { value: null, ok: false, note: 'not in the CRM any more', src: null };
  if (x.kind === 'hourly') {
    const hrs = +link.hrs;
    if (!(hrs > 0)) return { value: null, ok: false, note: 'type the hours per ' + pbUnit, src: x };
    return { value: round(x.cost * hrs), ok: true, note: `$${x.cost}/hr × ${hrs} hr`, src: x };
  }
  const per = +link.per > 0 ? +link.per : unitFactor(x.unit, pbUnit, x.name);
  if (!(per > 0)) return { value: null, ok: false, note: `the CRM sells it ${x.unitText || x.unit}: type how many make one ${pbUnit}`, src: x };
  const sheet = !(+link.per > 0) && x.unit === 'SHEET' ? ` – a ${sheetSF(x.name)} SF sheet` : '';
  return { value: round(x.cost * per), ok: true, note: per === 1 ? '' : `$${x.cost} ${x.unitText || x.unit} × ${+per.toFixed(4)}${sheet}`, src: x };
}
const round = v => Math.round(v * 10000) / 10000;

// Put the CRM prices on every linked product. The last good price stays when a link can't be priced.
// Returns { changed: [{p, field, from, to}], problems: [{p, field, note}] }.
export function applyCRM(catalog, crm) {
  const changed = [], problems = [];
  if (!crm || !crm.found) return { changed, problems };
  catalog.forEach(p => {
    if (!p.crm) return;
    [['mat', 'price'], ['lab', 'labor']].forEach(([k, field]) => {
      const r = resolveLink(p.crm[k], crm, p.unit);
      if (!r) return;
      if (!r.ok) { problems.push({ p, field, note: r.note }); return; }
      const old = +p[field] || 0;
      if (Math.abs(old - r.value) > 0.00005) { changed.push({ p, field, from: old, to: r.value }); p[field] = r.value; }
    });
    p.crmAt = crm.loadedAt;
  });
  return { changed, problems };
}

// Studio's structure / MEP / site rates linked to CRM lines: links = {rateKey: {mat, lab}} → {rateKey: material + labor}.
export function crmSystemRates(links, crm, units) {
  const out = {};
  if (!crm || !crm.found) return out;
  Object.entries(links || {}).forEach(([k, pair]) => {
    let v = 0, any = false;
    ['mat', 'lab'].forEach(part => { const r = pair && pair[part] && resolveLink(pair[part], crm, units[k]); if (r && r.ok) { v += r.value; any = true; } });
    if (any) out[k] = Math.round(v * 100) / 100;
  });
  return out;
}

// ---------- suggestions ----------
const STOP = new Set(['and', 'the', 'with', 'for', 'per', 'of', 'in', 'to', 'a', 'w', 'x', 'labor', 'material', 'install', 'installed', 'new']);
const words = t => norm(t).split(/[\s/-]+/).filter(w => w.length > 1 && !STOP.has(w));
// PlanBuilder category → words that show up in CRM categories for the same trade.
const CAT_WORDS = {
  flooring: ['flooring', 'floor'], paint: ['paint'], drywall: ['drywall'], siding: ['siding'], masonry: ['masonry', 'concrete', 'grout'],
  trim: ['trim', 'molding'], roofing: ['roofing', 'gutters'], door: ['doors', 'door'], window: ['windows', 'window'], cabinet: ['cabinets', 'cabinet'],
  countertop: ['countertops', 'counters'], tile: ['tile', 'bath'], plumbing: ['plumbing', 'fixtures', 'water'], appliance: ['appliance'],
  electrical: ['electrical'], landscape: ['landscaping'], hardscape: ['concrete', 'masonry'], outdoor: ['decking', 'deck', 'fence'],
  structure: ['framing', 'lumber', 'concrete', 'sheathing', 'insulation', 'hvac'], commercial: ['ceilings', 'metal', 'general'], labor: ['general', 'demolition'],
};
// Best CRM lines for a product. kind: 'mat' (materials, sub prices) or 'lab' (labor, sub, hourly).
export function suggest(p, crm, kind, n = 6) {
  if (!crm || !crm.found) return [];
  const pw = words([p.name, p.brand, p.material, p.finish].filter(Boolean).join(' '));
  if (!pw.length) return [];
  const cw = CAT_WORDS[p.category] || [p.category];
  const okKind = kind === 'lab' ? k => k === 'labor' || k === 'sub' || k === 'hourly' : k => k === 'material' || k === 'sub';
  const scored = [];
  crm.sources.forEach(x => {
    if (!okKind(x.kind)) return;
    const xw = new Set(words(x.name));
    let hit = 0; pw.forEach(w => { if (xw.has(w)) hit += /\d/.test(w) ? 1.5 : 1; });
    const catHit = cw.some(c => norm(x.cat).includes(c));
    if (!hit && !(catHit && kind === 'lab' && x.kind === 'hourly')) return;
    let sc = hit / Math.max(3, pw.length) + (catHit ? 0.35 : 0);
    if (x.kind !== 'hourly') sc += unitFactor(x.unit, p.unit, x.name) ? 0.25 : -0.2;
    if (x.from === 'Rate Book') sc += 0.05;   // GrayCo's own estimating rates first
    scored.push({ x, sc, catHit });
  });
  return scored.sort((a, b) => b.sc - a.sc).slice(0, n).map(o => ({ ...o.x, score: +o.sc.toFixed(3), cover: coverage(pw, o.x), catHit: o.catHit }));
}
// Share of the product's words that the CRM line also has.
function coverage(pw, x) { const xw = new Set(words(x.name)); return pw.length ? +(pw.filter(w => xw.has(w)).length / pw.length).toFixed(3) : 0; }

// The link "Link best matches" would make, or null when no match is clear enough. Hourly rates need hours, so never.
export function autoLink(p, crm, kind) {
  const best = suggest(p, crm, kind, 2)[0];
  if (!best || best.kind === 'hourly' || !best.catHit || best.score < 1 || best.cover < 0.6 || !unitFactor(best.unit, p.unit, best.name)) return null;
  return { key: best.key, auto: true };
}

// A margin (share of the selling price) as the markup PlanBuilder adds on cost.
export const marginToMarkup = m => (m > 0 && m < 100 ? Math.round(m / (100 - m) * 10000) / 100 : 0);
