# -*- coding: utf-8 -*-
"""Lien waiver forms per state (TN / MS / AR, conditional + unconditional, progress + final) and the Mississippi owner / pre-lien notice."""
from .lib import *

ST = {
 'TN': dict(name='Tennessee', cite='Tenn. Code Ann. § 66-11-101 et seq.', rights="mechanic's and materialman's lien, notice of nonpayment, stop-payment and payment-bond rights", ctr='TN'),
 'MS': dict(name='Mississippi', cite='Miss. Code Ann. § 85-7-101 et seq.', rights="builders' lien, stop-notice and payment-bond rights", ctr='MS'),
 'AR': dict(name='Arkansas', cite='Ark. Code Ann. § 18-44-101 et seq.', rights="mechanic's and materialman's lien, bond and other payment rights", ctr='AR'),
}

WAIVER_FLAGS = {
 'TN': ["Tennessee has no statutory lien-waiver form that we could find. We wrote a conforming plain-English form that refers to Tenn. Code Ann. Title 66, Chapter 11 and states conditional vs. unconditional effect. Please confirm: (i) the waiver need only be a signed writing (we understand Tenn. Code Ann. § 66-11-124 requires an express written waiver and voids advance contract waivers), (ii) notarization is not required (we left a notary block optional), (iii) the form should reference retainage and extras as exceptions.",
        "Conditional forms take effect only when the payment 'has been paid by the bank'. Confirm wording that protects GrayCo if a check bounces."],
 'MS': ["We could not confirm that Mississippi has a statutory lien-waiver form. We drafted a conforming form referencing Miss. Code Ann. § 85-7-101 et seq. and stop-notice rights. Please advise whether a statutory form or notarization is required for waivers to bind a claimant, and the correct statutory cites.",
        "Mississippi payment-bond / stop-notice rights (Miss. Code Ann. § 85-7-181 et seq.) are referenced generally. Please confirm the right to waive them in the same instrument."],
 'AR': ["We could not confirm that Arkansas has a statutory lien-waiver form. We drafted a conforming form referencing Ark. Code Ann. § 18-44-101 et seq. Please advise whether Arkansas requires specific wording or a notary, particularly on residential projects where the pre-construction notice (§ 18-44-115) governs lien rights.",
        "Arkansas residential: confirm that a waiver signed by a sub does not impair the owner's protection under the Arkansas notice rules."],
}

def waiver(state, kind):
    s = ST[state]
    cond = kind.startswith('cond')
    fin = kind.endswith('final')
    nm = ('Conditional' if cond else 'Unconditional') + ' Waiver and Release on ' + ('Final' if fin else 'Progress') + ' Payment'
    b = [('title', nm + ' — ' + s['name'], 'Lien waiver form for ' + s['name'] + ' projects'),
         ('box', ("<b>NOTICE TO THE PERSON SIGNING.</b> " + (
             "<b>CONDITIONAL:</b> This waiver takes effect only after the payment described below is actually received and the check or transfer has cleared. If you are not paid, this waiver has no effect."
             if cond else
             "<b>UNCONDITIONAL:</b> By signing, you confirm you have been paid and you give up your lien and payment rights for the work and period described, even if a check is later returned unpaid. Do not sign until you have been paid.") +
             " Read this before you sign.")),
         ('info', [['Claimant (who is waiving)', '____________________'], ['Claimant is the', '☐ Subcontractor  ☐ Supplier  ☐ General contractor (GrayCo)'],
                   ['Owner / customer', '{customer}'], ['Paying party', '☐ GrayCo  ☐ General contractor: {gc}'], ['Project / job', '{job_name}'], ['Project address', '{job_address}'],
                   ['PO / Job #', '{po}'], ['Through date', '____________'], ['Amount of this payment', '$ ____________']] + ([['Final payment amount', '$ ____________'], ['Project completion date', '____________']] if fin else []))]
    if cond:
        b.append(('p', "<b>Conditional waiver.</b> Upon receipt by the undersigned claimant of payment in the amount stated above, and after that payment has been paid by the bank (or has otherwise cleared), this document becomes effective to waive and release any " + s['rights'] + " (" + s['cite'] + ") that the undersigned has on the project named above, " +
                  ("for ALL labor, services, equipment and materials furnished to the project through the final completion of the claimant's work." if fin else "for labor, services, equipment and materials furnished through the Through date above, to the extent of that payment only.") +
                  " If the payment is not received in full, this document has no effect.") )
    else:
        b.append(('p', "<b>Unconditional waiver.</b> The undersigned claimant has been paid the amount stated above and, by signing, waives and releases any " + s['rights'] + " (" + s['cite'] + ") the claimant has on the project named above, " +
                  ("for ALL labor, services, equipment and materials furnished to the project through the final completion of the claimant's work." if fin else "for labor, services, equipment and materials furnished through the Through date above.") +
                  " This waiver is effective when signed."))
    if not fin:
        b.append(('p', "<b>Not included:</b> retainage or retention that has not been paid; extras or change orders not yet paid; work or materials furnished after the Through date; and any disputed claim listed below. Items not included keep all their lien and payment rights."))
    else:
        b.append(('p', "<b>Not included:</b> only the disputed claims listed below, if any."))
    b += [('p', "Disputed claims or exceptions (if none, write NONE): ______________________________________________"),
          ('p', "The undersigned states that all lower-tier subcontractors, suppliers and employees of the claimant for the work covered by this waiver have been or will be paid from the payment described above, and that the undersigned has authority to sign for the claimant."),
          ('sigs', 'Claimant — authorized signature', 'Printed name / title'),
          ('p', "State of ____________ County of ____________ · Sworn to and subscribed before me on ____________ (optional notary): ______________________ Notary Public"),
          ('small', s['name'] + " form: a conforming form; no state-mandated waiver form has been confirmed.")]
    return b

def build():
    for state in ('TN', 'MS', 'AR'):
        for kind, ttl in (('cond_progress', 'Conditional — Progress'), ('uncond_progress', 'Unconditional — Progress'), ('cond_final', 'Conditional — Final'), ('uncond_final', 'Unconditional — Final')):
            nm = ('Conditional' if kind.startswith('cond') else 'Unconditional') + ' Waiver — ' + ('Final' if kind.endswith('final') else 'Progress') + ' Payment (' + state + ')'
            doc('lienwv_%s_%s' % (state.lower(), kind), nm, 'Lien Waivers', ALL, True, waiver(state, kind), flags=WAIVER_FLAGS[state] if kind == 'cond_progress' else ["See the " + state + " conditional progress waiver for the " + state + " questions; the same cites and wording apply."], group='Lien Waivers')

    doc('lien_notice_ms', 'Notice to Owner / Pre-Lien Notice (Mississippi)', 'Lien Waivers', ALL, True, [
        ('title', 'Notice to Owner / Pre-Lien Notice', 'Mississippi — Miss. Code Ann. § 85-7-101 et seq.'),
        ('box', "<b>IMPORTANT NOTICE TO THE PROPERTY OWNER.</b> People who provide labor, services or materials to improve real property in Mississippi may have the right to claim a lien on the property, or to serve a stop-payment notice on the owner, if they are not paid — even if the owner has paid the general contractor in full. This notice explains your rights and how to protect your property. It does not mean that any payment is late or that any dispute exists."),
        ('info', [['Owner', '{customer}'], ['Property address', '{job_address}'], ['Project / PO #', '{po}'], ['Type of work', '____________'], ['Estimated contract amount', '{contract_amount}'], ['Anticipated start', '____________']]),
        ('h', 'Notice from'),
        ('p', GCO + ", " + ADDR + " · " + PHONE + " · " + EMAIL + " · Mississippi contractor license #27769 · role: ☐ General contractor  ☐ Subcontractor"),
        ('h', 'Notice'),
        ('p', GCO + " gives you notice that it intends to furnish labor, materials and/or services for the improvement of the property described above, and that it may have lien and payment rights under Mississippi law for the work it performs."),
        ('h', 'How you can protect yourself'),
        ('li', ["Ask your contractor for a <b>lien waiver</b> from the contractor and from each subcontractor and supplier with every payment you make, and keep them.",
                "Ask for the contractor's list of subcontractors and suppliers, and for a sworn statement of what has been paid and what is owed, before you make a payment.",
                "Pay by check made out to the contractor (or jointly to the contractor and a supplier when appropriate), and keep records of every payment.",
                "If someone serves you with a written stop-payment notice, do not pay the contractor money that is covered by the notice until you have talked with your attorney.",
                "Keep copies of the contract, change orders, payments and waivers for the project."]),
        ('p', "This notice is given to preserve GrayCo's rights and to inform you of yours. It is not a lien and does not affect title to your property."),
        ('p', "Delivery: ☐ In person  ☐ Certified mail # __________  ☐ E-mail (if the owner agreed in writing). Date: ____________"),
        ('sigs', GCO + ' — authorized representative', 'Owner / owner\'s representative — acknowledgment of receipt'),
    ], flags=[
        "Mississippi: we found no statute that requires a general contractor with a direct contract to send a pre-lien notice to the owner. Subcontractors and suppliers use a written stop-payment (stop) notice and the lien statutes. We drafted a protective, informational notice. Please advise: (i) whether any Mississippi notice is mandatory for GrayCo as GC or as sub, (ii) the correct statutory cites (we think §§ 85-7-131, 85-7-181, 85-7-401 to -407 are relevant, please verify), and (iii) whether a residential owner must receive any prescribed notice or sworn statement.",
        "Mississippi lien-waiver statute: we could not confirm a mandatory statutory waiver form (see the Mississippi waiver forms).",
    ], group='Lien Waivers')
build()
