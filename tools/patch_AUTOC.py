#!/usr/bin/env python3
"""Idempotent patch AUTOC: the owner-approved automations of 10/29, the CRM page's side.

tools/autoc_tail.js goes in as <script id="gc-patch-autoc"> right BEFORE gc-patch-train:
  * Subs tab → the sub's card: "🚨 No-show alert at 9 AM" (default off; sub-texts.js ?noshow=1)
  * ⚙ Admin → "📊 Weekly owner report" (scheduled-reports.js ?view=1 / ?send=1)
Everything else (estimate text day 5, review requests, 6/12-month check-up drafts, referral thank-yous, speed-to-lead)
is server-only. Every find-string must occur exactly once. Usage: python3 tools/patch_AUTOC.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'autoc_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_AUTOC__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '</script>' not in TAIL
EDITS = [
  ('<script id="gc-patch-train">', '<script id="gc-patch-autoc">\n' + TAIL + '\n</script>\n<script id="gc-patch-train">'),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('find-string count != 1', a[:80], src.count(a))
    src = src.replace(a, b)
assert src.count(MARK) >= 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
