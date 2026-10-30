# Lien deadline tracker: rules for the lawyer to review

**Status: DRAFT. Every rule below needs confirmation by GrayCo's lawyer.** The CRM shows these dates as *planning estimates only, not legal advice*, and marks every one "confirm with your lawyer".

## What the CRM does

The tracker is optional and set per job. On the job page, go to 🧰 Job tools → ⚖️ Liens & waivers and turn on **Track lien deadlines**. It is off by default.

When it is on, the CRM:

- works out the deadlines below from the job's state, GrayCo's role on the job and the job's dates;
- puts a reminder on the Office To-Do 21 days before each "aim" date, then ticks the reminder off when the office marks the step done.

The CRM never files, records or sends a lien notice. It only reminds the office.

The rules are written to be **conservative**:

- **Last day of work.** If the office has not entered it, the CRM uses the earliest past date the job record has: the completion date, the date the job was marked complete, or the scheduled end date. An earlier start date gives earlier deadlines.
- **Aim date.** The office is asked to finish each step by an aim date that falls *before* the last day the statute allows. This leaves time for mail, service and recording. The gap is shown in the "Aim" column below.
- **Uncertain cases.** Where a rule may not apply to a kind of job, the CRM shows a note telling the office to ask the lawyer. It does not show a date for these.

The code lives in `netlify/functions/_lib/lien-deadlines.js`. The CRM page carries an identical copy, and a test checks that the two match. The version is `2026-10-30`.

## Inputs (job page → ⚖️ Liens & waivers)

| Input | Default | Notes |
|---|---|---|
| State | Taken from the job's state, then from its address (TN / AR / MS) | The office can change it. No dates are shown for any other state. |
| GrayCo is | **Sub** for a GC job (`gcJob` / `hiredByGc`), otherwise **prime contractor** | The office can change it. |
| Residential | **Residential** unless the job type says commercial, government, church, school, retail, TI and so on | The office can change it. |
| Start date | The job's start date (`startDate` / `constructionStart`) | The office can override it. |
| Last day of work | Entered by the office; otherwise the earliest past completion date or end date | Enter it when the job finishes. |
| Lien filed on | Entered by the office | Only used for the deadline to file suit. |

## The rules

| ID | State | Applies to | What | Last day (by statute, as we read it) | Aim | Source |
|---|---|---|---|---|---|---|
| TN203 | TN | Prime, residential | Notice of lien rights to the homeowner | Before work starts (start date) | 3 days earlier | Tenn. Code Ann. § 66-11-203 |
| TN112 | TN | All | Record the Notice of Lien with the register of deeds and serve it on the owner | 90 days after the improvement is complete or abandoned (counted from the last day of work) | 14 days earlier | Tenn. Code Ann. § 66-11-112(a); service under § 66-11-115 |
| TN106 | TN | Prime | Lawsuit to enforce the lien | 1 year after completion or abandonment. The CRM uses 365 days from the last day of work. | 45 days earlier | Tenn. Code Ann. § 66-11-106 |
| TN145 | TN | Sub, non-residential | Notice of nonpayment to the owner and the GC, **for each month worked** | 90 days after the last day of each month in which work was done | 14 days earlier | Tenn. Code Ann. § 66-11-145 |
| AR115A | AR | Prime, residential | Residential notice to the owner (the wording is set by statute) | Before work starts | 3 days earlier | Ark. Code Ann. § 18-44-115(a) |
| AR114 | AR | All | 10-day notice of intent to lien, to the owner | At least 10 days before filing, so by day 110 after the last work | 10 days earlier | Ark. Code Ann. § 18-44-114 |
| AR117 | AR | All | File the lien with the circuit clerk, with the affidavit of notice | 120 days after the last labor or materials | 10 days earlier | Ark. Code Ann. § 18-44-117 |
| AR119 | AR | All | Lawsuit to enforce | 15 months after filing (the day before the 15-month date) | 45 days earlier | Ark. Code Ann. § 18-44-119 |
| MS409 | MS | Residential | Pre-lien notice to the homeowner | At least 10 days before filing, so by day 80 after the last work | 7 days earlier | Miss. Code Ann. § 85-7-409 |
| MS405 | MS | All | File the claim of lien with the chancery clerk | 90 days after the last work or materials | 14 days earlier | Miss. Code Ann. § 85-7-405(1)(b) |
| MS421 | MS | All | Lawsuit to enforce | 180 days after filing | 30 days earlier | Miss. Code Ann. § 85-7-421(1). Some sources cite § 85-7-423. |

### Notes shown instead of a date (ask the lawyer)

- **TN, sub, residential:** on 1–4 family residential work, a sub or remote contractor generally has no lien against the homeowner.
- **TN, any job:** if the owner records a Notice of Completion, the time to act can be much shorter (§ 66-11-143). This is shown with TN112.
- **AR, sub, commercial:** a sub may need an extra notice under § 18-44-115(b).
- **MS, sub, commercial:** a claimant with no contract with the prime contractor must give a 30-day notice (§ 85-7-407(2)).

## Questions for the lawyer

1. **Coverage.** Are these the right rules for each kind of job GrayCo does: prime residential, prime commercial, and sub to a GC? Is anything missing, such as the TN residential "notice to owner" content or the AR 2021 home-improvement changes?
2. **Triggers.** Is "last day of work" the right trigger in each state, or should some rules count from "completion or abandonment"? The CRM uses the earlier of the two dates the record has.
3. **Aim dates.** Are the aim dates (the buffers before each statutory last day) enough for service by certified mail and for recording?
4. **Waiver wording.** The lien-waiver wording (owner to-do: "lien waiver wording to lawyer") is editable in the CRM. Go to 🧰 Job tools → ⚖️ Liens & waivers → ✏️ Waiver wording. It covers four forms:
   - the sub's conditional progress waiver;
   - the sub's conditional final waiver;
   - GrayCo's conditional waiver to a customer;
   - GrayCo's unconditional waiver to a customer.

   Until someone edits a form, the built-in text is used, marked "DRAFT — GrayCo's lawyer is reviewing it". A sub's waiver keeps the wording that was in place on the day it was requested.

## Lien waivers per payment (same panel)

**Customer payments (GrayCo's waiver).** For each client invoice on the job, the office can prepare a conditional or unconditional waiver. An unconditional waiver needs a recorded payment. It goes on ✅ Approvals as kind `lien_waiver` and is e-mailed only once approved. There is one open waiver per invoice and kind. The job's ⚙ Automations "📑 Lien waivers with payments" switch is respected.

**Sub payments (the sub's waiver).**

- For each sub invoice on the job, the panel shows whether a waiver was requested, is waiting for approval, was signed or uploaded (received), or was marked received by hand (conditional or unconditional).
- **Request waiver** uses the existing kind `sub_lien_request`. From this panel the request always waits on ✅ Approvals, even for a sub who has been contacted before.
- The existing automatic rule in `_lib/lien.js` (switched on per sub or per job) is unchanged. Under that rule, after a sub's first approved request, later requests to the same sub go out by themselves.
