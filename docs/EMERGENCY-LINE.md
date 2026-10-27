# The 24/7 emergency line (patch CHAIN)

GrayCo's Twilio number **(901) 582-8255** is the website's 24/7 water emergency line. A call rings, one after the
other, until someone takes it:

1. **This week's on-call person** — 💧 Mitigation → 📟 On call (the rotation and each person's phone).
2. **The insurance manager(s)** — sign-in profile "insurance" (💎 → Team access), or "insurance" in their role or title
   on Admin → Employees.
3. **The admins** — in the order of `CALL_CHAIN_LAST`, e.g. Nick then Wesley.

Each phone rings for 20 seconds. The person hears *"GrayCo emergency line. Caller ending in 1 2 3 4. Press 1 to take
this call."* Only pressing 1 connects them, so a voicemail or a pocket answer does not stop the chain. Their phone
shows the caller's own number. If nobody takes it, the caller hears that a text is on its way, and the usual
missed-call text-back runs: an automatic text, a lead in the 📥 Lead Inbox (or a call-back to-do for an existing
customer), and the alert e-mail.

Code: `netlify/functions/_lib/callchain.js`, wired into `netlify/functions/missed-call.js`. No person is named in
code; who rings comes from the people list and the on-call rotation.

## Turn it on

1. **Phones:** everyone in the chain needs a cell number on Admin → Employees (phone / cell). The on-call rotation
   has its own phone per person (💧 Mitigation → 📟 On call).
2. **Netlify → Environment variables**, then redeploy:
   - `TWILIO_CALL_CHAIN` = `1`
   - `CALL_CHAIN_LAST` = `nthomas@grayco-cs.com,wjohnson@grayco-cs.com` (the admins, in order)
   - optional `TWILIO_CHAIN_SECONDS` = how long each phone rings (10–45, default 20)
   - already set: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (the GrayCo texting number)
3. **Twilio console → Phone Numbers → (901) 582-8255 → "A call comes in":** Webhook, POST,
   `https://crm.grayco-cs.com/.netlify/functions/missed-call?event=voice` (it is probably already set: the missed-call
   text-back uses the same address).
4. **Test it:** call (901) 582-8255 from a phone that is not in the chain. Let the first phone ring out, press 1 on
   the second, and check that you are connected.

## Good to know

- With the chain on, **every** call to the Twilio number goes through it. If the office line forwards unanswered
  calls to the Twilio number, a missed office call during the day rings the on-call person too. If you don't want
  that, stop that forward and let the office voicemail take daytime missed calls.
- Who took each call is kept for 14 days (service-only `gc_lead_inbox_kv` → `gc_callchain`).
- To turn it off: remove `TWILIO_CALL_CHAIN` and redeploy. Calls then go back to the missed-call text-back as before.
- The website shows this number only for water emergencies (the water damage page, the 24/7 badges, the footers).
  (901) 585-0944 stays the office number everywhere else.
