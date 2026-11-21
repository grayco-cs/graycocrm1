// test_ACCTSTICK.mjs <build-dir> [shot-dir] — patch ACCTSTICK in the WHOLE CRM (offline harness_N: stubbed Supabase). Made-up data only.
// Owner 11/20: "There are things in accounting that keep coming back and messing up … needs to work flawlessly" + "When I click approve
// or any button physically, remember it's forever, so nothing from another computer can overwrite data."
// Each accounting to-do: act on the desk (admin) → a sync brings an OLDER copy (re-stamped newer, the way the pay-date stamper and an
// import re-save) → reload → the office's computer → the owner's phone: it stays decided. Also:
//   · an automatic fix an old copy had undone (a duplicate bill archived by ACCTAUTO back as a live bill) is put back by itself;
//   · ⚠ Needs a look: ✓ Done (with ↩ Undo), ✓ Use this job, an item settled another way leaves the list — the count goes down and
//     stays down, also when another computer writes its older list;
//   · Payment details: a check # edited by hand survives a QuickBooks re-import of the same bill; a CLEARED check # stays cleared;
//   · a PM approval and an office "Assign sub to job" survive an older copy and the admin's stale cache; a background write on a
//     computer (no click) cannot change a decided field; history bills stop counting as "to match".
// Run: flock <scratchpad>/locks/browser.lock node tools/tests/test_ACCTSTICK.mjs <abs build dir> [shot dir]
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, waitFor, resetCloud, cset, cget } = H;
const build = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const later = s => new Date(Date.now() + s * 1000).toISOString();

const P = (id, o) => Object.assign({ id, type: 'Residential', status: 'active', jobYear: 2026, contract: 20000, created: '2026-10-01', createdAt: '2026-10-01T12:00:00.000Z', pm: 'Demo PM', subs: [], photos: [], checklist: [], followUps: [], customerNotes: '', address: '' }, o);
const PROJECTS = [P('PJ1', { name: 'Demo Kitchen', client: 'Pat Demo', autoPO: 'T601', address: '100 Demo St' }), P('PJ2', { name: 'Demo Bath', client: 'Lee Demo', autoPO: 'B202', address: '200 Demo Ave' })];
const OLD = ago(3);
const INVS = () => [
  { id: 'SI1', type: 'sub', pid: 'PJ1', po: 'T601', sub: 'Demo Plumbing LLC', invNum: 'DP-55', amt: 1500, date: '2026-11-02', recvDate: '2026-11-02', status: 'paid', paid: true, paidDate: '2026-11-10', checkNo: '1001', desc: 'Rough plumbing', updatedAt: OLD },
  { id: 'SB2', type: 'sub', pid: 'PJ1', po: 'T601', sub: 'Demo Electric LLC', invNum: 'DE-9', amt: 2200, date: '2026-11-12', recvDate: '2026-11-12', status: 'received', desc: 'Rough electric', updatedAt: OLD },
  { id: 'SB3', type: 'sub', pid: '', sub: 'Demo Drywall LLC', invNum: 'DD-4', amt: 900, date: '2026-11-13', recvDate: '2026-11-13', status: 'received', desc: 'Drywall hang', updatedAt: OLD },
  { id: 'QH1', type: 'sub', pid: '', sub: 'Demo Supply', invNum: '7001', amt: 75.5, date: '2026-04-02', status: 'paid', paid: true, source: 'quickbooks', importedHistory: true, noSend: true, desc: 'QuickBooks bill #7001', updatedAt: OLD },
  /* ACCTAUTO archived DUP_A into DUP_B; an old copy re-stamped later made it a live bill again (the live #12128755 case) */
  { id: 'DUP_A', type: 'sub', _typeWas: 'sub', _dupOf: 'DUP_B', _archived: { at: ago(1), by: 'Automatic accounting fix', why: 'the same QuickBooks bill as #0123', rule: 'ACCTAUTO-1' }, pid: '', sub: 'Demo Paint Co', invNum: '123', amt: 24.9, date: '2026-10-15', status: 'received', source: 'quickbooks', updatedAt: ago(0.5) },
  { id: 'DUP_B', type: 'sub', pid: '', sub: 'Demo Paint Co', invNum: '0123', amt: 93.11, date: '2026-10-15', status: 'received', source: 'quickbooks', updatedAt: OLD },
  { id: 'LK1', type: 'client', pid: 'PJ2', client: 'Pat Demo', invNum: '1201', amt: 5000, date: '2026-10-20', status: 'sent', desc: 'Kitchen draw 1', updatedAt: OLD },
  { id: 'LK2', type: 'client', pid: 'PJ2', client: 'Lee Demo', invNum: '1202', amt: 3000, date: '2026-10-21', status: 'sent', desc: 'Bath draw 1', autoLinked: true, updatedAt: OLD },
  { id: 'LK3', type: 'sub', pid: 'PJ1', sub: 'Demo Supply', invNum: '7002', amt: 92.19, date: '2026-11-05', status: 'paid', paid: true, source: 'quickbooks', updatedAt: OLD }];
const QUEUE = () => [
  { id: 'invId:SB2', invId: 'SB2', pid: 'PJ1', sub: 'Demo Electric LLC', amt: 2200, status: 'pending_pm', matched: true, pmName: 'Demo PM', createdAt: 1793897358802 },
  { id: 'invId:SB3', invId: 'SB3', pid: '', sub: 'Demo Drywall LLC', amt: 900, status: 'needs_office_match', matched: false, createdAt: 1793897358802 },
  { id: 'invId:QH1', invId: 'QH1', pid: '', sub: 'Demo Supply', amt: 75.5, status: 'needs_office_match', matched: false, createdAt: 1793897358802 }];
const LOOK = () => ({ at: ago(1), done: {}, list: [
  { id: 'look:link:LK1', kind: 'jobpick', rule: 'INVJOBS-1', inv: 'LK1', ids: ['LK1'], cur: { pid: 'PJ2', name: 'Demo Bath' }, sug: { pid: 'PJ1', name: 'Demo Kitchen (T601)' }, alts: [], title: 'Invoice #1201 — Pat Demo ($5,000.00): on "Demo Bath" — not its job', amount: 5000, detail: 'Pat Demo\'s job is Demo Kitchen.' },
  { id: 'look:link:LK2', kind: 'jobpick', rule: 'INVJOBS-1', inv: 'LK2', ids: ['LK2'], cur: { pid: 'PJ2', name: 'Demo Bath' }, sug: { pid: 'PJ1', name: 'Demo Kitchen (T601)' }, alts: [], title: 'Invoice #1202 — Lee Demo ($3,000.00): on "Demo Bath" — is that right?', amount: 3000, detail: 'demo' },
  { id: 'look:billtotal:LK3', kind: 'billtotal', ids: ['LK3'], title: 'Bill #7002 — Demo Supply: is the total $92.19?', amount: 92.19, detail: 'No payment or tax math settles it — check the bill in QuickBooks.' },
  { id: 'look:payment:X1', kind: 'payment', ids: [], title: 'QuickBooks payment #1011 — $2,297.91 (demo): which bills did it pay?', amount: 2297.91, detail: 'Only so you know.' }] });
const LOG = [{ id: 'AFdemo1', runId: 'ACCTAUTO-1', at: ago(1), by: 'Owner Demo (automatic)', items: [{ id: 'dupbill:DUP_A', kind: 'dupbill', title: 'Bill #0123 — Demo Paint Co was in twice: the copy #123 ($24.90) is archived', why: 'demo', amount: 24.9,
  changes: [{ list: 'invs', id: 'DUP_A', before: { type: 'sub', _dupOf: null, _typeWas: null }, after: { type: 'archived', _dupOf: 'DUP_B', _typeWas: 'sub' } }], folds: [] }] }];
const USERS = [{ id: 'u-wesley', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { id: 'u-pm', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }];
resetCloud();
cset('projects', PROJECTS); cset('invs', INVS()); cset('expenses', []); cset('gcAcctRegister', []); cset('users', USERS); cset('leads', []); cset('customers', [{ id: 'CU1', name: 'Pat Demo' }, { id: 'CU2', name: 'Lee Demo' }]);
cset('subs', [{ id: 'S1', name: 'Demo Plumbing LLC' }, { id: 'S2', name: 'Demo Electric LLC', w9: true, coiExp: '2027-12-31', insExp: '2027-12-31', glExp: '2027-12-31' }, { id: 'S3', name: 'Demo Drywall LLC' }]); cset('vendors', [{ id: 'V1', name: 'Demo Supply', isSub: false }, { id: 'V2', name: 'Demo Paint Co', isSub: false }]);
cset('gc_sub_approvals', QUEUE()); cset('gc_acctfix_look', LOOK()); cset('gc_acctfix_log', LOG);
cset('gc_acctfix_state', { runs: { 'ACCTAUTO-1': { at: ago(1), by: 'Owner Demo', logId: 'AFdemo1', items: 1, look: 4 }, 'INVJOBS-1': { at: ago(1), by: 'Owner Demo', logId: 'AFdemo1', items: 0, look: 2 } } });
cset('gc_automation_pause', { on: true, at: '2026-11-04T12:00:00.000Z', by: 'owner' });

const inv = id => (cget('invs') || []).find(x => x.id === id) || {};
const q = id => (cget('gc_sub_approvals') || []).find(x => x.invId === id) || {};
async function until(fn, ms, kick){ const t0 = Date.now(); let v, i = 0; while (Date.now() - t0 < (ms || 20000)) { v = await fn(); if (v) return v; if (kick && ++i % 12 === 0) { try { await kick(); } catch (e) {} } await sleep(400); } return v; }
const INIT = ['window.__GC_ACCTFIX_TEST__=1'];
/* what one computer shows: the screen's list, its saved copy (IndexedDB), the queue in localStorage, the look list */
const view = (pg) => pg.evaluate(async () => {
  const c = window._crm || {}, L = (c.invs && c.invs.length ? c.invs : c.invoices) || [], f = id => L.find(x => x.id === id) || {};
  const disk = (await window.idbGet('invs')) || [], d = id => disk.find(x => x.id === id) || {};
  const Q = JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]'), qq = id => Q.find(x => x.invId === id) || {};
  const AF = window._gcAcctFix, st = AF && AF.state && AF.state(), lk = st && st.look;
  const open = lk ? (lk.list || []).filter(x => !(lk.done[x.id] && !lk.done[x.id].undone)).map(x => x.id) : null;
  const m = document.querySelector('.af-mount'); const cardN = m ? (/Needs a look: (\d+)/.exec(m.textContent) || [])[1] : null;
  return { SI1: f('SI1').checkNo, SI1d: d('SI1').checkNo, SB2: f('SB2').status, SB2d: d('SB2').status, SB3: f('SB3').pid, LK1: f('LK1').pid, LK1d: d('LK1').pid, LK2: f('LK2').pid, DUPA: f('DUP_A').type, DUPAd: d('DUP_A').type,
    qSB2: qq('SB2').status, qSB3: qq('SB3').status, qSB3pid: qq('SB3').pid, qQH1: qq('QH1').status, lookOpen: open, card: cardN, dec: window._gcDecisions && window._gcDecisions.stats(), dSB3: window._gcDecisions && window._gcDecisions.get('gc_sub_approvals', 'invId:SB3'), dSI1: window._gcDecisions && window._gcDecisions.get('invs', 'SI1') };
});

/* ══ 1. the desk (admin) ══ */
console.log('1. the desk (admin): act on each list');
const A = await computer('desk', { build, init: INIT });
ok(await signIn(A, 'wjohnson@grayco-cs.com', 30000), 'the admin is signed in on the desk');
ok(await waitFor(A, () => (window._crm && (window._crm.invoices || window._crm.invs || []).length >= 9 && window._gcDecisions && window._gcAcctFix && window._gcPayDetail) || null, null, 90000), 'the CRM loaded with patch ACCTSTICK');
const pg = A.page();
/* an automatic fix an old copy undid is put back by itself (once), and kept */
ok(await until(() => inv('DUP_A').type === 'archived', 60000), 'the duplicate bill the automatic fix archived (an old copy had made it live again) is archived again — in the cloud', inv('DUP_A'));
ok((await view(pg)).DUPA === 'archived', '…and on this desk\'s screen');
/* Accounting → ⚠ Needs a look */
await A.ev(() => window._setView('taxcenter')); await sleep(6000);
let v0 = await view(pg);
ok(v0.card === '4', 'Accounting → the top card: ⚠ Needs a look: 4', v0.card);
await pg.click('.af-mount [data-af="look"]'); await sleep(2500);
const rowsN = () => A.ev(() => document.querySelectorAll('#af-ov tr[data-look]').length);
ok(await rowsN() === 4, 'Needs a look lists 4 items, each in plain English with one button that settles it');
if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'acctstick_1_needs_a_look_before.png') });
/* ✓ Done → ↩ Undo → ✓ Done */
await pg.click('#af-ov tr[data-look="look:billtotal:LK3"] [data-af="done"]'); await sleep(2500);
ok(await rowsN() === 3 && await A.ev(() => !!document.querySelector('#gc-stick-undo [data-stick-undo]')), '✓ Done: off the list (3 left) and a small "↩ Undo" bar shows (no popup)');
if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'acctstick_2_done_with_undo.png') });
await pg.click('#gc-stick-undo [data-stick-undo]'); await sleep(2500);
ok(await rowsN() === 4 && (((cget('gc_acctfix_look') || {}).done || {})['look:billtotal:LK3'] || {}).undone === true, '↩ Undo puts it back on the list (shared: the cloud says undone)');
await pg.click('#af-ov tr[data-look="look:billtotal:LK3"] [data-af="done"]'); await sleep(2500);
ok(await until(() => { const d = ((cget('gc_acctfix_look') || {}).done || {})['look:billtotal:LK3']; return d && !d.undone; }, 15000), '✓ Done again: in the cloud');
/* ✓ Use this job (the guess preselected) */
await pg.click('#af-ov tr[data-look="look:link:LK1"] [data-af="usejob"]');
ok(await until(() => inv('LK1').pid === 'PJ1', 25000), '✓ Use this job: the invoice moves to Demo Kitchen (cloud)', inv('LK1'));
await sleep(1500);
ok(await rowsN() === 2 && await A.ev(() => /Undo/.test((document.getElementById('gc-stick-undo') || {}).textContent || '')), '…off the list (2 left), with ↩ Undo');
/* settled another way: the invoice moved on 🧹 Invoices to re-check → leaves Needs a look by itself */
await pg.mouse.click(700, 20);
await A.ev(() => window._gcJobMerge.moveTo('LK2', 'PJ1'));
ok(await until(() => inv('LK2').pid === 'PJ1', 20000), 'Invoices to re-check → Move to job: LK2 on Demo Kitchen (cloud)');
await A.ev(() => window._gcAcctFix.open('look')); await sleep(1500);
ok(await rowsN() === 1, 'Needs a look: the item whose invoice was moved another way left the list by itself (1 left)', await rowsN());
if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'acctstick_3_needs_a_look_after.png') });
await A.ev(() => window._gcAcctFix.close());
/* Payment details: check # 1001 → 1002 (by hand) */
await A.ev(() => window._setView('invoices')); await sleep(4000);
await A.ev(() => { const b = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim().startsWith('Sub Invoices')); if (b) b.click(); }); await sleep(2500);
await pg.click('main tr .gc-pd-btn[data-pd-open="SI1"]'); await sleep(900);
await pg.fill('#gc-pd [data-pd-f="ref"]', '1002'); await pg.click('#gc-pd [data-pd="save"]');
ok(await until(() => inv('SI1').checkNo === '1002', 25000), 'Payment details: check # 1001 → 1002 by hand (cloud)');
await pg.click('#gc-pd [data-pd="close"]').catch(() => {});
/* a PM approval (the Approve button's own call, right after a click) */
await pg.mouse.click(700, 20);
await A.ev(() => window._gcPmDecideSub('SB2', true, 'ok'));
ok(await until(() => q('SB2').status === 'pm_approved', 25000), 'Approve: the sub bill is approved (the queue, cloud)', q('SB2'));
/* history bills no longer "to match" */
ok(await until(() => q('QH1').status === 'recorded', 40000), 'a paid QuickBooks history bill stops counting as "Assign sub to job" (recorded, cloud)', q('QH1'));
await sleep(2500);
ok(await until(() => { const d = cget('gc_decisions'); return d && d.d && d.d.invs && d.d.invs.SI1 && d.d.invs.SI1.checkNo && d.d.invs.SI1.checkNo.v === '1002' && d.d.gc_sub_approvals && d.d.gc_sub_approvals['invId:SB2']; }, 20000), 'the decisions are in the shared ledger (gc_kv gc_decisions): who, when, what');

/* ══ 2. an OLDER copy synced from another computer (re-stamped newer: the stamper / an import) ══ */
console.log('2. an older copy from another computer, re-stamped newer');
const stale = INVS().map(r => Object.assign(r, { updatedAt: later(30) }, r.id === 'SI1' ? { by: 'QuickBooks import', source: 'quickbooks' } : {}));
cset('invs', stale);
cset('gc_sub_approvals', QUEUE().map(x => Object.assign(x, { updatedAt: later(30) })));
cset('gc_acctfix_look', LOOK());   /* another computer wrote its older list (no ✓ Done) */
await A.ev(() => window._gcPullNow && window._gcPullNow(true)); await sleep(6000);
await A.ev(() => window._gcAcctFix.open('look')); await sleep(2000);
let v1 = await view(pg);
ok(v1.SI1 === '1002' && v1.SI1d === '1002', 'the hand-entered check # 1002 stays (screen and disk) — not the import\'s old 1001', v1);
ok(v1.SB2 === 'approved' || v1.qSB2 === 'pm_approved', 'the approval stays approved', { SB2: v1.SB2, q: v1.qSB2 });
ok(v1.qSB2 === 'pm_approved' && v1.qQH1 === 'recorded', 'the queue keeps the approval and the settled history bill', v1);
ok(v1.LK1 === 'PJ1' && v1.LK1d === 'PJ1' && v1.LK2 === 'PJ1', 'the invoices stay on the job picked', v1);
ok(v1.DUPA === 'archived' && v1.DUPAd === 'archived', 'the archived duplicate stays archived', v1);
ok(await rowsN() === 1, 'Needs a look: still 1 (✓ Done kept although another computer wrote its older list)', await rowsN());
await A.ev(() => window._gcAcctFix.close());
ok(await until(() => inv('SI1').checkNo === '1002' && inv('LK1').pid === 'PJ1' && inv('DUP_A').type === 'archived' && q('SB2').status === 'pm_approved' && q('QH1').status === 'recorded', 45000, () => A.ev(() => window._gcPushAll && window._gcPushAll())), 'the cloud is put right again by this desk', { SI1: inv('SI1').checkNo, LK1: inv('LK1').pid, DUP: inv('DUP_A').type, SB2: q('SB2').status, QH1: q('QH1').status });
ok(await until(() => { const d = (cget('gc_acctfix_look') || {}).done || {}; return d['look:billtotal:LK3'] && !d['look:billtotal:LK3'].undone && d['look:link:LK1']; }, 30000, null), '…and the ✓ Done marks are back in the cloud\'s list', (cget('gc_acctfix_look') || {}).done);

/* ══ 3. reload ══ */
console.log('3. reload the desk');
await pg.reload({ waitUntil: 'domcontentloaded' });
ok(await waitFor(A, () => (window._crm && (window._crm.invoices || window._crm.invs || []).length >= 9 && window._gcAcctFix && window._gcAcctFix.state().look) || null, null, 90000), 'reloaded');
await A.ev(() => window._setView('taxcenter')); await sleep(7000);
let v2 = await view(pg);
ok(v2.SI1 === '1002' && v2.qSB2 === 'pm_approved' && v2.LK1 === 'PJ1' && v2.DUPA === 'archived' && v2.qQH1 === 'recorded', 'after a reload: every decision as it was', v2);
ok(v2.card === '1', 'after a reload: ⚠ Needs a look: 1 (the count stayed down)', v2.card);
if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'acctstick_4_accounting_after_reload.png') });
await A.ev(() => { const b = document.querySelector('[data-tab="k_match"]'); if (b) b.click(); }); await sleep(2500);
if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'acctstick_5_to_match_review.png') });
/* the admin's computer goes quiet (its cache stays in this browser) */
const deskCtx = A.ctx; await pg.close();

/* ══ 4. the office's computer ══ */
console.log('4. the office (office role) on her computer');
const PUTS = `(function(){ var o = IDBObjectStore.prototype.put; window.__puts = []; IDBObjectStore.prototype.put = function(v, k){ try { var kn = typeof k === 'string' ? k : (v && v.k) || ''; if (/^inv/.test(kn)) { var l = Array.isArray(v) ? v : (v && typeof v.v === 'string' ? JSON.parse(v.v) : null); var r = l && l.find && l.find(function(x){ return x && x.id === 'SI1'; }); window.__puts.push([new Date().toISOString().slice(14,23), this.transaction.db.name, kn, Array.isArray(v) ? 'arr' : 'obj', r ? r.checkNo : '-']); if (window.__puts.length > 60) window.__puts.shift(); } } catch (e) {} return o.apply(this, arguments); }; })();`;
const O = await computer('office', { build, init: INIT.concat([PUTS]) });
ok(await signIn(O, 'office@grayco-cs.com', 30000), 'the office is signed in');
ok(await waitFor(O, () => (window._crm && (window._crm.invoices || window._crm.invs || []).length >= 9 && window._gcDecisions && window._gcAcctFix) || null, null, 90000), 'the CRM loaded');
const po = O.page();
await sleep(5000);
let v3 = await view(po);
ok(v3.SI1 === '1002' && v3.LK1 === 'PJ1' && v3.LK2 === 'PJ1' && v3.DUPA === 'archived' && v3.qSB2 === 'pm_approved' && v3.qQH1 === 'recorded', 'the office sees every decision the admin made', v3);
await O.ev(() => window._setView('taxcenter')); await sleep(6000);
ok((await view(po)).card === '1', 'the office: ⚠ Needs a look: 1 (the same count as the admin)', (await view(po)).card);
/* a background write on this computer (no click: an import / a sweep re-saving an old copy) cannot change a decided field */
await O.ev(async () => { const L = (await window.idbGet('invs')).map(r => r.id === 'SI1' ? Object.assign({}, r, { checkNo: 'QB-777', by: 'QuickBooks import', updatedAt: new Date(Date.now() + 60000).toISOString() }) : r); await window.idbSet('invs', L); if (window._setInvoices) window._setInvoices(L); });
await sleep(2500);
let v4 = await view(po);
ok(v4.SI1 === '1002' && v4.SI1d === '1002', 'a background re-save on the office computer (an import of the same bill) cannot change the hand-entered check #', v4);
/* the office assigns a sub bill to its job (Assign Sub to Job → Confirm) */
await po.evaluate(() => window._gcOpenSubMatch('SB3')); await sleep(1200);
const hasModal = await po.evaluate(() => !!document.getElementById('_smJob'));
if (hasModal) { await po.selectOption('#_smJob', 'PJ2'); await po.click('#_smSave'); }
else { await po.mouse.click(700, 20); await po.evaluate(() => { const q2 = JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]').map(x => x.invId === 'SB3' ? Object.assign({}, x, { pid: 'PJ2', matched: true, certain: true, status: 'pending_pm' }) : x); localStorage.setItem('gc_sub_approvals', JSON.stringify(q2)); window._setInvoices(l => l.map(i => i.id === 'SB3' ? Object.assign({}, i, { pid: 'PJ2', _matchConfirmed: true }) : i)); }); }
ok(hasModal, 'Assign Sub to Job opens for the office');
ok(await until(() => q('SB3').status === 'pending_pm' && q('SB3').pid === 'PJ2', 30000, null), 'the office\'s match is in the cloud (pending the PM, on Demo Bath)', q('SB3'));
/* Payment details: the office CLEARS the check # (explicit clear) */
await O.ev(() => window._setView('invoices')); await sleep(4000);
await O.ev(() => { const b = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim().startsWith('Sub Invoices')); if (b) b.click(); }); await sleep(2500);
await po.click('main tr .gc-pd-btn[data-pd-open="SI1"]'); await sleep(900);
await po.fill('#gc-pd [data-pd-f="ref"]', ''); await po.click('#gc-pd [data-pd="save"]');
ok(await until(() => inv('SI1').checkNo === '', 25000), 'the office clears the check # (cloud: empty)', inv('SI1').checkNo);
await po.click('#gc-pd [data-pd="close"]').catch(() => {});
/* an older copy that still has the check # comes back from another computer */
await sleep(1500);
cset('invs', (cget('invs') || []).map(r => r.id === 'SI1' ? Object.assign({}, r, { checkNo: '1002', updatedAt: later(90) }) : r));
await O.ev(() => window._gcPullNow && window._gcPullNow(true)); await sleep(6000);
let v5 = await view(po);
ok(v5.SI1 === '' && v5.SI1d === '', 'a CLEARED check # stays cleared after an older copy with the number syncs in (screen and disk)', { SI1: v5.SI1, SI1d: v5.SI1d, puts: await po.evaluate(() => window.__puts.slice(-14)) });

/* ══ 5. the admin's stale cache comes back ══ */
console.log('5. the admin\'s computer comes back with its stale cache');
const pg2 = await deskCtx.newPage(); pg2.on('pageerror', e => A.errs.push(String(e && e.message || e).slice(0, 300)));
await pg2.goto('http://app.local/', { waitUntil: 'domcontentloaded' });
const stale0 = await pg2.evaluate(() => { const Q = JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]'); return (Q.find(x => x.invId === 'SB3') || {}).status; });
ok(await until(() => pg2.evaluate(() => !!(window._crm && (window._crm.invoices || window._crm.invs || []).length >= 9 && window._gcDecisions)), 90000), 'the admin\'s CRM opens again (its own cache)');
await pg2.evaluate(() => window._gcPushAll && window._gcPushAll()); await sleep(8000);
await pg2.evaluate(() => window._gcPullNow && window._gcPullNow(true)); await sleep(6000);
const v6 = await view(pg2);
ok(v6.qSB3 === 'pending_pm' && v6.qSB3pid === 'PJ2' && v6.SI1 === '', 'the admin\'s computer shows the office\'s match and the cleared check # (its stale cache could not undo them)', { staleWas: stale0, v6 });
ok(q('SB3').status === 'pending_pm' && inv('SI1').checkNo === '', 'the cloud still has the office\'s decisions after the admin\'s computer pushed', { q: q('SB3'), chk: inv('SI1').checkNo });

/* ══ 6. the owner's phone ══ */
console.log('6. the owner\'s phone');
const F = await computer('phone', { build, mobile: true, init: INIT.concat(["try{localStorage.setItem('grayco_view','field')}catch(e){}"]) });
ok(await signIn(F, 'wjohnson@grayco-cs.com', 30000), 'the owner signs in on the phone');
ok(await waitFor(F, () => (window._crm && (window._crm.invoices || window._crm.invs || []).length >= 9 && window._gcDecisions && window._gcAcctFix && window._gcAcctFix.state().look) || null, null, 90000), 'the phone loaded');
await sleep(4000);
const v7 = await view(F.page());
ok(v7.SI1 === '' && v7.LK1 === 'PJ1' && v7.LK2 === 'PJ1' && v7.DUPA === 'archived' && v7.qSB2 === 'pm_approved' && v7.qSB3 === 'pending_pm' && v7.qQH1 === 'recorded', 'the phone shows every decision (admin\'s and office\'s)', v7);
ok(v7.lookOpen && v7.lookOpen.filter(id => id !== 'look:link:LK2').length === 1, 'the phone: Needs a look has the same one item left (LK2 settled, LK1 + LK3 done)', v7.lookOpen);

const errs = A.errs.concat(O.errs, F.errs).filter(e => /ACCTSTICK|_gcDecisions|_gcStick|_gcDecide/i.test(e));
ok(errs.length === 0, 'no page errors from ACCTSTICK', errs.slice(0, 5));
console.log('\n' + (fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
await O.close(); await F.close(); await deskCtx.close().catch(() => {});
process.exit(fail ? 1 : 0);
