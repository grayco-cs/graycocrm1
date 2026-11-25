#!/usr/bin/env python3
"""patch ZIPIMPORT — 📦 Import ZIP of job files on the 💎 menu (owner 11/25).

  python3 tools/patch_ZIPIMPORT.py [index.html]

The page code is tools/zipimport_tail.js (one <script id="gc-patch-zipimp">), added after the last script of the page
(PORTALSIGNUP). It only reads hooks other patches already offer (window._gcStoreFile, projectDocs, _gcApprovalSet,
_gcApxExtra, the 'gc-hub-open' event, window._gcPdfText); nothing else in the page changes.
The anchor must occur exactly once; a re-run prints "already patched".
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'index.html')
src = open(path, encoding='utf-8').read()
if '<script id="gc-patch-zipimp">' in src:
    print('already patched')
    sys.exit(0)
tail = open(os.path.join(HERE, 'zipimport_tail.js'), encoding='utf-8').read().rstrip('\n')
assert '</script' not in tail.lower(), 'no </script> inside the patch'
anchor = ("try { console.log('[GC] 🔗 Portal sign-up link + the sign-up ✅ Approvals card (patch PORTALSIGNUP) — _gcPortalSignup'); } catch (e) {}\n"
          "})();\n</script>\n")
assert src.count(anchor) == 1, ('PORTALSIGNUP script end', src.count(anchor))
src = src.replace(anchor, anchor + '<script id="gc-patch-zipimp">\n' + tail + '\n</script>\n')
assert src.count('<script id="gc-patch-zipimp">') == 1
open(path, 'w', encoding='utf-8').write(src)
print('ZIPIMPORT ok')
