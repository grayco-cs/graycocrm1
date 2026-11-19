// test_ACCTAUTO.mjs <build-dir> — patch ACCTAUTO in the WHOLE CRM (offline harness_N: stubbed Supabase), made-up books shaped like the
// live ones (11/19: "why can't you just fix things" · "#373642 IS $49.19"):
//   1. the office opens the new build: the one-time fixes run BY THEMSELVES (no button) — the bill totals stay, qbAmountWas is retired,
//      #373642 reads paid / open $0, the leading-zero copy is archived (not deleted), the register shows each bill once (the extra lines
//      in gc_folded), the run is marked done in the cloud with its log;
//   2. Accounting → the TOP card: "🧾 Accounting fixes: N fixed by themselves" + "⚠ Needs a look: M";
//   3. ⚠ Needs a look lists what the evidence could not settle (the $92.19 / $5,160 bill, payment #1011, the uploaded + QuickBooks copy);
//      ✓ Done takes one off (shared, in the cloud);
//   4. 🧾 Accounting fixes log: ↩ Undo one item puts that bill back (cloud copy too); the others stay fixed;
//   5. a second desk (the owner) opens later: it does NOT run again (one log, one run).
// Made-up data only. Run: flock <scratchpad>/locks/browser.lock node tools/tests/test_ACCTAUTO.mjs <abs build dir>
import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, waitFor, resetCloud, cset, cget } = H;
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

const P = (id, o) => Object.assign({ id, type: 'Commercial Reno', status: 'completed', jobYear: 2026, contract: 0, created: '2026-03-02', createdAt: '2026-03-02T12:00:00.000Z', pm: 'Demo PM', subs: [], photos: [], checklist: [], followUps: [], customerNotes: '', address: '' }, o);
const PROJECTS = [
  P('PJ_BATH', { name: 'EAN- Bathroom remodel Mt Moriah', client: 'EAN Demo Holdings', autoPO: 'O229', contract: 15178.59, address: '2675 Mt Moriah' }),
  P('PJ_DECK', { name: 'Demo Deck Job', client: 'Deck Demo Customer', autoPO: 'K100', contract: 40000, status: 'active', created: '2026-11-20', createdAt: '2026-11-20T12:00:00.000Z' })];
const QB = (id, num, vk, o) => Object.assign({ id, type: 'sub', source: 'quickbooks', by: 'QuickBooks import', invNum: num, qbKey: 'QB:bill:' + num + ':' + vk, qbKeys: ['QB:bill:' + num + ':' + vk], status: 'paid', paid: true, pid: '', date: '2026-04-08', recvDate: '2026-04-08', importedHistory: true, noSend: true, sent: 'recorded', savedAt: '2026-11-05T22:00:52.136Z', updatedAt: '2026-11-13T16:15:09.863Z' }, o);
const INVS = [
  QB('BT_TAX', '3006118', 'demo', { sub: 'Demo Supply', amt: 74.64, qbAmountWas: 68.01 }),
  QB('BT_PAY', '1336', 'ross', { sub: 'Ross Demo Services', amt: 2555, qbAmountWas: 1200, qbKeys: ['QB:billpayment:2026-02-10:255500:ross'] }),
  QB('BT_OWN', '373642', 'tom', { sub: 'Tom Demo Lumber', amt: 49.19, qbAmountWas: 31484.7, date: '2026-09-25', qbKeys: ['QB:billpayment:1011:tom'], amountPaid: 2297.91, openBalance: 29186.79 }),
  QB('BT_LOOK', '2010088752-001', 'abc', { sub: 'ABC Demo Supply', amt: 92.19, qbAmountWas: 5160 }),
  QB('DUP_OLD', '9075376', 'farrell', { sub: 'FARRELL DEMO INC', amt: 85.2, date: '2026-02-17' }),
  QB('DUP_NEW', '009075376', 'farrell', { sub: 'FARRELL DEMO INC', amt: 129.94, date: '2026-02-17', savedAt: '2026-11-13T16:16:00.000Z' }),
  { id: 'UP_CR', type: 'sub', source: 'upload', sub: 'Central Demo Roofing', invNum: '0126', amt: 1690, date: '2026-08-19', recvDate: '2026-08-19', status: 'paid', paid: true, pid: 'PJ_BATH' },
  QB('QB_CR', '126', 'central', { sub: 'Central Demo Roofing', amt: 1600, date: '2026-08-19' })];
const RL = (id, src, amt, o) => Object.assign({ id, _id: id, srcInvId: src, amount: amt, amt, date: '2026-11-05', desc: 'Sub paid: QuickBooks bill', type: 'expense', category: 'Subcontractor', source: 'subinvoice', status: 'paid', pid: '' }, o);
const REG = [RL('R_PAY_OLD', 'BT_PAY', 1200), RL('R_PAY_NEW', 'BT_PAY', 2555), RL('R_OWN_OLD', 'BT_OWN', 31484.7), RL('R_OWN_NEW', 'BT_OWN', 49.19), RL('R_DUP_OLD', 'DUP_OLD', 85.2), RL('R_DUP_NEW', 'DUP_NEW', 129.94)];
const SUBS = [{ id: 'S1', name: 'Demo Supply', isSub: false, phone: '' }, { id: 'S2', name: 'Tom Demo Lumber', isSub: false, phone: '' }];
const USERS = [{ id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { id: 'u-wesley', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }];

resetCloud();
cset('projects', PROJECTS); cset('invs', INVS); cset('gcAcctRegister', REG); cset('gc_folded', []); cset('customers', [{ id: 'CU_EAN', name: 'EAN Demo Holdings' }]);
cset('users', USERS); cset('subs', SUBS); cset('vendors', SUBS); cset('expenses', []); cset('leads', []);
cset('gc_automation_pause', { on: true, at: '2026-11-04T12:00:00.000Z', by: 'owner' });

const A = await computer('office', { build, init: ['window.__GC_ACCTFIX_TEST__=1'] });
ok(await signIn(A, 'office@grayco-cs.com', 30000), 'the office is signed in to the CRM');
ok(await waitFor(A, n => (window._crm && (window._crm.projects || []).length >= n) || null, PROJECTS.length, 90000), 'the CRM loaded');
ok(await waitFor(A, () => !!(window._gcAcctFix && window._gcAcctFix.run), null, 30000), 'patch ACCTAUTO is loaded');

/* 1. it runs by itself */
let st = null; const t0 = Date.now();
while (Date.now() - t0 < 150000) { st = cget('gc_acctfix_state'); if (st && st.runs && st.runs['ACCTAUTO-1']) break; await sleep(1000); }
ok(st && st.runs && st.runs['ACCTAUTO-1'] && st.runs['ACCTAUTO-1'].items > 0, 'the one-time fixes ran BY THEMSELVES on the office desk (no button), marked done in the cloud', st);
await sleep(3000);
const I = cget('invs') || [], B = (id) => I.find((x) => x.id === id) || {};
ok(B('BT_OWN').amt === 49.19 && B('BT_OWN').qbAmountWas === 49.19 && B('BT_OWN')._qbAmountWasWrong === 31484.7 && B('BT_OWN').openBalance === 0, '#373642 stays $49.19, paid, open $0; $31,484.70 retired (cloud)', B('BT_OWN'));
ok(B('BT_TAX').amt === 74.64 && B('BT_TAX')._qbAmountWasWrong === 68.01, 'the tax bill keeps its QuickBooks total $74.64 (cloud)', B('BT_TAX'));
ok(B('BT_LOOK').qbAmountWas === 5160, 'the bill with no evidence is not touched', B('BT_LOOK'));
ok(B('DUP_OLD').type === 'archived' && B('DUP_OLD')._dupOf === 'DUP_NEW' && B('DUP_NEW').type === 'sub', 'the leading-zero copy is archived into the QuickBooks bill — not deleted (cloud)', [B('DUP_OLD'), B('DUP_NEW')]);
const R = (cget('gcAcctRegister') || []).map((r) => r._id || r.id);
ok(R.includes('R_PAY_NEW') && !R.includes('R_PAY_OLD') && R.includes('R_OWN_NEW') && !R.includes('R_OWN_OLD') && !R.includes('R_DUP_OLD'), 'the register shows each bill once, at its total (cloud)', R);
ok((cget('gc_folded') || []).filter((f) => /^ACCTAUTO-1/.test(f.rule)).length >= 3, 'the extra lines are kept in gc_folded', (cget('gc_folded') || []).map((f) => f.recordId));
const LOG = cget('gc_acctfix_log') || [];
ok(LOG.length === 1 && LOG[0].items.length >= 6 && LOG[0].items.every((i) => i.title && i.why), 'the 🧾 log is in the cloud: every fix with what and why', LOG.map((e) => e.items.length));

/* 2. Accounting → the top card */
await A.ev(() => window._setView('taxcenter')); await sleep(7000);
const card = await A.ev(() => { const m = document.querySelector('main'), c = document.querySelector('.af-mount'); return c ? { text: c.textContent, first: m && m.firstElementChild === c } : null; });
ok(card && /Accounting fixes:\s*\d+ fixed by themselves/.test(card.text) && /Needs a look: \d+/.test(card.text) && card.first, 'Accounting: the TOP card says what was fixed and what needs a look', card);

/* 3. ⚠ Needs a look */
await A.ev(() => document.querySelector('.af-mount [data-af="look"]').click()); await sleep(2500);
const lookTxt = await A.ev(() => (document.getElementById('af-ov') || {}).textContent || '');
ok(/2010088752-001/.test(lookTxt) && /#1011/.test(lookTxt) && /0126/.test(lookTxt), 'Needs a look: the unproven bill total, the payment that fits no bill, the uploaded + QuickBooks copy — one list', lookTxt.slice(0, 600));
const n0 = await A.ev(() => document.querySelectorAll('#af-ov [data-af="done"]').length);
await A.ev(() => document.querySelector('#af-ov [data-af="done"]').click()); await sleep(3000);
const n1 = await A.ev(() => document.querySelectorAll('#af-ov [data-af="done"]').length);
const lk = cget('gc_acctfix_look') || {};
ok(n1 === n0 - 1 && Object.keys(lk.done || {}).length === 1, '✓ Done takes it off the list (shared, in the cloud)', { n0, n1, done: lk.done });

/* 4. the log + Undo one */
await A.ev(() => document.querySelector('#af-ov .af-tabs [data-af="log"]').click()); await sleep(2500);
const logTxt = await A.ev(() => (document.getElementById('af-ov') || {}).textContent || '');
ok(/Accounting fixes log/.test(logTxt) && /#373642/.test(logTxt) && /↩ Undo/.test(logTxt), 'the 🧾 Accounting fixes log lists each fix with ↩ Undo', logTxt.slice(0, 400));
const undid = await A.ev(() => { const b = Array.from(document.querySelectorAll('#af-ov [data-af="undo"]')).find((x) => /3006118/.test(x.closest('tr').textContent)); if (!b) return false; b.click(); return true; });
await sleep(5000);
const I2 = cget('invs') || [], B2 = (id) => I2.find((x) => x.id === id) || {};
ok(undid && B2('BT_TAX').qbAmountWas === 68.01 && B2('BT_OWN').qbAmountWas === 49.19, '↩ Undo one: that bill is back as it was (cloud), the others stay fixed', [B2('BT_TAX').qbAmountWas, B2('BT_OWN').qbAmountWas]);
ok(((cget('gc_acctfix_log') || [])[0].items.find((i) => /3006118/.test(i.title)) || {}).undone, 'the log says it was undone');
await A.ev(() => document.querySelector('#af-ov [data-af="close"]').click());

/* 5. a second desk does not run it again */
const Bd = await computer('owner', { build, init: ['window.__GC_ACCTFIX_TEST__=1'] });
ok(await signIn(Bd, 'wjohnson@grayco-cs.com', 30000), 'the owner signs in on another computer');
await waitFor(Bd, () => !!(window._gcAcctFix), null, 60000); await sleep(25000);
const LOG2 = cget('gc_acctfix_log') || [];
ok(LOG2.length === 1 && (cget('gc_acctfix_state') || {}).runs['ACCTAUTO-1'].logId === LOG[0].id, 'the second desk does not run it again (one run, one log)', LOG2.map((e) => e.id));
ok(((cget('invs') || []).find((x) => x.id === 'BT_TAX') || {}).qbAmountWas === 68.01, '…and does not redo what was undone');

ok(!A.errs.concat(Bd.errs).some(e => /acctfix|ACCTAUTO|_gcAcctFix/i.test(e)), 'no page errors from ACCTAUTO', A.errs.concat(Bd.errs).slice(0, 5));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
await A.close(); await Bd.close();
process.exit(fail ? 1 : 0);
