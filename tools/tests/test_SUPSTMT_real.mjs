// test_SUPSTMT_real.mjs <build-dir> [desk|phone] — patch SUPSTMT in the WHOLE CRM with the company's real data (the read-only snapshot
// in the scratchpad, loaded into the offline harness's fake cloud — nothing leaves the machine, nothing is printed but counts).
//   1. sign in as the office (by role, from the snapshot's people list), open Accounting → 🧾 Supplier statement is on the tool row.
//   2. build a statement for the supplier with the most bills from ITS real bills in the CRM (invoice #, date, amount, the job's PO)
//      plus two made-up lines not in the CRM, type it in through the panel, 📖 Read.
//   3. every real bill is found (by invoice #), the paid ones are ⚠ already paid, a line with a job's PO goes to that job.
//   4. 💵 pay ONE made-up line (the rest unticked) by check → a new bill on the job, paid, with "Paid on … statement", its cost row —
//      through the CRM's own React lists (they update on the next render) and patch LUMPSUM.
//   5. the main thread: no long task over 300 ms from the click on 🧾 to the drawn statement (CPU ×2 desk, ×4 phone).
// Harness: GC_HARNESS (default the session scratchpad's wN/harness_N.mjs). Usage: node test_SUPSTMT_real.mjs <build> [desk|phone]
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SCR = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs').href);
const build = process.argv[2]; if (!build) { console.error('usage: node test_SUPSTMT_real.mjs <build> [desk|phone]'); process.exit(2); }
const PHONE = (process.argv[3] || 'desk') === 'phone', CPU = +(process.env.SS_CPU || (PHONE ? 4 : 2)), MAXMS = +(process.env.SS_MAX || 300);
const L = await import(pathToFileURL(path.join(path.resolve(build), 'tools/qa/qa_lib.mjs')).href);
const snapDir = process.env.SS_SNAP || L.latestSnap(path.join(SCR, 'qa/snap'));
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
if (!snapDir) { console.log('no snapshot in the scratchpad — skipped'); process.exit(0); }
const snap = L.readSnap(snapDir); L.loadIntoHarness(H, snap); const { map } = L.accountsFromSnap(H, snap);
const who = (map.office || map.admin || {}); const email = String(who.email || '').toLowerCase();
console.log('snapshot ' + path.basename(snapDir) + ' (' + snap.rows.length + ' rows) · signed in as the ' + (map.office ? 'office' : 'admin') + ' · ' + (PHONE ? 'phone' : 'desk') + ' CPU ×' + CPU);
const INIT = `(() => { window.__LT = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__LT.push({ t: e.startTime, ms: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {} })()`;
const A = await H.computer('SS-real', { build, mobile: PHONE, viewport: PHONE ? { width: 390, height: 844 } : { width: 1440, height: 900 }, init: [INIT] });
A.acceptConfirm = false;
const pg = A.page(); const cdp = await A.ctx.newCDPSession(pg);
try {
  ok(await H.signIn(A, email, 90000), 'signed in');
  await H.waitFor(A, () => typeof window._gcSupStmt === 'object' && window._crm && (window._crm.projects || []).length > 100 && (window._crm.invoices || []).length > 50 && typeof window._setView === 'function', null, 150000);
  await H.sleep(5000);
  if (PHONE) await pg.evaluate(() => { try { window._gcChooseView && window._gcChooseView('desk'); } catch (e) {} });
  await pg.evaluate(() => window._setView('taxcenter'));
  const btn = await H.waitFor(A, () => !!document.getElementById('gc-ss-acct'), null, 30000);
  ok(btn, 'Accounting: 🧾 Supplier statement on the tool row');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  /* the supplier with the most bills; its real bills → the statement text (kept in the page, never printed) */
  const plan = await pg.evaluate(() => {
    const C = window._gcSupStmtCore, I = (window._crm.invoices || []).filter(r => r && C.liveBill(r) && C.billNo(r));
    const by = {}; I.forEach(r => { const k = C.normParty(C.billParty(r)); (by[k] = by[k] || []).push(r); });
    const k = Object.keys(by).sort((a, b) => by[b].length - by[a].length)[0]; if (!k) return null;
    const bills = by[k].slice(0, 60), proj = id => (window._crm.projects || []).find(p => String(p.id) === String(id));
    const act = (window._crm.projects || []).find(p => p && p.autoPO && /active/i.test(p.status || '') && !p.deleted);
    const md = d => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(d || ''); return m ? m[2] + '/' + m[3] + '/' + m[1] : ''; };
    let txt = 'Inv Date\tInvoice #\tType\tCustomer PO\tShip To\tJob Name\tAmount\n';
    bills.forEach(b => { const p = b.pid ? proj(b.pid) : null; txt += [md(C.billDay(b)), C.billNo(b), 'INV', p && p.autoPO || '', '', '', C.amtOf(b).toFixed(2)].join('\t') + '\n'; });
    txt += ['11/18/2026', 'ZZTEST-90001', 'INV', act ? act.autoPO : '', '', 'TEST LINE', '12.34'].join('\t') + '\n';
    txt += ['11/18/2026', 'ZZTEST-90002', 'INV', '', '', 'TEST WILL CALL', '5.00'].join('\t') + '\n';
    window.__SS = { name: C.billParty(bills[0]), txt, ids: bills.map(b => String(b.id)), paid: bills.filter(b => C.isPaid(b)).map(b => String(b.id)), withPid: bills.filter(b => b.pid && proj(b.pid) && proj(b.pid).autoPO).map(b => String(b.id)), actPid: act ? String(act.id) : '' };
    return { n: bills.length, paid: window.__SS.paid.length, withPid: window.__SS.withPid.length, act: !!act };
  });
  ok(plan && plan.n >= 5, 'the supplier with the most bills: ' + (plan ? plan.n + ' of its bills (' + plan.paid + ' paid, ' + plan.withPid + ' on a job with a PO)' : 'none'));
  /* open the panel and type the statement in — measured */
  const t0 = await pg.evaluate(() => { window.__LT = []; return performance.now(); });
  const mark = k => pg.evaluate(k => { (window.__MK = window.__MK || {})[k] = performance.now(); }, k);
  await mark('open'); await pg.click('#gc-ss-acct');
  await H.waitFor(A, () => !!document.querySelector('#gc-ss [data-ss="new"]'), null, 20000);
  await mark('new'); await pg.click('#gc-ss [data-ss="new"]');
  await pg.evaluate(() => { const el = document.getElementById('gc-ss'), set = (k, v) => { const i = el.querySelector('[data-ss-f="' + k + '"]'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }; set('supplier', window.__SS.name); set('stmtNo', 'QA-REAL-' + Date.now()); set('stmtDate', '2026-11-18'); set('text', window.__SS.txt); });
  await mark('read'); await pg.click('#gc-ss [data-ss="read"]');
  const drawn = await H.waitFor(A, () => document.querySelectorAll('#gc-ss tr[data-ss-line]').length, null, 60000);
  await H.sleep(2500);
  const R = await pg.evaluate(t0 => {
    const S = window._gcSupStmt, st = S._t.state(), v = S.view(st.id).V, X = window.__SS;
    const real = v.slice(0, X.ids.length);
    return { lines: v.length, found: real.filter((x, i) => x.invId === X.ids[i]).length, already: real.filter((x, i) => X.paid.indexOf(X.ids[i]) >= 0 && x.st === 'already').length,
      poJob: real.filter((x, i) => X.withPid.indexOf(X.ids[i]) >= 0 && x.pid && x.pid === String(((window._crm.invoices || []).find(b => String(b.id) === X.ids[i]) || {}).pid)).length,
      test1: v[X.ids.length] && { st: v[X.ids.length].st, pid: v[X.ids.length].pid === X.actPid }, test2: v[X.ids.length + 1] && v[X.ids.length + 1].st,
      worst: Math.max(0, ...window.__LT.filter(x => x.t >= t0).map(x => x.ms)), big: window.__LT.filter(x => x.t >= t0 && x.ms > 150).map(x => { const M = window.__MK || {}; const k = Object.keys(M).filter(q => M[q] <= x.t).sort((a, b) => M[b] - M[a])[0] || '?'; return k + '+' + Math.round(x.t - (M[k] || 0)) + 'ms:' + x.ms; }), n300: window.__LT.filter(x => x.t >= t0 && x.ms > 300).length, ms: Math.round(performance.now() - t0), matchMs: S.get(st.id).matchMs, id: st.id };
  }, t0);
  ok(drawn && R.lines === plan.n + 2, 'read ' + R.lines + ' lines through the panel');
  ok(R.found === plan.n, 'every real bill found by its invoice # (' + R.found + ' / ' + plan.n + ')', R);
  ok(R.already === plan.paid, 'the paid ones are ⚠ already paid, left out (' + R.already + ' / ' + plan.paid + ')', R);
  ok(R.poJob === plan.withPid, 'a line with its job\'s PO goes to that job (' + R.poJob + ' / ' + plan.withPid + ')', R);
  ok(!plan.act || (R.test1 && R.test1.st === 'new' && R.test1.pid), 'a made-up line with an active job\'s PO: ➕ not in the CRM, on that job', R.test1);
  ok(R.test2 === 'nojob', 'a made-up line with nothing to go on: ❓ no job', R.test2);
  ok(R.worst < MAXMS, 'main thread: worst long task ' + R.worst + ' ms from the click to the drawn statement (' + R.ms + ' ms in all, matching ' + R.matchMs + ' ms, ' + R.n300 + ' over 300 ms)', R);
  /* pay ONE made-up line through the real lists */
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const P1 = await pg.evaluate(async () => {
    const S = window._gcSupStmt, st = S._t.state(), id = st.id, X = window.__SS;
    S.view(id).V.forEach((v, i) => { if (i !== X.ids.length && v.include) S.pick(id, v.id, 'inc', false); });
    const tot = S.view(id).inc.total;
    const r = await S.pay(id, { date: '2026-11-20', method: 'check', checkNo: 'QA1', amount: tot });
    await new Promise(res => setTimeout(res, 1500));
    const b = (window._crm.invoices || []).find(x => /^SSB-/.test(x.id) && x.supStmtFrom && x.supStmtFrom.id === id);
    const e = b && (window._crm.expenses || []).find(x => x.subInvId === b.id);
    return { ok: r.ok, err: r.error, tot, bill: b && { st: b.status, pid: b.pid === X.actPid, ss: b.supStmt && b.supStmt.checkNo, chk: b.checkNo }, cost: e && { st: e.status, pid: e.pid === X.actPid, ss: !!e.supStmt }, state: S.view(id).state };
  });
  ok(!plan.act || (P1.ok && P1.bill && P1.bill.st === 'paid' && P1.bill.pid && P1.bill.ss === 'QA1' && P1.cost && P1.cost.st === 'paid' && P1.cost.pid && P1.cost.ss && P1.state === 'partial'), '💵 paid one made-up line: a new bill on the job, paid (check QA1, "Paid on … statement"), its cost row paid; the statement partly paid', P1);
  ok(!A.errs.filter(e => !/WRONG SITE|ResizeObserver/i.test(e)).length, 'no page errors', A.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL ' + (e && e.stack || e)); }
await A.close().catch(() => {});
console.log(`SUPSTMT_real (${PHONE ? 'phone' : 'desk'}) ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
