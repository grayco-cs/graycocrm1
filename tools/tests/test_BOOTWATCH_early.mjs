// test_BOOTWATCH_early.mjs [index.html | build-dir] — patch BOOTWATCH, the page side without a browser: where it sits, that the page
// carries tools/bootwatch_early.js, the patch is idempotent, the version comparison, the CRM's own update bar hooks, and the
// script in a small fake page: no send on a quiet open, the sign-in try keeps only domain + hash, one heartbeat a day.
//   node tools/tests/test_BOOTWATCH_early.mjs index.html
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import os from 'os'; import { execFileSync } from 'child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
let html = process.argv[2] || path.join(here, '..', '..', 'index.html');
if (fs.existsSync(html) && fs.statSync(html).isDirectory()) html = path.join(html, 'index.html');
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? ' ' + JSON.stringify(i).slice(0, 400) : '')); } };
const src = fs.readFileSync(html, 'utf8');
const LATE = fs.readFileSync(path.join(here, '..', 'bootwatch_late.js'), 'utf8');
const code = fs.readFileSync(path.join(here, '..', 'bootwatch_early.js'), 'utf8').replace("'__BW_LATE__'", JSON.stringify(LATE).replace(/[\u0080-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).replace(/<\//g, '<\\/'));
ok((src.match(/<script id="gc-patch-bootwatch">/g) || []).length === 1, 'in the page once');
ok(src.indexOf('<script') === src.indexOf('<script id="gc-patch-lsguard">'), 'LSGUARD is still the first script of the page');
const at = src.indexOf('<script id="gc-patch-bootwatch">');
ok(at < src.indexOf('<script id="gc-patch-saves-lsheld">') && at < src.indexOf('<script id="gc-patch-bootsafe">') && at < src.indexOf('COMPANY SIGN-IN'), 'right after LSGUARD: before BOOTSAFE, the sign-in and the app');
ok(src.includes(code.trim()), 'the page carries tools/bootwatch_early.js with tools/bootwatch_late.js inside as text');
ok(!/function\s*\(|=>/.test(code.slice(code.indexOf('var LATE = '), code.indexOf('var LATE = ') + 12)) && code.includes('var LATE = "'), 'the late part is a string (not compiled at open)');
{ const tmp = path.join(os.tmpdir(), 'bootwatch_idem_' + process.pid + '.html'); fs.writeFileSync(tmp, src);
  const out = execFileSync('python3', [path.join(here, '..', 'patch_BOOTWATCH.py'), tmp]).toString(); ok(/already patched/.test(out) && fs.readFileSync(tmp, 'utf8') === src, 'patch is idempotent'); fs.unlinkSync(tmp); }
ok(/_gcBootWatch && window\._gcBootWatch\.banner\(\)\) return;/.test(src) && /_gcBootWatch\.update\(\)\) return; }catch\(e\)\{\} location\.reload\(true\);/.test(src) && /_gcBootWatch\.live\(60000\)/.test(src), 'the CRM\'s own update bar: no second bar, the same update, the answer already fetched');
ok(/'claude-proxy': 1, bootwatch: 1 \}/.test(src), 'the Marketing Manager\'s page may report too');
ok(!/password/i.test((code + LATE).replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^']*password[^']*'/gi, '')), 'the script never reads a password field (no code touches one)');
ok(!/gc-auth-password/.test(code), '… not even by id');

/* the script in a tiny fake page */
class Storage { constructor(){ this.m = {}; } getItem(k){ return k in this.m ? this.m[k] : null; } setItem(k, v){ this.m[k] = String(v); } removeItem(k){ delete this.m[k]; } }
function world(ls, opt){
  opt = opt || {}; const timers = []; const ev = {}, dev_ = {}; let clock = opt.now || Date.parse('2026-11-18T15:00:00Z');
  const cls = new Set(); const els = {};
  const mk = (id, o) => Object.assign({ id, getClientRects(){ return { length: this.shown ? 1 : 0 }; }, style: {}, textContent: '', remove(){ delete els[id]; } }, o || {});
  const D = { readyState: 'loading', visibilityState: 'visible', scripts: { length: 10 },
    documentElement: { classList: { contains: c => cls.has(c), add: c => cls.add(c), remove: c => cls.delete(c) }, appendChild(x){ els[x.id] = x; x.isConnected = true; } },
    getElementById: id => els[id] || null, querySelector: q => (q === '#root>div>aside' && opt.desk && opt.desk()) ? {} : null,
    createElement: () => ({ style: {}, setAttribute(){}, addEventListener(){}, appendChild(){} }),
    addEventListener: (n, f) => { (dev_[n] = dev_[n] || []).push(f); } };
  const beacons = [], fetches = [];
  const W = { document: D, localStorage: ls, sessionStorage: new Storage(), navigator: { userAgent: opt.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile', onLine: true, sendBeacon: (u, b) => { beacons.push({ u, b: JSON.parse(b) }); return true; } },
    performance: { now: () => clock - Date.parse('2026-11-18T15:00:00Z'), getEntriesByType: () => [] }, matchMedia: () => ({ matches: false }), console: { log(){}, warn(...a){ console.log('page warn:', ...a); } },
    fetch: (u, o) => { fetches.push({ u, o }); return Promise.resolve({ ok: true, text: () => Promise.resolve(opt.live || '') }); },
    setTimeout: (f, ms) => timers.push([clock + (ms || 0), f]), addEventListener: (n, f) => { (ev[n] = ev[n] || []).push(f); },
    Date: { now: () => clock }, JSON, Array, String, Number, Object, Math, Promise, location: { reload(){ W.reloads = (W.reloads || 0) + 1; } } };
  W.window = W; W.__RealDate = Date; vm.createContext(W); vm.runInContext('Date = (function(N, now){ function D(a){ return a === undefined ? new N(now()) : new N(a); } D.now = now; D.parse = N.parse; D.UTC = N.UTC; D.prototype = N.prototype; return D; })(__RealDate, window.Date.now)', W);
  const step = ms => { const end = clock + ms; for (;;) { timers.sort((a, b) => a[0] - b[0]); const t = timers[0]; if (!t || t[0] > end) break; timers.shift(); clock = t[0]; try { t[1](); } catch (e) { console.log('timer threw', e); } } clock = end; };
  return { W, D, els, mk, cls, ev, dev_, beacons, fetches, step, run(){ vm.runInContext(code, W); }, fire: (n, o) => (ev[n] || []).forEach(f => f(o || {})), dfire: (n, o) => (dev_[n] || []).forEach(f => f(o || {})) };
}
// version comparison
{ const w = world(new Storage()); w.run(); const o = w.W._gcBootWatch.older;
  ok(o('33.164-2026-11-04-r30a', '33.269-2026-11-18-r36i') && !o('33.269-2026-11-18-r36i', '33.269-2026-11-18-r36i') && !o('33.270-2026-11-19-r36j', '33.269-2026-11-18-r36i'), 'older(): an older build is older; the same / a newer one (a rollback) is not');
  ok(o('33.269-2026-11-18-r36i', '33.269-2026-11-18-r36j') && o('33.9-2026-01-01-a', '33.10-2026-01-02-a') && !o('', '33.1') && !o('x', 'y'), 'older(): hotfix letter, numbers not text, nothing for unknown values'); }
// a quiet signed-out open: the sign-in screen, nothing sent until it is left; the try keeps domain + hash only
{ const ls = new Storage(); const w = world(ls); w.run();
  const dev = ls.getItem('gc_adm_device_id'); ok(/^P[a-z0-9]+$/.test(dev), 'a device id is made (same form as PERFREP) when there is none');
  w.D.readyState = 'interactive'; w.dfire('DOMContentLoaded'); w.els['gc-auth-email'] = w.mk('gc-auth-email', { shown: true, value: 'Some.One@Example-Co.com' });
  w.els['gc-auth-msg'] = w.mk('gc-auth-msg'); w.step(5000);
  ok(w.beacons.length === 0 && w.W._gcBootWatch.state().boot.m.gate > 0, 'the sign-in screen is recorded; nothing is sent yet');
  const form = { querySelector: q => q === '#gc-auth-email' ? w.els['gc-auth-email'] : null };
  w.dfire('submit', { target: form }); w.els['gc-auth-msg'].textContent = 'That email and password do not match a GrayCo sign-in.'; w.els['gc-auth-msg'].style.color = 'rgb(185, 28, 28)';
  w.step(3000);
  const b = w.beacons[0] && w.beacons[0].b.boot;
  ok(w.beacons.length === 1 && b.si[0].dom === 'example-co.com' && /^[0-9a-f]{12}$/.test(b.si[0].h) && /do not match/.test(b.si[0].err) && b.p.signin, 'a failed sign-in is sent at once: domain + hash + the error text', b && b.si);
  ok(!JSON.stringify(w.beacons).includes('some.one') && !JSON.stringify(w.beacons).toLowerCase().includes('some.one@'), 'the address itself is not sent');
  w.step(40000); ok(w.beacons.length === 1, 'nothing more while nothing new goes wrong'); }
// a normal signed-in phone open: one heartbeat a day, nothing on the next open
{ const ls = new Storage(); let painted = false;
  for (let i = 0; i < 2; i++) {
    const w = world(ls, { now: Date.parse('2026-11-18T15:00:00Z') + i * 600e3 }); w.W.__GC_AUTH__ = { email: () => 'a@b.co', mode: () => 'online' };
    const sent = []; w.W.fetch = (u, o) => { if (/bootwatch/.test(u)) sent.push(JSON.parse(o.body)); return Promise.resolve({ ok: true, text: () => Promise.resolve('') }); };
    w.run(); w.D.readyState = 'interactive'; w.dfire('DOMContentLoaded'); w.step(1000);
    w.cls.add('_fieldmode'); w.els._gcJobPick = w.mk('_gcJobPick'); w.step(1000); await new Promise(r => setImmediate(r)); w.step(4000); await new Promise(r => setImmediate(r));
    if (i === 0) ok(sent.length === 1 && sent[0].boot.hb === '2026-11-18' && /field home/.test(sent[0].boot.m.paintV) && w.beacons.length === 0, 'signed in, first open of the day: ONE heartbeat by fetch (the sign-in layer adds the token)', sent.map(x => x.boot));
    else ok(sent.length === 0 && w.beacons.length === 0, 'the next open the same day: nothing', sent);
    w.fire('pagehide'); ok(sent.length === (i === 0 ? 1 : 0), 'leaving a good open sends nothing');
  } }
// stuck: signed in, no first screen 20 s → sent with what was on screen
{ const ls = new Storage(); const w = world(ls); w.W.__GC_AUTH__ = { email: () => 'a@b.co', mode: () => 'online' }; const sent = [];
  w.W.fetch = (u, o) => { if (/bootwatch/.test(u)) sent.push(JSON.parse(o.body)); return Promise.resolve({ ok: true, text: () => Promise.resolve('') }); };
  w.run(); w.step(23000); await new Promise(r => setImmediate(r));
  const b = sent[0] && sent[0].boot; ok(b && b.stuck[0].k === 'screen' && /signed in, no first screen 2\d s: .*blank/.test(b.stuck[0].why), 'stuck: "signed in, no first screen in 20 s" + what is on screen', b && b.stuck);
  ok(w.els['gc-bw-opening'], 'the "Opening GrayCo Field…" screen is up instead of a blank page'); }
// no signal: kept and sent with the next open
{ const ls = new Storage(); const w = world(ls); w.W.navigator.onLine = false; w.run(); w.step(23000);
  ok(w.beacons.length === 0 && ls.getItem('gc_bw_pend'), 'offline: nothing sent, the open is kept');
  const w2 = world(ls, { now: Date.parse('2026-11-18T15:10:00Z') }); w2.run(); w2.step(6000);
  ok(w2.beacons.length === 1 && w2.beacons[0].b.prevBoot && w2.beacons[0].b.prevBoot.stuck.length && !ls.getItem('gc_bw_pend'), 'the next open sends it (prevBoot)', w2.beacons.map(x => x.b)); }
// kill switch
{ const ls = new Storage(); ls.setItem('gc_bootwatch_off', '1'); const w = world(ls); w.run(); ok(!w.W._gcBootWatch && !ls.getItem('gc_adm_device_id'), 'kill switch gc_bootwatch_off = 1: nothing'); }
console.log('RESULT ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
