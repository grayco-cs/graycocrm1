// Unit tests for the PlanBuilder math: node planbuilder/tests/math.test.js  (no browser, no network)
import assert from 'assert';
import { fmtFtIn, parseFtIn, polyArea, roofMeasure, wallPieces, pitchFactor, roofTriangles } from '../js/geom.js';
import { fromTemplate, newProject, wallsForRoom, addWall, addOpening, addRoom, rectPts, splitWall, markExterior, swingDoorsIntoRooms } from '../js/model.js';
import { DEFAULT_CATALOG, catalogFromCSV, toCSV, CSV_COLUMNS } from '../js/catalog.js';
import { computeTakeoff, roundQty, convert, roomStats, lineItemsCSV, gableArea } from '../js/takeoff.js';
import { priceBookFromCSV, convertUnit, parseEstimateText } from '../js/pricebook.js';
import { STYLES, styleProductIds, applyStyle, autoFurnish, roomType } from '../js/styles.js';
import { setDrawPhase } from '../js/model.js';
import { cleanWalls, findRooms, nameRooms, parseDXF, dxfScale, planFromDXF, normalizePlan, isRoomLabel } from '../js/planimport.js';
import { parsePoint } from '../js/cmdline.js';
import { readFileSync } from 'fs';
import { buildSystems, analyzeSystems, structureType, systemOfLine, isFixture, rates, setCrmRates } from '../js/systems.js';
import { refine, showGroup } from '../js/furnkinds.js';
import { buildCRM, normUnit, unitFactor, sheetSF, resolveLink, applyCRM, crmSystemRates, suggest, autoLink, marginToMarkup } from '../js/crm.js';

let n = 0; const t = (name, fn) => { fn(); n++; };
const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) < eps, `${msg || ''} ${a} ≈ ${b}`);

t('feet and inches format', () => {
  assert.equal(fmtFtIn(12.5), `12' 6"`); assert.equal(fmtFtIn(12), `12'`); assert.equal(fmtFtIn(0.25), `3"`);
  assert.equal(fmtFtIn(11.99), `12'`); assert.equal(fmtFtIn(2 + 8 / 12), `2' 8"`);
});
t('feet and inches parse', () => {
  near(parseFtIn('12'), 12); near(parseFtIn('12.5'), 12.5); near(parseFtIn(`12'6"`), 12.5); near(parseFtIn(`12' 6"`), 12.5);
  near(parseFtIn('12-6'), 12.5); near(parseFtIn('12 6'), 12.5); near(parseFtIn('6"'), 0.5); near(parseFtIn('144in'), 12);
  near(parseFtIn('3m'), 9.84252, 1e-4); assert.ok(isNaN(parseFtIn('abc'))); assert.ok(isNaN(parseFtIn('12-13')));
});
t('polygon area', () => { near(polyArea(rectPts(0, 0, 12, 10)), 120); near(polyArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]), 50); });
t('pitch factor', () => { near(pitchFactor(12), Math.SQRT2); near(pitchFactor(6), 1.118034, 1e-6); });

t('gable roof 40x30, 6/12, 1ft overhang', () => {
  const m = roofMeasure({ x: 0, y: 0, w: 40, d: 30, style: 'gable', pitch: 6, overhang: 1, ridge: 'auto' });
  // ridge along x (the long side): L = 42, run = 16, rafter = 16 * 1.118
  near(m.area, 2 * 42 * 16 * pitchFactor(6), 1e-6); near(m.ridge, 42); near(m.eaves, 84); near(m.rakes, 4 * 16 * pitchFactor(6)); near(m.rise, 7.5);
});
t('hip roof 60x30, 6/12, 1.5ft overhang', () => {
  const m = roofMeasure({ x: 0, y: 0, w: 60, d: 30, style: 'hip', pitch: 6, overhang: 1.5, ridge: 'auto' });
  near(m.area, 63 * 33 * pitchFactor(6)); near(m.ridge, 30); near(m.hips, 4 * 16.5 * 1.5); near(m.eaves, 2 * (63 + 33));
});
t('flat roof is plan area', () => { const m = roofMeasure({ x: 0, y: 0, w: 60, d: 40, style: 'flat', pitch: 0, overhang: 0 }); near(m.squares, 24); });

t('wall pieces leave holes for doors and windows', () => {
  const p = newProject(); const L = p.levels[0];
  const w = addWall(L, { x: 0, y: 0 }, { x: 20, y: 0 });
  addOpening(L, w, 0.25, { w: 3, h: 6.5, sill: 0, openingType: 'door' });
  addOpening(L, w, 0.75, { w: 4, h: 4, sill: 3, openingType: 'window' });
  const pcs = wallPieces(w, L.openings, 9);
  const area = pcs.reduce((s, q) => s + (q.u1 - q.u0) * (q.z1 - q.z0), 0);
  near(area, 20 * 9 - 3 * 6.5 - 4 * 4);
});
t('split wall keeps openings on the right half', () => {
  const p = newProject(); const L = p.levels[0];
  const w = addWall(L, { x: 0, y: 0 }, { x: 20, y: 0 });
  const o = addOpening(L, w, 0.75, { w: 3, h: 6.67 });
  const w2 = splitWall(L, w, 0.5);
  assert.equal(o.wallId, w2.id); near(o.t, 0.5);
});
t('outside walls are found', () => {
  const p = newProject(); const L = p.levels[0];
  [[0, 0, 30, 0], [30, 0, 30, 20], [30, 20, 0, 20], [0, 20, 0, 0], [15, 0, 15, 20]].forEach(([a, b, c, d]) => addWall(L, { x: a, y: b }, { x: c, y: d }));
  assert.equal(markExterior(L, p.settings), 4);
  assert.equal(L.walls[4].exterior, false);
});

t('unit conversion and rounding', () => {
  near(convert(900, 'SF', 'SY'), 100); near(convert(350, 'SF', 'GAL'), 2); near(convert(320, 'SF', 'SHEET'), 10); near(convert(250, 'SF', 'SQ'), 2.5);
  assert.equal(roundQty(2.01, 'EA'), 3); near(roundQty(23.24, 'SQ'), 23 + 1 / 3); near(roundQty(10.001, 'SF'), 10.01);
});

t('room stats subtract openings on its walls', () => {
  const p = newProject(); const L = p.levels[0];
  const r = addRoom(L, rectPts(0, 0, 12, 10));
  const w = addWall(L, { x: 0, y: 0 }, { x: 12, y: 0 }, { thickness: 0.5 });
  addOpening(L, w, 0.5, { w: 3, h: 5, sill: 2.5, openingType: 'window' });
  const st = roomStats(r, L);
  near(st.area, 120); near(st.perim, 44); near(st.wallArea, 44 * 9 - 15); near(st.baseLF, 44);
});

t('takeoff for a simple 30x20 box', () => {
  const p = newProject(); const L = p.levels[0]; const s = p.settings;
  [[0, 0, 30, 0], [30, 0, 30, 20], [30, 20, 0, 20], [0, 20, 0, 0]].forEach(([a, b, c, d]) => addWall(L, { x: a, y: b }, { x: c, y: d }, { exterior: true, thickness: 0.5 }));
  addRoom(L, rectPts(0, 0, 30, 20), { floorId: 'flr-lvp-oak', wallFinishId: 'pnt-int-white' });
  s.floorWaste = 10; s.taxRate = 0; s.overheadPct = 0; s.profitPct = 0;
  const T = computeTakeoff(p, DEFAULT_CATALOG);
  const line = id => T.lines.find(l => l.productId === id);
  near(line('flr-lvp-oak').qty, 660);                 // 600 SF + 10%
  near(line('sid-vinyl').qty, 100 * 9 * 1.1, 0.011);  // 100 LF of outside wall, 9 ft high, +10%
  near(T.totals.grand, T.lines.reduce((a, l) => a + l.total, 0), 1e-6);
});
t('tax, overhead and profit', () => {
  const p = newProject(); p.settings.taxRate = 10; p.settings.overheadPct = 10; p.settings.profitPct = 10;
  p.extraLines.push({ id: 'x1', name: 'Test', unit: 'EA', qty: 1, price: 100, labor: 100, category: 'other' });
  const T = computeTakeoff(p, DEFAULT_CATALOG).totals;
  near(T.material, 100); near(T.labor, 100); near(T.tax, 10); near(T.subtotal, 210); near(T.overhead, 21); near(T.profit, 21); near(T.grand, 252);
});
t('templates build and price without warnings', () => {
  ['blank', 'ranch', 'twostory', 'commercial', 'office4056'].forEach(id => {
    const p = fromTemplate(id, DEFAULT_CATALOG); const T = computeTakeoff(p, DEFAULT_CATALOG);
    assert.deepEqual(T.warnings, [], id);
    if (id !== 'blank') assert.ok(T.totals.grand > 50000, id);
  });
  const r = fromTemplate('ranch', DEFAULT_CATALOG); near(computeTakeoff(r, DEFAULT_CATALOG).summary.floorArea, 1800);
  const two = fromTemplate('twostory', DEFAULT_CATALOG); assert.equal(two.levels[1].elevation, 10);
});
t('catalog CSV round trip', () => {
  const csv = toCSV(DEFAULT_CATALOG.slice(0, 5), CSV_COLUMNS);
  const { products, errors } = catalogFromCSV(csv);
  assert.deepEqual(errors, []); assert.equal(products.length, 5);
  assert.equal(products[0].id, DEFAULT_CATALOG[0].id); near(products[0].price, DEFAULT_CATALOG[0].price);
  const r2 = catalogFromCSV('name,price,unit\n"Shingle, premium","$1,250.00",SQ\n,5,EA\n');
  assert.equal(r2.products.length, 1); near(r2.products[0].price, 1250); assert.equal(r2.errors.length, 1);
});

t('doors swing into rooms, not halls', () => {
  const p = newProject(); const L = p.levels[0];
  addRoom(L, rectPts(0, 0, 12, 10), { name: 'Office' }); addRoom(L, rectPts(0, 10, 12, 4), { name: 'Hall' });
  const w1 = addWall(L, { x: 0, y: 10 }, { x: 12, y: 10 });   // right side of this wall is +y = the hall
  const w2 = addWall(L, { x: 12, y: 10 }, { x: 0, y: 10 });   // right side is -y = the office
  const d1 = addOpening(L, w1, 0.5, { w: 3, h: 6.67, openingType: 'door' }), d2 = addOpening(L, w2, 0.5, { w: 3, h: 6.67, openingType: 'door' });
  assert.equal(swingDoorsIntoRooms(L), 1); assert.equal(d1.flip, true); assert.equal(d2.flip, false);
});

t('outdoor areas: surface only, minus what sits inside, cubic yards by depth', () => {
  const p = newProject(); const L = p.levels[0]; p.settings.floorWaste = 0;
  addRoom(L, rectPts(0, 0, 30, 20), { name: 'House', floorId: 'flr-lvp-oak' });
  const yard = addRoom(L, rectPts(-10, -10, 50, 40), { name: 'Yard', floorId: 'ls-sod-bermuda', wallFinishId: '' }); yard.outdoor = true;
  const bed = addRoom(L, rectPts(0, 22, 30, 3), { name: 'Bed', floorId: 'ls-mulch-black', wallFinishId: '' }); bed.outdoor = true;
  const T = computeTakeoff(p, DEFAULT_CATALOG);
  const line = id => T.lines.find(l => l.productId === id);
  near(line('ls-sod-bermuda').qty, 2000 - 600 - 90);            // yard less the house and the bed
  near(line('ls-mulch-black').qty, Math.ceil(90 * 3 / 12 / 27 * 4) / 4);   // 90 SF at 3" = 0.83 CY -> 1 CY
  assert.ok(!T.lines.some(l => l.source.includes('Yard') && l.category === 'trim'));
  near(T.summary.floorArea, 600);
});
t('library products are complete', () => {
  const ids = new Set();
  DEFAULT_CATALOG.forEach(p => { assert.ok(!ids.has(p.id), 'duplicate ' + p.id); ids.add(p.id); assert.ok(/^#[0-9a-f]{6}$/i.test(p.color), p.id + ' color'); assert.ok(p.unit && p.kind && p.category, p.id); });
  ['brk-used-antique', 'rf-gaf-hdz-charcoal', 'flr-solid-white-oak', 'sid-hardie-hardieplank-lap-siding-iron-gray', 'ls-plant-live-oak-3-cal', 'hs-pavers-holland-red', 'ctr-granite-uba-tuba'].forEach(id => assert.ok(ids.has(id), id));
});

t('price list import (Xactimate-style export)', () => {
  const csv = 'Price list TNME8X_NOV26\nCat,Sel,Description,Unit,Remove,Replace,Material\nRFG,TST1,"Test shingle, laminated",SQ,60.00,"$310.00",150.00\nDRY,TST2,Test drywall,SF,0.50,2.75,0.80\nXX,BAD,No price,EA,,,\n';
  const r = priceBookFromCSV(csv);
  assert.equal(r.count, 2); assert.equal(r.errors.length, 1); assert.ok(r.hasMaterial);
  near(r.items['RFG TST1'].replace, 310); near(r.items['RFG TST1'].remove, 60); assert.equal(r.items['DRY TST2'].unit, 'SF');
  near(convertUnit(250, 'SF', 'SQ').qty, 2.5); assert.equal(convertUnit(3, 'EA', 'LF').ok, false);
});
t('estimate priced from a price list, R&R, own-price fallback, by room', () => {
  const p = newProject(); const L = p.levels[0]; const s = p.settings;
  Object.assign(s, { taxRate: 10, overheadPct: 0, profitPct: 0, floorWaste: 0, roofWaste: 0, wallWaste: 0, drywallId: '', ceilingFinishId: '', baseboardId: '', exteriorFinishId: '' });
  s.roofAccessories = {};
  addRoom(L, rectPts(0, 0, 10, 10), { name: 'Den', floorId: 'flr-lvp-oak', wallFinishId: '' });
  p.roofs.push({ id: 'r1', levelId: L.id, x: 0, y: 0, w: 10, d: 10, style: 'flat', pitch: 0, overhang: 0, materialId: 'rf-tpo' });
  const cat = DEFAULT_CATALOG.map(x => x.id === 'rf-tpo' ? { ...x, xmCode: 'rfg tst1' } : x);   // codes are matched without case
  const book = { name: 'Test list', hasMaterial: true, items: priceBookFromCSV('Cat,Sel,Description,Unit,Remove,Replace,Material\nRFG,TST1,Test roof,SQ,60,310,150\n').items };
  s.xmActivity = 'rr';
  const T = computeTakeoff(p, cat, { book });
  const roof = T.lines.find(l => l.code === 'RFG TST1'), floor = T.lines.find(l => l.productId === 'flr-lvp-oak');
  assert.equal(roof.priced, 'list'); near(roof.qty, 1); near(roof.price, 370); near(roof.total, 370);
  assert.equal(floor.priced, 'own');                           // no code: keeps the catalog price, flagged
  near(T.totals.tax, (150 + floor.material) * 0.1);
  assert.ok(T.warnings.some(w => w.includes('catalog price')));
  s.xmActivity = 'replace'; near(computeTakeoff(p, cat, { book }).lines.find(l => l.code === 'RFG TST1').total, 310);
  s.estimateLayout = 'room';
  const R = computeTakeoff(p, cat, { book });
  assert.ok(R.groups.some(g => g.name === 'First floor: Den')); assert.ok(R.byRoom);
  assert.ok(lineItemsCSV(p, R).includes('RFG TST1'));
  near(computeTakeoff(p, cat).lines.find(l => l.productId === 'rf-tpo').price, 380);   // without a list: catalog price
});

t('pasted estimate lines are read', () => {
  const r = parseEstimateText('1. RFG 300S R&R Laminated comp. shingle roofing 25.33 SQ 285.40\nDRY 1/2\tDrywall 1/2"\t412\tSF\t2.36\nClean floor 120 SF\nJust a note');
  assert.equal(r.length, 4);
  assert.deepEqual([r[0].code, r[0].act, r[0].name, r[0].qty, r[0].unit, r[0].price], ['RFG 300S', 'R&R', 'Laminated comp. shingle roofing', 25.33, 'SQ', 285.4]);
  assert.deepEqual([r[1].code, r[1].qty, r[1].unit, r[1].price], ['DRY 1/2', 412, 'SF', 2.36]);
  assert.equal(r[2].qty, 120); assert.equal(r[2].price, undefined); assert.equal(r[3].name, 'Just a note');
});
t('styles name real products; apply and furnish', () => {
  const ids = new Set(DEFAULT_CATALOG.map(p => p.id));
  STYLES.forEach(s => styleProductIds(s).forEach(id => assert.ok(ids.has(id), `${s.id}: ${id}`)));
  const p = fromTemplate('ranch', DEFAULT_CATALOG);
  const done = applyStyle(p, 'mediterranean', { kind: 'all' }, DEFAULT_CATALOG);
  assert.ok(done.includes('roof')); assert.equal(p.roofs[0].materialId, 'rf-clay-tile'); assert.equal(p.settings.exteriorFinishId, 'sid-stucco-3-coat-sand-finish');
  assert.equal(p.levels[0].rooms.find(r => r.name === 'Bath 2').floorId, 'flr-tile-saltillo-terracotta');
  const L = p.levels[0]; const n = autoFurnish(L, L.rooms, 'farmhouse', DEFAULT_CATALOG);
  assert.ok(n > 30); assert.ok(L.items.filter(i => i.auto).every(i => i.roomId));
  const again = autoFurnish(L, L.rooms, 'farmhouse', DEFAULT_CATALOG); assert.equal(L.items.filter(i => i.auto).length, again);   // re-run replaces
  assert.equal(roomType('Primary bath'), 'bath'); assert.equal(roomType('Family room'), 'living'); assert.equal(roomType('Walk-in closet'), 'closet');
});
t('existing work is not priced; demolition is; an addition gets its own roof', () => {
  setDrawPhase('existing');
  const p = newProject(); const L = p.levels[0]; Object.assign(p.settings, { floorWaste: 0, wallWaste: 0, roofWaste: 0 });
  [[0, 0, 30, 0], [30, 0, 30, 20], [30, 20, 0, 20], [0, 20, 0, 0]].forEach(([a, b, c, d]) => addWall(L, { x: a, y: b }, { x: c, y: d }, { exterior: true, thickness: 0.5 }));
  addRoom(L, rectPts(0, 0, 30, 20), { name: 'Living', floorId: 'flr-carpet' });
  setDrawPhase('new');
  addRoom(L, rectPts(30, 0, 12, 20), { name: 'Family room', floorId: 'flr-lvp-oak' });
  [[30, 0, 42, 0], [42, 0, 42, 20], [42, 20, 30, 20]].forEach(([a, b, c, d]) => addWall(L, { x: a, y: b }, { x: c, y: d }, { exterior: true, thickness: 0.5 }));
  L.walls[1].phase = 'demo';
  const T = computeTakeoff(p, DEFAULT_CATALOG);
  const ids = T.lines.map(l => l.productId);
  assert.ok(!ids.includes('flr-carpet')); assert.ok(ids.includes('flr-lvp-oak')); assert.ok(ids.includes('lb-demo-wall'));
  near(T.summary.newArea, 240); near(T.summary.existingArea, 600);
  applyStyle(p, 'farmhouse', { kind: 'new' }, DEFAULT_CATALOG);
  assert.equal(p.roofs.length, 1); assert.equal(p.roofs[0].phase, 'new'); near(p.roofs[0].w, 12); assert.equal(p.roofs[0].layers, 0);
  assert.ok(!computeTakeoff(p, DEFAULT_CATALOG).lines.some(l => l.productId === 'rf-tearoff'), 'no tear-off on a new addition roof');
});

t('systems: a 40x30 slab, footings and wood framing from the drawing', () => {
  const p = newProject('Box'); const L = p.levels[0];
  addRoom(L, rectPts(0, 0, 40, 30), { name: 'Shop' }); wallsForRoom(L, rectPts(0, 0, 40, 30), p.settings, true); markExterior(L, p.settings);
  assert.equal(structureType(p), 'wood');
  const S = buildSystems(p, DEFAULT_CATALOG);
  near(S.stat.slabSF, 1200);
  const slab = S.lines.find(l => l.key === 'slab'); near(slab.qty, Math.round(1200 * (4 / 12) / 27 * 1.05 * 100) / 100, 1e-9, 'slab CY');
  const ft = S.lines.find(l => l.key === 'footing'); near(ft.qty, Math.round(140 * 2 / 27 * 100) / 100, 1e-9, 'footing CY');
  const fr = S.lines.find(l => l.key === 'woodExt'); near(fr.qty, 140 * L.height, 1e-6, 'framed wall SF');
  assert.ok(S.stat.studs > 140 / (16 / 12), 'studs ' + S.stat.studs);
  assert.ok(!S.lines.some(l => l.key === 'steel'));
});
t('systems: commercial is steel; budget adds up; existing work is not priced', () => {
  const p = fromTemplate('office4056', DEFAULT_CATALOG);
  assert.equal(structureType(p), 'steel');
  const T = computeTakeoff(p, DEFAULT_CATALOG), A = analyzeSystems(p, DEFAULT_CATALOG, T);
  assert.ok(A.stat.steelTons > 1); assert.ok(A.members.some(m => m.steelPart === 'col'));
  near(A.total, A.systems.reduce((a, s) => a + s.total, 0), 1e-6);
  p.settings.includeStructure = true;
  near(computeTakeoff(p, DEFAULT_CATALOG).totals.grand, A.total, 0.01, 'estimate with structure = Studio total');
  assert.ok(computeTakeoff(p, DEFAULT_CATALOG).lines.some(l => l.category === 'structure'));
  p.levels.forEach(l => ['walls', 'rooms', 'items', 'openings'].forEach(k => l[k].forEach(o => { o.phase = 'existing'; }))); p.roofs.forEach(r => { r.phase = 'existing'; });
  const E = buildSystems(p, DEFAULT_CATALOG);
  assert.equal(E.lines.length, 0, 'nothing priced when it is all existing');
  assert.ok(E.members.some(m => m.sys === 'exist'));
});
t('systems: estimate lines sort into systems', () => {
  assert.equal(systemOfLine({ category: 'roofing', name: 'Shingles' }), 'roof');
  assert.equal(systemOfLine({ category: 'paint', name: 'Paint – Ceilings' }), 'ceil');
  assert.equal(systemOfLine({ category: 'labor', productId: 'lb-demo-wall', name: 'Demo wall' }), 'site');
  assert.equal(systemOfLine({ category: 'structure', name: 'x' }), null);
  assert.ok(isFixture({ id: 'cm-ada-wc', name: 'ADA toilet', category: 'commercial' }));
});

t('import: gaps become doors, corners join, rooms close', () => {
  const segs = [
    { a: { x: -0.25, y: 0 }, b: { x: 10, y: 0 }, t: 0.5 }, { a: { x: 13, y: 0 }, b: { x: 30.25, y: 0 }, t: 0.5 },
    { a: { x: 30, y: -0.25 }, b: { x: 30, y: 20.25 }, t: 0.5 }, { a: { x: -0.25, y: 20 }, b: { x: 30.25, y: 20 }, t: 0.5 },
    { a: { x: 0, y: -0.25 }, b: { x: 0, y: 20.25 }, t: 0.5 }, { a: { x: 16, y: 0.25 }, b: { x: 16, y: 19.75 }, t: 0.375 },
  ];
  const cw = cleanWalls(segs);
  assert.equal(cw.walls.length, 5); assert.equal(cw.openings.length, 1);
  near(cw.openings[0].width, 3); near(cw.openings[0].c, 11.5, 0.01);
  cw.walls.forEach(w => [w.a, w.b].forEach(p => assert.ok([0, 16, 30].includes(Math.round(p.x * 100) / 100) && [0, 20].includes(Math.round(p.y * 100) / 100), 'joined at a centerline ' + JSON.stringify(p))));
  const fr = findRooms(cw.walls);
  assert.deepEqual(fr.rooms.map(r => Math.round(r.area)).sort((a, b) => a - b), [280, 320]);
  assert.ok(fr.outside(-1, 5) && !fr.outside(5, 5));
  nameRooms(fr.rooms, [{ x: 20, y: 10, text: 'KITCHEN' }, { x: 21, y: 12, text: "12'-0\" x 14'" }]);
  assert.ok(fr.rooms.some(r => r.name === 'Kitchen'));
  assert.ok(isRoomLabel('Master Bedroom') && !isRoomLabel("12'-6\"") && !isRoomLabel('120 SF'));
});
t('import: AutoCAD DXF with double-line walls', () => {
  const D = parseDXF(readFileSync(new URL('./fixtures/plan-30x24.dxf', import.meta.url), 'utf8'));
  assert.equal(D.units, 1); near(dxfScale(D.units), 1 / 12);
  const P = normalizePlan(planFromDXF(D, dxfScale(D.units)));
  assert.equal(P.mode, 'pairs'); assert.equal(P.walls.length, 5); assert.equal(P.openings.length, 2);
  assert.deepEqual(P.rooms.map(r => r.name).sort(), ['Bedroom', 'Great Room']);
  near(P.rooms.reduce((a, r) => a + r.area, 0), 720, 0.5);
});
t('command line points', () => {
  const last = { x: 10, y: 5 };
  assert.deepEqual(parsePoint('3,4', last).p, { x: 3, y: 4 });
  assert.deepEqual(parsePoint('@12,0', last).p, { x: 22, y: 5 });
  assert.deepEqual(parsePoint('@10<90', last).p, { x: 10, y: -5 });
  assert.deepEqual(parsePoint(`@12'6"<0`, last).p, { x: 22.5, y: 5 });
  near(parsePoint(`12' 6"`, last).len, 12.5);
  assert.equal(parsePoint('abc', last), null);
});

// ---------- CRM prices ----------
const crmRaw = () => ({
  rateBook: [
    { desc: 'Paint material 1 coat', cost: 0.18, unit: 'per SF', cat: 'Paint', type: 'material' },
    { desc: 'Drywall 4x12 hang labor', cost: 30, unit: 'per sheet', cat: 'Drywall', type: 'labor' },
    { desc: 'Roofing tear off + install (1 layer)', cost: 65, unit: 'per square', cat: 'Roofing', type: 'sub' },
  ],
  custom: [{ id: 'C1', name: 'LVP Oak 7x48', cat: 'Flooring', unit: 'sf', cost: 2.5 }],
  edits: { P0001: 4.1 },
  laborRates: [{ cat: 'Framing', desc: 'Carpenter', rate: 50 }],
  settings: { tax: 8.25, marginPct: 30 },
});
const crmBase = [['P0001', 'Lumber/Framing', 3.28, '2x4x8 SPF Stud', '058449', 'ea'], ['P0002', 'Drywall', 14, '1/2 Drywall 4x12', '', 'sht']];
t('CRM units and conversions', () => {
  assert.equal(normUnit('per SF'), 'SF'); assert.equal(normUnit('per square'), 'SQ'); assert.equal(normUnit('sht'), 'SHEET'); assert.equal(normUnit('per job'), 'LS'); assert.equal(normUnit('ea'), 'EA');
  near(unitFactor('per square', 'SF'), 0.01); near(unitFactor('per SF', 'SQ'), 100); assert.equal(unitFactor('ea', 'SF'), null);
  assert.equal(sheetSF('1/2 Drywall 4x12'), 48); assert.equal(sheetSF('Drywall 4.5x12 hang'), 54); assert.equal(sheetSF('Drywall sheet'), 32);
  near(unitFactor('per sheet', 'SF', 'Drywall 4x12 hang labor'), 1 / 48);
  assert.equal(marginToMarkup(30), 42.86); assert.equal(marginToMarkup(0), 0);
});
t('CRM sources: rate book, products with edits, custom products, labor rates', () => {
  const c = buildCRM(crmRaw(), crmBase);
  assert.deepEqual(c.counts, { rateBook: 3, products: 3, laborRates: 1 });
  assert.equal(c.byKey.get('prod:P0001').cost, 4.1, 'the CRM price edit wins over the built-in price');
  assert.equal(c.byKey.get('prod:P0002').unit, 'SHEET');
  assert.equal(c.byKey.get('rb:roofing tear off install 1 layer|per square').kind, 'sub');
  assert.deepEqual(c.settings, { tax: 8.25, marginPct: 30 });
});
t('CRM links price products per PlanBuilder unit', () => {
  const c = buildCRM(crmRaw(), crmBase);
  near(resolveLink({ key: 'prod:P0002' }, c, 'SF').value, 14 / 48, 1e-4, 'a 4x12 sheet');
  near(resolveLink({ key: 'rb:drywall 4x12 hang labor|per sheet' }, c, 'SF').value, 0.625, 1e-4);
  near(resolveLink({ key: 'hr:framing|carpenter', hrs: 0.05 }, c, 'SF').value, 2.5);
  assert.equal(resolveLink({ key: 'hr:framing|carpenter' }, c, 'SF').ok, false, 'an hourly rate needs hours');
  assert.equal(resolveLink({ key: 'prod:P0001' }, c, 'SF').ok, false, 'each → SF needs a count');
  near(resolveLink({ key: 'prod:P0001', per: 1.25 }, c, 'LF').value, 5.125);
  assert.equal(resolveLink({ key: 'prod:GONE' }, c, 'SF').ok, false);
  const cat = [{ id: 'a', name: 'Paint', unit: 'SF', price: 1, labor: 1, crm: { mat: { key: 'rb:paint material 1 coat|per sf' }, lab: { key: 'hr:framing|carpenter' } } }, { id: 'b', name: 'Free', unit: 'SF', price: 3, labor: 0 }];
  const r = applyCRM(cat, c);
  assert.equal(cat[0].price, 0.18); assert.equal(cat[0].labor, 1, 'an unpriceable link keeps the last price'); assert.equal(cat[1].price, 3);
  assert.equal(r.changed.length, 1); assert.equal(r.problems.length, 1);
  // a takeoff uses the CRM price
  const P = fromTemplate('ranch', DEFAULT_CATALOG), C = JSON.parse(JSON.stringify(DEFAULT_CATALOG));
  const before = computeTakeoff(P, C).totals.material;
  const used = computeTakeoff(P, C).lines.find(l => l.unit === 'SF' && l.price > 0);
  const prod = C.find(x => x.id === used.productId); prod.crm = { mat: { key: 'prod:C1' } };
  applyCRM(C, c); assert.equal(prod.price, 2.5);
  const after = computeTakeoff(P, C);
  near(after.lines.find(l => l.productId === prod.id).price, 2.5, 1e-9); assert.ok(after.totals.material !== before);
});
t('CRM Studio rates: material + labor, a job rate still wins', () => {
  const c = buildCRM(crmRaw(), crmBase);
  const m = crmSystemRates({ sitePrep: { mat: { key: 'rb:paint material 1 coat|per sf' }, lab: { key: 'hr:framing|carpenter', hrs: 0.1 } } }, c, { sitePrep: 'SF' });
  near(m.sitePrep, 5.18, 1e-9);
  setCrmRates(m);
  near(rates({ settings: {} }).sitePrep, 5.18); near(rates({ settings: { sysRates: { sitePrep: 2 } } }).sitePrep, 2);
  setCrmRates({}); near(rates({ settings: {} }).sitePrep, 1.85);
});
t('CRM suggestions and automatic links', () => {
  const c = buildCRM(crmRaw(), crmBase);
  const lvp = { name: 'LVP plank – natural oak', category: 'flooring', unit: 'SF' };
  assert.equal(suggest(lvp, c, 'mat')[0].key, 'prod:C1');
  const roof = { name: 'Remove roofing – per layer, haul off', category: 'roofing', unit: 'SQ' };
  assert.equal(autoLink(roof, c, 'lab').key, 'rb:roofing tear off install 1 layer|per square');
  assert.equal(autoLink({ name: 'Kitchen island', category: 'cabinet', unit: 'EA' }, c, 'mat'), null);
  assert.deepEqual(buildCRM({}, [], false).found, false);
});
const crmJson = readFileSync(new URL('../data/crm-products.json', import.meta.url), 'utf8');
t('CRM product list matches the copy the price-index function uses', () => {
  assert.equal(crmJson, readFileSync(new URL('../../netlify/functions/_lib/products-base.json', import.meta.url), 'utf8'), 'planbuilder/data/crm-products.json is a copy of netlify/functions/_lib/products-base.json: copy it again');
});

t('shed roof: tall side is walled in 3D and sided in the estimate', () => {
  const sec = { x: 0, y: 0, w: 40, d: 30, style: 'shed', pitch: 3, overhang: 1, ridge: 'x' };
  near(gableArea(sec), 30 * 7.5 + 40 * 7.5);   // two side triangles (30 × 7.5 / 2 each) + the 40 ft tall side, 7.5 ft high
  const g = roofTriangles(sec, 9).gables;
  assert.equal(g.length, 4);
  const tall = g.slice(2).flat();
  assert.ok(tall.every(q => Math.abs(q.y - 30) < 1e-9), 'on the high wall line');
  near(Math.max(...tall.map(q => q.z)), 16.5); near(Math.min(...tall.map(q => q.z)), 9);
  near(gableArea({ ...sec, style: 'gable' }), 30 * 3.75);
});

t('3D furniture kinds and Show groups', () => {
  const k = id => refine(DEFAULT_CATALOG.find(p => p.id === id));
  assert.equal(k('ap-fridge'), 'fridge'); assert.equal(k('ap-range'), 'range'); assert.equal(k('ap-dw'), 'dishwasher'); assert.equal(k('pl-ksink'), 'sink');
  assert.equal(k('fn-sofa'), 'sofa'); assert.equal(k('fn-bed-q'), 'bed'); assert.equal(k('cab-vanity'), 'vanity'); assert.equal(k('el-fan'), 'fan');
  const g = id => showGroup(DEFAULT_CATALOG.find(p => p.id === id));
  assert.equal(g('fn-sofa'), 'furniture'); assert.equal(g('fn-art-large'), 'art'); assert.equal(g('fn-rug-8x10'), 'rugs'); assert.equal(g('fn-plant-floor'), 'plants');
  assert.equal(g('el-pendant'), 'lights'); assert.equal(g('ap-fridge'), 'kitchen'); assert.equal(g('cab-base'), 'kitchen');
});

console.log(`PlanBuilder math: ${n} tests passed`);
