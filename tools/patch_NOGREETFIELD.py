#!/usr/bin/env python3
"""Idempotent patch NOGREETFIELD: no "Good morning" pop-up in the field view (phone / GrayCo Field) — owner 10/27."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch NOGREETFIELD */'
if MARK in t: print('NOGREETFIELD: already patched'); sys.exit(0)
a = "    if(_greetShownThisSession) return;         // never twice in one page load\n"
assert t.count(a) == 1, t.count(a)
t = t.replace(a, a + "    " + MARK + " try{ if(document.documentElement.classList.contains('_fieldmode')) return; }catch(e){}\n")
open(p, 'w', encoding='utf-8').write(t); print('NOGREETFIELD: patched')
