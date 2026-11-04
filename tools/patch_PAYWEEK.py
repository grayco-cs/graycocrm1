#!/usr/bin/env python3
"""Idempotent patch PAYWEEK: ONE company pay schedule (Payroll -> Settings -> Pay schedule) that every payroll
screen follows. Owner 11/4: "we can use thursday-wednesday but lets make sure what weve been doing is right".
  payrollSettings.weekStartDay (0-6) + payrollSettings.payLagDays (days from the period's last day to the check).
  Default: work week Thursday -> Wednesday, paid that Friday (weekStartDay 4, payLagDays 2) = what payroll did.
  Option: work week Monday -> Sunday, paid the Friday after (weekStartDay 1, payLagDays 5).
  An old hoursCutoffDay (0/3/6) with no weekStartDay maps to the same schedule it gave before.
  _gcPaySchedule / _gcPayPeriodFor / _gcPayPeriodContaining / _gcPayHoursCutoff read it, so Run Payroll's date
  buttons, Enter a week by hand, the automatic weekly draft, timesheet hours and overtime weeks all agree.
  Commission keeps its rule (Wednesday cut-off, paid the Friday of the following week); a run carries the
  commission whose pay Friday is the run's check date. Saved runs are untouched.
usage: python3 tools/patch_PAYWEEK.py [repo root]"""
import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else '.'
MARK = 'patch PAYWEEK'
OLDV, NEWV = '33.163-2026-11-04-r17q16', '33.164-2026-11-04-r17q17'

def once(src, a, b, what):
    c = src.count(a)
    assert c == 1, 'PAYWEEK %s: expected 1 of %r, found %d' % (what, a[:90], c)
    return src.replace(a, b)
def rd(p): return open(os.path.join(root, p), encoding='utf-8').read()
def wr(p, s): open(os.path.join(root, p), 'w', encoding='utf-8').write(s)

CORE_OLD = """  window._gcPayHoursCutoff=function(){
    var v=null; try{ v=localStorage.getItem('gc_pay_hours_cutoff'); }catch(e){}
    var n=parseInt(v,10);
    return (n===0 || n===3 || n===6) ? n : 3;   // 0 Sunday · 3 Wednesday · 6 Saturday
  };
  function cutDay(){ return window._gcPayHoursCutoff(); }
  setTimeout(function(){   // the setting lives in payrollSettings; keep a copy here for the synchronous read
    try{ if(window.__GC_PAY && window.__GC_PAY.settings) window.__GC_PAY.settings().then(function(s){
      if(s && s.hoursCutoffDay!=null && s.hoursCutoffDay!=='') try{ localStorage.setItem('gc_pay_hours_cutoff', String(parseInt(s.hoursCutoffDay,10))); }catch(e){}
    }, function(){}); }catch(e){}
  }, 1500);"""
CORE_NEW = """  /* patch PAYWEEK: ONE company pay schedule — payrollSettings.weekStartDay + payLagDays (days from the
     period's last day to the check). Default Thursday → Wednesday, paid that Friday (4, 2). */
  var _DN=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  window._gcPayScheduleFrom=function(s){
    s=s||{}; var ws=parseInt(s.weekStartDay,10), lag=parseInt(s.payLagDays,10);
    if(!(ws>=0 && ws<=6)){ var c=parseInt(s.hoursCutoffDay,10);   // the old hours cut-off: same schedule as before
      if(c===0||c===3||c===6){ ws=(c+1)%7; if(!(lag>=0)) lag=((5-c+7)%7)||7; } else ws=4; }
    if(!(lag>=0 && lag<=27)) lag=((5-(ws+6)%7+7)%7)||7;
    var end=(ws+6)%7, pay=(end+lag)%7;
    return { weekStartDay:ws, payLagDays:lag, endDay:end, payDay:pay,
             label:'Work week '+_DN[ws]+'–'+_DN[end]+', paid '+(lag<=3?'that ':'the ')+_DN[pay]+(lag<=3?'':' after') };
  };
  window._gcPaySchedule=function(){
    var o={}; try{ var v=JSON.parse(localStorage.getItem('gc_pay_schedule')||'null'); if(v) o=v; else { var c=localStorage.getItem('gc_pay_hours_cutoff'); if(c!=null) o={hoursCutoffDay:c}; } }catch(e){}
    return window._gcPayScheduleFrom(o);
  };
  window._gcPaySetSchedule=function(s){ var x=window._gcPayScheduleFrom(s); try{ localStorage.setItem('gc_pay_schedule', JSON.stringify({weekStartDay:x.weekStartDay, payLagDays:x.payLagDays})); localStorage.setItem('gc_pay_hours_cutoff', String(x.endDay)); }catch(e){} return x; };
  window._gcPayHoursCutoff=function(){ return window._gcPaySchedule().endDay; };   // the period's last day
  function cutDay(){ return window._gcPayHoursCutoff(); }
  function lagDays(){ return window._gcPaySchedule().payLagDays; }
  setTimeout(function(){   // the setting lives in payrollSettings; keep a copy here for the synchronous read
    try{ if(window.__GC_PAY && window.__GC_PAY.settings) window.__GC_PAY.settings().then(function(s){
      if(s && ((s.weekStartDay!=null && s.weekStartDay!=='') || (s.hoursCutoffDay!=null && s.hoursCutoffDay!==''))) window._gcPaySetSchedule(s);
    }, function(){}); }catch(e){}
  }, 1500);"""

PER_OLD = """    var pd=new Date(endD.getTime()+(((5-endD.getDay()+7)%7)||7)*86400000);   // the Friday after the week's last day"""
PER_NEW = """    var pd=new Date(endD.getTime()+lagDays()*86400000);   // the check date: the period's last day + payLagDays (patch PAYWEEK)"""
FOR_OLD = """    var pd=new Date(t.getTime()+((5-t.getDay()+7)%7)*86400000);
    var back=((pd.getDay()-cutDay()+7)%7)||7;
    return period(new Date(pd.getTime()-back*86400000));"""
FOR_NEW = """    var pd=new Date(t.getTime()+((window._gcPaySchedule().payDay-t.getDay()+7)%7)*86400000);   // patch PAYWEEK: the next check date on or after
    return period(new Date(pd.getTime()-lagDays()*86400000));"""
CW_OLD = """    if(!a || !b || b.getDay()===5) return { from:from, to:to };"""
CW_NEW = """    if(!a || !b || (b.getDay()===5 && cutDay()!==5)) return { from:from, to:to };   /* patch PAYWEEK */"""

BTN_OLD = """'">This Friday’s week</button>'"""
BTN_NEW = """'" title="The work week that ended most recently, and the check date that pays it (Payroll → Settings → Pay schedule)">Week paid this Friday</button>'   /* patch PAYWEEK */"""
SUB_OLD = """'margin-top:8px;">Payroll is every week, paid Friday. Hours come from Timesheets (through the hours cut-off in Settings) ·"""
SUB_NEW = """'margin-top:8px;"><b>'+((window._gcPaySchedule&&window._gcPaySchedule().label)||'Payroll is every week, paid Friday')+'</b> (Payroll → Settings). Hours come from Timesheets for the work week ·"""   # patch PAYWEEK

SET_OLD = """      +(function(){ var hc=(s.hoursCutoffDay==null||s.hoursCutoffDay==='')?3:parseInt(s.hoursCutoffDay,10);   /* patch AUTO-PAYWEEK */
          return '<tr><td style="'+CSS.td+'"><b>Hours cut-off</b><div style="font-size:10px;color:#94a3b8;">Payroll is every week, paid Friday. Hours clocked through this day count on that Friday’s check; later hours roll to the next week. Overtime weeks start the day after.</div></td>'
            +'<td style="'+CSS.td+'"><select data-set="hoursCutoffDay" style="'+CSS.inp+'width:230px;">'
            +[[3,'Wednesday 11:59 PM (Thu–Fri roll to next week)'],[6,'Saturday 11:59 PM'],[0,'Sunday 11:59 PM']].map(function(o){ return '<option value="'+o[0]+'"'+(hc===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')
            +'</select></td></tr>'; })()"""
SET_NEW = """      +(function(){ var sc=window._gcPayScheduleFrom(s), cur=sc.weekStartDay+'|'+sc.payLagDays;   /* patch PAYWEEK: one company pay schedule */
          var opts=[['4|2','Work week Thursday–Wednesday, paid that Friday (default)'],['1|5','Work week Monday–Sunday, paid the Friday after']];
          if(!opts.some(function(o){ return o[0]===cur; })) opts.push([cur, sc.label]);
          return '<tr><td style="'+CSS.td+'"><b>Pay schedule</b><div style="font-size:10px;color:#94a3b8;">Payroll is every week. Run Payroll, Enter a week by hand, the automatic draft, timesheet hours and overtime weeks all use this week and check date. Runs already saved keep their dates.</div></td>'
            +'<td style="'+CSS.td+'"><select data-paysched="1" style="'+CSS.inp+'width:330px;">'
            +opts.map(function(o){ return '<option value="'+o[0]+'"'+(cur===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')
            +'</select></td></tr>'; })()"""
SAVE_OLD = """    await P.saveSettings(out); try{ localStorage.setItem('gc_pay_hours_cutoff', String(out.hoursCutoffDay==null?3:out.hoursCutoffDay)); }catch(e){} alert('Payroll settings saved.'); render();   /* patch AUTO-PAYWEEK */"""
SAVE_NEW = """    var _ps=body.querySelector('[data-paysched]'); if(_ps && window._gcPaySetSchedule){ var _pv=_ps.value.split('|'); var _sc=window._gcPaySetSchedule({weekStartDay:+_pv[0], payLagDays:+_pv[1]}); out.weekStartDay=_sc.weekStartDay; out.payLagDays=_sc.payLagDays; out.hoursCutoffDay=_sc.endDay; }   /* patch PAYWEEK */
    await P.saveSettings(out); alert('Payroll settings saved.'); render();   /* patch AUTO-PAYWEEK */"""

AUTO_OLD = """  return { from: addDays(pay, -8), to: addDays(pay, -2), payDate: pay };"""
AUTO_NEW = """  var _lag=2; try{ _lag=window._gcPaySchedule().payLagDays; }catch(e){}   /* patch PAYWEEK */
  return { from: addDays(pay, -_lag-6), to: addDays(pay, -_lag), payDate: pay };"""

# Enter a week by hand (index.html and tools/paymanual_tail.js)
PM = [
 ("""  return { start:addDays(d,-6), end:d, payday:addDays(d,2), label:addDays(d,-6)+' → '+d };""",
  """  return { start:addDays(d,-6), end:d, payday:addDays(d,2), label:addDays(d,-6)+' → '+d };   /* fallback only; the company schedule (patch PAYWEEK) answers first */""", 'pm fallback'),
 ("""    $('_pmWk').textContent = 'Week ' + nice(wk.start) + ' → ' + nice(wk.end) + ' · paid ' + nice(wk.payday);""",
  """    $('_pmWk').textContent = 'Work week ' + nice(wk.start).replace(/\\/\\d{4}$/,'') + ' → ' + nice(wk.end).replace(/\\/\\d{4}$/,'') + ' · paid ' + nice(wk.payday).replace(/\\/\\d{4}$/,'');   /* patch PAYWEEK */""", 'pm summary'),
]

done = []
s = rd('index.html')
if MARK in s:
    print('already patched')
    sys.exit(0)
for a, b, w in [(CORE_OLD, CORE_NEW, 'core'), (PER_OLD, PER_NEW, 'period'), (FOR_OLD, FOR_NEW, 'periodFor'),
                (CW_OLD, CW_NEW, 'commission window'), (BTN_OLD, BTN_NEW, 'run button'), (SUB_OLD, SUB_NEW, 'run sub'),
                (SET_OLD, SET_NEW, 'settings row'), (SAVE_OLD, SAVE_NEW, 'settings save'), (AUTO_OLD, AUTO_NEW, 'auto draft')] + PM:
    s = once(s, a, b, w)
assert s.count(OLDV) == 3, 'PAYWEEK version count'
s = s.replace(OLDV, NEWV)
wr('index.html', s); done.append('index.html')
t = rd('tools/paymanual_tail.js')
for a, b, w in PM: t = once(t, a, b, w + ' (tail)')
wr('tools/paymanual_tail.js', t); done.append('tools/paymanual_tail.js')
v = rd('version.txt'); assert OLDV in v; wr('version.txt', v.replace(OLDV, NEWV)); done.append('version.txt')
print('PAYWEEK patched:', ', '.join(done))
