"""General GrayCo pamphlet for festivals, trade shows and events: tri-fold, 5.5x8.5 flyer (+2-up), web."""
import brochures
from brochures import steps, svc
from brand import CO, icon, qr_svg, roofline, doc, lic_line, LOGO_NAVY, LOGO_WHITE, addr_html

# ------------------------------------------------------------------ shared content
SERVICES = [
    ('Roofing', 'Repairs and full replacements — <strong>5-year warranty on every roof</strong>.'),
    ('Insurance claims &amp; restoration', 'Storm, water and fire damage. We meet your adjuster. IICRC WRT certified (water).'),
    ('Commercial build-outs', 'Tenant improvements, office build-outs, commercial renovations and multi-unit repairs.'),
    ('Residential remodels &amp; repairs', 'Kitchens, baths, additions, in-law suites and whole-home renovations.'),
    ('Drywall &amp; finishes', 'Hang &amp; finish, repairs, painting and flooring.'),
    ('Exterior &amp; more', 'Windows &amp; doors, decks and exterior repairs.'),
]

WHY = [
    ('shield', 'Licensed in TN, MS &amp; AR', lic_line(' · ')),
    ('shield', 'Fully insured', 'General liability &amp; workers’ comp; certificate of insurance on request.'),
    ('people', '8 years in business', 'Built through two previous companies — now one company: GrayCo.'),
    ('globe', 'Your own online project page', 'Every job gets its own online project page with photos, documents and invoices.'),
    ('clip', 'PM checks &amp; balances', 'Your Project Manager checks every stage in the field; our office reviews and initials it.'),
    ('doc', 'Written warranties', 'Every roof: 5 years. Insurance/restoration: 5 years. All other work: 1 year.'),
]

HOW = [
    ('Call for a free estimate', f'{CO["phone"]} or {CO["email"]}.'),
    ('Site visit &amp; written estimate', 'We visit, listen and send a detailed written estimate — typically within 48 hours.'),
    ('Signed contract', 'Everything in writing. No work begins without a signed contract.'),
    ('Build with your PM', 'One Project Manager, daily photos on your project page, Change Orders signed before any change.'),
    ('Walkthrough &amp; warranty', 'We walk the finished work with you and issue your written warranty.'),
]

STORY = ('GrayCo Construction Services is based in Bartlett, Tennessee. Our team has 8 years in business — '
         'built through two previous companies and now one company: GrayCo. Today we are a licensed general contractor '
         f'serving {CO["area_long"]}.')
VALUES = [
    ('We show up when we say we will', 'And we tell you right away if anything changes.'),
    ('Honest, written quotes', 'No surprise costs — changes are on a signed Change Order first.'),
    ('One team, start to finish', 'One Project Manager is your single point of contact.'),
    ('A clean, safe job site', 'Cleaned up every day; all debris hauled off at the end.'),
]
PORTAL = [
    ('camera', 'Photos', 'Progress photos of your job, so you can see it any time.'),
    ('doc', 'Documents', 'Your estimate, contract, Change Orders and warranty in one place.'),
    ('clip', 'Invoices', 'Clear invoices tied to your project — nothing hidden.'),
]


def warranty_strip(cls='wstrip'):
    return (f'<div class="{cls}"><div><b>5 yrs</b><span>Every roof</span></div><div><b>5 yrs</b><span>Insurance / restoration</span></div>'
            f'<div><b>1 yr</b><span>All other work</span></div></div>')


# ------------------------------------------------------------------ tri-fold
GEN_CSS = r"""
.gen .qrcard{width:.98in}
.gen .qrrow{gap:8px}
.gen .qrcard .cap{font-size:6.6pt}
.svcl{margin-top:2px}
.svcl .it{display:flex;gap:9px;padding:6px 0;border-bottom:1px solid var(--line2)}
.svcl .it:last-child{border-bottom:0}
.svcl .it .dot{flex:none;width:8px;height:8px;margin-top:5px;background:var(--gold);transform:rotate(45deg)}
.svcl .it b{display:block;font-size:9.8pt}
.svcl .it span strong{display:inline;font-size:inherit;color:var(--navy)}
.svcl .it span{font-size:8.6pt;color:var(--ink);line-height:1.33}
.wstrip{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}
.wstrip div{background:var(--navy);border-radius:6px;padding:6px 4px;text-align:center}
.wstrip b{display:block;color:var(--gold);font-size:13pt;line-height:1.1}
.wstrip span{display:block;color:#fff;font-size:7.2pt;line-height:1.2;margin-top:2px}
.navyblk{background:var(--navy);color:#DCE3EC;margin:-.36in -.34in 0;padding:.36in .34in .2in}
.navyblk .kicker{color:var(--gold)}
.navyblk h2{color:#fff!important}
.navyblk .rule{background:var(--gold)}
.navyblk p{font-size:9pt;color:#D5DDE8}
.pfeat{display:grid;grid-template-columns:1fr;gap:0;margin-top:6px}
.pfeat div{display:flex;gap:9px;padding:5px 0}
.pfeat .ic{width:20px;height:20px;padding:4px;background:var(--gold);border-radius:50%;flex:none}
.pfeat b{color:#fff;display:block;font-size:9.4pt}
.pfeat span{font-size:8.4pt;line-height:1.3}
.vals .v{padding:5px 0 5px 15px;position:relative;border-bottom:1px solid var(--line2)}
.vals .v:last-child{border-bottom:0}
.vals .v .ic{position:absolute;left:0;top:7px;width:10px;height:10px}
.vals .v b{display:block;font-size:9.3pt}
.vals .v span{font-size:8.4pt;color:var(--ink)}
.est{margin-top:auto;border:2px solid var(--gold);border-radius:8px;padding:10px 12px;text-align:center;background:var(--tint)}
.est .kicker{font-size:7.4pt}
.est .n{font-size:18pt;font-weight:800;color:var(--navy);line-height:1.15;margin-top:2px}
.est .m{font-size:8.6pt;color:var(--navy2);font-weight:600}
"""

GEN = dict(
    slug='brochure-general', title='GrayCo General Brochure',
    desc='General GrayCo tri-fold for festivals and trade shows: who we are, services, why GrayCo, how it works.',
    kicker='Licensed General Contractor',
    cover_title='One call. Done right.',
    cover_sub='Your licensed general contractor for roofing, insurance claims and restoration, commercial build-outs and home remodeling — with checks and balances on every job.',
    cover_points=['Free estimates', '5-year warranty on every roof', 'Your own online project page', 'Licensed in TN, MS &amp; AR'],
    cover_call='Call for a free estimate',
    cta_title='Get your free estimate',
    cta_text='Tell us about your project — roof, repair, remodel, insurance claim or commercial space. We’ll come out, take a look and send a written estimate.',
    extra_qr=f'''<div class="qrcard"><div class="qr">{qr_svg(CO['facebook_url'])}</div>
      <div class="cap">Find us on Facebook<span>GrayCo Construction</span></div></div>''',
    flap_title='Why people choose GrayCo',
    flap_lead='One accountable team, everything in writing, and a record of your project you can see any time.',
    checks=WHY,
    docs=[],
    pull='We show up when we say we will, put everything in writing, and walk the finished work with you.',
)


def inside_left():
    items = ''.join(f'<div class="it"><div class="dot"></div><div><b>{t}</b><span>{d}</span></div></div>' for t, d in SERVICES)
    return (f'<div class="kicker">What we do</div><h2>Everything under one roof</h2><div class="rule"></div>'
            f'<p class="lead2">{CO["name"]} is a licensed general contractor based in Bartlett, Tennessee, serving {CO["area_long"]}.</p>'
            f'<div class="svcl">{items}</div>')


def inside_mid():
    return ('<div class="kicker">How it works</div><h2>Simple, start to finish</h2><div class="rule"></div>'
            + steps([(h, p) for h, p in HOW])
            + '<h3>Written warranties</h3><div class="rule"></div>' + warranty_strip()
            + '<p class="mini-foot">Plus manufacturer warranties on materials. Your warranty certificate is issued at closeout.</p>'
            + f'''<div class="est"><div class="kicker">Free estimates</div><div class="n">{CO['phone']}</div>
<div class="m">{CO['email']} · {CO['web']}</div></div>''')


def values_html():
    return '<div class="vals">' + ''.join(f'<div class="v">{icon("check", "#B8902F")}<b>{t}</b><span>{d}</span></div>' for t, d in VALUES) + '</div>'


def portal_html():
    return '<div class="pfeat">' + ''.join(f'<div>{icon(ic, "#0F1D2F")}<span><b>{t}</b>{d}</span></div>' for ic, t, d in PORTAL) + '</div>'


def inside_right():
    return f'''<div class="kicker">Who we are</div><h2>Built on doing it right</h2><div class="rule"></div>
<p class="lead2">{STORY}</p>
<h3>What we stand for</h3><div class="rule"></div>{values_html()}
<div class="navyblk" style="flex:1;display:flex;flex-direction:column;margin:12px -.34in -.32in;padding:.2in .34in .32in">
<div class="kicker">Customer portal</div><h2 style="font-size:13pt">Your project, online</h2><div class="rule"></div>
<p>Every GrayCo job gets its own online project page.</p>{portal_html()}
</div>'''


def brochure_general():
    k = GEN
    outside = f'<div class="sheet outside gen"><div class="tri">{brochures.flap(k)}{brochures.back(k)}{brochures.cover(k)}</div></div>'
    inside = (f'<div class="sheet inside gen"><div class="tri">'
              f'<section class="panel">{inside_left()}</section>'
              f'<section class="panel tinted">{inside_mid()}</section>'
              f'<section class="panel">{inside_right()}</section></div></div>')
    return doc(k['title'], outside + inside, brochures.CSS + GEN_CSS, 11, 8.5, k['desc'])


# ------------------------------------------------------------------ 5.5 x 8.5 flyer
FLY_CSS = r"""
.fly{width:5.5in;height:8.5in;position:relative;overflow:hidden;background:#fff;display:flex;flex-direction:column}
.fly .ftop{padding:.28in .34in .12in;text-align:center}
.fly .ftop img{width:1.9in}
.fly .fband{background:var(--navy);color:#fff;padding:.2in .34in .2in;position:relative}
.fly .fband .kicker{color:var(--gold)}
.fly .fband h1{color:#fff;font-size:24pt;margin-top:3px}
.fly .fband p{color:#D5DDE8;font-size:9.4pt;margin-top:5px;line-height:1.4}
.fly .fband .roofline{position:absolute;right:.25in;top:.14in;width:1.5in;height:.42in;opacity:.5}
.fly .fbody{padding:.16in .34in 0;flex:1;display:flex;flex-direction:column}
.fsvc{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px}
.fsvc div{border-left:3px solid var(--gold);padding:1px 0 1px 7px}
.fsvc b{display:block;font-size:10pt;line-height:1.2}
.fsvc span{font-size:8.3pt;line-height:1.32;color:var(--ink)}
.fsvc span strong{display:inline;font-size:inherit;color:var(--navy)}
.fwho{margin-top:12px;background:var(--tint);border-radius:8px;padding:10px 12px}
.fwho h3{margin-bottom:3px}
.fwho p{font-size:8.6pt;line-height:1.4}
.fvals{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px}
.fvals div{font-size:8pt;line-height:1.3;display:flex;gap:6px}
.fvals div .ic{width:11px;height:11px;margin-top:2px;flex:none}
.fvals b{display:block;font-size:8.8pt}
.fcta{margin-top:auto;background:var(--tint);border-top:2.5px solid var(--gold);margin-left:-.34in;margin-right:-.34in;padding:.14in .34in .16in;text-align:center}
.fcta .kicker{font-size:7.6pt}
.fcta .n{font-size:24pt;font-weight:800;color:var(--navy);line-height:1.1;margin-top:2px}
.fcta .m{font-size:9pt;color:var(--navy2);font-weight:600}
.fcta .l{font-size:6.6pt;color:var(--muted);margin-top:4px}
.fly h3{font-size:10.4pt;margin:0 0 4px;display:flex;align-items:center;gap:6px}
.fly .fwhy{display:grid;grid-template-columns:1fr 1fr;gap:5px 12px}
.fly .fwhy div{font-size:7.9pt;line-height:1.3;display:flex;gap:6px}
.fly .fwhy div .ic{width:11px;height:11px;margin-top:2px;flex:none}
.fly .fwhy b{display:block;font-size:8.6pt}
.fly .fhow{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:2px}
.fly .fhow div{background:var(--tint);border-radius:5px;padding:5px 4px;font-size:7pt;line-height:1.25;text-align:center;color:var(--navy);font-weight:600}
.fly .fhow div i{display:flex;width:16px;height:16px;margin:0 auto 3px;border-radius:50%;background:var(--navy);color:#fff;font-style:normal;font-weight:800;font-size:7.6pt;align-items:center;justify-content:center}
.fly .sec2{margin-top:10px}
.fly .wstrip span{font-size:6.8pt}
.fly .fqr{display:flex;gap:10px;justify-content:center;margin-top:10px}
.fly .fqr .q{width:1.18in;text-align:center;font-size:6.9pt;font-weight:700;color:var(--navy);line-height:1.2}
.fly .fqr .qr{border:1.5px solid var(--gold);margin-bottom:3px}
.fly .fnavy{margin-top:auto;background:var(--navy);color:#D5DDE8;margin-left:-.34in;margin-right:-.34in;padding:.13in .34in .14in}
.fly .fnavy b.t{color:var(--gold);font-size:11pt;display:block}
.fly .fnavy p{font-size:8pt;line-height:1.35;margin-top:2px}
.fly .fnavy p b{color:#fff}
.fly .flic{font-size:6.3pt;color:#9FB0C4;margin-top:5px}
.twoup2{display:flex}
.twoup2 .fly + .fly{border-left:1px dashed #9AA3AF}
"""


def flyer_front():
    sv = ''.join(f'<div><b>{t}</b><span>{d}</span></div>' for t, d in SERVICES)
    return f'''<div class="fly">
 <div class="ftop"><img src="{LOGO_NAVY}" alt="GrayCo Construction Services"></div>
 <div class="fband">{roofline('#C4A469', 4)}<div class="kicker">Licensed General Contractor · TN · MS · AR</div>
  <h1>One call. Done right.</h1>
  <p>Roofing, insurance claims &amp; restoration, commercial build-outs and home remodeling — with checks and balances on every job.</p></div>
 <div class="fbody"><div class="fsvc">{sv}</div>
  <div class="fwho"><h3>Who we are</h3><p>{STORY}</p></div>
  <div class="fcta"><div class="kicker">Call for a free estimate</div><div class="n">{CO['phone']}</div>
   <div class="m">{CO['email']} · {CO['web']}</div>
   <div class="l">{addr_html()} · Serving {CO['area']}</div></div></div>
</div>'''


def flyer_back():
    why = ''.join(f'<div>{icon("check", "#B8902F")}<span><b>{t}</b>{d if i != 0 else "Licensed general contractor"}</span></div>'
                  for i, (ic, t, d) in enumerate(WHY))
    how = ''.join(f'<div><i>{i}</i>{h}</div>' for i, (h, _) in enumerate(HOW, 1))
    return f'''<div class="fly">
 <div class="fbody" style="padding-top:.3in">
  <h3>Why people choose GrayCo</h3><div class="fwhy">{why}</div>
  <div class="sec2"><h3>How it works</h3><div class="fhow">{how}</div></div>
  <div class="sec2"><h3>Written warranties</h3>{warranty_strip()}</div>
  <div class="sec2"><h3>What we stand for</h3><div class="fvals">{''.join(f'<div>{icon("check", "#B8902F")}<span><b>{t}</b>{d}</span></div>' for t, d in VALUES)}</div></div>
  <div class="fqr">
   <div class="q"><div class="qr">{qr_svg(CO['web_url'])}</div>Website<br><span style="font-weight:500;color:var(--muted)">{CO['web']}</span></div>
   <div class="q"><div class="qr">{qr_svg(CO['review_url'])}</div>Google reviews<br><span style="font-weight:500;color:var(--muted)">Read &amp; leave a review</span></div>
   <div class="q"><div class="qr">{qr_svg(CO['facebook_url'])}</div>Facebook<br><span style="font-weight:500;color:var(--muted)">Follow GrayCo</span></div>
  </div>
  <div class="fnavy"><b class="t">Your project, online</b>
   <p>Every GrayCo job gets its own online project page with <b>photos, documents and invoices</b> — see your project any time.</p>
   <div class="flic">{CO['legal']} · {addr_html()} · 8 years in business — built through two previous companies, now one company: GrayCo · {lic_line(' · ')} · Fully insured — general liability &amp; workers’ comp</div></div>
 </div>
</div>'''


def flyer():
    return doc('GrayCo General Flyer', f'<div class="sheet">{flyer_front()}</div><div class="sheet">{flyer_back()}</div>',
               brochures.CSS + GEN_CSS + FLY_CSS, 5.5, 8.5, 'Half-page GrayCo flyer, front and back.')


def flyer_2up():
    return doc('GrayCo General Flyer 2-Up', f'<div class="sheet twoup2">{flyer_front()}{flyer_front()}</div>'
               f'<div class="sheet twoup2">{flyer_back()}{flyer_back()}</div>',
               brochures.CSS + GEN_CSS + FLY_CSS, 11, 8.5, 'Two half-page flyers per Letter sheet, front and back; cut down the center.')


def ALL():
    return [('brochure-general', brochure_general()), ('flyer-general', flyer()), ('flyer-general-2up-letter', flyer_2up())]


# ------------------------------------------------------------------ web
def web_general():
    import web
    sv = ''.join(f'<div class="it"><div class="dot"></div><div><b>{t}</b><span>{d}</span></div></div>' for t, d in SERVICES)
    why = ''.join(f'<div class="cb">{icon(ic, "#fff")}<div><b>{t}</b><span>{d}</span></div></div>' for ic, t, d in WHY)
    secs = (web.sec(f'<div class="kicker">What we do</div><h2>Everything under one roof</h2><div class="rule"></div><div class="svcl">{sv}</div>')
            + web.sec(f'<div class="kicker">Why GrayCo</div><h2>Why people choose GrayCo</h2><div class="rule"></div>{why}', True)
            + web.sec('<div class="kicker">How it works</div><h2>Simple, start to finish</h2><div class="rule"></div>' + steps([(h, p) for h, p in HOW])
                      + '<h3 style="margin-top:12px">Written warranties</h3><div class="rule"></div>' + warranty_strip())
            + web.sec(f'<div class="kicker">Who we are</div><h2>Built on doing it right</h2><div class="rule"></div><p class="lead2">{STORY}</p>'
                      f'<h3 style="margin-top:12px">What we stand for</h3><div class="rule"></div>{values_html()}', True)
            + f'''<section class="wsec" style="background:var(--navy)"><div class="wrap"><div class="z"><div class="navyblk" style="margin:0;padding:0;background:transparent">
<div class="kicker">Customer portal</div><h2>Your project, online</h2><div class="rule"></div>
<p>Every GrayCo job gets its own online project page.</p>{portal_html()}</div></div></div></section>''')
    h = web.hero(GEN['kicker'], GEN['cover_title'], GEN['cover_sub'], GEN['cover_points'])
    h = h.replace('<div class="btns">', f'<div class="btns"><a class="btn call big" style="grid-column:1 / -1" href="tel:{CO["phone_tel"]}">{icon("phone", "#0F1D2F")} Free estimate: {CO["phone"]}</a>', 1)
    return web.page('GrayCo Construction Services', GEN['desc'], brochures.CSS + GEN_CSS, h, secs)
