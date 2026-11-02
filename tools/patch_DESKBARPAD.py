#!/usr/bin/env python3
"""Idempotent patch DESKBARPAD (index.html): the Desk app's floating bottom bar no longer hides the bottom of a page.

  ROLEAPPS puts a floating bar (#gc-ra-dock: Home · Jobs · Approvals · Photos · More) at the bottom of the window on a
  computer, while html.gc-ra-desk-on is set. It padded <body> (84px), but the CRM's pages scroll inside <main>
  (flex:1; overflow:auto), so the last rows / buttons of a page stayed under the bar. Now, while the bar shows, the
  CRM's <main> gets 100px of bottom padding (and the same scroll padding), so everything can be scrolled clear of it.
  Without the bar (phones, Marketing, gc_roleapps_off, the CRM as before) nothing changes.

The rule goes into ROLEAPPS' own style list, right after its body rule (the style is added when the dock is drawn).
Every anchor must occur exactly once; a re-run prints "already patched".
Usage: python3 tools/patch_DESKBARPAD.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch DESKBARPAD'
if MARK in src:
    print('DESKBARPAD: already patched'); sys.exit(0)
anchor = "    'html.gc-ra-desk-on body{padding-bottom:84px}',\n"
assert src.count(anchor) == 1, ('ROLEAPPS body padding anchor', src.count(anchor))
main = 'e.jsx("main",{style:{flex:1,overflow:"auto",padding:"16px 22px"}'
assert src.count(main) == 1, ('the CRM <main>', src.count(main))
add = (anchor +
       "    /* patch DESKBARPAD: the CRM's pages scroll inside <main>, so <main> keeps its bottom clear of the dock */\n"
       "    'html.gc-ra-desk-on main{padding-bottom:100px!important;scroll-padding-bottom:100px}',\n")
src = src.replace(anchor, add)
assert src.count(MARK) == 1
open(path, 'w', encoding='utf-8').write(src)
print('DESKBARPAD: patched', path)
