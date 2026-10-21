# Automations AUTAI: weekly update, voice notes, COI / W-9, receipts, payments

Patch AUTAI (audit items 10, 11 and 15, plus the owner's phase 2). Every customer-facing step waits on the
approvals list (`gc_approval_queue`). No key is stored in a file: each one is a Netlify environment variable.

| What | Where | Who approves |
|---|---|---|
| 📰 Weekly customer update, Friday 2 PM Central | `netlify/functions/weekly-update.js` (scheduled) | the job's PM, with one tap |
| 🎤 Voice notes: the job, where each item goes, ✨ Smart route | 🎤 button (field: large; desk: small), `voice-intake.js` | portal posts: the PM. Staff announcements: Wesley / Nick |
| 📄 COI / W-9 fills the sub record | "📄 Drop COI / W-9" on the sub form, sub documents, `sub-doc-read.js` | a person confirms each read |
| 🧾 Receipts read themselves | Log Expense (photo or PDF) | the PM taps ✅ Confirm |
| 💵 Payments match invoices | the "💵 N payments match invoices" pill (admins, office) | Confirm. The receipt then goes out by itself (owner rule). No lien waivers |

## Setup (once)

1. **Supabase → SQL editor:** run `docs/security-data.sql` again. It adds `gc_tax_ids` to the admin-only
   class. That key holds the subs' full EIN or SSN; the sub record keeps only the masked number.
2. **Netlify → Environment variables.** These already exist: `ANTHROPIC_API_KEY`, `RESEND_API_KEY` and
   `SUPABASE_SERVICE_KEY`. Optional:
   - `OPENAI_API_KEY` or `DEEPGRAM_API_KEY`: shows "⏺ Record for transcription" in the 🎤 sheet. Without
     either, the sheet uses the phone's speech recognition or the keyboard's 🎤 dictation.
   - `AUT_AI_MODEL`: the model to use. The default is the one `bid-inbox` uses.
3. **E-mailed transcripts (Plaud, optional):**
   - Add `notes@in.grayco-cs.com` as a Resend receiving address on the same webhook as bids@, bills@ and
     claims@. Point the webhook at `/.netlify/functions/voice-intake`, or add a second webhook that does.
   - Set `VOICE_INBOUND_SECRET` (that webhook's `whsec_…`), or reuse the shared `RESEND_INBOUND_SECRET`.
   - Notes that arrive wait in the 🎤 sheet under "📥 E-mailed notes" until someone reviews them.

## The job's switches (`project.auto`, patch JA's box)

| Switch | Default | What it controls |
|---|---|---|
| `weeklyUpdate` | ON | Whether the job gets a weekly draft at all |
| `weeklyEmail` | ON | E-mail the update. JA's "Progress posts notification" must also be on, and the job needs a customer e-mail |
| `weeklyText` | OFF | Text the update. Also needs the portal setting "text" and a texting provider, which does not exist yet |

- A job without its own choice follows Admin → Automation defaults.
- A job needs an active portal link to get an update.
- A job with nothing new that week gets no update.

## For the sub portal (patch SUB)

When a sub uploads a COI or W-9, the upload handler can call:

```js
require('./sub-doc-read.js')._core.read({ buf, mime, name, subId, by, source: 'sub-portal' })
```

The read then waits for the office in the CRM ("📄 N COI / W-9 to confirm"). The CRM also finds COI and W-9
files on a sub's documents by itself.
