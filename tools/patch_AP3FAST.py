#!/usr/bin/env python3
"""Idempotent patch AP3FAST: the e-mail icon scan (patch AP3 scanText) no longer forces one page layout per text found.

Found 10/29 (gate_REALSIGNIN, real-data mirror, 6x CPU): 0.8-1.0 s busy stretches in AP3's scanText, which runs every
1.5 s after any DOM change (patch SWEEP2). For each e-mail address / known name found as text it read el.offsetParent
(a layout read) and then appended the icon (a DOM write), so every next read had to lay the whole page out again:
n hits = n full layouts.
Fix: the same checks in two passes -- every read first (one layout), then every icon written. A text holder gets at
most one icon (two text pieces in the same element: the first one wins, as before, where the icon made the element
"have children" for the second). Same elements, same icons. Kill switch: localStorage gc_ap3fast_off = '1'.
Usage: python3 tools/patch_AP3FAST.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch AP3FAST'
if MARK in t: print('AP3FAST: already patched'); sys.exit(0)
OLD = """  var hits = [], n;
  while((n = w.nextNode())) hits.push(n);
  hits.forEach(function(t){
    var el = t.parentElement; if(!el || el.querySelector('._gcMailIco')) return;"""
NEW = """  var hits = [], n;
  while((n = w.nextNode())) hits.push(n);
  """ + MARK + """: every read first (one layout), then every icon written -- not one forced layout per hit */
  var _afOff = false; try{ _afOff = localStorage.getItem('gc_ap3fast_off') === '1'; }catch(_e){}
  if(!_afOff){
    var _afPlan = [], _afSeen = (typeof Set === 'function') ? new Set() : null;
    hits.forEach(function(t){
      var el = t.parentElement; if(!el || (_afSeen && _afSeen.has(el)) || el.querySelector('._gcMailIco')) return;
      var m = EM.exec(el.textContent || '');
      if(!m){
        var pr = by[low(el.textContent)]; if(!pr || el.children.length || el.closest(SKIP) || !el.offsetParent) return;
        if(_afSeen) _afSeen.add(el); _afPlan.push([el, pr.email, { about: pr.kind }]); return;
      }
      if(el.children.length) return;
      if(el.closest(SKIP) || !el.offsetParent) return;
      var j = jobOf(m[1]);
      if(_afSeen) _afSeen.add(el); _afPlan.push([el, m[1], j ? { pid: j.id, customer: j.client } : null]);
    });
    _afPlan.forEach(function(x){ try{ x[0].appendChild(ico(x[1], x[2])); }catch(_ie){} });
    return;
  }
  hits.forEach(function(t){
    var el = t.parentElement; if(!el || el.querySelector('._gcMailIco')) return;"""
assert t.count(OLD) == 1, ('AP3FAST anchor count != 1', t.count(OLD))
t = t.replace(OLD, NEW)
open(p, 'w', encoding='utf-8').write(t)
print('AP3FAST: patched')
