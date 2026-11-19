// test_REGFIX.mjs [index.html] — patch REGFIX in node (vm), MADE-UP records only, the 11/19 04:15Z sequence:
//   a register with live supplier-bill lines + copies of them that were DELETED (tombstoned + gc_deleted_gcAcctRegister),
//   a fold cycle (C into Z, Z into C), and a real duplicate pair. Then the duplicate fold runs, then the deleted copies are
//   stripped (what the next sync / upload does). The live lines must still be there.
// Also: the out-of-date-copy gate (_gcStaleGate) and the admin restore (plan / apply / undo).
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const FILE = path.resolve(process.argv[2] || 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const blockAt = (needle) => { const i = html.indexOf(needle); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const J = blockAt("if(window.__GC_PATCH_J__) return;"), G = blockAt('__GC_PATCH_STALEGATE__'), RR = blockAt('__GC_PATCH_REGRESTORE__');
ok(J.length > 20000, 'index.html has patch J (fold / duplicate check)');
const HAS_FIX = G.length > 1000 && RR.length > 1000;
console.log(HAS_FIX ? '  (this copy has patch REGFIX)' : '  (this copy has NO patch REGFIX — the checks below show the 11/19 loss)');

function harness(){
  const store = {}, LS = {}, tomb = {};
  const intervals = [];
  const win = {
    _crm: { projects: [], invs: [], expenses: [] }, __GC_IDB_READ_HOOKS__: [],
    _gcIsTombstoned: (k, id) => !!tomb[k + ':' + id],
    _gcManualNow: () => {}, _supaUpsert: async () => true, _supaUpsertNow: async () => true,
  };
  win.idbGet = async (k) => { let out = Promise.resolve(store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k]))); for (const h of win.__GC_IDB_READ_HOOKS__) out = h(k, out) || out; return out; };
  win.idbSet = async (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); };
  const localStorage = { getItem: (k) => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: (k) => { delete LS[k]; } };
  const document = { hidden: true, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }), body: { appendChild() {}, prepend() {} } };
  const setInterval = (fn) => { intervals.push(fn); return intervals.length; };
  const ctx = vm.createContext({ window: win, document, localStorage, setTimeout: () => 0, setInterval, clearInterval: (i) => { intervals[i - 1] = null; }, console: { log() {}, warn() {}, table() {} }, Promise, Date, JSON, Math, String, Array, Object, RegExp, Map, Number, isFinite, parseFloat, parseInt, confirm: () => true, alert: () => {} });
  win.window = win; win.localStorage = localStorage; win.document = document;
  win.__GC_RAW_SETINTERVAL__ = setInterval; win.__GC_NATIVE_SETINTERVAL__ = setInterval;
  const tick = (n = 3) => { for (let r = 0; r < n; r++) intervals.slice().forEach((f) => { try { f && f(); } catch (e) {} }); };
  return { store, LS, tomb, win, ctx, tick };
}
const L = (id, src, amt, extra) => Object.assign({ id, _id: id, srcInvId: src, amt, amount: amt, date: '2026-05-15', desc: 'Demo Supply — QuickBooks bill #' + src.slice(-4), payee: 'Demo Supply', type: 'expense', category: 'Subcontractor', source: 'subinvoice', status: 'paid', direction: 'out', isIncome: false, savedAt: '2026-11-05T16:50:01.000Z', updatedAt: '2026-11-16T16:32:28.000Z' }, extra || {});
const LIVE = [L('EXPlive0001', 'SUB_INVdemo0001', 5160), L('EXPlive0002', 'SUB_INVdemo0002', 1258.2), L('EXPlive0003', 'SUB_INVdemo0003', 128.58)];
/* the deleted copies: more fields (a sub-invoice link) so the old keep-picker preferred them */
const DEAD = LIVE.map((r, i) => L('EXPdead000' + (i + 1), r.srcInvId, r.amt, { subInvId: r.srcInvId.slice(4), po: 'X', vendor: 'Demo Supply', paidDate: '2026-11-05' }));
const PAIR = [L('EXPpairA001', 'SUB_INVpair0001', 700), L('EXPpairB001', 'SUB_INVpair0001', 700, { savedAt: '2026-11-06T00:00:00.000Z' })];
const CYC = L('EXPcyc00001', 'SUB_INVcyc00001', 2300);
const FOLDS = [
  { id: 'FOLD_gcAcctRegister_EXPcyc00001', list: 'gcAcctRegister', recordId: 'EXPcyc00001', keptId: 'EXPcycZ0001', rule: 'SYNC same record, two ids', foldedAt: '2026-11-16T02:38:49.215Z', record: CYC },
  { id: 'FOLD_gcAcctRegister_EXPcycZ0001', list: 'gcAcctRegister', recordId: 'EXPcycZ0001', keptId: 'EXPcyc00001', rule: 'SYNC same record, two ids', foldedAt: '2026-11-16T16:31:34.020Z', record: L('EXPcycZ0001', 'SUB_INVcyc00001', 2300) }];

async function run(){
  const H = harness();
  H.store.gcAcctRegister = [...LIVE, ...DEAD, ...PAIR, CYC];
  H.store.gc_folded = FOLDS;
  DEAD.forEach((d) => { H.tomb['gcAcctRegister:' + d.id] = 1794938413158; });
  H.LS.gc_deleted_gcAcctRegister = JSON.stringify(DEAD.map((d) => d.id));
  vm.runInContext(J, H.ctx);
  H.tick(4);
  await new Promise((r) => setTimeout(r, 20));
  const W = H.win;
  ok(typeof W._gcAutoFold === 'function' && typeof W._gcFold === 'function', 'patch J loaded in a stub page');

  /* the cycle: before any fold runs */
  const read0 = await W.idbGet('gcAcctRegister');
  ok(read0.some((r) => r.id === 'EXPcyc00001'), 'a row folded into a copy that is folded back into it (A→B, B→A) is NOT hidden from reads', read0.map((r) => r.id));
  ok(!W._gcIsFolded('gcAcctRegister', 'EXPcyc00001'), '_gcIsFolded says the cycle row is not folded (the keep-everything guard keeps it)');

  /* 04:15Z: the automatic duplicate fold */
  const n = await W._gcAutoFold();
  const F = H.store.gc_folded || [];
  const deadKept = F.filter((f) => DEAD.some((d) => d.id === f.keptId));
  ok(deadKept.length === 0, 'no fold keeps a DELETED copy as the survivor', deadKept.map((f) => f.recordId + '→' + f.keptId));
  const reg1 = H.store.gcAcctRegister.map((r) => r.id);
  ok(LIVE.every((r) => reg1.includes(r.id)), 'the 3 live supplier-bill lines are still on the register after the fold', reg1);
  ok(reg1.filter((id) => /^EXPpair/.test(id)).length === 1 && n >= 1, 'a real duplicate pair (both alive) is still folded to one', { n, reg1 });

  /* then the deleted copies are stripped (the outbound tombstone strip / next sync) */
  const dead = JSON.parse(H.LS.gc_deleted_gcAcctRegister);
  H.store.gcAcctRegister = H.store.gcAcctRegister.filter((r) => !dead.includes(r.id));
  const read2 = await W.idbGet('gcAcctRegister');
  ok(LIVE.every((r) => read2.some((x) => x.id === r.id)), 'after the deleted copies are removed, every live line is still on the register and visible', read2.map((r) => r.id));
  ok(read2.some((r) => r.id === 'EXPcyc00001'), 'the cycle row is still on the register (CH Plumbing #1250 case)');

  /* a fold into a deleted / missing / folded-away survivor is refused outright */
  H.store.gcAcctRegister.push(DEAD[0]);
  const r1 = await W._gcFold('gcAcctRegister', DEAD[0].id, [LIVE[0].id], 'R1 two register rows for one source', 'test', { by: 'test' });
  ok(r1 === 0 && H.store.gcAcctRegister.some((r) => r.id === LIVE[0].id), '_gcFold refuses to fold a live line into a deleted one', r1);
  const r2 = await W._gcFold('gcAcctRegister', 'EXPnotthere', [LIVE[1].id], 'R1', 'test', { by: 'test' });
  ok(r2 === 0, '_gcFold refuses a survivor that is not on the list', r2);
  const r3 = await W._gcFold('gcAcctRegister', 'EXPcycZ0001', ['EXPcyc00001'], 'R1', 'test', { by: 'test' });
  ok(r3 === 0, '_gcFold refuses a fold that would make A→B, B→A', r3);

  /* an out-of-date copy: no automatic fold at all */
  W._gcStaleGate = { holdSweeps: () => true, state: () => 'stale' };
  H.store.gcAcctRegister.push(L('EXPpairC001', 'SUB_INVpair0002', 50), L('EXPpairD001', 'SUB_INVpair0002', 50));
  const n2 = await W._gcAutoFold();
  ok(n2 === 0 && H.store.gcAcctRegister.some((r) => r.id === 'EXPpairD001'), 'on an out-of-date copy the automatic fold does nothing', n2);
  const n3 = await W._gcFold('gcAcctRegister', 'EXPpairC001', ['EXPpairD001'], 'by hand', 'test', { person: true });
  ok(n3 === 1, '…but a person folding by hand still can', n3);
  delete W._gcStaleGate;
  return H;
}

async function gate(){
  if (!G) { ok(false, 'index.html has patch STALEGATE'); return; }
  const mk = (live) => {
    const listeners = {}; const timers = [];
    const win = { __GC_BUILD_ID__: '33.264-2026-11-16-r36c', addEventListener: (e, f) => { (listeners[e] = listeners[e] || []).push(f); }, document: { hidden: false, body: { appendChild() {} }, getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }), addEventListener() {} },
      localStorage: { getItem: () => null }, location: { reload() {} } };
    const sent = [];
    win._supaUpsert = async (k) => { sent.push(k); return true; };
    win.fetch = async () => ({ ok: true, text: async () => live });
    win.setTimeout = (f, t) => { timers.push([f, t]); return timers.length; };
    win.setInterval = () => 0;
    const ctx = vm.createContext({ window: win, console: { log() {}, warn() {} }, Promise, Date, JSON, Math, String, Array, Object, RegExp, Error, clearInterval() {} });
    win.window = win; vm.runInContext(G, ctx);
    return { win, sent, listeners, timers, wrap: () => { win.setInterval = () => 0; } };
  };
  /* old copy (r36c) while r36p is live */
  const A = mk('33.276-2026-11-19-r36p');
  const SG = A.win._gcStaleGate;
  ok(SG && SG.state() === 'unknown' && SG.holdSweeps(), 'before the version answer: sweeps are held');
  const f = A.win._supaUpsert; const g = (k) => SG._gate(f, A.win, [k, []]);
  const pending = g('gcAcctRegister');
  await SG.check();
  ok(SG.state() === 'stale', 'a page older than /version.txt is "stale"', SG.info());
  let rej = null; await pending.then(() => {}, (e) => { rej = e; });
  ok(rej && /out of date/.test(rej.message) && !A.sent.includes('gcAcctRegister'), 'an upload made before the answer is NOT sent once the answer says stale');
  let rej2 = null; await g('invs').then(() => {}, (e) => { rej2 = e; });
  ok(rej2 && !A.sent.includes('invs'), 'a shared list is not uploaded by a timer on a stale copy');
  await g('gc_bootrep_Dx');
  ok(A.sent.includes('gc_bootrep_Dx'), "the device's own report still goes");
  SG._person(); await g('expenses');
  ok(A.sent.includes('expenses'), "a person's own save (a real tap in the last 15 s) still goes");
  SG._person(Date.now() - 60000); ok(SG.holdSweeps(), 'sweeps stay held on the stale copy');
  ok(A.win.__GC_UPDATE_PENDING__ === true, 'the stale copy arms the reload on the next menu / tab tap');
  /* the live copy */
  const B = mk('33.264-2026-11-16-r36c'); const SB = B.win._gcStaleGate;
  const p2 = SB._gate(B.win._supaUpsert, B.win, ['gcAcctRegister', []]);
  await SB.check(); await p2;
  ok(SB.state() === 'current' && !SB.holdSweeps() && B.sent.includes('gcAcctRegister'), 'on the live build: nothing held, the upload made before the answer is sent');
  /* a page NEWER than the server (test copy / mid-deploy) is never held */
  const C = mk('33.200-2026-11-01-r30a'); await C.win._gcStaleGate.check();
  ok(C.win._gcStaleGate.state() === 'current', 'a page newer than the server is not held');
  /* no answer at all: opens after 20 s */
  const D = mk(''); const SD = D.win._gcStaleGate; await SD.check();
  ok(SD.state() === 'unknown', 'no answer yet: still held');
  const realNow = Date.now; Date.now = () => realNow() + 21000; await SD.check(); Date.now = realNow;
  ok(SD.state() === 'current', 'no answer for 20 s: opens up (never stuck shut)');
}

async function restore(){
  if (!RR) { ok(false, 'index.html has patch REGRESTORE'); return; }
  const H = harness();
  vm.runInContext(J, H.ctx); H.tick(4);
  const W = H.win;
  vm.runInContext(RR, H.ctx);
  const R = W._gcRegRestore; const LINES = R.lines();
  ok(LINES.length === 44, 'the restore carries 44 lines', LINES.length);
  const tot = Math.round(LINES.reduce((t, l) => t + Number(l.amt), 0) * 100) / 100;
  ok(tot === 125064.44, 'their bills total $125,064.44', tot);
  /* the register as it is now: none of them; one already back (by id); one deleted on purpose */
  H.store.gcAcctRegister = [L('EXPother0001', 'SUB_INVother001', 10), Object.assign({}, LINES[0])];
  H.tomb['gcAcctRegister:' + LINES[1].id] = 1;
  H.store.gc_folded = LINES.map((l) => ({ id: 'FOLD_gcAcctRegister_' + l.id, list: 'gcAcctRegister', recordId: l.id, keptId: 'EXPdeadcopy', rule: 'R1 two register rows for one source', record: l }));
  /* line 0 is on the disk but folded: hidden from reads until un-folded */
  const P = await R.plan();
  const by = (w) => P.filter((p) => p.what === w).length;
  ok(by('deleted') === 1 && by('restore') + by('already') === 43, 'preview: one deleted on purpose is left alone; the rest are restore / already there', { restore: by('restore'), already: by('already'), deleted: by('deleted') });
  const before = JSON.stringify(H.store.gcAcctRegister);
  ok(before === JSON.stringify(H.store.gcAcctRegister), 'the preview writes nothing');
  const res = await R.apply();
  const reg = H.store.gcAcctRegister, ids = reg.map((r) => r.id);
  ok(res.restored === by('restore') && LINES.filter((l, i) => i !== 1).every((l) => ids.includes(l.id)), 'Restore puts back every missing line (not the deleted one)', res.restored);
  ok(!ids.includes(LINES[1].id) && ids.includes('EXPother0001'), 'the deleted line stays out; other lines untouched');
  ok(new Set(ids).size === ids.length, 'no line twice');
  const l5 = reg.find((r) => r.id === LINES[5].id);
  ok(l5 && l5.amount === LINES[5].amount && l5.amt === LINES[5].amt && l5.srcInvId === LINES[5].srcInvId && l5._restoredAt, 'a restored line is the 11/18 row (amount, amt, bill link) plus a restore stamp');
  const F = H.store.gc_folded; ok(F.filter((f) => f.unfolded).length === res.restored, 'their gc_folded entries are kept, marked unfolded', F.filter((f) => f.unfolded).length);
  const vis = await W.idbGet('gcAcctRegister');
  ok(vis.length === reg.length, 'every restored line shows on a read (no fold hides them)', [vis.length, reg.length]);
  const log = H.store.gc_regrestore_log; ok(Array.isArray(log) && log.length === 1 && log[0].ids.length === res.restored, 'the restore is logged in gc_regrestore_log');
  const again = await R.apply(); ok(again.restored === 0, 'pressing Restore again does nothing');
  const u = await R.undo(log[0].id);
  const ids2 = H.store.gcAcctRegister.map((r) => r.id);
  ok(u.removed === res.restored && ids2.includes('EXPother0001') && !LINES.some((l, i) => i > 1 && ids2.includes(l.id)), 'Undo takes exactly the restored lines off', u);
  ok(H.store.gc_folded.filter((f) => f.unfolded).length === 0 && H.store.gc_regrestore_log[0].undoneAt, 'Undo folds the entries back and marks the log');
}

await run();
if (HAS_FIX) { await gate(); await restore(); }
console.log(`\nREGFIX: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
