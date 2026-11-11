// Price lists ("price books"). An estimate is priced either from the catalog (your own prices)
// or from a price list you import, such as the Xactimate price list for your area and month.
//
// No Xactimate prices ship with PlanBuilder: they are licensed by Verisk. Export your current price
// list from your own Xactimate account (or any supplier list) as a spreadsheet and import it here.
// Catalog products link to a price-list line through their `xmCode` (e.g. the category + selector).

import { parseCSV } from './catalog.js';

export function normCode(c) { return String(c || '').trim().toUpperCase().replace(/\s+/g, ' '); }

const HEAD = {
  code: ['code', 'item code', 'line item', 'item', 'cat sel', 'catsel', 'xm code'],
  cat: ['cat', 'category', 'cat.'],
  sel: ['sel', 'selector', 'sel.'],
  desc: ['desc', 'description', 'item description'],
  unit: ['unit', 'uom', 'units', 'unit of measure'],
  remove: ['remove', 'rem', 'remove price', 'tear off', 'tear-off'],
  replace: ['replace', 'rpl', 'replace price', 'unit price', 'price', 'unit cost', 'cost'],
  material: ['material', 'mat', 'materials', 'material price'],
  labor: ['labor', 'lab', 'labour', 'labor price'],
};
const money = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : null; };

// A price list from a CSV export. Columns are found by their header names (see HEAD); the code is the
// Code column, or Category + Selector. Returns { items: {CODE: {...}}, count, errors, hasMaterial }.
export function priceBookFromCSV(text) {
  const rows = parseCSV(text);
  const errors = [];
  if (rows.length < 2) return { items: {}, count: 0, errors: ['The file has no rows under the header.'], hasMaterial: false };
  // the header is the first row that names a description and a price
  let hi = rows.findIndex(r => { const l = r.map(c => c.trim().toLowerCase()); return l.some(c => HEAD.desc.includes(c)) && l.some(c => HEAD.replace.includes(c) || HEAD.remove.includes(c)); });
  if (hi < 0) hi = 0;
  const head = rows[hi].map(c => c.trim().toLowerCase());
  const col = k => head.findIndex(c => HEAD[k].includes(c));
  const C = Object.fromEntries(Object.keys(HEAD).map(k => [k, col(k)]));
  if (C.code < 0 && (C.cat < 0 || C.sel < 0)) errors.push('No Code column (or Category + Selector columns) was found.');
  if (C.replace < 0 && C.remove < 0) errors.push('No price column (Replace / Unit price / Price) was found.');
  const items = {}; let count = 0;
  rows.slice(hi + 1).forEach((r, i) => {
    const get = k => (C[k] >= 0 ? (r[C[k]] || '').trim() : '');
    const code = normCode(C.code >= 0 ? get('code') : `${get('cat')} ${get('sel')}`);
    if (!code) return;
    const replace = money(get('replace')), remove = money(get('remove'));
    if (replace == null && remove == null) { errors.push(`Row ${hi + i + 2} (${code}): no price.`); return; }
    items[code] = { code, desc: get('desc'), unit: get('unit').toUpperCase(), replace: replace || 0, remove: remove || 0, material: money(get('material')), labor: money(get('labor')) };
    count++;
  });
  const hasMaterial = Object.values(items).some(x => x.material != null);
  return { items, count, errors, hasMaterial };
}

// Quantity conversion between area / length units, for a price-list unit that differs from the catalog's.
const AREA = { SF: 1, SY: 9, SQ: 100 };
export function convertUnit(qty, from, to) {
  from = (from || '').toUpperCase(); to = (to || '').toUpperCase();
  if (!to || from === to) return { qty, ok: true };
  if (AREA[from] && AREA[to]) return { qty: qty * AREA[from] / AREA[to], ok: true };
  if ((from === 'LF' && to === 'FT') || (from === 'FT' && to === 'LF')) return { qty, ok: true };
  return { qty, ok: false };
}

// Lines pasted from an estimate (Excel columns or PDF text): [code] [activity] description qty unit [price]
const UNIT_RE = '(SF|LF|SY|SQ|EA|HR|CY|GAL|DA|WK|MO|LS|FT|PR|BX|TN|RL|SH|CF)';
export function parseEstimateText(text) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach(raw => {
    let line = raw.replace(/\u00a0/g, ' ').trim(); if (!line) return;
    let cells = line.includes('\t') ? line.split('\t').map(c => c.trim()).filter(Boolean) : null;
    const r = {};
    if (cells && cells.length >= 3) {   // spreadsheet columns
      const ui = cells.findIndex(c => new RegExp('^' + UNIT_RE + '$', 'i').test(c));
      if (/^[A-Z]{2,4}$/i.test(cells[0]) && cells[1] && !/\s/.test(cells[1]) && cells[1].length <= 10) { r.code = cells[0] + ' ' + cells[1]; cells = cells.slice(2); }
      else if (/^[A-Z]{2,4}\s+\S{1,10}$/i.test(cells[0]) && ui !== 0) { r.code = cells[0]; cells = cells.slice(1); }
      const u = cells.findIndex(c => new RegExp('^' + UNIT_RE + '$', 'i').test(c));
      if (u > 0) { r.unit = cells[u].toUpperCase(); r.qty = parseFloat(cells[u - 1].replace(/,/g, '')); r.name = cells.slice(0, u - 1).join(' '); const pr = cells.slice(u + 1).map(c => parseFloat(c.replace(/[$,]/g, ''))).find(v => isFinite(v)); if (isFinite(pr)) r.price = pr; }
      else r.name = cells.join(' ');
    } else {
      line = line.replace(/^\d+\.\s*/, '');
      const m = line.match(new RegExp('^(.*?)\\s+([\\d,]+(?:\\.\\d+)?)\\s*' + UNIT_RE + '\\b\\s*(?:@\\s*)?\\$?([\\d,]+(?:\\.\\d+)?)?', 'i'));
      if (!m) { r.name = line; }
      else { r.name = m[1].trim(); r.qty = parseFloat(m[2].replace(/,/g, '')); r.unit = m[3].toUpperCase(); if (m[4]) r.price = parseFloat(m[4].replace(/,/g, '')); }
      const c = r.name.match(/^([A-Z]{3})\s+([A-Z0-9+\-\/]{1,8})\s+(.*)$/);
      if (c && c[2] === c[2].toUpperCase()) { r.code = c[1] + ' ' + c[2]; r.name = c[3]; }
    }
    const a = (r.name || '').match(/^(R&R|Remove|Replace|Detach & reset|D&R)\b\s*/i);
    if (a) { r.act = /^r&r$/i.test(a[1]) ? 'R&R' : /^remove/i.test(a[1]) ? 'Remove' : /^replace/i.test(a[1]) ? 'Replace' : 'Detach & reset'; r.name = r.name.slice(a[0].length); }
    if (r.name || r.code) out.push(r);
  });
  return out;
}
