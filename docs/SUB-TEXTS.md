# 📱 Sub schedule texts (patch SUBTXT)

Subs can now get a text confirming their schedule. They answer by text or in their portal, and the PM hears right away when something is wrong.

## Turning it on for a sub

CRM → **Subs** tab → pick the sub → **📱 Schedule texts** → tick it, type their mobile number → **Save**.

- It is **off for every sub** until someone turns it on. Turning it on is the approval for these texts. They only say where and when, never prices or anything about the customer.
- It only works once texting (Twilio) is live: the Netlify variables `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM`, the SMS webhook, and A2P 10DLC registration. Until then the switch can be set, and nothing goes out.

## What the sub gets (Central time)

| When | Text |
|---|---|
| 6 PM the evening before their first day on a schedule row | "GrayCo: you're scheduled at 100 Demo St tomorrow 8 AM for Tear-off. Reply Y to confirm, or text us if anything changes. Reply STOP to opt out." |
| About an hour before the start time, each scheduled day | "GrayCo: 100 Demo St today at 8 AM. Are you on your way / at the job? Reply Y. Reply STOP to opt out." |

A row with no time is treated as 8 AM. A sub who already answered Y the evening before does not get the morning check that day.

**No texts are sent:**
- for a tentative schedule, a cancelled row, or a job that is not signed and active;
- while ⏸ Data-entry mode is on;
- to a number that texted STOP;
- for the evening text, between 8 PM and 7 AM. The morning check may go before 7 AM.

## What happens with their answer

- **Y, yes, OK or 👍:** the sub shows **✓ Confirmed**.
- **Anything else**, such as "truck broke down, be there by 10", goes to the **job's PM at once**:
  - a phone push;
  - a 🔴 ASAP To-Do with their exact words;
  - an e-mail to the PM, with the office copied.

  It also lands on the job's messages and in that sub's thread in the sub portal.
- **No answer by the start time:** the PM gets "⏰ <sub> hasn't confirmed", once.

## In the sub portal

Under each of the sub's coming days is a **⚠️ Can't make it / running late** button. The sub picks Can't make it, Running late or Something else, adds a note, and sends. The PM gets the same alert. Customers never see any of this.

## Where staff see it

On the Subs tab, the **📱 Sub confirmations — today & tomorrow** card lists ✓ Confirmed, waiting, no answer yet, and ⚠ problems with the sub's words, problems first. Other screens, such as the field view, can show the same rows through `window._gcSubConfirmFor(pid)`.

## Files

- `netlify/functions/_lib/subtxt.js`: the rules (times, who gets what, Y or not).
- `netlify/functions/sub-texts.js`: the staff calls (switch, list, confirmations), the PM alert, replies and the portal button.
- `netlify/functions/sub-texts-scheduled.js`: the clock. It runs every 15 minutes; `SUB_TEXTS_OFF=1` turns it off.
- `missed-call.js`: texts in. A reply to a schedule text is handled before anything else.
- `portal-access.js` (p-late) and `portal-app.js`: the portal button.
- Settings and state live in the server-only store (`gc_sub_texts`, `gc_sub_confirm`). Phone numbers never sit in the browser data.
