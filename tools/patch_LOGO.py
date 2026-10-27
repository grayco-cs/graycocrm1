#!/usr/bin/env python3
"""Idempotent patch LOGO: the GrayCo logo on every document the CRM produces (owner 10/26).

One shared header (tools/logo_tail.js -> window._gcDocHeader / _gcPdfLogo, logo at the left 0.7 in, "GrayCo Construction Services",
phone 901-585-0944, license line) used by every print / PDF generator, plus two fallbacks so a document added later is covered:
every window the CRM opens for a printable document gets the header injected when it lacks the logo, and every jsPDF document gets a
logo on page 1 and a company footer on pages 2+ when the generator did not draw them.
Also: gcLogoBar (library papers) and the hand-made headers of the estimate / scope / proposal prints now use the same header;
portal.html and the sub portal documents; the server PDFs / e-mail shell (netlify/functions).
Every find-string must occur exactly once.  Usage: python3 tools/patch_LOGO.py [index.html] [portal.html]
"""
import sys, os, re
import re as _re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
ipath = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
ppath = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'portal.html')
src = open(ipath, encoding='utf-8').read()
psrc = open(ppath, encoding='utf-8').read()
MARK = '__GC_PATCH_LOGO__'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(text, old, new, label):
    n = text.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    return text.replace(old, new)


def done_before(txt):
    """this file already carries patch LOGO (patch LOGOALL is another patch)"""
    return _re.search(r'patch LOGO(?!ALL)', txt) is not None

def cut(text, start, end, new, label, keep_end=True):
    """replace text[start .. end) (end kept) once; start must occur exactly once, end must follow it"""
    assert text.count(start) == 1, ('start count != 1', label, text.count(start))
    a = text.index(start)
    b = text.index(end, a + len(start))
    return text[:a] + new + (text[b:] if keep_end else text[b + len(end):])

HD = "(window._gcDocHeader?window._gcDocHeader(%s):'')"

# ---------------------------------------------------------------- 1. the shared helper block
tail = open(os.path.join(HERE, 'logo_tail.js'), encoding='utf-8').read()
assert MARK in tail
ANCHOR = "try { console.log('[GC] Logo letterhead everywhere; office phone unless direct lines are on (patch LOGOALL)'); } catch (e) {}\n})();\n</script>\n"
src = once(src, ANCHOR, ANCHOR + '<script id="gc-patch-logo">\n' + tail.rstrip('\n') + '\n</script>\n', 'helper block')


# ---------------------------------------------------------------- 2. the papers that drew their own dark header band
# 2a. library papers (gcLogoBar): the white logo at the left on the band, name / phone / license beside it, then the title
OLD_BAR_START = "function gcLogoBar(docTitle){\n  return [\n    '<div class=\"logo-bar\">',"
NEW_BAR = """function gcLogoBar(docTitle){
  /* patch LOGO: the one GrayCo header (white logo at the left of the band, name / phone / license beside it), then the title */
  return [
    '<div class="logo-bar">',
      """ + HD % "{dark:true,email:'office@grayco-cs.com'}" + """,
      '<div style="text-align:center;margin-top:10px"><div class="doc-title" style="border-color:#d4a017;color:#d4a017">'+esc(docTitle)+'</div></div>',
      '<div style="text-align:center;margin-top:6px"><a href="https://g.page/r/GrayCoConstructionServices/review" style="color:#d4a017;font-size:9pt">&#11088; Leave us a Google Review</a></div>',
    '</div>'
  ].join('');
}
"""
src = cut(src, OLD_BAR_START, "\nfunction row2(l1,v1,l2,v2){", NEW_BAR, 'gcLogoBar')

# 2b. Professional Invoice (library): same
src = cut(src, "            // Logo + company\n            '<div style=\"display:flex;flex-direction:column;align-items:center;gap:8px\">',\n              '<img src=\"'+logo_src+'\"",
          "            // INVOICE badge\n",
          "            // patch LOGO: the one GrayCo header\n            '<div style=\"align-self:stretch;width:100%\">'+" + HD % "{dark:true,email:'office@grayco-cs.com'}" + "+'</div>',\n", 'invoice header')

# 2c. Estimate document (dark band)
src = cut(src, "    // Header\n    '<div class=\"hdr\">',\n      '<div style=\"display:flex;flex-direction:column;align-items:center;gap:6px\">',\n        ((window.GC_LOGO_PRINT||window.GC_LOGO_B64)",
          "      '<div class=\"est-badge\">',\n",
          "    // Header (patch LOGO: the one GrayCo header above the dark band)\n    '<div style=\"padding:14px 28px 0\">'+" + HD % "{email:'office@grayco-cs.com'}" + "+'</div>',\n    '<div class=\"hdr\">',\n", 'estimate header')

# 2d. Scope of Work (by trade / all trades) print
src = cut(src, "    var header = '<div style=\"text-align:center;border-bottom:3px solid #0f2440;padding-bottom:10px;margin-bottom:12px\">'",
          "\n\n    return '<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>'+title+'</title>'",
          "    var header = " + HD % "{}" + "\n      + '<div style=\"font-size:9.5pt;color:#334;margin:-6px 0 12px\">'\n        + personBlock('Estimator', estName, estU)\n        + (pmName?personBlock('Project Manager', pmName, pmU):'')\n      + '</div>';", 'scope header')

# 2e. GrayCo proposal (Google-Doc style letter) and its Word copy
src = cut(src, "      + '<div class=\"hdr\">'+logo\n        + '<div><div class=\"co\">GrayCo Construction Services, LLC</div>'",
          "      + '<div class=\"center\" style=\"margin:22px 0 14px;font-weight:700\">'+esc(dateStr)+'</div>'",
          "      + " + (HD % "{}") + "\n      + '<div class=\"coinfo\" style=\"text-align:left;margin:-6px 0 6px\">TIN#33-2106808</div>'\n", 'proposal header')
src = cut(src, "    +'<table style=\"width:100%;border:none;\"><tr>'\n    +'<td style=\"border:none;vertical-align:top;text-align:center;\">'+((window.GC_LOGO_PRINT",
          "    +'<p style=\"display:none;\"><b style=\"font-size:14pt;\">GrayCo Construction Services, LLC</b></p>'",
          "    +" + (HD % "{}") + "\n    +'<p class=\"muted\" style=\"margin:0 0 6px\">TIN#33-2106808</p>'\n", 'estimate word header')


# 2f. the screen / print invoice view (_gcViewInvoicePDF): its hand-drawn roof + GRAYCO lettering becomes the one header
src = cut(src, "          '<div class=\"logo-block anim d1\">',\n            '<svg class=\"roof\"",
          "          '<div class=\"right anim d1\">",
          "          '<div class=\"anim d1\" style=\"align-self:stretch\">'+" + HD % "{dual:true,email:'billing@grayco-cs.com'}" + "+'</div>',\n", 'invoice view header')


# 2g. the library's own "no header? add one" check (DOCLIB3) also knows a logo image that has no data-gc-logo mark
src = once(src, "if (fromLib && !d.querySelector('[data-gc-logo], .gc-print-head') && W._gcPrintHead)",
           "if (fromLib && !d.querySelector('[data-gc-logo], .gc-print-head, img[src*=\"grayco-logo\"], img[src*=\"portal-logo\"], .gc-dual') && W._gcPrintHead)", 'doclib3 head check')


# ---------------------------------------------------------------- 3. hand-made PDFs (no jsPDF): same logo header
# 3a. the portal e-sign papers (Work Authorization / Direction to Pay) made with jsPDF
src = once(src, "    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('GrayCo Construction Services', m, y); y += 16;\n    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(companyAddr() + '  ·  (901) 585-0944', m, y); y += 26;\n",
           "    if (W._gcPdfLogo) { y = W._gcPdfLogo(doc, { m: m }) + 4; } else {   /* patch LOGO: the one logo header */\n    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('GrayCo Construction Services', m, y); y += 16;\n    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(companyAddr() + '  ·  (901) 585-0944', m, y); y += 26; }\n", 'makePdf header')
# 3b. insurance reports / supplement request / claim package (indigo band): logo 0.64 in, name + phone + licenses beside it
src = once(src, "    if (D.img) { var lh = 40, lw = lh * D.img.w / D.img.h; D.image(M - 6, 15, lw, lh); } else D.text(M, 42, GC_NAME.toUpperCase(), { size: 14, bold: true, color: '#FFFFFF' });",
           "    if (D.img) { var lh = 46, lw = lh * D.img.w / D.img.h, tx = M - 6 + lw + 6; D.image(M - 6, 12, lw, lh);   /* patch LOGO: name / phone / licenses beside the logo */\n      D.text(tx, 30, GC_NAME, { size: 10.5, bold: true, color: '#FFFFFF' }); D.text(tx, 42, '901-585-0944', { size: 8, color: '#D8D4F5' }); D.text(tx, 53, 'TN #85034 BCB \\u00B7 AR #0486990627 \\u00B7 MS #27769', { size: 7.5, color: '#D8D4F5' }); }\n    else D.text(M, 42, GC_NAME.toUpperCase(), { size: 14, bold: true, color: '#FFFFFF' });", 'pdfReport band')
# 3c. GrayCo Photos photo report PDF: the company line above the title, beside the logo
src = once(src, "    ops += T(160, 740, 16, title || 'Photo report', true, BR) +",
           "    ops += T(160, 755, 8.5, 'GrayCo Construction Services  |  901-585-0944  |  TN #85034 BCB  AR #0486990627  MS #27769', false, GR);   /* patch LOGO */\n    ops += T(160, 740, 16, title || 'Photo report', true, BR) +", 'photo report header')


# ---------------------------------------------------------------- 4. the customer portal and the sub portal: document views
_m = _re.search(r"W\.GC_LOGO_PRINT = '(data:image/jpeg;base64,[A-Za-z0-9+/=]+)'", src)
assert _m, 'GC_LOGO_PRINT not found'
LOGO_DATA = _m.group(1)
PORTAL_HEAD = """<script>
/* patch LOGO: the GrayCo header on every document view in the portal (customer portal + sub portal): logo at the left, name, phone, licenses */
window.gcDocHead = function(){
  var d = document.createElement('div'); d.className = 'gc-dochead'; d.setAttribute('data-gc-logo', '1');
  d.style.cssText = 'display:flex;align-items:center;gap:12px;padding:0 0 10px;margin:0 0 12px;border-bottom:2px solid #241968;text-align:left;color:#0F1D2F';
  var im = document.createElement('img'); im.setAttribute('src', '""" + LOGO_DATA + """'); im.alt = 'GrayCo Construction Services'; im.setAttribute('data-gc-logo-img', '1');
  im.style.cssText = 'height:0.7in;width:auto;display:block;flex:0 0 auto';
  var tx = document.createElement('div'); tx.style.cssText = 'line-height:1.4;min-width:0';
  var a = document.createElement('div'); a.style.cssText = 'font-size:16px;font-weight:800'; a.textContent = 'GrayCo Construction Services';
  var b = document.createElement('div'); b.style.cssText = 'font-size:13px'; b.textContent = '901-585-0944 \\u00B7 grayco-cs.com';
  var c = document.createElement('div'); c.style.cssText = 'font-size:11.5px;color:#55626F'; c.textContent = 'TN #85034 BCB \\u00B7 AR #0486990627 \\u00B7 MS #27769';
  tx.appendChild(a); tx.appendChild(b); tx.appendChild(c); d.appendChild(im); d.appendChild(tx); return d;
};
</script>
"""
psrc = once(psrc, '<script src="/gc-address.js"></script>\n', '<script src="/gc-address.js"></script>\n' + PORTAL_HEAD, 'portal gcDocHead')
psrc = once(psrc, "var box = h('section', { class: 'card' }, [h('h2', { text: 'Documents & proposals' }),",
            "var box = h('section', { class: 'card' }, [window.gcDocHead ? window.gcDocHead() : null, h('h2', { text: 'Documents & proposals' }),", 'portal docs head')
psrc = once(psrc, "var box = h('section', { class: 'card', id: 'insDocs' }, [h('h2', { text: 'Your insurance papers' }),",
            "var box = h('section', { class: 'card', id: 'insDocs' }, [window.gcDocHead ? window.gcDocHead() : null, h('h2', { text: 'Your insurance papers' }),", 'portal insurance docs head')
psrc = once(psrc, "  var box = h('div', { class: 'es-item', 'data-id': x.id, 'data-status': x.status }, [\n",
            "  var box = h('div', { class: 'es-item', 'data-id': x.id, 'data-status': x.status }, [\n    window.gcDocHead ? window.gcDocHead() : null,\n", 'portal e-sign paper head')

# the sub portal (portal-app.js): the paper a sub signs and the PDF viewer
pa_path = os.path.join(ROOT, 'portal-app.js')
pa = open(pa_path, encoding='utf-8').read()
if not done_before(pa):
    pa = once(pa, "  var sh = sheet(t('signTitle') + ' — ' + (x.title || t(x.kind === 'co' ? 'cos' : 'scope')), [\n    h('div', { class: 'row total' },",
              "  var sh = sheet(t('signTitle') + ' — ' + (x.title || t(x.kind === 'co' ? 'cos' : 'scope')), [\n    window.gcDocHead ? window.gcDocHead() : null,   /* patch LOGO */\n    h('div', { class: 'row total' },", 'sub portal sign sheet')
    pa = once(pa, "var sh = sheet(f.name, [h('iframe', { class: 'pdf', src: f.url, title: f.name }),",
              "var sh = sheet(f.name, [window.gcDocHead ? window.gcDocHead() : null, h('iframe', { class: 'pdf', src: f.url, title: f.name }),   /* patch LOGO */", 'sub portal viewer')
    open(pa_path, 'w', encoding='utf-8').write(pa)


# ---------------------------------------------------------------- 5. server: e-mail shell, PDFs, public pages (netlify/functions)
def fedit(rel, pairs, label):
    path = os.path.join(ROOT, rel)
    txt = open(path, encoding='utf-8').read()
    if done_before(txt):
        return
    for old, new in pairs:
        txt = once(txt, old, new, label + ': ' + old[:40])
    open(path, 'w', encoding='utf-8').write(txt)

# 5a. the e-mail shell (_lib/brand.js): the COLOUR logo at the left on the white header (the white portal logo was invisible on white)
_bp = os.path.join(ROOT, 'netlify/functions/_lib/brand.js'); _bt = open(_bp, encoding='utf-8').read()
if not done_before(_bt):
    _bt = once(_bt, "  logoPath: '/portal-logo.png',\n", "  logoPath: '/portal-logo.png',                 /* white logo: for dark bands */\n  logoColorPath: '/grayco-logo-wide.jpg',       /* patch LOGO: the colour logo (420 x 254), for white e-mail headers */\n", 'brand logoColorPath')
    _bt = once(_bt, "function logoUrl(){ return siteBase() + BRAND.logoPath; }\n", "function logoUrl(){ return siteBase() + BRAND.logoPath; }\nfunction logoColorUrl(){ return siteBase() + BRAND.logoColorPath; }   /* patch LOGO: absolute https://crm.grayco-cs.com/grayco-logo-wide.jpg */\n", 'brand logoColorUrl')
    _bt = cut(_bt, "  const head = hasLogo ? '' : '<tr><td align=\"center\"", "\n  const sig = o.sender === false",
        "  /* patch LOGO: (owner 10/26: every document carries the logo): the colour logo at the LEFT, 0.7 in tall, GrayCo Construction Services · phone · licenses beside it, on white */\n"
        "  const head = hasLogo ? '' : '<tr><td style=\"background:#ffffff;padding:14px 24px;border-bottom:4px solid ' + BRAND.gold + ';text-align:left\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"border:0\"><tr>' +\n"
        "    '<td style=\"padding:0 14px 0 0;vertical-align:middle\"><img src=\"' + esc(o.logoUrl || logoColorUrl()) + '\" alt=\"' + BRAND.name + '\" width=\"111\" height=\"67\" style=\"display:block;width:111px;height:67px;border:0\"></td>' +\n"
        "    '<td style=\"vertical-align:middle;font-family:Arial,Helvetica,sans-serif;line-height:1.4\"><div style=\"font-size:17px;font-weight:bold;color:' + BRAND.navy + '\">' + BRAND.name + '</div>' +\n"
        "    '<div style=\"font-size:12px;color:#55626F\">' + BRAND.phone + ' · grayco-cs.com</div><div style=\"font-size:11px;color:#6B7785\">' + BRAND.licenses + '</div></td></tr></table></td></tr>';", 'brand head')
    _bt = once(_bt, "logoUrl: logoUrl, siteBase: siteBase,", "logoUrl: logoUrl, logoColorUrl: logoColorUrl, siteBase: siteBase,", 'brand export')
    open(_bp, 'w', encoding='utf-8').write(_bt)

# 5b. the same shell as the CRM previews it
src = once(src, "'<div style=\"padding:16px 22px;border-bottom:4px solid ' + B.gold + '\"><img src=\"' + B.logo + '\" alt=\"' + B.name + '\" width=\"150\" style=\"width:150px;height:auto\"></div>' +",
    "'<div style=\"padding:14px 22px;border-bottom:4px solid ' + B.gold + ';display:flex;align-items:center;gap:14px\"><img src=\"https://crm.grayco-cs.com/grayco-logo-wide.jpg\" alt=\"' + B.name + '\" width=\"111\" height=\"67\" style=\"width:111px;height:67px;display:block\"><div style=\"line-height:1.4\"><div style=\"font-size:17px;font-weight:bold;color:' + B.navy + '\">' + B.name + '</div><div style=\"font-size:12px;color:#55626F\">' + B.phone + ' · grayco-cs.com</div><div style=\"font-size:11px;color:#6B7785\">' + B.licenses + '</div></div></div>' +   /* patch LOGO */", 'client email shell preview')

# 5c. the invoice PDF: the wide colour logo at the left, 50 pt = 0.7 in tall, on its white tile; name / address / phone / licenses beside it
fedit('netlify/functions/_lib/invoice-pdf.js', [
    ("const LOGO = require('./brand-logo.js');\n", "const LOGO = require('./logo-wide.js');   /* patch LOGO: 420 x 254, cropped to the art */\n"),
    ("  rect(L - 4, PH - 88, 76, 76, '1 1 1');\n  ops.push('q 68 0 0 68 ' + L + ' ' + (PH - 84) + ' cm /Im1 Do Q');\n  const TX = L + 84;\n  text(TX, PH - 40, COMPANY, 18, true, '1 1 1');\n",
     "  rect(L - 4, PH - 82, 91, 58, '1 1 1');   /* patch LOGO: the logo is 50 pt = 0.7 in tall at the left */\n  ops.push('q 83 0 0 50 ' + L + ' ' + (PH - 78) + ' cm /Im1 Do Q');\n  const TX = L + 101;\n  text(TX, PH - 40, COMPANY, 16.5, true, '1 1 1');\n")], 'invoice-pdf')

# 5d. the signed copy / selections PDF: logo at the LEFT (0.7 in), name · address · phone · licenses beside it; pages 2+ get a company footer
fedit('netlify/functions/selections.js', [
    ("const L = require('./_lib/logo-jpg.js');", "const L = require('./_lib/logo-wide.js');   /* patch LOGO */"),
    ("      const lh = LOGO ? 52 : 0, lw = LOGO ? Math.round(lh * LOGO.w / LOGO.h) : 0; need(lh + 52); const top = y;\n"
     "      if (LOGO) ops.push('q ' + lw + ' 0 0 ' + lh + ' ' + ((W - lw) / 2).toFixed(1) + ' ' + (top - lh).toFixed(1) + ' cm /Im1 Do Q');\n"
     "      y = top - lh - 20; textC(b.text, 18, true);\n"
     "      let addr = ''; try { addr = require('./_lib/brand.js').companyAddress(); } catch (e) {}\n"
     "      y -= 13; textC([addr, OFFICE_PHONE, 'grayco-cs.com'].filter(Boolean).join(' · '), 9, false, '0.33 0.38 0.44');\n"
     "      y -= 9; ops.push('0.83 0.63 0.09 RG 2 w ' + M + ' ' + y.toFixed(1) + ' m ' + (W - M) + ' ' + y.toFixed(1) + ' l S'); y -= 12; return;\n",
     "      /* patch LOGO: the logo at the left (50 pt = 0.7 in), the name, address · phone and licenses beside it */\n"
     "      const lh = LOGO ? 50 : 0, lw = LOGO ? Math.round(lh * LOGO.w / LOGO.h) : 0; need(lh + 30); const top = y, tx = (M + (lw ? lw + 12 : 0)).toFixed(1);\n"
     "      if (LOGO) ops.push('q ' + lw + ' 0 0 ' + lh + ' ' + M + ' ' + (top - lh).toFixed(1) + ' cm /Im1 Do Q');\n"
     "      y = top - 16; text(b.text, 16, true, tx);\n"
     "      let addr = ''; try { addr = require('./_lib/brand.js').companyAddress(); } catch (e) {}\n"
     "      y -= 14; text([addr, OFFICE_PHONE, 'grayco-cs.com'].filter(Boolean).join(' \\u00B7 '), 8.5, false, tx, '0.33 0.38 0.44');\n"
     "      y -= 11; text('TN #85034 BCB \\u00B7 AR #0486990627 \\u00B7 MS #27769', 8, false, tx, '0.42 0.46 0.52');\n"
     "      y = Math.min(y, top - lh) - 8; ops.push('0.14 0.10 0.41 RG 1.5 w ' + M + ' ' + y.toFixed(1) + ' m ' + (W - M) + ' ' + y.toFixed(1) + ' l S'); y -= 14; return;\n"),
    ("  page();\n  const objs = [];\n  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';\n  const kids = []; let n = 6;\n",
     "  page();\n  pages.forEach(function(c, i){   /* patch LOGO: pages 2+ carry the company name at the foot */\n    if (i === 0) return;\n    const ft = 'GrayCo Construction Services \\u00B7 ' + OFFICE_PHONE + ' \\u00B7 page ' + (i + 1) + ' of ' + pages.length;\n    pages[i] = c + '\\nBT /F1 7.5 Tf 0.42 0.46 0.52 rg ' + ((W - textW(ft, 7.5, false)) / 2).toFixed(1) + ' 24 Td ' + pdfStr(ft) + ' Tj ET';\n  });\n  const objs = [];\n  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';\n  const kids = []; let n = 6;\n"),
    ], 'selections')



# 5e. the warranty registry PDF (_lib/gcp.js): logo header on page 1 (was a plain navy band), company footer on pages 2+
fedit('netlify/functions/_lib/gcp.js', [
    ("function simplePdf(lines){\n  /* lines: [{ t, size, bold, gap }] → one or more Letter pages */\n  const pages = []; let ops = [], y = 740;\n",
     "function simplePdf(lines){\n  /* lines: [{ t, size, bold, gap }] → one or more Letter pages */\n  const pages = []; let ops = [], y = 668;   /* patch LOGO: page 1 starts below the logo header */\n"),
    ("      if (y < 60) { pages.push(ops); ops = []; y = 740; }\n      ops.push('BT /' + (l.bold ? 'F2' : 'F1')",
     "      if (y < 60) { pages.push(ops); ops = []; y = 740; }\n      ops.push('BT /' + (l.bold ? 'F2' : 'F1')"),
    ("  const kids = [];\n  pages.forEach(function(o){\n    const stream = ['0.06 0.11 0.18 rg 0 752 612 40 re f', '0.83 0.63 0.09 rg 0 748 612 4 re f', '0 0 0 rg'].concat(o).join('\\n');\n",
     "  const kids = [];\n"
     "  /* patch LOGO: the colour logo at the left (50 pt = 0.7 in), name / address · phone / licenses beside it, a rule under it; pages 2+ carry the company name at the foot */\n"
     "  const LG = require('./logo-wide.js'), logoBin = Buffer.from(LG.b64, 'base64').toString('latin1'), BRd = require('./brand.js').BRAND;\n"
     "  const logoObj = add('<< /Type /XObject /Subtype /Image /Width ' + LG.w + ' /Height ' + LG.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + logoBin.length + ' >>\\nstream\\n' + logoBin + '\\nendstream');\n"
     "  const head1 = ['q 83 0 0 50 64 718 cm /Im1 Do Q',\n"
     "    'BT /F2 16 Tf 0.06 0.14 0.25 rg 159 750 Td ' + pdfText(BRd.name) + ' Tj ET',\n"
     "    'BT /F1 8.5 Tf 0.33 0.38 0.44 rg 159 737 Td ' + pdfText(BRd.address + '  ·  ' + BRd.phone + '  ·  grayco-cs.com') + ' Tj ET',\n"
     "    'BT /F1 8 Tf 0.42 0.46 0.52 rg 159 725 Td ' + pdfText(BRd.licenses) + ' Tj ET',\n"
     "    '0.14 0.10 0.41 RG 1.5 w 64 708 m 548 708 l S', '0 0 0 rg'];\n"
     "  pages.forEach(function(o, pi){\n"
     "    const foot = pi === 0 ? [] : ['0.83 0.63 0.09 rg 0 784 612 8 re f', 'BT /F1 7.5 Tf 0.42 0.46 0.52 rg 170 24 Td ' + pdfText(BRd.name + '  ·  ' + BRd.phone + '  ·  page ' + (pi + 1) + ' of ' + pages.length) + ' Tj ET'];\n"
     "    const stream = (pi === 0 ? head1 : ['0 0 0 rg']).concat(o, foot).join('\\n');\n"),
    ("/Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> >> /Contents ' + c + ' 0 R >>'));",
     "/Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >>' + (pi === 0 ? ' /XObject << /Im1 ' + logoObj + ' 0 R >>' : '') + ' >> /Contents ' + c + ' 0 R >>'));"),
    ], 'gcp simplePdf')

# 5f. the sub's lien-waiver page (lien.js): the white logo at the left of its navy bar, 0.7 in tall
fedit('netlify/functions/lien.js', [
    ("'<div style=\"background:#0F1D2F;color:#fff;padding:14px 16px;border-radius:12px 12px 0 0;font-weight:bold;font-size:18px\">GrayCo Construction Services — lien waiver</div>' +",
     "'<div style=\"background:#0F1D2F;color:#fff;padding:12px 16px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:14px\"><img src=\"/portal-logo.png\" alt=\"GrayCo Construction Services\" width=\"119\" height=\"67\" style=\"height:0.7in;width:auto;display:block\"><div style=\"line-height:1.4\"><div style=\"font-weight:bold;font-size:18px\">GrayCo Construction Services</div><div style=\"font-size:13px;color:#C9D3E0\">901-585-0944 · Lien waiver</div><div style=\"font-size:11px;color:#D4A017\">TN #85034 BCB · AR #0486990627 · MS #27769</div></div></div>' +   /* patch LOGO: */")], 'lien page')


# 5g. e-mails that went out without the shell (no logo): the sub's lien-waiver request and the employee's pay stub
fedit('netlify/functions/_lib/lien.js', [
    ("subject: clip('Lien waiver to sign — ' + (w.jobName || 'GrayCo job') + ' (' + usd(w.amount) + ')', 200), html: html }) });",
     "subject: clip('Lien waiver to sign — ' + (w.jobName || 'GrayCo job') + ' (' + usd(w.amount) + ')', 200), html: require('./brand.js').shell(html, { sender: false }) }) });   /* patch LOGO: the logo header */")], 'lien mail')
fedit('netlify/functions/paystubs.js', [
    ("subject: 'Your pay stub — ' + st.payDate, html: stubHtml(st) }) });",
     "subject: 'Your pay stub — ' + st.payDate, html: require('./_lib/brand.js').shell(stubHtml(st), { sender: false, legal: false }) }) });   /* patch LOGO: the logo header */")], 'paystub mail')


# 2h. more hand-made headers -> the one header: the selections sheet, the claim scope sheet, the fallback invoice popup, the tutorial
src = cut(src, "    '<div class=\"top\"><div>' + (window._gcPrintLogo?window._gcPrintLogo(54):'') + '<div class=\"co\">GrayCo Construction Services</div>",
          "    '<div><b>' + esc(p.name) + '</b></div><div class=\"m\">' + esc([p.client, p.address].filter(Boolean).join(' · ')) + '</div>' +",
          "    " + HD % "{}" + " + '<div style=\"display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px\"><h1>Your selections</h1><div class=\"m\">' + esc(today) + '</div></div>' +   /* patch LOGO */\n", 'selections sheet header')
src = cut(src, "    '<div class=\"hdr\"><div>' + (window._gcPrintLogo?window._gcPrintLogo(54):'') + '<b style=\"font-size:16px\">GRAYCO CONSTRUCTION SERVICES</b>",
          "    '<h1>' + esc(sc.title) + '</h1><div class=\"m\">' + esc([p.name, p.address].filter(Boolean).join(' · ')) + '</div>' +",
          "    " + HD % "{}" + " + '<div class=\"m\" style=\"margin:-4px 0 8px\">Scope of work · no prices · ' + esc(md(sc.createdAt)) + '</div>' +   /* patch LOGO */\n", 'claim scope header')
src = cut(src, "      '<div>', (window._gcPrintLogo?window._gcPrintLogo(56,1):''),\n        '<div class=\"co-name\">GrayCo</div>',",
          "      '<div class=\"inv-badge\">',\n        '<div class=\"inv-badge-box\"><div class=\"inv-num\">INVOICE</div></div>',",
          "      '<div style=\"align-self:stretch;width:100%\">'+" + HD % "{dark:true,email:'billing@grayco-cs.com'}" + "+'</div>',   /* patch LOGO */\n", 'fallback invoice header')
src = once(src, "      '<div class=\"brand\">GRAYCO CONSTRUCTION SERVICES</div>',\n      '<h2 style=\"color:#1a3a5f;border-bottom:2px solid #1a3a5f\">SOFTWARE TUTORIAL GUIDE</h2>',",
           "      (window._gcDocHeader?window._gcDocHeader({}):'<div class=\"brand\">GRAYCO CONSTRUCTION SERVICES</div>'),   /* patch LOGO */\n      '<h2 style=\"color:#1a3a5f;border-bottom:2px solid #1a3a5f\">SOFTWARE TUTORIAL GUIDE</h2>',", 'tutorial header')


# ---------------------------------------------------------------- 6. assets (made from the CRM's own colour logo when missing)
import base64 as _b64
_wide = os.path.join(ROOT, 'grayco-logo-wide.jpg')
if not os.path.exists(_wide):
    open(_wide, 'wb').write(_b64.b64decode(LOGO_DATA.split(',', 1)[1]))
_lw = os.path.join(ROOT, 'netlify/functions/_lib/logo-wide.js')
if not os.path.exists(_lw):
    _b = _b64.b64encode(open(_wide, 'rb').read()).decode()
    open(_lw, 'w').write("'use strict';\nconst B64 = '" + _b + "';\nmodule.exports = { w: 420, h: 254, b64: B64, W: 420, H: 254, jpegBase64: B64 };\n")

#EDITS#

open(ipath, 'w', encoding='utf-8').write(src)
open(ppath, 'w', encoding='utf-8').write(psrc)
print('patched', ipath, ppath)
