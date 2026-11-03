#!/usr/bin/env python3
"""Idempotent patch FIELDTAP2 (owner 11/03, a screenshot of the Field job page, ROTC Cordova):
  1. "There are 2 financial buttons, delete the last one." The 💰 Job Financials tile goes; 💰 Financials, Invoices & COs
     stays. Nothing is lost: that sheet (contract, change orders, invoiced, paid, costs, profit / margin for those who
     may see it, the invoices, the change orders, ＋ New invoice, ✨ New change order) already ends with
     "💰 The job's full money page" — the very screen Job Financials opened (window._gcJobFinancials).
     Only when the person has the Financials tile (otherwise Job Financials stays, so no one loses the page).
  2. The floating dark ⚙ over the tiles: #gc-br-settings, the desk's "CRM Settings" button (window.gcSettings: contract
     templates, AI proxy …). In Field its panel opened BEHIND the Field screens (z-index 9600 under 99980), so the tap
     did nothing there. Hidden on every Field screen (it was hidden on the Field home only); on the desk it stays in the
     top-right toolbar, and 🖥 Desk view reaches it from the phone.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '__GC_PATCH_FIELDTAP2__'
if MARK in t:
    print('FIELDTAP2: already patched'); sys.exit(0)


def rep(t, old, new, n=1):
    c = t.count(old)
    assert c == n, ('FIELDTAP2 anchor found %d times (want %d): %r' % (c, n, old[:120]))
    return t.replace(old, new)


# 1. FIELDPORTAL's job tiles: no separate 💰 Job Financials when 💰 Financials, Invoices & COs is there
t = rep(t, """    .filter(Boolean);   /* owner 10/30: no separate GrayCo Photos tile -- 📷 Add Photo/File is GrayCo Photos */
""", """    .filter(Boolean);   /* owner 10/30: no separate GrayCo Photos tile -- 📷 Add Photo/File is GrayCo Photos */
  /* __GC_PATCH_FIELDTAP2__ (owner 11/03 "2 financial buttons, delete the last one"): 💰 Job Financials goes when 💰 Financials,
     Invoices & COs is there — its sheet ends with "💰 The job's full money page" (the same _gcJobFinancials screen) */
  if (pm.photos && by.jobfin) { order = order.filter(function(b){ return b !== by.jobfin; }); by.jobfin.remove(); }
""")
# 2. the desk's floating ⚙ CRM Settings: not on any Field screen
t = rep(t, """    'html:has(#_gcJobPick.gc-fh) #gcu-pick-btn,""", """    'html._fieldmode #gc-br-settings,html.gc-fh-on #gc-br-settings{display:none!important}',   /* patch FIELDTAP2: the desk's ⚙ CRM Settings, not over the Field tiles */
    'html:has(#_gcJobPick.gc-fh) #gcu-pick-btn,""")

open(p, 'w', encoding='utf-8').write(t)
print('FIELDTAP2: patched')
