/* patch SYNCALL */
/* Every synced list reaches the screen after the first sign-in (CUSTSYNC widened from the customers to every list).
   The race (tools/patch_CUSTSYNC.py): the no-jump guard notes a cloud list as "on the screen" BEFORE the hand-over
   happens; the hand-over is then held (the sign-in click counts as working) and a held cloud list older than 8 s is
   dropped ("the next pull brings it") - but the next pull is thrown away as "same as on screen". Any list could stay
   stale or empty for that page.
   The fix: each pull notes the cloud's copy of a list (window._gcCloudSeen, patch CUSTSYNC). A few times over the
   next two minutes the screen's list is checked against it; a list that is missing records the cloud delivered (or
   holds an older copy of one) is put together with the cloud's - through that list's own setter (window.__gcListSetterOf,
   the same setter a sync uses). Never fewer records than the screen had; deleted / put-aside records stay out; no
   zero-dollar expense; the schedule's one-row-per-job rule; a job's sticky fields. It waits while someone is typing,
   an edit box is open, a job is open (projects) or the estimate builder is open. Nothing is sent anywhere by it.
   window.__gcSyncAll.stats() / .pending() tell what it did. */
(function(){
  'use strict';
  var W = window;
  if (W.__GC_SYNCALL__) return; W.__GC_SYNCALL__ = true;
  var ST = W.__GC_NATIVE_SETTIMEOUT__ || setTimeout;
  var STEPS = [1500, 4000, 8000, 14000, 22000, 35000, 50000, 70000, 95000, 125000];
  var MAX_WAIT_MS = 300000;                     /* still waiting for typing / an open job after 5 minutes: the next pull brings it */
  var NOT_LISTS = { ccCards: 1 };
  var SCREEN_OF = { subs: 'vendors' };          /* the cloud's `subs` list is shown in the one subs + vendors list (patch ONELIST: a row from `subs` with no isSub is a sub) */
  var RECORD_KEYS = { projects: 1, customers: 1, leads: 1, subs: 1, vendors: 1 };
  var S = {};                                   /* key -> { list, at, step, oks, t } */
  var stats = { seen: 0, checks: 0, healed: {}, waited: 0, skipped: {} };
  function arr(v){ return Array.isArray(v) ? v : []; }
  function idOf(r){ return r && typeof r === 'object' && r.id != null && r.id !== '' ? String(r.id) : ''; }
  function isIdList(v){
    if (!Array.isArray(v)) return false;
    if (!v.length) return true;
    var n = 0; for (var i = 0; i < v.length; i++) if (idOf(v[i])) n++;
    return n >= v.length * 0.9;
  }
  function jp(s, d){ try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } }
  function asList(v){ if (typeof v === 'string' && /^\s*\[/.test(v)) v = jp(v, null); return isIdList(v) ? v : null; }
  function stamp(r){ var t = Date.parse((r && (r.updatedAt || r.savedAt)) || ''); return isFinite(t) ? t : 0; }
  function setterOf(k){ try { return typeof W.__gcListSetterOf === 'function' ? W.__gcListSetterOf(SCREEN_OF[k] || k) : null; } catch (e) { return null; } }

  /* deleted / put aside here: the same tests the tombstone guard uses */
  function deadTest(k){
    var aside = (jp(localStorage.getItem('gc_trust_aside') || '{}', {}) || {}), typ = k === 'invs' ? 'invoices' : k;
    var as = Object.assign({}, aside[k] || {}, aside[typ] || {});
    var tl = jp(localStorage.getItem('gc_tombstones') || '{}', {}) || {};
    var dl = {}; [k, typ].forEach(function(x){ arr(jp(localStorage.getItem('gc_deleted_' + x) || '[]', [])).forEach(function(id){ dl[String(id)] = 1; }); });
    return function(id){
      if (!id) return false;
      if (as[id] || dl[id] || tl[k + ':' + id] || tl[typ + ':' + id]) return true;
      try { if (typeof W._gcxDead === 'function' && W._gcxDead(k, id)) return true; } catch (e) {}
      return false;
    };
  }
  function cleanCloud(k, list){
    var dead = deadTest(k), dead2 = SCREEN_OF[k] ? deadTest(SCREEN_OF[k]) : null, out = list;
    if (k === 'subs') out = arr(out).map(function(r){ return r && typeof r === 'object' && !('isSub' in r) ? Object.assign({}, r, { isSub: true }) : r; });
    try { if (typeof W._gcApplyTombstoneFilter === 'function') out = W._gcApplyTombstoneFilter(k, out) || out; } catch (e) {}
    out = arr(out).filter(function(r){ return !!idOf(r) && !dead(idOf(r)) && !(dead2 && dead2(idOf(r))); });
    if (k === 'expenses' || k === 'gcAcctRegister') out = out.filter(function(r){ var a = parseFloat(r.amt != null ? r.amt : r.amount); return isFinite(a) && Math.abs(a) > 0.001; });
    return out;
  }
  function union(k, mine, theirs){
    var m = null;
    try { if (typeof W._gcUnionMerge === 'function') m = W._gcUnionMerge(k, mine, theirs); } catch (e) { m = null; }
    if (!Array.isArray(m)) {
      var by = {}, order = [];
      arr(mine).concat(arr(theirs)).forEach(function(r){ var id = idOf(r); if (!id) return; if (!(id in by)) { by[id] = r; order.push(id); } else if (stamp(r) > stamp(by[id])) by[id] = r; });
      m = order.map(function(id){ return by[id]; });
      arr(mine).forEach(function(r){ if (!idOf(r)) m.push(r); });
    }
    if (k === 'schedule' && typeof W._gcSchedDedupe === 'function') { try { m = W._gcSchedDedupe(m) || m; } catch (e) {} }
    if (k === 'projects' && typeof W._gcKeepStickyFields === 'function') { try { m = W._gcKeepStickyFields(m) || m; } catch (e) {} }
    return m;
  }
  /* what the screen lacks: cloud records it does not have, or has an older copy of */
  function behind(shown, cloud){
    var have = {}; arr(shown).forEach(function(r){ var id = idOf(r); if (id) have[id] = r; });
    var miss = 0, older = 0;
    cloud.forEach(function(r){ var id = idOf(r), h = have[id]; if (!h) miss++; else { var a = stamp(r), b = stamp(h); if (a && b && a > b) older++; } });
    return { miss: miss, older: older, any: miss + older > 0 };
  }
  function waitWhy(k){
    try { if (W.__GC_EST_BUILDER_OPEN__) return 'the estimate builder is open'; } catch (e) {}
    try { if (W.__GC_IS_TYPING__ || (typeof W.__GC_UNSAVED_TYPING__ === 'function' && W.__GC_UNSAVED_TYPING__())) return 'typing'; } catch (e) {}
    if (RECORD_KEYS[k]) {
      try {
        /* an edit box open, not just a focused box: the search bar takes the focus when the page opens and keeps it */
        if (document.querySelector('#gc-editproj-overlay.visible') || W.__GC_EDIT_LOCK__ || (typeof W.__GC_FORM_ON_SCREEN__ === 'function' && W.__GC_FORM_ON_SCREEN__())) return 'an edit is open';
      } catch (e) {}
    }
    if (k === 'projects') { try { var p = W._gcOpenProject; if (p && p.id) return 'a job is open'; } catch (e) {} }
    return '';
  }
  function later(k, ms){
    var s = S[k]; if (!s) return;
    if (s.t) clearTimeout(s.t);
    s.t = ST.call(W, function(){ check(k); }, ms);
  }
  function next(k){
    var s = S[k]; if (!s) return;
    s.step++;
    if (s.step >= STEPS.length) { delete S[k]; return; }       /* checked long enough: let the list go */
    later(k, Math.max(500, STEPS[s.step] - (Date.now() - s.at)));
  }
  function check(k){
    var s = S[k]; if (!s) return;
    s.t = null; stats.checks++;
    var set = setterOf(k);
    if (!set) {
      if (typeof W.__gcListSetterOf === 'function') { delete S[k]; return; }   /* the CRM is up and this is not one of its screen lists */
      if (Date.now() - s.at > STEPS[STEPS.length - 1]) { delete S[k]; return; }   /* the CRM has not started yet: wait for it */
      return later(k, 1500);
    }
    var why = waitWhy(k);
    if (why) {
      stats.waited++;
      if (Date.now() - s.at > MAX_WAIT_MS) { delete S[k]; return; }
      return later(k, 3000);
    }
    var cloud = cleanCloud(k, s.list);
    if (!cloud.length) { delete S[k]; return; }
    try {
      set(function(prev){
        if (!isIdList(prev)) return prev;
        var b = behind(prev, cloud);
        if (!b.any) { s.oks++; return prev; }
        var m = union(k, prev, cloud);
        if (!Array.isArray(m) || m.length < prev.length) { stats.skipped[k] = (stats.skipped[k] || 0) + 1; return prev; }
        var mid = {}; m.forEach(function(r){ var id = idOf(r); if (id) mid[id] = 1; });
        for (var i = 0; i < prev.length; i++) { var pid = idOf(prev[i]); if (pid && !mid[pid]) { stats.skipped[k] = (stats.skipped[k] || 0) + 1; return prev; } }   /* never drop one the screen has */
        var after = behind(m, cloud);
        if (after.miss >= b.miss && after.older >= b.older) { stats.skipped[k] = (stats.skipped[k] || 0) + 1; return prev; }   /* nothing gained */
        stats.healed[k] = (stats.healed[k] || 0) + 1; s.oks = 0;
        try { console.log('[SYNCALL] ' + k + ': the screen lacked ' + b.miss + ' record(s) the cloud delivered' + (b.older ? ' and had ' + b.older + ' older cop' + (b.older === 1 ? 'y' : 'ies') : '') + ' - put together (' + prev.length + ' -> ' + m.length + ')'); } catch (e) {}
        return m;
      });
    } catch (e) {}
    if (s.oks >= 2 && Date.now() - s.at > 20000) { delete S[k]; return; }
    next(k);
  }
  function note(k, v){
    k = String(k || '');
    if (!k || NOT_LISTS[k] || /^(gc_|__|ccw_)|__chunk\d+$/.test(k)) return;   /* shared to-do / approval lists, the estimator's and the calculator's keys: not screen lists */
    try { if (typeof W._gcPullSkip === 'function' && W._gcPullSkip(k)) return; } catch (e) {}   /* a per-computer key never comes from the cloud */
    var list = asList(v); if (!list || !list.length) return;
    stats.seen++;
    var old = S[k]; if (old && old.t) clearTimeout(old.t);
    S[k] = { list: list, at: Date.now(), step: 0, oks: 0, t: null };
    later(k, STEPS[0]);
  }
  function install(){
    var f = W._gcCloudSeen;
    if (typeof f !== 'function' || f.__syncall) return false;
    var w = function(k, v){ try { f.apply(this, arguments); } catch (e) {} try { note(k, v); } catch (e) {} };
    w.__syncall = true; W._gcCloudSeen = w;
    return true;
  }
  if (!install()) { var tries = 0, iv = setInterval(function(){ if (install() || ++tries > 120) clearInterval(iv); }, 500); }
  W.__gcSyncAll = {
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    pending: function(){ var o = {}; Object.keys(S).forEach(function(k){ o[k] = { n: S[k].list.length, step: S[k].step, age: Date.now() - S[k].at }; }); return o; },
    check: function(k){ if (S[k]) check(k); }
  };
})();
