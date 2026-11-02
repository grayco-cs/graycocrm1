// lobby_fn_mock.mjs — runs netlify/functions/lobby.js in this Node process against an in-memory gc_kv (the offline harness's
// `cloud` Map, or any Map key → { value }), for test_LOBBY.mjs and test_OFFICETV.mjs. Supabase REST / auth / storage signing,
// gc_staff and api.weather.gov are answered here; nothing leaves the machine.
import { createRequire } from 'module';
import path from 'path';
export function lobbyFn(build, cloud, emailOfToken){
  process.env.SUPABASE_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'svc-test-key';
  process.env.TWILIO_FROM = '+19015828255';
  const calls = [];
  const R = (st, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: st, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url)); calls.push(u.pathname + u.search);
    const auth = String((opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || '');
    if (u.host === 'api.weather.gov') {
      if (u.pathname.startsWith('/points/')) return R(200, { properties: { forecast: 'https://api.weather.gov/gridpoints/MEG/40,60/forecast' } });
      return R(200, { properties: { periods: [{ name: 'Today', temperature: 64, shortForecast: 'Mostly Sunny' }, { name: 'Tonight', temperature: 45, shortForecast: 'Clear' }, { name: 'Monday', temperature: 68, shortForecast: 'Chance Showers And Thunderstorms' }, { name: 'Monday Night', temperature: 52, shortForecast: 'Showers Likely' }] } });
    }
    if (u.pathname === '/auth/v1/user') { const e = emailOfToken(auth.replace(/^Bearer /, '')); return e ? R(200, { id: 'u', email: e }) : R(401, {}); }
    if (u.pathname === '/rest/v1/gc_staff') { const e = decodeURIComponent((u.searchParams.get('email') || '').replace(/^eq\./, '')); return R(200, e ? [{ email: e, role: 'staff', active: true, name: '' }] : []); }
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return R(200, []);
    if (u.pathname === '/rest/v1/gc_kv') {
      if (auth !== 'Bearer svc-test-key') return R(401, { message: 'service key expected' });
      const kq = u.searchParams.get('key') || ''; let keys = [];
      if (kq.startsWith('in.')) keys = kq.slice(3).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''));
      else if (kq.startsWith('eq.')) keys = [kq.slice(3)];
      const rows = keys.filter(k => cloud.has(k)).map(k => { const r = cloud.get(k); return { key: k, value: r.value, updated_at: r.updated_at || '2026-10-30T00:00:00Z' }; });
      return R(200, rows);
    }
    if (u.pathname.startsWith('/storage/v1/object/sign/crm-files')) {
      const b = JSON.parse(opts.body || '{}'); return R(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' })));
    }
    return R(404, {});
  };
  const require = createRequire(import.meta.url);
  const mod = require(path.resolve(build, 'netlify/functions/lobby.js'));
  async function call(method, headers, body){
    const r = await mod.handler({ httpMethod: method, headers: headers || {}, body: body ? JSON.stringify(body) : '' });
    let j = null; try { j = JSON.parse(r.body || 'null'); } catch (e) {}
    return { status: r.statusCode, json: j, headers: r.headers };
  }
  /* a Playwright route for /.netlify/functions/lobby → this handler */
  async function route(r){
    const req = r.request(), h = req.headers();
    const res = await call(req.method(), h, req.method() === 'POST' ? JSON.parse(req.postData() || '{}') : null);
    return r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(res.json) });
  }
  return { mod, call, route, calls };
}
