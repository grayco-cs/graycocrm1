#!/usr/bin/env python3
"""Idempotent patch ACCTFIX3 (r17j, on top of ACCTFIX2): the office's money flows in the ACCTGATE walkthrough.

1. ✅ Approvals → "🧾 Match this invoice" → pick the job → "Book it on this job": the booked sub invoice is the person's
   own action (window._gcHerOwnNow, new: the hold's own "hers" mark; not _gcManualNow, which also lets the list floor
   accept a cut for 20 s), so the invoices list takes it at once. Before, the "hands off while she works" hold
   parked it as a background redraw while the picker was open: "✓ Booked" showed but the invoice was not on the job or
   in ▥ Invoices until the screen went quiet (and a push in between could go up without it).
2. ✅ Approvals → an expense the office may approve (routed to the office: no PM, or the PM had 24 h) now has its own
   "✅ Approve" (approve in place, 5 s undo), like the PM's. The office's list of expense approvals
   (_gcExpenseApprovalsFor) only held a PM's own ones, so the card fell back to "Open the APPROVE panel", whose panel had
   no button for it: the expense could not be approved from Approvals at all. The card is now drawn from the approval
   record itself (gc_expense_approvals) when the narrower list lacks it. The approval records carry their own id
   ('expId:<expense>') beside expId; the cards matched on that id first, so no record ever matched its card (every
   expense card was the fallback): the match and the card key now use the expense id.
3. 💳 / 🏦 statement imports: the expenses they add reach the screen as her own work. The import finishes seconds after
   the click, so with the mouse moving the hold parked them: the P&L did not move, and the same statement imported
   again did not see its lines as "already in".
4. An expense or sub invoice approved or sent back stamps updatedAt, so the shared approval list keeps the decision when it merges with
   the cloud's older "waiting" copy (the card left, but the count and the other office computer still had it).
Usage: python3 tools/patch_ACCTFIX3.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
src = open(path, encoding='utf-8').read()
orig = src


def once(s, old, new, label):
    n = s.count(old); assert n == 1, ('ACCTFIX3: anchor count != 1', label, n)
    return s.replace(old, new)


# 0. the "hands off while she works" hold (it parks every list redraw that is not hers): one narrow way to say "this one
#    is hers" that does NOT touch _gcManualNow (which also lets the list floor accept a cut for 20 s)
M0 = '/* patch ACCTFIX3: her own work, for the hold only */'
if M0 not in src:
    src = once(src, 'function hersOwn(){',
               'window._gcHerOwnNow = function(){ lastManualNow = Date.now(); };   ' + M0 + '\nfunction hersOwn(){', 'hands-off hold')
HER = "try { if (typeof W._gcHerOwnNow === 'function') W._gcHerOwnNow(); } catch (e) {}"

# 1. Match this invoice -> Book it
M1 = '/* patch ACCTFIX3: booked by her own click */'
A1 = '  inv._jobCertain = true; inv._matchConfirmed = true; inv.matchedBy = myName(); inv.matchedAt = nowIso();\n'
OLD1 = A1 + '  try { if (typeof W._gcManualNow === \'function\') W._gcManualNow(\'book a matched sub invoice\'); } catch (e) {}   ' + M1 + '\n'
NEW1 = A1 + '  ' + HER + '   ' + M1 + '\n'
if NEW1 not in src:
    if OLD1 in src: src = once(src, OLD1, NEW1, 'Match: first cut')
    else: src = once(src, A1 + '  if (!addInvoice(inv)) return null;', NEW1 + '  if (!addInvoice(inv)) return null;', 'Match this invoice: place()')

# 1b. the statement / card imports put their expenses on the screen as her own work (they finish seconds after the click)
M1B = '/* patch ACCTFIX3: an import is her own work */'
if M1B not in src:
    a = '  try{ window.__GC_MANUAL_SAVE__=true; if(window._setExpenses) window._setExpenses(exp); }catch(e){}'
    assert src.count(a) == 2, ('ACCTFIX3: card charge expense writes', src.count(a))
    src = src.replace(a, "  try{ window.__GC_MANUAL_SAVE__=true; if(typeof window._gcHerOwnNow==='function') window._gcHerOwnNow(); if(window._setExpenses) window._setExpenses(exp); }catch(e){}   " + M1B)
    src = once(src, "    try { W.__GC_MANUAL_SAVE__ = true; if (typeof W._setExpenses === 'function') W._setExpenses(l); } catch (e) {}",
               "    try { W.__GC_MANUAL_SAVE__ = true; if (typeof W._gcHerOwnNow === 'function') W._gcHerOwnNow(); if (typeof W._setExpenses === 'function') W._setExpenses(l); } catch (e) {}   " + M1B, 'bank statement import')

M2 = '/* patch ACCTFIX3: the office expense card */'
ORIG2 = "    arr(g.expense).forEach(function(e){ var a = X.filter(function(z){ return 'exp:' + s(z.id || z.expId) === e.id; })[0]; addMine(a ? rowExp(a, true, now) : stub(e, 'exp')); });"
OLD2 = ("    arr(g.expense).forEach(function(e){ var a = X.filter(function(z){ return 'exp:' + s(z.id || z.expId) === e.id; })[0];\n"
        "      if (!a) { try { a = arr(JSON.parse(localStorage.getItem('gc_expense_approvals') || '[]')).filter(function(z){ return z && 'exp:' + s(z.id || z.expId) === e.id && (z.status === 'pending_pm' || z.status === 'escalated'); })[0] || null; } catch (x) { a = null; } }   " + M2 + "\n"
        "      addMine(a ? rowExp(a, true, now) : stub(e, 'exp')); });")
NEW2 = ("    arr(g.expense).forEach(function(e){ var a = X.filter(function(z){ return 'exp:' + s(z.expId || z.id) === e.id; })[0];\n"
        "      if (!a) { try { a = arr(JSON.parse(localStorage.getItem('gc_expense_approvals') || '[]')).filter(function(z){ return z && 'exp:' + s(z.expId || z.id) === e.id && (z.status === 'pending_pm' || z.status === 'escalated'); })[0] || null; } catch (x) { a = null; } }   " + M2 + "   /* the expense id first: the record's own id is 'expId:...' */\n"
        "      addMine(a ? rowExp(a, true, now) : stub(e, 'exp')); });")
if NEW2 not in src:
    if OLD2 in src: src = once(src, OLD2, NEW2, 'Approvals: expense rows (r17j first cut)')
    else: src = once(src, ORIG2, NEW2, 'Approvals: expense rows')
M3 = '/* patch ACCTFIX3: the card key is the expense id */'
if M3 not in src:
    src = once(src, "  var pid = s(a.jobId || a.pid), p = proj(pid), id = s(a.id || a.expId);",
               "  var pid = s(a.jobId || a.pid), p = proj(pid), id = s(a.expId || a.id);   " + M3, 'rowExp id')

# 4. an expense approved / sent back carries the time of that decision (updatedAt), so the shared list's merge (newest
#    updatedAt wins) keeps the decision instead of the older waiting copy coming back from the cloud
M4 = '/* patch ACCTFIX3: decided now */'
if M4 not in src:
    for st in ('approved', 'rejected'):
        src = once(src, "Object.assign({},a,{status:'" + st + "', approvedBy:myName(), approvedAt:new Date().toISOString()})",
                   "Object.assign({},a,{status:'" + st + "', approvedBy:myName(), approvedAt:new Date().toISOString(), updatedAt:new Date().toISOString()" + ("" if st == 'rejected' else "") + "})", 'expense ' + st)
    src = once(src, "window._gcApproveExpense = function(expId){", "window._gcApproveExpense = function(expId){   " + M4, 'approve expense')
    a4 = "      pmDecidedBy:who, pmDecidedAt:Date.now(), decidedBy:who,"
    assert src.count(a4) == 2, ('ACCTFIX3: sub decisions', src.count(a4))
    src = src.replace(a4, "      pmDecidedBy:who, pmDecidedAt:Date.now(), decidedBy:who, updatedAt:new Date().toISOString(),   " + M4)

if src == orig:
    print('ACCTFIX3: already patched'); sys.exit(0)
open(path, 'w', encoding='utf-8').write(src)
print('ACCTFIX3: patched', path)
