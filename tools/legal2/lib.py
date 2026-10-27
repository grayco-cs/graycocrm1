"""Shared building blocks for the LEGAL2 documents (patch LEGAL2).
A document is a dict: id, name, category, jobTypes, clientFacing, blocks, flags (questions for counsel), cites.
A block is a tuple:
  ('title', text, sub) ('info', [[k, v], ...]) ('h', text) ('p', html) ('box', html) ('li', [html, ...]) ('checks', [text, ...])
  ('grid', [cols], rows) ('sigs', a, b) ('cut', text) ('pb',) ('small', html) ('bold', html)
Merge fields (the library fills them): {customer} {gc} {job_name} {job_address} {po} {date} {contract_amount} {pm} {office_phone} {billing_email} {license}.
"""
import json, re

GCO = 'GrayCo Construction Services, LLC'
ADDR = '4007 Broadway Rd, Bartlett, TN 38135'
PHONE = '(901) 585-0944'
EMAIL = 'office@grayco-cs.com'
LICS = 'TN #85034 BCB · AR #0486990627 · MS #27769'
REV = 'Form rev. 10/26/2026'
NOTE = 'DRAFT — pending attorney review (sent 10/26)'
ALL = ['residential', 'commercial', 'insurance']
RES_INS = ['residential', 'insurance']
INS = ['insurance']
SUBT = ['commercial', 'residential', 'insurance']

DOCS = []

def doc(id, name, category, jobTypes, clientFacing, blocks, flags=None, group=None):
    d = dict(id=id, name=name, category=category, jobTypes=jobTypes, clientFacing=clientFacing, blocks=blocks, flags=flags or [], group=group or category)
    DOCS.append(d)
    return d

def fields_pretty(t):
    m = {'customer': '[customer name]', 'gc': '[general contractor / owner]', 'job_name': '[job name]', 'job_address': '[job address]', 'po': '[PO / job #]',
         'date': '[date]', 'contract_amount': '[contract amount]', 'pm': '[project manager]', 'office_phone': PHONE, 'billing_email': 'billing@grayco-cs.com', 'license': 'TN #85034 BCB'}
    return re.sub(r'\{([a-z_]+)\}', lambda x: m.get(x.group(1), x.group(0)), t)

def jsq(obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    return s.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029').replace('</script', '<\\/script')

def plain(html):
    t = re.sub(r'<br\s*/?>', '\n', html)
    t = re.sub(r'</(p|div|li|h\d)>', '\n', t)
    t = re.sub(r'<[^>]+>', '', t)
    return (t.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&nbsp;', ' ').replace('&#39;', "'").replace('&quot;', '"'))

# ---------------------------------------------------------------- static public page
PAGE_CSS = 'mkt-pages.css'
def static_page(title, h1, blocks, updated='October 26, 2026', sub='Licensed general contractor · TN · MS · AR'):
    body = []
    for b in blocks:
        k = b[0]
        if k == 'h': body.append('<h2>' + b[1] + '</h2>')
        elif k == 'p': body.append('<p>' + b[1] + '</p>')
        elif k == 'li': body.append('<ul>' + ''.join('<li>' + x + '</li>' for x in b[1]) + '</ul>')
        elif k == 'box': body.append('<p style="border:1px solid #c9a24b;background:#fffbeb;padding:10px 12px;border-radius:8px">' + b[1] + '</p>')
    return ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '<title>' + title + ' — GrayCo Construction Services</title>\n<link rel="stylesheet" href="mkt-pages.css">\n'
            '<style>.gp-card h2{margin-top:18px}.gp-card p,.gp-card li{line-height:1.55}.gc-formrev{margin-top:22px;font-size:11px;color:#6b7280}</style>\n</head><body>\n'
            '<header class="gp-head"><img src="img/grayco-logo-white.png" alt="GrayCo Construction Services"><div><b>GrayCo Construction Services</b><span>' + sub + '</span></div></header>\n'
            '<div class="gp-gold"></div>\n<main class="gp-main"><div class="gp-card">\n<h1>' + h1 + '</h1><p class="gp-muted">Last updated ' + updated + '</p>\n'
            + '\n'.join(body) +
            '\n<p class="gc-formrev">' + REV + ' · ' + GCO + ' · ' + ADDR + ' · ' + PHONE + ' · <a href="mailto:' + EMAIL + '">' + EMAIL + '</a></p>\n</div></main></body></html>\n')
