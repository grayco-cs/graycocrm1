# Insurance restoration (patch BB, ported as BB2)

The **🛡️ Insurance** tab is where GrayCo runs insurance claims. It is modeled on DASH. Every claim is linked to a regular project, so insurance jobs still live in Projects. The job shows a 🛡 badge and gets a **🛡 Claim** tab. The CRM stays the master copy. Notes, status changes, documents and estimates are copied out to the other programs.

## What changed in the port (BB2, October 21)

Patch BB was built on 33.144 and never merged. BB2 puts it on the current CRM with these changes:

- **One set of claim data with the customer-portal insurance panel (patch INSP).** Once a job has a claim, the claim holds the claim number, date and cause of loss, deductible, adjuster name and phone, adjuster meeting, mortgage company, recoverable depreciation, depreciation status and the insurance checks.
  - Opening a claim on a job takes the job's existing INSP fields and checks into the claim.
  - The 🛡 Insurance portal panel on the job shows the claim's values and saves what is typed there on the claim.
  - The customer portal (`portal.js`) reads the claim first.
  - The customer-facing switches stay on the job: **Show carrier name to customer** (default OFF), show adjuster, the claim step the customer sees.
  - A job with a claim gets the portal's insurance view. The carrier, program / TPA and adjusting companies of every claim on the job are always replaced by "your insurance company", unless the PM turns the carrier on.
- **💧 Mitigation tab.** It holds the same claims, filtered to the drying jobs (scope mitigation, a water / fire / mold job type, or any drying data). It shows active drying jobs, equipment out, readings due today, dry standard met and stalled points. Each job opens on its Drying tab. It is the Mitigation Manager's home (patch RP).
- **Milestones.** Every claim has a milestones list with dates: FNOL, first contact, site inspected, estimate uploaded / approved, work authorization, mitigation start / complete, rebuild start / complete, certificate of completion, final invoice, paid. Each date is filled from the claim, or set with "✓ Done now". SLA milestones turn green, amber or red. The claim also has a program job # and an adjuster meeting date.
- **More board KPIs.** Late SLAs, supplements pending ($ approved vs asked), deductibles collected, and A/R by carrier / program.
- **Who sees which claims.** This follows the role profiles (patch RP): a PM sees only the claims of his own jobs, and the Insurance tab only when he has one.
- The left-menu item is "Insurance" with one icon (🛡️), following the owner's one-emoji rule. The bill-inbox routing diff from the original BB is not part of BB2, because the bill inbox (patch AA) is not on this branch. `claim-inbox` works alone on its own Resend webhook.

## What is in it

- **Claims board.** One column per phase: New loss → Inspection → Estimate written → Submitted to carrier → Approved → Supplement → Work → Final invoice → Depreciation released → Closed. On a desk, you drag a card to another column. On a phone, the claims show as a list with phase chips, and each card has a "Move to" menu. Above the board are the KPIs: open claims, what carriers owe, depreciation still to collect, and average cycle times.
- **The claim page** has these tabs:
  - **Overview**
    - The claim panel: carrier, claim #, policy #, program / TPA, date and cause of loss, mitigation or reconstruction, deductible, field and desk adjusters, mortgage company.
    - The money: line items, tax, O&P, RCV, depreciation (recoverable and non-recoverable), ACV, deductible, the first check, supplements, the carrier total once depreciation is released, and paid to date. It also shows **what the carrier still owes and what the homeowner owes**.
    - Checks and payments, including checks that are waiting on a mortgage-company endorsement.
    - Cycle times, the 30 % insurance margin (cost budget) and the 5-year warranty.
  - **Estimate**
    - Upload the Xactimate **PDF**: Claude reads it into lines, rooms and totals. You can also upload an **ESX**, which is read in the browser when it can be read reliably.
    - Each upload becomes a new version. The first one is the original and later ones are supplements.
    - View the lines by room or by trade, set the carrier status of each version (Submitted, Approved and so on), and **compare any two versions** to see lines added, changed or removed, the change per room and the change in the totals.
    - If you have no file, you can type in the summary totals instead.
  - **Notes.** The journal. Next to each note you choose where it goes ("Also send to: DASH · XactAnalysis · Email · Webhook") or tick "Internal only". After you save, each note shows its status for each program.
  - **Documents.** Work authorization, which comes from the paperwork autopilot's insurance work authorization, assignment of benefits (only if you use one), photos, moisture logs, the certificate of completion, invoices, checks and carrier letters. Files are stored in crm-files and are also sent to the programs.
  - **Checklist.** The carrier and program requirements: contact, inspection, work authorization, photos, the IICRC mitigation items for water losses, estimate, submission, approval, mortgage endorsement, COC, final invoice, the depreciation request and receipt, and the warranty. Items tick themselves from what is on the claim, and you can override any of them by hand.
  - **Drying.** Moisture readings by room and material against a dry goal, plus the daily equipment log.
  - **Sync.** Which programs this claim goes to, plus its DASH job #, DASH job e-mail address, XactAnalysis assignment # and the e-mail addresses for notes. Below that is the outbox for the claim, with a Retry button.
- **⚙ Integrations** turns each program on or off and shows what each one still needs.

## Data (never inside the projects row)

| gc_kv key | What |
|---|---|
| `gc_claims` | One record per claim, keyed by id and linked to a project id. When two devices both edit, the newest fields win and the lists inside a claim (notes, estimates, payments, documents, readings, phase history) are **merged**. A delete is a soft delete and also goes on the CRM's tombstone list. |
| `gc_integration_outbox` | One item per event and program. It starts as **waiting for approval** (PM, or PM then owner), then queued, sending, sent, failed (retried with back-off) or needs API access. A stopped item is never sent. |
| `gc_claim_inbox` | Written by the server (`claim-inbox`): e-mails to claims@, with their files, the facts Claude read and the claim they match. The CRM puts matched ones on the claim. |
| `gc_integration_settings` | Which programs are switched on. This holds **no credentials**. |
| `gc_integration_sent` | Written by the server: item ids that were already sent, so nothing goes out twice. |
| `gc_xact_imports` | Written by the server: the result of each PDF read (the last 10). |

The **customer portal never shows the carrier**. `portal.js` scrubs the claim's carrier, program / TPA and adjusting company from everything the customer sees, and it already scrubs the job's own carrier field. The portal's view is a whitelist, so claim numbers, adjusters and claim money are never sent to the customer at all. A job with a claim gets the **5-year** insurance / restoration warranty.

## Server functions (Netlify)

| Function | Does | Env vars |
|---|---|---|
| `integrations` | Sends outbox items. It checks the GrayCo staff sign-in first. Actions: `status` and `send`. | see the table below |
| `claim-inbox` (+ `claim-inbox-background`) | The Resend webhook for claims@in.grayco-cs.com (see **Mail in and out**). Checks Resend's signature, ignores mail that is not for claims@, mail the CRM sent and auto-replies, keeps the files in crm-files, asks Claude for the key facts and matches the claim. It never sends e-mail. | `RESEND_INBOUND_SECRET`, `RESEND_API_KEY` (Full access), `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `CLAIM_INBOX_TO` (default `claims@in.grayco-cs.com,claims@grayco-cs.com`), `CLAIM_IGNORE_FROM`, `CLAIM_AI_MODEL` (default `claude-sonnet-5-5`), `CLAIM_INBOX_TOKEN`. |
| `xactimate-import-background` | Reads the estimate PDF from crm-files and sends it to Claude (`claude-sonnet-5-5`, structured JSON output, streamed). Writes the result to `gc_xact_imports`. It checks the GrayCo staff sign-in first. | `ANTHROPIC_API_KEY` (already set). Optional: `XACT_MODEL`, and `XACT_NO_FALLBACK=1` to turn off the server-side refusal fallback. |

## Turning the programs on: what the owner needs to get

| Program | Status today | What it needs |
|---|---|---|
| **Email to program** | Works now | `RESEND_API_KEY` (already set). Sent from **GrayCo Construction Services Claims &lt;claims@grayco-cs.com&gt;** with reply-to claims@grayco-cs.com (`CLAIMS_FROM`, `CLAIMS_REPLY_TO` change them). The subject is always "Claim #… — insured — what", so replies thread and come back in. Put the address on the claim's Sync tab (desk adjuster, TPA inbox) or set a default address in ⚙ Integrations. |
| **Generic webhook** | Works once set | `GC_WEBHOOK_URL` (https). Optional: `GC_WEBHOOK_SECRET`, which adds the header `X-GrayCo-Signature: sha256=<HMAC of the body>`. Each event is one signed JSON post with an `Idempotency-Key`. Point it at Zapier, Make or any program with an inbound URL. |
| **DASH** (Cotality, formerly Next Gear) | Needs API access | Ask Cotality for access to their **self-service API for Digital Hub Alliance members** (announced Sept 3, 2026), or for a DASH API key for your account. Then set `DASH_API_BASE` and `DASH_API_KEY`, plus `DASH_NOTES_PATH` once their documentation gives the note endpoint (the placeholder is `/jobs/{job}/notes`). **Meanwhile:** if your DASH jobs accept e-mail into the job file (ask Cotality to confirm), put the job's e-mail address on the claim and DASH notes go there by e-mail. |
| **XactAnalysis** (Verisk / Xactware) | Needs a partner agreement | Third-party integrations are switched on by your **Xactware account manager** for an approved partner (Verisk's PRS partner program). Get the API base, key and company id, then set `XA_API_BASE`, `XA_API_KEY` and `XA_COMPANY_ID` (and `XA_NOTES_PATH`). Have your XactNet address ready. |
| Contractor Connection, Alacrity / Altimeter | No public API found | Use the program checklist and Email to program. |

None of these keys are ever stored in the CRM, the browser or gc_kv. They exist only as Netlify environment variables, and only the two functions above read them.

## Xactimate: PDF vs ESX

- **PDF:** always works. Claude reads every priced line (room, category / selector, quantity, unit, unit price, tax, O&P, RCV, depreciation, ACV) and the summary (line items, tax, overhead + profit, RCV, recoverable and non-recoverable depreciation, ACV, deductible, net). The CRM then checks that the lines add up to the summary and shows a warning if they don't. Very long estimates should be split by coverage. Background functions accept up to 15 minutes; the CRM uploads the PDF to crm-files first, because a background request can carry only 256 KB.
- **ESX:** Xactware does not publish this format. The CRM unzips it (including a nested `XACTDOC.ZIPXML`) and reads XML parts that contain line items. If a part is encrypted, binary or has no lines, it says **"upload the PDF instead"**. It never guesses numbers.

## Console

`_gcClaims.open()` · `_gcClaims.status()` · `_gcClaims.outbox()` · `_gcClaims.retry([ids])` · `_gcClaims.sync()`

## ⚖ Compare: Carrier vs GrayCo

The button is on the claim header, on the Estimate tab, in easy mode and on the phone's job screen. It answers "what did the carrier take away, what did they add, what is different" line by line.

- **Two sides.** Each estimate version has a source: **Carrier** (the adjuster's or desk estimate) or **GrayCo**. On import the source comes from the PDF header (the estimator / the company the estimate is written by). If the header does not say, the CRM asks "Who wrote v2?" with two big buttons. You can change it on the version. GrayCo's side can also be an **Estimate Builder** estimate on the same job (the CRM's `estimates` list, matched by the job), shown at its sell price, or the **equipment log** (mitigation days).
- **Matching.** (1) Xactimate category + selector (e.g. RFG 300S), same room first. (2) Description similarity (abbreviations and synonyms handled), plus unit (SQ = 100 SF, SY = 9 SF) and room. (3) Optional **🤖 AI match** of the leftovers through `/.netlify/functions/claude-proxy` with `claude-sonnet-4-6` (one of the proxy's allowed models). Only the line text, quantity, unit and unit price are sent — never the customer's name, address, claim # or the carrier. A match under 75 % is shown as a **possible match** to confirm or split.
- **The result.** First the totals of both sides (RCV, depreciation, ACV, O&P, tax, deductible, ACV − deductible) and "Carrier is $X lower". Then **Missing from carrier**, **Carrier only**, **Quantity differences** (with "waste % differs?" for 3–20 % on SQ/SF/LF), **Price differences**, **O&P / tax / depreciation** (O&P not included, non-recoverable depreciation, summary-level tax and O&P) and **Matched the same**. Every line's $ difference adds up exactly to the RCV difference. Views by room and by trade, biggest $ first or A–Z. On a phone the lines are stacked cards with 48 px buttons.
- **PM actions per line.** 📝 note, 📷 photo (GrayCo Photos on the job when that patch is there, otherwise a file), **Request in supplement**, **Accept carrier**.
- **Build supplement request.** A PDF with the GrayCo logo and `TN License #85034 BCB · AR License #0486990627 · MS License #27769`: the requested items with qty, price, reason, photo references and the total requested. It is saved in crm-files and on the claim's Documents (internal; in the job's Files & Docs it is `portalShare: false`). It is then prepared as an e-mail to the adjuster and waits for the **PM, then an owner** in 📋 Approvals.
- **Saved on the claim** (`claim.compares`, with a history of every save; `claim.supplements`), synced like the rest of the claim. The board card shows "⚖ Carrier $X under". Nothing from the compare ever reaches the customer portal.

## Easy mode and the field tools

- **Easy mode is the default.** A claim opens on one big **Next step** card (one plain action, one big button), a progress strip with ✓, colored countdowns and big tiles. Text starts at 18 px with **A− / A+**; buttons are at least 48 px; every field has a one-line "What is this?". **☰ Show everything** opens the full tabs; the choice (and the text size) is remembered per person. A 🎤 sits next to the text boxes (the Speak-update hook when present, otherwise the browser's speech recognition, otherwise the keyboard's microphone).
- **Job types** (big picture buttons): Water mitigation, Fire / smoke, Mold, Storm / roof, Contents, Rebuild. Each sets its own checklist items, required documents and required photos, which tick themselves from what is entered (water: IICRC category 1–3 and class 1–4; mold: containment, air scrubbers, clearance test; fire: soot, odor, contents; storm: squares, slopes, pitch, test squares and hail hits).
- **Rooms.** L × W × H, missing walls and openings → floor, ceiling and wall SF, perimeter and cubic feet. Wet floor / wall / ceiling SF and how high the water wicked.
- **Equipment plan** (IICRC S500 guideline — the final count is the technician's call). The numbers are one block (`EQ_DEFAULTS` in the code), editable in ⚙ Integrations → Drying & equipment:
  - water class from the wet % (wet SF ÷ floor + wall + ceiling SF): < 5 % class 1, 5–40 % class 2, > 40 % class 3; class 4 is a box;
  - air movers per room: 1 + wet floor ÷ 60 (50–70) + wet wall / ceiling above 2 ft ÷ 125 (100–150) + 1 per inset over 18 in, each part rounded up;
  - dehumidifiers: cubic feet ÷ class factor (conventional 100 / 40 / 30 / n.a., LGR 100 / 50 / 40 / 40) = pints a day ÷ the unit's AHAM rating (LGR 2800i 130, LGR 7000XLi 145), rounded up;
  - desiccants and air scrubbers: cubic feet × air changes an hour ÷ 60 ÷ CFM (desiccant ACH 1 / 2 / 3 / 2; scrubbers for mold or category 3 at 4 ACH).
  The work is written out ("Kitchen: 240 SF wet floor ÷ 60 = 4, + 1 per room = 5 air movers"). **Place equipment** logs it with today's date.
- **Drying log.** Moisture points (pin / pinless, % MC or reference scale) with the dry goal; temperature and RH inside, at the dehumidifier outlet, in a dry area and outside, with GPP and dew point (Magnus, 14.696 psia); the GPP drop ("not drying" under 10, or a point that did not drop in 24 h); "readings due today"; "Kitchen is dry: remove 7 air movers?" with one-tap removal; equipment-days and monitoring days → suggested mitigation invoice lines (and a GrayCo side in ⚖ Compare). When every point is dry: **Drying complete**, the **drying report PDF** is made, and the report + mitigation invoice are prepared for approval.
- **Required photos** per job type and phase, missing ones in red (GrayCo Photos when present, otherwise a camera / file pick).
- **Timers.** Contact (1 h), on site (4 h), estimate (48 h, per program in settings) and the adjuster follow-up (every 7 days). Overdue ones turn red, go to the Next step card and to the board card.
- **Money.** Checks with payer, mailed / received / deposited and two-party endorsement; the depreciation recovery steps.
- **Papers.** Work authorization, Direction to pay, Equipment responsibility, Mold disclosure, Certificate of completion — PDFs with the logo and license line. They go out for e-sign when the portal has e-sign (`window._gcPortalESign`); this build does not, so they are printed to sign and the signed copy is added. **No assignment of benefits form**: state rules differ (TN / AR / MS) — have a lawyer check one first.
- **Contents** (item, room, photo, qty, condition, box #, clean / replace / storage), **contacts** (adjusters and carriers built from every claim, with history; "Use" puts one on a claim) and the one-tap **claim package** PDF (photos report, drying report, compare / supplement, signed papers).
- **Auto-fill.** A Xactimate PDF fills the empty claim fields (insured, address, carrier, claim #, policy #, date of loss, adjuster name / e-mail / phone, deductible) and says "Filled from the estimate" until the PM taps ✓.

## Mail in and out

**Owner rule: nothing goes to a carrier without approval.** Everything is prepared automatically and waits in **📋 Approvals** (also counted on the CRM's green 📋 APPROVE button, which opens it):
- notes (not marked Internal), status changes, photo batches (one per hour), drying reports → the claim's **PM** (an owner may approve these too);
- GrayCo estimate versions, supplement requests, invoices, the completion package (certificate of completion + depreciation request) → the **PM, then an owner** (Wesley or Nick; not the same person twice);
- one tap on **Approve & send** sends it at once and logs it in the journal; **Stop** means it is never sent;
- the first e-mail to a new address asks once whether the address is right; internal notes, costs and margins never go out; at most 40 e-mails per claim an hour; failed sends retry ("✕ not sent — retry").
Per claim (Sync tab): who gets the updates (adjuster, desk adjuster, DASH job e-mail, TPA, or anyone from the contacts) and "Prepare updates for the carrier automatically" (on by default). DASH and XactAnalysis still use their API adapters when their keys exist.

**Mail in** is automatic. A matched e-mail lands on the claim's journal (from, subject, text, files); photos go to the claim's photos, letters and invoices to Documents; a **Xactimate PDF or ESX is imported as a new carrier version** and compared with GrayCo's latest, the compare is posted to the journal and the Next step becomes "Carrier sent a revised estimate: review the compare". The facts Claude read (approved amount, depreciation, payment and check #, a re-inspection date, items the adjuster asks for) are **one-tap suggestions**; no money field changes without the tap. Matching: claim # (98 %), DASH / XactAnalysis id (95 %), policy # (90 %), insured + address (85 %), the adjuster's address (72 %, and "not sure" when the adjuster has two open claims). Under 80 % it waits in **📥 Claim mail to match** for the office.

### Owner setup checklist (once, about 20 minutes; Resend Receiving is already set up for the bill inbox)
1. **Google Admin → Groups → claims@grayco-cs.com → Members → Add** `claims@in.grayco-cs.com` (an external member). Every e-mail to claims@ is then copied to the CRM — no Gmail filter. If the group does not take outside mail, set **Who can post** to "Anyone on the web".
2. **Resend → Webhooks**: add `https://graycocrm1.netlify.app/.netlify/functions/claim-inbox`, event **email.received** (the bill inbox keeps its own webhook; each function ignores the other's mail). Put its signing secret in `RESEND_INBOUND_SECRET` (the same secret works if you reuse one webhook secret).
3. **Netlify env:** `RESEND_INBOUND_SECRET` (set), `RESEND_API_KEY` must be **Full access** (set for the bill inbox). Optional `CLAIMS_FROM`, `CLAIMS_REPLY_TO`, `CLAIM_INBOX_TO`.
4. **Resend → Domains:** grayco-cs.com must be verified for sending as claims@grayco-cs.com (it already sends as office@ / billing@).
5. **Bill inbox:** apply `fn/bill-inbox_claims.diff` to `bill-inbox.js` (patch AA) so claims mail is never read as a bill even when `BILL_INBOX_TO` is empty. AA's 43 function tests pass with it.
6. Redeploy, then open `…/claim-inbox?ping=1` — it should say `"signed":true,"ai":true,"database":true`.
7. Test: reply to any CRM claim e-mail from your phone; it appears on that claim's journal within a minute. PMs can also **forward** any e-mail to claims@ — it is matched by the claim # in the forwarded text.

## Console (more)
`_gcClaims.compare.run(claim, carrierId, graycoId)` · `_gcClaims.approvals.list(true)` · `_gcClaims.approvals.approve(refId)` · `_gcClaims.inbox.toMatch()` · `_gcClaims.p2.equipmentPlan(claim)` · `_gcClaims.p2.gpp(70, 50)`
