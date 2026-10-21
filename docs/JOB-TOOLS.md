# Job tools (patch AUTO8)

Every job now has a **🧰 Job tools** bar. On the desk it sits under ⚙ Automations; on a phone it is on the job screen.

| Tool | Where | What happens |
|---|---|---|
| 🏗 **Pay apps** | Commercial jobs, or any job that already has a pay app | AIA G702 / G703 built from the schedule of values. Approved change orders are added as lines. Retainage is 10% unless the job says otherwise. The PDF is filed on the job. The e-mail to the GC / owner waits on ✅ Approvals (PM, then admin) and goes out with the PDF attached. **Bill retainage** makes a draft invoice, which also goes to approvals. When the job reaches substantial completion with retainage held, the office and the PM get a "Bill retainage" to-do. |
| 🏁 **Final walkthrough** | Every job | Check off the punch list with the customer, then **Send to the customer to sign**. The e-mail waits on ✅ Approvals for the PM. The customer signs in their portal. Their signature drafts the **final invoice** for the balance (contract − already invoiced), which goes to ✅ Approvals, and files the signed copy on the job. A job billed by pay app gets a to-do instead: final pay app + retainage. |
| 🟢 **Crew arrived** / 🏁 **Done for today** | Phone job screen, and the Superintendent's "My jobs today" | Puts a short post on the customer's portal page (with an optional photo) and logs the time on the job's updates. Once a day each. A text goes out too once Twilio is set up. |
| 🚛 **Equipment** | Jobs where ⚙ Automations → "🚛 Dumpster & equipment tracker" is on | Records vendor, delivered date, rental days and cost to the job. Swap and pick-up dates become to-dos for the PM and the office that day. |
| 🦺 **Safety sign-in** | Phone job screen, "My jobs today", and the Site Book safety section | Shows today's toolbox talk (a rotating list; Admin → Toolbox talk topics). Each crew member signs on the screen. Kept on the job by day; the PDF record is available on demand. |

Also included:
- **Bid results (Glenn).** 7 days after a *submitted* bid's due date, if it is still not won or lost, an e-mail from gmiller@ goes to the bid's "due to" e-mail asking for the results.
  - It sends on weekdays, 9 AM–4 PM Central, once per bid.
  - It is Glenn's own e-mail to a GC, not a customer, so it goes straight out without approval.
  - Replies go to Glenn and to `results+<lead>@in.grayco-cs.com`. The CRM files the answer and shows it on Glenn's Dashboard → **🏆 GC scorecard**, with Mark won / lost buttons. The scorecard also shows win rate by GC, average bid, $ won and a "worth bidding" score.
- **New-hire autopilot.** When a candidate is marked **Hired** in Admin → Hiring, the CRM:
  - makes the offer letter PDF, which waits on ✅ Approvals for an admin;
  - adds office to-dos for the W-4, I-9, direct deposit and policies, plus license and insurance for anyone who drives to jobs;
  - asks the admin to create the CRM sign-in, with role and profile;
  - adds a to-do listing the PM Playbook sections to read for that role.
- **📺 Office TV scoreboard (Admin).** Full screen, refreshes every minute. Shows leads this week, close rate, jobs in progress, collected this month, A/R, bids due this week and approvals waiting. No customer names appear on screen.

## Settings (Netlify — all optional)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`: crew texts. Until these are set, only the portal post happens.
- `BID_RESULTS_FROM` (default `gmiller@grayco-cs.com`) and `BID_RESULTS_NAME`: who asks for bid results. `BID_RESULTS_OFF=1` turns it off.
- Results replies need **in.grayco-cs.com verified in Resend** (the same receiving domain bids@ uses).

## Functions
- `netlify/functions/walkthrough.js`: the customer views and signs the walkthrough in the portal; staff use it to ask for the signature.
- `netlify/functions/field-ops.js`: crew texts, and pay-app / offer-letter approvals.
- `portal.js` attaches a stored PDF when an approval with `attachments: [{ kind: 'file', ref }]` is sent.
- `_lib/bid-alerts.js` `resultsAsk` (every 10 minutes): sends the bid-results e-mails.
- `bid-inbox.js` stores `results+…` replies in gc_kv `gc_bid_results`.
- `_lib/job-auto.js` has the new `equipment` switch, off by default.
