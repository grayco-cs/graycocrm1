// test_COLEAK.mjs <build-dir> — QA B4/B5/B6/B8 (11/11): with Mitigation picked, the Dashboard job costs and schedule, the top search
// and a new no-job expense belong to Mitigation only. Made-up data only (Conzz = Construction, Mitzz = Mitigation).
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
const at = new Date().toISOString(), d = at.slice(0, 10);
cset('projects', [{ id: 'C1', name: 'Conzz Alpha', client: 'Conzz Client', contract: 77777, status: 'active', createdAt: at, updatedAt: at },
  { id: 'M1', name: 'Mitzz Beta', client: 'Mitzz Client', contract: 5000, status: 'active', companyId: 'mitigation', createdAt: at, updatedAt: at }]);
cset('expenses', [{ id: 'E1', pid: 'C1', amt: 1234.56, date: d, vendor: 'Conzz Lumber', status: 'approved' }, { id: 'E2', pid: 'M1', amt: 222.22, date: d, vendor: 'Mitzz Rental', status: 'approved' }]);
cset('schedule', [{ id: 'S1', pid: 'C1', date: d, title: 'Conzz Alpha demo day', assignee: 'Wesley Johnson' }, { id: 'S2', pid: 'M1', date: d, title: 'Mitzz drying check', assignee: 'Wesley Johnson' }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(5000);
await A.ev(() => window._gcCo.setFilter('mitigation')); await sleep(2000);
await A.ev(() => window._setView('dashboard')); await sleep(4000);
const dash = await A.ev(() => document.body.innerText);
ok('B4: Mitigation Dashboard job costs = Mitigation only ($222.22, not $1,456.78)', !/1,456\.78|1456\.78/.test(dash) && !/1,234\.56/.test(dash), (dash.match(/Job Costs[^\n]*\n?[^\n]*/) || [''])[0]);
ok('B5: the Dashboard schedule has no Construction items', !/Conzz Alpha demo day/.test(dash), dash.split('\n').filter(l => /Conzz|Job Costs|\$/.test(l)).slice(0, 12));
/* B6: top search */
const srch = await A.ev(async () => { const i = [...document.querySelectorAll('input')].find(x => /search/i.test(x.placeholder || '')); if (!i) return 'no search box'; i.focus(); i.value = 'zz'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'z' })); await new Promise(r => setTimeout(r, 900)); return document.body.innerText; });
ok('B6: top search in Mitigation does not list Construction jobs or their contract amounts', !/Contract: \$77,777/.test(srch) && !/Conzz Client/.test(srch) && !/Conzz Alpha(?! demo)/.test(srch), srch.split('\n').filter(l => /Conzz|Contract/.test(l)).slice(0, 10));
/* B8: a no-job expense made here while Mitigation is picked */
await A.page().mouse.click(5, 300);
await A.ev(() => window._setExpenses(p => p.concat([{ id: 'E9', amt: 999.99, date: new Date().toISOString().slice(0, 10), vendor: 'Mitzz Dehu Rental', createdAt: new Date().toISOString() }])));
await sleep(3500);
const e9 = await A.ev(() => (window._crm.expenses.find(x => x.id === 'E9') || {}).companyId);
ok('B8: a no-job expense made while Mitigation is picked is filed under Mitigation', e9 === 'mitigation', e9);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('COLEAK ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
