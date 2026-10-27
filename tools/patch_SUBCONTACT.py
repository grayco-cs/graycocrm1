#!/usr/bin/env python3
"""Idempotent patch SUBCONTACT: the customer's "Your crew" card — trade contacts only when the PM approves.

tools/subcontact_tail.js goes in as <script id="gc-patch-subcontact"> right BEFORE gc-patch-regdup: the job page's
"👷 Trade contacts for the customer" panel (under the job's portal card) and the ✅ Approvals picker for the
customer's request (it wraps window._gcApprovalAct, the one approval door). The server side is portal.js +
netlify/functions/_lib/subcontact.js; the customer's card is portal.html's gc-portal-crew.
Every find-string must occur exactly once. Usage: python3 tools/patch_SUBCONTACT.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'subcontact_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_SUBCONTACT__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '</script>' not in TAIL
EDITS = [
  ('<script id="gc-patch-regdup">', '<script id="gc-patch-subcontact">\n' + TAIL + '\n</script>\n<script id="gc-patch-regdup">'),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('find-string count != 1', a[:80], src.count(a))
    src = src.replace(a, b)
assert src.count(MARK) >= 2
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
