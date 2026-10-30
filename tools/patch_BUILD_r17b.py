#!/usr/bin/env python3
"""Idempotent build bump 33.162-2026-10-30-r17e -> 33.163-2026-10-30-r17b (r17e + MKTFEAT, OFFFEAT, CCPHOTOS2, AUTHFIX): the build
comment, the console line and BUILD_ID in index.html (each exactly once), plus version.txt next to it.
Usage: python3 tools/patch_BUILD_r17b.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
OLD, NEW = '33.162-2026-10-30-r17e', '33.163-2026-10-30-r17b'
src = open(path, encoding='utf-8').read()
vt = os.path.join(os.path.dirname(os.path.abspath(path)), 'version.txt')
EDITS = [('<!-- GrayCo CRM Build: %s -->', 'build comment'),
         ('console.log("[GC] Build %s");', 'console line'),
         ('var BUILD_ID = "%s";', 'BUILD_ID')]
if all(src.count(t % NEW) == 1 for t, _ in EDITS) and OLD not in src:
    print('BUILD r17b: already patched')
else:
    for t, name in EDITS:
        assert src.count(t % OLD) == 1, ('BUILD r17 anchor count != 1', name, src.count(t % OLD))
        src = src.replace(t % OLD, t % NEW)
    assert OLD not in src, 'an r17d build string is left'
    open(path, 'w', encoding='utf-8').write(src)
    print('BUILD r17b: patched', path)
if os.path.exists(vt):
    v = open(vt).read().strip()
    if v != NEW:
        assert v == OLD, ('version.txt is', v)
        open(vt, 'w').write(NEW + '\n')
        print('BUILD r17b: version.txt ->', NEW)
