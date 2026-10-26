#!/usr/bin/env python3
"""Idempotent patch TOPBAR: the floating round buttons on the right edge move into one fixed, compact toolbar at the
top right (Approve, 💎, 💬, 🎤, 📷, 🖥 Desk, ⚙).  On a phone (<700px) Approve, 💎 and 🎤 stay and the rest go under "⋯".

* The originals are only HIDDEN (CSS, html.gc-tb-on, desk view only); their code stays because other code references them.
  Every toolbar button calls the original's own click (same handler, same role rules).
* Disabled while the toolbar is on: MICDRAG / STAYPUT 'buttons stay put' + 'buttons rebuilt' beats and place(), and the
  NAV auto-avoid dodgeAll()/coversAt().  The field app (_fieldmode) is untouched: the toolbar is off there and they run as before.
* Badges follow the originals through MutationObservers (no new interval); one 6 s visibility-paused timer re-attaches.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = 'id="gc-patch-topbar"'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:70], s.count(old))
    return s.replace(old, new)

TB = "document.documentElement.classList.contains('gc-tb-on')"
# 1. STAYPUT / MICDRAG: stop repositioning while the toolbar is on
src = once(src, "function place(el, k){\n  var m=all()[k];\n",
           "function place(el, k){\n  if(" + TB + ") return false;   /* patch TOPBAR */\n  var m=all()[k];\n")
src = once(src, "window.__GC_BEAT('buttons stay put', function(){\n  if(dragging) return;",
           "window.__GC_BEAT('buttons stay put', function(){\n  if(dragging || " + TB + ") return;")
src = once(src, "window.__GC_BEAT('buttons rebuilt', function(){\n  try{",
           "window.__GC_BEAT('buttons rebuilt', function(){\n  if(" + TB + ") return;\n  try{")
# 2. NAV auto-avoid
src = once(src, "function dodgeAll(){ DODGE.forEach(",
           "function dodgeAll(){ if(" + TB + ") return; DODGE.forEach(")

BLOCK = r'''<script id="gc-patch-topbar">
/* ============================================================================
   GrayCo — TOP-RIGHT TOOLBAR (patch TOPBAR).  The round buttons that floated on the right edge and kept covering things
   now live in one fixed, compact bar at the top right: ✅ Approve · 💎 · 💬 · 🎤 · 📷 · 🖥 Desk · ⚙.
   Each button triggers the ORIGINAL button's own click, so nothing is rewritten and role rules stay (a button whose
   original is missing / hidden is not shown).  Phone (<700px): ✅ 💎 🎤 and a "⋯" menu with the rest.
   ========================================================================== */
(function(){
'use strict';
if(window.__GC_TOPBAR__) return; window.__GC_TOPBAR__=true;
var D=document, H=D.documentElement;
function $(id){ return D.getElementById(id); }
function openPid(){ try{ return sessionStorage.getItem('grayco_openpid')||localStorage.getItem('grayco_openpid')||''; }catch(e){ return ''; } }
function origHidden(el){ return !el || el.style.display==='none' || el.hidden; }
function badgeOf(sel, host){ try{ var out=0, seen=false; var bs=host?host.querySelectorAll(sel):[]; for(var i=0;i<bs.length;i++){ if(bs[i].style.display==='none') continue; var n=parseInt((bs[i].textContent||'').replace(/\D/g,''),10); if(isFinite(n)&&n>0){ out+=n; seen=true; } } return seen?out:0; }catch(e){ return 0; } }

var CSS=''
 +'html.gc-tb-on:not(._fieldmode) #gc-hub-btn,html.gc-tb-on:not(._fieldmode) #_gcApprovalsBtn,html.gc-tb-on:not(._fieldmode) #_gcJobMsgFab,'
 +'html.gc-tb-on:not(._fieldmode) #_gcMicBtn,html.gc-tb-on:not(._fieldmode) #_voiceBtn,html.gc-tb-on:not(._fieldmode) #_fmToggle,'
 +'html.gc-tb-on:not(._fieldmode) #gc-br-settings,html.gc-tb-on:not(._fieldmode) #data-io-toggle,html.gc-tb-on:not(._fieldmode) #_alertBell{display:none!important}'
 +'#gc-topbar{display:none;flex:0 0 auto;align-items:center;gap:6px;margin-left:12px;font-family:Inter,-apple-system,sans-serif}'
 +'#gc-topbar.tb-float{position:fixed;top:8px;right:14px;z-index:9500;margin:0;padding:5px 7px;background:#0c1a2a;border:1px solid #1e3a5f;border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,.28)}'
 +'html.gc-tb-on:not(._fieldmode) #gc-topbar{display:flex}'
 +'#gc-topbar .tb-b{position:relative;width:36px;height:36px;padding:0;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:#e2e8f0;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s,transform .12s}'
 +'#gc-topbar .tb-b:hover{background:rgba(255,255,255,.17);transform:translateY(-1px)}'
 +'#gc-topbar .tb-b:focus-visible{outline:2px solid #d4a017;outline-offset:1px}'
 +'#gc-topbar .tb-b[hidden]{display:none}'
 +'#gc-topbar .tb-appr{background:linear-gradient(135deg,#e3b73c,#b8860b);border-color:#f3d77a;box-shadow:0 0 0 1px rgba(243,215,122,.35)}'
 +'#gc-topbar .tb-appr:hover{background:linear-gradient(135deg,#f0c855,#caa02a)}'
 +'#gc-topbar .tb-n{position:absolute;top:-6px;right:-6px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#dc2626;color:#fff;font:800 10.5px/17px Inter,Arial,sans-serif;text-align:center;border:2px solid #0c1a2a;box-sizing:content-box;pointer-events:none}'
 +'#gc-topbar .tb-more{display:none;font-size:20px;font-weight:800;padding-bottom:4px}'
 +'#gc-tb-pop{position:fixed;top:50px;right:14px;z-index:10001;display:none;min-width:190px;padding:6px;background:#0f1d2f;border:1px solid #1e3a5f;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4)}'
 +'#gc-tb-pop.on{display:block}'
 +'#gc-tb-pop button{position:relative;display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:0;border-radius:8px;background:transparent;color:#e2e8f0;font:600 14px Inter,Arial,sans-serif;cursor:pointer;text-align:left}'
 +'#gc-tb-pop button[hidden],#gc-tb-pop .tb-n[hidden]{display:none}'
 +'#gc-tb-pop button:hover{background:rgba(255,255,255,.1)}'
 +'#gc-tb-pop .tb-n{position:static;margin-left:auto;border:0}'
 +'#_masterSearch>input{min-width:0!important}'
 +'@media (max-width:699px){#_masterSearch{padding:4px 6px!important}#_masterSearch>input{flex:1 1 30px!important;padding:7px 8px!important}#gc-topbar{gap:3px;margin-left:6px}#gc-topbar .tb-b{width:32px!important;height:32px!important;min-width:0!important;min-height:0!important;font-size:16px}#gc-tb-pop{right:8px}#gc-topbar.tb-float{right:8px;top:6px}#gc-topbar .tb-x{display:none!important}#gc-topbar .tb-more{display:flex}}';
var st=D.createElement('style'); st.id='gc-topbar-css'; st.textContent=CSS; (D.head||H).appendChild(st);

/* one definition per button: how to see if it should show, what it does, where its badge number comes from */
function clickOrig(id){ var o=$(id); if(o){ o.click(); return true; } return false; }
var BTNS=[
 {k:'appr', ic:'✅', t:'Approve', cls:'tb-appr', ph:true,
  show:function(){ var o=$('_gcApprovalsBtn'); return !!o && !origHidden(o); },
  num:function(){ return badgeOf('#_gcApprBadge', $('_gcApprovalsBtn')); },
  go:function(){ if(!clickOrig('_gcApprovalsBtn') && window._gcOpenPmApprovals) window._gcOpenPmApprovals(); }},
 {k:'hub', ic:'💎', t:'Menu', ph:true,
  show:function(){ return !!$('gc-hub-btn'); },
  num:function(){ return badgeOf('span', $('gc-hub-btn')); },
  go:function(){ clickOrig('gc-hub-btn'); placeHubPanel(); }},
 {k:'msg', ic:'💬', t:'Messages',
  show:function(){ return !!$('_gcJobMsgFab') || !!window._gcPickJobForMessages; },
  num:function(){ return badgeOf('#_gcJobMsgFabBadge', $('_gcJobMsgFab')); },
  go:function(){ var pid=openPid(); if(pid && window._gcOpenJobMessages){ window._gcOpenJobMessages(pid); return; }
    if(window._gcPickJobForMessages){ window._gcPickJobForMessages(); return; } clickOrig('_gcJobMsgFab'); }},
 {k:'mic', ic:'🎤', t:'Voice note', ph:true,
  show:function(){ return !!$('_gcMicBtn'); }, num:function(){ return 0; },
  go:function(){ clickOrig('_gcMicBtn'); }},
 {k:'cam', ic:'📷', t:'Photos / camera',
  show:function(){ return !!(window._gcPhotos && window._gcPhotos.open); }, num:function(){ return 0; },
  go:function(){ var pid=openPid(); try{ if(pid) window._gcPhotos.open(pid,{camera:true}); else window._gcPhotos.open(); }catch(e){ try{ window._setView('allphotos'); }catch(_){} } }},
 {k:'desk', ic:'🖥', t:'Desk / Field view',
  show:function(){ return !!$('_fmToggle'); }, num:function(){ return 0; },
  go:function(){ clickOrig('_fmToggle'); }},
 {k:'set', ic:'⚙', t:'Settings',
  show:function(){ return !!$('gc-br-settings'); }, num:function(){ return 0; },
  go:function(){ if(!clickOrig('gc-br-settings') && window.gcSettings) window.gcSettings.open(); }}
];

/* the diamond menu opened from the toolbar hangs under the toolbar (its own code anchors it to the hidden button) */
function placeHubPanel(){
  try{
    var p=D.querySelector('.gc-hub-panel'), bar=$('gc-topbar'); if(!p||!bar) return;
    var r=bar.getBoundingClientRect();
    p.style.setProperty('top',(r.bottom+8)+'px','important'); p.style.setProperty('bottom','auto','important');
    p.style.setProperty('right',Math.max(8,innerWidth-r.right)+'px','important'); p.style.setProperty('left','auto','important');
    p.style.setProperty('max-height',Math.max(200,innerHeight-r.bottom-20)+'px','important');
  }catch(e){}
}

var bar=null, pop=null, els={}, popEls={}, moreBtn=null, moreN=null, lastSig='';
function mk(b, inPop){
  var e=D.createElement('button'); e.type='button'; e.setAttribute('data-tb',b.k);
  e.title=b.t; e.setAttribute('aria-label',b.t);
  if(inPop){ e.innerHTML='<span style="font-size:18px;width:24px;text-align:center">'+b.ic+'</span><span>'+b.t+'</span><span class="tb-n" hidden></span>'; }
  else { e.className='tb-b'+(b.cls?' '+b.cls:'')+(b.ph?'':' tb-x'); e.innerHTML='<span aria-hidden="true">'+b.ic+'</span><span class="tb-n" hidden></span>'; }
  e.addEventListener('click',function(ev){ ev.stopPropagation(); closePop(); try{ b.go(); }catch(err){ try{ console.warn('[GC] topbar',b.k,err); }catch(_){} } });
  return e;
}
function build(){
  if(bar) return;
  bar=D.createElement('div'); bar.id='gc-topbar'; bar.setAttribute('role','toolbar'); bar.setAttribute('aria-label','Quick actions'); bar.setAttribute('data-gc-keep','1');
  pop=D.createElement('div'); pop.id='gc-tb-pop'; pop.setAttribute('data-gc-keep','1');
  BTNS.forEach(function(b){ els[b.k]=mk(b,false); bar.appendChild(els[b.k]); if(!b.ph){ popEls[b.k]=mk(b,true); pop.appendChild(popEls[b.k]); } });
  moreBtn=D.createElement('button'); moreBtn.type='button'; moreBtn.className='tb-b tb-more'; moreBtn.title='More'; moreBtn.setAttribute('aria-label','More'); moreBtn.setAttribute('aria-haspopup','true');
  moreBtn.innerHTML='<span aria-hidden="true">⋯</span><span class="tb-n" hidden></span>'; moreN=moreBtn.querySelector('.tb-n');
  moreBtn.addEventListener('click',function(ev){ ev.stopPropagation(); var r=bar.getBoundingClientRect(); pop.style.top=Math.round(r.bottom+6)+'px'; pop.classList.toggle('on'); });
  bar.appendChild(moreBtn);
  D.body.appendChild(pop); mount();
  D.addEventListener('click',function(ev){ if(pop.classList.contains('on') && !pop.contains(ev.target)) closePop(); });
  D.addEventListener('keydown',function(ev){ if(ev.key==='Escape') closePop(); });
}
/* home: the right end of the dark top header bar (the one with the search box); if that bar is missing, a small fixed pill */
function mount(){
  var host=$('_masterSearch');
  if(host){ if(bar.parentNode!==host){ host.appendChild(bar); bar.classList.remove('tb-float'); } }
  else if(bar.parentNode!==D.body){ D.body.appendChild(bar); bar.classList.add('tb-float'); }
}
function closePop(){ if(pop) pop.classList.remove('on'); }
function setN(span, n){ var t=n>0?String(n):''; if(span.textContent!==t) span.textContent=t; var h=n<=0; if(span.hidden!==h) span.hidden=h; }

function signedIn(){ return !D.getElementById('gc-auth-email') && !H.classList.contains('gc-applogin') && !!D.querySelector('#root>div>aside'); }
function sync(){
  try{
    var on=signedIn() && !H.classList.contains('_fieldmode');
    if(H.classList.contains('gc-tb-on')!==on) H.classList.toggle('gc-tb-on',on);
    if(!on){ return; }
    build();
    mount();
    var moreSum=0, sig='';
    BTNS.forEach(function(b){
      var vis=false, n=0; try{ vis=b.show(); n=vis?b.num():0; }catch(e){}
      var e=els[b.k];
      if(e.hidden===vis) e.hidden=!vis;
      setN(e.querySelector('.tb-n'), n);
      var l=b.t+(n>0?' ('+n+')':''); if(e.title!==l){ e.title=l; e.setAttribute('aria-label',l); }
      if(!b.ph){ var pe=popEls[b.k]; if(pe.hidden===vis) pe.hidden=!vis; setN(pe.querySelector('.tb-n'), n); if(vis) moreSum+=n; }
      sig+=(vis?1:0)+':'+n+',';
    });
    setN(moreN, moreSum);
    var anyPop=BTNS.some(function(b){ return !b.ph && popEls[b.k] && !popEls[b.k].hidden; });
    if(moreBtn.hidden===anyPop) moreBtn.hidden=!anyPop;
  }catch(e){}
}
window._gcTopbarSync=function(){ sync(); };
var pend=0;
function soon(){ if(pend) return; pend=setTimeout(function(){ pend=0; sync(); },80); }

/* badges follow the originals the moment they change; no polling */
var watched={}, MO=window.MutationObserver;
function watch(){
  if(!MO) return;
  ['_gcApprovalsBtn','gc-hub-btn','_gcJobMsgFab','_gcMicBtn','_fmToggle','gc-br-settings'].forEach(function(id){
    var el=$(id); if(!el || watched[id]===el) return; watched[id]=el;
    try{ new MO(soon).observe(el,{attributes:true,attributeFilter:['style','hidden','class'],childList:true,subtree:true,characterData:true}); }catch(e){}
  });
}
try{ new MO(function(){ if(H.classList.contains('_fieldmode') && H.classList.contains('gc-tb-on')) H.classList.remove('gc-tb-on'); soon(); }).observe(H,{attributes:true,attributeFilter:['class']}); }catch(e){}
/* the originals are created late (some on a job screen): look again a few times, then every 6 s while the tab is visible */
[400,1500,3500,7000].forEach(function(ms){ setTimeout(function(){ watch(); sync(); },ms); });
setInterval(function(){ if(D.hidden) return; watch(); sync(); },6000);
D.addEventListener('visibilitychange',function(){ if(!D.hidden){ watch(); sync(); } });
window.addEventListener('storage',soon); window.addEventListener('resize',soon);
try{ new MO(soon).observe(D.body,{childList:true}); }catch(e){}
window.addEventListener('focus',soon);
if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',function(){ sync(); }); else sync();
try{ console.log('[GC] Top-right toolbar ready (patch TOPBAR): Approve, menu, messages, voice, photos, Desk, settings.'); }catch(e){}
})();
</script>
'''
src = once(src, '<script id="gc-patch-regdup">', BLOCK + '<script id="gc-patch-regdup">')
open(path, 'w', encoding='utf-8').write(src)
print('patched')
