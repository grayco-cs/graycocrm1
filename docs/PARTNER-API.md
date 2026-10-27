# Partner API — let anyone post into the CRM with a GrayCo code

> "I need to make sure I can add APIs from my CRM so anyone can post jobs, leads etc into my CRM once I give them a code." — owner, 10/21

A lead company, a GC, a claims network or any partner can send **leads, bids, jobs or notes** straight into the CRM from their own system. You decide who gets a code and what it may send, and you can turn a code off any time. **Nothing to set on Netlify.**

## For you (admins): making a code

1. **Admin → Admin settings → 🔑 API access.**
2. Type the partner's name. Tick what they may send:
   - **Leads**
   - **Bids**
   - **Jobs / work orders**
   - **Notes on a job (by PO)**

   You can also add a note (e.g. their rep) and a date the code stops working.
3. Press **🔑 Make the code**. The code (`gck_…`) is shown **once**. Copy it and send it to them privately (text, phone, or a separate e-mail). The CRM keeps only a fingerprint (a SHA-256 hash), so nobody can read it back later, not even an admin.
4. Press **📄 Instructions** and send them the text. It has the web address, the header, every field and a ready-to-run example. It never contains the code.
5. The list shows each code: what it may send, who made it, when it was last used, how many posts, and the last problem.
   - **Revoke** turns a code off at once.
   - A lost code can't be shown again: revoke it and make a new one.

Roofing Ignite and the other lead companies set up earlier with Netlify keys (`LEAD_KEY_…`, lead-intake.js) keep working as before.

## What happens to what they send

| They send | Where it lands |
|---|---|
| **lead** | Leads → 📥 Lead Inbox, source = the partner, **nobody assigned**. You and Nick get the "🔌 New lead from …" e-mail at once. The 4-hour / 24-hour "assign / reach out" reminders apply, and the ✅ Contacted button shows on it. |
| **bid** | Leads → 📥 Lead Inbox as a bid. **Bid due and due-to are required.** Commercial bids go to the Senior Estimator (Glenn). The new-lead e-mail and the "⏰ Bid due" reminders apply. |
| **job** | **Not a live job** (a job carries money). It becomes **🚀 New job from …** under ✅ Needs approval on the To-Do of you and Nick; the office sees it as waiting on you. You also get an e-mail. **✅ Approve** opens **Launch Job** filled in (name, customer, address, phone, e-mail, scope, contract, start date). Check it, pick the PM, launch: the job gets its PO the normal way, and the approval clears itself. |
| **note** | Matched to the job by its **PO number**. It goes on the job's message board (the PM tagged) and becomes a to-do for that PM. |

Sending the same thing again with the same `external_id` makes no duplicate.

## For the partner: how to send

`POST https://crm.grayco-cs.com/.netlify/functions/partner-api`

- Header `x-api-key: <your GrayCo code>` (or `Authorization: Bearer <code>`)
- JSON body, with `kind` set to `lead`, `bid`, `job` or `note`.

| kind | required | optional |
|---|---|---|
| lead | `name`, and `phone` or `email` | `address`, `city`, `state`, `zip`, `service`, `message`, `external_id` |
| bid | `title`, `bid_due` (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, Central), `due_to` | `due_to_contact`, `due_to_email`, `due_to_phone`, `submit_method` (email / portal / sealed / in_person), `submit_where`, `address`, `city`, `state`, `type`, `scope`, `plans_url`, `bid_number`, `external_id` |
| job | `name`, `client`, `address` | `phone`, `email`, `type`, `scope`, `contract`, `start_date`, `notes`, `external_id` |
| note | `po`, `text` | `author` |

```bash
curl -X POST 'https://crm.grayco-cs.com/.netlify/functions/partner-api' \
  -H 'Content-Type: application/json' -H 'x-api-key: YOUR-GRAYCO-CODE' \
  -d '{"kind":"lead","name":"Jane Doe","phone":"901-555-1212","email":"jane@example.com","address":"123 Main St","city":"Bartlett","state":"TN","service":"Roof replacement","external_id":"L-1001"}'
```

Answers:

| Code | Meaning |
|---|---|
| `200 {"ok":true,"id":"…"}` | Accepted |
| `400` | A field is missing or wrong; the answer names it |
| `401` | Wrong code |
| `403` | The code may not send that, has expired, or was turned off |
| `404` | No job has that PO (notes) |
| `429` | Too many posts this hour; wait and send again |

## Technical

- **Function:** `netlify/functions/partner-api.js`, with tests in `test_API_fn.mjs`.
- **Codes:** stored as `gc_partner_keys` in the service-only `gc_lead_inbox_kv` table (the Lead Inbox's own store). The browser never reads it; admin requests go through the function with the CRM sign-in, and gc_staff must say **admin**.
- **Rate limit:** 120 posts per code per hour; set `PARTNER_API_RATE` to change it.
- **Off switch:** `PARTNER_API_OFF=1` refuses every post.
- **Leads and bids:** the same Lead Inbox items as bids@ and the website form.
- **Jobs:** written to the shared to-do list `gc_office_tasks` as `kind: 'partner_job'`. To-Do (TD2) shows it as an approval for admins. Launch Job is filled in through `window._gcLaunchPrefill`, and the approval is closed when a job whose notes carry `[API job <id>]` exists.
- **Notes:** written to `gc_job_messages` and `gc_office_tasks`.
- **CRM side:** patch API (`<script id="gc-patch-api">`, wAPI/patch_API.py).
