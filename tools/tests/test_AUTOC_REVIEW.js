// tools/tests/test_AUTOC_REVIEW.js — patch AUTOC 3: review request 2 days after completion (+ one reminder 5 days later
// without a click) — _lib/reviewreq.js, go.js (the click), field-auto.js (the clock). Node only, mocked, fake clock.
// Run: node tools/tests/test_AUTOC_REVIEW.js
'use strict';
const path = require('path'), assert = require('assert');
const mock = require('./autofix_mock.cjs').install();
process.env.TWILIO_ACCOUNT_SID = 'ACtest'; process.env.TWILIO_AUTH_TOKEN = 'tok'; process.env.TWILIO_FROM = '+19015550100';
const FN = path.resolve(__dirname, '../../netlify/functions');
const RR = require(path.join(FN, '_lib/reviewreq.js'));
const CT = require(path.join(FN, '_lib/custtext.js'));
const GO = require(path.join(FN, 'go.js'));
let pass = 0, fail = 0;
async function t(name, f){ try { await f(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n      ')); } }
const NOW = Date.parse('2026-11-04T16:00:00Z');   /* Wednesday 10 AM Central */
const DAYMS = 864e5;
const ymd = ms => new Date(ms).toISOString().slice(0, 10);
function job(o){ return Object.assign({ id: 'J1', name: 'Smith kitchen', status: 'Complete', completionDate: ymd(NOW - 2 * DAYMS), client: 'Ann Smith', clientEmail: 'ann@example.com', clientPhone: '(901) 555-0111', pm: 'Pat PM', type: 'Residential Remodel',
  smsConsent: { status: 'yes', at: '2026-09-01T00:00:00Z', via: 'contract', phone: '9015550111' } }, o || {}); }
function seed(o){
  o = o || {};
  mock.reset(); require(path.join(FN, '_lib/pause.js')).reset();
  mock.set('gc_kv', 'projects', o.projects || [job(o.p)]);
  mock.set('gc_kv', 'users', [{ name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM' }]);
  if (o.claims) mock.set('gc_kv', 'gc_claims', o.claims);
  mock.set('gc_lead_inbox_kv', 'gc_sms_state', {});
  if (o.paused) mock.set('gc_kv', 'gc_automation_pause', { on: true });
}
const texts = () => mock.texts.map(b => Object.fromEntries(new URLSearchParams(b)));
const custMails = () => mock.mails.filter(m => m.to.indexOf('ann@example.com') >= 0);
async function run(ms){ RR._D.now = () => ms; CT._D.now = () => ms; return RR.run({}); }
const state = () => RR.loadState(mock.get('gc_lead_inbox_kv', RR.KEY));

(async function(){
  console.log('AUTOC 3 — review request on completion');
  await t('finished 2 days ago → ONE text + ONE e-mail with the tracked review link', async () => {
    seed(); const r = await run(NOW);
    assert.strictEqual(r.asked, 1, JSON.stringify(r));
    assert.strictEqual(texts().length, 1); assert.ok(/crm\.grayco-cs\.com\/go\/rv-[A-Za-z0-9]{12}/.test(texts()[0].Body) && /^GrayCo Construction Services: /.test(texts()[0].Body) && /Reply STOP to opt out/.test(texts()[0].Body), texts()[0].Body);
    assert.strictEqual(custMails().length, 1); assert.ok(/news@/.test(custMails()[0].from) && /go\/rv-/.test(custMails()[0].html));
  });
  await t('the next run → nothing twice', async () => { await run(NOW + 900e3); assert.strictEqual(texts().length, 1); assert.strictEqual(custMails().length, 1); });
  await t('5 days later, no click → ONE reminder (text + e-mail), then never again', async () => {
    await run(NOW + 5 * DAYMS + 3600e3); assert.strictEqual(texts().length, 2); assert.ok(/reminder/.test(texts()[1].Body)); assert.strictEqual(custMails().length, 2);
    await run(NOW + 6 * DAYMS); assert.strictEqual(texts().length, 2);
  });
  await t('a click on the link (go.js) → the review page, noted → no reminder', async () => {
    seed(); await run(NOW); const code = /go\/(rv-[A-Za-z0-9]+)/.exec(texts()[0].Body)[1];
    const r = await GO.handler({ path: '/go/' + code, queryStringParameters: { c: code }, headers: {} });
    assert.strictEqual(r.statusCode, 302); assert.strictEqual(r.headers.Location, 'https://grayco-cs.com/review');
    assert.ok(state().jobs.J1.clickAt);
    await run(NOW + 5 * DAYMS + 3600e3); assert.strictEqual(texts().length, 1);
  });
  await t('finished yesterday → not yet', async () => { seed({ p: { completionDate: ymd(NOW - 1 * DAYMS) } }); await run(NOW); assert.strictEqual(texts().length + custMails().length, 0); });
  await t('the final walkthrough signed (job still Active) counts as done', async () => { seed({ p: { status: 'Active', completionDate: '', walkthrough: { signed: { at: new Date(NOW - 2.2 * DAYMS).toISOString() } } } }); const r = await run(NOW); assert.strictEqual(r.asked, 1); });
  await t('an insurance dispute (claim in appraisal) → never', async () => { seed({ claims: [{ id: 'C1', projectId: 'J1', status: 'Appraisal' }] }); await run(NOW); assert.strictEqual(texts().length + custMails().length, 0); });
  await t('a flagged job → never', async () => { seed({ p: { flagged: true } }); await run(NOW); assert.strictEqual(texts().length + custMails().length, 0); });
  await t('once per customer per year: a second job for the same customer 3 months later → nothing', async () => {
    seed(); await run(NOW);
    const later = NOW + 90 * DAYMS; mock.set('gc_kv', 'projects', [job(), job({ id: 'J2', name: 'Smith bath', completionDate: ymd(later - 2 * DAYMS) })]);
    await run(later); assert.strictEqual(texts().length, 1 + 0, 'J1 reminder window passed; J2 not asked');
    assert.ok(!state().jobs.J2);
  });
  await t('no SMS consent → the e-mail only', async () => { seed({ p: { smsConsent: null } }); await run(NOW); assert.strictEqual(texts().length, 0); assert.strictEqual(custMails().length, 1); });
  await t('data-entry mode → nothing, nothing marked', async () => { seed({ paused: true }); const r = await run(NOW); assert.ok(/data-entry/.test(r.skipped)); assert.strictEqual(mock.texts.length + custMails().length, 0); assert.ok(!state().jobs.J1); });
  await t('Saturday → waits (outside business hours)', async () => { seed({ p: { completionDate: '2026-11-05' } }); const r = await run(Date.parse('2026-11-07T16:00:00Z')); assert.ok(/business hours/.test(r.skipped)); });
  await t('a commercial job (⚙ Automations reviewRequest off by default) → never', async () => { seed({ p: { type: 'Commercial', name: 'Church TI' } }); await run(NOW); assert.strictEqual(texts().length + custMails().length, 0); });
  await t('an old job (finished 3 months ago) is never mailed when this is switched on', async () => { seed({ p: { completionDate: ymd(NOW - 90 * DAYMS) } }); await run(NOW); assert.strictEqual(texts().length + custMails().length, 0); });
  console.log((fail ? '✗ ' : '✓ ') + 'REVIEW ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
