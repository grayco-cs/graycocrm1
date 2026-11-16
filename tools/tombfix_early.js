/* __GC_PATCH_TOMBFIX__ — the delete list (gc_tombstones) stays small and never fills browser storage (tools/patch_TOMBFIX.py).
   11/12 the cloud row gc_tombstones grew to 21 MB: 29,755 entries, 26,825 of them "payrollProfiles:gid…" ids such as
   giduf2g3e-gidwtg9hh-52-giduf2g3e-gidwtg9hh-… (up to 2,158 characters). They were the ids of copies of ONE id-less payroll
   profile stub that the sync's stable-id step kept giving new, longer ids (fixed at the source in _gcEnsureRecordIds: a
   payroll profile's id is now its person's, and copies are folded). PROFDUP then folded all the copies by name and marked
   every one of those ids deleted at the same moment. Every computer then tried to write the 21 MB list into localStorage
   (~5 M limit): "browser storage full: gc_tombstones (not saved)", dozens of times a day, and pulled 21 MB a minute.
   This script (early in the page, before every tombstone module and every fetch wrapper that captures window.fetch):
   1. compact(map) — the one rule, the same on every computer (idempotent; a union of compacted lists is compacted):
        • a "payrollProfiles:<auto id>" entry (gid…, gid…-gid…, gid…-gid…-N…) is dropped: no payroll profile can carry an
          auto id any more (the stable-id step re-keys it to PP<userId> / PPN-<name> before any delete check), so such a
          mark can never match a record again;
        • any other entry is kept for RETAIN_DAYS (400) days after its own time — well past the 180 days the owner asked
          for, the 30 nightly server backups and any computer that was away for months. An entry whose time cannot be read
          is kept for good. Nothing younger than 400 days is ever dropped.
   2. every door the list comes in or goes out of applies it: localStorage.setItem('gc_tombstones') (also trimmed to a
      1 M-character quick-start copy if it were ever still bigger — non-schedule entries and the newest first; the whole
      list stays in IndexedDB and the cloud), IndexedDB "gc_tombstones" / "gc_tombstones_all" (put and get), and the cloud
      (gc_kv / app_data uploads of the row, and every read that can carry it).
   3. when a read from the cloud carried entries the rule drops, this tab writes the clean list back ONCE (at most every
      10 minutes) through the app's normal upload, as the union of the cloud's cleaned list and this computer's — nothing
      real is ever left out, and two computers doing it at once both send a superset of what the cloud had.
   TOMBFIX2 (r36c, owner's PC: 7.6 s / 6.5 s freezes on Leads, one 32 s freeze after load): every delete-list write ran the
   compaction on a 21 MB string, because a tombstone module's own memory still held the runaway entries (it unions every
   write BEFORE this door cleans it) and its repair wrote them back each time -> clean -> missing -> write again (every
   1.5 s and on every delete). Now: the runaway rule is exposed (window._gcTombGarbage) and every in-memory delete list
   refuses those entries when it takes anything in; this door cleans a localStorage write only when the text carries a
   runaway entry (a cheap text search), remembers the last answer, never trims a write that fits (the 1 M quick-start cap
   applies only when the browser refuses the write), and a big old IndexedDB copy is written back clean once, in the
   background, so it is read big at most once.
   Console: _gcTombFix.state()   _gcTombFix.compact(map)   Off: localStorage gc_tombfix_off = '1'. */
(function(){
'use strict';
var W = window;
try {
  if (W.__GC_PATCH_TOMBFIX__) return; W.__GC_PATCH_TOMBFIX__ = true;
  var LS = null; try { LS = W.localStorage; } catch (e) {}
  var SP = W.Storage && W.Storage.prototype;
  var pGet = SP && SP.getItem, pSet = SP && SP.setItem;
  try { if (LS && pGet.call(LS, 'gc_tombfix_off') === '1') return; } catch (e) {}
  var NST = W.setTimeout;
  var TK = 'gc_tombstones', IDBK = { gc_tombstones: 1, gc_tombstones_all: 1 };
  var DAY = 864e5, RETAIN_DAYS = 400, LS_CAP = 1000000, PFX = 'payrollProfiles:';
  var PP_AUTO = /^gid[0-9a-z]+(?:-(?:gid[0-9a-z]+|\d+))*$/;
  var S = { runs: 0, runaway: 0, aged: 0, lsTrim: 0, lsBefore: 0, lsAfter: 0, cloudDirty: 0, cloudIn: 0, cloudOut: 0, pushed: 0, pushedAt: 0, pushT: 0, last: null };
  var cloudMap = null;   /* the last cleaned copy of the cloud's list (for the one write-back) */

  function when(v){
    if (typeof v === 'number') return v;
    var n = Date.parse(v); if (isFinite(n)) return n;
    n = +v; return isFinite(n) ? n : NaN;
  }
  function garbage(k){ return k.lastIndexOf(PFX, 0) === 0 && PP_AUTO.test(k.slice(PFX.length)); }
  /* { map, runaway, aged, n } — map is the same object when nothing is dropped */
  function compact(m, now){
    if (!m || typeof m !== 'object' || Array.isArray(m)) return { map: m, runaway: 0, aged: 0, n: 0 };
    var lim = (now || Date.now()) - RETAIN_DAYS * DAY;
    var ks = Object.keys(m), out = null, run = 0, aged = 0;
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i], drop = false;
      if (garbage(k)) { drop = true; run++; }
      else { var t = when(m[k]); if (t > 1e12 && t < lim) { drop = true; aged++; } }   /* a real time (ms after 2001), older than the window */
      if (drop) { if (!out) { out = {}; for (var j = 0; j < i; j++) out[ks[j]] = m[ks[j]]; } }
      else if (out) out[k] = m[k];
    }
    if (out) { S.runs++; S.runaway += run; S.aged += aged; S.last = { at: new Date().toISOString(), n: ks.length, runaway: run, aged: aged }; }
    return { map: out || m, runaway: run, aged: aged, n: ks.length };
  }
  function compactText(s){
    if (typeof s !== 'string' || s.length < 2 || s.charAt(0) !== '{') return s;
    var o; try { o = JSON.parse(s); } catch (e) { return s; }
    var c = compact(o); return c.map === o ? s : JSON.stringify(c.map);
  }
  /* a stored value in any of the shapes the CRM has used (map, JSON text, {k, v:text}, {key, value}) */
  function compactAny(v){
    try {
      if (typeof v === 'string') return compactText(v);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
      if (typeof v.v === 'string' && ('k' in v)) { var t = compactText(v.v); return t === v.v ? v : Object.assign({}, v, { v: t }); }
      if (('value' in v) && (('key' in v) || ('updated' in v))) { var x = compactAny(v.value); return x === v.value ? v : Object.assign({}, v, { value: x }); }
      return compact(v).map;
    } catch (e) { return v; }
  }
  /* the quick-start copy in localStorage: cleaned, and never bigger than LS_CAP characters */
  function lsText(s){
    var o; try { o = JSON.parse(s); } catch (e) { return s; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return s;
    var m = compact(o).map, txt = m === o ? s : JSON.stringify(m);
    if (txt.length <= LS_CAP) return txt;
    var ks = Object.keys(m).map(function(k){ var t = when(m[k]); return { k: k, s: k.indexOf('schedule:') === 0 ? 1 : 0, t: isFinite(t) ? t : 0 }; });
    ks.sort(function(a, b){ return a.s - b.s || b.t - a.t; });
    var keep = {}, size = 2;
    for (var i = 0; i < ks.length; i++) {
      var add = ks[i].k.length + JSON.stringify(m[ks[i].k]).length + 4;
      if (size + add > LS_CAP) break;
      keep[ks[i].k] = m[ks[i].k]; size += add;
    }
    S.lsTrim++;
    return JSON.stringify(keep);
  }

  /* ── 1. localStorage ─────────────────────────────────────────────────────── */
  if (SP && LS) {
    /* TOMBFIX2: clean only a text that carries a runaway entry (one text search), remember the last answer; a write that
       fits is never trimmed (the quick-start cap applies only when the browser refuses the write) */
    var memoIn = null, memoOut = null;
    var cleanLS = function(v){
      if (v.indexOf('"' + PFX + 'gid') < 0) return v;
      if (v === memoIn) return memoOut;
      var o; try { o = JSON.parse(v); } catch (e) { return v; }
      var c = compact(o), out = c.map === o ? v : JSON.stringify(c.map);
      memoIn = v; memoOut = out; S.lsCleaned = (S.lsCleaned || 0) + 1;
      return out;
    };
    SP.setItem = function(k, v){
      if (this === LS && k === TK && typeof v === 'string') {
        try { v = cleanLS(v); } catch (e) {}
        try { return pSet.call(this, k, v); }
        catch (e) {
          if (!(e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(String(e.name) + String(e.message))))) throw e;
          var t = v; try { t = lsText(v); } catch (x) {}
          if (t === v) throw e;
          return pSet.call(this, k, t);
        }
      }
      return pSet.apply(this, arguments);
    };
    /* the copy an earlier visit left: cleaned now, before any tombstone module reads it */
    try {
      var raw = pGet.call(LS, TK);
      if (raw && raw.length > 2) {
        S.lsBefore = raw.length;
        var nt = compactText(raw);   /* TOMBFIX2: cleaned, not trimmed (the page's own delete lists would only write it back) */
        if (nt !== raw) pSet.call(LS, TK, nt);
        S.lsAfter = nt.length;
      }
    } catch (e) {}
  }

  /* ── 2. IndexedDB (gc_tombstones / gc_tombstones_all) ───────────────────── */
  /* TOMBFIX2: a big old copy read here is written back clean once, in the background, so no later load reads it big */
  var idbDirty = {}, idbCleanT = 0;
  function scheduleIdbClean(){
    if (idbCleanT) return;
    idbCleanT = NST.call(W, function(){
      var run = function(){
        var g = W._gcIdbRead || W.idbGet, w = W._gcIdbWrite || W.idbSet;
        if (typeof g !== 'function' || typeof w !== 'function') { idbCleanT = 0; return; }
        Object.keys(idbDirty).forEach(function(k){
          delete idbDirty[k];
          Promise.resolve(g(k)).then(function(v){ if (v && typeof v === 'object') { S.idbCleaned = (S.idbCleaned || 0) + 1; return w(k, v); } }).catch(function(){});
        });
        idbCleanT = 0;
      };
      if (typeof W.requestIdleCallback === 'function') W.requestIdleCallback(run, { timeout: 15000 }); else run();
    }, 20000);
  }
  try {
    var OS = W.IDBObjectStore && W.IDBObjectStore.prototype, RQ = W.IDBRequest && W.IDBRequest.prototype;
    var rDesc = RQ && Object.getOwnPropertyDescriptor(RQ, 'result');
    if (OS && typeof OS.put === 'function' && typeof OS.get === 'function') {
      var pPut = OS.put, pIGet = OS.get;
      OS.put = function(value, key){
        if (arguments.length >= 2 && typeof key === 'string' && IDBK[key]) {
          var c = compactAny(value);
          if (c !== value) return pPut.call(this, c, key);
        }
        return pPut.apply(this, arguments);
      };
      OS.get = function(key){
        var rq = pIGet.apply(this, arguments);
        if (typeof key === 'string' && IDBK[key] && rDesc && rDesc.get) {
          try {
            var done = false, memo;
            Object.defineProperty(rq, 'result', { configurable: true, enumerable: true, get: function(){
              var r = rDesc.get.call(rq);              /* throws until the request is done, as before */
              if (!done) { done = true; memo = compactAny(r); if (memo !== r) { idbDirty[key] = 1; scheduleIdbClean(); } }
              return memo;
            } });
          } catch (e) {}
        }
        return rq;
      };
    }
  } catch (e) {}

  /* ── 3. the cloud ────────────────────────────────────────────────────────── */
  function absorbCloud(m){
    if (!m || typeof m !== 'object' || Array.isArray(m)) return;
    cloudMap = m;
  }
  function schedulePush(){
    if (S.pushT || (S.pushedAt && Date.now() - S.pushedAt < 600000)) return;
    S.pushT = NST.call(W, function(){ S.pushT = 0; pushClean(); }, 25000);
  }
  /* the clean list goes back up once, through the app's own upload: the cloud's cleaned list + this computer's */
  function pushClean(){
    try {
      var m = {}, k;
      if (cloudMap) for (k in cloudMap) m[k] = cloudMap[k];
      try { var a = typeof W._gcTombstones === 'function' ? W._gcTombstones() : null; if (a && typeof a === 'object') for (k in a) if (!(k in m)) m[k] = a[k]; } catch (e) {}
      try { var l = JSON.parse(pGet.call(LS, TK) || '{}') || {}; for (k in l) if (!(k in m)) m[k] = l[k]; } catch (e) {}
      m = compact(m).map;
      if (!Object.keys(m).length) return;                         /* never an empty list */
      var f = typeof W._supaUpsertNow === 'function' ? W._supaUpsertNow : (typeof W._supaUpsert === 'function' ? W._supaUpsert : null);
      if (!f) return;
      S.pushedAt = Date.now(); S.pushed++;
      f(TK, m);
      try { console.log('[GC] TOMBFIX: the delete list in the cloud is written back clean (' + Object.keys(m).length + ' entries).'); } catch (e) {}
    } catch (e) {}
  }
  /* rows of a gc_kv answer / upload: the gc_tombstones value cleaned (rowsAll: every row is that key) */
  function fixRows(rows, rowsAll){
    var list = Array.isArray(rows) ? rows : [rows], changed = false, dropped = 0;
    for (var i = 0; i < list.length; i++) {
      var r = list[i]; if (!r || typeof r !== 'object' || !('value' in r)) continue;
      if (!(rowsAll || r.key === TK)) continue;
      var v = r.value, o = typeof v === 'string' ? (function(){ try { return JSON.parse(v); } catch (e) { return null; } })() : v;
      if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
      var c = compact(o);
      dropped += c.runaway + c.aged;
      if (c.map !== o) { r.value = typeof v === 'string' ? JSON.stringify(c.map) : c.map; changed = true; }
      list[i].__gcTF = c.map;
    }
    return { changed: changed, dropped: dropped, list: list };
  }
  function urlOf(input){ try { return new URL(typeof input === 'string' ? input : (input && input.url) || String(input), W.location && W.location.href); } catch (e) { return null; } }
  var pf = W.fetch;
  if (typeof pf === 'function') {
    var tfFetch = function(input, init){
      var U = urlOf(input);
      if (!U || !/^\/rest\/v1\/(gc_kv|app_data)$/.test(U.pathname)) return pf.apply(this, arguments);
      var m = String((init && init.method) || (input && typeof input !== 'string' && !(input instanceof URL) && input.method) || 'GET').toUpperCase();
      var keyF = U.searchParams.getAll('key'), named = false, other = false, eqTomb = false;
      keyF.forEach(function(v){
        if (/^eq\./.test(v) && decodeURIComponent(v.slice(3)).replace(/^"|"$/g, '') === TK && keyF.length === 1) eqTomb = true;
        if (/^eq\./.test(v)) { if (decodeURIComponent(v.slice(3)).replace(/^"|"$/g, '') === TK) named = true; else other = true; }
        else if (/^in\.\(/.test(v)) { if (decodeURIComponent(v).indexOf(TK) >= 0) named = true; else other = true; }
      });
      if (m === 'POST' || m === 'PATCH' || m === 'PUT') {
        var body = init && init.body;
        if (typeof body !== 'string' || (body.indexOf('"' + TK + '"') < 0 && !named)) return pf.apply(this, arguments);
        if (other && !named) return pf.apply(this, arguments);
        try {
          var data = JSON.parse(body), fx = fixRows(data, eqTomb && m !== 'POST');   /* TOMBFIX2 */
          (Array.isArray(data) ? data : [data]).forEach(function(r){ if (r && r.__gcTF) delete r.__gcTF; });
          if (fx.changed) { S.cloudOut++; return pf.call(this, input, Object.assign({}, init, { body: JSON.stringify(data) })); }
        } catch (e) {}
        return pf.apply(this, arguments);
      }
      if (m !== 'GET') return pf.apply(this, arguments);
      if (other && !named) return pf.apply(this, arguments);                   /* a read of other keys only */
      var sel = U.searchParams.get('select');
      if (sel && !/(^|,)\s*(value|\*)\s*(,|$)/.test(sel)) return pf.apply(this, arguments);   /* no values in the answer */
      return pf.apply(this, arguments).then(function(r){
        if (!r || !r.ok || r.status === 204 || typeof r.text !== 'function') return r;
        return r.text().then(function(txt){
          var out = txt, hs = r.headers;
          if (txt && txt.length > 2 && (named || txt.indexOf('"key":"' + TK + '"') >= 0)) {
            try {
              var rows = JSON.parse(txt), fx = fixRows(rows, eqTomb);   /* TOMBFIX2: every row is the list only for key=eq.gc_tombstones */
              (Array.isArray(rows) ? rows : [rows]).forEach(function(x){ if (x && x.__gcTF) { absorbCloud(x.__gcTF); delete x.__gcTF; } });
              if (fx.changed) {
                out = JSON.stringify(rows); S.cloudIn++; S.cloudDirty++;
                try { hs = new Headers(r.headers); hs.delete('content-length'); hs.delete('content-encoding'); } catch (e) {}
                schedulePush();
              }
            } catch (e) {}
          }
          return new Response(out, { status: r.status, statusText: r.statusText, headers: hs });
        });
      });
    };
    W.fetch = tfFetch;
  }

  W._gcTombGarbage = garbage;   /* TOMBFIX2: every in-memory delete list refuses these when it takes anything in */
  W._gcTombFix = {
    state: function(){ var o = {}; for (var k in S) if (k !== 'pushT') o[k] = S[k]; o.retainDays = RETAIN_DAYS; o.lsCap = LS_CAP; return o; },
    compact: function(m, now){ return compact(m, now).map; },
    garbage: garbage, compactAny: compactAny, pushClean: pushClean
  };
  try { console.log('[GC] TOMBFIX: the delete list is kept small (no auto payroll-profile ids; ' + RETAIN_DAYS + ' days) — _gcTombFix.state()'); } catch (e) {}
} catch (e) { try { console.warn('[GC] TOMBFIX not installed:', e && e.message || e); } catch (x) {} }
})();
