# Signatures in the customer portal, estimate follow-ups, closeout, year-end archive, referrals (patch AUTO5)

Owner (10/21): "the job is probably already a job if we send an estimate out anyway … but I do want all signatures to
be in their portal." All change orders need a signature. Estimate nudges on day 2, 5 and 10. When the final invoice is
paid: warranty in the portal, review request, 11-month checkup, job closed; every year's closed jobs in one file.
"Contact your PM about our referral program."

Nothing to set up on Netlify: it uses the portal's settings (SUPABASE_*, RESEND_API_KEY). Optional:
`EST_FOLLOWUPS_OFF=1` stops the estimate follow-ups.

## Signatures (`netlify/functions/portal-sign.js`, shared list gc_kv `gc_sign_requests`)

- **Job → Customer portal card → ✍️ Signatures**: send an estimate, a contract (any contract / agreement / other
  paper on the job) or a change order for the customer's signature; see where each one is (e-mail waiting on
  ✅ Approvals · in the portal · signed · not signed); take one back.
- **Every new change order** asks for the customer's signature by itself.
- The e-mail asking the customer to sign always waits on **✅ Approvals** (estimate / contract: the PM, then an admin;
  change order / other paper: the PM). It goes out **from the PM** (replies go to the PM) with the job
  (PO · name · address) in the subject. A paper a person sent shows in the portal at once; one the CRM made by
  itself (a new change order) shows once its e-mail was approved.
- The customer signs on their Home page (**✍️ Papers to sign**): typed name + drawn signature (or the typed name),
  "I accept…" box. Or "I will not sign this" (the PM and the office are told). Their signed copy (PDF: what they
  signed, the amount, name, time, address) is e-mailed to them at once and stays in their portal.
- Back in the CRM (every minute, on any computer, never twice): the signed copy goes into the job's documents.
  - **Estimate / contract signed** → contract marked signed (the amount, when the job had none), a job still bidding
    becomes **Active** → patch AUT3's "signed" stage: draft schedule from the job type's template, deposit invoice
    draft → ✅ Approvals, welcome e-mail → approvals. A job already past that gets its template schedule if it has none.
  - **Change order signed** → the CO is approved (signed by, when, the copy).
- An estimate with no job: `_gcESignEstimate(estId)` makes the job first (a PO the CRM's way).
- Never shown to the customer: costs, margins, labor, materials, the insurance company, anything about subs.

## Estimate follow-ups (runs every hour with portal-reminders.js)

For a sent estimate / contract (its "please sign" e-mail went out, or a job with `proposalSentAt` still bidding):
day 2 → a follow-up e-mail waits on ✅ Approvals (the PM); once approved and sent, **day 5 and day 10 go out by
themselves with the text that was approved** (8 AM–6 PM Central), from the PM. Stops when it is signed, declined,
taken back, the job is lost or deleted, or the PM rejects the first one.

## Closeout autopilot

When the **final invoice is fully paid** (every client invoice paid, the final one dated on or after the day this
shipped): warranty certificate into the portal (5 years roofing / insurance, 1 year everything else), the thank-you +
review request → ✅ Approvals, the **11-month checkup** (an Office To-Do for the PM on that day; the checkup e-mail
then waits for approval), the job **Completed, closed and archived** for the year.

## Year-end archive

⚙ **Admin → 🗄 Year-end archive**: pick the year → **Download** one .zip of every job closed that year: a folder per
job (summary page, invoices.csv, payments.csv, change_orders.csv, the signed documents and warranty, photo links)
and `index.csv`. Built on the computer; nothing leaves the CRM.

## Refer a friend

The customer's portal Home page: **🎁 Refer a friend** — "Contact your Project Manager about our referral program",
the PM's name and phone, and a short form. It becomes a lead on Leads → 📥 Lead Inbox, **assigned to that PM**,
source "Customer referral — <customer>", "Referred by"; the PM gets an e-mail (reach out, and thank the customer);
the office gets a "thank the customer" to-do. The 4 h / 24 h reach-out reminders apply.
