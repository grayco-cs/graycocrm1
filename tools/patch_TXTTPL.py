#!/usr/bin/env python3
"""Idempotent patch TXTTPL: Admin -> Text templates + the "Templates" picker in the Job Messages text bar.

Inserts <script id="gc-patch-txttpl"> (tools/txttpl_tail.js) right after the gc-patch-txt script, so it loads after the
Text us part (_gcAdmAddSection, .gctx-bar).  Text only: no server file, no change to the send path.
Usage: python3 tools/patch_TXTTPL.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'txttpl_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_TXTTPL__'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

# the TXT script ends with its console line, then </script>; the next script starts the MAILC patch
once('<script id="gc-patch-mailc">',
     '<script id="gc-patch-txttpl">\n' + TAIL + '\n</script>\n<script id="gc-patch-mailc">', 'after gc-patch-txt, before gc-patch-mailc')
assert src.count('id="gc-patch-txt">') == 1 and src.index('id="gc-patch-txt">') < src.index('id="gc-patch-txttpl">') < src.index('id="gc-patch-mailc">')
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
