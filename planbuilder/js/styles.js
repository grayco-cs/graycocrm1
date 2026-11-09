// Architectural styles: one click sets the outside (siding / brick / stone), the roof (style, pitch, material,
// overhang), windows, interior doors, trim, interior paint and floors by room type, cabinets and counters,
// and a furniture palette. Apply to the whole house, only the new work (an addition), or one room.
// Auto-furnish lays out furniture, rugs, lights and art in each room by its type, in the style's colors.

import { addItem, addRoof, uid, phaseOf } from './model.js';
import { bbox, polyArea, pointInPoly, centroid, dist } from './geom.js';

export const STYLES = [
  { id: 'farmhouse', name: 'Modern Farmhouse', desc: 'White board & batten, black metal roof and windows, white oak, shaker cabinets.',
    ext: 'sid-hardie-hardiepanel-board-and-batten-arctic-white', roof: { style: 'gable', pitch: 10, materialId: 'rf-metal-ss-matte-black', overhang: 1.5 },
    window: 'wn-dh-3060-black', intDoor: 'dr-int-6p', trim: 'trm-base-mdf-primed', paint: 'pnt-sherwin-williams-alabaster-sw-7008',
    floors: { main: 'flr-eng-white-oak', bed: 'flr-eng-white-oak', kitchen: 'flr-eng-white-oak', wet: 'flr-tile-hexagon-mosaic-white' },
    cab: 'shaker-white', counter: 'ctr-quartz-calacatta-white', pal: { sofa: '#d9d3c7', fabric: '#ece7dc', wood: '#8a6a4a', rug: '#b9ab95', accent: '#2f3c50', metal: '#222222' } },
  { id: 'craftsman', name: 'Craftsman', desc: 'Sage lap siding, deep eaves, weathered-wood shingles, oak trim and floors.',
    ext: 'sid-hardie-hardieplank-lap-siding-mountain-sage', roof: { style: 'gable', pitch: 6, materialId: 'rf-gaf-hdz-weathered-wood', overhang: 2 },
    window: 'wn-wood-dh', intDoor: 'dr-int-knotty-alder', trim: 'trm-base-oak', paint: 'pnt-benjamin-moore-pale-oak-oc-20',
    floors: { main: 'flr-solid-red-oak', bed: 'flr-solid-red-oak', kitchen: 'flr-solid-red-oak', wet: 'flr-tile-travertine-ivory' },
    cab: 'shaker-natural-oak', counter: 'ctr-granite-santa-cecilia', pal: { sofa: '#7a5a44', fabric: '#d8cbb3', wood: '#5e4130', rug: '#8c6d5a', accent: '#6b7c4a', metal: '#3a2f28' } },
  { id: 'contemporary', name: 'Contemporary', desc: 'Charcoal metal panels, low shed roof, black casements, walnut and concrete-look tile.',
    ext: 'sid-metal-wall-panel-charcoal', roof: { style: 'shed', pitch: 3, materialId: 'rf-metal-ss-charcoal', overhang: 2 },
    window: 'wn-cas-2448-black', intDoor: 'dr-int-walnut', trim: 'trm-base-mdf-primed', paint: 'pnt-benjamin-moore-chantilly-lace-oc-65',
    floors: { main: 'flr-tile-porcelain-24-24-concrete-gray', bed: 'flr-eng-white-oak', kitchen: 'flr-tile-porcelain-24-24-concrete-gray', wet: 'flr-tile-porcelain-24-24-concrete-gray' },
    cab: 'flat-slab-walnut', counter: 'ctr-quartz-pure-white', pal: { sofa: '#4a4d52', fabric: '#e6e3dc', wood: '#3a2c24', rug: '#d9d6cf', accent: '#c9873a', metal: '#111111' } },
  { id: 'traditional', name: 'Traditional', desc: 'Red brick, charcoal hip roof, white double-hungs, red oak, raised-panel cabinets.',
    ext: 'brk-red-smooth', roof: { style: 'hip', pitch: 8, materialId: 'rf-gaf-hdz-charcoal', overhang: 1.5 },
    window: 'wn-dh-3060-white', intDoor: 'dr-int-6p', trim: 'trm-base-mdf-primed', paint: 'pnt-sherwin-williams-accessible-beige-sw-7036',
    floors: { main: 'flr-solid-red-oak', bed: 'flr-carpet-frieze-taupe', kitchen: 'flr-solid-red-oak', wet: 'flr-tile-marble-carrara' },
    cab: 'raised-panel-white', counter: 'ctr-granite-colonial-white', pal: { sofa: '#a39a8c', fabric: '#efe8da', wood: '#5a3a28', rug: '#8c3a2f', accent: '#2f4a3a', metal: '#b08d57' } },
  { id: 'mediterranean', name: 'Mediterranean / Spanish', desc: 'Stucco, low clay-tile hip roof, bronze casements, saltillo tile, espresso cabinets.',
    ext: 'sid-stucco-3-coat-sand-finish', roof: { style: 'hip', pitch: 4, materialId: 'rf-clay-tile', overhang: 1.5 },
    window: 'wn-cas-2448-bronze', intDoor: 'dr-int-knotty-alder', trim: 'trm-base-mdf-primed', paint: 'pnt-behr-blank-canvas',
    floors: { main: 'flr-tile-saltillo-terracotta', bed: 'flr-solid-hickory', kitchen: 'flr-tile-saltillo-terracotta', wet: 'flr-tile-saltillo-terracotta' },
    cab: 'raised-panel-espresso', counter: 'ctr-granite-santa-cecilia', pal: { sofa: '#c9b48f', fabric: '#efe6d2', wood: '#5a3a28', rug: '#9c5a3c', accent: '#2f6f8f', metal: '#2b2b2b' } },
  { id: 'colonial', name: 'Colonial', desc: 'White clapboard, steep slate-gray gable, cherry floors, navy cabinets, marble.',
    ext: 'sid-vinyl-siding-clapboard-white', roof: { style: 'gable', pitch: 10, materialId: 'rf-gaf-hdz-slate', overhang: 1 },
    window: 'wn-dh-3060-white', intDoor: 'dr-int-6p', trim: 'trm-base-mdf-primed', paint: 'pnt-benjamin-moore-white-dove-oc-17',
    floors: { main: 'flr-solid-cherry', bed: 'flr-carpet-plush-gray', kitchen: 'flr-solid-cherry', wet: 'flr-tile-marble-carrara' },
    cab: 'raised-panel-navy', counter: 'ctr-marble-carrara', pal: { sofa: '#3c4a5c', fabric: '#f1ece2', wood: '#6e3a28', rug: '#8c3a2f', accent: '#b08d57', metal: '#b08d57' } },
  { id: 'coastal', name: 'Coastal', desc: 'Pewter shingle siding, driftwood roof, sea-salt walls, light floors, white kitchen.',
    ext: 'sid-hardie-hardieshingle-aged-pewter', roof: { style: 'hip', pitch: 6, materialId: 'rf-oc-duration-driftwood', overhang: 1.5 },
    window: 'wn-dh-3060-white', intDoor: 'dr-int-6p', trim: 'trm-base-mdf-primed', paint: 'pnt-sherwin-williams-sea-salt-sw-6204',
    floors: { main: 'flr-lam-coastal-white', bed: 'flr-lam-coastal-white', kitchen: 'flr-lam-coastal-white', wet: 'flr-tile-porcelain-wood-look-oak' },
    cab: 'shaker-white', counter: 'ctr-quartz-pure-white', pal: { sofa: '#e8e4da', fabric: '#f4f1ea', wood: '#c9ad84', rug: '#9aa5ad', accent: '#6e94ad', metal: '#c9c4b8' } },
  { id: 'industrial', name: 'Industrial / Loft', desc: 'Galvalume panels, flat roof, black casements, polished concrete, black slab cabinets.',
    ext: 'sid-metal-wall-panel-galvalume', roof: { style: 'flat', pitch: 0, materialId: 'rf-tpo', overhang: 0 },
    window: 'wn-cas-2448-black', intDoor: 'dr-int-walnut', trim: 'trm-base-mdf-primed', paint: 'pnt-sherwin-williams-repose-gray-sw-7015',
    floors: { main: 'flr-polished-conc', bed: 'flr-eng-black-walnut', kitchen: 'flr-polished-conc', wet: 'flr-tile-slate-charcoal' },
    cab: 'flat-slab-black', counter: 'ctr-concrete-sealed', pal: { sofa: '#7a4f35', fabric: '#d9d6cf', wood: '#3a2c24', rug: '#5c5a59', accent: '#c9873a', metal: '#1f1f1f' } },
  { id: 'midcentury', name: 'Mid-century Modern', desc: 'Cedar siding, low gable with deep eaves, walnut, white quartz, warm accents.',
    ext: 'sid-cedar-bevel-siding-natural', roof: { style: 'gable', pitch: 3, materialId: 'rf-gaf-hdz-charcoal', overhang: 2.5 },
    window: 'wn-cas-2448-black', intDoor: 'dr-int-walnut', trim: 'trm-base-walnut', paint: 'pnt-behr-ultra-pure-white',
    floors: { main: 'flr-eng-black-walnut', bed: 'flr-eng-black-walnut', kitchen: 'flr-eng-black-walnut', wet: 'flr-tile-hexagon-mosaic-white' },
    cab: 'flat-slab-walnut', counter: 'ctr-quartz-pure-white', pal: { sofa: '#c96f3a', fabric: '#efe6d2', wood: '#8a5a34', rug: '#d8c9a4', accent: '#2f6f6a', metal: '#b08d57' } },
  { id: 'ranch', name: 'Southern Ranch', desc: 'Antique brick, estate-gray hip roof, agreeable-gray walls, oak plank, dove-gray shaker.',
    ext: 'brk-used-antique', roof: { style: 'hip', pitch: 6, materialId: 'rf-oc-duration-estate-gray', overhang: 1.5 },
    window: 'wn-dh-3060-white', intDoor: 'dr-int-6p', trim: 'trm-base-mdf-primed', paint: 'pnt-sherwin-williams-agreeable-gray-sw-7029',
    floors: { main: 'flr-lvp-oak', bed: 'flr-carpet-berber-oatmeal', kitchen: 'flr-lvp-oak', wet: 'flr-tile-ceramic-12-12-beige' },
    cab: 'shaker-dove-gray', counter: 'ctr-granite-uba-tuba', pal: { sofa: '#9a8f80', fabric: '#ece6da', wood: '#6e5440', rug: '#b9ab95', accent: '#5b6b7d', metal: '#3a3a3a' } },
];

export function styleById(id) { return STYLES.find(s => s.id === id) || null; }

// Every product a style names, so a test can make sure they all exist in the catalog.
export function styleProductIds(s) {
  return [s.ext, s.roof.materialId, s.window, s.intDoor, s.trim, s.paint, ...Object.values(s.floors), `cab-${s.cab}-base`, `cab-${s.cab}-wall`, s.counter];
}

export function roomType(name) {
  const n = String(name || '').toLowerCase();
  if (/bath|\brr\b|restroom|powder|toilet|shower/.test(n)) return 'bath';
  if (/kitchen|break ?room/.test(n)) return 'kitchen';
  if (/laundry|utility|mud/.test(n)) return 'laundry';
  if (/closet|wic|pantry|storage|janitor|supplies|\bit\b/.test(n)) return 'closet';
  if (/garage|shop|warehouse/.test(n)) return 'garage';
  if (/dining/.test(n)) return 'dining';
  if (/conference|meeting/.test(n)) return 'conference';
  if (/office|study/.test(n)) return 'office';
  if (/bed|primary|master|guest|nursery/.test(n)) return 'bed';
  if (/living|family|great|den|lounge|bonus|media/.test(n)) return 'living';
  if (/lobby|reception|foyer|entry/.test(n)) return 'lobby';
  if (/hall|corridor/.test(n)) return 'hall';
  return 'other';
}

// Which rooms / walls / roofs a scope covers. scope: { kind: 'all' | 'new' | 'room', roomId }
function inScope(o, scope) {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'new') return phaseOf(o) === 'new';
  return false;
}

// Apply a style. Returns a short list of what changed, for the status line.
export function applyStyle(project, styleId, scope, catalog) {
  const st = styleById(styleId); if (!st) return [];
  const has = id => catalog.some(p => p.id === id);
  const done = new Set();
  const pick = (...ids) => ids.find(has) || '';
  project.levels.forEach(level => {
    const rooms = scope.kind === 'room' ? level.rooms.filter(r => r.id === scope.roomId) : level.rooms.filter(r => inScope(r, scope));
    rooms.forEach(r => {
      if (r.outdoor || phaseOf(r) === 'demo') return;
      const t = roomType(r.name);
      const f = t === 'bath' || t === 'laundry' ? st.floors.wet : t === 'kitchen' ? st.floors.kitchen : t === 'bed' || t === 'closet' ? st.floors.bed : t === 'garage' ? 'flr-sealed-conc' : st.floors.main;
      if (has(f)) r.floorId = f;
      if (t !== 'garage' && has(st.paint)) r.wallFinishId = st.paint;
      r.style = st.id; done.add('rooms');
      // cabinets and counters inside the room
      level.items.forEach(it => { if (pointInPoly({ x: it.x, y: it.y }, r.points)) swapCabinet(it, st, catalog) && done.add('cabinets'); });
    });
    if (scope.kind === 'room') return;
    // outside walls
    level.walls.forEach(w => {
      if (!w.exterior || !inScope(w, scope) || phaseOf(w) === 'demo') return;
      if (scope.kind === 'all') w.finishOut = ''; else if (has(st.ext)) w.finishOut = st.ext;
      done.add('outside walls');
    });
    // windows and interior doors
    level.openings.forEach(o => {
      if (!inScope(o, scope) || phaseOf(o) === 'demo') return;
      const w = level.walls.find(x => x.id === o.wallId);
      if (o.type === 'window' && has(st.window)) { o.productId = st.window; done.add('windows'); }
      else if (o.type === 'door' && w && !w.exterior && has(st.intDoor)) { o.productId = st.intDoor; done.add('doors'); }
    });
    if (scope.kind === 'new') level.items.forEach(it => { if (phaseOf(it) === 'new' && swapCabinet(it, st, catalog)) done.add('cabinets'); });
  });
  if (scope.kind === 'all') {
    if (has(st.ext)) project.settings.exteriorFinishId = st.ext;
    if (has(st.trim)) project.settings.baseboardId = st.trim;
    project.style = st.id;
  }
  // roofs: restyle the ones in scope; frame one when there is none
  if (scope.kind !== 'room') {
    const roofs = project.roofs.filter(r => inScope(r, scope) && phaseOf(r) !== 'demo');
    roofs.forEach(r => { Object.assign(r, { style: st.roof.style, pitch: st.roof.pitch, overhang: st.roof.overhang, ridge: 'auto' }); if (has(st.roof.materialId)) r.materialId = st.roof.materialId; if (st.roof.style === 'flat') r.parapet = r.parapet || 0; done.add('roof'); });
    if (!roofs.length) { const n = frameRoofs(project, scope, st); if (n) done.add(`${n} roof${n > 1 ? 's' : ''} framed`); }
  }
  void pick;
  return [...done];
}

function swapCabinet(it, st, catalog) {
  const p = catalog.find(x => x.id === it.productId); if (!p) return false;
  let to = '';
  if (p.category === 'cabinet' && p.objType === 'base' && !/island|vanity/i.test(p.name)) to = `cab-${st.cab}-base`;
  else if (p.category === 'cabinet' && p.objType === 'upper') to = `cab-${st.cab}-wall`;
  else if (p.category === 'countertop' || p.id === 'ctr-quartz') to = st.counter;
  if (!to || to === it.productId || !catalog.some(x => x.id === to)) return false;
  it.productId = to; return true;
}

// Frame a roof over the top level (whole house) or over the new rooms (an addition), in the style's roof.
export function frameRoofs(project, scope, st) {
  let made = 0;
  const top = project.levels[project.levels.length - 1];
  const targets = scope.kind === 'new' ? project.levels : [top];
  targets.forEach(level => {
    const rooms = level.rooms.filter(r => !r.outdoor && phaseOf(r) !== 'demo' && (scope.kind !== 'new' || phaseOf(r) === 'new'));
    let pts = [];
    if (scope.kind === 'new') rooms.forEach(r => pts.push(...r.points));
    else { level.walls.filter(w => w.exterior && phaseOf(w) !== 'demo').forEach(w => pts.push(w.a, w.b)); if (!pts.length) rooms.forEach(r => pts.push(...r.points)); }
    if (pts.length < 3) return;
    const b = bbox(pts); if (b.w < 4 || b.h < 4) return;
    // an addition next to an existing roof: shed or gable that runs away from the house reads best
    const r = addRoof(project, level, { x: b.x, y: b.y, w: b.w, h: b.h }, { style: st.roof.style, pitch: st.roof.pitch, overhang: st.roof.overhang, materialId: st.roof.materialId, phase: scope.kind === 'new' ? 'new' : undefined });
    if (scope.kind === 'all') r.phase = 'new'; else r.layers = 0;   // a new roof over an addition has nothing to tear off
    made++;
  });
  return made;
}

// ---------------------------------------------------------------- auto-furnish
// Places a furniture layout in each room by type. Items it places are marked auto: true, so running it
// again (or with another style) replaces them and never touches what you placed yourself.
export function autoFurnish(level, rooms, styleId, catalog) {
  const st = styleById(styleId) || STYLES[0], P = st.pal;
  let placed = 0;
  const has = id => catalog.some(p => p.id === id);
  rooms.forEach(r => {
    if (phaseOf(r) === 'demo') return;
    level.items = level.items.filter(it => !(it.auto && it.roomId === r.id));
    const b = bbox(r.points), g = 0.45;                       // gap from the wall centre line
    const X0 = b.x + g, Y0 = b.y + g, X1 = b.x + b.w - g, Y1 = b.y + b.h - g, W = X1 - X0, H = Y1 - Y0, cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    if (W < 4 || H < 4) return;
    const put = (id, x, y, rot = 0, over = {}) => {
      if (!has(id)) return null;
      const p = catalog.find(q => q.id === id);
      const it = addItem(level, p, x, y); it.rot = rot; it.auto = true; it.roomId = r.id; it.phase = phaseOf(r);
      const key = { sofa: 'sofa', chair: 'sofa', bed: 'fabric', table: 'wood', box: 'wood', shelf: 'wood', stool: 'metal', rug: 'rug', art: 'accent', lamp: 'metal', pendant: 'metal' }[p.objType];
      if (key && p.category === 'furniture' || (key === 'metal' && p.objType === 'pendant')) it.color = P[key];
      Object.assign(it, over);
      if (!pointInPoly({ x: it.x, y: it.y }, r.points)) { level.items.pop(); return null; }
      placed++; return it;
    };
    const t = r.outdoor ? (/patio|deck|porch/i.test(r.name) ? 'patio' : 'none') : roomType(r.name);
    if (t === 'living' || (t === 'lobby' && W >= 8 && H >= 8)) {
      if (t === 'lobby') { put('fn-plant-floor', X0 + 1, Y0 + 1); put('fn-bench', cx, Y1 - 1, 180); put('fn-art-large', cx, Y1 - 0.08, 180); put('fn-rug-5x8', cx, cy, 0); return; }
      const big = W >= 14;
      put('fn-rug-8x10', cx, cy + 0.5, 0, { w: Math.min(10, W - 3), d: Math.min(8, H - 4) });
      put(big ? 'fn-sofa-sect' : 'fn-sofa-3', cx, Y1 - 1.7, 180, big ? { w: Math.min(10, W - 5) } : { w: Math.min(7.5, W - 4) });
      put('fn-coffee', cx, Y1 - 5, 0);
      put('fn-tv-console', cx, Y0 + 0.8, 0); put('fn-tv', cx, Y0 + 0.15, 0);
      if (big) { put('fn-armchair', X0 + 2, cy - 1, 270); put('fn-armchair', X1 - 2, cy - 1, 90); }
      put('fn-lamp-floor', X1 - 0.8, Y1 - 0.8); put('fn-plant-floor', X0 + 0.9, Y1 - 0.9);
      put('fn-art-large', cx, Y1 - 0.08, 180);
    } else if (t === 'bed') {
      const bed = W >= 13 && H >= 13 ? 'fn-bed-king' : W >= 10 && H >= 10 ? 'fn-bed-queen2' : 'fn-bed-twin';
      const bw = bed === 'fn-bed-king' ? 6.7 : bed === 'fn-bed-queen2' ? 5.2 : 3.4;
      put('fn-rug-8x10', cx, Y0 + 4.5, 0, { w: Math.min(10, W - 2), d: Math.min(8, H - 3) });
      put(bed, cx, Y0 + 3.5, 0);
      if (W >= bw + 4.6) { put('fn-nightstand', cx - bw / 2 - 1.2, Y0 + 0.9); put('fn-nightstand', cx + bw / 2 + 1.2, Y0 + 0.9); put('fn-lamp-table', cx - bw / 2 - 1.2, Y0 + 0.9, 0, { elev: 2.2 }); put('fn-lamp-table', cx + bw / 2 + 1.2, Y0 + 0.9, 0, { elev: 2.2 }); }
      if (H >= 7 + 5) put('fn-dresser', cx, Y1 - 1, 180);
      put('fn-art-large', cx, Y0 + 0.08, 0, { elev: 4.6 });
      if (W >= 11) put('fn-plant-small', X1 - 0.7, Y1 - 0.7);
    } else if (t === 'dining') {
      const six = W >= 10 && H >= 9;
      put('fn-rug-8x10', cx, cy, 0, { w: Math.min(10, W - 2), d: Math.min(8, H - 2) });
      put(six ? 'fn-dining-6' : 'fn-dining-4', cx, cy);
      const seats = six ? [[-1.8, -2.4, 0], [0, -2.4, 0], [1.8, -2.4, 0], [-1.8, 2.4, 180], [0, 2.4, 180], [1.8, 2.4, 180]] : [[0, -2.7, 0], [0, 2.7, 180], [-2.7, 0, 270], [2.7, 0, 90]];
      seats.forEach(([dx, dy, rot]) => put('fn-chair-dining', cx + dx, cy + dy, rot));   // each chair faces the table
      put('el-chandelier', cx, cy, 0); put('fn-art-large', X0 + 0.08, cy, 270);
    } else if (t === 'kitchen') {
      const island = level.items.find(it => pointInPoly({ x: it.x, y: it.y }, r.points) && /island/i.test((catalog.find(p => p.id === it.productId) || {}).name || ''));
      if (island) {
        const n = Math.max(2, Math.min(4, Math.floor(island.w / 2)));
        for (let i = 0; i < n; i++) put('fn-stool', island.x - island.w / 2 + (island.w * (i + 0.5)) / n, island.y + island.d / 2 + 1, 0);
        for (let i = 0; i < Math.min(3, n); i++) put('el-pendant', island.x - island.w / 2 + (island.w * (i + 0.5)) / Math.min(3, n), island.y, 0);
      } else put('el-pendant', cx, cy, 0);
      put('fn-plant-small', X1 - 0.6, Y1 - 0.6);
    } else if (t === 'office') {
      put('fn-rug-5x8', cx, cy, 0, { w: Math.min(8, W - 2), d: Math.min(5, H - 2) });
      put('fn-desk-2', cx, Y0 + 1.3, 0); put('fn-chair-office', cx, Y0 + 3.3, 180);
      if (W >= 9) put('fn-bookshelf', X1 - 0.7, cy, 90);
      put('fn-art-large', X0 + 0.08, cy, 270); put('fn-plant-floor', X1 - 0.9, Y1 - 0.9);
    } else if (t === 'conference') {
      const tw = Math.max(6, Math.min(W - 6, 14)), td = Math.min(4, H - 6);
      if (td >= 3) {
        put('fn-table', cx, cy, 0, { w: tw, d: td, h: 2.5 });
        const n = Math.max(2, Math.floor(tw / 2.5));
        for (let i = 0; i < n; i++) { const x = cx - tw / 2 + (tw * (i + 0.5)) / n; put('fn-chair-office', x, cy - td / 2 - 1, 0); put('fn-chair-office', x, cy + td / 2 + 1, 180); }
        put('el-pendant', cx - tw / 4, cy); put('el-pendant', cx + tw / 4, cy);
      }
      put('fn-tv', cx, Y0 + 0.15, 0); put('fn-art-large', cx, Y1 - 0.08, 180);
    } else if (t === 'hall') {
      if (W > H) put('fn-rug-runner', cx, cy, 0, { w: Math.min(10, W - 2), d: Math.min(2.5, H - 1) });
      else put('fn-rug-runner', cx, cy, 90, { w: Math.min(10, H - 2), d: Math.min(2.5, W - 1) });
      if (Math.max(W, H) > 12) put('fn-art-small', W > H ? cx : X0 + 0.08, W > H ? Y0 + 0.08 : cy, W > H ? 0 : 270);
    } else if (t === 'bath') {
      put('fn-plant-small', X0 + 0.6, Y1 - 0.6); put('fn-art-small', cx, Y1 - 0.08, 180);
    } else if (t === 'patio') {
      put('fn-outdoor-set', cx, cy); if (W >= 12) put('fn-lounge', X1 - 1.5, cy, 90);
    }
  });
  return placed;
}

void dist; void centroid; void polyArea; void uid;
