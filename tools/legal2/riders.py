# -*- coding: utf-8 -*-
"""Home-improvement / roofing disclosure riders for TN, MS and AR (general disclosures, flagged: statutory wording not retrieved)."""
from .lib import *

def rider(state, name, law_lines, lic_line, flags):
    doc('rider_' + state.lower(), name, 'Disclosure Riders', RES_INS, True, [
        ('title', name, 'Attach to the contract for residential work · customer copy · not a contract term unless the contract says so'),
        ('info', [['Owner / customer', '{customer}'], ['Property address', '{job_address}'], ['Contract / PO', '{po}'], ['Date', '{date}']]),
        ('h', 'Who is your contractor'),
        ('p', GCO + " · " + ADDR + " · " + PHONE + " · " + EMAIL),
        ('p', lic_line),
        ('h', 'What the law gives you'),
        ('li', law_lines),
        ('h', 'Insurance claims'),
        ('li', ["GrayCo is a contractor, not a public adjuster or attorney. GrayCo does not adjust, negotiate or settle your claim and cannot promise that your insurance company will approve or pay any amount.",
                "GrayCo does not pay, waive, rebate or absorb your insurance deductible. You are responsible for it.",
                "Your insurance company decides coverage. If it tells you in writing that all or part of the claim or work is not covered, you may have a right to cancel (see your Notice of Cancellation).",
                "You choose your contractor. You are not required to use GrayCo to have your claim paid."]),
        ('h', 'Your documents'),
        ('p', "You should receive: a signed copy of your contract and any change orders; two copies of the Notice of Cancellation (if your contract was signed at your home or anywhere other than GrayCo's office); the lien notice and lien waivers described in your contract; and a written warranty at completion."),
        ('p', "I received this disclosure and a copy of my contract. Owner initials: ________  Date: ____________"),
        ('sigs', 'Owner', GCO),
    ], flags=flags, group='Disclosure Riders')

def build():
    rider('TN', 'Tennessee Home Improvement and Residential Roofing Disclosure Rider', [
        "<b>Licensing.</b> A contractor doing work in Tennessee over the monetary limit must be licensed by the Tennessee Board for Licensing Contractors, and the license number must appear on the contract. You can check any Tennessee license at the Tennessee Department of Commerce and Insurance (tn.gov/commerce).",
        "<b>Written statement for residential roofing (Tenn. Code Ann. § 62-6-601 et seq.).</b> Before you sign a roof repair or replacement contract that is to be paid in whole or in part from an insurance claim, the roofer must give you in writing: the roofer's business mailing address and telephone number, its license or registration numbers, a written description of the damage and of the repairs, and a detachable NOTICE OF CANCELLATION in duplicate.",
        "<b>Three days to cancel.</b> For work signed at your home you may cancel before midnight of the third business day after you sign. For roofing paid by insurance you may also cancel before midnight of the third business day after you receive written notice from your insurance company that all or part of the claim or the work is not covered. Refunds are due within ten (10) business days, except for emergency repairs you asked for.",
        "<b>Lien rights.</b> People who furnish labor or materials may have lien rights under Tenn. Code Ann. § 66-11-101 et seq. even if you paid your contractor. Ask for lien waivers with each payment.",
        "<b>Consumer protection.</b> A violation of the roofing rules is treated as an unfair or deceptive act under the Tennessee Consumer Protection Act of 1977 (Tenn. Code Ann. § 47-18-101 et seq.). Complaints: Tennessee Division of Consumer Affairs.",
    ], "Tennessee contractor license #85034 BCB. Written damage and repair description (roofing paid by insurance): ____________________________________________________",
    ["We could not retrieve the text of Tenn. Code Ann. §§ 62-6-601 to -606 or the home-improvement/license-number rules; this rider is a plain-English general disclosure built from summaries. Please conform the roofing 'written statement' contents (§ 62-6-603) and decide whether it must be a separate document handed over before signing.",
     "Does Tennessee have any other residential home-improvement contract disclosure (written contract, price, start/end dates, right-to-cancel) that applies to non-roofing remodels? We found none beyond the Home Solicitation Sales Act and licensing rules.",
     "Confirm the license-monetary-limit language and whether GrayCo's classification (BCB) covers roofing and residential work in Tennessee."])
    rider('MS', 'Mississippi Home Improvement and Roofing-Insurance Disclosure Rider', [
        "<b>Licensing.</b> Mississippi licenses contractors (State Board of Contractors) and residential builders and remodelers. GrayCo's Mississippi contractor license is #27769. You can check a license with the Mississippi State Board of Contractors.",
        "<b>Roof repair or replacement paid by insurance (Insurance Benefits Roofing Repair Consumer Protection Act, Miss. Code Ann. § 75-24-301 et seq.).</b> The roofer must give you a written contract with a detachable NOTICE OF CANCELLATION (in at least 12-point bold type). You may cancel within three (3) business days. The roofer may not require you to pay anything until the cancellation period has ended. If you cancel, payments are returned within ten (10) business days, except for emergency services and approved repairs already performed.",
        "<b>Home solicitation sales (Miss. Code Ann. § 75-66-1 et seq.).</b> For a sale made at your home or away from the seller's place of business you may cancel before midnight of the third business day after you sign. Your cancellation needs no special form but must be in writing and sent to the seller's address in the contract.",
        "<b>Taxes.</b> Mississippi sales/use tax on materials is included in a residential contract price; the 3.5% contractor's tax applies to non-residential contracts over $10,000.",
        "<b>Lien rights.</b> People who furnish labor or materials may have lien and stop-payment-notice rights under Mississippi law even if you paid your contractor. Ask for lien waivers with each payment.",
    ], "Mississippi contractor license #27769. Residential builder / remodeler license # (if required): ____________________",
    ["Could not retrieve the text of Miss. Code Ann. § 75-24-301 to -311 (as amended by HB 1408, effective July 1, 2024) or confirm the 12-point bold type, the no-payment-before-cancellation rule (§ 75-24-307) and whether the 2024 bill HB 1118 (5-day period; no representing owners on claims) became law. Please conform.",
     "Does GrayCo's MS license #27769 authorize residential work (Mississippi also has a residential builders and remodelers license, with a dollar threshold) and roofing? If not, the rider and every Mississippi residential contract need that license number.",
     "Mississippi tax sentence repeats the unconfirmed statements already in the contract (3.5% contractor's tax over $10,000 non-residential). Please confirm."])
    rider('AR', 'Arkansas Home Improvement Disclosure Rider', [
        "<b>Licensing and roofing.</b> GrayCo's Arkansas contractor license is #0486990627. Arkansas also requires a roofing contractor registration certificate for residential roofing work (Ark. Code Ann. § 17-25-601 et seq.). Roofing registration #: ____________________. You can check a license with the Arkansas Contractors Licensing Board.",
        "<b>Three days to cancel.</b> For a sale made at your home or away from the seller's place of business you may cancel until midnight of the third business day after you sign (Arkansas Home Solicitation Sales Act, Ark. Code Ann. § 4-89-101 et seq.). You are entitled to a copy of the contract, two copies of the Notice of Cancellation, and an oral explanation of your right to cancel.",
        "<b>Insurance denial.</b> GrayCo gives you, by contract, the right to cancel before midnight of the third business day after you receive written notice from your insurance company that all or part of the claim or work is not covered. We did not find an Arkansas statute that requires this.",
        "<b>Pre-construction notice to owner (Ark. Code Ann. § 18-44-115).</b> On residential property of four units or fewer, GrayCo will give you the Arkansas Pre-Construction Notice to Owner, by personal delivery or certified mail, before work begins. It explains that people who supply labor or materials may have lien rights even if you pay your contractor.",
        "<b>Taxes.</b> Arkansas sales/use tax on materials is included in the contract price; no separate contractor's tax is added to the owner.",
        "<b>Consumer protection.</b> Arkansas Deceptive Trade Practices Act (Ark. Code Ann. § 4-88-101 et seq.). Complaints: Arkansas Attorney General.",
    ], "Arkansas contractor license #0486990627.",
    ["Arkansas: we did not find a state 'home improvement contract' statute with required contract terms. This is a general disclosure; please advise whether Arkansas requires specific residential contract contents, a written contract threshold, or a prescribed notice (we only know of § 18-44-115 and the home solicitation act).",
     "Roofing: confirm whether Arkansas requires a separate roofing-contractor registration number on the contract and whether GrayCo has one (Ark. Code Ann. § 17-25-601 et seq.).",
     "Insurance-denial right is contractual only (no statute found); confirm GrayCo wants to offer it."])
build()
