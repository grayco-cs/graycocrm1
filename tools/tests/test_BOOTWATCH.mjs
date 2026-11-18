// test_BOOTWATCH.mjs <build-dir> [only] — patch BOOTWATCH in the CRM page (harness_N: made-up people and data, nothing leaves the
// machine). The bootwatch function is the REAL netlify/functions/bootwatch.js, run here, writing to the harness's in-memory
// gc_kv (the "cloud" mirror) — never to the live database.
//   1 phone, signed out: the sign-in screen is recorded (sent by a beacon when the page is left; no e-mail)
//   2 phone, a wrong password: the error text is recorded, the e-mail only as domain + hash, never the password; then the right
//     password: signed in → the signed-in e-mail is recorded (from the sign-in token)
//   3 old build (version.txt newer) served by a service worker: "A newer version is ready — Tap to update" over the sign-in
//     screen; the tap removes the old worker (never /crm-push-sw.js) and reloads EXACTLY once; no second banner / reload within
//     10 min; the CRM's own "Yes, update" bar (signed in, fresh page) goes through the same one update
//   4 desk, a normal signed-in open: the daily heartbeat (with the e-mail) and NOTHING else; the next open sends nothing
//   5 stuck: React never arrives → "no first screen in 20 s" sent, with the failed script and what was on screen
//   6 weak LTE phone (CPU ×4, ~6.8 MB at ~380 KB/s): signs in the moment the sign-in box shows → "Opening GrayCo Field…" with a
//     progress bar in between (never a blank page) → GrayCo Field opens; the load milestones (ttfb, dl, html, load, ready) are kept;
//     6b: so weak it is not ready 45 s after signing in → "Still loading — weak signal? Tap to retry" + a stuck report
//   7 cost: the early script on a phone with CPU ×4 (the page with / without it, and its own timing)
// Run: flock <browser.lock> node tools/tests/test_BOOTWATCH.mjs <abs build dir> [1,2,…]
import path from 'path'; import fs from 'fs'; import http from 'http'; import zlib from 'zlib'; import crypto from 'crypto';
import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, cset, cget, resetCloud, ACCOUNTS, waitFor, cloud } = H;
const build = path.resolve(process.argv[2] || '.');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null; const want = n => !ONLY || ONLY.includes(String(n));
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
/* the harness's made-up sign-in accounts (password "pw") */
const byId = id => Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley'), PM = byId('u-sbiffle'), PM_LOCAL = PM.split('@')[0], PM_DOM = PM.split('@')[1];
const BAD_PW = 'Wr0ngPass!x7';

/* ── the real bootwatch function, its database = the harness's gc_kv mirror ── */
process.env.SUPABASE_URL = 'https://mirror.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'svc-mirror'; process.env.SUPABASE_ANON_KEY = 'anon-mirror';
process.env.SITE_ORIGIN = 'http://app.local';
const idOf = t => { const m = /^utok-(u-[a-z0-9]+)-\d+$/.exec(String(t || '').replace(/^Bearer\s+/i, '')); return m ? byId(m[1]) || '' : ''; };
globalThis.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), h = init.headers || {}, m = init.method || 'GET';
  const res = (st, body, hd) => ({ ok: st >= 200 && st < 300, status: st, headers: { get: k => (hd || {})[k.toLowerCase()] || null }, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.host !== 'mirror.supabase.co') throw new Error('test: no network (' + u.host + ')');
  if (u.pathname === '/auth/v1/user') { const e = idOf(h.Authorization); return e ? res(200, { email: e }) : res(401, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (h.apikey !== 'svc-mirror') return res(401, {});
    if (m === 'HEAD') return res(200, null, { 'content-range': '*/' + [...cloud.keys()].filter(k => k.startsWith('gc_bootrep_')).length });
    if (m === 'POST') { const r = JSON.parse(init.body); cset(r.key, r.value); return res(201, null); }
    const k = decodeURIComponent((u.searchParams.get('key') || '').replace(/^eq\./, '')); const v = cget(k);
    return res(200, v === undefined ? [] : [{ value: v, updated_at: new Date().toISOString() }]);
  }
  return res(404, {});
};
const FN = require(path.join(build, 'netlify/functions/bootwatch.js'));
const CAP = [];   /* every call the pages made to bootwatch */
async function runFn(method, headers, body){
  const r = await FN.handler({ httpMethod: method, headers, body, isBase64Encoded: false });
  let j = null; try { j = JSON.parse(r.body); } catch (e) {}
  CAP.push({ at: Date.now(), headers, body, status: r.statusCode, j, json: (() => { try { return JSON.parse(body); } catch (e) { return null; } })() });
  return r;
}
let VER = '', BLOCK_REACT = false;
/* every new page: bootwatch → the real function; version.txt → VER when set; React → blocked when BLOCK_REACT */
async function bwRoute(route){
  const rq = route.request(); const r = await runFn(rq.method(), rq.headers(), rq.postData() || '');
  return route.fulfill({ status: r.statusCode, headers: r.headers, body: r.body });
}
const W0 = await computer('warm', { build }); const CtxP = Object.getPrototypeOf(W0.ctx); await W0.close();
const newPage0 = CtxP.newPage;
CtxP.newPage = async function(){
  await this.route(/\/\.netlify\/functions\/bootwatch(\?|$)/, bwRoute);
  await this.route(/\/version\.txt(\?|$)/, r => VER ? r.fulfill({ status: 200, contentType: 'text/plain', body: VER + '\n' }) : r.fallback());
  await this.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/react/, r => BLOCK_REACT ? r.abort('connectionfailed') : r.fallback());
  return newPage0.apply(this, arguments);
};
const IPHONE = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'); d(Navigator.prototype, 'maxTouchPoints', 5);
  d(Navigator.prototype, 'standalone', true); })()`;
/* an old service worker serving the page + the phone-notifications one */
const OLDSW = `(() => { const log = k => { try { const a = JSON.parse(sessionStorage.getItem('__unreg') || '[]'); a.push(k); sessionStorage.setItem('__unreg', JSON.stringify(a)); } catch (e) {} };
  const reg = u => ({ active: { scriptURL: location.origin + u }, unregister: () => { log(u); return Promise.resolve(true); } });
  const sw = { controller: { scriptURL: location.origin + '/sw-old.js' }, getRegistrations: () => Promise.resolve([reg('/sw-old.js'), reg('/crm-push-sw.js')]), getRegistration: () => Promise.resolve(undefined),
    register: () => Promise.resolve(reg('/crm-push-sw.js')), ready: new Promise(() => {}), addEventListener(){} };
  try { Object.defineProperty(Navigator.prototype, 'serviceWorker', { get: () => sw, configurable: true }); } catch (e) {} })()`;
const fnv = t => { let h1 = 0x811c9dc5, h2 = 0x1b873593; for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822507) >>> 0; } return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0').slice(-4); };
const dev = A => A.ev(() => localStorage.getItem('gc_adm_device_id'));
const rowOf = d => cget('gc_bootrep_' + d);
const capsFor = d => CAP.filter(c => c.json && c.json.dev === d);
async function until(fn, ms){ const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(250); } return fn(); }
/* the person leaves: the phone app goes to the background (visibilitychange → hidden), then the page is closed (pagehide).
   (A real navigation away is not used: requests a page makes while it unloads never reach the test's request handler.) */
const leave = A => A.ev(() => { try { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); } catch (e) {}
  document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })); }).catch(() => {});
const T00 = Date.now();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Demo', email: ADMIN, role: 'Admin', payType: 'owner', active: true }, { id: 'u4', name: 'Demo Estimator', email: PM, role: 'Project Manager', active: true }]);
cset('projects', [{ id: 'P1', name: 'Sample Deck', client: 'Sample Client', address: '100 Sample St', status: 'active', pm: 'Demo Estimator', createdAt: new Date().toISOString() }]);

if (want(1)) {
  console.log('1 · a phone, signed out: the sign-in screen is recorded');
  const A = await computer('phone1', { build, mobile: true, init: [IPHONE] });
  ok(!!(await waitFor(A, () => { const g = document.getElementById('gc-auth-email'); return g && g.getClientRects().length; }, null, 30000)), 'the sign-in screen shows');
  const d = await dev(A); await sleep(2500);
  ok(capsFor(d).length === 0, 'nothing is sent while the sign-in screen just sits there', capsFor(d).map(x => x.json.boot));
  await leave(A);
  const c = await until(() => capsFor(d)[0], 8000);
  ok(c && c.status === 200 && !c.headers.authorization, 'leaving the sign-in screen without getting in: one beacon, no sign-in token', c && { st: c.status, j: c.j });
  const v = rowOf(d), b = v && v.boots && v.boots[0];
  ok(b && b.m.gate > 0 && b.m.html > 0 && b.p && b.p.gate && b.kind === 'phone' && b.sa === true && !v.email, 'gc_bootrep_<device>: the sign-in screen (gate), page read, a phone, the home-screen app, no e-mail', b);
  ok(b && /33\.\d+-/.test(b.build) && b.on === undefined, 'the build and online are recorded', b && { build: b.build, on: b.on });
  await A.close();
}

if (want(2)) {
  console.log('2 · a phone, a wrong password, then the right one');
  const A = await computer('phone2', { build, mobile: true, init: [IPHONE] }); const p = A.page();
  await p.waitForSelector('#gc-auth-email', { timeout: 30000 }); const d = await dev(A);
  await p.fill('#gc-auth-email', PM); await p.fill('#gc-auth-password', BAD_PW); await p.click('#gc-auth-submit');
  const c = await until(() => capsFor(d).find(x => x.json.boot.m && x.json.boot.m.err), 12000);
  ok(!!c, 'the failed sign-in is sent at once (no need to leave the page)', capsFor(d).map(x => x.json.boot.m));
  const raw = CAP.map(x => x.body).join('\n');
  ok(!raw.includes(BAD_PW) && !raw.includes('Wr0ng') && !raw.includes(PM_LOCAL), 'the password and the e-mail address are in no request');
  const b = ((rowOf(d) || {}).boots || [])[0], si = b && b.si && b.si[0];
  ok(si && si.dom === PM_DOM && si.h === fnv(PM) && /do not match/.test(si.err || '') && /do not match/.test(b.m.errV || ''), 'stored: the e-mail domain + its hash, the error text the person saw', b);
  ok(b && b.p.signin && !JSON.stringify(rowOf(d)).includes(BAD_PW), 'marked as a failed sign-in; the password is not stored');
  await p.fill('#gc-auth-password', 'pw'); await p.click('#gc-auth-submit');
  const okd = await until(() => { const v = rowOf(d); return v && v.email === PM && v; }, 60000);
  ok(!!okd, 'signed in: the device\'s signed-in e-mail is recorded (from the sign-in token, checked)', rowOf(d) && { email: !!rowOf(d).email, boots: rowOf(d).boots.map(x => x.m) });
  if (!okd) console.log('    page now: ' + JSON.stringify(await A.ev(() => ({ url: location.href, bw: window._gcBootWatch && window._gcBootWatch.state(), ls: { last: localStorage.getItem('gc_bw_last'), hb: localStorage.getItem('gc_bw_hb'), pend: !!localStorage.getItem('gc_bw_pend') }, gate: !!document.getElementById('gc-auth-email'), field: document.documentElement.className })).catch(e => String(e))).slice(0, 1500));
  const withTok = capsFor(d).filter(x => x.headers.authorization);
  ok(withTok.length >= 1 && withTok.every(x => !x.body.includes(PM_LOCAL)), 'the signed-in send carries the token (the body never the e-mail)');
  const bs = (rowOf(d) || { boots: [] }).boots, first = bs.find(x => x.si && x.si.length);
  ok(first && first.si.some(x => x.err) && bs.some(x => x.m && x.m.signed >= 0 && x.m.paint > 0 && /field/.test(x.m.paintV || '')), 'the failed try, then an open that is signed in with GrayCo Field on screen', bs.map(x => ({ m: x.m, si: x.si })));
  ok(capsFor(d).every(x => x.status === 200), 'no send was refused by the rate limit (the page keeps to it)', capsFor(d).map(x => x.status));
  await A.close();
}

if (want(3)) {
  console.log('3 · an old build served by a service worker: Tap to update — exactly one reload');
  VER = '33.999-2026-12-31-r99z';
  const A = await computer('phone3', { build, mobile: true, init: [IPHONE, OLDSW] }); const p = A.page();
  let navs = 0; p.on('domcontentloaded', () => { navs++; });   /* a new document (framenavigated also counts same-page address changes) */
  ok(!!(await waitFor(A, () => { const b = document.getElementById('gc-bw-update'); return b && b.getClientRects().length && document.getElementById('gc-auth-email'); }, null, 30000)), 'the banner shows (with the sign-in screen up)');
  const top = await A.ev(() => { const b = document.getElementById('gc-bw-update').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { txt: document.getElementById('gc-bw-update').textContent, onTop: !!(e && e.closest('#gc-bw-update')) }; });
  ok(top.onTop && /A newer version is ready — Tap to update/.test(top.txt), 'it reads "A newer version is ready — Tap to update" and is on top of the sign-in screen', top);
  const d = await dev(A);
  const st0 = await A.ev(() => window._gcBootWatch.state().boot.old);
  ok(st0 && st0.src === 'sw' && st0.live === VER, 'recorded: old build, served by a service worker', st0);
  const n0 = navs; await p.locator('#gc-bw-update-btn').click();
  await sleep(12000);
  ok(navs - n0 === 1, 'the tap reloads exactly once', { navs: navs - n0 });
  const after = await A.ev(() => ({ unreg: JSON.parse(sessionStorage.getItem('__unreg') || '[]'), banner: !!document.getElementById('gc-bw-update'), old: window._gcBootWatch.state().boot.old }));
  ok(after.unreg.includes('/sw-old.js') && !after.unreg.includes('/crm-push-sw.js'), 'the old service worker is removed; the phone-notifications one is kept', after.unreg);
  ok(!after.banner && after.old && /after Tap to update/.test(after.old.afterUpdate || ''), 'still old after the update: no second banner, noted for the report', after);
  const r2 = await A.ev(() => window._gcBootWatch.update()); await sleep(4000);
  ok(r2 === false && navs - n0 === 1, 'asking again within 10 minutes: no reload (never a loop)', { r2, navs: navs - n0 });
  const sent = await until(() => ((rowOf(d) || {}).boots || []).find(x => x.old && x.old.afterUpdate), 40000);
  ok(!!sent && rowOf(d).boots.some(x => x.heal >= 0), 'both opens reach the report (the tap, and "still old after the update")', rowOf(d) && rowOf(d).boots.map(x => ({ old: x.old, heal: x.heal })));
  await A.close();
  /* the CRM's own update bar (signed in, a fresh page from the network) uses the same update */
  /* who reloads: every location.reload() call is written down with its stack (for the report) */
  const RLOG = `(() => { try { const L = window.location, r = L.reload.bind(L); Object.defineProperty(L, 'reload', { configurable: true, value: function(){ try { const a = JSON.parse(sessionStorage.getItem('__rl') || '[]'); a.push(String(new Error().stack).split('\\n').slice(1, 6).join(' | ').slice(0, 600)); sessionStorage.setItem('__rl', JSON.stringify(a)); } catch (e) {} return r(); } }); } catch (e) {} })()`;
  const B = await computer('desk3', { build, init: [RLOG] }); const pb = B.page();
  await signIn(B, ADMIN, 30000);
  let nb = 0; pb.on('domcontentloaded', () => { nb++; });
  ok(!!(await waitFor(B, () => !!document.getElementById('gc-update-now'), null, 20000)), 'signed in, fresh page: the CRM\'s own "Yes, update" bar shows');
  ok(await B.ev(() => !document.getElementById('gc-bw-update')), 'only one update bar on screen');
  const navT = () => B.ev(() => { const a = JSON.parse(sessionStorage.getItem('__navs') || '[]'); const k = (performance.getEntriesByType('navigation')[0] || {}).type + ' @' + Math.round(performance.timeOrigin); if (a.indexOf(k) < 0) a.push(k); sessionStorage.setItem('__navs', JSON.stringify(a)); return a; }).catch(() => []);
  await navT(); pb.on('load', () => { navT(); });
  await pb.locator('#gc-update-now').click(); await sleep(9000);
  const heal = await B.ev(() => +localStorage.getItem('gc_bw_heal_at') || 0), again = await B.ev(() => window._gcBootWatch.update());
  const nl = await navT();
  const rl = await B.ev(() => JSON.parse(sessionStorage.getItem('__rl') || '[]')).catch(() => []);
  console.log('    reload calls: ' + JSON.stringify(rl).slice(0, 2500));
  ok(nb >= 1 && heal > 0 && again === false, '"Yes, update" goes through the same update (remembered for the 10-minute rule; asking again does nothing)', { nb, nl });
  ok(nl.length === 2 && /^reload/.test(nl[1]), 'the update reloads the page once (one new page after the tap)', { nl, nb });
  await B.close(); VER = '';
}

if (want(4) || want(5)) {
  console.log('4 · a desk computer, a normal signed-in open: only the daily heartbeat');
  const A = await computer('desk4', { build });
  ok(await signIn(A, ADMIN, 30000), 'signed in');
  const d = await dev(A);
  const hb = await until(() => capsFor(d).find(x => x.json.boot.hb && x.json.boot.m.paint), 20000);
  ok(hb && hb.headers.authorization && hb.status === 200 && rowOf(d).email === ADMIN, 'the first open of the day: one heartbeat, signed in (the e-mail recorded)', hb && hb.json.boot.m);
  ok(hb && /^desk /.test(hb.json.boot.m.paintV || ''), 'the first screen: the Desk and its view', hb && hb.json.boot.m.paintV);
  const other = capsFor(d).filter(x => !x.json.boot.hb);
  ok(other.length === 0, 'nothing else was sent for that open', other.map(x => ({ p: x.json.boot.p, errs: x.json.boot.errs })));
  const n0 = capsFor(d).length;
  await A.goto(); await waitFor(A, () => window._gcBootWatch && window._gcBootWatch.state().boot.m.paint, null, 30000); await sleep(8000); await leave(A); await sleep(2000);
  ok(capsFor(d).length === n0, 'the next open (heartbeat already sent today): nothing at all, not even when the page is left', capsFor(d).slice(n0).map(x => x.json.boot));
  if (want(5)) {
    console.log('5 · stuck: React never arrives');
    /* the app never draws (as when its code fails): #root is kept empty */
    await A.page().addInitScript(() => { new MutationObserver(() => { const r = document.getElementById('root'); if (r && r.firstChild) r.textContent = ''; }).observe(document, { childList: true, subtree: true }); });
    BLOCK_REACT = true; await A.goto();
    const c = await until(() => capsFor(d).slice(n0).find(x => (x.json.boot.stuck || []).length), 60000);
    const b = c && c.json.boot;
    if (!b) console.log('    sent: ' + JSON.stringify(capsFor(d).slice(n0).map(x => ({ st: x.status, j: x.j, b: x.json.boot }))).slice(0, 1500) + '\n    page: ' + JSON.stringify(await A.ev(() => ({ bw: window._gcBootWatch && window._gcBootWatch.state(), cls: document.documentElement.className, last: localStorage.getItem('gc_bw_last') })).catch(e => String(e))).slice(0, 1500));
    ok(b && b.stuck[0].k === 'screen' && /no first screen/.test(b.stuck[0].why), 'no first screen in 20 s: sent as stuck', b && b.stuck);
    ok(b && /blank|spinner|progress/.test(b.stuck[0].why), 'with what was on screen', b && b.stuck[0].why);
    ok(b && (b.errs || []).some(e => /load script .*react/.test(e.m)), 'and the script that failed to load', b && b.errs);
    ok(b && b.m.signed >= 0 && b.m.paint === undefined, 'signed in (a saved sign-in), never painted', b && b.m);
    BLOCK_REACT = false;
  }
  await A.close();
}

/* ── a phone on a weak signal: the page arrives from a local server, gzip, throttled, with an ETag (like Netlify) ── */
function slowServer(rateKBs){
  const html = fs.readFileSync(path.join(build, 'index.html')); const gz = zlib.gzipSync(html, { level: 6 }); const etag = '"' + crypto.createHash('md5').update(html).digest('hex') + '"';
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/.netlify/functions/bootwatch')) { let b = ''; req.on('data', c => b += c); req.on('end', async () => { const r = await runFn(req.method, req.headers, b); res.writeHead(r.statusCode, r.headers); res.end(r.body); }); return; }
    if (u.pathname.startsWith('/.netlify/functions/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, configured: false, items: [], rows: [], list: [], leads: [], data: null })); }
    if (u.pathname === '/' || u.pathname === '/index.html') {
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag, 'cache-control': 'no-cache' }); return res.end(); }
      const body = srv.variant ? zlib.gzipSync(srv.variant, { level: 1 }) : gz;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip', 'content-length': body.length, etag: srv.variant ? '"v' + Date.now() + '"' : etag, 'cache-control': 'no-cache' });
      if (!rateKBs) return res.end(body);
      const CH = 16384, gap = CH / (rateKBs * 1024) * 1000, t0 = Date.now(); let i = 0; srv.sent = 0;
      while (i < body.length) { if (res.destroyed) return; res.write(body.subarray(i, i + CH)); i += CH; srv.sent = i; const w = t0 + (i / CH) * gap - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w)); }
      return res.end();
    }
    const f = path.join(build, decodeURIComponent(u.pathname));
    if (f.startsWith(build) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'cache-control': 'no-cache' }); return fs.createReadStream(f).pipe(res); }
    res.writeHead(404); res.end();
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => { srv.host = '127.0.0.1:' + srv.address().port; srv.gzBytes = gz.length;
    process.env.SITE_ORIGIN += ',http://' + srv.host;   /* the function accepts calls from this test site */ r(srv); }));
}
async function localPhone(name, srv){
  const A = await computer(name, { build, mobile: true, init: [IPHONE] });
  await A.ctx.route(u => u.host === srv.host, r => r.continue());   /* this context also lets the local server through */
  const cdp = await A.ctx.newCDPSession(A.page()); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  A.cdp = cdp; return A;
}

if (want(6)) {
  console.log('6 · a phone on weak LTE (CPU ×4) signs in the moment the sign-in box shows');
  const srv = await slowServer(380); console.log('    page: ' + (srv.gzBytes / 1048576).toFixed(1) + ' MB gzip at 380 KB/s');
  const A = await localPhone('phone6', srv); const p = A.page();
  const t0 = Date.now(); p.goto('http://' + srv.host + '/', { waitUntil: 'commit', timeout: 180000 }).catch(() => {});
  await p.waitForSelector('#gc-auth-email', { state: 'visible', timeout: 60000 }).catch(() => {});
  const tGate = Date.now() - t0, sentAtGate = srv.sent;
  ok(tGate < 15000, 'the sign-in box shows early (' + (tGate / 1000).toFixed(1) + ' s, ' + Math.round(sentAtGate / srv.gzBytes * 100) + '% of the page arrived)');
  await p.fill('#gc-auth-email', PM); await p.fill('#gc-auth-password', 'pw'); await p.click('#gc-auth-submit');
  const tSign = Date.now() - t0;
  const S = []; let field = false, lastBlank = 0, blankRun = 0, maxBlank = 0;
  while (Date.now() - t0 < 170000) {
    const st = await p.evaluate(() => { try {
      const vis = id => { const e = document.getElementById(id); return !!(e && e.getClientRects().length); };
      const H = document.documentElement, root = document.getElementById('root'), bar = document.getElementById('gc-bw-op-bar');
      return { gate: vis('gc-auth-email'), cover: vis('gc-bw-opening'), bar: bar ? parseFloat(bar.style.width) : null, sub: (document.getElementById('gc-bw-op-s') || {}).textContent || '',
        title: (document.getElementById('gc-bw-op-t') || {}).textContent || '', splash: H.classList.contains('gc-boot-field') && vis('gc-fb-splash'), bootCover: vis('gc-boot-cover'),
        field: H.classList.contains('_fieldmode') && !!(document.querySelector('#_gcJobPick.gc-fh') || document.getElementById('_gcJobDash') || document.getElementById('_gcFieldHomeOv')),
        applogin: H.classList.contains('gc-applogin'), rootTxt: root ? (root.textContent || '').trim().length : -1, rs: document.readyState };
    } catch (e) { return null; } }).catch(() => null);
    const t = Date.now() - t0;
    if (st) {
      S.push(Object.assign({ t }, st));
      const blank = !st.gate && !st.cover && !st.splash && !st.bootCover && !st.field && st.rootTxt < 20;
      if (blank) { blankRun = lastBlank ? blankRun + (t - lastBlank) : 0; lastBlank = t; maxBlank = Math.max(maxBlank, blankRun); } else { lastBlank = 0; blankRun = 0; }
      if (st.field) { field = true; break; }
    }
    await sleep(250);
  }
  const tField = Date.now() - t0, covers = S.filter(x => x.cover);
  ok(field, 'GrayCo Field opens (' + (tField / 1000).toFixed(1) + ' s after the start; signed in at ' + (tSign / 1000).toFixed(1) + ' s)', S.slice(-3));
  ok(covers.length > 0 && /Opening GrayCo Field/.test(covers[0].title), 'between: the full-screen "Opening GrayCo Field…" with a progress bar (' + (covers.length ? ((covers[covers.length - 1].t - covers[0].t) / 1000).toFixed(1) + ' s' : '-') + ')', covers.slice(0, 2));
  const bars = covers.map(x => x.bar).filter(x => x != null);
  ok(bars.length > 2 && bars[bars.length - 1] > bars[0] && bars.every((x, i) => i === 0 || x >= bars[i - 1] - 0.01), 'the bar moves forward (' + bars[0] + '% → ' + bars[bars.length - 1] + '%)', bars.slice(0, 40));
  ok(covers.some(x => /Downloading the app — \d+%/.test(x.sub)), 'it says what it is doing', [...new Set(covers.map(x => x.sub.replace(/\d+/g, '#')))]);
  ok(maxBlank <= 1200, 'never a blank screen for more than a moment (' + maxBlank + ' ms at most)', S.filter(x => !x.gate && !x.cover && !x.splash && !x.field && !x.bootCover).slice(0, 5));
  ok(!S.some(x => /Still loading/.test(x.title)), 'no "Still loading" (it opened within 45 s of signing in)');
  console.log('    screens: ' + S.filter((x, i) => i === 0 || ['gate', 'cover', 'splash', 'field', 'applogin', 'rs'].some(k => x[k] !== S[i - 1][k])).map(x => (x.t / 1000).toFixed(1) + 's ' + ['gate', 'cover', 'splash', 'bootCover', 'applogin', 'field'].filter(k => x[k]).join('+') + ' ' + x.rs).join(' | '));
  const d = await dev(A);
  /* the reopened open's daily heartbeat goes once its page is in (it carries the load times), 30 s after the last send at the soonest */
  await until(() => ((rowOf(d) || {}).boots || []).some(x => x.m && x.m.load > 0 && x.m.paint > 0), 60000);
  const all = ((rowOf(d) || {}).boots || []);
  const early = all.find(x => x.m && x.m.cover != null), timed = all.find(x => x.m && x.m.dl > x.m.ttfb && x.m.html > 0 && x.m.load >= x.m.html);
  ok(early && early.m.try > 0 && early.m.signed >= early.m.try && early.p && early.p.opening, 'the open signed in early is reported: the sign-in and when the progress screen showed', all.map(x => ({ m: x.m, p: x.p })));
  ok(!!timed, 'the report has the real load times (first byte, downloaded, read, load event)', all.map(x => x.m));
  ok(all.some(x => x.m && x.m.ready > 0) && all.some(x => x.m && x.m.paint > 0 && /field/.test(x.m.paintV || '')), 'app ready and the first screen (Field) are recorded', all.map(x => x.m));
  await A.close(); srv.close();
}
if (want('6b')) {
  console.log('6b · a signal so weak it is not ready 45 s after signing in');
  const srv2 = await slowServer(40);   /* slow enough that the page is not in (nor the reopen as the person) by 45 s */ const B = await localPhone('phone6b', srv2); const pb = B.page();
  const u0 = Date.now(); pb.goto('http://' + srv2.host + '/', { waitUntil: 'commit', timeout: 300000 }).catch(() => {});
  await pb.waitForSelector('#gc-auth-email', { state: 'visible', timeout: 90000 }).catch(() => {});
  await pb.fill('#gc-auth-email', PM); await pb.fill('#gc-auth-password', 'pw'); await pb.click('#gc-auth-submit');
  const T6 = []; let slow = null; const s0 = Date.now();
  while (Date.now() - s0 < 90000 && !slow) {
    const st = await pb.evaluate(() => { const t = document.getElementById('gc-bw-op-t'), c = document.getElementById('gc-bw-opening'), H = document.documentElement, bw = window._gcBootWatch && window._gcBootWatch.state();
      return { slow: t && c && /Still loading — weak signal\?/.test(t.textContent) && /Tap to retry/.test(c.textContent) ? c.textContent : null, cover: !!c, title: t ? t.textContent : '', gate: !!document.getElementById('gc-auth-email'),
        cls: H.className.slice(0, 80), rs: document.readyState, m: bw && bw.boot.m, auth: !!(window.__GC_AUTH__ && window.__GC_AUTH__.email()) }; }).catch(e => ({ err: String(e).slice(0, 80) }));
    slow = st.slow; T6.push(Object.assign({ t: Date.now() - u0 }, st)); await sleep(1000);
  }
  if (!slow) console.log('    6b screens: ' + T6.filter((x, i) => i === 0 || JSON.stringify([x.cover, x.gate, x.cls, x.rs, x.title, x.auth]) !== JSON.stringify([T6[i - 1].cover, T6[i - 1].gate, T6[i - 1].cls, T6[i - 1].rs, T6[i - 1].title, T6[i - 1].auth])).map(x => (x.t / 1000).toFixed(0) + 's ' + JSON.stringify(x)).join('\n      ').slice(0, 3000));
  ok(!!slow, '45 s after signing in: "Still loading — weak signal? Tap to retry" (' + ((Date.now() - u0) / 1000).toFixed(0) + ' s)', slow);
  const d2 = await dev(B);
  const rep = await until(() => capsFor(d2).find(x => (x.json.boot.stuck || []).some(s => s.k === 'slow')), 40000);
  ok(!!rep, 'and a stuck report is sent', capsFor(d2).map(x => x.json.boot.stuck));
  /* on this signal the new page takes minutes to be read: count the page being asked for again */
  let nv = 0; pb.on('request', r => { if (r.isNavigationRequest() && r.frame() === pb.mainFrame()) nv++; });
  await pb.locator('#gc-bw-opening').click({ timeout: 10000 }).catch(e => console.log('    click: ' + String(e).slice(0, 200))); await sleep(4000);
  ok(nv === 1, 'Tap to retry reloads the page', { nv });
  await B.close(); srv2.close();
}

if (want(7)) {
  console.log('7 · cost on a phone, CPU ×4');
  const srv = await slowServer(0);
  const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
  const a = html.indexOf('<script id="gc-patch-bootwatch">'), b = html.indexOf('</script>', a) + 9;
  const variant = keep => html.slice(0, a) + '<script>performance.mark("bw0")</script>' + (keep ? html.slice(a, b) : '') + '<script>performance.mark("bw1")</script>' + html.slice(b);
  const runs = { on: [], off: [], self: [] };
  for (let i = 0; i < 10; i++) {
    const keep = i % 2 === 0; srv.variant = variant(keep);
    const A = await localPhone('cost' + i, srv); const p = A.page();
    await p.goto('http://' + srv.host + '/', { waitUntil: 'load', timeout: 180000 }); await sleep(2500);
    const m = await p.evaluate(() => { const x = performance.getEntriesByName('bw0')[0], y = performance.getEntriesByName('bw1')[0]; return { d: y.startTime - x.startTime, c: window._gcBootWatch ? window._gcBootWatch.state().cost : null }; });
    runs[keep ? 'on' : 'off'].push(+m.d.toFixed(2)); if (m.c) runs.self.push(m.c);
    await A.close();
  }
  const med = l => { const s = l.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const add = med(runs.on) - med(runs.off), poll = med(runs.self.map(x => x.pollMs)), sync = med(runs.self.map(x => x.syncMs));
  console.log('    the script tag (parse + compile + run), median: with ' + med(runs.on).toFixed(2) + ' ms, without ' + med(runs.off).toFixed(2) + ' ms → adds ' + add.toFixed(2) + ' ms; its own run ' + sync.toFixed(2) + ' ms; its checks until the first screen ' + poll.toFixed(2) + ' ms in ' + med(runs.self.map(x => x.polls)) + ' looks');
  ok(add + poll < 5, 'the early script adds under 5 ms to a phone\'s open at CPU ×4 (' + (add + poll).toFixed(2) + ' ms incl. its checks)', runs);
  srv.close();
}
console.log('RESULT ' + pass + '/' + (pass + fail) + '  (' + Math.round((Date.now() - T00) / 1000) + ' s)');
process.exit(fail ? 1 : 0);
