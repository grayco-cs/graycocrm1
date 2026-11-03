#!/usr/bin/env python3
"""Idempotent patch BULKDROP2: what a PERSON drops in 📥 Drop invoices & receipts is booked — not held by an automation switch.
Since patch AUTOPANEL (r17o) the ⚡ switch "E-mailed invoice auto-booking" (mailed_invoice_booking, OFF by default) is checked by
OWNERTODO's makeInvoices() and MONEY's process(). patch BULKDROP booked its files by calling makeInvoices() — so with the switch
OFF nothing the office dropped was booked: no sub invoice in ▥ Invoices, no pending job cost, nothing in ✅ Approvals' sub queue,
no pending expense; the drop summary still said "6 sub invoices to Approvals, 5 expenses booked".
Owner's rule: nothing AUTOMATIC unless he turns it on — a person's deliberate action still works. Dropping files is the office
choosing those files, so:
  1. BULKDROP books each placed file itself, one record at a time, right after the server placed it (also when the queue resumes
     after the window was closed — still the person's own drop, finishing on their computer): a certain sub invoice → ▥ Invoices
     (received) + its pending job cost (patch SUBINV), a certain receipt / supplier bill → a PENDING expense (patch MONEY).
     makeInvoices() is still called after it (it refreshes the lists 📥 Needs a job reads); its own booking of e-mailed ones
     stays behind the switch — OFF, a drop books nothing but the dropped files.
     The CRM still loading → the file waits and tries again (never marked done unbooked).
  2. SUBINV exports add(inv) (its own addInvoice: the invoice + its pending job cost, once); MONEY exports bookOne(rec, by)
     (one certain receipt / supplier bill / client invoice, the same bookExpense / bookClientInvoice). Neither checks the switch:
     only their callers that run by themselves (makeInvoices, process) do, unchanged.
  3. A file that fit two lines equally (not attached) says so on its row: "possibly a duplicate: 2 lines fit (same vendor and
     amount)" instead of only "no job matched".
Usage: python3 tools/patch_BULKDROP2.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch BULKDROP2'
if MARK in t: print('BULKDROP2: already patched'); sys.exit(0)
R = []

# 2a. SUBINV: export add (the invoice + its pending job cost, once)
R.append(("""W._gcSubInv = { take: take, post: post, load: load,""",
"""W._gcSubInv = { take: take, post: post, add: addInvoice,   /* patch BULKDROP2: a person's drop books its own invoice */ load: load,"""))

# 2b. MONEY: bookOne — one certain record, for a person's drop (the switch is checked by process(), not here)
R.append(("""/* patch SUBINV keeps the SUB invoices; suppliers / receipts / client invoices are booked here instead (an Expense / a client invoice) */
function hookSubInv(){""", """/* patch BULKDROP2: ONE record a person dropped (📥 Drop invoices & receipts) — booked now when it is certain. The ⚡ switch
   "E-mailed invoice auto-booking" is for what arrives by itself (process() above); a person's drop is not held by it. */
function bookOne(rec, by){
  var si = rec && rec.si; if (!si || isDone(rec, P.done) || si.route !== 'book' || !si.job || !proj(si.job.pid)) return null;
  if (rec.kind === 'receipt' || si.payee === 'supplier') return bookExpense(rec, { pid: si.job.pid, why: si.job.why, by: by });
  if (rec.kind === 'client_invoice' || si.payee === 'client') return bookClientInvoice(rec, { pid: si.job.pid, by: by });
  return null;
}
/* patch SUBINV keeps the SUB invoices; suppliers / receipts / client invoices are booked here instead (an Expense / a client invoice) */
function hookSubInv(){"""))
R.append(("""process: process, mkSpend: mkSpend""", """process: process, bookOne: bookOne,   /* patch BULKDROP2 */ mkSpend: mkSpend"""))

# 1. BULKDROP: book this file itself (no makeInvoices(): it is switch-gated and would book other waiting e-mails when ON)
R.append(("""function bookSoon(){ if (bookT) return; bookT = later(function(){ bookT = null; try { if (W._gcMoneyMail && W._gcMoneyMail.makeInvoices) W._gcMoneyMail.makeInvoices(); } catch (e) { try { console.warn('[GC] bulk drop: booking', e); } catch (x) {} } }, 400); }""",
"""function bookSoon(){ if (bookT) return; bookT = later(function(){ bookT = null; try { if (W._gcMoneyMail && W._gcMoneyMail.makeInvoices) W._gcMoneyMail.makeInvoices(); } catch (e) { try { console.warn('[GC] bulk drop: booking', e); } catch (x) {} } }, 400); }
/* patch BULKDROP2: the person's drop books THIS file now (owner: "nothing automatic unless I turn it on" — a person's action still
   works). Not held by the ⚡ "E-mailed invoice auto-booking" switch, and it books nothing else that waits. false = the CRM is
   still loading: the file waits and tries again. */
function bookMine(rec, out){
  try {
    if (out.k === 'subinv') {
      if (typeof W._setInvoices !== 'function' || typeof W._setExpenses !== 'function' || !W._gcSubInv || !W._gcSubInv.add) return false;
      var tk = W._gcSubInv.take(rec, { invoices: arr(crm().invoices), expenses: arr(crm().expenses) });
      if (tk && tk.inv) W._gcSubInv.add(tk.inv);
      return true;
    }
    if (out.k === 'expense') {
      if (typeof W._setExpenses !== 'function' || !W._gcMoney || !W._gcMoney.bookOne) return false;
      W._gcMoney.bookOne(rec, myName());
      return true;
    }
  } catch (e) { try { console.warn('[GC] bulk drop: booking', e); } catch (x) {} return false; }
  return true;
}"""))
R.append(("""    if (out.k === 'dup') { try { if (W._gcMoneyDone) W._gcMoneyDone(rec.id, { done: true, skip: true, why: 'duplicate (bulk drop)', at: nowIso(), by: myName() }); } catch (e) {} }
    else bookSoon();
    return finish(it, out);""", """    if (out.k === 'needs' && it.amb && !/duplicate/i.test(out.why)) out.why = 'possibly a duplicate: ' + it.amb + ' lines fit (same vendor and amount) — not attached; ' + out.why;   /* patch BULKDROP2 */
    if (out.k === 'dup') { try { if (W._gcMoneyDone) W._gcMoneyDone(rec.id, { done: true, skip: true, why: 'duplicate (bulk drop)', at: nowIso(), by: myName() }); } catch (e) {} }
    else if (!bookMine(rec, out)) { it.placeTries = (it.placeTries || 0) + 1; it.wait = Date.now() + Math.min(60000, 5000 * it.placeTries); it.note = 'waiting — the CRM is still loading'; return save(it); }   /* patch BULKDROP2: booked here, by the person's drop */
    if (out.k !== 'dup') bookSoon();   /* patch BULKDROP2: still refreshes SUBINV / MONEY's lists (📥 Needs a job shows the new ones); its own booking stays behind the ⚡ switch */
    return finish(it, out);"""))

# 3. the row says "possibly a duplicate" when two lines fit equally
R.append(("""    if (hit && hit.ambiguous) it.note = hit.ambiguous + ' lines fit — not attached';""",
"""    if (hit && hit.ambiguous) { it.note = hit.ambiguous + ' lines fit — not attached'; it.amb = hit.ambiguous; }   /* patch BULKDROP2: kept for the row's why */"""))

for old, new in R:
    assert t.count(old) == 1, ('BULKDROP2 anchor', t.count(old), old[:90])
for old, new in R:
    t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('BULKDROP2: patched', p)
