// tools/tests/test_AUTOC_ESTTEXT.js — patch AUTOC 1: the estimate follow-up TEXT on day 5 (portal-sign.js textDay5 via
// runFollowups). Node only, mocked Supabase / Resend / Twilio (autofix_mock.cjs), fake clock, made-up 555 numbers.
// Run: node tools/tests/test_AUTOC_ESTTEXT.js
'use strict';
const path = require('path'), assert = require('assert');
const mock = require('./autofix_mock.cjs').install();
process.env.TWILIO_ACCOUNT_SID = 'ACtest'; process.env.TWILIO_AUTH_TOKEN = 'tok'; process.env.TWILIO_FROM = '+19015550100';
const FN = path.resolve(__dirname, '../../netlify/functions');
const PS = require(path.join(FN, 'portal-sign.js'))._ps;
const CT = require(path.join(FN, '_lib/custtext.js'));
let pass = 0, fail = 0;
async function t(name, f){ try { await f(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n      ')); } }
const NOW = Date.parse('2026-11-04T16:00:00Z');   /* Wednesday 10 AM Central */
const SAT = Date.parse('2026-11-07T16:00:00Z');   /* Saturday */
const ago = d => new Date(NOW - d * 864e5).toISOString();
function seed(o){
  o = o || {};
  mock.reset();
  const p = Object.assign({ id: 'P1', name: 'Smith roof', status: 'Estimate Sent', proposalSentAt: ago(5.1), client: 'Ann Smith', clientEmail: 'ann@example.com', clientPhone: '(901) 555-0111', pm: 'Pat PM' }, o.p || {});
  if (o.consent !== false) p.smsConsent = { status: o.consent || 'yes', at: ago(9), via: 'contract', phone: '9015550111' };
  mock.set('gc_kv', 'projects', [p]);
  mock.set('gc_kv', 'users', [{ name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM', phone: '(901) 555-0122' }]);
  mock.set('gc_kv', 'gc_est_followups', []);
  if (o.paused) mock.set('gc_kv', 'gc_automation_pause', { on: true });
  mock.set('gc_lead_inbox_kv', 'gc_sms_state', o.stop ? { optout: { '9015550111': ago(1) } } : {});
  require(path.join(FN, '_lib/pause.js')).reset();
}
const texts = () => mock.texts.map(b => Object.fromEntries(new URLSearchParams(b)));
async function run(at){ CT._D.now = () => at; return PS.runFollowups({ now: at }); }

(async function(){
  console.log('AUTOC 1 — estimate follow-up by text on day 5');
  await t('day 5, consent yes, Wednesday 10 AM → ONE text to the mobile, with the business name, a link and the STOP line', async () => {
    seed(); const r = await run(NOW);
    const tx = texts(); assert.strictEqual(tx.length, 1, JSON.stringify(r.texts));
    assert.strictEqual(tx[0].To, '+19015550111');
    assert.ok(/^GrayCo Construction Services: Hi Ann, just checking in on your estimate for Smith roof/.test(tx[0].Body), tx[0].Body);
    assert.ok(/Reply STOP to opt out\.$/.test(tx[0].Body), tx[0].Body);
    const rec = mock.get('gc_kv', 'gc_est_followups').find(x => x.id.indexOf('P1') >= 0);
    assert.ok(rec && rec.textAt && /auto/.test(rec.textHow));
  });
  await t('the next hourly run → no second text (once)', async () => { await run(NOW + 3600e3); assert.strictEqual(texts().length, 1); });
  await t('day 4 → nothing yet', async () => { seed({ p: { proposalSentAt: ago(4) } }); await run(NOW); assert.strictEqual(texts().length, 0); });
  await t('no SMS consent on file → no text (the e-mail nudges are unchanged)', async () => { seed({ consent: false }); const r = await run(NOW); assert.strictEqual(texts().length, 0); assert.ok(r.texts.skipped.some(x => /consent/.test(x.why)), JSON.stringify(r.texts)); });
  await t('declined texts on the contract → no text', async () => { seed({ consent: 'no' }); await run(NOW); assert.strictEqual(texts().length, 0); });
  await t('number on the STOP list → no text', async () => { seed({ stop: true }); const r = await run(NOW); assert.strictEqual(texts().length, 0); assert.ok(r.texts.skipped.some(x => x.why === 'STOP')); });
  await t('data-entry mode → no text, nothing marked sent', async () => {
    seed({ paused: true }); await run(NOW); assert.strictEqual(texts().length, 0);
    assert.ok(!(mock.get('gc_kv', 'gc_est_followups') || []).some(x => x.textAt));
  });
  await t('Saturday (outside business hours) → no text', async () => { seed({ p: { proposalSentAt: new Date(SAT - 5.1 * 864e5).toISOString() } }); await run(SAT); assert.strictEqual(texts().length, 0); });
  await t('the estimate was signed → no text', async () => { seed({ p: { status: 'Active', contractSignedAt: ago(1) } }); await run(NOW); assert.strictEqual(texts().length, 0); });
  await t('a landline-only customer (phoneType landline, no cell) → no text', async () => { seed({ consent: false, p: { phoneType: 'landline' } }); await run(NOW); assert.strictEqual(texts().length, 0); });
  await t('a carrier name in the job name never reaches the customer', async () => {
    seed({ p: { name: 'State Farm claim — Smith roof', insCarrier: 'State Farm' } }); await run(NOW);
    assert.strictEqual(texts().length, 1); assert.ok(!/state farm/i.test(texts()[0].Body), texts()[0].Body);
  });
  await t('EST_TEXT_OFF=1 → off', async () => { seed(); process.env.EST_TEXT_OFF = '1'; const r = await run(NOW); delete process.env.EST_TEXT_OFF; assert.ok(r.texts.off); assert.strictEqual(texts().length, 0); });
  console.log((fail ? '✗ ' : '✓ ') + 'ESTTEXT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
