/* __GC_PATCH_FIELDLAG2_EARLY__ — FIELDLAG2: no phone or computer is bogged down by its own browser storage (tools/patch_FIELDLAG2.py).
   Owner 11/24: "make sure no one's phone or computer is bogged down by storage lags". The devices' own reports (gc_perfrep_*,
   hb.lsw = localStorage writes in one idle minute): the owner's iPhone wrote gc_tombstones 54 times (9.2M characters),
   gc_office_tasks 6 times (4.1M), gc_decisions_v1 10 times (3.1M) … ~18M characters a minute, each one a synchronous copy on the
   page's only thread; office computers held 4.4-5.0M characters (full: saves refused).
   This layer sits on localStorage writes (every role, every device; the CRM's own write wrappers all call through it):
   1. a write of the value that is already there is not made (nothing changed — the browser would store the same thing);
   2. a big value (≥ 30K characters) written again within 8 s of its last write waits and only its NEWEST value is written when
      the 8 s are up (a list rewritten 54 times a minute is written at most 7-8 times); this page reads the waiting value back at
      once (getItem), and everything waiting is written right away when the page is hidden, closed or frozen;
   3. a waiting write the browser refuses (storage full, after the storage guard has cleared what it may) is never dropped: it stays
      what this page reads, it is kept in IndexedDB (gc_lsdiet / held) and written on the next try or the next open;
   (the backup / snapshot copies and the removed-rows log already live in IndexedDB — patch LSSIDE — this layer does not move them.)
   Console: __gcLSD.state()   Off: localStorage gc_lsdiet_off = '1'. */
(function(){
'use strict';
var W = window, D = document;
try {
  if (W.__gcLSD) return;
  var LS = null; try { LS = W.localStorage; } catch (e) {}
  var SP = W.Storage && W.Storage.prototype;
  if (!LS || !SP || typeof SP.setItem !== 'function') return;
  var pSet = SP.setItem, pGet = SP.getItem, pRem = SP.removeItem, pClr = SP.clear;
  try { if (pGet.call(LS, 'gc_lsdiet_off') === '1') return; } catch (e) {}
  var NST = W.setTimeout, BIG = 30000, GAP = 8000, HELDK = 'gc_lsdiet_held';
  var S = { same: 0, sameChars: 0, held: 0, heldChars: 0, flushed: 0, failed: 0, kept: 0, restored: 0, real: 0, realChars: 0 };
  var PEND = Object.create(null), LASTW = Object.create(null), FAILED = Object.create(null), T = null, TAT = 0;
  function now(){ return Date.now(); }

  /* ── IndexedDB: the writes the browser refused, until they are in localStorage ── */
  var dbp = null;
  function db(){
    if (dbp) return dbp;
    dbp = new Promise(function(res){ try { var r = W.indexedDB.open('gc_lsdiet', 1); r.onupgradeneeded = function(){ try { r.result.createObjectStore('held'); } catch (e) {} }; r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ res(null); }; } catch (e) { res(null); } });
    return dbp;
  }
  function heldIdx(){ try { var o = JSON.parse(pGet.call(LS, HELDK) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function heldIdxSet(o){ try { if (Object.keys(o).length) pSet.call(LS, HELDK, JSON.stringify(o)); else pRem.call(LS, HELDK); } catch (e) {} }
  function keep(k, v){
    S.kept++;
    db().then(function(d){ if (!d) return; try { var tx = d.transaction('held', 'readwrite'); tx.objectStore('held').put({ v: v, at: now() }, k); tx.oncomplete = function(){ var o = heldIdx(); o[k] = now(); heldIdxSet(o); }; } catch (e) {} });
  }
  function unkeep(k){
    if (!FAILED[k]) return; delete FAILED[k];
    var o = heldIdx(); if (o[k]) { delete o[k]; heldIdxSet(o); }
    db().then(function(d){ if (!d) return; try { d.transaction('held', 'readwrite').objectStore('held').delete(k); } catch (e) {} });
  }

  /* ── the real write (through the storage guard, which makes room from its list on a full storage) ── */
  function realSet(k, v){ var r = pSet.call(LS, k, v); LASTW[k] = now(); S.real++; S.realChars += v.length; return r; }
  function flushOne(k){
    if (!(k in PEND)) return true;
    var v = PEND[k];
    try { realSet(k, v); delete PEND[k]; S.flushed++; unkeep(k); return true; }
    catch (e) { S.failed++; if (!FAILED[k]) { FAILED[k] = 1; keep(k, v); } return false; }
  }
  function flushAll(){ var left = false; Object.keys(PEND).forEach(function(k){ if (!flushOne(k)) left = true; }); return left; }
  function schedule(){
    var ks = Object.keys(PEND); if (!ks.length) return;
    var due = Infinity; ks.forEach(function(k){ due = Math.min(due, (LASTW[k] || 0) + (FAILED[k] ? 30000 : GAP)); });
    var at = Math.max(due, now() + 50);
    if (T && TAT <= at) return;
    if (T) clearTimeout(T);
    TAT = at; T = NST.call(W, function(){ T = null; TAT = 0; var n = now(); Object.keys(PEND).forEach(function(k){ if (n >= (LASTW[k] || 0) + (FAILED[k] ? 30000 : GAP)) { if (!flushOne(k)) LASTW[k] = n; } }); schedule(); }, at - now());
  }
  function cur(k){ if (k in PEND) return PEND[k]; return pGet.call(LS, k); }

  SP.setItem = function(k, v){
    if (this !== LS) return pSet.apply(this, arguments);
    k = String(k); v = String(v);
    var old = null; try { old = cur(k); } catch (e) {}
    if (old === v) { S.same++; S.sameChars += v.length; return; }
    if (v.length >= BIG && (k in PEND || now() - (LASTW[k] || 0) < GAP)) { PEND[k] = v; S.held++; S.heldChars += v.length; schedule(); return; }
    delete PEND[k];
    return realSet(k, v);   /* the first write of a quiet key goes at once, and a refusal reaches the caller as before */
  };
  SP.getItem = function(k){
    if (this === LS) { var key = String(k); if (key in PEND) return PEND[key]; }
    return pGet.apply(this, arguments);
  };
  SP.removeItem = function(k){ if (this === LS) { var key = String(k); delete PEND[key]; unkeep(key); } return pRem.apply(this, arguments); };
  SP.clear = function(){ if (this === LS) { PEND = Object.create(null); } return pClr.apply(this, arguments); };

  /* everything waiting goes now when the page is hidden, closed or frozen */
  var now2 = function(){ try { flushAll(); } catch (e) {} };
  try { D.addEventListener('visibilitychange', function(){ if (D.visibilityState === 'hidden') now2(); }, true); } catch (e) {}
  try { W.addEventListener('pagehide', now2, true); W.addEventListener('beforeunload', now2, true); D.addEventListener('freeze', now2, true); } catch (e) {}

  /* the writes a full storage refused last time: written now (this page reads them meanwhile) */
  try {
    var idx = heldIdx(), ks0 = Object.keys(idx);
    if (ks0.length) db().then(function(d){ if (!d) return; ks0.forEach(function(k){ try { var rq = d.transaction('held', 'readonly').objectStore('held').get(k); rq.onsuccess = function(){ var x = rq.result; if (!x || typeof x.v !== 'string') { var o = heldIdx(); delete o[k]; heldIdxSet(o); return; } if (pGet.call(LS, k) !== x.v && !(k in PEND)) { PEND[k] = x.v; FAILED[k] = 1; S.restored++; LASTW[k] = 0; schedule(); } else { FAILED[k] = 1; unkeep(k); } }; } catch (e) {} }); });
  } catch (e) {}

  function usage(){ var chars = 0, keys = 0; try { for (var i = 0, n = LS.length; i < n; i++) { var k = LS.key(i); if (k == null) continue; var v = pGet.call(LS, k); chars += k.length + (v == null ? 0 : v.length); keys++; } } catch (e) {} return { chars: chars, keys: keys }; }
  W.__gcLSD = { state: function(){ var u = usage(); return Object.assign({}, S, { waiting: Object.keys(PEND), lsChars: u.chars, lsKeys: u.keys }); }, flush: flushAll };
} catch (e) { try { console.warn('[GC FIELDLAG2] storage layer', e && e.message || e); } catch (x) {} }
})();
