#!/usr/bin/env python3
"""RESTOTRAIN: the printable GrayCo training manuals, from the same words the CRM's 🎓 Training tab uses
(tools/restotrain_content.py).

    python3 tools/build_restotrain_pdfs.py [out dir for answer keys]

Writes training/grayco-fire-smoke-restoration.pdf and training/grayco-odor-control.pdf (served at
crm.grayco-cs.com/training/…, linked from each course's first part). The answer keys are NOT put in the site: they go to the
out dir (default: the current directory) for admins to keep.
Look: US Letter, Arial, plain black, GrayCo logo and company block centered at the top, bold headings, no rules between sections.
Needs Node with Playwright (require('playwright')) to print the HTML to PDF.
"""
import html, json, os, re, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
sys.path.insert(0, here)
import restotrain_content as C

OUT_KEYS = sys.argv[1] if len(sys.argv) > 1 else '.'
def black_logo():
    """the GrayCo logo in plain black (owner: black logo on documents)"""
    from PIL import Image
    im = Image.open(os.path.join(root, 'grayco-logo.jpg')).convert('L')
    im = im.point(lambda v: 0 if v < 200 else 255)
    out = os.path.join(tempfile.gettempdir(), 'grayco-logo-black.png'); im.save(out); return out


LOGO = 'file://' + black_logo()
HEAD = ('<div class="hdr"><img src="' + LOGO + '"><div class="co">GrayCo Construction Services, LLC</div>'
        '<div class="addr">4007 Broadway Rd., Bartlett, TN 38135 &middot; (901) 585-0944 &middot; grayco-cs.com</div></div>')
CSS = """@page{size:Letter;margin:0.7in 0.75in 0.75in}
body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:10.5pt;line-height:1.4}
.hdr{text-align:center;margin-bottom:14px}.hdr img{height:62px}.co{font-weight:bold;font-size:11pt;margin-top:4px}.addr{font-size:8.5pt}
h1{text-align:center;font-size:17pt;margin:14px 0 2px}.sub{text-align:center;font-size:10pt;margin-bottom:16px}
h2{font-size:12.5pt;margin:18px 0 6px;break-after:avoid}p{margin:0 0 7px}ul,ol{margin:0 0 8px;padding-left:20px}li{margin:0 0 3px}
.q{break-inside:avoid;margin:0 0 9px}.q .c{margin-left:18px}.ans{font-weight:bold}.why{margin-left:18px}
.pb{break-before:page}.sig{margin-top:22px;line-height:2.2}"""


def inline(s):
    s = html.escape(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    return re.sub(r'\[(.+?)\]\((https?:[^)\s]+)\)', r'\1', s)


def md(t):
    out, lines, i = [], t.strip().split('\n'), 0
    while i < len(lines):
        l = lines[i]
        if not l.strip():
            i += 1; continue
        if re.match(r'\s*(- |\d+\. )', l):
            ordered = bool(re.match(r'\s*\d+\. ', l)); items = []
            while i < len(lines) and re.match(r'\s*(- |\d+\. )', lines[i]):
                items.append(re.sub(r'^\s*(- |\d+\. )', '', lines[i])); i += 1
            tag = 'ol' if ordered else 'ul'
            out.append('<%s>%s</%s>' % (tag, ''.join('<li>' + inline(x) + '</li>' for x in items), tag)); continue
        p = []
        while i < len(lines) and lines[i].strip() and not re.match(r'\s*(- |\d+\. )', lines[i]):
            p.append(lines[i]); i += 1
        txt = ' '.join(p)
        m = re.fullmatch(r'\*\*([^*]+)\*\*', txt.strip())
        out.append('<p><b>' + html.escape(m.group(1)) + '</b></p>' if m else '<p>' + inline(txt) + '</p>')
    return '\n'.join(out)


def page(title, body):
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + html.escape(title) + '</title><style>' + CSS + '</style></head><body>' + body + '</body></html>'


def manual(c):
    b = [HEAD, '<h1>' + html.escape(c['title']) + '</h1>', '<div class="sub">Employee Training Manual</div>', '<p>' + inline(c['intro'].replace(' Read each part and tick it off, then pass the quiz at the end (16 of 20) to finish.', ' Read every section, then answer the review questions at the end. In the CRM, open Training to tick off each part and take the quiz (pass = 16 of 20).')) + '</p>']
    for p in c['parts']:
        b.append('<h2>' + html.escape(p['title']) + '</h2>' + md(p['body']))
    b.append('<h2 class="pb">Review questions</h2><p>Circle the best answer.</p>')
    for n, (q, ch, a, why) in enumerate(c['quiz'], 1):
        b.append('<div class="q"><b>%d.</b> %s%s</div>' % (n, html.escape(q), ''.join('<div class="c">%s. %s</div>' % ('ABCD'[j], html.escape(x)) for j, x in enumerate(ch))))
    b.append('<div class="sig">Employee name: ______________________________ &nbsp; Date: ______________<br>Score: ______ of %d &nbsp;&nbsp; Reviewed by: ______________________________</div>' % len(c['quiz']))
    return page(c['title'], '\n'.join(b))


def key(c):
    b = [HEAD, '<h1>' + html.escape(c['title']) + '</h1>', '<div class="sub">Review Questions: Answer Key (admins only)</div>',
         '<p>Passing score: %d of %d.</p>' % (C.PASS, len(c['quiz']))]
    for n, (q, ch, a, why) in enumerate(c['quiz'], 1):
        b.append('<div class="q"><b>%d.</b> %s<div class="c ans">%s. %s</div><div class="why">%s</div></div>' % (n, html.escape(q), 'ABCD'[a], html.escape(ch[a]), html.escape(why)))
    return page(c['title'] + ' Answer Key', '\n'.join(b))


jobs = []
tmp = tempfile.mkdtemp()
os.makedirs(os.path.join(root, 'training'), exist_ok=True)
for c in C.COURSES:
    for kind, fn, out in (('m', manual, os.path.join(root, 'training', c['pdf'])),
                          ('k', key, os.path.join(OUT_KEYS, c['pdf'].replace('.pdf', '-answer-key.pdf')))):
        h = os.path.join(tmp, kind + c['id'] + '.html'); open(h, 'w', encoding='utf-8').write(fn(c))
        jobs.append({'html': h, 'pdf': os.path.abspath(out), 'footer': 'GrayCo Construction Services, LLC | ' + c['title'] + (' Answer Key' if kind == 'k' else '')})
js = """const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();
for(const j of %s){await p.goto('file://'+j.html,{waitUntil:'load'});await p.pdf({path:j.pdf,format:'Letter',displayHeaderFooter:true,
headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:8px;width:100%%;text-align:center;font-family:Arial">'+j.footer+' | Page <span class=pageNumber></span></div>',
margin:{top:'0.6in',bottom:'0.7in',left:'0.75in',right:'0.75in'}});console.log('wrote',j.pdf)}await b.close()})()""" % json.dumps(jobs)
subprocess.run(['node', '-e', js], check=True)
