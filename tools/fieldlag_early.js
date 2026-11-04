/* __GC_PATCH_FIELDLAG__ — GrayCo Field scrolls smoothly on a phone (tools/patch_FIELDLAG.py).
   Owner 11/04: "it's lagging on Biffle field view right now scrolling through it" (Steven Biffle, PM, iPhone; 330-360 ms
   stalls). Profile of his Field Home + job screen on an iPhone viewport, CPU x5, 30 s of scrolling each: the paced
   background loops (badge counts, menu / page scans, the Back-button and floating-button re-measure) kept running
   while the finger was moving, the floating-button "dodge" re-measured the page every 150 ms of a scroll, and the
   2.7 M-character estimate mirror was written to localStorage again and again (refused at the quota, so the
   storage guard cleared backups that the next sync wrote back).
   1. __gcFL.pace(): while a scroll is in progress (scroll / wheel / touchmove in the last 0.5 s) a paced loop
      (the ≥ 600 ms setInterval governor) skips its tick, unless it has not run for 5 s (or 3 of its periods).
      It runs again as soon as the scroll stops.
   2. __gcFL.desk(name): true while GrayCo Field is on screen (html._fieldmode + the Field home / job screen): the
      desk-only scans (AP3 job e-mail button, NAV table un-clip, TODOPERF To-Do badge with no To-Do item in sight)
      skip; on Desk view they run as before.
   3. localStorage: a write of a large value (≥ 20 K characters) that equals what this page last wrote there is
      skipped (the browser would store the same thing); the estimate builder's mirrors (gc_ests_v2, gc_matlog_v2,
      gc_rates_v3) stay in page memory (LSSLIM2) when IndexedDB holds them, instead of going back into localStorage;
      gc_ests_v2 (2.7 M, written only after the same list is in IndexedDB) always stays in page memory, and
      localStorage.getItem('gc_ests_v2') on this page returns it, so every reader reads what it read before.
   4. _gcApprovalSet(): one computed set is reused for 2 s (0.8 s before) unless _gcApprovalSetFresh() clears it.
   Console: __gcFL.state()   Off: localStorage gc_fieldlag_off = '1'. */
(function(){
'use strict';
var W = window, D = document;
try {
  if (W.__gcFL) return;
  var LS = null; try { LS = W.localStorage; } catch (e) {}
  try { if (LS && LS.getItem('gc_fieldlag_off') === '1') return; } catch (e) {}
  var FL = W.__gcFL = { skippedTicks: 0, deskSkips: {}, lsSkipped: 0, lsSkippedChars: 0, lsHeld: 0, apprReused: 0 };
  var now = function(){ return Date.now(); };

  /* ── is GrayCo Field on screen (checked at most every 250 ms) ── */
  var fuAt = 0, fuV = false;
  FL.fieldUp = function(){
    var n = now(); if (n - fuAt < 250) return fuV; fuAt = n;
    try { var h = D.documentElement; fuV = !!(h && h.classList.contains('_fieldmode') && (D.getElementById('_gcJobPick') || D.getElementById('_gcJobDash') || D.getElementById('_gcFieldHomeOv'))); } catch (e) { fuV = false; }
    return fuV;
  };
  FL.desk = function(name){ if (!FL.fieldUp()) return false; FL.deskSkips[name] = (FL.deskSkips[name] || 0) + 1; return true; };

  /* ── a scroll in progress ── */
  var lastScroll = 0;
  var mark = function(e){ if (e && e.isTrusted === false) return; lastScroll = now(); };
  ['scroll', 'wheel', 'touchmove'].forEach(function(ev){ try { D.addEventListener(ev, mark, { capture: true, passive: true }); } catch (e) {} });
  FL.scrolling = function(){ return now() - lastScroll < 500; };
  /* the paced-loop governor: true = skip this tick */
  FL.pace = function(since, ms){
    if (now() - lastScroll >= 500) return false;
    if (since >= Math.max(5000, 3 * (ms || 0))) return false;
    FL.skippedTicks++; return true;
  };

  /* ── localStorage: an unchanged large value is not written again; the builder's mirrors stay in memory ── */
  var SP = W.Storage && W.Storage.prototype;
  if (SP && LS && typeof SP.setItem === 'function') {
    var pSet = SP.setItem, pRem = SP.removeItem, pClr = SP.clear, pGet = SP.getItem, MEMV = Object.create(null);
    SP.getItem = function(k){
      if (this === LS && MEMV[String(k)] != null) return MEMV[String(k)];   /* the newest value this page wrote */
      return pGet.apply(this, arguments);
    };
    var LAST = Object.create(null), MIN = 20000, MAXK = 4000000;
    var HOLD = { gc_ests_v2: 1, gc_matlog_v2: 1, gc_rates_v3: 1 };
    var gsig = function(){ var g = W.__gcLsGuard; return g ? g.count + ':' + g.freed + ':' + g.evicted : ''; };
    var lastSig = gsig();
    SP.setItem = function(k, v){
      if (this !== LS) return pSet.apply(this, arguments);
      k = String(k); v = String(v);
      var sg = gsig(); if (sg !== lastSig) { lastSig = sg; LAST = Object.create(null); }   /* the storage guard removed copies */
      if (HOLD[k] === 1) {
        var M = W.__gcEstMirror;
        if (M && typeof M.hold === 'function') { var held = false; try { held = M.hold(k, v); } catch (e) {} if (held) { delete MEMV[k]; FL.lsHeld++; return; } }
        if (k === 'gc_ests_v2') {   /* every writer stored the same list in IndexedDB first (see LSGUARD tier 1): memory, not localStorage */
          MEMV[k] = v; FL.lsHeld++;
          try { if (pGet.call(LS, k) != null) pRem.call(LS, k); } catch (e) {}
          return;
        }
        return pSet.call(this, k, v);
      }
      if (v.length < MIN || v.length > MAXK) { if (LAST[k] !== undefined) delete LAST[k]; return pSet.call(this, k, v); }
      if (LAST[k] === v) { FL.lsSkipped++; FL.lsSkippedChars += v.length; return; }
      delete LAST[k];
      var r = pSet.call(this, k, v);
      LAST[k] = v;
      return r;
    };
    SP.removeItem = function(k){ if (this === LS) { delete LAST[String(k)]; delete MEMV[String(k)]; } return pRem.apply(this, arguments); };
    SP.clear = function(){ if (this === LS) { LAST = Object.create(null); MEMV = Object.create(null); } return pClr.apply(this, arguments); };
    try { W.addEventListener('storage', function(e){ if (!e || e.key == null) { LAST = Object.create(null); MEMV = Object.create(null); } else { delete LAST[e.key]; delete MEMV[e.key]; } }); } catch (e) {}
  }

  /* ── _gcApprovalSet(): reuse one computed set for 2 s (wrapped outermost once the page has built it) ── */
  var NST = W.setTimeout, memo = null;
  function wrapAppr(){
    try {
      var f = W._gcApprovalSet; if (typeof f !== 'function' || f.__gcFL) return;
      var w = function(st){
        if (arguments.length && st !== undefined) return f.apply(this, arguments);
        var n = now(); if (memo && n - memo.at < 2000) { FL.apprReused++; return memo.v; }
        var v = f.apply(this, arguments); memo = { at: n, v: v }; return v;
      };
      for (var p in f) { try { if (Object.prototype.hasOwnProperty.call(f, p)) w[p] = f[p]; } catch (e) {} }
      w.__gcFL = true; W._gcApprovalSet = w;
      var fr = W._gcApprovalSetFresh;
      if (typeof fr === 'function' && !fr.__gcFL) { var wf = function(){ memo = null; return fr.apply(this, arguments); }; wf.__gcFL = true; W._gcApprovalSetFresh = wf; }
    } catch (e) {}
  }
  [4000, 12000, 30000, 60000].forEach(function(t){ NST.call(W, wrapAppr, t); });

  FL.state = function(){ return { field: FL.fieldUp(), scrolling: FL.scrolling(), skippedTicks: FL.skippedTicks, deskSkips: Object.assign({}, FL.deskSkips), lsSkipped: FL.lsSkipped, lsSkippedChars: FL.lsSkippedChars, lsHeld: FL.lsHeld, memory: MEMV ? Object.keys(MEMV) : [], apprReused: FL.apprReused }; };
} catch (e) { try { console.warn('[GC] FIELDLAG not installed:', e && e.message || e); } catch (x) {} }
})();
