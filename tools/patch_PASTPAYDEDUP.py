#!/usr/bin/env python3
"""patch PASTPAYDEDUP (owner 11/03 screenshot: "Brittany Pucket" listed hundreds of times in Enter past payroll):
the payroll profile list holds many copies of the same person. The offered list is now one entry per person (by Team
user id, else by trimmed lower-case name), keeping the copy with the most W-4 / pay detail.
Edits index.html + tools/pastpay_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYDEDUP'
A = "  }).map(function(x){ return { name:s(x.name), key:s(x.userId||x.name), payType:s(x.payType), prof:x }; }).sort(function(a,b){ return a.name.localeCompare(b.name); });"
B = ("  }).map(function(x){ return { name:s(x.name), key:s(x.userId||x.name), payType:s(x.payType), prof:x }; }).sort(function(a,b){ return a.name.localeCompare(b.name); })\n"
     "  .filter((function(){ /* patch PASTPAYDEDUP: one entry per person, however many copies the profile list holds */\n"
     "    var seen={}; function score(p){ p=p||{}; var n=0; ['filing','w4Step3','dependents','stepTwo','annualSalary','hourlyRate','state','workState','msFiling','w4Year','allowances'].forEach(function(k){ if(p[k]!=null && p[k]!=='' && p[k]!==0) n++; }); return n; }\n"
     "    return function(e, i, all){ var k=low(s(e.name)); if(seen[k]!=null) return false;\n"
     "      var best=e; all.forEach(function(o){ if(low(s(o.name))===k && score(o.prof)>score(best.prof)) best=o; });\n"
     "      if(best!==e){ e.prof=best.prof; e.key=best.key; e.payType=best.payType; } seen[k]=i; return true; };\n"
     "  })());")
done = 0
for P in FILES:
    t = open(P, encoding='utf-8').read()
    if MARK in t: continue
    if t.count(A) != 1: print('anchor count', t.count(A), 'in', P); sys.exit(1)
    t = t.replace(A, B); open(P, 'w', encoding='utf-8').write(t); done += 1
print('patched PASTPAYDEDUP (%d file(s))' % done if done else 'already patched')
