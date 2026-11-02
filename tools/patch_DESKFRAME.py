#!/usr/bin/env python3
"""Idempotent patch DESKFRAME: the CRM never takes on a proposal's page CSS while a PDF is being made (owner 11/2 "why did it do this").

What the owner saw (Windows Edge, desktop): the top search bar full width, but the whole app (sidebar + page) squeezed into a
~708 px column in the middle, the search bar's text in Times New Roman, page headings underlined.

Cause: the GrayCo proposal (window._gcBuildGrayCoProposal) is a whole HTML page whose <style> starts with
    body{font-family:"Times New Roman",Georgia,serif;...;margin:0 auto;padding:40px 54px;max-width:8.5in}
    h2{...;text-decoration:underline} .center{...} .total{...} .small{...} ...
Three PDF makers put that page AS IS into an off-screen <div> in the CRM page for html2pdf
(holder.innerHTML = html): the proposal->PDF button (_gcProposalToPdf), ESTIN's automatic proposal (pdfBlob) and
ESTPDF's send (viaHtml2pdf). A <style> inside a <div> is still a page-wide style sheet, so for as long as the PDF is
being drawn the CRM's own <body> is 8.5in (816 px) wide, centred, with 54 px side padding (816 - 108 = 708 px of app)
and Times as the inherited font. ESTIN runs by itself in the background (5 s after an estimate is saved and every
5 minutes, up to 6 proposals in a row, an admin runs it for every estimate), which is why it showed up on Approvals
right after "Estimate saved". The holder is removed when the PDF is done, so it goes back by itself.

Fix: one helper, window._gcPdfHolderHtml(html, root): the page's <body> content plus its CSS scoped to the holder
(html/body/:root -> the holder, every other selector -> "holder sel"), the same scoping ESTPDF's 5-page design
(viaFrame/scopeCss) already uses. The three makers use it; BIDSEND's holder (which only renamed "body") uses the
same scoping so h2/.center/... no longer leak either. The PDF now gets the proposal's own 40/54 px margins.
Usage: python3 tools/patch_DESKFRAME.py [repo dir]
"""
import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else '.'
if root.endswith('index.html'): root = os.path.dirname(root) or '.'
P = os.path.join(root, 'index.html')
MARK = '/* patch DESKFRAME'

HELPER_ANCHOR = """<script>
/* ===== Save the created proposal as a PDF that travels with the job (project Documents) ===== */"""
HELPER = """<script>
""" + MARK + """: a whole HTML page (its own <style>) put into an off-screen holder for html2pdf must not restyle the CRM.
   A <style> inside a <div> is page-wide: the proposal's body{max-width:8.5in;margin:0 auto;padding:40px 54px;Times}
   squeezed the whole app into a 708 px column while a PDF was drawn. Its CSS is scoped to the holder instead. */
(function(){
  function scope(css, root){
    var out = '', i = 0;
    css = String(css || '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');
    while (i < css.length) {
      var b = css.indexOf('{', i); if (b < 0) break;
      var head = css.slice(i, b).trim(), depth = 1, j = b + 1;
      while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
      var body = css.slice(b + 1, j - 1);
      if (/^@(media|supports)/i.test(head)) out += head + '{' + scope(body, root) + '}';
      else if (/^@/.test(head)) { if (/^@(font-face|keyframes|-webkit-keyframes)/i.test(head)) out += head + '{' + body + '}'; }
      else out += head.split(',').map(function(sel){ sel = sel.trim(); if (!sel) return ''; if (/^(html|body|:root)$/i.test(sel)) return root; return root + ' ' + sel.replace(/^(html|body)\\s+/i, ''); }).filter(Boolean).join(',') + '{' + body + '}';
      i = j;
    }
    return out;
  }
  window._gcScopeDocCss = scope;
  window._gcPdfHolderHtml = function(html, root){
    html = String(html || '');
    var css = '', m, re = /<style[^>]*>([\\s\\S]*?)<\\/style>/gi; while ((m = re.exec(html))) css += m[1] + '\\n';
    var bm = /<body[^>]*>([\\s\\S]*)<\\/body>/i.exec(html);
    var body = (bm ? bm[1] : html).replace(/<script[\\s\\S]*?<\\/script>/gi, '').replace(/<style[\\s\\S]*?<\\/style>/gi, '');
    return (css ? '<style>' + scope(css, root) + '</style>' : '') + body;
  };
})();
</script>
""" + HELPER_ANCHOR

H_ESTIN = """    var holder = D.createElement('div'); holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:816px;background:#fff'; holder.innerHTML = html; D.body.appendChild(holder);"""
H_ESTIN_NEW = """    var holder = D.createElement('div'); holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:816px;background:#fff'; holder.className = 'gc-pdfh'; holder.innerHTML = W._gcPdfHolderHtml(html, '.gc-pdfh'); D.body.appendChild(holder);   """ + MARK + """ */"""
HEAD = """
  var go = W.html2pdf ? Promise.resolve(true) : loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
  return go.then(function(ok){
    if (!ok || !W.html2pdf) return null;
"""

PAIRS = [
  (HELPER_ANCHOR, HELPER),
  # _gcProposalToPdf (the proposal -> PDF button / Generate proposal)
  ("""        holder.style.cssText='position:fixed;left:-99999px;top:0;width:816px;background:#fff';
        holder.innerHTML=html;""",
   """        holder.style.cssText='position:fixed;left:-99999px;top:0;width:816px;background:#fff';
        holder.className='gc-pdfh'; holder.innerHTML=window._gcPdfHolderHtml(html,'.gc-pdfh');   """ + MARK + """ */"""),
  # ESTIN: the automatic proposal PDF (runs in the background)
  ("function pdfBlob(html){" + HEAD + H_ESTIN, "function pdfBlob(html){" + HEAD + H_ESTIN_NEW),
  # ESTPDF: the send
  ("function viaHtml2pdf(html){" + HEAD + H_ESTIN, "function viaHtml2pdf(html){" + HEAD + H_ESTIN_NEW),
  # BIDSEND: its holder renamed only "body"; h2 / .center / .total ... were page-wide too
  ("""se.textContent = st[1].replace(/\\bbody\\b/g, '.gcbs-pdf');""",
   """se.textContent = W._gcScopeDocCss(st[1], '.gcbs-pdf');   """ + MARK + """ */"""),
]

src = open(P, encoding='utf-8').read()
if MARK in src:
    print('DESKFRAME: already patched'); sys.exit(0)
for a, b in PAIRS:
    assert src.count(a) == 1, ('DESKFRAME find-string count != 1', src.count(a), a[:90])
    src = src.replace(a, b)
open(P, 'w', encoding='utf-8').write(src)
print('DESKFRAME: patched index.html (%d edits)' % len(PAIRS))
