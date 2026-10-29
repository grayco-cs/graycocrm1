#!/usr/bin/env python3
"""Idempotent patch SALESSPAM: ⚙ Admin → 🗑 Filtered (sales/spam) (tools/salesspam_tail.js, admins only), placed right
BEFORE the 📱 Text alerts script (gc-patch-smsalert). Server: netlify/functions/bid-inbox.js ?salesspam=1 and
netlify/functions/_lib/salesspam.js (the filter itself runs in bid-inbox.js, claim-inbox.js and missed-call.js).

Every find-string must occur exactly once. Usage: python3 tools/patch_SALESSPAM.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'salesspam_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_SALESSPAM__'
if MARK in src:
    print('already patched'); sys.exit(0)
anchor = '<script id="gc-patch-smsalert">'
assert src.count(anchor) == 1, ('anchor count != 1', src.count(anchor))
assert src.count("{ id: 'leads', ic: '📥', t: 'Leads, bids & portals'") == 1
assert '</script>' not in TAIL
src = src.replace(anchor, '<script id="gc-patch-salesspam">\n' + TAIL + '\n</script>\n' + anchor)
assert src.count(MARK) >= 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
