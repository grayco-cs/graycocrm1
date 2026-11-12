// qaa_world.mjs — patch QAA: one in-memory Supabase (sp_rows, gc_staff, gc_kv = the CRM harness's cloud, the lead-inbox kv,
// sign-in, the file buckets) behind the REAL netlify functions (bid-hub.js, subportal.js), for the CRM (offline harness) and the
// bid site (subportal/, built) in the same run. Made-up data only; nothing leaves the machine.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export const HARNESS = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(HARNESS);
export const SBH = 'ieeonhpfahmwwecizdut.supabase.co';
export const DB = { sp_rows: [], gc_staff: [], lkv: new Map() };
export const STORE = new Map();
export const TOK = {};                 /* bid-site tokens → e-mail */
export const ACC = {};                 /* bid-site sign-ins (e-mail → { pw, id }) */
export const CALLS = [];
const now = () => new Date().toISOString();
export const spRow = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now() }, extra || {});
export const putRow = (collection, id, data, extra) => { const r = spRow(collection, id, data, extra); const i = DB.sp_rows.findIndex(x => x.key === r.key); if (i >= 0) DB.sp_rows[i] = r; else DB.sp_rows.push(r); return r; };
export const rowsOf = c => DB.sp_rows.filter(r => r.collection === c);
export const rowData = key => { const r = DB.sp_rows.find(x => x.key === key); return r ? r.data : null; };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => (typeof body === 'string' ? JSON.parse(body || 'null') : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  arrayBuffer: async () => Buffer.isBuffer(body) ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : new ArrayBuffer(0) });
const dec = v => decodeURIComponent(String(v || ''));
function query(rows, q){
  for (const [k, v] of q.entries()) {
    if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
    if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k] == null ? '' : r[k]) === dec(v.slice(3)));
    else if (v.startsWith('in.')) { const l = dec(v.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')); rows = rows.filter(r => l.includes(String(r[k]))); }
  }
  return rows;
}
/* the CRM harness signs in with tokens "utok-<account id>-<n>" */
function emailOfTok(t){
  if (TOK[t]) return TOK[t];
  const m = /^utok-(u-[a-z]+)-\d+$/.exec(t || ''); if (!m) return '';
  return Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === m[1]) || '';
}
export async function sbFetch(url, init){
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  const hget = k => { if (typeof hd.get === 'function') return hd.get(k) || ''; return hd[k] || hd[k.toLowerCase()] || ''; };
  const auth = String(hget('Authorization')).replace(/^Bearer\s+/i, '');
  if (u.pathname === '/auth/v1/user') { const e = emailOfTok(auth); return e ? res(200, { id: (ACC[e] && ACC[e].id) || 'auth-' + e.split('@')[0], email: e }) : res(401, {}); }
  if (u.pathname === '/auth/v1/admin/users' && m === 'POST') { const b = JSON.parse(init.body); if (ACC[b.email]) return res(422, { msg: 'already registered' }); ACC[b.email] = { pw: b.password, id: 'auth-' + crypto.randomBytes(3).toString('hex') }; return res(200, { id: ACC[b.email].id }); }
  if (u.pathname.startsWith('/auth/v1/admin/users/') && m === 'DELETE') return res(200, {});
  if (u.pathname === '/rest/v1/sp_rows') {
    if (m === 'POST') { (JSON.parse(init.body)).forEach(r => { const i = DB.sp_rows.findIndex(x => x.key === r.key); const row = JSON.parse(JSON.stringify(r)); if (i >= 0) DB.sp_rows[i] = Object.assign({}, DB.sp_rows[i], row); else DB.sp_rows.push(row); }); return res(201, []); }
    const rows = query(DB.sp_rows.slice(), q);
    if (m === 'DELETE') { rows.forEach(r => DB.sp_rows.splice(DB.sp_rows.indexOf(r), 1)); return res(204, ''); }
    return res(200, JSON.parse(JSON.stringify(rows.sort((a, b) => a.key < b.key ? -1 : 1))));
  }
  if (u.pathname === '/rest/v1/gc_staff') return res(200, query(DB.gc_staff.slice(), q));
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST' || m === 'PATCH') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { if (r && r.key) H.cset(r.key, r.value); else if (m === 'PATCH') { const k = dec((q.get('key') || '').slice(3)); H.cset(k, b.value); } }); return res(m === 'PATCH' ? 200 : 201, m === 'PATCH' ? [{}] : []); }
    const rows = query([...H.cloud.values()].map(x => ({ key: x.key, value: x.value, updated_at: x.updated_at })), q);
    return res(200, JSON.parse(JSON.stringify(rows)));
  }
  if (u.pathname === '/rest/v1/gc_lead_inbox_kv') {
    if (m === 'POST' || m === 'PATCH') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { const k = r && r.key ? r.key : dec((q.get('key') || '').slice(3)); DB.lkv.set(k, { key: k, value: r.value, updated_at: now() }); }); return res(m === 'PATCH' ? 200 : 201, m === 'PATCH' ? [{ key: 'x' }] : []); }
    return res(200, query([...DB.lkv.values()], q));
  }
  if (u.pathname.startsWith('/rest/v1/')) return res(200, []);
  let mm;
  if ((mm = /^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(u.pathname)) && m === 'POST') return res(200, { url: '/object/upload/sign/' + mm[1] + '/' + mm[2] + '?token=up' });
  if ((mm = /^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(u.pathname)) && m === 'PUT') { STORE.set(mm[1] + '/' + dec(mm[2]), Buffer.from(init.body || '')); return res(200, { Key: mm[2] }); }
  if ((mm = /^\/storage\/v1\/object\/sign\/([^/]+)$/.exec(u.pathname))) { const b = JSON.parse(init.body); return res(200, b.paths.map(p => ({ path: p, signedURL: '/object/sign/' + mm[1] + '/' + p + '?token=s' }))); }
  if ((mm = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(u.pathname))) { const b = STORE.get(mm[1] + '/' + dec(mm[2])); return b ? res(200, b) : res(404, {}); }
  if ((mm = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(u.pathname))) {
    const k = mm[1] + '/' + dec(mm[2]).split('/').map(decodeURIComponent).join('/');
    if (m === 'POST' || m === 'PUT') { STORE.set(k, Buffer.from(init.body)); return res(200, { Key: k }); }
    const b = STORE.get(k) || STORE.get(mm[1] + '/' + dec(mm[2])); return b ? res(200, b) : res(404, { error: 'not found' });
  }
  return res(404, {});
}
export function install(){
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', PORTAL_MAIL_OFF: '1', SITE_ORIGIN: 'https://app.local,https://bids.test' });
  delete process.env.RESEND_API_KEY; delete process.env.BID_PORTAL_AUTO;
  globalThis.fetch = async (url, init) => { const u = new URL(String(url)); if (u.host === 'sb.test') return sbFetch(String(url), init); return res(404, {}); };
}
export function fns(BUILD){
  const FN = path.join(BUILD, 'netlify/functions');
  return { hub: require(FN + '/bid-hub.js'), sp: require(FN + '/subportal.js') };
}
/* call a netlify function handler with a browser request */
export async function callFn(F, rq, origin){
  const u = new URL(rq.url()), qs = {}; u.searchParams.forEach((v, k) => { qs[k] = v; });
  const resp = await F.handler({ httpMethod: rq.method(), headers: Object.assign({ origin, 'x-nf-client-connection-ip': '10.0.0.' + (CALLS.length % 200) }, rq.headers()), queryStringParameters: qs, body: rq.postData() || '', path: u.pathname });
  let a = ''; try { const b = JSON.parse(rq.postData() || '{}'); a = b.action || b.op || ''; } catch (e) {}
  CALLS.push(u.pathname.split('/').pop() + ':' + (a || u.search.slice(1, 30)) + ':' + resp.statusCode);
  return resp;
}
/* the CRM (harness computer): bid-hub + subportal answered by the real functions; /subportal/ = the built bid site (the 🧰 Full bid portal frame) */
export async function wireCrm(c, BUILD, F){
  await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && (/^\/\.netlify\/functions\/(bid-hub|subportal)$/.test(x.pathname) || x.pathname === '/subportal/' || x.pathname === '/subportal/index.html'); }, async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.pathname.startsWith('/subportal/')) return r.fulfill({ path: path.join(BUILD, 'subportal/index.html'), contentType: 'text/html' });
    const resp = await callFn(/bid-hub$/.test(u.pathname) ? F.hub : F.sp, rq, 'https://app.local');
    return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
  });
  await c.ctx.route(u => new URL(u).host === 'sb.test', async r => {
    const rq = r.request();
    if (rq.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const x = await sbFetch(rq.url(), { method: rq.method(), headers: rq.headers(), body: rq.postDataBuffer() });
    const body = Buffer.from(await x.arrayBuffer()); const txt = body.length ? body : Buffer.from(await x.text());
    return r.fulfill({ status: x.status, headers: { 'access-control-allow-origin': '*' }, body: txt });
  });
}
/* the bid site (bids.grayco-cs.com) in its own browser context */
export async function bidsCtx(browser, BUILD, F, kind){
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block' }, kind === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1366, height: 860 } }));
  ctx.__popups = [];
  ctx.on('page', p => ctx.__popups.push(p));
  await ctx.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host === SBH && u.pathname === '/auth/v1/token') {
      const b = JSON.parse(rq.postData() || '{}'); let email = '';
      if (u.searchParams.get('grant_type') === 'password') { const a = ACC[String(b.email).toLowerCase()]; if (!a || a.pw !== b.password) return r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid_grant"}' }); email = String(b.email).toLowerCase(); }
      else { email = TOK[String(b.refresh_token).replace(/^r-/, '')]; if (!email) return r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid_grant"}' }); }
      const tok = 't-' + crypto.randomBytes(6).toString('hex'); TOK[tok] = email;
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ access_token: tok, refresh_token: 'r-' + tok, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: ACC[email].id, email } }) });
    }
    if (u.host === SBH) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    if (u.host === 'sb.test') {
      if (rq.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      const x = await sbFetch(rq.url(), { method: rq.method(), headers: rq.headers(), body: rq.postDataBuffer() });
      const body = Buffer.from(await x.arrayBuffer());
      return r.fulfill({ status: x.status, headers: { 'access-control-allow-origin': '*' }, body: body.length ? body : await x.text() });
    }
    if (u.host !== 'bids.test') return r.abort('blockedbyclient');
    if (u.pathname === '/.netlify/functions/subportal') { const resp = await callFn(F.sp, rq, 'https://bids.test'); return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body }); }
    if (u.pathname === '/.netlify/functions/gdrive') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"configured":false}' });
    const f = path.join(BUILD, 'subportal', u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    return r.fulfill({ path: path.join(BUILD, 'subportal/index.html'), contentType: 'text/html' });
  });
  return ctx;
}
export async function bidsLogin(p, email, pw){
  await p.waitForSelector('input[type=email]', { timeout: 30000 });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', pw); await p.press('input[type=password]', 'Enter');
}
export const PDF = (n, bytes) => { const head = Buffer.from('%PDF-1.4\n% sample sheet ' + n + '\n'); const tail = Buffer.from('\n%%EOF'); return Buffer.concat([head, Buffer.alloc(Math.max(0, (bytes || 2000) - head.length - tail.length), 0x20), tail]); };
export function zipOf(files){
  const parts = [], central = []; let off = 0;
  const T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = b => { let r = 0xFFFFFFFF; for (const x of b) r = T[(r ^ x) & 0xFF] ^ (r >>> 8); return (r ^ 0xFFFFFFFF) >>> 0; };
  for (const f of files) {
    const name = Buffer.from(f.name), data = f.data, c = crc(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, data); central.push(ch, name); off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cd, e]));
}
export { H };
