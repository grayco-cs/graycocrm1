// PlanBuilder takeoff: turns a drawn plan into quantities and a priced estimate.
// Pure functions (no page code) so tests can check the numbers.

import { polyArea, polyPerimeter, centroid, pointInPoly, projectOnSeg, wallLength, wallPieces, wallHeight, openingArea, roofMeasure, ridgeAxis } from './geom.js';
import { findProduct, categoryName } from './catalog.js';
import { normCode, convertUnit } from './pricebook.js';

const ph = o => (o && o.phase) || 'new';   // existing / new / demo

export const GAL_COVERAGE = 350;   // SF per gallon per coat
export const COATS = 2;
export const SHEET_SF = 32;        // 4×8 drywall sheet

// Quantity in the product's unit from a base measure ('SF' area, 'LF' length or 'EA' count).
export function convert(qty, base, unit, product) {
  if (base === 'SF') {
    if (unit === 'CY') return qty * ((product && product.depth) || 3) / 12 / 27;   // area × depth (inches)
    if (unit === 'SY') return qty / 9;
    if (unit === 'SQ') return qty / 100;
    if (unit === 'GAL') return qty * COATS / GAL_COVERAGE;
    if (unit === 'SHEET') return qty / SHEET_SF;
    return qty;   // SF, or anything priced per area
  }
  return qty;
}

// Round up the way material is bought.
export function roundQty(q, unit) {
  if (!(q > 0)) return 0;
  switch (unit) {
    case 'EA': case 'SHEET': case 'GAL': return Math.ceil(q - 1e-9);
    case 'CY': return Math.ceil(q * 4 - 1e-9) / 4;     // quarter yards
    case 'SQ': return Math.ceil(q * 3 - 1e-9) / 3;      // bundles: 3 per square
    case 'LF': case 'SF': case 'SY': return Math.ceil(q * 100 - 1e-9) / 100;
    default: return Math.round(q * 100) / 100;
  }
}

// Openings that sit on a room edge (their centre within reach of the edge line).
function openingsOnRoom(room, level) {
  const out = [];
  level.openings.forEach(o => {
    const w = level.walls.find(x => x.id === o.wallId);
    if (!w) return;
    const c = { x: w.a.x + (w.b.x - w.a.x) * o.t, y: w.a.y + (w.b.y - w.a.y) * o.t };
    const reach = (w.thickness || 0.5) / 2 + 0.3;
    for (let i = 0; i < room.points.length; i++) {
      const a = room.points[i], b = room.points[(i + 1) % room.points.length];
      if (projectOnSeg(c, a, b).d < reach) { out.push({ o, w }); break; }
    }
  });
  return out;
}

export function roomStats(room, level) {
  const area = polyArea(room.points), perim = polyPerimeter(room.points);
  const H = room.height > 0 ? room.height : level.height;
  const ops = openingsOnRoom(room, level);
  const opArea = ops.reduce((s, x) => s + openingArea(x.o, H), 0);
  const doorWidth = ops.filter(x => (x.o.sill || 0) < 0.25).reduce((s, x) => s + x.o.width, 0);
  return { area, perim, height: H, wallArea: Math.max(0, perim * H - opArea), openingArea: opArea, baseLF: Math.max(0, perim - doorWidth), openings: ops.length };
}

export function wallFaceArea(w, level) {
  const H = wallHeight(w, level);
  return wallPieces(w, level.openings, H).reduce((s, p) => s + (p.u1 - p.u0) * (p.z1 - p.z0), 0);
}

// The gable-end (or shed side) triangles above the plate, sided like the walls.
export function gableArea(sec) {
  if (sec.style !== 'gable' && sec.style !== 'shed') return 0;
  const span = ridgeAxis(sec) === 'x' ? sec.d : sec.w;
  const slope = (+sec.pitch || 0) / 12;
  return sec.style === 'gable' ? span * (span / 2 * slope) : span * (span * slope);   // two triangles
}

// opts.book: a price list ({ name, items: {CODE: {desc, unit, replace, remove, material}} }) to price from
// instead of the catalog. Lines whose product has no code in that list keep the catalog price and are flagged.
export function computeTakeoff(project, catalog, opts = {}) {
  const s = project.settings;
  const book = opts.book || null;
  const byRoom = s.estimateLayout === 'room';
  const lines = new Map();
  const warnings = [];
  const add = (productId, baseQty, base, source, wastePct = 0, group = '') => {
    if (!(baseQty > 0)) return;
    const p = findProduct(catalog, productId);
    if (!p) { if (productId) warnings.push(`Product "${productId}" is not in the catalog (${source}).`); return; }
    const key = productId + '|' + group + (byRoom ? '|' + source : '');
    const q = convert(baseQty, base, p.unit, p);
    const L = lines.get(key) || { key, productId, category: p.category, name: p.name + (group ? ` – ${group}` : ''), unit: p.unit, raw: 0, waste: wastePct, price: +p.price || 0, labor: +p.labor || 0, sources: [] };
    L.raw += q; if (!L.sources.includes(source)) L.sources.push(source);
    lines.set(key, L);
  };

  const summary = { levels: [], floorArea: 0, outdoorArea: 0, extWallLF: 0, intWallLF: 0, roofSquares: 0, roofArea: 0, roofs: [], openings: 0 };

  project.levels.forEach(level => {
    const lv = { id: level.id, name: level.name, floorArea: 0, rooms: [], extWallLF: 0, intWallLF: 0 };
    // Rooms: floor, wall finish, ceiling, baseboard, ceiling drywall
    level.rooms.forEach(r => {
      const st = roomStats(r, level);
      lv.rooms.push({ id: r.id, name: r.name, outdoor: !!r.outdoor, phase: ph(r), ...st });
      const where = `${level.name}: ${r.name}`;
      if (ph(r) === 'existing') { if (!r.outdoor) { lv.floorArea += st.area; lv.existingArea = (lv.existingArea || 0) + st.area; } return; }
      if (ph(r) === 'demo') { if (!r.outdoor) add('lb-demo', st.area, 'SF', where + ' (demolish)'); return; }
      if (!r.outdoor) lv.newArea = (lv.newArea || 0) + st.area;
      if (r.outdoor) {   // yard, bed, patio, drive, deck: only the surface, no walls / ceiling / trim
        // a yard drawn around the house, a patio or a bed does not cover what sits inside it
        const inside = level.rooms.filter(o => o !== r && polyArea(o.points) < st.area && pointInPoly(centroid(o.points), r.points));
        const net = Math.max(0, st.area - inside.reduce((a, o) => a + polyArea(o.points), 0));
        lv.rooms[lv.rooms.length - 1].area = net;
        lv.outdoorArea = (lv.outdoorArea || 0) + net;
        if (r.floorId) add(r.floorId, net, 'SF', where, s.floorWaste);
        if (r.underId) add(r.underId, net, 'SF', where, 0);
        return;
      }
      lv.floorArea += st.area;
      if (r.floorId) add(r.floorId, st.area, 'SF', where, s.floorWaste);
      if (r.wallFinishId) add(r.wallFinishId, st.wallArea, 'SF', where, s.wallWaste);
      const ceil = r.ceilingId || s.ceilingFinishId;
      if (ceil) add(ceil, st.area, 'SF', where, s.wallWaste, r.ceilingId ? '' : 'ceilings');
      if (r.baseboard !== false && s.baseboardId) add(s.baseboardId, st.baseLF, 'LF', where, s.wallWaste);
      if (s.drywallId && !r.ceilingId) add(s.drywallId, st.area, 'SF', where, s.wallWaste, 'ceilings');
    });
    // Walls: drywall faces, exterior finish
    level.walls.forEach(w => {
      const L = wallLength(w), face = wallFaceArea(w, level);
      if (ph(w) === 'existing') { if (w.exterior) lv.extWallLF += L; else lv.intWallLF += L; return; }
      if (ph(w) === 'demo') { add('lb-demo-wall', face, 'SF', `${level.name}: walls to demolish`); return; }
      if (w.exterior) {
        lv.extWallLF += L;
        add(w.finishOut || s.exteriorFinishId, face, 'SF', `${level.name}: exterior walls`, s.wallWaste);
        if (s.drywallId) add(w.finishIn || s.drywallId, face, 'SF', `${level.name}: walls`, s.wallWaste, 'walls');
      } else {
        lv.intWallLF += L;
        if (s.drywallId) add(w.finishIn || s.drywallId, face * 2, 'SF', `${level.name}: walls`, s.wallWaste, 'walls');
      }
    });
    level.openings.forEach(o => {
      if (ph(o) === 'existing') return;
      if (ph(o) === 'demo') { add('lb-demo-opening', 1, 'EA', `${level.name}: doors & windows to remove`); return; }
      summary.openings++;
      if (o.productId) add(o.productId, 1, 'EA', `${level.name}: doors & windows`);
    });
    level.items.forEach(it => {
      if (ph(it) === 'existing') return;
      if (ph(it) === 'demo') { add('lb-demo-item', 1, 'EA', `${level.name}: items to remove`); return; }
      const p = findProduct(catalog, it.productId);
      if (!p) { warnings.push(`A placed item uses "${it.productId}", which is not in the catalog.`); return; }
      const q = p.unit === 'LF' ? it.w : (p.unit === 'SF' ? (p.objType === 'panel' ? it.w * it.h : it.w * it.d) : 1);
      add(it.productId, q, p.unit === 'SF' ? 'SF' : (p.unit === 'LF' ? 'LF' : 'EA'), `${level.name}: placed items`);
    });
    summary.newArea = (summary.newArea || 0) + (lv.newArea || 0); summary.existingArea = (summary.existingArea || 0) + (lv.existingArea || 0);
    summary.floorArea += lv.floorArea; summary.outdoorArea += lv.outdoorArea || 0; summary.extWallLF += lv.extWallLF; summary.intWallLF += lv.intWallLF;
    summary.levels.push(lv);
  });

  // Roofs
  const acc = s.roofAccessories || {};
  project.roofs.forEach((sec, i) => {
    const m = roofMeasure(sec);
    const name = `Roof ${i + 1} (${sec.style}${sec.style !== 'flat' ? ' ' + sec.pitch + '/12' : ''})`;
    summary.roofs.push({ id: sec.id, name, phase: ph(sec), ...m });
    if (ph(sec) === 'existing') return;
    if (ph(sec) === 'demo') { add('lb-demo-roof', m.area, 'SF', name + ' (demolish)'); return; }
    summary.roofArea += m.area; summary.roofSquares += m.squares;
    add(sec.materialId, m.area, 'SF', name, s.roofWaste);
    const layers = sec.layers == null ? 1 : +sec.layers;   // 0 = nothing to tear off (a new roof over an addition)
    if (acc.tearoff && layers > 0) add(acc.tearoff, m.area * layers, 'SF', name);
    if (sec.style !== 'flat') {
      if (acc.ridgecap) add(acc.ridgecap, m.ridge + m.hips, 'LF', name);
      if (acc.drip) add(acc.drip, m.eaves + m.rakes, 'LF', name);
      if (acc.starter) add(acc.starter, m.eaves, 'LF', name);
      if (acc.ice) add(acc.ice, m.eaves + m.valleys, 'LF', name);
      if (acc.gutter) add(acc.gutter, m.eaves, 'LF', name);
      const g = gableArea(sec);
      if (g > 0) add(s.exteriorFinishId, g, 'SF', `${name}: gable ends`, s.wallWaste);
    } else if (sec.parapet > 0) {
      add(s.exteriorFinishId, 2 * (sec.w + sec.d) * sec.parapet, 'SF', `${name}: parapet`, s.wallWaste);
    }
  });

  // Price from the list when the product has a code in it: replace, remove, or both (R&R).
  const act = s.xmActivity || 'rr';
  const fromBook = (p, rawQty, unit) => {
    if (!book || !p || !p.xmCode) return null;
    const e = book.items[normCode(p.xmCode)];
    if (!e) return null;
    const u = e.unit || unit, c = convertUnit(rawQty, unit, u);
    if (!c.ok) warnings.push(`${normCode(p.xmCode)}: the price list sells it per ${u} but the drawing measures ${unit}; check the quantity.`);
    const qty = roundQty(c.qty, u);
    const price = act === 'replace' ? e.replace : act === 'remove' ? e.remove : e.replace + e.remove;
    const matUnit = e.material != null ? (act === 'remove' ? 0 : e.material) : 0;
    return { code: normCode(p.xmCode), name: e.desc || p.name, unit: u, qty, price, labor: 0, material: qty * price, laborTotal: 0, total: qty * price, taxBase: qty * matUnit, priced: 'list' };
  };
  // Finish each line: waste, rounding, money
  const out = [];
  for (const L of lines.values()) {
    if (L.category === 'furniture' && !L.price && !L.labor) continue;   // display-only pieces
    const withWaste = L.raw * (1 + (L.waste || 0) / 100);
    const p = findProduct(catalog, L.productId);
    const b = fromBook(p, withWaste, L.unit);
    const group = (L.key.split('|')[1] || '');
    if (b) { out.push({ ...L, ...b, name: b.name + (group ? ` – ${group}` : ''), source: L.sources.join('; ') }); continue; }
    const qty = roundQty(withWaste, L.unit);
    out.push({ ...L, code: p && p.xmCode ? normCode(p.xmCode) : '', qty, material: qty * L.price, laborTotal: qty * L.labor, total: qty * (L.price + L.labor), taxBase: qty * L.price, priced: book ? 'own' : 'catalog', source: L.sources.join('; ') });
  }
  // Hand-added lines
  (project.extraLines || []).forEach(x => {
    const p = x.productId ? findProduct(catalog, x.productId) : null;
    const qty = +x.qty || 0;
    const hasOwn = (x.price != null && x.price !== '') || (x.labor != null && x.labor !== '');
    const b = !hasOwn ? fromBook(p || (x.code ? { xmCode: x.code, name: x.name, unit: x.unit } : null), qty, p ? p.unit : (x.unit || 'EA')) : null;
    let where = x.note || 'Added by hand';
    if (x.roomId) project.levels.forEach(l => { const r = l.rooms.find(rr => rr.id === x.roomId); if (r) where = `${l.name}: ${r.name}`; });
    const base = { key: 'x|' + x.id, extraId: x.id, productId: x.productId || '', roomId: x.roomId || '', category: x.category || (p ? p.category : 'other'), raw: qty, waste: 0, source: where, sources: [where] };
    if (b) { out.push({ ...base, ...b, qty }); return; }
    const price = x.price != null && x.price !== '' ? +x.price : (p ? +p.price : 0);
    const labor = x.labor != null && x.labor !== '' ? +x.labor : (p ? +p.labor : 0);
    out.push({ ...base, code: x.code ? normCode(x.code) : (p && p.xmCode ? normCode(p.xmCode) : ''), name: x.name || (p ? p.name : 'Line item'), unit: x.unit || (p ? p.unit : 'EA'), qty, price, labor, material: qty * price, laborTotal: qty * labor, total: qty * (price + labor), taxBase: qty * price, priced: !book ? 'catalog' : (x.code && hasOwn ? 'entered' : 'own') });
  });
  if (book) {
    const own = out.filter(l => l.priced === 'own').length;
    if (own) warnings.push(`${own} line${own > 1 ? 's' : ''} use your catalog price: their product has no code, or the code is not in "${book.name}". Add codes in 📦 Catalog (Xactimate code column).`);
    if (!book.hasMaterial) warnings.push(`"${book.name}" has no Material column, so sales tax is figured only on lines priced from your catalog.`);
  }
  const order = ['roofing', 'siding', 'masonry', 'window', 'door', 'drywall', 'paint', 'trim', 'flooring', 'tile', 'cabinet', 'countertop', 'plumbing', 'appliance', 'electrical', 'commercial', 'outdoor', 'hardscape', 'landscape', 'furniture', 'labor', 'other'];
  out.sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category)) || a.name.localeCompare(b.name));

  const material = out.reduce((t, l) => t + l.material, 0);
  const labor = out.reduce((t, l) => t + l.laborTotal, 0);
  const tax = out.reduce((t, l) => t + (l.taxBase || 0), 0) * (s.taxRate || 0) / 100;
  const subtotal = material + labor + tax;
  const overhead = subtotal * (s.overheadPct || 0) / 100;
  const profit = subtotal * (s.profitPct || 0) / 100;
  const totals = { material, labor, tax, subtotal, overhead, profit, grand: subtotal + overhead + profit };

  const groups = [];
  const gkey = l => byRoom ? (l.sources && l.sources[0]) || l.source || 'Other' : l.category;
  out.forEach(l => { const k = gkey(l); let g = groups.find(x => x.key === k); if (!g) { g = { key: k, category: l.category, name: byRoom ? k : categoryName(l.category), lines: [], total: 0 }; groups.push(g); } g.lines.push(l); g.total += l.total; });
  if (byRoom) groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { lines: out, groups, totals, summary, warnings, pricedFrom: book ? book.name : 'Your catalog prices', book: !!book, byRoom };
}

export function estimateCSV(project, t) {
  const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['Group', 'Code', 'Item', 'Qty', 'Unit', 'Material/unit', 'Labor/unit', 'Material', 'Labor', 'Total', 'Priced from', 'Where']];
  t.groups.forEach(g => g.lines.forEach(l => rows.push([g.name, l.code || '', l.name, l.qty.toFixed(2), l.unit, l.price.toFixed(2), l.labor.toFixed(2), l.material.toFixed(2), l.laborTotal.toFixed(2), l.total.toFixed(2), l.priced === 'list' ? t.pricedFrom : 'Catalog', l.source])));
  rows.push([]);
  const T = t.totals, st = project.settings;
  const tot = (label, v) => rows.push(['', '', label, '', '', '', '', '', '', v.toFixed(2)]);
  tot(t.book ? 'Line items' : 'Material', t.book ? T.material + T.labor : T.material);
  if (!t.book) tot('Labor', T.labor);
  tot(`Tax ${st.taxRate}% on material`, T.tax); tot(`Overhead ${st.overheadPct}%`, T.overhead); tot(`Profit ${st.profitPct}%`, T.profit); tot('Total', T.grand);
  rows.push([]); rows.push(['', '', 'Prices from: ' + t.pricedFrom]);
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}


// Line items laid out for keying into Xactimate (or any estimating program): room / group, code,
// description, activity, quantity, unit. Prices are included for checking against the program.
export function lineItemsCSV(project, t) {
  const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const act = { rr: 'R&R', replace: 'Replace', remove: 'Remove' }[project.settings.xmActivity || 'rr'];
  const rows = [['Room / group', 'Code', 'Description', 'Activity', 'Qty', 'Unit', 'Unit price', 'Total', 'Notes']];
  t.groups.forEach(g => g.lines.forEach(l => rows.push([g.name, l.code || '', l.name, l.code ? act : '', l.qty.toFixed(2), l.unit, (l.price + l.labor).toFixed(2), l.total.toFixed(2), l.priced === 'own' ? 'Priced from catalog (no code in price list)' : (l.code ? '' : 'No code')])));
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}
