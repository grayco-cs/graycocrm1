<script>
/* __GC_PASTPAY__ — 📥 Enter past payroll (from paystubs)  (patch PASTPAY, owner 11/02: "I will manually enter each
   employee's pay per week and it should create the info for me").
   One row per employee per payday: pay date, period, employee, hours, gross, commission (added into gross). The CRM
   fills in Social Security 6.2 %, Medicare 1.45 % (+0.9 % over $200k), federal income tax from the employee's W-4
   (the payroll engine's own Pub 15-T calc, weekly), employer SS / Medicare, FUTA, SUTA and net — every figure can be
   changed. Per row: "Federal tax actually withheld: as calculated / amount on the check stub / none withheld", and the
   same for Social Security + Medicare. "Save all" writes PAID runs exactly as shown, tagged source:'paystub-entry',
   with NO side effects: no checks to write (paidOut + check #), no approval alerts (status paid), no books / journal
   rows (WAGESBOOKS skips noBooks runs — the wages are already in QuickBooks), no e-mails, texts or To-Dos.
   The 🧾 Form 941 worksheet reads them like any other paid run. */
(function(W){
'use strict';
if(W.__GC_PASTPAY__) return; W.__GC_PASTPAY__ = true;
function n2(v){ var x=parseFloat(String(v==null?'':v).replace(/[$,\s]/g,'')); return isFinite(x)?x:0; }
function r2(v){ var n=n2(v); return Math.round((n+(n>=0?1e-9:-1e-9))*100)/100; }
function s(v){ return v==null?'':String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function pad(n){ return String(n).padStart(2,'0'); }
function addDays(ds,n){ var d=new Date(s(ds).slice(0,10)+'T12:00:00'); if(isNaN(d)) return ''; d.setDate(d.getDate()+n); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function money(v){ var n=r2(v); return (n<0?'-$':'$')+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
var MODES={ calc:'as calculated', stub:'amount on the check stub', none:'none withheld' };

/* ── the pure core: fill in every figure of every row (rows in any order; YTD by pay date) ──
   row: { payDate, from, to, name, empKey, hours, gross, comm, fedMode, fed (stub), fedCalc (from the W-4 calc, or
          null), ficaMode, ss, med (stub), other, net, netTyped, checkNo }
   ctx: { set, ytdBase(empKey, payDate) → { ss, med, futa, suta } from the runs already saved } */
function calc(rows, ctx){
  ctx=ctx||{}; var set=ctx.set||{};
  var ssBase=n2(set.ssWageBase)||184500, thr=n2(set.addlMedThreshold)||200000,
      futaRate=set.futaRate!=null?n2(set.futaRate):0.006, futaBase=n2(set.futaWageBase)||7000,
      sutaRate=set.sutaRate!=null?n2(set.sutaRate):0.027, sutaBase=n2(set.sutaWageBase)||7000;
  var order=rows.map(function(r,i){ return i; }).sort(function(a,b){ var x=s(rows[a].payDate), y=s(rows[b].payDate); return x<y?-1:x>y?1:a-b; });
  var run={};   // empKey → what earlier rows of this grid add to the YTD
  order.forEach(function(i){
    var r=rows[i], k=s(r.empKey||r.name), out={ warn:[], note:[], err:[] };
    var base=(ctx.ytdBase && k && r.payDate) ? (ctx.ytdBase(k, r.payDate)||{}) : {};
    var add=run[k]||(run[k]={ ss:0, med:0, futa:0, suta:0 });
    var y={ ss:n2(base.ss)+add.ss, med:n2(base.med)+add.med, futa:n2(base.futa)+add.futa, suta:n2(base.suta)+add.suta };
    var gt=r2(n2(r.gross)+n2(r.comm));
    var ssW=r2(Math.max(0, Math.min(gt, ssBase-y.ss))), addW=r2(Math.max(0, y.med+gt-thr)-Math.max(0, y.med-thr));
    var ssC=r2(ssW*0.062), medC=r2(gt*0.0145), addC=r2(addW*0.009);
    var fm=MODES[r.fedMode]?r.fedMode:'calc', xm=MODES[r.ficaMode]?r.ficaMode:'calc';
    /* patch PASTPAYCUT: after the cutoff only the formulas count */
    var _cut=s(set.pastPayCutoff)||CUT, _after=!!s(r.payDate) && s(r.payDate)>_cut;
    /* patch PASTPAYCUT2: after the cutoff the formulas are the starting point — still editable, flagged when changed */
    if(_after && (fm!=='calc' || xm!=='calc' || (r.stMode && r.stMode!=='calc'))) out.warn.push('Paid after '+_cut+': changed from the CRM formula — make sure the check matches what you typed.');
    var fed=0, ss=0, med=0, addl=0;
    if(fm==='calc'){ if(r.fedCalc==null){ if(gt>0) out.err.push('No W-4 figure for '+(r.name||'this row')+' — add the employee in Payroll → Employees, or pick "amount on the check stub"'); } else fed=r2(r.fedCalc); }
    else if(fm==='stub') fed=r2(r.fed);
    else out.note.push('No federal tax was withheld: talk to your CPA; Social Security/Medicare are still owed.');
    if(xm==='calc'){ ss=ssC; med=medC; addl=addC; }
    else if(xm==='stub'){ ss=r2(r.ss); med=r2(r.med);
      if(Math.abs(ss-ssC)>0.02) out.warn.push('Social Security on the stub '+money(ss)+' is not 6.2% of the wages ('+money(ssC)+').');
      if(Math.abs(med-r2(medC+addC))>0.02) out.warn.push('Medicare on the stub '+money(med)+' is not 1.45% of the wages ('+money(r2(medC+addC))+').'); }
    else out.note.push('No Social Security / Medicare withheld: the company still owes BOTH halves on Form 941 line 5 — the employee half ('+money(ssC+medC+addC)+') becomes a company cost. Talk to your CPA.');
    var erSS=ssC, erMed=medC;
    var futaW=r2(Math.max(0, Math.min(gt, futaBase-y.futa))), sutaW=r2(Math.max(0, Math.min(gt, sutaBase-y.suta)));
    var other=r2(r.other);
    /* patch PASTPAYMS: state income tax — TN has none; MS (or another state) as calculated / from the stub / none */
    var stc=(s(r.st)||'TN').toUpperCase(), sm=MODES[r.stMode]?r.stMode:'calc', stw=0;
    if(stc!=='TN'){ if(sm==='calc'){ if(r.stCalc==null){ if(gt>0) out.err.push('No '+stc+' state tax figure for '+(r.name||'this row')+' — set the employee\'s state in Payroll → Employees, or pick "amount on the check stub" under State tax'); } else stw=r2(r.stCalc); }
      else if(sm==='stub') stw=r2(r.stw); else out.note.push('No '+stc+' state tax was withheld on this check.'); }
    var netC=r2(gt-fed-ss-med-addl-stw-other);
    var net=r.netTyped ? r2(r.net) : netC;
    if(r.netTyped && Math.abs(net-netC)>0.02) out.warn.push('Net '+money(net)+' ≠ gross − taxes − deductions ('+money(netC)+').');
    if(!s(r.payDate)) out.err.push('pay date missing'); if(!s(r.name)) out.err.push('employee missing');
    if(!(gt>0) && s(r.name)) out.err.push('gross missing');
    if(s(r.from) && s(r.to) && s(r.from)>s(r.to)) out.err.push('period start is after period end');
    add.ss+=ssW; add.med+=gt; add.futa+=futaW; add.suta+=gt;
    r.out=Object.assign(out, { gross:gt, fed:fed, ss:ss, med:med, addlMed:addl, ssWages:ssW, medWages:gt, erSS:erSS, erMed:erMed,
      futa:r2(futaW*futaRate), suta:r2(sutaW*sutaRate), net:net, ssCalc:ssC, medCalc:r2(medC+addC), fedMode:fm, ficaMode:xm, other:other, state:stw, st:stc, stMode:sm });
  });
  return rows;
}

/* rows (after calc) → paid runs, one per pay date + period, exactly as shown */
function buildRuns(rows, meta){
  meta=meta||{}; var by={}, list=[], now=meta.now||new Date().toISOString(), who=s(meta.by);
  rows.forEach(function(r){
    var o=r.out; if(!o || o.err.length || !(n2(o.gross)>0)) return;   // a run holds only real checks (gross over 0)
    var from=s(r.from)||addDays(r.payDate,-6), to=s(r.to)||s(r.payDate), key=s(r.payDate)+'|'+from+'|'+to;
    var run=by[key];
    if(!run){ run=by[key]={ id:'PS'+(meta.idSeed||Date.now().toString(36))+'_'+list.length, from:from, to:to, payDate:s(r.payDate), payday:s(r.payDate), date:s(r.payDate),
      period:from+' → '+to, frequency:'weekly', lines:[], status:'paid', source:'paystub-entry', noBooks:true, enteredManually:true, checksWritten:true,
      createdBy:who, createdAt:now, updatedAt:now, enteredBy:who, enteredAt:now, approvedBy:who, approvedAt:now, paidAt:now,
      history:[{ at:now, by:who, action:'entered from paystubs (already paid — nothing sent, nothing booked)', status:'paid' }] }; list.push(run); }
    run.lines.push({ empId:s(r.empKey||r.name), name:s(r.name), payType:s(r.payType)||'hourly', period:'weekly', hours:r2(r.hours), otHours:0, rate:0,
      grossParts:[{ label:'Wages (from the stub)', amount:r2(n2(r.gross)) }].concat(n2(r.comm)?[{ label:'Commission', amount:r2(r.comm) }]:[]),
      gross:o.gross, commission:r2(r.comm), preTax:0, postTax:o.other, otherDed:o.other, allDeductions:o.other, taxable:o.gross, ssWages:o.ssWages, medWages:o.medWages,
      ss:o.ss, med:o.med, addlMed:o.addlMed, fed:o.fed, state:r2(o.state), stateName:s(o.st||'TN'), withholdState:s(o.st||'TN'), sutaState:(s(r.sutaSt)||'TN').toUpperCase(),
      employerSS:o.erSS, employerMed:o.erMed, futa:o.futa, suta:o.suta, net:o.net,
      fedMode:o.fedMode, ficaMode:o.ficaMode, fedNotWithheld:o.fedMode==='none', ficaNotWithheld:o.ficaMode==='none',
      status:'paid', paidOut:true, paidDate:s(r.payDate), checkNo:s(r.checkNo), manual:true, enteredManually:true, source:'paystub-entry',
      trace:[{ label:'Entered from the paystub', detail:'federal '+MODES[o.fedMode]+' · Social Security / Medicare '+MODES[o.ficaMode], amt:o.net }] });
  });
  list.forEach(function(run){
    var t={ gross:0, fed:0, ss:0, med:0, addlMed:0, state:0, otherDed:0, net:0, employerSS:0, employerMed:0, futa:0, suta:0, hours:0 };
    run.lines.forEach(function(L){ Object.keys(t).forEach(function(k){ t[k]+=n2(L[k]); }); });
    Object.keys(t).forEach(function(k){ t[k]=r2(t[k]); });
    t.irs941=r2(t.fed+t.ss*2+t.med*2+t.addlMed); t.employerTotal=r2(t.employerSS+t.employerMed+t.futa+t.suta); t.totalCost=r2(t.gross+t.employerTotal);
    run.totals=t; run.totalGross=t.gross; run.totalNet=t.net; run.totalWithheld=r2(t.fed+t.ss+t.med+t.addlMed);
  });
  return list;
}
/* who is offered: real W-2 employees only — a payroll profile with an hourly / salary / commission pay type, active,
   and NOT the shared "Office" sign-in (name exactly Office, office@…, or a shared-login flag — a real person with an
   office role, e.g. "Office Admin", IS offered), NOT an owner / admin
   paid by draws, NOT a 1099 / owner-draw profile. (Payroll makes a profile for every active user, the Office account
   included, so the profile list alone is not enough.) */
var W2_TYPES={ hourly:1, salary:1, commission:1, salary_commission:1 };
function w2Employees(profiles, users){
  users=Array.isArray(users)?users:[];
  return (profiles||[]).filter(function(x){
    if(!x || !s(x.name) || x.active===false || /^(contractor_1099|1099|owner_draw|owner)$/.test(low(x.payType))) return false;   /* patch PASTPAYEMP: no pay type yet = still an employee */
    var u=users.filter(function(y){ return y && ((x.userId && s(y.id)===s(x.userId)) || low(y.name)===low(x.name)); })[0]||null;
    var em=low((u&&u.email)||x.email), role=low(u&&u.role), nm=low(x.name);
    /* only the SHARED Office sign-in: named exactly "Office", the office@ mailbox, or flagged as a shared login.
       A real person with an office role (e.g. "Office Admin") is a W-2 employee and IS offered. */
    if(nm==='office' || (/^office@/.test(em) && !/office admin/.test(role)) || (u && (u.shared===true || u.sharedLogin===true || u.isShared===true))) return false;
    if(users.length && !u) return false;   /* patch PASTPAYFIX: only people on Admin → Team — a leftover payroll profile of someone who left is never offered */
    if(u && (u.active===false || u.disabled===true || u.deleted===true || u.archived===true || u.terminated===true || /inactive|terminat|former|left|fired|quit|disabled|removed/.test(low(u.status)) || low(u.payType)==='owner' || role==='admin' || role==='owner')) return false;
    return true;
  }).map(function(x){ return { name:s(x.name), key:s(x.userId||x.name), payType:s(x.payType), prof:x }; }).sort(function(a,b){ return a.name.localeCompare(b.name); })
  .filter((function(){ /* patch PASTPAYDEDUP: one entry per person, however many copies the profile list holds */
    var seen={}; function score(p){ p=p||{}; var n=0; ['filing','w4Step3','dependents','stepTwo','annualSalary','hourlyRate','state','workState','msFiling','w4Year','allowances'].forEach(function(k){ if(p[k]!=null && p[k]!=='' && p[k]!==0) n++; }); return n; }
    return function(e, i, all){ var k=low(s(e.name)); if(seen[k]!=null) return false;
      var best=e; all.forEach(function(o){ if(low(s(o.name))===k && score(o.prof)>score(best.prof)) best=o; });
      if(best!==e){ e.prof=best.prof; e.key=best.key; e.payType=best.payType; } seen[k]=i; return true; };
  })());
}
/* weekly paydays first..last (inclusive) × employees → blank rows */
function fillRows(first, last, emps){
  var out=[]; if(!s(first)||!s(last)||first>last) return out;
  for(var d=first, n=0; d<=last && n<60; d=addDays(d,7), n++){
    emps.forEach(function(e){ out.push({ payDate:d, from:addDays(d,-6), to:d, name:e.name, empKey:e.key, payType:e.payType, hours:'', gross:weeklySalary(e), comm:'', fedMode:'calc', ficaMode:'calc', fed:'', ss:'', med:'', other:'', net:'', netTyped:false, checkNo:'', st:defSt(e.prof), stMode:'calc', stw:'' }); });
  }
  return out;
}
/* patch PASTPAYMS: the row's default state — MS when the employee lives or works in MS (as the payroll engine withholds), else their state, else TN */
/* patch PASTPAYMS2: a salaried employee's weekly pay fills in by itself (annual salary ÷ 52) — typed over to match the stub */
function weeklySalary(e){ var p=(e&&e.prof)||{}, t=low(p.payType); var a=n2(p.annualSalary); return ((t==='salary'||t==='salary_commission') && a>0) ? r2(a/52).toFixed(2) : ''; }
var CUT='2026-11-03';   /* patch PASTPAYCUT: checks paid on or before this day are typed from the paper */
function defSt(p){ p=p||{}; var r=(s(p.state)||'TN').toUpperCase(), w=(s(p.workState)||r).toUpperCase(); return (r==='MS'||w==='MS')?'MS':r; }
var PP={ calc:calc, buildRuns:buildRuns, fillRows:fillRows, w2Employees:w2Employees, MODES:MODES, defSt:defSt, weeklySalary:weeklySalary };
W._gcPastPay=PP;
if(typeof document==='undefined') return;

/* ── the screen ─────────────────────────────────────────────────────────── */
function P(){ return W.__GC_PAY||null; }
function esc(v){ return s(v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function isAdmin(){ try{ return !!(P() && P().isAdmin()); }catch(e){ return false; } }
var DK='gc_pastpay_draft';
function saveDraft(rows){ try{ localStorage.setItem(DK, JSON.stringify(rows.map(function(r){ var c=Object.assign({}, r); delete c.out; return c; }))); }catch(e){} }
function readDraft(){ try{ var v=JSON.parse(localStorage.getItem(DK)||'null'); return Array.isArray(v)?v:null; }catch(e){ return null; } }
function lastQ(){ var d=new Date(), y=d.getFullYear(), q=Math.floor(d.getMonth()/3)+1; if(q===1){ y--; q=4; } else q--; return { y:y, q:q }; }
function firstFri(ds){ var d=new Date(ds+'T12:00:00'); while(d.getDay()!==5) d.setDate(d.getDate()+1); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function lastFri(ds){ var d=new Date(ds+'T12:00:00'); while(d.getDay()!==5) d.setDate(d.getDate()-1); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
var IN='box-sizing:border-box;padding:4px 5px;border:1px solid #cbd5e1;border-radius:5px;font-size:12px;font-family:inherit;color:#0f2440;background:#fff;';
var BT='padding:8px 13px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;color:#0f2440;font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit;';

W._gcPastPayOpen = async function(){
  var p=P(); if(!p){ alert('Payroll is still loading — try again in a moment.'); return; }
  if(!isAdmin()){ alert('Entering past payroll is for an owner / admin.'); return; }
  var set={}, profs=[], runs=[];
  try{ set=await p.settings(); }catch(e){} try{ profs=(await p.profiles())||[]; }catch(e){} try{ runs=(await p.runs())||[]; }catch(e){}
  var users=[]; try{ users=(p.users && p.users())||[]; }catch(e){}
  var emps=w2Employees(profs, users);
  function empOf(name){ return emps.filter(function(e){ return low(e.name)===low(name); })[0]||null; }
  var lq=lastQ(), qs=lq.y+'-'+pad((lq.q-1)*3+1)+'-01', qe=new Date(lq.y, lq.q*3, 0), qeS=qe.getFullYear()+'-'+pad(qe.getMonth()+1)+'-'+pad(qe.getDate());
  var rows=readDraft()||[];
  var fedCache={}, stCache={}, sutaCache={};
  function ytdBase(k, pd){ try{ var y=p.ytdFor(runs, k, pd.slice(0,4), pd); return { ss:y.ssWages, med:y.medWages, futa:y.gross, suta:(y.sutaBy&&y.sutaBy.TN!=null)?y.sutaBy.TN:y.gross }; }catch(e){ return {}; } }
  async function fedFor(r){
    var e=empOf(r.name); var gt=r2(n2(r.gross)+n2(r.comm));
    if(!e || !(gt>0) || !s(r.payDate)) return e ? 0 : null;
    var stx=(s(r.st)||defSt(e.prof)).toUpperCase(), ck=[e.key,s(r.from)||addDays(r.payDate,-6),s(r.to)||r.payDate,gt,stx,r2(r.comm)].join('|');   /* patch PASTPAYMS */
    var from=s(r.from)||addDays(r.payDate,-6), to=s(r.to)||r.payDate;
    if(fedCache[ck]!=null){ r.stCalc=stCache[ck]; r.sutaSt=sutaCache[ck]; return fedCache[ck]; }
    var stOv=(stx===defSt(e.prof)) ? {} : { state:stx, workState:stx };
    /* patch PASTPAYMS2: commission = supplemental wages → regular pay through the W-4 calc + a flat 22% on the commission */
    var _pf=Object.assign({}, e.prof, stOv, { period:'weekly', payType:(e.prof.payType==='contractor_1099'?'hourly':e.prof.payType) }), _cm=r2(n2(r.comm)), _rg=r2(n2(r.gross));
    try{ var L=await p.computeLine(_pf, from, to, set, { gross:0, ssWages:0, medWages:0, sutaBy:{} }, gt, {});
      /* patch PASTPAYMS3: aggregate method (as ADP and Run Payroll do) — the flat-22% split is off */
      var _fedReg = (false && _cm>0) ? (_rg>0 ? r2(((await p.computeLine(_pf, from, to, set, { gross:0, ssWages:0, medWages:0, sutaBy:{} }, _rg, {}))||{}).fed) : 0) : r2(L && L.fed);
      fedCache[ck]=r2(_fedReg); stCache[ck]=(L && L.state!=null) ? r2(L.state) : null; sutaCache[ck]=s(L && L.sutaState)||'TN'; r.stCalc=stCache[ck]; r.sutaSt=sutaCache[ck]; return fedCache[ck]; }catch(err){ r.stCalc=null; return null; }
  }
  async function recalc(){
    for(var i=0;i<rows.length;i++){ var r=rows[i]; r.empKey=(empOf(r.name)||{}).key||r.name; r.payType=(empOf(r.name)||{}).payType||r.payType;
      if(!s(r.st) && empOf(r.name)){ r.st=defSt(empOf(r.name).prof); var _tr=ov.querySelector('tr[data-row="'+i+'"] [data-k="st"]'); if(_tr) _tr.value=r.st; }   /* patch PASTPAYMS */
      if(!r._mset && s(r.payDate) && set.pastPayAutoStub!==false){ r._mset=1; var _m = s(r.payDate)<=(s(set.pastPayCutoff)||CUT) ? 'stub' : 'calc'; if(_m==='stub'){ if(r.fedMode!=='stub'){ r.fedMode='stub'; if(!s(r.fed)) r.fed=''; } if(r.ficaMode!=='stub') r.ficaMode='stub'; if(r.stMode!=='stub') r.stMode='stub'; r.netTyped=false; } }   /* patch PASTPAYCUT: paid on/before the cutoff → type the paper */
      var _fc = await fedFor(r); r.fedCalc = r.fedMode==='calc' ? _fc : null; }
    calc(rows, { set:set, ytdBase:ytdBase }); saveDraft(rows);
  }
  var old=document.getElementById('_gcPpOv'); if(old) old.remove();
  var ov=document.createElement('div'); ov.id='_gcPpOv'; ov.setAttribute('data-gc-keep','1');
  ov.style.cssText='position:fixed;inset:0;z-index:2147483400;background:rgba(6,12,20,.78);display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow:auto;font-family:inherit;';
  ov.innerHTML='<div style="background:#fff;color:#0f2440;border-radius:12px;width:min(1500px,99vw);padding:16px 18px;box-sizing:border-box;">'
    +'<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><div style="font-size:19px;font-weight:800">📥 Enter past payroll (from paystubs)</div>'
    +'<div style="font-size:12px;color:#64748b;max-width:900px">One row per employee per payday. Salaried pay fills in (salary ÷ 52); type hourly pay and any <b>commission</b> separately. Social Security 6.2%, Medicare 1.45% and federal tax fill in — federal from the employee’s W-4 on the whole check (salary + commission together, the way ADP does it). <b>For checks already paid, use "amount on the check stub" so Form 941 matches what was really withheld.</b> — change any figure to match the stub. '
    +'Saved as <b>already paid</b>: no checks to write, no alerts, nothing sent, nothing booked to accounting (it is already in QuickBooks). Then open 🧾 Form 941.<br><b style="color:#166534">Checks paid on or before 11/3/2026 start on the paper amounts: type Federal, SS, Medicare and State from the paper (📄 Stub clears a row to retype). Checks after 11/3 start on the CRM formulas from the W-4 — you can still change them, and a change is flagged. Paid salary and commission as two checks? Make two rows with the same pay date.</b></div></div>'
    +'<button data-pp="x" style="'+BT+'">Close</button></div>'
    +'<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin:12px 0 8px;padding:10px;background:#f8fafc;border-radius:8px">'
    +'<label style="font-size:11px;font-weight:700;color:#64748b">FIRST PAYDAY<br><input data-pp="first" type="date" value="'+firstFri(qs)+'" style="'+IN+'"></label>'
    +'<label style="font-size:11px;font-weight:700;color:#64748b">LAST PAYDAY<br><input data-pp="last" type="date" value="'+lastFri(qeS)+'" style="'+IN+'"></label>'
    +'<div style="font-size:11px;font-weight:700;color:#64748b">EMPLOYEES<br>'+(emps.length?emps.map(function(e,i){ return '<label style="font-weight:600;color:#0f2440;margin-right:8px"><input type="checkbox" data-pp-emp="'+i+'" checked> '+esc(e.name)+'</label>'; }).join(''):'<span style="color:#b91c1c">No employees yet — add them in Payroll → Employees (name, pay type, W-4).</span>')+'</div>'
    +'<button data-pp="fill" style="'+BT+'background:#0f2440;color:#fff">Make weekly rows</button>'
    +'<button data-pp="add" style="'+BT+'border-color:#16a34a;color:#166534">+ Add a past check</button>'
    +'<button data-pp="clear" style="'+BT+'color:#b91c1c">Clear all rows</button></div>'
    +'<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:1560px"><thead><tr style="background:#f1f5f9">'
    +['Pay date','Period start','Period end','Employee','Hours','Gross','Commission','Federal withheld','Social Security / Medicare withheld','State tax (TN none · MS)','Other ded.','Net pay','Check #',''].map(function(h){ return '<th style="padding:6px 4px;font-size:10px;color:#64748b;text-transform:uppercase;text-align:left">'+h+'</th>'; }).join('')
    +'</tr></thead><tbody data-pp="body"></tbody><tfoot data-pp="foot"></tfoot></table></div>'
    +'<div data-pp="msg" style="font-size:12.5px;font-weight:700;margin-top:10px"></div>'
    +'<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button data-pp="save" style="'+BT+'background:#16a34a;color:#fff;border-color:#16a34a">✅ Save all (already paid)</button>'
    +'<button data-pp="f941" style="'+BT+'">🧾 Open Form 941</button></div></div>';
  document.body.appendChild(ov);
  var $=function(k){ return ov.querySelector('[data-pp="'+k+'"]'); };
  var empOpts=function(v){ var has=!v||empOf(v); return '<option value="">—</option>'+emps.map(function(e){ return '<option'+(low(e.name)===low(v)?' selected':'')+'>'+esc(e.name)+'</option>'; }).join('')+(has?'':'<option selected>'+esc(v)+'</option>'); };
  var modeSel=function(i,k,v){ return '<select data-i="'+i+'" data-k="'+k+'" style="'+IN+'width:150px">'+Object.keys(MODES).map(function(m){ return '<option value="'+m+'"'+(v===m?' selected':'')+'>'+MODES[m]+'</option>'; }).join('')+'</select>'; };
  var inp=function(i,k,v,w,type){ return '<input data-i="'+i+'" data-k="'+k+'" type="'+(type||'text')+'" value="'+esc(v)+'" style="'+IN+'width:'+w+'px'+(type==='text'?'':';text-align:right')+'">'; };
  function draw(){
    $('body').innerHTML = rows.length ? rows.map(function(r,i){
      return '<tr data-row="'+i+'" style="border-top:1px solid #e2e8f0;vertical-align:top">'
        +'<td style="padding:3px">'+inp(i,'payDate',r.payDate,128,'date')+'</td><td style="padding:3px">'+inp(i,'from',r.from,128,'date')+'</td><td style="padding:3px">'+inp(i,'to',r.to,128,'date')+'</td>'
        +'<td style="padding:3px"><select data-i="'+i+'" data-k="name" style="'+IN+'width:150px">'+empOpts(r.name)+'</select></td>'
        +'<td style="padding:3px">'+inp(i,'hours',r.hours,56)+'</td><td style="padding:3px">'+inp(i,'gross',r.gross,86)+'</td><td style="padding:3px">'+inp(i,'comm',r.comm,80)+'</td>'
        +'<td style="padding:3px">'+modeSel(i,'fedMode',r.fedMode)+'<br>'+inp(i,'fed',r.fed,86)+'</td>'
        +'<td style="padding:3px">'+modeSel(i,'ficaMode',r.ficaMode)+'<br><span style="font-size:10px;color:#64748b">SS</span> '+inp(i,'ss',r.ss,72)+' <span style="font-size:10px;color:#64748b">Med</span> '+inp(i,'med',r.med,68)+'</td>'
        +'<td style="padding:3px"><select data-i="'+i+'" data-k="st" style="'+IN+'width:150px">'+['TN','MS','AR','AL','GA','KY','MO','LA'].map(function(v){ return '<option value="'+v+'"'+((s(r.st)||'TN').toUpperCase()===v?' selected':'')+'>'+(v==='TN'?'TN — no state tax':v)+'</option>'; }).join('')+'</select><br>'+modeSel(i,'stMode',r.stMode||'calc')+'<br>'+inp(i,'stw',r.stw,86)+'</td>'
        +'<td style="padding:3px">'+inp(i,'other',r.other,66)+'</td><td style="padding:3px">'+inp(i,'net',r.net,86)+'</td><td style="padding:3px">'+inp(i,'checkNo',r.checkNo,70)+'</td>'
        +'<td style="padding:3px;white-space:nowrap"><button data-stub="'+i+'" title="Already paid: type every tax from the paper" style="border:1px solid #16a34a;background:#f0fdf4;color:#166534;border-radius:5px;padding:4px 8px;cursor:pointer;font-weight:800;margin-right:4px">📄 Stub</button><button data-rm="'+i+'" style="border:none;background:#fee2e2;color:#b91c1c;border-radius:5px;padding:4px 8px;cursor:pointer">✕</button></td></tr>'
        +'<tr data-note="'+i+'"><td colspan="14" style="padding:0 4px 4px"></td></tr>';
    }).join('') : '<tr><td colspan="14" style="padding:14px;color:#64748b;font-size:13px">No checks yet. <b>One check:</b> press <b>+ Add a past check</b>, then pick the employee, the pay date and type the gross from the stub. <b>A whole quarter:</b> pick the first and last payday and press <b>Make weekly rows</b>.</td></tr>';
    paint();
  }
  function paint(){
    var t={ gross:0, fed:0, ss:0, med:0, net:0, n:0 }, errs=0;
    rows.forEach(function(r,i){
      var o=r.out||{ warn:[], note:[], err:[] }, tr=ov.querySelector('tr[data-row="'+i+'"]'); if(!tr) return;
      var set1=function(k,v,ro){ var e=tr.querySelector('[data-k="'+k+'"]'); if(!e) return; if(document.activeElement!==e) e.value=(v==null?'':v); e.readOnly=!!ro; e.style.background=ro?'#f1f5f9':'#fff'; };
      set1('fed', r.fedMode==='calc'?(r.fedCalc==null?'':r2(o.fed).toFixed(2)):(r.fedMode==='none'?'0.00':r.fed), r.fedMode!=='stub');
      set1('ss', r.ficaMode==='stub'?r.ss:r2(o.ss).toFixed(2), r.ficaMode!=='stub');
      set1('med', r.ficaMode==='stub'?r.med:r2(r2(o.med)+r2(o.addlMed)).toFixed(2), r.ficaMode!=='stub');
      var _aft=!!s(r.payDate) && s(r.payDate)>(s(set.pastPayCutoff)||CUT); /* patch PASTPAYCUT2: nothing locked after the cutoff */
      var _st=(s(r.st)||'TN').toUpperCase(), _sm=r.stMode||'calc'; var _sms=tr.querySelector('[data-k="stMode"]'); if(_sms) _sms.style.display=_st==='TN'?'none':'';   /* patch PASTPAYMS */
      set1('stw', _st==='TN' ? '0.00' : (_sm==='calc' ? (r.stCalc==null?'':r2(o.state).toFixed(2)) : (_sm==='none'?'0.00':r.stw)), _st==='TN' || _sm!=='stub');
      if(!r.netTyped) set1('net', o.net!=null && o.gross>0 ? r2(o.net).toFixed(2) : '', false);
      var nt=ov.querySelector('tr[data-note="'+i+'"] td');
      nt.innerHTML=(o.err||[]).map(function(x){ return '<div style="color:#b91c1c;font-size:11.5px;font-weight:700">✗ '+esc(x)+'</div>'; }).join('')
        +(o.note||[]).map(function(x){ return '<div style="background:#fff7ed;border:1px solid #fb923c;color:#9a3412;border-radius:6px;padding:3px 7px;margin:2px 0;font-size:11.5px;font-weight:700">⚠ '+esc(x)+'</div>'; }).join('')
        +(o.warn||[]).map(function(x){ return '<div style="background:#fefce8;border:1px solid #facc15;color:#854d0e;border-radius:6px;padding:3px 7px;margin:2px 0;font-size:11.5px">'+esc(x)+' (the stub wins)</div>'; }).join('');
      if((o.err||[]).length) errs++;
      if(o.gross>0){ t.gross+=o.gross; t.fed+=o.fed; t.ss+=o.ss; t.med+=n2(o.med)+n2(o.addlMed); t.net+=o.net; t.n++; }
    });
    $('foot').innerHTML='<tr style="background:#eef2ff;font-weight:800;font-size:12.5px"><td colspan="5" style="padding:6px">TOTAL · '+t.n+' check'+(t.n===1?'':'s')+(errs?(' · <span style="color:#b91c1c">'+errs+' row(s) to fix</span>'):'')+'</td><td style="padding:6px" colspan="2">'+money(t.gross)+'</td><td style="padding:6px">'+money(t.fed)+'</td><td style="padding:6px">SS '+money(t.ss)+' · Med '+money(t.med)+'</td><td></td><td style="padding:6px">'+money(t.net)+'</td><td colspan="2"></td></tr>';
  }
  var tmr=null; function later(){ clearTimeout(tmr); tmr=setTimeout(function(){ recalc().then(paint); }, 250); }
  ov.addEventListener('input', function(e){ var el=e.target, i=el.getAttribute&&el.getAttribute('data-i'), k=el.getAttribute&&el.getAttribute('data-k'); if(i==null||!k) return;
    var r=rows[+i]; if(!r) return; r[k]=el.value; if(k==='net') r.netTyped=el.value!=='';
    if(k==='payDate' && el.value){ r.from=addDays(el.value,-6); r.to=el.value; var tr=ov.querySelector('tr[data-row="'+i+'"]'); tr.querySelector('[data-k="from"]').value=r.from; tr.querySelector('[data-k="to"]').value=r.to; }
    later(); });
  ov.addEventListener('change', function(e){ var el=e.target, i=el.getAttribute&&el.getAttribute('data-i'), k=el.getAttribute&&el.getAttribute('data-k'); if(i==null||!k) return;
    var r=rows[+i]; if(!r) return; r[k]=el.value;
    if(k==='fedMode' && el.value==='stub' && r.fed==='' && r.out) r.fed=r2(r.out.fed).toFixed(2);
    if(k==='ficaMode' && el.value==='stub' && r.out){ if(r.ss==='') r.ss=r2(r.out.ssCalc).toFixed(2); if(r.med==='') r.med=r2(r.out.medCalc).toFixed(2); }
    if(k==='stMode' && el.value==='stub' && r.stw==='' && r.out) r.stw=r2(r.out.state).toFixed(2);   /* patch PASTPAYMS */
    if(k==='fedMode' || k==='ficaMode' || k==='stMode' || k==='st'){ r.netTyped=false; r.net=''; }
    later(); });
  ov.addEventListener('click', function(e){ var b=e.target.closest&&e.target.closest('[data-rm]'); if(!b) return; rows.splice(+b.getAttribute('data-rm'),1); draw(); later(); });
  /* patch PASTPAYSTUB: one tap = every tax on this row comes from the paper */
  ov.addEventListener('click', function(e){ var b=e.target.closest&&e.target.closest('[data-stub]'); if(!b) return; var i=+b.getAttribute('data-stub'), r=rows[i]; if(!r) return;
    r.fedMode='stub'; r.ficaMode='stub'; r.fed=''; r.ss=''; r.med=''; if((s(r.st)||'TN').toUpperCase()!=='TN'){ r.stMode='stub'; r.stw=''; } r.netTyped=false; r.net='';
    draw(); later(); setTimeout(function(){ var f=ov.querySelector('tr[data-row="'+i+'"] [data-k="fed"]'); if(f){ f.focus(); try{ f.scrollIntoView({block:'center'}); }catch(_e){} } }, 50); });
  $('x').onclick=function(){ ov.remove(); };
  $('fill').onclick=function(){
    var pick=emps.filter(function(e,i){ var c=ov.querySelector('[data-pp-emp="'+i+'"]'); return c && c.checked; });
    var nw=fillRows($('first').value, $('last').value, pick);
    if(!nw.length){ alert('Pick the first and last payday and at least one employee.'); return; }
    if(rows.length && !confirm('Add '+nw.length+' rows to the '+rows.length+' already here?')) return;
    rows=rows.concat(nw); draw(); later(); };
  $('add').onclick=function(){ var l=rows[rows.length-1]; var d=l?l.payDate:firstFri(qs); rows.push({ payDate:d, from:addDays(d,-6), to:d, name:'', hours:'', gross:'', comm:'', fedMode:'calc', ficaMode:'calc', fed:'', ss:'', med:'', other:'', net:'', netTyped:false, checkNo:'', st:'', stMode:'calc', stw:'' }); draw(); later(); };
  $('clear').onclick=function(){ if(rows.length && confirm('Clear all '+rows.length+' rows from this screen? (Nothing saved is touched.)')){ rows=[]; draw(); saveDraft(rows); } };
  $('f941').onclick=function(){ ov.remove(); if(W._gcF941Open) W._gcF941Open(); };
  $('save').onclick=async function(){
    var msg=$('msg'); await recalc(); paint();
    var live=rows.filter(function(r){ return r2(n2(r.gross)+n2(r.comm))>0; });
    var bad=live.filter(function(r){ return r.out && r.out.err.length; });
    if(!live.length){ msg.style.color='#b91c1c'; msg.textContent='Type at least one gross amount.'; return; }
    if(bad.length){ msg.style.color='#b91c1c'; msg.textContent=bad.length+' row(s) still need fixing (in red) — nothing was saved.'; return; }
    var blank=rows.length-live.length;
    var fresh=[]; try{ fresh=(await p.runs())||[]; }catch(e){}
    var dates={}; live.forEach(function(r){ dates[r.payDate]=1; });
    var dup=fresh.filter(function(x){ return x && ['approved','paid'].indexOf(low(x.status))>=0 && dates[s(x.payDate)]; });
    var me=''; try{ me=p.me(); }catch(e){}
    var made=buildRuns(live, { by:me });
    var g=0, f=0; made.forEach(function(x){ g+=x.totals.gross; f+=x.totals.fed; });
    if(!confirm('Save '+made.length+' paid payroll run'+(made.length===1?'':'s')+' ('+live.length+' checks, gross '+money(g)+', federal '+money(f)+')?'
      +(blank?('\n\n'+blank+' row(s) with no gross are left out.'):'')
      +(dup.length?('\n\n⚠ '+dup.length+' payroll run(s) already exist on '+Object.keys(dates).filter(function(d){ return dup.some(function(x){ return s(x.payDate)===d; }); }).join(', ')+' — saving adds more. Cancel if these are already in.'):'')
      +'\n\nSaved as already paid: no checks to write, no alerts, nothing booked to accounting.')) return;
    fresh.push.apply(fresh, made);
    try{ await p.saveRuns(fresh); }catch(e){ msg.style.color='#b91c1c'; msg.textContent='Could not save: '+(e&&e.message); return; }
    try{ var _rp=p.replaceDrafts ? await p.replaceDrafts(live.map(function(r){ return { empId:r.empKey, name:r.name }; })) : null; if(_rp && _rp.changed) fresh=_rp.list; }catch(_rpE){}   /* patch PAYREPLACE */
    runs=fresh; rows=rows.filter(function(r){ return live.indexOf(r)<0; }); saveDraft(rows); draw();
    msg.style.color='#166534'; msg.innerHTML='✅ Saved '+made.length+' paid run'+(made.length===1?'':'s')+' ('+live.length+' checks). Open <b>🧾 Form 941</b> to see the quarter.';
    try{ console.log('[GC] PASTPAY: '+made.length+' paid run(s) entered from paystubs (source paystub-entry, not booked).'); }catch(e){}
    try{ if(W._gcPayrollRender) W._gcPayrollRender(); }catch(e){}
  };
  if(rows.length){ draw(); await recalc(); paint(); } else draw();
};
})(window);
</script>
