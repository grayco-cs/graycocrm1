// test_INVLINK_fn.mjs [index.html] — patch INVLINK in node (vm), MADE-UP records shaped like the live ones (owner 11/19):
//   · the A & B case: a customer with several jobs → never linked by the customer's name; its invoices are "suspect" / "wrong";
//   · the T724 case: "Cat Country Boardwalk replacement" on ROTC → the boardwalk job is suggested, the audit says "wrong";
//   · the "view" case: the PO column is the job's PO, else "—" — never "view";
//   · a person's link is kept: the audit says "manual", the old finders (FINDJOB, LCLEAN-Q) never move it, relink logs it;
//   · QuickBooks-only cleanup for past jobs: CRM draws merged into their QuickBooks twin or archived "not in QuickBooks", a current job
//     and a new (after go-live) invoice untouched, A/R and overdue drop, Undo restores every field;
//   · EAH Holdings → EAN Holdings: the keeper is the record with more jobs / invoices, jobs and invoices repointed, alias kept, Undo;
//   · payables: sub / supplier / unclear from the payee's own evidence, the bill's job by address / the sub's jobs;
//   · the page has every INVLINK hook (PO cell, 3 tabs, Assign guesses, customer-only links off, draw makers gated);
//   · the server side (netlify/functions/_lib/invlink.js) skips what is not counted.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { createRequire } from 'module';
const FILE = path.resolve(process.argv[2] || 'index.html');
const ROOT = fs.statSync(FILE).isDirectory() ? FILE : path.dirname(FILE);
const html = fs.readFileSync(fs.statSync(FILE).isDirectory() ? path.join(FILE, 'index.html') : FILE, 'utf8');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const blockAt = (needle) => { const i = html.indexOf(needle); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };

const IL = blockAt('__GC_PATCH_INVLINK__ — ');
ok(IL.length > 20000, 'index.html has patch INVLINK');
const jw = {}; const jctx = vm.createContext({ window: jw, globalThis: jw, console: { log() {} }, JSON, Math, Date, String, Array, Object, RegExp, Promise, parseFloat, isFinite });
vm.runInContext(IL.replace("(typeof window !== 'undefined' ? window : globalThis)", '(window)'), jctx);
const C = jw._gcInvLink;
ok(C && typeof C.match === 'function' && typeof C.audit === 'function' && typeof C.plan === 'function' && typeof C.apply === 'function', '_gcInvLink pure core is there without a page');

/* ── made-up jobs ── */
const J = (id, o) => Object.assign({ id, status: 'completed', created: '2026-03-02', contract: 0, address: '' }, o);
const PROJ = [
  J('P_ROTC', { name: 'ROTC Demo Course', client: 'A & Z Demo Builders, Inc.', autoPO: 'T724', status: 'active', created: '2026-10-20', address: 'Somerville TN' }),
  J('P_BW', { name: 'Zoo Boardwalk Redecking', client: 'A & Z Demo Builders, Inc.', autoPO: 'U807', contract: 119045, scope: 'decking' }),
  J('P_CEIL', { name: 'Somerville ceilings', client: 'A & Z Demo Builders, Inc.', autoPO: 'H393', contract: 50980, address: 'Somerville TN', qbInvoiceNums: ['1078'] }),
  J('P_OFF', { name: 'New Office', client: 'Office', autoPO: 'O046', address: '6382 Stage Rd' }),
  J('P_BATH', { name: 'EAN- Bathroom remodel Mt Moriah', client: 'EAN Demo Holdings', autoPO: 'O229', contract: 15178.59, address: '2675 Mt Moriah' }),
  J('P_COLL', { name: 'Collierville New Build', client: 'EAH Demo Holdings', autoPO: 'A808', status: 'bidding', contract: 2500000 }),
  J('P_CHURCH', { name: 'EAN Holdings- 600 W. church St.- remodel', client: 'EAN Demo Holdings', autoPO: 'A001', contract: 88359.7, address: '600 W Church Street Lexington' }),
  J('P_PATIO', { name: 'Eaves Demo — Allgyer Patio (449 E Lawnwood)', client: 'Eaves Demo Construction', autoPO: 'W318', contract: 34185, address: '449 E Lawnwood Dr', qbInvoiceNums: ['1058'] }),
  J('P_LOCH', { name: 'Eaves Demo — 4071 Loch Meade Dr Renovation', client: 'Eaves Demo Construction', autoPO: 'M291', contract: 41720.11, address: '4071 Loch Meade Dr' }),
  J('P_NEW', { name: 'New kitchen demo', client: 'Nora Demo', autoPO: 'K900', status: 'active', created: '2026-11-20', contract: 20000 })];
const Q = (id, num, o) => Object.assign({ id, type: 'client', source: 'quickbooks', by: 'QuickBooks import', qbKey: 'QB:invoice:' + num + ':demo', qbNum: num, invNum: num, importedHistory: true, noSend: true, status: 'paid', paid: true, date: '2026-10-12', dueDate: '2026-11-11' }, o);
const INVS = [
  Q('I_1130', '1130', { client: 'A & Z Demo Builders, Inc.', amt: 50980, desc: 'QuickBooks invoice #1130 — PO# J-7009', pid: 'P_ROTC', po: 'T724', autoLinked: true, status: 'overdue', paid: undefined, openBalance: 28140 }),
  Q('I_1131', '1131', { client: 'A & Z Demo Builders, Inc.', amt: 128045, desc: 'QuickBooks invoice #1131 — Cat Country Boardwalk replacement\n-added handrails and footrails-$44,500.00\n-added Framing repairs- $2,000', pid: 'P_ROTC', po: 'T724', autoLinked: true, status: 'overdue', paid: undefined, openBalance: 19104.5 }),
  Q('I_1078', '1078', { client: 'A & Z Demo Builders, Inc.', amt: 48180, desc: 'PO# 6160-12', pid: 'P_CEIL', qbKey: '', source: 'quickbooks', date: '2026-06-30' }),
  Q('I_1132', '1132', { client: 'City of Demoville', amt: 10000, desc: 'QuickBooks invoice #1132 — All work completed in the engineering office', pid: 'P_OFF', po: 'O046', autoLinked: true }),
  Q('I_1125', '1125', { client: 'Misty Demo', amt: 2750, desc: 'QuickBooks invoice #1125 — Installing new fence', pid: '', status: 'overdue', paid: undefined }),
  Q('I_1106', '1106', { client: 'EAH Demo Holdings', amt: 15178.59, desc: 'QuickBooks invoice #1106 — all work Provided for the Upgraded ADA bathroom at 2675 Mt. Moriah store', pid: 'P_COLL', po: 'A808', linkedBy: "QuickBooks history import (the customer's only job)" }),
  Q('I_1124', '1124', { client: 'Eaves Demo Construction', amt: 1200, desc: 'QuickBooks invoice #1124 — Painting the exterior cornice paint @4924 maple walk', pid: 'P_PATIO', po: 'W318', autoLinked: true }),
  Q('I_1058', '1058', { client: 'Eaves Demo Construction', amt: 34185, desc: 'All Change orders to the patio & outdoor kitchen @ 449 E Lawnwood Dr.', pid: 'P_PATIO', qbKey: '', date: '2026-02-02' }),
  Q('I_MAN', '1140', { client: 'A & Z Demo Builders, Inc.', amt: 999, desc: 'QuickBooks invoice #1140 — misc', pid: 'P_ROTC', pidManual: true, linkedBy: 'Office Demo (invoice re-check)' }),
  /* CRM-made invoices */
  { id: 'C_BW1', type: 'client', pid: 'P_BW', po: 'U807', client: 'A & Z Demo Builders, Inc.', amt: 29761.25, date: '2026-08-17', dueDate: '2026-09-16', sentDate: '2026-08-17', status: 'overdue', drawType: 'Draw to 25%', createdBy: 'auto-draw', desc: 'Draw to 25% at 30% complete — Zoo Boardwalk Redecking' },
  { id: 'C_BW2', type: 'client', pid: 'P_BW', po: 'U807', client: 'A & Z Demo Builders, Inc.', amt: 29761.25, date: '2026-09-11', dueDate: '2026-10-11', sentDate: '2026-09-11', status: 'overdue', drawType: 'progress', _autoDrafted: true, by: 'Auto (progress billing)', desc: 'Progress billing - Draw #1 (25%) - Zoo Boardwalk Redecking' },
  { id: 'C_BATH', type: 'client', pid: 'P_BATH', po: 'O229', client: 'EAN Demo Holdings', amt: 15178.59, date: '2026-07-29', dueDate: '2026-08-28', sentDate: '2026-07-29', status: 'overdue', drawType: 'Final (100%)', desc: 'Final invoice — EAN- Bathroom remodel Mt Moriah' },
  { id: 'C_NEWJOB', type: 'client', pid: 'P_NEW', po: 'K900', client: 'Nora Demo', amt: 5000, date: '2026-11-21', dueDate: '2026-11-25', sentDate: '2026-11-21', status: 'sent', desc: 'Deposit' },
  { id: 'C_LATE', type: 'client', pid: 'P_LOCH', po: 'M291', client: 'Eaves Demo Construction', amt: 700, date: '2026-11-22', created: '2026-11-22', status: 'draft', desc: 'Change order typed after go-live' },
  { id: 'S_BILL', type: 'sub', sub: 'Demo Insulation LLC', amt: 875, desc: 'QuickBooks bill #222 — Batt Insulation installed at 4071 Loche Meade Dr. Lakeland Tn.', recvDate: '2026-05-01', pid: '' },
  { id: 'S_PAINT', type: 'sub', sub: 'FARRELL CALHOUN DEMO INC', amt: 93.11, desc: 'QuickBooks bill #012128755', recvDate: '2026-10-15', pid: '' }];
const CUST = [{ id: 'CU_EAN', name: 'EAN Demo Holdings', source: 'QuickBooks' }, { id: 'CU_EAH', name: 'EAH Demo Holdings', source: 'QuickBooks' }];
const AMAP = Object.assign(C.aliasMap(CUST), { 'eah demo holdings': 'ean demo holdings' });
/* the test's own alias (the real one is EAH Holdings → EAN Holdings) */
C.ALIAS['eah demo holdings'] = 'ean demo holdings';

/* 1. the matcher */
const byId = Object.fromEntries(INVS.map(v => [v.id, v]));
const m1131 = C.match(byId.I_1131, PROJ, { amap: AMAP, invs: INVS });
ok(m1131.top && m1131.top.pid === 'P_BW' && m1131.level !== 'weak', 'T724 case: "Cat Country Boardwalk replacement" → the Zoo Boardwalk job is suggested (not ROTC)', [m1131.level, m1131.top && m1131.top.pid, m1131.top && m1131.top.why]);
ok(!C.sureJob(byId.I_1131, PROJ, { amap: AMAP }), 'T724 case: …as a suggestion for a person — not linked by itself (no PO / address / QB project)');
const m1130 = C.match(byId.I_1130, PROJ, { amap: AMAP, invs: INVS });
ok(m1130.level === 'weak' && !m1130.pid, 'A & B case: an invoice with only the customer name (and an amount that QuickBooks already billed on that job) is never linked', [m1130.level, m1130.list.map(x => [x.pid, x.score, x.why])]);
const fakeCust = { id: 'X1', type: 'client', client: 'A & Z Demo Builders, Inc.', amt: 100, desc: 'misc', pid: '' };
ok(!C.sureJob(fakeCust, PROJ, { amap: AMAP }) && C.match(fakeCust, PROJ, { amap: AMAP }).level === 'weak', 'A & B case: the customer alone → "needs a job", not its first job');
const m1106 = C.match(byId.I_1106, PROJ, { amap: AMAP, invs: INVS });
ok(m1106.level === 'sure' && m1106.pid === 'P_BATH', 'EAH #1106 (2675 Mt. Moriah, ADA bathroom) → the Mt Moriah bathroom job, sure (address + name + contract; EAH = EAN)', [m1106.level, m1106.top && m1106.top.pid, m1106.top && m1106.top.why]);
ok(!C.match(byId.I_1132, PROJ, { amap: AMAP }).list.some(x => x.pid === 'P_OFF'), 'a customer\'s invoice is never matched to GrayCo overhead ("New Office")');

/* 2. the audit */
const A = C.audit(INVS, PROJ, { amap: AMAP }); const V = Object.fromEntries(A.map(r => [r.id, r]));
ok(V.I_1131 && V.I_1131.verdict === 'wrong' && V.I_1131.sug.pid === 'P_BW', 'audit: #1131 on ROTC is WRONG, suggestion Zoo Boardwalk', V.I_1131);
ok(V.I_1130 && V.I_1130.verdict === 'suspect', 'audit: #1130 (customer name only) is SUSPECT — the office decides', V.I_1130);
ok(V.I_1132 && V.I_1132.verdict === 'wrong', 'audit: a customer invoice on "New Office" (overhead) is WRONG', V.I_1132);
ok(V.I_1106 && V.I_1106.verdict === 'wrong' && V.I_1106.sug.pid === 'P_BATH', 'audit: EAH #1106 on Collierville New Build is WRONG → the bathroom job', V.I_1106);
ok(V.I_1125 && V.I_1125.verdict === 'needs a job', 'audit: Misty\'s #1125 with no job and nothing to go on "needs a job"', V.I_1125);
ok(V.I_1124 && V.I_1124.verdict === 'suspect', 'audit: #1124 (4924 Maple Walk) on the Lawnwood patio job is SUSPECT (customer only)', V.I_1124);
ok(V.I_1058 && V.I_1058.verdict === 'ok', 'audit: #1058 (QuickBooks lists it on the job + the address) is OK', V.I_1058);
ok(V.I_MAN && V.I_MAN.verdict === 'manual', 'manual-link-kept: a link a person made is "manual" — never second-guessed', V.I_MAN);
ok(!A.some(r => /^C_|^S_/.test(r.id)), 'the audit lists QuickBooks customer invoices only');

/* 3. "view" */
ok(C.poCell({ id: 'v', pid: '', po: '' }, PROJ) === '—' && C.poCell({ id: 'v', pid: '', po: 'view' }, PROJ) === '—', '"view" case: no job and no PO → "—", never the word "view"');
ok(C.poCell({ id: 'v', pid: 'P_BW', po: 'T724' }, PROJ) === 'U807', 'the PO column is the job\'s PO (not a stale PO copied onto the invoice)');

/* 4. relink */
const r1 = C.relink(byId.I_1131, PROJ[1], { by: 'Office Demo', at: '2026-11-19T15:00:00.000Z' });
ok(r1.pid === 'P_BW' && r1.po === 'U807' && r1.pidManual === true && !r1.autoLinked && r1.linkLog.length === 1 && r1.linkLog[0].from === 'P_ROTC' && r1.linkLog[0].by === 'Office Demo', 'relink: the job, its PO, kept for good (pidManual), logged from → to, by whom', r1);
const r0 = C.relink(byId.I_1132, null, { by: 'Office Demo' });
ok(r0.pid === '' && r0.noAutoLink === true && r0.po === '' && r0.pidManual === true, 'leave with no job: no job, the copied PO cleared, finders leave it alone (noAutoLink)', r0);

/* 5. the old finders in the page: FINDJOB never links on the customer alone and leaves a person's link alone */
const FJ = blockAt('if(window.__GC_FINDJOB__) return;');
if (FJ) {
  const win = { _crm: { projects: [], invs: [] }, __GC_BEAT: () => {}, __GC_WAIT: () => {} };
  const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {} }, hidden: true };
  const ctx = vm.createContext({ window: win, document: doc, setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, console: { log() {}, warn() {} }, Promise, Date, JSON, Math, String, Array, Object, RegExp });
  win.window = win; vm.runInContext(FJ, ctx);
  const one = [{ id: 'PJ1', name: 'Hollis Demo Duplex', client: 'Ray Demo Hollis', address: '88 Hollis Rd', autoPO: 'K101', status: 'active' }];
  ok(win._gcJobForInvoice({ type: 'client', client: 'Ray Demo Hollis', desc: 'draw 2' }, one) === null, 'FINDJOB: the customer of ONE job alone no longer links (a suggestion only)');
  ok(win._gcJobForInvoice({ type: 'sub', desc: 'Tear-off at 88 Hollis Road' }, one) === one[0], 'FINDJOB: the address still links by itself (sure)');
} else ok(false, 'FINDJOB block found');
ok(/INVLINK-C2/.test(html) && /if \(i\.noAutoLink \|\| i\.pidManual\) return i;/.test(html), 'LCLEAN-Q sweep: only a SURE job, and never over a person\'s choice');
ok(/INVLINK-C3/.test(html), 'QuickBooks history import: no job from the customer\'s name alone');

/* 6. QuickBooks-only cleanup */
const L0 = { invs: INVS, projects: PROJ, customers: CUST };
const pl = C.plan(L0, { today: '2026-11-19' });
const arch = pl.archive.map(x => x.id).sort(), merg = Object.fromEntries(pl.merge.map(x => [x.id, x.into]));
ok(arch.join() === 'C_BW1,C_BW2', 'cleanup: the two auto draws on the past boardwalk job (no QuickBooks twin) are archived "not in QuickBooks"', pl.archive);
ok(merg.C_BATH === 'I_1106', 'cleanup: the CRM "Final invoice" = QuickBooks #1106 (same company EAH/EAN, same amount) → merged into it', pl.merge);
ok(!arch.concat(Object.keys(merg)).some(x => x === 'C_NEWJOB' || x === 'C_LATE'), 'cleanup: a new job\'s invoice and an invoice typed after go-live are untouched', [arch, merg]);
ok(!arch.concat(Object.keys(merg)).some(x => /^I_/.test(x)), 'cleanup: QuickBooks invoices are never archived');
ok(Math.abs(pl.totals.arOut - (29761.25 * 2 + 15178.59)) < 0.01 && pl.totals.overdueCount === 3, 'cleanup: what leaves A/R and overdue is reported', pl.totals);
const cm = pl.customerMerge[0];
ok(cm && cm.keepId === 'CU_EAN' && cm.dropIds.join() === 'CU_EAH' && cm.qbTwoCustomers === true, 'customer merge: EAH → EAN, the keeper has more jobs / invoices, QuickBooks has two customers (office merges there too)', cm);
const res = C.apply(L0, pl, { by: 'Office Demo', at: '2026-11-19T16:00:00.000Z', id: 'T1' });
const RI = Object.fromEntries(res.invs.map(v => [v.id, v]));
ok(res.invs.length === INVS.length, 'apply: nothing is deleted');
ok(RI.C_BW1.type === 'archived' && RI.C_BW1._typeWas === 'client' && /not in QuickBooks/.test(RI.C_BW1._archived.why) && RI.C_BW1._archived.by === 'Office Demo', 'apply: archived = type "archived" (+ was, why, who, when) — off every client list and total', RI.C_BW1);
ok(RI.C_BATH._dupOf === 'I_1106' && RI.C_BATH.type === 'archived', 'apply: the merged copy points at its QuickBooks invoice (_dupOf)', RI.C_BATH);
ok(RI.I_1106.client === 'EAN Demo Holdings' && RI.I_1106._clientWas === 'EAH Demo Holdings', 'apply: EAH\'s invoices now say EAN', RI.I_1106);
const RP = Object.fromEntries(res.projects.map(p => [p.id, p])), RC = Object.fromEntries(res.customers.map(c => [c.id, c]));
ok(RP.P_COLL.client === 'EAN Demo Holdings' && RP.P_COLL.customerId === 'CU_EAN', 'apply: EAH\'s jobs now belong to EAN', RP.P_COLL);
ok(RC.CU_EAH._mergedInto === 'CU_EAN' && RC.CU_EAH.archived === true && (RC.CU_EAN.aliases || []).includes('EAH Demo Holdings'), 'apply: the EAH record is archived as merged into EAN (kept), "EAH" is an alias of EAN', [RC.CU_EAH, RC.CU_EAN]);
ok(C.custKey('EAH Demo Holdings', C.aliasMap(res.customers)) === C.custKey('EAN Demo Holdings', C.aliasMap(res.customers)), 'the alias makes a future "EAH" invoice match EAN');
const pl2 = C.plan({ invs: res.invs, projects: res.projects, customers: res.customers }, { today: '2026-11-19' });
ok(pl2.totals.records === 0 && pl2.customerMerge.filter(x => x.dropIds.length).length === 0, 'apply twice: nothing left to do', pl2.totals);
const un = C.undo({ invs: res.invs, projects: res.projects, customers: res.customers }, res.log, '2026-11-19T17:00:00.000Z');
const clean = l => JSON.stringify(l.map(r => { const o = {}; Object.keys(r).sort().forEach(k => { if (r[k] !== null && k !== 'updatedAt') o[k] = r[k]; }); return o; }));
const sorted = l => JSON.stringify(l.map(r => { const o = {}; Object.keys(r).sort().forEach(k => { if (k !== 'updatedAt') o[k] = r[k]; }); return o; }));
ok(clean(un.invs) === sorted(INVS) && clean(un.projects) === sorted(PROJ) && clean(un.customers) === sorted(CUST), 'Undo: every invoice, job and customer is back as it was (a field that was not there comes back empty)');
ok(un.invs.find(v => v.id === 'C_BATH').updatedAt === '2026-11-19T17:00:00.000Z' && res.invs.find(v => v.id === 'C_BATH').updatedAt === '2026-11-19T16:00:00.000Z', 'apply / undo stamp updatedAt, so every device takes the newer record');
ok(!C.isArchived(un.invs.find(v => v.id === 'C_BATH')), 'after Undo the copy counts again');

/* 7. past jobs */
ok(C.isPastJob(PROJ[1]) && C.isPastJob(PROJ[0]) && !C.isPastJob(PROJ[9]), 'past job: finished, or made before 2026-11-19 (ROTC, made 10/20, too); a job made 11/20 is current');

/* 8. payables */
const lists = { subs: [{ name: 'Demo Plumbing', isSub: true, trade: 'Plumbing', w9: true }, { name: 'FARRELL CALHOUN DEMO INC', isSub: true }, { name: 'Westdemo', isSub: true }, { name: 'ABC Demo Supply', isSub: false }], vendors: [], overrides: {} };
ok(C.payeeKind('Demo Plumbing', lists).kind === 'sub', 'payee: a trade / W-9 on file → sub');
ok(C.payeeKind('FARRELL CALHOUN DEMO INC', lists).kind === 'supplier', 'payee: a paint store imported from QuickBooks as isSub → supplier (by its name)');
ok(C.payeeKind('ABC Demo Supply', lists).kind === 'supplier', 'payee: not a sub on the vendor list → supplier');
ok(C.payeeKind('Westdemo', lists).kind === 'unclear', 'payee: nothing to go on → unclear ("is this a sub?")');
ok(C.payeeKind('Westdemo', Object.assign({}, lists, { overrides: { westdemo: 'sub' } })).kind === 'sub', 'payee: a person\'s answer wins');
ok(C.payableKind({ payeeType: 'supplier', sub: 'Demo Plumbing' }, lists).kind === 'supplier' && C.payableKind({ subinv: true, sub: 'Westdemo' }, lists).kind === 'sub', 'a bill set by hand, or sent from the sub portal, is what it says');
const mb = C.matchPayable(byId.S_BILL, PROJ, { amap: AMAP });
ok(mb.level === 'sure' && mb.pid === 'P_LOCH', 'a bill naming "4071 Loche Meade Dr" → the Loch Meade job (address, a typo forgiven), sure', [mb.level, mb.top && mb.top.why]);
ok(C.matchPayable(byId.S_PAINT, PROJ, { amap: AMAP }).level === 'none', 'a paint bill with nothing on it → no guess (stays Assign…)');
const PJS = PROJ.concat([J('P_SUBJOB', { name: 'Demo deck', client: 'Pat Demo', autoPO: 'Z100', status: 'active', subs: [{ name: 'Demo Framing Co', startDate: '2026-08-01', endDate: '2026-08-30' }] })]);
const ms = C.matchPayable({ id: 'b', type: 'sub', sub: 'Demo Framing Co', recvDate: '2026-08-20', desc: 'QuickBooks bill #1 — labor' }, PJS, {});
ok(ms.top && ms.top.pid === 'P_SUBJOB' && ms.level !== 'sure', 'a sub\'s bill around the dates of its job → that job, suggested (not linked by itself)', [ms.level, ms.top && ms.top.why]);
ok(C.matchPayable({ id: 'b2', type: 'sub', sub: 'X', portalPid: 'P_BW', desc: '' }, PROJ, {}).pid === 'P_BW', 'a bill from the sub portal keeps the job the sub picked');

/* 9. the page hooks */
ok(html.includes('/* INVLINK-B1: the job\'s PO, never "view" */') && !html.includes('children:[W.po||"view"," 📄"]'), 'page: the client PO cell no longer prints "view"');
ok(html.includes('INVLINK-B2: Client · Sub · Supplier'), 'page: three tabs Client · Sub · Supplier');
ok(html.includes('INVLINK-B3: the guesses first'), 'page: a bill\'s Assign… list starts with the guesses');
ok(html.includes('INVLINK-D1') && html.includes('INVLINK-D2') && html.includes('INVLINK-D3'), 'page: the three automatic draw makers skip past jobs');
const t3 = jw._gcInvLink && typeof jw._gcInvLink.tabs; ok(t3 === 'undefined' || t3 === 'function', 'tabs() is a page-only helper');

/* 10. server */
const req = createRequire(import.meta.url);
const SL = req(path.join(ROOT, 'netlify/functions/_lib/invlink.js'));
ok(SL.notCounted(INVS.find(v => v.id === 'C_BW1'), PROJ[1]) === true, 'server: a CRM auto draw on a past job is not counted (no statement, no reminder)');
ok(SL.notCounted(INVS.find(v => v.id === 'I_1131'), PROJ[0]) === false, 'server: a QuickBooks invoice still counts');
ok(SL.notCounted(INVS.find(v => v.id === 'C_NEWJOB'), PROJ[9]) === false, 'server: a current job\'s invoice still counts');
ok(SL.notCounted({ type: 'archived', _typeWas: 'client' }, PROJ[9]) === true, 'server: an archived invoice never counts');
const x10 = fs.readFileSync(path.join(ROOT, 'netlify/functions/x10-scheduled.js'), 'utf8'), ar = fs.readFileSync(path.join(ROOT, 'netlify/functions/_lib/auto-ar.js'), 'utf8');
ok(/invlink\.js'\)\.notCounted\(r, p\)/.test(x10) && /invlink\.js'\)\.notCounted\(r, p\)/.test(ar), 'server: monthly statements and past-due reminders use it');
ok(SL.OLDER_BEFORE === C.OLDER_BEFORE, 'one go-live day on both sides (' + SL.OLDER_BEFORE + ')');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
