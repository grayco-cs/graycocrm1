#!/usr/bin/env python3
"""Idempotent patch ALERTTO: Lead settings (the drawer) gets "Lead & bid alert e-mails go to:" (tools/alertto_tail.js, placed before gc-patch-pay2).

Kept by bid-inbox ?settings=1 (gc_lead_inbox_settings.alertTo). Every find-string must occur exactly once. Usage: python3 tools/patch_ALERTTO.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'alertto_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_ALERTTO__'
if MARK in src:
    print('already patched'); sys.exit(0)
anchor = '<script id="gc-patch-pay2">'
assert src.count(anchor) == 1, ('anchor count != 1', src.count(anchor))
assert '</script>' not in TAIL
src = src.replace(anchor, '<script id="gc-patch-alertto">\n' + TAIL + '\n</script>\n' + anchor)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
