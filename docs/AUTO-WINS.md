# Automation quick wins (patches AUTO-AR, AUTO-PAY, AUTO-LIEN, AUTO-DIGEST, AUTO-SCORE, AUTO-ASAP)

Owner, 10/24: "automate it as much as possible with only approvals". Every item below either drafts something for a
person to approve, or tells staff something. Nothing reaches a customer, sub or GC the first time without an
approval, and ⏸ Data-entry mode pauses every outward step.

`netlify/functions/auto-wins.js` runs every hour at :19 (netlify.toml). Each part acts only at its own Central time,
once (a marker in gc_kv `gc_autowins_log`). An admin can run one part now: `POST /.netlify/functions/auto-wins
{ part: 'ar' | 'pay' | 'lien' | 'digest' | 'score', force: true }`.

| Part | When | What |
| --- | --- | --- |
| AUTO-AR | daily, first run after 7 AM | Deposit / draw / change-order invoices 7, 15, 30 days past due: a reminder **drafted on the approvals list** (from billing@, PDF with the balance still open, portal link). Every one waits; the office or an admin approves. 45 days: a call to-do for the job's PM. Skips paid, history, QuickBooks copies, drafts, paused customers (Customer portal → Pause automatic e-mails), ⚙ Payment reminders off. The final invoice keeps its own reminders. |
| AUTO-PAY | Thursday | From 6 AM the first admin / office computer with the CRM open makes the payroll run for the period ending on Friday's payday (the CRM's own engine, commission by the Wednesday cut-off) and sends it for approval. Only on payday weeks (every two weeks from the anchor Friday 2026-08-21). 10 AM: the server tells the office and admins if no draft is there. |
| AUTO-LIEN | every run | Sub lien waivers, **optional, default off**. 📝 Request lien waiver on the Friday pay list and at closeout; the sub signs online or uploads their own (`/.netlify/functions/lien?t=…`). Turned on per sub or per job: approved invoices / closeout ask by themselves, and only then do the pay list and closeout show a missing waiver. |
| AUTO-DIGEST | Mon–Sat, first run after 7 AM | One e-mail + phone push per approver listing what waits on them; each line opens that item in the CRM (`#appr=<id>`). ✅ Approve all routine inside the CRM, behind a confirm. |
| AUTO-SCORE | Monday, first run after 7 AM | Owner scorecard to Wesley and Nick: last week's leads by source, bids, wins, collected, A/R by age, jobs at risk, approvals and payroll waiting. |
| AUTO-ASAP | — | ⚡ Pay ASAP per sub and per sub invoice: skips the Wednesday cut-off (next pay list), sorts first on the approvals list and in Accounting ⬆ Money Out. Still needs the normal approval. |

Owner steps: none required. Optional: Netlify `PAYROLL_ANCHOR` (a payday Friday, if the two-week cycle moves);
have the lawyer read the lien waiver wording (_lib/lien.js waiverText).
