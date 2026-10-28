#!/usr/bin/env python3
"""Idempotent patch CLBAR: the "⚙ Insurance claims go to:" bar on Leads stops re-inserting itself every second
(release sweep 10/28: the Leads screen changed ~30–80 times in 15 s with nobody touching it).

patch CLAIMLEAD keeps the bar right after "⚙ Commercial bids go to:" (#gc-la-set). Its "already in place?" test asked
whether the bar's next sibling is #gc-la-set's next sibling — which, once the bar IS right after #gc-la-set, is the bar
itself, so the test always failed: the bar was taken out, the re-insert threw (its reference node was the bar just
removed), and on the next tick it was put back — for ever, on every open Leads screen. Now a bar that already sits right
after its anchor counts as in place. Usage: python3 tools/patch_CLBAR.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CLBAR'
if MARK in src:
    print('CLBAR: already patched'); sys.exit(0)
OLD = """    if (cur && cur.parentNode === parent && cur.nextSibling === before) { if (cur.getAttribute('data-sig') !== html) { cur.innerHTML = html; cur.setAttribute('data-sig', html); } return; }
    if (cur) cur.remove();
    cur = document.createElement('div'); cur.id = id; cur.setAttribute('data-gc-keep', '1'); cur.setAttribute('data-sig', html); cur.innerHTML = html;"""
NEW = """    if (cur && cur.parentNode === parent && (cur.nextSibling === before || before === cur)) { if (cur.getAttribute('data-sig') !== html) { cur.innerHTML = html; cur.setAttribute('data-sig', html); } return; }   """ + MARK + """: already right after its anchor = in place */
    if (cur) { if (before === cur) before = cur.nextSibling; cur.remove(); }
    cur = document.createElement('div'); cur.id = id; cur.setAttribute('data-gc-keep', '1'); cur.setAttribute('data-sig', html); cur.innerHTML = html;"""
assert src.count(OLD) == 1, ('CLBAR find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('CLBAR: patched', path)
