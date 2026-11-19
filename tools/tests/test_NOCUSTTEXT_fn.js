/* NOCUSTTEXT (owner 11/19: "We don't tell customer anything unless we physically call or text them"): with the switch OFF (default), a new
   Google LSA / website lead texts only Wesley and Nick, and GOOD <code> <PM> does not text the customer. node tools/tests/test_NOCUSTTEXT_fn.js */
'use strict';
const assert = require('assert'); const path = require('path');
process.env.TWILIO_FROM = '+19015550999'; process.env.CRM_URL = 'https://crm.test';
const AUTO = require(path.join(__dirname, '../../netlify/functions/_lib/automations.js'));
const _on = AUTO.isOn; AUTO.isOn = async function(k, o){ return k === 'lead_customer_autotext' ? false : (k === 'staff_text_alerts' ? true : _on.call(AUTO, k, o)); };
const SA = require(path.join(__dirname, '../../netlify/functions/_lib/smsalert.js'));
const USERS = [{ name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'admin', phone: '901-555-0001', active: true },
  { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'admin', cell: '(901) 555-0002', active: true }];
const kv = {}, sent = [];
Object.assign(SA._D, { now: () => Date.parse('2026-10-29T15:00:00Z'), kvGet: async k => kv[k], kvCas: async (k, f) => { const nv = f(kv[k] == null ? null : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { ok: true, value: kv[k] }; },
  send: async (to, body) => { sent.push({ to, body }); return { ok: true }; }, paused: async () => false, optouts: async () => ({}), consentNo: async () => false,
  people: async () => ({ users: USERS, staff: [] }), vetTodo: async () => true, postReply: async m => ({ id: m.id }), hours: async () => null, lsaDecide: async d => ({ inbox: true, list: true }) });
(async () => {
  const lead = { id: 'LSA1', key: 'LSA1', title: 'Roof', source: 'Google LSA', contact: { name: 'Pat Smith', phone: '(901) 555-0111' } };
  await SA.leads([lead], { LSA1: { id: 'LSA1', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending' } } }, () => false);
  assert.ok(!sent.some(x => x.to === '9015550111'), 'no automatic text to the LSA customer: ' + JSON.stringify(sent));
  assert.ok(sent.some(x => x.to === '9015550002') && sent.some(x => x.to === '9015550001'), 'Wesley and Nick still get the lead text');
  const code = SA._lsaCode('LSA1'); sent.length = 0;
  await SA.staffInbound('9015550002', 'GOOD ' + code + ' Nick', 'SM1');
  assert.ok(!sent.some(x => x.to === '9015550111'), 'GOOD + PM does not text the customer');
  assert.ok(sent.some(x => x.to === '9015550002' && /nothing goes to the customer/.test(x.body) && !/customer are told/.test(x.body)), 'the confirmation says nothing goes to the customer: ' + JSON.stringify(sent));
  const wl = { id: 'W1', key: 'W1', title: 'Free estimate', source: 'Website (grayco-cs.com)', contact: { name: 'Jo', phone: '(901) 555-0122' } }; sent.length = 0;
  await SA.leads([wl], { W1: { id: 'W1', source: 'Website (grayco-cs.com)', leadExtra: { leadSource: 'Website (grayco-cs.com)' } } }, () => false);
  assert.ok(!sent.some(x => x.to === '9015550122'), 'no automatic text to a website lead');
  console.log('NOCUSTTEXT: all passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
