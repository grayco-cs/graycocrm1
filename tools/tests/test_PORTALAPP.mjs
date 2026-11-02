/* patch PORTALAPP tests: node tools/tests/test_PORTALAPP.mjs [--no-browser]
   Made-up customers, jobs and phones only; every network call is answered by the in-memory fakes below (a fake Supabase,
   a fake push service that really decrypts the push, and a local web server for the page) — nothing leaves this computer.
   SERVER: Web Push (VAPID + aes128gcm) · the numbers · consent · keys · quiet hours (held → 7 AM) · pause · one push per
           approved post · the device session (c-app / app-claim / sliding year / sign out all devices) · no cross-customer reads.
   BROWSER (Chromium, phone sizes): manifest + service worker · the card (Android prompt / iPhone how-to / iPhone Chrome)
           · standalone · Not now (30 days) · numbers + app-icon badge · seen clears · the installed app signed in
           (saved session, relaunch, handoff, revoked → sign-in, password sign-in remembered, no password stored) · no page errors. */
import { createRequire } from 'module';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import vm from 'vm';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FNDIR = path.join(ROOT, 'netlify/functions');
const SHOTS = process.env.PORTALAPP_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const PW = process.env.PLAYWRIGHT_DIR || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright/index.js';

let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const tok = () => b64u(crypto.randomBytes(32));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');

/* ═════════ the fake cloud ═════════ */
const KV = {}, TABLES = { gc_portal: [], gc_portal_session: [], gc_portal_msg: [], gc_staff: [{ email: 'wes.test@grayco-cs.com', role: 'admin', active: true }] };
const PUSHES = [], RESEND = [];
let tick = 0;
function put(key, v){ KV[key] = { value: typeof v === 'string' ? v : JSON.stringify(v), at: new Date(Date.now() + (++tick)).toISOString() }; }
function kvv(key){ const r = KV[key]; if (!r) return undefined; let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }
function res(status, body, hd){ return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: k => (hd || {})[String(k).toLowerCase()] || null }, arrayBuffer: async () => new ArrayBuffer(0) }; }
function match(row, k, cond){
  const v = row[k];
  if (cond.startsWith('eq.')) return String(v) === decodeURIComponent(cond.slice(3));
  if (cond.startsWith('in.')) return decodeURIComponent(cond.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')).includes(String(v));
  if (cond === 'is.null') return v == null;
  if (cond.startsWith('gt.')) return String(v) > decodeURIComponent(cond.slice(3));
  if (cond.startsWith('cs.')) { const want = JSON.parse(decodeURIComponent(cond.slice(3))); return Array.isArray(v) && want.every(w => v.includes(w)); }
  return true;
}
function filt(rows, u){ const skip = ['select', 'order', 'limit', 'on_conflict', 'offset']; let out = rows; for (const [k, c] of u.searchParams) if (!skip.includes(k)) out = out.filter(r => match(r, k, c)); return out; }
const PUSH_KEYS = {};   /* endpoint → the phone's private key + auth secret, to really decrypt */
function decryptPush(endpoint, body){
  const p = PUSH_KEYS[endpoint]; const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16), idlen = buf[20], asPub = buf.subarray(21, 21 + idlen), ct = buf.subarray(21 + idlen);
  const secret = p.ecdh.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, p.auth, Buffer.concat([Buffer.from('WebPush: info\0'), p.pub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return JSON.parse(pt.subarray(0, pt.lastIndexOf(2)).toString());
}
function verifyVapid(auth, endpoint){
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(\S+)$/.exec(auth); assert.ok(m, 'vapid header: ' + auth);
  const P = unb64u(m[4]);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(P.subarray(1, 33)), y: b64u(P.subarray(33)) }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key, dsaEncoding: 'ieee-p1363' }, unb64u(m[3])), 'VAPID signature verifies');
  const claims = JSON.parse(unb64u(m[2])); assert.strictEqual(claims.aud, new URL(endpoint).origin); assert.ok(claims.exp > Date.now() / 1000);
}
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {}; const method = (o.method || 'GET').toUpperCase();
  await new Promise(r => setImmediate(r));
  const u = new URL(url);
  if (u.hostname === 'fcm.googleapis.com') {
    if (/gone/.test(u.pathname)) return res(410, {});
    verifyVapid(o.headers.Authorization, url);
    PUSHES.push({ endpoint: url, payload: decryptPush(url, o.body), ttl: o.headers.TTL, enc: o.headers['Content-Encoding'] });
    return res(201, {});
  }
  if (u.hostname === 'api.resend.com') { RESEND.push(JSON.parse(o.body)); return res(200, { id: 'em' }); }
  if (u.pathname === '/auth/v1/user') return /Bearer good-admin/.test((o.headers || {}).Authorization || '') ? res(200, { email: 'wes.test@grayco-cs.com' }) : res(401, {});
  if (u.pathname === '/rest/v1/gc_kv') {
    if (method === 'POST') { const b = JSON.parse(o.body); put(b.key, b.value); return res(201, {}); }
    const eq = u.searchParams.get('key') || '';
    const keys = eq.startsWith('eq.') ? [eq.slice(3)] : eq.startsWith('in.') ? eq.slice(3).replace(/^\(|\)$/g, '').split(',').map(k => k.replace(/"/g, '')) : [];
    return res(200, keys.filter(k => KV[k]).map(k => ({ key: k, value: KV[k].value, updated_at: KV[k].at })));
  }
  const tm = /^\/rest\/v1\/(gc_portal|gc_portal_session|gc_portal_msg|gc_staff)$/.exec(u.pathname);
  if (tm) {
    const T = TABLES[tm[1]];
    if (method === 'GET') return res(200, filt(T, u));
    if (method === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(r => T.push(Object.assign({}, r))); return res(201, []); }
    if (method === 'PATCH') { const rows = filt(T, u), b = JSON.parse(o.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
  }
  return res(200, []);
};
process.env.SUPABASE_URL = 'https://fake-portalapp.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test_only';
process.env.RESEND_API_KEY = 're_test_only';
delete process.env.PORTAL_VAPID_PUBLIC; delete process.env.PORTAL_VAPID_PRIVATE; delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
function vapidOn(){ const e = crypto.createECDH('prime256v1'); e.generateKeys(); process.env.PORTAL_VAPID_PUBLIC = b64u(e.getPublicKey()); process.env.PORTAL_VAPID_PRIVATE = b64u(e.getPrivateKey()); }
function phone(name){ const e = crypto.createECDH('prime256v1'); const pub = e.generateKeys(); const auth = crypto.randomBytes(16); const endpoint = 'https://fcm.googleapis.com/fcm/send/' + name; PUSH_KEYS[endpoint] = { ecdh: e, pub, auth }; return { endpoint, keys: { p256dh: b64u(pub), auth: b64u(auth) } }; }

const USERS = [{ name: 'Steven Park', email: 'steven.test@grayco-cs.com', role: 'Project Manager', active: true }, { name: 'Wes Admin', email: 'wes.test@grayco-cs.com', role: 'Admin', active: true }];
put('users', USERS);
put('projects', [{ id: 'PJA', name: 'Alpha Reroof', pm: 'Steven Park', client: 'Ann Alpha', clientEmail: 'ann@example.test', status: 'Active' },
                 { id: 'PJB', name: 'Bravo Siding', pm: 'Steven Park', client: 'Bob Bravo', clientEmail: 'bob@example.test', status: 'Active' }]);
put('gc_automation_pause', { on: false });
const LINK_A = tok(), LINK_B = tok();
TABLES.gc_portal.push({ token: LINK_A, project_id: 'PJA', revoked: false }, { token: LINK_B, project_id: 'PJB', revoked: false });

const portal = require(FNDIR + '/portal.js');
const access = require(FNDIR + '/portal-access.js');
const capp = require(FNDIR + '/_lib/capp.js');
const pause = require(FNDIR + '/_lib/pause.js');
const C = portal._core;
const noon = () => Date.parse('2026-11-02T18:00:00Z');   /* 12:00 Central */
const night = () => Date.parse('2026-11-03T02:00:00Z');  /* 8 PM Central */
capp._setClock(noon);
const ev = (fnBody, hd) => ({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://portal.grayco-cs.com' }, hd || {}), body: JSON.stringify(fnBody) });
const callP = async (body, hd) => { const r = await portal.handler(ev(body, hd)); return { status: r.statusCode, data: JSON.parse(r.body || '{}') }; };
const callA = async (body, hd) => { const r = await access.handler(ev(body, hd)); return { status: r.statusCode, data: JSON.parse(r.body || '{}') }; };
const ADMIN = { email: 'wes.test@grayco-cs.com', role: 'admin', name: 'Wes Admin' };
let qn = 0;
async function approvePost(text){
  const id = 'appr_post_t' + (++qn);
  assert.ok(await C.queueApproval({ id, kind: 'weekly_update', pid: 'PJA', jobName: 'Alpha Reroof', pm: { name: 'Steven Park', email: 'steven.test@grayco-cs.com' }, to: 'Customer portal — Ann', channel: 'portal', subject: 'Weekly update', text, html: '', meta: { postText: text } }));
  const r = await C.approvalAction({ op: 'approve', id }, ADMIN);
  assert.strictEqual(r.status, 200, JSON.stringify(r.out).slice(0, 300));
  return id;
}

console.log('SERVER');
await t('quiet hours: isQuiet = 7 PM – 7 AM Central (CDT and CST)', async () => {
  assert.strictEqual(capp.isQuiet(Date.parse('2026-07-01T23:59:00Z')), false);   /* 6:59 PM CDT */
  assert.strictEqual(capp.isQuiet(Date.parse('2026-07-02T00:00:00Z')), true);    /* 7:00 PM CDT */
  assert.strictEqual(capp.isQuiet(Date.parse('2026-07-02T11:59:00Z')), true);    /* 6:59 AM CDT */
  assert.strictEqual(capp.isQuiet(Date.parse('2026-07-02T12:00:00Z')), false);   /* 7:00 AM CDT */
  assert.strictEqual(capp.isQuiet(Date.parse('2026-12-01T13:00:00Z')), false);   /* 7:00 AM CST */
  assert.strictEqual(capp.isQuiet(Date.parse('2026-12-02T01:00:00Z')), true);    /* 7:00 PM CST */
});
let sA = '';
await t('device session: c-app with the link → a year-long device session + a one-time handoff; app-claim trades it once', async () => {
  const r = await callA({ action: 'c-app' }, { 'x-portal-token': LINK_A });
  assert.strictEqual(r.status, 200); assert.ok(/^[A-Za-z0-9_-]{43}$/.test(r.data.session) && /^[A-Za-z0-9_-]{43}$/.test(r.data.handoff));
  const row = TABLES.gc_portal_session.find(x => x.id === sha(r.data.session));
  assert.ok(row && row.kind === 'customer' && Date.parse(row.expires_at) - Date.now() > 360 * 864e5, 'a year');
  assert.ok(!JSON.stringify(TABLES.gc_portal_session).includes(r.data.session), 'only fingerprints are stored');
  const w = await callA({ action: 'whoami' }, { 'x-portal-session': r.data.handoff });
  assert.strictEqual(w.status, 404, 'a handoff code is not a session');
  const c1 = await callA({ action: 'app-claim', h: r.data.handoff });
  assert.strictEqual(c1.status, 200); assert.ok(c1.data.session && c1.data.session !== r.data.session);
  const c2 = await callA({ action: 'app-claim', h: r.data.handoff });
  assert.strictEqual(c2.status, 404, 'one use only');
  sA = c1.data.session;
  assert.strictEqual((await callA({ action: 'whoami' }, { 'x-portal-session': sA })).data.kind, 'customer');
  assert.strictEqual((await callA({ action: 'c-app' }, { 'x-portal-token': tok() })).status, 404, 'an unknown link gets nothing');
});
await t('device session slides: an open renews it to a year from now', async () => {
  const row = TABLES.gc_portal_session.find(x => x.id === sha(sA));
  row.expires_at = new Date(Date.now() + 5 * 864e5).toISOString(); row.created_at = new Date(Date.now() - 400 * 864e5).toISOString(); row.last_seen_at = new Date(Date.now() - 864e5).toISOString();
  await callA({ action: 'whoami' }, { 'x-portal-session': sA }); await new Promise(r => setTimeout(r, 30));
  assert.ok(Date.parse(row.expires_at) - Date.now() > 360 * 864e5, 'renewed: ' + row.expires_at);
  const plain = { id: sha('x'), kind: 'customer', links: [LINK_A], created_at: new Date(Date.now() - 864e5).toISOString(), expires_at: new Date(Date.now() + 29 * 864e5).toISOString(), last_seen_at: new Date(Date.now() - 864e5).toISOString(), revoked: false };
  TABLES.gc_portal_session.push(plain); const ex = plain.expires_at;
  const sx = tok(); plain.id = sha(sx);
  await callA({ action: 'whoami' }, { 'x-portal-session': sx }); await new Promise(r => setTimeout(r, 30));
  assert.strictEqual(plain.expires_at, ex, 'a normal 30-day browser session is unchanged (no other security change)');
});
let sB = '';
await t("another customer's session cannot read this customer's job (view / app numbers)", async () => {
  sB = (await callA({ action: 'c-app' }, { 'x-portal-token': LINK_B })).data.session;
  const v = await callP({ action: 'view', projectId: 'PJA' }, { 'x-portal-session': sB });
  assert.strictEqual(v.status, 404);
  const a = await callP({ action: 'app', op: 'state', projectId: 'PJA' }, { 'x-portal-session': sB });
  assert.strictEqual(a.status, 404);
  const own = await callP({ action: 'app', op: 'state', projectId: 'PJB' }, { 'x-portal-session': sB });
  assert.strictEqual(own.status, 200); assert.ok(own.data.ok);
});
await t('numbers: first look = everything seen; a new post counts on Home; "seen" clears it', async () => {
  const s0 = await callP({ action: 'app', op: 'state' }, { 'x-portal-token': LINK_A });
  assert.strictEqual(s0.data.total, 0);
  put('gc_portal_auto_posts', [{ id: 'pp1', pid: 'PJA', at: new Date(Date.now() + 1000).toISOString(), by: 'Steven', text: 'Shingles delivered', files: [] }]); C._reset();
  const s1 = await callP({ action: 'app', op: 'state' }, { 'x-portal-token': LINK_A });
  assert.strictEqual(s1.data.unread.home, 1); assert.strictEqual(s1.data.total, 1);
  await new Promise(r => setTimeout(r, 1100));
  const s2 = await callP({ action: 'app', op: 'seen', section: 'home' }, { 'x-portal-token': LINK_A });
  assert.strictEqual(s2.data.unread.home, 0); assert.strictEqual(s2.data.total, 0);
  const pv = await callP({ action: 'app', op: 'seen', section: 'home', preview: true }, { 'x-portal-token': LINK_A });
  assert.strictEqual(pv.data.ok, false, 'a staff preview saves nothing');
});
const ph1 = phone('ann-phone');
await t('no keys → no subscription is taken and an approved post pushes nothing', async () => {
  const r = await callP({ action: 'app', op: 'subscribe', sub: ph1 }, { 'x-portal-token': LINK_A });
  assert.strictEqual(r.data.ok, false); assert.ok(r.data.setup);
  vapidOn(); delete process.env.PORTAL_VAPID_PRIVATE;
  assert.strictEqual(capp.vapidKeys(), null, 'half a key pair is no key');
  delete process.env.PORTAL_VAPID_PUBLIC;
  await approvePost('No keys yet'); assert.strictEqual(PUSHES.length, 0);
});
await t('no consent (keys, but nobody subscribed) → no push', async () => {
  vapidOn();
  await approvePost('No consent yet'); assert.strictEqual(PUSHES.length, 0);
  assert.strictEqual((await callP({ action: 'app', op: 'state' }, { 'x-portal-token': LINK_A })).data.push.ready, true);
});
await t('a subscription is stored (only a real push service address, only the customer’s own job)', async () => {
  const bad = await callP({ action: 'app', op: 'subscribe', sub: { endpoint: 'https://evil.example/x', keys: ph1.keys } }, { 'x-portal-token': LINK_A });
  assert.strictEqual(bad.status, 400);
  const r = await callP({ action: 'app', op: 'subscribe', sub: ph1, lang: 'en' }, { 'x-portal-token': LINK_A });
  assert.ok(r.data.ok && r.data.on);
  const rec = kvv(capp.KEY_PRE + 'PJA'); assert.strictEqual(rec.subs.length, 1); assert.strictEqual(rec.subs[0].endpoint, ph1.endpoint);
  assert.strictEqual((await callP({ action: 'app', op: 'state', endpoint: ph1.endpoint }, { 'x-portal-token': LINK_A })).data.push.on, true);
  assert.ok(!kvv(capp.KEY_PRE + 'PJB') || !(kvv(capp.KEY_PRE + 'PJB').subs || []).length, 'nothing on the other job');
});
await t('an approved weekly update → exactly ONE push, the right count, short title, no item words', async () => {
  PUSHES.length = 0;
  const id = await approvePost('Crew found rotten decking near the chimney');
  assert.strictEqual(PUSHES.length, 1, JSON.stringify(PUSHES));
  const p = PUSHES[0].payload;
  assert.strictEqual(p.title, 'GrayCo: new update on your project'); assert.strictEqual(p.count, 3, 'the post + the two earlier approved posts, nothing seen since: ' + p.count);
  assert.ok(!/rotten|decking|chimney/i.test(JSON.stringify(p)), 'never the item\'s words'); assert.strictEqual(p.url, '/#job=PJA&tab=home');
  assert.strictEqual(PUSHES[0].enc, 'aes128gcm');
  await capp.onPublished(C, { id, kind: 'weekly_update', jobId: 'PJA' });
  assert.strictEqual(PUSHES.length, 1, 'the same item never pushes twice');
});
await t('sub / GC / marketing kinds never push', async () => {
  PUSHES.length = 0;
  for (const kind of ['sub_contact', 'gcp_pay_app', 'bp_notice', 'sub_lien_request', 'mkt_post', 'thank_you', 'announcement']) await capp.onPublished(C, { id: 'k_' + kind, kind, jobId: 'PJA' });
  assert.strictEqual(PUSHES.length, 0);
});
await t('quiet hours: published at 8 PM → held, nothing sent; 6:59 AM still held; at 7 AM ONE push goes', async () => {
  PUSHES.length = 0; capp._setClock(night);
  await approvePost('Evening update one'); await approvePost('Evening update two');
  assert.strictEqual(PUSHES.length, 0, 'nothing at night');
  assert.deepStrictEqual(kvv(capp.HELD_KEY), ['PJA']); assert.strictEqual(kvv(capp.KEY_PRE + 'PJA').held.length, 2);
  assert.strictEqual((await capp.flushHeld(C, { now: '2026-11-03T12:59:00Z' })).skipped, 'quiet hours');   /* 6:59 AM CST */
  const f = await capp.flushHeld(C, { now: '2026-11-03T13:07:00Z' });   /* 7:07 AM CST — portal-reminders runs at :07 */
  assert.strictEqual(f.sent, 1); assert.strictEqual(PUSHES.length, 1);
  assert.strictEqual(PUSHES[0].payload.title, 'GrayCo: 2 new things on your project'); assert.ok(PUSHES[0].payload.count >= 2);
  assert.strictEqual(kvv(capp.KEY_PRE + 'PJA').held.length, 0); assert.deepStrictEqual(kvv(capp.HELD_KEY), []);
  assert.strictEqual((await capp.flushHeld(C, { now: '2026-11-03T14:07:00Z' })).sent, 0, 'never twice');
  capp._setClock(noon);
});
await t('data-entry mode (pause) → no push', async () => {
  PUSHES.length = 0; put('gc_automation_pause', { on: true }); pause.reset();
  const r = await capp.onPublished(C, { id: 'paused1', kind: 'portal_docs', jobId: 'PJA' });
  assert.strictEqual(r.skipped, 'paused'); assert.strictEqual(PUSHES.length, 0);
  put('gc_automation_pause', { on: false }); pause.reset();
});
await t('a phone that went away (410) is dropped', async () => {
  const gone = phone('gone-phone'); await callP({ action: 'app', op: 'subscribe', sub: gone }, { 'x-portal-token': LINK_A });
  assert.strictEqual(kvv(capp.KEY_PRE + 'PJA').subs.length, 2);
  const r = await capp.onPublished(C, { id: 'inv1', kind: 'invoice', jobId: 'PJA' });
  assert.strictEqual(kvv(capp.KEY_PRE + 'PJA').subs.length, 1, JSON.stringify(r));
});
await t('the service worker: a push shows the notification + sets the icon number; a tap only opens this site', async () => {
  const shown = [], badges = [], opened = [], L = {};
  const self = { location: { origin: 'https://portal.grayco-cs.com' }, addEventListener: (k, f) => { L[k] = f; }, navigator: { setAppBadge: async n => badges.push(n), clearAppBadge: async () => badges.push(0) },
    registration: { showNotification: async (title, o) => shown.push({ title, o }) }, clients: { matchAll: async () => [], openWindow: async u => opened.push(u) }, skipWaiting(){} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'portal-sw.js'), 'utf8'), { self, caches: {}, URL, Promise, Response: class {}, fetch: () => {} });
  let wait; L.push({ data: { json: () => ({ title: 'GrayCo: new update on your project', body: 'Tap', count: 4, url: '/#job=PJA&tab=home', tag: 'gc-portal-PJA' }) }, waitUntil: p => { wait = p; } }); await wait;
  assert.strictEqual(shown[0].title, 'GrayCo: new update on your project'); assert.deepStrictEqual(badges, [4]);
  L.notificationclick({ notification: { close(){}, data: { url: 'https://evil.example/x' } }, waitUntil: p => { wait = p; } }); await wait;
  assert.strictEqual(opened[0], 'https://portal.grayco-cs.com/');
  assert.ok(typeof L.fetch === 'function', 'a fetch handler (Chrome needs it to install)');
});
await t('CRM "Sign out all devices": every customer session of the job ends; the link keeps working', async () => {
  const before = (await callA({ action: 'whoami' }, { 'x-portal-session': sA })).data.kind; assert.strictEqual(before, 'customer');
  const denied = await callP({ action: 'devices', projectId: 'PJA' }, {}); assert.strictEqual(denied.status, 401);
  const r = await callP({ action: 'devices', projectId: 'PJA' }, { authorization: 'Bearer good-admin' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data)); assert.ok(r.data.signedOut >= 2);
  assert.strictEqual((await callA({ action: 'whoami' }, { 'x-portal-session': sA })).status, 404, 'revoked → the sign-in');
  assert.strictEqual((await callA({ action: 'whoami' }, { 'x-portal-session': sB })).data.kind, 'customer', 'the other customer is untouched');
  assert.strictEqual((await callP({ action: 'view' }, { 'x-portal-token': LINK_A })).status, 200, 'the link still opens');
});
await t('CRM patch: tools/patch_PORTALAPP.py is applied and idempotent', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('data-q="devsout"') && html.includes("action: 'devices'"));
});

/* ═════════ the browser ═════════ */
if (!process.argv.includes('--no-browser')) {
  console.log('BROWSER');
  const { chromium } = require(PW);
  const PORT = 18000 + Math.floor(Math.random() * 2000), HOST = 'portal.localhost', ORIGIN = 'http://' + HOST + ':' + PORT;
  const B = { calls: [], valid: new Set(), app: null };
  const SESS0 = tok(), TOKA = tok();
  B.valid.add(SESS0);
  let U = { home: 2, photos: 1, docs: 1, pay: 0, msgs: 0 };
  const VIEW = { ok: true, office: { phone: '901-585-0944' }, customer: { name: 'Ann Alpha', firstName: 'Ann', address: '1 Test St', phone: '', email: 'ann@example.test' },
    job: { name: 'Alpha Reroof', address: '1 Test St', po: '1001', stage: 3, stageName: 'Work', stages: ['Signed', 'Ordered', 'Scheduled', 'Work', 'Done'], steps: [] },
    pm: { name: 'Steven Park', phone: '', email: '' }, money: { contract: 10000, changeOrders: [], invoices: [], payments: [], paid: 0, due: 0, finalInvoice: null },
    posts: [{ id: 'p1', at: new Date().toISOString(), by: 'Steven', text: 'Shingles delivered', photos: [] }], docs: [], companyCam: { url: '', linked: false }, warranty: null, showReview: false, review: null, crew: [] };
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
      const u = new URL(req.url, ORIGIN); const J = (o, st) => { res.writeHead(st || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (u.pathname.startsWith('/.netlify/functions/')) {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
        const fn = u.pathname.split('/').pop(), sess = req.headers['x-portal-session'] || '', tk = req.headers['x-portal-token'] || '';
        B.calls.push({ fn, action: b.action, op: b.op, body: b, sess, tk });
        const authed = (sess && B.valid.has(sess)) || tk === TOKA;
        if (fn === 'portal-access') {
          if (b.action === 'open') return J(tk === TOKA ? { ok: true, kind: 'customer' } : { ok: false, error: 'This link is not active' }, tk === TOKA ? 200 : 404);
          if (b.action === 'whoami') return authed ? J({ ok: true, kind: 'customer' }) : J({ ok: false, error: 'This link is not active' }, 404);
          if (b.action === 'c-jobs') return authed ? J({ ok: true, kind: 'customer', jobs: [{ id: 'PJA', name: 'Alpha Reroof', address: '1 Test St', unread: 1 }] }) : J({ ok: false }, 404);
          if (b.action === 'c-msgs') return J({ ok: true, messages: [] });
          if (b.action === 'c-app') { if (!authed) return J({ ok: false }, 404); const s = tok(), h = tok(); B.valid.add(s); B.handoff = h; return J({ ok: true, session: s, handoff: h, days: 365 }); }
          if (b.action === 'app-claim') { if (b.h !== B.handoff) return J({ ok: false }, 404); B.handoff = null; const s = tok(); B.valid.add(s); return J({ ok: true, kind: 'customer', session: s }); }
          if (b.action === 'signin-password') { if (b.password !== 'Correct-Horse-55') return J({ ok: false, error: 'no match' }); const s = tok(); B.valid.add(s); return J({ ok: true, kind: 'customer', session: s }); }
          if (b.action === 'signout') { B.valid.delete(sess); return J({ ok: true }); }
          return J({ ok: false });
        }
        if (fn === 'portal') {
          if (!authed) return J({ ok: false, error: 'This link is not active' }, 404);
          if (b.action === 'view') return J(VIEW);
          if (b.action === 'photos') return J({ ok: true, photos: [] });
          if (b.action === 'app') {
            if (b.op === 'seen') { U = Object.assign({}, U, { [b.section]: 0 }); }
            if (b.op === 'subscribe') { B.sub = b.sub; return J({ ok: true, on: true }); }
            const total = Object.values(U).reduce((a, x) => a + x, 0);
            return J({ ok: true, unread: U, total, push: { ready: true, key: process.env.PORTAL_VAPID_PUBLIC, on: !!(B.sub && b.endpoint === B.sub.endpoint) } });
          }
          return J({ ok: false });
        }
        return J({});
      }
      let f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/portal.html' : u.pathname));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { f = path.join(ROOT, 'portal.html'); }
      const ext = path.extname(f); const ct = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.json': 'application/json' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct + (/text|json|javascript/.test(ct) ? '; charset=utf-8' : '') }); fs.createReadStream(f).pipe(res);
    });
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  /* portal.localhost: a secure context (service worker, push) whose name starts with "portal." like the real one */
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP ' + HOST + ' 127.0.0.1', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=' + HOST] });
  const UA = {
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1'
  };
  const ERRS = [];
  async function device(kind, opts){
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA[kind], serviceWorkers: 'allow' });
    await ctx.addInitScript(o => {
      window.__badges = [];
      Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: n => { window.__badges.push(n); return Promise.resolve(); } });
      Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: () => { window.__badges.push(0); return Promise.resolve(); } });
      if (o.standalone) {
        const mm = window.matchMedia.bind(window);
        window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} } : mm(q);
        try { Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }); } catch (e) {}
      }
      if (o.ls) for (const k of Object.keys(o.ls)) { try { if (!sessionStorage.getItem('__seeded_' + k)) { localStorage.setItem(k, o.ls[k]); sessionStorage.setItem('__seeded_' + k, '1'); } } catch (e) {} }
      if (o.push) {
        const fake = { endpoint: 'https://fcm.googleapis.com/fcm/send/browser-test', toJSON(){ return { endpoint: this.endpoint, keys: { p256dh: o.push.p256dh, auth: o.push.auth } }; }, unsubscribe: async () => true };
        let have = null;
        try { PushManager.prototype.subscribe = async function(){ have = fake; return fake; }; PushManager.prototype.getSubscription = async function(){ return have; }; } catch (e) {}
        try { Object.defineProperty(Notification, 'permission', { configurable: true, get: () => window.__perm || 'default' }); Notification.requestPermission = async () => { window.__perm = 'granted'; return 'granted'; }; } catch (e) {}
      }
    }, { standalone: !!opts.standalone, ls: opts.ls || null, push: opts.push || null });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => ERRS.push(kind + ': ' + e.message));
    return { ctx, pg };
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ls = (pg, k) => pg.evaluate(k => localStorage.getItem(k), k);
  const last = (action, op) => B.calls.filter(c => c.action === action && (!op || c.op === op)).slice(-1)[0];

  await t('manifest: linked, valid, GrayCo name / icons / navy / standalone / start_url in the portal', async () => {
    const { ctx, pg } = await device('android');
    await pg.goto(ORIGIN + '/#t=' + TOKA); await sleep(800);
    const m = await pg.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]'); const r = await fetch(l.href); return { href: l.getAttribute('href'), ct: r.headers.get('content-type'), j: await r.json(), apple: !!document.querySelector('link[rel="apple-touch-icon"]') && !!document.querySelector('meta[name="apple-mobile-web-app-capable"]'), theme: (document.querySelector('meta[name="theme-color"]') || {}).content } ; });
    assert.strictEqual(m.href, '/portal.webmanifest'); assert.strictEqual(m.j.name, 'GrayCo'); assert.strictEqual(m.j.short_name, 'GrayCo');
    assert.strictEqual(m.j.display, 'standalone'); assert.strictEqual(m.j.theme_color, '#0F1D2F'); assert.strictEqual(m.theme, '#0F1D2F'); assert.ok(m.apple);
    assert.ok(m.j.start_url.startsWith('/portal.html')); assert.ok(m.j.icons.some(i => i.sizes === '192x192') && m.j.icons.some(i => i.sizes === '512x512'));
    for (const i of m.j.icons) { const st = await pg.evaluate(async s => (await fetch(s)).status, i.src); assert.strictEqual(st, 200, i.src); }
    await ctx.close();
  });
  await t('the service worker registers (with its fetch handler) and takes the page', async () => {
    const { ctx, pg } = await device('android');
    await pg.goto(ORIGIN + '/#t=' + TOKA);
    const r = await pg.evaluate(async () => { const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 8000))]); return reg ? { scope: reg.scope, url: (reg.active || {}).scriptURL } : null; });
    assert.ok(r && /portal-sw\.js$/.test(r.url) && r.scope.endsWith('/'), JSON.stringify(r));
    await ctx.close();
  });
  await t('Android: the beforeinstallprompt card → "Add to Home Screen" calls prompt() (and this phone gets its device session)', async () => {
    const { ctx, pg } = await device('android');
    await pg.goto(ORIGIN + '/#t=' + TOKA); await pg.waitForSelector('#tabs:not([hidden])');
    await pg.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
    await pg.waitForSelector('#gca-card', { timeout: 6000 });
    const txt = await pg.textContent('#gca-card'); assert.ok(/Make GrayCo Portal an app\?/.test(txt) && /Add to Home Screen/.test(txt) && /Not now/.test(txt), txt);
    assert.strictEqual(await pg.$('#gcp-install'), null, 'the old bar is not shown to customers');
    await pg.screenshot({ path: SHOTS + '/portalapp_banner_android.png' });
    await pg.click('#gca-add'); await sleep(500);
    assert.strictEqual(await pg.evaluate(() => window.__prompted), 1);
    assert.ok(/^[A-Za-z0-9_-]{43}$/.test(await ls(pg, 'gc_portal_app')), 'the installed app will open signed in');
    assert.strictEqual(await pg.$('#gca-card'), null);
    await ctx.close();
  });
  await t('desktop / Android without an install prompt: no card', async () => {
    const { ctx, pg } = await device('android');
    await pg.goto(ORIGIN + '/#t=' + TOKA); await pg.waitForSelector('#tabs:not([hidden])'); await sleep(3500);
    assert.strictEqual(await pg.$('#gca-card'), null);
    await ctx.close();
  });
  await t('iPhone Safari: the card → the Share how-to (□↑ → Add to Home Screen → Add) with the arrow; the start address carries the one-time code', async () => {
    const { ctx, pg } = await device('iphone');
    await pg.goto(ORIGIN + '/#t=' + TOKA); await pg.waitForSelector('#gca-card', { timeout: 8000 });
    await pg.waitForFunction(() => { const i = document.querySelector('#gca-card img'); return i && i.complete; }, null, { timeout: 5000 });
    assert.ok(await pg.evaluate(() => document.querySelector('#gca-card img').naturalWidth > 0), 'the GrayCo icon shows');
    await pg.screenshot({ path: SHOTS + '/portalapp_banner.png' });
    await pg.click('#gca-add'); await pg.waitForSelector('#gca-howto'); await sleep(400);
    const txt = await pg.textContent('#gca-howto');
    assert.ok(/Share/.test(txt) && /Add to Home Screen/.test(txt) && /Add/.test(txt) && /notifications/.test(txt), txt);
    assert.ok(await pg.$('#gca-arrow'), 'the arrow to Safari\'s Share button');
    await pg.screenshot({ path: SHOTS + '/portalapp_ios_howto.png' });
    await sleep(300);
    const st = await pg.evaluate(() => ({ url: location.href, man: document.querySelector('link[rel="manifest"]').getAttribute('href') }));
    assert.ok(/#h=[A-Za-z0-9_-]{43}$/.test(st.url), st.url);
    const man = JSON.parse(decodeURIComponent(st.man.replace(/^data:application\/manifest\+json,/, '')));
    assert.ok(/\/portal\.html\?app=1#h=/.test(man.start_url), man.start_url);
    await pg.click('#gca-howto-ok'); assert.strictEqual(await pg.$('#gca-howto'), null);
    await ctx.close();
  });
  await t('iPhone Chrome / in-app browsers: "Open this page in Safari first"', async () => {
    const { ctx, pg } = await device('iosChrome');
    await pg.goto(ORIGIN + '/#t=' + TOKA); await pg.waitForSelector('#gca-card', { timeout: 8000 });
    await pg.click('#gca-add'); await pg.waitForSelector('#gca-howto');
    assert.ok(/Open this page in Safari first/.test(await pg.textContent('#gca-howto')));
    await ctx.close();
  });
  await t('"Not now" hides it for 30 days (and it comes back after)', async () => {
    const { ctx, pg } = await device('iphone');
    await pg.goto(ORIGIN + '/#t=' + TOKA); await pg.waitForSelector('#gca-card', { timeout: 8000 });
    await pg.click('#gca-not'); assert.strictEqual(await pg.$('#gca-card'), null);
    const d = Number(await ls(pg, 'gc_pwa_dismiss')); assert.ok(Math.abs(Date.now() - d) < 60e3);
    await pg.reload(); await pg.waitForSelector('#tabs:not([hidden])'); await sleep(3500);
    assert.strictEqual(await pg.$('#gca-card'), null, 'not again for 30 days');
    await pg.evaluate(() => localStorage.setItem('gc_pwa_dismiss', String(Date.now() - 29 * 864e5)));
    await pg.reload(); await pg.waitForSelector('#tabs:not([hidden])'); await sleep(3500);
    assert.strictEqual(await pg.$('#gca-card'), null, 'day 29: still hidden');
    await pg.evaluate(() => localStorage.setItem('gc_pwa_dismiss', String(Date.now() - 31 * 864e5)));
    await pg.reload(); await pg.waitForSelector('#gca-card', { timeout: 8000 });
    await ctx.close();
  });
  await t('the 📲 menu: Add to Home Screen is always there (even after Not now); sub portal / sign-in never get it', async () => {
    const { ctx, pg } = await device('iphone', { ls: { gc_pwa_dismiss: String(Date.now()) } });
    await pg.goto(ORIGIN + '/'); await sleep(1500);
    assert.strictEqual(await pg.$('#gca-mbtn'), null, 'not on the sign-in screen');
    await pg.goto(ORIGIN + '/portal.html#t=' + TOKA); await pg.waitForSelector('#gca-mbtn', { timeout: 6000 });
    await pg.click('#gca-mbtn'); await pg.waitForSelector('#gca-m-add');
    await pg.click('#gca-m-add'); await pg.waitForSelector('#gca-howto');
    await ctx.close();
  });
  await t('numbers on the tabs + setAppBadge(total); opening a section clears it', async () => {
    U = { home: 2, photos: 1, docs: 1, pay: 0, msgs: 0 };
    const { ctx, pg } = await device('android');
    await pg.goto(ORIGIN + '/#t=' + TOKA); await pg.waitForSelector('#tabs button[data-tab="docs"] .gca-b', { timeout: 8000 });
    await pg.waitForSelector('#msgBadge', { timeout: 6000 });
    const b = await pg.evaluate(() => ['home', 'photos', 'docs', 'pay'].map(k => { const x = document.querySelector('#tabs button[data-tab="' + k + '"] .gca-b'); return x ? x.textContent : ''; }));
    assert.deepStrictEqual(b, ['2', '1', '1', '']);
    await sleep(300);
    assert.strictEqual(await pg.evaluate(() => window.__badges.slice(-1)[0]), 5, 'icon = 2 + 1 + 1 + 1 message');
    await pg.click('#tabs button[data-tab="docs"]'); await sleep(800);
    assert.ok(last('app', 'seen') && last('app', 'seen').body.section === 'docs');
    assert.strictEqual(await pg.$('#tabs button[data-tab="docs"] .gca-b'), null);
    assert.strictEqual(await pg.evaluate(() => window.__badges.slice(-1)[0]), 4);
    await pg.click('#tabs button[data-tab="home"]'); await sleep(4800);
    assert.strictEqual(last('app', 'seen').body.section, 'home', 'Home is seen after a few seconds on screen');
    assert.strictEqual(await pg.evaluate(() => window.__badges.slice(-1)[0]), 2);
    await ctx.close();
  });
  await t('standalone (installed): no card; a saved device session lands in the portal with no sign-in, and survives a relaunch', async () => {
    const { ctx, pg } = await device('iphone', { standalone: true, ls: { gc_portal_app: SESS0 } });
    B.calls.length = 0;
    await pg.goto(ORIGIN + '/portal.html?app=1'); await pg.waitForSelector('#tabs:not([hidden])', { timeout: 8000 });
    assert.strictEqual(await pg.$('#signinBox'), null); assert.strictEqual(await pg.textContent('#jobName'), 'Alpha Reroof');
    assert.ok(B.calls.some(c => c.action === 'c-jobs' && c.sess === SESS0), 'signed in with the device session');
    await sleep(3200); assert.strictEqual(await pg.$('#gca-card'), null, 'no install card inside the app');
    await pg.reload(); await pg.waitForSelector('#tabs:not([hidden])', { timeout: 8000 });
    assert.strictEqual(await pg.$('#signinBox'), null, 'relaunch: still signed in');
    await ctx.close();
  });
  await t('iPhone first open of the installed app: the one-time code becomes the app\'s own session; then no code needed', async () => {
    B.handoff = tok(); const h = B.handoff;
    const { ctx, pg } = await device('iphone', { standalone: true });
    await pg.goto(ORIGIN + '/portal.html?app=1#h=' + h); await pg.waitForSelector('#tabs:not([hidden])', { timeout: 8000 });
    const s = await ls(pg, 'gc_portal_app'); assert.ok(/^[A-Za-z0-9_-]{43}$/.test(s) && s !== h);
    assert.ok(!/h=/.test(await pg.evaluate(() => location.hash)), 'the code leaves the address bar');
    await pg.goto(ORIGIN + '/portal.html?app=1#h=' + h); await pg.waitForSelector('#tabs:not([hidden])', { timeout: 8000 });
    assert.strictEqual(await pg.$('#signinBox'), null, 'next opens use the saved session (the used code is ignored)');
    await ctx.close();
  });
  await t('revoked ("Sign out all devices") → the sign-in; signing in inside the app remembers the device again — no password stored', async () => {
    const dead = tok();
    const { ctx, pg } = await device('iphone', { standalone: true, ls: { gc_portal_app: dead } });
    await pg.goto(ORIGIN + '/portal.html?app=1'); await pg.waitForSelector('#signinBox', { timeout: 8000 });
    assert.strictEqual(await ls(pg, 'gc_portal_app'), null, 'the dead session is forgotten');
    const pwIn = await pg.$('#signinBox input[type="password"]'); const emIn = await pg.$('#signinBox input:not([type="password"])');
    await emIn.fill('ann@example.test'); await pwIn.fill('Correct-Horse-55'); await pwIn.press('Enter');
    await pg.waitForSelector('#tabs:not([hidden])', { timeout: 8000 });
    const si = last('signin-password'); assert.strictEqual(si.body.app, true, 'asks for the long device session');
    const store = await pg.evaluate(() => JSON.stringify(Object.assign({}, localStorage)) + ' ' + JSON.stringify(Object.assign({}, sessionStorage)) + ' ' + document.cookie);
    assert.ok(!store.includes('Correct-Horse-55'), 'no password in localStorage / sessionStorage / cookies');
    assert.ok(/^[A-Za-z0-9_-]{43}$/.test(await ls(pg, 'gc_portal_app')));
    const man = await pg.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]').href; return l.startsWith('data:') ? decodeURIComponent(l) : await (await fetch(l)).text(); });
    assert.ok(!man.includes('Correct-Horse-55'), 'nor in the manifest');
    const ck = await ctx.cookies(); assert.strictEqual(ck.length, 0);
    await pg.click('#gca-mbtn'); await pg.waitForSelector('#gca-m-out');
    await pg.click('#gca-m-out'); await pg.waitForSelector('#signinBox', { timeout: 8000 });
    assert.strictEqual(await ls(pg, 'gc_portal_app'), null, 'Sign out of this device');
    await ctx.close();
  });
  await t('inside the app: 🔔 Turn on notifications → permission → the subscription goes to the server', async () => {
    vapidOn();
    const ph = phone('browser-test');
    const { ctx, pg } = await device('android', { standalone: true, ls: { gc_portal_app: SESS0 }, push: ph.keys });
    await pg.goto(ORIGIN + '/portal.html?app=1'); await pg.waitForSelector('#gca-push', { timeout: 8000 });
    await pg.screenshot({ path: SHOTS + '/portalapp_notifications.png' });
    await pg.click('#gca-push-on'); await sleep(1500);
    assert.ok(B.sub && B.sub.endpoint === 'https://fcm.googleapis.com/fcm/send/browser-test' && B.sub.keys.p256dh === ph.keys.p256dh, JSON.stringify(B.sub));
    assert.strictEqual(await pg.$('#gca-push'), null);
    await ctx.close();
  });
  await t('preview from the CRM (#p=1): no card, no menu, nothing saved', async () => {
    const { ctx, pg } = await device('iphone');
    await pg.goto(ORIGIN + '/#t=' + TOKA + '&p=1'); await pg.waitForSelector('#tabs:not([hidden])'); await sleep(3500);
    assert.strictEqual(await pg.$('#gca-card'), null); assert.strictEqual(await pg.$('#gca-mbtn'), null);
    await ctx.close();
  });
  await t('no page errors', async () => { assert.deepStrictEqual(ERRS, []); });
  await browser.close(); server.close();
}
console.log((failed ? 'FAILED ' : 'OK ') + passed + '/' + (passed + failed));
process.exit(failed ? 1 : 0);
