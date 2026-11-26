#!/usr/bin/env python3
"""patch CONTRACTREAD — the 📦 ZIP import reads the contract price out of contract files (owner 11/26).

  python3 tools/patch_CONTRACTREAD.py [index.html]

The page code stays in tools/zipimport_tail.js (patch ZIPIMPORT's file, now with the CONTRACTREAD part). This replaces the body of
<script id="gc-patch-zipimp"> with it. The script must occur exactly once; a re-run prints "already patched".
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'index.html')
src = open(path, encoding='utf-8').read()
tail = open(os.path.join(HERE, 'zipimport_tail.js'), encoding='utf-8').read().rstrip('\n')
assert '</script' not in tail.lower(), 'no </script> inside the patch'
assert 'patch CONTRACTREAD' in tail
open_tag = '<script id="gc-patch-zipimp">\n'
assert src.count(open_tag) == 1, ('ZIPIMPORT script', src.count(open_tag))
a = src.index(open_tag) + len(open_tag)
b = src.index('\n</script>', a)
if src[a:b] == tail:
    print('already patched')
    sys.exit(0)
assert 'patch ZIPIMPORT' in src[a:b], 'the ZIPIMPORT script'
src = src[:a] + tail + src[b:]
open(path, 'w', encoding='utf-8').write(src)
print('CONTRACTREAD ok')
