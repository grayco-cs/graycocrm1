#!/usr/bin/env python3
"""patch NAVCLEAR (owner 11/03: "when i log back in it has this up here, it shouldnt have anything in search bar"):
the sidebar 🔍 Search tabs box kept a half-typed word (and its open list) across sign-out / sign-in and page restores.
Now it is emptied: when it is built, on page show (back/forward cache, browser form restore), whenever the sign-in screen
is up, and 1 s after the box loses focus without a pick (the list was abandoned)."""
import sys, os
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
s = open(P, encoding='utf-8').read()
MARK = '/* patch NAVCLEAR'
if MARK in s: print('already patched'); sys.exit(0)
A = "  inp._acInit = true;   /* patch TABSEARCH: never the projects / subs autocomplete over the tab list */\n"
assert s.count(A) == 1, s.count(A)
B = A + """  /* patch NAVCLEAR: never a leftover word in the box — after sign-in, a page restore, or a list left open */
  (function(){
    function clr(force){ try{ if(!force && document.activeElement === inp) return; if(inp.value){ inp.value = ''; } _lastQ = ''; results.style.display = 'none'; }catch(e){} }
    try{ inp.setAttribute('name', 'gc-tabsearch-' + Date.now().toString(36)); inp.setAttribute('autocomplete', 'off'); inp.setAttribute('data-lpignore', 'true'); }catch(e){}
    clr(true); setTimeout(function(){ clr(); }, 0); setTimeout(function(){ clr(); }, 1500);
    window.addEventListener('pageshow', function(){ clr(); });
    inp.addEventListener('blur', function(){ setTimeout(function(){ if(document.activeElement !== inp && !(_pk && _pk.down)) clr(); }, 1000); });
    setInterval(function(){ try{ var a = document.getElementById('gc-auth-email'); if(a && a.offsetParent !== null) clr(true); }catch(e){} }, 2000);
  })();
"""
s = s.replace(A, B)
open(P, 'w', encoding='utf-8').write(s)
print('patched NAVCLEAR')
