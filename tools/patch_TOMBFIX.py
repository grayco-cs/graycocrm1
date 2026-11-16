#!/usr/bin/env python3
"""Idempotent patch TOMBFIX: the delete list (gc_tombstones) stays small; payroll profile ids stay stable.

Live data 11/13-11/16 (read-only): every staff computer's perf report showed "browser storage full: gc_tombstones (not
saved)" -- the CRM tried to write a ~21,000,000-character delete list into localStorage (~5 M).  The cloud row held
29,755 entries; 26,825 were "payrollProfiles:giduf2g3e", "...-gidwtg9hh", "...-gidwtg9hh-2" ... "-9016", and
"...-gidwtg9hh-N-giduf2g3e-gidwtg9hh-giduf2g3e-..." (up to 2,158 characters), all marked at the same millisecond
(11/12 13:40:38.933).

Root cause A (the ids): _gcEnsureRecordIds (the NEVER-LOSE-DATA union merge's stable-id step) gave an id-less record
its content hash (fingerprint: name|title|client|address...), and a SECOND record with the same id a new one:
id + '-' + fingerprint, then id + '-' + strongFp, then '-2', '-3' ...  Two payroll screens push an id-less stub
{name, frequency} / {name, homeState, state} when no profile matches the name, so one person's stubs all hashed to
giduf2g3e (strong hash gidwtg9hh).  Every merge that saw two copies of a stub minted a new id for the second copy --
the copies are the same record, but nothing folded them -- and the union keeps both ids, so each sync added copies
(g-w-2 ... g-w-9016).  collapse() (the repair for gidX-gidX) only folds CONSECUTIVE repeats, so a copy whose id ended
in "-N" grew one alternating segment per collision (g-w-N-g-w-g-w-...: 212 steps for N = 2..56).  On 11/12 PROFDUP
folded all 26,826 copies into the person's real profile by name and tombstoned every one of those ids at once.
Fix A (at the source):
  * _gcEnsureRecordIds('payrollProfiles'): a profile without an id or with an auto (gid...) id gets its person's
    stable id -- 'PP' + userId, else 'PPN-' + name (the ids PROFDUP / profiles() already use); copies with the same
    id IN ONE LIST are folded into one record (newest values win, nothing else lost) instead of getting new ids.
  * any list: a second copy with the same id whose content is identical (all but id / save stamps) is the same record:
    it is folded (the newer stamp kept), never given a new id.  Different records with the same id are de-collided as
    before.
  * the two stub writers give the stub its stable id (and userId) and a save stamp.
  * profiles() runs the stable-id step on what it reads, so a computer with old copies folds them before PROFDUP.
Root cause B (the list): see tools/tombfix_early.js -- one compaction rule at every door (localStorage, IndexedDB, the
cloud), a one-time clean write-back, and a 1 M-character cap on the localStorage quick-start copy.
Also: the rolling backups gc_bak_<list> (up to 10 versions of projects / invoices / leads / schedule / subs / customers,
up to 1 M characters EACH, 2-3 M on the office computers) move from localStorage into IndexedDB (same records, same
10 versions, more room); the old localStorage copies are moved over and then removed.
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_TOMBFIX__'
if MARK in src:
    print('already patched'); sys.exit(0)
EARLY = open(os.path.join(here, 'tombfix_early.js'), encoding='utf-8').read()
assert MARK in EARLY


def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)


# 0. the early script: after DENYKEEP's script (STUCKFIX / STORECUT stay the inner fetch layers), before the company
#    sign-in captures window.fetch and before every tombstone module
A0 = "    if (big.length) console.warn('[GC] Removed ' + big.length + ' oversized backup cop' + (big.length === 1 ? 'y' : 'ies') + ' from browser storage: ' + big.join(', ')); } catch (e) {}\n})();\n</script>\n"
src = once(src, A0, A0 + '<script id="gc-patch-tombfix">\n' + EARLY.rstrip('\n') + '\n</script>\n')

# 1. the stable-id step
A1 = ("  window._gcEnsureRecordIds = function(list, key){\n"
      "    if(!Array.isArray(list)) return false;\n"
      "    var seen={}, changed=false, alt=key && QALT[key], firstAt={}, drop=[];\n"
      "    list.forEach(function(rec, ix){\n"
      "      if(!rec || typeof rec!=='object') return;\n"
      "      var id = rec.id;\n"
      "      if(id!==undefined && id!==null && id!==''){ var cid = collapse(id); if(cid!==String(id)){ rec.id = cid; changed=true; id=cid; } }   /* patch SYNCFIX: repair */\n")
B1 = ("  /* TOMBFIX: a payroll profile is its person's: an id-less or auto (content-hash gid...) id becomes the person's stable id\n"
      "     ('PP'+userId, else 'PPN-'+name -- the ids PROFDUP and profiles() use). The auto ids of one person's id-less stubs were\n"
      "     de-collided on every merge (gid-gid-2 ... gid-gid-9016, gid-gid-N-gid-gid-gid-...) and the union kept every copy. */\n"
      "  var PP_AUTO = /^gid[0-9a-z]+(?:-(?:gid[0-9a-z]+|\\d+))*$/;\n"
      "  function ppStableId(rec){\n"
      "    if(!rec || typeof rec!=='object') return '';\n"
      "    var id = rec.id==null ? '' : String(rec.id);\n"
      "    if(id && !PP_AUTO.test(id)) return id;\n"
      "    if(rec.userId!=null && rec.userId!=='') return 'PP'+String(rec.userId);\n"
      "    var nk = String(rec.name==null?'':rec.name).trim().toLowerCase().replace(/\\s+/g,' ');\n"
      "    var slug = nk.replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');\n"
      "    return slug ? 'PPN-'+slug : id;\n"
      "  }\n"
      "  window._gcPayProfileId = ppStableId;\n"
      "  var STAMP_RE = /^(id|updatedAt|updated_at|savedAt|modified)$/;\n"
      "  function bodySig(rec){ try{ var o={}; Object.keys(rec).sort().forEach(function(k){ if(!STAMP_RE.test(k)) o[k]=rec[k]; }); return JSON.stringify(o); }catch(e){ return null; } }\n"
      "  function stampOf(r){ return String((r && (r.updatedAt||r.updated_at||r.savedAt||r.modified)) || ''); }\n"
      "  /* TOMBFIX: copies of one payroll profile -> one record (oldest first, newer values win; nothing else is lost) */\n"
      "  function foldProfile(a, b){\n"
      "    var o = stampOf(a) <= stampOf(b) ? [a, b] : [b, a];\n"
      "    var m = Object.assign({}, o[0], o[1]);\n"
      "    Object.keys(o[0]).forEach(function(k){ var v=m[k]; if((v===undefined || v===null || v==='') && o[0][k]!==undefined && o[0][k]!==null && o[0][k]!=='') m[k]=o[0][k]; });\n"
      "    m.id = a.id; return m;\n"
      "  }\n"
      "  window._gcEnsureRecordIds = function(list, key){\n"
      "    if(!Array.isArray(list)) return false;\n"
      "    var seen={}, changed=false, alt=key && QALT[key], firstAt={}, drop=[], isPP = key==='payrollProfiles';\n"
      "    list.forEach(function(rec, ix){\n"
      "      if(!rec || typeof rec!=='object') return;\n"
      "      var id = rec.id;\n"
      "      if(isPP){ var sid = ppStableId(rec); if(sid && sid!==String(id==null?'':id)){ rec.id = sid; changed=true; id=sid; } }   /* TOMBFIX */\n"
      "      if(id!==undefined && id!==null && id!==''){ var cid = collapse(id); if(cid!==String(id)){ rec.id = cid; changed=true; id=cid; } }   /* patch SYNCFIX: repair */\n")
src = once(src, A1, B1)

A2 = ("      if(seen[id]){\n"
      "        /* patch SYNCFIX: the second id is new and different from the first (the old suffix could be the base itself) */\n")
B2 = ("      if(seen[id] && firstAt[id]!==undefined && list[firstAt[id]]){\n"
      "        /* TOMBFIX: the same record twice is ONE record -- folded, never given a new id (a new id for a copy is a new\n"
      "           record to the union merge, and that is how one payroll stub became 26,826 copies) */\n"
      "        var _j = firstAt[id], _cur = list[_j];\n"
      "        if(isPP){ list[_j] = foldProfile(_cur, rec); drop.push(ix); changed=true; return; }\n"
      "        var _sa = bodySig(rec);\n"
      "        if(_sa!==null && _sa===bodySig(_cur)){ if(stampOf(rec) > stampOf(_cur)) list[_j] = rec; drop.push(ix); changed=true; return; }\n"
      "      }\n"
      "      if(seen[id]){\n"
      "        /* patch SYNCFIX: the second id is new and different from the first (the old suffix could be the base itself) */\n")
src = once(src, A2, B2)
A3 = ("        rec.id = cand; changed=true; id=rec.id;\n"
      "      }\n"
      "      seen[id]=1;\n"
      "    });\n")
B3 = ("        rec.id = cand; changed=true; id=rec.id;\n"
      "      }\n"
      "      seen[id]=1; if(firstAt[id]===undefined) firstAt[id]=ix;   /* TOMBFIX */\n"
      "    });\n")
src = once(src, A3, B3)

# 2. the two payroll stub writers: a stable id, the userId, a save stamp
A4 = "  if(!found) profs.push({name:name, homeState:st, state:st, stateSetAt:new Date().toISOString()});\n"
B4 = ("  if(!found){   /* TOMBFIX: the stub is the person's profile (stable id), not an id-less copy the sync re-ids on every merge */\n"
      "    var _tfU=users.find(function(u){ return u && low(u.name)===low(name); }), _tfS={name:name, homeState:st, state:st, stateSetAt:new Date().toISOString(), updatedAt:new Date().toISOString()};\n"
      "    if(_tfU && _tfU.id) _tfS.userId=_tfU.id;\n"
      "    if(window._gcPayProfileId) _tfS.id=window._gcPayProfileId(_tfS);\n"
      "    profs.push(_tfS);\n"
      "  }\n")
src = once(src, A4, B4)
A5 = "    if(!found) profs.push({name:name, frequency:freq});\n"
B5 = ("    if(!found){   /* TOMBFIX: a stable id, not an id-less stub */\n"
      "      var _tfU=(window._crm&&Array.isArray(window._crm.users)?window._crm.users:[]).find(function(u){ return u && low(u.name)===low(name); }), _tfS={name:name, frequency:freq, updatedAt:new Date().toISOString()};\n"
      "      if(_tfU && _tfU.id) _tfS.userId=_tfU.id;\n"
      "      if(window._gcPayProfileId) _tfS.id=window._gcPayProfileId(_tfS);\n"
      "      profs.push(_tfS);\n"
      "    }\n")
src = once(src, A5, B5)

# 3. profiles(): old copies on this computer are folded by the stable-id step before PROFDUP looks at them
A6 = ("  var list=await get(K_PROF);\n  if(!Array.isArray(list)) list=[];\n"
      "  var _pdRemoved=0;   /* patch PROFDUP: one profile per person — condition-gated, a no-op once there are no copies */\n")
B6 = ("  var list=await get(K_PROF);\n  if(!Array.isArray(list)) list=[];\n"
      "  var _tfIds=false; try{ if(window._gcPayProfileId && window._gcEnsureRecordIds){ var _tfN=list.length; _tfIds=window._gcEnsureRecordIds(list, K_PROF); if(_tfIds && list.length<_tfN) console.log('[GC Payroll] TOMBFIX: '+(_tfN-list.length)+' copies of payroll profiles folded (stable ids)'); } }catch(_tfe){}   /* TOMBFIX */\n"
      "  var _pdRemoved=0;   /* patch PROFDUP: one profile per person — condition-gated, a no-op once there are no copies */\n")
src = once(src, A6, B6)
A7 = "  if(_migChanged || _pdRemoved){ try{ await put(K_PROF, list); }catch(_pe){} }   /* patch PROFDUP: once */\n"
B7 = "  if(_migChanged || _pdRemoved || _tfIds){ try{ await put(K_PROF, list); }catch(_pe){} }   /* patch PROFDUP: once */ /* TOMBFIX: + stable ids */\n"
src = once(src, A7, B7)

# 4. rolling backups gc_bak_<list>: IndexedDB instead of localStorage (same versions, more room)
A8 = ("  function snapKey(k){ return 'gc_bak_'+k; }\n\n"
      "  // Take a snapshot of a key's current data if it looks healthy (non-empty).\n"
      "  window._gcBackupNow = function(){\n"
      "    try{\n"
      "      var crm = window._crm || {};\n"
      "      var map = { schedule: crm.schedule, projects: crm.projects, invs: crm.invoices, subs: crm.subs, customers: crm.customers, leads: (crm.leads||window._crm && window._crm.leads) };\n"
      "      KEYS.forEach(function(k){\n"
      "        var data = map[k];\n"
      "        if(!Array.isArray(data)) return;\n"
      "        if(data.length === 0) return;           // never snapshot an empty list\n"
      "        var snaps = [];\n"
      "        try{ snaps = JSON.parse(localStorage.getItem(snapKey(k))||'[]'); }catch(e){}\n")
B8 = ("  function snapKey(k){ return 'gc_bak_'+k; }\n"
      "  /* TOMBFIX: the versions live in IndexedDB (same key names): up to 10 x 1 M characters per list did not fit in the\n"
      "     ~5 M of localStorage next to everything else (\"storage full: gc_bak_projects (not saved)\"). A copy an earlier visit\n"
      "     left in localStorage is moved over (versions merged by time) and then removed from localStorage. */\n"
      "  var BAKMEM = {};\n"
      "  function idbW(){ return window._gcIdbWrite || window.idbSet; }\n"
      "  function idbR(){ return window._gcIdbRead || window.idbGet; }\n"
      "  function lsSnaps(k){ try{ var a=JSON.parse(localStorage.getItem(snapKey(k))||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }\n"
      "  function mergeSnaps(a, b){ var by={}, out=[]; [].concat(a||[], b||[]).forEach(function(s){ if(s && s.at && !by[s.at]){ by[s.at]=1; out.push(s); } }); out.sort(function(x, y){ return String(x.at)<String(y.at)?-1:1; }); while(out.length > MAX_SNAPS) out.shift(); return out; }\n"
      "  async function loadSnaps(k){\n"
      "    if(BAKMEM[k]) return BAKMEM[k];\n"
      "    var v=null; try{ var r=idbR(); if(r) v=await r(snapKey(k)); }catch(e){}\n"
      "    var s = mergeSnaps(Array.isArray(v)?v:[], lsSnaps(k));\n"
      "    BAKMEM[k]=s; return s;\n"
      "  }\n"
      "  async function saveSnaps(k, snaps){\n"
      "    BAKMEM[k]=snaps;\n"
      "    var ok=false; try{ var w=idbW(); if(w) ok = (await w(snapKey(k), snaps))!==false; }catch(e){ ok=false; }\n"
      "    if(ok){ try{ if(localStorage.getItem(snapKey(k))!=null) localStorage.removeItem(snapKey(k)); }catch(e){} }\n"
      "    return ok;\n"
      "  }\n"
      "  (function moveOld(){   /* the localStorage copies of an earlier visit, moved as soon as IndexedDB is there */\n"
      "    var n=0, iv=setInterval(function(){\n"
      "      if(!idbW() || !idbR()){ if(n++>120) clearInterval(iv); return; }\n"
      "      clearInterval(iv);\n"
      "      KEYS.forEach(function(k){ try{ if(localStorage.getItem(snapKey(k))==null) return; }catch(e){ return; } loadSnaps(k).then(function(s){ return saveSnaps(k, s); }).catch(function(){}); });\n"
      "    }, 500);\n"
      "  })();\n\n"
      "  // Take a snapshot of a key's current data if it looks healthy (non-empty).\n"
      "  window._gcBackupNow = function(){\n"
      "    try{\n"
      "      var crm = window._crm || {};\n"
      "      var map = { schedule: crm.schedule, projects: crm.projects, invs: crm.invoices, subs: crm.subs, customers: crm.customers, leads: (crm.leads||window._crm && window._crm.leads) };\n"
      "      KEYS.forEach(function(k){\n"
      "        var data = map[k];\n"
      "        if(!Array.isArray(data)) return;\n"
      "        if(data.length === 0) return;           // never snapshot an empty list\n"
      "        loadSnaps(k).then(function(snaps){ snaps = snaps.slice();   /* TOMBFIX: IndexedDB */\n")
src = once(src, A8, B8)
A9 = ("        var _t = JSON.stringify(snaps); while(_t.length > 1000000 && snaps.length > 1){ snaps.shift(); _t = JSON.stringify(snaps); }   /* patch DENYKEEP: at most 1 M characters per list */\n"
      "        if(_t.length > 1000000){ try{ localStorage.removeItem(snapKey(k)); }catch(e){} return; }\n"
      "        try{ localStorage.setItem(snapKey(k), _t); }catch(e){}\n"
      "      });\n"
      "    }catch(e){}\n"
      "  };\n\n"
      "  // List available snapshots for a key\n"
      "  window._gcListBackups = function(k){\n"
      "    try{ return JSON.parse(localStorage.getItem(snapKey(k))||'[]').map(function(s){ return {at:s.at, count:s.count}; }); }\n"
      "    catch(e){ return []; }\n"
      "  };\n\n"
      "  // Restore a key from a snapshot (by index; default = most recent healthy one)\n"
      "  window._gcRestoreBackup = function(k, idx){\n"
      "    try{\n"
      "      var snaps = JSON.parse(localStorage.getItem(snapKey(k))||'[]');\n")
B9 = ("        /* TOMBFIX: IndexedDB has room -- up to 10 versions, all of them together at most 4 M characters per list */\n"
      "        var _t = JSON.stringify(snaps); while(_t.length > 4000000 && snaps.length > 1){ snaps.shift(); _t = JSON.stringify(snaps); }\n"
      "        if(_t.length > 4000000) return;\n"
      "        return saveSnaps(k, JSON.parse(_t));\n"
      "        }).catch(function(){});\n"
      "      });\n"
      "    }catch(e){}\n"
      "  };\n\n"
      "  // List available snapshots for a key (TOMBFIX: what this page has read from IndexedDB, + an old localStorage copy)\n"
      "  window._gcListBackups = function(k){\n"
      "    try{ return mergeSnaps(BAKMEM[k]||[], lsSnaps(k)).map(function(s){ return {at:s.at, count:s.count}; }); }\n"
      "    catch(e){ return []; }\n"
      "  };\n"
      "  window._gcLoadRollingBackups = function(){ return Promise.all(KEYS.map(loadSnaps)).then(function(){ return KEYS.reduce(function(o, k){ o[k]=window._gcListBackups(k); return o; }, {}); }); };   /* TOMBFIX */\n\n"
      "  // Restore a key from a snapshot (by index; default = most recent healthy one)\n"
      "  window._gcRestoreBackup = function(k, idx){\n"
      "    try{\n"
      "      var snaps = mergeSnaps(BAKMEM[k]||[], lsSnaps(k));   /* TOMBFIX: IndexedDB (read at start-up / by _gcLoadRollingBackups) */\n")
src = once(src, A9, B9)

open(path, 'w', encoding='utf-8').write(src)
print('patched TOMBFIX')
