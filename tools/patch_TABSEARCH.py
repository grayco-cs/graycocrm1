#!/usr/bin/env python3
"""Idempotent patch TABSEARCH (owner 11/02, desktop): typed "templ" in the left menu's 🔍 Search tabs, the list showed
"Estimates (templates)" and "Templates", and "these buttons aren't clicking" — a click on a result did nothing.
A result was opened only by a 'click' listener put on each result <div>. A click needs the press and the release to land
on that same node, in the page's own event order; between the two the CRM's press handlers run (the box loses focus,
held screen updates are let go, the menu redraws), and when the result list is redrawn or anything takes the click on
the way (or sits over the list), the 'click' never reaches the result: nothing happens.
• A result is now picked by where the press is, not by which node gets the click: the press (pointerdown, window,
  capture — before any page handler) notes the result under the pointer from the list's own boxes, the release picks it
  (a touch that moved to scroll does not), and the click that follows is swallowed so it can't press the tab that was
  under the list. A plain click on a result (no pointer events) still opens it. The press keeps the cursor in the box.
• ↓ / ↑ / Enter pick from the list on screen (Enter with nothing highlighted takes the first one).
• Opening the tab is marked as the person's own move (page lock / Desk), once per pick (no double open).
• The CRM's projects / subs / team autocomplete never attaches to this box (its fixed list at the top of every layer
  could sit right over the tab results and take the press).
• ⊕ menu tabs a patch tail draws (dom:…) open through patch TABVIS (window._gcTabVisOpen).
Console: window._gcNavSearch.pick('templates'), window._gcNavSearch.state()"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch TABSEARCH'
if MARK in t: print('TABSEARCH: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('TABSEARCH anchor', n, old[:90]); t = t.replace(old, new)

# 1. no per-result 'click' listener (it is the one that never fired)
once("""    results.style.display = 'block';

    results.querySelectorAll('.gc-nsr-item').forEach(function(el){
      el.addEventListener('click', function(){
        goTo(el.getAttribute('data-id'));
      });
    });
  }
""", """    results.style.display = 'block';
    """ + MARK + """: a result is picked by the press / release below (window, capture), not by a click on its node */
  }
""")

# 1b. the CRM's name autocomplete (createAC: a dropdown of projects / subs / team at the top of every layer) must not
#     attach to this box: its scan reads the text around a box ("Projects", "Subs", "Office Manager" in the results)
once("""  var inp = document.getElementById('gc-navsearch');
  var results = document.getElementById('gc-navsearch-results');
  var _activeIdx = -1;""", """  var inp = document.getElementById('gc-navsearch');
  var results = document.getElementById('gc-navsearch-results');
  var _activeIdx = -1;
  inp._acInit = true;   """ + MARK + """: never the projects / subs autocomplete over the tab list */""")

# 2. one way to open a result: once per pick, as the person's own move, TABVIS for a patch tail's tab
once("""  function goTo(id){
    inp.value = '';
    results.style.display = 'none';
    if(!id) return;""", """  var _pk = { id: '', at: 0, down: '', x: 0, y: 0, swallow: 0, n: 0, how: '' };   """ + MARK + """ */
  function shown(){ return results.isConnected && results.style.display !== 'none' && results.offsetParent !== null; }
  function itemAt(x, y){
    if(!shown()) return null;
    var its = results.querySelectorAll('.gc-nsr-item');
    for(var i = 0; i < its.length; i++){ var b = its[i].getBoundingClientRect(); if(b.width && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return its[i]; }
    return null;
  }
  function pick(id, how){
    if(!id) return;
    var n = Date.now(); if(_pk.id === id && n - _pk.at < 900) return;   /* the release and its click: one open */
    _pk.id = id; _pk.at = n; _pk.n++; _pk.how = how || '';
    try{ window.__GC_USER_NAV__ = true; setTimeout(function(){ window.__GC_USER_NAV__ = false; }, 1500); }catch(e){}
    if(/^dom:/.test(id)){ inp.value = ''; results.style.display = 'none'; try{ if(window._gcTabVisOpen) window._gcTabVisOpen(id); }catch(e){} return; }
    goTo(id);
  }
  function eat(e){ e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation(); }
  /* the press: the result under the pointer, from the list's own boxes (whatever node the page says was pressed) */
  function inList(e){ var t = e.target; return !!(t && t.closest && (t.closest('#gc-navsearch-results') || t.closest('aside'))); }
  window.addEventListener('pointerdown', function(e){
    _pk.down = '';
    if(e.button !== 0 || !e.isPrimary) return;
    var it = itemAt(e.clientX, e.clientY); if(!it || !inList(e)) return;
    _pk.down = it.getAttribute('data-id') || ''; _pk.x = e.clientX; _pk.y = e.clientY;
    if(e.pointerType === 'mouse') e.preventDefault();   /* the cursor stays in the box: no blur, nothing redrawn under the press */
  }, true);
  window.addEventListener('mousedown', function(e){ if(e.button === 0 && itemAt(e.clientX, e.clientY)) e.preventDefault(); }, true);
  window.addEventListener('pointerup', function(e){
    var id = _pk.down; _pk.down = ''; if(!id || e.button !== 0) return;
    if(Math.abs(e.clientX - _pk.x) > 12 || Math.abs(e.clientY - _pk.y) > 12) return;   /* a touch that scrolled */
    _pk.swallow = Date.now() + 700; eat(e); pick(id, 'press');
  }, true);
  window.addEventListener('pointercancel', function(){ _pk.down = ''; }, true);
  window.addEventListener('click', function(e){
    if(_pk.swallow && Date.now() < _pk.swallow){ _pk.swallow = 0; eat(e); return; }   /* the click after a picked press */
    var it = e.target && e.target.closest ? e.target.closest('#gc-navsearch-results .gc-nsr-item') : null;
    if(!it) return;
    eat(e); pick(it.getAttribute('data-id'), 'click');
  }, true);
  window._gcNavSearch = { pick: function(id){ _pk.id = ''; pick(id, 'console'); }, state: function(){ return { shown: shown(), n: _pk.n, last: _pk.id, how: _pk.how, items: [].map.call(results.querySelectorAll('.gc-nsr-item'), function(x){ return x.getAttribute('data-id'); }) }; } };

  function goTo(id){
    inp.value = '';
    results.style.display = 'none';
    if(!id) return;""")

# 3. Enter: the list on screen, through pick()
once("""    } else if(e.key === 'Enter'){
      if(_activeIdx >= 0 && items[_activeIdx]) goTo(items[_activeIdx].getAttribute('data-id'));
      else if(items.length) goTo(items[0].getAttribute('data-id'));
    } else if(e.key === 'Escape'){""", """    } else if(e.key === 'Enter'){
      if(!shown() || !items.length) return;   """ + MARK + """: Enter picks from the list on screen */
      e.preventDefault();
      pick((_activeIdx >= 0 && items[_activeIdx] ? items[_activeIdx] : items[0]).getAttribute('data-id'), 'enter');
    } else if(e.key === 'Escape'){""")

# 4. TABVIS: its own click / Enter handlers for a patch tail's tab stay; pick() opens one through it
once("""W._gcTabVisAll = function(ALL){""", """W._gcTabVisOpen = openDom;   """ + MARK + """: 🔍 Search tabs opens a patch tail's tab through here */
W._gcTabVisAll = function(ALL){""")

open(p, 'w', encoding='utf-8').write(t); print('TABSEARCH: patched', p)
