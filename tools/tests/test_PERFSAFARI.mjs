// test_PERFSAFARI.mjs [build-dir] — patch PERFSAFARI in jsdom (no browser, nothing leaves). The LSGUARD and PERFREP scripts
// are taken from the built index.html and run with a fake clock (performance.now / Date.now), fake timers, fake
// requestAnimationFrame and a fake PerformanceObserver:
//   Safari (no 'longtask' in supportedEntryTypes): a blocked main thread after a tap is ONE stall in lt (src 'hb') with the
//   screen, the tap's label and the large localStorage writes before it; stats n1s / n3s / worst / totalMs; short gaps are
//   not stalls; gaps while hidden (visibilitychange / pagehide) and a slept phone (> 30 s) are ignored; the detector does not
//   run while hidden; labels carry no digits / e-mail / row text; the report stays bounded.
//   Chrome (longtask supported): no heartbeat, no frame check, no write log, the report is exactly as before.
// jsdom: `npm i jsdom` anywhere on the module path, or JSDOM_DIR=<path to node_modules/jsdom>.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BUILD = path.resolve(process.argv[2] || path.join(HERE, '../..'));
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 600) : '')); } };

let JSDOM, ResourceLoader;
for (const p of [process.env.JSDOM_DIR, 'jsdom', '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/jsdom'].filter(Boolean)) {
  try { ({ JSDOM, ResourceLoader } = require(p)); break; } catch (e) {}
}
if (!JSDOM) { console.error('jsdom not found (npm i jsdom, or JSDOM_DIR=…)'); process.exit(2); }

const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const grab = id => { const m = new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>').exec(html); return m && m[1]; };
const GUARD = grab('gc-patch-lsguard'), PERF = grab('gc-patch-perfrep');
ok(!!GUARD && GUARD.includes('patch PERFSAFARI') && !!PERF && PERF.includes('patch PERFSAFARI'), 'index.html carries PERFSAFARI in LSGUARD and PERFREP');

const SAFARI_TYPES = ['element', 'event', 'first-input', 'largest-contentful-paint', 'mark', 'measure', 'navigation', 'paint', 'resource'];
const CHROME_TYPES = SAFARI_TYPES.concat(['layout-shift', 'long-animation-frame', 'longtask', 'visibility-state']);
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

function page({ types, ua = IOS_UA, view = 'field' }) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="root">'
    + '<button type="button" data-a="fsave">Save</button>'
    + '<button type="button" id="call"><span>Call 555-123-4567 john@example.com</span></button>'
    + '<div class="gcf-card job"><span id="nm">John Smith — 12 Elm St</span></div>'
    + '<div role="tab"><b id="tabin">Today</b></div>'
    + '<input id="q" name="search" value="John Smith">'
    + '</div></body></html>', { url: 'https://crm.grayco-cs.com/', runScripts: 'outside-only', resources: new ResourceLoader({ userAgent: ua }) });
  const W = dom.window, D = W.document;
  /* the fake clock and timers */
  let T = 5000; const EPOCH = Date.UTC(2026, 10, 3, 15, 0, 0);
  let tid = 0; const timers = new Map(); let rafs = [], frameAt = 0;
  Object.defineProperty(W, 'performance', { value: { now: () => T }, configurable: true });
  W.Date.now = () => EPOCH + T;
  W.setInterval = (fn, ms) => { const id = ++tid; timers.set(id, { fn, ms: Math.max(1, ms | 0), due: T + Math.max(1, ms | 0), rep: true }); return id; };
  W.setTimeout = (fn, ms) => { const id = ++tid; timers.set(id, { fn, ms: Math.max(0, ms | 0), due: T + Math.max(0, ms | 0), rep: false }); return id; };
  W.clearInterval = W.clearTimeout = id => { timers.delete(id); };
  W.requestAnimationFrame = fn => { rafs.push(fn); return rafs.length; };
  let hidden = false;
  Object.defineProperty(D, 'hidden', { get: () => hidden, configurable: true });
  Object.defineProperty(D, 'visibilityState', { get: () => hidden ? 'hidden' : 'visible', configurable: true });
  /* the PerformanceObserver: Safari's list or Chrome's */
  const observers = [];
  W.PerformanceObserver = class { constructor(cb){ this.cb = cb; observers.push(this); } observe(o){ this.type = o.type; } disconnect(){} static get supportedEntryTypes(){ return types.slice(); } };
  W.localStorage.setItem('grayco_view', view);
  W.localStorage.setItem('gc_adm_device_id', 'Ptest');
  W.eval(GUARD); W.eval(PERF);
  const fire = (fn) => { try { fn(); } catch (e) { console.log('    callback threw', e && e.message); } };
  /* run the page normally for ms: timers when due, a frame every 16.7 ms while frames are asked for */
  function idle(ms) {
    const end = T + ms;
    for (;;) {
      let next = end, which = null;
      for (const [id, t] of timers) if (t.due < next) { next = t.due; which = id; }
      const fDue = rafs.length ? Math.max(T, frameAt + 16.7) : Infinity;
      if (fDue <= next && fDue <= end) { T = fDue; frameAt = T; runFrames(); continue; }
      if (which == null) { T = end; return; }
      T = next; const t = timers.get(which); if (t.rep) t.due = T + t.ms; else timers.delete(which); fire(t.fn);
    }
  }
  function runFrames(){ const q = rafs; rafs = []; q.forEach(fire); }
  /* the main thread is blocked for ms: nothing runs, then whatever is due runs once (as a browser does) */
  function block(ms) {
    T += ms;
    for (const [id, t] of [...timers]) if (t.due <= T) { if (t.rep) t.due = T + t.ms; else timers.delete(id); fire(t.fn); }
    frameAt = T; runFrames();
  }
  const ev = (el, type) => { const e = new W.Event(type, { bubbles: true, cancelable: true }); el.dispatchEvent(e); };
  const setHidden = (h, via = 'visibilitychange') => { hidden = h; if (via === 'visibilitychange') ev(D, 'visibilitychange'); else W.dispatchEvent(new W.Event(via)); };
  const hbTimers = () => [...timers.values()].filter(t => t.rep && t.ms === 100).length;
  return { dom, W, D, idle, block, ev, setHidden, hbTimers, observers, rep: () => W._gcPerfRep.report(), rafCount: () => rafs.length, now: () => T };
}
const hbLt = r => r.lt.filter(x => x.src === 'hb');

/* ══════════ 1. Safari / iPhone: a tap, then the main thread blocked 2 s ══════════ */
console.log('Safari (no longtask): a stall after a tap');
{
  const P = page({ types: SAFARI_TYPES });
  ok(P.hbTimers() === 1, 'the 100 ms heartbeat runs while the page is visible');
  ok(P.W.__gcLsGuard.bigW === 20000, 'LSGUARD notes large writes (>= 20,000 chars) for the detector');
  P.idle(3000);
  let r = P.rep();
  ok(hbLt(r).length === 0 && r.stats.n1s === 0, 'a normal page: no stall', r.lt);
  ok(P.rafCount() === 0, 'no frame loop without a tap (battery)');

  P.ev(P.D.querySelector('[data-a="fsave"]'), 'pointerdown');
  ok(P.rafCount() === 1, 'a tap starts the frame-gap check');
  P.idle(40);
  P.W.localStorage.setItem('gc_ests_v2', 'x'.repeat(60000));     /* a 60 K write just before the freeze */
  P.W.localStorage.setItem('gc_small', 'y'.repeat(100));          /* small: not noted */
  P.ev(P.D.querySelector('[data-a="fsave"]'), 'click');
  P.block(2000);
  P.idle(500);
  r = P.rep();
  const L = hbLt(r);
  ok(L.length === 1, 'ONE stall recorded (heartbeat and frame check agree on one)', L);
  const e = L[0] || {};
  ok(e.ms >= 1880 && e.ms <= 2000, 'its length ≈ 2 s (' + e.ms + ' ms)', e);
  ok(e.v === 'field', 'the screen (view) is in it', e);
  ok(e.act === 'click a:fsave' && typeof e.actMs === 'number' && e.actMs <= 0 && e.actMs > -2000, 'the last tap (data-a) is in it: ' + e.act + ' ' + e.actMs, e);
  ok(typeof e.t === 'number' && typeof e.at === 'number' && e.src === 'hb', 'with t / at / src: hb (' + e.via + ')', e);
  ok(Array.isArray(e.lsw) && e.lsw.length === 1 && e.lsw[0].k === 'gc_ests_v2' && e.lsw[0].n === 60000, 'the large localStorage write before it is in it', e.lsw);
  ok(r.stats.n1s === 1 && r.stats.n3s === 0 && r.stats.worst === e.ms && r.stats.totalMs === e.ms && r.stats.det === 'hb', 'stats: n1s 1, worst = the stall', r.stats);
  ok(r.hb && r.hb.det === 'hb' && r.hb.n === 1 && r.hb.why === 'no longtask', 'report.hb says which detector ran', r.hb);
  ok(r.hb.lsw && r.hb.lsw.length === 1 && r.hb.lsw[0].k === 'gc_ests_v2' && r.hb.lsw[0].n === 1, 'report.hb.lsw: large writes per name', r.hb.lsw);

  /* a 3.5 s freeze, no tap: n3s */
  P.idle(5000);
  P.block(3500); P.idle(300);
  r = P.rep(); const e2 = hbLt(r)[1] || {};
  ok(hbLt(r).length === 2 && e2.ms >= 3380 && !e2.act && !e2.lsw, 'a 3.5 s freeze with no tap: recorded, no action, no writes', e2);
  ok(r.stats.n1s === 2 && r.stats.n3s === 1 && r.stats.worst === e2.ms, 'stats: n3s 1, worst 3.5 s', r.stats);

  /* short ones */
  P.idle(1000); P.block(250); P.idle(300);
  ok(hbLt(P.rep()).length === 2, 'a 250 ms hitch is not a stall (< 300 ms over)');
  P.idle(1000); P.block(500); P.idle(300);
  r = P.rep(); const e3 = hbLt(r)[2] || {};
  ok(hbLt(r).length === 3 && e3.ms >= 400 && e3.ms < 1000 && r.stats.n1s === 2, 'a 500 ms stall is recorded (lt), not counted as ≥ 1 s', e3);

  /* hidden: the detector stops; the gap does not count */
  P.idle(1000);
  P.setHidden(true);
  ok(P.hbTimers() === 0, 'hidden page: the heartbeat is stopped');
  P.block(8000);          /* 8 s in the background (timers would fire late) */
  P.setHidden(false);
  ok(P.hbTimers() === 1, 'visible again: the heartbeat runs again');
  P.idle(2000);
  ok(hbLt(P.rep()).length === 3, 'the 8 s while hidden is not a stall');
  /* hidden without the event yet (tick sees document.hidden first) */
  P.idle(500);
  Object.defineProperty(P.D, 'hidden', { get: () => true, configurable: true });
  P.block(6000);
  Object.defineProperty(P.D, 'hidden', { get: () => false, configurable: true });
  P.ev(P.D, 'visibilitychange'); P.idle(1000);
  ok(hbLt(P.rep()).length === 3, 'a gap noticed while document.hidden is ignored too');
  /* pagehide / pageshow (back-forward cache, Home Screen app switch) */
  P.idle(500); P.W.dispatchEvent(new P.W.Event('pagehide'));
  ok(P.hbTimers() === 0, 'pagehide: stopped');
  P.block(5000); P.W.dispatchEvent(new P.W.Event('pageshow')); P.idle(1000);
  ok(hbLt(P.rep()).length === 3, 'the gap across pagehide → pageshow is ignored');
  /* iPhone: the app loses focus (app switcher / Control Center) */
  P.idle(500); P.W.dispatchEvent(new P.W.Event('blur'));
  ok(P.hbTimers() === 0, 'phone app loses focus: stopped');
  P.block(4000); P.W.dispatchEvent(new P.W.Event('focus')); P.idle(1000);
  ok(hbLt(P.rep()).length === 3, 'the gap while the app was not in front is ignored');
  /* the phone slept with the page "visible" */
  P.idle(500); P.block(45000); P.idle(1000);
  r = P.rep();
  ok(hbLt(r).length === 3 && r.hb.slept >= 1, 'a 45 s gap (phone slept) is ignored and counted as slept', r.hb);
  ok(r.stats.n1s === 2 && r.stats.n3s === 1, 'stats unchanged by the ignored gaps', r.stats);
}

/* ══════════ 2. labels: no personal data ══════════ */
console.log('Safari: the action label carries no personal data');
{
  const P = page({ types: SAFARI_TYPES });
  const lab = sel => { P.idle(3000); P.ev(P.D.querySelector(sel), 'pointerdown'); P.block(1200); P.idle(200); const L = hbLt(P.rep()); return (L[L.length - 1] || {}).act || ''; };
  const a1 = lab('#call span');
  ok(/^tap button:Call/.test(a1) && !/\d/.test(a1) && !/john|example/i.test(a1), 'button text: digits and e-mail masked: ' + JSON.stringify(a1));
  const a2 = lab('#nm');
  ok(a2 === 'tap div.gcf-card' || a2 === 'tap span#nm', 'a row: tag.class, never its text: ' + JSON.stringify(a2));
  ok(!/John|Elm/.test(a2), 'no name / address from the row');
  const a3 = lab('#q');
  ok(a3 === 'tap input:search' && !/John/.test(a3), 'an input: its name, never its value: ' + JSON.stringify(a3));
  const a4 = lab('#tabin');
  ok(a4 === 'tap div:Today', 'a tab: its label: ' + JSON.stringify(a4));
  P.idle(3000); P.ev(P.D.querySelector('#q'), 'keydown'); P.block(1200); P.idle(200);
  const L = hbLt(P.rep()); ok((L[L.length - 1] || {}).act === 'key', 'a key press: just "key", never which key');
  /* an action older than 2 s is not blamed */
  P.idle(500); P.ev(P.D.querySelector('[data-a="fsave"]'), 'click'); P.idle(2600); P.block(1500); P.idle(200);
  const L2 = hbLt(P.rep()); ok(!(L2[L2.length - 1] || {}).act, 'a tap 2.6 s before the stall is not in it', L2[L2.length - 1]);
}

/* ══════════ 3. bounded report ══════════ */
console.log('Safari: the report stays bounded');
{
  const P = page({ types: SAFARI_TYPES });
  for (let i = 0; i < 5; i++) { P.idle(1000); P.ev(P.D.querySelector('[data-a="fsave"]'), 'click'); P.W.localStorage.setItem('gc_bak_k' + i, 'z'.repeat(30000)); P.block(1500); }
  for (let i = 0; i < 100; i++) { P.idle(400); P.block(450); }
  for (let i = 0; i < 40; i++) P.W.localStorage.setItem('gc_big_' + i + '_' + 'n'.repeat(80), 'q'.repeat(21000));
  P.idle(1000);
  const r = P.rep(), L = hbLt(r), big = L.filter(x => x.ms >= 1000), small = L.filter(x => x.ms < 1000);
  ok(r.lt.length <= 40, 'report lt ≤ 40 (' + r.lt.length + ')');
  ok(big.length === 5 && small.length <= 20, 'the five ≥ 1 s stalls stay in the report; short ones ≤ 20 (' + big.length + ' / ' + small.length + ')');
  ok(r.stats.n1s === 5 && r.hb.n === 105, 'stats / hb count every stall (' + r.stats.n1s + ' / ' + r.hb.n + ')', r.hb);
  ok(r.hb.lsw.length <= 10 && r.hb.lsw.every(x => x.k.length <= 40), 'hb.lsw ≤ 10 names, names ≤ 40 chars');
  const G = P.W.__gcLsGuard; ok(G.writes.length <= 30 && Object.keys(G.bigK).length <= 20, 'LSGUARD write log ≤ 30, names ≤ 20');
  const size = JSON.stringify(r).length;
  ok(size < 40000, 'the whole report is small (' + size + ' chars)');
}

/* ══════════ 4. Chrome: unchanged ══════════ */
console.log('Chrome (longtask supported): unchanged');
{
  const P = page({ types: CHROME_TYPES, ua: CHROME_UA, view: 'jobs' });
  ok(P.hbTimers() === 0, 'no heartbeat');
  ok(P.W.__gcLsGuard.bigW === 0, 'LSGUARD write log stays off');
  P.idle(1000); P.ev(P.D.querySelector('[data-a="fsave"]'), 'click');
  ok(P.rafCount() === 0, 'no frame check on a tap');
  P.W.localStorage.setItem('gc_ests_v2', 'x'.repeat(60000));
  ok(P.W.__gcLsGuard.writes.length === 0, 'large writes not noted');
  P.block(2000); P.idle(1000);
  let r = P.rep();
  ok(r.lt.length === 0 && r.stats.n1s === 0, 'a block without the browser reporting it: nothing from the fallback');
  const lto = P.observers.find(o => o.type === 'longtask');
  ok(!!lto && !!P.observers.find(o => o.type === 'long-animation-frame'), 'the longtask and long-animation-frame observers are set up as before');
  lto.cb({ getEntries: () => [{ duration: 1500, startTime: 9000 }, { duration: 400, startTime: 9900 }] });
  r = P.rep();
  ok(r.lt.length === 1 && JSON.stringify(Object.keys(r.lt[0]).sort()) === JSON.stringify(['at', 'ms', 't', 'v']) && r.lt[0].ms === 1500 && r.lt[0].v === 'jobs', 'a long task is recorded exactly as before', r.lt);
  ok(JSON.stringify(Object.keys(r.stats).sort()) === JSON.stringify(['n1s', 'n3s', 'since', 'totalMs', 'worst']) && r.stats.n1s === 1, 'stats as before (no det)', r.stats);
  ok(!('hb' in r) && JSON.stringify(Object.keys(r)) === JSON.stringify(['dev', 'build', 'at', 'view', 'cores', 'memGB', 'ua', 'profiler', 'stats', 'lt', 'loaf', 'prof', 'err', 'net', 'ls']), 'the report has the same fields as before (no hb)', Object.keys(r));
}

/* ══════════ 5. the switches ══════════ */
console.log('switches');
{
  const html0 = '<!DOCTYPE html><html><head></head><body></body></html>';
  for (const [val, types, want] of [['off', SAFARI_TYPES, 0], ['on', CHROME_TYPES, 1]]) {
    const dom = new JSDOM(html0, { url: 'https://crm.grayco-cs.com/', runScripts: 'outside-only', pretendToBeVisual: true });   /* visible */
    const W = dom.window; let n = 0;
    W.setInterval = (fn, ms) => { if (ms === 100) n++; return 1; }; W.setTimeout = () => 1;
    W.PerformanceObserver = class { constructor(){} observe(){} static get supportedEntryTypes(){ return types; } };
    W.localStorage.setItem('gc_perfsafari', val);
    W.eval(GUARD); W.eval(PERF);
    ok(n === want, 'gc_perfsafari = ' + val + ': heartbeat ' + (want ? 'on' : 'off'));
  }
  /* no supportedEntryTypes at all (old Safari) → fallback */
  const dom = new JSDOM(html0, { url: 'https://crm.grayco-cs.com/', runScripts: 'outside-only', pretendToBeVisual: true });   /* visible */
  const W = dom.window; let n = 0;
  W.setInterval = (fn, ms) => { if (ms === 100) n++; return 1; }; W.setTimeout = () => 1;
  W.PerformanceObserver = class { constructor(){} observe(){} };
  W.eval(GUARD); W.eval(PERF);
  ok(n === 1 && W._gcPerfRep.report().hb.why === 'no entry-type list', 'no entry-type list (old Safari): the fallback runs');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
