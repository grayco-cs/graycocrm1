// test_PAYEDIT2.mjs <build-dir> — patch PAYEDIT2 in a real (headless) browser, owner signed in, MADE-UP people only.
// (1) the owner's unpaid commission checks leave the checks due by themselves (archived), the employee's stay;
// (2) Payroll → Approvals: ✏️ Edit on a paid run entered by hand reopens it (pending, history "reopened for edit by …",
// per-line ✏️ Edit), ✓ Approve puts it back to paid; ✏️ Edit on a paystub run opens 📥 Enter past payroll with it loaded.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cget, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_PAYEDIT2.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const ADMIN = 'wjohnson@grayco-cs.com';
const USERS = [
  { id: 'UA1', name: 'Tess Owner', email: ADMIN, role: 'Admin', active: true, payType: 'owner' },
  { id: 'UT1', name: 'Avery Testworth', email: 'avery.test@example.test', role: 'Project Manager', active: true, payType: 'commission' }];
const prof = (id, u, x) => Object.assign({ id, userId: u.id, name: u.name, email: u.email, payType: 'hourly', annualSalary: 0, hourlyRate: 25, otAfter: 40, otMultiplier: 1.5,
  period: 'weekly', filing: 'single', dependentsCredit: 0, otherIncome: 0, deductions: 0, extra: 0, state: 'TN', otherDeductions: [], active: true }, x);
const line = (st, x) => Object.assign({ empId: 'UT1', name: 'Avery Testworth', payType: 'hourly', hours: 40, gross: 1000, commission: 0, fed: 80, ss: 62, med: 14.5, addlMed: 0, state: 0, net: 843.5, status: st, checkNo: '4001', paidOut: true }, x);
const RUNS = [
  { id: 'RHAND', status: 'paid', enteredManually: true, from: '2026-08-15', to: '2026-08-21', payDate: '2026-08-21', lines: [line('paid')], totals: { gross: 1000, net: 843.5 } },
  { id: 'RSTUB', status: 'paid', source: 'paystub-entry', noBooks: true, from: '2026-08-22', to: '2026-08-28', payDate: '2026-08-28', lines: [line('paid', { checkNo: '4002', commission: 200, gross: 1200, net: 1000 })], totals: { gross: 1200, net: 1000 } }];
const ck = (id, emp, amount, x) => Object.assign({ id, dir: 'out', emp, amount, type: 'commission', status: 'entered', payDate: '2026-09-18', date: '2026-09-18', jobId: 'J' + id, ref: 'Test job — collected in full' }, x);
const QUEUE = [ck('CK1', 'Tess Owner', 3138), ck('CK2', 'Tess Owner', 1334.64), ck('CK3', 'Avery Testworth', 512.25), ck('CK4', 'Tess Owner', 99, { status: 'written' })];
resetCloud();
cset('users', USERS); cset('payrollProfiles', [prof('PPUT1', USERS[1]), prof('PPOWN', USERS[0], { payType: 'owner_draw' })]); cset('payrollRuns', RUNS);
cset('gc_check_queue', QUEUE); cset('gc_tombstones', {}); cset('timesheets', []); cset('payrollTaxPayments', []); cset('gcAcctRegister', []);
cset('payrollSettings', { pastPayCutoff: '2026-12-31', pastPayAutoStub: false, companyName: 'Test Co LLC' });

const A = await computer('A', { build }); const p = A.page();
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(ADMIN); await p.locator('#gc-auth-password').fill(ACCOUNTS[ADMIN].pw); await sleep(300);
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await waitFor(A, async () => !!(window.__GC_PAY && window.__GC_PAYEDIT2__ && window.__GC_PAY.isAdmin()) && (await window.__GC_PAY.runs()).length >= 2, null, 120000, 400);
await sleep(12000);   // the self-heal runs 8 s after load
// ── 1. owner commission ──
const q = await A.ev(() => JSON.parse(localStorage.getItem('gc_check_queue') || '[]').map(c => c.id));
ok(q.join() === 'CK3,CK4', 'owner\'s unpaid commission checks left the queue; the employee\'s and the written one stay', q);
const hist = await A.ev(() => JSON.parse(localStorage.getItem('gc_owner_comm_removed') || '[]').map(h => h.check.id + ' ' + h.check.amount));
ok(hist.join() === 'CK1 3138,CK2 1334.64', 'both archived in gc_owner_comm_removed', hist);
const due = await A.ev(async () => (await window._gcChecksDue('2026-11-06')).payroll.map(r => r.name + ' ' + r.amt));
ok(!due.some(x => /Tess Owner — commission/.test(x)) && due.some(x => /Avery Testworth — commission 512.25/.test(x)), 'check run: no owner commission, the PM\'s is there', due);
ok(await A.ev(() => window._gcDraftCheck({ dir: 'out', emp: 'Tess Owner', amount: 5, type: 'commission' }) === null), 'a new owner commission check is refused');
// ── 2. Approvals → ✏️ Edit ──
await A.ev(() => window._gcOpenPayrollTab('approvals')); await sleep(2500);
const btns = await A.ev(() => [...document.querySelectorAll('[data-redit]')].map(b => b.getAttribute('data-redit')).sort());
ok(btns.join() === 'RHAND,RSTUB', 'each paid run card has ✏️ Edit', btns);
let nd = A.dialogs.length;
await A.ev(() => document.querySelector('[data-redit="RHAND"]').click()); await sleep(2500);
const cf = A.dialogs.slice(nd);
ok(cf.some(d => /^confirm: Edit the PAID payroll run/.test(d) && /already written/.test(d)), 'confirm warns the checks were already written', cf);
const r1 = await A.ev(async () => { const r = (await window.__GC_PAY.runs()).find(x => x.id === 'RHAND'); return { st: r.status, from: r.reopenedFrom, h: (r.history || []).map(h => h.note), ls: r.lines.map(L => L.status) }; });
ok(r1.st === 'pending' && r1.from === 'paid' && r1.h.some(n => /^reopened for edit by /.test(n)) && r1.ls.join() === 'pending', 'run reopened: pending, history "reopened for edit by …"', r1);
await A.ev(() => { const b = document.querySelector('[data-open="RHAND"]'); if (b) b.click(); }); await sleep(1500);
ok(await A.ev(() => !!document.querySelector('[data-ledit="RHAND"]') && !!document.querySelector('[data-appr="RHAND"]')), 'its lines have ✏️ Edit and it needs ✓ Approve again');
nd = A.dialogs.length;
await A.ev(() => document.querySelector('[data-appr="RHAND"]').click()); await sleep(3000);
const r2 = await A.ev(async () => { const r = (await window.__GC_PAY.runs()).find(x => x.id === 'RHAND'); return { st: r.status, re: !!r.reopenedForEdit && !(String(r.reapprovedAt || '') > String(r.reopenedForEdit)), h: (r.history || []).map(h => h.action) }; });
ok(r2.st === 'paid' && !r2.re && r2.h.join() === 'reopened for edit,approved again', 'approved again → back to paid, both steps in its history', r2);
// paystub run → past payroll grid with that run loaded
await A.ev(() => window._gcOpenPayrollTab('approvals')); await sleep(2000);
await A.ev(() => document.querySelector('[data-redit="RSTUB"]').click()); await sleep(4000);
const g = await A.ev(() => { const o = document.getElementById('_gcPpOv'); if (!o) return null; const tr = o.querySelector('tr[data-row="0"]'); const v = k => tr && tr.querySelector('[data-k="' + k + '"]').value;
  return { rows: o.querySelectorAll('tr[data-row]').length, first: o.querySelector('[data-pp="first"]').value, last: o.querySelector('[data-pp="last"]').value, gross: v('gross'), comm: v('comm'), chk: v('checkNo'), msg: o.querySelector('[data-pp="msg"]').textContent }; });
ok(g && g.rows === 1 && g.first === '2026-08-28' && g.last === '2026-08-28' && g.gross === '1000.00' && g.comm === '200.00' && g.chk === '4002' && /Loaded 1 saved check/.test(g.msg), 'paystub run: 📥 Enter past payroll opens on its payday with its check loaded', g);
const errs = (A.errs || []).filter(e => /PAGEERROR/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
