// test_F941_PAST.mjs <build-dir> — patch PASTPAY in a real (headless) browser, owner signed in, MADE-UP people only.
// Payroll → Run Payroll → "📥 Enter past payroll (from paystubs)": Make weekly rows (Q3 2026, 13 Fridays × 2
// employees), type each gross (+2 commissions); Social Security / Medicare / federal (from the W-4) fill in; Save all
// → 13 PAID runs tagged paystub-entry; 🧾 Form 941 shows the quarter; and NO side effects: nothing posted to the
// accounting register, no checks to write, nothing in the check queue. Offline harness (GC_HARNESS).
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cget, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_F941_PAST.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const ADMIN = 'wjohnson@grayco-cs.com';
const USERS = [
  { id: 'UA1', name: 'Tess Owner', email: ADMIN, role: 'Admin', active: true, payType: 'owner' },
  { id: 'UT1', name: 'Avery Testworth', email: 'avery.test@example.test', role: 'Crew', active: true, payType: 'hourly', hourlyRate: 25 },
  { id: 'UT2', name: 'Blake Sampleton', email: 'blake.test@example.test', role: 'Sales', active: true, payType: 'commission' },
  { id: 'U5', name: 'Office', email: 'office@grayco-cs.com', role: 'Office', active: true, payType: 'salary' }];   // the shared Office sign-in (production has it)
const prof = (id, u, x) => Object.assign({ id, userId: u.id, name: u.name, email: u.email, payType: 'hourly', annualSalary: 0, hourlyRate: 0, otAfter: 40, otMultiplier: 1.5,
  period: 'weekly', filing: 'single', dependentsCredit: 0, otherIncome: 0, deductions: 0, extra: 0, state: 'TN', otherDeductions: [], active: true }, x);
const PROFILES = [prof('PPUT1', USERS[1], { payType: 'hourly', hourlyRate: 25 }), prof('PPUT2', USERS[2], { payType: 'commission' }),
  prof('PPOWN', USERS[0], { payType: 'owner_draw' }), prof('PPOFF', USERS[3], { payType: 'salary' })];
const REG0 = [{ id: 'RGQB1', srcInvId: 'QB-IMPORT-1', type: 'expense', category: 'Payroll — Wages', payee: 'from QuickBooks', amt: 1000, date: '2026-07-03', status: 'paid' }];
resetCloud();
cset('users', USERS); cset('payrollProfiles', PROFILES); cset('payrollRuns', []); cset('payrollTaxPayments', []); cset('gcAcctRegister', REG0);
cset('gc_check_queue', []); cset('gc_tombstones', {}); cset('timesheets', []);
cset('payrollSettings', { pastPayCutoff: '2026-12-31', pastPayAutoStub: false, companyName: 'Test Co LLC', companyAddr: '100 Test Way, Memphis, TN 38103', ein: '12-3456789' });

const A = await computer('A', { build }); const p = A.page();
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(ADMIN); await p.locator('#gc-auth-password').fill(ACCOUNTS[ADMIN].pw); await sleep(300);
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await waitFor(A, async () => !!(window.__GC_PAY && window._gcPastPayOpen && window.__GC_PAY.isAdmin()) && (await window.__GC_PAY.profiles()).length >= 2, null, 120000, 400);
await sleep(4000);
ok(await A.ev(() => !!window.__GC_PASTPAY__ && !!window.__GC_F941__), 'owner signed in; PASTPAY + F941 loaded');
await A.ev(() => window._gcOpenPayrollTab('run')); await sleep(2500);
ok(await A.ev(() => !!document.getElementById('_pPast')), 'Run Payroll has "📥 Enter past payroll (from paystubs)"');
await A.ev(() => document.getElementById('_pPast').click()); await sleep(2500);   // the ROLEAPPS desk layer sits over the tab in this harness
ok(await A.ev(() => [...document.querySelectorAll('#_gcPpOv th')].some(th => /State tax/i.test(th.textContent))), 'grid has a State tax column (PASTPAYMS)');
ok(await A.ev(() => !!document.getElementById('_gcPpOv')), 'it opens the grid');
const emps = await A.ev(() => [...document.querySelectorAll('#_gcPpOv [data-pp-emp]')].map(c => c.parentElement.textContent.trim()));
ok(emps.length === 2 && !emps.some(e => /Tess|Office/.test(e)), 'only the two W-2 employees are offered (not the owner on draws, not the shared Office account)', emps);
const range = await A.ev(() => [document.querySelector('[data-pp="first"]').value, document.querySelector('[data-pp="last"]').value]);
ok(range[0] === '2026-07-03' && range[1] === '2026-09-25', 'it starts on Q3 2026: first payday Fri 7/3, last Fri 9/25', range);
await p.locator('[data-pp="fill"]').click(); await sleep(1500);
const nRows = await A.ev(() => document.querySelectorAll('#_gcPpOv tr[data-row]').length);
ok(nRows === 26, 'Make weekly rows → 13 paydays × 2 employees', nRows);
const t0 = Date.now();
for (let i = 0; i < 26; i++) {
  const nm = await A.ev(i => document.querySelector('#_gcPpOv tr[data-row="' + i + '"] [data-k="name"]').value, i);
  await p.locator(`#_gcPpOv tr[data-row="${i}"] [data-k="gross"]`).fill(/Avery/.test(nm) ? '1234.56' : '812.34');
  await p.locator(`#_gcPpOv tr[data-row="${i}"] [data-k="checkNo"]`).fill(String(5001 + i));
}
for (const i of [12, 20]) await p.locator(`#_gcPpOv tr[data-row="${i}"] [data-k="comm"]`).fill('250');
await sleep(2500);
console.log('    (typing 26 rows took ' + Math.round((Date.now() - t0) / 1000) + ' s in the test)');
const r0 = await A.ev(() => { const tr = document.querySelector('#_gcPpOv tr[data-row="0"]'); const v = k => tr.querySelector('[data-k="' + k + '"]').value; return { fed: v('fed'), ss: v('ss'), med: v('med'), net: v('net') }; });
ok(r0.ss === '76.54' && r0.med === '17.90' && +r0.fed > 0 && Math.abs(+r0.net - (1234.56 - 76.54 - 17.90 - +r0.fed)) < 0.006, 'row 1 fills in: SS 6.2%, Medicare 1.45%, federal from the W-4, net', r0);
// a stub that differs: yellow warning, the stub wins
await p.locator('#_gcPpOv tr[data-row="1"] [data-k="ficaMode"]').selectOption('stub'); await sleep(800);
await p.locator('#_gcPpOv tr[data-row="1"] [data-k="ss"]').fill('50.37'); await sleep(1500);
ok(await A.ev(() => /not 6\.2%/.test(document.querySelector('#_gcPpOv tr[data-note="1"]').textContent)), 'a stub SS amount that is not 6.2% gets the yellow warning');
await p.locator('#_gcPpOv tr[data-row="1"] [data-k="ss"]').fill('50.37'.replace('50.37', String((812.34 * 0.062).toFixed(2)))); await sleep(1200);
const nd = A.dialogs.length;
await p.locator('[data-pp="save"]').click(); await sleep(4000);
ok(A.dialogs.slice(nd).some(d => /^confirm: Save 13 paid payroll runs \(26 checks/.test(d)), 'Save all asks once: 13 paid runs, 26 checks', A.dialogs.slice(nd));
const runs = await A.ev(async () => (await window.__GC_PAY.runs()).map(r => ({ id: r.id, st: r.status, src: r.source, nb: r.noBooks, pd: r.payDate, n: r.lines.length, paidOut: r.lines.every(L => L.paidOut && L.checkNo) })));
ok(runs.length === 13 && runs.every(r => r.st === 'paid' && r.src === 'paystub-entry' && r.nb === true && r.n === 2 && r.paidOut), '13 PAID runs, 2 checks each, tagged paystub-entry, check # kept', runs.slice(0, 2));
const fedSum = await A.ev(async () => Math.round((await window.__GC_PAY.runs()).reduce((s, r) => s + r.lines.reduce((t, L) => t + L.fed, 0), 0) * 100) / 100);

await A.ev(() => window._gcF941Open(2026, 3)); await sleep(3000);
await waitFor(A, () => !!document.querySelector('[data-f941] [data-f941-line="12"]'), null, 20000, 300);
const v = await A.ev(() => { const g = n => { const r = document.querySelector('[data-f941] tr[data-f941-line="' + n + '"]'); return r ? r.lastElementChild.textContent.trim() : null; };
  return { L1: g('1'), L2: g('2'), L3: g('3'), L5e: g('5e'), reg: document.querySelectorAll('[data-f941-register] tr[data-f941-reg-row]').length }; });
const money = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
ok(v.L1 === '2' && v.L2 === '$27,109.70' && v.L3 === money(fedSum) && v.L5e === '$4,147.78' && v.reg === 26, '🧾 Form 941 Q3 2026: L1 2, L2 $27,109.70, L3 = federal typed/calculated, 5e $4,147.78, 26 register rows', { v, fedSum });

// no side effects (the books sweep runs 17 s after load and every 2 min; give it time)
await A.ev(() => window._gcPostMissingWages && window._gcPostMissingWages(true)); await sleep(20000);
const reg = await A.ev(async () => (await window.idbGet('gcAcctRegister') || []).filter(r => /PAYROLL/.test(String(r.srcInvId || ''))).length);
ok(reg === 0, 'nothing posted to the accounting register (wages are already in QuickBooks)', reg);
const due = await A.ev(async () => (await window._gcChecksDue('2026-12-31')).payroll.length);
ok(due === 0, 'no payroll checks to write', due);
const owe = await A.ev(async () => { try { const x = window._gcEveryoneWeOwe ? await window._gcEveryoneWeOwe('2026-12-31') : null; return x ? (x.due || []).concat(x.scheduled || [], x.held || []).filter(r => r.kind === 'wages').length : 0; } catch (e) { return 'err ' + e.message; } });
ok(owe === 0, '"Everyone we owe" has no wage checks', owe);
let q = cget('gc_check_queue'); if (typeof q === 'string') q = JSON.parse(q);
ok(Array.isArray(q) ? q.length === 0 : true, 'the check queue is empty', q);
const errs = (A.errs || []).filter(e => /PAGEERROR/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
