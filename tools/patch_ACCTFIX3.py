#!/usr/bin/env python3
"""Idempotent patch ACCTFIX3 (r17j, on top of ACCTFIX2): the office's money flows in the ACCTGATE walkthrough.

1. ✅ Approvals → "🧾 Match this invoice" → pick the job → "Book it on this job": the booked sub invoice is the person's
   own action (window._gcManualNow), so the invoices list takes it at once. Before, the "hands off while she works" hold
   parked it as a background redraw while the picker was open: "✓ Booked" showed but the invoice was not on the job or
   in ▥ Invoices until the screen went quiet (and a push in between could go up without it).
2. ✅ Approvals → an expense the office may approve (routed to the office: no PM, or the PM had 24 h) now has its own
   "✅ Approve" (approve in place, 5 s undo), like the PM's. The office's list of expense approvals
   (_gcExpenseApprovalsFor) only held a PM's own ones, so the card fell back to "Open the APPROVE panel", whose panel had
   no button for it: the expense could not be approved from Approvals at all. The card is now drawn from the approval
   record itself (gc_expense_approvals) when the narrower list lacks it.
Usage: python3 tools/patch_ACCTFIX3.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
src = open(path, encoding='utf-8').read()
orig = src


def once(s, old, new, label):
    n = s.count(old); assert n == 1, ('ACCTFIX3: anchor count != 1', label, n)
    return s.replace(old, new)


M1 = '/* patch ACCTFIX3: booked by her own click */'
if M1 not in src:
    src = once(src, '  inv._jobCertain = true; inv._matchConfirmed = true; inv.matchedBy = myName(); inv.matchedAt = nowIso();\n  if (!addInvoice(inv)) return null;',
               '  inv._jobCertain = true; inv._matchConfirmed = true; inv.matchedBy = myName(); inv.matchedAt = nowIso();\n'
               '  try { if (typeof W._gcManualNow === \'function\') W._gcManualNow(\'book a matched sub invoice\'); } catch (e) {}   ' + M1 + '\n'
               '  if (!addInvoice(inv)) return null;', 'Match this invoice: place()')

M2 = '/* patch ACCTFIX3: the office expense card */'
if M2 not in src:
    src = once(src, "    arr(g.expense).forEach(function(e){ var a = X.filter(function(z){ return 'exp:' + s(z.id || z.expId) === e.id; })[0]; addMine(a ? rowExp(a, true, now) : stub(e, 'exp')); });",
               "    arr(g.expense).forEach(function(e){ var a = X.filter(function(z){ return 'exp:' + s(z.id || z.expId) === e.id; })[0];\n"
               "      if (!a) { try { a = arr(JSON.parse(localStorage.getItem('gc_expense_approvals') || '[]')).filter(function(z){ return z && 'exp:' + s(z.id || z.expId) === e.id && (z.status === 'pending_pm' || z.status === 'escalated'); })[0] || null; } catch (x) { a = null; } }   " + M2 + "\n"
               "      addMine(a ? rowExp(a, true, now) : stub(e, 'exp')); });", 'Approvals: expense rows')

if src == orig:
    print('ACCTFIX3: already patched'); sys.exit(0)
open(path, 'w', encoding='utf-8').write(src)
print('ACCTFIX3: patched', path)
