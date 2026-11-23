#!/usr/bin/env python3
"""Idempotent patch PORTALSIGNUP (owner 11/23: "also be able to tell customers to sign up on portal.grayco-cs.com and their name will
match to what we already have in our CRM system for their job address etc and that's a way they can sign up or we send them a link too,
let them choose customer, subcontractor, supplier and other as choices").

The CRM's side (the portal's side is portal-signup.js; the server is netlify/functions/portal-access.js + _lib/portalsignup.js):
1. ✅ Approvals: the office approves the sign-up card (kind portal_signup) — the CRM copy of _lib/office-kinds.js (APOFFICE4's list).
2. The approval lists name the kind ("Portal sign-up: match a job").
3. tools/portalsignup_tail.js goes in as <script id="gc-patch-portalsignup"> at the end of the page: 🔗 Portal sign-up link on the
   job's 🏠 Portal card, and the sign-up card's evidence + ✅ Approve / ↪ Not this job / ✖ Deny.
Every anchor must be there exactly once; a second run prints "already patched" and changes nothing.
Usage: python3 tools/patch_PORTALSIGNUP.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(here), 'index.html')
t = open(p, encoding='utf-8').read()
MARK = '/* patch PORTALSIGNUP */'
TAG = '<script id="gc-patch-portalsignup">'

if MARK in t and TAG in t:
    print('PORTALSIGNUP: already patched')
    sys.exit(0)
assert MARK not in t and TAG not in t, 'PORTALSIGNUP: half patched — start from a clean index.html'


def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('PORTALSIGNUP anchor count != 1', n, old[:90])
    t = t.replace(old, new)


js = open(os.path.join(here, 'portalsignup_tail.js'), encoding='utf-8').read()
assert '</script' not in js and '<!--' not in js, 'PORTALSIGNUP: the script must not close its own tag'

# 1. the office's approval kinds (same list as _lib/office-kinds.js; one JSON array — test_APOFFICE4 compares it)
once('"preq_change","preq_project","preq_reply","preq_decline"]',
     '"preq_change","preq_project","preq_reply","preq_decline","portal_signup"]')

# 2. the kind's name on the approval lists
once("var KIND = { portal_publish:'Put in customer portal', invoice:'Invoice e-mail (PDF)', ",
     "var KIND = { portal_signup:'Portal sign-up: match a job', portal_publish:'Put in customer portal', invoice:'Invoice e-mail (PDF)', ")
once("var KIND = { portal_publish:'Put in customer portal', portal_link:'Portal link', portal_docs:'New papers notice',",
     "var KIND = { portal_signup:'Portal sign-up: match a job', portal_publish:'Put in customer portal', portal_link:'Portal link', portal_docs:'New papers notice',")

# 3. the link + the card, at the end of the page
assert t.rstrip().endswith('</script>'), 'PORTALSIGNUP: page end'
t = t.rstrip() + '\n' + TAG + '\n' + MARK + '\n' + js + '</script>\n'
open(p, 'w', encoding='utf-8').write(t)
print('PORTALSIGNUP: patched (office kind + kind names + the sign-up link and card)')
