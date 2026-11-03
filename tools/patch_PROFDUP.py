#!/usr/bin/env python3
"""patch PROFDUP (owner 11/03: hundreds of copies of "Brittany Pucket" in the payroll profile list).
Cause: a profile seeded for a Team user with no id (or from the old payrollW4 map) got a RANDOM id ('PP'+random).
The cloud sync is a union by id, so every copy made on a load whose write was lost or raced (two profiles() calls in
flight, a stale-read writer saving over it, an empty read) was kept for good and came back on the next pull.
Fix: (1) match a user to a profile by userId, then by trimmed lower-case name (never e-mail) and give new profiles a
deterministic id, so copies made on two loads/computers are the same record; (2) a condition-gated self-heal in
profiles() folds same-name copies into one (most W-4/pay detail wins, missing fields filled in, userId kept; copies
with different real userIds are never merged), writes once and tombstones the removed ids so the sync cannot bring
them back; (3) the Office $20/hr self-heal stamps updatedAt so the union keeps it instead of re-healing every load.
Pay runs / YTD / 941 key on userId||name, never on the profile id, so a merge orphans nothing."""
import sys, os
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
MARK = '/* patch PROFDUP'
t = open(P, encoding='utf-8').read()
if MARK in t:
    print('already patched'); sys.exit(0)

E = []
# 1. self-heal: fold duplicate copies right after the read (one write, together with the other self-heals)
A1 = ("  var list=await get(K_PROF);\n  if(!Array.isArray(list)) list=[];\n  var byUser={}, byName={};\n"
      "  list.forEach(function(p){ if(p){ if(p.userId) byUser[p.userId]=p; if(p.name) byName[p.name]=p; } });\n")
B1 = ("  var list=await get(K_PROF);\n  if(!Array.isArray(list)) list=[];\n"
      "  var _pdRemoved=0;   /* patch PROFDUP: one profile per person — condition-gated, a no-op once there are no copies */\n"
      "  try{ var _pd=dedupeProfiles(list); if(_pd.removed){ list=_pd.list; _pdRemoved=_pd.removed;\n"
      "    try{ if(window._gcTombstoneMany && _pd.deadIds.length) window._gcTombstoneMany(K_PROF, _pd.deadIds); }catch(_te){}\n"
      "    try{ console.log('[GC Payroll] PROFDUP: merged '+_pd.removed+' duplicate payroll profile'+(_pd.removed===1?'':'s')+' ('+_pd.names.join(', ')+')'); }catch(_ce){}\n"
      "    try{ var _ph=window.__gcPayHeal=window.__gcPayHeal||{profilesMerged:0}; _ph.profilesMerged+=_pd.removed; _ph.lastAt=new Date().toISOString(); _ph.names=_pd.names; }catch(_he){} } }catch(_pde){}\n"
      "  var byUser={}, byName={};\n"
      "  list.forEach(function(p){ if(p){ if(p.userId) byUser[p.userId]=p; if(p.name) byName[nameKey(p.name)]=p; } });\n")
E.append((A1, B1))
# 2. the merged copies are written with the other self-heals, once
A2 = "  if(_migChanged){ try{ await put(K_PROF, list); }catch(_pe){} }\n"
B2 = "  if(_migChanged || _pdRemoved){ try{ await put(K_PROF, list); }catch(_pe){} }   /* patch PROFDUP: once */\n"
E.append((A2, B2))
# 3. Office self-heal: stamp it, or the union sync keeps the cloud's un-healed copy and it re-heals on every load
A3 = "        p.payType='hourly'; p.hourlyRate=20;\n        _migChanged=true;\n"
B3 = "        p.payType='hourly'; p.hourlyRate=20; p.updatedAt=new Date().toISOString();   /* patch PROFDUP: stamped, so the sync keeps it */\n        _migChanged=true;\n"
E.append((A3, B3))
# 4. old payrollW4 migration: match by name key, deterministic id
A4 = ("      var o=old[nm]||{}, p=byName[nm];\n      if(!p){\n        var u=users().find(function(x){ return x.name===nm; });\n"
      "        p = u ? seedFromUser(u) : blankProfile({name:nm});\n        p.name=nm; list.push(p); byName[nm]=p; if(p.userId) byUser[p.userId]=p; changed=true;\n      }\n")
B4 = ("      var o=old[nm]||{}, p=byName[nameKey(nm)];   /* patch PROFDUP: by trimmed lower-case name */\n      if(!nameKey(nm)) return;\n      if(!p){\n"
      "        var u=users().find(function(x){ return nameKey(x.name)===nameKey(nm); });\n"
      "        p = u ? seedFromUser(u) : blankProfile({name:nm});\n        if(!p.userId) p.id=nameId(nm);\n"
      "        p.name=nm; list.push(p); byName[nameKey(nm)]=p; if(p.userId) byUser[p.userId]=p; changed=true;\n      }\n")
E.append((A4, B4))
# 5. every active user: userId first, then name key, never e-mail; deterministic id
A5 = ("    var p = (u.id && byUser[u.id]) || byName[u.name];\n"
      "    if(!p){ p=seedFromUser(u); list.push(p); byUser[u.id]=p; byName[u.name]=p; changed=true; }\n")
B5 = ("    var p = (u.id && byUser[u.id]) || byName[nameKey(u.name)];   /* patch PROFDUP: userId, then trimmed lower-case name — never the shared e-mail */\n"
      "    if(!p){ p=seedFromUser(u); if(!u.id) p.id=nameId(u.name); list.push(p); if(u.id) byUser[u.id]=p; byName[nameKey(u.name)]=p; changed=true; }\n")
E.append((A5, B5))
# 6. the helpers
A6 = "async function profiles(){\n"
B6 = r"""/* patch PROFDUP: one payroll profile per person */
function nameKey(n){ return String(n==null?'':n).trim().toLowerCase().replace(/\s+/g,' '); }
function nameId(n){ return 'PPN-'+nameKey(n).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function _pdEmpty(v){ return v===undefined || v===null || v==='' || (Array.isArray(v) && !v.length); }
function profScore(p){   /* how much W-4 / pay detail a copy carries (blank-profile defaults count for nothing) */
  var n=0, D={filing:'single', period:'weekly', otAfter:40, otMultiplier:1.5, state:'TN'};
  Object.keys(p).forEach(function(k){
    if(/^(id|userId|name|email|updatedAt|active|_fe)$/.test(k)) return;
    var v=p[k]; if(_pdEmpty(v) || v===0 || v===false || (k in D && v===D[k])) return;
    n += /^(filing|dependentsCredit|otherIncome|deductions|extra|multipleJobs|exemptFed|w4Form|allowances|msFiling|msExemption|annualSalary|hourlyRate|payType|ssn4)$/.test(k) ? 3 : 1;
  });
  return n;
}
function dedupeProfiles(list){
  var groups={}, order=[];
  list.forEach(function(p, i){
    if(!p || typeof p!=='object') return;
    var nk=nameKey(p.name); if(!nk) return;                       /* no name: never touched */
    if(!groups[nk]){ groups[nk]=[]; order.push(nk); }
    groups[nk].push(i);
  });
  var drop={}, replace={}, removed=0, names=[], deadIds=[], keptIds={};
  order.forEach(function(nk){
    var ix=groups[nk]; if(ix.length<2) return;
    /* copies with different userIds are never merged (pay runs and YTD are keyed on userId||name);
       a copy with no userId joins the one userId group there is */
    var byU={}, loose=[];
    ix.forEach(function(i){ var u=String(list[i].userId||''); if(u){ (byU[u]=byU[u]||[]).push(i); } else loose.push(i); });
    var clusters=Object.keys(byU).map(function(u){ return byU[u]; });
    if(clusters.length===1) clusters[0]=clusters[0].concat(loose);   /* one Team user by this name: the loose copies are theirs */
    else if(loose.length) clusters.push(loose);                      /* none, or two users of the same name: loose copies fold among themselves */
    clusters.forEach(function(c){
      if(c.length<2) return;
      var sorted=c.slice().sort(function(a,b){ var d=profScore(list[b])-profScore(list[a]); if(d) return d;
        var ua=String(list[a].updatedAt||''), ub=String(list[b].updatedAt||''); if(ua!==ub) return ua<ub?1:-1; return a-b; });
      var win=Object.assign({}, list[sorted[0]]);
      sorted.slice(1).forEach(function(i){ var o=list[i]; Object.keys(o).forEach(function(k){ if(_pdEmpty(win[k]) && !_pdEmpty(o[k])) win[k]=o[k]; }); });
      var uid=String(win.userId||''); c.forEach(function(i){ if(!uid && list[i].userId) uid=String(list[i].userId); }); if(uid) win.userId=uid;
      var origId=String(list[sorted[0]].id||''), ids=c.map(function(i){ return String(list[i].id||''); });
      if(uid && ids.indexOf('PP'+uid)>=0) win.id='PP'+uid; else if(ids.indexOf(nameId(win.name))>=0) win.id=nameId(win.name);
      win.mergedIds=(Array.isArray(win.mergedIds)?win.mergedIds:[]).concat(ids.filter(function(x){ return x && x!==String(win.id); })).filter(function(x, k, a){ return a.indexOf(x)===k; }).slice(-20);
      win.updatedAt=new Date().toISOString();                        /* the union sync keeps the merged copy */
      keptIds[String(win.id)]=1; if(origId && origId!==String(win.id)) deadIds.push(origId);
      replace[sorted[0]]=win;
      sorted.slice(1).forEach(function(i){ drop[i]=1; removed++; if(list[i].id) deadIds.push(String(list[i].id)); });
      if(names.indexOf(win.name)<0) names.push(win.name);
    });
  });
  if(!removed) return { list:list, removed:0, names:[], deadIds:[] };
  var out=[];
  list.forEach(function(p, i){ if(drop[i]) return; out.push(replace[i] || p); if(p && p.id && !replace[i]) keptIds[String(p.id)]=1; });
  /* never tombstone an id a kept profile still carries */
  deadIds=deadIds.filter(function(id, k, a){ return !keptIds[id] && a.indexOf(id)===k; });
  return { list:out, removed:removed, names:names, deadIds:deadIds };
}
async function profiles(){
"""
E.append((A6, B6))
for a, b in E:
    c = t.count(a)
    if c != 1: print('anchor count', c, 'for', a[:70].encode('unicode_escape')); sys.exit(1)
for a, b in E:
    t = t.replace(a, b)
OLD, NEW = '33.163-2026-11-03-r17q3c', '33.163-2026-11-03-r17q3d'
if t.count(OLD) != 3: print('version count', t.count(OLD)); sys.exit(1)
t = t.replace(OLD, NEW)
open(P, 'w', encoding='utf-8').write(t)
V = os.path.join(os.path.dirname(P), 'version.txt')
open(V, 'w').write(NEW + '\n')
print('patched PROFDUP')
