# 📤 Sent by the CRM · 📬 Waiting on a reply (patch SENTLOG)

Owner, 10/24: "I want to be able to see my auto and resend e-mails — I sent one to Alec about a COI, I like that — I would
like office and admin to see those e-mails so they can follow up on them if someone ignores, say, an insurance request."

## What it shows

**📤 Everything sent.** Every e-mail the CRM sent, whether automatic (COI renewals, reminders, bid results requests,
portal links…) or from someone's "send" button (including e-mails sent from your own address in the CRM):

- to, subject, job, who sent it (a person, or "automatic (coi-request)" and so on), when;
- its type: COI request, W-9 request, insurance request, customer document request, lien waiver request, signature
  request, bid results request, invoice, reminder, portal link, bid, estimate / proposal, schedule, warranty, news,
  internal (staff only), text message, other;
- its status: sent, ⏸ paused (Data-entry mode was on), failed, and — once the Resend webhook below is set up —
  delivered, delayed or bounced;
- a row opens the e-mail exactly as it was sent (its body is kept from now on; older ones show the first line).

Filters: type, status, job, "waiting on a reply", and a search. The last 3 months.

**📬 Waiting on a reply** (office and admins). Every e-mail that asked for something (COI, W-9, insurance papers,
customer documents, a lien waiver, a signature, bid results) is "⏳ waiting" until:

- the person replies (to an in.grayco-cs.com address, or — once the Google service account is set up — to any GrayCo
  mailbox), or
- the thing shows up in the CRM: the sub uploaded the COI / W-9 in the sub portal, or the customer answered every
  "We need from you" item, or
- someone presses **✓ Mark resolved**.

After 3 work days with no answer (2 for insurance requests; each type can be changed by an admin, ⚙ at the bottom of
the list) it goes on the shared Office To-Do as "📬 No reply — follow up", with:

- **📨 Resend reminder** — the same e-mail again, "Following up:", from office@ (replies go to whoever sent the first
  one). Customer and insurance reminders wait on ✅ Approvals, the same as the first e-mail did.
- **📞 Call** — the phone number on file.
- **✓ Mark resolved**.

After 2 reminders with no answer the admins get it too (🟠 Soon; 🔴 ASAP for insurance requests). A bounced request
shows at once. Nothing is followed up while it was paused, or when it failed.

## Who sees what

- Admins and the office: everything.
- A PM: only the e-mail about his own jobs (the "Everything sent" list), no follow-up buttons.
- Marketing, and everyone else: nothing.

The server (`netlify/functions/mail-sent.js`) checks this on every call. Bodies and the follow-up list are kept server-side
only (`gc_lead_inbox_kv`, never synced to a browser).

## Where

- **Email Center** (Gmail tab) — the "📤 Sent by the CRM" card.
- **🏢 Office Manager Dashboard** — the "📬 E-mail follow-ups" strip.
- **To-Do** — "📬 Waiting on a reply (N)" for the office and admins, and the "📬 No reply — follow up" items.

## One setup step (optional): delivery and bounces

1. Resend → **Webhooks** → **Add endpoint**: `https://crm.grayco-cs.com/.netlify/functions/mail-events`
2. Events: `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`.
3. Copy its **signing secret** → Netlify → Environment variables → `RESEND_EVENTS_SECRET` → **Trigger deploy**.

Without it, the list shows sent / paused / failed only.

## Files

- `netlify/functions/_lib/sentlog.js` — types, bodies, the follow-up rules
- `netlify/functions/mail-sent.js` — the API (list, get, followups, resend, resolve, settings)
- `netlify/functions/mail-followup-scheduled.js` — hourly: answered by the CRM? overdue → To-Do, escalate
- `netlify/functions/mail-events.js` — Resend's delivery webhook
- `_lib/pause.js` (every send is typed and its body kept), `bid-inbox.js` and `mail-all.js` (replies answer requests)
