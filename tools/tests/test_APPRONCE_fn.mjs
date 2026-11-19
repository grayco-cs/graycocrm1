/* patch APPRONCE — server tests: node tools/tests/test_APPRONCE_fn.mjs (made-up people, mocked texts and clock; nothing leaves the machine).
   Owner 11/19: "I don't need 3 reminders for this stuff" — the same approvals were texted as "new" at 10:25, 10:35 and 1:25.
   · an approval is texted ONCE when it first appears (bundled), never again as "new": the CRM page's report flickering / going
     stale for hours and coming back, a count in the key or title ("2 new job messages", "(8)"), the same Form 941 from the server
     and the page, the page's "Payroll waiting" alert next to the payroll run, an older state's keys
   · ONE 8 AM Central reminder a day ("Still waiting on you: N approvals" + link), none again that day, none on a weekend unless urgent
   · never two digests within 10 minutes; two overlapping runs send once (the lease); an expired lease is taken over
   · Away: the away admin gets nothing, the cover does; staff quiet hours hold new ones to 7 AM */
import { createRequire } from 'module';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-key-test';
process.env.CRM_URL = 'https://crm.test';
delete process.env.APPR_PING_OFF; delete process.env.OWNER_EMAILS;

let pass = 0, fail = 0;
async function t(name, fn){ try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e); } }

const DOM = '@grayco-cs.com', W = 'wes.admin' + DOM, N = 'nick.admin' + DOM, P = 'pat.pm' + DOM;
const USERS = [{ id: 'U2', name: 'Wes Admin', email: W, role: 'Admin', payType: 'owner', active: true }, { id: 'U1', name: 'Nick Admin', email: N, role: 'Admin', payType: 'owner', active: true },
  { id: 'UP', name: 'Pat Mason', email: P, role: 'Project Manager', active: true }];

/* ── a tiny Supabase gc_kv that honours ignore-duplicates and conditional PATCH (like PostgREST) ── */
let NOW = 0;
const KV = {};
const put = (k, v, at) => { KV[k] = { value: v, updated_at: at || new Date(NOW).toISOString() }; };
const get = k => { const v = KV[k] && KV[k].value; return typeof v === 'string' ? JSON.parse(v) : v; };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body), clone(){ return this; } });
const inList = v => String(v || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
globalThis.fetch = async (url, init) => {
  await new Promise(r => setImmediate(r));   /* every call takes a turn: two runs really interleave */
  init = init || {}; const u = new URL(String(url)), q = u.searchParams, m = (init.method || 'GET').toUpperCase();
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname !== '/rest/v1/gc_kv') return res(200, []);
  if (m === 'POST') {
    const ign = /ignore-duplicates/.test(String((init.headers || {}).Prefer || (init.headers || {}).prefer || ''));
    const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { if (ign && KV[r.key]) return; put(r.key, r.value, r.updated_at); }); return res(201, null);
  }
  const kq = q.get('key') || '';
  const keys = kq.startsWith('in.') ? inList(kq) : kq.startsWith('eq.') ? [decodeURIComponent(kq.slice(3))] : [];
  if (m === 'PATCH') {
    const uq = q.get('updated_at') || '', b = JSON.parse(init.body);
    keys.forEach(k => { const r = KV[k]; if (!r) return; const a = Date.parse(r.updated_at);
      if (uq.startsWith('lt.') && !(a < Date.parse(uq.slice(3)))) return; if (uq.startsWith('eq.') && a !== Date.parse(uq.slice(3))) return;
      put(k, b.value, b.updated_at); });
    return res(204, null);
  }
  return res(200, keys.filter(k => KV[k]).map(k => ({ key: k, value: KV[k].value, updated_at: KV[k].updated_at })));
};

const PG = require(path.join(FN, '_lib/apprping.js')), AW = require(path.join(FN, '_lib/away.js')), SQ = require(path.join(FN, '_lib/staffquiet.js'));
const TEXTS = [];
let BOX = {}, AWAY = {};
PG.D.now = () => NOW; SQ.D.now = () => NOW;
PG.D.collect = async () => ({ box: JSON.parse(JSON.stringify(BOX)), base: 'https://crm.test', data: { users: USERS } });
PG.D.push = async () => ({ to: [] });   /* nobody has the phone push: the text is the channel */
PG.D.text = async (email, text, link) => { TEXTS.push({ email, text, link, at: NOW }); return { sent: 1 }; };
PG.D.mail = async () => ({ ok: true });
AW.activeNow = async () => AWAY;
const at = (d, hm) => Date.parse(d + 'T' + hm + ':00-06:00');   /* November: Central = UTC−6 */
const MON = '2026-11-23', TUE = '2026-11-24', FRI = '2026-11-27', SAT = '2026-11-28', SUN = '2026-11-29', MON2 = '2026-11-30';
const feed = (by, items) => { const f = get(PG.FEED) || {}; f[by] = { at: new Date(NOW).toISOString(), items }; put(PG.FEED, f); };
const td = (key, title) => ({ key, title, kind: 'todo' });
const pay = id => ({ key: 'pay:' + id, title: '💵 Payroll for ' + id, raw: { kind: 'payroll_run' } });
const run = o => PG.run(Object.assign({ force: true }, o || {}));
const to = e => TEXTS.filter(x => x.email === e);
function fresh(){ Object.keys(KV).forEach(k => delete KV[k]); TEXTS.length = 0; BOX = {}; AWAY = {}; try { AW.reset(); } catch (e) {} SQ._reset && SQ._reset(); }
put('gc_payroll_approvals', []);

console.log('APPRONCE — texted once, one 8 AM reminder, no double-sends');
await t('steady keys: a count is not a new item; the page Form 941 = the server one; real ids stay apart', async () => {
  assert.strictEqual(PG.ck('td:otd:alert_2 new job messages'), PG.ck('td:otd:alert_3 new job messages'));
  assert.strictEqual(PG.ck('td:otd:alert_1 invoice to review'), PG.ck('td:otd:alert_2 invoices to review'));
  assert.strictEqual(PG.ck('x:QuickBooks invoices (8)'), PG.ck('x:QuickBooks invoices (9)'));
  assert.strictEqual(PG.ck('td:f941:f941_2026_Q3'), 'f941:f941_2026_Q3');
  assert.notStrictEqual(PG.ck('pay:PRauto_2026-11-13'), PG.ck('pay:PRauto_2026-11-20'));
  assert.strictEqual(PG.ck('td:qbfact:review'), 'td:qbfact:review');
  const l = PG.noteList([{ key: 'pay:R1' }, { key: 'td:otd:alert_Payroll waiting on your approval' }, { key: 'f941:X' }, { key: 'td:f941:X' }]);
  assert.deepStrictEqual(l.map(x => x.key), ['pay:R1', 'f941:X']);
});

await t('the live 11/19 day replayed: 10:25 / 10:35 / 1:25 → each item texted once', async () => {
  fresh(); NOW = at(MON, '09:00');
  BOX = { [W]: [], [N]: [] };
  await run();   /* the first run only takes note */
  NOW = at(MON, '10:25'); BOX = { [W]: [pay('PRauto_2026-11-20')], [N]: [pay('PRauto_2026-11-20')] };
  put('gc_payroll_approvals', [{ kind: 'f941', status: 'waiting', id: 'f941_2026_Q3', q: 3, year: 2026, due: '2026-11-30' }]);
  feed(W, [td('td:otd:alert_Payroll waiting on your approval', 'Payroll waiting on your approval'), td('td:qbfact:review', '📒 QuickBooks invoices — confirm Paid / Still owed (8)'), td('td:f941:f941_2026_Q3', '🧾 Form 941 for Q3 2026')]);
  await run();
  assert.strictEqual(to(W).length, 1); assert.strictEqual(to(N).length, 1);
  assert.match(to(W)[0].text, /3 new approvals/, to(W)[0].text);   /* payroll run + QuickBooks + Form 941 (the page alert and the page's 941 are the same items) */
  /* 10:35: the page report drops two items for a moment, then lists new things alongside the old ones (with new counts) */
  NOW = at(MON, '10:30'); feed(W, [td('td:qbfact:review', '📒 QuickBooks invoices — confirm Paid / Still owed (8)')]); await run();
  NOW = at(MON, '10:35'); feed(W, [td('td:otd:alert_Payroll waiting on your approval', 'Payroll waiting on your approval'), td('td:qbfact:review', '📒 QuickBooks invoices — confirm Paid / Still owed (9)'), td('td:f941:f941_2026_Q3', '🧾 Form 941'), td('td:otd:alert_2 new job messages', '2 new job messages'), td('td:hot1:asg:LEADIN-1', '👤 Assign this lead: Auditorium HVAC')]);
  await run();
  assert.strictEqual(to(W).length, 2); assert.match(to(W)[1].text, /2 new approvals/, to(W)[1].text);
  assert.ok(!/QuickBooks|Payroll|941/.test(to(W)[1].text), 'only the two new ones: ' + to(W)[1].text);
  /* the page is closed after lunch: its report goes stale; at 1:25 it opens again with the same list (one more message) */
  for (let h = 11; h <= 13; h++) { NOW = at(MON, String(h) + ':00'); await run(); }
  NOW = at(MON, '13:25'); feed(W, [td('td:otd:alert_Payroll waiting on your approval', 'Payroll waiting on your approval'), td('td:qbfact:review', '📒 QuickBooks invoices (8)'), td('td:f941:f941_2026_Q3', '🧾 Form 941'), td('td:otd:alert_3 new job messages', '3 new job messages'), td('td:hot1:asg:LEADIN-1', '👤 Assign this lead')]);
  await run(); NOW = at(MON, '13:40'); await run();
  assert.strictEqual(to(W).length, 2, 'nothing again as new: ' + JSON.stringify(TEXTS.slice(2)));
  assert.strictEqual(to(N).length, 2, 'Nick: the payroll run at 10:25, the page items at 10:35 (the admins share them), nothing at 1:25');
});

await t('an item gone for days and back is not new; an older state\'s keys (raw td:f941 / counts) count as sent', async () => {
  NOW = at(MON, '14:00'); feed(W, []); BOX = { [W]: [], [N]: [] }; await run();
  NOW = at(TUE, '15:00'); feed(W, [td('td:qbfact:review', 'QuickBooks (12)')]); await run();
  assert.strictEqual(to(W).length, 2);
  fresh(); NOW = at(MON, '10:00');
  put(PG.STATE, { at: new Date(NOW - 3600e3).toISOString(), seen: { [W]: { 'td:f941:f941_2026_Q3': { n: 1, at: new Date(NOW - 3600e3).toISOString() }, 'td:otd:alert_2 new job messages': { n: 1, at: new Date(NOW - 3600e3).toISOString() } } } });
  BOX = { [W]: [] }; put('gc_payroll_approvals', [{ kind: 'f941', status: 'waiting', id: 'f941_2026_Q3', q: 3, year: 2026 }]);
  feed(W, [td('td:otd:alert_5 new job messages', '5 new job messages')]);
  await run(); assert.strictEqual(to(W).length, 0, JSON.stringify(TEXTS));
});

await t('bundling: never two digests within 10 minutes; what came meanwhile goes in the next one', async () => {
  fresh(); NOW = at(MON, '10:00'); BOX = { [W]: [] }; await run();
  NOW = at(MON, '10:05'); BOX = { [W]: [pay('A')] }; await run(); assert.strictEqual(to(W).length, 1);
  NOW = at(MON, '10:08'); BOX = { [W]: [pay('A'), pay('B')] }; let r = await run(); assert.strictEqual(to(W).length, 1); assert.ok(r.held.some(h => h.why === 'bundling'));
  NOW = at(MON, '10:12'); BOX = { [W]: [pay('A'), pay('B'), pay('C')] }; await run(); assert.strictEqual(to(W).length, 1);
  NOW = at(MON, '10:15'); await run(); assert.strictEqual(to(W).length, 2); assert.match(to(W)[1].text, /2 new approvals/);
  assert.ok(to(W)[1].at - to(W)[0].at >= 10 * 60e3);
});

await t('two overlapping runs send once (the lease); a stale lease is taken over; a held lease → "busy", nothing sent', async () => {
  fresh(); NOW = at(MON, '10:00'); BOX = { [W]: [] }; await run();
  NOW = at(MON, '10:05'); BOX = { [W]: [pay('A'), pay('B')], [N]: [pay('A'), pay('B')] };
  const [a, b] = await Promise.all([run(), run()]);
  assert.strictEqual(to(W).length, 1, JSON.stringify(TEXTS)); assert.strictEqual(to(N).length, 1);
  assert.ok(a.busy || b.busy, 'one of them saw the lease');
  NOW = at(MON, '10:20'); BOX = { [W]: [pay('A'), pay('B'), pay('C')] };
  put(PG.LOCK, { owner: 'someone', at: new Date(NOW - 60e3).toISOString() }, new Date(NOW - 60e3).toISOString());
  const c = await run(); assert.strictEqual(c.busy, true); assert.strictEqual(to(W).length, 1);
  put(PG.LOCK, { owner: 'crashed', at: new Date(NOW - 10 * 60e3).toISOString() }, new Date(NOW - 10 * 60e3).toISOString());
  const d = await run(); assert.ok(!d.busy, JSON.stringify(d)); assert.strictEqual(to(W).length, 2);
  assert.strictEqual(get(PG.LOCK).owner, '', 'released at the end');
});

await t('ONE 8 AM reminder a day: "Still waiting on you: N approvals" + link; nothing more that day; again the next weekday', async () => {
  fresh(); NOW = at(FRI, '15:00'); BOX = { [W]: [] }; await run();
  NOW = at(FRI, '15:05'); BOX = { [W]: [pay('A'), pay('B')] }; feed(W, [td('td:qbfact:review', 'QuickBooks (8)')]); await run();
  assert.strictEqual(to(W).length, 1);
  TEXTS.length = 0;
  for (const d of [SAT, SUN]) for (const hm of ['07:55', '08:00', '08:05', '09:00', '12:00']) { NOW = at(d, hm); await run(); }
  assert.strictEqual(to(W).length, 0, 'none on the weekend: ' + JSON.stringify(TEXTS));
  for (const hm of ['06:55', '07:00', '07:30', '07:55']) { NOW = at(MON2, hm); await run(); }
  assert.strictEqual(to(W).length, 0);
  NOW = at(MON2, '08:00'); await run();
  assert.strictEqual(to(W).length, 1); assert.strictEqual(to(W)[0].text, 'Still waiting on you: 2 approvals', 'the page report from Friday is too old to count');
  assert.strictEqual(to(W)[0].link, 'https://crm.test/#apx=mine');
  for (const hm of ['08:05', '08:10', '08:30', '08:55', '09:00', '10:25', '13:25', '18:00']) { NOW = at(MON2, hm); await run({ force: false }); await run(); }
  assert.strictEqual(to(W).length, 1, 'one a day: ' + JSON.stringify(TEXTS));
  NOW = at(MON2, '15:00'); feed(W, [td('td:qbfact:review', 'QuickBooks (9)')]); await run(); assert.strictEqual(to(W).length, 1, 'the page item is not new');
  NOW = at('2026-12-01', '08:00'); await run(); NOW = at('2026-12-01', '08:05'); await run();
  assert.strictEqual(to(W).length, 2); assert.strictEqual(to(W)[1].text, 'Still waiting on you: 3 approvals', 'the page report from yesterday afternoon counts (page closed overnight)');
});

await t('8 AM: a new one due then rides in the reminder (one text); a weekend reminder only when one is urgent', async () => {
  fresh(); NOW = at(FRI, '10:00'); BOX = { [W]: [] }; await run();
  NOW = at(FRI, '10:05'); BOX = { [W]: [pay('A')] }; await run(); assert.strictEqual(to(W).length, 1);
  NOW = at(MON2, '07:05'); await run(); assert.strictEqual(to(W).length, 1);
  NOW = at(MON2, '08:10'); BOX = { [W]: [pay('A'), pay('B')] }; await run();
  assert.strictEqual(to(W).length, 2); assert.strictEqual(to(W)[1].text, 'Still waiting on you: 2 approvals');
  NOW = at(MON2, '08:25'); await run(); assert.strictEqual(to(W).length, 2, 'B is not "new" after riding along');
  fresh(); NOW = at(FRI, '15:00'); BOX = { [W]: [] }; await run();
  NOW = at(FRI, '15:05'); BOX = { [W]: [pay('A'), Object.assign(pay('U'), { raw: { kind: 'x', emergency: true } })] }; await run(); TEXTS.length = 0;
  NOW = at(SAT, '08:00'); await run(); NOW = at(SAT, '08:30'); await run();
  assert.strictEqual(to(W).length, 1); assert.strictEqual(to(W)[0].text, 'Still waiting on you: 2 approvals');
});

await t('Away: the away admin gets nothing (new or reminder); the cover gets it, once', async () => {
  fresh(); NOW = at(FRI, '10:00'); BOX = { [W]: [], [N]: [] }; await run();
  AWAY = { [W]: { email: W, name: 'Wes Admin', cover: N } };
  NOW = at(FRI, '10:05'); BOX = { [W]: [pay('A'), { key: 'ap2:W1', title: 'Owner-only thing', raw: { kind: 'x' } }], [N]: [pay('A')] }; await run();
  assert.strictEqual(to(W).length, 0); assert.strictEqual(to(N).length, 1); assert.match(to(N)[0].text, /Wes is away/);
  NOW = at(MON2, '08:15'); await run(); NOW = at(MON2, '08:40'); await run();
  assert.strictEqual(to(W).length, 0); assert.strictEqual(to(N).length, 2); assert.strictEqual(to(N)[1].text, 'Still waiting on you: 2 approvals');
});

await t('quiet hours: a new one at 10 PM waits; one text at 7 AM; not again at 8 (sent under an hour ago)', async () => {
  fresh(); NOW = at(MON, '21:00'); BOX = { [P]: [] }; await run();
  NOW = at(MON, '22:00'); BOX = { [P]: [{ key: 'sub:S1', title: 'Sub invoice', raw: { kind: 'sub' } }] }; let r = await run();
  assert.strictEqual(TEXTS.length, 0); assert.ok(r.held.some(h => h.why === 'quiet hours'));
  NOW = at(TUE, '03:00'); await run(); assert.strictEqual(TEXTS.length, 0);
  NOW = at(TUE, '07:00'); await run(); assert.strictEqual(TEXTS.length, 1); assert.strictEqual(TEXTS[0].email, P);
  NOW = at(TUE, '08:00'); await run(); NOW = at(TUE, '08:30'); await run(); assert.strictEqual(TEXTS.length, 1);
});

await t('the 7 AM digest: textable() — a staff cell, not switched off, not opted out', async () => {
  const SA = require(path.join(FN, '_lib/smsalert.js'));
  const D0 = Object.assign({}, SA._D);
  SA._D.people = async () => ({ users: [{ name: 'Wes Admin', email: W, role: 'Admin', cell: '(555) 010-0001', active: true }, { name: 'Pat Mason', email: P, role: 'Project Manager', active: true }], staff: [] });
  SA._D.optouts = async () => ({});
  try {
    assert.strictEqual(await SA.textable(W), true); assert.strictEqual(await SA.textable(P), false, 'no cell');
    SA._D.optouts = async () => ({ '5550100001': 1 }); assert.strictEqual(await SA.textable(W), false, 'opted out');
  } finally { Object.assign(SA._D, D0); }
});

await t('the 12 PM reminder is off by default (no push, e-mail or To-Do); APPR_NOON_ON=1 turns it back on', async () => {
  const NOON = require(path.join(FN, '_lib/appr-noon.js')), DG = require(path.join(FN, '_lib/auto-digest.js'));
  const was = DG.collect; let asked = 0; DG.collect = async () => { asked++; return { box: {}, nameOf: {}, base: 'https://crm.test' }; };
  try {
    delete process.env.APPR_NOON_ON;
    const r = await NOON.run({ now: at(TUE, '12:05') }); assert.match(String(r.skipped), /^off/); assert.strictEqual(asked, 0, 'nothing even looked up');
    process.env.APPR_NOON_ON = '1';
    const r2 = await NOON.run({ now: at(TUE, '12:05') }); assert.ok(!/^off/.test(String(r2.skipped || '')), JSON.stringify(r2));
  } finally { DG.collect = was; delete process.env.APPR_NOON_ON; }
});

console.log('\n' + (fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
