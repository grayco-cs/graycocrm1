# Receipts and sub invoices by e-mail (patch OWNERTODO)

Anyone can e-mail a receipt photo or PDF to **receipts@grayco-cs.com**. A sub can e-mail an invoice to **invoices@grayco-cs.com**.

- **Receipts** show on the office and admin To-Do as **📧 Receipts e-mailed in (N)**.
  - **🔍 Read the receipt** fills in the vendor, amount and date. If the subject has a job's PO, the job is picked too.
  - Check the job, then tap **✅ Confirm**. The expense is saved on the job with the receipt file.
  - **Not an expense** clears it.
- **Sub invoices** go on ▥ Invoices as a *received* sub invoice with the PDF, matched to the job by its PO when the subject or file name carries it. Approve them as usual.
- Nothing is sent to anyone. Data-entry mode makes no difference here.

## Setup (once, about 10 minutes)

1. **admin.google.com → Directory → Groups → Create group:**
   - `receipts@grayco-cs.com`
   - `invoices@grayco-cs.com`

   For each one, set **Access settings → Who can post: Anyone on the web** (subs and stores are outside GrayCo).
2. **Add the CRM's copy address as a member of each group:**
   - receipts@ → `receipts@in.grayco-cs.com`
   - invoices@ → `invoices@in.grayco-cs.com`

   Add office@ too if the office wants its own copy.
3. **Resend:** nothing new. `in.grayco-cs.com` already delivers to the CRM's mail webhook, the same one as bids@, leads@ and orders@. It has to show **Verified** in Resend → Domains.
4. **Test:** e-mail a receipt photo to receipts@grayco-cs.com. Within a minute it is on the To-Do under 📧 Receipts e-mailed in, and the 🔧 Owner setup step ticks itself.

Files:
- `netlify/functions/_lib/money-mail.js`: keeps the e-mail and its files in gc_kv `gc_mail_money`.
- `netlify/functions/bid-inbox.js`: hands receipts@ and invoices@ mail to money-mail.js.
- `index.html` tail `gc-patch-ownertodo`.
