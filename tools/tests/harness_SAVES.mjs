// harness_SAVES.mjs — SAVES: a copy of the offline harness (harness_N.mjs) with a fuller in-memory "database":
//   • gc_kv AND gc_admin_kv rows are kept (adminCloud), every other PostgREST table keeps its rows too (tables.other[t]);
//   • Supabase Storage keeps uploaded objects (storage Map) so a photo / document uploaded on one device can be read on another;
//   • fault injection: failNext({ table, key, status, times, hang }) answers the next matching write(s) with an error
//     (e.g. 503) or never answers (a dead network) — to prove a failed save is retried or the person is told;
//   • fillLocalStorage(bytesFree) — an init script that fills localStorage until only ~bytesFree is left (a real PC's is full).
// The original harness_N.mjs is untouched.
// harness_N.mjs — offline GrayCo CRM harness (rebuilt 11/13 for LEADPERF).
// One in-memory "cloud" (gc_kv rows) behind a stubbed Supabase (auth, REST, storage) and stubbed Netlify functions; the build dir
// is served at http://app.local/; the CDN libraries come from ./cdn (React 18.3.1, supabase-js 2). Nothing leaves the machine
// (Chromium runs with a dead proxy and every unknown host is aborted). Made-up data only.
//
// API (what tools/tests import):
//   resetCloud()                       empty the cloud
//   cset(key, value) / cget(key)       write / read one gc_kv row (value = the JSON value, as the database holds it)
//   cloud                              Map key → { key, value, updated_at }
//   ACCOUNTS                           e-mail → { id, name, role ('admin' | 'office' | 'staff') } — sign-in accounts (password "pw")
//   computer(name, { build, mobile, viewport, headless, init })   init = addInitScript script(s) run before the page's own → A = { b, ctx, page(), ev(fn, arg), errs, dialogs, prompts, fn, acceptConfirm, isAdmin, close() }
//   signIn(A, email, ms)               sign in through the company gate; resolves when the CRM is open as that person
//   waitFor(A, fn, arg, ms)            poll fn(arg) in the page until truthy (returns the value, or the last value at timeout)
//   sleep(ms)
//   onFn(name, handler)                answer a Netlify function: handler({ name, body, query, method }) → object | { status, body }
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const NM = process.env.NODE_PATH || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules';
const { chromium } = require(path.join(NM, 'playwright'));

export const SBH = 'ieeonhpfahmwwecizdut.supabase.co';
export const cloud = new Map();
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = () => new Date().toISOString();
const clone = v => v === undefined ? null : JSON.parse(JSON.stringify(v));
export const adminCloud = new Map();
export const storage = new Map();   // 'bucket/path' → { body: Buffer, type, at }
export function resetCloud(){ cloud.clear(); adminCloud.clear(); storage.clear(); tables.gc_lead_inbox_kv.clear(); tables.other = {}; writes.length = 0; reads.length = 0; FAULTS.length = 0; }
/* SAVES: fault injection — the next matching write(s) fail */
export const FAULTS = [];
export const faultLog = [];
export function failNext(f){ FAULTS.push(Object.assign({ table: 'gc_kv', key: null, status: 503, times: 1, hang: false, method: /^(POST|PATCH|PUT)$/ }, f || {})); }
function takeFault(table, key, method){
  for (let i = 0; i < FAULTS.length; i++) { const f = FAULTS[i];
    if (f.table && !(f.table instanceof RegExp ? f.table.test(table) : f.table === table)) continue;
    if (f.method && !f.method.test(method)) continue;
    if (f.key && !(f.key instanceof RegExp ? f.key.test(key || '') : f.key === key)) continue;
    f.times--; if (f.times <= 0) FAULTS.splice(i, 1); faultLog.push({ table, key, method, status: f.status, hang: f.hang, at: Date.now() }); return f; }
  return null;
}
export function aget(key){ const r = adminCloud.get(key); return r ? clone(r.value) : undefined; }
export function aset(key, value){ adminCloud.set(key, { key, value: clone(value), updated_at: iso() }); }
/* an init script: fill localStorage until about `free` bytes (UTF-16 chars) are left, the way a real office PC's is */
export function fillLocalStorage(free){
  return `(function(){ try{ if(sessionStorage.getItem('__gcFilled')) return; var F=${Number(free) || 20000}; var big='x'.repeat(1<<20); var n=0;
    for(var sz=1<<20; sz>=256; ){ try{ localStorage.setItem('zz_fill_'+(n++), big.slice(0,sz)); }catch(e){ n--; sz=sz>>1; } }
    /* give back about F chars */ var freed=0; for(var i=n;i>=0 && freed<F;i--){ var v=localStorage.getItem('zz_fill_'+i); if(v){ freed+=v.length; localStorage.removeItem('zz_fill_'+i); } }
    sessionStorage.setItem('__gcFilled','1'); }catch(e){} })();`;
}
export function cset(key, value){ cloud.set(key, { key, value: clone(value), updated_at: iso() }); }
export function cget(key){ const r = cloud.get(key); return r ? clone(r.value) : undefined; }

export const ACCOUNTS = {
  'wjohnson@grayco-cs.com': { id: 'u-wesley', name: 'Wesley Johnson', role: 'admin' },
  'ngray@grayco-cs.com': { id: 'u-nick', name: 'Nick Gray', role: 'admin' },
  'office@grayco-cs.com': { id: 'u-office', name: 'Office Demo', role: 'office' },
  'sbiffle@grayco-cs.com': { id: 'u-sbiffle', name: 'Demo Estimator', role: 'staff' },
  'pm@grayco-cs.com': { id: 'u-pm', name: 'Demo PM', role: 'staff' },
  'crew@grayco-cs.com': { id: 'u-crew', name: 'Demo Crew', role: 'staff' },   /* SAVES: a crew member (time clock) */
  'mit@grayco-cs.com': { id: 'u-mit', name: 'Demo Mit Tech', role: 'staff' },   /* SAVES: GrayCo Mitigation */
  'env@grayco-cs.com': { id: 'u-env', name: 'Demo Env Tech', role: 'staff' }    /* SAVES: GrayCo Environmental */
};
const TOKENS = new Map();   // token → e-mail
let tokN = 0;
function emailOfAuth(h){ const t = String(h || '').replace(/^Bearer\s+/i, ''); if (TOKENS.has(t)) return TOKENS.get(t); const m = /^utok-(u-[a-z0-9]+)-\d+$/.exec(t); if (!m) return ''; return Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].id === m[1]) || ''; }
function mint(email){ const a = ACCOUNTS[email]; const t = 'utok-' + a.id + '-' + (++tokN); TOKENS.set(t, email); return { access_token: t, refresh_token: 'r-' + t, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: 'auth-' + a.id, email } }; }

/* ── PostgREST-ish filters over plain rows ── */
const dec = v => decodeURIComponent(String(v || ''));
function likeRx(p){ return new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$'); }
function filterRows(rows, q){
  for (const [k, v0] of q.entries()) {
    if (['select', 'order', 'limit', 'on_conflict', 'offset', 'columns'].includes(k)) continue;
    const v = String(v0);
    if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k] == null ? '' : r[k]) === dec(v.slice(3)));
    else if (v.startsWith('neq.')) rows = rows.filter(r => String(r[k] == null ? '' : r[k]) !== dec(v.slice(4)));
    else if (v.startsWith('in.')) { const l = dec(v.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')); rows = rows.filter(r => l.includes(String(r[k]))); }
    else if (v.startsWith('like.')) { const rx = likeRx(dec(v.slice(5))); rows = rows.filter(r => rx.test(String(r[k] || ''))); }
    else if (v.startsWith('ilike.')) { const rx = new RegExp(likeRx(dec(v.slice(6))).source, 'i'); rows = rows.filter(r => rx.test(String(r[k] || ''))); }
    else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k] || '') > dec(v.slice(3)));
    else if (v.startsWith('gte.')) rows = rows.filter(r => String(r[k] || '') >= dec(v.slice(4)));
    else if (v.startsWith('lt.')) rows = rows.filter(r => String(r[k] || '') < dec(v.slice(3)));
  }
  return rows;
}
function project(rows, sel){
  if (!sel || sel === '*') return rows;
  const cols = sel.split(',').map(s => s.trim()).filter(Boolean);
  return rows.map(r => { const o = {}; cols.forEach(c => { o[c] = r[c]; }); return o; });
}
export const tables = { gc_lead_inbox_kv: new Map(), other: {} };
export const calls = [];
export const writes = [];   // every gc_kv / lead-inbox write { table, key, at, len }
export const reads = [];    // every gc_kv read { q, at }
function staffRows(email){ const a = ACCOUNTS[email]; return a ? [{ email, name: a.name, role: a.role, active: true, profile: '' }] : []; }
function rest(table, method, q, body, email){
  if (table === 'gc_staff') return { status: 200, body: filterRows(Object.keys(ACCOUNTS).flatMap(staffRows), q) };
  if (table === 'gc_kv' || table === 'gc_lead_inbox_kv' || table === 'gc_admin_kv') {
    const M = table === 'gc_kv' ? cloud : table === 'gc_admin_kv' ? adminCloud : tables.gc_lead_inbox_kv;
    if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
      let b = body; try { b = JSON.parse(body); } catch (e) { b = null; }
      const list = Array.isArray(b) ? b : [b];
      list.forEach(r => { if (!r) return; const k = r.key || dec((q.get('key') || '').slice(3)); if (!k) return; { const js = JSON.stringify(r.value === undefined ? null : r.value); const prev = M.get(k); writes.push({ table, key: k, at: Date.now(), len: js.length, same: !!prev && JSON.stringify(prev.value) === js, prev: prev && prev.value, value: r.value }); } const prev = M.get(k); M.set(k, { key: k, value: 'value' in r ? r.value : (prev && prev.value), updated_at: iso() }); });
      return { status: method === 'POST' ? 201 : 200, body: method === 'PATCH' ? list.map(r => ({ key: (r && r.key) || 'x' })) : [] };
    }
    if (method === 'DELETE') { filterRows([...M.values()], q).forEach(r => M.delete(r.key)); return { status: 204, body: '' }; }
    const rows = filterRows([...M.values()], q); reads.push({ table, q: String(q), at: Date.now(), n: rows.length });
    return { status: 200, body: project(rows, q.get('select')) };
  }
  /* SAVES: every other table keeps its rows (upsert on id when there is one) */
  const T = tables.other[table] || (tables.other[table] = []);
  if (method === 'GET') return { status: 200, body: project(filterRows(T.slice(), q), q.get('select')) };
  if (method === 'DELETE') { const gone = new Set(filterRows(T.slice(), q)); tables.other[table] = T.filter(r => !gone.has(r)); return { status: 204, body: '' }; }
  let b = null; try { b = JSON.parse(body); } catch (e) {}
  const list = Array.isArray(b) ? b : (b ? [b] : []);
  if (method === 'PATCH') { const hit = filterRows(T.slice(), q); hit.forEach(r => Object.assign(r, list[0] || {})); writes.push({ table, key: String(q), at: Date.now(), value: list[0] }); return { status: 200, body: hit }; }
  list.forEach(r => { if (!r) return; const i = r.id != null ? T.findIndex(x => x.id === r.id) : -1; if (i >= 0) T[i] = Object.assign({}, T[i], r); else T.push(Object.assign({}, r)); writes.push({ table, key: r.id || '', at: Date.now(), value: r }); });
  return { status: method === 'POST' ? 201 : 204, body: method === 'POST' ? list : '' };
}

/* ── Netlify functions: a default answer; tests may add their own with onFn ── */
const FN = {};
export function onFn(name, h){ FN[name] = h; }
function fnDefault(name){
  return { ok: true, configured: false, items: [], rows: [], list: [], leads: [], data: null };
}

/* ── the browser ── */
const CDN = process.env.GC_CDN || (fs.existsSync(path.join(HERE, 'cdn')) ? path.join(HERE, 'cdn') : '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/cdn');
const LIBS = [
  [/cdnjs\.cloudflare\.com\/ajax\/libs\/react\/18\.3\.1\/umd\/react\.production\.min\.js/, 'react.js'],
  [/cdnjs\.cloudflare\.com\/ajax\/libs\/react-dom\/18\.3\.1\/umd\/react-dom\.production\.min\.js/, 'react-dom.js'],
  [/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, 'supabase.js']
];
let BROWSER = null;
async function browser(headless){
  if (BROWSER && BROWSER.isConnected()) return BROWSER;
  BROWSER = await chromium.launch({ headless: headless !== false, args: ['--proxy-server=http://127.0.0.1:9', '--disable-features=TranslateUI', '--no-default-browser-check'] });
  return BROWSER;
}
const ACAO = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
export async function computer(name, opt){
  opt = opt || {};
  const build = path.resolve(opt.build || process.cwd());
  const b = await browser(opt.headless);
  const vp = opt.viewport || (opt.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const ctx = await b.newContext(Object.assign({ viewport: vp, serviceWorkers: 'block', timezoneId: 'America/Chicago', locale: 'en-US' }, opt.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: opt.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' } : {}));   /* SAVES: an iPhone */
  const A = { name, b, ctx, errs: [], dialogs: [], prompts: [], fn: [], acceptConfirm: true, build };
  await ctx.routeWebSocket(/.*/, ws => { /* realtime: never answers (the CRM polls) */ });
  await ctx.route('**/*', async r => {
    const rq = r.request(); let u; try { u = new URL(rq.url()); } catch (e) { return r.abort(); }
    const m = rq.method();
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: ACAO });
    for (const [rx, f] of LIBS) if (rx.test(rq.url())) return r.fulfill({ path: path.join(CDN, f), contentType: 'application/javascript', headers: ACAO });
    if (u.host === 'app.local') {
      if (u.pathname.startsWith('/.netlify/functions/')) {
        const fname = u.pathname.split('/')[3] || ''; let body = rq.postData() || ''; let jb = null; try { jb = JSON.parse(body); } catch (e) {}
        const q = Object.fromEntries(u.searchParams.entries());
        A.fn.push({ name: fname, method: m, body: jb || body, query: q, at: Date.now() }); calls.push(fname);
        { const f = takeFault('fn:' + fname, (jb && (jb.action || jb.op)) || q.action || '', m); if (f) { if (f.hang) return; return r.fulfill({ status: f.status, contentType: 'application/json', headers: ACAO, body: '{"error":"injected"}' }); } }
        let out = FN[fname] ? await FN[fname]({ name: fname, body: jb || body, query: q, method: m, A }) : fnDefault(fname);
        if (out && out.status && 'body' in out && Object.keys(out).length <= 3) return r.fulfill({ status: out.status, contentType: 'application/json', headers: ACAO, body: typeof out.body === 'string' ? out.body : JSON.stringify(out.body) });
        return r.fulfill({ status: 200, contentType: 'application/json', headers: ACAO, body: JSON.stringify(out) });
      }
      let p = decodeURIComponent(u.pathname); if (p === '/' || p.endsWith('/')) p += 'index.html';
      const f = path.join(build, p);
      if (f.startsWith(build) && fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
      return r.fulfill({ status: 404, body: '' });
    }
    if (u.host === SBH || u.host === 'sb.test') {
      const p = u.pathname; const hd = rq.headers();
      if (p === '/auth/v1/token') {
        let b0 = {}; try { b0 = JSON.parse(rq.postData() || '{}'); } catch (e) {}
        let email = '';
        if (u.searchParams.get('grant_type') === 'password') { email = String(b0.email || '').toLowerCase(); if (!ACCOUNTS[email] || b0.password !== (ACCOUNTS[email].pw || 'pw')) return r.fulfill({ status: 400, contentType: 'application/json', headers: ACAO, body: '{"error":"invalid_grant"}' }); }
        else email = emailOfAuth(String(b0.refresh_token || '').replace(/^r-/, ''));
        if (!email) return r.fulfill({ status: 400, contentType: 'application/json', headers: ACAO, body: '{"error":"invalid_grant"}' });
        return r.fulfill({ status: 200, contentType: 'application/json', headers: ACAO, body: JSON.stringify(mint(email)) });
      }
      if (p === '/auth/v1/user') { const e = emailOfAuth(hd.authorization); return r.fulfill({ status: e ? 200 : 401, contentType: 'application/json', headers: ACAO, body: JSON.stringify(e ? { id: 'auth-' + ACCOUNTS[e].id, email: e, user_metadata: {} } : {}) }); }
      if (p.startsWith('/auth/v1/')) return r.fulfill({ status: 200, contentType: 'application/json', headers: ACAO, body: '{}' });
      if (p.startsWith('/rest/v1/')) {
        const t = p.slice(9);
        if (m !== 'GET') { let fk = ''; try { const bb = JSON.parse(rq.postData() || 'null'); fk = (Array.isArray(bb) ? (bb[0] || {}).key : (bb || {}).key) || dec((u.searchParams.get('key') || '').slice(3)); } catch (e) {}
          const f = takeFault(t, fk, m); if (f) { if (f.hang) return; /* never answers */ return r.fulfill({ status: f.status, contentType: 'application/json', headers: ACAO, body: '{"message":"injected failure"}' }); } }
        const x = rest(t, m, u.searchParams, rq.postData(), emailOfAuth(hd.authorization));
        const single = /vnd\.pgrst\.object/.test(hd.accept || '');
        let bd = x.body; if (single && Array.isArray(bd)) bd = bd[0] || null;
        return r.fulfill({ status: x.status, contentType: 'application/json', headers: Object.assign({ 'content-range': '0-' + Math.max(0, (Array.isArray(bd) ? bd.length : 1) - 1) + '/*' }, ACAO), body: typeof bd === 'string' ? bd : JSON.stringify(bd) });
      }
      if (p.startsWith('/storage/v1/')) {
        /* SAVES: keep what is uploaded (object/<bucket>/<path>, also /object/public|authenticated|sign/…) */
        const mm = /^\/storage\/v1\/object\/(?:(public|authenticated|sign|info|list)\/)?(.+)$/.exec(p);
        if (mm && (m === 'POST' || m === 'PUT')) { const f = takeFault('storage', mm[2], m); if (f) { if (f.hang) return; return r.fulfill({ status: f.status, contentType: 'application/json', headers: ACAO, body: '{"error":"injected"}' }); }
          storage.set(decodeURIComponent(mm[2]), { body: rq.postDataBuffer() || Buffer.alloc(0), type: hd['content-type'] || '', at: Date.now() }); writes.push({ table: 'storage', key: decodeURIComponent(mm[2]), at: Date.now() });
          return r.fulfill({ status: 200, contentType: 'application/json', headers: ACAO, body: JSON.stringify({ Key: decodeURIComponent(mm[2]), Id: 'obj-' + storage.size }) }); }
        if (mm && mm[1] === 'sign') return r.fulfill({ status: 200, contentType: 'application/json', headers: ACAO, body: JSON.stringify({ signedURL: '/object/authenticated/' + mm[2], signedUrl: 'https://' + SBH + '/storage/v1/object/authenticated/' + mm[2] }) });
        if (mm && m === 'GET') { const o = storage.get(decodeURIComponent(mm[2])); if (o) return r.fulfill({ status: 200, headers: Object.assign({ 'content-type': o.type || 'application/octet-stream' }, ACAO), body: o.body }); }
        return r.fulfill({ status: m === 'GET' ? 404 : 200, contentType: 'application/json', headers: ACAO, body: m === 'GET' ? '{"error":"not found"}' : '{"Key":"x"}' });
      }
      if (p.startsWith('/functions/v1/')) return r.fulfill({ status: 200, contentType: 'application/json', headers: ACAO, body: '{"ok":true}' });
      return r.fulfill({ status: 404, contentType: 'application/json', headers: ACAO, body: '{}' });
    }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u.host)) return r.fulfill({ status: 200, contentType: /gstatic/.test(u.host) ? 'font/woff2' : 'text/css', body: '' });
    return r.abort('blockedbyclient');
  });
  let page = await ctx.newPage();
  const wire = p => {
    p.on('pageerror', e => A.errs.push(String(e && e.message || e).slice(0, 300)));
    p.on('dialog', d => { A.dialogs.push({ type: d.type(), message: d.message() }); if (d.type() === 'prompt') { A.prompts.push(d.message()); return d.dismiss().catch(() => {}); } return (A.acceptConfirm ? d.accept() : d.dismiss()).catch(() => {}); });
  };
  wire(page);
  for (const sc of [].concat(opt.init || [])) await page.addInitScript(sc);
  A.page = () => page;
  A.ev = (fn, arg) => page.evaluate(fn, arg);
  A.isAdmin = () => page.evaluate(() => { try { return !!(window.__GC_AUTH__ && window.__GC_AUTH__.isAdmin && window.__GC_AUTH__.isAdmin()); } catch (e) { return false; } });
  A.close = () => ctx.close();
  A.goto = async () => { await page.goto('http://app.local/', { waitUntil: 'domcontentloaded', timeout: 120000 }); };
  await A.goto();
  return A;
}

export async function waitFor(A, fn, arg, ms){
  const t0 = Date.now(); let v; ms = ms || 15000;
  while (Date.now() - t0 < ms) { try { v = await A.ev(fn, arg); } catch (e) { v = undefined; } if (v) return v; await sleep(200); }
  return v;
}

/* sign in through the gate; the CRM reloads once to open as that person */
export async function signIn(A, email, ms){
  ms = ms || 20000; email = String(email).toLowerCase();
  const p = A.page(); const t0 = Date.now();
  await p.waitForSelector('#gc-auth-email', { timeout: ms }).catch(() => {});
  if (await p.$('#gc-auth-email')) {
    await p.fill('#gc-auth-email', email); await p.fill('#gc-auth-password', (ACCOUNTS[email] && ACCOUNTS[email].pw) || 'pw');
    await p.click('#gc-auth-submit').catch(() => {});
  }
  /* wait for the app to be open as that person (after the one reload) */
  while (Date.now() - t0 < ms + 30000) {
    const st = await p.evaluate(e => { try { return { gate: !!document.getElementById('gc-auth-gate'), crm: !!window._crm, user: (window._crm && window._crm.user && window._crm.user.email) || (JSON.parse(localStorage.getItem('gc_auth_v1') || 'null') || {}).email || '', msg: (document.getElementById('gc-auth-msg') || {}).textContent || '' }; } catch (x) { return null; } }, email).catch(() => null);
    if (st && !st.gate && st.crm) return true;
    await sleep(300);
  }
  return false;
}
