// node tools/tests/test_F941_fn.mjs — the Form 941 worksheet's math (tools/f941_tail.js) on synthetic payroll:
// 3 W-2 employees paid biweekly (one goes over the $184,500 SS wage base AND the $200,000 Additional Medicare
// threshold in Q3 2026), a 1099 vendor, an owner draw with nothing withheld, a denied line and a pending run.
// Every expected number below was worked out by hand (decimal arithmetic), not by the code under test.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'f941_tail.js'), 'utf8').replace(/^<script>/, '').replace(/<\/script>\s*$/, '');
const window = {}; new Function('window', src)(window);
const F = window._gcF941;
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = typeof want === 'number' ? Math.abs(got - want) < 0.005 : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL', name, 'got', got, 'want', want); } };
const r2 = v => Math.round(v * 100 + (v >= 0 ? 1e-7 : -1e-7)) / 100;
const iso = d => d.toISOString().slice(0, 10);
const addD = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

// ---- synthetic payroll: biweekly Fridays from 2026-01-02; period = payDate-20 .. payDate-7 ----
const pays = []; for (let k = 0; k < 21; k++) pays.push(addD('2026-01-02', 14 * k));
const set = { ssRate: 0.062, ssWageBase: 184500, medRate: 0.0145, addlMedRate: 0.009, addlMedThreshold: 200000, futaRate: 0.006, futaWageBase: 7000, sutaRate: 0.027, sutaWageBase: 7000 };
const ytd = {};
function line(empId, name, gross, preTax, fed, payType) {
  const taxable = r2(gross - preTax), y = ytd[empId] || (ytd[empId] = { ss: 0, med: 0 });
  const ssW = Math.max(0, Math.min(taxable, 184500 - y.ss)), addW = Math.max(0, y.med + taxable - 200000) - Math.max(0, y.med - 200000);
  y.ss += ssW; y.med += taxable;
  return { empId, name, payType: payType || 'salary', gross, preTax, taxable, medWages: taxable, ssWages: ssW,
    ss: r2(ssW * 0.062), med: r2(taxable * 0.0145), addlMed: r2(addW * 0.009), fed, state: 0, futa: 0, suta: 0, status: 'approved',
    otherList: preTax ? [{ label: 'Health (section 125)', amount: preTax, pretax: true }] : [] };
}
const runs = pays.map((pd, k) => {
  const L = [line('A', 'Emp A', 11000, 0, 2000.00), line('B', 'Emp B', 2000.37, 100, 150.11)];
  if (pd >= '2026-07-17') L.push(line('C', 'Emp C', 1234.56, 0, 98.76, 'hourly'));
  if (pd === '2026-09-25') L.push({ empId: 'V', name: 'Marketing vendor', payType: 'contractor_1099', gross: 1500, taxable: 1500, fed: 0, ss: 0, med: 0, status: 'approved' });
  if (pd === '2026-08-14') L.push({ empId: 'O', name: 'Owner', payType: 'owner_draw', gross: 5000, taxable: 5000, fed: 0, ss: 0, med: 0, status: 'approved' });
  if (pd === '2026-08-28') L.push({ empId: 'X', name: 'Held', payType: 'hourly', gross: 900, taxable: 900, fed: 50, ss: 55.8, med: 13.05, status: 'denied' });
  return { id: 'PR' + k, from: addD(pd, -20), to: addD(pd, -7), payDate: pd, status: k % 2 ? 'paid' : 'approved', lines: L };
});
runs.push({ id: 'PRpend', from: '2026-09-12', to: '2026-09-25', payDate: '2026-09-30', status: 'pending', lines: [line('Z', 'Pending', 99999, 0, 1)] });
const payments = [
  { id: 'D0', kind: '941', date: '2026-07-15', amount: 5000 },        // for June (Q2) — must not count
  { id: 'D1', kind: '941', date: '2026-08-14', amount: 12946.90 },
  { id: 'D2', kind: '941', date: '2026-09-15', amount: 7149.03 },
  { id: 'D3', kind: '941', date: '2026-10-15', amount: 6275.01 },
  { id: 'F1', kind: 'futa', date: '2026-10-15', amount: 1 },
  { id: 'S1', kind: 'suta', date: '2026-10-15', amount: 189 }
];

// ---- quarter helpers ----
eq('last ended quarter on 2026-11-02', F.lastEndedQuarter('2026-11-02'), { year: 2026, q: 3 });
eq('last ended quarter on 2026-02-10', F.lastEndedQuarter('2026-02-10'), { year: 2025, q: 4 });
const qi = F.qInfo(2026, 3);
eq('Q3 range', [qi.from, qi.to, qi.day12], ['2026-07-01', '2026-09-30', '2026-09-12']);
eq('Q3 941 due (Oct 31 2026 is a Saturday)', qi.dueDate, '2026-11-02');
eq('Q1 12th', F.qInfo(2026, 1).day12, '2026-03-12'); eq('Q4 12th', F.qInfo(2026, 4).day12, '2026-12-12');

const R = F.compute({ runs, payments, settings: set, year: 2026, q: 3 });
const L = R.lines;
eq('L1 (Sept 12 pay period: A, B, C; vendor not counted)', L.L1, 3);
eq('runs used = 7 Q3 pay dates', R.runs.map(r => r.payDate), ['2026-07-03', '2026-07-17', '2026-07-31', '2026-08-14', '2026-08-28', '2026-09-11', '2026-09-25']);
eq('L2 wages (gross − pre-tax, W-2 only)', L.L2, 97709.95);
eq('L3 federal withheld', L.L3, 15643.33);
eq('L4 not checked', L.L4, false);
eq('L5a col1 (A capped at $184,500)', L.L5a1, 62209.95);
eq('L5a col2', L.L5a2, 7714.03);
eq('L5b', [L.L5b1, L.L5b2], [0, 0]);
eq('L5c col1', L.L5c1, 97709.95); eq('L5c col2', L.L5c2, 2833.59);
eq('L5d col1 (A over $200,000)', L.L5d1, 20000); eq('L5d col2', L.L5d2, 180.00);
eq('L5e', L.L5e, 10727.62); eq('L5f', L.L5f, 0);
eq('L6', L.L6, 26370.95);
eq('L7 fractions of cents', L.L7, -0.01);
eq('employee FICA actually withheld', R.eeActual, 5453.80);
eq('L8 L9 L11', [L.L8, L.L9, L.L11], [0, 0, 0]);
eq('L10', L.L10, 26370.94); eq('L12', L.L12, 26370.94);
eq('L13 (Aug 14 + Sep 15 + Oct 15; not Jul 15)', L.L13, 26370.94);
eq('L14', L.L14, 0); eq('L15', L.L15, 0);
eq('Part 2 not under $2,500', R.part2.under2500, false);
eq('month 1 (July)', R.part2.months[0], 12946.90);
eq('month 2 (August)', R.part2.months[1], 7149.03);
eq('month 3 (Sept, takes the −0.02 rounding)', R.part2.months[2], 6275.01);
eq('raw month 3', R.part2.monthsRaw[2], 6275.03);
eq('months total = L12', R.part2.total, L.L12);
eq('semiweekly note (26,370.94 × 4 > 50k)', R.part2.semi.length, 1);
eq('excluded: vendor + owner draw', R.excluded.map(x => x.kind).sort(), ['1099', 'draw']);
eq('FUTA quarter wages (only C, first $7,000)', R.futa.quarterWages, 7000);
eq('FUTA quarter tax', R.futa.quarterTax, 42.00);
eq('FUTA ytd tax (3 × $7,000 × 0.6%)', R.futa.ytdTax, 126.00);
eq('FUTA undeposited (126 − 1)', R.futa.undeposited, 125.00);
eq('FUTA deposit not required (≤ $500)', R.futa.depositDue, false);
eq('SUTA TN', [R.suta.length, R.suta[0].state, R.suta[0].wages, R.suta[0].taxable, R.suta[0].excess, R.suta[0].tax], [1, 'TN', 97709.95, 7000, 90709.95, 189.00]);
const W = R.warnings.join('\n');
eq('pending run warned', /2026-09-30 is “pending”/.test(W), true);
eq('no L13≠L12 warning', /does not equal line 12/.test(W), false);
eq('no missing-month warning', /No approved payroll was paid/.test(W), false);
eq('no L7 warning', /more than fractions of cents/.test(W), false);
eq('warning count (only the pending run)', R.warnings.length, 1);

// ---- deposits short + a manual tick ----
const R2 = F.compute({ runs, payments: payments.filter(p => p.id !== 'D3'), settings: set, year: 2026, q: 3 });
eq('short: L13', R2.lines.L13, 20095.93); eq('short: L14', R2.lines.L14, 6275.01);
eq('short: red warning', R2.warnings.some(w => /does not equal line 12/.test(w)), true);
const R3 = F.compute({ runs, payments, settings: set, year: 2026, q: 3, depositSel: { D0: true } });
eq('ticked Jul 15: L15 overpayment', R3.lines.L15, 5000);
eq('explicit quarter tag wins', F.compute({ runs, payments: [{ id: 'T', kind: '941', date: '2026-07-10', amount: 100, forQuarter: '2026-Q3' }], settings: set, year: 2026, q: 3 }).lines.L13, 100);
eq('tax-calendar taxKey 941dep|2026-10-15 → Sept liability (Q3) even if paid late', F.compute({ runs, payments: [{ id: 'K', kind: '941', date: '2026-10-20', amount: 7, taxKey: '941dep|2026-10-15' }, { id: 'K2', kind: '941', date: '2026-07-14', amount: 9, taxKey: '941dep|2026-07-15' }], settings: set, year: 2026, q: 3 }).lines.L13, 7);
eq('taxKey 941q|2026-10-31 → Q3', F.compute({ runs, payments: [{ id: 'K3', kind: '941', date: '2026-11-02', amount: 5, taxKey: '941q|2026-10-31' }], settings: set, year: 2026, q: 3 }).lines.L13, 5);
const R4 = F.compute({ runs, payments: [], settings: set, year: 2026, q: 3 });
eq('no deposits: warned', R4.warnings.some(w => /No Form 941 deposits are recorded/.test(w)), true);

// ---- a month with no runs, missing withholding, wrong FICA ----
const noAug = runs.filter(r => !/^2026-08/.test(r.payDate));
eq('no August runs: warned', F.compute({ runs: noAug, payments, settings: set, year: 2026, q: 3 }).warnings.some(w => /No approved payroll was paid in August 2026/.test(w)), true);
const broken = JSON.parse(JSON.stringify(runs)); const bl = broken.find(r => r.payDate === '2026-07-17').lines[1]; delete bl.fed; bl.ss = 0; bl.med = 0;
const R5 = F.compute({ runs: broken, payments, settings: set, year: 2026, q: 3 });
eq('missing withholding: warned', R5.warnings.some(w => /Withholding is MISSING/.test(w)), true);
eq('missing FICA: L7 warned', R5.warnings.some(w => /more than fractions of cents/.test(w)), true);
const noSep12 = runs.filter(r => r.payDate !== '2026-09-25');
const R6 = F.compute({ runs: noSep12, payments, settings: set, year: 2026, q: 3 });
eq('no Sept-12 period: L1 = 0 + warning', [R6.lines.L1, R6.warnings.some(w => /includes 2026-09-12/.test(w))], [0, true]);

// ---- small quarter (< $2,500) ----
const tiny = [{ id: 't', from: '2026-03-01', to: '2026-03-14', payDate: '2026-03-20', status: 'approved', lines: [line('T', 'T', 1000, 0, 50)] }];
const R7 = F.compute({ runs: tiny, payments: [], settings: set, year: 2026, q: 1 });
eq('tiny: L1 (Mar 12)', R7.lines.L1, 1); eq('tiny: L12', R7.lines.L12, r2(50 + 124 + 29)); eq('tiny: under 2,500', R7.part2.under2500, true);

// ---- copy text / CSV ----
const txt = F.copyText(R), csv = F.csv(R);
eq('copy text has L12', txt.includes('Line 12 — ' + F.LINES.L12 + ': 26370.94'), true);
eq('CSV header + month rows', [csv.split('\r\n')[0], /"16 total"/.test(csv)], ['"Line","Form wording","Value","Note"', true]);
// ---- payroll register ----
const G = R.register;
eq('register: 7 + 7 + 6 checks = 20 rows', G.rows.length, 20);
eq('register: first row', [G.rows[0].payDate, G.rows[0].name, G.rows[0].wages, G.rows[0].ss], ['2026-07-03', 'Emp A', 11000, 682]);
eq('register: grand total wages = L2, fed = L3', [G.total.wages, G.total.fed, G.check.wagesEqL2, G.check.fedEqL3], [97709.95, 15643.33, true, true]);
eq('register: SS + Medicare withheld = EE actual; difference to the form = L7', [r2(G.total.ss + G.total.med), r2(G.check.ssDiff + G.check.medDiff)], [5453.80, -0.01]);
eq('register: Emp B quarter (7 × 2,000.37 gross, 7 × 100 pre-tax)', (({ gross, preTax, wages, checks }) => [gross, preTax, wages, checks])(G.emps.find(e => e.name === 'Emp B')), [14002.59, 700, 13302.59, 7]);
eq('register: paid how', G.rows[0].paid, 'not recorded');
eq('CSV carries the register + its grand total', [/PAYROLL REGISTER/.test(F.csv(R)), /"GRAND TOTAL","20 checks"/.test(F.csv(R))], [true, true]);
// ---- the filled PDF: field map (IRS 2026 fillable form field names) ----
eq('splitAmt', [F.splitAmt(97709.95), F.splitAmt(-0.01), F.splitAmt(7000)], [['97,709', '95'], ['-0', '01'], ['7,000', '00']]);
eq('parseAddr', F.parseAddr('100 Test Way, Suite 2, Memphis, TN 38103'), { street: '100 Test Way, Suite 2', city: 'Memphis', state: 'TN', zip: '38103' });
const PF = F.pdfFields(R, { name: 'Test Co LLC', ein: '12-3456789', addr: '100 Test Way, Memphis, TN 38103' }), T1 = 'topmostSubform[0].Page1[0].', T2 = 'topmostSubform[0].Page2[0].';
eq('pdf: EIN + name + quarter 3 box', [PF.text[T1 + 'Header[0].EntityArea[0].f1_1[0]'], PF.text[T1 + 'Header[0].EntityArea[0].f1_2[0]'], PF.text[T1 + 'Header[0].EntityArea[0].f1_3[0]'], PF.check.includes(T1 + 'Header[0].ReportForQuarter[0].c1_1[2]')], ['12', '3456789', 'Test Co LLC', true]);
eq('pdf: line 1, 2, 12, 13', [PF.text[T1 + 'f1_12[0]'], PF.text[T1 + 'f1_13[0]'], PF.text[T1 + 'f1_14[0]'], PF.text[T1 + 'f1_49[0]'], PF.text[T1 + 'f1_50[0]'], PF.text[T1 + 'f1_51[0]']], ['3', '97,709', '95', '26,370', '94', '26,370']);
eq('pdf: line 7 −0.01', [PF.text[T1 + 'f1_39[0]'], PF.text[T1 + 'f1_40[0]']], ['-0', '01']);
eq('pdf: line 14 zero left blank', PF.text[T1 + 'f1_53[0]'], undefined);
eq('pdf: Part 2 monthly box + month 3 + total', [PF.check.includes(T2 + 'c2_1[1]'), PF.text[T2 + 'f2_5[0]'], PF.text[T2 + 'f2_6[0]'], PF.text[T2 + 'f2_7[0]'], PF.text[T2 + 'f2_8[0]']], [true, '6,275', '01', '26,370', '94']);
eq('pdf: no signature / date / PIN / designee fields filled', Object.keys(PF.text).some(k => /f2_(9|1[0-9]|2[0-4])\[0\]$/.test(k)), false);
eq('pdf: tiny quarter → box 1', F.pdfFields(R7, {}).check.includes(T2 + 'c2_1[0]'), true);
if (process.env.PDFLIB_DIR) {   // optional: really fill forms/f941-2026.pdf with pdf-lib
  const { createRequire } = await import('node:module'); const PDFLib = createRequire(process.env.PDFLIB_DIR + '/x.js')('pdf-lib');
  const out = await F.fillPdf(PDFLib, fs.readFileSync(path.join(here, '..', '..', 'forms', 'f941-2026.pdf')), PF);
  const doc = await PDFLib.PDFDocument.load(out), form = doc.getForm();
  eq('pdf-lib: filled line 12 reads back', form.getTextField(T1 + 'f1_49[0]').getText(), '26,370');
  eq('pdf-lib: quarter box checked', form.getCheckBox(T1 + 'Header[0].ReportForQuarter[0].c1_1[2]').isChecked(), true);
}
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
