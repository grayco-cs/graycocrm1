// test_APEMAILS.mjs <build-dir> [--node-only] — patch APEMAILS (owner 11/27: "on the account for a customer i can also put
//   accounts [payable] sometimes its more than 1 so when i submit for invoice on my system i also email their accounts payable").
// Made-up customers, jobs and addresses only; nothing leaves this computer (Resend is answered here and counted).
//  server (the REAL portal function + _lib/auto-ar.js in node on an in-memory cloud):
//   1. Head Start has 2 accounts-payable e-mails + 1 client e-mail: the ✅ Approvals invoice e-mail (queueInvoiceMail) is
//      addressed TO both AP addresses, the client in CC; sent (aqSend) the same way;
//   2. an AP address removed from the customer after the e-mail was queued is not sent to; an address the customer removed
//      earlier is never used, even when the job still carries it as its client e-mail;
//   3. no AP on file → the client e-mail (as before); the old single gcInfo.billingEmail alone still routes to AP;
//   4. the past-due reminder (auto-ar) uses the same list; data-entry mode blocks the send;
//   5. an approver can edit "To" as several addresses; a malformed one is refused; everyday kinds are not re-addressed.
//  CRM rule (the index.html block, in node): the same addresses as the server for every case; compose-time re-addressing of an
//   invoice e-mail (window._gcRouteBilling, a Gmail link, _gcEmailInvoiceToClient with its CC); everyday mail untouched;
//   the editing helpers (old single field = row 0, ✕ remembers the removed address).
//  browser (offline harness): Edit Customer shows the two lists (old data as the first row), ＋ adds, an invalid address is
//   marked inline (no popup), ✕ removes, Save keeps them on the customer; ✏️ Edit Project shows them read-only with
//   "✏️ Edit on the customer"; the CRM invoice e-mail goes to both AP addresses with the client in CC; no page errors.
import path from 'path'; import fs from 'fs'; import vm from 'vm'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), NODE_ONLY = process.argv.includes('--node-only');
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs');
const { cset, cget, cloud, resetCloud, sleep } = H;
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };

/* ── the node side ── */
const SENT = [];
let tick = 0;
const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {}; const m = (o.method || 'GET').toUpperCase();
  await new Promise(r => setImmediate(r));
  if (/api\.resend\.com/.test(url)) { SENT.push(JSON.parse(o.body)); return res(200, { id: 'em_' + SENT.length }); }
  const u = new URL(url);
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(x => cloud.set(x.key, { key: x.key, value: x.value, updated_at: new Date(Date.now() + (++tick)).toISOString() })); return res(201, {}); }
    const k = u.searchParams.get('key') || '';
    const keys = k.startsWith('in.') ? dv(k.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')) : [dv(k).replace(/^eq\./, '')];
    return res(200, keys.filter(x => cloud.has(x)).map(x => cloud.get(x)));
  }
  return res(m === 'POST' ? 201 : 200, []);
};
Object.assign(process.env, { SUPABASE_URL: 'https://ieeonhpfahmwwecizdut.supabase.co', SUPABASE_SERVICE_KEY: 'sb_secret_test_only', RESEND_API_KEY: 're_test_only', CUST_QUIET_OFF: '1' });
delete process.env.PORTAL_MAIL_OFF; delete process.env.OWNER_EMAILS;
const FN = path.join(BUILD, 'netlify/functions');
const portal = require(FN + '/portal.js'); const C = portal._core;
const AR = require(FN + '/_lib/auto-ar.js');
const PZ = require(FN + '/_lib/pause.js');
const AM = require(FN + '/_lib/apmail.js');

const USERS = [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }];
const now = new Date().toISOString(), d10 = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
const CUSTS = () => [
  { id: 'C1', name: 'Head Start', email: 'rramos@hs-demo.test', clientEmails: [{ email: 'rramos@hs-demo.test', name: 'Head Start office' }], type: 'commercial',
    gcInfo: { billingEmail: 'ap.sarah@hs-demo.test', apEmails: [{ email: 'ap.sarah@hs-demo.test', name: 'AP — Sarah' }, { email: 'ap.tom@hs-demo.test', name: 'AP — Tom' }], removedEmails: ['old.ap@hs-demo.test'] } },
  { id: 'C2', name: 'Pat Sample', email: 'pat@sample-demo.test', type: 'homeowner', gcInfo: {} },
  { id: 'C3', name: 'Legacy GC', email: 'boss@legacy-demo.test', type: 'gc', gcInfo: { billingEmail: 'billing@legacy-demo.test', billingContact: 'Ann' } },
  { id: 'C4', name: 'Acme Builders', email: '', type: 'gc', gcInfo: { apEmails: [{ email: 'ap@acme-demo.test', name: 'AP' }, { email: 'not-an-email', name: 'typo' }], billingEmail: 'ap@acme-demo.test', removedEmails: ['gone@acme-demo.test'] } }];
const JOBS = () => [
  { id: 'P1', name: 'Head Start Reroof', client: 'Head Start', clientEmail: 'rramos@hs-demo.test', address: '1 Demo Ln', pm: 'Demo PM', status: 'active', autoPO: 'T101', createdAt: now, updatedAt: now },
  { id: 'P2', name: 'Sample Kitchen', client: 'Pat Sample', clientEmail: 'pat@sample-demo.test', address: '2 Demo Ln', pm: 'Demo PM', status: 'active', autoPO: 'T102', createdAt: now, updatedAt: now },
  { id: 'P3', name: 'Legacy Shell', client: 'Legacy GC', clientEmail: 'boss@legacy-demo.test', address: '3 Demo Ln', pm: 'Demo PM', status: 'active', autoPO: 'T103', createdAt: now, updatedAt: now },
  { id: 'P4', name: 'Acme Warehouse', client: 'Acme Builders', clientEmail: 'gone@acme-demo.test', address: '4 Demo Ln', pm: 'Demo PM', status: 'active', autoPO: 'T104', createdAt: now, updatedAt: now }];
const INV = (id, pid, extra) => Object.assign({ id, pid, type: 'client', drawType: 'Deposit', amt: 1000, status: 'sent', invNum: id, date: now.slice(0, 10), createdAt: now }, extra || {});
function seed(){
  resetCloud(); SENT.length = 0;
  cset('users', USERS); cset('customers', CUSTS()); cset('projects', JOBS());
  cset('invs', [INV('INV1', 'P1'), INV('INV2', 'P2'), INV('INV3', 'P3'), INV('INV4', 'P4'), INV('INV5', 'P1', { invNum: 'INV5', date: d10, dueDate: d10 })]);
  cset('gc_automation_pause', { on: false }); PZ.reset();
  cset('gc_approval_queue', '[]');
  try { C._reset(); } catch (e) {}
}
const ADM = { email: 'wjohnson@grayco-cs.com', role: 'admin', name: 'Wesley Johnson' };
const queue = () => { const v = cget('gc_approval_queue'); return typeof v === 'string' ? JSON.parse(v) : (v || []); };
const item = id => queue().find(x => x.id === id);
const toOf = x => [x.to].concat(x.toMore || []);

seed();
/* 1. two AP + one client */
let q = await C.queueInvoiceMail('INV1', ADM);
let it = item('appr_inv_INV1');
ok('1a invoice e-mail queued for Head Start', q && q.out && q.out.queued, q && q.out);
ok('1b TO both accounts-payable addresses', it && JSON.stringify(toOf(it)) === JSON.stringify(['ap.sarah@hs-demo.test', 'ap.tom@hs-demo.test']), it && toOf(it));
ok('1c the client in CC', it && JSON.stringify(it.cc) === JSON.stringify(['rramos@hs-demo.test']), it && it.cc);
let sent = await C.aqSend(it, now);
let last = SENT[SENT.length - 1] || {};
ok('1d sent TO both AP addresses, client in CC', sent.ok && JSON.stringify(last.to) === '["ap.sarah@hs-demo.test","ap.tom@hs-demo.test"]' && JSON.stringify(last.cc) === '["rramos@hs-demo.test"]', { sent, to: last.to, cc: last.cc });
/* 2. removed addresses */
q = await C.queueInvoiceMail('INV1', ADM); // already queued: no second item
const cs = CUSTS(); cs[0].gcInfo.apEmails = cs[0].gcInfo.apEmails.slice(0, 1); cs[0].gcInfo.removedEmails = ['old.ap@hs-demo.test', 'ap.tom@hs-demo.test'];
cset('customers', cs); C._reset(); SENT.length = 0;
sent = await C.aqSend(it, now); last = SENT[SENT.length - 1] || {};
ok('2a AP address removed after queueing → not sent to', sent.ok && JSON.stringify(last.to) === '["ap.sarah@hs-demo.test"]' && !JSON.stringify(last).includes('ap.tom@'), last.to);
await C.queueInvoiceMail('INV4', ADM); it = item('appr_inv_INV4');
ok('2b a job whose client e-mail was removed from the account: TO the account AP, never the removed address', it && JSON.stringify(toOf(it)) === '["ap@acme-demo.test"]' && !JSON.stringify(it.cc || []).includes('gone@'), it && { to: toOf(it), cc: it.cc });
ok('2c a malformed AP address on the customer is never used', it && !JSON.stringify(it).includes('not-an-email'), it && toOf(it));
SENT.length = 0; await C.aqSend(it, now); last = SENT[SENT.length - 1] || {};
ok('2d … and not at send time either', JSON.stringify(last.to) === '["ap@acme-demo.test"]' && !JSON.stringify(last).includes('gone@acme'), { to: last.to, cc: last.cc });
/* 3. no AP / old single billingEmail */
await C.queueInvoiceMail('INV2', ADM); it = item('appr_inv_INV2');
ok('3a no AP on file → the client e-mail, no CC', it && it.to === 'pat@sample-demo.test' && !(it.toMore || []).length && !(it.cc || []).length, it && { to: it.to, more: it.toMore, cc: it.cc });
await C.queueInvoiceMail('INV3', ADM); it = item('appr_inv_INV3');
ok('3b the old single billingEmail still works: TO billing@, the owner in CC', it && it.to === 'billing@legacy-demo.test' && JSON.stringify(it.cc) === '["boss@legacy-demo.test"]', it && { to: it.to, cc: it.cc });
/* 4. auto-ar past-due reminder */
seed();
const rep = await AR.run({ now: Date.now() });
it = queue().find(x => x.kind === 'payment_reminder' && x.meta && x.meta.invoiceId === 'INV5');
ok('4a past-due reminder (auto-ar) queued, not sent', rep && rep.queued >= 1 && it && SENT.length === 0, { rep, n: SENT.length });
ok('4b … TO both AP addresses, client in CC', it && JSON.stringify(toOf(it)) === '["ap.sarah@hs-demo.test","ap.tom@hs-demo.test"]' && JSON.stringify(it.cc) === '["rramos@hs-demo.test"]', it && { to: toOf(it), cc: it.cc });
cset('gc_automation_pause', { on: true }); PZ.reset();
SENT.length = 0; await C.aqSend(it, now);
ok('4c data-entry mode: nothing goes out', SENT.length === 0, SENT.length);
cset('gc_automation_pause', { on: false }); PZ.reset();
/* 5. approver edits / everyday kinds */
seed();
await C.queueInvoiceMail('INV2', ADM);
let ae = await C.approvalAction({ op: 'edit', id: 'appr_inv_INV2', edit: { to: 'pat@sample-demo.test, nope' } }, ADM);
ok('5a an approver\'s malformed To address is refused', ae.status === 400 && /does not look right/.test(ae.out.error), ae);
ae = await C.approvalAction({ op: 'edit', id: 'appr_inv_INV2', edit: { to: 'pat@sample-demo.test, spouse@sample-demo.test' } }, ADM);
it = item('appr_inv_INV2');
ok('5b an approver may type several To addresses (kept as typed)', ae.status === 200 && it && JSON.stringify(toOf(it)) === '["pat@sample-demo.test","spouse@sample-demo.test"]', { ae: ae.out && ae.out.error, it: it && toOf(it) });
SENT.length = 0; await C.aqSend(it, now); last = SENT[SENT.length - 1] || {};
ok('5c … and it is sent to both', JSON.stringify(last.to) === '["pat@sample-demo.test","spouse@sample-demo.test"]', last.to);
const data = { customers: CUSTS(), projects: JOBS() };
const plain = AM.addressItem(data, JOBS()[0], { kind: 'job_update', to: 'rramos@hs-demo.test' });
ok('5d everyday mail (a job update) is not re-addressed', plain.to === 'rramos@hs-demo.test' && !plain.toMore && !plain.cc, plain);
const typed = AM.billTo(data, JOBS()[0], 'someone.else@other-demo.test');
ok('5e an address typed on purpose (not on the account) is used as it is', typed.custom && JSON.stringify(typed.to) === '["someone.else@other-demo.test"]' && !typed.cc.length, typed);

/* ── the CRM rule: the index.html block, in node ── */
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const i0 = html.indexOf('GrayCo — SEVERAL CLIENT E-MAILS AND SEVERAL ACCOUNTS-PAYABLE E-MAILS PER CUSTOMER');
const src = html.slice(html.lastIndexOf('<script>', i0) + 8, html.indexOf('</script>', i0));
const got = { inv: null, compose: null };
const win = { _crm: { customers: CUSTS(), projects: JOBS() }, _graycoCustomers: CUSTS(), console: { log(){}, warn(){} },
  _gcRouteBilling: (to) => ({ to: String(to || ''), cc: '', changed: false, why: 'subap' }),
  _gcReaddress: function(url){ const u = new URL(url); const r = win._gcRouteBilling(u.searchParams.get('to'), u.searchParams.get('su'), u.searchParams.get('body')); if (!r.changed) return url; u.searchParams.set('to', r.to); u.searchParams.set('cc', (u.searchParams.get('cc') ? u.searchParams.get('cc') + ',' : '') + r.cc); return u.toString(); },
  _gcEmailInvoiceToClient: (inv, opts) => { got.inv = { inv, opts }; return 'sent'; },
  _gcCompose: (o) => { got.compose = o; return true; } };
const ctx = { window: win, document: {}, location: { href: 'http://app.local/' }, URL, URLSearchParams, console: win.console, Date, JSON, Math, Object, Array, String, RegExp };
vm.createContext(ctx); vm.runInContext(src, ctx);
const W = win._gcAcctMail;
ok('6a the CRM block loaded (window._gcAcctMail)', !!W && typeof win._gcAMEditor === 'function' && typeof win._gcAMJobPanel === 'function');
const same = (a, b) => JSON.stringify({ to: a.to, cc: a.cc }) === JSON.stringify({ to: b.to, cc: b.cc });
const parity = JOBS().map(p => { const a = W.billTo(p, p.clientEmail), b = AM.billTo(data, p, p.clientEmail); return { pid: p.id, ok: same(a, b), crm: [a.to, a.cc], srv: [b.to, b.cc] }; });
ok('6b the CRM and the server address every job the same', parity.every(x => x.ok), parity);
let r = win._gcRouteBilling('rramos@hs-demo.test', 'Invoice #T101-1 from GrayCo', '');
ok('6c compose time: an invoice to the client → TO both AP, client in CC', r && r.changed && r.to === 'ap.sarah@hs-demo.test,ap.tom@hs-demo.test' && r.cc === 'rramos@hs-demo.test', r);
r = win._gcRouteBilling('rramos@hs-demo.test', 'Schedule for Monday', 'The crew arrives at 8');
ok('6d everyday mail is not touched (SUBAP decides, unchanged)', r && !r.changed && r.why === 'subap', r);
r = win._gcRouteBilling('pat@sample-demo.test', 'Invoice #T102-1', '');
ok('6e no AP → unchanged (the client)', r && !r.changed && r.to === 'pat@sample-demo.test', r);
r = win._gcRouteBilling('gone@acme-demo.test', 'Past due invoice', '');
ok('6f a removed address is re-addressed to the account AP, never kept', r && r.changed && r.to === 'ap@acme-demo.test' && !/gone@/.test(r.cc), r);
const g = win._gcReaddress('https://mail.google.com/mail/?view=cm&fs=1&to=rramos%40hs-demo.test&cc=billing%40grayco-cs.com&su=Invoice%20T101&body=x');
const gu = new URL(g);
ok('6g a Gmail invoice link: to = both AP, cc = billing@ + the client (each once)', gu.searchParams.get('to') === 'ap.sarah@hs-demo.test,ap.tom@hs-demo.test' && gu.searchParams.get('cc') === 'billing@grayco-cs.com,rramos@hs-demo.test', g);
win._gcEmailInvoiceToClient({ id: 'INV1', pid: 'P1', clientEmail: 'rramos@hs-demo.test', client: 'Head Start', amt: 1000 }, {});
ok('6h the CRM invoice e-mail: both AP addresses, the client as CC', got.inv && got.inv.inv.clientEmail === 'ap.sarah@hs-demo.test, ap.tom@hs-demo.test' && got.inv.opts.cc === 'rramos@hs-demo.test', got.inv);
win._gcCompose({ to: 'rramos@hs-demo.test', subject: 'Invoice #T101-1', body: 'attached', pid: 'P1' });
ok('6i "✉️ Send from your own e-mail" with an invoice: AP in To, client in CC', got.compose && got.compose.to === 'ap.sarah@hs-demo.test, ap.tom@hs-demo.test' && got.compose.cc === 'rramos@hs-demo.test', got.compose);
win._gcCompose({ to: 'rramos@hs-demo.test', subject: 'See you Monday', body: '', pid: 'P1' });
ok('6j … an everyday note stays with the client', got.compose && got.compose.to === 'rramos@hs-demo.test' && !got.compose.cc, got.compose);
const legacy = { name: 'L', email: 'boss@l-demo.test', gcInfo: { billingEmail: 'bill@l-demo.test' } };
ok('6k old data shows as the first row of each list', JSON.stringify(W.edRows(legacy, 'ap')) === '[{"email":"bill@l-demo.test","name":""}]' && W.edRows(legacy, 'client')[0].email === 'boss@l-demo.test');
let z = W.setRows(legacy, 'ap', W.edRows(legacy, 'ap').concat([{ email: 'ap2@l-demo.test', name: 'AP — Kim' }]));
z = W.setRows(z, 'ap', W.edRows(z, 'ap').slice(1), 'bill@l-demo.test');
ok('6l ✕ on the first AP row: billingEmail becomes the next one, the removed address is remembered', z.gcInfo.billingEmail === 'ap2@l-demo.test' && z.gcInfo.removedEmails.includes('bill@l-demo.test'), z.gcInfo);
z = win._gcAMSet1(z, 'client', 'new.boss@l-demo.test');
ok('6m typing in the old Email box changes row 0 of the client list', z.email === 'new.boss@l-demo.test' && z.clientEmails[0].email === 'new.boss@l-demo.test', z);
const n2 = win._gcAMNorm(W.setRows(z, 'ap', W.edRows(z, 'ap').concat([{ email: '', name: '' }, { email: 'bill@l-demo.test', name: 'back' }])));
ok('6n Save: blank rows dropped, a re-added address is no longer "removed", a save stamp', n2.gcInfo.apEmails.length === 2 && !n2.gcInfo.removedEmails.includes('bill@l-demo.test') && !!n2.updatedAt, n2.gcInfo);
ok('6o no timers in the CRM block', !/setInterval|setTimeout|__GC_BEAT|__GC_WAIT\(/.test(src));

/* ── browser ── */
if (!NODE_ONLY) {
  H.resetCloud();
  H.cset('users', [{ id: 'U2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, payType: 'owner' }]);
  H.cset('projects', JOBS()); H.cset('customers', CUSTS());
  const MAILS = [];
  H.onFn('send-email', ({ body }) => { MAILS.push(body); return { ok: true, id: 'em_test' }; });
  let c;
  try {
    c = await H.computer('DESK', { build: BUILD, init: [() => { window.addEventListener('error', ev => { try { (window.__amErrs = window.__amErrs || []).push(String(ev.error && ev.error.stack || ev.message).slice(0, 900)); } catch (e) {} }); }] });
    await H.signIn(c, 'wjohnson@grayco-cs.com', 9000);
    await H.waitFor(c, () => window._crm && (window._crm.projects || []).length >= 4 && (window._crm.customers || window._graycoCustomers || []).length >= 4 ? 1 : 0, null, 60000);
    await sleep(2000);
    const e0 = c.errs.length;
    /* Customers → ✏️ Legacy GC */
    await c.ev(() => window._setView('customers')); await sleep(1500);
    const opened = await c.ev(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '✏️' && /Legacy GC/.test((x.closest('tr') || x.parentElement.parentElement || {}).textContent || '')); if (b) b.click(); return !!b; });
    await sleep(800);
    const ed = () => c.ev(() => { const box = document.querySelector('[data-gc-amed]'); if (!box) return null; const v = k => [...box.querySelectorAll('input[data-gc-amemail="' + k + '"]')].map(i => i.value); return { client: v('client'), ap: v('ap'), bad: [...box.querySelectorAll('[data-gc-ambad]')].map(x => x.textContent), bg: getComputedStyle(box).backgroundColor }; });
    let E = await ed();
    ok('7a Edit Customer shows the two lists; old data is the first row', opened && E && E.ap[0] === 'billing@legacy-demo.test' && E.client[0] === 'boss@legacy-demo.test', { opened, E });
    ok('7b light, not navy', E && E.bg === 'rgb(255, 255, 255)', E && E.bg);
    await c.ev(() => document.querySelector('[data-gc-amadd="ap"]').click()); await sleep(300);
    const typeInto = async (sel, idx, txt, more) => { await c.ev(([sel, idx, more]) => { const i = document.querySelectorAll(sel)[idx]; i.focus(); if (more) { const n = i.value.length; try { i.setSelectionRange(n, n); } catch (e) {} } else i.select && i.select(); }, [sel, idx, !!more]); await c.page().keyboard.type(txt, { delay: 15 }); await sleep(250); };
    c.page().on('pageerror', e => console.log('  page error stack: ' + String(e && e.stack || e).slice(0, 900)));
    await typeInto('input[data-gc-amemail="ap"]', 1, 'ap2@legacy-demo');
    E = await ed();
    ok('7c an unfinished address is marked inline (no popup)', E && E.bad.some(t => /Not an e-mail/.test(t)) && c.dialogs.length === 0, { E, d: c.dialogs });
    await typeInto('input[data-gc-amemail="ap"]', 1, '.test', true);
    await typeInto('input[data-gc-amname="ap"]', 1, 'AP — Kim');
    E = await ed();
    ok('7d … and the mark goes once it is a real address', E && !E.bad.length && E.ap[1] === 'ap2@legacy-demo.test', E);
    await c.ev(() => document.querySelector('[data-gc-amadd="client"]').click()); await sleep(200);
    await typeInto('input[data-gc-amemail="client"]', 1, 'pm@legacy-demo.test');
    await c.ev(() => document.querySelectorAll('[data-gc-amdel="ap"]')[0].click()); await sleep(300);
    E = await ed();
    ok('7e ✕ removes a row (the next one moves up into Billing Email)', E && E.ap.length === 1 && E.ap[0] === 'ap2@legacy-demo.test', E);
    await c.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /Save Customer/.test(x.textContent)); b && b.click(); }); await sleep(1500);
    const rec = await c.ev(() => { const L = (window._graycoCustomers && window._graycoCustomers.length ? window._graycoCustomers : (window._crm.customers || [])); const x = L.find(y => y && y.id === 'C3'); return x ? { ap: x.gcInfo.apEmails, be: x.gcInfo.billingEmail, rm: x.gcInfo.removedEmails, cl: x.clientEmails, em: x.email } : null; });
    ok('7f Save keeps the lists on the customer (billingEmail = first AP, removed remembered)', rec && rec.be === 'ap2@legacy-demo.test' && rec.ap.length === 1 && rec.ap[0].name === 'AP — Kim' && rec.rm.includes('billing@legacy-demo.test') && rec.cl.length === 2 && rec.em === 'boss@legacy-demo.test', rec);
    /* ✏️ Edit Project on Head Start's job */
    await c.ev(() => window._setView('projects')); await sleep(1200);
    await c.ev(() => { const j = window._crm.projects.find(x => x && x.id === 'P1'); window._openJobDetail(j); }); await sleep(1800);
    await c.ev(() => { const bt = [...document.querySelectorAll('main button')].find(x => /Edit Project/.test(x.textContent)); bt && bt.click(); }); await sleep(900);
    const JP = await c.ev(() => { const b = document.querySelector('[data-gc-amjob]'); return b ? { text: b.textContent, chips: [...b.querySelectorAll('[data-gc-amchip]')].map(x => x.textContent), edit: !!b.querySelector('[data-gc-amedit]') } : null; });
    ok('7g Edit Project shows the account AP + client e-mails, read-only, with "✏️ Edit on the customer"', JP && JP.chips.some(t => /ap\.sarah@/.test(t)) && JP.chips.some(t => /ap\.tom@/.test(t)) && JP.chips.some(t => /rramos@/.test(t)) && JP.edit && /TO ap\.sarah@hs-demo\.test, ap\.tom@hs-demo\.test · CC rramos@hs-demo\.test/.test(JP.text), JP);
    /* the CRM invoice e-mail */
    MAILS.length = 0;
    await c.ev(() => window._gcEmailInvoiceToClient({ id: 'INV1', pid: 'P1', clientEmail: 'rramos@hs-demo.test', client: 'Head Start', amt: 1000 }, {}));
    await H.waitFor(c, () => 1, null, 300); await sleep(800);
    const m = MAILS[MAILS.length - 1] || {};
    ok('7h CRM invoice e-mail: TO both AP addresses, the client in CC', JSON.stringify(m.to) === '["ap.sarah@hs-demo.test","ap.tom@hs-demo.test"]' && JSON.stringify(m.cc) === '["rramos@hs-demo.test"]', { to: m.to, cc: m.cc, n: MAILS.length });
    /* known on main (r49) too: AP2's news line on the desk Edit Customer form throws "reading '<the customer e-mail>'" */
    const newErrs = c.errs.slice(e0).filter(m => !/^Cannot read properties of undefined \(reading '[^']+@[^']+'\)$/.test(m));
    ok('7i no new page errors', !newErrs.length, newErrs);
    const disk = await c.ev(async () => { const L = (await window.idbGet('customers')) || []; const x = L.find(y => y && y.id === 'C3'); return x && x.gcInfo ? { ap: (x.gcInfo.apEmails || []).length, be: x.gcInfo.billingEmail } : null; });
    ok('7j … and on this computer\'s saved copy', disk && disk.ap === 1 && disk.be === 'ap2@legacy-demo.test', disk);
  } catch (e) { ok('browser part ran', false, String(e && e.stack || e)); }
  finally { try { await c.close(); } catch (e) {} }
}
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
