# CallRail → the CRM (patch AGY)

Use it the month Google Ads starts. Twilio stays for the missed-call text-back and the print / truck / yard-sign
numbers; CallRail takes the website and Google Ads. **One source per number** — never a Twilio and a CallRail number
on the same thing, or calls are counted twice.

Function: `netlify/functions/callrail.js`. Dormant until `CALLRAIL_WEBHOOK_KEY` is set.

## Setup

1. Netlify → Environment variables:
   - `CALLRAIL_WEBHOOK_KEY` — any long random string (e.g. 32 letters and digits). Redeploy.
2. CallRail → Settings → Integrations → **Webhooks** → Post-Call webhook:
   `https://crm.grayco-cs.com/.netlify/functions/callrail?key=<CALLRAIL_WEBHOOK_KEY>`
3. Recommended: copy CallRail's webhook **signing key** (same page) into Netlify as `CALLRAIL_SIGNING_KEY` and
   redeploy. Every call must then carry CallRail's signature.
4. Forward the CallRail numbers to the **office line** (901-585-0944). The office line already forwards unanswered
   calls to Twilio, so the missed-call text-back keeps working.
5. Website: add CallRail's swap script in the website editor (or `website/index.html` `<head>`), with
   (901) 585-0944 as the number to swap.
6. Google Ads: CallRail → Integrations → Google Ads, so calls count as conversions.
7. Check: `https://crm.grayco-cs.com/.netlify/functions/callrail?ping=1&key=<key>` says `ok: true`.

## What happens to each call

- Logged with the Twilio calls (`gc_mkt_calls`, `callrail: true`): source, keyword, campaign, length, answered,
  first call. Shown in the CRM (Marketing → 🔗 numbers) and the agency portal (📞 Calls, last 4 digits only).
- **First-time caller, not a customer** → an unassigned GrayCo lead in the 📥 Lead Inbox, source
  "CallRail — <source>", with the campaign / keyword / landing page and the CallRail recording link in the notes,
  and the lead's marketing source set (Google Ads, Google Business Profile, Google organic, Facebook …) so
  Marketing → Dashboard and the agency portal count it. The admins get the new-lead e-mail.
- **Unanswered** → the same lead as the missed-call text-back for that number and day (one caller = one lead).
- **Repeat caller or existing customer** → logged only.
- `CALLRAIL_LEADS=0` on Netlify: log calls only, make no leads.
