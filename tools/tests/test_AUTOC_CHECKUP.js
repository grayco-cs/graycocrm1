// tools/tests/test_AUTOC_CHECKUP.js — patch AUTOC 4: 6- and 12-month check-ups are DRAFTED on ✅ Approvals, never sent
// by themselves (field-auto.js runAnniversary, _lib/fa-core.js annivDue / checkupWhat). Node only, mocked, fake clock.
// Run: node tools/tests/test_AUTOC_CHECKUP.js
'use strict';
const path = require('path'), assert = require('assert');
const mock = require('./autofix_mock.cjs').install();
const FN = path.resolve(__dirname, '../../netlify/functions');
const FAU = require(path.join(FN, 'field-auto.js'));
const FA = require(path.join(FN, '_lib/fa-core.js'));
let pass = 0, fail = 0;
async function t(name, f){ try { await f(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n      ')); } }
const TEN_AM = Date.parse('2026-11-10T16:00:00Z');   /* 10 AM Central (CST) */
function seed(projects, queue){
  mock.reset();
  mock.set('gc_kv', 'projects', projects);
  mock.set('gc_kv', 'users', [{ name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM', phone: '(901) 555-0122' }]);
  if (queue) mock.set('gc_kv', 'gc_approval_queue', queue);
}
const P = o => Object.assign({ id: 'R1', name: 'Smith roof', type: 'Residential Roofing', status: 'Complete', client: 'Ann Smith', clientEmail: 'ann@example.com', pm: 'Pat PM' }, o);
const q = () => (mock.get('gc_kv', 'gc_approval_queue') || []).filter(x => x.kind === 'anniversary');

(async function(){
  console.log('AUTOC 4 — 6- and 12-month check-ups, approval only');
  await t('annivDue: 6 and 12 months after completion (month-end safe)', async () => {
    const d = FA.annivDue([{ id: 'a', status: 'Complete', completionDate: '2026-05-10' }, { id: 'b', status: 'Complete', completionDate: '2025-11-10' }, { id: 'c', status: 'Complete', completionDate: '2026-05-31' }], '2026-11-10');
    assert.deepStrictEqual(d.map(x => x.pid + ':' + x.months).sort(), ['a:6', 'b:12']);
    assert.deepStrictEqual(FA.annivDue([{ id: 'c', status: 'Complete', completionDate: '2026-05-31' }], '2026-11-30').map(x => x.due), ['2026-11-30']);
  });
  await t('6 months: "How\'s your new roof holding up?" + the maintenance-plan offer, drafted on Approvals; nothing e-mailed', async () => {
    seed([P({ completionDate: '2026-05-10' })]); FAU._test.D.now = () => TEN_AM;
    const r = await FAU._test.runAnniversary({});
    assert.strictEqual(r.queued, 1, JSON.stringify(r)); const it = q()[0];
    assert.ok(/^appr_anniv6_R1_2026-11-10$/.test(it.id), it.id); assert.ok(/How's your new roof holding up\?/.test(it.subject), it.subject);
    assert.ok(/maintenance plan/i.test(it.html) && /SIX MONTHS/.test(it.html)); assert.strictEqual(it.status, 'waiting');
    assert.strictEqual(mock.mails.filter(m => m.to.indexOf('ann@example.com') >= 0).length, 0);
  });
  await t('12 months: drafted too — even after earlier check-ups were approved and sent (the old "by itself" rule is gone)', async () => {
    seed([P({ id: 'K1', name: 'Jones kitchen remodel', type: 'Residential Remodel', completionDate: '2025-11-10' })], [{ id: 'old', kind: 'anniversary', status: 'sent', createdAt: '2026-01-01T00:00:00Z' }]);
    FAU._test.D.now = () => TEN_AM; const r = await FAU._test.runAnniversary({});
    assert.strictEqual(r.queued, 1); assert.strictEqual(r.sent, 0); assert.ok(/kitchen/.test(q().find(x => x.id !== 'old').subject));
    assert.strictEqual(mock.mails.length, 0, 'never sent by itself');
  });
  await t('the same day again → no second draft', async () => { const r = await FAU._test.runAnniversary({}); assert.strictEqual(r.queued, 0); });
  await t('history / commercial jobs → no draft', async () => {
    seed([P({ completionDate: '2026-05-10', importedHistory: true }), P({ id: 'C1', name: 'Church TI', type: 'Commercial', completionDate: '2026-05-10' })]);
    const r = await FAU._test.runAnniversary({}); assert.strictEqual(r.queued, 0);
  });
  await t('not 10 AM → not now', async () => { FAU._test.D.now = () => TEN_AM - 3600e3; const r = await FAU._test.runAnniversary({}); assert.ok(r.notNow); });
  console.log((fail ? '✗ ' : '✓ ') + 'CHECKUP ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
