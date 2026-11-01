// officefix_bridge.mjs — patch OFFICEFIX: the CRM page's /.netlify/functions/* calls answered by the REAL function handlers,
// in this process, over a fake Supabase (Node side) that shares the harness's in-memory gc_kv (`cloud`).
//   * gc_staff rows are the test's (the office as production has her: role 'staff', no profile, payroll on — her people
//     list role "Office Admin" decides);
//   * /auth/v1/user answers the harness's browser tokens (utok-<account id>-N) and the test's own (ntok:<email>);
//   * every other host (Resend, Twilio, Google, CompanyCam …) is answered 200 {} and recorded — nothing leaves;
//   * like Netlify in production: a function with a schedule in netlify.toml cannot be called by its URL (403), and a
//     *-background function answers 202 at once.
// No secrets: the service key is a fixed fake string.
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';

export function installBridge({ build, cloud, accounts, staffRows }){
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'svc-test-fake';
  process.env.PORTAL_MAIL_OFF = '1'; process.env.CUST_QUIET_OFF = '1';
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'placeholder-not-a-key';   /* the AI calls reach the fake host (200 {}) */
  delete process.env.RESEND_API_KEY; delete process.env.TWILIO_AUTH_TOKEN;
  const FN = path.join(build, 'netlify', 'functions');
  const req = createRequire(path.join(FN, 'x.js'));
  const toml = fs.readFileSync(path.join(build, 'netlify.toml'), 'utf8');
  const SCHED = new Set(); { const re = /\[functions\."?([\w-]+)"?\]\s*\n((?:[^\[\n].*\n|\n)*)/g; let m; while ((m = re.exec(toml))) if (/^\s*schedule\s*=/m.test(m[2])) SCHED.add(m[1]); }
  const tables = new Map([['gc_kv', cloud], ['gc_staff', new Map(staffRows.map(r => [r.email, Object.assign({}, r)]))]]);
  const T = n => { if (!tables.has(n)) tables.set(n, new Map()); return tables.get(n); };
  const EXT = [], SB = [];
  const idToEmail = id => Object.keys(accounts).find(e => accounts[e].id === id) || '';
  const emailOf = auth => { const t = String(auth || '').replace(/^Bearer\s+/i, ''); let m = /^utok-(.+)-\d+$/.exec(t); if (m) return idToEmail(m[1]); m = /^ntok:(.+)$/.exec(t); return m ? m[1] : ''; };
  const realFetch = globalThis.fetch;
  const resp = (status, body, hd) => new Response(body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body)), { status, headers: Object.assign({ 'content-type': 'application/json' }, hd || {}) });
  function match(row, f, op){
    const v = row[f]; const sv = v == null ? null : String(v);
    if (op.startsWith('not.')) return !match(row, f, op.slice(4));
    if (op.startsWith('eq.')) return sv === op.slice(3);
    if (op.startsWith('neq.')) return sv !== op.slice(4);
    if (op.startsWith('in.')) return op.slice(3).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')).includes(sv);
    if (op.startsWith('like.') || op.startsWith('ilike.')) { const pat = op.replace(/^i?like\./, ''); const re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', op.startsWith('i') ? 'i' : ''); return sv != null && re.test(sv); }
    if (op.startsWith('gt.')) return sv != null && sv > op.slice(3);
    if (op.startsWith('gte.')) return sv != null && sv >= op.slice(4);
    if (op.startsWith('lt.')) return sv != null && sv < op.slice(3);
    if (op.startsWith('lte.')) return sv != null && sv <= op.slice(4);
    if (op === 'is.null') return v == null;
    if (op === 'is.true') return v === true;
    if (op === 'is.false') return v === false;
    return true;
  }
  const NOTF = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
  async function fakeSb(u, init){
    const m = String((init && init.method) || 'GET').toUpperCase(), H = new Headers((init && init.headers) || {});
    SB.push({ t: Date.now(), m, p: u.pathname + u.search.slice(0, 120) });
    if (u.pathname === '/auth/v1/user') { const e = emailOf(H.get('authorization')); return e ? resp(200, { id: 'id-' + e, email: e }) : resp(401, { msg: 'bad jwt' }); }
    if (u.pathname.startsWith('/auth/')) return resp(200, {});
    if (u.pathname.startsWith('/storage/')) return resp(200, m === 'GET' ? [] : { Key: 'x' });
    if (u.pathname.startsWith('/rest/v1/rpc/')) return resp(200, 'null');
    if (!u.pathname.startsWith('/rest/v1/')) return resp(404, {});
    const tbl = T(u.pathname.slice(9)), pk = u.pathname.endsWith('gc_staff') ? 'email' : 'key';
    const filt = [...u.searchParams.entries()].filter(([k]) => !NOTF.has(k));
    const pick = () => [...tbl.values()].filter(r => filt.every(([f, op]) => match(r, f, op)));
    const body = init && init.body != null ? String(init.body) : '';
    const want = /return=representation/.test(H.get('prefer') || '');
    if (m === 'HEAD') { const n = pick().length; return new Response(null, { status: 200, headers: { 'content-range': '0-' + Math.max(0, n - 1) + '/' + n } }); }
    if (m === 'GET') {
      let rows = pick(); const lim = +u.searchParams.get('limit'); const off = +u.searchParams.get('offset') || 0; rows = rows.slice(off, lim ? off + lim : undefined);
      const sel = (u.searchParams.get('select') || '*').split(',').map(x => x.split(':').pop().split('->')[0].trim());
      if (sel.indexOf('*') < 0) rows = rows.map(x => { const o = {}; sel.forEach(f => { if (f in x) o[f] = x[f]; }); return o; });
      return resp(200, rows, { 'content-range': '0-' + rows.length + '/' + rows.length });
    }
    if (m === 'DELETE') { const rows = pick(); rows.forEach(r => tbl.delete(r[pk])); return resp(want ? 200 : 204, want ? rows : null); }
    let bd = null; try { bd = JSON.parse(body || 'null'); } catch (e) {}
    const now = new Date().toISOString();
    if (m === 'PATCH') { const rows = pick(); rows.forEach(r => { Object.assign(r, bd || {}); if (!(bd && bd.updated_at)) r.updated_at = now; }); return resp(want ? 200 : 204, want ? rows : null); }
    if (m === 'POST') {
      const out = []; (Array.isArray(bd) ? bd : [bd]).forEach((row, i) => { if (!row || typeof row !== 'object') return; const id = row[pk] != null ? row[pk] : 'auto-' + Date.now() + '-' + i; const prev = tbl.get(id); const nr = Object.assign({}, prev || {}, row, { [pk]: id }); if (!row.updated_at) nr.updated_at = now; tbl.set(id, nr); out.push(nr); });
      return resp(201, want ? out : null);
    }
    return resp(405, {});
  }
  globalThis.fetch = async function(input, init){
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
    if (!init && input && typeof input === 'object' && !(input instanceof URL)) init = { method: input.method, headers: input.headers, body: input.body };
    let u; try { u = new URL(url); } catch (e) { return realFetch(input, init); }
    if (/supabase\.co$/.test(u.host)) return fakeSb(u, init || {});
    EXT.push({ t: Date.now(), host: u.host, p: u.pathname, m: String((init && init.method) || 'GET'), b: init && typeof init.body === 'string' ? init.body.slice(0, 600) : '' });
    return resp(200, {});
  };
  const mods = {};
  function handlerOf(name){
    if (!(name in mods)) { const f = path.join(FN, name + '.js'); mods[name] = null; if (fs.existsSync(f)) { const mod = req(f); mods[name] = mod.handler || (mod.default && mod.default.handler) || null; } }
    return mods[name];
  }
  /* one Netlify-shaped call: { method, name, search, headers, body } → { status, headers, body } */
  async function call({ method, name, search, headers, body }){
    if (SCHED.has(name)) return { status: 403, headers: { 'content-type': 'text/plain' }, body: 'Scheduled functions cannot be invoked by URL (like Netlify in production)', sched: true };
    const h = handlerOf(name); if (!h) return { status: 404, headers: {}, body: 'no function ' + name };
    const qs = Object.fromEntries(new URLSearchParams(search || ''));
    const hd = Object.assign({}, headers || {}, { origin: 'https://crm.grayco-cs.com', host: 'crm.grayco-cs.com', 'x-nf-client-connection-ip': '10.0.0.9', 'client-ip': '10.0.0.9' });
    const ev = { httpMethod: method, path: '/.netlify/functions/' + name, rawUrl: 'https://crm.grayco-cs.com/.netlify/functions/' + name + (search || ''), rawQuery: String(search || '').replace(/^\?/, ''),
      headers: hd, multiValueHeaders: {}, queryStringParameters: qs, multiValueQueryStringParameters: {}, body: body == null ? null : body, isBase64Encoded: false };
    if (/-background$/.test(name)) { Promise.resolve().then(() => h(ev, {})).catch(() => {}); return { status: 202, headers: {}, body: '' }; }
    const out = await Promise.race([Promise.resolve().then(() => h(ev, {})), new Promise(r => setTimeout(() => r({ __timeout: true }), +(process.env.FN_TIMEOUT || 25000)))]);
    if (!out || out.__timeout) return { status: 504, headers: {}, body: out && out.__timeout ? 'timeout' : 'no answer', timeout: !!(out && out.__timeout) };
    let b = out.body == null ? '' : out.body; if (out.isBase64Encoded) b = Buffer.from(String(b), 'base64');
    return { status: out.statusCode || 200, headers: Object.assign({}, out.headers || {}), body: b };
  }
  return { call, EXT, SB, SCHED, tables, emailOf };
}

/* the browser side: every /.netlify/functions/* of one computer → the real handler; each call is logged in c.calls */
export async function routeFunctions(c, bridge){
  c.calls = [];
  await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && x.pathname.startsWith('/.netlify/functions/'); }, async r => {
    const rq = r.request(), u = new URL(rq.url()), name = u.pathname.split('/')[3] || '', m = rq.method();
    if (m === 'OPTIONS') return r.fulfill({ status: 204, body: '' });
    const rec = { t: Date.now(), fn: name, m, q: u.search.slice(0, 160), b: (rq.postData() || '').slice(0, 200), phase: c.phase || '' };
    c.calls.push(rec);
    let out; try { out = await bridge.call({ method: m, name, search: u.search, headers: rq.headers(), body: rq.postData() }); }
    catch (e) { out = { status: 500, headers: {}, body: JSON.stringify({ error: 'handler threw: ' + (e && e.message) }) }; rec.threw = String(e && e.stack || e).slice(0, 400); }
    rec.status = out.status; rec.ms = Date.now() - rec.t; if (out.sched) rec.sched = true;
    if (out.status >= 400) rec.err = (Buffer.isBuffer(out.body) ? '' : String(out.body)).slice(0, 200);
    const hd = {}; Object.keys(out.headers || {}).forEach(k => { if (!/^access-control|^vary$/i.test(k)) hd[k] = String(out.headers[k]); });
    try { await r.fulfill({ status: out.status, headers: hd, body: out.body }); } catch (e) {}
  });
}
