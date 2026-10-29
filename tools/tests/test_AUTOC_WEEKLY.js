// tools/tests/test_AUTOC_WEEKLY.js — patch AUTOC 6: the weekly owner report (_lib/ownerweekly.js + scheduled-reports.js).
// Node only, mocked Supabase / Resend, fake clock, made-up data. Run: node tools/tests/test_AUTOC_WEEKLY.js [out.html]
// (with a path it also writes the sample report there).
'use strict';
const path = require('path'), assert = require('assert'), fs = require('fs');
const mock = require('./autofix_mock.cjs').install();
const FN = path.resolve(__dirname, '../../netlify/functions');
const OW = require(path.join(FN, '_lib/ownerweekly.js'));
const SR = require(path.join(FN, 'scheduled-reports.js'));
let pass = 0, fail = 0;
async function t(name, f){ try { await f(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n      ')); } }
const MON7 = Date.parse('2026-11-09T07:00:00-06:00');   /* Monday 7 AM Central → last week = Nov 2–8 */
const iso = (d, hm) => new Date(d + 'T' + (hm || '10:00') + ':00-06:00').toISOString();
function fixture(){
  return {
    users: [{ name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'Project Manager' }, { name: 'Sam Senior', email: 'sam@grayco-cs.com', role: 'Senior PM' }, { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin' }],
    inbox: [
      { id: 'LI1', source: 'Website / leads@ e-mail', origin: 'website', receivedAt: iso('2026-11-02'), title: 'Roof estimate — Ann' },
      { id: 'LI2', source: 'Website form', origin: 'website', sourceKind: 'website', receivedAt: iso('2026-11-03'), title: 'Kitchen' },
      { id: 'LI3', source: 'Text message', leadExtra: { textMessage: true }, receivedAt: iso('2026-11-04'), title: 'Water in basement', websiteForm: 'Text message', emergency: true },
      { id: 'LI4', source: 'Missed call', receivedAt: iso('2026-11-05'), title: 'Caller', websiteForm: 'Missed call' },
      { id: 'LI5', source: 'Google LSA', leadExtra: { mkSource: 'Google Ads' }, receivedAt: iso('2026-11-06'), title: 'LSA lead' },
      { id: 'LI6', source: 'Website form', origin: 'website', receivedAt: iso('2026-10-30'), title: 'Last-last week (not counted)' }
    ],
    leads: [{ id: 'L1', name: 'Typed-in lead', source: 'Referral', createdAt: iso('2026-11-04'), status: 'new', pm: 'Pat PM', dueDate: '2026-11-05' },
      { id: 'L2', name: 'Lost one', source: 'Nextdoor', createdAt: iso('2026-10-01'), status: 'lost', stage: 'lost' }],
    projects: [
      { id: 'P1', name: 'Smith roof', status: 'Active', pm: 'Pat PM', startDate: '2026-11-03', contract: 18000, contractSignedAt: '2026-11-03', created: '2026-10-20', leadSource: 'Google Ads', endDate: '2026-11-20' },
      { id: 'P2', name: 'Jones kitchen', status: 'Complete', pm: 'Sam Senior', completionDate: '2026-11-06', created: '2026-09-01', startDate: '2026-09-15', contract: 42000 },
      { id: 'P3', name: 'Lee bath', status: 'Active', pm: 'Pat PM', endDate: '2026-11-01', startDate: '2026-10-01', created: '2026-09-20' },
      { id: 'P4', name: 'Old deck', status: 'Active', pm: 'Pat PM', endDate: '2026-10-25', startDate: '2026-10-01', created: '2026-09-20' }
    ],
    invs: [{ id: 'I1', pid: 'P1', type: 'client', amt: 6000, status: 'partial', payments: [{ id: 'pm1', amount: 6000, date: '2026-11-04' }] },
      { id: 'I2', pid: 'P2', type: 'client', amt: 42000, status: 'paid', payments: [{ id: 'pm2', amount: 12000, date: '2026-11-07' }, { id: 'pm0', amount: 30000, date: '2026-10-01' }] }],
    expenses: [{ id: 'E1', pid: 'P1', amt: 2500, date: '2026-11-04', type: 'material' }, { id: 'E2', amt: 800, date: '2026-11-06', type: 'fuel' }, { id: 'E3', amt: 999, date: '2026-10-20', type: 'material' }],
    tasks: [{ id: 'T1', label: 'Call adjuster back', assignees: ['pat@grayco-cs.com'], due: '2026-11-04', done: false }, { id: 'T2', label: 'Done one', assignees: ['pat@grayco-cs.com'], due: '2026-11-03', done: true },
      { id: 'T3', label: 'Order dumpster', assignees: ['sam@grayco-cs.com'], due: '2026-11-08', done: false }],
    approvals: [{ id: 'A1', status: 'waiting', step: 'admin', createdAt: iso('2026-11-05') }, { id: 'A2', status: 'waiting', step: 'pm', pm: 'Pat PM', createdAt: iso('2026-11-07') }, { id: 'A3', status: 'sent', createdAt: iso('2026-11-01') }],
    emerg: [{ id: 'X1', createdAt: iso('2026-11-04', '22:10'), ackAt: iso('2026-11-04', '22:22'), what: 'Water in basement', acceptedBy: 'On call — Pat PM' }, { id: 'X2', createdAt: iso('2026-11-07', '03:00'), what: 'Tree on roof' }],
    calls: [{ at: iso('2026-11-03'), answered: true, firstCall: true }, { at: iso('2026-11-04'), answered: false }, { at: iso('2026-11-05'), answered: true }, { at: iso('2026-10-28'), answered: true }]
  };
}

(async function(){
  console.log('AUTOC 6 — weekly owner report');
  const m = OW.build(fixture(), MON7);
  await t('last week = Monday–Sunday before this Monday (Central)', async () => { assert.deepStrictEqual([m.week.from, m.week.to], ['2026-11-02', '2026-11-08']); assert.deepStrictEqual(OW.lastWeek(Date.parse('2026-11-15T20:00:00-06:00')).from, '2026-11-02'); });
  await t('leads by source: 6 last week (5 Lead Inbox + 1 typed in), the week before not counted', async () => { assert.strictEqual(m.leads.total, 6, JSON.stringify(m.leads)); assert.ok(m.leads.bySource.some(x => /Google Ads/.test(x.source))); });
  await t('close rate (90 days) + jobs won last week', async () => { assert.strictEqual(m.close.wonWeek, 1); assert.ok(/%$/.test(m.close.rate)); });
  await t('jobs started / finished', async () => { assert.deepStrictEqual(m.jobs.started.map(x => x.name), ['Smith roof']); assert.deepStrictEqual(m.jobs.finished.map(x => x.name), ['Jones kitchen']); });
  await t('money in $18,000 (payments dated last week) / out $3,300 (expenses last week)', async () => { assert.strictEqual(m.money.in, 18000); assert.strictEqual(m.money.out, 3300); });
  await t('open approvals 2 (oldest 3 days), by who it waits on', async () => { assert.strictEqual(m.approvals.open, 2); assert.strictEqual(m.approvals.oldestDays, 3); });
  await t('overdue per PM: Pat behind (to-do + 2 jobs past end + 1 lead) — Sam has 1', async () => {
    const pat = m.overdue.find(x => x.name === 'Pat PM'), sam = m.overdue.find(x => x.name === 'Sam Senior');
    assert.deepStrictEqual([pat.todos, pat.jobs, pat.leads], [1, 2, 1]); assert.strictEqual(sam.total, 1); assert.deepStrictEqual(m.behind, ['Pat PM']);
  });
  await t('emergencies + response times: 2, one answered in 12 min, one never', async () => { assert.strictEqual(m.emergencies.count, 2); assert.strictEqual(m.emergencies.medianMin, 12); assert.strictEqual(m.emergencies.unanswered, 1); });
  await t('website leads 2 + calls 3 (2 answered, 1 missed)', async () => { assert.strictEqual(m.web.leads, 2); assert.deepStrictEqual([m.web.calls, m.web.answered, m.web.missed], [3, 2, 1]); });
  const page = OW.html(m, { site: 'https://crm.grayco-cs.com' });
  await t('the HTML: mobile viewport, one column (max 640 px), every section, no script', async () => {
    assert.ok(/name="viewport"/.test(page) && /max-width:640px/.test(page) && !/<script/i.test(page));
    ['Leads by source', 'Jobs won last week', 'Jobs started', 'Jobs finished', 'Money', 'Open approvals', 'which PMs are behind', 'Emergencies', 'Website leads'].forEach(h => assert.ok(page.indexOf(h) >= 0, h));
    assert.ok(/Behind:<\/b> Pat PM/.test(page));
  });
  await t('an empty CRM still builds ("None last week", "no calls recorded")', async () => { const e = OW.html(OW.build({}, MON7)); assert.ok(/None last week/.test(e) && /no calls recorded/.test(e)); });
  /* the schedule: Monday 7 AM Central only, once a week, to the admins */
  function seedCloud(){ mock.reset(); const f = fixture(); ['projects', 'leads', 'invs', 'users', 'expenses'].forEach(k => mock.set('gc_kv', k, f[k])); mock.set('gc_kv', 'gc_office_tasks', f.tasks); mock.set('gc_kv', 'gc_approval_queue', f.approvals); mock.set('gc_lead_inbox_kv', 'gc_lead_inbox', f.inbox); mock.set('gc_lead_inbox_kv', 'gc_mkt_calls', f.calls); mock.set('gc_lead_inbox_kv', 'gc_emerg_calls', { list: f.emerg }); }
  await t('Monday 6 AM Central → not now; Tuesday 7 AM → not now', async () => { seedCloud(); assert.ok((await SR._test.scheduled(MON7 - 3600e3)).notNow); assert.ok((await SR._test.scheduled(MON7 + 864e5)).notNow); assert.strictEqual(mock.mails.length, 0); });
  await t('Monday 7 AM Central → ONE e-mail to Wesley + Nick; the second run that hour → nothing', async () => {
    seedCloud(); const r = await SR._test.scheduled(MON7 + 5 * 60e3); assert.ok(r.sent, JSON.stringify(r));
    assert.strictEqual(mock.mails.length, 1); assert.deepStrictEqual(mock.mails[0].to.sort(), ['nthomas@grayco-cs.com', 'wjohnson@grayco-cs.com']); assert.ok(/weekly report/i.test(mock.mails[0].subject));
    const r2 = await SR._test.scheduled(MON7 + 20 * 60e3); assert.ok(r2.already); assert.strictEqual(mock.mails.length, 1);
  });
  await t('summer time: Monday 12:05 UTC is 7 AM CDT → it runs', async () => { assert.deepStrictEqual(SR._test.centralHM(new Date('2026-07-13T12:05:00Z')), { wd: 'Mon', hour: 7 }); });
  await t('a scheduled POST { next_run } outside 7 AM answers 200 and sends nothing', async () => { seedCloud(); SR._now = () => MON7 - 7200e3; const r = await SR.handler({ httpMethod: 'POST', headers: {}, body: '{"next_run":"x"}' }); assert.strictEqual(r.statusCode, 200); assert.strictEqual(mock.mails.length, 0); delete SR._now; });
  await t('the CRM view needs an admin sign-in', async () => { const r = await SR.handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { view: '1' } }); assert.strictEqual(r.statusCode, 401); });
  if (process.argv[2]) { fs.writeFileSync(process.argv[2], page); console.log('  wrote ' + process.argv[2]); }
  console.log((fail ? '✗ ' : '✓ ') + 'WEEKLY ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
