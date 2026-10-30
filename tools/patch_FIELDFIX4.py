#!/usr/bin/env python3
"""Idempotent patch FIELDFIX4: work saved on a phone with no signal goes up within seconds of the next page load,
not at the 3-minute idle sync.

Found by the field-view audit (10/30): a material request and a progress change made with no signal (both saved on
the job), then the page reloaded, reached the cloud only ~195 s after the signal came back, while the field header
already said "All sent". The save queue (SYNCQ) keeps the waiting saves across reloads; after the reload it finds the
job list already on this phone's disk and drops the queue item, leaving the upload to the idle sync (every 180 s).

Fix: (1) a waiting save that was restored from the phone's disk after a reload asks for the CRM's own one sync
(window._gcTabChangeSync: push up, then pull down, union-merged; it waits out the database brake by itself) once it
is handled; (2) the first answer from the cloud after requests failed (the signal is back) asks for that same sync and, when
the failures were "no answer at all" (no signal; navigator.onLine often stays true on a weak cell), runs GrayCo
Photos' own "back online" step once (its upload queue had backed off to 5 minutes; it listened only for the
browser's 'online' event, which does not fire when the phone stays on a weak cell). Needs FIELDFIX2.
It never sets the "a person clicked" flag (__GC_MANUAL_AT__), which other guards read. No new timers.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* FIELDFIX4 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:80], s.count(old))
    return s.replace(old, new)

src = once(src,
  "if(v && typeof v === 'object'){ Object.keys(v).forEach(function(k){ if(!Q[k] && v[k] && 'v' in v[k]) Q[k] = v[k]; }); }",
  "if(v && typeof v === 'object'){ Object.keys(v).forEach(function(k){ if(!Q[k] && v[k] && 'v' in v[k]){ Q[k] = v[k]; Q[k].restored = 1; } }); }   " + MARK)
src = once(src,
  "var p = (sk[key] && Array.isArray(item.v) && !item.recover) ? intoLocal(key, item.v) : toCloud(key, item);",
  "var p = (sk[key] && Array.isArray(item.v) && !item.recover) ? intoLocal(key, item.v) : toCloud(key, item);\n"
  "          if(item.restored && sk[key]) p = p.then(function(r){ try{ if(typeof window._gcTabChangeSync === 'function') ST.call(window, function(){ window._gcTabChangeSync('a save from before a reload'); }, 0); }catch(e){} return r; });   /* FIELDFIX4 */")
src = once(src,
  """      if(state.failStreak>0 || state.level>0){
        state.failStreak = 0;""",
  """      if(state.failStreak>0 || state.level>0){
        /* FIELDFIX4: the cloud answers again after requests failed (a phone's signal is back): the one sync sends what waited */
        if(state.failStreak>0){ var _gcWasNet = !!state.netDown; state.netDown = false; try{ (window.__GC_NATIVE_SETTIMEOUT__||setTimeout).call(window, function(){
          if(_gcWasNet){ try{ if(typeof window._gcPhotosBackOnline === 'function') window._gcPhotosBackOnline(); }catch(e){} }   /* no answer before = no signal: the photo uploads that backed off go now */
          if(typeof window._gcTabChangeSync === 'function') window._gcTabChangeSync('the cloud answers again'); }, 0); }catch(e){} }
        state.failStreak = 0;""")
src = once(src,
  "        if(status || state.level < 2) state.level = Math.min(status ? STEPS.length-1 : 2, state.level+1);",
  "        if(status || state.level < 2) state.level = Math.min(status ? STEPS.length-1 : 2, state.level+1);\n        if(!status) state.netDown = true;   /* FIELDFIX4: remembered for the recovery */")
OLDP = "window.addEventListener('online', function(){ iall('queue').then(function(a){ a.forEach(function(it){ it.nextAt = 0; }); return iputMany('queue', a); })"
NEWP = "window._gcPhotosBackOnline = function(){ iall('queue').then(function(a){ a.forEach(function(it){ it.nextAt = 0; }); return iputMany('queue', a); })"
src = once(src, OLDP, NEWP)
OLDE = "pullSoon(2500); emit('sync'); });\n"
i = src.index(NEWP); j = src.index(OLDE, i)
assert j - i < 600
src = src[:j] + "pullSoon(2500); emit('sync'); };\nwindow.addEventListener('online', function(){ window._gcPhotosBackOnline(); });   /* FIELDFIX4: the same step, also run when the cloud answers again */\n" + src[j + len(OLDE):]
open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFIX4')
