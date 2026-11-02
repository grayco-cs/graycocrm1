#!/usr/bin/env python3
"""Idempotent patch PERFMM: the Marketing Manager's page may not write gc_kv, so the every-2-minutes performance
report (gc_perfrep_<device>) was refused (403), retried forever and showed him "⚠ N saves are kept on this computer".
Skip that report for the Marketing Manager. Usage: python3 tools/patch_PERFMM.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch PERFMM'
if MARK in t: print('PERFMM: already patched'); sys.exit(0)
old = "  if (!dirty || !signedIn() || typeof W._supaUpsert !== 'function') return;\n  dirty = false; var r = report();"
new = ("  if (!dirty || !signedIn() || typeof W._supaUpsert !== 'function') return;\n"
       "  " + MARK + ": the Marketing Manager cannot write gc_kv; never queue a report for him */ try { if (typeof W._gcIsMM === 'function' && W._gcIsMM()) { dirty = false; return; } } catch (e) {}\n"
       "  dirty = false; var r = report();")
assert t.count(old) == 1, ('PERFMM anchor', t.count(old))
t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('PERFMM: patched', p)
