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
  assert.deepStrictEqual(sent.map(x => x.to).filter(x => x !== '9015550111').sort(), ['9015550001', '9015550002'], 'Nick and Wesley get it (even at 3 AM), not the PM');
  assert.ok(sent.some(x => x.to === '9015550111' && /Reply YES/.test(x.body)), 'the customer gets the qualify text (LSAFLOW; held to 7 AM by custquiet in production)');
  sent.splice(0, sent.length, ...sent.filter(x => x.to !== '9015550111'));
  assert.ok(new RegExp('^GrayCo: Google LSA lead ' + code + ' from \\(901\\) 555-0111 Pat Smith says "Need a new roof"\\. Reply GOOD \\+ PM name \\(e\\.g\\. GOOD Pat\\), BAD \\+ why, or NA if no answer\\.').test(sent.find(x => x.to === '9015550001').body) && sent[0].body.length <= 320, sent.find(x => x.to === '9015550001').body);
  sent.length = 0;
  /* Wesley texts "bad spam call" (no code: the newest LSA lead sent to his phone) */
  let r = await SA.staffInbound('9015550002', 'Bad spam call', 'SM1');
  assert.ok(r && r.lsa === 'LSA1' && r.good === false && r.reason === 'spam call', JSON.stringify(r));
  assert.ok(decided[0].good === false && decided[0].reason === 'spam call' && decided[0].byEmail === 'wjohnson@grayco-cs.com');
  assert.ok(/marked BAD \(spam call\) — closed, no PM\. Dispute it in Google: https:\/\/ads\.google\.com\/localservices\/leads/.test(sent[0].body) && sent[0].to === '9015550002', 'he gets a confirmation with the Google link: ' + sent[0].body);
  assert.ok(/^https:\/\/ads\.google\.com\/localservices\//.test(decided[0].link), 'the To-Do gets the link');
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
  /* ── LSAFLOW: the qualify text to the customer, their YES, the PM text ── */
  sent.length = 0; t = Date.parse('2026-10-28T15:00:00Z'); let verified = [];
  SA._D.lsaVerified = async id => { verified.push(id); return true; };
  await SA.leads([{ id: 'LSA2', key: 'LSA2', title: 'Water damage', source: 'Google LSA', contact: { name: 'Ann Lee', phone: '9015550144' } }], { LSA2: { id: 'LSA2', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', service: 'Water damage' } } }, () => false);
  const ask = sent.find(x => x.to === '9015550144');
  assert.ok(ask && /^Hi Ann, this is GrayCo Construction Services\. We received your request through Google about water damage\. Reply YES/.test(ask.body), ask && ask.body);
  sent.length = 0;
  let c = await SA.lsaCustomer('9015550144', 'Yes please');
  assert.ok(c && c.lsaVerified === 'LSA2' && verified[0] === 'LSA2', JSON.stringify(c));
  assert.ok(sent.some(x => x.to === '9015550144' && /you're confirmed/.test(x.body)), 'the customer is thanked');
  assert.ok(sent.some(x => x.to === '9015550001' && /confirmed by text \(YES\)/.test(x.body)) && sent.some(x => x.to === '9015550002'), 'Nick and Wesley are told');
  assert.strictEqual(await SA.lsaCustomer('9015550144', 'yes'), null, 'a second YES does nothing more');
  assert.strictEqual(await SA.lsaCustomer('9015550199', 'yes'), null, 'a stranger\'s YES is not an LSA answer');
  sent.length = 0;
  let pmr = await SA.lsaPmText({ id: 'LSA2', source: 'Google LSA', lsaCheck: 'good', contact: { name: 'Ann Lee', phone: '9015550144' } }, { assignee: 'Pat PM', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(pmr && pmr.sent && /^Hi Ann, your GrayCo project manager is Pat PM — \(901\) 555-0003\. They will be calling you shortly\./.test(sent[0].body), sent[0] && sent[0].body);
  pmr = await SA.lsaPmText({ id: 'LSA2', source: 'Google LSA', lsaCheck: 'good', contact: { name: 'Ann Lee', phone: '9015550144' } }, { assignee: 'Pat PM', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(pmr && pmr.skipped === 'already sent');
  pmr = await SA.lsaPmText({ id: 'LSA3', source: 'Google LSA', lsaCheck: 'bad', contact: { name: 'X', phone: '9015550155' } }, { assignee: 'Pat PM', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(pmr && pmr.skipped === 'marked bad');
  pmr = await SA.lsaPmText({ id: 'N9', source: 'Website', contact: { name: 'X', phone: '9015550155' } }, { assignee: 'Pat PM' });
  assert.strictEqual(pmr, null, 'not an LSA lead');
  /* ── LSAPM: "GOOD, PM is Pat" assigns the PM · LSANA: "no answer" keeps it open ── */
  decided.length = 0; sent.length = 0; t = Date.parse('2026-10-28T15:00:00Z');
  await SA.leads([{ id: 'LSA5', key: 'LSA5', title: 'Fire damage', source: 'Google LSA', contact: { name: 'Bo Roe', phone: '9015550166' } }], { LSA5: { id: 'LSA5', source: 'Google LSA', leadExtra: { lsaCheck: 'pending' } } }, () => false);
  let g = await SA.staffInbound('9015550002', 'Good, PM is Pat', 'SM10');
  assert.ok(g && g.good && g.pm === 'Pat PM' && decided[0].pm && decided[0].pm.email === 'pat@grayco-cs.com', JSON.stringify(g));
  assert.ok(sent.some(x => x.to === '9015550002' && /PM Pat PM assigned/.test(x.body)), 'Wesley is told the PM is set');
  g = await SA.staffInbound('9015550002', 'good zed', 'SM11');
  assert.ok(g && g.good && !g.pm && g.pmAsked === 'zed' && sent.some(x => /no PM named "zed"/.test(x.body)), JSON.stringify(g));
  let na = await SA.staffInbound('9015550001', 'no answer', 'SM12');
  assert.ok(na && na.noAnswer && decided.slice(-1)[0].noAnswer === true && sent.some(x => x.to === '9015550001' && /NO ANSWER — kept open/.test(x.body)), JSON.stringify(na));
  na = await SA.staffInbound('9015550001', 'NA', 'SM13');
  assert.ok(na && na.noAnswer, 'NA works too');
  /* ── LSAMSG: a text from the LSA lead → the admins' cells, answerable from the cell ── */
  sent.length = 0; t += 5 * 60000;
  const it = await SA.inboundText({ ph: '9015550166', body: 'What time can you come?', who: { kind: 'lead', name: 'Bo Roe' }, pid: '' });
  assert.ok(it && it.sent === 2 && sent.every(x => /^GrayCo: LSA lead .* Bo Roe \(901\) 555-0166 texted: "What time can you come\?"/.test(x.body) || /LSA lead/.test(x.body)), JSON.stringify(sent));
  sent.length = 0;
  const rr = await SA.staffInbound('9015550002', 'Tomorrow at 10 works', 'SM20');
  assert.ok(rr && rr.replied && rr.to === '9015550166' && sent.some(x => x.to === '9015550166' && /Tomorrow at 10 works/.test(x.body)), JSON.stringify(rr));
  sent.length = 0; t += 60000;
  const np = await SA.staffInbound('9015550002', 'No problem, see you then', 'SM21');
  assert.ok(np && np.replied && !np.lsa && sent.some(x => x.to === '9015550166'), 'a "No problem…" reply goes to the customer, it is not BAD: ' + JSON.stringify(np));
  const WI = require(path.join(__dirname, '../../netlify/functions/website-intake.js'))._lib;
  assert.strictEqual(WI.lsaLinkOf('<a href="https://ads.google.com/localservices/lead/123456?hl=en&amp;x=1">View lead</a> https://support.google.com/localservices'), 'https://ads.google.com/localservices/lead/123456?hl=en&x=1');
  assert.strictEqual(WI.lsaLinkOf('no link here'), '');
  console.log('LSATEXT tests: all passed');
})().catch(e => { console.error(e); process.exit(1); });
