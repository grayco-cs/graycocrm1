// test_TODOJUMP.mjs <build-dir> — owner 11/12 ("Also waiting: Missing job data" bar on To-Do "glitches / jumps"): the cards never land above
// the To-Do list and then move; after a reload the bar is drawn at once from its saved list; no movement once it is up. Made-up data only.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); const at = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', Array.from({ length: 12 }, (_, i) => ({ id: 'p' + i, name: 'Test Job ' + i, status: 'Active', phase: 'In Progress', createdAt: at })));
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(4000);
const sample = async (n) => { const rows = []; for (let i = 0; i < n; i++) { rows.push(await A.ev(() => { const g = id => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().top) : null; }; return { bar: g('gc-tt2'), list: g('_todoMount') }; })); await sleep(250); } return rows; };
await A.ev(() => window._setView('todo'));
let r = await sample(40);
const tops = r.map(x => x.list).filter(v => v != null), first = r.findIndex(x => x.bar != null);
ok('first visit: the bar shows up', first > -1, r.slice(-1));
ok('first visit: the list is never pushed below where it ends up (no cards above it first)', Math.max(...tops) <= tops[tops.length - 1], tops.slice(0, 12));
ok('first visit: nothing moves once the bar is up', new Set(r.slice(first).map(x => x.bar + ',' + x.list)).size === 1, r.slice(first, first + 8));
await A.ev(() => window._setView('dashboard')); await sleep(1500); await A.ev(() => location.reload()); await sleep(9000);
await A.ev(() => window._setView('todo'));
r = await sample(24);
const f2 = r.findIndex(x => x.bar != null);
ok('after a reload the bar is drawn within 0.5 s (its saved list)', f2 > -1 && f2 <= 2, r.slice(0, 4));
ok('after a reload: nothing moves', new Set(r.slice(f2).map(x => x.bar + ',' + x.list)).size === 1, r.slice(f2, f2 + 8));
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('TODOJUMP ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
