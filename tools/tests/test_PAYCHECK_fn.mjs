// test_PAYCHECK_fn.mjs [index.html] — patch PAYCHECK: the REAL payroll engine (window.__GC_PAY.computeLine and
// window._gcMSWithholding, lifted out of index.html and run in a vm) must reproduce the owner's ADP paystubs once
// each W-4 is entered as derived. Federal / SS / Medicare / net to the cent; MS to the whole dollar ADP uses.
// CONFIDENTIAL payroll figures: they live only in this file.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const file = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const pick = k => { const s = scripts.find(x => x.includes(k)); if (!s) throw new Error('no script with ' + k); return s; };
let COMM = 0;
const noop = () => 0;
const win = { addEventListener: noop, removeEventListener: noop, document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
  localStorage: { getItem: () => null, setItem: noop }, _crm: { users: [] }, console: { log: noop, warn: noop, error: noop, info: noop },
  _gcCommissionForPM: async () => ({ total: COMM, detail: [] }) };
const ctx = vm.createContext(Object.assign(win, { window: win, setTimeout: noop, setInterval: noop, clearInterval: noop, clearTimeout: noop, MutationObserver: function(){ this.observe = noop; } }));
ctx.self = ctx;
vm.runInContext(pick('__GC_PAYROLL2__'), ctx);
vm.runInContext(pick('__GC_MSTAX__'), ctx);
const P = ctx.__GC_PAY; if (!P || !P.computeLine) throw new Error('engine not loaded');
let pass = 0, fail = 0;
const eq = (got, want, m, tol = 0.005) => { if (Math.abs(got - want) <= tol) pass++; else { fail++; console.log('  FAIL ' + m + ' got ' + got + ' want ' + want); } };
const set = Object.assign({}, P.SET_DEFAULT, { taxYear: 2026 });
const ytd = { ssWages: 0, gross: 0, medWages: 0 };
const base = { period: 'weekly', state: 'MS', workState: 'MS', otherDeductions: [], otherIncome: 0, deductions: 0, extra: 0, multipleJobs: false, exemptFed: false };
// Derived from the 9/18 and 9/25 stubs: Married filing jointly, Step 2 not checked, Step 3 $2,700, MS 89-350 Married, exemption claimed $0.
const STEVEN = Object.assign({}, base, { name: 'Steven Biffle', filing: 'married', dependentsCredit: 2700, msFiling: 'married', msExemption: 0 });
const BRITT  = Object.assign({}, base, { name: 'Brittany Plunket', filing: 'married', dependentsCredit: 2700, msFiling: 'married', msExemption: 0 });
// What the 8/28 stub was figured on (Steven's W-4 before Step 3 was added, MS single / $0).
const STEVEN_AUG = Object.assign({}, STEVEN, { dependentsCredit: 0, msFiling: 'single' });
const line = async (pr, x, comm = 0) => { COMM = comm; return P.computeLine(pr, '2026-09-12', '2026-09-18', set, ytd, x && x.manual, x && x.extras); };
const stub = (L, s, nm) => { eq(L.gross, s.gross, nm + ' gross'); eq(L.fed, s.fed, nm + ' federal'); eq(L.ss, s.ss, nm + ' SS'); eq(L.med, s.med, nm + ' Medicare');
  eq(L.state, s.ms, nm + ' MS', 1.0); eq(L.state % 1, 0, nm + ' MS whole dollars'); eq(L.net, s.net, nm + ' net', 1.0); if (Math.abs(L.state - s.ms) < 0.005) eq(L.net, s.net, nm + ' net (cent)'); };
// 1. 9/18 salary-only check
stub(await line(STEVEN, { manual: 1346.15 }), { gross: 1346.15, fed: 25.77, ss: 83.46, med: 19.52, ms: 43, net: 1174.40 }, 'stub1');
// 2. 9/18 commission-only check: annualized on its own, default W-4 (Single, nothing else), as ADP did
const C2 = await line(Object.assign({}, STEVEN, { payType: 'commission' }), { extras: { commMethod: 'separate' } }, 3763.52);
stub(C2, { gross: 3763.52, fed: 686.59, ss: 233.34, med: 54.57, ms: 139, net: 2650.02 }, 'stub2');
// 1+2 as ONE Run Payroll line with "Separate commission check": each check matches its stub
const B = await line(Object.assign({}, STEVEN, { payType: 'salary_commission', annualSalary: 1346.15 * 52 }), { extras: { commMethod: 'separate' } }, 3763.52);
eq(B.fed, 712.36, 'run 9/18 total federal'); eq(B.state, 182, 'run 9/18 total MS'); eq(B.net, 3824.42, 'run 9/18 total net');
if (!B.checks || B.checks.length !== 2) { fail++; console.log('  FAIL no per-check breakdown'); } else {
  stub(B.checks[0], { gross: 1346.15, fed: 25.77, ss: 83.46, med: 19.52, ms: 43, net: 1174.40 }, 'run check 1');
  stub(B.checks[1], { gross: 3763.52, fed: 686.59, ss: 233.34, med: 54.57, ms: 139, net: 2650.02 }, 'run check 2'); }
// 3. 8/28 one check, salary + commission, aggregate (the default)
const S3 = await line(Object.assign({}, STEVEN_AUG, { payType: 'salary_commission', annualSalary: 1346.52 * 52 }), null, 2951.12);
stub(S3, { gross: 4297.64, fed: 605.87, ss: 266.45, med: 62.32, ms: 162, net: 3201.00 }, 'stub3');
// 4. 8/21 salary-only: only the net is known (1117.09); the default Single W-4 and no MS reproduce it
const S4 = await line(Object.assign({}, base, { name: 'Steven Biffle', filing: 'single', state: 'TN', workState: 'TN' }), { manual: 1346.52 });
eq(S4.ss, 83.48, 'stub4 SS'); eq(S4.med, 19.52, 'stub4 Medicare'); eq(S4.net, 1117.09, 'stub4 net');
// 5. Brittany 9/25 salary
stub(await line(BRITT, { manual: 1815.31 }), { gross: 1815.31, fed: 82.07, ss: 112.55, med: 26.32, ms: 61, net: 1533.37 }, 'stub5');
// Pub 15-T worksheet 1A sanity: Single, nothing else, $1,346.52 weekly = $126.43 (not 162.81); flat 22% option; 2019-or-earlier W-4 path
eq((await line(Object.assign({}, base, { filing: 'single' }), { manual: 1346.52 })).fed, 126.43, 'single std 1g');
eq((await line(Object.assign({}, STEVEN_AUG, { payType: 'salary_commission', annualSalary: 1346.52 * 52 }), { extras: { commMethod: 'flat22' } }, 2951.12)).fed, 77.74 + 649.25, 'flat 22%');
eq((await line(Object.assign({}, base, { filing: 'single', w4Form: '2019', allowances: 2, dependentsCredit: 999 }), { manual: 1000 })).fed, Math.round((1240 + 0.12 * (52000 - 8600 - 19900)) / 52 * 100) / 100, 'old W-4 2 allowances');
eq((await line(Object.assign({}, base, { filing: 'married', multipleJobs: true }), { manual: 1000 })).fed, Math.round((1240 + 0.12 * (52000 - 28500)) / 52 * 100) / 100, 'step 2 table, no 1g');
eq((await line(Object.assign({}, base, { filing: 'single', exemptFed: true }), { manual: 1000 })).fed, 0, 'exempt');
console.log((fail ? 'FAIL ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
