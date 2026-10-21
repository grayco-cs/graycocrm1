# Field & insurance automations — patch AUTO7

| What | Where | When |
|---|---|---|
| **Final insurance closeout** — supplement check first (found → request; none → the PM's "No supplement — checked"), then the depreciation packet, follow-ups every 7 days | 🛡 Insurance → claim → **🏁 Closeout** (tile in the easy view); board strip; PM To-Do | when the claim reaches Final invoice / the job is complete; follow-ups 9 AM Central |
| **Mortgage checks** — Received → Sent for endorsement → Endorsed → Inspection requested → Released / deposited | same tab | stuck 5 days → PM To-Do + e-mail (9 AM) |
| **Photos per stage** (soft) | PM To-Do (low), Site Book, a note when the stage moves, "Continue anyway" on a final-invoice approval | never blocks |
| **7 AM dispatch** to superintendents | e-mail (+ phone push) | workdays 7:00 Central |
| **Supplier orders** (orders@) | job schedule, Site Book, portal "Materials arriving", Office To-Do for unmatched | as they arrive — see docs/ORDERS-SETUP.md |
| **Warranty tickets** — customer portal "Report an issue" | PM To-Do with a 48-hour clock; ticket dialog | 48 h unanswered → Wesley and Nick |
| **Sub scorecard** (0–100 + letter) | sub portal → Papers (at the bottom, closed); bid-package sub list sorted by score | PM rates subs 1–5 when a job completes (To-Do) |
| **One-year note** from news@ | tip per job type: Admin → 🧰 Field & insurance automations | 10 AM Central; the first ones wait on Approvals |

## Files
- `netlify/functions/_lib/fa-core.js` — the rules, shared by the server and the CRM (index.html carries a copy, written by `patch_AUTO7.py`).
- `netlify/functions/field-auto.js` — scheduled every 15 minutes (netlify.toml): dispatch, closeout follow-ups, mortgage, 48 h tickets, one-year note. An admin can run one part: POST `{ "run": "dispatch", "force": true }`.
- `netlify/functions/portal-extra.js` — the portal's Report an issue / Materials arriving; the CRM's tickets, orders, sub ratings.
- `netlify/functions/_lib/fa-orders.js` — orders@ e-mail → gc_orders, Site Book delivery.
- `bid-inbox.js` routes orders@; `portal-access.js` `p-score`; `subportal.js` sorts the bid-package subs by score.

## Data (gc_kv)
`gc_orders`, `gc_warranty_tickets`, `gc_sub_ratings`, `gc_ins_closeout` (follow-up log, server), `gc_photo_checks`,
`gc_anniv_tips`, `gc_field_auto` (once-marks). The claim's own `closeout` { supp, dep, done } and `suppMarks`; a claim
payment's `mtg` { stage, history }.

## Rules kept
- Nothing goes to a customer or an adjuster without approval the first time (the supplement request and the
  depreciation packet go through the claim's approvals; the first one-year notes through ✅ Approvals). Follow-ups
  after an approved send go by themselves.
- Never the carrier's name to the customer; never prices, suppliers or subs in the portal.
- Never blocking on photos.
