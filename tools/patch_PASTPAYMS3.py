#!/usr/bin/env python3
"""patch PASTPAYMS3 (owner's ADP stubs 11/03): ADP withholds commission with the AGGREGATE method (salary + commission
through the W-4 together: 8/28 $4,297.64 check → federal $605.87 ≈ 19.7% on the commission part), not the flat 22%.
So 'as calculated' goes back to the aggregate method, the same as Run Payroll. Salary ÷ 52 fill-in stays.
Edits index.html + tools/pastpay_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYMS3'
R = [
 ("      var _fedReg = (_cm>0) ? (",
  "      /* patch PASTPAYMS3: aggregate method (as ADP and Run Payroll do) — the flat-22% split is off */\n      var _fedReg = (false && _cm>0) ? ("),
 ("      fedCache[ck]=r2(_fedReg + (_cm>0 ? r2(_cm*0.22) : 0));", "      fedCache[ck]=r2(_fedReg);"),
 (" — federal from the W-4 on the regular pay plus a flat 22% on commission (the IRS supplemental rate, the way ADP does it)",
  " — federal from the employee’s W-4 on the whole check (salary + commission together, the way ADP does it). <b>For checks already paid, use \"amount on the check stub\" so Form 941 matches what was really withheld.</b>"),
]
done = 0
for P in FILES:
    t = open(P, encoding='utf-8').read()
    if MARK in t: continue
    for a, b in R:
        n = t.count(a)
        if n != 1: print('anchor count', n, 'in', P, 'for', a[:90]); sys.exit(1)
        t = t.replace(a, b)
    open(P, 'w', encoding='utf-8').write(t); done += 1
print('patched PASTPAYMS3 (%d file(s))' % done if done else 'already patched')
