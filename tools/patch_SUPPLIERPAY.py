#!/usr/bin/env python3
"""Idempotent patch SUPPLIERPAY: the sub pay check stopped a supplier's invoice (owner 10/30: "Farrel Calhoun is a supplier,
they shouldn't have COI rules"). A payee whose record says isSub: false (Subs / Vendors list: not a sub), or whose category
is supplier / vendor / material, skips the COI, W-9 and sub-agreement rules -- suppliers get paid on approval as usual.
Subs are unchanged. Usage: python3 tools/patch_SUPPLIERPAY.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch SUPPLIERPAY'
if MARK in t: print('SUPPLIERPAY: already patched'); sys.exit(0)
old = """  var r = subRec(sub);
  if (!r) out.problems.push("""
new = """  var r = subRec(sub);
  """ + MARK + """: a supplier (record marked "not a sub") is not held to the sub rules -- no COI / W-9 / agreement */
  if (r && (r.isSub === false || /supplier|vendor|material/i.test(s(r.type || r.kind || r.vendorType)))) { out.supplier = true; out.ok = true; return out; }
  if (!r) out.problems.push("""
assert t.count(old) == 1, ('SUPPLIERPAY anchor', t.count(old))
t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('SUPPLIERPAY: patched', p)
