# 📧 Email Center: the CRM's Gmail tab (patch MAILC)

The owner said (10/23): "I don't think any of this works, but I'd like this to work for all emails and aliases that I have, so I can see all emails in here."

## Why the old tab didn't work

It was a fixed page inside a frame, with three hard-coded accounts: nick@, office@ and wesley@. nick@ and wesley@ are not real GrayCo mailboxes (the real ones are nthomas@ and wjohnson@).

Each button opened a Gmail **slot number**: `mail.google.com/mail/u/0`, `/u/1`, `/u/2`. A slot is simply the first, second or third Google account this browser signed into, so the buttons opened the wrong mailbox, or none.

The account list also lived only in that browser's storage.

## What it does now

- **Every mailbox:** each active GrayCo person from the staff list, plus office@, plus any extra mailboxes an admin adds.
- **Every alias and group**, kept as data and edited by admins in the Email Center (⚙ Company addresses). The defaults:

  | Address | Kind | Receiving mailbox |
  |---|---|---|
  | leads@ | group | each member's own mailbox |
  | bids@ | group | each member's own mailbox |
  | billing@ | alias | office@ |
  | news@ | alias | office@ |
  | portal@ | alias | office@ |
  | replies@ | group | each member's own mailbox |
  | claims@ | group | each member's own mailbox |
  | orders@ | alias | office@ |

  An admin can mark each address as copied to the CRM or not.
- **Links go by address, never by slot:** `https://mail.google.com/mail/?authuser=<email>#inbox` (also Sent, Compose, Unread, Starred, Attachments).
  - An **alias** opens the mailbox that receives it, with a search for `to:<alias>`. Example: billing@ opens office@ with `to:billing@grayco-cs.com`.
  - A **group** opens the signed-in person's own mailbox with `to:<group>`.
  - You must be signed in to that Google account in the browser. If you aren't, Gmail asks you to pick or sign in.
- **Smart Search chips** are real Gmail searches for the selected mailbox or alias: insurance & claims, bids & estimates, permits, payments, contracts, change orders, last 24 hours, last 7 days. There is also a free search box.
- **📥 All company mail the CRM receives:** every e-mail that reaches the CRM's receiving domain (`in.grayco-cs.com`).
  - Each row shows when, to, from, subject (linked to a Gmail search), and what the CRM did with it: lead, sub bid, GC reply, supplier order, job e-mail history, or not kept. It also links "open lead" or "open job".
  - Rows can be filtered by address.
  - **Only metadata is kept**, never the message body.
  - Mail that the job-history routing rule copies but that isn't a job's e-mail is **not logged at all**, following the X9 rule: thrown away on arrival.
  - The log starts with this update. Older mail isn't in it.

## What shows in "All company mail", and what to route so everything does

The CRM only sees mail that a Google group, alias forward or routing rule copies to an `in.grayco-cs.com` address:

| Address | Copy to the CRM | Status |
|---|---|---|
| leads@ | member `leads@in.grayco-cs.com` | set up (patch STL) |
| bids@ | member `bids@in.grayco-cs.com` | set up |
| office@ supplier orders | forward to `orders@in.grayco-cs.com` | docs/ORDERS-SETUP.md |
| every job e-mail | Google Admin routing rule → `mail@in.grayco-cs.com` | docs/EMAIL-HISTORY.md; the Email Center says whether an admin confirmed it |
| claims@ | add member `claims@in.grayco-cs.com` | **to do** if not done |
| billing@ (alias on office@) | an office@ filter "to:billing@ → forward to `billing@in.grayco-cs.com`", or turn billing@ into a group with `billing@in.grayco-cs.com` as a member | **to do** |
| replies@, news@, portal@ | the same: add the `…@in.grayco-cs.com` member or forward | optional |

A personal mailbox (nthomas@, wjohnson@ …) can't be shown in full this way. Only its job e-mail reaches the CRM, through the routing rule.

## Reading every mailbox fully inside the CRM (not built)

That needs the Gmail API, and it's a bigger project:

- a Google Cloud project with the Gmail API enabled;
- domain-wide delegation (Google Workspace admin → Security → API controls) for a service account with the `gmail.readonly` scope;
- a server function that lists and reads each mailbox's messages on request;
- storage and privacy rules for who may read whose mailbox.

It's doable, but it means granting the CRM read access to everyone's mail, so it is the owner's decision. Until then, the buttons open Gmail itself, and the CRM shows the copies it already receives.

## Files

- `netlify/functions/_lib/mailcenter.js`: the addresses (data), the log row and the query.
- `netlify/functions/bid-inbox.js`: notes every received e-mail (`processEvent` → `log`).
- `netlify/functions/mail-center.js`: staff only. `?settings=1` (GET; POST by admins) and `?log=1&addr=&q=`.
- `index.html` `gc-patch-mailc`: the page, drawn into `#gmail-mount`. The old frame is no longer injected there.
- Storage, in the service-only `gc_lead_inbox_kv`: `gc_email_center` and `gc_mail_log` (newest 3000).

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
