// test_ACCT100.mjs <build-dir> [shot-dir] — the accounting, end to end, as the OFFICE (office@grayco-cs.com, "Brittany Demo",
// Office Admin) on the desk, in the real page (offline harness_N; made-up data only). Accounting audit 11/18:
//   A. every number ties out on Accounting (patch K, _gcAcctModel): invoices → A/R → payments → P&L revenue (accrual and cash);
//      bills / expenses → job cost → P&L costs; overhead; month and year ranges; one company picked; change orders in the contract;
//      a void / denied / waiting item is out of the totals but still on file.
//   B. ACCTNORM — a QuickBooks history invoice typed "customer" counts as a customer invoice (list, job, A/R, P&L).
//   C. ACCTSUB — one QuickBooks bill with three register lines (different days / amounts) is ONE cost, at the bill's amount, job, date.
//   D. ＋ New invoice (the office's invoice editor) → on the job, in A/R; 💵 Record customer payment, part paid → A/R and cash move
//      (ACCTPAY), then paid in full.
//   E. 📊 QuickBooks CSV import in the full app: the invoice and the bill land on the jobs named by the PO in the memo, a row with
//      no job is left out (not guessed), importing the SAME file again adds nothing.
//   F. INVMATCH 3: "New Office" marked GrayCo overhead → its costs move from job cost to overhead; the totals do not change.
//   G. exports: Accounting's CSV for the P&L and the A/R tabs carry the same totals.
//   H. browser storage full (the office PC): an expense and an invoice saved while localStorage refuses writes still reach the cloud.
import fs from 'fs'; import path from 'path';
const HN = process.env.GC_HARNESS_N || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(HN);
const { computer, signIn, sleep, cset, cget, resetCloud, ACCOUNTS, waitFor } = H;
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; let A = null, nErr = 0; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); if (A && A.errs.length > nErr) { console.log('   page error(s) before this step: ' + JSON.stringify(A.errs.slice(nErr))); nErr = A.errs.length; } return !!c; };
const r2 = v => Math.round((+v || 0) * 100) / 100;
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const chi = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
const TODAY = ymd(chi()), Y = TODAY.slice(0, 4);
const ago = n => { const d = chi(); d.setDate(d.getDate() - n); return ymd(d); };
const now = new Date().toISOString(), old = new Date(Date.now() - 20 * 864e5).toISOString();
const YEAR = { from: Y + '-01-01', to: Y + '-12-31' }, JAN = { from: Y + '-01-01', to: Y + '-01-31' };

ACCOUNTS['office@grayco-cs.com'].role = process.env.OFFROLE || 'staff';   /* live: gc_staff role "staff", people-list role Office Admin */
resetCloud();
cset('users', [
  { id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Brittany Demo', email: 'office@grayco-cs.com', role: 'Office Admin', payType: 'hourly', active: true },
  { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
const P = (id, o) => Object.assign({ id, status: 'Active', type: 'Residential Reno', created: Y + '-01-05', createdAt: old, updatedAt: old, savedAt: old, pm: 'Demo PM' }, o);
cset('projects', [
  P('C1', { name: 'Acct Demo Kitchen', client: 'Pat Acct', address: '101 Ledger Ln, Memphis, TN', contract: 20000, contractSigned: true, autoPO: 'K101' }),
  P('C2', { name: 'Acct Demo Roof', client: 'Lee Acct', address: '202 Ledger Ln, Memphis, TN', contract: 10000, contractSigned: true, autoPO: 'R202', status: 'completed' }),
  P('M1', { name: 'Acct Demo Water Loss', client: 'Sam Acct', address: '303 Ledger Ln, Memphis, TN', contract: 6000, contractSigned: true, autoPO: 'W303', type: 'Water Damage', companyId: 'mitigation', company: 'GrayCo Mitigation' }),
  P('OH', { name: 'New Office', client: 'Office', address: '6382 Stage Rd', contract: 0, autoPO: 'O046', status: 'completed', createdVia: 'invoice-entry', dataEntry: true })]);
cset('customers', [{ id: 'CU1', name: 'Pat Acct', phone: '9015550111', address: '101 Ledger Ln, Memphis, TN' }]);
const COS = [{ id: 'CO1', pid: 'C1', amt: 2000, status: 'approved', desc: 'Add pantry', date: Y + '-02-01' }]; cset('cos', COS); cset('changeOrders', COS);
const INV = [
  { id: 'I1', type: 'client', pid: 'C1', po: 'K101', client: 'Pat Acct', invNum: '2001', amt: 8000, date: Y + '-01-20', status: 'paid', paid: true, paidDate: Y + '-02-10', desc: 'Draw 1' },
  { id: 'I2', type: 'customer', pid: 'C2', po: '1056', client: 'Lee Acct', invNum: '1056', amt: 5000, date: Y + '-03-05', status: 'paid', paid: true, paidDate: Y + '-03-20', desc: 'QuickBooks history', source: 'quickbooks', importedHistory: true, noSend: true, qbKeys: ['QB:invoice:1056:lee'] },
  { id: 'I3', type: 'client', pid: 'C1', po: 'K101', client: 'Pat Acct', invNum: '2002', amt: 4000, date: ago(50), sentDate: ago(50), dueDate: ago(40), due: ago(40), status: 'sent', desc: 'Draw 2' },
  { id: 'I4', type: 'client', pid: 'C2', po: 'R202', client: 'Lee Acct', invNum: '2003', amt: 3000, date: ago(5), sentDate: ago(5), dueDate: ago(-25), due: ago(-25), status: 'sent', desc: 'Final' },
  { id: 'I5', type: 'client', pid: 'C1', po: 'K101', client: 'Pat Acct', invNum: '2004', amt: 999, date: ago(9), status: 'void', desc: 'voided — kept on file' },
  { id: 'I6', type: 'client', pid: 'M1', po: 'W303', client: 'Sam Acct', invNum: '2005', amt: 2500, date: Y + '-06-01', status: 'paid', paid: true, paidDate: Y + '-06-15', desc: 'Mitigation' },
  { id: 'S1', type: 'sub', pid: 'C1', po: 'K101', sub: 'Acct Demo Electric', invNum: '85388', amt: 3000, date: Y + '-02-01', recvDate: Y + '-02-01', status: 'paid', paid: true, paidDate: Y + '-02-15', source: 'quickbooks', qbKey: 'QB:bill:85388:acct', importedHistory: true, noSend: true, desc: 'QuickBooks bill #85388' },
  { id: 'S2', type: 'sub', pid: 'C1', po: 'K101', sub: 'Acct Demo Plumbing', invNum: '700', amt: 1200, date: ago(3), recvDate: ago(3), status: 'received', desc: 'waiting for approval' }
].map(x => Object.assign({ updatedAt: old, savedAt: old }, x));
cset('invs', INV); cset('invoices', INV);
cset('expenses', [
  { id: 'X1', pid: 'C1', vendor: 'Acct Lumber', desc: 'cabinets', amt: 500, category: 'Materials', date: Y + '-02-03', status: 'approved', updatedAt: old },
  { id: 'X2', pid: 'OH', vendor: 'Acct Furniture', desc: 'desks for the new office', amt: 800, category: 'Materials', date: Y + '-04-01', status: 'approved', updatedAt: old },
  { id: 'X3', pid: '', vendor: 'Acct Shirts', desc: 'Office Shirts', amt: 150, category: 'Office/Admin', overhead: true, date: Y + '-05-01', status: 'approved', updatedAt: old },
  { id: 'X4', pid: 'C2', vendor: 'Acct Rental', desc: 'lift rental', amt: 999, category: 'Equipment', date: ago(2), status: 'pending', updatedAt: old }]);
/* ACCTSUB: QuickBooks wrote THREE register lines for bill S1 — two at the wrong amount / day, one on no job */
cset('gcAcctRegister', [
  { id: 'R1', _id: 'R1', pid: '', date: Y + '-02-01', desc: 'Acct Demo Electric — QuickBooks bill #85388', type: 'expense', amt: 2000, amount: 2000, category: 'Subcontractor', source: 'subinvoice', status: 'paid', srcInvId: 'SUB_S1', direction: 'out' },
  { id: 'R2', _id: 'R2', pid: '', date: Y + '-11-05', desc: 'Sub paid: QuickBooks bill #85388', type: 'expense', amt: 2000, amount: 2000, category: 'Subcontractor', source: 'subinvoice', status: 'paid', srcInvId: 'S1', direction: 'out' },
  { id: 'R3', _id: 'R3', pid: 'C1', date: Y + '-11-05', desc: 'Sub paid: QuickBooks bill #85388', type: 'expense', amt: 3000, amount: 3000, category: 'Subcontractor', source: 'subinvoice', status: 'paid', srcInvId: 'S1', direction: 'out' },
  { id: 'R4', _id: 'R4', pid: 'C1', date: ago(3), desc: 'Sub Invoice: rough plumbing', type: 'expense', amt: 1200, amount: 1200, category: 'Subcontractor', source: 'subinvoice', status: 'owed', srcInvId: 'SUB_S2', direction: 'out' },
  { id: 'R5', _id: 'R5', pid: 'C1', date: Y + '-02-03', desc: 'cabinets', type: 'expense', amt: 500, amount: 500, category: 'Materials', _dupOf: 'X1', srcInvId: 'EXPENSE_X1' },
  { id: 'R6', _id: 'R6', pid: 'C2', date: Y + '-03-20', desc: 'Client payment: QB #1056 — Lee Acct', type: 'income', isIncome: true, direction: 'in', amt: 5000, amount: 5000, category: 'Invoice', source: 'clientinvoice', srcInvId: 'QB_old_import_row' }]);
cset('gc_tombstones', {}); cset('payrollRuns', []); cset('timesheets', []); cset('estimates', []); cset('leads', []); cset('schedule', []);

A = await computer('desk:office', { build: BUILD, init: [`try{localStorage.setItem('grayco_user','Brittany Demo')}catch(e){}`] });
const shot = async n => { if (SHOTS) await A.page().screenshot({ path: path.join(SHOTS, 'acct100_' + n + '.png') }).catch(() => {}); };
ok('0 the office signs in on the desk', await signIn(A, 'office@grayco-cs.com', 30000));
await waitFor(A, () => !!(window._crm && window._crm.invoices && window._crm.invoices.length >= 8 && window._gcAcctModel && window._gcSpendRows), null, 40000);
await waitFor(A, () => window._gcSpendRows({ includeUnassigned: true }).some(r => r.__reg), null, 20000);
await sleep(4000);
const M = (range, basis, extra) => A.ev(([range, basis]) => { const m = window._gcAcctModel({ range, basis }); const J = id => m.jobs.rows.find(r => r.pid === id) || null;
  return { rev: m.pnl.revenue, job: m.pnl.jobCosts, oh: m.pnl.overhead, none: m.pnl.unassigned, net: m.pnl.net, ar: m.ar.totals, arRows: m.ar.rows.map(r => [r.id, r.balance, r.bucket]),
    c1: J('C1') && { billed: J('C1').billed, costs: J('C1').costs, contract: J('C1').contract, profit: J('C1').profit }, c2: J('C2') && { billed: J('C2').billed, costs: J('C2').costs },
    ohJob: J('OH') && { costs: J('OH').costs }, costIds: m.pnl.rows.job.concat(m.pnl.rows.oh, m.pnl.rows.none).map(r => r.id + ':' + r.amount + ':' + (r.pid || '-')).sort() }; }, [range, basis]);

/* ── A + B + C: the books tie out ── */
const me = await A.ev(() => { try { const u = window._gcMeUser && window._gcMeUser(); return u && (u.name + '|' + u.role); } catch (e) { return String(e); } });
ok('A0 signed in as the office (Brittany Demo, Office Admin)', /Brittany Demo\|Office Admin/.test(me || ''), me);
const i2 = await A.ev(seed => { const x = window._crm.invoices.find(i => i.id === 'I2'); if (!x) return null; const diff = Object.keys(seed).filter(k => !/^(type|updatedAt|savedAt)$/.test(k) && JSON.stringify(seed[k]) !== JSON.stringify(x[k])); return { type: x.type, diff }; }, INV[1]);
ok('B1 ACCTNORM: the QuickBooks history invoice typed "customer" is a customer invoice in the app (type client; amount, number, job, dates unchanged)', i2 && i2.type === 'client' && !i2.diff.length, i2);
await A.ev(() => window._setView('invoices')); await sleep(2500);
await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /^Client Invoices/.test(x.textContent.trim())); if (b) b.click(); }); await sleep(1200);
const invTxt = await A.ev(() => (document.querySelector('#root main') || document.body).innerText);
ok('B2 ▥ Invoices → Client Invoices lists it with the others (#1056 next to Draw 1 / #2002)', /1056/.test(invTxt) && (/2001/.test(invTxt) || /Draw 1/.test(invTxt)), invTxt.slice(0, 600));
await shot('invoices');
const y0 = await M(YEAR, 'accrual');
ok('A1 revenue (accrual, this year) = every client invoice once: 8,000 + 5,000 (QB "customer") + 4,000 + 3,000 + 2,500 = 22,500 — the void #2004 is out', y0.rev === 22500, y0);
ok('A2 A/R = 4,000 (#2002, 31–60 days late) + 3,000 (#2003, not due) = 7,000; paid and void invoices are not owed', y0.ar.all === 7000 && y0.ar.b1 === 4000 && y0.ar.b0 === 3000, y0.ar);
ok('C1 ACCTSUB: bill #85388 (three register lines: $2,000 no job, $2,000 no job, $3,000 on the job) is ONE $3,000 cost on Acct Demo Kitchen', y0.costIds.filter(x => /^R[123]:/.test(x)).length === 1 && y0.costIds.some(x => /^R[123]:3000:C1$/.test(x)), y0.costIds);
ok('A3 job costs = bill 3,000 + materials 500 (its register copy not again) + New Office desks 800 = 4,300; overhead = Office Shirts 150; nothing unassigned', y0.job === 4300 && y0.oh === 150 && y0.none === 0, y0);
ok('A4 waiting items are out: the received sub bill #700 ($1,200) and the pending rental ($999); the payment line (money in) is not a cost', !y0.costIds.some(x => /^(R4|X4|R6|S2):/.test(x)), y0.costIds);
ok('A5 net = 22,500 − 4,300 − 150 = 18,050', y0.net === 18050, y0.net);
ok('A6 job costing: Acct Demo Kitchen billed 12,000, costs 3,500, profit 8,500, contract 20,000 + approved change order 2,000 = 22,000', y0.c1 && y0.c1.billed === 12000 && y0.c1.costs === 3500 && y0.c1.profit === 8500 && y0.c1.contract === 22000, y0.c1);
ok('A7 the QuickBooks "customer" invoice is on its job: Acct Demo Roof billed 5,000 + 3,000 = 8,000', y0.c2 && y0.c2.billed === 8000, y0.c2);
const yc = await M(YEAR, 'cash');
ok('A8 cash basis: money received this year 8,000 + 5,000 + 2,500 = 15,500 (nothing on the open ones yet)', yc.rev === 15500, yc.rev);
const jan = await M(JAN, 'accrual');
ok('A9 one month (January): revenue 8,000 (Draw 1 only), no costs', jan.rev === 8000 && jan.job === 0, jan);
const feb = await M({ from: Y + '-02-01', to: Y + '-02-28' }, 'accrual');
ok('A10 February: the bill on its own date (2/1) — 3,000 + cabinets 500, not in November when QuickBooks wrote "Sub paid"', feb.job === 3500, feb);
const co = await A.ev(async () => { const C = window._gcCo; if (!C) return null; C.setFilter('mitigation'); await new Promise(r => setTimeout(r, 1200)); const rv = window._gcAcctRules.revenueRows().map(i => i.id).join(','); const cs = window._gcAcctRules.costRows().length; C.setFilter('all'); await new Promise(r => setTimeout(r, 1200)); return { rv, cs, all: window._gcAcctRules.revenueRows().length }; });
ok('A11 by company: with GrayCo Mitigation picked only its invoice counts (#2005), none of Construction\'s costs; All companies again → every invoice', co && co.rv === 'I6' && co.cs === 0 && co.all === 5, co);
const kept = cget('invs').find(i => i.id === 'I5');
ok('A12 the void invoice is still on file in the cloud (never purged)', kept && kept.status === 'void', kept);

/* ── D: ＋ New invoice, then 💵 Record customer payment (part, then the rest) ── */
await A.ev(() => window._gcInvoiceEditor(null));
await waitFor(A, () => !!document.getElementById('_ie_save'), null, 8000);
await shot('new_invoice');
await A.ev(([d]) => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
  set('_ie_pid', 'C1'); set('_ie_desc', 'Draw 3 — cabinets set'); set('_ie_amt', '1500'); set('_ie_status', 'sent'); set('_ie_sent', d); document.getElementById('_ie_save').click(); }, [TODAY]);
const newInv = await waitFor(A, () => { const x = (window._crm.invoices || []).find(i => /Draw 3/.test(i.desc || '')); return x && { id: x.id, pid: x.pid, po: x.po, amt: x.amt, status: x.status, type: x.type, client: x.client }; }, null, 8000);
ok('D1 ＋ New invoice (office): on Acct Demo Kitchen, PO K101 from the job, the customer from the job, $1,500 sent', newInv && newInv.pid === 'C1' && newInv.po === 'K101' && +newInv.amt === 1500 && newInv.status === 'sent' && newInv.type === 'client' && newInv.client === 'Pat Acct', newInv);
await sleep(3500);
ok('D2 … it reached the cloud', !!(cget('invs') || []).find(i => newInv && i.id === newInv.id));
const d1 = await M(YEAR, 'accrual');
ok('D3 … A/R 7,000 → 8,500 and revenue 22,500 → 24,000', d1.ar.all === 8500 && d1.rev === 24000, { ar: d1.ar, rev: d1.rev });
const pay = async (id, amt) => {
  await A.ev(() => window._gcRecordCustomerPayment());
  await waitFor(A, () => !!document.getElementById('_gcPayOv'), null, 8000);
  return A.ev(([id, amt, d]) => { const ov = document.getElementById('_gcPayOv');
    const inp = ov.querySelector('._pay_amt[data-id="' + id + '"]'); if (!inp) return 'no row for ' + id + ' in: ' + [...ov.querySelectorAll('._pay_amt')].map(e => e.getAttribute('data-id')).join(',');
    const t = document.getElementById('_pay_total'); t.value = String(amt);
    document.getElementById('_pay_date').value = d;
    const cb = ov.querySelector('._pay_ck[data-id="' + id + '"]'); if (cb) cb.checked = true;
    inp.value = String(amt); inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('_pay_save').click(); return 'ok'; }, [id, amt, TODAY]);
};
const p1 = await pay('I3', 1000);
await waitFor(A, () => !document.getElementById('_gcPayOv'), null, 8000); await sleep(1500);
const d2 = await M(YEAR, 'accrual'), d2c = await M(YEAR, 'cash');
const i3 = await A.ev(() => { const x = window._crm.invoices.find(i => i.id === 'I3'); return x && { status: x.status, amountPaid: x.amountPaid, n: (x.payments || []).length }; });
ok('D4 💵 Record customer payment, $1,000 on #2002 (part): the invoice is part paid ($1,000 on it)', p1 === 'ok' && i3 && i3.status === 'partial' && i3.amountPaid === 1000 && i3.n === 1, { p1, i3 });
ok('D5 ACCTPAY: … A/R 8,500 → 7,500 (#2002 owes 3,000), cash received 15,500 → 16,500; revenue (billed) unchanged', d2.ar.all === 7500 && d2c.rev === 16500 && d2.rev === 24000, { ar: d2.ar.all, cash: d2c.rev, rev: d2.rev });
const p2 = await pay('I3', 3000);
await waitFor(A, () => !document.getElementById('_gcPayOv'), null, 8000); await sleep(1500);
const d3 = await M(YEAR, 'accrual'), d3c = await M(YEAR, 'cash');
const i3b = await A.ev(() => { const x = window._crm.invoices.find(i => i.id === 'I3'); return x && { status: x.status, amountPaid: x.amountPaid, paidDate: x.paidDate }; });
ok('D6 … the other $3,000 → #2002 paid (paid date today); A/R 4,500 (#2003 + Draw 3); cash 19,500', p2 === 'ok' && i3b && i3b.status === 'paid' && i3b.paidDate === TODAY && d3.ar.all === 4500 && d3c.rev === 19500, { p2, i3b, ar: d3.ar.all, cash: d3c.rev });
ok('D7 the payments are not costs (the "Customer payment" register line is money in)', d3.job === d1.job && d3.oh === d1.oh && d3.none === d1.none, { before: [d1.job, d1.oh, d1.none], after: [d3.job, d3.oh, d3.none] });
await sleep(3000);
const cloudI3 = (cget('invs') || []).find(i => i.id === 'I3');
ok('D8 … and it is in the cloud (paid, $4,000 on it)', cloudI3 && cloudI3.status === 'paid' && cloudI3.amountPaid === 4000, cloudI3 && { status: cloudI3.status, amountPaid: cloudI3.amountPaid });

/* ── E: QuickBooks CSV, in the full app ── */
const CSV = ['"Acct Demo (made-up test data)"', '"Transaction List by Date"', '', ',Date,Transaction Type,Num,Name,Memo/Description,Account,Split,Amount',
  ',' + ago(8).slice(5, 7) + '/' + ago(8).slice(8, 10) + '/' + Y + ',Invoice,2101,Pat Acct,"PO K101 - pantry change order",Accounts Receivable (A/R),Construction Income,"$700.00"',
  ',' + ago(7).slice(5, 7) + '/' + ago(7).slice(8, 10) + '/' + Y + ',Bill,9911,Acct Demo Gutters,"R202 gutters",Accounts Payable (A/P),Subcontractors,300.00',
  ',' + ago(6).slice(5, 7) + '/' + ago(6).slice(8, 10) + '/' + Y + ',Bill,9912,Acct Demo Supply,"misc parts",Accounts Payable (A/P),Job Materials,45.00', ''].join('\n');
const imp = async () => {
  await A.ev(([t]) => { window._gcQbCsvImport.open(t, 'acct-demo.csv'); }, [CSV]);
  await waitFor(A, () => !!document.querySelector('#_gcQbCsvOv [data-go]'), null, 10000); await sleep(800);
  const pre = await A.ev(() => ({ go: (document.querySelector('#_gcQbCsvOv [data-go]') || {}).textContent || '', rows: [...document.querySelectorAll('#_gcQbCsvOv tr[data-i]')].map(t => t.innerText.replace(/\s+/g, ' ').slice(0, 160)) }));
  await A.ev(() => { const b = document.querySelector('#_gcQbCsvOv [data-go]'); if (b && !b.disabled) b.click(); });
  await sleep(3000);
  const after = await A.ev(() => { const o = document.getElementById('_gcQbCsvOv'); const t = o ? o.innerText.replace(/\s+/g, ' ') : ''; const c = o && [...o.querySelectorAll('button')].find(b => /close|done|ok/i.test(b.textContent)); if (c) c.click(); else if (o) o.remove(); return t.slice(0, 300); });
  await sleep(1500);
  return { pre, after };
};
const e1 = await imp();
await shot('qbcsv');
const qbI = await A.ev(() => window._crm.invoices.filter(i => /^(2101|9911|9912)$/.test(String(i.invNum || i.qbNum || ''))).map(i => ({ n: String(i.invNum || i.qbNum), type: i.type, pid: i.pid || '', amt: +i.amt })));
const inv2101 = qbI.find(x => x.n === '2101'), b9911 = qbI.find(x => x.n === '9911'), b9912 = qbI.find(x => x.n === '9912');
ok('E1 QuickBooks CSV: invoice 2101 (PO K101 in the memo) → a client invoice on Acct Demo Kitchen; bill 9911 ("R202") → a bill on Acct Demo Roof', inv2101 && inv2101.type === 'client' && inv2101.pid === 'C1' && inv2101.amt === 700 && b9911 && b9911.type === 'sub' && b9911.pid === 'C2', { qbI, e1 });
ok('E2 … bill 9912 ("misc parts", no job in it) is NOT guessed onto a job (left out, or on no job for the review list)', !b9912 || !b9912.pid, { b9912, rows: e1.pre.rows });
await sleep(2500);
const e3 = await M(YEAR, 'accrual');
ok('E3 … revenue +700 (24,700), A/R +700 (5,200); Acct Demo Roof costs +300 (the bill, once)', e3.rev === 24700 && e3.ar.all === 5200 && e3.c2 && e3.c2.costs === 300, { rev: e3.rev, ar: e3.ar.all, c2: e3.c2, costIds: e3.costIds });
const n0 = await A.ev(() => window._crm.invoices.length);
const e2 = await imp();
const n1 = await A.ev(() => window._crm.invoices.length);
const e4 = await M(YEAR, 'accrual');
ok('E4 importing the SAME file again adds nothing (same invoice count, same totals)', n1 === n0 && e4.rev === e3.rev && e4.job === e3.job && e4.none === e3.none, { n0, n1, pre: e2.pre.go, rev: [e3.rev, e4.rev], job: [e3.job, e4.job] });

/* ── F: New Office is GrayCo overhead ── */
const before = await M(YEAR, 'accrual');
const mk = await A.ev(() => window._gcJobMerge && window._gcJobMerge.markOverhead ? window._gcJobMerge.markOverhead('OH') : 'no api');
await sleep(2500);
const f1 = await M(YEAR, 'accrual');
ok('F1 "Mark as overhead" on New Office: its $800 moves from job cost to overhead (job ' + before.job + ' → ' + f1.job + ', overhead ' + before.oh + ' → ' + f1.oh + '); net unchanged', mk === true && r2(before.job - f1.job) === 800 && r2(f1.oh - before.oh) === 800 && f1.net === before.net, { mk, before: [before.job, before.oh, before.net], after: [f1.job, f1.oh, f1.net] });
const ohP = (cget('projects') || []).find(p => p.id === 'OH');
ok('F2 … the job is kept (archived, overhead), not deleted', ohP && ohP.overhead === true && ohP.archivedWhy === 'overhead', ohP && { overhead: ohP.overhead, status: ohP.status });

/* ── G: exports ── */
const csv = await A.ev(async () => { window._setView('accounting'); await new Promise(r => setTimeout(r, 2500)); const out = {}; for (const t of ['k_pnl', 'k_in']) { try { if (window._gcAcctOpenTab) window._gcAcctOpenTab(t); } catch (e) {} await new Promise(r => setTimeout(r, 1200)); try { out[t] = window._gcAcctCsv(t); } catch (e) { out[t] = 'ERR ' + e.message; } } return out; });
await shot('accounting');
const has = (t, n) => { const v = String(n), v2 = Number(n).toFixed(2); return typeof t === 'string' && (t.includes(v) || t.includes(v2)); };
const arSum = r2(String(csv.k_in || '').split(/\r?\n/).slice(1).filter(Boolean).reduce((t, l) => t + (parseFloat(l.split(',').pop()) || 0), 0));
ok('G1 CSV export of Money In (A/R): one line per open invoice, the Balance column adds up to the A/R total (' + f1.ar.all + ')', arSum === f1.ar.all && /2003/.test(csv.k_in || ''), { arSum, csv: String(csv.k_in).slice(0, 400) });
ok('G2 CSV export of the P&L carries the revenue and the net', has(csv.k_pnl, f1.rev) && has(csv.k_pnl, f1.net), String(csv.k_pnl).slice(0, 400));

/* ── H: the office PC's browser storage is full ── */
const fill = await A.ev(() => { let n = 0; const chunk = 'x'.repeat(250000); try { for (let i = 0; i < 400; i++) { localStorage.setItem('zz_fill_' + i, chunk); n++; } } catch (e) {} let refused = false; try { localStorage.setItem('zz_probe', 'y'.repeat(300000)); } catch (e) { refused = true; } return { n, refused }; });
await A.ev(() => window._setExpenses(prev => (prev || []).concat([{ id: 'XFULL', pid: 'C1', vendor: 'Acct Tile', desc: 'tile while storage full', amt: 275, category: 'Materials', date: new Date().toISOString().slice(0, 10), status: 'approved', updatedAt: new Date().toISOString() }])));
await A.ev(() => window._gcInvoiceEditor(null)); await waitFor(A, () => !!document.getElementById('_ie_save'), null, 8000);
await A.ev(([d]) => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }; set('_ie_pid', 'C2'); set('_ie_desc', 'Storage full invoice'); set('_ie_amt', '650'); set('_ie_status', 'sent'); set('_ie_sent', d); document.getElementById('_ie_save').click(); }, [TODAY]);
const cloudOk = async () => { for (let i = 0; i < 40; i++) { const e = (cget('expenses') || []).some(x => x.id === 'XFULL'), v = (cget('invs') || []).some(x => /Storage full invoice/.test(x.desc || '')); if (e && v) return { e, v }; await sleep(500); } return { e: (cget('expenses') || []).some(x => x.id === 'XFULL'), v: (cget('invs') || []).some(x => /Storage full invoice/.test(x.desc || '')) }; };
const hres = await cloudOk();
ok('H1 storage full (localStorage refuses a write: ' + fill.refused + '): the expense and the invoice saved then still reach the cloud', fill.refused && hres.e && hres.v, { fill, hres });
const h2 = await M(YEAR, 'accrual');
ok('H2 … and they are in the books (revenue +650, Acct Demo Kitchen costs +275)', h2.rev === r2(f1.rev + 650) && h2.c1 && h2.c1.costs === r2(f1.c1.costs + 275), { rev: [f1.rev, h2.rev], c1: [f1.c1, h2.c1] });
await A.ev(() => { for (let i = 0; i < 400; i++) localStorage.removeItem('zz_fill_' + i); });

const ERRS = A.errs.filter(e => !/^React is not defined$/.test(e));   /* 'React is not defined' at boot: the same on r36i (main) in this harness */
ok('Z no page errors (other than the harness\'s boot-time "React is not defined", also on main)', !ERRS.length, ERRS.slice(0, 6));
console.log((R.every(Boolean) ? 'ALL PASS ' : 'FAILED ') + R.filter(Boolean).length + '/' + R.length);
await A.b.close(); process.exit(R.every(Boolean) ? 0 : 1);
