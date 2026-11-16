// test_SAVES_merge.mjs <build-dir> — SAVES: the merge rules on their own (no browser). The code is read out of index.html.
//   1. leads / customers / schedule: two devices change different fields of one record → both changes kept (3-way on the
//      cloud base); both change the same field → the newer copy's; a lead's activity list both added to → both entries;
//      no base yet → nothing decided here (the old newest-copy rule);
//   2. a job's field sub-lists (envLog, equipment …): entries from both copies kept, the same entry keeps its newest version,
//      an entry marked removed stays marked;
//   3. the sync engine's "same list" check ignores order only.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const BUILD = path.resolve(process.argv[2] || '.');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); } };
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('not found: ' + a.slice(0, 40)); return html.slice(i, j); };
// 1. the 3-way merge
const w = {}; const ctx = vm.createContext({ window: w, JSON, Object, String, Array });
vm.runInContext(cut('var _gcsvBase = {}', '/* SAVES: the same records') + cut('function _gcsvSameList', 'window._gcUnsent'), ctx);
const base = { id: 'L1', name: 'Robin', stage: 'new', phone: '1', activity: [{ at: '1', text: 'made' }], updatedAt: '2026-01-01T00:00:00Z' };
w._gcsvSeeCloud('leads', [base]);
const phone = Object.assign({}, base, { activity: base.activity.concat([{ at: '3', text: 'called from phone' }]), updatedAt: '2026-01-03T00:00:00Z' });
const desk = Object.assign({}, base, { stage: 'contacted', updatedAt: '2026-01-02T00:00:00Z' });
let m = w._gcsv3way('leads', desk, phone);
ok(m && m.stage === 'contacted' && m.activity.length === 2 && m.updatedAt === phone.updatedAt, 'one lead, two devices: the stage (desk) AND the call note (phone) are both kept', m);
m = w._gcsv3way('leads', phone, desk);
ok(m && m.stage === 'contacted' && m.activity.length === 2, '… in either order', m);
const d2 = Object.assign({}, base, { phone: '2', activity: base.activity.concat([{ at: '2', text: 'desk note' }]), updatedAt: '2026-01-02T00:00:00Z' });
const p2 = Object.assign({}, base, { phone: '3', activity: base.activity.concat([{ at: '3', text: 'phone note' }]), updatedAt: '2026-01-03T00:00:00Z' });
m = w._gcsv3way('leads', d2, p2);
ok(m && m.phone === '3' && m.activity.length === 3, 'both changed the same field → the newer copy\'s value; both added to the activity → all three entries', m);
ok(w._gcsv3way('projects', desk, phone) === null, 'jobs are not decided here (SYNC-A does that per field)');
ok(w._gcsv3way('customers', { id: 'C9', a: 1 }, { id: 'C9', a: 2 }) === null, 'no base for the record → nothing decided here (newest copy, as before)');
w._gcsvSeeCloud('schedule', [{ id: 'S1', date: '2026-01-05', title: 'Demo', assignee: 'A', updatedAt: '1' }]);
m = w._gcsv3way('schedule', { id: 'S1', date: '2026-01-06', title: 'Demo', assignee: 'A', updatedAt: '2' }, { id: 'S1', date: '2026-01-05', title: 'Demo', assignee: 'B', updatedAt: '3' });
ok(m && m.date === '2026-01-06' && m.assignee === 'B', 'schedule: the office moved the date, the PM changed who → both kept', m);
const SL = vm.runInContext('_gcsvSameList', ctx); ok(SL([{ id: 1, a: 1 }, { id: 2, a: 2 }], [{ id: 2, a: 2 }, { id: 1, a: 1 }]) && !SL([{ id: 1, a: 1 }], [{ id: 1, a: 2 }]), '"same list" ignores order, not content');
// 2. job sub-lists
const c2 = vm.createContext({ JSON, Object, String, Array, stats: {}, idOf: r => (r && r.id != null ? String(r.id) : '') });
vm.runInContext(cut('var SUBL = [', '/* ── a person\'s edit: stamped'), c2);
const j0 = { id: 'P4', envLog: [{ id: 'e1', kind: 'air', at: '1' }], equipment: [{ id: 'q1', kind: 'Dehu', at: '1' }] };
const jPhone = Object.assign({}, j0, { envLog: j0.envLog.concat([{ id: 'e2', kind: 'air', at: '5', result: '0.004 f/cc' }]), updatedAt: '5' });
const jDesk = Object.assign({}, j0, { equipment: [{ id: 'q1', kind: 'Dehu', at: '1', pickedUp: '2026-01-04', updatedAt: '4' }], updatedAt: '4' });
const out = vm.runInContext('subUnion', c2)([jDesk], [jDesk], [jPhone]);
const r = out[0];
ok(r.envLog.length === 2 && r.envLog.some(x => x.id === 'e2'), 'environmental: the phone\'s air sample is kept when the Desk copy wins', r.envLog);
ok(r.equipment.length === 1 && r.equipment[0].pickedUp, 'mitigation: the equipment pickup (newer entry) is kept', r.equipment);
const rm = vm.runInContext('subUnion', c2)([Object.assign({}, jPhone, { envLog: [{ id: 'e1', kind: 'air', at: '1', deleted: true, deletedAt: '6' }, jPhone.envLog[1]] })], [jPhone], []);
ok(rm[0].envLog.find(x => x.id === 'e1').deleted === true, 'an entry marked deleted stays deleted (its newer version wins)', rm[0].envLog);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
