// test_QAC_pmappr.mjs <build-dir> — patch QAC: a Project Manager's ✅ Approvals page is never blank — on Construction, after visiting
// Mitigation / Environmental (their "starts fresh" page) and All companies. Offline harness, made-up data. BUILD=<dir> overrides argv.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const BUILD = process.env.BUILD || process.argv[2], TAG = process.env.TAG || 'qac';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qac_shots';
resetCloud();
const now = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
cset('projects', [{ id: 'C1', name: 'Zedd Smith deck', client: 'Zedd Smith', status: 'Active', contract: 12000, pm: 'Sample PM', updatedAt: now },
  { id: 'M1', name: 'Zedd Ross basement', client: 'Zedd Ross', status: 'Active', type: 'Water Damage', companyId: 'mitigation', contract: 6000, pm: 'Sample PM', updatedAt: now }]);
const A = await computer('sbiffle@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'sbiffle@grayco-cs.com', 15000); await sleep(6000);
await A.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); if (b) b.click(); }); await sleep(800);
const st = () => A.ev(() => { const m = document.querySelector('#root main'); return { view: localStorage.getItem('grayco_view'), co: window._gcCo.filter(), chars: (m && m.innerText || '').trim().length,
  freshAttr: document.documentElement.hasAttribute('data-gc-co-fresh'), apx: !!document.getElementById('gc-apx-mount'), apxKids: (document.getElementById('gc-apx-mount') || { children: [] }).children.length,
  head: (m && m.innerText || '').replace(/\s+/g, ' ').slice(0, 60) }; });
const co = async c => { await A.ev(c => window._gcCo.setFilter(c), c); await sleep(1500); };
const go = async v => { await A.ev(v => window._setView(v), v); };
async function check(label){
  await go('approvals'); const t = [];
  for (const ms of [1000, 2000, 4000, 8000]) { await sleep(ms - (t.length ? [1000, 2000, 4000, 8000][t.length - 1] : 0)); t.push(await st()); }
  const last = t[t.length - 1];
  if (last.chars < 30) await A.page().screenshot({ path: SHOTS + '/pmappr_' + TAG + '_' + label + '.png' });
  ok(label + ': the Approvals page has content within 8 s', last.chars >= 30, t.map(x => x.chars + (x.freshAttr ? 'F' : '') + '/' + x.apxKids));
  return last;
}
await co('construction'); await check('construction first');
await go('dashboard'); await co('mitigation'); await check('mitigation (fresh page)');
await go('dashboard'); await co('environmental'); await check('environmental (fresh page)');
await go('dashboard'); await co('all'); await check('all companies');
await go('dashboard'); await co('construction'); await check('construction after the others');
for (const [from, to] of [['mitigation', 'construction'], ['construction', 'all'], ['all', 'environmental'], ['environmental', 'all']]) {   /* switch the company while ON Approvals */
  await co(from); await go('approvals'); await sleep(2500); await A.ev(c => window._gcCo.setFilter(c), to);
  const tl = []; for (const ms of [1000, 2000, 5000]) { await sleep(ms); tl.push(await st()); }
  const s2 = tl[tl.length - 1]; if (s2.chars < 30) await A.page().screenshot({ path: SHOTS + '/pmappr_' + TAG + '_switch_' + from + '_' + to + '.png' });
  ok('switching ' + from + ' → ' + to + ' while on Approvals redraws it (within 3 s)', tl[1].chars >= 30, tl.map(x => x.chars + (x.freshAttr ? 'F' : '') + '/' + x.apxKids));
}
ok('no page errors', !errs.length, errs.slice(0, 5));
console.log((R.every(Boolean) ? 'ALL PASS ' : 'FAILED ') + R.filter(Boolean).length + '/' + R.length);
await A.b.close(); process.exit(R.every(Boolean) ? 0 : 1);
