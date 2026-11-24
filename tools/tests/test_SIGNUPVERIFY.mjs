// test_SIGNUPVERIFY.mjs <build-dir> — patch SIGNUPVERIFY (owner 11/23: "Yes subs should confirm their email").
// Offline: the REAL server functions (subportal.js, portal-access.js, sub-accounts.js) on an in-memory Supabase + Resend. Made-up data.
//  1. old accounts (made before this change: no flag) work exactly as before — approved and still-pending ones
//  2. a self sign-up is held: 403 everywhere (bid site, portal password, pending page), no papers token, no office card / e-mail, can't be approved
//  3. the confirm link: opening the page confirms nothing; wrong / reused codes fail; Confirm → the normal flow (office card, pending page)
//  4. an expired code fails; "Resend link" sends a new one (one a minute); signing up again re-sends instead of "already has an account"
//  5. an invite link e-mailed to that address (with its token) = confirmed; an e-mail-only invite needs the confirm, then gets the job
//  6. a supplier sign-up is held too; staff see "e-mail not confirmed" and resend (owners + office; not plain staff)
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', RESEND_API_KEY: 're_test', CUST_QUIET_OFF: '1', PORTAL_BASE_URL: 'https://portal.test' });
delete process.env.PORTAL_MAIL_OFF; delete process.env.OWNER_EMAILS; delete process.env.STAFF_EMAILS;
const now = () => new Date().toISOString();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sp = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now() }, extra || {});
const OLD1 = { id: 'u_old1', role: 'sub', approved: true, email: 'old.approved@oldsub.test', name: 'Ola Old', company: 'Old Approved Co', createdAt: '2026-09-01T00:00:00Z', authUserId: 'auth-old1' };
const OLD2 = { id: 'u_old2', role: 'sub', approved: false, email: 'old.pending@oldpend.test', name: 'Pen Old', company: 'Old Pending Co', createdAt: '2026-11-01T00:00:00Z', authUserId: 'auth-old2' };
const INVTOK = 'a1b2c3d4e5f6a7b8c9d0';
const AUTH = { [OLD1.email]: { id: 'auth-old1', pw: 'Old-Pass-1111' }, [OLD2.email]: { id: 'auth-old2', pw: 'Old-Pass-2222' } };
const TOK = { 'tok-admin': 'owner@grayco.test', 'tok-office': 'office@grayco.test', 'tok-pm': 'pm@grayco.test', 'tok-old1': OLD1.email };
const KV = { vendors: [], projects: [], users: [{ id: 'u2', name: 'Ofelia Office', email: 'office@grayco.test', role: 'Office Manager', active: true }], gc_sub_portal_settings: { deviceCode: 'off' } };
const T = { gc_portal_session: [], gc_portal_code: [], gc_portal_lock: [], gc_portal_login: [], gc_sub_device: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], gc_sub_link: [], gc_portal: [],
  gc_staff: [{ email: 'owner@grayco.test', name: 'Owen Owner', role: 'admin', active: true }, { email: 'office@grayco.test', name: 'Ofelia Office', role: 'office', active: true }, { email: 'pm@grayco.test', name: 'Sample PM', role: 'staff', profile: 'pm', active: true }],
  sp_rows: [sp('users', OLD1.id, OLD1, { user_id: OLD1.id, email: OLD1.email }), sp('users', OLD2.id, OLD2, { user_id: OLD2.id, email: OLD2.email }),
    sp('jobs', 'BJ1', { id: 'BJ1', title: 'Sample Bid Job', status: 'open', visibility: 'public', trades: ['Drywall'] }, { job_id: 'BJ1' }),
    sp('jobs', 'BJ2', { id: 'BJ2', title: 'Private Invite Job', status: 'open', visibility: 'invited', trades: ['Paint'] }, { job_id: 'BJ2' }),
    sp('invites', 'INV1', { id: 'INV1', jobId: 'BJ2', email: 'linked@invitedpaint.test', token: INVTOK, createdAt: '2026-11-20T00:00:00Z' }, { job_id: 'BJ2', email: 'linked@invitedpaint.test' }),
    sp('invites', 'INV2', { id: 'INV2', jobId: 'BJ2', email: 'mailonly@invitedtile.test', token: 'f'.repeat(20), createdAt: '2026-11-20T00:00:00Z' }, { job_id: 'BJ2', email: 'mailonly@invitedtile.test' })] };
let MAIL = [];
const res = (status, body, hd) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => (hd || {})[String(k).toLowerCase()] || null }, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return res(200, { id: 'm' + MAIL.length }); }
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') { const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, ''); return TOK[a] ? res(200, { id: (AUTH[TOK[a]] || {}).id || 'auth-staff-' + TOK[a], email: TOK[a] }) : res(401, {}); }
  if (u.pathname === '/auth/v1/admin/users' && m === 'POST') { const b = JSON.parse(init.body), e = String(b.email).toLowerCase(); if (AUTH[e]) return res(422, { msg: 'already been registered' }); AUTH[e] = { id: 'auth-' + crypto.randomBytes(3).toString('hex'), pw: b.password }; return res(200, { id: AUTH[e].id, email: e }); }
  if (u.pathname === '/auth/v1/admin/users' && m === 'GET') return res(200, { users: Object.keys(AUTH).map(e => ({ id: AUTH[e].id, email: e, user_metadata: { portal: 'sub' } })) });
  if (u.pathname.startsWith('/auth/v1/admin/users/')) { const id = decodeURIComponent(u.pathname.split('/').pop()); const e = Object.keys(AUTH).find(k => AUTH[k].id === id); return e ? res(200, { id, email: e }) : res(404, {}); }
  if (u.pathname === '/auth/v1/admin/generate_link') return res(200, { action_link: 'https://sb.test/verify?type=recovery' });
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
let IPN = 0; const ipNext = () => '10.9.' + (IPN++ % 250) + '.' + (1 + (IPN >> 8) % 200);
const call = async (fn, body, headers) => { try { PA._core._reset(); } catch (e) {} const r = await fn.handler({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': ipNext() }, headers || {}), body: JSON.stringify(body) }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { st: r.statusCode, b: j }; };
const reg = (email, extra, profile) => call(SPF, Object.assign({ action: 'register', email, password: 'Good-Pass-1111', profile: Object.assign({ name: 'Sam Signup', company: 'Co ' + email.split('@')[1], phone: '901-555-0' + (100 + (IPN % 800)) }, profile || {}) }, extra || {}));
const pw = (email, password) => call(PA, { action: 'signin-password', email, password: password || 'Good-Pass-1111' });
const bid = (email, action, body) => { const t = 'tok-' + sha(email).slice(0, 8); TOK[t] = email; return call(SPF, Object.assign({ action }, body || {}), { authorization: 'Bearer ' + t }); };
const prof = e => (T.sp_rows.find(r => r.collection === 'users' && r.email === e) || {}).data;
const tokOf = e => { const mm = MAIL.filter(x => (x.to || []).includes(e) && /signup-confirm=/.test(x.html)).slice(-1)[0]; return mm ? decodeURIComponent((/signup-confirm=([A-Za-z0-9_%-]+)/.exec(mm.html) || [])[1] || '') : ''; };
const confirm = token => call(SPF, { action: 'signup-confirm', token });
const sync = () => call(PA, { action: 's-sync' }, { authorization: 'Bearer tok-office' });
const officeMail = () => MAIL.filter(x => /Approve new sub|New supplier|Check new sub/.test(x.subject));

/* 1. old accounts */
{
  const a = await bid(OLD1.email, 'me'), b = await pw(OLD1.email, 'Old-Pass-1111');
  ok('1 an old approved account (no flag — made before this change) works as before: bid site + portal', a.st === 200 && a.b.user && a.b.user.id === OLD1.id && b.st === 200 && !!b.b.session && !b.b.unconfirmed, { a, b });
  const c = await pw(OLD2.email, 'Old-Pass-2222');
  ok('1 an old still-pending account still gets its waiting page (pending session)', c.st === 200 && c.b.kind === 'pending', c);
  const s = await sync();
  ok('1 … and is still a card in ✅ Approvals', s.st === 200 && s.b.bids.some(x => x.id === OLD2.id), s.b.bids);
  ok('1 nothing was written to the old accounts', JSON.stringify(prof(OLD1.email)) === JSON.stringify(OLD1) && JSON.stringify(prof(OLD2.email)) === JSON.stringify(OLD2));
}

/* 2. a self sign-up is held */
const SELF = 'self@newdrywall.test';
{
  const n0 = officeMail().length;
  const r = await reg(SELF);
  const p = prof(SELF), tok = tokOf(SELF);
  ok('2 a self sign-up → "check your e-mail" (verify), not approved, NO papers token', r.st === 200 && r.b.ok && r.b.verify === true && r.b.approved === false && !r.b.paperToken && /Check your e-mail/.test(r.b.message), r.b);
  ok('2 … the profile is marked unconfirmed; only the SHA-256 of the one-time code is kept (24 h)', p && p.emailUnverified === true && !p.emailVerifiedAt && /^[0-9a-f]{64}$/.test(p.emailVerify.hash) && Date.parse(p.emailVerify.exp) - Date.now() > 23.9 * 3600e3 && !!tok && JSON.stringify(T.sp_rows).indexOf(tok) < 0, p);
  ok('2 … the confirm e-mail went to that address (tagged trade; the button opens the confirm page)', MAIL.some(x => (x.to || []).includes(SELF) && /Confirm your e-mail/.test(x.subject) && /subportal\?signup-confirm=/.test(x.html)));
  ok('2 … the office got NO "approve new sub" e-mail', officeMail().length === n0);
  const m1 = await bid(SELF, 'me'), m2 = await bid(SELF, 'load', { keys: ['jobs', 'bids'] }), m3 = await bid(SELF, 'save', { key: 'bids', upsert: [{ id: 'X1', jobId: 'BJ1', amount: 1 }] });
  ok('2 unconfirmed → 403 on the bid site (me, load jobs / bids, save a bid) with "Check your e-mail"', m1.st === 403 && m2.st === 403 && m3.st === 403 && /Check your e-mail/.test(m1.b.error) && JSON.stringify(m2.b).indexOf('Sample Bid Job') < 0, { m1, m2, m3 });
  const g = await pw(SELF);
  ok('2 unconfirmed → the portal password sign-in is 403 { unconfirmed: true } (no pending page)', g.st === 403 && g.b.unconfirmed === true && !g.b.session && !T.gc_portal_session.some(x => x.kind === 'pending' && x.sub_id === p.id), g);
  const w = await pw(SELF, 'Wrong-Pass-1111');
  ok('2 … a wrong password still says "don\'t match" (the confirm state is never shown without the password)', w.st === 401 && !w.b.unconfirmed, w);
  const s = await sync();
  ok('2 no card in ✅ Approvals', s.st === 200 && !s.b.bids.some(x => x.id === p.id), s.b.bids.map(x => x.id));
  const ap = await call(PA, { action: 's-bids-approve', id: p.id, approve: true }, { authorization: 'Bearer tok-admin' });
  ok('2 … and it can\'t be approved before the confirm (409)', ap.st === 409 && prof(SELF).approved === false, ap);
  const ad = await call(SPF, { action: 'load', keys: ['users'] }, { authorization: 'Bearer tok-admin' });
  ok('2 the bid site\'s admin list (and the CRM\'s sign-up sync) does not list it', ad.st === 200 && !JSON.stringify(ad.b).includes(SELF), ad.st);
  const up = await call(SPF, { action: 'signup-papers', token: 'u_x.1.bad', items: [] });
  ok('2 no papers can be sent without a papers token', up.st >= 400, up.st);
}

/* 3. the confirm */
{
  const tok = tokOf(SELF), p0 = prof(SELF);
  const pg = await SPF.handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { 'signup-confirm': tok }, body: '' });
  ok('3 the link opens a page with a Confirm button — opening it confirms nothing', pg.statusCode === 200 && /Confirm my e-mail/.test(pg.body) && prof(SELF).emailUnverified === true && !prof(SELF).emailVerifiedAt);
  const bad = await confirm('z'.repeat(43));
  ok('3 a wrong code fails (400)', bad.st === 400 && !prof(SELF).emailVerifiedAt, bad);
  const n0 = officeMail().length;
  const c = await confirm(tok);
  const p = prof(SELF);
  ok('3 Confirm → confirmed (when), the code is used up; still waits for GrayCo (a self sign-up)', c.st === 200 && c.b.ok && c.b.approved === false && !!p.emailVerifiedAt && !p.emailVerify && p.approved === false, { c, p });
  ok('3 … NOW the office gets the new sign-up e-mail and the ✅ Approvals card', officeMail().length === n0 + 1 && (await sync()).b.bids.some(x => x.id === p0.id));
  const again = await confirm(tok);
  ok('3 the same code again fails (400)', again.st === 400, again);
  const g = await pw(SELF), m = await bid(SELF, 'me');
  ok('3 after the confirm: the portal waiting page and the bid site open as for any new sign-up', g.st === 200 && g.b.kind === 'pending' && m.st === 200 && m.b.user && m.b.user.id === p0.id, { g, m });
  const ap = await call(PA, { action: 's-bids-approve', id: p0.id, approve: true }, { authorization: 'Bearer tok-admin' });
  const l = await bid(SELF, 'load', { keys: ['jobs'] });
  ok('3 … and once GrayCo approves, they see the jobs', ap.st === 200 && l.st === 200 && JSON.stringify(l.b).includes('Sample Bid Job'), { ap: ap.st, l: l.st });
}

/* 4. expired / resend / sign up again */
const EXP = 'late@slowpaint.test';
{
  await reg(EXP);
  const t1 = tokOf(EXP);
  T.sp_rows.find(r => r.collection === 'users' && r.email === EXP).data.emailVerify.exp = new Date(Date.now() - 1000).toISOString();
  const c = await confirm(t1);
  ok('4 a code older than 24 hours fails (410) — still unconfirmed, still no access', c.st === 410 && /run out/.test(c.b.error) && !prof(EXP).emailVerifiedAt && (await bid(EXP, 'me')).st === 403, c);
  const n0 = MAIL.length, r1 = await call(SPF, { action: 'signup-resend', email: EXP }), t2 = tokOf(EXP);
  const r2 = await call(SPF, { action: 'signup-resend', email: EXP });
  ok('4 "Resend link" → a new code by e-mail; a second tap within a minute sends nothing (same answer)', r1.st === 200 && r1.b.ok && t2 && t2 !== t1 && r2.st === 200 && r2.b.ok && MAIL.length === n0 + 1, { r1: r1.b, n: MAIL.length - n0 });
  const s0 = MAIL.length, rs = await call(SPF, { action: 'signup-resend', email: 'nobody@nowhere.test' });
  ok('4 "Resend" for an unknown address: the same answer, nothing sent', rs.st === 200 && rs.b.ok && MAIL.length === s0);
  ok('4 the old (expired) code stays dead after the resend', (await confirm(t1)).st === 400);
  const c2 = await confirm(t2);
  ok('4 the new code confirms', c2.st === 200 && !!prof(EXP).emailVerifiedAt, c2);
  const RE = 'again@forgotlink.test';
  await reg(RE); const ta = tokOf(RE);
  const ag = await reg(RE);
  ok('4 signing up again with an unconfirmed e-mail → "check your e-mail" (not "already has an account")', ag.st === 200 && ag.b.verify === true, ag);
}

/* 5. invites */
{
  const L = 'linked@invitedpaint.test';
  const r = await reg(L, { invite: INVTOK, job: 'BJ2' });
  const p = prof(L);
  ok('5 a sign-up from the e-mailed invite link (its token, to that address) is confirmed by the link: approved at once, the job, no confirm mail', r.st === 200 && r.b.approved === true && !r.b.verify && !!r.b.paperToken && p.emailVerifiedVia === 'invite-link' && !p.emailUnverified && p.invitedJobId === 'BJ2' && !tokOf(L), { r: r.b, p });
  ok('5 … the invite is used', !!T.sp_rows.find(x => x.key === 'invites/INV1').data.usedAt);
  const M = 'mailonly@invitedtile.test';
  const r2 = await reg(M);
  const p2 = prof(M);
  ok('5 an invite matched only by e-mail (no token) must confirm first: held, NOT approved, no job yet, the invite not used', r2.st === 200 && r2.b.verify === true && p2.approved === false && !p2.invitedJobId && !T.sp_rows.find(x => x.key === 'invites/INV2').data.usedAt && (await bid(M, 'me')).st === 403, { r2: r2.b, p2 });
  const c = await confirm(tokOf(M));
  const p3 = prof(M);
  ok('5 … after the confirm it gets the invite\'s approval: approved, the invited job, a GrayCo check card, the invite used', c.st === 200 && c.b.approved === true && p3.approved === true && p3.invitedJobId === 'BJ2' && p3.vetPending === true && !!T.sp_rows.find(x => x.key === 'invites/INV2').data.usedAt && (await bid(M, 'me')).st === 200, { c, p3 });
}

/* 6. supplier + staff */
{
  const S = 'quotes@newsupply.test';
  const r = await reg(S, {}, { acctType: 'supplier', company: 'New Supply Co' });
  ok('6 a supplier sign-up is held too (no instant approval before the confirm)', r.st === 200 && r.b.verify === true && prof(S).approved === false && prof(S).role === 'supplier' && (await bid(S, 'me')).st === 403, r.b);
  const c = await confirm(tokOf(S));
  ok('6 … after the confirm it is approved (as suppliers are)', c.st === 200 && prof(S).approved === true && (await bid(S, 'me')).st === 200, c);
  const U = 'staffsee@unconf.test'; await reg(U); const pu = prof(U);
  const l = await call(SA, { action: 'list', filter: 'unconfirmed' }, { authorization: 'Bearer tok-office' });
  ok('6 🔐 Sub portal accounts: "✉️ E-mail not confirmed" filter + flag on the account', l.st === 200 && l.b.accounts.some(a => a.id === pu.id && a.emailUnconfirmed === true) && !l.b.accounts.some(a => a.id === OLD1.id), l.b);
  const g = await call(SA, { action: 'get', id: pu.id }, { authorization: 'Bearer tok-office' });
  ok('6 … the account sheet says so', g.st === 200 && g.b.account.emailUnconfirmed === true, g.b.account);
  const pm = await call(SA, { action: 'verify-resend', id: pu.id }, { authorization: 'Bearer tok-pm' });
  const n0 = MAIL.length, rs = await call(SA, { action: 'verify-resend', id: pu.id }, { authorization: 'Bearer tok-office' });
  ok('6 the office re-sends the confirm link (to the sign-up\'s own e-mail only); plain staff can\'t (403)', pm.st === 403 && rs.st === 200 && rs.b.sent === true && MAIL.slice(n0).length === 1 && MAIL[n0].to.includes(U), { pm, rs: rs.b });
  const a2 = await call(SA, { action: 'verify-resend', id: OLD1.id }, { authorization: 'Bearer tok-office' });
  ok('6 … an old / confirmed account: "already confirmed", nothing sent', a2.st === 200 && a2.b.already === true, a2.b);
}

/* 7. patch SUPPORTAL (owner 11/24, ABC's Tom: "it says I'm not turned on yet"): a supplier's right password on the partner portal →
   "sign in at bids.grayco-cs.com" (the portal is for subs), never "not turned on yet"; a wrong one is still just wrong */
{
  const SUP = 'tom@sample-supply.test';
  await reg(SUP, {}, { acctType: 'supplier', trades: ['Roofing materials'] }); await confirm(tokOf(SUP));
  const p0 = prof(SUP);
  const r = await pw(SUP);
  ok('7 SUPPORTAL: a supplier on the portal → 403 "supplier account — sign in at bids.grayco-cs.com with this same e-mail and password" (+ supplier flag)', p0 && p0.role === 'supplier' && r.st === 403 && r.b.supplier === true && /supplier account/.test(r.b.error) && /bids\.grayco-cs\.com/.test(r.b.error) && !/not turned on/.test(r.b.error), { role: p0 && p0.role, r });
  const w = await pw(SUP, 'Wrong-Pass-0000');
  ok('7 … a wrong password: no supplier hint (nothing is told before the password is right)', w.st !== 200 && !w.b.supplier, w);
}

const n = R.length, f = R.filter(x => !x).length;
console.log('\n' + (n - f) + '/' + n + ' passed' + (f ? ' — ' + f + ' FAILED' : ''));
process.exit(f ? 1 : 0);
