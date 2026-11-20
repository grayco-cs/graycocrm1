#!/usr/bin/env python3
"""patch PAYBAR (owner 11/20, desk screenshot: "this is behind the search"): the red "⚠ PAYROLL NEEDS YOU" bar is sticky at top:0
inside the page, and the fixed top search bar (#_masterSearch, top:0, z 9999) covered it. The bar now sits just under the search bar
(top and margin = the search bar's bottom edge, re-checked every paint), so the whole message and its buttons show."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
MARK = '/* patch PAYBAR */'
if MARK in src: print('already patched'); sys.exit(0)
def rep(old, new):
    global src
    assert src.count(old) == 1, ('not found once', old[:70], src.count(old))
    src = src.replace(old, new)
rep("""    if(!show){ if(bar) bar.remove(); return; }
    if(bar) return;
    bar=document.createElement('div');
    bar.id='gc-payroll-alert';""",
"""    if(!show){ if(bar) bar.remove(); return; }
    if(bar){ underSearch(bar); return; }
    bar=document.createElement('div');
    bar.id='gc-payroll-alert';""")
rep("""    host.insertBefore(bar, host.firstChild);
    bar.querySelector('#_gcPayAlertGo')""",
"""    host.insertBefore(bar, host.firstChild); underSearch(bar);
    bar.querySelector('#_gcPayAlertGo')""")
rep("""  function paint(){
    var view=''; try{ view=localStorage.getItem('grayco_view')||''; }catch(e){}
    var show = PENDING>0 && P.isAdmin()""",
"""  function underSearch(bar){   """ + MARK + """ /* below the fixed top search bar, never behind it */
    try{ var m=document.getElementById('_masterSearch'), h=0;
      if(m){ var cs=getComputedStyle(m); if(cs.display!=='none' && cs.visibility!=='hidden' && (cs.position==='fixed' || cs.position==='sticky')) h=Math.max(0, Math.round(m.getBoundingClientRect().bottom)); }
      var t=h+'px'; if(bar.style.top!==t) bar.style.top=t; if(bar.style.marginTop!==t) bar.style.marginTop=t;
    }catch(e){} }
  function paint(){
    var view=''; try{ view=localStorage.getItem('grayco_view')||''; }catch(e){}
    var show = PENDING>0 && P.isAdmin()""")
open(P, 'w', encoding='utf-8').write(src); print('patched')
