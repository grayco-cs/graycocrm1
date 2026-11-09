#!/usr/bin/env python3
"""patch JOBSTEPS: 🧭 Steps & papers on each job (appends tools/steps_tail.js; see its header)."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '__GC_PATCH_JOBSTEPS__' in src: print('already patched'); sys.exit(0)
tail = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'steps_tail.js'), encoding='utf-8').read()
open(P, 'w', encoding='utf-8').write(src.rstrip('\n') + '\n' + tail); print('patched')

# + LEADASB card shown only on jobs whose words / flags say lead or asbestos (edited in leadasb_tail.js + index.html on 11/9)
