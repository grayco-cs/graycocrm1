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
   | 🚨 Emergency (water / fire / storm…) | "Call (901) 582-8255 now — 24/7…" (the emergency line; the office (901) 585-0944 is for questions) + staff alerted + a lead for a new number |
   | 📅 Where's my project (customers on a job) | the next item on that job's CRM schedule + the PM's name |
   | 💳 Payments | billing@ / call the office / the portal |
   | 🛡 Insurance claim help | general steps; never names an insurance company, never promises coverage |
   | 📝 Free estimate | asks for the address and a good time (a lead for a new number) |
   | 🏠 What we do | restoration first, roofing, remodel, commercial |
   | 🕘 Hours | Mon–Fri 8–5, emergencies 24/7 |
   | 📍 Address | the office address (switches to 4014 Broadway Rd on 2026-10-29 by itself) |

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

## 📱 Local text numbers (patch LOCALNUMS)

- **Admin → 📱 Local text numbers** (admins only): rows of state, area codes, Twilio number and a label, for example MS 662 / 601 / 769 / 228, AR 870 / 501 / 479, TN 901 / 731. Saved in gc_kv `gc_sms_local`. Only phone numbers are stored; the Twilio SID and token stay in Netlify.
- **Netlify fallback:** `TWILIO_LOCAL_NUMBERS`, JSON in the same shape, e.g. `[{"state":"MS","codes":["662","601"],"number":"+16625550100","label":"North MS"}]`. It is used for numbers that are not on the admin list.
- **Which number a person's text goes out on** (📱 Text them, templates, the PM's texts from the CRM, the portal welcome, a PM's reply from their cell to a customer alert):
  1. The local number whose area codes include the customer's area code — always, even if they last texted the main number (owner 11/19: "texts get moved to the local number").
  2. Only when no local number matches: **sticky**, the number this customer's conversation is already on (they texted it, or we texted them from a local number), as long as it is still one of ours. It is stored in gc_kv `gc_sms_local_sticky`.
  3. Otherwise, the main GrayCo number (as before).

  Subs, the billing / insurance lines, and texts to staff cells keep their own numbers. The bar shows "📱 Sending from (662) …".
- **Replies** to any of our numbers (local or main) land on the job thread. They use the same webhook (`missed-call?event=sms`). They are matched to the customer and the job thread, and relayed to the same cells (the job's PM and the owners, per 📱 Text alerts), marked "via (662)". Automatic answers and the HELP answer go back from the number that was texted.
- **STOP and consent are per customer phone, across every number.** STOP on any number blocks all of them; START on any number undoes it.
- Nothing here texts a customer by itself. It only picks the From number.
- **A2P 10DLC:** every new number must be added to the existing messaging campaign's sender pool (Twilio → Messaging → Services → the service → Sender pool → Add), or its texts will not be delivered.
- 🔧 Owner setup has the step "📱 Add local text numbers for Mississippi and Arkansas". It ticks itself once an MS and an AR number are saved.

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
