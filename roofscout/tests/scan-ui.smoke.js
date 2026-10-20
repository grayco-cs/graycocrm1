// Playwright smoke test of Map → Scan an area and the imagery switcher, signed in (shared-database mode), offline.
//
//   NODE_PATH=<dir with playwright (and optionally leaflet)> node roofscout/tests/scan-ui.smoke.js [screenshot.png]
//
// The page is served from roofscout/ on 127.0.0.1. Supabase, Nominatim, Google Solar and the map
// tiles are answered by page.route; the two RoofScout server functions run in this process (the
// real handlers) with Overpass / county / Tracerfy mocked from tests/fixtures (see mock-net.js).
// The imagery switcher's sources are mocked too: Esri / Clarity / Wayback tiles, tile maps and
// metadata (page.route), and Google's Map Tiles API behind the real roofscout-tiles handler.
// Leaflet is served from node_modules when installed, otherwise the map is skipped.
'use strict';
var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var M = require('./mock-net.js');

var chromium;
try { chromium = require('playwright').chromium; } catch (e) { console.log('scan-ui smoke: SKIPPED (playwright not installed)'); process.exit(0); }
var leafletDir = null;
try { leafletDir = path.dirname(require.resolve('leaflet/dist/leaflet.js')); } catch (e) { /* map skipped */ }

process.env.SUPABASE_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.TRACERFY_API_KEY = 'tf-test';
process.env.GOOGLE_SOLAR_API_KEY = 'solar-test-key';
var scanFn = require('../../netlify/functions/roofscout-scan.js');
var skipFn = require('../../netlify/functions/roofscout-skiptrace.js');
var tilesFn = require('../../netlify/functions/roofscout-tiles.js');
// A 1×1 PNG stands in for every satellite tile.
var PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

var ROOT = path.join(__dirname, '..');
var SB = 'https://ieeonhpfahmwwecizdut.supabase.co';
var shot = process.argv[2] || '';
process.env.OVERPASS_HEDGE_MS = '300';     // keep the "server cannot reach Overpass" part quick
process.env.OVERPASS_BUDGET_MS = '2000';
var MIRRORS = ['overpass-api.de', 'overpass.private.coffee', 'overpass.kumi.systems', 'maps.mail.ru'];
// What the page itself gets from Overpass (browser fallback). failTile: a bbox string that fails.
var browserOp = { calls: 0, inFlight: 0, maxInFlight: 0, failBox: '', bodies: [] };
var fnFlight = { now: 0, max: 0 };
var zipBox = ['35.2035', '35.2085', '-89.8462', '-89.8405'];

// In-process "server": Supabase state shared by the page routes and the functions.
var net = M.create();
net.install();
net.route('overpass-api.de', function () { return M.json(200, JSON.parse(M.fixture('overpass-bartlett.json'))); });
net.route('gis.shelbycountytn.gov', function () { return M.json(200, JSON.parse(M.fixture('arcgis-parcels-shelby.json'))); });
net.route('tracerfy.com/v1/api/analytics/', function () { return M.json(200, { credit_balance: 950 }); });
net.route('tracerfy.com/v1/api/trace/lookup/', function () {
  return M.json(200, { hit: true, persons: [{ full_name: 'Pat Example', property_owner: true, litigator: false,
    phones: [{ number: '9015550142', type: 'Mobile', dnc: false, tcpa: false }, { number: '9015550177', type: 'Landline', dnc: true }, { number: '9015550111' }],
    emails: [{ email: 'pat@example.com' }] }] });
});
net.db.settings = { areaScan: { sources: { shelby: { on: true, url: '' } } } };
// Google Map Tiles API (createSession, 2D satellite tiles, viewport).
var google = { sessions: 0, tiles: 0, viewports: 0 };
net.route('tile.googleapis.com/v1/createSession', function () { google.sessions++; return M.json(200, { session: 'sess-smoke', expiry: String(Math.floor(Date.now() / 1000) + 14 * 86400), tileWidth: 256, tileHeight: 256, imageFormat: 'png' }); });
net.route('tile.googleapis.com/v1/2dtiles/', function () {
  google.tiles++;
  return { ok: true, status: 200, headers: { get: function (h) { return { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' }[h.toLowerCase()] || null; } },
    arrayBuffer: function () { return Promise.resolve(PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length)); } };
});
net.route('tile.googleapis.com/tile/v1/viewport', function () { google.viewports++; return M.json(200, { copyright: 'Imagery ©2026 Google, Smoke Test Imagery', maxZoomRects: [{ maxZoom: 21, north: 36, south: 35, east: -89, west: -90 }] }); });
// Esri Wayback at the test spot: the picture changed in the 2025-01-30, 2024-02-08 and 2019-06-26
// releases; the 2024-02-08 one was taken in January (leaf-off).
var WB_CHAIN = { 63116: 36557, 26334: 36557, 34007: 36557, 36557: 36557, 13968: 37965, 60013: 37965, 37965: 37965, 41468: 645, 47963: 645, 25982: 645, 645: 645 };
var WB_TAKEN = { World_Imagery_Metadata_2025_r01: Date.UTC(2024, 9, 2), World_Imagery_Metadata_2024_r01: Date.UTC(2024, 0, 14), World_Imagery_Metadata_2019_r08: Date.UTC(2019, 4, 20) };

// A hand-traced lead already sits on the church roof.
var ADMIN = 'wjohnson@grayco-cs.com';
var now = new Date().toISOString();
var rows = { Lchurch: { id: 'Lchurch', created_at: now, updated_at: now, created_by: ADMIN, updated_by: ADMIN,
  data: { name: 'Church on Example Rd', address: '6050 Example Rd, Bartlett, TN 38134', kind: 'commercial', roofType: 'tpo', areaSqft: 12000, condition: 50, stage: 'New', owner: {}, source: 'map', lat: 35.20596, lng: -89.8448 } } };
net.db.tokens['tok-admin'] = ADMIN;

function serve() {
  return new Promise(function (res) {
    var srv = http.createServer(function (req, resp) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      var f = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
      fs.readFile(f, function (err, buf) {
        if (err) { resp.writeHead(404); resp.end(); return; }
        var types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
        resp.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
        resp.end(buf);
      });
    }).listen(0, '127.0.0.1', function () { res(srv); });
  });
}

async function main() {
  var srv = await serve();
  var base = 'http://127.0.0.1:' + srv.address().port + '/';
  var browser = await chromium.launch();
  var page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  var errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  var dialogs = [];
  page.on('dialog', function (d) { dialogs.push(d.message()); d.accept(); });
  var posted = [];
  var imgSeen = [];   // satellite tile / tile function URLs the page asked for

  await page.addInitScript(function () {
    localStorage.setItem('gc_auth_v1', JSON.stringify({ access_token: 'tok-admin', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 36000, email: 'wjohnson@grayco-cs.com', uid: 'u1', role: 'admin', roleKnown: true }));
  });
  await page.route('**/*', async function (route) {
    var req = route.request(), url = req.url(), method = req.method();
    if (url.indexOf(base) === 0 && url.indexOf('/.netlify/functions/') < 0) return route.continue();
    if (/unpkg\.com\/leaflet@1\.9\.4\/dist\/(.+)$/.test(url)) {
      var file = RegExp.$1;
      if (!leafletDir) return route.abort();
      return route.fulfill({ path: path.join(leafletDir, file), contentType: /\.css$/.test(file) ? 'text/css' : 'text/javascript' });
    }
    if (url === 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json') return route.fulfill({ status: 200, contentType: 'application/json', body: M.fixture('waybackconfig-sample.json') });
    if (/wayback\.maptiles\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery\/MapServer\/tilemap\/(\d+)\//.test(url)) {
      var sel = WB_CHAIN[RegExp.$1];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sel ? { data: [1], select: [sel], valid: true, size: [100] } : { data: [0], valid: true }) });
    }
    if (/metadata\.maptiles\.arcgis\.com\/arcgis\/rest\/services\/(World_Imagery_Metadata_\w+)\/MapServer\/\d+\/query/.test(url)) {
      var when = WB_TAKEN[RegExp.$1];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: when ? [{ attributes: { SRC_DATE2: when, NICE_DESC: 'Maxar', SAMP_RES: 0.3 } }] : [] }) });
    }
    if (MIRRORS.some(function (h) { return url.indexOf('https://' + h + '/') === 0; })) {
      browserOp.calls++;
      var q = decodeURIComponent((req.postData() || '').replace(/^data=/, '').replace(/\+/g, ' '));
      browserOp.bodies.push(q);
      if (browserOp.failBox && q.indexOf(browserOp.failBox) > -1) return route.abort('connectionrefused');
      browserOp.inFlight++; browserOp.maxInFlight = Math.max(browserOp.maxInFlight, browserOp.inFlight);
      await new Promise(function (r) { setTimeout(r, 150); });
      browserOp.inFlight--;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: M.fixture('overpass-bartlett.json') });
    }
    if (/\/tilemap\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [0], valid: true }) });
    if (/maptiles\.arcgis\.com\/.*\/tile\//.test(url)) { imgSeen.push(url); return route.fulfill({ status: 200, contentType: 'image/png', body: PNG }); }
    if (/arcgisonline|arcgis\.com\/arcgis\/rest\/services\/(World_Imagery|Reference)/.test(url)) { imgSeen.push(url); return route.fulfill({ status: 404, body: '' }); }
    if (url.indexOf('/.netlify/functions/') > -1) {
      var name = /functions\/([a-z-]+)/.exec(url)[1];
      var u = new URL(url);
      var ev = { httpMethod: method, headers: req.headers(), queryStringParameters: Object.fromEntries(u.searchParams), body: req.postData() || undefined };
      if (name === 'solar-lookup') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(method === 'GET' ? { connected: true, usedThisMonth: 3, limit: 500 } : { found: true, areaSqft: 41200, pitch: 0, segments: 2, imageryDate: '2024-05-01', imageryQuality: 'HIGH', usedThisMonth: 4, limit: 500 }) });
      var h = name === 'roofscout-scan' ? scanFn : name === 'roofscout-skiptrace' ? skipFn : name === 'roofscout-tiles' ? tilesFn : null;
      if (!h) return route.fulfill({ status: 404, body: '' });
      if (name === 'roofscout-tiles') imgSeen.push(url);
      var scanTile = name === 'roofscout-scan' && /"action":"(tile|elements)"/.test(ev.body || '');
      if (scanTile) { fnFlight.now++; fnFlight.max = Math.max(fnFlight.max, fnFlight.now); }
      var r;
      try { r = await h.handler(ev); } finally { if (scanTile) fnFlight.now--; }
      if (r.isBase64Encoded) return route.fulfill({ status: r.statusCode, headers: r.headers, body: Buffer.from(r.body, 'base64') });
      return route.fulfill({ status: r.statusCode, contentType: 'application/json', body: r.body });
    }
    if (url.indexOf('nominatim.openstreetmap.org') > -1) {
      if (url.indexOf('/reverse') > -1) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: '', address: { house_number: '6100', road: 'Example Road', city: 'Bartlett', 'ISO3166-2-lvl4': 'US-TN', postcode: '38134' } }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ display_name: '38134, Bartlett, TN', lat: '35.206', lon: '-89.8435', boundingbox: zipBox }]) });
    }
    if (url.indexOf(SB + '/rest/v1/') === 0) {
      var p = new URL(url).pathname.replace('/rest/v1/', '');
      var json = function (status, obj) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(obj) }); };
      if (p === 'gc_staff') return json(200, [{ email: ADMIN, name: 'Wesley', role: 'admin', active: true }]);
      if (p === 'rs_profiles') return json(200, []);
      if (p === 'rs_settings') return json(200, [{ data: net.db.settings }]);
      if (p === 'rs_activity') return method === 'GET' ? json(200, []) : json(201, null);
      if (p === 'rs_leads') {
        if (method === 'GET') {
          var id0 = new URL(url).searchParams.get('id');
          var list = Object.keys(rows).map(function (k) { return rows[k]; });
          if (id0) list = list.filter(function (r) { return 'eq.' + r.id === id0; });
          return json(200, list);
        }
        var b = JSON.parse(req.postData() || '{}');
        var t = new Date(Date.now() + Math.floor(Math.random() * 1000)).toISOString();
        if (method === 'POST') {
          posted.push(b);
          rows[b.id] = { id: b.id, data: b.data, created_at: t, updated_at: t, created_by: ADMIN, updated_by: ADMIN };
          net.db.leads[b.id] = b.data;
          return json(201, [rows[b.id]]);
        }
        if (method === 'PATCH') {
          var id = /id=eq\.([^&]+)/.exec(url)[1];
          rows[id].data = b.data; rows[id].updated_at = t;
          net.db.leads[id] = b.data;
          return json(200, [rows[id]]);
        }
      }
      return json(404, { message: 'no mock for ' + p });
    }
    return route.abort();
  });

  await page.goto(base + 'index.html');
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForSelector('#area-scan');
  assert.strictEqual(await page.locator('[data-act=scan]').count(), 0, 'no demo scan when signed in');
  assert.ok(/OpenStreetMap contributors/.test(await page.locator('#area-scan').innerText()), 'OSM attribution in the panel');

  // ZIP → area.
  await page.click('[data-act=scan-mode][data-v=zip]');
  await page.fill('#scan-where-q', '38134');
  await page.click('#scan-where button[type=submit]');
  await page.waitForFunction(function () { return /ZIP 38134/.test(document.querySelector('#scan-area-line').textContent); });

  // Scan.
  await page.click('[data-act=scan-run]');
  await page.waitForFunction(function () { return /Scan done|buildings found\./.test(document.body.innerText) && !document.querySelector('[data-act=scan-run]').disabled; }, null, { timeout: 15000 });
  var ids = await page.$$eval('#scan-results tr[data-sid]', function (trs) { return trs.map(function (t) { return t.dataset.sid; }); });
  assert.deepStrictEqual(ids.slice().sort(), ['r2001', 'w1001', 'w1002', 'w1003', 'w1007'], 'single-family barn skipped, office under 10,000 ft²: ' + ids);
  assert.ok(/skipped 1 single-family/.test(await page.locator('#scan-progress').innerText()));
  var scores = await page.$$eval('#scan-results tr[data-sid] .score', function (els) { return els.map(function (e) { return Number(e.textContent); }); });
  assert.deepStrictEqual(scores, scores.slice().sort(function (a, b) { return b - a; }), 'sorted by score');
  var warehouse = page.locator('#scan-results tr[data-sid=w1001]');
  assert.ok(/EXAMPLE LOGISTICS LLC/.test(await warehouse.innerText()), 'owner shown');
  assert.ok(/42,0\d\d ft² · built 1988/.test(await warehouse.innerText()), 'reasons shown');
  assert.ok(/Already a lead/.test(await page.locator('#scan-results tr[data-sid=w1003]').innerText()), 'hand-traced church is already a lead');

  // Sort by roof size.
  await page.click('#scan-results th[data-ssort=area]');
  var first = await page.$eval('#scan-results tbody tr', function (t) { return t.dataset.sid; });
  assert.strictEqual(first, 'r2001', 'largest roof first');
  await page.click('#scan-results th[data-ssort=area]');
  assert.notStrictEqual(await page.$eval('#scan-results tbody tr', function (t) { return t.dataset.sid; }), 'r2001', 'sort toggles');

  // 📡 Measure (Google Solar, per site).
  await page.click('#scan-results tr[data-sid=w1002] [data-act=scan-measure]');
  await page.waitForFunction(function () { return /📡 Google Solar: 41,200 ft²/.test(document.querySelector('#scan-results tr[data-sid=w1002]').innerText); });

  // Add as lead.
  await page.click('#scan-results tr[data-sid=w1001] [data-act=scan-add]');
  await page.waitForFunction(function () { return /Already a lead/.test(document.querySelector('#scan-results tr[data-sid=w1001]').innerText); }, null, { timeout: 10000 });
  var lead = posted[posted.length - 1].data;
  assert.strictEqual(lead.address, '6100 Example Rd, Bartlett, TN 38134');
  assert.strictEqual(lead.owner.company, 'EXAMPLE LOGISTICS LLC');
  assert.strictEqual(lead.ownerMail, '100 SAMPLE ST STE 200, MEMPHIS, TN 38103');
  assert.strictEqual(lead.parcel.id, 'B0158 00A001');
  assert.strictEqual(lead.source, 'scan');
  assert.strictEqual(lead.scanId, 'w1001');
  assert.ok(lead.scan.score > 0 && lead.scan.reasons.length >= 3);
  assert.ok(Math.abs(lead.areaSqft - 42000) <= 210 && lead.outline.length === 4);
  assert.ok(/OpenStreetMap/.test(lead.sourceNote));

  // 📞 Find owner contact (Tracerfy) from the scan row.
  await page.click('#scan-results tr[data-sid=w1001] [data-act=contact-find]');
  await page.waitForFunction(function () { return /3 phones/.test(document.querySelector('#scan-results tr[data-sid=w1001]').innerText); }, null, { timeout: 10000 });
  assert.ok(dialogs.some(function (m) { return /uses 1 Tracerfy lookup/.test(m) && /left this month/.test(m) && /credit balance 950/.test(m); }), 'asked first: ' + dialogs.join(' | '));
  assert.strictEqual(net.count('/trace/lookup/'), 1);

  // The lead editor shows the phones with their flags and the reminder.
  await page.click('#scan-results tr[data-sid=w1001] [data-act=open]');
  await page.waitForSelector('#contact-box .contact-list');
  var box = await page.locator('#contact-box').innerText();
  assert.ok(/On Do Not Call list/.test(box) && /Not on DNC/.test(box) && /not checked against Do Not Call/.test(box), box);
  assert.ok(/Check the National Do Not Call list before cold calls or texts/.test(box));
  assert.ok(/Trace again/.test(box));
  assert.strictEqual(await page.locator('#contact-box a[href^="tel:"]').count(), 0, 'no click-to-dial');
  assert.ok(/EXAMPLE LOGISTICS LLC/.test(await page.inputValue('#lead-form [name=o-company]')));
  await page.click('#lead-form [data-act=close]');

  // The server cannot reach any Overpass instance (all hang): the page asks Overpass itself, two
  // squares at a time; one square fails twice, is listed, and "Retry failed squares" gets it.
  MIRRORS.forEach(function (h) { net.route(h, function () { return new Promise(function () {}); }); });
  zipBox = ['35.195', '35.21', '-89.86', '-89.84'];      // 4 squares; -3594_1760 is cached already
  browserOp.failBox = '35.18,-89.875';                     // square -3595_1759 (and its quarters)
  await page.fill('#scan-where-q', '38133');
  await page.click('#scan-where button[type=submit]');
  await page.waitForFunction(function () { return /ZIP 38133/.test(document.querySelector('#scan-area-line').textContent); });
  await page.evaluate(function () {
    window.__prog = [];
    new MutationObserver(function () {
      var running = document.querySelector('[data-act=scan-run]').disabled;
      window.__prog.push({ t: document.querySelector('#scan-progress').textContent, rows: document.querySelectorAll('#scan-results tr[data-sid]').length, running: running });
    }).observe(document.querySelector('#area-scan'), { subtree: true, childList: true, characterData: true });
  });
  await page.click('[data-act=scan-run]');
  await page.waitForSelector('[data-act=scan-retry]', { timeout: 40000 });
  var prog = await page.evaluate(function () { return window.__prog; });
  assert.ok(prog.some(function (p) { return /Scanning square [1-4] of 4…/.test(p.t); }), 'progress per square: ' + prog.map(function (p) { return p.t; }).slice(0, 4).join(' | '));
  assert.ok(prog.some(function (p) { return p.running && p.rows > 0; }), 'results shown while the scan is still running');
  var failedTxt = await page.locator('#scan-failed-list').innerText();
  assert.ok(/1 map square could not be downloaded/.test(failedTxt) && /Square \d \(35\.190, -89\.86\d\)/.test(failedTxt), failedTxt);
  assert.ok(/1 map square failed/.test(await page.locator('#scan-progress').innerText()));
  assert.ok(fnFlight.max <= 2, 'at most 2 squares at a time on the server: ' + fnFlight.max);
  assert.ok(browserOp.maxInFlight <= 2, 'at most 2 Overpass requests at a time from the browser: ' + browserOp.maxInFlight);
  assert.ok(browserOp.bodies.some(function (q) { return q.indexOf('(35.18,-89.875,35.19,-89.8625)') > -1; }), 'second try asked in quarters');
  assert.ok(browserOp.bodies.every(function (q) { return /\(if:length\(\)>5\d\)/.test(q); }), 'lighter query from the browser too');
  assert.ok(net.db.cache['osm:v1:-3594_1759'] && /^browser:overpass-api\.de$/.test(net.db.cache['osm:v1:-3594_1759'].data.via), 'browser answer cached by the server');
  assert.ok(!net.db.cache['osm:v1:-3595_1759'], 'failed square not cached');
  var ids2 = await page.$$eval('#scan-results tr[data-sid]', function (trs) { return trs.map(function (t) { return t.dataset.sid; }).sort(); });
  assert.ok(ids2.indexOf('w1001') > -1, 'results from the other squares kept: ' + ids2);
  // Overpass answers again: retry only the failed square.
  browserOp.failBox = '';
  var before = browserOp.calls;
  await page.click('[data-act=scan-retry]');
  await page.waitForFunction(function () { return !document.querySelector('#scan-failed-list') && !document.querySelector('[data-act=scan-run]').disabled; }, null, { timeout: 30000 });
  assert.ok(net.db.cache['osm:v1:-3595_1759'], 'retried square cached');
  assert.strictEqual(browserOp.calls - before, 1, 'only the failed square asked again');
  assert.ok(!/failed/.test(await page.locator('#scan-progress').innerText()));
  net.route('overpass-api.de', function () { return M.json(200, JSON.parse(M.fixture('overpass-bartlett.json'))); });

  // Draw an area on the map.
  if (leafletDir) {
    await page.click('[data-act=scan-mode][data-v=draw]');
    await page.click('[data-act=scan-draw]');
    var mb = await page.locator('#map').boundingBox();
    await page.mouse.click(mb.x + 200, mb.y + 150);
    await page.mouse.click(mb.x + 500, mb.y + 400);
    await page.waitForFunction(function () { return /Drawn area/.test(document.querySelector('#scan-area-line').textContent); });
    assert.ok(await page.locator('#map .leaflet-interactive').count() >= 5, 'scan outlines drawn on the map');
    assert.ok(/OpenStreetMap contributors/.test(await page.locator('.leaflet-control-attribution').innerText()), 'OSM attribution on the map');
  }

  // Imagery switcher: on the map, remembered per person, Google through the server function.
  if (leafletDir) {
    var ctl = page.locator('#imagery-ctl');
    await ctl.waitFor();
    assert.deepStrictEqual(await page.$$eval('#imagery-src option', function (o) { return o.map(function (x) { return x.value; }); }), ['esri', 'clarity', 'google', 'wayback']);
    assert.strictEqual(await page.inputValue('#imagery-src'), 'esri', 'Esri by default');
    assert.ok(/Trees in the way\? Try 'Older \/ leaf-off' imagery or use 📡 Measure from address\./.test(await ctl.innerText()), 'tree hint on the map');
    assert.ok(imgSeen.some(function (u) { return /server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\//.test(u); }), 'Esri tiles');

    await page.selectOption('#imagery-src', 'clarity');
    await page.waitForFunction(function () { return Array.prototype.some.call(document.querySelectorAll('#map img.leaflet-tile'), function (i) { return /clarity\.maptiles\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery\/MapServer\/tile\//.test(i.src); }); });
    assert.ok(/World Imagery Clarity/.test(await page.locator('.leaflet-control-attribution').innerText()));

    await page.selectOption('#imagery-src', 'google');
    await page.waitForFunction(function () { return Array.prototype.some.call(document.querySelectorAll('#map img.leaflet-tile'), function (i) { return /\/\.netlify\/functions\/roofscout-tiles\?z=\d+&x=\d+&y=\d+&t=/.test(i.src) && i.complete && i.naturalWidth === 1; }); }, null, { timeout: 10000 });
    assert.ok(await page.locator('#map .g-mark').isVisible(), 'Google Maps mark on the map');
    assert.ok(google.tiles > 0 && google.sessions === 1, 'tiles proxied, one session');
    var srcs = await page.$$eval('#map img.leaflet-tile', function (a) { return a.map(function (i) { return i.src; }); });
    assert.ok(srcs.every(function (u) { return u.indexOf('googleapis') < 0 && u.indexOf('solar-test-key') < 0 && u.indexOf('sess-smoke') < 0; }), 'no Google key or session in the page');
    // Zoom in all the way: Google's viewport answer gives the attribution and the deepest zoom (21) → hint at 22.
    while (!(await page.locator('.leaflet-control-zoom-in').getAttribute('class')).includes('leaflet-disabled')) { await page.click('.leaflet-control-zoom-in'); await page.waitForTimeout(350); }
    await page.waitForFunction(function () { return /Imagery ©2026 Google, Smoke Test Imagery/.test(document.querySelector('.leaflet-control-attribution').textContent); }, null, { timeout: 10000 });
    await page.waitForSelector('#imagery-max:not([hidden])');
    assert.ok(/Max detail reached/.test(await page.locator('#imagery-max').innerText()));
    assert.ok(google.viewports >= 1);
    var picked = await page.evaluate(function () { return localStorage.getItem('roofscout.imagery.wjohnson@grayco-cs.com'); });
    assert.strictEqual(JSON.parse(picked).source, 'google', 'remembered for this person');
    for (var zo = 0; zo < 4; zo++) { await page.click('.leaflet-control-zoom-out'); await page.waitForTimeout(350); }
    await page.waitForSelector('#imagery-max', { state: 'hidden' });

    // Older / leaf-off: release list from Wayback's config, then the pictures that differ here.
    await page.selectOption('#imagery-src', 'wayback');
    await page.waitForFunction(function () { return document.querySelectorAll('#imagery-date option').length === 12; });
    assert.ok(/Release 2026-09-24/.test(await page.locator('#imagery-date option').first().innerText()));
    await page.click('[data-act=imagery-leafoff]');
    await page.waitForFunction(function () { return /newest winter picture of this spot \(taken 2024-01-14\)/.test(document.querySelector('#toast').textContent); }, null, { timeout: 10000 });
    var dates = await page.$$eval('#imagery-date option', function (o) { return o.map(function (x) { return x.textContent; }); });
    assert.deepStrictEqual(dates, ['Taken 2024-10-02', 'Taken 2024-01-14 🍂 leaf-off', 'Taken 2019-05-20'], dates.join(' | '));
    assert.strictEqual(await page.inputValue('#imagery-date'), '37965');
    await page.waitForFunction(function () { return Array.prototype.some.call(document.querySelectorAll('#map img.leaflet-tile'), function (i) { return /wayback\.maptiles\.arcgis\.com\/.*\/MapServer\/tile\/37965\//.test(i.src); }); });
    assert.ok(/World Imagery Wayback \(release 2024-02-08\)/.test(await page.locator('.leaflet-control-attribution').innerText()));

    // Remembered (this browser, this person) and back after leaving the map.
    assert.deepStrictEqual(JSON.parse(await page.evaluate(function () { return localStorage.getItem('roofscout.imagery.wjohnson@grayco-cs.com'); })), { source: 'wayback', release: 37965 });
    await page.click('#tabs [data-tab=leads]');
    await page.click('#tabs [data-tab=map]');
    await page.waitForSelector('#imagery-ctl #imagery-date');
    assert.strictEqual(await page.inputValue('#imagery-src'), 'wayback');
    assert.strictEqual(await page.inputValue('#imagery-date'), '37965');
    await page.selectOption('#imagery-src', 'esri');
  }

  // Settings: area scan section and the Tracerfy status.
  await page.click('#tabs [data-tab=settings]');
  await page.waitForFunction(function () { var e = document.querySelector('#skip-status'); return e && /Connected to Tracerfy/.test(e.textContent); });
  assert.ok(/Area scan/.test(await page.locator('#scan-settings').innerText()));
  await page.waitForFunction(function () { return /Scan server ready/.test(document.querySelector('#scan-status').textContent); });
  await page.waitForFunction(function () { return /Google key found\. Google tiles this month: [\d,]+ of 90,000\./.test(document.querySelector('#gtiles-usage').textContent); });
  assert.strictEqual(await page.inputValue('#settings-form [name=gtiles-limit]'), '90000');
  if (shot) {
    await page.click('#tabs [data-tab=map]');
    await page.waitForSelector('#scan-results:not([hidden])');
    await page.screenshot({ path: shot });
  }
  // Every other section still renders.
  for (var tabName of ['leads', 'calls', 'pipeline', 'activity', 'build', 'settings', 'map']) {
    await page.click('#tabs [data-tab=' + tabName + ']');
    await page.waitForSelector('#view.view-' + tabName);
  }
  assert.ok(/Scan an area \(public data\)/.test(await (async function () { await page.click('#tabs [data-tab=build]'); return page.locator('#view').innerText(); })()));
  assert.deepStrictEqual(errors, [], 'no page errors');

  // Without a Tracerfy key the button is hidden.
  delete process.env.TRACERFY_API_KEY;
  var demoDeletes = 0;
  var demoRow = { id: 'Ldemo', created_at: now, updated_at: now, created_by: ADMIN, updated_by: ADMIN,
    data: { name: 'DEMO Warehouse #001', address: 'Demo site 001', kind: 'commercial', roofType: 'tpo', areaSqft: 20000, condition: 30, stage: 'New', demo: true,
      owner: { name: 'Demo Contact 001', phone: '(901) 555-0112', email: 'demo001@example.com' } } };
  var page2 = await browser.newPage();
  await page2.addInitScript(function () {
    localStorage.setItem('gc_auth_v1', JSON.stringify({ access_token: 'tok-admin', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 36000, email: 'wjohnson@grayco-cs.com', uid: 'u1' }));
  });
  await page2.route('**/*', async function (route) {
    var url = route.request().url();
    if (url.indexOf('/.netlify/functions/roofscout-skiptrace') > -1) {
      var r = await skipFn.handler({ httpMethod: 'GET', headers: route.request().headers(), queryStringParameters: { action: 'status' } });
      return route.fulfill({ status: r.statusCode, contentType: 'application/json', body: r.body });
    }
    if (url.indexOf(SB + '/rest/v1/rs_leads') === 0) {
      if (route.request().method() === 'DELETE') { if (/Ldemo/.test(url)) demoDeletes++; return route.fulfill({ status: 204, body: '' }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.keys(rows).map(function (k) { return rows[k]; }).concat([demoRow])) });
    }
    if (url.indexOf(SB + '/rest/v1/gc_staff') === 0) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ email: ADMIN, name: 'Wesley', role: 'admin', active: true }]) });
    if (url.indexOf(SB + '/rest/v1/') === 0) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (url.indexOf(base) === 0) return route.continue();
    return route.abort();
  });
  await page2.goto(base + 'index.html');
  await page2.waitForSelector('#app:not([hidden])');
  await page2.click('#tabs [data-tab=leads]');
  await page2.click('#lead-table tr[data-id=Lchurch]');
  await page2.waitForSelector('#contact-box');
  await page2.waitForTimeout(300);
  assert.strictEqual(await page2.locator('[data-act=contact-find]').count(), 0, 'no Find owner contact without a key');
  assert.ok(/Owner phone lookup is not available: Tracerfy is not connected/.test(await page2.locator('#contact-box').innerText()), 'says why, not a silent no-op');
  assert.strictEqual(await page2.locator('#contact-box [data-act=contact-recheck]').count(), 1, 'Check again button');
  // A made-up DEMO row left in the shared table from the early test is hidden, and the admin is told.
  assert.strictEqual(await page2.locator('#lead-table tr[data-id=Ldemo]').count(), 0, 'DEMO lead hidden on the website');
  assert.ok(/1 made-up DEMO lead is still in the shared list/.test(await page2.locator('#mode-bar').innerText()), 'mode bar warns about DEMO rows');
  await page2.click('#lead-form [data-act=close]');
  page2.on('dialog', function (d) { d.accept(); });
  await page2.click('#mode-bar [data-act=clear-demo]');
  await page2.waitForFunction(function () { return /Removed 1 demo leads/.test(document.querySelector('#toast').textContent); });
  assert.strictEqual(demoDeletes, 1, 'DELETE sent for the DEMO row');
  assert.ok(!/DEMO/.test(await page2.locator('#mode-bar').innerText()), 'warning gone');

  // Local demo mode (localhost only) keeps its made-up practice scan, and has no real scan.
  var page3 = await browser.newPage();
  var errs3 = [];
  page3.on('pageerror', function (e) { errs3.push(e.message); });
  await page3.route('**/*', function (route) { return route.request().url().indexOf(base) === 0 ? route.continue() : route.abort(); });
  await page3.goto(base + 'index.html');
  await page3.click('#demo-btn');
  await page3.waitForSelector('#app:not([hidden])');
  assert.strictEqual(await page3.locator('#area-scan').count(), 0, 'no real scan in demo mode');
  await page3.click('.demo-scan summary');
  await page3.click('[data-act=scan]');
  await page3.waitForFunction(function () { return /Scan found \d+ demo sites/.test(document.querySelector('#toast').textContent); });
  assert.deepStrictEqual(errs3, [], 'demo mode: no page errors');

  await browser.close();
  srv.close();
  console.log('scan-ui smoke: all checks passed' + (leafletDir ? '' : ' (map drawing skipped: leaflet not installed)'));
}

main().catch(function (e) { console.error(e); process.exit(1); });
