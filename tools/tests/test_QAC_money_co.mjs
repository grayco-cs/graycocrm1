// test_QAC_money_co.mjs <build-dir> — patch QAC (overnight QA, area C): the money of each company, read on fresh screens by an admin.
// Made-up jobs / invoices / expenses / payroll in GrayCo Construction, Mitigation and Environmental; offline harness.
//   Invoices and Expenses are split by company (each shows only its own; All shows every one); the job P&L (_gcCompanyPnL) and the
//   Accounting rows (_gcAcctRules) count only the picked company; Mitigation / Environmental Payroll, Accounting, Approvals, Office
//   and Payments show the "starts fresh" page (owner 11/11, MULTICO-FRESH) and never Construction's numbers.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qac_shots';
resetCloud();
const now = new Date().toISOString(), d = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [
  { id: 'C1', name: 'Zedd Smith deck', client: 'Zedd Smith', status: 'Active', type: 'Residential Reno', contract: 12000, contractSigned: true, updatedAt: now },
  { id: 'M1', name: 'Zedd Ross basement', client: 'Zedd Ross', status: 'Active', type: 'Water Damage', companyId: 'mitigation', contract: 6000, contractSigned: true, updatedAt: now },
  { id: 'E1', name: 'Zedd Kline trim', client: 'Zedd Kline', status: 'Active', type: 'Environmental', companyId: 'environmental', contract: 9000, contractSigned: true, updatedAt: now }]);
cset('invs', [{ id: 'I1', pid: 'C1', type: 'client', num: '7001', amount: 6000, amt: 6000, status: 'Sent', date: d(10), updatedAt: now },
  { id: 'I2', pid: 'M1', type: 'client', num: '7002', amount: 3000, amt: 3000, status: 'Sent', date: d(12), updatedAt: now },
  { id: 'I3', pid: 'E1', type: 'client', num: '7003', amount: 4500, amt: 4500, status: 'Sent', date: d(14), updatedAt: now }]);
cset('expenses', [{ id: 'X1', pid: 'C1', vendor: 'Zedd Lumber', desc: 'Zedd Lumber deck boards', amount: 410.5, amt: 410.5, category: 'Materials', date: d(3), status: 'approved' },
  { id: 'X2', pid: 'M1', vendor: 'Zedd Rentals', desc: 'Zedd Rentals dehu', amount: 220, amt: 220, category: 'Equipment', date: d(2), status: 'approved' },
  { id: 'X3', vendor: 'Zedd Office Supply', desc: 'Zedd Office Supply paper', amount: 55, amt: 55, category: 'Office', date: d(4), companyId: 'environmental', status: 'approved' }]);
cset('payrollProfiles', [{ id: 'PP1', name: 'Zedd Crew', payType: 'hourly', hourlyRate: 20, period: 'weekly', active: true }]);
cset('payrollRuns', []); cset('timesheets', []); cset('gc_tombstones', {});
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await A.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); if (b) b.click(); }); await sleep(800);
const seen = () => A.ev(() => { const m = document.querySelector('#root main') || document.body; const st = document.createElement('style'); st.textContent = 'select,datalist{display:none!important}'; document.head.appendChild(st);
  const t = m.innerText || ''; st.remove(); return { C: /Zedd Smith|7001|Zedd Lumber/.test(t), M: /Zedd Ross|7002|Zedd Rentals/.test(t), E: /Zedd Kline|7003|Zedd Office Supply/.test(t), fresh: /starts fresh/.test(t), t: t.replace(/\s+/g, ' ').slice(0, 200) }; });
const setCo = async c => { await A.ev(c => window._gcCo.setFilter(c), c); await sleep(1500); };
const open = async v => { await A.ev(v => window._setView(v), v); await sleep(2200); };
const want = { construction: 'C', mitigation: 'M', environmental: 'E' };
for (const co of ['construction', 'mitigation', 'environmental', 'all']) {
  await setCo(co);
  await open('dashboard'); await open('invoices');
  const inv = await seen();
  if (SHOTS) await A.page().screenshot({ path: SHOTS + '/moneyco_invoices_' + co + '.png' });
  const exp0 = (await open('expenses'), await seen());
  if (SHOTS) await A.page().screenshot({ path: SHOTS + '/moneyco_expenses_' + co + '.png' });
  const k = want[co];
  if (k) {
    ok(co + ': Invoices shows only its own invoice', inv[k] && ['C', 'M', 'E'].filter(x => x !== k).every(x => !inv[x]), inv);
    ok(co + ': Expenses shows only its own expenses', exp0[k] && ['C', 'M', 'E'].filter(x => x !== k).every(x => !exp0[x]), exp0);
  } else {
    ok('All companies: Invoices shows every company\'s invoice', inv.C && inv.M && inv.E, inv);
    ok('All companies: Expenses shows every company\'s expense', exp0.C && exp0.M && exp0.E, exp0);
  }
  const pnl = await A.ev(async () => { try { const r = await window._gcCompanyPnL(); return { n: r.jobs.length, ids: r.jobs.map(j => j.pid).sort().join(','), rev: r.totals && r.totals.revenue }; } catch (e) { return { err: String(e.message) }; } });
  const rows = await A.ev(() => { try { const R = window._gcAcctRules; const rv = R.revenueRows() || [], cs = R.costRows() || []; return { rev: rv.length, cost: cs.length, costPids: cs.map(x => x.pid || x.projectId || x.companyId || '-').join(',') }; } catch (e) { return { err: String(e.message) }; } });
  const wantIds = { construction: 'C1', mitigation: 'M1', environmental: 'E1', all: 'C1,E1,M1' }[co];
  ok(co + ': the job P&L counts only ' + (k ? 'its own job' : 'every job'), pnl.ids === wantIds, pnl);
  console.log('   accounting rows (' + co + '): ' + JSON.stringify(rows));
  for (const v of ['payroll', 'taxcenter', 'approvals', 'officemanager', 'payments']) {
    await open(v); const s = await seen();
    if (co === 'mitigation' || co === 'environmental') ok(co + ': ' + v + ' shows the "starts fresh" page and none of Construction\'s rows', s.fresh && !s.C, s);
    else ok(co + ': ' + v + ' is the normal page', !s.fresh, s.t.slice(0, 80));
  }
}
ok('no page errors', !errs.length, errs.slice(0, 5));
console.log((R.every(Boolean) ? 'ALL PASS ' : 'FAILED ') + R.filter(Boolean).length + '/' + R.length);
await A.b.close(); process.exit(R.every(Boolean) ? 0 : 1);
