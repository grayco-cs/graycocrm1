// tools/tests/test_AUTOFIX.js — Node only (no browser): the overnight automation fixes on claude/autofix, with a mocked
// Supabase / Resend (tools/tests/autofix_mock.cjs) and a fake clock.
//   REF     referral.js: the hourly run starts on Netlify's scheduled POST { next_run } (it used to need "no method")
//   CODES   x10-scheduled.js: the job list did not load → no access code is wiped
//   ANNIV   field-auto.js: the one-year note follows ⚙ Automations yearlyCheckup (commercial off by default); DST-safe 10 AM
//   BACKUP  _lib/health13.js: "Nightly backup" is the CRM data (gc_kv) snapshot, not the newest small table
//   JOURNAL _lib/comms.js: a Google-group copy delivered to invoices@in / leads@in is never taken for an e-mail-history copy
//   GATE    approval-escalate.js: the portal-gate scan runs only when the CRM data changed (or every 2 h)
//   ESC     portal.js escalateDue (no fix, coverage): admin step → office after 24 h, once; PM step never
//   WEEKLY  weekly-update.js: a history job never gets a weekly update draft
// Run: node tools/tests/test_AUTOFIX.js
'use strict';
const path = require('path');
const assert = require('assert');
const mock = require('./autofix_mock.cjs').install();
const FN = path.resolve(__dirname, '../../netlify/functions');
let pass = 0, fail = 0;
async function t(name, f){ try { await f(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n      ')); } }
function stub(rel, exp){ const p = require.resolve(path.join(FN, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; }
const ISO = s => Date.parse(s);

(async function(){
  /* ── REF ── */
  console.log('REF — referral hourly run');
  let swept = 0;
  stub('_lib/referral.js', { sweep: async () => { swept++; return { proposed: 0 }; } });
  const REF = require(path.join(FN, 'referral.js'));
  await t('a scheduled POST { next_run } (no sign-in) runs the sweep', async () => {
    const r = await REF.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ next_run: '2026-10-28T15:37:00.000Z' }) });
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(swept, 1);
  });
  await t('an older runtime with no HTTP method still runs it', async () => { await REF.handler({}); assert.strictEqual(swept, 2); });
  await t('a POST without next_run, or with a sign-in token, is NOT the scheduler (sign-in check, no sweep)', async () => {
    const a = await REF.handler({ httpMethod: 'POST', headers: {}, body: '{}' });
    const b = await REF.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer x.y.z' }, body: JSON.stringify({ next_run: 'x' }) });
    assert.notStrictEqual(a.statusCode, 200); assert.notStrictEqual(b.statusCode, 200); assert.strictEqual(swept, 2);
  });
  await t('REFERRAL_OFF=1 still stops it', async () => { process.env.REFERRAL_OFF = '1'; const r = await REF.handler({ httpMethod: 'POST', headers: {}, body: '{"next_run":"x"}' }); delete process.env.REFERRAL_OFF; assert.ok(/off/.test(r.body)); assert.strictEqual(swept, 2); });

  /* ── CODES ── */
  console.log('CODES — x10 access codes of closed jobs');
  const X10 = require(path.join(FN, 'x10-scheduled.js'));
  const codes = [{ id: 'c1', pid: 'P1', label: 'Gate', code: '1234' }, { id: 'c2', pid: 'P2', label: 'Lockbox', code: '9999' }];
  await t('the job list did not load (empty) → nothing is wiped', async () => {
    mock.reset(); mock.set('gc_lead_inbox_kv', 'gc_x10_codes', codes);
    const n = await X10._test.codesWipe({ projects: [] });
    assert.strictEqual(n, 0); assert.strictEqual(mock.get('gc_lead_inbox_kv', 'gc_x10_codes').length, 2);
    assert.strictEqual(await X10._test.codesWipe({}), 0);
  });
  await t('with the job list: only the closed job\'s code is wiped', async () => {
    const n = await X10._test.codesWipe({ projects: [{ id: 'P1', status: 'Active' }, { id: 'P2', status: 'Closed' }] });
    assert.strictEqual(n, 1); assert.deepStrictEqual(mock.get('gc_lead_inbox_kv', 'gc_x10_codes').map(x => x.id), ['c1']);
  });

  /* ── ANNIV ── */
  console.log('ANNIV — the one-year note');
  const FA = require(path.join(FN, 'field-auto.js'));
  const C = require(path.join(FN, 'portal.js'))._core;
  function seedAnniv(){
    mock.reset();
    mock.set('gc_kv', 'projects', [
      { id: 'R1', name: 'Smith roof', type: 'Residential Roofing', status: 'Complete', client: 'Ann Smith', clientEmail: 'ann@example.com', pm: 'Pat PM', completionDate: '2025-11-08' },
      { id: 'K1', name: 'Church TI', type: 'Commercial', status: 'Complete', client: 'First Church', clientEmail: 'office@church.example', pm: 'Pat PM', completionDate: '2025-11-08' },
      { id: 'K2', name: 'Store TI (switched on)', type: 'Commercial', status: 'Complete', client: 'Shop', clientEmail: 'shop@example.com', pm: 'Pat PM', completionDate: '2025-11-08', auto: { yearlyCheckup: true } }
    ]);
    mock.set('gc_kv', 'users', [{ name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM' }]);
  }
  await t('10 AM Central in winter (CST, 16:00 UTC): residential → approval; commercial skipped; commercial switched on → approval', async () => {
    seedAnniv(); FA._test.D.now = () => ISO('2026-11-10T16:00:00Z');
    const r = await FA._test.runAnniversary({});
    const q = mock.get('gc_kv', 'gc_approval_queue') || [];
    assert.deepStrictEqual(q.map(x => x.jobId).sort(), ['K2', 'R1'], JSON.stringify(r));
    assert.ok(r.skipped.some(x => x.pid === 'K1' && /off for this job/.test(x.why)));
    assert.strictEqual(mock.mails.length, 0, 'nothing e-mailed to a customer');
  });
  await t('the same day again → nothing new (once per job and year)', async () => {
    const r = await FA._test.runAnniversary({}); assert.strictEqual(r.queued, 0); assert.strictEqual((mock.get('gc_kv', 'gc_approval_queue') || []).length, 2);
  });
  await t('9 AM Central (15:00 UTC in winter) → not now', async () => { FA._test.D.now = () => ISO('2026-11-10T15:00:00Z'); const r = await FA._test.runAnniversary({}); assert.ok(r.notNow); });
  await t('summer time: 15:00 UTC is 10 AM CDT → it runs', async () => {
    seedAnniv(); const pj = mock.get('gc_kv', 'projects'); pj.forEach(p => { p.completionDate = '2025-07-14'; }); mock.set('gc_kv', 'projects', pj);
    FA._test.D.now = () => ISO('2026-07-15T15:00:00Z'); const r = await FA._test.runAnniversary({}); assert.ok(!r.notNow && r.queued === 2, JSON.stringify(r));
  });

  /* ── BACKUP ── */
  console.log('BACKUP — the health e-mail\'s backup line');
  const H = require(path.join(FN, '_lib/health13.js'));
  H._D.now = () => ISO('2026-11-01T15:05:00Z'); H._D.usage = { usage: async () => ({ needsSql: true }) };
  H._D.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await t('the small tables saved last night but gc_kv not for 5 days → not green', async () => {
    mock.reset();
    mock.T.gc_backups.push({ source: 'gc_kv', taken_at: '2026-10-27T07:15:00Z', row_count: 900 }, { source: 'rs_leads', taken_at: '2026-11-01T07:16:00Z', row_count: 3 });
    const it = (await H.report()).items.find(x => x.k === 'backup');
    assert.strictEqual(it.status, 'red', JSON.stringify(it)); assert.ok(/CRM data/.test(it.text));
  });
  await t('gc_kv saved last night → green, with its row count', async () => {
    mock.T.gc_backups.push({ source: 'gc_kv', taken_at: '2026-11-01T07:15:00Z', row_count: 912 });
    const it = (await H.report()).items.find(x => x.k === 'backup'); assert.strictEqual(it.status, 'green'); assert.ok(/912 rows/.test(it.text));
  });
  await t('no gc_kv snapshot at all → red', async () => {
    mock.T.gc_backups.length = 0; mock.T.gc_backups.push({ source: 'products', taken_at: '2026-11-01T07:15:00Z', row_count: 1 });
    assert.strictEqual((await H.report()).items.find(x => x.k === 'backup').status, 'red');
  });

  /* ── JOURNAL ── */
  console.log('JOURNAL — invoices@ / leads@ copies are not e-mail history');
  const CM = require(path.join(FN, '_lib/comms.js'));
  const stamped = { headers: { 'x-grayco-journal': '1' } };
  await t('stamped copy delivered to invoices@in.grayco-cs.com → not history', () => { assert.strictEqual(CM.isJournal(stamped, { to: ['invoices@in.grayco-cs.com'] }, ['invoices@grayco-cs.com']), false); });
  await t('stamped copy delivered to leads@in / bids@in → not history', () => {
    assert.strictEqual(CM.isJournal(stamped, { to: [{ email: 'leads@in.grayco-cs.com' }] }, ['leads@grayco-cs.com']), false);
    assert.strictEqual(CM.isJournal(stamped, { to: ['Bids <bids@in.grayco-cs.com>'] }, ['bids@grayco-cs.com']), false);
  });
  await t('the real history copy (to mail@in) is still history', () => {
    assert.strictEqual(CM.isJournal(stamped, { to: ['mail@in.grayco-cs.com'] }, ['mail@in.grayco-cs.com']), true);
    assert.strictEqual(CM.isJournal({ headers: {} }, { to: ['mail@in.grayco-cs.com'] }, ['mail@in.grayco-cs.com']), true);
    assert.strictEqual(CM.isJournal(stamped, {}, ['someone@example.com']), true);
  });

  /* ── GATE ── */
  console.log('GATE — the portal-gate scan in the 15-minute approval run');
  const AE = require(path.join(FN, 'approval-escalate.js'));
  let scans = 0, clock = ISO('2026-10-28T15:00:00Z');
  C.gateScan = async () => { scans++; return { ok: true, queued: 0, jobs: 0 }; };
  AE._gate.GD.now = () => clock;
  mock.reset(); mock.set('gc_kv', 'projects', [{ id: 'P1' }]); mock.set('gc_kv', 'estimates__manifest', { chunked: true, count: 2 });
  await t('first run → a full scan', async () => { await AE._gate.gateScanIfChanged(); assert.strictEqual(scans, 1); });
  await t('15 minutes later, nothing changed → no scan, and the big keys are not read', async () => {
    clock += 15 * 60e3; const before = mock.calls.length; const r = await AE._gate.gateScanIfChanged();
    assert.ok(r.unchanged); assert.strictEqual(scans, 1);
    assert.ok(mock.calls.slice(before).every(c => !/select=key,value|select=value/.test(c.url) || /gc_lead_inbox_kv/.test(c.url)), 'only updated_at was read from gc_kv');
  });
  await t('an estimate saved (its manifest changed) → a full scan', async () => { clock += 15 * 60e3; mock.set('gc_kv', 'estimates__manifest', { chunked: true, count: 3 }); await AE._gate.gateScanIfChanged(); assert.strictEqual(scans, 2); });
  await t('no change for 2 hours → a full scan anyway', async () => { clock += 2 * 3600e3 + 1; await AE._gate.gateScanIfChanged(); assert.strictEqual(scans, 3); });
  await t('a failed scan is tried again on the next run', async () => {
    C.gateScan = async () => { scans++; return { ok: false, error: 'busy' }; }; clock += 60e3; mock.set('gc_kv', 'projects', [{ id: 'P1' }, { id: 'P2' }]);
    await AE._gate.gateScanIfChanged(); clock += 15 * 60e3; await AE._gate.gateScanIfChanged(); assert.strictEqual(scans, 5);
  });
  await t('the signature list covers every key the scan reads (portal.js KV_KEYS + the gate)', () => {
    const src = require('fs').readFileSync(path.join(FN, 'portal.js'), 'utf8');
    const kv = /const KV_KEYS = \[([\s\S]*?)\];/.exec(src)[1].match(/'([^']+)'/g).map(x => x.slice(1, -1));
    kv.concat(['gc_portal_gate']).forEach(k => assert.ok(AE._gate.GATE_SIG_KEYS.indexOf(k) >= 0, k));
  });

  /* ── ESC ── */
  console.log('ESC — approvals: admin step → the office after 24 h');
  mock.reset();
  const now0 = ISO('2026-10-28T15:00:00Z');
  mock.set('gc_kv', 'users', [{ name: 'Wes', email: 'wjohnson@grayco-cs.com', role: 'Admin' }, { name: 'Olive', email: 'olive@grayco-cs.com', role: 'Office' }, { name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM' }]);
  mock.set('gc_kv', 'gc_approval_queue', [
    { id: 'a1', kind: 'final_invoice', title: 'Final invoice — Smith', status: 'waiting', step: 'admin', adminSince: new Date(now0 - 25 * 3600e3).toISOString(), createdAt: new Date(now0 - 30 * 3600e3).toISOString() },
    { id: 'a2', kind: 'final_invoice', title: 'Final invoice — Jones', status: 'waiting', step: 'admin', adminSince: new Date(now0 - 23 * 3600e3).toISOString() },
    { id: 'p1', kind: 'payment_reminder', title: 'Reminder — Lee', status: 'waiting', step: 'pm', pm: 'Pat PM', createdAt: new Date(now0 - 72 * 3600e3).toISOString() }
  ]);
  await t('25 h at the admin step → escalated (office to-do, one notice each for office and admins); 23 h and the PM step are not', async () => {
    const r = await C.escalateDue({ now: now0 });
    assert.deepStrictEqual(r.ids, ['a1']); assert.deepStrictEqual(r.office, ['olive@grayco-cs.com']);
    assert.ok((mock.get('gc_kv', 'gc_office_tasks') || []).some(x => x.id === 'appr_esc_a1'));
    assert.strictEqual((mock.get('gc_kv', 'gc_appr_notices') || []).length, 2);
  });
  await t('the next 15-minute run → nothing new (no second to-do / notice)', async () => {
    const r = await C.escalateDue({ now: now0 + 15 * 60e3 }); assert.strictEqual(r.escalated, 0);
    assert.strictEqual((mock.get('gc_kv', 'gc_office_tasks') || []).length, 1); assert.strictEqual((mock.get('gc_kv', 'gc_appr_notices') || []).length, 2);
  });
  await t('nothing in this path e-mails or texts a customer', () => { assert.strictEqual(mock.mails.length, 0); assert.strictEqual(mock.texts.length, 0); });

  /* ── WEEKLY ── */
  console.log('WEEKLY — weekly customer update drafts');
  const WU = require(path.join(FN, 'weekly-update.js'));
  mock.reset();
  mock.set('gc_kv', 'projects', [{ id: 'H1', name: 'Back-entered job', status: 'In Progress', pct: 50, importedHistory: true, client: 'Old Customer', clientEmail: 'old@example.com' },
    { id: 'A1', name: 'Live job', status: 'In Progress', pct: 40, client: 'New Customer', clientEmail: 'new@example.com' }]);
  await t('a history job is skipped as history (before any portal / AI work); nothing queued or sent', async () => {
    const r = await WU._test.run({ now: ISO('2026-10-30T19:00:00Z') });
    assert.ok(r.skipped.some(x => x.project === 'H1' && /history/.test(x.why)), JSON.stringify(r.skipped));
    assert.strictEqual(r.queued, 0); assert.strictEqual(mock.mails.length, 0);
  });
  await t('2 PM Central on Friday in both seasons; never another hour', () => {
    assert.ok(WU._test.isRunTime(new Date('2026-10-30T19:00:00Z')));   /* CDT */
    assert.ok(WU._test.isRunTime(new Date('2026-11-06T20:00:00Z')));   /* CST */
    assert.ok(!WU._test.isRunTime(new Date('2026-11-06T19:00:00Z')) && !WU._test.isRunTime(new Date('2026-10-30T20:00:00Z')));
  });

  console.log('\nAUTOFIX: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
