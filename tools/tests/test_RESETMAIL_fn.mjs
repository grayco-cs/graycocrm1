// patch RESETMAIL: bid-site "Forgot password" link and portal sign-in codes are e-mailed even in ⏸ data-entry mode (owner 11/13).
import { createRequire } from 'module'; import path from 'path';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.RESEND_API_KEY = 're_test'; process.env.GC_PORTAL_SECRET = 'x'.repeat(40);
const sent = []; let genStatus = 200;
const realFetch = async (url, o = {}) => {
  const u = new URL(url); const ok = (b, st = 200) => ({ ok: st < 300, status: st, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null }, clone() { return this; } });
  if (u.pathname.endsWith('/gc_kv')) return ok([{ value: { on: true } }]);              /* data-entry mode ON */
  if (u.pathname.endsWith('/admin/generate_link')) { const b = JSON.parse(o.body); return genStatus === 200 ? ok({ action_link: 'https://db.test/auth/v1/verify?token=abc&type=recovery&redirect_to=' + encodeURIComponent(b.redirect_to) }) : ok({ msg: 'User not found' }, genStatus); }
  if (u.host === 'api.resend.com') { sent.push(JSON.parse(o.body)); return ok({ id: 'em_1' }); }
  return ok([]);
};
global.fetch = realFetch;
const SP = require(BUILD + '/netlify/functions/subportal.js');
const R = []; const t = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 220) : '')); };
const call = async (b) => { const r = await SP.handler({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '7.7.7.' + Math.floor(Math.random() * 200) }, body: JSON.stringify(b) }); return { st: r.statusCode, b: JSON.parse(r.body || '{}') }; };
let r = await call({ action: 'reset-password', email: 'Sub@Example.com', back: 'https://bids.grayco-cs.com/' });
t('reset-password answers ok', r.st === 200 && r.b.ok, r);
t('the reset e-mail went out although data-entry mode is ON', sent.length === 1 && sent[0].to.includes('sub@example.com'), sent.map(m => m.to));
t('it carries the one-time reset link back to the bid site', sent[0] && /type=recovery/.test(sent[0].html) && /bids\.grayco-cs\.com/.test(sent[0].html.replace(/%2F/gi, "/").replace(/%3A/gi, ":")), (sent[0] || {}).subject);
r = await call({ action: 'reset-password', email: 'sub@example.com', back: 'https://bids.grayco-cs.com/' });
t('a double tap within 45 s sends no second e-mail', r.b.ok && sent.length === 1);
r = await call({ action: 'reset-password', email: 'evil@example.com', back: 'https://evil.example/' });
t('a foreign redirect is replaced by the bid site', sent.length === 2 && !/evil\.example/.test(sent[1].html.replace(/%2F/gi, "/").replace(/%3A/gi, ":")));
genStatus = 404; r = await call({ action: 'reset-password', email: 'nobody@example.com' });
t('an address with no account gets the same "sent" answer and no e-mail', r.b.ok && sent.length === 2, r);
r = await call({ action: 'reset-password', email: 'not-an-email' });
t('a bad address → 400 with a clear message', r.st === 400, r);
/* the pause still holds GrayCo-initiated e-mail */
const P = require(BUILD + '/netlify/functions/_lib/pause.js'); P.reset && P.reset();
const before = sent.length;
await fetch('https://api.resend.com/emails', { method: 'POST', body: JSON.stringify({ to: ['customer@example.com'], subject: 'Invoice', html: 'x' }) });
t('an ordinary e-mail to a customer is still held by data-entry mode', sent.length === before);
await require(BUILD + '/netlify/functions/_lib/custquiet.js').run('reply', () => fetch('https://api.resend.com/emails', { method: 'POST', body: JSON.stringify({ to: ['customer@example.com'], subject: 'Code', html: 'x' }) }));
t('…but a sign-in code the person asked for (tag reply) goes', sent.length === before + 1);
const n = R.filter(Boolean).length; console.log('RESETMAIL ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
