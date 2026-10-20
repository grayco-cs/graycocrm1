// Run with:  node roofscout/tests/scan-function.test.js
// netlify/functions/roofscout-scan.js with a mocked Supabase, Overpass, county ArcGIS,
// Memphis permits and NOAA SPC (no network).
'use strict';
var assert = require('assert');
var M = require('./mock-net.js');

process.env.SUPABASE_URL = 'https://x.sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc';
delete process.env.OVERPASS_URL;
delete process.env.OVERPASS_URLS;
process.env.OVERPASS_HEDGE_MS = '300';     // the real default is 3000; shorter keeps the tests quick
process.env.OVERPASS_BUDGET_MS = '2000';
var fn = require('../../netlify/functions/roofscout-scan.js');
var S = require('../js/scan.js');

var TILE = '-3594_1760';
var SHELBY = 'https://gis.shelbycountytn.gov/arcgis/rest/services/Parcel/CERT_Parcel/MapServer/0';
var PERMITS = 'https://services.example-arcgis.test/arcgis/rest/services/DPD_Building_Permits/FeatureServer/0';

var MIRRORS = ['overpass-api.de', 'overpass.private.coffee', 'overpass.kumi.systems', 'maps.mail.ru'];
function fixtureJson() { return M.json(200, JSON.parse(M.fixture('overpass-bartlett.json'))); }
function hang() { return new Promise(function () {}); }   // never answers (aborted by the caller)

function setup() {
  var net = M.create();
  net.install();
  fn._resetOverpass();
  MIRRORS.slice(1).forEach(function (h) { net.route(h, function () { throw new Error('mirror ' + h + ' should not be asked'); }); });
  net.route('overpass-api.de', function () { return M.json(200, JSON.parse(M.fixture('overpass-bartlett.json'))); });
  net.route(SHELBY + '/query', function () { return M.json(200, JSON.parse(M.fixture('arcgis-parcels-shelby.json'))); });
  net.route(PERMITS + '?f=json', function () { return M.json(200, JSON.parse(M.fixture('permits-memphis-layer.json'))); });
  net.route(PERMITS + '/query', function () { return M.json(200, JSON.parse(M.fixture('permits-memphis-query.json'))); });
  net.route('www.spc.noaa.gov', function (u) { return u.indexOf('261010_rpts_filtered_hail.csv') > -1 ? M.text(200, M.fixture('spc-261010_rpts_filtered_hail.csv')) : M.text(404, 'Not Found'); });
  return net;
}
function call(method, opts) { return fn.handler(M.event(method, opts)).then(function (r) { r.json = JSON.parse(r.body || 'null'); return r; }); }
function post(body, token) { return call('POST', { token: token || 'tok-staff', body: body }); }

var tests = [];
function test(name, f) { tests.push({ name: name, f: f }); }

test('auth: no token 401, not staff 403, preflight ok', async function () {
  setup();
  assert.strictEqual((await call('POST', { body: { action: 'tile', tile: TILE } })).statusCode, 401);
  assert.strictEqual((await post({ action: 'tile', tile: TILE }, 'tok-bad')).statusCode, 401);
  var r = await post({ action: 'tile', tile: TILE }, 'tok-stranger');
  assert.strictEqual(r.statusCode, 403);
  assert.ok(/not on the GrayCo staff list/.test(r.json.error));
  assert.strictEqual((await call('OPTIONS', {})).statusCode, 200);
});

test('status: tables missing, then sources and limits', async function () {
  var net = setup();
  net.db.tablesMissing = true;
  var r = await call('GET', { token: 'tok-staff', query: { action: 'status' } });
  assert.strictEqual(r.statusCode, 500);
  assert.strictEqual(r.json.code, 'no-tables');
  net.db.tablesMissing = false;
  r = await call('GET', { token: 'tok-staff', query: { action: 'status' } });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.json.sources, { shelby: 'off', desoto: 'off', crittenden: 'on', permits: 'off' });
  assert.strictEqual(r.json.limits.overpassDay, 100);
});

test('tile: Overpass once (User-Agent, small query), then the cache', async function () {
  var net = setup();
  var r = await post({ action: 'tile', tile: TILE, minSqft: 10000 });
  assert.strictEqual(r.statusCode, 200, r.body);
  assert.strictEqual(r.json.fromCache, false);
  var ids = r.json.sites.map(function (s) { return s.id; }).sort();
  assert.deepStrictEqual(ids, ['r2001', 'w1001', 'w1002', 'w1003', 'w1005', 'w1007'], 'office 9,900 ft² and house left out');
  assert.ok(/OpenStreetMap/.test(r.json.attribution));
  var oc = net.calls.filter(function (c) { return c.url.indexOf('overpass-api.de') > -1; });
  assert.strictEqual(oc.length, 1);
  assert.ok(/^GrayCoRoofScout\/1\.0 \(\+https:\/\/roofscout\.grayco-cs\.com/.test(oc[0].opts.headers['User-Agent']), 'User-Agent');
  assert.ok(decodeURIComponent(oc[0].opts.body).indexOf('(35.2,-89.85,35.22,-89.825)') > -1, 'one tile bbox');
  assert.ok(/\(if:length\(\)>5\d\)/.test(decodeURIComponent(oc[0].opts.body)), 'lighter query: small outlines skipped by Overpass');
  assert.ok(/\[timeout:[5-9]\]/.test(decodeURIComponent(oc[0].opts.body)), 'Overpass told to give up within the budget');
  assert.strictEqual(r.json.via, 'overpass-api.de');
  assert.ok(net.db.cache['osm:v1:' + TILE], 'cached');
  assert.strictEqual(net.db.rate.overpass, 1, 'counted against the team Overpass limit');
  var r2 = await post({ action: 'tile', tile: TILE, minSqft: 5000 });
  assert.strictEqual(r2.json.fromCache, true);
  assert.strictEqual(r2.json.sites.length, 7, 'smaller minimum still served from the cache');
  assert.strictEqual(net.count('overpass-api.de'), 1, 'no second Overpass request');
  var w = r.json.sites.filter(function (s) { return s.id === 'w1001'; })[0];
  assert.ok(Math.abs(w.areaSqft - 42000) < 210 && w.outline.length === 4 && w.type === 'industrial');
});

test('limits: team Overpass cap and per-person cap', async function () {
  var net = setup();
  net.db.rate.overpass = 100;
  var r = await post({ action: 'tile', tile: TILE });
  assert.strictEqual(r.statusCode, 429);
  assert.strictEqual(r.json.code, 'overpass-limit');
  assert.strictEqual(net.count('overpass-api.de'), 0);
  net.db.rate['u:pm@grayco-cs.com'] = 2000;
  r = await post({ action: 'tile', tile: TILE });
  assert.strictEqual(r.json.code, 'user-limit');
});

test('input checks: tile, region, ids, enrich before tile', async function () {
  setup();
  assert.strictEqual((await post({ action: 'tile', tile: 'abc' })).statusCode, 400);
  var far = S.tilesForBbox({ s: 40.7, w: -74.0, n: 40.71, e: -73.99 })[0];   // New York
  assert.strictEqual((await post({ action: 'tile', tile: far })).json.code, 'outside');
  assert.strictEqual((await post({ action: 'enrich', tile: TILE, ids: ['DROP TABLE'] })).statusCode, 400);
  var r = await post({ action: 'enrich', tile: TILE, ids: ['w1001'] });
  assert.strictEqual(r.statusCode, 409);
});

test('enrich: parcels, single-family + do-not-contact skipped, permits, cache', async function () {
  var net = setup();
  net.db.settings = { areaScan: { doNotContact: 'B0158 00A007', sources: { shelby: { on: true, url: '' }, permits: { on: true, url: PERMITS } } } };
  await post({ action: 'tile', tile: TILE, minSqft: 5000 });
  var ids = ['w1001', 'w1002', 'w1003', 'w1005', 'w1006', 'w1007', 'r2001'];
  var r = await post({ action: 'enrich', tile: TILE, ids: ids });
  assert.strictEqual(r.statusCode, 200, r.body);
  var by = {};
  r.json.sites.forEach(function (s) { by[s.id] = s; });
  assert.strictEqual(r.json.sources.shelby, 'ok');
  assert.strictEqual(r.json.sources.permits, 'ok');
  assert.strictEqual(by.w1001.parcel.owner, 'EXAMPLE LOGISTICS LLC');
  assert.strictEqual(by.w1001.parcel.mail, '100 SAMPLE ST STE 200, MEMPHIS, TN 38103');
  assert.strictEqual(by.w1001.parcel.yearBuilt, 1988);
  assert.ok(!by.w1001.parcel.rings, 'parcel polygons stay on the server');
  assert.strictEqual(by.w1001.permit, null);
  assert.strictEqual(by.w1001.permitsChecked, true);
  assert.strictEqual(by.w1001.type, 'industrial');
  assert.strictEqual(by.w1002.permit.date, '2023-04-11', 'permit point on the building');
  assert.strictEqual(by.r2001.permit.date, '2022-09-01', 'permit matched by address');
  assert.strictEqual(by.w1005.excluded, 'residential');
  assert.strictEqual(by.w1005.parcel, null);
  assert.strictEqual(by.w1007.excluded, 'do-not-contact');
  assert.strictEqual(by.w1007.parcel, null, 'nothing about a do-not-contact owner is sent');
  assert.strictEqual(by.w1006.parcel, null, 'no parcel: owner unknown');
  var q = net.calls.filter(function (c) { return c.url === SHELBY + '/query'; });
  assert.strictEqual(q.length, 1, 'one batched county request');
  var params = new URLSearchParams(q[0].opts.body);
  assert.strictEqual(params.get('geometryType'), 'esriGeometryMultipoint');
  assert.strictEqual(JSON.parse(params.get('geometry')).points.length, 7);
  assert.strictEqual(params.get('outSR'), '4326');
  var pq = new URLSearchParams(net.calls.filter(function (c) { return c.url === PERMITS + '/query'; })[0].opts.body);
  assert.ok(/UPPER\(Work_Description\) LIKE '%ROOF%'/.test(pq.get('where')), pq.get('where'));
  // Again: everything from the cache.
  var before = net.calls.length;
  var r2 = await post({ action: 'enrich', tile: TILE, ids: ids });
  assert.deepStrictEqual(r2.json.sites, r.json.sites);
  var later = net.calls.slice(before).filter(function (c) { return c.url.indexOf('sb.test') < 0; });
  assert.strictEqual(later.length, 0, 'no county or permit requests the second time');
});

test('enrich: a county error degrades to "owner unknown" and is not cached', async function () {
  var net = setup();
  net.db.settings = { areaScan: { sources: { shelby: { on: true } } } };
  net.route(SHELBY + '/query', function () { return M.json(200, { error: { code: 400, message: 'Unable to complete operation.' } }); });
  await post({ action: 'tile', tile: TILE });
  var r = await post({ action: 'enrich', tile: TILE, ids: ['w1001'] });
  assert.strictEqual(r.statusCode, 200);
  assert.ok(/^error: Unable to complete/.test(r.json.sources.shelby));
  assert.strictEqual(r.json.sites[0].parcel, null);
  assert.strictEqual(r.json.sources.permits, 'off');
  net.route(SHELBY + '/query', function () { return M.json(200, JSON.parse(M.fixture('arcgis-parcels-shelby.json'))); });
  r = await post({ action: 'enrich', tile: TILE, ids: ['w1001'] });
  assert.strictEqual(r.json.sites[0].parcel.owner, 'EXAMPLE LOGISTICS LLC', 'asked again after the error');
});

test('enrich: Shelby off by default (terms), owner unknown', async function () {
  var net = setup();
  await post({ action: 'tile', tile: TILE });
  var r = await post({ action: 'enrich', tile: TILE, ids: ['w1001'] });
  assert.strictEqual(r.json.sources.shelby, 'off');
  assert.strictEqual(r.json.sites[0].parcel, null);
  assert.strictEqual(net.count('gis.shelbycountytn.gov'), 0, 'no request to a source that is off');
});

test('hail: SPC days fetched once, parsed, cached', async function () {
  var net = setup();
  var realNow = Date.now;
  Date.now = function () { return Date.UTC(2026, 9, 19, 16, 0); };
  try {
    var r = await post({ action: 'hail', days: 10 });
    assert.strictEqual(r.statusCode, 200, r.body);
    assert.strictEqual(r.json.more, false);
    assert.strictEqual(r.json.reports.length, 3);
    assert.ok(r.json.reports.every(function (h) { return h.lat < 36 && h.lng > -91; }), 'region only');
    var first = net.count('www.spc.noaa.gov');
    assert.ok(first >= 11 && first <= 22, 'each day once (+ the raw-file fallback for missing days): ' + first);
    var r2 = await post({ action: 'hail', days: 10 });
    assert.strictEqual(r2.json.reports.length, 3);
    assert.strictEqual(net.count('www.spc.noaa.gov'), first, 'cached');
  } finally { Date.now = realNow; }
});

test('overpass: slow primary → a mirror is raced and wins; the slow one is cancelled', async function () {
  var net = setup();
  var aborted = 0;
  net.route('overpass-api.de', function (u, o) { o.signal.addEventListener('abort', function () { aborted++; }); return M.later(1500, fixtureJson); });
  net.route('overpass.private.coffee', function () { return M.later(100, fixtureJson); });
  var t0 = Date.now();
  var r = await post({ action: 'tile', tile: TILE, minSqft: 10000 });
  var took = Date.now() - t0;
  assert.strictEqual(r.statusCode, 200, r.body);
  assert.strictEqual(r.json.via, 'overpass.private.coffee');
  assert.strictEqual(r.json.sites.length, 6);
  assert.ok(took >= 300 && took < 1200, 'hedged after 300 ms, answered by the mirror: ' + took + ' ms');
  assert.strictEqual(net.count('overpass-api.de'), 1);
  assert.strictEqual(net.count('overpass.private.coffee'), 1);
  assert.strictEqual(net.count('overpass.kumi.systems'), 0, 'only as many as needed');
  assert.strictEqual(aborted, 1, 'slow primary cancelled');
  var mirrorCall = net.calls.filter(function (c) { return c.url.indexOf('private.coffee') > -1; })[0];
  assert.ok(/^GrayCoRoofScout\/1\.0 .*@grayco-cs\.com/.test(mirrorCall.opts.headers['User-Agent']), 'contact in the User-Agent for mirrors too');
  assert.strictEqual(net.db.cache['osm:v1:' + TILE].data.via, 'overpass.private.coffee', 'cached, with where it came from');
  assert.strictEqual(net.db.rate.overpass, 1, 'one square = one count, however many instances were asked');
});

test('overpass: a fast refusal moves on at once and the next call starts with the instance that worked', async function () {
  var net = setup();
  net.route('overpass-api.de', function () { return M.json(429, { remark: 'rate_limited' }); });
  net.route('overpass.private.coffee', function () { return M.json(504, 'Gateway Timeout'); });
  net.route('overpass.kumi.systems', function () { return fixtureJson(); });
  var t0 = Date.now();
  var r = await post({ action: 'tile', tile: TILE });
  assert.strictEqual(r.statusCode, 200, r.body);
  assert.ok(Date.now() - t0 < 250, 'no waiting for the hedge timer after a refusal');
  assert.strictEqual(r.json.via, 'overpass.kumi.systems');
  var order = fn._overpassEndpoints().map(function (u) { return new URL(u).host; });
  assert.deepStrictEqual(order, ['overpass.kumi.systems', 'maps.mail.ru', 'overpass-api.de', 'overpass.private.coffee'], 'recent failures go last');
});

test('overpass: a "timed out" remark (partial answer) is not used or cached', async function () {
  var net = setup();
  net.route('overpass-api.de', function () { var j = JSON.parse(M.fixture('overpass-bartlett.json')); j.elements = j.elements.slice(0, 1); j.remark = 'runtime error: Query timed out in "query" at line 1 after 2 seconds.'; return M.json(200, j); });
  net.route('overpass.private.coffee', function () { return fixtureJson(); });
  var r = await post({ action: 'tile', tile: TILE, minSqft: 10000 });
  assert.strictEqual(r.json.via, 'overpass.private.coffee');
  assert.strictEqual(r.json.sites.length, 6, 'the complete answer');
});

test('overpass: nobody answers → 504 within the budget, browser may fall back, nothing cached', async function () {
  var net = setup();
  MIRRORS.forEach(function (h) { net.route(h, hang); });
  var t0 = Date.now();
  var r = await post({ action: 'tile', tile: TILE });
  var took = Date.now() - t0;
  assert.strictEqual(r.statusCode, 504, r.body);
  assert.strictEqual(r.json.code, 'overpass-timeout');
  assert.strictEqual(r.json.fallback, true);
  assert.ok(/overpass-api\.de timeout/.test(r.json.tried), r.json.tried);
  assert.ok(took >= 1900 && took < 2600, 'stays within the function time limit: ' + took + ' ms');
  assert.ok(net.count('maps.mail.ru') === 0 || net.count('overpass.kumi.systems') === 1, 'hedged, but no new request in the last 1.5 s');
  assert.ok(!net.db.cache['osm:v1:' + TILE]);
  // All busy → 503 overpass-busy.
  net.clearRoutes();
  MIRRORS.forEach(function (h) { net.route(h, function () { return M.json(429, {}); }); });
  fn._resetOverpass();
  r = await post({ action: 'tile', tile: TILE });
  assert.strictEqual(r.statusCode, 503);
  assert.strictEqual(r.json.code, 'overpass-busy');
  assert.strictEqual(net.count('maps.mail.ru'), 1, 'every instance tried once');
});

test('elements: the browser\'s own Overpass answer is parsed, filtered, cached like a server download', async function () {
  var net = setup();
  MIRRORS.forEach(function (h) { net.route(h, function () { throw new Error('the server must not ask Overpass here'); }); });
  var els = JSON.parse(M.fixture('overpass-bartlett.json')).elements;
  var junk = [{ type: 'way', id: 99, tags: { building: 'yes', name: '<script>' }, geometry: [{ lat: 36.5, lon: -88 }, { lat: 36.501, lon: -88 }, { lat: 36.501, lon: -88.002 }] }, { type: 'node', id: 1 }];
  var r = await post({ action: 'elements', tile: TILE, minSqft: 10000, elements: els.concat(junk), source: 'overpass-api.de' });
  assert.strictEqual(r.statusCode, 200, r.body);
  assert.strictEqual(r.json.fromCache, false);
  assert.strictEqual(r.json.via, 'browser:overpass-api.de');
  assert.deepStrictEqual(r.json.sites.map(function (s) { return s.id; }).sort(), ['r2001', 'w1001', 'w1002', 'w1003', 'w1005', 'w1007'], 'same as the server path; far-away building dropped');
  assert.strictEqual(net.db.cache['osm:v1:' + TILE].data.via, 'browser:overpass-api.de');
  assert.strictEqual(net.db.rate.overpass, undefined, 'the server sent nothing to Overpass');
  // Enrichment then works from the cache as usual.
  var e = await post({ action: 'enrich', tile: TILE, ids: ['w1001'] });
  assert.strictEqual(e.statusCode, 200);
  // Already cached: served from the cache, never replaced by a later post.
  r = await post({ action: 'elements', tile: TILE, minSqft: 10000, elements: [] });
  assert.strictEqual(r.json.fromCache, true);
  assert.strictEqual(r.json.sites.length, 6);
});

test('elements: validation and size limits', async function () {
  setup();
  assert.strictEqual((await post({ action: 'elements', tile: TILE, elements: 'x' })).json.code, 'bad-elements');
  assert.strictEqual((await post({ action: 'elements', tile: TILE })).statusCode, 400, 'elements required');
  assert.strictEqual((await post({ action: 'elements', tile: TILE, elements: new Array(S.EL_MAX + 1).fill(0) })).statusCode, 400, 'too many');
  var big = new Array(9000).fill({ type: 'way', id: 1, tags: { building: 'yes', note: 'x'.repeat(600) } });
  var r = await post({ action: 'elements', tile: TILE, elements: big });
  assert.strictEqual(r.statusCode, 413);
  var far = S.tilesForBbox({ s: 40.7, w: -74.0, n: 40.71, e: -73.99 })[0];
  assert.strictEqual((await post({ action: 'elements', tile: far, elements: [] })).json.code, 'outside');
  assert.strictEqual((await post({ action: 'elements', tile: TILE, elements: [] }, 'tok-stranger')).statusCode, 403);
});

(async function () {
  for (var i = 0; i < tests.length; i++) {
    try { await tests[i].f(); }
    catch (e) { console.error('FAIL: ' + tests[i].name); throw e; }
  }
  console.log('scan function: all ' + tests.length + ' tests passed');
})().catch(function (e) { console.error(e); process.exit(1); });
