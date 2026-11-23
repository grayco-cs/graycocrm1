// test_PORTALTEAM.mjs <build-dir> [shot-dir] [--no-browser] — patch PORTALTEAM (owner 11/23: "The portal should be for the company that way
// everyone that signs up the entire company can check out the portal not just the guy that signs up. So let their sign up be for
// everyone in their companies").
// Offline: the REAL server functions (portal-access.js, subportal.js, sub-accounts.js, _lib/portalteam.js) on an in-memory Supabase
// (auth, PostgREST tables, gc_kv) and Resend. Made-up data only. Part B drives portal.html / portal-app.js / portal-team.js in Chromium
// (phone 390 px and desk 1280 px).
//  1. existing single-user accounts still work (bid site + portal) and read as a one-member company
//  2. a member adds a coworker → the coworker has the company's access at once (portal: same jobs / pay; bid site: same bids)
//  3. "Send invite" only on a click: an e-mail with a choose-your-password link (customer quiet hours tag, data-entry mode skips it)
//  4. a sign-up on an approved company's business e-mail domain joins it automatically
//  5. a free-mail sign-up naming that company → its own pending sign-up + "wants to join" for the office; the office approves
//  6. removing a teammate ends their access but keeps the record (who / when); restore brings them back
//  7. a member can't remove the last active person; staff can
//  8. a customer never sees / hears of the sub portal (and a sub never the customer's team); residential household add; GC company team
//  9. notifications: the main contact as before; a member only after "Notify me"; gate by role (office yes, plain staff no)
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ARGS = process.argv.slice(2).filter(a => !a.startsWith('--'));
const BUILD = path.resolve(ARGS[0] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
const SHOTS = ARGS[1] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const NO_BROWSER = process.argv.includes('--no-browser');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (f, ms = 15000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await f(); if (v) return v; await sleep(150); } return v; };
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', RESEND_API_KEY: 're_test', CUST_QUIET_OFF: '1', PORTAL_BASE_URL: 'https://portal.test' });
delete process.env.PORTAL_MAIL_OFF; delete process.env.OWNER_EMAILS; delete process.env.STAFF_EMAILS; delete process.env.TWILIO_ACCOUNT_SID;
const now = () => new Date().toISOString();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

/* ═════ made-up companies ═════ */
const BOSS = 'boss@acmedrywall.test', COREY = 'corey@acmedrywall.test', DANA = 'dana@acmedrywall.test', FRED = 'fred.acmedry@gmail.com', SOLO = 'solo@solopaint.test', MIA = 'mia@solopaint.test';
const P1 = { id: 'u_acme', role: 'sub', approved: true, email: BOSS, name: 'Bo Boss', company: 'Acme Drywall LLC', phone: '901-555-0101', trades: ['Drywall'], crmSubId: 'SUBacme', createdAt: '2026-10-01T00:00:00Z', authUserId: 'auth-boss' };
const P2 = { id: 'u_solo', role: 'sub', approved: true, email: SOLO, name: 'Sol Solo', company: 'Solo Paint Co', phone: '901-555-0202', trades: ['Paint'], crmSubId: 'SUBsolo', createdAt: '2026-10-02T00:00:00Z', authUserId: 'auth-solo' };
const P3 = { id: 'u_lone', role: 'sub', approved: true, email: 'lone@lonetile.test', name: 'Lon Lone', company: 'Lone Tile', phone: '901-555-0303', trades: ['Tile'], createdAt: '2026-10-03T00:00:00Z', authUserId: 'auth-lone' };
const SUB1 = { id: 'SUBacme', name: 'Acme Drywall LLC', company: 'Acme Drywall LLC', contact: 'Bo Boss', email: BOSS, phone: '901-555-0101', isSub: true, trade: 'Drywall' };
const SUB2 = { id: 'SUBsolo', name: 'Solo Paint Co', company: 'Solo Paint Co', contact: 'Sol Solo', email: SOLO, phone: '901-555-0202', isSub: true, trade: 'Paint' };
const JOB = { id: 'PJOB1', name: 'Sample Clinic Build-out', address: '1 Sample Way', client: 'Sample Clinic', pm: 'Sample PM', status: 'Active', subs: [{ subId: SUB1.id, name: SUB1.name, status: 'Awarded' }] };
const JOB2 = { id: 'PJOB2', name: 'Sample Office Paint', address: '2 Sample Way', client: 'Sample Office', pm: 'Sample PM', status: 'Active', subs: [{ subId: SUB2.id, name: SUB2.name, status: 'Awarded' }] };
const HOME = { id: 'PHOME1', name: 'Sample Roof', address: '9 Sample Ln', client: 'Casey Homeowner', clientEmail: 'casey@samplehome.test', projectType: 'Residential', status: 'Active', subs: [{ subId: SUB1.id, name: SUB1.name, status: 'Awarded' }] };
const GCJ = { id: 'PGC1', name: 'Sample Retail Suite', address: '7 Sample Blvd', client: 'Big Box Builders', clientEmail: 'pm@bigboxbuild.test', projectType: 'Commercial', status: 'Active', subs: [] };
let AUTH, TOK, T, KV, MAIL;
const sp = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now() }, extra || {});
function fresh(){
  AUTH = { [BOSS]: { id: 'auth-boss', pw: 'Boss-Pass-111', portal: 'sub' }, [SOLO]: { id: 'auth-solo', pw: 'Solo-Pass-111', portal: 'sub' }, 'lone@lonetile.test': { id: 'auth-lone', pw: 'Lone-Pass-111', portal: 'sub' } };
  TOK = { 'tok-admin': 'owner@grayco.test', 'tok-office': 'office@grayco.test', 'tok-pm': 'pm@grayco.test', 'tok-boss': BOSS, 'tok-lone': 'lone@lonetile.test' };
  KV = { vendors: [SUB1, SUB2], projects: [JOB, JOB2, HOME, GCJ], customers: [{ id: 'C1', name: 'Casey Homeowner', firstName: 'Casey', email: 'casey@samplehome.test', type: 'residential' }, { id: 'C2', name: 'Big Box Builders', firstName: 'Gail', email: 'pm@bigboxbuild.test', type: 'gc' }],
    users: [{ id: 'u1', name: 'Sample PM', email: 'pm@grayco.test', role: 'Project Manager', active: true }, { id: 'u2', name: 'Ofelia Office', email: 'office@grayco.test', role: 'Office Manager', active: true }],
    invs: [{ id: 'INV1', type: 'sub', subId: SUB1.id, pid: JOB.id, amt: 1234.5, status: 'approved', invNum: 'ACME-7' }], gc_sub_portal_settings: { deviceCode: 'off' } };
  T = { gc_portal_session: [], gc_portal_code: [], gc_portal_lock: [], gc_portal_login: [], gc_sub_device: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [],
    gc_sub_link: [{ token: 'a'.repeat(43), sub_id: SUB1.id, revoked: false, created_at: now() }, { token: 'b'.repeat(43), sub_id: SUB2.id, revoked: false, created_at: now() }],
    gc_portal: [{ token: 'h'.repeat(43), project_id: HOME.id, revoked: false }, { token: 'g'.repeat(43), project_id: GCJ.id, revoked: false }],
    gc_staff: [{ email: 'owner@grayco.test', name: 'Owen Owner', role: 'admin', active: true }, { email: 'office@grayco.test', name: 'Ofelia Office', role: 'office', active: true }, { email: 'pm@grayco.test', name: 'Sample PM', role: 'staff', profile: 'pm', active: true }],
    sp_rows: [sp('users', P1.id, P1, { user_id: P1.id, email: BOSS }), sp('users', P2.id, P2, { user_id: P2.id, email: SOLO }), sp('users', P3.id, P3, { user_id: P3.id, email: P3.email }),
      sp('jobs', 'BJ1', { id: 'BJ1', title: 'Sample Bid Job', status: 'open', visibility: 'public', trades: ['Drywall'] }, { job_id: 'BJ1' }),
      sp('bids', 'BID1', { id: 'BID1', jobId: 'BJ1', userId: P1.id, amount: 5000, userCompany: P1.company }, { job_id: 'BJ1', user_id: P1.id })] };
  MAIL = [];
}
fresh();
const res = (status, body, hd) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => (hd || {})[String(k).toLowerCase()] || null }, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host === 'api.resend.com') { const b = JSON.parse(init.body); MAIL.push(b); return res(200, { id: 'mail-' + MAIL.length }); }
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') { const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, ''); return TOK[a] ? res(200, { id: (AUTH[TOK[a]] || {}).id || 'auth-staff-' + TOK[a], email: TOK[a] }) : res(401, { msg: 'invalid JWT' }); }
  if (u.pathname === '/auth/v1/admin/users' && m === 'POST') { const b = JSON.parse(init.body), e = String(b.email).toLowerCase(); if (AUTH[e]) return res(422, { msg: 'A user with this email address has already been registered' }); AUTH[e] = { id: 'auth-' + crypto.randomBytes(3).toString('hex'), pw: b.password, portal: (b.user_metadata || {}).portal }; return res(200, { id: AUTH[e].id, email: e }); }
  if (u.pathname === '/auth/v1/admin/users' && m === 'GET') return res(200, { users: Object.keys(AUTH).map(e => ({ id: AUTH[e].id, email: e, user_metadata: { portal: AUTH[e].portal || 'sub' }, created_at: '2026-10-01T00:00:00Z' })) });
  if (u.pathname.startsWith('/auth/v1/admin/users/')) { const id = decodeURIComponent(u.pathname.split('/').pop()); const e = Object.keys(AUTH).find(k => AUTH[k].id === id); return e ? res(200, { id, email: e, user_metadata: { portal: AUTH[e].portal } }) : res(404, {}); }
  if (u.pathname === '/auth/v1/admin/generate_link') { const b = JSON.parse(init.body); return AUTH[String(b.email).toLowerCase()] ? res(200, { action_link: 'https://sb.test/auth/v1/verify?type=recovery&token=rec-' + sha(b.email).slice(0, 8) }) : res(404, { msg: 'User not found' }); }
  if (u.pathname === '/auth/v1/token') { const b = JSON.parse(init.body), a = AUTH[String(b.email).toLowerCase()]; if (!a || a.pw !== b.password) return res(400, { error: 'invalid_grant' }); const tok = 't-' + crypto.randomBytes(6).toString('hex'); TOK[tok] = String(b.email).toLowerCase(); return res(200, { access_token: tok }); }
  if (u.pathname === '/rest/v1/gc_kv') {
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = x.value; }); return res(201, null); }
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: 'T0' })));
  }
  if (u.pathname.startsWith('/storage/v1/')) return res(200, []);
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm) {
    const tb = T[tm[1]] || (T[tm[1]] = []);
    if (m === 'POST') { const b = JSON.parse(init.body), oc = q.get('on_conflict'); (Array.isArray(b) ? b : [b]).forEach(r => { const i = oc ? tb.findIndex(x => x[oc] === r[oc]) : (r.key ? tb.findIndex(x => x.key === r.key) : -1); if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); }); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dv(v.slice(3)));
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
const PA = require(path.join(BUILD, 'netlify/functions/portal-access.js'));
const SPF = require(path.join(BUILD, 'netlify/functions/subportal.js'));
const SA = require(path.join(BUILD, 'netlify/functions/sub-accounts.js'));
const PJ = require(path.join(BUILD, 'netlify/functions/portal.js'));
const TM = require(path.join(BUILD, 'netlify/functions/_lib/portalteam.js'));
const PAUSE = require(path.join(BUILD, 'netlify/functions/_lib/pause.js'));
const reset = () => { try { PA._core._reset(); } catch (e) {} };
let IPN = 0; const ipNext = () => '10.' + (1 + (IPN >> 8) % 200) + '.' + (IPN++ % 250) + '.7';
const call = async (fn, body, headers) => { reset(); const r = await fn.handler({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': ipNext() }, headers || {}), body: JSON.stringify(body) }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { st: r.statusCode, b: j }; };
const pa = (action, body, headers) => call(PA, Object.assign({ action }, body || {}), headers);
const pas = (sess, action, body) => pa(action, body, { 'x-portal-session': sess });
const bid = (tok, action, body) => call(SPF, Object.assign({ action }, body || {}), { authorization: 'Bearer ' + tok });
const sa = (tok, body) => call(SA, body, { authorization: 'Bearer ' + tok });
const team = () => T.sp_rows.filter(r => r.collection === 'team').map(r => r.data);
const pwSignin = async (email, pw) => pa('signin-password', { email, password: pw });
const codeSignin = async (who) => {
  const n0 = MAIL.length; await pa('signin-start', { who });
  const mm = MAIL.slice(n0).find(x => (x.to || []).map(String).join().toLowerCase().indexOf(String(who).toLowerCase()) > -1);
  const code = mm && (/(\d{6})/.exec(mm.html) || [])[1];
  if (!code) return { st: 0, b: {}, nomail: true };
  return pa('signin-verify', { who, code });
};
const leaks = j => /sub ?portal|subcontract|bids\.|bid site|\bsub\b/i.test(JSON.stringify(j));

/* ═══ 1. existing single accounts keep working, as one-member companies ═══ */
let bossS = '';
{
  const r = await pwSignin(BOSS, 'Boss-Pass-111'); bossS = r.b.session;
  ok('1 an existing sub signs in exactly as before (password → their partner portal)', r.st === 200 && r.b.kind === 'partner' && !!bossS, r);
  const h = await pas(bossS, 'p-home'); ok('1 … their home loads', h.st === 200 && h.b.ok, h);
  const t = await pas(bossS, 'p-team');
  ok('1 … and reads as a one-member company: 👥 My team = just them, the main contact', t.st === 200 && t.b.team.length === 1 && t.b.team[0].primary && t.b.team[0].email === BOSS && t.b.me === 'primary' && t.b.canManage === true, t.b);
  ok('1 nothing was written for it (no migration: no team row until a person acts)', team().length === 0);
  const me = await bid('tok-lone', 'me');
  ok('1 the bid site: a single-user account is still its own profile (no team field)', me.st === 200 && me.b.user && me.b.user.id === P3.id && !me.b.team, me.b);
  const ld = await bid('tok-boss', 'load', { keys: ['bids'] });
  ok('1 … and the company owner still sees their own bid', ld.st === 200 && JSON.stringify(ld.b).indexOf('BID1') > -1, ld.b);
}

/* ═══ 2. a member adds a coworker → access at once ═══ */
let coreyS = '', coreyId = '';
{
  const a = await pas(bossS, 'p-team-add', { name: 'Corey Coworker', email: 'Corey@AcmeDrywall.test', phone: '' });
  coreyId = a.b.added && a.b.added.id;
  const row = team().find(m => m.email === COREY);
  ok('2 My team → ＋ Add (name + e-mail) → saved as an ACTIVE member of the company, added by the main contact (who / when)', a.st === 200 && row && row.status === 'active' && row.company === 'sp:' + P1.id && row.addedBy.email === BOSS && row.addedBy.role === 'primary' && !!row.addedAt, { a: a.b, row });
  ok('2 … no e-mail went by itself (the invite waits for a click)', MAIL.filter(x => (x.to || []).includes(COREY)).length === 0);
  const dup = await pas(bossS, 'p-team-add', { name: 'Corey again', email: COREY });
  ok('2 adding the same person twice → "already on the team"', dup.st === 409 && /already on the team/.test(dup.b.error), dup);
  const bad = await pas(bossS, 'p-team-add', { name: 'No Way' });
  ok('2 a coworker needs an e-mail or a mobile number', bad.st === 400 && /e-mail or mobile/.test(bad.b.error), bad);
  const own = await pas(bossS, 'p-team-add', { name: 'Lon', email: 'lone@lonetile.test' });
  ok('2 an e-mail that has its own company account is not pulled onto this team', own.st === 409 && /own GrayCo portal account/.test(own.b.error), own);
  const stf = await pas(bossS, 'p-team-add', { name: 'Owen', email: 'owner@grayco.test' });
  ok('2 a GrayCo staff e-mail can\'t be added', stf.st === 409, stf);
}

/* ═══ 3. Send invite (a click) ═══ */
{
  const n0 = MAIL.length;
  const r = await pas(bossS, 'p-team-invite', { id: coreyId });
  const mm = MAIL.slice(n0).find(x => (x.to || []).includes(COREY));
  ok('3 ✉️ Send invite → one e-mail to the coworker: who added them, the company, portal address, a choose-your-password link', r.st === 200 && r.b.invite && r.b.invite.ok && mm && /Bo Boss/.test(mm.subject + mm.html) && /Acme Drywall LLC/.test(mm.html) && /portal\.test/.test(mm.html) && /type=recovery/.test(mm.html), { r: r.b, mm });
  ok('3 … the coworker now has a sign-in (made at that click, marked "team" so it is never an orphan)', AUTH[COREY] && AUTH[COREY].portal === 'team');
  ok('3 … the invite is on their record (when / by whom)', (team().find(m => m.email === COREY).invites || []).length === 1);
  KV.gc_automation_pause = { on: true }; PAUSE.reset && PAUSE.reset();
  const n1 = MAIL.length, p = await pas(bossS, 'p-team-invite', { id: coreyId });
  ok('3 ⏸ data-entry mode → the invite is NOT sent (and the answer says so)', p.st === 200 && p.b.invite && p.b.invite.ok === false && p.b.invite.paused === true && MAIL.length === n1, p.b);
  delete KV.gc_automation_pause; PAUSE.reset && PAUSE.reset();
  /* the invite e-mail goes under the customer quiet-hours tag (held 7 PM – 7 AM) */
  const CQ = require(path.join(BUILD, 'netlify/functions/_lib/custquiet.js'));
  let tagSeen = ''; const f0 = global.fetch;
  global.fetch = async (u, i) => { if (/resend/.test(String(u))) tagSeen = CQ.tag(); return f0(u, i); };
  await TM.sendEmail('x@example.test', 's', 'h'); global.fetch = f0;
  ok('3 an invite e-mail is tagged "customer" (the quiet-hours hold applies; never "reply")', tagSeen === 'customer', tagSeen);
  /* Corey chose a password with the link */
  AUTH[COREY].pw = 'Corey-Pass-111';
  const s1 = await pwSignin(COREY, 'Corey-Pass-111'); coreyS = s1.b.session;
  ok('2 the coworker signs in with THEIR OWN e-mail + password → the company\'s portal (same CRM sub)', s1.st === 200 && s1.b.kind === 'partner' && T.gc_portal_session.find(x => x.id === sha(coreyS)).sub_id === SUB1.id, s1);
  const h = await pas(coreyS, 'p-home'), j = await pas(coreyS, 'p-job', { projectId: JOB.id });
  ok('2 … sees the company\'s jobs and work (home, the awarded job)', h.st === 200 && JSON.stringify(h.b).indexOf(JOB.id) > -1 && j.st === 200, { h: h.st, j: j.b });
  const tc = await pas(coreyS, 'p-team');
  ok('2 … My team shows them as "You" (a member), the main contact first', tc.st === 200 && tc.b.me === coreyId && tc.b.team[0].primary && tc.b.team.find(x => x.id === coreyId).mine === true, tc.b);
  TOK['tok-corey'] = COREY;
  const me = await bid('tok-corey', 'me'), ld = await bid('tok-corey', 'load', { keys: ['bids'] });
  ok('2 the bid site: the coworker is the company there too (its profile; their own name in team)', me.st === 200 && me.b.user.id === P1.id && me.b.team && me.b.team.email === COREY, me.b);
  ok('2 … and sees the company\'s bid', ld.st === 200 && JSON.stringify(ld.b).indexOf('BID1') > -1, ld.b);
  ok('2 … the company profile was not rewritten by the member\'s sign-in (its sign-in id stays the owner\'s)', T.sp_rows.find(r => r.key === 'users/' + P1.id).data.authUserId === 'auth-boss');
  const cs = await codeSignin(COREY);
  ok('2 the coworker can also sign in with an e-mailed code (no password needed)', cs.st === 200 && cs.b.kind === 'partner', cs);
}

/* ═══ 4. same business domain → joins at once ═══ */
{
  const r = await call(SPF, { action: 'register', email: DANA, password: 'Dana-Pass-111', profile: { name: 'Dana Domain', company: 'Acme Drywall', phone: '901-555-0111' } });
  const row = team().find(m => m.email === DANA);
  ok('4 a sign-up with @acmedrywall.test (an APPROVED company\'s domain) joins that company at once', r.st === 200 && r.b.ok && r.b.joined === 'Acme Drywall LLC' && r.b.approved === true && row && row.status === 'active' && row.via === 'domain' && row.company === 'sp:' + P1.id, { r: r.b, row });
  ok('4 … no second company profile is made (no duplicate account to approve)', !T.sp_rows.some(x => x.collection === 'users' && x.email === DANA));
  ok('4 … the office is told (a staff-only e-mail)', MAIL.some(x => /joined Acme Drywall LLC/.test(x.subject) && (x.to || []).every(t => /grayco-cs\.com$/.test(t))));
  const s = await pwSignin(DANA, 'Dana-Pass-111');
  ok('4 … and they sign straight in to the company portal with their new password', s.st === 200 && s.b.kind === 'partner', s);
  const od = await call(SPF, { action: 'register', email: 'odd@acmedrywall.test', password: 'Odd-Pass-1111', profile: { name: 'Odd Name', company: 'Zebra Framing' } });
  ok('4 the same domain under a DIFFERENT company name is not joined by itself — its own pending sign-up + "wants to join" for the office',
    od.st === 200 && !od.b.joined && team().some(m => m.email === 'odd@acmedrywall.test' && m.status === 'requested') && T.sp_rows.some(x => x.collection === 'users' && x.email === 'odd@acmedrywall.test' && x.data.approved === false), od.b);
  T.sp_rows.find(x => x.key === 'team/' + team().find(m => m.email === 'odd@acmedrywall.test').id).data.status = 'denied';   /* (decided "not this company" — keeps section 5's count at 1) */
  const unappr = await call(SPF, { action: 'register', email: 'xavier@pendco.test', password: 'Xav-Pass-1111', profile: { name: 'Xav', company: 'Pend Co' } });
  T.sp_rows.find(r => r.email === 'xavier@pendco.test').data.approved = false;
  const r2 = await call(SPF, { action: 'register', email: 'yolanda@pendco.test', password: 'Yol-Pass-1111', profile: { name: 'Yol', company: 'Pend Co 2' } });
  ok('4 a domain whose company is NOT approved never auto-joins (a normal pending sign-up)', unappr.st === 200 && r2.st === 200 && !r2.b.joined && !team().some(m => m.email === 'yolanda@pendco.test'), r2.b);
}

/* ═══ 5. free-mail → its own sign-up + "wants to join" for the office ═══ */
let fredProf = null;
{
  const g = await call(SPF, { action: 'register', email: 'gina.other@gmail.com', password: 'Gina-Pass-111', profile: { name: 'Gina', company: 'Totally Other Co' } });
  ok('5 a gmail sign-up for an unrelated company: nothing joins (gmail never matches a domain)', g.st === 200 && !g.b.joined && !team().some(m => m.email === 'gina.other@gmail.com'), g.b);
  const d = await call(SPF, { action: 'register', email: FRED, password: 'Fred-Pass-111', profile: { name: 'Fred Freemail', company: 'Acme Drywall LLC', phone: '901-555-0112' } });
  ok('5 a free-mail sign-up naming Acme first gets the usual "possible duplicate" check', d.st === 200 && Array.isArray(d.b.duplicates) && d.b.duplicates.length >= 1, d.b);
  const r = await call(SPF, { action: 'register', email: FRED, password: 'Fred-Pass-111', force: true, profile: { name: 'Fred Freemail', company: 'Acme Drywall LLC', phone: '901-555-0112' } });
  fredProf = (T.sp_rows.find(x => x.collection === 'users' && x.email === FRED) || {}).data;
  const row = team().find(m => m.email === FRED);
  ok('5 … continuing → NOT joined by itself: their own pending sign-up + "wants to join Acme Drywall LLC" (status requested)', r.st === 200 && !r.b.joined && fredProf && fredProf.approved === false && fredProf.wantsJoin && fredProf.wantsJoin.company === 'Acme Drywall LLC' && row && row.status === 'requested' && row.company === 'sp:' + P1.id, { r: r.b, fredProf, row });
  TOK['tok-fred'] = FRED;
  const me = await bid('tok-fred', 'me');
  ok('5 … while waiting, they see only their own (pending) sign-up — none of Acme\'s data', me.st === 200 && me.b.user.id === fredProf.id && !me.b.team, me.b);
  const l = await sa('tok-office', { action: 'list', filter: 'joinreq' });
  ok('5 the office sees it: 🔐 Sub portal accounts → "👥 Wants to join" (1) = Acme Drywall LLC', l.st === 200 && l.b.counts.joinreq === 1 && l.b.accounts.length === 1 && l.b.accounts[0].id === P1.id && l.b.accounts[0].team.requested === 1, l.b);
  ok('5 … and the team-joined sign-in (Dana) is not listed as a broken "no profile" sign-in', l.b.counts.orphan === 0, l.b.counts);
  const g1 = await sa('tok-office', { action: 'get', id: P1.id });
  const fr = g1.b.team && g1.b.team.list.find(x => x.email === FRED);
  ok('5 … the company\'s sheet lists the team (main contact, Corey, Dana, Fred "wants to join") and the office may change it', g1.st === 200 && g1.b.teamEdit === true && g1.b.team.list[0].primary && fr && fr.status === 'requested' && g1.b.team.list.some(x => x.email === COREY) && g1.b.team.list.some(x => x.email === DANA), g1.b.team);
  const pm = await sa('tok-pm', { action: 'team-set', id: P1.id, op: 'approve', memberId: fr.id });
  ok('9 gate by role: a plain staff sign-in can\'t touch a team (403)', pm.st === 403, pm);
  const ap = await sa('tok-office', { action: 'team-set', id: P1.id, op: 'approve', memberId: fr.id });
  const row2 = team().find(m => m.email === FRED);
  ok('5 the office approves the join → active, decided by the office (who / when)', ap.st === 200 && row2.status === 'active' && row2.decidedBy.email === 'office@grayco.test' && !!row2.decidedAt, { ap: ap.b, row2 });
  const me2 = await bid('tok-fred', 'me');
  ok('5 … now Fred signs in as Acme (the company\'s data); his own sign-up record is kept as it was', me2.st === 200 && me2.b.user.id === P1.id && T.sp_rows.some(x => x.collection === 'users' && x.email === FRED), me2.b);
  const s = await pwSignin(FRED, 'Fred-Pass-111');
  ok('5 … and the portal password sign-in opens Acme\'s portal', s.st === 200 && s.b.kind === 'partner' && T.gc_portal_session.find(x => x.id === sha(s.b.session)).sub_id === SUB1.id, s);
}

/* ═══ 6. removal disables access, keeps the record ═══ */
{
  const r = await pas(bossS, 'p-team-remove', { id: coreyId });
  const row = team().find(m => m.email === COREY);
  ok('6 Remove → the record STAYS (status removed, removed by the main contact, when) — never deleted', r.st === 200 && row && row.status === 'removed' && row.removedBy.email === BOSS && !!row.removedAt && (row.log || []).some(x => x.op === 'remove'), row);
  ok('6 … their signed-in devices end at once', T.gc_portal_session.filter(x => x.ident && x.revoked !== true && x.sub_id === SUB1.id).every(x => x.id !== sha(coreyS)) && T.gc_portal_session.find(x => x.id === sha(coreyS)).revoked === true);
  const h = await pas(coreyS, 'p-home'); ok('6 … the old session opens nothing', h.st === 404, h);
  const s = await pwSignin(COREY, 'Corey-Pass-111');
  ok('6 … a new password sign-in is refused with a clear reason', s.st === 403 && /taken off your company/.test(s.b.error), s);
  const me = await bid('tok-corey', 'me');
  ok('6 … the bid site refuses them too', me.st === 401 && /taken off/.test(me.b.error), me);
  const c = await codeSignin(COREY);
  ok('6 … and no sign-in code is sent to them', c.nomail === true || c.st !== 200, c);
  const t = await pas(bossS, 'p-team');
  const x = t.b.team.find(y => y.id === coreyId);
  ok('6 My team still lists them as "Removed — by Bo Boss" (archive, not purge)', x && x.status === 'removed' && x.removedBy.name === 'Bo Boss', x);
  const rs = await pas(bossS, 'p-team-restore', { id: coreyId });
  const s2 = await pwSignin(COREY, 'Corey-Pass-111');
  ok('6 Restore → active again (restored by / when) and they can sign in', rs.st === 200 && team().find(m => m.email === COREY).status === 'active' && !!team().find(m => m.email === COREY).restoredAt && s2.st === 200 && s2.b.kind === 'partner', { rs: rs.b, s2 });
  coreyS = s2.b.session;
}

/* ═══ 7. the last-member guard ═══ */
{
  const s = await pwSignin(SOLO, 'Solo-Pass-111'), soloS = s.b.session;
  const a = await pas(soloS, 'p-team-add', { name: 'Mia Member', email: MIA });
  AUTH[MIA] = { id: 'auth-mia', pw: 'Mia-Pass-1111', portal: 'team' };
  const ms = (await pwSignin(MIA, 'Mia-Pass-1111')).b.session;
  const miaId = a.b.added.id;
  const rp = await pas(ms, 'p-team-remove', { id: 'primary' });
  ok('7 a member may take the main contact off the team (they left the company) — recorded, their sessions end', rp.st === 200 && team().some(m => m.primary && m.company === 'sp:' + P2.id && m.status === 'removed' && m.removedBy.email === MIA) && T.gc_portal_session.find(x => x.id === sha(soloS)).revoked === true, rp.b);
  const sp2 = await pwSignin(SOLO, 'Solo-Pass-111');
  ok('7 … the removed main contact can\'t sign in to the portal any more', sp2.st === 403, sp2);
  TOK['tok-solo'] = SOLO; const sb = await bid('tok-solo', 'me');
  ok('7 … nor to the bid site', sb.st === 401, sb);
  const last = await pas(ms, 'p-team-remove', { id: miaId });
  ok('7 the last active person can NOT remove themselves (409, nothing changed)', last.st === 409 && /last active person/.test(last.b.error) && team().find(m => m.id === miaId).status === 'active', last);
  const st = await sa('tok-office', { action: 'team-set', id: P2.id, op: 'remove', memberId: miaId });
  ok('7 staff CAN remove the last person (record kept, removed by the office)', st.st === 200 && team().find(m => m.id === miaId).status === 'removed' && team().find(m => m.id === miaId).removedBy.role === 'staff', st.b);
  const rs = await sa('tok-admin', { action: 'team-set', id: P2.id, op: 'restore', memberId: 'primary' });
  const back = await pwSignin(SOLO, 'Solo-Pass-111');
  ok('7 an owner restores the main contact → they sign in again', rs.st === 200 && back.st === 200 && back.b.kind === 'partner', { rs: rs.b, back });
  const log = await sa('tok-admin', { action: 'log' });
  ok('7 the staff changes are in the account audit list', log.st === 200 && log.b.log.some(e => e.action === 'team remove') && log.b.log.some(e => e.action === 'team restore'), log.b.log.slice(0, 4));
}

/* ═══ 8. customers: never the sub portal; residential household; GC company ═══ */
let caseyS = '', halS = '';
{
  const c = await pwSignin('casey@samplehome.test', 'casey');
  caseyS = c.b.session;
  ok('8 a homeowner signs in as before (e-mail + first name) → the customer portal', c.st === 200 && c.b.kind === 'customer', c);
  const t = await pas(caseyS, 'c-team');
  ok('8 … 👥 Household: just them, the account holder, who may add people', t.st === 200 && t.b.household === true && t.b.canManage === true && t.b.team.length === 1 && t.b.team[0].primary && t.b.me === 'primary', t.b);
  ok('8 … the answer never mentions the sub portal / bids / subs', !leaks(t.b), t.b);
  const p = await pas(caseyS, 'p-team'); const ph = await pas(caseyS, 'p-home');
  ok('8 a customer session can\'t open the sub portal\'s team or home (not active)', p.st === 404 && ph.st === 404 && !leaks(p.b), { p, ph });
  const sct = await pas(bossS, 'c-team');
  ok('8 … and a sub\'s session can\'t open a customer\'s team', sct.st === 404, sct);
  const a = await pas(caseyS, 'c-team-add', { name: 'Hal Household', email: 'hal@samplehome.test' });
  const halId = a.b.added && a.b.added.id;
  ok('8 the holder adds a household member (name + e-mail) → active, kind customer', a.st === 200 && team().some(m => m.email === 'hal@samplehome.test' && m.kind === 'customer' && m.status === 'active' && m.company === 'cu:e:casey@samplehome.test'), a.b);
  const n0 = MAIL.length, iv = await pas(caseyS, 'c-team-invite', { id: halId }), mm = MAIL.slice(n0).find(x => (x.to || []).includes('hal@samplehome.test'));
  ok('8 ✉️ Send invite (the holder\'s click) → an e-mail with the GrayCo Portal address — no word of the sub portal / bid site, no password link', iv.st === 200 && iv.b.invite.ok && mm && /portal\.test/.test(mm.html) && !/bids\.|bid site|sub ?portal|subcontract|recovery/i.test(mm.subject + mm.html), { iv: iv.b, mm });
  const hs = await codeSignin('hal@samplehome.test'); halS = hs.b.session;
  ok('8 Hal signs in with his OWN e-mail (a code) → the customer portal, the same job', hs.st === 200 && hs.b.kind === 'customer' && T.gc_portal_session.find(x => x.id === sha(halS)).links.includes('h'.repeat(43)), hs);
  const j = await pas(halS, 'c-jobs');
  ok('8 … he sees the household\'s job', j.st === 200 && j.b.jobs.some(x => x.id === HOME.id), j.b);
  const ht = await pas(halS, 'c-team'), ha = await pas(halS, 'c-team-add', { name: 'Kid', email: 'kid@samplehome.test' });
  ok('8 … in a residential household only the account holder adds / removes people', ht.st === 200 && ht.b.canManage === false && ha.st === 403 && !leaks(ht.b), { ht: ht.b, ha });
  const hp = await pwSignin('hal@samplehome.test', 'hal');
  ok('8 … a household member has no "first name" starter password (code sign-in, then their own)', hp.st === 401, hp);
  const sp1 = await pas(halS, 'c-password', { password: 'Hal-Own-Pass-1' }), hp2 = await pwSignin('hal@samplehome.test', 'Hal-Own-Pass-1');
  ok('8 … he sets his own password (stored under HIS login only) and signs in with it', sp1.st === 200 && hp2.st === 200 && hp2.b.kind === 'customer' && T.gc_portal_login.every(x => x.login !== 'e:casey@samplehome.test'), { sp1, hp2 });
  const msg = await pas(halS, 'c-send', { projectId: HOME.id, text: 'Hi from Hal' });
  ok('8 … a message he writes is signed with HIS name', msg.st === 200 && T.gc_portal_msg.some(x => x.text === 'Hi from Hal' && x.author === 'Hal Household'), T.gc_portal_msg.slice(-1));
  const rm = await pas(caseyS, 'c-team-remove', { id: halId });
  const hj = await pas(halS, 'c-jobs');
  ok('8 the holder removes Hal → kept on record, his session ends', rm.st === 200 && team().find(m => m.id === halId).status === 'removed' && hj.st === 404, { rm: rm.b, hj });
  /* GC / commercial */
  const g = await pwSignin('pm@bigboxbuild.test', 'gail');
  const gt = await pas(g.b.session, 'c-team');
  ok('8 a GC / commercial customer: 👥 My team (not "Household")', g.st === 200 && gt.st === 200 && gt.b.household === false && gt.b.canManage === true, { g, gt: gt.b });
  const ga = await pas(g.b.session, 'c-team-add', { name: 'Ken Coworker', email: 'ken@bigboxbuild.test' });
  const ks = (await codeSignin('ken@bigboxbuild.test')).b.session;
  const ka = await pas(ks, 'c-team-add', { name: 'Lia Coworker', phone: '901-555-0999' });
  ok('8 … any member of a GC company adds coworkers (a member added another)', ga.st === 200 && !!ks && ka.st === 200 && team().some(m => m.name === 'Lia Coworker' && m.addedBy.email === 'ken@bigboxbuild.test'), ka.b);
  const kiv = await pas(ks, 'c-team-invite', { id: ka.b.added.id });
  ok('8 … a mobile-only coworker → a ready text for the clicker\'s own phone (nothing sent by GrayCo)', kiv.st === 200 && kiv.b.invite.how === 'sms' && /^sms:9015550999\?body=/.test(kiv.b.invite.sms) && !leaks(kiv.b.invite), kiv.b);
}

/* ═══ 9. notifications ═══ */
{
  const before = await TM.notifyList(['sp:' + P1.id]);
  ok('9 members get GrayCo\'s notices only after turning them on (none yet)', before.length === 0, before);
  const n = await pas(coreyS, 'p-team-notify', { on: true });
  const after = await TM.notifyList(['sp:' + P1.id]);
  ok('9 Corey taps 🔔 Notify me → on his record (his own click), now on the notice list', n.st === 200 && n.b.notify === true && after.join() === COREY && team().find(m => m.email === COREY).notifyBy === COREY, { n: n.b, after });
  const pn = await pas(bossS, 'p-team-notify', { on: false });
  ok('9 the main contact keeps getting what they get today (their toggle changes nothing)', pn.st === 200 && pn.b.notify === true && /main contact always/.test(pn.b.note || ''), pn.b);
  const n0 = MAIL.length;
  const SUBT = require(path.join(BUILD, 'netlify/functions/_lib/subthread.js'));
  const sent = [];
  await SUBT.after({ crmData: async () => KV, subById: (d, id) => SUB1, core: () => ({ kvListUpdate: async () => ({ ok: true }) }), dbGet: async () => [], subLinkCreate: async () => ({ token: 'a'.repeat(43) }), linkFor: t => 'https://portal.test/#t=' + t,
    sendMail: async (to, subj, html) => { sent.push({ to, html }); return { ok: true }; }, mailHtml: (a, b, c, btn) => String(b) + ' ' + (btn ? btn.href : ''), textReady: () => false, okEmail: e => /@/.test(e), phone10: () => '',
    teamCc: async () => TM.notifyList(['sp:' + P1.id]), portalBase: () => 'https://portal.test' }, { id: 'M1', pid: JOB.id, subId: SUB1.id, side: 'gc', author: 'Sample PM', text: 'Crew on site Monday' });
  ok('9 a GrayCo message to the sub: the main contact as before (with their link) + Corey (opted in) with a plain sign-in link — never the company\'s link code',
    sent.length === 2 && sent[0].to === BOSS && /#t=/.test(sent[0].html) && sent[1].to === COREY && !/#t=/.test(sent[1].html) && /portal\.test\//.test(sent[1].html), sent);
  ok('9 nothing went to a customer by itself in this whole run (every customer e-mail was a sign-in code they asked for or an invite a person clicked)', MAIL.filter(x => (x.to || []).some(t => /samplehome|bigboxbuild/.test(t))).every(x => /code|added you/i.test(x.subject + x.html)), MAIL.filter(x => (x.to || []).some(t => /samplehome|bigboxbuild/.test(t))).map(x => x.subject));
}

/* ═══ B. the pages (Chromium): sub portal My team + customer Household — phone and desk ═══ */
if (!NO_BROWSER) {
  const PW_MOD = process.env.NODE_PATH && fs.existsSync(path.join(process.env.NODE_PATH.split(':')[0], 'playwright')) ? path.join(process.env.NODE_PATH.split(':')[0], 'playwright') : 'playwright';
  const { chromium } = require(PW_MOD);
  const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  const errs = [], bad = [];
  async function ctxOf(w, hgt, mobile){
    const ctx = await browser.newContext({ serviceWorkers: 'block', bypassCSP: true, viewport: { width: w, height: hgt }, isMobile: mobile, hasTouch: mobile });
    await ctx.route('**/*', async r => {
      const rq = r.request(), u = new URL(rq.url());
      if (u.host !== 'portal.test') return r.abort('blockedbyclient');
      const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
      if (fm) {
        const fn = fm[1] === 'portal-access' ? PA : fm[1] === 'subportal' ? SPF : fm[1] === 'portal' ? PJ : null;
        if (!fn) return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
        reset();
        const resp = await fn.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': ipNext() }, rq.headers()), body: rq.postData() || '' });
        if (resp.statusCode >= 500) bad.push(fm[1] + ' → ' + resp.statusCode + ' ' + String(resp.body).slice(0, 160));
        return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
      }
      const f = path.join(BUILD, u.pathname === '/' ? 'portal.html' : decodeURIComponent(u.pathname));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
      return r.fulfill({ status: 404, body: '' });
    });
    return ctx;
  }
  const page = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); return p; };
  const txt = (p, sel) => p.textContent(sel || 'body').catch(() => '');
  async function signin(p, email, pw){ await p.goto('https://portal.test/'); await p.waitForSelector('#siEmail', { timeout: 20000 }); await p.fill('#siEmail', email); await p.fill('#siPw', pw); await p.click('#siLogin'); }
  for (const [w, hgt, mob, tag] of [[390, 844, true, 'phone'], [1280, 900, false, 'desk']]) {
    const ctx = await ctxOf(w, hgt, mob), p = await page(ctx);
    await signin(p, BOSS, 'Boss-Pass-111');
    await p.waitForSelector('#tabs button[data-tab="papers"]', { timeout: 20000 });
    await p.click('#tabs button[data-tab="papers"]');
    const card = await p.waitForSelector('#teamCard [data-tm="primary"]', { timeout: 15000 }).catch(() => null);
    ok('B ' + tag + ': the sub portal\'s Papers → 👥 My team lists the main contact and the coworkers (Corey, Dana, Fred)', !!card && /Corey Coworker/.test(await txt(p, '#teamCard')) && /Dana Domain/.test(await txt(p, '#teamCard')), await txt(p, '#teamCard'));
    const nm = 'Pat Page ' + tag;
    await p.click('#tmAdd'); await p.fill('#tmName', nm); await p.fill('#tmEmail', 'pat.' + tag + '@acmedrywall.test'); await p.click('#tmSave');
    const added = await waitFor(async () => /is on your team now/.test(await txt(p, '#teamCard')) && /Pat Page/.test(await txt(p, '#teamCard')));
    ok('B ' + tag + ': ＋ Add a coworker (inline form, no pop-up) → on the team at once', !!added && team().some(m => m.name === nm && m.status === 'active'), await txt(p, '#teamCard'));
    const id = team().find(m => m.name === nm).id;
    await p.click('[data-tm-invite="' + id + '"]');
    ok('B ' + tag + ': ✉️ Send invite → "Invite sent to …"', !!(await waitFor(async () => /Invite sent to pat\./.test(await txt(p, '[data-tm-note]')))), await txt(p, '#teamCard'));
    await p.click('[data-tm-remove="' + id + '"]');
    ok('B ' + tag + ': Remove asks once more inline ("Tap again to remove …")', /Tap again to remove/.test(await txt(p, '[data-tm-remove="' + id + '"]')));
    await p.click('[data-tm-remove="' + id + '"]');
    ok('B ' + tag + ': … then shows them as Removed — by Bo Boss, with Restore', !!(await waitFor(async () => /Removed — by Bo Boss/.test(await txt(p, '[data-tm="' + id + '"]')) && !!(await p.$('[data-tm-restore="' + id + '"]')))), await txt(p, '[data-tm="' + id + '"]'));
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok('B ' + tag + ': no sideways scroll (' + w + ' px)', sw <= w, sw);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'portalteam_sub_' + tag + '.png'), fullPage: true }).catch(() => {});
    await ctx.close();
    /* the customer */
    const c2 = await ctxOf(w, hgt, mob), q = await page(c2);
    await signin(q, 'casey@samplehome.test', 'casey');
    const hc = await q.waitForSelector('#gcpt-card', { timeout: 20000 }).catch(() => null);
    const ct = await txt(q, '#gcpt-card');
    ok('B ' + tag + ': the homeowner\'s Home shows 👥 Household (Hal listed as Removed) — no sub-portal words anywhere on the card', !!hc && /Household/.test(ct) && /Hal Household/.test(ct) && !/sub ?portal|subcontract|bids\.|bid site/i.test(ct), ct);
    await q.click('#ptAdd'); await q.fill('#ptName', 'Robin ' + tag); await q.fill('#ptEmail', 'robin.' + tag + '@samplehome.test'); await q.click('#ptSave');
    ok('B ' + tag + ': ＋ Add someone → added inline', !!(await waitFor(async () => /is added/.test(await txt(q, '#gcpt-card')) && /Robin/.test(await txt(q, '#gcpt-card')))), await txt(q, '#gcpt-card'));
    const sw2 = await q.evaluate(() => document.documentElement.scrollWidth);
    ok('B ' + tag + ': customer page — no sideways scroll', sw2 <= w, sw2);
    if (SHOTS) await q.screenshot({ path: path.join(SHOTS, 'portalteam_cust_' + tag + '.png'), fullPage: true }).catch(() => {});
    await c2.close();
  }
  /* C. the CRM: Admin → 🔐 Sub portal accounts → the company's 👥 Team (the real gc-patch-subacct block on a stub page), as the office */
  {
    const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
    const blk = (/<script id="gc-patch-subacct">[\s\S]*?<\/script>/.exec(html) || [''])[0];
    const subMatch = fs.readFileSync(path.join(BUILD, 'sub-match.js'), 'utf8');
    for (const [w, tag] of [[390, 'phone'], [1280, 'desk']]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      await ctx.route('**/*', async rt => {
        const rq = rt.request(), u = new URL(rq.url());
        if (u.pathname === '/.netlify/functions/sub-accounts') { reset(); const out = await SA.handler({ httpMethod: 'POST', headers: rq.headers(), body: rq.postData() || '' }); if (out.statusCode >= 500) bad.push('sub-accounts ' + out.body); return rt.fulfill({ status: out.statusCode, contentType: 'application/json', body: out.body }); }
        if (u.pathname === '/sub-match.js') return rt.fulfill({ status: 200, contentType: 'text/javascript', body: subMatch });
        if (u.pathname === '/') return rt.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="box"></div>'
          + '<script>window.__GC_AUTH__ = { fresh: function(){ return Promise.resolve({ access_token: "tok-office" }); }, isAdmin: function(){ return false; } }; window._gcIsOfficeFull = function(){ return true; };'
          + 'window._gcAdmAddSection = function(c){ window.__sec = c; return true; }; window._gcBidSubs = { run: function(){ return Promise.resolve({}); }, approved: function(){ return Promise.resolve({}); } };</script>'
          + '<script src="/sub-match.js"></script>' + blk + '</body></html>' });
        return rt.abort('blockedbyclient');
      });
      const p = await ctx.newPage(); p.on('pageerror', e => errs.push('crm: ' + String(e.message).slice(0, 200))); p.on('dialog', d => d.accept());
      await p.goto('http://crm.test/');
      await p.waitForFunction(() => !!window.__sec, null, { timeout: 10000 }).catch(() => {});
      await p.evaluate(() => window.__sec.render(document.getElementById('box')));
      await p.waitForSelector('#gc-sa tr[data-sa-row="u_acme"]', { timeout: 15000 });
      ok('C ' + tag + ': the accounts list shows the team count on the company and a "👥 Wants to join" filter', /on the team/.test(await txt(p, 'tr[data-sa-row="u_acme"]')) && !!(await p.$('[data-sa=filter][data-f=joinreq]')), await txt(p, 'tr[data-sa-row="u_acme"]'));
      await p.click('tr[data-sa-row="u_acme"]');
      await p.waitForSelector('#gc-sa-sheet [data-sa-team] [data-sa-member="primary"]', { timeout: 15000 });
      const tt = await txt(p, '#gc-sa-sheet [data-sa-team]');
      ok('C ' + tag + ': the office opens Acme → 👥 Team: main contact, Corey (active), Dana (joined by company e-mail), Fred, removed people kept', /main contact/.test(tt) && /Corey Coworker/.test(tt) && /joined by company e-mail/.test(tt) && /Fred Freemail/.test(tt) && /removed by Bo Boss/.test(tt), tt);
      const nm = 'Office Added ' + tag;
      await p.fill('[data-sa-tm=name]', nm); await p.fill('[data-sa-tm=email]', 'office.added.' + tag + '@acmedrywall.test');
      await p.click('[data-sa-act=team][data-op=add]');
      ok('C ' + tag + ': ＋ Add to the team (the office) → listed, added by the office', !!(await waitFor(async () => new RegExp(nm).test(await txt(p, '#gc-sa-sheet [data-sa-team]')))) && team().some(m => m.name === nm && m.addedBy.role === 'staff'), await txt(p, '#gc-sa-sheet [data-sa-team]'));
      const id = team().find(m => m.name === nm).id;
      await p.click('[data-sa-act=team][data-op=remove][data-m="' + id + '"]');
      ok('C ' + tag + ': Remove → "removed by Ofelia Office", with Restore (kept on record)', !!(await waitFor(async () => /removed by Ofelia Office/.test(await txt(p, '[data-sa-member="' + id + '"]')) && !!(await p.$('[data-sa-act=team][data-op=restore][data-m="' + id + '"]')))) && team().find(m => m.id === id).status === 'removed', await txt(p, '[data-sa-member="' + id + '"]'));
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      ok('C ' + tag + ': the sheet fits (' + w + ' px, no sideways scroll)', sw <= w + 1, sw);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'portalteam_crm_' + tag + '.png'), fullPage: true }).catch(() => {});
      await ctx.close();
    }
  }
  ok('B no page errors', errs.length === 0, errs);
  ok('B no server 5xx', bad.length === 0, bad);
  await browser.close();
}

const n = R.length, f = R.filter(x => !x).length;
console.log('\n' + (n - f) + '/' + n + ' passed' + (f ? ' — ' + f + ' FAILED' : ''));
process.exit(f ? 1 : 0);
