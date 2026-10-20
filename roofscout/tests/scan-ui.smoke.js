// Playwright smoke test of Map → Scan an area, signed in (shared-database mode), offline.
//
//   NODE_PATH=<dir with playwright (and optionally leaflet)> node roofscout/tests/scan-ui.smoke.js [screenshot.png]
//
// The page is served from roofscout/ on 127.0.0.1. Supabase, Nominatim, Google Solar and the map
// tiles are answered by page.route; the two RoofScout server functions run in this process (the
// real handlers) with Overpass / county / Tracerfy mocked from tests/fixtures (see mock-net.js).
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
var scanFn = require('../../netlify/functions/roofscout-scan.js');
var skipFn = require('../../netlify/functions/roofscout-skiptrace.js');

var ROOT = path.join(__dirname, '..');
var SB = 'https://ieeonhpfahmwwecizdut.supabase.co';
var shot = process.argv[2] || '';

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
    if (/arcgisonline|arcgis\.com\/arcgis\/rest\/services\/(World_Imagery|Reference)/.test(url)) return route.fulfill({ status: 404, body: '' });
    if (url.indexOf('/.netlify/functions/') > -1) {
      var name = /functions\/([a-z-]+)/.exec(url)[1];
      var u = new URL(url);
      var ev = { httpMethod: method, headers: req.headers(), queryStringParameters: Object.fromEntries(u.searchParams), body: req.postData() || undefined };
      if (name === 'solar-lookup') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(method === 'GET' ? { connected: true, usedThisMonth: 3, limit: 500 } : { found: true, areaSqft: 41200, pitch: 0, segments: 2, imageryDate: '2024-05-01', imageryQuality: 'HIGH', usedThisMonth: 4, limit: 500 }) });
      var h = name === 'roofscout-scan' ? scanFn : name === 'roofscout-skiptrace' ? skipFn : null;
      if (!h) return route.fulfill({ status: 404, body: '' });
      var r = await h.handler(ev);
      return route.fulfill({ status: r.statusCode, contentType: 'application/json', body: r.body });
    }
    if (url.indexOf('nominatim.openstreetmap.org') > -1) {
      if (url.indexOf('/reverse') > -1) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: '', address: { house_number: '6100', road: 'Example Road', city: 'Bartlett', 'ISO3166-2-lvl4': 'US-TN', postcode: '38134' } }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ display_name: '38134, Bartlett, TN', lat: '35.206', lon: '-89.8435', boundingbox: ['35.2035', '35.2085', '-89.8462', '-89.8405'] }]) });
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
  await page.waitForFunction(function () { return /Google: 41,200 ft²/.test(document.querySelector('#scan-results tr[data-sid=w1002]').innerText); });

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

  // Settings: area scan section and the Tracerfy status.
  await page.click('#tabs [data-tab=settings]');
  await page.waitForFunction(function () { var e = document.querySelector('#skip-status'); return e && /Connected to Tracerfy/.test(e.textContent); });
  assert.ok(/Area scan/.test(await page.locator('#scan-settings').innerText()));
  await page.waitForFunction(function () { return /Scan server ready/.test(document.querySelector('#scan-status').textContent); });
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
