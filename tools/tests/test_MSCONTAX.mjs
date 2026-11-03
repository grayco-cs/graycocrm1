// test_MSCONTAX.mjs <build-dir> — patch MSCONTAX in a real (headless) browser, MADE-UP jobs only (offline harness GC_HARNESS):
// Payroll has the 🏛 MS contractor tax tab next to 🧾 Form 941; Q3 2026 lists the MS invoices (TN job and sub bills left out),
// the totals, the over-$75k MPC note, the paid-date toggle and CSV; nothing is written; no page errors.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_MSCONTAX.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const ADMIN = 'wjohnson@grayco-cs.com';
resetCloud();
cset('users', [{ id: 'UA1', name: 'Tess Owner', email: ADMIN, role: 'Admin', active: true, payType: 'owner' }]);
cset('projects', [
  { id: 'A', name: 'Prime retail Southaven', state: 'MS', contract: 120000, client: 'Owner LLC', autoPO: 'A001' },
  { id: 'B', name: 'Sub to GC Hernando', address: '1 Commerce St, Hernando, MS 38632', contract: 40000, client: 'Big GC', autoPO: 'A002' },
  { id: 'D', name: 'Bartlett office', address: '6000 Stage Rd, Bartlett, TN 38134', contract: 90000, autoPO: 'A003' }]);
cset('invs', [
  { id: 'i1', type: 'client', pid: 'A', invNum: '1001', date: '2026-07-10', amt: 50000, status: 'paid', paidDate: '2026-08-01', lines: [{ desc: 'MS contractor tax', amt: 1750 }] },
  { id: 'i3', type: 'client', pid: 'B', invNum: '1003', date: '2026-08-15', amt: 20000, status: 'sent' },
  { id: 'i5', type: 'client', pid: 'D', invNum: '1005', date: '2026-08-01', amt: 45000, status: 'sent' },
  { id: 'i6', type: 'sub', pid: 'A', invNum: 'S1', date: '2026-08-01', amt: 9999, status: 'pending' }]);
const A = await computer('A', { build });
const p = A.page(); const errs = []; p.on('pageerror', e => errs.push(String(e.message || e)));
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(ADMIN); await p.locator('#gc-auth-password').fill(ACCOUNTS[ADMIN].pw); await sleep(300);
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await waitFor(A, () => !!(window.__GC_PAY && window._gcMsTaxRender && window.__GC_PAY.canSee() && window._crm && (window._crm.invoices || []).length >= 4), null, 120000, 400);
await sleep(3000);
const before = await A.ev(async () => JSON.stringify([await window.idbGet('invs'), await window.idbGet('projects')]));
await A.ev(() => window._gcOpenPayrollTab('mstax')); await sleep(2500);
const tabs = await A.ev(() => [...document.querySelectorAll('#gc-payroll-mount [data-tab]')].map(b => b.getAttribute('data-tab')));
ok(tabs.includes('mstax') && tabs.indexOf('mstax') === tabs.indexOf('f941') + 1, 'Payroll has 🏛 MS contractor tax right after 🧾 Form 941', tabs);
await waitFor(A, () => !!document.querySelector('[data-mstax]'), null, 20000, 300);
await p.locator('[data-mstax-q]').selectOption('2026-3'); await sleep(800);
const v = await A.ev(() => { const t = document.querySelector('[data-mstax]').innerText; return { t: t.slice(0, 1500), rows: [...document.querySelectorAll('[data-mstax-row]')].map(r => r.children[2].textContent) }; });
ok(/Q3 2026/.test(v.t) && /confirm with the CPA/.test(v.t), 'Q3 2026 worksheet, labelled for the CPA', v.t.slice(0, 200));
ok(JSON.stringify(v.rows) === '["1001","1003"]', 'lists the two MS invoices (TN job and the sub bill left out)', v.rows);
ok(/\$70,000\.00/.test(v.t) && /\$2,450\.00/.test(v.t) && /\$1,750\.00/.test(v.t) && /\$700\.00/.test(v.t), 'gross 70,000 · tax 2,450 · on invoices 1,750 · not collected 700', v.t);
ok(/Material Purchase Certificate/.test(v.t) && /Prime retail Southaven/.test(v.t), 'over-$75k job flagged for the MPC + bond');
await p.locator('[data-mstax-basis]').selectOption('paid'); await sleep(800);
ok(await A.ev(() => JSON.stringify([...document.querySelectorAll('[data-mstax-row]')].map(r => r.children[2].textContent)) === '["1001"]'), 'by paid date → only the paid invoice');
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.locator('[data-mstax-csv]').click()]);
ok(dl && dl.suggestedFilename() === 'GrayCo_MS_contractor_tax_Q3_2026.csv', 'Download CSV', dl && dl.suggestedFilename());
const after = await A.ev(async () => JSON.stringify([await window.idbGet('invs'), await window.idbGet('projects')]));
ok(before === after, 'nothing written to invoices / projects');
ok(!errs.some(e => /mstax|MsTax|MSCONTAX/i.test(e)), 'no page errors from the worksheet', errs.slice(0, 5));
console.log(`MSCONTAX ${pass}/${pass + fail}`);
await shared.close(); process.exit(fail ? 1 : 0);
