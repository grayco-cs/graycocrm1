#!/usr/bin/env python3
"""Idempotent patch PAYLATER (owner 10/29: the red "PAYROLL NEEDS YOU" bar "keeps popping up"): Later hid it, but the
1.2-second repaint put it straight back. Later now snoozes it on this computer for 4 hours (or to 7 AM tomorrow when that
is sooner after 5 PM); a NEW run waiting (the count goes up) shows it again at once."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch PAYLATER'
if MARK in t: print('PAYLATER: already patched'); sys.exit(0)
def once(a, b):
    global t
    n = t.count(a); assert n == 1, ('PAYLATER anchor', n, a[:70]); t = t.replace(a, b)
once("""    var show = PENDING>0 && P.isAdmin() && ['admin','officemanager','dashboard','payroll'].indexOf(view)>=0 && view!=='payroll';""",
"""    var show = PENDING>0 && P.isAdmin() && ['admin','officemanager','dashboard','payroll'].indexOf(view)>=0 && view!=='payroll';
    """ + MARK + """: "Later" holds until its time, unless more runs are waiting than when it was pressed */
    try{ var _sn=JSON.parse(localStorage.getItem('gc_pay_alert_later')||'null'); if(show && _sn && Date.now()<_sn.until && PENDING<=_sn.n) show=false; }catch(_e){}""")
once("""    bar.querySelector('#_gcPayAlertX').onclick=function(){ bar.remove(); LAST=Date.now(); };""",
"""    bar.querySelector('#_gcPayAlertX').onclick=function(){ bar.remove(); LAST=Date.now();
      try{ var d=new Date(), u=Date.now()+4*3600e3; if(d.getHours()>=17){ var m=new Date(d.getFullYear(), d.getMonth(), d.getDate()+1, 7, 0, 0); u=Math.min(u, m.getTime()) > Date.now() ? Math.max(u, m.getTime()) : u; }
        localStorage.setItem('gc_pay_alert_later', JSON.stringify({ until:u, n:PENDING })); }catch(_e){} };""")
open(p, 'w', encoding='utf-8').write(t); print('PAYLATER: patched')
