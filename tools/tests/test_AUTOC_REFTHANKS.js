// tools/tests/test_AUTOC_REFTHANKS.js — patch AUTOC 5: a referred lead becomes a job (won) → the referrer's credit is
// recorded and they are thanked by themselves (_lib/referral.js sweep → autoThank). Node only, mocked, fake clock.
// Run: node tools/tests/test_AUTOC_REFTHANKS.js
'use strict';
const path = require('path'), assert = require('assert');
const mock = require('./autofix_mock.cjs').install();
process.env.TWILIO_ACCOUNT_SID = 'ACtest'; process.env.TWILIO_AUTH_TOKEN = 'tok'; process.env.TWILIO_FROM = '+19015550100';
const FN = path.resolve(__dirname, '../../netlify/functions');
const R = require(path.join(FN, '_lib/referral.js'));
const CT = require(path.join(FN, '_lib/custtext.js'));
let pass = 0, fail = 0;
async function t(name, f){ try { await f(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n      ')); } }
const NOW = Date.parse('2026-11-04T16:00:00Z');
CT._D.now = () => NOW;
function seed(o){
  o = o || {};
  mock.reset(); require(path.join(FN, '_lib/pause.js')).reset();
  mock.set('gc_lead_inbox_kv', 'gc_ref_members', [{ id: 'M1', code: 'R-ABCDEF', name: 'Bob Referrer', email: 'bob@example.com', phone: '(901) 555-0144', createdAt: '2026-09-01T00:00:00Z' }]);
  mock.set('gc_lead_inbox_kv', 'gc_ref_referrals', [{ id: 'RF1', memberId: 'M1', name: 'Ann Smith', email: 'ann@example.com', phone: '', address: '', createdAt: '2026-10-01T00:00:00Z', status: 'new' }]);
  if (o.settings) mock.set('gc_lead_inbox_kv', 'gc_ref_settings', o.settings);
  mock.set('gc_kv', 'projects', [Object.assign({ id: 'J1', name: 'Smith roof', status: 'Active', client: 'Ann Smith', clientEmail: 'ann@example.com', contract: 20000, created: '2026-10-10' }, o.p || {})]);
  mock.set('gc_lead_inbox_kv', 'gc_sms_state', { consent: o.noConsent ? {} : { '9015550144': { status: 'yes', at: '2026-09-01T00:00:00Z', via: 'text', phone: '9015550144' } } });
  if (o.paused) mock.set('gc_kv', 'gc_automation_pause', { on: true });
}
const texts = () => mock.texts.map(b => Object.fromEntries(new URLSearchParams(b)));
const ledger = () => mock.get('gc_lead_inbox_kv', 'gc_ref_ledger') || [];
const ref = () => (mock.get('gc_lead_inbox_kv', 'gc_ref_referrals') || [])[0];
const bobMail = () => mock.mails.filter(m => m.to.indexOf('bob@example.com') >= 0);

(async function(){
  console.log('AUTOC 5 — referral thank-you when the referred job is won');
  await t('referred job won ($20k) → $250 credit RECORDED, thank-you e-mail + text, the admins told; no approval needed', async () => {
    seed(); const r = await R.sweep({});
    assert.strictEqual(r.thanked, 1, JSON.stringify(r));
    assert.strictEqual(ledger().length, 1); assert.strictEqual(ledger()[0].amount, 250); assert.strictEqual(ledger()[0].type, 'earn');
    assert.strictEqual(ref().status, 'credited'); assert.ok(ref().auto && ref().thanksAt);
    assert.strictEqual(bobMail().length, 1); assert.ok(/\$250/.test(bobMail()[0].subject));
    assert.strictEqual(texts().length, 1); assert.ok(/thank you for referring Ann/.test(texts()[0].Body) && /Reply STOP/.test(texts()[0].Body), texts()[0].Body);
    assert.ok(mock.mails.some(m => /Referral credit recorded/.test(m.subject)));
    assert.ok(!(mock.get('gc_kv', 'gc_approval_queue') || []).length, 'nothing on approvals');
  });
  await t('the next hourly sweep → nothing twice (credit once, thanks once)', async () => { await R.sweep({}); assert.strictEqual(ledger().length, 1); assert.strictEqual(texts().length, 1); assert.strictEqual(bobMail().length, 1); });
  await t('the job is still a bid → nothing yet', async () => { seed({ p: { status: 'Bidding' } }); await R.sweep({}); assert.strictEqual(ledger().length, 0); assert.strictEqual(mock.texts.length, 0); });
  await t('no SMS consent for the referrer → the e-mail thank-you only (credit still recorded)', async () => { seed({ noConsent: true }); await R.sweep({}); assert.strictEqual(ledger().length, 1); assert.strictEqual(texts().length, 0); assert.strictEqual(bobMail().length, 1); });
  await t('data-entry mode → waits: no credit, no thank-you (it happens after the pause)', async () => { seed({ paused: true }); const r = await R.sweep({}); assert.strictEqual(r.waiting, 1); assert.strictEqual(ledger().length, 0); assert.strictEqual(mock.texts.length + bobMail().length, 0); });
  await t('Admin setting autoThanks:false → back to the approval proposal (on first payment)', async () => {
    seed({ settings: { autoThanks: false } }); await R.sweep({}); assert.strictEqual(ledger().length, 0);
    mock.set('gc_kv', 'invs', [{ id: 'I1', pid: 'J1', type: 'client', amt: 5000, status: 'paid', payments: [{ amount: 5000, date: '2026-11-01' }] }]);
    await R.sweep({}); const q = mock.get('gc_kv', 'gc_approval_queue') || []; assert.ok(q.some(x => x.kind === 'refcredit'), JSON.stringify(q.map(x => x.kind)));
  });
  await t('a small job ($8k) → $100 (the tiers)', async () => { seed({ p: { contract: 8000 } }); await R.sweep({}); assert.strictEqual(ledger()[0].amount, 100); });
  console.log((fail ? '✗ ' : '✓ ') + 'REFTHANKS ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
