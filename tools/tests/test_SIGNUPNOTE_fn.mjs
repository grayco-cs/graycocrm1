// patch SIGNUPNOTE: a new sub's sign-up e-mails the owners (Approve link to the CRM) even in data-entry mode;
// the "you're approved" e-mail to the sub goes in data-entry mode too.
import { createRequire } from 'module'; import path from 'path';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.RESEND_API_KEY = 're_test';
const sent = []; const rows = [];
global.fetch = async (url, o = {}) => {
  const u = new URL(url); const ok = (b, st = 200) => ({ ok: st < 300, status: st, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null }, clone() { return this; } });
  if (u.pathname.endsWith('/gc_kv')) return ok([{ value: { on: true } }]);           /* data-entry mode ON */
  if (u.pathname.endsWith('/admin/users') && (o.method || 'GET') === 'POST') return ok({ id: 'auth-1' });
  if (u.pathname.endsWith('/sp_rows')) { if ((o.method || 'GET') !== 'GET') { rows.push(o.body); return ok([]); } return ok([]); }
  if (u.host === 'api.resend.com') { sent.push(JSON.parse(o.body)); return ok({ id: 'em' }); }
  return ok([]);
};
const SP = require(BUILD + '/netlify/functions/subportal.js');
const R = []; const t = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 200) : '')); };
const r = await SP.handler({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '5.5.5.5' }, body: JSON.stringify({ action: 'register', email: 'john@sub.example', password: 'Strong-Pass-123', profile: { name: 'John Doe', company: 'John Drywall LLC', phone: '9015550000', trades: ['Drywall'] } }) });
const b = JSON.parse(r.body || '{}');
t('register answers ok (not approved yet)', r.statusCode === 200 && b.ok && !b.approved, b);
const own = sent.find(m => /Approve new sub/.test(m.subject || ''));
t('the owners get "🔨 Approve new sub — John Drywall LLC" although data-entry mode is on', !!own && own.to.some(a => /grayco-cs\.com$/.test(a)), sent.map(m => m.subject));
t('…with an "Open ✅ Approvals" button to the CRM', own && /Open ✅ Approvals/.test(own.html) && /crm\.grayco-cs\.com/.test(own.html));
const before = sent.length;
await SP._t && SP._t.notify ? SP._t.notify({ kind: 'approved', user: { email: 'john@sub.example', name: 'John Doe', company: 'John Drywall LLC' } }) : null;
const n = R.filter(Boolean).length; console.log('SIGNUPNOTE ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
