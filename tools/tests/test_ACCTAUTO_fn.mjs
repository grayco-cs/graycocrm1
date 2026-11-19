// test_ACCTAUTO_fn.mjs [index.html | build dir] — patch ACCTAUTO + ACCTAUTO-IMP in node (vm), MADE-UP records shaped like the live ones (11/19):
//   1. the QuickBooks import (patch J in a stub page): a bill's lines add up (tax line included); a bill payment is never a bill total;
//      a payment marks PAID the bill of exactly its amount, or the one set of bills it adds up to (with qbPaidBy on each); a payment
//      that fits nothing changes nothing (no guessed "part payment"); 0012345 = 12345 (no second copy); a "Bill Payment List" is
//      payments, not bills;
//   2. the automatic fixes (pure core): bill totals kept + qbAmountWas retired with the evidence (payment / tax / one line / the owner),
//      a total with no evidence → Needs a look; a payment hung on the wrong bill moves to the bill it is exactly; paid = open $0;
//      the leading-zero copy archived into the QuickBooks total; one register line per bill (folded, or corrected); 🔗 a SURE wrong
//      job moved and the QuickBooks-only cleanup of a past job; the plan is stable (a 2nd plan finds nothing more);
//   3. Undo per item puts every field / folded line back; a field a person changed since is left as they set it;
//   4. the page: the block, the Accounting top card, the stale gate respected, the import guard kept, the test-browser gate.
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const ARG = path.resolve(process.argv[2] || 'index.html');
const FILE = fs.statSync(ARG).isDirectory() ? path.join(ARG, 'index.html') : ARG;
const html = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const blockAt = (needle) => { const i = html.indexOf(needle); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const J = blockAt('if(window.__GC_PATCH_J__) return;'), AA = blockAt('__GC_PATCH_ACCTAUTO__'), IL = blockAt('__GC_PATCH_INVLINK__ — ');
ok(J.length > 20000 && AA.length > 10000 && IL.length > 20000, 'index.html has patch J, INVLINK and ACCTAUTO');

/* ── 1. the import (patch J in a stub page) ── */
function harness(){
  const store = {}, LS = {}, intervals = [];
  const win = { _crm: { projects: [], invs: [], expenses: [] }, __GC_IDB_READ_HOOKS__: [], _gcIsTombstoned: () => false, _gcManualNow: () => {}, _supaUpsert: async () => true, _supaUpsertNow: async () => true };
  win.idbGet = async (k) => (store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])));
  win.idbSet = async (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); };
  const localStorage = { getItem: (k) => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: (k) => { delete LS[k]; } };
  const document = { hidden: true, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }), body: { appendChild() {}, prepend() {} } };
  const setInterval = (fn) => { intervals.push(fn); return intervals.length; };
  const ctx = vm.createContext({ window: win, document, localStorage, setTimeout: () => 0, setInterval, clearInterval() {}, console: { log() {}, warn() {}, table() {} }, Promise, Date, JSON, Math, String, Array, Object, RegExp, Map, Number, isFinite, parseFloat, parseInt, confirm: () => true, alert: () => {} });
  win.window = win; win.localStorage = localStorage; win.document = document;
  return { store, LS, win, ctx };
}
const H = harness();
H.store.vendors = [{ id: 'V_LUM', name: 'Demo Lumber Co.' }, { id: 'V_PNT', name: 'Demo Paint Inc' }];
H.store.invs = []; H.store.expenses = []; H.store.customers = [];
H.win._crm.vendors = H.store.vendors;
vm.runInContext(J, H.ctx);
const W = H.win;
ok(typeof W._gcQbCsvPlan === 'function' && typeof W._gcQbCsvApply === 'function' && typeof W._gcQbBillsPaidBy === 'function', 'patch J import + _gcQbBillsPaidBy loaded in a stub page');
const CSV1 = [
  'GrayCo Demo LLC', 'Transaction List by Date', '"January 1 - December 31, 2026"', '',
  'Date,Transaction type,Num,Name,Memo/Description,Account,Amount',
  '03/02/2026,Bill,D-501,Demo Lumber Co.,2x8x16 #2 Yellow Pine,Job Materials,"-300.00"',
  '03/02/2026,Bill,D-501,Demo Lumber Co.,Sales tax,Job Materials,"-29.25"',
  '03/05/2026,Bill,0012345,Demo Lumber Co.,Deck boards,Job Materials,"-100.00"',
  '03/06/2026,Bill,D-503,Demo Lumber Co.,Nails,Job Materials,"-50.00"',
  '03/07/2026,Bill,D-504,Demo Lumber Co.,Studs,Job Materials,"-80.00"',
  '03/20/2026,Bill Payment (Check),1011,Demo Lumber Co.,,Checking,"-150.00"',
  '03/21/2026,Bill Payment (Check),1012,Demo Lumber Co.,,Checking,"-329.25"',
  '03/22/2026,Bill Payment (Check),1013,Demo Lumber Co.,,Checking,"-61.00"'].join('\n');
const P1 = await W._gcQbCsvPlan(CSV1);
const recs = (P1.rows || []).map((r) => r.rec);
const d501 = recs.find((r) => r.kind === 'bill' && r.num === 'D-501');
ok(d501 && d501.amount === 329.25 && d501.lines === 2, 'a bill on 2 lines (item + sales tax) is ONE bill of the lines added up: $329.25', d501);
ok(!recs.some((r) => r.kind === 'bill' && [150, 329.25, 61].includes(r.amount) && r.num !== 'D-501'), 'no bill payment row became a bill', recs.map((r) => [r.kind, r.num, r.amount]));
await W._gcQbCsvApply(P1);
let I = H.store.invs || [];
const B = (n) => I.find((x) => String(x.invNum) === n);
ok(B('D-501') && B('D-501').amt === 329.25 && B('D-501').status === 'paid' && (B('D-501').qbPaidBy || [])[0] && B('D-501').qbPaidBy[0].amount === 329.25, 'payment #1012 ($329.25) marks bill D-501 paid, linked (qbPaidBy)', B('D-501'));
ok(B('0012345') && B('0012345').status === 'paid' && B('D-503').status === 'paid' && (B('D-503').qbPaidBy || [])[0].bills === 2 && (B('0012345').qbKeys || []).includes('QB:billpayment:1011:demo'),
  'payment #1011 ($150) pays the TWO bills it adds up to ($100 + $50): both paid, both carry the payment', [B('0012345'), B('D-503')]);
ok(B('D-504').status !== 'paid' && !B('D-504').amountPaid && !(B('D-504').qbKeys || []).some((k) => /billpayment/.test(k)), 'payment #1013 ($61) fits no bill or set of bills → no bill gets a guessed part payment', B('D-504'));
ok(I.every((x) => !(x.amt === 150 || x.amt === 61)), 'no bill has a payment amount as its total', I.map((x) => [x.invNum, x.amt]));
ok(I.every((x) => x.status !== 'partial'), 'no bill is a "part payment" guess', I.map((x) => [x.invNum, x.status]));
/* the same bill, its number without the leading zeros */
const CSV2 = ['Date,Transaction type,Num,Name,Memo/Description,Account,Amount', '03/05/2026,Bill,12345,Demo Lumber Co.,Deck boards,Job Materials,"-109.75"'].join('\n');   /* the 11/13 case: the same bill, another total */
const n0 = (H.store.invs || []).length; const P2 = await W._gcQbCsvPlan(CSV2); await W._gcQbCsvApply(P2);
ok((H.store.invs || []).length === n0, 'bill 12345 = bill 0012345 (leading zeros), even with another total: no second copy (the guard makes it a to-do)', (P2.rows || []).map((r) => [r.action, r.why]));
/* a Bill Payment List (no type column) = payments, never bills */
const CSV3 = ['GrayCo Demo LLC', 'Bill Payment List', '"All Dates"', '', 'Date,Num,Vendor,Memo/Description,Amount', '04/01/2026,1020,Demo Paint Inc,,"31,484.70"'].join('\n');
const P3 = await W._gcQbCsvPlan(CSV3);
ok((P3.rows || []).every((r) => r.rec.kind === 'billpayment'), 'a QuickBooks Bill Payment List is read as payments, not bills', (P3.rows || []).map((r) => [r.rec.kind, r.rec.amount]));
const n1 = (H.store.invs || []).length; await W._gcQbCsvApply(P3);
ok(!(H.store.invs || []).slice(n1).some((x) => x.amt === 31484.7), '…so $31,484.70 never becomes a bill total');
/* the pure helper */
const pool = [{ id: 'a', amt: 100, status: 'received', date: '2026-01-01' }, { id: 'b', amt: 50, status: 'received', date: '2026-01-02' }, { id: 'c', amt: 50, status: 'received', date: '2026-01-03' }];
const op = (x) => x.amt;
ok(W._gcQbBillsPaidBy(pool, 100, '2026-02-01', op).length === 1, 'exact one bill wins');
ok(W._gcQbBillsPaidBy(pool, 150, '2026-02-01', op) === null, 'two different sets add up ($100+$50 twice) → no guess');
ok(W._gcQbBillsPaidBy(pool, 200, '2026-02-01', op).length === 3, 'the one set that adds up');
ok(W._gcQbBillsPaidBy(pool, 150, '2026-01-02', op).map((x) => x.id).sort().join() === 'a,b', 'only bills dated on or before the payment', W._gcQbBillsPaidBy(pool, 150, '2026-01-02', op));
const hold = W._gcQbBillAmtHold({ type: 'sub', source: 'quickbooks', amt: 49.19 }, 31484.7);
ok(/never changes a bill total/.test(hold), 'the import guard is kept: a re-import never changes a QuickBooks bill total by itself');

/* ── 2. the automatic fixes (pure core, with the real INVLINK core) ── */
const jw = {}; const jctx = vm.createContext({ window: jw, globalThis: jw, console: { log() {}, warn() {} }, JSON, Math, Date, String, Array, Object, RegExp, Promise, parseFloat, isFinite });
vm.runInContext(IL.replace("(typeof window !== 'undefined' ? window : globalThis)", '(window)'), jctx);
vm.runInContext(AA.replace("(typeof window !== 'undefined' ? window : globalThis)", '(window)'), jctx);
const C = jw._gcAcctFix && jw._gcAcctFix.core, ILC = jw._gcInvLink;
ok(C && typeof C.plan === 'function' && typeof C.undo === 'function', '_gcAcctFix pure core is there without a page');
const QB = (id, num, vk, o) => Object.assign({ id, type: 'sub', source: 'quickbooks', by: 'QuickBooks import', invNum: num, qbKey: 'QB:bill:' + num + ':' + vk, qbKeys: ['QB:bill:' + num + ':' + vk], status: 'paid', paid: true, pid: '', date: '2026-04-08', recvDate: '2026-04-08', savedAt: '2026-11-05T22:00:52.136Z', updatedAt: '2026-11-13T16:15:09.863Z' }, o);
const INVS = [
  QB('BT_TAX', '3006118', 'demo', { sub: 'Demo Supply', amt: 74.64, qbAmountWas: 68.01 }),                       // 68.01 + 9.75% = 74.64
  QB('BT_PAY', '1336', 'ross', { sub: 'Ross Demo Services', amt: 2555, qbAmountWas: 1200, qbKeys: ['QB:billpayment:2026-02-10:255500:ross'] }),
  QB('BT_LINE', '370584', 'tom', { sub: 'Tom Demo Lumber', amt: 632.45, qbAmountWas: 253.3 }),
  QB('BT_OWN', '373642', 'tom', { sub: 'Tom Demo Lumber', amt: 49.19, qbAmountWas: 31484.7, date: '2026-09-25', qbKeys: ['QB:billpayment:1011:tom'], amountPaid: 2297.91, openBalance: 29186.79 }),
  QB('BT_LOOK', '2010088752-001', 'abc', { sub: 'ABC Demo Supply', amt: 92.19, qbAmountWas: 5160 }),
  QB('PL_WRONG', '1017240209-001', 'l', { sub: 'L&W Demo', amt: 12087.63, qbAmountWas: 6745.2, qbKeys: ['QB:billpayment:1079:l'], amountPaid: 309.43, openBalance: 6435.77 }),
  QB('PL_RIGHT', '1017219460-002', 'l', { sub: 'L&W Demo', amt: 309.43, qbAmountWas: 220 }),
  QB('DUP_OLD', '9075376', 'farrell', { sub: 'FARRELL DEMO INC', amt: 85.2, date: '2026-02-17', qbKeys: ['QB:billpayment:1046:farrell'] }),
  QB('DUP_NEW', '009075376', 'farrell', { sub: 'FARRELL DEMO INC', amt: 129.94, date: '2026-02-17', savedAt: '2026-11-13T16:16:00.000Z' }),
  { id: 'UP_CR', type: 'sub', source: 'upload', sub: 'Central Demo Roofing', invNum: '0126', amt: 1690, date: '2026-08-19', status: 'paid', pid: 'PJ_PAST' },
  QB('QB_CR', '126', 'central', { sub: 'Central Demo Roofing', amt: 1600, date: '2026-08-19' }),
  QB('REG_ODD', '5555', 'demo', { sub: 'Demo Supply', amt: 900, date: '2026-06-04', savedAt: '2026-11-13T16:16:00.000Z' }),
  /* client invoices: a SURE wrong job, and a CRM draw on a past job that QuickBooks does not have */
  { id: 'IV_1106', type: 'client', source: 'quickbooks', by: 'QuickBooks import', qbKey: 'QB:invoice:1106:demo', qbNum: '1106', invNum: '1106', importedHistory: true, client: 'EAN Demo Holdings', amt: 15178.59, desc: 'QuickBooks invoice #1106 — Upgraded ADA bathroom at 2675 Mt. Moriah store', pid: 'PJ_COLL', po: 'A808', linkedBy: "QuickBooks history import (the customer's only job)", status: 'paid', paid: true, date: '2026-09-15' },
  { id: 'IV_DRAW', type: 'client', pid: 'PJ_PAST', po: 'U807', client: 'A & Z Demo Builders, Inc.', amt: 29761.25, date: '2026-08-17', dueDate: '2026-09-16', status: 'overdue', drawType: 'Draw to 25%', createdBy: 'auto-draw', desc: 'Draw to 25% at 30% complete — Zoo Demo Boardwalk', savedAt: '2026-08-17T12:00:00.000Z' }];
const PROJ = [
  { id: 'PJ_BATH', name: 'EAN- Bathroom remodel Mt Moriah', client: 'EAN Demo Holdings', autoPO: 'O229', contract: 15178.59, address: '2675 Mt Moriah', status: 'completed', created: '2026-03-02' },
  { id: 'PJ_COLL', name: 'Collierville New Build', client: 'EAN Demo Holdings', autoPO: 'A808', status: 'bidding', contract: 2500000, created: '2026-03-02' },
  { id: 'PJ_PAST', name: 'Zoo Demo Boardwalk', client: 'A & Z Demo Builders, Inc.', autoPO: 'U807', contract: 119045, status: 'completed', created: '2026-03-02' }];
const RL = (id, src, amt, o) => Object.assign({ id, _id: id, srcInvId: src, amount: amt, amt, date: '2026-11-05', desc: 'Sub paid: QuickBooks bill', type: 'expense', category: 'Subcontractor', source: 'subinvoice', status: 'paid' }, o);
const REG = [
  RL('R_PAY_OLD', 'BT_PAY', 1200), RL('R_PAY_NEW', 'BT_PAY', 2555), RL('R_PAY_SUB', 'SUB_BT_PAY', 2555, { desc: 'Ross Demo Services — QuickBooks bill #1336' }),
  RL('R_LINE_OLD', 'BT_LINE', 253.3),                                            // one line, at the old one-line number → corrected
  RL('R_DUP_OLD', 'DUP_OLD', 85.2), RL('R_DUP_NEW', 'DUP_NEW', 129.94),
  RL('R_ODD1', 'REG_ODD', 900), RL('R_ODD2', 'REG_ODD', 450),                   // a different amount: a part payment or a copy → a person
  RL('R_GONE', 'BT_TAX', 74.64), RL('R_GONE2', 'BT_TAX', 74.64)];               // R_GONE2 was deleted on another computer: never touched
const lists = () => ({ invs: JSON.parse(JSON.stringify(INVS)), reg: JSON.parse(JSON.stringify(REG)), folded: [], deletedReg: ['R_GONE2'], projects: PROJ, customers: [{ id: 'CU_EAN', name: 'EAN Demo Holdings' }],
  payKeys: ['QB:billpayment:2026-02-10:255500:ross'] });
const AT = '2026-11-19T18:00:00.000Z';
const L0 = lists();
const P = C.plan(L0, { invlink: ILC, payKeys: L0.payKeys, today: '2026-11-19', at: AT });
const it = (kind, re) => P.items.find((i) => i.kind === kind && re.test(i.title));
const inv = (id, l) => (l || P.invs).find((x) => x.id === id);
ok(inv('BT_TAX').amt === 74.64 && inv('BT_TAX').qbAmountWas === 74.64 && inv('BT_TAX')._qbAmountWasWrong === 68.01 && /9\.75% sales tax/.test(inv('BT_TAX').amtCheck.why), 'tax: $68.01 + 9.75% = $74.64 → the total stays, qbAmountWas retired (= the total, so nothing restores the old number) with the reason', inv('BT_TAX'));
ok(/bill payment of exactly \$2,555\.00/.test((inv('BT_PAY').amtCheck || {}).why || ''), 'payment: a QuickBooks bill payment of exactly $2,555.00 proves the total', inv('BT_PAY').amtCheck);
ok(/one line of this bill/.test((inv('BT_LINE').amtCheck || {}).why || ''), 'one line: $253.30 was one line of the $632.45 bill', inv('BT_LINE').amtCheck);
ok(inv('BT_OWN').amt === 49.19 && /owner confirmed/.test((inv('BT_OWN').amtCheck || {}).why || ''), '#373642: $49.19 (the owner), never $31,484.70', inv('BT_OWN'));
ok(inv('BT_OWN').openBalance === 0 && inv('BT_OWN').amountPaid === 49.19, '#373642 is paid: open $0 (not $29,186.79)', inv('BT_OWN'));
ok(inv('BT_LOOK').qbAmountWas === 5160 && P.look.some((l) => l.kind === 'billtotal' && l.ids[0] === 'BT_LOOK'), 'no evidence ($92.19 vs $5,160) → nothing changed, it is on Needs a look', P.look.filter((l) => l.kind === 'billtotal'));
ok(P.invs.every((x) => x.amt === (INVS.find((y) => y.id === x.id) || {}).amt), 'no bill total is changed by the fixes (the re-import totals are the QuickBooks totals)');
ok(!(inv('PL_WRONG').qbKeys || []).includes('QB:billpayment:1079:l') && (inv('PL_RIGHT').qbKeys || []).includes('QB:billpayment:1079:l') && inv('PL_RIGHT').qbPaidBy[0].amount === 309.43, 'payment #1079 ($309.43) moves from #1017240209-001 to the bill it is exactly', [inv('PL_WRONG').qbKeys, inv('PL_RIGHT').qbKeys]);
ok(inv('PL_WRONG').openBalance === 0 && inv('PL_WRONG').amountPaid === 12087.63, '…and #1017240209-001 (paid) reads open $0', inv('PL_WRONG'));
ok(P.look.some((l) => l.kind === 'payment' && /#1011/.test(l.title) && /2,297\.91/.test(l.title)), 'payment #1011 ($2,297.91) fits no single bill → Needs a look ("which bills did it pay?")', P.look.map((l) => l.title));
ok(inv('DUP_OLD').type === 'archived' && inv('DUP_OLD')._typeWas === 'sub' && inv('DUP_OLD')._dupOf === 'DUP_NEW' && inv('DUP_NEW').type === 'sub' && (inv('DUP_NEW').qbKeys || []).includes('QB:billpayment:1046:farrell'),
  'leading zeros: #9075376 ($85.20, one line) archived into #009075376 ($129.94) — kept, its payment key moved', [inv('DUP_OLD'), inv('DUP_NEW')]);
ok(inv('UP_CR').type === 'sub' && inv('QB_CR').type === 'sub' && P.look.some((l) => l.kind === 'dupbill' && l.ids.includes('UP_CR') && l.ids.includes('QB_CR')), 'an uploaded bill + a QuickBooks copy with a different amount → Needs a look, both kept', P.look.filter((l) => l.kind === 'dupbill'));
const regIds = P.reg.map((r) => r._id);
ok(regIds.includes('R_PAY_NEW') && !regIds.includes('R_PAY_OLD') && !regIds.includes('R_PAY_SUB') && P.folds.some((f) => f.recordId === 'R_PAY_OLD' && f.keptId === 'R_PAY_NEW'), 'register: #1336 shows once, at $2,555 (the $1,200 line and the copy folded, kept in gc_folded)', regIds);
const rl = P.reg.find((r) => r._id === 'R_LINE_OLD');
ok(rl && rl.amount === 632.45 && rl._origAmount === 253.3, 'register: a single line at the old one-line number is corrected to the bill ($632.45), the old amount kept', rl);
ok(!regIds.includes('R_DUP_OLD') && regIds.includes('R_DUP_NEW'), 'register: the archived copy\'s line folds into the kept bill\'s line', regIds);
ok(regIds.includes('R_ODD1') && regIds.includes('R_ODD2') && P.look.some((l) => l.kind === 'register' && l.ids.includes('R_ODD2')), 'register: a line of a DIFFERENT amount is not folded — Needs a look', P.look.filter((l) => l.kind === 'register'));
ok(regIds.includes('R_GONE2') && !P.folds.some((f) => f.recordId === 'R_GONE2' || f.keptId === 'R_GONE2'), 'a register line deleted elsewhere is never folded or kept', P.folds.map((f) => f.recordId));
ok(inv('IV_1106').pid === 'PJ_BATH' && !inv('IV_1106').pidManual && it('relink', /#1106/), '🔗 SURE evidence (address, job name): #1106 moves to the Mt Moriah job by itself', inv('IV_1106'));
ok(inv('IV_DRAW').type === 'archived' && inv('IV_DRAW')._typeWas === 'client' && it('qbonly', /archived: not in QuickBooks/), 'QuickBooks-only cleanup: the CRM draw on the past job is archived (not deleted)', inv('IV_DRAW'));
ok(P.items.every((i) => i.title && i.why && Array.isArray(i.changes)), 'every fix has a title, a why and its changes (for the log)');
ok(P.items.filter((i) => i.kind === 'billtotal').length === 6 && P.items.filter((i) => i.kind === 'dupbill').length === 1 && P.items.filter((i) => i.kind === 'paylink').length === 1, 'counts: 6 bill totals confirmed, 1 copy archived, 1 payment moved', P.totals);
/* stable: a second plan on the result finds nothing more of the same */
const P2b = C.plan({ invs: P.invs, reg: P.reg, folded: P.folds, deletedReg: ['R_GONE2'], projects: P.projects, customers: P.customers, payKeys: L0.payKeys }, { invlink: ILC, payKeys: L0.payKeys, today: '2026-11-19', at: AT });
ok(!P2b.items.some((i) => /^(billtotal|dupbill|register|paylink|paidopen|relink|qbonly)$/.test(i.kind)), 'run twice: the second plan has nothing to fix', P2b.items.map((i) => i.title));

/* ── 3. Undo ── */
const after = { invs: P.invs, gcAcctRegister: P.reg, folded: P.folds, projects: P.projects, customers: P.customers };
const U1 = C.undo(after, [it('billtotal', /#3006118/)], '2026-11-19T19:00:00.000Z');
ok(inv('BT_TAX', U1.invs).qbAmountWas === 68.01 && inv('BT_TAX', U1.invs).amtCheck === null, '↩ Undo one bill: qbAmountWas is back, the check note gone', inv('BT_TAX', U1.invs));
ok(inv('BT_PAY', U1.invs).qbAmountWas === 2555, '…the other bills are untouched');
const dupItem = P.items.find((i) => i.kind === 'dupbill');
const U2 = C.undo(after, [dupItem], '2026-11-19T19:00:00.000Z');
ok(inv('DUP_OLD', U2.invs).type === 'sub' && inv('DUP_OLD', U2.invs)._dupOf === null && !(inv('DUP_NEW', U2.invs).qbKeys || []).includes('QB:billpayment:1046:farrell'), '↩ Undo the copy: #9075376 is a bill again, the key back where it was', [inv('DUP_OLD', U2.invs), inv('DUP_NEW', U2.invs)]);
const regItem = P.items.find((i) => i.kind === 'register' && /#1336/.test(i.title));
const U3 = C.undo(after, [regItem], '2026-11-19T19:00:00.000Z');
ok(U3.gcAcctRegister.some((r) => r._id === 'R_PAY_OLD') && U3.gcAcctRegister.some((r) => r._id === 'R_PAY_SUB') && U3.folded.filter((f) => /R_PAY_/.test(f.recordId)).every((f) => f.unfolded), '↩ Undo the register fix: both folded lines are back, their folds marked undone', U3.gcAcctRegister.map((r) => r._id));
/* a person changed a field after the fix: Undo leaves their value */
const edited = JSON.parse(JSON.stringify(after)); edited.invs.find((x) => x.id === 'IV_1106').pid = 'PJ_PAST';
const U4 = C.undo(edited, [it('relink', /#1106/)], '2026-11-19T19:00:00.000Z');
ok(inv('IV_1106', U4.invs).pid === 'PJ_PAST' && U4.skipped.some((x) => /IV_1106\.pid/.test(x)), '↩ Undo after a person moved the invoice: their job is kept', [inv('IV_1106', U4.invs).pid, U4.skipped]);
const UA = C.undo(after, P.items, '2026-11-19T19:00:00.000Z');
const back = UA.invs.every((x) => { const o = L0.invs.find((y) => y.id === x.id); return Object.keys(o).every((k) => k === 'updatedAt' || JSON.stringify(o[k]) === JSON.stringify(x[k])); });
ok(back, '↩ Undo all: every invoice / bill field is as it was', UA.invs.filter((x) => { const o = L0.invs.find((y) => y.id === x.id); return !Object.keys(o).every((k) => k === 'updatedAt' || JSON.stringify(o[k]) === JSON.stringify(x[k])); }).map((x) => x.id));
ok(REG.every((r) => UA.gcAcctRegister.some((x) => x._id === r._id && x.amount === r.amount)), '↩ Undo all: every register line is back at its amount', UA.gcAcctRegister.map((r) => [r._id, r.amount]));

/* ── 4. the page ── */
ok(/data-af="look"/.test(AA) && /'taxcenter'/.test(AA) && /main\.insertBefore\(box, main\.firstChild\)/.test(AA), 'Accounting → the top card: ⚠ Needs a look + 🧾 Accounting fixes log');
ok(/_gcStaleGate && W\._gcStaleGate\.holdSweeps\(\)/.test(AA), 'the automatic run waits while this copy is older than the live one (stale gate)');
ok(/gc_acctfix_state/.test(AA) && /claim/.test(AA) && /runs\[CORE\.RUN_ID\]/.test(AA), 'runs once: a claim + a done marker in gc_kv (a second desk does not run it)');
ok(/navigator\.webdriver && !W\.__GC_ACCTFIX_TEST__/.test(AA), 'automated test browsers run it only when the test asks');
ok(/window\._gcQbBillAmtHold = function/.test(J), 'the import guard (REGFIX-AMT) is still there');
ok(/a bill payment's # is its check number/.test(html) && /window\._gcQbBillsPaidBy/.test(html), 'the QBCSV import uses the same bill-payment rule');

console.log('\nACCTAUTO_fn: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
