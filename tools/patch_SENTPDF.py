"""patch SENTPDF: append tools/sentpdf_tail.js to index.html (once). Server: netlify/functions/_lib/sent-pdf.js + mail-all.js + bid-inbox.js."""
import sys
P = 'index.html'; src = open(P).read()
if '__GC_PATCH_SENTPDF__' in src: print('already patched'); sys.exit(0)
tail = open('tools/sentpdf_tail.js').read()
src = src.rstrip('\n') + '\n' + tail
open(P, 'w').write(src); print('ok')
