// Run with:  node roofscout/tests/scan.test.js
// The pure scan logic (js/scan.js) against saved fixtures (tests/fixtures, see its README).
'use strict';
var assert = require('assert');
var S = require('../js/scan.js');
var G = require('../js/geo.js');
var M = require('./mock-net.js');

function within(a, b, pct, msg) { assert.ok(Math.abs(a - b) / b < pct / 100, msg + ': ' + a + ' vs ' + b); }

// ---- Area math -------------------------------------------------------------------
var lat = 35.15, lng = -90.05;
var dLat = 100 / 111194.9, dLng = 100 / (111194.9 * Math.cos(lat * Math.PI / 180));
var sq = [[lat, lng], [lat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng]];
within(S.polygonSqft([sq]), 107639, 0.3, 'geodesic 100 m square');
within(S.polygonSqft([sq.slice().reverse()]), 107639, 0.3, 'either winding');
within(S.polygonSqft([sq]), G.footprintSqft(sq), 0.3, 'agrees with the trace tool');
// A big (1 km) square: still within 0.3 % of the true area on the ellipsoid.
var k = 1000 / 111194.9, kl = 1000 / (111194.9 * Math.cos(lat * Math.PI / 180));
within(S.polygonSqft([[[lat, lng], [lat, lng + kl], [lat + k, lng + kl], [lat + k, lng]]]), 1e6 * S.SQFT_PER_M2, 0.3, '1 km square');
// Hole subtracts.
var inner = [[lat + dLat / 4, lng + dLng / 4], [lat + dLat / 4, lng + dLng / 2], [lat + dLat / 2, lng + dLng / 2], [lat + dLat / 2, lng + dLng / 4]];
within(S.polygonSqft([sq, inner]), 107639 * (1 - 1 / 16), 0.4, 'courtyard subtracts');

// Point on surface for a U shape: the centroid is outside, the point must be inside.
var U = [[0, 0], [0, 3], [3, 3], [3, 2], [1, 2], [1, 1], [3, 1], [3, 0]].map(function (p) { return [35 + p[1] * 1e-4, -90 + p[0] * 1e-4]; });
var c = S.ringCentroid(U);
var pos = S.pointOnSurface([U]);
assert.ok(S.pointInRing(pos, U), 'point on surface is inside the U');
assert.ok(typeof c[0] === 'number');

// ---- Tile grid ----------------------------------------------------------------------
var t = S.tilesForBbox({ s: 35.19, w: -89.88, n: 35.23, e: -89.82 });
assert.strictEqual(t.length, 4 * 3, '4 columns × 3 rows: ' + t.join(' '));
assert.ok(t.indexOf('-3596_1759') > -1 && t.indexOf('-3593_1761') > -1, 'corner tiles');
var tb = S.tileBbox(S.tileId(-3594, 1760));
assert.deepStrictEqual(tb, { s: 35.2, w: -89.85, n: 35.22, e: -89.825 });
assert.strictEqual(S.tileBbox('nope'), null);
assert.ok(S.bboxAreaMi2(tb) > 1.5 && S.bboxAreaMi2(tb) < 2.2, 'a tile is about 2 mi²');
assert.ok(/way\["building"\]/.test(S.overpassQuery(tb)) && /out tags geom/.test(S.overpassQuery(tb)), 'overpass query');
// Lighter query: ways shorter than the smallest outline a floor-size building can have are skipped.
var pMin = S.minPerimeterM(3000);
assert.ok(pMin >= 55 && pMin <= 59, 'a 3,000 ft² circle has a 59 m outline: ' + pMin);
assert.strictEqual(S.overpassQuery(tb, { floorSqft: 3000, timeout: 9 }).indexOf('[out:json][timeout:9];'), 0, 'server timeout in the query');
assert.ok(S.overpassQuery(tb, { floorSqft: 3000 }).indexOf('(if:length()>' + pMin + ')') > -1, 'size filter on ways');
assert.ok(S.overpassQuery(tb).indexOf('length()') < 0, 'no filter without a floor');
(function () {
  // Every fixture building ≥ 3,000 ft² has an outline longer than the filter (nothing lost).
  JSON.parse(M.fixture('overpass-bartlett.json')).elements.filter(function (e) { return e.type === 'way'; }).forEach(function (e) {
    var g = e.geometry, len = 0;
    for (var i = 1; i < g.length; i++) len += S.haversineM([g[i - 1].lat, g[i - 1].lon], [g[i].lat, g[i].lon]);
    var sq = S.parseOverpass({ elements: [e] }, 0)[0];
    if (sq && sq.areaSqft >= 3000) assert.ok(len > pMin, 'w' + e.id + ' outline ' + Math.round(len) + ' m');
  });
})();
var q4 = S.quarterBbox(tb);
assert.strictEqual(q4.length, 4);
assert.deepStrictEqual(q4[0], { s: 35.2, w: -89.85, n: 35.21, e: -89.8375 });
assert.deepStrictEqual(q4[3], { s: 35.21, w: -89.8375, n: 35.22, e: -89.825 });
assert.ok(S.OVERPASS_ENDPOINTS.length === 4 && S.OVERPASS_ENDPOINTS.every(function (u) { return /^https:\/\//.test(u); }));
assert.ok(S.overpassOk({ elements: [] }));
assert.ok(!S.overpassOk({ elements: [{}], remark: 'runtime error: Query timed out in "query" at line 1 after 9 seconds.' }), 'partial answer refused');
assert.ok(!S.overpassOk({}) && !S.overpassOk(null));

// Elements posted by a browser: only well-formed buildings near the square survive.
(function () {
  var raw = JSON.parse(M.fixture('overpass-bartlett.json')).elements;
  var c = S.cleanElements(raw.concat([
    { type: 'node', id: 5, lat: 35.21, lon: -89.84 },
    { type: 'way', id: 'w1; drop', tags: { building: 'yes' }, geometry: raw[0].geometry },
    { type: 'way', id: 77, tags: { highway: 'service' }, geometry: raw[0].geometry },
    { type: 'way', id: 78, tags: { building: 'yes' }, geometry: [{ lat: 'x', lon: 1 }, { lat: 1, lon: 1 }, { lat: 2, lon: 2 }] },
    { type: 'way', id: 79, tags: { building: 'yes' }, geometry: [{ lat: 40, lon: -74 }, { lat: 40.001, lon: -74 }, { lat: 40.001, lon: -74.001 }] },
    { type: 'way', id: 1001, tags: { building: 'yes' }, geometry: raw[0].geometry }
  ]), tb);
  assert.strictEqual(c.elements.length, raw.filter(function (e) { return e.tags && e.tags.building; }).length, 'fixture buildings kept');
  assert.strictEqual(c.dropped, 6, 'node, bad id, not a building, bad point, far away, duplicate');
  var again = S.parseOverpass({ elements: c.elements }, 3000).map(function (f) { return f.id + ':' + f.areaSqft; });
  assert.deepStrictEqual(again, S.parseOverpass(JSON.parse(M.fixture('overpass-bartlett.json')), 3000).map(function (f) { return f.id + ':' + f.areaSqft; }), 'same footprints after cleaning');
  assert.strictEqual(S.cleanElements('nope', tb), null);
  assert.strictEqual(S.cleanElements(new Array(S.EL_MAX + 1).fill({}), tb), null);
})();

// ---- Overpass fixture → footprints ----------------------------------------------------
var fps = S.parseOverpass(JSON.parse(M.fixture('overpass-bartlett.json')), 3000);
var by = {};
fps.forEach(function (f) { by[f.id] = f; });
assert.ok(!by.w1004, 'the 2,000 ft² house is below the floor');
within(by.w1001.areaSqft, 42000, 0.5, 'warehouse');
within(by.w1002.areaSqft, 26000, 0.5, 'L-shaped retail');
within(by.r2001.areaSqft, 49000, 0.5, 'school relation (two outer ways joined, courtyard removed)');
assert.strictEqual(by.r2001.rings.length, 2, 'outer + courtyard');
assert.strictEqual(fps[0].id, 'r2001', 'biggest first');
fps.forEach(function (f) { assert.ok(S.pointInRings([f.lat, f.lng], f.rings), f.id + ' point inside its footprint'); });
assert.strictEqual(S.osmAddress(by.w1002.tags), '6000 Stage Road, Bartlett, TN 38134');

// ---- Types ----------------------------------------------------------------------------
assert.strictEqual(S.classify(by.w1001.tags), 'industrial');
assert.strictEqual(S.classify(by.w1002.tags), 'commercial');
assert.strictEqual(S.classify(by.w1003.tags), 'church');
assert.strictEqual(S.classify(by.r2001.tags), 'school');
assert.strictEqual(S.classify(by.w1007.tags), 'multifamily');
assert.strictEqual(S.classify({ building: 'yes' }, ''), 'other');
assert.strictEqual(S.classify({ building: 'yes' }, 'WAREHOUSE'), 'industrial', 'land use fills in');
assert.strictEqual(S.classify({ building: 'yes' }, 'OFFICE BUILDING'), 'commercial');
assert.ok(S.isSingleFamily('SINGLE FAMILY'));
assert.ok(S.isSingleFamily('Residential'));
assert.ok(!S.isSingleFamily('APARTMENTS'));
assert.ok(!S.isSingleFamily('RESIDENTIAL - MULTI FAMILY'));
assert.ok(!S.isSingleFamily('WAREHOUSE'));
assert.ok(!S.isSingleFamily(''));
assert.ok(S.isSingleFamily('HOMESTEAD', 'homestead'), 'admin pattern');

// ---- Parcels: ArcGIS attributes and join ----------------------------------------------------
var shelby = JSON.parse(M.fixture('arcgis-parcels-shelby.json'));
var parcels = shelby.features.map(function (f) { var p = S.parcelFromAttrs(f.attributes, 'shelby'); p.rings = S.esriRings(f.geometry); return p; });
function parcelOf(fp) { return parcels.filter(function (p) { return S.pointInRings([fp.lat, fp.lng], p.rings); })[0] || null; }
var pa = parcelOf(by.w1001);
assert.strictEqual(pa.id, 'B0158 00A001');
assert.strictEqual(pa.owner, 'EXAMPLE LOGISTICS LLC');
assert.strictEqual(pa.mail, '100 SAMPLE ST STE 200, MEMPHIS, TN 38103');
assert.strictEqual(pa.landUse, 'WAREHOUSE', 'description preferred over the code');
assert.strictEqual(pa.yearBuilt, 1988);
assert.strictEqual(pa.bldgSqft, 41800);
assert.strictEqual(parcelOf(by.r2001).owner, 'EXAMPLE SCHOOL DISTRICT');
assert.strictEqual(parcelOf(by.w1006), null, 'office has no parcel in the sample');
assert.ok(S.isSingleFamily(parcelOf(by.w1005).landUse), 'barn on a single-family lot is excluded');
var ar = JSON.parse(M.fixture('arcgis-parcels-arkansas.json')).features[0];
var pAr = S.parcelFromAttrs(ar.attributes, 'crittenden');
assert.deepStrictEqual([pAr.id, pAr.owner, pAr.situs, pAr.landUse], ['001-01234-000', 'EXAMPLE FREIGHT INC', '100 EXAMPLE DR', 'COMMERCIAL'], 'Arkansas lower-case fields');
assert.strictEqual(S.countyOf(35.2, -89.85), 'shelby');
assert.strictEqual(S.countyOf(34.96, -90.0), 'desoto');
assert.strictEqual(S.countyOf(35.15, -90.2), 'crittenden');

// ---- Hail CSV ------------------------------------------------------------------------------
var NOW = Date.UTC(2026, 9, 19, 16, 0);
var hail = S.parseSpcCsv(M.fixture('spc-261010_rpts_filtered_hail.csv'), '261010', { s: 34.4, w: -90.9, n: 35.7, e: -89.3 });
assert.strictEqual(hail.length, 3, 'Kansas report dropped; comma inside a comment handled');
assert.strictEqual(hail[0].sizeIn, 1.25);
assert.strictEqual(hail[0].ts, Date.UTC(2026, 9, 10, 20, 15));
assert.strictEqual(hail[2].ts, Date.UTC(2026, 9, 11, 9, 30), 'before 12Z = next day');
var hn = S.hailNear([by.w1001.lat, by.w1001.lng], hail, 30, NOW, 2);
assert.strictEqual(hn.sizeIn, 1.25);
assert.ok(hn.distMi < 2);
assert.strictEqual(S.hailNear([by.w1001.lat, by.w1001.lng], hail, 5, NOW, 2), null, 'older than 5 days');
assert.strictEqual(S.hailNear([36.5, -88], hail, 30, NOW, 2), null, 'far away');
assert.deepStrictEqual(S.spcDays(2, NOW), ['261019', '261018', '261017']);

// ---- Score + reasons -------------------------------------------------------------------------
var site = { areaSqft: 42000, lat: by.w1001.lat, lng: by.w1001.lng, type: 'industrial', parcel: { yearBuilt: 1988 }, permit: { date: '2003-05-01' }, permitsChecked: true, hail: { sizeIn: 1.25, ts: Date.UTC(2026, 9, 10, 20, 15) } };
var sc = S.score(site, { now: NOW });
assert.deepStrictEqual(sc.reasons.slice(0, 4), ['42,000 ft²', 'built 1988', 'last roof permit 2003', '1.25" hail 9 days ago']);
assert.ok(/mi from Bartlett$/.test(sc.reasons[sc.reasons.length - 1]));
assert.ok(sc.score >= 70, 'old big hail-hit warehouse scores high: ' + sc.score);
var recent = S.score(Object.assign({}, site, { permit: { date: '2023-04-11' }, hail: null }), { now: NOW });
assert.ok(recent.reasons.indexOf('roof permit 2023 (likely replaced)') > -1);
assert.ok(recent.score < sc.score - 30, 'recent re-roof scores much lower: ' + recent.score);
var none = S.score(Object.assign({}, site, { permit: null, hail: null }), { now: NOW });
assert.ok(none.reasons.indexOf('no roof permit on file since 2021') > -1, 'honest about 2021 records');
var none20 = S.score(Object.assign({}, site, { permit: null, hail: null }), { now: NOW, permitsSince: '2003-01-01' });
assert.ok(none20.reasons.indexOf('no roof permit since 2003') > -1);
assert.ok(none20.parts.age === 1 && none20.score >= none.score);
var small = S.score({ areaSqft: 10000, lat: 35.2, lng: -89.87, type: 'other' }, { now: NOW });
var big = S.score({ areaSqft: 200000, lat: 35.2, lng: -89.87, type: 'other' }, { now: NOW });
assert.ok(big.score > small.score, 'bigger roof, higher score');
var far = S.score({ areaSqft: 42000, lat: 34.6, lng: -90.6, type: 'industrial' }, { now: NOW });
var near = S.score({ areaSqft: 42000, lat: 35.21, lng: -89.88, type: 'industrial' }, { now: NOW });
assert.ok(near.score > far.score, 'closer to Bartlett, higher score');
var onlySize = S.score(site, { now: NOW, weights: { size: 1, age: 0, hail: 0, type: 0, distance: 0 } });
assert.strictEqual(onlySize.score, Math.round(100 * onlySize.parts.size), 'weights apply');
[sc, recent, none, small, big, far].forEach(function (x) { assert.ok(x.score >= 0 && x.score <= 100); });

// ---- Dedupe + do-not-contact -------------------------------------------------------------------
var s1 = { id: 'w1001', lat: by.w1001.lat, lng: by.w1001.lng, outline: by.w1001.rings[0], parcel: { id: 'B0158 00A001', situs: '6100 EXAMPLE RD' } };
assert.strictEqual(S.findExisting(s1, []), null);
assert.strictEqual(S.findExisting(s1, [{ id: 'a', scanId: 'w1001' }]).id, 'a', 'by scan id');
assert.strictEqual(S.findExisting(s1, [{ id: 'b', parcel: { id: 'b0158-00a001' } }]).id, 'b', 'by parcel id (punctuation-insensitive)');
assert.strictEqual(S.findExisting(s1, [{ id: 'c', address: '6100 Example Road, Bartlett, TN 38134' }]).id, 'c', 'by address');
assert.strictEqual(S.findExisting(s1, [{ id: 'd', address: 'x', lat: by.w1001.lat, lng: by.w1001.lng }]).id, 'd', 'hand-traced lead on the roof');
assert.strictEqual(S.findExisting(s1, [{ id: 'e', address: '6101 Example Rd', lat: 35, lng: -90 }]), null, 'different building');
assert.strictEqual(S.normAddress('6000 Stage Road, Suite 4, Bartlett'), '6000 STAGE RD');
assert.strictEqual(S.normAddress('Stage Road'), '', 'no house number, no match');
var dl = S.dncList('# comment\nExample Logistics, LLC\nB0158 00A007\n');
assert.ok(S.isDnc({ id: 'X', owner: 'EXAMPLE LOGISTICS LLC' }, dl), 'owner name, punctuation and LLC ignored');
assert.ok(S.isDnc({ id: 'B0158-00A007', owner: 'SOMEONE' }, dl), 'parcel id');
assert.ok(!S.isDnc({ id: 'B0158 00A002', owner: 'EXAMPLE PLAZA PARTNERS LP' }, dl));
assert.ok(!S.isDnc(null, dl));

console.log('scan: all tests passed');
