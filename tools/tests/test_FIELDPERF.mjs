// test_FIELDPERF.mjs <build-dir> — GrayCo Field is quick on a phone (patch FIELDPERF). Owner 11/16: "It's lagging very bad
// we're testing field view this week it needs to be tested heavy."
// An emulated iPhone (iPhone user agent, 390×844, touch) with the CPU slowed 4× (CDP Emulation.setCPUThrottlingRate) and a
// company-sized made-up data set (hundreds of jobs, leads, invoices, schedule rows, to-dos):
//  1. boot: a signed-in open (the Home Screen app opened again) shows GrayCo Field's home with job cards within BOOT_MS;
//  2. taps: job card → job page, ☰ More, 📸 Photos, Jobs, Approvals, Messages, Home, the job page's tiles — each one is on
//     screen within TAP_MS of the finger (pointerdown → the frame that shows it), no long task over LONG_MS in between;
//  3. idle: 10 s on the Field home keeps the main thread mostly free (long tasks ≤ IDLE_MS in total);
//  4. click-through: every bottom-bar tab, every home tile, every ☰ More item and every job-page tile is tapped; each opens
//     something, closes again, leaves nothing stuck on the screen (no sheet / overlay / splash left over) and no page error.
// Budgets (ms, env; a regression guard at CPU ×4 — see below): BOOT_MS 20000 · TAP_MS 450 (median of REPS=3) · LONG_MS 500 ·
// IDLE_MS 4500; the goal on a phone is ~150 ms a tap (printed). RATE (CPU slow-down, 4). GC_WORLD = a JSON data
// set ({ key: value }) to use instead of the made-up one. Offline harness, nothing leaves the machine.
// Usage: node test_FIELDPERF.mjs <dir with index.html>   (ONLY=boot,taps,idle,click)
import fs from 'fs'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDPERF.mjs <dir with index.html>'); process.exit(2); }
/* Budgets at CPU ×4 in this harness (a regression guard; measured 11/16, iPhone emulation, 550 jobs: main r35x taps 414–1152 ms
   median, this build 129–314 ms; idle 3.9 vs 3.7 s of long tasks per 10 s; boot 13–16 s, bound by parsing the 22 MB page).
   The goal on a real phone is a tap answered within ~150 ms (TAP_TARGET, printed). */
const BOOT_MS = +(process.env.BOOT_MS || 20000), TAP_MS = +(process.env.TAP_MS || 450), TAP_TARGET = 150, LONG_MS = +(process.env.LONG_MS || 500), IDLE_MS = +(process.env.IDLE_MS || 4500), RATE = +(process.env.RATE || 4), REPS = +(process.env.REPS || 3), TILE_MS = +(process.env.TILE_MS || 1500);   /* a job-page tile opens a whole sheet (🛡 Claim info: ~1 s at ×4 on main too) */
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null; const want = k => !ONLY || ONLY.includes(k);
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;
const PM = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === 'u-sbiffle');
const ADMIN = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === 'u-wesley');

/* ── a company-sized made-up data set ── */
function world(){
  if (process.env.GC_WORLD && fs.existsSync(process.env.GC_WORLD)) return JSON.parse(fs.readFileSync(process.env.GC_WORLD, 'utf8'));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const pick = a => a[Math.floor(rnd() * a.length)];
  const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const PMS = ['Sample PM', 'Riley Mockett', 'Pat Sample', 'Sam Placeholder'];
  const ST = ['Active', 'Active', 'Complete', 'Closed', 'On Hold', 'Bidding'];
  const projects = [], leads = [], invs = [], schedule = [], tasks = [], customers = [];
  for (let i = 0; i < 550; i++) projects.push({ id: 'P' + i, po: 'PO-' + (5000 + i), name: 'Demo Job ' + i + ' ' + pick(['Kitchen', 'Roof', 'Bath', 'Siding', 'Water loss', 'Deck']), client: 'Sample Customer ' + i, address: (100 + i) + ' Demo St', pm: pick(PMS), status: pick(ST), contract: Math.round(rnd() * 60000), contractSigned: rnd() > 0.2, startDate: day(-Math.round(rnd() * 200)), type: pick(['Residential Reno', 'Roofing', 'Insurance', 'Commercial']), notes: 'Made-up notes '.repeat(20), items: Array.from({ length: 8 }, (_, k) => ({ d: 'Line ' + k, q: k + 1, p: 100 + k })) });
  for (let i = 0; i < 400; i++) leads.push({ id: 'L' + i, name: 'Lead ' + i, client: 'Lead Customer ' + i, phone: '901555' + String(1000 + i), status: pick(['New', 'Contacted', 'Estimate', 'Won', 'Lost']), createdAt: day(-Math.round(rnd() * 90)), estimator: pick(PMS), type: 'Roofing' });
  for (let i = 0; i < 300; i++) invs.push({ id: 'I' + i, pid: 'P' + Math.floor(rnd() * 550), num: 'INV-' + i, amount: Math.round(rnd() * 9000), status: pick(['Sent', 'Paid', 'Draft']), date: day(-Math.round(rnd() * 120)) });
  for (let i = 0; i < 400; i++) { const p = 'P' + Math.floor(rnd() * 550), d = day(Math.round(rnd() * 20 - 10)); schedule.push({ id: 'S' + i, pid: p, projectId: p, date: d, start: d, end: d, title: pick(['Demo', 'Drywall hang', 'Paint', 'Roof tear-off', 'Inspection']) }); }
  for (let i = 0; i < 1500; i++) tasks.push({ id: 'T' + i, text: 'Made-up to-do ' + i, done: rnd() > 0.6, createdAt: day(-Math.round(rnd() * 60)), assignee: pick(PMS), pid: 'P' + Math.floor(rnd() * 550) });
  for (let i = 0; i < 320; i++) customers.push({ id: 'C' + i, name: 'Sample Customer ' + i, phone: '901555' + String(2000 + i), address: (100 + i) + ' Demo St' });
  for (let i = 0; i < 6; i++) schedule.push({ id: 'ST' + i, pid: 'P' + i, projectId: 'P' + i, date: day(0), start: day(0), end: day(0), title: 'Today on site' });
  projects.slice(0, 6).forEach(p => { p.pm = 'Sample PM'; p.status = 'Active'; });
  return { projects, leads, invs, schedule, gc_office_tasks: tasks, customers, punch: [], timesheets: [], estimates: [], expenses: [] };
}
function seed(){
  H.resetCloud();
  const w = world();
  for (const [k, v] of Object.entries(w)) if (k !== 'users') H.cset(k, v);
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u3', name: 'Sample PM', email: PM, role: 'Project Manager', active: true },
    { id: 'u4', name: 'Riley Mockett', role: 'Project Manager', active: true }, { id: 'u5', name: 'Pat Sample', role: 'Project Manager', active: true }, { id: 'u6', name: 'Sam Placeholder', role: 'Estimator', active: true }]);
  /* the jobs this PM runs keep his name (a data set from GC_WORLD uses its own names) */
  const P = H.cget('projects'); if (Array.isArray(P) && !P.some(p => p && p.pm === 'Sample PM')) { P.slice(0, 120).forEach(p => { if (p) p.pm = 'Sample PM'; }); H.cset('projects', P); }
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const INIT = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', ${JSON.stringify(IPHONE)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); d(Navigator.prototype, 'userAgentData', undefined);
  const fp = window.__fp = { lt: [], first: 0 };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) fp.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  const iv = setInterval(() => { if (!fp.first && document.querySelector('#_gcJobPick.gc-fh .fh-job')) fp.first = Math.round(performance.now()); if (fp.first) clearInterval(iv); }, 25);
  document.addEventListener('pointerdown', () => { fp.tap = performance.now(); }, true);
})()`;
const HOME = () => {
  document.querySelectorAll('#_gcJobDash,._gcSheetOv,.gcfp-sheet,.gc-fh-sheet,.gc-ra-sheet,#gcuOv,#_gcTD2Ov').forEach(o => o.remove());
  try { window._gcPhotos && window._gcPhotos.close && window._gcPhotos.close(); } catch (e) {}
  if (!document.querySelector('#_gcJobPick.gc-fh')) window._gcField.open();
};
/* everything that can sit on top of the Field home */
const LAYERS = () => [...document.querySelectorAll('body > *')].filter(e => {
  if (/^(SCRIPT|STYLE|LINK|NOSCRIPT)$/.test(e.tagName) || e.id === 'root' || e.id === '_gcJobPick' || e.id === 'gc-fh-tabs') return false;
  const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
  const r = e.getBoundingClientRect(); return (cs.position === 'fixed' || cs.position === 'absolute') && r.width >= innerWidth * 0.8 && r.height >= innerHeight * 0.5;
}).map(e => (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(/\s+/).slice(0, 2).join('.') : '') || e.tagName);

let c = null, cdp = null;
async function phone(){
  c = await H.computer('PERF', { build, mobile: true, init: [INIT] });
  cdp = await c.ctx.newCDPSession(c.page());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
}
async function reopen(){
  await c.page().reload({ waitUntil: 'commit', timeout: 180000 });
  await H.waitFor(c, () => window.__fp && window.__fp.first, null, 180000);
  return c.ev(() => ({ first: window.__fp.first, lt: window.__fp.lt.slice() }));
}
/* tap through Playwright's touchscreen, time pointerdown → the frame that shows the result */
async function tapTime(sel, seen){
  const loc = c.page().locator(sel).first();
  if (!(await loc.count())) return { missing: true };
  await c.ev(() => { window.__fp.tap = 0; window.__fp.lt0 = window.__fp.lt.length; });
  await loc.tap({ timeout: 8000 });
  return c.ev(async src => {
    const f = new Function('return (' + src + ')()'); const t = performance.now();
    while (performance.now() - t < 10000) { let v = false; try { v = f(); } catch (e) {} if (v) break; await new Promise(r => requestAnimationFrame(r)); }
    await new Promise(r => requestAnimationFrame(r));
    let okv = false; try { okv = !!f(); } catch (e) {}
    return { ms: Math.round(performance.now() - (window.__fp.tap || t)), ok: okv, lt: window.__fp.lt.slice(window.__fp.lt0).map(x => x[1]) };
  }, seen.toString());
}
const W = [];
try {
  seed(); await phone(); W.push(c);
  await H.signIn(c, PM, 20000);
  ok(!!(await H.waitFor(c, () => window.__fp && window.__fp.first, null, 180000)), 'the PM\'s iPhone opens GrayCo Field after sign-in');
  if (want('boot')) {
    const b1 = await reopen(); await sleep(4000); const b2 = await reopen();
    const before = b2.lt.filter(x => x[0] <= b2.first);
    console.log(`    boot (signed-in open, CPU ×${RATE}): Field home with job cards at ${b1.first} / ${b2.first} ms; long tasks before it ${before.length} (${before.reduce((a, x) => a + x[1], 0)} ms)`);
    ok(b2.first > 0 && b2.first <= BOOT_MS, `boot: GrayCo Field's home on screen within ${BOOT_MS} ms of opening (${b2.first} ms)`, b2.first);
  }
  await sleep(6000);   /* the open's own first work settles */
  if (want('idle')) {
    const n0 = await c.ev(() => window.__fp.lt.length); await sleep(10000);
    const lt = await c.ev(n => window.__fp.lt.slice(n), n0);
    const sum = lt.reduce((a, x) => a + x[1], 0);
    console.log(`    idle 10 s on the Field home: ${lt.length} long tasks, ${sum} ms ${JSON.stringify(lt.map(x => x[1]))}`);
    ok(sum <= IDLE_MS, `idle: 10 s on the Field home keeps the phone free (long tasks ${sum} ms ≤ ${IDLE_MS})`, lt);
  }
  if (want('taps')) {
    const T = [
      ['job card → job page', '#_gcJobPick.gc-fh .fh-job .fh-n', () => !!document.getElementById('_gcJobDash')],
      ['☰ More', '#gc-fh-tabs [data-t="more"]', () => !!document.querySelector('.gc-fh-sheet,.gc-ra-sheet')],
      ['📸 Photos', '#gc-fh-tabs [data-t="photos"]', () => !!document.getElementById('gcuOv') || !!(window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open)],
      ['Jobs', '#gc-fh-tabs [data-t="jobs"]', () => !!document.querySelector('#_gcJobPick ._jpItem')],
      ['Approvals', '#gc-fh-tabs [data-t="appr"]', () => !!document.querySelector('.gc-fh-sheet,._gcSheetOv,.gcfp-sheet,.gc-ra-sheet,#_gcApprOv,[id*="ppr"][id$="Ov"]') || !document.querySelector('#_gcJobPick.gc-fh') || /approv/i.test(localStorage.getItem('grayco_view') || '')],
      ['Messages', '#gc-fh-tabs [data-t="msgs"]', () => !!document.querySelector('.gc-fh-sheet,._gcSheetOv,.gcfp-sheet,.gc-ra-sheet')],
      ['Home', '#gc-fh-tabs [data-t="home"]', () => !!document.querySelector('#_gcJobPick.gc-fh .fh-job')]
    ];
    for (const [label, sel, seen] of T) {
      const runs = [];
      for (let k = 0; k < REPS; k++) { await c.ev(HOME); await sleep(1500); const r = await tapTime(sel, seen); if (r.missing) break; runs.push(r); }
      if (!runs.length) { console.log('    (' + label + ': not on this role\'s bar)'); continue; }
      const ms = runs.map(r => r.ok ? r.ms : 99999), m = med(ms), lt = med(runs.map(r => Math.max(0, ...r.lt)));
      console.log(`    tap ${label}: median ${m} ms ${JSON.stringify(ms)} (target ${TAP_TARGET} ms); longest task (median) ${lt} ms`);
      ok(runs.every(r => r.ok), `tap ${label}: opens every time`, runs.map(r => r.ok));
      ok(m <= TAP_MS, `tap ${label}: on screen in ${m} ms, median of ${runs.length} (≤ ${TAP_MS})`, ms);
      ok(lt <= LONG_MS, `tap ${label}: longest task while it opens ${lt} ms, median (≤ ${LONG_MS})`, runs.map(r => r.lt));
    }
    /* the job page's tiles */
    await c.ev(HOME); await sleep(1200);
    await c.page().locator('#_gcJobPick.gc-fh .fh-job .fh-n').first().tap(); await H.waitFor(c, () => !!document.querySelector('#_gcJobDash .gcfp-grid'), null, 15000); await sleep(1500);
    const tiles = await c.ev(() => [...document.querySelectorAll('#_gcJobDash .gcfp-grid > button')].map((b, i) => ({ i, t: b.textContent.trim().slice(0, 30), shown: !!b.getClientRects().length && getComputedStyle(b).display !== 'none' })).filter(x => x.shown));   /* (FIELDMORE keeps some tiles in the overflow) */
    for (const tl of tiles.slice(0, 12)) {
      await c.ev(() => { document.querySelectorAll('._gcSheetOv,.gcfp-sheet,.gc-fh-sheet,#gcuOv').forEach(o => o.remove()); try { window._gcPhotos && window._gcPhotos.close && window._gcPhotos.close(); } catch (e) {} }); await sleep(900);
      if (!(await c.ev(() => !!document.querySelector('#_gcJobDash .gcfp-grid')))) { await c.ev(() => window._gcJobDashboard((window._gcCurrentJob || {}).id)); await sleep(1200); }
      const before = await c.ev(() => document.body.children.length + ':' + (document.querySelector('._gcSheetOv,.gcfp-sheet,.gc-fh-sheet,#gcuOv') ? 1 : 0));
      const r = await tapTime('#_gcJobDash .gcfp-grid > button >> nth=' + tl.i, new Function('return () => (document.body.children.length + ":" + (document.querySelector("._gcSheetOv,.gcfp-sheet,.gc-fh-sheet,#gcuOv,#_gcTD2Ov") ? 1 : 0)) !== ' + JSON.stringify(before) + ' || !document.querySelector("#_gcJobDash .gcfp-grid")')());
      console.log(`    job tile ${tl.t}: ${r.ms} ms${r.ok ? '' : ' (nothing new seen)'}; long tasks ${JSON.stringify(r.lt)}`);
      ok(!r.ok || r.ms <= TILE_MS, `job tile "${tl.t}": answers in ${r.ms} ms (≤ ${TILE_MS})`, r);
      ok(Math.max(0, ...(r.lt || [])) <= TILE_MS, `job tile "${tl.t}": no long task over ${TILE_MS} ms`, r.lt);
    }
  }
  if (want('click')) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });   /* the walk-through checks behaviour, not speed */
    const e0 = c.errs.length;
    const items = [];
    await c.ev(HOME); await sleep(1200);
    for (const t of await c.ev(() => [...document.querySelectorAll('#gc-fh-tabs [data-t]')].map(b => b.getAttribute('data-t')))) items.push(['bar ' + t, '#gc-fh-tabs [data-t="' + t + '"]']);
    for (const t of await c.ev(() => [...document.querySelectorAll('#_gcJobPick.gc-fh .fh-tiles [data-tile]')].map(b => b.getAttribute('data-tile')))) items.push(['tile ' + t, '#_gcJobPick.gc-fh .fh-tiles [data-tile="' + t + '"]']);
    for (const [label, sel] of items) {
      await c.ev(HOME); await sleep(700);
      const loc = c.page().locator(sel).first();
      if (!(await loc.isVisible().catch(() => false))) { ok(true, label + ': (not shown for this role)'); continue; }
      const e1 = c.errs.length;
      await loc.tap({ timeout: 6000 }).catch(e => ok(false, label + ': tap failed', String(e).slice(0, 200)));
      await sleep(1300);
      const opened = await c.ev(() => !!document.querySelector('#_gcJobDash,._gcSheetOv,.gcfp-sheet,.gc-fh-sheet,.gc-ra-sheet,#gcuOv,#_gcTD2Ov,#_gcJobPick ._jpItem') || !document.documentElement.classList.contains('_fieldmode') || !document.querySelector('#_gcJobPick.gc-fh'));
      ok(opened || /home/.test(label), label + ': opens something', await c.ev(LAYERS));
      ok(c.errs.length === e1, label + ': no page error', c.errs.slice(e1));
      await c.ev(() => { if (!document.documentElement.classList.contains('_fieldmode') && window._gcChooseView) window._gcChooseView('field'); });
      await c.ev(HOME); await sleep(1000);
      const left = await c.ev(LAYERS);
      ok(!left.length && (await c.ev(() => !!document.querySelector('#_gcJobPick.gc-fh') && !document.getElementById('gc-fb-splash'))), label + ': closed again — nothing stuck on the screen', left);
    }
    /* ☰ More: every item */
    await c.ev(HOME); await sleep(800);
    await c.page().locator('#gc-fh-tabs [data-t="more"]').first().tap();
    await H.waitFor(c, () => !!document.querySelector('.gc-fh-sheet,.gc-ra-sheet'), null, 8000);
    const more = await c.ev(() => [...document.querySelectorAll('.gc-fh-sheet button, .gc-ra-sheet button')].map((b, i) => ({ i, t: b.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), close: b.hasAttribute('data-ra-close') || /^(✕|×|close|cancel)$/i.test(b.textContent.trim()) })).filter(x => x.t && !x.close));
    console.log('    ☰ More has ' + more.length + ' items');
    ok(more.length >= 4, '☰ More lists its items', more.map(x => x.t));
    for (const m of more) {
      if (/sign out|log out|desk view|use desk/i.test(m.t)) continue;   /* (signing out / the Desk are tested elsewhere) */
      await c.ev(HOME); await sleep(500);
      await c.ev(() => { const b = document.querySelector('#gc-fh-tabs [data-t="more"]'); if (b) b.click(); }); await sleep(700);
      const e1 = c.errs.length;
      const hit = await c.ev(t => { const b = [...document.querySelectorAll('.gc-fh-sheet button, .gc-ra-sheet button')].find(x => x.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) === t); if (!b) return false; b.click(); return true; }, m.t);
      if (!hit) { ok(true, '☰ More · ' + m.t + ': (not on the sheet this time)'); continue; }
      await sleep(1300);
      ok(c.errs.length === e1, '☰ More · ' + m.t + ': no page error', c.errs.slice(e1));
      await c.ev(() => { document.querySelectorAll('#gc-dm-ask').forEach(o => o.remove()); if (!document.documentElement.classList.contains('_fieldmode') && window._gcChooseView) window._gcChooseView('field'); });
      await sleep(400); await c.ev(HOME); await sleep(900);
      const left = await c.ev(LAYERS);
      ok(!left.length, '☰ More · ' + m.t + ': closed again — nothing stuck on the screen', left);
    }
    ok(c.errs.length === e0, 'the walk-through: no page errors', c.errs.slice(e0, e0 + 5));
  }
  /* ── 5. the owner's Field Home (admin: THIS WEEK tiles + "All jobs") stays put for 60 s while data keeps arriving ── */
  if (want('home')) {
    await c.close().catch(() => {}); W.length = 0;
    seed(); await phone(); W.push(c);
    await H.signIn(c, ADMIN, 20000);
    const up = await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh .gc-ra-bot .fh-job'), null, 180000);
    ok(!!up, 'admin on the iPhone: GrayCo Field Home with "All jobs"');
    await sleep(6000);
    await c.ev(() => { const el = document.getElementById('_gcJobPick'); el.scrollTop = 400; });
    await sleep(500);
    /* every animation frame for 60 s: is the list there, did the page jump; every 3 s the jobs list arrives again from a
       "sync" (a new list, one job's progress changed — the home is drawn again), and the CRM's own loops keep running */
    const st = await c.ev(async () => {
      const el = document.getElementById('_gcJobPick'); const out = { frames: 0, empty: 0, jumps: 0, emptyRuns: [], ticks: 0, start: el.scrollTop };
      let run = 0, lastTop = el.scrollTop; const t0 = performance.now(); let nextTick = t0 + 3000, k = 0;
      while (performance.now() - t0 < 60000) {
        await new Promise(r => requestAnimationFrame(r));
        const home = document.getElementById('_gcJobPick');
        const n = home ? home.querySelectorAll('.gc-ra-bot .fh-job').length : 0;
        out.frames++;
        if (!n) { out.empty++; run++; } else if (run) { out.emptyRuns.push(run); run = 0; }
        if (home && Math.abs(home.scrollTop - lastTop) > 50) out.jumps++;
        if (home) lastTop = home.scrollTop;
        if (performance.now() > nextTick) {
          nextTick += 3000; out.ticks++; k++;
          try { window._setProjects(prev => (prev || []).map((p, i) => i === k % 20 ? Object.assign({}, p, { pct: ((p.pct || 0) + 5) % 100, updatedAt: new Date().toISOString() }) : p)); } catch (e) { out.err = String(e); }
        }
      }
      if (run) out.emptyRuns.push(run);
      out.end = (document.getElementById('_gcJobPick') || {}).scrollTop;
      return out;
    });
    console.log(`    admin Home 60 s: ${st.frames} frames, ${st.ticks} data arrivals, frames without the list ${st.empty} ${JSON.stringify(st.emptyRuns.slice(0, 10))}, scroll jumps ${st.jumps} (${st.start} → ${st.end})`);
    ok(st.frames > 100 && st.empty === 0, `admin Home: "All jobs" never disappears for a single frame in 60 s with data arriving every 3 s (${st.empty} empty frames)`, st);
    ok(st.jumps === 0, `admin Home: the page never jumps while the data arrives (${st.jumps})`, st);
    const n0 = await c.ev(() => window.__fp.lt.length); await sleep(10000);
    const lt = await c.ev(n => window.__fp.lt.slice(n), n0); const sum = lt.reduce((a, x) => a + x[1], 0);
    console.log(`    admin idle 10 s on Home: ${lt.length} long tasks, ${sum} ms ${JSON.stringify(lt.map(x => x[1]))}`);
    ok(sum <= IDLE_MS, `admin idle: 10 s on Home keeps the phone free (long tasks ${sum} ms ≤ ${IDLE_MS})`, lt);
    await c.ev(() => { document.getElementById('_gcJobPick').scrollTop = 0; }); await sleep(800);
    const r = await tapTime('#_gcJobPick.gc-fh .gc-ra-bot .fh-job .fh-n', () => !!document.getElementById('_gcJobDash'));
    console.log(`    admin tap All jobs → job page: ${r.ms} ms; long tasks ${JSON.stringify(r.lt)}`);
    ok(r.ok && r.ms <= TAP_MS, `admin: a job in "All jobs" opens in ${r.ms} ms (≤ ${TAP_MS})`, r);
    ok(!c.errs.length, 'admin Home: no page errors', c.errs.slice(0, 3));
  }
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const x of W) await x.close().catch(() => {});
console.log(`FIELDPERF ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
