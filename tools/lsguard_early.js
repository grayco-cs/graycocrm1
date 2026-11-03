/* __GC_PATCH_LSGUARD__ — a full browser storage never fails a save silently (tools/patch_LSGUARD.py).
   The ACCTGATE run (11/03) filled localStorage to 5,242,855 of ~5,242,880 characters (the estimate mirror gc_ests_v2 alone
   is 2.7 MB). After that every localStorage.setItem threw QuotaExceededError and the CRM's try/catch wrappers swallowed
   it: a just-saved 💵 payment match was lost, and the screen saved in grayco_view stayed old (Approvals would not open).
   This first script of the page wraps Storage.prototype.setItem (localStorage only):
   1. On a "storage full" error (any browser's name / code) it removes ONLY copies listed in EVICT below — mirrors and
      local backup copies of data that also lives in IndexedDB and the cloud — biggest first, until the write fits, then
      tries the write ONE more time. A write of a listed copy may only remove copies of a LOWER tier (no ping-pong);
      everything not listed (sign-in, queues / outboxes, drafts, approvals, money records, settings …) is never touched.
      If removing every listed copy would still not make room, nothing is removed and the error is thrown as before.
   2. Each event (key, size, characters freed, what was removed) goes into the performance report (gc_perfrep_<device>,
      "err"), which also carries this computer's total localStorage use; a signed-in person sees ONE quiet note per tab:
      "This computer's storage was full — cleared old cached copies."
   3. The screen (grayco_view): the value this page saved is kept in memory and is what this page reads back, so a
      refused write can never send the page back to the old screen; when localStorage refuses it even after the clean-up,
      it is also kept in sessionStorage (this tab, survives a reload) and the write does not throw.
   Console: _gcLsGuard.state()   _gcLsGuard.usage()   Off: localStorage gc_lsguard_off = '1'. */
(function(){
'use strict';
var W = window;
try {
  if (W.__gcLsGuard) return;
  var SP = W.Storage && W.Storage.prototype; if (!SP || typeof SP.setItem !== 'function') return;
  var LS = null, SS = null; try { LS = W.localStorage; } catch (e) {} try { SS = W.sessionStorage; } catch (e) {}
  if (!LS) return;
  var nSet = SP.setItem, nGet = SP.getItem, nRem = SP.removeItem, nKey = SP.key, nClear = SP.clear;
  try { if (nGet.call(LS, 'gc_lsguard_off') === '1') return; } catch (e) {}
  var NST = W.setTimeout;

  /* ── what may be removed when storage is full (exact names / patterns; anything else is never removed) ──────────
     tier 1 — plain mirrors the CRM rewrites by itself:
       gc_ests_v2       the estimate builder's list mirrored into localStorage (2.7 MB). Every write of it comes AFTER the
                        same list is written to IndexedDB "__est__gc_ests_v2" + "estimates" (afterEstimateSave, the heal,
                        the line-item rebuild); the builder itself reads IndexedDB (window.storage); the sync reads
                        IndexedDB first; "estimates" is in the cloud. The next save / heal writes the mirror again.
       gc_speedlog_v1   the speed log (diagnostics only); the page keeps it in memory and writes it again every 10 s.
     tier 2 — this computer's backup / snapshot copies of lists that live in IndexedDB + the cloud (+ 30 nightly server
              backups); patch DENYKEEP already frees gc_safenet_* / gc_bak_* / gc_projects_backup / gc_sched_backup the
              same way (_gcFreeLocalSpace) for two writes:
       gc_ests_backup   the builder's backup copy of the estimate list (same records as above).
       gc_snap_<list>   last-good snapshot of a list (data-loss guard), rewritten on the next good sync.
       gc_bak_<list>    rolling snapshots of a list (at most 1 M characters each), rewritten on the next change.
       gc_safenet_<list> safety-net copy of a list (gc_safenet_meta, the counts, is NOT removed).
       gc_projects_backup, gc_sched_backup   "This device backup" copies of projects / schedule.
     tier 3 — rate-book mirrors (only when tiers 1-2 are not enough):
       gc_rates_v3, gc_matlog_v2   localStorage mirrors of the builder's rate book / price log; the real ones are
                        IndexedDB "__est__gc_rates_v3" / "__est__gc_matlog_v2" (+ the cloud); the sync writes the mirror
                        again when the row changes.
     NEVER (on purpose not listed): gc_auth_*, grayco_sb_*, gc_qb_tokens, gc_cc_token*, grayco_ccam_key (sign-in / keys);
       gc_check_queue, gc_email_queue, gc_thankyou_queue, gc_ldi_outbox_v1, _voice*, grayco_dirty, gc_pending_* (queues);
       gc_builder_slots, gc_est_recovery, gc_est_openbackup, gc_draft_* (drafts / last-resort copies); gc_pay_matches,
       gc_*_approvals, gc_office_tasks, gc_tombstones, gc_deleted_* (records); grayco_<list> (mixed with settings);
       gc_doc_snap (upload fingerprints: removing it re-uploads every document); gc_ldi_cache_v2 (small); __est__* . */
  var EVICT_EXACT = { gc_ests_v2: 1, gc_speedlog_v1: 1, gc_ests_backup: 2, gc_projects_backup: 2, gc_sched_backup: 2, gc_rates_v3: 3, gc_matlog_v2: 3 };
  var EVICT_RE = [[/^gc_snap_[A-Za-z]+$/, 2], [/^gc_bak_[A-Za-z]+$/, 2], [/^gc_safenet_[A-Za-z]+$/, 2]];
  var NEVER = /^(gc_auth|grayco_sb_|gc_sb_|gc_qb_tokens|gc_cc_token|grayco_ccam_key|grayco_ri_drain_token|gc_safenet_meta$|gc_pay_matches|gc_draft_|gc_est_recovery|gc_est_openbackup|gc_builder_slots|grayco_view$)/;
  function tierOf(k){
    k = String(k);
    if (NEVER.test(k)) return 0;
    if (EVICT_EXACT.hasOwnProperty(k)) return EVICT_EXACT[k];
    for (var i = 0; i < EVICT_RE.length; i++) if (EVICT_RE[i][0].test(k)) return EVICT_RE[i][1];
    return 0;
  }
  function isQuota(e){
    if (!e) return false;
    var n = String(e.name || '');
    return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 || /quota/i.test(n) || /quota/i.test(String(e.message || ''));
  }

  var G = W.__gcLsGuard = { events: [], count: 0, freed: 0, evicted: 0, refused: 0, viewHeld: 0, toasted: false, onEvent: null, tierOf: tierOf };

  /* ── make room: the listed copies of a lower tier, biggest first, until the write fits ── */
  function relieve(key, val){
    var tw = tierOf(key), cap = tw === 0 ? 99 : tw;
    var old = null; try { old = nGet.call(LS, key); } catch (e) {}
    /* the write failed, so the free space is below its growth: freeing the growth (+2 K) makes it fit */
    var need = Math.max(0, key.length + val.length - (old == null ? 0 : key.length + old.length)) + 2048;
    var c = [], total = 0, res = { need: need, freed: 0, evicted: [], ok: false };
    try {
      for (var i = 0, n = LS.length; i < n; i++) {
        var k = nKey.call(LS, i); if (k == null || k === key) continue;
        var t = tierOf(k); if (!t || t >= cap) continue;
        var v = nGet.call(LS, k), sz = k.length + (v == null ? 0 : v.length);
        c.push({ k: k, t: t, sz: sz }); total += sz;
      }
    } catch (e) { return res; }
    if (total < need) return res;          /* even all of them would not make room: remove nothing */
    c.sort(function(a, b){ return a.t - b.t || b.sz - a.sz; });
    for (var j = 0; j < c.length && res.freed < need; j++) {
      try { nRem.call(LS, c[j].k); res.freed += c[j].sz; res.evicted.push(c[j].k); } catch (e) {}
    }
    return res;
  }

  /* ── one quiet note per tab, for a signed-in person ── */
  function toastOnce(){
    if (G.toasted) return; G.toasted = true;
    try { if (SS && nGet.call(SS, 'gc_lsg_toast') === '1') return; } catch (e) {}
    var tries = 0;
    (function show(){
      var staff = false; try { staff = !!(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) {}
      if (!staff || !W.document || !W.document.body) { if (tries++ < 120) NST.call(W, show, 5000); return; }
      try { if (SS) nSet.call(SS, 'gc_lsg_toast', '1'); } catch (e) {}
      try {
        var d = W.document.createElement('div'); d.id = 'gc-lsg-toast'; d.setAttribute('role', 'status');
        d.textContent = "This computer's storage was full — cleared old cached copies.";
        d.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483000;background:#334155;color:#fff;padding:9px 14px;border-radius:8px;font:13px Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:80vw;opacity:.95;pointer-events:none';
        W.document.body.appendChild(d);
        NST.call(W, function(){ try { d.parentNode && d.parentNode.removeChild(d); } catch (e) {} }, 7000);
      } catch (e) {}
    })();
  }

  var warned = {};
  function record(key, size, res){
    var ev = { at: new Date().toISOString(), key: String(key).slice(0, 80), size: size, need: res.need, freed: res.freed, evicted: res.evicted.slice(0, 12), ok: res.ok };
    G.count++; G.freed += res.freed; G.evicted += res.evicted.length; if (!res.ok) G.refused++;
    G.events.push(ev); if (G.events.length > 20) G.events.shift();
    try { if (typeof G.onEvent === 'function') G.onEvent(ev); } catch (e) {}
    try { var wk = ev.key + (res.ok ? '+' : '-'); if (!warned[wk] || Date.now() - warned[wk] > 60000) { warned[wk] = Date.now();
      console.warn('[GC] LSGUARD: browser storage full writing "' + ev.key + '" (' + size + ' chars) — ' + (res.evicted.length ? 'cleared ' + res.evicted.join(', ') + ' (' + res.freed + ' chars), ' : 'nothing safe to clear, ') + (res.ok ? 'saved' : 'NOT saved')); } } catch (e) {}
    if (res.evicted.length) toastOnce();
  }

  /* ── the screen: memory first for this page, sessionStorage when localStorage refused it ── */
  var VIEWK = 'grayco_view', SSV = 'gc_lsg_view', MEM = { has: false, v: null };
  try { var sv = SS && nGet.call(SS, SSV); if (sv) { var o = JSON.parse(sv); if (o && o.ok === false && typeof o.v === 'string') { MEM.has = true; MEM.v = o.v; } } } catch (e) {}
  function ssView(v, ok){ try { if (SS) nSet.call(SS, SSV, JSON.stringify({ v: v, ok: ok, at: Date.now() })); } catch (e) {} }

  var busy = false;
  SP.setItem = function(k, v){
    if (this !== LS) return nSet.apply(this, arguments);
    var key = String(k), isView = key === VIEWK;
    if (isView) { MEM.has = true; MEM.v = String(v); }
    try { var r = nSet.apply(this, arguments); if (isView) ssView(MEM.v, true); return r; }
    catch (e) {
      if (busy || !isQuota(e)) throw e;
      var val = String(v), res = null;
      busy = true;
      try {
        res = relieve(key, val);
        if (res.freed) { try { nSet.call(LS, key, val); res.ok = true; } catch (e2) {} }
        record(key, key.length + val.length, res);
      } catch (e3) {} finally { busy = false; }
      if (res && res.ok) { if (isView) ssView(MEM.v, true); return; }
      if (isView) { G.viewHeld++; ssView(MEM.v, false); return; }   /* held in memory + this tab's sessionStorage */
      throw e;                                                          /* as before */
    }
  };
  SP.getItem = function(k){
    if (MEM.has && k === VIEWK && this === LS) return MEM.v;
    return nGet.apply(this, arguments);
  };
  SP.removeItem = function(k){
    if (this === LS && String(k) === VIEWK) { MEM.has = false; MEM.v = null; try { if (SS) SS.removeItem(SSV); } catch (e) {} }
    return nRem.apply(this, arguments);
  };
  SP.clear = function(){
    if (this === LS) { MEM.has = false; MEM.v = null; try { if (SS) SS.removeItem(SSV); } catch (e) {} }
    return nClear.apply(this, arguments);
  };

  /* ── telemetry: total localStorage use (characters of names + values), the biggest names ── */
  var uMemo = null, uAt = 0;
  G.usage = function(fresh){
    if (!fresh && uMemo && Date.now() - uAt < 60000) return uMemo;
    var chars = 0, keys = 0, big = [];
    try {
      for (var i = 0, n = LS.length; i < n; i++) {
        var k = nKey.call(LS, i); if (k == null) continue;
        var v = nGet.call(LS, k), sz = k.length + (v == null ? 0 : v.length);
        chars += sz; keys++; big.push([k.slice(0, 60), sz]);
      }
    } catch (e) {}
    big.sort(function(a, b){ return b[1] - a[1]; });
    uMemo = { chars: chars, keys: keys, top: big.slice(0, 8), full: G.count, freed: G.freed, refused: G.refused, viewHeld: G.viewHeld };
    uAt = Date.now();
    return uMemo;
  };
  W._gcLsGuard = {
    state: function(){ return { events: G.events.slice(), count: G.count, freed: G.freed, evicted: G.evicted, refused: G.refused, viewHeld: G.viewHeld, view: MEM.has ? MEM.v : null }; },
    usage: function(){ return G.usage(true); },
    tierOf: tierOf
  };
} catch (e) { try { console.warn('[GC] LSGUARD not installed:', e && e.message || e); } catch (x) {} }
})();
