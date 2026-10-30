/* patch APOFFICE4 tests: node tools/tests/test_APOFFICE4.mjs — made-up people, jobs and customers only; every network call
   is answered by the in-memory fake below (no Supabase, no Resend, nothing leaves this computer).
   Owner 10/30: "all auto text emails invoices whatever we need approved i want office to approve" — every customer /
   outside-facing approval is the office's at ANY step from the moment it is made, and her approval is final; admins can
   still approve; first action wins; owner money / permission kinds (payroll, staff access …; lead assignment is hers since OFFFIX1) are refused to her. */
import { createRequire } from 'module';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');

let passed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); process.exitCode = 1; } }

/* ── the fake cloud: gc_kv rows in memory, Resend counted, everything else an empty answer ── */
const KV = {}, SENT = [];
let tick = 0;
function row(key){ return KV[key] ? [{ key, value: KV[key].value, updated_at: KV[key].at }] : []; }
function res(status, body){ return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }; }
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {};
  await new Promise(r => setImmediate(r));   /* every call takes a turn, so two approvals really interleave */
  if (/api\.resend\.com/.test(url)) { SENT.push(JSON.parse(o.body)); return res(200, { id: 'em_' + SENT.length }); }
  if (/\/rest\/v1\/gc_kv/.test(url)) {
    if ((o.method || 'GET') === 'POST') { const b = JSON.parse(o.body); KV[b.key] = { value: b.value, at: new Date(Date.now() + (++tick)).toISOString() }; return res(201, {}); }
    const eq = /key=eq\.([^&]+)/.exec(url), inn = /key=in\.\(([^)]*)\)/.exec(url);
    if (eq) return res(200, row(decodeURIComponent(eq[1])));
    if (inn) return res(200, decodeURIComponent(inn[1]).split(',').map(k => k.replace(/"/g, '')).flatMap(row));
    return res(200, []);
  }
  return res(200, []);
};
process.env.SUPABASE_URL = 'https://fake-apoffice4.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test_only';
process.env.RESEND_API_KEY = 're_test_only';
delete process.env.PORTAL_MAIL_OFF;

const USERS = [
  { name: 'Steven Park', email: 'steven.test@grayco-cs.com', role: 'Project Manager', active: true },
  { name: 'Brittany Office', email: 'office@grayco-cs.com', role: 'Office Admin', active: true },
  { name: 'Wes Admin', email: 'wes.test@grayco-cs.com', role: 'Admin', active: true },
  { name: 'Eddie Estimator', email: 'eddie.test@grayco-cs.com', role: 'Estimator', active: true }];
function put(key, v){ KV[key] = { value: typeof v === 'string' ? v : JSON.stringify(v), at: new Date(Date.now() + (++tick)).toISOString() }; }
put('users', USERS);
put('projects', [{ id: 'PJ1', name: 'Test Reroof', pm: 'Steven Park', clientEmail: 'customer@example.test' }]);
put('gc_automation_pause', { on: false });

const portal = require(FN + '/portal.js');
const C = portal._core;
const K = require(FN + '/_lib/office-kinds.js');
const PM = { email: 'steven.test@grayco-cs.com', role: 'pm', name: 'Steven Park' };
const OFFICE = { email: 'office@grayco-cs.com', role: 'office', name: 'Brittany Office' };
const OFFICE_CRM = { email: 'office@grayco-cs.com', role: 'staff', name: '' };   /* gc_staff says nothing: the CRM user's role "Office Admin" counts */
const ADMIN = { email: 'wes.test@grayco-cs.com', role: 'admin', name: 'Wes Admin' };
const EST = { email: 'eddie.test@grayco-cs.com', role: 'staff', name: 'Eddie Estimator' };
const PMREC = { name: 'Steven Park', email: 'steven.test@grayco-cs.com' };
let seq = 0;
/* step 'pm' = a job with a PM; step 'admin' = no PM on it (the admins' step from the start) */
async function queue(kind, step, extra){
  const id = 'a4_' + kind + '_' + step + '_' + (++seq);
  const ok = await C.queueApproval(Object.assign({ id, kind, pid: 'PJ1', jobName: 'Test Reroof', pm: step === 'pm' ? PMREC : null, to: 'customer@example.test', subject: 'Hello from GrayCo', html: '<p>Hi there</p>' }, extra || {}));
  assert.ok(ok, 'queued ' + kind);
  assert.strictEqual(item(id).step, step, kind + ' starts at ' + step);
  return id;
}
function list(){ return JSON.parse(KV[C.AQ_KEY].value); }
function item(id){ return list().find(x => x.id === id); }
async function act(who, op, id, extra){
  if (op === 'approve' && /sub_contact/.test(id) && !(extra && extra.share)) extra = Object.assign({ share: [] }, extra || {});   /* the "Your crew" card: approving = the picker's choice */
  try { return await C.approvalAction(Object.assign({ op, id }, extra || {}), who); }
  catch (e) { return { status: 'threw', out: { error: String(e && e.message || e) } }; }   /* a kind's own sender may need more of the cloud: the permission was given */
}
function setItem(id, fn){ const l = list(); fn(l.find(x => x.id === id)); put(C.AQ_KEY, JSON.stringify(l)); }
const officeApproval = id => (item(id).approvals || []).find(a => a.role === 'office' && a.email === 'office@grayco-cs.com');

const ADMIN_ONLY = K.ADMIN_ONLY_KINDS.concat(['payroll_run', 'payroll', 'pay_stub', 'owner_draw', 'bank_transfer', 'cash_move',
  'record_delete', 'job_merge', 'staff_access', 'pay_change', 'contract_override']);
const SAMPLE_SIGN = ['sign_co', 'sign_warranty'];

await t('the lists: office kinds and admin-only kinds never overlap; payroll / staff access / overrides are admin-only; lead assignment is the office\'s (OFFFIX1)', async () => {
  ['lead_assign', 'assign_estimator', 'assign_pm'].forEach(k => { assert.ok(K.isOfficeKind(k) && !K.isAdminOnly(k), k + ' is office work'); });
  ['staff_assign', 'role_assign', 'access_assign', 'permission_change'].forEach(k => { assert.ok(K.isAdminOnly(k), k + ' stays admin-only'); });
  K.OFFICE_KINDS.concat(SAMPLE_SIGN).forEach(k => { assert.ok(K.isOfficeKind(k), k); assert.ok(!K.isAdminOnly(k), k + ' is not admin-only'); });
  ADMIN_ONLY.forEach(k => { assert.ok(K.isAdminOnly(k), k); assert.ok(!K.isOfficeKind(k), k); });
  assert.ok(K.isAdminOnly({ kind: 'thank_you', meta: { payroll: true } }), 'an item marked payroll is payroll');
  ['announcement', 'supplier_po', 'something_new'].forEach(k => { assert.ok(!K.isOfficeKind(k) && !K.isAdminOnly(k), k + ' is on neither list'); });
});

await t('the CRM page carries exactly the same lists (index.html, patch APOFFICE4)', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const off = /var AP4K_OFFICE = (\[[^\]]*\]);/.exec(html), adm = /var AP4K_ADMIN = (\[[^\]]*\]);/.exec(html), re = /var AP4K_ADMIN_RE = \/(.*?)\/, AP4K_PREFIX = \/(.*?)\/;/.exec(html);
  assert.ok(off && adm && re, 'the lists are in index.html');
  assert.deepStrictEqual(JSON.parse(off[1]), K.OFFICE_KINDS); assert.deepStrictEqual(JSON.parse(adm[1]), K.ADMIN_ONLY_KINDS);
  assert.strictEqual(re[1], K.ADMIN_ONLY_RE.source); assert.strictEqual(re[2], K.OFFICE_PREFIX.source);
});

await t('the office approves EVERY customer-facing kind at the PM step at once — final (never "next: admin")', async () => {
  for (const kind of K.OFFICE_KINDS.concat(SAMPLE_SIGN)) {
    const id = await queue(kind, 'pm');
    const r = await act(OFFICE, 'approve', id);
    assert.notStrictEqual(r.status, 403, kind + ': ' + JSON.stringify(r.out));
    assert.ok(!r.out || r.out.next !== 'admin', kind + ' must not wait on an admin after the office');
    assert.ok(officeApproval(id), kind + ': the office approval is recorded');
    assert.strictEqual(officeApproval(id).step, 'pm');
    assert.notStrictEqual(item(id).step, 'admin', kind + ' did not move on to the admin step');
  }
});

await t('the office approves EVERY customer-facing kind at the admin step at once (no 24 h wait), and is final', async () => {
  for (const kind of K.OFFICE_KINDS.concat(SAMPLE_SIGN)) {
    const id = await queue(kind, 'admin');
    assert.ok(!item(id).escalated);
    const r = await act(OFFICE_CRM, 'approve', id);
    assert.notStrictEqual(r.status, 403, kind + ': ' + JSON.stringify(r.out));
    assert.ok(officeApproval(id), kind + ': the office approval is recorded'); assert.strictEqual(officeApproval(id).step, 'admin');
    assert.ok(!item(id).escalated, kind + ': not marked escalated (it never waited)');
  }
});

await t('a money paper (thank-you: PM → admin): the office\'s approval at the PM step sends it — no admin after her', async () => {
  const id = await queue('thank_you', 'pm');
  assert.deepStrictEqual(item(id).steps, ['pm', 'admin']);
  const n0 = SENT.length;
  const r = await act(OFFICE, 'approve', id);
  assert.strictEqual(r.status, 200, JSON.stringify(r.out)); assert.strictEqual(r.out.sent, true);
  assert.strictEqual(SENT.length, n0 + 1); assert.strictEqual(item(id).status, 'sent');
  assert.strictEqual(item(id).approvals.length, 1);
  assert.strictEqual((await act(ADMIN, 'approve', id)).status, 409, 'the admin cannot send it again');
  assert.strictEqual(SENT.length, n0 + 1);
});

await t('after the PM approved a money paper (now at the admin step), the office sends it at once', async () => {
  const id = await queue('final_reminder', 'pm');
  const p = await act(PM, 'approve', id); assert.strictEqual(p.out.next, 'admin');
  const n0 = SENT.length;
  const r = await act(OFFICE, 'approve', id);
  assert.strictEqual(r.status, 200, JSON.stringify(r.out)); assert.strictEqual(r.out.sent, true); assert.strictEqual(SENT.length, n0 + 1);
  assert.deepStrictEqual(item(id).approvals.map(a => a.role), ['pm', 'office']);
});

await t('the office may Edit and Don\'t-approve her kinds at the admin step', async () => {
  const id = await queue('invoice_statement', 'admin');
  const ed = await act(OFFICE, 'edit', id, { edit: { subject: 'Your statement from GrayCo' } });
  assert.strictEqual(ed.status, 200, JSON.stringify(ed.out)); assert.strictEqual(item(id).subject, 'Your statement from GrayCo');
  const rj = await act(OFFICE, 'reject', id, { reason: 'wrong amount' });
  assert.strictEqual(rj.status, 200); assert.strictEqual(item(id).status, 'rejected'); assert.strictEqual(item(id).rejectedEmail, 'office@grayco-cs.com');
  assert.strictEqual((await act(ADMIN, 'approve', id)).status, 409);
});

await t('first action wins: office and admin tap Approve at the same moment → exactly one e-mail', async () => {
  for (const step of ['pm', 'admin']) {
    const id = await queue('lead_first_contact', step);
    const n0 = SENT.length;
    const [a, b] = await Promise.all([act(OFFICE, 'approve', id), act(ADMIN, 'approve', id)]);
    assert.strictEqual([a, b].filter(r => r.out.sent).length, 1, JSON.stringify([a.out, b.out]));
    assert.strictEqual([a, b].filter(r => r.status === 409).length, 1);
    assert.strictEqual(SENT.length, n0 + 1); assert.strictEqual(item(id).status, 'sent'); assert.strictEqual(item(id).approvals.length, 1);
  }
});

await t('first action wins: the admin approves first → the office gets "already sent"; and the other way round', async () => {
  const a = await queue('appt_reminder', 'admin');
  assert.strictEqual((await act(ADMIN, 'approve', a)).out.sent, true);
  assert.strictEqual((await act(OFFICE, 'approve', a)).status, 409);
  const b = await queue('appt_reminder', 'admin');
  assert.strictEqual((await act(OFFICE, 'approve', b)).out.sent, true);
  assert.strictEqual((await act(ADMIN, 'approve', b)).status, 409);
  assert.strictEqual((await act(ADMIN, 'reject', b)).status, 409, 'nor turned down after it went');
});

await t('the office is REFUSED on payroll, staff access and every other admin-only kind — at both steps, approve / edit / reject', async () => {
  for (const kind of ADMIN_ONLY) {
    for (const step of ['admin', 'pm']) {
      const id = await queue(kind, step);
      for (const op of ['approve', 'reject', 'edit']) {
        const r = await act(OFFICE, op, id, op === 'edit' ? { edit: { subject: 'x' } } : {});
        assert.strictEqual(r.status, 403, kind + ' @' + step + ' ' + op + ': ' + JSON.stringify(r.out));
        const r2 = await act(OFFICE_CRM, op, id, op === 'edit' ? { edit: { subject: 'x' } } : {});
        assert.strictEqual(r2.status, 403, kind + ' (CRM office) @' + step + ' ' + op);
      }
      assert.strictEqual(item(id).status, 'waiting'); assert.strictEqual((item(id).approvals || []).length, 0);
    }
  }
});

await t('an admin-only kind is never escalated to the office after 24 h — still refused; an admin approves it', async () => {
  const id = await queue('payroll_run', 'admin');
  const office = await queue('thank_you', 'admin');
  const e = await C.escalateDue({ now: Date.now() + 25 * 3600e3 });
  assert.ok(e.ok); assert.ok(!(e.ids || []).includes(id), 'payroll not escalated'); assert.ok((e.ids || []).includes(office), 'a customer kind still is (it only raises its priority)');
  assert.ok(!item(id).escalated);
  setItem(id, x => { x.adminSince = '2026-01-01T00:00:00Z'; });   /* long past 24 h */
  assert.strictEqual((await act(OFFICE, 'approve', id)).status, 403);
  const r = await act(ADMIN, 'approve', id);
  assert.notStrictEqual(r.status, 403, JSON.stringify(r.out)); assert.strictEqual(item(id).approvals[0].role, 'admin');
});

await t('an admin can approve everything: every office kind and every admin-only kind, at both steps', async () => {
  for (const kind of K.OFFICE_KINDS.concat(ADMIN_ONLY)) {
    for (const step of ['pm', 'admin']) {
      const id = await queue(kind, step);
      const r = await act(ADMIN, 'approve', id);
      assert.notStrictEqual(r.status, 403, kind + ' @' + step + ': ' + JSON.stringify(r.out));
      assert.strictEqual(item(id).approvals[0].role, 'admin', kind);
    }
  }
});

await t('kinds on neither list behave as before: the office takes a PM step only; an admin step needs 24 h', async () => {
  const a = await queue('announcement', 'admin');
  const r = await act(OFFICE, 'approve', a); assert.strictEqual(r.status, 403, JSON.stringify(r.out));
  const b = await queue('supplier_po', 'pm');
  assert.notStrictEqual((await act(OFFICE, 'approve', b)).status, 403);
  assert.strictEqual(officeApproval(b).step, 'pm');
});

await t('others are unchanged: an estimator is refused; the PM still approves his own; a PM cannot take the admin step', async () => {
  const a = await queue('portal_link', 'admin');
  assert.strictEqual((await act(EST, 'approve', a)).status, 403);
  assert.strictEqual((await act(PM, 'approve', a)).status, 403);
  const b = await queue('portal_link', 'pm');
  assert.strictEqual((await act(PM, 'approve', b)).out.sent, true);
  assert.strictEqual((await act(OFFICE, 'approve', b)).status, 409);
});

await t('the 7 AM digest: the office\'s own kinds are in HER list at once (PM step and admin step); payroll never; other PM steps stay a count line', async () => {
  put(C.AQ_KEY, '[]');
  const own = await queue('portal_post', 'pm'), own2 = await queue('final_invoice', 'admin'), opt = await queue('supplier_po', 'pm'), pay = await queue('payroll_run', 'admin');
  setItem(pay, x => { x.escalated = { at: '2026-10-20T00:00:00Z' }; x.adminSince = '2026-10-20T00:00:00Z'; });
  const portalPath = require.resolve(FN + '/portal.js');
  const saved = require.cache[portalPath];
  const l = list();
  require.cache[portalPath] = { id: portalPath, filename: portalPath, loaded: true, exports: { _core: {
    crmData: async () => ({ users: USERS }), kvListRead: async () => ({ list: l }), kvRead: async () => ({}), AQ_KEY: C.AQ_KEY,
    adminEmails: () => ['wes.test@grayco-cs.com'], officeEmails: () => ['office@grayco-cs.com'], pushTo: async () => ({ sent: 0 }) } } };
  const n0 = SENT.length;
  try {
    const D = require(FN + '/_lib/auto-digest.js');
    const rep = await D.run({ now: Date.parse('2026-10-27T13:00:00Z') });
    assert.ok(rep.ok);
  } finally { require.cache[portalPath] = saved; }
  const mails = SENT.slice(n0), to = e => mails.filter(m => m.to.includes(e)).map(m => m.html).join('');
  const has = (h, id) => h.indexOf('appr=' + encodeURIComponent(id)) >= 0;
  const off = to('office@grayco-cs.com');
  assert.ok(has(off, own) && has(off, own2), 'her own kinds are listed');
  assert.ok(!has(off, opt), 'a PM-step supplier PO is not in her list'); assert.match(off, /1 waiting on PMs — optional for you/);
  assert.ok(!has(off, pay), 'payroll is never hers, even escalated');
  assert.ok(has(to('wes.test@grayco-cs.com'), pay) && has(to('wes.test@grayco-cs.com'), own2));
  assert.ok(has(to('steven.test@grayco-cs.com'), own), 'the PM still has his PM step');
});

console.log(passed + ' passed' + (process.exitCode ? ' — FAILURES' : ''));
