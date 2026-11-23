/* patch AWAY — server tests: node tools/tests/test_AWAY_fn.mjs (made-up people and jobs, nothing leaves the machine).
   · each approval type → a phone push to the right person (queue admin step → both admins, PM step → the PM, sub invoice /
     expense → the job's PM, payroll run / Form 941 / a CRM-only To-Do approval → the admins), with a deep link to that one
   · the push really leaves in ⏸ data-entry mode (tagged staff); an untagged (customer) push stays paused
   · bundling (one push for what came together, 10-minute gap), quiet hours 9 PM–6 AM, the first run takes note only
   · no phone → a staff text, no text → a staff e-mail
   · 🏖 Away: the away admin gets nothing (pings, digest, escalation push, staff e-mail); "any admin" items unchanged for the
     other admin (no note); what waited on the away admin alone → the cover, marked; ends by itself after the end date; no end
     date = until turned off; the optional summary is OFF by default
   · the Gmail auto-reply: on with Away (the words per admin), off when turned off, "Reconnect Google" without the scope
   · the second admin approves an owner-only approval; the office cannot; the audit keeps who / when / device
   · 📊 Approvals this week: handled (person, device, waited), waiting, stuck 24 h+ */
import { createRequire } from 'module';
import assert from 'assert';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-key-test';
process.env.CRM_URL = 'https://crm.test';
process.env.RESEND_API_KEY = 're_test';
process.env.GOOGLE_CLIENT_ID = 'gid'; process.env.GOOGLE_CLIENT_SECRET = 'gsec';
delete process.env.PORTAL_MAIL_OFF; delete process.env.APPR_PING_OFF; delete process.env.OWNER_EMAILS; delete process.env.CUST_QUIET_OFF;
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let srv; do { srv = crypto.createECDH('prime256v1'); srv.generateKeys(); } while (srv.getPrivateKey().length !== 32);
process.env.VAPID_PUBLIC_KEY = b64u(srv.getPublicKey()); process.env.VAPID_PRIVATE_KEY = b64u(srv.getPrivateKey());

let pass = 0, fail = 0;
async function t(name, fn){ try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e); } }

/* ── people (made up) and a phone per person ── */
const DOM = '@grayco-cs.com';
const W = 'wes.admin' + DOM, N = 'nick.admin' + DOM, O = 'office' + DOM, P = 'pat.pm' + DOM;
const USERS = [{ id: 'U2', name: 'Wes Admin', email: W, role: 'Admin', payType: 'owner', active: true }, { id: 'U1', name: 'Nick Admin', email: N, role: 'Admin', payType: 'owner', active: true },
  { id: 'UO', name: 'Bree Office', email: O, role: 'Office Admin', active: true }, { id: 'UP', name: 'Pat Mason', email: P, role: 'Project Manager', active: true },
  { id: 'US', name: 'Sam Super', email: 'sam.super' + DOM, role: 'Superintendent', active: true }, { id: 'UT', name: 'Tom Tech', email: 'tom.tech' + DOM, role: 'Technician', payType: 'hourly', active: true },
  { id: 'UM', name: 'Mo Manager', email: 'mo.mgr' + DOM, role: 'Operations Manager', active: true }, { id: 'UL', name: 'Lee Laborer', email: 'lee.lab' + DOM, role: 'Laborer', payType: 'hourly', active: true, manager: 'Mo Manager' }];
const MGR = 'mo.mgr' + DOM, LAB = 'lee.lab' + DOM;
const SUP = 'sam.super' + DOM, TECH = 'tom.tech' + DOM;
const PHONES = {};
function phone(email){ let c; do { c = crypto.createECDH('prime256v1'); c.generateKeys(); } while (c.getPublicKey().length !== 65); const auth = crypto.randomBytes(16); PHONES[email] = { c, auth, endpoint: 'https://web.push.apple.com/QA' + email.split('@')[0] + crypto.randomBytes(3).toString('hex') }; return { endpoint: PHONES[email].endpoint, keys: { p256dh: b64u(c.getPublicKey()), auth: b64u(auth) } }; }
function decrypt(email, body){
  const ph = PHONES[email], buf = Buffer.from(body), salt = buf.subarray(0, 16), idlen = buf[20], asPub = buf.subarray(21, 21 + idlen), ct = buf.subarray(21 + idlen);
  const secret = ph.c.computeSecret(asPub), ua = ph.c.getPublicKey();
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, ph.auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)), nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return JSON.parse(pt.subarray(0, pt.lastIndexOf(2)).toString());
}

/* ── a tiny Supabase + the outside services ── */
const KV = {}, SENT = { push: [], mail: [], google: [], other: [] };
let TICK = 0;
const kput = (k, v) => { KV[k] = { value: v, updated_at: new Date().toISOString() + '#' + (++TICK) }; };
const kget = k => { const v = KV[k] && KV[k].value; return typeof v === 'string' ? JSON.parse(v) : v; };
const res = (status, body, hdr) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => (hdr || {})[String(k).toLowerCase()] || null }, json: async () => body, text: async () => JSON.stringify(body), clone(){ return this; } });
const inList = v => String(v || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
let GOOGLE_STATUS = 200;
globalThis.fetch = async (url, init) => {
  init = init || {}; const u = new URL(String(url)), q = u.searchParams, m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname === '/rest/v1/gc_kv') {
      if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => kput(r.key, r.value)); return res(201, null); }
      const kq = q.get('key') || '';
      const keys = kq.startsWith('in.') ? inList(kq) : kq.startsWith('eq.') ? [decodeURIComponent(kq.slice(3))] : kq.startsWith('like.') ? Object.keys(KV).filter(k => k.startsWith(decodeURIComponent(kq.slice(5)).replace(/\*$/, ''))) : [];
      return res(200, keys.filter(k => KV[k]).map(k => ({ key: k, value: KV[k].value, updated_at: KV[k].updated_at })));
    }
    if (u.pathname === '/rest/v1/gc_staff') return res(200, USERS.map(x => ({ email: x.email, name: x.name, role: x.role === 'Admin' ? 'admin' : /Office/.test(x.role) ? 'office' : 'staff', active: true })));
    return res(200, []);
  }
  if (/push\.apple\.com$/.test(u.host)) { const email = Object.keys(PHONES).find(e => PHONES[e].endpoint === String(url)); SENT.push.push({ email, msg: email ? decrypt(email, init.body) : null }); return res(201, {}); }
  if (u.host === 'api.resend.com') { SENT.mail.push(JSON.parse(init.body)); return res(200, { id: 'm' + SENT.mail.length }); }
  if (u.host === 'oauth2.googleapis.com') return res(200, { access_token: 'ya29.test', expires_in: 3600, scope: 'https://www.googleapis.com/auth/gmail.settings.basic' });
  if (u.host === 'www.googleapis.com') { SENT.google.push({ url: String(url), method: m, body: JSON.parse(init.body || '{}') }); return res(GOOGLE_STATUS, {}); }
  SENT.other.push(String(url)); return res(404, {});
};
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const at = (d, hm) => Date.parse(d + 'T' + hm + ':00-06:00');   /* November: Central = UTC−6 */
const iso = ms => new Date(ms).toISOString();
const JOB = { id: 'PJ1', name: 'QA Maple Deck', address: '77 Maple Ct', pm: 'Pat Mason', status: 'Active' }, WJOB = { id: 'PJ2', name: 'QA Owner Job', pm: 'Wes Admin', status: 'Active' };
const lists = (k, v) => kput(k, JSON.stringify(v));
Object.keys(KV).forEach(k => delete KV[k]);
const CJOB = { id: 'PJ3', name: 'QA Clinic TI', type: 'Commercial TI', pm: 'Pat Mason', superintendent: 'Sam Super', status: 'Active' };
kput('users', USERS); kput('projects', [JOB, WJOB, CJOB]);
kput('gc_automation_pause', { on: true, by: N });   /* ⏸ data-entry mode ON for every test */
['gc_approval_queue', 'gc_sub_approvals', 'gc_expense_approvals', 'payrollRuns', 'gc_payroll_approvals', 'gc_away', 'gc_appr_audit', 'gc_office_tasks', 'gc_appr_notices'].forEach(k => lists(k, []));
require(path.join(FN, '_lib/pause.js')).install();
const portal = require(path.join(FN, 'portal.js')), C = portal._core;
const PG = require(path.join(FN, '_lib/apprping.js')), AW = require(path.join(FN, '_lib/away.js')), SP = require(path.join(FN, '_lib/staffpush.js')), VAC = require(path.join(FN, '_lib/vacation.js'));
const AWAY = require(path.join(FN, 'appr-away.js'));
const who = e => { const u = USERS.find(x => x.email === e); return { ok: true, email: e, name: u.name, role: u.role === 'Admin' ? 'admin' : /Office/.test(u.role) ? 'office' : 'staff', admin: u.role === 'Admin' }; };
const act = (e, body) => AWAY._act(body, who(e));
const TEXTS = [];
let TEXT_OK = true, NOW = at(TODAY, '10:00');
PG.D.text = async (email, text, link) => { TEXTS.push({ email, text, link }); return { sent: TEXT_OK ? 1 : 0 }; };
PG.D.now = () => NOW;
const SQ = require(path.join(FN, '_lib/staffquiet.js')); SQ.D.now = () => NOW;   /* QUIET: the staff quiet window follows the test clock */
const reset = () => { SENT.push.length = 0; SENT.mail.length = 0; SENT.google.length = 0; TEXTS.length = 0; try { C._reset(); } catch (e) {} AW.reset(); SP._reset(); SQ._reset(); };
const qItem = (id, o) => Object.assign({ id, kind: 'final_invoice', title: 'QA invoice ' + id, jobId: JOB.id, jobName: JOB.name, pm: 'Pat Mason', pmEmail: P, to: 'cust@example.test', steps: ['pm', 'admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: iso(NOW - 3600e3), updatedAt: iso(NOW - 3600e3), adminSince: iso(NOW - 3600e3), meta: {} }, o || {});
const pushesTo = e => SENT.push.filter(x => x.email === e);
const GT = (list) => () => ({ list: async () => list, get: async () => null, set: async () => true });

console.log('phones: subscribe (staff only, never the address back)');
await t('each person saves their phone; the state shows "on" for that phone and the push key, never the endpoint', async () => {
  reset();
  for (const e of [W, N, P]) { const r = await act(e, { op: 'subscribe', sub: phone(e), device: 'phone', ua: 'iPhone' }); assert.strictEqual(r.out.ok, true, JSON.stringify(r.out)); }
  const st = await act(W, { op: 'state', endpoint: PHONES[W].endpoint });
  assert.strictEqual(st.out.push.on, true); assert.strictEqual(st.out.push.ready, true); assert.strictEqual(st.out.push.devices, 1); assert.ok(st.out.push.key.length > 60);
  assert.ok(!JSON.stringify(st.out).includes(PHONES[W].endpoint));
  const bad = await act(W, { op: 'subscribe', sub: { endpoint: 'https://evil.test/x', keys: { p256dh: 'x', auth: 'y' } } });
  assert.strictEqual(bad.out.ok, false);
});

console.log('the 5-minute pings — every approval type to the right phone');
await t('the first run only takes note of what is already waiting (no flood of old items)', async () => {
  reset(); lists('gc_approval_queue', [qItem('OLD1')]);
  const r = await PG.run({ force: true });
  assert.strictEqual(r.first, true); assert.strictEqual(SENT.push.length, 0);
});
await t('a new admin-step customer invoice → BOTH admins (push, in data-entry mode), deep link to that one, no away words', async () => {
  reset(); NOW += 6 * 60e3; lists('gc_approval_queue', [qItem('OLD1'), qItem('Q1', { title: 'QA final invoice — Maple' })]);
  const r = await PG.run({});
  assert.strictEqual(pushesTo(W).length, 1); assert.strictEqual(pushesTo(N).length, 1); assert.strictEqual(pushesTo(P).length, 0);
  const m = pushesTo(W)[0].msg; assert.match(m.title, /Approval waiting/); assert.match(m.body, /QA final invoice — Maple/);
  assert.strictEqual(m.url, 'https://crm.test/#appr=Q1'); assert.strictEqual(m.tag, 'gc-appr');
  assert.ok(!/away/i.test(m.title));
  assert.ok(r.sent.filter(x => x.email === W || x.email === N).every(x => x.how === 'push'), JSON.stringify(r.sent));
  assert.ok(r.sent.some(x => x.email === O), 'the office: a customer invoice is her kind too (APOFFICE4)');
});
await t('a PM-step item → the PM only; sub invoice and expense → the job\'s PM; payroll run, Form 941, a To-Do approval → the admins', async () => {
  reset(); NOW += 11 * 60e3;
  lists('gc_approval_queue', [qItem('OLD1'), qItem('Q1'), qItem('Q2', { kind: 'thank_you', steps: ['pm'], step: 'pm', title: 'QA thank-you' })]);
  lists('gc_sub_approvals', [{ id: 'SA1', invId: 'SI1', status: 'pending_pm', pmName: 'Pat Mason', sub: 'QA Framing', amt: 1200, pid: JOB.id, createdAt: iso(NOW) }]);
  lists('gc_expense_approvals', [{ id: 'expId:EX1', expId: 'EX1', jobId: JOB.id, pm: 'Pat Mason', amount: 77.5, payee: 'QA Lumber', status: 'pending_pm', enteredAt: iso(NOW) }]);
  lists('payrollRuns', [{ id: 'RUN1', status: 'pending', payDate: TODAY, lines: [{ status: 'pending' }], totals: { net: 900 }, createdAt: iso(NOW) }]);
  lists('gc_payroll_approvals', [{ id: 'f941_2026_Q3', kind: 'f941', year: 2026, q: 3, status: 'waiting', due: '2026-11-30', createdAt: iso(NOW) }]);
  kput('gc_appr_feed', { [N]: { at: iso(NOW), items: [{ key: 'td:co:CO7', title: 'QA change order CO7 — approve', kind: 'Change order' }, { key: 'ap2:Q1', title: 'dup' }] } });
  await PG.run({});
  const pm = pushesTo(P); assert.strictEqual(pm.length, 1); assert.strictEqual(pm[0].msg.count, 3); assert.strictEqual(pm[0].msg.url, 'https://crm.test/#apx=mine');
  assert.match(pm[0].msg.body, /QA thank-you/); assert.match(pm[0].msg.body, /Sub invoice/); assert.match(pm[0].msg.body, /Job expense/);
  const w = pushesTo(W); assert.strictEqual(w.length, 1); assert.strictEqual(w[0].msg.count, 3, JSON.stringify(w[0].msg));
  assert.match(w[0].msg.body, /Payroll/); assert.match(w[0].msg.body, /Form 941/); assert.match(w[0].msg.body, /QA change order CO7/);
  assert.strictEqual(pushesTo(N).length, 1);
  assert.ok(!pushesTo(N)[0].msg.body.includes('dup'), 'the server list wins for a key it has');
  assert.ok(!w[0].msg.body.includes('thank-you'), 'a PM step is not the admins\'');
  assert.ok(!pushesTo(O).length);
});
await t('one new item → its own deep link: #apx=sub:… · f941:… · td:… · pay:…', async () => {
  const g = await PG.gather(NOW);
  const k = (e, key) => g.box[e].find(x => x.key === key);
  assert.strictEqual(PG.compose([k(P, 'sub:SA1')], 'https://crm.test').url, 'https://crm.test/#apx=sub%3ASA1');
  assert.strictEqual(PG.compose([k(W, 'f941:f941_2026_Q3')], 'https://crm.test').url, 'https://crm.test/#apx=f941%3Af941_2026_Q3');
  assert.strictEqual(PG.compose([k(N, 'td:co:CO7')], 'https://crm.test').url, 'https://crm.test/#apx=td%3Aco%3ACO7');
  assert.strictEqual(PG.compose([k(W, 'pay:RUN1')], 'https://crm.test').url, 'https://crm.test/#apx=pay%3ARUN1');
  assert.strictEqual(PG.compose([k(P, 'exp:EX1')], 'https://crm.test').url, 'https://crm.test/#apx=exp%3AEX1');
});
await t('bundling: another item 3 minutes later waits (10-minute gap), then goes in ONE push with what else came; nothing twice', async () => {
  reset(); NOW += 3 * 60e3;
  const q = kget('gc_approval_queue'); q.push(qItem('Q3', { title: 'QA lien waiver' })); lists('gc_approval_queue', q);
  let r = await PG.run({}); assert.strictEqual(SENT.push.length, 0); assert.ok(r.held.some(h => h.email === W && h.why === 'bundling'));
  NOW += 2 * 60e3; q.push(qItem('Q4', { title: 'QA pay app' })); lists('gc_approval_queue', q);
  r = await PG.run({}); assert.strictEqual(SENT.push.length, 0);
  NOW += 7 * 60e3; r = await PG.run({});
  assert.strictEqual(pushesTo(W).length, 1); assert.strictEqual(pushesTo(W)[0].msg.count, 2); assert.match(pushesTo(W)[0].msg.title, /2 new approvals/);
  NOW += 6 * 60e3; reset(); r = await PG.run({ force: true }); assert.strictEqual(SENT.push.length, 0);
});
console.log('🌙 quiet hours (owner: 9 PM – 7 AM only call-outs and emergencies; all else waits until 7 AM)');
await t('QUIETSAT + QUIETSUN: all of Saturday and Sunday are quiet (Central); Friday 8 PM and Monday 7 AM are not; an admin can turn either day off', async () => {
  const set = SQ.DEF, P = function(iso){ return SQ.quiet(Date.parse(iso), set); };
  assert.strictEqual(P('2026-11-28T18:00:00Z'), true, 'Sat noon'); assert.strictEqual(P('2026-11-29T18:00:00Z'), true, 'Sun noon');
  assert.strictEqual(P('2026-11-28T02:00:00Z'), false, 'Fri 8 PM'); assert.strictEqual(P('2026-11-30T13:00:00Z'), false, 'Mon 7 AM'); assert.strictEqual(P('2026-11-30T12:59:00Z'), true, 'Mon 6:59 AM');
  assert.strictEqual(SQ.quiet(Date.parse('2026-11-29T18:00:00Z'), SQ.clean({ sun: false })), false, 'Sunday switched off');
  assert.strictEqual(SQ.quiet(Date.parse('2026-11-28T18:00:00Z'), SQ.clean({ sat: false })), false, 'Saturday switched off');
  assert.strictEqual(SQ.emergency({ title: '🚨 Water loss' }), true, 'an emergency still goes');
});
await t('the default is 9 PM → 7 AM Central, an admin setting (admins only); 8:59 PM not quiet, 9:00 PM quiet, 6:59 AM quiet, 7:00 AM not', async () => {
  reset(); const st = await act(N, { op: 'state' }); assert.deepStrictEqual([st.out.quiet.on, st.out.quiet.from, st.out.quiet.to], [true, 21, 7]);
  const set = SQ.DEF;
  assert.strictEqual(SQ.quiet(at(TODAY, '20:59'), set), false); assert.strictEqual(SQ.quiet(at(TODAY, '21:00'), set), true);
  assert.strictEqual(SQ.quiet(at(addDays(TODAY, 1), '06:59'), set), true); assert.strictEqual(SQ.quiet(at(addDays(TODAY, 1), '07:00'), set), false);
  assert.strictEqual((await act(P, { op: 'quiet', from: 22, to: 6 })).status, 403);
  const r = await act(N, { op: 'quiet', from: 22, to: 6 }); assert.strictEqual(r.out.ok, true); assert.deepStrictEqual([r.out.quiet.from, r.out.quiet.to], [22, 6]);
  SQ._reset(); assert.strictEqual(await SQ.isQuiet(at(TODAY, '21:30')), false, 'the admin setting is used');
  await act(N, { op: 'quiet', from: 21, to: 7 }); SQ._reset();
});
await t('an approval at 10 PM is held — even one marked urgent — and nothing reaches a phone before 7:00 AM', async () => {
  reset(); NOW = at(TODAY, '22:00');
  const q = kget('gc_approval_queue'); q.push(qItem('Q5', { title: 'QA 10 PM invoice' })); q.push(qItem('Q6', { title: 'QA urgent invoice', priority: 'urgent' })); lists('gc_approval_queue', q);
  let r = await PG.run({}); assert.strictEqual(SENT.push.length + TEXTS.length + SENT.mail.length, 0); assert.ok(r.held.some(h => h.email === W && h.why === 'quiet hours'));
  NOW = at(addDays(TODAY, 1), '03:00'); r = await PG.run({ force: true }); assert.strictEqual(SENT.push.length, 0);
  NOW = at(addDays(TODAY, 1), '06:55'); r = await PG.run({ force: true }); assert.strictEqual(SENT.push.length, 0, 'not at 6 AM any more');
});
await t('an emergency at 2 AM goes at once (a 🚨 emergency lead / on-call call-out push, an emergency text) — the rest is held', async () => {
  reset(); NOW = at(addDays(TODAY, 1), '02:00');
  const e1 = await SP.send([N], { title: '🚨 Emergency: water in the basement — 12 Elm', body: 'Call now', url: 'https://crm.test/#leads' }); assert.strictEqual(e1.sent, 1);
  const c = SP.compat(); await c.sendNotification({ endpoint: PHONES[W].endpoint, keys: { p256dh: b64u(PHONES[W].c.getPublicKey()), auth: b64u(PHONES[W].auth) } }, JSON.stringify({ title: '🚨 On call: QA leak', link: 'https://crm.test/#leads' }));
  assert.ok(pushesTo(N).some(x => /Emergency/.test(x.msg.title)) && pushesTo(W).some(x => /On call/.test(x.msg.title)), 'both emergencies delivered at 2 AM');
  const n0 = SENT.push.length;
  const h1 = await C.pushTo([W, N], { title: 'QA escalated after 24h', body: 'x', tag: 'appr-esc-1' });   /* the 24-hour escalation */
  const h2 = await require(path.join(FN, '_lib/auto-common.js')).staffMail([N], 'QA weekly scorecard', '<p>QA scorecard body</p>');
  const h3 = await SP.send([N], { title: 'New lead: QA kitchen remodel', body: 'x' });
  assert.strictEqual(SENT.push.length, n0, 'nothing else reached a phone'); assert.strictEqual(SENT.mail.length, 0); assert.ok(h2.held && h3.held);
  const held = kget(SQ.HELD); assert.ok(held.filter(x => x.email === N).length >= 3, JSON.stringify(held.map(x => [x.email, x.title])));
});
await t('7:00 AM: ONE bundled notification per person — the held approvals + everything else held overnight; the held e-mail in one e-mail', async () => {
  reset(); NOW = at(addDays(TODAY, 1), '07:00');
  const r = await PG.run({});
  const w = pushesTo(W), n = pushesTo(N);
  assert.strictEqual(w.length, 1, JSON.stringify(w.map(x => x.msg))); assert.strictEqual(n.length, 1, JSON.stringify(n.map(x => x.msg)));
  assert.match(w[0].msg.title, /🌙 \d+ waiting from overnight/); assert.match(w[0].msg.body, /QA 10 PM invoice/); assert.match(w[0].msg.body, /QA escalated after 24h/);
  assert.ok(n[0].msg.count >= 4, String(n[0].msg.count)); assert.match(n[0].msg.body, /QA 10 PM invoice|QA escalated|New lead|QA weekly/);
  assert.strictEqual(n[0].msg.url, 'https://crm.test/#apx=mine');
  const m = SENT.mail.filter(x => x.to.includes(N)); assert.strictEqual(m.length, 1); assert.match(m[0].html, /QA scorecard body/);
  assert.strictEqual(kget(SQ.HELD).length, 0, 'nothing left held');
  reset(); NOW += 6 * 60e3; await PG.run({ force: true }); assert.strictEqual(SENT.push.length, 0, 'nothing twice');
  NOW = at(TODAY, '13:00');
});
await t('no phone saved → one staff text; no text → a staff e-mail (@grayco-cs.com, passes data-entry mode)', async () => {
  reset(); await act(P, { op: 'unsubscribe', endpoint: PHONES[P].endpoint }); NOW += 15 * 60e3;
  lists('gc_sub_approvals', kget('gc_sub_approvals').concat([{ id: 'SA2', status: 'pending_pm', pmName: 'Pat Mason', sub: 'QA Roofing', amt: 500, createdAt: iso(NOW) }]));
  await PG.run({}); assert.strictEqual(TEXTS.length, 1); assert.strictEqual(TEXTS[0].email, P); assert.match(TEXTS[0].link, /#apx=sub%3ASA2$/); assert.strictEqual(SENT.mail.length, 0);
  reset(); TEXT_OK = false; NOW += 15 * 60e3;
  lists('gc_sub_approvals', kget('gc_sub_approvals').concat([{ id: 'SA3', status: 'pending_pm', pmName: 'Pat Mason', sub: 'QA Gutters', amt: 300, createdAt: iso(NOW) }]));
  await PG.run({}); assert.strictEqual(SENT.mail.length, 1); assert.deepStrictEqual(SENT.mail[0].to, [P]); assert.match(SENT.mail[0].html, /#apx=sub%3ASA3/);
  TEXT_OK = true; await act(P, { op: 'subscribe', sub: phone(P), device: 'phone' });
});
await t('data-entry mode: a staff push leaves (tagged staff); an untagged push (the customer app) stays paused', async () => {
  const r = await fetch('https://web.push.apple.com/QAcustomer', { method: 'POST', body: 'x' });
  assert.strictEqual(r.status, 503); assert.ok(r.headers.get('x-gc-paused'));
  reset(); const s = await SP.send([W], { title: 'QA', body: 'x', url: 'https://crm.test/#apx=mine' }); assert.strictEqual(s.sent, 1); assert.strictEqual(pushesTo(W).length, 1);
  reset(); const c = SP.compat(); await c.sendNotification({ endpoint: PHONES[N].endpoint, keys: { p256dh: b64u(PHONES[N].c.getPublicKey()), auth: b64u(PHONES[N].auth) } }, JSON.stringify({ title: 'QA compat', link: 'https://crm.test/#leads' }));
  assert.strictEqual(pushesTo(N)[0].msg.url, 'https://crm.test/#leads', 'the older callers (web-push look-alike) work too');
});

console.log('🏖 Away (no notifications; any-admin approvals unchanged; only what waited on that admin alone → the cover)');
await t('only admins set Away; the cover must be an admin; no end date is fine; never a carrier in the auto-reply', async () => {
  assert.strictEqual((await act(O, { op: 'set', from: TODAY })).status, 403);
  assert.match((await act(W, { op: 'set', from: TODAY, cover: P })).out.error, /admin/);
  assert.match((await act(W, { op: 'set', from: TODAY, to: addDays(TODAY, -1) })).out.error, /before|over/);
  assert.match((await act(W, { op: 'set', from: TODAY, replyText: 'Call our insurance carrier' })).out.error, /carrier/);
  assert.strictEqual(AW.check({ email: W, from: TODAY, to: '', cover: N }, [W, N], NOW), '');
});
await t('away today → tomorrow, the other admin covers → summary OFF by default; the Gmail auto-reply is on (office@ + the other admin)', async () => {
  reset(); VAC.D.gtok = GT([{ user: 'Wes Admin', value: { email: W, refresh_token: 'r1', scope: 'https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/gmail.settings.basic' } }, { user: 'Nick Admin', value: { email: N, refresh_token: 'r2', scope: VAC.SCOPE } }]);
  const r = await act(W, { op: 'set', from: TODAY, to: addDays(TODAY, 1), cover: N });
  assert.strictEqual(r.out.ok, true, JSON.stringify(r.out)); assert.strictEqual(r.out.away.summary, false); assert.strictEqual(r.out.vacation.ok, true);
  assert.match(r.out.away.sentence, /^Wes is away until .* — Nick is covering$/);
  const g = SENT.google[0]; assert.strictEqual(g.method, 'PUT'); assert.strictEqual(g.url, 'https://www.googleapis.com/gmail/v1/users/me/settings/vacation');
  assert.strictEqual(g.body.enableAutoReply, true); assert.strictEqual(g.body.restrictToContacts, false); assert.strictEqual(g.body.restrictToDomain, false);
  assert.match(g.body.responseBodyPlainText, /^Thanks for your e-mail\. I'm away from the office until /);
  assert.ok(g.body.responseBodyPlainText.endsWith('please contact our office at office@grayco-cs.com or Nick Admin at ' + N + '.'));
  assert.ok(!/insurance|carrier|portal/i.test(g.body.responseBodyPlainText));
  assert.strictEqual(+g.body.endTime - +g.body.startTime, 2 * 864e5, 'first day 00:00 → the day after the last day 00:00 (Central)');
  assert.ok(AW.activeMap(await AW.load(true), NOW)[W]);
});
await t('while away: NO ping to the away admin; the other admin gets the any-admin items with no note; the away admin\'s own job → the cover, marked', async () => {
  reset(); NOW += 15 * 60e3;
  const q = kget('gc_approval_queue'); q.push(qItem('Q8', { title: 'QA admin-step invoice' })); q.push(qItem('Q9', { kind: 'thank_you', jobId: WJOB.id, jobName: WJOB.name, pm: 'Wes Admin', pmEmail: W, steps: ['pm'], step: 'pm', title: 'QA owner-only thank-you' })); lists('gc_approval_queue', q);
  await PG.run({});
  assert.strictEqual(pushesTo(W).length, 0, 'the away admin is silent');
  const n = pushesTo(N); assert.strictEqual(n.length, 1); assert.strictEqual(n[0].msg.count, 2);
  assert.match(n[0].msg.title, /Wes is away — you are covering/);
  const g = await PG.gather(NOW); const inv = g.box[N].find(x => x.key === 'ap2:Q8'), wo = g.box[N].find(x => x.key === 'ap2:Q9');
  assert.ok(inv && !inv.coverFor, 'any-admin: no note'); assert.ok(wo && wo.coverFor === 'Wes Admin', 'only-his: marked');
  const st = await act(N, { op: 'state' }); assert.deepStrictEqual(st.out.covered, { 'ap2:Q9': 'Wes Admin' });
  assert.ok(!g.box[W]);
});
await t('while away: the 7 AM digest, the 24-hour escalation push and the automatic staff e-mails skip the away admin', async () => {
  reset(); const D = require(path.join(FN, '_lib/auto-digest.js'));
  const wd = new Date(TODAY + 'T12:00:00Z').getUTCDay(), dday = wd === 0 ? addDays(TODAY, 1) : TODAY;   /* the digest skips Sundays */
  const dr = await D.run({ now: at(dday, '07:05') }); if (!SENT.mail.length) console.log('    digest:', JSON.stringify(dr), JSON.stringify(SENT.other.slice(-5)));
  assert.ok(SENT.mail.length + SENT.push.length >= 1); assert.ok(SENT.mail.every(m => !m.to.includes(W))); assert.strictEqual(pushesTo(W).length, 0);
  reset(); const p = await C.pushTo([W, N], { title: 'QA escalated', body: 'x', tag: 't' }); assert.strictEqual(p.sent, 1); assert.strictEqual(pushesTo(W).length, 0); assert.strictEqual(pushesTo(N).length, 1);
  reset(); const m = await require(path.join(FN, '_lib/auto-common.js')).staffMail([W], 'QA', '<p>x</p>'); assert.ok(m.ok); assert.deepStrictEqual(SENT.mail[0].to, [N]);
});
await t('it ends by itself: the day after "until" the admin gets pings again (no clean-up job)', async () => {
  const day2 = addDays(TODAY, 2); NOW = at(day2, '10:00'); reset();
  assert.deepStrictEqual(AW.activeMap(await AW.load(true), NOW), {});
  const q = kget('gc_approval_queue'); q.push(qItem('Q10', { title: 'QA after away' })); lists('gc_approval_queue', q);
  await PG.run({ force: true }); assert.strictEqual(pushesTo(W).length, 1, 'back');
  NOW = at(TODAY, '15:00');
});
await t('the other admin away with no end date → until turned off; the auto-reply points to office@ + the first admin; "off" clears it', async () => {
  reset(); const r = await act(N, { op: 'set', from: TODAY });
  assert.strictEqual(r.out.ok, true); assert.strictEqual(r.out.away.to, ''); assert.strictEqual(r.out.away.cover, W);
  const txt = SENT.google[0].body.responseBodyPlainText;
  assert.ok(txt.startsWith("Thanks for your e-mail. I'm away from the office right now.")); assert.ok(txt.endsWith('office@grayco-cs.com or Wes Admin at ' + W + '.'));
  assert.ok(!('endTime' in SENT.google[0].body));
  assert.ok(AW.activeMap(await AW.load(true), at(addDays(TODAY, 20), '10:00'))[N], 'still away 20 days later');
  const off = await act(N, { op: 'off' }); assert.strictEqual(off.out.ok, true); assert.strictEqual(SENT.google[1].body.enableAutoReply, false);
  assert.ok(!AW.activeMap(await AW.load(true), NOW)[N]);
});
await t('a Google sign-in without Gmail settings → "Reconnect Google" (Away still turns on); the connect flow asks for it', async () => {
  reset(); VAC.D.gtok = GT([{ user: 'Nick Admin', value: { email: N, refresh_token: 'r2', scope: 'https://www.googleapis.com/auth/calendar.events.readonly' } }]);
  const r = await act(N, { op: 'set', from: TODAY, to: TODAY });
  assert.strictEqual(r.out.ok, true); assert.strictEqual(r.out.vacation.needReconnect, true); assert.match(r.out.vacation.error, /Reconnect Google/); assert.strictEqual(SENT.google.length, 0);
  const st = await act(N, { op: 'state' }); assert.strictEqual(st.out.mine.vacation.needReconnect, true);
  await act(N, { op: 'off' });
  VAC.D.gtok = GT([]); const r2 = await act(N, { op: 'set', from: TODAY, to: TODAY }); assert.strictEqual(r2.out.vacation.needReconnect, true, 'never connected');
  await act(N, { op: 'off' });
  const gs = require('fs').readFileSync(path.join(FN, 'gcal-oauth.js'), 'utf8'); assert.ok(gs.includes('gmail.settings.basic'));
});
await t('the optional summary e-mail (only when ticked) goes once at 6 PM, straight to the away person', async () => {
  reset(); VAC.D.gtok = GT([]); await act(W, { op: 'set', from: TODAY, to: TODAY, cover: N, summary: true });
  NOW = at(TODAY, '18:10'); await PG.run({});
  const sm = SENT.mail.filter(m => /Away summary/.test(m.subject)); assert.strictEqual(sm.length, 1); assert.deepStrictEqual(sm[0].to, [W]);
  reset(); await PG.run({ force: true }); assert.strictEqual(SENT.mail.filter(m => /Away summary/.test(m.subject)).length, 0, 'once a day');
  await act(W, { op: 'off' }); NOW = at(TODAY, '16:00');
});

console.log('the second admin approves owner approvals; the audit');
await t('an owner-only (admin-only) approval: the second admin approves it from the phone; the office is refused', async () => {
  reset(); const q = kget('gc_approval_queue'); q.push(qItem('Q11', { kind: 'refcredit', title: 'QA referral credit', steps: ['admin'], step: 'admin', to: N })); lists('gc_approval_queue', q);
  const off = await C.approvalAction({ op: 'approve', id: 'Q11', device: 'phone' }, who(O)); assert.strictEqual(off.status, 403);
  const r = await C.approvalAction({ op: 'approve', id: 'Q11', device: 'phone' }, who(N));
  assert.notStrictEqual(r.status, 403, JSON.stringify(r.out));
  const it = kget('gc_approval_queue').find(x => x.id === 'Q11'); assert.strictEqual(it.approvals[0].email, N); assert.strictEqual(it.approvals[0].device, 'phone'); assert.strictEqual(it.approvals[0].role, 'admin');
  const a = kget('gc_appr_audit').find(x => x.key === 'ap2:Q11'); assert.ok(a, 'audited'); assert.strictEqual(a.email, N); assert.strictEqual(a.device, 'phone'); assert.strictEqual(a.decision, 'approved'); assert.ok(a.waitedMin >= 60, String(a.waitedMin));
});
await t('a decline from the computer is audited; a CRM-page decision (op audit) takes who from the sign-in, never the page', async () => {
  const r = await C.approvalAction({ op: 'reject', id: 'Q8', device: 'computer', reason: 'QA wrong amount' }, who(W)); assert.strictEqual(r.status, 200);
  const a = kget('gc_appr_audit').find(x => x.key === 'ap2:Q8'); assert.strictEqual(a.decision, 'denied'); assert.strictEqual(a.device, 'computer'); assert.strictEqual(a.email, W);
  PG.D.now = () => Date.now();
  const x = await act(N, { op: 'audit', rec: { key: 'sub:SA1', src: 'sub', title: 'QA sub invoice', decision: 'approved', device: 'phone', email: W, by: 'Someone Else', since: iso(Date.now() - 30 * 3600e3) } });
  assert.strictEqual(x.out.ok, true); assert.strictEqual(x.out.rec.email, N); assert.strictEqual(x.out.rec.by, 'Nick Admin'); assert.strictEqual(x.out.rec.waitedMin, 30 * 60);
  const dup = await act(N, { op: 'audit', rec: { key: 'sub:SA1', src: 'sub', decision: 'approved', device: 'phone' } }); assert.strictEqual(dup.out.dup, true);
  PG.D.now = () => NOW;
});
await t('📊 Approvals this week (admins only): handled with person / device / waited, still waiting, stuck 24 h+', async () => {
  reset(); NOW = Date.now(); PG.D.now = () => NOW;
  const q = kget('gc_approval_queue'); q.push(qItem('Q12', { title: 'QA old stuck item', createdAt: iso(NOW - 30 * 3600e3), adminSince: iso(NOW - 30 * 3600e3) })); lists('gc_approval_queue', q);
  await PG.run({ force: true });
  assert.strictEqual((await act(P, { op: 'week' })).status, 403);
  const w = (await act(N, { op: 'week' })).out;
  assert.ok(w.handled.length >= 3, String(w.handled.length)); assert.ok(w.handled.some(a => a.email === N && a.device === 'phone'));
  assert.ok(w.stuck.some(c => c.key === 'ap2:Q12' && c.waitH >= 24), JSON.stringify(w.stuck));
  assert.ok(w.waiting.length >= w.stuck.length); assert.ok(w.came >= w.waiting.length);
});
await t('the admin feed keeps only the CRM-only kinds and only from admins', async () => {
  assert.strictEqual((await act(O, { op: 'feed', items: [] })).status, 403);
  await act(W, { op: 'feed', items: [{ key: 'td:x:1', title: 'QA To-Do approval' }, { key: 'ap2:ZZ', title: 'server has these' }, { key: 'evil', title: 'x' }] });
  assert.deepStrictEqual(kget('gc_appr_feed')[W].items.map(x => x.key), ['td:x:1']);
});
await t('pure: routeBox drops the duplicate (no note) and moves the alone one (note); redirect; a cover away too passes it on', async () => {
  const shared = { key: 'k1', title: 'a' }, alone = { key: 'k2', title: 'b' };
  const map = { [W]: { email: W, name: 'Wes Admin', cover: N } };
  const out = AW.routeBox({ [W]: [shared, alone], [N]: [shared] }, map);
  assert.deepStrictEqual(Object.keys(out), [N]); assert.strictEqual(out[N].length, 2); assert.ok(!out[N][0].coverFor); assert.strictEqual(out[N][1].coverFor, 'Wes Admin');
  assert.deepStrictEqual(AW.redirect([W, N], map), [N]); assert.deepStrictEqual(AW.redirect([W], map), [N]);
  assert.strictEqual(AW.coverOf({ [W]: { email: W, cover: N }, [N]: { email: N, cover: O } }, W), O); assert.strictEqual(AW.coverOf({ [W]: { cover: N }, [N]: { cover: W } }, W), '');
  assert.deepStrictEqual(AW.redirect([W], { [W]: { email: W, cover: '' } }), [], 'no cover: silenced');
});

console.log('📣 call-outs (owner 11/16) and portal approvals → the office after 48 h');
await t('a SUB calling out → that job\'s PM only (no admins, no office copy); on a COMMERCIAL job the superintendent instead of the PM', async () => {
  reset(); await act(SUP, { op: 'subscribe', sub: phone(SUP), device: 'phone' }); NOW = at(TODAY, '13:00');
  const ST = require(path.join(FN, 'sub-texts.js'))._lib, data = { users: USERS, projects: [JOB, WJOB, CJOB] };
  const r1 = await ST.alertPm({ key: 'k1', sub: 'QA Framing', subId: 'S1', pid: JOB.id, job: JOB.name, day: TODAY, start: 480 }, "can't make it, truck broke down", 'portal', data);
  assert.deepStrictEqual(r1.to, [P]); assert.strictEqual(pushesTo(P).length, 1); assert.match(pushesTo(P)[0].msg.title, /^📣 Call-out — QA Framing/);
  assert.ok(!pushesTo(W).length && !pushesTo(N).length && !pushesTo(SUP).length, 'admins / the super do not get it');
  const mails = SENT.mail.filter(m => /Call-out/.test(m.subject)); assert.ok(mails.every(m => m.to.join() === P), JSON.stringify(mails.map(m => m.to)));
  const task = kget('gc_office_tasks').find(x => x.kind === 'sub_alert' && x.pid === JOB.id); assert.deepStrictEqual(task.assignees, [P]);
  reset();
  const r2 = await ST.alertPm({ key: 'k2', sub: 'QA Drywall', subId: 'S2', pid: CJOB.id, job: CJOB.name, day: TODAY, start: 480 }, 'running late 30 min', 'sms', data);
  assert.deepStrictEqual(r2.to, [SUP]); assert.strictEqual(pushesTo(SUP).length, 1); assert.strictEqual(pushesTo(P).length, 0, 'the PM does not get commercial call-outs');
});
await t('a sub call-out at 2 AM is urgent: it goes through the quiet hours', async () => {
  reset(); NOW = at(addDays(TODAY, 1), '02:00');
  const ST = require(path.join(FN, 'sub-texts.js'))._lib;
  await ST.alertPm({ key: 'k3', sub: 'QA Roofing', subId: 'S3', pid: JOB.id, job: JOB.name, day: addDays(TODAY, 1), start: 420 }, "can't make it — sick", 'portal', { users: USERS, projects: [JOB] });
  assert.strictEqual(pushesTo(P).length, 1, 'delivered at 2 AM');
  NOW = at(TODAY, '13:00');
});
await t('an hourly EMPLOYEE calling out (🤒 sick / ⏰ late) → the admins AND the PM of the job they were on (super on commercial), at once', async () => {
  reset(); NOW = at(TODAY, '13:00');
  const r = await act(TECH, { op: 'callout', kind: 'sick', day: TODAY, note: 'fever', jobs: [JOB.id] });
  assert.strictEqual(r.out.ok, true); assert.deepStrictEqual(r.out.to.slice().sort(), [N, P, W].sort());
  assert.match(pushesTo(P)[0].msg.title, /^📣 Call-out — Tom is out sick today$/); assert.match(pushesTo(W)[0].msg.body, /QA Maple Deck — fever/);
  assert.ok(!pushesTo(O).length && !pushesTo(SUP).length);
  reset();
  const r2 = await act(TECH, { op: 'callout', kind: 'late', minutes: 20, jobs: [CJOB.id] });
  assert.deepStrictEqual(r2.out.to.slice().sort(), [N, SUP, W].sort(), 'commercial: the superintendent, not the PM'); assert.match(pushesTo(SUP)[0].msg.title, /running 20 min late/);
  reset(); NOW = at(addDays(TODAY, 1), '05:30');
  const r3 = await act(TECH, { op: 'callout', kind: 'sick', day: addDays(TODAY, 1), jobs: [JOB.id] });
  assert.ok(pushesTo(P).length === 1 && pushesTo(N).length === 1, 'a 5:30 AM sick call reaches them in the quiet hours'); assert.deepStrictEqual(kget(SQ.HELD).filter(x => /Call-out/.test(x.title)), []);
  reset();
  const r4 = await act(LAB, { op: 'callout', kind: 'sick', day: TODAY, jobs: [JOB.id] });
  assert.deepStrictEqual(r4.out.to.slice().sort(), [MGR, N, P, W].sort(), 'their own manager too (owner 11/16), not the office');
  NOW = at(TODAY, '13:00');
});
await t('pure: the call-out rule (callout.js) — sub: PM / super, the office only when nobody is set, never admins; employee: + admins', async () => {
  const CO = require(path.join(FN, '_lib/callout.js'));
  assert.strictEqual(CO.commercial(CJOB), true); assert.strictEqual(CO.commercial(JOB), false);
  assert.deepStrictEqual(CO.route({ who: 'sub', jobs: [JOB], users: USERS, admins: [W, N], office: [O] }), [P]);
  assert.deepStrictEqual(CO.route({ who: 'sub', jobs: [{ id: 'X', name: 'no PM' }], users: USERS, admins: [W, N], office: [O] }), [O]);
  assert.deepStrictEqual(CO.route({ who: 'sub', jobs: [Object.assign({}, CJOB, { superintendent: '' })], users: USERS, office: [O] }), [P], 'commercial without a super: its PM');
  assert.deepStrictEqual(CO.route({ who: 'employee', jobs: [], users: USERS, admins: [W, N], self: TECH }), [W, N]);
  assert.deepStrictEqual(CO.route({ who: 'employee', jobs: [CJOB], users: USERS, admins: [W, N], self: LAB }), [MGR, SUP, W, N], 'manager, then the commercial job\'s super, then the admins');
  assert.deepStrictEqual(CO.route({ who: 'sub', jobs: [JOB], users: USERS, admins: [W, N], office: [O], self: LAB }), [P], 'a sub: no manager rule');
});
await t('a customer-portal approval waiting on an admin → the office after 48 h ("waited 48 h for an admin"); other admin items keep 24 h; the PM step keeps 24 h', async () => {
  reset(); NOW = at(TODAY, '13:00');
  const h = n => iso(NOW - n * 3600e3);
  lists('gc_approval_queue', [
    qItem('PP1', { kind: 'portal_post', title: 'QA portal post', steps: ['admin'], step: 'admin', adminSince: h(30), createdAt: h(30) }),
    qItem('PP2', { kind: 'portal_publish', title: 'QA portal share', steps: ['admin'], step: 'admin', adminSince: h(49), createdAt: h(49) }),
    qItem('AD1', { kind: 'supplier_po', title: 'QA supplier PO', steps: ['admin'], step: 'admin', adminSince: h(25), createdAt: h(25) }),
    qItem('PM1', { kind: 'sub_contact', title: 'QA sub contact', steps: ['pm', 'admin'], step: 'pm', pmEsc: true, createdAt: h(25), adminSince: '' })]);
  const r = await C.escalateDue({ now: NOW });
  assert.deepStrictEqual(r.ids.slice().sort(), ['AD1', 'PM1', 'PP2']);
  const q = kget('gc_approval_queue'), by = id => q.find(x => x.id === id);
  assert.ok(!by('PP1').escalated, '30 h: still the admins\'');
  assert.strictEqual(by('PP2').escalated.why, 'Waited 48 h for an admin'); assert.match(by('AD1').escalated.why, /24 hours/); assert.match(by('PM1').escalated.why, /PM did not answer in 24 hours/);
  const todo = kget('gc_office_tasks').find(x => x.id === 'appr_esc_PP2'); assert.match(todo.note, /^Waited 48 h for an admin\./);
  const notes = kget('gc_appr_notices'); assert.ok(notes.some(n => n.id === 'esc_office_PP2' && /waited 48 h|Waited 48 h/i.test(n.text))); assert.ok(notes.some(n => n.id === 'esc_admins_PP2' && /after 48h/.test(n.text)));
  assert.strictEqual(C.escalatedOrDue(by('PP1'), NOW + 19 * 3600e3), true, '30 + 19 h → due');
});

console.log('window._gcNotify → op notify (TODOMGR and the other page callers)');
await t('a notice to a staff NAME reaches that phone with its deep link; at 11 PM it waits for the 7 AM bundle; a call-out kind goes; quiet: true never texts', async () => {
  reset(); NOW = at(TODAY, '13:00');
  let r = await act(N, { op: 'notify', to: 'Pat Mason', kind: 'lead', link: '#leads', title: '📥 New lead assigned to you: QA Smith', body: 'Roof leak' });
  assert.deepStrictEqual(r.out.to, [P]); assert.strictEqual(pushesTo(P).length, 1); assert.strictEqual(pushesTo(P)[0].msg.url, 'https://crm.test/#leads');
  r = await act(N, { op: 'notify', to: 'Nobody Here', title: 'x' }); assert.strictEqual(r.out.ok, false);
  r = await act(N, { op: 'notify', to: 'someone@example.test', title: 'x' }); assert.strictEqual(r.out.ok, false, 'staff only');
  reset(); NOW = at(TODAY, '23:00');
  r = await act(N, { op: 'notify', to: 'Pat Mason', kind: 'todo', link: '#todo', title: 'QA To-Do from Nick', body: 'Call the supplier' });
  assert.deepStrictEqual(r.out.held, [P]); assert.strictEqual(SENT.push.length, 0); assert.strictEqual(TEXTS.length, 0);
  r = await act(N, { op: 'notify', to: 'Pat Mason', kind: 'callout', title: '📣 QA crew short', body: 'x' }); assert.strictEqual(pushesTo(P).length, 1, 'a call-out goes at 11 PM');
  NOW = at(addDays(TODAY, 1), '07:00'); reset(); await PG.run({}); assert.ok(pushesTo(P).some(x => /QA To-Do from Nick/.test(x.msg.body) || /QA To-Do from Nick/.test(x.msg.title)), 'the held notice is in the 7 AM bundle');
  reset(); NOW = at(TODAY, '13:00'); await act(TECH, { op: 'unsubscribe', endpoint: 'none' });
  r = await act(N, { op: 'notify', to: 'Tom Tech', title: 'QA quiet one', quiet: true }); assert.strictEqual(TEXTS.length, 0, 'quiet: push only'); assert.deepStrictEqual(r.out.texted, []);
  NOW = at(TODAY, '13:00');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
