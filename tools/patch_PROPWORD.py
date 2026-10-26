#!/usr/bin/env python3
"""Idempotent patch PROPWORD: the proposal cover word (PROPOSAL / RESTORATION, gradient text) vanished in print because the print CSS
forces every linear-gradient background white while the text fill is transparent.  In print it is now solid navy #0f2440.
Usage: python3 tools/patch_PROPWORD.py [index.html]"""
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
src = open(path, encoding='utf-8').read()
NEW = '.page [style*="text-fill-color"]{-webkit-text-fill-color:#0f2440 !important;color:#0f2440 !important;background:none !important;animation:none !important;}\n'
if NEW in src:
    print('already patched'); sys.exit(0)
OLD = '.page.cover .gcorb{display:none !important;}\n'
assert src.count(OLD) == 1, ('anchor count != 1', src.count(OLD))
open(path, 'w', encoding='utf-8').write(src.replace(OLD, OLD + NEW))
print('patched')
