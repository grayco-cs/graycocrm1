// test_LUMPSUM.mjs [build-dir] [shot-dir] — patch LUMPSUM (owner 11/13: "some companies send 1 invoice as a lump sum but we have
// invoices all month and we need to mark off what jobs are paid when we send that 1 huge invoice; … when we pay those make sure we are
// marking off which jobs that lump sum is for").
// Offline. The CRM side = index.html's OWN scripts (patch LUMPSUM + the Accounting counting rules, _gcAcctRules) run in a page with small
// stubs for the CRM's lists (_crm, _setInvoices, _setExpenses, the register bridge) and an in-memory gc_kv. Made-up data only.
//   A. allocation (pure): oldest-first, ticked only, manual, partial, over / under, cents.
//   B. save: a supplier's 4 bills on 3 jobs paid by ONE check — each bill paid / partial, its payments[] row names the payment, the job's
//      cost row paid on that date, the register's "Sub Paid" row; the payment record lists every job + invoice; guards (over, unapplied,
//      already paid, not a bill); the customer side (one GC check for 3 of our invoices) → the Accounting rules count each collected.
//   C. undo restores each invoice (status, open balance, cost row, register), record marked undone; a second undo refused.
//   D. statement duplicate flag + "🔗 This is a statement for several jobs" (the statement set aside, not a cost; undo puts it back).
//   E. QuickBooks bill payment listing several bills → each linked record paid, qbKeys; a re-import is idempotent; an undone one is not redone.
//   F. who: the office allowed; a crew member refused (screen + API).
//   G. the screen: Invoices page buttons, pick vendor → open bills (job, #, QB #), ⚡ oldest first, live "applied $X of $Y — left / over",
//      Save disabled until it balances (or credit ticked), Save → record view, ↩ Undo from the list.
import fs from 'fs'; import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 1200) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PWDIR = process.env.PLAYWRIGHT_DIR || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright';
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const block = (re) => { const i = html.search(re); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
const S_LUMP = block(/__GC_PATCH_LUMPSUM__ \(owner 11\/13/), S_ACCT = block(/if\(window\.__GC_ACCT_K__\) return;/);
ok('A0 index.html has patch LUMPSUM (its own block, after the last existing patch) and the Accounting rules', S_LUMP.length > 20000 && S_ACCT.length > 10000 && html.indexOf('__GC_PATCH_LUMPSUM__') > html.indexOf('W.__GC_PATCH_SUBINVMAKE__ = true'), [S_LUMP.length, S_ACCT.length]);

/* ═════ the made-up CRM ═════ */
const P = [
  { id: 'PJ1', name: 'Demo Kitchen', client: 'Pat Demo', autoPO: 'T601', status: 'active' },
  { id: 'PJ2', name: 'Demo Bath', client: 'Lee Demo', autoPO: 'T602', status: 'active' },
  { id: 'PJ3', name: 'Demo Roof', client: 'Acme Property Mgmt', autoPO: 'T603', status: 'active' },
  { id: 'PJ4', name: 'Demo Deck', client: 'Acme Property Mgmt', autoPO: 'T604', status: 'active' }];
const bill = (id, pid, n, amt, d, extra) => Object.assign({ id, type: 'sub', pid, sub: 'Demo Lumber Supply, LLC', invNum: n, amt, recvDate: d, date: d, status: 'approved', po: (P.find(p => p.id === pid) || {}).autoPO || '', desc: 'Materials ' + n }, extra || {});
const INV0 = [
  bill('B1', 'PJ1', 'DL-101', 1200, '2026-10-02'),
  bill('B2', 'PJ2', 'DL-102', 800.5, '2026-10-09', { qbKey: 'QB:bill:DL-102:demo', qbNum: '' }),
  bill('B3', 'PJ1', 'DL-103', 450, '2026-10-16', { status: 'received' }),
  bill('B4', 'PJ3', 'DL-104', 2000, '2026-10-23'),
  bill('B9', 'PJ4', 'OTHER-1', 300, '2026-10-05', { sub: 'Other Sub Co' }),
  bill('BP', 'PJ1', 'DL-090', 99, '2026-09-01', { status: 'paid', paidDate: '2026-09-15' }),
  { id: 'C1', type: 'client', pid: 'PJ3', client: 'Acme Property Mgmt', invNum: '1001', amt: 5000, date: '2026-10-01', status: 'sent' },
  { id: 'C2', type: 'client', pid: 'PJ4', client: 'Acme Property Mgmt', invNum: '1002', amt: 3000, date: '2026-10-10', status: 'overdue' },
  { id: 'C3', type: 'client', pid: 'PJ3', client: 'Acme Property Mgmt, LLC', invNum: '1003', amt: 1500, date: '2026-10-20', status: 'partial', payments: [{ id: 'old1', amt: 500, amount: 500, date: '2026-10-25' }] },
  { id: 'C4', type: 'client', pid: 'PJ1', client: 'Pat Demo', invNum: '1004', amt: 900, date: '2026-10-11', status: 'sent' }];
const EXP0 = INV0.filter(x => x.type === 'sub').map(x => ({ id: 'E_' + x.id, pid: x.pid, subInvId: x.id, type: 'expense', vendor: x.sub, amt: x.amt, category: 'Subcontractor', status: x.status === 'paid' ? 'paid' : 'approved', date: x.date }));
const USERS = [{ id: 'u1', name: 'Wesley Demo', email: 'owner@grayco-cs.test', role: 'Admin' }, { id: 'u2', name: 'Brittany Demo', email: 'office@grayco-cs.test', role: 'Office Manager' }, { id: 'u3', name: 'Carl Crew', email: 'crew@grayco-cs.test', role: 'Crew' }];

const { chromium } = require(PWDIR);
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const KV = {}; let KVW = 0;
async function page(){
  const C = await browser.newContext({ viewport: { width: 1366, height: 860 }, serviceWorkers: 'block' });
  await C.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host === 'crm.test') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="app"></main></body></html>' });
    if (u.host === 'sb.test' && u.pathname === '/rest/v1/gc_kv') {
      if (rq.method() === 'POST') { const b = JSON.parse(rq.postData()); KV[b.key] = b.value; KVW++; return r.fulfill({ status: 201, body: '' }); }
      const k = (u.searchParams.get('key') || '').replace(/^eq\./, '');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KV[k] !== undefined ? [{ key: k, value: KV[k] }] : []) });
    }
    return r.fulfill({ status: 404, body: '' });
  });
  const pg = await C.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  pg.on('dialog', d => d.accept());
  await pg.goto('https://crm.test/');
  await pg.evaluate(([inv, exp, projects, users]) => {
    localStorage.setItem('grayco_sb_url', 'https://sb.test'); localStorage.setItem('grayco_sb_key', 'anon-test');
    window.__WHO = 'office';
    window.__GC_AUTH__ = { email: () => window.__WHO + '@grayco-cs.test', isAdmin: () => window.__WHO === 'owner' };
    window._gcFullAccess = () => window.__WHO === 'owner' || window.__WHO === 'office';
    window._crm = { invoices: inv, projects, expenses: exp, users, gcAcctRegister: [] };
    window._setInvoices = fn => { window._crm.invoices = fn(window._crm.invoices); };
    window._setExpenses = fn => { window._crm.expenses = fn(window._crm.expenses); };
    window.REG = [];
    window._gcAddToRegister = row => { const i = window.REG.findIndex(x => x.srcInvId === row.srcInvId); if (i >= 0) window.REG[i] = Object.assign({}, window.REG[i], row); else window.REG.push(Object.assign({ _id: 'R' + window.REG.length }, row)); return Promise.resolve(); };
    window._gcRemoveFromRegister = id => { window.REG = window.REG.filter(x => x.srcInvId !== id); return Promise.resolve(); };
  }, [JSON.parse(JSON.stringify(INV0)), JSON.parse(JSON.stringify(EXP0)), P, USERS]);
  await pg.addScriptTag({ content: S_ACCT });
  await pg.addScriptTag({ content: S_LUMP });
  return { C, pg, errs };
}
const { C, pg, errs } = await page();
const inv = id => pg.evaluate(id => JSON.parse(JSON.stringify(window._crm.invoices.find(x => x.id === id))), id);
const exp = id => pg.evaluate(id => JSON.parse(JSON.stringify(window._crm.expenses.find(x => x.subInvId === id) || null)), id);
const reg = id => pg.evaluate(id => JSON.parse(JSON.stringify(window.REG.find(x => x.srcInvId === id) || null)), id);

/* ─── A. allocation ─── */
{
  const A = await pg.evaluate(() => {
    const al = window._gcLumpSum.core.allocate, items = [{ id: 'x3', open: 450, date: '2026-10-16' }, { id: 'x1', open: 1200, date: '2026-10-02' }, { id: 'x2', open: 800.5, date: '2026-10-09' }];
    return { oldest: al(1500, items), exact: al(2450.5, items), over: al(3000, items), only: al(1000, items, { only: ['x2', 'x3'] }),
      manual: al(1000, items, { mode: 'manual', manual: { x1: 700, x3: 450 } }), manOver: al(1000, items, { mode: 'manual', manual: { x1: 1300 } }), manBig: al(700, items, { mode: 'manual', manual: { x1: 400, x2: 300 } }), cents: al(0.3, [{ id: 'a', open: 0.1, date: '1' }, { id: 'b', open: 0.2, date: '2' }]) };
  });
  ok('A1 oldest first: $1,500 → DL-101 (10/02) $1,200 in full, DL-102 (10/09) $300 partial ($500.50 still open), nothing on 10/16; balanced',
    A.oldest.lines.length === 2 && A.oldest.lines[0].id === 'x1' && A.oldest.lines[0].full && A.oldest.lines[1].id === 'x2' && A.oldest.lines[1].apply === 300 && A.oldest.lines[1].after === 500.5 && !A.oldest.lines[1].full && A.oldest.balanced && A.oldest.left === 0, A.oldest);
  ok('A2 exact total ($2,450.50) pays all three; $3,000 pays all three and leaves $549.50 unapplied', A.exact.balanced && A.exact.lines.every(l => l.full) && A.over.left === 549.5 && A.over.applied === 2450.5 && !A.over.balanced, [A.exact, A.over]);
  ok('A3 only the ticked ones (oldest first among them): $1,000 → DL-102 $800.50 + DL-103 $199.50', A.only.lines.map(l => l.id + ':' + l.apply).join() === 'x2:800.5,x3:199.5', A.only);
  ok('A4 manual: $700 (partial) + $450 = $1,150 applied of $1,000 → over by $150; more than a bill\'s open is capped and reported', A.manual.applied === 1150 && A.manual.over === 150 && !A.manual.balanced && A.manOver.errors.length === 1 && A.manOver.lines[0].apply === 1200 && A.manBig.left === 0 && A.manBig.balanced, [A.manual, A.manOver]);
  ok('A5 cents are exact (0.1 + 0.2 = 0.3, balanced)', A.cents.balanced && A.cents.applied === 0.3, A.cents);
}

/* ─── B. save: supplier side ─── */
let L1;
{
  const g = await pg.evaluate(() => ({
    over: window._gcLumpSum.save({ side: 'pay', party: 'Demo Lumber Supply, LLC', amount: 1000, lines: [{ invId: 'B1', amount: 1200 }] }),
    left: window._gcLumpSum.save({ side: 'pay', party: 'Demo Lumber Supply, LLC', amount: 2000, lines: [{ invId: 'B1', amount: 1200 }] }),
    paid: window._gcLumpSum.save({ side: 'pay', party: 'Demo Lumber Supply, LLC', amount: 99, lines: [{ invId: 'BP', amount: 99 }] }),
    cust: window._gcLumpSum.save({ side: 'pay', party: 'x', amount: 900, lines: [{ invId: 'C4', amount: 900 }] }),
    big: window._gcLumpSum.save({ side: 'pay', party: 'x', amount: 1300, lines: [{ invId: 'B1', amount: 1300 }] }),
    none: window._gcLumpSum.save({ side: 'pay', party: 'x', amount: 10, lines: [] }) }));
  ok('B1 guards: more than the payment, money left unapplied (no credit ticked), an already-paid bill, a customer invoice on the pay side, more than a bill\'s open, nothing ticked → refused, nothing written',
    !g.over.ok && /over the payment/.test(g.over.error) && !g.left.ok && /not applied/.test(g.left.error) && !g.paid.ok && /already paid/.test(g.paid.error) && !g.cust.ok && /not a bill/.test(g.cust.error) && !g.big.ok && /more than its open/.test(g.big.error) && !g.none.ok && KVW === 0, g);
  const r = await pg.evaluate(() => window._gcLumpSum.save({ side: 'pay', party: 'Demo Lumber Supply, LLC', amount: 3500, date: '2026-11-05', method: 'check', checkNo: '4417', ref: 'Oct statement', stmtNo: 'ST-10',
    lines: [{ invId: 'B1', amount: 1200 }, { invId: 'B2', amount: 800.5 }, { invId: 'B3', amount: 450 }, { invId: 'B4', amount: 1049.5 }] }));
  L1 = r.id;
  await sleep(300);
  const b1 = await inv('B1'), b2 = await inv('B2'), b3 = await inv('B3'), b4 = await inv('B4'), b9 = await inv('B9');
  ok('B2 one $3,500 check #4417 → DL-101, DL-102, DL-103 paid (status paid, paidDate 11/05, check # on the bill, open 0); DL-104 partial ($950.50 still open); Other Sub Co untouched',
    r.ok && [b1, b2, b3].every(x => x.status === 'paid' && x.paid === true && x.paidDate === '2026-11-05' && x.openBalance === 0 && x.checkNo === '4417') && b4.status === 'partial' && b4.openBalance === 950.5 && b4.amountPaid === 1049.5 && !b4.paid && b9.status === 'approved' && !b9.payments, { r, b1, b4 });
  const pr = b1.payments[0];
  ok('B3 each bill\'s payments[] row names the ONE payment (lumpId, amount applied, date, check #, by) and keeps the bill\'s state before', b1.payments.length === 1 && pr.lumpId === L1 && pr.amount === 1200 && pr.amt === 1200 && pr.date === '2026-11-05' && pr.checkNo === '4417' && pr.by === 'Brittany Demo' && pr.prev.status === 'approved' && b4.payments[0].amount === 1049.5 && b1.lumpIds[0] === L1, b1);
  const e1 = await exp('B1'), e4 = await exp('B4'), g1 = await reg('B1'), g3 = await reg('B3'), g4 = await reg('B4');
  ok('B4 the job P&L: each paid bill\'s cost row is paid on 11/05 (Demo Kitchen ×2, Demo Bath); the partly paid one stays approved; the register has "Sub Paid" for each paid bill (dated 11/05, the check in its text)',
    e1.status === 'paid' && e1.paidDate === '2026-11-05' && e4.status === 'approved' && g1 && g1.status === 'paid' && g1.date === '2026-11-05' && g1.pid === 'PJ1' && /Sub Paid/.test(g1.desc) && /#4417/.test(g1.desc) && g3 && g3.pid === 'PJ1' && !g4, { e1, e4, g1, g4 });
  const rec = await pg.evaluate(id => window._gcLumpSum.list().find(x => x.id === id), L1), kv = JSON.parse(KV.gc_lump_payments || '[]').find(x => x.id === L1);
  ok('B5 the payment record (gc_kv gc_lump_payments) lists every job + invoice it covered: Demo Kitchen DL-101 + DL-103, Demo Bath DL-102, Demo Roof DL-104 (partial, $950.50 open after); $3,500, check #4417, ST-10',
    rec && kv && kv.amount === 3500 && kv.applied.length === 4 && kv.applied.map(a => a.job + '|' + a.invNum + '|' + a.amount).join() === 'Demo Kitchen|DL-101|1200,Demo Bath|DL-102|800.5,Demo Kitchen|DL-103|450,Demo Roof|DL-104|1049.5' && kv.applied[3].full === false && kv.applied[3].openAfter === 950.5 && kv.checkNo === '4417' && kv.stmtNo === 'ST-10' && kv.credit === 0 && kv.by === 'Brittany Demo', kv);
  /* a second payment finishes DL-104 */
  const r2 = await pg.evaluate(() => window._gcLumpSum.save({ side: 'pay', party: 'Demo Lumber Supply, LLC', amount: 1000, date: '2026-11-12', method: 'ach', ref: 'ACH 77', lines: [{ invId: 'B4', amount: 950.5 }], keepCredit: true }));
  await sleep(300);
  const b4b = await inv('B4'), kv2 = JSON.parse(KV.gc_lump_payments).find(x => x.id === r2.id);
  ok('B6 the next payment finishes the partial one (paid 11/12, two payment rows) and the $49.50 not applied is kept as a credit on the record', r2.ok && b4b.status === 'paid' && b4b.paidDate === '2026-11-12' && b4b.payments.length === 2 && kv2.credit === 49.5 && (await exp('B4')).status === 'paid', { b4b, kv2 });
}
/* ─── B (customer side) ─── */
let LC;
{
  const r = await pg.evaluate(() => window._gcLumpSum.save({ side: 'receive', party: 'Acme Property Mgmt', amount: 9000, date: '2026-11-06', method: 'check', checkNo: '88120', lines: [{ invId: 'C1', amount: 5000 }, { invId: 'C2', amount: 3000 }, { invId: 'C3', amount: 1000 }] }));
  LC = r.id; await sleep(300);
  const c1 = await inv('C1'), c3 = await inv('C3'), c4 = await inv('C4');
  const coll = await pg.evaluate(() => { const R = window._gcAcctRules; const I = id => window._crm.invoices.find(x => x.id === id); return { c1: R.collected(I('C1')), c2: R.collected(I('C2')), c3: R.collected(I('C3')), rc: R.receipts(I('C1')) }; });
  const rg = await reg('C2');
  ok('B7 the customer side: one $9,000 check from the property manager → invoices 1001, 1002, 1003 (it had $500 already) paid; Pat Demo\'s 1004 untouched; the Accounting rules count each collected ($5,000 / $3,000 / $1,500, received 11/06); "Client Payment" in the register',
    r.ok && c1.status === 'paid' && c3.status === 'paid' && c3.payments.length === 2 && c4.status === 'sent' && coll.c1 === 5000 && coll.c2 === 3000 && coll.c3 === 1500 && coll.rc[0].date === '2026-11-06' && rg && rg.isIncome === true && rg.direction === 'in' && /Client Payment/.test(rg.desc), { r, coll, rg });
  const pties = await pg.evaluate(() => { const L = window._crm.invoices; return [window._gcLumpSum.core.sameParty('Acme Property Mgmt, LLC', 'acme property mgmt'), window._gcLumpSum.core.sameParty('Johnson', 'Johnson Plumbing')]; });
  ok('B8 the same customer however it is written ("Acme Property Mgmt, LLC" = "acme property mgmt"); different companies are not merged ("Johnson" ≠ "Johnson Plumbing")', pties[0] === true && pties[1] === false, pties);
}

/* ─── C. undo ─── */
{
  const u = await pg.evaluate(id => window._gcLumpSum.undo(id), L1);
  await sleep(400);
  const b1 = await inv('B1'), b3 = await inv('B3'), b4 = await inv('B4'), e1 = await exp('B1'), g1 = await reg('B1');
  ok('C1 ↩ Undo the $3,500 check: DL-101 back to approved (no payments, no paidDate, no check #), DL-103 back to received; its cost row back to approved; the register row back to an unpaid "Sub Invoice"',
    u.ok && b1.status === 'approved' && !b1.payments && !b1.paidDate && !b1.paid && !('checkNo' in b1) && b1.openBalance === undefined && b3.status === 'received' && e1.status === 'approved' && !e1.paidDate && g1.status === 'pending' && /Sub Invoice/.test(g1.desc), { u, b1, e1, g1 });
  ok('C2 DL-104 (paid since by the 11/12 ACH too) keeps that payment: $950.50 paid, $1,049.50 open again, partial', b4.status === 'partial' && b4.payments.length === 1 && b4.payments[0].amount === 950.5 && b4.openBalance === 1049.5 && (await exp('B4')).status === 'approved', b4);
  const kv = JSON.parse(KV.gc_lump_payments).find(x => x.id === L1), again = await pg.evaluate(id => window._gcLumpSum.undo(id), L1);
  ok('C3 the record is kept, marked undone (by, when); a second undo is refused', kv.voided === true && kv.voidedBy === 'Brittany Demo' && !again.ok && /already/.test(again.error), { kv, again });
  const uc = await pg.evaluate(id => window._gcLumpSum.undo(id), LC), c3 = await inv('C3'), c1 = await inv('C1');
  ok('C4 undo on the customer side: 1001 back to sent; 1003 back to partial with only its earlier $500; the "Client Payment" register row removed', uc.ok && c1.status === 'sent' && !c1.payments && c3.status === 'partial' && c3.payments.length === 1 && c3.payments[0].id === 'old1' && !(await reg('C1')), { c1, c3 });
}

/* ─── D. statement duplicate flag ─── */
{
  /* DL-101 $1,200 + DL-102 $800.50 + DL-103 $450 + DL-104 $1,049.50 open = $3,500 … the e-mailed statement for the month */
  await pg.evaluate(() => { window._crm.invoices.push({ id: 'BS', type: 'sub', pid: '', sub: 'Demo Lumber Supply LLC', invNum: 'STMT-OCT', amt: 3500, recvDate: '2026-11-01', date: '2026-11-01', status: 'received', desc: 'Monthly statement' }); window._crm.expenses.push({ id: 'E_BS', pid: 'PJ1', subInvId: 'BS', type: 'expense', amt: 3500, status: 'pending' }); window.REG.push({ srcInvId: 'SUB_BS', amt: 3500 }); });
  const F = await pg.evaluate(() => window._gcLumpSum.core.dupStatements(window._crm.invoices).map(f => ({ id: f.id, jobs: f.jobs, why: f.why })));
  ok('D1 a $3,500 "statement" bill from the same vendor (written "Demo Lumber Supply LLC") = its 4 open per-job bills → flagged (only it, not the bills it repeats)', F.length === 1 && F[0].id === 'BS' && F[0].jobs.slice().sort().join() === 'B1,B2,B3,B4' && /4 other open bills/.test(F[0].why), F);
  await pg.evaluate(() => window._gcLumpSum.openStatement('BS'));
  const sh = await pg.evaluate(() => { const o = document.getElementById('gc-lump'); return { banner: !!o.querySelector('[data-lp="stmtbanner"]'), amt: o.querySelector('[data-lp="amount"]').value, rows: o.querySelectorAll('tr[data-id]').length, ticked: o.querySelectorAll('tr.on').length, sum: o.querySelector('[data-lp="sum"]').textContent, save: o.querySelector('[data-lp="save"]').disabled }; });
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'lumpsum_d2_statement.png') });
  ok('D2 "🔗 This is a statement for several jobs" opens the same screen: the banner, amount $3,500, the 4 per-job bills ticked (the statement itself not listed), "✓ balanced"', sh.banner && sh.amt === '3500' && sh.rows === 4 && sh.ticked === 4 && /✓ balanced/.test(sh.sum) && !sh.save, sh);
  await pg.click('#gc-lump [data-lp="save"]'); await sleep(300);
  const bs = await inv('BS'), b1 = await inv('B1'), ebs = await exp('BS'), view = await pg.evaluate(() => (document.querySelector('#gc-lump [data-lp="record"]') || {}).innerText || '');
  ok('D3 saved: the 4 bills paid; the statement is set aside (void, isStatement, not a cost: its cost row void, its register rows gone) — the month is counted once; the record view lists every job',
    b1.status === 'paid' && bs.status === 'void' && bs.isStatement === true && ebs.status === 'void' && !(await reg('SUB_BS')) && /Demo Roof/.test(view) && /Demo Bath/.test(view) && /set aside/.test(view), { bs, ebs, view: view.slice(0, 300) });
  const F2 = await pg.evaluate(() => window._gcLumpSum.core.dupStatements(window._crm.invoices).length);
  const lid = bs.statementLump; const u = await pg.evaluate(id => window._gcLumpSum.undo(id), lid);
  const bs2 = await inv('BS'), ebs2 = await exp('BS');
  ok('D4 no flag after; undo puts the statement back as it was (received, its cost row pending again) and the bills open again', F2 === 0 && u.ok && bs2.status === 'received' && !bs2.isStatement && ebs2.status === 'pending' && (await inv('B1')).status === 'approved', { bs2, ebs2 });
  await pg.evaluate(() => { window._crm.invoices = window._crm.invoices.filter(x => x.id !== 'BS'); window._crm.expenses = window._crm.expenses.filter(x => x.subInvId !== 'BS'); });
  const F3 = await pg.evaluate(() => { const I = window._crm.invoices.concat([{ id: 'BX', type: 'sub', pid: 'PJ2', sub: 'Demo Lumber Supply, LLC', invNum: 'DL-200', amt: 1650, date: '2026-10-30', status: 'received' }]); return window._gcLumpSum.core.dupStatements(I).map(f => f.id + ':' + f.jobs.slice().sort().join('+')); });
  ok('D5 a bill equal to SOME of the vendor\'s open bills (DL-101 $1,200 + DL-103 $450 = $1,650) is flagged with exactly those', F3.length === 1 && F3[0] === 'BX:B1+B3', F3);
}

/* ─── E. QuickBooks bill payment that lists several bills ─── */
{
  const q = { key: 'QB:billpayment:5521:demo', kind: 'billpayment', name: 'Demo Lumber Supply', amount: 2000.5, date: '2026-11-08', num: '5521', applied: [{ num: 'DL-101', amount: 1200 }, { num: 'DL-102', amount: 800.5 }] };
  const a = await pg.evaluate(q => { const x = window._gcLumpSum.applyQb(q); delete x.saved; return x; }, q); await sleep(300);
  const b1 = await inv('B1'), b2 = await inv('B2');
  ok('E1 a QuickBooks bill payment listing DL-101 + DL-102 → both paid on 11/08 the same way (payments[] row, cost row paid, register), its qbKey on each; vendor name as QuickBooks writes it',
    a.ok && b1.status === 'paid' && b1.paidDate === '2026-11-08' && b2.status === 'paid' && b1.qbKeys.indexOf(q.key) >= 0 && b2.qbKeys.indexOf(q.key) >= 0 && b2.qbKeys.indexOf('QB:bill:DL-102:demo') < 0 && b1.payments[0].lumpId === a.id && (await exp('B2')).status === 'paid', { a, b1 });
  const a2 = await pg.evaluate(q => window._gcLumpSum.applyQb(q), q), n = JSON.parse(KV.gc_lump_payments).filter(x => x.qbKey === q.key).length, b1b = await inv('B1');
  ok('E2 a re-import is idempotent: "already", still one record, one payment row on the bill', a2.ok && a2.already && n === 1 && b1b.payments.length === 1, { a2, n });
  await pg.evaluate(id => window._gcLumpSum.undo(id), a.id);
  const a3 = await pg.evaluate(q => window._gcLumpSum.applyQb(q), q);
  ok('E3 once a person undid it, a re-import does not put it back', a3.ok && a3.skipped && (await inv('B1')).status === 'approved', a3);
  const a4 = await pg.evaluate(() => window._gcLumpSum.applyQb({ key: 'QB:billpayment:5522:demo', kind: 'billpayment', name: 'Demo Lumber Supply', amount: 500, date: '2026-11-09', num: '5522', applied: [{ num: 'DL-999', amount: 500 }] }));
  const a5 = await pg.evaluate(() => window._gcLumpSum.applyQb({ key: 'QB:billpayment:5523:demo', kind: 'billpayment', name: 'Demo Lumber Supply', amount: 500, date: '2026-11-09', num: '5523' }));
  ok('E4 a bill number not in the CRM, or a payment that does not list its bills → nothing guessed', !a4.ok && /DL-999/.test(a4.why) && !a5.ok, [a4, a5]);
  /* through the CSV import hook */
  await pg.evaluate(() => { window._gcQbCsvApply = async function(plan){ window.__qbRan = (window.__qbRan || 0) + 1; return { ok: true }; }; });
  await sleep(4500);
  const plan = { rows: [{ action: 'todo', rec: { key: 'QB:payment:9001:acme', kind: 'payment', name: 'Acme Property Mgmt', amount: 8000, date: '2026-11-10', num: '9001', applied: [{ num: '1001', amount: 5000 }, { num: '1002', amount: 3000 }] } }] };
  await pg.evaluate(p => window._gcQbCsvApply(p), plan); await sleep(300); await pg.evaluate(p => window._gcQbCsvApply(p), plan); await sleep(300);
  const c1 = await inv('C1'), c2 = await inv('C2'), nq = JSON.parse(KV.gc_lump_payments).filter(x => x.qbKey === 'QB:payment:9001:acme').length;
  ok('E5 the QuickBooks CSV import (wrapped): a customer payment row naming invoices 1001 + 1002 marks both paid; imported twice → one record', c1.status === 'paid' && c2.status === 'paid' && c1.payments.length === 1 && nq === 1 && (await pg.evaluate(() => window.__qbRan)) === 2, { c1, nq });
}

/* ─── F. who ─── */
{
  await pg.evaluate(() => { window.__WHO = 'crew'; });
  const r = await pg.evaluate(() => [window._gcLumpSum.save({ side: 'pay', party: 'x', amount: 1, lines: [{ invId: 'B3', amount: 1 }] }), window._gcLumpSum.undo('anything'), window._gcLumpSum.open({ side: 'pay' })]);
  const txt = await pg.evaluate(() => document.getElementById('gc-lump').innerText);
  await pg.evaluate(() => { window._gcLumpSum.paint(); });
  const bars = await pg.evaluate(() => document.querySelectorAll('.gc-lumpbar').length);
  ok('F1 a crew member is refused: save / undo say "Only admins and the office", the screen says so, no buttons', !r[0].ok && /Only admins and the office/.test(r[0].error) && !r[1].ok && r[2].refused && /Only admins and the office/.test(txt) && bars === 0, { r, txt });
  await pg.evaluate(() => { document.getElementById('gc-lump').remove(); window.__WHO = 'office'; });
}

/* ─── G. the screen ─── */
{
  await pg.evaluate(() => { document.getElementById('app').innerHTML = '<div><div><div><h1>Invoices</h1><p>PO# required · Sub invoices due by the 25th of each month · Pay on Friday</p></div></div><table><tr><th>PO#</th></tr></table></div>'; window._gcLumpSum.paint(); });
  const bar = await pg.evaluate(() => [...document.querySelectorAll('.gc-lumpbar button')].filter(b => b.style.display !== 'none').map(b => b.textContent));
  ok('G1 the Invoices page (Sub / Supplier / client tabs) has 💵 Pay several invoices at once · 💰 Record one payment for several invoices · 🗂 Lump-sum payments (+ 📒 / 🧾 when LUMPACCT is loaded) (office)', bar.length === 5 && /Pay several invoices at once/.test(bar[0]) && /Record one payment for several invoices/.test(bar[1]), bar);
  await pg.click('.gc-lumpbar [data-lump="pay"]');
  const opts = await pg.evaluate(() => [...document.querySelectorAll('#gc-lump [data-lp="party"] option')].map(o => o.textContent));
  await pg.selectOption('#gc-lump [data-lp="party"]', { index: opts.findIndex(t => /^Demo Lumber/.test(t)) });
  const rows = await pg.evaluate(() => [...document.querySelectorAll('#gc-lump tr[data-id]')].map(tr => tr.getAttribute('data-id') + '|' + tr.innerText.replace(/\s+/g, ' ')));
  ok('G2 pick the vendor (list: name — N open · $) → every open bill of theirs on every job, oldest first (job + PO, #, QB #, date, amount, open, status)', opts.some(t => /^Demo Lumber Supply, LLC — 4 open · \$3,500\.00$/.test(t)) && rows.length === 4 && rows[0].startsWith('B1|') && /Demo Kitchen · T601/.test(rows[0]) && /DL-101/.test(rows[0]) && rows[3].startsWith('B4|') && /\$1,049\.50/.test(rows[3]), { opts, rows });
  await pg.fill('#gc-lump [data-lp="amount"]', '2500');
  await pg.click('#gc-lump [data-lp="auto"]');
  let sum = await pg.evaluate(() => ({ t: document.querySelector('#gc-lump [data-lp="sum"]').textContent, dis: document.querySelector('#gc-lump [data-lp="save"]').disabled, ap: [...document.querySelectorAll('#gc-lump [data-lp="ap"]')].map(i => i.value) }));
  ok('G3 ⚡ Apply oldest first with $2,500: $1,200 + $800.50 + $450 + $49.50 → "Applied $2,500.00 of $2,500.00 — ✓ balanced", Save on', /Applied \$2,500\.00 of \$2,500\.00 — ✓ balanced/.test(sum.t) && !sum.dis && sum.ap.join() === '1200.00,800.50,450.00,49.50', sum);
  await pg.fill('#gc-lump tr[data-id="B4"] [data-lp="ap"]', '149.50');
  sum = await pg.evaluate(() => ({ t: document.querySelector('#gc-lump [data-lp="sum"]').textContent, dis: document.querySelector('#gc-lump [data-lp="save"]').disabled }));
  ok('G4 typed $149.50 on one → "over by $100.00", Save off', /over by \$100\.00/.test(sum.t) && sum.dis, sum);
  await pg.click('#gc-lump tr[data-id="B4"] [data-lp="tick"]');
  sum = await pg.evaluate(() => ({ t: document.querySelector('#gc-lump [data-lp="sum"]').textContent, dis: document.querySelector('#gc-lump [data-lp="save"]').disabled, cr: !!document.querySelector('#gc-lump [data-lp="credit"]') }));
  ok('G5 unticked → "$49.50 left", Save off until "keep as a credit" is ticked', /\$49\.50 left/.test(sum.t) && sum.dis && sum.cr, sum);
  await pg.check('#gc-lump [data-lp="credit"]');
  await pg.fill('#gc-lump [data-lp="checkNo"]', '4500');
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'lumpsum_g5_screen.png') });
  sum = await pg.evaluate(() => document.querySelector('#gc-lump [data-lp="save"]').disabled);
  await pg.click('#gc-lump [data-lp="save"]'); await sleep(300);
  const view = await pg.evaluate(() => (document.querySelector('#gc-lump [data-lp="record"]') || {}).innerText || '');
  const b2 = await inv('B2');
  ok('G6 Save → the record view: $2,500.00 — Demo Lumber Supply, check #4500, every job + invoice, the $49.50 credit; the bills are paid', !sum && /\$2,500\.00/.test(view) && /#4500/.test(view) && /DL-101/.test(view) && /Demo Bath/.test(view) && /\$49\.50 was not applied/.test(view) && b2.status === 'paid' && b2.checkNo === '4500', view.slice(0, 400));
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'lumpsum_g6_record.png') });
  await pg.click('#gc-lump [data-lp="list"]'); await sleep(200);
  const lst = await pg.evaluate(() => [...document.querySelectorAll('#gc-lump tr[data-lid]')].map(t => t.innerText.replace(/\s+/g, ' ')));
  ok('G7 🗂 Lump-sum payments lists them (newest first; the undone ones marked)', lst.length >= 5 && /\$2,500\.00/.test(lst[0]) && lst.some(t => /undone/.test(t)), lst);
  await pg.click('#gc-lump tr[data-lid] [data-lp="show"]'); await sleep(100);
  await pg.click('#gc-lump [data-lp="undo"]'); await sleep(300);
  ok('G8 ↩ Undo from the screen: the bills open again', (await inv('B2')).status === 'approved' && (await inv('B1')).status === 'approved', await inv('B2'));
  await pg.evaluate(() => { document.getElementById('gc-lump').remove(); document.getElementById('app').innerHTML = ''; window._crm.invoices.push({ id: 'BS2', type: 'sub', pid: '', sub: 'Demo Lumber Supply', invNum: 'STMT', amt: 3500, date: '2026-11-02', status: 'received' }); window._gcLumpSum.paint(); });
  await pg.evaluate(() => { document.getElementById('app').innerHTML = '<div><div><div><h1>Invoices</h1><p>PO# required · …</p></div></div></div>'; window._gcLumpSum.paint(); });
  const fl = await pg.evaluate(() => { const b = document.querySelector('.gc-lumpbar [data-lump="flags"]'); return b && b.style.display !== 'none' ? b.textContent : ''; });
  await pg.click('.gc-lumpbar [data-lump="flags"]');
  const fs1 = await pg.evaluate(() => document.getElementById('gc-lump').innerText);
  ok('G9 the bar warns "⚠ 1 bill look(s) like a statement for several jobs" → the list with 🔗 This is a statement for several jobs / It is a real separate bill', /⚠ 1 bill look like a statement/.test(fl) && /This is a statement for several jobs/.test(fs1) && /It is a real separate bill/.test(fs1), { fl, fs1: fs1.slice(0, 300) });
  await pg.click('#gc-lump [data-lp="notstmt"]');
  ok('G10 "It is a real separate bill" clears the flag for good (notStatement on the bill)', (await inv('BS2')).notStatement === true && (await pg.evaluate(() => window._gcLumpSum.core.dupStatements(window._crm.invoices).length)) === 0);
}
/* ─── H. QuickBooks webhook (Money Inbox) + the QuickBooks "needs a home" to-do ─── */
{
  await pg.evaluate(() => {
    const IDB = { gc_money_inbox: [
      { id: 'M1', type: 'payment', status: 'pending', vendor: 'Demo Lumber Supply', amount: 2000.5, date: '2026-11-11', docNumber: '6001', ref: 'qb:BillPayment:991', applied: [{ num: 'DL-101', amount: 1200 }, { num: 'DL-102', amount: 800.5 }] },
      { id: 'M2', type: 'payment', status: 'pending', vendor: 'Demo Lumber Supply LLC', amount: 450, date: '2026-11-12', docNumber: '6002', ref: 'qb:BillPayment:992' },
      { id: 'M3', type: 'payment', status: 'pending', vendor: 'Nobody Owed Co', amount: 75, date: '2026-11-12', docNumber: '6003' }] };
    window.idbGet = async k => JSON.parse(JSON.stringify(IDB[k] || null)); window.idbSet = async (k, v) => { IDB[k] = v; }; window.__IDB = IDB;
    window.__oldAccept = 0; window._gcMoneyAccept = async function(id){ window.__oldAccept++; return { ok: true, old: id }; };
    localStorage.setItem('gc_office_tasks', JSON.stringify([{ id: 'TQB1', kind: 'qb_home', qbKey: 'QB:payment:7001:acme', label: 'Payment #7001 — Acme', qb: { kind: 'payment', num: '7001', name: 'Acme Property Mgmt', amount: 8000, date: '2026-11-12' }, done: false }]));
    window._gcOpenQbHome = function(id){ const o = document.createElement('div'); o.id = '_gcQbHomeOv'; o.innerHTML = '<div>QuickBooks row that needs a home</div>'; document.body.appendChild(o); };
  });
  await sleep(4500);
  const m1 = await pg.evaluate(async () => { const r = await window._gcMoneyAccept('M1', ''); return { r, inbox: window.__IDB.gc_money_inbox[0], old: window.__oldAccept }; });
  const b1 = await inv('B1'), b2 = await inv('B2');
  ok('H1 Money Inbox: a QuickBooks bill payment that lists DL-101 + DL-102 → both bills paid 11/11 (not a new cost), the inbox row accepted as lump-sum, the old "new paid expense" path not used',
    m1.r.ok && m1.inbox.status === 'accepted' && m1.inbox.acceptedAs === 'lump-sum' && m1.old === 0 && b1.status === 'paid' && b1.paidDate === '2026-11-11' && b2.status === 'paid' && (await pg.evaluate(() => window._crm.expenses.filter(e => !e.subInvId).length)) === 0, { m1, b1 });
  const m2 = await pg.evaluate(async () => { const r = await window._gcMoneyAccept('M2', ''); const o = document.getElementById('gc-lump'); return { r, party: o && o.querySelector('[data-lp="party"]').value, amt: o && o.querySelector('[data-lp="amount"]').value, on: o ? [...o.querySelectorAll('tr.on')].map(x => x.getAttribute('data-id')) : [] }; });
  ok('H2 a payment with no bill list, to a vendor with open bills → asks, then the lump-sum screen (vendor, $450, oldest first ticked)', m2.r.pending && /Demo Lumber/.test(m2.party) && m2.amt === '450' && m2.on.length >= 1, m2);
  await pg.click('#gc-lump [data-lp="save"]'); await sleep(400);
  const in2 = await pg.evaluate(() => window.__IDB.gc_money_inbox[1]);
  ok('H3 … saved → the inbox row accepted (lump-sum, its payment id)', in2.status === 'accepted' && /^LUMP/.test(in2.lumpId), in2);
  await pg.evaluate(() => document.getElementById('gc-lump') && document.getElementById('gc-lump').remove());
  const m3 = await pg.evaluate(async () => { const r = await window._gcMoneyAccept('M3', 'PJ1'); return { r, old: window.__oldAccept }; });
  ok('H4 a payment to someone with nothing open → the old path, unchanged', m3.r.old === 'M3' && m3.old === 1, m3);
  await pg.evaluate(() => { const x = window._gcLumpSum.list().find(r => r.qbKey === 'QB:payment:9001:acme' && !r.voided); if (x) window._gcLumpSum.undo(x.id); });   /* 1001 + 1002 open again */
  await sleep(300);
  await pg.evaluate(() => window._gcOpenQbHome('TQB1'));
  const hb = await pg.evaluate(() => (document.querySelector('#_gcQbHomeOv [data-lump-qb]') || {}).textContent || '');
  ok('H5 the QuickBooks "needs a home" to-do for a payment gets "🔗 It pays several invoices — mark each one"', /It pays several invoices/.test(hb), hb);
  await pg.click('#_gcQbHomeOv [data-lump-qb]');
  const qs = await pg.evaluate(() => { const o = document.getElementById('gc-lump'); return { amt: o.querySelector('[data-lp="amount"]').value, ck: o.querySelector('[data-lp="checkNo"]').value, sum: o.querySelector('[data-lp="sum"]').textContent }; });
  await pg.click('#gc-lump [data-lp="save"]'); await sleep(400);
  const tk = await pg.evaluate(() => JSON.parse(localStorage.getItem('gc_office_tasks'))[0]), c1 = await inv('C1');
  ok('H6 … opens prefilled ($8,000, #7001, applied oldest first: 1001 + 1002), saved → each invoice paid with the QuickBooks key, the to-do done', qs.amt === '8000' && qs.ck === '7001' && /✓ balanced/.test(qs.sum) && c1.status === 'paid' && c1.qbKeys.includes('QB:payment:7001:acme') && tk.done === true && /lump-sum payment/.test(tk.resolution), { qs, tk, c1 });
}
ok('no page errors', errs.length === 0, errs.slice(0, 6));
await C.close(); await browser.close();
const n = R.filter(Boolean).length;
console.log('\nLUMPSUM ' + n + '/' + R.length + ' passed');
process.exit(n === R.length ? 0 : 1);
