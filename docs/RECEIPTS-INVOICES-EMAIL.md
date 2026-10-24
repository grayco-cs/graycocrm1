# Receipts and sub invoices by e-mail (patch OWNERTODO)

Anyone can e-mail a receipt photo or PDF to **receipts@grayco-cs.com**. A sub can e-mail an invoice to **invoices@grayco-cs.com**.

- **Receipts** show on the office and admin To-Do as **📧 Receipts e-mailed in (N)**.
  - **🔍 Read the receipt** fills in the vendor, amount and date. If the subject has a job's PO, the job is picked too.
  - Check the job, then tap **✅ Confirm**. The expense is saved on the job with the receipt file.
  - **Not an expense** clears it.
- **Sub invoices** go on ▥ Invoices as a *received* sub invoice with the PDF, matched to the job by its PO when the subject or file name carries it. Approve them as usual.
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
