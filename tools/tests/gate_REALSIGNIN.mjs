// gate_REALSIGNIN.mjs <build-dir> <mirror.json> [out.json] — permanent release gate: the owner signs in on REAL data.
// Found 10/29 (r15 rolled back, then r14 froze too): every gate passed on the 37 MB mock seed, but the owner's sign-in froze
// on production data ("Opening the CRM as Wesley Johnson..." -> "page isn't responding", even in a fresh InPrivate window).
// The real rows had a shape the seed did not (approval queue items with meta.invoiceId -> APPRORDER/APPRFAST recursion).
//
// This gate serves a READ-ONLY mirror of production gc_kv (a JSON array of { key, value|v, updated_at } rows, made with GETs
// only and kept OUTSIDE git: it is customer data) through the offline mock Supabase, then for each CPU rate (CPUS, default
// "1,4,6"): a fresh browser profile, the sign-in screen, the owner's real e-mail typed and submitted, the app's own
// "Opening the CRM as ..." reload followed, and WATCH ms (default 90 s) of watching. PASS per rate when
//   * no long task over MAXTASK ms (default 2000), from any page load (they survive the reload),
//   * the page always answers within MAXTASK ms (a node-side heartbeat: a frozen page answers late or not at all),
//   * the person ends signed in with the CRM's left menu drawn.
// On a FAIL the script pauses the page a few times (CDP Debugger.pause) and prints the JS stacks: the culprit by name.
// Optional upgrade path: PREV=<older build dir> first runs the older build on the SAME profile (sign in, USE ms of use,
// sign out), then loads <build-dir> and signs in from the sign-in screen -- a browser that already holds the old state.
// Env: CPUS, MAXTASK, WATCH, WHO (default the owner), PREV, USE, GC_HARNESS (offline harness with persistent profiles),
// GC_SEED (its seed13.mjs: mockFns).  Exit code 0 = every rate PASS.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url'; import { execSync } from 'child_process';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SP + '/wUPG/harness.mjs';
const SEED = process.env.GC_SEED || path.join(path.dirname(HARNESS), 'seed13.mjs');
const H = await import(pathToFileURL(HARNESS).href); const { mockFns } = await import(pathToFileURL(SEED).href);
const { computer, sleep, cloud, ACCOUNTS } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3], OUT = process.argv[4];
if (!BUILD || !MIRROR) { console.error('usage: node gate_REALSIGNIN.mjs <build-dir> <mirror.json> [out.json]'); process.exit(2); }
const CPUS = String(process.env.CPUS || '1,4,6').split(',').map(Number), MAXTASK = +(process.env.MAXTASK || 2000), WATCH = +(process.env.WATCH || 90000);
const WHO = process.env.WHO || 'wjohnson@grayco-cs.com', PREV = process.env.PREV && path.resolve(process.env.PREV), USE = +(process.env.USE || 90000);
if (!ACCOUNTS[WHO]) ACCOUNTS[WHO] = { pw: 'Gate-Pass-1', id: 'u-gate', role: 'admin' };
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
function loadCloud(){ cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at }); }
const htmlRaw = fs.readFileSync(BUILD + '/index.html', 'utf8'), html = htmlRaw.split('\n');
const PROF = process.env.PROF !== '0';   /* a CPU profile of the whole sign-in: the busy stretches and what ran in them */
const patchAt = []; { const re = /patch ([A-Z][A-Z0-9_]{1,20})|__GC_PATCH_([A-Z0-9_]+)__/g; let m; while ((m = re.exec(htmlRaw))) patchAt.push([m.index, m[1] || m[2]]); }
const lineStart = [0]; for (let i = 0; i < htmlRaw.length; i++) if (htmlRaw.charCodeAt(i) === 10) lineStart.push(i + 1);
function nearPatch(off){ let lo = 0, hi = patchAt.length - 1, best = null; while (lo <= hi) { const mid = (lo + hi) >> 1; if (patchAt[mid][0] <= off) { best = patchAt[mid]; lo = mid + 1; } else hi = mid - 1; } return best ? best[1] : ''; }
function busyStretches(profile, minMs){
  const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map(); profile.nodes.forEach(n => (n.children || []).forEach(ch => parent.set(ch, n.id)));
  const lab = n => { const cf = n.callFrame; let w = ''; if (/index\.html/.test(cf.url) && cf.lineNumber >= 0) w = 'L' + (cf.lineNumber + 1) + ' ~' + nearPatch((lineStart[cf.lineNumber] || 0) + cf.columnNumber); else if (cf.url) w = cf.url.replace(/^.*\//, '').slice(0, 30); return (cf.functionName || '(anon)') + (w ? ' @' + w : ''); };
  let t = profile.startTime; const S = []; for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i]; S.push([t, profile.samples[i]]); }
  const runs = []; let st = null;
  for (let i = 0; i < S.length; i++) { const idle = byId.get(S[i][1]).callFrame.functionName === '(idle)'; if (!idle && st == null) st = i; if ((idle || i === S.length - 1) && st != null) { const d = (S[i][0] - S[st][0]) / 1000; if (d > minMs) runs.push([st, i, d]); st = null; } }
  return runs.sort((a, b) => b[2] - a[2]).slice(0, 5).map(([a, b, d]) => {
    const self = {}, incl = {};
    for (let i = a; i < b; i++) { const dt = S[i + 1][0] - S[i][0]; const n = byId.get(S[i][1]); const k = lab(n); self[k] = (self[k] || 0) + dt; const seen = new Set(); let cur = n.id; while (cur != null) { const kk = lab(byId.get(cur)); if (!seen.has(kk)) { seen.add(kk); incl[kk] = (incl[kk] || 0) + dt; } cur = parent.get(cur); } }
    const top = (o, n) => Object.entries(o).filter(([k]) => k !== '(root)').sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => k + ' = ' + Math.round(v / 1000) + ' ms');
    return { atMs: Math.round((S[a][0] - profile.startTime) / 1000), ms: Math.round(d), self: top(self, 10), incl: top(incl, 22) };
  });
}
const raceT = (p, ms) => Promise.race([p.then(v => ({ v }), e => ({ e })), sleep(ms).then(() => ({ timeout: true }))]);

async function typeSignIn(p){
  await p.waitForSelector('#gc-auth-email', { timeout: 120000 });
  await sleep(1500);
  for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill(WHO); await p.locator('#gc-auth-password').fill(ACCOUNTS[WHO].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === WHO) break; }
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
}
async function stacks(cd, n){
  const out = [];
  for (let s = 0; s < n; s++) {
    const paused = new Promise(r => cd.once('Debugger.paused', r));
    cd.send('Debugger.pause').catch(() => {});
    const ev = await Promise.race([paused, sleep(15000).then(() => null)]);
    if (!ev) { out.push('(no pause: idle or gone)'); continue; }
    out.push(ev.callFrames.slice(0, 12).map(f => (f.functionName || '(anon)') + ' L' + (f.location.lineNumber + 1) + ' ' + (html[f.location.lineNumber] || '').slice(Math.max(0, f.location.columnNumber - 40), f.location.columnNumber + 60).replace(/\s+/g, ' ')).join('\n      '));
    await cd.send('Debugger.resume').catch(() => {});
    await sleep(2000);
  }
  return out;
}
function killProfile(profile){   /* a frozen renderer can outlive the close: kill this profile's Chromium */
  try { execSync('ps -eo pid=,args=').toString().split('\n').filter(l => l.includes(profile) && /chrom|headless_shell/i.test(l)).forEach(l => { try { process.kill(+l.trim().split(/\s+/)[0], 'SIGKILL'); } catch (e) {} }); } catch (e) {}
}
async function one(cpu){
  loadCloud();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gcgate-'));
  const r = { cpu, build: path.basename(BUILD), prev: PREV ? path.basename(PREV) : null };
  const LT = [];
  const open = async build => {
    const c = await computer('G', { build, profile }); await mockFns(c, WHO); c.acceptConfirm = false;
    await c.ctx.exposeBinding('__gateLT', (src, at, d) => LT.push({ at, d }));
    await c.ctx.addInitScript(() => {
      try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
      try { new PerformanceObserver(l => l.getEntries().forEach(e => { try { window.__gateLT(Math.round(performance.timeOrigin + e.startTime), Math.round(e.duration)); } catch (x) {} })).observe({ type: 'longtask', buffered: true }); } catch (e) {}
    });
    for (const pg of c.ctx.pages()) if (pg !== c.page()) await pg.close().catch(() => {});
    await c.page().setViewportSize({ width: 1366, height: 768 });
    return c;
  };
  let c;
  try {
    if (PREV) {   /* the upgrade path: the older build fills this profile first */
      c = await open(PREV); const p0 = c.page();
      await p0.goto('https://app.local/index.html'); await typeSignIn(p0); await sleep(USE);
      /* the older build may itself freeze on this data (r14 did): then its state is whatever it saved before */
      const so = await raceT(p0.evaluate(() => window.__gcAuthSignOut && window.__gcAuthSignOut('Signed out.')), 20000);
      r.prevFroze = !!so.timeout; await sleep(3000);
      await raceT(c.ctx.close(), 20000); killProfile(profile); LT.length = 0;
    }
    c = await open(BUILD); const p = c.page();
    const cd = await c.ctx.newCDPSession(p); if (cpu > 1) await cd.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await cd.send('Debugger.enable', { maxScriptsCacheSize: 1e8 });   /* enabled before the freeze: a busy page can still be paused */
    if (PROF) { await cd.send('Profiler.enable'); await cd.send('Profiler.setSamplingInterval', { interval: 1000 }); await cd.send('Profiler.start'); }
    const t0 = Date.now();
    await p.goto('https://app.local/index.html');
    await typeSignIn(p); r.signInAt = Date.now() - t0;
    const hb = []; let frozen = false;
    while (Date.now() - t0 < r.signInAt + WATCH) {
      const a = Date.now(); const x = await raceT(c.page().evaluate(() => 1), MAXTASK * 3);
      hb.push(Date.now() - a); if (x.timeout) { frozen = true; break; }
      await sleep(300);
    }
    r.heartbeatMax = Math.max(...hb); r.frozen = frozen;
    r.longTasks = LT.filter(x => x.at >= t0).map(x => x.d).sort((a, b) => b - a).slice(0, 10);
    r.ltMax = r.longTasks[0] || 0;
    if (!frozen) {
      const st = await raceT(c.page().evaluate(() => ({ gate: !!document.getElementById('gc-auth-email'), nav: [...document.querySelectorAll('aside nav button')].filter(b => b.offsetParent).length, build: window.BUILD_ID })), 20000);
      r.state = st.v || null;
    }
    r.signedIn = !!(r.state && !r.state.gate && r.state.nav > 0);
    if (PROF && !frozen) { const pr = await raceT(cd.send('Profiler.stop'), 30000); if (pr.v && pr.v.profile) r.busy = busyStretches(pr.v.profile, Math.min(800, MAXTASK / 2)); }
    r.pass = !frozen && r.ltMax <= MAXTASK && r.heartbeatMax <= MAXTASK && r.signedIn;
    if (!r.pass) r.stacks = await stacks(cd, 4);
    r.errs = (c.errs || []).slice(0, 8);
  } catch (e) { r.pass = false; r.error = String(e && e.message || e).slice(0, 300); }
  await raceT(c ? c.ctx.close() : Promise.resolve(), 20000);   /* a frozen renderer can hold the close */
  killProfile(profile);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  return r;
}
const res = [];
for (const cpu of CPUS) {
  const r = await one(cpu); res.push(r);
  console.log((r.pass ? 'PASS' : 'FAIL') + ' cpu=' + cpu + 'x  ltMax=' + r.ltMax + ' ms  heartbeatMax=' + r.heartbeatMax + ' ms  frozen=' + r.frozen + '  signedIn=' + r.signedIn + (r.prevFroze ? '  (the older build froze before sign-out)' : '') + (r.error ? '  error=' + r.error : '') + '  top=' + JSON.stringify(r.longTasks || []));
  if (r.stacks) r.stacks.forEach((s, i) => console.log('   stack ' + i + ':\n      ' + s));
  if (r.busy && r.busy.length && (!r.pass || process.env.VERBOSE)) r.busy.slice(0, 3).forEach(b => console.log('   busy ' + b.ms + ' ms at +' + b.atMs + ' ms\n      self: ' + b.self.slice(0, 6).join(' | ') + '\n      incl: ' + b.incl.join(' | ')));
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
const all = res.every(r => r.pass);
console.log('REALSIGNIN ' + (all ? 'PASS' : 'FAIL') + ' (' + res.filter(r => r.pass).length + '/' + res.length + ' rates, no task over ' + MAXTASK + ' ms' + (PREV ? ', upgrade from ' + path.basename(PREV) : '') + ')');
process.exit(all ? 0 : 1);
