# 💬 Text us: customers text the GrayCo number (patch TXT)

The owner asked (10/23): "Can customers text the number for advice? Texts go to our e-mails, or replies etc. I would like to offer that, and basic answers for different questions."

## What happens when someone texts the GrayCo Twilio number

1. **The CRM finds who sent it.** It matches the sender's 10-digit phone number against:
   - a job's customer: their most recent **open** job, or their latest job if none are open;
   - a customer record;
   - a sub or vendor;
   - a lead.
2. **The text goes on Job Messages for that job**, shown as "📱 Name (text)", and on the job's 💬 Communication timeline.
   - Subs and unknown numbers go to **Job Messages → 📥 Unsorted**. Staff can move them to a job or tap **📱 Text back**.
3. **An unknown number becomes a lead** with source "Text message", and the lead roles route it:
   - water, fire or storm → Senior Insurance PM;
   - roofing → Senior Roofing PM;
   - commercial → Senior Estimator;
   - anything else → unassigned, and an admin assigns it.

   The usual new-lead alerts, speed-to-lead reminders and after-hours on-call paging all apply.
4. **The text is e-mailed** to the relay list (default office@; GrayCo addresses only), the admins (can be switched off), the job's PM, and for an emergency also the Senior Insurance PM.
   - The e-mail's **Reply in the CRM** button opens the job's thread.
   - Replying to the e-mail itself does **not** text the customer. Answer from the CRM so the reply goes out from the GrayCo number.
5. **The customer may get one automatic answer**, picked from the approved list in **Admin → 💬 Text auto-answers**:

   | Answer | Default text (editable) |
   |---|---|
   | 🚨 Emergency (water / fire / storm…) | "Call (901) 585-0944 now — 24/7…" + staff alerted + a lead for a new number |
   | 📅 Where's my project (customers on a job) | the next item on that job's CRM schedule + the PM's name |
   | 💳 Payments | billing@ / call the office / the portal |
   | 🛡 Insurance claim help | general steps; never names an insurance company, never promises coverage |
   | 📝 Free estimate | asks for the address and a good time (a lead for a new number) |
   | 🏠 What we do | restoration first, roofing, remodel, commercial |
   | 🕘 Hours | Mon–Fri 8–5, emergencies 24/7 |
   | 📍 Address | the office address (⚙ Admin → 🏢 Company address — the ONE setting) |

   If nothing fits: "Someone from GrayCo will text you back shortly", at most once every 12 hours per number.
   - With `ANTHROPIC_API_KEY` set, a small Claude model may **pick** the closest approved answer. It never writes its own words.
   - Limits: the same answer goes to a number at most once a day, and at most 4 automatic answers per number per day.
   - Subs never get automatic answers.
   - **HELP** gets the standard help text. **STOP** stops every GrayCo text to that number, and **START** allows them again.
   - While **⏸ Data-entry mode** is on, no automatic answers go out. Texts are still logged and e-mailed to staff.

## Staff texting a customer

- On any job's **💬 Job Messages**, the **📱 Text them** bar is pre-filled with the number that texted in, or the customer's phone.
- The text goes out from the GrayCo number and shows on the thread.
- It is refused while data-entry mode is on, and to a number that texted STOP.

## Owner setup (Twilio console)

1. **Netlify → Environment variables:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (the GrayCo Twilio number, `+1XXXXXXXXXX`). Set them for Functions / Production, then **Trigger deploy**. Missed-call text-back uses the same three.
2. **Twilio → Phone Numbers → Active numbers → the GrayCo number → Messaging configuration → "A message comes in":** Webhook, HTTP **POST**, `https://crm.grayco-cs.com/.netlify/functions/missed-call?event=sms`. Every request is checked against Twilio's signature; anything unsigned gets 403.
3. **A2P 10DLC registration is required** to send business texts to US numbers.
   - In Twilio → Messaging → Regulatory Compliance, register the **Brand** (GrayCo Construction Services, EIN) and a **Campaign** ("Customer care", with sample messages like the answers above and opt-in = "customers text us first / gave their number on the website form").
   - Then add the number to the Campaign's Messaging Service.
   - Until it is approved, texts can be blocked or filtered by the carriers. Approval takes a few days.
4. **Optional:** `ANTHROPIC_API_KEY` lets Claude pick an answer when no keyword matches. `SMS_AI_MODEL` changes the model (default `claude-haiku-5-5`). `SMS_RELAY_FROM` changes the relay e-mail's From line.

## "Text us" on the website and in marketing

- Admin → 💬 Text auto-answers shows **"Text us: (901) xxx-xxxx"**, built from `TWILIO_FROM`, with a Copy button.
- `GET /.netlify/functions/texts?public=1` returns only that number, for the website.
- Nothing hard-codes the number.

## Files

- `netlify/functions/_lib/sms.js`: matching, the approved answers, hours, fill-ins.
- `netlify/functions/missed-call.js`: the Twilio webhook. `?event=sms` = a text in.
- `netlify/functions/texts.js`: staff send, the settings, "try a text", and the public number.
- `index.html` `gc-patch-txt`: the 📱 Text them bar, 📥 Unsorted "📱 Text back", the `?jobmsg=` link, and Admin → 💬 Text auto-answers.
- Storage, in the service-only `gc_lead_inbox_kv`:
  - `gc_sms_settings`;
  - `gc_sms_state`: opt-outs, texts handled, automatic answers per number.
