// test_PAYWEEK.mjs <build-dir> — patch PAYWEEK in a real (headless) browser, owner signed in, MADE-UP people only.
// Run Payroll, Enter a week by hand and the auto-draft period all show the ONE company pay schedule (default
// Thursday → Wednesday paid that Friday); Payroll → Settings → Pay schedule switches all of them to Monday → Sunday,
// paid the Friday after. Uses the real clock: expectations are worked out from today.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_PAYWEEK.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 300) : '')); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const add = (d, k) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
const now = new Date(); now.setHours(12, 0, 0, 0);
const fri = add(now, (5 - now.getDay() + 7) % 7);
const WANT1 = [iso(add(fri, -8)), iso(add(fri, -2)), iso(fri)], WANT2 = [iso(add(fri, -11)), iso(add(fri, -5)), iso(fri)];
const ADMIN = 'wjohnson@grayco-cs.com';
const USERS = [{ id: 'UA1', name: 'Tess Owner', email: ADMIN, role: 'Admin', active: true, payType: 'owner' }];
resetCloud();
cset('users', USERS); cset('payrollProfiles', []); cset('payrollRuns', []); cset('timesheets', []); cset('gc_tombstones', {});
cset('payrollSettings', { companyName: 'Test Co LLC', hoursCutoffDay: 3 });
const A = await computer('A', { build }); const p = A.page();
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(ADMIN); await p.locator('#gc-auth-password').fill(ACCOUNTS[ADMIN].pw); await sleep(300);
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await waitFor(A, () => !!(window.__GC_PAY && window._gcPaySchedule && window.__GC_PAY.isAdmin()), null, 120000, 400);
await sleep(3000);
const screens = async () => {
  await A.ev(() => window._gcOpenPayrollTab('run')); await sleep(1500);
  await A.ev(() => document.querySelector('#_pQuick1').click()); await sleep(1200);
  const run = await A.ev(() => ({ v: ['#_pFrom', '#_pTo', '#_pPay'].map(s => document.querySelector(s).value),
    b: ['#_pQuick1', '#_pQuick2'].map(s => document.querySelector(s).textContent), sched: window._gcPaySchedule().label }));
  await A.ev(() => document.querySelector('#_pQuick2').click()); await sleep(1200);
  const before = await A.ev(() => ['#_pFrom', '#_pTo', '#_pPay'].map(s => document.querySelector(s).value));
  await A.ev(() => window._gcPayManualOpen()); await sleep(1500);
  await A.ev(() => document.getElementById('_pmThis').click()); await sleep(800);
  const hand = await A.ev(() => document.getElementById('_pmWk').textContent);
  await A.ev(() => document.getElementById('_pmLast').click()); await sleep(800);
  const handLast = await A.ev(() => document.getElementById('_pmWk').textContent);
  await A.ev(() => { const x = document.getElementById('_pmWk'); let o = x; while (o.parentElement && o.parentElement !== document.body) o = o.parentElement; o.remove(); });
  const auto = await A.ev(() => { const c = window._gcCurrentPayPeriod(); return [c.start, c.end, c.payday]; });
  return { run, before, hand, handLast, auto };
};
const short = s => { const d = new Date(s + 'T12:00:00'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate(); };
const line = w => 'Work week ' + short(w[0]) + ' → ' + short(w[1]) + ' · paid ' + short(w[2]);
const back = w => w.map(s => iso(add(new Date(s + 'T12:00:00'), -7)));
let s = await screens();
ok(s.run.sched === 'Work week Thursday–Wednesday, paid that Friday', 'default schedule', s.run.sched);
ok(s.run.b.join('|') === 'Week paid this Friday|The week before', 'Run Payroll buttons', s.run.b);
ok(s.run.v.join() === WANT1.join(), 'Run Payroll: week paid this Friday', s.run.v);
ok(s.before.join() === back(WANT1).join(), 'Run Payroll: the week before', s.before);
ok(s.hand === line(WANT1), 'Enter by hand: This week', s.hand);
ok(s.handLast === line(back(WANT1)), 'Enter by hand: Last week', s.handLast);
ok(s.auto.join() === WANT1.join(), 'auto draft period', s.auto);
// Settings → Pay schedule → Monday–Sunday, paid the Friday after
await A.ev(() => window._gcOpenPayrollTab('settings')); await sleep(1500);
const opts = await A.ev(() => [...document.querySelectorAll('[data-paysched] option')].map(o => o.value + ' ' + o.textContent));
ok(opts.length === 2 && /^4\|2 /.test(opts[0]), 'Settings has the Pay schedule choice', opts);
await A.ev(() => { document.querySelector('[data-paysched]').value = '1|5'; document.querySelector('#_setSave').click(); }); await sleep(2000);
const saved = await A.ev(async () => { const x = await window.__GC_PAY.settings(); return [x.weekStartDay, x.payLagDays, x.hoursCutoffDay]; });
ok(saved.join() === '1,5,0', 'saved in payrollSettings', saved);
s = await screens();
ok(s.run.sched === 'Work week Monday–Sunday, paid the Friday after' && s.run.v.join() === WANT2.join(), 'Mon–Sun: Run Payroll', s.run.v);
ok(s.hand === line(WANT2) && s.auto.join() === WANT2.join(), 'Mon–Sun: Enter by hand + auto draft', [s.hand, s.auto]);
const errs = (A.errs || []).filter(e => /PAGEERROR/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
