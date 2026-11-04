#!/usr/bin/env python3
"""patch PASTPAYHRS (owner 11/04: "when I put 13 hours it should auto to gross (× the hourly rate)"): in Enter past
payroll, typing Hours for an hourly employee fills Gross = hours × their hourly rate from Payroll → Employees (over 40 in
the row: the extra hours at 1.5×). Gross stays filled by itself until you type your own Gross. Edits index.html +
tools/pastpay_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYHRS'
A = "    var r=rows[+i]; if(!r) return; r[k]=el.value; if(k==='net') r.netTyped=el.value!=='';"
B = (A + "\n"
     "    /* patch PASTPAYHRS: hours × the hourly rate fills Gross (over 40 at 1.5×), until a Gross is typed by hand */\n"
     "    if(k==='gross') r._grossAuto=false;\n"
     "    if(k==='hours'){ var _e=empOf(r.name), _rt=_e && _e.prof ? n2(_e.prof.hourlyRate) : 0, _h=n2(r.hours);\n"
     "      if(_rt>0 && (r._grossAuto || !s(r.gross))){ var _g=r2(Math.min(_h,40)*_rt + Math.max(0,_h-40)*_rt*1.5); r.gross=_h>0?_g.toFixed(2):''; r._grossAuto=true;\n"
     "        var _gi=ov.querySelector('tr[data-row=\"'+i+'\"] [data-k=\"gross\"]'); if(_gi) _gi.value=r.gross; } }")
done = 0
for P in FILES:
    t = open(P, encoding='utf-8').read()
    if MARK in t: continue
    if t.count(A) != 1: print('anchor count', t.count(A), 'in', P); sys.exit(1)
    t = t.replace(A, B); open(P, 'w', encoding='utf-8').write(t); done += 1
print('patched PASTPAYHRS (%d file(s))' % done if done else 'already patched')
