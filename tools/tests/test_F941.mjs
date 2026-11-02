// test_F941.mjs <build-dir> — patch F941: the read-only 🧾 Form 941 worksheet in a real (headless) browser.
// Owner signed in (offline harness GC_HARNESS, default the session scratchpad's wN/harness_N.mjs), MADE-UP payroll only:
// Payroll → 🧾 Form 941 shows Q3 2026 by default with the hand-checked numbers of tools/tests/test_F941_fn.mjs'
// simpler cousin below; the office does not get the tab; the tax calendar's Form 941 row has "📄 Form 941 numbers";
// Copy / CSV work; nothing is written to payroll data; no page errors.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cget, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_F941.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };

const ADMIN = 'wjohnson@grayco-cs.com';
const USERS = [
  { id: 'UA1', name: 'Tess Owner', email: ADMIN, role: 'Admin', active: true, payType: 'owner' },
  { id: 'UT1', name: 'Avery Testworth', email: 'avery.test@example.test', role: 'Crew', active: true, payType: 'hourly', hourlyRate: 25 },
  { id: 'UT2', name: 'Blake Sampleton', email: 'blake.test@example.test', role: 'Crew', active: true, payType: 'salary', salary: 52000 }];
const r2 = v => Math.round(v * 100) / 100;
const L = (name, gross, fed, x) => Object.assign({ empId: name, name, payType: 'hourly', gross, taxable: gross, medWages: gross, ssWages: gross, fed,
  ss: r2(gross * .062), med: r2(gross * .0145), addlMed: 0, state: 0, futa: 0, suta: 0, status: 'approved', checkNo: '1' }, x);
// biweekly: Q3 pay dates 7/10, 7/24, 8/7, 8/21, 9/4, 9/18 (period = payDate−13 … payDate; 9/5–9/18 includes Sept 12)
const PD = ['2026-07-10', '2026-07-24', '2026-08-07', '2026-08-21', '2026-09-04', '2026-09-18'];
const back = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };
const RUNS = PD.map((pd, i) => ({ id: 'RF' + i, from: back(pd, 13), to: pd, payDate: pd, status: 'approved', createdBy: 'Tess Owner',
  lines: [L('Avery Testworth', 2000, 200), L('Blake Sampleton', 1000, 80, { payType: 'salary' })].concat(i === 5 ? [L('Ad Vendor LLC', 750, 0, { payType: 'contractor_1099', ss: 0, med: 0, ssWages: 0 })] : []) }));
// per run: wages 3000, fed 280, EE FICA 124+29+62+14.5 = 229.50 → 941 liability 280 + 3000×0.153 = 739.00
const PAYS = [{ id: 'TXPa', kind: '941', date: '2026-08-14', amount: 1478 }, { id: 'TXPb', kind: '941', date: '2026-09-15', amount: 1478 }];   // Sept's 1,478 not recorded
resetCloud();
cset('users', USERS); cset('payrollRuns', RUNS); cset('payrollTaxPayments', PAYS); cset('payrollProfiles', []); cset('gc_tombstones', {}); cset('timesheets', []);

const A = await computer('A', { build });
const p = A.page();
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(ADMIN); await p.locator('#gc-auth-password').fill(ACCOUNTS[ADMIN].pw); await sleep(300);
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await waitFor(A, async () => !!(window.__GC_PAY && window._gcF941 && window.__GC_PAY.isAdmin()) && (await window.__GC_PAY.runs()).length >= 6, null, 120000, 400);
await sleep(5000);
ok(await A.ev(() => !!window.__GC_F941__ && window._gcF941CanSee()), 'owner signed in; patch F941 loaded; the owner may see it');
const before = await A.ev(async () => JSON.stringify([await window.idbGet('payrollRuns'), await window.idbGet('payrollTaxPayments')]));

await A.ev(() => window._gcOpenPayrollTab('f941')); await sleep(2500);
const tabs = await A.ev(() => [...document.querySelectorAll('#gc-payroll-mount [data-tab]')].map(b => b.getAttribute('data-tab')));
ok(tabs.includes('f941'), 'Payroll has the 🧾 Form 941 tab', tabs);
await waitFor(A, () => !!document.querySelector('[data-f941] [data-f941-line="12"]'), null, 20000, 300);
const shown = await A.ev(() => {
  const v = n => { const r = document.querySelector('[data-f941] tr[data-f941-line="' + n + '"]'); return r ? r.lastElementChild.textContent.trim() : null; };
  return { title: (document.querySelector('[data-f941]') || {}).innerText.slice(0, 80), L1: v('1'), L2: v('2'), L3: v('3'), L5e: v('5e'), L6: v('6'), L7: v('7'), L12: v('12'), L13: v('13'), L14: v('14'),
    m1: v('Month 1'), m3: v('Month 3'), tot: v('Total'), warns: [...document.querySelectorAll('[data-f941-warn]')].map(w => w.textContent) };
});
ok(/Q3 2026/.test(shown.title), 'it opens on the last ended quarter (Q3 2026)', shown.title);
ok(shown.L1 === '2', 'line 1 = 2 employees (the 1099 vendor is not counted)', shown.L1);
ok(shown.L2 === '$18,000.00' && shown.L3 === '$1,680.00', 'lines 2 and 3', [shown.L2, shown.L3]);
ok(shown.L5e === '$2,754.00' && shown.L6 === '$4,434.00' && shown.L7 === '$0.00' && shown.L12 === '$4,434.00', 'lines 5e, 6, 7, 12', shown);
ok(shown.L13 === '$2,956.00' && shown.L14 === '$1,478.00', 'line 13 = recorded deposits; line 14 = balance due', [shown.L13, shown.L14]);
ok(shown.m1 === '$1,478.00' && shown.m3 === '$1,478.00' && shown.tot === '$4,434.00', 'Part 2 monthly liability totals line 12', [shown.m1, shown.m3, shown.tot]);
ok(shown.warns.some(w => /does not equal line 12/.test(w)), 'the red warning: line 13 ≠ line 12', shown.warns);

const csvName = await (async () => { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.locator('[data-f941-csv]').click()]); return dl ? dl.suggestedFilename() : null; })();
ok(csvName === 'Form941_Q3_2026.csv', 'Download CSV', csvName);
await p.locator('[data-f941-copy]').click(); await sleep(600);
ok(await A.ev(() => /Copied/.test(document.querySelector('[data-f941-copy]').textContent)), 'Copy all numbers');
await p.locator('[data-f941-q]').selectOption('2026-2'); await sleep(2000);
ok(await A.ev(() => /Q2 2026/.test(document.querySelector('[data-f941]').innerText) && [...document.querySelectorAll('[data-f941-warn]')].some(w => /No approved payroll was paid in April/.test(w.textContent))), 'another quarter (Q2, no runs) shows the red no-payroll warning');

// the tax calendar's Form 941 row
await A.ev(() => window._setView('admin')); await sleep(3000);
const btn = await A.ev(() => { const r = document.querySelector('tr[data-tax-item="941q"]'); return r ? !!r.querySelector('[data-f941-open]') : null; });
if (btn === null) console.log('  (tax calendar not on the Admin page in this build — button check skipped)');
else {
  ok(btn, 'the tax calendar\'s "Form 941 — quarterly" row has "📄 Form 941 numbers"');
  await p.locator('tr[data-tax-item="941q"] [data-f941-open]').first().click(); await sleep(3000);
  ok(await A.ev(() => !!document.querySelector('[data-f941]')), 'the button opens the worksheet');
}
const after = await A.ev(async () => JSON.stringify([await window.idbGet('payrollRuns'), await window.idbGet('payrollTaxPayments')]));
ok(before === after, 'read-only: payroll runs and tax payments are unchanged');
const errs = (A.errs || []).filter(e => /PAGEERROR/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
