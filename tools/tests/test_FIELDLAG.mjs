// test_FIELDLAG.mjs <build-dir> — patch FIELDLAG2: the owner's GrayCo Field Home on his iPhone stops lagging.
// Owner 11/24 (admin, iPhone, Field Home): "Definitely very laggy here". The phones' own reports (gc_perfrep_*, hb.lsw): gc_tombstones
// written 54 times in one idle minute (9.2M characters), ~18M characters of localStorage writes a minute in all.
// Real data: the company snapshot (GC_SNAP, rows.ndjson; the test skips — exit 0 with a note — when it is not there), the owner
// signed in on an emulated iPhone (iPhone UA, 390x844, touch), CPU slowed 4x, GrayCo Field Home, offline harness (nothing leaves
// the machine). Measured on origin/main and on the branch with the same setup:
//   1. localStorage writes in the first LS_MS (150 s) after the Home is up: gc_tombstones writes (main: one full rewrite of the
//      170K delete list per record the cloud sync names — 80+), gc_td2_seen writes (main: on every To-Do rebuild the Home's
//      ☑ badge asks for), all characters written per minute;
//   2. a scripted scroll of the Home top → bottom → top (touch gestures): frames over 50 ms, long tasks, and how many times the
//      Home's top was replaced while the finger was on it (main: the 0.9 s re-check rebuilt it under the finger);
//   3. taps on the big tiles and the ⚡ Needs you rows: pointerdown → the frame that shows what opened (median, printed) and that
//      each one opens something; no page errors.
//   4. the owner's desk computer (the Desk, Chrome): localStorage writes a minute, the total stored, over DESK_MS (120 s).
//   On every device: no big list (≥ 30K characters) is written to localStorage more than once per 8 s (main: gc_tombstones once
//   per record named by the cloud sync, gc_office_tasks / gc_td2_seen on every rebuild), at most CH_MAX characters a minute.
// Budgets (env): TOMB_MAX 10 writes of gc_tombstones in LS_MS · SEEN_MAX 4 writes of gc_td2_seen · UNDER_MAX 0 top replacements
// under a finger / scroll · TAP_MS 1500 (median, a regression guard at CPU x4; printed against the ~150 ms goal).
// Usage: node test_FIELDLAG.mjs <dir with index.html>   (GC_HARNESS = harness_N.mjs, GC_SNAP = a snapshot dir, ONLY=ls,scroll,taps,desk)
import fs from 'fs'; import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const SNAP = process.env.GC_SNAP || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qa/snap/2026-11-19T05-08-16';
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDLAG.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null; const want = k => !ONLY || ONLY.includes(k);
const LS_MS = +(process.env.LS_MS || 150000), DESK_MS = +(process.env.DESK_MS || 120000), CH_MAX = +(process.env.CH_MAX || 3000000), TOMB_MAX = +(process.env.TOMB_MAX || 10), SEEN_MAX = +(process.env.SEEN_MAX || 4), UNDER_MAX = +(process.env.UNDER_MAX || 0), TAP_MS = +(process.env.TAP_MS || 1500), RATE = +(process.env.RATE || 4);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

console.log('A. node');
const src = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(/_purgeQ = \[\]/.test(src) && /async function _gcPurgeBatch\(batch\)/.test(src), 'delete-for-good: the records named together are purged in one batch (one delete-list write)');
ok(/if \(seenDirty\) lsSet\('gc_td2_seen'/.test(src), 'To-Do "cleared on its own" memory: written when it changed');
ok(/W\._gcRaFieldTop\.takes = function/.test(src) && /var ids = _flTake \? \[\] : actions\(a, 'home'\)/.test(src), 'Home: the tile row the dashboard drops is not built every 0.9 s');
ok(/if \(!flBusy\(\)\) fieldInject\(\); else flLater\(\);/.test(src), 'Home: not rebuilt under a finger or a moving scroll');

if (!fs.existsSync(path.join(SNAP, 'rows.ndjson'))) { console.log('  (no real-data snapshot at ' + SNAP + ' — the browser part is skipped)'); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
const H = await import(pathToFileURL(HARNESS).href);
const L = await import(pathToFileURL(path.join(HERE, '..', 'qa', 'qa_lib.mjs')).href);
const snap = L.readSnap(SNAP); L.loadIntoHarness(H, snap); const acc = L.accountsFromSnap(H, snap);
const owner = String((acc.map.admin || {}).email || '').toLowerCase();
console.log('B. the owner on an iPhone, real data (' + snap.rows.length + ' rows), CPU x' + RATE);
const INIT = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', ${JSON.stringify(L.IPHONE_UA)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); d(Navigator.prototype, 'userAgentData', undefined);
  const P = window.__fl = { lt: [], lsw: [], top: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  /* every localStorage write that reaches the browser (below the page's own skip-if-unchanged layer) */
  const si = Storage.prototype.setItem;
  Storage.prototype.setItem = function(k, v){ if (this === window.localStorage) P.lsw.push([Math.round(performance.now()), String(k), String(v).length]); return si.apply(this, arguments); };
  /* the Home's top replaced: when, and whether a finger was down / a scroll moving at that moment */
  let fing = 0, scr = 0; addEventListener('pointerdown', () => { fing = performance.now(); }, true); addEventListener('pointerup', () => { fing = performance.now(); }, true);
  addEventListener('scroll', () => { scr = performance.now(); }, { capture: true, passive: true }); addEventListener('touchmove', () => { scr = performance.now(); }, { capture: true, passive: true });
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get: desc.get, set: function(v){ try { if (this.classList && this.classList.contains('gc-ra-top') && this.closest && this.closest('#_gcJobPick')) { const n = performance.now(); P.top.push([Math.round(n), n - fing < 800 || n - scr < 500 ? 1 : 0]); } } catch (e) {} return desc.set.call(this, v); } });
})()`;
/* localStorage writes that reached the browser since t0: per key, per minute; the total size now */
async function lsReport(A, from, ms, label){
  const W = await A.ev(t => __fl.lsw.filter(x => x[0] >= t), from);
  const by = {}; W.forEach(x => { const q = by[x[1]] || (by[x[1]] = { n: 0, ch: 0, big: 0 }); q.n++; q.ch += x[2]; if (x[2] >= 30000) q.big++; });
  const tot = W.reduce((a, x) => a + x[2], 0), min = ms / 60000;
  const size = await A.ev(() => { let ch = 0, n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = Storage.prototype.getItem.call(localStorage, k); ch += k.length + (v ? v.length : 0); n++; } return { ch, n }; });
  const top = Object.entries(by).sort((a, b) => b[1].ch - a[1].ch).slice(0, 8).map(([k, q]) => k + ' ×' + q.n + ' ' + Math.round(q.ch / 1000) + 'K');
  console.log(`    localStorage (${label}), ${Math.round(ms / 1000)} s: ${W.length} writes, ${Math.round(tot / 1000)}K chars → ${Math.round(W.length / min)} writes · ${Math.round(tot / min / 1000)}K chars a minute; stored now ${Math.round(size.ch / 1000)}K chars in ${size.n} keys`);
  console.log('      ' + top.join(' · '));
  by.__tot = tot; by.__min = min; by.__size = size.ch;
  return by;
}
/* no big value (≥ 30K) written more often than once per 8 s (+2 for the first write and the page's start) */
function bigRate(by, ms, label){
  const cap = Math.ceil(ms / 8000) + 2;
  const hot = Object.entries(by).filter(([k, q]) => k.indexOf('__') !== 0 && q.big > cap).map(([k, q]) => k + ' ×' + q.big);
  ok(!hot.length, `${label}: no big list (≥ 30K chars) rewritten more than once per 8 s (≤ ${cap} in ${Math.round(ms / 1000)} s)`, hot);
  ok(by.__tot / by.__min <= CH_MAX, `${label}: localStorage writes ${Math.round(by.__tot / by.__min / 1000)}K chars a minute (≤ ${Math.round(CH_MAX / 1000)}K)`);
}
const c = await H.computer('FIELDLAG', { build, mobile: true, init: [INIT] });
const cdp = await c.ctx.newCDPSession(c.page()); await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
ok(await H.signIn(c, owner, 120000), 'the owner signs in on the iPhone');
ok(!!(await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh .gc-pmf'), null, 240000)), 'GrayCo Field Home (the dashboard) is up');
const t0 = await c.ev(() => performance.now());

if (want('ls')) {
  await H.sleep(LS_MS);
  const by = await lsReport(c, t0, LS_MS, 'iPhone, Field Home');
  const tb = (by.gc_tombstones || { n: 0 }).n, sn = (by.gc_td2_seen || { n: 0 }).n;
  ok(tb <= TOMB_MAX, `gc_tombstones written ${tb} times in ${Math.round(LS_MS / 1000)} s (≤ ${TOMB_MAX})`, by.gc_tombstones);
  ok(sn <= SEEN_MAX, `gc_td2_seen written ${sn} times in ${Math.round(LS_MS / 1000)} s (≤ ${SEEN_MAX})`, by.gc_td2_seen);
  bigRate(by, LS_MS, 'iPhone');
}
const HOME = () => {
  [...document.querySelectorAll('body > *')].forEach(e => { if (/^(SCRIPT|STYLE|LINK|NOSCRIPT)$/.test(e.tagName) || e.id === 'root' || e.id === '_gcJobPick' || e.id === 'gc-fh-tabs') return; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return; const r = e.getBoundingClientRect(); if ((cs.position === 'fixed' || cs.position === 'absolute') && r.width >= innerWidth * 0.8 && r.height >= innerHeight * 0.5) e.remove(); });
  try { window._gcPhotos && window._gcPhotos.close && window._gcPhotos.close(); } catch (e) {}
  if (!document.documentElement.classList.contains('_fieldmode') && window._gcChooseView) window._gcChooseView('field');
  if (!document.querySelector('#_gcJobPick.gc-fh')) window._gcField.open();
  const e = document.getElementById('_gcJobPick'); if (e) e.scrollTop = 0;
};
if (want('scroll')) {
  await c.ev(HOME); await H.sleep(1500);
  const m = await c.ev(() => ({ lt: __fl.lt.length, top: __fl.top.length }));
  await c.ev(() => { const P = __fl; P.fr = []; P.frOn = true; let last = performance.now(); const f = () => { const n = performance.now(); P.fr.push(n - last); last = n; if (P.frOn) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const sh = await c.ev(() => document.getElementById('_gcJobPick').scrollHeight);
  /* three passes top → bottom → top, a finger flick at a time */
  for (let pass2 = 0; pass2 < 3; pass2++) for (const dir of [-1, 1]) { let left = Math.min(sh, 9000); while (left > 0) { const d = Math.min(500, left); await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 450, yDistance: dir * d, speed: 1000, gestureSourceType: 'touch', preventFling: true }); left -= d; } }
  const r = await c.ev(m => { __fl.frOn = false; const fr = __fl.fr; const lt = __fl.lt.slice(m.lt).map(x => x[1]); const top = __fl.top.slice(m.top); return { frames: fr.length, over50: fr.filter(x => x > 50).length, worst: Math.round(Math.max(...fr)), lt: lt.length, ltMs: lt.reduce((a, b) => a + b, 0), top: top.length, under: top.filter(x => x[1]).length }; }, m);
  console.log(`    scroll (3 × top → bottom → top): ${r.frames} frames, ${r.over50} over 50 ms (worst ${r.worst} ms), long tasks ${r.lt} (${r.ltMs} ms), Home top replaced ${r.top} times, ${r.under} of them under the finger / a moving scroll`);
  ok(r.under <= UNDER_MAX, `scroll: the Home's top is never replaced while the finger / the scroll is moving (${r.under})`, r);
}
if (want('taps')) {
  const T = await c.ev(() => [...document.querySelectorAll('#_gcJobPick .gc-pmf-q .gc-pmf-t')].filter(b => !/clock|photo|receipt/.test(b.getAttribute('data-pmf-a'))).map(b => ['tile ' + b.getAttribute('data-pmf-a'), '#_gcJobPick .gc-pmf-q .gc-pmf-t[data-pmf-a="' + b.getAttribute('data-pmf-a') + '"]'])
    .concat([...document.querySelectorAll('#_gcJobPick .gc-pmf-need .gc-pmf-nd')].map((b, i) => ['Needs you · ' + b.textContent.trim().replace(/\s+/g, ' ').slice(0, 24), '#_gcJobPick .gc-pmf-need .gc-pmf-nd >> nth=' + i])));
  const sig = () => document.body.children.length + ':' + !!document.querySelector('._gcSheetOv,.gcfp-sheet,.gc-fh-sheet,.gc-ra-sheet,#gcuOv,#_gcTD2Ov,#_gcJobDash') + ':' + !!document.querySelector('#_gcJobPick.gc-fh') + ':' + document.documentElement.classList.contains('_fieldmode');
  const all = [], under0 = await c.ev(() => __fl.top.filter(x => x[1]).length), e0 = c.errs.length;
  let crashed = '';
  c.page().on('crash', () => { crashed = 'the page crashed'; });
  for (const [label, sel] of T) {
    const ms = [];
    if (crashed) break;
    for (let k = 0; k < 2 && !crashed; k++) try {
      await c.ev(HOME); await H.sleep(1500);
      const loc = c.page().locator(sel).first(); if (!(await loc.count())) break;
      await loc.scrollIntoViewIfNeeded().catch(() => {}); await H.sleep(500);
      await c.ev(s => { __fl.tap = 0; __fl.sig = (new Function('return (' + s + ')()'))(); document.addEventListener('pointerdown', () => { __fl.tap = performance.now(); }, { capture: true, once: true }); }, sig.toString());
      try { await loc.tap({ timeout: 8000 }); } catch (e) { ms.push(99999); continue; }
      const r = await c.ev(async s => { const f = new Function('return (' + s + ')()'); const t = performance.now(); while (performance.now() - t < 8000 && f() === __fl.sig) await new Promise(r => requestAnimationFrame(r)); await new Promise(r => requestAnimationFrame(r)); return f() !== __fl.sig ? Math.round(performance.now() - (__fl.tap || t)) : 99999; }, sig.toString());
      ms.push(r);
    } catch (e) { if (/closed|crash/i.test(String(e))) crashed = crashed || String(e).slice(0, 120); ms.push(99999); }
    if (!ms.length) continue;
    all.push(med(ms));
    console.log(`    tap ${label}: ${JSON.stringify(ms)} ms (goal ~150)`);
    ok(ms.every(x => x < 99999), `tap ${label}: opens something every time`, ms);
  }
  ok(!crashed, 'taps: the page stays up', crashed);
  if (crashed) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
  const m = med(all); console.log(`    taps: median ${m} ms over ${all.length} buttons`);
  ok(all.length >= 8 && m <= TAP_MS, `taps on the Home's tiles and Needs-you rows answer in ${m} ms, median (≤ ${TAP_MS})`, all);
  const under = (await c.ev(() => __fl.top.filter(x => x[1]).length)) - under0;
  ok(under <= UNDER_MAX, `taps: the Home's top is never replaced under the finger (${under})`);
  ok(c.errs.length === e0, 'taps: no page errors', c.errs.slice(e0, e0 + 5));
}
await c.close().catch(() => {});

/* C. the owner's desk computer (Chrome / Edge on Windows, the Desk), the same data */
if (want('desk')) {
  console.log('C. the owner on a desk computer, real data');
  const DINIT = INIT.replace(/d\(Navigator\.prototype, 'userAgent'[^\n]*\n/, '');
  const d = await H.computer('FIELDLAG-desk', { build, init: [DINIT] });
  ok(await H.signIn(d, owner, 120000), 'the owner signs in on the desk computer');
  await H.sleep(20000);
  const d0 = await d.ev(() => performance.now());
  await H.sleep(DESK_MS);
  const by = await lsReport(d, d0, DESK_MS, 'desk');
  bigRate(by, DESK_MS, 'desk');
  ok(by.__size <= +(process.env.SIZE_MAX || 4000000), `desk: localStorage holds ${Math.round(by.__size / 1000)}K chars (≤ ${Math.round(+(process.env.SIZE_MAX || 4000000) / 1000)}K)`);
  ok(d.errs.length === 0, 'desk: no page errors', d.errs.slice(0, 5));
  await d.close().catch(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
