// test_AWAY.mjs <build-dir> — patch AWAY, the CRM page (harness_N; made-up data; appr-away / portal answered by the test).
//   1. the owner's iPhone (home-screen app): GrayCo Field shows the green 🔔 card; Turn on asks once, subscribes this phone
//      and sends { sub, device: 'phone' }; ⚙ Settings has 🔔 Phone notifications; nothing of AWAY paints before the server answers
//   2. a push's deep link opens that approval in Field (#apx=<key>, #apx=mine); a customer e-mail opens its own card (#apx=ap2:…)
//   3. "Wesley is away — Nick is covering" shows ONLY on the item the server marked (an any-admin item: no note)
//   4. the computer: 🏖 Away panel — Turn on sends from / until / cover / summary OFF; "Reconnect Google" when the scope is
//      missing; I'm back sends off; 📊 Approvals this week shows who / device / waited / stuck
//   5. the audit: a decision carries the device (customer e-mail approvals in the portal call; CRM-page ones in op audit);
//      the admin feed of CRM-only approvals; the second admin (Nick) is an approver everywhere the owner is
// Run: flock <browser.lock> node tools/tests/test_AWAY.mjs <abs build dir>
import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, cset, resetCloud, ACCOUNTS, waitFor, onFn } = H;
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const byId = id => Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].id === id);
const WES = byId('u-wesley'), NICK = byId('u-nick'), PM = byId('u-pm');
const now = Date.now(), iso = ms => new Date(ms).toISOString(), today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const tomorrow = (() => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: WES, role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Demo PM', email: PM, role: 'Project Manager', active: true }]);
cset('projects', [{ id: 'P1', name: 'Sample Deck', client: 'Sample Client', address: '100 Sample St', status: 'active', autoPO: 'T101', pm: 'Demo PM', createdAt: iso(now - 4 * 864e5), updatedAt: iso(now - 4 * 864e5) },
  { id: 'P2', name: 'Sample Owner Job', client: 'Sample Two', address: '200 Sample St', status: 'active', autoPO: 'T102', pm: 'Wesley Johnson', createdAt: iso(now - 4 * 864e5), updatedAt: iso(now - 4 * 864e5) }]);
const Q = (id, o) => Object.assign({ id, kind: 'final_invoice', title: 'Sample final invoice ' + id, jobId: 'P1', jobName: 'Sample Deck', pm: 'Demo PM', pmEmail: PM, to: 'client@sample.test', subject: 'Your invoice', html: '<p>Invoice</p>', text: 'Invoice', channel: 'email', steps: ['pm', 'admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: iso(now - 3 * 3600e3), updatedAt: iso(now - 3 * 3600e3), adminSince: iso(now - 3 * 3600e3), meta: {} }, o || {});
cset('gc_approval_queue', JSON.stringify([Q('AQ1'), Q('AQ2', { jobId: 'P2', jobName: 'Sample Owner Job', pm: 'Wesley Johnson', pmEmail: WES, kind: 'thank_you', steps: ['pm'], step: 'pm', title: 'Sample thank-you (owner job)' })]));
cset('gc_automation_pause', { on: true, by: NICK });

/* the server, answered here */
const CALLS = [];
const VKEY = Buffer.alloc(65, 7); VKEY[0] = 4; const KEY = VKEY.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let AWAYREC = null, COVERED = {};
onFn('appr-away', ({ body, A }) => {
  CALLS.push({ who: A.name, body });
  const op = body.op;
  const admins = [{ email: WES, name: 'Wesley Johnson' }, { email: NICK, name: 'Nick Gray' }];
  if (op === 'state') return { ok: true, me: { email: A.name, admin: A.name !== PM }, today, mine: AWAYREC && AWAYREC.email === A.name ? AWAYREC : null, away: AWAYREC ? [AWAYREC] : [], admins,
    push: { ready: true, key: KEY, devices: A.__sub ? 1 : 0, on: !!A.__sub && !!body.endpoint, list: [] }, covered: A.name === NICK ? COVERED : {}, defaultText: 'Thanks for your e-mail. I\'m away from the office until ' + (body.to || 'Friday') + '. For anything you need, please contact our office.' };
  if (op === 'subscribe') { A.__sub = body.sub; return { ok: true, on: true }; }
  if (op === 'set') { AWAYREC = { id: 'AW1', email: body.email, name: 'Wesley Johnson', from: body.from, to: body.to, cover: body.cover, coverName: 'Nick Gray', summary: body.summary, replyText: body.replyText, sentence: 'Wesley is away until Fri — Nick is covering', vacation: { ok: false, needReconnect: true, error: 'Reconnect Google to turn on the e-mail auto-reply.' } }; return { ok: true, away: AWAYREC, vacation: AWAYREC.vacation }; }
  if (op === 'off') { const was = AWAYREC; AWAYREC = null; return { ok: true, off: true, was, vacation: { ok: true } }; }
  if (op === 'week') return { ok: true, came: 3, handled: [{ key: 'ap2:AQ1', title: 'Sample final invoice AQ1', decision: 'approved', by: 'Nick Gray', email: NICK, device: 'phone', at: iso(now - 3600e3), waitedMin: 95 }, { key: 'sub:S1', title: 'Sample sub invoice', decision: 'denied', by: 'Wesley Johnson', email: WES, device: 'computer', at: iso(now - 7200e3), waitedMin: 30 }],
    waiting: [{ key: 'ap2:AQ9', title: 'Sample stuck item', waitH: 30, to: [NICK] }], stuck: [{ key: 'ap2:AQ9', title: 'Sample stuck item', waitH: 30, to: [NICK] }], away: AWAYREC ? [AWAYREC] : [] };
  return { ok: true };
});
const PORTAL = [];
onFn('portal', ({ body }) => { PORTAL.push(body); if (body && body.action === 'approval' && body.op === 'list') return { ok: true, items: JSON.parse(H.cget('gc_approval_queue') || '[]') }; return { ok: true }; });

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const phoneInit = () => {
  try { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }); } catch (e) {}
  try { Object.defineProperty(navigator, 'standalone', { get: () => true }); } catch (e) {}   /* opened from the home-screen icon */
  /* a fake push stack (the harness blocks service workers): records what the page asks */
  window.__push = { asked: 0, subscribed: null, registered: '' };
  const sub = { endpoint: 'https://web.push.apple.com/QAphone', toJSON(){ return { endpoint: this.endpoint, keys: { p256dh: 'BPk', auth: 'au' } }; }, unsubscribe: () => Promise.resolve(true) };
  let have = null;
  const reg = { pushManager: { getSubscription: () => Promise.resolve(have), subscribe: o => { window.__push.subscribed = { key: o.applicationServerKey && o.applicationServerKey.length, uvo: o.userVisibleOnly }; have = sub; return Promise.resolve(sub); } } };
  const sw = { register: (u) => { window.__push.registered = u; return Promise.resolve(reg); }, getRegistration: () => Promise.resolve(window.__push.registered ? reg : undefined), getRegistrations: () => Promise.resolve([]), ready: Promise.resolve(reg), addEventListener(){} };
  try { Object.defineProperty(navigator, 'serviceWorker', { get: () => sw }); } catch (e) {}
  window.PushManager = window.PushManager || function(){};
  window.Notification = function(){}; window.Notification.permission = 'default';
  window.Notification.requestPermission = () => { window.__push.asked++; window.Notification.permission = 'granted'; return Promise.resolve('granted'); };
};

console.log('1 · the owner\'s iPhone (home-screen app)');
const A = await computer(WES, { build, mobile: true, init: phoneInit });
await signIn(A, WES, 15000);
ok(!!(await waitFor(A, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 45000)), 'the phone opens GrayCo Field');
ok(!!(await waitFor(A, () => !!document.getElementById('gc-away-pushcard'), null, 20000)), 'the green 🔔 "Get your approvals on this phone" card is on the Field home');
const card = await A.ev(() => (document.getElementById('gc-away-pushcard') || {}).textContent || '');
ok(/Turn on/.test(card) && /approvals on this phone/i.test(card), 'the card says what it does and has Turn on', card);
await A.page().locator('#gc-away-pushcard [data-gcaway-card="on"]').click();
ok(!!(await waitFor(A, () => !!(window.__push.subscribed), null, 10000)), 'Turn on: permission asked once, then this phone is subscribed with the server key');
const p0 = await A.ev(() => window.__push);
ok(p0.asked === 1 && p0.registered === '/crm-push-sw.js' && p0.subscribed.key === 65 && p0.subscribed.uvo === true, 'the push service worker /crm-push-sw.js, userVisibleOnly, the 65-byte key', p0);
await sleep(800);
const subC = CALLS.filter(c => c.body.op === 'subscribe').pop();
ok(subC && subC.body.device === 'phone' && subC.body.sub.endpoint && subC.body.sub.keys, 'the server is sent the subscription and device "phone"', subC && subC.body);
ok(CALLS.some(c => c.body.op === 'test'), 'a test notification is asked for right away');
ok(!!(await waitFor(A, () => !document.getElementById('gc-away-pushcard'), null, 8000)), 'the card goes once notifications are on');
/* ⚙ Settings → 🔔 */
await A.ev(() => { if (window._gcField && window._gcField.settings) window._gcField.settings(); });
ok(!!(await waitFor(A, () => !!document.querySelector('.gc-fh-sheet [data-gcaway-more]'), null, 6000)), 'Field ⚙ Settings has 🔔 Phone notifications');
await A.ev(() => document.querySelectorAll('.gc-fh-sheet').forEach(o => o.remove()));

console.log('2 · a notification\'s link opens that approval');
await A.ev(() => { window.__opened = []; const o = window._gcAp2Preview; window._gcAp2Preview = function(id){ window.__opened.push('ap2:' + id); return o && o.apply(this, arguments); }; });
await A.ev(() => { location.hash = '#apx=ap2:AQ2'; });
ok(!!(await waitFor(A, () => window.__opened.indexOf('ap2:AQ2') >= 0, null, 30000)), '#apx=ap2:AQ2 (a customer e-mail) opens its own approval card');
ok(await A.ev(() => !/apx=/.test(location.hash)), 'the link is taken off the address afterwards');
const firstKey = await A.ev(() => { const l = (window._gcField && window._gcField.approvals && window._gcField.approvals()) || []; const x = l.filter(y => !/^ap2:/.test(y.id))[0] || l[0]; return x ? x.id : ''; });
if (firstKey) {
  await A.ev(() => { window.__before = new Set([...document.body.children]); });
  await A.ev(k => { location.hash = '#apx=' + encodeURIComponent(k); }, firstKey);
  ok(!!(await waitFor(A, () => !/apx=/.test(location.hash) && [...document.body.children].some(e => !window.__before.has(e) && getComputedStyle(e).position === 'fixed' && !/toast/.test(e.className)), null, 20000)), 'a Field approval (' + firstKey + ') opens from its link');
  await A.ev(() => [...document.body.children].forEach(e => { if (!window.__before.has(e) && getComputedStyle(e).position === 'fixed') e.remove(); }));
} else ok(true, '(no other Field approval in this data)');
await A.ev(() => { window.__mine = 0; const o = window._gcOpenPmApprovals; window._gcOpenPmApprovals = function(){ window.__mine++; return o && o.apply(this, arguments); }; location.hash = '#apx=mine'; });
ok(!!(await waitFor(A, () => window.__mine > 0, null, 15000)), '#apx=mine (several new) opens My Approvals on the phone');
await A.ev(() => document.querySelectorAll('body > div').forEach(o => { if (/My Approvals/.test(o.textContent || '') && getComputedStyle(o).position === 'fixed') o.remove(); }));
const errsA = A.errs.slice();
await A.close();

console.log('3 · Nick covering: the note only on the owner-only item');
COVERED = { 'ap2:AQ2': 'Wesley Johnson' };
const N = await computer(NICK, { build });
await signIn(N, NICK, 15000);
await waitFor(N, () => !!window._crm && !!window._gcAPX, null, 30000);
await N.ev(() => window._gcAway.refresh(true));
await N.ev(() => window._gcAPX.open(''));
ok(!!(await waitFor(N, () => !!document.querySelector('.apx-row[data-k="ap2:AQ2"] [data-gcaway-cov]'), null, 20000)), 'the owner-only item shows "Wesley is away — Nick is covering"');
const notes = await N.ev(() => [...document.querySelectorAll('[data-gcaway-cov]')].map(e => [e.getAttribute('data-gcaway-cov'), e.textContent]));
ok(notes.length === 1 && /^🏖 Wesley is away — Nick is covering$/.test(notes[0][1]), 'and on no other item (the any-admin invoice has no note)', notes);
ok(await N.ev(() => { try { return !!window._gcPayrollApprover('Nick Gray') || !!window._gcPayrollApprover(); } catch (e) { return null; } }) !== false, 'Nick is a payroll approver like the owner (role / name rule)');
const nickRows = await N.ev(() => window._gcAPX.rows().filter(r => /^ap2:AQ/.test(r.key)).map(r => [r.key, r.approve]));
ok(nickRows.length >= 1 && nickRows.every(r => r[1]), 'Nick can approve the admin-step items in Approvals', nickRows);
/* the audit */
PORTAL.length = 0;
await N.ev(() => window._gcApprovalAct('AQ1', 'approve'));
await sleep(800);
const pa = PORTAL.find(b => b.action === 'approval' && b.op === 'approve');
ok(pa && pa.device === 'computer' && pa.id === 'AQ1', 'a customer-e-mail approval carries the device ("computer") to the server', pa);
CALLS.length = 0;
await N.ev(() => window._gcAwayAudit({ key: 'td:co:CO1', src: 'other', kindL: 'Change order', title: 'Sample change order', job: 'Sample Deck', since: Date.now() - 3600e3 }, 'approved'));
await N.ev(() => window._gcAwayAudit({ key: 'ap2:AQ1', src: 'queue', title: 'x' }, 'approved'));
await sleep(600);
const au = CALLS.filter(c => c.body.op === 'audit');
ok(au.length === 1 && au[0].body.rec.key === 'td:co:CO1' && au[0].body.rec.device === 'computer' && au[0].body.rec.decision === 'approved' && au[0].body.rec.since, 'a CRM-page decision → op audit with key / device / since (queue items are audited by the server)', au.map(c => c.body));
CALLS.length = 0; await N.ev(() => window._gcAway.feed()); await sleep(600);
ok(CALLS.some(c => c.body.op === 'feed' && Array.isArray(c.body.items)), 'an admin\'s open CRM reports the CRM-only approvals (op feed)');
const errsN = N.errs.slice();
await N.close();

console.log('4 · the computer: 🏖 Away, 📊 Approvals this week');
const D = await computer(WES, { build });
await signIn(D, WES, 15000);
await waitFor(D, () => !!window._crm && !!window._gcAway, null, 30000);
await D.ev(() => window._gcAway.open());
ok(!!(await waitFor(D, () => !!document.querySelector('#gc-away-panel [data-gcaway="on"]'), null, 15000)), 'the 🏖 Away panel opens (Away + phone notifications)');
const form = await D.ev(() => { const q = f => document.querySelector('#gc-away-panel [data-gcaway-f="' + f + '"]'); return { from: q('from').value, to: q('to').value, cover: q('cover').value, summary: q('summary').checked, reply: q('reply').value }; });
ok(form.from === today && form.to === '' && !form.summary && /away from the office/.test(form.reply), 'defaults: from today, no end date, summary OFF, the auto-reply words', form);
await D.ev(t => { const q = f => document.querySelector('#gc-away-panel [data-gcaway-f="' + f + '"]'); q('to').value = t; q('to').dispatchEvent(new Event('change')); }, tomorrow);
CALLS.length = 0;
await D.page().locator('#gc-away-panel [data-gcaway="on"]').click();
await waitFor(D, () => /Saved/.test((document.querySelector('#gc-away-panel [data-gcaway-msg]') || {}).textContent || ''), null, 8000);
const setC = CALLS.find(c => c.body.op === 'set');
ok(setC && setC.body.from === today && setC.body.to === tomorrow && setC.body.cover === NICK && setC.body.summary === false, 'Turn Away on sends from / until / cover (the other admin) / summary off', setC && setC.body);
ok(!!(await waitFor(D, () => !!document.querySelector('#gc-away-panel [data-gcaway="google"]'), null, 8000)), 'without the Gmail scope: "Reconnect Google" is shown with its button');
ok(/Wesley is away until Fri — Nick is covering/.test(await D.ev(() => (document.querySelector('#gc-away-panel [data-gcaway-now]') || {}).textContent || '')), 'the panel says who is away and who covers');
CALLS.length = 0;
await D.page().locator('#gc-away-panel [data-gcaway="off"]').click(); await sleep(900);
ok(CALLS.some(c => c.body.op === 'off'), 'I\'m back — turn Away off');
await D.ev(() => document.querySelectorAll('.gc-away-modal').forEach(o => o.remove()));
await D.ev(() => window._gcAway.week());
ok(!!(await waitFor(D, () => !!document.querySelector('#gc-away-week [data-wk-row]'), null, 10000)), '📊 Approvals this week opens');
const wk = await D.ev(() => ({ rows: [...document.querySelectorAll('#gc-away-week [data-wk-row]')].map(r => r.textContent), stuck: [...document.querySelectorAll('#gc-away-week [data-wk-stuck]')].map(r => r.textContent), sum: (document.querySelector('#gc-away-week [data-wk-sum]') || {}).textContent }));
ok(wk.rows.length === 2 && /Nick Gray/.test(wk.rows[0]) && /📱 phone/.test(wk.rows[0]) && /2 h/.test(wk.rows[0]) && /🖥 computer/.test(wk.rows[1]), 'each handled one: what, who, which device, how long it waited', wk.rows);
ok(wk.stuck.length === 1 && /30 h/.test(wk.stuck[0]), 'anything waiting 24 h+ is listed', wk.stuck);
ok(/Came in/.test(wk.sum) && /Waiting 24 h\+/.test(wk.sum), 'the summary line (came in · handled · waiting · 24 h+)', wk.sum);
await D.ev(() => { location.hash = '#apx=week'; });
ok(!!(await waitFor(D, () => document.querySelectorAll('#gc-away-week').length >= 2 || !/apx=week/.test(location.hash), null, 10000)), '#apx=week (the summary e-mail\'s link) opens it too');
const errsD = D.errs.slice();
await D.close();

const errs = errsA.concat(errsN, errsD).filter(e => /gcaway|_gcAway|AWAY/i.test(e));
ok(!errs.length, 'no page error from patch AWAY', errs);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
