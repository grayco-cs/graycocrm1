#!/usr/bin/env python3
"""patch SUPPLIERINV: Sub Invoices → 👷 Sub invoices / 🧱 Supplier invoices (tools/supplierinv_tail.js + two hooks in the table)."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '__GC_PATCH_SUPPLIERINV__' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) >= 1, (src.count(a), a[:60]); src = src.replace(a, b)
rep('z=Ba.filter(W=>W.type==="sub"&&(_shA||_shP.has(W.pid)))',
    'z=Ba.filter(W=>W.type==="sub"&&(_shA||_shP.has(W.pid))&&((window._gcInvTab==="suppliers")===!!(window._gcIsSupplierInv&&window._gcIsSupplierInv(W))))')
rep('(W.sub&&!_known)?', '(W.sub&&!_known&&!(window._gcIsSupplierInv&&window._gcIsSupplierInv(W)))?')
tail = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'supplierinv_tail.js'), encoding='utf-8').read()
open(P, 'w', encoding='utf-8').write(src.rstrip('\n') + '\n' + tail); print('patched')
