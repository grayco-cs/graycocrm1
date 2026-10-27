#!/usr/bin/env python3
"""Builds the attorney PDF (reportlab): GrayCo-Draft-Documents-PartA-2026-10-26.pdf — a cover page of questions and flags for counsel,
then every new document in full (from the same content modules the CRM patch uses, so the PDF and the CRM cannot drift).
Usage: python3 tools/build_legal2_pdf.py [output.pdf]"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from legal2 import lib, cancel, insurance, liens, portal, subs, riders, contract   # noqa: E402
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, FrameBreak

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wLAW/GrayCo-Draft-Documents-PartA-2026-10-26.pdf'
FD = '/usr/share/fonts/truetype/liberation/'
for n, f in (('LS', 'LiberationSans-Regular.ttf'), ('LS-B', 'LiberationSans-Bold.ttf'), ('LS-I', 'LiberationSans-Italic.ttf'), ('LS-BI', 'LiberationSans-BoldItalic.ttf')):
    pdfmetrics.registerFont(TTFont(n, FD + f))
pdfmetrics.registerFontFamily('LS', normal='LS', bold='LS-B', italic='LS-I', boldItalic='LS-BI')
NAVY = colors.HexColor('#0f2440'); GOLD = colors.HexColor('#92400e')
ST = {
 'body': ParagraphStyle('body', fontName='LS', fontSize=9.2, leading=12.2, spaceAfter=5),
 'small': ParagraphStyle('small', fontName='LS', fontSize=7.8, leading=10, textColor=colors.HexColor('#555555'), spaceAfter=4),
 'h1': ParagraphStyle('h1', fontName='LS-B', fontSize=17, leading=21, textColor=NAVY, spaceAfter=6),
 'h2': ParagraphStyle('h2', fontName='LS-B', fontSize=12.5, leading=15, textColor=NAVY, spaceBefore=8, spaceAfter=4),
 'h3': ParagraphStyle('h3', fontName='LS-B', fontSize=10, leading=13, textColor=NAVY, spaceBefore=7, spaceAfter=2),
 'title': ParagraphStyle('title', fontName='LS-B', fontSize=14.5, leading=18, alignment=TA_CENTER, textColor=NAVY, spaceAfter=2),
 'sub': ParagraphStyle('sub', fontName='LS', fontSize=8.5, leading=11, alignment=TA_CENTER, textColor=colors.HexColor('#555555'), spaceAfter=8),
 'flag': ParagraphStyle('flag', fontName='LS', fontSize=8.6, leading=11.2, leftIndent=12, firstLineIndent=-10, spaceAfter=3),
 'q': ParagraphStyle('q', fontName='LS', fontSize=9, leading=11.8, leftIndent=18, firstLineIndent=-18, spaceAfter=4),
 'notice': ParagraphStyle('notice', fontName='LS-B', fontSize=8.4, leading=10.4, spaceAfter=3),
 'cell': ParagraphStyle('cell', fontName='LS', fontSize=8.4, leading=10.4),
}

def fx(t):
    t = lib.fields_pretty(t)
    t = re.sub(r'<br\s*/?>', '<br/>', t)
    t = t.replace('☐', '[  ]').replace('☒', '[X]').replace('✂', '- -').replace('≥', '>=')
    t = re.sub(r'&(?!(?:amp|lt|gt|quot|nbsp|#\d+);)', '&amp;', t)
    t = re.sub(r'<(?!/?(?:b|i|u|br)\b)', '&lt;', t)
    return t
def P(t, s='body'): return Paragraph(fx(t), ST[s])

def notice_flow(state):
    a = cancel.ADD[state]; pt = cancel.PT[state]
    out = []
    for lab in ('CUSTOMER COPY — keep this copy', 'GRAYCO COPY — return or send this copy'):
        rows = [[P('NOTICE OF CANCELLATION', 'title')], [P(lab, 'sub')],
                [P('Date of transaction: ______________   Job / PO #: ______________<br/>Property: ______________________________<br/>Seller: ' + cancel.SELLER_LINE, 'notice')]]
        for t in cancel.FTC + a['add']: rows.append([P(t, 'notice')])
        rows.append([P(cancel.HOWTO, 'notice')]); rows.append([P(cancel.BUSDAY, 'small')])
        rows.append([P(cancel.SIGNLINE + '   Date: ______________   Purchaser\'s signature: ______________________________', 'notice')])
        t = Table(rows, colWidths=[6.9 * inch]); t.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 1.4, colors.black), ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 1), ('BOTTOMPADDING', (0, 0), (-1, -1), 1)]))
        out += [KeepTogether([t]), Spacer(1, 6), P('- - - - - - - detach here - - - - - - -', 'sub')] if lab.startswith('CUST') else [KeepTogether([t])]
    out.append(P('Printed size: ' + str(pt) + '-point bold type in the CRM (the FTC rule requires at least 10-point bold; Mississippi requires at least 12-point bold).', 'small'))
    return out

def blocks_flow(blocks):
    out = []
    for b in blocks:
        k = b[0]
        if k == 'title': out += [P(b[1], 'title'), P(b[2] or '', 'sub')]
        elif k == 'info':
            t = Table([[P(r[0], 'cell'), P('<b>' + r[1] + '</b>', 'cell')] for r in b[1]], colWidths=[2.3 * inch, 4.6 * inch])
            t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor('#cccccc')), ('VALIGN', (0, 0), (-1, -1), 'TOP')])); out += [t, Spacer(1, 6)]
        elif k == 'h': out.append(P(b[1], 'h3'))
        elif k == 'p': out.append(P(b[1]))
        elif k == 'box':
            t = Table([[P(b[1], 'cell')]], colWidths=[6.9 * inch]); t.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.9, colors.black), ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fafafa')), ('LEFTPADDING', (0, 0), (-1, -1), 6), ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)])); out += [t, Spacer(1, 6)]
        elif k == 'li':
            for x in b[1]: out.append(Paragraph('•&nbsp;&nbsp;' + fx(x), ST['flag']))
        elif k == 'checks':
            for x in b[1]: out.append(P('[  ] ' + x))
        elif k == 'grid':
            cols = b[1]; rows = [[P('<b>' + c + '</b>', 'cell') for c in cols]] + [[P('&nbsp;', 'cell') for c in cols] for _ in range(3)]
            t = Table(rows, colWidths=[6.9 * inch / len(cols)] * len(cols)); t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#999999')), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eef1f5'))])); out += [t, Spacer(1, 6)]
        elif k == 'sigs':
            t = Table([[P('', 'cell'), P('', 'cell')], [P(b[1] + ' — signature / printed name / date', 'cell'), P(b[2] + ' — signature / printed name / date', 'cell')]], colWidths=[3.4 * inch, 3.4 * inch], rowHeights=[26, None])
            t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, 0), 0.8, colors.black)])); out += [Spacer(1, 8), t, Spacer(1, 6)]
        elif k == 'small': out.append(P(b[1], 'small'))
        elif k == 'notice': out += notice_flow(b[1])
    return out

# ---------------------------------------------------------------------------------------------- cover content
QUESTIONS = [
 ("Right to cancel (all states)", [
   "Confirm the FTC Cooling-Off Rule (16 CFR Part 429) text we printed in full, the 3-business-day count (every day except Sundays and federal holidays, so Saturdays count), the oral-notice duty, and the duplicate detachable form. Do you want the notice at 10-point bold (federal minimum) in Tennessee and Arkansas and 12-point bold in Mississippi, or 12-point everywhere?",
   "Tennessee: confirm the Home Solicitation Sales Act citation (we used Tenn. Code Ann. § 47-18-701 et seq.) and the residential-roofing statute (Tenn. Code Ann. §§ 62-6-601 to -606: cancellation after the insurer's written notice of no or partial coverage, a written statement before signing, a detachable NOTICE OF CANCELLATION in duplicate in at least 10-point bold, 10-business-day refunds, emergency-repair exception, Consumer Protection Act remedy). We could not retrieve the statute text; our wording is a paraphrase.",
   "Mississippi: confirm Miss. Code Ann. § 75-66-1 et seq. (home solicitation sales; insurance sales exempt; urgent-need exception) and the Insurance Benefits Roofing Repair Consumer Protection Act (§§ 75-24-301 to -311, as amended by HB 1408 effective July 1, 2024: 3-day cancellation, 12-point bold, no payment until the period expires). Did the 5-day / no-representation bill HB 1118 become law?",
   "Arkansas: confirm Ark. Code Ann. § 4-89-101 et seq. (cancel section appears to be § 4-89-107) and whether Arkansas requires its own prescribed wording. We found NO Arkansas statute giving a cancellation right after an insurer denial; we offer it by contract. Is that the position you want in Arkansas? Is a roofing contractor registration number (Ark. Code Ann. § 17-25-601 et seq.) required on residential roofing contracts?",
   "Insurer-denial cancellation: we now include it for every insurance / storm contract (statutory in TN and MS as we understand them; contractual in AR). It sits next to the existing 20% overhead-and-profit liquidated-damages clause, which we say applies only after the cancellation rights expire. Is that enforceable against consumers in all three states?",
   "Emergency work: the federal rule lets the buyer waive the 3-day right only with a handwritten, dated, signed statement. We added a stand-alone Emergency Waiver form. Confirm that e-signature is not acceptable for that statement and how Mississippi / Tennessee treat 'emergency services' in the roofing refund exceptions.",
   "Where must the notice be delivered? The CRM now (1) prints a two-copy Notice page on every residential and insurance proposal and on the library Client Contract, (2) puts the clause in all contracts, (3) shows the notice and an acknowledgement checkbox in the customer portal before a residential contract is signed, and (4) adds the notice and the statement to the short-form automation contract. Is an electronic duplicate acceptable for customers who agreed to electronic records, or must a paper duplicate be handed over?"]),
 ("Assignment of Benefits and the Direction to Pay", [
   "We fixed the contradiction: the portal Direction to Pay already said it 'does not assign'; the Direction to Pay is now explicitly NOT an assignment everywhere (library, portal paper, claim paper, Work Authorization and Direction to Pay templates, and the three restoration agreements). The restoration agreements no longer assign anything; they point to a separate, optional, revocable Assignment of Benefits form. Is that the right structure?",
   "We removed 'negotiate claim amounts' from the restoration agreements and the Work Authorization (negotiating a claim for an owner may be unlicensed public adjusting). GrayCo may now only communicate about the scope and price of its own work and submit documents. Is that safe in TN, MS and AR (public adjuster statutes)?",
   "AOB form: it assigns only the right to receive payment for GrayCo's covered work, is optional, and is revocable (3 business days with the contract; any time before the insurer pays, in writing). Do TN, MS or AR require a different rescission period, notice to the insurer, a fee limit, or prohibit assignments? Do you want a right to sue / collect included?",
   "The marketing / contract text says the owner's cost is 'limited to your deductible' and 'no upfront payment beyond your deductible'. We added 'GrayCo will not pay, waive, rebate or absorb the deductible' to the new papers. Please review the older marketing wording and the Tennessee deductible-waiver cite (§ 56-7-130?)."]),
 ("Lien notices and lien waivers", [
   "Tennessee, Mississippi and Arkansas lien waivers: we wrote conforming forms (conditional and unconditional, progress and final) because we found no statutory form. Do any of the three states require statutory wording, a notary, or specific cites? The four generic forms already in the CRM are unchanged.",
   "Mississippi owner / pre-lien notice: we found no mandatory pre-lien notice for a direct GC and drafted an informational, protective notice. What does Mississippi actually require (stop notice, sworn statement, residential owner notice), and what are the right cites?",
   "Arkansas pre-construction notice (§ 18-44-115) is unchanged (a separate paper); the Arkansas contract lien clause now says GrayCo will deliver it before work begins. Please confirm the exact required notice text, type size and delivery."]),
 ("E-SIGN / UETA and portal terms", [
   "The E-SIGN disclosure is now shown, with an 'I agree to do business electronically' checkbox, before any e-signature in the customer portal and the sub portal; the server refuses a signature without it and records the consent on the signed copy. Is a typed name plus optional drawn signature enforceable for contracts, change orders, work authorizations and waivers in TN, MS, AR (UETA: Tenn. Code Ann. § 47-10-101 et seq.; Miss. Code Ann. § 75-12-1 et seq.; Ark. Code Ann. § 25-32-101 et seq.)?",
   "Portal links are bearer links; is a second factor needed for high-value documents? Is staff-recorded text consent acceptable (outside this part)?",
   "Portal terms: governing law, no arbitration clause in the portal terms, photo permissions, and the sub portal's Tennessee law / Shelby County venue. The sub portal privacy notice says we do not sell personal information; confirm."]),
 ("Master Subcontract Agreement and sub warranty", [
   "Anti-indemnity: our indemnity covers only the subcontractor's own fault, never an indemnitee's sole negligence, with a savings clause. Please verify Tenn. Code Ann. § 62-6-123, Miss. Code Ann. § 31-5-41 (which may reach negligence 'in whole or in part'), and Arkansas law (no private-construction statute found; Ark. Code Ann. § 22-9-214 is public work) and the additional-insured and employee-claim language.",
   "Pay terms now follow the CRM's real rule: invoice in by Wednesday, paid the Friday of the following week; Thursday–Sunday, the Friday after that; plus 'Pay ASAP' (skips the cut-off; still needs approval). This replaces three conflicting documents (Net 30 regardless of owner payment; pay-when-paid; invoices by the 25th / every Wednesday). Is the weekly rule acceptable under each state's prompt-payment act, and is the retainage-only pay-when-paid (15 days after GrayCo is paid) enforceable?",
   "Insurance (Exhibit A) reuses the CRM minimums: GL $1M / $2M, workers' comp statutory for the state of the work, employer's liability $500K x3, auto $1M CSL, umbrella $2M, additional insured, waiver of subrogation on all policies, COI before signing.",
   "Liquidated damages: the ITB says they apply but no amount exists. We apply them only when a Work Order states a per-day amount. Venue: arbitration in the project's county (Shelby County for Tennessee unless the Work Order says otherwise), matching the customer contract. Confirm joinder, jury waiver, 12-month non-solicitation, E-Verify language and the 1-year warranty (longer if the Work Order says the customer warranty is longer)."]),
 ("Statutory disclosure riders, mold, pack-out", [
   "TN / MS / AR riders: we found no general home-improvement contract statute in any of the three states beyond licensing, the home-solicitation acts, the TN and MS roofing acts and the Arkansas lien notice. We drafted general disclosure riders and flagged what we could not retrieve. Please say what each state actually requires, the license classes (Mississippi residential builder / remodeler; Arkansas roofing registration; Tennessee monetary limit and number on contract) and whether the riders must be signed before the contract.",
   "Mold remediation agreement: no state mold license found (TN, MS, AR); independent assessor and clearance required; 1-year limited warranty carve-out from the 5-year restoration warranty; limitation of liability. Pre-1978 lead (EPA RRP) and pre-1980 asbestos wording needs review.",
   "Contents pack-out authorization: storage, abandonment and disposal timelines, limit of liability per item, and bailee insurance."]),
 ("State wiring of live proposals and retainage", [
   "Live proposals used to print Tennessee text and Shelby County arbitration for every state. Now the job address picks the version: Tennessee by default; Mississippi when the address is in MS; Arkansas when in AR (state from the address; county from the address or a small city table). Dispute resolution follows the job's state and county (Tennessee: the job's county, Shelby when unknown; Mississippi and Arkansas: the job's county). Lien-rights, prompt-pay and tax wording follow the state (the existing MS / AR variants were reused). Please confirm the Mississippi 3.5% contractor's tax statement (non-residential over $10,000), the Arkansas sales-tax statement (Ark. Code Ann. § 26-52-307) and the 60-day Mississippi retainage release.",
   "Retainage: customer contracts and pay apps now agree: 5% cap for residential, 10% for commercial unless the contract says otherwise (pay apps default to 5% residential / 10% commercial; a job-level percentage still wins). The old text said 5% was 'the maximum allowed in TN, MS and AR'; we removed that claim because we could not verify it. Tennessee's Prompt Pay Act (Tenn. Code Ann. § 66-34-103 — please verify) may cap private retainage at 5%, which would conflict with the 10% commercial default.",
   "Existing-document defects fixed in the CRM: the Work Authorization and Direction to Pay placeholder '[Terms reviewed by your attorney go here.]' now carries real terms (consistent with the other insurance papers); the job-type mapper treated every 'residential' job as Commercial (the letters 'ti' in 'residential') — fixed. The GrayCo-format proposal (its own legal text, one-way legal fees, 10% interest) and invoice terms were not touched in this part."]),
]

def cover():
    s = []
    s += [P('GrayCo Construction Services — Draft Legal Documents, Part A', 'h1'),
          P('<b>Customer, insurance and subcontractor documents.</b> Prepared October 26, 2026 for attorney review. Every document below is a <b>DRAFT pending attorney review</b>; none is approved for use. In the CRM each new customer-facing document carries the footer <i>Form rev. 10/26/2026</i>; the admin-only note <i>DRAFT — pending attorney review (sent 10/26)</i> is shown to administrators only and is never printed or sent.'),
          P('Source of the gaps: <i>GrayCo Contract &amp; Legal Language for Attorney Review, October 26, 2026</i>, section F2 (documents expected but not found). Part B (marketing, employment, billing) is drafted separately.', 'small')]
    s.append(P('How the drafts are wired into the CRM', 'h2'))
    for x in ["<b>Library:</b> all %d new forms are built-in templates in the same document library as Company Documents / Forms and Job Type Templates; each is selectable on a job (Documents for this Job / Docs tab). <b>None is auto-attached or auto-sent</b>, except the two that the law needs, below." % len(lib.DOCS),
              "<b>Always used (residential flows and portals):</b> (1) the Notice of Cancellation and right-to-cancel clause, in the standard Residential and Commercial contracts, the proposal acceptance block, a two-copy page on residential and insurance proposals, the library Client Contract, the short-form automation contract, and the customer portal (residential contracts); (2) the E-SIGN / UETA consent, shown before every e-signature in the customer portal and the sub portal.",
              "<b>Portal and bid-site footers and sign-in screens</b> link the Customer Portal Terms of Use, Sub Portal Terms of Use, Privacy / Sub Portal Privacy Notice and the E-SIGN disclosure (new pages: portal-terms, sub-terms, sub-privacy, esign-consent).",
              "<b>State wiring:</b> TN by default, MS or AR when the job address is in that state; venue / arbitration / lien / prompt-pay / tax follow the state and county. <b>Retainage:</b> 5% residential, 10% commercial, in contracts and pay apps. <b>Direction to Pay</b> is explicitly not an assignment; the optional Assignment of Benefits is a separate form.",
              "Research note: we confirmed the statute names and general rules from public summaries and search results. We could not retrieve the official statute text for the Tennessee roofing act, the Mississippi roofing act, the Arkansas home-solicitation and lien-notice statutes, or any state's lien-waiver rules, so statutory wording is paraphrased and every citation should be verified."]:
        s.append(Paragraph('•&nbsp;&nbsp;' + x, ST['flag']))
    s.append(PageBreak())
    s.append(P('Questions and flags for counsel', 'h1'))
    n = 0
    for head, qs in QUESTIONS:
        s.append(P(head, 'h2'))
        for q in qs:
            n += 1
            s.append(Paragraph('<b>%d.</b>&nbsp;&nbsp;%s' % (n, fx(q)), ST['q']))
    s.append(PageBreak())
    s.append(P('Contents — documents in this PDF', 'h1'))
    rows = [[P('<b>#</b>', 'cell'), P('<b>Document</b>', 'cell'), P('<b>Group</b>', 'cell'), P('<b>Customer-facing</b>', 'cell'), P('<b>Used for</b>', 'cell')]]
    for i, d in enumerate(lib.DOCS, 1):
        rows.append([P(str(i), 'cell'), P(d['name'], 'cell'), P(d['group'], 'cell'), P('yes' if d['clientFacing'] else 'no (internal / sub)', 'cell'), P(', '.join(d['jobTypes']), 'cell')])
    t = Table(rows, colWidths=[0.35 * inch, 3.2 * inch, 1.2 * inch, 1.0 * inch, 1.15 * inch], repeatRows=1)
    t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#bbbbbb')), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8edf3')), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    s += [t, Spacer(1, 8), P('Then: Part 1 contract language wired into proposals (cancellation clauses, state contract wording, retainage); Part 2 changed insurance texts (Direction to Pay, restoration agreements, Work Authorization and Direction to Pay terms); Part 3 the documents above, each followed by its counsel flags.', 'small')]
    return s

def contract_part():
    s = [PageBreak(), P('Part 1 — Contract language wired into live proposals', 'h1')]
    s.append(P('1A. Right-to-cancel clause (added to the Residential and Commercial contracts and, in place of the old CANCELLATION clause, to the insurance restoration contracts)', 'h2'))
    s.append(P('Statement printed immediately above the owner signature (16 CFR 429.1(a)), residential and insurance proposals: <b>' + cancel.ACCEPT + '</b>'))
    for st, nm in (('TN', 'Tennessee'), ('MS', 'Mississippi'), ('AR', 'Arkansas')):
        for kind, kn in (('residential', 'Residential'), ('commercial', 'Commercial'), ('insurance', 'Insurance / storm')):
            s += [P(nm + ' — ' + kn, 'h3'), P(cancel.clause(st, kind), 'cell')]
    s.append(P('1B. State contract wording chosen from the job address (TN default)', 'h2'))
    for st, nm in (('TN', 'Tennessee'), ('MS', 'Mississippi'), ('AR', 'Arkansas')):
        s += [P(nm, 'h3'), P('<b>Dispute resolution.</b> ' + contract.dispute(st).replace('{COUNTY}', '[job county] County'), 'cell'), P('<b>Lien rights.</b> ' + contract.lien(st), 'cell'),
              P('<b>Prompt payment / retainage (residential).</b> ' + contract.prompt(st, 'residential'), 'cell'), P('<b>Prompt payment / retainage (commercial).</b> ' + contract.prompt(st, 'commercial'), 'cell')]
        if st in contract.TAX: s.append(P('<b>Tax statement (added after the price clause).</b> ' + contract.TAX[st], 'cell'))
    s.append(P(contract.RETAINAGE_FLAG, 'small'))
    s += [P('Part 2 — Changed insurance texts', 'h1'), P('2A. Direction to Pay paragraph in the Insurance Restoration, Water Damage and Fire Damage agreements (replaces "DIRECTION TO PAY / ASSIGNMENT OF BENEFITS … Owner assigns to Contractor the right to … negotiate claim amounts")', 'h2'),
          P('<b>' + insurance.RESTORATION_DTP_HEAD + '</b>', 'cell'), P(insurance.RESTORATION_DTP, 'cell'),
          P('2B. Direction to Pay sentence (library Direction to Pay, portal claim paper, Work Authorization / Direction to Pay templates)', 'h2'), P(insurance.NOT_AOB + ' ' + insurance.DTP_REVOKE + ' ' + insurance.AOB_REF, 'cell'),
          P('2C. Work Authorization terms (replace the placeholder "[Terms reviewed by your attorney go here.]")', 'h2')] + [P(x, 'cell') for x in insurance.WA_TERMS] + \
         [P('2D. Direction to Pay terms (replace the same placeholder)', 'h2')] + [P(x, 'cell') for x in insurance.DTP_TERMS]
    s.append(P('The Forms &amp; Docs "Work Authorization Form (Insurance)" line "Communicate and negotiate directly with my/our insurance carrier" now reads "Communicate directly … about the scope and price of GrayCo\'s work, and submit estimates, supplements and documents (GrayCo does not adjust, negotiate or settle my/our claim and is not a public adjuster)", and the line "payments … directly assigned or endorsed to GrayCo" now reads "made payable to me/us and GrayCo together under my/our Direction to Pay (not an assignment of benefits …)". Payment notes on the three restoration proposals now say proceeds are "paid to you and GrayCo together per the Direction to Pay (not an assignment)".', 'small'))
    return s

def docs_part():
    s = [PageBreak(), P('Part 3 — The new documents', 'h1'), P('Each document is shown as it prints, with merge fields shown in [brackets]. Counsel flags follow each document.', 'small')]
    for i, d in enumerate(lib.DOCS, 1):
        if i > 1: s.append(PageBreak())
        s.append(P('%d. %s' % (i, d['name']), 'h2'))
        s.append(P('DRAFT — pending attorney review · ' + lib.REV + ' · Group: ' + d['group'] + ' · ' + ('customer-facing' if d['clientFacing'] else 'internal / subcontractor') + ' · selectable only (not auto-attached)' + (' · <b>printed in the proposal and portal automatically</b>' if d['id'].startswith('cancel_notice') or d['id'] == 'esign_consent' else ''), 'small'))
        s += blocks_flow(d['blocks'])
        s.append(P(lib.REV, 'small'))
        fl = [Paragraph('<b>Flags for counsel — ' + fx(d['name']) + '</b>', ST['h3'])] + [Paragraph('•&nbsp;&nbsp;' + fx(f), ST['flag']) for f in d['flags']]
        t = Table([[fl]], colWidths=[6.9 * inch]); t.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.9, GOLD), ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fffbeb')), ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6)]))
        s += [Spacer(1, 8), t]
    return s

def page_deco(c, d):
    c.saveState(); c.setFont('LS', 7.5); c.setFillColor(colors.HexColor('#666666'))
    c.drawString(0.8 * inch, 0.45 * inch, 'GrayCo Construction Services — Draft Documents Part A — DRAFT, pending attorney review — October 26, 2026')
    c.drawRightString(letter[0] - 0.8 * inch, 0.45 * inch, 'Page %d' % d.page)
    c.setFont('LS-B', 8); c.setFillColor(GOLD); c.drawString(0.8 * inch, letter[1] - 0.5 * inch, 'CONFIDENTIAL — DRAFT FOR ATTORNEY REVIEW — NOT FOR USE')
    c.restoreState()

def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc = BaseDocTemplate(OUT, pagesize=letter, leftMargin=0.8 * inch, rightMargin=0.8 * inch, topMargin=0.8 * inch, bottomMargin=0.75 * inch, title='GrayCo Draft Documents Part A', author='GrayCo Construction Services', subject='Draft legal documents for attorney review')
    doc.addPageTemplates([PageTemplate(id='p', frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')], onPage=page_deco)])
    story = cover() + contract_part() + docs_part()
    doc.build(story)
    print('wrote', OUT, os.path.getsize(OUT))

if __name__ == '__main__':
    main()
