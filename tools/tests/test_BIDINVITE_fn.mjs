// test_BIDINVITE_fn.mjs <build-dir> — patch BIDINVITE (owner 11/20) on the REAL subportal.js / bid-hub.js / _lib/pause.js (qaa_world's
// in-memory Supabase; made-up data only; e-mail and texts captured where they would reach Resend / Twilio — nothing leaves the machine).
//   · ⏸ data-entry mode ON the whole time: the CRM's ✉️ Invite subs and the bid site's Invite e-mail each sub AT ONCE ("GrayCo invited
//     you to bid: <project>", the sign-up link with the invite token / the sign-in link), not queued; a customer e-mail stays blocked
//   · the invited sub signs up (link or same e-mail) → approved at once; a self sign-up still waits
//   · 📨 Send sign-up link (one sub, no job): e-mail + a text from the GrayCo number, in data-entry mode; the link approves on sign-up;
//     STOP is honoured; staff only; every send logged on the invite row
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, TOK, ACC, putRow, rowData, rowsOf } = W;
const BUILD = path.resolve(process.argv[2] || '.'), FN = path.join(BUILD, 'netlify/functions');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
W.install();
const MAIL = [], SMS = []; const f0 = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.indexOf('api.resend.com') > -1) { MAIL.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'm' + MAIL.length }), text: async () => '{}' }; }
  if (u.indexOf('api.twilio.com') > -1) { const p = {}; new URLSearchParams(String(init.body)).forEach((v, k) => { p[k] = v; }); SMS.push(p); return { ok: true, status: 201, headers: { get: () => null }, json: async () => ({ sid: 'SM' + SMS.length, status: 'queued' }), text: async () => '{}' }; }
  return f0(url, init);
};
Object.assign(process.env, { RESEND_API_KEY: 'test-mail-key', CUST_QUIET_OFF: '1', TWILIO_ACCOUNT_SID: 'AC_test_sid', TWILIO_AUTH_TOKEN: 'test-twilio-token', TWILIO_FROM: '+19015550100' }); delete process.env.PORTAL_MAIL_OFF;
const F = W.fns(BUILD);
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []); W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }]);
W.H.cset('gc_automation_pause', { on: true, why: 'data entry (test)' });   /* ⏸ data-entry mode ON */
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_owner', email: 'owner@grayco-cs.com' });
putRow('users', 'u_have', { id: 'u_have', role: 'sub', approved: true, email: 'have@sub.test', name: 'Hal Have', company: 'Have Paint', authUserId: 'auth-have' }, { user_id: 'u_have', email: 'have@sub.test' });
putRow('jobs', 'J1', { id: 'J1', title: 'Demo Library Repaint', address: '5 Demo Ave', status: 'open', visibility: 'private', draft: false, bidDueDate: DAY(14), tradesSought: 'Painting', createdAt: now }, { job_id: 'J1' });
putRow('jobs', 'J2', { id: 'J2', title: 'Demo Gym Floors', status: 'open', visibility: 'private', draft: false, bidDueDate: DAY(14), createdAt: now }, { job_id: 'J2' });
TOK['tk-owner'] = 'owner@grayco-cs.com'; ACC['owner@grayco-cs.com'] = { pw: 'x', id: 'auth-owner' };
const call = async (tok, body) => { const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: tok ? 'Bearer ' + tok : '', 'x-nf-client-connection-ip': '10.7.' + Math.floor(Math.random() * 200) + '.1' }, body: JSON.stringify(body) }); return { code: r.statusCode, b: JSON.parse(r.body) }; };
const BI = require(path.join(FN, 'bid-inbox.js'));
const hub = async (who, body) => { const ra = BI._test.staffAuth; BI._test.staffAuth = async () => Object.assign({ ok: true }, who);
  try { const o = await F.hub.handler({ httpMethod: 'POST', headers: {}, queryStringParameters: {}, body: JSON.stringify(body) }); return { code: o.statusCode, j: JSON.parse(o.body) }; } finally { BI._test.staffAuth = ra; } };
const OWNER = { email: 'owner@grayco-cs.com', name: 'Demo Owner', admin: true, role: 'admin' }, CREW = { email: 'crew@grayco-cs.com', name: 'Crew', admin: false, role: 'staff' };
const to = e => MAIL.filter(m => (m.to || []).includes(e));

/* data-entry mode really is on: a customer e-mail is blocked */
const P = require(path.join(FN, '_lib/pause.js'));
const nc = MAIL.length; await fetch('https://api.resend.com/emails', { method: 'POST', body: JSON.stringify({ to: ['homeowner@example.test'], subject: 'Your invoice', html: 'x' }) });
ok('0 ⏸ data-entry mode is ON: a customer e-mail is still blocked', MAIL.length === nc && await P.isPaused());

/* ═══ the CRM's ✉️ Invite subs (bid-hub op invite) ═══ */
let r = await hub(OWNER, { op: 'invite', jobId: 'J1', emails: ['new@sub.test'] });
const m1 = to('new@sub.test')[0] || {}, inv1 = rowsOf('invites').find(x => x.email === 'new@sub.test') || { data: {} };
ok('1 CRM ✉️ Invite subs in data-entry mode → the e-mail goes at once: "GrayCo invited you to bid: Demo Library Repaint"', r.code === 200 && r.j.mailed === 1 && m1.subject === 'GrayCo invited you to bid: Demo Library Repaint', { r: r.j, s: m1.subject });
ok('2 …with the bid-site sign-up link carrying the invite token; the invite row is stamped e-mailed', /https:\/\/bids\.grayco-cs\.com\/\?invite=[a-f0-9]{32}&amp;job=J1/.test(m1.html || '') && (m1.html || '').indexOf(inv1.data.token) > -1 && !!inv1.data.mailedAt, (m1.html || '').slice(0, 200));

/* ═══ the bid site's Invite (subportal invite-send) ═══ */
r = await call('tk-owner', { action: 'invite-send', jobId: 'J2', emails: ['sup@supply.test'], as: 'supplier' });
const m2 = to('sup@supply.test')[0] || {};
ok('3 bid site Invite (🧱 supplier) in data-entry mode → e-mailed at once, the supplier sign-up link (&as=supplier)', r.code === 200 && r.b.mailed === 1 && m2.subject === 'GrayCo invited you to bid: Demo Gym Floors' && /&amp;as=supplier/.test(m2.html), r.b);
r = await call('tk-owner', { action: 'invite-send', jobId: 'J2', emails: ['have@sub.test'] });
const m3 = to('have@sub.test')[0] || {};
ok('4 a sub with an account already → the sign-in link (no token)', r.b.mailed === 1 && !/invite=/.test(m3.html || '') && /Sign in/.test(m3.html || ''));

/* SIGNUPVERIFY (owner 11/23: "Yes subs should confirm their email"): a held sign-up confirms its e-mail first — the test plays the
   mailbox (a known code's SHA-256 is put on the in-memory profile, then the real signup-confirm runs) */
const svConfirm = async (email) => { const C = require('crypto'), row = rowsOf('users').find(x => x.email === email), tok = C.randomBytes(32).toString('base64url');
  row.data.emailVerify = { hash: C.createHash('sha256').update(tok).digest('hex'), exp: new Date(Date.now() + 864e5).toISOString() }; return call('', { action: 'signup-confirm', token: tok }); };
/* ═══ sign-up: invited → approved ═══ */
r = await call('', { action: 'register', email: 'new@sub.test', password: 'Sub-Pass-111', profile: { name: 'Nina New', company: 'Newco Paint', acctType: 'sub' } });
const c5 = await svConfirm('new@sub.test');   /* SIGNUPVERIFY: an e-mail-only invite confirms first */
let u = (rowsOf('users').find(x => x.email === 'new@sub.test') || {}).data || {};
ok('5 the invited sub signs up (same e-mail, without the link) → once the e-mail is confirmed (SIGNUPVERIFY): approved, linked to the job', r.b.verify === true && c5.b.approved === true && u.approved === true && u.invitedJobId === 'J1' && u.approvedAuto === 'invited', u);
r = await call('', { action: 'register', email: 'sup@supply.test', password: 'Sup-Pass-222', invite: rowsOf('invites').find(x => x.email === 'sup@supply.test').data.token, job: 'J2', profile: { name: 'Sue Supply', company: 'Supply Co', acctType: 'supplier' } });
ok('6 …with the link (token) → approved', r.b.approved === true);
r = await call('', { action: 'register', email: 'self@sub.test', password: 'Sub-Pass-333', profile: { name: 'Sam Self', company: 'Selfco', acctType: 'sub' } });
ok('7 a sub who signs up on their own still waits for an admin', r.b.approved === false);

/* ═══ 📨 Send sign-up link (one sub, no job) ═══ */
r = await hub(OWNER, { op: 'signuplink', name: 'Lee Link', email: 'lee@sub.test', phone: '(901) 555-0142', via: ['email', 'sms'] });
const m4 = to('lee@sub.test')[0] || {}, t4 = SMS.find(x => /5550142/.test(x.To)) || {}, inv4 = rowsOf('invites').find(x => x.email === 'lee@sub.test') || { data: {} };
ok('8 📨 Send sign-up link in data-entry mode: the e-mail AND the text from the GrayCo number go', r.code === 200 && r.j.mailed === true && r.j.texted === true && /sign-up link/i.test(m4.subject || '') && /bids\.grayco-cs\.com\/\?invite=/.test(t4.Body || '') && /STOP/.test(t4.Body || ''), { j: r.j, s: m4.subject, t: t4 });
ok('9 the invite row: job "signup", the token in both links, every send logged (mailedAt, textedAt, sends)', inv4.job_id === 'signup' && (t4.Body || '').indexOf(inv4.data.token) > -1 && (m4.html || '').indexOf(inv4.data.token) > -1 && inv4.data.mailedAt && inv4.data.textedAt && inv4.data.sends.length === 1, inv4.data);
r = await call('', { action: 'invite-info', invite: inv4.data.token, job: 'signup' });
ok('10 the link opens the sign-up ("the GrayCo bid site")', r.b.ok === true && /GrayCo bid site/.test(r.b.jobTitle) && r.b.email === 'lee@sub.test', r.b);
r = await call('', { action: 'register', email: 'lee.other@sub.test', password: 'Sub-Pass-444', invite: inv4.data.token, job: 'signup', profile: { name: 'Other Person', company: 'Other Coatings', acctType: 'sub' } });
ok('11 …a different e-mail on the link is not approved by it (the link names the e-mail)', r.b.approved === false);
r = await call('', { action: 'register', email: 'lee@sub.test', password: 'Sub-Pass-555', invite: inv4.data.token, job: 'signup', profile: { name: 'Lee Link', company: 'Link Drywall', acctType: 'sub' } });
u = (rowsOf('users').find(x => x.email === 'lee@sub.test') || {}).data || {};
ok('12 signing up from the link → approved (no job attached)', r.b.approved === true && u.approvedAuto === 'signup-link' && !u.invitedJobId, u);
r = await hub(OWNER, { op: 'signuplink', name: 'Text Only', phone: '901-555-0177', via: ['sms'] });
ok('13 a text-only link (no e-mail yet) works too', r.j.texted === true && !r.j.mailed && rowsOf('invites').some(x => x.email === 'sms:9015550177'), r.j);
r = await hub(OWNER, { op: 'signuplink', email: 'have@sub.test', via: ['email'] });
ok('14 an e-mail that already has an account: nothing sent, says so', r.j.already === true && to('have@sub.test').length === 1, r.j);
r = await hub(CREW, { op: 'signuplink', email: 'x@sub.test', via: ['email'] });
ok('15 staff without invite rights (not admin / estimator / office) → refused (403)', r.code === 403);
r = await hub(OWNER, { op: 'signuplink', email: 'bad', via: ['email'] });
ok('16 a bad e-mail → 400', r.code === 400);
/* a text: the pause lets ONLY the trade-tagged one through */
const CQ = require(path.join(FN, '_lib/custquiet.js')), n0 = SMS.length;
await fetch('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json', { method: 'POST', body: 'To=%2B19015550199&Body=customer+text' });
ok('17 an untagged text (a customer send) is still blocked in data-entry mode', SMS.length === n0);
const fails = R.filter(x => !x).length;
console.log(fails ? 'FAILED ' + fails + ' of ' + R.length : 'ALL ' + R.length + ' PASS');
process.exit(fails ? 1 : 0);
