// test_ACCTFIX2_fn.mjs [build-dir] — patch ACCTFIX2, server side, made-up data only (nothing leaves: acctgate/bridge.mjs).
//   · _lib/statement.js: a customer's invoices / payments / credits in a date range, the opening balance, the running
//     balance, the balance due and the aging (Current · 1–30 · 31–60 · 61–90 · 90+) — exact cents; no internal notes.
//   · office-board { action:'statement' }: the office gets the letterhead HTML; send:true puts ONE customer_statement
//     e-mail on ✅ Approvals (asked twice → "already waiting"); a PM and a non-staff address are refused.
import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BUILD = path.resolve(process.argv[2] || path.join(HERE, '..', '..'));
const B = await import(pathToFileURL(path.join(HERE, 'acctgate', 'bridge.mjs')).href);
const req = createRequire(path.join(BUILD, 'netlify', 'functions', 'x.js'));
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 600) : '')); } };

const ST = req('./_lib/statement.js');
const data = {
  projects: [{ id: 'P1', name: 'Demo Hollis Reroof', address: '1 Demo Ln, Bartlett TN', autoPO: 'A101', client: 'Demo Hollis', clientEmail: 'hollis@example.invalid' },
    { id: 'P2', name: 'Demo Hollis Gutters', address: '1 Demo Ln, Bartlett TN', autoPO: 'A102', client: 'Demo Hollis' },
    { id: 'P3', name: 'Other Customer Job', client: 'Someone Else' }],
  customers: [{ id: 'C1', name: 'Demo Hollis', email: 'hollis@example.invalid', address: '1 Demo Ln, Bartlett TN' }],
  invs: [
    { id: 'I1', type: 'client', pid: 'P1', client: 'Demo Hollis', invNum: '1001', amt: 5000, date: '2026-07-01', dueDate: '2026-07-15', status: 'paid', paidDate: '2026-07-20', desc: 'INTERNAL: margin 31% — do not show' },
    { id: 'I2', type: 'client', pid: 'P1', invNum: '1002', amt: 4000, date: '2026-08-10', dueDate: '2026-08-25', status: 'partial', payments: [{ amt: 1500, date: '2026-09-01', method: 'Check 4471' }] },
    { id: 'I3', type: 'client', pid: 'P2', invNum: '1003', amt: 1200, date: '2026-10-05', dueDate: '2026-10-20', status: 'sent' },
    { id: 'I4', type: 'client', pid: 'P1', invNum: '1004', amt: 800, date: '2026-10-28', dueDate: '2026-11-12', status: 'sent' },
    { id: 'I5', type: 'creditmemo', pid: 'P1', invNum: 'CM-1', amt: -200, date: '2026-10-30', status: 'sent' },
    { id: 'I6', type: 'client', pid: 'P1', invNum: '1006', amt: 999, date: '2026-10-01', status: 'draft' },
    { id: 'I7', type: 'sub', pid: 'P1', invNum: 'S-9', amt: 3000, date: '2026-10-01', status: 'received', sub: 'Demo Sub' },
    { id: 'I8', type: 'client', pid: 'P3', invNum: '2001', amt: 777, date: '2026-10-01', status: 'sent' }]
};
console.log('ACCTFIX2 (server): the customer statement');
const st = ST.build(data, { customer: 'Demo Hollis', from: '2026-08-01', to: '2026-11-01', today: '2026-11-01' });
ok(st.invoiceCount === 5, 'the customer\'s 4 invoices + 1 credit memo (not the draft, the sub bill, another customer)', st.invoiceCount);
ok(st.opening === 0, 'opening balance on Aug 1: $0.00 (July invoice paid in July)', st.opening);
ok(st.rows.map(r => r.kind + ' ' + r.ref.split(' ').pop() + ' ' + r.balance).join(' | ') === 'Invoice #1002 4000 | Payment 4471) 2500 | Invoice #1003 3700 | Invoice #1004 4500 | Credit CM-1 4300', 'activity Aug–Oct with the running balance', st.rows.map(r => [r.kind, r.ref, r.balance]));
ok(st.invoiced === 6000 && st.paid === 1500 && st.credits === 200, 'invoiced $6,000 · paid $1,500 · credits $200 in the period', st);
ok(st.balanceDue === 4300 && st.closing === 4300, 'balance due $4,300.00 = the closing balance', [st.balanceDue, st.closing]);
ok(JSON.stringify(st.aging) === JSON.stringify({ current: 800, d30: 1200, d60: 0, d90: 2500, d90p: 0 }), 'aging on Nov 1: current $800 · 1–30 $1,200 · 61–90 $2,500 (#1002 due Aug 25 → 68 days)', st.aging);
const html = ST.html(st, { BRAND: req('./_lib/brand.js').BRAND, logo: 'https://crm.grayco-cs.com/grayco-logo-wide.jpg', address: '5796 Ferguson Rd, Bartlett, TN 38134', email: 'billing@grayco-cs.com' });
ok(/STATEMENT/.test(html) && /grayco-logo-wide\.jpg/.test(html) && /\$4,300\.00/.test(html) && /GrayCo Construction Services, LLC/.test(html), 'letterhead page: logo, legal name, STATEMENT, balance due');
ok(!/INTERNAL|margin 31|do not show|Demo Sub|S-9/.test(html.replace(/<[^>]*>/g, ' ')), 'no internal notes, costs or sub bills on the page');
const job = ST.build(data, { pid: 'P2', to: '2026-11-01', today: '2026-11-01' });
ok(job.invoiceCount === 1 && job.balanceDue === 1200 && job.job && job.job.id === 'P2', 'from the job: only that job\'s invoices ($1,200)', job);

/* the office-board action through the real handler (fake Supabase) */
const cloud = new Map(), iso = new Date().toISOString();
const set = (k, v) => cloud.set(k, { key: k, value: v, updated_at: iso });
Object.entries(data).forEach(([k, v]) => set(k, v)); set('invoices', []); set('users', [{ email: 'office@grayco-cs.com', name: 'Demo Office', role: 'Office Admin', active: true }]); set('gc_approval_queue', []);
const STAFF = [{ email: 'office@grayco-cs.com', role: 'staff', profile: null, active: true, payroll: true }, { email: 'pm@grayco-cs.com', role: 'staff', active: true }];
const bridge = B.installBridge({ build: BUILD, cloud, accounts: {}, staffRows: STAFF });
const call = (email, body) => bridge.call({ method: 'POST', name: 'office-board', search: '', headers: { authorization: 'Bearer ntok:' + email }, body: JSON.stringify(body) });
const jb = r => { try { return JSON.parse(String(r.body)); } catch (e) { return {}; } };
let r = await call('office@grayco-cs.com', { action: 'statement', customer: 'Demo Hollis', from: '2026-08-01', to: '2026-11-01' });
ok(r.status === 200 && /STATEMENT/.test(jb(r).html || '') && jb(r).statement.balanceDue === 4300, 'office: statement preview → 200 + the page, balance $4,300', [r.status, jb(r).error]);
r = await call('office@grayco-cs.com', { action: 'statement', customer: 'Demo Hollis', from: '2026-08-01', to: '2026-11-01', send: true });
const q = () => { const v = cloud.get('gc_approval_queue').value; return Array.isArray(v) ? v : JSON.parse(v); };
const item = q().find(x => x.kind === 'customer_statement');
ok(r.status === 200 && jb(r).queued && item && item.to === 'hollis@example.invalid' && item.status === 'waiting' && /STATEMENT/.test(item.html), '✉ Email → ONE customer_statement item waiting on ✅ Approvals (nothing sent)', [r.status, jb(r), item && { to: item.to, st: item.status, steps: item.steps }]);
ok(!bridge.EXT.some(x => x.host === 'api.resend.com'), 'no e-mail left the building');
r = await call('office@grayco-cs.com', { action: 'statement', customer: 'Demo Hollis', from: '2026-08-01', to: '2026-11-01', send: true });
ok(jb(r).already === true && q().filter(x => x.kind === 'customer_statement').length === 1, 'asked twice → "already waiting", still one item', jb(r));
r = await call('pm@grayco-cs.com', { action: 'statement', customer: 'Demo Hollis' });
ok(r.status === 403, 'a PM → 403', r.status);
r = await call('someone.random@example.invalid', { action: 'statement', customer: 'Demo Hollis' });
ok(r.status === 403 || r.status === 401, 'not staff → refused', r.status);

/* ── the page's rules, run from index.html's own <script id="gc-patch-acctfix2"> in a sandbox ── */
console.log('ACCTFIX2 (page rules): the approval gate, refunds, deposits');
{
  const fs = await import('fs'); const vm = await import('vm');
  const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8'); const i = html.indexOf('<script id="gc-patch-acctfix2">'); const code = html.slice(html.indexOf('>', i) + 1, html.indexOf('</script>', i));
  const LS = { gc_expense_approvals: JSON.stringify([{ expId: 'E4', status: 'approved' }, { expId: 'E5', status: 'pending_pm' }, { expId: 'E6', status: 'rejected' }]), gc_sub_approvals: JSON.stringify([{ invId: 'S2', status: 'pending_pm' }]),
    gc_office_tasks: JSON.stringify([{ id: 'T1', _deny: { key: 'exp:E7', reason: 'wrong order' }, done: false }, { id: 'T2', _deny: { key: 'exp:E8' }, done: true }]) };
  const W = { setTimeout: () => 0, setInterval: () => 0, console: { log(){} }, localStorage: { getItem: k => LS[k] || null, setItem(){} }, document: { addEventListener(){}, querySelectorAll: () => [], getElementById: () => null },
    _crm: { projects: [{ id: 'P1', client: 'Agt Hollis', autoPO: 'A101' }, { id: 'P2', client: 'Agt Brentley' }],
      expenses: [{ id: 'E1', pid: 'P1', amt: 100, status: 'approved' }, { id: 'E2', pid: 'P1', amt: 50, status: '' }, { id: 'E3', pid: 'P1', amt: 70, status: 'pending' }, { id: 'E4', pid: 'P1', amt: 40, status: 'pending' },
        { id: 'E5', pid: 'P1', amt: 30, status: '' }, { id: 'E6', pid: 'P1', amt: 20, status: 'pending' }, { id: 'E7', pid: 'P1', amt: 77.5, status: 'pending' }, { id: 'E8', pid: 'P1', amt: 18.25, status: 'pending' }, { id: 'E9', pid: 'P1', amt: 9, status: 'denied' },
        { id: 'R1', pid: 'P1', amt: -45.1, amount: -45.1, type: 'refund', direction: 'in', isIncome: false, source: 'creditcard', desc: 'Refund / credit — HOME DEPOT RETURN', status: 'paid' },
        { id: 'X1', pid: 'P1', amt: -500, type: 'payment', desc: 'customer payment' }],
      invoices: [{ id: 'S1', type: 'sub', pid: 'P1', amt: 1850, status: 'approved' }, { id: 'S2', type: 'sub', pid: 'P2', amt: 3200, status: 'received' }, { id: 'S3', type: 'sub', pid: 'P2', amt: 640, status: 'received' },
        { id: 'C1', type: 'client', pid: 'P1', client: 'Agt Hollis', invNum: '1043', amt: 5000, status: 'overdue', date: '2026-10-01', dueDate: '2026-10-16' },
        { id: 'C2', type: 'client', pid: 'P2', client: 'Agt Brentley', invNum: '2001', amt: 1200, status: 'sent', date: '2026-10-05', dueDate: '2026-10-20' },
        { id: 'C3', type: 'client', pid: 'P2', client: 'Agt Brentley', invNum: '2002', amt: 1200, status: 'sent', date: '2026-10-06', dueDate: '2026-10-21' }] } };
  W.window = W; vm.runInContext(code, vm.createContext(W));
  const g = id => W._gcCostGate(W._crm.expenses.find(e => e.id === id) || W._crm.invoices.find(e => e.id === id));
  ok(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9'].map(g).join() === 'ok,ok,pending,ok,pending,denied,denied,pending,denied', 'expenses: approved / old blank → count; pending (status or approval entry) → wait; rejected / denied / an open "Fix and resend" → out; a done Fix-and-resend → pending again', ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9'].map(g));
  ok(['S1', 'S2', 'S3'].map(g).join() === 'ok,pending,pending', 'sub invoices: approved → count; received → wait', ['S1', 'S2', 'S3'].map(g));
  ok(W._gcCostGate({ __reg: true, srcInvId: 'SUB_S2', amt: 3200 }) === 'pending' && W._gcCostGate({ __reg: true, srcInvId: 'SUB_S1', amt: 1850 }) === 'ok', 'a register line for a sub invoice follows that invoice');
  const pend = W._gcCostPending(), pend1 = W._gcCostPending('P1');
  ok(pend.total === 70 + 30 + 18.25 + 3200 + 640 && pend1.total === 118.25, '⏳ waiting: company $3,958.25, job P1 $118.25', [pend.total, pend1.total]);
  ok(W._gcIsCostCredit(W._crm.expenses.find(e => e.id === 'R1')) === true && W._gcIsCostCredit(W._crm.expenses.find(e => e.id === 'X1')) === false, 'a card refund is a cost credit; a customer payment is not');
  const dm = W._gcDepositMatch([{ date: '2026-10-20', amount: 5000, desc: 'DEPOSIT - AGT HOLLIS INV 1043' }, { date: '2026-10-21', amount: 1200, desc: 'MOBILE DEPOSIT AGT BRENTLEY' }, { date: '2026-10-22', amount: 5000, desc: 'ATM DEPOSIT' }, { date: '2026-12-30', amount: 5000, desc: 'AGT HOLLIS 1043' }]);
  ok(dm.certain.length === 1 && dm.certain[0].invId === 'C1' && dm.certain[0].noReg === true && /invoice #/.test(dm.certain[0].why) && /customer name/.test(dm.certain[0].why), 'deposit $5,000 "AGT HOLLIS INV 1043" → certain: invoice #1043', dm.certain);
  ok(dm.unsure.length === 3 && /more than one/.test(dm.unsure[0].why) && /amount only/.test(dm.unsure[1].why) && /outside 10 days/.test(dm.unsure[2].why), 'uncertain (listed, never applied): two invoices fit · amount only · too late', dm.unsure.map(u => u.why));
}
console.log(`\nACCTFIX2 server: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
