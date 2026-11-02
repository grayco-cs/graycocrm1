// test_PRICEGATE_fn.mjs [build-dir] — patch AUTOPANEL (price-index only): the monthly price update changes no price on its
// schedule unless ⚙ Admin → ⚡ Automations "Monthly price update" is ON (gc_kv gc_automations.price_index_monthly, default OFF).
// Offline: a fake Supabase (gc_kv) and a fake BLS answer; nothing leaves.
import { createRequire } from 'module'; import path from 'path';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '../..'));
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? ' ' + JSON.stringify(i).slice(0, 400) : '')); } };
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-test-fake'; delete process.env.RESEND_API_KEY;
const KV = new Map(); const OUT = [];
const R = (st, b) => ({ ok: st < 300, status: st, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => 'application/json' } });
const BLS = { status: 'REQUEST_SUCCEEDED', Results: { series: ['WPU081', 'WPUSI012011'].map(id => ({ seriesID: id, data: [{ year: '2026', period: 'M09', value: '103' }, { year: '2026', period: 'M08', value: '100' }] })) } };
global.fetch = async (url, init = {}) => {
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'api.bls.gov') return R(200, BLS);
  if (u.host !== 'sb.test') { OUT.push(u.host); return R(200, {}); }
  if (!/\/rest\/v1\/gc_kv/.test(u.pathname)) return R(200, []);
  const kq = u.searchParams.get('key') || '';
  if (m === 'GET') { const keys = kq.startsWith('in.(') ? kq.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')) : [kq.replace(/^eq\./, '')]; return R(200, keys.filter(k => KV.has(k)).map(k => ({ key: k, value: KV.get(k), updated_at: '2026-11-01T00:00:00Z' }))); }
  if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => KV.set(r.key, r.value)); return R(201, null); }
  return R(200, []);
};
const AUTO = require(path.join(BUILD, 'netlify/functions/_lib/automations.js'));
const P = require(path.join(BUILD, 'netlify/functions/price-index-monthly.js'));
const sched = () => P.handler({ httpMethod: 'POST', body: JSON.stringify({ next_run: '2026-11-03T12:00:00Z' }), headers: {}, queryStringParameters: {} });
KV.set('customProducts', [{ id: 'C1', cat: 'Lumber/Framing', name: '2x4 stud', cost: 10 }]);
ok(AUTO.BY.price_index_monthly && AUTO.defaults().price_index_monthly === false, 'the monthly price update is OFF by default');
let r = await sched(), b = JSON.parse(r.body);
ok(r.statusCode === 200 && b.held === 'price_index_monthly' && KV.get('customProducts')[0].cost === 10 && !KV.has('priceEdits') && !KV.has('gc_price_hist'), 'no switch row: the scheduled run changes NO price, records held', b);
ok(KV.get('gc_auto_held') && KV.get('gc_auto_held').price_index_monthly.n === 1 && KV.get('gc_auto_held').price_index_monthly.would >= 1, '"held: would have done N" in gc_auto_held', KV.get('gc_auto_held'));
KV.set('gc_automations', { price_index_monthly: false }); AUTO._t.reset();
r = await sched(); ok(JSON.parse(r.body).held === 'price_index_monthly' && KV.get('customProducts')[0].cost === 10, 'switched OFF: still no change');
KV.set('gc_automations', { price_index_monthly: true }); AUTO._t.reset();
r = await sched(); b = JSON.parse(r.body);
ok(typeof b.held !== 'string' && b.changed >= 1 && KV.get('customProducts')[0].cost === 10.3, 'switched ON: the prices move again (10 → 10.30)', b.changed);
ok(!OUT.length, 'nothing left the test (no outside call)', OUT);
console.log((fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
