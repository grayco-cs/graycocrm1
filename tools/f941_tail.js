<script>
/* __GC_F941__ — 🧾 Form 941 worksheet (patch F941). READ-ONLY: it reads payrollRuns / payrollTaxPayments /
   payrollSettings and works out every Form 941 line for a quarter, plus FUTA (Form 940) and TN SUTA estimates.
   Nothing is written to the data, nothing is sent anywhere. The pure core (F941.compute) is also run by
   tools/tests/test_F941_fn.mjs in Node. */
(function(W){
'use strict';
if(W.__GC_F941__) return; W.__GC_F941__ = true;

function n2(v){ var n=parseFloat(v); return isFinite(n)?n:0; }
function r2(v){ return Math.round((n2(v)+(n2(v)>=0?1e-9:-1e-9))*100)/100; }
function money(v){ var n=r2(v); return (n<0?'-$':'$')+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function pad(n){ return String(n).padStart(2,'0'); }
function s(v){ return v==null?'':String(v); }

var LINES = {
  L1:  'Number of employees who received wages, tips, or other compensation for the pay period including the 12th of the 3rd month',
  L2:  'Wages, tips, and other compensation',
  L3:  'Federal income tax withheld from wages, tips, and other compensation',
  L4:  'If no wages, tips, and other compensation are subject to social security or Medicare tax (check box)',
  L5a: 'Taxable social security wages',
  L5b: 'Taxable social security tips',
  L5c: 'Taxable Medicare wages & tips',
  L5d: 'Taxable wages & tips subject to Additional Medicare Tax withholding',
  L5e: 'Total social security and Medicare taxes (add Column 2 of 5a–5d)',
  L5f: 'Section 3121(q) Notice and Demand — tax due on unreported tips',
  L6:  'Total taxes before adjustments (lines 3 + 5e + 5f)',
  L7:  'Current quarter’s adjustment for fractions of cents',
  L8:  'Current quarter’s adjustment for sick pay',
  L9:  'Current quarter’s adjustments for tips and group-term life insurance',
  L10: 'Total taxes after adjustments (lines 6 through 9)',
  L11: 'Qualified small business payroll tax credit for increasing research activities (Form 8974)',
  L12: 'Total taxes after adjustments and nonrefundable credits (line 10 − line 11)',
  L13: 'Total deposits for this quarter, including overpayment applied from a prior quarter',
  L14: 'Balance due (line 12 more than line 13)',
  L15: 'Overpayment (line 13 more than line 12)',
  M1:  'Part 2, line 16 — tax liability, Month 1',
  M2:  'Part 2, line 16 — tax liability, Month 2',
  M3:  'Part 2, line 16 — tax liability, Month 3',
  MT:  'Part 2, line 16 — total liability for quarter (must equal line 12)'
};
var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

function qInfo(year, q){
  year=parseInt(year,10); q=parseInt(q,10);
  var m0=(q-1)*3+1, m3=m0+2, last=new Date(year, m3, 0).getDate();
  var nm = m3===12 ? {y:year+1,m:1} : {y:year,m:m3+1};
  // monthly depositor: the deposit for the quarter's last month is due the 15th of the next month
  return { year:year, q:q, from:year+'-'+pad(m0)+'-01', to:year+'-'+pad(m3)+'-'+pad(last),
    months:[year+'-'+pad(m0), year+'-'+pad(m0+1), year+'-'+pad(m3)],
    day12: year+'-'+pad(m3)+'-12',
    depFrom: year+'-'+pad(m0)+'-16', depTo: nm.y+'-'+pad(nm.m)+'-15',
    dueDate: nextBiz(nm.y+'-'+pad(nm.m)+'-'+pad(new Date(nm.y, nm.m, 0).getDate())) };
}
function nextBiz(ds){ var d=new Date(ds+'T12:00:00'); while(d.getDay()===0||d.getDay()===6) d.setDate(d.getDate()+1);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function lastEndedQuarter(todayStr){
  var y=+todayStr.slice(0,4), m=+todayStr.slice(5,7), q=Math.floor((m-1)/3)+1;
  return q===1 ? {year:y-1,q:4} : {year:y,q:q-1};
}
function isLive(r){ return r && ['approved','paid'].indexOf(r.status)>=0; }
function lineWages(L){ return L.taxable!=null ? n2(L.taxable) : r2(n2(L.gross)-n2(L.preTax)); }
function lineFicaWages(L){ return L.medWages!=null ? n2(L.medWages) : lineWages(L); }
function lineKind(L){
  var pt=s(L.payType);
  if(pt==='contractor_1099') return '1099';
  if(pt==='owner_draw') return (n2(L.ss)+n2(L.med)+n2(L.fed)>0) ? 'w2' : 'draw';
  return 'w2';
}
function paidHow(L){
  var m=s(L.payMethod||L.method||L.paidVia).toLowerCase(), out='';
  if(/dd|direct|ach|deposit/.test(m) || L.directDeposit) out='direct deposit'; else if(L.checkNo) out='check #'+s(L.checkNo); else if(m) out=m;
  if(L.paidDate) out+=(out?', ':'')+'paid '+s(L.paidDate);
  return out || 'not recorded';
}
function payKind(x){ return s(x && (x.kind||x.type)).toLowerCase(); }
function payQuarterTag(x){ // an explicit "for which quarter" on a payment wins over its date
  var v=s(x && (x.forQuarter||x.quarter||x.period)).toUpperCase().replace(/\s+/g,'');
  var m=v.match(/^(\d{4})-?Q([1-4])$/)||v.match(/^Q([1-4])-?(\d{4})$/);
  if(!m){ // a payment made from the tax calendar carries its due date: taxKey '941dep|2026-08-15' (July's taxes) or '941q|2026-10-31' (Q3)
    var k=s(x && x.taxKey).match(/^941(?:dep|q)\|(\d{4})-(\d{2})-\d{2}$/); if(!k) return null;
    var yy=+k[1], mm=+k[2]-1; if(mm<1){ mm=12; yy--; }
    return { year:yy, q:Math.floor((mm-1)/3)+1 };
  }
  return /^\d{4}/.test(v) ? {year:+m[1], q:+m[2]} : {year:+m[2], q:+m[1]};
}

/* ── the pure core ─────────────────────────────────────────────────────────── */
function compute(opt){
  opt=opt||{};
  var set=opt.settings||{}, qi=qInfo(opt.year, opt.q);
  var ssBase=n2(set.ssWageBase)||184500, ssRate2=0.124, medRate2=0.029, addlRate=0.009,
      addlThr=n2(set.addlMedThreshold)||200000, futaRate=set.futaRate!=null?n2(set.futaRate):0.006,
      futaBase=n2(set.futaWageBase)||7000, sutaRate=set.sutaRate!=null?n2(set.sutaRate):0.027, sutaBase=n2(set.sutaWageBase)||7000;
  var allRuns=(opt.runs||[]).filter(Boolean);
  var yr=String(qi.year);
  var W2=[], warn=[], info=[], usedRuns=[], excluded=[];
  // year-to-date order: every live run of the year by pay date (cash basis)
  var yearRuns=allRuns.filter(function(r){ return isLive(r) && s(r.payDate).slice(0,4)===yr; })
    .sort(function(a,b){ return s(a.payDate)<s(b.payDate)?-1:s(a.payDate)>s(b.payDate)?1:(s(a.id)<s(b.id)?-1:1); });
  var ytd={}, emp={};
  var T={ wages:0, fed:0, ssW:0, medW:0, addlW:0, eeSS:0, eeMed:0, eeAddl:0, storedSSW:0, futaW:0, futaStored:0, sutaStored:0, checks:0, eeL7:0, erPaysEE:0, noFica:[], noFed:[] };
  var month={}; qi.months.forEach(function(m){ month[m]={ fed:0, ssW:0, medW:0, addlW:0, ee:0, runs:0, checks:0 }; });
  var futaYtd=0, futaQ=0, sutaBy={}, pretaxFlag={}, reg=[];
  yearRuns.forEach(function(r){
    var pd=s(r.payDate).slice(0,10), inQ = pd>=qi.from && pd<=qi.to, ru=null;
    if(inQ){ ru={ id:s(r.id), source:s(r.source), payDate:pd, from:s(r.from), to:s(r.to), status:r.status, checks:0, wages:0, fed:0, ee:0, excluded:0 }; usedRuns.push(ru); }
    (r.lines||[]).forEach(function(L){
      if(!L || L.status==='denied') return;
      var k=lineKind(L), key=s(L.empId||L.name), nm=s(L.name||L.empId);
      if(k!=='w2'){
        if(inQ){ excluded.push({ run:s(r.id), payDate:pd, name:nm, kind:k, gross:r2(L.gross) }); ru.excluded++; }
        return;
      }
      var w=lineWages(L), fw=lineFicaWages(L);
      var y=ytd[key]||(ytd[key]={ ss:0, med:0, futa:0, suta:{} });
      var ssW=Math.max(0, Math.min(fw, ssBase-y.ss));
      var addlW=Math.max(0, y.med+fw-addlThr) - Math.max(0, y.med-addlThr);
      var futaW=Math.max(0, Math.min(w, futaBase-y.futa));
      var sst=s(L.sutaState||L.workState||'TN').toUpperCase()||'TN';
      var sb = sst==='TN' ? sutaBase : n2(((set.suta||{})[sst]||{}).base)||sutaBase;
      var sy=n2(y.suta[sst]); var sutaW=Math.max(0, Math.min(w, sb-sy));
      y.ss+=ssW; y.med+=fw; y.futa+=futaW; y.suta[sst]=sy+w;
      futaYtd+=futaW;
      if(!inQ) return;
      futaQ+=futaW;
      var bs=sutaBy[sst]||(sutaBy[sst]={ state:sst, wages:0, taxable:0, excess:0, stored:0, emps:{} });
      bs.wages+=w; bs.taxable+=sutaW; bs.excess+=(w-sutaW); bs.stored+=n2(L.suta);
      var be=bs.emps[key]||(bs.emps[key]={ name:nm, wages:0, taxable:0 }); be.wages+=w; be.taxable+=sutaW;
      var e=emp[key]||(emp[key]={ key:key, name:nm, wages:0, fed:0, ssW:0, medW:0, addlW:0, ee:0, storedSSW:0, checks:0 });
      /* patch PASTPAY: a check paid with NO Social Security / Medicare withheld (the stub entry's "none withheld") —
         the company still owes both halves on line 5; the employee half it did not withhold is ITS cost, not a
         line-7 adjustment (line 7 is fractions of cents only). So that line counts at the form's own figure. */
      var noFica = !!L.ficaNotWithheld, eeFormL = r2(r2(ssW*0.062)+r2(fw*0.0145)+r2(addlW*addlRate));
      var eeL = noFica ? eeFormL : (n2(L.ss)+n2(L.med)+n2(L.addlMed));
      if(noFica){ T.erPaysEE+=eeFormL; T.noFica.push(nm+' '+pd); }
      if(L.fedNotWithheld && w>0) T.noFed.push(nm+' '+pd);
      e.wages+=w; e.fed+=n2(L.fed); e.ssW+=ssW; e.medW+=fw; e.addlW+=addlW; e.ee+=eeL;
      e.storedSSW+=n2(L.ssWages!=null?L.ssWages:fw); e.checks++;
      T.wages+=w; T.fed+=n2(L.fed); T.ssW+=ssW; T.medW+=fw; T.addlW+=addlW;
      T.eeSS+=n2(L.ss); T.eeMed+=n2(L.med); T.eeAddl+=n2(L.addlMed); T.eeL7+=eeL; T.storedSSW+=n2(L.ssWages!=null?L.ssWages:fw);
      T.futaStored+=n2(L.futa); T.sutaStored+=n2(L.suta); T.checks++;
      var mo=month[pd.slice(0,7)]; mo.fed+=n2(L.fed); mo.ssW+=ssW; mo.medW+=fw; mo.addlW+=addlW; mo.ee+=eeL; mo.checks++;
      reg.push({ payDate:pd, run:s(r.id), key:key, name:nm, hours:r2(n2(L.hours)+n2(L.otHours)), gross:r2(L.gross), preTax:r2(L.preTax), wages:r2(w),
        fed:r2(L.fed), ss:r2(L.ss), med:r2(n2(L.med)+n2(L.addlMed)), net:r2(L.net), paid:paidHow(L) });
      ru.checks++; ru.wages+=w; ru.fed+=n2(L.fed); ru.ee+=eeL;
      if(n2(L.gross)>0 && (L.fed==null || L.ss==null || L.med==null)) warn.push('Withholding is MISSING on '+nm+'’s check in the run paid '+pd+' (no '+[L.fed==null?'federal':'',L.ss==null?'Social Security':'',L.med==null?'Medicare':''].filter(Boolean).join(' / ')+' figure). Lines 3, 5 and 7 are wrong until it is fixed.');
      else if(!noFica && fw>0 && n2(L.ss)===0 && n2(L.med)===0) warn.push('No Social Security or Medicare was withheld on '+nm+'’s check paid '+pd+' ('+money(fw)+' of wages). Line 7 will be off by the missing amount.');
      (L.otherList||[]).forEach(function(d){ if(d && d.pretax && /401|403|457|retire|ira\b/i.test(s(d.label))) pretaxFlag[s(d.label)]=1; });
    });
  });
  usedRuns.forEach(function(ru){ ['wages','fed','ee'].forEach(function(k){ ru[k]=r2(ru[k]); }); });
  // runs in the quarter that are not approved yet
  allRuns.forEach(function(r){ var pd=s(r.payDate).slice(0,10);
    if(!isLive(r) && pd>=qi.from && pd<=qi.to && ['deleted','void','voided','denied'].indexOf(s(r.status))<0) warn.push('A payroll run paid '+pd+' is “'+s(r.status||'draft')+'” — it is NOT counted. Approve or delete it first.');
    if(isLive(r) && !s(r.payDate)) warn.push('An approved payroll run ('+s(r.id)+') has no pay date — it cannot be placed in a quarter.'); });
  var _np=(Array.isArray(set.f941NoPayMonths)?set.f941NoPayMonths:[]), nopayAsk=[];   /* patch F941ACK */
  qi.months.forEach(function(m,i){ if(!month[m].checks && _np.indexOf(m)>=0){ info.push('No payroll in '+MONTHS[+m.slice(5,7)-1]+' '+m.slice(0,4)+' — marked “nobody was paid that month”.'); return; } if(!month[m].checks) nopayAsk.push(m); if(!month[m].checks) warn.push('No approved payroll was paid in '+MONTHS[+m.slice(5,7)-1]+' '+m.slice(0,4)+' (month '+(i+1)+'). If people were paid that month, that payroll is missing from the CRM.'); });

  // L1 — the pay period that includes the 12th of the 3rd month
  var l1set={}, l1runs=[];
  allRuns.forEach(function(r){
    if(!isLive(r) || !r.from || !r.to) return;
    if(s(r.from)<=qi.day12 && s(r.to)>=qi.day12){
      l1runs.push(s(r.id));
      (r.lines||[]).forEach(function(L){ if(L && L.status!=='denied' && lineKind(L)==='w2' && n2(L.gross)>0) l1set[s(L.empId||L.name)]=1; });
    }
  });
  var L1=Object.keys(l1set).length;
  if(!l1runs.length) warn.push('No approved payroll run has a pay period that includes '+qi.day12+' — line 1 (employee count) could not be worked out. Count the people on the payroll for that pay period by hand.');

  var L = {};
  L.L1=L1; L.L2=r2(T.wages); L.L3=r2(T.fed); L.L4=(T.medW===0 && T.wages>0);
  L.L5a1=r2(T.ssW); L.L5a2=r2(T.ssW*ssRate2);
  L.L5b1=0; L.L5b2=0;
  L.L5c1=r2(T.medW); L.L5c2=r2(T.medW*medRate2);
  L.L5d1=r2(T.addlW); L.L5d2=r2(T.addlW*addlRate);
  L.L5e=r2(L.L5a2+L.L5b2+L.L5c2+L.L5d2); L.L5f=0;
  L.L6=r2(L.L3+L.L5e+L.L5f);
  var eeActual=r2(T.eeL7);
  if(T.noFica.length) warn.push('Social Security / Medicare were NOT withheld on '+T.noFica.length+' check(s) ('+T.noFica.slice(0,4).join(', ')+(T.noFica.length>4?' …':'')+'). Line 5 still reports both halves; the employee half, '+money(T.erPaysEE)+', is owed by the company (its cost — it is not a line 7 adjustment). Talk to your CPA.');
  if(T.noFed.length) warn.push('No federal income tax was withheld on '+T.noFed.length+' check(s) ('+T.noFed.slice(0,4).join(', ')+(T.noFed.length>4?' …':'')+'). Line 3 shows only what was actually withheld. Talk to your CPA; Social Security / Medicare are still owed.');
  var eeOnForm=r2(r2(L.L5a1*0.062)+r2(L.L5c1*0.0145)+L.L5d2);
  L.L7=r2(eeActual-eeOnForm); L.L8=0; L.L9=0;
  L.L10=r2(L.L6+L.L7+L.L8+L.L9); L.L11=0; L.L12=r2(L.L10-L.L11);

  // L13 — 941 deposits for this quarter's liabilities
  var deps=[], sel=opt.depositSel||{};
  (opt.payments||[]).forEach(function(x){
    if(!x || payKind(x)!=='941') return;
    var d=s(x.date).slice(0,10), tag=payQuarterTag(x), def;
    if(tag) def=(tag.year===qi.year && tag.q===qi.q);
    else def=(d>=qi.depFrom && d<=qi.depTo);
    var near = d>=qi.from && d<=qi.dueDate;
    if(!def && !near) return;
    var on = sel[s(x.id)]!=null ? !!sel[s(x.id)] : def;
    deps.push({ id:s(x.id), date:d, amount:r2(x.amount), confirm:s(x.confirm), note:s(x.note), counted:on, byRule:def, tagged:!!tag });
  });
  deps.sort(function(a,b){ return a.date<b.date?-1:1; });
  L.L13=r2(deps.filter(function(d){return d.counted;}).reduce(function(a,d){return a+d.amount;},0));
  L.L14=r2(Math.max(0, L.L12-L.L13)); L.L15=r2(Math.max(0, L.L13-L.L12));
  var _pl=!!(set.f941PayLater && set.f941PayLater[qi.year+'-Q'+qi.q]) && !deps.some(function(d){return d.counted;});   /* patch F941ACK */
  if(_pl) info.push('No deposits were made this quarter — the balance due '+money(L.L14)+' (line 14) is being paid now. Pay it on EFTPS (or a same-day wire / an IRS-approved card processor), then record it: Payroll → Withholding & Taxes → record a payment, type “Federal 941 deposit”.');
  if(!_pl && !deps.some(function(d){return d.counted;}) && L.L12>0) warn.push('No Form 941 deposits are recorded for this quarter (Payroll → Withholding & Taxes → record a payment, type “Federal 941 deposit”). Line 13 shows $0 — check EFTPS for what was actually paid.');
  if(!_pl && Math.abs(L.L13-L.L12)>=0.01) warn.push('Line 13 (deposits '+money(L.L13)+') does not equal line 12 (tax '+money(L.L12)+') — '+(L.L12>L.L13?('balance due '+money(L.L14)):('overpayment '+money(L.L15)))+'. Check EFTPS: a deposit may be missing from the CRM, or a deposit may be short.');

  // Part 2 — monthly liability by pay date; month 3 takes the rounding so the total equals line 12
  var mRaw=qi.months.map(function(m){ var o=month[m];
    return r2(o.fed + r2(o.ssW*ssRate2) + r2(o.medW*medRate2) + r2(o.addlW*addlRate) + (o.ee - (r2(o.ssW*0.062)+r2(o.medW*0.0145)+r2(o.addlW*addlRate)))); });
  var M=[mRaw[0], mRaw[1], r2(L.L12-mRaw[0]-mRaw[1])];
  var plug=r2(M[2]-mRaw[2]);
  var p2={ under2500: L.L12<2500, months:M, monthsRaw:mRaw, total:r2(M[0]+M[1]+M[2]), plug:plug };
  if(Math.abs(plug)>0.05) warn.push('The monthly liabilities computed from the checks add up to '+money(mRaw[0]+mRaw[1]+mRaw[2])+', not line 12 '+money(L.L12)+' — month 3 was adjusted by '+money(plug)+'. Check for missing withholding.');
  var semi=[]; if(L.L12*4>=50000) semi.push('This quarter’s tax ('+money(L.L12)+') × 4 is over $50,000. If the total of line 12 on the four 941s for the lookback period (July 1, '+(qi.year-2)+' – June 30, '+(qi.year-1)+') was more than $50,000, GrayCo is a SEMIWEEKLY depositor: check the third box and attach Schedule B instead of the monthly lines. The CRM cannot know the lookback — ask the CPA / check last year’s 941s.');
  M.forEach(function(v,i){ if(v>=100000) semi.push('Month '+(i+1)+' liability is '+money(v)+' — a $100,000 next-day deposit rule may have applied (Schedule B required).'); });
  p2.semi=semi;

  var tolL7=r2(0.01*T.checks+0.01);
  var _l7k=qi.year+'-Q'+qi.q, _l7ok=!!(set.f941L7Ok && set.f941L7Ok[_l7k]!=null && Math.abs(n2(set.f941L7Ok[_l7k])-L.L7)<0.005), l7Ask=false;   /* patch F941L7 */
  if(Math.abs(L.L7)>tolL7 && _l7ok) info.push('Line 7 is '+money(L.L7)+' — marked as rounding from salary and commission paid as separate checks. That is what line 7 is for.');
  if(Math.abs(L.L7)>tolL7 && !_l7ok && Math.abs(L.L7)<=1) l7Ask=true;
  if(Math.abs(L.L7)>tolL7 && !_l7ok) warn.push('Line 7 is '+money(L.L7)+' — more than fractions of cents ('+T.checks+' checks allow about ±'+money(tolL7)+'). The Social Security / Medicare actually withheld does not match the wages. Find the check that is wrong before filing.');
  if(Math.abs(r2(T.storedSSW)-L.L5a1)>0.01) warn.push('Social Security wages saved on the checks ('+money(T.storedSSW)+') differ from what the '+money(ssBase)+' wage base gives ('+money(L.L5a1)+'). The worksheet uses the wage-base figure; the checks may have over- or under-withheld.');
  var pf=Object.keys(pretaxFlag); if(pf.length) warn.push('Pre-tax deduction(s) that look like retirement ('+pf.join(', ')+'): a 401(k)/403(b) lowers line 2 but NOT Social Security/Medicare wages. The CRM payroll takes every pre-tax deduction out of SS/Medicare wages too, so lines 5a/5c (and the withholding) may be too low — ask the CPA.');
  if(excluded.length){ var e1=excluded.filter(function(x){return x.kind==='1099';}), ed=excluded.filter(function(x){return x.kind==='draw';});
    if(e1.length) info.push(e1.length+' payment(s) to 1099 contractors in this quarter ('+money(e1.reduce(function(a,x){return a+x.gross;},0))+') are left out — they go on a 1099-NEC, not Form 941.');
    if(ed.length) info.push(ed.length+' “Owner draw” line(s) with nothing withheld ('+money(ed.reduce(function(a,x){return a+x.gross;},0))+') are treated as owner draws, not wages, and left out.'); }
  var ownerW2=0; yearRuns.forEach(function(r){ var pd=s(r.payDate).slice(0,10); if(pd<qi.from||pd>qi.to) return;
    (r.lines||[]).forEach(function(Ln){ if(Ln && Ln.status!=='denied' && s(Ln.payType)==='owner_draw' && lineKind(Ln)==='w2') ownerW2++; }); });
  if(ownerW2) info.push(ownerW2+' “Owner draw” check(s) had taxes withheld, so they are counted as W-2 wages (an S-corp owner’s salary). If GrayCo is an LLC/partnership and these are draws, they do not belong on Form 941 — ask the CPA.');
  if(ssBase!==184500) info.push('Social Security wage base from ⚙ Payroll settings: '+money(ssBase)+' (the 2026 IRS figure is $184,500).');

  // FUTA / SUTA estimates
  var futa={ rate:futaRate, base:futaBase, quarterWages:r2(futaQ), quarterTax:r2(futaQ*futaRate), ytdWages:r2(futaYtd), ytdTax:r2(futaYtd*futaRate), stored:r2(T.futaStored) };
  var futaPaid=r2((opt.payments||[]).filter(function(x){ return x && payKind(x)==='futa' && s(x.date).slice(0,4)===yr && s(x.date).slice(0,10)<=qi.dueDate; }).reduce(function(a,x){return a+n2(x.amount);},0));
  futa.paidYtd=futaPaid; futa.undeposited=r2(Math.max(0, futa.ytdTax-futaPaid));
  futa.depositDue = qi.q<4 && futa.undeposited>500;
  futa.dueDate=qi.dueDate; futa.f940Due=nextBiz((qi.year+1)+'-01-31');
  var suta=Object.keys(sutaBy).sort().map(function(k){ var b=sutaBy[k];
    var rate = k==='TN' ? sutaRate : n2(((set.suta||{})[k]||{}).rate)||sutaRate;
    return { state:k, rate:rate, base:(k==='TN'?sutaBase:(n2(((set.suta||{})[k]||{}).base)||sutaBase)), wages:r2(b.wages), taxable:r2(b.taxable), excess:r2(b.excess), tax:r2(b.taxable*rate), stored:r2(b.stored),
      emps:Object.keys(b.emps).map(function(e){ var x=b.emps[e]; return { name:x.name, wages:r2(x.wages), taxable:r2(x.taxable) }; }) };
  });

  var emps=Object.keys(emp).map(function(k){ var e=emp[k]; ['wages','fed','ssW','medW','addlW','ee','storedSSW'].forEach(function(f){ e[f]=r2(e[f]); }); return e; });
  reg.sort(function(a,b){ return a.payDate<b.payDate?-1:a.payDate>b.payDate?1:(a.name<b.name?-1:1); });
  var RF=['hours','gross','preTax','wages','fed','ss','med','net'], regEmp={}, regTot={ name:'TOTAL', checks:0 };
  RF.forEach(function(f){ regTot[f]=0; });
  reg.forEach(function(x){ var e=regEmp[x.key]||(regEmp[x.key]={ name:x.name, checks:0 }); e.checks++; regTot.checks++;
    RF.forEach(function(f){ e[f]=(e[f]||0)+x[f]; regTot[f]+=x[f]; }); });
  var regEmps=Object.keys(regEmp).map(function(k){ var e=regEmp[k]; RF.forEach(function(f){ e[f]=r2(e[f]||0); }); return e; }).sort(function(a,b){ return a.name<b.name?-1:1; });
  RF.forEach(function(f){ regTot[f]=r2(regTot[f]); });
  var register={ rows:reg, emps:regEmps, total:regTot,
    check:{ wagesEqL2: Math.abs(regTot.wages-L.L2)<0.005, fedEqL3: Math.abs(regTot.fed-L.L3)<0.005,
      ssForm: r2(L.L5a1*0.062), medForm: r2(r2(L.L5c1*0.0145)+L.L5d2), ssDiff: r2(regTot.ss-r2(L.L5a1*0.062)), medDiff: r2(regTot.med-r2(r2(L.L5c1*0.0145)+L.L5d2)) } };
  return { register:register, quarter:qi, lines:L, emps:emps, runs:usedRuns, l1Runs:l1runs, excluded:excluded, deposits:deps, part2:p2,
    eeActual:eeActual, eeOnForm:eeOnForm, months:qi.months.map(function(m){ var o=month[m]; return { month:m, checks:o.checks, fed:r2(o.fed), ssW:r2(o.ssW), medW:r2(o.medW) }; }),
    futa:futa, suta:suta, erPaysEE:r2(T.erPaysEE), warnings:warn, info:info, ssBase:ssBase, checks:T.checks, nopayAsk:nopayAsk, payLaterAsk:(!_pl && !deps.some(function(d){return d.counted;}) && L.L12>0), l7Ask:l7Ask, l7:L.L7 };
}

/* the "Copy all numbers" text and the CSV, both from the same rows */
function rows(R){
  var L=R.lines, q=R.quarter, out=[];
  function a(line,label,val,note){ out.push([line,label,val,note||'']); }
  a('1',LINES.L1,String(L.L1),'pay period including '+q.day12);
  a('2',LINES.L2,L.L2.toFixed(2)); a('3',LINES.L3,L.L3.toFixed(2));
  a('4',LINES.L4,L.L4?'CHECK':'leave blank');
  a('5a col 1',LINES.L5a,L.L5a1.toFixed(2)); a('5a col 2','× 0.124',L.L5a2.toFixed(2));
  a('5b col 1',LINES.L5b,L.L5b1.toFixed(2)); a('5b col 2','× 0.124',L.L5b2.toFixed(2));
  a('5c col 1',LINES.L5c,L.L5c1.toFixed(2)); a('5c col 2','× 0.029',L.L5c2.toFixed(2));
  a('5d col 1',LINES.L5d,L.L5d1.toFixed(2)); a('5d col 2','× 0.009',L.L5d2.toFixed(2));
  a('5e',LINES.L5e,L.L5e.toFixed(2)); a('5f',LINES.L5f,L.L5f.toFixed(2));
  a('6',LINES.L6,L.L6.toFixed(2)); a('7',LINES.L7,L.L7.toFixed(2)); a('8',LINES.L8,L.L8.toFixed(2)); a('9',LINES.L9,L.L9.toFixed(2));
  a('10',LINES.L10,L.L10.toFixed(2)); a('11',LINES.L11,L.L11.toFixed(2)); a('12',LINES.L12,L.L12.toFixed(2));
  a('13',LINES.L13,L.L13.toFixed(2)); a('14',LINES.L14,L.L14.toFixed(2)); a('15',LINES.L15,L.L15.toFixed(2));
  if(R.part2.under2500) a('16','Line 12 is less than $2,500','check box 1','no monthly lines needed');
  else { a('16 M1',LINES.M1,R.part2.months[0].toFixed(2)); a('16 M2',LINES.M2,R.part2.months[1].toFixed(2)); a('16 M3',LINES.M3,R.part2.months[2].toFixed(2)); a('16 total',LINES.MT,R.part2.total.toFixed(2)); }
  a('FUTA','FUTA tax on this quarter’s wages (estimate)',R.futa.quarterTax.toFixed(2),'0.6% of first $7,000 per employee — check rates in ⚙ Payroll settings');
  R.suta.forEach(function(x){ a('SUTA '+x.state,x.state+' unemployment premium (estimate): total wages '+x.wages.toFixed(2)+', excess '+x.excess.toFixed(2)+', taxable '+x.taxable.toFixed(2),x.tax.toFixed(2),'rate '+(x.rate*100).toFixed(2)+'% — check rates in ⚙ Payroll settings'); });
  return out;
}
function copyText(R){
  var q=R.quarter;
  return 'Form 941 — Q'+q.q+' '+q.year+' ('+q.from+' to '+q.to+') — worked out by the GrayCo CRM from its payroll runs. Check before filing.\n'
    + rows(R).map(function(r){ return 'Line '+r[0]+' — '+r[1]+': '+r[2]+(r[3]?('  ('+r[3]+')'):''); }).join('\n')
    + (R.warnings.length?('\n\nWARNINGS:\n- '+R.warnings.join('\n- ')):'');
}
function regRows(R){
  var G=R.register, f=function(v){ return n2(v).toFixed(2); }, out=[['Pay date','Employee','Hours','Gross','Pre-tax deductions','Taxable wages (line 2)','Federal income tax','Social Security (6.2%)','Medicare (1.45% + additional)','Net pay','Paid how']];
  G.rows.forEach(function(x){ out.push([x.payDate,x.name,x.hours.toFixed(2),f(x.gross),f(x.preTax),f(x.wages),f(x.fed),f(x.ss),f(x.med),f(x.net),x.paid]); });
  G.emps.forEach(function(e){ out.push(['QUARTER TOTAL',e.name+' ('+e.checks+' checks)',e.hours.toFixed(2),f(e.gross),f(e.preTax),f(e.wages),f(e.fed),f(e.ss),f(e.med),f(e.net),'']); });
  var T=G.total; out.push(['GRAND TOTAL',T.checks+' checks',T.hours.toFixed(2),f(T.gross),f(T.preTax),f(T.wages),f(T.fed),f(T.ss),f(T.med),f(T.net),'']);
  out.push(['FORM','line 2 / line 3 / 6.2% of 5a / 1.45% of 5c + 5d','','','',f(R.lines.L2),f(R.lines.L3),f(G.check.ssForm),f(G.check.medForm),'','difference = line 7']);
  return out;
}
function csvLine(r){ return r.map(function(c){ return '"'+String(c==null?'':c).replace(/"/g,'""')+'"'; }).join(','); }
function csv(R){
  return [['Line','Form wording','Value','Note']].concat(rows(R)).map(csvLine).join('\r\n')
    + '\r\n\r\n' + csvLine(['PAYROLL REGISTER — Q'+R.quarter.q+' '+R.quarter.year+' (by pay date)']) + '\r\n' + regRows(R).map(csvLine).join('\r\n');
}

/* ── the filled IRS PDF (forms/f941-2026.pdf, the IRS fillable form). Field names read from the 2026 form. ── */
var PF='topmostSubform[0].Page1[0].', PH=PF+'Header[0].', PE=PH+'EntityArea[0].', P2='topmostSubform[0].Page2[0].';
var AMT = { L2:[13,14], L3:[15,16], L5a1:[17,18], L5a2:[19,20], L5b1:[21,22], L5b2:[23,24], L5c1:[25,26], L5c2:[27,28], L5d1:[29,30], L5d2:[31,32],
  L5e:[33,34], L5f:[35,36], L6:[37,38], L7:[39,40], L8:[41,42], L9:[43,44], L10:[45,46], L11:[47,48], L12:[49,50], L13:[51,52], L14:[53,54], L15:[55,56] };
function splitAmt(v){ var n=r2(v), neg=n<0, a=Math.abs(n), d=Math.floor(a+1e-9), c=Math.round((a-d)*100); if(c===100){ d++; c=0; }
  return [(neg?'-':'')+d.toLocaleString('en-US'), pad(c)]; }
function parseAddr(a){ // "123 Main St, Suite 4, Memphis, TN 38103" → street / city / state / zip
  var t=s(a).replace(/\s*\n\s*/g,', ').trim(), m=t.match(/^(.*?),\s*([^,]+?),?\s+([A-Z]{2})\.?\s+(\d{5}(?:-\d{4})?)\s*$/);
  return m ? { street:m[1].trim(), city:m[2].trim(), state:m[3], zip:m[4] } : { street:t, city:'', state:'', zip:'' };
}
function pdfFields(R, co){
  co=co||{}; var L=R.lines, f={ text:{}, check:[] }, ein=s(co.ein).replace(/\D/g,''), ad=parseAddr(co.addr);
  if(ein.length===9){ f.text[PE+'f1_1[0]']=ein.slice(0,2); f.text[PE+'f1_2[0]']=ein.slice(2); f.text[P2+'EIN_Number[0].f1_1[0]']=ein.slice(0,2); f.text[P2+'EIN_Number[0].f1_2[0]']=ein.slice(2); }
  if(co.name){ f.text[PE+'f1_3[0]']=s(co.name); f.text[P2+'Name_ReadOrder[0].f1_3[0]']=s(co.name); }
  if(co.trade) f.text[PE+'f1_4[0]']=s(co.trade);
  if(ad.street) f.text[PE+'f1_5[0]']=ad.street; if(ad.city) f.text[PE+'f1_6[0]']=ad.city; if(ad.state) f.text[PE+'f1_7[0]']=ad.state; if(ad.zip) f.text[PE+'f1_8[0]']=ad.zip;
  f.check.push(PH+'ReportForQuarter[0].c1_1['+(R.quarter.q-1)+']');
  f.text[PF+'f1_12[0]']=String(L.L1);
  var BLANK0={L5b1:1,L5b2:1,L5d1:1,L5d2:1,L5f:1,L7:1,L8:1,L9:1,L11:1,L14:1,L15:1};
  Object.keys(AMT).forEach(function(k){ var v=L[k]; if(v==null || (BLANK0[k] && r2(v)===0)) return; var p=splitAmt(v); f.text[PF+'f1_'+AMT[k][0]+'[0]']=p[0]; f.text[PF+'f1_'+AMT[k][1]+'[0]']=p[1]; });
  if(L.L4) f.check.push(PF+'c1_3[0]');
  if(L.L15>0) f.check.push(PF+'c1_4[0]');   // overpayment: "apply to next return" (change it on paper to ask for a refund)
  if(R.part2.under2500) f.check.push(P2+'c2_1[0]');
  else { f.check.push(P2+'c2_1[1]'); [0,1,2].forEach(function(i){ var p=splitAmt(R.part2.months[i]); f.text[P2+'f2_'+(2*i+1)+'[0]']=p[0]; f.text[P2+'f2_'+(2*i+2)+'[0]']=p[1]; });
    var t=splitAmt(R.part2.total); f.text[P2+'f2_7[0]']=t[0]; f.text[P2+'f2_8[0]']=t[1]; }
  return f;   // signature, date, phone, designee and PIN fields are left blank on purpose
}
async function fillPdf(PDFLib, bytes, fields){
  var doc=await PDFLib.PDFDocument.load(bytes, { ignoreEncryption:true, updateMetadata:false }), form=doc.getForm();
  try{ form.deleteXFA(); }catch(e){}
  Object.keys(fields.text).forEach(function(n){ try{ var tf=form.getTextField(n); var ml=tf.getMaxLength(); var v=fields.text[n]; if(ml && v.length>ml) v=v.slice(0,ml); tf.setText(v); }catch(e){ if(typeof console!=='undefined') console.warn('F941 pdf field', n, e && e.message); } });
  fields.check.forEach(function(n){ try{ form.getCheckBox(n).check(); }catch(e){ if(typeof console!=='undefined') console.warn('F941 pdf box', n, e && e.message); } });
  return await doc.save();
}

var F941 = { regRows:regRows, pdfFields:pdfFields, fillPdf:fillPdf, splitAmt:splitAmt, parseAddr:parseAddr, compute:compute, qInfo:qInfo, lastEndedQuarter:lastEndedQuarter, LINES:LINES, rows:rows, copyText:copyText, csv:csv, money:money };
W._gcF941 = F941;
if(typeof document==='undefined') return;

/* ── the page (Payroll → 🧾 Form 941) ─────────────────────────────────────── */
function esc(v){ return s(v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function P(){ return W.__GC_PAY || null; }
function canSee(){ try{ var p=P(); return !!(p && p.isAdmin && p.isAdmin()); }catch(e){ return false; } }
W._gcF941CanSee = canSee;
function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
var UI = { sel:null, dep:{}, last:null };
async function load(){
  var p=P(); var runs=[], pays=[], set={};
  try{ runs=await p.runs(); }catch(e){}
  try{ pays=W._gcPayrollTaxPayments ? await W._gcPayrollTaxPayments() : ((await p.get('payrollTaxPayments'))||[]); }catch(e){}
  try{ set=await p.settings(); }catch(e){}
  return { runs:Array.isArray(runs)?runs:[], pays:Array.isArray(pays)?pays:[], set:set||{} };
}
W._gcF941Load = load;
var RED='background:#fef2f2;border:2px solid #dc2626;color:#991b1b;border-radius:8px;padding:10px 12px;margin:0 0 8px;font-weight:700;font-size:13px;';
var CARD='background:#fff;border:1px solid #dde5ef;border-radius:10px;padding:14px 16px;margin-bottom:12px;';
var TD='padding:6px 8px;border-bottom:1px solid #eef2f7;font-size:13px;vertical-align:top;';
var BTN='padding:7px 12px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-weight:700;font-size:12px;margin-right:6px;';
function lineRow(no, label, val, how, strong){
  return '<tr data-f941-line="'+esc(no)+'"><td style="'+TD+'font-weight:800;white-space:nowrap;">'+esc(no)+'</td><td style="'+TD+'">'+esc(label)
    +(how?'<div style="font-size:11px;color:#64748b;margin-top:2px;">'+how+'</div>':'')+'</td><td style="'+TD+'text-align:right;font-family:ui-monospace,monospace;white-space:nowrap;'+(strong?'font-weight:800;font-size:15px;':'')+'">'+val+'</td></tr>';
}
async function render(body){
  if(!body) return;
  if(!canSee()){ body.innerHTML='<div style="'+CARD+'"><b>Form 941 is for admins / owners only.</b></div>'; return; }
  if(!UI.sel) UI.sel=lastEndedQuarter(todayStr());
  body.innerHTML='<div style="'+CARD+'">Loading payroll…</div>';
  var d=await load(), R;
  /* patch F941ACK: retire old unpaid drafts of people who have paid checks (copy kept), then reload */
  try{ if(W._gcPayReplace){ var _em={}; (d.runs||[]).forEach(function(r){ if(r && ['paid','approved'].indexOf(s(r.status))>=0) (r.lines||[]).forEach(function(L){ var k=String(L.empId||L.name||''); if(k) _em[k]={ empId:k, name:L.name }; }); });
    var _rp=await W._gcPayReplace(Object.keys(_em).map(function(k){ return _em[k]; })); if(_rp && _rp.changed) d=await load(); } }catch(_rpE){}
  try{ R=compute({ runs:d.runs, payments:d.pays, settings:d.set, year:UI.sel.year, q:UI.sel.q, depositSel:UI.dep }); }
  catch(e){ body.innerHTML='<div style="'+RED+'">The Form 941 worksheet could not be worked out: '+esc(e && e.message)+'</div>'; return; }
  UI.last=R; var L=R.lines, q=R.quarter, m=money;
  var opts=[]; var ty=+todayStr().slice(0,4); for(var y=ty; y>=ty-2; y--) for(var k=4;k>=1;k--) opts.push([y,k]);
  var runsList = R.runs.length ? R.runs.map(function(r){ return '<tr><td style="'+TD+'">'+esc(r.payDate)+'</td><td style="'+TD+'">'+esc(r.from)+' → '+esc(r.to)+'</td><td style="'+TD+'text-align:right">'+r.checks+(r.excluded?(' <span style="color:#b45309">(+'+r.excluded+' left out)</span>'):'')+'</td><td style="'+TD+'text-align:right">'+m(r.wages)+'</td><td style="'+TD+'text-align:right">'+m(r.fed)+'</td><td style="'+TD+'text-align:right">'+m(r.ee)+'</td><td style="'+TD+'font-size:11px;color:#94a3b8">'+esc(r.id)+(r.source==='paystub-entry'?' · from paystubs':'')+'</td></tr>'; }).join('')
    : '<tr><td colspan="7" style="'+TD+'color:#991b1b;font-weight:700">No approved payroll runs were paid in this quarter.</td></tr>';
  var depList = R.deposits.length ? R.deposits.map(function(x){ return '<tr><td style="'+TD+'"><input type="checkbox" data-f941-dep="'+esc(x.id)+'"'+(x.counted?' checked':'')+'></td><td style="'+TD+'">'+esc(x.date)+'</td><td style="'+TD+'text-align:right">'+m(x.amount)+'</td><td style="'+TD+'font-size:12px;color:#475569">'+esc(x.confirm||'')+' '+esc(x.note||'')+'<div style="font-size:11px;color:#94a3b8">'+(x.tagged?'marked for a quarter on the payment':(x.byRule?'counted by date (for this quarter’s months)':'not counted by date — probably the prior/next quarter'))+'</div></td></tr>'; }).join('')
    : '<tr><td colspan="4" style="'+TD+'color:#991b1b;font-weight:700">No 941 deposits recorded.</td></tr>';
  var p2 = R.part2.under2500
    ? '<div style="font-size:13px"><b>Line 12 is under $2,500</b> — check the FIRST box on line 16 (no monthly lines needed). You may pay the balance with the return.</div>'
    : '<table style="width:100%;border-collapse:collapse">'+lineRow('Month 1',MONTHS[+q.months[0].slice(5)-1]+' — liability by pay date',m(R.part2.months[0]),'')
      +lineRow('Month 2',MONTHS[+q.months[1].slice(5)-1],m(R.part2.months[1]),'')
      +lineRow('Month 3',MONTHS[+q.months[2].slice(5)-1],m(R.part2.months[2]),Math.abs(R.part2.plug)>0?('includes '+m(R.part2.plug)+' rounding so the total equals line 12'):'')
      +lineRow('Total','Total liability for quarter (must equal line 12)',m(R.part2.total),R.part2.total===L.L12?'✓ equals line 12':'<b style="color:#dc2626">does NOT equal line 12</b>',true)+'</table>'
      +'<div style="font-size:12px;color:#475569;margin-top:6px">For a monthly schedule depositor (check the SECOND box). Each month = federal withheld + Social Security & Medicare (both halves) on checks PAID that month.</div>';
  var semi = R.part2.semi.map(function(t){ return '<div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:7px;padding:8px 10px;margin-top:6px;font-size:12px;color:#92400e">⚠ '+esc(t)+'</div>'; }).join('');
  var futa=R.futa;
  body.innerHTML='<div data-f941="1">'
    + '<div style="'+CARD+'display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">'
      + '<div><div style="font-size:18px;font-weight:800">🧾 Form 941 worksheet — Q'+q.q+' '+q.year+'</div>'
      + '<div style="font-size:12px;color:#64748b">'+esc(q.from)+' to '+esc(q.to)+' · approved payroll runs by <b>pay date</b> (cash basis) · W-2 employees only · return due <b>'+esc(q.dueDate)+'</b>. Read-only: nothing is saved or sent.</div></div>'
      + '<div><select data-f941-q style="padding:6px;border-radius:6px;border:1px solid #cbd5e1">'+opts.map(function(o){ return '<option value="'+o[0]+'-'+o[1]+'"'+(o[0]===q.year&&o[1]===q.q?' selected':'')+'>Q'+o[1]+' '+o[0]+'</option>'; }).join('')+'</select> '
      + (W._gcPastPayOpen?'<button data-f941-past style="'+BTN+'">📥 Enter past payroll</button>':'')
      + '<button data-f941-pdf style="'+BTN+'">📄 Filled Form 941 (PDF)</button><button data-f941-copy style="'+BTN+'">📋 Copy all numbers</button><button data-f941-csv style="'+BTN+'">⬇ Download CSV</button></div></div>'
    + R.warnings.map(function(w){ return '<div data-f941-warn="1" style="'+RED+'">⚠ '+esc(w)+'</div>'; }).join('')
    + ((R.nopayAsk&&R.nopayAsk.length)||R.payLaterAsk||R.l7Ask ? ('<div style="display:flex;gap:8px;flex-wrap:wrap;margin:-2px 0 10px">'   /* patch F941ACK */
      + (R.nopayAsk||[]).map(function(mk){ return '<button data-f941-nopay="'+esc(mk)+'" style="'+BTN+'">✓ Nobody was paid in '+esc(MONTHS[+mk.slice(5,7)-1])+'</button>'; }).join('')
      + (R.payLaterAsk?'<button data-f941-paylater="1" style="'+BTN+'">✓ No deposits were made — we’re paying the balance now</button>':'')
      + (R.l7Ask?'<button data-f941-l7ok="1" style="'+BTN+'">✓ Line 7 is rounding from separate checks — file it</button>':'')+'</div>') : '')
    + R.info.map(function(w){ return '<div style="background:#eff6ff;border:1px solid #93c5fd;color:#1e3a8a;border-radius:8px;padding:8px 12px;margin:0 0 8px;font-size:12px">ℹ '+esc(w)+'</div>'; }).join('')
    + '<div style="'+CARD+'"><div style="font-weight:800;margin-bottom:6px">Part 1</div><table style="width:100%;border-collapse:collapse">'
      + lineRow('1',LINES.L1,String(L.L1),'Distinct W-2 employees on approved runs whose pay period includes '+esc(q.day12)+(R.l1Runs.length?(' (run '+esc(R.l1Runs.join(', '))+')'):''))
      + lineRow('2',LINES.L2,m(L.L2),'Gross pay minus pre-tax deductions (the “taxable” figure on each check), all W-2 checks paid in the quarter. Reimbursements are not wages. 1099 contractors left out.')
      + lineRow('3',LINES.L3,m(L.L3),'Federal income tax withheld on those checks.')
      + lineRow('4',LINES.L4,L.L4?'CHECK':'leave blank','')
      + lineRow('5a',LINES.L5a+' — column 1',m(L.L5a1),'Social Security wages per employee, stopping at the '+m(R.ssBase)+' wage base (counted year-to-date from Jan 1 by pay date).')
      + lineRow('5a','× 0.124 = column 2',m(L.L5a2),'')
      + lineRow('5b',LINES.L5b,m(0),'The CRM has no tips — 0.')
      + lineRow('5c',LINES.L5c+' — column 1',m(L.L5c1),'All Medicare wages (no cap).')
      + lineRow('5c','× 0.029 = column 2',m(L.L5c2),'')
      + lineRow('5d',LINES.L5d+' — column 1',m(L.L5d1),'Each employee’s wages above $200,000 year-to-date.')
      + lineRow('5d','× 0.009 = column 2',m(L.L5d2),'')
      + lineRow('5e',LINES.L5e,m(L.L5e),'5a + 5b + 5c + 5d, column 2.')
      + lineRow('5f',LINES.L5f,m(0),'Only if the IRS sent a Section 3121(q) notice.')
      + lineRow('6',LINES.L6,m(L.L6),'Line 3 + 5e + 5f.',true)
      + lineRow('7',LINES.L7,m(L.L7),'Employee Social Security + Medicare actually withheld ('+m(R.eeActual)+') minus the employee half the form works out ('+m(R.eeOnForm)+' = 6.2% of 5a + 1.45% of 5c + 5d col 2).')
      + lineRow('8',LINES.L8,m(0),'The CRM has no third-party sick pay — 0.')
      + lineRow('9',LINES.L9,m(0),'The CRM has no tips or group-term life insurance — 0.')
      + lineRow('10',LINES.L10,m(L.L10),'Lines 6 through 9.',true)
      + lineRow('11',LINES.L11,m(0),'No research credit (Form 8974) — 0.')
      + lineRow('12',LINES.L12,m(L.L12),'Line 10 − line 11.',true)
      + lineRow('13',LINES.L13,m(L.L13),'Checked “Federal 941 deposit” payments below. Add any overpayment applied from a prior quarter by hand.')
      + lineRow('14',LINES.L14,m(L.L14),L.L14>0?'Pay through EFTPS (or with Form 941-V). Under $1 need not be paid.':'',true)
      + lineRow('15',LINES.L15,m(L.L15),L.L15>0?'Choose “apply to next return” or “send a refund”.':'',true)
    + '</table></div>'
    + '<div style="'+CARD+'"><div style="font-weight:800;margin-bottom:6px">Part 2 — line 16, deposit schedule and tax liability</div>'+p2+semi+'</div>'
    + '<div style="'+CARD+'"><div style="font-weight:800;margin-bottom:6px">Deposits (Form 941 type) — tick the ones made for this quarter</div>'
      + '<div style="font-size:12px;color:#64748b;margin-bottom:6px">By date, a deposit counts if it was made '+esc(q.depFrom)+' – '+esc(q.depTo)+' (a monthly depositor pays each month by the 15th of the next). Ticking only changes this screen.</div>'
      + '<table style="width:100%;border-collapse:collapse">'+depList+'</table></div>'
    + '<div style="'+CARD+'"><div style="font-weight:800;margin-bottom:6px">Payroll runs used</div><table style="width:100%;border-collapse:collapse"><tr style="font-size:11px;color:#64748b"><td style="'+TD+'">Pay date</td><td style="'+TD+'">Period</td><td style="'+TD+'text-align:right">Checks</td><td style="'+TD+'text-align:right">Wages</td><td style="'+TD+'text-align:right">Fed w/h</td><td style="'+TD+'text-align:right">EE SS+Med</td><td style="'+TD+'"></td></tr>'+runsList+'</table></div>'
    + regHtml(R)
    + '<div style="'+CARD+'"><div style="font-weight:800;margin-bottom:2px">Unemployment — <span style="color:#b45309">estimate, check rates in ⚙ Payroll settings</span></div>'
      + '<table style="width:100%;border-collapse:collapse">'
      + lineRow('FUTA','FUTA wages this quarter (first '+m(futa.base)+' per employee per year)',m(futa.quarterWages),'')
      + lineRow('FUTA','FUTA tax on this quarter ('+(futa.rate*100).toFixed(2)+'%)',m(futa.quarterTax),'On the checks: '+m(futa.stored)+'.')
      + lineRow('FUTA','Year-to-date FUTA (Form 940, due '+esc(futa.f940Due)+')',m(futa.ytdTax),'FUTA deposits recorded this year: '+m(futa.paidYtd)+'. Not yet deposited: '+m(futa.undeposited)+'.')
      + lineRow('FUTA','Quarterly FUTA deposit',futa.depositDue?('<b style="color:#dc2626">DUE '+esc(futa.dueDate)+'</b>'):'not required','A deposit is required when undeposited FUTA is more than $500; otherwise it carries to the next quarter.')
      + R.suta.map(function(x){ return lineRow('SUTA '+x.state, x.state+' unemployment — total wages / excess over the '+m(x.base)+' base / taxable', m(x.wages)+' / '+m(x.excess)+' / '+m(x.taxable), x.emps.length+' employee(s)')
          + lineRow('SUTA '+x.state, x.state+' premium at '+(x.rate*100).toFixed(2)+'%', m(x.tax), 'On the checks: '+m(x.stored)+'.'+(x.state==='TN'?' Filed quarterly on TNTAP.':'')); }).join('')
      + '</table></div>'
    + '<div style="font-size:11px;color:#94a3b8;margin:4px 2px 20px">The CRM does not e-file and does not send anything to the IRS. Compare with your payroll provider / EFTPS before filing.</div>'
    + '</div>';
  var qs=body.querySelector('[data-f941-q]'); if(qs) qs.onchange=function(){ var v=qs.value.split('-'); UI.sel={year:+v[0],q:+v[1]}; UI.dep={}; render(body); };
  Array.prototype.forEach.call(body.querySelectorAll('[data-f941-dep]'),function(c){ c.onchange=function(){ UI.dep[c.getAttribute('data-f941-dep')]=c.checked; render(body); }; });
  var ppb=body.querySelector('[data-f941-past]'); if(ppb) ppb.onclick=function(){ W._gcPastPayOpen(); };
  /* patch F941ACK: the two acknowledgements, saved in payroll settings */
  async function _ack(fn){ try{ var p=P(), st=(await p.settings())||{}; fn(st); await p.saveSettings(st); }catch(e){ alert('Could not save: '+(e&&e.message)); return; } render(body); }
  Array.prototype.forEach.call(body.querySelectorAll('[data-f941-nopay]'), function(b){ b.onclick=function(){ var mk=b.getAttribute('data-f941-nopay'); if(!confirm('Nobody at all was paid wages in '+MONTHS[+mk.slice(5,7)-1]+' '+mk.slice(0,4)+'?')) return; _ack(function(st){ var a=Array.isArray(st.f941NoPayMonths)?st.f941NoPayMonths:[]; if(a.indexOf(mk)<0) a.push(mk); st.f941NoPayMonths=a; }); }; });
  var l7b=body.querySelector('[data-f941-l7ok]'); if(l7b) l7b.onclick=function(){ var v=UI.last&&UI.last.l7; if(!confirm('Every check is entered exactly as paid, and Line 7 ('+money(v)+') is just the cents from checks paid separately?')) return; _ack(function(st){ st.f941L7Ok=Object.assign({}, st.f941L7Ok||{}); st.f941L7Ok[UI.sel.year+'-Q'+UI.sel.q]=v; }); };   /* patch F941L7 */
  var plb=body.querySelector('[data-f941-paylater]'); if(plb) plb.onclick=function(){ if(!confirm('No 941 deposits were made for Q'+UI.sel.q+' '+UI.sel.year+', and you are paying the balance now?')) return; _ack(function(st){ st.f941PayLater=Object.assign({}, st.f941PayLater||{}); st.f941PayLater[UI.sel.year+'-Q'+UI.sel.q]=new Date().toISOString(); }); };
  var pb=body.querySelector('[data-f941-pdf]'); if(pb) pb.onclick=function(){ downloadPdf(R, d.set, pb); };
  var cb=body.querySelector('[data-f941-copy]'); if(cb) cb.onclick=function(){ var t=copyText(R);
    var done=function(){ cb.textContent='✓ Copied'; setTimeout(function(){ cb.textContent='📋 Copy all numbers'; },1800); };
    try{ navigator.clipboard.writeText(t).then(done,function(){ fallback(t); done(); }); }catch(e){ fallback(t); done(); } };
  var cv=body.querySelector('[data-f941-csv]'); if(cv) cv.onclick=function(){
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv(R)],{type:'text/csv'})); a.download='Form941_Q'+q.q+'_'+q.year+'.csv';
    document.body.appendChild(a); a.click(); setTimeout(function(){ try{ URL.revokeObjectURL(a.href); a.remove(); }catch(e){} },500); };
}
function regHtml(R){
  var G=R.register, m=money, th='padding:5px 6px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;text-align:right;white-space:nowrap', td='padding:4px 6px;border-bottom:1px solid #eef2f7;font-size:12px;text-align:right;white-space:nowrap';
  var cols=function(x){ return '<td style="'+td+'">'+x.hours.toFixed(2)+'</td><td style="'+td+'">'+m(x.gross)+'</td><td style="'+td+'">'+m(x.preTax)+'</td><td style="'+td+'">'+m(x.wages)+'</td><td style="'+td+'">'+m(x.fed)+'</td><td style="'+td+'">'+m(x.ss)+'</td><td style="'+td+'">'+m(x.med)+'</td><td style="'+td+'">'+m(x.net)+'</td>'; };
  var ok=function(b){ return b?'<span style="color:#16a34a">✓</span>':'<b style="color:#dc2626">✗</b>'; };
  return '<div style="'+CARD+'" data-f941-register="1"><div style="font-weight:800;margin-bottom:2px">Payroll register — each pay date × each employee</div>'
    + '<div style="font-size:12px;color:#64748b;margin-bottom:6px">Compare with the pay stubs and the bank statement. W-2 employees only (1099 / owner draws left out). Medicare includes any Additional Medicare.</div>'
    + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:860px"><tr><th style="'+th+';text-align:left">Pay date</th><th style="'+th+';text-align:left">Employee</th><th style="'+th+'">Hours</th><th style="'+th+'">Gross</th><th style="'+th+'">Pre-tax</th><th style="'+th+'">Taxable wages</th><th style="'+th+'">Federal w/h</th><th style="'+th+'">Soc. Sec. 6.2%</th><th style="'+th+'">Medicare 1.45%</th><th style="'+th+'">Net pay</th><th style="'+th+';text-align:left">Paid how</th></tr>'
    + (G.rows.length ? G.rows.map(function(x){ return '<tr data-f941-reg-row="1"><td style="'+td+';text-align:left">'+esc(x.payDate)+'</td><td style="'+td+';text-align:left">'+esc(x.name)+'</td>'+cols(x)+'<td style="'+td+';text-align:left;color:#475569">'+esc(x.paid)+'</td></tr>'; }).join('')
       : '<tr><td colspan="11" style="'+td+';text-align:left;color:#991b1b;font-weight:700">No W-2 paychecks in this quarter.</td></tr>')
    + G.emps.map(function(e){ return '<tr style="background:#f8fafc;font-weight:700"><td style="'+td+';text-align:left">Quarter total</td><td style="'+td+';text-align:left">'+esc(e.name)+' ('+e.checks+')</td>'+cols(e)+'<td style="'+td+'"></td></tr>'; }).join('')
    + '<tr data-f941-reg-total="1" style="background:#eef2ff;font-weight:800"><td style="'+td+';text-align:left">GRAND TOTAL</td><td style="'+td+';text-align:left">'+G.total.checks+' checks</td>'+cols(G.total)+'<td style="'+td+'"></td></tr>'
    + '<tr style="font-size:11px;color:#475569"><td colspan="5" style="'+td+';text-align:left">On the form</td><td style="'+td+'">L2 '+m(R.lines.L2)+' '+ok(G.check.wagesEqL2)+'</td><td style="'+td+'">L3 '+m(R.lines.L3)+' '+ok(G.check.fedEqL3)+'</td><td style="'+td+'">6.2% × 5a '+m(G.check.ssForm)+'</td><td style="'+td+'">1.45% × 5c + 5d '+m(G.check.medForm)+'</td><td colspan="2" style="'+td+';text-align:left">difference '+m(r2(G.check.ssDiff+G.check.medDiff))+' = line 7</td></tr>'
    + '</table></div></div>';
}
function fallback(t){ try{ var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }catch(e){} }
W._gcF941Render = render;
W._gcF941Open = function(year, q){
  if(year && q) { UI.sel={year:+year,q:+q}; UI.dep={}; }
  if(W._gcOpenPayrollTab) W._gcOpenPayrollTab('f941');
};
/* ── 📄 Filled Form 941 (PDF): the IRS form in the repo (forms/f941-2026.pdf) filled with pdf-lib (cdnjs) ── */
var PDFLIB_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', FORM_URL='forms/f941-2026.pdf';
function loadPdfLib(){
  if(W.PDFLib && W.PDFLib.PDFDocument) return Promise.resolve(W.PDFLib);
  if(UI.libP) return UI.libP;
  UI.libP=new Promise(function(ok, no){ var sc=document.createElement('script'); sc.src=PDFLIB_URL; sc.async=true;
    sc.onload=function(){ W.PDFLib ? ok(W.PDFLib) : no(new Error('pdf-lib did not load')); };
    sc.onerror=function(){ UI.libP=null; no(new Error('could not load pdf-lib from cdnjs')); }; document.head.appendChild(sc); });
  return UI.libP;
}
async function company(set){ set=set||{}; return { name:s(set.companyName), addr:s(set.companyAddr), ein:s(set.ein), trade:s(set.tradeName) }; }
async function pdfBlob(R, set){
  var lib=await loadPdfLib();
  var res=await fetch(FORM_URL, { cache:'force-cache' }); if(!res.ok) throw new Error('the blank Form 941 ('+FORM_URL+') could not be read: '+res.status);
  var out=await fillPdf(lib, await res.arrayBuffer(), pdfFields(R, await company(set)));
  return new Blob([out], { type:'application/pdf' });
}
async function downloadPdf(R, set, btn){
  var old=btn&&btn.textContent; if(btn){ btn.disabled=true; btn.textContent='Filling…'; }
  try{
    var b=await pdfBlob(R, set), a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='Form941_Q'+R.quarter.q+'_'+R.quarter.year+'_DRAFT.pdf';
    document.body.appendChild(a); a.click(); setTimeout(function(){ try{ URL.revokeObjectURL(a.href); a.remove(); }catch(e){} }, 1500);
    var miss=[]; if(!s(set&&set.ein)) miss.push('EIN'); if(!s(set&&set.companyName)) miss.push('company name'); if(!parseAddr(set&&set.companyAddr).zip) miss.push('address (street, city, ST ZIP)');
    if(miss.length) alert('The PDF was made, but the '+miss.join(', ')+' is missing in Payroll → Settings — write it on the form by hand.');
  }catch(e){ alert('The filled PDF could not be made: '+(e && e.message)+'\nThe numbers on the worksheet are still right — copy them onto the form.'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent=old; } }
}
W._gcF941Pdf = async function(year, q){ var d=await load(); var R=compute({ runs:d.runs, payments:d.pays, settings:d.set, year:year, q:q }); return pdfBlob(R, d.set); };

/* ── the quarterly approval (owner, 11/02: "filed for us automatically every quarter, with approval in Admin") ──
   After a quarter ends, the first admin / owner computer that has the CRM open puts ONE record per quarter on
   gc_payroll_approvals (an admin-only payroll key that syncs by id): { id:'f941_2026_Q3', kind:'f941', status:
   'waiting' → 'approved' → 'filed', numbers, warnings }. It shows on ✅ Approvals (Other approvals) for admins.
   Approve = "approved, ready to file" + the filing steps; Mark filed = the date. NOTHING is sent to the IRS. */
var AK='gc_payroll_approvals';
function readA(){ var v=null; try{ v=JSON.parse(localStorage.getItem(AK)||'[]'); }catch(e){} return Array.isArray(v)?v.filter(function(x){ return x && typeof x==='object'; }):[]; }
function writeA(list){ try{ localStorage.setItem(AK, JSON.stringify(list)); }catch(e){}
  try{ if(W.idbSet) W.idbSet(AK, list); }catch(e){} try{ if(W._supaUpsert) W._supaUpsert(AK, list); }catch(e){}
  try{ if(W._gcApprovalSetFresh) W._gcApprovalSetFresh(); }catch(e){} }
function qid(y,q){ return 'f941_'+y+'_Q'+q; }
function snap(R){ var L=R.lines; return { L1:L.L1, L2:L.L2, L3:L.L3, L5e:L.L5e, L7:L.L7, L12:L.L12, L13:L.L13, L14:L.L14, L15:L.L15, months:R.part2.months.slice(), under2500:R.part2.under2500, warnings:R.warnings.slice(0,12), runs:R.runs.length }; }
function autoOn(){ try{ if(typeof W._gcAutoOn==='function'){ var v=W._gcAutoOn('f941_quarter_prep'); return Promise.resolve(v).then(function(x){ return x!==false; }); } }catch(e){} return Promise.resolve(true); }
function canFile(){ try{ var p=P(); return !!(p && ((p.isAdmin && p.isAdmin()) || (p.isOffice && p.isOffice()))); }catch(e){ return false; } }
W._gcF941CanFile = canFile;
var ensuring=false;
async function ensureQuarter(force){
  if(ensuring || !canFile()) return null; ensuring=true;
  try{
    if(!(await autoOn())) return null;
    var lq=lastEndedQuarter(todayStr()), id=qid(lq.year, lq.q), list=readA();
    var have=list.filter(function(x){ return x.id===id; })[0];
    if(have) return have;
    var d=await load();
    if(!force && !d.runs.length && (Date.now()-UI.boot)<180000) return null;   // payroll not on this computer yet: wait for the sync
    var R=compute({ runs:d.runs, payments:d.pays, settings:d.set, year:lq.year, q:lq.q });
    var now=new Date().toISOString(), meN=''; try{ meN=P().me(); }catch(e){}
    list=readA(); if(list.some(function(x){ return x.id===id; })) return null;
    var rec={ id:id, kind:'f941', year:lq.year, q:lq.q, status:'waiting', due:R.quarter.dueDate, createdAt:now, createdBy:meN||'CRM', updatedAt:now, at:now, numbers:snap(R) };
    list.push(rec); writeA(list); return rec;
  }catch(e){ try{ console.warn('F941 quarter prep', e); }catch(_e){} return null; }
  finally{ ensuring=false; }
}
W._gcF941Ensure = ensureQuarter;
async function setRec(id, patch){
  var list=readA(), r=list.filter(function(x){ return x.id===id; })[0]; if(!r) return null;
  Object.assign(r, patch, { updatedAt:new Date().toISOString(), at:new Date().toISOString() }); writeA(list); return r;
}
function items(){
  if(!canFile()) return [];
  return readA().filter(function(x){ return x.kind==='f941' && (x.status==='waiting' || x.status==='approved'); }).map(function(x){
    var n=x.numbers||{}, w=(n.warnings||[]).length;
    return { id:'f941:'+x.id, at:s(x.createdAt), urgency:'asap',
      title: x.status==='waiting' ? ('🧾 Form 941 for Q'+x.q+' '+x.year+(canSee()?' is ready: review and approve':' is ready to file')) : ('🧾 Form 941 for Q'+x.q+' '+x.year+': approved, ready to file — mark it filed'),
      sub: 'L2 '+money(n.L2)+' · L3 '+money(n.L3)+' · L12 '+money(n.L12)+' · L13 '+money(n.L13)+' · L14 '+money(n.L14)+(w?(' · ⚠ '+w+' warning'+(w>1?'s':'')):'')+' · due '+s(x.due),
      act:{ l:'🧾 Review', f:function(){ openCard(x.id); } } };
  });
}
function hookApprovals(){
  var prev=W._gcHot1Approvals; if(prev && prev.__gcF941) return;
  var w=function(){ var base=[]; try{ base = typeof prev==='function' ? (prev.apply(this, arguments)||[]) : []; }catch(e){} try{ return (Array.isArray(base)?base:[]).concat(items()); }catch(e){ return base; } };
  try{ if(prev) Object.keys(prev).forEach(function(k){ w[k]=prev[k]; }); }catch(e){}
  w.__gcF941=true; W._gcHot1Approvals=w;
}
W._gcF941Items = items;
function steps(rec, n){ return '<ol style="margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.55">'
  +'<li>Check the numbers (and any red warning above) against EFTPS — line 13 is the deposits.</li>'
  +'<li><b>E-file</b> it through the e-file service (IRS-authorized e-file software / payroll provider): use <b>📋 Copy all numbers</b> or the filled PDF. <b>Or mail</b> the filled PDF, signed and dated by an owner, <b>postmarked by '+esc(rec.due||'')+'</b>, to the address for Tennessee in the Form 941 instructions (“Where Should You File?” — one address without a payment, another with one): <a href="https://www.irs.gov/filing/where-to-file-tax-returns-addresses-for-form-941" target="_blank" rel="noopener">irs.gov — where to file Form 941</a>.</li>'
  +'<li>'+(n && n.L14>0 ? ('Pay the balance due, <b>'+money(n.L14)+'</b>,') : 'If there is a balance due (line 14), pay it')+' through <b>EFTPS</b>: tax type <b>941</b>, quarter <b>Q'+rec.q+' '+rec.year+'</b>.</li>'
  +'<li>Press <b>📮 Mark filed</b> below with the date and the confirmation number.</li></ol>'; }
async function openCard(id){
  var rec=readA().filter(function(x){ return x.id===id; })[0]; if(!rec || !canFile()) return;
  var old=document.getElementById('_gcF941Card'); if(old) old.remove();
  var ov=document.createElement('div'); ov.id='_gcF941Card'; ov.setAttribute('data-gc-keep','1');
  ov.style.cssText='position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;';
  ov.innerHTML='<div style="background:#fff;color:#0f2440;border-radius:12px;max-width:720px;width:100%;padding:16px 18px;font-size:14px"><div>Loading…</div></div>';
  document.body.appendChild(ov);
  var d=await load(), R=compute({ runs:d.runs, payments:d.pays, settings:d.set, year:rec.year, q:rec.q });
  if(rec.status==='waiting'){ rec=await setRec(id, { numbers:snap(R) }) || rec; }
  var adm=canSee();
  var n=rec.status==='waiting' ? snap(R) : (rec.numbers||snap(R)), L=R.lines, card=ov.firstElementChild;
  var changed = rec.status!=='waiting' && Math.abs(n.L12-L.L12)>=0.01;
  card.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div style="font-size:18px;font-weight:800">🧾 Form 941 — Q'+rec.q+' '+rec.year+'</div><button data-x style="'+BTN+'">✕ Close</button></div>'
    +'<div style="font-size:12px;color:#64748b;margin:2px 0 10px">Status: <b>'+(rec.status==='waiting'?'ready to file (an owner’s approval is optional)':rec.status==='approved'?('approved, ready to file — by '+esc(rec.approvedBy||'')+' '+esc(s(rec.approvedAt).slice(0,10))):('filed '+esc(rec.filedOn||'')+(rec.confirm?(' · confirmation '+esc(rec.confirm)):'')+(rec.filedBy?(' by '+esc(rec.filedBy)):'')))+'</b> · due <b>'+esc(rec.due||'')+'</b> (last day of the month after the quarter; a weekend moves it to Monday)'+' · nothing is sent to the IRS by the CRM</div>'
    +(changed?'<div style="'+RED+'">⚠ The payroll data changed since this was approved: line 12 is now '+money(L.L12)+' (approved: '+money(n.L12)+'). Re-check before filing.</div>':'')
    +(n.warnings||[]).map(function(w){ return '<div style="'+RED+'">⚠ '+esc(w)+'</div>'; }).join('')
    +'<table style="width:100%;border-collapse:collapse">'
    +[['1','Employees (pay period incl. the 12th)',String(n.L1)],['2','Wages, tips, other compensation',money(n.L2)],['3','Federal income tax withheld',money(n.L3)],['5e','Social Security + Medicare',money(n.L5e)],['7','Fractions of cents',money(n.L7)],['12','Total taxes after adjustments',money(n.L12)],['13','Deposits for the quarter',money(n.L13)],['14','Balance due',money(n.L14)],['15','Overpayment',money(n.L15)]]
      .map(function(r){ return '<tr><td style="'+TD+'font-weight:800">'+r[0]+'</td><td style="'+TD+'">'+r[1]+'</td><td style="'+TD+'text-align:right;font-family:ui-monospace,monospace">'+r[2]+'</td></tr>'; }).join('')
    +'</table>'
    +'<div style="margin:12px 0;display:flex;flex-wrap:wrap;gap:6px"><button data-pdf style="'+BTN+'">📄 Filled Form 941 (PDF)</button><button data-copy style="'+BTN+'">📋 Copy all numbers</button><button data-csv style="'+BTN+'">⬇ CSV</button>'+(adm?'<button data-ws style="'+BTN+'">Open the worksheet</button>':'')+'</div>'
    +(rec.status==='waiting' && adm?'<button data-ok style="'+BTN+'background:#16a34a;color:#fff;border-color:#16a34a">✅ Approve — ready to file</button> <span style="font-size:12px;color:#64748b">(optional — the office can file without it)</span>':'')
    +(rec.status!=='filed'?'<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 12px;margin-top:10px"><b>How to file</b>'+steps(rec, rec.status==='waiting'?snap(R):n)+'</div>':'')
    +(rec.status!=='filed'?'<div style="margin-top:10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">Filed on <input type="date" data-fd value="'+esc(todayStr())+'" style="padding:5px;border:1px solid #cbd5e1;border-radius:6px"> Confirmation # <input data-fc placeholder="e-file / EFTPS / mailed" style="padding:5px;border:1px solid #cbd5e1;border-radius:6px;width:170px"> <button data-filed style="'+BTN+'">📮 Mark filed</button></div>':'');
  card.querySelector('[data-x]').onclick=function(){ ov.remove(); };
  card.querySelector('[data-pdf]').onclick=function(){ downloadPdf(R, d.set, this); };
  var wsb=card.querySelector('[data-ws]'); if(wsb) wsb.onclick=function(){ ov.remove(); W._gcF941Open(rec.year, rec.q); };
  var cpb=card.querySelector('[data-copy]'); cpb.onclick=function(){ var tx=copyText(R); var done=function(){ cpb.textContent='✓ Copied'; };
    try{ navigator.clipboard.writeText(tx).then(done,function(){ fallback(tx); done(); }); }catch(e){ fallback(tx); done(); } };
  card.querySelector('[data-csv]').onclick=function(){ var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv(R)],{type:'text/csv'})); a.download='Form941_Q'+rec.q+'_'+rec.year+'.csv'; document.body.appendChild(a); a.click(); setTimeout(function(){ try{ a.remove(); }catch(e){} },500); };
  var okb=card.querySelector('[data-ok]'); if(okb) okb.onclick=async function(){ var me=''; try{ me=P().me(); }catch(e){}
    await setRec(id, { status:'approved', approvedBy:me, approvedAt:new Date().toISOString(), numbers:snap(R) }); openCard(id); };
  var fb=card.querySelector('[data-filed]'); if(fb) fb.onclick=async function(){ var dt=card.querySelector('[data-fd]').value; if(!/^\d{4}-\d{2}-\d{2}$/.test(dt)){ alert('Pick the date it was filed.'); return; }
    var cf=s(card.querySelector('[data-fc]').value).trim(); if(!cf && !confirm('No confirmation number — mark it filed anyway?')) return;
    var me=''; try{ me=P().me(); }catch(e){} await setRec(id, { status:'filed', filedOn:dt, confirm:cf, filedBy:me, numbersFiled:snap(R) }); openCard(id); };
}
W._gcF941OpenCard = openCard;
UI.boot=Date.now();
hookApprovals(); setTimeout(hookApprovals, 4000); setInterval(hookApprovals, 15000);
setTimeout(function(){ ensureQuarter(); }, 20000); setInterval(function(){ ensureQuarter(); }, 10*60*1000);

})(window);
</script>
