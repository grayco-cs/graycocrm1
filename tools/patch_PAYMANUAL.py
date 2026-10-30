#!/usr/bin/env python3
"""Idempotent patch PAYMANUAL: Payroll — type in any week by hand; delete or void a run.

Owner 10/29: "i need to manually add every week of payroll and delete payroll if i can also".
Before: the hand-entry screen (window._gcManualPayrollEntry) had no button, offered only last/this period and still said
"every two weeks"; only drafts could be deleted, and that delete wrote no delete mark, so the next union push or cloud
pull could bring the run back.
  1. Run Payroll tab: a "✍ Enter a week by hand" button (admins and the office) opens the new screen
     (tools/paymanual_tail.js, window._gcPayManualOpen): any week (week-ending date + This week / Last week), one line
     per person from the payroll profiles, saved into payrollRuns with enteredManually: true; office -> draft or sent
     to an admin, admin -> draft, approved or paid; a warning when a run already exists for that week.
  2. Approvals tab: "🗑 Delete run" for an admin on any run that is not paid, "🗑 Delete draft" for the office on its
     own drafts, "⊘ Void" for an admin on a paid run (typed VOID); a "Voided" chip and an "entered by hand" tag.
     Deletes go through the app's delete list (gc_tombstones: _gcTombstone + _gcxDel).
  3. The payroll page's reader (__GC_PAY.runs) leaves out a run on the delete list.
  4. A voided run is out of the payroll cost, the cash-flow schedule and a person's own pay list (the other readers
     already count only approved/paid runs); the payroll history shows it as VOIDED.
  5. The old hand-entry function opens the new screen; its header says every week.
  6. tools/paymanual_tail.js after the last </script>.
Usage: python3 tools/patch_PAYMANUAL.py [index.html]"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
t = open(p, encoding='utf-8').read()
if '__GC_PAYMANUAL__' in t:
    print('PAYMANUAL: already patched'); sys.exit(0)
MARK = 'patch PAYMANUAL'

def once(old, new):
    global t
    assert t.count(old) == 1, ('PAYMANUAL anchor count != 1', t.count(old), old[:90])
    t = t.replace(old, new)

# 3. the reader: a run on the delete list is never read back
once("async function runs(){ var l=await get(K_RUNS); return Array.isArray(l)?l:[]; }",
     "async function runs(){ var l=await get(K_RUNS); l=Array.isArray(l)?l:[];   /* " + MARK + ": a deleted run (gc_tombstones) is never read back */\n"
     "  try{ if(window._gcxDead){ var _pmF=l.filter(function(r){ return !(r && r.id!=null && window._gcxDead('payrollRuns', String(r.id))); }); if(_pmF.length!==l.length) l=_pmF; } }catch(_pmE){}\n"
     "  return l; }")

# 1. the Run Payroll tab: the button
once("      + '<button id=\"_pCalc\" style=\"'+CSS.btn+'\">Calculate payroll</button>'\n",
     "      + '<button id=\"_pCalc\" style=\"'+CSS.btn+'\">Calculate payroll</button>'\n"
     "      + '<button id=\"_pManual\" title=\"Type in a week of payroll yourself — any week\" style=\"'+CSS.btnG+'margin-left:auto;\">✍ Enter a week by hand</button>'   /* " + MARK + " */\n")
once("  if(S.lines) drawLines(body.querySelector('#_pOut'));",
     "  var _pmB=body.querySelector('#_pManual'); if(_pmB) _pmB.onclick=function(){ if(window._gcPayManualOpen) window._gcPayManualOpen(); else if(window._gcManualPayrollEntry) window._gcManualPayrollEntry(); };   /* " + MARK + " */\n"
     "  if(S.lines) drawLines(body.querySelector('#_pOut'));")

# 2. Approvals tab: delete / void
once("""  Array.prototype.forEach.call(body.querySelectorAll('[data-del]'), function(b){
    b.onclick=async function(){
      if(!confirm('Delete this draft run? Nothing was paid.')) return;
      var l=await P.runs(); await P.saveRuns(l.filter(function(r){ return r.id!==b.getAttribute('data-del'); })); render();
    };
  });""",
     """  Array.prototype.forEach.call(body.querySelectorAll('[data-del]'), function(b){   /* """ + MARK + """: who may delete is checked there; the delete list keeps it deleted */
    b.onclick=function(){ if(window._gcPayRunDelete) window._gcPayRunDelete(b.getAttribute('data-del')); };
  });
  Array.prototype.forEach.call(body.querySelectorAll('[data-void]'), function(b){
    b.onclick=function(){ if(window._gcPayRunVoid) window._gcPayRunVoid(b.getAttribute('data-void')); };
  });""")
once("        +(r.status==='draft'?('<button data-del=\"'+r.id+'\" style=\"'+CSS.btn2+'color:#dc2626;\">Delete draft</button>'):'')",
     "        +(function(){ var c=window._gcPayRunCan?window._gcPayRunCan(r):{del:r.status==='draft'};   /* " + MARK + " */\n"
     "            return (c.del?('<button data-del=\"'+esc(r.id)+'\" title=\"'+esc(c.why||'')+'\" style=\"'+CSS.btn2+'color:#dc2626;\">'+(r.status==='draft'?'🗑 Delete draft':'🗑 Delete run')+'</button>'):'')\n"
     "              +(c.voidIt?('<button data-void=\"'+esc(r.id)+'\" title=\"A paid run is not deleted — void it: it stays on record and stops counting\" style=\"'+CSS.btn2+'color:#991b1b;\">⊘ Void</button>'):''); })()")
once("  var m={draft:['#64748b','Draft'],pending:['#dc2626','Waiting on admin'],approved:['#16a34a','Approved'],paid:['#16a34a','Paid'],denied:['#991b1b','Denied']};",
     "  var m={draft:['#64748b','Draft'],pending:['#dc2626','Waiting on admin'],approved:['#16a34a','Approved'],paid:['#16a34a','Paid'],denied:['#991b1b','Denied'],voided:['#475569','Voided']};   /* " + MARK + ": voided */")
once("      +'<div><b style=\"font-size:14px;\">'+esc(r.from)+' → '+esc(r.to)+'</b> '+statusChip(r.status)",
     "      +'<div><b style=\"font-size:14px;\">'+esc(r.from)+' → '+esc(r.to)+'</b> '+statusChip(r.status)"
     "+(r.enteredManually?' <span style=\"background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:800;\">entered by hand</span>':'')")
once("      +(r.deniedBy?(' · denied by '+esc(r.deniedBy)+(r.denyReason?(' — '+esc(r.denyReason)):'')):'')",
     "      +(r.deniedBy?(' · denied by '+esc(r.deniedBy)+(r.denyReason?(' — '+esc(r.denyReason)):'')):'')"
     "+(r.voidedBy?(' · voided by '+esc(r.voidedBy)+' on '+String(r.voidedAt||'').slice(0,10)+' — kept for the record, not counted'):'')")

# 4. a voided run counts nowhere
once("    if(low(r.status)==='denied'||low(r.status)==='void') return;",
     "    if(low(r.status)==='denied'||low(r.status)==='void'||low(r.status)==='voided') return;   /* " + MARK + " */")
once("    if(st==='void'||st==='denied'||st==='paid'||st==='deleted') return;",
     "    if(st==='void'||st==='voided'||st==='denied'||st==='paid'||st==='deleted') return;   /* " + MARK + " */")
once("      if(low(L.name)!==low(name)) return;\n      out.push({ payday:r.payday||r.date||'',",
     "      if(low(L.name)!==low(name)) return;\n      if(low(r.status)==='voided') return;   /* " + MARK + " */\n      out.push({ payday:r.payday||r.date||'',")
once("              +(run.enteredManually?'<span style=\"font-size:10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:4px;padding:1px 6px;font-weight:700\">entered by hand</span>':'')",
     "              +(run.enteredManually?'<span style=\"font-size:10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:4px;padding:1px 6px;font-weight:700\">entered by hand</span>':'')"
     "+(run.status==='voided'?'<span style=\"font-size:10px;background:#e2e8f0;border:1px solid #94a3b8;border-radius:4px;padding:1px 6px;font-weight:800\">VOIDED — not counted</span>':'')   /* " + MARK + " */")

# 5. the old hand-entry function and its header
once("     • Payroll runs EVERY TWO WEEKS.",
     "     • Payroll runs EVERY WEEK, paid Friday (patch AUTO-PAYWEEK).\n"
     "       Hand entry: Payroll → Run Payroll → \"✍ Enter a week by hand\" (" + MARK + ", window._gcPayManualOpen).")
once("    if(window._gcEnterPastPayRun) return window._gcEnterPastPayRun();",
     "    if(window._gcPayManualOpen) return window._gcPayManualOpen.apply(this, arguments);   /* " + MARK + ": any week, from the payroll profiles */\n"
     "    if(window._gcEnterPastPayRun) return window._gcEnterPastPayRun();")

# 6. the tail
tail = open(os.path.join(here, 'paymanual_tail.js'), encoding='utf-8').read().rstrip('\n')
assert tail.startswith('<script>') and tail.endswith('</script>') and tail.count('</script>') == 1
i = t.rfind('</script>'); assert i > 0
i += len('</script>')
t = t[:i] + '\n' + tail + t[i:]
assert t.count('__GC_PAYMANUAL__') == 3, t.count('__GC_PAYMANUAL__')
open(p, 'w', encoding='utf-8').write(t)
print('PAYMANUAL: patched', p)
