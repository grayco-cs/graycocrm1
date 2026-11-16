// test_APPRNOSEND.mjs <build-dir> [--node-only] — APPRNOSEND (owner 11/16: "would like to approve here AND NOT SEND TOO").
// Made-up people, jobs and customers only; nothing leaves this computer: the REAL portal function (approvalAction, runReminders,
// releaseScheduled, escalateDue) and _lib/auto-ar.js run in node on the harness's in-memory cloud, Resend is counted (it must stay 0),
// and the browser part (offline harness, Chromium) talks to that same function.
//  node:
//   1. a PM's "Approve — don't send" on a money paper (final invoice: PM → admin): goes on to the admin, "don't send" noted, nothing sent;
//   2. the admin's "Approve — don't send": closed as approved (status recorded, noSend, "approved without sending — <who>, <when>"),
//      who / role / when / device kept; the final invoice's mail row stamped (first_sent_at = now, 'approved without sending'); 0 e-mails;
//   3. it is final: a second approve → 409; the 7 AM release, the 24-h escalation and data-entry mode ending never send it;
//   4. the 15-day reminder run never reminds that invoice (mail row, or the invoice's apprNoSend mark); a normal final invoice still is;
//   5. the past-due reminders (auto-ar) skip an invoice approved without sending; the others still get theirs;
//   6. roles: whoever can approve it (the office on her kinds, at any step); someone who cannot → 403; "put in portal" has no don't-send (400);
//   7. an invoice e-mail (isFinal) approved without sending: mail row upserted; works with data-entry mode ON too (0 e-mails).
//  browser:
//   8. the desk ✅ Approvals tab: "✅ Approve — don't send" next to Approve on the e-mail rows (not on "put in portal"); a click → the
//      server records it, the row goes, the invoice is marked issued ("approved without sending"), window._gcApprAudit is called;
//   9. the old ✅ Approvals list (APPR) and the e-mail preview ("Edit before sending") have the button too; the office's click works;
//  10. "Recently approved" says 🔕 approved without sending; no page errors.
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), NODE_ONLY = process.argv.includes('--node-only');
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs');
const { cset, cget, cloud, resetCloud, sleep } = H;
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };

/* ── the node side: every fetch the function makes is answered here, from the harness cloud ── */
const SENT = [], MAIL = {}, OTHER = [];
let tick = 0;
const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {}; const m = (o.method || 'GET').toUpperCase();
  await new Promise(r => setImmediate(r));
  if (/api\.resend\.com/.test(url)) { SENT.push(JSON.parse(o.body)); return res(200, { id: 'em_' + SENT.length }); }
  if (/api\.twilio\.com/.test(url)) { SENT.push({ sms: true }); return res(201, {}); }
  const u = new URL(url);
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(x => cloud.set(x.key, { key: x.key, value: x.value, updated_at: new Date(Date.now() + (++tick)).toISOString() })); return res(201, {}); }
    const k = u.searchParams.get('key') || '';
    const keys = k.startsWith('in.') ? dv(k.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')) : [dv(k).replace(/^eq\./, '')];
    return res(200, keys.filter(x => cloud.has(x)).map(x => cloud.get(x)));
  }
  if (u.pathname === '/rest/v1/gc_portal_mail') {
    const idq = u.searchParams.get('invoice_id');
    if (m === 'GET') return res(200, Object.values(MAIL));
    if (m === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(x => { MAIL[x.invoice_id] = Object.assign({}, MAIL[x.invoice_id] || {}, x); }); return res(201, (Array.isArray(b) ? b : [b])); }
    if (m === 'PATCH') { const id = dv(idq).replace(/^eq\./, ''); if (!MAIL[id]) return res(200, []); const lr = u.searchParams.get('last_reminder_at'); if (lr && lr !== 'is.null' && dv(lr).replace(/^eq\./, '') !== String(MAIL[id].last_reminder_at)) return res(200, []); Object.assign(MAIL[id], JSON.parse(o.body)); return res(200, [MAIL[id]]); }
  }
  OTHER.push(m + ' ' + u.pathname);
  return res(m === 'POST' ? 201 : 200, []);
};
Object.assign(process.env, { SUPABASE_URL: 'https://ieeonhpfahmwwecizdut.supabase.co', SUPABASE_SERVICE_KEY: 'sb_secret_test_only', RESEND_API_KEY: 're_test_only', CUST_QUIET_OFF: '1' });
delete process.env.PORTAL_MAIL_OFF; delete process.env.OWNER_EMAILS;
const FN = path.join(BUILD, 'netlify/functions');
const portal = require(FN + '/portal.js'); const C = portal._core;
const AR = require(FN + '/_lib/auto-ar.js');
const PZ = require(FN + '/_lib/pause.js');
let CQOFF = false; try { CQOFF = require(FN + '/_lib/custquiet.js').off(); } catch (e) {}

const USERS = [
  { id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Admin', active: true },
  { id: 'u3', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u4', name: 'Demo Estimator', email: 'sbiffle@grayco-cs.com', role: 'Estimator', active: true }];
const old = new Date(Date.now() - 50 * 864e5).toISOString(), d20 = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);
function seed(){
  resetCloud(); for (const k of Object.keys(MAIL)) delete MAIL[k]; SENT.length = 0;
  cset('users', USERS);
  cset('projects', [{ id: 'P1', name: 'Sample Reroof', client: 'Pat Sample', clientEmail: 'pat@sample-customer.test', address: '1 Sample Ln', pm: 'Demo PM', status: 'Active', autoPO: 'T101', createdAt: old, updatedAt: old },
    { id: 'P2', name: 'Sample Kitchen', client: 'Kim Sample', clientEmail: 'kim@sample-customer.test', address: '2 Sample Ln', pm: 'Demo PM', status: 'Active', autoPO: 'T102', createdAt: old, updatedAt: old }]);
  cset('invs', [{ id: 'INV1', pid: 'P1', type: 'client', drawType: 'Final', isFinal: true, amt: 5000, status: 'sent', invNum: 'T101-3', date: old.slice(0, 10), createdAt: old },
    { id: 'INV2', pid: 'P2', type: 'client', drawType: 'Final', isFinal: true, amt: 4000, status: 'sent', invNum: 'T102-3', date: old.slice(0, 10), createdAt: old },
    { id: 'INVA', pid: 'P1', type: 'client', drawType: 'Deposit', amt: 1000, status: 'sent', invNum: 'T101-1', date: d20, dueDate: d20, createdAt: old, apprNoSend: { by: 'Wesley Johnson', at: old, note: 'approved without sending — test' } },
    { id: 'INVB', pid: 'P2', type: 'client', drawType: 'Deposit', amt: 1000, status: 'sent', invNum: 'T102-1', date: d20, dueDate: d20, createdAt: old }]);
  cset('gc_automation_pause', { on: false });
  cset('gc_approval_queue', '[]');
}
const PMW = { email: 'pm@grayco-cs.com', role: 'staff', name: 'Demo PM' };
const ADM = { email: 'wjohnson@grayco-cs.com', role: 'admin', name: 'Wesley Johnson' };
const OFF = { email: 'office@grayco-cs.com', role: 'office', name: 'Office Demo' };
const EST = { email: 'sbiffle@grayco-cs.com', role: 'staff', name: 'Demo Estimator' };
const PMREC = { name: 'Demo PM', email: 'pm@grayco-cs.com' };
const list = () => { const v = cget('gc_approval_queue'); return typeof v === 'string' ? JSON.parse(v) : (v || []); };
const item = id => list().find(x => x.id === id);
const act = (who, op, id, extra) => C.approvalAction(Object.assign({ op, id }, extra || {}), who).catch(e => ({ status: 'threw', out: { error: String(e && e.stack || e) } }));
const q = (o) => C.queueApproval(Object.assign({ pid: 'P1', jobName: 'Sample Reroof', pm: PMREC, to: 'pat@sample-customer.test', subject: 'Hello from GrayCo', html: '<p>Hi {{PORTAL_LINK}}</p>' }, o));

seed();
await q({ id: 'F1', kind: 'final_invoice', meta: { invoiceId: 'INV1', amount: '$5,000.00' } });
MAIL.INV1 = { invoice_id: 'INV1', project_id: 'P1', last_reminder_at: new Date().toISOString(), todo_at: new Date().toISOString(), last_result: 'approval', reminders: 0 };
ok('setup: the final invoice waits for the PM, then an admin', item('F1') && item('F1').step === 'pm' && JSON.stringify(item('F1').steps) === '["pm","admin"]', item('F1'));
let r = await act(PMW, 'approve', 'F1', { noSend: true, device: 'desk · computer · test' });
ok('1. the PM\'s "don\'t send" on a money paper → on to the admin, "don\'t send" noted, nothing sent', r.status === 200 && r.out.noSendAsked && item('F1').status === 'waiting' && item('F1').step === 'admin' && item('F1').noSendAsk && item('F1').noSendAsk.by === 'Demo PM' && item('F1').approvals[0].noSend === true && SENT.length === 0, { r, it: item('F1') });
r = await act(ADM, 'approve', 'F1', { noSend: true, device: 'desk · computer · test' });
const f1 = item('F1');
ok('2. the admin\'s "don\'t send": closed as approved without sending (recorded, noSend), "approved without sending — Wesley Johnson, <when>"', r.status === 200 && r.out.noSend && r.out.sent === false && f1.status === 'recorded' && f1.noSend === true && /^approved without sending — Wesley Johnson, \w{3} \d+, 20\d\d/.test(f1.sentNote) && r.out.invoiceId === 'INV1', { r: r.out, f1 });
const ap = f1.approvals[f1.approvals.length - 1];
ok('2b. the audit: who / e-mail / role / when / device on the approval', ap.by === 'Wesley Johnson' && ap.email === 'wjohnson@grayco-cs.com' && ap.role === 'admin' && ap.at && ap.device === 'desk · computer · test' && ap.noSend === true, ap);
ok('2c. NOTHING was sent (no e-mail, no text) and the final invoice\'s mail row says approved without sending (counts as issued)', SENT.length === 0 && MAIL.INV1.last_result === 'approved without sending' && !!MAIL.INV1.first_sent_at, { SENT: SENT.length, MAIL: MAIL.INV1 });
r = await act(ADM, 'approve', 'F1');
ok('3. it is final: approving it again → 409 (nothing sent)', r.status === 409 && SENT.length === 0, r);
await C.releaseScheduled({ force: true }); await C.escalateDue({ now: Date.now() + 3 * 864e5 });
ok('3b. the 7 AM release and the 24-hour escalation leave it alone', item('F1').status === 'recorded' && !item('F1').escalated && SENT.length === 0, item('F1'));
cset('gc_automation_pause', { on: true }); PZ.reset(); cset('gc_automation_pause', { on: false }); PZ.reset();
await C.releaseScheduled({ force: true });
ok('3c. data-entry mode on → off: nothing that was approved without sending goes out afterwards', item('F1').status === 'recorded' && SENT.length === 0);

/* 4. the 15-day reminders */
await q({ id: 'F2', kind: 'final_invoice', pid: 'P2', jobName: 'Sample Kitchen', to: 'kim@sample-customer.test', meta: { invoiceId: 'INV2' } });
r = await act(ADM, 'approve', 'F2');
ok('4a. control: a normal final invoice approved & sent → 1 e-mail', r.status === 200 && r.out.sent === true && SENT.length === 1, r.out);
MAIL.INV2 = Object.assign(MAIL.INV2 || {}, { invoice_id: 'INV2', project_id: 'P2', first_sent_at: old, last_reminder_at: old, last_result: 'sent', reminders: 0 });
MAIL.INV1.last_reminder_at = old;
const before = list().length;
let rep = null; try { rep = await C.runReminders({ now: Date.now() + 20 * 864e5 }); } catch (e) { rep = { error: String(e && e.stack || e) }; }
const after = list().slice(before);
ok('4b. the reminder run: no reminder (and no approval) for the invoice approved without sending; the normal one gets its reminder approval', rep && !rep.error && !after.some(x => (x.meta || {}).invoiceId === 'INV1') && after.some(x => x.kind === 'final_reminder' && (x.meta || {}).invoiceId === 'INV2') && SENT.length === 1, { rep, after: after.map(x => x.id) });
/* 5. past-due reminders (auto-ar): INVA carries the apprNoSend mark */
let ar = null; try { ar = await AR.run({ now: Date.now() }); } catch (e) { ar = { error: String(e && e.stack || e) }; }
const arIds = list().filter(x => x.kind === 'payment_reminder').map(x => (x.meta || {}).invoiceId || x.id);
ok('5. past-due reminders skip the invoice approved without sending (INVA) and still draft the other (INVB)', ar && !ar.error && !arIds.some(x => /INVA/.test(x)) && arIds.some(x => /INVB/.test(x)), { ar, arIds });

/* 6. roles */
await q({ id: 'L1', kind: 'portal_link', meta: {} });
r = await act(EST, 'approve', 'L1', { noSend: true });
ok('6a. someone who cannot approve it cannot "don\'t send" it either (403)', r.status === 403 && item('L1').status === 'waiting', r);
r = await act(OFF, 'approve', 'L1', { noSend: true, device: 'field · phone · test' });
ok('6b. the office (her kind, any step): approved without sending, role office, final', r.status === 200 && item('L1').status === 'recorded' && item('L1').approvals.slice(-1)[0].role === 'office' && SENT.length === 1, { r: r.out, it: item('L1') });
await q({ id: 'G1', kind: 'portal_publish', meta: {} });
r = await act(ADM, 'approve', 'G1', { noSend: true });
ok('6c. "put in portal" (approving IS the action) has no don\'t-send: 400, still waiting', r.status === 400 && item('G1').status === 'waiting', r);
/* 7. an invoice e-mail (isFinal) with data-entry mode ON */
cset('gc_automation_pause', { on: true }); PZ.reset();
await q({ id: 'I3', kind: 'invoice', pid: 'P2', jobName: 'Sample Kitchen', to: 'kim@sample-customer.test', meta: { invoiceId: 'INV3', isFinal: true }, attachments: [{ kind: 'pdf', invoiceId: 'INV3', name: 'Invoice' }] });
const s0 = SENT.length;
r = await act(ADM, 'approve', 'I3', { noSend: true });
ok('7. an invoice e-mail approved without sending while data-entry mode is on: recorded, mail row upserted, 0 e-mails', r.status === 200 && item('I3').status === 'recorded' && MAIL.INV3 && MAIL.INV3.last_result === 'approved without sending' && SENT.length === s0, { r: r.out, m: MAIL.INV3 });
cset('gc_automation_pause', { on: false }); PZ.reset();

if (NODE_ONLY) { const n = R.filter(Boolean).length; console.log('APPRNOSEND ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1); }

/* ═════ the browser ═════ */
seed(); MAIL.INV1 = { invoice_id: 'INV1', project_id: 'P1', last_reminder_at: new Date().toISOString(), last_result: 'approval' };
await q({ id: 'BF1', kind: 'final_invoice', pm: null, title: '🧾 Final invoice — Sample Reroof', meta: { invoiceId: 'INV1', amount: '$5,000.00' } });   /* no PM step: the admins' */
await q({ id: 'BL1', kind: 'portal_link', title: '🔗 Portal link — Sample Reroof', meta: {} });
await q({ id: 'BL2', kind: 'portal_link', pid: 'P2', jobName: 'Sample Kitchen', to: 'kim@sample-customer.test', title: '🔗 Portal link — Sample Kitchen', meta: {} });
await q({ id: 'BF2', kind: 'final_invoice', pm: null, pid: 'P2', jobName: 'Sample Kitchen', to: 'kim@sample-customer.test', title: '🧾 Final invoice — Sample Kitchen', meta: { invoiceId: 'INV2' } });
await q({ id: 'BG1', kind: 'portal_publish', title: '📄 Put in portal — Sample Reroof', meta: {} });
const invBefore = cget('invs');
cset('invs', invBefore.map(x => x.id === 'INV1' ? Object.assign({}, x, { status: 'draft' }) : x));
const CALLS = [];
const whoOf = e => { const a = H.ACCOUNTS[e] || {}; return { email: e, name: a.name, role: a.role === 'staff' ? 'staff' : a.role }; };
H.onFn('portal', async ({ body, A }) => {
  if (body && body.action === 'approval') { CALLS.push(Object.assign({ who: A.name }, body)); const o = await C.approvalAction(body, whoOf(A.name)); return { status: o.status, body: o.out }; }
  return { ok: true };
});
const AUDIT = 'window.__aud = []; window._gcApprAudit = function(r){ window.__aud.push(r); };';
const errsOf = A => A.errs.filter(e => !/ResizeObserver|Script error/.test(e));
const A = await H.computer('wjohnson@grayco-cs.com', { build: BUILD, init: AUDIT });
await H.signIn(A, 'wjohnson@grayco-cs.com', 20000); await sleep(6000);
await A.ev(() => { try { window._gcApprovalsRefresh(); } catch (e) {} window._setView('approvals'); });
const rowBtns = await H.waitFor(A, () => { const r = document.querySelector('.apx-row[data-k="ap2:BF1"]'); if (!r) return null; const ns = r.querySelector('.gc-nosend'); return ns ? [...r.querySelectorAll('button')].map(b => b.textContent.trim()) : null; }, null, 40000);
ok('8a. desk ✅ Approvals: the final-invoice row has "✅ Approve — don\'t send" next to Approve', !!rowBtns && rowBtns.some(t => /Approve & send/.test(t)) && rowBtns.some(t => /Approve — don.t send/.test(t)), rowBtns);
const pubBtns = await A.ev(() => ({ row: !!document.querySelector('.apx-row[data-k="ap2:BG1"]'), ns: !!document.querySelector('[data-nosend-id="BG1"]'), btn: window._gcApprNoSend.ok((window._gcCustApprovals().all || []).find(x => x.id === 'BG1')) }));
ok('8b. "put in portal" has no don\'t-send button', !pubBtns.ns && pubBtns.btn === false, pubBtns);
if (process.env.GC_SHOTS) await A.page().screenshot({ path: path.join(process.env.GC_SHOTS, 'apprnosend_tab.png') }).catch(() => {});
await A.ev(() => { const b = document.querySelector('.apx-row[data-k="ap2:BF1"] .gc-nosend'); if (b) b.click(); });
await H.waitFor(A, () => !document.querySelector('.apx-row[data-k="ap2:BF1"]'), null, 20000);
const bf = item('BF1');
ok('8c. the click → the server: one approve with noSend (+ device), recorded by Wesley Johnson, nothing sent', CALLS.some(c => c.id === 'BF1' && c.op === 'approve' && c.noSend === true && /desk|field/.test(c.device || '')) && bf.status === 'recorded' && bf.noSendBy === 'Wesley Johnson' && SENT.length === 0, { calls: CALLS, bf });
ok('8d. the confirm said nothing is sent, not now and not later', A.dialogs.some(d => /Approve WITHOUT sending/.test(d.message) && /not now, and not later/.test(d.message)), A.dialogs.map(d => d.message.slice(0, 120)));
const inv = await H.waitFor(A, () => { const i = (window._crm.invoices || []).find(x => x.id === 'INV1'); return i && i.apprNoSend ? { st: i.status, how: i.sentHow, note: i.sentNote, by: i.apprNoSend.by } : null; }, null, 10000);
ok('8e. the invoice counts as issued: status sent, "approved without sending — Wesley Johnson, …"', inv && inv.st === 'sent' && inv.how === 'approved without sending' && /approved without sending — Wesley Johnson/.test(inv.note), inv);
const aud = await A.ev(() => window.__aud);
ok('8f. window._gcApprAudit was called (op approve_nosend, who, when, device)', Array.isArray(aud) && aud.some(a => a.op === 'approve_nosend' && a.id === 'BF1' && a.by === 'Wesley Johnson' && a.at && a.device), aud);
ok('8g. the row is gone and the row\'s row went everywhere (the server list says recorded)', !(await A.ev(() => !!document.querySelector('.apx-row[data-k="ap2:BF1"]'))));
/* 9. the old list (APPR) and the e-mail preview */
await A.ev(() => window._gcOpenApprovals());
const apprHas = await H.waitFor(A, () => { const c = document.querySelector('._apCard[data-id="BL2"]'); return c && c.querySelector('.gc-nosend') ? true : null; }, null, 10000);
ok('9a. the old ✅ Approvals list: the e-mail card has the button', !!apprHas);
await A.ev(() => { const o = document.getElementById('_gcApprOv'); if (o) o.remove(); window._gcAp2Preview('BF2'); });
const pvHas = await H.waitFor(A, () => { const p = document.getElementById('_gcAp2Prev'); return p && p.querySelector('.gc-nosend') ? true : null; }, null, 10000);
ok('9b. the e-mail preview ("Edit before sending") has it too', !!pvHas);
await A.ev(() => { const b = document.querySelector('#_gcAp2Prev .gc-nosend'); if (b) b.click(); });
await H.waitFor(A, () => !document.getElementById('_gcAp2Prev'), null, 10000);
ok('9c. from the preview: recorded, the preview closes, nothing sent', item('BF2').status === 'recorded' && SENT.length === 0, item('BF2'));
/* the office */
const O = await H.computer('office@grayco-cs.com', { build: BUILD });
await H.signIn(O, 'office@grayco-cs.com', 20000); await sleep(6000);
await O.ev(() => { try { window._gcApprovalsRefresh(); } catch (e) {} window._setView('approvals'); });
const ob = await H.waitFor(O, () => { const r = document.querySelector('.apx-row[data-k="ap2:BL1"] .gc-nosend'); return r ? true : null; }, null, 40000);
ok('9d. the office sees the button on her item (portal link)', !!ob);
if (ob) { await O.ev(() => document.querySelector('.apx-row[data-k="ap2:BL1"] .gc-nosend').click()); await H.waitFor(O, () => !document.querySelector('.apx-row[data-k="ap2:BL1"]'), null, 20000); }
ok('9e. the office\'s click: recorded with role office, nothing sent', item('BL1').status === 'recorded' && item('BL1').approvals.slice(-1)[0].role === 'office' && SENT.length === 0, item('BL1'));
/* 10. recently approved */
await A.ev(() => { try { window._gcApprovalsRefresh(); } catch (e) {} });
await sleep(2500);
const rec = await A.ev(() => document.body.innerText.indexOf('approved without sending') >= 0 || document.body.innerHTML.indexOf('🔕') >= 0);
ok('10a. the record shows 🔕 approved without sending', rec);
ok('10b. no page errors', !errsOf(A).length && !errsOf(O).length, errsOf(A).concat(errsOf(O)));
await A.close(); await O.close();
const n = R.filter(Boolean).length; console.log('APPRNOSEND ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
