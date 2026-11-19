/* NOCUSTTEXT → CUSTTEXT2 (owner 11/19, later the same day: "if the lead is good, a PM will reach out shortly" from the GrayCo number, and the
   qualify texts "vet our calls better"). Two switches, both ON by default: "Lead: thanks / tell us what you need (qualify ask)" (lead_qualify_text)
   and "Lead: PM will reach out shortly (on GOOD)" (lead_good_text); the PM's name / number only with a third switch (lead_good_text_pm, OFF).
   Both still obey data-entry mode and the customer quiet hours (tagged 'customer'). node tools/tests/test_NOCUSTTEXT_fn.js */
'use strict';
const assert = require('assert'); const path = require('path');
process.env.TWILIO_FROM = '+19015550999'; process.env.CRM_URL = 'https://crm.test';
const AUTO = require(path.join(__dirname, '../../netlify/functions/_lib/automations.js'));
let SW = Object.assign(AUTO.defaults(), { staff_text_alerts: true });
AUTO._t.setStore({ get: async k => k === AUTO.KEY ? SW : null, put: async () => true });
const setSw = o => { SW = Object.assign({}, SW, o); AUTO._t.reset(); };
const SA = require(path.join(__dirname, '../../netlify/functions/_lib/smsalert.js'));
const USERS = [{ name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'admin', phone: '901-555-0001', active: true },
  { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'admin', cell: '(901) 555-0002', active: true },
  { name: 'Pat Miller', email: 'pat@grayco-cs.com', role: 'Project Manager', cell: '(901) 555-0003', active: true }];
const kv = {}, sent = []; let paused = false, inbox = [];
Object.assign(SA._D, { now: () => Date.parse('2026-10-29T15:00:00Z'), kvGet: async k => kv[k], kvCas: async (k, f) => { const nv = f(kv[k] == null ? null : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { ok: true, value: kv[k] }; },
  send: async (to, body, from, tag) => { sent.push({ to, body, tag }); return { ok: true }; }, paused: async () => paused, optouts: async () => ({}), consentNo: async () => false,
  people: async () => ({ users: USERS, staff: [] }), vetTodo: async () => true, postReply: async m => ({ id: m.id }), hours: async () => null, lsaDecide: async d => ({ inbox: true, list: true }),
  inboxLead: async id => inbox.find(x => x.id === id) || null, tasksDone: async () => ({ ok: true }), intakeTodo: async () => ({ ok: true }) });
const cust = ph => sent.filter(x => x.to === ph);
(async () => {
  assert.ok(AUTO.defaults().lead_qualify_text === true && AUTO.defaults().lead_good_text === true && AUTO.defaults().lead_good_text_pm === false && !('lead_customer_autotext' in AUTO.defaults()), 'the switches and their defaults');
  assert.ok(/qualify ask/.test(AUTO.BY.lead_qualify_text.name) && /PM will reach out shortly/.test(AUTO.BY.lead_good_text.name), 'the names the owner asked for');
  /* 1. a new LSA lead: the owners + the qualify ask (tagged customer: the quiet hours hold it) */
  const lead = { id: 'LSA1', key: 'LSA1', title: 'Roof', source: 'Google LSA', contact: { name: 'Pat Smith', phone: '(901) 555-0111' } };
  inbox = [{ id: 'LSA1', source: 'Google LSA', contact: lead.contact, leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending' } }];
  await SA.leads([lead], { LSA1: inbox[0] }, () => false);
  assert.ok(sent.some(x => x.to === '9015550002') && sent.some(x => x.to === '9015550001'), 'Wesley and Nick get the lead text');
  assert.ok(cust('9015550111').length === 1 && /Reply YES to confirm you'd like a call and a GrayCo project manager will reach out to you shortly/.test(cust('9015550111')[0].body) && cust('9015550111')[0].tag === 'customer', 'the qualify ask, tagged customer (quiet hours), no PM name promised: ' + JSON.stringify(cust('9015550111')));
  /* 2. GOOD <code> <PM> → "a PM will reach out shortly", no name / number */
  const code = SA._lsaCode('LSA1'); sent.length = 0;
  await SA.staffInbound('9015550002', 'GOOD ' + code + ' Pat', 'SM1');
  const g = cust('9015550111');
  assert.ok(g.length === 1 && /^Hi Pat, thanks for reaching out to GrayCo Construction Services\. A project manager will reach out to you shortly\.$/.test(g[0].body) && g[0].tag === 'customer', 'GOOD → "a PM will reach out shortly" (no name, no number): ' + JSON.stringify(sent));
  assert.ok(sent.some(x => x.to === '9015550002' && /the customer is told a PM will reach out shortly/.test(x.body)), 'the confirmation says what the customer was told: ' + JSON.stringify(sent));
  /* 3. the third switch → the PM's name and number */
  setSw({ lead_good_text_pm: true }); inbox.push({ id: 'LSA2', source: 'Google LSA', contact: { name: 'Al Roe', phone: '(901) 555-0122' }, leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending' } }); sent.length = 0;
  await SA.lsaPmText(inbox[1], { assignee: 'Pat Miller', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(/your GrayCo project manager is Pat Miller — \(901\) 555-0003/.test((cust('9015550122')[0] || {}).body || ''), 'lead_good_text_pm ON → the PM is named: ' + JSON.stringify(sent));
  setSw({ lead_good_text_pm: false });
  /* 4. data-entry mode: nothing to the customer (the owners still get their text) */
  paused = true; sent.length = 0;
  const w0 = { id: 'W0', key: 'W0', title: 'Free estimate', source: 'Website (grayco-cs.com)', contact: { name: 'Jo', phone: '(901) 555-0133' } };
  await SA.leads([w0], { W0: { id: 'W0', source: 'Website (grayco-cs.com)', websiteLead: true, leadExtra: { leadSource: 'Website (grayco-cs.com)' } } }, () => false);
  inbox.push({ id: 'W0', source: 'Website (grayco-cs.com)', websiteLead: true, contact: w0.contact });
  await SA.lsaPmText(inbox[2], { assignee: 'Pat Miller', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(!cust('9015550133').length && sent.some(x => x.to === '9015550002'), 'data-entry mode: nothing to the customer (the owners still get the lead): ' + JSON.stringify(sent));
  paused = false;
  /* 5. both switches OFF → nothing to a customer */
  setSw({ lead_qualify_text: false, lead_good_text: false }); sent.length = 0;
  const w1 = { id: 'W1', key: 'W1', title: 'Free estimate', source: 'Website (grayco-cs.com)', contact: { name: 'Jo', phone: '(901) 555-0144' } };
  await SA.leads([w1], { W1: { id: 'W1', source: 'Website (grayco-cs.com)', leadExtra: { leadSource: 'Website (grayco-cs.com)' } } }, () => false);
  await SA.lsaPmText({ id: 'W1', source: 'Website (grayco-cs.com)', websiteLead: true, contact: w1.contact }, { assignee: 'Pat Miller', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(!cust('9015550144').length, 'switches OFF → no text to the customer');
  console.log('NOCUSTTEXT / CUSTTEXT2: all passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
