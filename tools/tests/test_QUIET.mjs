// test_QUIET.mjs <build-dir> — patch QUIET: GrayCo Field home on a phone is quiet.
// A. node: the patch is in the page once, before RESUME (before any other script makes a timer), idempotent.
// B. the patch's script in a bare page (no network): a desk-only script's fast interval and page watcher wait while Field
//    home is on screen on a phone; leaving Field home runs the kept tick once; a script not in the list, a slow interval and a
//    one-shot timer run as before; a desk (not a phone) runs everything; a DOM write that changes nothing makes no mutation,
//    one that changes something does; the kill switch leaves everything as before.
// Usage: NODE_PATH=<node_modules> node tools/tests/test_QUIET.mjs <dir with index.html>
import fs from 'fs'; import path from 'path'; import os from 'os'; import { execFileSync } from 'child_process'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = process.argv[2];
if (!build) { console.error('usage: node test_QUIET.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('A. node');
const page0 = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const scripts = [...page0.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
ok((page0.match(/<script id="gc-patch-quiet">/g) || []).length === 1, 'the patch is in the page once');
ok(scripts[1] === '<script id="gc-patch-quiet">' && scripts[2] === '<script id="gc-patch-resume">', 'it is the 2nd script, before RESUME', scripts.slice(0, 3));
{ const tmp = path.join(os.tmpdir(), 'quiet_idem_' + process.pid + '.html'); fs.writeFileSync(tmp, page0);
  const out = execFileSync('python3', [path.join(build, 'tools', 'patch_QUIET.py'), tmp]).toString(); ok(/already applied/.test(out) && fs.readFileSync(tmp, 'utf8') === page0, 'the patch is idempotent'); fs.unlinkSync(tmp); }
ok(/anc\.nextSibling\.id === 'gc-to-strip'/.test(page0) && /VC_TTL = 6 \* 3600e3/.test(page0), 'the LEADWATCH card / time-off strip fix and STORECUT 6 h are in');
const src = /<script id="gc-patch-quiet">([\s\S]*?)<\/script>/.exec(page0)[1];

console.log('B. in a page');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.NODE_PATH || '', 'playwright')); }
const b = await pw.chromium.launch();
const HTML = phone => `<!doctype html><html class="_fieldmode"><body><div id="_gcJobPick" class="gc-fh"><span id="t" title="a">x</span></div>
<script>window._gcDevice = { phone: function(){ return ${phone}; } };</script>
<script>${src}</script>
<script id="gc-patch-nav">window.N = { fast: 0, slow: 0, once: 0, mo: 0 }; setInterval(function(){ N.fast++; }, 400); setInterval(function(){ N.slow++; }, 6000);
  setTimeout(function(){ N.once++; }, 600); new MutationObserver(function(){ N.mo++; }).observe(document.body, { subtree: true, childList: true, attributes: true });</script>
<script id="gc-patch-other">window.O = { fast: 0 }; setInterval(function(){ O.fast++; }, 400);</script>`;
async function fresh(phone, pre){
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  if (pre) await ctx.addInitScript(pre);
  await ctx.route('**/*', r => r.fulfill({ status: 200, contentType: 'text/html', body: HTML(phone) }));
  const p = await ctx.newPage(); await p.goto('http://quiet.test/'); return { p, ctx };
}
{ const { p, ctx } = await fresh(true);
  await sleep(1500);
  const a = await p.evaluate(() => { document.body.appendChild(document.createElement('i')); return null; });
  await sleep(1200);
  const r1 = await p.evaluate(() => ({ N: Object.assign({}, window.N), O: Object.assign({}, window.O), q: window.__gcQuiet.state() }));
  ok(r1.N.fast === 0 && r1.q.skips['gc-patch-nav'] >= 3, 'Field home on a phone: the desk-only script\'s fast interval waits', r1);
  ok(r1.N.mo === 0 && r1.q.moSkips['gc-patch-nav'] >= 1, 'and its page watcher waits', r1);
  ok(r1.O.fast >= 4, 'a script not in the list runs as before', r1.O);
  ok(r1.N.once === 1, 'a one-shot timer of a listed script runs as before', r1.N);
  await p.evaluate(() => { document.getElementById('_gcJobPick').remove(); });
  await sleep(1200);
  const r2 = await p.evaluate(() => ({ N: Object.assign({}, window.N), q: window.__gcQuiet.state() }));
  ok(r2.q.flushed === 1 && r2.N.fast >= 2, 'leaving Field home: the kept tick ran once, then the interval ticks as before', r2);
  /* no-op writes */
  const w = await p.evaluate(async () => {
    const t = document.createElement('span'); t.title = 'a'; t.className = 'x y'; t.textContent = 'hi'; t.setAttribute('aria-label', 'L'); document.body.appendChild(t);
    await new Promise(r => setTimeout(r, 0));
    const rec = []; const mo = new MutationObserver(l => l.forEach(m => rec.push(m.type + ':' + (m.attributeName || '')))); mo.observe(t, { attributes: true, childList: true, characterData: true, subtree: true });
    t.title = 'a'; t.className = 'x y'; t.classList.add('x'); t.classList.remove('z'); t.classList.toggle('y', true); t.textContent = 'hi'; t.setAttribute('aria-label', 'L'); t.setAttribute('data-k', null === 1 ? '' : (t.getAttribute('data-k') || 'v'));
    await new Promise(r => setTimeout(r, 0)); const same = rec.length; rec.length = 0;
    t.title = 'b'; t.classList.add('z'); t.textContent = 'ho'; t.setAttribute('aria-label', 'M');
    await new Promise(r => setTimeout(r, 0));
    return { same, changed: rec.slice(), title: t.title, cls: t.className, text: t.textContent, aria: t.getAttribute('aria-label') };
  });
  ok(w.same === 1, 'writes that change nothing make no mutation (only the first data-k set does)', w);
  ok(w.changed.length === 4 && w.title === 'b' && w.cls === 'x y z' && w.text === 'ho' && w.aria === 'M', 'writes that change something are made', w);
  await ctx.close(); }
{ const { p, ctx } = await fresh(false);
  await sleep(1500);
  const r = await p.evaluate(() => Object.assign({}, window.N));
  ok(r.fast >= 2, 'a desk (not a phone): the desk-only script runs as before', r);
  await ctx.close(); }
{ const { p, ctx } = await fresh(true, `try { localStorage.setItem('gc_quiet_off', '1'); } catch (e) {}`);
  await sleep(1500);
  const r = await p.evaluate(() => ({ N: Object.assign({}, window.N), off: window.__gcQuiet && window.__gcQuiet.off }));
  ok(r.off === true && r.N.fast >= 2, 'gc_quiet_off = 1: everything runs as before', r);
  await ctx.close(); }
await b.close();
console.log(`\nQUIET: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
