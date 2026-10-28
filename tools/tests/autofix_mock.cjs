// tools/tests/autofix_mock.cjs — a tiny in-memory Supabase REST + Resend + Twilio stand-in for the AUTOFIX server tests.
// Node only (no browser). Install with mock.install(); every global fetch then goes here and is recorded in mock.calls.
//   tables: gc_kv / gc_lead_inbox_kv (key, value, updated_at), gc_backups (source, taken_at, row_count), gc_staff.
//   Resend POST /emails → recorded in mock.mails; Twilio POST …/Messages.json → mock.texts.
'use strict';
const T = { gc_kv: new Map(), gc_lead_inbox_kv: new Map(), gc_backups: [], gc_staff: [] };
const mock = { T, calls: [], mails: [], texts: [], tick: 0, failKeys: new Set() };
function stamp(){ mock.tick++; return new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + mock.tick * 1000).toISOString(); }
function res(status, body){
  const txt = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => JSON.parse(txt), text: async () => txt, clone(){ return res(status, body); } };
}
function keysOf(q){
  const eq = /(?:^|&)key=eq\.([^&]+)/.exec(q); if (eq) return [decodeURIComponent(eq[1])];
  const inn = /(?:^|&)key=in\.\(([^)]*)\)/.exec(decodeURIComponent(q)); if (inn) return inn[1].split(',').map(x => x.replace(/^"|"$/g, ''));
  return null;
}
function rowOut(m, k, sel){ const r = m.get(k); const o = { key: k, value: r.value, updated_at: r.updated_at }; if (sel && !/value/.test(sel)) delete o.value; return o; }
mock.set = function(table, key, value){ T[table].set(key, { value: table === 'gc_kv' && typeof value !== 'string' ? JSON.stringify(value) : value, updated_at: stamp() }); };
mock.get = function(table, key){ const r = T[table].get(key); if (!r) return undefined; let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
mock.reset = function(){ T.gc_kv.clear(); T.gc_lead_inbox_kv.clear(); T.gc_backups.length = 0; T.gc_staff.length = 0; mock.calls.length = 0; mock.mails.length = 0; mock.texts.length = 0; mock.failKeys.clear(); };
async function handler(url, opts){
  opts = opts || {}; const method = (opts.method || 'GET').toUpperCase(), u = new URL(String(url));
  mock.calls.push({ method, url: String(url), body: opts.body });
  if (u.hostname === 'api.resend.com') { if (method === 'POST') { mock.mails.push(JSON.parse(opts.body)); return res(200, { id: 'em_' + mock.mails.length }); } return res(200, {}); }
  if (u.hostname === 'api.twilio.com') { mock.texts.push(String(opts.body)); return res(201, { sid: 'SM' + mock.texts.length }); }
  const m = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (!m) return res(404, { error: 'not mocked: ' + u.pathname });
  const table = m[1], q = u.search.slice(1), sel = (/select=([^&]*)/.exec(q) || [])[1] || '';
  if (table === 'gc_kv' || table === 'gc_lead_inbox_kv') {
    const store = T[table];
    if (method === 'GET') {
      if (/limit=1/.test(q) && !keysOf(q)) return res(200, [...store.keys()].slice(0, 1).map(k => ({ key: k })));
      const ks = keysOf(q) || [...store.keys()];
      if (ks.some(k => mock.failKeys.has(k))) return res(503, { error: 'mock outage' });
      return res(200, ks.filter(k => store.has(k)).map(k => rowOut(store, k, sel)));
    }
    if (method === 'POST') {
      const b = JSON.parse(opts.body); (Array.isArray(b) ? b : [b]).forEach(r => store.set(r.key, { value: r.value, updated_at: stamp() }));
      return res(201, '');
    }
    if (method === 'PATCH') {
      const k = keysOf(q)[0], at = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(q) || [])[1] || '');
      const cur = store.get(k); if (!cur || (at && cur.updated_at !== at)) return res(200, []);
      const b = JSON.parse(opts.body); store.set(k, { value: b.value, updated_at: stamp() }); return res(200, [rowOut(store, k)]);
    }
  }
  if (table === 'gc_backups' && method === 'GET') {
    const src = decodeURIComponent((/source=eq\.([^&]+)/.exec(q) || [])[1] || '');
    const rows = T.gc_backups.filter(r => !src || r.source === src).sort((a, b) => a.taken_at < b.taken_at ? 1 : -1);
    return res(200, rows.slice(0, 1));
  }
  if (table === 'gc_staff' && method === 'GET') return res(200, T.gc_staff);
  return res(200, []);
}
mock.install = function(){
  process.env.SUPABASE_URL = 'https://mock.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'aaa.bbb.ccc'; process.env.RESEND_API_KEY = 're_test';
  globalThis.fetch = handler; return mock;
};
module.exports = mock;
