# Sub invoices booked by themselves (patch SUBINV)

Owner, 10/27: *"when there's an invoice like this in office@ or invoices@: read the PDF, enter it into the job that its
address matches, calculate the expense on the job's P&L, and create the invoice to pay — when it says we pay —
automatically."*

## What happens to an invoice

1. **It arrives**: at invoices@grayco-cs.com (the group → invoices@in.grayco-cs.com), forwarded there by a GrayCo person,
   forwarded by the office@ Gmail filter (below), or read straight from the **office@ mailbox** once 🌐 All GrayCo e-mail is
   set up (below).
2. **It is read** (`netlify/functions/_lib/subinv.js`). Word **.docx / .doc**, **PDF**, **photos**, **Excel .xlsx / CSV**,
   **Google Docs / Sheets** (attached, or a docs.google.com / drive.google.com link in the e-mail), or an invoice **typed in
   the e-mail itself**. Read: vendor, invoice #, date, due date / terms, the job address, PO, line items, subtotal, tax,
   retainage, total, and whether it asks GrayCo to pay. PDFs and photos are read by the AI reader (ANTHROPIC_API_KEY, already
   set for the Lead Inbox); Word, Excel, CSV and text-layer PDFs are also read without it.
3. **It is placed**:
   - **the job**: by the job-site address (house number + street name; "Cove" = "Cv", one letter off is still a match),
     then the PO, then the customer / job name. Certain = 85 % or better and clearly ahead of the next job;
   - **the sub**: by the sender's e-mail, then the e-mail domain, then the company name on the invoice. When a GrayCo
     person forwarded it, the sub is the forwarded **From:** line, not the GrayCo person.
4. **Certain job and known sub → booked by itself** (the next time an office / admin computer has the CRM open):
   - ▥ Invoices: a **received sub invoice** on the job (the file attached, invoice #, lines) — the same record as 📎 Upload
     Invoice;
   - the job's P&L: one **pending** Subcontractor cost row (linked to the invoice, so it is never counted twice);
   - ✅ Approvals: the sub-invoice approval for the job's PM (then the office, see *Approval routing*);
   - the **pay date**: the sub pay rule — received by Wednesday (Central) → paid the Friday of the following week; later →
     the Friday after; the invoice's own due date / Net terms when they are later. No pay-when-paid. Retainage from the
     signed subcontract (shown on the invoice: retainage and the net check). **Nothing is paid without approval**: the
     check is drafted only when the invoice is approved.
5. **Not certain → ✅ Approvals** (the office):
   - **🧾 Match this invoice** — the 3 best jobs + any job, the sub, the amount → *Book it on this job*, or *Not a sub invoice*;
   - **⚠️ Possible duplicate invoice** — the same sub + invoice #, or the same amount on the same job / address within 30
     days, is already in ▥ Invoices or came in before. *It is new — book it* or *Duplicate — set aside*. Never booked twice;
   - **🔗 Open this invoice link** — a Google link the CRM could not open (not shared): open it, then book it by hand there.

The same e-mail arriving twice (the invoices@ copy and the office@ mailbox, a re-forward) is kept once: by its Message-ID
and by the attachment itself (SHA-256).

## Approval routing for job costs (sub invoices, job expenses, receipts booked to a job)

- **The job's PM** is asked first (To-Do / ✅ Approvals, the 7 AM approvals e-mail and push) — whoever the job's PM is,
  **including Wesley or Nick when one of them is the job's PM**.
- **After 24 hours** without the PM — or **at once when the job has no PM** — the **office** (role starting with "Office")
  is asked too.
- Wesley and Nick are **no longer asked as the extra / default approver** of job costs on jobs where they are not the PM
  (before, a job with no PM fell to the admins; now it goes to the office). They can still open any of them and approve.
- Other approval types (customer e-mails, documents, invoices to sign off, payroll …) keep their routing.

## Setup A — the office@ Gmail filter (5 minutes, works today)

Mail that subs send to office@ reaches the CRM by a Gmail filter in office@:

1. Sign in to Gmail as **office@grayco-cs.com** → ⚙ → **See all settings** → **Forwarding and POP/IMAP** → **Add a
   forwarding address** → `invoices@in.grayco-cs.com` → Next → Proceed.
2. Google e-mails a confirmation code to that address. The CRM puts it on the **office To-Do** as
   "📧 Gmail forwarding code for invoices@: (#123456789) …" (also in Leads → 🔎 Bid boards → *Messages from Google*).
   Back in Forwarding and POP/IMAP → **Verify** → type the number → Verify. Leave forwarding itself **off** (the filter
   forwards only invoices).
   - If Gmail says forwarding is not allowed: admin.google.com → Apps → Google Workspace → Gmail → **End user access →
     Automatic forwarding → Allow** → Save, then try again.
3. Gmail search box → ⚙ *Show search options* → **Has the words**:
   `has:attachment subject:invoice -from:grayco-cs.com` → **Create filter** → tick **Forward it to:
   invoices@in.grayco-cs.com** → **Create filter**.
   (Optional, wider: `subject:(invoice OR "pay app" OR statement OR bill) -from:grayco-cs.com` also catches invoices typed
   in the e-mail or sent as a Google link.)
4. Test: from a non-GrayCo address, e-mail office@ a Word or PDF invoice with "Invoice" in the subject and a job address.
   Within a few minutes it is on the job (or in ✅ Approvals as *Match this invoice*).

A GrayCo person can always **forward** any sub's invoice to **invoices@grayco-cs.com** by hand — the CRM reads the
attachment and takes the sub from the forwarded From: line.

## Setup B — the CRM reads the office@ mailbox itself (once 🌐 All GrayCo e-mail is on)

The owner checklist item **"Turn on 'All GrayCo e-mail'"** is the only thing needed — then every 15 minutes the CRM looks
at office@'s new mail, and an e-mail that looks like an **invoice** (→ this flow), a **receipt** (→ 📧 Receipts e-mailed in →
expense) or a **supplier order** (→ the job's deliveries) is read with its attachments. Shortest path (≈15 minutes, an
admin of Google Workspace and of Netlify):

1. console.cloud.google.com → **New project** "GrayCo CRM mail" → **APIs & Services → Library → Gmail API → Enable**
   (and **Google Drive API → Enable**, for invoices sent as Drive / Docs links).
2. **IAM & Admin → Service accounts → Create** → open it → **Keys → Add key → JSON** (keep the file private) → copy its
   **Unique ID**.
3. admin.google.com → **Security → Access and data control → API controls → Manage Domain Wide Delegation → Add new** →
   that Unique ID, scopes `https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/drive.readonly`
   → **Authorize**. (drive.readonly may already be there for Google Docs → CRM; keep both.)
4. Netlify → the CRM site → **Environment variables** (Functions, Production): `GOOGLE_SA_EMAIL` = the service account
   e-mail · `GOOGLE_SA_KEY` = the whole JSON key file · `GMAIL_DOMAIN` = `grayco-cs.com` → Save → **Deploys → Trigger
   deploy**.
5. Supabase → SQL Editor → run **docs/email-all.sql** (if not done yet).
6. CRM → Gmail tab → 🌐 All GrayCo e-mail → **Sync now**.

Optional settings: `MONEY_MAILBOXES` (default `office@grayco-cs.com`; a comma list, e.g. add `billing@grayco-cs.com` if it
becomes its own mailbox) · `MONEY_MAILBOX_DAYS` (default 3 — on the first look only the last 3 days of office@ mail are
read as invoices, so old mail is not booked).

With Setup B on, Setup A's filter can stay: the same e-mail is kept once.

## Files

- `netlify/functions/_lib/subinv.js` — reading (docx / xlsx / doc / PDF text / CSV / Google links / AI), job + sub
  matching, duplicates, the pay date, retainage.
- `netlify/functions/_lib/money-mail.js` — invoices@ / receipts@ records (gc_kv `gc_mail_money`, `rec.si`).
- `netlify/functions/_lib/money-box.js` — the office@ mailbox reader (queue gc_kv `gc_mail_money_q`, read in
  bid-inbox-background).
- `netlify/functions/mail-all.js` — queues office@ invoices / receipts / orders after each sync.
- `netlify/functions/bid-inbox.js` — invoices@ hand-off, the Gmail forwarding code, the background reader.
- `netlify/functions/_lib/auto-digest.js` — the 7 AM approvals e-mail: job costs to the PM, then the office.
- `index.html` `gc-patch-subinv` (tools/patch_SUBINV.py, tools/subinv_tail.js) — booking, ✅ Approvals items, routing.
- Tests: `node tools/tests/test_SUBINV.mjs`.
