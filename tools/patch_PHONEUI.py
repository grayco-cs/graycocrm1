#!/usr/bin/env python3
"""Idempotent patch PHONEUI: GrayCo Field on a phone looks like an app (owner 11/19, iPhone, Leads opened from the Field home:
"Top search bar and changing companies shouldn't be in there, it needs to look like an app, and those buttons list calendar
etc need to be a little bigger so I know what they are").

tools/phoneui_block.html is appended as the last script. On a phone in GrayCo Field (any person, admins too):
  1. the desk top bar (company switcher + global search) and the red 💬 job-messages bubble are hidden (Messages is on every
     Field job page); the Field page header is kept (the two-second notice sweep removed it every 2 s, which let NAV's floating
     "‹ Back" sit on the title) and drawn as a native header: "‹ Back" left, the title next to it; main starts under it;
  2. the "COI / W-9 to confirm" / "payments match invoices" pills ride in that header instead of over the page;
  3. Leads: the views (Board · List · Calendar · Map · Outreach · RoofScout · LSA …) are a 3-across grid of 48 px buttons with
     the full label, the filter chips wrap (no sideways scrolling); also on any phone-width screen.
A computer (desk, wider than 640 px, not in Field): unchanged.  Kill switch: localStorage gc_phoneui_off = '1'.
Usage: python3 tools/patch_PHONEUI.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_PHONEUI__' in src:
    print('PHONEUI: already patched'); sys.exit(0)
BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'phoneui_block.html'), encoding='utf-8').read().rstrip('\n')
assert BLOCK.count('</script>') == 1 and BLOCK.startswith('<script id="gc-patch-phoneui">')
src = src.rstrip('\n') + '\n' + BLOCK + '\n'
open(path, 'w', encoding='utf-8').write(src)
print('PHONEUI: patched', path)
