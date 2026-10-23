# 📄 Google Docs → CRM (patch GDOCS)

Owner, 10/23: "when i make documents in google docs i want them to be read and entered into my crm system, if im giving
proposals and quotes i want those jobs entered or matched as a bidding job, docs i make that are invoices i want to go to
the jobs documents or make a matching invoice thats on the crm and add to portal etc, all quotes and proposals before jobs
are signed also add to the customers portal". Then: "read … everyone pm super apm estimator any
docs in their google docs bring those into crm".

## What it does

Every 15 minutes (and on **⟳ Sync now**) the CRM looks at the Google Docs that each active staff member **owns** and that
changed since the last look. It is **read only**: it never changes, shares or deletes anything in Google Drive.

- **Only business papers are kept**: proposal / quote / estimate / bid, invoice, change order, contract, scope of work.
  The kind is read from the Doc's title and its heading (GrayCo letterhead, totals, invoice numbers).
- **Anything else is skipped**, such as a grocery list or a letter. Only "<file id> ignored" is noted; its name and its words
  are never stored.
- **A Doc shared between people is read once**, from its owner, and credited to that owner.
- **A Doc that is edited later comes in again** as a new version (v2, v3…). The old version is hidden from the portal.

An admin or office computer then places each paper using the CRM's own data:

| Paper | What happens |
|---|---|
| Proposal / quote / estimate for a **job** | Added to the job as a proposal (sent), with the PDF in the job's documents and the **customer portal**. |
| Proposal for an **open lead** | Added to the lead. The lead moves to **Estimate Sent**, with the amount. When the lead becomes a job, the proposal and PDF move onto the job (portal). |
| Proposal for a **new customer** | A new lead at **Estimate Sent** (source "Google Docs") with the customer's name, e-mail, phone, address and amount. The lead roles route it; the Doc's author gets it when the roles allow it (an estimator on a commercial bid, a PM on their own residential work). |
| **Invoice** | A matching CRM invoice on the job: same number, amount, date, due date and lines, from billing@, **recorded only** (never e-mailed, no reminders). It also goes in the job's documents and shows in the portal under Invoices. It is **never made twice**: an invoice already in the CRM with that number (or the same job, amount and day) is linked instead. Dated before 2026 or marked paid = history. |
| Change order / contract / scope | The job's documents. |

**Matching** uses the job number in the Doc, then the customer's e-mail, phone, street address and name.

**Anything not sure goes to 🔎 Needs a person** in the panel and on the office To-Do. That covers no matching job, two
jobs that look alike, or a weak read. From there: **Place it** on a job or lead, **＋ New lead**, or **Ignore**.

**Every placement can be undone** from the 📜 Import log.

**Nothing here sends anything to a customer.** The portal's "new papers in your portal" e-mail stays off for these
unless an admin turns on "E-mail the customer when one is added". ⏸ Data-entry mode is respected as everywhere.

## Where

**💎 / Hub → 📄 Sync my Google Docs** opens the **📄 Google Docs → CRM** panel. Its parts:

- the switches (admin);
- folders to watch, which is optional: empty = every Doc each person owns;
- **Whose Drives**, with an on / off per person, last read, and docs seen / kept;
- **Needs a person**;
- the **Import log** with ↩ Undo;
- **Bring in older docs**, for an admin only. Docs made before the day this was turned on come in to "Needs a person" to be
  checked first.

## Setup (once, about 10 minutes). The admin does this; nobody else has to click anything

This uses the same Google service account as **🌐 All GrayCo e-mail** (docs/EMAIL-ALL.md). If that is not set up yet, do
its steps 1–6 first.

1. **Google Cloud Console** (console.cloud.google.com) → the CRM's project → **APIs & Services → Library → Google Drive API
   → Enable**.
2. **Google Admin** (admin.google.com) → **Security → Access and data control → API controls → Manage Domain Wide
   Delegation**:
   - find the CRM's service account (its client ID);
   - click **Edit**;
   - add a second scope, so the box reads:
     `https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/drive.readonly`
   - **Authorize**.
3. Nothing to add in Netlify: it uses the same `GOOGLE_SA_EMAIL` / `GOOGLE_SA_KEY` already set up for e-mail.
   **Trigger deploy** once after this update.
4. CRM → **📄 Google Docs → CRM** → **⟳ Sync now**. Every person shows ✓ in **Whose Drives**. Turn off anyone whose Docs
   should not be read.

**Without Google Admin**, each person can click **🔗 Connect my Google Drive** in the panel. That needs the Google OAuth
client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in Netlify, with the Drive scope on its consent
screen).

## Files

- `netlify/functions/_lib/gdocs.js`: reading (service account or a person's own connection), classifying, parsing and
  the state. It uses the server-only table gc_lead_inbox_kv, which is never synced to a browser.
- `netlify/functions/gdocs-sync.js`: the API (status, inbox, sync, mark, settings; export for the Change Order reader).
- `netlify/functions/gdocs-scheduled.js`: every 15 minutes.
- `index.html`, tail GDOCS: the matching and placing, the panel, and the To-Do rows.
- `netlify/functions/portal.js`: a proposal with its PDF shows the PDF (a private Google Doc does not open for the
  customer). Papers from Google Docs are not announced by e-mail unless that is turned on.

## Where the Google sign-ins live (patch GTOK)

Each person's own connection (**Connect Google**: Calendar + Drive, read only) leaves a Google refresh token. Those are
kept ONLY in the server-only table `gc_lead_inbox_kv` (`netlify/functions/_lib/gtok.js`), never in `gc_kv`, which every
signed-in browser can read. Older copies in `gc_kv` (`gcal_token_<name>`, from before this fix) are moved there and
deleted the first time the server reads them (Google Docs sync, Calendar sync, or opening the Google Docs panel).

Run **`docs/google-tokens.sql`** once, AFTER `docs/email-all.sql`: it moves any copy that is left, and gives
`gcal_token_*` in `gc_kv` the class "server", so no browser (not even an admin's) can read or write one again.
The Google Docs panel shows an admin a red line until that is done. Nobody has to reconnect Google.
