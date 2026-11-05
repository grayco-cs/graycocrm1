#!/usr/bin/env python3
"""patch QBMULTI (owner 11/05: "check is quickbooks csv is in crm and make sure everything is right").
A QuickBooks Transaction List by Date lists a bill / invoice once per LINE (ABC Supply: 5 material lines + sales tax).
The importer kept only the biggest line, so 120 of 149 bills (and 7 invoices) came in short (bills $284,701 vs $423,102).
1. parseQb: a transactions file with no account heading rows (a plain list) ADDS the lines of one bill / invoice;
   Transaction Detail by Account (heading rows) keeps its old rule (the A/R / A/P total once).
2. plan: QuickBooks is fact — a bill / invoice the CRM got from QuickBooks before (same QuickBooks key or number) whose
   amount differs is UPDATED to the QuickBooks amount (was kept / sent to the to-do). Hand-entered CRM invoices still
   go to the to-do on a conflict. Re-importing the same file fixes what is already in the CRM."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*QBMULTI*/' in src:
    print('already patched'); sys.exit(0)
def rep(old, new):
    global src
    n = src.count(old)
    assert n == 1, (n, old[:90])
    src = src.replace(old, new)
rep("var m=d.map, recs=[], curName='', curAcct='';",
    "var m=d.map, recs=[], curName='', curAcct='', sawHead=false;/*QBMULTI*/")
rep("if(d.kind==='transactions') curAcct=first; else curName=first; continue; }",
    "if(d.kind==='transactions'){ curAcct=first; sawHead=true; } else curName=first; continue; }")
rep("if(d.kind==='transactions'){ var byK={}, keepR=[]; recs.forEach(function(r){ var k=r.key, big=/^(invoice|bill|salesreceipt|creditmemo)$/.test(r.kind); if(!big || !byK[k]){ if(big) byK[k]=r; keepR.push(r); return; } if(Math.abs(r.amount)>Math.abs(byK[k].amount)){",
    "if(d.kind==='transactions'){ var byK={}, keepR=[]; recs.forEach(function(r){ var k=r.key, big=/^(invoice|bill|salesreceipt|creditmemo)$/.test(r.kind); if(!big || !byK[k]){ if(big){ byK[k]=r; r.lines=1; } keepR.push(r); return; } if(!sawHead){ var b0=byK[k]; b0.amount=Math.round((b0.amount+r.amount)*100)/100; b0.lines=(b0.lines||1)+1; if(!b0.memo && r.memo) b0.memo=r.memo; return; }   /* QBMULTI: a plain Transaction List = one row per line → add them up */ if(Math.abs(r.amount)>Math.abs(byK[k].amount)){")
# 2a. already imported (same key) — QuickBooks amount wins on a QuickBooks record
rep("if(already){ row.action='already'; row.target=already;",
    "if(already && /^(invoice|bill|salesreceipt)$/.test(r.kind) && /quickbooks/i.test(s(already.source)) && I.indexOf(already)>=0 && Math.abs(cents(amtOf(already))-cents(r.amount))>1){ row.target=already; row.action='update'; row.changes={ amt:r.amount, qbAmountWas:num(amtOf(already)) }; if(already.amount!=null) row.changes.amount=r.amount; row.why='QuickBooks is fact: '+r.qbType+(r.num?' #'+r.num:'')+' is '+money(r.amount)+(r.lines>1?' ('+r.lines+' lines)':'')+' — the CRM had '+money(amtOf(already)); plan.counts.updated++; plan.counts.matched++; plan.counts.amountFixed=(plan.counts.amountFixed||0)+1; plan.rows.push(row); return; }   /* QBMULTI */\n    if(already){ row.action='already'; row.target=already;")
# 2b. invoice matched by number, older QuickBooks import without a key
rep("if(Math.abs(cents(amtOf(x))-cents(r.amount))>1){ row.action='todo'; row.why='amount conflict: CRM has '",
    "if(Math.abs(cents(amtOf(x))-cents(r.amount))>1 && /quickbooks/i.test(s(x.source))){ row.target=x; row.action='update'; row.changes={ amt:r.amount, qbAmountWas:num(amtOf(x)) }; if(x.amount!=null) row.changes.amount=r.amount; if(r.open===0 && low(x.status)!=='paid'){ row.changes.status='paid'; row.changes.paid=true; } row.why='QuickBooks is fact: #'+r.num+' is '+money(r.amount)+(r.lines>1?' ('+r.lines+' lines)':'')+' — the CRM had '+money(amtOf(x)); plan.counts.amountFixed=(plan.counts.amountFixed||0)+1; }   /* QBMULTI */\n        else if(Math.abs(cents(amtOf(x))-cents(r.amount))>1){ row.action='todo'; row.why='amount conflict: CRM has '")
# 2c. bill matched by number from an older QuickBooks import
rep("if(bl.length===1){ row.target=bl[0]; row.action='match'; row.why='bill already in the CRM';",
    "if(bl.length===1 && /quickbooks/i.test(s(bl[0].source)) && Math.abs(cents(amtOf(bl[0]))-cents(r.amount))>1){ row.target=bl[0]; row.action='update'; row.changes={ amt:r.amount, qbAmountWas:num(amtOf(bl[0])) }; if(bl[0].amount!=null) row.changes.amount=r.amount; if(!invNo(bl[0]) && r.num) row.changes.invNum=r.num; row.why='QuickBooks is fact: bill'+(r.num?' #'+r.num:'')+' is '+money(r.amount)+(r.lines>1?' ('+r.lines+' lines)':'')+' — the CRM had '+money(amtOf(bl[0])); plan.counts.amountFixed=(plan.counts.amountFixed||0)+1; }   /* QBMULTI */\n      else if(bl.length===1){ row.target=bl[0]; row.action='match'; row.why='bill already in the CRM';")
open(P, 'w', encoding='utf-8').write(src)
print('patched')
