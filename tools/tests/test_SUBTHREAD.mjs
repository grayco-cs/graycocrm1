// test_SUBTHREAD.mjs <build-dir> [shot-dir] — patch SUBTHREAD (11/15 list 5.4). Made-up data only; mocks; nothing leaves the machine.
//   A. node: _lib/subthread.js — a message in a sub's thread is copied to the job's 💬 Messages tagged with the sub (both ways); GrayCo's
//      message tells the sub (e-mail with a button to THAT job in their portal; a text when texting is set up), at most once per 30 min;
//      the sub's own message tells nobody outside; the wiring in portal-access (msgInsert, s-scope-approve) and SUBSCHED (✅ confirm).
//   B. the CRM: 🏆 an award that puts the sub on the job posts "You were awarded … Your PO …" in that sub's thread; 💵 a paid sub invoice
//      posts "Payment sent …" once (never twice, never for a job the sub is not on, never another sub's).
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

/* ════ A ════ */
{
  const ST = require(path.join(BUILD, 'netlify/functions/_lib/subthread.js'));
  const JM = [], MAILS = [], TEXTS = []; let RECENT = [];
  const SUB = { id: 'S1', name: 'Zedd Drywall LLC', company: 'Zedd Drywall LLC', email: 'zed@drywall.test', phone: '9015550141' };
  const deps = (o) => Object.assign({
    core: () => ({ kvListUpdate: async (k, f) => { const r = f(JM.slice()); if (r && r.list) { JM.length = 0; r.list.forEach(x => JM.push(x)); } return { ok: true }; } }),
    crmData: async () => ({}), subById: (d, id) => id === 'S1' ? SUB : null, jobTagOf: () => 'Zedd Demo Kitchen (T801)',
    subLinkCreate: async () => ({ token: 'tok'.repeat(10) }), linkFor: t => 'https://portal.test/#t=' + t,
    sendMail: async (to, subj, html) => { MAILS.push({ to, subj, html }); return { ok: true }; }, sendText: async (to, body) => { TEXTS.push({ to, body }); return { ok: true }; }, textReady: () => true,
    mailHtml: (h, b, big, btn) => '<h1>' + h + '</h1><p>' + b + '</p>' + (btn ? '<a href="' + btn.href + '">' + btn.label + '</a>' : ''), dbGet: async () => RECENT, okEmail: e => /@/.test(e), phone10: p => String(p || '').replace(/\D/g, '').slice(-10)
  }, o || {});
  let r = await ST.after(deps(), { id: 'M1', pid: 'P1', subId: 'S1', side: 'gc', author: 'Demo PM', text: 'Can you start Monday? Bring the 5/8 board.', files: [{ name: 'plan.pdf' }] });
  ok('A1 GrayCo → the sub: copied to the job\'s Messages tagged "→ 🔨 Zedd Drywall LLC (sub portal)"', r.mirrored && JM.length === 1 && JM[0].pid === 'P1' && JM[0].authorName === 'Demo PM → 🔨 Zedd Drywall LLC (sub portal)' && JM[0].subId === 'S1' && /📎 plan\.pdf/.test(JM[0].text) && JM[0].dir === 'out', JM);
  ok('A1 …and the sub is told: e-mail with a button to THAT job in their portal + a text', MAILS.length === 1 && MAILS[0].to === SUB.email && /New message from GrayCo — Zedd Demo Kitchen \(T801\)/.test(MAILS[0].subj) && /#t=tok.*&job=P1/.test(MAILS[0].html) && /Open the job in my portal/.test(MAILS[0].html) && TEXTS.length === 1 && /&job=P1/.test(TEXTS[0].body), { MAILS, TEXTS });
  RECENT = [{ id: 'M1', created_at: new Date().toISOString() }];
  r = await ST.after(deps(), { id: 'M2', pid: 'P1', subId: 'S1', side: 'gc', author: 'Demo PM', text: 'Also the corner bead.' });
  ok('A2 a second GrayCo message within 30 minutes: copied, but no second notice', JM.length === 2 && MAILS.length === 1 && TEXTS.length === 1 && r.skipped, r);
  RECENT = [];
  r = await ST.after(deps(), { id: 'M3', pid: 'P1', subId: 'S1', side: 'them', author: 'Zed', text: 'Monday works.' });
  ok('A3 the sub writes → in the job\'s Messages as "🔨 Zedd Drywall LLC — Zed (sub portal)", nobody outside is mailed', JM.length === 3 && JM[2].authorName === '🔨 Zedd Drywall LLC — Zed (sub portal)' && JM[2].dir === 'in' && MAILS.length === 1, JM[2]);
  r = await ST.after(deps(), { id: 'M4', pid: 'P1', subId: 'S1', side: 'gc', author: 'GrayCo', text: 'Scope to sign', notify: false });
  ok('A4 notify:false (the scope e-mail is the notice) → copied, not mailed', JM.length === 4 && MAILS.length === 1);
  await ST.after(deps(), { id: 'M3', pid: 'P1', subId: 'S1', side: 'them', author: 'Zed', text: 'Monday works.' });
  ok('A4 the same message twice is copied once', JM.length === 4);
  const PA = fs.readFileSync(path.join(BUILD, 'netlify/functions/portal-access.js'), 'utf8'), SS = fs.readFileSync(path.join(BUILD, 'netlify/functions/_lib/subsched.js'), 'utf8');
  ok('A5 wiring: msgInsert → subthread.after for s: parties; s-scope-approve posts the scope / change order to sign (notify false); SUBSCHED ✅ confirm posts',
    /if \(\/\^s:\/\.test\(s\(party\)\)\) \{ try \{ await require\('\.\/_lib\/subthread\.js'\)\.after\(subThreadDeps\(\)/.test(PA) && /📋 GrayCo sent you a scope to review and sign: /.test(PA) && /\{ notify: false \}\); \} catch \(e\) \{\}   \/\* patch SUBTHREAD/.test(PA) && /📅 GrayCo confirmed your schedule: /.test(SS));
}

/* ════ B ════ */
const { computer, signIn, sleep, cset, resetCloud } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const at = new Date(Date.now() - 3 * 864e5).toISOString(), d = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('vendors', [{ id: 'S1', name: 'Zedd Drywall LLC', trade: 'Drywall', isSub: true, email: 'zed@drywall.test' }, { id: 'S2', name: 'Demo Paint Co', trade: 'Paint', isSub: true, email: 'paint@demo.test' }]);
cset('projects', [{ id: 'P1', name: 'Zedd Demo Kitchen', client: 'Zedd Demo', clientPhone: '9015550111', status: 'active', pm: 'Demo PM', autoPO: 'T801', subs: [{ name: 'Demo Paint Co', subId: 'S2', status: 'Awarded' }], createdAt: at, updatedAt: at },
  { id: 'P2', name: 'Demo Bath', client: 'Dot Demo', clientPhone: '9015550112', status: 'active', pm: 'Demo PM', autoPO: 'T802', subs: [], createdAt: at, updatedAt: at }]);
cset('invs', [{ id: 'I1', type: 'sub', sub: 'Demo Paint Co', subId: 'S2', pid: 'P1', invNum: '55', amt: 2200, status: 'paid', paidDate: d, date: d },
  { id: 'I2', type: 'sub', sub: 'Demo Paint Co', subId: 'S2', pid: 'P2', invNum: '56', amt: 900, status: 'paid', paidDate: d, date: d },
  { id: 'I3', type: 'sub', sub: 'Demo Paint Co', subId: 'S2', pid: 'P1', invNum: '57', amt: 400, status: 'received', date: d }]);
const SENT = [];
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await A.ctx.route('**/.netlify/functions/portal-access*', async rt => { const b = JSON.parse(rt.request().postData() || '{}'); if (b.action === 's-send') SENT.push(b); return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b.action === 's-sync' ? { ok: true, events: [], unread: {}, links: {}, waiting: [], bids: [], codes: [], admin: true } : { ok: true, id: 'M' + SENT.length }) }); });
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('B0 the CRM is up', !!await wait(() => window._gcSubThread && window._gcSubConfirm && window._gcSubConfirm.addBid && window._gcSubConfirm.addBid.__st && (window._crm.invs || window._crm.invoices || []).length >= 3, null, 60000));
await A.ev(() => window._gcSubConfirm.addBid('P1', { company: 'Zedd Drywall LLC', email: 'zed@drywall.test', trade: 'Drywall' }));
const aw = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 8000) { const x = SENT.find(m => m.party === 's:S1'); if (x) return x; await sleep(300); } return null; })();
ok('B1 🏆 award → "You were awarded Drywall on Zedd Demo Kitchen. Your PO for this job: T801 …" in Zedd\'s thread on P1 only', aw && aw.projectId === 'P1' && /^🏆 You were awarded Drywall on Zedd Demo Kitchen\. Your PO for this job: T801/.test(aw.text) && /Demo PM from GrayCo will reach out/.test(aw.text), aw);
const n0 = SENT.length;
const p1 = await A.ev(() => window._gcSubThread.paySweep());
const pay = SENT.slice(n0);
ok('B2 💵 the paid sub invoice on a job the sub is on → "Payment sent: your invoice #55 for Zedd Demo Kitchen — $2,200.00, paid …" (not P2: not on that job; not the unpaid one)', p1 === 1 && pay.length === 1 && pay[0].party === 's:S2' && pay[0].projectId === 'P1' && new RegExp('^💵 Payment sent: your invoice #55 for Zedd Demo Kitchen — \\$2,200\\.00, paid ' + d).test(pay[0].text), { p1, pay });
const p2 = await A.ev(() => window._gcSubThread.paySweep());
ok('B2 never twice (gc_kv gc_subpay_posted)', p2 === 0 && SENT.length === n0 + 1 && await A.ev(() => !!JSON.parse(localStorage.getItem('gc_subpay_posted') || '{}').I1));
ok('B3 no page errors', A.errs.length === 0, A.errs);
await A.close();
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
