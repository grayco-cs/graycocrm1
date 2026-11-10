/* patch LSATEXT tests: node tools/tests/test_LSATEXT.js — Google LSA lead → Wesley's and Nick's cells; they text back GOOD / BAD (mocked; nothing sent) */
'use strict';
const assert = require('assert');
const path = require('path');
process.env.TWILIO_FROM = '+19015550999'; process.env.CRM_URL = 'https://crm.test';
const SA = require(path.join(__dirname, '../../netlify/functions/_lib/smsalert.js'));
const USERS = [{ name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'admin', phone: '901-555-0001', active: true },
  { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'admin', cell: '(901) 555-0002', active: true },
  { name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM', cell: '9015550003', active: true }];
const NIGHT = Date.parse('2026-10-29T08:00:00Z');   /* 3 AM Central: an LSA text still goes */
const kv = {}, sent = [], decided = [];
let t = NIGHT;
Object.assign(SA._D, { now: () => t, kvGet: async k => kv[k], kvCas: async (k, f) => { const nv = f(kv[k] == null ? null : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { ok: true, value: kv[k] }; },
  send: async (to, body) => { sent.push({ to, body }); return { ok: true }; }, paused: async () => false, optouts: async () => ({}), consentNo: async () => false,
  people: async () => ({ users: USERS, staff: [] }), postReply: async m => ({ id: m.id }), hours: async () => null, lsaDecide: async d => { decided.push(d); return { inbox: true, list: true, todo: !d.good }; } });
(async () => {
  const lead = { id: 'LSA1', key: 'LSA1', title: 'Roof replacement', source: 'Google LSA', contact: { name: 'Pat Smith', phone: '(901) 555-0111' } };
  await SA.leads([lead], { LSA1: { id: 'LSA1', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', said: { message: 'Need a new roof' } } } }, () => false);
  const code = SA._lsaCode('LSA1');
  assert.deepStrictEqual(sent.map(x => x.to).sort(), ['9015550001', '9015550002'], 'Nick and Wesley get it (even at 3 AM), not the PM');
  assert.ok(new RegExp('^GrayCo GOOGLE LSA LEAD ' + code + ': Pat Smith \\(901\\) 555-0111 — "Need a new roof" Reply GOOD ' + code + ' or BAD ' + code + ' \\+ why\\.').test(sent[0].body) && sent[0].body.length <= 300, sent[0].body);
  sent.length = 0;
  /* Wesley texts "bad spam call" (no code: the newest LSA lead sent to his phone) */
  let r = await SA.staffInbound('9015550002', 'Bad spam call', 'SM1');
  assert.ok(r && r.lsa === 'LSA1' && r.good === false && r.reason === 'spam call', JSON.stringify(r));
  assert.ok(decided[0].good === false && decided[0].reason === 'spam call' && decided[0].byEmail === 'wjohnson@grayco-cs.com');
  assert.ok(/marked BAD \(spam call\)/.test(sent[0].body) && sent[0].to === '9015550002', 'he gets a confirmation');
  /* Nick texts "GOOD <code>" */
  sent.length = 0; t += 60000;
  r = await SA.staffInbound('9015550001', 'good ' + code, 'SM2');
  assert.ok(r && r.lsa === 'LSA1' && r.good === true && decided[1].good === true, JSON.stringify(r));
  /* the same message twice is handled once */
  r = await SA.staffInbound('9015550001', 'good ' + code, 'SM2');
  assert.ok(r && r.skipped === 'already handled');
  /* some other text from a staff phone is not an LSA answer */
  r = await SA.staffInbound('9015550001', 'on my way', 'SM3');
  assert.ok(!r || !r.lsa, 'not an LSA answer');
  /* after 72 h the code is gone */
  t += 73 * 3600e3;
  r = await SA.staffInbound('9015550002', 'GOOD', 'SM4');
  assert.ok(!r || !r.lsa, 'expired');
  /* a normal lead still goes the normal way */
  sent.length = 0; t = Date.parse('2026-10-28T15:00:00Z');
  await SA.leads([{ id: 'N1', key: 'N1', title: 'Kitchen', contact: { name: 'Al', phone: '9015550122' } }], { N1: { id: 'N1' } }, () => false);
  assert.ok(sent.length && /^GrayCo NEW LEAD/.test(sent[0].body));
  console.log('LSATEXT tests: all passed');
})().catch(e => { console.error(e); process.exit(1); });
