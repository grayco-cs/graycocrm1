// test_BOOTWATCH_fn.mjs — patch BOOTWATCH, the server side (netlify/functions/bootwatch.js) on its own. Nothing leaves the machine:
// gc_kv and the sign-in check are an in-memory stand-in. Made-up devices and people only.
//   · stores a boot in gc_kv gc_bootrep_<device> with the server key; the last 20 boots per device, newest first; the same boot
//     sent again replaces itself; an earlier boot that never got out (prevBoot) is stored too
//   · 8 KB at most (413); bad JSON / device id / boot → 400; a browser call from another site → 403; POST only
//   · nothing that looks like a password or a token is kept (by name or by shape); e-mail addresses in texts → "@"; an
//     e-mail in the body is never kept — only the one from a real sign-in token (checked with Supabase)
//   · rate limits: a new boot at most every 30 s per device; the same boot again after 3 s, 6 times; 200 a device a day;
//     a new device refused when 1000 devices reported in the last 24 h
//   · no service key → 500, nothing written
//   node tools/tests/test_BOOTWATCH_fn.mjs
import { createRequire } from 'module'; import path from 'path'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-key-test';
process.env.SUPABASE_ANON_KEY = 'anon-test';
delete process.env.SITE_ORIGIN;
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); } };

/* gc_kv + /auth/v1/user, in memory */
const KV = new Map(); const CALLS = []; let DEVICES24 = 0;
const TOKENS = { 'tok-pm': 'pm.demo@grayco-cs.com' };
globalThis.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url); const h = init.headers || {}; CALLS.push({ url: String(url), method: init.method || 'GET', headers: h, body: init.body });
  const res = (status, body, hd) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => (hd || {})[k.toLowerCase()] || null }, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.host !== 'sb.test') throw new Error('unexpected host ' + u.host);
  if (u.pathname === '/auth/v1/user') { const t = String(h.Authorization || '').replace(/^Bearer /, ''); return TOKENS[t] ? res(200, { id: 'x', email: TOKENS[t] }) : res(401, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (h.apikey !== 'svc-key-test' || h.Authorization !== 'Bearer svc-key-test') return res(401, { message: 'no key' });
    if ((init.method || 'GET') === 'HEAD') return res(200, null, { 'content-range': '*/' + DEVICES24 });
    if ((init.method || 'GET') === 'POST') { const r = JSON.parse(init.body); KV.set(r.key, { value: JSON.parse(JSON.stringify(r.value)), updated_at: r.updated_at }); return res(201, null); }
    const k = decodeURIComponent((u.searchParams.get('key') || '').replace(/^eq\./, '')); const r = KV.get(k);
    return res(200, r ? [{ value: r.value, updated_at: r.updated_at }] : []);
  }
  return res(404, {});
};
const fn = require(path.join(ROOT, 'netlify/functions/bootwatch.js'));
const realNow = Date.now; let NOW = Date.parse('2026-11-18T15:00:00Z'); Date.now = () => NOW;
const call = async (body, o) => { o = o || {}; const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = Object.assign({ origin: 'https://crm.grayco-cs.com', 'content-type': 'text/plain;charset=UTF-8' }, o.headers || {});
  const r = await fn.handler({ httpMethod: o.method || 'POST', headers, body: raw, isBase64Encoded: false }); let j = null; try { j = JSON.parse(r.body); } catch (e) {} return { status: r.statusCode, j }; };
let bootN = 0;
const boot = o => Object.assign({ id: 'b' + (++bootN).toString(36) + 'xyz', at: new Date(NOW).toISOString(), build: '33.269-2026-11-18-r36i', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile', kind: 'phone', sa: true,
  sw: '/crm-push-sw.js', sess: false, m: { html: 800, scripts: 2100, gate: 2300 }, p: {}, si: [], errs: [], stuck: [] }, o || {});
const row = d => (KV.get('gc_bootrep_' + d) || {}).value;
const tick = ms => { NOW += ms; };

console.log('1 · storing');
{ const b = boot({ p: { signin: 1 }, m: { html: 700, gate: 2000, try: 9000, err: 9600, errV: 'That email and password do not match a GrayCo sign-in.' },
    si: [{ t: 9000, dom: 'grayco-cs.com', h: 'a1b2c3d4e5f6', err: 'That email and password do not match a GrayCo sign-in.', errT: 9600 }] });
  const r = await call({ v: 1, dev: 'Pdev1abc', boot: b });
  ok(r.status === 200 && r.j.ok, 'a boot is accepted', r);
  const w = CALLS.filter(c => c.method === 'POST' && /gc_kv/.test(c.url)).pop();
  ok(w && w.headers.apikey === 'svc-key-test' && /on_conflict=key/.test(w.url) && /merge-duplicates/.test(w.headers.Prefer), 'written to gc_kv with the server key (upsert on key)');
  const v = row('Pdev1abc');
  ok(v && v.dev === 'Pdev1abc' && v.boots.length === 1 && v.boots[0].id === b.id && v.boots[0].m.err === 9600 && v.boots[0].si[0].dom === 'grayco-cs.com' && v.boots[0].si[0].h === 'a1b2c3d4e5f6', 'stored as gc_bootrep_<device>: the steps, the sign-in try (domain + hash)', v);
  ok(v.kind === 'phone' && v.sa === true && v.build === '33.269-2026-11-18-r36i' && !v.email, 'phone / home-screen app / build kept; no e-mail without a sign-in', v);
  /* the same boot again (3 s later): replaces itself */
  tick(3500); b.m.signed = 12000; const r2 = await call({ v: 1, dev: 'Pdev1abc', boot: b });
  ok(r2.status === 200 && row('Pdev1abc').boots.length === 1 && row('Pdev1abc').boots[0].m.signed === 12000, 'the same boot sent again replaces itself', row('Pdev1abc').boots);
}
console.log('2 · the last 20 boots, newest first; a boot that never got out');
{ for (let i = 0; i < 24; i++) { tick(31000); const r = await call({ v: 1, dev: 'Pdev2abc', boot: boot() }); if (r.status !== 200) { ok(false, 'write ' + i, r); break; } }
  const v = row('Pdev2abc'); ok(v.boots.length === 20, 'only the last 20 boots are kept', v.boots.length);
  ok(v.boots.every((x, i) => i === 0 || x.at <= v.boots[i - 1].at) && v.boots[0].id === 'b' + bootN.toString(36) + 'xyz', 'newest first');
  tick(31000); const prev = boot({ at: new Date(NOW - 15e3).toISOString(), p: { stuck: 1 }, stuck: [{ t: 20100, k: 'screen', why: 'no first screen 20 s: blank' }] }); const cur = boot();
  await call({ v: 1, dev: 'Pdev2abc', boot: cur, prevBoot: prev });
  const v2 = row('Pdev2abc'); ok(v2.boots.some(x => x.id === prev.id && x.stuck[0].k === 'screen') && v2.boots[0].id === cur.id, 'an earlier boot that never got out (prevBoot) is stored too, in time order', v2.boots.slice(0, 3).map(x => x.id)); }
console.log('3 · size limit and bad input');
{ tick(31000); const big = boot({ errs: [{ t: 1, m: 'x'.repeat(9000) }] });
  let r = await call({ v: 1, dev: 'Pdev3abc', boot: big }); ok(r.status === 413 && !row('Pdev3abc'), 'over 8 KB → 413, nothing written', r);
  const at8 = JSON.stringify({ v: 1, dev: 'Pdev3abc', boot: boot(), pad: 'y'.repeat(8192) }); r = await call(at8); ok(r.status === 413, 'any body over 8192 bytes → 413');
  r = await call('{not json'); ok(r.status === 400, 'bad JSON → 400');
  r = await call({ v: 1, dev: '../../etc', boot: boot() }); ok(r.status === 400, 'a device id that is not a plain id → 400');
  r = await call({ v: 1, dev: 'Pdev3abc', boot: { id: 'x' } }); ok(r.status === 400, 'a boot without a proper id → 400');
  r = await call({ v: 1, dev: 'Pdev3abc', boot: boot() }, { method: 'GET' }); ok(r.status === 405, 'GET → 405');
  r = await call({ v: 1, dev: 'Pdev3abc', boot: boot() }, { headers: { origin: 'https://evil.example' } }); ok(r.status === 403 && !row('Pdev3abc'), 'a browser call from another site → 403');
  r = await call({ v: 1, dev: 'Pdev3abc', boot: boot() }, { headers: { origin: 'https://deploy-preview-12--graycocrm1.netlify.app' } }); ok(r.status === 200, 'a deploy preview of the CRM is allowed'); }
console.log('4 · nothing that looks like a password or a token is kept');
{ tick(31000); const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSIsImVtYWlsIjoieEB5LnoifQ.c2lnbmF0dXJlc2lnbmF0dXJl';
  const b = boot({ password: 'Hunter2!', token: JWT, access_token: JWT, email: 'someone@grayco-cs.com',
    errs: [{ t: 5, m: 'fetch failed Authorization: Bearer ' + JWT + ' password=Hunter2! for pm.demo@grayco-cs.com' }, { t: 6, m: 'key abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456789 leaked', password: 'x' }],
    si: [{ t: 9, dom: 'grayco-cs.com', h: 'a1b2c3d4e5f6', password: 'Hunter2!', pw: 'Hunter2!', email: 'pm.demo@grayco-cs.com', err: 'wrong password Hunter2! for pm.demo@grayco-cs.com' }],
    m: { gate: 10, errV: 'token=' + JWT }, p: { signin: 1, password: 1, auth_token: 1 }, gateMsg: 'Signed out. pw: Hunter2!', view: 'desk ' + JWT });
  const r = await call({ v: 1, dev: 'Pdev4abc', boot: b, password: 'Hunter2!', email: 'claimed@grayco-cs.com' });
  const js = JSON.stringify(row('Pdev4abc'));
  ok(r.status === 200, 'accepted (the rest is kept)', r);
  ok(!/Hunter2/.test(js), 'the password is nowhere in what is stored', js.slice(0, 400));
  ok(!/eyJ/.test(js) && !/abcdefghijklmnopqrstuvwxyzABCDEF/.test(js), 'no token / key-shaped string is stored');
  ok(!/pm\.demo@|someone@|claimed@/.test(js) && !row('Pdev4abc').email, 'no e-mail from the body (texts → "@", fields dropped)');
  ok(!/"password"|"pw"|"token"|"access_token"|auth_token/.test(js), 'password / token fields are dropped by name');
  const st = row('Pdev4abc').boots[0]; ok(st.si[0].dom === 'grayco-cs.com' && st.si[0].h === 'a1b2c3d4e5f6' && /fetch failed/.test(st.errs[0].m), 'the useful parts stay (domain, hash, the error text)', st); }
console.log('5 · the signed-in e-mail: only from a real sign-in token');
{ tick(31000); let r = await call({ v: 1, dev: 'Pdev5abc', boot: boot() }, { headers: { authorization: 'Bearer tok-forged' } });
  ok(r.status === 200 && !row('Pdev5abc').email, 'a token Supabase does not know: no e-mail');
  tick(31000); const b = boot({ m: { gate: 1, try: 2, signed: 3, signedV: 'online', paint: 4, paintV: 'field home' } });
  r = await call({ v: 1, dev: 'Pdev5abc', boot: b }, { headers: { authorization: 'Bearer tok-pm' } });
  const v = row('Pdev5abc');
  ok(r.status === 200 && v.email === 'pm.demo@grayco-cs.com' && v.emailAt && v.boots[0].email === 'pm.demo@grayco-cs.com', 'signed in (a real token): the e-mail is recorded on the device and that boot', v);
  ok(CALLS.some(c => /\/auth\/v1\/user$/.test(c.url) && c.headers.apikey === 'anon-test'), 'the token is checked with Supabase (/auth/v1/user)');
  tick(31000); await call({ v: 1, dev: 'Pdev5abc', boot: boot() }); ok(row('Pdev5abc').email === 'pm.demo@grayco-cs.com', 'a later signed-out boot keeps the device\'s last known person'); }
console.log('6 · rate limits');
{ tick(31000); fn._test.MEM.clear();
  let r = await call({ v: 1, dev: 'Pdev6abc', boot: boot() }); ok(r.status === 200, 'first boot of a device: stored');
  tick(5000); r = await call({ v: 1, dev: 'Pdev6abc', boot: boot() }); ok(r.status === 429, 'a NEW boot 5 s later → 429', r);
  fn._test.MEM.clear(); r = await call({ v: 1, dev: 'Pdev6abc', boot: boot() }); ok(r.status === 429, '… also on another function instance (the limit is kept in the row)', r);
  tick(26000); r = await call({ v: 1, dev: 'Pdev6abc', boot: boot() }); ok(r.status === 200, 'a new boot 31 s after the last write: stored');
  const same = boot(); tick(31000); await call({ v: 1, dev: 'Pdev6abc', boot: same });
  tick(1000); r = await call({ v: 1, dev: 'Pdev6abc', boot: same }); ok(r.status === 429, 'the same boot again after 1 s → 429');
  let okN = 1; for (let i = 0; i < 8; i++) { tick(3200); r = await call({ v: 1, dev: 'Pdev6abc', boot: same }); if (r.status === 200) okN++; }
  ok(okN === 6, 'the same boot: at most 6 writes (3 s apart) within 30 s', okN);
  /* 200 a day */
  const v = row('Pdev6abc'); v.rl.n = 199; KV.set('gc_bootrep_Pdev6abc', { value: v }); fn._test.MEM.clear();
  tick(31000); r = await call({ v: 1, dev: 'Pdev6abc', boot: boot() }); ok(r.status === 200, 'write 200 of the day: stored');
  tick(31000); r = await call({ v: 1, dev: 'Pdev6abc', boot: boot() }); ok(r.status === 429 && /Daily/.test(r.j.error), 'write 201 of the day → 429', r);
  tick(24 * 3600e3); r = await call({ v: 1, dev: 'Pdev6abc', boot: boot() }); ok(r.status === 200, 'the next day: stored again');
  DEVICES24 = 1000; tick(31000); r = await call({ v: 1, dev: 'Pnewdev1', boot: boot() }); ok(r.status === 429 && !row('Pnewdev1'), 'a new device while 1000 devices reported in 24 h → 429 (a flood of made-up ids)');
  tick(31000); r = await call({ v: 1, dev: 'Pdev6abc', boot: boot() }); ok(r.status === 200, '… a known device is still stored'); DEVICES24 = 0; }
console.log('7 · no server key');
{ const k = process.env.SUPABASE_SERVICE_KEY; delete process.env.SUPABASE_SERVICE_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY; tick(31000); const n0 = KV.size;
  const r = await call({ v: 1, dev: 'Pdev7abc', boot: boot() }); ok(r.status === 500 && /SUPABASE_SERVICE_KEY/.test(r.j.error) && KV.size === n0, 'no service key → 500 with what to set, nothing written', r);
  process.env.SUPABASE_SERVICE_KEY = k; }
console.log('8 · the anon key is never sent anywhere but the sign-in check, and never echoed');
{ const anon = require('fs').readFileSync(path.join(ROOT, 'netlify/functions/bootwatch.js'), 'utf8').match(/GC_SB_DEFAULT_ANON = '([^']+)'/)[1];
  delete process.env.SUPABASE_ANON_KEY; tick(31000); const r = await call({ v: 1, dev: 'Pdev8abc', boot: boot() }, { headers: { authorization: 'Bearer tok-pm' } });
  ok(r.status === 200 && !JSON.stringify(r.j).includes(anon.slice(20, 40)) && !JSON.stringify(row('Pdev8abc')).includes(anon.slice(20, 40)), 'the answer and the row never carry the key');
  ok(CALLS.filter(c => JSON.stringify(c.headers).includes(anon.slice(20, 40))).every(c => /\/auth\/v1\/user$/.test(c.url)), 'the built-in public key is only used for the token check'); }
Date.now = realNow;
console.log('RESULT ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
