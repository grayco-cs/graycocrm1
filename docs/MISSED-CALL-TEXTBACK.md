# Calls to the GrayCo number: 📞 call order and missed-call text-back

`netlify/functions/missed-call.js` (patches AUTO6, CALLCHAIN) · `netlify/functions/_lib/callchain.js` · Admin → ⚙ Admin settings → 📞 Call order

## What happens when someone calls the GrayCo Twilio number

1. The caller hears: *"Thanks for calling GrayCo Construction Services, please hold while we connect you."*
2. Twilio rings the **call order**, one number at a time, top to bottom (default: Office → Owner 1 → Owner 2 →
   General Manager → Lead PM, then any PM 2, PM 3 … an admin added). Each one rings for the card's ring seconds
   (until saved: Netlify `TWILIO_RING_SECONDS`, else 15). The caller hears ringing the whole time.
3. The first person who picks up gets the call. Nobody after them is rung.
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

**Cell phones and voicemail:** if a phone's voicemail picks up before the ring time is over, Twilio counts that as
answered and the list stops there (the caller leaves a voicemail on that phone). Keep the ring time shorter than the
phones' voicemail pick-up (usually 20–25 s; 15 s is safe), or turn voicemail pick-up later on those phones.

## Admin → ⚙ Admin settings → 📞 Call order (admins only)

- **Ring in this order** on / off, **Ring each one … seconds** (8–60).
- Each line: on / off, a name (editable), and who:
  - **Office line** — the company phone (901) 585-0944;
  - **Person** — anyone in the people list with a phone (their phone / cell on file, looked up at call time);
  - **Senior PM (Lead PM)** — whoever is Senior PM in 👥 Team roles & Senior PM at the time of the call;
  - **Phone number** — a typed number.
- ↑ ↓ or drag ⠿ to reorder, ✕ to remove, **＋ Add person** for PM 2, PM 3 …
- **Save.** Until the first save, calls keep the old behaviour (below). After saving, "Rings now" shows the order.

Stored in the service-only `gc_lead_inbox_kv` → `gc_call_chain` (never synced to a browser; written only through
`texts.js?callchain=1`, which checks the caller is an admin). Phone numbers are shown to admins only.

Fallbacks: nothing saved, or the call order turned off → Netlify `TWILIO_RING_TO` (one number for
`TWILIO_RING_SECONDS`), else every call is treated as a missed call (the office line forwards its missed calls here).

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
7. Test from a phone that is NOT in the list: the hold message plays, the first line rings; let it ring through the list
   once and confirm the text and the lead; then call again and answer on the second line.

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

After-hours emergency paging (`_lib/oncall.js`, `emergency.js`) is unchanged: calls ring the same call order day and night.
