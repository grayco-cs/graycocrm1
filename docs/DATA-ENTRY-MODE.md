# ⏸ Data-entry mode (patch PAUSE)

Owner (10/23): *"I need a button that stops all automatic everything for the CRM … I need to enter all my data but don't
want to send invoices to people that already got invoices."*

## The switch

* **💎 → ⏸ Data-entry mode** or **Admin → ⏸ Data-entry mode** (admins only, with a confirm). Who switched it, when, and
  why are saved in gc_kv `gc_automation_pause` (`{ on, by, byName, at, since, note, lastPause }`); every change is also
  added to `gc_automation_pause_log`.
* While it is on, everyone sees an amber banner at the top: *"⏸ Data-entry mode — nothing is sent to customers, subs or
  GCs."* Admins get **▶ Resume sending** on it.
* Server: `netlify/functions/automation-pause.js` — `GET` (any staff member) → `{ paused, why, flag }`;
  `POST { on, note }` (admins only).
* Run **docs/automation-pause.sql** once in Supabase (after the other security files) so the key can only be changed
  by an admin even when written straight into gc_kv. Until then the switch still works and every send is still guarded;
  only that side door stays open.

## The one rule (enforced on the server)

`netlify/functions/_lib/pause.js` is installed on the **first line of every function file**. It wraps the global
`fetch`, so every outbound call in that function — including the shared `_lib` code — passes through it.

While the switch is on, **nothing leaves GrayCo for a customer, a sub, a GC or the public.**
E-mail **only to @grayco-cs.com addresses** (including `in.grayco-cs.com`) still goes, so staff alerts keep working.
Supabase sign-in e-mails are not affected.

**Fail closed:** if the switch cannot be read (no service key, Supabase down, a garbled answer), the CRM counts as
**paused**. The banner then says the switch could not be read.

A skipped send answers the calling code the way the provider would on success (`paused: true, skipped: 'data-entry
mode'` in the body) and logs one line `[pause] skipped …`. The calling code therefore records the item as handled:
**nothing piles up and nothing is sent later when the mode is turned off** (no burst). The automatic final-invoice
reminders run is tested this way: a paused run sends nothing and records both reminders, and the run after resuming
sends nothing.

| Host | What the functions do there | While paused |
|---|---|---|
| api.resend.com `POST /emails`, `/emails/batch` | every e-mail (invoices, reminders, portal, sub invites, bids, lead replies, newsletters, review requests, alerts) | **skipped** unless every to/cc/bcc is @grayco-cs.com |
| api.resend.com (other: inbound mail reads, domains) | reading leads@/bids@ mail | allowed |
| api.twilio.com (`Messages`, `Calls`) | SMS / calls (missed-call, on-call, portal codes, marketing texts) | **skipped** (staff numbers cannot be told apart) |
| graph.facebook.com writes | Facebook / Instagram posts | **skipped** (reads allowed) |
| open.tiktokapis.com writes | TikTok posts | **skipped** (token refresh allowed) |
| api.linkedin.com writes | LinkedIn posts | **skipped** |
| mybusiness.googleapis.com writes | Google Business posts, review replies | **skipped** |
| api.ayrshare.com writes | social posts | **skipped** |
| googleads.googleapis.com `:mutate` | Google Ads changes | **skipped** (search/reads allowed) |
| quickbooks.api.intuit.com / sandbox writes | QuickBooks invoices / payments / customers | **refused with an error** (no fake QuickBooks id is ever stored; reads allowed) |
| any other outside host, POST/PUT/PATCH/DELETE | — | **refused** (fail safe) |
| *.supabase.co, our own sites/functions (*.grayco-cs.com, *.netlify.app/.com) | data | allowed |
| api.anthropic.com, api.openai.com, api.deepgram.com | AI | allowed |
| api.companycam.com, app.companycam.com, developer.api.autodesk.com, tracerfy.com | photos, plans, skip-trace lookups | allowed |
| challenges.cloudflare.com, oauth2/accounts/www.googleapis.com, solar/tile/maps.googleapis.com, oauth.platform.intuit.com, www.linkedin.com (OAuth), tools.brightlocal.com | form check, sign-ins, maps, calendar/drive reads | allowed |
| web-push (VAPID) | phone pushes — only ever to **staff** (`gc_push_subs__<staff e-mail>`) | allowed |

## Record-only approvals

**✅ Approve all as record-only (no sending)** is in the same panel. It covers the waiting customer e-mails, invoices
and reminders, with a checkbox per kind and a confirm that shows the count.

* Each item is closed as **recorded** through `portal.js` → approval op `record` (admins only). The approval is kept on
  the item with `recordOnly: true`, and nothing is sent, whether the mode is on or off.
* A final invoice's mail row is stamped, so the automatic run never sends it later.
* E-mails queued on that computer (`gc_email_queue`) are marked recorded too.

The other approvals (sub invoices, invoice sign-offs, expenses, to-dos, lead assignments) do not e-mail anyone when
they are approved. Any e-mail they lead to comes back as a customer e-mail approval, which the mode or this button keeps
from going out.

## Not covered

* E-mail a person sends from their own Gmail (the CRM only opens Gmail) — it is their own mail client.
* Twilio SMS/calls to **staff** are skipped too while paused (can't be told apart from customers).
* Final-invoice reminders for a back-entered invoice that is still unpaid in the CRM start again 15 days after its
  record time. Enter the payment, or switch "Pause reminders" on that job.
