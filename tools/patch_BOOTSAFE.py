#!/usr/bin/env python3
"""Idempotent patch BOOTSAFE: the CRM can never stay blank without saying so, and recovers by itself.

Why: r15b (STORECUT + SWEEPQB + SWEEPCHUNK + TODOPHONE + IDLETRIM) showed a BLACK SCREEN while loading on the owner's
Edge (10/29, rolled back; cause not proven -- see the r16 report). The page's background is dark (#0c1a2a), so "black"
means: the page was read but nothing was drawn. This patch puts tools/bootsafe_early.js first in <head>:
  * each open is remembered until something is drawn (sign-in screen or the CRM); errors before that are kept (gc_boot_err);
  * 25 s after the page is read with nothing drawn: a panel says so ("Reload" / "Open in safe mode");
  * safe mode (automatic after 2 blank opens in a row, or a reload loop of 5 loads in 90 s, or the button) runs that open
    without the r16 speed layers (STORECUT, SWEEPCHUNK, IDLETRIM, TODOPHONE = r14d behaviour) for 24 h.
It reads two tiny keys and writes one; nothing big is read, parsed or written before the first paint.
Kill switch: localStorage gc_bootsafe_off = '1'.  Console: _gcBootSafe.state(), _gcBootSafe.off().
Usage: python3 tools/patch_BOOTSAFE.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_BOOTSAFE__'
if MARK in src:
    print('BOOTSAFE: already patched'); sys.exit(0)
EARLY = open(__file__.replace('patch_BOOTSAFE.py', 'bootsafe_early.js'), encoding='utf-8').read()
assert MARK in EARLY
ANCHOR = '<head>\n<script id="gc-patch-stuckfix">\n'
assert src.count(ANCHOR) == 1, ('BOOTSAFE anchor count != 1', src.count(ANCHOR))
src = src.replace(ANCHOR, '<head>\n<script id="gc-patch-bootsafe">\n' + EARLY.rstrip('\n') + '\n</script>\n<script id="gc-patch-stuckfix">\n')
assert src.count('<script id="gc-patch-bootsafe">') == 1
open(path, 'w', encoding='utf-8').write(src)
print('BOOTSAFE: patched', path)
