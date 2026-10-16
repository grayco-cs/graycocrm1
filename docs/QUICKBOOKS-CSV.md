# Loading QuickBooks into the CRM (CSV)

💎 menu → **Import from QuickBooks (CSV)** → pick the file. (The old buttons on the QuickBooks page now open the same import.)

Nothing is written until you press **OK**. First you see what the CRM found:

- which report it recognised and which column went where (e.g. `Num → num`, `Name → name`)
- **matched** — already in the CRM; only blank fields are filled in (nothing typed in the CRM is overwritten)
- **new, no job** — clear new records (an invoice for a customer the CRM knows). QuickBooks has customers, not jobs, so they come in with no job
- **office to-dos** — rows that did not find a full home
- **skipped** — already in the CRM, or already imported before

Importing the same file twice changes nothing. Every row is matched by its QuickBooks number first (invoice number + customer), then by customer + amount + date, so it never makes a second copy.

## Which reports to export from QuickBooks Online

Do this in QuickBooks Online: **Reports** → search for the report → set the dates to **All Dates** (or the period you want) → **Run report** → **Export** (the arrow icon at the top right) → **Export to CSV**. If you only see Excel, export to Excel and then save the file as CSV.

| Report | What it gives the CRM |
|---|---|
| Transaction List by Date | Invoices, payments, bills, bill payments, expenses, checks, credit memos, deposits |
| Invoice List | Invoices with due date, open balance and status |
| Sales by Customer Detail | Invoices (the product lines are added up per invoice) |
| Open Invoices / A/R Aging Detail | Unpaid invoices and their open balance |
| Customer Contact List | Customers: email, phone, address (they go to Customers, never to the job board) |
| Vendor Contact List | Vendors and subs: email, phone, address |

QuickBooks menu names change from time to time. If you can't find one, type its name into the search box on the Reports page.

## The office to-do list

Every row that does not fit goes to the **top** of the Office To-Do list, under **"QuickBooks import — needs a home (N)"**. Each to-do shows:

- what the row is (type, number, customer, amount, date)
- why it did not fit (no such customer, no job, two possible matches, an amount that disagrees with the CRM, a type the CRM doesn't use)
- the best candidates

From the to-do you can **Link** it to a candidate, **Link to job**, **Link to customer**, **Create customer**, or **Mark not needed**. Resolving it closes the to-do.

**"QuickBooks invoices to confirm (N)"** sits above it. These are invoices that were only found on a QuickBooks customer that was removed. They do not count in any total until someone presses **Confirm**. **Not real** folds them away (Undo is in 💎 → Duplicate check).
