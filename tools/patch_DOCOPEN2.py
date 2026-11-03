r"""Idempotent patch DOCOPEN2 (on top of DOCOPEN): ✏️ Edit on the document page — the CRM's own editors only.

  Owner 11/03: "the viewer page also needs ✏️ Edit, next to ‹ Back and ⬇️ Download."
    • an uploaded file: its details — name, category, 👁 Customer sees it, Replace file (a new version on the job; the old
      one kept in its history, hidden from the customer; a signed copy cannot be replaced);
    • a proposal / estimate PDF: the estimate (ESTUPLOAD's panel when it is in the page, else the estimate builder);
    • the Scope of Work paper: the job's Scope of Work (Job Info); another job paper: its template (admins; the CRM has
      no per-job editor for those papers — the paper is made again from the template, filled in).
  tools/docopen2_tail.js (window._gcViewer.editFor / fileProps) + Field Documents (FIELDPORTAL2): Edit passed to the
  viewer; a replaced (older) version is not listed.

Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_DOCOPEN2.py [index.html]   (also updates tools/fieldportal2.js)
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_DOCOPEN2__'
FP2 = [
 ("  if (it.k === 'paper' && W._gcDocLib && W._gcDocLib.open) { W._gcDocLib.open(it.id, s(p.id)); return; }",
  "  var ed = W._gcViewer && W._gcViewer.editFor ? W._gcViewer.editFor(it, p) : null;   /* patch DOCOPEN2: ✏️ Edit */\n"
  "  if (it.k === 'paper' && W._gcDocLib && W._gcDocLib.render && W._gcViewer) { W._gcDocLib.render(it.id, s(p.id)).then(function(r){ if (!r) { toast('Could not open that document.'); return; } W._gcViewer.open({ html: r.page, name: s(r.t && r.t.name) + ' — ' + s(p.name), edit: ed }); }); return; }\n"
  "  if (it.k === 'paper' && W._gcDocLib && W._gcDocLib.open) { W._gcDocLib.open(it.id, s(p.id)); return; }"),
 ("  if (it.ref && W._gcViewer) { W._gcViewer.open({ ref: it.ref, name: nm, type: ty }); return; }\n  if (it.data && it.d && W._gcViewer) { W._gcViewer.open({ data: it.d.data, name: nm, type: ty }); return; }",
  "  if (it.ref && W._gcViewer) { W._gcViewer.open({ ref: it.ref, name: nm, type: ty, edit: ed }); return; }\n  if (it.data && it.d && W._gcViewer) { W._gcViewer.open({ data: it.d.data, name: nm, type: ty, edit: ed }); return; }"),
 ("    var docs = uniq(arr(C().projectDocs).concat(arr(W._gcProjectDocs), a[0])).filter(on);",
  "    var docs = uniq(arr(C().projectDocs).concat(arr(W._gcProjectDocs), a[0])).filter(function(d){ return on(d) && !s(d.supersededBy); });   /* patch DOCOPEN2: a replaced version stays in its history */"),
]
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_DOCOPEN__' in src, 'run tools/patch_DOCOPEN.py first'
ANCH = '<script id="gc-patch-roleapps">'
assert src.count(ANCH) == 1
for o, n in FP2:
    assert src.count(o) == 1, ('anchor', o[:60], src.count(o))
for o, n in FP2:
    src = src.replace(o, n)
tail = open(os.path.join(HERE, 'docopen2_tail.js'), encoding='utf-8').read()
src = src.replace(ANCH, tail.rstrip('\n') + '\n' + ANCH)
open(path, 'w', encoding='utf-8').write(src)
print('patched DOCOPEN2')
tp = os.path.join(HERE, 'fieldportal2.js')
t = open(tp, encoding='utf-8').read()
if 'patch DOCOPEN2' in t: print('tools/fieldportal2.js: already patched')
elif all(t.count(o) == 1 for o, n in FP2):
    for o, n in FP2: t = t.replace(o, n)
    open(tp, 'w', encoding='utf-8').write(t); print('tools/fieldportal2.js: patched')
else: print('tools/fieldportal2.js: block not found (left as is)')
