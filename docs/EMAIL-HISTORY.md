# 💬 E-mail & chat history on every job (patch X9)

Owner, 10/21: *"E-mail history and chat history so office, PM and anyone else in the company can see what we told them,
but I don't want any extra stuff for this to happen. Where it says PM adds CRM address as BCC, I want that to happen for them."*

## What people see
Every job has a **💬 Communication** bar (desk: under the job header; phone: on the job screen). **Open** shows, newest first:

- e-mails between GrayCo and the customer, the claim's adjuster, a sub or the GC (both directions, with attachment names;
  small PDFs and photos open from private storage);
- the CRM's own e-mails about the job (✉️ sends from your address, approved e-mails);
- text messages (once Twilio is on), portal posts, what the customer signed in the portal.

There is a search box and filters (All · E-mail · Text · Portal). Every GrayCo sign-in can read it; nobody edits it.
**Customers and subs never see it**: neither portal reads it.

## How the e-mail gets there (nothing for staff to do)
One Google Workspace **routing rule** sends a second copy of every e-mail between a GrayCo person and someone outside
GrayCo to `mail@in.grayco-cs.com`. That is Resend's receiving domain, the same webhook as bids@. The server
(`netlify/functions/_lib/comms.js`) keeps only job mail:

- the **PO in the subject** (every GrayCo job e-mail carries "PO · name · address"), or
- the outside person is **on a job**: the customer (job or customer record), a contact on the job, the claim's adjuster,
  a sub or vendor named on the job. If several jobs match, the most recent active one wins.

**Everything else is thrown away on arrival.** It is not stored and not logged; only a count per day is kept.
Newsletters and out-of-office replies are skipped unless they carry a PO. The same e-mail seen several times is kept once
(Message-ID): both directions, several staff, the routing copy plus a BCC.

Until an admin confirms the rule is on, the CRM's ✉️ / Gmail compose windows add `mail@in.grayco-cs.com` as **BCC by
themselves** (belt and braces).

## Setup (Wesley, once, about 5 minutes)
1. Resend → Domains: **in.grayco-cs.com** must show **Verified** (the same receiving domain as bids@).
2. admin.google.com → **Apps → Google Workspace → Gmail → Routing** → **Add another rule**. Name it *GrayCo CRM e-mail history*.
3. **Email messages to affect:** tick **Inbound** and **Outbound** (not Internal-sending / Internal-receiving).
4. **For the above types of messages, do the following:** Modify message → **Also deliver to** → *Add more recipients* →
   Add → Basic → `mail@in.grayco-cs.com` → Save.
5. Same rule: **Headers → Add custom headers** → Add → key `X-GrayCo-Journal`, value `1`.
6. Options: leave the envelope filter off, so it covers every person. **Save.**
7. CRM → ⚙ Admin → **💬 E-mail & chat history** → tick **"The Google routing rule is on"**. The CRM stops adding the BCC.
8. Test: e-mail a customer from your Gmail with the job's PO in the subject. It shows on the job's 💬 Communication
   within a minute. The Admin card shows the last e-mail filed and how many were kept / thrown away each day.

Nothing to set on Netlify: the defaults cover it. `COMMS_INBOX_TO` overrides the address.

## Where it is kept
In the lead inbox's private table (`gc_lead_inbox_kv`: service key only, never synced to a browser). There is one row
per job, `gc_comms__<job id>`, holding the newest 500 entries. Day counts are in `gc_comms_status`, and the "rule is on"
setting is in `gc_comms_settings`. Staff read it through `/.netlify/functions/comms?job=<id>` (signed in, on gc_staff).

Twilio texts and portal messages use `require('./_lib/comms.js').addMessage(pid, { kind: 'text'|'portal', dir, from, text })`.

---

# 🛠 Maintenance plans (patch X9)

Owner: *"Always do maintenance contracts and try to sell those. Offer in portal for roofs and other residential items."*

- **Plans:** ⚙ Admin → 🛠 Maintenance plans. The defaults are Roof Care Plan, Gutter & Drainage Plan and Home Exterior
  Check-up. The price stays **[PRICE]** there: each home is quoted on its job. Plans are offered on **residential and
  insurance** jobs by default, never on commercial or program work (an admin can change that).
- **Customer portal → Home → 🛠 Maintenance plans:** *Request a quote*. The PM gets an e-mail and the office a to-do.
- **The job → 🛠 Maintenance → Send quote** (yearly price for this home). The "your quote is ready" e-mail waits on
  ✅ Approvals for the PM.
- **The customer signs in the portal** (typed name plus drawn signature). The signed PDF is stored privately and
  e-mailed to them at once. The next visit goes on the CRM schedule.
- **Every day** (`maint-scheduled.js`, 13:20 UTC):
  - a visit due within 21 days → office to-do;
  - the **yearly invoice** → ✅ Approvals (the PM, then an admin), year 1 at signing, then each anniversary; once approved
    it goes from billing@ with its PDF, and the office gets a to-do to record it in QuickBooks;
  - a home job finished in the last 45 days with no plan → office to-do **"Offer a maintenance plan"** (once per job).
    The job page shows the same nudge in amber.
- **Other e-mails** (closeout pack, anniversary note) can add one line:
  `require('./_lib/maint.js').offerLine(project, contracts, settings)` (server) or `window._gcMaintOffer.line(p)` (CRM).
  The line is empty when the job is not a home job or already has a plan.

# 🙋 "How did you hear about us?" (patch X9)
- **Customer portal → Home:** one tap (Google · Facebook · A friend or neighbor (referral) + who · Yard sign · Our truck ·
  Repeat customer · Insurance company · Other). The CRM writes it on the job (`howHeard`, `referredBy`), and 📣 Marketing
  counts it.
- The website form (`website-form.js`) asks the same question; the lead gets `howHeard`.
- 📣 Marketing → Dashboard → **Monthly by source — leads · jobs won · revenue** (the last 6 months).

# 🏁 Carrier speed report (patch X9)
🛡 Insurance board, under the KPIs (internal only). Per carrier, average days:

- claim reported → approved;
- supplement sent → approved, plus the approval rate;
- depreciation packet sent → paid.

Carrier names are never shown to customers.
