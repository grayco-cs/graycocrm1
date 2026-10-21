# GrayCo Referral Program — stacking credit + one-time gift codes (patch REF)

**What the owner asked for:**
- Every successful referral earns the member $100–$500 of GrayCo credit.
- Credits add up into one balance per member and never expire.
- The balance works on any GrayCo work: maintenance, roofs, kitchens, bathrooms, floors, remodels, new construction.
- Any part of the balance can be turned into a one-time gift code for family and friends.

## How it works

| Step | Where | What happens |
|---|---|---|
| Join | the customer portal (🎁 Referral program card), grayco-cs.com (#referrals, "Join the referral program"), or Marketing → 🎁 Referral program | The member gets a member code (`R-XXXXXX`) and a personal link `https://grayco-cs.com/?ref=R-XXXXXX`. |
| Refer | the website form, the member's link, the portal's "🎁 Refer a friend" card, "Referred by" on a CRM lead, or the CRM | A GrayCo lead in Leads → 📥 Lead Inbox, "Referred by <member>". The admins get the new-lead e-mail. |
| Credit | automatic: hourly at :37 (`netlify/functions/referral.js`) | When the referred job takes its **first real payment** (Admin setting: or has a signed contract), $100–$500 of credit is **proposed on ✅ Approvals**. It is sized by contract: under $10k → $100, $10k–$25k → $250, over $25k → $500. An admin can change the amount; approved → it goes on the member's balance, and they get an e-mail. |
| Use credit | Marketing → 🎁 Referral program → 💳 Use credit (any staff) | Pick the member, the amount (all or part), the job, and the invoice (or "its next invoice" for an estimate). The server deducts it atomically: never below zero, never twice. The invoice gets a payment "GrayCo credit — <member>". Customers can ask in their portal; that request becomes an office To-Do. |
| Gift code | the member, in their portal (shown once and e-mailed to them); or an admin for them, through ✅ Approvals | `GC-XXXX-XXXX-XXXX` for any amount up to the balance (at least $10); the rest stays in the account. Only the code's SHA-256 hash and last 4 characters are kept. No expiration. |
| Use a gift code | Marketing → 🎁 Referral program → A gift code (staff), or the customer portal | Works **once** on any job ("This gift code was already used on <date>" after that). The invoice gets a payment "Gift code …1234". An admin can cancel an unused code, and its amount goes back to the member's balance. Wrong codes are rate-limited: 8 per hour per person or address, 150 per hour overall. |

**What GrayCo owes** is shown in Marketing as: members' balances + unused gift codes.

## Ready-made ads

There are four ads in Marketing → 🎁 Referral program → 📣:
- kitchen social post
- "stack your credits" social post
- short ad
- flyer / door-hanger blurb

An admin can edit them. Each has Copy and "Make a social post". The ones marked **Autopilot** are posted by the Marketing Autopilot (`_lib/mkt.js`) about once a month, still through approval.

## Where things are kept

Everything is in the service-only `gc_lead_inbox_kv` table, never synced to a browser:

| Key | Holds |
|---|---|
| `gc_ref_members` | members |
| `gc_ref_referrals` | referrals |
| `gc_ref_ledger` | every credit, use, gift code and cancel (the balance is its sum) |
| `gc_ref_cards` | gift codes: hash and last 4 only |
| `gc_ref_settings` | settings and ads |
| `gc_ref_rl` | the guessing limit |

## Setup

Nothing new on Netlify. `REFERRAL_OFF=1` stops the hourly proposals.
