/* TEXTFIRST (owner 11/10): whoever gets a lead / CRM alert by text gets no e-mail / push for it too. node tools/tests/test_TEXTFIRST.js (mocked; nothing sent) */
'use strict';
const assert = require('assert'), path = require('path');
process.env.TWILIO_FROM = '+19015550999'; process.env.RESEND_API_KEY = 'k';
const SA = require(path.join(__dirname, '../../netlify/functions/_lib/smsalert.js'));
const BA = require(path.join(__dirname, '../../netlify/functions/_lib/bid-alerts.js'));
const USERS = [{ name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'admin', cell: '9015550001', active: true },
  { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'admin', cell: '9015550002', active: true },
  { name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM', cell: '9015550003', active: true }];
const skv = {}, texts = [], mails = [];
Object.assign(SA._D, { now: () => Date.parse('2026-11-10T18:00:00Z'),   /* a Tuesday noon Central: the office is open */ kvGet: async k => skv[k], kvCas: async (k, f) => { const nv = f(skv[k] == null ? null : JSON.parse(JSON.stringify(skv[k]))); if (nv !== undefined) skv[k] = nv; return { ok: true, value: skv[k] }; },
  send: async (to, body) => { texts.push({ to, body }); return { ok: true }; }, paused: async () => false, optouts: async () => ({}), consentNo: async () => false,
  people: async () => ({ users: USERS, staff: [] }), hours: async () => null, postReply: async m => ({ id: m.id }), lsaDecide: async () => ({ inbox: true }), textLog: async row => { tlog.push(row); return true; }, vetTodo: async o => { vets.push(o); return true; } });
const vets = [];
const tlog = [];
global.fetch = async (url, init) => { if (/resend/.test(url)) { mails.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ id: 'x' }) }; } return { ok: false, status: 404, json: async () => [] }; };
const store = {}, kv = { gc_lead_inbox_settings: { alertTo: ['none'] }, users: USERS };
const sb = async p => { const m = /^gc_kv\?select=value&key=eq\.(.+)$/.exec(p); if (m) { const k = decodeURIComponent(m[1]); return { ok: true, json: async () => (k in kv ? [{ value: kv[k] }] : []) }; } return { ok: false, json: async () => [] }; };
const ENV = { RESEND_API_KEY: 'k', OWNER_EMAILS: '', CRM_URL: 'https://crm.test' };
const A = BA.make({ env: k => ENV[k] != null ? ENV[k] : '', s: v => v == null ? '' : String(v).trim(), low: v => v == null ? '' : String(v).trim().toLowerCase(), arr: v => Array.isArray(v) ? v : [], nowIso: () => new Date().toISOString(), sb,
  kvGet: async k => store[k], kvCas: async (k, fn) => { const nv = fn(store[k]); if (nv !== undefined) store[k] = nv; return { value: store[k] }; }, now: () => Date.now() });
(async () => {
  /* 1. an LSA lead: Wesley + Nick are texted → the e-mail goes to office only */
  await A.notifyNew([{ id: 'l1', title: 'Roof replacement quote', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending' }, contact: { name: 'Pat', phone: '9015550111' } }]);
  assert.deepStrictEqual(texts.map(x => x.to).filter(n => n !== '9015550111').sort(), ['9015550001', '9015550002'], 'both admins texted: ' + JSON.stringify(texts));
  assert.strictEqual(mails.length, 1, 'one e-mail');
  assert.deepStrictEqual(mails[0].to, ['office@grayco-cs.com'], 'texted admins get no e-mail: ' + JSON.stringify(mails[0].to));
  /* TEXTLOG: both alert texts are logged on lead l1; Wesley's GOOD answer + its confirmation too */
  assert.ok(tlog.filter(r => r.dir === 'out' && r.leadId === 'l1').length === 2, 'alerts logged: ' + JSON.stringify(tlog));
  const r1 = await SA.staffInbound('9015550002', 'Good Pat', 'SMx1');
  assert.ok(r1 && r1.lsa === 'l1', JSON.stringify(r1));
  assert.ok(tlog.some(r => r.dir === 'in' && r.leadId === 'l1' && r.text === 'Good Pat' && r.result === 'GOOD' && r.email === 'wjohnson@grayco-cs.com'), 'reply logged: ' + JSON.stringify(tlog.slice(-3)));
  assert.ok(tlog.some(r => r.dir === 'out' && r.phone === '9015550002' && r.code === SA._lsaCode('l1') && /marked GOOD/.test(r.text)), 'confirmation logged with the lead code: ' + JSON.stringify(tlog.slice(-3)));
  /* 2. texting off for everyone (SMS_ALERTS_OFF) → the e-mail still reaches all three */
  texts.length = 0; mails.length = 0; process.env.SMS_ALERTS_OFF = '1';
  await A.notifyNew([{ id: 'l2', title: 'Gutter quote', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true }, contact: { name: 'Q', phone: '9015550112' } }]);
  delete process.env.SMS_ALERTS_OFF;
  assert.strictEqual(texts.length, 0);
  assert.ok(mails.length === 1 && mails[0].to.join() === 'office@grayco-cs.com' && /Google LSA call/.test(mails[0].subject), 'LSA e-mail is the office only (LSAOFFICE): ' + JSON.stringify(mails.map(m => m.to)));
  /* 3. LSAVET: a Google LSA CALL with no number → no text to anyone; the office checks it first */
  texts.length = 0; mails.length = 0;
  await A.notifyNew([{ id: 'l3', title: 'Google LSA caller (2:31 PM)', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true }, contact: { name: 'Google LSA caller (2:31 PM)' } }]);
  assert.strictEqual(texts.length, 0, 'no text before the office says it is real: ' + JSON.stringify(texts));
  assert.ok(vets.some(v => v.leadId === 'l3'), 'office To-Do');
  assert.ok(mails.length === 1 && mails[0].to.join() === 'office@grayco-cs.com' && /Office: is it a real lead\?/.test(mails[0].html), 'office e-mail asks: real?');
  const v = await SA.lsaVetted({ leadId: 'l3', phone: '(901) 555-0123', name: 'Google LSA caller (2:31 PM)', note: 'roof leak in den', by: 'Office Olivia' });
  assert.deepStrictEqual(texts.map(x => x.to).sort(), ['9015550001', '9015550002'], 'real → Wesley + Nick');
  assert.ok(texts.every(x => x.body.startsWith('GrayCo: Google LSA call to the office ' + SA._lsaCode('l3') + ' from (901) 555-0123 Google LSA caller. ✅ Office Olivia says it\'s real: "roof leak in den". ') && /\/#leads&lead=l3 /.test(x.body)), JSON.stringify(texts));
  const r3 = await SA.staffInbound('9015550001', 'good ' + SA._lsaCode('l3') + ' Pat', 'SMx3');
  assert.ok(r3 && r3.lsa === 'l3' && r3.good === true, 'GOOD works on it: ' + JSON.stringify(r3));
  /* LSA247: after hours the office is closed → an LSA call texts Wesley and Nick right away (no office check) */
  texts.length = 0; vets.length = 0; const hrs0 = SA._D.hours, now0 = SA._D.now;
  SA._D.hours = async () => null; SA._D.now = () => Date.parse('2026-11-15T03:00:00Z');   /* Saturday 9 PM Central */
  await A.notifyNew([{ id: 'l4', title: 'Google LSA caller (9:02 PM)', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true }, contact: { name: 'Google LSA caller (9:02 PM)' } }]);
  SA._D.hours = hrs0; SA._D.now = now0;
  assert.ok(!vets.some(v => v.leadId === 'l4') && ['9015550001', '9015550002'].every(n => texts.some(x => x.to === n && /Google LSA call to the office/.test(x.body))), 'after hours: texted 24/7, no office check: ' + JSON.stringify(texts));
  console.log('TEXTFIRST: all passed');
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
