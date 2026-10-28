#!/usr/bin/env python3
"""Idempotent patch RTSTAMP: a save of a big list no longer re-stamps every row, and the same big list written
again a moment later is not written twice.

1. writeKV (window.idbSet) gave EVERY row of a core list updatedAt = now on every save while the person was active
   (13,350 schedule rows per save). The IndexedDB stamp hook (patch N, stampChanged) then put the old stamp back on
   every row that had not changed, so on disk only changed rows ever kept the new stamp, but the page did the work
   twice per row per save, and the list's text changed on every save, so nothing downstream could tell that a save
   was the same as the last one. For lists over 2,000 rows, writeKV now stamps only the rows that are not the very
   same object it wrote last time (new rows and replaced rows), exactly as before for those. A row changed in place
   is still stamped by stampChanged, as before. Smaller lists: unchanged.
2. A write of a big list (over 2,000 rows) whose text is exactly the text this computer finished writing for that
   key less than 2.5 s ago is answered "done" without being written again (the pull writes the list, then the
   screen's own save writes the very same list a moment later). Anything that differs in any way, and any write
   after 2.5 s, is written as before.
3. notePersonEdits (under every IndexedDB write) made the text of every row first; a row that is the very same
   object as at the last write is now skipped before its text is made (it was skipped right after, unchanged).
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch RTSTAMP'
if MARK in t: print('RTSTAMP: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('RTSTAMP anchor count != 1', n, old[:90])
    t = t.replace(old, new)

once("""function writeKV(key, value){
  try{
    // keep the "a manual save always wins" stamping the app relies on
    if(CORE[key] && Array.isArray(value) && (window.__GC_IS_ACTIVE__ || window.__GC_IS_TYPING__ || window.__GC_MANUAL_SAVE__)){
      var now=new Date().toISOString();
      value.forEach(function(r){ if(r && typeof r==='object'){ r.updatedAt=now; if(!r.savedAt) r.savedAt=now; } });
    }
  }catch(e){}""", MARK + """: for a big list, only rows that are not the very objects written last time are stamped */
var _wkLast = {};
function writeKV(key, value){
  try{
    // keep the "a manual save always wins" stamping the app relies on
    if(CORE[key] && Array.isArray(value) && (window.__GC_IS_ACTIVE__ || window.__GC_IS_TYPING__ || window.__GC_MANUAL_SAVE__)){
      var now=new Date().toISOString();
      var big = value.length > 2000 && typeof WeakSet === 'function', had = big ? _wkLast[key] : null;
      value.forEach(function(r){ if(r && typeof r==='object'){ if(had && had.has(r)) return; r.updatedAt=now; if(!r.savedAt) r.savedAt=now; } });
    }
  }catch(e){}
  try{ if(CORE[key] && Array.isArray(value) && value.length > 2000 && typeof WeakSet === 'function'){ var ws = new WeakSet(); for(var _i=0; _i<value.length; _i++){ var _r = value[_i]; if(_r && typeof _r==='object') ws.add(_r); } _wkLast[key] = ws; } }catch(e){}""")

# 3. notePersonEdits: a row that is the very same object as last time is skipped before its text is made
once("""    var changed = [], ls = lastStr[key] || {}, ns = {};
    for(var i0=0;i0<list.length;i0++){ var r0 = list[i0], id0 = idOf(r0); if(id0) ns[id0] = JSON.stringify(r0); }
    lastStr[key] = ns;
    for(var i=0;i<list.length;i++){
      var r = list[i], id = idOf(r); if(!id) continue; var p = prev[id];
      if(p === r || (p && (ls[id] === ns[id] || csig(p) === csig(r)))) continue;""",
"""    var changed = [], ls = lastStr[key] || {}, ns = {};
    lastStr[key] = ns;   /* patch RTSTAMP: a row's text is made only when it is not the very same object as last time; a row
                            without a remembered text is compared by csig, which gives the same answer */
    for(var i=0;i<list.length;i++){
      var r = list[i], id = idOf(r); if(!id) continue; var p = prev[id];
      if(p === r) continue;
      ns[id] = JSON.stringify(r);
      if(p && (ls[id] === ns[id] || csig(p) === csig(r))) continue;""")

JS = r"""
<script>
""" + MARK + r""" (2): the same big list written again within 2.5 s is not written twice */
(function(){
'use strict';
if (window.__GC_RTDUP__) return; window.__GC_RTDUP__ = true;
try {
  var P = IDBObjectStore.prototype, inner = P.put, last = {}, ST = window.__GC_NATIVE_SETTIMEOUT__ || setTimeout;
  var stats = window._gcRtDup = { skipped: 0, written: 0 };
  var w = function(value, key){
    try {
      if (typeof key === 'string' && Array.isArray(value) && value.length > 2000 && this.name === 'kv' && this.transaction && this.transaction.db && this.transaction.db.name === 'grayco_crm') {
        var txt = JSON.stringify(value), now = Date.now(), L = last[key];
        if (L && L.txt === txt && now - L.at < 2500) {
          stats.skipped++;
          var fake = { readyState: 'done', result: key, error: null, onsuccess: null, onerror: null, transaction: this.transaction, source: this,
            addEventListener: function(type, fn){ if (type === 'success' && typeof fn === 'function') ST.call(window, function(){ try { fn({ target: fake, type: 'success' }); } catch (e) {} }, 0); },
            removeEventListener: function(){} };
          ST.call(window, function(){ try { if (typeof fake.onsuccess === 'function') fake.onsuccess({ target: fake, type: 'success' }); } catch (e) {} }, 0);
          return fake;
        }
        var r = inner.apply(this, arguments);
        stats.written++;
        try { this.transaction.addEventListener('complete', function(){ last[key] = { txt: txt, at: Date.now() }; }); } catch (e) {}   /* only what reached the disk counts */
        try { this.transaction.addEventListener('abort', function(){ if (last[key] && last[key].txt === txt) delete last[key]; }); } catch (e) {}
        return r;
      }
    } catch (e) {}
    return inner.apply(this, arguments);
  };
  w.__gcRtDup = true; try { Object.keys(inner).forEach(function(k){ w[k] = inner[k]; }); } catch (e) {}
  P.put = w;
} catch (e) {}
})();
</script>"""
t = t.rstrip('\n') + JS + '\n'
open(p, 'w', encoding='utf-8').write(t); print('RTSTAMP: patched')
