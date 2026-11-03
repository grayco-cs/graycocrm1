// test_PROFDUP_fn.mjs [index.html] — patch PROFDUP: the REAL payroll profiles() (lifted out of index.html, run in a vm
// with a fake IndexedDB get/put) folds hundreds of copies of one person into one, writes once, then writes nothing;
// a new user gets exactly one profile; the copy with the W-4 data wins; copies tied to different userIds stay apart.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const file = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(x => x.includes('__GC_PAYROLL2__'));
if (!src) throw new Error('payroll engine script not found');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
function load(store, users) {
  const noop = () => 0, logs = [], dead = [];
  const db = { puts: 0, data: store };
  const win = { addEventListener: noop, removeEventListener: noop,
    document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    localStorage: { getItem: () => null, setItem: noop }, _crm: { users },
    console: { log: (...a) => logs.push(a.join(' ')), warn: noop, error: noop, info: noop },
    idbGet: async k => (k in db.data ? JSON.parse(JSON.stringify(db.data[k])) : null),
    idbSet: async (k, v) => { db.puts++; db.data[k] = JSON.parse(JSON.stringify(v)); return true; },
    _gcTombstoneMany: (type, ids) => { dead.push(...ids.map(i => type + ':' + i)); return ids.length; } };
  const ctx = vm.createContext(Object.assign(win, { window: win, setTimeout: noop, setInterval: noop, clearInterval: noop, clearTimeout: noop, MutationObserver: function(){ this.observe = noop; } }));
  ctx.self = ctx;
  vm.runInContext(src, ctx);
  return { P: ctx.__GC_PAY, db, logs, dead, win };
}
const rnd = i => 'PP' + (1e6 + i * 7919).toString(36);
const W4 = { filing: 'married', dependentsCredit: 2700, msFiling: 'married', msExemption: 0, w4Form: '2020', annualSalary: 94396.12, payType: 'salary', state: 'MS', workState: 'MS', ssn4: '1234' };

// ── 1. 300 copies of Brittany + the shared Office login + others ────────────────────────────────────────────
{
  const brit = [];
  for (let i = 0; i < 300; i++) brit.push({ id: rnd(i), userId: '', name: i % 3 ? 'Brittany Pucket' : ' brittany pucket ', email: 'office@grayco-cs.com', payType: 'salary', filing: 'single', period: 'weekly', otAfter: 40, annualSalary: 0, hourlyRate: 0, active: true, updatedAt: '2026-10-0' + (1 + i % 9) + 'T00:00:00Z' });
  Object.assign(brit[137], W4);                                     /* the one the owner typed the W-4 into */
  brit[250].hireDate = '2025-03-03';                                /* a detail only another copy has */
  const store = { payrollProfiles: [
    { id: 'PPUOFFICE', userId: 'UOFFICE', name: 'Office', email: 'office@grayco-cs.com', payType: 'hourly', hourlyRate: 20, period: 'weekly', updatedAt: '2026-10-01T00:00:00Z' },
    ...brit.slice(0, 150),
    { id: 'PPU2', userId: 'U2', name: 'Steven Biffle', payType: 'salary_commission', filing: 'married', dependentsCredit: 2700, period: 'weekly' },
    { id: 'PPX', userId: '', name: 'Brittany Puckett', payType: 'hourly', period: 'weekly' },   /* a different name: untouched */
    ...brit.slice(150) ] };
  const users = [{ id: 'UOFFICE', name: 'Office', email: 'office@grayco-cs.com', role: 'Office', active: true },
    { name: 'Brittany Pucket', email: 'office@grayco-cs.com', role: 'Office Admin', active: true },   /* no id, the shared e-mail */
    { id: 'U2', name: 'Steven Biffle', email: 'steven@x.com', active: true }];
  const L = load(store, users);
  const before = store.payrollProfiles.length;
  const l1 = await L.P.profiles();
  const b = l1.filter(p => p.name.trim().toLowerCase() === 'brittany pucket');
  ok(before === 303, 'fixture size'); ok(b.length === 1, '300 Brittany copies -> one (got ' + b.length + ')');
  ok(l1.filter(p => p.name === 'Office').length === 1, 'one Office'); ok(l1.filter(p => p.name === 'Steven Biffle').length === 1, 'one Steven');
  ok(l1.filter(p => p.name === 'Brittany Puckett').length === 1, 'different name untouched');
  ok(l1.length === 4, 'four profiles in all (got ' + l1.length + ')');
  ok(L.db.puts === 1, 'written back once (got ' + L.db.puts + ')');
  ok(L.db.data.payrollProfiles.length === 4, 'stored list is the merged list');
  const w = b[0];
  ok(w.filing === 'married' && w.dependentsCredit === 2700 && w.msFiling === 'married' && w.annualSalary === 94396.12 && w.ssn4 === '1234', 'the copy with W-4 data wins');
  ok(w.id === rnd(137), 'the winner keeps its own id');
  ok(w.hireDate === '2025-03-03', 'a field missing from the winner is filled from another copy');
  ok(L.dead.length === 299 && L.dead.every(d => d.indexOf('payrollProfiles:') === 0) && !L.dead.includes('payrollProfiles:' + w.id), 'the 299 removed ids are tombstoned, the kept one is not');
  ok(L.logs.some(s => /PROFDUP: merged 299 duplicate/.test(s)), 'count logged to the console');
  ok(L.win.__gcPayHeal && L.win.__gcPayHeal.profilesMerged === 299, 'count in __gcPayHeal');
  const office = l1.find(p => p.name === 'Office');
  ok(office.payType === 'hourly' && office.hourlyRate === 20 && office.updatedAt === '2026-10-01T00:00:00Z', 'Office already right: not re-stamped');
  // pay runs / YTD are keyed on userId||name: the key a run line carries still finds the merged profile
  const runs = [{ status: 'paid', payDate: '2026-09-25', lines: [{ empId: 'Brittany Pucket', name: 'Brittany Pucket', gross: 1815.31 }] }];
  ok(L.P.ytdFor(runs, w.userId || w.name, 2026).gross === 1815.31, 'YTD still found for the merged profile');

  // ── 2. a second load writes nothing ──
  const p0 = L.db.puts, l2 = await L.P.profiles();
  ok(L.db.puts === p0, 'second load writes nothing (puts ' + (L.db.puts - p0) + ')'); ok(l2.length === 4, 'second load same list');
  // the W-4 entry sticks: edit + save + reload keeps it and makes no copy
  const ed = await L.P.profiles(); ed.find(p => /brittany pucket/i.test(p.name)).extra = 25; await L.P.saveProfiles(ed);
  const l3 = await L.P.profiles();
  ok(l3.filter(p => /^\s*brittany pucket\s*$/i.test(p.name)).length === 1 && l3.find(p => /^\s*brittany pucket\s*$/i.test(p.name)).extra === 25, 'a saved W-4 entry sticks after a reload');

  // ── 3. a new user gets exactly one profile ──
  users.push({ id: 'U9', name: 'New Person', email: 'office@grayco-cs.com', active: true });
  users.push({ name: 'No Id Person', email: 'office@grayco-cs.com', active: true });
  const [a1, a2] = await Promise.all([L.P.profiles(), L.P.profiles()]);   /* two loads in flight at once */
  const l4 = await L.P.profiles();
  ok(l4.filter(p => p.name === 'New Person').length === 1 && l4.find(p => p.name === 'New Person').id === 'PPU9', 'new user: one profile, id from the user');
  ok(l4.filter(p => p.name === 'No Id Person').length === 1 && l4.find(p => p.name === 'No Id Person').id === 'PPN-no-id-person', 'user with no id: one profile, id from the name (same on every load/computer)');
  ok(a1.find(p => p.name === 'No Id Person').id === a2.find(p => p.name === 'No Id Person').id, 'two concurrent loads make the same record');
  ok(l4.length === 6, 'six profiles (got ' + l4.length + ')');
  const p1 = L.db.puts; await L.P.profiles(); ok(L.db.puts === p1, 'and then nothing more is written');
}

// ── 4. W-4 copy wins inside a userId group; different userIds are never merged ─────────────────────────────
{
  const store = { payrollProfiles: [
    { id: 'PPUB', userId: 'UB', name: 'Brittany Pucket', payType: 'salary', filing: 'single' },
    { id: 'PPr1', userId: '', name: 'Brittany Pucket', ...W4 },
    { id: 'PPr2', userId: '', name: 'Brittany Pucket', payType: 'salary' },
    { id: 'PPUC', userId: 'UC', name: 'Brittany Pucket', payType: 'hourly', hourlyRate: 18 } ] };
  const L = load(store, [{ id: 'UB', name: 'Brittany Pucket', active: true }, { id: 'UC', name: 'Brittany Pucket', active: true }]);
  const l = await L.P.profiles();
  const bp = l.filter(p => p.name === 'Brittany Pucket');
  ok(bp.length === 3, 'two userIds stay two profiles, the loose copies fold into one (got ' + bp.length + ')');
  ok(bp.find(p => p.userId === 'UB').filing === 'single' && bp.find(p => p.userId === 'UC').hourlyRate === 18, 'the userId copies are untouched');
  const lo = bp.find(p => !p.userId);
  ok(lo && lo.id === 'PPr1' && lo.filing === 'married' && lo.dependentsCredit === 2700, 'among the loose copies the W-4 copy wins');
  ok(L.dead.join() === 'payrollProfiles:PPr2', 'tombstones only the folded copy (' + L.dead.join() + ')');
}
// ── 5. one Team user: a loose W-4 copy folds into the user's own profile, which keeps its id and userId ──
{
  const store = { payrollProfiles: [
    { id: 'PPUB', userId: 'UB', name: 'Brittany Pucket', payType: 'salary', filing: 'single' },
    { id: 'PPr1', userId: '', name: 'Brittany Pucket', ...W4 },
    { id: 'PPr2', userId: '', name: 'Brittany Pucket', payType: 'salary' } ] };
  const L = load(store, [{ id: 'UB', name: 'Brittany Pucket', email: 'office@grayco-cs.com', active: true }]);
  const l = await L.P.profiles();
  ok(l.length === 1, 'one profile (got ' + l.length + ')');
  ok(l[0].id === 'PPUB' && l[0].userId === 'UB' && l[0].filing === 'married' && l[0].dependentsCredit === 2700, 'W-4 data wins, userId and the user\'s id kept');
  ok(L.dead.slice().sort().join() === 'payrollProfiles:PPr1,payrollProfiles:PPr2', 'tombstones ' + L.dead.join());
  const p0 = L.db.puts; await L.P.profiles(); ok(L.db.puts === p0, 'converged: next load writes nothing');
}
console.log((fail ? 'FAIL ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
