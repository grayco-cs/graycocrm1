#!/usr/bin/env python3
"""Idempotent patch FIELDFIX8: field layout taps (phone).

Found by the field-view audit (10/30, 390x844 touch):
  • On a phone in desk view, the "📱 Back to GrayCo Field" button (the only way back) sat UNDER the "Connect your
    Google account" bar (z-index 100060 under 100085): the tap hit the bar. The button now sits above it.
  • The field home's "All jobs ›" / "See all ›" links were 59-65 x 23 px and the job-name buttons 20 px tall — hard
    to hit with a thumb. They get a 40 px+ tap area (padding with matching negative margin: the look is unchanged).
CSS only.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* FIELDFIX8 */'
if MARK in src:
    print('already patched'); sys.exit(0)
OLD = "#gc-fh-backfield{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:100060;"
NEW = "#gc-fh-backfield{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:100088;"
assert src.count(OLD) == 1, src.count(OLD)
src = src.replace(OLD, NEW)
OLD2 = "    '.gc-fh .fh-sec button{background:none;border:none;color:#2563eb;font-weight:800;font-size:12px;letter-spacing:.04em;min-height:0!important;padding:4px}',\n"
NEW2 = OLD2 + "    '" + MARK + ".gc-fh .fh-sec button{padding:12px 8px!important;margin:-10px -6px!important}.gc-fh .fh-n{padding:10px 0!important;margin:-10px 0!important}',\n"
assert src.count(OLD2) == 1, src.count(OLD2)
src = src.replace(OLD2, NEW2)
open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFIX8')
