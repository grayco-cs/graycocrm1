#!/usr/bin/env python3
"""Idempotent patch RESUME: coming back into the app answers at once (owner 11/20, in the field, GrayCo Field on his iPhone:
"Keeps lagging when I get back into it too. The app has got to work quickly while I'm in the field." — and a blank / frozen
screen after a 5G -> Wi-Fi switch).

What happened at every return to the app (measured, docs/FASTOPEN.md "Resume"): ~90 handlers of visibilitychange / pageshow /
focus / online (the sync, the photos, the leads, the approvals, the version check, the To-Do, the badges, ...) all ran in the
same moment, AND every setInterval / setTimeout that fell due while the phone had the app suspended fired at once on the
return (iOS stops the page's timers in the background and runs every overdue one when it is back). Each started its own
cloud read and its own redraw; the first tap after the return waited behind all of it.

The patch (the 2nd script of the page, before every other script registers anything):
  1. RETURN EVENTS ARE LINED UP. A listener of window / document for visibilitychange (only when the page becomes VISIBLE),
     pageshow (only a page restored from the back-forward cache), focus (only the window's own focus after a hide or a blur of
     over 1 s — not the page's first focus or a tap that focuses the window) or online is not run
     inside the event: it goes into one queue. The queue starts after the first frame is drawn and ~0.35 s have passed (the
     first tap goes first), then runs ONE listener per task, waits longer after a long one, and holds while a finger / key is
     down (a tap within 0.25 s goes first). The same listener queued twice in one return (focus + visibilitychange +
     online) runs once. Events going the other way (the page hidden, pagehide, offline, blur) and every element's focus run as
     before, inside the event — the saves on the way out are untouched. Events the page sends itself (not isTrusted) run
     as before.
  2. OVERDUE TIMERS ARE LINED UP TOO. A setTimeout (>= 250 ms) or a setInterval (>= 400 ms) whose time came while the page
     was hidden and that fires late (> 1.2 s) after the return goes into the same queue (an interval once, however many
     ticks it missed). While the page is hidden nothing changes (a desk's background tab keeps its sync / saves exactly as
     before); before the first hide (the open itself) nothing changes either. The page's "native" timers
     (__GC_NATIVE_SETTIMEOUT__ / ..._SETINTERVAL__, the ones patches use for what must not be paced) are the browser's own
     and are never queued.
  3. Nothing of the open is run again: the queue only holds the listeners / ticks the page already had.
  The sync (Supabase Company-Wide Sync script; the queue's kill switch does not turn these off — gc_fastopen_marks_off does):
  4. THE CATCH-UP AT A RETURN (> 1 min away) AND AT "online" (a 5G -> Wi-Fi switch) was _gcPullNow(true): all 52 lists'
     values (12.9 MB of JSON) downloaded, parsed and redrawn. It is now _gcPullNow('verify'): every list checked by its exact
     cloud stamp (the FASTOPEN marks); only what changed in the cloud, was written here or was never applied is downloaded.
  5. THE 10-MINUTE "EVERYTHING AGAIN" PULL does the same ('verify'); a real full pull still runs every 6 hours and at
     _gcPullNow(true).
  6. ONE PULL AT A TIME: _gcPullNow no longer starts a pull beside a running one (it cleared the "running" flag): a call while
     one runs waits for it, then one follow-up pull runs for everyone who asked (5-7 parallel 12.9 MB pulls were measured).
     _gcFastOpen.marks.info().trace / .coalesced / .reverified show it.
Off on a device: localStorage gc_resume_off = '1'.  Console: __gcResume.state()
Usage: python3 tools/patch_RESUME.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SCRIPT = r'''<script id="gc-patch-resume">
/* __GC_PATCH_RESUME__ — coming back into the app answers at once (tools/patch_RESUME.py). Owner 11/20 (GrayCo Field, iPhone):
   "Keeps lagging when I get back into it too." At a return ~90 visibilitychange / pageshow / focus / online listeners and
   every timer that fell due in the background ran in the same moment; the first tap waited behind all of it. Here: the
   return's listeners and overdue timers go into one queue that starts after the first frame (+0.35 s), runs one per task,
   lets a tap go first, and runs a listener queued twice in one return once. Hidden-going events, element focus, events the
   page sends itself and the page's native timers: as before. While hidden and before the first hide: nothing changes.
   Off: localStorage gc_resume_off = '1'.  Console: __gcResume.state() */
(function(){
'use strict';
var W = window, D = document;
if (W.__gcResume) return;
var off = false; try { off = W.localStorage.getItem('gc_resume_off') === '1'; } catch (e) {}
var nST = W.setTimeout, nSI = W.setInterval, nCI = W.clearInterval, RAF = W.requestAnimationFrame;
/* the browser's own timers, for the patches that must never be paced (33.129 keeps the first value it finds) */
try { if (!W.__GC_NATIVE_SETINTERVAL__) W.__GC_NATIVE_SETINTERVAL__ = nSI; if (!W.__GC_NATIVE_SETTIMEOUT__) W.__GC_NATIVE_SETTIMEOUT__ = nST; if (!W.__GC_NATIVE_CLEARINTERVAL__) W.__GC_NATIVE_CLEARINTERVAL__ = nCI; } catch (e) {}
var PF = W.performance;
function now(){ try { return PF.now(); } catch (e) { return Date.now(); } }
var R = { hideAt: 0, showAt: 0, blurAt: 0, vis: true, returns: 0, q: [], draining: false, kickT: 0, inputAt: 0,
  st: { queuedEv: 0, queuedTimers: 0, deduped: 0, ran: 0, worst: 0, worstWhat: '', lastDrainMs: 0, lastReturn: null } };
var API = W.__gcResume = { off: off, state: function(){ var s = JSON.parse(JSON.stringify(R.st)); s.off = off; s.queue = R.q.length; s.returns = R.returns; s.hideAt = R.hideAt; s.showAt = R.showAt; s.visible = R.vis; return s; } };
if (off) return;
function hidden(){ try { return D.visibilityState === 'hidden'; } catch (e) { return false; } }
var ET = W.EventTarget && W.EventTarget.prototype; if (!ET || !ET.addEventListener) return;
var aEL = ET.addEventListener, rEL = ET.removeEventListener;

/* ── the return / the hide (own listeners, registered with the browser's own method: never queued) ── */
function onHide(){ if (!R.vis) return; R.vis = false; R.hideAt = Date.now(); }
function onShow(why){
  if (hidden()) return;
  var n = Date.now();
  if (!R.vis || !R.showAt || R.showAt < R.hideAt) { R.vis = true; R.showAt = n; R.returns++; R.st.lastReturn = { why: why, at: n, awayMs: R.hideAt ? n - R.hideAt : 0 }; }
  kick();
}
try {
  aEL.call(D, 'visibilitychange', function(){ if (hidden()) onHide(); else onShow('visible'); }, true);
  aEL.call(W, 'pagehide', onHide, true);
  aEL.call(W, 'pageshow', function(e){ if (e && e.persisted) onShow('pageshow'); }, true);
  aEL.call(W, 'blur', function(e){ if (e && e.target === W) R.blurAt = Date.now(); }, true);
  aEL.call(D, 'freeze', onHide, true); aEL.call(D, 'resume', function(){ onShow('resume'); }, true);
  var inp = function(){ R.inputAt = Date.now(); };
  ['pointerdown', 'touchstart', 'keydown', 'mousedown'].forEach(function(t){ aEL.call(W, t, inp, { capture: true, passive: true }); });
} catch (e) {}

/* ── the queue ── */
function label(fn){ try { return String((fn && (fn.__gcLabel || fn.name)) || fn).replace(/\s+/g, ' ').slice(0, 80); } catch (e) { return '?'; } }
function report(err){ try { if (typeof W.reportError === 'function') W.reportError(err); else nST.call(W, function(){ throw err; }, 0); } catch (e) {} }
function queue(key, run, what, kind){
  for (var i = 0; i < R.q.length; i++) if (R.q[i].key === key) { R.st.deduped++; return; }
  R.q.push({ key: key, run: run, what: what, at: Date.now() });
  if (kind === 't') R.st.queuedTimers++; else R.st.queuedEv++;
  kick();
}
function afterFrame(cb){
  var done = false, go = function(){ if (done) return; done = true; nST.call(W, cb, 0); };
  try { RAF.call(W, go); } catch (e) {}
  nST.call(W, go, 120);
}
var FIRST = 350, TAP = 250, BUDGET = 8;
function kick(){
  if (R.draining || R.kickT || !R.q.length || hidden()) return;
  var wait = Math.max(0, (R.showAt || 0) + FIRST - Date.now());
  R.kickT = nST.call(W, function(){ R.kickT = 0; afterFrame(drain); }, wait);
}
function drain(){
  if (hidden()) { R.draining = false; return; }          /* gone again: the rest waits for the next return */
  R.draining = true;
  var since = Date.now() - R.inputAt;
  if (since < TAP && !(R.q.length && Date.now() - R.q[0].at > 3000)) { nST.call(W, drain, TAP - since + 30); return; }   /* a tap / key: it goes first */
  var t0 = now(), d = 0;
  while (R.q.length) {
    var it = R.q.shift(), a = now();
    try { it.run(); } catch (e) { report(e); }
    var ms = now() - a; R.st.ran++; if (ms > R.st.worst) { R.st.worst = Math.round(ms); R.st.worstWhat = it.what; }
    d = now() - t0; if (d > BUDGET) break;
  }
  if (R.q.length) nST.call(W, drain, d > 50 ? Math.min(250, Math.round(d)) : 16);
  else { R.draining = false; R.st.lastDrainMs = R.showAt ? Date.now() - R.showAt : 0; }
}

/* ── 1. return events ── */
var TYPES = { visibilitychange: 1, pageshow: 1, focus: 1, online: 1 };
var MAP = new WeakMap();
function isReturn(e){
  if (!e || !(e.isTrusted || W.__GC_RESUME_SIM__)) return false;
  var t = e.type;
  if (t === 'visibilitychange') return !hidden() && R.hideAt > 0;
  if (t === 'pageshow') return !!e.persisted;
  if (t === 'focus') {
    /* only the window coming back: after a hide (the app switcher / another app) or a window blur of over 1 s — never the
       page's first focus or a tap that focuses the window (that runs inside the event, as before) */
    if (e.target !== W) return false;
    var n = Date.now(), back = (R.blurAt && n - R.blurAt > 1000) || (R.hideAt && R.showAt >= R.hideAt && n - R.showAt < 2500);
    R.blurAt = 0; return !!back;
  }
  return t === 'online';
}
function keyOf(type, o, tgt){ var c = typeof o === 'boolean' ? o : !!(o && o.capture); return (tgt === W ? 'w' : 'd') + type + (c ? 1 : 0); }
ET.addEventListener = function(type, fn, o){
  var tgt = this;
  if (!fn || !TYPES[type] || (tgt !== W && tgt !== D) || (typeof fn !== 'function' && typeof fn !== 'object')) return aEL.apply(tgt, arguments);
  var m = MAP.get(fn); if (!m) { m = {}; MAP.set(fn, m); }
  var k = keyOf(type, o, tgt), w = m[k];
  if (!w) {
    w = m[k] = function(e){
      if (isReturn(e)) {
        if (e.type === 'online' || e.type === 'focus') onShow(e.type);
        var self = this;
        queue(fn, function(){ return typeof fn === 'function' ? fn.call(self, e) : fn.handleEvent(e); }, e.type + ' · ' + label(typeof fn === 'function' ? fn : fn.handleEvent), 'e');
        return;
      }
      return typeof fn === 'function' ? fn.call(this, e) : fn.handleEvent(e);
    };
  }
  var a = Array.prototype.slice.call(arguments); a[1] = w;
  return aEL.apply(tgt, a);
};
ET.removeEventListener = function(type, fn, o){
  var tgt = this;
  if (fn && TYPES[type] && (tgt === W || tgt === D)) { var m = MAP.get(fn), w = m && m[keyOf(type, o, tgt)]; if (w) { var a = Array.prototype.slice.call(arguments); a[1] = w; return rEL.apply(tgt, a); } }
  return rEL.apply(tgt, arguments);
};

/* ── 2. overdue timers ── */
var CATCH = 1200, SETTLE = 400;
/* true when the call was taken over: a timer whose time came while the page was hidden and that fires > 1.2 s late.
   Visible now: it goes into the queue. Still hidden: the phone may be waking (iOS runs the overdue timers before it says
   "visible"), so it waits 0.4 s: visible by then -> the queue; still hidden (a desk's background tab) -> it runs, as before. */
function late(due, key, run, what){
  if (!R.hideAt) return false;                            /* never hidden (the open): as before */
  var n = Date.now(); if (n - due < CATCH || due < R.hideAt - CATCH) return false;
  if (!hidden()) { if (!R.vis || R.showAt < R.hideAt) onShow('timer'); queue(key, run, what, 't'); return true; }
  nST.call(W, function(){
    if (!hidden()) { if (!R.vis || R.showAt < R.hideAt) onShow('timer'); queue(key, run, what, 't'); }
    else { try { run(); } catch (e) { report(e); } }
  }, SETTLE);
  return true;
}
var tSeq = 0;
W.setTimeout = function(fn, ms){
  if (typeof fn !== 'function' || !(ms >= 250)) return nST.apply(W, arguments);
  var a = Array.prototype.slice.call(arguments), due = Date.now() + ms, f = fn, id = ++tSeq;
  a[0] = function(){
    var self = this, args = arguments;
    if (late(due, 't' + id, function(){ return f.apply(self, args); }, 'timeout · ' + label(f))) return;
    return f.apply(this, args);
  };
  return nST.apply(W, a);
};
W.setInterval = function(fn, ms){
  if (typeof fn !== 'function' || !(ms >= 400)) return nSI.apply(W, arguments);
  var a = Array.prototype.slice.call(arguments), last = Date.now(), f = fn, id = ++tSeq, held = false;
  a[0] = function(){
    var n = Date.now(), prev = last, self = this, args = arguments; last = n;
    if (held) return;                                     /* one catch-up tick is already waiting: the missed ones are not run again */
    if (n - prev > ms + CATCH && late(prev + ms, 'i' + id, function(){ held = false; return f.apply(self, args); }, 'interval · ' + label(f))) { held = true; return; }
    return f.apply(this, args);
  };
  return nSI.apply(W, a);
};
})();
</script>
'''

ANCHOR = '<script id="gc-patch-supply">'

# 4-6. the sync: one pull at a time; the 10-minute pull and the return / back-online catch-up check each list by its stamp
PULLNOW_OLD = """window._gcPullNow = async function(full){
  /* 33.144 (patch N): everything again only every 10 minutes (or _gcPullNow(true)); otherwise what changed */
  if(full === true){ _lastPull = {}; _pmDrop(); __gcLastFullPull = Date.now(); }
  else if(Date.now() - __gcLastFullPull > 600000){
    /* patch FASTOPEN: the first pull of an open starts from the marks the last open kept (each checked against this device's copy) */
    if(!__gcLastFullPull && _pmMayRestore()) __gcLastFullPull = Date.now();
    else { _lastPull = {}; _pmDrop(); __gcLastFullPull = Date.now(); }
  }
  _syncing = false;
  await pullAll(true);
  console.log('[GC Sync] Pulled latest from the cloud.');
};
"""
PULLNOW_NEW = """/* patch RESUME (tools/patch_RESUME.py) — the sync at a return to the app.
   (a) ONE PULL AT A TIME. _gcPullNow cleared the "a pull is running" flag (_syncing) and started another pull beside the
       running one; at a return the focus / visibility / tab / catch-up handlers called it 4-7 times within seconds. Measured
       on the owner-iPhone profile: 5-7 downloads of all 52 lists (12.9 MB of JSON each) side by side on one slow link, all
       arriving ~90 s later and parsed together (the page ran out of memory and closed). Now a call while a pull runs waits for
       it, then ONE follow-up pull runs for all who asked meanwhile (the widest ask: full > 'verify' > what changed). A pull
       running for over 3 minutes is taken as stuck and a new one goes, as before. Not before the open's first pull is done
       (the open is unchanged).
   (b) 'verify' (the catch-up at a return after a minute away and at "online" — a 5G -> Wi-Fi switch) and the 10-minute
       "everything again" pull no longer download every list's value: each list is checked the way an open checks it
       (FASTOPEN): a list this page applied, that nothing wrote here since (the write watch; a list the screen wrote back
       unchanged is recognised by its fingerprint) and whose cloud stamp is still EXACTLY the one applied is not downloaded
       again. Every other list (changed in the cloud with any stamp, even from a slow clock; written here; never applied; the
       delete lists) is downloaded and merged as before. A real full pull still runs at _gcPullNow(true), every 6 hours, with
       the marks off (gc_fastopen_marks_off = '1') or when the write watch is not working. */
var __gcLastTrueFull = Date.now(), _pmFlight = null, __gcPullStart = 0, __gcPullDoneN = 0;
function _pmBusy(){
  if(!__gcPullDoneN) return null;   /* the open itself: as before (its first pull waits for Field home on a phone) */
  if(_pmFlight && Date.now() - _pmFlight.at < 180000) return _pmFlight;
  if(_syncing && __gcPullStart && Date.now() - __gcPullStart < 180000){
    var fl = { at: __gcPullStart, want: undefined, next: null };
    fl.p = new Promise(function(res){ var t0 = Date.now(); (function w(){ if(!_syncing || Date.now() - t0 > 180000) res(); else setTimeout(w, 400); })(); });
    _pmFlight = fl; fl.p.then(function(){ if(_pmFlight === fl && !fl.next) _pmFlight = null; });
    return fl;
  }
  return null;
}
/* lists written here since they were applied: still exactly what was applied? (the screen writes pulled lists back unchanged).
   The mark is taken off BEFORE the copy is read: a write after that marks it again; a copy that differs is marked again. */
async function _pmRebase(DT){
  var ks = Object.keys(_pmApplied).filter(function(k){ var e = _pmApplied[k]; return e && e.u && e.hu && e.h && DT.has(k) && SYNC_KEYS.indexOf(k) >= 0; });
  var t0 = Date.now();
  for(var i = 0; i < ks.length && Date.now() - t0 < 8000; i++){
    var k = ks[i], e = _pmApplied[k], same = false;
    DT.clean(k);
    try{ var cur = await idbGet(k); if(cur != null){ var cs = JSON.stringify(cur); if(cs.length < 4e6) same = (await _pmHash(cs)) === e.h; } }catch(_r){}
    if(same) _pmStat.rebased = (_pmStat.rebased || 0) + 1; else DT.mark(k);
    await new Promise(function(r){ setTimeout(r, 30); });
  }
}
async function _pmReverify(){
  try{
    if(_pmOff() || Date.now() - __gcLastTrueFull > 6 * 3600e3) return false;
    var DT = window._gcFastOpen && window._gcFastOpen.dirty;
    if(!DT || DT.broken() || DT.has('*') || typeof DT.mark !== 'function') return false;
    await _pmRebase(DT);
    var last = {}, seed = {}, n = 0;
    Object.keys(_pmApplied).forEach(function(k){
      var e = _pmApplied[k];
      if(!e || !e.u || !e.hu || !e.h || DT.has(k) || SYNC_KEYS.indexOf(k) < 0) return;
      if(_idbSnapshot[k] === '__gc_local_differs__' || (typeof _gcsvBad === 'object' && _gcsvBad[k])) return;
      last[k] = e.u; seed[k] = e.hu; n++;
    });
    _lastPull = last; _pmSeedHeads = seed; _pmSnapKeep = {};
    _pmStat.reverified = (_pmStat.reverified || 0) + 1; _pmStat.reverifiedKept = n;
    return true;
  }catch(e){ return false; }
}
function _pmTrace(ev, full){ try{ var t = _pmStat.trace || (_pmStat.trace = []); t.push([Date.now() % 1e7, ev, full === true ? 'full' : full || '']); if(t.length > 16) t.shift(); }catch(e){} }
window._gcPullNow = async function(full){
  var _fl = _pmBusy();
  _pmTrace(_fl ? 'wait' : 'run', full);
  if(_fl){
    _fl.want = (full === true || _fl.want === true) ? true : (full === 'verify' || _fl.want === 'verify') ? 'verify' : _fl.want;
    _pmStat.coalesced = (_pmStat.coalesced || 0) + 1;
    if(!_fl.next) _fl.next = _fl.p.then(function(){}, function(){}).then(function(){ if(_pmFlight === _fl) _pmFlight = null; return window._gcPullNow(_fl.want); });
    return _fl.next;
  }
  var _me = _pmFlight = { at: Date.now(), want: undefined, next: null };
  _me.p = (async function(){
    /* 33.144 (patch N): everything again only every 10 minutes (or _gcPullNow(true)); otherwise what changed */
    var full0 = function(){ _lastPull = {}; _pmDrop(); __gcLastFullPull = __gcLastTrueFull = Date.now(); };
    if(full === true) full0();
    else if(full === 'verify'){ if(await _pmReverify()) __gcLastFullPull = Date.now(); else full0(); }
    else if(Date.now() - __gcLastFullPull > 600000){
      /* patch FASTOPEN: the first pull of an open starts from the marks the last open kept (each checked against this device's copy) */
      if(!__gcLastFullPull && _pmMayRestore()) __gcLastFullPull = Date.now();
      else if(await _pmReverify()) __gcLastFullPull = Date.now();
      else full0();
    }
    /* a timed pull that started meanwhile (while the lists were checked) is waited for, never run beside: clearing its flag
       let every following caller start one more (measured: 5 pulls of the same 15 lists at once) */
    if(__gcPullDoneN && _syncing && __gcPullStart && Date.now() - __gcPullStart < 180000){
      _pmTrace('wait-timed', full);
      await new Promise(function(res){ var t0 = Date.now(); (function w(){ if(!_syncing || Date.now() - t0 > 180000) res(); else setTimeout(w, 400); })(); });
    }
    _syncing = false;
    _pmTrace('pull', full);
    await pullAll(true);
    _pmTrace('done', full);
  })();
  try{ await _me.p; } finally { if(_pmFlight === _me && !_me.next) _pmFlight = null; }
  console.log('[GC Sync] Pulled latest from the cloud.');
};
"""
START_OLD = """  _syncing = true;
  var updated = false;
"""
START_NEW = """  _syncing = true; __gcPullStart = Date.now();   /* patch RESUME */
  var updated = false;
"""
DTAPI_OLD = """  clean: function(k){ if (D[k]) { delete D[k]; save(); } },
"""
DTAPI_NEW = """  clean: function(k){ if (D[k]) { delete D[k]; save(); } },
  mark: function(k){ mark(k); },   /* patch RESUME */
"""
# the catch-up at a return (> 1 min away) and at "online": it was _gcPullNow(true) — every list's value again
CATCH_OLD = """    ST.call(window, function(){ try{ Promise.resolve(f(true)).then(function(){ fixDisk(); fixScreen(); }, function(){}); }catch(e){} }, 1500);
"""
CATCH_NEW = """    /* patch RESUME: 'verify' — every list is checked by its EXACT cloud stamp (a list changed anywhere, with any clock, is
       downloaded; a list written here is downloaded and merged); only the unchanged ones are not downloaded again. It was
       _gcPullNow(true): at every return to the app after a minute and at every network switch (5G -> Wi-Fi fires "online")
       the phone downloaded and parsed all 52 lists, 12.9 MB of JSON, and redrew — the freezes after a return. */
    ST.call(window, function(){ try{ Promise.resolve(f('verify')).then(function(){ fixDisk(); fixScreen(); }, function(){}); }catch(e){} }, 1500);
"""
END_OLD = """  try{ _pmSaveSoon(); }catch(_ps){}   /* patch FASTOPEN */
"""
END_NEW = """  try{ _pmSaveSoon(); }catch(_ps){}   /* patch FASTOPEN */
  __gcPullDoneN++;   /* patch RESUME: pulls are lined up only once the open's first pull is done */
"""
SYNC_EDITS = ((END_OLD, END_NEW, 'pull end'), (PULLNOW_OLD, PULLNOW_NEW, 'pull now'), (START_OLD, START_NEW, 'pull start'), (DTAPI_OLD, DTAPI_NEW, 'write watch api'), (CATCH_OLD, CATCH_NEW, 'catch-up pull'))

def main():
    p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
    t = open(p, encoding='utf-8').read()
    if '__GC_PATCH_RESUME__' in t:
        print('RESUME: already applied'); return
    if t.count(ANCHOR) != 1:
        sys.exit('RESUME: anchor not found once: ' + ANCHOR)
    t = t.replace(ANCHOR, SCRIPT + ANCHOR, 1)
    for old, new, name in SYNC_EDITS:
        if t.count(old) != 1:
            sys.exit('RESUME: ' + name + ' not found once (FASTOPEN must be applied first)')
        t = t.replace(old, new, 1)
    open(p, 'w', encoding='utf-8').write(t)
    print('RESUME: applied to ' + p)

if __name__ == '__main__':
    main()
