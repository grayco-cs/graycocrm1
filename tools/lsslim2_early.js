/* __GC_PATCH_LSSLIM2__ — the estimate builder's rate book, material log and estimate list are not copied into
   localStorage when IndexedDB already holds them (tools/patch_LSSLIM2.py).
   The owner's iPhones (11/03) keep about 2.5-2.75 M characters per site; gc_matlog_v2 (829 K) + gc_rates_v3 (154 K) were
   plain localStorage copies of IndexedDB "__est__gc_matlog_v2" / "__est__gc_rates_v3" written by the company-sync pull
   (gc_ests_v2, 2.7 M on a desktop, the same way). The builder reads IndexedDB (window.storage); a few screens read the
   plain copies synchronously (the rate lookups, the old-draft alert, the per-estimate commission list).
   1. At load, for each of the three: when the builder's own IndexedDB store holds a non-empty list, the plain copy is
      moved into this page's memory and removed from localStorage. IndexedDB empty / unreadable: the copy stays.
   2. The pull keeps its merged value in memory instead of localStorage for a key IndexedDB holds (__gcEstMirror.hold);
      otherwise it writes the copy as before.
   3. localStorage.getItem of the three names returns the memory value when localStorage has none, so every reader of
      the plain copy reads what it read before. A write of the copy by other code (estimate save) still goes to
      localStorage as before and refreshes the memory value; removeItem clears it.
   Console: __gcEstMirror.state()   Off: localStorage gc_lsslim2_off = '1'. */
(function(){
'use strict';
var W = window;
try {
  if (W.__gcEstMirror) return;
  var SP = W.Storage && W.Storage.prototype, LS = null;
  try { LS = W.localStorage; } catch (e) {}
  if (!SP || !LS || typeof SP.getItem !== 'function') return;
  var pGet = SP.getItem, pSet = SP.setItem, pRem = SP.removeItem, NST = W.setTimeout;
  try { if (pGet.call(LS, 'gc_lsslim2_off') === '1') return; } catch (e) {}
  var KEYS = { gc_rates_v3: 1, gc_matlog_v2: 1, gc_ests_v2: 1 };
  var MEM = {}, HAS = {}, moved = {}, held = 0;
  function mine(st, k){ return st === LS && KEYS[String(k)] === 1; }

  SP.getItem = function(k){
    var r = pGet.apply(this, arguments);
    if (r == null && mine(this, k) && MEM[String(k)] != null) return MEM[String(k)];
    return r;
  };
  SP.setItem = function(k, v){
    var r = pSet.apply(this, arguments);
    if (mine(this, k)) MEM[String(k)] = String(v);
    return r;
  };
  SP.removeItem = function(k){
    if (mine(this, k)) delete MEM[String(k)];
    return pRem.apply(this, arguments);
  };

  function filled(s){
    var a = null; try { a = JSON.parse(s); } catch (e) { return false; }
    return Array.isArray(a) ? a.length > 0 : !!(a && typeof a === 'object' && Object.keys(a).length);
  }
  /* the pull: keep the value in memory (true) when IndexedDB holds this key; false = write the copy as before */
  function hold(k, v){
    k = String(k);
    if (KEYS[k] !== 1 || !HAS[k] || v == null) return false;
    MEM[k] = typeof v === 'string' ? v : JSON.stringify(v);
    try { pRem.call(LS, k); } catch (e) {}
    held++;
    return true;
  }
  /* at load: what the builder's IndexedDB store holds */
  var tries = 0;
  function load(){
    var st = W.storage;
    if (!st || typeof st.get !== 'function') { if (tries++ < 120) NST.call(W, load, 500); return; }
    Object.keys(KEYS).forEach(function(k){
      Promise.resolve().then(function(){ return st.get(k); }).then(function(r){
        var v = r && r.value; if (v == null) return;
        var s = typeof v === 'string' ? v : JSON.stringify(v);
        if (!filled(s)) return;                                   /* empty in IndexedDB: the copy stays */
        HAS[k] = true;
        var cur = null; try { cur = pGet.call(LS, k); } catch (e) {}
        if (cur != null) {                                        /* readers keep reading exactly this value */
          MEM[k] = cur; moved[k] = cur.length + k.length;
          try { pRem.call(LS, k); } catch (e) {}
        } else if (MEM[k] == null) MEM[k] = s;
      }, function(){});
    });
  }
  load();
  W.__gcEstMirror = {
    hold: hold,
    state: function(){ var m = {}; Object.keys(MEM).forEach(function(k){ m[k] = MEM[k].length; }); return { idb: Object.assign({}, HAS), memory: m, moved: Object.assign({}, moved), held: held }; }
  };
} catch (e) { try { console.warn('[GC] LSSLIM2 not installed:', e && e.message || e); } catch (x) {} }
})();
