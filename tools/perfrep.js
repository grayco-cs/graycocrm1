/* patch PERFREP: the freeze reporter. On a desktop computer, every page stall of 1 s or more is written down with
   WHICH code ran (the browser's long-animation-frame report, and — where the server allows it with the
   Document-Policy: js-profiling header — a sampling profile of the stalled seconds). An admin's computer sends the
   summary to the cloud row gc_perfrep_<device> every 2 minutes, so a freeze on a real computer can be fixed without
   anyone opening the Console. Code names and timings only: no customer data. Off on this computer: localStorage
   gc_perfrep_off = '1'. Read it back: _gcPerfRep.report().
   patch PERFREP2: every signed-in computer reports (phones too, without the profile), and it also writes down
   page errors (message + where in the code, counted) and cloud / server calls that failed (address path + status,
   counted — never what was sent). */
(function(){
'use strict';
var W = window; if (W.__gcPerfRep) return; W.__gcPerfRep = 1;
try { if (localStorage.getItem('gc_perfrep_off') === '1') return; } catch (e) { return; }
var UA = navigator.userAgent || '', MOBILE = /iPhone|iPad|Android|Mobile/.test(UA);
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
var LT = [], LOAF = [], PROF = [], ERR = {}, NET = {}, dirty = false, LIM = 1000;
var stats = { since: new Date().toISOString(), n1s: 0, n3s: 0, worst: 0, totalMs: 0 };
function view(){ try { return localStorage.getItem('grayco_view') || ''; } catch (e) { return ''; } }
function s(v){ return v == null ? '' : String(v); }

/* 1. every long task (no names, but exact times) */
try { new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){
  if (e.duration < LIM) return;
  var ms = Math.round(e.duration); stats.n1s++; if (ms >= 3000) stats.n3s++; if (ms > stats.worst) stats.worst = ms; stats.totalMs += ms;
  LT.push({ t: Math.round(e.startTime), ms: ms, v: view(), at: Date.now() }); if (LT.length > 60) LT.shift(); dirty = true;
}); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}

/* 2. long animation frames: which script / function / event handler ran, and where in the page (character position) */
try { new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){
  if (e.duration < LIM) return;
  var sc = (e.scripts || []).map(function(x){ return { ms: Math.round(x.duration), fn: s(x.sourceFunctionName).slice(0, 80), pos: x.sourceCharPosition,
    url: s(x.sourceURL).replace(/^https?:\/\/[^/]+/, '').slice(0, 60), inv: s(x.invoker).slice(0, 90), type: s(x.invokerType), layout: Math.round(x.forcedStyleAndLayoutDuration || 0) }; })
    .sort(function(a, b){ return b.ms - a.ms; }).slice(0, 6);
  LOAF.push({ t: Math.round(e.startTime), ms: Math.round(e.duration), block: Math.round(e.blockingDuration || 0), v: view(), at: Date.now(), s: sc });
  if (LOAF.length > 40) LOAF.shift(); dirty = true;
}); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}

/* 3. sampling profile of the stalled seconds (Chromium / Edge, only when the page is served with Document-Policy: js-profiling) */
var P = null, pStart = 0;
function startProf(){ try { if (MOBILE || typeof W.Profiler !== 'function') return; P = new W.Profiler({ sampleInterval: 20, maxBufferSize: 8000 }); pStart = performance.now(); } catch (e) { P = null; } }
function digest(tr, wins){
  var frames = tr.frames || [], stacks = tr.stacks || [], res = tr.resources || [], self = {}, incl = {}, n = 0;
  function fname(i){ var f = frames[i] || {}; var r = f.resourceId != null ? s(res[f.resourceId]).replace(/^https?:\/\/[^/]+/, '').slice(0, 30) : ''; return (s(f.name) || '(anon)') + ' ' + r + ':' + (f.line || 0); }
  (tr.samples || []).forEach(function(sm, i){
    var t = sm.timestamp; if (!wins.some(function(w){ return t >= w[0] && t <= w[1]; })) return;
    var nx = tr.samples[i + 1], dt = nx ? Math.min(100, nx.timestamp - t) : 20; n += dt;
    var id = sm.stackId; if (id == null) { self['(idle/native)'] = (self['(idle/native)'] || 0) + dt; return; }
    var seen = {}, first = true, guard = 0;
    while (id != null && guard++ < 200) { var st = stacks[id]; if (!st) break; var nm = fname(st.frameId);
      if (first) { self[nm] = (self[nm] || 0) + dt; first = false; }
      if (!seen[nm]) { incl[nm] = (incl[nm] || 0) + dt; seen[nm] = 1; } id = st.parentId; }
  });
  function top(o, k){ return Object.keys(o).sort(function(a, b){ return o[b] - o[a]; }).slice(0, k).map(function(x){ return Math.round(o[x]) + 'ms ' + x; }); }
  return { ms: Math.round(n), self: top(self, 15), incl: top(incl, 25) };
}
function cycle(){
  var p = P, t0 = pStart; P = null; startProf(); if (!p) return;
  var wins = LT.filter(function(x){ return x.t >= t0; }).map(function(x){ return [x.t, x.t + x.ms]; });
  p.stop().then(function(tr){
    if (!wins.length) return;
    try { var d = digest(tr, wins); if (d.ms > 0) { d.at = new Date().toISOString(); d.v = view(); d.tasks = wins.length; PROF.push(d); if (PROF.length > 8) PROF.shift(); dirty = true; } } catch (e) {}
  }, function(){});
}
startProf(); SI.call(W, cycle, 45000);

/* 4. page errors and failed cloud / server calls, counted (patch PERFREP2) */
function bump(map, k, extra, max){
  var e = map[k]; if (!e) { var ks = Object.keys(map); if (ks.length >= (max || 40)) return; e = map[k] = { n: 0, first: new Date().toISOString() }; }
  e.n++; e.last = new Date().toISOString(); e.v = view(); if (extra) for (var x in extra) e[x] = extra[x]; dirty = true;
}
try { W.addEventListener('error', function(ev){
  try { if (ev && ev.target && ev.target !== W && ev.target.tagName) { bump(ERR, 'load ' + s(ev.target.tagName) + ' ' + s(ev.target.src || ev.target.href).replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').slice(0, 80)); return; }
    bump(ERR, s(ev && ev.message).slice(0, 160) + ' @' + s(ev && ev.lineno) + ':' + s(ev && ev.colno), { stack: s(ev && ev.error && ev.error.stack).slice(0, 400) }); } catch (e) {}
}, true); } catch (e) {}
try { W.addEventListener('unhandledrejection', function(ev){
  try { var r = ev && ev.reason; bump(ERR, 'promise: ' + s(r && r.message || r).slice(0, 160), { stack: s(r && r.stack).slice(0, 400) }); } catch (e) {}
}); } catch (e) {}
var NF = W.fetch;
if (typeof NF === 'function') {
  W.fetch = function(input, init){
    var u = ''; try { u = typeof input === 'string' ? input : s(input && input.url); } catch (e) {}
    var watch = /supabase\.co\/|\/\.netlify\/functions\//.test(u), m = s(init && init.method || (input && input.method) || 'GET').toUpperCase();
    var pr = NF.apply(this, arguments);
    if (!watch) return pr;
    function key(st){ var path = u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, ''); var q = /[?&]key=(?:eq\.)?([^&]{1,60})/.exec(decodeURIComponent(u)); return m + ' ' + path.slice(0, 70) + (q ? ' key=' + q[1] : '') + ' → ' + st; }
    return pr.then(function(r){ try { if (r && !r.ok && r.status !== 304) bump(NET, key(r.status), null, 60); } catch (e) {} return r; },
                   function(err){ try { bump(NET, key('failed: ' + s(err && err.message).slice(0, 40)), null, 60); } catch (e) {} throw err; });
  };
}

/* 5. every signed-in computer sends the summary to the cloud */
var DEV = ''; try { DEV = localStorage.getItem('gc_adm_device_id') || ''; } catch (e) {}
if (!DEV) { DEV = 'P' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); try { localStorage.setItem('gc_adm_device_id', DEV); } catch (e) {} }
function report(){ return { dev: DEV, build: s(W.__GC_BUILD_ID__), at: new Date().toISOString(), view: view(), cores: navigator.hardwareConcurrency || 0,
  memGB: navigator.deviceMemory || 0, ua: UA.slice(0, 160), profiler: typeof W.Profiler === 'function', stats: stats, lt: LT.slice(-40), loaf: LOAF.slice(-25), prof: PROF.slice(-6),
  err: ERR, net: NET }; }
function signedIn(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return false; } }
function send(){
  if (!dirty || !signedIn() || typeof W._supaUpsert !== 'function') return;
  dirty = false; var r = report(); try { r.email = s(W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) {}
  try { var x = W._supaUpsert('gc_perfrep_' + DEV, r); if (x && x.catch) x.catch(function(){ dirty = true; }); } catch (e) { dirty = true; }
}
SI.call(W, send, 120000); ST.call(W, send, 60000);
try { W.addEventListener('pagehide', function(){ try { cycle(); } catch (e) {} send(); }); } catch (e) {}
W._gcPerfRep = { report: report, send: function(){ dirty = true; send(); } };
})();
