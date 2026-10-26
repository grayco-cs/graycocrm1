#!/usr/bin/env python3
"""Builds the attorney PDF for Part B (GrayCo-Draft-Documents-PartB-2026-10-26.pdf) from tools/legal3_docs.py (the same text the CRM prints).

    python3 tools/build_legal3_pdf.py [out.pdf]
"""
import sys, os, re, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import legal3_docs as L3
import legal3_rules as R3
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether, CondPageBreak, NextPageTemplate

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wLAW/GrayCo-Draft-Documents-PartB-2026-10-26.pdf'
LIB = '/usr/share/fonts/truetype/liberation/'
for n, f in [('Ser', 'LiberationSerif-Regular.ttf'), ('Ser-B', 'LiberationSerif-Bold.ttf'), ('Ser-I', 'LiberationSerif-Italic.ttf'), ('Ser-BI', 'LiberationSerif-BoldItalic.ttf'),
             ('San', 'LiberationSans-Regular.ttf'), ('San-B', 'LiberationSans-Bold.ttf'), ('San-I', 'LiberationSans-Italic.ttf'), ('San-BI', 'LiberationSans-BoldItalic.ttf')]:
    pdfmetrics.registerFont(TTFont(n, LIB + f))
pdfmetrics.registerFontFamily('Ser', normal='Ser', bold='Ser-B', italic='Ser-I', boldItalic='Ser-BI')
pdfmetrics.registerFontFamily('San', normal='San', bold='San-B', italic='San-I', boldItalic='San-BI')
_face = pdfmetrics.getFont('Ser').face
def sanitize(t):
    out = []
    for c in t:
        if c in '​️': continue
        if c == '☐': out.append('[ ]'); continue
        if ord(c) < 128 or ord(c) in _face.charToGlyph: out.append(c)
    return ''.join(out)

NAVY = colors.HexColor('#12263F'); GREY = colors.HexColor('#555555'); AMBER = colors.HexColor('#8A4B00')
S = lambda n, **k: ParagraphStyle(n, **k)
sTitle = S('t', fontName='San-B', fontSize=19, leading=23, textColor=NAVY, spaceAfter=4)
sSub = S('s', fontName='San', fontSize=9.5, leading=12.5, textColor=GREY, spaceAfter=6)
sPart = S('part', fontName='San-B', fontSize=14, leading=18, textColor=colors.white, backColor=NAVY, borderPadding=(7, 8, 7, 8), spaceBefore=4, spaceAfter=14)
sDoc = S('doc', fontName='San-B', fontSize=13, leading=16.5, textColor=NAVY, spaceBefore=2, spaceAfter=4, keepWithNext=1)
sH = S('h', fontName='San-B', fontSize=9.6, leading=12, textColor=NAVY, spaceBefore=8, spaceAfter=3, keepWithNext=1)
sBody = S('body', fontName='Ser', fontSize=9.3, leading=12, spaceAfter=4.2)
sDocH = S('dh', fontName='Ser-B', fontSize=9.6, leading=12.2, textColor=NAVY, spaceBefore=7, spaceAfter=2, keepWithNext=1)
sV = S('v', fontName='Ser', fontSize=9.1, leading=11.6, leftIndent=9, spaceAfter=3.2, backColor=colors.HexColor('#F5F3EC'), borderPadding=(1.5, 3, 1.5, 5))
sB = S('b', parent=sV, leftIndent=22, bulletIndent=11, bulletFontName='Ser')
sBul = S('bul', fontName='Ser', fontSize=9.2, leading=11.8, leftIndent=16, bulletIndent=5, spaceAfter=2.6)
sNote = S('n', fontName='San-I', fontSize=8.3, leading=10.5, textColor=colors.HexColor('#7A3E00'), spaceBefore=2, spaceAfter=4, leftIndent=9, borderPadding=(2, 3, 2, 4), backColor=colors.HexColor('#FFF4E0'))
sTc = S('tc', fontName='San', fontSize=8, leading=10.2)
sTcB = S('tcb', fontName='San-B', fontSize=8, leading=10.2, textColor=colors.white)
sMetaL = S('ml', fontName='San-B', fontSize=7.8, leading=9.8, textColor=colors.white)
sMetaR = S('mr', fontName='San', fontSize=8.3, leading=10.6)
sQ = S('q', fontName='San', fontSize=8.6, leading=11, spaceAfter=3, leftIndent=11, firstLineIndent=-11)

MERGE = {'customer': '[Customer name]', 'gc': '[General contractor / owner]', 'job_name': '[Job name]', 'job_address': '[Job address]', 'po': '[PO / job #]', 'date': '[Date]',
         'contract_amount': '[Contract amount]', 'pm': '[Project manager]', 'office_phone': '(901) 585-0944', 'billing_email': 'billing@grayco-cs.com',
         'license': 'TN #85034 BCB · AR #0486990627 · MS #27769', 'company_address': '4007 Broadway Rd, Bartlett, TN 38135 (4014 Broadway Rd from 10/29/2026)'}
def fmt(t, merge=True):
    t = sanitize(t)
    if merge: t = re.sub(r'\{([a-z_]+)\}', lambda m: MERGE.get(m.group(1), m.group(0)), t)
    t = html.escape(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'\[\[(.*?)\]\]', lambda m: '<font color="#8A4B00"><b>[' + m.group(1) + ']</b></font>', t)
    t = t.replace('\n', '<br/>')
    return t

class Doc(BaseDocTemplate):
    def __init__(self, fn, **kw):
        BaseDocTemplate.__init__(self, fn, pagesize=letter, leftMargin=0.9 * inch, rightMargin=0.9 * inch, topMargin=0.85 * inch, bottomMargin=0.8 * inch,
                                 title='GrayCo Construction Services — Draft Documents, Part B — October 26, 2026', author='GrayCo Construction Services', subject='Draft marketing, collections, employment and bond documents for attorney review', **kw)
        fr = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id='f', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id='main', frames=[fr], onPage=self.decor)])
    def decor(self, c, d):
        c.saveState()
        c.setStrokeColor(NAVY); c.setLineWidth(0.8); c.line(self.leftMargin, letter[1] - 0.62 * inch, letter[0] - self.rightMargin, letter[1] - 0.62 * inch)
        c.setFont('San-B', 7.5); c.setFillColor(NAVY); c.drawString(self.leftMargin, letter[1] - 0.55 * inch, 'GrayCo Construction Services — Draft Documents, Part B (marketing, collections, employment, bonds, e-mail)')
        c.setFont('San', 7.5); c.setFillColor(GREY); c.drawRightString(letter[0] - self.rightMargin, letter[1] - 0.55 * inch, 'October 26, 2026')
        c.drawString(self.leftMargin, 0.45 * inch, 'Confidential — DRAFT, pending attorney review. Not for use until approved.')
        c.drawRightString(letter[0] - self.rightMargin, 0.45 * inch, 'Page %d' % d.page)
        c.restoreState()

def table(rows, widths, header=True):
    data = [[Paragraph(fmt(c, False), sTcB if (header and i == 0) else sTc) for c in row] for i, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    st = [('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#999999')), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 2.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
          ('ROWBACKGROUNDS', (0, 1 if header else 0), (-1, -1), [colors.white, colors.HexColor('#F5F7FA')])]
    if header: st.append(('BACKGROUND', (0, 0), (-1, 0), NAVY))
    t.setStyle(TableStyle(st)); return t

def meta(rows):
    t = Table([[Paragraph(a, sMetaL), Paragraph(fmt(b, False), sMetaR)] for a, b in rows], colWidths=[1.1 * inch, 5.6 * inch])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (0, -1), NAVY), ('BACKGROUND', (1, 0), (1, -1), colors.HexColor('#EEF2F7')), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                           ('LINEBELOW', (0, 0), (-1, -2), 0.4, colors.white), ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5), ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]))
    return t

story = []
P = lambda t, st=sBody: story.append(Paragraph(t, st))

# ================================================================================ COVER
P('GrayCo Construction Services — Draft Documents, Part B', sTitle)
P('Marketing, referral, giveaway and coupon terms · collection letters · employment documents · surety / bond forms · e-mail legal footer · and the consistency fixes found in the October 26, 2026 contract-language review.', sSub)
story.append(Spacer(1, 4))
P('<b>Every document here is a DRAFT pending attorney review.</b> The owner asked for everything the review (Section F2 of "GrayCo Construction Services — Contract & Legal Language for Attorney Review," October 26, 2026) listed as missing to be drafted for counsel to review before use. Nothing here has been approved. Each document is in the CRM\'s Company Documents library with an admin-only note "DRAFT — pending attorney review (sent 10/26)" (never shown to customers, never printed or e-mailed) and a footer "Form rev. 10/26/2026". GrayCo is a licensed general contractor in Bartlett / Memphis, Tennessee (TN #85034 BCB), also licensed in Arkansas (#0486990627) and Mississippi (#27769), and works in all three states.', sBody)
P('<b>How to read the documents.</b> The text is reproduced exactly as the CRM will print it. <font color="#8A4B00"><b>[Bracketed amber text]</b></font> is a field the owner or the office fills in before use (a fee amount, a date, a name). Merge fields such as the customer\'s name or the job address are shown in plain brackets, for example [Customer name]; the CRM fills them from the job.', sBody)

P('Contents', sH)
toc = [['Section', 'Document', 'Who sees it']]
secno = {}
for i, (title, ids) in enumerate(L3.SECTIONS, 1):
    for j, did in enumerate(ids, 1):
        d = L3.BY_ID[did]
        toc.append(['%d.%d' % (i, j), d['name'], 'Admins only (HR category)' if d['admin_only'] else ('Customers / public' if d['client'] else 'Internal / sent to a surety agent')])
        secno[did] = '%d.%d' % (i, j)
toc.append(['5', 'Other new wording: e-mail legal footer, STOP wording, roof-price text boxes, late-fee lines', 'Customers'])
toc.append(['6', 'What changed — the consistency fixes', 'Summary'])
story.append(table(toc, [0.7 * inch, 3.9 * inch, 2.1 * inch]))

# ---- flags for counsel (cover)
story.append(PageBreak())
P('Flags for counsel — read this first', sPart)
P('<b>Cross-cutting questions</b>', sH)
flags_general = [
    '<b>Late charge / interest cap (TN, MS, AR).</b> The CRM\'s default is now one policy everywhere: <b>1.5% per month (18% annual percentage rate), or the maximum rate allowed by law, whichever is less</b>. The conflicting "10% per annum, the maximum permitted under Tennessee law (Tenn. Code Ann. § 47-14-103)" wording is removed from the Commercial and GrayCo-format proposals. Our understanding (NOT verified) is that Tennessee\'s general usury cap is 10% per year with exceptions (for example the "formula rate," written-contract rules, and whether a flat late charge is treated as interest), and that Mississippi and Arkansas each have their own caps and exceptions, which differ for consumer and commercial customers. Please say what rate is lawful for each state and each customer type, whether the "or the maximum allowed by law, whichever is less" saving clause is enough, and whether a different default should apply to residential owners. The 1.5% default is an owner-set value in the text, not a legal conclusion.',
    '<b>Attorney fees.</b> The GrayCo-format proposal (A7) was one-way in GrayCo\'s favor. It is now mutual (prevailing party), matching the contract, subcontract and invoices. Please confirm mutual is what you want in all three states, and whether TN / MS / AR limit one-way fee clauses in consumer contracts.',
    '<b>Statutory lien-notice timing (the collection letters).</b> The three "Notice of Intent to Lien" templates (TN, MS, AR) leave the cure period blank for counsel. Our understanding (NOT verified): Tennessee — notice of lien recorded within about 90 days after the contract is completed or terminated, suit within one year of recording (Tenn. Code Ann. §§ 66-11-112, -201); Mississippi — a lien must be filed, and enforced by suit, within short statutory windows (Miss. Code Ann. §§ 85-7-401 et seq.), possibly with a prior notice; Arkansas — a written notice of intent sent by certified mail some days before filing (we believe 10), and a filing deadline of about 120 days after the last work (Ark. Code Ann. §§ 18-44-101 et seq., -115, -117). Please give us the exact deadlines, required notice wording, delivery method and any residential-owner rule for each state, and confirm whether the original contractor must send any pre-lien notice.',
    '<b>Collection letters are office-send only.</b> Nothing in the CRM sends the lien notices or the final demand automatically. Sending goes through the Approvals list and is blocked in data-entry mode. Please confirm that a final demand that mentions a lien and a lawsuit in the same letter is acceptable for residential customers.',
    '<b>Non-compete (Project Managers and Estimators).</b> The Confidentiality & Non-Solicitation Agreement has a narrow 12-month, territory-limited non-compete only for Project Managers and Estimators, plus customer, employee and subcontractor non-solicits for everyone covered. Please confirm enforceability and reformation in Tennessee, the consideration (continued employment plus access to confidential information), the territory, and the Mississippi and Arkansas rules for employees who live or work there. The FTC non-compete rule was set aside in 2024; please confirm it is not in force.',
    '<b>Worker classification.</b> The Independent Contractor (1099) Agreement is for non-employee helpers. Please confirm the factors, and where a helper is directed by a GrayCo project manager or works set hours, whether that person should be an employee instead. TN construction workers\' compensation coverage / exemption and licensing thresholds apply.',
    '<b>Realtor, insurance-agent and property-manager referral fees.</b> The Referral Partner Agreement puts the licensing duty on the partner and has the partner confirm it may accept the fee in the form it is paid. Please confirm TN, MS and AR real-estate-commission rules (payment through the broker, client disclosure), insurance-producer rules (no adjusting, no deductible waiver or rebate), property-manager disclosure and, where a mortgage is involved, RESPA Section 8. The CRM already warns the approver when a fee to a realtor or insurance partner is approved.',
    '<b>Insurance deductible.</b> The referral credit terms and the coupon terms bar using a credit or coupon toward an insurance deductible or on insurance-paid work. Please confirm that wording and the TN / MS / AR deductible-waiver and claim-inducement statutes.',
    '<b>Stored-value / "never expires."</b> The referral program\'s credits and gift codes do not expire in the CRM. Coupons now expire 90 days after issue (default; owner-set). Please confirm gift-certificate and unclaimed-property rules for a "no expiration" credit, and whether promotional coupons are affected.',
    '<b>Sweepstakes.</b> The giveaway is free to enter online and by mail ("no purchase necessary"). Please confirm TN, MS and AR need no registration or bond at the prize values used, that the mail-in alternative is acceptable, and that self-certification of age and residence (with a ZIP-range check) is enough. The winner affidavit asks for a signed affidavit; notarization is optional in the form.',
    '<b>Text messages.</b> The website roof-price form now uses the same two separate, unchecked boxes the CRM uses ("Job texts" and "Offers"), with the SMSC2 wording; it no longer says GrayCo may "text" you merely by asking for a price. Sub schedule texts now end "Reply STOP to opt out." Please check the wording.',
    '<b>Handbook points.</b> At-will and "not a contract" wording; TN Drug-Free Workplace program option (Tenn. Code Ann. § 50-9-101 et seq.); lawful medical cannabis in MS and AR; meal-break rule; TN parking-lot firearm law; NLRA Section 7 carve-outs; FLSA exempt status of Project Managers and Estimators.',
    '<b>E-mail footer.</b> A short confidentiality / accuracy footer is added once in the e-mail shell; it appears on every customer e-mail that uses the shell (invoices, portal links, signed papers, proposals), not on GrayCo News. Please confirm the wording (it says amounts and scope in an e-mail are summaries subject to the signed agreement, and that an e-mail alone does not change a signed agreement).',
    '<b>Existing inconsistencies we did not touch</b> (other items in the review, not part of this task): retainage 5% vs 10%; governing law / venue (proposal contract fixes Tennessee / Shelby County for every job); the "assigns" vs "does not assign" language on assignment of benefits; subcontract payment timing; warranty statements; the text-phone numbers in the privacy and terms pages. The library Construction Agreement says invoices are "due on receipt" while the proposals and invoices say net 30; the new late-fee sentence is added to it, but counsel may want one payment term.',
]
for t in flags_general:
    story.append(Paragraph(t, sBul, bulletText='•'))

P('<b>Document-by-document flags</b>', sH)
for title, ids in L3.SECTIONS:
    for did in ids:
        d = L3.BY_ID[did]
        story.append(Paragraph('<b>%s %s</b>' % (secno[did], html.escape(d['name'])), S('fl', fontName='San-B', fontSize=8.8, leading=11, textColor=NAVY, spaceBefore=6, spaceAfter=2, keepWithNext=1)))
        for f in d['flags']:
            story.append(Paragraph(fmt(f, False), sBul, bulletText='•'))

# ================================================================================ DOCUMENTS
def doc_flow(d):
    out = []
    out.append(Paragraph('%s  %s' % (secno[d['id']], html.escape(d['name'])), sDoc))
    vis = 'Admins only (HR category of Company Documents — hidden from everyone else)' if d['admin_only'] else ('Customers / the public' if d['client'] else 'Internal; sent to a surety agent')
    mrows = [('DRAFT', 'Pending attorney review (sent 10/26). Admin-only note in the CRM; never printed or sent.'), ('FOR WHOM', d['who'] or '—'), ('WHERE USED', d['where'] or '—'), ('VISIBLE TO', vis),
             ('FOOTER', L3.REV)]
    if d.get('admin_note'): mrows.append(('ADMIN NOTE', d['admin_note']))
    out.append(meta(mrows)); out.append(Spacer(1, 8))
    out.append(Paragraph(fmt(d['name'].upper()), S('dt', fontName='Ser-B', fontSize=12, leading=15, alignment=1, textColor=NAVY, spaceAfter=1)))
    if d['subtitle']: out.append(Paragraph(fmt(d['subtitle']), S('dsub', fontName='Ser-I', fontSize=9, leading=11, alignment=1, textColor=GREY, spaceAfter=6)))
    for b in d['blocks']:
        k = b[0]
        if k == 'h': out.append(Paragraph(fmt(b[1]), sDocH))
        elif k == 'p': out.append(Paragraph(fmt(b[1]), sV))
        elif k == 'note': out.append(Paragraph(fmt(b[1]), sNote))
        elif k == 'ul':
            for x in b[1]: out.append(Paragraph(fmt(x), sB, bulletText='•'))
        elif k == 'info':
            rows = [[Paragraph(fmt(r[0]), S('ia', fontName='San', fontSize=8.2, leading=10.4, textColor=GREY)), Paragraph(fmt(r[1]), S('ib', fontName='San-B', fontSize=8.4, leading=10.6))] for r in b[1]]
            t = Table(rows, colWidths=[2.2 * inch, 4.5 * inch])
            t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), 0.3, colors.HexColor('#cccccc')), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
            out.append(Spacer(1, 2)); out.append(t); out.append(Spacer(1, 4))
        elif k == 'sigs':
            rows = [[Paragraph(b[1] + ' — signature', sTc), Paragraph(b[2] + ' — signature', sTc)], [Paragraph('Printed name / title', sTc), Paragraph('Printed name / title', sTc)], [Paragraph('Date', sTc), Paragraph('Date', sTc)]]
            t = Table(rows, colWidths=[3.3 * inch, 3.3 * inch], rowHeights=[0.42 * inch] * 3)
            t.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, -1), 0.6, colors.black), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 2)]))
            out.append(Spacer(1, 6)); out.append(t)
    out.append(Paragraph(L3.REV, S('rev', fontName='San', fontSize=8, leading=10, alignment=2, textColor=GREY, spaceBefore=8)))
    return out

for i, (title, ids) in enumerate(L3.SECTIONS, 1):
    story.append(PageBreak())
    story.append(Paragraph('%d. %s' % (i, title), sPart))
    for n, did in enumerate(ids):
        if n: story.append(PageBreak())
        story.extend(doc_flow(L3.BY_ID[did]))

# ================================================================================ OTHER NEW WORDING
story.append(PageBreak())
story.append(Paragraph('5. Other new wording (in the CRM, the website and the server)', sPart))
from importlib import import_module
brand_text = ('This email and any attachments are intended only for the named recipient and may contain confidential or privileged information. If you received it in error, please tell us and delete it. '
              'Amounts, dates and scope in this email are summaries and are subject to your signed agreement and our written invoices; an email alone does not change a signed agreement. '
              'GrayCo Construction Services · licensed GC TN #85034 BCB · AR #0486990627 · MS #27769')
LATE = 'a late charge of 1.5% per month (18% annual percentage rate) on the past-due balance, or the maximum rate allowed by law, whichever is less'
P('5.1  E-mail legal footer (added once, in the e-mail shell, netlify/functions/_lib/brand.js)', sDocH)
story.append(Paragraph(fmt(brand_text), sV))
P('Shown at the bottom of every customer e-mail that goes through the GrayCo shell: invoices, portal links, signed papers, proposals, past-due reminders. It is also added to the plain-text part. It is left off GrayCo News (which has its own footer and unsubscribe line).', sBody)
P('5.2  Sub schedule texts (STOP wording)', sDocH)
story.append(Paragraph(fmt('GrayCo: you\'re scheduled at [address] tomorrow [time] for [work]. Reply Y to confirm, or text us if anything changes. Reply STOP to opt out.'), sV))
story.append(Paragraph(fmt('GrayCo: [address] today at [time]. Are you on your way / at the job? Reply Y. Reply STOP to opt out.'), sV))
P('5.3  Website roof-price form — text consent (two separate, unchecked boxes; the same wording the CRM contract and intake forms use)', sDocH)
story.append(Paragraph(fmt('[ ] Job texts: I agree to receive text messages from GrayCo Construction Services about my job (appointment and crew scheduling, job updates, estimates and invoices). Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase.'), sV))
story.append(Paragraph(fmt('[ ] Offers (optional, separate): I also agree to receive occasional promotional text messages from GrayCo Construction Services (seasonal service offers, up to 4 per month). Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase.'), sV))
story.append(Paragraph(fmt('Fine print under the button: By asking for a price you agree GrayCo may call or e-mail you about your roof. GrayCo sends text messages only if you tick a box above. The price is a ballpark — the final price comes after a free inspection.'), sV))
P('A box counts only when ticked; each is recorded on the lead (job texts = smsConsent, offers = smsMarketing). The previous text said GrayCo may "call, text or e-mail" with no checkbox.', sBody)
P('5.4  Late-fee sentence (the one wording used in the contracts, invoices, proposals, short-form contract and past-due e-mails)', sDocH)
story.append(Paragraph(fmt('Unpaid invoices accrue ' + LATE + '.'), sV))
P('5.5  Past-due reminder e-mails (7, 15 and 30 days) — one line added under the contact line', sDocH)
story.append(Paragraph(fmt('Payment terms: net 30 days from the invoice date. Balances unpaid after 30 days may accrue ' + LATE + ' (see your contract).'), sV))
P('5.6  Invoice PDF (made by the server) — one paragraph added above the thank-you line', sDocH)
story.append(Paragraph(fmt('Payment terms: net 30 days from the invoice date. Balances unpaid after 30 days accrue ' + LATE + '. In a collection action the prevailing party recovers its reasonable attorneys\' fees and costs.'), sV))
P('5.7  Coupon — fine print on the claim page and in the coupon e-mail', sDocH)
for t in ['Value: $100 off the price of GrayCo Construction Services work on projects over $1,000.',
          'Expires 90 days after it is issued (the number of days is an Admin setting). The expiration date is shown on your coupon and in the e-mail we send you. An expired coupon has no value.',
          'One per household (same e-mail, phone or address), and one use per coupon.',
          'Not combinable with any other coupon, discount or offer. GrayCo referral credit may be used with it.',
          'No cash value. No change is given. Not valid toward an insurance deductible or on work an insurance company pays for.',
          'Not transferable or for sale; a copied, altered or sold coupon is void. GrayCo may verify any code.',
          'Give the code to your GrayCo project manager before your estimate or invoice is final, on or before the expiration date.',
          'Void where prohibited. GrayCo may end or change the offer, but honors coupons already issued until they expire.',
          'Claiming a coupon lets GrayCo contact you about your project. It is not consent to marketing texts.']:
    story.append(Paragraph(fmt(t), sB, bulletText='•'))
P('The server stamps each new coupon with its expiration date and refuses redemption after it. Coupons claimed before this change have no date and stay valid.', sBody)
P('5.8  Giveaway entry page', sDocH)
for t in ['[ ] I am 18 or older, I live in Tennessee, Mississippi or Arkansas, and I agree to the official rules below. (required)',
          '[ ] Optional: join GrayCo News by e-mail (tips + next month\'s giveaway) — unsubscribe any time. Not needed to enter. (unchecked by default; previously pre-checked)',
          '[ ] Optional: follow GrayCo on Facebook (opens Facebook — not needed to enter). (unchanged)']:
    story.append(Paragraph(fmt(t), sB, bulletText='•'))
P('The default Official Rules on the entry page and in the CRM editor are the text of document 1.4. [START DATE], [END DATE], [DRAW DATE], [PRIZE] and [PRIZE VALUE] are filled in on the public page from owner-editable fields (Marketing → Giveaway: entry period start and end, prize, prize value). Rules saved earlier with the old [ELIGIBILITY] / [DATES] placeholders now fall back to the new default text. The winner e-mail now asks the winner to reply within 14 days (it used to say 30, the rules said 14) and to return the signed affidavit.', sBody)

# ================================================================================ WHAT CHANGED
story.append(PageBreak())
story.append(Paragraph('6. What changed — the consistency fixes', sPart))
P('Findings from the review\'s list "Places where the CRM\'s own documents disagree" and the missing-document checklist (F2), and what was done. "Before" is the wording or behavior in the repository on October 26, 2026; "After" is this draft.', sBody)
rows = [['#', 'Where', 'Before', 'After']]
def R(w, b, a): rows.append([str(len(rows)), w, b, a])
LF = '1.5% per month (18% annual percentage rate), or the maximum rate allowed by law, whichever is less'
R('Construction contract text (Residential, Commercial, contract generator) — "4. PAYMENT TERMS"', 'Unpaid invoices accrue interest at 1.5% per month (18% annually).', 'Unpaid invoices accrue a late charge of ' + LF + ' on the past-due balance.')
R('Printed client contract, section 4', 'Invoices not paid within 30 days accrue interest at 1.5% per month (18% annually).', 'Same sentence, new wording (a late charge of ' + LF + ').')
R('Printed invoice (Professional Invoice) and the second print invoice', '"Balances unpaid after 30 days accrue interest at 1.5% per month (18% annually)" / "Late balances accrue 1.5%/month (18% annually)"', 'Both: balances unpaid after 30 days accrue a late charge of ' + LF + '.')
R('Invoice PDF made by the server and e-mailed', 'No late-fee, interest or attorney-fee wording; only "Terms: Due on receipt (or the invoice\'s terms)".', 'A terms paragraph: net 30; late charge as above; prevailing party recovers attorneys\' fees (matches the print invoices).')
R('Commercial proposal notes', 'Late payments are subject to 10% per annum, the maximum permitted under Tennessee law (TN Code 47-14-103), accruing from the original due date.', 'A late charge of ' + LF + ', applies to late payments from the original due date. The 10% / TN Code wording is removed.')
R('GrayCo-format proposal, "LATE PAYMENT"', 'Subject to ten percent (10%) per annum, the maximum rate permitted under Tennessee law (Tennessee code 47-14-103).', 'Accrue a late charge of ' + LF + ', from the original due date until paid. The 10% wording is removed.')
R('GrayCo-format proposal, "LEGAL FEES"', 'One-way: if GrayCo prevails or is found without fault, the customer pays all legal fees and costs.', 'Mutual: the prevailing party recovers its reasonable attorney\'s fees, court costs and related expenses from the non-prevailing party.')
R('Residential proposal notes', 'Payment terms: Net 30 ... (no late-fee statement).', 'Adds: Unpaid balances accrue a late charge of ' + LF + '.')
R('Short-form contract (the automatic one-page contract)', 'No payment terms, interest or late charge.', 'Adds: Payment is due within 30 days of each invoice. Unpaid invoices accrue a late charge of ' + LF + '.')
R('Library Construction Agreement and Payment Terms', 'No late-fee statement.', 'Adds the same sentence. (The agreement still says invoices are due on receipt; flagged for counsel.)')
R('Past-due reminder e-mails (7 / 15 / 30 days)', 'No interest or late-fee wording (polite reminders).', 'One line: net 30; balances unpaid after 30 days may accrue a late charge of ' + LF + ' (see your contract).')
R('Collection letters (new)', 'None existed.', 'Notice of Intent to Lien (TN / MS / AR) and Final Demand Letter use the same late-charge wording. Office-send only; never automatic.')
R('bid.html (Invitation to Bid page)', 'File ended mid-sentence: "Final retainage paid within 10".', 'Finished: "...days of owner pay," then the rest of the terms from the published ITB (PO number, change orders, warranty, safety, clean-up), the Submit-your-bid block, a footer, and the closing tags.')
R('Public pages (coupon, giveaway, privacy, terms, SMS consent, roof check) and the Invitation to Bid text', '"Licensed TN general contractor"; ITB: "Licensed General Contractor (TN & MS)".', '"Licensed general contractor · TN · MS · AR" everywhere; the ITB says (TN · MS · AR).')
R('Giveaway default rules', 'Two different default texts (entry page and CRM editor); unfilled [ELIGIBILITY] and [DATES]; service area limited to Memphis metro and DeSoto County.', 'One full Official Rules text in both places (document 1.4) with eligibility (TN / MS / AR residents, 18+, employees excluded), entry period, how to enter without purchase, odds, prize value, winner selection and notification, publicity release, sponsor and governing law. Dates, prize and prize value are owner-editable fields.')
R('Giveaway newsletter box', 'Pre-checked; the server joined everyone to GrayCo News unless the page sent "false".', 'Unchecked by default; the server joins GrayCo News only when the box is ticked; the lead note says which.')
R('Giveaway eligibility and winner e-mail', 'Agree box said only "agree to the official rules"; winner e-mail said "claim within 30 days" (rules said 14).', 'Agree box says 18+ and TN / MS / AR; the server checks the ZIP is in a TN / MS / AR range; the winner e-mail asks for a reply within 14 days and the signed affidavit.')
R('Coupons', 'One-paragraph fine print; no expiration; the page said "used once."', 'Expiration (default 90 days after issue, Admin setting) shown on the coupon, the claim page and the e-mail, and enforced at redemption; expanded terms; Marketing → Coupons shows the expiry on a check.')
R('Website roof-price form', 'Fine print: "you agree GrayCo may call, text or e-mail you" with no checkbox.', 'Two separate unchecked boxes (Job texts / Offers) with the SMSC2 wording; fine print says texts only if ticked; consent is recorded on the lead.')
R('Sub schedule texts', 'Evening and morning texts had no opt-out wording.', 'Both end "Reply STOP to opt out."')
R('Job e-mails (invoices, portal links, signed papers, proposals)', 'No legal footer (only GrayCo News had one).', 'One short confidentiality / accuracy footer added once in the e-mail shell (brand.js), in the html and plain-text parts; not on GrayCo News.')
R('Missing documents (F2)', 'Referral program terms, partner agreement, coupon terms, giveaway affidavit, lien / demand letters, handbook, confidentiality and non-compete, 1099 agreement, surety forms: NOT FOUND.', 'Drafted: 14 documents in Company Documents (Marketing, Client, HR, Commercial groups) with an admin-only DRAFT note and "Form rev. 10/26/2026". The three HR documents are visible to admins only.')
story.append(table(rows, [0.3 * inch, 1.55 * inch, 2.35 * inch, 2.5 * inch]))

P('How it was checked', sH)
for t in ['Browser tests (Playwright) render all 14 new documents with no page errors, confirm each ends "Form rev. 10/26/2026" and carries no DRAFT text, confirm the HR documents and the admin notes appear for an admin only, confirm the printed invoice, the printed contract and the GrayCo-format proposal show the single late-fee wording and the mutual fee clause, confirm the giveaway newsletter box is unchecked and the rules are filled, the coupon page shows the expiration, the roof-price form has two unchecked boxes, and the public pages show the new license line.',
          'Server tests (Node) render a real invoice e-mail through the shell and confirm the footer, the PDF terms line, the past-due e-mails, the STOP wording, coupon expiration (default, setting, refusal after expiry, old coupons stay valid) and the giveaway opt-in / ZIP check.',
          'No customer data and no secrets are in any document.']:
    story.append(Paragraph(fmt(t, False), sBul, bulletText='•'))

doc = Doc(OUT)
doc.build(story)
print('wrote', OUT)
