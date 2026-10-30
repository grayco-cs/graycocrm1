<script>
/* ============================================================================
   patch PAYMANUAL — Payroll: type in any week by hand; delete or void a run.   __GC_PAYMANUAL__

   Owner 10/29: "i need to manually add every week of payroll and delete payroll if i can also".

   ✍ ENTER A WEEK BY HAND (Payroll → Run Payroll, button "✍ Enter a week by hand"; admins and the office)
     • ANY week: a "week ending" date (any date is moved to the payroll week it falls in, the CRM's own
       _gcPayPeriodContaining) plus "This week" / "Last week" (_gcCurrentPayPeriod / _gcPayPeriodFor, the same
       weeks the Run Payroll tab uses). Payroll is every week, paid Friday (patch AUTO-PAYWEEK).
     • One line per person, picked from the payroll profiles: hours, rate or gross, federal, FICA, state, net,
       check #. Gross fills itself from hours × rate and net from gross − taxes until a figure is typed.
     • Saved into payrollRuns like every other run (enteredManually: true), through the payroll page's own
       storage (window.__GC_PAY.saveRuns) — nothing is moved and nothing new is synced.
     • Same approval rules: the office saves a draft or sends it to an admin (pending, the red alert); an admin
       may save it approved (checks still to write) or paid (already paid).
     • It warns when a run already exists for that week (on the screen, and once more before saving).

   🗑 DELETE / ⊘ VOID (Payroll → Approvals, on each run)
     • An admin deletes any run that is not paid (draft, waiting, approved-not-paid, denied) after a question
       that names the week and the total. A paid run (status paid, or any of its checks written) is never
       deleted: an admin may VOID it (typed confirm) — kept for the record as "Voided", out of every total,
       year-to-date, tax figure and the checks due.
     • The office deletes only its own drafts.
     • A delete goes through the app's delete list (gc_tombstones: _gcTombstone + _gcxDel, like every other
       list), so no cloud pull, union push or stale computer brings the run back. The payroll page's own
       reader (__GC_PAY.runs) leaves out a run on the delete list.
     • A deleted approved run, or a voided run, takes its wages and employer-tax rows out of the books through
       the register's own delete (_gcRegDeleteRows) and its employee-payment history rows through the delete
       list. The bank-account note written at approval is left as it is.
     • Logged: a delete in the app's delete log (gc_delete_log, this computer) with the week and the total;
       entry and void in the run's own history. window._gcPayrollChanges() lists both.
   ========================================================================== */
(function(){
'use strict';
if(window.__GC_PAYMANUAL__) return; window.__GC_PAYMANUAL__ = true;
var W = window;
function P(){ return W.__GC_PAY || null; }
function n2(v){ var x = parseFloat(String(v==null?'':v).replace(/[$,\s]/g,'')); return isFinite(x) ? x : 0; }
function r2(v){ return Math.round(n2(v)*100)/100; }
function low(s){ return String(s==null?'':s).trim().toLowerCase(); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function money(v){ return '$'+n2(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function ymd(d){ return String(d||'').slice(0,10); }
function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function today(){ return iso(new Date()); }
function addDays(ds, n){ var d = new Date(ymd(ds)+'T12:00:00'); if(isNaN(d)) return ''; d.setDate(d.getDate()+n); return iso(d); }
function nice(ds){ var d = new Date(ymd(ds)+'T12:00:00'); if(isNaN(d)) return String(ds||'—'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]+' '+(d.getMonth()+1)+'/'+d.getDate()+'/'+d.getFullYear(); }
function nowISO(){ return new Date().toISOString(); }
function me(){ var p = P(); try{ return (p && p.me()) || ''; }catch(e){ return ''; } }
function isAdmin(){ var p = P(); try{ return !!(p && p.isAdmin()); }catch(e){ return false; } }
function isOffice(){ var p = P(); try{ return !!(p && p.isOffice()); }catch(e){ return false; } }
function rerender(){ try{ if(W._gcPayrollRender) W._gcPayrollRender(); }catch(e){} }

var LABEL = { draft:'Draft', pending:'Waiting on admin', approved:'Approved', paid:'Paid', denied:'Denied', voided:'Voided' };
function stLabel(r){ var s = low(r && r.status); return LABEL[s] || (s ? s : 'No status'); }

/* ── the payroll week ─────────────────────────────────────────────────────── */
function weekOf(dateStr){
  var d = ymd(dateStr) || today();
  try{ if(W._gcPayPeriodContaining){ var p = W._gcPayPeriodContaining(d); if(p && p.end) return p; } }catch(e){}
  return { start:addDays(d,-6), end:d, payday:addDays(d,2), label:addDays(d,-6)+' → '+d };
}
function thisWeek(){
  try{ var c = W._gcCurrentPayPeriod && W._gcCurrentPayPeriod(); if(c && c.end) return c; }catch(e){}
  return weekOf(today());
}
function lastWeek(){
  var c = thisWeek();
  try{ var p = W._gcPayPeriodFor && W._gcPayPeriodFor(addDays(c.payday,-7)); if(p && p.end) return p; }catch(e){}
  return weekOf(addDays(c.end,-7));
}
/* the week a saved run is for (runs from every screen: from/to, or the older period / payday shape) */
function runWeekEnd(r){
  if(!r) return '';
  if(r.to) return ymd(r.to);
  var per = String(r.period||'');
  if(per.indexOf('→') > 0){ var e = ymd(per.split('→')[1].trim()); if(/^\d{4}-\d\d-\d\d$/.test(e)) return e; }
  var pd = ymd(r.payDate||r.payday||r.date);
  if(pd){ try{ var p = W._gcPayPeriodFor && W._gcPayPeriodFor(pd); if(p && p.end) return p.end; }catch(e){} }
  return '';
}
function runWeekLabel(r){
  var end = runWeekEnd(r), from = ymd(r && r.from) || (end ? addDays(end,-6) : '');
  return end ? (nice(from)+' → '+nice(end)) : (String(r && (r.period||r.payDate||r.payday)) || 'unknown week');
}
function sameWeek(r, wk){
  if(!r || !wk) return false;
  var e = runWeekEnd(r); if(e && e === wk.end) return true;
  var f = ymd(r.from); return !!f && f === wk.start;
}
async function allRuns(){ var p = P(); if(!p) return []; try{ return await p.runs(); }catch(e){ return []; } }
/* runs already saved for a week (a voided one does not count) */
async function runsForWeek(wk){
  var l = await allRuns();
  return l.filter(function(r){ return r && low(r.status) !== 'voided' && sameWeek(r, wk); });
}
W._gcPayWeekRuns = async function(weekEnding){ return runsForWeek(weekOf(weekEnding)); };
W._gcPayWeekOf = weekOf;

function totalsOf(lines){
  var t = { gross:0, fed:0, ss:0, med:0, addlMed:0, state:0, otherDed:0, net:0, employerSS:0, employerMed:0, futa:0, suta:0, hours:0 };
  (lines||[]).forEach(function(L){
    if(!L || L.status === 'denied') return;
    ['gross','fed','ss','med','addlMed','state','otherDed','net','employerSS','employerMed','futa','suta'].forEach(function(k){ t[k] += n2(L[k]); });
    t.hours += n2(L.hours) + n2(L.otHours);
  });
  Object.keys(t).forEach(function(k){ t[k] = r2(t[k]); });
  t.irs941 = r2(t.fed + t.ss*2 + t.med*2 + t.addlMed);
  t.employerTotal = r2(t.employerSS + t.employerMed + t.futa + t.suta);
  t.totalCost = r2(t.gross + t.employerTotal);
  return t;
}
function runTotals(r){
  var t = totalsOf(r && r.lines);
  if(!(r && r.lines && r.lines.length)){ t.gross = r2(r && (r.totalGross || (r.totals && r.totals.gross))); t.net = r2(r && (r.totalNet || (r.totals && r.totals.net))); }
  return t;
}
function dupText(list){
  return list.map(function(r){
    var t = runTotals(r);
    return '• '+stLabel(r)+' · '+((r.lines||[]).length)+' check'+((r.lines||[]).length===1?'':'s')+' · net '+money(t.net)
      +(r.enteredManually ? ' · entered by hand' : '')+((r.createdBy||r.enteredBy||r.submittedBy) ? (' · by '+(r.createdBy||r.enteredBy||r.submittedBy)) : '');
  }).join('\n');
}

/* ── one line, in the shape the rest of payroll reads ───────────────────── */
function makeLine(row, status, prof){
  var gross = r2(row.gross), fica = r2(row.fica), ss = r2(fica * 0.062 / 0.0765), med = r2(fica - ss);
  var fed = r2(row.fed), state = r2(row.state);
  var net = (row.net === '' || row.net == null) ? r2(gross - fed - fica - state) : r2(row.net);
  var st = (prof && prof.state) || 'TN';
  var L = {
    empId: (prof && (prof.userId || prof.name)) || row.name, name: row.name, payType: (prof && prof.payType) || '', period: 'weekly',
    hours: r2(row.hours), otHours: 0, rate: r2(row.rate),
    grossParts: [{ label:'Entered by hand', amount:gross }], gross: gross,
    preTax: 0, postTax: 0, otherDed: 0, allDeductions: 0, taxable: gross, ssWages: gross, medWages: gross,
    ss: ss, med: med, addlMed: 0, fed: fed, state: state, stateName: st, withholdState: st,
    net: net, employerSS: ss, employerMed: med, futa: 0, suta: 0,
    trace: [
      { label:'GROSS PAY', detail:(n2(row.hours) && n2(row.rate)) ? (r2(row.hours)+' hrs × '+money(row.rate)+' — entered by hand') : 'Entered by hand', amt:gross },
      { label:'Federal income tax', detail:'Entered by hand', amt:fed },
      { label:'FICA (Social Security + Medicare)', detail:'Entered by hand: '+money(ss)+' + '+money(med), amt:fica },
      { label:'State income tax', detail:'Entered by hand', amt:state },
      { label:'NET PAY (the check)', detail:'Entered by hand', amt:net }
    ],
    status: status === 'paid' ? 'paid' : (status === 'approved' ? 'approved' : 'pending'),
    checkNo: String(row.checkNo == null ? '' : row.checkNo).trim(), manual: true, enteredManually: true
  };
  if(status === 'paid'){ L.paidOut = true; L.paidDate = ''; }
  return L;
}

/* Save a hand-entered week. spec: { weekEnding, payDate, status, lines:[{name,hours,rate,gross,fed,fica,state,net,checkNo}],
   allowDuplicate } → { ok, run } or { ok:false, why, dup } */
W._gcPayManualSave = async function(spec){
  spec = spec || {};
  var p = P(); if(!p) return { ok:false, why:'Payroll is still loading — try again in a moment.' };
  if(!p.canSee()) return { ok:false, why:'Payroll is for admins and the office.' };
  var admin = isAdmin();
  var status = low(spec.status) || (admin ? 'approved' : 'pending');
  if(['draft','pending','approved','paid'].indexOf(status) < 0) return { ok:false, why:'Unknown status "'+status+'".' };
  if(!admin && (status === 'approved' || status === 'paid')) return { ok:false, why:'Only an admin can save payroll as approved or paid. Send it to an admin for approval.' };
  if(!spec.weekEnding) return { ok:false, why:'Pick the week (the week-ending date).' };
  var wk = weekOf(spec.weekEnding);
  var pay = ymd(spec.payDate) || wk.payday;
  var profs = []; try{ profs = await p.profiles(); }catch(e){}
  var lines = [], bad = [], seen = {};
  (spec.lines||[]).forEach(function(row){
    if(!row || !String(row.name||'').trim()) return;
    var nm = String(row.name).trim();
    if(seen[low(nm)]){ bad.push(nm+' is on the list twice'); return; }
    seen[low(nm)] = 1;
    var r = Object.assign({}, row);
    if(!(n2(r.gross) > 0) && n2(r.hours) > 0 && n2(r.rate) > 0) r.gross = r2(n2(r.hours) * n2(r.rate));
    if(!(n2(r.gross) > 0)){ bad.push(nm+' has no gross pay'); return; }
    var prof = profs.filter(function(x){ return x && low(x.name) === low(nm); })[0] || null;
    var L = makeLine(r, status, prof);
    if(L.net < 0){ bad.push(nm+': the taxes are more than the gross'); return; }
    lines.push(L);
  });
  if(bad.length) return { ok:false, why:bad.join('; ')+'.' };
  if(!lines.length) return { ok:false, why:'Add at least one person with a gross amount.' };
  var dup = await runsForWeek(wk);
  if(dup.length && !spec.allowDuplicate) return { ok:false, why:'A payroll run already exists for this week.', dup:dup, week:wk };
  var now = nowISO(), who = me();
  var t = totalsOf(lines);
  var run = {
    id: 'PR'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
    from: wk.start, to: wk.end, payDate: pay, payday: pay, date: pay, period: wk.start+' → '+wk.end, frequency: 'weekly',
    lines: lines, totals: t, totalGross: t.gross, totalNet: t.net, totalWithheld: r2(t.fed + t.ss + t.med + t.addlMed + t.state),
    status: status, createdBy: who, createdAt: now, updatedAt: now,
    enteredManually: true, enteredBy: who, enteredAt: now,
    history: [{ at: now, by: who, action: 'entered by hand', status: status }]
  };
  if(dup.length) run.history[0].note = 'saved although '+dup.length+' other run(s) exist for this week';
  if(status === 'pending'){ run.submittedBy = who; run.submittedAt = now; }
  if(status === 'approved' || status === 'paid'){ run.approvedBy = who; run.approvedAt = now; }
  if(status === 'paid'){ run.paidAt = now; run.checksWritten = true; }
  var all = await allRuns();
  all.push(run);
  await p.saveRuns(all);
  if(status === 'pending'){ try{ if(W._gcPayrollNotify) W._gcPayrollNotify(run); }catch(e){} }
  try{ console.log('[GC] Payroll week entered by hand: '+run.period+' · '+status+' · '+lines.length+' check(s) · net '+money(t.net)); }catch(e){}
  return { ok:true, run:run, dup:dup };
};

/* ── the screen ───────────────────────────────────────────────────────────── */
var IN = 'width:100%;box-sizing:border-box;padding:6px 7px;border:1px solid #cbd5e1;border-radius:6px;font-size:12.5px;font-family:inherit;color:#0f2440;background:#fff;';
var BTN = 'padding:9px 15px;border-radius:8px;border:none;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;';
W._gcPayManualOpen = async function(opts){
  opts = opts || {};
  var p = P();
  if(!p){ alert('Payroll is still loading — try again in a moment.'); return; }
  if(!p.canSee()){ alert('Payroll is for admins and the office.'); return; }
  var admin = isAdmin();
  var profs = []; try{ profs = (await p.profiles()).filter(function(x){ return x && x.name && x.active !== false; }); }catch(e){}
  profs.sort(function(a,b){ return String(a.name).localeCompare(String(b.name)); });
  var wk = opts.weekEnding ? weekOf(opts.weekEnding) : thisWeek();
  var payTyped = false;
  var rows = [];   // { name, hours, rate, gross, grossTyped, fed, fica, state, net, netTyped, checkNo }

  var old = document.getElementById('_gcPmOv'); if(old) old.remove();
  var ov = document.createElement('div'); ov.id = '_gcPmOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483500;background:rgba(6,12,20,.78);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:inherit;';
  var saveBtns = admin
    ? '<button id="_pmDraft" style="'+BTN+'background:#fff;color:#334155;border:1px solid #cbd5e1;">Save as draft</button>'
      +'<button id="_pmApproved" style="'+BTN+'background:#2563eb;color:#fff;">Save as approved (checks still to write)</button>'
      +'<button id="_pmPaid" style="'+BTN+'background:#16a34a;color:#fff;">Save as paid (already paid)</button>'
    : '<button id="_pmDraft" style="'+BTN+'background:#fff;color:#334155;border:1px solid #cbd5e1;">Save as draft</button>'
      +'<button id="_pmSend" style="'+BTN+'background:#2563eb;color:#fff;">Send to an admin for approval</button>';
  ov.innerHTML = '<div style="background:#fff;color:#0f2440;border-radius:12px;width:min(1080px,98vw);padding:18px 20px;margin:auto 0;box-sizing:border-box;">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'
      + '<div><div style="font-size:19px;font-weight:800;">✍ Enter a week of payroll by hand</div>'
      + '<div style="font-size:12px;color:#64748b;margin-top:2px;">Pick the week, add a line for each person paid and type what was paid. Payroll is every week, paid Friday. '
      + (admin ? 'As an admin you can save it approved or paid.' : 'It goes to an admin to approve.') + '</div></div>'
      + '<button id="_pmX" style="'+BTN+'background:#e2e8f0;color:#334155;">Close</button></div>'
    + '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:14px 0 6px;">'
      + '<div><div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:3px;">Week ending</div><input id="_pmEnd" type="date" style="'+IN+'width:auto;"></div>'
      + '<button id="_pmThis" style="'+BTN+'background:#fff;color:#334155;border:1px solid #cbd5e1;font-weight:700;">This week</button>'
      + '<button id="_pmLast" style="'+BTN+'background:#fff;color:#334155;border:1px solid #cbd5e1;font-weight:700;">Last week</button>'
      + '<div><div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:3px;">Check date</div><input id="_pmPay" type="date" style="'+IN+'width:auto;"></div>'
      + '<div id="_pmWk" style="font-size:12.5px;font-weight:700;color:#0f2440;padding-bottom:7px;"></div>'
    + '</div>'
    + '<div id="_pmDup" style="display:none;margin:6px 0;padding:9px 12px;border-radius:8px;background:#fffbeb;border:1px solid #f59e0b;color:#92400e;font-size:12.5px;white-space:pre-line;"></div>'
    + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 8px;">'
      + '<select id="_pmPick" style="'+IN+'width:auto;min-width:220px;"></select>'
      + '<button id="_pmAdd" style="'+BTN+'background:#0f2440;color:#fff;font-weight:700;">+ Add this person</button>'
      + '<button id="_pmAddAll" style="'+BTN+'background:#fff;color:#334155;border:1px solid #cbd5e1;font-weight:700;">+ Add everyone</button>'
    + '</div>'
    + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:860px;">'
      + '<thead><tr style="background:#f8fafc;">'
      + ['Employee','Hours','Rate $/hr','Gross','Federal','FICA','State','Net check','Check #',''].map(function(h, i){ return '<th style="padding:7px 6px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:'+(i===0||i>=8?'left':'right')+';border-bottom:1px solid #e2e8f0;">'+h+'</th>'; }).join('')
      + '</tr></thead><tbody id="_pmBody"></tbody><tfoot id="_pmFoot"></tfoot></table></div>'
    + '<div style="font-size:11.5px;color:#64748b;margin-top:8px;">Gross fills itself from hours × rate, and net from gross − federal − FICA − state, until you type your own figure. FICA is Social Security + Medicare together.</div>'
    + '<div id="_pmMsg" style="font-size:12.5px;font-weight:700;margin-top:10px;color:#b91c1c;"></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">' + saveBtns
      + '<button id="_pmCancel" style="'+BTN+'background:#e2e8f0;color:#334155;margin-left:auto;">Cancel</button></div>'
    + '</div>';
  document.body.appendChild(ov);
  var $ = function(id){ return ov.querySelector('#'+id); };
  function close(){ try{ ov.remove(); }catch(e){} }
  $('_pmX').onclick = close; $('_pmCancel').onclick = close;

  function profOf(name){ return profs.filter(function(x){ return low(x.name) === low(name); })[0] || null; }
  function fillPick(){
    var have = {}; rows.forEach(function(r){ have[low(r.name)] = 1; });
    var left = profs.filter(function(x){ return !have[low(x.name)]; });
    $('_pmPick').innerHTML = left.length
      ? '<option value="">Add a person…</option>' + left.map(function(x){ return '<option value="'+esc(x.name)+'">'+esc(x.name)+(x.payType?(' — '+esc(x.payType)):'')+'</option>'; }).join('')
      : '<option value="">Everyone is on the list</option>';
  }
  function add(name){
    if(!name || rows.some(function(r){ return low(r.name) === low(name); })) return;
    var pr = profOf(name);
    var rate = (pr && n2(pr.hourlyRate) > 0) ? r2(pr.hourlyRate) : '';
    rows.push({ name:name, hours:'', rate:rate, gross:'', grossTyped:false, fed:'', fica:'', state:'', net:'', netTyped:false, checkNo:'' });
  }
  function calc(r){
    if(!r.grossTyped) r.gross = (n2(r.hours) > 0 && n2(r.rate) > 0) ? r2(n2(r.hours) * n2(r.rate)) : '';
    if(!r.netTyped) r.net = (n2(r.gross) > 0) ? r2(n2(r.gross) - n2(r.fed) - n2(r.fica) - n2(r.state)) : '';
  }
  function cell(i, k, v, w, type){
    return '<td style="padding:4px 4px;"><input data-i="'+i+'" data-k="'+k+'" type="'+(type||'number')+'" step="0.01" value="'+esc(v)+'" style="'+IN+'text-align:'+(type==='text'?'left':'right')+';width:'+w+'px;"></td>';
  }
  function draw(){
    $('_pmBody').innerHTML = rows.length ? rows.map(function(r, i){
      var pr = profOf(r.name);
      return '<tr data-row="'+i+'" style="border-bottom:1px solid #f1f5f9;">'
        + '<td style="padding:6px;font-size:12.5px;"><b>'+esc(r.name)+'</b>'+(pr && pr.payType ? '<div style="font-size:10px;color:#94a3b8;">'+esc(pr.payType)+'</div>' : '')+'</td>'
        + cell(i,'hours',r.hours,70) + cell(i,'rate',r.rate,74) + cell(i,'gross',r.gross,96) + cell(i,'fed',r.fed,84)
        + cell(i,'fica',r.fica,84) + cell(i,'state',r.state,78) + cell(i,'net',r.net,96) + cell(i,'checkNo',r.checkNo,80,'text')
        + '<td style="padding:4px;"><button data-rm="'+i+'" title="Take this line off" style="border:none;background:#fee2e2;color:#b91c1c;border-radius:6px;padding:5px 9px;font-weight:800;cursor:pointer;">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="10" style="padding:14px 6px;font-size:12.5px;color:#64748b;">No one on this week yet — pick a person above and press "+ Add this person" (or "+ Add everyone").</td></tr>';
    foot(); fillPick();
    Array.prototype.forEach.call(ov.querySelectorAll('[data-rm]'), function(b){
      b.onclick = function(){ rows.splice(+b.getAttribute('data-rm'), 1); draw(); };
    });
  }
  function foot(){
    var t = { hours:0, gross:0, fed:0, fica:0, state:0, net:0 };
    rows.forEach(function(r){ Object.keys(t).forEach(function(k){ t[k] += n2(r[k]); }); });
    $('_pmFoot').innerHTML = '<tr style="background:#f1f5f9;font-weight:800;font-size:12.5px;"><td style="padding:7px 6px;">TOTALS · '+rows.length+' check'+(rows.length===1?'':'s')+'</td>'
      + '<td style="padding:7px 6px;text-align:right;">'+r2(t.hours).toFixed(2)+'</td><td></td>'
      + ['gross','fed','fica','state','net'].map(function(k){ return '<td id="_pmT_'+k+'" style="padding:7px 6px;text-align:right;'+(k==='net'?'color:#16a34a;':'')+'">'+money(t[k])+'</td>'; }).join('')
      + '<td></td><td></td></tr>';
  }
  ov.addEventListener('input', function(e){
    var el = e.target; if(!el || !el.getAttribute) return;
    var i = el.getAttribute('data-i'), k = el.getAttribute('data-k');
    if(i == null || !k) return;
    var r = rows[+i]; if(!r) return;
    r[k] = el.value;
    if(k === 'gross') r.grossTyped = el.value !== '';
    if(k === 'net') r.netTyped = el.value !== '';
    calc(r);
    var tr = ov.querySelector('tr[data-row="'+i+'"]');
    if(tr){
      if(k !== 'gross'){ var g = tr.querySelector('[data-k="gross"]'); if(g) g.value = r.gross; }
      if(k !== 'net'){ var nn = tr.querySelector('[data-k="net"]'); if(nn) nn.value = r.net; }
    }
    foot();
  });
  $('_pmAdd').onclick = function(){ var v = $('_pmPick').value; if(v){ add(v); draw(); } };
  $('_pmAddAll').onclick = function(){ profs.forEach(function(x){ add(x.name); }); draw(); };

  async function setWeek(w){
    wk = w;
    $('_pmEnd').value = wk.end;
    if(!payTyped) $('_pmPay').value = wk.payday;
    $('_pmWk').textContent = 'Week ' + nice(wk.start) + ' → ' + nice(wk.end) + ' · paid ' + nice(wk.payday);
    var dup = await runsForWeek(wk);
    var box = $('_pmDup');
    if(dup.length){
      box.style.display = 'block';
      box.textContent = '⚠ There is already a payroll run for this week ('+nice(wk.start)+' → '+nice(wk.end)+'):\n'+dupText(dup)
        + '\nCheck it on the Approvals tab before entering the week again — saving here adds a second run.';
    } else { box.style.display = 'none'; box.textContent = ''; }
  }
  $('_pmEnd').onchange = function(){ if(this.value) setWeek(weekOf(this.value)); };
  $('_pmPay').oninput = function(){ payTyped = !!this.value; };
  $('_pmThis').onclick = function(){ setWeek(thisWeek()); };
  $('_pmLast').onclick = function(){ setWeek(lastWeek()); };

  async function save(status, btn){
    var msg = $('_pmMsg'); msg.textContent = '';
    var spec = { weekEnding: wk.end, payDate: $('_pmPay').value || wk.payday, status: status,
                 lines: rows.map(function(r){ return { name:r.name, hours:r.hours, rate:r.rate, gross:r.gross, fed:r.fed, fica:r.fica, state:r.state, net:r.netTyped ? r.net : '', checkNo:r.checkNo }; }) };
    var res = await W._gcPayManualSave(spec);
    if(!res.ok && res.dup && res.dup.length){
      if(!confirm('There is already a payroll run for the week '+nice(wk.start)+' → '+nice(wk.end)+':\n'+dupText(res.dup)+'\n\nSave another run for the same week anyway?')) { msg.textContent = 'Not saved — a run already exists for this week.'; return; }
      spec.allowDuplicate = true;
      res = await W._gcPayManualSave(spec);
    }
    if(!res.ok){ msg.textContent = res.why || 'Not saved.'; return; }
    close();
    var t = res.run.totals;
    var what = { draft:'Saved as a draft. Nothing has been paid or posted.',
                 pending:'Sent to an admin for approval. An admin sees a red alert until it is approved or denied.',
                 approved:'Saved as approved — the checks are on the Friday checks-due list.',
                 paid:'Saved as paid — it counts in year-to-date and the tax figures.' }[status];
    alert('✅ Payroll week '+nice(wk.start)+' → '+nice(wk.end)+' entered by hand\n\n'+res.run.lines.length+' check'+(res.run.lines.length===1?'':'s')+' · gross '+money(t.gross)+' · net '+money(t.net)+'\n\n'+what);
    try{ if(W._gcOpenPayrollTab) W._gcOpenPayrollTab('approvals'); else rerender(); }catch(e){}
  }
  [['_pmDraft','draft'],['_pmSend','pending'],['_pmApproved','approved'],['_pmPaid','paid']].forEach(function(x){
    var b = $(x[0]); if(b) b.onclick = function(){ save(x[1], b); };
  });

  if(opts.addAll) profs.forEach(function(x){ add(x.name); });
  draw();
  await setWeek(wk);
  return ov;
};

/* ── delete / void ────────────────────────────────────────────────────────── */
function isPaid(r){
  if(!r) return false;
  if(low(r.status) === 'paid') return true;
  return (r.lines||[]).some(function(L){ return L && (L.paidOut === true || low(L.status) === 'paid'); });
}
function mine(r){
  var m = low(me()); if(!m || !r) return false;
  return [r.createdBy, r.enteredBy, r.submittedBy].some(function(x){ return x && low(x) === m; });
}
/* what this person may do with a run */
W._gcPayRunCan = function(r){
  var no = { del:false, voidIt:false, why:'' };
  if(!r) return no;
  var st = low(r.status);
  if(st === 'voided') return { del:false, voidIt:false, why:'This run is voided — it stays on record.' };
  if(isPaid(r)) return isAdmin() ? { del:false, voidIt:true, why:'A paid run cannot be deleted — void it instead.' }
                                 : { del:false, voidIt:false, why:'A paid run cannot be deleted. An admin can void it.' };
  if(isAdmin()) return { del:true, voidIt:false, why:'' };
  if(isOffice() && (st === 'draft' || st === '') && mine(r)) return { del:true, voidIt:false, why:'' };
  return { del:false, voidIt:false, why:'The office can delete only its own drafts. Ask an admin to delete this run.' };
};
/* the run's rows in the books: wages + employer taxes (both posting paths) and the employee payment history */
async function unbook(r){
  var id = String(r.id), out = { register:0, payments:0 };
  try{
    var reg = await W.idbGet('gcAcctRegister'); reg = Array.isArray(reg) ? reg : [];
    var rows = reg.filter(function(x){
      var s = String((x && x.srcInvId) || '');
      return s.indexOf('PAYROLL_'+id+'_') === 0 || s.indexOf('PAYROLL:'+id+'#') === 0 || s === 'PAYROLLTAX:'+id;
    });
    if(rows.length){
      if(typeof W._gcRegDeleteRows === 'function'){ await W._gcRegDeleteRows(rows); out.register = rows.length; }
      else if(typeof W._gcTombstone === 'function'){ rows.forEach(function(x){ W._gcTombstone('gcAcctRegister', x.id != null && x.id !== '' ? x.id : x._id); }); out.register = rows.length; }
    }
  }catch(e){}
  try{
    var K = 'gc_employee_payments';
    var l = JSON.parse(localStorage.getItem(K) || '[]'); if(!Array.isArray(l)) l = [];
    var gone = l.filter(function(x){ return x && String(x.id||'').indexOf('PAYROLL_'+id+'_') === 0; });
    if(gone.length){
      gone.forEach(function(x){ try{ if(W._gcTombstone) W._gcTombstone(K, x.id); }catch(e){} try{ if(W._gcxDel) W._gcxDel(K, x.id); }catch(e){} });
      var kept = l.filter(function(x){ return gone.indexOf(x) < 0; });
      localStorage.setItem(K, JSON.stringify(kept));
      try{ if(W._supaUpsert) W._supaUpsert(K, kept); }catch(e){}
      out.payments = gone.length;
    }
  }catch(e){}
  return out;
}
function logDelete(r, t, booked){
  try{
    var why = 'payroll week '+(ymd(r.from) || '?')+' → '+(runWeekEnd(r) || '?')+' · '+stLabel(r)+' · '+((r.lines||[]).length)+' checks · net '+money(t.net)
      +(booked && booked.register ? ' · '+booked.register+' book row(s) taken out' : '');
    var h = JSON.parse(localStorage.getItem('gc_delete_log') || '[]'); if(!Array.isArray(h)) h = [];
    var e = null;
    for(var i = h.length-1; i >= 0 && i >= h.length-5; i--){ if(h[i] && h[i].list === 'payrollRuns' && String(h[i].id) === String(r.id)){ e = h[i]; break; } }
    if(!e){ e = { list:'payrollRuns', id:String(r.id), deletedAt:nowISO(), by:'' }; h.push(e); }
    e.why = why; e.byName = me(); e.status = low(r.status);
    if(h.length > 500) h = h.slice(-500);
    localStorage.setItem('gc_delete_log', JSON.stringify(h));
  }catch(e2){}
}
W._gcPayRunDelete = async function(runId, opts){
  opts = opts || {};
  var p = P(); if(!p) return { ok:false, why:'Payroll is still loading.' };
  var all = await allRuns();
  var r = all.filter(function(x){ return x && String(x.id) === String(runId); })[0];
  if(!r){ if(!opts.quiet) alert('That payroll run is not here any more.'); return { ok:false, why:'not found' }; }
  var c = W._gcPayRunCan(r);
  if(!c.del){ if(!opts.quiet) alert(c.why || 'This run cannot be deleted.'); return { ok:false, why:c.why || 'not allowed' }; }
  var t = runTotals(r), st = low(r.status), n = (r.lines||[]).length;
  var q = 'Delete the payroll run for the week '+runWeekLabel(r)+'?\n\n'
    + stLabel(r)+' · '+n+' check'+(n===1?'':'s')+' · total '+money(t.net)+' net ('+money(t.gross)+' gross)'
    + (st === 'approved' ? '\n\nIt was approved: its wages and employer taxes come back out of the books, and the checks come off the checks-due list.' : '\n\nNothing has been paid on it.')
    + '\n\nThis cannot be undone.';
  if(!opts.noAsk && !confirm(q)) return { ok:false, why:'cancelled' };
  /* the app's delete list, the same two calls every other list uses */
  try{ if(W._gcTombstone) W._gcTombstone('payrollRuns', r.id); }catch(e){}
  try{ if(W._gcxDel) W._gcxDel('payrollRuns', r.id); }catch(e){}
  if(!W._gcTombstone && !W._gcxDel){
    try{ var tm = JSON.parse(localStorage.getItem('gc_tombstones') || '{}') || {}; tm['payrollRuns:'+r.id] = nowISO(); localStorage.setItem('gc_tombstones', JSON.stringify(tm)); if(W._supaUpsert) W._supaUpsert('gc_tombstones', tm); }catch(e){}
  }
  var fresh = await allRuns();
  await p.saveRuns(fresh.filter(function(x){ return x && String(x.id) !== String(r.id); }));
  var booked = (st === 'approved') ? await unbook(r) : null;
  logDelete(r, t, booked);
  try{ console.log('[GC] Payroll run deleted: '+runWeekLabel(r)+' · '+stLabel(r)+' · net '+money(t.net)+' (by '+me()+')'); }catch(e){}
  rerender();
  return { ok:true, booked:booked };
};
W._gcPayRunVoid = async function(runId, opts){
  opts = opts || {};
  var p = P(); if(!p) return { ok:false, why:'Payroll is still loading.' };
  if(!isAdmin()){ if(!opts.quiet) alert('Only an admin can void payroll.'); return { ok:false, why:'Only an admin can void payroll.' }; }
  var all = await allRuns();
  var r = all.filter(function(x){ return x && String(x.id) === String(runId); })[0];
  if(!r){ if(!opts.quiet) alert('That payroll run is not here any more.'); return { ok:false, why:'not found' }; }
  var c = W._gcPayRunCan(r);
  if(!c.voidIt){ var why = low(r.status) === 'voided' ? 'This run is already voided.' : 'Only a paid run is voided. A run that is not paid can be deleted.'; if(!opts.quiet) alert(why); return { ok:false, why:why }; }
  var t = runTotals(r), n = (r.lines||[]).length;
  var typed = opts.typed != null ? opts.typed : prompt('Type VOID to void the PAID payroll run for the week '+runWeekLabel(r)+'.\n\n'
    + n+' check'+(n===1?'':'s')+' · total '+money(t.net)+' net ('+money(t.gross)+' gross).\n\n'
    + 'It stays on record marked VOIDED and stops counting in totals, year-to-date, the tax figures and the checks due; its wages come back out of the books.');
  if(typed === null || typed === undefined) return { ok:false, why:'cancelled' };
  if(String(typed).trim().toUpperCase() !== 'VOID'){ if(!opts.quiet) alert('Not voided — type the word VOID to void a paid run.'); return { ok:false, why:'not confirmed' }; }
  var now = nowISO(), who = me();
  r.voidedFrom = r.status; r.status = 'voided'; r.voidedBy = who; r.voidedAt = now; r.updatedAt = now;
  if(opts.reason) r.voidReason = String(opts.reason);
  r.history = (Array.isArray(r.history) ? r.history : []).concat([{ at:now, by:who, action:'voided', from:r.voidedFrom, note:'net '+money(t.net)+' · '+n+' checks' }]);
  await p.saveRuns(all);
  var booked = await unbook(r);
  try{ console.log('[GC] Payroll run voided: '+runWeekLabel(r)+' · net '+money(t.net)+' (by '+who+')'); }catch(e){}
  rerender();
  return { ok:true, booked:booked, run:r };
};
/* what has been entered by hand, voided or deleted (this computer's delete log + each run's history) */
W._gcPayrollChanges = async function(){
  var out = [];
  try{ (JSON.parse(localStorage.getItem('gc_delete_log') || '[]') || []).forEach(function(e){ if(e && e.list === 'payrollRuns') out.push({ at:e.deletedAt, by:e.byName || e.by, action:'deleted', run:e.id, note:e.why || '' }); }); }catch(e){}
  (await allRuns()).forEach(function(r){ (Array.isArray(r && r.history) ? r.history : []).forEach(function(h){ out.push({ at:h.at, by:h.by, action:h.action, run:r.id, note:(h.note || '') + (h.status ? (' · '+h.status) : '') }); }); });
  out.sort(function(a, b){ return String(b.at).localeCompare(String(a.at)); });
  return out;
};
try{ console.log('[GC] Payroll: ✍ Enter a week by hand (Run Payroll tab) · delete / void a run (Approvals) — patch PAYMANUAL.'); }catch(e){}
})();
</script>
