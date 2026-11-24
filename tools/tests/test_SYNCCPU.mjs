// test_SYNCCPU.mjs <build-dir> — patch SYNCCPU: no one's phone or computer is kept busy by background work that changes nothing.
// Owner 11/24: "make sure no one's phone or computer is bogged down". Real data (the company snapshot GC_SNAP, rows.ndjson; the browser
// part is skipped — exit 0 with a note — when it is not there), offline harness (nothing leaves the machine).
//   B. the owner (admin) on an emulated iPhone (iPhone UA, 390x844, touch), CPU slowed RATE (4)x, GrayCo Field Home, after WARM ms:
//      1. idle: WIN windows of 20 s, a CPU profile each — main-thread busy % (all but the profile's "(idle)") and long tasks (ms per
//         20 s), mean over the windows (budgets BUSY_MAX 70 % and LT_MAX 6000 ms; origin/main before SYNCCPU: 98 % / 8.4 s);
//      2. taps on the Home's big tiles and the ⚡ Needs-you rows: pointerdown → the frame that shows what opened (median ≤ TAP_MS);
//      3. a person's save still reaches the cloud at once: 💬 a job message typed and sent on the phone is in the database
//         within SAVE_MS (and while the Home's re-checks are paced: the phone untouched for 10 s first).
//   C. the owner's desk computer (Chrome): idle busy % over WIN windows after WARM_D ms (budget DBUSY_MAX).
//   With BASE=<dir> the same is measured on that build first (printed, not judged) for a before / after.
// Usage: node test_SYNCCPU.mjs <dir with index.html>   (GC_HARNESS, GC_SNAP, ONLY=idle,taps,save,desk, BASE=<dir>)
import fs from 'fs'; import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const SNAP = process.env.GC_SNAP || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qa/snap/2026-11-19T05-08-16';
const build = process.argv[2];
if (!build) { console.error('usage: node test_SYNCCPU.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null; const want = k => !ONLY || ONLY.includes(k);
const E = (k, d) => +(process.env[k] || d);
/* budgets: regression guards at what SYNCCPU measured (origin/main before it: phone 98 % / 8.4 s / 499 ms, desk 77 %); the goal is
   printed with each number (phone 20 % busy, 1.5 s of long tasks per 20 s, 300 ms taps; desk 20 %) */
const RATE = E('RATE', 4), WARM = E('WARM', 240000), WARM_D = E('WARM_D', 90000), WIN = E('WIN', 4), BUSY_MAX = E('BUSY_MAX', 70), LT_MAX = E('LT_MAX', 6000),
  TAP_MS = E('TAP_MS', 600), SAVE_MS = E('SAVE_MS', 15000), DBUSY_MAX = E('DBUSY_MAX', 25);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

console.log('A. node');
const src = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(/if\(_sc\) ST\.call\(window, changed, 0\);/.test(src), 'TOMBLOOP: the delete-list hook asks for another upload only when it learnt new marks');
ok(/var pace = repeat && \+ms > 0 && \+ms <= 2000/.test(src) && /lastIn = Date\.now\(\)/.test(src), 'IDLEPACE: the screens\' fast re-checks are paced while nobody touches the screen, back at once on input');
ok(/_offers\.forEach\(function\(o\)\{ window\._gcAddToRegister\(o\); \}\);/.test(src), 'REGRECON: the accounting reconcile offers its rows only when they or the register changed');
ok(src.indexOf('<script id="gc-patch-synccpu-early">') >= 0 && src.indexOf('<script id="gc-patch-synccpu-early">') < src.indexOf('<script id="gc-patch-lsguard">'), 'KVVER: the write counter is the first script on the page');
ok(/NOADD\.v === pv/.test(src) && /lv === LVER/.test(src), 'KVSKIP: lists not written since the last look are not read / serialised again');
ok(/lsRawPrev\[ks\[i\]\] === s/.test(src), 'LSCMP: the live feed compares the office lists\' text, not a hash');
ok(/mm\.t === spT/.test(src), 'SPTEXT: the upload de-dup does not hash the same text again');
ok(/if \(seenDirty\) seenSave\(\);/.test(src), 'TD2SEEN: the "cleared on its own" memory is written at most every 30 s');
ok(/var saveSoon = false;/.test(src), 'DECSAVE: the decisions ledger is written once per burst');

if (!fs.existsSync(path.join(SNAP, 'rows.ndjson'))) { console.log('  (no real-data snapshot at ' + SNAP + ' — the browser part is skipped)'); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
const H = await import(pathToFileURL(HARNESS).href);
const L = await import(pathToFileURL(path.join(HERE, '..', 'qa', 'qa_lib.mjs')).href);
const snap = L.readSnap(SNAP); L.loadIntoHarness(H, snap); const acc = L.accountsFromSnap(H, snap);
const owner = String((acc.map.admin || {}).email || '').toLowerCase();
const LT = `(() => { const P = window.__sc = { lt: [] }; try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {} })()`;
const PHONE = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', ${JSON.stringify(L.IPHONE_UA)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); d(Navigator.prototype, 'userAgentData', undefined); })()`;
/* WIN windows of 20 s: busy % from a CPU profile, long tasks */
async function idle(c, cdp, label){
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  const B = [], T = [];
  for (let w = 0; w < WIN; w++) {
    const l0 = await c.ev(() => __sc.lt.length);
    await cdp.send('Profiler.start'); await H.sleep(20000); const { profile: p } = await cdp.send('Profiler.stop');
    const by = new Map(p.nodes.map(n => [n.id, n])); let idl = 0; for (const s of p.samples) if (by.get(s).callFrame.functionName === '(idle)') idl++;
    const lt = await c.ev(n => __sc.lt.slice(n).map(x => x[1]), l0);
    B.push(100 * (1 - idl / p.samples.length)); T.push(lt.reduce((a, b) => a + b, 0));
  }
  await cdp.send('Profiler.disable');
  const r = { busy: Math.round(mean(B)), lt: Math.round(mean(T)), each: B.map(Math.round), ltEach: T };
  console.log(`    ${label}: idle main thread busy ${r.busy}% (each 20 s: ${r.each.join(' / ')}), long tasks ${r.lt} ms per 20 s (${T.join(' / ')})`);
  return r;
}
const HOME = () => {
  [...document.querySelectorAll('body > *')].forEach(e => { if (/^(SCRIPT|STYLE|LINK|NOSCRIPT)$/.test(e.tagName) || e.id === 'root' || e.id === '_gcJobPick' || e.id === 'gc-fh-tabs') return; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return; const r = e.getBoundingClientRect(); if ((cs.position === 'fixed' || cs.position === 'absolute') && r.width >= innerWidth * 0.8 && r.height >= innerHeight * 0.5) e.remove(); });
  try { window._gcPhotos && window._gcPhotos.close && window._gcPhotos.close(); } catch (e) {}
  if (!document.documentElement.classList.contains('_fieldmode') && window._gcChooseView) window._gcChooseView('field');
  if (!document.querySelector('#_gcJobPick.gc-fh')) window._gcField.open();
  const e = document.getElementById('_gcJobPick'); if (e) e.scrollTop = 0;
};
async function taps(c){
  const T = await c.ev(() => [...document.querySelectorAll('#_gcJobPick .gc-pmf-q .gc-pmf-t')].filter(b => !/clock|photo|receipt/.test(b.getAttribute('data-pmf-a'))).map(b => ['tile ' + b.getAttribute('data-pmf-a'), '#_gcJobPick .gc-pmf-q .gc-pmf-t[data-pmf-a="' + b.getAttribute('data-pmf-a') + '"]'])
    .concat([...document.querySelectorAll('#_gcJobPick .gc-pmf-need .gc-pmf-nd')].map((b, i) => ['Needs you · ' + b.textContent.trim().replace(/\s+/g, ' ').slice(0, 24), '#_gcJobPick .gc-pmf-need .gc-pmf-nd >> nth=' + i])));
  const sig = () => document.body.children.length + ':' + !!document.querySelector('._gcSheetOv,.gcfp-sheet,.gc-fh-sheet,.gc-ra-sheet,#gcuOv,#_gcTD2Ov,#_gcJobDash') + ':' + !!document.querySelector('#_gcJobPick.gc-fh') + ':' + document.documentElement.classList.contains('_fieldmode');
  const all = [];
  for (const [label, sel] of T) {
    const ms = [];
    for (let k = 0; k < 2; k++) try {
      await c.ev(HOME); await H.sleep(1500);
      const loc = c.page().locator(sel).first(); if (!(await loc.count())) break;
      await loc.scrollIntoViewIfNeeded().catch(() => {}); await H.sleep(500);
      await c.ev(s => { __sc.tap = 0; __sc.sig = (new Function('return (' + s + ')()'))(); document.addEventListener('pointerdown', () => { __sc.tap = performance.now(); }, { capture: true, once: true }); }, sig.toString());
      try { await loc.tap({ timeout: 8000 }); } catch (e) { ms.push(99999); continue; }
      ms.push(await c.ev(async s => { const f = new Function('return (' + s + ')()'); const t = performance.now(); while (performance.now() - t < 8000 && f() === __sc.sig) await new Promise(r => requestAnimationFrame(r)); await new Promise(r => requestAnimationFrame(r)); return f() !== __sc.sig ? Math.round(performance.now() - (__sc.tap || t)) : 99999; }, sig.toString()));
    } catch (e) { ms.push(99999); }
    if (!ms.length) continue;
    all.push(med(ms)); console.log(`    tap ${label}: ${JSON.stringify(ms)} ms`);
  }
  const m = med(all); console.log(`    taps: median ${m} ms over ${all.length} buttons`);
  return { m, all };
}
/* a person's save: a job message typed and sent on the phone, in the database within SAVE_MS */
async function save(c){
  await c.ev(HOME); await H.sleep(10000);   /* untouched: the re-checks are paced now */
  const pid = await c.ev(() => { const p = ((window._crm || {}).projects || []).find(x => x && x.id && !x.deleted && /active|progress/i.test(String(x.status || ''))) || ((window._crm || {}).projects || [])[0]; return p && p.id; });
  if (!pid) return { ms: -1, why: 'no job' };
  await c.ev(pid => window._gcOpenJobMessages(pid), pid);
  if (!(await H.waitFor(c, () => !!document.getElementById('_jmText'), null, 20000))) return { ms: -1, why: 'no message box' };
  await H.sleep(800);
  const T = 'SYNCCPU ' + Date.now().toString(36);
  await c.page().fill('#_jmText', T);
  const t0 = Date.now();
  await c.page().locator('#_jmSend').tap();
  const has = () => { const v = H.cget('gc_job_messages'); const a = typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch (e) { return []; } })() : v; return Array.isArray(a) && a.some(m => m && m.text === T); };
  while (Date.now() - t0 < 60000 && !has()) await H.sleep(250);
  return { ms: has() ? Date.now() - t0 : 99999, pid };
}
async function phone(b, judge){
  const c = await H.computer('SYNCCPU', { build: b, mobile: true, init: [PHONE, LT] });
  const cdp = await c.ctx.newCDPSession(c.page()); await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  const tag = judge ? 'iPhone' : 'iPhone (BASE ' + b + ')';
  const si = await H.signIn(c, owner, 120000); if (judge) ok(si, 'the owner signs in on the iPhone');
  const up = !!(await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh .gc-pmf'), null, 240000)); if (judge) ok(up, 'GrayCo Field Home (the dashboard) is up');
  await H.sleep(WARM);
  const out = {};
  if (want('idle')) { out.idle = await idle(c, cdp, tag);
    if (judge) { ok(out.idle.busy <= BUSY_MAX, `${tag}: idle main thread busy ${out.idle.busy}% (≤ ${BUSY_MAX}%; goal 20%)`, out.idle); ok(out.idle.lt <= LT_MAX, `${tag}: long tasks ${out.idle.lt} ms per 20 s idle (≤ ${LT_MAX}; goal 1500)`, out.idle); } }
  if (want('taps')) { out.taps = await taps(c); if (judge) ok(out.taps.all.length >= 6 && out.taps.m <= TAP_MS, `${tag}: Home taps answer in ${out.taps.m} ms, median (≤ ${TAP_MS}; goal 300)`, out.taps.all); }
  if (want('save')) { out.save = await save(c); console.log(`    ${tag}: a job message sent on the phone reached the database in ${out.save.ms} ms`); if (judge) ok(out.save.ms >= 0 && out.save.ms <= SAVE_MS, `${tag}: a person's save (a job message) is in the database within ${SAVE_MS} ms (${out.save.ms} ms)`, out.save); }
  if (judge) ok(c.errs.length === 0, `${tag}: no page errors`, c.errs.slice(0, 5));
  await c.close().catch(() => {});
  return out;
}
async function desk(b, judge){
  const tag = judge ? 'desk' : 'desk (BASE ' + b + ')';
  const d = await H.computer('SYNCCPU-desk', { build: b, init: [LT] });
  const cdp = await d.ctx.newCDPSession(d.page());
  const si = await H.signIn(d, owner, 120000); if (judge) ok(si, 'the owner signs in on the desk computer');
  await H.sleep(WARM_D);
  const r = await idle(d, cdp, tag);
  if (judge) { ok(r.busy <= DBUSY_MAX, `${tag}: idle main thread busy ${r.busy}% (≤ ${DBUSY_MAX}%; goal 20%)`, r); ok(d.errs.length === 0, `${tag}: no page errors`, d.errs.slice(0, 5)); }
  await d.close().catch(() => {});
  return r;
}
const BASE = process.env.BASE;
console.log('B. the owner on an iPhone, real data (' + snap.rows.length + ' rows), CPU x' + RATE + ', ' + Math.round(WARM / 1000) + ' s after the Home is up');
if (BASE && (want('idle') || want('taps') || want('save'))) await phone(BASE, false);
if (want('idle') || want('taps') || want('save')) await phone(build, true);
if (want('desk')) {
  console.log('C. the owner on a desk computer, real data, ' + Math.round(WARM_D / 1000) + ' s after sign-in');
  if (BASE) await desk(BASE, false);
  await desk(build, true);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
