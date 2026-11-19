#!/usr/bin/env python3
"""patch MKTMATH (owner 11/19: "I need all this marketing profile to work. It's not doing the right math etc. I don't feel my
data is right."): 📣 Marketing → 📊 Dashboard counts marketing leads only (bids, tests, merged / deleted / cleaned-up leads,
copies of imported jobs and unmarked / bad Google LSA leads left out and listed), by the day each lead arrived (Memphis time);
close rate = won ÷ decided; revenue = contract value of won jobs (invoiced / paid switch); "no spend data" instead of $0 / ∞;
a "?" with the source and formula on every number; 🏗 Bid invitations, 📍 Google LSA and 🧹 Left out cards; ⭐ Review tracker
shows "—" for asked → received when nothing was asked.
  tools/mktmath_core.js — the pure math (window.__gcMktMath; node: tools/tests/test_MKTMATH.mjs)
  tools/mktmath_tail.js — the Dashboard view
Idempotent. Usage: python3 tools/patch_MKTMATH.py [repo-root]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
R = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(here)
P = os.path.join(R, 'index.html')
for tag, fn in [('mktmath-core', 'mktmath_core.js'), ('mktmath', 'mktmath_tail.js')]:
    TAG = '<script id="gc-patch-' + tag + '">'
    js = open(os.path.join(here, fn), encoding='utf-8').read(); assert '</script' not in js.lower()
    src = open(P, encoding='utf-8').read()
    if TAG in src:
        i = src.index(TAG) + len(TAG); j = src.index('</script>', i); src = src[:i] + '\n' + js + src[j:]
    else:
        src = src.rstrip('\n') + '\n' + TAG + '\n' + js + '</script>\n'
    open(P, 'w', encoding='utf-8').write(src)
print('MKTMATH applied')
