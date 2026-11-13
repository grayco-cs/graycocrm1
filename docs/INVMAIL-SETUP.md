# Invoices e-mailed to Wesley, Nick or office@ (patch INVMAIL)

Owner, 11/13: *"all emails for invoices — make sure to read Nick, Wesley and office, and don't miss: if someone were to send me
and Nick an invoice and not invoices@ or office@ then it shouldn't miss the invoice."*

## What the CRM does

Every copy of **wjohnson@, nthomas@ and office@grayco-cs.com** mail that reaches the CRM is read by one invoice detector
(`netlify/functions/_lib/invmail.js`):

- **an invoice** (a sub's invoice, a supplier's bill or statement): a PDF / photo / Word / Excel file named or reading like an
  invoice (invoice #, amount due, remit to, bill to …), subject words (invoice, bill, statement, payment due, past due, inv #),
  a sender on the CRM's subs / vendors / suppliers lists, a reply on an invoice thread → the **same intake as invoices@**
  (▥ Invoices / ✅ Approvals, the job match, the pay date — patch SUBINV);
- **a receipt** → 📧 Receipts e-mailed in (the receipts@ flow);
- **not sure** → ✅ Approvals → **📥 Possible invoices from e-mail** (admins and the office): ✓ It's an invoice / ✕ Not an
  invoice. The answer is remembered for that sender;
- **never**: GrayCo's own mail (from @grayco-cs.com, or sent by the CRM), newsletters / marketing, bid invitations and leads
  (bids@ / leads@ handle those), personal mail. Nothing about those is kept or logged.

One invoice = **one record**, however many of invoices@ / Wesley / Nick / office@ it was sent to (the same Message-ID, the same
file, or the same vendor + invoice # + amount); the record notes every mailbox it came to.

Until mail from each of the three mailboxes has been seen, ✅ Approvals shows **📭 Wesley/Nick/office mail not connected yet**.

## Setup — one Google routing rule (≈5 minutes, a Google Workspace admin)

1. admin.google.com → ☰ → **Apps → Google Workspace → Gmail → Routing**.
2. **Routing** → **Configure** (or **Add another rule**).
3. Description: `GrayCo CRM - invoices from Wesley, Nick, office`.
4. **1. Email messages to affect**: tick **Inbound** only.
5. **2. For the above types of messages, do the following**: **Modify message** → under **Also deliver to** tick **Add more recipients** → **Add** → **Basic** → `invoicecopy@in.grayco-cs.com` →
   **Save**.
6. **Show options** → **A. Address lists**: leave off. **B. Account types to affect**: tick **Users** and **Groups**.
   **C. Envelope filter**: tick **Only affect specific envelope recipients** → **Pattern match** →
   `^(wjohnson|nthomas|office)@grayco-cs\.com$`
7. **Save** (bottom of the dialog). Google can take up to an hour to apply it.
8. Test: from a non-GrayCo address, e-mail Wesley and Nick (not invoices@) a PDF invoice with "Invoice" in the subject.
   Within a few minutes it is in ✅ Approvals (booked on its job, or 🧾 Match this invoice), and the 📭 notice is gone for them.

Nothing to set in Resend: `invoicecopy@in.grayco-cs.com` is on the same receiving domain and webhook as invoices@in.

**Instead (or as well)**: 🌐 All GrayCo e-mail (the Google service account, docs/EMAIL-ALL.md / docs/SUBINV-SETUP.md
"Setup B") reads the three mailboxes every 15 minutes and fetches the whole message + attachments for likely invoices only.
Both on at once is fine: the same e-mail is kept once.

## Settings (optional, Netlify environment variables)

- `INVMAIL_BOXES` — the watched mailboxes (default `wjohnson@grayco-cs.com,nthomas@grayco-cs.com,office@grayco-cs.com`).
- `INVMAIL_COPY_TO` — the routing-rule address (default `invoicecopy@in.grayco-cs.com`).

## The job on a vendor's invoice — ship-to / job / deliver-to (patch SHIPTO)

Owner, 11/13: *"match invoices from companies for job address like on ABC."* Every e-mailed or dropped invoice's text (the
same PDF / Word / Excel reader, no AI needed) is searched for every street address **with the label it sits under** — Ship to,
Deliver to, Job site, Job address, Job name, Project, Site / Service address, Location — and each one is tried against the
CRM's jobs (house number + street name + suffix, the ZIP when both have one, the PO, the job name). GrayCo's own office address
is never the job; the vendor's letterhead, bill-to and remit-to addresses come last.

- **Certain** (one job, ≥85 % and clearly ahead) → placed by itself; the job line says *"matched by the ship to address …"*.
- **Not certain** (a different ZIP, two job addresses on one invoice, a near spelling) → ✅ Approvals → 🧾 Match this
  invoice with the best jobs: one click books it.
- **Learned per vendor**: the label under which a vendor's job address sat on its invoices already booked on a job (including
  the job a person picked) wins next time (`si.tpl`; candidates are kept on each record as `si.read.addrs`).
- `GC_OWN_ADDRESSES` (optional, `;`-separated) adds more GrayCo addresses that are never a job.
- `netlify/functions/_lib/shipto.js`; used by `_lib/subinv.js` analyze() (e-mail from every mailbox, invoices@, 📥 Drop
  invoices). The 📎 Upload Invoice reader in the CRM already looks for every job's address anywhere in the PDF text.

## Files

- `netlify/functions/_lib/invmail.js` — the detector, the intake hand-off, 📥 Possible invoices (`gc_invmail_maybe`), the
  senders' answers (`gc_invmail_senders`), 📭 last seen (`gc_invmail_seen`) — all in the inbox's private table.
- `netlify/functions/bid-inbox.js` — the routing copy (`invoicecopy@in`), the history copy (mail@in), `?invmail=1`.
- `netlify/functions/_lib/money-box.js` — the 🌐 All GrayCo e-mail sync of the three mailboxes.
- `netlify/functions/_lib/money-mail.js` — one record per invoice (`cameTo`, `vias`).
- `index.html` `gc-patch-invmail` — 📥 Possible invoices from e-mail and the 📭 notice (✅ Approvals, ⚙ Admin).
- Tests: `node tools/tests/test_INVMAIL_fn.mjs`, `node tools/tests/test_INVMAIL_ui.mjs <build-dir>`.
