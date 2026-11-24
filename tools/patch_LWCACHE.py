#!/usr/bin/env python3
"""patch LWCACHE — 🚨 Leads at risk: the card's 3-second list cache is keyed on the real clock and on the CRM's leads list itself.
   It was keyed on the lead-watch clock (window.__GC_LW_NOW__ when set, so it never expired) and on the NUMBER of leads only: a synced change
   that kept the count (a new PM on a cleared lead) could keep the old list — the cleared lead did not come back. Now a new leads list (every
   sync / save replaces it) is always read again. index.html and tools/leadwatch_block.html; each anchor exactly once."""
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = """  var t = now(); if (LAST.at && Math.abs(t - LAST.at) < 3000 && LAST.n === arr(W._crm && W._crm.leads).length) return LAST.list;"""
B = """  var t = now(), rt = Date.now(), ref = W._crm && W._crm.leads;   /* patch LWCACHE: real time, and the same leads list (not only the same count) */
  if (LAST.at && Math.abs(rt - LAST.at) < 3000 && LAST.ref === ref && LAST.n === arr(ref).length) return LAST.list;"""
A2 = """  LAST = { at: t, n: arr(W._crm && W._crm.leads).length, list: L }; return L;"""
B2 = """  LAST = { at: rt, ref: ref, n: arr(ref).length, list: L }; return L;"""
for f in ('index.html', 'tools/leadwatch_block.html'):
    p = os.path.join(ROOT, f); t = io.open(p, encoding='utf-8').read()
    for a, b in ((A, B), (A2, B2)):
        if t.count(a) != 1: sys.exit('LWCACHE: anchor found %d times in %s: %r' % (t.count(a), f, a[:60]))
        t = t.replace(a, b)
    io.open(p, 'w', encoding='utf-8').write(t)
print('LWCACHE patched')
