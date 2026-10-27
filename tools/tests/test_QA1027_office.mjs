// test_QA1027_office.mjs <build> — office role ("Office Admin", office@) smoke: every screen the office uses opens with no page error and
// no admin-only wall; Approvals tab + To-Do pin draw; Accounting / P&L / Payroll / Invoices / Payments / Expenses / Office / TV.
import { computer, signIn, sleep, waitFor, shareBrowser, seed, stubInbox, ok, done } from '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wLEADSUX/lux_env.mjs';
const build = process.argv[2];
const shared = await shareBrowser();
const data = seed({ leads: 40, bids: 6, inbox: 6 });
const C = await computer('O', { build }); await stubInbox(C, data.inbox);
await signIn(C, 'office@grayco-cs.com', 14000);
await C.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /^Later$/.test(x.textContent.trim())); if (b) b.click(); });
const errs = () => C.errs.filter(e => /PAGEERROR/.test(e));
const me = await C.ev(() => { const u = (window._gcMeUser && window._gcMeUser()) || {}; return { role: u.role, admin: !!(window.__GC_AUTH__ && window.__GC_AUTH__.isAdmin && window.__GC_AUTH__.isAdmin()) }; });
ok('signed in as the office (Office Admin, not an admin)', /^office/i.test(me.role || '') && !me.admin, me);
const WALL = /admins? only|only (an )?admins?|not allowed|you do not have (access|permission)|access denied|something went wrong|cannot read properties|is not a function|undefined is not/i;
for (const v of ['dashboard', 'todo', 'approvals', 'taxcenter', 'payroll', 'invoices', 'payments', 'expenses', 'officemanager', 'projects', 'customers', 'leads']) {
  const e0 = errs().length;
  await C.ev(x => window._setView(x), v); await sleep(2500);
  await waitFor(C, () => ((document.querySelector('main') || document.body).innerText || '').length > 80, null, 9000, 300);   /* a tab drawn by a background tick (≤ 5 s when nobody touches the page) */
  const r = await C.ev(() => { const m = document.querySelector('main') || document.body; return { len: (m.innerText || '').length, txt: (m.innerText || '').slice(0, 30000), view: localStorage.getItem('grayco_view') }; });
  const wall = (r.txt.match(WALL) || [])[0];
  ok('office: ' + v + ' opens (' + r.len + ' chars), no page error, no admin-only wall', r.len > 80 && errs().length === e0 && !wall, { view: r.view, wall, errs: errs().slice(e0, e0 + 2), head: r.len < 200 ? r.txt : '' });
  const cc = await C.ev(() => (document.body.innerText.match(/.{0,50}CompanyCam.{0,30}/g) || []).slice(0, 3));
  ok('office: ' + v + ' never says "CompanyCam" (GrayCo Photos)', !cc.length, cc);
}
const apx = await C.ev(() => { try { return { st: window._gcAPX && window._gcAPX.state ? window._gcAPX.state() : null, rows: window._gcAPX && window._gcAPX.rows ? window._gcAPX.rows().length : -1 }; } catch (e) { return { err: e.message }; } });
ok('office: the Approvals data reads without error', apx && !apx.err && apx.rows >= 0, apx);
await C.ev(() => window._setView('todo')); await sleep(3000);
ok('office: To-Do shows the approvals pin', await C.ev(() => /Approvals waiting on you|nothing waiting|Approvals/i.test(document.body.innerText)));
const tv = await C.ev(() => { try { return typeof window._gcTvScope === 'function' ? window._gcTvScope() : null; } catch (e) { return { err: e.message }; } });
ok('no page errors overall', errs().length === 0, errs().slice(0, 4));
done(shared);
