#!/usr/bin/env python3
"""Idempotent patch JOBORDER (owner 11/01: "I don't even want on the PMs to have jobs showing that they lost, only show jobs
active or bidding default, jobs finished you can show but far down the list, always show jobs up top and first as
active/bidding jobs"). Display only: no job is changed. See the header of tools/joborder.js.
  1. Projects (React): the tab counts / filters compare the status case-insensitively (window._gcJOCls); a PM's list has no
     lost jobs; the default tab (nothing chosen yet) is All; the table sorts active → bidding → other → finished → lost
     before the chosen column (default: latest activity first); each row says its group (data-gc-jo) so finished rows fold
     under "▸ Finished (n)" and, for admins / office, lost rows under "Show lost (n)".
  2. Dashboard "Active jobs" card: the same order; a PM's card also lists his bidding jobs.
  3. The React job drop-downs (Wt.map → option): the same order, lost last (a chosen lost job still shows).
  4. The message job picker: the same order, then the latest message; no lost jobs for a PM.
  5. <script id="gc-patch-joborder"> at the end: window._gcJobOrder, GrayCo Field's sort hook (_gcFPSort) replaced with this
     order (Field "Pick a Job", the Field home, the role apps' desks; lost only for admins), the folds.
Every find-string must occur exactly once (the option lists: 10). Usage: python3 tools/patch_JOBORDER.py [index.html]"""
import os, re, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
MARK = '/* patch JOBORDER */'
t = open(p, encoding='utf-8').read()
if MARK in t:
    print('JOBORDER: already patched'); sys.exit(0)

def rep(a, b, tag, n=1):
    global t
    c = t.count(a)
    assert c == n, ('JOBORDER anchor', tag, c, a[:100])
    t = t.replace(a, b)

JC = '(window._gcJOCls||function(j){var s=j.status;return Re.includes(s)?"bidding":K.includes(s)?"active":s==="completed"?"finished":s==="lost"?"lost":"other";})'
# 1. Projects
rep('Re=["bidding","estimating"],K=["approved","active","on_hold"],$e=de.filter(j=>Re.includes(j.status)).length,ze=de.filter(j=>K.includes(j.status)).length,et=de.filter(j=>j.status==="completed").length,ve=de.filter(j=>j.status==="lost").length,ye=Ee==="all"?de:Ee==="pipeline"?de.filter(j=>Re.includes(j.status)):Ee==="active"?de.filter(j=>K.includes(j.status)):Ee==="completed"?de.filter(j=>j.status==="completed"):Ee==="lost"?de.filter(j=>j.status==="lost"):de',
    'Re=["bidding","estimating"],K=["approved","active","on_hold"],_jc=' + JC + ',$e=de.filter(j=>_jc(j)==="bidding").length,ze=de.filter(j=>_jc(j)==="active").length,et=de.filter(j=>_jc(j)==="finished").length,ve=de.filter(j=>_jc(j)==="lost").length,ye=Ee==="all"?de:Ee==="pipeline"?de.filter(j=>_jc(j)==="bidding"):Ee==="active"?de.filter(j=>_jc(j)==="active"):Ee==="completed"?de.filter(j=>_jc(j)==="finished"):Ee==="lost"?de.filter(j=>_jc(j)==="lost"):de/* patch JOBORDER: status in any case */',
    'Projects tabs')
rep('de=(!_gcIsOwnerAdmin)?Wt.filter(j=>(window._gcProjVisible?',
    'de=(!_gcIsOwnerAdmin)?Wt.filter(j=>!(window._gcJOCls&&window._gcJOCls(j)==="lost")/* patch JOBORDER: a PM never sees lost jobs */&&(window._gcProjVisible?',
    'Projects: a PM without lost jobs')
rep('localStorage.getItem("gc_proj_subtab")||"pipeline";}catch(e){return "pipeline";}',
    'localStorage.getItem("gc_proj_subtab")||"all";}catch(e){return "all";}/* patch JOBORDER: All (active → bidding → finished folded) */',
    'Projects default tab')
rep('.sort((jt,at)=>{const Tt=xe.k,le=xe.d==="asc"?1:-1;',
    '.sort((jt,at)=>{var _jo=window._gcJOCmp?window._gcJOCmp(jt,at,xe):0;if(_jo)return _jo;/* patch JOBORDER */const Tt=xe.k,le=xe.d==="asc"?1:-1;',
    'Projects sort')
rep('return e.jsxs("tr",{style:{borderBottom:`1px solid ${u.bdr}`,background:jt.status==="lost"?"#fef2f210":""},children:[',
    'return e.jsxs("tr",{"data-gc-jo":(window._gcJOCls?window._gcJOCls(jt):""),style:{borderBottom:`1px solid ${u.bdr}`,background:jt.status==="lost"?"#fef2f210":""},children:[',
    'Projects rows')
# 2. dashboard card
BID = '||(!y&&window._gcJOCls&&window._gcJOCls(N)==="bidding")'
rep('T.filter(N=>["active","approved","completed","complete"].includes(N.status)).length>0&&e.jsxs("div",{"data-gc-jobs":"1"',
    'T.filter(N=>["active","approved","completed","complete"].includes(N.status)' + BID + ').length>0&&e.jsxs("div",{"data-gc-jobs":"1"',
    'dashboard card shown')
rep('T.filter(N=>["active","approved","completed","complete"].includes(N.status)).sort((a,b)=>(["completed","complete"].includes(a.status)?1:0)-(["completed","complete"].includes(b.status)?1:0))',
    'T.filter(N=>["active","approved","completed","complete"].includes(N.status)' + BID + ').sort((a,b)=>window._gcJOCmp?window._gcJOCmp(a,b,null):(["completed","complete"].includes(a.status)?1:0)-(["completed","complete"].includes(b.status)?1:0))/* patch JOBORDER */',
    'dashboard card order')
# 3. drop-downs
n0 = len(re.findall(r'Wt\.map\(([A-Za-z_$]{1,4})=>e\.jsxs?\("option",\{value:\1\.id', t))
assert n0 == 10, ('JOBORDER option lists', n0)
t = re.sub(r'Wt\.map\(([A-Za-z_$]{1,4})=>e\.(jsxs?)\("option",\{value:\1\.id', lambda m: '(window._gcJOPick?window._gcJOPick(Wt):Wt).map(' + m.group(1) + '=>e.' + m.group(2) + '("option",{value:' + m.group(1) + '.id', t)
rep('.sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map(le=>e.jsx("option",{value:le.id,',
    '.sort((a,b)=>(window._gcJORank?window._gcJORank(a)-window._gcJORank(b):0)||(a.name||"").localeCompare(b.name||"")).map(le=>e.jsx("option",{value:le.id,',
    'expense job picker')
# 4. message job picker
rep("projects.sort(function(a,b){ var f=window._gcJobMsgLast; return (f?f(b.id):0)-(f?f(a.id):0); });",
    "if(window._gcJOVisible) projects=window._gcJOVisible(projects);\n    projects.sort(function(a,b){ var r=window._gcJORank?window._gcJORank(a)-window._gcJORank(b):0; if(r) return r; var f=window._gcJobMsgLast; return (f?f(b.id):0)-(f?f(a.id):0); });   /* patch JOBORDER */",
    'message picker')
# 5. the script
TAG = '<script id="gc-patch-joborder">'
assert TAG not in t
once = lambda a, tag: (t.count(a) == 1) or (_ for _ in ()).throw(AssertionError(('JOBORDER anchor', tag, t.count(a))))
once("W._gcFPSort = function(list){", 'GrayCo Field sort hook')
once('window._gcProjSeesAll = function(){', 'PROJLEAK')
js = open(os.path.join(here, 'joborder.js'), encoding='utf-8').read().strip() + '\n'
assert '</script' not in js.lower()
assert t.rstrip().endswith('</script>'), 'JOBORDER: page end'
t = t.rstrip() + '\n' + TAG + '\n' + MARK + '\n' + js + '</script>\n'
open(p, 'w', encoding='utf-8').write(t)
print('JOBORDER: patched')
