// tools/tests/test_AUTOC_SPEEDLEAD.js — patch SPEEDLEAD: the one "Thanks for contacting GrayCo" text ~1 minute after a new
// website / leads@ lead (_lib/speedlead.js; queued by website-intake.js, ticked by x10-scheduled.js). Node only, mocked
// Supabase / Twilio, fake clock, made-up 555 numbers. Run: node tools/tests/test_AUTOC_SPEEDLEAD.js
'use strict';
const path = require('path'), assert = require('assert');
const mock = require('./autofix_mock.cjs').install();
process.env.TWILIO_ACCOUNT_SID = 'ACtest'; process.env.TWILIO_AUTH_TOKEN = 'tok'; process.env.TWILIO_FROM = '+19015550100';
const FN = path.resolve(__dirname, '../../netlify/functions');
const SL = require(path.join(FN, '_lib/speedlead.js'));
const CT = require(path.join(FN, '_lib/custtext.js'));
let pass = 0, fail = 0;
async function t(name, f){ try { await f(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n      ')); } }
const IN_HOURS = Date.parse('2026-11-04T10:00:00-06:00'), AFTER = Date.parse('2026-11-04T21:30:00-06:00');
let clock = IN_HOURS; SL._D.now = () => clock; CT._D.now = () => clock;
SL._D.staffPhone = async ph => ph === '9015550199';
function lead(o){ return Object.assign({ id: 'LI-' + Math.random().toString(36).slice(2, 8), title: 'Roof estimate — Ann', source: 'Website form', sourceKind: 'website', origin: 'website', websiteLead: true, type: 'residential',
  contact: { name: 'Ann Smith', email: 'ann@example.com', phone: '(901) 555-0111' }, leadExtra: { websiteLead: true, receivedAt: new Date(clock).toISOString() }, scope: 'New roof estimate please', notes: [] }, o || {}); }
function seed(o){
  o = o || {};
  mock.reset(); require(path.join(FN, '_lib/pause.js')).reset();
  mock.set('gc_lead_inbox_kv', 'gc_sms_state', Object.assign({}, o.stop ? { optout: { '9015550111': '2026-10-01T00:00:00Z' } } : {}, o.reg ? { consent: { '9015550111': { status: 'yes', at: '2026-10-01T00:00:00Z', via: 'text', phone: '9015550111' } } } : {}));
  mock.set('gc_kv', 'users', [{ name: 'Pat PM', email: 'pat@grayco-cs.com', phone: '(901) 555-0122' }]);
  mock.set('gc_lead_inbox_kv', 'gc_lead_inbox', o.items || []);
  if (o.paused) mock.set('gc_kv', 'gc_automation_pause', { on: true });
}
const texts = () => mock.texts.map(b => Object.fromEntries(new URLSearchParams(b)));
async function arrive(rec, consent, at){ clock = at || IN_HOURS; const items = mock.get('gc_lead_inbox_kv', 'gc_lead_inbox') || []; items.push(rec); mock.set('gc_lead_inbox_kv', 'gc_lead_inbox', items); return SL.enqueue(rec, { consent }); }
async function tickAt(ms){ clock = ms; return SL.tick(); }

(async function(){
  console.log('SPEEDLEAD — one text about a minute after a new website / leads@ lead');
  await t('website lead WITH the opt-in box, in business hours → nothing before 1 minute, then exactly ONE text (owner wording), logged on the lead', async () => {
    seed(); const rec = lead(); await arrive(rec, true);
    await tickAt(IN_HOURS + 30e3); assert.strictEqual(texts().length, 0, 'not before a minute');
    const r = await tickAt(IN_HOURS + 70e3); assert.strictEqual(r.sent, 1, JSON.stringify(r));
    assert.strictEqual(texts()[0].To, '+19015550111');
    assert.strictEqual(texts()[0].Body, 'Thanks for contacting GrayCo Construction Services — we will call you soon. Reply here with any photos or questions. Reply STOP to opt out.');
    const it = mock.get('gc_lead_inbox_kv', 'gc_lead_inbox').find(x => x.id === rec.id);
    assert.ok(it.leadExtra.textLog && it.leadExtra.textLog.some(x => x.dir === 'out' && /Thanks for contacting/.test(x.text)), JSON.stringify(it.leadExtra));
  });
  await t('the next tick → nothing twice', async () => { await tickAt(IN_HOURS + 200e3); assert.strictEqual(texts().length, 1); });
  await t('no consent (box not ticked, nothing on file) → no text', async () => { seed(); await arrive(lead(), false); const r = await tickAt(IN_HOURS + 70e3); assert.strictEqual(texts().length, 0); assert.ok(r.dropped.some(x => /consent/.test(x.why)), JSON.stringify(r)); });
  await t('after hours (9:30 PM) → no text, and none in the morning either', async () => { seed(); await arrive(lead(), true, AFTER); const r = await tickAt(AFTER + 70e3); assert.strictEqual(texts().length, 0); assert.ok(r.dropped.some(x => /business hours/.test(x.why))); await tickAt(AFTER + 11 * 3600e3); assert.strictEqual(texts().length, 0); });
  await t('EMERGENCY after hours → sent right away (next tick)', async () => {
    seed(); await arrive(lead({ title: 'Water coming in — burst pipe', scope: 'flooding in the kitchen, water everywhere' }), true, AFTER);
    await tickAt(AFTER + 20e3); assert.strictEqual(texts().length, 1);
  });
  await t('a missed-call lead / a text lead → never queued (they get their own automatic text)', async () => {
    seed(); const a = await arrive(lead({ websiteForm: 'Missed call', source: 'Missed call', leadExtra: { missedCall: true } }), true);
    const b = await arrive(lead({ source: 'Text message', leadExtra: { textMessage: true, smsFrom: '9015550111' } }), true);
    assert.ok(a.skipped && b.skipped); await tickAt(IN_HOURS + 70e3); assert.strictEqual(texts().length, 0);
  });
  await t('a bid-board / plan-room lead → never queued', async () => { seed(); const r = await arrive(lead({ source: 'PlanHub bid', origin: 'bid', sourceKind: 'bidboard', type: 'commercial' }), true); assert.ok(r.skipped); });
  await t('the same phone again within 30 days → no second text', async () => {
    seed(); await arrive(lead(), true); await tickAt(IN_HOURS + 70e3); assert.strictEqual(texts().length, 1);
    await arrive(lead({ title: 'Second request' }), true, IN_HOURS + 3 * 864e5); const r = await tickAt(IN_HOURS + 3 * 864e5 + 70e3);
    assert.strictEqual(texts().length, 1); assert.ok(r.dropped.some(x => /30 days/.test(x.why)), JSON.stringify(r));
  });
  await t('… and after 30 days (a weekday 33 days later) it may text again', async () => { await arrive(lead({ title: 'Third' }), true, IN_HOURS + 33 * 864e5); await tickAt(IN_HOURS + 33 * 864e5 + 70e3); assert.strictEqual(texts().length, 2); });
  await t('STOP list → no text', async () => { seed({ stop: true }); await arrive(lead(), true); await tickAt(IN_HOURS + 70e3); assert.strictEqual(texts().length, 0); });
  await t('data-entry mode → no text (and not later)', async () => { seed({ paused: true }); await arrive(lead(), true); await tickAt(IN_HOURS + 70e3); assert.strictEqual(mock.texts.length, 0); });
  await t('a staff number → no text', async () => {
    seed(); await arrive(lead({ contact: { name: 'Pat', phone: '(901) 555-0122' } }), true); await arrive(lead({ contact: { name: 'Cell', phone: '(901) 555-0199' } }), true);
    await tickAt(IN_HOURS + 70e3); assert.strictEqual(texts().length, 0);
  });
  await t('a leads@ e-mail lead → no consent of its own → no text', async () => { seed(); await arrive(lead({ source: 'Website / leads@ e-mail' }), false); await tickAt(IN_HOURS + 70e3); assert.strictEqual(texts().length, 0); });
  await t('… unless they texted us first (job-text consent on file) → the text goes', async () => { seed({ reg: true }); await arrive(lead({ source: 'Website / leads@ e-mail' }), false); await tickAt(IN_HOURS + 70e3); assert.strictEqual(texts().length, 1); });
  await t('no phone → not queued', async () => { seed(); const r = await arrive(lead({ contact: { name: 'Ann', email: 'ann@example.com', phone: '' } }), true); assert.ok(r.skipped); });
  await t('SPEED_LEAD_TEXT_OFF=1 → off', async () => { seed(); process.env.SPEED_LEAD_TEXT_OFF = '1'; const r = await arrive(lead(), true); delete process.env.SPEED_LEAD_TEXT_OFF; assert.ok(r.off); });
  /* website-intake.js wiring */
  const WI = require(path.join(FN, 'website-intake.js'));
  await t('website form: smsConsent:true / sms_consent=on → opt-in; nothing sent → no opt-in (never pre-ticked)', async () => {
    assert.strictEqual(WI._test.readForm({ type: 'estimate', name: 'Ann', phone: '9015550111', smsConsent: true }).smsJob, true);
    assert.strictEqual(WI._test.readForm({ type: 'estimate', name: 'Ann', phone: '9015550111', sms_consent: 'on' }).smsJob, true);
    assert.strictEqual(WI._test.readForm({ type: 'estimate', name: 'Ann', phone: '9015550111' }).smsJob, false);
  });
  await t('a leads@ e-mail (website-intake fromEmail) is queued with NO consent → the tick sends nothing', async () => {
    seed(); clock = IN_HOURS;
    const r = await WI.fromEmail({ from: 'Ann Smith <ann@example.com>', subject: 'Need a roof estimate', text: 'Name: Ann Smith\nPhone: (901) 555-0111\nEmail: ann@example.com\nAddress: 12 Oak St, Memphis TN 38117\nMessage: my roof leaks, please call', messageId: 'm1@example.com', date: new Date(clock).toISOString() });
    assert.ok(r.ok && r.action === 'added', JSON.stringify(r)); assert.ok(r.speed && r.speed.queued, JSON.stringify(r.speed));
    await tickAt(IN_HOURS + 70e3); assert.strictEqual(texts().length, 0);
  });
  console.log((fail ? '✗ ' : '✓ ') + 'SPEEDLEAD ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
