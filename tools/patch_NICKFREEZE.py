#!/usr/bin/env python3
"""Idempotent patch NICKFREEZE (owner, Sun 11/22: "It is freezing really bad for Nick. Everyone it has issues ... Everything is
lagging and freezing on everyone's screen"). Measured on the company's data (read-only snapshot, offline harness):
• the per-PO 💬 button pass forced one page layout per button it added (600 spans): 11.4 s on a phone (CPU ×4) — now all reads,
  then all writes (one layout);
• localStorage full on phones and desks (5 M chars): the office-sized backup copies, snapshots and logs live in IndexedDB
  (patch LSSIDE: page memory + IndexedDB 'gc_lsside'), moved there once; the rate-book / price-log mirrors stay in page memory;
• the crm-files upload queue: every 400 is recorded with its reason, a file the store refuses for good is kept back (not sent
  again on every open), a temporary refusal backs off (2 min → 6 h).
See the MARK comments in index.html."""
import sys, re
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch NICKFREEZE'
if MARK in t: print('NICKFREEZE: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('NICKFREEZE anchor', n, old[:90]); t = t.replace(old, new)

# ── 1. the per-PO messenger buttons: read everything first, then insert (one layout instead of one per button) ──
once("""      // find PO badge spans (pattern like A808, O185, 1234)
      var spans=document.querySelectorAll('span');
      var max=Math.min(spans.length, 600);
      for(var i=0;i<max;i++){
        var el=spans[i];
        if(el.children.length>0) continue;
        var t=(el.textContent||'').trim();
        if(!/^[A-Z]{0,3}\\d{2,6}(-[A-Z0-9]{1,4})?$/.test(t)) continue;   /* patch PROJTBL: C1024-2 too */
        if(el.offsetParent===null) continue;
        var proj=findProjectByPO(t);
        if(!proj) continue;
        // Stable guard: skip if THIS row/PO already has a messenger button for this
        // project anywhere nearby. Checking only nextSibling failed after React
        // re-rendered the row, so the button was removed and re-added = flicker.
        var _parentRow = el.closest('tr') || el.parentNode;
        if(_parentRow && _parentRow.querySelector('.__gcListMsgBtn[data-pid="'+proj.id+'"]')) continue;
        if(el.nextSibling && el.nextSibling.className==='__gcListMsgBtn') continue;
        var b=document.createElement('button');""",
"""      // find PO badge spans (pattern like A808, O185, 1234)
      """ + MARK + """: every check first (reads only), then the inserts. Each insert used to be followed by the next span's
         offsetParent, i.e. one full page layout per button: 11.4 s in one task on a phone (CPU x4, the company's ~480 jobs). */
      var spans=document.querySelectorAll('span');
      var max=Math.min(spans.length, 600), todo=[];
      for(var i=0;i<max;i++){
        var el=spans[i];
        if(el.children.length>0) continue;
        var t=(el.textContent||'').trim();
        if(!/^[A-Z]{0,3}\\d{2,6}(-[A-Z0-9]{1,4})?$/.test(t)) continue;   /* patch PROJTBL: C1024-2 too */
        var proj=findProjectByPO(t);
        if(!proj) continue;
        if(el.nextSibling && el.nextSibling.className==='__gcListMsgBtn') continue;
        // Stable guard: skip if THIS row/PO already has a messenger button for this
        // project anywhere nearby. Checking only nextSibling failed after React
        // re-rendered the row, so the button was removed and re-added = flicker.
        var _parentRow = el.closest('tr') || el.parentNode;
        if(_parentRow && _parentRow.querySelector('.__gcListMsgBtn[data-pid="'+proj.id+'"]')) continue;
        if(el.offsetParent===null) continue;
        todo.push([el, proj, t]);
      }
      for(var j=0;j<todo.length;j++){
        var el=todo[j][0], proj=todo[j][1], t=todo[j][2];
        var _row2 = el.closest('tr') || el.parentNode;   /* two badges of one job in one row: one button */
        if(_row2 && _row2.querySelector('.__gcListMsgBtn[data-pid="'+proj.id+'"]')) continue;
        var b=document.createElement('button');""")

# ── 2. the crm-files upload queue ──
once("""function uploadOne(it){
  return below.call(window, SB + '/storage/v1/object/' + BUCKET + '/' + it.path, {""",
"""/* """ + MARK[3:] + """ (owner's phone 11/22: ~10 × "POST /storage/v1/object/crm-files/<hash> → 400" in one minute):
   Supabase Storage answers 400 for every refusal and puts the real reason in the body ({"statusCode":"409","error":
   "Duplicate"} = the file is already there, 403 = the staff rule refused it, 413 too big, 415 type not taken, InvalidKey).
   The burst was this queue sending documents (PDF / xlsx / html moved out of records) that another computer had already
   put in the store: each one went up in full over the phone link only to hear "Duplicate". Now:
   1. each file is first looked up in the store (a small list request that answers 200 either way); when it is there it is
      marked done without being sent;
   2. each answer is sorted by its body (above), and kept on the waiting file (lastErr, tries, when);
   3. a refusal that will not change (a bad name / a type or size the store does not take) is kept back with its reason —
      a record in IndexedDB grayco_files "pending", listed by _gcFilesStatus() — and never sent again by itself;
   4. a temporary one (5xx, an unknown 400) waits per file: 2 min, 6 min, 18 min … at most 6 h, also across opens, and
      the queue goes on with the other files (one bad file used to stop the whole queue and retry every 10 min);
   5. _gcFilesUploadNow(true) tries everything again at once. */
var NF_BACK0 = 2 * 60e3, NF_BACKMAX = 6 * 3600e3, NF_NAME = /^[0-9a-f]{64}\\.[a-z0-9]{1,8}$/;
function nfReason(status, t){
  var j = null; try { j = JSON.parse(t); } catch (e) {}
  var sc = String(j && j.statusCode || status), er = String(j && (j.error || '') || ''), ms = String(j && (j.message || '') || t || '');
  if (sc === '409' || /Duplicate|already exists/i.test(er + ' ' + ms)) return 'exists';
  if (/Bucket not found/i.test(ms + er)) return 'nobucket';
  if (sc === '413' || /too large|exceeded the maximum|Payload too large/i.test(er + ' ' + ms)) return 'toobig';
  if (sc === '415' || /mime type|invalid_mime/i.test(er + ' ' + ms)) return 'badtype';
  if (/InvalidKey|Invalid key/i.test(er + ' ' + ms)) return 'badname';
  if (sc === '401' || /jwt|expired|Unauthorized|invalid signature/i.test(er + ' ' + ms) && sc !== '403') return 'auth';
  if (sc === '403' || /row-level security/i.test(ms)) return 'denied';
  return 'error';
}
function nfThere(it){
  /* is this fingerprint already in the store? (a list request answers 200 either way: no 400 in the device log) */
  return below.call(window, SB + '/storage/v1/object/list/' + BUCKET, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', search: it.hash, limit: 3, offset: 0 }) })
    .then(function(r){ return r.ok ? r.json() : null; }).then(function(a){ return Array.isArray(a) && a.some(function(o){ return o && o.name === it.path; }); }, function(){ return false; });
}
function uploadOne(it){
  return below.call(window, SB + '/storage/v1/object/' + BUCKET + '/' + it.path, {""")
once("""    if (r.ok) return 'ok';
    return r.text().then(function(t){ return t; }, function(){ return ''; }).then(function(t){
      if (r.status === 409 || /Duplicate|already exists/i.test(t)) return 'exists';
      if (/Bucket not found/i.test(t)) return 'nobucket';
      if (r.status === 413 || /too large|exceeded the maximum/i.test(t)) return 'toobig';
      if (r.status === 415 || /mime type/i.test(t)) return 'badtype';
      if (r.status === 401 || r.status === 403 || /row-level security|Unauthorized|jwt/i.test(t)) return 'auth';
      stats.lastError = 'HTTP ' + r.status + ' ' + t.slice(0, 120);
      return 'error';
    });""",
"""    if (r.ok) return 'ok';
    return r.text().then(function(t){ return t; }, function(){ return ''; }).then(function(t){
      var why = nfReason(r.status, t);   /* patch NICKFREEZE: the reason is in the body */
      if (why === 'denied') why = NF_NAME.test(String(it.path)) ? 'auth' : 'badname';   /* the staff rule: a fingerprint name, signed-in staff */
      it.lastErr = 'HTTP ' + r.status + ' ' + why + ' ' + String(t).slice(0, 100); it.lastAt = Date.now();
      if (why !== 'exists') stats.lastError = it.lastErr;
      return why;
    });""")
once("""function drain(){
  if (draining) return Promise.resolve();
  if (stale()) return Promise.resolve();
  draining = true;
  return fall('pending').catch(function(){ return []; }).then(function(list){
    var i = 0;
    function next(){
      while (i < list.length && (list[i].badType || (list[i].tooBig && (((list[i].blob && list[i].blob.size) || 0) > MAX_UPLOAD || Date.now() - (list[i].tbAt || 0) < 864e5)))) i++;   /* patch TRAIN2: a file the store refused as too big is tried again once a day (the limit may have been raised) */
      if (i >= list.length) return null;
      var it = list[i++];
      return uploadOne(it).then(function(r){""",
"""function drain(force){
  if (draining) return Promise.resolve();
  if (stale()) return Promise.resolve();
  draining = true;
  force = force === true;
  return fall('pending').catch(function(){ return []; }).then(function(list){
    var i = 0, soonest = 0;
    function skip(it){
      if (it.badType || it.refused) return !force;   /* patch NICKFREEZE: kept back for good (the record stays) */
      if (it.tooBig && ((((it.blob && it.blob.size) || 0) > MAX_UPLOAD) || Date.now() - (it.tbAt || 0) < 864e5)) return true;   /* patch TRAIN2: a file the store refused as too big is tried again once a day (the limit may have been raised) */
      if (!force && it.nextAt && Date.now() < it.nextAt) { if (!soonest || it.nextAt < soonest) soonest = it.nextAt; return true; }   /* patch NICKFREEZE: its own wait */
      return false;
    }
    function next(){
      while (i < list.length && skip(list[i])) i++;
      if (i >= list.length) { if (soonest) later(Math.max(NF_BACK0, soonest - Date.now() + 1000)); return null; }
      var it = list[i++];
      var look = nfThere(it);   /* patch NICKFREEZE: there already? (most files here came out of records another computer stored first) */
      return look.then(function(there){ return there ? 'exists' : uploadOne(it); }).then(function(r){""")
once("""        if (r === 'toobig' || r === 'badtype') {
          it[r === 'toobig' ? 'tooBig' : 'badType'] = true; if (r === 'toobig') it.tbAt = Date.now();
          return fput('pending', it).then(next);
        }
        if (r === 'nobucket') { stats.bucket = 'missing'; later(30 * 60e3); return null; }
        later(r === 'error' ? 10 * 60e3 : 5 * 60e3);   /* offline / not signed in yet / cloud trouble */
        return null;""",
"""        if (r === 'toobig' || r === 'badtype') {
          it[r === 'toobig' ? 'tooBig' : 'badType'] = true; if (r === 'toobig') it.tbAt = Date.now();
          return fput('pending', it).then(next);
        }
        if (r === 'badname') { it.refused = 'the file store refused its name: ' + String(it.lastErr || '').slice(0, 120); it.refusedAt = Date.now(); return fput('pending', it).then(next); }   /* patch NICKFREEZE */
        if (r === 'nobucket') { stats.bucket = 'missing'; later(30 * 60e3); return null; }
        if (r === 'error') {   /* patch NICKFREEZE: this file waits (2 min × 3^n, at most 6 h); the others go on */
          it.tries = (it.tries || 0) + 1; it.nextAt = Date.now() + Math.min(NF_BACKMAX, NF_BACK0 * Math.pow(3, it.tries - 1));
          return fput('pending', it).then(next, next);
        }
        later(5 * 60e3);   /* offline / not signed in yet: the whole queue waits */
        return null;""")
once("""window._gcFilesUploadNow = function(){ return drain(); };""",
"""window._gcFilesUploadNow = function(force){ return drain(force === true); };   /* patch NICKFREEZE: (true) = also the files kept back */
/* patch NICKFREEZE: a caller that put the bytes in the store itself (the estimate send) marks them done, so the queue does not
   send the same file again (that second POST was a "Duplicate" 400) */
window.__gcFilesMarkDone = function(hash, path){ hash = String(hash || ''); if (!/^[0-9a-f]{64}$/.test(hash)) return Promise.resolve(false);
  return fput('done', { hash: hash, path: String(path || ''), at: Date.now() }).then(function(){ return fdel('pending', hash).catch(function(){}); }).then(function(){ return true; }, function(){ return false; }); };""")
once("""      waitingToUpload: p.filter(function(x){ return !x.tooBig && !x.badType; }).length,""",
"""      waitingToUpload: p.filter(function(x){ return !x.tooBig && !x.badType && !x.refused; }).length,
      keptBack: p.filter(function(x){ return x.refused; }).map(function(x){ return (x.name || x.path) + ': ' + x.refused; }),   /* patch NICKFREEZE */
      waitingAfterError: p.filter(function(x){ return x.nextAt && !x.refused; }).map(function(x){ return (x.name || x.path) + ' (' + (x.tries || 0) + ' tries, next ' + new Date(x.nextAt).toLocaleTimeString() + '): ' + (x.lastErr || ''); }),""")
# the estimate send: its own confirmed POST first, then the file store (which then has nothing left to send)
once("""      var ref = 'sb:crm-files/' + h + '.pdf', file = new Blob([ab], { type: 'application/pdf' });
      try { if (typeof W._gcStoreFile === 'function') W._gcStoreFile(new File([ab], name || 'Estimate.pdf', { type: 'application/pdf' }), { kind: 'doc', name: name }).catch(function(){}); } catch (e) {}
      return W.fetch(SB + '/storage/v1/object/crm-files/' + h + '.pdf', { method: 'POST', body: file, headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' } })
        .then(function(r){
          if (r.ok) return 'ok';
          return r.text().then(function(t){ if (r.status === 409 || /Duplicate|already exists/i.test(t)) return 'exists'; throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 80)); });
        }).then(function(){ return { ref: ref, sha256: h, size: ab.byteLength, name: name }; });""",
"""      var ref = 'sb:crm-files/' + h + '.pdf', file = new Blob([ab], { type: 'application/pdf' });
      var keep = function(){ try { if (typeof W._gcStoreFile === 'function') W._gcStoreFile(new File([ab], name || 'Estimate.pdf', { type: 'application/pdf' }), { kind: 'doc', name: name }).catch(function(){}); } catch (e) {} };
      return W.fetch(SB + '/storage/v1/object/crm-files/' + h + '.pdf', { method: 'POST', body: file, headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' } })
        .then(function(r){
          if (r.ok) return 'ok';
          return r.text().then(function(t){ if (r.status === 409 || /Duplicate|already exists/i.test(t)) return 'exists'; throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 80)); });
        }).then(function(){
          /* patch NICKFREEZE: in the store: marked done first, so the file store keeps its copy without sending it a second time */
          return Promise.resolve(typeof W.__gcFilesMarkDone === 'function' ? W.__gcFilesMarkDone(h, h + '.pdf') : null).then(keep, keep);
        }, function(e){ keep(); throw e; }).then(function(){ return { ref: ref, sha256: h, size: ab.byteLength, name: name }; });""")

# ── 3. the rate-book / price-log mirrors never go back into localStorage (the pull writes IndexedDB right after) ──
once("""  function hold(k, v){
    k = String(k);
    if (KEYS[k] !== 1 || !HAS[k] || v == null) return false;""",
"""  function hold(k, v){
    k = String(k);
    /* patch NICKFREEZE: also before this page has seen the list in IndexedDB — every writer of these three keeps the same
       list in IndexedDB "__est__<key>" (the pull: idbSet right after; the builder: window.storage first). Nick's iPhone
       (11/22) still had gc_matlog_v2 (807 K) + gc_rates_v3 (154 K) in a full localStorage, written back by the pull. */
    if (KEYS[k] !== 1 || v == null) return false;""")

# ── 4. LSSIDE: backup copies, snapshots and the removed-rows log live in IndexedDB, not in localStorage ──
LSSIDE = r"""<script id="gc-patch-lsside">
/* __GC_PATCH_LSSIDE__ — patch NICKFREEZE: localStorage keeps only what must be read at once; the office-sized backup copies
   and the removed-rows log live in IndexedDB (tools/patch_NICKFREEZE.py).
   11/22: "browser storage full: gc_ests_backup (not saved)", "gc_snap_estimates (not saved)", "gc_dupes_removed" on Nick's
   iPhone and the office / Glenn desks. The desks held ~4.7-5.1 M of the browser's 5 M characters, ~1.5-2 M of it copies of
   lists that are in IndexedDB and the cloud: gc_snap_<list> / gc_bak_<list> / gc_safenet_<list> / gc_projects_backup /
   gc_sched_backup / gc_ests_backup, and the log of removed duplicates gc_dupes_removed (up to 600 rows, 0.3-0.5 M).
   Every write of one of them into a full store failed (and was tried again at the next sync).
   1. Those keys are kept in this page's memory; localStorage.getItem returns that value, so every reader reads what it
      read before. On a desk computer (and for the removed-rows log everywhere) they are also kept in IndexedDB
      "gc_lsside" (written 1.5 s after the last change, and when the page is hidden); the next open reads them back
      (~0.1 s after the start, before the CRM's own code runs) — a write made before that is merged in (the log: union).
      On a phone the backup copies stay in memory only (patch FIELDGUARD already kept them off Field phones).
   2. Once per open, any copy still in localStorage is moved: written to IndexedDB first, removed from localStorage only
      when IndexedDB has it — nothing is deleted, nothing that is not a copy is touched (gc_safenet_meta stays).
   3. IndexedDB missing / refused (private window): everything as before (localStorage).
   Console: __gcLsSide.state()  __gcLsSide.keys()   Off: localStorage gc_lsside_off = '1'. */
(function(){
'use strict';
var W = window;
try {
  if (W.__gcLsSide) return;
  var SP = W.Storage && W.Storage.prototype, LS = null; try { LS = W.localStorage; } catch (e) {}
  if (!SP || !LS || !W.indexedDB) return;
  var pGet = SP.getItem, pSet = SP.setItem, pRem = SP.removeItem, pClr = SP.clear, pKey = SP.key;
  try { if (pGet.call(LS, 'gc_lsside_off') === '1') return; } catch (e) {}
  var NST = W.setTimeout, NCT = W.clearTimeout;
  var PHONE = false; try { PHONE = ((navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in W) && Math.min(screen.width, screen.height) < 600; } catch (e) {}
  var COPY = /^(gc_snap_[A-Za-z]+|gc_bak_[A-Za-z]+|gc_safenet_[A-Za-z]+|gc_projects_backup|gc_sched_backup|gc_ests_backup)$/;
  var LOGK = { gc_dupes_removed: 600 };   /* log keys: merged, at most N rows */
  function side(k){ k = String(k); return LOGK.hasOwnProperty(k) || (COPY.test(k) && k !== 'gc_safenet_meta'); }
  function disk(k){ return LOGK.hasOwnProperty(k) || !PHONE; }
  var MEM = Object.create(null), PRE = Object.create(null), DIRTY = Object.create(null);
  var ready = false, failed = false, dbh = null, flushT = 0, t0 = Date.now();
  var S = { phone: PHONE, ready: false, failed: false, readyMs: 0, loaded: 0, loadedChars: 0, moved: 0, movedChars: 0, puts: 0, putChars: 0, memOnly: 0, merged: 0, err: '' };
  function sz(v){ return v == null ? 0 : String(v).length; }
  function arr(s){ try { var a = JSON.parse(s); return Array.isArray(a) ? a : null; } catch (e) { return null; } }
  function mergeLog(k, base, add){
    var a = arr(base), b = arr(add); if (!a || !b) return add != null ? add : base;
    var seen = Object.create(null), out = [];
    a.concat(b).forEach(function(x){ var j = JSON.stringify(x); if (seen[j]) return; seen[j] = 1; out.push(x); });
    S.merged++; return JSON.stringify(out.slice(-LOGK[k]));
  }
  function mark(k){ if (!disk(k) || failed) return; DIRTY[k] = 1; if (!flushT) flushT = NST.call(W, flush, 1500); }
  function flush(){
    flushT = 0; if (!dbh || failed) return;
    var ks = Object.keys(DIRTY); if (!ks.length) return; DIRTY = Object.create(null);
    try {
      var tx = dbh.transaction('kv', 'readwrite'), os = tx.objectStore('kv');
      ks.forEach(function(k){ var v = MEM[k]; if (v == null) os['delete'](k); else { os.put(v, k); S.puts++; S.putChars += v.length; } });
      tx.onerror = function(){ S.err = String(tx.error && tx.error.name || 'tx'); ks.forEach(function(k){ DIRTY[k] = 1; }); };
    } catch (e) { S.err = String(e && e.name || e); }
  }

  SP.getItem = function(k){
    if (this === LS && side(k) && !failed) { var ks = String(k); if (MEM[ks] !== undefined) return MEM[ks]; if (PRE[ks] !== undefined) return PRE[ks]; }
    return pGet.apply(this, arguments);
  };
  SP.setItem = function(k, v){
    if (this !== LS || failed || !side(k)) return pSet.apply(this, arguments);
    var ks = String(k), vs = String(v);
    if (!ready && disk(ks)) { PRE[ks] = vs; return; }   /* merged once IndexedDB has been read */
    MEM[ks] = vs; if (disk(ks)) mark(ks); else S.memOnly++;
  };
  SP.removeItem = function(k){
    if (this === LS && side(k) && !failed) { var ks = String(k); if (!ready && disk(ks)) PRE[ks] = null; else { MEM[ks] = null; mark(ks); } }
    return pRem.apply(this, arguments);
  };
  SP.clear = function(){
    if (this === LS) { MEM = Object.create(null); PRE = Object.create(null); DIRTY = Object.create(null); try { if (dbh) dbh.transaction('kv', 'readwrite').objectStore('kv').clear(); } catch (e) {} }
    return pClr.apply(this, arguments);
  };

  function giveUp(why){   /* no IndexedDB: localStorage as before */
    S.err = String(why || 'idb'); failed = true; S.failed = true; ready = true; S.ready = true;
    Object.keys(PRE).forEach(function(k){ try { if (PRE[k] == null) pRem.call(LS, k); else pSet.call(LS, k, PRE[k]); } catch (e) {} });
    Object.keys(MEM).forEach(function(k){ try { if (MEM[k] != null && pGet.call(LS, k) == null) pSet.call(LS, k, MEM[k]); } catch (e) {} });
    PRE = Object.create(null);
  }
  function opened(db){
    if (failed) { try { db.close(); } catch (e) {} return; }   /* gave up already (15 s): localStorage as before for this page */
    dbh = db;
    try { db.onversionchange = function(){ try { db.close(); } catch (e) {} dbh = null; }; } catch (e) {}
    var got = Object.create(null);
    try {
      var tx = db.transaction('kv', 'readonly'), os = tx.objectStore('kv'), cur = os.openCursor();
      cur.onsuccess = function(){ var c = cur.result; if (c) { if (typeof c.value === 'string') got[String(c.key)] = c.value; c['continue'](); } };
      tx.oncomplete = function(){ settle(got); };
      tx.onerror = tx.onabort = function(){ giveUp('read ' + (tx.error && tx.error.name)); };
    } catch (e) { giveUp(e && e.name); }
  }
  function settle(got){
    if (failed) return;
    Object.keys(got).forEach(function(k){ if (!side(k) || !disk(k)) return; /* a phone's moved copies stay an archive (never read back stale) */ if (MEM[k] === undefined) { MEM[k] = got[k]; S.loaded++; S.loadedChars += got[k].length; } });
    /* writes made before IndexedDB was read: the log is merged, a copy is simply the newer one */
    Object.keys(PRE).forEach(function(k){ var v = PRE[k]; MEM[k] = v == null ? null : (LOGK.hasOwnProperty(k) ? mergeLog(k, MEM[k] != null ? MEM[k] : pGet.call(LS, k), v) : v); DIRTY[k] = 1; });
    PRE = Object.create(null);
    /* copies still in localStorage: into IndexedDB first, then out of localStorage */
    var legacy = [];
    try { for (var i = 0, n = LS.length; i < n; i++) { var k = pKey.call(LS, i); if (k != null && side(k)) legacy.push(k); } } catch (e) {}
    var put = [];
    legacy.forEach(function(k){
      var v = null; try { v = pGet.call(LS, k); } catch (e) {} if (v == null) return;
      if (LOGK.hasOwnProperty(k)) MEM[k] = MEM[k] != null ? mergeLog(k, MEM[k], v) : v;
      else if (MEM[k] === undefined || DIRTY[k] !== 1) MEM[k] = v;    /* localStorage holds the newest copy unless this page just wrote one */
      put.push([k, v.length]);
    });
    ready = true; S.ready = true; S.readyMs = Date.now() - t0;
    if (!put.length) { if (Object.keys(DIRTY).length && !flushT) flushT = NST.call(W, flush, 1500); return; }
    try {
      var tx = dbh.transaction('kv', 'readwrite'), os = tx.objectStore('kv');
      put.forEach(function(p){ if (MEM[p[0]] != null) os.put(MEM[p[0]], p[0]); delete DIRTY[p[0]]; });
      tx.oncomplete = function(){ put.forEach(function(p){ try { pRem.call(LS, p[0]); S.moved++; S.movedChars += p[1]; } catch (e) {} }); };
      tx.onerror = function(){ S.err = 'move ' + (tx.error && tx.error.name); };
    } catch (e) { S.err = 'move ' + (e && e.name); }
    if (Object.keys(DIRTY).length && !flushT) flushT = NST.call(W, flush, 1500);
  }
  try {
    var rq = W.indexedDB.open('gc_lsside', 1);
    rq.onupgradeneeded = function(){ try { var d = rq.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); } catch (e) {} };
    rq.onsuccess = function(){ opened(rq.result); };
    rq.onerror = function(){ giveUp('open ' + (rq.error && rq.error.name)); };
    rq.onblocked = function(){ giveUp('blocked'); };
  } catch (e) { giveUp(e && e.name); }
  NST.call(W, function(){ if (!ready) giveUp('timeout'); }, 15000);
  try { W.addEventListener('pagehide', function(){ if (flushT) { NCT.call(W, flushT); flush(); } }); W.document.addEventListener('visibilitychange', function(){ if (W.document.visibilityState === 'hidden' && flushT) { NCT.call(W, flushT); flush(); } }); } catch (e) {}
  W.__gcLsSide = {
    state: function(){ var m = {}, n = 0; Object.keys(MEM).forEach(function(k){ if (MEM[k] != null) { m[k] = MEM[k].length; n += MEM[k].length; } }); return Object.assign({ keys: m, chars: n }, S); },
    keys: function(){ return Object.keys(MEM).filter(function(k){ return MEM[k] != null; }); },
    isSide: side, flush: flush
  };
} catch (e) { try { console.warn('[GC] LSSIDE not installed:', e && e.message || e); } catch (x) {} }
})();
</script>
"""
once("""<script id="gc-patch-fieldlag">""", LSSIDE + """<script id="gc-patch-fieldlag">""")

# ── 5. the file door: a response is parsed only when it holds a file VALUE (not an <img src="data:…"> inside a saved page) ──
once("""function bodyNeeds(s){
  if (typeof s !== 'string' || s.length < MIN_LEN) return blobReg.size > 0 && typeof s === 'string' && s.indexOf('"blob:') >= 0;
  return s.indexOf(';base64,') >= 0 || s.indexOf('"data:') >= 0 || (blobReg.size > 0 && s.indexOf('"blob:') >= 0) || RAW_IN_BODY.test(s);
}""",
"""/* """ + MARK[3:] + """: the company's projectDocs (in every first pull) holds saved estimate / proposal pages whose logo is an
   <img src="data:image/jpeg;base64,…"> INSIDE the page text. ';base64,' anywhere sent the whole pull (12.6 MB on a phone) through
   JSON.parse + a walk + nothing found: 0.5-1.3 s per pull in long tasks on the owner's phone. A file the door can convert is a
   string VALUE that starts with data: — in the JSON text "data: right after : [ or , (escaped \\"data: when the value is
   itself JSON text, as many CRM rows are). An attribute (src=\\"data:, url(\\"data:) is not one. */
function nfDataValue(s){
  var i = -1, n = 0;
  while ((i = s.indexOf('"data:', i + 1)) >= 0) {
    if (++n > 4000) return true;                      /* a pathological body: let the full check decide */
    var j = i - 1; while (j >= 0 && s.charCodeAt(j) === 92) j--;   /* \\" … */
    while (j >= 0 && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 10 || s.charCodeAt(j) === 13 || s.charCodeAt(j) === 9)) j--;
    var c = j >= 0 ? s.charCodeAt(j) : 58;
    if (c === 58 || c === 91 || c === 44) return true;   /* : [ , */
  }
  return false;
}
function bodyNeeds(s){
  if (typeof s !== 'string' || s.length < MIN_LEN) return blobReg.size > 0 && typeof s === 'string' && s.indexOf('"blob:') >= 0;
  return nfDataValue(s) || (blobReg.size > 0 && s.indexOf('"blob:') >= 0) || RAW_IN_BODY.test(s);
}""")

# ── 6. "is it deleted?" without re-reading localStorage for every record ──
# LSSIDE counts every localStorage write of this page (and of other tabs: the storage event): __gcLsGen(key)
once("""  SP.getItem = function(k){
    if (this === LS && side(k) && !failed) { var ks = String(k); if (MEM[ks] !== undefined) return MEM[ks]; if (PRE[ks] !== undefined) return PRE[ks]; }
    return pGet.apply(this, arguments);
  };
  SP.setItem = function(k, v){
    if (this !== LS || failed || !side(k)) return pSet.apply(this, arguments);""",
"""  SP.getItem = function(k){
    if (this === LS && side(k) && !failed) { var ks = String(k); if (MEM[ks] !== undefined) return MEM[ks]; if (PRE[ks] !== undefined) return PRE[ks]; }
    return pGet.apply(this, arguments);
  };
  /* every write of a key on this page (and, by the storage event, in another tab) bumps its number: a reader that keeps a
     parsed copy re-reads only when the number moved (patch NICKFREEZE: the delete checks re-read 160 K per record) */
  var GEN = Object.create(null), GALL = 0;
  W.__gcLsGen = function(k){ return GALL + ':' + (GEN[String(k)] || 0); };
  try { W.addEventListener('storage', function(e){ if (!e || e.key == null) GALL++; else GEN[e.key] = (GEN[e.key] || 0) + 1; }); } catch (e) {}
  SP.setItem = function(k, v){
    if (this === LS) GEN[String(k)] = (GEN[String(k)] || 0) + 1;
    if (this !== LS || failed || !side(k)) return pSet.apply(this, arguments);""")
once("""  SP.removeItem = function(k){
    if (this === LS && side(k) && !failed) {""",
"""  SP.removeItem = function(k){
    if (this === LS) GEN[String(k)] = (GEN[String(k)] || 0) + 1;
    if (this === LS && side(k) && !failed) {""")
once("""  SP.clear = function(){
    if (this === LS) { MEM = Object.create(null);""",
"""  SP.clear = function(){
    if (this === LS) GALL++;
    if (this === LS) { MEM = Object.create(null);""")
once("""  var _lsRaw = null;
  function load(){
    if(!MEM) MEM = {};
    try{
      var raw = localStorage.getItem(TK) || '{}';
      if(raw !== _lsRaw){ _lsRaw = raw; absorb(JSON.parse(raw)); }
    }catch(e){}""",
"""  var _lsRaw = null, _nfGen = null, _nfAt = 0;
  function load(){
    if(!MEM) MEM = {};
    try{
      /* patch NICKFREEZE: every call read the whole stored list (160 K characters) out of localStorage, and the register
         de-dupe asks for every pair of rows: 3-4 s main-thread tasks on the office desk at each sync (Dashboard, Estimates,
         Accounting, Projects) and 1.2 s on a phone. The stored text is read again when this page (or another tab) wrote it
         — localStorage's own write counter (LSSIDE) — or after 1 s, so nothing written any other way is missed for long. */
      var _g = window.__gcLsGen ? window.__gcLsGen(TK) : null, _n = Date.now();
      if(_g === null || _g !== _nfGen || _n - _nfAt > 1000){
        _nfGen = _g; _nfAt = _n;
        var raw = localStorage.getItem(TK) || '{}';
        if(raw !== _lsRaw){ _lsRaw = raw; absorb(JSON.parse(raw)); }
      }
    }catch(e){}""")
once("""  function getTombs(){
    try{ return JSON.parse(localStorage.getItem(TKEY)||'[]'); }catch(e){ return []; }
  }""",
"""  function getTombs(){
    try{ return JSON.parse(localStorage.getItem(TKEY)||'[]'); }catch(e){ return []; }
  }
  /* patch NICKFREEZE: the read-only checks (one per job of every list) keep a parsed copy until the stored text is written
     again (LSSIDE's counter) or 1 s has passed */
  var _nfT = null, _nfTSet = null, _nfTGen = null, _nfTAt = 0;
  function tombsRO(){
    var g = window.__gcLsGen ? window.__gcLsGen(TKEY) : null, n = Date.now();
    if(!_nfT || g === null || g !== _nfTGen || n - _nfTAt > 1000){ _nfT = getTombs(); _nfTGen = g; _nfTAt = n; _nfTSet = {}; for(var i=0;i<_nfT.length;i++) _nfTSet[_nfT[i]] = 1; }
    return _nfT;
  }""")
once("""  window._gcIsProjectDeleted = function(id){
    return getTombs().indexOf(id) >= 0;
  };""",
"""  window._gcIsProjectDeleted = function(id){
    tombsRO(); return _nfTSet[id] === 1 || (typeof id !== 'string' && _nfT.indexOf(id) >= 0);   /* patch NICKFREEZE */
  };""")
once("""    if(!Array.isArray(list)) return list;
    var t = getTombs();
    if(!t.length) return list;
    return list.filter(function(p){ return !(p && t.indexOf(p.id) >= 0); });""",
"""    if(!Array.isArray(list)) return list;
    var t = tombsRO();   /* patch NICKFREEZE */
    if(!t.length) return list;
    return list.filter(function(p){ return !(p && (_nfTSet[p.id] === 1 || (typeof p.id !== 'string' && t.indexOf(p.id) >= 0))); });""")
# the register de-dupe: each row's "is it deleted" is asked once per pass, not once per pair
once("""      twin=rowDead(kl, r) ? null : out.find(function(x){ return s(x._id||x.id)!==s(r._id||r.id) && !rowDead(kl, x) &&""",
"""      if(!collapse._nfDead) collapse._nfDead=new Map();   /* patch NICKFREEZE: once per row per pass (was once per pair) */
      var _nfD=function(x){ var m=collapse._nfDead, v=m.get(x); if(v===undefined){ v=rowDead(kl, x); m.set(x, v); } return v; };
      twin=_nfD(r) ? null : out.find(function(x){ return s(x._id||x.id)!==s(r._id||r.id) && !_nfD(x) &&""")
once("""  var out=[], dropped=[], kl=key==='invoices'?'invs':key;
  var rows=list.filter(function(r){ return r && typeof r==='object'; });""",
"""  var out=[], dropped=[], kl=key==='invoices'?'invs':key;
  collapse._nfDead=new Map();   /* patch NICKFREEZE: a fresh answer per pass */
  var rows=list.filter(function(r){ return r && typeof r==='object'; });""")

# ── 7. the split whole-table read: the shared answer is turned into text once, not once per caller ──
once("""function jsonResponse(rows){
  var body = '[]';
  try{ body = JSON.stringify(rows); }catch(e){ body = '[]'; }""",
"""var _nfBodyOf = null, _nfBody = null;   /* patch NICKFREEZE: the text of the last shared answer (every caller in the 20 s window
   got its own JSON.stringify of the whole table: 1-1.7 s per caller on a phone, Leads / Dashboard) */
function jsonResponse(rows){
  var body = '[]';
  if(rows && rows === _nfBodyOf && _nfBody != null) body = _nfBody;
  else { try{ body = JSON.stringify(rows); }catch(e){ body = '[]'; } if(rows && typeof rows === 'object'){ _nfBodyOf = rows; _nfBody = body; } }""")

# ── 8. the invoice → job matcher: each job's PO / address / name words / customer are worked out once, not once per invoice ──
once("""/* ── how well one job fits one invoice: score + the evidence, in words ── */
function scoreJob(inv, p, ctx){""",
"""/* patch NICKFREEZE: the job side of a match (POs, address keys, name words, customer keys) was rebuilt for every invoice ×
   every job — the accounting badge's pass took 1.2 s in one task on a phone (CPU ×4). Kept per job object, rebuilt when one of
   the fields it is made from changes. */
var _nfJK = typeof WeakMap === 'function' ? new WeakMap() : null;
function nfJobKeys(p, amap){
  var sig = [p.name, p.client, p.customer, p.address, p.jobAddress, p.addr, p.autoPO, p.po, p.poNumber, Array.isArray(p.pos) ? p.pos.join(',') : ''].join('\\u0001');
  var c = _nfJK && _nfJK.get(p);
  if (c && c.amap === amap && c.sig === sig) return c;
  c = { amap: amap, sig: sig, pos: jobPOs(p), addr: jobAddrKeys(p), nw: nameWords(p, amap), pk: custKey(p.client || p.customer, amap), pn: custKey(p.name, amap) };
  if (_nfJK) _nfJK.set(p, c);
  return c;
}
/* ── how well one job fits one invoice: score + the evidence, in words ── */
function scoreJob(inv, p, ctx){
  var _nk = nfJobKeys(p, ctx.amap);""")
once("""  var pos = jobPOs(p), explicit = ctx.explicitPOs;""", """  var pos = _nk.pos, explicit = ctx.explicitPOs;""")
once("""  var ah = addrHit(tkeys, jobAddrKeys(p));""", """  var ah = addrHit(tkeys, _nk.addr);""")
once("""  var nw = nameWords(p, amap), hits = nw.filter(""", """  var nw = _nk.nw, hits = nw.filter(""")
once("""  var ck = custKey(inv.client || inv.customer || inv.sub, amap), pk = custKey(p.client || p.customer, amap), pn = custKey(p.name, amap);""",
"""  var ck = custKey(inv.client || inv.customer || inv.sub, amap), pk = _nk.pk, pn = _nk.pn;""")

# ── 7b. …and the first shared answer's text is the keys' own texts joined (no JSON.stringify of the whole table) ──
once("""  var r = await withTimeout(real.call(window, one, init), PER_KEY_MS);
  if(!r || !r.ok) return null;
  var txt = '';
  try{ txt = await r.text(); }catch(e){ return null; }
  if(!txt) return [];
  try{
    var rows = JSON.parse(txt);
    return Array.isArray(rows) ? rows : null;""",
"""  var r = await withTimeout(real.call(window, one, init), PER_KEY_MS);
  if(!r || !r.ok) return null;
  var txt = '';
  try{ txt = await r.text(); }catch(e){ return null; }
  if(!txt) return [];
  try{
    var rows = JSON.parse(txt);
    if(Array.isArray(rows)){ try{ Object.defineProperty(rows, '__nfTxt', { value: txt }); }catch(_d){} }   /* patch NICKFREEZE: kept with its text */
    return Array.isArray(rows) ? rows : null;""")
once("""    var got = await oneKey(u, init, keys[i]);
    if(got === null){ skipped.push(keys[i]); continue; }
    for(var j=0; j<got.length; j++) out.push(got[j]);""",
"""    var got = await oneKey(u, init, keys[i]);
    if(got === null){ skipped.push(keys[i]); continue; }
    for(var j=0; j<got.length; j++) out.push(got[j]);
    if(_nfTx){ var _gt = got.__nfTxt ? String(got.__nfTxt).trim() : null; if(_gt && _gt.charAt(0) === '[' && _gt.charAt(_gt.length - 1) === ']'){ _gt = _gt.slice(1, -1).trim(); if(_gt) _nfTx.push(_gt); } else if(got.length) _nfTx = null; }   /* patch NICKFREEZE */""")
once("""  var out = [], skipped = [];
  for(var i=0; i<keys.length; i++){""",
"""  var out = [], skipped = [], _nfTx = [];
  for(var i=0; i<keys.length; i++){""")
once("""  if(skipped.length){
    stats.skipped += skipped.length;""",
"""  if(_nfTx){ try{ Object.defineProperty(out, '__nfBody', { value: '[' + _nfTx.join(',') + ']' }); }catch(_d){} }   /* patch NICKFREEZE: the answer's text, ready */
  if(skipped.length){
    stats.skipped += skipped.length;""")
once("""  if(rows && rows === _nfBodyOf && _nfBody != null) body = _nfBody;""",
"""  if(rows && rows === _nfBodyOf && _nfBody != null) body = _nfBody;
  else if(rows && typeof rows.__nfBody === 'string'){ body = rows.__nfBody; _nfBodyOf = rows; _nfBody = body; }""")

open(p, 'w', encoding='utf-8').write(t); print('NICKFREEZE: patched', p)
