#!/usr/bin/env python3
"""patch DONEPCT (owner 11/20, desk Projects table):
  1. "if jobs are completed they should be 100" — a job whose status / stage is complete(d) / closed / finished / done shows
     100 % and a full green bar in the Projects table's STATUS cell (and on GrayCo Field's progress job list); setting a job
     Completed saves pct 100 through the normal save (the STATUS dropdown already calls _gcSetProjectPct(id,100); any
     _gcxPatchJob write of a done status now carries pct 100 too). Nothing bulk-writes old jobs: the display rule covers them.
  2. "i dont want this share job button … on this main screen" — the 🏢 ▾ (share / Mitigation / Environmental part) pill is
     hidden on the desk Projects table rows (still on the job page). New Project and Edit Project get "Shared with"
     checkboxes next to their Company select (job.sharedWith, the same field 🏢 ▾ → 🔗 Share writes), saved with the form."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
MARK = '__GC_PATCH_DONEPCT__'
if MARK in src: print('already patched'); sys.exit(0)
def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:80], s.count(old))
    return s.replace(old, new)

SH = 'window._gcDonePct?window._gcDonePct(jt):(jt.pct||0)'
# the desk Projects table STATUS cell: number box (keyed so it re-reads when the shown % changes) + bar
src = once(src, 'defaultValue:(jt.pct||0),title:"% complete',
           'key:"dp"+(' + SH + '),defaultValue:(' + SH + ')/* patch DONEPCT */,title:"% complete')
src = once(src, 'children:e.jsx("div",{style:{width:Math.min(100,Math.max(0,jt.pct||0))+"%",height:5,background:(jt.pct||0)>=100?',
           'children:e.jsx("div",{style:{width:Math.min(100,Math.max(0,' + SH + '))+"%",height:5,background:(' + SH + ')>=100/* patch DONEPCT */?')
# GrayCo Field progress: the job list buttons
src = once(src, "var pct=Math.round(j.pct||j.ccProgressPct||0);\n        html+='<button class=\"_fpJob\"",
           "var pct=window._gcDonePct?window._gcDonePct(j):Math.round(j.pct||j.ccProgressPct||0);   /* patch DONEPCT */\n        html+='<button class=\"_fpJob\"")
# New Project (y / T) and Edit Project (z / De): "Shared with" next to Company
NEWCO = 'onChange:j=>T({...y,companyId:j.target.value}),children:(window._gcCo?window._gcCo.list():[{id:"construction",short:"Construction",icon:"🏗"}]).map(o=>e.jsx("option",{value:o.id,children:o.icon+" "+o.short},o.id))})}),'
src = once(src, NEWCO, NEWCO + 'window._gcCoShareField?window._gcCoShareField(e,re,y,function(v){T(function(q){return {...q,sharedWith:v}})}):null/* patch DONEPCT */,')
EDCO = 'onChange:G=>De({...z,companyId:G.target.value}),children:(window._gcCo?window._gcCo.list():[{id:"construction",short:"Construction",icon:"🏗"}]).map(o=>e.jsx("option",{value:o.id,children:o.icon+" "+o.short},o.id))})}),'
src = once(src, EDCO, EDCO + 'window._gcCoShareField?window._gcCoShareField(e,re,z,function(v){De(function(q){return {...q,sharedWith:v}})}):null/* patch DONEPCT */,')

TAIL = r'''<script id="gc-patch-donepct">
/* __GC_PATCH_DONEPCT__ — see tools/patch_DONEPCT.py. A done job shows 100 %; a done status saves pct 100; no 🏢 ▾ on the desk
   Projects rows; "Shared with" in New / Edit Project. */
(function(W){
'use strict';
var D = W.document;
var DONE = /^(complete|completed|closed|finished|done)$/i;
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function isDone(p){ return !!p && (DONE.test(s(p.status)) || DONE.test(s(p.stage))); }
W._gcJobIsDone = isDone;
W._gcDonePct = function(p){
  if (isDone(p)) return 100;
  var v = parseFloat(p && (p.pct != null && p.pct !== '' ? p.pct : p.ccProgressPct)); return isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
};
/* any patch-path write of a done status carries pct 100 (the STATUS dropdown saves it through _gcSetProjectPct) */
function wrapPatch(){
  var f = W._gcxPatchJob; if (typeof f !== 'function' || f.__dp) return;
  var w = function(pid, patch, why){
    try { if (patch && typeof patch === 'object' && DONE.test(s(patch.status)) && patch.pct == null) patch = Object.assign({}, patch, { pct: 100 }); } catch (e) {}
    return f.apply(this, [pid, patch].concat([].slice.call(arguments, 2)));
  };
  try { Object.keys(f).forEach(function(k){ if (!(k in w)) w[k] = f[k]; }); } catch (e) {}
  w.__dp = 1; W._gcxPatchJob = w;
}
/* New / Edit Project: "Shared with" — the companies other than the job's own; job.sharedWith (patch MULTICO-LINK's field) */
W._gcCoShareField = function(e, Re, job, set){
  var C = W._gcCo; if (!C || !e || !Re || !job) return null;
  var own = s(job.companyId) && C.valid(job.companyId) ? job.companyId : C.ofJob(job), sw = arr(job.sharedWith);
  var kids = C.list().filter(function(c){ return c.id !== own; }).map(function(c){
    var on = sw.indexOf(c.id) > -1;
    return e.jsxs('label', { key: c.id, style: { display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 10, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }, children: [
      e.jsx('input', { type: 'checkbox', 'data-co-sharefield': c.id, checked: on, onChange: function(ev){ var n = sw.filter(function(x){ return x !== c.id; }); if (ev.target.checked) n.push(c.id); set(n); } }),
      (c.icon ? c.icon + ' ' : '') + c.short] });
  });
  return e.jsx(Re, { l: 'Shared with', children: e.jsx('div', { title: 'The job (and its photos) also shows in that company — its money stays with its own company', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', minHeight: 30 }, children: kids }) });
};
var css = D.createElement('style'); css.id = 'gc-donepct-css';
css.textContent = '#root table[data-gcx-projects] [data-co-jobmenu]{display:none!important}';
(D.head || D.documentElement).appendChild(css);
var n = 0; (function again(){ wrapPatch(); if (++n < 40) setTimeout(again, 750); })();
})(window);
</script>
'''
open(P, 'w', encoding='utf-8').write(src.rstrip('\n') + '\n' + TAIL); print('patched')
