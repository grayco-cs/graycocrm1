#!/usr/bin/env python3
"""Idempotent patch PROPLOGO: the proposal / contract print (proposal builder hl()) showed the WHITE logo on a WHITE page in print/PDF
(its print CSS turns every dark gradient band white, the white logo stayed).  Now:
  * the cover page carries the ONE standard centered letterhead, window._gcDocHeader({dual:true}): white logo on the dark screen cover,
    COLOUR logo on the white printed / PDF page;
  * the per-page title bands (q) no longer carry a logo (text only), so the proposal prints exactly ONE header.
Every find-pattern must occur exactly once.  Usage: python3 tools/patch_PROPLOGO.py [index.html]"""
import sys, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '/*PROPLOGO*/'
if MARK in src:
    print('already patched'); sys.exit(0)

def sub_once(text, pat, repl, label):
    ms = list(re.finditer(pat, text))
    assert len(ms) == 1, ('pattern count != 1', label, len(ms))
    m = ms[0]
    return text[:m.start()] + m.expand(repl) + text[m.end():]

B64 = r'data:image/png;base64,[A-Za-z0-9+/=]{200,}'
# 1. cover page: the white-only logo block -> the standard dual letterhead (white on dark screen, colour on white paper)
src = sub_once(src, r'<div style="margin-bottom:30px;">\s*<img src="' + B64 + r'" style="width:150px;height:auto;object-fit:contain;[^"]*">\s*</div>',
               '<div style="margin-bottom:22px;">${' + MARK + '(window._gcDocHeader?window._gcDocHeader({dual:true,email:"office@grayco-cs.com"}):"")}</div>', 'cover logo')
# the cover's own wordmark lines repeat the letterhead's company name: drop them (the letterhead says it once)
src = sub_once(src, r'\s*<div style="font-size:32px;font-weight:800;letter-spacing:0\.12em;margin-bottom:2px;">GRAYCO</div>\s*<div style="font-size:13px;font-weight:700;color:#c4a469;letter-spacing:0\.28em;margin-bottom:6px;">CONSTRUCTION SERVICES LLC</div>\s*<div style="font-size:9px;color:#8fa8c4;letter-spacing:0\.08em;margin-bottom:6px;">GrayCo Construction Services, LLC</div>', '', 'cover wordmark')
# 2. title bands: text only, no second logo
src = sub_once(src, r'(q=\(Ve,xt\)=>`<div style="background:linear-gradient\(135deg,#0f1d2f,#162d4a\);padding:14px 40px;color:#fff;display:flex;justify-content:space-between;align-items:center;">)<div style="display:flex;align-items:center;gap:12px;"><img src="' + B64 + r'" style="height:34px;width:auto;" />(<div><div style="font-size:9px;color:#6b8ab5;">GRAYCO CONSTRUCTION)',
               r'\1<div style="display:flex;align-items:center;gap:12px;">\2', 'band logo')
open(path, 'w', encoding='utf-8').write(src)
print('patched')
