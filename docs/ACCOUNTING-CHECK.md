# Accounting check — night of Oct 22–23, 2026 (patch ACCT)

Before the office back-enters 2025 from QuickBooks, every place money comes into the CRM was checked again. Every
number was compared two ways: by the CRM's own screens and by adding the records up independently. All the tests run
offline on test data. No real customer was e-mailed and nothing went to QuickBooks.

## What was checked and ties out

| Area | Result |
|---|---|
| Accounting home (Money in / AR aging, P&L, Job profit, Money out, 8 weeks) on a copy of the real books | AR aging = billed − collected per invoice ($448,775.41 both ways); P&L revenue = Dashboard revenue ($681,297.15); job costs = Dashboard ($282,970.50); net = revenue − costs; P&L by job = Job profit ($398,326.65); drill-downs add up to their totals; office sees no cash / bank numbers |
| QuickBooks Invoice List of 2025, imported as history | paid, partial and open kept; on the job only when the customer has exactly one job (a GC with two jobs is never guessed); cents exact; importing the same file again adds nothing |
| History never mails | invoice e-mail sweep, final-invoice reminders (today and 40 days later), monthly statements, review requests, warranty, maintenance: nothing queued or sent for an imported invoice; a normal new invoice still is |
| Approvals | importing makes no approval of any kind (customer approvals, internal invoice approvals) |
| Job numbers | the Expenses tab's 📊 Job P&L, the job's number strip and the commission engine use the same billed and spent totals |
| 📥 Expense inbox | only costs come in from a P&L Detail / Transaction Detail export; "(1,234.56)" and "1,234.56" read right; the same export twice adds nothing |
| Money duplicates | the 33.87 sweep may only merge rows the identity rules agree are one (two different invoice numbers, two different subs, two rows a person typed are never merged); every merge is undoable from 💎 → Duplicate check |

## Bugs found and fixed tonight (patch ACCT)

1. **Open 2025 invoices turned into drafts.** The invoice clean-up said "never sent → draft" about an imported invoice.
   Every open or partly paid 2025 invoice dropped out of *Money in*, revenue and the job's billed total, and was put on
   the internal "approve this invoice" list. A history invoice now carries the date QuickBooks sent it, and is never
   queued for invoice approval.
2. **2025 payments landed in October 2026.** A paid history invoice got today as its paid date, so the cash-basis P&L
   counted 2025 money as this month's. It now keeps its QuickBooks date.
3. **Old jobs would have paid commission again.** "Paid in full → commission" runs every 2 minutes. Once the office put
   expenses on a 2025 job, it would have worked out the PM's split again and scheduled a check for money already paid
   in 2025. A history job (or one whose every payment is QuickBooks history) is now held with a reason. An admin can
   still work it out on purpose.
4. **The expense inbox took income as costs.** A P&L Detail export has an Income section (invoices, payments,
   deposits). Those rows were coming in as expenses and doubling job and company costs. Income rows and income
   transaction types are now skipped.
5. **Two real identical purchases became one.** Two $60.10 fuel stops at the same station on the same day (no
   QuickBooks number) were treated as a duplicate, so costs came out low. Copies are now counted. The same export
   imported twice still adds nothing.
6. **Partial payments were not counted.** *Money in* and the cash P&L ignored a partial payment recorded on the invoice
   (how QuickBooks history arrives). A $1,800 invoice with $800 open showed $1,800 owed. They now use the paid part.
7. **Job P&L "Invoiced / Paid" disagreed with the job strip.** The Expenses-tab P&L counted draft and void invoices and
   ignored partial payments. It now uses the same billed total as the strip and the commission engine, and counts
   partial payments.
8. **A Transaction List made hundreds of to-dos.** Every 2025 expense, check, deposit and bill payment in a Transaction
   List became its own Office To-Do. Now a payment in the same file pays its invoice, and the rest make **one**
   summary to-do pointing at 📥 Expense inbox.

## Known and not changed tonight

- Opening Accounting takes about 1.4 s of work on the test machine; typing in its search box is sometimes slow. Both
  were already slow before tonight. This is speed only; every number is right.
- The QuickBooks Online live connection (Connect QuickBooks) was not used for 2025. Use the CSV exports below.
- A payment in a Transaction List with no invoice of its own in the same file is counted in the summary to-do and not
  matched. Use the **Invoice List** export for 2025 invoices: its Open Balance column already includes every payment.

## What the office must do differently

- **Put the job's PO in the QuickBooks memo** (e.g. `H393 drywall`) on bills, checks and card expenses. The expense
  inbox suggests the job from the PO, and a GC with several jobs (A & B Construction) can only be told apart by it.
- **Invoices go through 💎 → Import from QuickBooks (CSV). Expenses go through 📥 Expense inbox.** Don't drop an expense
  report into the invoice import, or the other way round.
- A customer with two or more jobs: the 2025 invoices wait on the Office To-Do under "needs a home". Pick the job by
  PO / street. The CRM will not guess.

## 2025 import day — office checklist

1. **💎 → ⏸ Data-entry mode → ON.** The amber bar shows at the top. (Importing as history sends nothing anyway; this
   also stops anything else from going out while you work.)
2. **Customers first.** In QuickBooks: Reports → *Customer Contact List* → All dates → Export to CSV. In the CRM:
   💎 → Import from QuickBooks (CSV) → pick the file → check the counts → OK.
3. **Vendors / subs.** QuickBooks: *Vendor Contact List* → CSV → same import.
4. **2025 invoices.** QuickBooks: *Invoice List*, dates **Jan 1 – Dec 31, 2025**, with the **Open Balance** column →
   CSV. CRM: 💎 → Import from QuickBooks (CSV). Make sure **"Import as history (no sending)" is ticked** (it is by itself
   for a 2025 file) → OK.
5. **Office To-Do → "QuickBooks import — needs a home".** Give each waiting invoice its job (customers with more than
   one job). Tip: type the PO or street in the job box.
6. **2025 costs.** QuickBooks: *Transaction Detail by Account* (or *Profit and Loss Detail*), Jan 1 – Dec 31, 2025 →
   CSV. CRM: To-Do → 📥 Expense inbox → drop the file. Only costs come in. Put each row on its job (the job is
   suggested from the PO in the memo), or mark it overhead.
7. **Receipts:** 💳 Enter expenses for anything not in QuickBooks; drop the receipt photo on its row.
8. **Check the numbers:** Accounting → 💰 Profit & Loss with the range *Last year* (2025) against QuickBooks' 2025 P&L.
   Revenue and costs should be close; a gap is usually a row still waiting in the expense inbox or the "needs a home"
   list. 📋 *Jobs with no expenses yet* lists jobs still missing costs.
9. **Lead cleanup** (Leads → 🧹 Clean up) and **Approvals → "Approve all as record-only"** for anything old.
10. **💎 → ⏸ Data-entry mode → OFF** only when you start running the business in the CRM.

Importing the same file twice is safe: nothing is added the second time.
