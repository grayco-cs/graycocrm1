#!/usr/bin/env python3
"""patch YEARBAR (owner 11/20, Projects page): the old "Year:" chip row (_gcYearBar) showed other numbers than the page's own year
tabs ("All (95) / 2026 (80) / 2027 (3)" next to "All Projects (103) / 2026 (103)"): it painted once ~16 s after load, mid-load, and
never again, counted p.jobYear where the tabs use created/startDate, skipped the company filter, and hid rows by its own rule. The
tabs do the same job, so the chip row is retired: it is never painted, a year it had stored is cleared (no row stays hidden by it).
And the cards add up: QuickBooks-import rows still at status "Active" (patch JOBACTIVE: no working job) and other statuses count in
All only — the All card now says so: "incl. N QuickBooks / other" (All minus the four other cards, read from the cards themselves)."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
MARK = '/* patch YEARBAR */'
if MARK in src: print('already patched'); sys.exit(0)
OLD = """  function bar(){
    try{
      var v=''; try{ v=localStorage.getItem('grayco_view')||''; }catch(e){}
      var host=document.getElementById('_gcYearBar');"""
NEW = """  function bar(){ """ + MARK + """ allNote(); var yb=document.getElementById('_gcYearBar'); if(yb) yb.remove();
    try{ if(currentFilter()){ localStorage.removeItem('gc_job_year_filter'); applyFilter(); } }catch(e){} }
  function allNote(){   /* the All card: how many of its jobs are on none of the other four cards */
    try{
      var v=''; try{ v=localStorage.getItem('grayco_view')||''; }catch(e){}
      var note=document.getElementById('gc-allnote'); if(v!=='projects'){ if(note) note.remove(); return; }
      var g=null, ds=document.querySelectorAll('main div[style*="grid-template-columns"]');
      for(var i=0;i<ds.length && !g;i++){ var k=ds[i].children; if(k.length===5 && /All\\s*$/.test(k[4].textContent.replace(/[\\d,]+\\s*/, '').replace(/incl\\..*$/, '').trim())) g=ds[i]; }
      if(!g){ if(note) note.remove(); return; }
      var num=function(el){ var m=/^\\D*?([\\d,]+)/.exec(el.textContent||''); return m ? +m[1].replace(/,/g,'') : 0; };
      var c=g.children, n=num(c[4])-num(c[0])-num(c[1])-num(c[2])-num(c[3]);
      if(n<=0){ if(note) note.remove(); return; }
      var t='incl. '+n+' QuickBooks / other';
      if(!note || note.parentNode!==c[4]){ if(note) note.remove(); note=document.createElement('div'); note.id='gc-allnote'; note.style.cssText='font-size:10px;font-weight:600;color:#64748b;margin-top:2px'; note.title='QuickBooks-import rows still at "Active" and jobs with another status are in All only'; c[4].appendChild(note); }
      if(note.textContent!==t) note.textContent=t;
    }catch(e){}
  }
  function oldBar(){
    try{
      var v=''; try{ v=localStorage.getItem('grayco_view')||''; }catch(e){}
      var host=document.getElementById('_gcYearBar');"""
assert src.count(OLD) == 1, src.count(OLD)
src = src.replace(OLD, NEW)
OLD2 = "          var old=document.getElementById('_gcYearBar'); if(old) old.remove();\n          bar(); applyFilter();"
assert src.count(OLD2) == 1
src = src.replace(OLD2, "          var old=document.getElementById('_gcYearBar'); if(old) old.remove();\n          oldBar(); applyFilter();")
OLD3 = "  setInterval(bar, 4000);\n  setInterval(applyFilter, 6000);"
assert src.count(OLD3) == 1
src = src.replace(OLD3, "  setInterval(bar, 1500);\n  setInterval(applyFilter, 6000);")
open(P, 'w', encoding='utf-8').write(src); print('patched')
