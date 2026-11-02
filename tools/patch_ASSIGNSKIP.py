#!/usr/bin/env python3
"""Idempotent patch ASSIGNSKIP: QuickBooks / CompanyCam importer rows for existing customers make no "👤 Assign this
lead" card.

Measured on the live mirror (10/30): 40 of the 42 leads behind "Assign this lead" cards were importer rows (LQB_ /
LCC_: a QuickBooks customer or CompanyCam project kept off the job board and filed as a lead) -- 37 of them are on the
Customers list and all 40 have a job for that client (Altus Construction V579, S.W. Eavenson C221, Vanderbilt mortgage
and Finance D615 ...). The Leads screen already leaves exactly these out as "📦 Imported" (patch LCLEAN importedL: an
LQB_ / LCC_ / LCCR_ row that never became an inquiry -- no inbox item, contact, estimate, bid due, stage, value or
activity beyond import / priority / assign).
Now "Assign this lead" uses the same rule (window._gcLeadNC.imported): those rows make no card. Narrow on purpose:
  * only rows the Leads screen treats as 📦 Imported; the moment one becomes an inquiry it gets its card again;
  * a real new lead from any source (website, text, inbox, CompanyCam "PM lead", ...) still gets its card;
  * an imported row a person assigned still counts as the lead's assignment (ASSIGNFIX copies).
Usage: python3 tools/patch_ASSIGNSKIP.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch ASSIGNSKIP'
if MARK in t:
    print('ASSIGNSKIP: already patched'); sys.exit(0)

def rep(name, old, new, count=1):
    global t
    n = t.count(old)
    assert n == count, 'ASSIGNSKIP %s: expected %d, found %d' % (name, count, n)
    t = t.replace(old, new)

rep('needsAssign',
    "  if (W._gcLeadHold && W._gcLeadHold.isHeld(l)) return false;   /* patch LEADHOLD: the one \"⏳ N new leads waiting\" card instead */",
    "  if (W._gcLeadHold && W._gcLeadHold.isHeld(l)) return false;   /* patch LEADHOLD: the one \"⏳ N new leads waiting\" card instead */\n"
    "  try { if (W._gcLeadNC && typeof W._gcLeadNC.imported === 'function' && W._gcLeadNC.imported(l)) return false; } catch (e) {}   " + MARK + ": a QuickBooks / CompanyCam importer row the Leads screen files under 📦 Imported (an existing customer, not an inquiry) */")

open(p, 'w', encoding='utf-8').write(t)
print('ASSIGNSKIP: patched')
