// test_JOBMERGE_fn.mjs [index.html] — patch JOBMERGE (INVMATCH 2) pure parts in node (vm), MADE-UP records only:
//   _gcJobMerge.groups  — duplicate jobs only when the QuickBooks customer:job, the PO and the address all match (never the name alone);
//   _gcJobMerge.recheck — invoices the OLD job finder attached where the new sure check (FINDJOB _gcJobForInvoice) disagrees, and
//                         invoices whose job is gone; never ones a person placed or the new check placed (it says why).
// Also: the finders leave an invoice a person unlinked (noAutoLink) alone.
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const FILE = path.resolve(process.argv[2] || 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const blockAt = (needle, open) => { const i = html.indexOf(needle); if (i < 0) return ''; const st = html.lastIndexOf(open || '<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const JM = blockAt('__GC_PATCH_JOBMERGE__ — INVMATCH 2'), FJ = blockAt('if(window.__GC_FINDJOB__) return;');
ok(JM.length > 3000 && FJ.length > 3000, 'index.html has patch JOBMERGE and FINDJOB');

/* FINDJOB in a stub window (its beat / timers are no-ops) → the real _gcJobForInvoice */
const win = { _crm: { projects: [], invs: [] }, __GC_BEAT: () => {}, __GC_WAIT: () => {} };
const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {} }, hidden: true };
const ctx = vm.createContext({ window: win, document: doc, setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, console: { log() {}, warn() {} }, Promise, Date, JSON, Math, String, Array, Object, RegExp });
win.window = win; vm.runInContext(FJ, ctx);
/* JOBMERGE with no document → only the pure API */
const jw = {}; const jctx = vm.createContext({ window: jw, globalThis: jw, console: { log() {} }, JSON, Math, Date, String, Array, Object, RegExp, Promise });
vm.runInContext(JM.replace('(typeof window !== \'undefined\' ? window : globalThis)', '(window)'), jctx);
const J = jw._gcJobMerge;
ok(J && typeof J.groups === 'function' && typeof J.recheck === 'function', '_gcJobMerge.groups / recheck are there without a page');

const QB = (id, o) => Object.assign({ id, source: 'QuickBooks', status: 'Active', type: 'Commercial TI', created: '2026-03-17', photos: [], subs: [] }, o);
const PROJ = [
  QB('QB_A1', { name: 'Enterprise', client: 'Enterprise', autoPO: 'M644', address: '' }),
  QB('QB_A2', { name: 'Enterprise', client: 'Enterprise', autoPO: 'M644', address: '', ccamId: '1001' }),
  QB('QB_A3', { name: 'Enterprise', client: 'Enterprise', autoPO: 'M644', address: '', ccamId: '1002' }),
  QB('QB_B1', { name: 'Alex Demo', client: 'Alex Demo', autoPO: 'H261', address: '3565 Demo Light Dr. Bartlett TN' }),
  QB('QB_B2', { name: 'Alex Demo', client: 'Alex Demo', autoPO: 'H261', address: '3565 Demo Light Drive, Bartlett' }),
  QB('QB_C1', { name: 'Same Name Demo', client: 'Same Name Demo', autoPO: 'C100', address: '1 Demo St' }),
  QB('QB_C2', { name: 'Same Name Demo', client: 'Same Name Demo', autoPO: 'C200', address: '1 Demo St' }),          // other PO
  QB('QB_D1', { name: 'Addr Demo', client: 'Addr Demo', autoPO: 'D100', address: '5 Demo Ave' }),
  QB('QB_D2', { name: 'Addr Demo', client: 'Addr Demo', autoPO: 'D100', address: '9 Other Rd' }),                     // other address
  { id: 'PRJ_E1', name: 'Kitchen Demo', client: 'Pat Demo', autoPO: 'E100', address: '7 Demo Ln', status: 'active' },   // not from QuickBooks
  { id: 'PRJ_E2', name: 'Kitchen Demo', client: 'Pat Demo', autoPO: 'E100', address: '7 Demo Ln', status: 'active' },
  QB('QB_F1', { name: 'Deleted Demo', client: 'Deleted Demo', autoPO: 'F100', address: '8 Demo Ct' }),
  QB('QB_F2', { name: 'Deleted Demo', client: 'Deleted Demo', autoPO: 'F100', address: '8 Demo Ct', deleted: true }),
  QB('QB_G1', { name: 'Nope Demo', client: 'Nope Demo', autoPO: 'G100', address: '2 Demo Way' }),
  QB('QB_G2', { name: 'Nope Demo', client: 'Nope Demo', autoPO: 'G100', address: '2 Demo Way' }),
  QB('QB_H1', { name: 'Diff Day Demo', client: 'Diff Day Demo', autoPO: 'H100', address: '', created: '2026-03-17' }),
  QB('QB_H2', { name: 'Diff Day Demo', client: 'Diff Day Demo', autoPO: 'H100', address: '', created: '2026-08-02' })];   // no address + another import day
const gNope = J.keyOf(PROJ.find(p => p.id === 'QB_G1'));
const INVS = [{ id: 'I1', pid: 'QB_A2', type: 'client' }, { id: 'I2', pid: 'QB_A2', type: 'sub' }, { id: 'I3', pid: 'QB_A3', type: 'sub' }];
const G = J.groups(PROJ, { invs: INVS, docs: [{ id: 'D1', pid: 'QB_A2' }], expenses: [], schedule: [], notSame: { [gNope]: { at: 'x' } } });
const ids = G.map(g => g.jobs.map(j => j.id).sort().join(','));
ok(ids.includes('QB_A1,QB_A2,QB_A3'), 'the 3 copies of one QuickBooks customer:job (same PO, no address, same import day) are one group', ids);
ok(ids.includes('QB_B1,QB_B2'), 'the same street written two ways ("Dr." / "Drive") is the same address', ids);
ok(!ids.some(x => /QB_C|QB_D/.test(x)), 'the same name with another PO, or another address, is NOT a duplicate', ids);
ok(!ids.some(x => /PRJ_E/.test(x)), 'two jobs that are not from QuickBooks are never grouped here (no QuickBooks customer:job)', ids);
ok(!ids.some(x => /QB_F/.test(x)), 'a deleted copy is not offered', ids);
ok(!ids.some(x => /QB_G/.test(x)), '"Not the same" hides a group', ids);
ok(!ids.some(x => /QB_H/.test(x)), 'no address on either and different import days → not grouped', ids);
const gA = G.find(g => /QB_A1/.test(g.jobs.map(j => j.id).join()));
ok(gA && gA.keep === 'QB_A2' && gA.jobs[0].counts.invoices === 1 && gA.jobs[0].counts.bills === 1 && gA.jobs[0].counts.files === 1, 'the job with the most records is offered first, with its invoices / bills / files counted', gA && gA.jobs.map(j => [j.id, j.counts]));
ok(gA && gA.companyCam.length === 2, 'two different CompanyCam links in a group are flagged', gA && gA.companyCam);

/* the re-check list, with the real new check */
const P2 = [
  { id: 'PJ_OFF', name: 'New Office', client: 'Office', address: '6382 Stage Rd', autoPO: 'O046', status: 'completed' },
  { id: 'PJ_ENT', name: 'Lexington Enterprise', client: 'Enterprise', address: '', autoPO: 'M898', status: 'completed' },
  { id: 'PJ_HOL', name: 'Hollis Demo Duplex', client: 'Ray Demo Hollis', address: '88 Hollis Rd', autoPO: 'K101', status: 'active' },
  { id: 'PJ_LH', name: '140 Long Hollow Pike', client: '', address: '', autoPO: 'C956', status: 'completed' },
  { id: 'PJ_RB', name: 'Pressure Wash Demo Bank', client: 'Demo Bank', address: 'Nashville', autoPO: 'P901', status: 'completed' },
  { id: 'PJ_GONE', name: 'Deleted Demo', client: 'X', status: 'completed', deleted: true }];
const I2 = [
  { id: 'IV_1120', type: 'client', client: 'Vertex Demo Co', pid: 'PJ_OFF', po: 'O046', autoLinked: true, desc: 'QuickBooks invoice #1120 — Front office repairs from water damage' },
  { id: 'IV_1250', type: 'sub', sub: 'CH Demo', pid: 'PJ_OFF', po: 'O046', autoLinked: true, desc: 'QuickBooks bill #1250 — 3161 Hwy 64 Ped. Office top out' },
  { id: 'IV_1302', type: 'sub', sub: 'CH Demo', pid: 'PJ_ENT', po: 'M898', autoLinked: true, desc: 'QuickBooks bill #1302 — Enterprise ADA remodel 2681 Mount Moriah' },
  { id: 'IV_1115', type: 'client', client: 'Demo Bank', pid: 'PJ_RB', po: 'P901', autoLinked: true, desc: 'QuickBooks invoice #1115 — Carpet cleaning at 140 long hollow pike' },
  { id: 'IV_OKAD', type: 'sub', sub: 'Demo Roofing', pid: 'PJ_HOL', po: 'K101', autoLinked: true, desc: 'tear-off 88 Hollis Road' },       // old link the new check agrees with
  { id: 'IV_NEW', type: 'sub', sub: 'Demo', pid: 'PJ_OFF', autoLinked: true, autoLinkWhy: 'PO O046', po: 'O046', desc: 'x' },             // linked by the NEW check
  { id: 'IV_MAN', type: 'sub', sub: 'Demo', pid: 'PJ_OFF', pidManual: true, desc: 'office supplies' },                                    // a person put it there
  { id: 'IV_OK', type: 'client', client: 'Vertex Demo Co', pid: 'PJ_OFF', autoLinked: true, autoLinkOk: true, desc: 'office' },          // "It's right"
  { id: 'IV_MISS', type: 'sub', sub: 'Demo', pid: 'PRJ_NOT_THERE', desc: 'x' },
  { id: 'IV_DEL', type: 'sub', sub: 'Demo', pid: 'PJ_GONE', desc: 'x' }];
const R = J.recheck(I2, P2, inv => win._gcJobForInvoice(inv, P2));
const rid = R.map(r => r.inv.id).sort();
ok(['IV_1120', 'IV_1250', 'IV_1302'].every(x => rid.includes(x)), 'Friday-shaped wrong links (#1120, #1250, #1302) are on the re-check list', rid);
const r1115 = R.find(r => r.inv.id === 'IV_1115');
ok(r1115 && r1115.sure === 'PJ_LH', 'a customer-name link whose memo names another job\'s site is listed, with that job suggested', r1115);
ok(!rid.includes('IV_OKAD') && !rid.includes('IV_NEW') && !rid.includes('IV_MAN') && !rid.includes('IV_OK'), 'not listed: an old link the new check agrees with, a link the new check made, one a person made, one marked "It\'s right"', rid);
ok(rid.includes('IV_MISS') && rid.includes('IV_DEL'), 'invoices whose job is gone (not in the CRM / deleted) are listed', rid);

/* the finders leave an unlinked invoice alone */
ok(/if\(!v \|\| v\.pid \|\| v\.deleted \|\| v\.noAutoLink\) return v;/.test(FJ), 'FINDJOB skips an invoice a person unlinked (noAutoLink)');
ok(/if\(!inv\.pid && inv\.po && !inv\.noAutoLink\)/.test(html) && /if\(iv\.noAutoLink && !iv\.pid\) return;/.test(html), 'the PO linker and the sub-invoice router skip it too');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
