#!/usr/bin/env python3
"""patch PASTPAYMS2 (owner 11/03: "aren't commissions and regular salary different taxes"; "salary employees auto
their payroll every week"):
 - federal on a check with commission = the W-4 calc on the REGULAR pay only + a flat 22% on the commission (IRS
   Pub 15 optional flat rate for supplemental wages paid with or separately identified from regular wages — the way ADP
   withholds it). State is still worked on the whole check.
 - Make weekly rows fills a salaried employee's weekly gross (annual salary ÷ 52) by itself; type over it to match a stub.
Edits index.html + tools/pastpay_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html'), os.path.join(H, 'pastpay_tail.js')]
MARK = '/* patch PASTPAYMS2'
R = [
 ("ck=[e.key,s(r.from)||addDays(r.payDate,-6),s(r.to)||r.payDate,gt,stx].join('|');",
  "ck=[e.key,s(r.from)||addDays(r.payDate,-6),s(r.to)||r.payDate,gt,stx,r2(r.comm)].join('|');"),
 ("    try{ var L=await p.computeLine(Object.assign({}, e.prof, stOv, { period:'weekly', payType:(e.prof.payType==='contractor_1099'?'hourly':e.prof.payType) }), from, to, set, { gross:0, ssWages:0, medWages:0, sutaBy:{} }, gt, {});\n"
  "      fedCache[ck]=r2(L && L.fed);",
  "    /* patch PASTPAYMS2: commission = supplemental wages → regular pay through the W-4 calc + a flat 22% on the commission */\n"
  "    var _pf=Object.assign({}, e.prof, stOv, { period:'weekly', payType:(e.prof.payType==='contractor_1099'?'hourly':e.prof.payType) }), _cm=r2(n2(r.comm)), _rg=r2(n2(r.gross));\n"
  "    try{ var L=await p.computeLine(_pf, from, to, set, { gross:0, ssWages:0, medWages:0, sutaBy:{} }, gt, {});\n"
  "      var _fedReg = (_cm>0) ? (_rg>0 ? r2(((await p.computeLine(_pf, from, to, set, { gross:0, ssWages:0, medWages:0, sutaBy:{} }, _rg, {}))||{}).fed) : 0) : r2(L && L.fed);\n"
  "      fedCache[ck]=r2(_fedReg + (_cm>0 ? r2(_cm*0.22) : 0));"),
 ("emps.forEach(function(e){ out.push({ payDate:d, from:addDays(d,-6), to:d, name:e.name, empKey:e.key, payType:e.payType, hours:'', gross:'',",
  "emps.forEach(function(e){ out.push({ payDate:d, from:addDays(d,-6), to:d, name:e.name, empKey:e.key, payType:e.payType, hours:'', gross:weeklySalary(e),"),
 ("function defSt(p){",
  "/* patch PASTPAYMS2: a salaried employee's weekly pay fills in by itself (annual salary ÷ 52) — typed over to match the stub */\n"
  "function weeklySalary(e){ var p=(e&&e.prof)||{}, t=low(p.payType); var a=n2(p.annualSalary); return ((t==='salary'||t==='salary_commission') && a>0) ? r2(a/52).toFixed(2) : ''; }\n"
  "function defSt(p){"),
 ("var PP={ calc:calc, buildRuns:buildRuns, fillRows:fillRows, w2Employees:w2Employees, MODES:MODES, defSt:defSt };",
  "var PP={ calc:calc, buildRuns:buildRuns, fillRows:fillRows, w2Employees:w2Employees, MODES:MODES, defSt:defSt, weeklySalary:weeklySalary };"),
 ("Type the <b>gross</b> (and commission); Social Security 6.2%, Medicare 1.45% and federal tax from the W-4 fill in",
  "Salaried pay fills in (salary ÷ 52); type hourly pay and any <b>commission</b> separately. Social Security 6.2%, Medicare 1.45% and federal tax fill in — federal from the W-4 on the regular pay plus a flat 22% on commission (the IRS supplemental rate, the way ADP does it)"),
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
print('patched PASTPAYMS2 (%d file(s))' % done if done else 'already patched')
