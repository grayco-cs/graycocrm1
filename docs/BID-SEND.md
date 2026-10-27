# Our bids, one GC at a time (patch BIDSEND)

Owner, 10/22: *"I never want to say 'submitted to multiple contractors'. I want it all specialized … let the estimator
send the e-mail directly from estimate builder or CRM."* Also: *"Replies from bids … need to go in the CRM too … alert
Glenn"*, *"outgoing bids are sent through Glenn but FROM bids@"*, *"the subject is the project / name of the job, not
GrayCo bids"*, and *"bids@ replies go automatically to the Senior Estimator."*

Words used on screen: **Leads** = every new opportunity coming in (bid invitations included). **Our bids** /
**Bid sent** = the proposals GrayCo sends to GCs and owners. **Sub bids** = prices subcontractors send to GrayCo.

## What the estimator does

1. Open the lead (Leads → the lead's drawer → **🏢 Bidding to**) or the estimate (Estimates → the builder's bar →
   **📤 Send bid**, with the **🏢 Bidding to** strip under it).
2. List every GC the bid goes to. Each GC has its company, contact, e-mail, phone, its own bid due date, its bid or
   project number, how to submit, its status (not sent / sent / opened / won / lost) and notes. Admins and estimators
   can also set a price for that GC only. The lead's old "due to" fields become the first row.
3. **📤 Send bid** shows one preview per GC, with the subject and message editable. **Send all** still sends one
   separate e-mail per GC, each with its own proposal PDF ("Prepared for: <GC> — Attn: <contact>", that GC's due
   date and that GC's price). No e-mail or PDF ever names another GC, says how many GCs are bidding, or says
   "multiple". The CRM and the server both refuse one that does.
4. **Open in Gmail instead** opens a compose window in your own Gmail with bids@grayco-cs.com in CC, and downloads
   that GC's PDF. Click **✓ I sent it from Gmail** afterwards.

Each send is logged on the lead's activity, on the GC's row (who sent it, when, which estimate and version) and in
gc_kv `gc_bid_send_log`. When every GC with an e-mail address has been sent the bid, the lead becomes **Submitted**.

## How the e-mail goes out

- **From:** `<the estimator's own name> <bids@grayco-cs.com>`
- **Reply-To:** `bids@grayco-cs.com`
- **Subject:** the project as the GC knows it, plus the GC's bid number if there is one. Example:
  "Runway 18R PAPI Construction — RFB 25-1486-01".
- **Signature:** the estimator's own name, direct phone and e-mail.
- **Copy to the sender:** a BCC. There is never a CC.
- **Message-ID:** the CRM's own, `<bid.<lead>.<gc>.<n>@grayco-cs.com>`, so the GC's reply finds its row.

The template is in **Admin → 📤 Bid e-mails**. It accepts [GC_COMPANY], [CONTACT_FIRST], [PROJECT], [BID_NO], [DUE]
and [SENDER]. The same page has the **Bid e-mails need approval** switch, which is OFF by default. When it is on, a
non-admin's send becomes a high-priority To-Do for the admins to approve. Bids go to GCs, not to customers.

The AUTO8 "Bid results?" follow-up also goes per GC. Each GC the bid was sent to gets one e-mail 7 days after **its
own** due date, from the same address, naming only that GC's contact.

## Set-up (one time, Google Workspace admin)

**bids@grayco-cs.com must be a Google Group** with these members:

- the estimator(s)
- Wesley
- Nick
- office@
- **bids@in.grayco-cs.com**, which is the CRM's Resend receiving address on the same webhook as leads@

Members must be allowed to receive mail from outside the company. Replies then reach the people and the CRM at once.

## What happens to mail sent to bids@ (bid-inbox.js)

Mail to bids@ is sorted in this order:

1. **A GC's reply to one of Our bids.** The CRM recognises it in any of these ways:
   - In-Reply-To names the bid we sent;
   - the sender is a contact on a lead's "Bidding to" list;
   - it is a "Re:" whose subject names the project or the GC's bid number, from someone who is not a known sub.

   The reply is filed on that lead and GC row (gc_kv `gc_bid_replies`). Its attachments go to crm-files and are
   listed under 📐 Plans.
2. **A Sub bid.** The sender is a sub we invited or have on file, or the e-mail says "our price / our bid is
   attached". It goes to Leads → 📨 Sub bids.
3. **An invitation to bid.** It becomes a Lead.
4. **Anything else** goes to **📨 Unsorted bids@ mail** in the Sub bids panel. The Senior Estimator says what each one
   is (a Sub bid, or a GC reply on a chosen lead).

A copy of a GC's reply that arrives through the e-mail history (mail@in) is filed the same way. The same e-mail is
only ever kept once.

**Urgent** means any of these:

- an addendum or revised drawings / specs;
- scope added or taken away (add, remove, delete, include, exclude, alternate, revised scope, value engineering);
- RFI answers or clarifications;
- a due date or time change;
- a bid form change;
- a pre-bid meeting or walk-through;
- "please confirm";
- anything that arrives within 72 hours of that GC's due date.

Claude (the haiku model) gives a second opinion when ANTHROPIC_API_KEY is set; BID_REPLY_AI=0 turns that off.

**Who is told.** The Senior Estimator is always told (the Estimator role / Leads ⚙ default). The lead's own estimator
or PM is told too when that is someone else.

- **Urgent:** an e-mail "⚠️ URGENT bid change: <Project> — <GC>: <summary>" with a link to the lead, a push, a
  high-priority To-Do, and a red **Bid change** badge on the lead card and drawer until someone marks it reviewed.
- **Not urgent:** a push and the entry on the lead's timeline.

A new due date in a reply is only a suggestion ("📨 Due date changed to … — Review & apply"). Nothing changes by
itself.

## Settings (Netlify, all optional)

| Setting | What it does |
| --- | --- |
| `BID_SEND_FROM` | The bid address. Default: bids@grayco-cs.com. |
| `BID_REPLY_AI=0` | Turns off Claude's second opinion. |
| `BID_REPLY_MODEL` | The model for that second opinion. Default: claude-haiku-5-5. |
| `BID_RESULTS_OFF=1` | Turns off the "Bid results?" follow-up. |
