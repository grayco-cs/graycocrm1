// test_PAYEM_fn.mjs [index.html] — patch PAYEM: 🚨 emergency call-out (after hours) 1.5× on paychecks, overtime 1.5×, NEVER stacked —
// the REAL payroll engine (window.__GC_PAY: weekSplit / hoursFor / computeLine / rateAsOf) lifted out of index.html into a vm, and
// 🎖 CERTPLAN's ⏱ calculator (weekPay) agreeing with it on every week. Also: a 🎖 cert raise paid from its start date, the 🏆 PM
// year-end bonus as a supplemental earning. Made-up people and figures only.
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
/* 🎖 CERTPLAN's own weekPay, as written in index.html, run against the same window */
const wp = html.match(/function weekPay\(rate, total, emerg\)\{[\s\S]*?\n\}\n/);
if (!wp) throw new Error('weekPay not found');
const weekPay = vm.runInContext('(function(){ var W = window; function num(v){ var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\\-]/g, "")); return isFinite(n) ? n : 0; } ' + wp[0] + ' return weekPay; })()', ctx);
let pass = 0, fail = 0;
const eq = (got, want, m) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { fail++; console.log('  FAIL ' + m + '\n     got  ' + g + '\n     want ' + w); } };
const sp = (t, e) => { const x = P.weekSplit(t, e, 40); return [x.straight, x.em, x.ot]; };

// 1. the rule: [straight 1×, emergency 1.5×, overtime 1.5×]
eq(sp(45, 0), [40, 0, 5], 'overtime only: 45 h → 40 + 5 OT');
eq(sp(30, 10), [20, 10, 0], 'emergency only (under 40): 30 h with 10 emergency → 20 + 10 🚨');
eq(sp(50, 20), [20, 20, 10], 'both, overlapping: 50 h with 20 emergency → 20 + 20 🚨 + 10 OT (30 premium hours, never 2.25×)');
eq(sp(32, 0), [32, 0, 0], 'under 40, no emergency: all straight time');
eq(sp(40, 0), [40, 0, 0], 'exactly 40: no overtime');
eq(sp(40, 8), [32, 8, 0], 'exactly 40 with 8 emergency: 32 + 8 🚨, no overtime');
eq(sp(43, 5), [35, 5, 3], 'emergency hours push the week over 40: 38 regular + 5 emergency = 43 → 35 + 5 🚨 + 3 OT (emergency counts toward the 40)');
eq(sp(45, 45), [0, 45, 0], 'all emergency, 45 h: 45 h at 1.5× once — not 1.5× again for the 5 over 40');
eq(sp(30, 40), [0, 30, 0], 'emergency never more than the hours worked');
// 2. 🎖 CERTPLAN's calculator agrees with the paycheck on every week (0–60 h, 0–60 emergency, quarter hours)
let agree = 0, disagree = [];
for (let t = 0; t <= 60; t += 2.25) for (let e = 0; e <= 60; e += 3.5) { const a = weekPay(20, t, e), x = P.weekSplit(t, e, 40), pay = Math.round((x.straight * 20 + x.em * 30 + x.ot * 30) * 100) / 100;
  if (a.pay === pay && a.premium === x.premium && a.straight === x.straight) agree++; else disagree.push([t, e, a, x]); }
eq(disagree.slice(0, 3), [], 'CERTPLAN weekPay = payroll weekSplit (' + agree + ' weeks)');
eq(weekPay(20, 50, 20).pay, 1300, 'calculator example: 50 h with 20 emergency = $1,300');

// 3. the paycheck from clock-ins (Thursday → Wednesday week, 11/5 – 11/11/2026)
const set = Object.assign({}, P.SET_DEFAULT, { taxYear: 2026 }), ytd = { ssWages: 0, gross: 0, medWages: 0 };
const ZED = { name: 'Zedd Demo', email: 'zedd@example.test', payType: 'hourly', hourlyRate: 20, otAfter: 40, otMultiplier: 1.5, period: 'weekly', filing: 'single', state: 'TN', workState: 'TN', otherDeductions: [] };
const row = (date, i, o, x) => Object.assign({ id: 'T' + date + i, user: 'Zedd Demo', date, clockIn: i, clockOut: o }, x || {});
const line = async (prof, x) => P.computeLine(prof, '2026-11-05', '2026-11-11', set, ytd, null, x || null);
const parts = L => L.grossParts.map(g => g.label + ' ' + g.amount + (g.hours != null ? ' (' + g.hours + 'h)' : ''));
// 3a. 38 regular hours (Thu–Mon 7.6 h a day) + a 5-hour emergency call-out Saturday night → 43 h
DB.timesheets = ['2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11'].map(d => row(d, '08:00', '15:36')).concat([row('2026-11-07', '20:00', '01:00', { emergency: true })]);
let L = await line(ZED);
eq([L.hours, L.otHours, L.emHours, L.gross], [35, 8, 5, 940], '38 regular + 5 overnight emergency (20:00 → 01:00): 35 × $20 + 5 × $30 🚨 + 3 × $30 OT = $940');
eq(parts(L), ['Regular hours 700 (35h)', 'Emergency call-out 1.5× 150 (5h)', 'Overtime 90 (3h)'], 'its own "Emergency call-out 1.5×" earning line');
eq([L.emPay, P.hoursText(L)], [150, '35.00 + 3.00 OT + 5.00 🚨'], 'emPay and the hours text');
eq(L.trace.some(t => /Emergency call-out/.test(t.label) && /never stacked/.test(t.detail)), true, 'the math trace explains the emergency line');
// 3b. emergency only, under 40
DB.timesheets = [row('2026-11-05', '08:00', '16:00'), row('2026-11-06', '18:00', '22:00', { emergency: true })];
L = await line(ZED); eq([L.hours, L.emHours, L.otHours, L.gross], [8, 4, 4, 280], 'under 40: 8 h × $20 + 4 h 🚨 × $30 = $280');
// 3c. overtime only
DB.timesheets = ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09', '2026-11-10'].map(d => row(d, '07:00', '16:00'));
L = await line(ZED); eq([L.hours, L.emHours, L.otHours, L.gross, parts(L).length], [40, 0, 5, 950, 2], '45 h, no emergency: 40 × $20 + 5 × $30 = $950, no emergency line');
// 3d. both overlapping: 30 regular + 20 emergency = 50 h
DB.timesheets = ['2026-11-05', '2026-11-06', '2026-11-09'].map(d => row(d, '06:00', '16:00')).concat(['2026-11-07', '2026-11-08'].map(d => row(d, '08:00', '18:00', { emergency: true })));
L = await line(ZED); eq([L.hours, L.emHours, L.otHours, L.gross], [20, 20, 30, 1300], '30 regular + 20 emergency: 20 × $20 + 20 × $30 🚨 + 10 × $30 OT = $1,300 (never 2.25×)');
// 3e. exactly 40
DB.timesheets = ['2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11'].map(d => row(d, '08:00', '16:00'));
L = await line(ZED); eq([L.hours, L.otHours, L.gross], [40, 0, 800], 'exactly 40: $800, no overtime');
// 3f. the office sets the emergency hours in the run (Payroll → ✏️): 6 of the 40 → 34 + 6 🚨
L = await line(ZED, { emHours: 6 }); eq([L.hours, L.emHours, L.gross], [34, 6, 860], 'office figure in the run: 6 emergency hours → 34 × $20 + 6 × $30 = $860');
// 3g. the old reader still adds reg + ot = every hour
const H = await ctx._gcPayrollHours('Zedd Demo', '2026-11-05', '2026-11-11', 40);
eq([H.total, H.reg + H.ot, H.em], [40, 40, 0], 'hoursFor: reg + ot is still every hour worked');
// 3h. year-to-date hours count the emergency hours once
const runs = [{ status: 'approved', payDate: '2026-11-13', lines: [Object.assign({}, await line(ZED, { emHours: 6 }), { empId: 'Zedd Demo' })] }];
eq(P.ytdFor(runs, 'Zedd Demo', 2026).hours, 40, 'YTD hours: 40, not 46');

// 4. 🎖 cert raise: prof.hourlyRate is the NEW rate; the period before it starts is paid the old one, the period it starts in the new one
const RAISED = Object.assign({}, ZED, { hourlyRate: 20.5, rateHistory: [{ field: 'hourlyRate', from: 20, to: 20.5, change: 0.5, effective: '2026-11-12', at: '2026-11-12T15:00:00Z', by: 'Demo Owner', why: 'Certification raise — IICRC WRT', source: 'certplan' }] });
eq([P.rateAsOf(RAISED, 'hourlyRate', '2026-11-11'), P.rateAsOf(RAISED, 'hourlyRate', '2026-11-18'), P.rateAsOf(RAISED, 'hourlyRate', '2026-11-14')], [20, 20.5, 20.5], 'rate in effect: before 11/12 → $20, from 11/12 → $20.50 (a period that ends after the start is paid the new rate)');
L = await line(RAISED); eq([L.rate, L.gross], [20, 800], 'week 11/5–11/11 (before the raise): 40 × $20 = $800');
DB.timesheets = ['2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18'].map(d => row(d, '08:00', '16:00')).concat([row('2026-11-14', '21:00', '23:00', { emergency: true })]);
L = await P.computeLine(RAISED, '2026-11-12', '2026-11-18', set, ytd, null, null);
eq([L.rate, L.gross, parts(L)], [20.5, 902, ['Regular hours 779 (38h)', 'Emergency call-out 1.5× 61.5 (2h)', 'Overtime 61.5 (2h)']], 'week after (40 + 2 emergency): 38 × $20.50 + 2 × $30.75 🚨 + 2 × $30.75 OT = $902 — the raised rate, emergency 1.5× of it');
const SAL = { name: 'Pat Demo', payType: 'salary', annualSalary: 61000, period: 'weekly', filing: 'single', state: 'TN', otherDeductions: [], rateHistory: [{ field: 'annualSalary', from: 60000, to: 61000, effective: '2026-11-12' }] };
eq([(await P.computeLine(SAL, '2026-11-05', '2026-11-11', set, ytd, null, null)).gross, (await P.computeLine(SAL, '2026-11-12', '2026-11-18', set, ytd, null, null)).gross], [Math.round(60000 / 52 * 100) / 100, Math.round(61000 / 52 * 100) / 100], 'salaried: $60,000 → $61,000 from the raise week');

// 5. 🏆 PM year-end bonus: its own earning, taxable supplemental — federal at 22% on the bonus, the salary withheld as before
const PM = { name: 'Pat Demo', payType: 'salary', annualSalary: 52000, period: 'weekly', filing: 'single', state: 'TN', otherDeductions: [] };
const base = await P.computeLine(PM, '2026-11-05', '2026-11-11', set, ytd, null, null);
const B = await P.computeLine(PM, '2026-11-05', '2026-11-11', set, ytd, null, { pmBonus: 2500, pmBonusKey: 'pmbonus:2026:pat@example.test' });
eq([B.gross, B.pmBonus, B.pmBonusKey, B.grossParts.map(g => g.label)], [3500, 2500, 'pmbonus:2026:pat@example.test', ['Salary', 'Bonus — PM year-end']], 'bonus is its own earning: "Bonus — PM year-end"');
eq([B.fed, B.ss, B.med], [Math.round((base.fed + 550) * 100) / 100, Math.round(3500 * 0.062 * 100) / 100, Math.round(3500 * 0.0145 * 100) / 100], 'federal = salary withholding + 22% of $2,500; Social Security and Medicare on all of it');
eq(B.bonus, 0, 'not mixed into the regular "Bonus" field (PM pay check reads salary = gross − commission − bonus − PM bonus)');

console.log((fail ? 'FAIL ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
