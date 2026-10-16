# Accounting — a quick tour

*For Brittany, Nick and Wesley. Written for the new Accounting screen (patch K).*

Click **📊 Accounting** in the left menu. The red number next to it is how many things are
waiting for you on the **To Match** tab.

Accounting now opens on **Home**: one page of cards, one card per job you do in here. Click
any card to open that section. The tabs across the top go to the same places:

| Tab | What it answers |
|---|---|
| 🏠 **Home** | The whole picture on one page. |
| ⬇ **Money In** | Who owes us, and how late is it? |
| ⬆ **Money Out** | What do we pay this Friday and next Friday? |
| 📅 **Next 8 Weeks** | Money expected in compared with money going out, week by week. |
| 🏗 **Job Profit** | Is each job making the margin it should? |
| 💰 **Profit & Loss** | Revenue, costs and profit for any period. Click a number to see the records behind it. |
| ✅ **To Match** | Everything that needs a person to look at it, in one list. |

Every older screen is still here, on the grey **More tools** row: Classic overview (the old
tiles, the Thursday payroll banner, PM pay cards, Money Owed and the pending change orders with
Approve/Decline), Classic P&L (with the Payment / Add Bill / Purchase buttons), Transactions
(card imports), Reports, Est vs Actual, Tax Center and Expense Center. Nothing was taken away.

## The bar at the top

- **Search**: type a customer, job, PO, invoice number or an amount. Only the open tab is
  filtered. Your words stay in the box even if the screen updates in the background.
- **Date range**: This month, Last month, This quarter, Last quarter, This year, Last year,
  All time, or Custom (pick two dates). It is remembered for **you**. When Nick picks a
  different range, yours stays the same. The range is used by Profit & Loss and Job Profit.
- **⬇ CSV**: downloads the tab you are on as a spreadsheet: the same rows, filtered the same
  way.
- **🖨 Print**: prints only the Accounting section, without the menu.

## Money In

The four boxes are the aging buckets: **Current & 1–30 days**, **31–60**, **61–90** and
**90+**, plus the total owed to us. Click a box to see only that bucket.

- **By customer** adds up what each customer owes, by bucket.
- **Every open invoice** lists each invoice with billed, collected and balance. Click the job
  name to open the job. Click the invoice number to open the invoice.
- Days late are counted from the invoice's **due date**. If an invoice has no due date, they
  are counted from the invoice date.
- **Balance = billed − collected on that invoice.** An invoice that was paid more than it was
  billed for shows as a **credit**.
- **✉ Remind** writes a polite payment reminder for you to read and change. **Nothing goes out
  by itself.** You choose either *Send from office@*, and the email program asks you once more
  before it sends, or *Open in my email app*.
- QuickBooks invoices that still need confirming are **not** counted here until somebody
  confirms them on To Match.

The total on this tab is the same number as "Outstanding AR" on the Classic overview.

## Money Out

This tab shows sub bills that are not paid yet, payroll runs that are set up, and card
payments, grouped as **Past its pay date**, **This Friday**, **Next Friday** and **Later**.

Sub bills follow the owner's rule:

- A bill **in by Wednesday** is paid the **following Friday**.
- A bill that comes in **Thursday to Sunday** is paid the **Friday after next**.
- Subs marked **"always this Friday"** are paid this Friday.
- A pay date typed on the invoice always wins.

Each sub bill appears **once**, however many rows describe it elsewhere. Bills still waiting
for approval are marked. Click an amount to open the bill or payroll.

Card payments show up here once a card has its **due day** saved in Credit Cards.

## Next 8 Weeks

Each row is one week, starting this Monday.

- **In**: open invoices on their due date (anything already late goes in this week), plus draw
  invoices that are drafted but not sent yet.
- **Out**: sub bills on their pay Friday, card payments, and payroll runs that already exist.
  Where no payroll run exists yet, there is a **payroll estimate** from each person's pay
  profile. **Overhead** comes from the monthly overhead list (a budget).
- Anything that is an **estimate** or a **budget** is labelled that way.
- **Running net** starts at $0. It is the change, not a bank balance. A week that goes below
  zero is shaded red.
- Nothing on this tab is saved. It is worked out fresh each time you open it.

Click a week to see every line in it.

## Job Profit

For each job you see:

- **Billed**: client invoices.
- **Costs**: every cost counted once. A sub bill is one cost, client payments are never costs,
  and refunds lower costs.
- **Profit** and **Margin** (profit ÷ billed).
- The **goal** for that type of job.
- **Contract + approved change orders**, and **% billed** of that contract.

The margin goals are **insurance 40%**, **residential 30%** and **commercial 20%**. Other job
types use the residential goal. To change them, click **⚙ Margin goals**; they live in that
one place.

A job is **highlighted** when:

- it is below its goal,
- its costs are higher than what we billed,
- it has no invoice yet, or
- costs are booked to a job that is no longer on file.

Use the drop-down to show only problem jobs or one type of job. Click any column heading to
sort by it. **Date range / All time** switches between the period at the top and the life of
the job.

## Profit & Loss

The statement reads from top to bottom:

1. **Revenue**
2. **Job costs**, broken down by category
3. **Gross profit**
4. **Company overhead**
5. **Costs not on a job yet**
6. **Net profit**

**Every amount can be clicked.** It opens the exact invoices or cost rows behind that number,
with links to each record and a CSV button. They always add up to the number you clicked.

- **Accrual (billed)** counts revenue on the invoice date. **Cash (collected)** counts it on
  the day the money came in. Costs are the same in both views, because the owners have not
  decided yet how unpaid costs should count.
- **PM view** (owners and office): pick a project manager to see that person's P&L. It
  includes only their jobs, and **company costs are left out**, as the PM rule says. A PM who
  opens Accounting sees only their own P&L.
- **By job** under the statement totals the same way Job Profit does, so the two always
  agree.

"Revenue" for *This year* is the same number as **Revenue (billed)** on the Dashboard. "Job
costs" for *This year* is the same as **Job Costs** on the Dashboard.

## To Match

This tab puts everything that needs a person in one list. Each row has the button that
resolves it.

| What | Button |
|---|---|
| **QuickBooks invoices to confirm** (not counted anywhere until confirmed) | *Confirm or not real…* |
| **QuickBooks import to-dos**: rows from a QuickBooks CSV that need a home | *Open* |
| **Duplicates and look-alikes** found by the duplicate check | *Review*. Folding keeps one record and nothing is deleted; Undo puts it back. |
| **Card transactions not matched** yet | *Match*, which opens Transactions |
| **Expenses waiting for approval** | *Approve…* or *Open* |

The red number in the left menu is the size of this list.

## Cash today (Wesley and Nick only)

Owners see a **"Connect bank & cards — coming"** card on Home. For everyone else that card
is not on the page at all. Bank balances, the cash-flow "set cash" figure (cash anchor) and
the two-account (Payroll / Cash) balances are shown **only** to someone the company sign-in
knows as an admin. The Cash Position, Cash Flow and Bank Accounts screens now refuse for
anyone else.

### Design note: how bank balances will arrive (not built yet)

- Balances will come from a Netlify function (for example
  `/.netlify/functions/bank-balances`). The function checks the caller's company sign-in
  token **on the server** and answers only if `gc_staff.role = 'admin'`. Anyone else gets a
  `403` and no numbers.
- The function asks the bank or card aggregator for live balances each time it is called.
  The balances are drawn on the Cash card and kept **only in memory** on that page. They are
  never written to `gc_kv`, IndexedDB, localStorage or any backup. Office computers never
  receive them.
- The aggregator's keys are stored as Netlify environment variables, never in `index.html`.
- **The hand-entered cash figures** (`gc_cash_anchor`, `gc_accounts_cfg`, `gc_accounts_ledger`)
  already work this way. They live in the owners-only table **gc_admin_kv**
  (`docs/admin-data.sql`). The database only lets someone whose `gc_staff` role is `admin` read
  or write it. The CRM no longer sends these records through `gc_kv`, and a non-admin computer
  never asks for them, never stores them, and empties any old copy it had.
- **Moving them over (one time):** Wesley or Nick runs `docs/admin-data.sql`. It copies the old
  values out of `gc_kv`. After checking that the Cash Flow and Bank Accounts screens show the
  right figures, run the one-line delete at the bottom of that file to remove the old `gc_kv`
  copies.

## Where things were → where they are now

| Before | Now |
|---|---|
| Accounting opened on the Overview tiles | Accounting opens on **Home**. The old tiles are on More tools → Classic overview. |
| Collections Desk pop-up (💎 menu) | **Money In** (aging by customer and invoice, with Remind). The pop-up still works. |
| "What do we pay Friday" (console only, `_gcSubsDue`) | **Money Out** |
| Cash Flow forecast pop-up (owners) | **Next 8 Weeks** (no bank balance in it, so everyone can use it). The owners' pop-up still works. |
| No margin view per job | **Job Profit** with goals by job type |
| P&L tab (no drill-down) | **Profit & Loss** with click-through, plus the old one under Classic P&L |
| Unmatched items spread over Transactions, Expense approvals, the Duplicates screen and the Office to-do | **To Match** (one list, with a count on the menu) |
