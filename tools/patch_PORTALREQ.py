#!/usr/bin/env python3
"""Idempotent patch PORTALREQ (owner: "for customer portal / GC / property manager portal etc. have where they can request
change orders or new projects"). The portals' side is portal-req.js + netlify/functions/portal-req.js + _lib/portalreq.js;
this is the CRM's side (see the header of tools/portalreq_tail.js):

1. ✅ Approvals: the office approves the request cards and our replies (preq_change / preq_project / preq_reply /
   preq_decline) — the CRM copy of netlify/functions/_lib/office-kinds.js (patch APOFFICE4's list).
2. tools/portalreq_tail.js goes in as <script id="gc-patch-portalreq"> at the end of the page: the request card's details,
   photos and its three buttons (🔁 Make a change order — the change order builder prefilled; 💬 Reply; ✖ Decline with note).
Every anchor must be there exactly once; a second run prints "already patched" and changes nothing.
Usage: python3 tools/patch_PORTALREQ.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(here), 'index.html')
t = open(p, encoding='utf-8').read()
MARK = '/* patch PORTALREQ */'
TAG = '<script id="gc-patch-portalreq">'

if MARK in t and TAG in t:
    print('PORTALREQ: already patched')
    sys.exit(0)
assert MARK not in t and TAG not in t, 'PORTALREQ: half patched — start from a clean index.html'


def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('PORTALREQ anchor count != 1', n, old[:90])
    t = t.replace(old, new)


js = open(os.path.join(here, 'portalreq_tail.js'), encoding='utf-8').read()
assert '</script' not in js and '<!--' not in js, 'PORTALREQ: the script must not close its own tag'

# 1. the office's approval kinds (same list as _lib/office-kinds.js)
once('"maint_outreach","maint_repair","maint_reminder"]',
     '"maint_outreach","maint_repair","maint_reminder","preq_change","preq_project","preq_reply","preq_decline"]')   # (the list stays one JSON array: test_APOFFICE4 compares it)

# 2. the request card in the CRM, at the end of the page
assert t.rstrip().endswith('</script>'), 'PORTALREQ: page end'
t = t.rstrip() + '\n' + TAG + '\n' + MARK + '\n' + js + '</script>\n'
open(p, 'w', encoding='utf-8').write(t)
print('PORTALREQ: patched (office kinds + the request card)')
