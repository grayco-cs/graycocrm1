// Run with:  node roofscout/tests/skiptrace.test.js
// netlify/functions/roofscout-skiptrace.js with a mocked Supabase and a mocked Tracerfy.
'use strict';
var assert = require('assert');
var M = require('./mock-net.js');

process.env.SUPABASE_URL = 'https://x.sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc';
delete process.env.TRACERFY_API_URL;
var fn = require('../../netlify/functions/roofscout-skiptrace.js');
var MONTH = new Date().toISOString().slice(0, 7);

// Shaped like Tracerfy's documented /trace/lookup/ answer.
var HIT = {
  address: '6000 Stage Rd', city: 'Bartlett', state: 'TN', zip: '38134', hit: true, persons_count: 2, credits_deducted: 5,
  persons: [
    { first_name: 'Pat', last_name: 'Example', full_name: 'Pat Example', age: 58, deceased: false, property_owner: true, litigator: false,
      mailing_address: { street: 'PO Box 1234', city: 'Nashville', state: 'TN', zip: '37201' },
      phones: [
        { number: '9015550142', type: 'Mobile', dnc: false, tcpa: false, carrier: 'Example Wireless', rank: 1 },
        { number: '(901) 555-0177', type: 'Landline', dnc: true, tcpa: false, rank: 2 },
        { number: '901-555-0142', type: 'Mobile', dnc: false, rank: 3 }
      ],
      emails: [{ email: 'Pat@Example.com', rank: 1 }, { email: 'not-an-email', rank: 2 }] },
    { full_name: 'Lee Example', litigator: true, phones: [{ number: '9015550199', type: 'Mobile', tcpa: true }, '9015550123'], emails: ['lee@example.com'] }
  ]
};

var tracer;   // { status, body, delay } for the next Tracerfy answers
function setup(opts) {
  opts = opts || {};
  if (opts.key === false) delete process.env.TRACERFY_API_KEY; else process.env.TRACERFY_API_KEY = 'tf-secret-key';
  var net = M.create();
  net.install();
  tracer = { status: 200, body: HIT, delay: 0 };
  net.route('tracerfy.com/v1/api/trace/lookup/', function () {
    var t = tracer;
    return new Promise(function (res) { setTimeout(function () { res(M.json(t.status, t.body)); }, t.delay); });
  });
  net.route('tracerfy.com/v1/api/analytics/', function () { return M.json(200, { total_jobs: 3, properties_traced: 40, credit_balance: 1234 }); });
  net.db.leads.L1 = { name: 'Example Plaza', address: '6000 Stage Rd, Bartlett, TN 38134', owner: { company: 'EXAMPLE PLAZA PARTNERS LP' }, ownerMail: 'PO Box 1234, Nashville, TN 37201', parcel: { id: 'B0158 00A002' } };
  net.db.leads.L2 = { name: 'Example Distribution', address: '6100 Example Rd, Bartlett, TN 38134', owner: { company: 'EXAMPLE LOGISTICS LLC' } };
  return net;
}
function call(method, opts) { return fn.handler(M.event(method, opts)).then(function (r) { r.json = JSON.parse(r.body || 'null'); return r; }); }
function trace(body, token) { return call('POST', { token: token || 'tok-staff', body: body }); }
function lookups(net) { return net.count('/trace/lookup/'); }

var tests = [];
function test(name, f) { tests.push({ name: name, f: f }); }

test('auth: no token 401, not staff 403', async function () {
  setup();
  assert.strictEqual((await call('POST', { body: { leadId: 'L1' } })).statusCode, 401);
  assert.strictEqual((await trace({ leadId: 'L1' }, 'tok-stranger')).statusCode, 403);
});

test('no key: status says not connected, lookups refused, key never sent to the browser', async function () {
  var net = setup({ key: false });
  var s = await call('GET', { token: 'tok-staff', query: { action: 'status' } });
  assert.deepStrictEqual(s.json, { connected: false, usedThisMonth: 0, limit: 200, balance: null });
  var r = await trace({ leadId: 'L1' });
  assert.strictEqual(r.statusCode, 503);
  assert.strictEqual(r.json.code, 'not-connected');
  assert.strictEqual(lookups(net), 0);
  setup();
  s = await call('GET', { token: 'tok-staff', query: { action: 'status' } });
  assert.strictEqual(s.json.connected, true);
  assert.strictEqual(s.json.balance, 1234, 'credit balance from /analytics/');
  assert.ok(s.body.indexOf('tf-secret-key') < 0);
});

test('success: normalized phones/emails with DNC + litigator flags, counted once', async function () {
  var net = setup();
  var r = await trace({ leadId: 'L1' });
  assert.strictEqual(r.statusCode, 200, r.body);
  var c = r.json.contact;
  assert.strictEqual(c.hit, true);
  assert.strictEqual(c.source, 'Tracerfy');
  assert.ok(c.fetchedAt);
  assert.deepStrictEqual(c.phones.map(function (p) { return [p.number, p.type, p.dnc, p.litigator]; }), [
    ['(901) 555-0142', 'Mobile', false, false],
    ['(901) 555-0177', 'Landline', true, false],
    ['(901) 555-0199', 'Mobile', null, true],
    ['(901) 555-0123', '', null, true]
  ], 'duplicates dropped; unknown DNC is null ("not checked"); litigator from tcpa or the person');
  assert.deepStrictEqual(c.emails, ['pat@example.com', 'lee@example.com']);
  assert.strictEqual(c.names[0].name, 'Pat Example');
  assert.strictEqual(r.json.usedThisMonth, 1);
  assert.strictEqual(net.db.usage['tracerfy|' + MONTH], 1);
  var call0 = net.calls.filter(function (x) { return x.url.indexOf('/trace/lookup/') > -1; })[0];
  assert.strictEqual(call0.url, 'https://tracerfy.com/v1/api/trace/lookup/');
  assert.strictEqual(call0.opts.headers.Authorization, 'Bearer tf-secret-key');
  assert.deepStrictEqual(JSON.parse(call0.opts.body), { address: '6000 Stage Rd', city: 'Bartlett', state: 'TN', zip: '38134', find_owner: true });
  assert.ok(r.body.indexOf('tf-secret-key') < 0, 'key not in the answer');
});

test('one lookup per lead: second click is the saved answer, free', async function () {
  var net = setup();
  await trace({ leadId: 'L1' });
  var r = await trace({ leadId: 'L1' });
  assert.strictEqual(r.json.cached, true);
  assert.strictEqual(r.json.contact.phones.length, 4);
  assert.strictEqual(lookups(net), 1);
  assert.strictEqual(net.db.usage['tracerfy|' + MONTH], 1);
  var again = await trace({ leadId: 'L1', again: true });
  assert.strictEqual(again.json.cached, false, '"Trace again" asks Tracerfy again');
  assert.strictEqual(lookups(net), 2);
  assert.strictEqual(net.db.usage['tracerfy|' + MONTH], 2);
});

test('two clicks at once: only one paid lookup', async function () {
  var net = setup();
  tracer.delay = 50;
  var both = await Promise.all([trace({ leadId: 'L2' }), trace({ leadId: 'L2' })]);
  var codes = both.map(function (r) { return r.statusCode; }).sort();
  assert.deepStrictEqual(codes, [200, 409]);
  assert.strictEqual(both.filter(function (r) { return r.statusCode === 409; })[0].json.code, 'busy');
  assert.strictEqual(lookups(net), 1);
  var after = await trace({ leadId: 'L2' });
  assert.strictEqual(after.json.cached, true);
  assert.strictEqual(lookups(net), 1);
});

test('no match: free, not counted, remembered', async function () {
  var net = setup();
  tracer.body = { hit: false, persons_count: 0, credits_deducted: 0, persons: [] };
  var r = await trace({ leadId: 'L1' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.json.contact.hit, false);
  assert.deepStrictEqual(r.json.contact.phones, []);
  assert.strictEqual(net.db.usage['tracerfy|' + MONTH], undefined);
  assert.strictEqual((await trace({ leadId: 'L1' })).json.cached, true);
  assert.strictEqual(lookups(net), 1);
});

test('errors: out of credits, rate limit, bad key — nothing saved, claim released', async function () {
  var cases = [
    [402, { detail: 'Insufficient credits' }, 402, 'no-credits'],
    [400, { error: 'Not enough credits on account' }, 402, 'no-credits'],
    [429, { detail: 'Too many requests', lookups_in_window: 500 }, 429, 'rate-limit'],
    [401, { detail: 'Invalid token.' }, 502, 'bad-key']
  ];
  for (var i = 0; i < cases.length; i++) {
    var net = setup();
    tracer.status = cases[i][0]; tracer.body = cases[i][1];
    var r = await trace({ leadId: 'L1' });
    assert.strictEqual(r.statusCode, cases[i][2], JSON.stringify(cases[i]) + ' → ' + r.body);
    assert.strictEqual(r.json.code, cases[i][3]);
    assert.strictEqual(net.db.skip.L1, undefined, 'released, so it can be tried again');
    assert.strictEqual(net.db.usage['tracerfy|' + MONTH], undefined, 'not counted');
    tracer.status = 200; tracer.body = HIT;
    assert.strictEqual((await trace({ leadId: 'L1' })).json.cached, false, 'works after the error');
  }
  // A failed "Trace again" keeps the earlier answer.
  var n2 = setup();
  await trace({ leadId: 'L1' });
  tracer.status = 429; tracer.body = {};
  assert.strictEqual((await trace({ leadId: 'L1', again: true })).statusCode, 429);
  assert.strictEqual(n2.db.skip.L1.status, 'done');
  assert.strictEqual((await trace({ leadId: 'L1' })).json.contact.phones.length, 4);
});

test('monthly cap from Settings', async function () {
  var net = setup();
  net.db.settings = { skiptrace: { monthlyLimit: 1 } };
  net.db.usage['tracerfy|' + MONTH] = 1;
  var r = await trace({ leadId: 'L1' });
  assert.strictEqual(r.statusCode, 429);
  assert.strictEqual(r.json.code, 'limit');
  assert.strictEqual(lookups(net), 0);
  assert.strictEqual(net.db.skip.L1, undefined);
  net.db.settings = { skiptrace: { monthlyLimit: 0 } };
  net.db.usage = {};
  assert.strictEqual((await trace({ leadId: 'L1' })).json.code, 'limit', 'limit 0 = off');
});

test('do not contact: per-lead flag and the do-not-contact list', async function () {
  var net = setup();
  net.db.leads.L1.doNotContact = true;
  var r = await trace({ leadId: 'L1' });
  assert.strictEqual(r.statusCode, 403);
  assert.strictEqual(r.json.code, 'do-not-contact');
  net.db.settings = { areaScan: { doNotContact: 'Example Logistics, LLC' } };
  r = await trace({ leadId: 'L2' });
  assert.strictEqual(r.json.code, 'do-not-contact', 'owner on the list');
  net.db.settings = { areaScan: { doNotContact: 'B0158-00A002' } };
  delete net.db.leads.L1.doNotContact;
  assert.strictEqual((await trace({ leadId: 'L1' })).json.code, 'do-not-contact', 'parcel on the list');
  assert.strictEqual(lookups(net), 0);
});

test('inputs: unsaved lead, bad id, unusable address', async function () {
  var net = setup();
  assert.strictEqual((await trace({ leadId: 'nope' })).json.code, 'no-lead');
  assert.strictEqual((await trace({ leadId: '../x' })).statusCode, 400);
  net.db.leads.L3 = { address: 'Stage Road', owner: {} };
  assert.strictEqual((await trace({ leadId: 'L3' })).json.code, 'address');
  net.db.leads.L4 = { address: 'somewhere', ownerMail: '100 Sample St, Memphis, TN 38103', owner: {} };
  var r = await trace({ leadId: 'L4' });
  assert.strictEqual(r.statusCode, 200, 'falls back to the mailing address');
  assert.strictEqual(fn._splitAddress('4014 Broadway Road, Bartlett TN 38135').city, 'Bartlett');
  assert.deepStrictEqual(fn._splitAddress('6000 Stage Rd, Bartlett, TN'), { address: '6000 Stage Rd', city: 'Bartlett', state: 'TN', zip: '' });
});

(async function () {
  for (var i = 0; i < tests.length; i++) {
    try { await tests[i].f(); }
    catch (e) { console.error('FAIL: ' + tests[i].name); throw e; }
  }
  console.log('skiptrace function: all ' + tests.length + ' tests passed');
})().catch(function (e) { console.error(e); process.exit(1); });
