// patch CERTS server test: node tools/tests/test_CERTS_fn.mjs [build dir]
import { createRequire } from 'module'; import path from 'path';
const require = createRequire(import.meta.url);
const FN = path.join(path.resolve(process.argv[2] || '.'), 'netlify/functions');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };
const kv = {}, tasks = [], mails = [];
const fakeLib = { kvGet: async k => kv[k], kvCas: async (k, fn) => { const nv = fn(kv[k] === undefined ? undefined : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { value: kv[k] }; }, alertsApi: () => ({ recipients: async () => [] }), sb: async () => ({ ok: false }) };
const fakeCore = { kvListUpdate: async (key, fn) => { const r = fn(tasks.slice()); if (r && r.list) { tasks.length = 0; r.list.forEach(x => tasks.push(x)); } return { ok: true }; } };
require.cache[require.resolve(path.join(FN, 'bid-inbox.js'))] = { id: 'bi', filename: 'bi', loaded: true, exports: { _lib: fakeLib } };
require.cache[require.resolve(path.join(FN, 'portal.js'))] = { id: 'po', filename: 'po', loaded: true, exports: { _core: fakeCore } };
process.env.RESEND_API_KEY = 'test';
global.fetch = async (u, init) => { if (/resend/.test(String(u))) { mails.push(JSON.parse(init.body)); return { ok: true, status: 200 }; } return { ok: false, status: 404, json: async () => [] }; };
const G = require(path.join(FN, '_lib/gcp.js'));
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const data = { users: [{ name: 'Owner', email: 'owner@grayco-cs.com', role: 'Admin' }, { name: 'Office', email: 'office@grayco-cs.com', role: 'Office' }] };
ok(G.certApplyBy({ expires: '2027-04-09', leadDays: 90 }) === '2027-01-09', 'apply-by = expiration minus lead days');
kv.gc_certs = { list: [
  { id: 'a', name: 'EPA RRP firm', expires: day(110), leadDays: 90, fee: 300 },     /* apply by in 20 → 30d */
  { id: 'g', name: 'Insurance-type, 60 out', expires: day(90), leadDays: 30 },      /* apply by in 60, warns at 30 → nothing yet */
  { id: 'h', name: 'IICRC tech', tpl: 'iicrc_tech', expires: day(110), leadDays: 30 }, /* apply by in 80, CE hours → 90d */
  { id: 'b', name: 'TN license', expires: day(20), leadDays: 30, fee: 200 },        /* apply-by passed → applyby */
  { id: 'c', name: 'MS license', expires: day(-3), leadDays: 30 },                  /* expired */
  { id: 'd', name: 'IICRC firm', expires: day(400), leadDays: 30 },                 /* nothing yet */
  { id: 'e', name: 'No date', expires: '', leadDays: 30 },
  { id: 'f', name: 'Archived', expires: day(-10), archived: true } ] };
const r = await G.certRun(data);
ok(r.reminded === 4 && r.mailed, 'four reminders (30 days, IICRC tech 90 days, apply-by passed, expired); none at 60 days for a 30-day item, later, no date or archived (' + JSON.stringify(r) + ')');
const m = mails[mails.length - 1];
ok(!!m && m.to.includes('office@grayco-cs.com') && m.to.includes('owner@grayco-cs.com') && /EXPIRED/.test(m.html) && /renewal due NOW/.test(m.html) && /fee \$300|fee 300/.test(m.html), 'e-mail to admins + office with expired, due-now and the fee');
const t = tasks.find(x => /^GCP_CERTS_/.test(x.id));
ok(!!t && t.prio === 'high' && /EPA RRP firm/.test(t.label), 'Office To-Do added, high priority');
const r2 = await G.certRun(data);
ok(r2.reminded === 0, 'the same step is not repeated the next run');
kv.gc_certs.list[0].expires = day(95);   /* now 5 days to apply-by → 7d step */
const r3 = await G.certRun(data);
ok(r3.reminded === 1, 'a closer step (7 days) is sent once it is reached');
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
