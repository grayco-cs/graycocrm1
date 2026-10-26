#!/usr/bin/env python3
"""Idempotent patch SPEED3: global background costs that slow every screen (not Leads).
 1. document click handlers that read target.textContent: skip html/body/script/style and big containers
 2. sync path: a record's canonical text is remembered (spSig); accounting sweep skips a list that came out clean
 3. identical big localStorage writes and a repeated estimate save are skipped
 4. To-Do badge tick skips when the page has not changed
 5. daily backup runs in idle time, one list at a time, and is not re-saved when nothing changed
 6. intervals under 600 ms: paused while the tab is hidden, 1 s pace after a minute of no input
Each find-string must occur exactly once."""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch SPEED3 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def sub(old, new, label):
    global src
    assert src.count(old) == 1, (label, 'count', src.count(old))
    src = src.replace(old, new)

BIG = "(t.nodeType!==1||t===document.body||t===document.documentElement||t.tagName==='SCRIPT'||t.tagName==='STYLE'||t.childElementCount>=50)"

# ---- 1. click handlers: never read the text of the page, a script, or a big container
# (the three target.textContent handlers were already guarded by LEADSUX)
sub("""      if(el===document.body||el===document.documentElement||el.tagName==='MAIN'||el.id==='root'||el.id==='_gcJobPick'||el.id==='_gcJobDash') break;   /* 33.144 (patch N) */
      var t=(el.textContent||'').trim();""",
    """      if(el===document.body||el===document.documentElement||el.tagName==='MAIN'||el.id==='root'||el.id==='_gcJobPick'||el.id==='_gcJobDash'||el.childElementCount>=50) break;   /* 33.144 (patch N) */ /* patch SPEED3: big container */
      var t=(el.textContent||'').trim();""", 'click4')
sub("""      if(el===document.body||el===document.documentElement||el.tagName==='MAIN'||el.id==='root'||el.id==='_gcJobPick'||el.id==='_gcJobDash'){ el=null; txt=''; break; }   /* 33.144 (patch N) */
      txt=keyOf(el.textContent||'');""",
    """      if(el===document.body||el===document.documentElement||el.tagName==='MAIN'||el.id==='root'||el.id==='_gcJobPick'||el.id==='_gcJobDash'||el.childElementCount>=50){ el=null; txt=''; break; }   /* 33.144 (patch N) */ /* patch SPEED3: big container */
      txt=keyOf(el.textContent||'');""", 'click5')

# ---- 2. sync canonical-text memo + accounting sweep no-op skip
sub("function spSig(v){\n  try {\n    if (Array.isArray(v) && v.length > 1 && v.every(spIsRec)) return 'R' + spHash('[' + v.map(spCanon).sort().join(',') + ']');",
"""var SP_RC = new Map(), SP_RCN = 0;
function spCanonRec(r){ /* patch SPEED3: an unchanged record is not re-sorted and re-joined each time */
  var t; try { t = JSON.stringify(r); } catch (e) { return spCanon(r); }
  if (typeof t !== 'string') return spCanon(r);
  var c = SP_RC.get(t); if (c !== undefined) return c;
  c = spCanon(r); if (SP_RCN > 12e6) { SP_RC.clear(); SP_RCN = 0; } SP_RC.set(t, c); SP_RCN += t.length + c.length; return c;
}
function spSig(v){
  try {
    if (Array.isArray(v) && v.length > 1 && v.every(spIsRec)) return 'R' + spHash('[' + v.map(spCanonRec).sort().join(',') + ']');""", 'spSig')
sub("""      if(!Array.isArray(rows) || rows.length<2) continue;

      var res=collapse(rows, K.label);
      if(!res) continue;""",
"""      if(!Array.isArray(rows) || rows.length<2) continue;
      var _sw2=null; try{ _sw2=JSON.stringify(rows); window.__GC_SWEEP_CLEAN__=window.__GC_SWEEP_CLEAN__||{}; if(window.__GC_SWEEP_CLEAN__['m:'+K.idb]===_sw2) continue; }catch(e){}   /* patch SPEED3 */

      var res=collapse(rows, K.label);
      if(!res){ try{ window.__GC_SWEEP_CLEAN__['m:'+K.idb]=_sw2; }catch(e){} continue; }""", 'sweep1')
sub("""      if(!Array.isArray(rows) || rows.length<2) continue;

      var res=collapse(rows, L);
      if(!res) continue;""",
"""      if(!Array.isArray(rows) || rows.length<2) continue;
      var _sw2=null; try{ _sw2=JSON.stringify(rows); window.__GC_SWEEP_CLEAN__=window.__GC_SWEEP_CLEAN__||{}; if(window.__GC_SWEEP_CLEAN__['l:'+L.key]===_sw2) continue; }catch(e){}   /* patch SPEED3 */

      var res=collapse(rows, L);
      if(!res){ try{ window.__GC_SWEEP_CLEAN__['l:'+L.key]=_sw2; }catch(e){} continue; }""", 'sweep2')


# ---- 2b. sync record signature (rsig): a record seen before (same text) is not re-sorted and re-hashed
sub("var _rsigStep = null;   /* patch X: per-object signatures, kept only for one synchronous push step */",
    "var _rsigStep = null;   /* patch X: per-object signatures, kept only for one synchronous push step */\nvar RS_MEMO = new Map(), RS_N = 0;   /* patch SPEED3: a record's signature is remembered by its text */\nfunction rsMemoSet(t, g){ if(RS_N > 12e6){ RS_MEMO.clear(); RS_N = 0; } RS_MEMO.set(t, g); RS_N += t.length; }", 'rs1')
sub("var _g; try{ if(r && typeof r==='object' && !Array.isArray(r)){ var _ks = Object.keys(r).sort(), _p = [];",
    "var _g, _mt; try{ if(r && typeof r==='object' && !Array.isArray(r)){ try{ _mt = JSON.stringify(r); }catch(e){} if(typeof _mt==='string' && (_g = RS_MEMO.get(_mt)) !== undefined){} else { var _ks = Object.keys(r).sort(), _p = [];", 'rs2')
sub("_g = sigOf('{'+_p.join(',')+'}'); } else _g = sigOf(JSON.stringify(r, _rsigRep));",
    "_g = sigOf('{'+_p.join(',')+'}'); if(typeof _mt==='string') rsMemoSet(_mt, _g); } } else _g = sigOf(JSON.stringify(r, _rsigRep));", 'rs3')

# ---- 3. identical big localStorage write; same estimate save again
sub("""  return rawSet.call(this, k, v);
};
/* write-through for the owners""",
"""  try{ if(this === window.localStorage && typeof v === 'string' && v.length > 50000 && rawGet.call(this, k) === v) return; }catch(e){}   /* patch SPEED3: the same big text again */
  return rawSet.call(this, k, v);
};
/* write-through for the owners""", 'ls')
sub("var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;",
    "var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem, rawGet = Storage.prototype.getItem;", 'rawGet')
sub("""    async function afterEstimateSave(json){
      try{
        var arr=[];""",
"""    async function afterEstimateSave(json){
      try{
        if(typeof json==='string' && json.length>200000 && window.__gcAesLast===json && Date.now()-(window.__gcAesAt||0)<10000) return;   /* patch SPEED3: the same estimates again within 10 s */
        window.__gcAesLast=json; window.__gcAesAt=Date.now();
        var arr=[];""", 'aes')

# ---- 4. To-Do badge: skip the count when the page has not changed (at most 5 s stale)
sub("RI.call(W, tick, 2000); ST.call(W, tick, 2500);",
    "var _tkSt = {}, _tkAt = 0; function tickT(){ var n = Date.now(); if (W._gcIdleSkip && W._gcIdleSkip(_tkSt, 5000)) return; if (W._gcIdle && W._gcIdle() && n - _tkAt < 60000) return; _tkAt = n; tick(); }   /* patch SPEED3 */\nRI.call(W, tickT, 2000); ST.call(W, tick, 2500);", 'tick')

# ---- 5. daily backup: idle time, one list at a time, not again when nothing changed
sub("  async function snapshotToday(){\n    try{\n      var data={ date:today(), savedAt:new Date().toISOString(), lists:{}, counts:{} };",
"""  function _bkIdle(ms){ return new Promise(function(res){ try{ if(window.requestIdleCallback) window.requestIdleCallback(function(){ res(); }, { timeout: ms || 1500 }); else setTimeout(res, 30); }catch(e){ setTimeout(res, 30); } }); }   /* patch SPEED3 */
  async function snapshotToday(){
    try{
      var data={ date:today(), savedAt:new Date().toISOString(), lists:{}, counts:{} };""", 'bk1')
sub("""        var k=CORE[i];
        try{
          var v=await _idbGet(k);""",
"""        var k=CORE[i];
        if(i) await _bkIdle(1500);   /* patch SPEED3: one list per idle slice */
        try{
          var v=await _idbGet(k);""", 'bk2')
sub("""      // Save LOCALLY first — this must always succeed regardless of network.
      await _idbSet(keyFor(today()), data);""",
"""      // Save LOCALLY first — this must always succeed regardless of network.
      await _bkIdle(2000);   /* patch SPEED3 */
      var _bs = null; try{ if(typeof spHash==='function') _bs = spHash(JSON.stringify([data.lists, data.local])); }catch(e){}
      var _bl = window.__gcBkSig;
      if(_bs && _bl && _bl.d===today() && _bl.s===_bs && Date.now()-_bl.at < 3*3600e3){ console.log('[GC] Daily backup: nothing changed since the last copy, not saved again.'); return data; }
      await _idbSet(keyFor(today()), data);
      if(_bs) window.__gcBkSig = { d: today(), s: _bs, at: Date.now() };""", 'bk3')
sub("  setTimeout(snapshotToday, 12000);",
    "  setTimeout(function(){ _bkIdle(30000).then(function(){ snapshotToday(); }); }, 12000);   /* patch SPEED3: idle time */", 'bk4')

# ---- 6. fast timers (<600 ms): none while the tab is hidden; 1 s pace after a minute of nobody at the computer
sub("""      if(typeof _ms==='number' && _ms<600){ return _setInt(fn, _ms); }""",
"""      if(typeof _ms==='number' && _ms<600){
        if(typeof fn!=='function') return _setInt(fn, _ms);
        var _src=''; try{ _src=Function.prototype.toString.call(fn); }catch(e){}
        if(/sync|Sync|push|Push|pull|Pull|backup|Backup|snapshot|Snapshot|save|Save|recover|Recover|flush|Flush/.test(_src)) return _setInt(fn, _ms);
        var _fl=0;   /* patch SPEED3: a screen-polish timer waits while the tab is hidden, and runs once a second when nobody is at the computer */
        return _setInt(function(){
          if(document.hidden) return;
          var _n=Date.now(); if(_n-(window.__GC_LAST_INPUT_AT__||_n) > 20000 && _n-_fl < 950) return;
          _fl=_n; return fn.apply(this, arguments);
        }, _ms);
      }""", 'fast')


# ---- 7. background loops go to the slow pace after 20 s of nobody at the computer (was 60 s)
sub("if(!(_ms >= 29000) && _n-(window.__GC_LAST_INPUT_AT__||0) > 60000 && _n-_lastRun < 29000) return;",
    "if(!(_ms >= 29000) && _n-(window.__GC_LAST_INPUT_AT__||0) > 20000 && _n-_lastRun < 29000) return;   /* patch SPEED3: 20 s, was 60 s */", 'idle20')

src = src.replace("var SP_RC = new Map(), SP_RCN = 0;", MARK + "\nvar SP_RC = new Map(), SP_RCN = 0;", 1)
open(path, 'w', encoding='utf-8').write(src)
print('patched')
