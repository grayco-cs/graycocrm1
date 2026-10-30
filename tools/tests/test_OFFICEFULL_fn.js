/* patch OFFICEFULL server tests: node tools/tests/test_OFFICEFULL_fn.js — a mocked Supabase (sign-in, gc_staff, gc_kv);
   nothing leaves this computer. Checks:
     1. _lib/office-access.js: who is "the office" (gc_staff profile / role, else the people-list role) — never an admin,
        never the Marketing Manager, never a PM;
     2. bid-inbox.js staffAuth: who.office for the office, not for a PM / an admin;
     3. the business doors open for the office and stay shut for a PM: texts.js (automatic answers, text alerts, call
        order), x10.js (company goal), lead-source.js (review log), bid-inbox.js (bid boards);
     4. what stays admin-only: staff-admin (Team access), automation-pause (data-entry mode), gc-backup ("last"). */
'use strict';
const assert = require('assert');
const path = require('path');
const FN = path.join(__dirname, '../../netlify/functions');
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-test';
process.env.SUPABASE_ANON_KEY = 'anon-test';

/* ── the mocked Supabase ── */
const STAFF = {
  'wjohnson@grayco-cs.com': { email: 'wjohnson@grayco-cs.com', role: 'admin', active: true, name: 'Wesley Johnson', profile: null },
  'office@grayco-cs.com': { email: 'office@grayco-cs.com', role: 'staff', active: true, name: 'Office', profile: null, payroll: true },
  'brit2@grayco-cs.com': { email: 'brit2@grayco-cs.com', role: 'staff', active: true, name: 'Second Office', profile: 'office' },
  'sbiffle@grayco-cs.com': { email: 'sbiffle@grayco-cs.com', role: 'staff', active: true, name: 'Steven Biffle', profile: null },
  'glenn@grayco-cs.com': { email: 'glenn@grayco-cs.com', role: 'staff', active: true, name: 'Glenn', profile: 'estimator' },
  'mm@grayco-cs.com': { email: 'mm@grayco-cs.com', role: 'staff', active: false, name: 'Marketing', profile: 'marketing', mkt_active: true },
  'oldoffice@grayco-cs.com': { email: 'oldoffice@grayco-cs.com', role: 'staff', active: false, name: 'Gone', profile: 'office' }
};
const USERS = [
  { id: 'U1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'U7', name: 'Brittany Pucket', email: 'office@grayco-cs.com', role: 'Office Admin', active: true },
  { id: 'U8', name: 'Office', email: 'office@grayco-cs.com', role: 'Office', active: true },
  { id: 'U5', name: 'Steven Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'U9', name: 'Glenn', email: 'glenn@grayco-cs.com', role: 'Office', active: true }   /* profile estimator wins */
];
const KV = { users: JSON.stringify(USERS) };
const CALLS = [];
function res(status, body){ const t = typeof body === 'string' ? body : JSON.stringify(body); return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(t), text: async () => t, headers: { get: () => null } }; }
global.fetch = async function(url, opts){
  const u = new URL(String(url)); const m = (opts && opts.method) || 'GET';
  CALLS.push(m + ' ' + u.pathname + u.search);
  const auth = String(((opts && opts.headers) || {}).Authorization || ((opts && opts.headers) || {}).authorization || '');
  if (u.pathname === '/auth/v1/user') { const e = auth.replace(/^Bearer tok-/, ''); return STAFF[e] || /@/.test(e) ? res(200, { id: 'id-' + e, email: e }) : res(401, {}); }
  if (u.pathname === '/rest/v1/gc_staff') {
    const e = decodeURIComponent((u.searchParams.get('email') || '').replace(/^eq\./, ''));
    if (!e) return res(200, Object.values(STAFF));
    return res(200, STAFF[e] ? [STAFF[e]] : []);
  }
  if (u.pathname === '/rest/v1/gc_kv' || u.pathname === '/rest/v1/gc_lead_inbox_kv') {
    if (m === 'GET') {
      const k = decodeURIComponent((u.searchParams.get('key') || '').replace(/^eq\./, ''));
      return res(200, k in KV ? [{ key: k, value: KV[k], updated_at: '2026-10-30T00:00:00Z' }] : []);
    }
    try { const b = JSON.parse(opts.body); (Array.isArray(b) ? b : [b]).forEach(r => { if (r && r.key) KV[r.key] = r.value; }); } catch (e) {}
    return res(201, []);
  }
  if (/^\/rest\/v1\//.test(u.pathname)) return res(m === 'GET' ? 200 : 201, []);
  return res(200, {});
};
const ev = (who, method, qs, body) => ({ httpMethod: method, headers: { authorization: 'Bearer tok-' + who, origin: 'https://crm.grayco-cs.com' }, queryStringParameters: qs || {}, body: body ? JSON.stringify(body) : '' });
const OF = require(path.join(FN, '_lib/office-access.js'));

(async () => {
  let n = 0;
  /* ── 1. who is the office ── */
  assert.strictEqual(OF.isOfficeRow(STAFF['brit2@grayco-cs.com'], [], 'brit2@grayco-cs.com'), true, 'profile office');
  assert.strictEqual(OF.isOfficeRow(STAFF['office@grayco-cs.com'], USERS, 'office@grayco-cs.com'), true, 'no profile: people-list role Office Admin');
  assert.strictEqual(OF.isOfficeRow(STAFF['office@grayco-cs.com'], [], 'office@grayco-cs.com'), false, 'no profile, not on the people list');
  assert.strictEqual(OF.isOfficeRow(STAFF['sbiffle@grayco-cs.com'], USERS, 'sbiffle@grayco-cs.com'), false, 'a PM');
  assert.strictEqual(OF.isOfficeRow(STAFF['glenn@grayco-cs.com'], USERS, 'glenn@grayco-cs.com'), false, 'another profile wins over the people list');
  assert.strictEqual(OF.isOfficeRow(STAFF['wjohnson@grayco-cs.com'], USERS, 'wjohnson@grayco-cs.com'), false, 'an admin is not "the office"');
  assert.strictEqual(OF.isOfficeRow(STAFF['mm@grayco-cs.com'], USERS, 'mm@grayco-cs.com'), false, 'the Marketing Manager');
  assert.strictEqual(OF.isOfficeRow(STAFF['oldoffice@grayco-cs.com'], USERS, 'oldoffice@grayco-cs.com'), false, 'turned off');
  assert.strictEqual(OF.isOfficeRow({ email: 'x@grayco-cs.com', role: 'office', active: true }, [], 'x@grayco-cs.com'), true, 'gc_staff role office');
  assert.strictEqual(OF.isOfficeRow(null, USERS, 'office@grayco-cs.com'), false, 'not on the staff list');
  assert.strictEqual(await OF.isOffice('office@grayco-cs.com'), true, 'isOffice reads gc_staff + the people list');
  assert.strictEqual(await OF.isOffice('sbiffle@grayco-cs.com'), false);
  assert.strictEqual(await OF.isOffice('nobody@grayco-cs.com'), false);
  n += 13;

  /* ── 2. bid-inbox staffAuth ── */
  const BI = require(path.join(FN, 'bid-inbox.js'));
  const sa = e => BI._test.staffAuth(ev(e, 'GET'));
  let w = await sa('office@grayco-cs.com'); assert.ok(w.ok && w.office === true && !w.admin, JSON.stringify(w));
  w = await sa('brit2@grayco-cs.com'); assert.ok(w.ok && w.office === true && !w.admin);
  w = await sa('sbiffle@grayco-cs.com'); assert.ok(w.ok && w.office === false && !w.admin);
  w = await sa('wjohnson@grayco-cs.com'); assert.ok(w.ok && w.admin === true && w.office === false);
  n += 4;

  /* ── 3. the business doors ── */
  const TX = require(path.join(FN, 'texts.js'));
  async function code(h, e){ const r = await h(e); return { code: r.statusCode, body: JSON.parse(r.body || '{}') }; }
  for (const q of [{ settings: '1' }, { alerts: '1' }, { callchain: '1' }]) {
    const pm = await code(TX.handler, ev('sbiffle@grayco-cs.com', 'POST', q, { settings: {} }));
    assert.strictEqual(pm.code, 403, 'PM refused ' + JSON.stringify(q) + ' ' + JSON.stringify(pm));
    assert.ok(/admin or the office/.test(pm.body.error), pm.body.error);
    const of = await code(TX.handler, ev('office@grayco-cs.com', 'POST', q, { settings: {} }));
    assert.notStrictEqual(of.code, 403, 'the office passes ' + JSON.stringify(q) + ' ' + JSON.stringify(of));
    n += 2;
  }
  const X10 = require(path.join(FN, 'x10.js'));
  let r = await code(X10.handler, ev('sbiffle@grayco-cs.com', 'POST', {}, { action: 'goal-set', goal: 5000000 }));
  assert.strictEqual(r.code, 403, 'PM cannot set the company goal');
  r = await code(X10.handler, ev('office@grayco-cs.com', 'POST', {}, { action: 'goal-set', goal: 5000000 }));
  assert.strictEqual(r.code, 200, 'the office sets the company goal ' + JSON.stringify(r)); n += 2;
  const LS = require(path.join(FN, 'lead-source.js'));
  r = await code(LS.handler, ev('sbiffle@grayco-cs.com', 'GET', { log: '1' }));
  assert.strictEqual(r.code, 403, 'PM: no lead-source log');
  r = await code(LS.handler, ev('office@grayco-cs.com', 'GET', { log: '1' }));
  assert.strictEqual(r.code, 200, 'the office reads the lead-source log ' + JSON.stringify(r)); n += 2;
  r = await code(BI.handler, ev('sbiffle@grayco-cs.com', 'GET', { sources: '1' }));
  assert.strictEqual(r.code, 403, 'PM: no bid boards');
  r = await code(BI.handler, ev('office@grayco-cs.com', 'GET', { sources: '1' }));
  assert.notStrictEqual(r.code, 403, 'the office sees the bid boards ' + JSON.stringify(r)); n += 2;

  /* ── 4. what stays with the admins ── */
  const SA = require(path.join(FN, 'staff-admin.js'));
  r = await code(SA.handler, ev('office@grayco-cs.com', 'GET', { action: 'list' }));
  assert.strictEqual(r.code, 403, 'Team access stays admin ' + JSON.stringify(r));
  r = await code(SA.handler, ev('office@grayco-cs.com', 'POST', {}, { action: 'add', email: 'new@grayco-cs.com' }));
  assert.strictEqual(r.code, 403, 'adding staff stays admin');
  const AP = require(path.join(FN, 'automation-pause.js'));
  r = await code(AP.handler, ev('office@grayco-cs.com', 'POST', {}, { on: true }));
  assert.strictEqual(r.code, 403, 'data-entry mode stays admin ' + JSON.stringify(r));
  const GB = require(path.join(FN, 'gc-backup.js'));
  r = await code(GB.handler, ev('office@grayco-cs.com', 'POST', {}, { action: 'last' }));
  assert.strictEqual(r.code, 403, 'backups stay admin ' + JSON.stringify(r));
  n += 4;
  console.log('OFFICEFULL fn: ' + n + ' checks passed');
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
