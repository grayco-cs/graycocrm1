// test_COPILL.mjs <build-dir> — owner 11/11 (screenshot of the Projects list): "don't have this tab on my construction jobs" — the company
// pill shows only on a job from another company than the one you are looking at. Made-up jobs only.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
const at = new Date().toISOString();
cset('projects', [{ id: 'PC1', name: 'Test Kitchen Remodel', client: 'Test Client', status: 'active', createdAt: at, updatedAt: at },
  { id: 'PM1', name: 'Test Water Loss', client: 'Test Client 2', status: 'active', companyId: 'mitigation', sharedWith: ['construction'], createdAt: at, updatedAt: at }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
const pills = () => A.ev(() => { const B = window._gcInsBadge, R0 = []; const e = { jsx: (t, p) => ({ t, p }), jsxs: (t, p) => ({ t, p }) };
  const walk = (n, out) => { if (!n) return; if (Array.isArray(n)) return n.forEach(x => walk(x, out)); if (n.p) { if (n.p['data-co-job']) out.push(n.p.children); walk(n.p.children, out); } };
  return (window._crm.projects || []).map(p => { const out = []; walk(B(p, e), out); return p.id + ':' + out.join('|'); }); });
let r = await pills();
ok('Construction view: no pill on a Construction job; a Mitigation job shared in shows "Mitigation"', r.some(x => x === 'PC1:') && r.some(x => /^PM1:.*Mitigation/.test(x)), r);
await A.ev(() => { try { localStorage.setItem('gc_co_filter', 'mitigation'); } catch (e) {} if (window._gcCo.setFilter) window._gcCo.setFilter('mitigation'); }); await sleep(800);
r = await pills();
ok('Mitigation view: no pill on its own jobs; a Construction job shows "Construction"', r.some(x => x === 'PM1:') && r.some(x => /^PC1:.*Construction/.test(x)), r);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('COPILL ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
