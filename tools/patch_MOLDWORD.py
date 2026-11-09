#!/usr/bin/env python3
"""patch MOLDWORD: the word rule for mold papers no longer fires on "crown molding", "moldings", "molded", "mold-resistant drywall"
(ESTKEYS reads estimate lines, where those are common)."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
a = "has(/\\bmold|mould|mildew/)"; b = "has(/\\b(mold|mould)(?!ing|ed\\b|ings|-?\\s?(resistant|resist|guard|tough|proof))|mildew/)"
if b in src and a not in src: print('already patched'); sys.exit(0)
open(P, 'w', encoding='utf-8').write(src.replace(a, b)); print('patched')
