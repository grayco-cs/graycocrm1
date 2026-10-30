#!/usr/bin/env python3
"""Idempotent patch LEADKINDKEEP (with LEADBULK, owner 10/30: "need to change this from residential to commercial"):
the Lead Inbox import (fromItem(it, prev), prev = the lead already in the CRM for that inbox item) no longer
overwrites a type a person picked on the lead (LEADBULK's type menu sets leadKindManual: true). A new revision of
the same inbox item still updates everything else."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch LEADKINDKEEP'
if MARK in t: print('LEADKINDKEEP: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('LEADKINDKEEP anchor', n, old[:90]); t = t.replace(old, new)
# fromItem(it, prev) — prev is the function's own parameter (undefined for a new lead)
assert t.count('function fromItem(it, prev){') == 1, 'LEADKINDKEEP: fromItem(it, prev) not found once'
once("""  l.source = s(it.source) || 'Lead Inbox'; l.leadKind = KIND[low(it.type)] || 'Commercial';""",
     """  l.source = s(it.source) || 'Lead Inbox'; if (!(prev && prev.leadKindManual)) l.leadKind = KIND[low(it.type)] || 'Commercial';   """ + MARK + """: a type a person picked stays */""")
open(p, 'w', encoding='utf-8').write(t); print('LEADKINDKEEP: patched', p)
