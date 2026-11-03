#!/usr/bin/env python3
"""patch PAYFIRED (owner 11/03: "NO DALE PERRITT ANYWHERE IN THE CRM"): a payroll profile of someone who was let go
(gc_fired_users: Dale Perritt) is switched off (active:false, updatedAt stamped so the sync keeps it), so he is in no
payroll list, run, check queue or 941. Condition-gated: once off, nothing is written again."""
import sys, os
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
s = open(P, encoding='utf-8').read()
MARK = '/* patch PAYFIRED'
if MARK in s: print('already patched'); sys.exit(0)
A = "  if(_migChanged || _pdRemoved){ try{ await put(K_PROF, list); }catch(_pe){} }   /* patch PROFDUP: once */"
assert s.count(A) == 1, s.count(A)
B = ("  /* patch PAYFIRED: anyone let go (gc_fired_users) is off payroll for good */\n"
     "  try{ var _fu = JSON.parse(localStorage.getItem('gc_fired_users') || '{}') || {};\n"
     "    list.forEach(function(p){ if(!p || p.active === false) return; var nm = String(p.name || '').trim().toLowerCase(), em = String(p.email || '').trim().toLowerCase();\n"
     "      if(_fu[nm] || (em && _fu[em])){ p.active = false; p.firedOff = true; p.updatedAt = new Date().toISOString(); _migChanged = true; } }); }catch(_fe){}\n" + A)
s = s.replace(A, B); open(P, 'w', encoding='utf-8').write(s); print('patched PAYFIRED')
