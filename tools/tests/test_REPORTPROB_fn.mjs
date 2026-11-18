/* patch REPORTPROB — server tests for netlify/functions/problem-report.js: node tools/tests/test_REPORTPROB_fn.mjs
   (made-up people, an in-memory Supabase; nothing leaves the machine)
   · signed out: name + phone required; saved (append only), the photo and the errors in their own rows; the admins and the
     office told (never the person who sent it); "signed out" on the report
   · signed in (a real sign-in token, checked with Supabase): who it was comes from the token, never the body
   · BOOTWATCH's limits: 1 a device every 30 s (also across instances), 200 a device a day, a new device only while < 1000
     sent in 24 h; signed-out notices at most 20 a day; calls from another site refused; 8 KB report, 800 KB photo
   · secrets removed from the texts; an unreadable list is never written over; earlier reports are kept */
import { createRequire } from 'module';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-key-test';
process.env.CRM_URL = 'https://crm.test';
delete process.env.SITE_ORIGIN;
let pass = 0, fail = 0;
async function t(name, fn){ try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e); } }

const DOM = '@grayco-cs.com';
const USERS = [{ id: 'U1', name: 'Wes Admin', email: 'wes.admin' + DOM, role: 'Admin', payType: 'owner', active: true }, { id: 'U2', name: 'Nick Admin', email: 'nick.admin' + DOM, role: 'Admin', active: true },
  { id: 'U3', name: 'Bree Office', email: 'office' + DOM, role: 'Office Manager', active: true }, { id: 'U4', name: 'Pat Mason', email: 'pat.pm' + DOM, role: 'Project Manager', active: true },
  { id: 'U5', name: 'Old Office', email: 'old.office' + DOM, role: 'Office', active: false }];
const KV = {}; let TICK = 0, PAUSE = { on: false };
const kput = (k, v) => { KV[k] = { value: v, updated_at: new Date().toISOString().replace('Z', '') + String(++TICK).padStart(4, '0') + 'Z' }; };
const kget = k => { const v = KV[k] && KV[k].value; return typeof v === 'string' ? JSON.parse(v) : v; };
const res = (status, body, hdr) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => (hdr || {})[String(k).toLowerCase()] || null }, json: async () => body, text: async () => JSON.stringify(body) });
const TOK = { 'tok-pat': 'pat.pm' + DOM };
globalThis.fetch = async (url, o) => {
  o = o || {}; const u = new URL(String(url)), m = (o.method || 'GET').toUpperCase();
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') { const tk = String((o.headers || {}).Authorization || '').replace(/^Bearer\s+/, ''); return TOK[tk] ? res(200, { email: TOK[tk] }) : res(401, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(o.body); kput(b.key, b.value); return res(201, null); }
    const key = u.searchParams.get('key') || '';
    if (key.startsWith('eq.')) { const k = key.slice(3); if (k === 'gc_automation_pause') return res(200, [{ value: PAUSE }]); return res(200, KV[k] ? [{ value: KV[k].value, updated_at: KV[k].updated_at }] : []); }
    if (key.startsWith('like.')) { const pre = key.slice(5).replace(/\*$/, ''), since = (u.searchParams.get('updated_at') || '').replace(/^gte\./, '');
      const n = Object.keys(KV).filter(k => k.startsWith(pre) && (!since || KV[k].updated_at >= since)).length; return res(200, [], { 'content-range': '0-0/' + (FAKE_DEVICES || n) }); }
    return res(200, []);
  }
  return res(404, {});
};
let FAKE_DEVICES = 0;
const F = require(path.join(ROOT, 'netlify/functions/problem-report.js'));
const TOLD = []; F._test.setNotify(async (to, n) => { TOLD.push({ to, n }); return { pushed: to, held: [], texted: [] }; });
const call = (body, hdr) => F.handler({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://crm.grayco-cs.com', 'content-type': 'application/json' }, hdr || {}), body: JSON.stringify(body) }).then(r => ({ status: r.statusCode, j: JSON.parse(r.body || '{}') }));
const rep = o => Object.assign({ type: 'signin', text: 'It says wrong password but I just changed it', name: 'Sam Newhire', phone: '(901) 555-0142', screen: 'Sign-in screen', app: 'field', kind: 'phone', build: '33.269-2026-11-18-r36i', gate: 'Invalid login credentials' }, o || {});
const PNG = 'data:image/jpeg;base64,' + Buffer.alloc(3000, 7).toString('base64');
kput('users', JSON.stringify(USERS));
kput('gc_problem_reports', JSON.stringify([{ id: 'PRold1', at: '2026-11-01T10:00:00.000Z', type: 'idea', text: 'an older report', status: 'fixed', by: { name: 'Pat Mason', email: 'pat.pm' + DOM } }]));

await t('signed out: saved with name + phone, photo + errors in their own rows, "signed out" on it', async () => {
  const r = await call({ op: 'submit', dev: 'Pdev0001', report: rep({ diag: [{ k: 'err', at: '2026-11-18T14:00:00.000Z', t: 'TypeError: x is undefined @12:3', n: 2 }, { k: 'slow', t: 'tap button:Sign in', ms: 1400 }] }), shot: PNG });
  assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.ok(r.j.ok && /^PR/.test(r.j.id));
  const L = kget('gc_problem_reports'); assert.strictEqual(L.length, 2, 'the older report is kept');
  const x = L.find(y => y.id === r.j.id);
  assert.strictEqual(x.type, 'signin'); assert.strictEqual(x.status, 'open'); assert.strictEqual(x.signedOut, true); assert.strictEqual(x.by.name, 'Sam Newhire'); assert.strictEqual(x.by.phone, '9015550142');
  assert.strictEqual(x.shot, true); assert.strictEqual(x.dev, 'Pdev0001'); assert.ok(!x.by.email);
  assert.strictEqual(kget('gc_problem_shot_' + r.j.id).data, PNG);
  const d = kget('gc_problem_detail_' + r.j.id); assert.strictEqual(d.diag.length, 2); assert.strictEqual(d.gate, 'Invalid login credentials');
  assert.strictEqual(typeof KV.gc_problem_reports.value, 'string', 'the list is JSON text (the CRM format)');
});
await t('the admins and the office are told (active ones only), with the phone and a link to the report', async () => {
  const n = TOLD[TOLD.length - 1]; assert.ok(n, 'told');
  assert.deepStrictEqual(n.to.slice().sort(), ['nick.admin' + DOM, 'office' + DOM, 'wes.admin' + DOM]);
  assert.ok(/Can't sign in — Sam Newhire/.test(n.n.title), n.n.title); assert.ok(/9015550142/.test(n.n.body)); assert.ok(/#problems=PR/.test(n.n.url));
});
await t('the same device again within 30 s: refused (this instance, and a fresh instance through the stored limit)', async () => {
  let r = await call({ op: 'submit', dev: 'Pdev0001', report: rep() }); assert.strictEqual(r.status, 429);
  F._test.MEM.clear();
  r = await call({ op: 'submit', dev: 'Pdev0001', report: rep() }); assert.strictEqual(r.status, 429, 'the row keeps the limit across instances');
  assert.strictEqual(kget('gc_problem_reports').length, 2, 'nothing saved');
});
await t('after 30 s it goes again; 200 a device a day at most', async () => {
  F._test.MEM.clear(); const rl = kget('gc_problem_rl_Pdev0001'); rl.last -= 31e3; kput('gc_problem_rl_Pdev0001', rl);
  let r = await call({ op: 'submit', dev: 'Pdev0001', report: rep({ text: 'second try' }) }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
  F._test.MEM.clear(); kput('gc_problem_rl_Pdev0001', { day: kget('gc_problem_rl_Pdev0001').day, n: 200, last: Date.now() - 60e3 });
  r = await call({ op: 'submit', dev: 'Pdev0001', report: rep({ text: 'third' }) }); assert.strictEqual(r.status, 429); assert.ok(/Daily/.test(r.j.error));
});
await t('name and phone are required signed out; a kind and a text are required', async () => {
  let r = await call({ op: 'submit', dev: 'Pdev0002', report: rep({ name: '' }) }); assert.strictEqual(r.status, 400); assert.ok(/name/.test(r.j.error));
  F._test.MEM.clear(); kput('gc_problem_rl_Pdev0002', null); delete KV.gc_problem_rl_Pdev0002;
  r = await call({ op: 'submit', dev: 'Pdev0003', report: rep({ phone: '12' }) }); assert.strictEqual(r.status, 400); assert.ok(/phone/.test(r.j.error));
  r = await call({ op: 'submit', dev: 'Pdev0004', report: rep({ type: 'nonsense' }) }); assert.strictEqual(r.status, 400);
  r = await call({ op: 'submit', dev: 'Pdev0005', report: rep({ type: 'broke', text: '' }) }); assert.strictEqual(r.status, 400);
});
await t('signed in: who it was comes from the sign-in token (a name in the body is not trusted for the e-mail)', async () => {
  F._test.MEM.clear();
  const r = await call({ op: 'submit', dev: 'Pdev0010', report: { type: 'question', text: 'How do I add a change order?', name: 'Someone Else', screen: 'Desk · projects', app: 'desk', kind: 'pc' } }, { authorization: 'Bearer tok-pat' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.j));
  const x = kget('gc_problem_reports').find(y => y.id === r.j.id);
  assert.strictEqual(x.by.email, 'pat.pm' + DOM); assert.strictEqual(x.by.name, 'Pat Mason'); assert.ok(!x.signedOut);
  const n = TOLD[TOLD.length - 1]; assert.ok(n.n.title.indexOf('Question — Pat Mason') >= 0, n.n.title); assert.ok(n.to.indexOf('pat.pm' + DOM) < 0);
});
await t('a bad token counts as signed out (name + phone needed)', async () => {
  F._test.MEM.clear();
  const r = await call({ op: 'submit', dev: 'Pdev0011', report: { type: 'question', text: 'hello there' } }, { authorization: 'Bearer forged' });
  assert.strictEqual(r.status, 400);
});
await t('passwords / tokens / keys are taken out of the texts', async () => {
  F._test.MEM.clear();
  const r = await call({ op: 'submit', dev: 'Pdev0012', report: rep({ text: 'my password: Hunter22! and token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefabcdef and ' + 'A'.repeat(40) }) });
  assert.strictEqual(r.status, 200);
  const x = kget('gc_problem_reports').find(y => y.id === r.j.id);
  assert.ok(!/Hunter22|eyJhbGci|AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/.test(x.text), x.text);
});
await t('from another web site: refused; GET: refused; too big: refused', async () => {
  let r = await call({ op: 'submit', dev: 'Pdev0013', report: rep() }, { origin: 'https://evil.example' }); assert.strictEqual(r.status, 403);
  const g = await F.handler({ httpMethod: 'GET', headers: {}, body: '' }); assert.strictEqual(g.statusCode, 405);
  r = await call({ op: 'submit', dev: 'Pdev0014', report: rep({ text: 'x'.repeat(1400), screen: 'y'.repeat(9000) }) }); assert.strictEqual(r.status, 413);
  r = await call({ op: 'submit', dev: 'Pdev0015', report: rep(), shot: 'data:image/jpeg;base64,' + 'A'.repeat(900 * 1024) }); assert.strictEqual(r.status, 413);
  r = await call({ op: 'submit', dev: 'Pdev0016', report: rep(), shot: 'javascript:alert(1)' }); assert.strictEqual(r.status, 413);
});
await t('a new device only while fewer than 1000 devices sent in the last 24 h', async () => {
  F._test.MEM.clear(); FAKE_DEVICES = 1000;
  const r = await call({ op: 'submit', dev: 'Pdev0020', report: rep() }); assert.strictEqual(r.status, 429); assert.ok(/Too many devices/.test(r.j.error));
  FAKE_DEVICES = 0;
});
await t('signed-out notices: at most 20 a day (the rest are saved, without a phone notice)', async () => {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  kput('gc_problem_rl__all', { day, n: 20 }); const before = TOLD.length, n0 = kget('gc_problem_reports').length;
  F._test.MEM.clear();
  const r = await call({ op: 'submit', dev: 'Pdev0030', report: rep() }); assert.strictEqual(r.status, 200);
  assert.strictEqual(TOLD.length, before, 'no notice'); assert.strictEqual(kget('gc_problem_reports').length, n0 + 1, 'saved');
});
await t('an unreadable list is never written over', async () => {
  const keep = KV.gc_problem_reports; kput('gc_problem_reports', JSON.stringify({ not: 'a list' }));
  F._test.MEM.clear();
  const r = await call({ op: 'submit', dev: 'Pdev0040', report: rep() }); assert.ok(r.status >= 500, r.status);
  assert.deepStrictEqual(kget('gc_problem_reports'), { not: 'a list' });
  KV.gc_problem_reports = keep;
});
console.log(`\nREPORTPROB fn: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
