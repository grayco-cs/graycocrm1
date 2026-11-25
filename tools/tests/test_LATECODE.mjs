// test_LATECODE.mjs [build-dir] — patch LATECODE (owner 11/24):
//   A. "late bids can come in after due date but not for people that didn't save or start working on the bid already"
//   B. "i liked earlier the code was sent from grayco text for confirmation also thats how ch plumbing signed up"
// The in-memory world of test_CODEFIX.mjs (copied), the REAL subportal.js / portal-access.js. Twilio is captured in memory (api.twilio.com
// never reached); made-up people and numbers only; nothing is sent anywhere.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
const SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', RESEND_API_KEY: 're_test', CUST_QUIET_OFF: '1' });
const TW = { TWILIO_ACCOUNT_SID: 'AC_test_sid', TWILIO_AUTH_TOKEN: 'test-token', TWILIO_FROM: '+19015550100', TWILIO_FROM_SUBS: '+19015550111' };
const twilioOn = () => Object.assign(process.env, TW), twilioOff = () => Object.keys(TW).forEach(k => delete process.env[k]);
const SMS = [];
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
  if (u.host === 'api.twilio.com') { SMS.push(Object.fromEntries(new URLSearchParams(String(init.body)))); return res(201, { sid: 'SMtest' + SMS.length }); }
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
  if (u.pathname === '/auth/v1/admin/users' && m === 'POST') { const b = JSON.parse(init.body); if (AUTH.some(x => x.email === b.email)) return res(422, { msg: 'already registered' }); const a2 = { id: 'auth-' + crypto.randomBytes(4).toString('hex'), email: b.email, pw: b.password, created_at: now(), user_metadata: b.user_metadata || {} }; AUTH.push(a2); return res(200, a2); }
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

const CT = require(path.join(BUILD, 'netlify/functions/_lib/codetext.js'));
const anon = async body => { const r = await SPF.handler({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '10.7.' + (IP++ % 250) + '.1' }, body: JSON.stringify(body) }); return { st: r.statusCode, b: JSON.parse(r.body || '{}') }; };
const H = SPF._hub;
const dayOff = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const before = new Date(Date.now() - 4 * 864e5).toISOString(), after = new Date().toISOString();
let clock = 0; CT._D.now = () => Date.now() + clock;   /* the per-number text limit's clock (advanced between steps) */
const tick = () => { clock += 61e3; };

/* ═════ A. late bids: only a sub who SAVED the job or STARTED WORKING on a bid ═════ */
console.log('\nA. LATE BIDS');
const JL = { id: 'JL', title: 'Late Demo Job', bidDueDate: dayOff(-2), status: 'open', visibility: 'public', tradesSought: 'Drywall' };
const JO = { id: 'JO', title: 'Open Demo Job', bidDueDate: dayOff(5), status: 'open', visibility: 'public', tradesSought: 'Drywall' };
T.sp_rows.push(sp('jobs', 'JL', JL, { job_id: 'JL' }), sp('jobs', 'JO', JO, { job_id: 'JO' }));
const add = (c, id, data, uid, extra) => T.sp_rows.push(sp(c, id, Object.assign({ id, jobId: 'JL' }, data), Object.assign({ job_id: 'JL', user_id: uid }, extra || {})));
add('invites', 'inv_1', { email: 'inv@late.test' }, null, { email: 'inv@late.test' });
add('invites', 'inv_2', { email: 'invyes@late.test' }, null, { email: 'invyes@late.test' });
add('intents', 'JL__u_invyes', { userId: 'u_invyes', intent: 'yes', at: before }, 'u_invyes');
add('activity', 'a_pv_view', { userId: 'u_view', kind: 'view', at: before }, 'u_view');
add('activity', 'a_dl_dl', { userId: 'u_dl', kind: 'download', at: before }, 'u_dl');
add('activity', 'a_dl_late', { userId: 'u_dllate', kind: 'download', at: after }, 'u_dllate');   /* LATEDL: a download AFTER the due date does not count */
add('intents', 'JL__u_no', { userId: 'u_no', intent: 'no', at: before }, 'u_no');
add('intents', 'JL__u_yes', { userId: 'u_yes', intent: 'yes', at: before }, 'u_yes');
add('planreqs', 'JL__u_pr', { userId: 'u_pr', at: before }, 'u_pr');
add('questions', 'q_1', { userId: 'u_q', body: 'Is the ceiling L5?', at: before }, 'u_q');
add('messages', 'm_1', { senderId: 'u_msg', senderRole: 'sub', body: 'Working on it', at: before }, 'u_msg');
add('messages', 'm_2', { senderId: 'st_grayco', senderRole: 'admin', recipientSubId: 'u_gcmsg', body: 'Plans are posted', at: before }, 'u_gcmsg');
T.sp_rows.push({ key: 'bid-draft/JL:u_dr', collection: 'bid-draft', id: 'JL:u_dr', job_id: 'JL', user_id: 'u_dr', data: { value: { amount: '48000', scope: '', notes: '' }, at: before, firstAt: before } },
  { key: 'bid-draft/JL:u_dr0', collection: 'bid-draft', id: 'JL:u_dr0', job_id: 'JL', user_id: 'u_dr0', data: { value: { amount: '', scope: '', notes: '' }, at: before } },
  { key: 'bid-draft/JL:u_drlate', collection: 'bid-draft', id: 'JL:u_drlate', job_id: 'JL', user_id: 'u_drlate', data: { value: { amount: '100' }, at: after, firstAt: after } },
  { key: 'bid-draft/JL:u_drold', collection: 'bid-draft', id: 'JL:u_drold', job_id: 'JL', user_id: 'u_drold', data: { value: { scope: 'Hang and tape' } } },
  { key: 'takeoffs/tk1', collection: 'takeoffs', id: 'tk1', job_id: 'JL', user_id: 'u_tk', data: { file: { name: 'A-101.pdf' }, items: [], updatedAt: before } });
add('bids', 'b_1', { userId: 'u_bid', amount: 47000 }, 'u_bid');
const whoOf = (id, email) => ({ email: email || id + '@late.test', isSub: true, isSupplier: false, approved: true, profile: { id, email: email || id + '@late.test', role: 'sub', approved: true, trades: ['Drywall'] } });
const scopeOf = async (id, email) => { const sc = await H.subScope(whoOf(id, email)); return [!!sc.jobs.JL, !!sc.biddable.JL, !!(sc.late && sc.late.JL), !!sc.jobs.JO]; };
const want = { u_yes: 1, u_pr: 1, u_q: 1, u_msg: 1, u_dr: 1, u_drold: 1, u_tk: 1, u_invyes: 1, u_inv: 0, u_view: 0, u_dl: 1, u_dllate: 0, u_no: 0, u_gcmsg: 0, u_dr0: 0, u_drlate: 0, u_none: 0 };
const why = { u_yes: "✋ I'm bidding (saved it)", u_pr: 'a 📩 plan / info request', u_q: 'a question on the job', u_msg: 'a message to GrayCo on the job', u_dr: 'a bid draft typed before the due date', u_drold: 'an older draft (no time stamp)', u_tk: 'a 📐 takeoff', u_invyes: 'invited AND ✋',
  u_inv: 'an invite they never acted on', u_view: 'a view before the due date', u_dl: 'LATEDL (owner 11/25): a plan download before the due date', u_dllate: 'a plan download only after the due date', u_no: '🚫 Not bidding', u_gcmsg: 'only GrayCo wrote to them', u_dr0: 'an empty draft', u_drlate: 'a draft first typed after the due date', u_none: 'nothing at all' };
for (const id of Object.keys(want)) {
  const email = id === 'u_inv' ? 'inv@late.test' : id === 'u_invyes' ? 'invyes@late.test' : undefined;
  const g = await scopeOf(id, email);
  ok('A ' + (want[id] ? 'keeps' : 'does NOT keep') + ' the past-due job: ' + why[id], want[id] ? (g[0] && g[1] && g[2] && g[3]) : (!g[0] && !g[1] && !g[2] && g[3]), g);
}
{ const sc = await H.subScope(whoOf('u_bid')); ok('A a sub who already sent a bid still sees it (and may change it as a ⏰ late bid)', !!sc.jobs.JL && !!sc.late.JL, Object.keys(sc.jobs)); }
{ const sc = await H.subScope(Object.assign(whoOf('u_yes'), { approved: false })); ok('A an account not approved yet sees nothing (as before)', !sc.jobs.JL && !sc.jobs.JO); }
/* end to end on the bid site: Sam (approved Drywall sub) was invited to JL and opened it before the due date — that is not enough */
TOK['tok-sam'] = 'sam@sampledrywall.test';
add('invites', 'inv_sam', { email: 'sam@sampledrywall.test' }, null, { email: 'sam@sampledrywall.test' });
add('activity', 'a_pv_sam', { userId: 'u_sam', kind: 'view', at: before }, 'u_sam');
let s1 = await spf('tok-sam', { action: 'load', keys: ['jobs', 'plans:JL'] });
ok('A e2e: invited + viewed only → JL is not on Sam\'s list (the same "not found" as anyone), JO is', s1.st === 200 && !s1.b.data.jobs.some(j => j.id === 'JL') && s1.b.data.jobs.some(j => j.id === 'JO') && JSON.stringify(s1.b.data['plans:JL']) === '[]', s1.b);
let s2 = await spf('tok-sam', { action: 'save', key: 'bid-draft:JL:u_sam', value: { amount: '9000', scope: '', notes: '' } });
const dr = (T.sp_rows.find(r => r.key === 'bid-draft/JL:u_sam') || {}).data || {};
ok('A e2e: a draft saved AFTER the due date is stamped with the server\'s time …', s2.st === 200 && dr.firstAt && Date.parse(dr.firstAt) > Date.now() - 60e3, dr);
s1 = await spf('tok-sam', { action: 'load', keys: ['jobs'] });
const sb = await spf('tok-sam', { action: 'save', key: 'bids', upsert: [{ id: 'b_sam_late', jobId: 'JL', amount: 9000 }] });
ok('A e2e: … and does not open the job (still not listed, a bid is refused)', !s1.b.data.jobs.some(j => j.id === 'JL') && sb.st === 403, { st: sb.st, b: sb.b });
await spf('tok-sam', { action: 'save', key: 'bid-draft:JL:u_sam', value: { amount: '9100', scope: '', notes: '' } });
ok('A e2e: a later draft save keeps the FIRST time', ((T.sp_rows.find(r => r.key === 'bid-draft/JL:u_sam') || {}).data || {}).firstAt === dr.firstAt);
add('questions', 'q_sam', { userId: 'u_sam', body: 'Do you want the soffits?', at: before }, 'u_sam');
s1 = await spf('tok-sam', { action: 'load', keys: ['jobs'] });
const jl = s1.b.data.jobs.find(j => j.id === 'JL');
ok('A e2e: Sam had asked a question before the due date → JL is back as a ⏰ late bid', !!jl && jl.lateBid === true && jl.pastDue === true && !jl.biddingClosed, jl);
T.sp_rows = T.sp_rows.filter(r => r.job_id !== 'JL' && r.job_id !== 'JO' && !/^bid-draft\//.test(r.key));

/* ═════ B. codes by GrayCo text ═════ */
console.log('\nB. CODES BY GRAYCO TEXT');
const signup = (email, phone, extra) => anon(Object.assign({ action: 'register', email, password: 'Good-Pass-123', force: true, profile: { name: 'Demo Person', company: 'Demo Co ' + email.split('@')[0], phone, trades: ['Paint'] } }, extra || {}));
const pf = e => (T.sp_rows.find(r => r.collection === 'users' && r.email === e) || {}).data;
const smsTo = p => SMS.filter(x => x.To === '+1' + p);
const codeIn = x => ((/\b(\d{6})\b/.exec(x && x.Body || '') || [])[1]);
const BAD = /That code is not right or has run out/;
twilioOn();
let r1 = await signup('cora@codepaint.test', '(901) 555-0188');
const t1 = smsTo('9015550188');
ok('B1 sign-up with a cell + Twilio set up → held for confirm (as before) and the confirm e-mail goes', r1.st === 200 && r1.b.verify === true && MAIL.some(m => (m.to || []).includes('cora@codepaint.test') && /signup-confirm=/.test(m.html || '')), r1);
ok('B1 … and ONE GrayCo text to the number they typed, from the subs number: "GrayCo: your code is …"', t1.length === 1 && t1[0].From === '+19015550111' && /^GrayCo: your code is \d{6} to confirm your sign-up\. It works for 10 minutes\./.test(t1[0].Body) && /Reply STOP/.test(t1[0].Body), t1);
const p1 = pf('cora@codepaint.test');
ok('B1 only a keyed hash of the code is kept (never the code)', p1 && /^[0-9a-f]{64}$/.test(p1.emailVerify.codeHash) && !JSON.stringify(T.sp_rows).includes(codeIn(t1[0])) && p1.emailUnverified === true, p1 && p1.emailVerify);
const good1 = codeIn(t1[0]), wrong1 = good1 === '000000' ? '111111' : '000000';
let c = await anon({ action: 'signup-confirm-code', email: 'cora@codepaint.test', code: wrong1 });
const cU = await anon({ action: 'signup-confirm-code', email: 'nobody@nowhere.test', code: good1 });
const cF = await anon({ action: 'signup-confirm-code', email: 'cora@codepaint.test', code: '12ab' });
ok('B2 a wrong code, an e-mail not on file, a malformed code → the SAME answer (nothing revealed)', c.st === 400 && cU.st === 400 && cF.st === 400 && BAD.test(c.b.error) && c.b.error === cU.b.error && c.b.error === cF.b.error, [c, cU, cF]);
ok('B2 … the wrong try is counted', pf('cora@codepaint.test').emailVerify.codeTries === 1);
c = await anon({ action: 'signup-confirm-code', email: 'cora@codepaint.test', code: good1.slice(0, 3) + ' ' + good1.slice(3) });
const p1b = pf('cora@codepaint.test');
ok('B3 the right code (spaces ok) confirms the sign-up — like the e-mail link', c.st === 200 && c.b.ok === true && p1b.emailVerifiedVia === 'text-code' && !!p1b.emailVerifiedAt && !p1b.emailVerify && !SPF._sv.svUnconfirmed(p1b), { c, p1b });
c = await anon({ action: 'signup-confirm-code', email: 'cora@codepaint.test', code: good1 });
ok('B3 the code works once', c.st === 400 && BAD.test(c.b.error));
tick(); await signup('dan@codepaint.test', '901-555-0189');
const good2 = codeIn(smsTo('9015550189')[0]);
for (let i = 0; i < 5; i++) await anon({ action: 'signup-confirm-code', email: 'dan@codepaint.test', code: String((Number(good2) + 1 + i) % 1e6).padStart(6, '0') });
c = await anon({ action: 'signup-confirm-code', email: 'dan@codepaint.test', code: good2 });
ok('B4 five wrong tries end the code (the right one no longer works)', c.st === 400 && SPF._sv.svUnconfirmed(pf('dan@codepaint.test')), c);
tick(); clock += 60e3;
let rs = await anon({ action: 'signup-resend', email: 'dan@codepaint.test' });
const t2 = smsTo('9015550189');
ok('B5 "Resend" (asked by the person) → a fresh link e-mail AND a fresh texted code; the same answer as always', rs.st === 200 && rs.b.verify === true && t2.length === 2 && codeIn(t2[1]) && MAIL.filter(m => (m.to || []).includes('dan@codepaint.test')).length === 2, { rs, t2: t2.length });
c = await anon({ action: 'signup-confirm-code', email: 'dan@codepaint.test', code: codeIn(t2[1]) });
ok('B5 … the new code confirms', c.st === 200 && !SPF._sv.svUnconfirmed(pf('dan@codepaint.test')), c);
tick(); await signup('eve@codepaint.test', '901-555-0187');
{ const u = pf('eve@codepaint.test'); u.emailVerify.codeExp = new Date(Date.now() - 1000).toISOString(); }
c = await anon({ action: 'signup-confirm-code', email: 'eve@codepaint.test', code: codeIn(smsTo('9015550187')[0]) });
ok('B6 a code past its 10 minutes does not work', c.st === 400 && BAD.test(c.b.error));
const link = (/signup-confirm=([A-Za-z0-9_-]+)/.exec((MAIL.filter(m => (m.to || []).includes('eve@codepaint.test')).pop() || {}).html || '') || [])[1];
c = await anon({ action: 'signup-confirm', token: link });
ok('B6 the e-mail link keeps working beside the code', !!link && c.st === 200 && pf('eve@codepaint.test').emailVerifiedVia === 'link', c);
/* staff "Resend" (🔐 Sub portal accounts) never texts */
tick(); await signup('fay@codepaint.test', '901-555-0186'); const n0 = SMS.length; tick();
await SPF._sv.svResend('fay@codepaint.test');
ok('B7 the office\'s Resend link sends the e-mail only — no text the person did not ask for (the texted code stays good)', SMS.length === n0 && /^[0-9a-f]{64}$/.test(pf('fay@codepaint.test').emailVerify.codeHash));
/* STOP: a number on the opt-out list never gets a code */
T.gc_lead_inbox_kv = (T.gc_lead_inbox_kv || []).concat([{ key: 'gc_sms_state', value: { optout: { '9015550185': after } }, updated_at: after }]);
tick(); r1 = await signup('gus@codepaint.test', '901-555-0185');
ok('B8 a number that texted STOP gets no text; the confirm e-mail still goes', r1.st === 200 && smsTo('9015550185').length === 0 && MAIL.some(m => (m.to || []).includes('gus@codepaint.test')), SMS.slice(-1));
/* Twilio not set up → exactly as before */
twilioOff(); tick(); r1 = await signup('hal@codepaint.test', '901-555-0184');
ok('B9 Twilio not set up → no text, no code kept; the e-mail link as before', r1.st === 200 && r1.b.verify === true && smsTo('9015550184').length === 0 && !pf('hal@codepaint.test').emailVerify.codeHash && MAIL.some(m => (m.to || []).includes('hal@codepaint.test')), pf('hal@codepaint.test').emailVerify);
twilioOn(); tick(); r1 = await signup('ida@codepaint.test', '');
ok('B9 no cell given → no text (e-mail link only)', r1.st === 200 && !pf('ida@codepaint.test').emailVerify.codeHash);

/* the helper's own rules */
CT._reset(); clock = 0;
const sends = [];
for (let i = 0; i < 7; i++) { sends.push((await CT.sendCode('901-555-0183', '123456', {})).skipped || 'sent'); clock += i === 0 ? 10e3 : 61e3; }
ok('B10 per number: at most one text a minute and five an hour', JSON.stringify(sends) === JSON.stringify(['sent', 'too-soon', 'sent', 'sent', 'sent', 'sent', 'too-soon']), sends);
ok('B10 never to one of our own numbers, never to a non-US / short number', (await CT.sendCode('+1 901-555-0111', '123456')).skipped === 'ours' && (await CT.sendCode('555-0100', '123456')).skipped === 'no-cell' && (await CT.sendCode('+44 20 7946 0958', '123456')).skipped === 'no-cell');
ok('B10 Spanish wording', /^GrayCo: su código es 123456 para confirmar su registro\. Sirve 10 minutos/.test(CT.bodyOf('123456', { lang: 'es', what: 'signup', min: 10 })));

/* ═════ sub portal sign-in codes (portal.grayco-cs.com) ═════ */
console.log('\nC. SUB PORTAL SIGN-IN CODES');
CT._reset(); clock = 0; SMS.length = 0; MAIL.length = 0;
const lastMailCode = e => { const m = MAIL.filter(x => (x.to || []).includes(e) && /code/i.test(x.subject || '')).pop(); return m ? (/(\d{6})/.exec((m.html || '').replace(/<[^>]+>/g, ' ')) || [])[1] : ''; };
let p = await pa({ action: 'signin-start', who: 'sam@sampledrywall.test' });
const sm = smsTo('9015550141');
ok('C1 a sub asks with their e-mail → the code by e-mail (as before) AND by GrayCo text to the cell on their record — the same code', p.st === 200 && p.b.sent === true && sm.length === 1 && !!lastMailCode('sam@sampledrywall.test') && codeIn(sm[0]) === lastMailCode('sam@sampledrywall.test') && /^GrayCo: your code is \d{6}\. It works for 10 minutes/.test(sm[0].Body), { sm, mail: MAIL.map(m => m.subject) });
let v = await pa({ action: 'signin-verify', who: 'sam@sampledrywall.test', code: codeIn(sm[0]) });
ok('C1 … the texted code signs them in', v.st === 200 && !!v.b.session, v);
tick(); const mails0 = MAIL.length;
p = await pa({ action: 'signin-start', who: '(901) 555-0141' });
ok('C2 asked with their cell number → the text (no e-mail needed)', smsTo('9015550141').length === 2 && MAIL.length === mails0, { sms: SMS.length, mails: MAIL.length - mails0 });
T.gc_lead_inbox_kv = [{ key: 'gc_sms_state', value: { optout: { '9015550141': after } }, updated_at: after }];
tick(); p = await pa({ action: 'signin-start', who: '901-555-0141' });
ok('C3 their number texted STOP → no text; the code goes to the e-mail on file instead', smsTo('9015550141').length === 2 && MAIL.length === mails0 + 1 && !!lastMailCode('sam@sampledrywall.test'), { sms: smsTo('9015550141').length, mails: MAIL.length - mails0 });
T.gc_lead_inbox_kv = [];
tick(); p = await pa({ action: 'signin-start', who: '901-555-0122' });
const pE = await pa({ action: 'signin-start', who: 'stranger@nowhere.test' });
ok('C4 a number / e-mail on no record: the same answer, no text', p.st === 200 && JSON.stringify(p.b) === JSON.stringify(pE.b) && p.b.sent === true && smsTo('9015550122').length === 0, [p.b, pE.b]);
twilioOff(); tick(); const s0 = SMS.length, m0 = MAIL.length;
p = await pa({ action: 'signin-start', who: 'sam@sampledrywall.test' });
const p2 = await pa({ action: 'signin-start', who: '901-555-0177' });
const codeMailsN = () => MAIL.slice(m0).filter(x => /code/i.test(x.subject || '')).map(x => x.to.join());
ok('C5 Twilio not set up → e-mail only, exactly as before (typed e-mail, and a typed number → the e-mail on file)', SMS.length === s0 && JSON.stringify(codeMailsN()) === JSON.stringify(['sam@sampledrywall.test', 'office@pendingpaint.test']), { sms: SMS.length - s0, mails: codeMailsN() });
ok('C6 no code, no Twilio secret in any answer or e-mail', !JSON.stringify(MAIL).includes('test-token') && !JSON.stringify([p, p2]).match(/\d{6}/));
twilioOn();
/* a sub link opened on a new phone (device code): the cell on file by text AND the e-mail (was: the text only when Twilio was set up) */
CT._reset(); clock = 0; const sd = SMS.length, md = MAIL.length;
let d = await pa({ action: 'device-start' }, { 'x-portal-token': 'L'.repeat(43) });
const dsm = smsTo('9015550141').slice(-1)[0];
ok('C7 device code: texted to the cell on their record and e-mailed — the same code', d.st === 200 && SMS.length === sd + 1 && codeIn(dsm) && codeIn(dsm) === lastMailCode('sam@sampledrywall.test') && MAIL.length === md + 1, { d, sms: SMS.length - sd, mails: MAIL.length - md });
twilioOff(); CT._reset(); const sd2 = SMS.length;
d = await pa({ action: 'device-start' }, { 'x-portal-token': 'L'.repeat(43) });
ok('C7 device code without Twilio: the e-mail only', d.st === 200 && SMS.length === sd2 && MAIL.length === md + 2);
twilioOn();

const n = R.filter(Boolean).length; console.log('LATECODE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
