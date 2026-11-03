#!/usr/bin/env python3
"""patch PAYREPLACE (owner 11/03, an employee's pay history full of "Draft" / "Denied" every-2-weeks checks, the same
payday 2-3 times: "all this should be changed once i enter actual payroll weekly payments and biweekly commission payments").
Those rows are the old automatic drafts (patch AUTOPAY's keep-it-current draft, made before AUTO-PAYWEEK when the pay
period was two weeks, one random id per computer, so several computers made copies). They were never paid.
  1. __GC_PAY.payReplace / replaceDrafts: when paid payroll is saved (📥 Enter past payroll, ✍ Enter a week by hand as
     approved/paid, or Approve in Run Payroll), that employee's lines in runs that are NOT approved/paid (draft, denied,
     pending) are dropped if the pay date is on/before payrollSettings.pastPayCutoff (default 2026-11-03) or the period
     overlaps a period now paid for that employee. A run left with no lines is removed and tombstoned. Every dropped
     line is copied to the key payrollRetired first. Approved / paid runs are never touched.
  2. runs(): condition-gated self-heal (like PROFDUP): a draft/denied/pending line that is an exact copy (same person,
     same period, same amounts) of another is folded to one; writes once, then never again.
  3. The employee's "Every check" list: approved / paid first, the rest under a collapsed "Drafts (not paid)" row.
Edits index.html + tools/pastpay_tail.js + tools/paymanual_tail.js."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
IDX = os.path.join(H, '..', 'index.html')
MARK = 'patch PAYREPLACE'

ENGINE = r"""/* patch PAYREPLACE: the old automatic drafts give way to the payroll actually paid */
function _prLow(v){ return String(v==null?'':v).trim().toLowerCase().replace(/\s+/g,' '); }
function _prRunDone(r){ var s=_prLow(r&&r.status); return s==='approved' || s==='paid'; }
function _prLineDone(L){ var s=_prLow(L&&L.status); return s==='approved' || s==='paid'; }
function _prFrom(r, L){ return String((L&&L.from)||r.from||r.payDate||'').slice(0,10); }
function _prTo(r, L){ return String((L&&L.to)||r.to||r.payDate||'').slice(0,10); }
function _prTotals(lines){
  var t={gross:0,fed:0,ss:0,med:0,addlMed:0,state:0,otherDed:0,net:0,employerSS:0,employerMed:0,futa:0,suta:0,hours:0};
  (lines||[]).forEach(function(L){ if(!L || L.status==='denied') return; Object.keys(t).forEach(function(k){ t[k]+= k==='hours' ? n2(L.hours)+n2(L.otHours) : n2(L[k]); }); });
  Object.keys(t).forEach(function(k){ t[k]=r2(t[k]); });
  t.irs941=r2(t.fed+t.ss*2+t.med*2+t.addlMed); t.employerTotal=r2(t.employerSS+t.employerMed+t.futa+t.suta); t.totalCost=r2(t.gross+t.employerTotal);
  return t;
}
function _prDrop(list, keep, why, out){   /* keep(run, idx) false -> that line leaves; empty runs leave the list */
  var res=[];
  list.forEach(function(r){
    if(!r || _prRunDone(r) || !Array.isArray(r.lines)){ res.push(r); return; }
    var kept=[], gone=0;
    r.lines.forEach(function(L, i){ if(L && !_prLineDone(L) && !keep(r, L, i)){ gone++; out.retired.push({ runId:r.id, payDate:r.payDate, from:r.from, to:r.to, status:r.status, why:why(r, L), line:L }); } else kept.push(L); });
    if(!gone){ res.push(r); return; }
    out.changed=true;
    if(!kept.length){ out.deadIds.push(String(r.id)); return; }
    r.lines=kept; r.totals=Object.assign({}, r.totals||{}, _prTotals(kept)); r.updatedAt=new Date().toISOString(); res.push(r);
  });
  return res;
}
/* pure: list of runs, { emps:[lines or names] (omit = everyone), cutoff } -> { list, retired, deadIds, changed } */
function payReplace(list, opts){
  opts=opts||{}; var out={ retired:[], deadIds:[], changed:false };
  var cut=String(opts.cutoff||'2026-11-03').slice(0,10), who=null;
  if(Array.isArray(opts.emps)){ who={}; opts.emps.forEach(function(e){ if(!e) return; if(typeof e==='object'){ if(e.empId) who[_prLow(e.empId)]=1; if(e.name) who[_prLow(e.name)]=1; } else who[_prLow(e)]=1; }); }
  var paid={};   /* person -> periods paid */
  (list||[]).forEach(function(r){ if(!r) return; (r.lines||[]).forEach(function(L){
    if(!L || L.status==='denied' || !(_prRunDone(r) || _prLineDone(L))) return;
    var p=[_prFrom(r,L), _prTo(r,L)]; [L.empId, L.name].forEach(function(k){ k=_prLow(k); if(k) (paid[k]=paid[k]||[]).push(p); });
  }); });
  function mine(L){ if(!who) return !!(paid[_prLow(L.empId)] || paid[_prLow(L.name)]); return !!(who[_prLow(L.empId)] || who[_prLow(L.name)]); }
  function overlap(r, L){ var f=_prFrom(r,L), t=_prTo(r,L); return (paid[_prLow(L.empId)]||[]).concat(paid[_prLow(L.name)]||[]).some(function(p){ return f && t && p[0] && p[1] && f<=p[1] && t>=p[0]; }); }
  function before(r){ var d=String(r.payDate||r.to||'').slice(0,10); return !!d && d<=cut; }
  out.list=_prDrop(list||[], function(r, L){ return !(mine(L) && (before(r) || overlap(r, L))); },
    function(r, L){ return before(r) ? 'pay date on/before '+cut : 'period now paid'; }, out);
  return out;
}
/* pure: a draft / denied / pending line that is an exact copy of another (same person, period, amounts) folds to one */
function _prSig(r, L){ return [_prLow(L.name||L.empId), _prFrom(r,L), _prTo(r,L)].concat(['gross','net','fed','ss','med','state'].map(function(k){ return r2(L[k]); })).join('|'); }
function foldDupRuns(list){
  var out={ retired:[], deadIds:[], changed:false }, seen={};
  var rank=function(r){ if(_prRunDone(r)) return 0; var s=_prLow(r.status); return s==='pending'?1:(s==='draft'?2:3); };
  var order=(list||[]).map(function(r, i){ return { r:r, i:i }; }).filter(function(x){ return x.r && Array.isArray(x.r.lines); })
    .sort(function(a, b){ return rank(a.r)-rank(b.r) || a.i-b.i; });
  var drop=new Map();
  order.forEach(function(x){ x.r.lines.forEach(function(L, i){ if(!L) return; var g=_prSig(x.r, L);
    if(seen[g] && !_prRunDone(x.r) && !_prLineDone(L)){ if(!drop.has(x.r)) drop.set(x.r, {}); drop.get(x.r)[i]=1; } else seen[g]=1; }); });
  if(!drop.size){ out.list=list; return out; }
  out.list=_prDrop(list, function(r, L, i){ return !(drop.has(r) && drop.get(r)[i]); }, function(){ return 'exact duplicate'; }, out);
  return out;
}
async function _prArchive(res, reason){
  try{ if(window._gcTombstoneMany && res.deadIds.length) window._gcTombstoneMany(K_RUNS, res.deadIds); }catch(_te){}
  try{ var h=await get('payrollRetired'); h=Array.isArray(h)?h:[]; var at=new Date().toISOString(), by=''; try{ by=me(); }catch(_me){}
    var _hk={}; h.forEach(function(x){ if(x && x.line) _hk[x.runId+'|'+x.why+'|'+_prSig(x, x.line)]=1; });   /* two loads folding at once archive a line once */
    res.retired.forEach(function(x){ var k=x.runId+'|'+x.why+'|'+_prSig(x, x.line); if(_hk[k]) return; _hk[k]=1; h.push(Object.assign({ at:at, by:by, reason:reason }, x)); });
    if(h.length>600) h=h.slice(h.length-600); await put('payrollRetired', h); }catch(_ae){}
  try{ console.log('[GC Payroll] PAYREPLACE: '+reason+' — '+res.retired.length+' unpaid line(s) retired, '+res.deadIds.length+' empty run(s) removed (copies in payrollRetired)'); }catch(_ce){}
}
async function replaceDrafts(emps){
  var l=await runs(), set={}; try{ set=(await settings())||{}; }catch(_se){}
  var res=payReplace(l, { emps:emps, cutoff:set.pastPayCutoff||'2026-11-03' });
  if(res.changed){ await put(K_RUNS, res.list); await _prArchive(res, 'paid payroll entered'); }
  return res;
}
window._gcPayReplace = replaceDrafts;

"""

E = []
# 1. the engine helpers, before the export
E.append((IDX, "/* expose the shared bits to parts 2 and 3 */\nwindow.__GC_PAY = {\n",
          ENGINE + "/* expose the shared bits to parts 2 and 3 */\nwindow.__GC_PAY = {\n"))
E.append((IDX, "  runs:runs, saveRuns:saveRuns, ytdFor:ytdFor, computeLine:computeLine,\n",
          "  runs:runs, saveRuns:saveRuns, ytdFor:ytdFor, computeLine:computeLine,\n"
          "  payReplace:payReplace, foldDupRuns:foldDupRuns, replaceDrafts:replaceDrafts,   /* patch PAYREPLACE */\n"))
# 2. runs(): fold exact duplicates, condition-gated
A = ("  try{ if(window._gcxDead){ var _pmF=l.filter(function(r){ return !(r && r.id!=null && window._gcxDead('payrollRuns', String(r.id))); }); if(_pmF.length!==l.length) l=_pmF; } }catch(_pmE){}\n"
     "  return l; }\n")
B = ("  try{ if(window._gcxDead){ var _pmF=l.filter(function(r){ return !(r && r.id!=null && window._gcxDead('payrollRuns', String(r.id))); }); if(_pmF.length!==l.length) l=_pmF; } }catch(_pmE){}\n"
     "  try{ var _fd=foldDupRuns(l); if(_fd.changed){ l=_fd.list; await put(K_RUNS, l); await _prArchive(_fd, 'duplicate drafts folded'); } }catch(_fdE){}   /* patch PAYREPLACE: no-op once there are no copies */\n"
     "  return l; }\n")
E.append((IDX, A, B))
# 3. Run Payroll → Approve
A = "  r.status='approved'; r.approvedBy=P.me(); r.approvedAt=new Date().toISOString(); r.totals=t;\n  await P.saveRuns(all);\n"
E.append((IDX, A, A + "  try{ if(P.replaceDrafts) await P.replaceDrafts(live); }catch(_rpE){}   /* patch PAYREPLACE */\n"))
# 4. the employee's check list: paid first, drafts collapsed
A = "  checks.sort(function(a,b){ return String(b.run.payDate||'').localeCompare(String(a.run.payDate||'')); });\n"
B = ("  function _prPaid(c){ return c.L.status!=='denied' && (['approved','paid'].indexOf(c.run.status)>=0 || c.L.status==='paid'); }   /* patch PAYREPLACE */\n"
     "  checks.sort(function(a,b){ return (_prPaid(b)-_prPaid(a)) || String(b.run.payDate||'').localeCompare(String(a.run.payDate||'')); });\n"
     "  var _prFirstDraft=-1; checks.some(function(c,i){ if(!_prPaid(c)){ _prFirstDraft=i; return true; } return false; });\n")
E.append((IDX, A, B))
A = ("          var L=c.L;\n          var st=(L.status==='denied')?'denied':(['approved','paid'].indexOf(c.run.status)>=0?'approved':c.run.status);\n"
     "          var h='<tr><td style=\"'+CSS.td+'\">'+esc(c.run.payDate||'—')+'</td>'\n")
B = ("          var L=c.L;\n          var st=(L.status==='denied')?'denied':(['approved','paid'].indexOf(c.run.status)>=0?'approved':c.run.status);\n"
     "          var _prHead = (i===_prFirstDraft) ? '<tr><td colspan=\"11\" style=\"'+CSS.td+'background:#f8fafc;\"><button data-prdr=\"1\" style=\"'+CSS.btn2+'padding:4px 9px;font-size:11px;\">'+(S.showDrafts?'▾':'▸')+' Drafts (not paid) · '+(checks.length-_prFirstDraft)+'</button></td></tr>' : '';   /* patch PAYREPLACE */\n"
     "          if(i>=_prFirstDraft && _prFirstDraft>=0 && !S.showDrafts) return _prHead;\n"
     "          var h=_prHead+'<tr><td style=\"'+CSS.td+'\">'+esc(c.run.payDate||'—')+'</td>'\n")
E.append((IDX, A, B))
A = "  Array.prototype.forEach.call(body.querySelectorAll('[data-cm]'), function(b){\n"
E.append((IDX, A, "  Array.prototype.forEach.call(body.querySelectorAll('[data-prdr]'), function(b){ b.onclick=function(){ S.showDrafts=!S.showDrafts; render(); }; });   /* patch PAYREPLACE */\n" + A))
# 5. 📥 Enter past payroll → Save all
A = "    try{ await p.saveRuns(fresh); }catch(e){ msg.style.color='#b91c1c'; msg.textContent='Could not save: '+(e&&e.message); return; }\n"
B = A + "    try{ var _rp=p.replaceDrafts ? await p.replaceDrafts(live.map(function(r){ return { empId:r.empKey, name:r.name }; })) : null; if(_rp && _rp.changed) fresh=_rp.list; }catch(_rpE){}   /* patch PAYREPLACE */\n"
for P in (IDX, os.path.join(H, 'pastpay_tail.js')): E.append((P, A, B))
# 6. ✍ Enter a week by hand, saved approved / paid
A = "  all.push(run);\n  await p.saveRuns(all);\n  if(status === 'pending'){ try{ if(W._gcPayrollNotify) W._gcPayrollNotify(run); }catch(e){} }\n"
B = A + "  if(status === 'approved' || status === 'paid'){ try{ if(p.replaceDrafts) await p.replaceDrafts(lines); }catch(_rpE){} }   /* patch PAYREPLACE */\n"
for P in (IDX, os.path.join(H, 'paymanual_tail.js')): E.append((P, A, B))

texts = {}
for P, a, b in E:
    if P not in texts: texts[P] = open(P, encoding='utf-8').read()
done = set(P for P, t in texts.items() if MARK in t)
if len(done) == len(texts):
    print('already patched'); sys.exit(0)
for P, a, b in E:
    if P in done: continue
    t = texts[P]
    n = t.count(a)
    if n != 1: print('anchor count %d in %s: %r' % (n, os.path.basename(P), a[:80])); sys.exit(1)
    texts[P] = t.replace(a, b)
for P, t in texts.items():
    if P not in done: open(P, 'w', encoding='utf-8').write(t)
print('patched PAYREPLACE (%d edits, %d files)' % (len(E), len(texts)))
