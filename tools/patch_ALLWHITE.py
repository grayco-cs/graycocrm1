#!/usr/bin/env python3
r"""Idempotent patch ALLWHITE (owner 11/3, on his iPhone in Field, "Create Document": "I don't want navy. I want white on all
of these pop-ups and all pages"). Every navy/dark pop-up, sheet, modal, drawer and page of the CRM — Field (phone) and
Desk — gets the white look of the 📧 Email Center (patch MAILWHITE) and the ⚙ Admin rows (ADMDISMISS): pages #f6f7f9,
cards #fff with a #e5e7eb border, text #0f172a, muted #64748b, links #1d4ed8, gold kept (gold text #7a5800 on white).
Hundreds of sheets draw their navy with inline styles (1,500 dark backgrounds in index.html), so this adds ONE helper +
ONE late stylesheet (tools/allwhite.js, window._gcAllWhite) at the end of the page instead of editing each one: it marks
each dark surface (data-aw), the light text on it (data-awt) and its dark borders (data-awbd), and the stylesheet maps the
marks to the white colours with !important. Inline styles are never rewritten, so code that reads/toggles them still works.
Left dark on purpose: the TVs, the lobby, the sign-in screen, the desk's top bar and left sidebar, toasts, scrims, photo
viewers, coloured buttons; printed documents, PDFs and the dark invoice are separate documents and are never touched.
Part 2, the GrayCo bar (owner 11/3, the Leads page in Field: "our logo center up top … I want it branded as ours"): every
Field full-screen page or sheet gets one white top bar — ‹ Back left, the GrayCo logo (/grayco-logo-wide.jpg, 32 px)
centred, Done/Cancel right — with the page title on its own line under it (it was hidden behind the floating ‹ Back).
The sheet's own top ‹ Back / Done / ✕ are tucked away and still do the work (patch NAV's Back clicks them). Desk pages
opened in Field: the field header becomes that bar. The job page keeps ‹ Jobs / Camera with the logo between. Field Home
(own logo) and GrayCo Photos are left alone. Desk: only an opaque full-screen overlay (which hides the sidebar's logo)
gets a small logo in the middle of its header, when that spot is free.
Kill switches: localStorage gc_allwhite_off = '1' (colours), gc_awbar_off = '1' (the bar).
Usage: python3 tools/patch_ALLWHITE.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
MARK = '/* patch ALLWHITE */'
TAG = '<script id="gc-patch-allwhite">'
js = open(os.path.join(here, 'allwhite.js'), encoding='utf-8').read().strip() + '\n'
assert '</script' not in js.lower() and '(patch ALLWHITE)' in js
body = MARK + '\n' + js
assert 'patch MAILWHITE' in t, 'ALLWHITE: needs MAILWHITE (the colour reference) on the page'
changed = False
if TAG in t:
    assert t.count(TAG) == 1, 'ALLWHITE: script tag twice'
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != body:
        t = t[:i] + body + t[j:]; changed = True; print('ALLWHITE: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'ALLWHITE: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + body + '</script>\n'; changed = True
if not changed:
    print('ALLWHITE: already patched'); sys.exit(0)
open(p, 'w', encoding='utf-8').write(t)
print('ALLWHITE: patched', p)
