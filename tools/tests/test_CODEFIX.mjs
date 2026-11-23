// test_CODEFIX.mjs [build-dir] — patch CODEFIX (owner 11/23: "Alec CH Plumbing cannot get into portal, he can't get his code, resend it").
// The in-memory world of test_SUBACCT.mjs (copied), the REAL portal-access.js. Made-up data only.
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

/* ═════ CODEFIX ═════ */
const SUB3 = { id: 'SUBoff3', name: 'Turned Off Tile', email: 'tile@offtile.test', phone: '901-555-0133', isSub: true, trade: 'Tile' };
KV.vendors.push(SUB3);
T.gc_sub_link.push({ token: 'O'.repeat(43), sub_id: SUB3.id, sub_name: SUB3.name, revoked: true, created_at: '2026-10-02T00:00:00Z' });
const todos = () => { const v = KV.gc_office_tasks; const a = typeof v === 'string' ? JSON.parse(v) : (v || []); return a.filter(t => /Portal sign-in/.test(t.label || '')); };
const codeMails = e => MAIL.filter(m => (m.to || []).includes(e) && /code/i.test(m.subject + ' ' + (m.html || '')));
await sleep(0);
let r = await pa({ action: 'signin-start', who: 'office@pendingpaint.test' });
ok('1 a sub on file whose portal link was never made: the link is made and the code e-mailed', r.st === 200 && T.gc_sub_link.some(l => l.sub_id === SUB2.id && !l.revoked) && codeMails('office@pendingpaint.test').length === 1, { links: T.gc_sub_link, mail: MAIL.map(m => m.to) });
ok('2 … and no office To-Do for it', todos().length === 0, todos());
r = await pa({ action: 'signin-start', who: '901-555-0177' });
ok('3 by phone (no texting): the code goes to the e-mail on file', r.st === 200 && codeMails('office@pendingpaint.test').length === 2, MAIL.map(m => m.to));
r = await pa({ action: 'signin-start', who: 'sam@sampledrywall.test' });
ok('4 a sub with a link: code as before, no To-Do', codeMails('sam@sampledrywall.test').length === 1 && todos().length === 0);
r = await pa({ action: 'signin-start', who: 'tile@offtile.test' });
ok('5 a link staff turned off stays off (no new link, no code)', !T.gc_sub_link.some(l => l.sub_id === SUB3.id && !l.revoked) && codeMails('tile@offtile.test').length === 0);
ok('6 … and the office hears it on the To-Do', todos().some(t => /Turned Off Tile/.test(t.label) && /turned off/.test(t.label)), todos());
r = await pa({ action: 'signin-start', who: 'alec@unknownplumbing.test' });
ok('7 an address on no sub / customer: the same answer to the person (nothing revealed)', r.st === 200 && r.b.sent === true && r.b.ok === true);
ok('8 … the office gets a To-Do with the address', todos().some(t => /not on any sub/.test(t.label) && /alec@unknownplumbing\.test/.test(t.label)), todos());
r = await pa({ action: 'signin-start', who: 'alec@unknownplumbing.test' });
ok('9 asked again the same day: still one To-Do', todos().filter(t => /alec@unknownplumbing/.test(t.label)).length === 1, todos());
r = await pa({ action: 'signin-start', who: 'bob@pendingpaint.test' });
ok('10 a bid-site account e-mail (gets the reset link) is not reported as unknown', !todos().some(t => /bob@pendingpaint/.test(t.label)), todos());
const n = R.filter(Boolean).length; console.log('CODEFIX ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
