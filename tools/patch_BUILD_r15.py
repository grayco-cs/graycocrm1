#!/usr/bin/env python3
"""Idempotent build bump 33.159-2026-10-29-r14 -> 33.160-2026-10-29-r15: the build comment, the console line and
BUILD_ID in index.html (each exactly once), plus version.txt next to it.
Usage: python3 tools/patch_BUILD_r15.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
OLD, NEW = '33.159-2026-10-29-r14', '33.160-2026-10-29-r15'
src = open(path, encoding='utf-8').read()
vt = os.path.join(os.path.dirname(os.path.abspath(path)), 'version.txt')
EDITS = [('<!-- GrayCo CRM Build: %s -->', 'build comment'),
         ('console.log("[GC] Build %s");', 'console line'),
         ('var BUILD_ID = "%s";', 'BUILD_ID')]
if all(src.count(t % NEW) == 1 for t, _ in EDITS) and OLD not in src:
    print('BUILD r15: already patched')
else:
    for t, name in EDITS:
        assert src.count(t % OLD) == 1, ('BUILD r15 anchor count != 1', name, src.count(t % OLD))
        src = src.replace(t % OLD, t % NEW)
    assert OLD not in src, 'an r14 build string is left'
    open(path, 'w', encoding='utf-8').write(src)
    print('BUILD r15: patched', path)
if os.path.exists(vt):
    v = open(vt).read().strip()
    if v != NEW:
        assert v == OLD, ('version.txt is', v)
        open(vt, 'w').write(NEW + '\n')
        print('BUILD r15: version.txt ->', NEW)
