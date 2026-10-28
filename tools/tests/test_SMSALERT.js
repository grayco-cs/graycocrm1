/* patch SMSALERT + LEADMAILMSG tests: node tools/tests/test_SMSALERT.js — mocked Twilio / KV; nothing is sent */
'use strict';
const assert = require('assert');
const path = require('path');
const FN = path.join(__dirname, '../../netlify/functions');
process.env.TWILIO_FROM = '+19015828255';
process.env.CRM_URL = 'https://crm.test';
const SA = require(path.join(FN, '_lib/smsalert.js'));
const LM = require(path.join(FN, '_lib/leadmsg.js'));
const BA = require(path.join(FN, '_lib/bid-alerts.js'));

const USERS = [
  { name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'admin', phone: '901-555-0001', active: true },
  { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'admin', cell: '(901) 555-0002', active: true },
  { name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM', cell: '9015550003', active: true },
  { name: 'Mo Mit', email: 'mo@grayco-cs.com', role: 'Mitigation Manager', cell: '9015550004', active: true },
  { name: 'Gone Guy', email: 'gone@grayco-cs.com', role: 'PM', cell: '9015550009', active: false, departed: true }
];
/* 2026-10-28 15:00 UTC = 10 AM Central (day); 08:00 UTC = 3 AM Central (quiet) */
const DAY = Date.parse('2026-10-28T15:00:00Z'), NIGHT = Date.parse('2026-10-29T08:00:00Z');
function rig(o){
  o = o || {};
  const kv = {}; if (o.settings) kv[SA.KEY] = o.settings;
  const sent = [], posted = [];
  let t = o.now || DAY;
  Object.assign(SA._D, {
    now: () => t,
    kvGet: async k => kv[k],
    kvCas: async (k, f) => { const nv = f(kv[k] == null ? null : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { ok: true, value: kv[k] }; },
    send: async (to, body, from) => { sent.push({ to, body, from }); return { ok: true }; },
    paused: async () => !!o.paused,
    optouts: async () => o.optout || {},
    consentNo: async ph => !!(o.declined && o.declined[ph]),
    people: async () => ({ users: o.users || USERS, staff: [] }),
    postReply: async m => { posted.push(m); return { id: m.id }; }
  });
  return { kv, sent, posted, set: v => { t = v; }, get t(){ return t; } };
}
const person = (p) => Object.assign({ on: true }, p);
const to = r => r.sent.map(x => x.to).sort();

(async () => {
  /* ── 1. owner defaults: Nick + Wesley, no admin setup, phones from their records ── */
  let r = rig();
  let set = SA.settings(null);
  assert.ok(set.defaults && set.people['nthomas@grayco-cs.com'].newAll && set.people['wjohnson@grayco-cs.com'].emerg && set.people[SA.ROLE_MIT].emerg);
  await SA.leads([{ id: 'L1', key: 'L1', title: 'Text message — Jane', source: 'Text message', contact: { name: 'Jane Doe', phone: '(901) 555-0100' } }],
    { L1: { id: 'L1', leadExtra: { textMessage: true, smsFrom: '9015550100', textBody: 'Roof is leaking a little, can someone look Tuesday?' } } }, () => false);
  assert.deepStrictEqual(to(r), ['9015550001', '9015550002']);
  const b = r.sent[0].body;
  assert.ok(/^GrayCo NEW LEAD: Jane Doe \(901\) 555-0100 — "Roof is leaking a little, can someone look Tuesday\?" https:\/\/crm\.test\/#leads$/.test(b), b);
  assert.strictEqual(r.sent[0].from, '+19015828255');
  /* long message trimmed with … under 300 */
  r = rig();
  await SA.leads([{ id: 'L2', key: 'L2', title: 'Web', contact: { name: 'Al', phone: '9015550101' } }], { L2: { id: 'L2', leadExtra: { said: { message: 'word '.repeat(200) } } } }, () => false);
  assert.ok(r.sent[0].body.length <= 300 && /…" https/.test(r.sent[0].body), r.sent[0].body);
  /* no name → Unknown */
  r = rig();
  await SA.leads([{ id: 'L3', key: 'L3', title: 'x', contact: {} }], { L3: { id: 'L3' } }, () => false);
  assert.ok(/^GrayCo NEW LEAD: Unknown /.test(r.sent[0].body));

  /* ── 2. emergency: Nick + Wesley + the mitigation manager, even in quiet hours; non-emergency waits ── */
  r = rig({ now: NIGHT });
  await SA.leads([{ id: 'E1', key: 'E1', title: 'Burst pipe', contact: { name: 'Bo', phone: '9015550102' } }], { E1: { id: 'E1', leadExtra: { said: { message: 'water everywhere' } } } }, () => true);
  assert.deepStrictEqual(to(r), ['9015550001', '9015550002', '9015550004']);
  assert.ok(r.sent.every(x => /^🚨 GrayCo EMERGENCY: Bo \(901\) 555-0102 — "water everywhere"/.test(x.body)));
  r = rig({ now: NIGHT });
  const q = await SA.leads([{ id: 'N1', key: 'N1', title: 'Roof quote', contact: { name: 'Cy', phone: '9015550103' } }], { N1: { id: 'N1' } }, () => false);
  assert.strictEqual(r.sent.length, 0); assert.ok(q[0].skipped.quiet.length === 2);
  /* mitigation manager not hired → skipped */
  r = rig({ users: USERS.filter(u => u.email !== 'mo@grayco-cs.com') });
  await SA.leads([{ id: 'E2', key: 'E2', title: 'Fire', contact: { name: 'Di', phone: '9015550104' } }], { E2: { id: 'E2' } }, () => true);
  assert.deepStrictEqual(to(r), ['9015550001', '9015550002']);

  /* ── 3. toggles per type ── */
  const S1 = { at: 'x', people: {
    'nthomas@grayco-cs.com': person({ cust: 'all' }),
    'pat@grayco-cs.com': person({ cust: 'mine', subs: true, missed: true, approvals: true, system: true, newMine: true }),
    'wjohnson@grayco-cs.com': person({ system: true, qOff: true }),
    'mo@grayco-cs.com': { on: false, cust: 'all', missed: true } } };
  r = rig({ settings: S1 });
  await SA.inboundText({ ph: '9015550200', body: 'Can you come Tuesday?', who: { kind: 'customer', name: 'Kline' }, pid: 'P1', label: 'Kline Water', mine: ['someone@grayco-cs.com'] });
  assert.deepStrictEqual(to(r), ['9015550001'], 'cust all only (Pat: not his job)');
  assert.ok(/^GrayCo: text from Kline \(901\) 555-0200 — Kline Water: "Can you come Tuesday\?"/.test(r.sent[0].body) && /\/\?jobmsg=P1$/.test(r.sent[0].body), r.sent[0].body);
  r = rig({ settings: S1 });
  await SA.inboundText({ ph: '9015550201', body: 'hi', who: { kind: 'customer', name: 'Lu' }, pid: 'P2', mine: ['pat@grayco-cs.com'] });
  assert.deepStrictEqual(to(r), ['9015550001', '9015550003'], 'cust mine → Pat too');
  r = rig({ settings: S1 });
  await SA.inboundText({ ph: '9015550202', body: 'on site tomorrow', who: { kind: 'sub', name: 'ABC Roofing' } });
  assert.deepStrictEqual(to(r), ['9015550003'], 'sub texts');
  r = rig({ settings: S1 });
  await SA.inboundText({ ph: '9015550203', body: 'x', who: { kind: 'staff', name: 'Pat' } });
  assert.strictEqual(r.sent.length, 0, 'staff texts are not alerts');
  r = rig({ settings: S1 });
  await SA.missedCall({ ph: '9015550204', name: 'Caller' });
  assert.deepStrictEqual(to(r), ['9015550003'], 'missed calls (Mo is off)');
  r = rig({ settings: S1 });
  await SA.assigned({ id: 'L9', key: 'L9', title: 'Smith roof', assigneeEmail: 'pat@grayco-cs.com' });
  assert.deepStrictEqual(to(r), ['9015550003']);
  r = rig({ settings: S1 });
  await SA.approvals('pat@grayco-cs.com', 3); await SA.approvals('pat@grayco-cs.com', 4);
  assert.strictEqual(r.sent.length, 1, 'approvals: one a day'); assert.ok(/3 approvals waiting on you/.test(r.sent[0].body));
  r.set(DAY + 86400000); await SA.approvals('pat@grayco-cs.com', 2); assert.strictEqual(r.sent.length, 2, 'next day again');
  await SA.approvals('nthomas@grayco-cs.com', 2); assert.strictEqual(r.sent.length, 2, 'not for Nick (off)');
  r = rig({ settings: S1 });
  await SA.system('backup', 'backup failed');
  assert.deepStrictEqual(to(r), ['9015550002'], 'system: admins only (Pat is not an admin)');
  /* system during quiet hours: held, then sent by flushHeld in the morning */
  const S2 = { at: 'x', people: { 'nthomas@grayco-cs.com': person({ system: true }) } };
  r = rig({ settings: S2, now: NIGHT });
  await SA.system('backup', 'nightly backup had errors');
  assert.strictEqual(r.sent.length, 0);
  r.set(NIGHT + 6 * 3600e3); const fh = await SA.flushHeld();
  assert.strictEqual(fh.sent, 1); assert.ok(/backup had errors/.test(r.sent[0].body));
  /* master off → nothing */
  r = rig({ settings: { at: 'x', people: { 'nthomas@grayco-cs.com': { on: false, newAll: true, emerg: true } } } });
  await SA.leads([{ id: 'E3', key: 'E3', title: 'Fire', contact: {} }], { E3: {} }, () => true);
  assert.strictEqual(r.sent.length, 0);
  /* a departed person never gets one */
  r = rig({ settings: { at: 'x', people: { 'gone@grayco-cs.com': person({ newAll: true }) } } });
  await SA.leads([{ id: 'L5', key: 'L5', title: 'x', contact: {} }], { L5: {} }, () => false);
  assert.strictEqual(r.sent.length, 0);

  /* ── 4. data-entry mode blocks; 5. STOP honored ── */
  r = rig({ paused: true });
  const pz = await SA.leads([{ id: 'E4', key: 'E4', title: 'Fire', contact: {} }], { E4: {} }, () => true);
  assert.strictEqual(r.sent.length, 0); assert.ok(pz[0].paused);
  r = rig({ optout: { '9015550001': '2026-10-01' } });
  await SA.leads([{ id: 'E5', key: 'E5', title: 'Fire', contact: {} }], { E5: {} }, () => true);
  assert.deepStrictEqual(to(r), ['9015550002', '9015550004'], 'Nick texted STOP');

  /* ── 6. rate limit + burst collapse ── */
  r = rig({ settings: S1 });
  for (let i = 0; i < 4; i++) await SA.inboundText({ ph: '9015550300', body: 'msg ' + i, who: { kind: 'customer', name: 'Ann' }, pid: 'P3' });
  assert.strictEqual(r.sent.length, 1, '1 per minute per thread');
  await SA.inboundText({ ph: '9015550301', body: 'other thread', who: { kind: 'customer', name: 'Bea' }, pid: 'P4' });
  assert.strictEqual(r.sent.length, 2, 'another thread is not limited');
  r.set(DAY + 61000);
  await SA.inboundText({ ph: '9015550300', body: 'msg 4', who: { kind: 'customer', name: 'Ann' }, pid: 'P3' });
  assert.strictEqual(r.sent.length, 3); assert.ok(/^GrayCo \(\+3 more\): text from Ann/.test(r.sent[2].body), r.sent[2].body);
  /* lead alert + the customer-text alert for the same new number collapse */
  r = rig({ settings: { at: 'x', people: { 'nthomas@grayco-cs.com': person({ newAll: true, cust: 'all' }) } } });
  await SA.leads([{ id: 'L6', key: 'L6', title: 'Text message — Z', contact: { name: 'Z', phone: '9015550400' } }], { L6: { leadExtra: { textMessage: true, smsFrom: '9015550400' } } }, () => false);
  await SA.inboundText({ ph: '9015550400', body: 'hello', who: null, pid: '' });
  assert.strictEqual(r.sent.length, 1, 'one text for a brand-new texter');

  /* ── 7. reply routing from the cell ── */
  r = rig({ settings: S1 });
  await SA.inboundText({ ph: '9015550500', body: 'Are you coming?', who: { kind: 'customer', name: 'Kim' }, pid: 'PJ', label: 'Kim Roof' });
  assert.deepStrictEqual(to(r), ['9015550001']);
  r.set(DAY + 10 * 60000);
  let rep = await SA.staffInbound('+19015550001', 'Yes, 9 AM tomorrow', 'SMr1');
  assert.ok(rep.handled && rep.replied && rep.to === '9015550500' && rep.pid === 'PJ', JSON.stringify(rep));
  const last = r.sent[r.sent.length - 1];
  assert.strictEqual(last.to, '9015550500'); assert.ok(/^Yes, 9 AM tomorrow/.test(last.body) && /Nick/.test(last.body), last.body); assert.strictEqual(last.from, '+19015828255');
  assert.strictEqual(r.posted.length, 1); assert.strictEqual(r.posted[0].email, 'nthomas@grayco-cs.com'); assert.strictEqual(r.posted[0].pid, 'PJ');
  rep = await SA.staffInbound('+19015550001', 'Yes, 9 AM tomorrow', 'SMr1');
  assert.strictEqual(rep.skipped, 'already handled', 'a Twilio retry is not sent twice');
  r.set(DAY + 45 * 60000);
  rep = await SA.staffInbound('9015550001', 'late reply', 'SMr2');
  assert.ok(rep.handled && rep.ignored, 'after 30 min: ignored');
  assert.ok(/not sent to anyone/.test(r.sent[r.sent.length - 1].body) && r.sent[r.sent.length - 1].to === '9015550001', 'a hint to the staff phone');
  /* customer opted out / declined → not sent */
  r = rig({ settings: S1, optout: { '9015550600': 'x' } });
  await SA.missedCall({ ph: '9015550601', name: 'Q' });   /* Pat gets it */
  r = rig({ settings: S1, declined: { '9015550601': 1 } });
  await SA.missedCall({ ph: '9015550601', name: 'Q' });
  rep = await SA.staffInbound('9015550003', 'call you back', 'SMr3');
  assert.strictEqual(rep.notSent, 'that customer declined texts');
  /* not a staff phone → null (the normal path) */
  assert.strictEqual(await SA.staffInbound('9015559999', 'hello', 'SMx'), null);
  /* START from an opted-out staff phone → the normal START path */
  r = rig({ settings: S1, optout: { '9015550001': 'x' } });
  assert.strictEqual(await SA.staffInbound('9015550001', 'START', 'SMs'), null);

  /* ── 8. a staff number never becomes a lead (missed-call.js inboundSms returns at the hook) ── */
  process.env.TWILIO_ACCOUNT_SID = 'AC'; process.env.TWILIO_AUTH_TOKEN = 't';
  const MC = require(path.join(FN, 'missed-call.js'));
  const WI = require(path.join(FN, 'website-intake.js'));
  let filed = 0; const origFile = WI._lib.fileLead; WI._lib.fileLead = async () => { filed++; return { id: 'x', action: 'added', rec: {} }; };
  r = rig({ settings: S1 });
  let res = await MC._test.inboundSms({ From: '+19015550003', To: '+19015828255', Body: 'I need an estimate for a roof', MessageSid: 'SMlead1' });
  assert.ok(res.cellAlerts && res.handled && res.ignored, JSON.stringify(res));
  assert.strictEqual(filed, 0, 'no lead from a staff number');
  /* a default (seeded) staff phone too */
  r = rig();
  res = await MC._test.inboundSms({ From: '+19015550002', To: '+19015828255', Body: 'emergency water leak', MessageSid: 'SMlead2' });
  assert.ok(res.cellAlerts && res.handled); assert.strictEqual(filed, 0);
  WI._lib.fileLead = origFile;

  /* ── 9. settings: save keeps known staff, admin-only switch, role row emergencies only ── */
  r = rig();
  const saved = await SA.save({ people: { 'pat@grayco-cs.com': person({ system: true, newAll: true }), 'evil@example.com': person({}), 'nobody@grayco-cs.com': person({}), 'role:mitigation': person({ emerg: true, newAll: true }) } }, 'nthomas@grayco-cs.com');
  assert.ok(saved.people['pat@grayco-cs.com'].newAll && !saved.people['pat@grayco-cs.com'].system, 'system dropped for a non-admin');
  assert.ok(!saved.people['evil@example.com'] && !saved.people['nobody@grayco-cs.com']);
  assert.ok(saved.people['role:mitigation'].emerg && !saved.people['role:mitigation'].newAll);
  assert.ok(!SA.settings(r.kv[SA.KEY]).defaults, 'once saved, defaults no longer apply');
  /* quiet hours */
  assert.ok(SA.inQuiet(SA.cleanPerson({}), NIGHT) && !SA.inQuiet(SA.cleanPerson({}), DAY) && !SA.inQuiet(SA.cleanPerson({ qOff: true }), NIGHT));
  assert.ok(SA.inQuiet(SA.cleanPerson({ qFrom: 9, qTo: 17 }), DAY) && !SA.inQuiet(SA.cleanPerson({ qFrom: 9, qTo: 17 }), NIGHT));

  /* ── 10. LEADMAILMSG: the alert e-mails show what the customer said, in full, + call buttons + tel: links ── */
  Object.assign(SA._D, { kvGet: async () => ({ at: 'x', people: {} }) });   /* no texts in these */
  const ENV = { RESEND_API_KEY: 'k', CRM_URL: 'https://crm.test' };
  function brig(){
    const mails = [], store = {};
    global.fetch = async (url, init) => { if (/resend/.test(url)) { mails.push(JSON.parse(init.body)); return { ok: true, status: 200 }; } return { ok: false, status: 404, json: async () => [] }; };
    const A = BA.make({ env: k => (ENV[k] != null ? ENV[k] : ''), s: v => (v == null ? '' : String(v).trim()), low: v => (v == null ? '' : String(v).trim().toLowerCase()), arr: v => (Array.isArray(v) ? v : []),
      nowIso: () => new Date().toISOString(), sb: async () => ({ ok: false, json: async () => [] }), kvGet: async k => store[k], kvCas: async (k, fn) => { const nv = fn(store[k]); if (nv !== undefined) store[k] = nv; return { value: store[k] }; }, now: () => Date.now() });
    return { A, mails };
  }
  const LONG = 'Line one of my message.\nLine two: the <kitchen> ceiling & "drywall" is sagging.\n' + 'More detail. '.repeat(150) + 'THE END.';
  /* a text-message lead */
  let m = brig();
  await m.A.notifyNew([{ id: 'T1', title: 'Text message — (901) 825-0178', source: 'Text message', origin: 'website', websiteLead: true, websiteForm: 'Text message', contact: { name: 'Texter (901) 825-0178', phone: '(901) 825-0178', email: '' },
    scope: 'Text message 2026-10-28 21:21 UTC: ' + LONG.slice(0, 500), leadExtra: { textMessage: true, smsFrom: '9018250178', textBody: LONG, websiteForm: 'Text message' } }]);
  let h = m.mails[0].html;
  assert.ok(h.indexOf('💬 What the customer said') > 0);
  assert.ok(h.indexOf(LM.boxHtml({ message: LONG }).match(/white-space:pre-wrap;font-size:15px[^>]*>([\s\S]*?)<\/div>/)[1]) > 0, 'the full text, escaped');
  assert.ok(/THE END\./.test(h) && /&lt;kitchen&gt; ceiling &amp; &quot;drywall&quot;/.test(h) && /Line one of my message\.\nLine two/.test(h));
  assert.ok(h.indexOf('href="tel:+19018250178"') > 0 && h.indexOf('href="sms:+19018250178"') > 0 && /📞 Call \(901\) 825-0178/.test(h));
  assert.ok(h.indexOf('gc-callbtns') < h.indexOf('💬 What the customer said'), 'buttons near the top');
  assert.ok(/THE END\./.test(m.mails[0].text), 'plain-text part has it too');
  /* a website-form lead: every field the customer typed, never the carrier */
  const said = LM.shared({ message: 'Hail hit the roof.\nNeed a look.', service: 'Roof repair', property: 'Home', urgency: 'This week', company: 'Acme LLC', project: '123 Oak St, Memphis', carrier: 'StateFarmCo', claimNumber: 'CLM-999',
    plansLink: 'https://files.example.com/plans.pdf', photos: ['https://img.example.com/1.jpg'], attrib: { utm_source: 'google', utm_campaign: 'fall' }, howHeard: 'Google' });
  m = brig();
  await m.A.notifyNew([{ id: 'W1', title: 'Roof repair — Ann Lee', source: 'Website', origin: 'website', websiteLead: true, websiteForm: 'Free estimate', address: '123 Oak St', city: 'Memphis', state: 'TN',
    contact: { name: 'Ann Lee', phone: '901-555-0142', email: 'ann@example.com' }, leadExtra: { websiteLead: true, said, existingCustomer: true } }]);
  h = m.mails[0].html;
  ['Hail hit the roof.\nNeed a look.', 'Roof repair', 'This week', 'Acme LLC', '123 Oak St, Memphis', 'https://files.example.com/plans.pdf', 'https://img.example.com/1.jpg', 'utm_source=google', 'utm_campaign=fall', 'ann@example.com', 'Ann Lee']
    .forEach(x => assert.ok(h.indexOf(x) > 0, 'website field: ' + x));
  assert.ok(!/StateFarmCo|CLM-999/.test(h), 'never the carrier / claim #');
  assert.ok(h.indexOf('href="tel:+19015550142"') > 0 && h.indexOf('href="mailto:ann@example.com"') > 0 && /✉️ E-mail/.test(h));
  /* a missed-call lead (with the screened caller's spoken reason) */
  m = brig();
  await m.A.notifyNew([{ id: 'M1', title: 'Missed call — Bob', source: 'Missed call', origin: 'website', websiteLead: true, websiteForm: 'Missed call', contact: { name: 'Bob', phone: '(901) 555-0177' },
    scope: 'Missed call 2026-10-28 21:00 UTC.', leadExtra: { missedCall: true, websiteForm: 'Missed call', spokenReason: 'My basement is flooding' } }]);
  h = m.mails[0].html;
  assert.ok(/Missed call/.test(m.mails[0].subject) && h.indexOf('My basement is flooding') > 0 && h.indexOf('href="tel:+19015550177"') > 0);
  /* emergency e-mail too */
  m = brig();
  await m.A.notifyNew([{ id: 'X1', title: 'Burst pipe flooding basement', source: 'Text message', origin: 'website', websiteLead: true, contact: { name: 'Cy', phone: '9015550188' }, leadExtra: { textBody: 'Burst pipe! Water everywhere.\nPlease hurry.' } }]);
  h = (m.mails.find(x => /EMERGENCY/.test(x.subject)) || {}).html || '';
  assert.ok(h.indexOf('Burst pipe! Water everywhere.\nPlease hurry.') > 0 && h.indexOf('tel:+19015550188') > 0, 'emergency e-mail has the message + call button');
  /* every phone number in the body is a tel: link; not inside tags / existing links */
  const tl = LM.telify('<p>Call 901.555.0100 or (901) 555-0101</p><a href="tel:+19015550102">(901) 555-0102</a><img alt="901-555-0103">');
  assert.ok(/href="tel:\+19015550100"/.test(tl) && /href="tel:\+19015550101"/.test(tl) && (tl.match(/tel:\+19015550102/g) || []).length === 1 && /alt="901-555-0103"/.test(tl));
  /* follow-up texts: the conversation so far (both ways, newest last, Central time) */
  const msgs = [];
  for (let i = 0; i < 14; i++) msgs.push({ id: 'm' + i, channel: 'sms', dir: i % 2 ? 'out' : 'in', smsFrom: i % 2 ? '' : '9015550500', smsTo: i % 2 ? '9015550500' : '', at: new Date(DAY + i * 60000).toISOString(), text: 'msg ' + i, authorName: i % 2 ? 'Nick Thomas 📱 (text to …)' : '' });
  msgs.push({ id: 'other', channel: 'sms', dir: 'in', smsFrom: '9015559999', at: new Date(DAY).toISOString(), text: 'not this one' });
  const th = LM.threadOf(msgs, '+1 901 555 0500', 10), thh = LM.threadHtml(th);
  assert.strictEqual(th.length, 10); assert.strictEqual(th[9].text, 'msg 13'); assert.strictEqual(th[0].text, 'msg 4');
  assert.ok(/Conversation so far/.test(thh) && !/not this one/.test(thh) && thh.indexOf('msg 4') < thh.indexOf('msg 13') && / CT/.test(thh) && /GrayCo \(Nick Thomas\)/.test(thh));
  assert.strictEqual(LM.threadHtml(th.slice(0, 1)), '', 'a first text has no conversation box');
  /* the text relay box (missed-call.js) */
  const tb = LM.boxHtml(LM.textInfo({ body: 'a\nb <c>', name: 'Kline', phone: '9015550200', kind: 'customer', job: 'Kline Water' }));
  assert.ok(/a\nb &lt;c&gt;/.test(tb) && /Kline Water/.test(tb) && /\(901\) 555-0200/.test(tb));
  assert.ok(/tel:\+19015550200/.test(LM.telify(tb)));
  console.log('SMSALERT + LEADMAILMSG tests: all passed');
})().catch(e => { console.error(e); process.exit(1); });
