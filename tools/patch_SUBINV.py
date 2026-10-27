#!/usr/bin/env python3
"""Idempotent patch SUBINV: a sub's invoice e-mailed in (invoices@, the office@ mailbox) is booked by itself.

1. tools/subinv_tail.js goes in as <script id="gc-patch-subinv"> right BEFORE gc-patch-ownertodo (so window._gcSubInv is
   there when OWNERTODO's makeInvoices first runs);
2. OWNERTODO's makeInvoices asks _gcSubInv.take() for each e-mail the server read (rec.si) and _gcSubInv.post() books the
   pending job cost of the ones it added.
Every find-string must occur exactly once. Usage: python3 tools/patch_SUBINV.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'subinv_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_SUBINV__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '</script>' not in TAIL
EDITS = [
  ('<script id="gc-patch-ownertodo">', '<script id="gc-patch-subinv">\n' + TAIL + '\n</script>\n<script id="gc-patch-ownertodo">'),
  ("""  var have = {}; arr(crm().invoices).forEach(function(i){ if (i.mailId) have[i.mailId] = 1; have[s(i.id)] = 1; });
  var add = [];""",
   """  var have = {}; arr(crm().invoices).forEach(function(i){ if (i.mailId) have[i.mailId] = 1; have[s(i.id)] = 1; });
  var add = [];
  try { if (W._gcSubInv) W._gcSubInv.load(MM.list, MM.done); } catch (e) {}   /* patch SUBINV */"""),
  ("""    if (have[x.mailId || x.id] || have[id]) return;
    var f = arr(x.files)[0] || {};""",
   """    if (have[x.mailId || x.id] || have[id]) return;
    if (x.si && W._gcSubInv && W._gcSubInv.take) { var tk = null; try { tk = W._gcSubInv.take(x, { invoices: arr(crm().invoices), expenses: arr(crm().expenses) }); } catch (e) { tk = { hold: true }; } if (tk) { if (tk.inv) add.push(tk.inv); return; } }   /* patch SUBINV: read + placed by the server */
    var f = arr(x.files)[0] || {};"""),
  ("""  MM.made += add.length;""",
   """  MM.made += add.length;
  try { if (W._gcSubInv) W._gcSubInv.post(add); } catch (e) {}   /* patch SUBINV: the pending job cost, once */"""),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('find-string count != 1', a[:80], src.count(a))
    src = src.replace(a, b)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
