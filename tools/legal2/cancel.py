# -*- coding: utf-8 -*-
"""Right to cancel: notice text (FTC Cooling-Off Rule 16 CFR 429 + TN / AR / MS), contract clauses, stand-alone forms."""
from .lib import *

SELLER_LINE = GCO + ', ' + ADDR + ' · ' + PHONE + ' · ' + EMAIL

FTC = [
    "You may CANCEL this transaction, without any Penalty or Obligation, within THREE BUSINESS DAYS from the above date.",
    "If you cancel, any property traded in, any payments made by you under the contract or sale, and any negotiable instrument executed by you will be returned within TEN BUSINESS DAYS following receipt by the seller of your cancellation notice, and any security interest arising out of the transaction will be cancelled.",
    "If you cancel, you must make available to the seller at your residence, in substantially as good condition as when received, any goods delivered to you under this contract or sale, or you may, if you wish, comply with the instructions of the seller regarding the return shipment of the goods at the seller's expense and risk.",
    "If you do make the goods available to the seller and the seller does not pick them up within 20 days of the date of your notice of cancellation, you may retain or dispose of the goods without any further obligation. If you fail to make the goods available to the seller, or if you agree to return the goods to the seller and fail to do so, then you remain liable for performance of all obligations under the contract.",
]
HOWTO = ("To cancel this transaction, mail or deliver a signed and dated copy of this Cancellation Notice or any other written notice, or send a telegram, to "
         + GCO + ", " + ADDR + ", not later than midnight of ____________________ (date). You may also cancel by e-mail to " + EMAIL
         + " or by text or photo of your signed notice to " + PHONE + " (GrayCo will confirm by reply).")
SIGNLINE = "I HEREBY CANCEL THIS TRANSACTION."
BUSDAY = "Business days are every calendar day except Sundays and federal legal public holidays."

ADD = {
 'TN': {
   'law': 'Tennessee',
   'cite': 'Tennessee Home Solicitation Sales Act (Tenn. Code Ann. § 47-18-701 et seq.) and, for residential roofing paid from insurance, Tenn. Code Ann. § 62-6-601 et seq.',
   'add': [
     "TENNESSEE NOTICE. This notice is also given under the Tennessee home solicitation sales law. GrayCo's Tennessee contractor license is #85034 BCB. GrayCo gave you a copy of the contract and this notice, in duplicate, and told you about your right to cancel when you signed.",
     "RESIDENTIAL ROOFING PAID BY INSURANCE (Tenn. Code Ann. § 62-6-601 et seq.). If this contract is for roof repair or replacement that is to be paid in whole or in part from an insurance claim, you may ALSO cancel it by giving GrayCo a signed and dated written notice before midnight of the third business day after you receive written notice from your insurance company that all or part of the claim or the work is not a covered loss. No special words are needed; any signed and dated written notice that shows you do not intend to be bound is enough. A mailed notice is effective on the postmark date. If you cancel, GrayCo will return your payments within ten (10) business days, except for emergency repairs already done at your written request.",
   ]},
 'AR': {
   'law': 'Arkansas',
   'cite': 'Arkansas Home Solicitation Sales Act (Ark. Code Ann. § 4-89-101 et seq.)',
   'add': [
     "ARKANSAS NOTICE. This notice is also given under the Arkansas home solicitation sales law (Ark. Code Ann. § 4-89-101 et seq.). GrayCo's Arkansas contractor license is #0486990627. GrayCo gave you a copy of the contract and two copies of this notice, and told you out loud about your right to cancel when you signed. Your right to cancel lasts until midnight of the third business day after the date of this transaction.",
     "INSURANCE-DENIAL CANCELLATION (offered by GrayCo in its contract). If this contract is to be paid in whole or in part from an insurance claim and your insurance company tells you in writing that all or part of the claim or the work is not covered, you may also cancel before midnight of the third business day after you receive that written notice. If you cancel, GrayCo will return your payments within ten (10) business days, except for emergency services already done at your written request. Arkansas homeowners also receive the separate Arkansas Pre-Construction Notice to Owner (Ark. Code Ann. § 18-44-115) before work begins.",
   ]},
 'MS': {
   'law': 'Mississippi',
   'cite': 'Mississippi Home Solicitation Sales Act (Miss. Code Ann. § 75-66-1 et seq.) and the Insurance Benefits Roofing Repair Consumer Protection Act (Miss. Code Ann. § 75-24-301 et seq.)',
   'add': [
     "MISSISSIPPI NOTICE. This notice is also given under the Mississippi home solicitation sales law (Miss. Code Ann. § 75-66-1 et seq.). GrayCo's Mississippi contractor license is #27769. You may cancel until midnight of the third business day after the day you sign. Your notice does not need any special form; it only needs to be written and to show you do not intend to be bound. It takes effect when you send it to the address above (if sent by certified or registered mail, when it is deposited in the mail, properly addressed, with postage paid).",
     "ROOF REPAIR OR REPLACEMENT PAID BY INSURANCE (Miss. Code Ann. § 75-24-301 et seq.). If this contract is for residential roof repair or replacement that is to be paid in whole or in part from insurance proceeds, GrayCo may not require you to pay anything until this three-business-day cancellation period has ended. If your insurance company tells you in writing that all or part of the claim or the work is not covered, you may also cancel before midnight of the third business day after you receive that written notice. If you cancel, any payments you made will be returned within ten (10) business days after GrayCo receives your cancellation notice, except for emergency services and approved repairs already performed at your request.",
   ]},
}
PT = {'TN': 10, 'AR': 10, 'MS': 12}

# the one-sentence statement that sits immediately above the signature (16 CFR 429.1(a))
ACCEPT = ("You, the buyer, may cancel this transaction at any time prior to midnight of the third business day after the date of this transaction. "
          "See the attached Notice of Cancellation form for an explanation of this right.")

def clause(state, kind):
    st = ADD[state]['law']
    base = ("NOTICE OF RIGHT TO CANCEL: " + ACCEPT + " " + BUSDAY + " To cancel, sign and date a copy of the Notice of Cancellation (or any other written notice) and deliver, mail or e-mail it to "
            + GCO + ", " + ADDR + ", " + EMAIL + ". GrayCo will refund any payments within ten (10) business days after it receives the notice. ")
    if kind == 'commercial':
        return ("RIGHT TO CANCEL (CONSUMER SALES ONLY): This clause applies only if Owner is an individual buying for personal, family or household purposes and signed this Agreement at Owner's home or anywhere other than GrayCo's place of business. In that case Owner may cancel this transaction at any time prior to midnight of the third business day after the date of this transaction, and GrayCo will provide the Notice of Cancellation form and refund any payments within ten (10) business days after it receives the notice. " + BUSDAY + " This clause does not apply to a business or commercial owner.")
    ins = ""
    if state == 'TN':
        ins = ("If any part of this Agreement is for roof repair or replacement to be paid from an insurance claim, Owner may also cancel before midnight of the third business day after Owner receives written notice from the insurance company that all or part of the claim or work is not a covered loss (Tenn. Code Ann. § 62-6-601 et seq.). ")
    elif state == 'MS':
        ins = ("If any part of this Agreement is for roof repair or replacement to be paid from insurance proceeds, GrayCo will not require any payment until the cancellation period has ended, and Owner may also cancel before midnight of the third business day after Owner receives written notice from the insurance company that all or part of the claim or work is not covered (Miss. Code Ann. § 75-24-301 et seq.). ")
    else:
        ins = ("If any part of this Agreement is to be paid from an insurance claim and the insurance company tells Owner in writing that all or part of the claim or work is not covered, Owner may also cancel before midnight of the third business day after Owner receives that notice. ")
    if kind == 'insurance':
        ins += ("If Owner cancels because the insurance company denies the claim, Owner remains responsible for payment for all emergency and mitigation services GrayCo performed at Owner's written request (for example water extraction, drying, board-up, tarping) regardless of insurance coverage or the outcome of the claim, at the rates in this Agreement or, if none, GrayCo's standard rates, and for any work Owner approved in writing after the denial. This does not waive the right to cancel the remaining repair work. ")
    tail = ("An emergency waiver of this right is valid only if Owner signs a separate, dated, handwritten statement describing the emergency. This clause controls over any other cancellation provision in this Agreement or its attachments. "
            "Any liquidated-damages or overhead-and-profit provision applies only after these cancellation rights have expired.")
    return base + ins + tail

EMERG_NOTE = ("EMERGENCY WAIVER (handwritten): the federal Cooling-Off Rule lets a buyer give up the 3-day right to cancel only if the buyer writes, dates and signs "
              "a personal statement, in the buyer's own handwriting, describing the emergency that needs immediate work and saying that the buyer gives up the right to cancel.")

# ----------------------------------------------------------------- stand-alone forms
def notice_doc(state):
    nm = {'TN': 'Tennessee', 'AR': 'Arkansas', 'MS': 'Mississippi'}[state]
    return doc('cancel_notice_' + state.lower(), 'Notice of Cancellation — ' + nm + ' (two copies)', 'Right to Cancel', RES_INS, True, [
        ('title', 'Notice of Cancellation', 'Notice of Right to Cancel — ' + nm + ' · prints two detachable copies (customer copy and GrayCo copy)'),
        ('info', [['Customer', '{customer}'], ['Job address', '{job_address}'], ['PO / Job #', '{po}'], ['Date of transaction', '{date}']]),
        ('notice', state),
    ], flags=NOTICE_FLAGS[state], group='Right to Cancel')

NOTICE_FLAGS = {
 'TN': [
  "Confirm the Tennessee home-solicitation citation (we used Tenn. Code Ann. § 47-18-701 et seq., the 'Home Solicitation Sales Act of 1974'), the $25 threshold and that the Tennessee notice must match the federal text. We printed the federal 16 CFR 429.1 text in full and added a Tennessee paragraph.",
  "Residential roofing: Tenn. Code Ann. §§ 62-6-601 to -606 (Residential Roofing Services). Our research found: (i) a cancellation right for 3 business days after the insurer's written notice of no/partial coverage (§ 62-6-602); (ii) a required written statement before signing (§ 62-6-603: mailing address for cancellation, phone, license numbers) with a detachable duplicate NOTICE OF CANCELLATION in at least 10-point bold; (iii) a refund within 10 business days except emergency repairs; (iv) a violation is a Tennessee Consumer Protection Act violation (§ 62-6-606). We could not retrieve the statute text itself, so the wording is a paraphrase. Please conform it to the statute.",
  "Does the roofing statute apply to a roofing contract that is NOT an insurance job? We printed the insurer-denial paragraph only where the contract is paid from insurance.",
  "We used 12-point bold for Mississippi and 10-point bold for TN and AR; counsel may prefer one size for all.",
 ],
 'AR': [
  "Confirm the Arkansas citation (Ark. Code Ann. § 4-89-101 et seq.; the cancel section appears to be § 4-89-107) and whether Arkansas requires its own prescribed notice wording in addition to the federal text. The Arkansas Attorney General's office says the seller must tell the buyer orally about the right to cancel and give two copies of the cancellation form and a copy of the contract.",
  "We found NO Arkansas statute giving a cancellation right after an insurer denies a storm claim. The insurer-denial paragraph is therefore a CONTRACTUAL right GrayCo grants (it matches the existing Work Authorization). Confirm GrayCo wants to grant it in Arkansas.",
  "Arkansas residential roofing contractors need a roofing contractor registration certificate (Ark. Code Ann. § 17-25-601 et seq.). Confirm whether GrayCo's Arkansas license #0486990627 covers residential roofing or a separate registration number must be printed here.",
  "The Arkansas Pre-Construction Notice (Ark. Code Ann. § 18-44-115) is a separate paper. Counsel: should the cancellation notice and the pre-construction notice be delivered together on Arkansas residential jobs?",
 ],
 'MS': [
  "Confirm Mississippi's Home Solicitation Sales Act cite (Miss. Code Ann. § 75-66-1 et seq.; cancel right at § 75-66-3). The statute exempts insurance sales and has an 'urgent need' exception where the seller has begun performance in good faith.",
  "Mississippi Insurance Benefits Roofing Repair Consumer Protection Act (Miss. Code Ann. §§ 75-24-301 to -311). Our research found: 3-day cancellation; a detachable NOTICE OF CANCELLATION in at least 12-point bold (raised from 10-point by HB 1408, effective July 1, 2024); no payment may be required from the insured until the cancellation period ends (§ 75-24-307); refund within 10 business days except emergency services and approved repairs. A 2024 bill (HB 1118) would have lengthened the period to 5 days and barred roofers from representing owners on claims; we could not confirm its status. Please verify the current text and whether a denial-based cancellation right exists in the Mississippi act (we included one, as in Tennessee).",
  "Please confirm that GrayCo's MS license #27769 covers residential work and roofing (Mississippi also licenses residential builders/remodelers).",
 ],
}

def build():
    for s in ('TN', 'AR', 'MS'):
        notice_doc(s)
    doc('cancel_waiver_emergency', 'Emergency Services — Waiver of Right to Cancel', 'Right to Cancel', RES_INS, True, [
        ('title', 'Emergency Services — Waiver of Right to Cancel', 'Use ONLY when the customer has a real emergency that needs work before the 3-business-day period ends'),
        ('info', [['Customer', '{customer}'], ['Job address', '{job_address}'], ['PO / Job #', '{po}'], ['Date', '{date}']]),
        ('box', "<b>Staff instruction.</b> The customer must write the statement below IN THEIR OWN HANDWRITING on paper, then date and sign it. A typed or e-signed statement is not enough for the federal waiver. Do not suggest or pressure a waiver. If there is no real emergency, wait out the 3 business days."),
        ('h', 'Customer\'s handwritten statement'),
        ('p', "I need the following work done right away because of an emergency: (describe the situation requiring immediate remedy, in your own handwriting)"),
        ('p', "<br>______________________________________________________________________<br><br>______________________________________________________________________<br><br>______________________________________________________________________"),
        ('p', "I understand that I have the right to cancel this transaction within three business days. I am giving up that right for the emergency work described above, which I am asking GrayCo to start now. I understand that I will owe the reasonable cost of emergency work already performed even if I later cancel the rest of the contract. My right to cancel any work that is not emergency work is not affected."),
        ('p', "Customer's handwritten acknowledgement: \"I give up my right to cancel for the emergency work described above.\" ____________________________________________"),
        ('sigs', 'Customer', 'GrayCo Construction Services, LLC'),
        ('small', "Insurance-claim jobs: the emergency waiver covers only the emergency mitigation work (for example water extraction, board-up, tarping). It does not waive the right to cancel the rest of the contract or the right to cancel after an insurer denial."),
    ], flags=[
        "Federal rule: the emergency exemption in 16 CFR 429.3 requires a separate dated and signed personal statement in the buyer's own handwriting. Please confirm that each state's act accepts the same, and that we may not use an e-signature for it.",
        "Tennessee roofing (§ 62-6-602/-603) and Mississippi (§ 75-24-301 et seq.) refund exceptions for 'emergency repairs / emergency services': please confirm how each defines them and whether the handwritten waiver is also required there.",
    ], group='Right to Cancel')
build()
