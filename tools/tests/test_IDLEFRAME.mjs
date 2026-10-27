// test_IDLEFRAME.mjs <build-dir> — patch IDLEFRAME: no endless 60-per-second animation-frame loops while the CRM sits
// idle; the checks they drove still run (Products / choices chips tick, AUTO5 strips). Offline harness, made-up data.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, resetCloud, cset, signIn } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_IDLEFRAME.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
resetCloud();
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'P1', name: 'Demo Job', client: 'Sample Homeowner', status: 'Active', pm: 'Demo Owner', address: '1 Demo St' }]);
const c = await computer('IF', { build });
await c.ctx.addInitScript(() => { const W = window, raf = W.requestAnimationFrame; W.__rafN = 0; W.requestAnimationFrame = function(){ W.__rafN++; return raf.apply(this, arguments); }; });
try {
  await signIn(c, 'wjohnson@grayco-cs.com', 15000);
  const p = c.page(); await sleep(5000);
  const r = await p.evaluate(() => new Promise(res => { const n0 = window.__rafN, t0 = window._gcCH && window._gcCH.status().ticks; setTimeout(() => res({ raf: window.__rafN - n0, ticks: window._gcCH ? window._gcCH.status().ticks - t0 : null, auto5: !!window._gcAuto5 }), 6000); }));
  ok(r.raf < 40, 'idle 6 s: animation frames asked for ' + r.raf + ' times (was ~720: two loops at 60 a second)', r);
  ok(r.ticks >= 5, 'the Products / choices check still runs (' + r.ticks + ' ticks in 6 s)', r);
  ok(r.auto5, 'AUTO5 (closeout / archive strips) is loaded');
  await p.evaluate(() => window._setView('admin')); await sleep(3000);
  const st = await p.evaluate(() => ({ err: window._gcCH.status().tickErr, a5: window._gcAuto5.status().errors || '' }));
  ok(!st.err && !st.a5, 'no errors in the checks', st);
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
