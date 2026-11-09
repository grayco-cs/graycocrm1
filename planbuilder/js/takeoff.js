// PlanBuilder takeoff: turns a drawn plan into quantities and a priced estimate.
// Pure functions (no page code) so tests can check the numbers.

import { polyArea, polyPerimeter, centroid, pointInPoly, projectOnSeg, wallLength, wallPieces, wallHeight, openingArea, roofMeasure, ridgeAxis } from './geom.js';
import { findProduct, categoryName } from './catalog.js';

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

export function computeTakeoff(project, catalog) {
  const s = project.settings;
  const lines = new Map();
  const warnings = [];
  const add = (productId, baseQty, base, source, wastePct = 0, group = '') => {
    if (!(baseQty > 0)) return;
    const p = findProduct(catalog, productId);
    if (!p) { if (productId) warnings.push(`Product "${productId}" is not in the catalog (${source}).`); return; }
    const key = productId + '|' + group;
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
      lv.rooms.push({ id: r.id, name: r.name, outdoor: !!r.outdoor, ...st });
      const where = `${level.name}: ${r.name}`;
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
      summary.openings++;
      if (o.productId) add(o.productId, 1, 'EA', `${level.name}: doors & windows`);
    });
    level.items.forEach(it => {
      const p = findProduct(catalog, it.productId);
      if (!p) { warnings.push(`A placed item uses "${it.productId}", which is not in the catalog.`); return; }
      const q = p.unit === 'LF' ? it.w : (p.unit === 'SF' ? (p.objType === 'panel' ? it.w * it.h : it.w * it.d) : 1);
      add(it.productId, q, p.unit === 'SF' ? 'SF' : (p.unit === 'LF' ? 'LF' : 'EA'), `${level.name}: placed items`);
    });
    summary.floorArea += lv.floorArea; summary.outdoorArea += lv.outdoorArea || 0; summary.extWallLF += lv.extWallLF; summary.intWallLF += lv.intWallLF;
    summary.levels.push(lv);
  });

  // Roofs
  const acc = s.roofAccessories || {};
  project.roofs.forEach((sec, i) => {
    const m = roofMeasure(sec);
    const name = `Roof ${i + 1} (${sec.style}${sec.style !== 'flat' ? ' ' + sec.pitch + '/12' : ''})`;
    summary.roofs.push({ id: sec.id, name, ...m });
    summary.roofArea += m.area; summary.roofSquares += m.squares;
    add(sec.materialId, m.area, 'SF', name, s.roofWaste);
    if (acc.tearoff) add(acc.tearoff, m.area * Math.max(1, sec.layers || 1), 'SF', name);
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

  // Finish each line: waste, rounding, money
  const out = [];
  for (const L of lines.values()) {
    if (L.category === 'furniture' && !L.price && !L.labor) continue;   // display-only pieces
    const withWaste = L.raw * (1 + (L.waste || 0) / 100);
    const qty = roundQty(withWaste, L.unit);
    out.push({ ...L, qty, material: qty * L.price, laborTotal: qty * L.labor, total: qty * (L.price + L.labor), source: L.sources.join('; ') });
  }
  // Hand-added lines
  (project.extraLines || []).forEach(x => {
    const p = x.productId ? findProduct(catalog, x.productId) : null;
    const price = x.price != null && x.price !== '' ? +x.price : (p ? +p.price : 0);
    const labor = x.labor != null && x.labor !== '' ? +x.labor : (p ? +p.labor : 0);
    const qty = +x.qty || 0;
    out.push({ key: 'x|' + x.id, extraId: x.id, productId: x.productId || '', category: x.category || (p ? p.category : 'other'), name: x.name || (p ? p.name : 'Line item'), unit: x.unit || (p ? p.unit : 'EA'), raw: qty, qty, waste: 0, price, labor, material: qty * price, laborTotal: qty * labor, total: qty * (price + labor), source: x.note || 'Added by hand' });
  });
  const order = ['roofing', 'siding', 'masonry', 'window', 'door', 'drywall', 'paint', 'trim', 'flooring', 'tile', 'cabinet', 'countertop', 'plumbing', 'appliance', 'electrical', 'commercial', 'outdoor', 'hardscape', 'landscape', 'furniture', 'labor', 'other'];
  out.sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category)) || a.name.localeCompare(b.name));

  const material = out.reduce((t, l) => t + l.material, 0);
  const labor = out.reduce((t, l) => t + l.laborTotal, 0);
  const tax = material * (s.taxRate || 0) / 100;
  const subtotal = material + labor + tax;
  const overhead = subtotal * (s.overheadPct || 0) / 100;
  const profit = subtotal * (s.profitPct || 0) / 100;
  const totals = { material, labor, tax, subtotal, overhead, profit, grand: subtotal + overhead + profit };

  const groups = [];
  out.forEach(l => { let g = groups.find(x => x.category === l.category); if (!g) { g = { category: l.category, name: categoryName(l.category), lines: [], total: 0 }; groups.push(g); } g.lines.push(l); g.total += l.total; });
  return { lines: out, groups, totals, summary, warnings };
}

export function estimateCSV(project, t) {
  const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['Category', 'Item', 'Qty', 'Unit', 'Material/unit', 'Labor/unit', 'Material', 'Labor', 'Total', 'Where']];
  t.lines.forEach(l => rows.push([categoryName(l.category), l.name, l.qty.toFixed(2), l.unit, l.price.toFixed(2), l.labor.toFixed(2), l.material.toFixed(2), l.laborTotal.toFixed(2), l.total.toFixed(2), l.source]));
  rows.push([]);
  const T = t.totals, st = project.settings;
  rows.push(['', 'Material', '', '', '', '', '', '', T.material.toFixed(2)]);
  rows.push(['', 'Labor', '', '', '', '', '', '', T.labor.toFixed(2)]);
  rows.push(['', `Tax ${st.taxRate}% on material`, '', '', '', '', '', '', T.tax.toFixed(2)]);
  rows.push(['', `Overhead ${st.overheadPct}%`, '', '', '', '', '', '', T.overhead.toFixed(2)]);
  rows.push(['', `Profit ${st.profitPct}%`, '', '', '', '', '', '', T.profit.toFixed(2)]);
  rows.push(['', 'Total', '', '', '', '', '', '', T.grand.toFixed(2)]);
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}

