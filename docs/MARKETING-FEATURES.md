# Marketing features (patch MKTFEAT)

Five features the owner approved on 30 Oct 2026. All of them are in **📣 Marketing**. Nothing here posts, sends to a
customer or spends money by itself.

| Feature | Where | Who |
|---|---|---|
| 🖼 Before / after post drafts | 📱 Social posts (drafts), and the job's row on ⭐ Review tracker | made by the server; the Marketing Manager or the office edits and sends it for approval |
| ⭐ Review tracker | Marketing → ⭐ Review tracker (his ⭐ Reviews tab too) | admins, the office, the Marketing Manager |
| 🔎 Google rankings | Marketing → 🔎 Google rankings (his 📈 My leads tab too) | admins, the office, the Marketing Manager (he can edit the list of searches) |
| 📬 Monthly marketing report | the e-mail on the 1st; Marketing → 📬 Monthly report; the recipients are also on ⚙️ Focus & approvals | admins |
| 💌 Lost-lead win-back (30–90 days) | ✅ Approvals (his 🗳 Approvals too) | the office or the Marketing Manager approves |

## How each one works

- **Before / after drafts.** Every day from 9 AM Central (`mkt-feat`), a job finished in the last 45 days (status
  Completed / Closed, stage complete, 100 %, or a closeout) gets ONE draft post. It needs the customer's marketing OK
  and two photos the customer can see (`shared: true`). Sub photos, Damage photos and private photos are never used.
  The post uses a Before photo (or the oldest one) and an After photo (or the newest one). The caption names the service
  and the city only: never the customer, the street or the insurance company. At most 3 drafts a day. A deleted draft is
  never made again. No drafts are made in ⏸ Data-entry mode.
- **Review tracker.** Every job finished in the last 12 months shows:
  - **Asked:** the thank-you e-mail with the review link once it was sent through ✅ Approvals, Marketing → ⭐ Ask, or
    "✓ Asked…" (text / in person / phone call) recorded on this screen.
  - **Received:** a review linked to the job, or the Google review written in the customer's name.
  - **Per PM:** "asked 8, received 5".
  The Marketing Manager sees the city, the service and the PM, never the customer.
- **Google rankings.** Every Monday morning the CRM reads Google Search Console's average position, clicks and
  impressions for each search, for the 7 settled days. History is kept and each search shows a small trend. "Not seen"
  means Google showed no impressions that week. Nothing is ever estimated.
- **Monthly report.** It is sent on the 1st from 8 AM Central for last month, to the admins ticked under 📬 (Wesley by
  default, Nick optional; @grayco-cs.com addresses only). It contains:
  - leads, spend (marketing spend plus the ad platforms' charges), cost per lead, jobs won and sold value, all by source
    (the 📊 Dashboard numbers);
  - reviews gained and review requests sent;
  - posts published;
  - the top and the worst campaign;
  - the Google rankings.
  "Send me this month's report now" e-mails the admin who clicks it. An admin who gets this report is left out of the
  agency's report on the 1st, so nobody gets two. The agency portal's "E-mail it now" still goes to everyone.
- **Win-back, 30–90 days.** This extends the 6- and 12-month check-ins in `_lib/winback.js`. A lead lost 30–90 days ago
  gets one follow-up e-mail draft. The rules:
  - It goes from news@ with the unsubscribe link, and `{{FIRST_NAME}}` is filled in only when it goes out.
  - It is e-mail only; texts wait for A2P.
  - It is never sent twice to the same lead.
  - It skips do-not-contact and unsubscribed leads, leads who said they are not interested, leads that have since become
    customers, and commercial bids.
  - The 30 days count only from a real "lost" date.
  - At most 10 drafts are made a day, and none in Data-entry mode.
  - Leads who said they are not interested are now also skipped by the 6- and 12-month check-ins.

## Setup for the owner: Search Console (once)

1. Netlify: `GOOGLE_SA_EMAIL` and `GOOGLE_SA_KEY` are the service account the e-mail reading already uses
   (docs/EMAIL-ALL.md). If they are set, skip this step.
2. Google Cloud console: open the service account's project → APIs & Services → Library → **Google Search Console API**
   → Enable.
3. [Search Console](https://search.google.com/search-console/users): open the **grayco-cs.com** property → Settings →
   **Users and permissions** → **Add user**. Use the service account's e-mail (Marketing → 🔎 Google rankings shows it
   with a Copy button) and the permission **Restricted**.
4. Marketing → 🔎 Google rankings → **Check now**.

Optional: set `GSC_SITE` (for example `sc-domain:grayco-cs.com`) if the CRM picks the wrong property.

Switches: `MKTFEAT_BA_OFF=1` stops the before / after drafts and `WINBACK30_OFF=1` stops the 30–90 day follow-ups.

## Server

| File | What |
|---|---|
| `netlify/functions/_lib/mktfeat.js` | before / after, the tracker, Search Console, the report, the `mf_*` calls |
| `netlify/functions/mkt-feat.js` | runs every hour at :47; each part runs once at its own time; an admin can run a part now |
| `netlify/functions/soc.js` | `mf_reviews`, `mf_review_mark`, `mf_rank`, `mf_rank_terms`, `mf_rank_run`, `mf_ba_run`, `mf_report_cfg`, `mf_report_preview`, `mf_report_send`; the Marketing Manager's answers are redacted again |
| `netlify/functions/_lib/winback.js` | `due30` / `run30`: the 30–90 day follow-ups |

The state is kept in the service-only store `gc_lead_inbox_kv`, key `gc_mktfeat_v1`. It holds the before / after record
per job, the searches and their history, the report recipients and what was sent, and the "asked" records. It is never
synced to browsers. Tests: `tools/tests/test_MKTFEAT_fn.mjs` (server) and `tools/tests/test_MKTFEAT.mjs` (browser).
