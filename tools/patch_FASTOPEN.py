#!/usr/bin/env python3
"""Idempotent patch FASTOPEN: the CRM opens faster on a phone with a weak signal (owner 11/19: "Took a long time to open up too").

Measured offline on the real-data snapshot, owner-iPhone profile (400/150 kbps, 300 ms, CPU x3), see docs/FASTOPEN.md:
  * every open (even with the page cached) downloaded every synced list again: the sync's high-water marks (_lastPull) lived
    only in page memory, so the first pull of an open asked for all 52 lists' values (12.6 MB of JSON, 0.8 MB on the wire,
    then parsed, merged and written to IndexedDB on the phone's CPU);
  * the first open after a release downloaded index.html (6.1 MB brotli) before anything showed (2+ minutes at 400 kbps),
    and with no signal the CRM did not open at all.

Part 1 — the sync's marks survive a reload (index.html, the Supabase Company-Wide Sync script):
  after each pull, the marks of the lists that were APPLIED are kept in a separate IndexedDB database (gc_fastopen), with the
  cloud's stamp seen (updated_at) and a fingerprint (SHA-256) of exactly what was written to this device's copy; at the next
  open, a list is taken as "already up to date" only if (1) the same person is signed in, (2) the marks are under 7 days old,
  (3) this device's copy is still EXACTLY what was written then (fingerprint) — so a change made here and not sent yet is
  never hidden: that list is pulled and merged as before, and the SAVES "ahead" check sends it — and (4) the cloud's stamp is
  EXACTLY the one seen then (any change, even one stamped by a computer with a slow clock, is pulled). The cheap key+stamp
  read the pull already makes decides; only the lists that changed are downloaded. A list whose apply was skipped (the
  estimate builder open, a per-computer key, the delete lists) is never kept. _gcPullNow(true) / the 10-minute full pull
  still pull everything; the kept marks are the first pull's baseline of an open.
  Off on a device: localStorage gc_fastopen_marks_off = '1'.  Console: _gcFastOpen.marks.info() / .clear()
Part 2 — the page opens from a saved copy (crm-push-sw.js + a small script after the stale gate):
  the phone-notifications service worker (/crm-push-sw.js — the one BOOTWATCH and AWAY keep) also answers the CRM page
  itself (/ and /index.html, nothing else) from the cache gc-crm-shell-v1, which the PAGE fills: it checks /version.txt,
  keeps its own build (a cheap revalidated read), downloads a NEW build once the phone is idle (checked to really be that
  build before it is kept) and marks the copy "stale" as soon as it sees a newer build is live (a reload then goes to the
  network, so "Tap to update" always gets the new build). Phones / GrayCo Field: "fast" (the copy opens at once; the stale
  gate holds an out-of-date copy's automatic uploads and sweeps; BOOTWATCH's banner offers the update, which is instant when
  the new build is already saved). Desk: "safe" (network first; the copy only with no answer in 8 s / no signal).
  BOOTWATCH's update and the AWAY clean-up keep the copy only when it holds the live build.
  Off on a device: localStorage gc_fastopen_sw_off = '1' (the cache is emptied).  Console: _gcFastOpen.sw.info()
Usage: python3 tools/patch_FASTOPEN.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

MARKS = r'''var _lastPull = {};
/* patch FASTOPEN (part 1): the marks survive a reload — see tools/patch_FASTOPEN.py. _pmSeedHeads: the cloud stamp each kept
   list had when it was applied (a list is skipped only while the cloud still shows EXACTLY that stamp); _pmApplied: what can
   be kept at the end of this pull ({u: the row's updated_at, hu: the stamp in the key+stamp read, h: fingerprint of what was
   written here}). */
var _pmSeedHeads = {}, _pmApplied = {}, _pmHeadsNow = {}, _pmSnapKeep = {}, _pmNoRestore = false, _pmRestoreP = null, _pmSeq = 0, _pmSaveT = null;
var _pmStat = { restored: 0, seeded: 0, mismatch: 0, missing: 0, unchanged: 0, changed: 0, saves: 0, lastSave: 0, mis: [], why: '', ms: 0, pulled: [] };
function _pmOff(){ try{ return localStorage.getItem('gc_fastopen_marks_off') === '1'; }catch(e){ return false; } }
function _pmUser(){ try{ return String((window.__GC_AUTH__ && window.__GC_AUTH__.email && window.__GC_AUTH__.email()) || '').toLowerCase(); }catch(e){ return ''; } }
function _pmDB(){
  return new Promise(function(res){
    try{ var q = indexedDB.open('gc_fastopen', 1); q.onupgradeneeded = function(){ try{ q.result.createObjectStore('m'); }catch(e){} };
      q.onsuccess = function(){ res(q.result); }; q.onerror = function(){ res(null); }; q.onblocked = function(){ res(null); }; }catch(e){ res(null); }
  });
}
function _pmDbGet(){ return _pmDB().then(function(db){ if(!db) return null; return new Promise(function(res){ try{ var g = db.transaction('m','readonly').objectStore('m').get('marks'); g.onsuccess = function(){ res(g.result || null); db.close(); }; g.onerror = function(){ res(null); db.close(); }; }catch(e){ res(null); } }); }); }
function _pmDbPut(v){ return _pmDB().then(function(db){ if(!db) return false; return new Promise(function(res){ try{ var tx = db.transaction('m','readwrite'); if(v === null) tx.objectStore('m').delete('marks'); else tx.objectStore('m').put(v, 'marks'); tx.oncomplete = function(){ res(true); db.close(); }; tx.onerror = function(){ res(false); db.close(); }; }catch(e){ res(false); } }); }); }
function _pmHash(s){
  s = String(s);
  try{
    if(window.crypto && crypto.subtle && typeof TextEncoder === 'function'){
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function(b){ var a = new Uint8Array(b), o = ''; for(var i = 0; i < a.length; i++) o += ('0' + a[i].toString(16)).slice(-2); return 's' + s.length + ':' + o; });
    }
  }catch(e){}
  var h1 = 0x811c9dc5, h2 = 0x1b873593;
  for(var i = 0; i < s.length; i++){ var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822507) >>> 0; }
  return Promise.resolve('f' + s.length + ':' + h1.toString(16) + h2.toString(16));
}
/* the first pull of an open: what the last open kept. A list is kept only if nothing wrote this device's copy since (the write
   watch, script gc-patch-fastopen-dirty, marks every IndexedDB write of a list that is not the sync's own apply — atomic enough:
   it is recorded BEFORE the write is made) and the copy is still there (a key-only read, no value is read or parsed) */
function _pmRestoreOnce(){
  if(_pmRestoreP) return _pmRestoreP;
  var t0 = Date.now();
  var job = (async function(){
    /* a phone: the first pull waits for the first screen (Field home) — its download and apply never compete with drawing it */
    try{ if(!_pmOff() && window._gcDevice && window._gcDevice.fieldDevice && window._gcDevice.fieldDevice()){
      var tw = Date.now();
      while(Date.now() - tw < 45000){ var bw = window._gcBootWatch && window._gcBootWatch.state().boot; if(bw && bw.m && bw.m.paint != null) break; await new Promise(function(r){ setTimeout(r, 500); }); }
      await new Promise(function(r){ setTimeout(r, 1500); }); _pmStat.waitedMs = Date.now() - tw;
    } }catch(_w){}
    if(_pmOff()){ _pmStat.why = 'off'; return; }
    var DT = window._gcFastOpen && window._gcFastOpen.dirty;
    try{ if(DT) await DT.ready(); }catch(_dr){}
    if(!DT || DT.broken() || DT.has('*')){ _pmStat.why = !DT ? 'no write watch' : 'write watch lost / copy wiped'; return; }
    var who = _pmUser(); if(!who){ _pmStat.why = 'not signed in'; return; }
    var rec = await _pmDbGet();
    if(!rec || rec.v !== 3 || !rec.m){ _pmStat.why = 'nothing kept'; return; }
    if(rec.user !== who){ _pmStat.why = 'another person'; return; }
    if(!(Date.now() - rec.at < 7 * 864e5)){ _pmStat.why = 'older than 7 days'; return; }
    var ks = Object.keys(rec.m).filter(function(k){ var e = rec.m[k]; return SYNC_KEYS.indexOf(k) >= 0 && e && e.u && e.hu && e.h; });
    _pmStat.restored = ks.length;
    var here = await _spOpenDB().then(function(db){ return new Promise(function(res){
      var out = {}; if(!db){ res(out); return; }
      try{ var st = db.transaction('kv', 'readonly').objectStore('kv'), n = ks.length; if(!n){ res(out); return; }
        ks.forEach(function(k){ var q = st.getKey ? st.getKey(k) : st.count(k); q.onsuccess = function(){ if(q.result !== undefined && q.result !== 0) out[k] = 1; if(--n === 0) res(out); }; q.onerror = function(){ if(--n === 0) res(out); }; });
      }catch(e){ res(out); }
    }); });
    for(var i = 0; i < ks.length; i++){
      var k = ks[i], e = rec.m[k];
      if(_pmNoRestore) { _pmStat.why = 'a full pull was asked for'; break; }
      if(Object.prototype.hasOwnProperty.call(_lastPull, k)) continue;
      if(!here[k]){ _pmStat.missing++; continue; }
      if(DT.has(k)){ _pmStat.mismatch++; if(_pmStat.mis.length < 20) _pmStat.mis.push(k); continue; }
      _lastPull[k] = e.u; _pmSeedHeads[k] = e.hu; _pmApplied[k] = { u: e.u, hu: e.hu, h: e.h };
      _pmStat.seeded++;
    }
  })().catch(function(e){ _pmStat.why = 'error: ' + (e && e.message || e); });
  _pmRestoreP = Promise.race([job, new Promise(function(r){ setTimeout(r, 60000); })]).then(function(){ _pmStat.ms = Date.now() - t0; });
  return _pmRestoreP;
}
function _pmMayRestore(){ return !_pmOff() && !_pmNoRestore; }
function _pmDrop(){ _pmNoRestore = true; _pmSeedHeads = {}; _pmSnapKeep = {}; }
/* a list was applied: keep its stamp and the fingerprint of what was written here (only when this device is not ahead of the cloud) */
function _pmDone(k, u, v, isJson){
  var hu = _pmHeadsNow[k]; if(!u || !hu) return;
  var js; try{ js = isJson ? v : JSON.stringify(v); }catch(e){ return; }
  var seq = ++_pmSeq; _pmApplied[k] = { seq: seq };
  try{ var DT = window._gcFastOpen && window._gcFastOpen.dirty; if(DT) DT.clean(k); }catch(e){}   /* this device's copy = the applied cloud version */
  _pmHash(js).then(function(h){ if(_pmApplied[k] && _pmApplied[k].seq === seq) _pmApplied[k] = { u: u, hu: hu, h: h }; });
}
function _pmSaveSoon(late){
  if(_pmSaveT || _pmOff()) return;
  _pmSaveT = setTimeout(async function(){
    _pmSaveT = null;
    var who = _pmUser(); if(!who) return;
    var DT = window._gcFastOpen && window._gcFastOpen.dirty; if(!DT || DT.broken()) return;
    if(DT.wiped() && /wiped/.test(_pmStat.why)) DT.unwipe();   /* the store was cleared BEFORE this open's first pull: what this open applied is current */
    var m = {}, ks = Object.keys(_pmApplied);
    for(var i = 0; i < ks.length; i++){
      var k = ks[i], e = _pmApplied[k];
      if(!e || !e.u || !e.hu || !e.h || _idbSnapshot[k] === '__gc_local_differs__' || (typeof _gcsvBad === 'object' && _gcsvBad[k])) continue;
      /* written here since: kept again only if this device's copy is EXACTLY what was applied (the screen often writes a pulled
         list back unchanged), or exactly the sync's own base for it (nothing waiting to go up). Checked once the open has settled. */
      if(DT.has(k)){
        if(!late) continue;
        try{
          var cur = await idbGet(k); if(cur == null) continue;
          var cs = JSON.stringify(cur), ch = await _pmHash(cs);
          if(ch === e.h){ DT.clean(k); _pmStat.rebased = (_pmStat.rebased || 0) + 1; }
          else if(cs === _idbSnapshot[k]){ DT.clean(k); e = _pmApplied[k] = { u: e.u, hu: e.hu, h: ch }; _pmStat.rebased = (_pmStat.rebased || 0) + 1; }
          else continue;
        }catch(_rb){ continue; }
        await new Promise(function(r){ setTimeout(r, 50); });
      }
      m[k] = { u: e.u, hu: e.hu, h: e.h };
    }
    _pmDbPut({ v: 3, user: who, at: Date.now(), m: m }).then(function(ok){ if(ok){ _pmStat.saves++; _pmStat.lastSave = Date.now(); _pmStat.kept = Object.keys(m).length; } });
  }, late ? 500 : 2500);
}
window._gcFastOpen = window._gcFastOpen || {};
window._gcFastOpen.marks = {
  info: function(){ return JSON.parse(JSON.stringify(Object.assign({}, _pmStat, { seededNow: Object.keys(_pmSeedHeads), applied: Object.keys(_pmApplied).length }))); },
  clear: function(){ _pmDrop(); _pmApplied = {}; return _pmDbPut(null); }
};
'''

PULLNOW_OLD = "  if(full === true || Date.now() - __gcLastFullPull > 600000){ _lastPull = {}; __gcLastFullPull = Date.now(); }\n"
PULLNOW_NEW = ("  if(full === true){ _lastPull = {}; _pmDrop(); __gcLastFullPull = Date.now(); }\n"
               "  else if(Date.now() - __gcLastFullPull > 600000){\n"
               "    /* patch FASTOPEN: the first pull of an open starts from the marks the last open kept (each checked against this device's copy) */\n"
               "    if(!__gcLastFullPull && _pmMayRestore()) __gcLastFullPull = Date.now();\n"
               "    else { _lastPull = {}; _pmDrop(); __gcLastFullPull = Date.now(); }\n"
               "  }\n")

PULL_START_OLD = "  _syncing = true;\n  var updated = false;\n  try{\n    // DISK IO: two-phase pull."
PULL_START_NEW = "  _syncing = true;\n  var updated = false;\n  try{\n    try{ await _pmRestoreOnce(); }catch(_pr){}   /* patch FASTOPEN */\n    // DISK IO: two-phase pull."

HEADS_OLD = "      var seen = _lastPull[h.key];\n      return !(seen && seen >= h.updated_at);\n"
HEADS_NEW = ("      _pmHeadsNow[h.key] = h.updated_at;   /* patch FASTOPEN */\n"
             "      if(Object.prototype.hasOwnProperty.call(_pmSeedHeads, h.key)){   /* kept from the last open: unchanged only if the cloud's stamp is EXACTLY the one seen then */\n"
             "        if(h.updated_at === _pmSeedHeads[h.key]){ _pmStat.unchanged++; return false; }\n"
             "        delete _pmSeedHeads[h.key]; delete _lastPull[h.key]; delete _pmSnapKeep[h.key]; _pmStat.changed++; return true;\n"
             "      }\n"
             "      var seen = _lastPull[h.key];\n      return !(seen && seen >= h.updated_at);\n")

CHANGED_OLD = "    if(_changed.length){\n      console.log('[GC Sync] '+_changed.length+' of '+_heads.length+' tables changed — downloaded only those.');\n    }\n"
CHANGED_NEW = ("    if(_changed.length){\n      console.log('[GC Sync] '+_changed.length+' of '+_heads.length+' tables changed — downloaded only those.');\n    }\n"
               "    try{ if(_pmStat.seeded && !_pmStat.logged){ _pmStat.logged = 1; _pmStat.pulled = _changed.map(function(h){ return h.key; }); console.log('[GC Sync] FASTOPEN: ' + _changed.length + ' of ' + _heads.length + ' lists changed since this device last pulled (' + _pmStat.seeded + ' kept, checked in ' + _pmStat.ms + ' ms).'); } }catch(_pl){}\n")

ROW_OLD = "      if(lastSeen && lastSeen >= row.updated_at) continue; // no change\n      _lastPull[row.key] = row.updated_at;\n"
ROW_NEW = ("      if(lastSeen && lastSeen >= row.updated_at) continue; // no change\n      _lastPull[row.key] = row.updated_at;\n"
           "      delete _pmApplied[row.key]; delete _pmSeedHeads[row.key]; delete _pmSnapKeep[row.key];   /* patch FASTOPEN: kept again only once this version is applied */\n")

SAME_OLD = "      if(_rem !== null && _idbSnapshot[row.key] === _rem) continue;\n"
SAME_NEW = "      if(_rem !== null && _idbSnapshot[row.key] === _rem){ _pmDone(row.key, row.updated_at, _rem, true); continue; }   /* patch FASTOPEN: already this */\n"

SET_OLD = "      await idbSet(row.key, _val);\n      // Mark this value as \"already known\" for the diff-pusher."
SET_NEW = "      var _pmDT = window._gcFastOpen && window._gcFastOpen.dirty; if(_pmDT) _pmDT.quiet(row.key, true);   /* patch FASTOPEN: the sync's own apply is not a change made here */\n      var _pmOk = await idbSet(row.key, _val);\n      if(_pmDT) _pmDT.quiet(row.key, false);\n      // Mark this value as \"already known\" for the diff-pusher."

APPLY_OLD = ("        else _idbSnapshot[row.key] = _rem;\n      }\n      // Push the freshly-pulled value into the running app's state.")
APPLY_NEW = ("        else _idbSnapshot[row.key] = _rem;\n      }\n"
             "      try{ if(_pmOk && _idbSnapshot[row.key] !== '__gc_local_differs__') _pmDone(row.key, row.updated_at, _val); }catch(_pd){}   /* patch FASTOPEN */\n"
             "      // Push the freshly-pulled value into the running app's state.")

END_OLD = ("  }catch(e){\n    console.warn('[GC Sync] Pull failed:', e.message);\n  }\n  _syncing = false;\n}\n\n// ── Hook into every IDB write in the CRM")
END_NEW = ("  }catch(e){\n    console.warn('[GC Sync] Pull failed:', e.message);\n  }\n  _syncing = false;\n  try{ _pmSaveSoon(); }catch(_ps){}   /* patch FASTOPEN */\n}\n\n// ── Hook into every IDB write in the CRM")

SNAP_OLD = "    if(_idbSnapshot[SYNC_KEYS[i]] === '__gc_local_differs__') continue;   /* SAVES: this computer has what the cloud lacks: keep it to send */\n"
SNAP_NEW = SNAP_OLD

AWAY_OLD = "if(typeof caches!=='undefined'){caches.keys().then(function(k){k.forEach(function(n){caches.delete(n)})})}</script>"
AWAY_NEW = "if(typeof caches!=='undefined'){caches.keys().then(function(k){k.forEach(function(n){if(!/^gc-crm-shell-/.test(n))caches.delete(n)})})}/* FASTOPEN: the CRM's saved page (gc-crm-shell-*) is kept; its own script keeps it right */</script>"

# BOOTWATCH (early part): a page answered from the saved copy counts as a cached copy
BW_EARLY_OLD = "    B.sw = swUrl() || B.sw; if (B.sw && !/crm-push-sw\\.js$/.test(B.sw)) return 'sw';\n"
BW_EARLY_NEW = BW_EARLY_OLD + "    try { var sh = W.__GC_SHELL__; if (sh && /cache/.test(sh.from || '')) return 'sw-shell'; } catch (x) {}   /* patch FASTOPEN: the CRM's saved page */\n"
# BOOTWATCH (late part): the update keeps the saved page only when it already holds the live build (instant reload)
BW_LATE_OLD = "    try { if (typeof caches !== 'undefined' && caches.keys) jobs.push(caches.keys().then(function(k){ return Promise.all(k.map(function(n){ return caches.delete(n); })); })); } catch (e) {}\n"
BW_LATE_NEW = ("    try { if (typeof caches !== 'undefined' && caches.keys) jobs.push(caches.keys().then(function(k){ return Promise.all(k.map(function(n){\n"
               "      if (/^gc-crm-shell-/.test(n) && W._gcFastOpen && W._gcFastOpen.sw && W._gcFastOpen.sw.keep) return W._gcFastOpen.sw.keep(n, LIVE.v);   /* patch FASTOPEN */\n"
               "      return caches.delete(n); })); })); } catch (e) {}\n")

SW_PAGE = r'''<script id="gc-patch-fastopen">
/* __GC_PATCH_FASTOPEN__ (part 2) — the CRM page opens from a saved copy (tools/patch_FASTOPEN.py, crm-push-sw.js).
   This script: (1) asks the service worker how this page was answered (window.__GC_SHELL__: cache / network / cache-offline —
   BOOTWATCH counts a saved copy as a cached copy); (2) once the open has settled, registers /crm-push-sw.js (the same worker as
   the phone notifications) and keeps the saved copy right: the live build from /version.txt; this page's own build is kept (a
   revalidated read, normally 304); a NEWER live build is downloaded when the phone is idle and kept only if the download really
   is that build; until then the copy is marked "stale" so a reload goes to the network; (3) BOOTWATCH's update keeps the copy
   only when it holds the live build. Mode: "fast" on a phone / GrayCo Field device, "safe" (network first) on a desk.
   Off on this device: localStorage gc_fastopen_sw_off = '1' (the worker empties the cache).  Console: _gcFastOpen.sw.info() */
(function(){
'use strict';
var W = window, NAV = W.navigator || {};
if (W._gcFastOpen && W._gcFastOpen.sw) return;
var FO = W._gcFastOpen = W._gcFastOpen || {};
var SHELL = 'gc-crm-shell-v1', PAGE = '/index.html', META = '/__gc_shell_meta';
var NST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, NF = W.fetch;
var off = false; try { off = W.localStorage.getItem('gc_fastopen_sw_off') === '1'; } catch (e) {}
var ok = !!(NAV.serviceWorker && typeof caches !== 'undefined' && W.isSecureContext !== false);
var ST = { off: off, ok: ok, served: null, mode: '', live: '', mine: String(W.__GC_BUILD_ID__ || ''), meta: null, did: [], err: '', at: 0, kept: 0, bytes: 0 };
var s = function(v){ return v == null ? '' : String(v); };
function log(m){ ST.did.push(Math.round((W.performance && performance.now()) || 0) + ' ' + m); if (ST.did.length > 30) ST.did.shift(); }
/* (1) how was this page answered? */
if (ok && NAV.serviceWorker.controller) {
  try {
    NAV.serviceWorker.addEventListener('message', function(e){ var d = e.data || {}; if (d.gcShellA) { ST.served = W.__GC_SHELL__ = d.gcShellA; } });
    NAV.serviceWorker.controller.postMessage({ gcShellQ: 1 });
    NST.call(W, function(){ if (ST.served) return; try { var ne = performance.getEntriesByType('navigation')[0]; if (ne && ne.workerStart > 0) ST.served = W.__GC_SHELL__ = { from: ne.transferSize === 0 ? 'cache?' : 'network?', guessed: true }; } catch (e) {} }, 4000);
  } catch (e) {}
}
if (!ok) { FO.sw = { info: function(){ return JSON.parse(JSON.stringify(ST)); }, keep: function(n){ return caches.delete(n); } }; return; }
function older(mine, live){
  try { if (W._gcBootWatch && typeof W._gcBootWatch.older === 'function') return !!W._gcBootWatch.older(mine, live); } catch (e) {}
  return false;
}
function fieldDevice(){ try { if (W._gcDevice && W._gcDevice.fieldDevice) return !!W._gcDevice.fieldDevice(); } catch (e) {} return /iPhone|iPod|Android.*Mobile/i.test(s(NAV.userAgent)); }
function readMeta(c){ return c.match(META).then(function(r){ return r ? r.json() : null; }).catch(function(){ return null; }); }
function writeMeta(c, m){ ST.meta = m; return c.put(META, new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json' } })); }
function liveBuild(){
  var q = ''; try { q = W._gcBootWatch && W._gcBootWatch.live ? W._gcBootWatch.live(120000) : ''; } catch (e) {}
  if (q) return Promise.resolve(q);
  return NF.call(W, '/version.txt?t=' + Date.now(), { cache: 'no-store' }).then(function(r){ return r && r.ok ? r.text() : ''; }, function(){ return ''; }).then(function(v){ return s(v).trim().slice(0, 60); });
}
/* read the page and check it IS build `want` before keeping it (the build id sits in the first ~1 MB: read that part only) */
function fetchBuild(want){
  return NF.call(W, PAGE, { cache: 'no-cache', credentials: 'same-origin' }).then(function(r){
    if (!r || !r.ok || r.status !== 200 || r.redirected || !/text\/html/i.test(s(r.headers.get('content-type')))) throw new Error('not the page (' + (r && r.status) + ')');
    var probe = r.clone(), rd = probe.body.getReader(), dec = new TextDecoder(), txt = '', n = 0;
    function pump(){
      return rd.read().then(function(x){
        if (x.done) return '';
        n += x.value.length; txt += dec.decode(x.value, { stream: true });
        var m = /var BUILD_ID = "([^"]{1,60})"/.exec(txt);
        if (m) { try { rd.cancel(); } catch (e) {} return m[1]; }
        if (n > 4e6) { try { rd.cancel(); } catch (e) {} return ''; }
        if (txt.length > 4096) txt = txt.slice(-4096);
        return pump();
      });
    }
    return pump().then(function(b){ if (b !== want) throw new Error('the download is build ' + (b || '?') + ', not ' + want); return r; });
  });
}
var busy = false;
function refresh(why){
  if (busy || off) return Promise.resolve(false);
  busy = true; ST.at = Date.now(); log('refresh: ' + why);
  var c = null;
  return caches.open(SHELL).then(function(cc){ c = cc; return Promise.all([readMeta(c), liveBuild()]); }).then(function(a){
    var meta = a[0] || {}, live = a[1], mine = ST.mine = s(W.__GC_BUILD_ID__);
    ST.live = live; ST.mode = fieldDevice() ? 'fast' : 'safe';
    if (meta.off) { log('off on this device'); return false; }
    if (!live) { log('no answer from /version.txt'); return false; }
    if (meta.build === live) {
      if (meta.stale || meta.mode !== ST.mode) return writeMeta(c, Object.assign({}, meta, { stale: false, mode: ST.mode })).then(function(){ log('copy = live ' + live); return true; });
      log('copy = live ' + live); ST.meta = meta; return true;
    }
    var newer = older(mine, live);
    if (!newer && mine !== live) { log('this page (' + mine + ') is newer than the live build (' + live + '): nothing kept'); return false; }
    /* the copy is not the live build: until the live build is saved, a reload goes to the network */
    var mark = meta.build && !meta.stale ? writeMeta(c, Object.assign({}, meta, { stale: true, mode: ST.mode, staleFor: live })) : Promise.resolve();
    return mark.then(function(){ return fetchBuild(live); }).then(function(r){
      var len = +(r.headers.get('content-length') || 0);
      return c.put(PAGE, r).then(function(){ ST.kept++; ST.bytes = len; return writeMeta(c, { build: live, at: Date.now(), mode: ST.mode, stale: false }); })
        .then(function(){ log('kept build ' + live + (newer ? ' (newer than this page: the next open / update is instant)' : '')); return true; });
    });
  }).catch(function(e){ ST.err = s(e && e.message || e).slice(0, 160); log('not kept: ' + ST.err); return false; })
    .then(function(v){ busy = false; return v; });
}
/* the update (BOOTWATCH / "Yes, update"): keep the copy only when it IS the live build */
function keep(name, live){
  return caches.open(name).then(function(c){ return readMeta(c).then(function(m){
    if (name === SHELL && m && m.build && live && m.build === live && !m.off) return writeMeta(c, Object.assign({}, m, { stale: false })).then(function(){ log('update: copy kept (= live ' + live + ')'); return true; });
    return caches.delete(name).then(function(){ log('update: copy dropped'); return false; });
  }); }).catch(function(){ return caches.delete(name); });
}
function turnOff(){
  try { if (NAV.serviceWorker.controller) NAV.serviceWorker.controller.postMessage({ gcShellOff: 1 }); } catch (e) {}
  try { caches.delete(SHELL); } catch (e) {}
}
FO.sw = { info: function(){ return JSON.parse(JSON.stringify(ST)); }, refresh: refresh, keep: keep, off: turnOff, start: function(){ start(); } };
if (off) { turnOff(); return; }
/* (2) once the open has settled: register the worker, keep the copy right — a phone waits until the first screen and the
   first sync are well past (the download of a new build never competes with the open) */
var started = false;
function start(){
  if (started) return; started = true;
  var reg = NAV.serviceWorker.getRegistration('/').then(function(r){
    var u = ''; try { u = s((r && (r.active || r.waiting || r.installing) || {}).scriptURL); } catch (e) {}
    if (r && /\/crm-push-sw\.js(\?|$)/.test(u)) return r;
    return NAV.serviceWorker.register('/crm-push-sw.js', { scope: '/' });
  }).catch(function(e){ ST.err = 'register: ' + s(e && e.message || e).slice(0, 120); });
  reg.then(function(){ return refresh('open'); });
}
/* as soon as the live build is known: an out-of-date copy is marked stale at once (a reload must not open it again) */
var tries = 0;
function early(){
  var live = ''; try { live = W._gcBootWatch && W._gcBootWatch.live ? W._gcBootWatch.live(120000) : ''; } catch (e) {}
  if (!live) { if (++tries < 60) NST.call(W, early, 1000); return; }
  caches.open(SHELL).then(function(c){ return readMeta(c).then(function(m){
    if (m && m.build && m.build !== live && !m.stale && !m.off) return writeMeta(c, Object.assign({}, m, { stale: true, staleFor: live })).then(function(){ log('copy ' + m.build + ' is behind live ' + live + ': marked stale'); });
  }); }).catch(function(){});
}
NST.call(W, early, 1500);
function whenSettled(){
  var t0 = Date.now(), phone = fieldDevice();
  (function wait(){
    var age = Date.now() - t0, fh = false;
    try { var b = W._gcBootWatch && W._gcBootWatch.state().boot; fh = !!(b && b.m && b.m.paint != null && b.m.load != null); } catch (e) {}
    if ((fh && age > (phone ? 30000 : 8000)) || age > 120000) { if (W.document.visibilityState === 'hidden') { NST.call(W, wait, 5000); return; } start(); return; }
    NST.call(W, wait, 2000);
  })();
}
if (W.document.readyState === 'complete') whenSettled(); else W.addEventListener('load', whenSettled);
/* back from the background after a while: look again (a release may have gone out) */
var lastVis = Date.now();
try { W.document.addEventListener('visibilitychange', function(){ if (W.document.visibilityState === 'visible' && started && Date.now() - lastVis > 10 * 60e3) { lastVis = Date.now(); NST.call(W, function(){ refresh('back'); }, 20000); } }); } catch (e) {}
})();
</script>
'''
SW_ANCHOR = '<script id="gc-patch-regfix-stalegate">'
DIRTY = r"""<script id="gc-patch-fastopen-dirty">
/* patch FASTOPEN (part 1, the write watch): every write of this device's CRM store (IndexedDB grayco_crm / kv) that is not the
   sync's own apply marks that list "changed here" (IndexedDB gc_fastopen / m / 'dirty' — not localStorage: the owner's phone has
   it full); the mark is ISSUED BEFORE the write itself. A list marked so is never skipped by the next open's pull (it is pulled
   and merged, and the SAVES "ahead" check sends what this device has). A cleared store / a deleted database marks everything
   ('*'). If the mark cannot be written, the kept marks are dropped and the next open pulls everything, as before.
   Console: _gcFastOpen.dirty.all() */
(function(){
'use strict';
var W = window; if (W._gcFastOpen && W._gcFastOpen.dirty) return;
var FO = W._gcFastOpen = W._gcFastOpen || {};
var D = {}, Q = {}, broken = false, db = null, want = false;
function openDb(){ return new Promise(function(res){ try { var q = indexedDB.open('gc_fastopen', 1); q.onupgradeneeded = function(){ try { q.result.createObjectStore('m'); } catch (e) {} }; q.onsuccess = function(){ res(q.result); }; q.onerror = function(){ res(null); }; q.onblocked = function(){ res(null); }; } catch (e) { res(null); } }); }
function fail(){ if (broken) return; broken = true; try { if (db) db.transaction('m', 'readwrite').objectStore('m').delete('marks'); } catch (e) {} }
function save(){
  if (!db) { want = true; return; }
  try { var tx = db.transaction('m', 'readwrite'); tx.objectStore('m').put(Object.keys(D), 'dirty'); tx.onerror = tx.onabort = fail; } catch (e) { fail(); }
}
var ready = openDb().then(function(d){
  db = d; if (!d) { broken = true; return; }
  return new Promise(function(res){ try { var g = d.transaction('m', 'readonly').objectStore('m').get('dirty');
    g.onsuccess = function(){ var had = Object.keys(D).length; (g.result || []).forEach(function(k){ D[k] = 1; }); if (want || had) save(); res(); }; g.onerror = function(){ D['*'] = 1; res(); }; } catch (e) { D['*'] = 1; res(); } });
}).catch(function(){ broken = true; });
function mark(k){ k = String(k); if (Q[k] || D[k]) return; D[k] = 1; save(); }
function ours(st){ try { return st.name === 'kv' && st.transaction.db.name === 'grayco_crm'; } catch (e) { return false; } }
try {
  var P = IDBObjectStore.prototype;
  [['put', 1], ['add', 1], ['delete', 0]].forEach(function(x){
    var f = P[x[0]]; if (typeof f !== 'function' || f.__gcfo) return;
    var w = function(){ try { if (ours(this)) { var k = arguments[x[1]]; if (typeof k === 'string') mark(k); else if (!D['*']) { D['*'] = 1; save(); } } } catch (e) {} return f.apply(this, arguments); };
    w.__gcfo = true; P[x[0]] = w;
  });
  var fc = P.clear; if (typeof fc === 'function' && !fc.__gcfo) { var wc = function(){ try { if (ours(this)) { D['*'] = 1; save(); } } catch (e) {} return fc.apply(this, arguments); }; wc.__gcfo = true; P.clear = wc; }
  var fd = IDBFactory.prototype.deleteDatabase; if (typeof fd === 'function' && !fd.__gcfo) { var wd = function(n){ try { if (String(n) === 'grayco_crm') { D['*'] = 1; save(); } } catch (e) {} return fd.apply(this, arguments); }; wd.__gcfo = true; IDBFactory.prototype.deleteDatabase = wd; }
} catch (e) { broken = true; }
FO.dirty = {
  ready: function(){ return ready; },
  has: function(k){ return !!D[k]; }, all: function(){ return Object.keys(D); }, broken: function(){ return broken; },
  quiet: function(k, on){ if (on) Q[k] = 1; else delete Q[k]; },
  clean: function(k){ if (D[k]) { delete D[k]; save(); } },
  wiped: function(){ return !!D['*']; }, unwipe: function(){ if (D['*']) { delete D['*']; save(); } }
};
})();
</script>
"""
DIRTY_ANCHOR = '<script id="gc-patch-bootsafe">\n'


def sub(t, old, new, name, marker=None):
    if marker and marker in t:
        return t
    n = t.count(old)
    if n != 1:
        raise SystemExit('FASTOPEN: anchor %s found %d times' % (name, n))
    return t.replace(old, new)

def patch_bootwatch_sources():
    for f, old, new in (('bootwatch_early.js', BW_EARLY_OLD, BW_EARLY_NEW), ('bootwatch_late.js', BW_LATE_OLD, BW_LATE_NEW)):
        p = os.path.join(HERE, f); t = open(p, encoding='utf-8').read()
        if 'patch FASTOPEN' in t: continue
        if t.count(old) != 1: raise SystemExit('FASTOPEN: %s anchor not found once' % f)
        open(p, 'w', encoding='utf-8').write(t.replace(old, new))

def main():
    p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
    t = open(p, encoding='utf-8').read()
    if '__GC_PATCH_FASTOPEN__' in t:
        print('FASTOPEN: already applied'); return
    t = sub(t, 'var _lastPull = {};\n', MARKS, 'marks')
    t = sub(t, PULLNOW_OLD, PULLNOW_NEW, 'pullnow')
    t = sub(t, PULL_START_OLD, PULL_START_NEW, 'pull start')
    t = sub(t, HEADS_OLD, HEADS_NEW, 'heads')
    t = sub(t, CHANGED_OLD, CHANGED_NEW, 'changed log')
    t = sub(t, ROW_OLD, ROW_NEW, 'row')
    t = sub(t, SAME_OLD, SAME_NEW, 'same')
    t = sub(t, SET_OLD, SET_NEW, 'idbSet')
    t = sub(t, APPLY_OLD, APPLY_NEW, 'apply')
    t = sub(t, END_OLD, END_NEW, 'end')
    t = sub(t, SNAP_OLD, SNAP_NEW, 'snapshot loop')
    t = sub(t, AWAY_OLD, AWAY_NEW, 'away')
    t = sub(t, BW_EARLY_OLD, BW_EARLY_NEW, 'bootwatch early')
    t = sub(t, BW_LATE_OLD, BW_LATE_NEW, 'bootwatch late')
    t = sub(t, SW_ANCHOR, SW_PAGE + SW_ANCHOR, 'sw page script')
    t = sub(t, DIRTY_ANCHOR, DIRTY + DIRTY_ANCHOR, 'write watch')
    open(p, 'w', encoding='utf-8').write(t)
    patch_bootwatch_sources()
    print('FASTOPEN: applied to ' + p)

if __name__ == '__main__':
    main()
