/* __GC_PATCH_FIELDFAST_NET__ — no request hangs: a time limit, a retry, a cap (tools/patch_FIELDFAST.py).   (patch FIELDFAST)
   Owner 11/21 (GrayCo Field, iPhone): "The app has got to work quickly while I'm in the field" · "It's so slow".
   Measured (tools/tests/test_FIELDTAPS.mjs, iPhone, CPU x4): after a network stall while the app opened, 127 requests hung
   until the phone's ~40 s socket timeout and nothing asked again sooner — Home stayed empty 34-51 s, the sync pill said
   "All sent". This first network layer (right after patch RESUME; every fetch wrapper sits on top of it) for the database (/rest/v1, /storage/v1,
   /functions/v1) and the Netlify functions:
   • a READ (GET / HEAD, and the gc_my_access check) has a time limit for its answer to start (8 s, then 10 s, then 15 s; a
     function 12 s / 20 s; a file 15 s / 30 s): past it the request is cancelled and asked again (0.4 s, 1.2 s later); the
     third miss fails like a dropped connection (TypeError) — never 40 s of nothing;
   • at most 6 reads are on their way at once; the others wait in a queue: what a tap asked for (the 3 s after it) first,
     then the lists the screen needs (projects, people, schedule, leads, approvals, the sync's own reads, the sign-in's
     checks), then the other lists, then files and functions;
   • back online, or back in the app (visible / pageshow / resume): every read still waiting for its first answer from before
     that moment is on a dead socket — it is cancelled and asked again at once (the RESUME catch-up pull then finds the
     network working instead of waiting behind a hung read);
   • a WRITE is never repeated here (a send / text / e-mail must not go twice): it starts at once (no queue) and has a long
     limit that grows with its size (20 s + 1 s per 25 KB; a function 30 s, a server function 60 s); past it, it fails like
     a dropped connection and the app's own save queue sends it again ("Saved on phone, will send");
   • sign-in (/auth/v1), keepalive beacons, requests that are not ours and Request objects: untouched.
   window.__gcNet.stuck() — the network is not answering (offline, a read waiting > 5 s, or reads failing with none
   answered since): GrayCo Field's sync pill says "Offline — showing saved data" then, never "All sent".
   Off on this device: localStorage gc_fieldfast_off = '1'.  Console: __gcNet.state() */
(function(){
'use strict';
var W = window, D = document;
if (W.__gcNet) return;
var off = false; try { off = W.localStorage.getItem('gc_fieldfast_off') === '1'; } catch (e) {}
var NF = W.fetch, nST = W.setTimeout, nCT = W.clearTimeout, aEL = W.addEventListener;
var CAP = 6, TAP_AT = 0;
var ST = { off: off, cap: CAP, active: 0, queued: 0, maxActive: 0, maxQueued: 0, timeouts: 0, retries: 0, revived: 0, failed: 0, ok: 0, writes: 0, writeTimeouts: 0, lastOkAt: 0, lastFailAt: 0, revivedAt: 0 };
var Q = [], ACT = [], seq = 0;
function now(){ return Date.now(); }
function s(v){ return v == null ? '' : String(v); }
/* the jobs have loaded: a pull got through, the app has jobs, or the first-open copy came (patch FIELDFAST_BOOT) */
W._gcDataLoaded = function(){
  try { if (W.__gcPulledOkAt) return true; var c = W._crm; if (c && Array.isArray(c.projects) && c.projects.length) return true;
    var b = W._gcBootLists && W._gcBootLists.lists && W._gcBootLists.lists(); if (b && Array.isArray(b.projects)) return true; } catch (e) {}
  return false;
};
var API = W.__gcNet = {
  off: off,
  state: function(){ var o = JSON.parse(JSON.stringify(ST)); o.active = ACT.length; o.queued = Q.length; o.oldest = ACT.reduce(function(m, a){ return a.head ? m : Math.max(m, now() - a.t0); }, 0); return o; },
  /* the network is not answering: offline, a read waiting > 5 s for its answer, or reads failing with none answered since */
  stuck: function(){
    try { if (W.navigator && W.navigator.onLine === false) return true; } catch (e) {}
    var t = now();
    for (var i = 0; i < ACT.length; i++) if (!ACT[i].head && t - ACT[i].t0 > 5000) return true;
    return ST.lastFailAt > ST.lastOkAt && t - ST.lastFailAt < 60000;
  },
  busy: function(){ return ACT.length + Q.length; },
  revive: function(why){ return revive(why || 'call'); }
};
if (off || typeof NF !== 'function') return;

var SBH = /\.supabase\.co$/i, FNH = { 'graycocrm1.netlify.app': 1, 'crm.grayco-cs.com': 1 };
var CORE = /(^|[",(.])(projects|users|schedule|leads|customers|estimates|timesheets|gc_approval_queue|gc_apx_decided_approvals|gc_job_messages|gc_office_tasks|gc_deleted_projects|gc_tombstones|gc_field_settings)([",)&]|$)/;
function urlStr(input){ try { return typeof input === 'string' ? input : (input instanceof URL ? input.href : ''); } catch (e) { return ''; } }
/* what kind of request: null = not ours (untouched) */
function classify(input, init){
  var u = urlStr(input); if (!u) return null;
  if (init && init.keepalive) return null;
  var x; try { x = new URL(u, W.location.href); } catch (e) { return null; }
  var p = x.pathname, m = s((init && init.method) || 'GET').toUpperCase(), kind = '';
  if (SBH.test(x.host)) {
    if (p.indexOf('/rest/v1/') === 0) kind = 'rest';
    else if (p.indexOf('/storage/v1/') === 0) kind = 'file';
    else if (p.indexOf('/functions/v1/') === 0) kind = 'edge';
    else return null;                                   /* /auth/v1 (sign-in, token refresh) and the rest: untouched */
  } else if (p.indexOf('/.netlify/functions/') === 0 && (x.origin === W.location.origin || FNH[x.host])) kind = 'fn';
  else return null;
  var read = m === 'GET' || m === 'HEAD' || (kind === 'rest' && m === 'POST' && /\/rest\/v1\/rpc\/gc_my_access$/.test(p));
  var o = { kind: kind, read: read, url: u, pri: 2, tmo: null };
  if (read) {
    var q = ''; try { q = decodeURIComponent(x.search); } catch (e) { q = x.search; }
    if (kind === 'rest') o.pri = (/key=in\.\(/.test(q) || CORE.test(q) || /\/(gc_staff|rpc\/)/.test(p)) ? 0 : 1;
    o.tmo = kind === 'rest' ? [8000, 10000, 15000] : kind === 'file' ? [15000, 30000] : [12000, 20000];
  } else {
    var n = 0; try { var b = init && init.body; n = typeof b === 'string' ? b.length : (b && (b.size || b.byteLength)) || 0; } catch (e) {}
    o.tmo = [kind === 'fn' ? 30000 + n / 25 : kind === 'edge' ? 60000 + n / 25 : 20000 + n / 25];
  }
  return o;
}
function netErr(why){ var e = new TypeError('Failed to fetch (' + why + ')'); e.gcTimeout = true; return e; }
function abortErr(){ try { return new DOMException('The operation was aborted.', 'AbortError'); } catch (e) { var x = new Error('The operation was aborted.'); x.name = 'AbortError'; return x; } }

/* one request: its attempts, its queue place, its own cancel */
function run(input, init, c){
  return new Promise(function(resolve, reject){
    var R = { c: c, n: 0, done: false, t0: 0, head: false, ctl: null, timer: 0, why: '', seq: ++seq, pri: now() - TAP_AT < 3000 ? -1 : c.pri, extra: 0 };   /* asked for by a tap: first in line */
    var sig = init && init.signal;
    var finish = function(ok, v){ if (R.done) return; R.done = true; drop(R); if (ok) resolve(v); else reject(v); pump(); };
    if (sig) {
      if (sig.aborted) return reject(sig.reason !== undefined ? sig.reason : abortErr());
      try { sig.addEventListener('abort', function(){ var i = Q.indexOf(R); if (i >= 0) Q.splice(i, 1); if (R.ctl) { R.why = 'caller'; try { R.ctl.abort(); } catch (e) {} } finish(false, sig.reason !== undefined ? sig.reason : abortErr()); }); } catch (e) {}
    }
    R.go = function(){
      if (R.done) return;
      var ms = c.tmo[Math.min(R.n, c.tmo.length - 1)]; R.n++;
      var ctl = R.ctl = new AbortController(), o = Object.assign({}, init || {}); o.signal = ctl.signal;
      R.t0 = now(); R.head = false; R.why = '';
      ACT.push(R); if (ACT.length > ST.maxActive) ST.maxActive = ACT.length;
      R.timer = nST.call(W, function(){ R.why = 'timeout'; try { ctl.abort(); } catch (e) {} }, ms);
      var p; try { p = NF.call(W, input, o); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function(res){
        nCT.call(W, R.timer); R.head = true; ST.ok++; ST.lastOkAt = now(); finish(true, res);
      }, function(err){
        nCT.call(W, R.timer); drop(R);
        if (R.done) return;
        var why = R.why;
        if (why === 'caller') return;
        var again = c.read && (why === 'revive' || ((why === 'timeout' || (err && err.name === 'TypeError')) && R.n < c.tmo.length + R.extra && !(W.navigator && W.navigator.onLine === false && why !== 'timeout')));
        if (why === 'timeout') { ST.timeouts++; if (!c.read) ST.writeTimeouts++; }
        if (again) {
          ST.retries++;
          var wait = why === 'revive' ? 0 : (R.n === 1 ? 400 : 1200);
          R.pri = -1;                                    /* asked again: first in line */
          nST.call(W, function(){ if (!R.done) { Q.push(R); pump(); } }, wait);
          pump(); return;
        }
        ST.failed++; ST.lastFailAt = now();
        finish(false, why === 'timeout' ? netErr('no answer in ' + Math.round(c.tmo[Math.min(R.n - 1, c.tmo.length - 1)] / 1000) + ' s') : err);
      });
    };
    if (c.read) { Q.push(R); pump(); } else { ST.writes++; R.go(); }
  });
}
function drop(R){ var i = ACT.indexOf(R); if (i >= 0) ACT.splice(i, 1); }
function reads(){ var n = 0; for (var i = 0; i < ACT.length; i++) if (ACT[i].c.read) n++; return n; }
function pump(){
  while (Q.length && reads() < CAP) {
    var best = 0;
    for (var i = 1; i < Q.length; i++) if (Q[i].pri < Q[best].pri || (Q[i].pri === Q[best].pri && Q[i].seq < Q[best].seq)) best = i;
    var R = Q.splice(best, 1)[0];
    if (!R.done) R.go();
  }
  if (Q.length > ST.maxQueued) ST.maxQueued = Q.length;
}
/* back online / back in the app: a read still waiting for its first answer from before now is on a dead socket */
function revive(why){
  var t = now(), n = 0;
  ACT.slice().forEach(function(R){ if (R.c.read && !R.head && t - R.t0 > 300) { R.why = 'revive'; R.extra++; n++; try { R.ctl.abort(); } catch (e) {} } });
  if (n) { ST.revived += n; ST.revivedAt = t; }
  return n;
}
try {
  ['pointerdown', 'keydown', 'touchstart'].forEach(function(t){ aEL.call(W, t, function(e){ if (!e || e.isTrusted !== false) TAP_AT = now(); }, { capture: true, passive: true }); });
  aEL.call(W, 'online', function(){ revive('online'); }, true);
  aEL.call(W, 'pageshow', function(e){ if (e && e.persisted) revive('pageshow'); }, true);
  aEL.call(D, 'visibilitychange', function(){ if (D.visibilityState === 'visible') revive('visible'); }, true);
  aEL.call(D, 'resume', function(){ revive('resume'); }, true);
} catch (e) {}

var net = function(input, init){
  var c = null; try { c = classify(input, init); } catch (e) { c = null; }
  if (!c) return NF.apply(W, arguments);
  return run(input, init, c);
};
net.__gcNet = true;
W.fetch = net;
})();
