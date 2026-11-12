// test_TIMEOFF_fn.mjs <dir with index.html> — patch TIMEOFF's data rules in node (no browser): the <script id="gc-patch-timeoff">
// module runs in a vm with a fake window (made-up people, an in-memory gc_kv). Checks isOff (approved / half day / pending / denied /
// cancelled / sick / weekly availability / ranges), who decides (admin, the company's office, the named manager — not the person, not the
// other company's office, not a tech), company scoping, the approval items, the sick call's notice list + "Cover …" To-Do, running late,
// validation, the store merge (newest wins), payroll rows (unpaid without a balance, paid from ptoDays), and that 'timesheets' is never written.
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const dir = process.argv[2] || '.';
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const m = /<script id="gc-patch-timeoff">([\s\S]*?)<\/script>/.exec(html);
let pass = 0, fail = 0; const ok = (c, msg, info) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ FAIL ' + msg + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
ok(!!m, 'the TIMEOFF module is in index.html'); if (!m) process.exit(1);
const pad = n => String(n).padStart(2, '0'), ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const T = ymd(new Date()), add = k => { const d = new Date(T + 'T12:00:00'); d.setDate(d.getDate() + k); return ymd(d); };

const kv = new Map(), ls = new Map(), writes = [];
const el = () => ({ style: {}, setAttribute() {}, getAttribute() { return null; }, appendChild() {}, remove() {}, classList: { toggle() {}, contains() { return false; } }, querySelector() { return null; }, querySelectorAll() { return []; } });
const D = { hidden: false, addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, createElement: el, body: el(), head: el(), documentElement: Object.assign(el(), { classList: { contains() { return false; } } }) };
const ME = { email: 'wjohnson@grayco-cs.com', admin: true };
const USERS = [
  { id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Sample PM', email: 'pm.demo@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u3', name: 'Office Desk', email: 'office.con@grayco-cs.com', role: 'Office Manager', active: true, companies: ['construction'] },
  { id: 'u4', name: 'Mit Office', email: 'office.mit@grayco-cs.com', role: 'Office Manager', active: true, companies: ['mitigation'] },
  { id: 'u5', name: 'Zedd Demo', email: 'zedd.demo@grayco-cs.com', role: 'Technician', active: true, manager: 'Crew Boss' },
  { id: 'u6', name: 'Crew Boss', email: 'boss.demo@grayco-cs.com', role: 'Superintendent', active: true },
  { id: 'u7', name: 'Other Tech', email: 'tech2.demo@grayco-cs.com', role: 'Technician', active: true },
  { id: 'u8', name: 'Mia Mit', email: 'mia.demo@grayco-cs.com', role: 'Mitigation', active: true, companies: ['mitigation'] },
  { id: 'u9', name: 'Paid Pat', email: 'pat.demo@grayco-cs.com', role: 'Technician', active: true, ptoDays: 1 }
];
const PROJECTS = [
  { id: 'P1', name: 'Demo Kitchen', pm: 'Sample PM', superintendent: 'Crew Boss', tech: 'Zedd Demo', status: 'Active' },
  { id: 'P2', name: 'Demo Roof', pm: 'Sample PM', status: 'Active' },
  { id: 'P3', name: 'Water Loss', pm: 'Sample PM', mitTech: 'Mia Mit', status: 'In Progress', companyId: 'mitigation' }
];
const SCHEDULE = [
  { id: 'S1', pid: 'P1', date: T, title: 'Drywall hang', assignee: 'Zedd Demo' },
  { id: 'S2', pid: 'P2', date: add(1), title: 'Tear-off', assignee: 'Zedd Demo' },
  { id: 'S3', pid: 'P2', date: add(1), title: 'Roof deliver', assignee: 'Other Tech' }
];
let FILTER = 'all';
const W = {
  document: D, console, Promise, JSON, Date, Math, Object, Array, String, Number, RegExp, isFinite, parseFloat, parseInt, Infinity,
  setTimeout: () => 0, setInterval: () => 0, __GC_NATIVE_SETTIMEOUT__: () => 0, __GC_REAL_SETINTERVAL__: () => 0,
  addEventListener() {}, dispatchEvent() {}, CustomEvent: function (n) { this.type = n; }, confirm: () => true,
  localStorage: { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
  _crm: { users: USERS, projects: PROJECTS, schedule: SCHEDULE },
  __GC_AUTH__: { email: () => ME.email, isAdmin: () => ME.admin },
  _gcIsOfficeFull: () => /office/i.test((USERS.find(u => u.email === ME.email) || {}).role || ''),
  _gcCo: { filter: () => FILTER, userCos: u => (u && Array.isArray(u.companies) && u.companies.length ? u.companies : (u && u.payType === 'owner' ? ['construction', 'mitigation', 'environmental'] : ['construction'])), canSwitch: () => true, myCos: () => ['construction', 'mitigation', 'environmental'] },
  _ehSb: k => Promise.resolve(kv.has(k) ? JSON.parse(JSON.stringify(kv.get(k))) : null),
  _supaUpsertNow: (k, v) => { writes.push(k); kv.set(k, typeof v === 'string' ? JSON.parse(v) : JSON.parse(JSON.stringify(v))); return Promise.resolve({}); }
};
W.window = W; W.localStorage = W.localStorage;
const ctx = vm.createContext(W); ctx.localStorage = W.localStorage;
vm.runInContext(m[1], ctx, { filename: 'gc-patch-timeoff.js' });
const TO = W._gcTimeOff;
ok(!!TO && typeof TO.isOff === 'function' && typeof TO.list === 'function', 'window._gcTimeOff = { isOff, list, … }');
const as = (email, admin) => { ME.email = email; ME.admin = !!admin; ls.delete('gc_timeoff_cache'); };
const reload = async () => { await TO.pull(); };

// ── a tech asks for time off ──
as('zedd.demo@grayco-cs.com');
let r = await TO.request({ kind: 'off', from: add(1), to: add(2), part: 'full', reason: 'Demo family trip' });
ok(r.ok && r.rec.status === 'pending' && r.rec.companyId === 'construction' && r.rec.days >= 1, 'time off request saved as pending, Construction (the person\'s company)', r.rec);
ok(JSON.stringify(r.rec.notify.sort()) === JSON.stringify(['boss.demo@grayco-cs.com', 'office.con@grayco-cs.com', 'wjohnson@grayco-cs.com']), 'goes to the manager (user.manager), the Construction office and the admins — not the Mitigation office', r.rec.notify);
ok(r.rec.jobs.some(j => j.title === 'Tear-off'), 'the request lists the jobs on the schedule those days (Tear-off tomorrow)', r.rec.jobs);
ok(kv.get('gc_timeoff') && kv.get('gc_timeoff').list.length === 1 && !writes.includes('timesheets'), 'stored in gc_kv gc_timeoff (read-merge-write); timesheets untouched', writes);
const offId = r.rec.id;
ok(TO.isOff('zedd.demo@grayco-cs.com', add(1)).off === false && TO.isOff('zedd.demo@grayco-cs.com', add(1)).pending === true, 'pending: isOff says off:false, pending:true');
ok(TO.canDecide(offId) === false, 'the person cannot approve their own request');
ok(TO.approvals().length === 0, 'no approval item for the person themselves');
// validation
ok(TO._t.validate({ kind: 'off', from: add(-1), to: add(-1) }) !== '', 'a past day is refused');
ok(TO._t.validate({ kind: 'off', from: add(3), to: add(2) }) !== '', 'last day before first day is refused');
ok(TO._t.validate({ kind: 'off', from: add(3), to: add(4), part: 'am' }) !== '', 'a half day must be one day');
ok(TO._t.validate({ kind: 'sick', from: add(2) }) !== '', 'a sick call is today or tomorrow only');
ok(TO._t.validate({ kind: 'late', minutes: 0 }) !== '' && TO._t.validate({ kind: 'late', minutes: 20 }) === '', 'running late needs minutes');

// ── who decides ──
as('tech2.demo@grayco-cs.com'); await reload();
ok(TO.canDecide(offId) === false && TO.approvals().length === 0, 'another tech cannot decide and sees no approval item');
as('office.mit@grayco-cs.com'); await reload();
ok(TO.canDecide(offId) === false && TO.approvals().length === 0, 'the Mitigation office does not decide Construction requests');
ok(TO.canSee(offId) === false, '…and does not see them');
as('boss.demo@grayco-cs.com'); await reload();
ok(TO.canDecide(offId) === true && TO.approvals().length === 1, 'the named manager decides (approval item shown)');
as('office.con@grayco-cs.com'); await reload();
ok(TO.canDecide(offId) === true, 'the Construction office decides');
FILTER = 'mitigation'; ok(TO.approvals().length === 0 && TO.coOk(offId) === false, 'company switcher on Mitigation: the Construction request is not listed'); FILTER = 'all';
as('wjohnson@grayco-cs.com', true); await reload();
const items = TO.approvals();
ok(items.length === 1 && /^to:/.test(items[0].id) && /Time off: Zedd Demo/.test(items[0].title) && items[0].act && typeof items[0].act.f === 'function', 'admin: one ✅ Approvals item (to:<id>, "🏖 Time off: Zedd Demo …", an action)', items[0]);
let d = await TO.decide(offId, true, 'Enjoy');
ok(d.ok && d.rec.status === 'approved' && d.rec.decidedBy === 'Demo Owner' && d.rec.decisionNote === 'Enjoy', 'admin approves with a note');
ok(TO.approvals().length === 0, 'decided: off the approval list');
const ot = JSON.parse(ls.get('gc_office_tasks') || '[]');
ok(ot.some(t => /Move Zedd Demo’s jobs off/.test(t.label) && t.assignees[0] === 'wjohnson@grayco-cs.com'), 'approving with jobs on those days gives the approver a To-Do to move them', ot.map(t => t.label));
let o = TO.isOff('zedd.demo@grayco-cs.com', add(1));
ok(o.off === true && o.kind === 'Off' && /trip/.test(o.note), 'approved: isOff(email, day) → off, kind Off, the reason', o);
ok(TO.isOff('ZEDD.DEMO@grayco-cs.com', add(2)).off === true, 'e-mail in any case; the last day counts');
ok(TO.isOff('zedd.demo@grayco-cs.com', add(3)).off === false, 'the day after is not off');
ok(TO.isOff('zedd.demo@grayco-cs.com', { from: add(2), to: add(9) }).off === true && TO.isOff('zedd.demo@grayco-cs.com', [add(4), add(9)]).off === false, 'ranges: any overlapping day');
ok(TO.isOff('zedd.demo@grayco-cs.com', add(1) + '..' + add(5)).off === true, '"a..b" range string');
// the person sees the answer
as('zedd.demo@grayco-cs.com'); await reload();
const mine = TO.list('zedd.demo@grayco-cs.com');
ok(mine.length === 1 && mine[0].status === 'approved', 'the person sees the decision in their list');
ok(TO._t.notices().some(n => /Time off approved/.test(n.hd) && /Enjoy/.test(n.sb)), 'the person gets the "✅ Time off approved … Enjoy" notice', TO._t.notices());

// ── half day, deny, cancel ──
r = await TO.request({ kind: 'off', from: add(5), to: add(5), part: 'am', reason: '' });
ok(r.ok && r.rec.days === 0.5, 'a half day counts 0.5 day');
const halfId = r.rec.id;
as('boss.demo@grayco-cs.com'); await reload();
d = await TO.decide(halfId, false, 'Need you that morning');
ok(d.ok && d.rec.status === 'denied', 'the manager denies with a note');
ok(TO.isOff('zedd.demo@grayco-cs.com', add(5)).off === false, 'denied: not off');
as('zedd.demo@grayco-cs.com'); await reload();
ok(TO._t.notices().some(n => /denied/.test(n.hd) && /Need you/.test(n.sb)), 'the person gets the denial with the note');
r = await TO.request({ kind: 'off', from: add(6), to: add(6), part: 'pm' });
const c = await TO.cancel(r.rec.id);
ok(c.ok && TO.isOff('zedd.demo@grayco-cs.com', add(6)).pending !== true, 'a cancelled request is neither off nor pending');

// ── sick call ──
const before = JSON.parse(ls.get('gc_office_tasks') || '[]').length;
r = await TO.request({ kind: 'sick', from: T, note: 'Demo fever' });
ok(r.ok && r.rec.status === 'noted', 'a sick call needs no approval');
ok(['boss.demo@grayco-cs.com', 'pm.demo@grayco-cs.com', 'office.con@grayco-cs.com', 'wjohnson@grayco-cs.com'].every(e => r.rec.notify.includes(e)) && !r.rec.notify.includes('office.mit@grayco-cs.com'), 'sick: manager, the job\'s PM + super, the Construction office and the admins are told', r.rec.notify);
const tasks = JSON.parse(ls.get('gc_office_tasks') || '[]'), cover = tasks.find(t => t.timeoffId === r.rec.id);
ok(tasks.length === before + 1 && cover && cover.kind === 'given' && cover.label === '🤒 Cover Zedd Demo’s jobs today: Demo Kitchen (Drywall hang)' && cover.assignees.includes('boss.demo@grayco-cs.com') && cover.assignees.includes('pm.demo@grayco-cs.com') && cover.prio === 'high' && cover.due === T && cover.companyId === 'construction',
  'a To-Do "🤒 Cover Zedd Demo’s jobs today: Demo Kitchen (Drywall hang)" for the manager and the PM (NUDGE "given" format)', cover);
o = TO.isOff('zedd.demo@grayco-cs.com', T);
ok(o.off && o.kind === 'Sick' && /fever/.test(o.note), 'sick today: isOff → Sick', o);
as('boss.demo@grayco-cs.com'); await reload();
ok(TO._t.notices().some(n => /Zedd Demo called in sick today/.test(n.hd) && /Demo Kitchen/.test(n.sb)), 'the manager gets the in-app notice "🤒 Zedd Demo called in sick today"', TO._t.notices());
as('office.mit@grayco-cs.com'); await reload();
ok(!TO._t.notices().some(n => /Zedd/.test(n.hd)), 'the other company\'s office gets no notice');

// ── running late ──
as('zedd.demo@grayco-cs.com'); await reload();
r = await TO.request({ kind: 'late', minutes: 25, note: 'Demo traffic' });
ok(r.ok && r.rec.minutes === 25 && r.rec.notify.includes('boss.demo@grayco-cs.com') && r.rec.notify.includes('pm.demo@grayco-cs.com') && !r.rec.notify.includes('wjohnson@grayco-cs.com'), 'running late goes to the PM / foreman (and manager), not every admin', r.rec.notify);
ok(TO.isOff('zedd.demo@grayco-cs.com', T).kind === 'Sick', 'running late is not "off"');
as('pm.demo@grayco-cs.com'); await reload();
ok(TO._t.notices().some(n => /running 25 min late/.test(n.hd)), 'the PM gets "⏰ Zedd Demo is running 25 min late"');

// ── availability ──
as('tech2.demo@grayco-cs.com'); await reload();
const sun = (() => { for (let k = 0; k < 7; k++) if (new Date(add(k) + 'T12:00:00').getDay() === 3) return add(k); })();
r = await TO.request({ kind: 'avail', days: [3], hours: 'after 3 PM Fridays' });
ok(r.ok && TO.isOff('tech2.demo@grayco-cs.com', sun).off === true && TO.isOff('tech2.demo@grayco-cs.com', sun).kind === 'Unavailable', 'availability: "never Wednesdays" → isOff on a Wednesday = Unavailable');
r = await TO.request({ kind: 'avail', days: [3, 4], hours: '' });
ok(TO.list('tech2.demo@grayco-cs.com').filter(x => x.kind === 'avail').length === 1, 'one availability record per person (updated in place)');

// ── company scoping: a Mitigation tech ──
as('mia.demo@grayco-cs.com'); await reload();
r = await TO.request({ kind: 'off', from: add(8), to: add(8) });
ok(r.ok && r.rec.companyId === 'mitigation' && r.rec.notify.includes('office.mit@grayco-cs.com') && !r.rec.notify.includes('office.con@grayco-cs.com'), 'a Mitigation tech\'s request belongs to Mitigation and goes to the Mitigation office', r.rec);
const miaId = r.rec.id;
as('office.mit@grayco-cs.com'); await reload();
ok(TO.canDecide(miaId) && TO.approvals().length === 1, 'the Mitigation office decides it');
as('office.con@grayco-cs.com'); await reload();
ok(!TO.canDecide(miaId) && !TO.approvals().some(x => x.id === 'to:' + miaId), 'the Construction office does not');
as('wjohnson@grayco-cs.com', true); await reload();
FILTER = 'construction'; ok(!TO.approvals().some(x => x.id === 'to:' + miaId), 'admin with Construction picked: not listed');
FILTER = 'mitigation'; ok(TO.approvals().some(x => x.id === 'to:' + miaId), 'admin with Mitigation picked: listed'); FILTER = 'all';

// ── payroll rows ──
const pr = TO.payroll(add(-1), add(30));
ok(pr.some(x => x.email === 'zedd.demo@grayco-cs.com' && x.kind === 'Sick' && x.date === T && x.hours === 8 && x.paid === false && /Unpaid/.test(x.pay)), 'payroll: the sick day is a row, 8 h, Unpaid (no paid leave on the record)', pr.slice(0, 3));
ok(pr.filter(x => x.recId === offId).length >= 1 && !pr.some(x => x.recId === halfId), 'approved time off is in payroll rows; denied is not');
as('pat.demo@grayco-cs.com'); await reload();
const k9 = [9, 10, 11].find(k => new Date(add(k) + 'T12:00:00').getDay() !== 0 && new Date(add(k + 1) + 'T12:00:00').getDay() !== 0);
await TO.request({ kind: 'off', from: add(k9), to: add(k9 + 1) });
as('wjohnson@grayco-cs.com', true); await reload();
const patId = TO.list('pat.demo@grayco-cs.com')[0].id; await TO.decide(patId, true, '');
const pp = TO.payroll(add(-1), add(30), 'pat.demo@grayco-cs.com').filter(x => new Date(x.date + 'T12:00:00').getDay() !== 0);
ok(pp.length === 2 && pp[0].paid === true && pp[1].paid === false, 'ptoDays: 1 on the record → the first day Paid, the next Unpaid (balance used up)', pp);
ok(!writes.includes('timesheets') && !writes.includes('payrollRuns'), 'nothing written to timesheets / payroll keys', [...new Set(writes)]);

// ── store merge: newest updatedAt wins, nothing dropped ──
const a = [{ id: 'x', status: 'pending', updatedAt: '2026-01-01T00:00:00Z' }, { id: 'y', updatedAt: '2026-01-01T00:00:00Z' }];
const b = [{ id: 'x', status: 'approved', updatedAt: '2026-01-02T00:00:00Z' }, { id: 'z', updatedAt: '2026-01-01T00:00:00Z' }];
const mg = TO._t.merge(a, b), mg2 = TO._t.merge(b, a);
ok(mg.length === 3 && mg.find(x => x.id === 'x').status === 'approved' && mg2.find(x => x.id === 'x').status === 'approved', 'merge by id: newest wins either way, nothing dropped');
// two computers write at once: a stale local list never undoes the other's decision
as('zedd.demo@grayco-cs.com'); ls.delete('gc_timeoff_cache');
TO._t.keepLocal([Object.assign({}, kv.get('gc_timeoff').list.find(x => x.id === offId), { status: 'pending', updatedAt: '2020-01-01T00:00:00Z' })]);
await TO.request({ kind: 'off', from: add(12), to: add(12) });
ok(kv.get('gc_timeoff').list.find(x => x.id === offId).status === 'approved', 'a computer with an old copy writing a new request keeps the approval in the cloud');

console.log(`\nTIMEOFF fn: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
