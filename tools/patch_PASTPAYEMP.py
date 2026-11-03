#!/usr/bin/env python3
"""patch PASTPAYEMP (owner 11/03: "this only has 1 employee it should have all employees to choose from"):
Enter past payroll left out (1) Brittany, because her sign-in is the shared office@ mailbox, and (2) anyone whose payroll
profile has no pay type yet. Now: every active person on Admin → Team is offered except owners/admins, the shared
"Office" login itself, 1099 contractors and owner draws. A real person with the Office Admin role on office@ IS offered.
Edits index.html + tools/pastpay_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYEMP'
R = [
 ("    if(!x || !s(x.name) || x.active===false || !W2_TYPES[low(x.payType)]) return false;",
  "    if(!x || !s(x.name) || x.active===false || /^(contractor_1099|1099|owner_draw|owner)$/.test(low(x.payType))) return false;   /* patch PASTPAYEMP: no pay type yet = still an employee */"),
 ("    if(nm==='office' || /^office@/.test(em) || (u && (u.shared===true || u.sharedLogin===true || u.isShared===true))) return false;",
  "    if(nm==='office' || (/^office@/.test(em) && !/office admin/.test(role)) || (u && (u.shared===true || u.sharedLogin===true || u.isShared===true))) return false;"),
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
print('patched PASTPAYEMP (%d file(s))' % done if done else 'already patched')
