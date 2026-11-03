// PlanBuilder project model: creating projects, levels, walls, rooms and the starter templates.
// A project is plain JSON so it can be saved, exported, imported and (later) synced to the CRM.

import { dist, projectOnSeg, footprintRect } from './geom.js';

export const SCHEMA = 1;

let _n = 0;
export function uid(prefix = 'x') {
  _n = (_n + 1) % 1e6;
  return prefix + '-' + Date.now().toString(36) + '-' + _n.toString(36) + Math.random().toString(36).slice(2, 6);
}

export const PROJECT_TYPES = [
  ['insurance', 'Insurance claim'], ['custom', 'Custom home'], ['remodel', 'Remodel / addition'], ['commercial', 'Commercial build-out'],
];

export function defaultSettings() {
  return {
    extThick: 0.5,        // exterior wall thickness, ft (6")
    intThick: 0.375,      // interior wall thickness, ft (4-1/2")
    snap: 0.5,            // grid snap, ft (6")
    angleSnap: 15,        // degrees
    taxRate: 9.75,        // % on materials
    overheadPct: 10,      // overhead %
    profitPct: 10,        // profit %
    floorWaste: 10,       // % added to flooring
    wallWaste: 10,        // % added to wall finishes
    roofWaste: 10,        // % added to roof covering
    exteriorFinishId: 'sid-vinyl',
    drywallId: 'dw-half',
    ceilingFinishId: 'pnt-ceiling',
    baseboardId: 'trm-base',
    roofAccessories: { tearoff: 'rf-tearoff', ridgecap: 'rf-ridge', drip: 'rf-drip', starter: 'rf-starter', ice: 'rf-ice', gutter: '' },
  };
}

export function newLevel(name, height = 9, elevation = 0) {
  return { id: uid('lvl'), name, height, elevation, walls: [], openings: [], rooms: [], items: [] };
}

export function newProject(name = 'Untitled plan', type = 'custom') {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA, id: uid('prj'), name, type,
    client: '', address: '', claimNo: '', carrier: '', adjuster: '', dateOfLoss: '', notes: '',
    created: now, updated: now,
    settings: defaultSettings(),
    levels: [newLevel('First floor', 9, 0)],
    roofs: [],              // roof sections, each tied to a level
    extraLines: [],         // hand-added estimate lines: { id, productId, qty, note } or { id, name, unit, qty, price, labor, category }
  };
}

// Level elevations follow from the levels below (floor framing 1 ft between levels).
export const FLOOR_DEPTH = 1;
export function restack(project) {
  let z = 0;
  project.levels.forEach((l, i) => { if (i === 0) z = l.elevation || 0; l.elevation = z; z += l.height + FLOOR_DEPTH; });
}
export function levelById(project, id) { return project.levels.find(l => l.id === id) || null; }

// ---- Walls ----
export function addWall(level, a, b, opts = {}) {
  const w = { id: uid('w'), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, thickness: opts.thickness ?? 0.375, height: opts.height || 0, exterior: !!opts.exterior, finishIn: opts.finishIn || '', finishOut: opts.finishOut || '' };
  level.walls.push(w);
  return w;
}
// Is a wall already there (same segment either direction)?
export function findWall(level, a, b, tol = 0.05) {
  return level.walls.find(w => (dist(w.a, a) < tol && dist(w.b, b) < tol) || (dist(w.a, b) < tol && dist(w.b, a) < tol)) || null;
}
// Does an existing wall already cover the segment a-b (collinear and overlapping)?
export function wallCovers(level, a, b, tol = 0.05) {
  return level.walls.some(w => projectOnSeg(a, w.a, w.b).d < tol && projectOnSeg(b, w.a, w.b).d < tol);
}
export function removeWall(level, id) {
  level.walls = level.walls.filter(w => w.id !== id);
  level.openings = level.openings.filter(o => o.wallId !== id);
}

// Walls whose end touches point p (for moving joined corners together).
export function wallsAtPoint(level, p, tol = 0.05) {
  const out = [];
  level.walls.forEach(w => { if (dist(w.a, p) < tol) out.push([w, 'a']); if (dist(w.b, p) < tol) out.push([w, 'b']); });
  return out;
}

// Split a wall at fraction t; openings move to whichever half holds their centre.
export function splitWall(level, w, t) {
  const L = dist(w.a, w.b);
  if (t <= 0.02 || t >= 0.98 || L < 0.5) return null;
  const m = { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t };
  const w2 = { ...w, id: uid('w'), a: { ...m }, b: { ...w.b } };
  w.b = { ...m };
  level.walls.push(w2);
  level.openings.forEach(o => {
    if (o.wallId !== w.id) return;
    if (o.t > t) { o.wallId = w2.id; o.t = (o.t - t) / (1 - t); } else o.t = o.t / t;
  });
  return w2;
}

// ---- Openings ----
export function addOpening(level, wall, t, product) {
  const o = { id: uid('op'), wallId: wall.id, t, productId: product ? product.id : '', type: (product && product.openingType) || 'door', width: (product && product.w) || 3, height: (product && product.h) || 6.67, sill: (product && product.sill) || 0, flip: false, hinge: 'left' };
  level.openings.push(o);
  return o;
}

// ---- Rooms ----
export function addRoom(level, points, opts = {}) {
  const r = { id: uid('rm'), name: opts.name || 'Room', points: points.map(p => ({ x: p.x, y: p.y })), floorId: opts.floorId ?? 'flr-lvp-oak', wallFinishId: opts.wallFinishId ?? 'pnt-int-white', ceilingId: opts.ceilingId ?? '', height: opts.height || 0, baseboard: opts.baseboard ?? true, notes: '' };
  level.rooms.push(r);
  return r;
}
export function rectPts(x, y, w, h) { return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]; }

// Walls along a room's edges, skipping edges that already have a wall.
export function wallsForRoom(level, points, settings, exterior = false) {
  const made = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (dist(a, b) < 0.25 || wallCovers(level, a, b)) continue;
    made.push(addWall(level, a, b, { exterior, thickness: exterior ? settings.extThick : settings.intThick }));
  }
  return made;
}

// ---- Items (placed products) ----
export function addItem(level, product, x, y) {
  const it = { id: uid('it'), productId: product.id, x, y, rot: 0, w: product.w || 2, d: product.d || 2, h: product.h || 3, elev: product.elev || 0, label: '' };
  level.items.push(it);
  return it;
}

// ---- Roofs ----
export function addRoof(project, level, rect, opts = {}) {
  const r = { id: uid('rf'), levelId: level.id, x: rect.x, y: rect.y, w: rect.w, d: rect.h ?? rect.d, style: opts.style || 'gable', pitch: opts.pitch ?? 6, overhang: opts.overhang ?? 1, ridge: opts.ridge || 'auto', materialId: opts.materialId || 'rf-arch-shingle', layers: opts.layers || 1, parapet: opts.parapet || 0 };
  project.roofs.push(r);
  return r;
}
export function autoRoof(project, level, opts = {}) {
  const fp = footprintRect(level);
  if (!fp || fp.w < 1 || fp.h < 1) return null;
  return addRoof(project, level, fp, opts);
}

// ---- Mark outside walls ----
// Walls on the outside of the plan: those touching the bounding box of all walls.
export function markExterior(level, settings) {
  const fp = footprintRect({ walls: level.walls });
  if (!fp) return 0;
  let n = 0;
  const t = 0.05, near = (v, e) => Math.abs(v - e) < t;
  const xs = [fp.x, fp.x + fp.w], ys = [fp.y, fp.y + fp.h];
  level.walls.forEach(w => {
    const vert = near(w.a.x, w.b.x) && xs.some(x => near(w.a.x, x));
    const horiz = near(w.a.y, w.b.y) && ys.some(y => near(w.a.y, y));
    if (vert || horiz) { if (!w.exterior) n++; w.exterior = true; w.thickness = settings.extThick; }
  });
  return n;
}

// ---- Migrate / repair loaded files ----
export function normalize(p) {
  const d = newProject(p.name || 'Untitled plan', p.type || 'custom');
  const out = { ...d, ...p };
  out.settings = { ...defaultSettings(), ...(p.settings || {}) };
  out.settings.roofAccessories = { ...defaultSettings().roofAccessories, ...((p.settings || {}).roofAccessories || {}) };
  out.levels = (p.levels && p.levels.length ? p.levels : d.levels).map(l => ({ walls: [], openings: [], rooms: [], items: [], height: 9, elevation: 0, ...l }));
  out.roofs = p.roofs || [];
  out.extraLines = p.extraLines || [];
  restack(out);
  return out;
}

// ======================= Starter templates =======================
// Small helper so templates read like a drawing: walls by corner, doors by distance along the wall.
function builder(project, level) {
  const s = project.settings;
  const api = {
    level,
    wall(ax, ay, bx, by, ext = false) { return addWall(level, { x: ax, y: ay }, { x: bx, y: by }, { exterior: ext, thickness: ext ? s.extThick : s.intThick }); },
    box(x, y, w, h) { // exterior rectangle, clockwise from top-left
      return [api.wall(x, y, x + w, y, true), api.wall(x + w, y, x + w, y + h, true), api.wall(x + w, y + h, x, y + h, true), api.wall(x, y + h, x, y, true)];
    },
    open(wall, at, productId, catalog) {
      const p = catalog.find(c => c.id === productId);
      const L = dist(wall.a, wall.b);
      return addOpening(level, wall, Math.max(0.01, Math.min(0.99, at / L)), p);
    },
    room(name, x, y, w, h, floorId, wallFinishId) { return addRoom(level, rectPts(x, y, w, h), { name, floorId, wallFinishId }); },
    item(productId, x, y, rot, catalog, over = {}) { const p = catalog.find(c => c.id === productId); const it = addItem(level, p, x, y); it.rot = rot || 0; Object.assign(it, over); return it; },
  };
  return api;
}

export const TEMPLATES = [
  { id: 'blank', name: 'Blank plan', desc: 'Empty first floor. Draw your own walls and rooms.' },
  { id: 'ranch', name: 'Ranch 3 bed / 2 bath – 1,800 SF', desc: '60×30 single story, hip roof 6/12, open kitchen and living.' },
  { id: 'twostory', name: 'Two-story 4 bed – 2,560 SF', desc: '40×32 two floors, gable roof 8/12, attached garage.' },
  { id: 'commercial', name: 'Commercial suite build-out – 2,400 SF', desc: '60×40 tenant space: storefront, offices, conference, restrooms, flat roof.' },
  { id: 'office4056', name: 'Office in front of warehouse – 40×56', desc: 'Drawn from the owner sketch: conference + lobby across the front, center hall and right hall, 5 offices, kitchen and restrooms along the right wall.' },
];

export function fromTemplate(id, catalog) {
  const t = TEMPLATES.find(x => x.id === id) || TEMPLATES[0];
  const p = newProject(t.id === 'blank' ? 'New plan' : t.name.split(' – ')[0], (t.id === 'commercial' || t.id === 'office4056') ? 'commercial' : 'custom');
  const L1 = p.levels[0];
  if (t.id === 'ranch') {
    const b = builder(p, L1);
    const [n, e, s, w] = b.box(0, 0, 60, 30);
    const i1 = b.wall(32, 0, 32, 30);
    const hallN = b.wall(32, 13, 60, 13), hallS = b.wall(32, 17, 60, 17);
    const wb2 = b.wall(44, 0, 44, 13), wb3 = b.wall(50, 0, 50, 13);
    const wm = b.wall(48, 17, 48, 30), wwic = b.wall(48, 24, 60, 24);
    b.open(s, 24, 'dr-ext-steel', catalog);                 // front door (south wall runs 60 -> 0)
    b.open(n, 24, 'dr-patio', catalog);                     // patio door
    b.open(n, 8, 'wn-sh-3050', catalog); b.open(n, 38, 'wn-sh-3050', catalog); b.open(n, 47, 'wn-sh-2440', catalog); b.open(n, 55, 'wn-sh-3050', catalog);
    b.open(s, 40, 'wn-pic-6050', catalog); b.open(s, 8, 'wn-sh-3050', catalog); b.open(s, 20, 'wn-sh-3050', catalog);
    b.open(e, 6, 'wn-sh-3050', catalog); b.open(e, 22, 'wn-sh-2440', catalog); b.open(w, 15, 'wn-sh-3050', catalog);
    b.open(i1, 15, 'op-cased', catalog);
    b.open(hallN, 6, 'dr-int-6p', catalog); b.open(hallN, 15, 'dr-int-2-4', catalog); b.open(hallN, 24, 'dr-int-6p', catalog);
    b.open(hallS, 8, 'dr-int-6p', catalog); b.open(wm, 3.5, 'dr-int-2-4', catalog); b.open(wwic, 4, 'dr-int-2-4', catalog);
    void wb2; void wb3;
    b.room('Living', 0, 0, 18, 30, 'flr-lvp-oak', 'pnt-int-greige');
    b.room('Kitchen', 18, 0, 14, 16, 'flr-tile-porc', 'pnt-int-greige');
    b.room('Dining', 18, 16, 14, 14, 'flr-lvp-oak', 'pnt-int-greige');
    b.room('Bedroom 2', 32, 0, 12, 13, 'flr-carpet', 'pnt-int-white');
    b.room('Bath 2', 44, 0, 6, 13, 'flr-tile-porc', 'pnt-int-white');
    b.room('Bedroom 3', 50, 0, 10, 13, 'flr-carpet', 'pnt-int-white');
    b.room('Hall', 32, 13, 28, 4, 'flr-lvp-oak', 'pnt-int-white');
    b.room('Primary bedroom', 32, 17, 16, 13, 'flr-carpet', 'pnt-int-blue');
    b.room('Primary bath', 48, 17, 12, 7, 'flr-tile-porc', 'pnt-int-white');
    b.room('Walk-in closet', 48, 24, 12, 6, 'flr-carpet', 'pnt-int-white');
    // items are placed by their centre point
    b.item('cab-base', 25, 1.0, 0, catalog, { w: 8 });
    b.item('cab-wall', 25, 0.5, 0, catalog, { w: 8 });
    b.item('ap-range', 19.75, 1.1, 0, catalog);
    b.item('ap-fridge', 30.5, 1.25, 0, catalog);
    b.item('cab-island', 25, 8, 0, catalog);
    b.item('fn-table', 25, 23, 0, catalog);
    b.item('fn-sofa', 9, 22, 180, catalog);
    b.item('pl-toilet', 46, 1.5, 0, catalog); b.item('pl-tub', 48.5, 10.25, 90, catalog); b.item('cab-vanity', 45, 6, 90, catalog);
    b.item('pl-shower', 58, 18.5, 0, catalog); b.item('cab-vanity', 52, 17.9, 0, catalog, { w: 5 }); b.item('pl-toilet', 49.3, 22.5, 90, catalog);
    b.item('fn-bed-q', 40, 26, 0, catalog); b.item('fn-bed-q', 38, 3.5, 0, catalog); b.item('fn-bed-q', 55, 3.5, 0, catalog);
    addRoof(p, L1, { x: 0, y: 0, w: 60, h: 30 }, { style: 'hip', pitch: 6, overhang: 1.5 });
  } else if (t.id === 'twostory') {
    const b = builder(p, L1);
    const [n, e, s, w] = b.box(0, 0, 40, 32);
    const gar = b.box(-24, 8, 24, 24);
    // the garage's east wall is the house's west wall: drop the duplicate
    removeWall(L1, gar[1].id);
    const k = b.wall(0, 16, 22, 16); const st = b.wall(22, 0, 22, 32);
    b.open(s, 28, 'dr-ext-steel', catalog); b.open(gar[2], 12, 'dr-garage-16', catalog); b.open(w, 12, 'dr-ext-steel', catalog);
    b.open(n, 8, 'wn-sh-3050', catalog); b.open(n, 30, 'wn-pic-6050', catalog); b.open(s, 8, 'wn-pic-6050', catalog); b.open(s, 18, 'wn-sh-3050', catalog);
    b.open(e, 8, 'wn-sh-3050', catalog); b.open(e, 24, 'wn-sh-3050', catalog);
    b.open(k, 11, 'op-cased', catalog); b.open(st, 8, 'op-cased', catalog); b.open(st, 24, 'op-cased', catalog);
    b.room('Kitchen / dining', 0, 0, 22, 16, 'flr-hardwood', 'pnt-int-greige');
    b.room('Family room', 0, 16, 22, 16, 'flr-hardwood', 'pnt-int-greige');
    b.room('Foyer / stairs', 22, 0, 18, 32, 'flr-tile-porc', 'pnt-int-white');
    b.room('Garage', -24, 8, 24, 24, 'flr-sealed-conc', '');
    b.item('cab-base', 9, 1.0, 0, catalog, { w: 14 }); b.item('cab-wall', 9, 0.5, 0, catalog, { w: 14 }); b.item('cab-island', 9, 8, 0, catalog);
    b.item('ap-fridge', 17.6, 1.25, 0, catalog); b.item('fn-sofa', 11, 26, 180, catalog);
    b.item('cab-tall', 31, 7, 0, catalog, { w: 3.5, d: 10, h: 9, label: 'Stairs' });
    const L2 = newLevel('Second floor', 8, 0); p.levels.push(L2);
    const b2 = builder(p, L2);
    const [n2, e2, s2, w2] = b2.box(0, 0, 40, 32);
    const h1 = b2.wall(0, 14, 40, 14), h2 = b2.wall(0, 18, 40, 18), m1 = b2.wall(16, 0, 16, 14), m2 = b2.wall(26, 18, 26, 32), m3 = b2.wall(12, 18, 12, 32), m4 = b2.wall(28, 0, 28, 14);
    [[n2, 8], [n2, 22], [n2, 34], [s2, 6], [s2, 19], [s2, 33], [e2, 7], [w2, 7]].forEach(([wl, at]) => b2.open(wl, at, 'wn-sh-3050', catalog));
    b2.open(h1, 8, 'dr-int-6p', catalog); b2.open(h1, 22, 'dr-int-2-4', catalog); b2.open(h1, 34, 'dr-int-6p', catalog);
    b2.open(h2, 6, 'dr-int-6p', catalog); b2.open(h2, 19, 'dr-int-6p', catalog); b2.open(h2, 33, 'dr-int-6p', catalog);
    void m1; void m2; void m3; void m4;
    b2.room('Primary bedroom', 0, 0, 16, 14, 'flr-carpet', 'pnt-int-blue'); b2.room('Bath', 16, 0, 12, 14, 'flr-tile-porc', 'pnt-int-white'); b2.room('Bedroom 2', 28, 0, 12, 14, 'flr-carpet', 'pnt-int-white');
    b2.room('Hall', 0, 14, 40, 4, 'flr-carpet', 'pnt-int-white');
    b2.room('Bedroom 3', 0, 18, 12, 14, 'flr-carpet', 'pnt-int-white'); b2.room('Bedroom 4', 12, 18, 14, 14, 'flr-carpet', 'pnt-int-white'); b2.room('Bonus room', 26, 18, 14, 14, 'flr-carpet', 'pnt-int-white');
    restack(p);
    addRoof(p, L2, { x: 0, y: 0, w: 40, h: 32 }, { style: 'gable', pitch: 8, overhang: 1.5, ridge: 'x' });
    addRoof(p, L1, { x: -24, y: 8, w: 24, h: 24 }, { style: 'gable', pitch: 6, overhang: 1, ridge: 'y' });
  } else if (t.id === 'commercial') {
    p.settings.exteriorFinishId = 'sid-metal-panel'; p.settings.drywallId = 'dw-5-8x'; p.settings.ceilingFinishId = '';
    L1.height = 12; L1.name = 'Suite';
    const b = builder(p, L1);
    const [n, e, s, w] = b.box(0, 0, 60, 40);
    const c1 = b.wall(0, 16, 22, 16), c2 = b.wall(22, 0, 22, 40), o1 = b.wall(22, 12, 60, 12), o2 = b.wall(36, 0, 36, 12), o3 = b.wall(48, 0, 48, 12);
    const r1 = b.wall(44, 28, 60, 28), r2 = b.wall(44, 28, 44, 40), r3 = b.wall(52, 28, 52, 40);
    b.open(s, 30, 'dr-sf-storefront', catalog); b.open(s, 38, 'wn-storefront', catalog); b.open(s, 22, 'wn-storefront', catalog); b.open(s, 49, 'wn-storefront', catalog);
    b.open(n, 4, 'dr-ext-steel', catalog);
    b.open(c1, 12, 'dr-int-6p', catalog); b.open(c2, 30, 'dr-int-6p', catalog);
    b.open(o1, 7, 'dr-int-6p', catalog); b.open(o1, 20, 'dr-int-6p', catalog); b.open(o1, 32, 'dr-int-6p', catalog);
    b.open(r2, 6, 'dr-int-6p', catalog); b.open(r3, 6, 'dr-int-6p', catalog);
    void e; void w; void o2; void o3; void r1;
    b.room('Conference', 0, 0, 22, 16, 'flr-carpet', 'pnt-int-greige');
    b.room('Break room', 0, 16, 22, 24, 'flr-vct', 'pnt-int-white');
    b.room('Office 1', 22, 0, 14, 12, 'flr-carpet', 'pnt-int-white'); b.room('Office 2', 36, 0, 12, 12, 'flr-carpet', 'pnt-int-white'); b.room('Office 3', 48, 0, 12, 12, 'flr-carpet', 'pnt-int-white');
    b.room('Open office / reception', 22, 12, 22, 28, 'flr-lvp-gray', 'pnt-int-greige'); b.room('Corridor', 44, 12, 16, 16, 'flr-lvp-gray', 'pnt-int-greige');
    b.room('Restroom (M)', 44, 28, 8, 12, 'flr-tile-porc', 'pnt-int-white'); b.room('Restroom (W)', 52, 28, 8, 12, 'flr-tile-porc', 'pnt-int-white');
    L1.rooms.forEach(r => { if (!/Restroom/.test(r.name)) r.ceilingId = 'cm-act'; });
    b.item('cm-reception', 33, 33, 180, catalog); b.item('fn-table', 11, 8, 0, catalog, { w: 12, d: 4 });
    b.item('cab-base', 8, 39, 180, catalog, { w: 12 }); b.item('ap-fridge', 16, 38.6, 180, catalog);
    b.item('cm-ada-wc', 46, 38.6, 180, catalog); b.item('cm-ada-wc', 58, 38.6, 180, catalog); b.item('cab-vanity', 50.5, 28.9, 0, catalog); b.item('cab-vanity', 54.5, 28.9, 0, catalog);
    [27, 41, 54].forEach(x => b.item('fn-desk', x, 4, 0, catalog));
    addRoof(p, L1, { x: 0, y: 0, w: 60, h: 40 }, { style: 'flat', pitch: 0, overhang: 0, materialId: 'rf-tpo', parapet: 3 });
  } else if (t.id === 'office4056') {
    // The owner's hand sketch, 40' wide × 56' deep. Front (y = 0) is the street side, back (y = 56) the warehouse.
    // Given on the sketch: conference 20', lobby 19' (1' wall between), 14' deep; 4' center hall; Office 1 20' deep;
    // 4' cross hall; Office 3 22'; Offices 4 and 5 18'; 42' behind the lobby. Widths not written on the sketch were
    // taken from its proportions: office columns 12', right hall 5', kitchen / restroom strip 7'.
    p.settings.exteriorFinishId = 'sid-metal-panel'; p.settings.drywallId = 'dw-5-8x'; p.settings.ceilingFinishId = '';
    L1.height = 10; L1.name = 'Office';
    const b = builder(p, L1);
    const [n, e, s, w] = b.box(0, 0, 40, 56);
    const mid = b.wall(20.5, 0, 20.5, 14); mid.thickness = 1;           // 1' wall between conference and lobby
    const back = b.wall(0, 14, 28, 14); b.wall(33, 14, 40, 14);          // back of conference / lobby; open 5' from the lobby into the right hall
    const c2 = b.wall(12, 14, 12, 56);                                   // offices 2 / 3 | center hall, office 4
    b.wall(0, 34, 12, 34);                                               // office 2 | office 3
    const o1w = b.wall(16, 14, 16, 34);                                  // center hall | office 1
    b.wall(16, 34, 28, 34); b.wall(28, 14, 28, 34);                      // office 1
    const t45 = b.wall(12, 38, 28, 38); b.wall(20, 38, 20, 56); b.wall(28, 38, 28, 56);   // offices 4 / 5
    const wet = b.wall(33, 14, 33, 56);                                  // right hall | kitchen + restrooms
    b.wall(33, 29, 40, 29); b.wall(33, 41, 40, 41);
    b.open(n, 24, 'dr-sf-storefront', catalog);                         // front entry into the lobby
    b.open(back, 14, 'dr-int-6p', catalog);                              // conference -> center hall
    b.open(o1w, 17.5, 'dr-int-6p', catalog);                             // office 1 (bottom left, off the center hall)
    b.open(c2, 17.5, 'dr-int-6p', catalog);                              // office 2
    b.open(c2, 22, 'dr-int-6p', catalog);                                // office 3
    b.open(t45, 6.5, 'dr-int-6p', catalog); b.open(t45, 9.5, 'dr-int-6p', catalog);   // offices 4 and 5
    b.open(wet, 12, 'dr-int-6p', catalog); b.open(wet, 16.5, 'dr-int-6p', catalog); b.open(wet, 40, 'dr-int-6p', catalog);   // kitchen, men's, women's
    b.open(s, 9.5, 'dr-ext-steel', catalog);                             // warehouse door at the end of the right hall
    void e; void w;
    b.room('Conference room', 0, 0, 20, 14, 'flr-carpet', 'pnt-int-greige');
    b.room('Lobby', 21, 0, 19, 14, 'flr-lvp-gray', 'pnt-int-greige');
    addRoom(L1, [{ x: 12, y: 14 }, { x: 16, y: 14 }, { x: 16, y: 34 }, { x: 28, y: 34 }, { x: 28, y: 14 }, { x: 33, y: 14 }, { x: 33, y: 56 }, { x: 28, y: 56 }, { x: 28, y: 38 }, { x: 12, y: 38 }], { name: 'Halls', floorId: 'flr-lvp-gray', wallFinishId: 'pnt-int-greige' });
    b.room('Office 1', 16, 14, 12, 20, 'flr-carpet', 'pnt-int-white');
    b.room('Office 2', 0, 14, 12, 20, 'flr-carpet', 'pnt-int-white');
    b.room('Office 3', 0, 34, 12, 22, 'flr-carpet', 'pnt-int-white');
    b.room('Office 4', 12, 38, 8, 18, 'flr-carpet', 'pnt-int-white');
    b.room('Office 5', 20, 38, 8, 18, 'flr-carpet', 'pnt-int-white');
    b.room('Kitchen / breakroom', 33, 14, 7, 15, 'flr-vct', 'pnt-int-white');
    b.room("Men's RR", 33, 29, 7, 12, 'flr-tile-porc', 'pnt-int-white');
    b.room("Women's RR", 33, 41, 7, 15, 'flr-tile-porc', 'pnt-int-white');
    L1.rooms.forEach(r => { if (!/RR/.test(r.name)) r.ceilingId = 'cm-act'; });
    b.item('fn-table', 10, 7, 0, catalog, { w: 12, d: 4 });
    b.item('cm-reception', 30.5, 8, 180, catalog);
    [[22, 22], [6, 22], [6, 45], [16, 49], [24, 49]].forEach(([x, y]) => b.item('fn-desk', x, y, 0, catalog, x === 16 || x === 24 ? { w: 4.5, d: 2.5 } : {}));
    b.item('cab-base', 39, 21, 90, catalog, { w: 10 }); b.item('cab-wall', 39.5, 21, 90, catalog, { w: 10 });
    b.item('ap-fridge', 38.75, 27.5, 90, catalog); b.item('fn-table', 35.5, 18, 0, catalog, { w: 3, d: 3 });
    b.item('cm-ada-wc', 38.75, 35, 90, catalog); b.item('cab-vanity', 39.1, 39, 90, catalog);
    b.item('cm-ada-wc', 38.75, 46, 90, catalog); b.item('cab-vanity', 39.1, 51, 90, catalog);
  }
  restack(p);
  return p;
}
