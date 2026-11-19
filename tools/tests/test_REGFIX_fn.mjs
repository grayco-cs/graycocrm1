// test_REGFIX.mjs [index.html] — patch REGFIX in node (vm), MADE-UP records only, the 11/19 04:15Z sequence:
//   a register with live supplier-bill lines + copies of them that were DELETED (tombstoned + gc_deleted_gcAcctRegister),
//   a fold cycle (C into Z, Z into C), and a real duplicate pair. Then the duplicate fold runs, then the deleted copies are
//   stripped (what the next sync / upload does). The live lines must still be there.
// Also: the out-of-date-copy gate (_gcStaleGate), the import guard, and that the bill-amount restore (REGFIX-AMT) is gone (owner 11/19).
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const FILE = path.resolve(process.argv[2] || 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const blockAt = (needle) => { const i = html.indexOf(needle); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const J = blockAt("if(window.__GC_PATCH_J__) return;"), G = blockAt('__GC_PATCH_STALEGATE__');
ok(J.length > 20000, 'index.html has patch J (fold / duplicate check)');
const HAS_FIX = G.length > 1000;
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

/* owner 11/19: the bill-amount restore is taken out (bill #373642's $49.19 is right — the $31,484.70 was a payment over several
   bills); the import guard stays */
async function amtfixGone(){
  const src = html;
  ok(!/__GC_PATCH_AMTFIX__/.test(src) && !/_gcBillAmtFix/.test(src), 'the bill-amount restore (REGFIX-AMT) is not in the page');
  ok(!/label: "Fix bill amounts the 11-13 import changed"/.test(src), 'no 💎 menu item "Fix bill amounts the 11-13 import changed"');
  ok(/window\._gcQbBillAmtHold = function/.test(src), 'the import guard (a re-import never changes a bill total) stays');
}
async function amtfix(){
  const AF = blockAt('__GC_PATCH_AMTFIX__');
  ok(!html.includes('_gcRegRestore'), 'the "Restore 44 register lines" action is gone (those lines were copies of money still on the register)');
  if (!AF) { ok(false, 'index.html has patch AMTFIX'); return; }
  const H = harness();
  vm.runInContext(J, H.ctx); H.tick(4);
  const W = H.win; vm.runInContext(AF, H.ctx);
  const F = W._gcBillAmtFix;
  /* the 11/13 shape: bill B1 changed 31,484.70 -> 49.19 (QB paid+open = 31,484.70) with three register lines;
     B2 changed 2,000 -> 3,750 with two lines; B3 changed but no line at the QuickBooks total; B4 never changed */
  const bill = (id, num, amt, was, extra) => Object.assign({ id, type: 'sub', source: 'quickbooks', qbKey: 'QB:bill:' + num + ':demo', invNum: num, sub: 'Demo Lumber', amt, status: 'paid', date: '2026-09-25' }, was == null ? {} : { qbAmountWas: was }, extra || {});
  H.store.invs = [bill('INVb1', '373642', 49.19, 31484.7, { amountPaid: 2297.91, openBalance: 29186.79 }), bill('INVb2', '85388', 3750, 2000), bill('INVb3', '1111', 80, 60), bill('INVb4', '2222', 500)];
  const R = (id, src, amount, amt) => ({ id, _id: id, srcInvId: src, amount, amt, date: '2026-11-05', desc: 'Sub paid: QuickBooks bill', type: 'expense', status: 'paid', source: 'subinvoice' });
  H.store.gcAcctRegister = [R('EXPq1', 'INVb1', 31484.7, 31484.7), R('EXPw1', 'INVb1', 49.19, 49.19), R('EXPs1', 'SUB_INVb1', 31484.7, 49.19),
    R('EXPq2', 'INVb2', 2000, 2000), R('EXPw2', 'INVb2', 3750, 3750), R('EXPw3', 'INVb3', 80, 80), R('EXPq4', 'INVb4', 500, 500)];
  const P = await F.plan();
  const p1 = P.find((p) => p.id === 'INVb1'), p3 = P.find((p) => p.id === 'INVb3');
  ok(P.length === 3 && !P.some((p) => p.id === 'INVb4'), 'the preview lists the bills the import changed (not the others)', P.map((p) => p.id));
  ok(p1 && p1.num === '373642' && p1.now === 49.19 && p1.was === 31484.7 && p1.paidOpen === 31484.7 && p1.agrees === true, 'preview: bill #, vendor, now, before, QuickBooks paid + open (agrees with before)', p1);
  ok(p1 && p1.keep === 'EXPq1' && p1.fold.map((f) => f.id).sort().join() === 'EXPs1,EXPw1', 'keeps the line at exactly the QuickBooks total; folds the import-amount line and the SUB_ copy (whose amt differs)', p1);
  ok(p3 && !p3.keep && p3.noKeep && !p3.fold.length, 'no line at exactly the QuickBooks total: nothing on the register is folded or changed for that bill', p3);
  ok(p1.regBefore === 63018.59 && p1.regAfter === 31484.7 && p1.costBefore === 49.19 && p1.costAfter === 31484.7, 'per-bill totals: register lines before / after, cost totals before / after', [p1.regBefore, p1.regAfter, p1.costBefore, p1.costAfter]);
  const T = await F.totals();
  ok(T.costBefore === 49.19 + 3750 + 80 && T.costAfter === 31484.7 + 2000 + 60, 'overall totals', T);
  const regBefore = JSON.stringify(H.store.gcAcctRegister), invBefore = JSON.stringify(H.store.invs);
  ok(JSON.stringify(H.store.gcAcctRegister) === regBefore, 'the preview writes nothing');
  const res = await F.apply();
  const inv = Object.fromEntries(H.store.invs.map((b) => [b.id, b]));
  ok(inv.INVb1.amt === 31484.7 && inv.INVb1._importAmt === 49.19 && inv.INVb2.amt === 2000 && inv.INVb3.amt === 60 && inv.INVb4.amt === 500, 'Fix: each bill back to its QuickBooks total, the import value kept in _importAmt', H.store.invs.map((b) => [b.id, b.amt]));
  const ids = H.store.gcAcctRegister.map((r) => r.id).sort().join();
  ok(ids === 'EXPq1,EXPq2,EXPq4,EXPw3', 'one register line per bill; the bill with no exact line is left alone', ids);
  ok((H.store.gc_folded || []).filter((f) => !f.unfolded).length === 3 && res.folded === 3, 'the extra lines are folded (kept in gc_folded), not deleted', res);
  ok(Array.isArray(H.store.gc_amtfix_log) && H.store.gc_amtfix_log.length === 1, 'the fix is logged in gc_amtfix_log');
  const again = await F.plan(); ok(again.length === 0, 'after the fix nothing is left to fix');
  const u = await F.undo(H.store.gc_amtfix_log[0].id);
  const ids2 = H.store.gcAcctRegister.map((r) => r.id).sort().join();
  ok(u.bills === 3 && ids2 === 'EXPq1,EXPq2,EXPq4,EXPs1,EXPw1,EXPw2,EXPw3', 'Undo: bills and folded lines back', [u, ids2]);
  ok(H.store.invs.find((b) => b.id === 'INVb1').amt === 49.19 && !('_importAmt' in H.store.invs.find((b) => b.id === 'INVb1')), 'Undo restores the bill amount exactly');

  /* the import never changes a QuickBooks bill total by itself */
  const hold = W._gcQbBillAmtHold;
  ok(typeof hold === 'function' && /amount conflict/.test(hold(bill('X', '1', 31484.7), 49.19)), 'a re-import that changes a QuickBooks bill total is held as a to-do');
  ok(hold(bill('X', '1', 100), 100) === '' && hold(Object.assign(bill('X', '1', 100), { type: 'client' }), 50) === '' && hold(Object.assign(bill('X', '1', 100), { source: '', qbKey: '' }), 50) === '', 'not held: same total, a client invoice, or a bill that did not come from QuickBooks');
  const QB = blockAt('function diffFor(rec, x, list, pid, ctx)');
  ok(/_gcQbBillAmtHold\(x, rec\.amount\)/.test(QB), 'the QuickBooks CSV import (QBCSV) asks the same rule before changing an amount');
  ok((J.match(/_gcQbBillAmtHold\(/g) || []).length >= 4, 'patch J import (bill and already-imported rows) asks it too');
}

await run();
if (HAS_FIX) { await gate(); await amtfixGone(); }
console.log(`\nREGFIX: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
