# 🌐 All GrayCo e-mail (patch MAILALL)

Owner, 10/23: "open all aliases and e-mails that receive and send — I want to see all e-mailing from GrayCo."

The Email Center (CRM → Gmail tab) gets a **🌐 All GrayCo e-mail** section for **admins only**. It shows:

- every e-mail received and sent in every GrayCo mailbox (each person on the staff list, office@, and the extra mailboxes
  in ⚙ Company addresses). Aliases and groups show up through the mailboxes that receive them (billing@ → office@, etc.);
- every e-mail and text the **CRM itself** sent (invoices, portal links, reminders, lead alerts, texts…), with its status:
  sent, **paused** (data-entry mode) or failed.

It is filterable by mailbox, address, in/out, date, attachments, job and customer, and searchable. Clicking a row opens the
message, fetched live from Gmail. **"Open in Gmail"** opens that mailbox at that conversation. **"Link to job"** pins an
e-mail to a job. Each job and customer page gets a **📧 All e-mail** button that shows the e-mail matched to it.

## How it works (and what it can and cannot do)

- **Read-only.** The CRM asks Google for one permission only: `https://www.googleapis.com/auth/gmail.readonly`.
  It cannot send, change, label or delete any e-mail.
- **Metadata only is stored.** Who, to whom, subject, date, a short preview, which job. **Message bodies are never stored**;
  they are fetched from Gmail when an admin opens one, and every opening is recorded (who, which message, when) in an
  admin-only access log.
- **Admins only.** Every request is checked on the server. A PM sees nothing unless an admin turns on "PMs see their job's
  e-mail", and then only the e-mail matched to *their* job. The Marketing Manager never sees it.
- **Every 15 minutes** (`mail-all-sync`) the CRM reads what is new in each mailbox since the last look (Gmail history).
  The first look takes the last 30 days.

## Setup (once, about 15 minutes)

1. **Google Cloud Console** (console.cloud.google.com) → **New project** (name it e.g. "GrayCo CRM mail").
2. **APIs & Services → Library → Gmail API → Enable.**
3. **IAM & Admin → Service accounts → Create service account** (any name). Open it → **Keys → Add key → Create new key → JSON**.
   A file downloads. Keep it private: it is a password.
4. In the service account's details, copy its **Unique ID** (the client ID, a long number).
5. **Google Admin** (admin.google.com) → **Security → Access and data control → API controls → Manage Domain Wide
   Delegation → Add new**:
   - Client ID: the number from step 4
   - OAuth scopes: `https://www.googleapis.com/auth/gmail.readonly`
   - **Authorize**.
6. **Netlify** → the CRM site → **Site configuration → Environment variables** (scope **Functions**, value for **Production**):
   - `GOOGLE_SA_EMAIL` = the service account's e-mail (…@….iam.gserviceaccount.com)
   - `GOOGLE_SA_KEY` = the `private_key` from the JSON file (or paste the whole JSON file). **Never** paste it in chat or e-mail.
   - `GMAIL_DOMAIN` = `grayco-cs.com`
   - **Save → Deploys → Trigger deploy.**
7. Supabase → SQL Editor → run **docs/email-all.sql** (makes the e-mail index keys admin-only, in case the index falls back
   to gc_kv).
8. CRM → Gmail tab → 🌐 All GrayCo e-mail → **Sync now** (or wait up to 15 minutes).

Until steps 1–6 are done, the section shows these steps instead of a list. The CRM-sent log works right away, with no setup.

## Company e-mail policy (recommended)

Tell everyone in writing (handbook / offer letter) that **company mailboxes and company devices belong to GrayCo and may be
reviewed by management**. That keeps reading all GrayCo mailboxes in the CRM clean and expected.

## Files

- `netlify/functions/_lib/gmail.js`: the service-account token (JWT, RS256, node crypto), Gmail reads with backoff
- `netlify/functions/_lib/mailidx.js`: the index (metadata only), matching to jobs/customers/leads, the access log
- `netlify/functions/mail-all.js`: the admin API (status, list, get, thread, settings, link, sync)
- `netlify/functions/mail-all-sync.js`: the 15-minute schedule
- `netlify/functions/_lib/pause.js`: logs every CRM send (sent / paused / failed) into the index
- `docs/email-all.sql`: admin-only class for the `gc_mail_*` keys
