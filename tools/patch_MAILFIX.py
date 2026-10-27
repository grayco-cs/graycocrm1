#!/usr/bin/env python3
"""Idempotent patch MAILFIX: 📬 Mail received — the last 50 e-mails to invoices@ / receipts@ / leads@ / bids@ and what the
CRM did with each (server: bid-inbox.js ?mailrecv=1), with "↻ Run again" for a dropped one.

tools/mailfix_tail.js goes in as <script id="gc-patch-mailfix"> right BEFORE gc-patch-ownertodo.
Every find-string must occur exactly once. Usage: python3 tools/patch_MAILFIX.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'mailfix_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_MAILFIX__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '</script>' not in TAIL
EDITS = [
  ('<script id="gc-patch-ownertodo">', '<script id="gc-patch-mailfix">\n' + TAIL + '\n</script>\n<script id="gc-patch-ownertodo">'),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('find-string count != 1', a[:80], src.count(a))
    src = src.replace(a, b)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
