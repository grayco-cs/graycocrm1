#!/usr/bin/env python3
"""patch PASTPAYCUT (owner 11/03: "let me type what I have paid up until 11/3, after that it needs to be the correct
formulas"): in Enter past payroll, a check paid ON OR BEFORE 2026-11-03 starts on "amount on the check stub" for Federal,
SS/Medicare and State (type the paper); a check paid AFTER 11/3 always uses the CRM's formulas: the tax choices are locked
to "as calculated" and the 📄 Stub button is hidden. Cutoff: payroll setting pastPayCutoff, default 2026-11-03.
Edits index.html + tools/pastpay_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYCUT'
R = [
 ("    var fm=MODES[r.fedMode]?r.fedMode:'calc', xm=MODES[r.ficaMode]?r.ficaMode:'calc';\n",
  "    var fm=MODES[r.fedMode]?r.fedMode:'calc', xm=MODES[r.ficaMode]?r.ficaMode:'calc';\n"
  "    /* patch PASTPAYCUT: after the cutoff only the formulas count */\n"
  "    var _cut=s(set.pastPayCutoff)||CUT, _after=!!s(r.payDate) && s(r.payDate)>_cut;\n"
  "    if(_after){ fm='calc'; xm='calc'; r.fedMode='calc'; r.ficaMode='calc'; out.note.push('Paid after '+_cut+': the CRM formulas are used (from the W-4 on file). Checks paid on or before '+_cut+' are typed from the paper.'); }\n"),
 ("    var stc=(s(r.st)||'TN').toUpperCase(), sm=MODES[r.stMode]?r.stMode:'calc', stw=0;\n",
  "    var stc=(s(r.st)||'TN').toUpperCase(), sm=MODES[r.stMode]?r.stMode:'calc', stw=0;\n    if(_after){ sm='calc'; r.stMode='calc'; }   /* patch PASTPAYCUT */\n"),
 ("function defSt(p){", "var CUT='2026-11-03';   /* patch PASTPAYCUT: checks paid on or before this day are typed from the paper */\nfunction defSt(p){"),
 ("      var _fc = await fedFor(r); r.fedCalc = r.fedMode==='calc' ? _fc : null; }",
  "      if(!r._mset && s(r.payDate) && set.pastPayAutoStub!==false){ r._mset=1; var _m = s(r.payDate)<=(s(set.pastPayCutoff)||CUT) ? 'stub' : 'calc'; if(_m==='stub'){ if(r.fedMode!=='stub'){ r.fedMode='stub'; if(!s(r.fed)) r.fed=''; } if(r.ficaMode!=='stub') r.ficaMode='stub'; if(r.stMode!=='stub') r.stMode='stub'; r.netTyped=false; } }   /* patch PASTPAYCUT: paid on/before the cutoff → type the paper */\n"
  "      var _fc = await fedFor(r); r.fedCalc = r.fedMode==='calc' ? _fc : null; }"),
 ("      var _st=(s(r.st)||'TN').toUpperCase(), _sm=r.stMode||'calc';",
  "      var _aft=!!s(r.payDate) && s(r.payDate)>(s(set.pastPayCutoff)||CUT); ['fedMode','ficaMode','stMode'].forEach(function(k){ var el=tr.querySelector('[data-k=\"'+k+'\"]'); if(el){ el.disabled=_aft; if(_aft) el.value='calc'; } }); var _sb=tr.querySelector('[data-stub]'); if(_sb) _sb.style.display=_aft?'none':'';   /* patch PASTPAYCUT */\n"
  "      var _st=(s(r.st)||'TN').toUpperCase(), _sm=r.stMode||'calc';"),
 ("Check already paid? Tap 📄 Stub on its row and type Federal, SS, Medicare and State from the paper.",
  "Checks paid on or before 11/3/2026 start on the paper amounts: type Federal, SS, Medicare and State from the paper (📄 Stub clears a row to retype). Checks after 11/3 always use the CRM formulas from the W-4."),
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
print('patched PASTPAYCUT (%d file(s))' % done if done else 'already patched')
