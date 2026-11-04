#!/usr/bin/env python3
"""patch PAYGROUP (owner 11/04: "weeks that are same dates are grouped together for that week's payroll — I don't need 2
payrolls when I'm paying more than 1 person, show the week"): Payroll → Approvals shows ONE card per payday (newest first):
"Payroll — checks dated 2026-09-25 · 2 people · gross · net · federal", with each person's check under it and that
check's own See every check / Void / Edit buttons. Display only — the saved runs are unchanged (941, W-2 and YTD read
them the same way)."""
import sys, os
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
s = open(P, encoding='utf-8').read()
MARK = '/* patch PAYGROUP'
if MARK in s: print('already patched'); sys.exit(0)
A = "  body.innerHTML=list.map(runCard).join('');\n"
assert s.count(A) == 1, s.count(A)
B = ("  /* patch PAYGROUP: one card per payday — every person paid that day under it */\n"
     "  (function(){ var g={}, order=[]; list.forEach(function(r){ var k=String(r.payDate||r.to||'—'); if(!g[k]){ g[k]=[]; order.push(k); } g[k].push(r); });\n"
     "    order.sort(function(a,b){ return b.localeCompare(a); });\n"
     "    body.innerHTML=order.map(function(k){ var rs=g[k]; if(rs.length===1) return runCard(rs[0]);\n"
     "      var live=rs.filter(function(r){ return r.status==='paid'||r.status==='approved'; }), names={}, gross=0, net=0, fed=0, n=0;\n"
     "      rs.forEach(function(r){ (r.lines||[]).forEach(function(L){ names[L.name||'']=1; }); });\n"
     "      live.forEach(function(r){ var t=r.totals||{}; gross+=+t.gross||0; net+=+t.net||0; fed+=+t.fed||0; n+=(r.lines||[]).length; });\n"
     "      var from=rs.map(function(r){ return String(r.from||''); }).sort()[0], to=rs.map(function(r){ return String(r.to||''); }).sort().slice(-1)[0];\n"
     "      return '<div style=\"border:2px solid #cbd5e1;border-radius:14px;padding:10px 10px 2px;margin-bottom:14px;background:#f8fafc\">'\n"
     "        +'<div style=\"display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:2px 6px 10px\"><div><b style=\"font-size:15px\">💵 Payroll — checks dated '+esc(k)+'</b>'\n"
     "        +'<div style=\"'+CSS.sub+'\">Week '+esc(from)+' → '+esc(to)+' · '+Object.keys(names).filter(Boolean).length+' people ('+esc(Object.keys(names).filter(Boolean).join(', '))+') · '+n+' check'+(n===1?'':'s')+' · gross '+money(gross)+' · federal '+money(fed)+' · net '+money(net)+(live.length<rs.length?(' · '+(rs.length-live.length)+' not paid yet'):'')+'</div></div></div>'\n"
     "        +rs.map(runCard).join('')+'</div>'; }).join(''); })();\n")
s = s.replace(A, B); open(P, 'w', encoding='utf-8').write(s); print('patched PAYGROUP')
