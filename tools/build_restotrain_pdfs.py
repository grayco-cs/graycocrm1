#!/usr/bin/env python3
"""RESTOTRAIN: the printable GrayCo training manuals, from the same words the CRM's 🎓 Training tab uses
(tools/restotrain_content.py).

    python3 tools/build_restotrain_pdfs.py [out dir for answer keys]

Writes training/<course>.pdf for every course (served at crm.grayco-cs.com/training/…, linked from each course's first
part). The answer keys are NOT put in the site: they go to the out dir (default: the current directory) for admins.
Look (owner 11/10: "more training looking, not proposal looking"; "center logo and make those training way more sleek"):
Inter type; a full-bleed navy cover with the white GrayCo logo centered; a course overview page; each module opens with a
large module number, title and key-term chips; the GrayCo logo centered in the header of every inside page; a knowledge
check with answer bubbles; a certificate-style completion record. Needs Node with Playwright and the Inter font.
"""
import base64, html, json, os, re, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
sys.path.insert(0, here)
import restotrain_content as C

OUT_KEYS = sys.argv[1] if len(sys.argv) > 1 else '.'
LOGO_WHITE = 'file://' + os.path.join(root, 'img', 'grayco-logo-white.png')
def clear_logo():
    """the color GrayCo logo with its white background made transparent (so it sits cleanly on tinted panels)"""
    from PIL import Image
    im = Image.open(os.path.join(root, 'grayco-logo.jpg')).convert('RGBA')
    im = im.crop(im.convert('L').point(lambda v: 255 if v < 235 else 0).getbbox())
    px = [(r, g, b, 0 if min(r, g, b) > 238 else a) for r, g, b, a in (im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata())]
    im.putdata(px)
    im.thumbnail((420, 420))
    out = os.path.join(tempfile.gettempdir(), 'grayco-logo-clear.png'); im.save(out); return out


_CL = clear_logo()
LOGO = 'file://' + _CL
LOGO_B64 = 'data:image/png;base64,' + base64.b64encode(open(_CL, 'rb').read()).decode()
CERT = {'resto-water': 'WRT (Water Restoration Technician)', 'resto-fire': 'FSRT (Fire and Smoke Restoration Technician)',
        'resto-odor': 'OCT (Odor Control Technician)'}
NAVY, NAVY2, ACC, INK, MUTED, LINE, SOFT = '#0c1f3a', '#173a66', '#e08a1e', '#1f2a37', '#6b7686', '#e4e8ee', '#f5f7fa'
CSS = """@page{size:Letter;margin:0.95in 0.85in 0.8in}
@page cover{margin:0}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Inter,Arial,sans-serif;color:INK;font-size:10pt;line-height:1.62;margin:0;font-feature-settings:"ss01","cv11"}
b,strong{color:NAVY;font-weight:650}
/* cover */
.cover{page:cover;height:11in;width:8.5in;position:relative;break-after:page;overflow:hidden;color:#fff;text-align:center;
  background:radial-gradient(120% 70% at 50% 0%,NAVY2 0%,NAVY 62%,#081528 100%)}
.cv-ring{position:absolute;left:50%;top:3.1in;width:7.6in;height:7.6in;margin-left:-3.8in;border:1px solid rgba(255,255,255,.07);border-radius:50%}
.cv-ring.r2{top:3.75in;width:6.2in;height:6.2in;margin-left:-3.1in}
.cv-logo{padding-top:0.95in}.cv-logo img{height:96px}
.cv-kicker{margin-top:0.85in;font-size:9.5pt;letter-spacing:5px;text-transform:uppercase;color:ACC;font-weight:600}
.cv-title{font-family:"Inter Display",Inter,sans-serif;font-size:44pt;line-height:1.04;font-weight:800;letter-spacing:-.5px;margin:14px auto 0;max-width:6.6in}
.cv-rule{width:56px;height:3px;background:ACC;margin:26px auto;border-radius:2px}
.cv-sub{font-size:12pt;font-weight:300;color:#c7d2e0;max-width:5.4in;margin:0 auto;line-height:1.55}
.cv-stats{position:absolute;bottom:1.25in;left:0;right:0;display:flex;justify-content:center;gap:0}
.cv-stat{padding:0 26px;border-left:1px solid rgba(255,255,255,.18)}.cv-stat:first-child{border-left:0}
.cv-stat .n{font-family:"Inter Display",Inter;font-size:22pt;font-weight:700;color:#fff;line-height:1}
.cv-stat .l{font-size:7.5pt;letter-spacing:2.5px;text-transform:uppercase;color:#93a3b8;margin-top:6px}
.cv-foot{position:absolute;bottom:0.45in;left:0;right:0;font-size:7.5pt;letter-spacing:1.5px;text-transform:uppercase;color:#7b8ba3}
/* section openers */
.mod{break-before:page}.mod:first-child{break-before:auto}
.eyebrow{font-size:8pt;letter-spacing:3.5px;text-transform:uppercase;color:ACC;font-weight:600}
.mhead{display:flex;align-items:flex-end;gap:18px;padding-bottom:16px;border-bottom:1px solid LINE;margin-bottom:18px}
.mnum{font-family:"Inter Display",Inter;font-size:58pt;line-height:.8;font-weight:200;color:ACC;letter-spacing:-2px}
.mtitle{font-family:"Inter Display",Inter;font-size:23pt;line-height:1.1;font-weight:700;color:NAVY;letter-spacing:-.3px;margin-top:6px}
.terms{background:SOFT;border-radius:12px;padding:12px 14px 9px;margin:0 0 20px}
.terms .eyebrow{color:MUTED;letter-spacing:2.5px;margin-bottom:7px}
.chip{display:inline-block;background:#fff;border:1px solid LINE;border-radius:999px;padding:2px 11px;margin:0 5px 5px 0;font-size:8.6pt;color:NAVY;font-weight:500}
h3{font-family:"Inter Display",Inter;font-size:12.5pt;font-weight:650;color:NAVY;margin:18px 0 6px;break-after:avoid;display:flex;align-items:center;gap:9px}
h3:before{content:"";width:7px;height:7px;border-radius:2px;background:ACC;flex:0 0 7px}
p{margin:0 0 9px}
ul,ol{margin:0 0 12px;padding-left:0;list-style:none}
li{position:relative;margin:0 0 6px;padding-left:20px}
ul>li:before{content:"";position:absolute;left:4px;top:.62em;width:5px;height:5px;border-radius:50%;background:ACC}
ol{counter-reset:n}
ol>li{counter-increment:n;padding-left:30px}
ol>li:before{content:counter(n);position:absolute;left:0;top:.15em;width:20px;height:20px;border-radius:50%;background:NAVY;color:#fff;font-size:8pt;font-weight:700;text-align:center;line-height:20px}
.done{margin-top:22px;display:flex;align-items:center;gap:10px;background:SOFT;border-radius:10px;padding:10px 14px;font-size:8.8pt;color:MUTED;break-inside:avoid}
.box{width:15px;height:15px;border:1.5px solid NAVY;border-radius:4px;flex:0 0 15px;background:#fff}
/* overview */
.ov{display:flex;gap:30px}
.ov .l{flex:1.15}.ov .r{flex:1}
.tl{margin:0;padding:0;list-style:none}
.tl li{padding:0 0 0 40px;margin:0;min-height:40px;position:relative}
.tl li:before{content:attr(data-n);position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;background:#fff;border:1.5px solid NAVY;color:NAVY;font-size:8.5pt;font-weight:700;text-align:center;line-height:23px}
.tl li:after{content:"";position:absolute;left:13px;top:28px;bottom:2px;width:1.5px;background:LINE}
.tl li:last-child:after{display:none}
.tl .t{font-weight:600;color:NAVY;font-size:10pt;line-height:26px}
.card{border:1px solid LINE;border-radius:14px;padding:16px 18px;margin:0 0 16px}
.card h4{margin:0 0 10px;font-size:8pt;letter-spacing:3px;text-transform:uppercase;color:ACC}
.card ol>li{font-size:9.4pt}
.line{border-bottom:1px solid #b8c2cf;height:30px;margin:0 0 6px;font-size:7.5pt;letter-spacing:1.5px;text-transform:uppercase;color:MUTED;display:flex;align-items:flex-end;padding-bottom:3px}
/* knowledge check */
.kc-intro{border-left:3px solid ACC;padding:4px 0 4px 14px;margin:0 0 20px;color:MUTED;font-size:9.6pt}
.qs{columns:2;column-gap:28px}
.q{break-inside:avoid;margin:0 0 15px}
.q .qt{font-weight:600;color:NAVY;font-size:9.5pt;line-height:1.45;margin-bottom:6px;display:flex;gap:8px}
.q .qn{flex:0 0 auto;color:ACC;font-weight:700}
.opt{margin:3px 0 3px 18px;font-size:9.2pt;display:flex;align-items:flex-start;gap:8px;color:INK}
.bub{flex:0 0 15px;width:15px;height:15px;border:1.2px solid #8a96a8;border-radius:50%;text-align:center;font-size:7pt;line-height:13px;color:#8a96a8;font-weight:600;margin-top:1px}
.bub.on{background:NAVY;border-color:NAVY;color:#fff}
.why{margin:4px 0 0 41px;font-size:8.8pt;color:MUTED}
.qs.k{columns:1}
/* certificate */
.cert{position:relative;border:1px solid LINE;border-radius:18px;padding:44px 50px 34px;text-align:center;margin-top:6px;background:linear-gradient(180deg,#fff 0%,SOFT 100%)}
.cert:before{content:"";position:absolute;inset:8px;border:1.5px solid ACC;border-radius:12px;opacity:.55}
.cert img{height:62px;position:relative}
.cert .eyebrow{margin-top:18px;position:relative}
.cert .t{font-family:"Inter Display",Inter;font-size:24pt;font-weight:750;color:NAVY;margin:10px 0 4px;position:relative;letter-spacing:-.3px}
.cert .s{color:MUTED;position:relative}
.sig{display:flex;gap:34px;margin-top:34px;text-align:left;position:relative}
.sig div{flex:1}
.note{margin-top:18px;font-size:8.8pt;color:MUTED;text-align:center}
""".replace('NAVY2', NAVY2).replace('NAVY', NAVY).replace('ACC', ACC).replace('INK', INK).replace('MUTED', MUTED).replace('LINE', LINE).replace('SOFT', SOFT)


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
        out.append('<h3>' + html.escape(m.group(1)) + '</h3>' if m else '<p>' + inline(txt) + '</p>')
    return '\n'.join(out)



TERMS = {   # the "Key terms" box on each module page
    'w1': ['Hazard assessment', 'Slips, trips and falls', 'Hierarchy of controls', 'PPE', 'Routes of exposure', 'SDS', 'Fit test', 'Hepatitis B', 'Confined space'],
    'w2': ['Moisture sensor', 'Non-invasive meter', 'Pin meter', 'Thermo-hygrometer', 'IR camera', 'LGR', 'Desiccant', 'AFD / air scrubber', 'IICRC S500'],
    'w3': ['Work authorization', 'Source', 'Edge of the water', 'Preexisting damage', 'Dry standard', 'Drying goal', 'Extraction', 'Primary damage', 'Secondary damage'],
    'w4': ['Category 1', 'Category 2', 'Category 3', 'No Category 4', 'Biocide', 'Stop work'],
    'w5': ['Class 1 (<5%)', 'Class 2 (5–40%)', 'Class 3 (>40%)', 'Class 4 (deeply held)', 'Evaporation load', 'Wet surface area'],
    'w6': ['H.A.T.', 'Relative humidity', 'GPP', 'Vapor pressure', 'Dew point', 'Hygroscopic', 'Condensation', 'Sublimation', 'Permeance'],
    'w7': ['Closed drying', 'Dehumidifier factor', 'AHAM rating', 'Pints per day', 'ACH', 'CFM', 'Air mover formula', '7.48 gallons / CF', '8.34 lb / gallon'],
    'w8': ['In-place drying', 'Floating carpet', 'EMC', 'Cupping', 'Crowning', 'Buckling', 'MDF', 'Vapor barrier', 'Daily monitoring'],
    'w9': ['MVOCs', 'Sanitizer', 'Disinfectant', 'Sterilizer', 'Containment', 'Dry rot / wet rot', 'IEP'],
    'f1': ['Insured', 'Insurance carrier', 'Pretest', 'Track the smoke', 'Restore or replace'],
    'f2': ['Combustion', 'Incomplete combustion', 'Microns', 'PAHs', 'Protein residue', 'Natural residue', 'Synthetic residue', 'Natural wicks', 'Heightened awareness odor'],
    'f3': ['SDS', 'Labeled containers', 'Informed consent', 'HEPA air scrubber', 'Respirator', 'Lead (pre-1978)', 'Asbestos (pre-1977)'],
    'f4': ['Documentation', 'Work authorization', 'Structural integrity', 'Cold surfaces', 'Board-up', 'Acidic soot', 'Corrosion', 'Loss mitigation'],
    'f5': ['Four principles', 'Pairing agent', 'Masking agent', 'ULV fogger', 'Thermal fogger', 'Oxidizers', 'Ozone', 'Hydroxyl', 'Pack-out'],
    'f6': ['Preconditioning', 'Washable', 'Non-washable', 'Alkaline cleaner', 'Water first', 'Wood restoring cream'],
    'f7': ['Heat line', 'Ceiling to floor', 'Bottom to top', 'Dry sponge', 'Sealer', 'Media blasting', 'Etching', 'Puff-back', 'NADCA'],
    'f8': ['Three values', '0000 steel wool', 'Dry soil removal', 'Dry solvent', 'Ticking', 'Ultrasonic', 'Pad and strap'],
    'o1': ['Olfactory lobe', 'Real odor', 'Heightened awareness odor', 'Volatile', 'Acclimation', 'Adsorption', 'Natural wicks'],
    'o2': ['Remove the source', 'Clean', 'Penetrate', 'Seal', 'Perm rating'],
    'o3': ['Air exchange', 'Adsorbents', 'Neutralization', 'Oxidation', 'Biocides', 'Pairing agent', 'Masking', 'Bioenzymatic digestion'],
    'o4': ['Micron', 'Compression sprayer', 'Wet fogger', 'ULV fogger', 'Thermal fogger', 'Ozone generator', 'Hydroxyl generator'],
    'o5': ['Protein odor', 'Impingement', 'Ionization', 'Driven smoke', 'Free-floating smoke', 'Suppression spray', 'Time-release', 'Thermal fogging'],
    'o6': ['Pathogenic', 'Bacteria', 'Fungi', 'MVOCs', 'Viruses', 'EPA / Health Canada', 'Sterilant', 'Disinfectant', '-cide / -stat'],
    'o7': ['UV (black) light', 'Urine salts', 'Hygroscopic', 'Acid rinse', 'Spot treatment', 'Bio-enzymatic', 'Nonporous sealer', 'Oxidation'],
    'o8': ['Bloodborne pathogen', 'Exposure control plan', 'Universal precautions', 'Biohazard', 'Hepatitis B vaccine', 'Exposure incident'],
    'o9': ['ETS', 'Porous surfaces', 'Washing surfaces', 'Forced-air systems', '4-PCH', 'Ventilation', 'Find the source'],
}


def key_terms(body, n=9):
    """the module's bold words (not whole-line subheadings, not long phrases), first n, no repeats"""
    seen, out = set(), []
    for line in body.split('\n'):
        if re.fullmatch(r'\s*\*\*[^*]+\*\*\s*', line):
            continue
        for t in re.findall(r'\*\*(.+?)\*\*', line):
            t = t.strip().rstrip('.:').strip()
            k = t.lower()
            if 2 < len(t) <= 34 and k not in seen and not re.match(r'^(never|always|don\'t|stop|not)\b', k):
                seen.add(k); out.append(t)
    return out[:n]


def title_of(p):
    return re.sub(r'^\d+\.\s*', '', p['title'])


def page(title, body):
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + html.escape(title) + '</title><style>' + CSS + '</style></head><body>' + body + '</body></html>'


def cover(c, kicker, sub, stats):
    st = ''.join('<div class="cv-stat"><div class="n">%s</div><div class="l">%s</div></div>' % (n, l) for n, l in stats)
    return ('<section class="cover"><div class="cv-ring"></div><div class="cv-ring r2"></div>'
            '<div class="cv-logo"><img src="' + LOGO_WHITE + '"></div><div class="cv-kicker">' + kicker + '</div>'
            '<div class="cv-title">' + html.escape(c['title'].replace('GrayCo ', '')) + '</div><div class="cv-rule"></div>'
            '<div class="cv-sub">' + sub + '</div><div class="cv-stats">' + st + '</div>'
            '<div class="cv-foot">GrayCo Construction Services, LLC &nbsp;·&nbsp; Bartlett, Tennessee</div></section>')


def overview(c, lessons):
    tl = ''.join('<li data-n="%02d"><div class="t">%s</div></li>' % (i, html.escape(title_of(p))) for i, p in enumerate(lessons, 1))
    tl += '<li data-n="✓"><div class="t">Knowledge check &amp; completion record</div></li>'
    how = ''.join('<li>%s</li>' % t for t in [
        'Read one module at a time.',
        'Tick each module off in the CRM under <b>Training</b>.',
        'Take the test in the CRM. Each answer shows right away.',
        'Score <b>%d of %d</b> or better to pass.' % (C.PASS, len(c['quiz'])),
        'Ask your supervisor about anything unclear.'])
    return ('<section class="mod"><div class="eyebrow">Course overview</div><div class="mtitle" style="margin:6px 0 22px">What you will learn</div>'
            '<div class="ov"><div class="l"><ul class="tl">' + tl + '</ul></div><div class="r">'
            '<div class="card"><h4>How to use this manual</h4><ol>' + how + '</ol></div>'
            '<div class="card"><h4>Trainee</h4><div class="line">Name</div><div class="line">Start date</div><div class="line">Trainer</div></div>'
            '</div></div></section>')


def manual(c):
    lessons = [p for p in c['parts'] if p['id'] not in ('print', 'quiz')]
    sub = 'GrayCo\'s own training for our crews. It covers the subjects of the IICRC ' + html.escape(CERT.get(c['id'], '')) + ' course, so it doubles as your exam study guide.'
    b = [cover(c, 'GrayCo Employee Training', sub, [(str(len(lessons)), 'Modules'), (str(len(c['quiz'])), 'Test questions'), ('%d/%d' % (C.PASS, len(c['quiz'])), 'To pass')]),
         overview(c, lessons)]
    for i, p in enumerate(lessons, 1):
        terms = TERMS.get(p['id']) or key_terms(p['body'])
        b.append('<section class="mod"><div class="mhead"><div class="mnum">%02d</div><div><div class="eyebrow">Module %d of %d</div><div class="mtitle">%s</div></div></div>' % (i, i, len(lessons), html.escape(title_of(p))) +
                 ('<div class="terms"><div class="eyebrow">Key terms</div>' + ''.join('<span class="chip">' + html.escape(t) + '</span>' for t in terms) + '</div>' if terms else '') +
                 md(p['body']) +
                 '<div class="done"><span class="box"></span><span>Finished Module %d? Tick it off in the CRM: Forms &amp; Docs → Training → %s.</span></div></section>' % (i, html.escape(c['title'])))
    b.append('<section class="mod"><div class="mhead"><div class="mnum">✓</div><div><div class="eyebrow">Knowledge check</div><div class="mtitle">Test yourself</div></div></div>'
             '<div class="kc-intro">Fill in the bubble for the best answer. It is the same test as in the CRM, where each answer shows right away and your score is saved. You need <b>%d of %d</b> to pass.</div><div class="qs">' % (C.PASS, len(c['quiz'])))
    for n, (q, ch, a, why) in enumerate(c['quiz'], 1):
        b.append('<div class="q"><div class="qt"><span class="qn">%02d</span><span>%s</span></div>%s</div>' % (n, html.escape(q), ''.join('<div class="opt"><span class="bub">%s</span><span>%s</span></div>' % ('ABCD'[j], html.escape(x)) for j, x in enumerate(ch))))
    b.append('</div></section>')
    b.append('<section class="mod"><div class="eyebrow" style="text-align:center">Completion record</div>'
             '<div class="cert"><img src="' + LOGO + '"><div class="eyebrow">Certificate of completion</div><div class="t">' + html.escape(c['title']) + '</div>'
             '<div class="s">GrayCo Construction Services, LLC &nbsp;·&nbsp; Employee training</div>'
             '<div class="sig"><div><div class="line">Trainee name</div><div class="line">Trainee signature</div><div class="line">Date completed</div></div>'
             '<div><div class="line">Test score (out of %d)</div><div class="line">Trainer / supervisor</div><div class="line">Date reviewed</div></div></div></div>'
             '<div class="note">Keep a copy in the employee file. The CRM keeps every test score under Training → Team progress.</div></section>' % len(c['quiz']))
    return page(c['title'], b[0]), page(c['title'], '\n'.join(b[1:]))


def key(c):
    b = [cover(c, 'Trainer answer key', 'Answers and the reason for each. For trainers and admins only. Please do not hand this out.', [(str(len(c['quiz'])), 'Questions'), ('%d/%d' % (C.PASS, len(c['quiz'])), 'To pass')]),
         '<section class="mod"><div class="mhead"><div class="mnum">✓</div><div><div class="eyebrow">Answer key</div><div class="mtitle">Knowledge check answers</div></div></div><div class="qs k">']
    for n, (q, ch, a, why) in enumerate(c['quiz'], 1):
        b.append('<div class="q"><div class="qt"><span class="qn">%02d</span><span>%s</span></div><div class="opt"><span class="bub on">%s</span><span><b>%s</b></span></div><div class="why">%s</div></div>' % (n, html.escape(q), 'ABCD'[a], html.escape(ch[a]), html.escape(why)))
    b.append('</div></section>')
    return page(c['title'] + ' Answer Key', b[0]), page(c['title'] + ' Answer Key', '\n'.join(b[1:]))


STUDY = {   # course id → (term list module in tools/studysheets/, IICRC course name, file)
    'resto-water': ('wrt_terms', 'WRT', 'grayco-water-damage-restoration-study-guide.pdf'),
    'resto-fire': ('fsrt_terms', 'FSRT', 'grayco-fire-smoke-restoration-study-guide.pdf'),
    'resto-odor': ('oct_terms', 'OCT', 'grayco-odor-control-study-guide.pdf'),
}
STUDY_CSS = """
.sg-sec{break-inside:auto;margin:0 0 6px}
.sg-sec+.sg-sec{margin-top:18px}
.sg-h{display:flex;align-items:baseline;gap:12px;border-bottom:1px solid LINE;padding-bottom:6px;margin:0 0 10px;break-after:avoid}
.sg-h .n{font-family:"Inter Display",Inter;font-size:22pt;font-weight:200;color:ACC;line-height:1}
.sg-h .t{font-family:"Inter Display",Inter;font-size:14pt;font-weight:700;color:NAVY}
.sg-grid{columns:2;column-gap:22px}
.sg-t{break-inside:avoid;margin:0 0 9px;padding:8px 11px;background:SOFT;border-radius:9px;font-size:8.9pt;line-height:1.5}
.sg-t b{display:block;font-size:9.3pt;margin-bottom:1px}
""".replace('NAVY', NAVY).replace('ACC', ACC).replace('LINE', LINE).replace('SOFT', SOFT)


def study(c):
    import importlib
    mod, iicrc, _ = STUDY[c['id']]
    sys.path.insert(0, os.path.join(here, 'studysheets'))
    S = importlib.import_module(mod).S
    n = sum(len(x[1]) for x in S)
    cv = cover(c, 'GrayCo Study Guide', 'Every key term from the course with a plain-English definition, grouped by subject. Use it to review before the GrayCo test and the IICRC ' + iicrc + ' exam.',
               [(str(n), 'Key terms'), (str(len(S)), 'Subjects')]).replace(html.escape(c['title'].replace('GrayCo ', '')) + '</div>', html.escape(c['title'].replace('GrayCo ', '')) + '<br><span style="font-weight:300">Key Terms</span></div>', 1)
    b = []
    for i, (sec, items) in enumerate(S, 1):
        name = re.sub(r'^(Section|Chapter) \d+ – ', '', sec)
        b.append('<div class="sg-sec"><div class="sg-h"><span class="n">%02d</span><span class="t">%s</span></div><div class="sg-grid">' % (i, html.escape(name)) +
                 ''.join('<div class="sg-t"><b>%s</b>%s</div>' % (html.escape(t), html.escape(d)) for t, _pg, d in items) + '</div></div>')
    body = '<section class="mod"><div class="eyebrow">Study guide</div><div class="mtitle" style="margin:6px 0 20px">Key terms and definitions</div>' + ''.join(b) + '</section>'
    return page(c['title'] + ' Study Guide', cv), page(c['title'] + ' Study Guide', body).replace('</style>', STUDY_CSS + '</style>', 1)


jobs = []
tmp = tempfile.mkdtemp()
os.makedirs(os.path.join(root, 'training'), exist_ok=True)
for c in C.COURSES:
    for kind, fn, out in (('m', manual, os.path.join(root, 'training', c['pdf'])),
                          ('k', key, os.path.join(OUT_KEYS, c['pdf'].replace('.pdf', '-answer-key.pdf'))),
                          ('s', study, os.path.join(root, 'training', STUDY[c['id']][2]))):
        cv, body = fn(c)
        hc = os.path.join(tmp, kind + c['id'] + '-cover.html'); open(hc, 'w', encoding='utf-8').write(cv)
        hb = os.path.join(tmp, kind + c['id'] + '.html'); open(hb, 'w', encoding='utf-8').write(body)
        jobs.append({'cover': hc, 'html': hb, 'pdf': os.path.abspath(out), 'footer': html.escape(c['title'] + ({'k': ' · Answer key', 's': ' · Study guide'}.get(kind, '')))})
HEADER = '<div style="width:100%%;text-align:center;padding-top:0.32in"><img src="%s" style="height:26px"></div>' % LOGO_B64
js = """const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();const H=%s;
for(const j of %s){await p.goto('file://'+j.cover,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);await p.pdf({path:j.pdf+'.cover.pdf',width:'8.5in',height:'11in',printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});
await p.goto('file://'+j.html,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);await p.pdf({path:j.pdf+'.body.pdf',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,
headerTemplate:H,footerTemplate:'<div style="font-family:Inter,Arial;font-size:7px;letter-spacing:1.4px;text-transform:uppercase;width:100%%;padding:0 0.85in;display:flex;justify-content:space-between;color:#8a96a8"><span>GrayCo Employee Training &nbsp;·&nbsp; '+j.footer+'</span><span><span class=pageNumber></span> / <span class=totalPages></span></span></div>'});console.log('wrote',j.pdf)}await b.close()})()""" % (json.dumps(HEADER), json.dumps(jobs))
jsf = os.path.join(tmp, 'print.cjs'); open(jsf, 'w').write(js)
subprocess.run(['node', jsf], check=True, cwd=root)
import pymupdf
for j in jobs:
    d = pymupdf.open(j['pdf'] + '.cover.pdf'); d.insert_pdf(pymupdf.open(j['pdf'] + '.body.pdf'))
    d.set_metadata({'title': os.path.basename(j['pdf']).replace('-', ' ').replace('.pdf', '').title(), 'author': 'GrayCo Construction Services, LLC'})
    d.save(j['pdf'], garbage=3, deflate=True); os.remove(j['pdf'] + '.cover.pdf'); os.remove(j['pdf'] + '.body.pdf')
