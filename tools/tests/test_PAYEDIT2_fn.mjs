// node tools/tests/test_PAYEDIT2_fn.mjs [index.html] — patch PAYEDIT2. (1) tools/payedit2_tail.js in a vm with a fake
// localStorage: owners / admins / people let go get no commission check, no payroll commission, are off the checks
// due; the self-heal takes their UNPAID commission checks off gc_check_queue once, archives them, never touches a real
// employee's check or a check already written. (2) the real payroll engine: a run reopened for edit is never retired
// by PAYREPLACE. (3) the patched index.html carries the Edit wiring. Made-up people.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, '..', '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
const J = v => JSON.parse(JSON.stringify(v));

// ── 1. the tail ─────────────────────────────────────────────────────────────────────────────────────────────────
const tail = fs.readFileSync(path.join(here, '..', 'payedit2_tail.js'), 'utf8').replace(/^<script>/, '').replace(/<\/script>\s*$/, '');
ok(html.includes(tail.trim().slice(0, 4000)), 'index.html carries tools/payedit2_tail.js');
const users = [{ name: 'Wes Owner', role: 'Admin', email: 'wes@example.test' }, { name: 'Nia Partner', role: 'Sales', payType: 'owner' },
  { name: 'Pat PM', role: 'Project Manager', payType: 'commission' }, { name: 'Gone Guy', role: 'Project Manager' }];
const ck = (id, emp, amount, extra) => Object.assign({ id, dir: 'out', emp, amount, type: 'commission', status: 'entered', payDate: '2026-09-18', jobId: 'J' + id }, extra);
const Q = [ck('C1', 'Wes Owner', 3138), ck('C2', 'wes owner', 1334.64), ck('C3', 'Nia Partner', 1000), ck('C4', 'Gone Guy', 870),
  ck('C5', 'Pat PM', 500), ck('C6', 'Wes Owner', 99, { status: 'written' }), ck('C7', 'Wes Owner', 50, { type: 'reimbursement' }),
  ck('C8', 'Wes Owner', 25, { awaitingCollection: true })];
function boot(store) {
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const noop = () => 0, drafted = [], dead = [], up = [];
  const win = { localStorage: ls, console: { log: noop }, _crm: { users },
    _gcOwnerNames: () => ['Wes Owner'], _gcTombstoneMany: (k, ids) => dead.push(...ids.map(i => k + ':' + i)), _supaUpsert: k => up.push(k),
    _gcDraftCheck: c => { drafted.push(c); return Object.assign({ id: 'N' + drafted.length }, c); },
    _gcCommissionForPM: async () => ({ total: 700, note: 'real' }),
    _gcQueuedChecksDue: () => JSON.parse(store.gc_check_queue || '[]').filter(c => c.status === 'entered').map(c => ({ checkId: c.id, who: c.emp, amt: c.amount, kind: c.type })) };
  win._gcCommissionForPM.__paytruth = true;
  const ctx = vm.createContext(Object.assign(win, { window: win, setTimeout: noop, setInterval: noop }));
  vm.runInContext(tail, ctx);
  return { W: ctx, drafted, dead, up, store };
}
const B = boot({ gc_check_queue: JSON.stringify(Q), gc_fired_users: JSON.stringify({ 'gone guy': true }) });
const C = B.W._gcPayEdit2Core;
const set = C.noCommSet({ users, ownerNames: [], fired: { 'gone guy': 1 } });
ok(set['wes owner'] === 'owner' && set['nia partner'] === 'owner' && set['gone guy'] === 'let go' && !set['pat pm'], 'owner by role, owner by payType, let go by gc_fired_users; the PM earns', set);
ok(B.W._gcNoCommission('Wes Owner') && B.W._gcNoCommission(' WES  owner ') && !B.W._gcNoCommission('Pat PM') && !B.W._gcNoCommission(''), '_gcNoCommission matches names loosely, never a real employee or a blank');
// gates
ok(B.W._gcDraftCheck({ dir: 'out', emp: 'Wes Owner', amount: 10, type: 'commission' }) === null && B.drafted.length === 0, 'no commission check is queued for the owner');
ok(B.W._gcDraftCheck({ dir: 'out', emp: 'Gone Guy', amount: 10, type: 'commission' }) === null, '… or for someone let go');
ok(!!B.W._gcDraftCheck({ dir: 'out', emp: 'Pat PM', amount: 10, type: 'commission' }) && !!B.W._gcDraftCheck({ dir: 'out', emp: 'Wes Owner', amount: 5, type: 'reimbursement' }) && B.drafted.length === 2,
  'the PM\'s commission and the owner\'s non-commission check still queue');
const cw = await B.W._gcCommissionForPM('Wes Owner', '2026-09-01', '2026-09-30'), cp = await B.W._gcCommissionForPM('Pat PM', '2026-09-01', '2026-09-30');
ok(cw.total === 0 && /owner/.test(cw.note) && cp.total === 700 && B.W._gcCommissionForPM.__paytruth === true, 'payroll commission: owner 0, PM unchanged (markers kept)', [cw, cp]);
const due0 = B.W._gcQueuedChecksDue('2026-11-06').map(c => c.checkId);
ok(!due0.includes('C1') && !due0.includes('C4') && due0.includes('C5') && due0.includes('C7'), 'checks due never shows owner / let-go commission', due0);
// self-heal
const n1 = B.W._gcOwnerCommHeal();
const left = JSON.parse(B.store.gc_check_queue).map(c => c.id), hist = JSON.parse(B.store.gc_owner_comm_removed);
ok(n1 === 5 && left.join() === 'C5,C6,C7', 'heal removes the 5 unpaid owner / let-go commission checks; keeps the PM\'s, the written one, the reimbursement', { n1, left });
ok(hist.length === 5 && hist.every(h => h.check && h.check.amount && /no commission/.test(h.why) && h.at), 'each removed check archived in gc_owner_comm_removed', hist[0]);
ok(B.dead.length === 5 && B.dead.every(d => d.startsWith('gc_check_queue:')) && B.up.includes('gc_check_queue'), 'removed ids tombstoned, queue synced');
const before = B.store.gc_check_queue, h0 = B.store.gc_owner_comm_removed;
ok(B.W._gcOwnerCommHeal() === 0 && B.store.gc_check_queue === before && B.store.gc_owner_comm_removed === h0, 'second heal: nothing to do, nothing written');
const B2 = boot({ gc_check_queue: JSON.stringify([ck('E1', 'Pat PM', 1)]) }); const q2 = B2.store.gc_check_queue;
ok(B2.W._gcOwnerCommHeal() === 0 && B2.store.gc_check_queue === q2 && !('gc_owner_comm_removed' in B2.store), 'no owner checks: the heal writes nothing');

// ── 2. the engine: a reopened run is never retired ─────────────────────────────────────────────────────────────
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(x => x.includes('__GC_PAYROLL2__'));
{ const noop = () => 0, data = {};
  const win = { addEventListener: noop, removeEventListener: noop, document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    localStorage: { getItem: () => null, setItem: noop }, _crm: { users: [] }, console: { log: noop, warn: noop, error: noop, info: noop },
    idbGet: async k => (k in data ? J(data[k]) : null), idbSet: async (k, v) => { data[k] = J(v); return true; } };
  const ctx = vm.createContext(Object.assign(win, { window: win, setTimeout: noop, setInterval: noop, clearInterval: noop, clearTimeout: noop, MutationObserver: function(){ this.observe = noop; } }));
  vm.runInContext(src, ctx);
  const L = (st) => ({ empId: 'U1', name: 'Pat PM', gross: 1000, net: 800, status: st });
  const list = [{ id: 'PAID', status: 'paid', from: '2026-08-15', to: '2026-08-21', payDate: '2026-08-21', lines: [L('paid')] },
    { id: 'REOPEN', status: 'pending', reopenedForEdit: '2026-11-03T10:00:00Z', from: '2026-08-15', to: '2026-08-21', payDate: '2026-08-21', lines: [L('pending')] },
    { id: 'DRAFT', status: 'draft', from: '2026-08-15', to: '2026-08-21', payDate: '2026-08-21', lines: [L('draft')] }];
  const res = ctx.__GC_PAY.payReplace(J(list), { cutoff: '2026-11-03' });
  ok(res.deadIds.join() === 'DRAFT' && res.list.some(r => r.id === 'REOPEN' && r.lines.length === 1), 'PAYREPLACE retires the draft but never the run reopened for edit', res.deadIds);
  const f = ctx.__GC_PAY.foldDupRuns(J([list[1], list[2]]));
  ok(f.list.some(r => r.id === 'REOPEN' && r.lines.length === 1), 'duplicate fold keeps the reopened run');
}

// ── 3. the wiring in index.html ────────────────────────────────────────────────────────────────────────────────
const has = s => html.split(s).length - 1;
ok(has("data-redit=\"'+esc(r.id)+'\"") === 1 && has("querySelectorAll('[data-redit]')") === 1 && has("querySelectorAll('[data-ledit]')") === 1, 'run cards: ✏️ Edit + per-line ✏️ Edit wired once');
ok(has('W._gcPayRunReopen = async function') === 1 && has('W._gcPastPayEditRun = function') === 1 && has("action:'reopened for edit'") === 1, 'reopen + paystub editor exposed once');
ok(has("if(!_pe2Skip) try{ await postToBooks(") === 1 && has("if(r.reopenedFrom==='paid'){ r.status='paid';") === 1, 're-approval: paid stays paid, rebooked only if it was booked');
for (const [n, tf] of [['pastpay', 'W._gcPastPayEditRun = function'], ['paymanual', 'W._gcPayRunReopen = async function']]) {
  const t = fs.readFileSync(path.join(here, '..', n + '_tail.js'), 'utf8').trim(); ok(t.includes(tf) && html.includes(t), 'tools/' + n + '_tail.js patched and identical in index.html');
}
console.log((fail ? 'FAILED ' : 'ok ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
