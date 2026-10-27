# 📱 Text routing and GrayCo's numbers (patch SMSROUTE)

Owner, 10/24: "can I have more than 1 twilio number … when I text subs or when I have different subjects, subs, invoices
etc, all texts go to the correct employees' messages/inboxes in the crm". He decided on separate numbers: **Subs**,
**Customers**, **Marketing / leads**, and maybe Billing / Insurance later.

## Our numbers

| Purpose | Netlify variable (or Admin → 💬 Text auto-answers → 📱 Our numbers) |
|---|---|
| Default (used for any purpose without its own number) | `TWILIO_FROM` |
| Subs | `TWILIO_FROM_SUBS` |
| Customers | `TWILIO_FROM_CUSTOMERS` (or leave it as `TWILIO_FROM`) |
| Marketing / leads | `TWILIO_FROM_LEADS` |
| Billing (optional) | `TWILIO_FROM_BILLING` |
| Insurance (optional) | `TWILIO_FROM_INSURANCE` |

All numbers live in the same Twilio account (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`). Phone numbers are not secrets,
so they can also be typed in the CRM; the SID and token only ever go in Netlify. With one number, everything still works
through it.

## Who gets an incoming text

1. **The line it came in on.** Subs line → the PM of the job the sub is on today or next (from the schedule), else their
   latest job; a number not on file → the office. Customers line → the customer's job PM. Marketing line → the lead's
   owner, or the leads & marketing person; a new number becomes a lead. Billing line → the office. Insurance line → the
   Senior Insurance PM.
2. **Whoever texted that number last** (two weeks) also gets it, so a reply comes back to the person who asked.
3. **The subject on top:** invoice / payment / check → the office too. Claim / adjuster / insurance → the Senior
   Insurance PM too. Leak / flood / fire / emergency → 🔴 ASAP to the person on call (📟 On call) and the PM.
4. **Nobody found → the office.** Nothing is dropped.

Each person it is routed to gets a phone alert. The text is tagged for them in 💬 Messages (their badge), and a
"📱 Text back" to-do (or "📞 Call back" / 🚨 ASAP) is made when a person has to answer. GrayCo staff texting in are not
routed. Every text still goes on the job's thread and in the e-mail relay as before.

## Texts we send

A staff text goes out from the matching number: to a sub from the Subs number, to a customer from the Customers number,
to a lead from the Marketing number. It is signed "— Mike, GrayCo". After 8 PM or before 7 AM the CRM asks first.
Data-entry mode and STOP still block every text.

**Schedule texts (SUBTXT):** send them with `require('./_lib/smsroute.js').fromFor('subs', settings, env)` as the
`from` of `missed-call.js`'s `sendSms(to, body, from)`, so they go out on the Subs number when one is set.

## The customer text menu (Customers / default number)

A customer's first text, or HELP / MENU, gets the 1–5 menu: 1 status & next visit · 2 portal link · 3 balance · 4 talk
to my PM · 5 emergency.

- 1–3 and the warranty answer from the CRM, and only to the phone on file for that job's customer.
- 4 → the PM gets an urgent alert and a 📞 Call back to-do, and the customer hears "<PM> will call you back today."
- 5 → on call + the PM, ASAP, and the customer hears "We're on it — someone will call you within 15 minutes."
- A question that isn't clearly one of these goes to the PM, and the customer hears "<PM> has your message".
- Approved answers (hours, address, services, an estimate request) still answer as before.

AI only classifies, never writes the answer. The admin switch "Automatic text answers: on" (default on) turns all of it
off.

## Owner steps

1. **Twilio → Phone Numbers → Buy a number** for each line (901 numbers, Voice + SMS).
2. On each number, set **"A message comes in"** to the webhook `https://crm.grayco-cs.com/.netlify/functions/missed-call?event=sms`
   (HTTP POST). Set "A call comes in" only on the number that is published as the office line.
3. **Netlify → Environment variables:** add `TWILIO_FROM_SUBS`, `TWILIO_FROM_LEADS` (and `TWILIO_FROM_CUSTOMERS` if
   it is not `TWILIO_FROM`) as +1XXXXXXXXXX → **Trigger deploy**. You can also type them in Admin → 💬 Text
   auto-answers → 📱 Our numbers.
4. **A2P 10DLC (required for US business texting):**
   - **One Brand** (GrayCo, with the EIN).
   - **Campaigns by use, not by number:**
     - **Customer care** campaign: Customers, Subs, Billing, Insurance. These are conversations with people you work
       with, about their own job.
     - **Marketing** campaign: the Marketing / leads number, only if it sends promotional texts. If it only answers
       people who text in first, Customer care / Mixed is enough.
   - Attach each number to its campaign in the Twilio Console (Messaging → Services: one Messaging Service per
     campaign, and add the numbers to it).
   - Approval takes days; texts from an unregistered number are blocked by the carriers.
5. Admin → 💬 Text auto-answers → set the **Leads & marketing person**.

**How many numbers?** Three to start: Subs, Customers, Marketing. A Billing or Insurance number only adds value if
someone works that inbox all day, because the routing already sends billing and insurance texts to the right people on
any number.

## Emergency leads, from every source (patch EMERG)

Owner, 10/24: an emergency lead goes to the **on-call PM** (💧 Mitigation → 📟 On call), plus **every admin** and
**the office**, every time.

- **What counts as an emergency:** flooding, water coming in, a leak, a burst pipe, sewage, a tree on the house or
  roof, fire, smoke, storm damage.
- **Sources:** texts, missed calls followed by a text, the website forms, leads@ e-mails, the "Text us" page and
  partner leads. They all go through the one new-lead alert (`_lib/bid-alerts.js` notifyNew → `_lib/emergency.js`).
- **What they get:**
  - a 🚨 e-mail and a phone push;
  - a 🔴 ASAP to-do, assigned to the on-call PM and shared with the office.
- **The lead itself** is assigned to the on-call PM, unless a person already gave it to someone else.
- **Nobody on call this week** → the Senior Insurance PM, plus the admins and the office.
- **A text from an existing customer** about an emergency → on call (or the Senior Insurance PM), the job's PM, the
  admins and the office.

This replaces the earlier "Senior Insurance PM only" emergency alert. The lead roles still route every non-emergency
lead. The after-hours on-call page with its "Accept" chain (X10) still runs as well.
