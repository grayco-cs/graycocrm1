#!/usr/bin/env python3
"""Idempotent patch MAINTDOCS — "make sure all company documents and PM docs talk about the maintenance plans too" (owner).

The page's documents get a short GrayCo Care section (never an insurance carrier's name):
  · 📘 PM Playbook (Company Docs): a "Maintenance plans" section + table-of-contents entry — how PMs sell plans, the
    Bronze / Silver / Gold tiers, monthly or yearly, the Handyman Day, how they get paid (50/50 of the profit; 15/50/50 when
    subbed; the 3-month clawback), reminders 1 month before a visit go to the seller, and the Maintenance Schedule.
  · Welcome & FAQ Packet: "Do you offer maintenance plans?"
  · Certificate of Completion and Certificate of Completion & Satisfaction: "Keep your new roof / home protected" with the
    tiers and the portal sign-up (window._gcMaintBlurb, from tools/mainttab.js).
  · the closeout letter (both copies): one sentence about GrayCo Care.
  · the estimate's closing: one line about GrayCo Care after the thank-you.
Usage: python3 tools/patch_MAINTDOCS.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = 'patch MAINTDOCS'
if '<section id=\\"maint\\"><!-- ' + MARK in t:
    print('MAINTDOCS: already patched'); sys.exit(0)


def once(old, new, n=1):
    global t
    c = t.count(old)
    assert c == n, ('MAINTDOCS anchor count', c, n, old[:90])
    t = t.replace(old, new)


# ── the PM Playbook (a JS string with escaped quotes and slashes) ──
once('<li><a href=\\"about:srcdoc#quick\\">Quick reference<\\/a><\\/li>',
     '<li><a href=\\"about:srcdoc#quick\\">Quick reference<\\/a><\\/li>\\n  <li><a href=\\"about:srcdoc#maint\\">Maintenance plans<\\/a><\\/li>')
SEC = ('<section id=\\"maint\\"><!-- ' + MARK + ' -->\\n    <h2><span class=\\"n\\">🛠<\\/span>Maintenance plans (GrayCo Care)<\\/h2>\\n'
       '    <p>Every finished job is a chance to sell a plan. Roof, home and commercial plans, HVAC and pressure washing (our own service lines), a 🔧 Handyman Day ($349.99 a day, 8 AM – 5 PM, materials extra) and the free roof inspection for commercial prospects. Everything is in the <b>🛠 Maintenance<\\/b> tab.<\\/p>\\n'
       '    <ul>\\n'
       '      <li><b>Sell it:<\\/b> on the job, 🛠 Maintenance → tick the plans → Send quote, or 🛠 Maintenance → 🏗 Plan builder (property → services → tier → review → send to sign). The customer signs in the portal; the e-mail waits on ✅ Approvals.<\\/li>\\n'
       '      <li><b>Tiers:<\\/b> every plan customer starts at Bronze. Silver 10% and Gold 20% off repairs we find (Gold: the yearly free-plan drawing). Commercial plan customers are on the ⭐ priority list for snow and emergency mitigation.<\\/li>\\n'
       '      <li><b>Monthly or yearly:<\\/b> the customer picks. It is a 12-month agreement either way; monthly invoices go out as one approval a month.<\\/li>\\n'
       '      <li><b>How you get paid:<\\/b> you get <b>50%<\\/b> of the plan\'s profit (revenue − costs) when your crew does the work. When it is subbed (HVAC → Rapid Air, pressure washing → Brenan Hart): <b>15/50/50<\\/b> — 15% of the revenue comes off for overhead, then 50% of what is left after the sub\'s estimate. It is credited as each payment comes in. If the customer cancels within 3 months of signing, the commission already credited is reversed.<\\/li>\\n'
       '      <li><b>Visits:<\\/b> they are on the 🗓 Maintenance Schedule (not the job schedule). One month before a visit, whoever sold the plan gets a To-Do and an e-mail: get it done this month. Post the visit from 📝 Post visit update — photos, notes, and “+ Add repair found” (a quote to the customer with their tier discount).<\\/li>\\n'
       '    <\\/ul>\\n  <\\/section>\\n\\n  ')
once('<section id=\\"never\\">', SEC + '<section id=\\"never\\">')

# ── Welcome & FAQ Packet ──
once("""      '</table>',
      (window.gcPortalBox?window.gcPortalBox({size:'10.5px',css:'margin-top:12px'}):''),""",
     """        '<tr><td><b>Do you offer maintenance plans?</b></td><td>Yes — GrayCo Care: yearly or monthly plans for your roof and home (HVAC, gutters, pressure washing, a Handyman Day and more) with a photo report after every visit. Bronze, Silver and Gold members save on repairs. Ask your PM or see Maintenance plans in your GrayCo Portal.</td></tr>'+   /* """ + MARK + """ */
      '</table>',
      (window.gcPortalBox?window.gcPortalBox({size:'10.5px',css:'margin-top:12px'}):''),""")

# ── the certificates ──
once("""        '<div class="watermark" style="text-align:center;margin-top:8px">IICRC WRT Certified</div>',   /* patch LOGO2 */
      ].join(''), 'Certificate of Completion — '+j.name);""",
     """        (window._gcMaintBlurb?window._gcMaintBlurb('cert', j):''),   /* """ + MARK + """ */
        '<div class="watermark" style="text-align:center;margin-top:8px">IICRC WRT Certified</div>',   /* patch LOGO2 */
      ].join(''), 'Certificate of Completion — '+j.name);""")
once("""      ].join(''), 'Certificate of Completion & Satisfaction — '+j.name);""",
     """        (window._gcMaintBlurb?window._gcMaintBlurb('cert', j):''),   /* """ + MARK + """ */
      ].join(''), 'Certificate of Completion & Satisfaction — '+j.name);""")

# ── the closeout letter (two copies) ──
once("Enclosed you\\u2019ll find your Certificate of Completion, warranty coverage, final invoice, and lien waiver.",
     "Enclosed you\\u2019ll find your Certificate of Completion, warranty coverage, final invoice, and lien waiver. Keep it protected with a GrayCo Care maintenance plan \\u2014 see Maintenance plans in your GrayCo Portal.", 2)

# ── the estimate's closing ──
once("""      'Thank you for the opportunity to earn your business<br>',   /* patch LOGO2: the company block is in the header */""",
     """      'Thank you for the opportunity to earn your business<br>',   /* patch LOGO2: the company block is in the header */
      '<span style="font-size:9pt">Keep it protected after we finish: ask about <b>GrayCo Care</b> maintenance plans (Bronze, Silver, Gold — monthly or yearly).</span><br>',   /* """ + MARK + """ */""")

open(p, 'w', encoding='utf-8').write(t)
print('MAINTDOCS: patched')
