// test_CERTROLE_pay_fn.mjs [index.html] — patch CERTROLE in the REAL payroll engine (window.__GC_PAY lifted out of index.html into a vm,
// like test_PAYEM_fn): 📘 required-class and 🎯 growth-training hours at the class rate ($7.25/h, never below), counted toward the 40, and the
// overtime premium from the week's blended regular rate (FLSA 29 CFR 778.115). The weekly current-job CRM training (crmtrain) stays at the
// regular rate. Made-up people and figures only.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const file = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const pick = k => { const s = scripts.find(x => x.includes(k)); if (!s) throw new Error('no script with ' + k); return s; };
const noop = () => 0; const DB = {}; const LS = {};
const win = { addEventListener: noop, removeEventListener: noop,
  document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
  localStorage: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } },
  idbGet: async k => DB[k], idbSet: async (k, v) => { DB[k] = v; },
  _crm: { users: [] }, console: { log: noop, warn: noop, error: noop, info: noop } };
const ctx = vm.createContext(Object.assign(win, { window: win, setTimeout: noop, setInterval: noop, clearInterval: noop, clearTimeout: noop, MutationObserver: function(){ this.observe = noop; } }));
ctx.self = ctx;
vm.runInContext(pick('patch PAYWEEK: ONE company pay schedule'), ctx);
vm.runInContext(pick('__GC_PAYROLL2__'), ctx);
const P = ctx.__GC_PAY;
let pass = 0, fail = 0;
const eq = (got, want, m) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + '\n     got  ' + g + '\n     want ' + w); } };
const set = Object.assign({}, P.SET_DEFAULT, { taxYear: 2026 }), ytd = { ssWages: 0, gross: 0, medWages: 0 };
const SAM = { name: 'Sam Demo', email: 'sam@example.test', payType: 'hourly', hourlyRate: 18, otAfter: 40, otMultiplier: 1.5, period: 'weekly', filing: 'single', state: 'TN', workState: 'TN', otherDeductions: [] };
const row = (date, i, o, x) => Object.assign({ id: 'T' + date + i + (x && x.code || ''), user: 'Sam Demo', date, clockIn: i, clockOut: o }, x || {});
const line = async () => P.computeLine(SAM, '2026-11-05', '2026-11-11', set, ytd, null, null);
const parts = L => L.grossParts.map(g => g.label + ' ' + g.amount + (g.hours != null ? ' (' + g.hours + 'h)' : ''));
const WD = ['2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'];
// 1. 36 work hours at $18 + an 8-hour required class at $7.25 = 44 h → 4 h over 40, premium from the blended rate
DB.timesheets = WD.map(d => row(d, '07:00', '16:00')).concat([row('2026-11-11', '08:00', '16:00', { code: 'reqclass' })]);
let L = await line();
const straight = 36 * 18 + 8 * 7.25, rr = straight / 44, prem = Math.round(4 * rr * 0.5 * 100) / 100, want = Math.round((straight + prem) * 100) / 100;
eq([L.gross, L.hours, L.otHours, P.hoursText(L)], [want, 40, 4, '40.00 + 4.00 OT'], '36 h × $18 + 8 class h × $7.25 = $' + straight + ' straight time; 44 h → 4 h × ½ × blended $' + rr.toFixed(4) + ' = $' + prem + ' → $' + want);
eq(parts(L), ['Regular hours 648 (36h)', '📘 Class — 8 h × $7.25 58 (8h)', 'Overtime ' + prem + ' (4h)'], 'the paycheck shows "📘 Class — 8 h × $7.25" as its own line, the overtime premium apart');
eq(L.trace.some(t => /blended regular rate/.test(t.detail)), true, 'the math trace explains the blended regular rate');
// 2. 🎯 growth training is paid at the class rate too (owner: "any training that is unpaid is at minimum wage"); under 40 → no premium
DB.timesheets = WD.slice(0, 3).map(d => row(d, '07:00', '16:00')).concat([row('2026-11-10', '18:00', '21:00', { code: 'training' })]);
L = await line();
eq([L.gross, L.hours, L.otHours], [27 * 18 + 3 * 7.25, 30, 0], '27 h × $18 + 3 h 🎯 growth training × $7.25 = $507.75, no overtime');
// 3. the weekly CRM training for their own job (crmtrain) stays at the regular rate — no class line
DB.timesheets = WD.map(d => row(d, '07:00', '16:00')).concat([row('2026-11-11', '08:00', '12:00', { code: 'crmtrain' })]);
L = await line();
eq([L.gross, parts(L).some(x => /Class/.test(x))], [40 * 18, false], '36 h + 4 h 📘 current-job CRM training = 40 h × $18 = $720 (regular rate)');
// 4. the class rate setting: higher is used, never below $7.25
ctx._gcCertPlan = { classRate: () => 9 };
DB.timesheets = WD.slice(0, 1).map(d => row(d, '07:00', '16:00')).concat([row('2026-11-06', '08:00', '12:00', { code: 'reqclass' })]);
L = await line();
eq(L.gross, 9 * 18 + 4 * 9, 'a class rate of $9 set by the admin: 4 class h × $9');
ctx._gcCertPlan = { classRate: () => 5 };
L = await line();
eq(L.gross, 9 * 18 + 4 * 7.25, 'a rate under the minimum is paid at $7.25');
// 5. no class hours → the engine is exactly as before
delete ctx._gcCertPlan;
DB.timesheets = WD.map(d => row(d, '07:00', '17:00')).concat([row('2026-11-11', '08:00', '12:00')]);
L = await line();
eq([L.gross, parts(L)], [40 * 18 + 4 * 27, ['Regular hours 720 (40h)', 'Overtime 108 (4h)']], 'no class hours: 40 × $18 + 4 × $27 OT (unchanged)');
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
