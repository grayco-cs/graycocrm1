#!/usr/bin/env python3
"""Idempotent patch BULKDROP (owner 11/01: "yes add the drop many invoices button"): 📥 Drop invoices & receipts.

1. tools/bulkdrop_tail.js goes in as <script id="gc-patch-bulkdrop"> right BEFORE gc-patch-approrder (after patch MONEY /
   STMTPDF, whose Needs a job, receipts and card import it works with);
2. patch MONEY's 📥 Needs a job: every row with a file gets "📄 Open the file" (a dropped / e-mailed file is on the row);
3. a dropped file booked by patch MONEY / SUBINV says "dropped in" (source bulkdrop), not "e-mailed in";
4. a QuickBooks entry approved from the review queue keeps the document the drop attached to it.
The server side (netlify/functions: bid-inbox ?moneymail=1 op "drop", _lib/money-mail.js fromDrop, _lib/subinv.js analyze
with a ready read) is plain function code. Every find-string must occur exactly once. Usage: python3 tools/patch_BULKDROP.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'bulkdrop_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_BULKDROP__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '</script>' not in TAIL
EDITS = [
  ('<script id="gc-patch-approrder">', '<script id="gc-patch-bulkdrop">\n' + TAIL + '\n</script>\n<script id="gc-patch-approrder">'),
  # 2. Needs a job: the file on every row that has one
  ("    out.push({ k: 'subinv', id: x.id, at: x.at,",
   "    out.push({ k: 'subinv', rec: x, id: x.id, at: x.at,   /* patch BULKDROP: rec (the file) */"),
  ("""        '<div style="font-size:12.5px;color:#92400e;margin:3px 0">' + esc(it.why) + '</div>' +""",
   """        '<div style="font-size:12.5px;color:#92400e;margin:3px 0">' + esc(it.why) + '</div>' +
        (it.rec && arr(it.rec.files)[0] && arr(it.rec.files)[0].ref ? '<button type="button" data-m="file" style="margin:0 0 6px;padding:5px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;font-size:12.5px">📄 Open the file' + (it.rec.via === 'bulk drop' ? ' (dropped in)' : '') + '</button>' : '') +   /* patch BULKDROP */"""),
  ("    if (a === 'open') { place(it); return; }",
   "    if (a === 'file') { var f0 = arr(it.rec && it.rec.files)[0]; try { if (f0 && W._gcOpenRef) W._gcOpenRef(f0.ref, f0.name); } catch (e) {} return; }   /* patch BULKDROP */\n"
   "    if (a === 'open') { place(it); return; }"),
  # 3. "dropped in", not "e-mailed in"
  ("desc: (rec.kind === 'receipt' ? 'Receipt e-mailed in' :",
   "desc: (rec.kind === 'receipt' ? (rec.via === 'bulk drop' ? 'Receipt dropped in' : 'Receipt e-mailed in') :   /* patch BULKDROP */"),
  ("source: 'email:' + (s(rec.via) || (rec.kind === 'receipt' ? 'receipts@' : 'invoices@')), by: (s(rec.via) || 'e-mail') + ' (automatic)',",
   "source: rec.via === 'bulk drop' ? 'bulkdrop' : 'email:' + (s(rec.via) || (rec.kind === 'receipt' ? 'receipts@' : 'invoices@')), by: rec.via === 'bulk drop' ? s(rec.by || 'office') + ' (bulk drop)' : (s(rec.via) || 'e-mail') + ' (automatic)',"),
  ("  if (si.byTerms && si.payDate) { inv.payDateOverride = si.payDate; inv.payDateWhy = s(si.payRule); }",
   "  if (si.byTerms && si.payDate) { inv.payDateOverride = si.payDate; inv.payDateWhy = s(si.payRule); }\n"
   "  if (rec.via === 'bulk drop') { inv.source = 'bulkdrop'; inv.by = s(rec.by || 'office') + ' (bulk drop)'; inv.desc = inv.desc.replace(/\\(e-mailed [^)]*\\)$/, '(dropped in the CRM, read by the CRM)'); }   /* patch BULKDROP */"),
  # 4. the QuickBooks review queue keeps the attached document
  ("vendor:rec.vendor||'',status:'approved',by:'QB-auto',source:'quickbooks'}",
   "vendor:rec.vendor||'',status:'approved',by:'QB-auto',source:'quickbooks',receipt:rec.receipt||undefined,receiptName:rec.receiptName||undefined,files:rec.files||undefined,docSha:rec.docSha||undefined}   /* patch BULKDROP */"),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('find-string count != 1', a[:80], src.count(a))
    src = src.replace(a, b)
assert src.count(MARK) >= 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
