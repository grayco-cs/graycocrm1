#!/usr/bin/env python3
"""patch PAYCHECK (owner's ADP paystubs are the truth): the Run Payroll engine reproduces them once the W-4 is entered.
 1. Federal: IRS Pub 15-T Worksheet 1A line 1g was missing — the $8,600 ($12,900 married) that, with the table's own
    starting point, makes up the standard deduction when Step 2 is NOT checked. Every 2020+ W-4 was over-withheld.
 2. W-4 2019-or-earlier path (form year + allowances x $4,300, no Step 3 / 4a / 4b), fields on Payroll -> Employees.
 3. Mississippi withheld in whole dollars, as ADP does (State tax settings: roundWhole:false turns it off).
 4. Commission: per run 'same check' (aggregate, the default = ADP's 8/28 check), 'separate check' (taxed on its own,
    annualized, default W-4 Single with nothing else = ADP's 9/18 commission check) or flat 22%; per-check breakdown.
 5. 2026 head-of-household rows: the 32% bracket starts at $201,750 (Rev. Proc. 2025-32), not single's $201,775.
 6. MS 89-350 exemption of $0 shows as 0 (it used to come back blank and then be re-figured).
Edits index.html only (no tools/*_tail.js copy holds this code)."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
FILES = [os.path.join(H, '..', 'index.html')]
MARK = '/* patch PAYCHECK'
R = [
 ("[121250,16155,0.24,121250],[217325,39213,0.32,217325],[271750,56629,0.35,271750],[656150,191169,0.37,656150]]",
  "[121250,16155,0.24,121250],[217300,39207,0.32,217300],[271750,56631,0.35,271750],[656150,191171,0.37,656150]]   /* patch PAYCHECK: HoH 32% from $201,750 */"),
 ("[64925,8077.5,0.24,64925],[112962.5,19606.5,0.32,112962.5],[140175,28314.5,0.35,140175],[332375,95584.5,0.37,332375]]",
  "[64925,8077.5,0.24,64925],[112950,19603.5,0.32,112950],[140175,28315.5,0.35,140175],[332375,95585.5,0.37,332375]]"),
 ("  return { tax: Math.max(0,tax), row: row };\n}",
  "  return { tax: Math.max(0,tax), row: row };\n}\n"
  "/* patch PAYCHECK: Pub 15-T Worksheet 1A in one place — line 1g, the 2019-or-earlier W-4, Step 3, Step 4(c) */\n"
  "var W4_ALLOW = 4300;\n"
  "function _pcOldW4(pf){ return String((pf && pf.w4Form) || '') === '2019'; }\n"
  "function _pc1g(pf){ return (pf.multipleJobs || _pcOldW4(pf)) ? 0 : (pf.filing === 'married' ? 12900 : 8600); }\n"
  "function _pcFed(amt, ppy, pf, year){\n"
  "  pf = pf || {}; if(pf.exemptFed) return 0;\n"
  "  var old = _pcOldW4(pf), annual = r2(n2(amt) * ppy);\n"
  "  var adj = old ? annual - n2(pf.allowances) * W4_ALLOW : annual + n2(pf.otherIncome) - n2(pf.deductions) - _pc1g(pf);\n"
  "  var ft = fedAnnualTax(Math.max(0, adj), pf.filing, year, !old && !!pf.multipleJobs);\n"
  "  return r2(r2(Math.max(0, ft.tax - (old ? 0 : n2(pf.dependentsCredit))) / ppy) + n2(pf.extra));\n"
  "}"),
 ("    adj = Math.max(0, adj);\n    var ft = fedAnnualTax(adj, prof.filing, set.taxYear, !!prof.multipleJobs);",
  "    var _old = _pcOldW4(prof);   /* patch PAYCHECK: Worksheet 1A line 1g / 2019-or-earlier W-4 */\n"
  "    if(_old){ adj = annual - n2(prof.allowances) * W4_ALLOW; T('W-4 from 2019 or earlier', n2(prof.allowances)+' allowance(s) × '+money(W4_ALLOW)+' taken off (Steps 3 and 4(a)/(b) do not apply)', null); }\n"
  "    else if(_pc1g(prof)){ adj -= _pc1g(prof); T('IRS Worksheet 1A line 1g', '− '+money(_pc1g(prof))+' (Step 2 not checked; with the table this is the standard deduction)', null); }\n"
  "    adj = Math.max(0, adj);\n    var ft = fedAnnualTax(adj, prof.filing, set.taxYear, !_old && !!prof.multipleJobs);"),
 ("    var afterCredit = Math.max(0, ft.tax - n2(prof.dependentsCredit));",
  "    var afterCredit = Math.max(0, ft.tax - (_old ? 0 : n2(prof.dependentsCredit)));   /* patch PAYCHECK */"),
 ("  state = r2(state + n2(prof.stateExtra));",
  "  /* patch PAYCHECK: commission method — 'aggregate' (one check, W-4 on the total: the default, as ADP's combined check),\n"
  "     'separate' (its own check, annualized on its own with the default W-4 — Single, nothing else — as ADP's\n"
  "     commission-only check), 'flat22' (IRS optional 22% supplemental rate). Salary keeps the employee's W-4. */\n"
  "  var _cm = String((extras && extras.commMethod) || set.commissionMethod || 'aggregate'), _checks = null;\n"
  "  var _comm = (typeof comm === 'number' && comm > 0 && (manualGross == null || manualGross === '') && pt !== 'contractor_1099') ? r2(Math.min(comm, taxable)) : 0;\n"
  "  if(_comm > 0 && (_cm === 'separate' || _cm === 'flat22')){\n"
  "    var _salT = r2(taxable - _comm);\n"
  "    var _stOf = function(amt){ if(amt <= 0) return 0; if(storedRate !== null && storedRate > 0) return r2(amt * storedRate/100);\n"
  "      if(!whSt || !window._gcStateWithholding) return 0;\n"
  "      try{ var c = window._gcStateWithholding({ state: whSt, table: stTbl, exemptionClaimed: prof.msExemption, grossPerCheck: amt, taxable: amt, periodsPerYear: ppy,\n"
  "        filing: prof.msFiling||prof.filing||'single', dependents: n2(prof.stateDependents||prof.dependents), age65: !!prof.age65, blind: !!prof.blind,\n"
  "        year: parseInt(String(set.taxYear||new Date().getFullYear()),10) }); return r2(n2(c && c.amount)); }catch(e){ return 0; } };\n"
  "    var _fS = _pcFed(_salT, ppy, prof, set.taxYear), _fC = prof.exemptFed ? 0 : (_cm === 'flat22' ? r2(_comm * 0.22) : _pcFed(_comm, ppy, { filing: 'single' }, set.taxYear));\n"
  "    var _sS = _stOf(_salT), _sC = _stOf(_comm);\n"
  "    var _capped = r2(ssWages) < taxable, _ssS = _capped ? r2(ss * _salT / Math.max(0.01, taxable)) : r2(_salT * n2(set.ssRate)), _ssC = _capped ? r2(ss - _ssS) : r2(_comm * n2(set.ssRate));\n"
  "    var _mS = r2(_salT * n2(set.medRate)), _mC = r2(_comm * n2(set.medRate));\n"
  "    fed = r2(_fS + _fC); state = r2(_sS + _sC); ss = r2(_ssS + _ssC); med = r2(_mS + _mC);\n"
  "    var _g1 = r2(gross - _comm), _sx = n2(prof.stateExtra);\n"
  "    _checks = [\n"
  "      { label: 'Salary check', gross: _g1, fed: _fS, ss: _ssS, med: _mS, addlMed: addlMed, state: r2(_sS + _sx), net: r2(_g1 - preTax - postTax - _ssS - _mS - addlMed - _fS - _sS - _sx) },\n"
  "      { label: 'Commission check', gross: _comm, fed: _fC, ss: _ssC, med: _mC, addlMed: 0, state: _sC, net: r2(_comm - _ssC - _mC - _fC - _sC) } ];\n"
  "    T('Commission on its own check', (_cm === 'flat22' ? 'federal at the flat 22% supplemental rate' : 'annualized on its own, default W-4 (Single, nothing else) — as ADP does')\n"
  "      + ' · salary check: federal '+money(_fS)+', state '+money(_sS)+' · commission check: federal '+money(_fC)+', state '+money(_sC), null);\n"
  "  }\n"
  "  state = r2(state + n2(prof.stateExtra));"),
 ("    filing: prof.filing, trace: trace,",
  "    filing: prof.filing, checks: _checks, commMethod: _cm, trace: trace,   /* patch PAYCHECK */"),
 ("+fld('Claims exempt','<select data-p=\"exemptFed\"",
  "+fld('W-4 form year','<select data-p=\"w4Form\" style=\"'+CSS.inp+'width:100%;\"><option value=\"\">2020 or later</option><option value=\"2019\"'+(String(p.w4Form||'')==='2019'?' selected':'')+'>2019 or earlier (allowances)</option></select>')   /* patch PAYCHECK */\n"
  "        +fld('Allowances (2019-or-earlier W-4 only)','<input data-p=\"allowances\" value=\"'+esc(p.allowances||0)+'\" style=\"'+CSS.inp+'width:100%;\">')\n"
  "        +fld('Claims exempt','<select data-p=\"exemptFed\""),
 ("'workState','sutaState','msFiling']", "'workState','sutaState','msFiling','w4Form']"),
 ("esc(p.msExemption||'')", "esc(p.msExemption==null?'':p.msExemption)"),
 ("      + fld('Check date','<input id=\"_pPay\"",
  "      + fld('Commission','<select id=\"_pComm\" style=\"'+CSS.inp+'\">'+[['aggregate','Same check as salary'],['separate','Its own check (like ADP)'],['flat22','Flat 22% supplemental']].map(function(o){ return '<option value=\"'+o[0]+'\"'+((S.commMethod||'aggregate')===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select>')   /* patch PAYCHECK */\n"
  "      + fld('Check date','<input id=\"_pPay\""),
 ("S.payDate=body.querySelector('#_pPay').value||P.today();",
  "S.payDate=body.querySelector('#_pPay').value||P.today(); var _pcSel=body.querySelector('#_pComm'); if(_pcSel) S.commMethod=_pcSel.value;   /* patch PAYCHECK */"),
 ("(window.__GC_PAY_EXTRAS||{})[key]);   /* patch PAY: bonus",
  "Object.assign({ commMethod: S.commMethod||'' }, (window.__GC_PAY_EXTRAS||{})[key]||{}));   /* patch PAYCHECK · patch PAY: bonus"),
 ("var perCheck=r2(annualTax/ppy) + n2(o.extra);",
  "var perCheck=((TB && TB.roundWhole===false) ? r2(annualTax/ppy) : Math.round(annualTax/ppy)) + n2(o.extra);   /* patch PAYCHECK: whole dollars, as ADP */"),
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
print('patched PAYCHECK (%d file(s))' % done if done else 'already patched')
