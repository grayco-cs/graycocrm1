#!/usr/bin/env python3
"""Idempotent patch FIELDPORTAL2 (owner 10/30): GrayCo Field, part 2 — see the header of tools/fieldportal2.js.
* 📞 Call / 💬 Text the customer from the Field job page: "From your own phone" or "From the GrayCo number"
  (calls: the Twilio bridge in netlify/functions/_lib/fieldcall.js via texts.js?fieldcall=1 + missed-call.js?event=fcall;
  texts: off until A2P registration). The last choice is remembered per person.
* 📄 Field Documents: every paper on the job (files, proposals, signature requests, invoices, change orders, links, the
  job's document set), grouped, newest first, each with its 👁 customer-portal state.
The script goes in as <script id="gc-patch-fieldportal2"> at the end of the page (replaced when it changes); it needs
patch FIELDPORTAL (its sheet look) and only adds — nothing else in the page is edited.
Usage: python3 tools/patch_FIELDPORTAL2.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
assert '<script id="gc-patch-fieldportal">' in t, 'FIELDPORTAL2 needs patch FIELDPORTAL first (tools/patch_FIELDPORTAL.py)'
TAG = '<script id="gc-patch-fieldportal2">'
js = open(os.path.join(here, 'fieldportal2.js'), encoding='utf-8').read().strip() + '\n'
assert '</script' not in js.lower()
if TAG in t:
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == js: print('FIELDPORTAL2: script already current')
    else: t = t[:i] + js + t[j:]; print('FIELDPORTAL2: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'FIELDPORTAL2: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'
    print('FIELDPORTAL2: script added')
open(p, 'w', encoding='utf-8').write(t)
