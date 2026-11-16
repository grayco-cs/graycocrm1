#!/usr/bin/env python3
"""Idempotent patch W4SAFE: a computer never overwrites a real W-4 with a default payroll profile.

Found with TOMBFIX's browser test (and the same on origin/main): on a computer with an empty local database, the first
profiles() call (any payroll screen / helper at start-up) saw no profiles, so "make sure every active user has a profile"
seeded one per Team user from blankProfile (filing single, extra 0, ... updatedAt = NOW) and saved it (IndexedDB + cloud).
The union merge keeps the newer stamp per field set (Object.assign(older, newer)), so the seed -- newer than the cloud's
real profile -- won every field it carries: a married / +$15 W-4 came back single / $0 on that computer AND in the cloud.

Fix (W4SAFE):
1. profiles() reads the cloud's payroll profile list once per page (shared by concurrent calls, kept in memory) and merges
   it in BEFORE anything else; no profile is created (seeded, or migrated from the old payrollW4 map) until that read
   succeeded on this page. If it fails (offline, refused), nothing is created or saved -- the next call tries again
   (at most every 30 s).
2. A created profile is a seed: _seed: true and no updatedAt, so it is never newer than a cloud copy.
3. One merge rule for payroll profiles (_gcUnionMerge + the stable-id fold), whatever the stamps:
     * a seed never outranks a real profile -- it only fills fields the real one has empty;
     * the W-4 / pay fields (filing, dependents credit, other income, deductions, extra, multiple jobs, exempt, W-4 form,
       MS filing / exemption, salary, hourly rate, pay type, SSN-4, hire date, address, state extra, other deductions,
       tax documents): the newest PERSON edit (editedAt) decides; with no person edit in between, a filled value beats an
       empty / default one;
     * any other field empty on the newer copy keeps the older copy's value (unless the newer copy is a newer person edit).
4. A person's save (Payroll -> Employees -> Save, a certification raise) stamps editedAt and drops _seed, so a person
   changing married -> single (a default value) is kept everywhere.
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '/* W4SAFE: one merge rule for payroll profiles'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '/* TOMBFIX: copies of one payroll profile -> one record' in src, 'W4SAFE goes on top of TOMBFIX'


def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)


# 1. the merge rule (NEVER-LOSE-DATA block)
A1 = ("  function foldProfile(a, b){\n"
      "    var o = stampOf(a) <= stampOf(b) ? [a, b] : [b, a];\n"
      "    var m = Object.assign({}, o[0], o[1]);\n"
      "    Object.keys(o[0]).forEach(function(k){ var v=m[k]; if((v===undefined || v===null || v==='') && o[0][k]!==undefined && o[0][k]!==null && o[0][k]!=='') m[k]=o[0][k]; });\n"
      "    m.id = a.id; return m;\n"
      "  }\n")
B1 = ("  /* W4SAFE: one merge rule for payroll profiles, whatever the stamps -- a seed (a profile this computer created, never edited\n"
      "     by a person) never outranks a real one; for the W-4 / pay fields the newest PERSON edit (editedAt) decides, and with no\n"
      "     person edit in between a filled value beats an empty / default one (a fresh computer's default profile, stamped \"now\",\n"
      "     turned a married / +$15 W-4 into single / $0 on that computer and in the cloud). */\n"
      "  var W4F = { filing:'single', dependentsCredit:0, otherIncome:0, deductions:0, extra:0, multipleJobs:false, exemptFed:false, w4Form:'',\n"
      "              allowances:0, msFiling:'', msExemption:'', annualSalary:0, hourlyRate:0, payType:'', ssn4:'', hireDate:'', address:'',\n"
      "              stateExtra:0, otherDeductions:null, taxDocs:null };\n"
      "  function w4Blank(k, v){\n"
      "    if(v===undefined || v===null || v==='') return true;\n"
      "    if(Array.isArray(v)) return !v.length;\n"
      "    if(!Object.prototype.hasOwnProperty.call(W4F, k)) return false;\n"
      "    var d = W4F[k]; if(d===null) return false;\n"
      "    if(typeof d==='number') return Number(v)===d;\n"
      "    return v===d;\n"
      "  }\n"
      "  function editOf(r){ return String((r && r.editedAt) || ''); }\n"
      "  function isSeed(r){ return !!(r && r._seed===true && !editOf(r)); }\n"
      "  function ppMerge(a, b){\n"
      "    if(!a || typeof a!=='object') return b; if(!b || typeof b!=='object') return a;\n"
      "    var hi = b, lo = a;                                     /* the newer stamp; a tie keeps the incoming copy (as before) */\n"
      "    if(stampOf(a) > stampOf(b)){ hi = a; lo = b; }\n"
      "    var sa = isSeed(a), sb = isSeed(b);\n"
      "    if(isSeed(hi) && !isSeed(lo)){ var t = hi; hi = lo; lo = t; }   /* a seed never outranks a real profile */\n"
      "    var m = Object.assign({}, lo, hi), eh = editOf(hi), el = editOf(lo);\n"
      "    var personHi = !!eh && eh >= el;                          /* the newer copy carries the newest person edit */\n"
      "    Object.keys(W4F).forEach(function(k){\n"
      "      if(el && el > eh){ if(Object.prototype.hasOwnProperty.call(lo, k)) m[k] = lo[k]; return; }   /* the older copy has the newer person edit */\n"
      "      if(personHi) return;\n"
      "      if(w4Blank(k, hi[k]) && !w4Blank(k, lo[k])) m[k] = lo[k];   /* no person edit in between: filled beats empty / default */\n"
      "    });\n"
      "    if(!personHi) Object.keys(lo).forEach(function(k){\n"
      "      if(Object.prototype.hasOwnProperty.call(W4F, k)) return;\n"
      "      var v = hi[k]; if((v===undefined || v===null || v==='') && lo[k]!==undefined && lo[k]!==null && lo[k]!=='') m[k] = lo[k];\n"
      "    });\n"
      "    if(!(sa && sb)) delete m._seed;\n"
      "    var e = eh > el ? eh : el; if(e) m.editedAt = e;\n"
      "    return m;\n"
      "  }\n"
      "  window._gcPayProfileMerge = ppMerge;\n"
      "  function foldProfile(a, b){\n"
      "    var m = ppMerge(a, b);   /* W4SAFE */\n"
      "    m.id = a.id; return m;\n"
      "  }\n")
src = once(src, A1, B1)
A2 = "        else if(newer(rec, byId[id])){ byId[id]=Object.assign({}, byId[id], rec); }\n"
B2 = ("        else if(key==='payrollProfiles'){ byId[id]=ppMerge(byId[id], rec); }   /* W4SAFE */\n"
      "        else if(newer(rec, byId[id])){ byId[id]=Object.assign({}, byId[id], rec); }\n")
src = once(src, A2, B2)

# 2. profiles(): the cloud's list first; nothing is created before that read succeeded
A3 = ("async function profiles(){\n"
      "  var list=await get(K_PROF);\n"
      "  if(!Array.isArray(list)) list=[];\n")
B3 = ("/* W4SAFE: the cloud's payroll profile list, read once per page (concurrent calls share the read; kept in memory and merged\n"
      "   into every call, so a call that reads this computer's copy before the first merged list was written still has it).\n"
      "   Until a read succeeds, profiles() creates nothing: no seed may ever be saved over a real cloud profile. */\n"
      "var _w4 = { ok:false, list:[], p:null, at:0 };\n"
      "function w4Cloud(){\n"
      "  if(_w4.ok) return Promise.resolve(_w4);\n"
      "  if(_w4.p && Date.now()-_w4.at < 30000) return _w4.p;\n"
      "  _w4.at = Date.now();\n"
      "  _w4.p = (async function(){\n"
      "    try{\n"
      "      var u = String(localStorage.getItem('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\\/+$/, ''), k = localStorage.getItem('grayco_sb_key') || '';\n"
      "      var r = await fetch(u+'/rest/v1/gc_kv?key=eq.'+K_PROF+'&select=value', { headers: k ? { apikey:k, Authorization:'Bearer '+k } : {}, cache:'no-store' });\n"
      "      if(!r || !r.ok) return _w4;\n"
      "      var rows = await r.json(); if(!Array.isArray(rows)) return _w4;\n"
      "      var v = rows.length ? rows[0].value : [];\n"
      "      if(typeof v==='string'){ try{ v = JSON.parse(v); }catch(_je){ return _w4; } }\n"
      "      var out = Array.isArray(v) ? v : [];\n"
      "      try{ if(window._gcSbReadChunked){ var ch = await window._gcSbReadChunked(K_PROF); if(Array.isArray(ch) && ch.length) out = window._gcUnionMerge ? window._gcUnionMerge(K_PROF, out, ch) : out.concat(ch); } }catch(_ce){}\n"
      "      _w4.list = out.filter(function(p){ return p && typeof p==='object'; }); _w4.ok = true;\n"
      "      return _w4;\n"
      "    }catch(e){ return _w4; }\n"
      "  })();\n"
      "  return _w4.p;\n"
      "}\n"
      "window._gcPayW4Safe = function(){ return { cloudRead:_w4.ok, cloudCount:_w4.list.length, lastTry:_w4.at ? new Date(_w4.at).toISOString() : '' }; };\n"
      "async function profiles(){\n"
      "  var list=await get(K_PROF);\n"
      "  if(!Array.isArray(list)) list=[];\n"
      "  var _w4c = { ok:false, list:[] }, _w4changed=false;   /* W4SAFE */\n"
      "  try{ _w4c = await Promise.race([w4Cloud(), new Promise(function(r){ setTimeout(function(){ r({ ok:false, list:[] }); }, 8000); })]); }catch(_w4e){}   /* a slow read: answer from this computer, create nothing */\n"
      "  if(_w4c.ok && _w4c.list.length && window._gcUnionMerge){\n"
      "    try{ var _w4b = JSON.stringify(list); var _w4m = window._gcUnionMerge(K_PROF, JSON.parse(_w4b), JSON.parse(JSON.stringify(_w4c.list)));\n"
      "      if(Array.isArray(_w4m) && JSON.stringify(_w4m) !== _w4b){ list = _w4m; _w4changed = true; } }catch(_w4me){}\n"
      "  }\n")
src = once(src, A3, B3)
A4 = "  if(_migChanged || _pdRemoved || _tfIds){ try{ await put(K_PROF, list); }catch(_pe){} }   /* patch PROFDUP: once */ /* TOMBFIX: + stable ids */\n"
B4 = "  if(_migChanged || _pdRemoved || _tfIds || _w4changed){ try{ await put(K_PROF, list); }catch(_pe){} }   /* patch PROFDUP: once */ /* TOMBFIX: + stable ids */ /* W4SAFE: + the cloud's list */\n"
src = once(src, A4, B4)
A5 = ("      if(!p){\n"
      "        var u=users().find(function(x){ return nameKey(x.name)===nameKey(nm); });\n"
      "        p = u ? seedFromUser(u) : blankProfile({name:nm});\n")
B5 = ("      if(!p){\n"
      "        if(!_w4c.ok) return;   /* W4SAFE: nothing is created before the cloud's list was read */\n"
      "        var u=users().find(function(x){ return nameKey(x.name)===nameKey(nm); });\n"
      "        p = u ? seedFromUser(u) : blankProfile({name:nm});\n"
      "        p._seed=true; p.updatedAt='';   /* W4SAFE: a seed is never newer than a cloud copy */\n")
src = once(src, A5, B5)
A6 = "    if(!p){ p=seedFromUser(u); if(!u.id) p.id=nameId(u.name); list.push(p); if(u.id) byUser[u.id]=p; byName[nameKey(u.name)]=p; changed=true; }\n"
B6 = ("    if(!p){ if(!_w4c.ok) return;   /* W4SAFE: nothing is created before the cloud's list was read */\n"
      "      p=seedFromUser(u); if(!u.id) p.id=nameId(u.name); p._seed=true; p.updatedAt='';   /* W4SAFE: a seed is never newer than a cloud copy */\n"
      "      list.push(p); if(u.id) byUser[u.id]=p; byName[nameKey(u.name)]=p; changed=true; }\n")
src = once(src, A6, B6)

# 3. a person's save: editedAt, no longer a seed
A7 = ("    p.updatedAt=new Date().toISOString();\n"
      "    await P.saveProfiles(profs);\n"
      "    alert('Saved. '+p.name+'’s payroll setup is updated on every device.');\n")
B7 = ("    p.updatedAt=new Date().toISOString();\n"
      "    p.editedAt=p.updatedAt; delete p._seed;   /* W4SAFE: a person's edit -- it decides the W-4 everywhere, even a default value */\n"
      "    await P.saveProfiles(profs);\n"
      "    alert('Saved. '+p.name+'’s payroll setup is updated on every device.');\n")
src = once(src, A7, B7)
A8 = "  pr.updatedAt = at;\n  await P.saveProfiles(profs);\n"
B8 = "  pr.updatedAt = at;\n  pr.editedAt = at; delete pr._seed;   /* W4SAFE: a person's raise */\n  await P.saveProfiles(profs);\n"
src = once(src, A8, B8)

open(path, 'w', encoding='utf-8').write(src)
print('patched W4SAFE')
