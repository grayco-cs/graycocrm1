// Run with:  node roofscout/tests/imagery.test.js
// roofscout/js/imagery.js: the imagery switcher's sources, zoom rules, Wayback release list,
// leaf-off dates, Google viewport and the per-user choice. Mocked fetch only (no network).
'use strict';
var assert = require('assert');
var M = require('./mock-net.js');
var I = require('../js/imagery.js');

var tests = [];
function test(name, f) { tests.push({ name: name, f: f }); }
function fakeFetch(map, calls) {
  return function (u) {
    calls && calls.push(u);
    for (var k in map) if (u.indexOf(k) > -1) { var v = map[k]; return Promise.resolve(typeof v === 'function' ? v(u) : M.json(200, v)); }
    return Promise.resolve(M.json(404, { error: { code: 404 } }));
  };
}
var LAT = 35.2059, LNG = -89.8448;   // Bartlett TN

test('tile URLs per source; the Esri key only on the standard source', function () {
  assert.strictEqual(I.tileUrl('esri', {}), 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
  assert.strictEqual(I.tileUrl('esri', { esriKey: 'k 1' }), 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=k%201');
  assert.strictEqual(I.tileUrl('clarity', { esriKey: 'k' }), 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
  assert.strictEqual(I.tileUrl('google', {}), '', 'no Google tiles without a ticket');
  assert.strictEqual(I.tileUrl('google', { ticket: '123.abc' }), '/.netlify/functions/roofscout-tiles?z={z}&x={x}&y={y}&t=123.abc');
  assert.ok(I.tileUrl('google', { ticket: 't' }).indexOf('googleapis') < 0, 'Google is only reached through the function');
  assert.strictEqual(I.tileUrl('wayback', {}), '');
  assert.strictEqual(I.source('nope').id, 'esri');
  assert.deepStrictEqual(I.ORDER, ['esri', 'clarity', 'google', 'wayback']);
});

test('attribution: Esri, Clarity, Wayback release, Google text from the viewport (escaped)', function () {
  assert.ok(/Powered by Esri/.test(I.attribution('esri')));
  assert.ok(/Clarity \(beta\)/.test(I.attribution('clarity')));
  assert.ok(/release 2024-02-08/.test(I.attribution('wayback', { date: '2024-02-08' })));
  assert.strictEqual(I.attribution('google'), 'Imagery © Google');
  assert.strictEqual(I.attribution('google', { copyright: 'Imagery ©2026 Google, <b>' }), 'Imagery ©2026 Google, &lt;b&gt;');
});

test('layer options: native zoom, retina only for free sources, map still zooms to 22', function () {
  assert.deepStrictEqual(I.layerOptions('esri', 19, false), { maxZoom: 22, maxNativeZoom: 19, detectRetina: false });
  // Retina: Leaflet asks one level deeper itself, so native is lowered and maxZoom raised by one.
  assert.deepStrictEqual(I.layerOptions('esri', 20, true), { maxZoom: 23, maxNativeZoom: 19, detectRetina: true });
  assert.deepStrictEqual(I.layerOptions('clarity', 21, true), { maxZoom: 23, maxNativeZoom: 20, detectRetina: true });
  assert.deepStrictEqual(I.layerOptions('google', 21, true), { maxZoom: 22, maxNativeZoom: 21, detectRetina: false }, 'never 4× the Google tiles');
  assert.deepStrictEqual(I.layerOptions('google', 0, false).maxNativeZoom, 20, 'default before the viewport answer');
  assert.ok(I.overZoom(20, 19) && !I.overZoom(19, 19) && !I.overZoom(18.6, 19) && I.overZoom(19.6, 19));
});

test('tileXY matches the slippy-map tile of a point', function () {
  assert.deepStrictEqual(I.tileXY(0, 0, 1), { x: 1, y: 1, z: 1 });
  var t = I.tileXY(LAT, LNG, 19);
  assert.deepStrictEqual([t.x, t.y], [131298, 207302]);
});

test('detectNative: asks the tile map above the assumed zoom and stops at the first gap', async function () {
  var calls = [];
  var f = fakeFetch({ '/tilemap/20/': { data: [1] }, '/tilemap/21/': { data: [0] } }, calls);
  assert.strictEqual(await I.detectNative(f, 'clarity', LAT, LNG), 20);
  assert.strictEqual(calls.length, 2);
  assert.ok(/^https:\/\/clarity\.maptiles\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery\/MapServer\/tilemap\/20\/\d+\/\d+\/1\/1$/.test(calls[0]), calls[0]);
  calls.length = 0;
  assert.strictEqual(await I.detectNative(fakeFetch({}, calls), 'esri', LAT, LNG, { esriKey: 'k' }), 19, '404 keeps the default');
  assert.ok(/ibasemaps-api.*\?token=k$/.test(calls[0]));
  assert.strictEqual(await I.detectNative(function () { return Promise.reject(new Error('offline')); }, 'esri', LAT, LNG), 19, 'offline keeps the default');
  assert.strictEqual(await I.detectNative(fakeFetch({ '/tilemap/': { data: [1] } }), 'esri', LAT, LNG), 21, 'never above the source maximum');
});

test('Wayback: release list from waybackconfig.json, newest first, Leaflet templates', function () {
  var items = I.parseWaybackConfig(JSON.parse(M.fixture('waybackconfig-sample.json')));
  assert.strictEqual(items.length, 12);
  assert.deepStrictEqual(items.slice(0, 2).map(function (i) { return i.date; }), ['2026-09-24', '2026-08-05']);
  assert.strictEqual(items[items.length - 1].date, '2014-02-20');
  assert.strictEqual(items[0].release, 63116);
  assert.strictEqual(items[0].url, 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/63116/{z}/{y}/{x}');
  assert.ok(/World_Imagery_Metadata_2026_r09\/MapServer$/.test(items[0].metadataUrl));
  assert.strictEqual(I.tileUrl('wayback', { release: items[0] }), items[0].url);
  assert.strictEqual(I.previousRelease(items, 63116), 26334);
  assert.strictEqual(I.previousRelease(items, 10), null);
  assert.deepStrictEqual(I.parseWaybackConfig(null), []);
  assert.deepStrictEqual(I.parseWaybackConfig({ 1: { itemTitle: 'x', itemURL: 'https://a' }, 2: { itemTitle: 'World Imagery (Wayback 2020-01-01)', itemURL: 'http://insecure' } }), [], 'bad rows dropped');
});

test('Wayback: releases with new imagery here (tilemap select chain)', async function () {
  var items = I.parseWaybackConfig(JSON.parse(M.fixture('waybackconfig-sample.json')));
  var calls = [];
  // At this spot the picture changed in 2025-01-30 (36557), 2024-02-08 (37965) and 2019-06-26 (645).
  var chain = { 63116: 36557, 34007: 36557, 36557: 36557, 60013: 37965, 13968: 37965, 37965: 37965, 41468: 645, 47963: 645, 25982: 645, 645: 645, 10: 0 };
  var f = function (u) {
    calls.push(u);
    var m = /\/tilemap\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/.exec(u);
    var rel = Number(m[1]);
    var sel = chain[rel];
    return Promise.resolve(M.json(200, sel ? { data: [1], select: [sel], valid: true, size: [12345] } : { data: [0], valid: true }));
  };
  var found = await I.localChanges(f, items, LAT, LNG, 19.4);
  assert.deepStrictEqual(found, [36557, 37965, 645]);
  assert.ok(/^https:\/\/wayback\.maptiles\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery\/MapServer\/tilemap\/63116\/19\/207302\/131298$/.test(calls[0]), calls[0]);
  assert.strictEqual(calls.length, 4, 'one request per distinct picture (+1 to find the end)');
  assert.deepStrictEqual(await I.localChanges(f, items, LAT, LNG, 19, 2), [36557, 37965], 'capped');
  assert.deepStrictEqual(await I.localChanges(function () { return Promise.reject(new Error('x')); }, items, LAT, LNG, 19), []);
});

test('Wayback metadata: capture date per release and spot; leaf-off months', function () {
  var it = { metadataUrl: 'https://metadata.maptiles.arcgis.com/arcgis/rest/services/World_Imagery_Metadata_2024_r02/MapServer' };
  var u = I.metadataQueryUrl(it, LAT, LNG, 19);
  assert.ok(u.indexOf(it.metadataUrl + '/4/query?') === 0, 'zoom 19 → sub-layer 4: ' + u);
  assert.ok(/outFields=SRC_DATE2/.test(u) && /geometryType=esriGeometryPoint/.test(u));
  assert.ok(I.metadataQueryUrl(it, LAT, LNG, 5).indexOf('/13/query?') > 0, 'below zoom 10 → sub-layer 13');
  assert.strictEqual(I.metadataQueryUrl({}, LAT, LNG, 19), '');
  var md = I.parseMetadata({ features: [{ attributes: { SRC_DATE2: Date.UTC(2023, 0, 14), NICE_DESC: 'Maxar', SAMP_RES: 0.3 } }] });
  assert.deepStrictEqual(md, { date: '2023-01-14', provider: 'Maxar', resolution: 0.3 });
  assert.strictEqual(I.parseMetadata({ features: [] }), null);
  assert.strictEqual(I.dateOf(20210305), '2021-03-05');
  assert.strictEqual(I.dateOf('2020-12-01T00:00:00Z'), '2020-12-01');
  assert.strictEqual(I.dateOf(null), null);
  assert.ok(I.isLeafOff('2023-01-14', LAT) && I.isLeafOff('2022-11-20', LAT) && I.isLeafOff('2022-03-30', LAT));
  assert.ok(!I.isLeafOff('2023-06-14', LAT) && !I.isLeafOff('2023-04-14', LAT) && !I.isLeafOff(null, LAT));
  assert.ok(I.isLeafOff('2023-07-01', -33.9), 'southern winter');
});

test('Google viewport: copyright and the deepest zoom over the point', function () {
  var j = { copyright: 'Imagery ©2026 Google', maxZoomRects: [
    { maxZoom: 19, north: 90, south: -90, east: 180, west: -180 },
    { maxZoom: 21, north: 35.3, south: 35.1, east: -89.7, west: -90.0 },
    { maxZoom: 22, north: 40, south: 39, east: -80, west: -81 }] };
  assert.deepStrictEqual(I.parseViewport(j, LAT, LNG), { copyright: 'Imagery ©2026 Google', maxZoom: 21 });
  assert.deepStrictEqual(I.parseViewport(j, 10, 10), { copyright: 'Imagery ©2026 Google', maxZoom: 19 });
  assert.deepStrictEqual(I.parseViewport({}, LAT, LNG), { copyright: '', maxZoom: null });
  assert.strictEqual(I.parseViewport({ maxZoomRects: [{ maxZoom: 20, north: 1, south: -1, east: -179, west: 179 }] }, 0, 179.5).maxZoom, 20, 'across the date line');
});

test('choice is remembered per user (and survives blocked storage)', function () {
  var mem = {};
  var st = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); } };
  assert.deepStrictEqual(I.loadPick(st, 'pm@grayco-cs.com'), { source: 'esri', release: null });
  I.savePick(st, 'PM@grayco-cs.com', { source: 'wayback', release: 37965 });
  assert.deepStrictEqual(I.loadPick(st, 'pm@grayco-cs.com'), { source: 'wayback', release: 37965 });
  assert.deepStrictEqual(I.loadPick(st, 'wjohnson@grayco-cs.com'), { source: 'esri', release: null }, 'another person keeps their own');
  mem[I.pickKey('x')] = '{"source":"bing"}';
  assert.strictEqual(I.loadPick(st, 'x').source, 'esri', 'unknown source falls back');
  var blocked = { getItem: function () { throw new Error('blocked'); }, setItem: function () { throw new Error('blocked'); } };
  assert.deepStrictEqual(I.loadPick(blocked, 'a'), { source: 'esri', release: null });
  I.savePick(blocked, 'a', { source: 'google' });
});

(async function () {
  var failed = 0;
  for (var i = 0; i < tests.length; i++) {
    try { await tests[i].f(); console.log('  ok  ' + tests[i].name); }
    catch (e) { failed++; console.log('  FAIL ' + tests[i].name + '\n       ' + (e && e.stack || e)); }
  }
  if (failed) { console.log('imagery: ' + failed + ' failed'); process.exit(1); }
  console.log('imagery: all ' + tests.length + ' tests passed');
})();
