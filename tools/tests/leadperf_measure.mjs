// leadperf_measure.mjs — patch LEADPERF: measure the Leads page on the invented live-size dataset (leadperf_world.mjs) in Chromium
// through the offline harness (GC_HARNESS, default scratchpad wN/harness_N.mjs). Used by test_LEADPERF.mjs; run directly for a report:
//   node tools/tests/leadperf_measure.mjs <build-dir> [--profile out.json] [--idle 10]
// Measures: time to open Leads (sidebar click → rows painted, → main thread settled), long tasks, Event-Timing durations (≈ INP) of
// filter-chip clicks, row → drawer, typing in the search box, scroll frame gaps, and while idle on Leads: long tasks, CPU busy %,
// MutationObserver / timer callbacks per second (by source), optional CPU profile hot functions. Made-up data only.
import path from 'path'; import fs from 'fs'; import { pathToFileURL, fileURLToPath } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { settled, lsInit } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'leadperf_world.mjs')).href);

/* in the page before anything else: long tasks, event timing, and (attrib) who runs timers / observers */
const INIT = (attrib) => `(() => {
  const P = window.__lp = { lt: [], ev: [], timers: {}, mo: {}, on: false };
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.lt.push({ s: e.startTime, d: e.duration }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.ev.push({ n: e.name, s: e.startTime, d: e.duration, p: e.processingEnd - e.processingStart }))).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) {}
  if (!${attrib}) return;
  /* the creating line in index.html, past the CRM's own timer / observer wrappers (PERFCLICK speed watchdog …) */
  const SKIP = window.__lpSkip = window.__lpSkip || [];
  const where = () => { const L = String(new Error().stack || '').split('\\n').slice(3).map(x => /app\\.local\\/[^:]*:(\\d+):\\d+\\)?\\s*$/.exec(x)).filter(Boolean).map(m => +m[1]).filter(n => !(n >= 1430 && n <= 1475) && !(n >= 5500 && n <= 5560) && !(n >= 5900 && n <= 6060) && !SKIP.some(r => n >= r[0] && n <= r[1])); return L.length ? 'L' + L.slice(0, 2).join('<') : '?'; };
  const add = (T, k, t, recs) => { const r = T[k] || (T[k] = { n: 0, ms: 0, recs: 0, max: 0 }); const d = performance.now() - t; r.n++; r.ms += d; r.max = Math.max(r.max, d); r.recs += recs || 0; };
  for (const name of ['setTimeout', 'setInterval']) {
    const o = window[name];
    window[name] = function(fn, ms) { if (typeof fn !== 'function') return o.apply(this, arguments); const k = name.slice(3, 4) + ':' + where() + ':' + (ms | 0); const a = [].slice.call(arguments); a[0] = function(){ if (!P.on) return fn.apply(this, arguments); const t = performance.now(); try { return fn.apply(this, arguments); } finally { add(P.timers, k, t); } }; return o.apply(this, a); };
  }
  const oR = window.requestAnimationFrame; window.requestAnimationFrame = function(fn){ const k = 'raf:' + where(); return oR.call(window, function(ts){ if (!P.on) return fn(ts); const t = performance.now(); try { return fn(ts); } finally { add(P.timers, k, t); } }); };
  P.idb = {};
  for (const op of ['put', 'get']) { const o = IDBObjectStore.prototype[op]; IDBObjectStore.prototype[op] = function(){ if (P.on) { const k = op + ':' + String(op === 'put' ? arguments[1] : arguments[0]).slice(0, 40) + ':' + where(); P.idb[k] = (P.idb[k] || 0) + 1; } return o.apply(this, arguments); }; }
  const MO = window.MutationObserver;
  function W(cb){ const k = where(); return new MO(function(m, o){ if (!P.on) return cb.call(this, m, o); const t = performance.now(); try { return cb.call(this, m, o); } finally { add(P.mo, k, t, m.length); } }); }
  W.prototype = MO.prototype; window.MutationObserver = W;
})();`;

const rectOf = (A, fn, arg) => A.ev(fn, arg);
async function clickAt(A, r){ await A.page().mouse.click(r.x, r.y); }
const findText = ([sel, rx]) => { const R = new RegExp(rx); const e = [...document.querySelectorAll(sel)].find(x => x.offsetParent && R.test((x.innerText || '').trim())); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

export async function measure(build, opt){
  opt = opt || {};
  const W = await settled(H, build, opt.seed || 7, opt.cache || SP + '/wN');
  const A = await H.computer('perf', { build, init: [lsInit(W), INIT(!!opt.attrib)], viewport: { width: 1440, height: 900 } });
  const cdp = await A.ctx.newCDPSession(A.page());
  await cdp.send('Performance.enable');
  const ok = await H.signIn(A, 'wjohnson@grayco-cs.com', 25000);
  await H.waitFor(A, n => window._crm && (window._crm.leads || []).length >= n && (window._crm.projects || []).length >= 500, W.leads.length - 5, 40000);
  await A.ev(() => { try { window._gcCo && window._gcCo.setFilter && window._gcCo.setFilter('all'); } catch (e) {} window._setView('dashboard'); });
  await H.sleep(opt.settle || 15000);
  const M = { signedIn: ok, leads: W.leads.length, projects: W.projects.length };
  const now = () => A.ev(() => performance.now());
  const lts = (a, b) => A.ev(([a, b]) => window.__lp.lt.filter(x => x.s >= a && x.s < b), [a, b]);
  const evs = (a, b) => A.ev(([a, b]) => window.__lp.ev.filter(x => x.s >= a && x.s < b), [a, b]);
  const busy = async () => { const m = (await cdp.send('Performance.getMetrics')).metrics; const g = n => (m.find(x => x.name === n) || {}).value || 0; return g('TaskDuration'); };
  /* --profile <prefix>: one CPU profile per phase (<prefix>_open.json, _idle, _chips, _drawer, _search) */
  const P0 = async () => { if (opt.profile) { await cdp.send('Profiler.start'); } };
  const P1 = async ph => { if (!opt.profile) return; const { profile } = await cdp.send('Profiler.stop'); fs.writeFileSync(opt.profile + '_' + ph + '.json', JSON.stringify(profile)); (M.hot = M.hot || {})[ph] = hot(profile, 12); };
  if (opt.profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); }
  await P0();

  /* 1) open Leads from the sidebar */
  const nav = await rectOf(A, findText, ['nav *, aside *, [class*=side] *, [class*=Side] *', '^Leads(\\s*\\d+)?$']);
  const t0 = await now();
  if (nav) await clickAt(A, nav); else await A.ev(() => window._setView('leads'));
  const painted = await A.ev(async () => { const t = performance.now(); while (performance.now() - t < 20000) { if (document.querySelectorAll('table.gcl-list tr.gcl-lr').length) { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now(); } await new Promise(r => setTimeout(r, 16)); } return -1; });
  await H.sleep(5000);
  const lt1 = await lts(t0, t0 + 5000);
  const lastEnd = lt1.reduce((m, x) => Math.max(m, x.s + x.d), painted);
  await P1('open');
  M.open = { rowsPaintedMs: Math.round(painted - t0), settledMs: Math.round(lastEnd - t0), longTasks: lt1.length, longestMs: Math.round(Math.max(0, ...lt1.map(x => x.d))), blockedMs: Math.round(lt1.reduce((s, x) => s + x.d, 0)), rows: await A.ev(() => document.querySelectorAll('table.gcl-list tr.gcl-lr').length) };

  /* 2) idle on Leads: long tasks, CPU, callbacks per second */
  const idleS = opt.idle || 10;
  if (opt.attrib) await A.ev(() => { for (const nm of ['idbSet', '_supaUpsert', '_gcAcW', '_gcIDBSet', '_gcAddToRegister']) { const o = window[nm]; if (typeof o !== 'function' || o.__lp) continue; const w = function(k){ if (window.__lp.on) { const L = String(new Error().stack || '').split('\n').slice(2).map(x => /app\.local\/[^:]*:(\d+):\d+\)?\s*$/.exec(x)).filter(Boolean).map(m => m[1]).slice(0, 4).join('<'); const kk = nm + ':' + (k && typeof k === 'object' ? (k.srcInvId || k.id) + '|' + k.source : String(k)).slice(0, 40) + ':' + L; window.__lp.idb[kk] = (window.__lp.idb[kk] || 0) + 1; } return o.apply(this, arguments); }; w.__lp = 1; window[nm] = w; } });
  await P0(); await A.ev(() => { window.__lp.on = true; window.__lp.timers = {}; window.__lp.mo = {}; window.__lp.idb = {}; });
  const js0 = opt.attrib ? await A.ev(() => (window._gcTimerStats ? window._gcTimerStats() : []).map(j => ({ k: j.ms + ':' + j.src, n: j.n, total: j.total }))) : [];
  const i0 = await now(), b0 = await busy(); await H.sleep(idleS * 1000); const i1 = await now(), b1 = await busy();
  const js1 = opt.attrib ? await A.ev(() => (window._gcTimerStats ? window._gcTimerStats() : []).map(j => ({ k: j.ms + ':' + j.src, n: j.n, total: j.total, max: j.max }))) : [];
  await A.ev(() => { window.__lp.on = false; }); await P1('idle');
  const lti = await lts(i0, i1);
  M.idle = { seconds: idleS, cpuBusyPct: Math.round((b1 - b0) / ((i1 - i0) / 1000) * 1000) / 10, longTasks: lti.length, longestMs: Math.round(Math.max(0, ...lti.map(x => x.d))) };
  if (opt.attrib) {
    const T = await A.ev(() => ({ t: window.__lp.timers, m: window.__lp.mo, idb: window.__lp.idb }));
    M.idle.idb = Object.entries(T.idb || {}).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const top = o => Object.entries(o).map(([k, v]) => ({ k, perS: Math.round(v.n / idleS * 10) / 10, msPerS: Math.round(v.ms / idleS * 10) / 10, max: Math.round(v.max), recs: v.recs })).sort((a, b) => b.msPerS - a.msPerS || b.perS - a.perS).slice(0, 25);
    M.idle.timers = top(T.t); M.idle.observers = top(T.m);
    const J0 = {}; js0.forEach(j => { J0[j.k] = j; });
    M.idle.jobs = js1.map(j => ({ k: j.k.slice(0, 110), perS: Math.round((j.n - ((J0[j.k] || {}).n || 0)) / idleS * 10) / 10, msPerS: Math.round((j.total - ((J0[j.k] || {}).total || 0)) / idleS * 10) / 10, max: Math.round(j.max) })).filter(j => j.perS > 0).sort((a, b) => b.msPerS - a.msPerS).slice(0, 20);
    M.idle.timerCallsPerS = Math.round(Object.values(T.t).reduce((s, v) => s + v.n, 0) / idleS * 10) / 10;
    M.idle.observerCallsPerS = Math.round(Object.values(T.m).reduce((s, v) => s + v.n, 0) / idleS * 10) / 10;
  }

  /* 3) filter chips: Event Timing (input → next paint) + long tasks in the second after */
  M.chips = []; await P0();
  for (const label of opt.chips || ['Bids', 'Residential', 'Prime', 'Sub', 'Unassigned', 'Due this week', 'All']) {
    const r = await rectOf(A, findText, ['button, [role=button], .gcl-chip, span', '^\\W*' + label + '(\\s*\\d+)?$']);
    if (!r) { M.chips.push({ label, missing: true }); continue; }
    const c0 = await now(); await clickAt(A, r); await H.sleep(1200); const c1 = await now();
    const e = (await evs(c0, c1)).filter(x => /click|pointer|mouse/.test(x.n)); const l = await lts(c0, c1);
    M.chips.push({ label, inpMs: Math.round(Math.max(0, ...e.map(x => x.d))), longTasks: l.length, blockedMs: Math.round(l.reduce((s, x) => s + x.d, 0)), rows: await A.ev(() => document.querySelectorAll('table.gcl-list tr.gcl-lr').length) });
  }

  await P1('chips');
  /* 4) row → drawer */
  await P0();
  const row = await A.ev(() => { const b = document.querySelector('table.gcl-list tr.gcl-lr td.c-name b'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + Math.min(40, r.width / 2), y: r.y + r.height / 2, name: b.innerText }; });
  if (row) {
    const d0 = await now(); await clickAt(A, row);
    const shown = await A.ev(async ([t0]) => { const t = performance.now(); const before = document.body.innerHTML.length; while (performance.now() - t < 8000) { const d = document.getElementById('gcl-drawer') || [...document.querySelectorAll('[class*=drawer], [id*=drawer], [class*=Drawer], [role=dialog]')].find(x => x.offsetParent || getComputedStyle(x).position === 'fixed'); if (d && d.getBoundingClientRect().width > 200) { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t0; } await new Promise(r => setTimeout(r, 16)); } return -1; }, [d0]);
    await H.sleep(1500); const d1 = await now();
    const e = (await evs(d0, d1)).filter(x => /click|pointer|mouse/.test(x.n)); const l = await lts(d0, d1);
    M.drawer = { shownMs: Math.round(shown), inpMs: Math.round(Math.max(0, ...e.map(x => x.d))), longTasks: l.length, blockedMs: Math.round(l.reduce((s, x) => s + x.d, 0)) };
    await A.page().keyboard.press('Escape'); await H.sleep(600);
    await A.ev(() => { const x = [...document.querySelectorAll('button')].find(b => b.offsetParent && /^(✕|×|Close)$/.test(b.innerText.trim()) && b.closest('[class*=drawer], [class*=Drawer], [role=dialog]')); if (x) x.click(); });
    await H.sleep(800);
  }

  await P1('drawer');
  /* 5) typing in the search box */
  await P0();
  const sr = await rectOf(A, () => { const i = [...document.querySelectorAll('input')].find(x => x.offsetParent && /search leads/i.test(x.placeholder || '')); if (!i) return null; const b = i.getBoundingClientRect(); return { x: b.x + 20, y: b.y + b.height / 2 }; });
  if (sr) {
    await clickAt(A, sr); const s0 = await now();
    await A.page().keyboard.type('zeddville', { delay: 90 }); await H.sleep(1500); const s1 = await now();
    const e = (await evs(s0, s1)).filter(x => /key|input|beforeinput/.test(x.n)); const l = await lts(s0, s1);
    M.search = { inpMs: Math.round(Math.max(0, ...e.map(x => x.d))), longTasks: l.length, blockedMs: Math.round(l.reduce((s, x) => s + x.d, 0)), rows: await A.ev(() => document.querySelectorAll('table.gcl-list tr.gcl-lr').length) };
    await A.page().keyboard.press('Control+A'); await A.page().keyboard.press('Backspace'); await H.sleep(1200);
  }

  await P1('search');
  /* 6) scroll the list: frame gaps */
  const g0 = await now();
  await A.ev(() => { window.__lpF = []; let last = performance.now(); const f = t => { window.__lpF.push(t - last); last = t; if (window.__lpF.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await A.page().mouse.move(800, 600);
  for (let i = 0; i < 20; i++) { await A.page().mouse.wheel(0, i < 10 ? 400 : -400); await H.sleep(80); }
  await H.sleep(500);
  const F = await A.ev(() => window.__lpF.slice(1)); const ls = await lts(g0, await now());
  M.scroll = { frames: F.length, maxGapMs: Math.round(Math.max(0, ...F)), gapsOver50: F.filter(x => x > 50).length, longTasks: ls.length };

  /* 7) nobody at the computer for over a minute, still on Leads (the CRM slows its background loops after 60 s) */
  if (opt.idleLong) {
    await H.sleep(65000);
    const j0 = await now(), c0 = await busy(); await H.sleep(opt.idleLong * 1000); const j1 = await now(), c1 = await busy();
    const lj = await lts(j0, j1);
    M.idleLong = { seconds: opt.idleLong, cpuBusyPct: Math.round((c1 - c0) / ((j1 - j0) / 1000) * 1000) / 10, longTasks: lj.length, longestMs: Math.round(Math.max(0, ...lj.map(x => x.d))) };
  }
  M.errors = A.errs.slice(0, 10);
  await A.close();
  return M;
}

export function hot(profile, n){
  const self = {}, byId = {}; profile.nodes.forEach(x => { byId[x.id] = x; });
  const dt = profile.timeDeltas; const cnt = {};
  profile.samples.forEach((id, i) => { cnt[id] = (cnt[id] || 0) + (dt[i] || 0); });
  Object.entries(cnt).forEach(([id, us]) => { const c = byId[id].callFrame; const k = (c.functionName || '(anon)') + ' ' + (c.url ? c.url.replace(/^.*\//, '') : '') + ':' + (c.lineNumber + 1); self[k] = (self[k] || 0) + us; });
  return Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => k + '  ' + Math.round(us / 1000) + 'ms');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = process.argv.slice(2); const build = path.resolve(a[0] || '.');
  const prof = a.indexOf('--profile') >= 0 ? a[a.indexOf('--profile') + 1] : '';
  const idle = a.indexOf('--idle') >= 0 ? +a[a.indexOf('--idle') + 1] : 10;
  const M = await measure(build, { profile: prof, idle, attrib: a.includes('--attrib'), idleLong: a.indexOf('--idlelong') >= 0 ? +a[a.indexOf('--idlelong') + 1] : 0 });
  console.log(JSON.stringify(M, null, 1));
  process.exit(0);
}
