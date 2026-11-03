#!/usr/bin/env python3
"""patch PASTPAYFIX (owner 11/03): 📥 Enter past payroll offered Dale Perritt, who doesn't work here.
Only people on Admin → Team (active) are offered; a leftover payroll profile alone is not enough.
Also: a clear '+ Add a past check' button for one check. Edits index.html and tools/pastpay_tail.js the same way."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYFIX:'
R = [
 ("    if(u && (u.active===false || low(u.payType)==='owner' || role==='admin' || role==='owner')) return false;",
  "    if(users.length && !u) return false;   /* patch PASTPAYFIX: only people on Admin → Team — a leftover payroll profile of someone who left is never offered */\n"
  "    if(u && (u.active===false || u.disabled===true || u.deleted===true || u.archived===true || u.terminated===true || /inactive|terminat|former|left|fired|quit|disabled|removed/.test(low(u.status)) || low(u.payType)==='owner' || role==='admin' || role==='owner')) return false;"),
 ("    +'<button data-pp=\"add\" style=\"'+BT+'\">+ One row</button>'",
  "    +'<button data-pp=\"add\" style=\"'+BT+'border-color:#16a34a;color:#166534\">+ Add a past check</button>'"),
 ("No rows yet — pick the first and last payday and press <b>Make weekly rows</b>.",
  "No checks yet. <b>One check:</b> press <b>+ Add a past check</b>, then pick the employee, the pay date and type the gross from the stub. <b>A whole quarter:</b> pick the first and last payday and press <b>Make weekly rows</b>."),
]
done = 0
for P in FILES:
    s = open(P, encoding='utf-8').read()
    if MARK in s: continue
    for a, b in R:
        n = s.count(a)
        if n != 1: print('anchor count', n, 'in', P, 'for', a[:80]); sys.exit(1)
        s = s.replace(a, b)
    open(P, 'w', encoding='utf-8').write(s); done += 1
print('patched PASTPAYFIX (%d file(s))' % done if done else 'already patched')
