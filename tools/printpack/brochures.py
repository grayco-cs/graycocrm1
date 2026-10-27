"""Tri-fold brochures (US Letter landscape, 2 sides) for GrayCo's four lines of work."""
from brand import CO, ph, icon, qr_svg, roofline, doc, contact_lines, lic_line, LOGO_NAVY, LOGO_WHITE

CSS = r"""
.tri{display:grid;height:8.5in}
.outside .tri{grid-template-columns:3.625in 3.6875in 3.6875in}
.inside .tri{grid-template-columns:3.6875in 3.6875in 3.625in}
.panel{position:relative;height:8.5in;overflow:hidden;padding:.36in .34in .32in;display:flex;flex-direction:column}
.panel h2{font-size:14pt;margin-top:2px}
.panel h3{font-size:10.2pt;margin:11px 0 0}
.panel h3:first-child{margin-top:0}
.panel .rule{margin:4px 0 7px}
.tinted{background:var(--tint)}
.cool{background:var(--tint2)}

/* cover */
.cover{padding:0}
.cover .top{padding:.42in .4in .18in;text-align:center}
.cover .top img{width:2.35in;height:auto}
.cover .band{background:var(--navy);color:#fff;padding:.30in .36in .26in;position:relative;flex:1;display:flex;flex-direction:column}
.cover .band .kicker{color:var(--gold)}
.cover .band h1{color:#fff;font-size:21pt;line-height:1.08;margin:6px 0 0;letter-spacing:-.015em}
.cover .band .rule{background:var(--gold);margin:10px 0 10px;width:44px}
.cover .band p.sub{color:#D5DDE8;font-size:9.4pt;line-height:1.42}
.cover .band ul{list-style:none;margin-top:12px}
.cover .band li{color:#fff;font-size:8.8pt;font-weight:600;padding:3px 0 3px 17px;position:relative}
.cover .band li .ic{position:absolute;left:0;top:5px;width:11px;height:11px}
.cover .band .roofline{position:absolute;left:.3in;right:.3in;bottom:.16in;width:calc(100% - .6in);height:.62in;opacity:.55}
.cover .base{padding:.18in .36in .28in;text-align:center}
.cover .base .call{font-size:7pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gold2)}
.cover .base .num{font-size:19pt;font-weight:800;color:var(--navy);letter-spacing:-.01em;line-height:1.1}
.cover .base .web{font-size:9pt;color:var(--navy2);font-weight:600}
.cover .base .foot-lic{margin-top:5px}

/* back */
.back{background:var(--navy);color:#DCE3EC}
.back img.lg{width:1.75in;display:block;margin:0 auto 10px}
.back h2{color:#fff;text-align:center;font-size:13pt}
.back .rule{margin:6px auto 8px;background:var(--gold)}
.back p.lead{text-align:center;color:#C9D3DF;font-size:8.6pt}
.contact{margin:12px 0 0}
.contact .crow{display:flex;gap:8px;align-items:center;padding:3.5px 0;font-size:8.6pt}
.contact .crow .ic{width:13px;height:13px}
.contact .big{font-size:12pt}
.contact.dark .crow{color:#fff;border-bottom:1px solid rgba(255,255,255,.08)}
.contact.dark b{color:#fff}
.qrrow{display:flex;gap:12px;justify-content:center;margin-top:13px}
.qrcard{width:1.42in;text-align:center}
.qrcard .qr{border:2px solid var(--gold)}
.qrcard .cap{font-size:7pt;font-weight:700;color:#fff;margin-top:5px;line-height:1.25}
.qrcard .cap span{display:block;font-weight:500;color:#AEBBCB;font-size:6.6pt}
.fbline{display:flex;gap:6px;align-items:center;justify-content:center;margin-top:10px;font-size:7.6pt;color:#fff}
.fbline .ic{width:14px;height:14px}
.creds{margin-top:auto;border-top:1px solid rgba(196,164,105,.45);padding-top:9px}
.creds div{display:flex;gap:7px;align-items:flex-start;font-size:7.4pt;color:#C9D3DF;margin:3px 0;line-height:1.3}
.creds .ic{width:11px;height:11px;margin-top:1px}
.creds b{color:#fff}

/* flap & inside */
.lead2{font-size:9pt;color:var(--ink)}
.cb{display:flex;gap:9px;margin:6px 0}
.cb .ic{width:20px;height:20px;padding:4px;background:var(--navy);border-radius:50%;margin-top:1px}
.cb b{display:block;font-size:8.7pt}
.cb span{font-size:8pt;color:var(--muted);line-height:1.32}
.pull{margin-top:auto;border-left:3px solid var(--gold);background:var(--goldlt);padding:8px 10px;font-size:8.3pt;color:var(--navy);font-weight:600;line-height:1.35}
.pull small{display:block;font-weight:500;color:var(--muted);font-size:7.3pt;margin-top:3px}

.steps{position:relative;margin-top:2px}
.step{position:relative;padding-left:25px;margin-bottom:6.5px}
.step .n{position:absolute;left:0;top:0;width:17px;height:17px;border-radius:50%;background:var(--navy);color:#fff;
  font-weight:800;font-size:7.6pt;display:flex;align-items:center;justify-content:center}
.step:not(:last-child):after{content:"";position:absolute;left:8px;top:19px;bottom:-6px;width:1.2px;background:var(--gold)}
.step h4{font-size:8.9pt;line-height:1.2;padding-top:1px}
.step p{font-size:7.95pt;line-height:1.33;margin-top:1px}
.tag{display:inline-block;font-size:6.2pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase;border-radius:3px;padding:1px 4px;vertical-align:1px;margin-left:3px}
.tag.you{background:#E4ECF6;color:var(--navy2)}
.tag.gc{background:var(--goldlt);color:#7A5B12}
.faq dt{font-weight:700;color:var(--navy);font-size:8.4pt;margin-top:6px}
.faq dd{font-size:7.95pt;line-height:1.33;color:var(--ink)}
.wbox{margin-top:auto;border:1.5px solid var(--gold);border-radius:6px;padding:8px 10px;display:flex;gap:9px;background:#fff}
.wbox .ic{width:22px;height:22px;margin-top:1px}
.wbox b{font-size:8.8pt}
.wbox p{font-size:7.7pt;line-height:1.32;margin-top:1px}
.svc{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;margin-top:3px}
.svc div{font-size:8pt;padding-left:11px;position:relative}
.svc div:before{content:"";position:absolute;left:0;top:.5em;width:5px;height:5px;background:var(--gold);transform:rotate(45deg)}
.spec{background:var(--navy);color:#DCE3EC;border-radius:6px;padding:9px 11px;margin-top:9px}
.spec h4{color:#fff;font-size:9pt}
.spec ul{list-style:none;margin-top:3px}
.spec li{font-size:7.8pt;padding-left:14px;position:relative;margin:2px 0;line-height:1.3}
.spec li .ic{position:absolute;left:0;top:2px;width:9px;height:9px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px}
.split .col{border-radius:6px;padding:7px 8px}
.split .col h4{font-size:8.6pt;margin-bottom:2px}
.split .you{background:#E4ECF6}
.split .gc{background:var(--goldlt)}
.split ul li{font-size:7.6pt;line-height:1.28;margin:2.5px 0}
.honest{background:var(--navy);color:#E2E8F0;border-radius:6px;padding:9px 11px;margin-top:8px}
.honest h4{color:var(--gold);font-size:9.4pt}
.honest p{font-size:7.9pt;line-height:1.35;margin-top:3px}
.honest b{color:#fff}
.mini-foot{margin-top:7px;font-size:7pt;color:var(--muted)}

/* type scale v2 — larger for readability */
html,body{font-size:9.2pt}
.panel h2{font-size:15pt}
.panel h3{font-size:11pt;margin-top:13px}
.lead2{font-size:9.5pt}
.step{padding-left:27px;margin-bottom:9px}
.step .n{width:19px;height:19px;font-size:8.2pt}
.step:not(:last-child):after{left:9px;top:21px;bottom:-9px}
.step h4{font-size:9.8pt}
.step p{font-size:8.8pt}
.faq dt{font-size:9.3pt;margin-top:8px}
.faq dd{font-size:8.8pt}
.svc{gap:4px 10px}.svc div{font-size:8.8pt}
.spec h4{font-size:9.6pt}.spec li{font-size:8.5pt}
.cb{margin:6px 0}.cb b{font-size:9.3pt}.cb span{font-size:8.4pt}
.split li{font-size:8.2pt}
.wbox b{font-size:9.5pt}.wbox p{font-size:8.4pt}
.honest h4{font-size:10pt}.honest p{font-size:8.5pt}
.pull{font-size:9pt}
.mini-foot{font-size:7.6pt}
.trail{margin-top:6px}
.panel h2.flaph{font-size:13.4pt;letter-spacing:-.02em}
.pull{padding:7px 10px}
.chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.chips span{font-size:7.6pt;font-weight:600;color:var(--navy);background:#fff;border:1px solid var(--line);border-radius:10px;padding:2px 7px}
.cover .base .foot-lic b{color:var(--navy2)}
.contact .crow{font-size:9pt}
.back p.lead{font-size:9pt}
.area{display:flex;gap:6px;align-items:center;justify-content:center;margin-top:6px;font-size:8pt;color:#C9D3DF}
.area .ic{width:12px;height:12px}
"""


def cover(k):
    pts = ''.join('<li>%s%s</li>' % (icon('check', '#C4A469'), p) for p in k['cover_points'])
    return f'''<section class="panel cover">
  <div class="top"><img src="{LOGO_NAVY}" alt="GrayCo Construction Services"></div>
  <div class="band">
    <div class="kicker">{k['kicker']}</div>
    <h1>{k['cover_title']}</h1>
    <div class="rule"></div>
    <p class="sub">{k['cover_sub']}</p>
    <ul>{pts}</ul>
    {roofline('#C4A469', 4)}
  </div>
  <div class="base">
    <div class="call">{k['cover_call']}</div>
    <div class="num">{CO['phone']}</div>
    <div class="web">{CO['web']} &nbsp;·&nbsp; {CO['email']}</div>
    <div class="foot-lic"><b>{CO['legal']}</b> · Licensed General Contractor<br>{lic_line(' · ')}</div>
  </div>
</section>'''


def back(k):
    return f'''<section class="panel back">
  <img class="lg" src="{LOGO_WHITE}" alt="GrayCo Construction Services">
  <h2>{k['cta_title']}</h2>
  <div class="rule"></div>
  <p class="lead">{k['cta_text']}</p>
  {contact_lines(dark=True)}
  <div class="qrrow">
    <div class="qrcard"><div class="qr">{qr_svg(CO['review_url'])}</div>
      <div class="cap">{icon('google', '#C4A469')} Read our Google reviews<span>Scan with your phone camera</span></div></div>
    <div class="qrcard"><div class="qr">{qr_svg(CO['web_url'])}</div>
      <div class="cap">Visit our website<span>{CO['web']}</span></div></div>
    {k.get('extra_qr', '')}
  </div>
  <div class="fbline">{icon('fb', '#1877F2')} {CO['facebook_label']}</div>
  <div class="area">{icon('pin', '#C4A469')} Serving {CO['area']}</div>
  <div class="creds">
    <div>{icon('shield', '#C4A469')}<span><b>{CO['legal']}</b> — licensed general contractor<br>{lic_line(' · ')}</span></div>
    <div>{icon('shield', '#C4A469')}<span><b>Fully insured</b> — general liability &amp; workers’ comp; certificate of insurance on request.</span></div>
    <div>{icon('shield', '#C4A469')}<span><b>IICRC WRT certified</b> for water damage restoration</span></div>
  </div>
</section>'''


def flap(k):
    items = k.get('checks') or CHECKS_DEFAULT
    cbs = ''.join(f'<div class="cb">{icon(ic, "#fff")}<div><b>{t}</b><span>{d}</span></div></div>' for ic, t, d in items)
    return f'''<section class="panel tinted">
  <div class="kicker">Why GrayCo</div>
  <h2 class="flaph">{k.get('flap_title', 'Checks &amp; balances on every job')}</h2>
  <div class="rule"></div>
  <p class="lead2">{k['flap_lead']}</p>
  <div style="margin-top:6px">{cbs}</div>
  {'' if k.get('docs') == [] else '<div class="trail"><div class="kicker">Your paper trail</div><div class="chips">' + ''.join('<span>%s</span>' % d for d in k.get('docs', DOCS_DEFAULT)) + '</div></div>'}
  <div class="pull">“{k['pull']}”</div>
</section>'''


DOCS_DEFAULT = ['Written estimate', 'Signed contract', 'Change Orders', 'Checks &amp; Balances sheet', 'Final Inspection Sign-Off', 'Warranty certificate', 'Final lien waiver']

CHECKS_DEFAULT = [
    ('doc', 'Everything in writing', 'Written estimate, signed contract before any work begins, and a signed Change Order before any change.'),
    ('people', 'One point of contact', 'Your dedicated Project Manager runs your job start to finish — and our office reviews every stage behind them.'),
    ('camera', 'Photo-documented', 'We photograph existing conditions, progress and completion (CompanyCam), so there is a record of every step.'),
    ('clip', 'Stage sign-offs you can see', 'We leave a Checks &amp; Balances sheet on site: pre-start, daily, mid-job, punch list and final walkthrough — dated and initialed.'),
    ('broom', 'Clean site, every day', 'Daily clean-up, debris hauled off, final cleaning before we call it done.'),
    ('shield', 'Closeout done right', 'Final walkthrough with you, written warranty certificate, and lien waivers so your property is protected.'),
]


def brochure(k):
    outside = f'<div class="sheet outside"><div class="tri">{flap(k)}{back(k)}{cover(k)}</div></div>'
    inside = (f'<div class="sheet inside"><div class="tri">'
              f'<section class="panel">{k["in_left"]}</section>'
              f'<section class="panel tinted">{k["in_mid"]}</section>'
              f'<section class="panel">{k["in_right"]}</section></div></div>')
    return doc(k['title'], outside + inside, CSS, 11, 8.5, k['desc'])


def steps(lst):
    out = []
    for i, s in enumerate(lst, 1):
        h, p = s[0], s[1]
        tag = ''
        if len(s) > 2:
            tag = ''.join('<span class="tag %s">%s</span>' % (t, 'You' if t == 'you' else 'GrayCo') for t in s[2])
        out.append(f'<div class="step"><div class="n">{i}</div><h4>{h}{tag}</h4><p>{p}</p></div>')
    return '<div class="steps">' + ''.join(out) + '</div>'


def faq(lst):
    return '<dl class="faq">' + ''.join(f'<dt>{q}</dt><dd>{a}</dd>' for q, a in lst) + '</dl>'


def wbox(term_key, extra=''):
    return f'''<div class="wbox">{icon('shield', '#C4A469')}<div><b>Written warranty</b>
<p>Workmanship warranty: {ph(term_key)} from completion, plus manufacturer warranties on materials. Your warranty certificate is issued at closeout. {extra}
To file a claim: {CO['phone']} or {CO['email']} — we respond within 24 hours.</p></div></div>'''


def svc(items):
    return '<div class="svc">' + ''.join('<div>%s</div>' % i for i in items) + '</div>'


def who(text_extra):
    return (f'<p class="lead2"><b>{CO["name"]}</b> is a licensed general contractor based in Bartlett, Tennessee, '
            f'serving {CO["area_long"]}. Our team has {CO["years"]} — built through two previous companies, now one company: GrayCo. {text_extra}</p>')


# =============================================================== ROOFING
ROOF = dict(
    slug='brochure-roofing', title='GrayCo Roofing Brochure',
    desc='Tri-fold customer brochure for GrayCo roofing repairs and replacements.',
    kicker='Roofing · Repairs · Replacements',
    cover_title='Roofs done right — and documented every step.',
    cover_sub='Honest inspections, clean installs and a written record of the work. If storm damage is involved, we help you through the insurance claim.',
    cover_points=['Free roof inspection', 'Photo-documented, start to finish', 'Storm damage? Insurance welcome', 'Written workmanship warranty'],
    cover_call='Call for a free roof inspection',
    cta_title='Worried about your roof?',
    cta_text='Call or message us for a free roof inspection. We’ll show you photos of what we find and give you an honest recommendation.',
    flap_lead='A roof is your home’s first line of defense. Here is how we make sure the job is done right — and how you can see it for yourself.',
    pull='You’ll see the photos, approve the materials and walk the finished roof with us before we call it done.',
    in_left=f'''<div class="kicker">Who we are</div><h2>Your roof, handled by a licensed GC</h2><div class="rule"></div>
{who('From a few missing shingles to a full replacement, we protect your biggest investment with work that lasts.')}
<h3>What we do</h3><div class="rule"></div>
{svc(['Free roof inspections', 'Leak &amp; storm repairs', 'Full roof replacements', 'Architectural shingles', 'Flashing, vents &amp; pipe boots', 'Decking (sheathing) repair', 'Insurance-claim roofs', 'Drip edge &amp; ridge cap'])}
<div class="spec"><h4>What goes into a GrayCo roof replacement</h4><ul>
<li>{icon('check', '#C4A469')}Old roofing removed completely — down to the deck</li>
<li>{icon('check', '#C4A469')}Deck inspected; damaged sheathing photographed and approved by you before replacement</li>
<li>{icon('check', '#C4A469')}Drip edge — eaves first, then rakes</li>
<li>{icon('check', '#C4A469')}Ice &amp; water shield at all eaves and valleys</li>
<li>{icon('check', '#C4A469')}Synthetic underlayment — full coverage</li>
<li>{icon('check', '#C4A469')}Shingles installed per manufacturer specification</li>
<li>{icon('check', '#C4A469')}Every penetration flashed — pipes, vents, HVAC</li>
<li>{icon('check', '#C4A469')}Ridge cap, final inspection of all flashings &amp; seals</li></ul></div>
<p class="mini-foot">Exact materials are listed in your written estimate.</p>''',
    in_mid='<div class="kicker">Our process</div><h2>Your roof, step by step</h2><div class="rule"></div>' + steps([
        ('Free inspection', 'We photograph existing conditions and give you an honest assessment — repair or replace.', ['gc']),
        ('Written estimate &amp; contract', 'Scope, materials and price in writing. No work begins without a signed contract.', ['gc', 'you']),
        ('Insurance? We meet the adjuster', 'If it’s storm damage, we confirm the scope with you and your adjuster.', ['gc']),
        ('Choose your shingle', 'You approve the color and material — initialed and dated on your job record.', ['you']),
        ('Prep &amp; safety', 'Fall protection and OSHA-compliant setup. Tell us about anything near the house to protect.', ['gc']),
        ('Tear-off &amp; deck check', 'If decking is damaged we photograph it and get your OK before replacing it.', ['gc', 'you']),
        ('Installation', 'Drip edge, ice &amp; water shield, underlayment, shingles, flashing and ridge cap.', ['gc']),
        ('Final inspection walk', 'Your PM inspects every flashing and seal, then walks you through the finished roof.', ['gc', 'you']),
        ('Clean-up &amp; closeout', 'All debris, nails and materials removed. Lien waiver and written warranty provided.', ['gc']),
    ]),
    in_right='<div class="kicker">Good to know</div><h2>What to expect</h2><div class="rule"></div>'
    + '<ul class="dots"><li><b>Noise:</b> tear-off is loud. We’ll confirm start time, parking and dumpster placement before day one.</li>'
      '<li><b>Weather:</b> roofing is weather-dependent. Your PM will tell you right away about any schedule change.</li>'
      '<li><b>Communication:</b> same-day response to calls, texts and emails.</li></ul>'
    + '<h3>Common questions</h3><div class="rule"></div>' + faq([
        ('Repair or replace — how do I know?', 'We show you photos of what we found and explain the options. If a repair will do the job, we’ll tell you.'),
        ('Will insurance cover my roof?', 'That depends on your policy and the cause of damage. We document it and meet your adjuster; your carrier decides coverage.'),
        ('Do I need to be home?', 'Not all day — but we need you (or your representative) for shingle and decking approvals and the final walk.'),
        ('Storm damage — can you help with the claim?', 'Yes. We document the damage, meet your adjuster and keep you informed.'),
        ('What is the Checks &amp; Balances sheet?', 'A one-page record we leave on site. Each stage — pre-start, daily, mid-job, punch list and final walkthrough — is dated and initialed by your PM and reviewed by our office.'),
    ]) + wbox('WARRANTY TERM — ROOFING', '5 years on every roof — residential, commercial or insurance.'),
)

# =============================================================== INSURANCE / RESTORATION
INS = dict(
    slug='brochure-insurance-restoration', title='GrayCo Insurance Claims Brochure',
    desc='Tri-fold brochure explaining the GrayCo insurance claim, storm, water and fire restoration process.',
    kicker='Insurance Claims · Storm · Water · Fire',
    cover_title='Damage happened. We’ll walk you through the claim.',
    cover_sub='We document the damage, meet your adjuster and rebuild it right — and we keep you informed at every step, so you are never stuck in the middle.',
    cover_points=['Free claim walk-through', 'We meet your adjuster on site', 'IICRC WRT certified (water)', 'Honest about your deductible'],
    cover_call='Call for a free claim walk-through',
    cta_title='Not sure where to start?',
    cta_text='Call before you sign anything. We’ll walk the damage with you, explain the claim process and answer your questions — no cost.',
    flap_lead='An insurance claim involves you, your carrier and your contractor. Clear roles and a written record protect everyone — especially you.',
    checks=[
        ('doc', 'Signed authorization — with a right to cancel', 'You sign a Work Authorization before we start. You may cancel within 3 business days, as stated on the form.'),
        ('camera', 'Every loss photo-documented', 'Photos for you and your adjuster (CompanyCam) — before, during and after.'),
        ('clip', 'Supplements in writing', 'Hidden damage found during repairs is photographed and submitted. No supplemental work without insurer approval or your written OK.'),
        ('people', 'One PM, one office', 'Your Project Manager runs the job; our office double-checks paperwork and every stage sign-off.'),
        ('shield', 'Completion you sign off on', 'Final walkthrough and a Certificate of Completion &amp; Satisfaction before final funds are released.'),
    ],
    docs=['Work Authorization', 'Our independent estimate', 'Approved insurance scope', 'Supplements (with photos)', 'Change Orders', 'Checks &amp; Balances sheet', 'Certificate of Completion &amp; Satisfaction', 'Warranty certificate'],
    pull='We never ask you to inflate, skip or “absorb” your deductible. Honest claims protect you.',
    in_left='<div class="kicker">The claim, step by step</div><h2>How an insurance claim works with GrayCo</h2><div class="rule"></div>' + steps([
        ('Protect the property', 'Emergency board-up, tarping or water extraction to stop further damage — available 24/7.', ['gc']),
        ('Report the claim', 'You call your insurance company, report the loss and get a claim number.', ['you']),
        ('Free inspection &amp; documentation', 'We photograph and document all damage and prepare our own independent estimate.', ['gc']),
        ('Sign the Work Authorization', 'Authorizes GrayCo to perform the work and communicate with your carrier. 3-business-day right to cancel.', ['you']),
        ('Adjuster inspection', 'We meet your adjuster on site with our photos, measurements and estimate.', ['gc', 'you']),
        ('Review the approved scope', 'We go over the insurance scope of loss with you, line by line, before work starts.', ['gc', 'you']),
        ('Restoration &amp; rebuild', 'We restore to pre-loss condition. Hidden damage is documented and submitted as a supplement.', ['gc']),
        ('Final walkthrough &amp; sign-off', 'You inspect the work and sign the Certificate of Completion &amp; Satisfaction.', ['you', 'gc']),
        ('Final funds &amp; warranty', 'Final payment/recoverable depreciation is released; your written warranty begins.', ['gc']),
    ]),
    in_mid=f'''<div class="kicker">Clear roles</div><h2>What you do vs. what we do</h2><div class="rule"></div>
<div class="split">
 <div class="col you"><h4>You</h4><ul class="dots">
  <li>Keep everyone safe; call us for emergency protection</li>
  <li>Report the loss to your carrier; get a claim number</li>
  <li>Share your claim #, adjuster contact and policy paperwork</li>
  <li>Sign the Work Authorization (3-day right to cancel)</li>
  <li>Pay your deductible as your policy requires</li>
  <li>Approve any work outside the insurance scope in writing</li>
  <li>Walk the finished work and sign off</li></ul></div>
 <div class="col gc"><h4>GrayCo</h4><ul class="dots">
  <li>Emergency board-up, tarping &amp; water extraction</li>
  <li>Photo-document all damage (CompanyCam)</li>
  <li>Prepare our own independent estimate</li>
  <li>Meet the adjuster; coordinate claim paperwork</li>
  <li>Submit supplements for hidden damage, with photos</li>
  <li>Pull permits; manage crews &amp; inspections</li>
  <li>Restore to pre-loss condition; issue warranty</li></ul></div>
</div>
<h3>Working with your adjuster</h3><div class="rule"></div>
<p>Your insurance company decides what your policy covers. Our job is to make sure the adjuster sees <b>all</b> of the damage — with photos, measurements and a detailed estimate. The adjuster’s first estimate is a starting point; if we find damage that was missed, we document it and submit it as a supplement. You get copies of what we send and daily photo updates you and your adjuster can view.</p>
<div class="honest"><h4>Honest about your deductible</h4>
<p><b>We never ask you to inflate or skip your deductible</b>, and we never offer to “cover” it. Your deductible is your share under your policy; your out-of-pocket cost is limited to it unless you approve extra work in writing. A contractor offering to waive it is asking you to misrepresent your claim — a red flag.</p></div>''',
    in_right='<div class="kicker">Good to know</div><h2>Questions we hear most</h2><div class="rule"></div>' + faq([
        ('Do I have to use the contractor my insurer recommends?', 'You choose who repairs your home. We work with all major insurance carriers.'),
        ('Who gets the insurance check?', 'Payments are typically made out to you (and your mortgage company, if you have one). Your Work Authorization explains how claim payments are directed to GrayCo for the work.'),
        ('What is recoverable depreciation?', 'Many policies hold back part of the payment until the work is complete. Your signed Certificate of Completion lets your carrier release it.'),
        ('What if more damage is found?', 'We stop, photograph it, tell you right away and submit it to your carrier. Nothing extra proceeds without approval.'),
        ('Water damage — how long to dry out?', 'Typically 1–3 days of emergency mitigation and 3–5 days of monitored drying, with daily moisture readings, before rebuild starts.'),
        ('What isn’t covered?', 'Items outside your policy, pre-existing damage and contents are handled separately. We’ll be upfront about what’s in and out of the scope.'),
    ]) + wbox('WARRANTY TERM — INSURANCE/RESTORATION'),
)

# =============================================================== COMMERCIAL
COM = dict(
    slug='brochure-commercial', title='GrayCo Commercial Build-Outs Brochure',
    desc='Tri-fold brochure for GrayCo commercial build-outs, tenant improvements and renovations.',
    kicker='Commercial · Tenant Improvements',
    cover_title='Build-outs that open on time — and keep you informed.',
    cover_sub='Tenant improvements, commercial renovations and finish work for business owners and property managers — licensed, insured and organized.',
    cover_points=['Licensed project management', 'Weekly owner / PM meetings', 'Daily photo logs (CompanyCam)', 'OSHA-compliant job sites'],
    cover_call='Call to discuss your project',
    cta_title='Planning a build-out?',
    cta_text='Send us your plans or schedule a walk-through. We’ll give you a detailed, competitive bid and a realistic schedule.',
    flap_lead='Commercial work runs on paperwork, inspections and deadlines. Our process keeps owners, landlords and property managers in the loop.',
    checks=[
        ('doc', 'Scope &amp; changes in writing', 'Signed contract before mobilization; written, signed Change Orders before any change in scope, price or schedule.'),
        ('people', 'Weekly progress meetings', 'With the owner and property management — plus immediate notice of RFIs, schedule changes or code issues.'),
        ('camera', 'Daily photo logs', 'Progress documentation via CompanyCam and daily job reports from your PM.'),
        ('clip', 'Inspections &amp; code compliance', 'Permits, inspections and code compliance managed by GrayCo, tracked stage by stage.'),
        ('shield', 'Clean closeout package', 'Certificate of Substantial Completion, punch list, written warranty and lien waivers from GrayCo and its subs.'),
    ],
    docs=['Line-item proposal', 'Signed contract', 'Certificate of insurance', 'Change Orders', 'Daily job reports', 'Certificate of Substantial Completion', 'Lien waivers', 'Warranty certificate'],
    pull='Same-day response to all communications — and a written record of every decision.',
    in_left=f'''<div class="kicker">Who we are</div><h2>A GC that respects your schedule</h2><div class="rule"></div>
{who('We handle commercial tenant improvements, build-outs and remodels with minimal disruption to your business, tenants and neighbors.')}
<h3>What we build</h3><div class="rule"></div>
{svc(['Tenant improvements (TI)', 'Office build-outs', 'Finish work', 'Commercial renovations', 'Framing &amp; drywall', 'Doors, trim &amp; millwork', 'Flooring &amp; painting', 'Multi-unit repairs'])}
<h3>What’s included</h3><div class="rule"></div>
<ul class="checks">
<li>{icon('check', '#B8902F')}All labor, supervision, equipment, materials, permits and insurance needed for the scope</li>
<li>{icon('check', '#B8902F')}Building permits, inspections &amp; code compliance</li>
<li>{icon('check', '#B8902F')}Licensed project management and on-site supervision</li>
<li>{icon('check', '#B8902F')}Daily site clean-up, debris removal, OSHA-compliant safety</li>
<li>{icon('check', '#B8902F')}Progress documentation via CompanyCam with daily photo logs</li>
<li>{icon('check', '#B8902F')}Certificate of insurance provided on request</li></ul>
<p class="mini-foot">Exact inclusions and exclusions are listed in your proposal.</p>''',
    in_mid='<div class="kicker">Our process</div><h2>From bid to keys</h2><div class="rule"></div>' + steps([
        ('Walk-through &amp; plan review', 'We walk the space and review plans, specs and landlord / building requirements.', ['gc', 'you']),
        ('Detailed bid', 'A written, line-item proposal with inclusions, exclusions and schedule.', ['gc']),
        ('Contract &amp; permits', 'Signed contract, then permit applications. Schedule follows plan approval and permit issuance.', ['you', 'gc']),
        ('Pre-construction meeting', 'Access, work hours (per building / property-management rules), safety and milestones agreed.', ['gc', 'you']),
        ('Long-lead ordering', 'Long-lead items ordered immediately to protect your opening date.', ['gc']),
        ('Build &amp; inspect', 'Daily photo logs, weekly progress meetings, inspections passed at each stage.', ['gc']),
        ('Substantial completion', 'Certificate of Substantial Completion — space usable; warranty clock starts; retainage release requested.', ['gc', 'you']),
        ('Punch list &amp; closeout', 'Punch items completed and verified; warranty, lien waivers and closeout documents delivered.', ['gc']),
    ]),
    in_right='<div class="kicker">Good to know</div><h2>Common questions</h2><div class="rule"></div>' + faq([
        ('Can you work around our business hours?', 'Yes — work hours follow your building / property-management rules. After-hours or weekend work is available at additional cost if requested.'),
        ('How are changes handled?', 'In writing. Any change to scope, price or schedule is a signed Change Order before the work is done. Field or email instructions are not change orders.'),
        ('How is the project paid?', 'Through a draw schedule tied to milestones, as stated in your proposal and contract. Retainage, where used, is released at substantial completion.'),
        ('Will you provide insurance certificates?', 'Yes. We carry general liability and workers’ comp and provide a certificate of insurance on request.'),
        ('How will we hear about problems?', 'Right away. RFIs, schedule changes and code issues are reported immediately, and reviewed at the weekly progress meeting.'),
        ('What isn’t included?', 'Typically architectural / engineering fees, hazardous-material abatement and specialized systems unless specified. Your proposal lists every exclusion.'),
        ('What is the Checks &amp; Balances sheet?', 'A one-page record kept on site: each stage is dated and initialed by your PM and reviewed by our office.'),
    ]) + wbox('WARRANTY TERM — COMMERCIAL', 'Roofs: 5 years. Coverage starts at Substantial Completion.'),
)

# =============================================================== RESIDENTIAL
RES = dict(
    slug='brochure-residential', title='GrayCo Residential Remodeling Brochure',
    desc='Tri-fold brochure for GrayCo residential remodeling and renovation.',
    kicker='Residential · Remodels · Renovations',
    cover_title='Your home, remodeled with care — and no surprises.',
    cover_sub='Kitchens, baths, additions and whole-home renovations, handled by one trusted team with clear communication from first visit to final walkthrough.',
    cover_points=['Free estimates', 'One dedicated Project Manager', 'Written Change Orders — no surprises', 'Daily clean-up &amp; photo updates'],
    cover_call='Call for a free estimate',
    cta_title='Ready to talk about your project?',
    cta_text='Call, email or message us your ideas and inspiration photos. We’ll schedule a site visit and send you a detailed written estimate.',
    flap_lead='Remodeling happens inside your home. You deserve to know who is responsible, what is being checked — and to see it in writing.',
    pull='We show up when we say we will, put everything in writing, and walk the finished work with you before final payment.',
    in_left=f'''<div class="kicker">Who we are</div><h2>One team, start to finish</h2><div class="rule"></div>
{who('From a single room to a whole-home renovation, we handle it start to finish — one crew, one point of contact, no runaround.')}
<h3>What we do</h3><div class="rule"></div>
{svc(['Kitchen remodels', 'Bathroom remodels', 'Walk-in showers &amp; tile', 'Room additions', 'In-law suites', 'Whole-home renovations', 'Drywall hang &amp; finish', 'Flooring &amp; painting', 'Windows &amp; doors', 'Decks &amp; exterior'])}
<h3>Included in every remodel</h3><div class="rule"></div>
<ul class="checks">
<li>{icon('check', '#B8902F')}Project management by your dedicated PM</li>
<li>{icon('check', '#B8902F')}Required building permits &amp; inspections</li>
<li>{icon('check', '#B8902F')}Daily clean-up &amp; final professional cleaning</li>
<li>{icon('check', '#B8902F')}Dumpster &amp; debris haul-off</li>
<li>{icon('check', '#B8902F')}Photo documentation via CompanyCam</li>
<li>{icon('check', '#B8902F')}Written workmanship warranty + manufacturer warranties</li></ul>
<p class="mini-foot">Your proposal lists exact inclusions and exclusions.</p>''',
    in_mid='<div class="kicker">Our process</div><h2>How your remodel comes together</h2><div class="rule"></div>' + steps([
        ('Site visit', 'We listen, measure and review your goals. A short questionnaire helps us come prepared.', ['gc', 'you']),
        ('Written estimate', 'Detailed scope and price — typically within 48 hours of the visit.', ['gc']),
        ('Contract', 'Once you approve, we sign a written contract. No work begins without it.', ['you', 'gc']),
        ('Selections &amp; permits', 'Finalize selections before rough-in to avoid delays; we handle permits unless your contract says otherwise.', ['you', 'gc']),
        ('Pre-construction meeting', 'Before Day 1 we review scope, schedule, access, pets, parking and protection.', ['gc', 'you']),
        ('Build — with daily check-ins', 'Daily clean-up and photo updates; immediate notice of any schedule change or hidden condition.', ['gc']),
        ('Changes, in writing', 'Want to change something? We write a Change Order and get your signature before that work starts.', ['you', 'gc']),
        ('Punch list &amp; final walkthrough', 'We walk the work with you, finish every punch item, then final payment is due.', ['gc', 'you']),
        ('Warranty &amp; follow-up', 'Written warranty certificate at closeout — and we stay reachable after we leave.', ['gc']),
    ]),
    in_right='<div class="kicker">Good to know</div><h2>What to expect</h2><div class="rule"></div>'
    + f'<ul class="dots"><li><b>Work hours:</b> typically {CO["work_hours"]} unless your contract says otherwise.</li>'
      f'<li><b>Reaching your PM:</b> by phone or text, {CO["pm_hours"]}. Same-day response to calls, texts and emails.</li>'
      '<li><b>Weather &amp; selections</b> can move the schedule — we tell you right away.</li></ul>'
    + '<h3>Common questions</h3><div class="rule"></div>' + faq([
        ('What if we find something behind the walls?', 'Rot, mold or structural issues are communicated immediately with photos and options. Extra work is done only with a signed Change Order.'),
        ('How do payments work?', 'Progress draws tied to milestones defined in your contract. We invoice you at each milestone; final payment follows the final walkthrough.'),
        ('Who handles permits?', 'GrayCo handles permit applications unless otherwise noted in your contract.'),
        ('What is the Checks &amp; Balances sheet?', 'A one-page record we leave on site. Each stage — pre-start, daily, mid-job, punch list and final walkthrough — is dated and initialed by your PM and reviewed by our office.'),
        ('Can I see progress when I’m not home?', 'Yes — daily progress photos are available on CompanyCam.'),
    ]) + wbox('WARRANTY TERM — RESIDENTIAL', 'Roofs: 5 years.'),
)

ALL = [ROOF, INS, COM, RES]
