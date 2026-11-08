#!/usr/bin/env python3
"""patch POAUTO (owner 11/5: "the po matches expenses in crm to its correct job, if expenses have a po they need no
approvals"). An expense (receipt, card charge, e-mailed receipt, Home Depot Pro …) whose PO field, memo, description,
notes or job name carries an OPEN job's PO (project.po or its auto PO, e.g. "K795" / "PO K795") is filed to that job
and posted with no approval card ("Auto-filed by PO K795"). No PO, an unknown PO, or a closed job's PO → the normal
approval flow, as before."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*POAUTO*/' in src: print('already patched'); sys.exit(0)
o = "      var job=window._gcExpenseHasMatch(e);\n      var jobId=job?job.id:(e.pid||e.jobId||null);\n      var pm=job?job.pm:(e.pm||null);\n      if(!byId[e.id]){"
assert src.count(o) == 1
n = ("      /*POAUTO*/ if(!byId[e.id]){ var _pj=_gcPoJob(e); if(_pj){ var _now=new Date().toISOString(), _code=_pj.code;\n"
     "        q.unshift({ expId:e.id, jobId:_pj.p.id, pm:_pj.p.pm||null, amount:(e.amt||e.amount||0), payee:(e.payee||e.vendor||e.sub||''), desc:(e.description||e.category||''), matched:true, status:'approved', autoPO:_code, approvedBy:'Auto-filed by PO '+_code, approvedAt:_now, enteredAt:e.enteredAt||e.createdAt||e.date||_now, source:(e.source||'crm') });\n"
     "        try{ var _ex=((window._crm||{}).expenses||[]).map(function(x){ return (x&&x.id===e.id) ? Object.assign({},x,{ pid:_pj.p.id, jobId:_pj.p.id, _posted:true, approved:true, postedHow:'Auto-filed by PO '+_code, autoFiledByPo:_code, postedAt:_now, updatedAt:_now }) : x; }); if(window._gcApplySync) window._gcApplySync('expenses', _ex); }catch(_pe){}\n"
     "        changed=true; return; } }\n" + o)
src = src.replace(o, n)
o2 = "  window._gcScanExpenses = function(){"
assert src.count(o2) == 1
src = src.replace(o2, "  /* POAUTO: the open job whose PO this expense carries (PO field, memo, description, notes, job name) */\n"
    "  function _gcPoJob(e){ try{ var P=((window._crm||{}).projects||[]).filter(function(p){ return p && !p.deleted && !/complete|closed|lost|cancel|archiv|warrant/i.test(String(p.status||'')); });\n"
    "    var txt=' '+[e.po,e.poNumber,e.memo,e.description,e.desc,e.notes,e.jobName,e.job,e.reference,e.ref].filter(Boolean).join(' ')+' ';\n"
    "    var hit=null; P.some(function(p){ return [p.po,p.autoPO].some(function(c){ c=String(c||'').trim(); if(c.length<3) return false; var re=new RegExp('(^|[^A-Za-z0-9])(PO\\\\s*#?\\\\s*)?'+c.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+'([^A-Za-z0-9]|$)','i'); if(String(e.po||e.poNumber||'').trim().toLowerCase()===c.toLowerCase() || re.test(txt)){ hit={ p:p, code:c }; return true; } return false; }); });\n"
    "    return hit; }catch(_e){ return null; } }\n" + o2)
open(P, 'w', encoding='utf-8').write(src); print('patched')

# 11/8 follow-up (applied by hand, see git): the expense is saved through window._setExpenses (falls back to _gcApplySync) so the job shows it at once
