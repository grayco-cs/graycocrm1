// test_RESUME.mjs <build-dir> — patch RESUME: coming back into the app answers at once.
// A. node: the patch sits once, as the 2nd script (before every other script), idempotent.
// B. the patch's own script in a bare page (Chromium, no network): a return's listeners are lined up and all run, after the
//    first frame, one per task; the same listener queued twice in one return runs once; hidden-going listeners, element focus
//    and events the page sends itself run inside the event as before; removeEventListener still removes; overdue timers and
//    intervals (the page suspended, like iOS) are lined up and run once; while hidden / before any hide timers are untouched;
//    a tap right after the return goes first; the kill switch leaves everything as before.
// Usage: NODE_PATH=<node_modules> node tools/tests/test_RESUME.mjs <dir with index.html>
import fs from 'fs'; import path from 'path'; import os from 'os'; import { execFileSync } from 'child_process'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = process.argv[2];
if (!build) { console.error('usage: node test_RESUME.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('A. node');
const page0 = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const scripts = [...page0.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
ok((page0.match(/<script id="gc-patch-resume">/g) || []).length === 1, 'the patch is in the page once');
ok(scripts[1] === '<script id="gc-patch-resume">', 'it is the 2nd script of the page (before any other script registers a listener or a timer)', scripts.slice(0, 3));
{ const tmp = path.join(os.tmpdir(), 'resume_idem_' + process.pid + '.html'); fs.writeFileSync(tmp, page0);
  const out = execFileSync('python3', [path.join(build, 'tools', 'patch_RESUME.py'), tmp]).toString(); ok(/already applied/.test(out) && fs.readFileSync(tmp, 'utf8') === page0, 'the patch is idempotent'); fs.unlinkSync(tmp); }
const src = /<script id="gc-patch-resume">([\s\S]*?)<\/script>/.exec(page0)[1];

console.log('B. in a page');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.NODE_PATH || '', 'playwright')); }
const b = await pw.chromium.launch();
async function fresh(pre){
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.addInitScript(`(() => { const Q = window.__t = { vis: 'visible' };
    const d = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState'), h = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get(){ return Q.vis === 'hidden' ? 'hidden' : d.get.call(this); } });
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get(){ return Q.vis === 'hidden'; } });
    setInterval(() => {}, 100); window.__GC_RESUME_SIM__ = true; ${pre || ''} })()`);
  await ctx.route('**/*', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><button id="b" style="width:200px;height:80px">tap</button>' }));
  await p.goto('http://resume.test/');
  await p.addScriptTag({ content: src });
  const cdp = await ctx.newCDPSession(p); await cdp.send('Debugger.enable');
  return { p, ctx, cdp };
}
const hide = p => p.evaluate(() => { window.__t.vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
const show = p => p.evaluate(() => { window.__t.vis = 'visible'; window.__t.shownAt = performance.now(); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
async function suspend(cdp, ms){ await cdp.send('Debugger.pause'); await sleep(ms); await cdp.send('Debugger.resume').catch(() => {}); }

{ const { p, ctx, cdp } = await fresh();
  await p.evaluate(() => {
    const L = window.L = [], t = () => Math.round(performance.now() - (window.__t.shownAt || 0));
    window.__both = () => L.push(['both', t()]);
    document.addEventListener('visibilitychange', () => L.push([document.hidden ? 'hid-sync' : 'vis', t()]));
    document.addEventListener('visibilitychange', window.__both); window.addEventListener('focus', window.__both); window.addEventListener('online', window.__both);
    window.addEventListener('focus', () => L.push(['focus', t()]));
    const gone = () => L.push(['removed-ran', t()]); document.addEventListener('visibilitychange', gone); document.removeEventListener('visibilitychange', gone);
    document.addEventListener('focus', () => L.push(['elem-focus', t()]), true);
    window.addEventListener('pagehide', () => L.push(['pagehide-sync', t()]));
    document.addEventListener('visibilitychange', { handleEvent(){ L.push(['obj', t()]); } });
    window.__iv = 0; setInterval(() => { window.__iv++; }, 1000);
    window.__to = 0; setTimeout(() => { window.__to++; }, 2000);
    window.__short = 0; setTimeout(() => { window.__short++; }, 1600);
  });
  await sleep(1200);
  const iv0 = await p.evaluate(() => window.__iv);
  ok(iv0 >= 1, 'before any hide an interval ticks as before', iv0);
  await hide(p);
  const h = await p.evaluate(() => window.L.slice());
  ok(h.some(x => x[0] === 'hid-sync'), 'a hidden-going listener runs inside the event (the saves on the way out)', h);
  await p.evaluate(() => { window.L.length = 0; window.__iv = 0; });
  await suspend(cdp, 4000);
  await show(p);
  const right = await p.evaluate(() => ({ L: window.L.slice(), iv: window.__iv, to: window.__to }));
  ok(right.L.length === 0, 'at the return nothing runs inside the event', right.L);
  ok(right.iv === 0 && right.to === 0, 'the overdue interval and timeout do not fire at the return itself', right);
  await p.evaluate(() => document.getElementById('b').focus());
  ok((await p.evaluate(() => window.L.some(x => x[0] === 'elem-focus'))), 'an element\'s focus is not held');
  await sleep(1500);
  const after = await p.evaluate(() => ({ L: window.L.slice(), iv: window.__iv, to: window.__to, short: window.__short, st: window.__gcResume.state() }));
  const names = after.L.map(x => x[0]);
  ok(['vis', 'focus', 'obj'].every(n => names.includes(n)), 'the return\'s listeners all ran from the queue (a handleEvent object too)', after);
  ok(names.filter(n => n === 'both').length === 1 && after.st.deduped >= 1, 'a listener on visibilitychange + focus ran once for the return', after);
  ok(!names.includes('removed-ran'), 'removeEventListener still removes');
  ok(Math.min(...after.L.filter(x => x[0] !== 'elem-focus').map(x => x[1])) >= 300, 'the queue started after the first frame + ~0.35 s', after.L);
  ok(after.iv >= 1 && after.iv <= 2 && after.st.queuedTimers === 3 && after.to === 1 && after.short === 1, 'the overdue interval was lined up once (not once per missed tick: 3 queued = 1 interval + 2 timeouts); the overdue timeouts ran once', after);
  ok(after.st.queuedTimers >= 2 && after.st.queuedEv >= 4 && after.st.queue === 0, 'state: queued events and timers, queue empty', after.st);
  await sleep(2200);
  ok((await p.evaluate(() => window.__iv)) >= 2, 'the interval keeps ticking normally afterwards');
  /* while hidden nothing is held (a desk's background tab) */
  await hide(p); await p.evaluate(() => { window.__iv = 0; }); await sleep(2300);
  ok((await p.evaluate(() => window.__iv)) >= 2, 'while hidden an interval ticks as before (not lined up)');
  await show(p); await sleep(800);
  /* the page's own events */
  await p.evaluate(() => { window.L.length = 0; window.__GC_RESUME_SIM__ = false; window.dispatchEvent(new Event('focus')); });
  ok((await p.evaluate(() => window.L.filter(x => x[0] === 'focus').length)) === 1, 'an event the page sends itself runs inside the event');
  await ctx.close(); }

/* a tap right after the return goes first; a slow listener does not hold it */
{ const { p, ctx, cdp } = await fresh();
  await p.evaluate(() => {
    window.T = []; const busy = ms => { const t = performance.now(); while (performance.now() - t < ms); };
    for (let i = 0; i < 12; i++) document.addEventListener('visibilitychange', () => { if (!document.hidden) { busy(120); window.T.push('slow' + i); } });
    document.getElementById('b').addEventListener('pointerdown', () => { window.tapAt = performance.now(); });
    document.getElementById('b').addEventListener('click', () => { window.T.push('tap'); requestAnimationFrame(() => { window.tapPaint = performance.now() - window.tapAt; }); });
  });
  await hide(p); await suspend(cdp, 1500); await show(p);
  await sleep(250); await p.tap('#b'); await sleep(3500);
  const r = await p.evaluate(() => ({ T: window.T, paint: Math.round(window.tapPaint) }));
  ok(r.T.indexOf('tap') >= 0 && r.T.indexOf('tap') <= 1, 'the tap 0.25 s after the return is answered before (almost) all the slow catch-up', r);
  ok(r.paint < 300, 'the tap is drawn in < 300 ms although 12 × 120 ms of catch-up was waiting', r);
  ok(r.T.filter(x => /^slow/.test(x)).length === 12, 'all the catch-up ran afterwards', r);
  await ctx.close(); }

/* kill switch */
{ const { p, ctx, cdp } = await fresh(`try { localStorage.setItem('gc_resume_off', '1'); } catch (e) {}`);
  const off = await p.evaluate(() => window.__gcResume && window.__gcResume.off);
  await p.evaluate(() => { window.L = []; document.addEventListener('visibilitychange', () => window.L.push(document.hidden ? 'h' : 'v')); });
  await hide(p); await show(p);
  ok(off === true && (await p.evaluate(() => window.L.join(''))) === 'hv', 'gc_resume_off = 1: listeners run inside the event as before', off);
  await ctx.close(); }
await b.close();

/* C. the CRM on a phone (offline harness with made-up data): the sync's pulls at a return */
console.log('C. the CRM on a phone: the sync at a return');
{ const { pathToFileURL } = await import('url');
  const HARNESS = process.env.GC_HARNESS_SW || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/fastopen/harness_fo.mjs';
  const H = await import(pathToFileURL(HARNESS).href);
  const ADMIN = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === 'u-wesley'); const ANAME = H.ACCOUNTS[ADMIN].name;
  const ago = d => new Date(Date.now() - d * 864e5).toISOString();
  H.resetCloud();
  const projects = [], leads = [];
  for (let i = 0; i < 60; i++) projects.push({ id: 'P' + i, po: 'PO-' + (7000 + i), name: 'Demo Job ' + i, client: 'Sample Customer ' + i, address: (100 + i) + ' Demo St', pm: ANAME, status: 'Active', updatedAt: ago(5) });
  for (let i = 0; i < 40; i++) leads.push({ id: 'L' + i, name: 'Lead ' + i, client: 'Lead Person ' + i, stage: 'New Lead', createdAt: ago(10), updatedAt: ago(10) });
  H.cset('projects', projects); H.cset('leads', leads); H.cset('customers', [{ id: 'C1', name: 'Customer 1', updatedAt: ago(20) }]);
  H.cset('invs', []); H.cset('schedule', []); H.cset('estimates', []); H.cset('subs', []); H.cset('vendors', []); H.cset('expenses', []);
  H.cset('users', [{ id: 'u1', name: ANAME, email: ADMIN, role: 'Admin', payType: 'owner', active: true }]);
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
  const INIT = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
    d(Navigator.prototype, 'userAgent', ${JSON.stringify(IPHONE)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); })()`;
  const keysOf = q => { const m = /key=in\.([^&]*)/.exec(q); if (!m) return []; return decodeURIComponent(m[1].replace(/\+/g, ' ')).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')); };
  const valueReads = from => H.reads.slice(from).filter(r => r.table === 'gc_kv' && /key=in\./.test(r.q) && /select=key(,|%2C)value(,|%2C)updated_at/.test(r.q));
  let A = null;
  const until = async (f, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await f(); if (v) return v; } catch (e) {} await sleep(300); } return null; };
  try {
    A = await H.computer('Phone', { build, mobile: true, init: INIT });
    ok(await H.signIn(A, ADMIN, 60000), 'the admin signs in on the phone');
    ok(!!(await until(() => A.ev(() => !!window._crm && !!document.querySelector('#root *')), 90000)), 'the CRM opens');
    ok(!!(await until(() => A.ev(() => { const i = window._gcFastOpen && window._gcFastOpen.marks.info(); return i && i.applied >= 3; }), 120000)), 'the sync applied its lists');
    await sleep(6000);
    /* several asks at once: one pull, then one follow-up */
    let r0 = H.reads.length;
    await A.ev(() => Promise.all([window._gcPullNow(), window._gcPullNow(), window._gcPullNow('verify'), window._gcPullNow()]));
    await sleep(1500);
    const heads1 = H.reads.slice(r0).filter(r => r.table === 'gc_kv' && /select=key(,|%2C)updated_at/.test(r.q) && /key=in\./.test(r.q)).length;
    ok(heads1 >= 1 && heads1 <= 3, 'four asks at once: one pull and one follow-up (key+stamp reads: ' + heads1 + '; the timed pull may add one), not four side by side', heads1);
    const c1 = await A.ev(() => window._gcFastOpen.marks.info().coalesced || 0);
    ok(c1 >= 3, 'the asks while it ran waited for it (' + c1 + ')', c1);
    /* 'verify' with nothing changed downloads no list */
    r0 = H.reads.length;
    await A.ev(() => window._gcPullNow('verify')); await sleep(1000);
    const vk1 = [...new Set(valueReads(r0).flatMap(r => keysOf(r.q)))];
    const inf = await A.ev(() => window._gcFastOpen.marks.info());
    const kept1 = inf.seededNow || [];
    ok(inf.reverified >= 1 && kept1.length >= 5 && !vk1.some(k => kept1.includes(k)), "'verify' with nothing changed in the cloud: no kept list is downloaded again (only lists written on this phone: " + vk1.join(', ') + ')', { vk1, rev: inf.reverified, kept: inf.reverifiedKept, rebased: inf.rebased, dirty: await A.ev(() => window._gcFastOpen.dirty.all()) });
    /* a change in the cloud is found by 'verify' even with an OLD stamp (a computer with a slow clock) */
    const old = H.cget('customers'); H.cset('customers', old.concat([{ id: 'C2', name: 'Customer from the office', updatedAt: ago(0) }]));
    await sleep(2500);   /* no pull in flight that was asked before the change */
    const ch0 = await A.ev(() => window._gcFastOpen.marks.info().changed || 0);
    r0 = H.reads.length;
    await A.ev(() => window._gcPullNow('verify')); await sleep(1500);
    const vk2 = [...new Set(valueReads(r0).flatMap(r => keysOf(r.q)))];
    const ch1 = await A.ev(() => window._gcFastOpen.marks.info());
    ok((ch1.changed || 0) > ch0 || vk2.includes('customers'), "'verify': the list changed in the cloud is found by its stamp and downloaded", { vk2, ch0, changed: ch1.changed, trace: ch1.trace });
    ok(!vk2.includes('invs') && !vk2.includes('schedule'), "'verify': the unchanged lists are not downloaded", vk2);
    ok(!!(await until(() => A.ev(async () => ((await window.idbGet('customers')) || []).some(c => c && c.id === 'C2')), 20000)), 'and the change is on the phone');
    /* a list written here is pulled and merged, never skipped */
    await A.ev(async () => { const v = (await window.idbGet('leads')) || []; v.push({ id: 'LLOCAL', name: 'Made-up lead saved here', stage: 'New Lead', updatedAt: new Date().toISOString() }); await window.idbSet('leads', v); });
    r0 = H.reads.length;
    await A.ev(() => window._gcPullNow('verify')); await sleep(1500);
    const vk3 = [...new Set(valueReads(r0).flatMap(r => keysOf(r.q)))];
    ok(vk3.includes('leads'), "'verify': a list written on this phone since is pulled and merged (never skipped)", vk3);
    ok(!!(await until(() => A.ev(async () => ((await window.idbGet('leads')) || []).some(c => c && c.id === 'LLOCAL')), 10000)), "the phone's own lead is still there");
    /* back online (a network switch): no download of every list */
    await sleep(2000); r0 = H.reads.length;
    await A.ctx.setOffline(true); await sleep(800); await A.ctx.setOffline(false);
    await sleep(14000);
    const vk4 = [...new Set(valueReads(r0).flatMap(r => keysOf(r.q)))];
    const kept4 = (await A.ev(() => window._gcFastOpen.marks.info().seededNow)) || [];
    ok(!vk4.some(k => kept4.includes(k)) && !vk4.includes('customers') && !vk4.includes('invs'), 'back online (5G -> Wi-Fi): the catch-up does not download the kept lists again (only lists written here: ' + vk4.join(', ') + ')', { vk4, kept4 });
    /* _gcPullNow(true) is still a real full pull */
    r0 = H.reads.length;
    await A.ev(() => window._gcPullNow(true)); await sleep(1000);
    const vk5 = [...new Set(valueReads(r0).flatMap(r => keysOf(r.q)))];
    ok(vk5.includes('customers') && vk5.includes('invs') && vk5.length > vk4.length, '_gcPullNow(true) still downloads everything (' + vk5.length + ' lists)', vk5);
    const errs = (A.errs || []).filter(e => !/Failed to fetch|NetworkError|net::|Load failed/i.test(e));
    ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
  } catch (e) { fail++; console.log('  ✗ FAIL stopped: ' + (e && e.stack || e)); }
  try { await A.b.close(); } catch (e) {}
}
console.log(`\nRESUME: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
