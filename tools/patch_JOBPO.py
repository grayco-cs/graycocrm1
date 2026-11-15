#!/usr/bin/env python3
"""patch JOBPO (owner's sub portal plan, 11/15 list item 5.1c): 🧾 Expenses by PO on the job page — PO column, PO / who filters,
PO spend by sub (tools/jobpo_tail.js). Idempotent. Usage: python3 tools/patch_JOBPO.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(here), 'index.html')
TAG = '<script id="gc-patch-jobpo">'
js = open(os.path.join(here, 'jobpo_tail.js'), encoding='utf-8').read(); assert '</script' not in js.lower()
src = open(P, encoding='utf-8').read()
if TAG in src:
    i = src.index(TAG) + len(TAG); j = src.index('</script>', i); src = src[:i] + '\n' + js + src[j:]
else:
    src = src.rstrip('\n') + '\n' + TAG + '\n' + js + '</script>\n'
open(P, 'w', encoding='utf-8').write(src); print('JOBPO applied')
