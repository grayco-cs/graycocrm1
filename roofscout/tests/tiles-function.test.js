// Run with:  node roofscout/tests/tiles-function.test.js
// netlify/functions/roofscout-tiles.js (Google satellite through the Map Tiles API) with a
// mocked Supabase and a mocked tile.googleapis.com (no network, no real key).
'use strict';
var assert = require('assert');
var M = require('./mock-net.js');

process.env.SUPABASE_URL = 'https://x.sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc';
var fn = require('../../netlify/functions/roofscout-tiles.js');

var JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
function img(status) {
  return { ok: status === 200, status: status,
    headers: { get: function (h) { return { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=172800' }[h.toLowerCase()] || null; } },
    arrayBuffer: function () { return Promise.resolve(JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length)); },
    json: function () { return Promise.resolve({}); } };
}
function setup(opts) {
  opts = opts || {};
  fn._reset();
  var net = M.create();
  net.install();
  var g = { sessions: 0, tiles: [], refuse: !!opts.refuse, staleSession: '' };
  net.route('tile.googleapis.com/v1/createSession', function (u, o) {
    g.sessions++;
    g.createBody = JSON.parse(o.body);
    g.createUrl = u;
    if (g.refuse) return M.json(403, { error: { code: 403, message: 'Map Tiles API has not been used in project 123 before or it is disabled.' } });
    return M.json(200, { session: 'sess-' + g.sessions, expiry: String(Math.floor(Date.now() / 1000) + 14 * 86400), tileWidth: 256, tileHeight: 256, imageFormat: 'jpeg' });
  });
  net.route('tile.googleapis.com/v1/2dtiles/', function (u) {
    g.tiles.push(u);
    if (g.staleSession && u.indexOf('session=' + g.staleSession + '&') > -1) return M.json(403, { error: { message: 'session expired' } });
    return /2dtiles\/23\//.test(u) ? img(404) : img(200);
  });
  net.route('tile.googleapis.com/tile/v1/viewport', function () {
    return M.json(200, { copyright: 'Imagery ©2026 Google, Maxar Technologies', maxZoomRects: [{ maxZoom: 21, north: 36, south: 35, east: -89, west: -90 }] });
  });
  return { net: net, g: g };
}
function call(query, token) {
  return fn.handler(M.event('GET', { token: token, query: query })).then(function (r) {
    r.json = r.isBase64Encoded ? null : JSON.parse(r.body || 'null');
    return r;
  });
}
async function ticket() { var r = await call({ action: 'ticket' }, 'tok-staff'); assert.strictEqual(r.statusCode, 200, r.body); return r.json.ticket; }
var MONTH = new Date().toISOString().slice(0, 7);

var tests = [];
function test(name, f) { tests.push({ name: name, f: f }); }

test('sign-in required for usage and ticket; tiles need a valid ticket', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key'; delete process.env.GOOGLE_MAPS_TILES_KEY;
  var s = setup();
  assert.strictEqual((await call({ action: 'ticket' })).statusCode, 401);
  assert.strictEqual((await call({ action: 'ticket' }, 'tok-bad')).statusCode, 401);
  var r = await call({ action: 'usage' }, 'tok-stranger');
  assert.strictEqual(r.statusCode, 403);
  assert.ok(/not on the GrayCo staff list/.test(r.json.error));
  assert.strictEqual((await call({ z: '18', x: '1', y: '1' })).statusCode, 401, 'no ticket');
  assert.strictEqual((await call({ z: '18', x: '1', y: '1', t: '9999999999.' + 'A'.repeat(43) })).statusCode, 401, 'forged ticket');
  var old = fn._newTicket();
  var realNow = Date.now;
  Date.now = function () { return realNow() + 13 * 3600e3; };
  try { assert.strictEqual((await call({ z: '18', x: '1', y: '1', t: old.ticket })).statusCode, 401, 'expired ticket'); }
  finally { Date.now = realNow; }
  assert.strictEqual(s.g.tiles.length, 0, 'Google never asked without a ticket');
});

test('usage: connected, counts and the admin limit (default 90,000)', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key';
  var s = setup();
  var r = await call({ action: 'usage' }, 'tok-staff');
  assert.deepStrictEqual(r.json, { connected: true, usedThisMonth: 0, limit: 90000 });
  s.net.db.settings = { mapTiles: { monthlyLimit: 5000 } };
  s.net.db.usage['gtiles|' + MONTH] = 12;
  r = await call({ action: 'usage' }, 'tok-staff');
  assert.deepStrictEqual(r.json, { connected: true, usedThisMonth: 12, limit: 5000 });
  delete process.env.GOOGLE_SOLAR_API_KEY;
  r = await call({ action: 'usage' }, 'tok-staff');
  assert.strictEqual(r.json.connected, false);
  r = await call({ action: 'ticket' }, 'tok-staff');
  assert.strictEqual(r.statusCode, 503);
  assert.strictEqual(r.json.code, 'not-connected');
});

test('ticket → tile: one session (satellite), key stays on the server, image passed through', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key';
  var s = setup();
  var r = await call({ action: 'ticket' }, 'tok-staff');
  assert.strictEqual(r.statusCode, 200);
  assert.ok(/^\d+\.[A-Za-z0-9_-]{43}$/.test(r.json.ticket));
  assert.ok(r.json.exp > Date.now() / 1000 + 1700 && r.json.exp <= Date.now() / 1000 + 12 * 3600 + 5);
  assert.ok(r.body.indexOf('solar-test-key') < 0 && r.body.indexOf('sess-') < 0, 'no key or session in the answer');
  assert.strictEqual(s.g.createBody.mapType, 'satellite');
  assert.ok(/key=solar-test-key/.test(s.g.createUrl));
  var t2 = await ticket();
  assert.strictEqual(t2, r.json.ticket, 'same ticket in the same window (browser cache keeps working)');
  var tile = await call({ z: '20', x: '270000', y: '410000', t: t2 });
  assert.strictEqual(tile.statusCode, 200);
  assert.strictEqual(tile.isBase64Encoded, true);
  assert.deepStrictEqual(Buffer.from(tile.body, 'base64'), JPEG);
  assert.strictEqual(tile.headers['Content-Type'], 'image/jpeg');
  assert.strictEqual(tile.headers['Cache-Control'], 'private, max-age=86400', 'Google\'s caching, kept private and capped');
  assert.ok(/\/v1\/2dtiles\/20\/270000\/410000\?session=sess-1&key=solar-test-key$/.test(s.g.tiles[0]), s.g.tiles[0]);
  assert.strictEqual(s.g.sessions, 1, 'session reused');
  // The session is shared through the server-only cache table.
  assert.strictEqual(s.net.db.cache['gtiles:session:v1'].data.session, 'sess-1');
});

test('GOOGLE_MAPS_TILES_KEY wins over the Solar key', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key'; process.env.GOOGLE_MAPS_TILES_KEY = 'tiles-test-key';
  var s = setup();
  var t = await ticket();
  await call({ z: '19', x: '1', y: '1', t: t });
  assert.ok(/key=tiles-test-key/.test(s.g.createUrl) && /key=tiles-test-key/.test(s.g.tiles[0]));
  delete process.env.GOOGLE_MAPS_TILES_KEY;
});

test('bad tile requests are refused before Google is asked; Google 404 passes as 404', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key';
  var s = setup();
  var t = await ticket();
  assert.strictEqual((await call({ z: '20', x: '-1', y: '3', t: t })).statusCode, 400);
  assert.strictEqual((await call({ z: '3', x: '8', y: '3', t: t })).statusCode, 400, 'x beyond 2^z');
  assert.strictEqual((await call({ z: '30', x: '1', y: '1', t: t })).statusCode, 400);
  assert.strictEqual(s.g.tiles.length, 0);
  // Google answers 404 where it has no deeper picture: passed on as 404.
  s.net.route('tile.googleapis.com/v1/2dtiles/22/', function () { return img(404); });
  assert.strictEqual((await call({ z: '22', x: '1', y: '1', t: t })).statusCode, 404);
});

test('a refused session is replaced once', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key';
  var s = setup();
  var t = await ticket();
  s.g.staleSession = 'sess-1';
  var r = await call({ z: '18', x: '5', y: '5', t: t });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(s.g.sessions, 2);
  assert.ok(/session=sess-2/.test(s.g.tiles[s.g.tiles.length - 1]));
});

test('Map Tiles API not enabled: clear message, no ticket', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key';
  setup({ refuse: true });
  var r = await call({ action: 'ticket' }, 'tok-staff');
  assert.strictEqual(r.statusCode, 503);
  assert.strictEqual(r.json.code, 'not-enabled');
  assert.ok(/turn on the "Map Tiles API"/.test(r.json.error), r.json.error);
});

test('every Google request is counted (batched) and the monthly limit stops tiles', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key';
  var s = setup();
  s.net.db.settings = { mapTiles: { monthlyLimit: 30 } };
  var t = await ticket();
  for (var i = 0; i < 26; i++) assert.strictEqual((await call({ z: '18', x: String(i), y: '1', t: t })).statusCode, 200);
  assert.ok(s.net.db.usage['gtiles|' + MONTH] >= 25, 'written in a batch: ' + s.net.db.usage['gtiles|' + MONTH]);
  assert.ok(s.net.count('rs_add_usage') <= 2, 'not one database call per tile');
  var v = await call({ action: 'viewport', t: t, zoom: '19', north: '35.21', south: '35.20', east: '-89.84', west: '-89.85' });
  assert.strictEqual(v.statusCode, 200);
  assert.strictEqual(v.json.copyright, 'Imagery ©2026 Google, Maxar Technologies');
  assert.strictEqual(v.json.maxZoomRects[0].maxZoom, 21);
  for (i = 0; i < 3; i++) await call({ z: '18', x: '9' + i, y: '1', t: t });
  var r = await call({ z: '18', x: '99', y: '1', t: t });
  assert.strictEqual(r.statusCode, 429);
  assert.strictEqual(r.json.code, 'limit');
  var before = s.g.tiles.length;
  await call({ z: '18', x: '98', y: '1', t: t });
  assert.strictEqual(s.g.tiles.length, before, 'Google not asked past the limit');
  assert.strictEqual(s.net.db.usage['gtiles|' + MONTH], 30, 'all counted once the limit is hit');
  r = await call({ action: 'ticket' }, 'tok-staff');
  assert.strictEqual(r.statusCode, 429);
  assert.ok(/limit \(30 tiles\) is used up/.test(r.json.error));
});

test('older database without rs_add_usage: counted one by one', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key';
  var s = setup();
  s.net.db.noAddUsage = true;
  var t = await ticket();
  await call({ z: '18', x: '1', y: '1', t: t });
  await call({ z: '18', x: '2', y: '1', t: t });
  await fn._flush();
  assert.strictEqual(s.net.db.usage['gtiles|' + MONTH], 2);
});

test('viewport needs a ticket and numbers', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key';
  setup();
  var t = await ticket();
  assert.strictEqual((await call({ action: 'viewport', zoom: '19', north: '1', south: '0', east: '1', west: '0' })).statusCode, 401);
  assert.strictEqual((await call({ action: 'viewport', t: t, zoom: '19', north: 'x', south: '0', east: '1', west: '0' })).statusCode, 400);
});

test('no Google key ever appears in a response body', async function () {
  process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key';
  var s = setup();
  var t = await ticket();
  var bodies = [await call({ action: 'usage' }, 'tok-staff'), await call({ action: 'viewport', t: t, zoom: '19', north: '35.21', south: '35.20', east: '-89.84', west: '-89.85' })];
  s.g.refuse = true; fn._reset();
  bodies.push(await call({ action: 'ticket' }, 'tok-staff'));
  bodies.forEach(function (r) { assert.ok(r.body.indexOf('solar-test-key') < 0, r.body); });
});

(async function () {
  var failed = 0;
  for (var i = 0; i < tests.length; i++) {
    try { await tests[i].f(); console.log('  ok  ' + tests[i].name); }
    catch (e) { failed++; console.log('  FAIL ' + tests[i].name + '\n       ' + (e && e.stack || e)); }
  }
  if (failed) { console.log('tiles function: ' + failed + ' failed'); process.exit(1); }
  console.log('tiles function: all ' + tests.length + ' tests passed');
})();
