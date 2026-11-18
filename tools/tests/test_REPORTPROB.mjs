// test_REPORTPROB.mjs <build-dir> — patch REPORTPROB in the offline harness (made-up people; the real problem-report function
// runs here in node against the harness's cloud; appr-away is answered by the test).
//   1. A PM on an iPhone (GrayCo Field): the ❓ on the home and ☰ More → 🆘 Report a problem; the form takes the screen by
//      itself; "Something broke" + a text + a PHOTO → gc_kv gc_problem_reports (open, by the PM, phone · Field, the screen),
//      the photo (made small, JPEG) and the page errors in their own rows; the admins and the office are told (window._gcNotify
//      → appr-away op notify, link #problems=<id>), never the PM.
//   2. The owner's computer: 💎 → the FIRST item is 🆘 Report a problem (pinned until 2026-12-16); 💎 → 🆘 Problem reports
//      shows it with the photo and the errors; the owner answers → status answered, the PM's inbox row has it, the PM is told.
//   3. The PM's phone: the answer shows as a CRM notice; Open → My reports with the answer; Got it → seen (kept in the cloud).
//      The owner marks it fixed. Nothing was deleted (the older report is still there).
//   4. Signed out: the sign-in screen's "Can't sign in? Report it" → name + phone + what happens → saved (signed out), the
//      admins and the office told by the server; a second report from that phone at once: refused (30 s).
//   5. The office (not an admin) sees 🆘 Problem reports; a PM does not.
// Run: flock <browser.lock> node tools/tests/test_REPORTPROB.mjs <abs build dir>
import path from 'path'; import zlib from 'zlib'; import fs from 'fs'; import { createRequire } from 'module'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, cset, cget, resetCloud, ACCOUNTS, waitFor, onFn } = H;
const build = path.resolve(process.argv[2] || '.');
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/reportprob/'; fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const byId = id => Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].id === id);
const WES = byId('u-wesley'), NICK = byId('u-nick'), OFF = byId('u-office'), PM = byId('u-pm');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const list = () => { const v = cget('gc_problem_reports'); return typeof v === 'string' ? JSON.parse(v) : (v || []); };

/* ── the world ── */
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: WES, role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Office Demo', email: OFF, role: 'Office Manager', active: true }, { id: 'u4', name: 'Demo PM', email: PM, role: 'Project Manager', active: true, phone: '9015550144' }]);
cset('projects', [{ id: 'P1', po: 'PO-1001', name: 'Demo Roof Job', client: 'Demo Client A', address: '1 Demo St', type: 'Roofing', pm: 'Demo PM', status: 'Active', contract: 18000, contractSigned: true, createdAt: ago(20), updatedAt: ago(1) },
  { id: 'P2', po: 'PO-1002', name: 'Demo Kitchen', client: 'Demo Client B', address: '2 Demo St', type: 'Remodel', pm: 'Demo PM', status: 'Active', contract: 42000, createdAt: ago(30), updatedAt: ago(2) }]);
cset('gc_problem_reports', JSON.stringify([{ id: 'PRold1', at: ago(9), updatedAt: ago(9), type: 'idea', text: 'An older idea (kept)', status: 'fixed', by: { name: 'Nick Gray', email: NICK } }]));

/* appr-away (the AWAY staff notices) — answered here; every notify is kept */
const NOTIFY = [];
onFn('appr-away', ({ body, A }) => { if (body && body.op === 'notify') { NOTIFY.push({ from: A.name, to: body.to, title: body.title, body: body.body, link: body.link, kind: body.kind }); return { ok: true, to: [].concat(body.to) }; } return { ok: true }; });

/* the REAL problem-report function, in node, on the harness's cloud */
process.env.SUPABASE_URL = 'https://sb.local'; process.env.SUPABASE_SERVICE_KEY = 'svc-test'; process.env.SITE_ORIGIN = 'http://app.local'; process.env.CRM_URL = 'http://app.local';
const nodeFetch = globalThis.fetch;
const R = (status, body, hdr) => new Response(body == null ? null : JSON.stringify(body), { status, headers: Object.assign({ 'content-type': 'application/json' }, hdr || {}) });
globalThis.fetch = async (url, o) => {
  const u = new URL(String(url)); o = o || {};
  if (u.host !== 'sb.local') return nodeFetch(url, o);
  if (u.pathname === '/auth/v1/user') { const t = String((o.headers || {}).Authorization || '').replace(/^Bearer\s+/i, ''); const m = /^utok-(u-[a-z0-9]+)-\d+$/.exec(t); const e = m && byId(m[1]); return e ? R(200, { email: e }) : R(401, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    const m = (o.method || 'GET').toUpperCase(), key = u.searchParams.get('key') || '';
    if (m === 'POST') { const b = JSON.parse(o.body); cset(b.key, b.value); return R(201, null); }
    if (key.startsWith('eq.')) { const k = key.slice(3); const row = H.cloud.get(k); if (k === 'gc_automation_pause') return R(200, []); return R(200, row ? [{ value: row.value, updated_at: row.updated_at + ':' + JSON.stringify(row.value).length }] : []); }
    if (key.startsWith('like.')) { const pre = key.slice(5).replace(/\*$/, ''); return R(200, [], { 'content-range': '0-0/' + [...H.cloud.keys()].filter(k => k.startsWith(pre)).length }); }
    return R(200, []);
  }
  return R(404, {});
};
const PR = createRequire(import.meta.url)(path.join(build, 'netlify/functions/problem-report.js'));
const SERVER_TOLD = []; PR._test.setNotify(async (to, n) => { SERVER_TOLD.push({ to, n }); return { pushed: to, held: [], texted: [] }; });
async function wireFn(A){
  await A.ctx.route(u => /\/\.netlify\/functions\/problem-report/.test(String(u.href || u)), async route => {
    const rq = route.request();
    if (rq.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    A.prCalls = (A.prCalls || 0) + 1;
    const out = await PR.handler({ httpMethod: rq.method(), headers: rq.headers(), body: rq.postData() || '' });
    return route.fulfill({ status: out.statusCode, headers: out.headers, body: out.body });
  });
}

/* a real little PNG (a photo for the form) */
function png(w, h){
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = (x * 4) & 255; raw[i + 1] = (y * 3) & 255; raw[i + 2] = 160; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PHOTO = png(1600, 1200);
const IPHONE = () => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} }; d(Navigator.prototype, 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'); d(Navigator.prototype, 'maxTouchPoints', 5); };
const CLEAN = [];
async function phone(who, email){
  const c = await computer(who, { build, mobile: true, init: [IPHONE] }); CLEAN.push(c); await wireFn(c);
  if (email) {
    await signIn(c, email, 15000);
    ok(!!(await waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh') && !!document.querySelector('#gc-fh-tabs[data-ra-bar] [data-t="more"]'), null, 45000)), who + ': the phone opens GrayCo Field');
    await waitFor(c, () => !!window._gcReportProb && (window._crm && window._crm.users || []).length >= 4, null, 20000);
  }
  return c;
}
async function desk(who, email){
  const c = await computer(who, { build }); CLEAN.push(c); await wireFn(c);
  await signIn(c, email, 15000);
  ok(!!(await waitFor(c, () => !!window._gcReportProb && !!document.getElementById('gc-hub-btn') && (window._crm && window._crm.users || []).length >= 4, null, 60000)), who + ': the Desk is open');
  await sleep(2500);
  return c;
}
async function openHub(c){
  await c.ev(() => { try { window._gcRA && window._gcRA.hide && window._gcRA.hide(); } catch (e) {} if (window._gcCloseHub) window._gcCloseHub(); window._gcToggleHub ? window._gcToggleHub() : document.getElementById('gc-hub-btn').click(); });
  return waitFor(c, () => { const p = [...document.querySelectorAll('.gc-hub-panel')].filter(x => x.getClientRects().length).pop(); return p && p.querySelector('[data-gcrp-hub]') ? true : false; }, null, 8000);
}

try {
  /* ═════ 1. the PM's phone ═════ */
  console.log('1 · a PM on an iPhone reports a problem with a photo');
  const P = await phone('PM-phone', PM);
  ok(!!(await waitFor(P, () => !!document.querySelector('#_gcJobPick.gc-fh .fh-top #gc-rp-q'), null, 8000)), 'the Field home has the small ❓ in its top bar');
  await P.ev(() => { setTimeout(() => { throw new Error('Demo boom from the job card'); }, 0); });   /* a page error PERFREP writes down */
  await sleep(400);
  await P.ev(() => { document.querySelector('#gc-fh-tabs [data-t="more"]').click(); });
  ok(!!(await waitFor(P, () => !!document.querySelector('.gc-fh-sheet[data-ra-more] .pick [data-ra-a="gcrp"]'), null, 6000)), '☰ More has 🆘 Report a problem / Ask a question (Office rows)');
  const more = await P.ev(() => [...document.querySelector('.gc-fh-sheet[data-ra-more] .pick').children].map(b => b.getAttribute('data-ra-a') || b.getAttribute('data-m') || ''));
  ok(more.indexOf('gcrp') > -1 && (more.indexOf('tools') < 0 || more.indexOf('gcrp') < more.indexOf('tools')) && more.indexOf('gcrp-list') < 0, '…before 🧰 Other tools; no Problem reports list for a PM', more);
  const bb = await P.page().locator('.gc-fh-sheet[data-ra-more] [data-ra-a="gcrp"]').boundingBox();
  await P.page().touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  ok(!!(await waitFor(P, () => !!document.getElementById('gc-rp-form') && !document.querySelector('.gc-fh-sheet[data-ra-more]'), null, 5000)), 'the tap opens the form (and closes ☰ More)');
  const scr = await P.ev(() => (document.querySelector('#gc-rp-form .gc-rp-note b') || {}).textContent || '');
  ok(/^Field · home/.test(scr), '"what screen I was on" was taken by itself: ' + scr);
  await P.page().screenshot({ path: SHOTS + 'rp_phone_form.png' });
  await P.page().tap('#gc-rp-form [data-rp-send]'); await sleep(300);
  ok(/Pick what it is/.test(await P.ev(() => document.querySelector('#gc-rp-form .gc-rp-msg').textContent)), 'Send without a kind: asks for the kind');
  await P.page().tap('#gc-rp-form [data-rp-type="broke"]');
  await P.page().fill('#gc-rp-form textarea', 'The punch list button does nothing on the Demo Roof Job');
  await P.page().setInputFiles('#gc-rp-form input[type=file]', { name: 'screen.png', mimeType: 'image/png', buffer: PHOTO });
  ok(!!(await waitFor(P, () => { const i = document.querySelector('#gc-rp-form .pv img'); return i && /^data:image\/jpeg/.test(i.src) ? i.src.length : 0; }, null, 8000)), 'the photo is made small on the phone (JPEG preview)');
  await P.page().tap('#gc-rp-form [data-rp-send]');
  ok(!!(await waitFor(P, () => /Sent — thank you/.test((document.getElementById('gc-rp-form') || {}).textContent || ''), null, 15000)), 'Sent — thank you');
  const L1 = list(), mine = L1.find(x => x.by && x.by.email === PM);
  ok(L1.length === 2 && L1.some(x => x.id === 'PRold1'), 'gc_problem_reports: appended (the older report kept)', L1.map(x => x.id));
  ok(mine && mine.type === 'broke' && mine.status === 'open' && mine.kind === 'phone' && mine.app === 'field' && /^Field · home/.test(mine.screen) && mine.by.name === 'Demo PM' && /punch list/.test(mine.text) && mine.dev && mine.build, 'the report: open, by Demo PM, phone · Field, the screen, the device and version', mine);
  const shot = mine && cget('gc_problem_shot_' + mine.id);
  ok(shot && /^data:image\/jpeg;base64,/.test(shot.data) && shot.data.length < 650 * 1024 && mine.shot === true, 'the photo: its own row, a small JPEG (' + Math.round(((shot && shot.data.length) || 0) / 1024) + ' KB of a 1600×1200 picture)', { writes: H.writes.filter(w => /problem/.test(w.key)).map(w => [w.key, w.len]), keys: [...H.cloud.keys()].filter(k => /problem/.test(k)), errs: P.errs, fn: P.fn.slice(-5).map(f => f.name) });
  const det = mine && cget('gc_problem_detail_' + mine.id);
  ok(det && Array.isArray(det.diag) && det.diag.length <= 20 && det.diag.some(d => /Demo boom/.test(d.t)), 'the page errors / slow taps (PERFREP) are attached: ' + (det && det.diag.length) + ' entries', det && det.diag.slice(0, 3));
  const n1 = NOTIFY.find(n => n.link === '#problems=' + (mine && mine.id));
  ok(n1 && [WES, NICK, OFF].every(e => [].concat(n1.to).includes(e)) && ![].concat(n1.to).includes(PM) && /Something broke — Demo PM/.test(n1.title), 'the admins and the office are told through window._gcNotify (AWAY), with a link to it; not the PM', n1);
  await P.ev(() => { const f = document.getElementById('gc-rp-form'); if (f) f.querySelector('[data-rp-done]').click(); });

  /* ═════ 2. the owner answers ═════ */
  console.log('2 · the owner answers on the Desk');
  const O = await desk('OWNER', WES);
  ok(await openHub(O), '💎 opens with 🆘 Report a problem');
  const hub = await O.ev(() => { const p = [...document.querySelectorAll('.gc-hub-panel')].filter(x => x.getClientRects().length).pop(); const items = [...p.querySelectorAll('.gc-hub-item')]; return { first: items[0] && items[0].id, firstText: items[0] && items[0].textContent, list: !!p.querySelector('#gc-rp-hub-list'), team: !!p.querySelector('#gc-ta-hub'), n: (p.querySelector('#gc-rp-hub-list .gc-rp-n') || {}).textContent || '' }; });
  ok(hub.first === 'gc-rp-hub' && /Report a problem/.test(hub.firstText), 'the FIRST 💎 item is 🆘 Report a problem / Ask a question (pinned until 2026-12-16)', hub);
  ok(hub.list, '💎 has 🆘 Problem reports for the owner', hub);
  await O.page().screenshot({ path: SHOTS + 'rp_hub.png' });
  await O.page().click('#gc-rp-hub-list');
  ok(!!(await waitFor(O, () => !!document.querySelector('#gc-rp-list .gc-rp-it[data-rp-id]'), null, 8000)), '🆘 Problem reports opens');
  const card = await O.ev(id => { const c = document.querySelector('#gc-rp-list [data-rp-id="' + id + '"]'); return c ? c.textContent : ''; }, mine.id);
  ok(/Demo PM/.test(card) && /punch list/.test(card) && /Field · home/.test(card) && /phone/.test(card), 'the open report shows who, what, the screen and the device');
  await O.page().click(`#gc-rp-list [data-rp-id="${mine.id}"] [data-rp-a="shot"]`);
  ok(!!(await waitFor(O, id => { const i = document.querySelector('#gc-rp-list [data-rp-id="' + id + '"] .gc-rp-more img'); return i && i.naturalWidth > 100; }, mine.id, 8000)), '📷 Photo shows the picture');
  await O.page().click(`#gc-rp-list [data-rp-id="${mine.id}"] [data-rp-a="diag"]`);
  ok(!!(await waitFor(O, id => /Demo boom/.test((document.querySelector('#gc-rp-list [data-rp-id="' + id + '"] .gc-rp-diag') || {}).textContent || ''), mine.id, 8000)), '🧾 Errors & slow taps shows the page error');
  await O.page().fill(`#gc-rp-list [data-rp-id="${mine.id}"] [data-rp-ans]`, 'Thanks — fixed in the next update. Use ☰ More → Punch list for now.');
  const nBefore = NOTIFY.length;
  await O.page().click(`#gc-rp-list [data-rp-id="${mine.id}"] [data-rp-a="answer"]`);
  ok(!!(await waitFor(O, () => true, null, 100)) && !!(await (async () => { for (let i = 0; i < 40; i++) { const x = list().find(y => y.id === mine.id); if (x && x.status === 'answered') return x; await sleep(250); } return null; })()), 'the report is answered in gc_problem_reports');
  const ans = list().find(y => y.id === mine.id);
  ok(ans && ans.replies.length === 1 && /next update/.test(ans.replies[0].text) && ans.replies[0].by === 'Wesley Johnson', 'the answer is on the report (who, when, what)', ans && ans.replies);
  const inbox = await (async () => { for (let i = 0; i < 30; i++) { const v = cget('gc_problem_inbox_pm-grayco-cs-com'); const l = typeof v === 'string' ? JSON.parse(v) : v; if (Array.isArray(l) && l.length) return l; await sleep(250); } return null; })();
  ok(inbox && inbox[0].rid === mine.id && /next update/.test(inbox[0].text) && inbox[0].seen === false, "the PM's own inbox row has the answer (unseen)", inbox);
  await sleep(500);
  const n2 = NOTIFY.slice(nBefore).find(n => [].concat(n.to).includes(PM));
  ok(n2 && n2.link === '#myproblems' && /next update/.test(n2.body), 'the PM is told on the phone too (window._gcNotify, link #myproblems)', NOTIFY.slice(nBefore));
  await O.page().screenshot({ path: SHOTS + 'rp_list.png' });

  /* ═════ 3. the PM sees the answer ═════ */
  console.log('3 · the PM sees the answer as a CRM notice');
  await P.ev(() => window._gcReportProb.checkInbox());
  ok(!!(await waitFor(P, () => { const n = document.getElementById('gc-rp-notice'); return n && n.getClientRects().length && /next update/.test(n.textContent) && /Wesley Johnson answered/.test(n.textContent); }, null, 8000)), 'the notice: "Wesley Johnson answered your problem report" + the answer');
  await P.page().screenshot({ path: SHOTS + 'rp_phone_notice.png' });
  await P.page().tap('#gc-rp-notice [data-rp-n="open"]');
  ok(!!(await waitFor(P, () => /next update/.test((document.getElementById('gc-rp-mine') || {}).textContent || '') && /punch list/.test(document.getElementById('gc-rp-mine').textContent), null, 6000)), 'Open → My problem reports: the report with the answer');
  ok(!!(await (async () => { for (let i = 0; i < 30; i++) { const v = cget('gc_problem_inbox_pm-grayco-cs-com'); const l = typeof v === 'string' ? JSON.parse(v) : v; if (l && l[0].seen === true) return true; await sleep(250); } return false; })()), 'opened = seen (the inbox row says so); the notice is gone');
  ok(!(await P.ev(() => !!document.getElementById('gc-rp-notice'))), '…and the notice does not come back');
  await P.page().keyboard.press('Escape'); await sleep(200);
  ok(!(await P.ev(() => !!document.getElementById('gc-rp-mine'))), 'Esc closes it');
  await O.page().click('#gc-rp-list [data-rp-tab="answered"]'); await sleep(300);
  await O.page().click(`#gc-rp-list [data-rp-id="${mine.id}"] [data-rp-a="fixed"]`);
  ok(!!(await (async () => { for (let i = 0; i < 40; i++) { const x = list().find(y => y.id === mine.id); if (x && x.status === 'fixed') return true; await sleep(250); } return false; })()), '✓ Mark fixed → fixed');
  ok(list().length === 2 && list().some(x => x.id === 'PRold1'), 'nothing was deleted');
  await O.page().keyboard.press('Escape'); await sleep(200);
  ok(!(await O.ev(() => !!document.getElementById('gc-rp-list'))), 'Esc closes Problem reports');

  /* ═════ 4. signed out ═════ */
  console.log("4 · signed out: Can't sign in? Report it");
  const S = await phone('SIGNED-OUT');
  ok(!!(await waitFor(S, () => { const b = document.getElementById('gc-rp-signin'); return b && b.getClientRects().length > 0; }, null, 30000)), "the sign-in screen has \"Can't sign in? Report it\"");
  await S.page().screenshot({ path: SHOTS + 'rp_signin_link.png' });
  await S.page().tap('#gc-rp-signin');
  ok(!!(await waitFor(S, () => { const o = document.getElementById('gc-rp-signout'); if (!o) return false; const r = o.querySelector('[data-rp-send]').getBoundingClientRect(); const top = document.elementFromPoint(r.left + 5, r.top + 5); return !!(top && o.contains(top)); }, null, 5000)), 'the form opens ON TOP of the sign-in screen');
  await S.page().fill('#gc-rp-signout [data-rp-name]', 'Sam Newhire');
  await S.page().fill('#gc-rp-signout [data-rp-phone]', '901-555-0177');
  await S.page().fill('#gc-rp-signout textarea', 'It says my password is wrong');
  await S.page().tap('#gc-rp-signout [data-rp-send]');
  ok(!!(await waitFor(S, () => /the office will call you/.test((document.getElementById('gc-rp-signout') || {}).textContent || ''), null, 15000)), 'Sent — the office will call you');
  const so = list().find(x => x.signedOut && x.by && x.by.name === 'Sam Newhire');
  ok(so && so.type === 'signin' && so.by.phone === '9015550177' && so.status === 'open' && so.kind === 'phone' && !so.by.email, "saved: Can't sign in, signed out, name + phone, the phone", so);
  const st = SERVER_TOLD.find(x => x.n && /Can't sign in — Sam Newhire/.test(x.n.title));
  ok(st && [WES, NICK, OFF].every(e => st.to.includes(e)) && /9015550177/.test(st.n.body), 'the admins and the office are told (by the server: the page has no sign-in)', st);
  /* a second one at once from the same phone: the 30 s limit */
  await S.ev(() => window._gcReportProb.signedOut());
  await S.page().fill('#gc-rp-signout [data-rp-name]', 'Sam Newhire'); await S.page().fill('#gc-rp-signout [data-rp-phone]', '901-555-0177'); await S.page().fill('#gc-rp-signout textarea', 'again');
  await S.page().tap('#gc-rp-signout [data-rp-send]');
  ok(!!(await waitFor(S, () => /30 seconds/.test((document.querySelector('#gc-rp-signout .gc-rp-msg') || {}).textContent || ''), null, 10000)), 'a second report at once: "One report every 30 seconds" (rate-limited)');
  ok(list().filter(x => x.signedOut).length === 1, 'only one signed-out report saved');
  await S.page().screenshot({ path: SHOTS + 'rp_signout_limit.png' });

  /* ═════ 5. who sees the list ═════ */
  console.log('5 · the office sees Problem reports; a PM does not');
  const F = await desk('OFFICE', OFF);
  ok(await openHub(F), 'office: 💎 has 🆘 Report a problem');
  ok(await F.ev(() => { const p = [...document.querySelectorAll('.gc-hub-panel')].filter(x => x.getClientRects().length).pop(); return !!p.querySelector('#gc-rp-hub-list') && !p.querySelector('#gc-ta-hub'); }), 'office: 💎 has 🆘 Problem reports (and no 👥 Team activity)');
  await F.ev(() => window._gcCloseHub && window._gcCloseHub());
  ok(!(await P.ev(() => !!window._gcReportProb.list())), 'PM: the Problem reports list does not open');
  ok(P.errs.filter(e => !/Demo boom/.test(e)).length === 0 && O.errs.length === 0 && S.errs.length === 0, 'no page errors', [P.errs, O.errs, S.errs]);
} catch (e) { fail++; console.log('  ✗ FAIL (threw) ' + (e && e.stack || e)); }
finally { for (const c of CLEAN) { try { await c.close(); } catch (e) {} } }
console.log(`\nREPORTPROB: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
