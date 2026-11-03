// test_APPROVALSFIX.mjs <build-dir> [mirror.json] — the navy "My Approvals" sheet (owner 11/03: "had to click away for it to
// approve and actually go off the screen to get to this button"). On the read-only mirror (never committed), as Wesley, with one
// pending expense + one Form 941 waiting (an "other approval"), the same seeding as test_APPRDOC:
//   1. the sheet never says "You're all caught up!" while its header counts something to approve;
//   2. the red "🧾 1 expense to approve" button opens the expense view ON TOP and in view: its Approve button is the topmost
//      element at its own centre and inside the viewport, at 1280x720 and 610x720, without the page itself scrolling;
//   3. Approve there → the My Approvals sheet is back by itself, refreshed in place: no expense button, the header matches the live set (no expense),
//      the 941 still listed, no "caught up" — no click-away, no close-and-reopen.
// Env: GC_HARNESS (default scratchpad wN/harness_N.mjs). Run under the scratchpad's browser_lock.sh.
import path from 'path'; import fs from 'fs'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cloud, mclick } = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const build = path.resolve(process.argv[2] || '.'), MIRROR = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const email = 'wjohnson@grayco-cs.com';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };

resetCloud(); for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const V = k => { const v = (cloud.get(k) || {}).value; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) {} } return v; };
const put = (k, v) => cloud.set(k, { key: k, value: v, updated_at: new Date().toISOString() });
const projs = (V('projects') || []).filter(p => p && p.id && /active/i.test(String(p.status || '')) && !/^QB_/.test(p.id)), job = projs[0];
const today = new Date().toISOString().slice(0, 10), ent = new Date(Date.now() - 864e5).toISOString();
/* only our two cards: the mirror's other pending approvals are cleared so the counts are exact */
put('gc_sub_approvals', []); put('gc_email_queue', []); put('gc_approval_queue', []);
/* the mirror's own expenses are marked approved, so ours is the only expense the scan finds */
put('expenses', (V('expenses') || []).map(e => e && typeof e === 'object' ? Object.assign({}, e, { approved: true }) : e).concat([{ id: 'EXPAFTEST1', type: 'expense', vendor: 'AFTest Lumber', desc: 'AFTest boards', amt: 77.5, pid: job.id, category: 'Materials', status: 'pending', date: today, by: 'Wesley Johnson', enteredAt: ent, updatedAt: ent }]));
const EQ = [{ id: 'expId:EXPAFTEST1', expId: 'EXPAFTEST1', jobId: job.id, pm: 'Wesley Johnson', amount: 77.5, payee: 'AFTest Lumber', desc: 'AFTest boards', matched: true, status: 'pending_pm', enteredAt: ent }];
put('gc_expense_approvals', EQ);
const F941 = [{ id: 'f941_2026_Q3', kind: 'f941', year: 2026, q: 3, status: 'waiting', due: '2026-11-02', createdAt: ent, createdBy: 'CRM', updatedAt: ent, at: ent, numbers: { L2: 1000, L3: 100, L12: 250, L13: 250, L14: 0, warnings: [] } }];
put('gc_payroll_approvals', F941);

const c = await computer('AF', { build }); const p = c.page();
await p.setViewportSize({ width: 1280, height: 720 });
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500);
await sleep(12000);
await p.evaluate(([eq, f]) => { const add = (k, l, key) => { const cur = JSON.parse(localStorage.getItem(k) || '[]'); if (!cur.some(x => x[key] === l[0][key])) localStorage.setItem(k, JSON.stringify(cur.concat(l))); };
  add('gc_expense_approvals', eq, 'expId'); localStorage.setItem('gc_sub_approvals', '[]'); localStorage.setItem('gc_email_queue', '[]'); add('gc_payroll_approvals', f, 'id'); if (window._gcApprovalSetFresh) window._gcApprovalSetFresh(); }, [EQ, F941]);
const SET = () => p.evaluate(() => { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); const s = window._gcApprovalSet(); return { total: s.total, tip: s.tip, exp: window._gcExpenseApprovalsFor().filter(a => /AFTEST/.test(a.expId)).length }; });
console.log('   set', JSON.stringify(await SET()));

/* the My Approvals sheet as the owner sees it */
const sheet = () => p.evaluate(() => {
  const ov = [...document.querySelectorAll('body > div')].find(o => o.style.position === 'fixed' && /My Approvals/.test((o.firstElementChild && o.firstElementChild.textContent || '').slice(0, 200)) && getComputedStyle(o).display !== 'none');
  if (!ov) return null; const card = ov.firstElementChild, vis = e => !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none';
  const caught = [...card.querySelectorAll('div')].some(d => /^\s*✓ You're all caught up!?\s*$/.test(d.textContent) && vis(d));
  const head = card.querySelector('[data-gc-appr-total]');
  const hr = (head || card).getBoundingClientRect(), at = document.elementFromPoint(hr.left + hr.width / 2, hr.top + Math.min(hr.height / 2, 10));
  return { onTop: !!at && ov.contains(at), head: head ? head.textContent : '', n: head ? +head.getAttribute('data-gc-appr-total') : null, caught, exp: !!card.querySelector('#_paExp'), other: /Form 941 for Q3 2026/.test(card.textContent) };
});
await p.evaluate(() => window._gcOpenPmApprovals());
let s1 = await waitFor(c, () => { const h = document.querySelector('[data-gc-appr-total]'); return h && /other approval/.test(h.textContent) ? true : null; }, null, 8000, 300); await sleep(1200);
s1 = await sheet(); console.log('   sheet', JSON.stringify(s1));
ok(s1 && s1.exp && s1.other, 'My Approvals shows the red expense button and the Form 941 "other approval"', s1);
ok(s1 && !(s1.caught && (s1.exp || s1.other || s1.n > 0)), 'no "You\'re all caught up!" while something is pending', s1);
ok(s1 && /expense/.test(s1.head) && /other approval/.test(s1.head), 'the header counts both (the expense and the 941): ' + (s1 && s1.head), s1);

/* the red button → the expense view, on top and in view */
await mclick(p, '#_paExp'); await sleep(1500);
const reach = () => p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter(x => /Approve\s*→\s*P&L/.test(x.textContent) && x.offsetParent !== null).pop();
  if (!b) return { found: false }; b.scrollIntoView({ block: 'nearest' });
  const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, top = document.elementFromPoint(cx, cy);
  return { found: true, onTop: !!top && (top === b || b.contains(top)), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, pageScroll: scrollY + document.documentElement.scrollTop + document.body.scrollTop, topEl: top ? (top.id || top.tagName) + ' ' + (top.textContent || '').slice(0, 40) : null };
});
for (const [w, h] of [[610, 720], [1280, 720]]) {
  await p.setViewportSize({ width: w, height: h }); await sleep(600);
  const r = await reach(); console.log('   ' + w + 'x' + h, JSON.stringify(r));
  ok(r.found && r.onTop && r.inView && r.pageScroll === 0, w + 'x' + h + ': the expense view is on top, its Approve button in view (no page scroll)', r);
}
await mclick(p, [...await p.locator('button', { hasText: /Approve\s*→\s*P&L/ }).all()].pop()); await sleep(2500);
const s2 = await sheet(), set2 = await SET(); console.log('   after approve', JSON.stringify(s2), JSON.stringify(set2));
ok(s2 && s2.onTop, 'after Approve the My Approvals sheet is back on top by itself (no close-and-reopen)', s2);
/* (the mirror's other cards may sync back meanwhile: the header must match the live set, without the expense) */
ok(s2 && !s2.exp && s2.other && s2.n === set2.total && !/expense/.test(s2.head) && !s2.caught, 'refreshed in place: expense gone, header = the live count with no expense, the 941 still there, no "caught up"', s2);
ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
await c.b.close(); process.exit(fail ? 1 : 0);
