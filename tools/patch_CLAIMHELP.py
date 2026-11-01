#!/usr/bin/env python3
"""Idempotent patch CLAIMHELP — 🛡 Insurance claim help (the CRM side). See the header of tools/claimhelp_tail.js.

Owner: "I like insurance claims steps as a default for how customers can deal with their insurance claim and insurance
agent. Have where we can add to this as we go as the admin, but have some default easy questions and answers for them
on their portal."

1. ⚙ Admin → 🛡 Insurance claim help (a section of the admin settings hub, after 📝 Work authorization): the claim steps
   and Questions & answers the customer sees; edit / add / reorder / hide, "Reset to GrayCo defaults", "Preview as
   customer", Save draft / Publish. Admins change it, the office views it. Default text marked "DRAFT — for lawyer review"
   in this editor only.
2. The insurance job (desk + phone job screen, under the 🏠 Portal card / the 🛡 Insurance portal panel):
   "🛡 Claim step: <step> ▾", "👁 What the customer sees", "📣 Tell the customer" (a portal post on ✅ Approvals).
Server: netlify/functions/portal.js action 'claimhelp' + netlify/functions/_lib/claimhelp.js; the portal draws it with
/portal-claimhelp.js. Nothing inside the app's code changes: tools/claimhelp_tail.js goes in as
<script id="gc-patch-claimhelp"> at the end of the page, using hooks that are already there (asserted below).
Usage: python3 tools/patch_CLAIMHELP.py [index.html]   (a second run prints "already patched")
"""
import os
import sys

p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
MARK = '/* patch CLAIMHELP */'
if MARK in t:
    print('CLAIMHELP: already patched')
    sys.exit(0)

# the hooks the script relies on — each must be in the page exactly once
ANCHORS = [
    "W._gcAdmAddSection = function(c){",            # patch ADM / API: ⚙ Admin settings sections
    "_gcAdmAddSection({ id: 'workauth', after: 'carrierlib'",  # the section ours goes after
    "window._gcInsPortal = {",                       # patch INSP: the 🛡 Insurance portal panel under the 🏠 Portal card
    "window.__gcAuthIsAdmin = isAdmin;",             # the real admin check (the office opens ⚙ Admin too, view only here)
    "window._gcIsOfficeFull = function(){",          # patch OFFICEFULL
    '<script id="gc-patch-roleapps">',               # the last patch script today (ours goes after it)
]
for a in ANCHORS:
    n = t.count(a)
    assert n == 1, ('CLAIMHELP anchor count != 1', n, a)

js = open(os.path.join(here, 'claimhelp_tail.js'), encoding='utf-8').read()
assert '</script' not in js.lower(), 'claimhelp_tail.js must not contain a closing script tag'
TAG = '<script id="gc-patch-claimhelp">'
assert TAG not in t
block = '\n' + TAG + '\n' + MARK + '\n' + js.rstrip('\n') + '\n</script>\n'
t = t.rstrip('\n') + '\n' + block
open(p, 'w', encoding='utf-8').write(t)
print('CLAIMHELP: patched', p)
