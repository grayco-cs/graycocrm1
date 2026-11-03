#!/usr/bin/env python3
"""patch PASTPAYMS (owner 11/03: "should also have state for MS employees"): 📥 Enter past payroll gets a State tax
column. Each row has a state (default from the employee's payroll profile: MS when they live or work in MS, else TN).
TN: no state income tax (0). MS: 'as calculated' (the same MS withholding the payroll engine uses, from the profile's
MS filing / exemption), 'amount on the check stub', or 'none withheld'. Net pay subtracts it; the saved run lines carry
state / stateName / withholdState so W-2 box 17 and the MS quarterly have it. Edits index.html + tools/pastpay_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYMS'
R = [
 # calc: the state figure
 ("    var other=r2(r.other);\n    var netC=r2(gt-fed-ss-med-addl-other);",
  "    var other=r2(r.other);\n"
  "    /* patch PASTPAYMS: state income tax — TN has none; MS (or another state) as calculated / from the stub / none */\n"
  "    var stc=(s(r.st)||'TN').toUpperCase(), sm=MODES[r.stMode]?r.stMode:'calc', stw=0;\n"
  "    if(stc!=='TN'){ if(sm==='calc'){ if(r.stCalc==null){ if(gt>0) out.err.push('No '+stc+' state tax figure for '+(r.name||'this row')+' — set the employee\\'s state in Payroll → Employees, or pick \"amount on the check stub\" under State tax'); } else stw=r2(r.stCalc); }\n"
  "      else if(sm==='stub') stw=r2(r.stw); else out.note.push('No '+stc+' state tax was withheld on this check.'); }\n"
  "    var netC=r2(gt-fed-ss-med-addl-stw-other);"),
 ("futa:r2(futaW*futaRate), suta:r2(sutaW*sutaRate), net:net, ssCalc:ssC, medCalc:r2(medC+addC), fedMode:fm, ficaMode:xm, other:other });",
  "futa:r2(futaW*futaRate), suta:r2(sutaW*sutaRate), net:net, ssCalc:ssC, medCalc:r2(medC+addC), fedMode:fm, ficaMode:xm, other:other, state:stw, st:stc, stMode:sm });"),
 # buildRuns: carry the state
 ("ss:o.ss, med:o.med, addlMed:o.addlMed, fed:o.fed, state:0, stateName:'TN', withholdState:'TN', sutaState:'TN',",
  "ss:o.ss, med:o.med, addlMed:o.addlMed, fed:o.fed, state:r2(o.state), stateName:s(o.st||'TN'), withholdState:s(o.st||'TN'), sutaState:(s(r.sutaSt)||'TN').toUpperCase(),"),
 # fillRows: default state per employee
 ("    emps.forEach(function(e){ out.push({ payDate:d, from:addDays(d,-6), to:d, name:e.name, empKey:e.key, payType:e.payType, hours:'', gross:'', comm:'', fedMode:'calc', ficaMode:'calc', fed:'', ss:'', med:'', other:'', net:'', netTyped:false, checkNo:'' }); });",
  "    emps.forEach(function(e){ out.push({ payDate:d, from:addDays(d,-6), to:d, name:e.name, empKey:e.key, payType:e.payType, hours:'', gross:'', comm:'', fedMode:'calc', ficaMode:'calc', fed:'', ss:'', med:'', other:'', net:'', netTyped:false, checkNo:'', st:defSt(e.prof), stMode:'calc', stw:'' }); });"),
 ("var PP={ calc:calc, buildRuns:buildRuns, fillRows:fillRows, w2Employees:w2Employees, MODES:MODES };",
  "/* patch PASTPAYMS: the row's default state — MS when the employee lives or works in MS (as the payroll engine withholds), else their state, else TN */\n"
  "function defSt(p){ p=p||{}; var r=(s(p.state)||'TN').toUpperCase(), w=(s(p.workState)||r).toUpperCase(); return (r==='MS'||w==='MS')?'MS':r; }\n"
  "var PP={ calc:calc, buildRuns:buildRuns, fillRows:fillRows, w2Employees:w2Employees, MODES:MODES, defSt:defSt };"),
 # fedFor: also the state figure, for the row's state
 ("    var from=s(r.from)||addDays(r.payDate,-6), to=s(r.to)||r.payDate, ck=[e.key,from,to,gt].join('|');\n    if(fedCache[ck]!=null) return fedCache[ck];\n    try{ var L=await p.computeLine(Object.assign({}, e.prof, { period:'weekly', payType:(e.prof.payType==='contractor_1099'?'hourly':e.prof.payType) }), from, to, set, { gross:0, ssWages:0, medWages:0, sutaBy:{} }, gt, {});\n      fedCache[ck]=r2(L && L.fed); return fedCache[ck]; }catch(err){ return null; }",
  "    var stx=(s(r.st)||defSt(e.prof)).toUpperCase(), ck=[e.key,s(r.from)||addDays(r.payDate,-6),s(r.to)||r.payDate,gt,stx].join('|');   /* patch PASTPAYMS */\n"
  "    var from=s(r.from)||addDays(r.payDate,-6), to=s(r.to)||r.payDate;\n"
  "    if(fedCache[ck]!=null){ r.stCalc=stCache[ck]; r.sutaSt=sutaCache[ck]; return fedCache[ck]; }\n"
  "    var stOv=(stx===defSt(e.prof)) ? {} : { state:stx, workState:stx };\n"
  "    try{ var L=await p.computeLine(Object.assign({}, e.prof, stOv, { period:'weekly', payType:(e.prof.payType==='contractor_1099'?'hourly':e.prof.payType) }), from, to, set, { gross:0, ssWages:0, medWages:0, sutaBy:{} }, gt, {});\n"
  "      fedCache[ck]=r2(L && L.fed); stCache[ck]=(L && L.state!=null) ? r2(L.state) : null; sutaCache[ck]=s(L && L.sutaState)||'TN'; r.stCalc=stCache[ck]; r.sutaSt=sutaCache[ck]; return fedCache[ck]; }catch(err){ r.stCalc=null; return null; }"),
 ("  var fedCache={};", "  var fedCache={}, stCache={}, sutaCache={};"),
 ("    for(var i=0;i<rows.length;i++){ var r=rows[i]; r.empKey=(empOf(r.name)||{}).key||r.name; r.payType=(empOf(r.name)||{}).payType||r.payType; r.fedCalc = r.fedMode==='calc' ? await fedFor(r) : null; }",
  "    for(var i=0;i<rows.length;i++){ var r=rows[i]; r.empKey=(empOf(r.name)||{}).key||r.name; r.payType=(empOf(r.name)||{}).payType||r.payType;\n"
  "      if(!s(r.st) && empOf(r.name)){ r.st=defSt(empOf(r.name).prof); var _tr=ov.querySelector('tr[data-row=\"'+i+'\"] [data-k=\"st\"]'); if(_tr) _tr.value=r.st; }   /* patch PASTPAYMS */\n"
  "      var _fc = await fedFor(r); r.fedCalc = r.fedMode==='calc' ? _fc : null; }"),
 # the table
 ("'Federal withheld','Social Security / Medicare withheld','Other ded.'", "'Federal withheld','Social Security / Medicare withheld','State tax (TN none · MS)','Other ded.'"),
 ("min-width:1380px", "min-width:1560px"),
 ("        +'<td style=\"padding:3px\">'+inp(i,'other',r.other,66)+'</td>",
  "        +'<td style=\"padding:3px\"><select data-i=\"'+i+'\" data-k=\"st\" style=\"'+IN+'width:150px\">'+['TN','MS','AR','AL','GA','KY','MO','LA'].map(function(v){ return '<option value=\"'+v+'\"'+((s(r.st)||'TN').toUpperCase()===v?' selected':'')+'>'+(v==='TN'?'TN — no state tax':v)+'</option>'; }).join('')+'</select><br>'+modeSel(i,'stMode',r.stMode||'calc')+'<br>'+inp(i,'stw',r.stw,86)+'</td>'\n"
  "        +'<td style=\"padding:3px\">'+inp(i,'other',r.other,66)+'</td>"),
 ("'<tr data-note=\"'+i+'\"><td colspan=\"13\"", "'<tr data-note=\"'+i+'\"><td colspan=\"14\""),
 ("'<tr><td colspan=\"13\" style=\"padding:14px;color:#64748b;font-size:13px\">No checks yet.", "'<tr><td colspan=\"14\" style=\"padding:14px;color:#64748b;font-size:13px\">No checks yet."),
 # paint the state box
 ("      if(!r.netTyped) set1('net', o.net!=null && o.gross>0 ? r2(o.net).toFixed(2) : '', false);",
  "      var _st=(s(r.st)||'TN').toUpperCase(), _sm=r.stMode||'calc'; var _sms=tr.querySelector('[data-k=\"stMode\"]'); if(_sms) _sms.style.display=_st==='TN'?'none':'';   /* patch PASTPAYMS */\n"
  "      set1('stw', _st==='TN' ? '0.00' : (_sm==='calc' ? (r.stCalc==null?'':r2(o.state).toFixed(2)) : (_sm==='none'?'0.00':r.stw)), _st==='TN' || _sm!=='stub');\n"
  "      if(!r.netTyped) set1('net', o.net!=null && o.gross>0 ? r2(o.net).toFixed(2) : '', false);"),
 ("    if(k==='fedMode' || k==='ficaMode'){ r.netTyped=false; r.net=''; }",
  "    if(k==='stMode' && el.value==='stub' && r.stw==='' && r.out) r.stw=r2(r.out.state).toFixed(2);   /* patch PASTPAYMS */\n"
  "    if(k==='fedMode' || k==='ficaMode' || k==='stMode' || k==='st'){ r.netTyped=false; r.net=''; }"),
 ("rows.push({ payDate:d, from:addDays(d,-6), to:d, name:'', hours:'', gross:'', comm:'', fedMode:'calc', ficaMode:'calc', fed:'', ss:'', med:'', other:'', net:'', netTyped:false, checkNo:'' });",
  "rows.push({ payDate:d, from:addDays(d,-6), to:d, name:'', hours:'', gross:'', comm:'', fedMode:'calc', ficaMode:'calc', fed:'', ss:'', med:'', other:'', net:'', netTyped:false, checkNo:'', st:'', stMode:'calc', stw:'' });"),
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
print('patched PASTPAYMS (%d file(s))' % done if done else 'already patched')
