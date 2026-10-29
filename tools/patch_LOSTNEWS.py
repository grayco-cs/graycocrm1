#!/usr/bin/env python3
"""Idempotent patch LOSTNEWS: lost leads stay on GrayCo News until they unsubscribe — the CRM page's side.

1. <script id="gc-patch-lostnews"> right BEFORE gc-patch-autoc: netlify/functions/_lib/lostnews.js (the rules, the same
   file the server uses → window.__gcLostNews) + tools/lostnews_tail.js (window._gcLostNews.row(l) and the switch).
2. The lead panel (both layouts) shows the row under "Lost because: …".
Every find-string must occur the stated number of times. Usage: python3 tools/patch_LOSTNEWS.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
LIB = open(os.path.join(HERE, '..', 'netlify', 'functions', '_lib', 'lostnews.js'), encoding='utf-8').read().rstrip('\n')
TAIL = open(os.path.join(HERE, 'lostnews_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_LOSTNEWS__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '</script>' not in LIB and '</script>' not in TAIL
LOST = "+ (l.lostReason ? '<div class=\"note\">Lost because: ' + esc(l.lostReason) + '</div>' : '')"
EDITS = [
  ('<script id="gc-patch-autoc">', '<script id="gc-patch-lostnews">\n' + LIB + '\n' + TAIL + '\n</script>\n<script id="gc-patch-autoc">', 1),
  (LOST, LOST + "\n    + (W._gcLostNews ? W._gcLostNews.row(l) : '')   /* patch LOSTNEWS */", 2),
]
for a, b, n in EDITS:
    assert src.count(a) == n, ('find-string count', a[:80], src.count(a), n)
    src = src.replace(a, b)
assert MARK in src
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
