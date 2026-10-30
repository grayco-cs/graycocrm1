#!/usr/bin/env python3
"""Idempotent patch FIELDFIX7: the crew's automatic clock-in is kept (it was silently thrown away).

Found by the field-view audit (10/30): the Time Clock clocks a person in when they open the CRM ("[GC] Clocked in
Carl Crew at 07:59" in the console), by rewriting the company 'timesheets' list. Since patch SEC2, 'timesheets' is a
payroll key: a person without payroll access (crew, superintendents, PMs, everyone but the admins and the office)
can neither read it nor write it, and the write is dropped "as done" by design. So every field clock-in was lost,
the crew's "My Timesheet" was always empty, and each page load clocked them in again (into nothing).

Fix (inside the Time Clock only; nothing else changes):
  • For a person who may not write 'timesheets' (window.__GC_SEC2.can), the clock writes their OWN entries to their
    own small key gc_timeclock_<email> (an ordinary company key; the existing save queue sends it, with retries) and
    keeps a copy on the phone, so "already clocked in today", clock-out and "My Timesheet" work for them.
  • A payroll / admin computer, when its clock runs (8 s after load, once), reads the gc_timeclock_* keys (one GET)
    and adds the entries it does not have (or newer copies) to 'timesheets' through the clock's existing save.
  • The clock's "today" is the phone's local date (it was the UTC date: a clock-in after 7 pm Central was dated the
    next day).
No new timers or polling.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* FIELDFIX7 */'
if MARK in src:
    print('already patched'); sys.exit(0)

A = "  var KEY='timesheets';\n  var GRACE_MIN=10;            // grace period\n"
assert src.count(A) == 1, src.count(A)
i = src.index(A)
END = "  window._gcClockInNow = clockInToday;\n"
j = src.index(END, i) + len(END)
assert j - i < 20000
reg = src[i:j]

def once_in(r, old, new):
    assert r.count(old) == 1, ('anchor count in region != 1', old[:70], r.count(old))
    return r.replace(old, new)

reg = once_in(reg, "  async function idbGet(k){ if(window.idbGet) return await window.idbGet(k); if(window._gcRecIDBget) return await window._gcRecIDBget(k); return null; }",
  "  async function idbGet(k){ if(k===KEY && tcOwn()) return tcMine(); if(window.idbGet) return await window.idbGet(k); if(window._gcRecIDBget) return await window._gcRecIDBget(k); return null; }")
reg = once_in(reg, "  async function idbSet(k,v){ if(window._gcSaveForGood){",
  "  async function idbSet(k,v){ if(k===KEY && tcOwn()){ tcSaveMine(v); return; } if(window._gcSaveForGood){")
reg = once_in(reg, "  function today(){ return new Date().toISOString().slice(0,10); }",
  "  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }   " + MARK + " /* local date */")
HELPERS = """  """ + MARK + """ /* a person who may not write the payroll key 'timesheets' (SEC2) keeps their own entries in gc_timeclock_<email> */
  var TC_LS='gc_timeclock_mine_v1', TC_PFX='gc_timeclock_';
  function tcAcc(){ try{ var S=window.__GC_SEC2; return S && S.access ? S.access() : null; }catch(e){ return null; } }
  function tcOwn(){ try{ var S=window.__GC_SEC2, a=tcAcc(); return !!(S && S.can && a && a.known && a.email && !S.can(KEY,'write',a)); }catch(e){ return false; } }
  function tcKey(){ var a=tcAcc(); return TC_PFX+String(a&&a.email||'').toLowerCase().replace(/[^a-z0-9]/g,'_'); }
  function tcMine(){ try{ var o=JSON.parse(localStorage.getItem(TC_LS)||'null'); var a=tcAcc(); if(o && a && o.email===a.email && Array.isArray(o.list)) return o.list; }catch(e){} return []; }
  function tcSaveMine(v){
    var me=user(), a=tcAcc(); var mine=(Array.isArray(v)?v:[]).filter(function(r){ return r && r.user===me; });
    try{ localStorage.setItem(TC_LS, JSON.stringify({ email:a&&a.email, list:mine })); }catch(e){}
    try{ if(window._supaUpsert) window._supaUpsert(tcKey(), mine); }catch(e){}
  }
  var tcMerged=false;
  async function tcMergeAll(){   /* a payroll / admin computer: the crew's own clock entries into 'timesheets' (once per load) */
    if(tcMerged) return; tcMerged=true;
    try{
      var S=window.__GC_SEC2, a=tcAcc(); if(!S || !a || !a.known || !S.can(KEY,'write',a)) return;
      var u=(localStorage.getItem('grayco_sb_url')||'').replace(/\\/$/,''), k=localStorage.getItem('grayco_sb_key')||'';
      if(!u || !k) return;
      var r=await fetch(u+'/rest/v1/gc_kv?key=like.'+TC_PFX+'*&select=key,value', { headers:{ apikey:k, Authorization:'Bearer '+k }, cache:'no-store' });
      if(!r.ok) return; var rows=await r.json(); if(!Array.isArray(rows) || !rows.length) return;
      var list=await idbGet(KEY); if(!Array.isArray(list)) list=[];
      var at={}, ch=0; list.forEach(function(x,n){ if(x && x.id) at[x.id]=n; });
      rows.forEach(function(row){ var v=row && row.value; if(typeof v==='string'){ try{ v=JSON.parse(v); }catch(e){ v=null; } } (Array.isArray(v)?v:[]).forEach(function(e){
        if(!e || !e.id || !e.user || !e.date) return;
        if(!(e.id in at)){ at[e.id]=list.length; list.push(e); ch++; }
        else if(String(e.updatedAt||'') > String((list[at[e.id]]||{}).updatedAt||'')){ list[at[e.id]]=e; ch++; }
      }); });
      if(ch){ await idbSet(KEY, list); console.log('[GC] Time clock: '+ch+' crew clock entr'+(ch===1?'y':'ies')+' added to Timesheets.'); }
    }catch(e){}
  }
"""
reg = A + HELPERS + reg[len(A):]
reg = once_in(reg, "  async function clockInToday(){\n    try{\n",
  "  async function clockInToday(){\n    try{ tcMergeAll(); }catch(e){}   " + MARK + "\n    try{\n")
src = src[:i] + reg + src[j:]
open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFIX7')
