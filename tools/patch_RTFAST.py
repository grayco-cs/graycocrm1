#!/usr/bin/env python3
"""Idempotent patch RTFAST: the live feed (patch N) froze the page on every realtime update of a big list.

Measured (two computers, real data + ~13,350 schedule rows): every update another computer made to the schedule
blocked the page for 1-2 s. onEvent -> learn -> rsig took a signature of every one of the 13,350 rows (each one
sorts the row's fields and turns every field into text), then applyNow -> overlay did it again twice per row,
and the IndexedDB write hook (stampChanged) once more. Almost all of those rows had not changed.

1. rsig remembers its answer by the row's exact text without its stamps (JSON.stringify of the row with the same
   stamp filter rsig uses, which is fast native code): the same text always gives the same signature, so the
   answer is exact (a save that re-stamps every row still finds every row), and a row that did not change is a
   lookup instead of a sort + many small JSON calls. The memory is bounded (cleared at 60,000 rows).
2. An update of a big list (over 1,500 rows) is learnt in slices of 600 rows between other work instead of in
   one go; whatever reads what was learnt (the union push, the overlay) finishes the slices first, so the result
   is the same. An update whose whole value was already learnt is not learnt again.
3. Big-list updates are laid on the screen 1.2 s after they arrive (updates that arrive together are laid on
   once, the newest value), not 150 ms.
Nothing that is saved or sent changes."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch RTFAST'
if MARK in t: print('RTFAST: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('RTFAST anchor count != 1', n, old[:90])
    t = t.replace(old, new)

# 1. rsig: exact memo by the row's text
once("function rsig(r){ if(_rsigStep && r && typeof r==='object'){ var _c = _rsigStep.get(r); if(_c !== undefined) return _c; } var _g; try{",
     MARK + ": the signature of a row is remembered by the row's exact text without its stamps (same text, same signature) */\n"
     "var _rsC = new Map();\n"
     "function rsig(r){\n"
     "  if(r && typeof r==='object' && !Array.isArray(r) && typeof r.toJSON !== 'function'){\n"
     "    if(_rsigStep){ var _c0 = _rsigStep.get(r); if(_c0 !== undefined) return _c0; }\n"
     "    var _j = null; try{ _j = JSON.stringify(r, _rsigRep); }catch(e){ _j = null; }\n"
     "    if(typeof _j === 'string'){ var _h = _rsC.get(_j); if(_h === undefined){ _h = rsig0(r); if(_rsC.size >= 60000) _rsC.clear(); _rsC.set(_j, _h); } else if(_rsigStep) _rsigStep.set(r, _h); return _h; }\n"
     "  }\n"
     "  return rsig0(r);\n"
     "}\n"
     "function rsig0(r){ if(_rsigStep && r && typeof r==='object'){ var _c = _rsigStep.get(r); if(_c !== undefined) return _c; } var _g; try{")

# 2. learn in slices for big lists; readers finish the slices first
once("""function learn(k, v){
  try{
    if(v === undefined || v === null) return;
    if(isRecList(v)){
      var m = seenRec[k] || (seenRec[k] = {});
      v.forEach(function(r){ var id = recIdOf(r); if(id==null) return; var s = m[id] || (m[id] = {}); var g = rsig(r); s[g] = 1; var ks = Object.keys(s); if(ks.length > 40) delete s[ks[0]]; });""",
"""/* patch RTFAST: a big list from the live feed is learnt in slices; learnDrain() finishes them (sync) before a read */
var learnQ = [], learnT = null, learnWhole = {};
function learnRow(m, r){ var id = recIdOf(r); if(id==null) return; var s = m[id] || (m[id] = {}); var g = rsig(r); s[g] = 1; var ks = Object.keys(s); if(ks.length > 40) delete s[ks[0]]; }
function learnSlice(){
  learnT = null; var t0 = Date.now();
  while(learnQ.length && Date.now() - t0 < 25){
    var q = learnQ[0], m = seenRec[q.k] || (seenRec[q.k] = {}), end = Math.min(q.v.length, q.i + 600);
    try{ for(; q.i < end; q.i++) learnRow(m, q.v[q.i]); }catch(e){ q.i = q.v.length; }
    if(q.i >= q.v.length) learnQ.shift();
  }
  if(learnQ.length) learnT = ST.call(window, learnSlice, 0);
}
function learnDrain(){
  if(!learnQ.length) return;
  if(learnT){ try{ clearTimeout(learnT); }catch(e){} learnT = null; }
  while(learnQ.length){ var q = learnQ.shift(), m = seenRec[q.k] || (seenRec[q.k] = {}); try{ for(; q.i < q.v.length; q.i++) learnRow(m, q.v[q.i]); }catch(e){} }
}
function learnSoon(k, v, s){
  if(s && learnWhole[k] === s) return;                                     /* this exact value was learnt already */
  if(!(Array.isArray(v) && v.length > 1500 && isRecList(v))){ learn(k, v); if(s) learnWhole[k] = s; return; }
  learnQ.push({ k:k, v:v, i:0 }); if(s) learnWhole[k] = s;
  if(!learnT) learnT = ST.call(window, learnSlice, 0);
}
function learn(k, v){
  try{
    if(v === undefined || v === null) return;
    if(isRecList(v)){
      var m = seenRec[k] || (seenRec[k] = {});
      v.forEach(function(r){ learnRow(m, r); });""")

once("""function union(k, cloud, local, now, editAt, prevSeen){
""", """function union(k, cloud, local, now, editAt, prevSeen){
  learnDrain();   /* patch RTFAST */
""")
once("""  var before = seenRec[k] ? JSON.parse(JSON.stringify(seenRec[k])) : {};""",
     """  learnDrain();   /* patch RTFAST */
  var before = seenRec[k] ? JSON.parse(JSON.stringify(seenRec[k])) : {};""")
once("""function overlay(k, prev, inc){
  if(!Array.isArray(prev) || !Array.isArray(inc)) return prev;
""", """function overlay(k, prev, inc){
  if(!Array.isArray(prev) || !Array.isArray(inc)) return prev;
  learnDrain();   /* patch RTFAST */
""")
once("""    if(v !== undefined) learn(k, v);   /* patch X: only for another computer's save — this page's own values are its own */""",
     """    if(v !== undefined) learnSoon(k, v, s);   /* patch X: only for another computer's save — this page's own values are its own (patch RTFAST: big lists in slices) */""")

# 3. big-list updates laid on once, 1.2 s after they arrive
once("""      if(!toApply[k]) toApply[k] = Date.now();
      scheduleApply(150);""", """      if(!toApply[k]) toApply[k] = Date.now();
      scheduleApply((Array.isArray(v) && v.length > 1500) ? 1200 : 150);   /* patch RTFAST: a burst of big-list updates is laid on once */""")

open(p, 'w', encoding='utf-8').write(t); print('RTFAST: patched')
