#!/usr/bin/env python3
"""patch JOBLINK — owner 11/23 (a schedule row: the job name "ROTC Cordova" in its colour, the small blue "PO: T724" pill,
then the person): "want to be able to click that to open up the job".

  python3 tools/patch_JOBLINK.py [index.html]

The PO pill (the React app's one `or` component — Schedule list + calendar, the Project column of the money tables, the
sub-invoice table, a lead / estimate header, a job's Upcoming schedule) now OPENS THE JOB (window._gcGoToTaskJob — the
CRM's open-the-job jump); right-click / press-and-hold still copies the PO. The job name next to the pill opens the job
too, in every place that shows that name + pill pattern: Schedule list, Schedule calendar, the Project column, the
sub-invoice table. Every anchor must occur exactly once; the mark /* patch JOBLINK */ is only inside JS comments.
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'index.html')
MARK = '/* patch JOBLINK */'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_JOBLINK__' in src:
    print('already patched'); sys.exit(0)
assert 'JOBLINK' not in src, 'the mark is already used'

def once(a, b):
    global src
    n = src.count(a)
    assert n == 1, ('anchor count', n, a[:90])
    src = src.replace(a, b)

def name(pidx, inner):
    return MARK + 'e.jsx("span",{className:"gc-joblink",role:"link",title:"Open the job","data-gc-joblink":' + pidx + ',onClick:function(_jl){window._gcJobLink&&window._gcJobLink(' + pidx + ',_jl)},children:' + inner + '})'

# the PO pill: a click opens the job; right-click / press-and-hold copies the PO
once('onClick:_=>{_.stopPropagation(),navigator.clipboard.writeText(H).then(()=>se("PO "+H+" copied")).catch(()=>{})},title:"Click to copy PO "+H,',
     'onClick:' + MARK + '_=>{window._gcJobLink?window._gcJobLink(g,_):(_.stopPropagation(),navigator.clipboard.writeText(H).then(()=>se("PO "+H+" copied")).catch(()=>{}))},'
     'onContextMenu:_=>{_.preventDefault(),_.stopPropagation();try{navigator.clipboard.writeText(H).then(()=>se("PO "+H+" copied")).catch(()=>{})}catch(_c){}},'
     'role:"link",className:"gc-jobpo","data-gc-joblink":g,title:"Open the job \\u00b7 right-click (or press and hold) to copy PO "+H,')
# Schedule calendar cell: the job name
once('children:[((ve=_cWt.find(ye=>ye.id===$e.pid))==null?void 0:ve.name)||""," ",e.jsx(__gcStable("or",or),{pid:$e.pid})]',
     'children:[' + name('$e.pid', '((ve=_cWt.find(ye=>ye.id===$e.pid))==null?void 0:ve.name)||""') + '," ",e.jsx(__gcStable("or",or),{pid:$e.pid})]')
# Schedule list row: the job name (in its colour)
once('e.jsx("span",{style:{color:xe,fontWeight:600},children:((de=Wt.find(Oe=>Oe.id===F.pid))==null?void 0:de.name)||"—"})',
     'e.jsx("span",{style:{color:xe,fontWeight:600},' + MARK + 'className:F.pid?"gc-joblink":void 0,role:F.pid?"link":void 0,title:F.pid?"Open the job":void 0,"data-gc-joblink":F.pid||void 0,onClick:F.pid?function(_jl){window._gcJobLink&&window._gcJobLink(F.pid,_jl)}:void 0,children:((de=Wt.find(Oe=>Oe.id===F.pid))==null?void 0:de.name)||"—"})')
# sub-invoice table: the job name
once('return Re?e.jsxs("span",{children:[Re.name," ",e.jsx(__gcStable("or",or),{pid:W.pid})]})',
     'return Re?e.jsxs("span",{children:[' + name('W.pid', 'Re.name') + '," ",e.jsx(__gcStable("or",or),{pid:W.pid})]})')
# the Project column (money tables)
once('return te?e.jsxs("span",{children:[te.name," ",e.jsx(__gcStable("or",or),{pid:g.pid})]}):"—"',
     'return te?e.jsxs("span",{children:[' + name('g.pid', 'te.name') + '," ",e.jsx(__gcStable("or",or),{pid:g.pid})]}):"—"')

JS = r'''<script id="gc-patch-joblink">
/* __GC_PATCH_JOBLINK__ — a job name + "PO: …" pill opens the job (owner 11/23: "want to be able to click that to open up the job").
   window._gcJobLink(pid, event): the click goes no further (the row / calendar cell under it keeps its own click) and the CRM's
   open-the-job jump (window._gcGoToTaskJob) opens the job. tools/patch_JOBLINK.py */
(function(W){
'use strict';
if (W.__GC_PATCH_JOBLINK__) return; W.__GC_PATCH_JOBLINK__ = true;
W._gcJobLink = function(pid, ev){
  try { if (ev) { if (ev.stopPropagation) ev.stopPropagation(); if (ev.preventDefault) ev.preventDefault(); } } catch (e) {}
  pid = pid == null ? '' : String(pid); if (!pid) return false;
  try { if (typeof W._gcGoToTaskJob === 'function') { W._gcGoToTaskJob(pid, ''); return true; } } catch (e) { try { console.warn('[GC JOBLINK]', e && e.message || e); } catch (x) {} }
  try { sessionStorage.setItem('grayco_openpid', pid); if (W._setView) W._setView('projects'); } catch (e) {}
  return true;
};
try { var st = document.createElement('style'); st.id = 'gc-joblink-css';
  st.textContent = '.gc-joblink,.gc-jobpo{cursor:pointer}.gc-joblink:hover,.gc-joblink:focus-visible{text-decoration:underline;text-underline-offset:2px}.gc-jobpo:hover{filter:brightness(.92);text-decoration:underline}';
  (document.head || document.documentElement).appendChild(st); } catch (e) {}
})(window);
</script>
'''
a = '<script id="gc-patch-apprnosend">'
assert src.count(a) == 1
end = src.index('</script>', src.index(a)) + len('</script>')
assert src[end:end + 1] == '\n'
src = src[:end + 1] + JS + src[end + 1:]
assert src.count('<script id="gc-patch-joblink">') == 1
open(path, 'w', encoding='utf-8').write(src)
print('JOBLINK applied')
