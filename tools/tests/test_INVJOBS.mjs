// test_INVJOBS.mjs <build-dir> — INVJOBS-1 in the WHOLE CRM (offline harness_N: stubbed Supabase), made-up books, the LIVE situation:
// ACCTAUTO-1 already ran (gc_acctfix_state) — the office opens the new build and:
//   1. INVJOBS-1 runs BY ITSELF once: the sure bill leaves GrayCo's "New Office" for its job, a merged job's invoice goes to the kept
//      job; its own log entry (the ACCTAUTO-1 one kept); the old "is that right?" look entry is replaced, not doubled;
//   2. ⚠ Needs a look: the guess is preselected — ONE tap "✓ Use this job" moves the bill + its job-cost rows (cloud), logged;
//   3. ↩ Undo in the log puts it back; a second desk does not run it again.
// Made-up data only. Run: flock <scratchpad>/locks/browser.lock node tools/tests/test_INVJOBS.mjs <abs build dir>
import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, waitFor, resetCloud, cset, cget } = H;
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

const P = (id, o) => Object.assign({ id, type: 'Commercial Reno', status: 'completed', jobYear: 2026, contract: 0, created: '2026-03-02', createdAt: '2026-03-02T12:00:00.000Z', pm: 'Demo PM', subs: [], photos: [], checklist: [], followUps: [], customerNotes: '', address: '' }, o);
const PROJECTS = [
  P('PRJmwf9iwz4k4', { name: 'New Office', client: 'Office', autoPO: 'O046', overhead: true, status: 'archived', archived: true }),
  P('PRJmtjlaxag58c28', { name: 'Pediatric Demo Office', client: 'Pediatric Demo', autoPO: 'P765', address: '3161 US-64, Oakland, TN', status: 'active' }),
  P('PRJep9czbdsn5k', { name: 'Custom Bathroom remodel', client: 'Demo Eavanson', autoPO: 'D626', address: '4071 Demo Meade Lakeland TN', status: 'active' }),
  P('PRJ_KEPT', { name: 'Kept Demo Job', client: 'Kept Demo', autoPO: 'K100', status: 'active', mergedDupes: [{ id: 'PRJ_GONE1' }] })];
const INVS = [
  { id: 'INVmw3s43wden8b8', type: 'sub', source: 'quickbooks', sub: 'Demo Plumbing', invNum: '1250', amt: 2300, pid: 'PRJmwf9iwz4k4', po: 'O046', desc: 'QuickBooks bill #1250 — 3161 Hwy 64 Ped. Office top out (2/3)', status: 'paid', paid: true, date: '2026-04-11', autoLinked: true, importedHistory: true, noSend: true },
  { id: 'INVf553lfs611z', type: 'sub', sub: 'Demo Garfias', client: 'Demo Eavanson', amt: 3000, pid: 'PRJjfp5ual6t2j', po: 'H990', desc: 'demo', status: 'approved', date: '2026-07-10', noSend: true },
  { id: 'QB_FREE', type: 'sub', source: 'quickbooks', sub: 'Central Demo Roofing', invNum: '237', amt: 1170, pid: '', date: '2026-10-26', recvDate: '2026-10-26', desc: 'QuickBooks bill #237', status: 'paid', paid: true, importedHistory: true, noSend: true },
  { id: 'IV_MERGED', type: 'client', client: 'Kept Demo', invNum: '2001', amt: 900, pid: 'PRJ_GONE1', desc: 'draw', status: 'paid', paid: true, date: '2026-06-01', noSend: true }];
const EXPS = [{ id: 'EX_GAR', pid: 'PRJjfp5ual6t2j', vendor: 'Demo Garfias', amt: 3000, desc: 'Demo Garfias — demo', date: '2026-07-10', status: 'approved', category: 'Subcontractor' }];
const USERS = [{ id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { id: 'u-wesley', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }];
const OLDLOG = [{ id: 'AFold', runId: 'ACCTAUTO-1', at: '2026-11-20T02:21:48.382Z', by: 'Owner Demo (automatic)', items: [{ id: 'billtotal:X', kind: 'billtotal', title: 'Bill #1 — Demo: $1.00 is right', why: 'demo', amount: 1, changes: [], folds: [] }] }];
const OLDLOOK = { at: '2026-11-20T02:21:48.382Z', done: {}, list: [{ id: 'look:link:INVmw3s43wden8b8', kind: 'link', title: 'Bill #1250 — on "New Office" — is that right?', detail: 'old', amount: 2300, ids: ['INVmw3s43wden8b8'] }, { id: 'look:billtotal:Z', kind: 'billtotal', title: 'Bill #9 — Demo: is the total $9?', detail: 'x', amount: 9, ids: ['Z'] }] };

resetCloud();
cset('projects', PROJECTS); cset('invs', INVS); cset('gcAcctRegister', []); cset('gc_folded', []); cset('customers', []);
cset('users', USERS); cset('subs', []); cset('vendors', []); cset('expenses', EXPS); cset('leads', []);
cset('gc_deleted_projects', ['PRJjfp5ual6t2j']);
cset('gc_acctfix_state', { runs: { 'ACCTAUTO-1': { at: '2026-11-20T02:21:48.382Z', by: 'Owner Demo', logId: 'AFold', items: 1, look: 2 } } });
cset('gc_acctfix_log', OLDLOG); cset('gc_acctfix_look', OLDLOOK);
cset('gc_automation_pause', { on: true, at: '2026-11-04T12:00:00.000Z', by: 'owner' });

const A = await computer('office', { build, init: ['window.__GC_ACCTFIX_TEST__=1'] });
ok(await signIn(A, 'office@grayco-cs.com', 30000), 'the office is signed in to the CRM');
ok(await waitFor(A, n => (window._crm && (window._crm.projects || []).length >= n) || null, PROJECTS.length, 90000), 'the CRM loaded');
let st = null; const t0 = Date.now();
while (Date.now() - t0 < 150000) { st = cget('gc_acctfix_state'); if (st && st.runs && st.runs['INVJOBS-1']) break; await sleep(1000); }
ok(st && st.runs['INVJOBS-1'] && st.runs['INVJOBS-1'].items >= 2 && st.runs['ACCTAUTO-1'].logId === 'AFold', 'INVJOBS-1 ran BY ITSELF where ACCTAUTO-1 had already run (its own done marker)', st);
await sleep(3000);
const I = cget('invs') || [], B = (id, l) => (l || I).find((x) => x.id === id) || {};
ok(B('INVmw3s43wden8b8').pid === 'PRJmtjlaxag58c28' && B('INVmw3s43wden8b8').po === 'P765', 'SURE: bill #1250 left GrayCo\'s "New Office" for the Pediatric Office job (cloud)', B('INVmw3s43wden8b8'));
ok(B('IV_MERGED').pid === 'PRJ_KEPT', "SURE: the merged job's invoice is on the kept job (cloud)", B('IV_MERGED'));
ok(B('INVf553lfs611z').pid === 'PRJjfp5ual6t2j' && B('INVf553lfs611z').type === 'sub', 'the "demo" bill (a guess) is not moved and not archived', B('INVf553lfs611z'));
const LOG = cget('gc_acctfix_log') || [];
ok(LOG.length === 2 && LOG[0].id === 'AFold' && LOG[1].runId === 'INVJOBS-1', 'the 🧾 log keeps the ACCTAUTO-1 entry and adds the INVJOBS-1 one', LOG.map((e) => e.id + ':' + e.runId));
const LK = cget('gc_acctfix_look') || {};
ok(LK.list.some((x) => x.id === 'look:billtotal:Z') && LK.list.some((x) => x.id === 'look:link:INVf553lfs611z' && x.sug && x.sug.pid === 'PRJep9czbdsn5k') && (LK.done || {})['look:link:INVmw3s43wden8b8'], 'Needs a look keeps the earlier entries, adds the guess with its job; the fixed one is ticked off', LK);

/* 1b. Accounting → To match: the import to-dos in plain English, the resolved ones gone */
const TK = (id, rec, qb, note) => ({ id, kind: 'qb_home', cat: 'QuickBooks import — needs a home', recordId: rec, done: false, label: '📜 History (recorded, not sent) — Bill — x', note: note || 'new bill from Central Roofing — created with NO job', qb, candidates: [] });
await A.ev((l) => { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); }, [TK('T_FREE', 'QB_FREE', { kind: 'bill', num: '237', name: 'Central Demo Roofing', amount: 1170, date: '2026-10-26' }), TK('T_ON', 'INVmw3s43wden8b8', { kind: 'bill', num: '1250', name: 'Demo Plumbing', amount: 2300, date: '2026-04-11' }), TK('T_LOOK', 'INVf553lfs611z', { kind: 'bill', num: '', name: 'Demo Garfias', amount: 3000, date: '2026-07-10' })]);
const qt = await A.ev(() => (window._gcAcctModel().match.items || []).filter((x) => x.kind === 'qbtodo').map((x) => ({ what: x.what, amount: x.amount, date: x.date })));
ok(qt.length === 1 && /^Bill #237 from Central Demo Roofing, \$1,170, Oct 26 — no job yet\./.test(qt[0].what) && qt[0].amount === 1170 && qt[0].date === '2026-10-26', 'To match: one import to-do left, in plain English with its amount and date (the one now on a job and the one in Needs a look are gone)', qt);

/* 2. one tap */
await A.ev(() => window._setView('taxcenter')); await sleep(6000);
await A.ev(() => window._gcAcctFix.open('look')); await sleep(2500);
const row = await A.ev(() => { const tr = document.querySelector('#af-ov tr[data-look="look:link:INVf553lfs611z"]'); if (!tr) return null; const s = tr.querySelector('[data-af-job]'); return { text: tr.textContent, sel: s && s.value }; });
ok(row && row.sel === 'PRJep9czbdsn5k' && /Use this job/.test(row.text), 'the guess is preselected in ⚠ Needs a look', row);
await A.ev(() => document.querySelector('#af-ov tr[data-look="look:link:INVf553lfs611z"] [data-af="usejob"]').click()); await sleep(5000);
const I2 = cget('invs') || [], E2 = cget('expenses') || [];
ok(B('INVf553lfs611z', I2).pid === 'PRJep9czbdsn5k' && (E2.find((e) => e.id === 'EX_GAR') || {}).pid === 'PRJep9czbdsn5k', 'ONE tap: the bill and its job cost are on the picked job (cloud)', [B('INVf553lfs611z', I2), E2]);
const LOG2 = cget('gc_acctfix_log') || [];
ok(LOG2.length === 3 && /Needs a look/.test(LOG2[2].by) && ((cget('gc_acctfix_look') || {}).done || {})['look:link:INVf553lfs611z'], 'logged in the 🧾 log (Undo) and off Needs a look', LOG2.map((e) => e.by));

/* 3. Undo + a second desk */
const r = await A.ev(async (id) => window._gcAcctFix.undoAll(id), LOG2[2].id); await sleep(4000);
ok(r && r.undone === 1 && B('INVf553lfs611z', cget('invs')).pid === 'PRJjfp5ual6t2j' && ((cget('expenses') || []).find((e) => e.id === 'EX_GAR') || {}).pid === 'PRJjfp5ual6t2j', '↩ Undo: back where it was, the job cost too (cloud)', r);
const Bd = await computer('owner', { build, init: ['window.__GC_ACCTFIX_TEST__=1'] });
ok(await signIn(Bd, 'wjohnson@grayco-cs.com', 30000), 'the owner signs in on another computer');
await waitFor(Bd, () => !!(window._gcAcctFix), null, 60000); await sleep(25000);
ok((cget('gc_acctfix_log') || []).filter((e) => e.runId === 'INVJOBS-1' && /automatic/.test(e.by)).length === 1, 'the second desk does not run it again');
ok(!A.errs.concat(Bd.errs).some(e => /acctfix|ACCTAUTO|_gcAcctFix|INVJOBS/i.test(e)), 'no page errors', A.errs.concat(Bd.errs).slice(0, 5));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
await A.close(); await Bd.close();
process.exit(fail ? 1 : 0);
