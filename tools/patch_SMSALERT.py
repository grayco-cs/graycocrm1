#!/usr/bin/env python3
"""Idempotent patch SMSALERT: ⚙ Admin → 📱 Text alerts to cell phones (tools/smsalert_tail.js, placed right after the
💬 Text auto-answers script, before gc-patch-txttpl). Saved by texts.js ?alerts=1; sending in netlify/functions/_lib/smsalert.js.

Every find-string must occur exactly once. Usage: python3 tools/patch_SMSALERT.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'smsalert_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_SMSALERT__'
if MARK in src:
    print('already patched'); sys.exit(0)
anchor = '<script id="gc-patch-txttpl">'
assert src.count(anchor) == 1, ('anchor count != 1', src.count(anchor))
assert src.count('<script id="gc-patch-txt">') == 1
assert src.count("W._gcAdmAddSection({ id: 'texts', after: 'pause'") == 1
assert '</script>' not in TAIL
src = src.replace(anchor, '<script id="gc-patch-smsalert">\n' + TAIL + '\n</script>\n' + anchor)
assert src.count(MARK) >= 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
