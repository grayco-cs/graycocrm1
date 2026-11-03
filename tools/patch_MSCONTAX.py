#!/usr/bin/env python3
"""patch MSCONTAX (owner 11/03: "account for ms contractor tax from all ms invoices in this little tax thing that we pay
quarterly whether its a different deal or whatever"): Payroll → 🏛 MS contractor tax tab next to 🧾 Form 941 — every client
invoice on a Mississippi job for a quarter, 3.5% on contracts over $10k, the MS tax already on invoices, the over-$75k MPC
list. Read-only worksheet. The page lives in tools/mscontax_tail.js (inserted after the F941 block)."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(H, '..', 'index.html')
MARK = '__GC_MSCONTAX__'
TAIL = open(os.path.join(H, 'mscontax_tail.js'), encoding='utf-8').read().rstrip('\n')
F941_END = "setTimeout(function(){ ensureQuarter(); }, 20000); setInterval(function(){ ensureQuarter(); }, 10*60*1000);\n\n})(window);\n</script>"
R = [
 ("['settings','Settings']].concat((P.isAdmin()&&window._gcF941Render)?[['f941','🧾 Form 941']]:[]);   /* patch F941 */",
  "['settings','Settings']].concat((P.isAdmin()&&window._gcF941Render)?[['f941','🧾 Form 941']]:[]).concat((P.isAdmin()&&window._gcMsTaxRender)?[['mstax','🏛 MS contractor tax']]:[]);   /* patch F941 · patch MSCONTAX */"),
 ("  if(S.tab==='f941')         return window._gcF941Render ? window._gcF941Render(body) : null;   /* patch F941 */",
  "  if(S.tab==='f941')         return window._gcF941Render ? window._gcF941Render(body) : null;   /* patch F941 */\n"
  "  if(S.tab==='mstax')        return window._gcMsTaxRender ? window._gcMsTaxRender(body) : null;   /* patch MSCONTAX */"),
 (F941_END, F941_END + "\n" + TAIL),
]
t = open(P, encoding='utf-8').read()
if MARK in t: print('already patched'); sys.exit(0)
for a, b in R:
    n = t.count(a)
    if n != 1: print('anchor count', n, 'for', a[:90]); sys.exit(1)
    t = t.replace(a, b)
open(P, 'w', encoding='utf-8').write(t)
print('patched MSCONTAX')
