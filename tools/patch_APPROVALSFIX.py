#!/usr/bin/env python3
"""patch APPROVALSFIX — the navy "My Approvals" sheet stays current and reachable (owner 11/03:
"had to click away for it to approve and actually go off the screen to get to this button").

  1. "You're all caught up!" only when nothing at all is pending: the sheet's own count left out the
     expenses (the red button) and the "other approvals" (Form 941, leads …) that the header counts.
  2. The red "expense to approve" button no longer closes the sheet: the expense view opens on top of it;
     once no expense is left that view closes by itself, back to the sheet.
  3. While open, the sheet re-renders itself when the approval set changes (no click-away / reopen).
Logic only (no styling), so it merges with the white restyle.  Idempotent.
"""
import sys, pathlib
P = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'index.html')
src = P.read_text(encoding='utf-8')
MARK = '/* patch APPROVALSFIX */'
if MARK in src:
    print('already patched'); sys.exit(0)

EDITS = [
 (r"""      if(total===0){ html+='<div style="color:#86efac;padding:28px;text-align:center;font-size:15px;">\u2713 You\'re all caught up!</div>'; }""",
  r"""      var _apfAll=0; try{ var _apfCs=window._gcApprovalCurrent&&window._gcApprovalCurrent(); _apfAll=(_apfCs&&_apfCs.total)||0; }catch(e){}   """ + MARK + r"""
      if(total===0&&!_exC&&!_apfAll){ html+='<div style="color:#86efac;padding:28px;text-align:center;font-size:15px;">\u2713 You\'re all caught up!</div>'; }"""),
 ("""      var _pae=document.getElementById('_paExp'); if(_pae) _pae.onclick=function(){ ov.remove(); if(window._gcOpenExpenseApprovals) window._gcOpenExpenseApprovals(); };""",
  """      var _pae=card.querySelector('#_paExp'); if(_pae) _pae.onclick=function(){ ov.__gcApfExp=true; if(window._gcOpenExpenseApprovals) window._gcOpenExpenseApprovals(); };   """ + MARK),
 ("""    render();
  };

  console.log('[GC] PM approval center loaded.');""",
  """    render();
    """ + MARK + """ /* the sheet stays current by itself while it is open */
    (function(){
      var SI=window.__GC_NATIVE_SETINTERVAL__||setInterval, CI=window.__GC_NATIVE_CLEARINTERVAL__||clearInterval;
      function nExp(){ try{ return window._gcExpenseApprovalsFor?window._gcExpenseApprovalsFor().length:0; }catch(e){ return 0; } }
      function sig(){ var t=''; try{ var cs=window._gcApprovalCurrent&&window._gcApprovalCurrent(); t=cs?(cs.total+'|'+cs.tip):''; }catch(e){} return t+'|'+nExp(); }
      var last=sig(), t=SI(function(){
        if(!ov.parentNode){ CI(t); return; }
        var sh=document.querySelector('._gcSheetOv'), force=false;
        if(ov.__gcApfExp){
          if(sh && document.getElementById('_edApprove')) return;   /* an expense detail is open */
          if(sh && !nExp()){ sh.remove(); sh=null; }
          if(sh) return;
          ov.__gcApfExp=false; force=true;
        }
        var s=sig(); if(!force && s===last) return; last=s;
        if(ov.contains(document.activeElement) && document.activeElement.tagName==='SELECT') return;
        render();
      }, 700);
    })();
  };

  console.log('[GC] PM approval center loaded.');"""),
]
for old, new in EDITS:
    n = src.count(old)
    assert n == 1, ('anchor count %d' % n, old[:90])
for old, new in EDITS:
    src = src.replace(old, new, 1)
P.write_text(src, encoding='utf-8')
print('patched', P)
