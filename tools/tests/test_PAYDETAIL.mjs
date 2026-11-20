// test_PAYDETAIL.mjs <build-dir> [shot-dir] — patch PAYDETAIL in the WHOLE CRM (offline harness_N: stubbed Supabase). Made-up data only.
// Owner 11/20: "show on invoices where we can edit / add check number, how we paid etc. if the pdf isn't in the system".
//   1. the office: Invoices → every row (Client / Sub / Supplier) has 💳 Payment details; the sheet is a light side panel (no cover).
//   2. a PAID sub invoice: check # 1001 → 1002 → the invoice, the job's cost row and the ONE register row (srcInvId) are updated;
//      a history entry (who / when / old → new); ↩ Undo puts all three back.
//   3. a customer invoice: 📎 Attach PDF (the sub-invoice PDF store) → the sheet names it; 👁 View; a history note.
//   4. an UNPAID supplier bill: record the payment (check 2001) → paid like Mark paid (invoice, cost row, "Sub Paid" register row).
//   5. a partial customer payment ($3,000 of $8,000) → partly paid, open $5,000, the Accounting rules count $3,000 collected.
//   6. a crew member (staff role) sees no 💳 and the API refuses.
// Run: flock <scratchpad>/locks/browser.lock node tools/tests/test_PAYDETAIL.mjs <abs build dir> [shot dir]
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, waitFor, resetCloud, cset, cget } = H;
const build = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

const PROJECTS = [{ id: 'PJ1', name: 'Demo Kitchen', client: 'Pat Demo', autoPO: 'T601', status: 'active', type: 'Residential', jobYear: 2026, contract: 20000, created: '2026-10-01', createdAt: '2026-10-01T12:00:00.000Z', pm: 'Demo PM', subs: [], photos: [], checklist: [], followUps: [] }];
const INVS = [
  { id: 'SI1', type: 'sub', pid: 'PJ1', sub: 'Demo Plumbing LLC', invNum: 'DP-55', amt: 1500, date: '2026-11-02', recvDate: '2026-11-02', status: 'paid', paid: true, paidDate: '2026-11-10', checkNo: '1001', po: 'T601', desc: 'Rough plumbing' },
  { id: 'SI2', type: 'sub', pid: 'PJ1', sub: 'Demo Lumber Supply', invNum: 'DL-9', amt: 400, date: '2026-11-03', recvDate: '2026-11-03', status: 'approved', po: 'T601', desc: 'Lumber' },
  { id: 'CI1', type: 'client', pid: 'PJ1', client: 'Pat Demo', invNum: '1050', amt: 8000, date: '2026-11-05', status: 'sent', po: 'T601', desc: 'Draw 1' }];
const EXP = [
  { id: 'E1', pid: 'PJ1', subInvId: 'SI1', amt: 1500, amount: 1500, status: 'paid', paidDate: '2026-11-10', category: 'Subcontractor', vendor: 'Demo Plumbing LLC', date: '2026-11-02', desc: 'Rough plumbing' },
  { id: 'E2', pid: 'PJ1', subInvId: 'SI2', amt: 400, amount: 400, status: 'approved', category: 'Materials', vendor: 'Demo Lumber Supply', date: '2026-11-03', desc: 'Lumber' }];
const REG = [{ _id: 'R1', id: 'R1', srcInvId: 'SI1', pid: 'PJ1', payee: 'Demo Plumbing LLC', desc: 'Sub Paid: Rough plumbing — check #1001', po: 'T601', amount: 1500, amt: 1500, category: 'Subcontractor', date: '2026-11-10', source: 'subinvoice', method: 'payment', direction: 'out', isIncome: false, status: 'paid' }];
const USERS = [{ id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true },
  { id: 'u-pm', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }];
resetCloud();
cset('projects', PROJECTS); cset('invs', INVS); cset('expenses', EXP); cset('gcAcctRegister', REG); cset('users', USERS);
cset('subs', [{ id: 'S1', name: 'Demo Plumbing LLC' }, { id: 'S2', name: 'Demo Lumber Supply', isSub: false }]); cset('leads', []); cset('customers', [{ id: 'CU1', name: 'Pat Demo' }]);
cset('gc_automation_pause', { on: true, at: '2026-11-04T12:00:00.000Z', by: 'owner' });

const inv = id => (cget('invs') || []).find(x => x.id === id) || {};
const exp = id => (cget('expenses') || []).find(x => x.id === id) || {};
const regs = id => (cget('gcAcctRegister') || []).filter(x => x && x.srcInvId === id);
/* every register row that stands for one bill (its own id, SUB_<id>, or its cost row EXPENSE_<row>) */
const billRows = (id, e) => (cget('gcAcctRegister') || []).filter(x => x && [id, 'SUB_' + id, 'EXPENSE_' + e].includes(String(x.srcInvId)));
async function until(fn, ms){ const t0 = Date.now(); let v; while (Date.now() - t0 < (ms || 20000)) { v = fn(); if (v) return v; await sleep(400); } return v; }

const A = await computer('office', { build });
ok(await signIn(A, 'office@grayco-cs.com', 30000), 'the office is signed in');
ok(await waitFor(A, () => (window._crm && (window._crm.invoices || []).length >= 3 && window._gcPayDetail) || null, null, 90000), 'the CRM loaded with patch PAYDETAIL');
const pg = A.page();
const tab = t => A.ev(t => { const b = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim().startsWith(t)); if (b) b.click(); return !!b; }, t);
const btnFor = id => A.ev(id => !!document.querySelector('main tr .gc-pd-btn[data-pd-open="' + id + '"]'), id);

/* 1. buttons on every row kind */
await A.ev(() => window._setView('invoices')); await sleep(5000);
ok(await waitFor(A, () => !!document.querySelector('main tr .gc-pd-btn[data-pd-open="CI1"]'), null, 10000), '💳 Payment details on the customer invoice row');
await tab('Sub Invoices'); await sleep(2500);
ok(await btnFor('SI1'), '💳 Payment details on the sub invoice row');
await tab('Supplier Invoices'); await sleep(2500);
ok(await btnFor('SI2'), '💳 Payment details on the supplier bill row');
await A.ev(() => { const b = Array.from(document.querySelectorAll('main tr button')).find(b => b.textContent.trim() === 'EDIT'); b && b.click(); }); await sleep(2500);
ok(await btnFor('SI2'), '…and on the row while it is being edited (the inline invoice editor)');
await A.ev(() => { const b = Array.from(document.querySelectorAll('main tr button')).find(b => b.textContent.trim() === 'Cancel'); b && b.click(); }); await sleep(1500);

/* 2. edit the check # on a paid sub invoice */
await tab('Sub Invoices'); await sleep(2000);
await pg.click('main tr .gc-pd-btn[data-pd-open="SI1"]'); await sleep(800);
const sheet = await A.ev(() => { const el = document.getElementById('gc-pd'); if (!el) return null; const cs = getComputedStyle(el); return { bg: cs.backgroundColor, w: el.getBoundingClientRect().width, text: el.textContent, ref: el.querySelector('[data-pd-f="ref"]').value, date: el.querySelector('[data-pd-f="date"]').value, amt: el.querySelector('[data-pd-f="amount"]').value, method: el.querySelector('[data-pd-f="method"]').value, cover: Array.from(document.querySelectorAll('body > *')).some(x => { const s = getComputedStyle(x); return x !== el && s.position === 'fixed' && x.getBoundingClientRect().width >= innerWidth - 2 && x.getBoundingClientRect().height >= innerHeight - 2 && s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0; }) }; });
ok(sheet && sheet.bg === 'rgb(255, 255, 255)' && sheet.w <= 420 && !sheet.cover, 'the sheet is a white side panel, nothing covering the screen', sheet && { bg: sheet.bg, w: sheet.w, cover: sheet.cover });
ok(sheet && sheet.ref === '1001' && sheet.date === '2026-11-10' && +sheet.amt === 1500 && sheet.method === 'check' && /PAID/.test(sheet.text) && /DP-55/.test(sheet.text), 'it shows what is on file: paid 11/10, $1,500, check #1001', sheet && { ref: sheet.ref, date: sheet.date, amt: sheet.amt, method: sheet.method });
if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'paydetail_sheet_desk.png') });
const n0 = billRows('SI1', 'E1').length;
await pg.fill('#gc-pd [data-pd-f="ref"]', '1002'); await pg.fill('#gc-pd [data-pd-f="paidFrom"]', 'Operating checking'); await pg.fill('#gc-pd [data-pd-f="note"]', 'check re-issued');
await pg.click('#gc-pd [data-pd="save"]');
await until(() => inv('SI1').checkNo === '1002' && /#1002/.test((regs('SI1')[0] || {}).desc || ''), 25000);
const s1 = inv('SI1'), r1 = regs('SI1');
ok(s1.checkNo === '1002' && s1.status === 'paid' && s1.paidDate === '2026-11-10' && s1.amountPaid === 1500 && (s1.payInfo || {}).paidFrom === 'Operating checking' && (s1.payInfo || {}).note === 'check re-issued' && s1.payMethod === 'Check' && !s1.payments, 'the invoice: check #1002, still paid 11/10 $1,500, paid from + note kept (cloud)', s1);
ok(r1.length === 1 && /#1002/.test(r1[0].desc) && r1[0].amount === 1500 && r1[0].status === 'paid' && r1[0].date === '2026-11-10', 'the register: the SAME one row (srcInvId) now says #1002 — nothing counted twice', r1);
ok(billRows('SI1', 'E1').length === n0, 'no new register row for that bill (' + n0 + ' before and after)', billRows('SI1', 'E1'));
ok(exp('E1').status === 'paid' && exp('E1').paidDate === '2026-11-10' && (cget('expenses') || []).filter(e => e.subInvId === 'SI1').length === 1, 'the job cost row: still one, paid 11/10', exp('E1'));
const h1 = (s1.payHistory || [])[0] || {};
const meName = await A.ev(() => ((window._gcMeUser && window._gcMeUser()) || {}).name || '');
ok((s1.payHistory || []).length === 1 && /Office/.test(h1.by || '') && h1.at && h1.changes.some(c => c.f === 'Check # / ref' && c.from === '1001' && c.to === '1002'), 'a history entry: who (' + meName + '), when, check # 1001 → 1002', (s1.payHistory || []).map(h => [h.by, h.at, h.changes]));
await sleep(800);
ok(await A.ev(() => /1001 → 1002/.test(document.getElementById('gc-pd').textContent) && !!document.querySelector('#gc-pd [data-pd="undo"]')), 'the sheet lists the change with ↩ Undo');
await pg.click('#gc-pd [data-pd="undo"]');
await until(() => inv('SI1').checkNo === '1001' && /#1001/.test((regs('SI1')[0] || {}).desc || ''), 25000);
const s1u = inv('SI1'), r1u = regs('SI1'), g1u = await A.ev(() => window._gcPayDetail.get('SI1'));
ok(s1u.checkNo === '1001' && s1u.status === 'paid' && s1u.paidDate === '2026-11-10' && (s1u.payInfo || {}).none === true && !s1u.payments && g1u.ref === '1001' && g1u.paidFrom === '' && g1u.note === '' && s1u.payHistory.length === 2 && s1u.payHistory[0].undone, '↩ Undo: the invoice is back to check #1001 (history: the change marked undone + the undo)', { checkNo: s1u.checkNo, status: s1u.status, paidDate: s1u.paidDate, payInfo: s1u.payInfo, g1u, h: (s1u.payHistory || []).map(h => [h.kind, h.undone, h.by]) });
ok(r1u.length === 1 && r1u[0].desc === REG[0].desc, '↩ Undo: the register row is back as it was (still one row)', r1u);
await pg.click('#gc-pd [data-pd="close"]').catch(() => {});

/* 3. attach the PDF on a customer invoice */
await tab('Client Invoices'); await sleep(2000);
await pg.click('main tr .gc-pd-btn[data-pd-open="CI1"]'); await sleep(800);
ok(await A.ev(() => /none attached/.test(document.querySelector('#gc-pd [data-pd="pdfbox"]').textContent)), 'the customer invoice: no PDF yet, 📎 Attach PDF offered');
const [fc] = await Promise.all([pg.waitForEvent('filechooser', { timeout: 10000 }), pg.click('#gc-pd [data-pd="attach"]')]);
await fc.setFiles({ name: 'Invoice-1050.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% demo\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });
ok(await waitFor(A, () => /Invoice-1050\.pdf/.test((document.querySelector('#gc-pd [data-pd="pdfbox"]') || {}).textContent || '') && !!document.querySelector('#gc-pd [data-pd="viewpdf"]'), null, 15000), 'after 📎 the sheet names Invoice-1050.pdf with 👁 View PDF and 📎 Replace');
const stored = await A.ev(() => window.idbGet('gc_sub_pdfs').then(v => v && v.CI1 ? { name: v.CI1.name, pdf: /^data:application\/pdf/.test(v.CI1.data) } : null));
ok(stored && stored.name === 'Invoice-1050.pdf' && stored.pdf, 'the file is in the same store as the sub-invoice PDFs (gc_sub_pdfs, keyed by the invoice)', stored);
ok(await until(() => (inv('CI1').payHistory || []).some(h => h.kind === 'pdf' && h.changes[0].to === 'Invoice-1050.pdf'), 15000), 'a history note for the PDF');
const pop = pg.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
await pg.click('#gc-pd [data-pd="viewpdf"]'); const w = await pop;
ok(!!w, '👁 View PDF opens it'); if (w) await w.close().catch(() => {});

/* 5. a partial customer payment */
await pg.fill('#gc-pd [data-pd-f="amount"]', '3000'); await pg.selectOption('#gc-pd [data-pd-f="method"]', 'ach'); await pg.fill('#gc-pd [data-pd-f="ref"]', 'ACH 7781'); await pg.fill('#gc-pd [data-pd-f="date"]', '2026-11-18');
await pg.click('#gc-pd [data-pd="save"]');
await until(() => inv('CI1').status === 'partial', 20000);
const c1 = inv('CI1');
const coll = await A.ev(() => { const I = window._crm.invoices.find(x => x.id === 'CI1'); return I && window._gcAcctRules ? { c: window._gcAcctRules.collected(I), r: window._gcAcctRules.receipts(I) } : null; });
ok(c1.status === 'partial' && c1.openBalance === 5000 && c1.amountPaid === 3000 && c1.paid !== true && !c1.paidDate && (c1.payments || []).length === 1 && c1.payments[0].date === '2026-11-18' && c1.payments[0].ref === 'ACH 7781' && c1.payMethod === 'ACH', 'customer invoice: $3,000 by ACH on 11/18 → partly paid, $5,000 open, the payment row keeps its date + reference', c1);
ok(coll && coll.c === 3000 && coll.r.length === 1 && coll.r[0].date === '2026-11-18', 'the Accounting rules count $3,000 collected on 11/18', coll);
ok(regs('CI1').length <= 1 && regs('CI1').every(x => x.status !== 'paid' && !/Client Payment/.test(x.desc || '')), 'the register: no "Client Payment" row until it is paid in full (as Mark paid); the invoice\'s own row stays the one row', regs('CI1'));
await pg.click('#gc-pd [data-pd="close"]').catch(() => {});

/* 4. record the payment on an unpaid supplier bill */
await tab('Supplier Invoices'); await sleep(2000);
await pg.click('main tr .gc-pd-btn[data-pd-open="SI2"]'); await sleep(800);
const rec0 = await A.ev(() => ({ btn: document.querySelector('#gc-pd [data-pd="save"]').textContent, amt: document.querySelector('#gc-pd [data-pd-f="amount"]').value }));
ok(/Record payment/.test(rec0.btn) && +rec0.amt === 400, 'an unpaid bill: the sheet offers 💵 Record payment for the open $400', rec0);
await pg.fill('#gc-pd [data-pd-f="date"]', '2026-11-19'); await pg.fill('#gc-pd [data-pd-f="ref"]', '2001');
await pg.click('#gc-pd [data-pd="save"]');
await until(() => inv('SI2').status === 'paid' && exp('E2').status === 'paid' && billRows('SI2', 'E2').some(x => /#2001/.test(x.desc || '')), 25000);
const s2 = inv('SI2'), r2 = billRows('SI2', 'E2');
ok(s2.status === 'paid' && s2.paid === true && s2.paidDate === '2026-11-19' && s2.checkNo === '2001' && s2.openBalance === 0 && s2.payMethod === 'Check', 'the bill: paid 11/19, check #2001 (as Mark paid)', s2);
ok(exp('E2').status === 'paid' && exp('E2').paidDate === '2026-11-19', 'its job cost row: paid 11/19', exp('E2'));
ok(r2.length === 1 && /Sub Paid/.test(r2[0].desc) && r2[0].status === 'paid' && /#2001/.test(r2[0].desc) && r2[0].amount === 400 && r2[0].date === '2026-11-19', 'the register: ONE "Sub Paid" row for it (posted onto its cost row\'s line when that was already there)', r2);
await sleep(800);
await pg.click('#gc-pd [data-pd="undo"]');
await until(() => inv('SI2').status !== 'paid' && exp('E2').status !== 'paid', 25000); await sleep(3000);
await until(() => billRows('SI2', 'E2').every(x => x.status !== 'paid'), 20000);
const s2u = inv('SI2'), r2u = billRows('SI2', 'E2'), g2u = await A.ev(() => window._gcPayDetail.get('SI2'));
ok(s2u.status === 'approved' && s2u.paid !== true && s2u.openBalance === 400 && !s2u.amountPaid && g2u.paid === 0 && g2u.open === 400 && exp('E2').status === 'approved', '↩ Undo the recorded payment: the bill and its cost row are back to approved / unpaid', { s: [s2u.status, s2u.paid, s2u.paidDate, s2u.checkNo], e: exp('E2') });
ok(r2u.length === 1 && !/#2001/.test(r2u[0].desc || '') && r2u[0].status !== 'paid', '↩ Undo: its register line is back as it was (one line, not paid)', { r2u, regPrev: ((s2u.payHistory || [])[0] || {}).regPrev });
await pg.click('#gc-pd [data-pd="close"]').catch(() => {});
ok(!A.errs.some(e => /paydetail|_gcPayDetail|gc-pd/i.test(e)), 'no page errors from PAYDETAIL', A.errs.slice(0, 5));

/* 6. a crew member */
const B = await computer('pm', { build });
ok(await signIn(B, 'pm@grayco-cs.com', 30000), 'a project manager (staff) signs in');
await waitFor(B, () => (window._crm && (window._crm.invoices || []).length >= 1 && window._gcPayDetail) || null, null, 90000);
await B.ev(() => { try { window._setView('invoices'); } catch (e) {} }); await sleep(5000);
const st = await B.ev(() => window._gcPayDetail.save('SI1', { date: '2026-11-20', amount: 1500, method: 'check', ref: '9999' }).then(r => ({ r, can: window._gcPayDetail.canUse(), btns: document.querySelectorAll('.gc-pd-btn').length })));
ok(st && !st.can && st.btns === 0 && st.r.ok === false && /admins and the office/.test(st.r.error), 'staff: no 💳 buttons and the API refuses', st);
ok(inv('SI1').checkNo === '1001', '…nothing changed');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await A.close(); await B.close();
process.exit(fail ? 1 : 0);
