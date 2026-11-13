// test_SUBACCT.mjs [build-dir] [shot-dir] — patch SUBACCT (owner 11/13: "make sure as admin I can look up all password logins and profiles
// and reset passwords, delete accounts etc in sub portal, make sure I have a sub portal tab in systems or somewhere in CRM").
// Offline: the REAL server functions (sub-accounts.js, subportal.js, portal-access.js) on an in-memory Supabase (auth admin API,
// PostgREST tables, gc_kv) and Resend. Made-up data only.
//  N. server: every action (list / get / update / reset-link / set-password / approve / disable / enable / signout-all / link /
//     portal-link / delete / log); owners only (403 for plain staff; the office may only look); no hash / token / reset link /
//     password ever in an answer or the audit list; "turned off" and "signed out everywhere" honored by BOTH sign-in paths
//     (bid site: subportal.js; sub portal: portal-access.js — password, code, link, device session).
//  B. the CRM section (Chromium; the real gc-patch-subacct block from index.html on a stubbed page): the list, filters, search,
//     the profile, ✉️ reset link, a temporary password shown once, delete with the typed company name, the office read-only.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
const SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', RESEND_API_KEY: 're_test', CUST_QUIET_OFF: '1' });
delete process.env.PORTAL_MAIL_OFF; delete process.env.OWNER_EMAILS; delete process.env.STAFF_EMAILS;
const now = () => new Date().toISOString();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ═════ the in-memory Supabase ═════ */
let AUTH, TOK, T, KV, MAIL, PUTS;
const SUB1 = { id: 'SUBsam1', name: 'Sample Drywall LLC', company: 'Sample Drywall LLC', contact: 'Sam Sample', email: 'sam@sampledrywall.test', phone: '901-555-0141', isSub: true, trade: 'Drywall' };
const SUB2 = { id: 'SUBpaint2', name: 'Pending Paint Co', company: 'Pending Paint Co', email: 'office@pendingpaint.test', phone: '901-555-0177', isSub: true, trade: 'Paint' };
const JOB = { id: 'PSAMPLE1', name: 'Sample Kitchen', address: '1 Sample St', client: 'Pat Sample', pm: 'Sample PM', status: 'Active', subs: [{ subId: SUB1.id, name: SUB1.name, status: 'Awarded' }] };
const sp = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now() }, extra || {});
function fresh(){
  AUTH = [
    { id: 'auth-sam', email: 'sam@sampledrywall.test', pw: 'Old-Pass-111', created_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-11-10T14:00:00Z', user_metadata: { portal: 'sub' }, encrypted_password: '$2a$10$SECRETHASH', identities: [{ id: 'x', identity_data: { sub: 'secret' } }] },
    { id: 'auth-bob', email: 'bob@pendingpaint.test', pw: 'Bob-Pass-222', created_at: '2026-11-12T09:00:00Z', last_sign_in_at: null, user_metadata: { portal: 'sub' }, encrypted_password: '$2a$10$SECRETHASH2' },
    { id: 'auth-orph', email: 'orphan@broken.test', pw: 'x', created_at: '2026-11-11T09:00:00Z', user_metadata: { portal: 'sub' }, encrypted_password: '$2a$10$SECRETHASH3' },
    { id: 'auth-admin', email: 'owner@grayco.test', pw: 'staff', created_at: '2026-01-01T00:00:00Z', user_metadata: {} }
  ];
  TOK = { 'tok-admin': 'owner@grayco.test', 'tok-office': 'office@grayco.test', 'tok-pm': 'pm@grayco.test' };
  KV = { vendors: [SUB1, SUB2], projects: [JOB], users: [{ id: 'u1', name: 'Sample PM', email: 'pm@grayco.test', role: 'Project Manager', active: true }, { id: 'u2', name: 'Ofelia Office', email: 'office@grayco.test', role: 'Office Manager', active: true }],
    gc_sub_portal_settings: { deviceCode: 'off' } };
  T = {
    gc_staff: [{ email: 'owner@grayco.test', name: 'Owen Owner', role: 'admin', active: true }, { email: 'office@grayco.test', name: 'Ofelia Office', role: 'office', active: true }, { email: 'pm@grayco.test', name: 'Sample PM', role: 'staff', profile: 'pm', active: true }],
    sp_rows: [
      sp('users', 'u_sam', { id: 'u_sam', authUserId: 'auth-sam', role: 'sub', approved: true, email: 'sam@sampledrywall.test', name: 'Sam Sample', company: 'Sample Drywall LLC', phone: '901-555-0141', trades: ['Drywall'], createdAt: '2026-10-01T10:00:00Z', lang: 'en' }, { user_id: 'u_sam', email: 'sam@sampledrywall.test' }),
      sp('users', 'u_bob', { id: 'u_bob', authUserId: 'auth-bob', role: 'sub', approved: false, email: 'bob@pendingpaint.test', name: 'Bob Brush', company: 'Brush Bros Painting', phone: '901-555-0199', trades: ['Paint'], createdAt: '2026-11-12T09:00:00Z' }, { user_id: 'u_bob', email: 'bob@pendingpaint.test' }),
      sp('users', 'st_owner', { id: 'st_owner', role: 'admin', approved: true, email: 'owner@grayco.test', name: 'Owen Owner' }, { user_id: 'st_owner', email: 'owner@grayco.test' }),
      sp('subdocs', 'u_sam', { items: [{ id: 'd1', type: 'w9', fileRef: 'u/u_sam/w9.pdf', fileName: 'w9.pdf' }, { id: 'd2', type: 'insurance_general', fileRef: 'u/u_sam/gl.pdf', expirationDate: '2027-05-01' }] }, { user_id: 'u_sam' }),
      sp('subdocs', 'u_bob', { items: [{ id: 'd3', type: 'w9', fileRef: 'u/u_bob/w9.pdf' }] }, { user_id: 'u_bob' }),
      sp('bids', 'b1', { id: 'b1', jobId: 'J1', userId: 'u_bob', amount: 1000 }, { user_id: 'u_bob', job_id: 'J1' })
    ],
    gc_sub_link: [{ token: 'L'.repeat(43), sub_id: SUB1.id, sub_name: SUB1.name, revoked: false, created_at: '2026-10-02T00:00:00Z', last_viewed_at: '2026-11-11T00:00:00Z' }],
    gc_portal_session: [], gc_sub_device: [], gc_portal_code: [], gc_portal_lock: [], gc_portal_login: [], gc_portal: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], gc_sub_portal: []
  };
  MAIL = []; PUTS = [];
}
fresh();
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
const banned = a => a && a.banned_until && Date.parse(a.banned_until) > Date.now();
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return res(200, { id: 'em' + MAIL.length }); }
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') {
    const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, '');
    const e = TOK[a]; const au = e && AUTH.find(x => x.email === e);
    return e ? res(200, { id: au ? au.id : 'auth-' + e, email: e }) : res(401, { msg: 'invalid JWT' });
  }
  if (u.pathname === '/auth/v1/token') {
    const b = JSON.parse(init.body); const a = AUTH.find(x => x.email === String(b.email).toLowerCase());
    if (!a || a.pw !== b.password) return res(400, { error: 'invalid_grant' });
    if (banned(a)) return res(400, { error: 'user_banned', error_description: 'User is banned' });
    return res(200, { access_token: mkTok(a.email, Math.floor(Date.now() / 1000)), user: { id: a.id, email: a.email } });
  }
  if (u.pathname === '/auth/v1/admin/users' && m === 'GET') { const page = +q.get('page') || 1, per = +q.get('per_page') || 50; return res(200, { users: AUTH.slice((page - 1) * per, page * per), aud: 'authenticated' }); }
  const am = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(u.pathname);
  if (am) {
    const a = AUTH.find(x => x.id === dv(am[1])); if (!a) return res(404, { msg: 'User not found' });
    if (m === 'GET') return res(200, a);
    if (m === 'DELETE') { AUTH.splice(AUTH.indexOf(a), 1); return res(200, {}); }
    if (m === 'PUT') { const b = JSON.parse(init.body); PUTS.push(Object.assign({ id: a.id }, b));
      if (b.password !== undefined) { if (String(b.password).length < 6) return res(422, { msg: 'Password should be at least 6 characters' }); a.pw = b.password; }
      if (b.ban_duration !== undefined) a.banned_until = b.ban_duration === 'none' ? null : new Date(Date.now() + 1e10).toISOString();
      return res(200, a); }
  }
  if (u.pathname === '/auth/v1/admin/generate_link') { const b = JSON.parse(init.body); const a = AUTH.find(x => x.email === b.email); return a ? res(200, { action_link: 'https://sb.test/auth/v1/verify?token=RECOVERYSECRET&type=recovery&redirect_to=' + encodeURIComponent(b.redirect_to) }) : res(404, { msg: 'User not found' }); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = x.value; }); return res(201, null); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: 'T0' })));
  }
  if (u.pathname.startsWith('/storage/v1/')) return res(400, {});
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm) {
    const tb = T[tm[1]] || (T[tm[1]] = []);
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { const i = r.key ? tb.findIndex(x => x.key === r.key) : -1; if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); }); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dv(v.slice(3)));
      else if (v.startsWith('neq.')) rows = rows.filter(r => String(r[k]) !== dv(v.slice(4)));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > dv(v.slice(3)));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    if (m === 'DELETE') { rows.forEach(r => tb.splice(tb.indexOf(r), 1)); return res(204, ''); }
    return res(200, rows);
  }
  return res(404, {});
};
function mkTok(email, amrSec){ const t = 'h.' + b64u({ amr: [{ method: 'password', timestamp: amrSec }], iat: amrSec, email }) + '.s' + crypto.randomBytes(3).toString('hex'); TOK[t] = email; return t; }
const SA = require(path.join(BUILD, 'netlify/functions/sub-accounts.js'));
const SPF = require(path.join(BUILD, 'netlify/functions/subportal.js'));
const PA = require(path.join(BUILD, 'netlify/functions/portal-access.js'));
const resetPA = () => { try { PA._core._reset(); } catch (e) {} };
let IP = 0;
const sa = async (tok, body) => { const r = await SA.handler({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://crm.grayco-cs.com' }, tok ? { authorization: 'Bearer ' + tok } : {}), body: JSON.stringify(body) }); return { st: r.statusCode, b: JSON.parse(r.body || '{}'), raw: r.body }; };
const spf = async (tok, body) => { const r = await SPF.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + tok, 'x-nf-client-connection-ip': '10.9.' + (IP++ % 250) + '.1' }, body: JSON.stringify(body) }); return { st: r.statusCode, b: JSON.parse(r.body || '{}') }; };
const pa = async (body, headers) => { resetPA(); const r = await PA.handler({ httpMethod: 'POST', headers: Object.assign({ 'x-nf-client-connection-ip': '10.8.' + (IP++ % 250) + '.1' }, headers || {}), body: JSON.stringify(body) }); return { st: r.statusCode, b: JSON.parse(r.body || '{}') }; };
const prof = id => (T.sp_rows.find(r => r.key === 'users/' + id) || {}).data;
const live = sid => T.gc_portal_session.filter(x => x.sub_id === sid && !x.revoked).length;
const addSession = sid => { const tk = crypto.randomBytes(32).toString('base64url'); T.gc_portal_session.push({ id: sha(tk), kind: 'partner', ident: null, sub_id: sid, links: ['L'.repeat(43)], created_at: now(), expires_at: new Date(Date.now() + 864e5).toISOString(), revoked: false }); return tk; };
const SECRETS = /SECRETHASH|encrypted_password|RECOVERYSECRET|identit|refresh_token|access_token/;

/* ═════ N. the server ═════ */
{
  let r = await sa('', { action: 'list' });
  ok('N1 no CRM sign-in → 401', r.st === 401, r);
  r = await sa('tok-pm', { action: 'list' });
  ok('N1 plain staff (a PM) → 403 even to look', r.st === 403, r);
  r = await sa('tok-office', { action: 'list' });
  ok('N1 the office may look (list) — read-only (canEdit false)', r.st === 200 && r.b.canEdit === false && r.b.accounts.length === 3, r.b);
  for (const a of ['update', 'reset-link', 'set-password', 'approve', 'disable', 'enable', 'signout-all', 'link', 'portal-link', 'delete']) {
    const x = await sa('tok-office', { action: a, id: 'u_sam', confirm: 'Sample Drywall LLC', generate: true, set: { name: 'X' } });
    const y = await sa('tok-pm', { action: a, id: 'u_sam', confirm: 'Sample Drywall LLC', generate: true });
    if (!(x.st === 403 && y.st === 403)) ok('N1 ' + a + ' is owners only (office + PM → 403)', false, { x, y });
  }
  ok('N1 every change (update, reset, set-password, approve, disable, enable, sign out, link, portal link, delete) → 403 for the office and a PM', AUTH.find(a => a.id === 'auth-sam').pw === 'Old-Pass-111' && !!prof('u_sam') && !PUTS.length && !MAIL.length);

  r = await sa('tok-admin', { action: 'list' });
  const L = r.b.accounts || [], sam = L.find(x => x.id === 'u_sam'), bob = L.find(x => x.id === 'u_bob'), orph = L.find(x => x.status === 'orphan');
  ok('N2 an owner lists every sub account (bid site + sub portal) — 3: approved, pending, a sign-in without a profile; no staff', r.st === 200 && r.b.canEdit === true && L.length === 3 && sam && bob && orph && !L.some(x => /grayco\.test/.test(x.email)), L.map(x => [x.id, x.status]));
  ok('N2 the row: company, contact, e-mail, phone, trades, status, CRM sub, portal link, last sign-in, created, papers',
    sam.company === 'Sample Drywall LLC' && sam.name === 'Sam Sample' && sam.email === 'sam@sampledrywall.test' && sam.phone && sam.trades[0] === 'Drywall' && sam.status === 'approved'
    && sam.crm && sam.crm.id === SUB1.id && sam.link.on === true && sam.lastSignInAt === '2026-11-10T14:00:00Z' && /2026-10-01/.test(sam.createdAt) && sam.papers.w9 && sam.papers.w9.ok && sam.papers.gl && sam.papers.gl.exp === '2027-05-01' && !sam.papers.wc, sam);
  ok('N2 pending: ⏳, not in the CRM, link off', bob.status === 'pending' && !bob.crm && !bob.link.on && !bob.lastSignInAt, bob);
  ok('N2 counts for the filters', r.b.counts.all === 3 && r.b.counts.pending === 1 && r.b.counts.approved === 1 && r.b.counts.orphan === 1 && r.b.counts.unlinked === 1, r.b.counts);
  ok('N2 no password hash, token, identity or reset link in the answer', !SECRETS.test(r.raw), r.raw.match(SECRETS));
  r = await sa('tok-admin', { action: 'list', filter: 'pending' }); ok('N3 filter ⏳ pending → Bob only', r.b.accounts.length === 1 && r.b.accounts[0].id === 'u_bob', r.b.accounts.map(x => x.id));
  r = await sa('tok-admin', { action: 'list', filter: 'unlinked' }); ok('N3 filter "not in CRM" → Bob only', r.b.accounts.length === 1 && r.b.accounts[0].id === 'u_bob');
  r = await sa('tok-admin', { action: 'list', q: 'drywall' }); ok('N3 search "drywall" → Sam', r.b.accounts.length === 1 && r.b.accounts[0].id === 'u_sam');
  r = await sa('tok-admin', { action: 'list', q: '5550199' }); ok('N3 search by phone digits → Bob', r.b.accounts.length === 1 && r.b.accounts[0].id === 'u_bob');
  r = await sa('tok-admin', { action: 'list', per: 10, page: 2 }); ok('N3 paged (page 2 of 1 → empty, total kept)', r.b.accounts.length === 0 && r.b.total === 3);

  addSession(SUB1.id);
  r = await sa('tok-admin', { action: 'get', id: 'u_sam' });
  ok('N4 get: the profile, the sign-in (last sign-in), devices, papers', r.st === 200 && r.b.profile.company === 'Sample Drywall LLC' && r.b.auth.lastSignInAt && r.b.sessions === 1 && r.b.papers.length === 2 && !SECRETS.test(r.raw), r.b);
  r = await sa('tok-office', { action: 'get', id: 'u_sam' }); ok('N4 the office may open a profile (read-only)', r.st === 200 && r.b.canEdit === false);
  r = await sa('tok-admin', { action: 'get', id: '../users' }); ok('N4 a bad id → 400', r.st === 400);
  r = await sa('tok-admin', { action: 'get', id: 'u_none' }); ok('N4 an unknown id → 404', r.st === 404);

  r = await sa('tok-admin', { action: 'update', id: 'u_sam', set: { company: 'Sample Drywall & Paint LLC', phone: '901-555-0142', trades: ['Drywall', 'Paint'], lang: 'es', businessCity: 'Memphis', businessState: 'tn', role: 'admin', approved: false, email: 'evil@x.test', authUserId: 'zzz' } });
  let p = prof('u_sam');
  ok('N5 update: the contact fields change (company, phone, trades, language, address) — never role, approval, e-mail or the sign-in',
    r.st === 200 && p.company === 'Sample Drywall & Paint LLC' && p.phone === '901-555-0142' && p.trades.join() === 'Drywall,Paint' && p.lang === 'es' && p.businessState === 'TN'
    && p.role === 'sub' && p.approved === true && p.email === 'sam@sampledrywall.test' && p.authUserId === 'auth-sam', { r: r.b, p });

  r = await sa('tok-admin', { action: 'reset-link', id: 'u_sam' });
  ok('N6 ✉️ reset link: e-mailed to the sub from GrayCo (in their language), the link itself never in the answer', r.st === 200 && r.b.sent && MAIL.length === 1 && MAIL[0].to.includes('sam@sampledrywall.test') && /type=recovery/.test(MAIL[0].html) && /contraseña/i.test(MAIL[0].subject) && !SECRETS.test(r.raw), { r: r.b, m: MAIL.map(x => x.subject) });

  /* set-password: generated, shown once; old sign-ins end on BOTH sites */
  const oldBidTok = mkTok('sam@sampledrywall.test', Math.floor(Date.now() / 1000) - 3600);
  r = await spf(oldBidTok, { action: 'me' }); ok('N7 (before) Sam is signed in on the bid site', r.st === 200 && r.b.user && r.b.user.id === 'u_sam', r);
  const sess0 = addSession(SUB1.id);
  await sleep(2100);
  r = await sa('tok-admin', { action: 'set-password', id: 'u_sam', generate: true, mustChange: true });
  const newPw = r.b.password;
  ok('N7 🎲 temporary password: made, set on the Supabase sign-in, returned once', r.st === 200 && /^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/.test(newPw || '') && AUTH.find(a => a.id === 'auth-sam').pw === newPw && PUTS.some(x => x.id === 'auth-sam' && x.password === newPw), r.b);
  p = prof('u_sam');
  ok('N7 the profile asks them to change it (bid site prompt) — the password itself is not stored anywhere', p.suggestPasswordChange === true && p.tempPasswordAt && !JSON.stringify(T.sp_rows).includes(newPw) && !JSON.stringify(KV).includes(newPw), p);
  ok('N7 every sub-portal device of theirs was signed out', live(SUB1.id) === 0 && r.b.ended >= 2, { live: live(SUB1.id), ended: r.b.ended });
  r = await spf(oldBidTok, { action: 'me' }); ok('N7 the bid site refuses the sign-in made before the reset (401 → sign in again)', r.st === 401, r);
  r = await pa({ action: 'signin-password', email: 'sam@sampledrywall.test', password: 'Old-Pass-111' }); ok('N7 the old password no longer opens the sub portal', r.st === 401, r);
  r = await pa({ action: 'signin-password', email: 'sam@sampledrywall.test', password: newPw }); ok('N7 the temporary password opens the sub portal', r.st === 200 && r.b.kind === 'partner' && r.b.session, r);
  const newBidTok = mkTok('sam@sampledrywall.test', Math.floor(Date.now() / 1000) + 1);
  r = await spf(newBidTok, { action: 'me' }); ok('N7 …and the bid site (a sign-in made after it), with the change-password prompt flag', r.st === 200 && r.b.user.suggestPasswordChange === true, r);
  r = await sa('tok-admin', { action: 'set-password', id: 'u_sam', password: 'short1' }); ok('N7 a typed password that is too short → 400', r.st === 400, r);
  r = await sa('tok-admin', { action: 'set-password', id: 'u_sam', password: 'lettersonly' }); ok('N7 a typed password with no number → 400', r.st === 400, r);
  r = await sa('tok-admin', { action: 'set-password', id: 'u_sam', password: 'Typed-Pass-77', mustChange: false });
  ok('N7 a typed password is set; the answer does not echo it; "ask to change" off', r.st === 200 && !('password' in r.b) && AUTH.find(a => a.id === 'auth-sam').pw === 'Typed-Pass-77' && prof('u_sam').suggestPasswordChange === false, r.b);

  /* disable / enable — honored by the bid site and every door of the sub portal */
  addSession(SUB1.id);
  r = await sa('tok-admin', { action: 'disable', id: 'u_sam' });
  p = prof('u_sam');
  ok('N8 ⏸ off: Supabase ban + profile flag + gc_sub_signin_off for their CRM sub + devices signed out', r.st === 200 && r.b.disabled && banned(AUTH.find(a => a.id === 'auth-sam')) && p.signinDisabled === true && KV.gc_sub_signin_off.ids[SUB1.id] && live(SUB1.id) === 0, { b: r.b, off: KV.gc_sub_signin_off });
  r = await spf(mkTok('sam@sampledrywall.test', Math.floor(Date.now() / 1000) + 5), { action: 'me' }); ok('N8 bid site: refused (401, "turned off")', r.st === 401 && /turned off/.test(r.b.error), r);
  r = await pa({ action: 'signin-password', email: 'sam@sampledrywall.test', password: 'Typed-Pass-77' }); ok('N8 sub portal password sign-in: refused', r.st === 401 || r.st === 403, r);
  r = await pa({ action: 'open' }, { 'x-portal-token': 'L'.repeat(43) }); ok('N8 sub portal link: refused ("turned off")', r.st === 403 && /turned off/.test(r.b.error), r);
  const sx = addSession(SUB1.id);
  r = await pa({ action: 'p-home' }, { 'x-portal-session': sx }); ok('N8 a device session made some other way still opens nothing', r.st === 403, r);
  const codes0 = T.gc_portal_code.length;
  r = await pa({ action: 'signin-start', who: 'sam@sampledrywall.test' }); ok('N8 code sign-in: no code is made or sent', r.st === 200 && T.gc_portal_code.length === codes0 && !MAIL.some(m => /code/i.test(m.subject) && m.to.includes('sam@sampledrywall.test')), { codes: T.gc_portal_code.length });
  r = await sa('tok-admin', { action: 'list', filter: 'disabled' }); ok('N8 the list shows 🔒 off', r.b.accounts.length === 1 && r.b.accounts[0].status === 'disabled');
  r = await sa('tok-admin', { action: 'enable', id: 'u_sam' });
  ok('N8 ▶ on again: unbanned, flag cleared, off-list cleared', r.st === 200 && !banned(AUTH.find(a => a.id === 'auth-sam')) && prof('u_sam').signinDisabled === false && !Object.keys(KV.gc_sub_signin_off.ids).length, { b: r.b, off: KV.gc_sub_signin_off });
  r = await pa({ action: 'open' }, { 'x-portal-token': 'L'.repeat(43) }); ok('N8 the sub portal link opens again', r.st === 200 && r.b.kind === 'partner' && r.b.session, r);
  r = await spf(mkTok('sam@sampledrywall.test', Math.floor(Date.now() / 1000) + 5), { action: 'me' }); ok('N8 the bid site lets them in again', r.st === 200, r);

  /* sign out everywhere */
  addSession(SUB1.id); const before = live(SUB1.id);
  const bidTok2 = mkTok('sam@sampledrywall.test', Math.floor(Date.now() / 1000) - 10);
  await sleep(2100);
  r = await sa('tok-admin', { action: 'signout-all', id: 'u_sam' });
  ok('N9 🚪 sign out everywhere: sub-portal devices ended', r.st === 200 && before > 0 && live(SUB1.id) === 0 && r.b.ended === before, { before, b: r.b });
  r = await spf(bidTok2, { action: 'me' }); ok('N9 …and the bid site sign-in from before → 401', r.st === 401, r);

  /* link + portal link */
  r = await sa('tok-admin', { action: 'link', id: 'u_bob', crmSubId: 'SUBnope' }); ok('N10 link to a CRM sub that does not exist → 404', r.st === 404, r);
  r = await sa('tok-admin', { action: 'link', id: 'u_bob', crmSubId: SUB2.id });
  ok('N10 🔗 link Bob to the CRM sub (profile.crmSubId — the portal\'s strong link)', r.st === 200 && r.b.crm.id === SUB2.id && prof('u_bob').crmSubId === SUB2.id, r.b);
  r = await sa('tok-admin', { action: 'list', filter: 'unlinked' }); ok('N10 Bob is no longer "not in CRM"', r.b.accounts.length === 0);
  r = await sa('tok-admin', { action: 'portal-link', id: 'u_bob', on: true });
  ok('N11 🔌 sub-portal link on (for the linked CRM sub)', r.st === 200 && r.b.on && /#t=/.test(r.b.url) && T.gc_sub_link.some(l => l.sub_id === SUB2.id && !l.revoked), r.b);
  r = await sa('tok-admin', { action: 'portal-link', id: 'u_bob', on: false });
  ok('N11 🔌 off', r.st === 200 && r.b.on === false && !T.gc_sub_link.some(l => l.sub_id === SUB2.id && !l.revoked));

  /* approve (the same s-bids-approve) */
  MAIL.length = 0;
  r = await sa('tok-admin', { action: 'approve', id: 'u_bob', approve: true });
  ok('N12 ✅ approve = the same s-bids-approve (profile approved, the approval e-mail)', r.st === 200 && prof('u_bob').approved === true && prof('u_bob').bidsApprovedBy && MAIL.some(m => m.to.includes('bob@pendingpaint.test')), { b: r.b, mail: MAIL.map(m => m.subject) });

  /* delete */
  r = await sa('tok-admin', { action: 'delete', id: 'u_bob', confirm: 'Brush Bros' });
  ok('N13 🗑 delete with the wrong company name → 400, nothing removed', r.st === 400 && !!prof('u_bob') && AUTH.some(a => a.id === 'auth-bob'), r);
  r = await sa('tok-admin', { action: 'delete', id: 'u_bob', confirm: '  brush bros painting ', linkOff: true });
  ok('N13 🗑 delete (company name typed): the sign-in and the profile are gone', r.st === 200 && r.b.deleted && !prof('u_bob') && !AUTH.some(a => a.id === 'auth-bob'), r.b);
  ok('N13 the CRM Subs record, their papers row (not asked) and their bids stay', KV.vendors.some(v => v.id === SUB2.id) && T.sp_rows.some(x => x.key === 'subdocs/u_bob') && T.sp_rows.some(x => x.key === 'bids/b1'));
  r = await sa('tok-admin', { action: 'delete', id: 'auth:auth-orph', confirm: 'nope@x.test' }); ok('N13 a sign-in without a profile: wrong e-mail → 400', r.st === 400);
  r = await sa('tok-admin', { action: 'delete', id: 'auth:auth-orph', confirm: 'orphan@broken.test' }); ok('N13 …the right e-mail → deleted', r.st === 200 && !AUTH.some(a => a.id === 'auth-orph'), r);
  r = await sa('tok-admin', { action: 'list' }); ok('N13 the list now: Sam only', r.b.accounts.length === 1 && r.b.accounts[0].id === 'u_sam', r.b.accounts.map(x => x.id));

  r = await sa('tok-office', { action: 'log' });
  const log = r.b.log || [];
  const acts = log.map(e => e.action);
  ok('N14 the audit list: who / when / what for every change', ['update', 'reset-link', 'set-password', 'disable', 'enable', 'signout-all', 'link', 'portal-link-on', 'portal-link-off', 'approve', 'delete'].every(a => acts.includes(a)) && log.every(e => e.at && e.by === 'owner@grayco.test'), acts);
  ok('N14 no password, hash or reset link in the audit list', !JSON.stringify(KV.gc_sub_acct_log).includes(newPw) && !JSON.stringify(KV.gc_sub_acct_log).includes('Typed-Pass-77') && !SECRETS.test(JSON.stringify(KV.gc_sub_acct_log)));
  r = await sa('tok-admin', { action: 'bogus', id: 'u_sam' }); ok('N15 an unknown action → 400', r.st === 400);
}

/* ═════ B. the CRM section in a browser ═════ */
const NM = process.env.NODE_PATH && fs.existsSync(path.join(process.env.NODE_PATH, 'playwright')) ? process.env.NODE_PATH : '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules';
const { chromium } = require(path.join(NM, 'playwright'));
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const blk = (/<script id="gc-patch-subacct">[\s\S]*?<\/script>/.exec(html) || [''])[0];
ok('B0 the gc-patch-subacct block is in index.html', blk.length > 1000);
ok('B0 🧭 Systems has the 🔐 Sub portal accounts tile; Admin section id subacct', /k: 'subacct', ic: '🔐', b: 'Sub portal accounts'/.test(html) && /if \(k === 'subacct'\)/.test(html) && /id: 'subacct', after: 'security'/.test(blk));
const subMatch = fs.readFileSync(path.join(BUILD, 'sub-match.js'), 'utf8');
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
async function page(tok, admin){
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', async rt => {
    const rq = rt.request(), u = new URL(rq.url());
    if (u.pathname === '/.netlify/functions/sub-accounts') { const out = await SA.handler({ httpMethod: 'POST', headers: rq.headers(), body: rq.postData() || '' }); return rt.fulfill({ status: out.statusCode, contentType: 'application/json', body: out.body }); }
    if (u.pathname === '/sub-match.js') return rt.fulfill({ status: 200, contentType: 'text/javascript', body: subMatch });
    if (u.pathname === '/') return rt.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div class="gcsub-ph"><b>Sub portal</b></div><div id="gc-sys-bp"><div class="bar"></div></div><div id="box"></div>'
      + '<script>window.__GC_AUTH__ = { fresh: function(){ return Promise.resolve({ access_token: ' + JSON.stringify(tok) + ' }); }, isAdmin: function(){ return ' + (admin ? 'true' : 'false') + '; } };'
      + 'window._gcIsOfficeFull = function(){ return ' + (admin ? 'false' : 'true') + '; }; window.__opened = 0; window._gcAdm = { open: function(id){ window.__opened = id; } };'
      + 'window._gcAdmAddSection = function(c){ window.__sec = c; return true; }; window.__bidsubs = []; window._gcBidSubs = { run: function(o){ window.__bidsubs.push(o); return Promise.resolve({}); }, approved: function(b){ window.__bidsubs.push(b); return Promise.resolve({}); } };</script>'
      + '<script src="/sub-match.js"></script>' + blk + '</body></html>' });
    return rt.abort('blockedbyclient');
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  p.on('dialog', d => d.accept());
  await p.goto('http://crm.test/');
  return p;
}
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }).catch(() => {}); };
const rows = p => p.$$eval('#gc-sa tr[data-sa-row]', l => l.map(x => x.getAttribute('data-sa-row')));
try {
  fresh(); MAIL = [];
  const P = await page('tok-admin', true);
  ok('B1 the section registers in Admin (🔐 Sub portal accounts, after 🛡 Security)', await P.evaluate(() => !!(window.__sec && window.__sec.id === 'subacct' && window.__sec.t === 'Sub portal accounts')));
  await P.evaluate(() => window.__sec.render(document.getElementById('box')));
  await P.waitForSelector('#gc-sa tr[data-sa-row]', { timeout: 15000 });
  ok('B1 it lists every account (3)', (await rows(P)).length === 3, await rows(P));
  const txt = await P.textContent('#gc-sa');
  ok('B1 it says plainly that passwords are never readable', /Passwords are never stored readable/.test(txt));
  ok('B1 the columns: company, contact, e-mail, status, CRM sub, last sign-in, papers', /Sample Drywall LLC/.test(txt) && /Sam Sample/.test(txt) && /sam@sampledrywall\.test/.test(txt) && /Approved/.test(txt) && /Pending approval/.test(txt) && /not in CRM/.test(txt) && /W-9 ✓/.test(txt));
  await P.waitForFunction(() => document.querySelector('[data-subacct-link=subs]') && document.querySelector('[data-subacct-link=bp]'), null, { timeout: 5000 }).catch(() => {});
  await P.click('[data-subacct-link=subs]').catch(() => {});
  ok('B1 Subs → Sub portal and 🏗 Bid portal get a "🔐 Sub portal accounts" button that opens the section', await P.evaluate(() => window.__opened === 'subacct' && !!document.querySelector('[data-subacct-link=bp]')));
  await shot(P, 'subacct_list');
  await P.click('#gc-sa [data-sa=filter][data-f=pending]');
  await P.waitForFunction(() => document.querySelectorAll('#gc-sa tr[data-sa-row]').length === 1, null, { timeout: 8000 }).catch(() => {});
  ok('B2 filter ⏳ Pending → 1 row (Bob)', JSON.stringify(await rows(P)) === '["u_bob"]', await rows(P));
  await P.click('#gc-sa [data-sa=filter][data-f=all]');
  await P.fill('#gc-sa [data-sa=q]', 'drywall');
  await P.waitForFunction(() => document.querySelectorAll('#gc-sa tr[data-sa-row]').length === 1, null, { timeout: 8000 }).catch(() => {});
  ok('B2 search "drywall" → Sam', JSON.stringify(await rows(P)) === '["u_sam"]', await rows(P));
  await P.click('#gc-sa tr[data-sa-row="u_sam"]');
  await P.waitForSelector('#gc-sa-sheet [data-sa-act=resetlink]', { timeout: 10000 });
  const st = await P.textContent('#gc-sa-sheet');
  ok('B3 the profile sheet: login, "never readable", last sign-in, CRM sub, papers, editable contact fields', /never readable/.test(st) && /Sample Drywall LLC/.test(st) && /W-9|w9/i.test(st) && !!(await P.$('#gc-sa-sheet [data-sa-f=phone]')), st.slice(0, 300));
  await P.fill('#gc-sa-sheet [data-sa-f=phone]', '901-555-0100');
  await P.click('#gc-sa-sheet [data-sa-act=save]');
  await P.waitForFunction(() => !document.querySelector('#gc-sa-sheet [data-sa-busy]'), null, { timeout: 8000 });
  await sleep(300);
  ok('B3 💾 Save profile changes the phone on the server', prof('u_sam').phone === '901-555-0100', prof('u_sam').phone);
  await P.click('#gc-sa-sheet [data-sa-act=resetlink]');
  await P.waitForFunction(() => Array.prototype.some.call(document.querySelectorAll('[data-sa-toast]'), t => /Reset link sent/.test(t.textContent)), null, { timeout: 8000 }).catch(() => {});
  ok('B4 ✉️ E-mail a reset link → sent to the sub', MAIL.some(m => m.to.includes('sam@sampledrywall.test') && /type=recovery/.test(m.html)), MAIL.map(m => m.subject));
  await P.waitForSelector('#gc-sa-sheet [data-sa-act=genpw]:not([disabled])');
  await P.click('#gc-sa-sheet [data-sa-act=genpw]');
  await P.waitForSelector('#gc-sa-sheet [data-sa-pw]', { timeout: 10000 });
  const shown = (await P.textContent('#gc-sa-sheet [data-sa-pw]')).trim();
  ok('B5 🎲 temporary password shown once, the same one the sign-in now has', shown && shown === AUTH.find(a => a.id === 'auth-sam').pw && /not be shown again/.test(await P.textContent('#gc-sa-sheet [data-sa-temp]')), { shown });
  await shot(P, 'subacct_temp_password');
  await P.click('#gc-sa-sheet [data-sa-act=hidepw]');
  ok('B5 "Done — hide it" → gone', !(await P.$('#gc-sa-sheet [data-sa-pw]')));
  await P.click('#gc-sa-sheet [data-sa-act=close]');
  await P.click('#gc-sa tr[data-sa-row="u_sam"]');
  await P.waitForSelector('#gc-sa-sheet [data-sa-act=resetlink]');
  ok('B5 reopened: the password is not shown again (and not in the page)', !(await P.$('#gc-sa-sheet [data-sa-pw]')) && !(await P.content()).includes(shown));
  await P.click('#gc-sa-sheet [data-sa-act=close]');
  /* delete Bob */
  await P.fill('#gc-sa [data-sa=q]', '');
  await P.waitForFunction(() => document.querySelectorAll('#gc-sa tr[data-sa-row]').length === 3, null, { timeout: 8000 });
  await P.click('#gc-sa tr[data-sa-row="u_bob"]');
  await P.waitForSelector('#gc-sa-sheet [data-sa-act=delask]:not([disabled])');
  await P.click('#gc-sa-sheet [data-sa-act=delask]');
  await P.fill('#gc-sa-sheet [data-sa-del]', 'Brush');
  await P.click('#gc-sa-sheet [data-sa-act=delete]');
  await sleep(300);
  ok('B6 🗑 delete with the wrong name → refused in the sheet, nothing deleted', /exactly/.test(await P.textContent('#gc-sa-sheet [data-sa-err]').catch(() => '')) && !!prof('u_bob'));
  await shot(P, 'subacct_delete_confirm');
  await P.fill('#gc-sa-sheet [data-sa-del]', 'Brush Bros Painting');
  await P.click('#gc-sa-sheet [data-sa-act=delete]');
  await P.waitForFunction(() => !document.getElementById('gc-sa-sheet'), null, { timeout: 10000 }).catch(() => {});
  await P.waitForFunction(() => document.querySelectorAll('#gc-sa tr[data-sa-row]').length === 2, null, { timeout: 8000 }).catch(() => {});
  ok('B6 the company name typed → deleted (sign-in + profile), the row is gone, the CRM sub stays', !prof('u_bob') && !AUTH.some(a => a.id === 'auth-bob') && (await rows(P)).indexOf('u_bob') < 0 && KV.vendors.length === 2, await rows(P));
  await P.waitForFunction(() => /delete/.test((document.querySelector('[data-sa-log]') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
  ok('B7 the audit list at the bottom shows the changes', /set-password/.test(await P.textContent('[data-sa-log]')) && /delete/.test(await P.textContent('[data-sa-log]')));
  await P.context().close();

  const O = await page('tok-office', false);
  await O.evaluate(() => window.__sec.render(document.getElementById('box')));
  await O.waitForSelector('#gc-sa tr[data-sa-row]', { timeout: 15000 });
  await O.click('#gc-sa tr[data-sa-row="u_sam"]');
  await O.waitForSelector('#gc-sa-sheet .kv', { timeout: 10000 });
  ok('B8 the office: can look, no buttons to change (read-only fields)', !(await O.$('#gc-sa-sheet [data-sa-act=genpw]')) && !(await O.$('#gc-sa-sheet [data-sa-act=delask]')) && await O.$eval('#gc-sa-sheet [data-sa-f=phone]', e => e.disabled) && /only an owner/i.test(await O.textContent('#gc-sa-sheet')));
  await shot(O, 'subacct_office_readonly');
  await O.context().close();
} catch (e) { ok('B browser run', false, String(e && e.stack || e).slice(0, 600)); }
ok('B9 no page errors', !errs.length, errs);
await browser.close();
const n = R.filter(Boolean).length; console.log('SUBACCT ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
