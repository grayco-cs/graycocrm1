r"""Idempotent patch DOCOPEN (hotfix, owner 11/03): a document opens as a page inside the CRM — ‹ Back, ⬇️ Download,
📤 Share — never a pop-up / a new tab.

  iPhone, Field → job "Brad" → 📄 Documents → "GrayCo_Proposal_Potts_Flooring.docx": a new Safari sheet stuck on
  about:blank. Field Documents opened an empty window in the tap (W.open('', '_blank')) and, after reading the file,
  sent it a blob: address (or a data: address for an older file) — iOS Safari loses / refuses that, so the window stays
  blank; Safari also asked "allow pop-up?". A job paper (Scope of Work) opened in a new tab with no way back.
  Now (tools/docopen_tail.js, window._gcViewer): a full-screen page in the same tab with a sticky ‹ Back, the name,
  ⬇️ Download, 📤 Share and 🖨 Print (papers); PDF as page pictures (pdf.js), pictures, Word .docx as text (mammoth),
  papers / HTML in a frame, else "Preview not available" + Download / Share. The phone's Back closes it (NAV patch).
  Wired: Field Documents (FIELDPORTAL2 openItem: files, older in-record files, job papers), the job papers' window
  (_gcDocLib openWin, both copies), every file reference the CRM opens (STORECUT openRef — desk links too; a download
  stays a download) and the CRM's generated documents (_gcOpenDocHTML).
  The customer portal already opens files from a signed https link (Word: "Download") — unchanged.

Every find-string must occur exactly the given number of times (else nothing is written).
Usage: python3 tools/patch_DOCOPEN.py [index.html]   (also updates tools/fieldportal2.js)
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_DOCOPEN__'

FP2 = [(
"""  if (it.k === 'paper' && W._gcDocLib && W._gcDocLib.open) { W._gcDocLib.open(it.id, s(p.id)); return; }
  if (it.ref && typeof W._gcFileUrl === 'function') {
    var w = W.open('', '_blank');
    Promise.resolve(W._gcFileUrl(it.ref)).then(function(u){ if (w && u) { try { w.opener = null; } catch (e) {} w.location.href = u; } else { if (w) w.close(); toast('That file could not be opened.'); } }, function(){ if (w) w.close(); toast('That file could not be opened.'); });
    return;
  }
  if (it.data && it.d) { var w2 = W.open(''); if (w2) { if (/image/.test(s(it.d.type))) w2.document.write('<img src="' + it.d.data + '" style="max-width:100%">'); else w2.location.href = it.d.data; } return; }""",
"""  if (it.k === 'paper' && W._gcDocLib && W._gcDocLib.open) { W._gcDocLib.open(it.id, s(p.id)); return; }
  /* patch DOCOPEN: a file opens as a page in the CRM (‹ Back, ⬇️ Download, 📤 Share) — no pop-up, no about:blank */
  var nm = s(it.d && (it.d.name || it.d.fileName)) || s(it.t).replace(/^\\W+/, ''), ty = s(it.d && (it.d.type || it.d.mime));
  if (it.ref && W._gcViewer) { W._gcViewer.open({ ref: it.ref, name: nm, type: ty }); return; }
  if (it.data && it.d && W._gcViewer) { W._gcViewer.open({ data: it.d.data, name: nm, type: ty }); return; }""")]

EDITS = FP2 + [
    # the job papers' window (both copies of the DocLib block)
    ("function openWin(html, print){\n  var w = W.open('', '_blank');\n  if (!w) { toast('Allow pop-ups for the CRM to see the document.', true); return null; }",
     "function openWin(html, print){\n"
     "  if (W._gcViewer) { var t0 = /<title>([^<]*)<\\/title>/i.exec(String(html || '')); W._gcViewer.open({ html: html, name: t0 ? t0[1] : 'Document' }); if (print) ST.call(W, function(){ var pb = D.querySelector('#gc-viewer [data-gv=\"print\"]'); if (pb) pb.click(); }, 800); return {}; }   /* patch DOCOPEN: a page in the CRM, never a pop-up */\n"
     "  var w = W.open('', '_blank');\n  if (!w) { toast('Allow pop-ups for the CRM to see the document.', true); return null; }", 2),
    # every file reference the CRM opens (desk links too)
    ("function openRef(ref, o){\n  o = o || {};\n  var p = parseRef(ref); if (!p) return null;\n  if (o.download || !VIEW[p.ext]) { downloadRef(ref, o.name); return null; }",
     "function openRef(ref, o){\n  o = o || {};\n  var p = parseRef(ref); if (!p) return null;\n"
     "  if (!o.download && !o.noViewer && window._gcViewer) { window._gcViewer.open({ ref: ref, name: o.name }); return null; }   /* patch DOCOPEN: a page in the CRM (‹ Back, Download, Share), never a pop-up */\n"
     "  if (o.download || !VIEW[p.ext]) { downloadRef(ref, o.name); return null; }", 1),
    # the CRM's generated documents
    ("window._gcOpenDocHTML = function(fullHtml){\n  if (Array.isArray(fullHtml)) fullHtml = fullHtml.join('');\n  var w = null;",
     "window._gcOpenDocHTML = function(fullHtml){\n  if (Array.isArray(fullHtml)) fullHtml = fullHtml.join('');\n"
     "  if (window._gcViewer) { var t1 = /<title>([^<]*)<\\/title>/i.exec(fullHtml || ''); window._gcViewer.open({ html: String(fullHtml || ''), name: t1 ? t1[1] : 'Document' }); return true; }   /* patch DOCOPEN: a page in the CRM, never a pop-up */\n"
     "  var w = null;", 1),
]

src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
ANCH = '<script id="gc-patch-roleapps">'
assert src.count(ANCH) == 1, 'roleapps anchor'
for e in EDITS:
    old, new = e[0], e[1]; n = e[2] if len(e) > 2 else 1
    c = src.count(old)
    assert c == n, ('anchor count', old[:60], c, n)
for e in EDITS:
    src = src.replace(e[0], e[1])
tail = open(os.path.join(HERE, 'docopen_tail.js'), encoding='utf-8').read()
src = src.replace(ANCH, tail.rstrip('\n') + '\n' + ANCH)
open(path, 'w', encoding='utf-8').write(src)
print('patched DOCOPEN')

tp = os.path.join(HERE, 'fieldportal2.js')
if os.path.exists(tp):
    t = open(tp, encoding='utf-8').read()
    if 'patch DOCOPEN' in t: print('tools/fieldportal2.js: already patched')
    elif all(t.count(o) == 1 for o, n in FP2):
        for o, n in FP2: t = t.replace(o, n)
        open(tp, 'w', encoding='utf-8').write(t); print('tools/fieldportal2.js: patched')
    else: print('tools/fieldportal2.js: block not found (left as is)')
