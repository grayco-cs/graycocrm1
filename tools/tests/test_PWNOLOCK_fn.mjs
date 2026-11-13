// patch PWNOLOCK: wrong portal passwords never lock anyone out (owner 11/13). Stubs the database and fetch.
import { createRequire } from 'module'; import path from 'path';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.GC_PORTAL_SECRET = 'x'.repeat(40);
const T = { gc_portal_lock: [] }; let calls = 0;
global.fetch = async (url, o = {}) => {
  const u = new URL(url); const tbl = u.pathname.split('/').pop().split('?')[0];
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
  if (tbl === 'gc_portal_lock') {
    if ((o.method || 'GET') === 'GET') return ok(T.gc_portal_lock);
    const row = JSON.parse(o.body); const rows = Array.isArray(row) ? row : [row];
    rows.forEach(r => { const i = T.gc_portal_lock.findIndex(x => x.id === r.id); if (i > -1) T.gc_portal_lock[i] = Object.assign(T.gc_portal_lock[i], r); else T.gc_portal_lock.push(r); });
    return ok([]);
  }
  calls++; return ok([]);
};
const mod = require(BUILD + '/netlify/functions/portal-access.js');
const R = []; const t = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 200) : '')); };
const ev = (pw) => ({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '9.9.9.9' }, body: JSON.stringify({ action: 'signin-password', email: '901-555-1234', password: pw }) });
const msgs = []; let locked = false; const t0 = Date.now();
for (let i = 0; i < 9; i++) { const r = await mod.handler(ev('wrong' + i)); const b = JSON.parse(r.body || '{}'); msgs.push(r.statusCode + ' ' + (b.error || '')); if (r.statusCode === 429 || /15 minutes|Too many/i.test(b.error || '')) locked = true; }
t('9 wrong passwords in a row: never "Too many tries / wait 15 minutes", never 429', !locked, msgs.slice(-2));
t('each wrong try gets the normal "don\'t match" answer', msgs.every(m => /don't match|not turned on|Enter your/.test(m) || /^4\d\d /.test(m)), msgs[0]);
t('no lock row is ever written with locked_until', T.gc_portal_lock.every(r => !r.locked_until), T.gc_portal_lock);
t('the count is kept (for the short pause only)', T.gc_portal_lock.some(r => /^e:/.test(r.id) && r.fails >= 9), T.gc_portal_lock.map(r => r.fails));

t('took ' + Math.round((Date.now() - t0) / 1000) + ' s for 9 tries (short pauses, no lock-out)', Date.now() - t0 < 30000);
const n = R.filter(Boolean).length; console.log('PWNOLOCK ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
