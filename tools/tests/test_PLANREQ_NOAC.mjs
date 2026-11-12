// test_PLANREQ_NOAC.mjs <build-dir> [shot-dir] — patch PLANREQ-G (owner 11/12, 📂 Manage → 📝 Details: typing "Wesley Johnson" in the PM name popped the
// CRM's app-wide name dropdown ("📁 Projects · … / 👤 Team …") and "it won't go away"). Offline harness, made-up data.
//   1. inside the bid portal's own sheets ([data-gc-noac]: 📂 Manage, 📢 Put on bid portal, the Bid portal tab) the dropdown never opens;
//   2. everywhere else it still works, and now closes on Escape, on a click outside, and when its box is gone.
import path from 'path'; import fs from 'fs';
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const { computer, signIn, sleep, cset, resetCloud } = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const at = new Date(Date.now() - 864e5).toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'P1', name: 'Wesley Johnson', client: 'Sample Client', address: '1 Sample St', status: 'active', autoPO: 'L705', pm: 'Wesley Johnson', createdAt: at, updatedAt: at }]);
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await A.ctx.route('**/.netlify/functions/bid-hub*', rt => {
  const u = new URL(rt.request().url()), J = b => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (u.searchParams.get('manage')) return J({ ok: true, paused: false, job: { id: 'J1', title: 'Apartment Fire', address: '2817 Sample Ct', due: '', visibility: 'public', trades: 'Drywall', tradeScopes: [], plansLinks: [], addenda: [], posts: [], log: [], contacts: {} }, plans: [], planreqs: [], questions: [], acks: [], activity: [], audience: [] });
  if (u.searchParams.get('jobs')) return J({ ok: true, jobs: [], me: { email: 'wjohnson@grayco-cs.com', admin: true, canInvite: true, canPublic: true } });
  return J({ ok: true });
});
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
const shown = () => A.ev(() => [...document.querySelectorAll('._ac-list.show')].map(l => l.textContent.slice(0, 80)));
/* 1. 📂 Manage → 📝 Details */
await A.ev(() => window._gcSys2.open('J1', 'details'));
await A.ev(() => new Promise(r => { const t0 = Date.now(); (function f(){ if (document.querySelector('#gcsys2 [data-d="pmName"]') || Date.now() - t0 > 15000) r(); else setTimeout(f, 200); })(); }));
await A.ev(() => document.querySelector('#gcsys2 [data-d="pmName"]').focus()); await A.page().keyboard.type('Wesley Johnson', { delay: 30 }); await sleep(16000);   /* the app-wide scan runs on focus, on page changes and every 15 s */
await A.page().keyboard.type(' ', { delay: 30 }); await sleep(600);
const s1 = await shown();
ok('1 typing "Wesley Johnson" in 📝 Details → PM name: no app-wide name dropdown', s1.length === 0, s1);
await A.ev(() => document.querySelector('#gcsys2 [data-d="estName"]').focus()); await A.page().keyboard.type('Wes', { delay: 30 }); await sleep(600);
ok('1 … nor in Estimator name', (await shown()).length === 0);
if (SHOTS) await A.page().screenshot({ path: SHOTS + '/crm10_details_no_global_dropdown.png' });
await A.ev(() => window._gcSys2.close());
/* 2. elsewhere: still works, and closes */
await A.ev(() => { const d = document.createElement('div'); d.id = 'tst-ac'; d.style.cssText = 'position:fixed;top:120px;left:300px;z-index:2147482000;background:#fff;padding:8px'; d.innerHTML = '<label>Customer name <input type="text" id="tst-in" placeholder="Customer name"></label>'; document.body.appendChild(d); });
await sleep(800);
await A.ev(() => { const i = document.getElementById('tst-in'); i.focus(); i.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); }); await A.page().keyboard.type('Wesley', { delay: 30 }); await sleep(500);
ok('2 a normal CRM box (Customer name) still gets the dropdown', (await shown()).some(x => /Wesley/.test(x)));
await A.page().keyboard.press('Escape'); await sleep(200);
ok('2 Escape closes it', (await shown()).length === 0);
await A.page().keyboard.type('J', { delay: 30 }); await A.page().keyboard.press('Backspace'); await sleep(400);
ok('2 typing again re-opens it', (await shown()).length === 1);
await A.page().mouse.click(900, 600); await sleep(300);
ok('2 a click anywhere else closes it', (await shown()).length === 0);
await A.ev(() => { const i = document.getElementById('tst-in'); i.focus(); i.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); }); await A.page().keyboard.press('Backspace'); await A.page().keyboard.type('y', { delay: 30 }); await sleep(400);
const open1 = (await shown()).length;
await A.ev(() => document.getElementById('tst-ac').remove()); await sleep(900);
ok('2 when its box is gone (a redraw), it closes at once (was: floated for up to 5 s)', open1 === 1 && (await shown()).length === 0, open1);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('PLANREQ_NOAC ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
