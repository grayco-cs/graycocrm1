#!/usr/bin/env python3
"""Idempotent patch CALLCHAIN (+ CALLSCREEN): Admin -> 📞 Call order (screen callers 1 / 2 / 3, then who the GrayCo Twilio number rings, one at a time; blocked numbers; call log).

Inserts <script id="gc-patch-callchain"> (tools/callchain_tail.js) right after the gc-patch-txttpl script (before
gc-patch-mailc), so it loads after the Text us part (_gcAdmAddSection) and sits by 💬 Text auto-answers.
Server side: netlify/functions/_lib/callorder.js, missed-call.js (the ring), texts.js ?callchain=1 (admin read / save).
Usage: python3 tools/patch_CALLCHAIN.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'callchain_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_CALLCHAIN__'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

assert src.count('<script id="gc-patch-txttpl">') == 1, 'gc-patch-txttpl missing'
once('<script id="gc-patch-mailc">',
     '<script id="gc-patch-callchain">\n' + TAIL + '\n</script>\n<script id="gc-patch-mailc">', 'before gc-patch-mailc')
assert src.index('id="gc-patch-txttpl">') < src.index('id="gc-patch-callchain">') < src.index('id="gc-patch-mailc">')
assert src.count(MARK) == 3
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
