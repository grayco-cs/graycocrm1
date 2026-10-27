#!/usr/bin/env python3
"""Idempotent patch PROJLAYOUT: the job (project) page, owner 10/27.

  1. "Project Info" + "Financial Summary" sit at the TOP of the job page (under the job title, above the money strip and
     the tabs) and show on every tab, not only Overview. One click folds them into a one-line summary
     (client · type · PM · status · contract · spent [· profit · margin for admin / the job's PM]); the fold is
     remembered per person on this device (localStorage gc_pl_col_<user>, kept on sign-out like the tab order).
     The page root becomes a flex column and pins, by CSS order only (nothing is moved in the DOM, so React and the
     patches that add bars are never fought): ← All Projects, the COMMCO hold / materials banner, the job title,
     the Edit form, then Project Info + Financial Summary; everything else keeps its order below.
  2. 🧹 Duplicates is in the 💎 menu (admins / office, the menu's own rule) and opens the same Duplicates review the
     loose button opened (patch DEDUP's _gcDedupe.open). The loose button (it was meant for the Approvals page and
     stayed behind above "← All Projects" after leaving it) is no longer drawn anywhere.
  3. The job header: one clean action row under the title — "📷 Open GrayCo Photos" and "✉️ E-mail …" side by side,
     wrapping, nothing overflowing. No CompanyCam wording on the job page (CompanyCam stays behind the scenes).
  4. Project Info → Type: when the saved type is residential but the job-type rule (patch AUTOCOM, _gcJA.groupOf,
     reading everything except the saved type: bid source, the customer record, a company client) says commercial,
     admins / the job's PM see "Looks commercial — change?"; one click sets Commercial Reno.
Usage: python3 tools/patch_PROJLAYOUT.py [index.html]   ("already patched" on a rerun)
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch PROJLAYOUT v1 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def cnt(old, what):
    n = src.count(old)
    assert n == 1, ('anchor count != 1', what, n)

def once(old, new, what):
    global src
    cnt(old, what)
    src = src.replace(old, new, 1)

# ── 1. the React job page ──────────────────────────────────────────────────────────────────────────────────────────
# 1a. the root (flex column), the back button, the header, the title row
once('return e.jsxs("div",{children:[e.jsx("button",{style:{...ot,fontSize:11,padding:"4px 10px",marginBottom:10},onClick:()=>{Pe(null),_("overview")},children:"← All Projects"}),e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10},children:[e.jsxs("div",{children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"},children:[e.jsx("h1",{style:{fontSize:20,fontWeight:800,margin:0},children:j.name})',
     'return e.jsxs("div",{className:"gc-pl-root","data-pid":j.id,children:[e.jsx("button",{className:"gc-pl-back",style:{...ot,fontSize:11,padding:"4px 10px",marginBottom:10},onClick:()=>{Pe(null),_("overview")},children:"← All Projects"}),e.jsxs("div",{className:"gc-pl-head",style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10},children:[e.jsxs("div",{className:"gc-pl-hl",children:[e.jsxs("div",{className:"gc-pl-title",style:{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"},children:[e.jsx("h1",{style:{fontSize:20,fontWeight:800,margin:0},children:j.name})',
     'job page root + header')
# 1b. the title row ends with a line break: the photo / e-mail buttons the patches add go on the line under the title
once('children:["PO ",j.autoPO]})]}),e.jsxs("div",{style:{fontSize:12,color:u.tx2},children:[j.client," · "',
     'children:["PO ",j.autoPO]}),e.jsx("span",{className:"gc-pl-brk","aria-hidden":"true"})]}),e.jsxs("div",{style:{fontSize:12,color:u.tx2},children:[j.client," · "',
     'title row break')

# 1c. cut Project Info + Financial Summary out of the Overview grid
OV = 'H==="overview"&&e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},children:['
PI = 'e.jsxs("div",{style:Ke,children:[e.jsx("b",{style:{fontSize:13},children:"Project Info"}),'
FIN_END = '["Pending Invoices",ue(Mt.filter(G=>G.status!=="paid").reduce((G,St)=>G+(parseFloat(St.amt)||0),0))]].map(([G,St])=>e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${u.bdr}`,fontSize:12},children:[e.jsx("span",{style:{color:u.tx2},children:G}),e.jsx("b",{children:St})]},G))]})'
cnt(OV + PI, 'overview grid start')
cnt(FIN_END + ',', 'financial summary end')
a = src.index(OV + PI) + len(OV)
b = src.index(FIN_END + ',', a) + len(FIN_END)
assert b - a < 9000, ('cards segment too long', b - a)
cards = src[a:b]
assert cards.count('"Financial Summary"') == 1 and cards.count('"Project Info"') == 1
src = src[:a] + src[b + 1:]          # drop the cards and the comma after them

# the cards: class + section id; Type row hint
cards = cards.replace(PI, 'e.jsxs("div",{style:Ke,className:"gc-pl-card","data-section":"pinfo",children:[e.jsx("b",{style:{fontSize:13},children:"Project Info"}),', 1)
FS = 'e.jsxs("div",{style:Ke,children:[e.jsx("b",{style:{fontSize:13},children:"Financial Summary"}),'
assert cards.count(FS) == 1
cards = cards.replace(FS, 'e.jsxs("div",{style:Ke,className:"gc-pl-card","data-section":"fin",children:[e.jsx("b",{style:{fontSize:13},children:"Financial Summary"}),', 1)
TV = 'e.jsx("b",{children:G==="Address"&&j.address?e.jsxs("a"'
assert cards.count(TV) == 1
cards = cards.replace(TV, 'e.jsx("b",{children:G==="Type"&&(sr.role==="Admin"||j.pm===sr.name)&&window._gcPLTypeHint&&window._gcPLTypeHint(j)?e.jsxs("span",{className:"gc-pl-tyw",children:[St,e.jsx("button",{type:"button",className:"gc-pl-hint",title:"The job-type rule reads this job as commercial (where it came from / the customer). One click sets Commercial Reno.",onClick:function(ev){ev.stopPropagation();window._gcPLFixType&&window._gcPLFixType(j,Wn,Pe)},children:"Looks commercial — change?"})]}):G==="Address"&&j.address?e.jsxs("a"', 1)

# 1d. put them at the top: right after the header (before the Edit form)
INFO = ('e.jsxs("div",{className:(window._gcPL&&window._gcPL.col()?"gc-pl-info gc-pl-col":"gc-pl-info"),"data-section":"info",children:['
        'e.jsxs("div",{className:"gc-pl-bar",children:['
        'e.jsxs("button",{type:"button",className:"gc-pl-tog","aria-expanded":!(window._gcPL&&window._gcPL.col()),title:"Fold / unfold Project Info and Financial Summary",onClick:function(ev){window._gcPL&&window._gcPL.toggle(ev)},children:[e.jsx("span",{className:"gc-pl-car","aria-hidden":"true",children:"▾"}),e.jsx("span",{children:"Project Info & Financial Summary"})]}),'
        'e.jsx("span",{className:"gc-pl-sum",children:[j.client||"No client",j.type,"PM: "+(j.pm||"Unassigned"),j.status,"Contract "+(kt.contract?ue(kt.contract):"— none yet"),"Spent "+ue(kt.spent)].concat((sr.role==="Admin"||j.pm===sr.name)?["Profit "+ue(kt.profit),"Margin "+kt.margin+"%"]:[]).filter(Boolean).join(" · ")})]}),'
        'e.jsxs("div",{className:"gc-pl-cards",children:[' + cards + ']})]})')
once('"✏️ Edit Project"})]})]})]}),q&&e.jsxs("div",{style:{...Ke,marginBottom:12,borderLeft:',
     '"✏️ Edit Project"})]})]})]}),' + INFO + ',q&&e.jsxs("div",{className:"gc-pl-edit",style:{...Ke,marginBottom:12,borderLeft:',
     'info block after the header')

# ── 2. 🧹 Duplicates: in the 💎 menu (admins / office), no loose button ──────────────────────────────────────────
once('{ icon: "\\uD83E\\uDDF9", label: "Duplicates", fn: function(){ if(window._gcOpenDupeReview) window._gcOpenDupeReview(); } },',
     '{ icon: "\\uD83E\\uDDF9", label: "Duplicates", adminOnly: true, fn: function(){ if(window._gcDedupe&&window._gcDedupe.open) window._gcDedupe.open(); else if(window._gcOpenDupeReview) window._gcOpenDupeReview(); } },   ' + MARK,
     '💎 Duplicates item')
once('every(mountApx, 2500);',
     '/* every(mountApx, 2500);   patch PROJLAYOUT: 🧹 Duplicates lives in the 💎 menu now (the loose button stayed behind on other pages) */\n'
     'later(function(){ try { Array.prototype.forEach.call(D.querySelectorAll(\'[data-gcdd-btn]\'), function(b){ b.remove(); }); } catch (e) {} }, 0);',
     'DEDUP loose button')

# ── 3. the job header: "📷 Open GrayCo Photos" only (no CompanyCam wording) ────────────────────────────────────────
once("font-size:12px;font-weight:800;font-family:inherit\">📸 Open in GrayCo Photos</button>'",
     "font-size:12px;font-weight:800;font-family:inherit\">📷 Open GrayCo Photos</button>'",
     'photos button label')
once("+(url?('<a href=\"'+url+'\" target=\"_blank\" rel=\"noreferrer\" style=\"font-size:11px;color:#64748b;text-decoration:underline\">CompanyCam ↗</a>'):'')\n        +'<span style=\"font-size:11px;color:#8a94a6\">Every photo of this job</span>';",
     "+'';   /* patch PROJLAYOUT: no CompanyCam link / wording on the job page (GrayCo Photos is the one photo place) */",
     'CompanyCam link')

# ── 4. the fold is kept on sign-out (a per-person device preference, like the tab order) ─────────────────────────
once("var DEVICE_KEEP_PREFIX = ['gc_taborg_v2_','gc_user_tabs_'];",
     "var DEVICE_KEEP_PREFIX = ['gc_taborg_v2_','gc_user_tabs_','gc_pl_'];   /* patch PROJLAYOUT */",
     'keep prefix')

# ── 5. the tail ────────────────────────────────────────────────────────────────────────────────────────────────
TAIL = r'''<script id="gc-patch-projlayout">
''' + MARK + r'''
/* PROJLAYOUT (owner 10/27): Project Info + Financial Summary at the top of the job page (foldable), a tidy header action
   row, "Looks commercial — change?". Pure CSS ordering + two click handlers: no timers, no observers. */
(function(){
'use strict';
if (window.__GC_PATCH_PROJLAYOUT__) return; window.__GC_PATCH_PROJLAYOUT__ = true;
var W = window, D = document, MEM = {};
function s(v){ return v == null ? '' : String(v); }
function who(){ try { return s(localStorage.getItem('grayco_user')).toLowerCase().replace(/[^a-z0-9@._-]+/g, '_').slice(0, 60); } catch (e) { return ''; } }
function key(){ return 'gc_pl_col_' + who(); }
function lsGet(k){ try { var v = localStorage.getItem(k); return v == null ? MEM[k] : v; } catch (e) { return MEM[k]; } }
function lsSet(k, v){ MEM[k] = v; try { localStorage.setItem(k, v); } catch (e) {} }
var CSS = ''
  + '.gc-pl-root{display:flex;flex-direction:column}'
  + '.gc-pl-root>*{min-width:0}'
  + '.gc-pl-root>button,.gc-pl-root>a{align-self:flex-start}'
  + '.gc-pl-root>.gc-pl-back{order:-6}'
  + '.gc-pl-root>.gccc-wrap{order:-5}'
  + '.gc-pl-root>.gc-pl-head{order:-4}'
  + '.gc-pl-root>.gc-pl-edit{order:-4}'
  + '.gc-pl-root>.gc-pl-info{order:-3}'
  + '.gc-pl-hl{flex:1 1 auto;min-width:0}'
  + '.gc-pl-head>div:last-child{flex:none;margin-left:10px}'
  + '.gc-pl-title>.gc-pl-brk{order:1;flex-basis:100%;height:0;margin:0;padding:0}'
  + '.gc-pl-title>#_gcCCLinkRow{order:2;margin:2px 0 0!important;min-width:0}'
  + '.gc-pl-title>._gcJobMailBtn{order:3;margin:2px 0 0!important;padding:6px 13px!important;font-size:12px!important;white-space:nowrap}'
  + '.gc-pl-info{margin:0 0 12px}'
  + '.gc-pl-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 6px;min-height:28px}'
  + '.gc-pl-tog{display:inline-flex;align-items:center;gap:6px;border:1px solid #d5dbe4;background:#fff;color:#14202e;border-radius:7px;padding:4px 10px;font-weight:700;font-size:12px;font-family:inherit;cursor:pointer;min-height:28px}'
  + '.gc-pl-tog:hover{background:#f3f5f9}.gc-pl-tog:focus-visible{outline:2px solid #2563eb;outline-offset:2px}'
  + '.gc-pl-car{display:inline-block;transition:transform .15s}'
  + '.gc-pl-col .gc-pl-car{transform:rotate(-90deg)}'
  + '.gc-pl-sum{display:none;font-size:12px;color:#475569;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 200px}'
  + '.gc-pl-col .gc-pl-sum{display:block}'
  + '.gc-pl-cards{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}'
  + '.gc-pl-col .gc-pl-cards{display:none}'
  + '@media (max-width:700px){.gc-pl-cards{grid-template-columns:minmax(0,1fr)}}'
  + '.gc-pl-tyw{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}'
  + '.gc-pl-hint{border:1px solid #b45309;background:#fef3c7;color:#78350f;border-radius:6px;padding:1px 7px;font-weight:700;font-size:11px;font-family:inherit;cursor:pointer}'
  + '.gc-pl-hint:hover{background:#fde68a}';
function css(){ if (D.getElementById('gc-pl-css')) return; var st = D.createElement('style'); st.id = 'gc-pl-css'; st.textContent = CSS; (D.head || D.documentElement).appendChild(st); }
css();
W._gcPL = {
  col: function(){ return lsGet(key()) === '1'; },
  toggle: function(ev){
    var btn = ev && ev.currentTarget, box = btn && btn.closest ? btn.closest('.gc-pl-info') : null;
    var c = !(box ? box.classList.contains('gc-pl-col') : W._gcPL.col());
    lsSet(key(), c ? '1' : '0');
    if (box) box.classList.toggle('gc-pl-col', c);
    if (btn) btn.setAttribute('aria-expanded', String(!c));
  }
};
/* the job-type rule (patch AUTOCOM) without the saved type: commercial while the saved type says residential */
W._gcPLTypeHint = function(j){
  try {
    if (!j || !/resid/i.test(s(j.type)) || j.typeHintNo) return false;
    var ja = W._gcJA; if (!ja || typeof ja.groupOf !== 'function') return false;
    return ja.groupOf(Object.assign({}, j, { type: '', jobType: '' })) === 'commercial';
  } catch (e) { return false; }
};
W._gcPLFixType = function(j, setProjects, setOpen){
  if (!j || !j.id) return;
  var at = new Date().toISOString(), T = 'Commercial Reno', patch = { type: T, updatedAt: at, savedAt: at, typeSetBy: s(lsGet('grayco_user')) || 'staff', typeSetFrom: s(j.type) };
  try { (setProjects || W._setProjects)(function(l){ return (l || []).map(function(p){ return p && p.id === j.id ? Object.assign({}, p, patch) : p; }); }); } catch (e) { return; }
  try { if (setOpen) setOpen(Object.assign({}, j, patch)); } catch (e) {}
  try { if (W.GC && W.GC.toast) W.GC.toast('Type changed to ' + T, 'ok'); } catch (e) {}
};
try { console.log('[GC] Job page: Project Info + Financial Summary on top (patch PROJLAYOUT): _gcPL'); } catch (e) {}
})();
</script>
'''
assert TAIL.count('</script>') == 1
src = src.rstrip('\n') + '\n' + TAIL
open(path, 'w', encoding='utf-8').write(src)
print('patched PROJLAYOUT')
