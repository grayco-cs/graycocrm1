#!/usr/bin/env python3
"""Idempotent adapter R17ADAPT_CUSTQ (release r17): the SUBPHOTOS upload question shows over GrayCo Photos.

Found in the r17 gates (test_PHOTOSPM's upload checks): SUBPHOTOS asks "Customer can see these photos?  ○ Yes  ○ No" on
every staff upload, in a box it adds to <body> (div.gc-custq). While GrayCo Photos is open, the Photos module hides every
other child of <body> (html.gcu-open body>:not(#gcuOv):not(...){visibility:hidden!important}), so the question was
invisible and the upload waited for an answer nobody could give: a photo added from GrayCo Photos (the camera button / Add
photos) never uploaded, no "Added 1 photo to <job>" message. Uploads from the CRM's own screens were not affected.
The box now carries an inline "visibility: visible !important" (an inline !important wins over the stylesheet rule), so it
shows over GrayCo Photos and everywhere else exactly as designed. Nothing else changes.
Run after SUBPHOTOS. Usage: python3 tools/patch_R17ADAPT_CUSTQ.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch R17ADAPT_CUSTQ'
if MARK in t:
    print('R17ADAPT_CUSTQ: already patched'); sys.exit(0)
assert '/* patch SUBPHOTOS' in t, 'R17ADAPT_CUSTQ runs after SUBPHOTOS'
old = ("    ov.querySelector('[data-gc-custq-x]').onclick = function(){ done(null); };\n"
       "    document.body.appendChild(ov);\n")
new = ("    ov.querySelector('[data-gc-custq-x]').onclick = function(){ done(null); };\n"
       "    try { ov.style.setProperty('visibility', 'visible', 'important'); } catch (e) {}   " + MARK + ": shown over GrayCo Photos, which hides the other children of <body> */\n"
       "    document.body.appendChild(ov);\n")
n = t.count(old)
assert n == 1, ('R17ADAPT_CUSTQ anchor', n)
t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('R17ADAPT_CUSTQ: patched', p)
