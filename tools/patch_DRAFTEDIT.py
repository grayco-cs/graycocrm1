#!/usr/bin/env python3
"""patch DRAFTEDIT (owner 11/04, Payroll -> Approvals -> "See every check"):
 1. "need to be able to edit these payrolls from here for brittany because her hourly always changes" — every line of a
    draft / pending run has ✏️ Edit (admin): hourly people get an hours box and the line is worked out again by the
    engine (computeLine with gross = reg x rate + OT x rate x 1.5); anyone else gets _gcEditPayLine. The run becomes
    pending, auto:false (the weekly auto draft skips a payday with a pending run), history "hours changed by ...".
    tools/draftedit_tail.js goes after the last </script>.
 2. "pay stub button doesn't work" (it opened after ~20 s) — the PAYSTUBS hook waited on the paystubs server function
    (GET /.netlify/functions/paystubs) before showing anything, on every click, even for drafts. Now the sheet opens at
    once in the in-app viewer; for an approved / paid run the saved stub is fetched in the background (8 s cap) and
    swapped in if the viewer is still showing it.
usage: python3 tools/patch_DRAFTEDIT.py [index.html]   (in place; idempotent). No tools/*_tail.js holds these anchors."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
INDEX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, '..', 'index.html')
MARK = '/* patch DRAFTEDIT */'
EDITS = [
 ("+((P.isAdmin()&&r.status==='pending'&&r.reopenedForEdit&&window._gcEditPayLine)?(",
  "+((P.isAdmin()&&(r.status==='pending'||r.status==='draft')&&(window._gcDraftEditLine||window._gcEditPayLine))?(   " + MARK + "\n            "),
 ("    b.onclick=function(){ if(window._gcEditPayLine) window._gcEditPayLine(b.getAttribute('data-ledit'), +b.getAttribute('data-idx')); };",
  "    window._gcPayTotalsOf=totalsOf;   " + MARK + "\n"
  "    b.onclick=function(){ var f=window._gcDraftEditLine||window._gcEditPayLine; if(f) f(b.getAttribute('data-ledit'), +b.getAttribute('data-idx')); };"),
 ("""    var pp = P(); if (!pp) return old(runId, idx);
    return pp.runs().then(function(all){
      var r = all.find(function(x){ return x.id === runId; }), L = r && (r.lines || [])[idx];
      if (!r || !L) return old(runId, idx);
      return list({ year: s(r.payDate).slice(0, 4), emp: s(L.empId || L.name) }).then(function(o){
        var st = (o.stubs || []).filter(function(x){ return x.runId === runId && (x.empKey === s(L.empId || L.name)); })[0];
        if (st) return openStub(st);
        return old(runId, idx);
      });
    });
""",
  """    var pp = P(); if (!pp) return old(runId, idx);
    /* """ + MARK[3:-3] + """: the sheet opens NOW (the server look-up below took ~20 s); a saved stub replaces it when it comes */
    return Promise.resolve(old(runId, idx)).then(function(){
      var v0 = D.getElementById('gc-viewer');
      return pp.runs().then(function(all){
        var r = all.find(function(x){ return x.id === runId; }), L = r && (r.lines || [])[idx];
        if (!r || !L || ['paid', 'approved'].indexOf(s(r.status)) < 0) return;
        var cap = new Promise(function(res){ ST(function(){ res(null); }, 8000); });
        return Promise.race([list({ year: s(r.payDate).slice(0, 4), emp: s(L.empId || L.name) }), cap]).then(function(o){
          var st = ((o && o.stubs) || []).filter(function(x){ return x.runId === runId && (x.empKey === s(L.empId || L.name)); })[0];
          if (st && v0 && D.getElementById('gc-viewer') === v0) openStub(st);
        });
      });
    }).catch(function(){});
"""),
]
src = open(INDEX, encoding='utf-8').read()
if '__GC_PATCH_DRAFTEDIT__' in src:
    print('already patched'); sys.exit(0)
for a, b in EDITS:
    n = src.count(a); assert n == 1, ('anchor count', n, a[:80]); src = src.replace(a, b)
tail = open(os.path.join(H, 'draftedit_tail.js'), encoding='utf-8').read()
i = src.rfind('</script>'); assert i > 0; i += len('</script>')
src = src[:i] + '\n' + tail.rstrip('\n') + src[i:]
open(INDEX, 'w', encoding='utf-8').write(src)
print('patched DRAFTEDIT')
