// Test helper: replaces global fetch with an in-memory Supabase (auth, the tables and RPCs the
// RoofScout functions use) plus programmable fake outside services. No network is used.
'use strict';
var fs = require('fs');
var path = require('path');

var FIX = process.env.RS_FIXTURES || path.join(__dirname, 'fixtures');
function fixture(name) { return fs.readFileSync(path.join(FIX, name), 'utf8'); }

function json(status, obj) {
  return { ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(obj); }, text: function () { return Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj)); } };
}
function text(status, t) { return { ok: status >= 200 && status < 300, status: status, text: function () { return Promise.resolve(t); }, json: function () { return Promise.resolve(JSON.parse(t)); } }; }

function create() {
  var db = {
    tokens: { 'tok-staff': 'pm@grayco-cs.com', 'tok-admin': 'wjohnson@grayco-cs.com', 'tok-stranger': 'someone@example.com' },
    staff: [{ email: 'pm@grayco-cs.com', name: 'PM', role: 'staff', active: true }, { email: 'wjohnson@grayco-cs.com', name: 'Wesley', role: 'admin', active: true }],
    settings: {},
    cache: {},          // key → { data, expires_at }
    rate: {},           // bucket → count (tests only need totals)
    usage: {},          // kind|month → count
    leads: {},          // id → data
    skip: {},           // lead → { status, result, started }
    tablesMissing: false
  };
  var calls = [];
  var routes = [];    // [{ test(url, opts), reply(url, opts) }] for outside services

  function supabase(url, opts) {
    var u = new URL(url);
    var p = u.pathname, q = u.searchParams, method = (opts && opts.method) || 'GET';
    var hdr = (opts && opts.headers) || {};
    var body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (p === '/auth/v1/user') {
      var tok = String(hdr.Authorization || '').replace(/^Bearer /, '');
      var email = db.tokens[tok];
      return email ? json(200, { id: 'u-' + email, email: email }) : json(401, { msg: 'bad jwt' });
    }
    if (db.tablesMissing && /rs_scan|rs_usage|rs_skiptrace|rpc/.test(p)) return json(404, { code: 'PGRST205' });
    if (p === '/rest/v1/gc_staff') {
      var em = String(q.get('email') || '').replace(/^eq\./, '');
      return json(200, db.staff.filter(function (s) { return s.email === em; }));
    }
    if (p === '/rest/v1/rs_settings') return json(200, [{ data: db.settings }]);
    if (p === '/rest/v1/rs_scan_cache') {
      if (method === 'GET') {
        var list = decodeURIComponent(String(q.get('key') || '')).replace(/^in\.\(|\)$/g, '').split(',').map(function (k) { return k.replace(/^"|"$/g, ''); });
        return json(200, list.filter(function (k) { return db.cache[k]; }).map(function (k) { return { key: k, data: JSON.parse(JSON.stringify(db.cache[k].data)), expires_at: db.cache[k].expires_at }; }));
      }
      if (method === 'POST') { body.forEach(function (r) { db.cache[r.key] = { data: r.data, expires_at: r.expires_at }; }); return json(201, null); }
      if (method === 'DELETE') return json(204, null);
    }
    if (p === '/rest/v1/rpc/rs_scan_take') {
      var b = body.p_bucket;
      db.rate[b] = db.rate[b] || 0;
      if (db.rate[b] >= body.p_hour_limit || db.rate[b] >= body.p_day_limit) return json(200, false);
      db.rate[b]++;
      return json(200, true);
    }
    if (p === '/rest/v1/rs_scan_rate') {
      var bk = String(q.get('bucket') || '').replace(/^eq\./, '');
      return json(200, db.rate[bk] ? [{ count: db.rate[bk] }] : []);
    }
    if (p === '/rest/v1/rs_usage') {
      var k = String(q.get('kind')).replace(/^eq\./, '') + '|' + String(q.get('month')).replace(/^eq\./, '');
      return json(200, db.usage[k] ? [{ count: db.usage[k] }] : []);
    }
    if (p === '/rest/v1/rpc/rs_bump_usage') {
      var k2 = body.p_kind + '|' + body.p_month;
      db.usage[k2] = (db.usage[k2] || 0) + 1;
      return json(200, db.usage[k2]);
    }
    if (p === '/rest/v1/rpc/rs_add_usage') {
      if (db.noAddUsage) return json(404, { code: 'PGRST202' });
      var k3 = body.p_kind + '|' + body.p_month;
      db.usage[k3] = (db.usage[k3] || 0) + body.p_n;
      return json(200, db.usage[k3]);
    }
    if (p === '/rest/v1/rs_leads') {
      var id = String(q.get('id') || '').replace(/^eq\./, '');
      return json(200, db.leads[id] ? [{ id: id, data: db.leads[id] }] : []);
    }
    // Same rules as the SQL functions in docs/roofscout-setup.sql.
    if (p === '/rest/v1/rpc/rs_skiptrace_claim') {
      var r = db.skip[body.p_lead];
      if (!r) { db.skip[body.p_lead] = { status: 'pending', result: null, started: Date.now() }; return json(200, { claimed: true }); }
      if (r.status === 'pending' && Date.now() - r.started < 120e3) return json(200, { claimed: false, busy: true });
      if (r.status === 'done' && !body.p_again) return json(200, { claimed: false, result: r.result });
      r.status = 'pending'; r.started = Date.now();
      return json(200, { claimed: true });
    }
    if (p === '/rest/v1/rpc/rs_skiptrace_finish') { var f = db.skip[body.p_lead]; f.status = 'done'; f.result = body.p_result; return json(204, null); }
    if (p === '/rest/v1/rpc/rs_skiptrace_release') {
      var g = db.skip[body.p_lead];
      if (g && g.status === 'pending') { if (g.result) g.status = 'done'; else delete db.skip[body.p_lead]; }
      return json(204, null);
    }
    return json(404, { message: 'mock: no route ' + method + ' ' + p });
  }

  function fetchMock(url, opts) {
    url = String(url);
    calls.push({ url: url, opts: opts || {} });
    if (url.indexOf('supabase.co') > -1 || url.indexOf('sb.test') > -1) return Promise.resolve(supabase(url, opts));
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].test(url, opts || {})) return Promise.resolve(routes[i].reply(url, opts || {}));
    }
    return Promise.reject(new Error('mock: network blocked for ' + url));
  }

  return {
    db: db,
    calls: calls,
    route: function (test, reply) { routes.unshift({ test: typeof test === 'function' ? test : function (u) { return u.indexOf(test) > -1; }, reply: reply }); },
    clearRoutes: function () { routes.length = 0; },
    install: function () { global.fetch = fetchMock; },
    count: function (part) { return calls.filter(function (c) { return c.url.indexOf(part) > -1; }).length; }
  };
}

function event(method, opts) {
  opts = opts || {};
  return {
    httpMethod: method,
    headers: Object.assign({ origin: 'https://roofscout.grayco-cs.com' }, opts.token ? { Authorization: 'Bearer ' + opts.token } : {}),
    queryStringParameters: opts.query || {},
    body: opts.body ? JSON.stringify(opts.body) : undefined
  };
}

module.exports = { create: create, event: event, json: json, text: text, fixture: fixture };
