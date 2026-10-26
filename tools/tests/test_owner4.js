/* patch OWNER4 tests: node tools/tests/test_owner4.js — emergency routing with mocked fetch / KV */
'use strict';
const assert = require('assert');
const path = require('path');
const BA = require(path.join(__dirname, '../../netlify/functions/_lib/bid-alerts.js'));
const E = require(path.join(__dirname, '../../netlify/functions/_lib/emergency.js'));
const X = require(path.join(__dirname, '../../netlify/functions/_lib/x10.js'));
const ENV = { RESEND_API_KEY: 'k', OWNER_EMAILS: 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com', BID_ALERT_TO: '', CRM_URL: 'https://crm.test' };
function rig(o){
  o = o || {};
  const kv = { gc_lead_inbox_settings: o.settings, users: o.users || [] };
  const sent = [];
  global.fetch = async (url, init) => { if (/resend/.test(url)) { sent.push(JSON.parse(init.body)); return { ok: true, status: 200 }; } return { ok: false, status: 404, json: async () => [] }; };
  const store = { gc_x10_oncall: { rotation: [o.oncall || { email: 'pat@grayco-cs.com', name: 'Pat PM', phone: '9015550101' }], startDate: '2026-01-05', on: true, weekends: true } };
  const sb = async p => {
    const m = /^gc_kv\?select=value&key=eq\.(.+)$/.exec(p);
    if (m) { const k = decodeURIComponent(m[1]); return { ok: true, json: async () => (k in kv && kv[k] !== undefined ? [{ value: kv[k] }] : []) }; }
    if (/^gc_staff/.test(p)) return { ok: true, json: async () => [{ email: 'wjohnson@grayco-cs.com', role: 'admin', active: true }, { email: 'nthomas@grayco-cs.com', role: 'admin', active: true }, { email: 'sam.admin@grayco-cs.com', role: 'admin', active: true }] };
    return { ok: false, json: async () => [] };
  };
  const A = BA.make({ env: k => (ENV[k] != null ? ENV[k] : ''), s: v => (v == null ? '' : String(v).trim()), low: v => (v == null ? '' : String(v).trim().toLowerCase()), arr: v => (Array.isArray(v) ? v : []),
    nowIso: () => new Date().toISOString(), sb, kvGet: async k => store[k], kvCas: async (k, fn) => { const nv = fn(store[k]); if (nv !== undefined) store[k] = nv; return { value: store[k] }; }, now: () => Date.now() });
  return { A, sent };
}
const em = r => r.sent.filter(b => /EMERGENCY/.test(b.subject));
const lead = (id, title, detail) => ({ id, title, source: 'Website', origin: 'website', detail: detail || '', contact: { name: 'Zed', phone: '555' } });
const has = (to, e) => to.includes(e);
(async () => {
  /* classification */
  [['Tree fell on my house', false], ['Tree down on the roof, urgent', false], ['storm damage hail emergency', false], ['Emergency please call', false],
   ['Tree fell on the roof and water is coming in', true], ['Roof leaking into kitchen emergency', true], ['house fire smoke damage', true], ['Burst pipe flooding basement', true],
   ['Sewage backup emergency', true], ['Storm damage, ceiling dripping, need dry-out', true], ['mold emergency in the attic', true]]
    .forEach(([t, want]) => { assert.ok(E.isEmergency({ title: t }), 'is emergency: ' + t); assert.strictEqual(E.isMitigation({ title: t }), want, 'mitigation(' + t + ')'); });
  assert.ok(!E.isMitigation({ title: 'Bid for new roof' }));

  /* 1. general emergency (tree only): on-call + office only; NOT Nick / Wesley / other admins */
  let r = rig();
  await r.A.notifyNew([lead('g1', 'Tree fell on my house', 'tree fell on the house, please call')]);
  assert.strictEqual(em(r).length, 1);
  let to = em(r)[0].to.slice().sort();
  assert.deepStrictEqual(to, ['office@grayco-cs.com', 'pat@grayco-cs.com']);

  /* 2. mitigation emergency: office + Nick + Wesley (prefilled) + on-call; no other admin */
  r = rig();
  await r.A.notifyNew([lead('m1', 'Water coming in, burst pipe', 'flood in the kitchen')]);
  to = em(r)[0].to.slice().sort();
  assert.deepStrictEqual(to, ['nthomas@grayco-cs.com', 'office@grayco-cs.com', 'pat@grayco-cs.com', 'wjohnson@grayco-cs.com']);
  assert.ok(!has(to, 'sam.admin@grayco-cs.com'));
  assert.deepStrictEqual((await r.A.mitigationList()).sort(), ['nthomas@grayco-cs.com', 'wjohnson@grayco-cs.com']);   /* the setting is prefilled */

  /* 3. mitigation manager added in the setting (+ a Mitigation Manager user) */
  r = rig({ settings: { mitigationTo: ['nthomas@grayco-cs.com', 'wjohnson@grayco-cs.com', 'mia.mit@grayco-cs.com'] }, users: [{ name: 'Gus', email: 'gus@grayco-cs.com', role: 'Mitigation Manager', active: true }, { name: 'Tech', email: 'tech@grayco-cs.com', role: 'Mitigation', active: true }] });
  await r.A.notifyNew([lead('m2', 'House fire, smoke everywhere', 'fire last night')]);
  to = em(r)[0].to;
  ['mia.mit@grayco-cs.com', 'gus@grayco-cs.com', 'nthomas@grayco-cs.com', 'wjohnson@grayco-cs.com', 'office@grayco-cs.com', 'pat@grayco-cs.com'].forEach(e => assert.ok(has(to, e), e));
  assert.ok(!has(to, 'tech@grayco-cs.com'), 'a plain Mitigation tech is not the manager');
  /* a general emergency does not reach the mitigation list */
  r = rig({ settings: { mitigationTo: ['mia.mit@grayco-cs.com'] } });
  await r.A.notifyNew([lead('g2', 'Tree on the house', 'tree fell on my home')]);
  assert.ok(!has(em(r)[0].to, 'mia.mit@grayco-cs.com'));

  /* 4. the general list "Emergencies also go to:" defaults empty; an address added there receives general (and mitigation) emergencies */
  r = rig();
  assert.deepStrictEqual(await r.A.emergencyList(), []);
  r = rig({ settings: { emergenciesTo: ['Nick@grayco-cs.com', 'bad address'] } });
  await r.A.notifyNew([lead('g3', 'Tree fell on my house', 'tree fell on my house')]);
  to = em(r)[0].to.slice().sort();
  assert.deepStrictEqual(to, ['nick@grayco-cs.com', 'office@grayco-cs.com', 'pat@grayco-cs.com']);
  r = rig({ settings: { emergenciesTo: ['nick@grayco-cs.com'] } });
  await r.A.notifyNew([lead('m3', 'Burst pipe flood', 'water everywhere')]);
  assert.ok(has(em(r)[0].to, 'nick@grayco-cs.com') && has(em(r)[0].to, 'wjohnson@grayco-cs.com'));

  /* 5. Nick or Wesley on call: they get the general emergency as the on-call person */
  r = rig({ oncall: { email: 'wjohnson@grayco-cs.com', name: 'Wesley', phone: '9015550102' } });
  await r.A.notifyNew([lead('g4', 'Tree fell on my house', 'tree fell on my house')]);
  to = em(r)[0].to.slice().sort();
  assert.deepStrictEqual(to, ['office@grayco-cs.com', 'wjohnson@grayco-cs.com']);

  /* 6. the office setting is honoured; no OWNER_EMAILS blast */
  r = rig({ settings: { alertTo: ['leads@grayco-cs.com'] } });
  await r.A.notifyNew([lead('g5', 'Tree fell on my house', 'tree fell on my house')]);
  assert.deepStrictEqual(em(r)[0].to.slice().sort(), ['leads@grayco-cs.com', 'pat@grayco-cs.com']);
  console.log('owner4 tests: all passed');
})().catch(e => { console.error(e); process.exit(1); });
