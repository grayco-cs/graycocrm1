# -*- coding: utf-8 -*-
"""Assignment of Benefits (optional), the Direction to Pay fix, Work Authorization / Direction to Pay terms, mold contract, pack-out."""
from .lib import *

NOT_AOB = ("This Direction to Pay is NOT an assignment of benefits. I am not assigning my insurance policy, my claim or any of my rights under the policy to GrayCo. "
           "I keep all of my rights under the policy and make my own claim decisions.")
DTP_REVOKE = "I may revoke this Direction to Pay at any time by written notice to GrayCo and my insurance company. Revoking it does not cancel my contract and does not change what I owe for work already done."
AOB_REF = ("An optional, separate Assignment of Benefits form is available if I choose to use it. I do not have to sign it to hire GrayCo, and GrayCo will do the work under this Direction to Pay either way.")

# paragraph used in the restoration agreements (Insurance Restoration, Water Damage, Fire Damage) in place of "DIRECTION TO PAY / ASSIGNMENT OF BENEFITS"
RESTORATION_DTP_HEAD = "DIRECTION TO PAY (NOT AN ASSIGNMENT OF BENEFITS)"
RESTORATION_DTP = ("Owner directs their insurance company to include GrayCo Construction Services, LLC as a co-payee on claim payments for the covered work Contractor performs under this Agreement. "
                   "This is a direction to pay only. It is NOT an assignment of Owner's policy, claim or benefits, and Owner keeps all rights under the policy. "
                   "Owner authorizes Contractor to communicate with the insurance company about the scope and price of Contractor's work and to submit estimates, photographs, invoices and supplements. "
                   "Contractor does not adjust, negotiate or settle Owner's claim, is not a public adjuster, and will not pay, waive or rebate Owner's deductible. "
                   "If Owner chooses to assign the right to receive payment, Owner may sign the separate, optional Assignment of Benefits form; signing it is not required to hire Contractor. "
                   "Owner may revoke this direction in writing at any time; revocation does not change what Owner owes for work already performed.")

WA_TERMS = [
 "TERMS",
 "1. Scope. GrayCo will perform the emergency services and repairs described in its estimate for this claim, as approved by the insurance company or by me in writing. Work outside that scope needs my written change order before it starts.",
 "2. My claim stays mine. GrayCo may communicate with my insurance company and its adjuster about the scope and price of GrayCo's work and may send them estimates, photographs, invoices and supplements. GrayCo does not adjust, negotiate or settle my claim for me and is not a public adjuster. GrayCo cannot promise that the insurance company will approve or pay any amount.",
 "3. What I owe. I am responsible for my insurance deductible; for work or upgrades my policy does not cover that I approve in writing; and, if the insurance company does not pay the covered amount because of something I did or did not do (for example, not cooperating with the insurer or letting the policy lapse), for the unpaid balance. GrayCo will not pay, waive, rebate or absorb my deductible.",
 "4. Payment. Insurance payments for GrayCo's covered work are to be made payable to me and GrayCo together, as stated in my Direction to Pay. If my mortgage company must also be named on a check, I will sign it over to the mortgage company as needed. The Direction to Pay is not an assignment of benefits. An optional, separate Assignment of Benefits form is available but I do not have to sign it.",
 "5. Emergency services. If I ask GrayCo in writing to start emergency services (such as water extraction, board-up or tarping) before the cancellation period ends, GrayCo may do so, and I will owe the reasonable cost of the emergency services performed even if I later cancel or the claim is denied.",
 "6. Right to cancel. My right to cancel is stated above. If my insurance company denies all or part of the claim, I may cancel as stated in the Your Right to Cancel paragraph, and I will owe only for emergency services already performed at my request and for work I approved in writing after the denial.",
 "7. Records. GrayCo may take photographs and moisture or measurement readings and share them with my insurance company and my mortgage company for this claim.",
 "8. This authorization works together with my contract with GrayCo. If they conflict about the right to cancel, the right to cancel stated above controls.",
]
DTP_TERMS = [
 "TERMS",
 "1. This Direction to Pay is NOT an assignment of benefits. I am not assigning my policy, my claim or any of my rights under my policy to GrayCo. I keep all of my rights and make my own claim decisions.",
 "2. I direct my insurance company to make payments for the covered work GrayCo performs on this claim payable to me and GrayCo Construction Services, LLC together (or, if my insurance company agrees, directly to GrayCo). If my mortgage company must also be named, I will endorse the check as needed.",
 "3. I remain responsible for my deductible, for work my policy does not cover that I approve in writing, and for the balance of my contract if the insurance company does not pay because of something I did or did not do. GrayCo will not pay, waive or rebate my deductible.",
 "4. I may revoke this Direction to Pay at any time by written notice to GrayCo and my insurance company. Revoking it does not cancel my contract and does not change what I owe for work already performed.",
 "5. My insurance company may rely on a copy of this signed direction, including an electronic copy.",
 "6. An optional, separate Assignment of Benefits form is available. I do not have to sign it, and GrayCo will do the work under this Direction to Pay either way.",
]

def build():
    doc('aob', 'Assignment of Benefits — Optional', 'Insurance & Restoration', INS, True, [
        ('title', 'Assignment of Benefits (Optional)', 'Property insurance claim · separate from the Direction to Pay · you may revoke it'),
        ('box', "<b>THIS FORM IS OPTIONAL.</b> You do not have to sign it to hire GrayCo. If you do not sign it, GrayCo will do the work under your <b>Direction to Pay</b>, which does NOT assign anything. You may talk to your insurance agent or an attorney before you sign."),
        ('info', [['Property owner / insured', '{customer}'], ['Property address', '{job_address}'], ['Insurance company', '____________'], ['Claim #', '____________'], ['Policy #', '____________'], ['Date of loss', '____________'], ['Date', '{date}']]),
        ('h', '1. What I assign'),
        ('p', "I assign to " + GCO + " (\"GrayCo\") only my right to receive the insurance payment for the covered repair work GrayCo performs at the property above under this claim, up to the amount GrayCo invoices for that work (the \"Assigned Payment\"). I do <b>not</b> assign my policy, my coverage, my right to make, adjust or settle my claim, my right to payment for any other loss (such as living expenses, contents or work by other contractors), or any other right under my policy."),
        ('h', '2. GrayCo is not my adjuster'),
        ('p', "This assignment does not let GrayCo adjust, negotiate or settle my claim for me. GrayCo is not a public adjuster and will not act as one. GrayCo may give my insurance company its estimate, photographs, invoices and supplement documents and may communicate with the insurance company about the scope and price of GrayCo's own work. I make my own claim decisions."),
        ('h', '3. Direction to my insurance company'),
        ('p', "I authorize and direct my insurance company to pay the Assigned Payment to GrayCo (or, if the insurance company prefers, to me and GrayCo together). My insurance company may rely on a copy of this signed form, including an electronic copy."),
        ('h', '4. What I still owe'),
        ('p', "I remain responsible for my insurance deductible, for work or upgrades my policy does not cover that I approve in writing, and, if the insurance company does not pay the covered amount because of something I did or did not do (for example, not cooperating with the insurance company or letting the policy lapse), for the unpaid balance. GrayCo will not pay, waive, rebate or absorb my deductible."),
        ('h', '5. If my insurance company will not honor this form'),
        ('p', "My policy may limit assignments. If my insurance company refuses to honor this assignment, this form will act only as a Direction to Pay (a request that GrayCo be named as a payee), and my contract with GrayCo stays in force."),
        ('h', '6. I may revoke this assignment'),
        ('box', "<b>You may revoke (cancel) this assignment.</b> (a) You may cancel it, along with your contract, before midnight of the third business day after you sign, as stated in your Notice of Cancellation. (b) You may also revoke it at any time before the insurance company has paid GrayCo, by sending a signed written notice to GrayCo and to your insurance company (e-mail is fine: " + EMAIL + "). Revoking this assignment does not cancel your contract and does not change what you owe for work GrayCo already performed; GrayCo will then bill you directly for that work, and your Direction to Pay stays in effect unless you revoke it too."),
        ('h', '7. No fee and no waiver of rights'),
        ('p', "GrayCo will not charge me a fee for this assignment. Signing it does not give up any right I have under my policy or the law, other than the right to receive the Assigned Payment."),
        ('h', '8. Mortgage company'),
        ('p', "If my mortgage company must be named on insurance checks, I will sign over the check to the mortgage company as needed, and the Assigned Payment will be released to GrayCo as the work is completed."),
        ('checks', ["I understand this form is optional and that I may revoke it as stated above.", "I received a copy of this form and of my Direction to Pay."]),
        ('sigs', 'Property owner / insured', GCO),
        ('small', "Not legal or insurance advice. Keep a copy with your claim papers."),
    ], flags=[
        "OPTIONAL and REVOCABLE as instructed. We used 3-business-day cancellation (matching the Notice of Cancellation) plus revocation at any time before payment. Counsel: is a post-payment or fixed-day (e.g. 14-day, as in some states) rescission window required or advisable in TN, MS or AR?",
        "TN: we found no Tennessee statute regulating assignments of benefits for property claims. Confirm whether any anti-assignment limit or notice applies, and whether the policy's anti-assignment clause matters after a loss has occurred (post-loss assignments of the right to payment are generally enforceable, but please confirm for Tennessee).",
        "MS: same question for Mississippi. Also confirm that taking an assignment while 'communicating with the insurer about scope' stays inside Mississippi's public-adjuster licensing rules (Miss. Code Ann. Title 83, public adjusters).",
        "AR: same question for Arkansas (Ark. Code Ann. Title 23, public adjusters), and whether any Arkansas contractor rule limits assignments or deductible handling.",
        "We deliberately removed 'negotiate claim amounts' (the old restoration agreements had it) because negotiating or adjusting a claim for an owner is the practice of public adjusting in most states. The form lets GrayCo communicate about its own scope and price and submit documents only. Please confirm that wording is safe in all three states.",
        "We limited the assignment to the right to receive payment for GrayCo's covered work. We did NOT assign a right to sue the insurer. Counsel: do you want a right to sue/collect (many AOBs include it) and, if so, any required attorney-fee or notice language?",
        "Deductible: we state that GrayCo will not pay, waive, rebate or absorb the deductible (many states treat that as insurance fraud or an unfair practice; Tennessee: please confirm the cite; one source pointed to Tenn. Code Ann. § 56-7-130). Marketing text such as 'your cost is limited to your deductible' should be reviewed with that in mind.",
        "The AOB is a stand-alone, selectable form. It is never auto-attached or auto-sent.",
    ])

    doc('mold_contract', 'Mold Remediation Agreement', 'Insurance & Restoration', ['insurance', 'residential', 'commercial'], True, [
        ('title', 'Mold Remediation Agreement', 'Containment, removal and cleaning — with independent testing and clearance'),
        ('info', [['Property owner', '{customer}'], ['Property address', '{job_address}'], ['Job / PO', '{po}'], ['Date', '{date}'], ['Insurance company / claim # (if any)', '____________'], ['Project manager', '{pm}']]),
        ('p', "This Agreement is between " + GCO + " (\"GrayCo\", " + LICS + ") and the property owner named above (\"Owner\") for the mold remediation work described below at the property above."),
        ('h', '1. Independent assessment and clearance'),
        ('p', "GrayCo is a remediation contractor, not a mold testing laboratory. Owner (or Owner's insurer) will hire an independent, qualified third party (for example an industrial hygienist or other qualified environmental professional) to assess the mold, write or approve the remediation protocol, and perform the post-remediation clearance test. GrayCo will not perform the testing that clears its own work. If no independent protocol is provided, GrayCo will work from the scope below and industry guidance (ANSI/IICRC S520), and Owner understands that no clearance test will have confirmed the result unless Owner orders one."),
        ('h', '2. Scope of work'),
        ('p', "GrayCo will: set up containment and negative air with HEPA filtration; protect unaffected areas; remove and bag mold-damaged porous materials listed in the protocol or estimate; clean and treat remaining surfaces by HEPA vacuuming and damp wiping or approved antimicrobial treatment; and dispose of waste lawfully. Work outside the written scope needs a signed change order. Hidden mold may be found inside walls, ceilings and other concealed spaces; if so GrayCo will stop in that area and propose a change order."),
        ('h', '3. The moisture source must be fixed'),
        ('p', "Mold returns where moisture returns. Owner is responsible for correcting any ongoing leak, humidity or drainage problem that is outside GrayCo's written scope, and for telling GrayCo about known past water problems. Rebuilding (drywall, flooring, paint) is separate work unless the estimate says it is included."),
        ('h', '4. Possible asbestos or lead'),
        ('p', "For homes built before 1980, materials may contain asbestos or lead. Owner confirms whether such testing has been done: ☐ Tested, none found  ☐ Tested, found (attach report)  ☐ Not tested. If suspect materials must be disturbed, GrayCo will stop and Owner will arrange testing and, if needed, licensed abatement before work continues."),
        ('h', '5. Occupants and personal property'),
        ('p', "People with asthma, allergies, a weakened immune system, infants, the elderly and pets should stay out of the work area and may need to stay elsewhere while work is done. Owner will remove or authorize GrayCo to move and protect personal property; contents cleaning or pack-out is a separate authorization. GrayCo is not responsible for pre-existing damage or for items left in the work area after notice."),
        ('h', '6. Price and payment'),
        ('p', "Price: ☐ Fixed $________ ☐ Unit price per estimate ☐ Time and materials per estimate. Insurance: many policies limit or exclude mold coverage (a 'sub-limit'); Owner is responsible for any amount the insurance company does not pay. Owner's deductible is due at the start of work. Payment terms are the same as in Owner's contract with GrayCo, and a progress invoice may be sent at the end of containment set-up and at completion."),
        ('h', '7. Limited warranty; no guarantee'),
        ('p', "<b>GrayCo warrants its remediation workmanship in the cleaned or removed areas for one (1) year from completion. The warranty covers re-growth in those areas that comes back from the same moisture source ONLY if that moisture source was corrected. GrayCo does not guarantee that mold will not exist elsewhere or return, does not guarantee any specific air-quality result, and does not give health advice.</b> Manufacturer warranties on any materials pass through to Owner."),
        ('h', '8. Limitation of liability'),
        ('p', "<b>To the extent permitted by law, GrayCo's liability for any claim about this work is limited to the price of this Agreement, and GrayCo is not liable for indirect or consequential damages, including loss of use or relocation, except for GrayCo's own negligence or willful misconduct.</b>"),
        ('h', '9. Right to cancel'),
        ('p', "If Owner signs this Agreement at Owner's home, Owner may cancel it before midnight of the third business day after signing; see the Notice of Cancellation. If GrayCo starts work at Owner's written request during that period for an emergency, Owner owes the reasonable cost of work performed."),
        ('h', '10. General'),
        ('p', "Disputes: the dispute-resolution, governing-law and attorney-fee terms of Owner's construction contract with GrayCo apply; if none, mediation first, then the courts or AAA arbitration in the county and state where the property is located. This Agreement, the estimate and the protocol are the whole agreement for this work."),
        ('sigs', 'Property owner', GCO),
    ], flags=[
        "Licensing: we did not find a state mold-remediation license in TN, MS or AR. Please confirm, and confirm that a general contractor license covers the work.",
        "We require an independent assessor and independent clearance (consistent with the existing Mold Disclosure paper) and have GrayCo disclaim being a testing lab. Confirm that this separation is what counsel wants.",
        "Pre-1980 housing: asbestos (NESHAP / state abatement licensing) and lead (EPA RRP for pre-1978 housing) wording is general. Please review the lead-safe work practice (RRP) pamphlet obligation for pre-1978 residential work and where it should be given.",
        "The 1-year limited warranty is shorter than the 5-year insurance-restoration warranty in the restoration agreements. Confirm that carving mold out of the 5-year warranty is acceptable and conspicuous enough.",
        "Limitation of liability / consequential-damages waiver: enforceable against consumers in TN, MS, AR? Conspicuousness (bold/caps) may be needed.",
        "Insurance mold sub-limits: should GrayCo give a written disclosure that it has not verified coverage?",
    ])

    doc('packout_auth', 'Contents Pack-Out Authorization', 'Insurance & Restoration', INS, True, [
        ('title', 'Contents Pack-Out Authorization', 'Inventory, move, clean, store and return personal property'),
        ('info', [['Property owner', '{customer}'], ['Property address', '{job_address}'], ['Job / PO', '{po}'], ['Date', '{date}'], ['Insurance company / claim #', '____________'], ['Project manager', '{pm}']]),
        ('p', "I authorize " + GCO + " (\"GrayCo\") and its contents-handling partners to inventory, photograph, pack, move, clean, store and return the personal property (\"contents\") at the property above, as described below."),
        ('h', '1. Inventory'),
        ('p', "GrayCo will list each box or item with a tag number, room, description, condition and photo (see the Contents Pack-out Inventory). I will review the inventory and tell GrayCo of anything missing or wrongly described within 7 days of receiving it. Items listed as damaged were damaged before pack-out."),
        ('h', '2. Items I keep or GrayCo does not handle'),
        ('p', "I will keep with me, or tell GrayCo about, cash, jewelry, coins, medicines, firearms and ammunition, important papers, data devices, collectibles and items of unusual value. GrayCo will not pack these unless I list them here and GrayCo agrees in writing: ____________________________________________. GrayCo does not move hazardous materials, perishable food, live plants or animals."),
        ('h', '3. Cleaning and restoration'),
        ('p', "Cleaning may be done at GrayCo's facility or by a contents-restoration partner. Items that cannot be economically restored will be shown to me with photos. GrayCo will not dispose of any item that is not restorable until I approve in writing (or until 30 days after GrayCo sends me the list and photos with no reply, if I agree to that here: ☐ yes ☐ no). Disposal does not affect my insurance contents claim; I should keep the photos and list for my claim."),
        ('h', '4. Storage'),
        ('p', "Storage is at: ____________________________. Storage is charged at the rates in the estimate, usually included in the claim while repairs are under way. After the repairs are complete, GrayCo will return the contents on a date we agree. If I do not take delivery within 30 days after the date offered, storage fees apply at the estimate rate, and if I do not respond within 60 days after written notice, GrayCo may deliver the contents to a lawful storage or disposal process after giving me a final written notice."),
        ('h', '5. Insurance and payment'),
        ('p', "My contents claim is mine. Insurance payments for GrayCo's contents services are to be paid as stated in my Direction to Pay. I am responsible for my deductible and for any amount my insurance does not pay. GrayCo does not act as my adjuster for the contents claim."),
        ('h', '6. Care and limits'),
        ('p', "GrayCo will handle my contents with reasonable care. GrayCo is responsible for loss or damage to listed items while in its custody that results from its negligence, up to the replacement value shown on the inventory (or, if no value is shown, up to $__________ per item and $__________ in total). GrayCo is not responsible for pre-existing damage, inherent defects, or items not on the inventory. I must report a loss or damage within 30 days after the contents are returned."),
        ('h', '7. Right to cancel'),
        ('p', "If I sign this at home, I may cancel before midnight of the third business day after I sign; see the Notice of Cancellation. If I ask GrayCo to start the pack-out sooner for an emergency, I will owe the reasonable cost of the work performed."),
        ('sigs', 'Property owner', GCO),
    ], flags=[
        "Bailee / warehouse-lien rules: we did not claim a lien on stored contents. Do TN, MS or AR rules on storage, abandonment and sale of unclaimed goods require different notice or time periods than the 30/60-day language here?",
        "Limit of liability per item/total is blank; counsel may want a default amount and conspicuous formatting.",
        "Disposal of non-restorable items: we require the owner's written approval, or 30 days of silence only if the owner opts in. Confirm that is acceptable and consistent with the insurer's right to inspect salvage.",
        "Contents pack-out by a partner: confirm GrayCo's insurance (bailee / inland marine) and subcontract flow-down.",
    ])
build()
