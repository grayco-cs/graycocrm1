#!/usr/bin/env python3
"""patch LINEAPPR (owner 11/05, Payroll -> Approvals -> "See every check"):
 "need to approve checks and runs by themself and deny by themself if something is wrong and edit hours or one if i need to change it"
 1. Each line of a pending run (admin): "✓ Approve this check" / "✕ Deny this check" (reason) beside Pay stub and ✏️ Edit
    (DRAFTEDIT); Undo stays for a denied line. Approving one check moves that line into its own run (same from / to / payDate,
    history "approved alone by <me>") and runs the page's own approveRun on it (new optional 2nd arg {yes, quiet}: no second
    confirm / alert) — so the register / check number / payroll account / payment history / PAYREPLACE are approveRun's. When no
    line is left waiting the run closes: approved if any check was approved alone, denied if all were denied.
    "✓ Approve all & record" / "Deny run" are unchanged (they act on what is still on the run).
 2. An automatic draft (status 'draft', auto:true) for a payDate that already has a pending / approved / paid run is retired in
    the engine's runs() (archived in payrollRetired, tombstoned) — condition-gated; the tail calls runs() once after load.
 3. 941 / PMPAY / F941_PAST / YTD read lines of approved / paid runs: the approved-alone line LEAVES the original run, so it is
    counted once (tools/tests/test_LINEAPPR_fn.mjs checks it through _gcF941 and _gcPmPayCheck).
 4. version 33.167-2026-11-05-r17q26.
 tools/lineappr_tail.js goes after the last </script>. No tools/*_tail.js holds these anchors.
usage: python3 tools/patch_LINEAPPR.py [index.html]   (in place; idempotent)"""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
INDEX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, '..', 'index.html')
MARK = '/* patch LINEAPPR */'
OLD_V, NEW_V = '33.166-2026-11-05-r17q25', '33.167-2026-11-05-r17q26'
EDITS = [
 # approveRun: optional {yes, quiet} from "✓ Approve this check" (its own confirm / alert)
 ("async function approveRun(runId){",
  "async function approveRun(runId, _la){   " + MARK),
 ("  if(!confirm('Approve '+live.length+' check'+(live.length>1?'s':'')+' totaling '",
  "  if(!(_la&&_la.yes) && !confirm('Approve '+live.length+' check'+(live.length>1?'s':'')+' totaling '"),
 ("  alert('Approved.\\n\\nChecks '",
  "  if(!(_la&&_la.quiet)) alert('Approved.\\n\\nChecks '"),
 # per-line buttons
 ("            +(P.isAdmin()&&r.status==='pending'?('<button data-line=\"'+r.id+'\" data-idx=\"'+i+'\" data-act=\"'+(L.status==='denied'?'pending':'denied')+'\" style=\"'+CSS.btn2+'padding:4px 9px;font-size:11px;color:#dc2626;\">'+(L.status==='denied'?'Undo':'Hold this one')+'</button>'):'')",
  "            +(P.isAdmin()&&r.status==='pending'?(L.status==='denied'?('<button data-line=\"'+r.id+'\" data-idx=\"'+i+'\" data-act=\"pending\" style=\"'+CSS.btn2+'padding:4px 9px;font-size:11px;color:#dc2626;\">Undo</button>'):   " + MARK + "\n"
  "              ('<button data-lappr=\"'+esc(r.id)+'\" data-idx=\"'+i+'\" style=\"'+CSS.btn2+'padding:4px 9px;font-size:11px;color:#166534;font-weight:800;\">✓ Approve this check</button> '\n"
  "              +'<button data-ldeny=\"'+esc(r.id)+'\" data-idx=\"'+i+'\" style=\"'+CSS.btn2+'padding:4px 9px;font-size:11px;color:#dc2626;\">✕ Deny this check</button>')):'')"),
 ("          +'<td style=\"'+CSS.td+'\">'+esc(L.name)+'</td>'",
  "          +'<td style=\"'+CSS.td+'\">'+esc(L.name)+((L.status==='denied'&&L.denyReason)?('<div style=\"font-size:11px;color:#991b1b;\">denied: '+esc(L.denyReason)+'</div>'):'')+'</td>'   " + MARK),
 ("+(r.voidedBy?(' · voided by '",
  "+(r.splitFrom?' · <b>approved alone</b>':'')+((r.splitOff||[]).length?(' · approved alone: '+esc(r.splitOff.map(function(x){ return x.name; }).join(', '))):'')   " + MARK + "\n      +(r.voidedBy?(' · voided by '"),
 ("    b.onclick=function(){ var f=window._gcDraftEditLine||window._gcEditPayLine; if(f) f(b.getAttribute('data-ledit'), +b.getAttribute('data-idx')); };\n  });",
  "    b.onclick=function(){ var f=window._gcDraftEditLine||window._gcEditPayLine; if(f) f(b.getAttribute('data-ledit'), +b.getAttribute('data-idx')); };\n  });\n"
  "  window._gcPayApproveRun=approveRun;   " + MARK + "\n"
  "  Array.prototype.forEach.call(body.querySelectorAll('[data-lappr]'), function(b){\n"
  "    b.onclick=function(){ if(window._gcLineApprove) window._gcLineApprove(b.getAttribute('data-lappr'), +b.getAttribute('data-idx')); };\n  });\n"
  "  Array.prototype.forEach.call(body.querySelectorAll('[data-ldeny]'), function(b){\n"
  "    b.onclick=function(){ if(window._gcLineDeny) window._gcLineDeny(b.getAttribute('data-ldeny'), +b.getAttribute('data-idx')); };\n  });"),
 # Undo clears the reason
 ("  L.status = act;\n  r.totals = totalsOf(r.lines);",
  "  L.status = act; if(act!=='denied'){ delete L.denyReason; delete L.deniedBy; delete L.deniedAt; }   " + MARK + "\n  r.totals = totalsOf(r.lines);"),
 # engine runs(): no automatic draft for a payday that is already being paid — after the tombstone filter, so once it is
 # retired (tombstoned) this is a no-op and writes nothing
 ("  try{ var _fd=foldDupRuns(l);",
  "  try{ var _sd=window._gcLineAppr&&window._gcLineAppr.shadowDrafts(l); if(_sd&&_sd.changed){ l=_sd.list; await put(K_RUNS, l); await _prArchive(_sd, 'automatic draft for a payday already being paid'); _sd.deadIds.forEach(function(id){ try{ if(window._gcxDel) window._gcxDel(K_RUNS, id); }catch(_xe){} }); } }catch(_sdE){}   " + MARK + "\n"
  "  try{ var _fd=foldDupRuns(l);"),
 # To-Do "waiting to approve" reads the stored list: never the shadow draft
 ("window._gcPayrollWaitingToApprove = async function(){\n  var runs=[]; try{ runs = (await window.idbGet('payrollRuns'))||[]; }catch(e){}",
  "window._gcPayrollWaitingToApprove = async function(){\n  var runs=[]; try{ runs = (await window.idbGet('payrollRuns'))||[]; }catch(e){}\n"
  "  try{ if(window._gcLineAppr) runs = window._gcLineAppr.shadowDrafts(runs).list; }catch(_sdE){}   " + MARK),
 # version
 ('<!-- GrayCo CRM Build: ' + OLD_V + ' -->', '<!-- GrayCo CRM Build: ' + NEW_V + ' -->'),
 ('  console.log("[GC] Build ' + OLD_V + '");', '  console.log("[GC] Build ' + NEW_V + '");'),
 ('  var BUILD_ID = "' + OLD_V + '";', '  var BUILD_ID = "' + NEW_V + '";'),
]
src = open(INDEX, encoding='utf-8').read()
if '__GC_PATCH_LINEAPPR__' in src:
    print('already patched'); sys.exit(0)
for a, b in EDITS:
    n = src.count(a); assert n == 1, ('anchor count', n, a[:90]); src = src.replace(a, b)
tail = open(os.path.join(H, 'lineappr_tail.js'), encoding='utf-8').read()
i = src.rfind('</script>'); assert i > 0; i += len('</script>')
src = src[:i] + '\n' + tail.rstrip('\n') + src[i:]
open(INDEX, 'w', encoding='utf-8').write(src)
vt = os.path.join(os.path.dirname(os.path.abspath(INDEX)), 'version.txt')
if os.path.exists(vt):
    open(vt, 'w').write(NEW_V + '\n')
print('patched LINEAPPR')
