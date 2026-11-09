// Unit tests for the PlanBuilder math: node planbuilder/tests/math.test.js  (no browser, no network)
import assert from 'assert';
import { fmtFtIn, parseFtIn, polyArea, roofMeasure, wallPieces, pitchFactor } from '../js/geom.js';
import { fromTemplate, newProject, addWall, addOpening, addRoom, rectPts, splitWall, markExterior, swingDoorsIntoRooms } from '../js/model.js';
import { DEFAULT_CATALOG, catalogFromCSV, toCSV, CSV_COLUMNS } from '../js/catalog.js';
import { computeTakeoff, roundQty, convert, roomStats } from '../js/takeoff.js';

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

console.log(`PlanBuilder math: ${n} tests passed`);
