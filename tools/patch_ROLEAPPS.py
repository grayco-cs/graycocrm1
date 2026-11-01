#!/usr/bin/env python3
"""Idempotent patch ROLEAPPS (owner 11/01): role apps — every role keeps the same sign-in and data, but opens on its own
home with its own buttons (the role / profile set in 💎 Team access, and the admin's 👁 View as…): GrayCo Field on a phone,
the Desk app on a computer, crews always Field; Marketing unchanged. See the header of tools/roleapps.js.
The script goes in as <script id="gc-patch-roleapps"> at the end of the page (replaced when it changes). It layers on the
public hooks of GrayCo Field (window._gcField / _gcFieldTools) and patch FIELDPORTAL (window._gcFP) — no other line of the
page is changed. Usage: python3 tools/patch_ROLEAPPS.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()

def once(anchor, tag):
    """the page must have exactly one of each hook this patch builds on"""
    c = t.count(anchor)
    assert c == 1, ('ROLEAPPS anchor', tag, c, anchor[:100])

# what the role apps build on (each exactly once)
once('<script id="gc-patch-fieldportal">', 'FIELDPORTAL script')
once("W._gcField = { open: openHome, render: function(){ lastSig = ''; render(true); }", 'GrayCo Field API')
once("layout: function(k){ return LAYOUT[k || rk()] || LAYOUT.pm; }", 'Field layout hook')
once("W._gcFieldTools = Tools;", 'Field tools registry')
once("W._gcVAS = {", 'View as')

TAG = '<script id="gc-patch-roleapps">'
js = open(os.path.join(here, 'roleapps.js'), encoding='utf-8').read().strip() + '\n'
assert '</script' not in js.lower()
assert '/* patch ROLEAPPS */' in js or '(patch ROLEAPPS)' in js
MARK = '/* patch ROLEAPPS */\n'
body = MARK + js
if TAG in t:
    assert t.count(TAG) == 1, 'ROLEAPPS: script tag twice'
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == body:
        print('ROLEAPPS: already patched')
        sys.exit(0)
    t = t[:i] + body + t[j:]; print('ROLEAPPS: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'ROLEAPPS: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + body + '</script>\n'
    print('ROLEAPPS: script added')
open(p, 'w', encoding='utf-8').write(t)
