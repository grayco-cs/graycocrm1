// test_SUBSESS.mjs [build-dir] [shot-dir] — patch SUBSESS (owner 11/12: "keep subs signed in on portal").
// Subcontractors stay signed in — until THEY press Sign out — across a closed tab / browser, phone sleep, days away and new versions,
// on BOTH sub-facing sites. Offline: Chromium against the REAL server functions on an in-memory Supabase. Made-up data only.
//
//  A. bids.grayco-cs.com (subportal/ built from subportal-app/src, netlify/functions/subportal.js; Supabase sign-in in gc_auth_v1):
//     A1 an expired access token is renewed silently with the refresh token → still signed in (no sign-in screen)
//     A2 no signal while renewing → "Reconnecting…" (still signed in, sign-in kept), back online → in; signed in + renewal fails → stays in
//     A3 Supabase's /auth/v1/user answers 5xx → the server says 503 (not 401) → still signed in
//     A4 reload / a new tab → still signed in
//     A5 two tabs renewing at once (Supabase rotates refresh tokens: a second use is refused) → neither signs out; with the
//        cross-tab lock only ONE renewal is sent; without Web Locks the loser re-reads the browser copy and keeps going
//     A6 a new version of the site (new script file) → still signed in
//     A7 the refresh token really revoked → signed out (after one more try), the other tab too — security unchanged
//     A8 Log Out → signed out, the other tab too
//  B. portal.grayco-cs.com (portal.html + portal-app.js, netlify/functions/portal-access.js; device session in gc_portal_s):
//     B1 signed in; reload / new tab / two tabs at once → still signed in
//     B2 the server hiccups at start (502 HTML, database 5xx) or no signal → "Reconnecting…", gc_portal_s kept → back → signed in
//     B3 one stray "not active" on a call → checked again (whoami) and retried → still signed in
//     B4 server: a sub's device session slides (a year from each use); a new one lasts a year — not 30 days from sign-in
//     B5 server: a half-read CRM record set / a database hiccup on a bid-only sub → 503 (try again), never "not active"
//     B6 a new version (portal-app.js ?v=) → still signed in; the service worker never touches the sign-in
//     B7 the office turns the sub's link off → signed out (security unchanged); Sign out → signed out, session revoked on the server
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (f, ms = 15000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await f(); if (v) return v; await sleep(200); } return v; };
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', PORTAL_MAIL_OFF: '1' });
delete process.env.RESEND_API_KEY; delete process.env.COMPANYCAM_TOKEN;
const now = () => new Date().toISOString();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }).catch(() => {}); };

/* ═════ the in-memory Supabase (both server functions) ═════ */
const ACC = { 'sam@sampledrywall.test': { pw: 'Sub-Pass-123', id: 'auth-s' } };
const TOK = {};                 // access token → email (deleted = expired / refused)
const RT = {};                  // refresh token → { email, used }
const spRow = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now() }, extra || {});
const SUB = { id: 'SUBsample1', name: 'Sample Drywall LLC', company: 'Sample Drywall LLC', contact: 'Sam Sample', phone: '901-555-0141', email: 'sam@sampledrywall.test', isSub: true, trade: 'Drywall', lang: 'en' };
const JOB = { id: 'PSAMPLE1', name: 'Sample Kitchen Remodel', address: '123 Sample St, Memphis, TN 38117', client: 'Pat Sample', pm: 'Sample PM', status: 'Active', subs: [{ subId: SUB.id, name: SUB.name, status: 'Awarded' }] };
let KV, KVAT, T, FAULT = {};
function freshDb(){
  KV = { projects: [JOB], vendors: [SUB], users: [{ id: 'u1', name: 'Sample PM', email: 'samplepm@grayco-cs.test', phone: '901-555-0100', role: 'Project Manager', active: true }], gc_sub_portal_settings: {} };
  KVAT = {};
  T = { gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_portal: [], gc_sub_scope: [], gc_portal_msg: [], gc_portal_code: [], gc_sub_device: [], gc_portal: [], gc_portal_lock: [], gc_portal_login: [],
    sp_rows: [spRow('users', 'u_sam', { id: 'u_sam', role: 'sub', approved: true, email: 'sam@sampledrywall.test', name: 'Sam Sample', company: 'Sample Drywall LLC', phone: '901-555-0141', trades: ['Drywall'] }, { user_id: 'u_sam', email: 'sam@sampledrywall.test' })],
    gc_staff: [] };
}
freshDb();
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') {
    if (FAULT.user) return res(FAULT.user, { message: 'upstream error' });
    const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, '');
    return TOK[a] ? res(200, { id: ACC[TOK[a]].id, email: TOK[a] }) : res(401, { code: 401, msg: 'invalid JWT' });
  }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = x.value; KVAT[x.key] = x.updated_at || now(); }); return res(201, null); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
    if (FAULT.chunks && keys.some(x => /__chunk/.test(x))) return res(500, {});
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: KVAT[x] || 'T0' })));
  }
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm) {
    if (FAULT.table && FAULT.table === tm[1]) return res(500, { message: 'db down' });
    const tb = T[tm[1]] || (T[tm[1]] = []);
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { const i = r.key ? tb.findIndex(x => x.key === r.key) : -1; if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); }); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
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
  if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(init.body); return res(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/x/' + p + '?token=t' }))); }
  return res(404, {});
};
const SPF = require(path.join(BUILD, 'netlify/functions/subportal.js'));
const PA = require(path.join(BUILD, 'netlify/functions/portal-access.js'));
const resetPA = () => { try { PA._core._reset(); } catch (e) {} };

/* ═════ the browser ═════ */
const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const SBH = 'ieeonhpfahmwwecizdut.supabase.co';
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
let NET = 0;                                   // spread the calls over made-up addresses (the server's per-address limits)
/* Supabase sign-in, as the bid site sees it. MODE: 'ok' | 'abort' (no signal) | '503'. Refresh tokens rotate strictly:
   a second use is refused (worst case: no reuse window). DELAY: the winner's answer comes late, a loser's refusal at once. */
let MODE = 'ok', DELAY = 0; const REFRESH_CALLS = [];
function issue(email){
  const tok = 't-' + crypto.randomBytes(6).toString('hex'), rt = 'r-' + crypto.randomBytes(6).toString('hex');
  TOK[tok] = email; RT[rt] = { email, used: false };
  return { access_token: tok, refresh_token: rt, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: ACC[email].id, email } };
}
let NEWVER = false, PORTAL_V = '';
async function bidsCtx(opts){
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block', viewport: { width: 1280, height: 820 } }, opts || {}));
  await ctx.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host === SBH && u.pathname === '/auth/v1/token') {
      const cors = { 'access-control-allow-origin': '*' };
      const b = JSON.parse(rq.postData() || '{}'), grant = u.searchParams.get('grant_type');
      if (grant === 'refresh_token') REFRESH_CALLS.push(b.refresh_token);
      if (MODE === 'abort') return r.abort('internetdisconnected');
      if (MODE === '503') return r.fulfill({ status: 503, headers: cors, contentType: 'text/html', body: '<html>Service Unavailable</html>' });
      if (grant === 'password') { const a = ACC[String(b.email).toLowerCase()]; if (!a || a.pw !== b.password) return r.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: '{"error":"invalid_grant","error_description":"Invalid login credentials"}' }); return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(issue(String(b.email).toLowerCase())) }); }
      const x = RT[b.refresh_token];
      if (!x || x.used) return r.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: '{"code":400,"error_code":"refresh_token_already_used","msg":"Invalid Refresh Token: Already Used"}' });
      x.used = true; const out = issue(x.email);
      if (DELAY) await sleep(DELAY);
      return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(out) });
    }
    if (u.host === SBH && u.pathname === '/auth/v1/logout') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
    if (u.host !== 'bids.test') return r.abort('blockedbyclient');
    if (u.pathname === '/.netlify/functions/subportal') {
      const resp = await SPF.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://bids.test', 'x-nf-client-connection-ip': '10.1.' + (NET++ % 250) + '.1' }, rq.headers()), body: rq.postData() || '' });
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    if (u.pathname === '/.netlify/functions/gdrive') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"configured":false}' });
    const dir = path.join(BUILD, 'subportal');
    if (u.pathname === '/' || u.pathname === '/index.html') {
      let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
      if (NEWVER) html = html.replace(/\.\/assets\/(index-[A-Za-z0-9_-]+)\.js/, './assets/$1.js?newversion=2');   /* "a new version is live": a different script address */
      return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    }
    const f = path.join(dir, decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    return r.fulfill({ status: 404, body: '' });
  });
  return ctx;
}
async function newPage(ctx, url){ const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); if (url) await p.goto(url); return p; }
const bidState = p => p.evaluate(() => {
  const t = document.body.innerText || '';
  let s = null; try { s = JSON.parse(localStorage.getItem('gc_auth_v1') || 'null'); } catch (e) {}
  return { inApp: /Log Out/.test(t) && !document.querySelector('input[type=password]'), login: !!document.querySelector('input[type=password]'), reconnect: !!document.querySelector('[data-gc-reconnect]'), stored: s };
});
const waitBid = (p, want, ms) => waitFor(async () => { const s = await bidState(p).catch(() => null); return s && s[want] ? s : null; }, ms || 20000);
async function expireStored(p, inSec){
  return p.evaluate(([sec]) => { const s = JSON.parse(localStorage.getItem('gc_auth_v1')); s.expires_at = Math.floor(Date.now() / 1000) + sec; localStorage.setItem('gc_auth_v1', JSON.stringify(s)); return s.access_token; }, [inSec]);
}

/* ─── A. the bid site ─── */
{
  const C = await bidsCtx();
  const P = await newPage(C, 'https://bids.test/');
  await P.waitForSelector('input[type=email]', { timeout: 30000 });
  await P.fill('input[type=email]', 'sam@sampledrywall.test'); await P.fill('input[type=password]', 'Sub-Pass-123'); await P.press('input[type=password]', 'Enter');
  const s0 = await waitBid(P, 'inApp', 30000);
  ok('A0 the sub signs in on the bid site', !!s0, await bidState(P));

  /* A1 an expired access token → renewed silently on the next open */
  let old = await expireStored(P, -600); delete TOK[old]; REFRESH_CALLS.length = 0;
  await P.reload();
  let s = await waitBid(P, 'inApp');
  ok('A1 access token expired (closed tab, days away) → renewed with the refresh token, still signed in', s && s.stored && s.stored.access_token !== old && REFRESH_CALLS.length === 1 && TOK[s.stored.access_token], { s, calls: REFRESH_CALLS.length });

  /* A1b proactive: about to run out while the page is open → renewed before it does (page shown again / focus) */
  REFRESH_CALLS.length = 0; old = await expireStored(P, 120);
  await P.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  s = await waitFor(async () => { const x = await bidState(P); return x.stored && x.stored.access_token !== old ? x : null; }, 10000);
  ok('A1b a token about to run out is renewed BEFORE it does (window focus / page shown), nothing failed first', s && s.inApp && REFRESH_CALLS.length === 1, { calls: REFRESH_CALLS.length, s });

  /* A2 no signal while renewing */
  old = await expireStored(P, -600); delete TOK[old]; MODE = 'abort';
  const keepRt = (await bidState(P)).stored.refresh_token;
  await P.reload();
  s = await waitBid(P, 'reconnect');
  ok('A2 no signal while renewing at open → "Reconnecting…" (not the sign-in screen), the sign-in is kept', s && !s.login && s.stored && s.stored.refresh_token === keepRt, s);
  await shot(P, 'subsess_a2_bids_reconnecting');
  MODE = 'ok';
  await P.evaluate(() => window.dispatchEvent(new Event('online')));
  s = await waitBid(P, 'inApp');
  ok('A2 back online → signed in again by itself (no password)', !!s, await bidState(P));
  /* signed in, renewal fails (no signal, then Supabase 503): stays signed in */
  MODE = 'abort'; old = await expireStored(P, 60);
  await P.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(1500);
  MODE = '503'; await P.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(1500);
  s = await bidState(P);
  ok('A2 signed in and the renewal fails (no signal, then a 503 from the sign-in service) → still signed in, sign-in kept', s.inApp && s.stored && s.stored.access_token === old, s);
  MODE = 'ok'; await P.evaluate(() => window.dispatchEvent(new Event('focus')));
  s = await waitFor(async () => { const x = await bidState(P); return x.stored && x.stored.access_token !== old ? x : null; }, 10000);
  ok('A2 … and renewed as soon as the service answers again', s && s.inApp, s);

  /* A3 the server's own check: Supabase /auth/v1/user 5xx → 503, not "your sign-in has expired" */
  {
    const tok = (await bidState(P)).stored.access_token;
    FAULT.user = 502;
    const r1 = await SPF.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: 'Bearer ' + tok, 'x-nf-client-connection-ip': '10.9.9.9' }, body: JSON.stringify({ action: 'me' }) });
    await P.reload(); s = await waitBid(P, 'reconnect');
    ok('A3 Supabase /auth/v1/user answers 502 → subportal.js says 503 (was 401 "sign-in expired"); the page keeps the sign-in ("Reconnecting…")', r1.statusCode === 503 && s && s.stored && s.stored.access_token === tok, { st: r1.statusCode, s });
    FAULT.user = 0;
    const r2 = await SPF.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: 'Bearer not-a-token', 'x-nf-client-connection-ip': '10.9.9.8' }, body: JSON.stringify({ action: 'me' }) });
    ok('A3 a token Supabase refuses (401) is still a 401 — the server check is not weakened', r2.statusCode === 401, r2.statusCode);
    await P.click('text=Try again now', { timeout: 5000 }).catch(() => {}); s = await waitBid(P, 'inApp');
    ok('A3 "Try again now" → in', !!s);
  }

  /* A4 reload / new tab */
  await P.reload(); s = await waitBid(P, 'inApp');
  const P2 = await newPage(C, 'https://bids.test/'); const s2 = await waitBid(P2, 'inApp');
  ok('A4 reload and a new tab → still signed in', !!s && !!s2);
  await P2.close();

  /* A5 two tabs renewing at once */
  {
    const T1 = P, T2 = await newPage(C, 'https://bids.test/'); await waitBid(T2, 'inApp');
    old = await expireStored(T1, -600); delete TOK[old]; REFRESH_CALLS.length = 0; DELAY = 700;
    await Promise.all([T1.reload(), T2.reload()]);
    const [a, b] = [await waitBid(T1, 'inApp'), await waitBid(T2, 'inApp')];
    ok('A5 two tabs open at once with an expired token → both signed in; with the cross-tab lock only ONE renewal is sent', a && b && REFRESH_CALLS.length === 1, { a: !!a, b: !!b, calls: REFRESH_CALLS.length });
    const st = (await bidState(T1)).stored;
    ok('A5 … and the saved refresh token is the fresh, unused one', st && RT[st.refresh_token] && !RT[st.refresh_token].used, st);
    DELAY = 0; await T2.close();
  }
  {
    /* the same without Web Locks (older phones): the loser's refusal comes back first */
    const C2 = await bidsCtx();
    await C2.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'locks', { get(){ return undefined; }, configurable: true }); } catch (e) {} });
    const st0 = (await bidState(P)).stored; const fresh = issue('sam@sampledrywall.test');
    const T1 = await newPage(C2, 'https://bids.test/');
    await T1.evaluate(([s0, f]) => localStorage.setItem('gc_auth_v1', JSON.stringify(Object.assign({}, s0, { access_token: f.access_token, refresh_token: f.refresh_token, expires_at: Math.floor(Date.now() / 1000) - 600 }))), [st0, fresh]);
    delete TOK[fresh.access_token];
    const T2 = await newPage(C2);
    REFRESH_CALLS.length = 0; DELAY = 900;
    await Promise.all([T1.reload(), T2.goto('https://bids.test/')]);
    const [a, b] = [await waitBid(T1, 'inApp', 25000), await waitBid(T2, 'inApp', 25000)];
    const lockless = await T1.evaluate(() => !navigator.locks);
    ok('A5 without Web Locks: both tabs renew with the same token, Supabase refuses the second → that tab re-reads the browser copy and stays signed in (neither signs out)', lockless && a && b && REFRESH_CALLS.length >= 2, { lockless, a: !!a, b: !!b, calls: REFRESH_CALLS.length, sa: await bidState(T1), sb: await bidState(T2) });
    DELAY = 0; await C2.close();
  }

  /* A6 a new version of the site */
  NEWVER = true; await P.reload(); s = await waitBid(P, 'inApp');
  const loaded = await P.evaluate(() => [...document.scripts].map(x => x.src).find(x => /assets\/index-/.test(x)) || '');
  ok('A6 a new version of the bid site (new script address) → still signed in', !!s && /newversion=2/.test(loaded), loaded);
  NEWVER = false;

  /* A7 the refresh token really revoked → signed out (after one more try), the other tab too */
  {
    const T2 = await newPage(C, 'https://bids.test/'); await waitBid(T2, 'inApp');
    const st = (await bidState(P)).stored; delete TOK[st.access_token]; RT[st.refresh_token].used = true; await expireStored(P, -600);
    REFRESH_CALLS.length = 0;
    await P.reload();
    s = await waitBid(P, 'login', 25000);
    ok('A7 refresh token revoked (Supabase refuses it twice) → signed out, the browser copy removed', s && !s.stored && REFRESH_CALLS.length === 2, { s, calls: REFRESH_CALLS.length });
    const o2 = await waitBid(T2, 'login', 10000);
    ok('A7 … and the other open tab goes to the sign-in too', !!o2);
    await T2.close();
  }

  /* A8 Log Out */
  await P.fill('input[type=email]', 'sam@sampledrywall.test'); await P.fill('input[type=password]', 'Sub-Pass-123'); await P.press('input[type=password]', 'Enter');
  await waitBid(P, 'inApp', 20000);
  const T2 = await newPage(C, 'https://bids.test/'); await waitBid(T2, 'inApp');
  await P.click('text=Log Out');
  s = await waitBid(P, 'login', 10000);
  ok('A8 Log Out → signed out, the browser copy removed', s && !s.stored, s);
  ok('A8 … the other tab too', !!(await waitBid(T2, 'login', 10000)));
  await P.reload(); ok('A8 … and it stays signed out after a reload', !!(await waitBid(P, 'login', 15000)));
  await C.close();
}

/* ─── B. the GrayCo Portal (portal.grayco-cs.com) ─── */
freshDb(); resetPA();
const LINK = 'L'.repeat(43), SESSION = 'S'.repeat(43);
T.gc_sub_link.push({ token: LINK, sub_id: SUB.id, revoked: false, created_at: now() });
T.gc_portal_session.push({ id: sha(SESSION), kind: 'partner', sub_id: SUB.id, links: [LINK], created_at: new Date(Date.now() - 20 * 864e5).toISOString(), expires_at: new Date(Date.now() + 10 * 864e5).toISOString(), last_seen_at: new Date(Date.now() - 864e5).toISOString(), revoked: false });
let PFAULT = '';                              // 'abort' | '502html' | 'once404'
const PCALLS = [];
async function portalCtx(){
  const ctx = await browser.newContext({ serviceWorkers: 'block', bypassCSP: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host !== 'portal.test') return r.abort('blockedbyclient');
    const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
    if (fm) {
      let a = ''; try { a = JSON.parse(rq.postData() || '{}').action; } catch (e) {}
      if (fm[1] !== 'portal-access') return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
      if (PFAULT === 'abort') { PCALLS.push(a + ':abort'); return r.abort('internetdisconnected'); }
      if (PFAULT === '502html') { PCALLS.push(a + ':502'); return r.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' }); }
      if (PFAULT === 'once404' && a === 'p-home') { PFAULT = ''; PCALLS.push(a + ':404'); return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'This link is not active — call GrayCo 901-585-0944' }) }); }
      const resp = await PA.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': '10.2.' + (NET++ % 250) + '.1' }, rq.headers()), body: rq.postData() || '' });
      PCALLS.push(a + ':' + resp.statusCode);
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    if (u.pathname === '/' || u.pathname === '/portal.html') {
      let html = fs.readFileSync(path.join(BUILD, 'portal.html'), 'utf8');
      if (PORTAL_V) html = html.replace(/portal-app\.js\?v=[^']+/, 'portal-app.js?v=' + PORTAL_V);
      return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    }
    const f = path.join(BUILD, decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    return r.fulfill({ status: 404, body: '' });
  });
  return ctx;
}
const pState = p => p.evaluate(() => {
  let s = ''; try { s = localStorage.getItem('gc_portal_s') || ''; } catch (e) {}
  const hello = document.getElementById('hello'), hi = document.getElementById('hi');
  return { inApp: !!hello && !hello.hidden && /Sam/.test(hi ? hi.textContent : '') && !document.getElementById('signinBox'), signin: !!document.getElementById('signinBox'),
    reconnect: !!document.getElementById('reconnectBox') || !!document.getElementById('pReconnect'), stored: s };
});
const waitP = (p, want, ms) => waitFor(async () => { const s = await pState(p).catch(() => null); return s && s[want] ? s : null; }, ms || 20000);
{
  const C = await portalCtx();
  const P = await newPage(C, 'https://portal.test/');
  await P.evaluate(([s]) => { localStorage.setItem('gc_portal_s', s); localStorage.setItem('gc_lang', 'en'); }, [SESSION]);
  await P.reload();
  let s = await waitP(P, 'inApp', 30000);
  ok('B1 a sub with a saved device session opens the portal signed in', !!s, await pState(P));
  await P.reload(); s = await waitP(P, 'inApp');
  const [N1, N2] = [await newPage(C), await newPage(C)];
  await Promise.all([N1.goto('https://portal.test/'), N2.goto('https://portal.test/')]);
  ok('B1 reload, a new tab, two tabs opened at once → all signed in', !!s && !!(await waitP(N1, 'inApp')) && !!(await waitP(N2, 'inApp')));
  await N1.close(); await N2.close();

  /* B4 server: the sub's session slides */
  const row = T.gc_portal_session.find(x => x.id === sha(SESSION));
  ok('B4 a sub\'s device session slides from each use: ran out in 10 days → now about a year from today', Date.parse(row.expires_at) > Date.now() + 360 * 864e5, row.expires_at);
  {
    resetPA();
    const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.test', 'x-portal-token': LINK, 'x-nf-client-connection-ip': '10.3.0.1' }, body: JSON.stringify({ action: 'open' }) });
    const d = JSON.parse(r.body), nr = d.session && T.gc_portal_session.find(x => x.id === sha(d.session));
    ok('B4 a new sub sign-in (their link) lasts a year, not 30 days', r.statusCode === 200 && nr && Date.parse(nr.expires_at) > Date.now() + 360 * 864e5, { st: r.statusCode, nr });
  }

  /* B2 hiccups at start */
  for (const [mode, label] of [['502html', 'a 502 page from the host'], ['abort', 'no signal']]) {
    PFAULT = mode; await P.reload();
    s = await waitP(P, 'reconnect');
    ok('B2 ' + label + ' at start → "Reconnecting…", still signed in (gc_portal_s kept)', s && s.stored === SESSION && !s.signin, { s, calls: PCALLS.slice(-3) });
    if (mode === '502html') await shot(P, 'subsess_b2_portal_reconnecting');
    PFAULT = '';
    if (mode === 'abort') await P.evaluate(() => window.dispatchEvent(new Event('online'))); else await P.click('#rcNow', { timeout: 5000 }).catch(() => {});
    s = await waitP(P, 'inApp');
    ok('B2 … back (' + (mode === 'abort' ? 'online again, by itself' : 'Try again now') + ') → signed in, no code, no password', !!s, await pState(P));
  }
  {
    FAULT.table = 'gc_portal_session'; resetPA(); await P.reload();
    s = await waitP(P, 'reconnect');
    ok('B2 the database hiccups (5xx) → "Reconnecting…", gc_portal_s kept (was: cleared → sign-in screen)', s && s.stored === SESSION, s);
    FAULT.table = ''; await P.click('#rcNow', { timeout: 5000 }).catch(() => {}); ok('B2 … database back → signed in', !!(await waitP(P, 'inApp')));
  }

  /* B3 one stray "not active" */
  PFAULT = 'once404'; await P.reload();
  await sleep(800);
  s = await waitP(P, 'inApp');
  ok('B3 one stray "not active" on p-home → checked again (whoami) and retried → still signed in', s && s.stored === SESSION && PCALLS.some(x => x === 'p-home:404'), { s, calls: PCALLS.slice(-6) });
  PFAULT = '';

  /* B5 server: half-read CRM records / a bid-only sub with a database hiccup → 503, not 404 "not active" */
  {
    const keep = KV.vendors;
    KV.vendors = [{ id: 'SUBother', name: 'Other', isSub: true }]; KV.vendors__manifest = { chunked: true, count: 2 }; KVAT.vendors__manifest = 'T9'; KVAT.vendors = 'T1';
    KV.vendors__chunk0 = [{ id: 'SUBother', name: 'Other', isSub: true }];   /* chunk1 (with our sub) is not there yet: a save in progress */
    resetPA();
    const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.test', 'x-portal-session': SESSION, 'x-nf-client-connection-ip': '10.3.0.2' }, body: JSON.stringify({ action: 'p-home' }) });
    ok('B5 the CRM records half-read (a chunk missing) and the sub not in them → 503 "try again", not 404 "not active"', r.statusCode === 503, { st: r.statusCode, body: r.body.slice(0, 120) });
    FAULT.chunks = true; resetPA();
    const r2 = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.test', 'x-portal-session': SESSION, 'x-nf-client-connection-ip': '10.3.0.3' }, body: JSON.stringify({ action: 'p-home' }) });
    ok('B5 the chunk read fails (5xx) → 503, not 404', r2.statusCode === 503, r2.statusCode);
    FAULT.chunks = false; KV.vendors = keep; delete KV.vendors__manifest; delete KV.vendors__chunk0; resetPA();
    const BID = 'SBPbidonlysampletest', BS = 'B'.repeat(43), BL = 'C'.repeat(43);
    T.sp_rows.push(spRow('users', 'u_bo', { id: 'u_bo', role: 'sub', approved: true, email: 'bidonly@sample.test', name: 'Bea Bidonly', company: 'Bid Only Sample LLC', trades: ['Paint'] }, { email: 'bidonly@sample.test' }));
    T.gc_sub_link.push({ token: BL, sub_id: BID, revoked: false, created_at: now() });
    T.gc_portal_session.push({ id: sha(BS), kind: 'partner', sub_id: BID, links: [BL], created_at: now(), expires_at: new Date(Date.now() + 864e5).toISOString(), revoked: false });
    const r3 = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.test', 'x-portal-session': BS, 'x-nf-client-connection-ip': '10.3.0.4' }, body: JSON.stringify({ action: 'p-home' }) });
    FAULT.table = 'sp_rows'; resetPA();
    const r4 = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.test', 'x-portal-session': BS, 'x-nf-client-connection-ip': '10.3.0.5' }, body: JSON.stringify({ action: 'p-home' }) });
    FAULT.table = '';
    ok('B5 a bid-only sub (approved on the bid site) opens the portal; a database hiccup reading their profile → 503, not 404 "not active"', r3.statusCode === 200 && r4.statusCode >= 500, { ok: r3.statusCode, hiccup: r4.statusCode });
    T.sp_rows.pop(); resetPA();
  }

  /* B6 a new version */
  PORTAL_V = '33.999-newversion'; await P.reload(); s = await waitP(P, 'inApp');
  const appSrc = await P.evaluate(() => [...document.scripts].map(x => x.src).find(x => /portal-app\.js/.test(x)) || '');
  ok('B6 a new version (portal-app.js ?v= changed) → still signed in', !!s && /33\.999-newversion/.test(appSrc), appSrc);
  PORTAL_V = '';
  const sw = fs.readFileSync(path.join(BUILD, 'portal-sw.js'), 'utf8');
  ok('B6 the portal\'s service worker never touches the sign-in (no storage, no forced reload) and never caches /.netlify/ calls', !/localStorage|indexedDB|\.navigate\(\s*\)|location\.reload|clients\.claim\(\)[^;]*reload/.test(sw.replace(/\/\*[\s\S]*?\*\//g, '')) && /\/\.netlify\//.test(sw));

  /* B7 the office turns the link off → signed out; Sign out → signed out + revoked */
  T.gc_sub_link.find(x => x.token === LINK).revoked = true; resetPA();
  await P.reload(); s = await waitP(P, 'signin', 20000);
  ok('B7 the office turned the sub\'s link off → signed out (sign-in screen, gc_portal_s removed) — security unchanged', s && !s.stored, s);
  T.gc_sub_link.find(x => x.token === LINK).revoked = false; resetPA();
  await P.evaluate(([x]) => localStorage.setItem('gc_portal_s', x), [SESSION]); await P.reload(); await waitP(P, 'inApp');
  await P.click('#signOut');
  s = await waitP(P, 'signin', 15000);
  ok('B7 Sign out → the sign-in screen, gc_portal_s removed, the session ended on the server', s && !s.stored && T.gc_portal_session.find(x => x.id === sha(SESSION)).revoked === true, s);
  await P.reload(); ok('B7 … and it stays signed out after a reload', !!(await waitP(P, 'signin', 15000)));
  await C.close();
}

await browser.close();
ok('no page errors', errs.length === 0, errs.slice(0, 5));
const n = R.filter(Boolean).length;
console.log('\n' + n + '/' + R.length + ' passed');
process.exit(n === R.length ? 0 : 1);
