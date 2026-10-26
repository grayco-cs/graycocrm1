# -*- coding: utf-8 -*-
"""LEGAL3: the text of every NEW GrayCo document in Part B (marketing, collections, HR, bonds).

ONE source of truth: tools/patch_LEGAL3.py turns these blocks into library templates (index.html) and the attorney PDF
builder reads the same blocks, so the PDF always shows exactly what the CRM will print.

Block kinds:  ('h', text)  ('p', text)  ('ul', [text, ...])  ('info', [[label, value], ...])  ('sigs', left, right)  ('note', text)
Inline markup:  **bold**     [[owner-set field]]  (shown highlighted in the CRM; the owner replaces it before use)
Merge fields the library fills from the job:  {customer} {gc} {job_name} {job_address} {po} {date} {contract_amount} {pm}
{office_phone} {billing_email} {license}.   {company_address} is filled when the page loads (the scheduled company address).
Every document is a DRAFT pending attorney review. The CRM shows that note to admins only (never on a printed / sent copy).
"""
REV = 'Form rev. 10/26/2026'
DRAFT_NOTE = 'DRAFT — pending attorney review (sent 10/26)'

DOCS = []


def D(id, name, category, jobtypes, client, blocks, subtitle='', admin_only=False, flags=(), admin_note='', who='', where=''):
    DOCS.append(dict(id=id, name=name, category=category, jobtypes=list(jobtypes), client=client, blocks=blocks, subtitle=subtitle,
                     admin_only=admin_only, flags=list(flags), admin_note=admin_note, who=who, where=where))


MKT = ['marketing']
ALL = ['residential', 'commercial', 'insurance']

# ====================================================================================================================
# 1. REFERRAL PROGRAM TERMS  (matches netlify/functions/_lib/referral.js: members, stacking credit, one-time gift codes)
# ====================================================================================================================
D('referral_terms', 'Referral Program Terms', 'Marketing & Referrals', MKT, True, [
    ('p', 'These terms apply to the GrayCo Referral Program (the "Program") run by GrayCo Construction Services, LLC ("GrayCo", "we", "us") at {company_address}, (901) 585-0944. By joining the Program or sending us a referral you agree to them. If you are a licensed real estate agent, insurance agent, public adjuster or property manager referring in the course of your business, the **Referral Partner Agreement** applies instead of these terms.'),
    ('h', '1. How the Program works'),
    ('p', 'You tell a friend, family member or neighbor about GrayCo. If they become a GrayCo customer and the referral meets these terms, we add GrayCo credit to your account. Credits add up in one balance that you can use toward GrayCo work, or turn into a one-time gift code for someone else.'),
    ('h', '2. Who can join'),
    ('ul', ['Anyone 18 or older. You do not have to be a GrayCo customer.',
            'GrayCo employees, owners, officers, subcontractors, sales representatives and their households may not earn credit for referrals in the course of their work or for their own property.',
            'You may not refer yourself, a member of your household, or property you own or manage for yourself.',
            'Real estate agents, insurance agents, public adjusters and property managers who refer clients or tenants in the course of their business must use the Referral Partner Agreement.']),
    ('h', '3. What counts as a referral'),
    ('p', 'A referral counts when (a) the person you refer is a new GrayCo customer for that project, and GrayCo has not already been in contact with them about it; and (b) they are credited to you by your member code or link (R-XXXXXX), by the referral form on our website or customer portal, or by their telling a GrayCo representative your name at their first contact. If two people claim the same referral, the one we recorded first counts. Our records decide.'),
    ('p', 'Only give us contact information for a person who has agreed to hear from GrayCo. We will contact them by phone, e-mail or text only as they permit. Do not send us anyone who has asked not to be contacted.'),
    ('h', '4. When you earn credit'),
    ('p', 'Credit is earned only after the person you referred signs a contract with GrayCo **and** [[makes the first payment / signs the contract — GrayCo chooses one]] on a project that is not cancelled or refunded. GrayCo proposes the credit, a GrayCo administrator approves it, and then it is added to your balance. Credit amounts are set by GrayCo and may depend on the size of the referred job:'),
    ('info', [['Referred job under $10,000', '[[$ credit — set by GrayCo]]'], ['Referred job $10,000 to $25,000', '[[$ credit — set by GrayCo]]'], ['Referred job over $25,000', '[[$ credit — set by GrayCo]]']]),
    ('p', 'We may change these amounts for future referrals. A change does not reduce credit you have already earned.'),
    ('h', '5. Using your credit'),
    ('ul', ['Credits stack in one balance. Ask your GrayCo project manager or the office to apply all or part of it to an estimate or invoice for GrayCo work, or ask in your customer portal.',
            'Credit never reduces an invoice below zero and may only be used once. It has no cash value, is not a gift card or a loan, and cannot be redeemed for cash, except where the law requires.',
            'Credit may not be used to pay, waive, rebate or reduce an insurance deductible, or any amount an insurance company is responsible for. Credit is not an inducement to file or pursue an insurance claim.',
            'Credit may be combined with a GrayCo $100 coupon. It may not be combined with another referral program or discount unless GrayCo says so in writing.']),
    ('h', '6. Gift codes'),
    ('p', 'You may turn some or all of your balance (minimum $10) into a one-time gift code (GC-XXXX-XXXX-XXXX) for family or friends. The amount leaves your balance immediately. The code works once, on any GrayCo job, and then it is used up. It has no cash value and cannot be replaced if lost or shared publicly. GrayCo may cancel an unused code at your request and put the amount back in your balance.'),
    ('h', '7. Expiration'),
    ('p', '[[GrayCo policy: credits and gift codes you have earned do not expire.]] GrayCo may change or end the Program for future referrals at any time. We will honor credit already earned and gift codes already issued.'),
    ('h', '8. Taxes'),
    ('p', 'Referral credit may be taxable income to you. You are responsible for any taxes. If the law requires, GrayCo will ask for your taxpayer information and report the value on an information return.'),
    ('h', '9. Fair conduct'),
    ('ul', ['Be truthful. Do not say GrayCo has promised a price, a result, an insurance payment or that a claim will be approved.',
            'Do not solicit, advise on or negotiate an insurance claim for payment, and do not offer to pay or waive a deductible on GrayCo\'s behalf.',
            'Do not spam, post misleading ads, or use GrayCo\'s name or logo in ways we have not approved.',
            'Obey the laws on calls, texts and e-mail. Do not send automated messages for GrayCo.']),
    ('p', 'GrayCo may deny or take back credit and remove a member for fraud, self-dealing, false claims, or violation of these terms.'),
    ('h', '10. Privacy'),
    ('p', 'We use the information you and your referral give us to run the Program and to contact the referred person, as described in our Privacy Policy at grayco-cs.com. We may tell the person you referred that you suggested GrayCo.'),
    ('h', '11. No agency; changes'),
    ('p', 'You are not GrayCo\'s employee, agent or contractor, and you may not sign or promise anything for GrayCo. We may change these terms by posting new ones; new terms apply to referrals made after the change. The Program is not offered where prohibited.'),
    ('h', '12. Law and disputes'),
    ('p', 'Tennessee law governs these terms. Any dispute that cannot be settled by talking will be brought in the state or federal courts for Shelby County, Tennessee, unless the law requires otherwise. If any part of these terms is unenforceable, the rest stays in effect.'),
    ('p', 'Questions: (901) 585-0944 · office@grayco-cs.com'),
], subtitle='GrayCo Referral Program',
  flags=['Credit amounts are blank fields; the owner sets them (the CRM suggests $100 / $250 / $500 by job size and an admin approves each credit).',
         'Credits and gift codes "never expire" in the CRM today. Please confirm stored-value / gift-certificate and unclaimed-property rules (TN, MS, AR) and whether a no-expiration promise should be kept.',
         'Deductible language: TN, MS and AR restrict paying, waiving or rebating an insurance deductible and inducing insurance claims. The terms bar using credit against a deductible; please confirm the wording and whether a referral credit to a claim customer is ever safe.',
         'Referrals by realtors / insurance agents / property managers are routed to the Partner Agreement; please check licensing rules (see that agreement).',
         'Tax reporting of credits as prizes / income; 1099 threshold; whether to require a W-9.',
         'Venue (Shelby County) and the "our records decide" duplicate-referral rule.'],
  who='Anyone who joins the Referral Program (customers, neighbors, friends); not licensed referral professionals.',
  where='Marketing → Referral program (members, credit, gift codes); customer portal; website "Join our referral program". Send or print from 📚 Company Documents.')

# ====================================================================================================================
# 2. REFERRAL PARTNER AGREEMENT  (matches mkt2.js partners: realtor / insurance / property manager, fee per partner or per type)
# ====================================================================================================================
D('referral_partner', 'Referral Partner Agreement', 'Marketing & Referrals', MKT, True, [
    ('p', 'This Referral Partner Agreement ("Agreement") is between GrayCo Construction Services, LLC, a Tennessee limited liability company ("GrayCo"), at {company_address}, and the partner named below ("Partner"). It is effective on the date GrayCo signs it.'),
    ('info', [['Partner name', '[[________________]]'], ['Company / brokerage', '[[________________]]'], ['Partner type', '[[ ] Realtor   [ ] Insurance agent   [ ] Property manager   [ ] Other]]'],
              ['License type, number, state', '[[________________]]'], ['Supervising / managing broker (if any)', '[[________________]]'],
              ['Partner e-mail / phone', '[[________________]]'], ['Partner code (assigned by GrayCo)', '[[________________]]'],
              ['Referral fee', '[[$ ______ per qualifying referral — set by GrayCo for this partner]]'], ['Fee paid as', '[[ ] check   [ ] ACH   [ ] GrayCo credit   [ ] gift card — and to whom (partner or brokerage)]]']]),
    ('h', '1. The relationship'),
    ('p', 'Partner is an independent business. Nothing here makes Partner an employee, agent, partner or joint venturer of GrayCo. Partner has no authority to bind GrayCo, quote prices, sign contracts, or make promises about work, schedules, warranties or insurance coverage. The relationship is not exclusive: Partner may recommend other contractors, and GrayCo may work with other partners.'),
    ('h', '2. What Partner does'),
    ('p', 'Partner may introduce clients, customers, tenants and contacts ("Referred Persons") to GrayCo using the Partner code, the Partner link or QR code, the GrayCo partner page, or by sending us their details with their permission. GrayCo will provide a partner page showing referrals (name, date and stage) and fees.'),
    ('h', '3. Qualifying referral'),
    ('p', 'A referral qualifies when (a) the Referred Person is not already a GrayCo customer, lead or prospect for that project; (b) GrayCo records the Partner as the source by code, link, partner page or written notice before GrayCo\'s first estimate; and (c) the Referred Person signs a contract with GrayCo and **pays [[the first payment / the contract in full — GrayCo chooses]]**. If two sources claim the same referral, the first one GrayCo recorded counts. Our records decide.'),
    ('h', '4. Referral fee'),
    ('ul', ['GrayCo pays the fee in the Referral fee box above, once per qualifying referral, within [[30]] days after GrayCo approves it. A GrayCo administrator approves every fee.',
            'No fee is due on a job that is cancelled, refunded, unpaid, or later found not to qualify. If GrayCo has already paid a fee on such a job, Partner will return it or GrayCo may deduct it from a later fee.',
            'The fee is not a share of the contract price and does not depend on the price Partner or the Referred Person agrees to, other than the tier amounts GrayCo has told Partner in writing.',
            'GrayCo may change the fee for future referrals on 30 days\' written notice.',
            'Partner is responsible for taxes on fees. Partner will give GrayCo a Form W-9 before the first payment.']),
    ('h', '5. Licensed professionals — Partner\'s own duties'),
    ('p', 'Partner is solely responsible for knowing and following the license law and ethics rules that apply to Partner, including the real estate commission rules of the state where Partner is licensed, insurance department rules, and any broker or employer policy. Partner represents that Partner is allowed to accept the fee, in the way it is paid (to Partner, to Partner\'s brokerage, or in another form), and that Partner has any written broker approval required. GrayCo does not give legal advice to Partner on these rules. If a rule would be broken by accepting a fee, Partner will tell GrayCo and the fee will be waived, paid to the brokerage, or changed to a form that is allowed.'),
    ('ul', ['**Real estate licensees.** Partner will make any disclosure to a client of the referral relationship and fee that the law, the broker or the listing / buyer agreement requires, and will not condition any real estate service on using GrayCo.',
            '**Insurance agents and producers.** Partner will not adjust, negotiate or advocate an insurance claim for GrayCo or for compensation unless Partner holds the license that allows it. Partner will not pay, waive, rebate or promise to waive any insurance deductible, and will not tell anyone GrayCo will do so.',
            '**Property managers.** Partner will disclose the referral relationship and fee to the property owner or association where required, and will not give GrayCo work in return for a fee that the owner has not been told about.']),
    ('h', '6. Honest, fair referrals'),
    ('ul', ['Partner will tell each Referred Person that Partner may receive a fee or credit from GrayCo and that the person is free to get other bids. Partner will not pressure anyone.',
            'Partner will not make claims about price, scope, timing, warranty, license or insurance outcome beyond what GrayCo has put in writing, and will not guarantee that any claim will be approved.',
            'Partner may use only GrayCo marketing materials, logo and license numbers that GrayCo has given Partner. GrayCo may withdraw permission at any time.',
            'Partner will refer only people who have agreed to be contacted, and will not send automated calls, texts or e-mail on GrayCo\'s behalf.']),
    ('h', '7. Confidential information and customer data'),
    ('p', 'Partner will keep confidential the non-public information GrayCo shares (partner-page data, pricing, fee tiers, customer details) and use it only to perform this Agreement. GrayCo\'s partner page shows Partner only first name, last initial and project stage of Referred Persons. GrayCo will handle information about Referred Persons under its Privacy Policy.'),
    ('h', '8. Term and ending'),
    ('p', 'This Agreement continues until either party ends it by written notice (e-mail is enough). Ending the Agreement does not cancel a fee already earned on a job that was contracted before the notice, unless Partner has breached this Agreement.'),
    ('h', '9. Insurance, indemnity and limits'),
    ('p', 'Each party will be responsible for its own acts and will indemnify the other against third-party claims, including reasonable attorneys\' fees, to the extent caused by its own breach of this Agreement, negligence or violation of law. Neither party is liable to the other for indirect, special or consequential damages. GrayCo\'s total liability under this Agreement will not exceed the fees due to Partner in the 12 months before the claim.'),
    ('h', '10. General'),
    ('p', 'Tennessee law governs this Agreement. Venue is in the state or federal courts for Shelby County, Tennessee. In a dispute the prevailing party recovers its reasonable attorneys\' fees and costs. This is the whole agreement about referrals; changes must be written and signed or accepted by e-mail from the Partner\'s address on file. Partner may not assign it without GrayCo\'s consent. If a part is unenforceable the rest stays in effect. The parties may sign electronically and in counterparts.'),
    ('sigs', 'Partner', 'GrayCo Construction Services, LLC'),
], subtitle='Realtors · insurance agents · property managers · other partners',
  flags=['Real-estate licensing: TN Real Estate Commission, MS Real Estate Commission and Arkansas Real Estate Commission rules on compensation to licensees (payment only through the broker, disclosure to clients, no kickbacks) and whether a fee on non-real-estate services (roofing / remodeling) to a realtor is allowed. RESPA Section 8 if any mortgage-related transaction is involved.',
         'Insurance licensing: whether paying an insurance agent / producer a fee for a referral that becomes a claim job is allowed in TN, MS, AR; unlicensed public-adjusting rules; deductible rebate / waiver statutes in all three states.',
         'Property managers: broker licensing for managers, owner / association disclosure of the fee, and HOA conflict-of-interest rules.',
         'The CRM warns when a fee is approved for a realtor or insurance partner ("keep it within license rules — a gift card or credit may be the safe form"); please confirm which forms are safe.',
         'Whether the fee should be payable to the brokerage by default for realtors; W-9 / 1099 handling.',
         'Fee amounts are fields the owner sets (per partner, or a default per partner type).'],
  who='Realtors, insurance agents, property managers and other referral partners.',
  where='Marketing → 🤝 Referral partners (partner list, fees, payouts); partner page (partner.html); website partner sign-up.')

# ====================================================================================================================
# 3. COUPON TERMS
# ====================================================================================================================
D('coupon_terms', 'GrayCo $100 Coupon Terms', 'Marketing & Referrals', MKT, True, [
    ('p', 'These terms apply to the **GrayCo $100 coupon** offered by GrayCo Construction Services, LLC ("GrayCo"), {company_address}, (901) 585-0944, by QR code, flyer, truck, sponsorship, e-mail or any other way. By claiming or using a coupon you agree to them.'),
    ('ul', ['**Value.** $100 off the contract price of GrayCo work on a project over $1,000. [[Offer amount and project minimum — set by GrayCo]]',
            '**Expiration.** The coupon expires **90 days after the date it was issued** [[default 90 days — GrayCo may change]]. The expiration date is shown on the coupon and in the e-mail we send you. An expired coupon has no value.',
            '**How to use.** Give the coupon code to your GrayCo project manager or the office before your estimate is accepted or your contract or invoice is final, and on or before the expiration date. The work itself may be completed after that date as scheduled.',
            '**One per household.** One coupon per household (same e-mail, phone number or address), and one use per coupon. A coupon works once and is then used up. Extra claims from the same household are not honored.',
            '**Not combinable.** Not valid with another coupon, discount, promotion, or special offer. GrayCo referral credit may be used with it.',
            '**No cash value.** Not redeemable for cash and no change is given. The coupon has no value if the project is cancelled or refunded, and it is not reinstated.',
            '**Not for insurance money.** It cannot be applied to an insurance deductible, to an amount an insurance company pays or owes, or to emergency services that insurance will pay for.',
            '**Not transferable or for sale.** Do not copy, sell, trade, post or bulk-distribute the code. A copied, altered or sold coupon is void. GrayCo may check any code before honoring it.',
            '**Taxes.** The discount reduces the contract price before sales tax where tax applies [[GrayCo to confirm how tax is figured]].',
            '**Void where prohibited.** The offer is void where prohibited or restricted by law. GrayCo may end or change the offer at any time, but will honor coupons already issued until they expire.',
            '**Contact.** Claiming a coupon lets GrayCo contact you about your project. It is not consent to marketing texts; texts need your separate, unchecked permission.']),
    ('p', 'Coupon administered by GrayCo Construction Services, LLC. Licensed general contractor · TN · MS · AR.'),
], subtitle='$100 off GrayCo work on projects over $1,000',
  flags=['Expiration: the CRM now stamps each new coupon with an expiration date (default 90 days, setting in Marketing → 🎟 Coupons) and refuses redemption after it. Coupons claimed before this change have no expiration date and stay valid. Please confirm that is acceptable and whether TN / MS / AR gift-certificate or unclaimed-property rules apply to a promotional coupon.',
         'The "not valid on insurance-paid work or toward a deductible" exclusion is new; please confirm it and the deductible-waiver rules.',
         'One-per-household uses e-mail, phone or address matching.',
         'Sales-tax wording ("discount reduces the price before tax").'],
  who='Anyone who claims or is given a GrayCo $100 coupon.',
  where='coupon.html (QR claim page), the coupon e-mail, Marketing → 🎟 Coupons. Print or send from 📚 Company Documents.')

# ====================================================================================================================
# 4. GIVEAWAY OFFICIAL RULES  (the default text used by giveaway.html and the CRM giveaway editor is built from this)
# ====================================================================================================================
RULES_BLOCKS = [
    ('p', '**NO PURCHASE OR PAYMENT OF ANY KIND IS NECESSARY TO ENTER OR WIN. A PURCHASE WILL NOT IMPROVE YOUR CHANCES OF WINNING.** Void where prohibited.'),
    ('h', '1. Sponsor'),
    ('p', 'The GrayCo Monthly Giveaway (the "Giveaway") is sponsored by GrayCo Construction Services, LLC, {company_address}, (901) 585-0944 ("Sponsor"). It is not sponsored, endorsed or administered by, or associated with, Facebook, Instagram, Google or any other social network.'),
    ('h', '2. Eligibility'),
    ('p', 'Open only to individuals who are (a) legal residents of Tennessee, Mississippi or Arkansas, and (b) 18 years of age or older at the time of entry. Employees, owners, officers, subcontractors and sales representatives of Sponsor, and members of their immediate families or households, are not eligible. Void where prohibited by law. By entering you confirm that you meet these requirements.'),
    ('h', '3. Entry Period'),
    ('p', 'The entry period begins at 12:00 a.m. Central Time on **[[START DATE]]** and ends at 11:59 p.m. Central Time on **[[END DATE]]** (the "Entry Period").'),
    ('h', '4. How to Enter'),
    ('ul', ['**Online (free).** Go to the GrayCo giveaway entry page (the link on grayco-cs.com or in GrayCo\'s posts), complete the entry form (name, e-mail, ZIP code; phone is optional), tick the box confirming you are 18 or older, live in TN, MS or AR and agree to these rules, and submit.',
            '**By mail, without using the website (free).** Print your name, address (with ZIP code), phone and e-mail on a plain 3.5 x 5 inch card, and mail it in a stamped envelope to: GrayCo Giveaway, {company_address}. It must be postmarked within the Entry Period and received within 7 days after it ends.',
            'Limit: one entry per person per month, by any method. Duplicate entries, and entries made by scripts, bots or entry services, are void. Entries must be made by the entrant personally.',
            'Optional boxes on the entry form (joining GrayCo News by e-mail, following GrayCo on Facebook) are unchecked, separate from entry, and do not change your chances of winning. Entry never requires liking, sharing, tagging or following any account.']),
    ('h', '5. Prize and Value'),
    ('p', 'One (1) prize: **[[PRIZE]]**. Approximate retail value: **[[PRIZE VALUE]]**. The prize has no cash value, may not be exchanged, transferred or redeemed for cash, and must be used within 90 days of notification at an address in Sponsor\'s service area. If it cannot be awarded as described, Sponsor may substitute a prize of equal or greater value. The winner is responsible for all taxes and any other costs not stated here.'),
    ('h', '6. Odds'),
    ('p', 'Odds of winning depend on the number of eligible entries received in the Entry Period.'),
    ('h', '7. Winner Selection and Notification'),
    ('p', 'The winner will be selected by a random drawing from all eligible entries received, within seven (7) days after the Entry Period ends (about **[[DRAW DATE]]**). The drawing is done in Sponsor\'s system and logged (who, when and a random seed) so it can be re-checked. The winner will be notified by e-mail at the address on the entry. The winner must reply within fourteen (14) days and sign and return an Affidavit of Eligibility and Liability / Publicity Release. If a winner does not reply in time, cannot be reached, is not eligible, or does not return the signed affidavit, the prize is forfeited and an alternate winner may be drawn.'),
    ('h', '8. Publicity'),
    ('p', 'Except where prohibited, by accepting the prize the winner permits Sponsor to use the winner\'s name, city and state, voice, photograph and statements about the prize for advertising and promotion in any media, without notice, approval or compensation.'),
    ('h', '9. Privacy'),
    ('p', 'Sponsor will use the information you provide to run the Giveaway, to tell the winner, and, if you tick the optional box, to send GrayCo News (you can unsubscribe at any time). Entering does not sign you up for marketing text messages. See the GrayCo Privacy Policy at grayco-cs.com.'),
    ('h', '10. General Conditions'),
    ('p', 'Sponsor may disqualify anyone who tampers with the entry process or breaks these rules, and may cancel, change or suspend the Giveaway if fraud, technical failure or any other cause beyond its control affects fairness or security. Sponsor is not responsible for late, lost, misdirected or incomplete entries, or for any technical failure. To the fullest extent the law allows, entrants release Sponsor and its owners, employees and agents from claims arising from the Giveaway or the prize. Nothing in these rules limits liability that cannot be limited by law.'),
    ('h', '11. Governing Law and Disputes'),
    ('p', 'These rules and the Giveaway are governed by Tennessee law, without regard to conflict-of-law rules. Disputes will be resolved in the state or federal courts for Shelby County, Tennessee, except where the law of your state of residence requires otherwise.'),
    ('h', '12. Winner List and Rules'),
    ('p', 'For the winner\'s first name and city, or a copy of these rules, send a stamped, self-addressed envelope to the Sponsor address above within 60 days after the draw.'),
]

D('giveaway_rules', 'Giveaway Official Rules', 'Marketing & Referrals', MKT, True, RULES_BLOCKS, subtitle='GrayCo Monthly Giveaway',
  flags=['Sweepstakes versus lottery: no purchase and no other consideration is required; entry is free online and by mail. Please confirm the mail-in entry wording and that TN, MS and AR need no registration or bond for these prize values (the CRM now stores the approximate retail value; the default prize is a free handyman hour).',
         'Eligibility is by self-certification (18+, resident of TN / MS / AR). The server also checks the ZIP code against TN, MS and AR ranges; it does not verify age.',
         'Entry dates and prize are fields the owner sets in Marketing → Giveaway; the public page fills them in.',
         'The newsletter box on the entry form is now unchecked by default and the server only joins GrayCo News when it is ticked. The winner e-mail now asks for the signed affidavit (14 days, matching the rules; it used to say 30).',
         'Publicity-release wording, winner-forfeit and 14-day reply, "prize used within 90 days", and the Shelby County venue.',
         'Prize taxes / information reporting threshold for prizes.'],
  who='Everyone who enters the monthly giveaway.',
  where='giveaway.html (entry page); Marketing → 🎁 Giveaway (rules editor). Print from 📚 Company Documents.')

# ====================================================================================================================
# 5. WINNER AFFIDAVIT
# ====================================================================================================================
D('giveaway_affidavit', 'Giveaway Winner Affidavit and Release', 'Marketing & Referrals', MKT, True, [
    ('p', '**AFFIDAVIT OF ELIGIBILITY AND LIABILITY / PUBLICITY RELEASE** — GrayCo Monthly Giveaway'),
    ('info', [['Giveaway month', '[[________________]]'], ['Prize', '[[________________]]'], ['Winner (print name)', '[[________________]]'],
              ['Address, city, state, ZIP', '[[________________]]'], ['Phone / e-mail', '[[________________]]']]),
    ('p', 'I, the winner named above, state under oath or affirmation that:'),
    ('ul', ['I am 18 years of age or older and a legal resident of the State of [[Tennessee / Mississippi / Arkansas]].',
            'I am not an employee, owner, officer, subcontractor or sales representative of GrayCo Construction Services, LLC ("Sponsor"), and I am not a member of the immediate family or household of any of them.',
            'I entered the Giveaway myself, once for the month stated, and I followed the Official Rules. I did not pay or buy anything to enter or win.',
            'I accept the prize as described in the Official Rules. I understand it has no cash value, may not be transferred or exchanged, and must be used within 90 days at an address in Sponsor\'s service area.',
            'I am responsible for all taxes on the prize. I will give Sponsor a Form W-9 if Sponsor asks for one.']),
    ('h', 'Liability release'),
    ('p', 'In exchange for the prize, I release and hold harmless Sponsor, its owners, employees, agents and contractors from any claim, loss, injury, damage or liability arising out of the Giveaway or my acceptance, use or misuse of the prize, except for loss caused by their gross negligence or intentional misconduct, and except where the law does not allow this release. If the prize involves work at my property, the work is subject to Sponsor\'s written estimate and work terms, and Sponsor\'s workmanship warranty, if any, is the only warranty.'),
    ('h', 'Publicity release'),
    ('p', 'I permit Sponsor to use my name, city and state, voice, photograph, video and statements about the prize and Sponsor for advertising and promotion in any media, without notice, approval or payment to me, and I release any claim for that use, except where prohibited by law.'),
    ('h', 'Other'),
    ('p', 'If I do not return this signed affidavit within 14 days after Sponsor notified me, or if any statement above is false, I forfeit the prize and an alternate winner may be chosen. These statements are governed by Tennessee law. I sign this affidavit freely.'),
    ('sigs', 'Winner', 'GrayCo Construction Services, LLC'),
    ('h', 'Notary acknowledgment (optional — use if Sponsor requires a notarized affidavit)'),
    ('p', 'State of ______________  County of ______________. Sworn to (or affirmed) and subscribed before me on ______________ by ______________________________, who proved to me through ______________ that he or she is the person named above.'),
    ('p', 'Notary Public: ______________________________  My commission expires: ______________'),
], subtitle='Eligibility · liability release · publicity release',
  flags=['Release of liability and publicity: enforceability in TN / MS / AR; the carve-out for gross negligence; whether a notarized affidavit is required or the plain signed form is enough.',
         'Whether to require the affidavit for very low-value prizes (e.g., a free handyman hour).',
         'If a minor or a household member claims a prize: not allowed under the rules; confirm.'],
  who='The monthly giveaway winner.',
  where='Sent to the winner by the office after the draw (Marketing → 🎁 Giveaway → winner e-mail), or printed from 📚 Company Documents.')

# ====================================================================================================================
# 6-8. NOTICE OF INTENT TO LIEN (TN / MS / AR)  — office-send only, never automatic
# ====================================================================================================================
def lien_notice(state, state_name, statute, recorder, extra_para, flag, note):
    D('lien_notice_' + state.lower(), 'Notice of Intent to Lien — %s' % state_name, 'Collections', ALL, True, [
        ('p', '{date}'),
        ('p', '**VIA CERTIFIED MAIL, RETURN RECEIPT REQUESTED** [[and first-class mail / e-mail / hand delivery]]'),
        ('p', '{customer}\n[[Owner mailing address]]'),
        ('info', [['Project', '{job_name}'], ['Property address', '{job_address}'], ['Contract / PO #', '{po}'], ['Contract date', '[[________]]'], ['Last day work was done / project completed', '[[________]]'],
                  ['Amount unpaid', '[[$ ________]]']]),
        ('p', '**NOTICE OF INTENT TO FILE A LIEN**'),
        ('p', 'Dear {customer}:'),
        ('p', 'GrayCo Construction Services, LLC ("GrayCo") performed labor and furnished materials and services to improve the property at the address above under our contract with you. GrayCo has sent you invoices and reminders. As of the date of this notice the amount stated above remains unpaid. A statement of the invoices is [[attached / enclosed]].'),
        ('p', '**GrayCo demands payment of the unpaid amount within [[__]] days of the date of this notice.** If GrayCo does not receive payment, or contact you and GrayCo agree in writing on a payment plan, within that time, GrayCo intends to record a lien against the property under %s, without further notice, and may also pursue its other remedies, including interest or a late charge of 1.5%% per month (18%% annual percentage rate) or the maximum rate allowed by law, whichever is less, and its attorneys\' fees and costs as the contract allows.' % statute),
        ('p', extra_para),
        ('p', 'To pay: a check made out to GrayCo Construction Services, LLC, delivered to {pm} or mailed to us, or call (901) 585-0944 for ACH instructions. Questions about the balance: {billing_email}. If you believe the amount is wrong, or you have already paid, send us the details or proof right away and we will review it promptly. This notice is not a threat to harm anyone; it tells you what GrayCo may do to protect its payment rights.'),
        ('p', 'Sincerely,\n\nGrayCo Construction Services, LLC\n{license}\n(901) 585-0944 · {billing_email}'),
    ], subtitle='%s — office use; never sent automatically' % state_name, flags=[flag], admin_note=note,
      who='A property owner who has not paid GrayCo (%s project).' % state_name,
      where='Created and sent by the office from 📚 Company Documents / a job\'s Documents (📧 Send goes to ✅ Approvals). Nothing in the CRM sends it automatically.')


lien_notice('TN', 'Tennessee', 'Tennessee\'s mechanics\' and materialmen\'s lien law, Tenn. Code Ann. § 66-11-101 et seq.', 'Register of Deeds',
            'The lien would be recorded in the Register of Deeds office for the county where the property is located, and a lien does not by itself transfer ownership of your property. A lien may later be enforced by a lawsuit, which could lead to a court-ordered sale of the property to pay the debt. You may be able to remove a recorded lien by paying the debt or by posting a bond as the law allows.',
            'TN: please confirm (1) the deadline to record a notice of lien (our understanding: within 90 days after completion or termination of the contract, Tenn. Code Ann. § 66-11-112), (2) the deadline to sue to enforce (our understanding: one year after the notice of lien is recorded, § 66-11-201), (3) whether the original contractor must send any owner notice before recording, and any special residential-owner notice, (4) the content a notice of lien must contain, and (5) the lien effect on the owner\'s title.',
            'TN statutory timing — counsel to confirm before use: notice of lien must be recorded within the statutory period after the work ends (our understanding: 90 days); suit within one year of recording. Do not let this letter delay recording. Fill [[__]] days (counsel).')
lien_notice('MS', 'Mississippi', 'Mississippi\'s construction lien statutes, Miss. Code Ann. § 85-7-401 et seq.', 'Chancery Clerk',
            'The lien would be filed with the Chancery Clerk of the county where the property is located, and it affects the property until it is paid, released, or discharged by law. A lien may be enforced by a lawsuit filed within the time the statute allows. [[Counsel: insert any required notice-to-owner text for Mississippi.]]',
            'MS: please confirm (1) the deadline to file a lien (our understanding that the claim must be filed within a short statutory window after the last work, and a suit to enforce within the period the statute sets, Miss. Code Ann. §§ 85-7-405 to -409), (2) whether a prior written notice or "stop notice" to the owner is required of an original contractor, (3) what the filing must contain, and (4) residential-owner protections.',
            'MS statutory timing — counsel to confirm before use: how long after the last work a lien must be filed and enforced, and any prior-notice rule. Fill [[__]] days (counsel).')
lien_notice('AR', 'Arkansas', 'Arkansas\'s lien statutes, Ark. Code Ann. § 18-44-101 et seq.', 'Circuit Clerk',
            'Arkansas law requires a written notice before a lien is filed on some projects. This letter is that notice, delivered at least [[10]] days before GrayCo files. The lien would be filed with the Circuit Clerk of the county where the property is located. [[Counsel: insert the exact Arkansas notice-of-intent wording and delivery method (certified mail, return receipt).]]',
            'AR: please confirm (1) the pre-lien notice of intent (our understanding: written notice by certified mail a set number of days, believed to be 10, before filing; Ark. Code Ann. § 18-44-115 / -117 area), (2) the deadline to file the lien (our understanding: 120 days after the last work for an original contractor) and to sue, (3) the content and form of the notice, and (4) the residential pre-construction notice already used in the CRM (§ 18-44-115).',
            'AR statutory timing — counsel to confirm before use: a prior notice of intent (days before filing, delivery method) and the filing deadline. Fill [[__]] days (counsel).')

# ====================================================================================================================
# 9. FINAL DEMAND LETTER
# ====================================================================================================================
D('final_demand', 'Final Demand Letter', 'Collections', ALL, True, [
    ('p', '{date}'),
    ('p', '**VIA CERTIFIED MAIL, RETURN RECEIPT REQUESTED** [[and first-class mail / e-mail]]'),
    ('p', '{customer}\n[[Mailing address]]'),
    ('info', [['Project', '{job_name}'], ['Property address', '{job_address}'], ['Contract / PO #', '{po}'], ['Invoice number(s)', '[[________]]'], ['Original due date(s)', '[[________]]'],
              ['Balance now due', '[[$ ________]]']]),
    ('p', '**FINAL DEMAND FOR PAYMENT**'),
    ('p', 'Dear {customer}:'),
    ('p', 'GrayCo Construction Services, LLC ("GrayCo") completed the work on your project as agreed. Our records show the invoices listed above remain unpaid. We sent reminders on [[dates]] and called on [[dates]]. This is our final request before we take further steps.'),
    ('p', '**Please pay the balance above within [[10]] days of the date of this letter.** Under your contract, unpaid invoices accrue a late charge of 1.5% per month (18% annual percentage rate) on the past-due balance, or the maximum rate allowed by law, whichever is less, and the prevailing party in a collection action recovers its reasonable attorneys\' fees and costs.'),
    ('p', 'If we do not receive payment, or hear from you and agree on a payment plan in writing, within that time, GrayCo may, without further notice: (1) refer the account to an attorney; (2) file suit to collect the balance, late charges, court costs and attorneys\' fees; and (3) protect its payment rights, including recording a lien on the property where the law allows. [[Counsel: include any state-required pre-suit or pre-lien notice language.]]'),
    ('p', 'We would rather resolve this with you. If you cannot pay in full, call us at (901) 585-0944 or write to {billing_email} right away so we can talk about a payment plan. If you believe any part of the balance is wrong, or you have already paid, send us the details or proof and we will review it promptly. A copy of each unpaid invoice is [[attached]].'),
    ('p', 'To pay: a check made out to GrayCo Construction Services, LLC, delivered to {pm} or mailed to us, or call for ACH instructions.'),
    ('p', 'Sincerely,\n\nGrayCo Construction Services, LLC\n{license}\n(901) 585-0944 · {billing_email}'),
], subtitle='Last letter before attorney referral / lien — office use; never sent automatically',
  flags=['Late charge: 1.5% per month or the maximum allowed by law, whichever is less (same wording as the contracts, invoices, proposals and past-due e-mails). Please confirm the legal maximum in TN, MS and AR (see cover note).',
         'Consumer vs commercial customers: FDCPA does not apply to GrayCo collecting its own debts, but state collection and home-improvement rules may; whether any consumer-specific wording is needed for residential owners.',
         'Whether the letter should state a deadline in days or a date; whether to add a "payment plan" offer; and whether threatening a lien or suit in the same letter is consistent with the state notice rules.',
         'Attorney fees are "prevailing party" (mutual), matching the contract and invoice wording.'],
  admin_note='Office use only: this letter is never sent automatically. Sending goes through ✅ Approvals. Check the lien deadline for the state before using the "30 days" style cure period.',
  who='A customer with a long past-due invoice (after the reminder e-mails and a call).',
  where='Created and sent by the office from 📚 Company Documents / a job\'s Documents. Nothing in the CRM sends it automatically.')

# ====================================================================================================================
# 10. EMPLOYEE HANDBOOK  (admin-only HR category)
# ====================================================================================================================
D('handbook', 'Employee Handbook', 'HR', ['hr'], False, [
    ('p', 'Welcome to GrayCo Construction Services, LLC ("GrayCo"). This handbook explains how we work together. It is a guide, not a contract. GrayCo may change it at any time with notice. If anything here conflicts with the law, the law controls. Items in [[brackets]] are set by GrayCo.'),
    ('h', '1. At-will employment'),
    ('p', 'Employment with GrayCo is at will. That means you or GrayCo may end the employment at any time, with or without cause or notice. Nothing in this handbook, an offer letter, or anything said by a supervisor creates a contract for any length of employment. Only the owners, in a signed writing, can change at-will status.'),
    ('h', '2. Equal employment opportunity'),
    ('p', 'GrayCo provides equal employment opportunity to all employees and applicants. We do not discriminate on the basis of race, color, religion, sex (including pregnancy), national origin, age, disability, genetic information, veteran or military status, or any other status protected by federal, state or local law. This applies to hiring, pay, training, promotion, discipline and ending employment. GrayCo will provide reasonable accommodation for a disability or a sincerely held religious belief unless it would cause undue hardship. Tell your supervisor or an owner if you need one.'),
    ('h', '3. Harassment-free workplace and how to report'),
    ('p', 'GrayCo does not tolerate harassment — sexual or otherwise — or bullying by anyone (employees, customers, subcontractors or vendors) on a jobsite, in the office, in a vehicle, or online. This includes unwelcome comments, jokes, touching, images, messages or threats about a protected status. Report any concern to your supervisor, to an owner ([[Owner name / phone]]), or to [[HR contact]]. You may skip your supervisor if that person is involved. GrayCo will look into every report promptly and as privately as possible, and will act. **GrayCo does not allow retaliation** against anyone who reports in good faith or takes part in an investigation. Employees who violate this policy may be disciplined, up to ending employment.'),
    ('h', '4. Jobsite and office safety'),
    ('ul', ['Safety comes first. You have the authority and the duty to stop work you believe is unsafe, and you will not be punished for doing so. Tell your project manager at once.',
            'Follow OSHA rules and GrayCo training: fall protection on roofs and elevated work, ladders, scaffolds, electrical and lockout safety, silica, lead and asbestos awareness, respiratory protection, heat and cold stress, and hazard communication.',
            'Wear the required PPE (hard hat, eye protection, gloves, boots, harness and high-visibility clothing where required). Do not remove guards or safety devices.',
            'Report every injury, near-miss, property damage and vehicle accident to your supervisor immediately and no later than the end of your shift [[or within 24 hours]]. Get medical care when needed. Workers\' compensation covers work injuries; GrayCo will not retaliate for a claim.',
            'No horseplay, fighting, weapons on jobsites or in company vehicles (except as the law allows for a lawfully carried firearm kept secured in a personal vehicle), or unsafe shortcuts.',
            'Keep the site clean, protect customers\' property, and keep unauthorized people off active work areas.']),
    ('h', '5. Drug- and alcohol-free workplace'),
    ('p', 'You may not use, possess, sell, distribute or be under the influence of alcohol, illegal drugs, or misused prescription or over-the-counter drugs while on duty, on a jobsite, in a company vehicle, or on company time. This includes marijuana and cannabis products, whether or not legal under state law, while on duty or in a way that affects your work. Tell your supervisor if a lawfully prescribed medicine may affect your safety (you do not have to name the medicine or condition to your supervisor). GrayCo may test for drugs and alcohol in the following cases, as the law allows: [[pre-employment / reasonable suspicion / after an accident or injury / random for safety-sensitive roles]]. A positive or refused test, or a violation of this policy, may result in discipline up to ending employment. GrayCo may refer employees to an assistance program where available.'),
    ('h', '6. Company vehicles, driving and phones'),
    ('ul', ['Only authorized employees with a valid license and acceptable driving record may drive a company vehicle. GrayCo may check your motor vehicle record at hire and each year. Tell us at once if your license is suspended or revoked.',
            'Company vehicles are for company business [[and limited personal use as GrayCo allows in writing]]. Keep them clean and locked, wear seat belts, obey traffic laws, and never drive impaired or fatigued. You are responsible for tickets and parking fines you receive.',
            'Do not use a handheld phone, text, e-mail, use the CRM or social media while driving. Use hands-free features only if the law allows, and pull over when it is not safe.',
            'If you use your own vehicle for company business, you must have the insurance the law requires. GrayCo will reimburse mileage at [[rate]] per mile when you submit it.',
            'Report any accident right away, take photos, and do not admit fault or sign anything except to police and GrayCo.']),
    ('h', '7. Phones, e-mail, the CRM and technology'),
    ('p', 'Company phones, e-mail, the CRM, customer portal, job photos and files belong to GrayCo and are for business use. You should have no expectation of privacy in them, and GrayCo may monitor and review them as the law allows. Use your own login and never share your password. Do not forward company information to personal accounts or apps. Personal phone use on the job is limited to breaks and emergencies and may never interfere with safety or customer service. Photos and videos of customers\' homes, people, vehicles, documents or belongings are for work use only and may not be posted or shared on personal social media.'),
    ('h', '8. Timekeeping and pay'),
    ('ul', ['Hourly (non-exempt) employees must record all time worked accurately, in the CRM time clock, when you start and stop work, [[including travel time paid by GrayCo policy]]. Never work "off the clock". Tell your supervisor right away if you were not paid for all time worked.',
            'Overtime (over 40 hours in a work week) must be approved in advance by your supervisor and is paid at one and one-half times your regular rate as the law requires. Meal and rest breaks: [[GrayCo break policy — e.g., 30-minute unpaid meal break for shifts over six hours]].',
            'Review your time each pay period. If you find an error, tell your supervisor or [[payroll contact]] and it will be corrected. Falsifying your own or another person\'s time is a serious violation.',
            'Pay periods, pay days and direct deposit: [[pay schedule]]. Deductions are limited to those required by law or that you authorize in writing. Your pay stub is in [[location]].',
            'Exempt (salaried) employees are paid according to the law and the offer letter.']),
    ('h', '9. Paid time off and holidays'),
    ('p', '[[PTO policy — GrayCo to fill in: who is eligible, how it accrues (hours per pay period or per year), carry-over cap, notice and approval rules, and whether unused time is paid at separation.]] [[Paid holidays: list.]] [[Sick leave: policy.]] Unpaid leave required by law (such as military leave, jury duty, and FMLA if GrayCo is covered) will be provided as the law requires. Requests for time off must be made to your supervisor [[__ days]] in advance.'),
    ('h', '10. Confidentiality and company property'),
    ('p', 'During and after your employment, keep confidential GrayCo\'s non-public business information: customer lists and contact data, pricing, estimates, margins, bid information, subcontractor and supplier terms, insurance-claim files, CRM data, and anything marked confidential. Use it only for GrayCo work. Some employees sign a separate Confidentiality & Non-Solicitation Agreement. **This policy does not stop you from discussing your own wages, hours or working conditions with co-workers or others, from reporting a legal violation to a government agency, or from any right protected by law.** Return all GrayCo property (keys, tools, devices, vehicle, ID, files, photos) when you leave.'),
    ('h', '11. Conduct, conflicts of interest and customers'),
    ('p', 'Treat customers, co-workers and the public with respect. Do not take or ask for tips, gifts, side jobs or payments from a customer or subcontractor for GrayCo work without approval. Disclose any outside work or business that competes with GrayCo or could conflict with your duties. Customer homes are private: do not use a customer\'s property, tools, utilities, or restroom without permission, and do not make promises about price, schedule, warranty or insurance coverage that you are not authorized to make. Dress and grooming should be neat and safe for the work; wear the GrayCo uniform or logo clothing where provided.'),
    ('h', '12. Attendance and discipline'),
    ('p', 'Be on time and ready to work. If you will be late or absent, call your supervisor before your shift starts. Repeated or unreported absences may lead to discipline. GrayCo may use coaching, written warnings, suspension or ending employment, in any order that fits the situation. Nothing here limits GrayCo\'s right to end employment at will.'),
    ('h', '13. Open door and complaints'),
    ('p', 'If you have a question, safety concern or complaint, talk to your supervisor first, and if that does not help, to an owner. You will not be retaliated against for raising a concern in good faith.'),
    ('h', '14. Leaving GrayCo'),
    ('p', 'Please give at least [[two weeks]] notice if you resign. Your final pay will be issued as the law requires. Return all company property. Benefits, if any, end as described in the plan documents.'),
    ('h', 'Acknowledgment'),
    ('p', 'I have received and read the GrayCo Employee Handbook. I understand that it is not a contract, that my employment is at will, and that GrayCo may change the handbook. I understand I can ask questions about any part of it.'),
    ('sigs', 'Employee', 'GrayCo representative'),
], subtitle='Concise handbook — at-will · EEO / anti-harassment · safety · drug and alcohol · vehicle / phone · timekeeping · PTO · confidentiality', admin_only=True,
  flags=['Handbook is intentionally short. Counsel to confirm the at-will statement and the "not a contract" disclaimer (TN, MS, AR).',
         'EEO / anti-harassment: federal (Title VII, ADA, ADEA) and state law coverage by employee count; TN Human Rights Act, TN Pregnant Workers Fairness Act, MS and AR equivalents; an anti-retaliation statement is included.',
         'Drug and alcohol: whether to adopt a TN Drug-Free Workplace program (Tenn. Code Ann. § 50-9-101 et seq., workers\' comp premium discount), testing triggers, treatment of lawful marijuana / medical cannabis in MS and AR, reasonable-suspicion and post-accident testing, and notice requirements.',
         'Timekeeping and overtime: FLSA exempt vs non-exempt classification of PMs, estimators and crew leads; travel time; meal / rest break rules (TN requires a 30-minute break for shifts over six hours for employees; MS and AR have no general rule — please confirm).',
         'Firearm statement (TN employee-parking-lot law, Tenn. Code Ann. § 39-17-1313 / § 50-1-312): wording to be confirmed.',
         'NLRA Section 7: the confidentiality and phone / photo / social media sections include a wage / working-conditions carve-out; please check.',
         'PTO, holidays, sick leave and mileage rate are blank fields for the owner; FMLA applies at 50 or more employees.',
         'Workers\' compensation: injury reporting timeline; no retaliation for a claim; TN construction-industry coverage and exemption rules for owners.'],
  who='Every GrayCo employee (one copy, signed acknowledgment kept in the personnel file).',
  where='HR category of 📚 Company Documents — visible to admins only. Give each new hire a copy with the offer letter paperwork (W-4, I-9).')

# ====================================================================================================================
# 11. CONFIDENTIALITY & NON-SOLICITATION AGREEMENT  (narrow non-compete for PMs / estimators)
# ====================================================================================================================
D('conf_nonsolicit', 'Confidentiality & Non-Solicitation Agreement', 'HR', ['hr'], False, [
    ('p', 'This Agreement is between GrayCo Construction Services, LLC ("GrayCo") and the employee named below ("Employee"). It is signed in exchange for Employee\'s employment or continued employment, GrayCo\'s promise to give Employee access to its confidential information, customer relationships and training, and [[other consideration, if any, e.g., a signing bonus]], which Employee agrees is enough.'),
    ('info', [['Employee', '[[________________]]'], ['Position', '[[ ] Project Manager   [ ] Estimator   [ ] Other: ________]]'], ['Start date / date signed', '[[________________]]']]),
    ('h', '1. Confidential Information'),
    ('p', '"Confidential Information" means non-public information about GrayCo\'s business, including customer and prospect lists and contact details, insurance-claim and project files, estimates, pricing and margin data, bid strategy, subcontractor and supplier terms, marketing plans, software and the CRM, financial results, and trade secrets. It does not include information that is public through no fault of Employee, was known to Employee before employment, or that Employee has a legal right to disclose.'),
    ('h', '2. Employee\'s duties'),
    ('p', 'During employment and afterward, Employee will use Confidential Information only for GrayCo\'s business and will not disclose it to anyone outside GrayCo without written permission. Employee will return or delete all Confidential Information and company property when employment ends, and will not keep copies. Confidentiality of a trade secret lasts as long as the information remains a trade secret; other Confidential Information, [[three (3)]] years after employment ends.'),
    ('h', '3. Protected rights — what this Agreement does not prohibit'),
    ('ul', ['Employee may discuss his or her own wages, hours and working conditions, and may take part in activity protected by law, including with co-workers, a union, or a government agency.',
            'Employee may report possible violations of law to any government agency, and cooperate in an investigation, without notice to GrayCo.',
            '**Defend Trade Secrets Act notice (18 U.S.C. § 1833(b)).** An individual is not liable under any federal or state trade-secret law for disclosing a trade secret (a) in confidence to a government official or an attorney solely to report or investigate a suspected violation of law, or (b) in a complaint or other document filed under seal in a lawsuit. An individual who sues an employer for retaliation for reporting a suspected violation may use the trade secret in the proceeding and disclose it to his or her attorney, if the document containing it is filed under seal and not disclosed except by court order.']),
    ('h', '4. Non-solicitation of customers'),
    ('p', 'For [[twelve (12)]] months after employment ends, Employee will not, directly or through others, solicit or accept work (roofing, restoration, remodeling, repair or general construction) from any **customer or active prospect of GrayCo with whom Employee dealt, or about whom Employee obtained Confidential Information, during the last 24 months of employment**, for a business that competes with GrayCo. General advertising not aimed at those customers does not break this paragraph.'),
    ('h', '5. Non-solicitation of employees and subcontractors'),
    ('p', 'For [[twelve (12)]] months after employment ends, Employee will not solicit or hire away any GrayCo employee, or encourage any subcontractor, supplier or vendor to end or reduce its work with GrayCo. General job advertising not aimed at GrayCo employees does not break this paragraph.'),
    ('h', '6. Limited non-competition (Project Managers and Estimators only)'),
    ('p', 'This paragraph applies only if Employee\'s position above is Project Manager or Estimator. For [[twelve (12)]] months after employment ends, Employee will not perform, in the Territory, the same kind of duties Employee performed for GrayCo in the last 24 months (managing, estimating or selling roofing, insurance-restoration, remodeling or commercial construction projects) for a business that competes with GrayCo. "Territory" means [[Shelby, Fayette, Tipton and Crittenden Counties and DeSoto County, Mississippi — or within __ miles of Bartlett, Tennessee]]. This paragraph does not stop Employee from working for a non-competing business, from being a passive investor in a public company, or from working outside the Territory. GrayCo agrees this paragraph protects its legitimate business interests in its Confidential Information, customer relationships and goodwill, and not just to avoid competition.'),
    ('h', '7. If GrayCo ends employment without cause'),
    ('p', '[[Option — counsel to decide: if GrayCo ends Employee\'s employment without cause, paragraph 6 applies only if GrayCo pays Employee ______ weeks of base pay during the restricted period / does not apply.]]'),
    ('h', '8. Remedies and reasonableness'),
    ('p', 'Employee agrees the restrictions are reasonable in time, area and scope. A court may reform any restriction it finds too broad to the extent allowed by law. The restricted periods are extended by any period in which Employee breaks them. GrayCo may seek a court order (injunction) in addition to damages. If a court finds that a party breached this Agreement, the prevailing party recovers its reasonable attorneys\' fees and costs.'),
    ('h', '9. Work product'),
    ('p', 'Estimates, templates, photos, reports, drawings and other work product that Employee creates for GrayCo belong to GrayCo.'),
    ('h', '10. General'),
    ('p', 'This Agreement does not change at-will employment. It is governed by Tennessee law, and the state or federal courts for Shelby County, Tennessee have venue. If part of it is unenforceable, the rest stays in effect. It is the whole agreement on these subjects and can be changed only in a signed writing. GrayCo may assign it to a successor to its business. Employee has had time to read it and to consult a lawyer of Employee\'s choice.'),
    ('sigs', 'Employee', 'GrayCo Construction Services, LLC'),
], subtitle='Confidentiality · non-solicitation · narrow non-compete for Project Managers and Estimators', admin_only=True,
  flags=['Non-compete: Tennessee enforces reasonable non-competes that protect a legitimate business interest; courts may reform an overbroad one. Please confirm consideration (continued employment / new bonus), duration (12 months), territory (blank) and scope, and the optional pay-if-terminated-without-cause paragraph. Check MS and AR rules for employees who live or work there (AR Code § 4-75-101; MS case law).',
         'Applies only to Project Managers and Estimators; non-solicit and confidentiality only for all other employees. Please confirm that structure and consider carve-outs for low-wage workers.',
         'Federal: the FTC non-compete rule was set aside by a federal court in 2024 and is not in force; please confirm current status. NLRA Section 7 carve-out (wages / working conditions) is included.',
         'DTSA whistleblower notice is included to preserve exemplary damages and fees.',
         'Customer non-solicit definition (customers the employee dealt with in the last 24 months) and the employee non-solicit.',
         'Attorneys\' fees: written as prevailing-party (mutual).'],
  who='Project Managers, Estimators and other employees with access to customer and pricing information.',
  where='HR category of 📚 Company Documents — visible to admins only. Sign at hire or with a new promotion; keep in the personnel file.')

# ====================================================================================================================
# 12. INDEPENDENT CONTRACTOR (1099) AGREEMENT
# ====================================================================================================================
D('contractor_1099', 'Independent Contractor (1099) Agreement', 'HR', ['hr'], False, [
    ('p', 'This Agreement is between GrayCo Construction Services, LLC ("GrayCo") and the individual or business named below ("Contractor"). It is for non-employee helpers and for short-term or occasional help. It is not for a licensed trade subcontractor on a full job — those use the GrayCo subcontract.'),
    ('info', [['Contractor (name / business)', '[[________________]]'], ['Address / phone / e-mail', '[[________________]]'], ['Business license / contractor license no., if any', '[[________________]]'],
              ['Services', '[[Describe: e.g., demolition labor, cleanup, hauling, painting prep]]'], ['Start date / end date or job', '[[________________]]'],
              ['Pay', '[[$ ____ per hour / per day / per job — as invoiced]]']]),
    ('h', '1. Independent contractor'),
    ('p', 'Contractor is an independent contractor and not an employee, partner or agent of GrayCo. Contractor decides how, when and in what order to do the work, within the schedule and quality the job requires, and uses Contractor\'s own tools, equipment and vehicle except [[items GrayCo supplies for safety or at its discretion]]. Contractor is free to work for others, may use helpers at its own cost, and is not guaranteed any hours or work. GrayCo will not train Contractor in how to do the work other than to explain the job result and jobsite safety rules. GrayCo does not provide benefits, paid time off, workers\' compensation (except as the law requires), or unemployment insurance to Contractor.'),
    ('h', '2. Payment and taxes'),
    ('p', 'GrayCo pays Contractor the pay above within [[__]] days after receiving Contractor\'s invoice (or written time / job sheet) that GrayCo approves. GrayCo does not withhold taxes. Contractor is responsible for all income, self-employment and other taxes, licenses and fees. Before the first payment Contractor will give GrayCo a completed Form W-9, and GrayCo will report payments on Form 1099 where required. If Contractor does not provide a W-9, GrayCo may be required to withhold.'),
    ('h', '3. Insurance and licensing'),
    ('p', 'Contractor will carry, at its cost, [[general liability insurance of at least $____ per occurrence]] and workers\' compensation coverage or a valid exemption as required by law, and will give GrayCo a certificate of insurance or the exemption before work starts. Contractor will have any license, registration or permit the law requires for the work it performs. Contractor will provide proof on request. If Contractor does not have the required coverage, GrayCo may treat that as a reason to end this Agreement at once.'),
    ('h', '4. Safety and conduct'),
    ('p', 'Contractor will follow applicable laws, OSHA rules and the safety rules of the jobsite, wear appropriate PPE, work free of alcohol and drugs, treat customers and their property with respect, protect customer property, and report any injury or damage the same day. Contractor may not work on a roof or at heights without proper fall protection and training. GrayCo may remove Contractor from a jobsite for unsafe or improper conduct.'),
    ('h', '5. Quality and warranty'),
    ('p', 'Contractor will perform the work in a good and workmanlike manner and will correct defective work at its own cost [[within __ days after notice]]. Contractor will leave the work area clean. Contractor does not have authority to talk to a customer about price, scope, change orders, insurance or warranty on GrayCo\'s behalf, or to sign anything for GrayCo.'),
    ('h', '6. Confidentiality and customers'),
    ('p', 'Contractor will keep confidential any customer, pricing and business information learned through the work and will use it only for the work. During this Agreement and for [[six (6)]] months after it ends, Contractor will not solicit GrayCo\'s customers on jobs Contractor worked on to do the same work directly, bypassing GrayCo. Contractor will not photograph or post customers\' homes, people or belongings except for work purposes. This paragraph does not limit Contractor\'s right to report violations of law to a government agency. **Defend Trade Secrets Act notice (18 U.S.C. § 1833(b)):** a person is not liable for disclosing a trade secret in confidence to a government official or attorney solely to report or investigate a suspected violation of law, or in a sealed court filing.'),
    ('h', '7. Indemnity and liens'),
    ('p', 'Contractor will indemnify and hold GrayCo harmless against claims, damage, injury and liability (including reasonable attorneys\' fees) caused by Contractor\'s or its helpers\' negligence, breach of this Agreement, or violation of law. Contractor will not allow any lien against the customer\'s property for its labor or materials, and will provide a lien waiver on request. GrayCo may withhold payment up to the amount of a lien claim until it is released.'),
    ('h', '8. Ending the Agreement'),
    ('p', 'Either party may end this Agreement at any time by notice (e-mail or text is enough). GrayCo will pay for approved work already done. GrayCo may end it immediately for unsafe work, breach, lack of insurance or license, or customer complaint. Contractor will return GrayCo property when the work ends.'),
    ('h', '9. General'),
    ('p', 'Tennessee law governs this Agreement, and the state or federal courts for Shelby County, Tennessee have venue. The prevailing party in a dispute recovers its reasonable attorneys\' fees and costs. This is the whole agreement about this work; changes must be in writing. Contractor may not assign it or use a subcontractor without GrayCo\'s approval. If a part is unenforceable the rest stays in effect. The parties may sign electronically.'),
    ('sigs', 'Contractor', 'GrayCo Construction Services, LLC'),
], subtitle='For non-employee helpers paid by Form 1099', admin_only=True,
  flags=['Misclassification: federal (IRS / DOL), TN, MS and AR tests for employee vs independent contractor, and the risk where helpers are directed by a GrayCo PM, use GrayCo tools, or work set hours for GrayCo. Counsel to confirm the factors in paragraph 1 and any limits on who may be paid this way.',
         'TN construction workers\' compensation rules for contractors / subcontractors (coverage or exemption), and the contractor-licensing threshold for subcontractors; AR and MS equivalents.',
         'Insurance minimums and proof; the indemnity clause (TN anti-indemnity limits in construction contracts); the lien-waiver and withholding clause.',
         'Customer non-solicit for six months; attorneys\' fees prevailing-party; DTSA notice included.',
         'This form complements the Master Subcontract Agreement, which another reviewer is drafting for licensed trade subcontractors.'],
  who='Non-employee helpers paid by Form 1099 (cleanup, hauling, demolition, general labor).',
  where='HR category of 📚 Company Documents — visible to admins only. Sign before the first day of work; collect a W-9 and certificate of insurance or exemption.')

# ====================================================================================================================
# 13. SURETY / BOND REQUEST LETTER
# ====================================================================================================================
D('bond_letter', 'Surety Bond Request Letter', 'Bonds & Surety', ['commercial'], False, [
    ('p', '{date}'),
    ('p', '[[Surety agent name]]\n[[Agency]]\n[[Address]]\n[[E-mail / phone]]'),
    ('info', [['Re', 'Bond request — GrayCo Construction Services, LLC'], ['Project', '{job_name}'], ['Project location', '{job_address}'], ['Owner / obligee', '{gc}'],
              ['Bid due date and time', '[[________]]'], ['Estimated contract amount', '{contract_amount}'], ['Bonds requested', '[[ ] Bid   [ ] Performance   [ ] Payment   [ ] Maintenance / warranty   [ ] Other]]'],
              ['Bond amount / penal sum', '[[____% of the bid / contract price, or $____]]'], ['Bond form required', '[[AIA A310 (bid) / AIA A312 (performance and payment) / owner form / federal SF-24 / SF-25 / SF-25A]]']]),
    ('p', 'Dear [[Agent name]]:'),
    ('p', 'GrayCo Construction Services, LLC ("GrayCo") is a licensed general contractor in Bartlett, Tennessee ({license}). We are bidding the project above and the bid documents require the bond(s) listed. Please issue the bond(s) and confirm that GrayCo has the surety capacity for this project, or tell us what you need to do so.'),
    ('p', 'Please send us: (1) a written statement of bonding capacity for this project (a single-project limit and the remaining aggregate limit); (2) the bond premium and any fees; (3) the bond form(s) for the owner to review, or confirmation that the owner\'s form is accepted; (4) a power of attorney / attorney-in-fact authority; and (5) any underwriting items you still need from us.'),
    ('p', 'We have [[attached / will send]] the bid documents and specifications, the bond form requirements, our current company financial statement, work-in-progress schedule, bank reference letter, company and key-personnel experience, and our contractor licenses. [[If an indemnity agreement is on file with the surety, note it here.]] Please let us know by [[date and time]] whether you can support this bid so we can meet the owner\'s deadline.'),
    ('p', 'If you also issue letters showing a surety\'s willingness to bond (a "bond letter" or "bondability letter"), please send one on the surety\'s letterhead for our file.'),
    ('p', 'Thank you,\n\n[[Authorized signer name and title]]\nGrayCo Construction Services, LLC\n(901) 585-0944 · {billing_email}'),
], subtitle='To the surety agent — bid, performance and payment bonds', admin_only=False,
  flags=['Internal-use template; no legal advice is given. Counsel to review the representations about GrayCo\'s capacity and the signer authority.',
         'Whether to attach financial statements and how to protect them; who is authorized to sign the general indemnity agreement.',
         'Federal (Miller Act) and state "Little Miller Act" bond thresholds for public work in TN, MS and AR (bid bond forms and percentages) — counsel to confirm.'],
  who='A surety / bond agent.',
  where='Office use for commercial and public bids. The CRM tracks a sub\'s "Bond Letter" document type; this is GrayCo\'s own request letter.')

# ====================================================================================================================
# 14. BID BOND REQUEST FORM
# ====================================================================================================================
D('bid_bond_form', 'Bid Bond Request Form', 'Bonds & Surety', ['commercial'], False, [
    ('p', 'Complete this form and send it to the surety agent with the bid documents. One form per bid.'),
    ('h', 'Principal (bidder)'),
    ('info', [['Legal name', 'GrayCo Construction Services, LLC'], ['Address', '{company_address}'], ['Phone / e-mail', '{office_phone} · {billing_email}'], ['Contractor licenses', '{license}'],
              ['Authorized signer (name, title)', '[[________________]]'], ['Entity type / state of organization', '[[Tennessee limited liability company]]'], ['Federal ID (EIN)', '[[provided separately — do not write here]]']]),
    ('h', 'Obligee and project'),
    ('info', [['Obligee (owner / entity taking the bid)', '{gc}'], ['Obligee address', '[[________________]]'], ['Project name', '{job_name}'], ['Project location', '{job_address}'],
              ['Bid / solicitation no.', '[[________________]]'], ['Public or private?', '[[ ] Public   [ ] Private   [ ] Federal   [ ] State   [ ] Municipal / other]]']]),
    ('h', 'Bid and bond'),
    ('info', [['Bid due date and time', '[[________________]]'], ['Estimated bid amount', '[[$ ________]]'], ['Bid bond required', '[[____% of the bid amount, or $______]]'],
              ['Bid bond form required', '[[ ] AIA A310   [ ] Owner\'s form (attached)   [ ] Federal SF-24   [ ] Other: ______]]'], ['Bond must include', '[[ ] Seal   [ ] Power of attorney   [ ] Notarization   [ ] Original (not copy)   [ ] Owner\'s consent of surety]]'],
              ['Performance and payment bonds also required if awarded?', '[[ ] Yes — ____% each    [ ] No]]'], ['Bond must be delivered by', '[[date / time / method: pick-up, courier, e-mail]]']]),
    ('h', 'Documents sent to the surety'),
    ('ul', ['[[ ]] Bid documents / invitation to bid (bond requirements pages)', '[[ ]] Project specifications and bond forms', '[[ ]] Current financial statement', '[[ ]] Work-in-progress / backlog schedule',
            '[[ ]] Bank reference letter', '[[ ]] Company and key-staff experience / resumes', '[[ ]] Contractor licenses', '[[ ]] General indemnity agreement (if first bond)']),
    ('h', 'Authorization'),
    ('p', 'The undersigned, authorized to act for GrayCo Construction Services, LLC, requests the bid bond described above, certifies that the information is true and complete to the best of the signer\'s knowledge, and understands that bond issuance is up to the surety and may require an indemnity agreement.'),
    ('sigs', 'GrayCo authorized signer', 'Date / received by agent'),
], subtitle='One form per bid', admin_only=False,
  flags=['Internal-use form; counsel to confirm authorized-signer language and that the bid bond form (AIA A310 or the owner\'s form) controls.'],
  who='A surety agent, for each bid.',
  where='Office use for commercial and public bids (Bids → bid packet).')

# Which docs go in which PDF section (order)
SECTIONS = [
    ('Marketing and Referrals', ['referral_terms', 'referral_partner', 'coupon_terms', 'giveaway_rules', 'giveaway_affidavit']),
    ('Collections', ['lien_notice_tn', 'lien_notice_ms', 'lien_notice_ar', 'final_demand']),
    ('Employment (HR) — admin only', ['handbook', 'conf_nonsolicit', 'contractor_1099']),
    ('Bonds and Surety', ['bond_letter', 'bid_bond_form']),
]
BY_ID = {d['id']: d for d in DOCS}
assert set(BY_ID) == set(i for _, ids in SECTIONS for i in ids)
