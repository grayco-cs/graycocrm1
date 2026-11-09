#!/usr/bin/env python3
"""patch STATUSAUTO: job status moves forward by itself (bidding → estimating → approved → active) — tools/statusauto_tail.js."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '__GC_PATCH_STATUSAUTO__' in src: print('already patched'); sys.exit(0)
tail = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'statusauto_tail.js'), encoding='utf-8').read()
open(P, 'w', encoding='utf-8').write(src.rstrip('\n') + '\n' + tail); print('patched')
