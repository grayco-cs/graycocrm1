# EPA / HUD lead & asbestos requirements matrix (EPAHUD)

**What this is:** the documents, notices, records and actions that EPA, HUD, OSHA and the Tennessee, Arkansas and
Mississippi programs require of GrayCo for lead and asbestos work. Each row shows who acts and when, the GrayCo
document or CRM action that covers it, and whether GrayCo has it (**HAVE**), has part of it (**PARTIAL**), or did not
have it (**MISSING** → built in this branch, marked ✚).

**What this is not:** legal advice. The rule text was read on the official sources on 11/17/2026 (eCFR "up to date as
of 11/13/2026", epa.gov, hud.gov, osha.gov, tn.gov, healthy.arkansas.gov, mdeq.ms.gov). Confirm each item with your
state program or attorney. Every new GrayCo form says "Based on <rule>. … confirm with your state program / attorney"
and marks the fields the owner must confirm with ⚑.

**GrayCo facts used:** works in TN, AR, MS. The owner holds an EPA RRP renovator certificate (initial course 11/06/2026,
Arlington TN) and a lead abatement supervisor course (Seagull Environmental Training, initial 11/16/2026, Atlanta;
Arkansas Dept. of Health accepts it). Lead work = RRP renovation + lead abatement. Asbestos work = a hired licensed
abatement contractor (GrayCo crew: awareness only). Records are kept **forever** (owner's rule; the legal minimum is
shorter).

**Where it lives in the CRM:** each paper is a 📚 library form (fills itself from the job, prints / saves / sends with the
job's company letterhead) and a row of 📑 *Paperwork by job type* (admin-editable) with who it goes to, when it is due
and the rule. The PM sees "📑 N papers to send" on the job and on GrayCo Field → Needs you, sends each by 👤 portal
(e-sign where it is signed), ✉️ e-mail, 📱 text (portal link) or 📤 share from the phone, or marks a filing 🏛 Filed;
every send / share / sign / view is logged on the paper. Overdue → To-Do for the PM, 2 days late → the office + admins.
People / company: 📜 Certifications + 🛡 Compliance (ENVCOMP) by job kind and state; scheduling an uncertified person on a
lead / asbestos / mold job is blocked (admin override logged); emergency mitigation jobs only warn.
Levels (dust, soil, paint, water, blood, OSHA): one admin-edited record, gc_kv `gc_lead_levels` ("IMPORTANT LEVELS —
2026 v.3"); every paper that cites a level reads it and is stamped with the version it used.

## Counts

| | HAVE | PARTIAL | MISSING (built ✚) | Total |
|---|---:|---:|---:|---:|
| A · EPA RRP (40 CFR 745 Subpart E) | 8 | 3 | 7 | 18 |
| B · Lead abatement (40 CFR 745 Subpart L + TN / AR / MS) | 4 | 3 | 3 | 10 |
| C · HUD Lead Safe Housing Rule (24 CFR 35) + disclosure | 1 | 2 | 7 | 10 |
| D · Asbestos NESHAP (40 CFR 61 Subpart M) + OSHA 1926.1101 | 5 | 4 | 3 | 12 |
| E · People (certifications / training / medical) | 7 | 3 | 6 | 16 |
| F · Company (firm certifications, licenses, programs, insurance) | 5 | 3 | 4 | 12 |
| **Total** | **30** | **18** | **30** | **78** |

"MISSING" rows were built in this branch unless the row says "owner action" (something only the owner can do, e.g.
apply for a state certificate).

## A · EPA Renovation, Repair and Painting (RRP) — 40 CFR 745 Subpart E

Applies to renovation for compensation that disturbs paint in pre-1978 housing or child-occupied facilities (above the
minor-repair thresholds). Mississippi runs its own RRP program (MDEQ); Tennessee and Arkansas RRP is EPA-administered
(Tennessee also has its own residential renovation rule, TN Rule 0400-13-01-.03, with the same pamphlet steps and 3-year records).

| # | Requirement | Who / when | GrayCo document / CRM action | Status |
|---|---|---|---|---|
| A1 | Pamphlet *Renovate Right* to the owner; signed acknowledgment — no more than 60 days before work ([745.84(a)(1)](https://www.ecfr.gov/current/title-40/section-745.84)) | Firm → owner, before start | Lead 01 (🔒 Start job waits) | HAVE |
| A2 | …or certificate of mailing obtained ≥ 7 days before work ([745.84(a)(1)(ii)](https://www.ecfr.gov/current/title-40/section-745.84)) | Firm, start − 7 days | ✚ Lead 08 proof of delivery (due = start − 7) | MISSING → built |
| A3 | Owner does not occupy: pamphlet to an adult occupant + acknowledgment, or a signed certification of attempted delivery (address, date, method, who delivered, why no signature) ([745.84(a)(2)](https://www.ecfr.gov/current/title-40/section-745.84)) | Firm → adult occupant | Lead 01 (owner+occupant) + ✚ Lead 08 part B | PARTIAL → built |
| A4 | Common areas of multi-unit housing: written notice to each affected unit (nature, locations, dates, how to get the pamphlet + records free) or posted signs ([745.84(b)(2)](https://www.ecfr.gov/current/title-40/section-745.84)) | Firm → occupants, before start | ✚ Lead 09 common-area notice (fact: common areas) | MISSING → built |
| A5 | Revised notice when the scope, locations or dates change, before the extra work ([745.84(b)(4)](https://www.ecfr.gov/current/title-40/section-745.84)) | Firm → occupants | ✚ Lead 09 "revised notice" box | MISSING → built |
| A6 | Signed, dated statement of the notification steps (common areas; child-occupied facilities) ([745.84(b)(3), (c)(3)](https://www.ecfr.gov/current/title-40/section-745.84)) | Firm, before start | ✚ Lead 10 | MISSING → built |
| A7 | Child-occupied facility: pamphlet to owner + adult representative; parents / guardians informed (mail / hand / posted) ([745.84(c)](https://www.ecfr.gov/current/title-40/section-745.84)) | Firm → facility, parents | Lead 02 (+ Lead 08 for the representative) | HAVE |
| A8 | Firm certification (EPA; MDEQ in Mississippi), 5 years; apply 90 days before expiry ([745.89](https://www.ecfr.gov/current/title-40/section-745.89)) | Company | 📜 Certifications: EPA RRP firm (TN/AR), MDEQ firm (MS); 🛡 rule `rrp-firm`, ✚ `rrp-firm-ms` | HAVE |
| A9 | A certified renovator assigned to each job; on site for signs, containment, cleaning; on-the-job training for non-certified workers ([745.90](https://www.ecfr.gov/current/title-40/section-745.90)) | Firm | 🛡 `rrp-renovator`; Lead 04 training record; ✚ auto-fill names the renovator + # | HAVE |
| A10 | Work practices: signs, containment, prohibited practices, waste ([745.85(a)](https://www.ecfr.gov/current/title-40/section-745.85)) | Renovator, during | Lead 06 supply list, warning signs, ENVCOMP daily log | HAVE |
| A11 | Cleaning verification (wet / dry cloths vs. the EPA card) or dust clearance ([745.85(b)](https://www.ecfr.gov/current/title-40/section-745.85)) | Renovator, after cleaning | ✚ Lead 11 cleaning verification record (cloth counts) | MISSING → built |
| A12 | Test kit / paint chip results to the person who contracted, within 30 days ([745.86(b)(1), (c)](https://www.ecfr.gov/current/title-40/section-745.86)) | Firm → owner | Lead 05 + EPA test kit form, paint chip guide | HAVE |
| A13 | Post-renovation compliance information to the owner AND an adult occupant **when the final invoice is delivered or within 30 days, whichever is earlier** ([745.86(c)](https://www.ecfr.gov/current/title-40/section-745.86)) | Firm | Lead 03 (said "within 30 days" only) → due rule now "final invoice or 30 days"; ✚ Lead 12 occupant copy | PARTIAL → fixed + built |
| A14 | Common areas: post the records or how to get them ([745.86(c)(2), (d)(3)](https://www.ecfr.gov/current/title-40/section-745.86)) | Firm | ✚ Lead 12 posting record | MISSING → built |
| A15 | Dust sampling report (when used instead of cleaning verification) to owner / occupant, same timing ([745.86(d)](https://www.ecfr.gov/current/title-40/section-745.86)) | Firm | Lead 03 clearance box + ✚ Lead 12 checklist | PARTIAL → built |
| A16 | Records kept 3 years after completion (acknowledgments, mailing certificates, notification statements, training, renovator certification, work-practice checklist) ([745.86(a)–(b)](https://www.ecfr.gov/current/title-40/section-745.86)) | Firm | RRP recordkeeping checklist (company-docs), all papers in the job file; kept forever (ENVCOMP retention + the paper log) | HAVE |
| A17 | Emergency renovation: document the emergency and the steps not followed ([745.86(b)(6)](https://www.ecfr.gov/current/title-40/section-745.86)) | Firm | JOBDOCS emergency jobs never blocked; note on Lead 03 | HAVE |
| A18 | Mississippi: LBP project notification (MDEQ form rev. 7/2025) 6 working days before regulated work ([MDEQ](https://www.mdeq.ms.gov/air/lead-based-paint/lead-based-paint-activities-and-project-notification/)) | Firm → MDEQ | ✚ 🛡 notice `rrp-notice-ms` (⚑ confirm renovation scope with MDEQ) | MISSING → built |

## B · Lead abatement — 40 CFR 745 Subpart L and the state programs (TN TDEC, AR ADH, MS MDEQ — all EPA-authorized)

| # | Requirement | Who / when | GrayCo document / CRM action | Status |
|---|---|---|---|---|
| B1 | Notification before abatement: EPA model 5 business days (received); updates for earlier / later start, location, cancellation, > 20 % area change ([745.227(e)(4)](https://www.ecfr.gov/current/title-40/section-745.227)) — **TN** 5 business days + fee (Rule 0400-13-01, [TDEC](https://www.tn.gov/environment/toxic-substances-program/lead-hazard-program/notification-of-lead-paint-activities.html)); **MS** 6 working days ([MDEQ](https://www.mdeq.ms.gov/air/lead-based-paint/lead-based-paint-activities-and-project-notification/)); **AR** ADH Notice of Intent + revision form ([ADH](https://healthy.arkansas.gov/wp-content/uploads/ADH_Lead-Based_Paint_Notice_of_Intent.pdf); GrayCo index says 10 working days ⚑) | Firm → state | env lead notification worksheet (HAVE) + ✚ Lead 14 state checklist with update rules; 🛡 notice days filled (TN 5, MS 6, AR 10 ⚑) | PARTIAL → built |
| B2 | Written occupant protection plan, unique to the dwelling, by a certified supervisor / project designer, before abatement ([745.227(e)(5)](https://www.ecfr.gov/current/title-40/section-745.227)) | Supervisor | Lead 07 (PDF in company-docs) | HAVE |
| B3 | Certified supervisor on site for preparation and cleanup; else reachable within 2 hours ([745.227(e)(2)](https://www.ecfr.gov/current/title-40/section-745.227)) | Firm | 🛡 `la-sup` (block) | HAVE |
| B4 | Prohibited practices (open flame, uncontrolled sanding / blasting, heat gun ≥ 1100 °F, dry scraping limits) ([745.227(e)(6)](https://www.ecfr.gov/current/title-40/section-745.227)) | Crew | Lead Safety Program, Toolbox Talks | HAVE |
| B5 | Post-abatement visual + dust sampling by a certified inspector / risk assessor (≥ 1 h after cleanup); action levels **floors 5 / sills 40 / troughs 100 µg/ft² from 1/12/2026** ([745.227(e)(8)](https://www.ecfr.gov/current/title-40/section-745.227)) | Independent inspector | env clearance record (levels now read from `gc_lead_levels`) + ✚ HUD 04 clearance examination | PARTIAL → built |
| B6 | Abatement report by the supervisor / project designer: dates, firms, supervisors, occupant protection plan, clearance sampler + lab + results, description per component, **dust-lead hazard statement** when results are between the reporting and action levels ([745.227(e)(10)](https://www.ecfr.gov/current/title-40/section-745.227)) | Supervisor → owner | ✚ Lead 13 abatement report (with the exact EPA statement); TN completion report form noted | MISSING → built |
| B7 | Copies of reports / plans to the building owner; kept ≥ 3 years ([745.227(i)](https://www.ecfr.gov/current/title-40/section-745.227)) | Firm | Lead 13 + Asbestos 02 transmittal; kept forever | PARTIAL → built |
| B8 | Inspection / risk assessment / lead hazard screen by certified people ([745.227(b)–(d)](https://www.ecfr.gov/current/title-40/section-745.227)) | Hired assessor | ✚ Lead 15 evaluation request & results log | MISSING → built |
| B9 | Soil abatement limits (replacement soil ≤ 400 ppm, etc.) ([745.227(e)(7)](https://www.ecfr.gov/current/title-40/section-745.227)) | Firm | Levels record (soil); Lead 13 component table | MISSING → covered by the record + Lead 13 |
| B10 | Firm + individual state certification (TN 3 years; AR yearly; MS yearly) | Company / people | 📜 Certifications (TDEC / ADH / MDEQ firm and individual); ⚑ owner action: apply for the ADH supervisor certificate | HAVE (owner action open) |

## C · HUD Lead Safe Housing Rule — 24 CFR Part 35 (+ disclosure, 24 CFR 35 Subpart A / 40 CFR 745 Subpart F)

Applies **only** when the housing receives federal assistance (Section 8, HOME, CDBG, public housing, FHA disposition …).
The 🏛 *HUD-assisted* fact on the job turns these papers on.

| # | Requirement | Who / when | GrayCo document / CRM action | Status |
|---|---|---|---|---|
| C1 | Real-estate disclosure (sale / lease of pre-1978 housing) ([35.88](https://www.ecfr.gov/current/title-24/section-35.88), [745.107](https://www.ecfr.gov/current/title-40/section-745.107)) | Owner / landlord (not GrayCo) | Lead 15 reminds the owner to give the report to buyers / renters | PARTIAL (owner's duty) |
| C2 | Pamphlet to each occupied unit (already met if Renovate Right was given) ([35.130](https://www.ecfr.gov/current/title-24/section-35.130)) | Designated party | Lead 01 / Lead 08 | HAVE |
| C3 | Evaluation (inspection / risk assessment / screen) or presumption ([35.110–35.120](https://www.ecfr.gov/current/title-24/section-35.110)) | Certified assessor | ✚ Lead 15 | MISSING → built |
| C4 | **Notice of evaluation or presumption** to occupants within **15 calendar days** of the report / presumption ([35.125(a)](https://www.ecfr.gov/current/title-24/section-35.125)) | Designated party → occupants | ✚ HUD 01 (due = report date + 15) | MISSING → built |
| C5 | **Notice of lead hazard reduction** within **15 calendar days** of completion: nature, dates, scope, results incl. clearance, remaining LBP surface by surface ([35.125(b)](https://www.ecfr.gov/current/title-24/section-35.125)) | Designated party → occupants | ✚ HUD 02 (replaces JOBDOCS' "needs a form" line; due = completion + 15) | MISSING → built |
| C6 | Notices readable, accessible on request, in the occupants' language; posted in common areas or given to each unit (never post an EBLL investigation) ([35.125(c)](https://www.ecfr.gov/current/title-24/section-35.125)) | Designated party | HUD 01 / 02 delivery boxes; e-mail / text to the occupant contact | PARTIAL → built |
| C7 | Occupant protection: no entry to the worksite; temporary relocation unless an exception applies (no disturbance, exterior only, ≤ 8 daytime hours, ≤ 5 days with daily cleaning); belongings protected; warning signs ([35.1345](https://www.ecfr.gov/current/title-24/section-35.1345)) | Designated party / contractor → occupants | ✚ HUD 03 occupant protection & relocation notice (+ Lead 07 plan) | MISSING → built |
| C8 | Clearance by a certified person independent of the contractor ([35.1340](https://www.ecfr.gov/current/title-24/section-35.1340)) | Clearance examiner | ✚ HUD 04 | MISSING → built |
| C9 | Ongoing LBP maintenance: visual check at turnover + every 12 months; occupants told how to report deteriorated paint; response within **30 days** ([35.1355](https://www.ecfr.gov/current/title-24/section-35.1355)) | Designated party | ✚ HUD 05 notice + maintenance log | MISSING → built |
| C10 | Child with an elevated blood lead level: environmental investigation within **15 days** of the notice; hazard reduction within **30 days** of the report; other units' risk assessments 30 / 60 days ([35.730](https://www.ecfr.gov/current/title-24/section-35.730), [35.1225](https://www.ecfr.gov/current/title-24/section-35.1225)) | Owner / designated party | ✚ HUD 06 EBLL response record (clocks from 🏛 facts) | MISSING → built |
| — | Records: each notice, evaluation, clearance and abatement report ≥ 3 years ([35.175](https://www.ecfr.gov/current/title-24/section-35.175)) | Designated party | all in the job file; kept forever | (counted in A16) |

## D · Asbestos — NESHAP 40 CFR 61 Subpart M, OSHA 29 CFR 1926.1101 (AHERA only for schools)

NESHAP applies to "facilities" (commercial, public, and residential buildings with 5+ units, or any demolition that
is part of a larger project); OSHA applies to all construction work with ACM. GrayCo's crew does not disturb ACM; a
state-licensed abatement subcontractor does (ENVDOCS keeps the sub's license, cards, plan, notice copy and release).

| # | Requirement | Who / when | GrayCo document / CRM action | Status |
|---|---|---|---|---|
| D1 | Thorough inspection for asbestos (incl. Category I / II non-friable) before any renovation / demolition ([61.145(a)](https://www.ecfr.gov/current/title-40/section-61.145)) by an AHERA-accredited, state-licensed inspector | Owner / operator, before | Asbestos testing authorization (HAVE) + ✚ Asbestos 03 inspection record | PARTIAL → built |
| D2 | Written notification **postmarked / delivered ≥ 10 working days** before removal or any demolition ([61.145(b)(3)](https://www.ecfr.gov/current/title-40/section-61.145)) | Sub (operator) → TDEC / ADEQ / MDEQ | env asbestos notification worksheet; 🛡 notices `asb-notice-tn/ar/ms` (10 working days, ⛔) | HAVE |
| D3 | Revised notice: amount changes ≥ 20 %; earlier start (10 working days); later start (phone + written by the original date); emergency renovation / ordered demolition by the next working day ([61.145(b)(2)–(3)](https://www.ecfr.gov/current/title-40/section-61.145)) | Sub → agency | ✚ Asbestos 04 tracking + revisions; ✚ 🛡 `asb-notice-revise` | MISSING → built |
| D4 | Work practices (wet, sealed, no visible emissions; NESHAP-trained person on site, refresher every 2 years) ([61.145(c)](https://www.ecfr.gov/current/title-40/section-61.145)) | Sub | the sub's work plan (ENVDOCS sub checks) | HAVE |
| D5 | Waste: wet, sealed, labeled; waste shipment record with every load ([61.150(a)–(d)](https://www.ecfr.gov/current/title-40/section-61.150)) | Sub / generator | env waste shipment record log | HAVE |
| D6 | Signed WSR back from the landfill: follow up at **35 days**, report in writing at **45 days**; keep WSRs ≥ 2 years ([61.150(d)(3)–(5)](https://www.ecfr.gov/current/title-40/section-61.150)) | Generator | env waste log (35 / 45 noted) + ✚ due rule `wsr35` from the 🏛 "waste accepted" date | PARTIAL → built |
| D7 | OSHA: building owner identifies ACM / PACM and informs employers and occupants who will work in those areas ([1926.1101(k)(2)](https://www.ecfr.gov/current/title-29/section-1926.1101)) | Owner / GC | Asbestos 01 disclosure (customer) + ✚ Asbestos 06 owner / occupant notice | PARTIAL → built |
| D8 | Multi-employer worksite: the abatement contractor informs other employers; the GC coordinates ([1926.1101(d)](https://www.ecfr.gov/current/title-29/section-1926.1101)) | GrayCo (GC) + sub | ✚ Asbestos 05 pre-job coordination minutes | MISSING → built |
| D9 | Regulated area, signs, labels ([1926.1101(e), (k)(7)–(8)](https://www.ecfr.gov/current/title-29/section-1926.1101)) | Sub | warning signs (company-docs; ENVDOCS sign set) | HAVE |
| D10 | Employee training: 2-hour awareness for anyone where ACM may be disturbed; 16-hour O&M for Class III ([1926.1101(k)(9)](https://www.ecfr.gov/current/title-29/section-1926.1101)) | GrayCo crew | Asbestos Awareness & Control Program + ✚ 🛡 `asb-om-aware`, 📜 O&M awareness type | MISSING → built |
| D11 | Records: exposure monitoring 30 years, medical duration of employment + 30 years, training 1 year past employment ([1926.1101(n)](https://www.ecfr.gov/current/title-29/section-1926.1101)) | Employer | ENVCOMP retention (forever) | HAVE |
| D12 | AHERA (schools only): management plans, accredited people ([40 CFR 763 Subpart E](https://www.ecfr.gov/current/title-40/part-763/subpart-E)) | School LEA | n/a unless GrayCo works in a school — the AHERA role certificates are tracked (E) | PARTIAL (n/a) |

## E · People (employees and sub crew members)

Each person's certificate is a 📜 Certifications record (type, number, course date, provider, issued, expiry, a photo /
PDF of the card); reminders at 60, 30 and 7 days before expiry to the admins + office; 🛡 checks them by job kind and
state; scheduling someone without a current one is blocked (admin override logged); emergency mitigation jobs warn.

| # | Requirement | Applies to | CRM | Status |
|---|---|---|---|---|
| E1 | EPA RRP certified renovator — 5 years (3 if the refresher had no hands-on) ([745.90](https://www.ecfr.gov/current/title-40/section-745.90)) | RRP jobs | 📜 `rrp_renovator`; 🛡 `rrp-renovator` (block) | HAVE |
| E2 | Non-certified renovation workers trained on the job ([745.90(b)(2)](https://www.ecfr.gov/current/title-40/section-745.90)) | RRP crews | Lead 04; 🛡 `rrp-worker` | HAVE |
| E3 | Lead dust sampling technician ([745.90](https://www.ecfr.gov/current/title-40/section-745.90)) | dust clearance after RRP | ✚ 📜 `dust_tech_ind`, 🛡 type `dust_tech` | MISSING → built |
| E4 | Lead abatement worker / supervisor — state certified, refresher before expiry ([745.226](https://www.ecfr.gov/current/title-40/section-745.226); TN 3 yr, AR 1 yr, MS 1 yr) | abatement | 📜 TDEC / ADH / MDEQ individual; 🛡 `la-sup`, `la-worker` (block); ✚ generic types `lead_sup_ind`, `lead_worker_ind` | HAVE |
| E5 | Lead inspector / risk assessor / project designer | evaluation, clearance, design | ✚ 📜 + 🛡 types `lead_inspector`, `lead_risk`, `lead_designer` | MISSING → built |
| E6 | Asbestos worker / contractor-supervisor — AHERA + state license, annual refresher | asbestos crews (the sub today) | 🛡 `asb-worker`, `asb-sup` (block); ✚ 📜 `asb_worker_ind`, `asb_sup_ind` | PARTIAL → built |
| E7 | Asbestos inspector / management planner / project designer (AHERA, annual refresher) | surveys, schools | ✚ 📜 + 🛡 `asb_inspector`, `asb_planner`, `asb_designer` | MISSING → built |
| E8 | Asbestos 2-hour awareness / 16-hour O&M ([1926.1101(k)(9)](https://www.ecfr.gov/current/title-29/section-1926.1101)) | GrayCo crew near ACM | ✚ 📜 `asb_om_ind`; 🛡 `asb-om-aware` | MISSING → built |
| E9 | Respirator medical clearance before fit test / use ([1910.134(e)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.134)) | exposure work | ENVCOMP 🩺 medical (private) + ✚ 📜 `resp_med_ind` card | HAVE |
| E10 | Fit test before use + every 12 months ([1910.134(f)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.134)) | exposure work | ENVCOMP medical `fit` (blocks lead abatement / asbestos) + 📜 `fit_ind` | HAVE |
| E11 | Hazard communication training ([1910.1200(h)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200)) | everyone | 🛡 `all-hazcom`; ✚ 📜 `hazcom_ind` | PARTIAL → built |
| E12 | Lead medical surveillance, blood lead, medical removal (OSHA 1926.62(j)–(k); removal / return levels from the levels record) | lead abatement | ENVCOMP medical + removal pay | HAVE |
| E13 | OSHA 10 / 30 (company standard; some owners require it) | everyone on exposure work | ✚ 📜 `osha10_ind`; 🛡 `all-osha10` (warn) | MISSING → built |
| E14 | Mold: TN, AR and MS have no state mold license (checked 11/2026) → company standard IICRC AMRT (supervisors), WRT (mitigation) | mold / water | 🛡 `mold-train`, ✚ `mold-wrt`; ✚ 📜 `amrt_ind`, `wrt_ind` | PARTIAL → built |
| E15 | Bloodborne pathogens + Hep B (trauma) | trauma | 🛡 `tr-bbp`, `tr-hepb` | HAVE |
| E16 | The owner's own certificates entered | Wesley Johnson | ✚ two DRAFT records (RRP renovator 11/06/2026 Arlington TN; lead abatement supervisor course 11/16/2026 Atlanta) — **no number until he types it from the card**; ⚑ owner action: ADH supervisor certification | MISSING → built (owner action open) |

## F · Company

| # | Requirement | CRM | Status |
|---|---|---|---|
| F1 | EPA RRP Lead-Safe Certified Firm (TN, AR) — 5 years, $300, apply 90 days before | 📜 template `epa_rrp_firm` | HAVE |
| F2 | MDEQ firm certification (MS RRP + abatement) — yearly | 📜 `mdeq_firm`; ✚ 🛡 `rrp-firm-ms` | HAVE |
| F3 | State lead abatement firm (TDEC 3 yr; ADH contractor license yearly) | 📜 `tdec_firm`, `adh_firm`; 🛡 `la-firm` | HAVE |
| F4 | HUD Lead Safe Housing Rule duties when work is HUD-assisted (notices, relocation, clearance, maintenance, EBLL) | ✚ section C papers, 🏛 HUD-assisted fact | MISSING → built |
| F5 | State asbestos contractor license — only if GrayCo does asbestos itself (today: the sub's license on the job) | ✚ 📜 `asb_contractor_co` | MISSING → built (tracking) |
| F6 | State asbestos notification account (TDEC / ADEQ / MDEQ) or written confirmation the sub files | ✚ 📜 `neshap_acct_co` | MISSING → built (tracking) |
| F7 | NESHAP 10-working-day notice per job | 🛡 notices (block) + Asbestos 04 | HAVE |
| F8 | Mold license where a state requires one (none in TN / AR / MS) | ✚ 📜 `mold_lic_co` (placeholder) | MISSING → built (placeholder) |
| F9 | Insurance with pollution / contractor's environmental liability | ✚ 📜 `pollution_co`; ✚ 🛡 `co-pollution` (warn) — kept internal, never shown to customers | PARTIAL → built |
| F10 | Written programs on file: respiratory, HazCom, lead, asbestos (ENVDOCS owns the program documents) | company-docs + ENVCOMP ⚙ programs | HAVE |
| F11 | Retention: RRP 3 years; exposure / medical 30 years (+ employment); training 1 year after employment — GrayCo keeps everything forever; the paper log is append-only; facts keep their history | ENVCOMP retention, JOBDOCS log | PARTIAL |
| F12 | Levels used on papers (dust, soil, paint, water, blood, OSHA) from one versioned record | gc_kv `gc_lead_levels` (ENVDOCS) → every level on the papers + "Levels: <version>" stamp | PARTIAL → built (record owned by ENVDOCS) |

## The new papers (✚) — 18 library forms

| Form | For | Goes to | Due (timing rule) |
|---|---|---|---|
| Lead 08 — Renovate Right proof of delivery (mailing / attempted delivery) | RRP | job file | start − 7 days |
| Lead 09 — Common-area renovation notice (+ revised notice) | common areas | occupants | ≤ 60 days before, before start |
| Lead 10 — Statement of notification steps | common areas / child-occupied | job file | before start |
| Lead 11 — Cleaning verification record | RRP | job file | during |
| Lead 12 — Post-renovation records: adult occupant copy / common-area posting | tenants / common areas / COF | occupants | final invoice or 30 days |
| Lead 13 — Lead abatement report | abatement | owner | at completion |
| Lead 14 — State lead abatement notification checklist | abatement | agency (filing) | TN 5 bus. / MS 6 work. / AR 10 work. days |
| Lead 15 — Lead evaluation request & results | HUD or abatement | job file | before start |
| HUD 01 — Notice of evaluation / presumption | HUD | occupants | report + 15 days |
| HUD 02 — Notice of lead hazard reduction | HUD | occupants | completion + 15 days |
| HUD 03 — Occupant protection & relocation notice | HUD or abatement | occupants | before start |
| HUD 04 — Clearance examination record | HUD or abatement | owner | at completion |
| HUD 05 — Ongoing LBP maintenance notice + log | HUD | occupants | completion + 15 days |
| HUD 06 — EBLL response record | EBLL | job file | notice + 15 / report + 30 |
| Asbestos 03 — Thorough inspection record | asbestos | job file | before start |
| Asbestos 04 — NESHAP notification tracking + revisions | NESHAP facility / demolition | agency (filing) | 10 working days before |
| Asbestos 05 — Abatement sub pre-job coordination minutes | asbestos | sub (internal) | before start |
| Asbestos 06 — Owner / occupant notice of asbestos work | asbestos | occupants | before start |

Timing for papers GrayCo already had: Lead 01 (≤ 60 days, before start), Lead 02 (before start), Lead 03 and Lead 05
(final invoice or 30 days), env asbestos notification (10 working days), env lead notification (state days), env waste log
(35 / 45 days).

## Owner questions

1. Does GrayCo do (or plan) work in **HUD-assisted housing** (Section 8 landlords, housing authorities, HOME / CDBG rehab)? If not, the HUD papers stay off (they only appear when 🏛 *HUD-assisted* is ticked).
2. Which **state lead programs** is GrayCo (the firm) certified under today — TDEC, ADH, MDEQ? And the numbers / expirations for the EPA RRP firm certificate. (📜 Certifications has blank rows waiting.)
3. Your **ADH lead abatement supervisor certification** — applied yet? Until the ADH certificate (not only the Seagull course certificate) is on file, 🛡 blocks lead abatement in AR without an admin override. TN and MS need their own state certificates to supervise there.
4. **Arkansas notice of intent**: GrayCo's index says 10 working days; please confirm with ADH (the CRM uses 10 and says "confirm").
5. **Mississippi RRP notification**: does MDEQ want the LBP project notification for every regulated renovation (no fee) or only abatement? The CRM shows it as a warning, not a block.
6. Does the asbestos sub **file the NESHAP notice** under its own account on every job, or should GrayCo hold a state notification account?
7. Who **arranges / pays temporary relocation** on HUD jobs (HUD 03 marks this ⚑)?
8. The **Lead levels** record: ENVDOCS stores the 2026 v.3 sheet — confirm the HUD water level (15 ppb) and soil levels (400 / 1,200) match what you want on customer papers.
