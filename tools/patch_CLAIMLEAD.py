#!/usr/bin/env python3
"""Idempotent patch CLAIMLEAD: ⚙ Lead settings (the drawer) gets "Insurance claims go to:" (a staff picker).

A claims@ e-mail for a NEW claim is also a Lead Inbox lead (netlify/functions/_lib/claim-lead.js, claim-inbox.js); it is
assigned to this person, else to the Senior Insurance PM of the lead roles. The choice is kept by bid-inbox ?settings=1
(gc_lead_inbox_settings.claimsTo). The page side is one tail script (tools/claimlead_tail.js) placed before gc-patch-pay2.
Every find-string must occur exactly once. Usage: python3 tools/patch_CLAIMLEAD.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'claimlead_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_CLAIMLEAD__'
if MARK in src:
    print('already patched'); sys.exit(0)
anchor = '<script id="gc-patch-pay2">'
assert src.count(anchor) == 1, ('anchor count != 1', src.count(anchor))
assert '</script>' not in TAIL
src = src.replace(anchor, '<script id="gc-patch-claimlead">\n' + TAIL + '\n</script>\n' + anchor)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
