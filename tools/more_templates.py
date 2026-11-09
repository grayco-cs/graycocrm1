#!/usr/bin/env python3
"""MOREDOCS (owner 11/9: "add every document we are missing for all situations"). The papers the library did not have yet:
job start & site, roofing, insurance claim help, contents, schedule & changes, closeout & warranty, disputes & non-payment,
commercial pay & closeout, subcontractors, safety, HR, vendors. Writes tools/more_templates.js — T(...) lines for the
document library (patch MOREDOCS). Same blocks as RESTODOCS (title, info, h, p, li, checks, grid, sigs, box, small); every
paper prints on the GrayCo letterhead (logo) like the rest of the library."""
import json, os
J = [["Customer / owner", "{customer}"], ["Property address", "{job_address}"], ["Job", "{job_name}"], ["PO / Job #", "{po}"], ["Date", "{date}"]]
JC = [["General contractor / owner", "{customer}"], ["Project", "{job_name}"], ["Project address", "{job_address}"], ["PO / Job #", "{po}"], ["Date", "{date}"]]
JS = [["Subcontractor", "&nbsp;"], ["Project", "{job_name}"], ["Project address", "{job_address}"], ["PO / Job #", "{po}"], ["Date", "{date}"]]
JE = [["Employee", "&nbsp;"], ["Position", "&nbsp;"], ["Date", "{date}"]]
ALL = ["insurance", "residential", "commercial"]
RES = ["residential", "insurance"]
COM = ["commercial"]
D = []
def T(id, name, cat, cf, blocks, types=ALL): D.append((id, name, cat, types, cf, blocks))
CALL = "Questions? Call GrayCo at {office_phone}."
CS = ["sigs", "Customer / owner", "GrayCo representative"]

# ═══ JOB START & SITE ═══
T("permit_auth", "Permit Authorization — Owner's Agent", "Job Start & Site", True, [
 ["title", "Permit Authorization", "The owner lets GrayCo apply for and pull the permits for this job"], ["info", J],
 ["p", "I am the owner (or the owner's authorized agent) of the property above. I authorize GrayCo Construction Services, LLC (license {license}) to apply for, sign for and pick up the building, roofing, electrical, plumbing, mechanical and other permits this work needs, and to schedule the inspections."],
 ["checks", ["Building", "Roofing", "Electrical", "Plumbing", "Mechanical / HVAC", "Demolition", "Other: ____________"]],
 ["p", "Permit fees are part of the contract price unless the agreement says otherwise. I will give the inspector access when GrayCo schedules an inspection."],
 CS, ["small", CALL]])
T("hoa_ack", "HOA / Architectural Approval — Owner Acknowledgment", "Job Start & Site", True, [
 ["title", "HOA / Architectural Approval Acknowledgment", "Who gets the homeowners' association approval, and what happens if it is late"], ["info", J + [["HOA / management company", "&nbsp;"]]],
 ["checks", ["My HOA does NOT need to approve this work.", "My HOA must approve it — I will get the approval and give GrayCo a copy before work starts.", "My HOA must approve it — I ask GrayCo to prepare the submittal (colors, materials, drawings) for me to sign and send."]],
 ["p", "GrayCo does not start work the HOA must approve until a copy of the approval is on file. A delay or denial by the HOA may move the schedule; a change the HOA requires is a change order."],
 CS])
T("site_access", "Site Access, Keys & Lockbox Authorization", "Job Start & Site", True, [
 ["title", "Site Access Authorization", "Keys, lockbox, gate and alarm codes, pets and work hours"], ["info", J],
 ["info", [["Lockbox / key location", "&nbsp;"], ["Gate code", "&nbsp;"], ["Alarm code / company", "&nbsp;"], ["Garage code", "&nbsp;"], ["Pets (kind, where kept)", "&nbsp;"], ["Work hours allowed", "&nbsp;"]]],
 ["li", ["GrayCo and its crews and subcontractors may enter the property during the work hours above to do the work in the agreement.", "Codes are kept in GrayCo's job file and shared only with the people working on this job.", "Please secure valuables, firearms, medications and important papers before work starts."]],
 ["checks", ["I will be home for the start of work.", "GrayCo may work while no one is home.", "Change all codes after the job is complete (recommended)."]],
 CS])
T("pre_existing", "Pre-Existing Conditions Acknowledgment", "Job Start & Site", True, [
 ["title", "Pre-Existing Conditions", "What was already there before GrayCo started"], ["info", J],
 ["p", "Before work started, GrayCo and the owner walked the work area, driveway and landscaping and noted the conditions below. Photos are kept in the job file."],
 ["grid", ["Location", "Condition found", "Photo #"], 8],
 ["p", "GrayCo is not responsible for the conditions listed here. Anything not listed that is damaged by GrayCo's work is GrayCo's to repair."],
 CS])
T("owner_materials", "Owner-Supplied Materials — Release", "Job Start & Site", True, [
 ["title", "Owner-Supplied Materials", "Items the owner buys and GrayCo installs"], ["info", J],
 ["grid", ["Item", "Qty", "Bought from", "Delivery date"], 8],
 ["li", ["The owner orders, pays for, receives and checks these items, and has them on site by the date GrayCo needs them.", "GrayCo installs them as the maker's instructions say. The maker's warranty on the item is between the owner and the maker; GrayCo's workmanship warranty covers the installation only.", "Wrong, damaged, missing or late items can delay the job; extra trips or rework are a change order."]],
 CS])
T("dumpster_release", "Dumpster / Driveway Placement Release", "Job Start & Site", True, [
 ["title", "Dumpster and Material Placement", "Where the dumpster, materials and equipment go"], ["info", J],
 ["info", [["Dumpster location", "&nbsp;"], ["Material drop location", "&nbsp;"], ["Delivery date", "&nbsp;"]]],
 ["p", "GrayCo uses boards under dumpster wheels where it can. Concrete and asphalt can crack under the weight of a loaded dumpster or a delivery truck. I asked for the location above and accept that risk; GrayCo will clean up debris and repair ruts in the lawn."],
 CS])
T("neighbor_notice", "Neighbor Notice — Work Starting", "Job Start & Site", True, [
 ["title", "A Note to Our Neighbors", "Work is starting next door"], ["info", [["Address", "{job_address}"], ["Date", "{date}"]]],
 ["p", "Hello! GrayCo Construction Services is starting work at the address above. We expect to be there on weekdays during normal work hours. You may see trucks, a dumpster and deliveries. We keep the street clear and clean up every day."],
 ["p", "If anything we do bothers you — noise, parking, debris — please call our office at {office_phone} and we will take care of it. Thank you for your patience!"],
 ["info", [["Project manager", "{pm}"], ["Office", "{office_phone}"]]]])
T("utility_shutoff", "Utility Shut-Off Notice", "Job Start & Site", True, [
 ["title", "Utility Shut-Off Notice", "Water, power or gas will be off for part of the work"], ["info", J],
 ["info", [["Utility", "&nbsp;"], ["Date", "&nbsp;"], ["From (time)", "&nbsp;"], ["Back on by (time)", "&nbsp;"], ["Areas affected", "&nbsp;"]]],
 ["li", ["Turn off and unplug sensitive electronics before a power shut-off.", "Store water for drinking and flushing before a water shut-off.", "Gas appliances are relit and checked when gas is turned back on."]],
 CS])
T("kickoff", "Pre-Construction Meeting — Customer Checklist", "Job Start & Site", True, [
 ["title", "Pre-Construction Meeting", "Everything we go over before the first day"], ["info", J],
 ["checks", ["Scope of work and drawings reviewed", "Selections made (or due dates set)", "Schedule and first day", "Work hours, access, keys, pets", "Parking, dumpster and material drop", "Protection of floors, furniture and landscaping", "Utilities: shut-offs needed", "Bathroom for crews / portable toilet", "How to reach the PM; customer portal sign-in", "Payment schedule and change orders", "Permits and inspections", "Lead, asbestos or mold concerns", "Photos and job sign"]],
 ["p", "Notes:"], ["grid", ["Item", "Decision / note"], 6],
 CS])

# ═══ ROOFING ═══
T("roof_preinstall", "Roof Replacement — Pre-Installation Acknowledgment", "Roofing", True, [
 ["title", "Roof Replacement: What to Expect", "Please read before the crew arrives"], ["info", J],
 ["li", ["Vibration from tear-off can crack drywall, nail pops or loosen pictures and light fixtures. Please take down wall hangings and fragile items on top-floor walls.", "Debris can fall into the attic. Cover items stored in the attic.", "Keep cars out of the driveway and garage on install days; pets and children inside.", "Satellite dishes, solar panels, antennas and skylights may need to be removed or reset; the dish company may need to re-aim the dish.", "Rotted decking found after tear-off is replaced at the price per sheet in the agreement.", "Magnetic sweeps for nails are done at the end of every day."]],
 ["info", [["Price per sheet of decking", "&nbsp;"], ["Shingle / color", "&nbsp;"], ["Drip edge / color", "&nbsp;"]]],
 CS])
T("roof_decking", "Roof Decking Replacement — Record", "Roofing", True, [
 ["title", "Decking Replacement Record", "Rotted or damaged decking found after tear-off"], ["info", J],
 ["info", [["Sheets replaced", "&nbsp;"], ["Price per sheet", "&nbsp;"], ["Linear feet of board replaced", "&nbsp;"], ["Total added", "&nbsp;"]]],
 ["p", "Photos of the damaged decking are in the job file and can be sent to your insurance company. This amount is added to the final invoice as the agreement says."],
 CS])
T("skylight_release", "Skylight / Satellite / Solar — Release", "Roofing", True, [
 ["title", "Skylight, Satellite Dish and Solar Release", "Items on the roof GrayCo works around"], ["info", J],
 ["checks", ["Skylights: reflash only (existing skylight stays)", "Skylights: replace (see the agreement)", "Satellite dish: remove and set aside (the provider re-installs / re-aims)", "Satellite dish: remove and dispose (not used)", "Solar panels: the owner's solar company removes and re-installs", "Antenna / other: ____________"]],
 ["p", "Old skylights, dishes and solar equipment can leak or fail on their own. GrayCo is responsible for its flashing and roofing work, not for the item itself, its signal or its power output."],
 CS])
T("roof_maint", "Roof Care & Maintenance Guide", "Roofing", True, [
 ["title", "Caring for Your New Roof", "Simple checks that keep your warranty and your roof in good shape"], ["info", J],
 ["li", ["Look at the roof from the ground twice a year and after big storms: missing shingles, lifted edges, debris.", "Keep gutters and valleys clean; trim branches away from the roof.", "Do not pressure wash shingles or walk on the roof — call us.", "Anyone else who works on the roof (satellite, solar, HVAC) can void the warranty for the area they touch.", "Keep this guide with your warranty certificate."]],
 ["sigs", "Customer / owner", "GrayCo representative"], ["small", CALL]])

# ═══ INSURANCE CLAIM HELP ═══
T("claim_discuss_auth", "Authorization to Discuss My Claim", "Insurance Claim Help", True, [
 ["title", "Authorization to Discuss My Insurance Claim", "Lets GrayCo talk to the adjuster about the repair scope"], ["info", J + [["Claim #", "&nbsp;"], ["Insured", "&nbsp;"]]],
 ["p", "I authorize GrayCo Construction Services to speak with my insurance company, its adjusters and inspectors about the damage, the scope of repairs, measurements, photos, estimates and supplements for the claim above, and to receive copies of the estimate."],
 ["p", "This does NOT let GrayCo settle my claim, sign for me, or act as a public adjuster. I can cancel this authorization at any time in writing."],
 CS])
T("deductible_ack", "Deductible Responsibility Acknowledgment", "Insurance Claim Help", True, [
 ["title", "Your Deductible", "Who pays the deductible on an insurance job"], ["info", J + [["Claim #", "&nbsp;"], ["Deductible", "&nbsp;"]]],
 ["p", "The deductible is the owner's part of the claim. GrayCo does not waive, rebate, absorb or advertise to pay any part of an insured's deductible; that is not allowed and can be insurance fraud. The deductible is paid to GrayCo as the agreement's payment schedule says."],
 CS])
T("mortgage_endorse", "Mortgage Company Check Endorsement — Instructions", "Insurance Claim Help", True, [
 ["title", "Insurance Checks With Your Mortgage Company's Name", "How the check gets endorsed and released"], ["info", J + [["Claim #", "&nbsp;"], ["Mortgage company", "&nbsp;"], ["Loan #", "&nbsp;"]]],
 ["li", ["When an insurance check also names your mortgage company, it must sign (endorse) the check too.", "Most mortgage companies want: the endorsed check, the adjuster's estimate, our signed agreement, a W-9 and sometimes an inspection.", "Large claims are often paid in draws as the work gets done.", "GrayCo can send the papers your mortgage company asks for — tell us who to call."]],
 ["checks", ["I ask GrayCo to send the mortgage company the papers it needs for this claim."]],
 CS])
T("supplement_req", "Supplement Request to Insurance", "Insurance Claim Help", False, [
 ["title", "Supplement Request", "Items missing from the insurance estimate"], ["info", J + [["Claim #", "&nbsp;"], ["Adjuster", "&nbsp;"]]],
 ["p", "After opening the work, GrayCo found items that are needed to repair the damage but are not in the current estimate. Photos and measurements are attached."],
 ["grid", ["Line item", "Qty", "Unit", "Reason / code requirement", "Photo #"], 10],
 ["p", "Please review and send a revised estimate. Contact {pm} at {office_phone} with any questions."],
 ["info", [["Submitted by", "{pm}"], ["Signature / date", "&nbsp;"]]]])
T("depreciation_req", "Recoverable Depreciation — Release Request", "Insurance Claim Help", True, [
 ["title", "Request to Release Recoverable Depreciation", "The work is done — the holdback can be paid"], ["info", J + [["Claim #", "&nbsp;"]]],
 ["p", "The repairs on this claim are complete as of the date below. The final invoice and completion photos are attached. Please release the recoverable depreciation held on this claim."],
 ["info", [["Work completed on", "&nbsp;"], ["Final invoice amount", "&nbsp;"]]],
 CS])
T("sewage_notice", "Sewage / Category 3 Water — Occupant Health Notice", "Water Damage", True, [
 ["title", "Category 3 (Sewage / Black Water) Health Notice", "Please read — this water can carry germs that make people sick"], ["info", J],
 ["box", "<b>Keep out of the affected area</b> until GrayCo says it is clean. Children, older adults, pregnant women and anyone with a weak immune system or breathing problems should stay away from the home if the area cannot be closed off."],
 ["li", ["Porous materials that touched the water (carpet, pad, drywall, insulation) are removed — they cannot be safely cleaned.", "The area is cleaned, disinfected and dried, and kept under negative air while work is done.", "Wash hands after touching anything from the affected area; do not eat or drink there.", "Food, medicine, toys and cosmetics that touched the water should be thrown away."]],
 ["checks", ["Occupants will stay out of the work area.", "Occupants will stay somewhere else during the work.", "I received this notice and asked my questions."]],
 CS])

# ═══ CONTENTS ═══
T("contents_storage", "Contents Storage Agreement", "Contents", True, [
 ["title", "Contents Storage Agreement", "Your belongings stored while the work is done"], ["info", J + [["Storage location", "&nbsp;"], ["Start date", "&nbsp;"]]],
 ["li", ["Items are inventoried and photographed at pack-out (see the pack-out inventory).", "Storage charges are billed to your insurance claim when covered; otherwise at the rate below.", "Items are returned when the work is done or when you ask, with 3 business days' notice.", "Do not store cash, jewelry, firearms, medicine, important papers or perishables with us."]],
 ["info", [["Storage rate (if not covered)", "&nbsp;"], ["Number of boxes / pieces", "&nbsp;"]]],
 CS])
T("contents_return", "Contents Return (Pack-Back) Receipt", "Contents", True, [
 ["title", "Contents Return Receipt", "Your belongings are back"], ["info", J],
 ["checks", ["All boxes and items on the inventory were returned", "Items were put back in the rooms the owner chose", "Items marked damaged or missing are listed below"]],
 ["grid", ["Item", "Inventory #", "Problem"], 6],
 CS])

# ═══ SCHEDULE & CHANGES ═══
T("delay_notice", "Schedule Delay Notice", "Schedule & Changes", True, [
 ["title", "Schedule Delay Notice", "Why the schedule moved and the new dates"], ["info", J],
 ["checks", ["Weather", "Material delivery / backorder", "Permit or inspection", "Insurance approval", "Owner selection or decision", "Hidden condition found", "Change order", "Other: ____________"]],
 ["info", [["Days affected", "&nbsp;"], ["New expected date", "&nbsp;"], ["What we need from you", "&nbsp;"]]],
 ["p", "We will keep you updated in your customer portal. Call {pm} at {office_phone} with any questions."],
 CS])
T("tm_auth", "Time & Material Work Authorization", "Schedule & Changes", True, [
 ["title", "Time and Material Authorization", "Work priced by the hour and by the material used"], ["info", J],
 ["p", "I authorize GrayCo to do the work below on a time-and-material basis because it cannot be priced ahead of time."],
 ["info", [["Work", "&nbsp;"], ["Labor rate per hour", "&nbsp;"], ["Material markup", "&nbsp;"], ["Not to exceed (without my OK)", "&nbsp;"]]],
 ["p", "GrayCo keeps daily time-and-material tickets for me to sign. Billing follows the agreement's payment terms."],
 CS])
T("tm_ticket", "Daily Time & Material Ticket", "Schedule & Changes", True, [
 ["title", "Daily Time and Material Ticket", "Signed each day the T&M work is done"], ["info", J],
 ["grid", ["Worker", "Hours", "Work done"], 6],
 ["grid", ["Material", "Qty", "Unit"], 6],
 CS])
T("allowance_recon", "Allowance Reconciliation", "Schedule & Changes", True, [
 ["title", "Allowance Reconciliation", "What was budgeted for selections and what they cost"], ["info", J],
 ["grid", ["Allowance item", "Allowance", "Actual cost", "Over / (under)"], 10],
 ["p", "The difference is added to (or credited on) the next invoice as the agreement says."],
 CS])
T("selection_deadline", "Selections Due — Reminder", "Schedule & Changes", True, [
 ["title", "Selections Due", "Choices we need from you to keep the schedule"], ["info", J],
 ["grid", ["Selection", "Due by", "Notes"], 8],
 ["p", "A selection made after its due date can delay the job or need a change order if the order is already placed."],
 CS])

# ═══ CLOSEOUT & WARRANTY ═══
T("substantial_completion", "Certificate of Substantial Completion", "Closeout", True, [
 ["title", "Certificate of Substantial Completion", "The work is ready to use; only the punch list is left"], ["info", J],
 ["info", [["Date of substantial completion", "&nbsp;"], ["Punch list items left", "&nbsp;"], ["Expected punch-out date", "&nbsp;"]]],
 ["p", "The owner may use the work for its intended purpose from the date above. The warranty starts on this date. The payment due at substantial completion is due as the agreement says; the retainage (if any) is due when the punch list is done."],
 CS])
T("final_payment_ack", "Final Payment Received — Acknowledgment", "Closeout", True, [
 ["title", "Final Payment Received", "Thank you — the job is paid in full"], ["info", J + [["Final payment", "&nbsp;"], ["Paid by (check # / method)", "&nbsp;"]]],
 ["p", "GrayCo received the final payment above. The job is paid in full. A final lien waiver and your warranty certificate are in your customer portal."],
 CS])
T("warranty_claim", "Warranty Service Request", "Closeout", True, [
 ["title", "Warranty Service Request", "Tell us what needs a look"], ["info", J],
 ["info", [["What is wrong", "&nbsp;"], ["Where", "&nbsp;"], ["When it started", "&nbsp;"], ["Best time to visit", "&nbsp;"]]],
 ["p", "Send photos if you can. GrayCo will contact you within 2 business days to set a visit. Work covered by the warranty is at no cost; anything not covered is quoted first."],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("care_guide", "Home Care Guide — After Your Project", "Closeout", True, [
 ["title", "Caring for Your New Work", "Simple care that keeps it looking new and keeps your warranty"], ["info", J],
 ["li", ["New paint: wait 30 days before scrubbing; touch-up paint is labeled in the garage.", "Flooring: felt pads under furniture; clean with the maker's recommended cleaner, not steam.", "Grout and natural stone: seal again every year.", "Caulk around tubs, showers and windows shrinks over time — recaulk as needed.", "Cabinets and counters: wipe up water; do not cut directly on counters.", "Keep gutters clean and drainage away from the house."]],
 ["sigs", "Customer / owner", "GrayCo representative"], ["small", CALL]])
T("review_request", "Thank You & Review Request", "Closeout", True, [
 ["title", "Thank You!", "It was a pleasure working on your home"], ["info", [["Customer", "{customer}"], ["Job", "{job_name}"], ["Date", "{date}"]]],
 ["p", "Thank you for choosing GrayCo Construction Services. If you are happy with our work, a short review helps other families find us. If anything is not right, please call {pm} or our office at {office_phone} first — we want to fix it."],
 ["p", "Know someone who needs a contractor? Ask your project manager about our referral program."]])

# ═══ DISPUTES & NON-PAYMENT (never sent by themselves) ═══
T("notice_to_cure_owner", "Notice of Non-Payment — Opportunity to Cure", "Disputes & Non-Payment", True, [
 ["title", "Notice of Past-Due Payment", "Opportunity to bring the account current"], ["info", J],
 ["info", [["Invoice(s)", "&nbsp;"], ["Amount past due", "&nbsp;"], ["Due since", "&nbsp;"], ["Pay by", "&nbsp;"]]],
 ["p", "Our records show the amount above is past due under our agreement. Please pay it by the date above or call us to talk about it. If it is not paid, the agreement allows GrayCo to stop work until it is paid, and the schedule will move."],
 ["sigs", "GrayCo representative", "Received by (customer)"]])
T("stop_work_nonpay", "Stop-Work Notice — Non-Payment", "Disputes & Non-Payment", True, [
 ["title", "Stop-Work Notice", "Work is paused for non-payment"], ["info", J],
 ["info", [["Amount past due", "&nbsp;"], ["Notice of past-due payment sent on", "&nbsp;"], ["Work stops on", "&nbsp;"]]],
 ["p", "As the agreement allows, GrayCo is stopping work on this job until the past-due amount is paid. The site will be left safe and weather-tight. Work restarts within 5 business days after payment; remobilization costs may be charged as the agreement says."],
 ["sigs", "GrayCo representative", "Received by (customer)"]])
T("mediation_request", "Request for Mediation", "Disputes & Non-Payment", True, [
 ["title", "Request for Mediation", "Working out a disagreement with a neutral mediator"], ["info", J],
 ["p", "Our agreement says a disagreement goes to non-binding mediation first. GrayCo asks to mediate the issue below. Please reply within 10 days with dates that work for you."],
 ["info", [["The issue", "&nbsp;"], ["Amount involved", "&nbsp;"], ["Proposed mediator / service", "&nbsp;"]]],
 ["sigs", "GrayCo representative", "Received by (customer)"]])
T("complaint_form", "Customer Concern / Complaint Form", "Disputes & Non-Payment", True, [
 ["title", "Customer Concern", "Tell us what is wrong so we can make it right"], ["info", J],
 ["info", [["The concern", "&nbsp;"], ["What you would like us to do", "&nbsp;"], ["Best way to reach you", "&nbsp;"]]],
 ["p", "Your project manager or an owner of GrayCo will call you within 1 business day."],
 ["info", [["Received by", "&nbsp;"], ["Resolution", "&nbsp;"], ["Closed on", "&nbsp;"]]]])

# ═══ COMMERCIAL — PAY & CLOSEOUT (to the GC / owner; not sent by themselves) ═══
T("pay_app", "Application for Payment", "Commercial — Pay & Closeout", False, [
 ["title", "Application and Certificate for Payment", "With the attached Schedule of Values (continuation sheet)"], ["info", JC + [["Application #", "&nbsp;"], ["Period to", "&nbsp;"]]],
 ["info", [["1. Original contract sum", "{contract_amount}"], ["2. Net change by change orders", "&nbsp;"], ["3. Contract sum to date (1 + 2)", "&nbsp;"], ["4. Total completed and stored to date", "&nbsp;"], ["5. Retainage", "&nbsp;"], ["6. Total earned less retainage (4 − 5)", "&nbsp;"], ["7. Less previous applications", "&nbsp;"], ["8. CURRENT PAYMENT DUE (6 − 7)", "&nbsp;"], ["9. Balance to finish, plus retainage (3 − 6)", "&nbsp;"]]],
 ["p", "The undersigned contractor certifies that, to the best of its knowledge, the work covered by this application is complete as shown, all amounts previously paid were used to pay for work and materials covered by earlier applications, and the current payment is now due."],
 ["sigs", "GrayCo Construction Services, LLC", "Architect / owner approval"]], COM)
T("cor", "Change Order Request (COR)", "Commercial — Pay & Closeout", False, [
 ["title", "Change Order Request", "Pricing for a change to the contract scope"], ["info", JC + [["COR #", "&nbsp;"], ["Reference (RFI / ASI / directive)", "&nbsp;"]]],
 ["p", "Description of the change:"], ["grid", ["Item", "Labor", "Material", "Equipment", "Sub", "Total"], 8],
 ["info", [["Overhead & profit", "&nbsp;"], ["Total requested", "&nbsp;"], ["Days added to schedule", "&nbsp;"]]],
 ["p", "This price is good for 30 days. Work on this change starts after a signed change order or written directive."],
 ["sigs", "GrayCo Construction Services, LLC", "Approved by (GC / owner)"]], COM)
T("notice_of_delay_gc", "Notice of Delay / Claim for Time", "Commercial — Pay & Closeout", False, [
 ["title", "Notice of Delay", "Written notice as the contract requires"], ["info", JC],
 ["info", [["Cause of delay", "&nbsp;"], ["Started on", "&nbsp;"], ["Activities affected", "&nbsp;"], ["Time requested (days)", "&nbsp;"], ["Cost impact (if known)", "&nbsp;"]]],
 ["p", "GrayCo gives this notice within the time the contract requires and reserves its right to an extension of time and to additional costs caused by this delay."],
 ["sigs", "GrayCo Construction Services, LLC", "Received by"]], COM)
T("affidavit_payment", "Contractor's Affidavit of Payment of Debts", "Commercial — Pay & Closeout", False, [
 ["title", "Contractor's Affidavit of Payment of Debts and Claims", "For final payment"], ["info", JC],
 ["p", "The undersigned states that, except as listed below, all payrolls, bills for materials and equipment, and all other debts for which the owner or its property might be held responsible, arising out of this contract, have been paid or otherwise satisfied."],
 ["grid", ["Exception (vendor / sub)", "Amount", "Reason"], 4],
 ["sigs", "GrayCo Construction Services, LLC (officer)", "Notary (if required)"]], COM)
T("closeout_checklist", "Project Closeout Checklist", "Commercial — Pay & Closeout", False, [
 ["title", "Project Closeout Checklist", "Everything the GC / owner needs to close the job"], ["info", JC],
 ["checks", ["Punch list complete and signed", "Certificate of substantial completion", "As-built / record drawings", "O&M manuals and product data", "Warranties (GrayCo + manufacturers)", "Attic stock / spare materials turned over", "Keys and access cards returned", "Final inspection / certificate of occupancy", "Final lien waivers (GrayCo + subs + suppliers)", "Contractor's affidavit of payment", "Final application for payment", "Retainage invoice"]],
 ["info", [["Closeout package sent on", "&nbsp;"], ["Sent to", "&nbsp;"]]]], COM)
T("meeting_minutes", "Meeting Minutes", "Commercial — Pay & Closeout", False, [
 ["title", "Meeting Minutes", "Owner / architect / contractor meeting"], ["info", JC + [["Meeting #", "&nbsp;"], ["Attendees", "&nbsp;"]]],
 ["grid", ["Item", "Discussion", "Action by", "Due"], 10],
 ["small", "Anyone who disagrees with these minutes should say so in writing within 5 days, or they stand as written."]], COM)
T("submittal_log", "Submittal Log", "Commercial — Pay & Closeout", False, [
 ["title", "Submittal Log", "Shop drawings, product data and samples"], ["info", JC],
 ["grid", ["#", "Spec section", "Description", "Sent", "Returned", "Status"], 14]], COM)

# ═══ SUBCONTRACTORS ═══
T("sub_ntp", "Notice to Proceed — Subcontractor", "Subcontractor", False, [
 ["title", "Notice to Proceed", "You may start your scope on this job"], ["info", JS],
 ["info", [["Start date", "&nbsp;"], ["Finish by", "&nbsp;"], ["Site contact", "{pm}"], ["Work hours", "&nbsp;"]]],
 ["p", "Proceed with the work in your subcontract / work order. Use the job PO on every invoice. Your insurance certificate and W-9 must be on file before you start."],
 ["sigs", "GrayCo Construction Services, LLC", "Subcontractor"]])
T("sub_cure", "Notice to Cure — Subcontractor", "Subcontractor", False, [
 ["title", "Notice to Cure", "A problem with your work that must be fixed"], ["info", JS],
 ["info", [["The problem", "&nbsp;"], ["Subcontract section", "&nbsp;"], ["Cure by", "&nbsp;"]]],
 ["p", "If the problem is not fixed by the date above, GrayCo may fix it itself or by others and back-charge the cost, or terminate the subcontract for default as the subcontract allows."],
 ["sigs", "GrayCo Construction Services, LLC", "Received by (subcontractor)"]])
T("sub_backcharge", "Back-Charge Notice — Subcontractor", "Subcontractor", False, [
 ["title", "Back-Charge Notice", "Costs GrayCo had because of your work"], ["info", JS],
 ["grid", ["Date", "What happened", "Cost"], 6],
 ["p", "This amount will be deducted from your next payment unless you contact us within 5 business days."],
 ["sigs", "GrayCo Construction Services, LLC", "Subcontractor"]])
T("sub_final_release", "Subcontractor Final Release & Affidavit", "Subcontractor", False, [
 ["title", "Subcontractor Final Release and Affidavit", "Signed with the sub's final payment"], ["info", JS + [["Final payment", "&nbsp;"]]],
 ["p", "On receipt of the final payment above, the subcontractor releases GrayCo, the owner and the property from all claims for work, labor and materials on this project, and states that all its workers, suppliers and lower-tier subcontractors have been paid in full."],
 ["sigs", "Subcontractor (authorized officer)", "Notary (if required)"]])
T("sub_qualification", "Subcontractor Qualification Form", "Subcontractor", False, [
 ["title", "Subcontractor Qualification", "Tell us about your company"], ["info", [["Company", "&nbsp;"], ["Owner / contact", "&nbsp;"], ["Phone / e-mail", "&nbsp;"], ["Address", "&nbsp;"]]],
 ["info", [["Trade(s)", "&nbsp;"], ["Years in business", "&nbsp;"], ["License # / state", "&nbsp;"], ["Crew size", "&nbsp;"], ["Areas you work", "&nbsp;"], ["General liability carrier / limits", "&nbsp;"], ["Workers' comp (or exemption)", "&nbsp;"]]],
 ["grid", ["Reference (company)", "Contact", "Phone"], 3],
 ["sigs", "Subcontractor", "GrayCo"]])
T("sub_safety_ack", "Subcontractor Site Safety Acknowledgment", "Subcontractor", False, [
 ["title", "Site Safety Rules for Subcontractors", "Read and sign before your first day"], ["info", JS],
 ["li", ["Follow OSHA rules: fall protection over 6 ft, ladders tied off, PPE (hard hat where required, eye protection, gloves, boots).", "No drugs, alcohol or weapons on site. No smoking inside the building.", "Keep the work area clean; haul off your debris unless the subcontract says otherwise.", "Report every injury, near miss and damage to GrayCo the same day.", "Respect the customer's home: no music loud enough to bother anyone, no use of the customer's bathroom without permission, park where told.", "Lead-safe work practices (RRP) on pre-1978 homes when paint is disturbed."]],
 ["sigs", "Subcontractor (foreman)", "GrayCo"]])

# ═══ SAFETY ═══
T("jha", "Job Hazard Analysis (JHA)", "Safety", False, [
 ["title", "Job Hazard Analysis", "Done before risky tasks"], ["info", [["Job", "{job_name}"], ["Address", "{job_address}"], ["Date", "{date}"], ["Supervisor", "{pm}"]]],
 ["grid", ["Task step", "Hazard", "How we control it", "PPE"], 8],
 ["grid", ["Crew member", "Signature"], 6]])
T("incident_report", "Incident / Injury Report", "Safety", False, [
 ["title", "Incident / Injury Report", "Fill out the same day"], ["info", [["Job", "{job_name}"], ["Address", "{job_address}"], ["Date of incident", "&nbsp;"], ["Time", "&nbsp;"]]],
 ["info", [["Person involved", "&nbsp;"], ["Employer (GrayCo / sub)", "&nbsp;"], ["What happened", "&nbsp;"], ["Injury / damage", "&nbsp;"], ["Treatment given", "&nbsp;"], ["Witnesses", "&nbsp;"], ["What we change so it does not happen again", "&nbsp;"]]],
 ["checks", ["Medical treatment beyond first aid (may be OSHA recordable)", "Property damage", "Near miss (no injury)", "Owner / office told"]],
 ["sigs", "Person reporting", "Supervisor"]])
T("vehicle_accident", "Vehicle Accident Report", "Safety", False, [
 ["title", "Vehicle Accident Report", "Keep in every company vehicle"], ["info", [["Driver", "&nbsp;"], ["Vehicle / plate", "&nbsp;"], ["Date / time", "&nbsp;"], ["Location", "&nbsp;"]]],
 ["li", ["Make sure everyone is safe; call 911 if anyone is hurt.", "Call the police for a report; get the report #.", "Take photos of all vehicles, plates, the scene.", "Do not admit fault or sign anything except the police report.", "Call the office right away."]],
 ["info", [["Other driver / phone", "&nbsp;"], ["Other insurance / policy #", "&nbsp;"], ["Police report #", "&nbsp;"], ["Witnesses", "&nbsp;"], ["What happened", "&nbsp;"]]],
 ["sigs", "Driver", "Office"]])
T("visitor_release", "Jobsite Visitor Safety Release", "Safety", True, [
 ["title", "Jobsite Visitor Safety", "For owners and guests walking an active jobsite"], ["info", J],
 ["li", ["Visit only with a GrayCo team member, or after hours when the site is safe.", "Wear closed-toe shoes; stay out of marked areas, ladders and scaffolding.", "Keep children and pets away from the work area.", "Watch for nails, open floors, cords and debris."]],
 ["p", "I understand that an active construction site has hazards, and I will follow these rules when I visit."],
 CS])

# ═══ HR ═══
T("offer_letter", "Offer of Employment", "HR", False, [
 ["title", "Offer of Employment", "GrayCo Construction Services, LLC"], ["info", JE + [["Start date", "&nbsp;"], ["Reports to", "&nbsp;"]]],
 ["info", [["Pay", "&nbsp;"], ["Full / part time", "&nbsp;"], ["Benefits", "&nbsp;"], ["Vehicle / tools", "&nbsp;"]]],
 ["p", "This offer depends on a completed I-9, a background check / driving record check where the job needs one, and a drug screen if required. Employment with GrayCo is at will: you or GrayCo may end it at any time, for any lawful reason. This letter is not a contract for a set period of time."],
 ["sigs", "GrayCo Construction Services, LLC", "Employee (accepted)"]], ["hr"])
T("onboarding", "New Employee Onboarding Checklist", "HR", False, [
 ["title", "New Employee Onboarding", "Done in the first week"], ["info", JE],
 ["checks", ["I-9 with documents (within 3 days)", "W-4 and state withholding", "Direct deposit form", "Emergency contact form", "Employee handbook received and signed", "Safety orientation + PPE issued", "Lead-safe (RRP) / OSHA 10 training scheduled", "Driver's license + insurance on file (if driving)", "Tools / equipment issued (signed)", "CRM and Field app login set up", "Uniform / shirts"]],
 ["sigs", "Employee", "Office"]], ["hr"])
T("emergency_contact", "Employee Emergency Contact Form", "HR", False, [
 ["title", "Emergency Contact", "Kept private in the office file"], ["info", JE],
 ["info", [["Contact 1 — name / relationship", "&nbsp;"], ["Phone", "&nbsp;"], ["Contact 2 — name / relationship", "&nbsp;"], ["Phone", "&nbsp;"], ["Medical conditions / allergies we should know (optional)", "&nbsp;"]]],
 ["sigs", "Employee", "Office"]], ["hr"])
T("direct_deposit", "Direct Deposit Authorization", "HR", False, [
 ["title", "Direct Deposit Authorization", "Kept private in the office file"], ["info", JE],
 ["info", [["Bank name", "&nbsp;"], ["Routing #", "&nbsp;"], ["Account #", "&nbsp;"], ["Checking / savings", "&nbsp;"]]],
 ["p", "I authorize GrayCo to deposit my pay to the account above, and to correct any deposit made in error. Attach a voided check or bank letter."],
 ["sigs", "Employee", "Office"]], ["hr"])
T("tool_issue", "Tool & Equipment Issue Agreement", "HR", False, [
 ["title", "Company Tools and Equipment", "Issued to an employee"], ["info", JE],
 ["grid", ["Item", "Serial / tag #", "Value", "Issued on", "Returned on"], 8],
 ["p", "Company tools are for GrayCo work only and are returned when asked or when employment ends. Loss or damage from misuse or neglect may be the employee's responsibility as far as the law allows."],
 ["sigs", "Employee", "Office"]], ["hr"])
T("vehicle_policy", "Company Vehicle Use Policy — Acknowledgment", "HR", False, [
 ["title", "Company Vehicle Use", "Rules for driving a GrayCo vehicle"], ["info", JE + [["Vehicle", "&nbsp;"]]],
 ["li", ["Valid driver's license and a clean enough record for our insurance.", "No phone use while driving except hands-free; no texting.", "Seat belts always; obey all traffic laws; you pay your own tickets.", "No personal passengers or personal use unless approved.", "Report every accident or damage the same day (vehicle accident report)."]],
 ["sigs", "Employee", "Office"]], ["hr"])
T("drug_policy", "Drug & Alcohol Policy — Acknowledgment", "HR", False, [
 ["title", "Drug and Alcohol Policy", "A safe jobsite for everyone"], ["info", JE],
 ["p", "Using, having or being under the influence of alcohol, illegal drugs or misused prescription drugs at work or in a company vehicle is not allowed. GrayCo may test after an accident or with reasonable suspicion as the law allows. Breaking this policy can lead to discipline up to termination."],
 ["sigs", "Employee", "Office"]], ["hr"])
T("pto_request", "Time Off Request", "HR", False, [
 ["title", "Time Off Request", "Ask at least 2 weeks ahead when you can"], ["info", JE],
 ["info", [["From", "&nbsp;"], ["To", "&nbsp;"], ["Hours", "&nbsp;"], ["Reason (optional)", "&nbsp;"]]],
 ["checks", ["Approved", "Not approved"]],
 ["sigs", "Employee", "Supervisor"]], ["hr"])
T("write_up", "Employee Warning / Corrective Action", "HR", False, [
 ["title", "Corrective Action", "A written record of a problem and the plan to fix it"], ["info", JE + [["Supervisor", "&nbsp;"]]],
 ["checks", ["Verbal warning (documented)", "Written warning", "Final warning", "Suspension"]],
 ["info", [["What happened (facts, dates)", "&nbsp;"], ["Rule / expectation", "&nbsp;"], ["What must change", "&nbsp;"], ["Follow-up date", "&nbsp;"]]],
 ["p", "Signing shows you received this, not that you agree. You may add your own comments."],
 ["sigs", "Employee", "Supervisor"]], ["hr"])
T("separation", "Employee Separation Checklist", "HR", False, [
 ["title", "Employee Separation", "When someone leaves GrayCo"], ["info", JE + [["Last day", "&nbsp;"], ["Reason", "&nbsp;"]]],
 ["checks", ["Final pay on time (state law)", "Tools, keys, vehicle, fuel card, uniforms returned", "CRM / Field app / e-mail access turned off", "Phone numbers and portal links changed if needed", "Benefits / COBRA notice (if any)", "Exit conversation"]],
 ["sigs", "Employee", "Office"]], ["hr"])
T("training_record", "Training Sign-In Sheet", "HR", False, [
 ["title", "Training Sign-In", "Safety, lead-safe, equipment or company training"], ["info", [["Training", "&nbsp;"], ["Trainer", "&nbsp;"], ["Date", "{date}"], ["Length", "&nbsp;"]]],
 ["grid", ["Name", "Signature"], 14]], ["hr"])

# ═══ VENDORS ═══
T("vendor_po", "Purchase Order", "Vendors & Purchasing", False, [
 ["title", "Purchase Order", "GrayCo Construction Services, LLC"], ["info", [["Vendor", "&nbsp;"], ["Job", "{job_name}"], ["Deliver to", "{job_address}"], ["PO #", "{po}"], ["Date", "{date}"]]],
 ["grid", ["Item", "Qty", "Unit", "Unit price", "Total"], 12],
 ["p", "Put the PO # on every invoice and delivery ticket. Send invoices to {billing_email}."],
 ["sigs", "Ordered by (GrayCo)", "Vendor"]])
T("credit_app", "Vendor Credit / Account Setup", "Vendors & Purchasing", False, [
 ["title", "Vendor Account Setup", "Information GrayCo gives a supplier to open an account"], ["info", [["Company", "GrayCo Construction Services, LLC"], ["Billing e-mail", "{billing_email}"], ["Office phone", "{office_phone}"], ["License #", "{license}"], ["Date", "{date}"]]],
 ["info", [["Vendor", "&nbsp;"], ["Account #", "&nbsp;"], ["Terms", "&nbsp;"], ["Tax exempt?", "&nbsp;"], ["Authorized buyers", "&nbsp;"]]],
 ["p", "Every purchase needs a GrayCo job PO. Purchases without a PO are not authorized."],
 ["sigs", "GrayCo (officer)", "Vendor"]])

out = []
for id, name, cat, types, cf, blocks in D:
    out.append('T(' + json.dumps(id) + ', ' + json.dumps(name, ensure_ascii=False) + ', ' + json.dumps(cat) + ', ' + json.dumps(types) + ', ' + ('true' if cf else 'false') + ', l2(' + json.dumps(blocks, ensure_ascii=False) + '));')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'more_templates.js'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(len(D), 'templates')
