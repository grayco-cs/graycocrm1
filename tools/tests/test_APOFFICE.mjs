/* patch APOFFICE tests: node tools/tests/test_APOFFICE.mjs — made-up people, jobs and customers only; every network call
   is answered by the in-memory fake below (no Supabase, no Resend, nothing leaves this computer).
   Owner 10/28: "anything a PM can approve, the office can approve too" — an approval waiting at the PM step can be taken
   by the job's PM OR the office (or an admin) at once; the first action wins and it is sent ONCE; the office takes the PM
   step only (a money paper still goes on to Wesley or Nick); the admin step still goes to the office only after 24 h. */
import { createRequire } from 'module';
import assert from 'assert';
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
function res(status, body){ return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } }; }
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
process.env.SUPABASE_URL = 'https://fake-apoffice.supabase.co';
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
const PM = { email: 'steven.test@grayco-cs.com', role: 'pm', name: 'Steven Park' };
const OFFICE = { email: 'office@grayco-cs.com', role: 'office', name: 'Brittany Office' };
const OFFICE_CRM = { email: 'office@grayco-cs.com', role: 'staff', name: '' };   /* gc_staff says nothing: the CRM user's role "Office Admin" counts */
const ADMIN = { email: 'wes.test@grayco-cs.com', role: 'admin', name: 'Wes Admin' };
const EST = { email: 'eddie.test@grayco-cs.com', role: 'staff', name: 'Eddie Estimator' };
const PMREC = { name: 'Steven Park', email: 'steven.test@grayco-cs.com' };
async function queue(id, kind){
  const ok = await C.queueApproval({ id, kind, pid: 'PJ1', jobName: 'Test Reroof', pm: PMREC, to: 'customer@example.test', subject: 'Hello from GrayCo', html: '<p>Hi there</p>' });
  assert.ok(ok, 'queued');
}
function item(id){ return JSON.parse(KV[C.AQ_KEY].value).find(x => x.id === id); }
const act = (who, op, id, extra) => C.approvalAction(Object.assign({ op, id }, extra || {}), who);

await t('a PM-step customer item: the office approves it at once → sent once; the PM then cannot send it again', async () => {
  await queue('t1', 'portal_link');
  assert.deepStrictEqual(item('t1').steps, ['pm']);
  const n0 = SENT.length;
  const r = await act(OFFICE, 'approve', 't1');
  assert.strictEqual(r.status, 200, JSON.stringify(r.out)); assert.strictEqual(r.out.sent, true);
  assert.strictEqual(SENT.length, n0 + 1); assert.deepStrictEqual(SENT[SENT.length - 1].to, ['customer@example.test']);
  const x = item('t1'); assert.strictEqual(x.status, 'sent');
  assert.strictEqual(x.approvals.length, 1); assert.strictEqual(x.approvals[0].role, 'office'); assert.strictEqual(x.approvals[0].step, 'pm'); assert.strictEqual(x.approvals[0].email, 'office@grayco-cs.com');
  const r2 = await act(PM, 'approve', 't1');
  assert.strictEqual(r2.status, 409); assert.strictEqual(SENT.length, n0 + 1, 'never a second send');
});

await t('the PM still approves his own; then the office cannot send it again', async () => {
  await queue('t2', 'portal_link');
  const n0 = SENT.length;
  assert.strictEqual((await act(PM, 'approve', 't2')).out.sent, true);
  assert.strictEqual((await act(OFFICE, 'approve', 't2')).status, 409);
  assert.strictEqual(SENT.length, n0 + 1);
});

await t('PM and office tap Approve at the same moment → exactly one e-mail', async () => {
  await queue('t3', 'portal_link');
  const n0 = SENT.length;
  const [a, b] = await Promise.all([act(PM, 'approve', 't3'), act(OFFICE, 'approve', 't3')]);
  assert.strictEqual([a, b].filter(r => r.out.sent).length, 1, JSON.stringify([a.out, b.out]));
  assert.strictEqual(SENT.length, n0 + 1); assert.strictEqual(item('t3').status, 'sent');
});

await t('the office as a CRM user (role "Office Admin") counts too; an estimator does not', async () => {
  await queue('t4', 'portal_link');
  const e = await act(EST, 'approve', 't4'); assert.strictEqual(e.status, 403); assert.match(e.out.error, /the office/);
  assert.strictEqual(item('t4').status, 'waiting');
  const n0 = SENT.length;
  assert.strictEqual((await act(OFFICE_CRM, 'approve', 't4')).out.sent, true); assert.strictEqual(SENT.length, n0 + 1);
});

await t('the office may Edit and Don\'t-approve a PM-step item; after a no, the PM cannot send it', async () => {
  await queue('t5', 'portal_link');
  const ed = await act(OFFICE, 'edit', 't5', { edit: { subject: 'Hello again from GrayCo' } });
  assert.strictEqual(ed.status, 200, JSON.stringify(ed.out)); assert.strictEqual(item('t5').subject, 'Hello again from GrayCo');
  const n0 = SENT.length;
  const rj = await act(OFFICE, 'reject', 't5', { reason: 'wrong customer' });
  assert.strictEqual(rj.status, 200); assert.strictEqual(item('t5').status, 'rejected'); assert.strictEqual(item('t5').rejectedEmail, 'office@grayco-cs.com');
  assert.strictEqual((await act(PM, 'approve', 't5')).status, 409); assert.strictEqual(SENT.length, n0);
});

/* patch APOFFICE4 (owner 10/30) changed this one: a customer-facing money paper (the thank-you) is the office's as a FULL
   approver now — her approval at the PM step sends it (no Wesley / Nick after her). A kind on neither APOFFICE4 list
   still behaves as before: the admin step reaches the office only after 24 h. (tools/tests/test_APOFFICE4.mjs has the rest.) */
await t('a money paper: the office\'s approval is final now (APOFFICE4) — sent at once; an unlisted admin-step kind still needs 24 h', async () => {
  await queue('t6', 'thank_you');
  assert.deepStrictEqual(item('t6').steps, ['pm', 'admin']);
  const n0 = SENT.length;
  const r = await act(OFFICE, 'approve', 't6');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.out.sent, true); assert.ok(r.out.next !== 'admin');
  assert.strictEqual(item('t6').status, 'sent'); assert.strictEqual(SENT.length, n0 + 1);
  assert.strictEqual((await act(PM, 'approve', 't6')).status, 409);
  assert.strictEqual((await act(ADMIN, 'approve', 't6')).status, 409); assert.strictEqual(SENT.length, n0 + 1);
  const ok = await C.queueApproval({ id: 't6b', kind: 'announcement', pid: '', jobName: 'Company', pm: null, to: 'Everyone at GrayCo (CRM)', subject: 'Note', html: '<p>Hi</p>' });
  assert.ok(ok); assert.strictEqual(item('t6b').step, 'admin');
  assert.strictEqual((await act(OFFICE, 'approve', 't6b')).status, 403, 'not before 24 h');
});

await t('the 7 AM digest: a PM-step item is in the PM\'s list; for the office only a "waiting on PMs — optional" count line (APOFFICE2)', async () => {
  await queue('t7', 'supplier_po');   /* patch APOFFICE4: a kind on neither list (a customer-facing kind is now in her own list) */
  const lst = JSON.parse(KV[C.AQ_KEY].value);   /* and one the admins left for 24 h — really the office's */
  lst.push({ id: 't7esc', kind: 'thank_you', title: 'Escalated one', jobId: 'PJ1', pm: 'Steven Park', pmEmail: 'steven.test@grayco-cs.com', steps: ['pm', 'admin'], step: 'admin', escalated: true, approvals: [], status: 'waiting', createdAt: '2026-10-20T00:00:00Z', adminSince: '2026-10-20T00:00:00Z' });
  put(C.AQ_KEY, JSON.stringify(lst));
  const portalPath = require.resolve(FN + '/portal.js');
  const saved = require.cache[portalPath];
  const list = JSON.parse(KV[C.AQ_KEY].value);
  require.cache[portalPath] = { id: portalPath, filename: portalPath, loaded: true, exports: { _core: {
    crmData: async () => ({ users: USERS }), kvListRead: async () => ({ list }), kvRead: async () => ({}), AQ_KEY: C.AQ_KEY,
    adminEmails: () => ['wes.test@grayco-cs.com'], officeEmails: () => ['office@grayco-cs.com'], pushTo: async () => ({ sent: 0 }) } } };
  const n0 = SENT.length;
  try {
    const D = require(FN + '/_lib/auto-digest.js');
    const rep = await D.run({ now: Date.parse('2026-10-27T13:00:00Z') });
    assert.ok(rep.ok);
  } finally { require.cache[portalPath] = saved; }
  const mails = SENT.slice(n0), to = e => mails.filter(m => m.to.includes(e)).map(m => m.html).join('');
  const hits = h => (h.match(/appr=t7(?!esc)/g) || []).length;
  assert.strictEqual(hits(to('steven.test@grayco-cs.com')), 1); assert.strictEqual(hits(to('office@grayco-cs.com')), 0, 'not in the office\'s list');
  assert.match(to('office@grayco-cs.com'), /appr=t7esc/); assert.match(to('office@grayco-cs.com'), /\d+ waiting on PMs — optional for you/);
  assert.doesNotMatch(to('steven.test@grayco-cs.com'), /waiting on PMs/);
  assert.strictEqual(hits(to('wes.test@grayco-cs.com')), 0);
});

console.log(passed + ' passed' + (process.exitCode ? ' — FAILURES' : ''));
