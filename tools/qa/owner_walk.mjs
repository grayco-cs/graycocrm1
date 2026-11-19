// owner_walk.mjs — the release QA gate: walk the CRM the way the owner and the staff use it, on the company's REAL data
// (a read-only snapshot of every gc_kv row, loaded into the offline harness's fake cloud — nothing is ever written live),
// on the devices they use (the owner's iPhone on a slow link with a slow CPU and a nearly full localStorage, a PM's iPhone,
// an office desk). Every step is timed, screenshotted and checked; the result is one HTML report, a JSON summary and a
// one-line PASS / FAIL.
//
// Usage: node tools/qa/owner_walk.mjs <build-dir> [--profile all|owner|pm|desk[,…]] [--snap <dir>] [--out <dir>] [--build <name>]
//   <build-dir>   a folder with the release candidate's index.html (the checkout's root)
//   --snap        a snapshot folder from tools/qa/snapshot.mjs (default: the newest under <out>/snap)
//   --out         where reports and screenshots go (default: the session scratchpad qa/ folder) — never the repo
//   --fresh-snap  take a new read-only snapshot first (tools/qa/snapshot.mjs)
// Env: GC_HARNESS (the offline harness_N.mjs), NODE_PATH (playwright), QA_LOCKS (folder with browser.lock / browser2.lock),
//      QA_RD (the read-only snapshot reader, see snapshot.mjs).
// Each profile runs in its own process while it holds one of the shared browser locks (other agents test too).
import fs from 'fs'; import path from 'path'; import { spawn, execFileSync } from 'child_process'; import { pathToFileURL, fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCR = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const NM = process.env.NODE_PATH || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules';
const LOCKS = process.env.QA_LOCKS || path.join(SCR, 'locks');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const flag = n => argv.includes('--' + n);
const build = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv[0]) : null;
if (!build || !fs.existsSync(path.join(build, 'index.html'))) { console.error('usage: node tools/qa/owner_walk.mjs <build-dir> [--profile all|owner|pm|desk]'); process.exit(2); }
const OUT = path.resolve(opt('out', path.join(SCR, 'qa')));
const buildName = opt('build', (() => { try { return fs.readFileSync(path.join(build, 'version.txt'), 'utf8').trim().split(/\s+/)[0].replace(/[^\w.-]/g, '_') || path.basename(build); } catch (e) { return path.basename(build); } })());
const L = await import(pathToFileURL(path.join(HERE, 'qa_lib.mjs')).href);
const { BG_TOAST, SLOW_MS } = await import(pathToFileURL(path.join(HERE, 'crawl.mjs')).href);

/* ═══════════════ parent: one child per profile (under a browser lock), then the report ═══════════════ */
if (!flag('child')) {
  if (flag('fresh-snap')) execFileSync('node', [path.join(HERE, 'snapshot.mjs'), path.join(OUT, 'snap')], { stdio: 'inherit' });
  const snapDir = opt('snap', L.latestSnap(path.join(OUT, 'snap')));
  if (!snapDir) { console.error('no snapshot: run node tools/qa/snapshot.mjs ' + path.join(OUT, 'snap') + ' (or pass --fresh-snap)'); process.exit(2); }
  let profs = String(opt('profile', 'all')).split(','); if (profs.includes('all')) profs = ['owner', 'pm', 'desk'];
  const runDir = path.join(OUT, 'runs', buildName); fs.mkdirSync(runDir, { recursive: true });
  /* the recent features and the controls they added (git history of the repo; cached per commit) */
  var featFile = path.join(runDir, 'features.json');
  { const FT = await import(pathToFileURL(path.join(HERE, 'features.mjs')).href); const repo = opt('repo', fs.existsSync(path.join(build, '.git')) ? build : path.resolve(HERE, '../..'));
    const ref = opt('ref', repo === build ? 'HEAD' : 'origin/main'); let sha = ''; try { sha = execFileSync('git', ['-C', repo, 'rev-parse', ref], { encoding: 'utf8' }).trim(); } catch (e) {}
    const cache = path.join(OUT, 'features-' + (sha || 'x').slice(0, 12) + '-' + opt('since', '2026-10-29') + '.json');
    if (!fs.existsSync(cache)) { console.log('feature inventory from ' + repo + ' ' + ref + ' …'); fs.writeFileSync(cache, JSON.stringify(FT.inventory(repo, { ref, since: opt('since', '2026-10-29') }))); }
    fs.copyFileSync(cache, featFile); }
  const results = [];
  for (const p of profs) {
    const jf = path.join(runDir, p + '.json');
    /* --rerun owner,pm: run only those again; the other profiles of this build are read back from its run folder */
    if (opt('rerun') && !String(opt('rerun')).split(',').includes(p) && fs.existsSync(jf)) { const r0 = JSON.parse(fs.readFileSync(jf, 'utf8')); const cf0 = path.join(runDir, p + '.crawl.json'); if (fs.existsSync(cf0)) { try { const c0 = JSON.parse(fs.readFileSync(cf0, 'utf8')); r0.crawl = c0.crawl || { screens: [], error: 'the crawl did not finish' + (c0.stopped ? ': ' + c0.stopped : '') }; } catch (e) {} } results.push(r0); console.log(`  ${p}: read back from ${jf}`); continue; }
    if (!flag('keep-walks')) { try { fs.unlinkSync(jf); } catch (e) {} }
    const t0 = Date.now(); let r = null;
    const keep = flag('keep-walks') && fs.existsSync(jf) && (() => { try { const j = JSON.parse(fs.readFileSync(jf, 'utf8')); return j.finished && j.steps && j.steps.length ? j : null; } catch (e) { return null; } })();
    if (keep) { r = keep; console.log(`  ${p}: walk read back (${r.steps.length} steps)`); }
    else if (!flag('crawl-only')) {
      const rc = await runLocked(p, jf, snapDir, path.join(runDir, p + '.log'), 'walk');
      try { r = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) {}
      if (!r) r = { profile: p, label: (L.PROFILES[p] || {}).label || p, steps: [], crashed: true, notes: ['the walk did not finish (exit ' + rc + ') — see ' + path.join(runDir, p + '.log')] };
      r.wallSec = Math.round((Date.now() - t0) / 1000);
      console.log(`  ${p}: ${r.steps.length} steps, ${r.steps.filter(s => s.fails.length).length} with failures (${r.wallSec}s)`);
    } else r = { profile: p, label: (L.PROFILES[p] || {}).label || p, steps: [], notes: [], crawlOnly: true, finished: true };
    if (!flag('no-crawl')) {
      const cf = path.join(runDir, p + '.crawl.json'); const reuse = flag('reuse-crawl') && fs.existsSync(cf);
      if (!reuse) { try { fs.unlinkSync(cf); } catch (e) {} }
      const t1 = Date.now(); const rc = reuse ? 0 : await runLocked(p, cf, snapDir, path.join(runDir, p + '.crawl.log'), 'crawl');
      let c = null; try { c = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch (e) {}
      r.crawl = c && c.crawl ? c.crawl : { screens: [], error: 'the crawl did not finish (exit ' + rc + ') — see ' + path.join(runDir, p + '.crawl.log') + (c && c.stopped ? ': ' + c.stopped : '') };
      const B = r.crawl.screens.flatMap(x => x.buttons);
      console.log(`  ${p} crawl: ${r.crawl.screens.length} screens, ${B.length} controls, ${B.filter(b => b.result === 'FAIL').length} FAIL, ${B.filter(b => b.result === 'SLOW').length} SLOW (${Math.round((Date.now() - t1) / 1000)}s)`);
    }
    results.push(r);
  }
  const summary = await summarize(results, snapDir, JSON.parse(fs.readFileSync(featFile, 'utf8')));
  const rep = path.join(OUT, `report-${buildName}.html`), js = path.join(OUT, `report-${buildName}.json`);
  fs.writeFileSync(js, JSON.stringify(summary, null, 1));
  fs.writeFileSync(rep, renderHTML(summary, rep));
  console.log(`report: ${rep}\nsummary: ${js}`);
  console.log(`${summary.pass ? 'PASS' : 'FAIL'} ${buildName}: ${summary.counts.steps} steps on ${results.length} profile(s), ${summary.counts.failedSteps} failed, ${summary.counts.fails} failures (${summary.counts.critical} critical, ${summary.counts.major} major, ${summary.counts.minor} minor); buttons ${summary.counts.buttons || 0}: ${summary.counts.buttonsFail || 0} FAIL (${summary.counts.dead || 0} dead), ${summary.counts.buttonsSlow || 0} SLOW${summary.crashed.length ? '; did not finish: ' + summary.crashed.join(', ') : ''}`);
  process.exit(summary.pass ? 0 : 1);
}
function runLocked(p, jf, snapDir, logf, mode){
  return new Promise(res => {
    const locks = ['browser.lock', 'browser2.lock'].map(f => path.join(LOCKS, f));
    const tryOnce = i => {
      const args = ['-w', '20', '-E', '211', locks[i], 'timeout', '3000', process.execPath, fileURLToPath(import.meta.url), build, '--child', p, '--json', jf, '--snap', snapDir, '--out', OUT, '--build', buildName, '--mode', mode || 'walk', '--crawl-min', String(opt('crawl-min', '35')), '--features', featFile].concat(opt('screens') ? ['--screens', opt('screens')] : []);
      const log = fs.openSync(logf, 'w');
      const c = spawn('flock', args, { stdio: ['ignore', log, log], env: Object.assign({}, process.env, { NODE_PATH: NM }) });
      c.on('exit', code => { fs.closeSync(log); if (code === 211) { if (i + 1 < locks.length) return tryOnce(i + 1); return setTimeout(() => tryOnce(0), 200); } res(code); });
    };
    if (!fs.existsSync(LOCKS)) { fs.mkdirSync(LOCKS, { recursive: true }); }
    tryOnce(0);
  });
}

/* ═══════════════ child: one profile's walk ═══════════════ */
const PID = opt('child'); const PROF = Object.assign({}, L.PROFILES[PID]);
PROF.__state = { console: [], pageErrors: [], notes: [], fast: true };
L.patchPlaywright(NM, () => PROF);
const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const snap = L.readSnap(opt('snap'));
const SHOTS = path.join(OUT, 'shots', buildName, PID); fs.mkdirSync(SHOTS, { recursive: true });
const R = { profile: PID, label: PROF.label, build: buildName, snap: path.basename(snap.dir), started: new Date().toISOString(), device: { viewport: PROF.viewport, dsf: PROF.dsf, ua: PROF.ua, net: PROF.net, cpu: PROF.cpu, safe: PROF.safe }, steps: [], notes: [], setup: {} };
const save = () => fs.writeFileSync(opt('json'), JSON.stringify(R, null, 1));
const OWN = /^(gc_perfrep_|gc_bootrep_|gc_adm_dev_|gc_activity_|gc_timeclock_|_probe_|gc_presence|gc_seen_|gc_lastseen|gc_device_)/;
L.loadIntoHarness(H, snap);
const acc = L.accountsFromSnap(H, snap);
if (acc.dupEmails.length) R.notes.push('users list: the same e-mail on more than one person: ' + [...new Set(acc.dupEmails)].join(', '));
const plan = L.lsPlan(snap);
R.setup.localStorage = PROF.lsFull ? { copiedFrom: 'gc_perfrep_' + plan.from, phoneChars: plan.phoneChars, phoneKeys: plan.phoneKeys, leftFree: plan.free, top: plan.top.map(([k, v]) => [k, v.length]) } : null;
const S = PROF.__state;
let A = null, page = null, lastTap = 0;
const phone = PROF.phone;

async function shot(name){
  const f = path.join(SHOTS, name + '.png');
  try {
    if (PROF.dsf !== PROF.shotScale && S.cdp) { const s = await S.cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: PROF.viewport.width, height: PROF.viewport.height, scale: PROF.shotScale } }); fs.writeFileSync(f, Buffer.from(s.data, 'base64')); }
    else await page.screenshot({ path: f });
    return path.relative(OUT, f);
  } catch (e) { return null; }
}
/* tap the way a person does: at the element's centre (a covered button gets the tap of what covers it) */
async function tapAt(x, y){ lastTap = Date.now(); if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); }
/* find a visible control by text (regex source) and/or selector, scroll it into view, return where to tap */
async function locate(q){
  return A.ev(q => {
    const rx = q.rx ? new RegExp(q.rx, q.fl || 'i') : null;
    const vis = e => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    const t = e => (e.innerText || e.getAttribute('aria-label') || e.title || e.value || '').replace(/\s+/g, ' ').trim();
    let L = [...document.querySelectorAll(q.sel || 'button,[role=button],a,[onclick],[data-ra-a],[data-t],.btn,label,summary,[tabindex]')].filter(vis);
    if (q.within) { const W = [...document.querySelectorAll(q.within)].filter(vis).pop(); L = W ? L.filter(e => W.contains(e)) : []; }
    if (rx) L = L.filter(e => rx.test(t(e)));
    if (!L.length) return null;
    /* the one on top: prefer elements whose centre hit-tests to themselves; the smallest match (not a wrapper) */
    const top = e => { const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return false; const h = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); return !!h && (e === h || e.contains(h)); };
    L.sort((a, b) => (top(b) - top(a)) || (a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height));
    const e = q.last ? L[L.length - 1] : L[0];
    if (!top(e)) e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const h = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, x)), Math.min(innerHeight - 1, Math.max(0, y)));
    const lab = x => x ? ((x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className ? '.' + x.className.split(' ')[0] : '') + ' "' + t(x).slice(0, 30) + '"') : '';
    return { x, y, text: t(e).slice(0, 60), covered: !(h && (e === h || e.contains(h))), by: h && !(e === h || e.contains(h)) ? lab(h) : '', n: L.length };
  }, q);
}
async function tap(q, st){
  if (typeof q === 'string') q = { sel: q };
  if (q instanceof RegExp) q = { rx: q.source, fl: q.flags };
  let p = await locate(q);
  if (!p) { if (q.wait) { for (let i = 0; i < q.wait / 400 && !p; i++) { await sleep(400); p = await locate(q); } } if (!p) throw new Error('could not find ' + (q.rx ? '/' + q.rx + '/' : '') + (q.sel ? ' ' + q.sel : '')); }
  await sleep(120); p = (await locate(q)) || p;
  if (p.covered && st) st.fails.push({ check: 'tap', sev: 'major', msg: `the tap on "${p.text}" landed on ${p.by} (it is covered)` });
  await tapAt(p.x, p.y); return p;
}
const has = (q) => A.ev(q => { const rx = new RegExp(q.rx, q.fl || 'i'); const L = [...document.querySelectorAll(q.sel || 'body *')].filter(e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight; }); return L.some(e => rx.test((e.innerText || '').slice(0, 2000))); }, q).catch(() => false);
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v; try { v = await (typeof fn === 'function' ? fn() : A.ev(fn)); } catch (e) { v = null; } if (v) return v; await sleep(150); } return null; };

/* the main scroller on screen (the topmost layer's) */
async function scrollEnd(){
  return A.ev(async () => {
    const vh = innerHeight; const cand = [...document.querySelectorAll('body *')].filter(e => { if (e.scrollHeight - e.clientHeight < 40) return false; const s = getComputedStyle(e); if (!/(auto|scroll)/.test(s.overflowY) || s.display === 'none' || s.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.height > vh * 0.35 && r.bottom > 0 && r.top < vh; });
    const onTop = e => { const r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, Math.max(r.top, 0) + Math.min(r.height, vh) / 2); return h && e.contains(h); };
    let sc = cand.filter(onTop).sort((a, b) => b.getBoundingClientRect().height * b.getBoundingClientRect().width - a.getBoundingClientRect().height * a.getBoundingClientRect().width)[0];
    const doc = document.scrollingElement; let n = 0;
    if (!sc && doc.scrollHeight > innerHeight + 40) sc = doc;
    if (!sc) return { scrolled: false };
    for (let i = 0; i < 40; i++) { const before = sc.scrollTop; sc.scrollTop = sc.scrollHeight; await new Promise(r => setTimeout(r, 120)); n++; if (Math.abs(sc.scrollTop - before) < 2) break; }
    return { scrolled: true, el: (sc.id ? '#' + sc.id : sc.tagName) + (typeof sc.className === 'string' && sc.className ? '.' + sc.className.split(' ')[0] : ''), h: sc.scrollHeight, n };
  }).catch(e => ({ scrolled: false, err: e.message }));
}

/* one step: run it, time it, screenshot it, check it */
const SEV = { pageerror: 'critical', unsent: 'critical', sharedwrite: 'critical', open: 'major', stuck: 'critical', notfound: 'major', navy: 'major', behind: 'major', closeback: 'major', lastbtn: 'major', floating: 'major', bytes: 'major', longtask: 'minor', console: 'minor', contrast: 'minor', tap: 'major', hidden: 'major', toggle: 'major' };
let stepN = 0;
async function step(name, o, fn){
  o = Object.assign({ passive: true, scroll: true, budget: PROF.openBudgetMs }, o || {});
  const st = { n: ++stepN, name, passive: o.passive, fails: [], warns: [], info: {}, shots: [] };
  const id = String(st.n).padStart(2, '0') + '_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
  const i0 = S.link.log.length, w0 = H.writes.length, e0 = S.pageErrors.length, c0 = S.console.length, f0 = A ? A.fn.length : 0;
  let pt0 = 0; try { pt0 = await A.ev(() => performance.now()); } catch (e) {}
  const t0 = Date.now(); let ready = null, err = null;
  try { ready = await fn(st); } catch (e) { err = e; }
  st.openMs = Date.now() - t0;
  if (err) { st.fails.push({ check: /could not find/.test(err.message) ? 'notfound' : 'stuck', msg: String(err.message).split('\n')[0].slice(0, 300) }); }
  else if (ready === false) st.fails.push({ check: 'stuck', msg: `the screen did not open within ${Math.round((o.timeout || 30000) / 1000)} s` });
  if (!err && ready !== false && o.timed !== false && st.openMs > o.budget) st.fails.push({ check: 'open', msg: `took ${(st.openMs / 1000).toFixed(1)} s to open (budget ${(o.budget / 1000).toFixed(1)} s on ${PROF.label})` });
  await sleep(o.settle || 700);
  let au = null; try { au = await A.ev(L.pageAudit, { phone, safe: PROF.safe }); } catch (e) { st.warns.push({ check: 'audit', msg: 'audit failed: ' + e.message }); }
  st.shots.push({ label: 'opened', file: await shot(id + '_a') });
  if (au) { st.fails.push(...au.fails); st.warns.push(...au.warns); Object.assign(st.info, au.info); }
  if (o.scroll && !err) {
    const sc = await scrollEnd(); st.info.scroll = sc;
    if (sc.scrolled) { await sleep(400); let a2 = null; try { a2 = await A.ev(L.pageAudit, { phone, safe: PROF.safe, atEnd: true }); } catch (e) {}
      st.shots.push({ label: 'scrolled to the end', file: await shot(id + '_b') });
      if (a2) { const seen = new Set(st.fails.map(f => f.check + f.msg)); a2.fails.forEach(f => { if (!seen.has(f.check + f.msg)) st.fails.push(Object.assign({ atEnd: true }, f)); }); if (a2.info.lastBtn) st.info.lastBtn = a2.info.lastBtn; } }
    else if (phone) { /* not scrollable: the last button must still be clear of the bar */ try { const a3 = await A.ev(L.pageAudit, { phone, safe: PROF.safe, atEnd: true }); const lb = a3.fails.find(f => f.check === 'lastbtn'); if (lb) st.fails.push(lb); if (a3.info.lastBtn) st.info.lastBtn = a3.info.lastBtn; } catch (e) {} }
  }
  // long tasks
  try { const lt = await A.ev(t => (window.__qa ? window.__qa.lt : []).filter(x => x.t >= t - 5), pt0); const big = lt.filter(x => x.ms > 200); st.info.longTasks = { n: big.length, worst: lt.reduce((m, x) => Math.max(m, x.ms), 0), total: lt.reduce((a, x) => a + x.ms, 0) };
    if (big.length) st.fails.push({ check: 'longtask', msg: `${big.length} long task(s) over 200 ms, worst ${st.info.longTasks.worst} ms (CPU ×${PROF.cpu})` }); } catch (e) {}
  // errors
  const pe = S.pageErrors.slice(e0); if (pe.length) st.fails.push({ check: 'pageerror', msg: `${pe.length} page error(s)`, list: [...new Set(pe.map(x => x.text))].slice(0, 6) });
  const ce = S.console.slice(c0).filter(x => !/Failed to load resource: the server responded with a status of 404|net::ERR_BLOCKED_BY_CLIENT|ERR_FAILED/.test(x.text)); if (ce.length) st.fails.push({ check: 'console', msg: `${ce.length} console error(s)`, list: [...new Set(ce.map(x => x.text))].slice(0, 6) });
  // network
  const net = S.link.log.slice(i0); const kv = net.filter(r => /\/rest\/v1\/gc_kv/.test(r.path));
  const down = net.reduce((a, r) => a + r.down, 0), kvDown = kv.reduce((a, r) => a + r.down, 0);
  st.info.net = { requests: net.length, kvRequests: kv.length, kvGets: kv.filter(r => r.m === 'GET').length, kvWrites: kv.filter(r => r.m !== 'GET').length, downKB: Math.round(down / 1024), kvDownKB: Math.round(kvDown / 1024), upKB: Math.round(net.reduce((a, r) => a + r.up, 0) / 1024), rawKB: Math.round(net.reduce((a, r) => a + r.raw, 0) / 1024),
    biggest: net.filter(r => r.down > 30000).sort((a, b) => b.down - a.down).slice(0, 6).map(r => `${r.m} ${r.path}${r.keys.length ? ' [' + r.keys.slice(0, 3).join(',') + ']' : ''} ${Math.round(r.down / 1024)} KB`) };
  if (down > PROF.maxStepMB * 1048576) st.fails.push({ check: 'bytes', msg: `downloaded ${(down / 1048576).toFixed(1)} MB in this step (limit ${PROF.maxStepMB} MB on ${PROF.label})`, list: st.info.net.biggest });
  const wr = H.writes.slice(w0).filter(w => w.table === 'gc_kv'); const shared = wr.filter(w => !OWN.test(w.key));
  st.info.writes = { all: wr.length, shared: [...new Set(shared.map(w => w.key))], sameValue: shared.filter(w => w.same).length };
  if (shared.length && o.passive) st.fails.push({ check: 'sharedwrite', msg: `shared list(s) uploaded with no change made on this screen: ${st.info.writes.shared.slice(0, 8).join(', ')}` + (st.info.writes.sameValue ? ` (${st.info.writes.sameValue} identical to the cloud)` : ''), list: shared.slice(0, 8).map(w => `${w.key} ${Math.round(w.len / 1024)} KB${w.same ? ' (unchanged)' : ''}`) });
  if (A) st.info.functions = A.fn.slice(f0).map(f => f.name).slice(0, 12);
  st.fails.forEach(f => { f.sev = f.sev || SEV[f.check] || 'minor'; });
  R.steps.push(st); save();
  console.log(`${st.fails.length ? '✗' : '✓'} ${st.n}. ${name} — ${(st.openMs / 1000).toFixed(1)} s, ${st.info.net.kvRequests} kv req, ${st.info.net.downKB} KB${st.fails.length ? ' — ' + st.fails.map(f => f.check + ': ' + f.msg).join(' | ').slice(0, 400) : ''}`);
  return st;
}

/* ── setup: open the CRM once (fast link, untimed — the release's first download is reported separately), sign in ── */
async function open(roleKey, extraInit){
  const who = acc.map[roleKey]; if (!who) throw new Error('no ' + roleKey + ' in the users list');
  R.setup.account = { role: roleKey, name: who.name, crmRole: who.role };
  S.fast = true;
  const init = [L.PROBE_INIT].concat(PROF.lsFull ? [L.lsInitScript(plan)] : [], extraInit || []);
  const t0 = Date.now();
  A = await H.computer(PROF.label, { build, mobile: phone, init }); page = A.page();
  page.setDefaultTimeout(30000);
  const okIn = await H.signIn(A, who.email, 120000);
  const home = await until(() => A.ev(ph => ph ? !!document.querySelector('#_gcJobPick.gc-fh') : !!(window._crm && document.querySelector('#root *')), phone), 120000);
  const data = await until(() => A.ev(async () => { try { return ((window.idbGet && await window.idbGet('projects')) || []).length; } catch (e) { return 0; } }), 180000);
  await sleep(8000);
  const cold = S.link.log.slice();
  const coldWire = cold.reduce((a, r) => a + r.down, 0);
  R.setup.signIn = { ok: okIn, home: !!home, projects: data || 0, ms: Date.now() - t0 };
  R.setup.firstOpen = { requests: cold.length, wireMB: +(coldWire / 1048576).toFixed(2), rawMB: +(cold.reduce((a, r) => a + r.raw, 0) / 1048576).toFixed(2),
    estSec: PROF.net ? Math.round(coldWire * 8 / (PROF.net.down * 1000) + cold.length * PROF.net.rtt / 1000 / 6) : null,
    biggest: cold.filter(r => r.down > 100000).sort((a, b) => b.down - a.down).slice(0, 10).map(r => `${r.m} ${r.path}${r.keys.length ? ' [' + r.keys.slice(0, 3).join(',') + ']' : ''} ${Math.round(r.down / 1024)} KB`) };
  try { R.setup.ls = await A.ev(() => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } return { keys: localStorage.length, chars: n, filled: localStorage.getItem('__qa_ls_filled') }; }); } catch (e) {}
  save();
  if (!okIn || !home) throw new Error('sign-in failed: ' + JSON.stringify(R.setup.signIn));
  S.fast = false; S.link.off = false;
}

/* close what is on top (the way a person does: the ✕ / Close / ‹ Back on screen) */
async function back(st, rx){
  const p = await locate({ rx: rx || '^(‹ ?Back|‹|←|✕|×|Close|Done|‹ Home)$' });
  if (!p) throw new Error('could not find a close / back button');
  if (p.covered && st) st.fails.push({ check: 'closeback', msg: `"${p.text}" is covered by ${p.by}` });
  await tapAt(p.x, p.y); await sleep(600); return p;
}
/* the crawler's way back: the ✕ / Close / ‹ Back / Cancel of what is on top (Esc on the desk) */
async function crawlBack(){
  const sig0 = await A.ev(() => [...document.body.children].filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).position === 'fixed').length + '|' + (localStorage.getItem('grayco_view') || '') + '|' + (document.elementFromPoint(innerWidth / 2, innerHeight * 0.4) || {}).className).catch(() => '');
  const p = await locate({ rx: '^(‹ ?Back|‹|←|✕|×|✖|Close|Done|Cancel|‹ Home|Back|Not now|OK)$' });
  if (p) { await tapAt(p.x, p.y); await sleep(700); const s1 = await A.ev(() => [...document.body.children].filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).position === 'fixed').length + '|' + (localStorage.getItem('grayco_view') || '') + '|' + (document.elementFromPoint(innerWidth / 2, innerHeight * 0.4) || {}).className).catch(() => ''); return s1 !== sig0 ? { ok: true, how: p.text } : { ok: false, how: p.text, why: `"${p.text}" did not close it` }; }
  if (!phone) { await page.keyboard.press('Escape'); await sleep(500); return { ok: true, how: 'left menu / Esc' }; }
  /* the phone's bottom bar is always a way out */
  const t = await locate({ sel: '#gc-fh-tabs [data-t="home"]' }); if (t && !t.covered) { await tapAt(t.x, t.y); await sleep(600); return { ok: true, how: '🏠 Home (no ✕ / Back on the screen)' }; }
  return { ok: false, why: 'no ✕ / Close / Back and the bottom bar is covered' };
}
const fieldHome = () => A.ev(() => { const h = document.querySelector('#_gcJobPick.gc-fh'); if (!h) return false; const r = h.getBoundingClientRect(); const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return r.width > 0 && !!e && h.contains(e); });
async function goHome(){
  await A.ev(() => { document.querySelectorAll('.gc-fh-sheet,.gc-ra-sheet,._gcSheetOv,.gcfp-sheet,#_gcTD2Ov,#_gcJobDash,.gc-rpb-card').forEach(o => o.remove()); try { if (window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open) window._gcPhotos.close(); } catch (e) {} }).catch(() => {});
  if (await fieldHome()) return true;
  const b = await locate({ sel: '#gc-fh-tabs [data-t="home"]' }); if (b && !b.covered) { await tapAt(b.x, b.y); if (await until(fieldHome, 6000)) return true; }
  await A.ev(() => window._gcField && window._gcField.open && window._gcField.open()).catch(() => {});
  if (await until(fieldHome, 6000)) return true;
  /* stuck: reload (counted in the step that needed it) */
  R.notes.push('had to reload the CRM to get back to Field home (' + new Date().toISOString().slice(11, 19) + ')');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 }).catch(() => {});
  return !!(await until(fieldHome, 90000));
}

/* ── the walks ── */
import('./walks.mjs').then(async W => {
  if (opt('mode') === 'crawl') {
    try {
      const C = await import('./crawl.mjs'); const FT = await import('./features.mjs');
      const feats = JSON.parse(fs.readFileSync(opt('features'), 'utf8')); const m = FT.matcher(feats);
      const X = { PID, PROF, R, H, L, A: () => A, page: () => page, step, tap, tapAt, locate, has, until, back, goHome, fieldHome, open, shot, sleep, snap, acc, S, save };
      await open(PID === 'owner' ? 'admin' : PID === 'pm' ? 'pm' : 'office');
      S.link.off = true;   /* the crawl taps hundreds of controls: fast link, full CPU (crawl.mjs); the walk times the slow phone */
      const ready = () => until(() => A.ev(ph => ph ? !!document.querySelector('#_gcJobPick.gc-fh') : document.querySelectorAll('nav button, aside button').length > 5, phone), 120000);
      const scrRx = opt('screens') ? new RegExp(opt('screens'), 'i') : null;
      const screens = W.crawlScreens(X).filter(sc => !scrRx || scrRx.test(sc.name));
      R.crawl = await C.crawlProfile(X, screens, { minutes: +opt('crawl-min', '35'), shots: SHOTS, outRoot: OUT, match: m, ready, back: crawlBack,
        progress: (s, r) => console.log(`  [${s}] L${r.level} ${r.result} "${String(r.text).slice(0, 40)}" ${r.kind || ''} ${r.why.join('; ').slice(0, 160)}`) });
    } catch (e) { R.stopped = String(e && e.message || e).split('\n')[0].slice(0, 300); console.log('crawl stopped: ' + (e && e.stack || e)); }
    R.finished = new Date().toISOString(); save();
    try { if (A) await A.b.close(); } catch (e) {}
    process.exit(0);
  }
  try { await W.run({ PID, PROF, R, H, L, A: () => A, page: () => page, step, tap, tapAt, locate, has, until, back, goHome, fieldHome, open, shot, sleep, snap, acc, S, save }); }
  catch (e) { R.stopped = String(e && e.message || e).split('\n')[0].slice(0, 300); R.notes.push('walk stopped: ' + String(e && e.stack || e).slice(0, 600)); console.log('walk stopped: ' + (e && e.stack || e)); }
  R.finished = new Date().toISOString(); save();
  try { if (A) await A.b.close(); } catch (e) {}
  process.exit(0);
});

/* ═══════════════ the report ═══════════════ */
async function summarize(results, snapDir, feats){
  feats = feats || [];
  const btns = []; results.forEach(r => ((r.crawl || {}).screens || []).forEach(sc => sc.buttons.forEach(b => btns.push(Object.assign({ profile: r.profile, label: r.label, screen: sc.name }, b)))));
  /* one judgment for every crawl (also ones recorded by an older crawler): a background toast is not a reaction; SLOW = over 5 s */
  const FT = await import(pathToFileURL(path.join(HERE, 'features.mjs')).href); const fm = FT.matcher(feats);
  /* findings that only involve the harness host's "WRONG SITE" bar are the harness's, not the release's */
  results.forEach(r => (r.steps || []).forEach(s0 => { s0.fails = s0.fails.filter(f => { if (f.list) f.list = f.list.filter(x => !/WRONG SITE/.test(x)); return !(/WRONG SITE/.test(f.msg + (f.el || '')) || ((f.check === 'behind' || f.check === 'closeback') && f.list && !f.list.length)); }); }));
  for (const b of btns) { if ((b.why || []).some(w => /WRONG SITE/.test(w))) { b.result = 'SKIP'; b.why = ['blocked by the harness host bar (WRONG SITE), not judged']; } }
  for (const b of btns) {
    b.features = fm({ ids: b.ids || [], data: b.data || [], text: b.text });
    if (/^toast: /.test(b.kind || '') && BG_TOAST.test(b.kind.slice(7)) && b.result !== 'FAIL') { b.kind = 'nothing (only a background toast: ' + b.kind.slice(7, 50) + ')'; b.result = 'FAIL'; b.why = ['dead button — nothing happened'].concat((b.why || []).filter(w => !/^reacted after/.test(w))); }
    /* the menu item of the screen you are on does nothing — that is right */
    { const t = String(b.text || '').replace(/[^\p{L}&' ]/gu, '').trim().toLowerCase(); if (b.result === 'FAIL' && /^nothing/.test(b.kind || '') && t.length > 3 && String(b.screen).toLowerCase().includes(t)) { b.result = 'OK'; b.why = ['already on this screen']; } }
    /* a write the crawler cannot tie to this tap for sure (the CRM keeps saving by itself — see the walk's shared-write bugs) */
    if (b.result === 'FAIL' && !(b.why || []).some(w => /dead button|page error|covered|no way back|outside host/.test(w))) b.result = 'WARN';
    if (b.result === 'SLOW' && (b.ms || 0) < SLOW_MS) { b.result = 'OK'; b.why = (b.why || []).map(w => w.replace(/^reacted after/, 'first visible change after')); }
  }
  const bad = btns.filter(b => b.result === 'FAIL' || b.result === 'SLOW');
  const recent = feats.map(f => { const B = btns.filter(b => (b.features || []).includes(f.name) && ['OK', 'FAIL', 'SLOW', 'SKIP'].includes(b.result));
    return { name: f.name, first: f.first, last: f.last, summary: f.summary, hooks: f.ids.length + f.data.length + f.labels.length, buttons: B.map(b => ({ profile: b.profile, screen: b.screen, level: b.level, via: b.via, text: b.text, result: b.result, kind: b.kind, why: b.why, shot: b.shot, ms: b.ms })),
      screens: results.flatMap(r => ((r.crawl || {}).screens || []).filter(sc => (sc.recent || []).includes(f.name)).map(sc => ({ profile: r.profile, screen: sc.name, opened: sc.opened !== false, n: sc.buttons.filter(b => ['OK', 'FAIL', 'SLOW', 'WARN'].includes(b.result)).length, fail: btns.filter(b => b.profile === r.profile && b.screen === sc.name && b.result === 'FAIL').length }))),
      status: !B.length ? (f.ids.length + f.data.length + f.labels.length ? 'NOT SEEN' : 'NO UI') : B.some(b => b.result === 'FAIL') ? 'FAIL' : B.some(b => b.result === 'SLOW') ? 'SLOW' : 'OK' }; });
  const crawlErr = results.filter(r => r.crawl && r.crawl.error).map(r => r.profile + ': ' + r.crawl.error);
  const all = []; results.forEach(r => r.steps.forEach(s => s.fails.forEach(f => all.push(Object.assign({ profile: r.profile, step: s.name, n: s.n, shot: (s.shots[0] || {}).file }, f)))));
  const c = { steps: results.reduce((a, r) => a + r.steps.length, 0), failedSteps: results.reduce((a, r) => a + r.steps.filter(s => s.fails.length).length, 0), fails: all.length, critical: all.filter(f => f.sev === 'critical').length, major: all.filter(f => f.sev === 'major').length, minor: all.filter(f => f.sev === 'minor').length };
  const crashed = results.filter(r => r.crashed || !r.finished || r.stopped || !r.steps.length).map(r => r.profile + (r.stopped ? ' (' + r.stopped + ')' : ''));
  /* the bug list: the same failure on many screens is one bug (with every place and screenshot) */
  const bugMap = new Map(); const norm = m => String(m).replace(/\d+(\.\d+)?/g, '#').replace(/"[^"]{0,80}"/g, '"…"').slice(0, 140);
  for (const f of all) { const k = f.check + '|' + (f.check === 'floating' || f.check === 'behind' || f.check === 'closeback' ? (f.list || []).map(x => String(x).replace(/@.*|\d+/g, '')).sort().join(';').slice(0, 200) : norm(f.msg)); const b = bugMap.get(k) || { sev: f.sev, check: f.check, msg: f.msg, list: f.list, el: f.el, where: [] }; b.where.push({ profile: f.profile, step: f.step, n: f.n, shot: f.shot }); if ({ critical: 3, major: 2, minor: 1 }[f.sev] > { critical: 3, major: 2, minor: 1 }[b.sev]) b.sev = f.sev; bugMap.set(k, b); }
  for (const b of btns.filter(b => b.result === 'FAIL')) { const k = 'button|' + b.profile + '|' + b.screen + '|' + b.text; bugMap.set(k, { sev: 'major', check: 'button', msg: `${b.label} · ${b.screen} · ${b.level === 2 ? b.via + ' › ' : ''}"${b.text}": ${(b.why || []).join('; ')}`, where: [{ profile: b.profile, step: b.screen, shot: b.shot }] }); }
  const bugs = [...bugMap.values()].sort((a, b) => ({ critical: 0, major: 1, minor: 2 }[a.sev] - { critical: 0, major: 1, minor: 2 }[b.sev]) || b.where.length - a.where.length);
  c.buttons = btns.length; c.buttonsFail = btns.filter(b => b.result === 'FAIL').length; c.buttonsSlow = btns.filter(b => b.result === 'SLOW').length; c.buttonsSkip = btns.filter(b => b.result === 'SKIP').length; c.buttonsOk = btns.filter(b => b.result === 'OK').length;
  c.dead = btns.filter(b => b.result === 'FAIL' && (b.why || []).some(w => /dead button/.test(w))).length;
  return { build: buildName, buildDir: build, snapshot: path.basename(snapDir), at: new Date().toISOString(), pass: !c.critical && !c.major && !crashed.length && !c.buttonsFail && !crawlErr.length, crashed, crawlErr, counts: c, badButtons: bad, recent, bugs,
    crawl: results.map(r => ({ profile: r.profile, label: r.label, crawl: r.crawl || null })),
    profiles: results.map(r => ({ profile: r.profile, label: r.label, setup: r.setup, device: r.device, notes: r.notes, wallSec: r.wallSec, steps: r.steps.map(s => ({ n: s.n, name: s.name, openMs: s.openMs, passive: s.passive, fails: s.fails, warns: s.warns, info: s.info, shots: s.shots })) })),
    failures: all };
}
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function renderHTML(S, file){
  const rel = f => f ? esc(path.relative(path.dirname(file), path.join(OUT, f))) : '';
  const sevC = { critical: 'crit', major: 'maj', minor: 'min' };
  const fl = f => `<li class="${sevC[f.sev] || 'min'}"><b>${esc(f.sev)}</b> · <code>${esc(f.check)}</code> ${esc(f.msg)}${f.atEnd ? ' <i>(scrolled to the end)</i>' : ''}${f.el ? `<div class="sub">${esc(f.el)}</div>` : ''}${f.list ? `<ul class="sub">${f.list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</li>`;
  const prof = p => !p.device ? '' : `<section><h2>${esc(p.label)} <span class="muted">(${esc(p.setup && p.setup.account ? p.setup.account.name + ' · ' + p.setup.account.crmRole : '')})</span></h2>
    <p class="muted">${esc(p.device.viewport.width + '×' + p.device.viewport.height)} @${p.device.dsf}x · ${p.device.net ? `${p.device.net.down} kbps down / ${p.device.net.up} up / ${p.device.net.rtt} ms RTT` : 'fast network'} · CPU ×${p.device.cpu}${p.device.safe && p.device.safe.top ? ` · safe area ${p.device.safe.top}/${p.device.safe.bottom}` : ''} · ${p.steps.length} steps · ${p.wallSec || '?'} s</p>
    ${p.setup && p.setup.firstOpen ? `<p>First open of this build (download, untimed setup): <b>${p.setup.firstOpen.wireMB} MB</b> over the wire (${p.setup.firstOpen.rawMB} MB unpacked, ${p.setup.firstOpen.requests} requests)${p.setup.firstOpen.estSec ? ` — about <b>${p.setup.firstOpen.estSec} s</b> on this link` : ''}. ${p.setup.ls ? `localStorage: ${p.setup.ls.keys} keys, ${p.setup.ls.chars.toLocaleString()} chars.` : ''}</p>` : ''}
    ${p.notes && p.notes.length ? `<ul>${p.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${p.steps.map(s => `<div class="step ${s.fails.length ? 'bad' : 'good'}"><h3>${s.fails.length ? '✗' : '✓'} ${s.n}. ${esc(s.name)} <span class="muted">${(s.openMs / 1000).toFixed(1)} s · ${s.info.net ? s.info.net.kvRequests + ' gc_kv req · ' + s.info.net.downKB + ' KB down' : ''}${s.info.longTasks ? ' · long tasks ' + s.info.longTasks.n + ' (worst ' + s.info.longTasks.worst + ' ms)' : ''}</span></h3>
      <div class="row"><div class="shots">${s.shots.filter(x => x.file).map(x => `<figure><a href="${rel(x.file)}"><img loading="lazy" src="${rel(x.file)}"></a><figcaption>${esc(x.label)}</figcaption></figure>`).join('')}</div>
      <div class="det">${s.fails.length ? `<ul class="fails">${s.fails.map(fl).join('')}</ul>` : '<p class="ok">All checks passed.</p>'}${s.warns.length ? `<ul class="warns">${s.warns.map(w => `<li>⚠ ${esc(w.msg)}${w.list ? ': ' + esc(w.list.slice(0, 3).join(' · ')) : ''}</li>`).join('')}</ul>` : ''}
      <details><summary>measurements</summary><pre>${esc(JSON.stringify(s.info, null, 1))}</pre></details></div></div></div>`).join('')}</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA gate ${esc(S.build)}</title>
<style>:root{--bg:#fff;--fg:#1f2937;--mut:#6b7280;--bad:#b91c1c;--ok:#15803d;--line:#e5e7eb;--card:#f9fafb}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#111827;--fg:#e5e7eb;--mut:#9ca3af;--line:#374151;--card:#1f2937;--bad:#f87171;--ok:#4ade80}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,sans-serif;margin:0;padding:16px;max-width:1400px}
h1{font-size:22px;margin:0 0 4px}.verdict{font-size:20px;font-weight:800;color:${S.pass ? 'var(--ok)' : 'var(--bad)'}}
.muted{color:var(--mut);font-weight:400;font-size:13px}.step{border:1px solid var(--line);border-radius:8px;padding:10px;margin:10px 0;background:var(--card)}
.step.bad{border-left:4px solid var(--bad)}.step.good{border-left:4px solid var(--ok)}h3{margin:0 0 8px;font-size:15px}
.row{display:flex;gap:12px;flex-wrap:wrap}.shots{display:flex;gap:8px;flex-wrap:wrap}figure{margin:0}figure img{width:180px;border:1px solid var(--line);border-radius:6px}
figcaption{font-size:11px;color:var(--mut)}.det{flex:1;min-width:280px}li.crit b{color:var(--bad)}li.maj b{color:#c2410c}li.min b{color:var(--mut)}
.sub{color:var(--mut);font-size:12px}pre{font-size:11px;white-space:pre-wrap;max-height:260px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:4px 8px;text-align:left;font-size:13px}
.ok{color:var(--ok)}@media (max-width:600px){figure img{width:130px}}</style></head><body>
<h1>Release QA gate — ${esc(S.build)}</h1><div class="verdict">${S.pass ? 'PASS' : 'FAIL'}</div>
<p class="muted">${esc(S.at)} · real data snapshot ${esc(S.snapshot)} (read-only, offline) · ${S.counts.steps} steps · ${S.counts.failedSteps} failed · ${S.counts.critical} critical / ${S.counts.major} major / ${S.counts.minor} minor${S.crashed.length ? ' · did not finish: ' + esc(S.crashed.join(', ')) : ''}</p>
<table><tr><th>Profile</th><th>Step</th><th>Open</th><th>Result</th></tr>${S.profiles.map(p => p.steps.map(s => `<tr><td>${esc(p.label)}</td><td>${s.n}. ${esc(s.name)}</td><td>${(s.openMs / 1000).toFixed(1)} s</td><td>${s.fails.length ? `<span style="color:var(--bad)">✗ ${esc([...new Set(s.fails.map(f => f.check))].join(', '))}</span>` : '<span class="ok">✓</span>'}</td></tr>`).join('')).join('')}</table>
<h2>Bug list (${S.bugs.length})</h2>${['critical', 'major', 'minor'].map(sv => `<h3>${sv} (${S.bugs.filter(b => b.sev === sv).length})</h3><ol>${S.bugs.filter(b => b.sev === sv).map(b => `<li><code>${esc(b.check)}</code> ${esc(b.msg)}${b.el ? `<div class="sub">${esc(b.el)}</div>` : ''}${b.list ? `<div class="sub">${esc(b.list.slice(0, 4).join(' · '))}</div>` : ''}<div class="sub">${b.where.length} place(s): ${b.where.slice(0, 6).map(w => `${esc(w.profile)} · ${esc(w.step)}${w.shot ? ` <a href="${rel(w.shot)}">shot</a>` : ''}`).join(' | ')}${b.where.length > 6 ? ' …' : ''}</div></li>`).join('')}</ol>`).join('')}
${S.counts.buttons != null ? `<h2>Dead / broken / slow buttons (${S.badButtons.length})</h2><p class="muted">${S.counts.buttons} controls judged on ${S.crawl.length} profile(s): ${S.counts.buttonsOk} OK · ${S.counts.buttonsFail} FAIL (${S.counts.dead} dead) · ${S.counts.buttonsSlow} SLOW · ${S.counts.buttonsSkip} skipped (destructive / not reachable)${S.crawlErr.length ? ' · ' + esc(S.crawlErr.join(' · ')) : ''}</p>
<table><tr><th>Profile</th><th>Screen</th><th>Button</th><th>Result</th><th>Why</th><th>Shot</th></tr>${S.badButtons.map(b => `<tr><td>${esc(b.label)}</td><td>${esc(b.screen)}</td><td>${b.level === 2 ? esc(b.via) + ' › ' : ''}${esc(b.text)}</td><td>${esc(b.result)}</td><td>${esc((b.why || []).join('; '))}</td><td>${b.shot ? `<a href="${rel(b.shot)}">shot</a>` : ''}</td></tr>`).join('')}</table>
<h2>Recent features (since ${esc((S.recent.slice().sort((a, b) => a.first.localeCompare(b.first))[0] || {}).first || '')})</h2>
<table><tr><th>Feature</th><th>Added</th><th>Status</th><th>Buttons (OK / FAIL / why)</th></tr>${S.recent.map(f => `<tr><td><b>${esc(f.name)}</b><div class="sub">${esc(f.summary)}</div></td><td>${esc(f.first)}${f.last !== f.first ? ' – ' + esc(f.last) : ''}</td><td>${esc(f.status)}</td><td>${f.screens && f.screens.length ? `<div class="sub">screens: ${f.screens.map(x => `${esc(x.profile)} · ${esc(x.screen)}: ${x.opened ? `${x.n} buttons, ${x.fail} FAIL` : 'could not be opened'}`).join(' | ')}</div>` : ''}${f.buttons.length ? `<ul class="sub">${f.buttons.slice(0, 40).map(b => `<li>${esc(b.result)} · ${esc(b.profile)} · ${esc(b.screen)} · ${b.level === 2 ? esc(b.via) + ' › ' : ''}"${esc(b.text)}" ${esc(b.kind || '')}${b.why && b.why.length ? ' — ' + esc(b.why.join('; ')) : ''}${b.shot ? ` <a href="${rel(b.shot)}">shot</a>` : ''}</li>`).join('')}${f.buttons.length > 40 ? `<li>… ${f.buttons.length - 40} more</li>` : ''}</ul>` : f.status === 'NOT SEEN' ? `<span class="sub">none of its ${f.hooks} controls showed on the crawled screens</span>` : '<span class="sub">no UI control in its changes</span>'}</td></tr>`).join('')}</table>` : ''}
${S.profiles.map(prof).join('')}
${S.crawl.map(c => c.crawl ? `<section><h2>Every button — ${esc(c.label)}</h2>${(c.crawl.screens || []).map(sc => `<h3>${esc(sc.name)} ${sc.opened === false ? '<span style="color:var(--bad)">— could not be opened</span>' : ''} <span class="muted">${sc.buttons.length} controls ${sc.notes.length ? '· ' + esc(sc.notes.join('; ')) : ''}</span> ${sc.shot ? `<a href="${rel(sc.shot)}">screen</a>` : ''}</h3>
<table><tr><th>L</th><th>Button</th><th>Feature</th><th>Result</th><th>What happened</th><th>ms</th><th>Back</th><th>Shot</th></tr>${sc.buttons.map(b => `<tr><td>${b.level}</td><td>${b.level === 2 ? esc(b.via) + ' › ' : ''}${esc(b.text)}</td><td>${esc((b.features || []).join(', '))}</td><td style="color:${b.result === 'FAIL' ? 'var(--bad)' : b.result === 'OK' ? 'var(--ok)' : 'inherit'}">${esc(b.result)}</td><td>${esc(b.kind || '')}${b.why && b.why.length ? ' — ' + esc(b.why.join('; ')) : ''}</td><td>${b.ms == null ? '' : b.ms}</td><td>${esc(b.back || '')}</td><td>${b.shot ? `<a href="${rel(b.shot)}">shot</a>` : ''}</td></tr>`).join('')}</table>`).join('')}</section>` : '').join('')}
</body></html>`;
}
