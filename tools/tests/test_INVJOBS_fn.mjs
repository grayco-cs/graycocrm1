// test_INVJOBS_fn.mjs [index.html | build dir] — INVJOBS-1 (owner 11/20: the 🔎 "Invoices to re-check" card says "On: PRJ… (its job is
// not in the CRM)" and "those jobs aren't right"). Node (vm), MADE-UP records shaped like the live ones (the ids are the live record
// ids the one-time evidence table names; names / amounts are demo values):
//   1. JOBMERGE mergeMap: old job → live kept job from the merge log, the kept job's mergedFrom / mergedDupes, gc_job_merge_map, a
//      chain; a QuickBooks _mergedFrom only when ONE live job lists it; the re-check card says "merged into …" with the kept job
//      preselected — never "not in the CRM";
//   2. ACCTAUTO planJobs (runs once by itself): SURE → moved (logged, Undo): a merged job's invoice + its expense and register lines,
//      the evidence-table moves (only while the invoice is still where it was, never a person's pick); a customer invoice on GrayCo
//      overhead → no job; GUESS → ⚠ Needs a look with the job preselected; nothing found → Needs a look, no job; "demo" (demolition)
//      is not test data, a bill that says only "test" is archived (its register line folded); the plan is stable;
//   3. ✓ Use this job (pickJob): one tap moves the bill and its job-cost rows / "it's right"; ↩ Undo puts every field back;
//   4. the full ACCTAUTO-1 plan includes it (one Needs-a-look entry per invoice); the page: run stage, DEDUP merge moves register
//      lines + check-queue rows and keeps the merge map, the re-check card leaves out what waits in Needs a look.
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const ARG = path.resolve(process.argv[2] || 'index.html');
const FILE = fs.statSync(ARG).isDirectory() ? path.join(ARG, 'index.html') : ARG;
const html = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const blockAt = (needle) => { const i = html.indexOf(needle); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const JM = blockAt('__GC_PATCH_JOBMERGE__ — INVMATCH 2'), AA = blockAt('__GC_PATCH_ACCTAUTO__'), DD = blockAt("W._gcDedupe = { scan: scan");
ok(JM.length > 3000 && AA.length > 10000 && DD.length > 3000, 'index.html has patch JOBMERGE, ACCTAUTO and DEDUP');
const g = {}; const cx = vm.createContext({ window: g, globalThis: g, console: { log() {} }, JSON, Math, Date, String, Array, Object, RegExp, Promise, parseFloat, isFinite });
for (const b of [JM, AA]) vm.runInContext(b.replace("(typeof window !== 'undefined' ? window : globalThis)", '(window)'), cx);
const JMG = g._gcJobMerge, C = g._gcAcctFix && g._gcAcctFix.core;
ok(JMG && typeof JMG.mergeMap === 'function' && C && typeof C.planJobs === 'function' && typeof C.pickJob === 'function' && C.JOBS_ID === 'INVJOBS-1', 'mergeMap / planJobs / pickJob are there without a page');
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ── made-up jobs (ids = the ones the evidence table names) ── */
const P = (id, o) => Object.assign({ id, status: 'completed', created: '2026-03-02', address: '' }, o);
const PROJ = [
  P('PRJmwf9iwz4k4', { name: 'New Office', client: 'Office', autoPO: 'O046', overhead: true, status: 'archived' }),
  P('PRJmtjlaxag58c28', { name: 'Pediatric Demo Office', autoPO: 'P765', address: '3161 US-64, Oakland, TN', status: 'bidding' }),
  P('PRJmwfc3yvo84', { name: 'Lexington Demo', client: 'Enterprise', autoPO: 'M898' }),
  P('PRJ3fa0np9xz2l', { name: 'EAN- Bathroom remodel Mt Moriah', client: 'EAN Demo Holdings', autoPO: 'O229', address: '2675 Mt Moriah' }),
  P('PRJep9czbdsn5k', { name: 'Custom Bathroom remodel', client: 'Demo Eavanson', autoPO: 'D626', address: '4071 Demo Meade Lakeland TN', status: 'lost' }),
  P('PRJ3el70ml164', { name: 'Demo Meade Renovation', client: 'Demo Eavenson Construction', autoPO: 'M291' }),
  P('PRJ0sx249j6n8v', { name: 'ROTC Demo', client: 'A & B Demo', autoPO: 'T724', status: 'active', created: '2026-10-20' }),
  P('PRJ3b2y5z3', { name: 'Somerville demo ceilings', client: 'A & B Demo', autoPO: 'H393' }),
  P('PRJ_RENA', { name: 'Demo Bank — Re-Roof', client: 'Demo Bank', autoPO: 'X971' }),
  P('PRJ_KEPT', { name: 'Kept Demo Job', client: 'Kept Demo', autoPO: 'K100', mergedDupes: [{ id: 'PRJ_GONE2' }] }),
  P('PRJ_KEPT2', { name: 'Second Kept Demo', client: 'Kept Demo', autoPO: 'K200', mergedFrom: ['PRJ_GONE3'] }),
  P('PRJ_QBA', { name: 'QB Demo A', _mergedFrom: ['PRJ_QBGONE', 'PRJ_QBA', 'PRJ_QBTWO'] }),
  P('PRJ_QBB', { name: 'QB Demo B', _mergedFrom: ['PRJ_QBTWO'] }),
  P('PRJjfp5ual6t2j', { name: 'Demo Master bathroom remodel', client: 'Demo Eavanson', autoPO: 'H990', deleted: true })];
const LOGS = [{ id: 'dd1', list: 'projects', mode: 'merge', keeper: 'PRJ_MID', removed: [{ id: 'PRJ_GONE1' }] }, { id: 'dd0', list: 'projects', mode: 'merge', keeper: 'PRJ_KEPT', removed: [{ id: 'PRJ_UNDONE' }], undone: '2026-11-01' }];
const MAP = { PRJ_MID: { to: 'PRJ_KEPT', at: '2026-11-10' } };
const isDeleted = (id) => id === 'PRJjfp5ual6t2j';

/* 1. the merge map + the re-check card */
const MM = JMG.mergeMap(PROJ, { isDeleted, logs: LOGS, map: MAP });
ok(MM.PRJ_GONE1 === 'PRJ_KEPT', 'a chain (merge log → gc_job_merge_map) ends on the live kept job', MM);
ok(MM.PRJ_GONE2 === 'PRJ_KEPT' && MM.PRJ_GONE3 === 'PRJ_KEPT2', "the kept job's mergedDupes (JOBMERGE) / mergedFrom (DEDUP) count", MM);
ok(MM.PRJ_QBGONE === 'PRJ_QBA' && !MM.PRJ_QBTWO && !MM.PRJ_UNDONE, "a QuickBooks _mergedFrom only when ONE live job lists it; an undone merge does not count", MM);
ok(!MM.PRJ_KEPT && !MM.PRJ_QBA, 'a live job is never mapped away', MM);
const RC = JMG.recheck([{ id: 'IV_M', type: 'client', client: 'Kept Demo', amt: 100, pid: 'PRJ_GONE1' }, { id: 'IV_X', type: 'client', client: 'X', amt: 5, pid: 'PRJ_NOWHERE' }], PROJ, null, { isDeleted, merged: MM });
const rm = RC.find((r) => r.inv.id === 'IV_M'), rx = RC.find((r) => r.inv.id === 'IV_X');
ok(rm && rm.sure === 'PRJ_KEPT' && /merged into "Kept Demo Job"/.test(rm.why) && !/not in the CRM/.test(rm.why), 're-check card: a merged job\'s invoice says "merged into …", the kept job is preselected', rm);
ok(rx && /not in the CRM/.test(rx.why) && !rx.sure, '…a job that is really gone still says so', rx);

/* 2. the one-time job fixes */
const Q = (id, o) => Object.assign({ id, source: 'quickbooks', status: 'paid', paid: true, date: '2026-06-01', autoLinked: true, savedAt: '2026-11-05T16:47:44.435Z' }, o);
const INVS = [
  Q('INVmw3s43wden8b8', { type: 'sub', sub: 'Demo Plumbing', invNum: '1250', amt: 2300, pid: 'PRJmwf9iwz4k4', po: 'O046', desc: 'QuickBooks bill #1250 — 3161 Hwy 64 Ped. Office top out (2/3)' }),
  Q('INVmw3s43wqeh4dz', { type: 'sub', sub: 'Demo Plumbing', invNum: '1302', amt: 4378.09, pid: 'PRJ3fa0np9xz2l', po: 'M898', desc: 'already moved by a person', pidManual: true }),
  Q('INVmw3s43x8izb4v', { type: 'client', client: 'Demo City', invNum: '1132', amt: 10000, pid: 'PRJmwf9iwz4k4', po: 'O046', desc: 'engineering office partition walls' }),
  Q('INVmw3s43xc4i875', { type: 'sub', sub: 'Q&amp;A Demo LLC', invNum: '1531', amt: 2000, pid: 'PRJ0sx249j6n8v', po: 'T724', desc: '214 Demo rd Somerville' }),
  { id: 'INVf553lfs611z', type: 'sub', sub: 'Demo Garfias', client: 'Demo Eavanson', amt: 3000, pid: 'PRJjfp5ual6t2j', po: 'H990', desc: 'demo', status: 'approved', date: '2026-07-10' },
  { id: 'INV0cn960fkw35', type: 'sub', sub: 'Demo Air', amt: 20000, pid: 'PRJ0evqm2s6m36', po: 'J224', desc: 'Uploaded: invoice-demo.pdf', status: 'paid', project: '' },
  { id: 'IV_MERGED', type: 'client', client: 'Kept Demo', invNum: '2001', amt: 900, pid: 'PRJ_GONE1', po: 'K050', desc: 'draw' },
  { id: 'IV_TEST', type: 'sub', sub: 'Testy Demo', amt: 1, pid: 'PRJ_NOWHERE', desc: 'test', status: 'approved' },
  { id: 'IV_GONE_PO', type: 'sub', sub: 'Roof Demo Supply', amt: 777, pid: 'PRJ_VANISHED', po: 'X971', desc: 'shingles' }];
const EXPS = [
  { id: 'EX_GAR', pid: 'PRJjfp5ual6t2j', vendor: 'Demo Garfias', amt: 3000, desc: 'Demo Garfias — demo', date: '2026-07-10' },
  { id: 'EX_AIR', pid: 'PRJ0evqm2s6m36', subInvId: 'INV0cn960fkw35', vendor: 'Demo Air', amt: 20000 },
  { id: 'EX_M', pid: 'PRJ_GONE1', subInvId: 'IV_MERGED', amt: 900 },
  { id: 'EX_OTHER', pid: 'PRJjfp5ual6t2j', vendor: 'Someone Else', amt: 3000 }];
const RL = (id, o) => Object.assign({ id, _id: id, type: 'expense', date: '2026-07-10' }, o);
const REG = [
  RL('R_GAR', { pid: 'PRJjfp5ual6t2j', payee: 'Demo Garfias', amount: 3000, amt: 3000, srcInvId: 'EXPENSE_EX_GONE', desc: 'Sub Invoice: demo' }),
  RL('R_AIR', { pid: 'PRJ0evqm2s6m36', payee: 'Demo Air', amount: 20000, srcInvId: 'INV0cn960fkw35', desc: 'Sub paid' }),
  RL('R_M', { pid: 'PRJ_GONE1', payee: 'Kept Demo', amount: 900, srcInvId: 'IV_MERGED', type: 'income' }),
  RL('R_LONE', { pid: 'PRJ_GONE2', payee: 'Lone Demo', amount: 55, srcInvId: 'EXPENSE_EX_NONE', desc: 'old line' }),
  RL('R_TEST', { pid: 'PRJ_NOWHERE', payee: 'Testy Demo', amount: 1, srcInvId: 'SUB_IV_TEST' }),
  RL('R_1132', { pid: 'PRJmwf9iwz4k4', payee: 'Demo City', amount: 10000, srcInvId: 'INVmw3s43x8izb4v', type: 'income' })];
const AT = '2026-11-20T12:00:00.000Z';
const L0 = { invs: clone(INVS), reg: clone(REG), expenses: clone(EXPS), projects: PROJ };
const G = C.planJobs(clone(L0), { at: AT, isDeleted, merged: MM });
const inv = (id, l) => (l || G.invs).find((x) => x.id === id) || {}, reg = (id, l) => (l || G.reg).find((x) => x._id === id), ex = (id, l) => (l || G.expenses).find((x) => x.id === id) || {};
const look = (id) => G.look.find((x) => x.id === 'look:link:' + id);
ok(inv('INVmw3s43wden8b8').pid === 'PRJmtjlaxag58c28' && inv('INVmw3s43wden8b8').po === 'P765' && inv('INVmw3s43wden8b8').autoLinked === false && /moved by/.test(inv('INVmw3s43wden8b8').autoLinkWhy), 'SURE: bill #1250 "3161 Hwy 64 Ped. Office" leaves GrayCo\'s "New Office" for the Pediatric Office job (its PO too)', inv('INVmw3s43wden8b8'));
ok(inv('INVmw3s43wqeh4dz').pid === 'PRJ3fa0np9xz2l' && !G.items.some((i) => /1302/.test(i.title)), "a person's pick is never moved (and an invoice no longer where it was found is left alone)");
ok(inv('IV_MERGED').pid === 'PRJ_KEPT' && ex('EX_M').pid === 'PRJ_KEPT' && reg('R_M').pid === 'PRJ_KEPT' && reg('R_M').projName === 'Kept Demo Job', 'SURE: a merged job\'s invoice goes to the kept job, with its expense and register line', [inv('IV_MERGED').pid, ex('EX_M').pid, reg('R_M')]);
ok(reg('R_LONE').pid === 'PRJ_KEPT', "a register line left on a merged job's old id goes to the kept job too", reg('R_LONE'));
ok(inv('INVmw3s43x8izb4v').pid === '' && inv('INVmw3s43x8izb4v').po === '' && reg('R_1132').pid === '' && look('INVmw3s43x8izb4v') && look('INVmw3s43x8izb4v').kind === 'jobpick', "a customer's invoice on GrayCo overhead leaves it (no job, the copied PO cleared, its income line too) and waits in Needs a look", [inv('INVmw3s43x8izb4v'), look('INVmw3s43x8izb4v')]);
const lg = look('INVf553lfs611z');
ok(inv('INVf553lfs611z').pid === 'PRJjfp5ual6t2j' && inv('INVf553lfs611z').type === 'sub' && lg && lg.sug && lg.sug.pid === 'PRJep9czbdsn5k' && /demolition/.test(lg.detail) && /deleted/.test(lg.detail), 'GUESS: the "demo" bill on the deleted Lakeland job is NOT archived (demo = demolition) — Needs a look, the same customer\'s bathroom job preselected', lg);
ok(lg && lg.alts.some((a) => a.pid === 'PRJ3el70ml164'), '…with the other candidate listed', lg && lg.alts);
const la = look('INV0cn960fkw35');
ok(la && !la.sug && /gone from the CRM/.test(la.detail) && inv('INV0cn960fkw35').pid === 'PRJ0evqm2s6m36', 'NONE: the Rapid Air-style bill whose job vanished (no delete, no merge) → Needs a look, nothing preselected, nothing moved', la);
const lp = look('IV_GONE_PO');
ok(lp && !lp.sug && lp.alts.some((a) => a.pid === 'PRJ_RENA'), 'a gone job with nothing in the table: Needs a look, the job with the same PO offered', lp);
const lq = look('INVmw3s43xc4i875');
ok(lq && lq.sug && lq.sug.pid === 'PRJ0sx249j6n8v' && /probably right/.test(lq.title) && lq.alts.some((a) => a.pid === 'PRJ3b2y5z3'), "GUESS that it is right: the job it is on preselected (\"✓ Use this job\" = it's right), the other job offered", lq);
ok(inv('IV_TEST').type === 'archived' && inv('IV_TEST')._typeWas === 'sub' && !reg('R_TEST') && G.folds.some((f) => f.recordId === 'R_TEST' && f.record && f.record._id === 'R_TEST'), 'test data ("test", on no job) is archived — not deleted — and its register line folded (kept in gc_folded)', [inv('IV_TEST'), G.folds]);
ok(G.items.every((i) => i.title && i.why && i.changes.every((c) => c.before && c.after)), 'every fix has what / why / before / after for the 🧾 log', G.items.map((i) => i.title));
const G2 = C.planJobs({ invs: G.invs, reg: G.reg, expenses: G.expenses, projects: PROJ }, { at: AT, isDeleted, merged: MM });
ok(G2.items.length === 0, 'the plan is stable: a second plan moves nothing more', G2.items.map((i) => i.title));

/* 3. ✓ Use this job + ↩ Undo */
const L1 = { invs: G.invs, reg: G.reg, expenses: G.expenses, projects: PROJ };
const pk = C.pickJob(L1, 'INVf553lfs611z', 'PRJep9czbdsn5k', { at: AT, by: 'Office Demo', isDeleted });
const pinv = inv('INVf553lfs611z', pk.invs);
ok(pk.item && pinv.pid === 'PRJep9czbdsn5k' && pinv.pidManual === true && pinv.po === 'D626' && ex('EX_GAR', pk.expenses).pid === 'PRJep9czbdsn5k' && reg('R_GAR', pk.reg).pid === 'PRJep9czbdsn5k' && ex('EX_OTHER', pk.expenses).pid === 'PRJjfp5ual6t2j', '✓ Use this job: one tap moves the bill, its expense and register line (not another payee\'s)', [pinv, pk.item]);
const pr = C.pickJob(L1, 'INVmw3s43xc4i875', 'PRJ0sx249j6n8v', { at: AT, by: 'Office Demo', isDeleted });
ok(inv('INVmw3s43xc4i875', pr.invs).autoLinkOk === true && inv('INVmw3s43xc4i875', pr.invs).pid === 'PRJ0sx249j6n8v', "…the job it is on = it's right (off the re-check card for good)");
ok(C.pickJob(L1, 'INV0cn960fkw35', 'PRJ_NOPE', { isDeleted }).error, 'a job that is not in the CRM cannot be picked');
const U = C.undo({ invs: pk.invs, gcAcctRegister: pk.reg, expenses: pk.expenses }, [pk.item], AT);
ok(inv('INVf553lfs611z', U.invs).pid === 'PRJjfp5ual6t2j' && inv('INVf553lfs611z', U.invs).pidManual === null && ex('EX_GAR', U.expenses).pid === 'PRJjfp5ual6t2j' && reg('R_GAR', U.gcAcctRegister).pid === 'PRJjfp5ual6t2j', '↩ Undo puts the bill, its expense and register line back', [inv('INVf553lfs611z', U.invs), ex('EX_GAR', U.expenses)]);
const UA = C.undo({ invs: G.invs, gcAcctRegister: G.reg, expenses: G.expenses }, G.items.filter((i) => i.kind === 'relink'), AT);
ok(inv('INVmw3s43wden8b8', UA.invs).pid === 'PRJmwf9iwz4k4' && inv('INVmw3s43wden8b8', UA.invs).po === 'O046' && inv('IV_MERGED', UA.invs).pid === 'PRJ_GONE1' && reg('R_LONE', UA.gcAcctRegister).pid === 'PRJ_GONE2', '↩ Undo all of the automatic moves: every field as it was', [inv('INVmw3s43wden8b8', UA.invs)]);

/* 4. the full ACCTAUTO-1 plan includes INVJOBS; one Needs-a-look entry per invoice */
const FP = C.plan({ invs: clone(INVS), reg: clone(REG), folded: [], expenses: clone(EXPS), projects: PROJ, customers: [] }, { at: AT, isDeleted, merged: MM });
ok(FP.items.some((i) => i.rule === 'INVJOBS-1') && FP.expenses && ex('EX_M', FP.expenses).pid === 'PRJ_KEPT', 'the full one-time plan (a CRM that never ran it) includes the job fixes', FP.items.map((i) => i.id));
const ids = FP.look.map((x) => x.id);
ok(ids.length === new Set(ids).size, 'one Needs-a-look entry per item (no doubles)', ids);
ok(C.planJobs(clone(L0), { at: AT, isDeleted, merged: MM }).items.length === G.items.length, 'the plan is the same every time (pure)');

/* the page */
ok(/stage === 'jobs' \? CORE\.planJobs/.test(AA) && /st\.runs\[CORE\.JOBS_ID\]/.test(AA) && /!st\.runs\[CORE\.RUN_ID\]/.test(AA), 'ACCTAUTO runs INVJOBS-1 once by itself where ACCTAUTO-1 already ran (its own done marker, claim and log)');
ok(/data-af="usejob"/.test(AA) && /jobSel\(x\)/.test(AA) && /'★ ' \+ x\.sug\.name/.test(AA), 'Needs a look: the job picker with the guess preselected + ✓ Use this job');
ok(/listKey === 'projects' \? LISTS\.concat\(\[REG\]\)/.test(DD) && /'gc_check_queue'\]/.test(DD) && /mergeMapPut\(Object\.keys\(gone\)/.test(DD) && /mergeMapPut\(ids, ''/.test(DD), 'a job merge moves the register lines and check-queue rows too, and keeps the merge map (Undo takes it out)');
ok(/merged: curMerged\(\)/.test(JM) && /!lk\[s\(r\.inv\.id\)\]/.test(JM), 'the re-check card resolves merged jobs and leaves out what waits in Needs a look');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
