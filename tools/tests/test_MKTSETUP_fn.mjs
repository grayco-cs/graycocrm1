// test_MKTSETUP_fn.mjs <functions dir> — patch MKTSETUP server side, offline: 🧰 Marketing setup statuses through soc.js
// (op mkt_setup / mkt_setup_set → _lib/mm.js setupRead / setupSet, gc_kv gc_mkt_admin.setup).
// The Marketing Manager (a gc_staff row with profile "marketing", never active staff) can read the statuses and set the status of a
// known, non-admin card — and nothing else: not the "Admin only" card, not an unknown key, not a made-up status, not his own
// settings (gc_mkt_admin.mm), not any other gc_kv row. Admins set every card; the office / a PM are refused. A failed read writes nothing.
// The world (database + fetch mock) is the one of test_MM_fn.mjs.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const F = process.argv[2];
let pass = 0, fail = 0;
function ok(c, msg, extra){ if (c) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '  :: ' + JSON.stringify(extra).slice(0, 700) : '')); } }
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc', RESEND_API_KEY: 're_test', CRM_URL: 'https://crm.grayco-cs.com', MKT2_SECRET: 'a-long-test-secret-123456', SITE_ORIGIN: 'https://crm.grayco-cs.com', MKT_SEND_GAP_MS: '0', NETLIFY_DEV: '' });
['ANTHROPIC_API_KEY', 'TIKTOK_CLIENT_KEY', 'LINKEDIN_CLIENT_ID', 'BRIGHTLOCAL_API_KEY', 'META_PAGE_ID', 'AYRSHARE_API_KEY', 'STAFF_EMAILS', 'TWILIO_AUTH_TOKEN'].forEach(k => delete process.env[k]);
/* ── the world: the CRM's data with real-looking customer contact data that must never reach him ── */
const PII = ['Mary Kline', 'Kline', 'mary@kline.example', '9015550100', '(901) 555-0100', '88 Maple', 'Bob Stone', 'bob@stone.example', '12 Oak St', 'Luis Ortiz', '5 Elm Cv', 'payroll-secret', '18000', '55000'];
const T = { gc_kv: new Map(), gc_lead_inbox_kv: new Map() }, sent = [];
const TOK = { 'tok-admin': 'wjohnson@grayco-cs.com', 'tok-office': 'office@grayco-cs.com', 'tok-mm': 'mm@grayco-cs.com', 'tok-pm': 'pm@grayco-cs.com' };
const STAFF = { 'wjohnson@grayco-cs.com': { email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', active: true, profile: null, mkt_active: false },
  'office@grayco-cs.com': { email: 'office@grayco-cs.com', name: 'Office', role: 'staff', active: true, profile: 'office', mkt_active: false },
  'pm@grayco-cs.com': { email: 'pm@grayco-cs.com', name: 'Pat PM', role: 'staff', active: true, profile: 'pm', mkt_active: false },
  'mm@grayco-cs.com': { email: 'mm@grayco-cs.com', name: 'Mark Eting', role: 'staff', active: false, profile: 'marketing', mkt_active: true } };
let clock = 0; const stamp = () => new Date(Date.now() + (++clock)).toISOString();
function R(status, body, raw){ return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => raw != null ? raw : JSON.stringify(body), arrayBuffer: async () => Buffer.from('JPEG'), headers: { get: k => /content-type/i.test(k) ? 'image/jpeg' : null } }; }
function filt(rows, qs){ for (const [k, v] of qs) { if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue; if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3)); else if (v.startsWith('in.(')) { const xs = v.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')); rows = rows.filter(r => xs.includes(String(r[k]))); } else if (v.startsWith('like.')) { const re = new RegExp('^' + v.slice(5).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); rows = rows.filter(r => re.test(String(r[k]))); } } return rows; }
const storagePuts = [];
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  let body = null; try { body = init.body && typeof init.body === 'string' && (init.body[0] === '{' || init.body[0] === '[') ? JSON.parse(init.body) : init.body; } catch (e) { body = init.body; }
  if (u.host === 'sb.test') {
    const qs = [...u.searchParams.entries()];
    if (u.pathname === '/auth/v1/user') { const e = TOK[String(hd.Authorization || hd.authorization || '').replace('Bearer ', '')]; return e ? R(200, { id: 'u-' + e, email: e }) : R(401, {}); }
    if (u.pathname.startsWith('/auth/v1/admin/users')) { if (m === 'POST') return R(200, { id: 'new' }); return R(200, { users: [] }); }
    if (u.pathname === '/rest/v1/gc_staff') {
      if (m === 'GET') { const e = (u.searchParams.get('email') || '').slice(3); return R(200, e ? (STAFF[e] ? [Object.assign({}, STAFF[e])] : []) : Object.values(STAFF).map(x => Object.assign({}, x))); }
      if (m === 'PATCH') { const e = (u.searchParams.get('email') || '').slice(3); if (!STAFF[e]) return R(200, []); const n = Object.assign({}, STAFF[e], body);
        if (n.profile === 'marketing' && (n.active || n.role !== 'staff')) return R(400, { code: '23514', message: 'violates check constraint "gc_staff_marketing_shape"' }); STAFF[e] = n; return R(200, [n]); }
      if (m === 'POST') { const n = Object.assign({ profile: null, mkt_active: false }, STAFF[body.email] || {}, body); if (n.profile === 'marketing' && (n.active || n.role !== 'staff')) return R(400, { message: 'check constraint' }); STAFF[body.email] = n; return R(201, []); }
      if (m === 'DELETE') { const e = (u.searchParams.get('email') || '').slice(3); delete STAFF[e]; return R(204, {}); }
    }
    if (u.pathname.startsWith('/storage/v1/object/sign/')) return R(200, { signedURL: '/object/sign/' + u.pathname.split('/sign/')[1] + '?token=t' });
    if (u.pathname.startsWith('/storage/v1/object/crm-files/') && m === 'POST') { storagePuts.push(u.pathname); return R(200, { Key: u.pathname }); }
    if (u.pathname.startsWith('/storage/v1/')) return R(200, {});
    if (u.pathname === '/rest/v1/gc_news_suppress') return R(200, []);
    if (u.pathname.startsWith('/rest/v1/rpc/')) return R(200, null);
    const tn = u.pathname.replace('/rest/v1/', ''), tb = T[tn];
    if (tb) {
      if (m === 'GET') return R(200, filt([...tb.values()], qs).map(x => Object.assign({}, x)));
      if (m === 'POST') { const rows = Array.isArray(body) ? body : [body]; rows.forEach(b => tb.set(b.key, { key: b.key, value: typeof b.value === 'string' && tn === 'gc_kv' && /^[\[{]/.test(b.value) ? JSON.parse(b.value) : JSON.parse(JSON.stringify(b.value)), updated_at: stamp() })); return R(201, []); }
      if (m === 'PATCH') { const rows = filt([...tb.values()], qs); rows.forEach(r => { r.value = JSON.parse(JSON.stringify(body.value)); r.updated_at = stamp(); }); return R(200, rows); }
      if (m === 'DELETE') { filt([...tb.values()], qs).forEach(r => tb.delete(r.key)); return R(204, {}); }
    }
    return R(m === 'GET' ? 200 : 201, []);
  }
  if (u.host === 'api.resend.com') { sent.push(body); return R(200, { id: 'm' + sent.length }); }
  return R(404, { error: 'offline test: ' + u.host });
};
function setKv(k, v){ T.gc_kv.set(k, { key: k, value: v, updated_at: stamp() }); }
function kv(k){ const r = T.gc_kv.get(k); const v = r ? r.value : undefined; return typeof v === 'string' ? JSON.parse(v) : v; }
const now = Date.now(), iso = d => new Date(now - d * 864e5).toISOString();
setKv('users', [{ name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin' }, { name: 'Office', email: 'office@grayco-cs.com', role: 'Office Admin' }, { name: 'Pat PM', email: 'pm@grayco-cs.com', role: 'Project Manager' }, { name: 'Mark Eting', email: 'mm@grayco-cs.com', role: 'Marketing Manager' }]);
setKv('leads', [{ id: 'L1', name: 'Mary Kline', contact: { email: 'mary@kline.example', phone: '(901) 555-0100' }, address: '88 Maple Dr', city: 'Germantown', stage: 'Won', createdAt: iso(3) }]);
setKv('gc_mkt_v1', { cfg: { main: { id: 'main', at: '2026-01-01T00:00:00Z' } } });
setKv('gc_office_tasks', JSON.stringify([{ id: 'T1', label: 'Call Mary Kline', assignees: ['office@grayco-cs.com'] }]));
setKv('gc_mkt_admin', { mm: { soldValues: false, approvesStage2: true, by: 'wjohnson@grayco-cs.com', at: '2026-10-01T00:00:00Z' }, other: { keep: 'me' } });
const ev = (o) => Object.assign({ httpMethod: 'POST', headers: {}, queryStringParameters: {} }, o);
const hdrs = tok => ({ authorization: 'Bearer ' + tok, origin: 'https://crm.grayco-cs.com', 'x-nf-client-connection-ip': '10.0.0.' + (++clock % 200) });
async function callFn(fn, tok, body){ const r = await fn.handler(ev({ body: JSON.stringify(body), headers: hdrs(tok) })); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return Object.assign({ code: r.statusCode, raw: String(r.body || '') }, j); }
const SOC = require(F + '/soc.js'), MM = require(F + '/_lib/mm.js');
const snap = () => JSON.stringify([...T.gc_kv.entries()].filter(([k]) => k !== 'gc_mkt_admin').map(([k, r]) => [k, r.value]));
const admRow = () => kv('gc_mkt_admin');

console.log('— the cards (server list) —');
ok(Array.isArray(MM.SETUP_KEYS) && MM.SETUP_KEYS.length >= 15, 'the server knows the setup cards', MM.SETUP_KEYS);
['acctmail', 'ga', 'gsc', 'gads', 'gbp', 'meta', 'instagram', 'linkedin', 'lsa', 'zapier', 'fblead', 'callrail', 'site', 'review', 'nextdoor', 'bing', 'apple', 'listings', 'resend'].forEach(k => ok(MM.SETUP_KEYS.includes(k), 'card ' + k));
ok(MM.SETUP_ADMIN.resend === 1 && Object.keys(MM.SETUP_ADMIN).length === 1, 'Resend is the "Admin only" card');

console.log('— the Marketing Manager —');
const before = snap();
let r = await callFn(SOC, 'tok-mm', { op: 'mkt_setup' });
ok(r.code === 200 && r.ok && r.items && Object.keys(r.items).length === 0 && JSON.stringify(r.adminOnly) === '["resend"]', 'he reads the statuses (none yet)', r);
ok(!/soldValues|approvesStage2|keep/.test(r.raw), 'the read carries only the setup statuses — not the admin settings', r.raw);
r = await callFn(SOC, 'tok-mm', { op: 'mkt_setup_set', key: 'ga', status: 'done' });
ok(r.code === 200 && r.ok && r.items.ga.status === 'done' && r.items.ga.by === 'Mark Eting', 'he sets Google Analytics → Done', r);
ok(admRow().setup.ga.status === 'done' && admRow().setup.ga.byEmail === 'mm@grayco-cs.com', 'stored in gc_kv gc_mkt_admin.setup.ga (who / when)', admRow());
r = await callFn(SOC, 'tok-mm', { op: 'mkt_setup_set', key: 'gbp', status: 'owner' });
ok(r.code === 200 && r.items.gbp.status === 'owner' && r.items.ga.status === 'done', 'he sets Business Profile → Waiting on owner; Analytics stays Done', r);
const m0 = JSON.stringify(admRow().mm), o0 = JSON.stringify(admRow().other);
ok(JSON.parse(m0).soldValues === false && o0 === '{"keep":"me"}', 'the admins\' settings in the same row are kept as they were', admRow());
r = await callFn(SOC, 'tok-mm', { op: 'mkt_setup_set', key: 'resend', status: 'done' });
ok(r.code === 403 && !r.ok && !(admRow().setup || {}).resend, 'he cannot set the "Admin only" card (Resend)', r);
r = await callFn(SOC, 'tok-mm', { op: 'mkt_setup_set', key: 'mm', status: 'done' });
ok(r.code === 400 && !r.ok && !admRow().setup.mm, 'an unknown card ("mm") is refused', r);
r = await callFn(SOC, 'tok-mm', { op: 'mkt_setup_set', key: '__proto__', status: 'done' });
ok(r.code === 400 && !r.ok, '"__proto__" is refused', r);
r = await callFn(SOC, 'tok-mm', { op: 'mkt_setup_set', key: 'ga', status: 'approved' });
ok(r.code === 400 && admRow().setup.ga.status === 'done', 'a made-up status is refused', r);
r = await callFn(SOC, 'tok-mm', { op: 'mkt_setup_set', key: 'ga', status: 'doing', mm: { soldValues: true, approvesStage2: false }, set: { soldValues: true }, setup: { resend: { status: 'done' } }, value: { x: 1 }, key2: 'resend' });
ok(r.code === 200 && admRow().setup.ga.status === 'doing', 'extra fields in his call are ignored (the status still saves)', r);
ok(JSON.stringify(admRow().mm) === m0 && JSON.stringify(admRow().other) === o0 && !admRow().setup.resend, 'his settings, the admins\' settings and the Admin only card are untouched', admRow());
ok(Object.keys(admRow()).sort().join() === 'mm,other,setup', 'the row only gained "setup"', Object.keys(admRow()));
const keysAfter = Object.keys(admRow().setup).sort().join();
ok(keysAfter === 'ga,gbp', 'only the two cards he set are stored', keysAfter);
r = await callFn(SOC, 'tok-mm', { op: 'mm_settings', set: { soldValues: true } });
ok(r.code === 403 && admRow().mm.soldValues === false, 'he still cannot change his own settings (mm_settings)', r);
ok(snap() === before, 'no other gc_kv row changed after all his calls');

console.log('— admins / staff —');
r = await callFn(SOC, 'tok-admin', { op: 'mkt_setup' });
ok(r.code === 200 && r.items.ga.status === 'doing' && r.items.gbp.status === 'owner', 'the admin reads the same statuses', r);
r = await callFn(SOC, 'tok-admin', { op: 'mkt_setup_set', key: 'resend', status: 'done' });
ok(r.code === 200 && r.items.resend.status === 'done' && r.items.resend.by === 'Wesley Johnson', 'the admin sets the Admin only card', r);
r = await callFn(SOC, 'tok-admin', { op: 'mkt_setup_set', key: 'gbp', status: 'done' });
ok(r.code === 200 && r.items.gbp.status === 'done' && r.items.ga.status === 'doing', 'the admin marks Business Profile done (access granted)', r);
r = await callFn(SOC, 'tok-admin', { op: 'mm_settings', set: { soldValues: true } });
ok(r.code === 200 && admRow().mm.soldValues === true && admRow().setup.gbp.status === 'done' && admRow().setup.resend.status === 'done', 'the admins\' settings save keeps the setup statuses', admRow());
for (const tok of ['tok-office', 'tok-pm']) {
  const w = JSON.stringify(admRow());
  r = await callFn(SOC, tok, { op: 'mkt_setup' });
  ok(r.code === 403, tok + ': cannot read the setup', r);
  r = await callFn(SOC, tok, { op: 'mkt_setup_set', key: 'ga', status: 'done' });
  ok(r.code === 403 && JSON.stringify(admRow()) === w, tok + ': cannot set a status', r);
}
r = await callFn(SOC, 'tok-nobody', { op: 'mkt_setup_set', key: 'ga', status: 'done' });
ok(r.code === 401 && admRow().setup.ga.status === 'doing', 'no sign-in: refused', r);

console.log('— a failed read writes nothing —');
const f0 = global.fetch, w0 = JSON.stringify(admRow());
global.fetch = async function(url, init){ const u = new URL(url); if (u.pathname === '/rest/v1/gc_kv' && /gc_mkt_admin/.test(u.search) && (!init || !init.method || init.method === 'GET')) return R(500, {}); return f0(url, init); };
r = await callFn(SOC, 'tok-mm', { op: 'mkt_setup_set', key: 'apple', status: 'done' });
ok(r.code >= 500 && !r.ok, 'the row cannot be read → the call fails', r);
r = await callFn(SOC, 'tok-admin', { op: 'mm_settings', set: { approvesStage2: false } });
ok(r.code >= 500 && !r.ok, 'the admins\' settings save also fails instead of writing over the row', r);
global.fetch = f0;
ok(JSON.stringify(admRow()) === w0, 'the row is unchanged');
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
