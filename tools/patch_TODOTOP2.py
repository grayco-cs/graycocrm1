#!/usr/bin/env python3
"""patch TODOTOP2: the To-Do page's bottom cards as one list with counts at the top (appends tools/todotop2_tail.js)."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '__GC_PATCH_TODOTOP2__' in src: print('already patched'); sys.exit(0)
tail = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'todotop2_tail.js'), encoding='utf-8').read()
open(P, 'w', encoding='utf-8').write(src.rstrip('\n') + '\n' + tail); print('patched')
