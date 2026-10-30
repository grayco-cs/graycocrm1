#!/usr/bin/env python3
"""Idempotent patch PICKCLOSE (owner 10/30, ◫ Projects with a dark job list floating over the tiles: "this is staying on here").

Cause: the searchable dropdown's search box is a typing field, so the "panel you are typing in cannot be rebuilt or removed
under you" guard took the dropdown itself as the panel being typed in and refused pop.remove(). The dropdown's close() then
forgot it (pop = null) while it stayed on <body>, and nothing ever looked at it again: after typing "600", a pick, a click on
the header / nav, another screen or a click outside all left it floating for good.

1. Typing in a floating dropdown's search box no longer makes it "the panel you are typing in" (the form you were filling in
   keeps its hold).
2. The dropdown is taken off the page directly (past any per-element guard), and any copy left on <body> is swept away.
3. It closes on a pointer-down anywhere outside it (header and nav included), Escape (window capture), and when its <select>
   is gone, hidden or scrolled off the screen or the screen changes (grayco_view, _setView or a nav click) — noticed from a
   scroll or from the page changing while it is open (the browser's own MutationObserver, disconnected on close): the
   existing 400 ms check, like every page timer and governed page watcher, is paused while a text box has focus — and the
   search box always has it, so that check never ran while the list was open. No new timer.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch PICKCLOSE'
if MARK in t: print('PICKCLOSE: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('PICKCLOSE anchor', n, old[:90]); t = t.replace(old, new)

# 1. the typing guard never holds a floating dropdown
once("""    root=rootOf(a); at=Date.now(); arm(root);
""",
"""    if(a.closest && a.closest('#_gcOnePicker,._gcSelPop')) return;   """ + MARK + """: a dropdown's search box is not a form */
    root=rootOf(a); at=Date.now(); arm(root);
""")

# 2. close() really removes it, and sweeps any copy left behind
once("""function close(){
  if(pop){ try{ pop.remove(); }catch(e){} }
  pop = null;
""",
"""function close(){
  if(pop){ try{ pop.remove(); }catch(e){} kill(pop); }   """ + MARK + """ */
  pop = null; unwatch(); sweep();
""")

# 3a. remember the screen it was opened on
once("""  popSel = sel; popKey = keyFor(sel); popParent = sel.parentElement; popSig = sigOf(sel); popRowTxt = rowTxtOf(sel);
""",
"""  popSel = sel; popKey = keyFor(sel); popParent = sel.parentElement; popSig = sigOf(sel); popRowTxt = rowTxtOf(sel); popView = curView(); watch();
""")

# 3b. outside pointer-down sweeps strays too; Escape, scroll and a screen change close it
once("""window.addEventListener('pointerdown', function(e){ try{ if(pop && !pop.contains(e.target) && e.target!==popSel) close(); }catch(_e){} }, true);
""",
"""window.addEventListener('pointerdown', function(e){ try{ if(pop && !pop.contains(e.target) && e.target!==popSel) close(); sweep(e.target); }catch(_e){} }, true);
""" + MARK + """: it is never left on the page — no guard can keep it, Escape / a scroll / another screen close it too */
var popView = null, PICKS = '#_gcOnePicker,._gcSelPop';
function curView(){ try{ return localStorage.getItem('grayco_view') || ''; }catch(e){ return ''; } }
function kill(el){
  if(!el) return;
  try{ Element.prototype.remove.call(el); }catch(e){}
  if(el.isConnected){ try{ el.parentNode && Node.prototype.removeChild.call(el.parentNode, el); }catch(e){} }
  if(el.isConnected){ try{ el.style.display = 'none'; }catch(e){} }
}
function sweep(keep){
  try{ Array.prototype.slice.call(document.querySelectorAll(PICKS)).forEach(function(el){
    if(el === pop || (keep && keep.nodeType === 1 && el.contains(keep))) return; kill(el);
  }); }catch(e){}
}
function gone(){
  if(!popSel || !popSel.isConnected || !popSel.offsetParent) return true;
  if(popView !== null && curView() !== popView) return true;
  var r = popSel.getBoundingClientRect();
  return r.bottom < 0 || r.top > (window.innerHeight || 0) || r.right < 0 || r.left > (window.innerWidth || 0);
}
/* the page's timers AND its governed page watchers pause while a text box has focus (the search box always has), so the
   400 ms check above never ran while the list was open. A change of screen / the list going away is noticed from the page
   changing itself, with the browser's own MutationObserver (only while it is open; disconnected on close) */
var mo = null;
function rawMO(){ var M = window.MutationObserver; try{ var x = new M(function(){}); if(x && x._n && x._n.constructor) M = x._n.constructor; }catch(e){} return M; }
function watch(){
  try{ var M = rawMO(); if(!mo && M) mo = new M(function(recs){
    try{ if(!pop){ unwatch(); return; }
      for(var i = 0; i < recs.length; i++){ var tg = recs[i].target; if(!(tg && pop.contains(tg))){ if(gone()) close(); return; } } }catch(_e){}
  }); if(mo) mo.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['style','class','hidden'] }); }catch(e){}
}
function unwatch(){ try{ if(mo){ mo.disconnect(); mo = null; } }catch(e){} }
window.addEventListener('keydown', function(e){ try{ if(e.key === 'Escape' || e.key === 'Esc'){ if(pop) close(); else sweep(); } }catch(_e){} }, true);
window.addEventListener('scroll', function(e){ try{ if(pop && !(e.target && e.target.nodeType === 1 && pop.contains(e.target)) && gone()) close(); }catch(_e){} }, true);
""")

# 3c. the existing check (same timer) also catches a screen change, an off-screen list and a stray copy
once("""setInterval(function(){ try{ if(pop && (!popSel || !popSel.isConnected || !popSel.offsetParent)) close(); }catch(_e){} }, 400);
""",
"""setInterval(function(){ try{ if(pop){ if(gone()) close(); } else if(document.getElementById('_gcOnePicker')) sweep(); }catch(_e){} }, 400);
""")

open(p, 'w', encoding='utf-8').write(t); print('PICKCLOSE: patched', p)
