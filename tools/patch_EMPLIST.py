#!/usr/bin/env python3
"""patch EMPLIST (owner 11/03: Payroll → Employees still listed "Dale Perritt · inactive" — "he should not be here"):
the employee list shows only current people. Hidden: inactive profiles, anyone let go (gc_fired_users), and the shared
"Office" sign-in (not a person). Paid history is untouched; a small "Show N former / shared" link reveals them if needed."""
import sys, os
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
s = open(P, encoding='utf-8').read()
MARK = '/* patch EMPLIST'
if MARK in s: print('already patched'); sys.exit(0)
A = "  var profs=await P.profiles(), all=await P.runs(), yr=String(new Date().getFullYear());\n  var rows=profs.map(function(p){"
assert s.count(A) == 1, s.count(A)
B = ("  var profs=await P.profiles(), all=await P.runs(), yr=String(new Date().getFullYear());\n"
     "  /* patch EMPLIST: only current people — not anyone inactive or let go, not the shared Office sign-in */\n"
     "  var _fu={}; try{ _fu=JSON.parse(localStorage.getItem('gc_fired_users')||'{}')||{}; }catch(_e){}\n"
     "  var _hid=profs.filter(function(p){ var nm=String(p.name||'').trim().toLowerCase(), em=String(p.email||'').trim().toLowerCase();\n"
     "    var u=P.users().find(function(x){ return x.id===p.userId || x.name===p.name; })||null;\n"
     "    return p.active===false || _fu[nm] || (em && _fu[em]) || nm==='office' || (u && (u.active===false || u.shared===true || u.sharedLogin===true)); });\n"
     "  if(!S._empShowAll) profs=profs.filter(function(p){ return _hid.indexOf(p)<0; });\n"
     "  setTimeout(function(){ try{ if(!_hid.length || body.querySelector('[data-emp-showall]')) return; var a=document.createElement('a'); a.href='#'; a.setAttribute('data-emp-showall','1');\n"
     "    a.style.cssText='display:inline-block;margin-top:8px;font-size:11px;color:#64748b;'; a.textContent=S._empShowAll?'Hide former / shared':'Show '+_hid.length+' former / shared';\n"
     "    a.onclick=function(ev){ ev.preventDefault(); S._empShowAll=!S._empShowAll; render(); }; body.appendChild(a); }catch(_e2){} }, 0);\n"
     "  var rows=profs.map(function(p){")
s = s.replace(A, B); open(P, 'w', encoding='utf-8').write(s); print('patched EMPLIST')
