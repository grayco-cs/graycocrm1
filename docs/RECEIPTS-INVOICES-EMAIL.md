# Receipts and sub invoices by e-mail (patch OWNERTODO)

Anyone can e-mail a receipt photo or PDF to **receipts@grayco-cs.com**. A sub can e-mail an invoice to **invoices@grayco-cs.com**.

- **Receipts** show on the office and admin To-Do as **📧 Receipts e-mailed in (N)**.
  - **🔍 Read the receipt** fills in the vendor, amount and date. If the subject has a job's PO, the job is picked too.
  - Check the job, then tap **✅ Confirm**. The expense is saved on the job with the receipt file.
  - **Not an expense** clears it.
- **Sub invoices** are read and booked by themselves on the job their address matches (Word, PDF, photo, Excel, Google link or typed in the e-mail) — or wait in ✅ Approvals as *Match this invoice*. See **docs/SUBINV-SETUP.md** (patch SUBINV), which also covers office@.
- Nothing is sent to anyone. Data-entry mode makes no difference here.

## Setup (the groups receipts@ and invoices@ already exist)

1. **Resend → Domains → in.grayco-cs.com must show Verified** first.
2. **admin.google.com → Groups → receipts@ → Group settings:** turn ON **Allow members outside your organization**.
   - If it is greyed out: Apps → Google Workspace → Groups for Business → **Sharing settings** → tick **Group owners can allow external members**, then try again.
3. **receipts@ → Members → Add members:** `receipts@in.grayco-cs.com`.
4. Do the same for **invoices@**, with the member `invoices@in.grayco-cs.com`.
5. billing@ is an alias on office@: it needs no group.
6. **Test:** e-mail a receipt photo to receipts@grayco-cs.com. Within a minute it is on the To-Do under 📧 Receipts e-mailed in, and the 🔧 Owner setup step ticks itself.

Files:
- `netlify/functions/_lib/money-mail.js`: keeps the e-mail and its files in gc_kv `gc_mail_money`.
- `netlify/functions/bid-inbox.js`: hands receipts@ and invoices@ mail to money-mail.js.
- `index.html` tail `gc-patch-ownertodo`.

## E-mail addresses: what goes where

| Address | What goes there | What the CRM does |
|---|---|---|
| **leads@grayco-cs.com** | Every lead and every bid invitation or bid-board notice: BuildingConnected, PlanHub, plan rooms, public bid sites, GC invitation lists, and the website, Facebook and Google forms. Sign up for every bid site with leads@. | Read into Leads → 📥 Lead Inbox. Alerts go to the office. |
| **bids@grayco-cs.com** | Only our own bids going out, GC replies to them, and subcontractors' prices for bids we are pricing. | GC replies are filed on the bid; sub prices land in Leads → 📨 Sub bids. |
| **claims@grayco-cs.com** | Insurance carriers, TPAs and adjusters: claim correspondence and new assignments. Copy claims@ on insurance e-mail. | Filed on the claim. A new assignment becomes an insurance lead. |
| **invoices@grayco-cs.com** | Subcontractor and supplier bills and invoices. Forward any invoice you get to invoices@. | Filed under Invoices, waiting for approval. |
| **receipts@grayco-cs.com** | Staff e-mail receipt photos and PDFs. | Shows on the To-Do as "Receipts e-mailed in". Someone confirms it. |
| **billing@grayco-cs.com** | Customer invoices, statements and pay apps are sent from here. Customers reply here about payments. | Lands in office@ (Brittany). |
| **office@grayco-cs.com** | The main office mailbox. | Brittany reads it. |
| **orders@grayco-cs.com** | Supplier order confirmations. | Linked to the job: delivery, schedule, Materials arriving. |
| **estimates@grayco-cs.com** | Estimators e-mail a takeoff or estimate (Word, PDF, Excel) to the CRM. | Stored for the office to build the estimate. |
| **replies@ · portal@ · news@** | Send-only. The CRM sends from them (portal links, newsletters); replies@ is the Reply-To of automatic e-mails. | Nothing reads them by machine; people answer replies@. |

- Never sign up for bid sites with bids@ or your personal e-mail. Use leads@grayco-cs.com. Company service accounts (Twilio, Netlify, Resend, Supabase, Google Cloud, Meta, CompanyCam) are signed up with accounts@grayco-cs.com; replies@ is only the Reply-To of the CRM's e-mails.
- Forward any invoice you get to invoices@grayco-cs.com.
- Forward receipts (photo or PDF) to receipts@grayco-cs.com.
- Insurance correspondence: copy claims@grayco-cs.com.
- Tell subcontractors: invoices and pay requests go to invoices@, their prices for our bids go to bids@.
- Tell customers: payments and billing go to billing@, insurance claims go to claims@. Texts go to (901) 582-8255; the office line is (901) 585-0944.

Phone and text: text (901) 582-8255; office line (901) 585-0944. Tell subcontractors: send all invoices and pay requests to invoices@grayco-cs.com (include the job name/PO). Send your price for our bids to bids@grayco-cs.com.
