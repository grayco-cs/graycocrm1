// fake_web.mjs — an in-memory Supabase (gc_kv with compare-and-set, gc_lead_inbox_kv, gc_staff, auth, storage,
// RoofScout usage), the Census geocoder, Google Solar, Resend, Turnstile and Anthropic — no network, no e-mail.
export const W = { kv: new Map(), inbox: new Map(), files: new Map(), sent: [], calls: [], ai: [], aiQ: [], solarUsed: 0, inboxTable: true, spRows: 0,
  tokens: { 'tok-admin': 'wjohnson@grayco-cs.com', 'tok-pm': 'sbiffle@grayco-cs.com', 'tok-office': 'office@grayco-cs.com', 'tok-stranger': 'x@example.com' } };
export const STAFF = { 'wjohnson@grayco-cs.com': { role: 'admin', name: 'Wesley Johnson' }, 'nthomas@grayco-cs.com': { role: 'admin', name: 'Nick Thomas' }, 'sbiffle@grayco-cs.com': { role: 'staff', name: 'Steven Biffle' }, 'office@grayco-cs.com': { role: 'staff', name: 'Brittany Pucket' } };
let tick = 0;
const iso = () => new Date(Date.now() + (tick++)).toISOString();
function R(status, body, raw){ const txt = raw != null ? raw : JSON.stringify(body); return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(txt), text: async () => txt, arrayBuffer: async () => Buffer.from(txt) }; }
function table(path){ return path === '/rest/v1/gc_kv' ? W.kv : path === '/rest/v1/gc_lead_inbox_kv' ? W.inbox : null; }
function sel(row, s){ const o = {}; (s || 'key,value,updated_at').split(',').forEach(f => { if (f in row) o[f] = row[f]; }); return o; }
export function kvset(k, v){ W.kv.set(k, { key: k, value: v, updated_at: iso() }); }
export function kvget(k){ const r = W.kv.get(k) || W.inbox.get(k); if (!r) return undefined; let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }
export function install(){ global.fetch = fake; }
async function fake(url, init = {}){
  const u = new URL(url); const m = (init.method || 'GET').toUpperCase(); const hd = init.headers || {};
  const auth = String(hd.Authorization || hd.authorization || '');
  W.calls.push(m + ' ' + u.host + u.pathname);
  if (u.host === 'sb.test') {
    if (u.pathname === '/auth/v1/user') { const e = W.tokens[auth.replace('Bearer ', '')]; return e ? R(200, { id: 'u-' + e, email: e }) : R(401, {}); }
    if (hd.apikey !== 'svc-test-key') return R(401, { message: 'no service key' });
    if (u.pathname === '/rest/v1/gc_staff') {
      const e = (u.searchParams.get('email') || '').slice(3), role = (u.searchParams.get('role') || '').slice(3);
      let rows = Object.keys(STAFF).map(k => ({ email: k, name: STAFF[k].name, role: STAFF[k].role, active: true }));
      if (e) rows = rows.filter(r => r.email === e); if (role) rows = rows.filter(r => r.role === role);
      return R(200, rows);
    }
    const T = table(u.pathname);
    if (T) {
      if (T === W.inbox && !W.inboxTable) return R(404, { code: 'PGRST205', message: 'does not exist' });
      const kq = u.searchParams.get('key') || '', at = u.searchParams.get('updated_at') || '';
      let rows = [...T.values()];
      if (kq.startsWith('eq.')) rows = rows.filter(r => r.key === decodeURIComponent(kq.slice(3)));
      else if (kq.startsWith('in.(')) { const ks = kq.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); rows = rows.filter(r => ks.includes(r.key)); }
      if (m === 'GET') { const lim = +u.searchParams.get('limit'); if (lim) rows = rows.slice(0, lim); return R(200, rows.map(r => sel(r, u.searchParams.get('select')))); }
      const body = init.body ? JSON.parse(init.body) : null;
      if (m === 'POST') {
        const list = Array.isArray(body) ? body : [body];
        const upsert = u.searchParams.get('on_conflict') === 'key' || /merge-duplicates/.test(String(hd.Prefer || ''));
        for (const b of list) { if (!upsert && T.has(b.key)) return R(409, { code: '23505' }); T.set(b.key, { key: b.key, value: b.value, updated_at: b.updated_at || iso() }); }
        return R(201, []);
      }
      if (m === 'PATCH') {
        const want = at.startsWith('eq.') ? decodeURIComponent(at.slice(3)) : null;
        const hit = rows.filter(r => want == null || r.updated_at === want);
        hit.forEach(r => { Object.assign(r, body); });
        return R(200, hit.map(r => sel(r)));
      }
      if (m === 'DELETE') { rows.forEach(r => T.delete(r.key)); return R(204, null, ''); }
    }
    if (u.pathname === '/rest/v1/rs_settings') return R(200, [{ data: { solar: { monthlyLimit: 500 } } }]);
    if (u.pathname === '/rest/v1/rs_usage') return R(200, [{ count: W.solarUsed }]);
    if (u.pathname === '/rest/v1/rpc/rs_bump_usage') { W.solarUsed++; return R(200, W.solarUsed); }
    if (u.pathname === '/rest/v1/brain_files') return R(404, { message: 'no table' });
    if (u.pathname === '/rest/v1/sp_rows') { W.spRows++; return R(404, { message: 'no table' }); }
    if (u.pathname.startsWith('/storage/v1/object/crm-files/')) {
      const p = u.pathname.split('/').pop();
      if (m === 'POST') { W.files.set(p, Buffer.from(init.body)); return R(200, { Key: p }); }
      const f = W.files.get(p); return f ? { ok: true, status: 200, arrayBuffer: async () => f.buffer.slice(f.byteOffset, f.byteOffset + f.length) } : R(404, {});
    }
    return R(404, { message: 'not faked: ' + u.pathname });
  }
  if (u.host === 'geocoding.geo.census.gov') {
    const a = (u.searchParams.get('address') || '').toLowerCase();
    if (/nowhere/.test(a)) return R(200, { result: { addressMatches: [] } });
    return R(200, { result: { addressMatches: [{ matchedAddress: a.toUpperCase(), coordinates: { x: -89.84, y: 35.2 } }] } });
  }
  if (u.host === 'solar.googleapis.com') {
    if (u.searchParams.get('key') !== 'solar-test-key') return R(403, { error: { message: 'bad key' } });
    return R(200, { imageryDate: { year: 2025, month: 4, day: 2 }, imageryQuality: 'HIGH', center: { latitude: 35.2, longitude: -89.84 },
      solarPotential: { wholeRoofStats: { areaMeters2: 2000 / 10.7639104, groundAreaMeters2: 1700 / 10.7639104 }, roofSegmentStats: [{ pitchDegrees: 26.57, stats: { areaMeters2: 1400 / 10.7639104 } }, { pitchDegrees: 18.4, stats: { areaMeters2: 600 / 10.7639104 } }] } });
  }
  if (u.host === 'api.resend.com') { const b = JSON.parse(init.body); W.sent.push(b); return R(200, { id: 'em' + W.sent.length }); }
  if (u.host === 'challenges.cloudflare.com') { const ok = /response=good/.test(String(init.body)); return R(200, { success: ok }); }
  if (u.host === 'api.anthropic.com') {
    const b = JSON.parse(init.body); W.ai.push({ body: b, headers: hd });
    const n = W.aiQ.shift();
    if (!n) return R(500, { type: 'error', error: { type: 'api_error', message: 'no scripted answer' } });
    if (typeof n === 'function') return n(b);
    if (n.status) return R(n.status, n.body);
    return R(200, Object.assign({ id: 'msg_' + W.ai.length, type: 'message', role: 'assistant', model: b.model, usage: { input_tokens: 100, output_tokens: 20 } }, n));
  }
  throw new Error('BLOCKED network call in a test: ' + url);
}
export function reset(){ W.kv.clear(); W.inbox.clear(); W.files.clear(); W.sent.length = 0; W.calls.length = 0; W.ai.length = 0; W.aiQ.length = 0; W.solarUsed = 0; W.inboxTable = true; W.spRows = 0; }
