"""Mobile-first, single-column web versions (send by email / text / Facebook).
Self-contained: inline CSS + inline logo, no network. Reuses the print content."""
import brochures, forms
from brand import CO, BASE_CSS, icon, lic_line, LOGO_NAVY, LOGO_WHITE

WEB_CSS = r"""
html,body{font-size:16px;background:#fff;color-scheme:light}
body.web{min-height:100vh}
.web .sheet,.web .panel,.web .pg{width:auto!important;height:auto!important;overflow:visible!important;
  box-shadow:none!important;margin:0!important;padding:0!important;background:transparent;display:block}
.wrap{max-width:640px;margin:0 auto;padding:0 16px}
.wtop{background:#fff;border-bottom:3px solid var(--gold);padding:10px 16px;display:flex;align-items:center;justify-content:space-between}
.wtop img{height:46px;width:auto}
.wtop a{font-weight:800;color:var(--navy);text-decoration:none;font-size:15px}
.hero{background:var(--navy);color:#fff;padding:26px 0 24px}
.hero .kicker{color:var(--gold);font-size:11px}
.hero h1{color:#fff;font-size:28px;line-height:1.12;margin-top:8px}
.hero .rule{background:var(--gold);width:48px;height:3px;margin:14px 0}
.hero p{color:#D5DDE8;font-size:16px;line-height:1.5}
.hero ul{list-style:none;margin-top:14px}
.hero li{font-size:15px;font-weight:600;padding:4px 0 4px 24px;position:relative}
.hero li .ic{position:absolute;left:0;top:8px;width:15px;height:15px}
.btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:10px;font-weight:800;font-size:15px;
  text-decoration:none;padding:10px 12px;text-align:center;line-height:1.2}
.btn .ic{width:18px;height:18px}
.btn.call{background:var(--gold);color:var(--navy)}
.btn.mail{background:#fff;color:var(--navy)}
.btn.rev{grid-column:1 / -1;background:#fff;color:var(--navy);border:2px solid var(--gold)}
.btn.fb{grid-column:1 / -1;background:#1877F2;color:#fff}
.btn.big{font-size:17px;min-height:56px}
.wsec{padding:22px 0;border-bottom:1px solid var(--line2)}
.wsec.t{background:var(--tint)}
.wsec .z{zoom:1.32;font-size:9.2pt;line-height:1.38}
.web .cb span{display:block}
.web table.lanes td.empty{display:none}
.web .split{grid-template-columns:1fr!important}
.web .svc{grid-template-columns:1fr 1fr}
.web .pull,.web .wbox{margin-top:12px!important}
.web .hdr,.web .ftr,.web .field,.web .review{display:none!important}
.web .cols,.web .k3,.web .two{grid-template-columns:1fr!important;gap:14px!important}
.web .card{margin-top:0}
/* claim lanes -> cards on phones */
.web table.lanes,.web table.lanes tbody,.web table.lanes tr,.web table.lanes td{display:block;width:100%!important}
.web table.lanes tr:first-child{display:none}
.web table.lanes tr{border:1px solid var(--line);border-radius:8px;margin-bottom:10px;overflow:hidden}
.web table.lanes td{border-bottom:1px solid var(--line2)}
.web table.lanes td[data-label]:before{content:attr(data-label);display:block;font-size:7pt;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.web table.lanes td.ph1{background:var(--navy)}
.web table.lanes td.ph1 b{color:#fff}
.web table.lanes td.ph1 span{color:var(--gold)}
.revcard{margin:22px 0;border:2px solid var(--gold);border-radius:12px;background:var(--tint);padding:18px;text-align:center}
.revcard .stars .ic{width:20px;height:20px;margin:0 1px}
.revcard h2{font-size:21px;margin-top:6px}
.revcard p{font-size:15px;color:var(--ink);margin:6px 0 14px;line-height:1.45}
.wfoot{background:var(--navy);color:#C9D3DF;padding:24px 0 96px;font-size:14px;line-height:1.5}
.wfoot img{width:150px;display:block;margin-bottom:12px}
.wfoot a{color:#fff;text-decoration:none;font-weight:600}
.wfoot .row{display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.wfoot .row .ic{width:18px;height:18px}
.wfoot .lic{font-size:12px;color:#9FB0C4;margin-top:12px}
.actbar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(3,1fr);
  padding:8px 8px calc(8px + env(safe-area-inset-bottom));gap:8px;z-index:10;box-shadow:0 -4px 14px rgba(15,29,47,.12)}
.actbar a{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:12px;font-weight:800;color:var(--navy);text-decoration:none;padding:4px 0;border-radius:8px}
.actbar a .ic{width:20px;height:20px}
.actbar a.r{background:var(--gold)}
/* scorecard */
.q{padding:14px 0;border-bottom:1px solid var(--line2)}
.q b{font-size:16px;display:block}
.q span.h{font-size:14px;color:var(--muted)}
.scale{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px}
.scale.n11{grid-template-columns:repeat(6,1fr)}
.scale input{position:absolute;opacity:0;pointer-events:none}
.scale label{display:flex;align-items:center;justify-content:center;min-height:44px;border:2px solid var(--navy2);border-radius:8px;font-weight:800;color:var(--navy2);font-size:16px}
.scale input:checked + label{background:var(--navy);color:#fff;border-color:var(--navy)}
.scale input:focus-visible + label{outline:3px solid var(--gold);outline-offset:2px}
.ends{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:4px}
.inp{display:block;margin-top:12px}
.inp span{font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.inp input,.inp textarea{width:100%;font:inherit;font-size:16px;padding:10px 12px;border:1.5px solid #B8C0CB;border-radius:8px;margin-top:4px;background:#fff;color:var(--ink)}
.chk{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-size:15px}
.chk input{width:22px;height:22px;flex:none;margin-top:1px}
.send{width:100%;border:0;cursor:pointer;margin-top:18px;background:var(--navy);color:#fff}
.hint{font-size:13px;color:var(--muted);margin-top:8px}
"""


def page(title, desc, css, hero, sections, review_text=None):
    rev = review_card(review_text)
    stars = ''
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><title>{title}</title><meta name="description" content="{desc}">
<style>{BASE_CSS}{css}{WEB_CSS}</style></head>
<body class="web">
<header class="wtop"><img src="{LOGO_NAVY}" alt="GrayCo Construction Services"><a href="tel:{CO['phone_tel']}">{CO['phone']}</a></header>
{hero}
<main>{sections}<div class="wrap">{rev}</div></main>
{wfooter()}
<nav class="actbar" aria-label="Contact GrayCo">
 <a href="tel:{CO['phone_tel']}">{icon('phone', '#0F1D2F')}Call</a>
 <a href="mailto:{CO['email']}">{icon('mail', '#0F1D2F')}Email</a>
 <a class="r" href="{CO['review_url']}" target="_blank" rel="noopener">{icon('star', '#0F1D2F')}Review us</a>
</nav>
</body></html>
'''


_fb = icon('fb', '#fff')
FB_BTN_ICON = _fb[:_fb.rfind('fill="#fff"')] + 'fill="#1877F2"' + _fb[_fb.rfind('fill="#fff"') + len('fill="#fff"'):]


def buttons():
    return f'''<div class="btns">
 <a class="btn call" href="tel:{CO['phone_tel']}">{icon('phone', '#0F1D2F')} Call us</a>
 <a class="btn mail" href="mailto:{CO['email']}">{icon('mail', '#1A3A5F')} Email us</a>
 <a class="btn rev" href="{CO['review_url']}" target="_blank" rel="noopener">{icon('star', '#B8902F')} Read &amp; leave Google reviews</a>
 <a class="btn fb" href="{CO['facebook_url']}" target="_blank" rel="noopener">{FB_BTN_ICON} Follow us on Facebook</a>
</div>'''


def hero(kicker, title, sub, points=()):
    pts = ''.join(f'<li>{icon("check", "#C4A469")}{p}</li>' for p in points)
    return f'''<section class="hero"><div class="wrap"><div class="kicker">{kicker}</div><h1>{title}</h1><div class="rule"></div>
<p>{sub}</p>{f"<ul>{pts}</ul>" if pts else ""}{buttons()}</div></section>'''


def review_card(text=None):
    text = text or 'A quick Google review helps your neighbors find a contractor they can trust — and it means the world to our team.'
    stars = ''.join(icon('star', '#B8902F') for _ in range(5))
    return f'''<div class="revcard"><div class="stars">{stars}</div><h2>Worked with GrayCo?</h2><p>{text}</p>
<a class="btn call big" href="{CO['review_url']}" target="_blank" rel="noopener">{icon('google', '#0F1D2F')} Leave a Google review</a></div>'''


def wfooter():
    rows = [
        (icon('phone', '#C4A469'), f'<a href="tel:{CO["phone_tel"]}">{CO["phone"]}</a>'),
        (icon('mail', '#C4A469'), f'<a href="mailto:{CO["email"]}">{CO["email"]}</a>'),
        (icon('globe', '#C4A469'), f'<a href="{CO["web_url"]}" target="_blank" rel="noopener">{CO["web"]}</a>'),
        (icon('fb', '#1877F2'), f'<a href="{CO["facebook_url"]}" target="_blank" rel="noopener">GrayCo on Facebook</a>'),
        (icon('google', '#C4A469'), f'<a href="{CO["review_url"]}" target="_blank" rel="noopener">Google reviews</a>'),
        (icon('pin', '#C4A469'), f'{CO["addr1"]}, {CO["addr2"]}'),
    ]
    r = ''.join(f'<div class="row">{a}<span>{b}</span></div>' for a, b in rows)
    return f'''<footer class="wfoot"><div class="wrap"><img src="{LOGO_WHITE}" alt="GrayCo Construction Services">{r}
<div class="lic">Licensed General Contractor · {lic_line(' · ')}<br>Fully insured — general liability &amp; workers’ comp; certificate of insurance on request.<br>IICRC WRT certified for water damage restoration · Serving {CO['area']}</div></div></footer>'''


def sec(html, tinted=False):
    return f'<section class="wsec{" t" if tinted else ""}"><div class="wrap"><div class="z">{html}</div></div></section>'


def strip_section(html):
    # flap() returns a full <section class="panel ..."> – keep its inner content
    i = html.find('>') + 1
    j = html.rfind('</section>')
    return html[i:j]


def web_brochure(k):
    body = (sec(k['in_left']) + sec(k['in_mid'], True) + sec(strip_section(brochures.flap(k))) + sec(k['in_right'], True))
    h = hero(k['kicker'], k['cover_title'], k['cover_sub'], k['cover_points'])
    return page(k['title'].replace('Brochure', '').strip() + ' — GrayCo', k['desc'], brochures.CSS, h, body)


def _capture(fn):
    real = forms.doc
    forms.doc = lambda title, body, css, w=8.5, h=11, desc='': (title, body, css, desc)
    try:
        return fn()
    finally:
        forms.doc = real


def web_expect(fn, kicker, title, sub):
    t, body, css, desc = _capture(fn)
    return page(t + ' — GrayCo', desc, css, hero(kicker, title, sub), sec(body))


def web_scorecard():
    cats = forms.RATINGS
    qs = ''
    for i, (t, q) in enumerate(cats):
        name = 'r%d' % i
        opts = ''.join(f'<input type="radio" id="{name}_{v}" name="{name}" value="{v}"><label for="{name}_{v}">{v}</label>' for v in range(1, 6))
        qs += f'<fieldset class="q" style="border:0"><b>{t}</b><span class="h">{q}</span><div class="scale">{opts}</div><div class="ends"><span>Poor</span><span>Excellent</span></div></fieldset>'
    nps = ''.join(f'<input type="radio" id="nps_{v}" name="nps" value="{v}"><label for="nps_{v}">{v}</label>' for v in range(11))
    labels = '[' + ','.join('"%s"' % t.replace('&amp;', '&') for t, _ in cats) + ']'
    form = f'''<section class="wsec"><div class="wrap">
<form id="sc" onsubmit="return sendCard(event)">
<label class="inp"><span>Your name</span><input name="name" autocomplete="name"></label>
<label class="inp"><span>Project address</span><input name="addr" autocomplete="street-address"></label>
<label class="inp"><span>Project Manager</span><input name="pm"></label>
<h2 style="font-size:20px;margin-top:22px">Rate your experience</h2>
{qs}
<fieldset class="q" style="border:0"><b>How likely are you to recommend GrayCo to a friend or neighbor?</b>
<div class="scale n11">{nps}</div><div class="ends"><span>0 = not likely</span><span>10 = extremely likely</span></div></fieldset>
<label class="inp"><span>What did we do well?</span><textarea name="well" rows="3"></textarea></label>
<label class="inp"><span>What could we do better?</span><textarea name="better" rows="3"></textarea></label>
<label class="chk"><input type="checkbox" name="share"> You may share my comments (first name &amp; city only)</label>
<label class="chk"><input type="checkbox" name="callme"> Please call me — I have a question or concern</label>
<button class="btn big send" type="submit">{icon('mail', '#fff')} Send my scorecard to GrayCo</button>
<p class="hint">This opens your email app with your answers filled in, addressed to {CO['email']}. Concerns are reviewed by our office, not just the crew.</p>
</form></div></section>
<script>
var CATS={labels};
function sendCard(e){{e.preventDefault();var f=document.getElementById('sc'),L=[];
function v(n){{var el=f.querySelector('[name="'+n+'"]:checked');return el?el.value:'-';}}
L.push('Name: '+f.name.value,'Address: '+f.addr.value,'Project Manager: '+f.pm.value,'');
for(var i=0;i<CATS.length;i++)L.push(CATS[i]+': '+v('r'+i)+' / 5');
L.push('Would recommend (0-10): '+v('nps'),'','Did well: '+f.well.value,'Could do better: '+f.better.value,'',
 'OK to share comments: '+(f.share.checked?'Yes':'No'),'Please call me: '+(f.callme.checked?'Yes':'No'));
location.href='mailto:{CO['email']}?subject='+encodeURIComponent('Customer scorecard - '+(f.name.value||'GrayCo customer'))+'&body='+encodeURIComponent(L.join('\\n'));
return false;}}
</script>'''
    h = hero('Customer Scorecard', 'How did we do?', 'Your honest feedback goes straight to our office — it’s how we keep every crew and Project Manager accountable. It takes about two minutes.')
    h = h.replace('<div class="btns">', f'<div class="btns"><a class="btn rev big" style="background:var(--gold);border-color:var(--gold)" href="{CO["review_url"]}" target="_blank" rel="noopener">{icon("google", "#0F1D2F")} Happy? Leave a Google review</a>', 1)
    return page('How Did We Do? — GrayCo', 'Customer scorecard and Google review link for GrayCo Construction Services.', '', h, form,
                'If we earned it, please share your experience on Google — it takes about a minute.')


def ALL():
    b = {k['slug']: k for k in brochures.ALL}
    return [
        ('web-01-roofing', web_brochure(b['brochure-roofing'])),
        ('web-02-insurance-restoration', web_brochure(b['brochure-insurance-restoration'])),
        ('web-03-commercial', web_brochure(b['brochure-commercial'])),
        ('web-04-residential', web_brochure(b['brochure-residential'])),
        ('web-05-first-day', web_expect(forms.expect_first_day, 'What to expect', 'Your first day on site', 'How to get ready, what happens on Day 1, and who to call.')),
        ('web-06-insurance-claim-timeline', web_expect(forms.expect_claim, 'What to expect · Insurance claims', 'Your insurance claim timeline', 'Who does what — from the day damage happens to your final walkthrough.')),
        ('web-07-after-your-project', web_expect(forms.expect_after, 'What to expect · After your project', 'Thank you — here’s what comes next', 'Documents to keep, your warranty, caring for your project, and how to reach us.')),
        ('web-08-scorecard', web_scorecard()),
    ]
