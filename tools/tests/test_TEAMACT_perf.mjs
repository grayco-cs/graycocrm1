// test_TEAMACT_perf.mjs <build-dir> — does the TEAMACTIVITY heartbeat add tap lag on a phone? (offline harness, made-up data)
// An iPhone-sized GrayCo Field page, CPU slowed 4× (Chrome DevTools throttling), the same PM; three rounds each with the heartbeat
// ON and OFF (localStorage gc_teamact_off = '1', same page otherwise):
//   a) 3000 pointerdown + 3000 keydown + 3000 scroll events dispatched → the time per event (every capture listener of the page);
//   b) 20 real taps on the Field home → the browser's own Event Timing (input delay + handler time of pointerdown / click);
//   c) the 5-minute write itself (read + merge + write) → the longest main-thread task while it runs.
// Pass: the ON−OFF difference per event < 0.02 ms (4× CPU), real-tap timings within noise (median ON ≤ median OFF + 4 ms),
// the write's longest task < 50 ms.
import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, signIn, sleep, cset, resetCloud, ACCOUNTS, waitFor } = H;
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const PM = Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].id === 'u-pm');
const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].id === 'u-wesley'), role: 'Admin', payType: 'owner', active: true }, { id: 'u4', name: 'Demo PM', email: PM, role: 'Project Manager', active: true }]);
cset('projects', [{ id: 'P1', po: 'PO-1001', name: 'Demo Roof Job', client: 'Demo Client A', address: '1 Demo St', type: 'Roofing', pm: 'Demo PM', status: 'Active', contract: 18000, contractSigned: true }]);
const IPHONE = () => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} }; d(Navigator.prototype, 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'); d(Navigator.prototype, 'maxTouchPoints', 5); };
const c = await computer('PM-phone', { build, mobile: true, init: [IPHONE] });
try {
  await signIn(c, PM, 15000);
  ok(!!(await waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh .fh-top'), null, 45000)), 'the phone opens GrayCo Field');
  const cdp = await c.ctx.newCDPSession(c.page());
  const R = { on: { ev: [], tap: [] }, off: { ev: [], tap: [] } };
  for (let round = 0; round < 3; round++) {
    for (const mode of ['on', 'off']) {
      await c.ev(m => { if (m === 'off') localStorage.setItem('gc_teamact_off', '1'); else localStorage.removeItem('gc_teamact_off'); }, mode);
      await c.page().reload({ waitUntil: 'domcontentloaded' });
      await waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh .fh-top') && !!window._gcTeamAct, null, 45000);
      await sleep(6000);   /* the page settles */
      const on = await c.ev(() => window._gcTeamAct.state().on);
      if (round === 0) ok(on === (mode === 'on'), `heartbeat ${mode.toUpperCase()} on this load`, on);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const per = await c.ev(() => {
        const t0 = performance.now(), b = document.body, n = 3000;
        for (let i = 0; i < n; i++) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' })); document.dispatchEvent(new Event('scroll')); }
        return (performance.now() - t0) / (3 * n);
      });
      R[mode].ev.push(per);
      const bb = await c.page().locator('#_gcJobPick.gc-fh .fh-h').first().boundingBox();
      const lat = [];
      for (let i = 0; i < 20; i++) {
        const p = c.ev(() => new Promise(r => { const s = performance.now(); document.addEventListener('click', () => requestAnimationFrame(() => r(performance.now() - s)), { once: true, capture: true }); setTimeout(() => r(-1), 3000); }));
        await c.page().touchscreen.tap(bb.x + 20, bb.y + bb.height / 2);
        lat.push(await p); await sleep(120);
      }
      R[mode].tap.push(med(lat.filter(x => x >= 0)));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  }
  const evOn = med(R.on.ev), evOff = med(R.off.ev), tapOn = med(R.on.tap), tapOff = med(R.off.tap);
  console.log(`    per event (pointerdown / keydown / scroll, all the page's listeners, CPU 4×): ON ${evOn.toFixed(4)} ms · OFF ${evOff.toFixed(4)} ms · difference ${(evOn - evOff).toFixed(4)} ms`);
  console.log(`    real tap → next frame (median of 20, 3 rounds, CPU 4×): ON ${tapOn.toFixed(1)} ms · OFF ${tapOff.toFixed(1)} ms`);
  ok(evOn - evOff < 0.02, 'the heartbeat adds < 0.02 ms per tap / key / scroll event at CPU 4× (' + (evOn - evOff).toFixed(4) + ' ms)', R);
  ok(tapOn <= tapOff + 4, 'real taps: no measurable lag (median ' + tapOn.toFixed(1) + ' vs ' + tapOff.toFixed(1) + ' ms)', R);
  /* c) the write itself, CPU 4× */
  await c.ev(() => localStorage.removeItem('gc_teamact_off'));
  await c.page().reload({ waitUntil: 'domcontentloaded' });
  await waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh .fh-top') && window._gcTeamAct && window._gcTeamAct.state().on, null, 45000);
  await sleep(4000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (let i = 0; i < 40; i++) { await c.ev(ms => window._gcTeamAct.skew(ms), i * 61e3); await c.page().keyboard.press('Shift'); }
  const fl = await c.ev(async () => { const lt = []; const o = new PerformanceObserver(l => l.getEntries().forEach(e => lt.push(e.duration))); try { o.observe({ type: 'longtask' }); } catch (e) {} const t0 = performance.now(); const r = await window._gcTeamAct.flush(); const t = performance.now() - t0; await new Promise(r2 => setTimeout(r2, 300)); o.disconnect(); return { ok: r, ms: t, longest: lt.length ? Math.max(...lt) : 0 }; });
  await c.ev(() => window._gcTeamAct.skew(0));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`    the 5-minute write (CPU 4×): ${fl.ms.toFixed(0)} ms end to end (network included), longest main-thread task ${fl.longest.toFixed(0)} ms`);
  ok(fl.ok && fl.longest < 50, 'the write never blocks the page (no task ≥ 50 ms)', fl);
} catch (e) { fail++; console.log('  ✗ FAIL (threw) ' + (e && e.stack || e)); }
finally { try { await c.close(); } catch (e) {} }
console.log(`\nTEAMACT perf: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
