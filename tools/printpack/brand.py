"""GrayCo brand facts + placeholders + shared HTML building blocks.

Every fact below was taken from final33143/index.html or GrayCo_AdGenerator.html
(see INTEGRATE.md / the build report for where). Anything we could NOT verify is a
PLACEHOLDER: fill it in here once and re-run build.py — every handout updates.
"""
import base64, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from qr import QR

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, '_build')

# ---------------------------------------------------------------- facts (sourced)
CO = {
    'name': 'GrayCo Construction Services',
    'legal': 'GrayCo Construction Services, LLC',
    'addr1': '4007 Broadway Rd',  # owner 10/27: print pieces keep the current address
    'addr2': 'Bartlett, TN 38135',
    'phone': '(901) 585-0944',
    'phone_tel': '+19015850944',
    'emergency': '(901) 692-7255',          # FAQ packet + warranty docs "EMERGENCY"
    'email': 'office@grayco-cs.com',
    'web': 'grayco-cs.com',
    'web_url': 'https://grayco-cs.com',
    'review_url': 'https://share.google/quDuhdlL0ckxPLLY3',   # chosen by owner (Oct 2026)
    'facebook_url': 'https://www.facebook.com/p/GrayCo-Construction-Services-LLC-100092932745320/',
    'facebook_label': 'Facebook: GrayCo Construction Services LLC',
    'tn_lic': 'TN License #85034 BCB',
    'ar_lic': 'AR License #0486990627',
    'ms_lic': 'MS License #27769',          # owner-provided
    'years': '8 years in business',        # owner: built through two previous companies, now one company (GrayCo)
    'area': 'Memphis & the Mid-South',      # Ad generator default service area
    'area_long': 'the greater Memphis metro area and the Mid-South, including Mississippi and Arkansas',
    'pm_hours': 'Mon–Sat, 7 am – 6 pm',      # Welcome & FAQ packet
    'work_hours': 'Mon–Fri, 8 am – 5 pm',    # Residential proposal schedule notes
}

# ---------------------------------------------------------------- placeholders
# Set a value (string) to replace the marked placeholder everywhere.
PH = {
    # Carrier still unknown. Not printed: the insured line uses the contract's own wording
    # ("general liability and workers' compensation ... certificate on request").
    'INSURANCE CARRIER': None,
    # Owner-confirmed warranty terms (Oct 2026)
    'WARRANTY TERM — RESIDENTIAL': '1 year',
    'WARRANTY TERM — INSURANCE/RESTORATION': '5 years',
    'WARRANTY TERM — COMMERCIAL': '1 year',
    'WARRANTY TERM — ROOFING': '5 years',   # every roof: residential, commercial or insurance
}


def ph(key):
    v = PH.get(key)
    if v is not None:          # '' removes the placeholder entirely
        return v
    return '<span class="ph">[%s]</span>' % key


# ---------------------------------------------------------------- assets
def b64(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode()

LOGO_NAVY = 'data:image/png;base64,' + b64(os.path.join(BUILD, 'logo-navy.png'))
LOGO_WHITE = 'data:image/png;base64,' + b64(os.path.join(BUILD, 'logo-white.png'))

_qr_cache = {}
def qr_svg(url, fg='#0F1D2F', title=None):
    key = (url, fg)
    if key not in _qr_cache:
        _qr_cache[key] = QR(url, 'M').svg('100%', border=2, fg=fg, title=title or url)
    return _qr_cache[key]


# ---------------------------------------------------------------- icons (inline SVG)
def icon(name, color='currentColor', size='1em'):
    p = {
        'phone': '<path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" fill="%s"/>' % color,
        'mail': '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="%s" stroke-width="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5" fill="none" stroke="%s" stroke-width="2"/>' % (color, color),
        'globe': '<circle cx="12" cy="12" r="9" fill="none" stroke="%s" stroke-width="2"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" fill="none" stroke="%s" stroke-width="1.6"/>' % (color, color),
        'pin': '<path d="M12 2c-4 0-7 3-7 7 0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="%s"/>' % color,
        'fb': '<circle cx="12" cy="12" r="10" fill="%s"/><path d="M13.2 19v-6h2l.3-2.4h-2.3V9.1c0-.7.2-1.1 1.2-1.1h1.2V5.9c-.2 0-1-.1-1.8-.1-1.8 0-3 1.1-3 3.1v1.7H8.8V13h2v6h2.4z" fill="#fff"/>' % color,
        'google': '<circle cx="12" cy="12" r="10.5" fill="%s"/><text x="12" y="16.6" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="14" fill="#fff">G</text>' % color,
        'check': '<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' % color,
        'shield': '<path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" fill="%s"/><path d="M8 12l3 3 5-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' % color,
        'star': '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="%s"/>' % color,
        'camera': '<path d="M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" fill="none" stroke="%s" stroke-width="2"/><circle cx="12" cy="12.5" r="3.5" fill="none" stroke="%s" stroke-width="2"/>' % (color, color),
        'doc': '<path d="M6 2h8l5 5v15H6z" fill="none" stroke="%s" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v5h5M9 12h7M9 16h7" fill="none" stroke="%s" stroke-width="2"/>' % (color, color),
        'clip': '<rect x="5" y="4" width="14" height="18" rx="2" fill="none" stroke="%s" stroke-width="2"/><rect x="8.5" y="2" width="7" height="4" rx="1" fill="%s"/><path d="M8.5 13l2.3 2.3L15.5 10.5" fill="none" stroke="%s" stroke-width="2" stroke-linecap="round"/>' % (color, color, color),
        'people': '<circle cx="8.5" cy="8" r="3" fill="%s"/><circle cx="16.5" cy="9" r="2.5" fill="%s"/><path d="M2.5 19c0-3.3 2.7-6 6-6s6 2.7 6 6z M13.5 19c.2-2.2-.6-4-1.6-5.2.9-.5 1.8-.8 2.8-.8 2.9 0 5.3 2.3 5.3 5.2v.8z" fill="%s"/>' % (color, color, color),
        'clock': '<circle cx="12" cy="12" r="9" fill="none" stroke="%s" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="%s" stroke-width="2" stroke-linecap="round"/>' % (color, color),
        'broom': '<path d="M14 3l-2.5 8M7 21l1.5-7h7l1.5 7z M9 14l-1-3h8l-1 3" fill="none" stroke="%s" stroke-width="2" stroke-linejoin="round"/>' % color,
        'key': '<circle cx="8" cy="12" r="4" fill="none" stroke="%s" stroke-width="2"/><path d="M12 12h9M18 12v3M21 12v2" fill="none" stroke="%s" stroke-width="2" stroke-linecap="round"/>' % (color, color),
    }[name]
    return '<svg class="ic" viewBox="0 0 24 24" width="%s" height="%s" aria-hidden="true">%s</svg>' % (size, size, p)


ROOFLINE = ('<svg class="roofline" viewBox="0 0 400 110" preserveAspectRatio="xMidYMax meet" aria-hidden="true">'
            '<g fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round">'
            '<path d="M20 100 L170 8 L330 100"/><path d="M215 36 L262 8 L400 92"/>'
            '<path d="M70 70 V34 H92 V56"/></g></svg>')

def roofline(color='#C4A469', w=5):
    return ROOFLINE.replace('{c}', color).replace('{w}', str(w))


# ---------------------------------------------------------------- base CSS
BASE_CSS = r"""
:root{
  --navy:#0F1D2F; --navy2:#1A3A5F; --indigo:#130564;
  --gold:#C4A469; --gold2:#B8902F; --goldlt:#F3EBD9;
  --ink:#1D2532; --muted:#586374; --line:#DAD3C3; --line2:#E7E2D6;
  --tint:#F7F4EE; --tint2:#EEF2F7; --paper:#FFFFFF;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--paper);color:var(--ink);
  font-family:Inter,"Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
  font-size:8.6pt;line-height:1.38;font-feature-settings:"ss01","cv11";}
@media screen{html,body{background:#DEDAD2}.sheet{margin:24px auto;box-shadow:0 6px 30px rgba(15,29,47,.25)}}
.sheet{position:relative;overflow:hidden;background:var(--paper);break-after:page;page-break-after:always}
.sheet:last-child{break-after:auto;page-break-after:auto}
.ic{display:inline-block;vertical-align:-0.14em;flex:none}
.ph{background:#FFF1A8;outline:1px dashed #A07800;outline-offset:0;color:#5E4500;
    font-weight:700;padding:0 2px;border-radius:2px;font-style:normal;letter-spacing:0;text-transform:none}
h1,h2,h3,h4{font-weight:800;color:var(--navy);letter-spacing:-.01em;line-height:1.15}
.kicker{font-size:7pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gold2)}
.rule{width:36px;height:3px;background:var(--gold);border-radius:2px;margin:5px 0 8px}
p+p{margin-top:5px}
b,strong{font-weight:700;color:var(--navy)}
ul.checks{list-style:none}
ul.checks li{position:relative;padding-left:15px;margin:3px 0}
ul.checks li .ic{position:absolute;left:0;top:.18em;width:10px;height:10px}
ul.dots{list-style:none}
ul.dots li{position:relative;padding-left:11px;margin:2px 0}
ul.dots li:before{content:"";position:absolute;left:1px;top:.55em;width:4px;height:4px;border-radius:50%;background:var(--gold)}
.box{display:inline-block;width:10px;height:10px;border:1.3px solid var(--navy2);border-radius:2px;vertical-align:-1px;background:#fff}
.field{display:flex;align-items:flex-end;gap:6px;min-width:0}
.field label{font-size:6.8pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
.field .ln{flex:1;border-bottom:1px solid #9AA3AF;height:15px;min-width:20px}
.qr{background:#fff;padding:3px;border-radius:6px;line-height:0}
.qr svg{display:block;width:100%;height:auto}
.small{font-size:7.2pt;color:var(--muted)}
.foot-lic{font-size:6.8pt;color:var(--muted);letter-spacing:.02em}
"""


def page_css(w_in, h_in):
    return '@page{size:%sin %sin;margin:0}.sheet{width:%sin;height:%sin}' % (w_in, h_in, w_in, h_in)


def doc(title, body, css, w_in=8.5, h_in=11, desc=''):
    return ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>%s</title><meta name="description" content="%s">'
            '<style>%s%s%s</style></head><body>%s</body></html>\n') % (
                title, desc, BASE_CSS, page_css(w_in, h_in), css, body)


def contact_lines(dark=False, compact=False):
    c = '#C4A469' if dark else '#1A3A5F'
    rows = [
        (icon('phone', c), '<b class="big">%s</b>' % CO['phone']),
        (icon('mail', c), CO['email']),
        (icon('globe', c), CO['web']),
        (icon('pin', c), '%s, %s' % (CO['addr1'], CO['addr2'])),
    ]
    return '<div class="contact%s">%s</div>' % (' dark' if dark else '', ''.join(
        '<div class="crow">%s<span>%s</span></div>' % r for r in rows))


def lic_line(sep=' &nbsp;·&nbsp; '):
    return sep.join(l.replace(' ', '&nbsp;') for l in [CO['tn_lic'], CO['ar_lic'], CO['ms_lic']])
