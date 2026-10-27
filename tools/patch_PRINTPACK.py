#!/usr/bin/env python3
"""Idempotent patch PRINTPACK: every GrayCo print piece in the CRM, with a link anyone can print from.

  /print/<slug>.pdf            OFFICE  — Letter paper, desk printer, page 1 = front, page 2 = back
  /print/<slug>-printshop.pdf  PRINTSHOP — trim + 0.125 in bleed on every side, crop marks, PDF TrimBox/BleedBox set
  /print/thumbs/<slug>-<n>.jpg front/back previews
  /print/index.html            public list for a print shop (written by this script from PIECES below)
  index.html                   Marketing -> 🖨 Print pack (cards: Preview, Print, Copy link, E-mail link, Text link,
                               Download all (zip)); 💎 -> Print pack; the Print & brand kit card links to it.

The PDFs are built by tools/printpack/ (build.py -> pp.mjs -> boxes.py); facts live in tools/printpack/brand.py.
Code lives in tools/printpack_js.js. Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_PRINTPACK.py [index.html]
"""
import sys, os, json, html
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
PRINT = os.path.join(os.path.dirname(os.path.abspath(path)), 'print')
MARK = '__GC_PATCH_PRINTPACK__'

BRO_OFFICE = ('Letter paper · Landscape · Double-sided, flip on SHORT edge · 100% / Actual size (no “Fit to page”) · '
              'fold in thirds: inside panels in, cover on top')
BRO_SHOP = ('11.25 × 8.75 in incl. 0.125 in bleed + crop marks → trims to 11 × 8.5 in · 2-sided: page 1 = outside, page 2 = inside, '
            'turn on the SHORT edge · 100 lb gloss text · letter (roll) fold; the left outside panel is the 1/16 in narrower fold-in flap')
FORM_OFFICE = 'Letter paper · Portrait · Single-sided · 100% / Actual size (no “Fit to page”)'

def bro(slug, title, use):
    return dict(slug=slug, kind='Brochure', title=title, pages=2, use=use, thumbs=[slug + '-1.jpg', slug + '-2.jpg'],
                size='Tri-fold · Letter 11 × 8.5 in landscape · 2 pages (outside, inside)', office=BRO_OFFICE, shop=BRO_SHOP)

def form(slug, title, use, kind='Customer guide'):
    return dict(slug=slug, kind=kind, title=title, pages=1, use=use, thumbs=[slug + '-1.jpg'],
                size='Letter 8.5 × 11 in portrait · 1 page', office=FORM_OFFICE, shop=None)

PIECES = [
    bro('brochure-general', 'General brochure (all services)', 'Everything GrayCo does — events, walk-ins, any lead'),
    bro('brochure-roofing', 'Roofing brochure', 'Roofing leads and roof proposals'),
    bro('brochure-insurance-restoration', 'Insurance claims & restoration brochure', 'Insurance, water, fire and storm leads'),
    bro('brochure-residential', 'Residential remodeling brochure', 'Remodel, kitchen, bath and addition leads'),
    bro('brochure-commercial', 'Commercial build-outs brochure', 'Commercial TI, build-out and renovation bids'),
    dict(slug='flyer-general', kind='Flyer', title='Half-page flyer (general)', pages=2, use='Counters, events, leave-behinds, mailers',
         thumbs=['flyer-general-1.jpg', 'flyer-general-2.jpg'],
         size='5.5 × 8.5 in, front + back · OFFICE: 2 per Letter sheet',
         office='Letter paper · Landscape · Double-sided, flip on SHORT edge · 100% / Actual size (no “Fit to page”) · cut down the middle → two 5.5 × 8.5 in flyers',
         shop='5.75 × 8.75 in incl. 0.125 in bleed + crop marks → trims to 5.5 × 8.5 in · page 1 = front, page 2 = back, flip on the LONG edge · 100 lb gloss text or 14 pt card'),
    dict(slug='door-hanger', kind='Door hanger', title='Door hanger — “We were here today”', pages=1, use='Job-site daily check the PM fills in and hangs on the door',
         thumbs=['door-hanger-1.jpg'],
         size='4.25 × 11 in, single-sided (a fill-in form) · OFFICE: 2 per Letter sheet',
         office='Letter paper · Portrait · Single-sided · 100% / Actual size (no “Fit to page”) · cut down the middle, cut out the circle',
         shop='4.5 × 11.25 in incl. 0.125 in bleed + crop marks → trims to 4.25 × 11 in · single-sided · 14 pt card with a writable (matte/uncoated) finish · die-cut door hole at the top'),
    form('expect-first-day', 'What to expect — your first day on site', 'Send with the signed contract / work authorization'),
    form('expect-insurance-claim-timeline', 'What to expect — insurance claim timeline', 'Send with the insurance work authorization'),
    form('expect-after-your-project', 'What to expect — after your project', 'Closeout packet, with the warranty certificate'),
    form('scorecard-customer', 'Customer scorecard — “How did we do?”', 'Left with the customer at closeout', 'Form'),
    form('scorecard-closeout-pm', 'Closeout scorecard (PM + customer)', 'Filled in together at the final walkthrough', 'Form'),
    form('checks-and-balances-sheet', 'Checks & Balances sheet', 'Posted on site from day 1 to closeout', 'Form'),
]

def rd(p): return open(p, encoding='utf-8').read()
def once(src, old, new, label):
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    return src.replace(old, new)

# ── every PDF / thumbnail the manifest names must exist ──
missing = []
for p in PIECES:
    need = [p['slug'] + '.pdf'] + (['%s-printshop.pdf' % p['slug']] if p['shop'] else []) + ['thumbs/' + t for t in p['thumbs']]
    missing += [n for n in need if not os.path.isfile(os.path.join(PRINT, n))]
assert not missing, ('missing print files', missing)

# ── public /print/index.html (always rewritten from PIECES; same text as the CRM cards) ──
E = lambda t: html.escape(t, quote=True)
cards = []
for p in PIECES:
    shop = ('<p><b>PRINTSHOP</b> <a href="%s-printshop.pdf">%s-printshop.pdf</a><br>%s</p>' % (E(p['slug']), E(p['slug']), E(p['shop']))) if p['shop'] else ''
    imgs = ''.join('<img src="thumbs/%s" alt="%s — page %d" loading="lazy">' % (E(t), E(p['title']), i + 1) for i, t in enumerate(p['thumbs']))
    cards.append('<section id="%s"><div class="im">%s</div><div><h2>%s</h2><p class="m">%s · %s</p>'
                 '<p><b>OFFICE</b> <a href="%s.pdf">%s.pdf</a><br>%s</p>%s</div></section>' % (
                     E(p['slug']), imgs, E(p['title']), E(p['size']), E(p['use']), E(p['slug']), E(p['slug']), E(p['office']), shop))
PAGE = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GrayCo Print Pack</title><meta name="robots" content="noindex">
<style>
:root{--navy:#0F1D2F;--gold:#C4A469;--ink:#1D2532;--muted:#586374;--line:#DAD3C3;--bg:#F5F7FB}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 Inter,-apple-system,"Segoe UI",Arial,sans-serif}
header{background:var(--navy);color:#fff;text-align:center;padding:18px 16px 14px;border-bottom:4px solid var(--gold)}
header img{height:64px;background:#fff;border-radius:8px;padding:4px}header h1{margin:8px 0 2px;font-size:22px}header p{margin:0;color:#C9D3DF;font-size:13px}
main{max-width:1000px;margin:0 auto;padding:16px}
.how{background:#fff;border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:8px;padding:12px 14px;margin-bottom:16px}
.how ul{margin:6px 0 0;padding-left:20px}
section{display:flex;gap:16px;background:#fff;border:1px solid #dce3ee;border-radius:10px;padding:14px;margin-bottom:12px;scroll-margin-top:10px}
section .im{display:flex;gap:6px;flex:none;align-items:flex-start}section .im img{width:130px;border:1px solid #dce3ee;border-radius:4px;background:#fff}
section h2{margin:0 0 4px;font-size:17px;color:var(--navy)}section p{margin:6px 0;font-size:14px}.m{color:var(--muted)}
a{color:#1A3A5F;font-weight:600;word-break:break-all}
footer{text-align:center;color:var(--muted);font-size:12px;padding:10px 16px 30px}
@media (max-width:640px){section{flex-direction:column}section .im img{width:calc(50% - 3px)}}
</style></head><body>
<header><img src="../grayco-logo.jpg" alt="GrayCo Construction Services"><h1>GrayCo Print Pack</h1><p>GrayCo Construction Services, LLC · (901) 585-0944 · office@grayco-cs.com</p></header>
<main>
<div class="how"><b>How to print</b><ul>
<li>Each PDF is one piece. <b>Page 1 is the front, page 2 is the back.</b> Print double-sided with the flip shown for that piece.</li>
<li>Always print at <b>100% / Actual size</b>. Never “Fit to page” or “Shrink to fit”: that changes the folds and the cut lines.</li>
<li><b>OFFICE</b> files are Letter size for a desk printer. <b>PRINTSHOP</b> files have 0.125 in bleed and crop marks, and the PDF trim box is set.</li>
</ul></div>
@@CARDS@@
</main>
<footer>Questions about a file: (901) 585-0944 · office@grayco-cs.com</footer>
</body></html>
'''.replace('@@CARDS@@', '\n'.join(cards))
open(os.path.join(PRINT, 'index.html'), 'w', encoding='utf-8').write(PAGE)
print('wrote', os.path.join(PRINT, 'index.html'))

# ── page ──
src = rd(path)
if MARK in src:
    print('already patched'); sys.exit(0)
JS = rd(os.path.join(HERE, 'printpack_js.js')).rstrip('\n')
assert JS.count('__PIECES__') == 1
JS = JS.replace('__PIECES__', json.dumps(PIECES, ensure_ascii=False))
assert '</script' not in JS.lower()
src = once(src, '</script><!-- /MKT -->', '</script><!-- /MKT -->\n<script id="gc-patch-printpack">\n' + JS + '\n</script><!-- /PRINTPACK -->', 'module after MKT')
src = once(src, '        { icon: "❓", label: "Help Center", fn: function(){ window._gcOpenHelp && window._gcOpenHelp(); } },',
           '        { icon: "🖨", label: "Print pack", fn: function(){ if (window._gcOpenPrintPack) window._gcOpenPrintPack(); else alert("Still loading, try again in a moment."); } },   /* patch PRINTPACK */\n'
           '        { icon: "❓", label: "Help Center", fn: function(){ window._gcOpenHelp && window._gcOpenHelp(); } },', 'diamond item')
src = once(src, 'var _hubGroups = {"Job Profile"', 'var _hubGroups = {"Print pack": "Help & Tools", "Job Profile"', 'diamond group')
src = once(src, '<div class="gmt-row" style="margin-top:8px"><button class="gmt-btn o" data-a="go-docs">Company Docs</button></div></div>\';',
           '<div class="gmt-row" style="margin-top:8px"><button class="gmt-btn" data-a="pp-open">🖨 Open the Print pack (PDFs + links)</button><button class="gmt-btn o" data-a="go-docs">Company Docs</button></div></div>\';', 'brand card button')
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
