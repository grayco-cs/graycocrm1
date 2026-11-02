#!/usr/bin/env python3
"""Idempotent patch JOBACTIVE (owner 11/02 ~2 PM CT, Projects page: "not sure how these popped up but they are old finished
lost etc, i had 2/3 active earlier" -- Active 8 instead of 3, five of them showing BIDDING).

Cause (no job was created or changed): the old QuickBooks customer import (index.html, the "customers/jobs imported from
QuickBooks" reader) wrote status "Active" -- capital A, meaning "the customer is active in QuickBooks" -- on every customer
row it turned into a job (187 rows, 8/25, 8/26 and 9/8). The job-board rule keeps an untouched QuickBooks row off the board;
five of them stay on it because money or a message points at them (L357, C221, D615: old client payments; V221: its CoC /
punch list; L705: the owner's test text). Until r17j the Projects cards compared the status case-sensitively, so "Active"
was in no card (only All), and the row's status drop-down, which has no "Active" option, showed its first one: "bidding".
Patch JOBORDER (r17j, 11/02 15:03 UTC) made the cards case-insensitive (window._gcJOCls), so those five moved into Active.

Fix: in JOBORDER's grouping, a QuickBooks-imported row whose status is still exactly the import's "Active" is in no
working group ('other': the All card only, below bidding, above finished) -- as before r17j. A status a person chose is
written in lower case ("active", from the drop-down), so a QuickBooks job someone set Active stays Active; a job a person
or the maintenance screen made with "Active" (no QuickBooks source) stays Active too. Display only: no job is changed.

Edits tools/joborder.js and its copy inside index.html (patch JOBORDER's script), so patch_JOBORDER.py stays "already
patched". Every find-string must occur exactly once in each file (else nothing is written).
Usage: python3 tools/patch_JOBACTIVE.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
page = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
src_js = os.path.join(HERE, 'joborder.js')
MARK = '/* patch JOBACTIVE'

OLD = ("function cls(p){\n"
       "  if (!p) return 'other';\n"
       "  var st = low(p.status).replace(/[\\s_-]+/g, ' ');\n")
NEW = ("/* patch JOBACTIVE: the old QuickBooks customer import wrote status \"Active\" (the customer is active in QuickBooks) on\n"
       "   every row it made; such a row still at that exact status is no working job: the All card only, as before r17j.\n"
       "   A person's choice is lower case (\"active\"), and a non-QuickBooks \"Active\" (maintenance, typed) stays active. */\n"
       "function qbImportStatus(p){\n"
       "  return s(p.status) === 'Active' && (low(p.source) === 'quickbooks' || !!s(p.qbId) || !!s(p.qbCustomerId));\n"
       "}\n"
       "function cls(p){\n"
       "  if (!p) return 'other';\n"
       "  if (qbImportStatus(p)) return 'other';\n"
       "  var st = low(p.status).replace(/[\\s_-]+/g, ' ');\n")

files = [page, src_js]
texts = {f: open(f, encoding='utf-8').read() for f in files}
done = [f for f in files if MARK in texts[f]]
if len(done) == len(files):
    print('JOBACTIVE: already patched'); sys.exit(0)
assert not done, ('JOBACTIVE: only partly patched', done)
for f in files:
    n = texts[f].count(OLD)
    assert n == 1, ('JOBACTIVE: anchor count != 1', f, n)
    texts[f] = texts[f].replace(OLD, NEW)
    assert texts[f].count(MARK) == 1
for f in files:
    open(f, 'w', encoding='utf-8').write(texts[f])
print('JOBACTIVE: patched', ', '.join(files))
