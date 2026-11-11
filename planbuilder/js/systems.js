// PlanBuilder construction systems: turns the drawn plan into the things a builder actually puts up,
// in the order they go up (site prep, footings, underground plumbing, slab, frame, roof, envelope,
// MEP, drywall, finishes, landscape). Each system has members (the pieces drawn in Studio) and
// priced lines (quantity × rate). Only NEW work is priced; existing work is shown greyed.
//
// Rates are placeholder unit costs (installed, material + labor) that you edit per job in
// Studio → Rates. Nothing here is a published price.
// Plan (x, y) in feet; z is height above the first floor.

import { wallLength, wallHeight, wallOpenings, bbox, polyArea, centroid } from './geom.js';
import { findProduct } from './catalog.js';

export const STEPS = ['Site Prep', 'Footings', 'Underground', 'Rebar + Vapor', 'Slab Pour', 'Frame Erection', 'Joists + Deck', 'Roofing',
  'Exterior Framing', 'Envelope', 'Interior Framing', 'MEP Rough-in', 'Drywall', 'Ceilings', 'Interior Finishes', 'Site + Landscape'];

// id, name (steel / wood), timeline step, color
const SYS = [
  ['site', 'Sitework + Demo', 'Sitework + Demo', 1, '#a98a5f'],
  ['found', 'Foundations', 'Foundations', 2, '#9aa3ad'],
  ['ugp', 'Underground Plumbing', 'Underground Plumbing', 3, '#2fb37e'],
  ['rebar', 'Rebar + Vapor', 'Rebar + Vapor', 4, '#c8743a'],
  ['slab', 'Slab on Grade', 'Slab on Grade', 5, '#b9bec4'],
  ['frame', 'Structural Steel', 'Wall Framing', 6, '#ff4a3d'],
  ['deck', 'Joists + Deck', 'Floor + Roof Framing', 7, '#f0a23b'],
  ['roof', 'Roofing + RTUs', 'Roofing', 8, '#7d8a99'],
  ['extfr', 'Exterior Framing', 'Sheathing + Wrap', 9, '#e3c65a'],
  ['env', 'Envelope', 'Envelope', 10, '#d9cdb4'],
  ['win', 'Storefront + Windows', 'Windows + Ext. Doors', 10, '#58c4ff'],
  ['intfr', 'Interior Framing', 'Interior Framing', 11, '#c9a46a'],
  ['hvac', 'HVAC', 'HVAC', 12, '#45d1c4'],
  ['plumb', 'Plumbing', 'Plumbing', 12, '#3b82f6'],
  ['elec', 'Electrical', 'Electrical', 12, '#ffd23f'],
  ['fire', 'Fire Sprinkler', 'Fire Sprinkler', 12, '#ff5f7e'],
  ['dry', 'Drywall', 'Drywall', 13, '#e9e7e1'],
  ['ceil', 'Ceilings', 'Ceilings', 14, '#cfd8e3'],
  ['fin', 'Interior Finishes', 'Interior Finishes', 15, '#b98d5b'],
  ['land', 'Site + Landscape', 'Site + Landscape', 16, '#6fae5a'],
];
export const SYSTEM_IDS = SYS.map(s => s[0]);
export function systemDefs(type) {
  return SYS.map(([id, steel, wood, step, color]) => ({ id, name: type === 'steel' ? steel : wood, step, color }));
}

// Placeholder installed unit rates. [key, label, unit, rate]
export const RATE_LIST = [
  ['sitePrep', 'Clear, grade & compact building pad', 'SF', 1.85],
  ['footing', 'Continuous footing w/ rebar, formed & poured', 'CY', 385],
  ['colFooting', 'Spread footing at steel column', 'EA', 1150],
  ['ugFixture', 'Underground plumbing per fixture (waste & water)', 'EA', 1450],
  ['ugMain', 'Underground main line', 'LF', 42],
  ['vapor', '10-mil vapor barrier', 'SF', 0.55],
  ['rebar', 'Slab reinforcing #4 @ 18" o.c.', 'SF', 0.95],
  ['slab', 'Slab on grade 4" – place', 'CY', 265],
  ['slabFinish', 'Slab finish – trowel & cure', 'SF', 1.15],
  ['steel', 'Structural steel – furnished & erected', 'LB', 4.1],
  ['basePlate', 'Base plate & anchor bolts', 'EA', 340],
  ['joist', 'Open-web steel joists', 'LF', 15],
  ['deck', 'Metal roof deck 1-1/2" type B', 'SF', 3.4],
  ['rtu', 'Rooftop unit 5 ton, curb & set', 'EA', 14500],
  ['woodExt', 'Exterior wall framing 2×6 @ 16"', 'SF', 4.6],
  ['woodInt', 'Interior wall framing 2×4 @ 16"', 'SF', 3.2],
  ['metalExt', 'Exterior metal stud framing 6" 18 ga', 'SF', 6.2],
  ['metalInt', 'Interior metal stud framing 3-5/8" 25 ga', 'SF', 4.1],
  ['header', 'Header over opening', 'EA', 145],
  ['truss', 'Roof trusses / rafters, set & braced', 'SF', 7.5],
  ['floorJoist', 'Floor framing – joists & subfloor', 'SF', 6.5],
  ['sheathing', 'Wall sheathing + house wrap', 'SF', 2.6],
  ['insulation', 'Wall insulation', 'SF', 1.45],
  ['hvacRes', 'HVAC system & ductwork (residential)', 'SF', 9.5],
  ['hvacCom', 'HVAC ductwork & distribution (commercial)', 'SF', 11],
  ['plumbFixture', 'Plumbing rough-in per fixture (supply & vent)', 'EA', 1650],
  ['elecRes', 'Electrical rough & trim (residential)', 'SF', 7.5],
  ['elecCom', 'Electrical rough & trim (commercial)', 'SF', 14],
  ['sprinkler', 'Wet-pipe fire sprinkler', 'SF', 4.4],
];
// Rates linked to CRM prices (set by the CRM connection); a job's own typed rate still wins.
let CRM_RATES = {};
export function setCrmRates(m) { CRM_RATES = m || {}; }
export function crmRateKeys() { return Object.keys(CRM_RATES); }
export function rates(P) {
  const o = (P.settings && P.settings.sysRates) || {};
  const r = {}; RATE_LIST.forEach(([k, , , v]) => { r[k] = o[k] != null && o[k] !== '' && isFinite(+o[k]) ? +o[k] : CRM_RATES[k] != null ? CRM_RATES[k] : v; }); return r;
}
const RATE_INFO = Object.fromEntries(RATE_LIST.map(([k, label, unit]) => [k, { label, unit }]));

// 'steel' (commercial) or 'wood'. settings.structure can force one.
export function structureType(P) {
  const s = P.settings && P.settings.structure;
  if (s === 'steel' || s === 'wood') return s;
  return P.type === 'commercial' ? 'steel' : 'wood';
}

const ph = o => (o && o.phase) || 'new';
const FIXTURE_RE = /ada-wc|toilet|\bwc\b|urinal|vanity|sink|lavator|\blav\b|bathtub|\btub\b|shower|drinking|fountain|water.?heater|mop/i;
// A product that needs water and a drain.
export function isFixture(p) { return !!p && (p.category === 'plumbing' || FIXTURE_RE.test(p.id + ' ' + p.name)); }
const STUD_OC = 16 / 12;
const r2 = v => Math.round(v * 100) / 100;

// Steel shapes: name, weight lb/ft
const HSS = ['HSS 6×6×3/8 column', 27.48], EDGE = ['W12×19 edge beam', 19];
const girderFor = span => span > 32 ? ['W21×44 girder', 44] : span > 24 ? ['W18×35 girder', 35] : ['W16×31 girder', 31];

/**
 * Members (what Studio draws) and priced lines, per system.
 * Members: { sys, step, type, label, cost, existing, ... }
 *   box:  cx, cy, z, len, wid, h, ang          (z = bottom)
 *   inst: boxes [[cx, cy, z, len, wid, h, ang], ...] (many identical-ish pieces: studs, joists)
 *   poly: pts, z, thick                         (z = top)
 *   pipe: a {x,y,z}, b {x,y,z}, r
 *   ref:  ref 'wall'|'opening'|'item'|'roof'|'floor'|'ceiling', id, levelId
 */
export function buildSystems(P, catalog) {
  const type = structureType(P), R = rates(P), steel = type === 'steel';
  const members = [], lines = [];
  const add = m => { members.push(m); return m; };
  const line = (sys, key, qty, detail, label) => {
    if (!(qty > 0)) return null;
    const info = RATE_INFO[key];
    const q = info.unit === 'EA' ? Math.ceil(qty - 1e-9) : r2(qty);
    const l = { sys, key, name: label || info.label, unit: info.unit, qty: q, rate: R[key], amount: q * R[key], detail: detail || '' };
    lines.push(l); return l;
  };
  const stat = { concreteCY: 0, steelLB: 0, studs: 0, rebarSF: 0, slabSF: 0 };
  const cat = id => { const p = findProduct(catalog || [], id); return p ? p.category : ''; };
  const fixture = it => isFixture(findProduct(catalog || [], it.productId));
  const levels = P.levels || [];
  const L0 = levels[0];
  let areaNew = 0;
  levels.forEach(l => l.rooms.forEach(r => { if (!r.outdoor && ph(r) === 'new') areaNew += polyArea(r.points); }));

  // ---------- 1 site prep + 2 footings + 3 underground + 4 rebar/vapor + 5 slab (first floor) ----------
  if (L0) {
    const slabRooms = L0.rooms.filter(r => !r.outdoor && ph(r) === 'new');
    const slabSF = slabRooms.reduce((a, r) => a + polyArea(r.points), 0);
    const newWalls0 = L0.walls.filter(w => ph(w) === 'new');
    const pts = []; newWalls0.forEach(w => pts.push(w.a, w.b)); slabRooms.forEach(r => pts.push(...r.points));
    if (pts.length) {
      const b = bbox(pts), pad = 5;
      const padSF = (b.w + 2 * pad) * (b.h + 2 * pad);
      add({ sys: 'site', step: 1, type: 'box', cx: b.x + b.w / 2, cy: b.y + b.h / 2, z: -0.75, len: b.w + 2 * pad, wid: b.h + 2 * pad, h: 0.3, ang: 0, label: 'Graded building pad', cost: padSF * R.sitePrep });
      line('site', 'sitePrep', padSF, `${Math.round(b.w + 2 * pad)}′ × ${Math.round(b.h + 2 * pad)}′ pad`);
    }
    // footings under new exterior (and long interior bearing) walls
    let ftCY = 0;
    newWalls0.filter(w => w.exterior).forEach(w => {
      const Lw = wallLength(w); if (Lw < 0.5) return;
      const cy = Lw * 2 * 1 / 27; ftCY += cy;
      add({ sys: 'found', step: 2, type: 'box', cx: (w.a.x + w.b.x) / 2, cy: (w.a.y + w.b.y) / 2, z: -1.6, len: Lw + 1, wid: 2, h: 1, ang: Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x), label: `Continuous footing 24″×12″ · ${Math.round(Lw)} LF`, cost: cy * R.footing });
      // stem wall up to the slab
      add({ sys: 'found', step: 2, type: 'box', cx: (w.a.x + w.b.x) / 2, cy: (w.a.y + w.b.y) / 2, z: -0.6, len: Lw + 0.66, wid: 0.66, h: 0.6, ang: Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x), label: `Stem wall 8″ · ${Math.round(Lw)} LF`, cost: 0 });
    });
    stat.concreteCY += ftCY;
    line('found', 'footing', ftCY, 'Under the new exterior walls');
    // underground plumbing to each new fixture
    const fixtures = L0.items.filter(it => ph(it) === 'new' && fixture(it));
    if (fixtures.length) {
      const fb = bbox(fixtures.map(f => ({ x: f.x, y: f.y })));
      const my = fb.y + fb.h / 2, x0 = fb.x - 4, x1 = fb.x + fb.w + 4;
      const run = x1 - x0;
      add({ sys: 'ugp', step: 3, type: 'pipe', a: { x: x0, y: my, z: -1.3 }, b: { x: x1, y: my, z: -1.3 }, r: 0.2, label: `4″ PVC building drain · ${Math.round(run)} LF`, cost: run * R.ugMain });
      let branch = 0;
      fixtures.forEach(f => {
        branch += Math.abs(f.y - my);
        add({ sys: 'ugp', step: 3, type: 'pipe', a: { x: f.x, y: my, z: -1.3 }, b: { x: f.x, y: f.y, z: -1.3 }, r: 0.12, label: '2″–3″ branch to fixture', cost: R.ugFixture });
        add({ sys: 'ugp', step: 3, type: 'pipe', a: { x: f.x, y: f.y, z: -1.3 }, b: { x: f.x, y: f.y, z: 0.4 }, r: 0.12, label: 'Stub-up through slab', cost: 0 });
      });
      line('ugp', 'ugFixture', fixtures.length, `${fixtures.length} fixtures`);
      line('ugp', 'ugMain', run + branch, '4″ main + branches');
    }
    // rebar grid + vapor barrier, then the slab
    if (slabSF > 0) {
      stat.slabSF = slabSF; stat.rebarSF = slabSF;
      slabRooms.forEach(r => add({ sys: 'rebar', step: 4, type: 'poly', pts: r.points, z: -0.3, thick: 0.02, label: '10-mil vapor barrier', cost: polyArea(r.points) * R.vapor, film: true }));
      const sb = bbox(slabRooms.flatMap(r => r.points)), bars = [];
      for (let x = sb.x + 0.75; x < sb.x + sb.w; x += 1.5) bars.push([x, sb.y + sb.h / 2, -0.2, sb.h - 0.5, 0.06, 0.06, Math.PI / 2]);
      for (let y = sb.y + 0.75; y < sb.y + sb.h; y += 1.5) bars.push([sb.x + sb.w / 2, y, -0.2, sb.w - 0.5, 0.06, 0.06, 0]);
      add({ sys: 'rebar', step: 4, type: 'inst', boxes: bars, label: '#4 rebar @ 18″ o.c. each way', cost: slabSF * R.rebar, clipTo: slabRooms.map(r => r.points) });
      line('rebar', 'vapor', slabSF); line('rebar', 'rebar', slabSF);
      const cy = slabSF * (4 / 12) / 27 * 1.05; stat.concreteCY += cy;
      slabRooms.forEach(r => add({ sys: 'slab', step: 5, type: 'poly', pts: r.points, z: 0, thick: 0.33, label: `Slab on grade 4″ · ${r.name || 'room'} · ${Math.round(polyArea(r.points))} SF`, cost: polyArea(r.points) * ((4 / 12) / 27 * 1.05 * R.slab + R.slabFinish) }));
      line('slab', 'slab', cy, `${Math.round(slabSF)} SF × 4″ + 5% waste`); line('slab', 'slabFinish', slabSF);
    }
  }

  // ---------- per level: frame, walls, openings, MEP, ceilings, finishes ----------
  levels.forEach((level, li) => {
    const E = level.elevation || 0, H = level.height || 9;
    const walls = level.walls.filter(w => ph(w) !== 'demo');
    const newWalls = walls.filter(w => ph(w) === 'new');
    const indoor = level.rooms.filter(r => !r.outdoor && ph(r) !== 'demo');
    const newIndoor = indoor.filter(r => ph(r) === 'new');
    const lvArea = newIndoor.reduce((a, r) => a + polyArea(r.points), 0);

    // existing walls: drawn for context only
    walls.filter(w => ph(w) === 'existing').forEach(w => add({ sys: 'exist', step: 0, type: 'ref', ref: 'wall', id: w.id, levelId: level.id, label: 'Existing wall', cost: 0, existing: true }));

    // upper floors: floor framing
    if (li > 0 && lvArea > 0) {
      const fb = bbox(newIndoor.flatMap(r => r.points)), along = fb.w <= fb.h ? 'x' : 'y', js = [];
      const span = along === 'x' ? fb.w : fb.h, run = along === 'x' ? fb.h : fb.w;
      for (let u = 0.5; u < run; u += STUD_OC) js.push(along === 'x' ? [fb.x + fb.w / 2, fb.y + u, E - 1, span, 0.125, 0.8, 0] : [fb.x + u, fb.y + fb.h / 2, E - 1, span, 0.125, 0.8, Math.PI / 2]);
      add({ sys: 'deck', step: 7, type: 'inst', boxes: js, label: `Floor joists 2×10 @ 16″ · ${level.name}`, cost: lvArea * R.floorJoist });
      line('deck', 'floorJoist', lvArea, level.name);
    }

    // steel frame: columns on a grid inside the new exterior walls, girders across, edge beams around
    const ext = newWalls.filter(w => w.exterior);
    if (steel && ext.length) {
      const b = bbox(ext.flatMap(w => [w.a, w.b])), nx = Math.max(1, Math.ceil(b.w / 28)), ny = Math.max(1, Math.ceil(b.h / 28));
      const top = E + H, xs = [], ys = [];
      for (let i = 0; i <= nx; i++) xs.push(b.x + b.w * i / nx);
      for (let j = 0; j <= ny; j++) ys.push(b.y + b.h * j / ny);
      let cols = 0;
      xs.forEach((x, i) => ys.forEach((y, j) => {
        const edge = i === 0 || j === 0 || i === nx || j === ny;
        if (!edge && (b.w > 60 || b.h > 60) === false) return;   // small buildings: perimeter columns only
        const lb = HSS[1] * H; stat.steelLB += lb; cols++;
        add({ sys: 'frame', step: 6, type: 'box', cx: x, cy: y, z: E, len: 0.5, wid: 0.5, h: H, ang: 0, label: `${HSS[0]} · ${H.toFixed(0)}′ · ${Math.round(lb)} LB`, cost: lb * R.steel + R.basePlate, steelPart: 'col' });
        add({ sys: 'found', step: 2, type: 'box', cx: x, cy: y, z: -2, len: 4, wid: 4, h: 1.5, ang: 0, label: 'Spread footing 4′×4′×18″ at column', cost: R.colFooting });
      }));
      // girders across the short way at every grid line; edge beams along the long sides
      const across = b.w <= b.h ? 'x' : 'y', span = across === 'x' ? b.w : b.h, [gName, gW] = girderFor(span);
      let gLB = 0, eLB = 0;
      (across === 'x' ? ys : xs).forEach(v => {
        const lb = gW * span; gLB += lb;
        add(across === 'x' ? { sys: 'frame', step: 6, type: 'box', cx: b.x + b.w / 2, cy: v, z: top - 1.33, len: span, wid: 0.5, h: 1.33, ang: 0, label: `${gName} · ${Math.round(span)}′ · ${Math.round(lb).toLocaleString()} LB`, cost: lb * R.steel, steelPart: 'beam' }
          : { sys: 'frame', step: 6, type: 'box', cx: v, cy: b.y + b.h / 2, z: top - 1.33, len: span, wid: 0.5, h: 1.33, ang: Math.PI / 2, label: `${gName} · ${Math.round(span)}′ · ${Math.round(lb).toLocaleString()} LB`, cost: lb * R.steel, steelPart: 'beam' });
      });
      const elen = across === 'x' ? b.h : b.w;
      (across === 'x' ? [b.x, b.x + b.w] : [b.y, b.y + b.h]).forEach(v => {
        const lb = EDGE[1] * elen; eLB += lb;
        add(across === 'x' ? { sys: 'frame', step: 6, type: 'box', cx: v, cy: b.y + b.h / 2, z: top - 1, len: elen, wid: 0.4, h: 1, ang: Math.PI / 2, label: `${EDGE[0]} · ${Math.round(elen)}′ · ${Math.round(lb).toLocaleString()} LB`, cost: lb * R.steel, steelPart: 'beam' }
          : { sys: 'frame', step: 6, type: 'box', cx: b.x + b.w / 2, cy: v, z: top - 1, len: elen, wid: 0.4, h: 1, ang: 0, label: `${EDGE[0]} · ${Math.round(elen)}′ · ${Math.round(lb).toLocaleString()} LB`, cost: lb * R.steel, steelPart: 'beam' });
      });
      stat.steelLB += gLB + eLB;
      const colLB = cols * HSS[1] * H;
      line('frame', 'steel', colLB, `${cols} × ${H.toFixed(0)}′ = ${Math.round(cols * H)} LF`, `${HSS[0]}s`);
      line('frame', 'steel', gLB, `${(across === 'x' ? ys : xs).length} × ${Math.round(span)}′`, `${gName}s`);
      line('frame', 'steel', eLB, `2 × ${Math.round(elen)}′`, `${EDGE[0]}s`);
      line('frame', 'basePlate', cols, `${cols} columns`);
      line('found', 'colFooting', cols, `${cols} columns`);
      // open-web joists every 5' between girders, then the deck
      const jl = [], jrun = across === 'x' ? b.h : b.w; let jLF = 0;
      for (let u = 2.5; u < jrun; u += 5) {
        jl.push(across === 'x' ? [b.x + b.w / 2, b.y + u, top - 2.1, b.w, 0.25, 0.8, 0] : [b.x + u, b.y + b.h / 2, top - 2.1, b.h, 0.25, 0.8, Math.PI / 2]);
        jLF += span;
      }
      add({ sys: 'deck', step: 7, type: 'inst', boxes: jl, label: `Open-web joists 18K @ 5′ o.c. · ${jl.length} × ${Math.round(span)}′`, cost: jLF * R.joist });
      const deckSF = b.w * b.h;
      add({ sys: 'deck', step: 7, type: 'poly', pts: [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }], z: top + 0.12, thick: 0.12, label: `Metal roof deck 1-1/2″ · ${Math.round(deckSF).toLocaleString()} SF`, cost: deckSF * R.deck, deckSheet: true });
      line('deck', 'joist', jLF, `${jl.length} joists`); line('deck', 'deck', deckSF);
      // rooftop units
      const rtus = Math.max(1, Math.round(deckSF / 1500));
      for (let i = 0; i < rtus; i++) add({ sys: 'roof', step: 8, type: 'box', cx: b.x + b.w * (i + 1) / (rtus + 1), cy: b.y + b.h / 2, z: top + 0.9, len: 7, wid: 4.5, h: 3.6, ang: 0, label: 'Rooftop unit 5 ton', cost: R.rtu, rtu: true });
      line('roof', 'rtu', rtus, `about 1 per 1,500 SF`);
    }

    // stud walls (all walls: exterior wood / metal studs, interior studs)
    const studWall = (w, isExt) => {
      const Lw = wallLength(w), Hw = wallHeight(w, level), ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x), dx = Math.cos(ang), dy = Math.sin(ang);
      const deep = isExt ? 0.46 : 0.29, ops = wallOpenings(w, level.openings), boxes = [];
      const at = (u, z, len, h, rot = 0) => boxes.push([w.a.x + dx * u, w.a.y + dy * u, E + z, len, deep, h, ang + rot]);
      for (let u = 0.06; u <= Lw - 0.06 + 1e-6; u = u + STUD_OC > Lw - 0.06 && u < Lw - 0.07 ? Lw - 0.06 : u + STUD_OC) {
        const op = ops.find(s => u > s.u0 - 0.05 && u < s.u1 + 0.05);
        if (op) { const sill = op.o.sill || 0, top = Math.min(Hw, sill + (op.o.height || 6.67)); if (sill > 0.2) at(u, 0.125, 0.125, sill - 0.25); if (top < Hw - 1.3) at(u, top + 0.9, 0.125, Hw - 0.125 - top - 0.9); continue; }
        at(u, 0.125, 0.125, Hw - 0.375);
      }
      at(Lw / 2, 0, Lw, 0.125); at(Lw / 2, Hw - 0.25, Lw, 0.125); at(Lw / 2, Hw - 0.125, Lw, 0.125);
      ops.forEach(s => { const sill = s.o.sill || 0, top = Math.min(Hw, sill + (s.o.height || 6.67)); at((s.u0 + s.u1) / 2, top, s.u1 - s.u0 + 0.25, 0.9); if (sill > 0.2) at((s.u0 + s.u1) / 2, sill - 0.125, s.u1 - s.u0, 0.125); });
      const studs = boxes.length;
      stat.studs += studs;
      return { boxes, studs, sf: Lw * Hw, headers: ops.length };
    };
    const extW = walls.filter(w => w.exterior), intW = walls.filter(w => !w.exterior);
    const framed = (list, isExt, sys, step, rateKey, label) => {
      let sf = 0, hd = 0; const all = [];
      list.forEach(w => { const r = studWall(w, isExt); if (ph(w) === 'new') { sf += r.sf; hd += r.headers; } else stat.studs -= r.studs; if (ph(w) === 'new') all.push(...r.boxes); });
      if (all.length) add({ sys, step, type: 'inst', boxes: all, label: `${label} · ${level.name}`, cost: sf * R[rateKey], wood: !steel });
      line(sys, rateKey, sf, `${level.name}: ${Math.round(sf).toLocaleString()} SF of wall`);
      if (!steel || isExt) line(sys, 'header', hd, `${level.name}: over doors and windows`);
      return sf;
    };
    const extSF = framed(extW, true, steel ? 'extfr' : 'frame', steel ? 9 : 6, steel ? 'metalExt' : 'woodExt', steel ? 'Metal studs 6″ 18 ga @ 16″' : '2×6 studs @ 16″ o.c.');
    framed(intW, false, 'intfr', 11, steel ? 'metalInt' : 'woodInt', steel ? 'Metal studs 3-5/8″ @ 16″' : '2×4 studs @ 16″ o.c.');

    // sheathing (wood) and envelope (cladding + insulation) on new exterior walls
    newWalls.filter(w => w.exterior).forEach(w => {
      if (!steel) add({ sys: 'extfr', step: 9, type: 'ref', ref: 'wall', id: w.id, levelId: level.id, label: 'OSB sheathing + house wrap', cost: wallLength(w) * wallHeight(w, level) * R.sheathing, sheath: true });
      add({ sys: 'env', step: 10, type: 'ref', ref: 'wall', id: w.id, levelId: level.id, label: 'Exterior cladding + insulation', cost: wallLength(w) * wallHeight(w, level) * R.insulation, skin: 'out' });
    });
    if (!steel) line('extfr', 'sheathing', extSF, level.name);
    line('env', 'insulation', extSF, level.name);
    // interior wall boards (drywall stage)
    walls.filter(w => ph(w) === 'new').forEach(w => add({ sys: 'dry', step: 13, type: 'ref', ref: 'wall', id: w.id, levelId: level.id, label: 'Drywall – hung, taped & finished', cost: 0, skin: 'in' }));

    // openings: exterior ones are windows / storefront; interior doors are finishes
    level.openings.filter(o => ph(o) !== 'demo').forEach(o => {
      const w = level.walls.find(x => x.id === o.wallId); if (!w || ph(w) === 'demo') return;
      const p = findProduct(catalog || [], o.productId);
      add({ sys: w.exterior ? 'win' : 'fin', step: w.exterior ? 10 : 15, type: 'ref', ref: 'opening', id: o.id, levelId: level.id, label: p ? p.name : o.type, cost: 0, existing: ph(o) === 'existing' });
    });

    // HVAC: a trunk down the long way at the ceiling, a branch and a diffuser into every new room
    if (lvArea > 0) {
      const b = bbox(newIndoor.flatMap(r => r.points)), long = b.w >= b.h, zc = E + H + (steel ? -3.2 : 0.4);
      const tA = long ? { x: b.x + 2, y: b.y + b.h / 2 } : { x: b.x + b.w / 2, y: b.y + 2 }, tB = long ? { x: b.x + b.w - 2, y: b.y + b.h / 2 } : { x: b.x + b.w / 2, y: b.y + b.h - 2 };
      const hv = lvArea * (steel ? R.hvacCom : R.hvacRes);
      add({ sys: 'hvac', step: 12, type: 'duct', a: { ...tA, z: zc }, b: { ...tB, z: zc }, w: 1.6, h: 1.1, label: `Supply trunk 20″×14″ · ${Math.round(long ? b.w : b.h)} LF`, cost: hv * 0.35 });
      newIndoor.forEach(r => {
        const c = centroid(r.points), j = long ? { x: c.x, y: tA.y } : { x: tA.x, y: c.y };
        add({ sys: 'hvac', step: 12, type: 'duct', a: { ...j, z: zc }, b: { ...c, z: zc }, w: 0.7, h: 0.6, label: `Branch duct to ${r.name || 'room'}`, cost: 0 });
        add({ sys: 'hvac', step: 12, type: 'box', cx: c.x, cy: c.y, z: E + H - 0.12, len: 1.6, wid: 1.6, h: 0.12, ang: 0, label: `Supply diffuser · ${r.name || 'room'}`, cost: 0 });
      });
      line('hvac', steel ? 'hvacCom' : 'hvacRes', lvArea, `${level.name}: ${Math.round(lvArea).toLocaleString()} SF`);
      if (!steel && li === 0) {
        const bb = bbox(walls.flatMap(w => [w.a, w.b]));
        add({ sys: 'hvac', step: 12, type: 'box', cx: bb.x + bb.w + 3, cy: bb.y + bb.h * 0.7, z: -0.3, len: 3, wid: 3, h: 3, ang: 0, label: 'AC condenser on pad', cost: 0 });
      }
      // electrical: panel on the first exterior wall, home runs to each room, a light in each
      const pw = ext[0] || walls[0];
      if (pw) {
        const pp = { x: (pw.a.x + pw.b.x) / 2, y: (pw.a.y + pw.b.y) / 2 };
        add({ sys: 'elec', step: 12, type: 'box', cx: pp.x, cy: pp.y, z: E + 4, len: 1.4, wid: 0.5, h: 2.4, ang: Math.atan2(pw.b.y - pw.a.y, pw.b.x - pw.a.x), label: steel ? 'Panelboard 225A' : 'Main panel 200A', cost: 0 });
        newIndoor.forEach(r => {
          const c = centroid(r.points);
          add({ sys: 'elec', step: 12, type: 'pipe', a: { x: pp.x, y: pp.y, z: E + H - 0.6 }, b: { x: c.x, y: c.y, z: E + H - 0.6 }, r: 0.06, label: `Circuit to ${r.name || 'room'}`, cost: 0, wire: true });
          add({ sys: 'elec', step: 12, type: 'box', cx: c.x, cy: c.y, z: E + H - 0.25, len: steel ? 2 : 0.9, wid: steel ? 4 : 0.9, h: 0.2, ang: 0, label: steel ? '2×4 LED troffer' : 'LED ceiling light', cost: 0, light: true });
        });
        line('elec', steel ? 'elecCom' : 'elecRes', lvArea, `${level.name}: ${Math.round(lvArea).toLocaleString()} SF`);
      }
      // fire sprinkler (commercial): mains every 12', a head every 12'
      if (steel) {
        const heads = [], zs = E + H + 0.2;
        for (let v = (long ? b.y : b.x) + 6; v < (long ? b.y + b.h : b.x + b.w); v += 12) {
          add({ sys: 'fire', step: 12, type: 'pipe', a: long ? { x: b.x + 1, y: v, z: zs } : { x: v, y: b.y + 1, z: zs }, b: long ? { x: b.x + b.w - 1, y: v, z: zs } : { x: v, y: b.y + b.h - 1, z: zs }, r: 0.1, label: '1-1/4″ sprinkler branch line', cost: 0 });
          for (let u = (long ? b.x : b.y) + 6; u < (long ? b.x + b.w : b.y + b.h); u += 12) heads.push(long ? [u, v] : [v, u]);
        }
        heads.forEach(([x, y]) => add({ sys: 'fire', step: 12, type: 'pipe', a: { x, y, z: zs }, b: { x, y, z: E + H - 0.1 }, r: 0.08, label: 'Pendent sprinkler head', cost: 0 }));
        line('fire', 'sprinkler', lvArea, `${heads.length} heads`);
      }
      // ceilings
      newIndoor.forEach(r => add({ sys: 'ceil', step: 14, type: 'ref', ref: 'ceiling', id: r.id, levelId: level.id, label: `${steel ? 'Acoustic ceiling grid' : 'Drywall ceiling'} · ${r.name || 'room'}`, cost: 0, grid: steel }));
    }
    // plumbing fixtures: rough-in (supply + vent) and the fixtures themselves
    const fx = level.items.filter(it => ph(it) === 'new' && fixture(it));
    fx.forEach(f => add({ sys: 'plumb', step: 12, type: 'pipe', a: { x: f.x, y: f.y, z: E }, b: { x: f.x, y: f.y, z: E + H + 1.5 }, r: 0.09, label: 'Supply & vent riser', cost: R.plumbFixture }));
    line('plumb', 'plumbFixture', fx.length, `${level.name}: ${fx.length} fixtures`);

    // floors, cabinets, fixtures, furniture, outdoor
    level.rooms.filter(r => ph(r) !== 'demo').forEach(r => add({ sys: r.outdoor ? 'land' : 'fin', step: r.outdoor ? 16 : 15, type: 'ref', ref: 'floor', id: r.id, levelId: level.id, label: r.name || 'Room', cost: 0, existing: ph(r) === 'existing' }));
    level.items.filter(it => ph(it) !== 'demo').forEach(it => {
      const c = cat(it.productId), p = findProduct(catalog || [], it.productId);
      const sys = ['landscape', 'hardscape', 'outdoor'].includes(c) ? 'land' : isFixture(p) ? 'plumb' : c === 'electrical' ? 'elec' : 'fin';
      add({ sys, step: sys === 'land' ? 16 : 15, type: 'ref', ref: 'item', id: it.id, levelId: level.id, label: p ? p.name : 'Item', cost: 0, existing: ph(it) === 'existing' });
    });
  });

  // roofs: the covering; wood buildings get trusses first
  (P.roofs || []).filter(s => ph(s) !== 'demo').forEach(sec => {
    const lv = levels.find(l => l.id === sec.levelId); if (!lv) return;
    const isNew = ph(sec) === 'new';
    if (!steel && isNew) {
      const base = (lv.elevation || 0) + (lv.height || 9);
      const along = sec.w >= sec.d ? 'x' : 'y', run = along === 'x' ? sec.w : sec.d, span = along === 'x' ? sec.d : sec.w, rise = sec.style === 'flat' ? 0.9 : (span / 2) * (sec.pitch || 0) / 12;
      const tr = [];
      for (let u = 1; u < run; u += 2) {
        const cx = along === 'x' ? sec.x + u : sec.x + sec.w / 2, cy = along === 'x' ? sec.y + sec.d / 2 : sec.y + u;
        tr.push({ cx, cy });
      }
      add({ sys: 'deck', step: 7, type: 'truss', at: tr, base, span, rise, along, label: `Roof trusses @ 24″ o.c. · ${tr.length} × ${Math.round(span)}′ span`, cost: sec.w * sec.d * R.truss });
      line('deck', 'truss', sec.w * sec.d, `${sec.name || 'Roof'}: ${tr.length} trusses`);
    }
    add({ sys: 'roof', step: 8, type: 'ref', ref: 'roof', id: sec.id, levelId: lv.id, label: (findProduct(catalog || [], sec.materialId) || {}).name || 'Roof', cost: 0, existing: !isNew });
  });

  stat.steelTons = stat.steelLB / 2000;
  return { type, members, lines, stat, areaNew };
}

// Which system a takeoff line belongs to.
export function systemOfLine(l, catalog) {
  const c = l.category, name = l.name || '', id = l.productId || '';
  if (c === 'structure') return null;   // already in the structure lines
  if (/ceiling/i.test(name) || /ceil/i.test(id)) return 'ceil';
  if (c === 'roofing') return 'roof';
  if (c === 'siding' || c === 'masonry') return 'env';
  if (c === 'window' || /storefront|curtain.?wall/i.test(id + ' ' + name)) return 'win';
  if (c === 'door') { const p = findProduct(catalog || [], id); return /exterior|storefront|entry|garage|patio|slider/i.test((p && p.name) || name) || /^dr-ext|garage/.test(id) ? 'win' : 'fin'; }
  if (c === 'drywall') return 'dry';
  if (c === 'plumbing' || isFixture(findProduct(catalog || [], id))) return 'plumb';
  if (c === 'electrical') return 'elec';
  if (['landscape', 'hardscape', 'outdoor'].includes(c)) return 'land';
  if (c === 'labor' && /demo|tear|haul|dump/i.test(id + ' ' + name)) return 'site';
  if (c === 'appliance' && /hvac|furnace|condens|air hand/i.test(id + ' ' + name)) return 'hvac';
  return 'fin';
}

/**
 * The whole budget, system by system: structure lines (from the drawing) + the estimate's own lines.
 * takeoff: the estimate (from computeTakeoff). Returns { type, systems[], total, sf, perSF, stat, members }.
 */
export function analyzeSystems(P, catalog, takeoff) {
  const S = buildSystems(P, catalog), defs = systemDefs(S.type);
  const map = new Map(defs.map(d => [d.id, { ...d, lines: [], total: 0 }]));
  S.lines.forEach(l => { const s = map.get(l.sys); s.lines.push({ name: l.name, detail: l.detail, qty: l.qty, unit: l.unit, rate: l.rate, amount: l.amount, from: 'structure' }); });
  ((takeoff && takeoff.lines) || []).forEach(l => {
    const id = systemOfLine(l, catalog); if (!id) return;
    const s = map.get(id); s.lines.push({ name: l.name, detail: l.source || '', qty: l.qty, unit: l.unit, rate: l.qty ? l.total / l.qty : 0, amount: l.total, from: 'estimate' });
  });
  const systems = defs.map(d => map.get(d.id));
  // The estimate's markup (tax, overhead, profit) spread over the systems by their share
  const direct = systems.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.amount, 0), 0);
  const tt = (takeoff && takeoff.totals) || {}, markup = (tt.grand || 0) - (takeoff ? takeoff.lines.reduce((a, l) => a + l.total, 0) : 0);
  const s0 = P.settings || {}, structDirect = S.lines.reduce((a, l) => a + l.amount, 0);
  const structMarkup = structDirect * ((s0.overheadPct || 0) + (s0.profitPct || 0)) / 100;
  const k = direct > 0 ? 1 + (markup + structMarkup) / direct : 1;
  systems.forEach(s => { s.direct = s.lines.reduce((a, l) => a + l.amount, 0); s.total = s.direct * k; });
  const total = systems.reduce((a, s) => a + s.total, 0);
  const sf = S.areaNew || (takeoff ? takeoff.summary.floorArea : 0);
  systems.forEach(s => { s.share = total > 0 ? s.total / total : 0; s.perSF = sf > 0 ? s.total / sf : 0; });
  return { type: S.type, systems, total, direct, markupFactor: k, sf, perSF: sf > 0 ? total / sf : 0, stat: S.stat, members: S.members, structureLines: S.lines };
}

// Structure lines as estimate lines (category 'structure'), for when they are included in the estimate.
export function structureEstimateLines(P, catalog) {
  const S = buildSystems(P, catalog), defs = systemDefs(S.type);
  return S.lines.map((l, i) => {
    const d = defs.find(x => x.id === l.sys);
    return { key: 'sys|' + i, productId: '', category: 'structure', name: `${d.name}: ${l.name}`, unit: l.unit, raw: l.qty, waste: 0, qty: l.qty, price: l.rate, labor: 0, material: l.amount, laborTotal: 0, total: l.amount, taxBase: 0, priced: 'catalog', code: '', source: l.detail, sources: [l.detail || 'Structure'] };
  });
}
