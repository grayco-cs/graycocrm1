#!/usr/bin/env python3
"""EPAHUD: the EPA / HUD lead & asbestos papers GrayCo was missing, as 📚 document-library templates (patch DOCLIB's T() + l2 blocks).
Writes the T(...) lines between the /*EPAHUD:templates*/ markers in index.html (idempotent). Run: python3 tools/epahud_templates.py index.html
Merge fields are filled from the CRM (DOCLIB fieldsFor + the EPAHUD extra fields); a ⚑ marks an item the owner must confirm.
Nothing here is legal text: every paper ends with "Based on <rule>. Confirm with your state program / attorney." """
import json, sys

ALL = ["residential", "commercial", "insurance"]
B = lambda: None
def foot(rule):
    return ["small", "Based on " + rule + ". This is a GrayCo working form, not legal advice — confirm the current rule with your state program (TDEC · Arkansas Dept. of Health / DEQ · MDEQ) or your attorney. ⚑ = item the owner confirms."]
JOB = [["Owner / customer", "{customer}"], ["Property address", "{job_address}"], ["Job", "{job_name}"], ["Job no.", "{po}"], ["Year built", "{year_built}"]]
FIRM = [["Renovation firm", "{company}"], ["EPA / state firm certification no.", "{rrp_firm_no}"], ["Certified renovator", "{renovator}"], ["Renovator certification no.", "{renovator_no}"]]
ABATE = [["Abatement firm", "{company}"], ["State lead abatement firm certification no.", "{abate_firm_no}"], ["Certified supervisor", "{supervisor}"], ["Supervisor certification no.", "{supervisor_no}"]]

T = []
def t(id, name, cat, client, blocks):
    T.append((id, name, cat, ALL, client, blocks))

# ── Lead (RRP) ──
t("lead_08", "Lead 08 — Renovate Right Delivery: Certificate of Mailing / Attempted Delivery", "Lead & Asbestos", False, [
    ["title", "RENOVATE RIGHT PAMPHLET — PROOF OF DELIVERY", "Certificate of mailing · certification of attempted delivery (owner, adult occupant or child-occupied facility representative)"],
    ["p", "Use this record when a signed acknowledgment (Lead 01) cannot be obtained. The pamphlet must be delivered no more than 60 days before the renovation starts; a mailed pamphlet needs a certificate of mailing obtained at least 7 days before the work starts."],
    ["info", JOB + [["Planned start date", "{start_date}"], ["Mail by (7 days before the start)", "{mail_by}"]]],
    ["h", "A. Certificate of mailing (owner or adult occupant)"],
    ["info", [["Mailed to (name)", "&nbsp;"], ["Mailing address", "&nbsp;"], ["Date mailed", "&nbsp;"], ["Post office certificate of mailing / tracking no.", "&nbsp;"], ["Attach", "☐ USPS certificate of mailing (PS Form 3817) or receipt ☐ copy of the cover letter"]]],
    ["h", "B. Certification of attempted delivery (adult occupant / facility representative only)"],
    ["p", "I certify that the pamphlet Renovate Right was delivered to the dwelling / facility named above and that GrayCo was unable to obtain a written acknowledgment of receipt."],
    ["info", [["Address of the unit / facility", "{job_address}"], ["Date of delivery", "&nbsp;"], ["Method of delivery (hand delivered, left at door …)", "&nbsp;"], ["Name(s) of the person(s) delivering", "&nbsp;"], ["Reason no acknowledgment (refused to sign / no adult available …)", "&nbsp;"]]],
    ["info", [["Signature of the GrayCo representative", "&nbsp;"], ["Printed name / title", "&nbsp;"], ["Date signed", "&nbsp;"]]],
    ["p", "GrayCo keeps this record with the job file (EPA: at least 3 years; GrayCo: forever)."],
    foot("40 CFR 745.84(a)(1)(ii), (a)(2)(i)–(ii), (c)(1)(ii) and 745.86(b)(3)–(4); TN Rule 0400-13-01")])

t("lead_09", "Lead 09 — Common-Area Renovation Notice to Occupants", "Lead & Asbestos", True, [
    ["title", "NOTICE OF RENOVATION IN COMMON AREAS", "Lead-safe work in a pre-1978 multi-unit building — for every affected unit"],
    ["box", "<b>To the occupants:</b> renovation that may disturb lead-based paint will take place in the common areas of this building. It will be done by an EPA / state lead-safe certified firm using lead-safe work practices."],
    ["info", [["Building / property", "{job_address}"], ["Owner / manager", "{customer}"], ["Renovation firm", "{company}"], ["Contact", "{office_phone}"]]],
    ["h", "The work"],
    ["info", [["General nature of the work", "{job_name}"], ["Locations (halls, stairs, laundry, entries …)", "&nbsp;"], ["Expected start date", "{start_date}"], ["Expected end date", "{end_date}"]]],
    ["h", "The pamphlet and the records — free of charge"],
    ["p", "You can get a free copy of the EPA pamphlet <i>Renovate Right</i> and a copy of the renovation records (the post-renovation report and any dust sampling report) from GrayCo at {office_phone} or from the building office. The pamphlet is also at epa.gov/lead."],
    ["h", "Revised notice (fill in only if the scope, locations or dates change)"],
    ["checks", ["This is a REVISED notice — given before any work beyond the first notice. What changed: ______________________________"]],
    ["h", "Distribution record (GrayCo)"],
    ["info", [["Delivered to each affected unit on", "&nbsp;"], ["Method (under door / mailbox / hand)", "&nbsp;"], ["Units", "&nbsp;"], ["By", "&nbsp;"]]],
    ["small", "Or, instead of delivering a notice to each unit: post signs where every affected unit will see them while the work goes on, with the nature, locations and expected completion date, and how to get the pamphlet and the records (40 CFR 745.84(b)(2)(ii))."],
    foot("40 CFR 745.84(b)(2), (b)(4) and 745.86(c)(2), (d)(3)")])

t("lead_10", "Lead 10 — Statement of Notification Steps (Common Areas / Child-Occupied Facility)", "Lead & Asbestos", False, [
    ["title", "STATEMENT OF NOTIFICATION STEPS", "Signed and dated by the renovation firm — common areas of multi-unit housing and child-occupied facilities"],
    ["info", JOB + [["Planned start date", "{start_date}"]]],
    ["h", "Type of renovation"],
    ["checks", ["Common areas of multi-unit target housing (Lead 09 notice or posted signs)", "Child-occupied facility (Lead 02 notice to parents and guardians, mailed / handed out or posted)"]],
    ["h", "Steps performed"],
    ["checks", ["Pamphlet given to the building owner — acknowledgment (Lead 01) or certificate of mailing (Lead 08) on file", "Pamphlet given to the adult representative of the child-occupied facility (if the facility is not the owner)", "Written notice delivered to each affected unit / each parent or guardian on: __________", "Informational signs posted on: __________ at (locations): __________________", "Pamphlet posted with the signs, or the signs say how to get a free copy", "Signs / notices say how to review or get a free copy of the renovation records", "Revised notice given before work beyond the first notice (if the scope, locations or dates changed)"]],
    ["info", [["Statement prepared by (GrayCo)", "&nbsp;"], ["Signature", "&nbsp;"], ["Date", "&nbsp;"]]],
    foot("40 CFR 745.84(b)(3), (c)(3) and 745.86(b)(5)")])

t("lead_11", "Lead 11 — Cleaning Verification Record", "Lead & Asbestos", False, [
    ["title", "POST-RENOVATION CLEANING VERIFICATION", "Performed by the certified renovator — one line per area / surface"],
    ["info", JOB + FIRM[2:]],
    ["p", "After cleaning: visual inspection first (no dust, debris or residue). Then wipe each windowsill, countertop and up to 40 sq ft of floor per wet cloth with a wet disposable cleaning cloth and compare to the EPA cleaning verification card. Pass = the cloth matches or is lighter. Fail = re-clean and use a new cloth; after the second failed cloth, wait 1 hour (or until dry) and wipe with a dry electrostatic cloth. Exterior: visual inspection only."],
    ["grid", ["Area / room", "Surface (sill / counter / floor)", "Wet cloth 1 pass?", "Wet cloth 2 pass?", "Dry cloth pass?", "Cloths used (wet / dry)", "Initials"], 10],
    ["info", [["Total wet cloths used", "&nbsp;"], ["Total dry cloths used", "&nbsp;"], ["Dust clearance testing instead (certified inspector / risk assessor / dust sampling technician)", "☐ Yes — report attached ☐ No"]]],
    ["p", "I certify that I performed (or directed) the post-renovation cleaning verification described above."],
    ["info", [["Certified renovator signature", "&nbsp;"], ["Date", "&nbsp;"]]],
    foot("40 CFR 745.85(a)(5), (b) and 745.86(b)(6)(viii)")])

t("lead_12", "Lead 12 — Post-Renovation Records: Adult Occupant Copy / Common-Area Posting", "Lead & Asbestos", True, [
    ["title", "POST-RENOVATION RECORDS — OCCUPANT COPY", "Given with the final invoice or within 30 days of completion, whichever is sooner"],
    ["info", JOB + [["Completion date", "{completion_date}"], ["Records due by", "{records_due}"]]],
    ["p", "The renovation firm gives the owner AND, if different, an adult occupant of the dwelling (or an adult representative of a child-occupied facility) the information on how the work complied with the EPA lead-safe rule. In common areas of multi-unit housing, the records — or how to get a copy — are posted where every affected unit will see them."],
    ["h", "Enclosed / posted"],
    ["checks", ["Lead 03 — renovation completion record signed by the certified renovator (or the EPA sample recordkeeping checklist)", "Lead 05 — test kit results (if test kits were used)", "Dust sampling / clearance report (if dust clearance testing was done instead of cleaning verification)", "Lead 11 — cleaning verification record"]],
    ["h", "Delivery"],
    ["info", [["Adult occupant (name)", "{occupant}"], ["Delivered on / how", "&nbsp;"], ["Posted at (common areas) on", "&nbsp;"]]],
    ["h", "Receipt"],
    ["info", [["Signature", "&nbsp;"], ["Date", "&nbsp;"]]],
    foot("40 CFR 745.86(c)(1)–(3), (d)")])

t("lead_13", "Lead 13 — Lead Abatement Report", "Lead & Asbestos", True, [
    ["title", "LEAD ABATEMENT REPORT", "Prepared by the certified supervisor or project designer · a copy to the building owner"],
    ["info", JOB + ABATE + [["Abatement start date", "{start_date}"], ["Abatement completion date", "{completion_date}"]]],
    ["h", "1. Firms and supervisors"],
    ["grid", ["Certified firm (name / address)", "Certification no.", "Supervisor(s) assigned"], 3],
    ["h", "2. Occupant protection plan"],
    ["checks", ["The occupant protection plan for this job (Lead 07) is attached", "Occupant relocation / HUD 03 notice attached (if occupants were relocated)"]],
    ["h", "3. Post-abatement clearance (certified inspector / risk assessor — not the abatement crew)"],
    ["info", [["Name / address", "&nbsp;"], ["Certification no.", "&nbsp;"], ["Date of sampling (≥ 1 hour after the final cleanup)", "&nbsp;"], ["Laboratory (EPA-recognized / NLLAP)", "&nbsp;"], ["Signature", "&nbsp;"]]],
    ["grid", ["Sample #", "Room / location", "Surface (floor / sill / trough / soil)", "Result (µg/ft² or ppm)", "Action level", "Pass?"], 8],
    ["small", "EPA action levels from January 12, 2026: floors 5 µg/ft², interior window sills 40 µg/ft², window troughs 100 µg/ft² (40 CFR 745.227(e)(8)(viii)). Use the stricter state level if the state has one. ⚑"],
    ["h", "4. Description of the abatement"],
    ["grid", ["Room / component", "Method (replacement / enclosure / encapsulation / removal / soil)", "Why this method", "Monitoring suggested (encapsulants / enclosures)"], 8],
    ["h", "5. Dust-lead hazard statement (only when results are below the action levels but at or above the reportable levels)"],
    ["box", "Although the completed abatement project achieved dust-lead below action levels, some dust-lead hazards remain because any reportable level of dust-lead is considered a dust-lead hazard by the U.S. Environmental Protection Agency in a residential dwelling or child-occupied facility. In order for abatement work to be considered complete under EPA regulations, dust-lead levels must be below the action levels, which are established based on reliability, effectiveness and safety. To continue to reduce lead exposure from dust, the EPA pamphlet entitled Protect Your Family From Lead in Your Home includes recommendations such as: using a vacuum with a high-efficiency particulate air (HEPA) filter on furniture and other items returned to the work area, and regularly cleaning hard surfaces with a damp cloth or sponge and a general all-purpose cleaner. For more information on how to continue to reduce lead exposure, see Protect Your Family From Lead in Your Home."],
    ["checks", ["The statement above applies to this job (include it)", "Not needed — every result is below the reportable levels"]],
    ["info", [["Prepared by (certified supervisor / project designer)", "{supervisor}"], ["Signature / date", "&nbsp;"], ["Copy given to the building owner on", "&nbsp;"]]],
    ["p", "Kept by GrayCo with the job file (EPA: at least 3 years; GrayCo: forever)."],
    foot("40 CFR 745.227(e)(10), (e)(8), (i); TN 0400-13-01 (TDEC abatement completion report); ADH and MDEQ lead rules")])

t("lead_14", "Lead 14 — State Lead Abatement Notification Checklist (TN / AR / MS)", "Lead & Asbestos", False, [
    ["title", "LEAD ABATEMENT NOTIFICATION — STATE CHECKLIST", "Filed by GrayCo before any lead abatement starts · updates for a new date, place, size or a cancellation"],
    ["info", JOB + ABATE + [["State", "{state}"], ["Planned start date", "{start_date}"], ["File by", "{abate_notice_by}"]]],
    ["h", "Which program"],
    ["checks", ["Tennessee — TDEC Lead Hazard Program: the notice must be RECEIVED 5 business days before the start, on the current TDEC form, with the project notification fee (Rule 0400-13-01). ⚑", "Arkansas — Department of Health Lead-Based Paint Program: Notice of Intent (and the Notice of Intent Revision form for changes), with the fee. GrayCo index: 10 working days before. ⚑ confirm the days and fee with ADH", "Mississippi — MDEQ Lead Section: LBP Project Notification (rev. 7/2025) 6 working days before; abatement fee per unit; e-mail notifications@mdeq.ms.gov or deliver with the fee. ⚑", "Elevated blood lead / emergency order: as early as possible, no later than the start date, with the EBL / order documentation"]],
    ["h", "What the notice carries"],
    ["checks", ["Notice type: original / updated / cancellation", "Start date and estimated end date", "Firm name, certification no., address, phone", "Building type (single-family, multi-family, child-occupied facility) and property name", "Address with unit numbers", "Project supervisor name and certification no.", "Approximate square footage / acreage to be abated", "Brief description of the abatement", "Name, title and signature of the person preparing it"]],
    ["h", "Filed"],
    ["grid", ["Type (original / update / cancel)", "Why", "Filed on", "How (online / e-mail / mail)", "Confirmation #", "Fee paid", "By"], 4],
    ["h", "Update rules (EPA model — check the state's)"],
    ["checks", ["Earlier start: updated notice received 5 business days before the new date", "Later start: updated notice received by the original start date", "New location: updated notice 5 business days before the start", "Cancelled, or the area changes by more than 20%: by the start date, or within 24 hours if work has begun", "No abatement on a date or at a place other than the one noticed"]],
    foot("40 CFR 745.227(e)(4) (EPA model); TN Rule 0400-13-01; ADH Rules Pertaining to Lead-Based Paint Activities; MDEQ lead-based paint regulations")])

t("lead_15", "Lead 15 — Lead Evaluation Request & Results (Certified Inspector / Risk Assessor)", "Lead & Asbestos", False, [
    ["title", "LEAD EVALUATION — REQUEST AND RESULTS LOG", "Inspection, risk assessment, lead hazard screen or paint testing — done by a certified inspector / risk assessor, not GrayCo's crew"],
    ["info", JOB + [["State", "{state}"], ["HUD-assisted", "{hud_yes}"]]],
    ["h", "1. What is asked for"],
    ["checks", ["Lead-based paint inspection (surface-by-surface: is there lead-based paint?)", "Risk assessment (where are the lead hazards — paint, dust, soil?)", "Lead hazard screen (lower-risk housing, HUD 24 CFR 35.110)", "Paint testing of the surfaces to be disturbed only", "Clearance examination after the work (see HUD 04)", "Presumption instead of testing (all applicable surfaces presumed lead-based paint — HUD 24 CFR 35.120)"]],
    ["info", [["Requested by / date", "&nbsp;"], ["Inspector / risk assessor (name, firm)", "&nbsp;"], ["Certification no. / state", "&nbsp;"], ["Independent of the abatement / renovation contractor", "☐ Yes ⚑"]]],
    ["h", "2. Results"],
    ["info", [["Date of the evaluation", "&nbsp;"], ["Date the report was received", "{eval_report_date}"], ["HUD notice of evaluation due (15 days)", "{eval_notice_by}"]]],
    ["grid", ["Room / component", "Paint / dust / soil", "Result", "Lead-based paint or hazard?", "Action"], 10],
    ["checks", ["Report saved to the job's files", "Owner given a copy", "HUD 01 notice of evaluation / presumption given to the occupants within 15 days (HUD-assisted)", "Real-estate disclosure: the owner must give this report to buyers / renters (40 CFR 745 Subpart F, 24 CFR 35 Subpart A)"]],
    foot("24 CFR 35.110, 35.120, 35.125(a), 35.1320; 40 CFR 745.227(b)–(d), 745.107")])

# ── HUD Lead Safe Housing Rule ──
t("hud_01", "HUD 01 — Notice of Lead-Based Paint Evaluation or Presumption", "HUD Lead-Safe Housing", True, [
    ["title", "NOTICE OF LEAD-BASED PAINT EVALUATION OR PRESUMPTION", "To the occupants of HUD-assisted housing — within 15 calendar days of the report or the presumption"],
    ["info", [["Property / unit", "{job_address}"], ["Owner / designated party", "{customer}"], ["Date of this notice", "{date}"]]],
    ["h", "What was done"],
    ["checks", ["Evaluation (inspection / risk assessment / lead hazard screen) — dates: __________", "Presumption: lead-based paint and / or lead-based paint hazards are presumed to be present (no testing)"]],
    ["info", [["Nature and scope (which units, common areas, exterior, soil)", "&nbsp;"], ["Results — lead-based paint / hazards found", "&nbsp;"]]],
    ["h", "More information and the full report"],
    ["info", [["Contact name", "&nbsp;"], ["Address", "&nbsp;"], ["Telephone", "&nbsp;"]]],
    ["p", "You may see the full evaluation report by contacting the person above. This notice is available in large type or another accessible format, and in your primary language, on request."],
    ["h", "How it was given"],
    ["checks", ["Given to each occupied unit affected (or served by the common areas)", "Posted in the common areas (never for a child's environmental investigation)", "Primary language of the occupants: __________"]],
    foot("24 CFR 35.125(a), (c) and 35.130")])

t("hud_02", "HUD 02 — Notice of Lead Hazard Reduction Activity", "HUD Lead-Safe Housing", True, [
    ["title", "NOTICE OF LEAD HAZARD REDUCTION ACTIVITY", "To the occupants of HUD-assisted housing — within 15 calendar days after the work (including paint stabilization) is complete"],
    ["info", [["Property / unit", "{job_address}"], ["Owner / designated party", "{customer}"], ["Contractor", "{company}"], ["Work completed", "{completion_date}"], ["Notice due by", "{hud_reduction_by}"], ["Date of this notice", "{date}"]]],
    ["h", "Summary of the work"],
    ["info", [["Nature (abatement / interim controls / paint stabilization / standard treatments)", "&nbsp;"], ["Dates", "&nbsp;"], ["Scope (rooms, components, exterior, soil)", "&nbsp;"]]],
    ["h", "Results, including clearance"],
    ["info", [["Clearance examination date / examiner", "&nbsp;"], ["Clearance result", "☐ Passed ☐ Failed — re-cleaned and re-tested on __________"]]],
    ["h", "Lead-based paint that remains (surface by surface, in the rooms where the work was done)"],
    ["grid", ["Room / area", "Component / surface", "Lead-based paint remaining?", "Condition / treatment"], 8],
    ["h", "More information"],
    ["info", [["Contact name", "&nbsp;"], ["Address", "&nbsp;"], ["Telephone", "{office_phone}"]]],
    ["p", "This notice is updated after any re-evaluation or further hazard reduction. Available in large type or another accessible format and in your primary language on request. Not required when no clearance examination is required."],
    foot("24 CFR 35.125(b)–(c), 35.1340")])

t("hud_03", "HUD 03 — Occupant Protection & Temporary Relocation Notice", "HUD Lead-Safe Housing", True, [
    ["title", "OCCUPANT PROTECTION AND TEMPORARY RELOCATION", "Lead hazard reduction work — please read before the work starts"],
    ["info", [["Property / unit", "{job_address}"], ["Owner", "{customer}"], ["Contractor", "{company}"], ["Work starts", "{start_date}"], ["Expected to end", "{end_date}"]]],
    ["h", "Keep out of the work area"],
    ["p", "No one may enter the work area during the work unless they are part of the crew, until the work is finished and clearance (if required) has passed. Warning signs will be posted at each entry."],
    ["h", "Temporary relocation (check one)"],
    ["checks", ["You will be temporarily moved to a decent, safe, similarly accessible unit without lead hazards: __________________ (from ______ to ______). ⚑ who pays / arranges", "No relocation needed — the work will not disturb lead-based paint, dust-lead or soil-lead hazards", "No relocation needed — exterior work only; windows, doors and openings near the work are sealed and cleaned after; a safe entry is kept", "No relocation needed — interior work done within one 8-hour daytime period, contained, no other hazards", "No relocation needed — interior work done within 5 calendar days, contained, cleaned within 10 ft of containment every day, and you keep safe access to sleeping areas, bathroom and kitchen"]],
    ["h", "Your belongings"],
    ["p", "Belongings in the work area are moved to a safe, secure place or covered with plastic sealed at every seam. The unit and the work area are secured against unauthorized entry."],
    ["h", "Children and pregnancy"],
    ["p", "Young children and pregnant women are most at risk from lead dust. Please tell us about any child under 6 living here or visiting often. Questions: {office_phone}."],
    ["h", "Received"],
    ["info", [["Occupant name", "{occupant}"], ["Signature / date", "&nbsp;"]]],
    foot("24 CFR 35.1345(a)–(b); 40 CFR 745.227(e)(5) (occupant protection plan — Lead 07)")])

t("hud_04", "HUD 04 — Clearance Examination Record (Certified Clearance Examiner)", "HUD Lead-Safe Housing", True, [
    ["title", "CLEARANCE EXAMINATION", "Done by a certified inspector, risk assessor or sampling technician who is independent of the firm that did the work"],
    ["info", JOB + [["Contractor that did the work", "{company}"], ["Work completed", "{completion_date}"]]],
    ["h", "1. Examiner"],
    ["info", [["Name / firm", "&nbsp;"], ["Certification type / no. / state", "&nbsp;"], ["Independent of the contractor (not employed by it)", "☐ Yes ⚑"], ["Date of the examination", "&nbsp;"]]],
    ["h", "2. Visual assessment first"],
    ["checks", ["No deteriorated paint, visible dust, debris or residue in the work area (re-cleaned before sampling if any)", "Exterior: no paint chips on the ground / dripline"]],
    ["h", "3. Dust (and soil) sampling — after the final cleanup"],
    ["grid", ["Sample #", "Room / location", "Floor / sill / trough / soil", "Result", "Clearance level", "Pass?"], 10],
    ["small", "EPA action levels from January 12, 2026: floors 5 µg/ft², sills 40 µg/ft², troughs 100 µg/ft². HUD clearance follows the levels in 24 CFR 35.1320 / the current HUD notice — the examiner confirms the levels used. ⚑"],
    ["h", "4. Result"],
    ["checks", ["PASSED — the area may be re-occupied", "FAILED — the contractor re-cleans and the examiner re-tests (no new notice until it passes)", "Clearance report (with the lab results) received and saved to the job; copy to the owner", "HUD 02 notice of hazard reduction to the occupants within 15 days"]],
    ["info", [["Examiner signature", "&nbsp;"], ["Date", "&nbsp;"]]],
    foot("24 CFR 35.1340; 40 CFR 745.227(e)(8)–(9)")])

t("hud_05", "HUD 05 — Ongoing Lead-Based Paint Maintenance: Report Deteriorated Paint", "HUD Lead-Safe Housing", True, [
    ["title", "PLEASE REPORT PEELING, CHIPPING OR DAMAGED PAINT", "Ongoing lead-based paint maintenance — HUD-assisted housing"],
    ["info", [["Property / unit", "{job_address}"], ["Owner / designated party", "{customer}"], ["Date", "{date}"]]],
    ["p", "Some painted surfaces in this home may contain lead-based paint. Please tell us right away if you see paint that is peeling, chipping, cracking or damaged, or if an enclosure or encapsulation (a covering or coating put over lead paint) is damaged."],
    ["h", "Who to contact"],
    ["info", [["Name", "&nbsp;"], ["Address", "&nbsp;"], ["Telephone", "&nbsp;"]]],
    ["p", "The owner responds and stabilizes the deteriorated paint, or repairs the enclosure / encapsulation, within 30 days of your report, using safe work practices and clearance. A visual check is done at every turnover and every 12 months."],
    ["h", "Owner's maintenance log (GrayCo / the designated party)"],
    ["grid", ["Date reported / checked", "Where", "What was found", "Fixed on (≤ 30 days)", "Clearance date"], 6],
    foot("24 CFR 35.1355(a)(2)–(7), 35.125(c)(3)")])

t("hud_06", "HUD 06 — Child with an Elevated Blood Lead Level: Response Record", "HUD Lead-Safe Housing", False, [
    ["title", "ELEVATED BLOOD LEAD LEVEL (EBLL) RESPONSE", "HUD-assisted housing — internal record of the clocks"],
    ["info", [["Property / unit", "{job_address}"], ["Owner / designated party", "{customer}"]]],
    ["box", "Privacy: the child's name and health information are not posted or shared beyond the people who need them. No notice of the environmental investigation is posted in common areas."],
    ["h", "1. Notice"],
    ["info", [["Notified by (health department / medical provider)", "&nbsp;"], ["Date notified", "{ebll_notice_date}"], ["Environmental investigation due (15 calendar days)", "{ebll_inv_by}"]]],
    ["h", "2. Environmental investigation (certified risk assessor)"],
    ["info", [["Done by / certification no.", "&nbsp;"], ["Date completed", "&nbsp;"], ["Report received", "{env_report_date}"], ["Hazard reduction due (30 calendar days)", "{ebll_red_by}"]]],
    ["h", "3. Hazard reduction and clearance"],
    ["info", [["Work by (certified firm)", "{company}"], ["Completed", "&nbsp;"], ["Clearance passed (HUD 04)", "&nbsp;"]]],
    ["h", "4. Reports"],
    ["checks", ["Reported to the HUD field office / program within the program's deadline ⚑", "Other assisted units with children under 6: risk assessment within 30 days (20 or fewer units) or 60 days (more than 20) ⚑", "HUD 02 notice to the occupants within 15 days of the work"]],
    foot("24 CFR 35.730 (project-based) / 35.1225 (tenant-based); 35.125(c)(4)(iii)")])

# ── Asbestos ──
t("asb_03", "Asbestos 03 — Thorough Inspection Record (Accredited Inspector)", "Lead & Asbestos", False, [
    ["title", "ASBESTOS THOROUGH INSPECTION — RECORD", "Before any renovation or demolition of a regulated facility — by an AHERA-accredited, state-licensed inspector (not GrayCo's crew)"],
    ["info", JOB + [["State", "{state}"], ["Facility type", "☐ Commercial / public ☐ 5+ unit residential ☐ Residential (≤ 4 units) — the NESHAP does not apply, but OSHA does ⚑ ☐ Demolition"]]],
    ["h", "Inspector"],
    ["info", [["Name / firm", "&nbsp;"], ["AHERA accreditation no. / state license no.", "&nbsp;"], ["Inspection date(s)", "&nbsp;"], ["Laboratory (NVLAP-accredited) / report no.", "&nbsp;"]]],
    ["h", "Scope"],
    ["checks", ["All areas the work will disturb, including Category I and II non-friable ACM (floor tile, roofing, transite, mastics)", "Hidden areas opened (walls, above ceilings, under floors) or listed as not accessible: ____________", "Presumed ACM (PACM) listed where not sampled"]],
    ["grid", ["Homogeneous area / material", "Location", "Friable?", "Category", "Sample #", "Result (% asbestos)", "Quantity (LF / SF / CF)"], 10],
    ["h", "What it means for the job"],
    ["checks", ["No ACM in the work area — report attached; GrayCo may proceed (OSHA still applies to anything presumed)", "RACM over 260 linear ft / 160 sq ft / 35 cu ft — NESHAP notice 10 working days before (Asbestos 04); licensed abatement sub", "Below the thresholds — OSHA work class and the state rules still apply ⚑", "Every demolition of a regulated facility needs the NESHAP notice, even with no asbestos", "Report given to the owner and the abatement sub; ACM left in place tagged and listed (Asbestos 02)"]],
    foot("40 CFR 61.141, 61.145(a); 40 CFR 763 Subpart E (AHERA model accreditation plan); 29 CFR 1926.1101(k)")])

t("asb_04", "Asbestos 04 — NESHAP Notification Tracking & Revisions", "Lead & Asbestos", False, [
    ["title", "ASBESTOS NESHAP NOTIFICATION — TRACKING AND REVISIONS", "GrayCo's copy of what the licensed abatement sub filed with the state (TDEC · Arkansas DEQ · MDEQ)"],
    ["info", JOB + [["State", "{state}"], ["Planned start of removal / demolition", "{start_date}"], ["Original notice postmarked / delivered by (10 working days)", "{neshap_by}"]]],
    ["info", [["Abatement contractor (operator)", "&nbsp;"], ["State license no.", "&nbsp;"], ["Filed by / method (online / mail)", "&nbsp;"]]],
    ["h", "Notices"],
    ["grid", ["Type (original / revised / cancel / emergency)", "Why", "Postmarked / filed", "Confirmation #", "Fee", "Copy on file?"], 6],
    ["h", "When a revised notice is needed"],
    ["checks", ["The amount of asbestos changes by 20% or more — update the notice", "Start date EARLIER than noticed — written notice of the new date at least 10 working days before", "Start date LATER than noticed — tell the agency by phone as soon as possible before the original date and send written notice of the new date by the original start date", "Emergency renovation — notice as early as possible, no later than the following working day, with the date and hour of the emergency and why", "Ordered demolition (unsafe building) — as early as possible, no later than the following working day", "Work stopped / cancelled — tell the agency"]],
    ["h", "On site"],
    ["checks", ["Copy of the notice at the job", "The sub's NESHAP-trained on-site person present during removal (refresher every 2 years)", "Waste: wet, sealed, labeled; waste shipment record with every load (env waste log)"]],
    foot("40 CFR 61.145(b)(1)–(4), (c)(8); 61.150")])

t("asb_05", "Asbestos 05 — Abatement Sub Pre-Job Coordination Minutes", "Lead & Asbestos", False, [
    ["title", "ASBESTOS ABATEMENT — PRE-JOB COORDINATION MEETING", "GrayCo (host / general contractor) and the licensed abatement subcontractor — internal"],
    ["info", JOB + [["Meeting date", "{date}"], ["GrayCo PM", "{pm}"], ["Abatement sub / license no.", "&nbsp;"], ["Sub's competent person / supervisor", "&nbsp;"]]],
    ["h", "Covered"],
    ["checks", ["Inspection report and the ACM / PACM locations shared with the sub and every GrayCo trade (1926.1101(k)(2)–(3))", "NESHAP notice filed (Asbestos 04) and the earliest allowed start date", "Regulated area, critical barriers, negative air, decon location, signs", "GrayCo crew: awareness only — stays out of the regulated area; stop work if suspect material is found", "Other trades scheduled around the regulated area; who may enter", "Air monitoring (the sub's), clearance by an independent party, who pays", "Waste: transporter, landfill, waste shipment records back to GrayCo (35 / 45 days)", "Occupant notice (Asbestos 06) and HVAC shut-down", "The sub's papers to GrayCo: license, worker cards, insurance (with pollution), work plan, notice, daily logs, clearance, WSRs, release of the area in writing", "Emergency contacts and what happens if a barrier fails"]],
    ["h", "Attendees"],
    ["grid", ["Name", "Company", "Role", "Signature"], 6],
    ["h", "Action items"],
    ["grid", ["Item", "Who", "By when"], 5],
    foot("29 CFR 1926.1101(d) (multi-employer worksites), (k)(2)–(3); 40 CFR 61.145, 61.150")])

t("asb_06", "Asbestos 06 — Owner / Occupant Notice of Asbestos Work", "Lead & Asbestos", True, [
    ["title", "NOTICE OF ASBESTOS WORK", "For the owner, tenants and anyone who works in the building"],
    ["info", [["Property", "{job_address}"], ["Owner", "{customer}"], ["General contractor", "{company}"], ["Contact", "{office_phone}"]]],
    ["p", "Asbestos-containing material in this building will be removed or repaired by a state-licensed asbestos abatement contractor. The work area will be closed off with barriers and warning signs. Please stay out of the marked areas until the contractor and an independent inspector say the area has passed clearance."],
    ["info", [["Where", "&nbsp;"], ["Expected start", "{start_date}"], ["Expected end", "{end_date}"], ["Abatement contractor", "&nbsp;"]]],
    ["h", "What to expect"],
    ["checks", ["Heating / air conditioning to the area may be shut off during the work", "Doors or hallways may be closed", "Air monitoring equipment may run during the work", "Materials left in place are labeled — do not disturb them"]],
    ["h", "Delivery record (GrayCo)"],
    ["info", [["Given / posted on", "&nbsp;"], ["How", "&nbsp;"], ["By", "&nbsp;"]]],
    foot("29 CFR 1926.1101(k)(2)(ii)–(iv), (k)(7); 40 CFR 61.145")])

def js_line(t):
    id, name, cat, jt, client, blocks = t
    return 'T(' + json.dumps(id) + ', ' + json.dumps(name) + ', ' + json.dumps(cat) + ', ' + json.dumps(jt) + ', ' + ('true' if client else 'false') + ', l2(' + json.dumps(blocks, ensure_ascii=False) + '));'

def main(path):
    h = open(path, encoding='utf-8').read()
    A, Z = '/*EPAHUD:templates*/', '/*EPAHUD:templates-end*/'
    body = A + ' /* EPAHUD: the EPA / HUD lead & asbestos papers (tools/epahud_templates.py) */\n' + '\n'.join(js_line(x) for x in T) + '\n' + Z
    if A in h:
        i = h.index(A); j = h.index(Z) + len(Z); h = h[:i] + body + h[j:]
    else:
        anchor = '/*RESTODOCS: water, fire, mold, storm, asbestos, general restoration papers */'
        assert anchor in h, 'anchor missing'
        h = h.replace(anchor, body + '\n' + anchor, 1)
    open(path, 'w', encoding='utf-8').write(h)
    print('templates:', len(T))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'index.html')
