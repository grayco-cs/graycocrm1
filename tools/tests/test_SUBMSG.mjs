// test_SUBMSG.mjs <build-dir> [shot-dir] — patch SUBMSG (owner 11/20): the bid site's Messages ↔ the CRM job's messages.
// The real subportal.js / portal-access.js on qaa_world's in-memory Supabase (+ an in-memory gc_portal_msg). Made-up data only.
//   A. a sub's message on a bid job linked to a CRM job → that CRM job's sub thread (gc_portal_msg, party s:<CRM sub>, side them)
//   B. GrayCo's reply in the CRM thread → the bid site's messages for that sub, on that bid job (read-only crm_ ids); never another
//      sub's thread, never a job they can't see
//   C. opening it marks it read in the CRM; no copy is saved on the bid site
//   D. a bid job with no CRM job → stays on the bid site only
//   E. the bid site (phone): the job's Messages show GrayCo's CRM reply
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { ACC, putRow, rowsOf } = W;
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
W.install();
const MSG = [];
const f0 = globalThis.fetch;
const jr = (st, b) => ({ ok: st < 300, status: st, headers: { get: () => null }, json: async () => b, text: async () => JSON.stringify(b), arrayBuffer: async () => new ArrayBuffer(0) });
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)), m = (init && init.method) || 'GET';
  if (u.pathname === '/rest/v1/gc_portal_msg') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => MSG.push(Object.assign({ created_at: new Date().toISOString(), read_at: null }, x))); return jr(201, []); }
    let rows = MSG.slice();
    for (const [k, v] of u.searchParams.entries()) {
      if (['select', 'order', 'limit'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === decodeURIComponent(v.slice(3)));
      else if (v.startsWith('in.')) { const l = v.slice(3).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')); rows = rows.filter(r => l.includes(String(r[k]))); }
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return jr(200, []); }
    return jr(200, rows);
  }
  return f0(url, init);
};
const F = W.fns(BUILD);
W.H.cset('vendors', [{ id: 'SUBA', isSub: true, name: 'Alpha Drywall', email: 'a@sub.test', trade: 'Drywall' }, { id: 'SUBB', isSub: true, name: 'Beta Paint', email: 'b@sub.test', trade: 'Painting' }]);
W.H.cset('projects', [{ id: 'P1', name: 'Demo Clinic', address: '1 Demo Rd', status: 'active', subs: [{ subId: 'SUBA', name: 'Alpha Drywall' }] }]);
for (const [id, mail, co] of [['u_a', 'a@sub.test', 'Alpha Drywall'], ['u_b', 'b@sub.test', 'Beta Paint']]) { putRow('users', id, { id, role: 'sub', approved: true, email: mail, name: co + ' rep', company: co, trades: ['Drywall'], authUserId: 'auth-' + id }, { user_id: id, email: mail }); ACC[mail] = { pw: 'Pass-1234', id: 'auth-' + id }; }
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'public', draft: false, bidDueDate: '2027-01-01', createdAt: new Date().toISOString() }, x), { job_id: id });
job('J1', { title: 'Demo Clinic', crmProjectId: 'P1' });
job('J2', { title: 'Unlinked Demo' });
const tokFor = e => { const t = 't-' + Math.random().toString(36).slice(2, 8); W.TOK[t] = e; return t; };
async function sp(email, body){ const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: 'Bearer ' + tokFor(email), 'x-nf-client-connection-ip': '10.3.' + Math.floor(Math.random() * 250) + '.1' }, body: JSON.stringify(body) }); return { st: r.statusCode, d: JSON.parse(r.body || '{}') }; }

/* A */
const s1 = await sp('a@sub.test', { action: 'save', key: 'messages', upsert: [{ id: 'm_a1', jobId: 'J1', body: 'When can we start hanging board?' }] });
const crm1 = MSG.filter(x => x.party === 's:SUBA');
ok('A1 a sub\'s bid-site message on a bid job linked to CRM job P1 → that CRM job\'s sub thread (s:SUBA, side them, the text)', s1.st === 200 && crm1.length === 1 && crm1[0].project_id === 'P1' && crm1[0].side === 'them' && /hanging board/.test(crm1[0].text), [s1, MSG]);
/* D */
await sp('a@sub.test', { action: 'save', key: 'messages', upsert: [{ id: 'm_a2', jobId: 'J2', body: 'Question on the unlinked job' }] });
ok('D1 a bid job with no CRM job → the bid site only', MSG.length === 1 && rowsOf('messages').some(r => r.id === 'm_a2'));
/* B */
MSG.push({ id: 'Mreply1', project_id: 'P1', party: 's:SUBA', side: 'gc', author: 'Sam Sample (GrayCo)', text: 'Monday 7 AM works — gate code in Site notes.', created_at: new Date().toISOString(), read_at: null });
MSG.push({ id: 'Mother1', project_id: 'P1', party: 's:SUBB', side: 'gc', author: 'Sam Sample (GrayCo)', text: 'Beta only: paint schedule', created_at: new Date().toISOString(), read_at: null });
const la = await sp('a@sub.test', { action: 'load', keys: ['messages'] });
const lb = await sp('b@sub.test', { action: 'load', keys: ['messages'] });
const ma = (la.d.data || {}).messages || [], mb = (lb.d.data || {}).messages || [];
const rep = ma.find(x => x.id === 'crm_Mreply1');
ok('B1 GrayCo\'s CRM reply shows on the bid site for that sub, on bid job J1, as GrayCo, to them', rep && rep.jobId === 'J1' && rep.senderRole === 'admin' && rep.recipientSubId === 'u_a' && /Monday 7 AM/.test(rep.body) && rep.readBy.length === 0, ma);
ok('B2 never another sub\'s thread (Alpha does not see Beta\'s; Beta sees none of Alpha\'s)', !ma.some(x => /Beta only/.test(x.body)) && !mb.some(x => /Monday 7 AM|hanging board/.test(x.body || '')), [ma.map(x => x.body), mb.map(x => x.body)]);
/* C */
const before = rowsOf('messages').length;
await sp('a@sub.test', { action: 'save', key: 'messages', upsert: [Object.assign({}, rep, { readBy: ['u_a'] })] });
ok('C1 opening it marks it read in the CRM; nothing is copied into the bid site\'s messages', !!MSG.find(x => x.id === 'Mreply1').read_at && rowsOf('messages').length === before && !rowsOf('messages').some(r => /^crm_/.test(r.id)));

/* E */
const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
try {
  MSG.push({ id: 'Mreply2', project_id: 'P1', party: 's:SUBA', side: 'gc', author: 'Sam Sample (GrayCo)', text: 'Bring the lift Tuesday.', created_at: new Date().toISOString(), read_at: null });
  const ctx = await W.bidsCtx(browser, BUILD, F, 'phone');
  const P = await ctx.newPage(); P.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await P.goto('https://bids.test/'); await W.bidsLogin(P, 'a@sub.test', 'Pass-1234');
  await P.waitForSelector('h3:has-text("Demo Clinic")', { timeout: 30000 }); await P.click('h3:has-text("Demo Clinic")');
  await P.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^\s*(💬\s*)?Messages/.test(x.textContent)); if (b) b.click(); });
  const seen = await P.waitForFunction(() => /Bring the lift Tuesday/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true, () => false);
  ok('E1 the bid site (phone): the job\'s Messages show GrayCo\'s CRM reply', seen, await P.evaluate(() => document.body.innerText.slice(0, 500)));
  await P.waitForTimeout(2500);
  ok('E2 … opened → marked read in the CRM', !!MSG.find(x => x.id === 'Mreply2').read_at);
  if (SHOTS) await P.screenshot({ path: path.join(SHOTS, 'submsg.png') });
  ok('E3 no page errors', errs.length === 0, errs);
} catch (e) { ok('no crash', false, String(e && e.stack || e).slice(0, 800)); }
await browser.close();
const fails = R.filter(x => !x).length;
console.log(`\n${R.length - fails}/${R.length} passed`);
process.exit(fails ? 1 : 0);
