// test_PAYREPLACE.mjs <build-dir> — patch PAYREPLACE in a real (headless) browser, owner signed in, MADE-UP people only.
// Old unpaid drafts (one exact copy, one denied) fold on load; 📥 Enter past payroll for one week retires that person's
// unpaid lines dated on/before the cutoff; a later pending run and the paid run stay; the employee's check list shows
// paid first and the rest under a collapsed "Drafts (not paid)". Offline harness (GC_HARNESS).
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_PAYREPLACE.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const ADMIN = 'wjohnson@grayco-cs.com';
const USERS = [
  { id: 'UA1', name: 'Tess Owner', email: ADMIN, role: 'Admin', active: true, payType: 'owner' },
  { id: 'UT1', name: 'Avery Testworth', email: 'avery.test@example.test', role: 'Crew', active: true, payType: 'salary' },
  { id: 'UT2', name: 'Blake Sampleton', email: 'blake.test@example.test', role: 'Sales', active: true, payType: 'commission' }];
const prof = (id, u, x) => Object.assign({ id, userId: u.id, name: u.name, email: u.email, payType: 'hourly', annualSalary: 0, hourlyRate: 0, otAfter: 40, otMultiplier: 1.5,
  period: 'weekly', filing: 'single', dependentsCredit: 0, otherIncome: 0, deductions: 0, extra: 0, state: 'TN', otherDeductions: [], active: true }, x);
const PROFILES = [prof('PPUT1', USERS[1], { payType: 'salary', annualSalary: 70000 }), prof('PPUT2', USERS[2], { payType: 'commission' }), prof('PPOWN', USERS[0], { payType: 'owner_draw' })];
const A1 = (g, st) => ({ empId: 'UT1', name: 'Avery Testworth', gross: g, net: g - 400, fed: 200, ss: r(g * .062), med: r(g * .0145), state: st || 0, status: 'pending' });
function r(x) { return Math.round(x * 100) / 100; }
const run = (id, status, from, to, payDate, lines) => ({ id, status, from, to, payDate, auto: true, lines, totals: { gross: lines.reduce((s, L) => s + L.gross, 0) } });
const RUNS = [
  run('PRD1', 'draft', '2026-09-19', '2026-10-02', '2026-10-02', [A1(2692.31)]),
  run('PRD1b', 'draft', '2026-09-19', '2026-10-02', '2026-10-02', [A1(2692.31)]),   // exact copy
  run('PRD2', 'denied', '2026-10-03', '2026-10-16', '2026-10-16', [A1(2692.31, 66.77)]),
  run('PRD3', 'pending', '2026-11-05', '2026-11-11', '2026-11-13', [A1(1346.15)]),   // after the cutoff: stays
  Object.assign(run('PRP1', 'paid', '2026-09-26', '2026-10-02', '2026-10-09', [Object.assign(A1(1346.15), { status: 'paid', checkNo: '4001' })]), { auto: false })];
resetCloud();
cset('users', USERS); cset('payrollProfiles', PROFILES); cset('payrollRuns', RUNS); cset('payrollTaxPayments', []); cset('gcAcctRegister', []);
cset('gc_check_queue', []); cset('gc_tombstones', {}); cset('timesheets', []);
cset('payrollSettings', { pastPayCutoff: '2026-11-03', pastPayAutoStub: false, companyName: 'Test Co LLC' });

const A = await computer('A', { build }); const p = A.page();
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(ADMIN); await p.locator('#gc-auth-password').fill(ACCOUNTS[ADMIN].pw); await sleep(300);
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await waitFor(A, async () => !!(window.__GC_PAY && window._gcPastPayOpen && window.__GC_PAY.isAdmin()) && (await window.__GC_PAY.profiles()).length >= 2, null, 120000, 400);
await sleep(4000);
const ids = async () => A.ev(async () => (await window.__GC_PAY.runs()).map(r => r.id + ':' + r.status + ':' + r.lines.length).sort());
const i1 = await ids();
ok(!i1.some(x => /^PRD1b:/.test(x)) && i1.some(x => /^PRD1:/.test(x)), 'on load the exact copy PRD1b folds into PRD1', i1);
await A.ev(() => window._gcOpenPayrollTab('run')); await sleep(2500);
await A.ev(() => document.getElementById('_pPast').click()); await sleep(2500);
await p.locator('[data-pp="first"]').fill('2026-10-16'); await p.locator('[data-pp="last"]').fill('2026-10-16');
await p.locator('[data-pp="fill"]').click(); await sleep(1500);
const n = await A.ev(() => document.querySelectorAll('#_gcPpOv tr[data-row]').length);
let row = -1; for (let i = 0; i < n; i++) if (/Avery/.test(await A.ev(i => document.querySelector('#_gcPpOv tr[data-row="' + i + '"] [data-k="name"]').value, i))) row = i;
ok(row >= 0, 'past-payroll grid has Avery for 10/16', n);
await p.locator(`#_gcPpOv tr[data-row="${row}"] [data-k="gross"]`).fill('1346.15'); await sleep(2000);
await p.locator('[data-pp="save"]').click(); await sleep(5000);
const i2 = await ids();
ok(!i2.some(x => /^PRD1:|^PRD2:/.test(x)), 'saving the paid week retires the unpaid drafts dated on/before 11/03 (PRD1, denied PRD2)', i2);
ok(i2.some(x => x === 'PRD3:pending:1') && i2.some(x => x === 'PRP1:paid:1') && i2.filter(x => /:paid:/.test(x)).length === 2, 'the later pending run and the paid runs stay', i2);
const dead = await A.ev(() => ['PRD1', 'PRD1b', 'PRD2'].every(id => window._gcxDead && window._gcxDead('payrollRuns', id)));
ok(dead, 'the removed runs are tombstoned');
const arch = await A.ev(async () => (await window.idbGet('payrollRetired') || []).map(x => x.runId + ':' + x.why));
ok(arch.length === 3, 'three retired lines archived in payrollRetired', arch);
// the employee's check list
await A.ev(() => window._gcOpenPayrollTab('employees')); await sleep(2500);
await A.ev(() => { const a = document.querySelector('#gc-payroll-mount [data-emp="UT1"]') || document.querySelector('[data-emp="UT1"]'); a && a.click(); }); await sleep(2500);
const ui = await A.ev(() => { const b = document.querySelector('[data-prdr]'); const rows = [...document.querySelectorAll('tr')].map(t => t.textContent);
  return { btn: b && b.textContent, d3: rows.filter(t => /^2026-11-13/.test(t)).length, paid: rows.filter(t => /^2026-10-(09|16)/.test(t)).length }; });
ok(ui.btn && /Drafts \(not paid\) · \d/.test(ui.btn) && ui.d3 === 0 && ui.paid === 2, 'paid checks listed; drafts collapsed under "Drafts (not paid)"', ui);
await A.ev(() => document.querySelector('[data-prdr]').click()); await sleep(1500);
const d3 = await A.ev(() => [...document.querySelectorAll('tr')].filter(t => /^2026-11-13/.test(t.textContent)).length);
ok(d3 === 1, 'opening it shows the draft', d3);
const auto = await A.ev(async () => (await window.__GC_PAY.runs()).filter(r => !/^PR[DP]/.test(r.id) && !/paid|approved/.test(r.status)).map(r => [r.id, r.from, r.to, r.payDate, (r.lines || []).map(L => L.name + ' ' + L.gross).join('; ')]));
const days = x => Math.round((Date.parse(x[2]) - Date.parse(x[1])) / 864e5) + 1;
ok(auto.every(x => days(x) === 7) && auto.every(x => !/Avery Testworth 2692/.test(x[4])), 'drafts the CRM made itself are one week each, salary weekly (no every-2-weeks $2,692.31)', auto);
const errs = (A.errs || []).filter(e => /PAGEERROR/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
