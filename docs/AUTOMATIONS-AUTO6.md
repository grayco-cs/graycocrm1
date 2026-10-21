# Automations — patch AUTO6

Owner, 10/21: "yes on 4 · yes 6 · yes 9 · yes 10."

## 1. Missed-call text-back (Twilio) — `netlify/functions/missed-call.js`

When a call goes unanswered, the caller immediately gets a text:

> Sorry we missed your call — this is GrayCo Construction Services. How can we help? Reply here or call 901-585-0944.

What happens next depends on who called:

- **A new caller** becomes a lead in Leads → 📥 Lead Inbox.
  - Source "Missed call", not assigned.
  - The admins get "📞 Missed call — auto-text sent".
  - The 4 h / 24 h speed-to-lead reminders apply, the same as for a website lead.
- **An existing customer** (same phone number on a job or a customer record) does not become a lead. Instead they get a **"📞 Call back"** to-do:
  - it sits on their job, for that job's PM;
  - it goes on the shared Office To-Do if the job has no PM;
  - the PM and the admins are e-mailed.
- **The same caller again within 12 hours:** no second text. A Twilio retry of the same call does nothing.
- **Text replies:** go onto the lead or the call-back to-do, and are e-mailed to the admins (and the PM).
- **Opting out:** STOP (or STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT) means the caller is never texted from here again. START or UNSTOP undoes it. Twilio's own opt-out also blocks every GrayCo text to that number.

**Dormant until set up.** Nothing happens until Netlify has `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM`. Every webhook is checked with Twilio's signature (`X-Twilio-Signature`); an unsigned call gets a 403. `GET ?ping=1` shows whether it is ready and the webhook addresses — never a secret.

### Setting it up

The same steps are under Admin → the "📞 Missed-call text-back is waiting on Twilio" warning → Setup steps.

1. Sign up at twilio.com with replies@grayco-cs.com and upgrade the account.
2. Phone Numbers → Buy a number: a 901 number with Voice and SMS.
3. Messaging → Regulatory compliance → **A2P 10DLC**: register the brand (GrayCo Construction Services) and a "Customer care" campaign. US carriers block business texts until this is approved.
4. On the number, under Voice → **A call comes in** → Webhook, HTTP POST:
   `https://crm.grayco-cs.com/.netlify/functions/missed-call?event=voice`
5. On the number, under Messaging → **A message comes in** → Webhook, HTTP POST:
   `https://crm.grayco-cs.com/.netlify/functions/missed-call?event=sms`
6. Netlify → Environment variables: add these three, then Trigger deploy.
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM` (the new number, e.g. `+19015551234`)
7. Choose how calls reach Twilio:
   - **Option A:** ask the office line's carrier to forward on **no answer / busy** to the Twilio number.
   - **Option B:** make the Twilio number the published number and set `TWILIO_RING_TO` to the office line. Twilio rings the office first for `TWILIO_RING_SECONDS` (default 20) and texts only when nobody picks up.
8. Test: call from a cell phone and don't answer. You should get the text, and Leads → 📥 Lead Inbox should show "Missed call".

## 2. Sub pay check — `index.html` (`gc-patch-auto6`)

**When it runs.** Before a sub invoice is approved (`_gcPmDecideSub`), and before its check is marked written, which counts as paid (`_gcMarkCheckWritten`).

**What it checks.**

- The sub is on the Subs list with a **COI that has not expired**.
- The sub has a **W-9** on file.
- **This invoice plus the sub's invoices already approved or paid on the job** is no more than **the sub's agreement(s) on the job** (Sub Agreements) **plus signed change orders** for that sub.

**When something fails.**

- The approval or payment is stopped, and the reasons are shown.
- The invoice stays on the approvals list flagged **⚠ Pay check** (`payCheck` on the gc_sub_approvals row). The flag shows on the sub-invoice cards and in Admin's warnings.
- Only an **admin** can override, and must give a note. The note (who, when, why) is kept on the row and the invoice (`payOverride`). A PM cannot override.

`window._gcSubPayCheck(invId)` returns the check result.

## 3. Lost-lead win-back

Files: `netlify/functions/winback.js`, `_lib/winback.js`, and the `aqSend` hook in `portal.js`.

**Who gets one.** Every day at 10:20 AM Central (9:20 in winter), leads marked **Lost** that have an e-mail and were lost about **6 months** (182–211 days) or **12 months** (365–394 days) ago.

**Who never does.**

- Do-not-contact or do-not-e-mail leads.
- Commercial or government bids.
- People who have become customers since.
- Anyone unsubscribed from GrayCo News.
- Anyone already sent that check-in.

**How it goes out.**

- Each day's run puts **one approval item per batch** on the approvals list: "💌 Win-back check-in: N lost leads (6 months, from news@)". It holds the seasonal e-mail, with `{{FIRST_NAME}}` filled in per person.
- An admin edits it if needed and approves it.
- Then each person gets their own e-mail from news@ (reply-to replies@), with the unsubscribe link and the one-click unsubscribe header.
- If the batch is not approved, nobody in it gets the e-mail and they are not asked about again.

`WINBACK_OFF=1` turns it off.

## 4. Nightly data check

Files: `netlify/functions/data-check.js` and `_lib/datacheck.js`.

**When.** Every night at 07:05 UTC (2:05 AM Central in summer).

**What it looks for.**

- **Duplicate customers:** same e-mail, same phone, or same name and street.
- **Open jobs** missing a PM or an address. Past bidding, also missing a contract amount or a signed contract.
- **Open leads** where a bid has no due date, or nobody has been assigned after a day.

**Where the results go.** One item on the **shared Office To-Do**, "🧹 Nightly data check — N things to fix":

- It has a checklist, and its button 🧹 Open list opens every record with an Open button.
- Duplicate customers get **Merge…** (admins only): pick the record to keep and confirm. Then:
  - contact details the kept record is missing are copied from the others;
  - jobs, invoices and leads that use the other names or ids are moved to it;
  - the other records are removed on every computer (tombstones).

**How the item behaves.**

- If someone marks it done, it stays done until the problems change.
- When everything is fixed, it completes itself.
- The Admin page's warnings show the count.

**It never changes or deletes anything by itself.** `DATACHECK_OFF=1` turns it off.
