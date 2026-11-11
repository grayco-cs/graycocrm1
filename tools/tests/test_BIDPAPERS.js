// test_BIDPAPERS.js — owner 11/11: "have to have valid credentials in the portal before a bid is accepted": the bid server refuses a bid
// unless the sub's W-9, general liability and workers' comp are on file and not expired. Offline, made-up data.
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.PORTAL_MAIL_OFF = '1';
let ROWS = {};
global.fetch = async function(url){ const u = new URL(url); const k = (u.searchParams.get('key') || '').replace(/^eq\./, ''); const r = ROWS[decodeURIComponent(k)]; return { ok: true, status: 200, json: async () => r ? [r] : [], text: async () => JSON.stringify(r ? [r] : []) }; };
const SP = require('../../netlify/functions/subportal.js')._hub;
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 240) : '')); };
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const docs = items => { ROWS = { 'subdocs/u1': { key: 'subdocs/u1', collection: 'subdocs', id: 'u1', data: { items } } }; };
(async () => {
  docs([]); let m = await SP.papersMissing('u1');
  ok('no papers → refused, all three named', /W-9 is missing/.test(m) && /general liability/.test(m) && /workers' comp/.test(m), m);
  docs([{ type: 'w9' }, { type: 'insurance_general', expirationDate: day(100) }, { type: 'insurance_workers_comp', expirationDate: day(30) }]); m = await SP.papersMissing('u1');
  ok('W-9 + current GL + current WC → allowed', m === '', m);
  docs([{ type: 'w9' }, { type: 'insurance_general', expirationDate: day(-1) }, { type: 'insurance_workers_comp', expirationDate: day(30) }]); m = await SP.papersMissing('u1');
  ok('expired general liability → refused, says expired', /general liability insurance certificate has expired/.test(m) && !/W-9/.test(m), m);
  docs([{ type: 'w9' }, { type: 'insurance_general', expirationDate: day(-10) }, { type: 'insurance_general', expirationDate: day(200) }, { type: 'insurance_workers_comp', expirationDate: day(5) }]); m = await SP.papersMissing('u1');
  ok('an expired old certificate plus a current new one → allowed', m === '', m);
  docs([{ type: 'w9' }, { type: 'insurance_general', expirationDate: day(50) }]); m = await SP.papersMissing('u1');
  ok("missing workers' comp → refused", /workers' comp insurance certificate is missing/.test(m), m);
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../netlify/functions/subportal.js'), 'utf8');
  ok('the bid save calls the check before writing a bid', /key === 'bids'\) \{\s*\/\*[^*]*\*\/\s*if \(upsert\.length\) \{ const miss = await papersMissing\(me\); if \(miss\) throw Fail\(403, miss\); \}/.test(src));
  const n = R.filter(Boolean).length; console.log('BIDPAPERS ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
})();
