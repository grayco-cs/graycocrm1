#!/usr/bin/env python3
"""Idempotent patch MKTFIX7 (Marketing audit, owner 10/30: "top notch" for the first day): empty screens say what to do.

    python3 tools/patch_MKTFIX7.py [index.html]

  1. 🗂 Media library with nothing in it said "Nothing matches." — it now says how pictures get there: a content
     session upload (below), and job photos once the office ticks the customer's OK on the job (live: none yet).
  2. 📈 My leads with no marketing lead yet: a card says which leads count and how to get the first ones (a tracked
     link / QR, the website form, Google Business, a referral) instead of empty tables only.
Every find-string must match exactly once; a file that already carries the marker is left alone.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = 'patch MKTFIX7'
if MARK in t:
    print('MKTFIX7: already patched'); sys.exit(0)
R = []
R.append(("""(!list.length ? '<div class="gmt-muted">Nothing matches.</div>' : '')""",
"""(!list.length ? (!all.length ? '<div class="gmt-warn" style="margin-top:8px"><b>The library is empty for now.</b> Add pictures and videos with <b>📸 Content session — batch upload</b> below (the crew, the trucks, a job start to finish). Job photos show up here by themselves once the office ticks “The customer said OK to use photos of this job in marketing” on the job (🗞 Neighborhood flyers or 🎬 Reel kit).</div>' : '<div class="gmt-muted">Nothing matches — clear the filters above.</div>') : '')   /* patch MKTFIX7 */"""))
R.append(("""  var rows = arr(L.rows), f = L.funnel || {}, sv = L.soldValues, h = '';""",
"""  var rows = arr(L.rows), f = L.funnel || {}, sv = L.soldValues, h = '';
  if (!rows.length) h += '<div class="gmt-warn"><b>No marketing leads yet.</b> A lead counts here when it came from marketing: a tracked link or QR code (🔗 Tracked links, QR &amp; numbers), the website form (🌐 Website leads &amp; form), Google Business, an ad, the newsletter, a referral or a door hanger. Put a tracked link on every post, flyer and ad — the first leads show up here with their stage, city and service.</div>';   /* patch MKTFIX7 */"""))
for old, new in R:
    n = t.count(old)
    assert n == 1, (n, old[:90])
    t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('MKTFIX7: patched')
