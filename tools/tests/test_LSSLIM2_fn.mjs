// test_LSSLIM2_fn.mjs [build-dir] — patch LSSLIM2 in jsdom (no browser, nothing leaves): the LSGUARD + LSSLIM2 scripts
// and the pull's patched line are taken from the built index.html; the builder's IndexedDB store (window.storage) and the
// plain localStorage copies hold the REAL rate book / material log / estimate list from the read-only mirror
// (MIRROR=..., default the loop mirror). Checks: on a phone (2,750,000-character localStorage, the owner's iPhone keys)
// the plain gc_rates_v3 + gc_matlog_v2 copies leave localStorage (~1 M characters) and every reader of them (the rate
// lookup loadRates, the job-cost rateBook, the price lookups' rd, the builder's window.storage) reads exactly what it read
// before; the pull keeps its value in memory; IndexedDB empty or unreadable -> the copies stay and the pull writes them;
// other code's writes / removes of the copy behave as before; the desktop's 2.7 M gc_ests_v2 copy leaves too.
// jsdom: `npm i jsdom` anywhere on the module path, or JSDOM_DIR=<path to node_modules/jsdom>.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BUILD = path.resolve(process.argv[2] || path.join(HERE, '../..'));
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); } };
let JSDOM;
for (const p of [process.env.JSDOM_DIR, 'jsdom', '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/jsdom'].filter(Boolean)) {
  try { ({ JSDOM } = require(p)); break; } catch (e) {}
}
if (!JSDOM) { console.error('jsdom not found (npm i jsdom, or JSDOM_DIR=…)'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const grab = id => { const m = new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>').exec(html); return m && m[1]; };
const GUARD = grab('gc-patch-lsguard'), SLIM2 = grab('gc-patch-lsslim2');
ok(!!SLIM2 && SLIM2.includes('__GC_PATCH_LSSLIM2__'), 'index.html carries the LSSLIM2 script');
ok(html.indexOf('<script id="gc-patch-lsslim2">') > html.indexOf('<script id="gc-patch-lsguard">') && html.indexOf('<script id="gc-patch-lsslim2">') < html.indexOf('<script id="gc-patch-bootsafe">'), 'it runs right after LSGUARD, before BOOTSAFE');
const PULL_LINE = (/\n( *try\{ if\(!\(window\.__gcEstMirror[^\n]*)\n/.exec(html) || [])[1];
ok(!!PULL_LINE && PULL_LINE.includes('localStorage.setItem(_plainKey, _val)'), 'the pull keeps a fallback write of the plain copy');
// the readers of the plain copies, as the build has them
const cutFn = (start, end) => { const i = html.indexOf(start); if (i < 0) return null; const j = html.indexOf(end, i); return html.slice(i, j + end.length); };
const LOADRATES = cutFn('function loadRates(){\n    // Rates live in the estimate builder', 'return [];\n  }');
const RATEBOOK = cutFn('function rateBook(){ try { var r = JSON.parse(localStorage.getItem(\'__est__gc_rates_v3\')', 'return []; }');
const RD = cutFn("function rd(k){ try { return localStorage.getItem(k) || ''; }", "catch (e) { return ''; } }");
ok(!!LOADRATES && !!RATEBOOK && !!RD, 'readers found: loadRates, rateBook, rd');

const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8')); const row = k => (rows.find(r => r.key === k) || {}).v;
const IDB = { gc_rates_v3: row('__est__gc_rates_v3'), gc_matlog_v2: row('__est__gc_matlog_v2'), gc_ests_v2: row('__est__gc_ests_v2') };
ok(Object.values(IDB).every(v => typeof v === 'string' && JSON.parse(v).length > 0), 'mirror: rate book ' + JSON.parse(IDB.gc_rates_v3).length + ', material log ' + JSON.parse(IDB.gc_matlog_v2).length + ', estimates ' + JSON.parse(IDB.gc_ests_v2).length);

/* a page with a character-limited localStorage, the given keys, and the builder's IndexedDB store */
function page(limit, pre, idb) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'https://crm.grayco-cs.com/', runScripts: 'outside-only', storageQuota: 1e9 });
  const W = dom.window, P = W.Storage.prototype, realSet = P.setItem, nGet = P.getItem, nKey = P.key, LS = W.localStorage;
  const used = () => { let n = 0; for (let i = 0; i < LS.length; i++) { const k = nKey.call(LS, i); n += k.length + (nGet.call(LS, k) || '').length; } return n; };
  P.setItem = function(k, v){ if (this === LS) { k = String(k); v = String(v); const old = nGet.call(LS, k); if (used() - (old == null ? 0 : k.length + old.length) + k.length + v.length > limit) throw new W.DOMException('quota', 'QuotaExceededError'); } return realSet.call(this, k, v); };
  Object.keys(pre).forEach(k => realSet.call(LS, k, pre[k]));
  W.eval(GUARD); W.eval(SLIM2);
  // the builder's store is defined by a later script (window.storage = { get ... } reading IndexedDB "__est__<key>")
  if (idb !== 'none') W.storage = { get: k => idb === 'broken' ? Promise.reject(new Error('IndexedDB unavailable')) : Promise.resolve(idb[k] != null ? { value: idb[k], key: '__est__' + k } : null) };
  const run = src => W.eval('(function(){ ' + src + ' })()');
  const readers = () => ({
    loadRates: JSON.stringify(run(LOADRATES + '; return loadRates();')),
    rateBook: JSON.stringify(run(RATEBOOK + '; return rateBook();')),
    rdRates: run(RD + "; return rd('__est__gc_rates_v3') || rd('gc_rates_v3');"),
    rdMatlog: run(RD + "; return rd('__est__gc_matlog_v2') || rd('gc_matlog_v2');"),
    ests: W.localStorage.getItem('gc_ests_v2'),
  });
  const pull = (k, v) => W.eval('(function(_plainKey, _val){ ' + PULL_LINE + ' })')(k, v);
  return { W, LS, nGet: k => nGet.call(LS, k), used, readers, pull };
}
const filler = n => 'x'.repeat(n);
// the owner's iPhone (device 2, 11/03): its biggest keys; gc_ests_v2 was already cleared by LSGUARD
const PHONE = { gc_matlog_v2: IDB.gc_matlog_v2, gc_rates_v3: IDB.gc_rates_v3, gc_office_tasks: filler(244278), gcLDEL_cache: filler(181226), gc_tombstones: filler(145774), gc_auth_v1: filler(1850) };

// ── 1. phone, IndexedDB holds the lists ─────────────────────────────────────────────────────────────────────
{
  const p = page(2750000, PHONE, IDB);
  const before = p.readers(), uBefore = p.used();
  await sleep(700);
  const uAfter = p.used();
  console.log('  phone localStorage: ' + uBefore + ' -> ' + uAfter + ' characters (' + (uBefore - uAfter) + ' freed)');
  ok(p.nGet('gc_matlog_v2') == null && p.nGet('gc_rates_v3') == null, 'the plain gc_matlog_v2 + gc_rates_v3 copies left localStorage');
  ok(uBefore - uAfter > 950000, 'about 1 M characters freed on the phone (' + (uBefore - uAfter) + ')');
  const after = p.readers();
  ok(['loadRates', 'rateBook', 'rdRates', 'rdMatlog'].every(k => after[k] === before[k]), 'every reader of the plain rate book / material log reads exactly what it read before (loadRates, rateBook, rd)');
  ok(before.ests == null && after.ests === IDB.gc_ests_v2, 'gc_ests_v2 (already cleared by LSGUARD on the phone): its readers now get the IndexedDB estimate list instead of nothing');
  ok(JSON.parse(after.loadRates).length === JSON.parse(IDB.gc_rates_v3).length && after.rdMatlog === IDB.gc_matlog_v2, 'rate lookups read the full rate book (' + JSON.parse(after.loadRates).length + ') and material log');
  const b = await Promise.all(['gc_rates_v3', 'gc_matlog_v2', 'gc_ests_v2'].map(k => p.W.storage.get(k)));
  ok(b.every((r, i) => r && r.value === IDB[['gc_rates_v3', 'gc_matlog_v2', 'gc_ests_v2'][i]]), 'the builder reads rates / material log / estimates from IndexedDB, unchanged');
  ok(p.LS.getItem('gc_office_tasks').length === 244278 && p.nGet('gc_auth_v1') != null, 'nothing else touched');
  // the pull: a new material log arrives
  const ml = JSON.parse(IDB.gc_matlog_v2); ml.unshift({ id: 'mtNEW', desc: 'Test board', cost: 9.99, unit: 'EA', type: 'material' }); const mlNew = JSON.stringify(ml);
  p.pull('gc_matlog_v2', mlNew);
  ok(p.nGet('gc_matlog_v2') == null && p.LS.getItem('gc_matlog_v2') === mlNew, 'the pull keeps the new material log in memory (not localStorage); readers see it');
  ok(p.readers().rdMatlog === mlNew, 'the price lookup reads the new material log');
  // fits now: a big write the phone could not make before
  let wrote = true; try { p.LS.setItem('gc_ests_backup_probe', filler(900000)); } catch (e) { wrote = false; }
  ok(wrote, 'a 900 K write fits on the phone now');
  p.LS.removeItem('gc_ests_backup_probe');
  // other code writes / removes the copy as before
  p.LS.setItem('gc_rates_v3', '[{"id":"r1"}]');
  ok(p.nGet('gc_rates_v3') === '[{"id":"r1"}]' && JSON.parse(p.readers().rateBook)[0].id === 'r1', 'a write of the copy by other code goes to localStorage as before and is what readers see');
  p.LS.removeItem('gc_rates_v3');
  ok(p.LS.getItem('gc_rates_v3') == null, 'removeItem removes it (no memory copy comes back)');
  ok(p.W.__gcEstMirror.state().idb.gc_matlog_v2 === true && p.W.__gcEstMirror.state().held === 1, 'state(): IndexedDB holds them; one pull value held', p.W.__gcEstMirror.state());
}
// ── 2. IndexedDB empty: the copies stay, the pull writes them ─────────────────────────────────────────────────
{
  const p = page(2750000, PHONE, { gc_rates_v3: '[]' });
  await sleep(700);
  ok(p.nGet('gc_matlog_v2') === IDB.gc_matlog_v2 && p.nGet('gc_rates_v3') === IDB.gc_rates_v3, 'IndexedDB empty: the plain copies stay');
  p.pull('gc_matlog_v2', '[{"id":"m1"}]');
  ok(p.nGet('gc_matlog_v2') === '[{"id":"m1"}]', 'IndexedDB empty: the pull writes the copy as before');
}
// ── 3. IndexedDB unavailable (private mode) / builder store missing ─────────────────────────────────────────
for (const idb of ['broken', 'none']) {
  const p = page(2750000, PHONE, idb);
  const before = p.readers(); await sleep(700);
  ok(p.nGet('gc_matlog_v2') === IDB.gc_matlog_v2 && p.nGet('gc_rates_v3') === IDB.gc_rates_v3 && JSON.stringify(p.readers()) === JSON.stringify(before), 'IndexedDB ' + (idb === 'broken' ? 'unreadable' : 'store missing') + ': the copies stay, readers unchanged');
  p.pull('gc_rates_v3', '[{"id":"r2"}]');
  ok(p.nGet('gc_rates_v3') === '[{"id":"r2"}]', 'IndexedDB ' + (idb === 'broken' ? 'unreadable' : 'store missing') + ': the pull writes the copy as before');
}
// ── 4. desktop (5,242,880): the 2.7 M estimate list copy leaves too; LSGUARD clearing a later copy loses nothing ──
{
  const p = page(5242880, { gc_ests_v2: IDB.gc_ests_v2, gc_rates_v3: IDB.gc_rates_v3, gc_matlog_v2: IDB.gc_matlog_v2 }, IDB);
  const before = p.readers(), u0 = p.used(); await sleep(700);
  console.log('  desktop localStorage: ' + u0 + ' -> ' + p.used() + ' characters');
  ok(p.nGet('gc_ests_v2') == null && JSON.stringify(p.readers()) === JSON.stringify(before) && p.used() < 100, 'desktop: all three copies leave localStorage, readers unchanged (old-draft alert reads ' + JSON.parse(p.readers().ests).length + ' estimates)');
  p.LS.setItem('gc_ests_v2', IDB.gc_ests_v2);     // an estimate save writes the copy again
  p.LS.setItem('gc_huge', filler(5242880 - 2678194 - 'gc_ests_v2'.length - 'gc_huge'.length + 10));   // LSGUARD clears gc_ests_v2 to fit
  ok(p.nGet('gc_ests_v2') == null && p.LS.getItem('gc_ests_v2') === IDB.gc_ests_v2, 'LSGUARD clears a re-written copy: readers still get the estimate list from memory');
}
// ── 5. the patch is idempotent ─────────────────────────────────────────────────────────────────────────────
{
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'lsslim2-')); fs.writeFileSync(path.join(tmp, 'index.html'), html);
  const out = require('child_process').execFileSync('python3', [path.join(HERE, '..', 'patch_LSSLIM2.py'), path.join(tmp, 'index.html')]).toString();
  ok(/already patched/.test(out) && fs.readFileSync(path.join(tmp, 'index.html'), 'utf8') === html, 'patch_LSSLIM2.py on the patched page: "already patched"');
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
