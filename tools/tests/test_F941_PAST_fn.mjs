// node tools/tests/test_F941_PAST_fn.mjs — patch PASTPAY: past payroll typed from paystubs (tools/pastpay_tail.js) →
// paid runs exactly as shown (no side-effect flags missing) → the Form 941 worksheet (tools/f941_tail.js).
// 13 weekly paydays of Q3 2026 (Fri 7/3 … 9/25) × 2 employees, commissions added into gross, federal from a fixed
// "W-4 calc" figure. Expected numbers worked out by hand (decimal), not by the code under test.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const load = f => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/^<script>/, '').replace(/<\/script>\s*$/, '');
const window = {}; new Function('window', load('f941_tail.js'))(window); new Function('window', load('pastpay_tail.js'))(window);
const F = window._gcF941, PP = window._gcPastPay;
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = typeof want === 'number' ? Math.abs(got - want) < 0.005 : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); } };
const set = { ssWageBase: 184500, addlMedThreshold: 200000, futaRate: 0.006, futaWageBase: 7000, sutaRate: 0.027, sutaWageBase: 7000 };

// the grid: "Make weekly rows" 7/3 → 9/25 for two employees
const rows = PP.fillRows('2026-07-03', '2026-09-25', [{ name: 'Avery Test', key: 'UA', payType: 'commission' }, { name: 'Blake Test', key: 'UB', payType: 'hourly' }]);
eq('13 weekly paydays × 2 = 26 rows', rows.length, 26);
eq('first / last payday, weekly period ending on payday', [rows[0].payDate, rows[0].from, rows[0].to, rows[25].payDate], ['2026-07-03', '2026-06-27', '2026-07-03', '2026-09-25']);
rows.forEach((r, i) => {
  if (r.name === 'Avery Test') { r.gross = '1234.56'; r.comm = (r.payDate === '2026-08-14' || r.payDate === '2026-09-11') ? '250' : ''; r.fedCalc = 95; r.hours = '40'; }
  else { r.gross = '812.34'; r.fedCalc = 41; r.hours = '32.5'; }
  r.checkNo = String(5001 + i);
});
PP.calc(rows, { set, ytdBase: () => ({}) });
eq('no row errors', rows.filter(r => r.out.err.length).length, 0);
const a1 = rows[0].out;
eq('row: SS 6.2%, Medicare 1.45%, net', [a1.gross, a1.ss, a1.med, a1.fed, a1.net, a1.erSS, a1.erMed], [1234.56, 76.54, 17.90, 95, 1045.12, 76.54, 17.90]);
const c1 = rows.find(r => r.payDate === '2026-08-14' && r.name === 'Avery Test').out;
eq('commission added into gross', [c1.gross, c1.ss, c1.med], [1484.56, 92.04, 21.53]);
eq('FUTA: first $7,000 per employee (Avery hits it on the 6th check)', [rows[0].out.futa, rows[10].out.futa], [7.41, 4.96]);
function r2x(v) { return Math.round(v * 100) / 100; }

const runs = PP.buildRuns(rows, { by: 'Owner', now: '2026-11-02T23:00:00Z', idSeed: 't' });
eq('13 paid runs, 2 checks each', [runs.length, runs.every(r => r.lines.length === 2)], [13, true]);
const R0 = runs[0], L0 = R0.lines[0];
eq('run flags: paid, paystub-entry, noBooks, checks written', [R0.status, R0.source, R0.noBooks, R0.checksWritten, R0.payDate, R0.payday, R0.date], ['paid', 'paystub-entry', true, true, '2026-07-03', '2026-07-03', '2026-07-03']);
eq('line: exactly as shown + paidOut + check # (no checks to write)', [L0.gross, L0.fed, L0.ss, L0.med, L0.net, L0.paidOut, L0.status, L0.checkNo, L0.empId], [1234.56, 95, 76.54, 17.90, 1045.12, true, 'paid', '5001', 'UA']);

const R = F.compute({ runs, payments: [], settings: set, year: 2026, q: 3 });
const L = R.lines;
eq('L1: both employees (week ending 9/18 includes Sept 12)', L.L1, 2);
eq('L2', L.L2, 27109.70); eq('L3', L.L3, 1768.00);
eq('L5a', [L.L5a1, L.L5a2], [27109.70, 3361.60]); eq('L5c', [L.L5c1, L.L5c2], [27109.70, 786.18]);
eq('L5e / L6', [L.L5e, L.L6], [4147.78, 5915.78]);
eq('L7 fractions of cents', L.L7, 0.04); eq('L12', L.L12, 5915.82);
eq('register: SS + Medicare withheld', [R.register.total.ss, R.register.total.med], [1680.83, 393.10]);
eq('months by pay date (5 / 4 / 4 paydays), total = L12', [R.part2.months[0], R.part2.months[1], R.part2.months[2], R.part2.total], [2245.89, 1834.96, 1834.97, 5915.82]);
eq('register: 26 checks, paid how = check #', [R.register.rows.length, R.register.rows[0].paid], [26, 'check #5001, paid 2026-07-03']);
eq('only the "no deposits recorded" + L13≠L12 warnings', R.warnings.length, 2);

// "none withheld" and stub amounts
const r2 = PP.fillRows('2026-07-03', '2026-07-03', [{ name: 'Avery Test', key: 'UA' }, { name: 'Blake Test', key: 'UB' }]);
r2[0].gross = '1000'; r2[0].fedMode = 'none'; r2[0].ficaMode = 'none';
r2[1].gross = '1000'; r2[1].fedCalc = 50; r2[1].ficaMode = 'stub'; r2[1].ss = '62.50'; r2[1].med = '14.50';
PP.calc(r2, { set, ytdBase: () => ({}) });
eq('none withheld: net = gross, orange notes', [r2[0].out.net, r2[0].out.note.length, /talk to your CPA/.test(r2[0].out.note[0])], [1000, 2, true]);
eq('stub SS 62.50 ≠ 62.00: yellow warning, the stub wins', [r2[1].out.ss, r2[1].out.warn.length, r2[1].out.net], [62.5, 1, 873]);
const Rn = F.compute({ runs: PP.buildRuns(r2, { idSeed: 'n' }), payments: [], settings: set, year: 2026, q: 3 });
eq('none withheld: line 5 still both halves on all wages', [Rn.lines.L5a1, Rn.lines.L5a2, Rn.lines.L5c2], [2000, 248, 58]);
eq('none withheld: line 7 is only the stub row’s 0.50 (not the missing $76.50)', Rn.lines.L7, 0.5);
eq('none withheld: L12 = 50 + 248 + 58 + 0.50', Rn.lines.L12, 356.5);
eq('none withheld: company owes the employee half ($76.50), warned', [Rn.erPaysEE, Rn.warnings.some(w => /NOT withheld/.test(w)), Rn.warnings.some(w => /No federal income tax was withheld/.test(w))], [76.5, true, true]);

// errors: no W-4 figure, no gross
const r3 = PP.fillRows('2026-07-10', '2026-07-10', [{ name: 'Nobody', key: 'N' }]); r3[0].gross = '500'; r3[0].fedCalc = null;
PP.calc(r3, { set, ytdBase: () => ({}) });
eq('no W-4 → error until "amount on the check stub"', r3[0].out.err.length, 1);
r3[0].fedMode = 'stub'; r3[0].fed = '20'; PP.calc(r3, { set, ytdBase: () => ({}) });
eq('stub federal → ok', [r3[0].out.err.length, r3[0].out.fed], [0, 20]);
eq('a row with an error is not saved', PP.buildRuns([{ payDate: '2026-07-10', name: 'X', gross: '', out: { err: ['gross missing'] } }]).length, 0);
// YTD from runs already saved: Social Security stops at the wage base
const r4 = PP.fillRows('2026-09-25', '2026-09-25', [{ name: 'Big', key: 'B' }]); r4[0].gross = '5000'; r4[0].fedCalc = 900;
PP.calc(r4, { set, ytdBase: () => ({ ss: 182500, med: 182500, futa: 182500, suta: 182500 }) });
eq('wage base: only $2,000 more is SS wages; FUTA/SUTA 0', [r4[0].out.ssWages, r4[0].out.ss, r4[0].out.futa, r4[0].out.suta], [2000, 124, 0, 0]);
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
