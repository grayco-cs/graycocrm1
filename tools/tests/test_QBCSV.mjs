// test_QBCSV.mjs [build-dir] [shot-dir] — patch QBCSV (owner 11/13: QuickBooks CSV → jobs by the memo; "it put lots of sub invoices in the
// system but it didn't read anything for projects"; re-importing never duplicates, only updates; QB # everywhere; QuickBooks PDFs).
// Made-up data only (tools/tests/fixtures/qbcsv/*.csv).
//  A. the parser (node): title lines, quoted commas, $ / (negatives), totals / footers, headings, A/R + P&L lines taken once, per-job lines.
//  B. the matcher (node): PO, address (typo), job name, customer, Customer:Job, Class, remembered memo, ambiguous → picker.
//  C. the plan (node): what each row becomes, the same file twice → 0 new, a changed amount + memo job → 1 update + job filled,
//     a person's job kept with ⚠, old 'QB:bill:<num>:<vendor>' records found, void flagged, cost rows like an e-mailed sub invoice.
//  D. QB # (node): read from qbNum / qbKey / invNum / "QuickBooks bill #…", search "QB 85378" / "#85378".
//  E. qb-files.js (node, QuickBooks + storage stubbed): GETs only, attachments stored once by hash, not connected / expired, PDF text.
//  F. the CRM (Chromium, index.html's own patch QBCSV script in a stubbed page): 📁 Upload Documents → a CSV opens the import (no job),
//     preview, picker, Import → summary, records in the lists, memo remembered, ↩ Undo restores; office allowed, crew refused;
//     patch J's door routes here; 🔗 QuickBooks ↔ CRM puts no-job bills on their jobs (+ cost row) with Undo; the QB # badge.
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 1200) : '')); };
const FX = f => fs.readFileSync(path.join(BUILD, 'tools/tests/fixtures/qbcsv', f), 'utf8');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const block = (re) => { const i = html.search(re); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const SRC = block(/__GC_PATCH_QBCSV__ — /);
ok('A0 index.html has the patch QBCSV block', SRC.length > 20000, SRC.length);
const sandbox = { window: {} }; vm.createContext(sandbox); vm.runInContext(SRC, sandbox);
const M = sandbox.window._gcQbMatch;
ok('A0b the pure core loads in node without a page', !!M && typeof M.parseReport === 'function' && typeof M.matchJob === 'function');

/* ── the made-up CRM ── */
const PROJ = [
  { id: 'PJ1', name: 'Smith Roof Replacement', client: 'John Smith', address: '1234 Oak Ridge Dr, Demo City, TN', autoPO: 'P1001', status: 'active', type: 'Residential Reno' },
  { id: 'PJ2', name: 'Jones Kitchen Remodel', client: 'Mary Jones', address: '77 Maple Cove, Demo City, TN', autoPO: 'T2002', status: 'active', type: 'Residential Reno' },
  { id: 'PJ3', name: 'Baker Water Loss', client: 'Bob Baker', address: '450 Elm St, Demo City, TN', autoPO: 'M3003', status: 'active', companyId: 'mitigation', type: 'Water Damage' },
  { id: 'PJ4', name: 'Smith Garage', client: 'John Smith', address: '9 Pine Ln, Demo City, TN', autoPO: 'P1004', status: 'active', type: 'Residential Reno' },
  { id: 'PJ5', name: 'Lee Asbestos Abatement', client: 'Lee Holdings LLC', address: '3161 Hwy 64, Demo City, TN', autoPO: 'E5005', status: 'active', companyId: 'environmental' },
  { id: 'PJX', name: 'Old Lost Bid', client: 'Zed Nobody', address: '1 Nowhere Rd', autoPO: 'P0001', status: 'lost' }
];
const byKind = (P, k) => P.recs.filter(r => r.kind === k);

/* ═════ A. parser ═════ */
{
  const P = M.parseReport(FX('transaction_list.csv'));
  ok('A1 Transaction List: the heading row is found under the title lines; kind + label', !P.error && P.kind === 'transactions' && P.headerRow === 5, [P.error, P.kind, P.headerRow]);
  const inv = P.recs.find(r => r.num === '5001');
  ok('A2 quoted comma in the memo, "$12,500.00", M/D/YYYY date', inv && inv.memo === 'PO P1001 - roof, tear off & replace' && inv.amount === 12500 && inv.date === '2026-10-02' && inv.kind === 'invoice' && inv.side === 'income', inv);
  const ex = P.recs.find(r => r.name === 'Demo Lumber Yard' && r.kind === 'expense');
  ok('A3 (642.17) and -325.00 are amounts (money out shown positive); a check keeps its number', ex && ex.amount === 642.17 && P.recs.find(r => r.num === '1102').amount === 325, ex);
  ok('A4 TOTAL / blank / "Accrual Basis …" footer lines are not transactions', !P.recs.some(r => /total|accrual/i.test(r.name + r.memo)) && P.recs.length === 12, P.recs.length);
  ok('A5 kinds: bill · payment · vendor credit (negative) · bill payment · transfer · credit card expense', byKind(P, 'bill').length === 2 && byKind(P, 'payment').length === 1 && P.recs.find(r => r.kind === 'vendorcredit').amount === -50 && byKind(P, 'billpayment').length === 1 && byKind(P, 'transfer').length === 1 && P.recs.find(r => r.qbType === 'Credit Card Expense').kind === 'expense');
  ok('A6 a voided check (amount 0, memo Voided) is kept and marked void', P.recs.some(r => r.num === '1103' && r.voided));
  ok('A7 the key is the one the older importer uses (QB:<kind>:<num>:<first word of the name>)', inv.key === 'QB:invoice:5001:john' && P.recs.find(r => r.num === '85378').key === 'QB:bill:85378:demo', [inv.key]);

  const PL = M.parseReport(FX('pl_detail.csv'));
  const i10 = PL.recs.filter(r => r.num === '5010');
  ok('A8 P&L Detail: the two lines of invoice 5010 are ONE invoice of $8,400 (headings Income / Construction Income skipped; Total for / Gross Profit / Net Income skipped)', PL.kind === 'pl' && i10.length === 1 && i10[0].amount === 8400, i10);
  const b881 = PL.recs.filter(r => r.num === 'LY-881');
  ok('A9 P&L Detail: bill LY-881 with two lines for two jobs (different memos / classes) = two rows ($300 + $120), each with its class', b881.length === 2 && b881[0].amount === 300 && b881[1].amount === 120 && b881[0].klass === 'Mitigation' && b881[0].key !== b881[1].key, b881);
  ok('A10 the account comes from the section heading (Job Materials)', b881[0].account === 'Job Materials', b881[0].account);

  const TD = M.parseReport(FX('txn_detail_by_account.csv'));
  const i20 = TD.recs.filter(r => r.num === '5020'), c1110 = TD.recs.filter(r => r.num === '1110');
  ok('A11 Transaction Detail by Account: invoice 5020 under A/R AND under the income account → once, $3,300, with the income lines\' memo', TD.kind === 'detail' && i20.length === 1 && i20[0].amount === 3300 && i20[0].memo === 'Baker Water Loss - mitigation', i20);
  ok('A12 … check 1110 under Checking and under Subcontractors → once, $950, category Subcontractors', c1110.length === 1 && c1110[0].amount === 950 && c1110[0].account === 'Subcontractors', c1110);

  const BL = M.parseReport(FX('bill_list.csv'));
  const b400 = BL.recs.find(r => r.num === '85400');
  ok('A13 Bill List: Vendor = the name, the Customer column = the job (Customer:Job), Open Balance read', BL.kind === 'billlist' && b400.name === 'Demo Electric Co' && b400.cust === 'Smith, John:Smith Garage' && b400.open === 2250 && b400.kind === 'bill', b400);
  const IL = M.parseReport(FX('invoice_list.csv'));
  ok('A14 Invoice List: No. / Customer / Location (class) / Open Balance', IL.kind === 'invoicelist' && IL.recs.length === 2 && IL.recs[0].klass === 'Environmental' && IL.recs[1].open === 1000 && IL.recs[0].name === 'Lee Holdings LLC', IL.recs);
  const EX = M.parseReport(FX('expenses.csv'));
  ok('A15 Expenses export (no title): Payee / Category / Total', EX.recs.length === 2 && EX.recs[0].name === 'Demo Rentals' && EX.recs[0].amount === 410 && EX.recs[0].account === 'Equipment Rental' && EX.recs[1].kind === 'check', EX.recs);
  const SC = M.parseReport(FX('sales_by_customer.csv'));
  ok('A16 Sales by Customer Detail: the customer heading is the name; two product lines = one invoice of $1,500', SC.kind === 'salesbycustomer' && SC.recs.length === 1 && SC.recs[0].name === 'Mary Jones' && SC.recs[0].amount === 1500, SC.recs);
  const bad = M.parseReport('hello,world\n1,2\n');
  ok('A17 not a QuickBooks report → a plain message', !!bad.error && !bad.recs.length);
  ok('A18 dates: 10/3/26, 2026-10-03, Oct 3, 2026, 3-Oct-2026', ['10/3/26', '2026-10-03', 'Oct 3, 2026', '3-Oct-2026'].every(d => M.ymd(d) === '2026-10-03'));
  ok('A19 money: "$1,234.56" (1,234.56) -1,234.56 1,234.56- 1,234.56CR', M.num('$1,234.56') === 1234.56 && M.num('(1,234.56)') === -1234.56 && M.num('-1,234.56') === -1234.56 && M.num('1,234.56-') === -1234.56 && M.num('1,234.56CR') === -1234.56);
  const tsv = M.parseReport('Date\tTransaction Type\tNum\tName\tMemo/Description\tAmount\n10/02/2026\tInvoice\t9\tA B\t"x, y"\t10.00\n');
  ok('A20 a tab-separated export works too', tsv.recs.length === 1 && tsv.recs[0].memo === 'x, y', tsv.recs);
  const dc = M.parseReport('Date,Type,Num,Name,Memo,Debit,Credit\n10/02/2026,Check,5,Demo Co,P1001,100.00,\n');
  ok('A21 Debit / Credit columns', dc.recs.length === 1 && dc.recs[0].amount === 100, dc.recs);
}

/* ═════ B. matcher ═════ */
{
  const J = M.jobIndex(PROJ), m = (o, mm) => M.matchJob(o, { jobs: J, memoMap: mm || {} });
  const a = m({ memo: 'PO P1001 - roof, tear off & replace', side: 'income', name: 'John Smith' });
  ok('B1 the CRM PO in the memo → the job, high confidence', a.pid === 'PJ1' && a.conf >= 95 && a.how === 'po', a);
  const b = m({ memo: 'ROUGH IN, 1234 Oak Rdge Dr', side: 'cost', name: 'Demo Electric Co' });
  ok('B2 the street address in the memo (number + street, a typo forgiven)', b.pid === 'PJ1' && b.how === 'address' && b.conf >= 90, b);
  const c = m({ memo: 'dumpster 77 maple cove', side: 'cost' });
  ok('B3 "77 maple cove" → Jones Kitchen (77 Maple Cove)', c.pid === 'PJ2', c);
  const d = m({ memo: 'Baker water loss - primer', side: 'cost' });
  ok('B4 the job name in the memo', d.pid === 'PJ3' && d.how === 'name', d);
  const e = m({ memo: 'John Smith', side: 'cost' });
  ok('B5 a customer with TWO jobs (John Smith) → no guess: both offered (the picker)', !e.pid && e.cands.length >= 2 && e.cands.slice(0, 2).map(x => x.pid).sort().join() === 'PJ1,PJ4', e);
  const f = m({ memo: 'panel swap', cust: 'Smith, John:Smith Garage', side: 'cost' });
  ok('B6 the Customer:Job column picks the right one of the customer\'s jobs', f.pid === 'PJ4', f);
  const g = m({ memo: '', klass: 'Baker Water Loss', side: 'cost' });
  ok('B7 Class / Location as a fallback', g.pid === 'PJ3', g);
  const h = m({ memo: '', name: 'Lee Holdings LLC', side: 'income' });
  ok('B8 money in: the Name column (the customer) when the memo is empty', h.pid === 'PJ5', h);
  const h2 = m({ memo: '', name: 'Lee Holdings LLC', side: 'cost' });
  ok('B9 money out: the Name column is the VENDOR — never matched to a customer', !h2.pid, h2);
  const i = m({ memo: 'unknown job', side: 'cost' }, { 'unknown job': { pid: 'PJ2' } });
  ok('B10 a memo remembered from an earlier import → that job (99%)', i.pid === 'PJ2' && i.how === 'remembered' && i.conf === 99, i);
  const k = m({ memo: '1 Nowhere Rd', side: 'cost' });
  ok('B11 a LOST job is not suggested over nothing (score drops below a sure match)', !k.pid || k.conf < 85, k);
  const l = m({ memo: '3161 US HWY 64 abatement', side: 'cost' });
  ok('B12 "3161 US HWY 64" = 3161 Hwy 64', l.pid === 'PJ5', l);
  ok('B13 company-aware: Mitigation / Environmental / Construction', M.companyOf(PROJ[2]) === 'Mitigation' && M.companyOf(PROJ[4]) === 'Environmental' && M.companyOf(PROJ[0]) === 'Construction');
  const n = m({ memo: 'draw', num: '7777', side: 'income' }); const J2 = M.jobIndex(PROJ.concat([{ id: 'PJ9', name: 'QB Num Job', client: 'Q', qbInvoiceNums: ['7777'], status: 'active' }]));
  ok('B14 a QuickBooks invoice # stored on a job (qbInvoiceNums) → that job', M.matchJob({ memo: 'draw', num: '7777', side: 'income' }, { jobs: J2 }).pid === 'PJ9' && !n.pid);
}

/* ═════ C. plan / idempotency / records ═════ */
const TODAY = '2026-11-13';
function simApply(P, ctx, pick){
  /* what the CRM's apply() does with the lists, without a page (records from the same recordsFor) */
  P.rows.forEach(r => { if (pick && pick[r.rec.key] !== undefined) { r.pid = pick[r.rec.key]; r.picked = true; M.decide(r, r.pid, ctx); if (!r.pid && r.jobPid) r.pid = r.jobPid; } });
  const out = { added: 0, updated: 0 };
  P.rows.filter(r => !r.payRow).concat(P.rows.filter(r => r.payRow)).forEach(r => {
    if (r.payRow) r.target = ctx.invs.find(x => x.id === M.madeId(r.payRow, 'T1'));
    if (!r.include) return;
    if (r.action === 'new') { const mk = M.recordsFor(r, { pid: r.pid, project: PROJ.find(p => p.id === r.pid), importId: 'T1', by: 'Test', today: TODAY, at: TODAY }); ctx.invs.push(...mk.invs); ctx.expenses.push(...mk.expenses); out.added += mk.invs.length + mk.expenses.filter(x => !x.subInvId).length; }
    else if (r.action === 'update' || r.action === 'same') { const L = r.list === 'expenses' ? ctx.expenses : ctx.invs; const i = L.findIndex(x => x.id === r.target.id); const nx = Object.assign({}, L[i]); Object.keys(r.set).forEach(f => { if (f === '__addKey') { nx.qbKeys = (nx.qbKeys || []).concat([r.set[f]]); } else nx[f] = r.set[f]; }); L[i] = nx; if (r.action === 'update') out.updated++; }
    else if (r.action === 'pay' || r.action === 'billpay') { const u = M.recordsFor(r, { pid: r.pid, importId: 'T1', today: TODAY }).updates[0]; const i = ctx.invs.findIndex(x => x.id === u.id); ctx.invs[i] = Object.assign({}, ctx.invs[i], u.set, { qbKeys: (ctx.invs[i].qbKeys || []).concat([u.addKey]) }); out.updated++; }
  });
  return out;
}
{
  const ctx = { projects: PROJ, invs: [], expenses: [], memoMap: {}, today: TODAY };
  const P = M.plan(M.parseReport(FX('transaction_list.csv')), ctx);
  const row = k => P.rows.find(r => r.rec.num === k);
  ok('C1 invoice 5001 (PO in the memo) → ➕ a client invoice on Smith Roof', row('5001').action === 'new' && row('5001').make === 'invoice' && row('5001').pid === 'PJ1' && row('5001').include, row('5001'));
  ok('C2 bill 85378 (address in the memo) → ➕ bill on Smith Roof', row('85378').make === 'bill' && row('85378').pid === 'PJ1');
  ok('C3 bill 85390 memo "John Smith" (two jobs) → no job → left out until a job is picked', row('85390').action === 'new' && !row('85390').pid && !row('85390').include && row('85390').noJob);
  ok('C4 transfer / bill payment with no bill / void → left out with a reason', row('2001') && /bill payment|marks bill/.test(row('2001').becomes) && P.rows.find(r => r.rec.kind === 'transfer').action === 'skip' && row('1103').action === 'skip', [row('2001').becomes]);
  ok('C5 "fuel" (no job anywhere) → needs a job', P.rows.find(r => r.rec.memo === 'fuel').include === false);
  const mk = M.recordsFor(row('85378'), { pid: 'PJ1', project: PROJ[0], importId: 'T1', by: 'Test', today: TODAY, at: TODAY });
  const bill = mk.invs[0], cost = mk.expenses[0];
  ok('C6 a bill = a Sub Invoice (type sub, source quickbooks, QuickBooks number, history: nothing sent) + ITS job cost row (subInvId, like an e-mailed sub invoice)',
    bill.type === 'sub' && bill.pid === 'PJ1' && bill.po === 'P1001' && bill.invNum === '85378' && bill.qbNum === '85378' && bill.source === 'quickbooks' && bill.noSend === true && bill.importedHistory === true && bill.importId === 'T1' &&
    cost.subInvId === bill.id && cost.pid === 'PJ1' && cost.type === 'expense' && cost.amt === 1800 && cost.category === 'Subcontractor', mk);
  ok('C7 the bill keeps the memo / lines / QuickBooks fields so matching can be redone (qbMemo, qbLines, qbKey)', bill.qbMemo === 'ROUGH IN, 1234 Oak Rdge Dr' && Array.isArray(bill.qbLines) && bill.qbLines.length === 1 && bill.qbKey === 'QB:bill:85378:demo');
  const e0 = M.recordsFor(row('1102'), { pid: 'PJ2', project: PROJ[1], importId: 'T1', today: TODAY }).expenses[0];
  ok('C8 a check = a paid Expense on the job (check # kept, like the bank statement import)', e0.type === 'expense' && e0.status === 'paid' && e0.checkNo === '1102' && e0.payMethod === 'Check' && e0.pid === 'PJ2' && e0.amt === 325);
  const i0 = M.recordsFor(row('5001'), { pid: 'PJ1', project: PROJ[0], importId: 'T1', today: TODAY }).invs[0];
  ok('C9 an invoice = a client invoice on the job (recorded, never sent)', i0.type === 'client' && i0.client === 'John Smith' && i0.amt === 12500 && i0.invNum === '5001' && i0.sendState === 'recorded' && i0.noReminders === true);
  const vc = M.recordsFor(P.rows.find(r => r.rec.kind === 'vendorcredit'), { pid: 'PJ2', importId: 'T1', today: TODAY }).expenses[0];
  ok('C10 a vendor credit = a cost credit (negative, type refund)', vc.amt === -50 && vc.type === 'refund');

  /* the same file twice */
  const first = simApply(P, ctx, { 'QB:bill:85390:demo': 'PJ4' });
  const P2 = M.plan(M.parseReport(FX('transaction_list.csv')), ctx);
  const c2 = M.count(P2.rows);
  ok('C11 importing the SAME file again → 0 new, 0 updates (everything "up to date" / "already in CRM")', first.added >= 6 && c2.add === 0 && c2.update === 0, { first, c2, rows: P2.rows.filter(r => r.include).map(r => [r.rec.num, r.action, r.becomes]) });
  ok('C12 the payment marked invoice 5001 part-paid the first time, and is "already" the second time', ctx.invs.find(x => x.invNum === '5001').status === 'partial' && P2.rows.find(r => r.rec.kind === 'payment').action !== 'pay', ctx.invs.find(x => x.invNum === '5001'));

  /* QuickBooks changed: an amount + a job in the memo */
  const changed = FX('transaction_list.csv').replace('"1,800.00"', '"1,950.00"').replace(',10/12/2026,Expense,,Demo Gas Station,fuel,', ',10/12/2026,Expense,,Demo Gas Station,fuel P1004,');
  const P3 = M.plan(M.parseReport(changed), ctx), c3 = M.count(P3.rows);
  const u = P3.rows.find(r => r.rec.num === '85378');
  ok('C13 a changed amount in QuickBooks → 🔄 1 update with "what changes" (amount $1,800.00 → $1,950.00), not a new bill', u.action === 'update' && u.set.amt === 1950 && /amount \$1800\.00 → \$1950\.00/.test(u.becomes) && c3.add === 1, { u: [u.action, u.becomes], c3 });
  const fuel = P3.rows.find(r => r.rec.memo === 'fuel P1004');
  ok('C14 the memo now names a job → that row is imported on it (new, it had no record)', fuel.action === 'new' && fuel.pid === 'PJ4');

  /* a record with no job in the CRM; the CSV row now matches → the job is FILLED; a person's job is KEPT with ⚠ */
  const ctx2 = { projects: PROJ, invs: [
    { id: 'INVold1', type: 'sub', pid: '', sub: 'Demo Electric Co', invNum: '85378', amt: 1800, desc: 'QuickBooks bill #85378 — ROUGH IN', source: 'quickbooks', qbKey: 'QB:bill:85378:demo', status: 'paid', date: '2026-11-01', recvDate: '2026-11-01' },
    { id: 'INVold2', type: 'sub', pid: 'PJ2', linkedBy: 'Brittany', sub: 'Demo Electric Co', invNum: '85400', amt: 2250, desc: 'QuickBooks bill #85400', source: 'quickbooks', qbKey: 'QB:bill:85400:demo', status: 'received', date: '2026-11-02', approvedBy: 'Sam' }
  ], expenses: [], memoMap: {}, today: TODAY };
  const P4 = M.plan(M.parseReport(FX('bill_list.csv').replace(',ROUGH IN,', ',ROUGH IN 1234 Oak Ridge Dr,')), ctx2);
  const r1 = P4.rows.find(r => r.rec.num === '85378'), r2 = P4.rows.find(r => r.rec.num === '85400');
  ok('C15 an OLD record (key QB:bill:85378:<vendor> from the earlier importer, no job) is found — never a second bill — and gets its job (🔗)', r1.action === 'update' && r1.target.id === 'INVold1' && r1.set.pid === 'PJ1' && r1.gotJob === 'PJ1' && /gets its job/.test(r1.becomes), [r1.action, r1.becomes, r1.set]);
  ok('C16 a job a PERSON set (and an approved bill) is kept: "⚠ … the CRM job is kept", no pid / amount overwrite', r2.action === 'update' && r2.set.pid === undefined && r2.conflicts.some(t => /another job/.test(t)) && r2.pid === 'PJ2', [r2.becomes, r2.set]);
  const P5 = M.plan(M.parseReport(FX('bill_list.csv').replace('"2,250.00","2,250.00"', '"2,400.00","2,400.00"')), ctx2);
  const r5 = P5.rows.find(r => r.rec.num === '85400');
  ok('C17 an approved bill whose amount changed in QuickBooks → ⚠ QuickBooks says $2,400.00 (the CRM amount kept)', r5.set.amt === undefined && r5.conflicts.some(t => /QuickBooks says \$2400\.00/.test(t)), r5.conflicts);
  ok('C18 the CRM paid, QuickBooks open → ⚠ (never un-paid)', (() => { const c = { projects: PROJ, invs: [{ id: 'X', type: 'sub', sub: 'Demo Electric Co', invNum: '85400', amt: 2250, source: 'quickbooks', qbKey: 'QB:bill:85400:demo', status: 'paid', paid: true }], expenses: [], today: TODAY }; const r = M.plan(M.parseReport(FX('bill_list.csv')), c).rows.find(r => r.rec.num === '85400'); return r.conflicts.some(t => /still open/.test(t)) && r.set.status === undefined; })());
  const keyed = M.plan(M.parseReport(FX('transaction_list.csv')), { projects: PROJ, invs: [{ id: 'HAND1', type: 'client', client: 'John Smith', invNum: '5001', amt: 12500, pid: 'PJ1', status: 'sent' }], expenses: [{ id: 'CARD:1', pid: 'PJ3', vendor: 'Demo Paint Store', amt: 88.40, date: '2026-10-07', cardId: 'c1', source: 'creditcard' }], today: TODAY });
  ok('C19 the same money typed in by hand (invoice #5001) or from a card import (same amount, date, vendor) → "already in CRM", not added', keyed.rows.find(r => r.rec.num === '5001').action === 'dup' && keyed.rows.find(r => r.rec.name === 'Demo Paint Store').action === 'dup' && /card import/.test(keyed.rows.find(r => r.rec.name === 'Demo Paint Store').becomes));
  const vctx = { projects: PROJ, invs: [], expenses: [{ id: 'QBX-1', qbKey: 'QB:check:1103:demo', source: 'quickbooks', amt: 99, vendor: 'Demo Dumpsters', status: 'paid', pid: 'PJ2' }], today: TODAY };
  const vr = M.plan(M.parseReport(FX('transaction_list.csv')), vctx).rows.find(r => r.rec.num === '1103');
  ok('C20 voided in QuickBooks → the CRM record is FLAGGED (qbVoided + ⚠), never deleted', vr.action === 'update' && vr.set.qbVoided === true && vr.conflicts.some(t => /VOIDED/.test(t)) && vr.set.amt === undefined, [vr.action, vr.set, vr.conflicts]);
}

/* ═════ D. QB # ═════ */
{
  ok('D1 QB # from qbNum / the key / invNum / "QuickBooks bill #…"', M.qbNum({ source: 'quickbooks', qbNum: '85378', qbKind: 'bill' }).num === '85378' && M.qbNum({ qbKey: 'QB:bill:85390:demo' }).num === '85390' &&
    M.qbNum({ source: 'quickbooks', type: 'client', invNum: '5001' }).num === '5001' && M.qbNum({ source: 'quickbooks', type: 'sub', desc: 'QuickBooks bill #LY-900 — x' }).num === 'LY-900' && M.qbNum({ qbKey: 'QB:bill:85390:demo' }).kind === 'bill');
  ok('D2 a record the CRM made itself (no QuickBooks trace) has no QB #', M.qbNum({ id: 'I1', type: 'client', invNum: '1001', source: 'crm' }) === null);
  ok('D3 a key with no number (date + cents) gives no fake number', M.qbNum({ qbKey: 'QB:expense:2026-10-12:4510:demo', source: 'quickbooks' }).num === '');
  ok('D4 the QuickBooks link only when the QuickBooks Id is known', M.qbLink(M.qbNum({ source: 'quickbooks', qbKind: 'bill', qbNum: '1', qbId: '345' })) === 'https://qbo.intuit.com/app/bill?txnId=345' && M.qbLink(M.qbNum({ source: 'quickbooks', qbNum: '1' })) === '');
  const rec = { source: 'quickbooks', qbNum: '85378', type: 'sub' };
  ok('D5 search: "QB 85378", "QB#85378", "#85378", "85378" all find it; "8537" does not', ['QB 85378', 'QB#85378', '#85378', '85378', 'qb #85378'].every(q => M.qbSearchHit(rec, q)) && !M.qbSearchHit(rec, '8537'));
}

const done = () => { const f = R.filter(x => !x).length; console.log((f ? 'FAILED ' : 'ALL PASS ') + (R.length - f) + '/' + R.length); process.exit(f ? 1 : 0); };
if (process.argv.includes('--node-only')) done();
await (await import('./test_QBCSV_server.mjs')).run({ ok, BUILD });
await (await import('./test_QBCSV_browser.mjs')).run({ ok, BUILD, SHOTS, html, PROJ, FX, block });
done();
