// test_FIELDPERF.mjs <build-dir> — patch FIELDPERF: GrayCo Field's Home on the owner's iPhone (admin, Field view) keeps
// its numbers and buttons while it stops rebuilding the same figures several times a second.
//   Phone 390x844 (iPhone UA, touch), CPU throttled GC_RATE (default 5x) through CDP, localStorage capped at Safari's
//   ~2.75 M characters (QuotaExceededError past it, so LSGUARD's clean-ups run as on the phone), the real-data mirror
//   (GC_MIRROR) in the offline harness (GC_HARNESS) with a fake cloud — nothing is written anywhere else.
//   Budget: total long-task time in a GC_WATCH_MS (default 30 s) idle window on the Home ≤ GC_LT_BUDGET ms (default 15000).
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const RATE = +(process.env.GC_RATE || 5), WATCH = +(process.env.GC_WATCH_MS || 30000), BUDGET = +(process.env.GC_LT_BUDGET || 15000), CAP = 2750000;
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDPERF.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };

/* ── static ── */
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(html.includes('__GC_PATCH_FIELDPERF__'), 'FIELDPERF is in');
ok(/function current\(\)\{\n\s+var now = Date\.now\(\); if \(memo && now - memo\.at < 800\) return memo;/.test(html) && html.includes('sameIn(inp, memoIn)'), 'the approval set is reused only while its inputs are the same (at most 5 s)');
ok(html.includes('window._gcApprovalSetFresh = function(){ memo = null; memoIn = null; }'), '_gcApprovalSetFresh still drops the cached set');
ok(html.includes('var fk = fpKey(a), th, bh;') && html.includes('function fpKey(a){'), "ROLEAPPS' Home HTML is kept while nothing it shows changed");
ok(html.includes('function scoreNums0(){') && html.includes('var SNC = null'), '"This week" figures are reused while the lists are the same');
ok((html.match(/gc_fieldperf_off/g) || []).length >= 3, 'kill switch gc_fieldperf_off on each part');

const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset } = await import(pathToFileURL(HARNESS).href);
const EMAIL = 'wjohnson@grayco-cs.com';
resetCloud();
for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) if (r && r.key && !/^_probe/.test(r.key)) cset(r.key, r.v !== undefined ? r.v : r.value);

const c = await computer('FPT', { mobile: true, build });
await c.ctx.addInitScript(cap => {
  window.__lt = [];
  try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  const SP = Storage.prototype, set = SP.setItem, get = SP.getItem, rem = SP.removeItem; let total = -1;
  const isLS = s => { try { return s === window.localStorage; } catch (e) { return false; } };
  const tot = s => { if (total < 0) { total = 0; for (let i = 0; i < s.length; i++) { const k = s.key(i); total += k.length + (get.call(s, k) || '').length; } } return total; };
  SP.setItem = function(k, v){ if (!isLS(this)) return set.call(this, k, v); k = String(k); v = String(v); const old = get.call(this, k), d = (k.length + v.length) - (old == null ? 0 : k.length + old.length), t = tot(this);
    if (d > 0 && t + d > cap) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); set.call(this, k, v); total = t + d; };
  SP.removeItem = function(k){ if (isLS(this)) { const old = get.call(this, k); if (old != null) total = tot(this) - String(k).length - old.length; } return rem.call(this, k); };
}, CAP);
const p = c.page();
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) {
  await p.locator('#gc-auth-email').fill(EMAIL); await p.locator('#gc-auth-password').fill(ACCOUNTS[EMAIL].pw); await sleep(300);
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
}
await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 180000, 400);
const home = await waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh .gc-ra-q'), null, 90000, 300);
ok(!!home, 'a phone signed in as the admin opens on GrayCo Field\'s Home with the admin\'s quick buttons');
await sleep(12000);
for (let i = 0; i < 3; i++) { const l = p.locator('button:visible', { hasText: /^(Later|Got it!?|Skip|Not now)$/ }).first(); if (!(await l.count())) break; await l.click({ timeout: 2000 }).catch(() => {}); await sleep(300); }
const s = await p.context().newCDPSession(p); await s.send('Emulation.setCPUThrottlingRate', { rate: RATE });
await sleep(5000);
const snap = () => p.evaluate(() => { const h = document.querySelector('#_gcJobPick.gc-fh'); if (!h) return null;
  return { secs: [...h.querySelectorAll('.fh-sec > span')].map(x => x.textContent.trim()), q: [...h.querySelectorAll('.gc-ra-q [data-ra-a]')].map(b => b.textContent.trim()), jobs: h.querySelectorAll('.gc-ra-bot .fh-job').length, jobBtns: h.querySelectorAll('.gc-ra-bot .fh-job [data-fa]').length,
    badge: (document.getElementById('gc-fh-badge') || {}).textContent || '', sync: (document.getElementById('gc-fh-sync') || {}).textContent || '' }; });
const S0 = await snap();
console.log('HOME', JSON.stringify(S0));
ok(S0 && S0.secs.some(x => /Missing job data \(\d+\)/.test(x)) && S0.secs.some(x => /My approvals \(\d+\)/.test(x)) && S0.secs.some(x => /This week/i.test(x)) && S0.secs.some(x => /All jobs \(\d+\)/.test(x)), 'the Home has Missing job data · My approvals · This week · All jobs', S0 && S0.secs);
ok(S0 && S0.jobs > 0 && S0.jobBtns >= S0.jobs * 4, 'each job card has its buttons (Customer / Sub portal, Photos, Message, + open)', S0 && [S0.jobs, S0.jobBtns]);

/* ── the idle budget on the throttled phone ── */
const lt0 = await p.evaluate(() => window.__lt.length);
await sleep(WATCH);
const lts = await p.evaluate(n => window.__lt.slice(n), lt0);
const sum = lts.reduce((a, x) => a + x[1], 0), worst = Math.max(0, ...lts.map(x => x[1]));
console.log('IDLE', JSON.stringify({ rate: RATE, watchMs: WATCH, longTasks: lts.length, sumMs: sum, worstMs: worst, perMin: Math.round(sum * 60000 / WATCH) }));
ok(sum <= BUDGET, 'long tasks on the idle Home at ' + RATE + 'x: ' + sum + ' ms in ' + WATCH / 1000 + ' s (budget ' + BUDGET + ' ms), worst ' + worst + ' ms');
const S1 = await snap();
ok(JSON.stringify(S1) === JSON.stringify(S0), 'nothing on the Home changed while nothing changed', [S0, S1]);

/* ── the figures follow the data at once ── */
const same = await p.evaluate(() => { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); const a = window._gcApprovalCurrent().total, b = window._gcApprovalSet().total; return [a, b, window._gcApprovalCount()]; });
ok(same[0] === same[1] && same[1] === same[2], 'the cached approval set is the live one (' + same.join(' / ') + ')');
const cnt = () => p.evaluate(() => window._gcApprovalCount());
const b0 = await cnt();
await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]'); l.push({ id: 'fpt-' + Date.now(), status: 'pending_pm', subName: 'FIELDPERF test sub', pmName: 'x', amount: 1 }); localStorage.setItem('gc_sub_approvals', JSON.stringify(l)); });
await sleep(900); const b1 = await cnt();
ok(b1 === b0 + 1, 'a new pending sub invoice counts within a second, not after the 5 s reuse (' + b0 + ' → ' + b1 + ')');
await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]').filter(x => !/^fpt-/.test(x.id)); localStorage.setItem('gc_sub_approvals', JSON.stringify(l)); });
await sleep(900); const b2 = await cnt();
ok(b2 === b0, 'and leaves the count when it is gone (' + b2 + ')');
await p.evaluate(() => { const c = window._crm, pj = (c.projects || [])[0]; c.invoices = (c.invoices || []).concat([{ id: 'fpt-inv', type: 'client', status: 'draft', pid: pj && pj.id }]); });
await sleep(900); const b3 = await cnt();
await p.evaluate(() => { const c = window._crm; c.invoices = c.invoices.filter(x => x.id !== 'fpt-inv'); });
await sleep(900); const b4 = await cnt();
ok(b3 === b0 + 1 && b4 === b0, 'a new invoice to sign off counts within a second and leaves within a second', [b0, b3, b4]);

/* ── buttons still work ── */
const tap = async loc => { if (!(await loc.count())) return false; await loc.first().click({ timeout: 10000 }); return true; };
const fixed = () => p.evaluate(() => Array.from(document.body.children).filter(e => e.id !== '_gcJobPick' && e.id !== 'gc-fh-tabs' && getComputedStyle(e).position === 'fixed' && e.offsetHeight > 200 && getComputedStyle(e).display !== 'none').map(e => e.id || e.className).join(','));
const backHome = async () => { await p.evaluate(() => document.querySelectorAll('.gc-fh-sheet,.gc-ra-sheet,._gcSheetOv').forEach(x => x.remove())); await tap(p.locator('#gc-fh-tabs [data-t="home"], #gc-fh-tabs button', { hasText: 'Home' })); await sleep(2500); return !!(await waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh .gc-ra-q'), null, 20000, 300)); };
await tap(p.locator('#_gcJobPick .gc-ra-q [data-ra-a]', { hasText: 'Approvals' })); await sleep(3000);
const f1 = await fixed(); ok(!!f1 || !(await p.locator('#_gcJobPick.gc-fh').count()), 'the Approvals quick button opens the approvals', f1);
ok(await backHome(), 'Home comes back');
const jb = p.locator('#_gcJobPick .gc-ra-bot .fh-job [data-fa="fp-photos"], #_gcJobPick .gc-ra-bot .fh-job [data-fa^="fp-"]').first();
const jbName = await jb.getAttribute('data-fa').catch(() => null);
await p.evaluate(() => { window.__before = Array.from(document.body.children); });
await tap(jb); await sleep(3500);
const f2 = await p.evaluate(() => Array.from(document.body.children).filter(e => !window.__before.includes(e) && getComputedStyle(e).display !== 'none' && e.offsetHeight > 100).map(e => e.id || e.className).join(','));
ok(!!jbName && (!!f2 || !(await p.locator('#_gcJobPick.gc-fh').count())), 'a job card\'s ' + jbName + ' button opens its screen', f2);
ok(await backHome(), 'Home comes back again');
await tap(p.locator('#_gcJobPick .gc-ra-bot .fh-job [data-fa="open"]')); await sleep(3500);
ok(!!(await p.locator('#_gcJobDash').count()), 'tapping a job\'s name opens the job');
ok(await backHome(), 'and Home comes back');
const S2 = await snap();
ok(S2 && S2.jobs === S0.jobs && S2.secs.length === S0.secs.length, 'the same Home after the taps', [S0 && S0.secs, S2 && S2.secs]);
ok(!c.errs.length, 'no page errors', c.errs.slice(0, 4));
await c.b.close();
console.log('RESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
