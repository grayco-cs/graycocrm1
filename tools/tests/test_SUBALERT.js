/* patch SUBALERT: a bid where GrayCo is the SUB to a GC texts only the estimator (Glenn), never the owners.
   node tools/tests/test_SUBALERT.js — mocked Twilio / KV; nothing is sent */
'use strict';
const assert = require('assert'), path = require('path');
const FN = path.join(__dirname, '../../netlify/functions');
process.env.TWILIO_FROM = '+19015550999'; process.env.CRM_URL = 'https://crm.test';
const SA = require(path.join(FN, '_lib/smsalert.js'));
const USERS = [
  { name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'admin', phone: '901-555-0001', active: true },
  { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'admin', cell: '(901) 555-0002', active: true },
  { name: 'Glenn Miller', email: 'gmiller@grayco-cs.com', role: 'Estimator', cell: '9015550005', active: true },
  { name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM', cell: '9015550003', active: true }
];
const DAY = Date.parse('2026-10-28T15:00:00Z');
function rig(o){ o = o || {}; const kv = {}, sent = [];
  Object.assign(SA._D, { now: () => DAY, kvGet: async k => kv[k], kvCas: async (k, f) => { const nv = f(kv[k] == null ? null : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { ok: true, value: kv[k] }; },
    send: async (to, body) => { sent.push({ to, body }); return { ok: true }; }, paused: async () => false, optouts: async () => o.optout || {}, consentNo: async () => false, hours: async () => null,
    people: async () => ({ users: USERS, staff: [] }), postReply: async m => ({ id: m.id }) });
  return { sent }; }
const to = r => r.sent.map(x => x.to).sort();
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
(async () => {
  // 1. a BuildingConnected sub invite with a GC → Glenn only
  let r = rig();
  await SA.leads([{ id: 'B1', key: 'B1', title: 'UrgentVet TI', source: 'BuildingConnected', contact: { name: 'Cathi Boldwyn', phone: '8473924300' } }],
    { B1: { id: 'B1', gc: 'Big GC Inc', source: 'BuildingConnected', sources: [{ name: 'BuildingConnected' }], contact: { name: 'Cathi Boldwyn', phone: '8473924300' } } }, () => false);
  ok(JSON.stringify(to(r)) === JSON.stringify(['9015550005']), 'sub invite → Glenn only, got ' + to(r));
  // 2. server called it sub → Glenn only
  r = rig();
  await SA.leads([{ id: 'B2', key: 'B2', title: 'Hollister', contact: { name: 'X' } }], { B2: { id: 'B2', bidRole: 'sub' } }, () => false);
  ok(JSON.stringify(to(r)) === JSON.stringify(['9015550005']), 'bidRole sub → Glenn only, got ' + to(r));
  // 3. a PRIME public bid → owners (not Glenn by default)
  r = rig();
  await SA.leads([{ id: 'P1', key: 'P1', title: 'County roof', contact: { name: 'County' } }], { P1: { id: 'P1', bidRole: 'prime', gc: '', source: 'DeSoto County' } }, () => false);
  ok(JSON.stringify(to(r)) === JSON.stringify(['9015550001', '9015550002']), 'prime → Nick + Wesley, got ' + to(r));
  // 4. a website lead → owners
  r = rig();
  await SA.leads([{ id: 'W1', key: 'W1', title: 'Website — roof', source: 'Website', contact: { name: 'Jane', phone: '9015550100' } }], { W1: { id: 'W1', websiteLead: true } }, () => false);
  ok(JSON.stringify(to(r)) === JSON.stringify(['9015550001', '9015550002']), 'website → Nick + Wesley, got ' + to(r));
  // 5. a sub bid assigned to a PM who is not an estimator → still the estimator(s), never the owners
  r = rig();
  await SA.leads([{ id: 'B3', key: 'B3', title: 'GC job', assigneeEmail: 'pat@grayco-cs.com', contact: { name: 'Y' } }], { B3: { id: 'B3', bidRole: 'sub' } }, () => false);
  ok(JSON.stringify(to(r)) === JSON.stringify(['9015550005']), 'sub assigned to PM → estimator, got ' + to(r));
  // 6. Glenn texted STOP → nobody (owners still not texted)
  r = rig({ optout: { '9015550005': true } });
  await SA.leads([{ id: 'B4', key: 'B4', title: 'GC job 2', contact: { name: 'Z' } }], { B4: { id: 'B4', bidRole: 'sub' } }, () => false);
  ok(r.sent.length === 0, 'opted-out estimator → no text to anyone');
  // 7. an emergency is never filtered
  r = rig();
  await SA.leads([{ id: 'E1', key: 'E1', title: 'Water', contact: { name: 'Q', phone: '9015550111' } }], { E1: { id: 'E1', bidRole: 'sub' } }, () => true);
  ok(to(r).indexOf('9015550001') >= 0, 'emergency still reaches the owners');
  console.log('SUBALERT: ' + n + ' passed');
})().catch(e => { console.error('SUBALERT FAIL', e && e.message); process.exit(1); });
