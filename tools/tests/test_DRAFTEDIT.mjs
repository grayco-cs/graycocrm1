// test_DRAFTEDIT.mjs <build-dir> — patch DRAFTEDIT in a real (headless) browser, owner signed in, MADE-UP people only.
// (1) Payroll → Approvals → a draft run's hourly line: ✏️ Edit → 45 hours → gross / taxes from computeLine, 40 + 5 OT,
//     run pending + auto:false, history "hours changed by …"; the automatic draft does not revert it or add a 2nd draft.
// (2) Pay stub opens on screen fast even when the paystubs server takes 20 s (draft run and a paid run entered by hand).
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2], STUB_ONLY = process.env.STUB_ONLY === '1';
if (!build) { console.error('usage: node test_DRAFTEDIT.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const ADMIN = 'wjohnson@grayco-cs.com';
const USERS = [
  { id: 'UA1', name: 'Tess Owner', email: ADMIN, role: 'Admin', active: true, payType: 'owner' },
  { id: 'US1', name: 'Sal Testworth', email: 'sal.test@example.test', role: 'Office Manager', active: true, payType: 'salary' },
  { id: 'UB1', name: 'Bree Testhour', email: 'bree.test@example.test', role: 'Office Assistant', active: true, payType: 'hourly' }];
const prof = (id, u, x) => Object.assign({ id, userId: u.id, name: u.name, email: u.email, payType: 'hourly', annualSalary: 0, hourlyRate: 15.2, otAfter: 40, otMultiplier: 1.5,
  period: 'weekly', filing: 'single', dependentsCredit: 0, otherIncome: 0, deductions: 0, extra: 0, state: 'TN', otherDeductions: [], active: true }, x);
const HAND = { id: 'RHAND', status: 'paid', enteredManually: true, from: '2026-08-15', to: '2026-08-21', payDate: '2026-08-21',
  lines: [{ empId: 'UB1', name: 'Bree Testhour', payType: 'hourly', hours: 20, gross: 304, fed: 0, ss: 18.85, med: 4.41, addlMed: 0, state: 0, net: 280.74, status: 'paid', checkNo: '4001' }], totals: { gross: 304, net: 280.74 } };
resetCloud();
cset('users', USERS); cset('payrollProfiles', [prof('PPS', USERS[1], { payType: 'salary', annualSalary: 52000 }), prof('PPB', USERS[2])]); cset('payrollRuns', [HAND]);
cset('gc_check_queue', []); cset('gc_tombstones', {}); cset('timesheets', []); cset('payrollTaxPayments', []); cset('gcAcctRegister', []);
cset('payrollSettings', { pastPayCutoff: '2026-01-01', pastPayAutoStub: false, companyName: 'Test Co LLC' });

const A = await computer('A', { build }); const p = A.page();
// production: the paystubs server function can take ~20 s to answer
await p.route('**/.netlify/functions/paystubs**', async r => { await sleep(20000); try { await r.fulfill({ status: 200, contentType: 'application/json', body: '{"stubs":[]}' }); } catch (e) {} });
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(ADMIN); await p.locator('#gc-auth-password').fill(ACCOUNTS[ADMIN].pw); await sleep(300);
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await waitFor(A, async () => !!(window.__GC_PAY && window._gcAutoPayroll && window.__GC_PAY.isAdmin()) && (await window.__GC_PAY.runs()).length >= 1 && (await window.__GC_PAY.profiles()).length >= 2, null, 120000, 400);
await sleep(9000);
// the automatic draft for this week (the salaried person), then Bree's line on it at $7.60
const seed = await A.ev(async () => { const P = window.__GC_PAY; await window._gcAutoPayroll(); const all = await P.runs(); const r = all.find(x => x.auto === true && x.status === 'draft'); if (!r) return null;
  r.lines.push({ empId: 'UB1', name: 'Bree Testhour', payType: 'hourly', hours: 0.5, otHours: 0, rate: 15.2, gross: 7.6, fed: 0, ss: 0.47, med: 0.11, addlMed: 0, state: 0, net: 7.02, status: 'pending', grossParts: [{ label: 'Regular hours', amount: 7.6 }] });
  await P.saveRuns(all); return { id: r.id, payDate: r.payDate, n: r.lines.length }; });
ok(seed && seed.n === 2, 'automatic draft for this week, with the hourly line at $7.60', seed);
const RID = seed && seed.id;
await A.ev(() => window._gcOpenPayrollTab('approvals')); await sleep(2500);
await A.ev(id => { const b = document.querySelector('[data-open="' + id + '"]'); if (b) b.click(); }, RID); await sleep(1500);

// ── Pay stub: time it ──
async function stubTime(id, idx){
  await A.ev(() => { const v = document.getElementById('gc-viewer'); if (v) v.remove(); });
  const t0 = Date.now();
  await A.ev(([id, idx]) => { const b = document.querySelector('[data-stub="' + id + '"][data-idx="' + idx + '"]'); if (b) b.click(); }, [id, idx]);
  const got = await waitFor(A, () => { const v = document.getElementById('gc-viewer'), f = v && v.querySelector('iframe'); return f && /PAY STUB/.test(f.srcdoc || '') ? (f.srcdoc.match(/Bree Testhour/) ? 'ok' : 'other') : null; }, null, 30000, 50);
  return { ms: Date.now() - t0, got };
}
const s1 = await stubTime(RID, 1); console.log('    Pay stub (draft run) opened in ' + s1.ms + ' ms');
ok(s1.got === 'ok' && s1.ms < 2000, 'Pay stub on a draft line opens in the in-app viewer within 2 s (server takes 20 s)', s1);
await A.ev(() => window._gcOpenPayrollTab('approvals')); await sleep(2000);
await A.ev(() => { const b = document.querySelector('[data-open="RHAND"]'); if (b) b.click(); }); await sleep(1200);
const s2 = await stubTime('RHAND', 0); console.log('    Pay stub (paid, entered by hand) opened in ' + s2.ms + ' ms');
ok(s2.got === 'ok' && s2.ms < 2000, 'Pay stub on a paid run entered by hand opens within 2 s', s2);
ok(await A.ev(() => !!document.querySelector('#gc-viewer [data-gv="dl"]') && !!document.querySelector('#gc-viewer [data-gv="share"]')), 'viewer has Download and Share');
await A.ev(() => { const v = document.getElementById('gc-viewer'); if (v) v.remove(); });
if (STUB_ONLY) { await shared.close(); console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }

// ── ✏️ Edit the hourly line ──
await A.ev(() => window._gcOpenPayrollTab('approvals')); await sleep(2000);
await A.ev(id => { const b = document.querySelector('[data-open="' + id + '"]'); if (b && !document.querySelector('[data-ledit="' + id + '"]')) b.click(); }, RID); await sleep(1200);
const eb = await A.ev(id => [...document.querySelectorAll('[data-ledit="' + id + '"]')].map(b => b.getAttribute('data-idx')), RID);
ok(eb.join() === '0,1', 'every line of the draft run has ✏️ Edit', eb);
await A.ev(id => document.querySelector('[data-ledit="' + id + '"][data-idx="1"]').click(), RID); await sleep(1500);
const box = await A.ev(() => { const o = document.getElementById('gc-draftedit-ov'); return o && { v: o.querySelector('[data-de="hrs"]').value, t: o.textContent }; });
ok(box && box.v === '0.5' && /\$15\.20\/hr/.test(box.t), 'hours editor opens with 0.5 h at $15.20/hr from the profile', box);
await p.locator('#gc-draftedit-ov [data-de="hrs"]').fill('45'); await sleep(300);
ok(/Overtime 5\.00 h/.test(await A.ev(() => document.getElementById('gc-draftedit-ov').textContent)), 'shows 5 h overtime past 40');
await A.ev(() => document.querySelector('#gc-draftedit-ov [data-de="save"]').click()); await sleep(2500);
const r1 = await A.ev(async id => { const P = window.__GC_PAY, all = await P.runs(), r = all.find(x => x.id === id), L = r.lines[1];
  const prof = (await P.profiles()).find(x => x.userId === 'UB1'), set = await P.settings();
  const want = await P.computeLine(prof, r.from, r.to, set, L.ytdBefore || P.ytdFor(all.filter(x => x !== r), 'UB1', r.payDate.slice(0, 4), r.payDate), 40 * 15.2 + 5 * 15.2 * 1.5);
  return { st: r.status, auto: r.auto, h: L.hours, ot: L.otHours, gross: L.gross, fed: L.fed, ss: L.ss, med: L.med, state: L.state, net: L.net, w: { gross: want.gross, fed: want.fed, ss: want.ss, med: want.med, state: want.state, net: want.net },
    tg: r.totals.gross, sum: Math.round((r.lines[0].gross + L.gross) * 100) / 100, hist: (r.history || []).map(x => x.note), ov: !!document.getElementById('gc-draftedit-ov') }; }, RID);
ok(r1.h === 40 && r1.ot === 5 && r1.gross === 722, 'line: 40 h + 5 OT, gross $722.00', r1);
ok(['gross', 'fed', 'ss', 'med', 'state', 'net'].every(k => r1[k] === r1.w[k]) && r1.ss === 44.76 && r1.med === 10.47, 'federal / SS / Medicare / state / net are the engine\'s for $722', r1);
ok(r1.tg === r1.sum, 'run totals recomputed', r1);
ok(r1.st === 'pending' && r1.auto === false, 'run is now Waiting on admin and not the auto draft', r1);
ok(r1.hist.some(n => /^hours changed by .+ for Bree Testhour from 0\.5 to 45/.test(n)), 'history: "hours changed by … from 0.5 to 45"', r1.hist);
const chip = await A.ev(() => document.getElementById('gc-payroll-mount') && document.getElementById('gc-payroll-mount').textContent.includes('Waiting on admin'));
ok(chip, 'card re-rendered: Waiting on admin');
// the automatic weekly draft runs again
const r2 = await A.ev(async ([id, pd]) => { await window._gcAutoPayroll(); const all = await window.__GC_PAY.runs(); const same = all.filter(x => x.payDate === pd && x.status !== 'voided');
  const r = all.find(x => x.id === id); return { n: same.length, st: r.status, gross: r.lines[1].gross }; }, [RID, seed.payDate]);
ok(r2.n === 1 && r2.st === 'pending' && r2.gross === 722, 'auto draft leaves the edited run alone and makes no second draft that week', r2);
const errs = (A.errs || []).filter(e => /PAGEERROR/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
