# Calls to the GrayCo number: 📞 call order and missed-call text-back

`netlify/functions/missed-call.js` (patches AUTO6, CALLCHAIN, CALLSCREEN) · `netlify/functions/_lib/callorder.js` · Admin → ⚙ Admin settings → 📞 Call order

## What happens when someone calls the GrayCo Twilio number

0. **Screening (patch CALLSCREEN, on by default)** — owner: *"before we ring nicks phone i want to be sure ai or someone
   trying to sell something doesnt click the number and then call him"*. The caller first hears (editable in the card):
   *"Thanks for calling GrayCo Construction Services. If you need construction, remodeling, roofing, or water, fire or
   storm damage repair, press 1. If you're a current GrayCo customer, press 2. For anything else, including sales
   calls, press 3."* They can press a key or say it.
   - nothing pressed → the menu once more; nothing again → "Goodbye", hang up — logged *no answer to menu (likely robocall)*;
   - **3** → *"We don't take sales calls on this line. Please e-mail office@grayco-cs.com. Goodbye."* — no ring, **no text,
     no lead**, logged only (the card counts them);
   - a **blocked number** (card) or a caller ID that **fails the carrier check** (Twilio `StirVerstat` …Failed…) → same as 3;
   - **1** → *"In a few words, what work do you need?"* (8 s; can be turned off) — what they say goes on the lead / to-do;
   - **2** → current customer: when the caller's number is on a job, that job's PM rings first, then the call order.
   Only callers who pressed 1 or 2 are ever rung, texted or made a lead.
1. The caller hears: *"Thank you. Please hold while we connect you."* (screening off: *"Thanks for calling GrayCo
   Construction Services, please hold while we connect you."*)
2. Twilio rings the **call order**, one number at a time, top to bottom (default: Office → Owner 1 → Owner 2 →
   General Manager → Lead PM, then any PM 2, PM 3 … an admin added). Each one rings for the card's ring seconds
   (until saved: Netlify `TWILIO_RING_SECONDS`, else 15). The caller hears ringing the whole time.
3. Whoever picks up first hears *"GrayCo call: <what they said / a new project / a current customer>. Press 1 to
   accept."* Pressing 1 connects them; anything else (or a voicemail) hangs up their phone and the next one rings.
   Nobody after the one who accepted is rung.
4. Nobody picks up → the missed call, as before: the caller gets **one** text ("Sorry we missed your call…", not again
   within 12 hours, never after STOP), a new caller becomes a **Missed call** lead in Leads → 📥 Lead Inbox, an existing
   customer gets a **📞 Call back** to-do on their job, the admins (+ PM) are e-mailed, and the caller hears goodbye.

Skipped automatically, at call time:
- a line that is turned off, or empty (no General Manager yet, no Senior PM set, a person with no phone on file);
- a person who is no longer active;
- the caller's own number (an owner calling in is not rung back);
- the line the call was **forwarded from** (Twilio `ForwardedFrom` / `CalledVia`) — see the warning below;
- our own Twilio numbers, and a number already rung earlier in the list.

A caller may wait up to *(numbers that ring) × (ring seconds)* before the text goes out — the card shows it
(5 lines × 15 s = 1 min 15 s). Every hop is its own Twilio `<Dial>`, so a long list is walked to the end.

**Cell phones and voicemail:** with "press 1 to accept" on (the default) a voicemail cannot take the call — it never
presses 1, so the next line rings. With it off, a voicemail picking up before the ring time ends counts as answered and
the list stops there; then keep the ring time below the phones' voicemail pick-up (usually 20–25 s).

## After hours (patch AFTERHOURS)

Owner (10/28): *"after hours we do not get rings that goes to automatic texts immediately unless its an emergency claim
and put into leads for the morning, if it is an emergency text or call we will get after hours mitigation manager, nick
wesley, as order"*.

- **Business hours** (card → 🕘): default Mon–Fri 7:00 AM–6:00 PM Central, Sat / Sun closed, editable per day, plus a
  holidays list (closed all day). The card shows **Open now / After hours now**. `_lib/callorder.js` exports
  `isOpen(now, settings)` — the SMS alerts' quiet hours can use the same hours.
- **After hours** the caller hears (editable): *"Thanks for calling GrayCo Construction Services. Our office is closed. If
  you have an emergency — water, fire, or storm or tree damage — press 1. For anything else, press 2 and we'll text you
  and call you back in the morning. For sales, press 3."*
  - **1 (emergency)** → *"In a few words, what happened?"* → the **🌙 after-hours emergency order** rings (default
    **Mitigation manager** — the person whose role says Mitigation Manager, skipped while there is none — → **Nick** →
    **Wesley**; editable, separate from the daytime order). Whoever answers hears *"GrayCo EMERGENCY call: <what they
    said>. Press 1 to accept."* Nobody → the missed-call text + an **EMERGENCY lead** (so the 🚨 alerts and the
    escalation calls apply).
  - **2** → nobody is rung: at once the text *"Thanks for calling GrayCo — our office is closed. We got your call and will
    call you back in the morning. Reply here with any details."* + a normal lead for the morning (e-mail alert only).
  - **3**, no input, a blocked number or a failed caller-ID check → as by day (no ring, no text, no lead).
  - With screening off, an after-hours call gets the "2" treatment (text + lead, no ring).
- Day or night, when what the caller said sounds like an emergency (water / flood / leak / burst pipe / fire / smoke / a
  tree on the house / storm damage), the missed-call lead is marked **EMERGENCY** too.
- The 🚨 escalation calls (below) use on call → the after-hours order after hours, on call → the daytime order by day.

## Admin → ⚙ Admin settings → 📞 Call order (admins only)

- **Ring in this order** on / off, **Ring each one … seconds** (8–60).
- Each line: on / off, a name (editable), and who:
  - **Office line** — the company phone (901) 585-0944;
  - **Person** — anyone in the people list with a phone (their phone / cell on file, looked up at call time);
  - **Senior PM (Lead PM)** — whoever is Senior PM in 👥 Team roles & Senior PM at the time of the call;
  - **Phone number** — a typed number.
- ↑ ↓ or drag ⠿ to reorder, ✕ to remove, **＋ Add person** for PM 2, PM 3 …
- **🛡 Screening:** on / off, the greeting, the "what work" question on / off, "press 1 to accept" on / off, blocked
  numbers, and the **last 50 calls** (menu answer, what they said, answered by / missed / sales / no input).
- **Save.** Until the first save, calls are screened and ring the default order (Office · Owner 1 = Nick · Owner 2 =
  Wesley · General Manager (empty) · Lead PM = the Senior PM), or only Netlify `TWILIO_RING_TO` when that is set.

Stored in the service-only `gc_lead_inbox_kv` → `gc_call_order` (the call log: `gc_call_log`, 200 kept) (never synced to a browser; written only through
`texts.js?callchain=1`, which checks the caller is an admin). Phone numbers are shown to admins only.

Turning **Ring in this order** off rings nobody (screened callers who press 1 / 2 get the text + lead). Turning both the
order **and** the screening off returns to the older path: every call is a missed call (the 24/7 CHAIN stays off in r12).

## Twilio console setup (owner)

1. **Netlify → Site configuration → Environment variables:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
   (`+1XXXXXXXXXX`, the GrayCo Twilio number). Optional: `TWILIO_RING_SECONDS`, `TWILIO_RING_TO` (fallback only).
   Then **Deploys → Trigger deploy**.
2. **Twilio Console → Phone Numbers → Manage → Active numbers → click the GrayCo number.**
3. **Voice Configuration → "Configure with":** Webhook, TwiML Bin, Function… → **Webhook**.
   **"A call comes in":** Webhook · URL `https://crm.grayco-cs.com/.netlify/functions/missed-call?event=voice` · **HTTP POST**.
   Leave "Call status changes" empty. Primary handler fails: leave empty.
4. **Messaging Configuration → "A message comes in":** Webhook ·
   `https://crm.grayco-cs.com/.netlify/functions/missed-call?event=sms` · **HTTP POST**.
5. **Save configuration.**
6. In the CRM: Admin → ⚙ Admin settings → 📞 Call order → check the list → **Save**.
7. Test from a phone that is NOT in the list: the menu plays — press 3 (you hear the sales message, nothing else
   happens); call again, press 1, say "test call", let every line ring through (on each phone you hear "GrayCo call: test
   call, press 1 to accept" — don't press) → one text + a lead saying "test call"; call a third time, press 1 and accept on
   the second phone. The card's "Last calls" shows all three.
Caller-ID check: Twilio adds `StirVerstat` (SHAKEN/STIR) to incoming calls when the caller's carrier signs them —
nothing to set up. A "TN-Validation-Failed…" value is treated like 3; calls without it go through the menu as usual.

Every request must carry Twilio's `X-Twilio-Signature` (HMAC-SHA1 with `TWILIO_AUTH_TOKEN` over the full URL —
including `&step=N` on each hop — plus the POST fields); anything else gets 403. If the site is reached at another
address than `https://crm.grayco-cs.com`, set Netlify `CRM_URL` to that address so the callback URLs and the signature
match.

## ⚠ The office line forwarding to the Twilio number

If the office phone (901) 585-0944 forwards unanswered calls **to** the Twilio number, and the call order rings the
office line first, a call could loop office → Twilio → office. The CRM skips the office line when Twilio reports the
call was forwarded from it (`ForwardedFrom` / `CalledVia`), and never rings the caller's own number — but not every
carrier sends the forwarding number. Pick one setup:

- **Recommended:** publish the Twilio number (or port the office number into Twilio), keep the office line's own
  no-answer forward **off**, and let the call order ring the office line first.
- If the office line must keep forwarding to Twilio: turn the **Office** line **off** in the call order (it already
  rang before it forwarded), so Twilio starts with Owner 1.

## 🚨 Emergency escalation calls (patch EMERGCALL)

Owner (10/28): *"for emergency water or fire tree damages make sure you make a phone call to who is on call / order of
call after 15 min of no answering a text"*. `netlify/functions/_lib/emergcall.js`, ticked every 2 minutes by
`x10-scheduled.js`; state in `gc_lead_inbox_kv` → `gc_emerg_calls`.

- An **emergency lead** (emergency.js: water / flood / leak, fire / smoke, a tree on the house / roof, storm damage) is
  alerted as before (e-mail, push, the 🔴 ASAP to-do, texts) and registered for escalation.
- If **nobody acknowledges it within 15 minutes** (Admin → 📞 Call order → 🚨 "after [15] min", on by default), the CRM
  **phones** (Twilio Calls API, from the GrayCo number, 25 s each) this week's **on-call person** (💧 Mitigation → 📟 On
  call), then the **📞 Call order** list, one at a time — skipping repeats and lines with no phone.
- They hear: *"GrayCo emergency. A customer reported water damage at Bartlett, 16 minutes ago, and nobody has answered
  yet. Press 1 to be connected to the customer now. Press 2 to accept and call them yourself."* **1** → connected to the
  customer (the customer sees the GrayCo number); **2** → accepted, the details arrive by text. No key / a voicemail → the
  next person. **The first key stops it.** Nobody → the whole list **once more 10 minutes later**, then the admins are
  e-mailed "nobody answered".
- **Acknowledged** (no calls, or no further calls) = ✅ Accept on the on-call page; the lead assigned / contacted / its
  stage moved in the CRM; a staff text to the customer; or a reply to the alert text (the SMS alerts call
  `emergcall.make(...).ack(leadId, why)`).
- Any hour (quiet hours do not apply). **Never while data-entry mode is on.** Every webhook (`?event=ecall`,
  `ecallkey`, `ecallstatus`) is signature-checked like the rest.

After-hours on-call paging by e-mail / push / text (`_lib/oncall.js`, `emergency.js`) is unchanged.
The older 24/7 call chain (`_lib/callchain.js`, patch CHAIN) stays off (r12); the screened 📞 Call order replaces it.
