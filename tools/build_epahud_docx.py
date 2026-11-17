#!/usr/bin/env python3
"""EPAHUD: Word copies of the 18 new EPA / HUD lead & asbestos forms (blank, for printing or filling by hand) in company-docs.
The CRM's own copies fill themselves from the job; these are the paper backup. Levels are never typed here: a level line says
"see the GrayCo Lead levels record (current version)". Run: python3 tools/build_epahud_docx.py"""
import os, re, sys, importlib.util
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
spec = importlib.util.spec_from_file_location('tpl', os.path.join(HERE, 'epahud_templates.py')); tpl = importlib.util.module_from_spec(spec); spec.loader.exec_module(tpl)
OUT = os.path.join(ROOT, 'company-docs', '01667c529f454cf1'); LOGO = os.path.join(ROOT, 'company-docs', '7c2e9d41b8a05f63', 'grayco_logo_black.png')
NAVY = RGBColor(0x0F, 0x24, 0x40)

def clean(t):
    t = re.sub(r'<[^>]+>', '', str(t)).replace('&nbsp;', ' ').replace('&amp;', '&').replace('&apos;', "'").replace('&quot;', '"')
    t = re.sub(r'\{lvl_source\}', 'GrayCo Lead levels record, current version', t)
    t = re.sub(r'\{lvl_[a-z_]+\}', '____ (see the GrayCo Lead levels record)', t)
    t = re.sub(r'\{[a-z_]+\}', '____________________', t)
    return t.strip()

def build(item):
    id, name, cat, jt, client, blocks = item
    d = Document()
    for s in d.sections: s.left_margin = s.right_margin = Inches(0.8); s.top_margin = s.bottom_margin = Inches(0.7)
    st = d.styles['Normal']; st.font.name = 'Arial'; st.font.size = Pt(10)
    if os.path.exists(LOGO):
        p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.add_run().add_picture(LOGO, width=Inches(1.9))
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('GrayCo Construction Services, LLC  ·  (901) 585-0944  ·  TN #85034 BCB · AR #0486990627 · MS #27769'); r.font.size = Pt(8.5)
    for b in blocks:
        k = b[0]
        if k == 'title':
            p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; r = p.add_run(clean(b[1])); r.bold = True; r.font.size = Pt(14); r.font.color.rgb = NAVY
            if len(b) > 2 and b[2]: p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; r = p.add_run(clean(b[2])); r.font.size = Pt(9); r.italic = True
        elif k == 'h':
            p = d.add_paragraph(); r = p.add_run(clean(b[1])); r.bold = True; r.font.size = Pt(11.5); r.font.color.rgb = NAVY
        elif k in ('p', 'small', 'box'):
            p = d.add_paragraph(); r = p.add_run(clean(b[1]));
            if k == 'small': r.font.size = Pt(8.5)
            if k == 'box': r.bold = False; p.paragraph_format.left_indent = Inches(0.2)
        elif k == 'info':
            t = d.add_table(rows=0, cols=2); t.style = 'Table Grid'
            for row in b[1]:
                c = t.add_row().cells; c[0].text = clean(row[0]); v = clean(row[1]); c[1].text = v if v else ''
            d.add_paragraph()
        elif k == 'checks':
            for x in b[1]: d.add_paragraph('☐ ' + clean(x))
        elif k == 'li':
            for x in b[1]: d.add_paragraph('• ' + clean(x))
        elif k == 'grid':
            cols, n = b[1], b[2]; t = d.add_table(rows=1, cols=len(cols)); t.style = 'Table Grid'
            for i, c in enumerate(cols):
                t.rows[0].cells[i].text = clean(c)
                for r in t.rows[0].cells[i].paragraphs[0].runs: r.bold = True; r.font.size = Pt(8.5)
            for _ in range(n): t.add_row()
            d.add_paragraph()
        elif k == 'sigs':
            d.add_paragraph('\n' + clean(b[1]) + ' — signature: ______________________   Date: __________')
            d.add_paragraph(clean(b[2]) + ' — signature: ______________________   Date: __________')
    p = d.add_paragraph(); r = p.add_run('Word copy for printing / filling by hand. In the CRM this form fills itself from the job (📚 Documents · 📑 Paperwork) and shows the job\'s company letterhead.'); r.font.size = Pt(7.5); r.italic = True
    fn = 'GrayCo_' + re.sub(r'[^A-Za-z0-9]+', '_', name.replace('—', '-')).strip('_')[:80] + '.docx'
    d.save(os.path.join(OUT, fn)); return fn

if __name__ == '__main__':
    names = [build(x) for x in tpl.T]
    print(len(names), 'files'); [print(' ', n) for n in names]
