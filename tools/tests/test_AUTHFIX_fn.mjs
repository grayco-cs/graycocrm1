// test_AUTHFIX_fn.mjs [build-dir] — patch AUTHFIX: owners and admins pass every staff-function check, consistently.
//   Made-up data, a mocked Supabase (sign-in, gc_staff, gc_kv) in this process; nothing leaves this computer.
//   A. _lib/staff-role.js — the one rule: admin / owner role (any spelling), OWNER_EMAILS (only when set), an extra list;
//      never the Marketing Manager, never an inactive row, never "Office Admin".
//   B. bid-inbox.js staffAuth (also referral.js, crm-health.js …) and portal.js gcStaffAuth (auto-wins.js, lien.js …):
//      owner, admin, office, PM, Marketing Manager, non-staff, expired token, no token, the staff list unreadable.
//   C. auto-wins.js (POST appr-seen / appr-seen-list / run a part) and referral.js (GET list=1, settings POST):
//      each person gets the right answer — and a sign-in problem answers 401 / 503, never "403 Admins only".
//   D. the other admin doors use the same rule: staff-admin (Team access), automation-pause, gc-backup, portal links.
//   On ea805a6 (r17c) the owner-role, expired-token and unreadable-list cases FAIL — that is the bug.
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.resolve(process.argv[2] || path.join(HERE, '../..')), FN = BUILD + '/netlify/functions';
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-test';
process.env.SUPABASE_ANON_KEY = 'anon-test';
delete process.env.OWNER_EMAILS; delete process.env.LEAD_ADMINS; delete process.env.STAFF_EMAILS; delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };

/* ── the mocked Supabase ── */
const STAFF = {
  'owner@grayco-cs.com': { email: 'owner@grayco-cs.com', role: 'owner', active: true, name: 'The Owner', profile: null },
  'owner2@grayco-cs.com': { email: 'owner2@grayco-cs.com', role: 'Owner/Admin', active: true, name: 'Owner Two', profile: null },
  'admin@grayco-cs.com': { email: 'admin@grayco-cs.com', role: 'admin', active: true, name: 'An Admin', profile: null },
  'office@grayco-cs.com': { email: 'office@grayco-cs.com', role: 'staff', active: true, name: 'Office', profile: 'office' },
  'pm@grayco-cs.com': { email: 'pm@grayco-cs.com', role: 'staff', active: true, name: 'A PM', profile: 'pm' },
  'mm@grayco-cs.com': { email: 'mm@grayco-cs.com', role: 'staff', active: false, name: 'Marketing', profile: 'marketing', mkt_active: true },
  'gone@grayco-cs.com': { email: 'gone@grayco-cs.com', role: 'admin', active: false, name: 'Former admin', profile: null }
};
const USERS = [
  { id: 'U1', name: 'The Owner', email: 'owner@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'U2', name: 'Office', email: 'office@grayco-cs.com', role: 'Office', active: true },
  { id: 'U3', name: 'A PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'U4', name: 'Not staff', email: 'outsider@example.com', role: 'Admin', active: true }
];
const KV = { users: JSON.stringify(USERS) };
let STAFF_DOWN = false;
function res(status, body){ const t = typeof body === 'string' ? body : JSON.stringify(body); return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(t), text: async () => t, headers: { get: () => null } }; }
global.fetch = async function(url, opts){
  const u = new URL(String(url)); const m = (opts && opts.method) || 'GET';
  const h = (opts && opts.headers) || {}; const auth = String(h.Authorization || h.authorization || (typeof h.get === 'function' ? h.get('authorization') : '') || '');
  if (u.pathname === '/auth/v1/user') { const e = auth.replace(/^Bearer tok-/, ''); return /@/.test(e) ? res(200, { id: 'id-' + e, email: e }) : res(401, { msg: 'JWT expired' }); }
  if (u.pathname === '/rest/v1/gc_staff') {
    if (STAFF_DOWN) return res(503, { message: 'upstream timeout' });
    const e = decodeURIComponent((u.searchParams.get('email') || '').replace(/^eq\./, ''));
    if (!e) return res(200, Object.values(STAFF));
    return res(200, STAFF[e] ? [STAFF[e]] : []);
  }
  if (u.pathname === '/rest/v1/gc_kv' || u.pathname === '/rest/v1/gc_lead_inbox_kv' || u.pathname === '/rest/v1/gc_admin_kv') {
    if (m === 'GET' || m === 'HEAD') {
      const k = decodeURIComponent((u.searchParams.get('key') || '').replace(/^eq\./, ''));
      return res(200, k in KV ? [{ key: k, value: KV[k], updated_at: '2026-10-30T00:00:00Z', version: 1 }] : []);
    }
    try { const b = JSON.parse(opts.body); (Array.isArray(b) ? b : [b]).forEach(r => { if (r && r.key) KV[r.key] = r.value; }); } catch (e) {}
    return res(201, []);
  }
  if (/^\/rest\/v1\/rpc\//.test(u.pathname)) return res(200, true);
  if (/^\/rest\/v1\//.test(u.pathname)) return res(m === 'GET' ? 200 : 201, []);
  return res(200, {});
};
const tok = e => e === 'EXPIRED' ? 'tok-expired' : 'tok-' + e;
const ev = (who, method, qs, body) => ({ httpMethod: method, headers: Object.assign({ origin: 'https://crm.grayco-cs.com' }, who ? { authorization: 'Bearer ' + tok(who) } : {}), queryStringParameters: qs || {}, body: body ? JSON.stringify(body) : '' });
async function call(h, e){ const r = await h(e); let b = {}; try { b = JSON.parse(r.body || '{}'); } catch (x) {} return { code: r.statusCode, body: b }; }

/* ── A. the one rule ── */
console.log('A. _lib/staff-role.js');
const SR = require(FN + '/_lib/staff-role.js');
for (const r of ['admin', 'Admin', 'ADMIN', 'owner', 'Owner', 'Owner/Admin', 'owner-admin', 'administrator']) ok(SR.isAdminRole(r) === true, 'admin role: ' + r);
for (const r of ['staff', 'office', 'Office Admin', 'Office Manager', 'pm', 'marketing', '', null, 'co-owner-ish', 'admins only']) ok(SR.isAdminRole(r) === false, 'not an admin role: ' + JSON.stringify(r));
ok(SR.isAdmin({ role: 'owner', email: 'x@grayco-cs.com' }) === true, 'an owner counts as an admin');
ok(SR.isAdmin({ role: 'admin', email: 'x@grayco-cs.com', active: false }) === false, 'an inactive row is never an admin');
ok(SR.isAdmin({ role: 'admin', email: 'x@grayco-cs.com', marketing: true }) === false, 'the Marketing Manager is never an admin');
ok(SR.isAdmin({ ok: false, role: 'admin', email: 'x@grayco-cs.com' }) === false, 'a refused sign-in is never an admin');
ok(SR.isAdmin({ role: 'staff', email: 'lead@grayco-cs.com' }, 'lead@grayco-cs.com, other@grayco-cs.com') === true, 'the extra list (LEAD_ADMINS)');
ok(SR.isAdmin({ role: 'staff', email: 'owner9@grayco-cs.com' }) === false, 'OWNER_EMAILS not set: no built-in names');
process.env.OWNER_EMAILS = 'Owner9@grayco-cs.com';
ok(SR.isAdmin({ role: 'staff', email: 'owner9@grayco-cs.com' }) === true, 'OWNER_EMAILS set on Netlify: that owner is an admin');
delete process.env.OWNER_EMAILS;

/* ── B. the two staff checks ── */
console.log('B. staffAuth (bid-inbox.js) and gcStaffAuth (portal.js)');
const BI = require(FN + '/bid-inbox.js'), CORE = require(FN + '/portal.js')._core;
const sa = e => BI._test.staffAuth(ev(e, 'GET')), ga = e => CORE.gcStaffAuth(ev(e, 'GET'));
let w;
for (const e of ['owner@grayco-cs.com', 'owner2@grayco-cs.com', 'admin@grayco-cs.com']) {
  w = await sa(e); ok(w.ok && w.admin === true && w.office === false, 'staffAuth: ' + e + ' → admin', w);
  w = await ga(e); ok(w.ok && w.admin === true, 'gcStaffAuth: ' + e + ' → admin', w);
}
w = await sa('office@grayco-cs.com'); ok(w.ok && !w.admin && w.office === true, 'staffAuth: the office → office, not admin', w);
w = await sa('pm@grayco-cs.com'); ok(w.ok && !w.admin && !w.office, 'staffAuth: a PM → staff only', w);
w = await ga('pm@grayco-cs.com'); ok(w.ok && !w.admin, 'gcStaffAuth: a PM → staff only', w);
w = await sa('mm@grayco-cs.com'); ok(!w.ok && w.code === 403, 'staffAuth: the Marketing Manager is not active staff (403)', w);
w = await sa('gone@grayco-cs.com'); ok(!w.ok && w.code === 403, 'staffAuth: a turned-off admin → 403', w);
w = await sa('outsider@example.com'); ok(!w.ok && w.code === 403, 'staffAuth: non-staff → 403', w);
w = await ga('outsider@example.com'); ok(!w.ok && w.statusCode === 403, 'gcStaffAuth: non-staff → 403', w);
w = await sa('EXPIRED'); ok(!w.ok && w.code === 401, 'staffAuth: expired token → 401', w);
w = await ga('EXPIRED'); ok(!w.ok && w.statusCode === 401, 'gcStaffAuth: expired token → 401', w);
w = await sa(''); ok(!w.ok && w.code === 401, 'staffAuth: no token → 401', w);
STAFF_DOWN = true;
w = await sa('owner@grayco-cs.com'); ok(!w.ok && w.code === 503, 'staffAuth: staff list unreadable → 503 (try again), not 403', w);
w = await ga('owner@grayco-cs.com'); ok(!w.ok && w.statusCode === 503, 'gcStaffAuth: staff list unreadable → 503, not 403', w);
w = await sa('outsider@example.com'); ok(!w.ok, 'staffAuth: staff list unreadable → still refused', w);
STAFF_DOWN = false;

/* ── C. auto-wins and referral ── */
console.log('C. auto-wins.js and referral.js');
const AW = require(FN + '/auto-wins.js'), RF = require(FN + '/referral.js');
const seen = e => call(AW.handler, ev(e, 'POST', {}, { action: 'appr-seen' }));
const seenList = e => call(AW.handler, ev(e, 'POST', {}, { action: 'appr-seen-list' }));
const part = e => call(AW.handler, ev(e, 'POST', {}, { part: 'no-such-part' }));
const refList = e => call(RF.handler, ev(e, 'GET', { list: '1' }));
const EXPECT = {   // [appr-seen, appr-seen-list, run a part, referral list]
  'owner@grayco-cs.com': [200, 200, 200, 200],
  'owner2@grayco-cs.com': [200, 200, 200, 200],
  'admin@grayco-cs.com': [200, 200, 200, 200],
  'office@grayco-cs.com': [200, 200, 403, 200],
  'pm@grayco-cs.com': [200, 403, 403, 403],
  'outsider@example.com': [403, 403, 403, 403],
  'EXPIRED': [401, 401, 401, 401],
  '': [401, 401, 401, 401]
};
for (const e of Object.keys(EXPECT)) {
  const got = [(await seen(e)).code, (await seenList(e)).code, (await part(e)).code, (await refList(e)).code];
  ok(JSON.stringify(got) === JSON.stringify(EXPECT[e]), (e || '(no token)') + ' → ' + EXPECT[e].join(' / '), got);
}
const mm = await refList('mm@grayco-cs.com');
ok(mm.code === 200 && mm.body.readOnly === true, 'referral: the Marketing Manager keeps his read-only view', mm);
let r = await call(AW.handler, ev('EXPIRED', 'POST', {}, { action: 'appr-seen' }));
ok(r.code === 401 && /expired/i.test(r.body.error || ''), 'auto-wins: an expired token says so (was "403 Admins only.")', r);
STAFF_DOWN = true;
r = await seen('owner@grayco-cs.com'); ok(r.code === 503, 'auto-wins: staff list unreadable → 503', r);
r = await refList('owner@grayco-cs.com'); ok(r.code === 503, 'referral: staff list unreadable → 503 (was "403 Not on the staff list")', r);
STAFF_DOWN = false;
r = await call(RF.handler, ev('owner@grayco-cs.com', 'POST', { settings: '1' }, { tiers: [] }));
ok(r.code !== 403 && r.code !== 401, 'referral: the owner changes the program settings', r);
r = await call(RF.handler, ev('pm@grayco-cs.com', 'POST', { settings: '1' }, { tiers: [] }));
ok(r.code === 403, 'referral: a PM cannot change the program settings', r);

/* ── D. the other admin doors ── */
console.log('D. other admin doors use the same rule');
const SA = require(FN + '/staff-admin.js'), AP = require(FN + '/automation-pause.js');
for (const e of ['owner@grayco-cs.com', 'owner2@grayco-cs.com', 'admin@grayco-cs.com']) {
  r = await call(SA.handler, ev(e, 'GET', { action: 'list' })); ok(r.code !== 403 && r.code !== 401, 'staff-admin (Team access) opens for ' + e, r);
  r = await call(AP.handler, ev(e, 'GET', {})); ok(r.code !== 403 && r.code !== 401, 'automation-pause reads for ' + e, r);
}
r = await call(SA.handler, ev('office@grayco-cs.com', 'GET', { action: 'list' })); ok(r.code === 403, 'staff-admin stays shut for the office', r);
r = await call(SA.handler, ev('pm@grayco-cs.com', 'GET', { action: 'list' })); ok(r.code === 403, 'staff-admin stays shut for a PM', r);
r = await call(SA.handler, ev('outsider@example.com', 'GET', { action: 'list' })); ok(r.code === 403, 'staff-admin stays shut for non-staff', r);
r = await call(AP.handler, ev('pm@grayco-cs.com', 'POST', {}, { on: true })); ok(r.code === 403, 'data-entry mode: a PM cannot switch it', r);
const OF = require(FN + '/_lib/office-access.js');
ok(OF.isOfficeRow(STAFF['owner@grayco-cs.com'], USERS, 'owner@grayco-cs.com') === false, 'office-access: an owner is an admin, not "the office"');
const MK = require(FN + '/_lib/mkt.js');
ok(MK.roleOf({ ok: true, role: 'owner', email: 'owner@grayco-cs.com' }, { users: [] }) === 'admin', 'marketing roleOf: an owner → admin');
ok(MK.roleOf({ ok: true, marketing: true, role: 'marketing', email: 'mm@grayco-cs.com' }, { users: [] }) === 'marketing', 'marketing roleOf: the Marketing Manager stays marketing');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
