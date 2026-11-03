// test_W4UPLOAD_fn.mjs [index.html] — patch W4UPLOAD: the REAL W-4 / MS 89-350 reader (window.__GC_W4UPLOAD__, lifted out
// of index.html and run in a vm) maps a fillable 2026 W-4's AcroForm values, flat-PDF text and a photo (AI) answer onto
// the payroll editor's data-p fields. SSN: last 4 only. MADE-UP people only. If pdfjs-dist 3.11.174 is findable
// (PDFJS=<path to legacy/build/pdf.js>), it also reads tools/tests/fixtures/w4_2026_test_fillable.pdf end to end.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, '..', '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('patch W4UPLOAD: read'));
if (!src) throw new Error('no W4UPLOAD script');
const win = {}; const ctx = vm.createContext(Object.assign(win, { window: win, console })); vm.runInContext(src, ctx);
const R4 = ctx.__GC_W4UPLOAD__;
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } };
const P = 'topmostSubform[0].Page1[0].';
const F = (o) => Object.entries(o).map(([n, v]) => ({ name: P + n, value: v, alt: '' }));
const W4TEXT = 'Form W-4 20 26 Employee’s Withholding Certificate';

// 1. fillable W-4 (IRS 2026 field names)
let r = R4.fromFields(F({ 'Step1a[0].f1_01[0]': 'Avery Q', 'Step1a[0].f1_02[0]': 'Testworth', 'Step1a[0].f1_03[0]': '100 Test Way', 'Step1a[0].f1_04[0]': 'Memphis, TN 38103',
  'f1_05[0]': '000-12-3456', 'c1_1[0]': 'Off', 'c1_1[1]': '2', 'c1_1[2]': 'Off', 'c1_2[0]': '1', 'Step3_ReadOrder[0].f1_06[0]': '4,400', 'Step3_ReadOrder[0].f1_07[0]': '500',
  'f1_08[0]': '4,900', 'f1_09[0]': '1,200', 'f1_10[0]': '3,000.50', 'f1_11[0]': '25', 'c1_3[0]': 'Off' }), W4TEXT);
const v = r.vals;
ok(r.form === 'w4' && r.year === '2026', 'W-4 2026 recognised', [r.form, r.year]);
ok(v.filing === 'married' && /Married filing jointly/.test(r.found.filing), '1(c) Married filing jointly', r.found.filing);
ok(v.multipleJobs === 'yes', 'Step 2(c) checked');
ok(v.dependentsCredit === 4900 && v.otherIncome === 1200 && v.deductions === 3000.5 && v.extra === 25, 'Step 3 total / 4(a) / 4(b) / 4(c)', v);
ok(v.ssn4 === '3456' && !JSON.stringify(r).includes('000-12') && !JSON.stringify(r).includes('123456'), 'SSN: last 4 only, full number nowhere in the result');
ok(r.info.name === 'Avery Q Testworth' && /100 Test Way, Memphis/.test(r.info.address), 'name + address read', r.info);
ok(v.w4Form === '' && !('exemptFed' in v) && !('msFiling' in v), '2020+ form; exempt not checked → not set; no MS keys');
// single / HoH, Step 3 from the two lines when the total is blank, blanks left blank
r = R4.fromFields(F({ 'c1_1[0]': 'Off', 'c1_1[1]': 'Off', 'c1_1[2]': '3', 'c1_2[0]': 'Off', 'Step3_ReadOrder[0].f1_06[0]': '2200', 'f1_08[0]': '', 'f1_09[0]': '', 'c1_3[0]': 'Yes' }), W4TEXT);
ok(r.vals.filing === 'hoh' && r.vals.multipleJobs === 'no' && r.vals.dependentsCredit === 2200 && !('otherIncome' in r.vals) && r.vals.exemptFed === 'yes', 'HoH, 2(c) off, Step 3 from line, 4(a) blank left blank, exempt', r.vals);

// 2. flat PDF text
r = R4.fromText('Form W-4 2026 Step 1 (a) First name Avery Testworth (b) Social security number 000-12-3456 (c) ☐ Single or Married filing separately ☒ Married filing jointly ☐ Head of household '
  + 'Step 2 (c) Check here ... ✔ Step 3 ... Add the amounts above for qualifying children and other dependents. Enter the total here . . . 3 $ 4,400 '
  + 'Step 4 (a) Other income 4(a) $ 1,200 (b) Deductions 4(b) $ 3,000 (c) Extra withholding 4(c) $ 40.00');
ok(r.form === 'w4' && r.vals.filing === 'married' && r.vals.dependentsCredit === 4400 && r.vals.otherIncome === 1200 && r.vals.deductions === 3000 && r.vals.extra === 40 && r.vals.ssn4 === '3456', 'flat W-4 text', r.vals);
r = R4.fromText('Form W-4 2026 ☐ Single or Married filing separately ☐ Married filing jointly ☐ Head of household');
ok(!Object.keys(r.vals).length, 'an empty flat form fills nothing', r.vals);
// MS 89-350 flat text
r = R4.fromText('Mississippi Employee’s Withholding Exemption Certificate Form 89-350 SSN 000-12-9876 ☐ 1 Single ☒ 2(a) Married - spouse NOT employed $12,000 ☐ 3 Head of family '
  + '4 Dependents 2 x $1,500 = $3,000 6 Total Exemption Claimed . . . $ 15,000');
ok(r.form === 'ms89350' && r.vals.msFiling === 'married' && r.vals.msExemption === 15000 && r.vals.stateDependents === 2 && r.vals.ssn4 === '9876' && !('filing' in r.vals), 'MS 89-350 text: filing, exemption, dependents', r.vals);
// MS fillable (field labels)
r = R4.fromFields([{ name: 'cb_head', value: 'Yes', alt: 'Head of family' }, { name: 'deps', value: '3', alt: 'Number of dependents' }, { name: 'tot', value: '14,000', alt: 'Total exemption claimed' }], 'Form 89-350');
ok(r.form === 'ms89350' && r.vals.msFiling === 'head' && r.vals.stateDependents === 3 && r.vals.msExemption === 14000, 'MS 89-350 fillable', r.vals);

// 3. photo → AI JSON answer
r = R4.fromAI({ form: 'w4', year: '2026', filing: 'single', step2c: false, step3: '2,200', step4a: null, step4b: null, step4c: 10, exempt: false, ssnLast4: '000-12-4321', name: 'Blake Sampleton' });
ok(r.vals.filing === 'single' && r.vals.dependentsCredit === 2200 && r.vals.extra === 10 && r.vals.ssn4 === '4321' && !('otherIncome' in r.vals), 'photo answer mapped; SSN trimmed to last 4', r.vals);

// 4. the fixture PDF through real pdf.js (optional)
const PDFJS = process.env.PDFJS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/pdfjs-dist/legacy/build/pdf.js';
if (fs.existsSync(PDFJS)) {
  const lib = (await import(PDFJS)).default;
  const doc = await lib.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(here, 'fixtures', 'w4_2026_test_fillable.pdf'))), verbosity: 0 }).promise;
  const pg = await doc.getPage(1); const fields = (await pg.getAnnotations()).filter(a => a.fieldName).map(a => ({ name: a.fieldName, value: a.fieldValue, alt: a.alternativeText || '' }));
  const txt = (await pg.getTextContent()).items.map(x => x.str).join(' ');
  r = R4.fromFields(fields, txt);
  ok(r.vals.filing === 'married' && r.vals.multipleJobs === 'yes' && r.vals.dependentsCredit === 4900 && r.vals.deductions === 3000.5 && r.vals.ssn4 === '3456', 'fixture fillable PDF read by pdf.js', r.vals);
} else console.log('  (pdfjs-dist not found: fixture PDF read skipped)');
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
