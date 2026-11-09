#!/usr/bin/env python3
"""The restoration document set (owner 11/9: "every document for every situation in water, fire, mold, disaster services,
asbestos, lead"). Writes tools/resto_templates.js — T(...) lines for the CRM's document library (patch RESTODOCS)."""
import json, os
J = [["Customer / owner", "{customer}"], ["Property address", "{job_address}"], ["Job / claim", "{job_name}"], ["PO / Job #", "{po}"], ["Date", "{date}"]]
ALL = ["insurance", "residential", "commercial"]
D = []
def T(id, name, cat, cf, blocks, types=ALL): D.append((id, name, cat, types, cf, blocks))
STOP = "If you have questions, call GrayCo at {office_phone}."

# ── WATER ──
T("water_emergency_auth", "Water Damage — Emergency Services Authorization", "Water Damage", True, [
 ["title", "Emergency Water Damage Services Authorization", "Water extraction, drying and stabilization"], ["info", J],
 ["p", "I ask GrayCo Construction Services, LLC to begin emergency water mitigation at the property above: stop or contain the water where possible, extract standing water, remove wet materials that cannot be dried, and set drying equipment."],
 ["h", "What I understand"],
 ["li", ["Drying usually takes 3 to 5 days; GrayCo checks moisture and moves equipment until materials reach the dry standard.", "Wet drywall, insulation, carpet pad or other materials that cannot be saved may be removed to dry the structure and prevent mold.", "Drying equipment uses electricity at my expense and must stay on and in place until GrayCo removes it.", "Category 2 or 3 (gray or sewage) water may require more removal and antimicrobial treatment for health and safety.", "Charges are billed by the line-item pricing used by insurance carriers; I am responsible for my deductible and for anything my insurance does not pay."]],
 ["checks", ["The water source has been stopped / repaired.", "Power is on and available for equipment.", "Pets and children will be kept away from the work and equipment."]],
 ["sigs", "Customer / owner", "GrayCo representative"], ["small", STOP]])
T("water_category_report", "Water Loss — Category & Class Report", "Water Damage", False, [
 ["title", "Water Loss Category and Class Report", "IICRC S500 assessment at first visit"], ["info", J + [["Date of loss", "&nbsp;"], ["Source of water", "&nbsp;"]]],
 ["h", "Category (contamination)"], ["checks", ["Category 1 — clean water (supply line, rain without contact with contaminants)", "Category 2 — gray water (appliance discharge, toilet overflow without feces)", "Category 3 — black water (sewage, rising flood water, long-standing water)"]],
 ["h", "Class (amount of wet material / evaporation load)"], ["checks", ["Class 1 — small area, little absorbed", "Class 2 — a whole room, wicking up walls under 24 in.", "Class 3 — ceilings, walls, insulation, carpet saturated", "Class 4 — specialty drying (hardwood, plaster, concrete, crawlspace)"]],
 ["grid", ["Room", "Affected area (SF)", "Materials wet", "Highest reading", "Removed?"], 8],
 ["info", [["Technician", "{pm}"], ["Signature / date", "&nbsp;"]]]])
T("water_equipment_resp", "Drying Equipment — Customer Responsibility", "Water Damage", True, [
 ["title", "Drying Equipment Placement and Responsibility", "Air movers, dehumidifiers and air scrubbers left at the property"], ["info", J],
 ["grid", ["Equipment", "Asset # / serial", "Room", "Date placed", "Date removed"], 8],
 ["li", ["Do not turn off, unplug or move the equipment unless GrayCo tells you to — drying stops when it is off.", "Keep doors and windows closed unless GrayCo says otherwise.", "Equipment is GrayCo property; loss or damage beyond normal wear while it is in your care may be billed.", "Call {office_phone} if a unit stops, trips a breaker or makes an unusual noise."]],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("water_dry_cert", "Certificate of Drying (Dry Standard Reached)", "Water Damage", True, [
 ["title", "Certificate of Drying", "The structure reached the dry standard and equipment was removed"], ["info", J],
 ["p", "GrayCo verified with moisture meters that the affected materials reached the dry standard (readings within the range of unaffected materials of the same kind). Final readings are recorded in the drying log for this job."],
 ["info", [["Equipment removed on", "&nbsp;"], ["Total drying days", "&nbsp;"], ["Rooms dried", "&nbsp;"]]],
 ["p", "Repairs (rebuild) of removed materials are a separate scope unless included in your agreement."],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("antimicrobial_consent", "Antimicrobial / Disinfectant Application Consent", "Water Damage", True, [
 ["title", "Antimicrobial Application Consent", "EPA-registered products used to clean and sanitize affected areas"], ["info", J + [["Product(s)", "&nbsp;"], ["Areas", "&nbsp;"]]],
 ["p", "GrayCo will apply EPA-registered antimicrobial or disinfectant products to affected materials, used according to their labels. Safety Data Sheets are available on request."],
 ["checks", ["Someone in the home is pregnant, has asthma, allergies or chemical sensitivity — tell your project manager before application.", "Keep children and pets out of treated areas until dry (usually 1–2 hours)."]],
 ["sigs", "Customer / owner", "GrayCo representative"]])

# ── FIRE & SMOKE ──
T("fire_work_auth", "Fire & Smoke Damage — Work Authorization", "Fire & Smoke", True, [
 ["title", "Fire and Smoke Damage Work Authorization", "Emergency services, cleaning, deodorization and repairs"], ["info", J + [["Date of loss", "&nbsp;"]]],
 ["p", "I authorize GrayCo to secure the property, remove debris, clean soot and smoke residue, deodorize, and perform the repairs we agree on in writing. Charges follow insurance line-item pricing; I am responsible for my deductible and anything my insurance does not pay."],
 ["checks", ["Emergency board-up / tarping", "Debris removal and haul-off", "Soot and smoke cleaning (structure)", "Odor control (thermal fog, hydroxyl or ozone — see the odor control notice)", "Contents pack-out and cleaning (see pack-out authorization)", "Reconstruction (separate scope / estimate)"]],
 ["sigs", "Customer / owner", "GrayCo representative"], ["small", STOP]])
T("odor_control_notice", "Odor Control (Ozone / Hydroxyl / Thermal Fog) — Safety Notice", "Fire & Smoke", True, [
 ["title", "Odor Control Safety Notice", "Ozone, hydroxyl, thermal fogging and sealers"], ["info", J + [["Method", "&nbsp;"], ["Dates", "&nbsp;"]]],
 ["box", "<b>Ozone treatment requires the building to be EMPTY</b> of people, pets and plants. Do not enter until GrayCo says it is safe."],
 ["li", ["Remove or let GrayCo remove pets, plants, food and medications from treated areas.", "Some odor treatments can affect rubber, fabrics or electronics with long exposure; GrayCo limits run times.", "Odors can return in hot or humid weather; a second treatment may be needed."]],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("contents_disposal", "Non-Salvageable Contents — Disposal Authorization", "Fire & Smoke", True, [
 ["title", "Disposal Authorization for Non-Salvageable Items", "Water, fire, smoke or mold-damaged personal property"], ["info", J],
 ["p", "The items below cannot reasonably be cleaned or restored. Photos and an inventory are kept for your insurance claim. I authorize GrayCo to dispose of them."],
 ["grid", ["Item", "Room", "Qty", "Age (yrs)", "Reason", "Photo #"], 12],
 ["checks", ["I want to keep the items marked \"keep\" above, even though they are not salvageable.", "I have removed any personal papers, photos or valuables I want to keep."]],
 ["sigs", "Customer / owner", "GrayCo representative"]])

# ── MOLD ──
T("mold_assessment_auth", "Mold Assessment / Testing Authorization", "Mold", True, [
 ["title", "Mold Assessment and Testing Authorization", "Independent assessment before and clearance after remediation"], ["info", J],
 ["p", "Mold remediation is planned from an assessment. GrayCo recommends an independent indoor environmental professional (IEP) who does not work for GrayCo, so the results are unbiased."],
 ["checks", ["I will hire an independent assessor; GrayCo will follow the assessor's protocol.", "I ask GrayCo to coordinate an independent assessor on my behalf (assessor's fees billed to me or my carrier).", "I decline an assessment and accept a visual / moisture-based scope (not recommended)."]],
 ["info", [["Assessor / firm", "&nbsp;"], ["Date", "&nbsp;"]]], ["sigs", "Customer / owner", "GrayCo representative"]])
T("mold_containment_notice", "Mold Containment & Work Area Notice", "Mold", True, [
 ["title", "Mold Remediation — Containment and Work Area Notice", "Please read before work starts"], ["info", J],
 ["li", ["The work area is sealed with plastic and kept under negative air pressure with HEPA air scrubbers.", "Do not open, enter or remove the containment. Keep children and pets away.", "Workers wear respirators and protective suits — this protects them during cleanup; it does not mean the rest of the home is unsafe.", "HVAC to the area may be shut off or sealed during the work.", "Containment stays up until the area passes cleaning verification or clearance testing."]],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("mold_clearance_cert", "Mold Remediation — Post-Remediation Verification", "Mold", True, [
 ["title", "Post-Remediation Verification", "Mold remediation complete"], ["info", J],
 ["checks", ["Visible mold removed; surfaces cleaned and HEPA-vacuumed.", "Affected materials dry (moisture readings recorded).", "Independent clearance test passed — report attached.", "Clearance test declined by the customer."]],
 ["info", [["Clearance by", "&nbsp;"], ["Date", "&nbsp;"], ["Result", "&nbsp;"]]],
 ["p", "Mold can return if moisture returns. Keep humidity under 60 % and fix leaks promptly. GrayCo does not warrant against new moisture problems."],
 ["sigs", "Customer / owner", "GrayCo representative"]])

# ── STORM & DISASTER ──
T("board_up_auth", "Emergency Board-Up / Tarp Authorization", "Storm & Disaster", True, [
 ["title", "Emergency Board-Up and Tarp Authorization", "Temporary protection of the property"], ["info", J + [["Date of loss / storm", "&nbsp;"]]],
 ["p", "I authorize GrayCo to install temporary protection (roof tarps, board-up of windows and doors, temporary fencing) to prevent further damage. Temporary repairs are not permanent repairs and are billed separately."],
 ["grid", ["Location", "Work (tarp / board / fence)", "Size / qty"], 6],
 ["p", "Tarps can shift or leak in severe weather; call {office_phone} and GrayCo will re-secure them. Permanent repairs follow your claim approval or a signed contract."],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("tree_removal_release", "Tree / Debris Removal — Authorization & Release", "Storm & Disaster", True, [
 ["title", "Tree and Storm Debris Removal Authorization", "Removal from the structure and the property"], ["info", J],
 ["checks", ["Remove the tree / limbs from the structure", "Cut and haul off debris", "Leave cut wood on site at:", "Stump grinding (separate price)"]],
 ["p", "Removing a tree from a structure can cause more damage to already-damaged framing or roofing; GrayCo works carefully and documents the condition before and after with photos. Lawn and landscaping disturbance from equipment is not included unless written in."],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("storm_inspection_auth", "Storm Damage Inspection Authorization", "Storm & Disaster", True, [
 ["title", "Storm Damage Inspection Authorization", "Roof, siding, gutters and interior"], ["info", J + [["Storm date", "&nbsp;"]]],
 ["p", "I allow GrayCo to inspect and photograph the property for storm damage, including going on the roof. The inspection is free and does not commit me to any work. GrayCo will share its findings and photos with me."],
 ["checks", ["I would like GrayCo to meet my insurance adjuster if I file a claim.", "I have already filed a claim. Claim # (optional):"]],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("disaster_customer_info", "After the Loss — Customer Information Sheet", "Storm & Disaster", True, [
 ["title", "After the Loss — What Happens Next", "Information for the customer"], ["info", J + [["Your project manager", "{pm}"], ["Office", "{office_phone}"]]],
 ["li", ["Call your insurance company to report the claim if you have not already; keep your claim number handy.", "Keep receipts for hotel, meals and other extra costs — many policies pay Additional Living Expenses (ALE).", "Take photos of damaged items before anything is thrown away.", "GrayCo documents everything with photos and moisture readings and can share them with your adjuster.", "Do not sign anything from anyone that assigns away your claim unless you understand it.", "Questions about your claim payment go to your insurance company; questions about the work go to your project manager."]]])

# ── ASBESTOS ──
T("asb_testing_auth", "Asbestos Testing / Survey Authorization", "Asbestos", True, [
 ["title", "Asbestos Testing and Survey Authorization", "Before materials are disturbed"], ["info", J + [["Year built", "&nbsp;"]]],
 ["p", "Buildings built before 1981 may contain asbestos in drywall joint compound, textured ceilings, flooring and mastic, pipe insulation, siding or roofing. Materials are tested before they are disturbed."],
 ["checks", ["GrayCo will collect bulk samples (by a trained / accredited person) for laboratory (PLM) analysis.", "An accredited asbestos inspector will perform a survey (required for commercial and 5+ unit buildings).", "I decline testing and ask GrayCo to treat suspect materials as asbestos-containing (abatement costs apply)."]],
 ["grid", ["Sample #", "Material", "Location", "Result"], 8], ["sigs", "Customer / owner", "GrayCo representative"]])
T("asb_stop_work", "Suspect Asbestos Found — Stop-Work Notice", "Asbestos", True, [
 ["title", "Stop-Work Notice — Suspect Asbestos Material", "Work paused in the area below"], ["info", J + [["Area / material", "&nbsp;"], ["Found on", "&nbsp;"]]],
 ["p", "GrayCo found material that may contain asbestos and stopped work in that area. Please keep everyone out of the area. Work resumes after testing shows no asbestos, or after a licensed abatement contractor removes it."],
 ["checks", ["Sample sent to the lab on:", "Result received:", "Abatement contractor (if needed):", "Change order for testing / abatement / delay signed"]],
 ["sigs", "Customer / owner", "GrayCo representative"]])

# ── GENERAL RESTORATION ──
T("declined_services_release", "Customer-Declined Services — Release", "Restoration — General", True, [
 ["title", "Release for Declined or Limited Services", "When the customer declines work GrayCo recommends"], ["info", J],
 ["p", "GrayCo recommended the work below to properly mitigate or repair the damage. I have chosen not to have it done, or to limit it."],
 ["grid", ["Recommended work", "Why it was recommended", "Customer's choice"], 6],
 ["p", "I understand that declining this work may lead to further damage, mold growth, odor or health concerns, and that my insurance may not pay for damage caused by the delay. I release GrayCo from responsibility for results of the work I declined."],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("hidden_damage_notice", "Hidden / Concealed Damage Notice", "Restoration — General", True, [
 ["title", "Notice of Hidden or Concealed Conditions", "Found after walls, floors or ceilings were opened"], ["info", J + [["Found on", "&nbsp;"]]],
 ["p", "While working, GrayCo found the condition below that could not be seen before. It is not in the current scope or estimate."],
 ["info", [["Condition found", "&nbsp;"], ["Location", "&nbsp;"], ["Recommended action", "&nbsp;"], ["Estimated cost / change order", "&nbsp;"]]],
 ["checks", ["Proceed — change order to follow", "Hold — I will contact my insurance adjuster", "Do not proceed (see the declined-services release)"]],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("photo_consent", "Photo & Documentation Consent", "Restoration — General", True, [
 ["title", "Photo and Documentation Consent", "Photos, video and moisture readings of the property"], ["info", J],
 ["p", "GrayCo takes photos, video and readings to document the damage and the work, and shares them with you and, if you ask, with your insurance company. Photos are stored securely in GrayCo's job system."],
 ["checks", ["GrayCo may share photos and reports with my insurance adjuster.", "GrayCo may use photos (no address, names or personal items shown) for marketing.", "Do not use my photos for marketing."]],
 ["sigs", "Customer / owner", "GrayCo representative"]])
T("equipment_removal_signoff", "Equipment Removal & Job Walk Sign-Off (Mitigation)", "Restoration — General", True, [
 ["title", "Mitigation Complete — Equipment Removal and Walk-Through", "End of the emergency (mitigation) phase"], ["info", J],
 ["checks", ["All drying equipment removed and counted", "Work areas cleaned; debris removed", "Contents returned to place / in storage (inventory attached)", "Final moisture readings recorded", "Next step explained: rebuild estimate / insurance review"]],
 ["sigs", "Customer / owner", "GrayCo representative"]])

out = []
for id, name, cat, types, cf, blocks in D:
    out.append('T(' + json.dumps(id) + ', ' + json.dumps(name, ensure_ascii=False) + ', ' + json.dumps(cat) + ', ' + json.dumps(types) + ', ' + ('true' if cf else 'false') + ', l2(' + json.dumps(blocks, ensure_ascii=False) + '));')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resto_templates.js'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(len(D), 'templates')
