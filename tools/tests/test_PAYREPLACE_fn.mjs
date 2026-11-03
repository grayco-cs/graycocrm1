// test_PAYREPLACE_fn.mjs [index.html] — patch PAYREPLACE: the REAL payroll engine (lifted out of index.html, run in a vm
// with a fake IndexedDB) folds exact duplicate drafts on load (writes once, then nothing), and when paid payroll is
// entered it retires that person's unpaid lines dated on/before the cutoff or overlapping a paid week; paid and
// approved runs are never touched; empty runs are tombstoned; every retired line is archived in payrollRetired.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const file = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(x => x.includes('__GC_PAYROLL2__'));
if (!src) throw new Error('payroll engine script not found');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const J = v => JSON.parse(JSON.stringify(v));
function load(store) {
  const noop = () => 0, logs = [], dead = [];
  const db = { puts: 0, keys: [], data: store };
  const win = { addEventListener: noop, removeEventListener: noop,
    document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    localStorage: { getItem: () => null, setItem: noop }, _crm: { users: [] },
    console: { log: (...a) => logs.push(a.join(' ')), warn: noop, error: noop, info: noop },
    idbGet: async k => (k in db.data ? J(db.data[k]) : null),
    idbSet: async (k, v) => { db.puts++; db.keys.push(k); db.data[k] = J(v); return true; },
    _gcTombstoneMany: (type, ids) => { dead.push(...ids.map(i => type + ':' + i)); return ids.length; } };
  const ctx = vm.createContext(Object.assign(win, { window: win, setTimeout: noop, setInterval: noop, clearInterval: noop, clearTimeout: noop, MutationObserver: function(){ this.observe = noop; } }));
  ctx.self = ctx;
  vm.runInContext(src, ctx);
  return { P: ctx.__GC_PAY, db, logs, dead };
}
const B = (amt, st) => ({ empId: 'U1', name: 'Brittany Pucket', gross: amt, net: amt - 300, fed: 150, ss: 100, med: 25, state: st || 0, status: 'pending' });
const S = () => ({ empId: 'U2', name: 'Steven Biffle', gross: 1500, net: 1200, fed: 120, ss: 93, med: 21.75, state: 0, status: 'pending' });
const run = (id, status, from, to, payDate, lines) => ({ id, status, from, to, payDate, auto: status === 'draft', lines, totals: {} });
const PAID = run('PAID1', 'paid', '2026-10-09', '2026-10-15', '2026-10-16', [Object.assign(B(1346.15), { status: 'paid' })]);
const APPR = run('APPR1', 'approved', '2026-10-16', '2026-10-22', '2026-10-23', [Object.assign(S(), { status: 'approved' })]);
const store = { payrollRuns: [
  run('D1', 'draft', '2026-09-05', '2026-09-18', '2026-09-18', [B(2692.31, 66.77), S()]),
  run('D1b', 'draft', '2026-09-05', '2026-09-18', '2026-09-18', [B(2692.31, 66.77), S()]),        // exact copy of D1
  run('D1c', 'denied', '2026-09-05', '2026-09-18', '2026-09-18', [B(2692.31, 66.77)]),           // exact copy, denied
  run('D2', 'draft', '2026-09-19', '2026-10-02', '2026-10-02', [B(2692.31)]),
  run('D2b', 'draft', '2026-09-19', '2026-10-02', '2026-10-02', [B(2692.30)]),                   // a cent off: not a copy
  PAID, APPR,
  run('D4', 'draft', '2026-10-23', '2026-10-29', '2026-10-30', [B(1346.15)]),
  run('D5', 'pending', '2026-11-05', '2026-11-11', '2026-11-13', [B(1346.15), S()]),            // after the cutoff, no paid week
  run('D6', 'draft', '2026-11-12', '2026-11-18', '2026-11-20', [B(1346.15), S()]) ] };
const paidBefore = J([PAID, APPR]);
const L = load(J(store));

// ── 1. load: exact duplicates fold, once ─────────────────────────────────────────────────────────────────────────
const l1 = await L.P.runs();
const ids1 = l1.map(r => r.id);
ok(!ids1.includes('D1b') && !ids1.includes('D1c'), 'D1b / D1c (exact copies) folded away: ' + ids1.join());
ok(ids1.includes('D1') && ids1.includes('D2') && ids1.includes('D2b'), 'the original and the not-quite copy stay');
ok(L.dead.includes('payrollRuns:D1b') && L.dead.includes('payrollRuns:D1c'), 'folded runs tombstoned');
ok(L.db.keys.filter(k => k === 'payrollRuns').length === 1, 'runs written once');
const arch1 = L.db.data.payrollRetired || [];
ok(arch1.length === 3 && arch1.every(x => x.why === 'exact duplicate' && x.line && x.line.gross), 'the 3 folded lines archived (got ' + arch1.length + ')');
const p1 = L.db.puts; await L.P.runs(); await L.P.runs();
ok(L.db.puts === p1, 'a second load writes nothing');
ok(JSON.stringify(l1.filter(r => r.id === 'PAID1' || r.id === 'APPR1')) === JSON.stringify(paidBefore), 'paid / approved untouched by the fold');

// ── 2. entered paid week for Brittany (11/12–11/18) retires her overlapping + pre-cutoff drafts ──────────────────
const cur = L.db.data.payrollRuns;
cur.push(run('PS1', 'paid', '2026-11-12', '2026-11-18', '2026-11-20', [Object.assign(B(1346.15), { net: 1001.07, fed: 95, status: 'paid', source: 'paystub-entry' })]));
L.db.data.payrollRuns = cur;
const d0 = L.dead.length;
const res = await L.P.replaceDrafts([{ empId: 'U1', name: 'Brittany Pucket' }]);
const l2 = L.db.data.payrollRuns, byId = Object.fromEntries(l2.map(r => [r.id, r]));
ok(res.changed, 'changed');
ok(byId.D1 && byId.D1.lines.length === 1 && byId.D1.lines[0].name === 'Steven Biffle', 'D1: her line gone, Steven\'s kept');
ok(byId.D1 && byId.D1.totals.gross === 1500, 'D1 totals recomputed');
ok(!byId.D2 && !byId.D2b && !byId.D4, 'D2 / D2b / D4 (hers only, on/before cutoff) removed');
ok(byId.D5 && byId.D5.lines.length === 2, 'D5 (after cutoff, no paid week) kept');
ok(byId.D6 && byId.D6.lines.length === 1 && byId.D6.lines[0].name === 'Steven Biffle', 'D6: overlapping week retired for her only');
ok(['D2', 'D2b', 'D4'].every(i => L.dead.slice(d0).includes('payrollRuns:' + i)) && L.dead.length - d0 === 3, 'empty runs tombstoned: ' + L.dead.slice(d0).join());
ok(JSON.stringify(l2.filter(r => r.id === 'PAID1' || r.id === 'APPR1')) === JSON.stringify(paidBefore), 'paid / approved untouched');
ok(byId.PS1 && byId.PS1.lines.length === 1, 'the entered paid run kept');
const arch2 = (L.db.data.payrollRetired || []).slice(arch1.length);
ok(arch2.length === 5 && arch2.every(x => x.line.name === 'Brittany Pucket'), '5 retired lines archived (got ' + arch2.length + ')');
ok(arch2.some(x => x.runId === 'D6' && x.why === 'period now paid') && arch2.some(x => x.runId === 'D4' && /on\/before 2026-11-03/.test(x.why)), 'reasons recorded');
const p2 = L.db.puts; await L.P.replaceDrafts([{ empId: 'U1', name: 'Brittany Pucket' }]); await L.P.runs();
ok(L.db.puts === p2, 'second run of replaceDrafts + load writes nothing');

// ── 3. pure: a cutoff setting is honoured; nobody named = nothing changes for others ─────────────────────────────
const pr = L.P.payReplace(J(store.payrollRuns), { emps: ['Steven Biffle'], cutoff: '2026-09-01' });
ok(pr.retired.length === 0, 'Steven: no paid week overlaps his drafts and cutoff 9/01 is before them: nothing retired');
console.log((fail ? 'FAIL ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
