# Money in by itself (patch MONEY, 10/30)

Owner: *"make sure invoices to clients and from subs go directly into invoices from email/crm when they send them to my
emails"* and *"can we make sure marketing P&L, credit card entry, expenses and matching has all features and is easy"*.

## What happens to an e-mailed invoice or receipt

| It is… | Where it can arrive | It becomes | Placed on the job by |
|---|---|---|---|
| A **sub's invoice** | invoices@, office@ / billing@, Wesley's, Nick's or a PM's inbox | ▥ Invoices: a received sub invoice, PDF attached, waiting on the sub-invoice approval (PM → office after 24 h). The check is drafted for the pay date only after approval. | 1. the CRM PO on the invoice or in the e-mail ("PO A101"), 2. the job-site address, 3. the sub's only open job |
| A **supplier's bill** (lumber, supply house, rentals) | the same | Expenses: one **pending** expense on the job, file attached, normal expense approval | the same: PO, then address |
| A **receipt** | receipts@ (and office@) | Expenses: a pending expense on the job, receipt attached | the PO in the subject / receipt, then the address |
| **QuickBooks' copy** of GrayCo's own invoice | invoices@ or office@ | ▥ Invoices: a sent client invoice on the job (the same invoice # is never added twice) | the address / customer on the invoice |

Anything the CRM is not sure of goes to **To-Do → 📥 Needs a job** (office and admins) with its best guess and why.
A sub's invoice there opens the usual 🧾 *Match this invoice* picker. Nothing is lost and nothing is booked twice.
Duplicates are caught by the same sub + invoice #, the same amount on the same job within 30 days, the same file, and
for supplier bills the same vendor + amount within 3 days in Expenses.

The office could not see e-mailed invoices before: `gc_mail_money` is admin-only in Supabase (docs/email-all.sql), so the
office's list was always empty. The CRM now reads it through `/.netlify/functions/bid-inbox?moneymail=1` (admins and the
office only).

## Google steps (only one is needed)

**A. Recommended: turn on 🌐 All GrayCo e-mail** (docs/EMAIL-ALL.md, about 15 minutes, a Google Workspace admin + Netlify).
The CRM then reads office@ (and billing@, which lands there) for invoices, receipts and orders, and every other GrayCo
inbox it syncs (Wesley, Nick, the PMs) for **invoices only**. It reads only; nothing is sent, moved or deleted.
`MONEY_INVOICE_ALL=0` on Netlify turns the personal inboxes off.

**B. Without the service account: a Gmail routing rule** (5 minutes, admin.google.com, as a super admin):

1. admin.google.com → **Apps → Google Workspace → Gmail → Compliance** → **Content compliance** → **Configure**.
2. Name: `Invoices to the CRM`. **Email messages to affect:** tick **Inbound** and **Internal - receiving**.
3. **Add expressions that describe the content you want to search for:** choose **If ALL of the following match** → Add:
   - *Advanced content match* → Location **Subject** → **Matches regex** →
     `(?i)\b(invoice|inv ?#|bill|statement|pay ?app|amount due|balance due|draw request)\b`
   - *Advanced content match* → Location **Sender header** → **Not matches regex** → `(?i)@grayco-cs\.com`
4. **If the above expressions match, do the following:** **Modify message** → **Also deliver to** → **Add more recipients**
   → Add → **Basic** → `invoices@in.grayco-cs.com` → Save.
5. Leave "Envelope filter" off so it covers office@, billing@, wjohnson@, nthomas@ and the PMs. Save.
6. Test: from a personal address, e-mail a PDF invoice with "Invoice" and a CRM PO in the subject to wjohnson@. Within a few
   minutes it is on the job in ▥ Invoices (or in 📥 Needs a job).

Both can run together: the same e-mail is kept once (Message-ID and file fingerprint).

**QuickBooks invoices:** QuickBooks → ⚙ → Account and settings → **Sales → Messages** → Edit → Bcc new invoices to
`invoices@grayco-cs.com` → Save. (The QuickBooks webhook in money-intake.js is another way: set `QB_WEBHOOK_VERIFIER`
and `CRM_DRAIN_TOKEN` on Netlify and add `https://crm.grayco-cs.com/.netlify/functions/money-intake?qb=1` as the webhook
in the Intuit developer portal. Today neither is set.)

## Card statements, vendor rules, matching

- **PDF statements (patch STMTPDF).** 💳 Import card statement and **🏦 Import bank statement** (To-Do and 💎) take the bank's
  **PDF** statement as it comes from the website (or its CSV, or pasted lines). Every line is shown first with the statement's
  own previous → new (beginning → ending) balance check; a ⚠ appears when the lines do not add up. A line already in the CRM
  (same card / account, date, amount — e.g. the CSV and then the PDF of one statement) is marked and not added again.
  Bank statements: checks (check # kept), withdrawals and debit-card buys become paid expenses on their jobs; deposits and
  payments to a credit card are listed but not imported. A scanned (picture) PDF cannot be read: download the CSV instead.
  The office's 🧾 bank check needs docs/office-full-access.sql (the screen says "Ask Wesley to finish the database setup").
  The other doors (Credit Card Entry, 💳 Credit cards, Expenses → 📊 CC Statement, the Expense Center, 🏦 Bank Accounts,
  Monthly Bank Check) say what they do and hand a PDF to these two. Test: `node tools/tests/test_STMTPDF.mjs <build-dir>`.
- **To-Do → 💳 Import card statement** (also 💎 → 💳 Import card statement). A CSV from the bank site (Chase, Amex,
  Capital One, Citi, Bank of America, Wells Fargo, Discover, US Bank: date + description + amount, or debit / credit
  columns, header or not) or the lines copied out of a PDF statement. Payments to the card are left out.
- Each charge gets a **category** and a **job**: the CRM PO in the memo → your rule for that vendor → the open job at an
  address in the memo → the vendor's usual job in the last 60 days. Change any, then Import.
- What you pick is remembered in gc_kv `gc_money_rules` (vendor → category → job / overhead). Next month it fills itself.
- A charge with no job waits in **📥 Needs a job**; ✨ *Use the suggestions* places every one the CRM is sure of.
- Charges go through the existing card code: the expense list (job costs, P&L), the card's own list, the register. The
  same charge entered twice (by hand and off the statement) is merged.

## Marketing P&L

📣 Marketing → 📊 Dashboard counts, per source: leads (from each lead's Source), won jobs, revenue, ad spend, cost per
lead, cost per won job, ROI. Ad spend now also comes from the books: an expense or card charge in Advertising/Marketing,
or to Google Ads, Facebook / Meta, Angi / HomeAdvisor, Thumbtack, Nextdoor, Roof Ignite, TikTok… counts as that source's
spend for its month, unless spend for that source and month was typed in or imported there (that wins, never doubled).

## What to set up in Accounting once

These are also on the admins' To-Do under 🔧 Owner setup → *Accounting — set up once*.

1. **Cards and bank accounts.** 💎 → 💳 Credit cards → *Add a card* (name + last 4) for every company card.
   💎 → 🏦 Bank Accounts → add each checking / savings account. (Production has no cards on file today.)
2. **Last month's card statements.** Bank website → the card → Statements / Activity → Download → CSV. To-Do →
   💳 Import card statement → pick the card → choose the file → *Read the statement* → check the jobs → *Import*.
3. **Vendor rules.** In that first import set the category and job (or Overhead) for each regular vendor. Remembered.
4. **Categories.** Accounting → 🧾 Expense Center → keep one list that matches the QuickBooks chart of accounts:
   Materials, Subcontractor, Equipment Rental, Fuel/Gas, Permits/Fees, Dumpster/Disposal, Advertising/Marketing,
   Software/Phone, Office Supplies, Meals, Travel, Insurance, Payroll, Rent/Lease, Utilities.
5. **Marketing sources and monthly budgets.** 📣 Marketing → 📊 Dashboard → ad spend: one line per source per month, or
   put the ad charges on the card in Advertising/Marketing. Make sure every lead has a Source.
6. **Opening balances (1/1/2026).** Each bank account: the balance on the December 2025 statement. Each card: what was owed.
7. **2025 from QuickBooks.** 💎 → ⏸ Data-entry mode → on. QuickBooks → Reports → *Transaction Detail by Account*
   (1/1–12/31/2025), *Invoice List*, *Bill List* → Export → CSV. 💎 → 📥 Import from QuickBooks (CSV) → tick
   *Import as history* → each file. Then ▶ Resume sending.
8. **QuickBooks copy of every invoice** → invoices@ (above).
9. **Invoices sent to anyone's e-mail** → Google step A or B (above).

## Files

- `netlify/functions/_lib/subinv.js` — PO first (`poJob`), the sub's open jobs (`subOpenJobs`), supplier vs sub
  (`payeeKind`, `ccw_suppliers`), Expense duplicates (`findExpDup`), QuickBooks' own invoices (`ownInvoice`, `clientDup`).
- `netlify/functions/_lib/money-mail.js` — receipts and QuickBooks invoices are read and placed too.
- `netlify/functions/_lib/money-box.js` — every synced inbox, invoices only (`MONEY_INVOICE_ALL`).
- `netlify/functions/bid-inbox.js` — `?moneymail=1` (office + admins); ping shows where invoices / receipts are read.
- `index.html` `gc-patch-money` (tools/patch_MONEY.py, tools/money_tail.js).
- Tests: `node tools/tests/test_MONEYMAIL.mjs`, `node tools/tests/test_MONEY.mjs <build-dir>`.
