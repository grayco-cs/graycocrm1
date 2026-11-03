#!/usr/bin/env python3
"""Idempotent patch LSSLIM: "active with no deposit" (gc_active_no_deposit) stays a short list — one entry per job.

The owner's iPhone (11/03, LSGUARD report): gc_active_no_deposit was 1,554,832 characters, more than half of what iOS
Safari lets a site keep (about 2.5-2.75 M characters), so LSGUARD kept clearing the cached copies (gc_ests_v2,
gc_ests_backup, gc_bak_*, gc_safenet_projects) that could then not be saved again.

Cause: the job-status menu writes {pid, name, at} with NO id (newest first, at most 50). The key is a company-synced,
localStorage-backed list. On every pull the SAFETY NET union merge (_gcUnionMerge -> _gcEnsureRecordIds) gives each
entry a content id from name + pid only, so two entries for the same job (it went active twice) collide and the second
gets a "-gid..." suffix; then the pull merge (_gcPullMerge -> mergeRecords) keeps this computer's id-less copy AND the
cloud's copy with an id (the whole-record text differs), so the list gains copies on every pull, the suffixes chain
(gidA-gidB-gidA-...), and the push sends the union back to the cloud. It grows on every sync round, with or without
new status changes, and nothing ever caps it again (the 50 cap is only applied by the status menu).

Fix (the readers need only pid, name, at, cleared; the alert bar shows the newest 5 not-cleared entries whose job is
still active):
1. The company-sync merge (mergeVal — used by the pull merge AND by the union push) treats this key as "one entry per
   job": newest `at` wins, only {id:'dna:'+pid, pid, name, at, cleared}, newest first, at most 50. So a pull writes the
   slim list over the old big one, and a push sends the slim list (never the cloud's big copy) back up.
2. At page load the localStorage copy is slimmed the same way once, so the phone gets the 1.5 M characters back at the
   first load of this build, before any sync.
Usage: python3 tools/patch_LSSLIM.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_LSSLIM__'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:80], s.count(old))
    return s.replace(old, new)

assert 'var LS_BACKED = { gc_job_source:1' in src and 'gc_active_no_deposit:1' in src, 'LSSLIM goes on the company-sync merge (patch D)'
assert 'localStorage.setItem("gc_active_no_deposit",JSON.stringify(_dna.slice(0,50)))' in src, 'the writer is the job-status menu'

# 1. the merge: one entry per job
A1 = ("function isEmpty(v){ return v === '' || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length); }\n"
      "function mergeVal(key, local, inc){\n")
src = once(src, A1,
  "function isEmpty(v){ return v === '' || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length); }\n"
  "/* patch LSSLIM (" + MARK + "): gc_active_no_deposit is one entry per job — {id, pid, name, at, cleared}, newest first, at\n"
  "   most 50. Its entries had no id, so every pull added copies with chained content ids (1.5 M characters on a phone). */\n"
  "var DNA_KEY = 'gc_active_no_deposit';\n"
  "function dnaSlim(list){\n"
  "  var by = {};\n"
  "  (Array.isArray(list) ? list : []).forEach(function(r){\n"
  "    if(!isObj(r) || r.pid == null || r.pid === '') return;\n"
  "    var p = String(r.pid), at = String(r.at || ''), cur = by[p];\n"
  "    if(cur && cur.at >= at) return;\n"
  "    var e = { id: 'dna:' + p, pid: r.pid, name: String(r.name == null ? '' : r.name).slice(0, 200), at: at };\n"
  "    if(r.cleared) e.cleared = r.cleared;\n"
  "    by[p] = e;\n"
  "  });\n"
  "  return Object.keys(by).map(function(p){ return by[p]; }).sort(function(a, b){ return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; }).slice(0, 50);\n"
  "}\n"
  "window._gcDnaSlim = dnaSlim;\n"
  "function mergeVal(key, local, inc){\n"
  "  if(key === DNA_KEY && (Array.isArray(local) || Array.isArray(inc))) return dnaSlim([].concat(Array.isArray(local) ? local : [], Array.isArray(inc) ? inc : []));   /* patch LSSLIM */\n")

# 2. this computer's copy, once at load
A2 = "window._gcMergeValue = mergeVal;\n"
src = once(src, A2, A2 +
  "/* patch LSSLIM: the copy this computer already has is slimmed once at load (the next sync keeps it slim) */\n"
  "try{ var _dnaRaw = localStorage.getItem(DNA_KEY); if(_dnaRaw){ var _dnaV = JSON.parse(_dnaRaw); if(Array.isArray(_dnaV)){ var _dnaS = JSON.stringify(dnaSlim(_dnaV)); if(_dnaS !== _dnaRaw) localStorage.setItem(DNA_KEY, _dnaS); } } }catch(_dnaE){}\n")

open(path, 'w', encoding='utf-8').write(src)
print('patched LSSLIM')
