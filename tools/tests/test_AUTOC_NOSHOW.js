// tools/tests/test_AUTOC_NOSHOW.js — patch AUTOC 2: the per-sub 9 AM no-show alert (sub-texts.js + _lib/subtxt.js).
// Node only, mocked Supabase / Resend / Twilio, fake clock, made-up 555 numbers. Run: node tools/tests/test_AUTOC_NOSHOW.js
'use strict';
const path = require('path'), assert = require('assert');
const mock = require('./autofix_mock.cjs').install();
process.env.TWILIO_ACCOUNT_SID = 'ACtest'; process.env.TWILIO_AUTH_TOKEN = 'tok'; process.env.TWILIO_FROM = '+19015550100';
const FN = path.resolve(__dirname, '../../netlify/functions');
const STX = require(path.join(FN, 'sub-texts.js'));
const U = require(path.join(FN, '_lib/subtxt.js'));
let pass = 0, fail = 0;
async function t(name, f){ try { await f(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n      ')); } }
const DAY = '2026-11-04';   /* Wednesday (CST: 9 AM Central = 15:00 UTC) */
const at = hm => Date.parse(DAY + 'T' + hm + ':00-06:00');
function seed(o){
  o = o || {};
  mock.reset(); require(path.join(FN, '_lib/pause.js')).reset();
  mock.set('gc_kv', 'projects', [Object.assign({ id: 'J1', name: 'Druluck roof', status: 'Active', address: '123 Main St, Memphis, TN', pm: 'Pat PM', contractSigned: true }, o.p || {})]);
  mock.set('gc_kv', 'users', [{ name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM', cell: '(901) 555-0122' }]);
  mock.set('gc_kv', 'subs', [{ id: 'SUB1', company: 'ABC Roofing', name: 'Abe', phone: '(901) 555-0133' }]);
  mock.set('gc_kv', 'schedule', [Object.assign({ id: 'R1', pid: 'J1', title: 'Tear off', date: DAY, subId: 'SUB1' }, o.row || {})]);
  mock.set('gc_lead_inbox_kv', 'gc_sub_texts', { subs: { SUB1: Object.assign({ on: false, noShow: true, phone: '9015550133' }, o.cfg || {}) } });
  mock.set('gc_lead_inbox_kv', 'gc_sms_state', o.stop ? { optout: { '9015550133': '2026-10-01T00:00:00Z' } } : {});
  if (o.paused) mock.set('gc_kv', 'gc_automation_pause', { on: true });
}
const texts = () => mock.texts.map(b => Object.fromEntries(new URLSearchParams(b)));
const toSub = () => texts().filter(x => x.To === '+19015550133');
const toPm = () => texts().filter(x => x.To === '+19015550122');
const todos = () => (mock.get('gc_kv', 'gc_office_tasks') || []).filter(x => x.kind === 'sub_alert');
async function run(ms){ STX._now = () => ms; return STX._lib.run({}); }

(async function(){
  console.log('AUTOC 2 — sub no-show alert at 9 AM');
  await t('switch on, no check-in, 9:05 AM → the PM gets a text + To-Do + e-mail; the sub gets ONE "are you on the way" text', async () => {
    seed(); const r = await run(at('09:05'));
    assert.strictEqual(r.noShow, 1, JSON.stringify(r));
    assert.strictEqual(toSub().length, 1); assert.ok(/are you on the way to 123 Main St/.test(toSub()[0].Body) && /Reply STOP to opt out/.test(toSub()[0].Body), toSub()[0].Body);
    assert.strictEqual(toPm().length, 1); assert.ok(/ABC Roofing has not checked in/.test(toPm()[0].Body), toPm()[0].Body);
    assert.strictEqual(todos().length, 1); assert.ok(/not checked in/.test(todos()[0].label));
    assert.ok(mock.mails.some(m => m.to.indexOf('pat@grayco-cs.com') >= 0 && /not checked in/.test(m.subject)));
  });
  await t('the next run (9:20) → nothing twice', async () => { await run(at('09:20')); assert.strictEqual(toSub().length, 1); assert.strictEqual(toPm().length, 1); });
  await t('8:55 AM → too early, nothing', async () => { seed(); await run(at('08:55')); assert.strictEqual(texts().length, 0); });
  await t('switch OFF (the default) → nothing', async () => { seed({ cfg: { noShow: false } }); const r = await run(at('09:05')); assert.strictEqual(texts().length, 0); assert.ok(/no sub/.test(r.skipped || ''), JSON.stringify(r)); });
  await t('checked in from the sub portal (📍 I\'m here) → nothing', async () => { seed(); STX._now = () => at('07:40'); await STX._lib.checkIn('SUB1', 'J1', 'portal'); await run(at('09:05')); assert.strictEqual(texts().length, 0); assert.strictEqual(todos().length, 0); });
  await t('texted "here" to our number → a check-in → nothing at 9', async () => {
    seed(); STX._now = () => at('07:50'); const h = await STX._lib.handleReply('9015550133', 'Here', new Date(at('07:50')).toISOString());
    assert.ok(h.handled && h.checkin, JSON.stringify(h)); await run(at('09:05')); assert.strictEqual(texts().length, 0);
  });
  await t('the PM tapped 🟢 Crew arrived on the job → nothing', async () => { seed({ p: { crewDays: { [DAY]: { arrivedAt: new Date(at('07:30')).toISOString() } } } }); await run(at('09:05')); assert.strictEqual(texts().length, 0); });
  await t('a check-in on the schedule row → nothing', async () => { seed({ row: { checkedInAt: new Date(at('08:10')).toISOString() } }); await run(at('09:05')); assert.strictEqual(texts().length, 0); });
  await t('a 10 AM start → not at 9:05, the alert at 10:05', async () => { seed({ row: { time: '10:00 AM' } }); await run(at('09:05')); assert.strictEqual(texts().length, 0); await run(at('10:05')); assert.strictEqual(toPm().length, 1); });
  await t('a "Y" reply to the no-show text → confirmed and checked in', async () => {
    seed(); await run(at('09:05')); STX._now = () => at('09:10'); const h = await STX._lib.handleReply('9015550133', 'yes', new Date(at('09:10')).toISOString());
    assert.ok(h.handled && h.confirmed); const st = U.loadState(mock.get('gc_lead_inbox_kv', 'gc_sub_confirm')); assert.ok(st.checkins['SUB1|' + DAY]);
  });
  await t('anything else in reply → the PM at once (the SUBTXT issue path)', async () => {
    seed(); await run(at('09:05')); const n = todos().length; STX._now = () => at('09:12'); const h = await STX._lib.handleReply('9015550133', 'truck broke down, there by 11', new Date(at('09:12')).toISOString());
    assert.ok(h.issue); assert.strictEqual(todos().length, n + 1);
  });
  await t('a tentative row / unsigned job → nothing', async () => { seed({ row: { tentative: true } }); await run(at('09:05')); assert.strictEqual(texts().length, 0); seed({ p: { status: 'Bidding' } }); await run(at('09:05')); assert.strictEqual(texts().length, 0); });
  await t('the sub is on the STOP list → the PM is still alerted, the sub gets no text', async () => { seed({ stop: true }); await run(at('09:05')); assert.strictEqual(toSub().length, 0); assert.strictEqual(toPm().length, 1); });
  await t('data-entry mode → the PM To-Do + e-mail still happen (staff), no texts at all', async () => { seed({ paused: true }); await run(at('09:05')); assert.strictEqual(texts().length, 0); assert.strictEqual(todos().length, 1); });
  await t('no-show on, schedule texts off → no 6 PM / morning schedule texts', async () => { seed({ row: { date: '2026-11-05' } }); await run(Date.parse('2026-11-04T18:10:00-06:00')); assert.strictEqual(texts().length, 0); });
  await t('settings keep both switches: ?set=1 (schedule texts) does not clear noShow', async () => {
    const s = U.settings({ subs: { SUB1: { on: true, phone: '9015550133', noShow: true } } }); assert.strictEqual(s.subs.SUB1.noShow, true); assert.strictEqual(U.settings({ subs: { SUB2: { on: true } } }).subs.SUB2.noShow, false);
  });
  console.log((fail ? '✗ ' : '✓ ') + 'NOSHOW ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
