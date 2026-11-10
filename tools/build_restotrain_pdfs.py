#!/usr/bin/env python3
"""RESTOTRAIN: the printable GrayCo training manuals, from the same words the CRM's 🎓 Training tab uses
(tools/restotrain_content.py).

    python3 tools/build_restotrain_pdfs.py [out dir for answer keys]

Writes training/<course>.pdf for every course (served at crm.grayco-cs.com/training/…, linked from each course's first
part). The answer keys are NOT put in the site: they go to the out dir (default: the current directory) for admins.
Look (owner 11/10: "more training looking, not proposal looking"): a cover page (navy band, white GrayCo logo, course title,
what's inside, how to use it, trainee lines), each module on its own page under a numbered module banner with a "Key terms"
box, a knowledge check with answer bubbles, and a completion record. Needs Node with Playwright.
"""
import html, json, os, re, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
sys.path.insert(0, here)
import restotrain_content as C

OUT_KEYS = sys.argv[1] if len(sys.argv) > 1 else '.'
LOGO_WHITE = 'file://' + os.path.join(root, 'img', 'grayco-logo-white.png')
LOGO = 'file://' + os.path.join(root, 'grayco-logo.jpg')
CERT = {'resto-water': 'WRT (Water Restoration Technician)', 'resto-fire': 'FSRT (Fire and Smoke Restoration Technician)',
        'resto-odor': 'OCT (Odor Control Technician)'}
NAVY, ACC = '#0f2440', '#d97706'
CSS = """@page{size:Letter;margin:0.75in 0.75in 0.8in}
@page :first{margin:0}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;font-size:10.5pt;line-height:1.5;margin:0}
b,strong{color:#0f172a}
/* cover */
.cover{height:11in;width:8.5in;position:relative;break-after:page;overflow:hidden}
.cv-top{background:NAVY;color:#fff;padding:0.7in 0.8in 0.55in;height:6.1in;position:relative}
.cv-top img{height:70px}
.cv-kicker{margin-top:0.55in;font-size:11pt;letter-spacing:3px;text-transform:uppercase;color:#fcd34d;font-weight:bold}
.cv-title{font-size:34pt;line-height:1.1;font-weight:bold;margin:10px 0 14px}
.cv-sub{font-size:12pt;color:#cbd5e1;max-width:5.8in}
.cv-stripe{height:10px;background:ACC}
.cv-body{padding:0.4in 0.8in 0;display:flex;gap:0.45in}
.cv-col{flex:1}
.cv-h{font-size:10pt;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:NAVY;margin:0 0 8px}
.cv-list{margin:0;padding:0;list-style:none}
.cv-list li{display:flex;gap:8px;margin:0 0 6px;font-size:10pt}
.cv-n{flex:0 0 22px;height:22px;border-radius:50%;background:NAVY;color:#fff;font-weight:bold;font-size:9pt;display:flex;align-items:center;justify-content:center}
.cv-line{border-bottom:1px solid #94a3b8;height:30px;margin:0 0 4px;font-size:8.5pt;color:#64748b;display:flex;align-items:flex-end}
.cv-foot{position:absolute;bottom:0.35in;left:0.8in;right:0.8in;font-size:8.5pt;color:#64748b;display:flex;justify-content:space-between}
/* modules */
.mod{break-before:page}
.mod-tag{display:inline-block;background:ACC;color:#fff;font-weight:bold;font-size:9pt;letter-spacing:2px;padding:4px 10px;border-radius:4px;text-transform:uppercase}
.mod-title{font-size:21pt;font-weight:bold;color:NAVY;margin:8px 0 4px;line-height:1.15}
.mod-bar{height:4px;background:NAVY;width:100%;margin:0 0 14px;border-radius:2px}
.terms{border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;padding:9px 12px;margin:0 0 14px;font-size:9.5pt}
.terms b{color:NAVY;letter-spacing:1px;text-transform:uppercase;font-size:8.5pt;display:block;margin-bottom:4px}
.terms span{display:inline-block;background:#fff;border:1px solid #bfdbfe;border-radius:12px;padding:1px 9px;margin:2px 4px 2px 0}
h3{font-size:12pt;color:NAVY;margin:14px 0 6px;padding-left:8px;border-left:4px solid ACC;break-after:avoid}
p{margin:0 0 8px}ul,ol{margin:0 0 10px;padding-left:20px}li{margin:0 0 4px}
ol li::marker{font-weight:bold;color:NAVY}
.done{margin-top:16px;border:1px dashed #94a3b8;border-radius:8px;padding:8px 12px;font-size:9.5pt;color:#334155;break-inside:avoid}
.box{display:inline-block;width:13px;height:13px;border:1.5px solid NAVY;border-radius:3px;vertical-align:-2px;margin-right:6px}
/* knowledge check */
.kc-intro{background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:9px 12px;margin:0 0 14px;font-size:10pt}
.q{break-inside:avoid;margin:0 0 12px}
.q .qt{font-weight:bold;color:#0f172a;margin-bottom:4px}
.q .qn{display:inline-block;min-width:24px;color:ACC}
.opt{margin:2px 0 2px 24px;font-size:10pt}
.bub{display:inline-block;width:15px;height:15px;border:1.5px solid #475569;border-radius:50%;text-align:center;font-size:7.5pt;line-height:12px;margin-right:7px;color:#475569;font-weight:bold}
.bub.on{background:NAVY;border-color:NAVY;color:#fff}
.why{margin:3px 0 0 24px;font-size:9.5pt;color:#334155}
/* completion */
.cert{border:3px double NAVY;border-radius:10px;padding:26px 34px;text-align:center;margin-top:10px}
.cert img{height:60px}
.cert .k{letter-spacing:3px;text-transform:uppercase;font-size:9pt;color:ACC;font-weight:bold;margin-top:10px}
.cert .t{font-size:20pt;font-weight:bold;color:NAVY;margin:6px 0 2px}
.sig{display:flex;gap:28px;margin-top:26px;text-align:left}
.sig div{flex:1}
""".replace('NAVY', NAVY).replace('ACC', ACC)


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


def cover(c, kicker, sub, lessons):
    mods = ''.join('<li><span class="cv-n">%d</span><span>%s</span></li>' % (i, html.escape(title_of(p))) for i, p in enumerate(lessons, 1))
    mods += '<li><span class="cv-n">✓</span><span>Knowledge check and completion record</span></li>'
    how = ''.join('<li><span class="cv-n">%d</span><span>%s</span></li>' % (i, t) for i, t in enumerate([
        'Read one module at a time.',
        'Tick it off in the CRM under <b>Training</b>.',
        'Take the test in the CRM: each answer shows right away.',
        'Score <b>%d of %d</b> or better to pass.' % (C.PASS, len(c['quiz'])),
        'Ask your supervisor about anything unclear.'], 1))
    return ('<section class="cover"><div class="cv-top"><img src="' + LOGO_WHITE + '"><div class="cv-kicker">' + kicker + '</div>'
            '<div class="cv-title">' + html.escape(c['title'].replace('GrayCo ', '')) + '</div><div class="cv-sub">' + sub + '</div></div>'
            '<div class="cv-stripe"></div><div class="cv-body"><div class="cv-col"><div class="cv-h">In this course</div><ul class="cv-list">' + mods + '</ul></div>'
            '<div class="cv-col"><div class="cv-h">How to use this manual</div><ul class="cv-list">' + how + '</ul>'
            '<div class="cv-h" style="margin-top:18px">Trainee</div><div class="cv-line">Name</div><div class="cv-line">Start date</div><div class="cv-line">Trainer</div></div></div>'
            '<div class="cv-foot"><span>GrayCo Construction Services, LLC · 4007 Broadway Rd., Bartlett, TN 38135 · (901) 585-0944</span></div></section>')


def manual(c):
    lessons = [p for p in c['parts'] if p['id'] not in ('print', 'quiz')]
    sub = ('GrayCo\'s own training for our crews. Covers the subjects of the IICRC ' + html.escape(CERT.get(c['id'], '')) +
           ' course, so it is also your study guide for that exam.')
    b = [cover(c, 'GrayCo Employee Training', sub, lessons)]
    for i, p in enumerate(lessons, 1):
        terms = TERMS.get(p['id']) or key_terms(p['body'])
        b.append('<section class="mod"><span class="mod-tag">Module %d of %d</span><div class="mod-title">%s</div><div class="mod-bar"></div>' % (i, len(lessons), html.escape(title_of(p))) +
                 ('<div class="terms"><b>Key terms in this module</b>' + ''.join('<span>' + html.escape(t) + '</span>' for t in terms) + '</div>' if terms else '') +
                 md(p['body']) +
                 '<div class="done"><span class="box"></span>I finished Module %d. Tick it off in the CRM: Forms &amp; Docs → Training → %s.</div></section>' % (i, html.escape(c['title'])))
    b.append('<section class="mod"><span class="mod-tag">Knowledge check</span><div class="mod-title">Test yourself</div><div class="mod-bar"></div>'
             '<div class="kc-intro">Fill in the bubble for the best answer. This is the same test as in the CRM, where each answer shows right away and your score is saved. '
             'You need <b>%d of %d</b> to pass.</div>' % (C.PASS, len(c['quiz'])))
    for n, (q, ch, a, why) in enumerate(c['quiz'], 1):
        b.append('<div class="q"><div class="qt"><span class="qn">%d.</span>%s</div>%s</div>' % (n, html.escape(q), ''.join('<div class="opt"><span class="bub">%s</span>%s</div>' % ('ABCD'[j], html.escape(x)) for j, x in enumerate(ch))))
    b.append('</section>')
    b.append('<section class="mod"><span class="mod-tag">Completion record</span><div class="mod-title">You finished the course</div><div class="mod-bar"></div>'
             '<div class="cert"><img src="' + LOGO + '"><div class="k">Certificate of completion</div><div class="t">' + html.escape(c['title']) + '</div>'
             '<div style="margin-top:6px">GrayCo Construction Services, LLC employee training</div>'
             '<div class="sig"><div><div class="cv-line">Trainee name</div><div class="cv-line">Trainee signature</div><div class="cv-line">Date completed</div></div>'
             '<div><div class="cv-line">Test score (out of %d)</div><div class="cv-line">Trainer / supervisor</div><div class="cv-line">Date reviewed</div></div></div></div>'
             '<p style="margin-top:18px;font-size:9.5pt;color:#475569">Keep a copy in the employee\'s file. The CRM keeps each person\'s test score under Training → Team progress.</p></section>' % len(c['quiz']))
    return page(c['title'], '\n'.join(b))


def key(c):
    b = [cover(c, 'Trainer answer key', 'Answers and the reason for each, for trainers and admins only. Do not hand this out. Passing score: %d of %d.' % (C.PASS, len(c['quiz'])), []).replace('<div class="cv-h" style="margin-top:18px">Trainee</div><div class="cv-line">Name</div><div class="cv-line">Start date</div><div class="cv-line">Trainer</div>', ''),
         '<section class="mod"><span class="mod-tag">Answer key</span><div class="mod-title">Knowledge check answers</div><div class="mod-bar"></div>']
    for n, (q, ch, a, why) in enumerate(c['quiz'], 1):
        b.append('<div class="q"><div class="qt"><span class="qn">%d.</span>%s</div><div class="opt"><span class="bub on">%s</span><b>%s</b></div><div class="why">%s</div></div>' % (n, html.escape(q), 'ABCD'[a], html.escape(ch[a]), html.escape(why)))
    b.append('</section>')
    return page(c['title'] + ' Answer Key', '\n'.join(b))


jobs = []
tmp = tempfile.mkdtemp()
os.makedirs(os.path.join(root, 'training'), exist_ok=True)
for c in C.COURSES:
    for kind, fn, out in (('m', manual, os.path.join(root, 'training', c['pdf'])),
                          ('k', key, os.path.join(OUT_KEYS, c['pdf'].replace('.pdf', '-answer-key.pdf')))):
        h = os.path.join(tmp, kind + c['id'] + '.html'); open(h, 'w', encoding='utf-8').write(fn(c))
        jobs.append({'html': h, 'pdf': os.path.abspath(out), 'footer': 'GrayCo Employee Training · ' + c['title'] + (' · Answer Key' if kind == 'k' else '')})
js = """const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();
for(const j of %s){await p.goto('file://'+j.html,{waitUntil:'load'});await p.pdf({path:j.pdf,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,
headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:8px;width:100%%;padding:0 0.75in;display:flex;justify-content:space-between;font-family:Arial;color:#64748b"><span>'+j.footer+'</span><span>Page <span class=pageNumber></span> of <span class=totalPages></span></span></div>'});console.log('wrote',j.pdf)}await b.close()})()""" % json.dumps(jobs)
subprocess.run(['node', '-e', js], check=True)
