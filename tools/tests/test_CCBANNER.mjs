/* patch CCBANNER — no false "CompanyCam photos can't come in" banner on 📷 Photos.
   node tools/tests/test_CCBANNER.mjs [build dir] [mirror.json]
   Offline: harness S/wN/harness_N.mjs on the real-data mirror (rows whose key mentions "token" are left out), and the REAL
   companycam-webhook handler run in-process for every /.netlify/functions/companycam-webhook call, against a faked Supabase
   that answers sign-in / gc_staff / gc_kv from the harness cloud (realistic gc_cc_* rows, a 400-entry gc_cc_review).
     1. the CompanyCam gate lets ?proxy=sync through however the headers come (object, Headers, [[k,v]], a Request)
     2. healthy answer → no banner, the Photos pill says "All synced", verdict ok
     3. tokenSet false → the red banner + the pill "CompanyCam not syncing" (same verdict)
     4. health failures: one failed run → nothing; failing run after run → banner
     5. key rejected (gc_cc_whoami accepted:false) → banner
     6. inconclusive — a 200 that is not JSON, a 200 "[]", a network error, a 401, the gate's stand-in — never a red banner;
        the last real answer stays; quiet retry with backoff; written to the error report (_gcPerfRep), not the screen
     7. the banner only on 📷 Photos and only for an admin; never on the other screens
     8. one verdict for every case (stale / no run → not red)
     9. companycam-sync writes fails / lastOkAt (failed runs in a row)
   No page errors. */
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const S = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD = path.resolve(process.argv[2] || ROOT);
const MIRROR = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const { computer, sleep, cloud, ACCOUNTS, waitFor } = await import(S + '/wN/harness_N.mjs');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 400) : '')); } }

/* ── the cloud: the real-data mirror + realistic CompanyCam rows ── */
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
cloud.clear();
for (const r of rows) { if (/token/i.test(r.key)) continue; cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at }); }
const iso = ms => new Date(Date.now() - ms).toISOString();
const put = (k, v) => cloud.set(k, { key: k, value: v, updated_at: new Date().toISOString() });
const review = []; for (let i = 0; i < 400; i++) review.push({ at: iso(i * 60e3), cc: String(94000000 + i), url: 'https://app.companycam.com/projects/' + (94000000 + i),
  why: 'made in CompanyCam before 2026 — same address as the finished job "Attic Addition ' + i + '". Link it if it is this job.   "quoted" <b>', kind: ['link', 'match', 'ask', 'pm'][i % 4],
  name: 'Knockout- Attic Addition ' + i, first: iso(i * 60e3), address: (1000 + i) + ' John Ridge Dr, Collierville, TN, 38017', created: '2025-11-25', creator: 'Wesley  Johnson',
  jobs: [{ id: 'PRJk1y8mj' + i, name: 'Attic Addition ' + i, status: 'completed', address: (1000 + i) + ' John Ridge Dr, Collierville TN' }] });
const HEALTHY = () => ({ at: iso(5 * 60e3), ok: true, ask: 0, old: 0, full: false, made: 0, read: 3, pages: 1, linked: 0, review: 400, company: 'GrayCo Construction Services, LLC ',
  request: '/v2/projects?per_page=50&page=1', variant: 'iso50', attempts: [{ status: 200, retried: false, variant: 'iso50' }], complete: true, whoamiStatus: 200, tokenAccepted: true, fails: 0, lastOkAt: iso(5 * 60e3),
  tokenShape: { len: 43, bearer: false, quotes: false, rawLen: 43, charset: 'ok', malformed: false, innerSpace: false, outerSpace: false } });
function setHealthy(){
  put('gc_cc_sync_health', HEALTHY()); put('gc_cc_whoami', { at: iso(4 * 60e3), status: 200, company: 'GrayCo Construction Services, LLC ', accepted: true });
  put('gc_cc_review', review); process.env.COMPANYCAM_TOKEN = 'T'.repeat(43);
}
setHealthy();

/* ── the server: the real handler, a faked Supabase behind it ── */
process.env.SUPABASE_URL = 'https://sb.fake'; process.env.SUPABASE_SERVICE_KEY = 'svc-fake';
const nodeFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url), J = (b, st) => new Response(JSON.stringify(b), { status: st || 200, headers: { 'content-type': 'application/json' } });
  const hd = (init && init.headers) || {};
  if (u.startsWith('https://sb.fake/auth/v1/user')) { const m = /utok-(u-\w)-/.exec(String(hd.Authorization || '')); const e = m && Object.keys(ACCOUNTS).find(k => ACCOUNTS[k].id === m[1]); return e ? J({ id: m[1], email: e }) : J({ msg: 'bad jwt' }, 401); }
  if (u.startsWith('https://sb.fake/rest/v1/gc_staff')) { const e = decodeURIComponent(/email=eq\.([^&]*)/.exec(u)[1]); return J(ACCOUNTS[e] ? [{ email: e, role: ACCOUNTS[e].role, active: true, name: '' }] : []); }
  if (u.startsWith('https://sb.fake/rest/v1/gc_kv')) {
    if (init && init.method === 'POST') { JSON.parse(init.body).forEach(r => put(r.key, r.value)); return J([], 201); }
    const d = decodeURIComponent(u), m = /key=in\.\(([^)]*)\)/.exec(d), ks = m ? m[1].split(',').map(x => x.replace(/"/g, '')) : [];
    return J(ks.filter(k => cloud.has(k)).map(k => ({ key: k, value: cloud.get(k).value })));
  }
  if (u.startsWith('https://api.companycam.com/v2/company')) {   /* the server's own key check (?proxy=status → gc_cc_whoami) */
    const good = String(hd.Authorization || hd.authorization || '') === 'Bearer ' + 'T'.repeat(43);
    return good ? J({ id: '1', name: 'GrayCo Construction Services, LLC ' }) : J({ errors: ['unauthorized'] }, 401);
  }
  throw new Error('unexpected server fetch ' + u);
};
const FN = require(path.join(BUILD, 'netlify/functions/companycam-webhook.js'));

/* 9. companycam-sync: failed runs in a row */
{
  const SYNC = require(path.join(BUILD, 'netlify/functions/companycam-sync.js'))._t;
  put('gc_cc_sync_health', HEALTHY());
  const f1 = SYNC.healthOf(null, new Error('CompanyCam answered 500')); await SYNC.saveHealth(f1);
  const a = cloud.get('gc_cc_sync_health').value;
  const f2 = SYNC.healthOf(null, new Error('CompanyCam answered 500')); await SYNC.saveHealth(f2);
  const b = cloud.get('gc_cc_sync_health').value;
  await SYNC.saveHealth(SYNC.healthOf({ ok: true, read: 2, made: [] }));
  const c2 = cloud.get('gc_cc_sync_health').value;
  ok('companycam-sync counts failed runs in a row (1, 2, then 0 after a good run) and keeps the last good run', a.fails === 1 && b.fails === 2 && c2.fails === 0 && !!a.lastOkAt && a.lastOkAt === b.lastOkAt && c2.lastOkAt === c2.at,
    JSON.stringify([a.fails, b.fails, c2.fails, a.lastOkAt, b.lastOkAt]));
  ok('…the health row never carries the token', !/T{20}/.test(JSON.stringify(c2)));
  setHealthy();
}

/* ── the browser ── */
const email = 'wjohnson@grayco-cs.com';
const c = await computer('CCB', { build: BUILD }); c.acceptConfirm = false;
let MODE = 'real'; const hits = [];
await c.ctx.route(u => /\/\.netlify\/functions\/companycam-webhook/.test(u), async r => {
  const rq = r.request(), u = new URL(rq.url()), qs = Object.fromEntries(u.searchParams), sync = qs.proxy === 'sync';
  hits.push(qs.proxy || '');
  if (sync && MODE === 'html') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>Page not found</body></html>' });
  if (sync && MODE === 'list') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  if (sync && MODE === 'net') return r.abort('internetdisconnected');
  if (sync && MODE === '401') return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Your sign-in has expired. Sign in again."}' });
  const res = await FN.handler({ httpMethod: rq.method(), headers: rq.headers(), queryStringParameters: qs, body: rq.postData() || '', path: u.pathname, rawUrl: u.href }, {});
  return r.fulfill({ status: res.statusCode, headers: res.headers, body: res.body || '' });
});
await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access)/.test(u), async r => {
  const u = new URL(r.request().url()), m = r.request().method(), a = ACCOUNTS[email];
  const J = (st, b) => r.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: typeof b === 'string' ? b : JSON.stringify(b) });
  if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname.endsWith('/gc_staff')) return J(200, [{ email, role: a.role, active: true, name: '', payroll: true }]);
  return J(200, { email, staff: true, admin: a.role === 'admin', payroll: true, office: false, sec2: 1 });
});
await c.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
const p = c.page(); await p.setViewportSize({ width: 1366, height: 800 });
await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 60000 }); await sleep(1500);
for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === email) break; }
{ const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await waitFor(c, () => !!(window.__GC_AUTH__ && window.__GC_AUTH__.email && window.__GC_AUTH__.email()), null, 90000, 500);
await sleep(8000);
await p.evaluate(() => window._setView('allphotos'));
await waitFor(c, () => !!document.getElementById('gcu-sync'), null, 60000, 300);
await sleep(1500);

const look = () => p.evaluate(() => {
  const ban = document.getElementById('gc-ccs-photos'), pill = document.getElementById('gcu-sync');
  const v = window._gcCCSync && window._gcCCSync.verdict ? window._gcCCSync.verdict() : null;
  return { banner: ban && ban.isConnected ? ban.textContent : '', pill: pill ? pill.textContent.trim() : '', pillBad: pill ? pill.getAttribute('data-cc') === 'bad' : null, v, st: window._gcCCSync.state(), view: localStorage.getItem('grayco_view') };
});
const polled = async () => { await p.evaluate(() => window._gcCCSync.poll()); await sleep(1800); return look(); };

/* 1. the root cause: the gate */
const gate = await p.evaluate(async () => {
  const U = '/.netlify/functions/companycam-webhook?proxy=sync', out = {};
  const one = async (k, f) => { try { const r = await f(); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} out[k] = { st: r.status, gate: r.headers.get('X-GC-Gate'), tokenSet: !!(j && 'tokenSet' in j) }; } catch (e) { out[k] = { err: String(e.message) }; } };
  await one('object', () => window.fetch(U, { headers: { 'x-gc-cc': '1' }, cache: 'no-store' }));
  await one('Headers', () => window.fetch(U, { headers: new Headers({ 'x-gc-cc': '1' }), cache: 'no-store' }));
  await one('list', () => window.fetch(U, { headers: [['x-gc-cc', '1']], cache: 'no-store' }));
  await one('Request', () => window.fetch(new Request(U, { headers: { 'x-gc-cc': '1' }, cache: 'no-store' })));
  await one('unmarked', () => window.fetch('/.netlify/functions/companycam-webhook?proxy=api&endpoint=projects'));
  return out;
});
ok('the CompanyCam gate lets the status question through (headers as an object, Headers, a [[k,v]] list or a Request)',
  ['object', 'Headers', 'list', 'Request'].every(k => gate[k] && gate[k].st === 200 && !gate[k].gate && gate[k].tokenSet), JSON.stringify(gate));
ok('…an unmarked old CompanyCam call is still answered by the gate (no storm)', gate.unmarked && gate.unmarked.gate === 'blocked', JSON.stringify(gate.unmarked));

/* 2. healthy */
let L = await polled();
ok('healthy (real handler, 400-entry review list): the check got the server\'s record', L.st.data && L.st.data.tokenSet === true && L.st.fails === 0 && Array.isArray(L.st.data.review) && L.st.data.review.length === 100, JSON.stringify(L.st).slice(0, 300));
ok('healthy: no banner, the pill says "All synced", the verdict is ok', !L.banner && L.pill === 'All synced' && L.v && L.v.ok === true && L.v.show === false, JSON.stringify({ b: L.banner, p: L.pill, v: L.v }));

/* 6. inconclusive answers on top of a healthy one */
for (const m of ['html', 'list', 'net', '401']) {
  MODE = m; L = await polled();
  ok('inconclusive (' + m + '): no red banner, the pill still "All synced", the last real answer kept, retry scheduled', !L.banner && L.pill === 'All synced' && L.v.ok === true && L.st.fails >= 1 && L.st.next > Date.now() && L.st.data && L.st.data.tokenSet === true,
    JSON.stringify({ b: L.banner, p: L.pill, v: L.v, f: L.st.fails, n: L.st.next - Date.now(), err: L.st.err }));
}
const back = await p.evaluate(() => { const s = window._gcCCSync.state(); return { fails: s.fails, wait: s.next - Date.now() }; });
ok('…backoff grows with the failures (4 in a row → ~4 min)', back.fails === 4 && back.wait > 200e3 && back.wait <= 240e3, JSON.stringify(back));
const rep = await p.evaluate(() => { try { const n = window._gcPerfRep.report().net; return Object.keys(n).filter(k => /CompanyCam status check inconclusive/.test(k)); } catch (e) { return ['ERR ' + e.message]; } });
ok('…each inconclusive check is written to the error report (_gcPerfRep), not the screen', rep.length >= 4 && rep.some(k => /not JSON/.test(k)) && rep.some(k => /401/.test(k)) && rep.some(k => /no answer|503/.test(k)), JSON.stringify(rep));
MODE = 'gated';
const gst = await p.evaluate(async () => { const keep = window.__gcCCAllow; window.__gcCCAllow = () => false; try { await window._gcCCSync.poll(); } finally { window.__gcCCAllow = keep; }
  const s = window._gcCCSync.state(); return { err: s.err, fails: s.fails, ok: window._gcCCSync.verdict().ok }; });
L = await look();
ok('inconclusive (the gate\'s stand-in "[]" 200): no red banner, noted as the gate\'s answer', !L.banner && gst.ok === true && /gate/.test(gst.err) && gst.fails === 5, JSON.stringify(gst));
const noData = await p.evaluate(() => window._gcCCSync._judgeFor(null, 'could not ask the server (200)'));
ok('no answer at all yet (the owner\'s screenshot case): not red', noData.ok !== false && !/could not ask/.test(noData.text), JSON.stringify(noData));
MODE = 'real'; L = await polled();
ok('a real answer again: failures cleared', L.st.fails === 0 && L.st.next === 0 && !L.banner && L.pill === 'All synced', JSON.stringify(L.st).slice(0, 200));

/* 3. tokenSet false */
delete process.env.COMPANYCAM_TOKEN; L = await polled();
ok('tokenSet false: the red banner on 📷 Photos', /can't come in/.test(L.banner) && /token not set/i.test(L.banner), L.banner);
ok('…and the pill says "CompanyCam not syncing" (the same verdict), not "All synced"', L.pill === 'CompanyCam not syncing' && L.pillBad === true && L.v.show === true, JSON.stringify({ p: L.pill, v: L.v }));

/* 7. only on 📷 Photos, only for admins */
const screens = {};
for (const v of ['dashboard', 'leads', 'projects', 'admin']) { await p.evaluate(x => window._setView(x), v); await sleep(2600); screens[v] = await p.evaluate(() => { const b = document.getElementById('gc-ccs-photos'); return !!(b && b.isConnected) || /can't come in/.test(document.body.innerText); }); }
ok('the banner is not on any other screen (dashboard, leads, projects, admin)', Object.values(screens).every(x => !x), JSON.stringify(screens));
await p.evaluate(() => window._setView('allphotos')); await sleep(2600);
L = await look();
ok('…back on 📷 Photos it is', /can't come in/.test(L.banner), L.banner);
const staff = await p.evaluate(async () => { const A = window.__GC_AUTH__, f = A.isAdmin; let r;
  try { A.isAdmin = () => false; await new Promise(x => setTimeout(x, 2600)); const b = document.getElementById('gc-ccs-photos'), pl = document.getElementById('gcu-sync');
    r = { set: A.isAdmin !== f, banner: !!(b && b.isConnected), pill: pl ? pl.textContent.trim() : '' }; } finally { A.isAdmin = f; } return r; });
ok('…not for someone who is not an admin (and their pill is the plain upload pill)', staff && (!staff.set || (!staff.banner && staff.pill === 'All synced')), JSON.stringify(staff));
await sleep(2600);

/* 4. health failures */
process.env.COMPANYCAM_TOKEN = 'T'.repeat(43);
put('gc_cc_sync_health', Object.assign(HEALTHY(), { ok: false, error: 'CompanyCam answered 500', httpStatus: 500, fails: 1 }));
L = await polled();
ok('one failed sync run (fails 1): no banner, the pill "All synced"', !L.banner && L.pill === 'All synced' && L.v.ok !== false, JSON.stringify({ b: L.banner, p: L.pill, v: L.v }));
put('gc_cc_sync_health', Object.assign(HEALTHY(), { ok: false, error: 'CompanyCam answered 500', httpStatus: 500, fails: 3, lastOkAt: iso(50 * 60e3) }));
L = await polled();
ok('failing run after run (fails 3): the banner, and the pill agrees', /can't come in/.test(L.banner) && /3 runs in a row/.test(L.banner) && L.pill === 'CompanyCam not syncing', JSON.stringify({ b: L.banner, p: L.pill }));

/* 5. key rejected */
setHealthy(); process.env.COMPANYCAM_TOKEN = 'W'.repeat(43);   /* a token CompanyCam refuses: the server's own key check (Test Connection) records it */
await p.evaluate(() => window._gcCCTruth(true)); await sleep(1800);
L = await look();
ok('the key rejected (CompanyCam 401 on the server\'s check → gc_cc_whoami): the banner, and the pill agrees', /can't come in/.test(L.banner) && /not accepted/i.test(L.banner) && L.pill === 'CompanyCam not syncing', JSON.stringify({ b: L.banner, p: L.pill }));

setHealthy(); await p.evaluate(() => window._gcCCTruth(true)); await sleep(1800); L = await look();
ok('healthy again: banner gone, the pill back to "All synced"', !L.banner && L.pill === 'All synced', JSON.stringify({ b: L.banner, p: L.pill }));
const td = await p.evaluate(() => { const v = window._gcCCSync._judgeFor; return { healthy: v({ tokenSet: true, health: { at: new Date().toISOString(), ok: true, read: 1 }, whoami: { at: new Date().toISOString(), accepted: true, status: 200 } }).ok,
  stale: v({ tokenSet: true, health: { at: new Date(Date.now() - 3 * 3600e3).toISOString(), ok: true }, whoami: { at: new Date().toISOString(), accepted: true, status: 200 } }).ok,
  noRun: v({ tokenSet: true, health: null }).ok, noToken: v({ tokenSet: false, health: null }).ok }; });
ok('the one verdict: stale / no run recorded → not red; token not set → red', td.healthy === true && td.stale !== false && td.noRun !== false && td.noToken === false, JSON.stringify(td));

ok('no page errors', c.errs.length === 0, c.errs.slice(0, 3).join(' | '));
console.log('calls: ' + JSON.stringify(hits.reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {})));
global.fetch = nodeFetch;
await c.b.close();
console.log((fail ? '✗ ' : '✓ ') + 'test_CCBANNER: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
