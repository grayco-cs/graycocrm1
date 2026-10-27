#!/usr/bin/env python3
"""Idempotent patch NOGREETFIELD: no "Good morning" pop-up anywhere (desktop or field view) — owner 10/27."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch NOGREETFIELD */'
if MARK in t: print('NOGREETFIELD: already patched'); sys.exit(0)
a = "    if(_greetShownThisSession) return;         // never twice in one page load\n"
assert t.count(a) == 1, t.count(a)
t = t.replace(a, a + "    " + MARK + " return;   /* owner 10/27: no greeting pop-up anywhere (desktop or field) — the To-Do button shows the count */\n")
b = "      if(done || tries>15) clearInterval(iv);\n    }, 15000);"
assert t.count(b) == 1, t.count(b)
t = t.replace(b, b + "\n    clearInterval(iv);   /* patch NOGREETFIELD: greeting removed, so no 15 s checks */")
open(p, 'w', encoding='utf-8').write(t); print('NOGREETFIELD: patched')
