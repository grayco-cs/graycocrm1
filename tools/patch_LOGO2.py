#!/usr/bin/env python3
"""Idempotent patch LOGO2 (owner 10/26, after reviewing patch LOGO):
  1. CENTER the headers (the CRM's 10/22 rule "always center the headers"; LOGO had made them left-aligned):
     the logo (0.7 in tall) centered at the top, the company name, the address . phone . web line and the license line centered under it.
     window._gcDocHeader / _gcPdfLogo / the jsPDF no-header fallback, the portal document header, the e-mail shell (brand.js) and its CRM preview,
     the sub's lien-waiver page, and the server PDFs (invoice-pdf.js, selections.js = portal-sign signed copy + selections, gcp.js warranty registry).
  2. NO DOUBLE HEADERS: every company block that sat under the one header is gone, on every document type, so each document has exactly ONE
     company header: the invoice's "From" block (screen / print view), the library invoice's remit-to street + company footer, the fallback invoice,
     the estimate's company footer, the Work Authorization / Certificate of Completion company footers, the contact line's address and the license
     line in the footers (gcContact, FAQ), the thank-you letter's sign-off block, the pay-stub e-mail's company block, the signed-copy PDF's closing
     company line, the warranty registry's company line and license line, the invoice PDF's page-1 company footer.
  3. ONE company name: the header says "GrayCo Construction Services" (the CRM's company-name setting, GC_BRAND.name / brand.js BRAND.name); legal
     / payee wording says the legal name "GrayCo Construction Services, LLC" (GC_BRAND.legalName) - the two spellings "Services LLC" are gone.
Every find-string must occur exactly once.  Usage: python3 tools/patch_LOGO2.py [index.html] [portal.html]
"""
import sys, os, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
ipath = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
ppath = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'portal.html')
src = open(ipath, encoding='utf-8').read()
psrc = open(ppath, encoding='utf-8').read()
MARK = '__GC_PATCH_LOGO2__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_LOGO__' in src, 'patch LOGO must be applied first'


def once(text, old, new, label):
    n = text.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    return text.replace(old, new)


def cut(text, start, end, new, label):
    """replace text[start .. end) (end kept) once; start must occur exactly once, end must follow it"""
    assert text.count(start) == 1, ('start count != 1', label, text.count(start))
    a = text.index(start)
    b = text.index(end, a + len(start))
    return text[:a] + new + text[b:]


def fedit(rel, pairs, label):
    path = os.path.join(ROOT, rel)
    txt = open(path, encoding='utf-8').read()
    if 'patch LOGO2' in txt:
        return
    for old, new in pairs:
        txt = once(txt, old, new, label + ': ' + old[:48])
    open(path, 'w', encoding='utf-8').write(txt)


# ---------------------------------------------------------------- 1. the shared helpers (index.html, script gc-patch-logo)
src = once(src, "if (window.__GC_PATCH_LOGO__) return; window.__GC_PATCH_LOGO__ = true;",
           "if (window.__GC_PATCH_LOGO__) return; window.__GC_PATCH_LOGO__ = true; window.__GC_PATCH_LOGO2__ = true;   /* patch LOGO2: centered headers, one header per document */", 'logo2 marker')

# 1a. the HTML header: logo centered (0.7 in), the name / address . phone . web / license lines centered under it
NEW_HDR = r"""W._gcDocHeader = function(o){
  o = o || {};
  var a = o.address === false ? '' : coAddr(), dual = !!o.dual, dk = !!o.dark || dual;
  var line2 = [a, PHONE, s(o.email), WEB].filter(Boolean).map(esc).join(' · ');
  var lw = Math.round(67 * (dk ? 340 / 192 : LOGO_RATIO)), lc = Math.round(67 * LOGO_RATIO);
  var img = function(src, cls, w){ return '<img data-gc-logo-img="1" class="' + cls + '" src="' + esc(src) + '" alt="' + NAME + '" width="' + w + '" height="67" style="height:0.7in;width:auto;margin:0 auto 4px;border:0' + (dual ? '' : ';display:block') + '">'; };
  /* patch LOGO2 (owner 10/26, the CRM's 10/22 rule "always center the headers"): the logo centered at the top, 0.7 in tall, the company name,
     the address . phone . web line and the license line centered under it.  Plain divs (no table) so Word, e-mail and every browser center it the same;
     dual: a dark screen page whose print version is white (white logo on screen, colour logo on paper) */
  return (dual ? '<style>.gc-dual img{display:block}.gc-dual .gc-p{display:none}@media print{.gc-dual .gc-d{display:none!important}.gc-dual .gc-p{display:block!important}.gc-dual .gc-t1{color:#0f2440!important;-webkit-text-fill-color:#0f2440!important}.gc-dual .gc-t2{color:#333!important}.gc-dual .gc-t3{color:#555!important}}</style>' : '')
    + '<div data-gc-logo="1" class="gc-doc-head' + (dual ? ' gc-dual' : '') + '" style="font-family:Arial,Helvetica,sans-serif;text-align:center;' + (dk ? 'margin:0;padding:0;' : 'border-bottom:2px solid #241968;padding:0 0 8px;margin:0 0 12px;') + 'page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact">'
    + (dual ? img(W.GC_LOGO_WHITE, 'gc-d', lw) + img(logoSrc(), 'gc-p', lc) : img(dk ? W.GC_LOGO_WHITE : logoSrc(), '', lw))
    + '<div class="gc-t1" style="font-size:15pt;font-weight:800;line-height:1.3;text-align:center;color:' + (dk ? '#fff' : '#0f2440') + ';letter-spacing:.3px">' + NAME + '</div>'
    + '<div class="gc-t2" style="font-size:9.5pt;font-weight:400;line-height:1.4;text-align:center;color:' + (dk ? '#cfd8e6' : '#333') + '">' + line2 + '</div>'
    + (o.noLicense ? '' : '<div class="gc-t3" style="font-size:8.5pt;font-weight:400;line-height:1.4;text-align:center;color:' + (dk ? '#9fb0c8' : '#555') + '">' + LIC + '</div>') + '</div>';
};
"""
src = cut(src, "W._gcDocHeader = function(o){\n  o = o || {};", "/* the older helpers all become the one header */", NEW_HDR, 'docheader')

# 1b. the jsPDF header: logo centered, 50 pt = 0.7 in, the name / address . phone . web / license centered under it; returns the y below it
NEW_PDF = r"""W._gcPdfLogo = function(doc, opts){
  opts = opts || {};
  /* patch LOGO2: centered (the 10/22 rule): the logo at the top centre (50 pt = 0.7 in), the name, the address . phone . web line and the license line under it */
  var PW = doc.internal.pageSize.getWidth(), m = opts.m || 48, y = opts.y || 30, lh = 50, cx = PW / 2, maxW = PW - 2 * m;
  var lw = drawLogo(doc, cx - (lh * LOGO_RATIO) / 2, y, lh); if (lw) STATS.pdfLogos++;
  try { doc.__gcLogoPages = doc.__gcLogoPages || {}; doc.__gcLogoPages[doc.internal.getCurrentPageInfo().pageNumber] = true; } catch (e) {}
  function line(txt, size, bold, color, ty){ doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]);
    try { while (size > 6 && doc.getTextWidth(txt) > maxW) { size -= 0.25; doc.setFontSize(size); } } catch (e) {} doc.text(txt, cx, ty, { align: 'center' }); }
  var ty = y + (lw ? lh + 14 : 14);
  line(NAME, 15, true, [15, 36, 64], ty);
  var l2 = [s(W.GC_ADDR) || coAddr(), PHONE, s(opts.email), WEB].filter(Boolean).join('  •  ');
  line(l2, 8.5, false, [60, 70, 85], ty + 12);
  if (!opts.noLicense) line(LIC, 8, false, [90, 100, 115], ty + 23);
  var ry = ty + (opts.noLicense ? 12 : 23) + 7;
  doc.setDrawColor(36, 25, 104); doc.setLineWidth(1.5); doc.line(m, ry, PW - m, ry);
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  return ry + 22;
};
"""
src = cut(src, "W._gcPdfLogo = function(doc, opts){\n  opts = opts || {};", "W._gcPdfHeaderCentered = W._gcPdfLogo;", NEW_PDF, 'pdflogo')

# 1c. the jsPDF fallback (a generator that drew no header): a small logo centered at the top with one centered line under it
src = once(src, "      var lw = drawLogo(doc, 36, 8, 26);\n      if (lw) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 36, 64); doc.text(NAME, 36 + lw + 8, 21); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90, 100, 115); doc.text(PHONE, 36 + lw + 8, 31);",
           "      var lw = drawLogo(doc, (PW - 24 * LOGO_RATIO) / 2, 5, 24);   /* patch LOGO2: centered, the line under it */\n      if (lw) { doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(15, 36, 64); doc.text(NAME + '  \\u00B7  ' + PHONE, PW / 2, 37, { align: 'center' });", 'pdf fallback')

# ---------------------------------------------------------------- 2. the duplicate company blocks (index.html)
# 2a. the invoice screen / print view: the "From" block under the header
src = once(src, "            '<div class=\"fromblock\"><div class=\"flabel\">From</div><div class=\"fname\">GrayCo Construction Services LLC</div>',\n"
                "            '<div class=\"fline\">' + window._gcCompanyAddress() + '<br>(901) 585-0944 &middot; office@grayco-cs.com<br>TN #85034 BCB &middot; AR #0486990627 &middot; MS #27769</div></div>',\n", "", 'invoice view From block')
src = once(src, "'<div class=\"foot anim d6\">GrayCo Construction Services LLC &middot; grayco-cs.com<br>Thank you for your business.</div>',",
           "'<div class=\"foot anim d6\">Thank you for your business.</div>',   /* patch LOGO2: the company line is in the header */", 'invoice view foot')

# 2b. the library invoice: remit-to street + the company footer
src = once(src, "              '<b>GrayCo Construction Services LLC</b><br>',\n              '' + window._gcCompanyStreet() + '<br>Bartlett, TN 38135<br>',\n",
           "              '<b>GrayCo Construction Services, LLC</b><br>',\n              'Mail to the address at the top of this invoice<br>',   /* patch LOGO2: the address is in the header */\n", 'invoice remit')
src = once(src, "          '<div style=\"font-size:10pt;font-weight:700;color:#d4a017;letter-spacing:1px;margin-bottom:4px\">GrayCo Construction Services LLC</div>',\n"
                "          '<div>(901) 585-0944 &nbsp;|&nbsp; <a href=\"mailto:office@grayco-cs.com\">office@grayco-cs.com</a> &nbsp;|&nbsp; <a href=\"https://grayco-cs.com\">grayco-cs.com</a> &nbsp;|&nbsp; TN License #85034 BCB · AR License #0486990627 · MS License #27769</div>',\n",
           "          '<div style=\"font-size:10pt;font-weight:700;color:#d4a017;letter-spacing:1px\">Thank you for your business</div>',   /* patch LOGO2: the company block is in the header */\n", 'invoice footer')

# 2c. the fallback invoice popup
src = once(src, "Payable to:<br><b>GrayCo Construction Services LLC</b><br>' + window._gcCompanyAddress() + '</div>',",
           "Payable to:<br><b>GrayCo Construction Services, LLC</b><br>Mail to the address at the top of this invoice</div>',   /* patch LOGO2 */", 'fallback invoice remit')
src = once(src, "      'GrayCo Construction Services LLC · (901) 585-0944 · office@grayco-cs.com · ',\n      '<a href=\"https://grayco-cs.com\">grayco-cs.com</a> · TN License #85034 BCB · AR License #0486990627 · MS License #27769<br>',\n",
           "      'Thank you for your business<br>',   /* patch LOGO2: the company block is in the header */\n", 'fallback invoice footer')

# 2d. the estimate document's company footer
src = once(src, "      'GrayCo Construction Services LLC | (901) 585-0944 | office@grayco-cs.com | <a href=\"https://grayco-cs.com\">grayco-cs.com</a> | TN License #85034 BCB · AR License #0486990627 · MS License #27769<br>',\n",
           "      'Thank you for the opportunity to earn your business<br>',   /* patch LOGO2: the company block is in the header */\n", 'estimate footer')

# 2e. Work Authorization and Certificate of Completion: the company footer line
src = once(src, "          'GrayCo Construction Services LLC &nbsp;|&nbsp; ' + window._gcCompanyAddress() + ' &nbsp;|&nbsp; (901) 585-0944 &nbsp;|&nbsp; office@grayco-cs.com &nbsp;|&nbsp; TN License #85034 BCB · AR License #0486990627 · MS License #27769 &nbsp;|&nbsp; IICRC WRT Certified',",
           "          'IICRC WRT Certified',   /* patch LOGO2: the company block is in the header */", 'work auth footer')
src = once(src, "<div class=\"watermark\" style=\"text-align:center;margin-top:8px\">GrayCo Construction Services LLC &nbsp;|&nbsp; TN License #85034 BCB · AR License #0486990627 · MS License #27769 &nbsp;|&nbsp; IICRC WRT Certified</div>',",
           "<div class=\"watermark\" style=\"text-align:center;margin-top:8px\">IICRC WRT Certified</div>',   /* patch LOGO2 */", 'cert footer')

# 2f. the contact line shared by the library papers: no address (it is in the header), no license in the footers
src = once(src, "  return GC.email+' &nbsp;│&nbsp; '+GC.phone+' &nbsp;│&nbsp; '+GC.addr;",
           "  return GC.email+' &nbsp;│&nbsp; '+GC.phone;   /* patch LOGO2: the address and the licenses are in the one header */", 'gcContact')
src = once(src, "'<p style=\"font-size:9px;text-align:center;margin-top:8px;\">'+gcContact()+' &nbsp;|&nbsp; '+GC.lic+'</p>',",
           "'<p style=\"font-size:9px;text-align:center;margin-top:8px;\">'+gcContact()+'</p>',", 'contract footer lic')
src = once(src, "'<p style=\"font-size:9px;text-align:center;margin-top:8px;\">'+gcContact()+' &nbsp;│&nbsp; '+GC.lic+'</p>',",
           "'<p style=\"font-size:9px;text-align:center;margin-top:8px;\">'+gcContact()+'</p>',", 'change order footer lic')
src = once(src, "'+GC.phone+' &nbsp;|&nbsp; '+GC.email+' &nbsp;|&nbsp; '+GC.addr+'</p>',\n    ].join(''), 'Welcome & FAQ Packet');",
           "'+GC.phone+' &nbsp;|&nbsp; '+GC.email+'</p>',\n    ].join(''), 'Welcome & FAQ Packet');", 'faq questions line')

# 2g. the thank-you letter's sign-off block (name / phone / licenses under the logo)
src = once(src, "    '<div style=\"border-top:1px solid #e0e0e0;padding-top:14px;text-align:center;\">' +\n"
                "      '<div style=\"font-size:13px;color:#1e1b52;font-weight:600;\">GrayCo Construction Services LLC</div>' +\n"
                "      '<div style=\"font-size:12px;color:#8598a8;margin-top:3px;\">(901) 585-0944 &middot; office@grayco-cs.com</div><div style=\"font-size:11px;color:#8598a8;margin-top:2px;\">TN License #85034 BCB · AR License #0486990627 · MS License #27769</div>' +\n"
                "    '</div>' +\n", "", 'thank-you sign-off')

# 2h. the portal / e-mail previews: the CRM's copy of the e-mail shell header, centered
src = cut(src, "'<div style=\"padding:14px 22px;border-bottom:4px solid ' + B.gold + ';display:flex;align-items:center;gap:14px\"><img src=\"https://crm.grayco-cs.com/grayco-logo-wide.jpg\"",
          "' +   /* patch LOGO */",
          "'<div style=\"padding:14px 22px 10px;border-bottom:4px solid ' + B.gold + ';text-align:center\"><img src=\"https://crm.grayco-cs.com/grayco-logo-wide.jpg\" alt=\"' + B.name + '\" width=\"111\" height=\"67\" style=\"width:111px;height:67px;display:block;margin:0 auto 6px\"><div style=\"line-height:1.4\"><div style=\"font-size:17px;font-weight:bold;color:' + B.navy + '\">' + B.name + '</div><div style=\"font-size:12px;color:#55626F\">' + B.phone + ' · grayco-cs.com</div><div style=\"font-size:11px;color:#6B7785\">' + B.licenses + '</div></div></div>",
          'email preview shell')

# 2i. one company name: the legal name (with the comma) wherever the legal / payee name is spelled "Services LLC"
n_llc = src.count('GrayCo Construction Services LLC')
src = src.replace('GrayCo Construction Services LLC', 'GrayCo Construction Services, LLC')
print('legal name normalised in index.html:', n_llc)


# 2j. the rest of the company blocks that repeated the header (library papers, the onboarding PDF) and the proposal page, centered on screen
src = once(src, "'<p style=\"font-size:10px;color:#666;margin-top:10px;\">office@grayco-cs.com &nbsp;│&nbsp; (901) 585-0944 &nbsp;│&nbsp; ' + window._gcCompanyAddress() + '</p>',",
           "'<p style=\"font-size:10px;color:#666;margin-top:10px;\">office@grayco-cs.com &nbsp;│&nbsp; (901) 585-0944</p>',   /* patch LOGO2 */", 'ar prenotice contact line')
src = once(src, "<br>GrayCo Construction Services<br>'+GC.lic+'</p>'", "<br>GrayCo Construction Services</p>'", 'sub scope e-mail sign-off license')
src = once(src, "    doc.text('TN License #85034 BCB · AR License #0486990627 · MS License #27769', m, doc.internal.pageSize.getHeight()-30);\n", "", 'onboarding pdf footer license')
src = once(src, "margin:0;padding:40px 54px;max-width:8.5in}", "margin:0 auto;padding:40px 54px;max-width:8.5in}", 'proposal page centered on screen')

src = once(src, "var _a='GrayCo Construction Services, LLC  \\u2022  '+(window.GC_ADDR||''), _b=(window.GC_LICENSE||''), _one=_a+'  \\u2022  '+_b, _fit=false;",
           "var _a='GrayCo Construction Services, LLC  \\u2022  grayco-cs.com', _b='', _one=_a, _fit=false;   /* patch LOGO2: the address and licenses are in the header */", 'pdf footer')

# ---------------------------------------------------------------- 3. portal.html: the document header, centered
psrc = once(psrc, "d.style.cssText = 'display:flex;align-items:center;gap:12px;padding:0 0 10px;margin:0 0 12px;border-bottom:2px solid #241968;text-align:left;color:#0F1D2F';",
            "d.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;padding:0 0 8px;margin:0 0 12px;border-bottom:2px solid #241968;text-align:center;color:#0F1D2F';   /* patch LOGO2: centered */", 'portal head box')
psrc = once(psrc, "var tx = document.createElement('div'); tx.style.cssText = 'line-height:1.4;min-width:0';",
            "var tx = document.createElement('div'); tx.style.cssText = 'line-height:1.4;min-width:0;text-align:center';", 'portal head text')

# ---------------------------------------------------------------- 4. server (netlify/functions)
# 4a. the e-mail shell (brand.js): the colour logo centered, the name / phone / licenses centered under it
fedit('netlify/functions/_lib/brand.js', [
    ("  const head = hasLogo ? '' : '<tr><td style=\"background:#ffffff;padding:14px 24px;border-bottom:4px solid ' + BRAND.gold + ';text-align:left\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"border:0\"><tr>' +\n"
     "    '<td style=\"padding:0 14px 0 0;vertical-align:middle\"><img src=\"' + esc(o.logoUrl || logoColorUrl()) + '\" alt=\"' + BRAND.name + '\" width=\"111\" height=\"67\" style=\"display:block;width:111px;height:67px;border:0\"></td>' +\n"
     "    '<td style=\"vertical-align:middle;font-family:Arial,Helvetica,sans-serif;line-height:1.4\"><div style=\"font-size:17px;font-weight:bold;color:' + BRAND.navy + '\">' + BRAND.name + '</div>' +\n"
     "    '<div style=\"font-size:12px;color:#55626F\">' + BRAND.phone + ' · grayco-cs.com</div><div style=\"font-size:11px;color:#6B7785\">' + BRAND.licenses + '</div></td></tr></table></td></tr>';",
     "  /* patch LOGO2 (the 10/22 rule \"always center the headers\"): the colour logo centered, 0.7 in tall, the name / phone / licenses centered under it */\n"
     "  const head = hasLogo ? '' : '<tr><td align=\"center\" style=\"background:#ffffff;padding:14px 24px 10px;border-bottom:4px solid ' + BRAND.gold + ';text-align:center\">' +\n"
     "    '<img src=\"' + esc(o.logoUrl || logoColorUrl()) + '\" alt=\"' + BRAND.name + '\" width=\"111\" height=\"67\" style=\"display:block;margin:0 auto 6px;width:111px;height:67px;border:0\">' +\n"
     "    '<div style=\"font-family:Arial,Helvetica,sans-serif;line-height:1.4;text-align:center\"><div style=\"font-size:17px;font-weight:bold;color:' + BRAND.navy + '\">' + BRAND.name + '</div>' +\n"
     "    '<div style=\"font-size:12px;color:#55626F\">' + BRAND.phone + ' · grayco-cs.com</div><div style=\"font-size:11px;color:#6B7785\">' + BRAND.licenses + '</div></div></td></tr>';")], 'brand shell')

# 4b. the invoice PDF: a white page, the logo centered (50 pt = 0.7 in), name / address . phone . e-mail / licenses centered under it, a gold rule,
#     the title; no company footer on page 1 (it is in the header), pages 2+ carry name . phone . page n at the foot
fedit('netlify/functions/_lib/invoice-pdf.js', [
    ("  /* every page: the company line and the licenses at the foot */\n  function foot(){ text(L, 22, BR.legalName + '  \\xb7  ' + ADDRESS + '  \\xb7  ' + LICENSES, 7.5, false, MUTED); }\n",
     "  /* patch LOGO2: pages 2+ carry the company name, phone and page number at the foot (page 1 has the one header) */\n"
     "  function foot(){ if (pages.length) text(L, 22, COMPANY + '  \\xb7  ' + PHONE + '  \\xb7  page ' + (pages.length + 1), 7.5, false, MUTED); }\n"),
    ("  /* header band: the logo on a white tile, name, address / phone / e-mail, licenses */\n"
     "  rect(0, PH - 96, PW, 96, NAVY);\n  rect(0, PH - 100, PW, 4, GOLD);\n"
     "  rect(L - 4, PH - 82, 91, 58, '1 1 1');   /* patch LOGO: the logo is 50 pt = 0.7 in tall at the left */\n"
     "  ops.push('q 83 0 0 50 ' + L + ' ' + (PH - 78) + ' cm /Im1 Do Q');\n"
     "  const TX = L + 101;\n"
     "  text(TX, PH - 40, COMPANY, 16.5, true, '1 1 1');\n"
     "  text(TX, PH - 56, ADDRESS + '  \\xb7  ' + PHONE, 9, false, '0.80 0.85 0.92');\n"
     "  text(TX, PH - 68, EMAIL, 9, false, '0.80 0.85 0.92');\n"
     "  text(TX, PH - 81, LICENSES, 8, false, '0.97 0.80 0.30');\n"
     "  textR(R, PH - 48, doc.isFinal ? 'FINAL INVOICE' : 'INVOICE', doc.isFinal ? 18 : 22, true, '1 1 1');\n"
     "  textR(R, PH - 66, 'Invoice #' + (doc.number || ''), 10, true, '0.97 0.80 0.30');\n\n"
     "  /* bill to + facts */\n  let y = PH - 132;\n",
     "  /* patch LOGO2 (the 10/22 rule \"always center the headers\"): the ONE company header, centered - the logo 50 pt = 0.7 in tall, the name,\n"
     "     address . phone . e-mail and the licenses under it, a gold rule, then the title */\n"
     "  function centered(yy, t, size, bold, color){ text((PW - width(clean(t), size, bold)) / 2, yy, t, size, bold, color); }\n"
     "  ops.push('q 83 0 0 50 ' + ((PW - 83) / 2).toFixed(1) + ' ' + (PH - 80) + ' cm /Im1 Do Q');\n"
     "  centered(PH - 97, COMPANY, 15, true, NAVY);\n"
     "  centered(PH - 110, ADDRESS + '  \\xb7  ' + PHONE + '  \\xb7  ' + EMAIL, 8.5, false, MUTED);\n"
     "  centered(PH - 122, LICENSES, 8, false, MUTED);\n"
     "  line(L, PH - 130, R, PH - 130, GOLD, 1.5);\n"
     "  centered(PH - 152, (doc.isFinal ? 'FINAL INVOICE' : 'INVOICE'), 15, true, NAVY);\n\n"
     "  /* bill to + facts */\n  let y = PH - 182;\n"),
    ("module.exports = { build: build, usd: usd, clean: clean, COMPANY: COMPANY,", "module.exports = { build: build, width: width, usd: usd, clean: clean, COMPANY: COMPANY,")], 'invoice-pdf')

# 4c. the signed copy / selections PDF: the logo centered, name, address . phone . web, licenses centered under it
fedit('netlify/functions/selections.js', [
    ("      /* patch LOGO: the logo at the left (50 pt = 0.7 in), the name, address · phone and licenses beside it */\n"
     "      const lh = LOGO ? 50 : 0, lw = LOGO ? Math.round(lh * LOGO.w / LOGO.h) : 0; need(lh + 30); const top = y, tx = (M + (lw ? lw + 12 : 0)).toFixed(1);\n"
     "      if (LOGO) ops.push('q ' + lw + ' 0 0 ' + lh + ' ' + M + ' ' + (top - lh).toFixed(1) + ' cm /Im1 Do Q');\n"
     "      y = top - 16; text(b.text, 16, true, tx);\n"
     "      let addr = ''; try { addr = require('./_lib/brand.js').companyAddress(); } catch (e) {}\n"
     "      y -= 14; text([addr, OFFICE_PHONE, 'grayco-cs.com'].filter(Boolean).join(' \\u00B7 '), 8.5, false, tx, '0.33 0.38 0.44');\n"
     "      y -= 11; text('TN #85034 BCB \\u00B7 AR #0486990627 \\u00B7 MS #27769', 8, false, tx, '0.42 0.46 0.52');\n"
     "      y = Math.min(y, top - lh) - 8; ops.push('0.14 0.10 0.41 RG 1.5 w ' + M + ' ' + y.toFixed(1) + ' m ' + (W - M) + ' ' + y.toFixed(1) + ' l S'); y -= 14; return;\n",
     "      /* patch LOGO2 (the 10/22 rule \"always center the headers\"): the logo centered (50 pt = 0.7 in), the name, address . phone . web and the licenses centered under it */\n"
     "      const lh = LOGO ? 50 : 0, lw = LOGO ? Math.round(lh * LOGO.w / LOGO.h) : 0; need(lh + 60); const top = y;\n"
     "      if (LOGO) ops.push('q ' + lw + ' 0 0 ' + lh + ' ' + ((W - lw) / 2).toFixed(1) + ' ' + (top - lh).toFixed(1) + ' cm /Im1 Do Q');\n"
     "      y = top - lh - 14; textC(b.text, 15, true);\n"
     "      let addr = ''; try { addr = require('./_lib/brand.js').companyAddress(); } catch (e) {}\n"
     "      y -= 12; textC([addr, OFFICE_PHONE, 'grayco-cs.com'].filter(Boolean).join(' \\u00B7 '), 8.5, false, '0.33 0.38 0.44');\n"
     "      y -= 11; textC('TN #85034 BCB \\u00B7 AR #0486990627 \\u00B7 MS #27769', 8, false, '0.42 0.46 0.52');\n"
     "      y -= 8; ops.push('0.14 0.10 0.41 RG 1.5 w ' + M + ' ' + y.toFixed(1) + ' m ' + (W - M) + ' ' + y.toFixed(1) + ' l S'); y -= 14; return;\n")], 'selections')

# 4d. the closing company line of the signed copies (the address is in the header)
for rel in ('netlify/functions/portal-sign.js', 'netlify/functions/portal-plus.js'):
    fedit(rel, [("{ t: 'p', text: 'GrayCo Construction Services · ' + require('./_lib/brand.js').companyAddress() + ' · ' + OFFICE_PHONE + ' · portal.grayco-cs.com', size: 9, muted: true }",
                 "{ t: 'p', text: 'GrayCo customer portal · portal.grayco-cs.com', size: 9, muted: true } /* patch LOGO2: the company block is in the header */")], rel)

# 4e. the warranty registry PDF (gcp.js): the logo centered, name / address . phone . web / licenses centered under it; no second company line
fedit('netlify/functions/_lib/gcp.js', [
    ("const pages = []; let ops = [], y = 668;   /* patch LOGO: page 1 starts below the logo header */", "const pages = []; let ops = [], y = 640;   /* patch LOGO2: page 1 starts below the centered logo header */"),
    ("  const head1 = ['q 83 0 0 50 64 718 cm /Im1 Do Q',\n"
     "    'BT /F2 16 Tf 0.06 0.14 0.25 rg 159 750 Td ' + pdfText(BRd.name) + ' Tj ET',\n"
     "    'BT /F1 8.5 Tf 0.33 0.38 0.44 rg 159 737 Td ' + pdfText(BRd.address + '  ·  ' + BRd.phone + '  ·  grayco-cs.com') + ' Tj ET',\n"
     "    'BT /F1 8 Tf 0.42 0.46 0.52 rg 159 725 Td ' + pdfText(BRd.licenses) + ' Tj ET',\n"
     "    '0.14 0.10 0.41 RG 1.5 w 64 708 m 548 708 l S', '0 0 0 rg'];\n",
     "  /* patch LOGO2: centered (the 10/22 rule): the logo at the top centre, the name, address . phone . web and the licenses centered under it */\n"
     "  const WD = require('./invoice-pdf.js').width, ctr = function(t, size, bold, yy, col){ return 'BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + col + ' rg ' + ((612 - WD(t, size, bold)) / 2).toFixed(1) + ' ' + yy + ' Td ' + pdfText(t) + ' Tj ET'; };\n"
     "  const head1 = ['q 83 0 0 50 264.5 718 cm /Im1 Do Q',\n"
     "    ctr(BRd.name, 15, true, 702, '0.06 0.14 0.25'),\n"
     "    ctr(BRd.address + '  ·  ' + BRd.phone + '  ·  grayco-cs.com', 8.5, false, 690, '0.33 0.38 0.44'),\n"
     "    ctr(BRd.licenses, 8, false, 679, '0.42 0.46 0.52'),\n"
     "    '0.14 0.10 0.41 RG 1.5 w 64 670 m 548 670 l S', '0 0 0 rg'];\n"),
    ("{ t: ' ', size: 8, gap: 26 }, { t: 'WARRANTY REGISTRY', size: 18, bold: true, gap: 2 }, { t: BR.legalName + ' · ' + BR.address + ' · ' + BR.phone, size: 9, gap: 14 },",
     "{ t: 'WARRANTY REGISTRY', size: 18, bold: true, gap: 14 },"),
    ("size: 9, gap: 4 }, { t: BR.licenses, size: 8 }, { t: 'Issued '", "size: 9, gap: 4 }, { t: 'Issued '")], 'gcp registry')

# 4f. the sub's lien-waiver page: the logo centered on its navy bar
fedit('netlify/functions/lien.js', [
    ("display:flex;align-items:center;gap:14px\"><img src=\"/portal-logo.png\" alt=\"GrayCo Construction Services\" width=\"119\" height=\"67\" style=\"height:0.7in;width:auto;display:block\"><div style=\"line-height:1.4\">",
     "text-align:center\"><img src=\"/portal-logo.png\" alt=\"GrayCo Construction Services\" width=\"119\" height=\"67\" style=\"height:0.7in;width:auto;display:block;margin:0 auto 4px\"><div style=\"line-height:1.4\">")], 'lien page')

# 4g. the pay-stub e-mail: the company block under the e-mail header (name, address, phone)
fedit('netlify/functions/paystubs.js', [
    ("    + '<div style=\"text-align:center;border-bottom:3px solid #0f2440;padding-bottom:8px;margin-bottom:12px\"><b style=\"font-size:18px\">' + e(st.company.name || 'GrayCo Construction Services') + '</b><br>'\n"
     "    + '<span style=\"font-size:12px;color:#555\">' + e(st.company.address) + (st.company.phone ? ' · ' + e(st.company.phone) : '') + '</span></div>'\n", "")], 'paystub email')

# the other e-mail that carries its own logo header stays as it is; its company block under it is gone (2g).

# ---------------------------------------------------------------- 5. celebrate page footer: the same legal name
cp = os.path.join(ROOT, 'celebrate.html')
if os.path.exists(cp):
    ct = open(cp, encoding='utf-8').read()
    if 'GrayCo Construction Services LLC' in ct:
        open(cp, 'w', encoding='utf-8').write(ct.replace('GrayCo Construction Services LLC', 'GrayCo Construction Services, LLC'))

open(ipath, 'w', encoding='utf-8').write(src)
open(ppath, 'w', encoding='utf-8').write(psrc)
print('patched', ipath, ppath)
