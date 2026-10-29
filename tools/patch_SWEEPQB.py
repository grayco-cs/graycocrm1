#!/usr/bin/env python3
"""Idempotent patch SWEEPQB: a new browser no longer loads the whole CRM twice before the sign-in screen.

Found by the 10/29 sweep (a JS stack taken at every page unload) and seen on the live site: a fresh browser (new computer, new
phone, private window, cleared site data) downloaded the 17 MB page, then reloaded it 0.5 s after the old QuickBooks
first-run import finished.  That import's lists (C customers, I invoices, V vendors) are empty since the move to the
customer list, so it writes nothing -- but it still reloaded the page (live: 2 x 4.8 MB compressed; 4x CPU: about 4 s more).

Fix: the import still runs once and still marks itself done (_qb3), but reloads only when it actually added a customer or
an invoice.  Usage: python3 tools/patch_SWEEPQB.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch SWEEPQB'
if MARK in src:
    print('SWEEPQB: already patched'); sys.exit(0)
EDITS = [
    ('    if(nc.length>0) st.put(ec.concat(nc),"customers");\n',
     '    if(nc.length>0){ st.put(ec.concat(nc),"customers"); window.__gcQbWrote = true; }   ' + MARK + ': remember a real write */\n'),
    ('      if(I.length>0)st.put(ei.concat(I),"invs");\n',
     '      if(I.length>0){ st.put(ei.concat(I),"invs"); window.__gcQbWrote = true; }\n'),
    ('    setTimeout(function(){location.reload()},500);\n  };\n};\nreq.onerror=function(){\n  console.error("DB error");',
     '    if(window.__gcQbWrote) setTimeout(function(){location.reload()},500);   /* patch SWEEPQB: nothing added = no reload */\n  };\n};\nreq.onerror=function(){\n  console.error("DB error");'),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('SWEEPQB anchor count != 1', a[:70], src.count(a))
    src = src.replace(a, b)
assert src.count(MARK) == 2
open(path, 'w', encoding='utf-8').write(src)
print('SWEEPQB: patched', path)
