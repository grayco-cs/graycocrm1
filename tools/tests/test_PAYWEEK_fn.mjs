// test_PAYWEEK_fn.mjs [index.html] — patch PAYWEEK: one company pay schedule. The real period helpers and the
// payroll engine's timesheet hours are lifted out of index.html and run in a vm for several "today" dates, under
// the default (Thursday → Wednesday, paid that Friday), the Monday → Sunday option (paid the Friday after) and an
// old saved hours cut-off. Checks the period, the check date, the commission window and that hours are counted.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const file = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const pick = k => { const s = scripts.find(x => x.includes(k)); if (!s) throw new Error('no script with ' + k); return s; };
const noop = () => 0;
const LS = {}; const DB = {};
let TODAY = '2026-11-04';
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(TODAY + 'T15:00:00'); } static now() { return new RealDate(TODAY + 'T15:00:00').getTime(); } }
const win = { addEventListener: noop, removeEventListener: noop,
  document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), body: { appendChild: noop }, hidden: true },
  localStorage: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } },
  idbGet: async k => DB[k], idbSet: async (k, v) => { DB[k] = v; },
  _crm: { users: [], projects: [] }, console: { log: noop, warn: noop, error: noop, info: noop } };
const ctx = vm.createContext(Object.assign(win, { window: win, Date: FakeDate, setTimeout: noop, setInterval: noop, clearInterval: noop, clearTimeout: noop, MutationObserver: function(){ this.observe = noop; } }));
ctx.self = ctx;
vm.runInContext(pick('patch PAYWEEK: ONE company pay schedule'), ctx);
vm.runInContext(pick('__GC_PAYROLL2__'), ctx);
let pass = 0, fail = 0;
const eq = (got, want, m) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log('  FAIL ' + m + ' got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); } };
const per = c => [c.start, c.end, c.payday];

// 1. default = what payroll did: Thursday → Wednesday, paid that Friday
eq(ctx._gcPaySchedule().label, 'Work week Thursday–Wednesday, paid that Friday', 'default label');
for (const [today, want] of [
  ['2026-11-04', ['2026-10-29', '2026-11-04', '2026-11-06']],   // Wed
  ['2026-11-05', ['2026-10-29', '2026-11-04', '2026-11-06']],   // Thu (auto draft day)
  ['2026-11-06', ['2026-10-29', '2026-11-04', '2026-11-06']],   // Fri payday
  ['2026-11-07', ['2026-11-05', '2026-11-11', '2026-11-13']],   // Sat
  ['2026-12-31', ['2026-12-24', '2026-12-30', '2027-01-01']]]) { // year end
  TODAY = today; eq(per(ctx._gcCurrentPayPeriod()), want, 'default current ' + today); }
TODAY = '2026-11-04';
eq(per(ctx._gcPayPeriodFor('2026-10-30')), ['2026-10-22', '2026-10-28', '2026-10-30'], 'default week before');
eq(per(ctx._gcPayPeriodContaining('2026-10-29')), ['2026-10-29', '2026-11-04', '2026-11-06'], 'Thu hours go to the next Friday');

// 2. the Monday → Sunday option, paid the Friday after (owner's example: 10/26–11/1 paid 11/6)
ctx._gcPaySetSchedule({ weekStartDay: 1, payLagDays: 5 });
eq(ctx._gcPaySchedule().label, 'Work week Monday–Sunday, paid the Friday after', 'mon-sun label');
for (const [today, want] of [
  ['2026-11-02', ['2026-10-26', '2026-11-01', '2026-11-06']],   // Mon
  ['2026-11-04', ['2026-10-26', '2026-11-01', '2026-11-06']],   // Wed
  ['2026-11-06', ['2026-10-26', '2026-11-01', '2026-11-06']],   // Fri
  ['2026-11-07', ['2026-11-02', '2026-11-08', '2026-11-13']]]) { // Sat
  TODAY = today; eq(per(ctx._gcCurrentPayPeriod()), want, 'mon-sun current ' + today); }
TODAY = '2026-11-04';
eq(per(ctx._gcPayPeriodContaining('2026-11-01')), ['2026-10-26', '2026-11-01', '2026-11-06'], 'Sunday hours stay in their week');
eq(ctx._gcCommissionWindow('2026-10-26', '2026-11-01'), { from: '2026-10-31', to: '2026-11-06' }, 'commission window holds only the 11/6 Friday');
// timesheet hours: Mon–Sun inside, the Sunday before and Monday after outside; overtime week starts Monday
DB.timesheets = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']
  .map(date => ({ user: 'Al', date, clockIn: '08:00', clockOut: '16:00' }));
const H = await ctx._gcPayrollHours('Al', '2026-10-26', '2026-11-01', 40);
eq([H.total, H.reg, H.ot, H.weeks.length, H.weeks[0] && H.weeks[0].week], [56, 40, 16, 1, '2026-10-26'], 'Mon–Sun hours, one overtime week');

// 3. an old saved hours cut-off (Saturday) keeps the schedule it always gave
delete LS.gc_pay_schedule; LS.gc_pay_hours_cutoff = '6';
eq(per(ctx._gcCurrentPayPeriod()), ['2026-10-25', '2026-10-31', '2026-11-06'], 'legacy Saturday cut-off (as before: Sat paid the Friday after)');
eq(ctx._gcPayScheduleFrom({}).weekStartDay, 4, 'empty settings → Thursday start');

console.log((fail ? 'FAIL ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
