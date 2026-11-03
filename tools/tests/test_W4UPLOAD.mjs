// test_W4UPLOAD.mjs <build-dir> — patch W4UPLOAD in a real (headless) browser, owner signed in, MADE-UP people only.
// Team → a person → "🧾 W-4 & taxes →" opens Payroll → Employees → that person; "📄 Upload W-4 / MS 89-350" with the
// fixture fillable W-4 fills the fields (yellow + "found: …"), saves nothing until "Save this employee"; Save keeps
// last-4 SSN only and the file as "W-4 (2026)". Offline harness (GC_HARNESS); pdf.js 3.11.174 served from PDFJS_DIR.
import { pathToFileURL } from 'url'; import { createRequire } from 'module'; import path from 'path'; import { fileURLToPath } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const PDFJS_DIR = process.env.PDFJS_DIR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/pdfjs-dist/build';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2]; if (!build) { console.error('usage: node test_W4UPLOAD.mjs <dir with index.html>'); process.exit(2); }
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'w4_2026_test_fillable.pdf');
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const ADMIN = 'wjohnson@grayco-cs.com';
const USERS = [{ id: 'UA1', name: 'Tess Owner', email: ADMIN, role: 'Admin', active: true },
  { id: 'UT1', name: 'Avery Testworth', email: 'avery.test@example.test', role: 'Crew', active: true, payType: 'hourly', hourlyRate: 25 }];
const PROFILES = [{ id: 'PPUT1', userId: 'UT1', name: 'Avery Testworth', payType: 'hourly', hourlyRate: 25, otAfter: 40, otMultiplier: 1.5, period: 'weekly', filing: 'single',
  dependentsCredit: 0, otherIncome: 0, deductions: 0, extra: 0, state: 'TN', otherDeductions: [], active: true }];
resetCloud(); cset('users', USERS); cset('payrollProfiles', PROFILES); cset('payrollRuns', []); cset('timesheets', []);
const A = await computer('A', { build }); const p = A.page();
await A.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\//, r => r.fulfill({ path: PDFJS_DIR + '/' + r.request().url().split('/').pop(), contentType: 'text/javascript' }));
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(ADMIN); await p.locator('#gc-auth-password').fill(ACCOUNTS[ADMIN].pw); await sleep(300);
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await waitFor(A, async () => !!(window.__GC_PAY && window.__GC_W4UPLOAD__ && window.__GC_PAY.isAdmin()) && (await window.__GC_PAY.profiles()).length >= 1, null, 120000, 400);
await sleep(3000);
// Team → person → 🧾 W-4 & taxes →
let found = false;
for (const v of ['team', 'employees', 'users', 'hr', 'admin', 'staff']) {
  await A.ev(v => { try { window._setView(v); } catch (e) {} }, v); await sleep(1500);
  const n = await A.ev(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '👁 Profile' && /Avery/.test(b.closest('tr,div')?.textContent || '')); if (b) { b.click(); return 1; } return 0; });
  if (n) { found = v; break; }
}
await sleep(1500);
const tb = await A.ev(() => { const b = [...document.querySelectorAll('button')].find(b => /W-4 & taxes/.test(b.textContent)); if (b) b.click(); return !!b; });
ok(found && tb, 'Team profile has "🧾 W-4 & taxes →" (view ' + found + ')');
await sleep(3000);
ok(await A.ev(() => !!document.getElementById('_w4Up') && /Avery Testworth/.test(document.body.textContent)), 'it opens Payroll → Employees → Avery, with "📄 Upload W-4 / MS 89-350"');
const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 10000 }), A.ev(() => document.getElementById('_w4Up').click())]);
await fc.setFiles(FIX);
await waitFor(A, () => !!document.querySelector('[data-w4found]'), null, 30000, 300);
await sleep(800);
const st = await A.ev(() => { const g = k => document.querySelector('[data-p="' + k + '"]'); const f = k => (document.querySelector('[data-w4found="' + k + '"]') || {}).textContent || '';
  return { filing: g('filing').value, mj: g('multipleJobs').value, dc: g('dependentsCredit').value, oi: g('otherIncome').value, de: g('deductions').value, ex: g('extra').value, ssn: g('ssn4').value,
    fFiling: f('filing'), yellow: document.querySelectorAll('[data-w4changed]').length, msg: document.getElementById('_w4Msg').textContent, msF: g('msFiling').value }; });
ok(st.filing === 'married' && st.mj === 'yes' && st.dc === '4900' && st.oi === '1200' && st.de === '3000.5' && st.ex === '25' && st.ssn === '3456', 'fields filled from the fillable PDF', st);
ok(/found: Married filing jointly/.test(st.fFiling) && st.yellow >= 6 && /fillable PDF/.test(st.msg) && /Save this employee/.test(st.msg) && st.msF === '', '"found: Married filing jointly", changed fields yellow, MS left alone', st);
const before = await A.ev(async () => (await window.__GC_PAY.profiles())[0]);
ok(before.filing === 'single' && !before.ssn4 && !before.taxDocs, 'nothing saved before Save', before);
await A.ev(() => document.getElementById('_pSaveProf').click()); await sleep(2500);
const after = await A.ev(async () => (await window.__GC_PAY.profiles())[0]);
ok(after.filing === 'married' && after.dependentsCredit === 4900 && after.ssn4 === '3456' && after.multipleJobs === true, 'Save stores the W-4', after);
ok(Array.isArray(after.taxDocs) && after.taxDocs[0].label === 'W-4 (2026)' && /^sb:/.test(after.taxDocs[0].ref), 'the file is kept with the employee as "W-4 (2026)"', after.taxDocs);
ok(!/123456|12-3456/.test(JSON.stringify(after)), 'no full SSN in the saved profile');
const errs = (A.errs || []).filter(e => /PAGEERROR/.test(e)); ok(!errs.length, 'no page errors', errs.slice(0, 5));
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
