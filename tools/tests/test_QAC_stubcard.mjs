// test_QAC_stubcard.mjs <build-dir> — patch QAC: the "💵 Pay stubs (everyone)" card belongs to the Payroll page only — after leaving
// Payroll for Accounting / Approvals / Office / Payments it must not stay on top of those pages (any company, incl. after switching
// from Mitigation → All companies). Offline harness, made-up data.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qac_shots';
resetCloud();
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'C1', name: 'Zedd Smith deck', status: 'Active', contract: 1000 }]);
cset('payrollProfiles', []); cset('payrollRuns', []); cset('timesheets', []);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await A.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); if (b) b.click(); }); await sleep(800);
const state = () => A.ev(() => { const c = document.getElementById('gc-pay-allstubs'), m = document.getElementById('gc-payroll-mount');
  return { view: localStorage.getItem('grayco_view'), card: !!c, cardShown: !!(c && c.offsetParent), mount: !!m, mountShown: !!(m && m.offsetParent), mountConnected: !!(m && m.isConnected),
    first: ((document.querySelector('#root main') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 70) }; });
const go = async (v, ms) => { await A.ev(v => window._setView(v), v); await sleep(ms || 3500); };
const co = async c => { await A.ev(c => window._gcCo.setFilter(c), c); await sleep(1500); };
for (const seq of [['construction'], ['mitigation', 'all'], ['all']]) {
  for (const c of seq) await co(c);
  await go('payroll', 4000); const s0 = await state();
  ok(seq.join('→') + ': on Payroll the card is there', s0.cardShown, s0);
  for (const v of ['taxcenter', 'approvals', 'officemanager']) {
    await go(v); const s1 = await state();
    if (s1.cardShown) await A.page().screenshot({ path: SHOTS + '/stubcard_' + seq.join('-') + '_' + v + '.png' });
    ok(seq.join('→') + ': ' + v + ' has no leftover Pay stubs card', !s1.cardShown, s1);
  }
}
ok('no page errors', !errs.length, errs.slice(0, 5));
console.log((R.every(Boolean) ? 'ALL PASS ' : 'FAILED ') + R.filter(Boolean).length + '/' + R.length);
await A.b.close(); process.exit(R.every(Boolean) ? 0 : 1);
