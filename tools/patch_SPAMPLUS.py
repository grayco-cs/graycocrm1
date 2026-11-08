#!/usr/bin/env python3
"""patch SPAMPLUS (owner 11/4: "i shouldve never got this inquiry in my leads" — a website "Free estimate" from Los Angeles:
"We are a Bookkeeping/Accounting Firm … Can we connect?"). The sales guard (SALESBLOCK, same rules in the page and on
the server) now also knows: "we are a … firm / agency / company", bookkeeping / accounting / tax / payroll services,
"can we connect / let's connect", and a project far outside TN · MS · AR (weak). Such a form waits in Leads → 🧹 Sales &
spam (no lead, alert or reply), as before."""
import sys, os
R = sys.argv[1] if len(sys.argv) > 1 else '.'
NEW_STRONG = ("  ['vendor intro: \"we are a … firm / agency\"', /\\b(we\\s+are|we\\x27re|i\\s+am|i\\x27m)\\s+(a|an)\\s+[^.!?\\n]{0,40}\\b(firm|agency|consultancy|consulting\\s+(firm|company)|outsourcing\\s+company|service\\s+provider)\\b/i],\n"
              "  ['bookkeeping / accounting services', /\\b(bookkeeping|book\\s*keeping|accounting\\s+(firm|services|team)|tax\\s+(preparation|services)|payroll\\s+services|fractional\\s+cfo|virtual\\s+cfo)\\b/i],\n")
NEW_WEAK = ("  ['\"can we connect\"', /\\b(can|could|may)\\s+we\\s+connect\\b|\\blet\\x27?s\\s+connect\\b|\\bhappy\\s+to\\s+connect\\b/i],\n"
            "  ['project far outside TN / MS / AR', /\\b(los\\s+angeles|san\\s+diego|san\\s+francisco|new\\s+york|chicago|houston|dallas|phoenix|las\\s+vegas|seattle|miami|denver|boston|atlanta|california|florida|new\\s+jersey|ontario|london|india|pakistan|philippines)\\b/i],\n")
for fn in ('index.html', 'netlify/functions/_lib/salesguard.js'):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read()
    if 'vendor intro: "we are a' in src: print(fn, 'already patched'); continue
    a = 'var SG_STRONG = [\n'; b = 'var SG_WEAK = [\n'
    assert src.count(a) == 1 and src.count(b) == 1, fn
    src = src.replace(a, a + NEW_STRONG).replace(b, b + NEW_WEAK)
    open(p, 'w', encoding='utf-8').write(src); print(fn, 'patched')
