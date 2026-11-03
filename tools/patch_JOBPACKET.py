#!/usr/bin/env python3
"""Idempotent patch JOBPACKET (owner 11/03): "have option for pm to print off all customer info for job that is needed for
print offs if they like to have manual stuff, then they can add that manual stuff in by photo if they want, but we want
to do everything on portal but have option".

  * tools/jobpacket.js goes in as <script id="gc-patch-jobpacket"> at the end of the page (replaced when it changes):
    "🖨 Print job packet" — the last tile of the Field job page, and a button in the desk job page's
    🏠 Home · 🔐 Codes · 📋 Inspections bar (patch X10). See the file's header.
  * FIELDPORTAL's 📷 Add Photo/File (window._gcFP.addPhotoFile, FIELDFILE's upload) takes an optional second argument
    { cat, note }: with a cat every picked file (photos too) goes through FIELDFILE's own docsUpload to the job's
    Documents, filed under that cat ("Packet scan"), named "Paper from packet — <file>", portalShare: false (never on the
    customer portal). Without it nothing changes.

Every find-string must occur exactly once (else nothing is written). A re-run prints "already patched".
Usage: python3 tools/patch_JOBPACKET.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(here), 'index.html')
MARK = '__GC_PATCH_JOBPACKET__'
TAG = '<script id="gc-patch-jobpacket">'
t = open(p, encoding='utf-8').read()
orig = t
assert '__GC_PATCH_FIELDPORTAL__' in t and '__GC_PATCH_FIELDFILE__' in t, 'JOBPACKET needs patches FIELDPORTAL + FIELDFILE'

EDITS = [
    # FIELDPORTAL / FIELDFILE: the Add Photo/File flow files a "Packet scan" when asked
    ("function addPhotoFile(p){",
     "function addPhotoFile(p, po){   /* patch JOBPACKET: po = { cat, note } files everything to the job's Documents under cat */"),
    ("var imgs = all.filter(isImg), rest = all.filter(function(f){ return !isImg(f); });",
     "var imgs = all.filter(isImg), rest = all.filter(function(f){ return !isImg(f); });\n    if (po && po.cat) { imgs = []; rest = all; }   /* patch JOBPACKET: a paper scan is a document of the job */"),
    ("      if (rest.length) docsUpload(p, rest);\n    }, function(e){ toast('The photo was not saved: ' + s(e && e.message || e)); if (rest.length) docsUpload(p, rest); });",
     "      if (rest.length) docsUpload(p, rest, po);\n    }, function(e){ toast('The photo was not saved: ' + s(e && e.message || e)); if (rest.length) docsUpload(p, rest, po); });"),
    ("function docsUpload(p, files){",
     "function docsUpload(p, files, po){"),
    ("return addJobDoc({ id: 'fdoc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), pid: pid, projectId: pid, name: s(f.name) || 'File', fileName: s(f.name),\n          cat: 'document', type: s(m.type || f.type)",
     "return addJobDoc({ id: 'fdoc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), pid: pid, projectId: pid, name: (po && po.note ? s(po.note) + ' — ' : '') + (s(f.name) || 'File'), fileName: s(f.name),\n          cat: (po && po.cat) || 'document', tags: po && po.cat ? [s(po.cat), s(po.note)].filter(Boolean) : undefined, portalShare: po && po.cat ? false : undefined, type: s(m.type || f.type)"),
    ("addPhotoFile: function(pid){ return addPhotoFile(proj(pid)); }",
     "addPhotoFile: function(pid, po){ return addPhotoFile(proj(pid), po); }"),
    # X10's job bar (desk + Field): 🖨 Print job packet beside 🏠 Home profile · 🔐 Access codes · 📋 Inspections
    ("""<button type="button" data-x10="insp">📋 Inspections</button></span>';""",
     """<button type="button" data-x10="insp">📋 Inspections</button><button type="button" data-gcjp-open="1" title="A printable packet of this job (patch JOBPACKET)">🖨 Print job packet</button></span>';"""),
]

if TAG in t:
    print('JOBPACKET: already patched')
else:
    for old, new in EDITS:
        n = t.count(old)
        assert n == 1, ('JOBPACKET: anchor count != 1', old[:90], n)
    for old, new in EDITS:
        t = t.replace(old, new)

js = open(os.path.join(here, 'jobpacket.js'), encoding='utf-8').read().strip() + '\n'
assert MARK in js and '</script' not in js.lower()
if TAG in t:
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != js:
        t = t[:i] + js + t[j:]; print('JOBPACKET: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'JOBPACKET: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'
    print('JOBPACKET: patched')
if t != orig:
    open(p, 'w', encoding='utf-8').write(t)
