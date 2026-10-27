"""Scorecards, Checks & Balances sheet, door hanger and What-to-Expect one-pagers."""
from brand import CO, ph, lic_line, icon, qr_svg, roofline, doc, LOGO_NAVY, LOGO_WHITE

CSS = r"""
.pg{padding:.45in .5in .0in;height:100%;display:flex;flex-direction:column}
.hdr{display:flex;flex-direction:column;align-items:center;text-align:center;gap:0;padding-bottom:6px;border-bottom:2.5px solid var(--gold)}
.hdr img{width:.85in;height:auto;flex:none}
.hdr h1{font-size:16pt!important}.hdr p{margin-top:2px!important;font-size:8pt!important;line-height:1.25!important}
.pg{padding-top:.3in!important}
.hdr .t{flex:1}
.hdr h1{font-size:21pt;line-height:1.05;margin-top:2px}
.hdr p{font-size:9pt;color:var(--muted);margin-top:4px;line-height:1.35}
.ftr{margin:auto -.5in 0;background:var(--navy);color:#DCE3EC;padding:9px .5in;display:flex;justify-content:space-between;align-items:center;font-size:7.8pt;gap:10px}
.ftr b{color:#fff}
.ftr .ic{width:11px;height:11px;margin-right:3px}
.ftr .lic{color:#9FB0C4;font-size:6.9pt;text-align:right}
h2.sec{font-size:11pt;margin:12px 0 5px;display:flex;align-items:center;gap:8px}
h2.sec .n{width:18px;height:18px;border-radius:50%;background:var(--navy);color:#fff;font-size:8pt;display:inline-flex;align-items:center;justify-content:center}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:9px 22px;margin-top:11px}
.fields .wide{grid-column:1 / -1}
.typebox{font-size:8.4pt;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.typebox label{font-size:6.8pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
/* rating table */
table.rate{width:100%;border-collapse:collapse;margin-top:4px}
table.rate th{font-size:6.8pt;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;padding:3px 2px;text-align:center}
table.rate th:first-child{text-align:left}
table.rate td{border-top:1px solid var(--line2);padding:4.6px 2px;vertical-align:middle;text-align:center}
table.rate td:first-child{text-align:left}
table.rate td b{font-size:9.6pt;display:block}
table.rate td span.q{font-size:8pt;color:var(--muted)}
.bub{display:inline-flex;width:17px;height:17px;border:1.4px solid var(--navy2);border-radius:50%;align-items:center;justify-content:center;font-size:7pt;color:#8C96A3;font-weight:700}
.nps{display:flex;gap:4px;margin-top:6px;align-items:center}
.nps .b{width:26px;height:22px;border:1.4px solid var(--navy2);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8.4pt;font-weight:700;color:var(--navy2)}
.nps .lab{font-size:7pt;color:var(--muted);width:46px;line-height:1.1}
.lines .l{border-bottom:1px solid #A9B1BC;height:21px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.opt{font-size:8.6pt;margin-top:4px;display:flex;gap:18px;flex-wrap:wrap}
.opt span{display:flex;gap:6px;align-items:center}
/* review band */
.review{margin-top:12px;border:2px solid var(--gold);border-radius:10px;padding:12px 14px;display:flex;gap:16px;align-items:center;background:var(--tint)}
.review .big{width:1.35in;flex:none}
.review .txt{flex:1}
.review h3{font-size:13pt}
.review p{font-size:8.6pt;margin-top:3px}
.review .stars{color:var(--gold2);margin-bottom:2px}
.review .stars .ic{width:13px;height:13px;margin-right:1px}
.review .small2{display:flex;gap:10px;flex:none}
.review .small2 .q{width:.92in;text-align:center;font-size:6.8pt;font-weight:700;color:var(--navy);line-height:1.2}
.review .small2 .qr{border:1px solid var(--line);margin-bottom:3px}
.findus{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;font-size:8pt;color:var(--navy)}
.findus span{display:flex;gap:4px;align-items:center}
.findus .ic{width:12px;height:12px}
.note{font-size:7.8pt;color:var(--muted);margin-top:6px}
/* checklist grid */
.cgrid{display:grid;grid-template-columns:1fr 1fr;gap:3px 18px;margin-top:2px}
.cgrid div{font-size:8.4pt;display:flex;gap:7px;align-items:flex-start;line-height:1.3;padding:2px 0}
.cgrid .box{margin-top:1px;flex:none}
table.fu{width:100%;border-collapse:collapse;font-size:8pt}
table.fu th{font-size:6.8pt;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);text-align:left;padding:2px 4px;border-bottom:1.4px solid var(--navy2)}
table.fu td{border-bottom:1px solid #B9C0CA;height:21px;padding:0 4px}
.sigs{display:grid;grid-template-columns:1.2fr 1.2fr 1fr;gap:16px;margin-top:14px}
.sig .ln{border-bottom:1px solid #6B7480;height:24px}
.sig div.c{font-size:6.8pt;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-top:3px}
/* checks & balances table */
table.cb{width:100%;border-collapse:collapse;margin-top:8px}
table.cb th{font-size:6.6pt;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;padding:2px 4px;text-align:center}
table.cb th.l{text-align:left}
table.cb tr.stage td{background:var(--navy);color:#fff;padding:4px 8px;font-size:8.6pt;font-weight:800;letter-spacing:.02em}
table.cb tr.stage td span{font-weight:500;color:#C9D3DF;font-size:7.6pt;margin-left:6px}
table.cb tr.stage td em{font-style:normal;color:var(--gold);margin-right:6px}
table.cb td{border-bottom:1px solid var(--line2);padding:2.8px 4px;font-size:8.4pt;vertical-align:middle}
table.cb td.c{text-align:center;width:22px}
table.cb td.d,table.cb td.i{border-left:1px solid var(--line2)}
table.cb td.d{width:.8in}
table.cb td.i{width:.55in}
table.cb tr:nth-child(even):not(.stage) td{background:#FBFAF7}
.callbox{margin-top:10px;display:grid;grid-template-columns:1.35fr 1fr;gap:14px;align-items:stretch}
.callbox .a{border:1.5px solid var(--navy2);border-radius:8px;padding:9px 12px}
.callbox .b{background:var(--goldlt);border-radius:8px;padding:9px 12px;font-size:8.4pt;color:var(--navy)}
.callbox h3{font-size:10pt;margin-bottom:5px}
.callbox .field{margin-top:6px}
/* one-pagers */
.intro{font-size:10pt;line-height:1.45;margin-top:11px;color:var(--ink)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:6px}
.card{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:#fff}
.card.t{background:var(--tint);border-color:var(--tint)}
.card.n{background:var(--navy);border-color:var(--navy);color:#DCE3EC}
.card.n h3{color:#fff}.card.n b{color:#fff}
.card h3{font-size:10.6pt;margin-bottom:5px;display:flex;gap:7px;align-items:center}
.card h3 .ic{width:15px;height:15px}
.card ul.checks li{font-size:8.9pt;margin:4px 0}
.card ul.dots li{font-size:8.9pt;margin:3.5px 0}
.card p{font-size:8.9pt}
.tl{position:relative}
.tl .s{position:relative;padding-left:28px;margin-bottom:8px}
.tl .s .n{position:absolute;left:0;top:0;width:20px;height:20px;border-radius:50%;background:var(--navy);color:#fff;font-weight:800;font-size:8.4pt;display:flex;align-items:center;justify-content:center}
.tl .s:not(:last-child):after{content:"";position:absolute;left:9.5px;top:22px;bottom:-8px;width:1.2px;background:var(--gold)}
.tl .s h4{font-size:9.8pt}
.tl .s p{font-size:8.8pt;margin-top:1px}
table.lanes{width:100%;border-collapse:separate;border-spacing:0;margin-top:8px}
table.lanes th{background:var(--navy);color:#fff;font-size:7.6pt;letter-spacing:.07em;text-transform:uppercase;padding:6px 7px;text-align:left}
table.lanes th:first-child{border-top-left-radius:6px}
table.lanes th:last-child{border-top-right-radius:6px}
table.lanes th.you{background:#2B4C74}
table.lanes th.gc{background:#7A5B12}
table.lanes td{font-size:8.6pt;line-height:1.32;padding:5.5px 7px;border-bottom:1px solid var(--line2);vertical-align:top}
table.lanes td.ph1{width:1.45in}
table.lanes td.ph1 b{display:block;font-size:9pt}
table.lanes td.ph1 span{font-size:7.3pt;color:var(--gold2);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
table.lanes td.you{background:#F1F5FA}
table.lanes td.gc{background:#FBF7EE}
.k3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:10px}
.wt{width:100%;border-collapse:collapse;margin-top:4px}
.wt td{font-size:8.8pt;padding:4px 6px;border-bottom:1px solid var(--line2)}
.wt td:first-child{width:42%}.wt td:last-child{font-weight:700;color:var(--navy)}
"""


def header(kicker, title, sub=''):
    return (f'<div class="hdr"><img src="{LOGO_NAVY}" alt="GrayCo Construction Services"><div class="t">'
            f'<div class="kicker">{kicker}</div><h1>{title}</h1>' + (f'<p>{sub}</p>' if sub else '') + '</div></div>')


def footer():
    return (f'<div class="ftr"><div>{icon("phone", "#C4A469")}<b>{CO["phone"]}</b> &nbsp;&nbsp; '
            f'{icon("mail", "#C4A469")}{CO["email"]} &nbsp;&nbsp; {icon("globe", "#C4A469")}{CO["web"]}</div>'
            f'<div class="lic">{CO["legal"]} · {CO["addr1"]}, {CO["addr2"]}<br>{lic_line(" · ")}</div></div>')


FILL_KEYS = {'Your name': 'client', 'Customer': 'client', 'Date': 'date', 'Project address': 'address',
             'Project Manager': 'pm', 'Your Project Manager': 'pm', 'Job # / PO': 'po', 'PM phone': 'pm_phone',
             'PM cell': 'pm_phone', 'Start date': 'start_date', 'Permit #': 'permit', 'Time out': 'time_out'}


def field(label, wide=False, grow=1):
    key = FILL_KEYS.get(label, '')
    return (f'<div class="field{" wide" if wide else ""}" style="flex:{grow}"><label>{label}</label>'
            f'<div class="ln" data-fill="{key}"></div></div>')


def box(t):
    return f'<div><span class="box"></span><span>{t}</span></div>'


def jobtype():
    return ('<div class="typebox wide"><label>Type of work</label>'
            + ''.join(f'<span><span class="box" data-jobtype="{t}"></span> {t}</span>' for t in
                      ['Roofing', 'Insurance / restoration', 'Residential remodel', 'Commercial'])
            + '</div>')


RATINGS = [
    ('Communication', 'Did we keep you informed and respond quickly?'),
    ('Schedule', 'Did we show up and finish when we said we would?'),
    ('Cleanliness', 'Was the job site kept clean and safe each day?'),
    ('Quality of work', 'Are you happy with the finished workmanship?'),
    ('Professionalism', 'Were our crew and subcontractors respectful of your property?'),
    ('Paperwork &amp; billing', 'Was everything clear, in writing and as agreed?'),
]


def rating_table(rows=RATINGS):
    head = '<tr><th style="width:52%"></th>' + ''.join(f'<th>{h}</th>' for h in ['Poor', 'Fair', 'Good', 'Very good', 'Excellent']) + '</tr>'
    body = ''.join(f'<tr><td><b>{t}</b><span class="q">{q}</span></td>' + ''.join(f'<td><span class="bub">{i}</span></td>' for i in range(1, 6)) + '</tr>' for t, q in rows)
    return f'<table class="rate">{head}{body}</table>'


def nps():
    return ('<div class="nps"><div class="lab">Not likely</div>' + ''.join(f'<div class="b">{i}</div>' for i in range(11))
            + '<div class="lab" style="text-align:right">Extremely likely</div></div>')


def lines(n):
    return '<div class="lines">' + '<div class="l"></div>' * n + '</div>'


def review_band(title='Happy with your project? Leave us a Google review.', text=None):
    text = text or 'A quick review helps other families and businesses find a contractor they can trust — and it means the world to our team. Point your phone camera at the code.'
    stars = ''.join(icon('star', '#B8902F') for _ in range(5))
    return f'''<div class="review">
  <div class="big"><div class="qr" style="border:2px solid var(--gold)">{qr_svg(CO['review_url'])}</div></div>
  <div class="txt"><div class="stars">{stars}</div><h3>{title}</h3><p>{text}</p>
    <div class="findus"><b>Find us on:</b><span>{icon('google', '#4A6FA5')} Google</span><span>{icon('fb', '#1877F2')} {CO['facebook_label']}</span><span>{icon('globe', '#1A3A5F')} {CO['web']}</span></div></div>
  <div class="small2">
    <div class="q"><div class="qr">{qr_svg(CO['facebook_url'])}</div>Facebook</div>
    <div class="q"><div class="qr">{qr_svg(CO['web_url'])}</div>Website</div>
  </div>
</div>'''


# ======================================================== 2a customer scorecard
def scorecard_customer():
    body = f'''<div class="sheet"><div class="pg">
{header('Customer Scorecard', 'How did we do?', 'Your honest feedback goes straight to our office. It is one of the ways we keep every crew — and every Project Manager — accountable.')}
<div class="fields">{field('Your name')}{field('Date')}{field('Project address', True)}{field('Project Manager')}{field('Job # / PO')}{jobtype()}</div>
<h2 class="sec"><span class="n">1</span> Rate your experience <span class="small" style="font-weight:500">— circle one number per line</span></h2>
{rating_table()}
<h2 class="sec"><span class="n">2</span> How likely are you to recommend GrayCo to a friend or neighbor?</h2>
{nps()}
<div class="two" style="margin-top:4px">
 <div><h2 class="sec"><span class="n">3</span> What did we do well?</h2>{lines(3)}</div>
 <div><h2 class="sec"><span class="n">4</span> What could we do better?</h2>{lines(3)}</div>
</div>
<div class="opt" style="margin-top:9px"><span><span class="box"></span> You may share my comments (first name &amp; city only)</span><span><span class="box"></span> Please call me — I have a question or concern</span></div>
{review_band()}
<p class="note">Hand this card to your Project Manager, mail it to {CO['addr1']}, {CO['addr2']}, or email a photo of it to {CO['email']}. Concerns are reviewed by the office, not just the crew.</p>
{footer()}
</div></div>'''
    return doc('GrayCo Customer Scorecard', body, CSS, 8.5, 11, 'One-page customer scorecard with Google review QR.')


# ======================================================== 2b PM closeout scorecard
def scorecard_closeout():
    checks = ['Punch list complete &amp; signed off by customer', 'Final walkthrough completed together',
              'Final inspection passed / permit closed (if required)', 'Final completion photos in CompanyCam',
              'Site clean — debris, nails &amp; materials removed', 'Warranty certificate reviewed &amp; signed',
              'Completion certificate signed (Final Inspection Sign-Off, Substantial Completion, or Completion &amp; Satisfaction)',
              'Manufacturer warranties &amp; care info handed over', 'Warranty registration card given',
              'Final invoice reviewed — balance explained', 'Customer knows final lien waiver follows final payment',
              'Customer knows how to file a warranty claim']
    rows = [(t, '') for t, _ in RATINGS[:5]] + [('Would recommend us', '')]
    rate = '<tr><th style="width:44%"></th>' + ''.join(f'<th>{h}</th>' for h in ['1', '2', '3', '4', '5']) + '</tr>' + ''.join(
        f'<tr><td><b style="font-size:8.8pt">{t}</b></td>' + ''.join('<td><span class="bub" style="width:15px;height:15px"> </span></td>' for _ in range(5)) + '</tr>' for t, _ in rows)
    body = f'''<div class="sheet"><div class="pg">
{header('Closeout Review · PM &amp; Customer', 'Project closeout scorecard', 'Filled in together at the final walkthrough: the PM reads each item aloud, you confirm, and our office files it.')}
<div class="fields">{field('Customer')}{field('Date')}{field('Project address', True)}{field('Project Manager')}{field('Job # / PO')}{jobtype()}</div>
<h2 class="sec"><span class="n">A</span> Closeout checklist <span class="small" style="font-weight:500">— check together</span></h2>
<div class="cgrid">{''.join(box(c) for c in checks)}</div>
<div class="two">
 <div><h2 class="sec"><span class="n">B</span> Customer rating <span class="small" style="font-weight:500">1 = poor · 5 = excellent</span></h2>
  <table class="rate">{rate}</table></div>
 <div><h2 class="sec"><span class="n">C</span> Open items &amp; follow-ups</h2>
  <table class="fu"><tr><th>Item</th><th style="width:22%">Who</th><th style="width:22%">Due</th><th style="width:12%">Done</th></tr>{'<tr><td></td><td></td><td></td><td></td></tr>' * 5}</table>
  <h2 class="sec" style="margin-top:9px"><span class="n">D</span> Customer comments</h2>{lines(2)}</div>
</div>
<h2 class="sec"><span class="n">E</span> Review &amp; referral</h2>
<div class="opt" style="margin-top:0"><span><span class="box"></span> Scanned Google review QR on site</span><span><span class="box"></span> Review link texted / emailed</span><span><span class="box"></span> Not right now</span><span><span class="box"></span> OK to share comments (first name &amp; city)</span></div>
{review_band('Scan now: leave GrayCo a Google review', 'If the customer is happy, ask them to scan this code while you are together — it takes about a minute. Never offer anything in exchange for a review.')}
<div class="sigs">
 <div class="sig"><div class="ln"></div><div class="c">Customer signature</div></div>
 <div class="sig"><div class="ln"></div><div class="c">Project Manager signature</div></div>
 <div class="sig"><div class="ln"></div><div class="c">Office review — initials / date</div></div>
</div>
{footer()}
</div></div>'''
    return doc('GrayCo Closeout Scorecard', body, CSS, 8.5, 11, 'Closeout scorecard completed by the PM with the customer at final walkthrough.')


# ======================================================== 3 checks & balances sheet
CB_STAGES = [
    ('1', 'Pre-start', 'before work begins', [
        'Signed contract / Work Authorization on file',
        'Permit obtained and posted (if required)',
        'Pre-construction meeting held — scope, schedule, access &amp; protection reviewed',
        'Existing conditions photographed (CompanyCam)',
        'Materials, colors &amp; selections confirmed with owner',
        'Required owner notices delivered (e.g., Arkansas pre-construction notice)',
    ]),
    ('2', 'Daily', 'logged in the daily job report · PM initials weekly', [
        'Site cleaned, secured and safe at end of each day',
        'Progress photos uploaded to CompanyCam',
        'Daily job report logged',
        'Deliveries checked against the order (Material Delivery Receipt)',
    ]),
    ('3', 'Mid-job', 'quality &amp; paperwork check', [
        'Work checked against scope, plans &amp; manufacturer specifications',
        'Required inspections passed (e.g., rough-in)',
        'Hidden conditions photographed &amp; discussed with owner before proceeding',
        'Every change on a signed Change Order before the work is done',
        'Schedule reviewed with owner; invoice matches completed milestone',
    ]),
    ('4', 'Punch list', 'walk it, write it, fix it, re-check it', [
        'Punch walk with owner — items listed in writing',
        'All punch items completed',
        'Punch items re-checked by PM',
    ]),
    ('5', 'Final walkthrough', 'closeout', [
        'Final walkthrough with owner',
        'Final inspection passed / permit closed (if required)',
        'Final completion photos uploaded (20+)',
        'Site fully cleaned — all debris, nails &amp; materials removed',
        'Owner sign-off / completion certificate signed',
        'Warranty certificate issued',
        'Subcontractor lien waivers collected; GrayCo final lien waiver provided after final payment',
    ]),
]


def checks_sheet():
    rows = ''
    for n, name, sub, items in CB_STAGES:
        rows += f'<tr class="stage"><td colspan="5"><em>{n}</em>{name.upper()}<span>{sub}</span></td></tr>'
        rows += ''.join(f'<tr><td class="c"><span class="box"></span></td><td>{t}</td><td class="d"></td><td class="i"></td><td class="i"></td></tr>' for t in items)
    body = f'''<div class="sheet"><div class="pg">
{header('Checks &amp; Balances', 'Your project quality record', 'This sheet stays on your job site. Your Project Manager checks each item in the field; our office reviews and initials it. You can see every check as it happens.')}
<div class="fields" style="grid-template-columns:1.3fr 1fr 1fr">{field('Customer')}{field('Job # / PO')}{field('Start date')}</div>
<div class="fields" style="grid-template-columns:2.3fr 1fr;margin-top:8px">{field('Project address')}{field('Permit #')}</div>
<table class="cb"><tr><th style="width:22px"></th><th class="l">Check</th><th>Date</th><th>PM</th><th>Office</th></tr>{rows}</table>
<div class="callbox">
 <div class="a"><h3>Who to call</h3>
  <div style="display:flex;gap:14px">{field('Your Project Manager', grow=1.4)}{field('PM phone')}</div>
  <div style="font-size:8.6pt;margin-top:7px">{icon('phone', '#1A3A5F')} <b>Office: {CO['phone']}</b> &nbsp; {icon('mail', '#1A3A5F')} {CO['email']}</div>
  <div style="font-size:7.8pt;color:var(--muted);margin-top:2px">After-hours emergencies: {CO['emergency']}</div></div>
 <div class="b"><b>Something doesn’t look right?</b><br>Call the office directly — any time. Our office reviews every stage independently of the field crew. That’s the “balance” in checks &amp; balances.</div>
</div>
{footer()}
</div></div>'''
    return doc('GrayCo Checks and Balances Sheet', body, CSS, 8.5, 11, 'Job-site leave-behind quality record with stage checks, dates and PM/office initials.')


# ======================================================== 3b door hanger
HANGER_CSS = r"""
.hang{width:4.25in;height:11in;position:relative;overflow:hidden;background:#fff;display:flex;flex-direction:column}
.hang .top{background:var(--navy);color:#fff;padding:1.95in .32in .22in;position:relative;text-align:center}
.hang .hole{position:absolute;left:50%;top:.42in;width:1.3in;height:1.3in;margin-left:-.65in;border-radius:50%;border:1.2px dashed rgba(255,255,255,.55);background:#fff}
.hang .slit{position:absolute;left:50%;top:0;width:0;height:.42in;border-left:1.2px dashed rgba(255,255,255,.55)}
.hang .top img{width:1.95in}
.hang .top .kicker{color:var(--gold);margin-top:10px}
.hang .top h1{color:#fff;font-size:20pt;margin-top:2px}
.hang .top p{color:#C9D3DF;font-size:8.6pt;margin-top:3px}
.hang .body{padding:.16in .3in 0;flex:1;display:flex;flex-direction:column}
.hang h3{font-size:9.6pt;margin:9px 0 3px;text-transform:uppercase;letter-spacing:.06em}
.hang .stg{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;text-align:center}
.hang .stg div{border:1.2px solid var(--line);border-radius:5px;padding:4px 1px 3px;font-size:6.9pt;font-weight:700;color:var(--navy)}
.hang .stg .box{display:block;margin:0 auto 3px}
.hang .cl div{font-size:8.6pt;display:flex;gap:7px;align-items:center;padding:2.2px 0}
.hang .field{margin-top:7px}
.hang .body > .field{flex:none}
.hang .lines .l{height:19px}
.hang .who{margin-top:auto;background:var(--tint);border-top:2px solid var(--gold);padding:9px .3in 10px;margin-left:-.3in;margin-right:-.3in;display:flex;gap:10px;align-items:center}
.hang .who .qr{width:.8in;flex:none;border:1px solid var(--line)}
.hang .who .t{font-size:8pt;line-height:1.35}
.hang .who .t b.ph1{font-size:11pt}
.hang .lic{font-size:6.4pt;color:var(--muted);text-align:center;padding:4px 0 .2in}
.twoup{display:flex}
.twoup .hang + .hang{border-left:1px dashed #9AA3AF}
"""


def hanger():
    stages = ''.join(f'<div><span class="box"></span>{s}</div>' for s in ['Pre-start', 'Daily', 'Mid-job', 'Punch', 'Final'])
    return f'''<div class="hang">
  <div class="top"><div class="slit"></div><div class="hole"></div>
    <img src="{LOGO_WHITE}" alt="GrayCo Construction Services">
    <div class="kicker">Checks &amp; balances</div>
    <h1>We were here today</h1>
    <p>A quick record of today’s work on your project.</p></div>
  <div class="body">
    <div style="display:flex;gap:10px">{field('Date')}{field('Time out')}</div>
    <h3>Project stage</h3><div class="stg">{stages}</div>
    <h3>Today we</h3>{lines(4)}
    <h3>Before we left</h3>
    <div class="cl">{box('Site cleaned up &amp; safe')}{box('Work area secured / locked')}{box('Materials stored or covered')}{box('Progress photos uploaded (CompanyCam)')}{box('Daily job report logged')}</div>
    <h3>We need from you</h3>{lines(2)}
    <h3>Next step / next visit</h3>{lines(2)}
    {field('Project Manager')}
    {field('PM phone')}
    <div class="who"><div class="qr">{qr_svg(CO['web_url'])}</div>
      <div class="t">Questions or concerns? Call the office directly:<br><b class="ph1">{CO['phone']}</b><br>{CO['email']}<br>{CO['web']}</div></div>
    <div class="lic">{CO['legal']} · {CO['addr1']}, {CO['addr2']}<br>{lic_line(' · ')}</div>
  </div>
</div>'''


def door_hanger():
    return doc('GrayCo Door Hanger', f'<div class="sheet">{hanger()}</div>', CSS + HANGER_CSS, 4.25, 11,
               'Door hanger / site sign, 4.25 x 11 in: daily check and project stage.')


def door_hanger_2up():
    return doc('GrayCo Door Hanger 2-Up', f'<div class="sheet twoup">{hanger()}{hanger()}</div>', CSS + HANGER_CSS, 8.5, 11,
               'Two door hangers on one US Letter sheet; cut down the center line.')


# ======================================================== 4a first day
def expect_first_day():
    body = f'''<div class="sheet"><div class="pg">
{header('What to expect', 'Your first day on site', 'A smooth start makes for a smooth project. Here is how to get ready, what happens on Day 1, and who to call.')}
<div class="cols">
 <div>
  <div class="card t"><h3>{icon('clip', '#1A3A5F')} Before we arrive — your checklist</h3><ul class="checks">
   <li>{icon('check', '#B8902F')}Clear the work area; move valuables and fragile items</li>
   <li>{icon('check', '#B8902F')}Plan for pets and kids to stay away from the work area</li>
   <li>{icon('check', '#B8902F')}Tell us about parking, gate codes, alarms and access</li>
   <li>{icon('check', '#B8902F')}Point out anything you want protected — landscaping, fixtures, finishes</li>
   <li>{icon('check', '#B8902F')}Finalize your selections (they must be set before rough-in)</li>
   <li>{icon('check', '#B8902F')}Let us know about HOA or building-management rules</li>
   <li>{icon('check', '#B8902F')}Have your questions ready for the walkthrough</li></ul></div>
  <div class="card" style="margin-top:12px"><h3>{icon('clock', '#1A3A5F')} Every day after Day 1</h3><ul class="dots">
   <li><b>Work hours:</b> typically {CO['work_hours']}, unless your contract says otherwise (commercial: per building rules).</li>
   <li><b>Clean-up:</b> the site is cleaned and secured at the end of every day.</li>
   <li><b>Photos:</b> daily progress photos on CompanyCam — view your project anytime.</li>
   <li><b>Communication:</b> same-day response to calls, texts and emails; immediate notice of any schedule change.</li>
   <li><b>Checks &amp; Balances sheet:</b> stays on site so you can see each stage checked and initialed.</li></ul></div>
 </div>
 <div>
  <h2 class="sec" style="margin-top:0">What happens on Day 1</h2>
  <div class="tl">
   <div class="s"><div class="n">1</div><h4>Your PM introduces the team</h4><p>You’ll meet your Project Manager — your single point of contact for the whole job.</p></div>
   <div class="s"><div class="n">2</div><h4>Walkthrough of the scope</h4><p>We walk the work area together and confirm the scope, schedule and work hours.</p></div>
   <div class="s"><div class="n">3</div><h4>Existing conditions photographed</h4><p>Before anything is touched we document the area, so there is a clear before-and-after record.</p></div>
   <div class="s"><div class="n">4</div><h4>Set-up &amp; protection</h4><p>Safety set-up, protection of the areas we discussed, and placement of materials and the dumpster (if needed).</p></div>
   <div class="s"><div class="n">5</div><h4>Checks &amp; Balances sheet posted</h4><p>Pre-start items are checked, dated and initialed — then work begins.</p></div>
  </div>
  <div class="card n" style="margin-top:6px"><h3>{icon('doc', '#C4A469')} Changes &amp; surprises</h3>
   <p>Want to change something? We write a <b>Change Order</b> and get your signature <b>before</b> that work starts. If we find a hidden condition (rot, mold, structural), we stop, photograph it and talk with you about options first.</p></div>
  <div class="card" style="margin-top:12px"><h3>{icon('phone', '#1A3A5F')} Who to call</h3>
   {field('Project Manager')}<div style="height:6px"></div>{field('PM cell')}
   <p style="margin-top:7px"><b>Office:</b> {CO['phone']} · {CO['email']}<br><b>PM hours:</b> {CO['pm_hours']}<br><b>After-hours emergency:</b> {CO['emergency']}</p></div>
 </div>
</div>
<div class="k3" style="margin-top:14px">
 <div class="card"><h3>{icon('shield', '#1A3A5F')} Safety</h3><p>Please treat the work area as off-limits while crews are working. Our crews follow OSHA-compliant safety practices, including fall protection on roofs.</p></div>
 <div class="card"><h3>{icon('clip', '#1A3A5F')} Permits &amp; inspections</h3><p>GrayCo handles permit applications unless your contract says otherwise. Your PM coordinates required inspections and records them on your Checks &amp; Balances sheet.</p></div>
 <div class="card"><h3>{icon('doc', '#1A3A5F')} Payments</h3><p>Progress payments are tied to the milestones in your contract. On insurance jobs your share is your deductible unless you approve extra work. Final payment follows the final walkthrough.</p></div>
</div>
{footer()}
</div></div>'''
    return doc('GrayCo First Day on Site', body, CSS, 8.5, 11, 'What to expect on the first day of a GrayCo project.')


# ======================================================== 4b insurance claim timeline
def expect_claim():
    rows = [
        ('Protect the property', 'Day 1', 'Keep everyone safe. Call us for emergency help.', 'Board-up, tarping or water extraction to stop further damage (24/7).', '—'),
        ('Report the claim', 'Day 1–2', 'Report the loss; get a claim number. Keep receipts for emergency costs.', 'Help you gather photos and details for the report.', 'Opens the claim; assigns an adjuster.'),
        ('Inspect &amp; document', 'First days', 'Share your claim #, adjuster contact and policy paperwork.', 'Photograph and document all damage; prepare our own independent estimate.', '—'),
        ('Authorize the work', 'Before work', 'Sign the Work Authorization. You may cancel within 3 business days.', 'Explain the form and what GrayCo will do on your behalf.', '—'),
        ('Adjuster inspection', 'Per insurer', 'Be available if possible.', 'Meet the adjuster on site with our photos, measurements and estimate.', 'Inspects and writes the scope of loss.'),
        ('Approved scope', 'After inspection', 'Review the scope with us. Pay your deductible as your policy requires.', 'Walk you through the scope line by line; schedule the work.', 'Issues payment, less the deductible and any held-back depreciation.'),
        ('Mitigation &amp; drying', 'Water / fire', 'Allow access for daily monitoring.', 'Water: extraction, drying with daily moisture readings. Fire: smoke/soot removal, odor treatment, demo.', '—'),
        ('Rebuild &amp; supplements', 'Per scope', 'Approve any work outside the insurance scope in writing.', 'Restore to pre-loss condition. Hidden damage is photographed and submitted as a supplement.', 'Reviews and approves supplements.'),
        ('Completion &amp; sign-off', 'End of job', 'Walk the finished work; sign the Certificate of Completion &amp; Satisfaction.', 'Final walkthrough, punch list, final clean-up.', 'Receives completion documents.'),
        ('Final funds &amp; warranty', 'Closeout', 'Keep your closeout documents.', 'Issue your written warranty and final lien waiver after final payment.', 'Releases final / recoverable depreciation.'),
    ]
    tr = ''.join(f'<tr><td class="ph1"><span>{w}</span><b>{p}</b></td><td class="you" data-label="You">{y}</td><td class="gc" data-label="GrayCo">{g}</td><td class="ins{' empty' if i == '—' else ''}" data-label="Your insurer">{i}</td></tr>' for p, w, y, g, i in rows)
    body = f'''<div class="sheet"><div class="pg">
{header('What to expect · Insurance claims', 'Your insurance claim timeline', 'Who does what — from the day damage happens to your final walkthrough. Every claim is different; your PM will tell you where you are at each step.')}
<table class="lanes"><tr><th>Step</th><th class="you">You</th><th class="gc">GrayCo</th><th>Your insurance company</th></tr>{tr}</table>
<div class="k3">
 <div class="card t"><h3>{icon('clock', '#1A3A5F')} Typical durations</h3><ul class="dots">
  <li><b>Water:</b> emergency mitigation 1–3 days; structural drying 3–5 days (monitored daily until dry standards are met); rebuild per approved scope.</li>
  <li><b>Fire:</b> board-up Day 1; mitigation weeks 1–2; engineer review if needed weeks 2–3; then rebuild.</li>
  <li>Supplements for hidden damage can extend the timeline.</li></ul></div>
 <div class="card n"><h3>{icon('shield', '#C4A469')} Honest about your deductible</h3>
  <p><b>We never ask you to inflate or skip your deductible</b> — and we never offer to “cover” it. Your out-of-pocket cost is limited to your deductible unless you approve extra work in writing.</p></div>
 <div class="card"><h3>{icon('doc', '#1A3A5F')} Paperwork you’ll see</h3><ul class="dots">
  <li>Work Authorization (3-day right to cancel)</li><li>Our estimate &amp; the insurer’s scope</li><li>Supplements, with photos</li>
  <li>Change Orders for out-of-scope work</li><li>Certificate of Completion &amp; Satisfaction</li><li>Warranty certificate &amp; lien waiver</li></ul></div>
</div>
<p class="note" style="margin-top:8px">Your insurance company decides what your policy covers. GrayCo documents the damage, communicates with your adjuster and keeps you informed — you will receive copies of what we submit.</p>
{footer()}
</div></div>'''
    return doc('GrayCo Insurance Claim Timeline', body, CSS, 8.5, 11, 'Insurance claim timeline: what the homeowner, GrayCo and the insurer each do.')


# ======================================================== 4c after your project
def expect_after():
    body = f'''<div class="sheet"><div class="pg">
{header('What to expect · After your project', 'Thank you — here’s what comes next', 'Your project is complete, but we are not going anywhere. Keep this page with your closeout documents.')}
<div class="cols">
 <div>
  <div class="card t"><h3>{icon('doc', '#1A3A5F')} Keep these together</h3><ul class="checks">
   <li>{icon('check', '#B8902F')}Contract and any signed Change Orders</li>
   <li>{icon('check', '#B8902F')}Final sign-off / completion certificate</li>
   <li>{icon('check', '#B8902F')}Your GrayCo warranty certificate</li>
   <li>{icon('check', '#B8902F')}Warranty registration card (return a copy to us)</li>
   <li>{icon('check', '#B8902F')}Final lien waiver (after final payment)</li>
   <li>{icon('check', '#B8902F')}Manufacturer warranties &amp; care guides</li>
   <li>{icon('check', '#B8902F')}Your Checks &amp; Balances sheet</li></ul></div>
  <div class="card" style="margin-top:12px"><h3>{icon('shield', '#1A3A5F')} Your workmanship warranty</h3>
   <table class="wt"><tr><td>Roofing — all roofs</td><td>{ph('WARRANTY TERM — ROOFING')}</td></tr>
   <tr><td>Residential remodel</td><td>{ph('WARRANTY TERM — RESIDENTIAL')}</td></tr>
   <tr><td>Insurance / restoration</td><td>{ph('WARRANTY TERM — INSURANCE/RESTORATION')}</td></tr>
   <tr><td>Commercial</td><td>{ph('WARRANTY TERM — COMMERCIAL')}</td></tr></table>
   <p style="margin-top:6px;font-size:8.4pt">Starts on the completion date on your certificate. Your warranty certificate is the controlling document.</p>
   <p style="margin-top:5px;font-size:8.4pt"><b>Covered:</b> defects in workmanship by GrayCo or its subcontractors, and improper installation of GrayCo-supplied materials. Manufacturer warranties apply to materials.</p>
   <p style="margin-top:4px;font-size:8.4pt"><b>Not covered:</b> owner-supplied materials, normal wear and tear, damage after completion by owners/tenants or others, new damage events or natural disasters, and work by contractors not hired by GrayCo.</p></div>
 </div>
 <div>
  <div class="card n"><h3>{icon('phone', '#C4A469')} Need warranty service?</h3>
   <p>Call <b>{CO['phone']}</b> or email <b>{CO['email']}</b> with your name, address, job # and a photo if you can. <b>We respond within 24 hours.</b><br>After-hours emergencies: {CO['emergency']}</p></div>
  <div class="card" style="margin-top:12px"><h3>{icon('key', '#1A3A5F')} Caring for your project</h3>
   <p style="font-size:8.2pt;color:var(--muted);margin-bottom:3px">General tips — always follow the manufacturer care guides we leave with you.</p><ul class="dots">
   <li><b>Roofs:</b> keep gutters and valleys clear; check from the ground after major storms — please don’t walk on the roof.</li>
   <li><b>Tile &amp; showers:</b> use non-abrasive cleaners; keep caulk joints in good shape and ventilate after showers.</li>
   <li><b>Paint &amp; drywall:</b> let new paint cure before scrubbing; keep leftover paint for touch-ups.</li>
   <li><b>Floors:</b> use felt pads under furniture; clean spills promptly.</li>
   <li><b>After water damage:</b> tell us right away about any new staining, odor or soft spots.</li>
   <li><b>Commercial:</b> report tenant modifications that affect our work before they happen.</li></ul></div>
 </div>
</div>
{review_band('How did we do? Share it in a Google review.', 'If we earned it, a quick review helps your neighbors find a contractor they can trust. Point your phone camera at the code — it takes about a minute.')}
{footer()}
</div></div>'''
    return doc('GrayCo After Your Project', body, CSS, 8.5, 11, 'After-project page: documents to keep, warranty, maintenance and review request.')


def ALL():
    return [
        ('scorecard-customer', scorecard_customer()),
        ('scorecard-closeout-pm', scorecard_closeout()),
        ('checks-and-balances-sheet', checks_sheet()),
        ('door-hanger', door_hanger()),
        ('door-hanger-2up-letter', door_hanger_2up()),
        ('expect-first-day', expect_first_day()),
        ('expect-insurance-claim-timeline', expect_claim()),
        ('expect-after-your-project', expect_after()),
    ]
