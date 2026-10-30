// test_BOOTSAFE.mjs [index.html | build-dir] — patch BOOTSAFE on its own (no browser): the open is remembered until something
// is drawn, two blank opens in a row (or a reload loop) give safe mode (the r16 speed layers off), errors before the first
// draw are kept, a panel shows when nothing is drawn 25 s after the page is read; plus: first in <head>, idempotent.
//   node tools/tests/test_BOOTSAFE.mjs index.html
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import os from 'os'; import { execFileSync } from 'child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
let html = process.argv[2] || path.join(here, '..', '..', 'index.html');
if (fs.existsSync(html) && fs.statSync(html).isDirectory()) html = path.join(html, 'index.html');
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i !== undefined ? ' ' + JSON.stringify(i) : '')); } };
const src = fs.readFileSync(html, 'utf8');
const code = fs.readFileSync(path.join(here, '..', 'bootsafe_early.js'), 'utf8');
ok((src.match(/<script id="gc-patch-bootsafe">/g) || []).length === 1, 'in the page once');
ok(src.indexOf('<script id="gc-patch-bootsafe">') < src.indexOf('<script id="gc-patch-stuckfix">') && src.indexOf('<script id="gc-patch-bootsafe">') < src.indexOf('<script'+' id="gc-patch-storecut">'), 'first script of the page (before STUCKFIX and STORECUT)');
ok(src.includes(code.trim().split('\n').slice(10, 30).join('\n')), 'page carries tools/bootsafe_early.js');
{ const tmp = path.join(os.tmpdir(), 'bootsafe_idem_' + process.pid + '.html'); fs.writeFileSync(tmp, src);
  const out = execFileSync('python3', [path.join(here, '..', 'patch_BOOTSAFE.py'), tmp]).toString(); ok(/already patched/.test(out) && fs.readFileSync(tmp, 'utf8') === src, 'patch is idempotent'); fs.unlinkSync(tmp); }

class Storage { constructor(){ this.m = {}; } getItem(k){ return k in this.m ? this.m[k] : null; } setItem(k, v){ if (this.full) throw new Error('QuotaExceededError'); this.m[k] = String(v); } removeItem(k){ delete this.m[k]; } }
function world(ls, ss, now){
  const timers = []; const ev = {}; let clock = now;
  const root = { firstElementChild: null, textContent: '' }; const gate = { rects: 0, getClientRects(){ return { length: this.rects }; } };
  const body = { kids: [], appendChild(x){ this.kids.push(x); x.remove = () => { this.kids = this.kids.filter(y => y !== x); }; } };
  const D = { readyState: 'interactive', visibilityState: 'visible', body, documentElement: body,
    getElementById(id){ return id === 'root' ? root : id === 'gc-auth-email' ? (gate.on ? gate : null) : null; },
    createElement(){ return { style: {}, setAttribute(){}, addEventListener(){}, innerHTML: '' }; } };
  const W = { document: D, localStorage: ls, sessionStorage: ss, Storage, navigator: { userAgent: 'test' }, location: { reload(){ W.reloaded = (W.reloaded || 0) + 1; } }, console: { log(){}, warn(){} },
    setTimeout: (f, ms) => timers.push([clock + ms, f]), addEventListener: (n, f) => { (ev[n] = ev[n] || []).push(f); }, removeEventListener: (n, f) => { ev[n] = (ev[n] || []).filter(x => x !== f); },
    Date: { now: () => clock }, JSON, Array, String, Number, Object, Math };
  W.window = W; vm.createContext(W); vm.runInContext('Date = window.Date', W);
  const step = ms => { const end = clock + ms; for (;;) { timers.sort((a, b) => a[0] - b[0]); const t = timers[0]; if (!t || t[0] > end) break; timers.shift(); clock = t[0]; t[1](); } clock = end; };
  return { W, D, root, gate, body, ev, step, run(){ vm.runInContext(code, W); }, clock: () => clock };
}
const T = Date.parse('2026-10-30T12:00:00Z');
// 1. a normal open: remembered, then cleared when the sign-in screen is drawn
{ const ls = new Storage(), ss = new Storage(); const w = world(ls, ss, T); w.run();
  ok(!w.W.__GC_BOOTSAFE__ && JSON.parse(ls.getItem('gc_boot_try')).open === 1, 'an open is remembered until something is drawn');
  w.gate.on = true; w.gate.rects = 1; w.step(600);
  const k = JSON.parse(ls.getItem('gc_boot_try')); ok(k.open === 0 && k.fails === 0 && w.W._gcBootSafe.state().what === 'sign-in', 'the sign-in screen counts as drawn', k);
  // the next open is normal
  const w2 = world(ls, ss, T + 5000); w2.run(); ok(!w2.W.__GC_BOOTSAFE__, 'after a drawn open the next open is normal'); }
// 2. two blank opens in a row -> the third is safe mode; the speed layers read their kill switch as on
{ const ls = new Storage(), ss = new Storage(); ls.setItem('gc_storecut_off', '0');
  world(ls, ss, T).run(); world(ls, ss, T + 30e3).run();   /* never drawn */
  const w = world(ls, ss, T + 60e3); w.run();
  ok(w.W.__GC_BOOTSAFE__ === true && /2 opens/.test(w.W._gcBootSafe.state().why), 'two blank opens in a row: the next open is safe mode', w.W._gcBootSafe.state());
  ok(ls.getItem('gc_storecut_off') === '1' && ls.getItem('gc_idletrim_off') === '1' && ls.getItem('gc_sweepchunk_off') === '1' && ls.getItem('gc_todophone_off') === '1', 'safe mode: STORECUT / IDLETRIM / SWEEPCHUNK / TODOPHONE read as off');
  ok(Storage.prototype.getItem.call(new Storage(), 'gc_storecut_off') === null, 'other storages are untouched');
  ok(+ls.m.gc_bootsafe > T + 23 * 3600e3, 'safe mode stays on for 24 h');
  w.root.firstElementChild = {}; w.root.textContent = 'Dashboard GrayCo CRM menu'; w.step(600);
  ok(JSON.parse(ls.getItem('gc_boot_try')).open === 0, 'the CRM drawn in #root counts as drawn');
  Storage.prototype.getItem = function(k){ return k in this.m ? this.m[k] : null; }; }
// 3. a reload loop in one tab -> safe mode
{ const ls = new Storage(), ss = new Storage(); let w;
  for (let i = 0; i < 5; i++) { w = world(ls, ss, T + i * 3000); w.run(); w.gate.on = true; w.gate.rects = 1; w.step(600); }
  ok(w.W.__GC_BOOTSAFE__ === true && /loads of this tab/.test(w.W._gcBootSafe.state().why), '5 loads of one tab in 90 s: safe mode', w.W._gcBootSafe.state());
  Storage.prototype.getItem = function(k){ return k in this.m ? this.m[k] : null; }; }
// 4. an error before the first draw is kept and shown; a panel after 25 s of nothing
{ const ls = new Storage(), ss = new Storage(); const w = world(ls, ss, T); w.run();
  (w.ev.error || []).forEach(f => f({ message: 'TypeError: x is undefined', filename: 'index.html', lineno: 42, colno: 7 }));
  const e = JSON.parse(ls.getItem('gc_boot_err') || 'null'); ok(e && /x is undefined/.test(e.errs[0]), 'an error before the first draw is kept (gc_boot_err)', e);
  w.step(20000); ok(w.body.kids.length === 0, 'no panel before 25 s');
  w.step(6000); ok(w.body.kids.length === 1 && /has not opened yet/.test(w.body.kids[0].innerHTML) && /x is undefined/.test(w.body.kids[0].innerHTML), 'nothing drawn 25 s after the page was read: the panel, with the error');
  w.root.firstElementChild = {}; w.root.textContent = 'Dashboard GrayCo CRM menu'; w.step(600); ok(w.body.kids.length === 0, 'the panel goes away when the CRM draws'); }
// 5. full browser storage: still works (session storage), nothing thrown
{ const ls = new Storage(), ss = new Storage(); ls.full = true; let err = null; try { world(ls, ss, T).run(); world(ls, ss, T + 1000).run(); const w = world(ls, ss, T + 2000); w.run(); ok(w.W.__GC_BOOTSAFE__ === true, 'full local storage: the count is kept in session storage'); } catch (e) { err = e; } ok(!err, 'nothing thrown with full storage', String(err));
  Storage.prototype.getItem = function(k){ return k in this.m ? this.m[k] : null; }; }
// 6. kill switch
{ const ls = new Storage(), ss = new Storage(); ls.setItem('gc_bootsafe_off', '1'); world(ls, ss, T).run(); world(ls, ss, T + 1000).run(); const w = world(ls, ss, T + 2000); w.run();
  ok(!w.W.__GC_BOOTSAFE__ && !w.W._gcBootSafe && ls.getItem('gc_boot_try') === null, 'kill switch gc_bootsafe_off = 1: nothing done'); }
console.log('RESULT ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
