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
| AUTO-PAY | Thursday | From 6 AM the first admin / office computer with the CRM open makes the payroll run for Friday's payday (the CRM's own engine) and sends it for approval. Payroll is **every week** (AUTO-PAYWEEK): the week is Thu → Wed (hours through the cut-off in Payroll → Settings, Wednesday 11:59 PM by default; Thu–Fri roll to next week), salary is 1/52, and the run carries exactly the commission due that Friday (turned in by the Wednesday of the week before). 10 AM: the server tells the office and admins if no run is on Approvals. |
| AUTO-LIEN | every run | Sub lien waivers, **optional, default off**. 📝 Request lien waiver on the Friday pay list and at closeout; the sub signs online or uploads their own (`/.netlify/functions/lien?t=…`). Turned on per sub or per job: approved invoices / closeout ask by themselves, and only then do the pay list and closeout show a missing waiver. |
| AUTO-DIGEST | Mon–Sat, first run after 7 AM | One e-mail + phone push per approver listing what waits on them; each line opens that item in the CRM (`#appr=<id>`). ✅ Approve all routine inside the CRM, behind a confirm. |
| AUTO-SCORE | Monday, first run after 7 AM | Owner scorecard to Wesley and Nick: last week's leads by source, bids, wins, collected, A/R by age, jobs at risk, approvals and payroll waiting. |
| AUTO-ASAP | — | ⚡ Pay ASAP per sub and per sub invoice: skips the Wednesday cut-off (next pay list), sorts first on the approvals list and in Accounting ⬆ Money Out. Still needs the normal approval. |

Owner steps: none required. Confirm the hours cut-off (Payroll → Settings; Wednesday by default). Netlify `PAYROLL_ANCHOR` is no longer used. Optional:
have the lawyer read the lien waiver wording (_lib/lien.js waiverText).

## Money rules (patch AUTOMONEY, owner 10/29)

| Rule | Default | Where |
|---|---|---|
| 💰 **Deposit before scheduling** | ON for residential (remodel, kitchen/bath, retail roofing); OFF for insurance, commercial, program work | ⚡ Automation defaults (per job type) and ⚙ Automations (per job). A crew / sub day can't be added to the schedule until the deposit is recorded paid (paid deposit invoice, any paid customer invoice / payment, or "deposit paid" on the job). The job's PM or an admin gets **Schedule anyway — reason**; the office and every admin get a To-Do note + phone push, and the line is in the next 7 AM digest e-mail. Meetings / inspections / walk-throughs are never held; jobs already on the schedule before 10/29 are left as they were. |
| 📝 **Sub lien waivers required** | OFF for residential / insurance / program, ON for commercial | Same two places, plus the switch on the job bar and in the closeout panel. When ON, the sub's check moves to **Held back** on the Friday pay list (🖊 Checks to write) until the sub signs the waiver — in the **Sub Portal** (Home → Needs you / Papers → Lien waivers; typed name + drawn signature + E-SIGN consent) or on the e-mailed link. The CRM makes the PDF from the job, amount and period. Reminders every 3 days (e-mail, at most 6) while unsigned. Office / admin: **📄 Received on paper** + the scan. Sub invoices received before 10/29 are never held. The first request to a sub still waits on the approvals list. |
| 📊 **Job profit alert** | 80 % and 100 % of the job's budget | ⚙ Admin → 💰 Money rules. Budget = job costing's (estimate cost + approved COs, else contract less the target margin); costs = job costs, sub invoices, expenses, materials. The PM + admins get a push, an e-mail and a To-Do once per level; the job bar shows the notice. Checked every 10 minutes by any open CRM window that can see that job's books. |

Data: gc_kv `gc_deposit_overrides`, `gc_profit_alerts`, `gc_money_rules`; waivers stay in `gc_lien_waivers`. Code: `netlify/functions/_lib/money-core.js` (the rules, also embedded in index.html), `_lib/money-rules.js`, `money-rules.js`, `_lib/lien.js`, `_lib/lien-pdf.js`, `portal-access.js` (p-lien-sign / p-lien-pdf), `portal-app.js`, `tools/automoney_tail.js` + `tools/patch_AUTOMONEY.py`. Tests: `node tools/tests/test_AUTOMONEY.js`.

**Owner checklist:** have GrayCo's lawyer review the lien waiver wording (`_lib/lien.js` `waiverParas` — conditional progress, unconditional progress, conditional final; generic Tennessee-style text) before relying on it.
