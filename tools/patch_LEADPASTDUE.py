#!/usr/bin/env python3
"""patch LEADPASTDUE (owner 11/8: "if leads are past due then take off leads"). A bid lead whose due date has passed
(right after its due time; a date-only due is the end of that day) and was never submitted / won / lost now leaves the Leads list — it was a week. It is not
deleted: Leads → "Closed / expired" (and the estimator's own bid list) still show it."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*LEADPASTDUE*/' in src: print('already patched'); sys.exit(0)
o1 = "isFinite(ms) && Date.now() - ms > 7 * 86400000 && !/submit|won|lost/i.test("
o2 = "return isFinite(t) && Date.now() - t > 7 * 864e5 && !/submit/i.test(s(l.bidStatus)); }"
assert src.count(o1) == 1 and src.count(o2) == 1
src = src.replace(o1, "isFinite(ms) && Date.now() - ms > 0 /*LEADPASTDUE*/ && !/submit|won|lost/i.test(")
src = src.replace(o2, "return isFinite(t) && Date.now() - t > 0 && !/submit/i.test(s(l.bidStatus)); }")
open(P, 'w', encoding='utf-8').write(src); print('patched')
