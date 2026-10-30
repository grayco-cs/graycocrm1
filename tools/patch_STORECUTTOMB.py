#!/usr/bin/env python3
"""Idempotent patch STORECUTTOMB: the admin clean-ups never bring back a deleted record (gc_tombstones).

Owner 10/29 (schedule 146 -> 23): 96 deleted schedule entries had come back from old August chunk pieces during a
clean-up, and the app removed them again. The same must never happen in STORECUT's clean-ups. Checked on the real data
(read-only mirror, 10/29 17:27): the 4 documents found only in the old projectDocs__chunk pieces are ALL deleted
(projectDocs tombstones) -- STORECUT's documents step would have uploaded their PDFs and listed them in
"gc_docs_recovered"; 113 of the 147 estimates in the old estimates__chunk pieces are deleted.
Fix (every check uses the app's own window._gcxDead(type, id): a tombstone, unless a later "undelete" cleared it):
  documents step (_gcDocsCleanNow): a deleted document in the old pieces is neither uploaded nor recovered (counted
    as rep.deletedSkipped);
  estimates (ESTDEDUPE's live set = "estimates" + the builder store): a deleted estimate that is only in the builder
    store is not put back into "estimates"; a deleted chunk-only estimate is not "unmatched" (it does not block the
    clean-up); _gcEstOneNow does not count a deleted builder estimate as missing from "estimates".
Usage: python3 tools/patch_STORECUTTOMB.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch STORECUTTOMB'
if MARK in t: print('STORECUTTOMB: already patched'); sys.exit(0)
assert '__GC_STORECUT_TOOLS__' in t and 'window._gcEstDedupeNow = async function' in t, 'needs STORECUT + ESTDEDUPE'
DEAD = ("function(type, id){ try { if (window._gcxDead) return !!window._gcxDead(type, id); var m = JSON.parse(localStorage.getItem('gc_tombstones') || '{}'); "
        "return !!(m && m[type + ':' + id]); } catch (e) { return false; } }")
def once(old, new):
    global t
    assert t.count(old) == 1, ('STORECUTTOMB anchor count != 1', t.count(old), old[:80])
    t = t.replace(old, new)
# documents
once("  rep.plainDocs = plain.length; rep.pieces = pieces.length;",
     "  " + MARK + ": a deleted document in the old pieces is neither uploaded nor recovered */\n"
     "  var _stDead = " + DEAD + ";\n"
     "  var _stN0 = chunks.length; chunks = chunks.filter(function(x){ return !(x && x.d && x.d.id != null && _stDead('projectDocs', String(x.d.id))); }); rep.deletedSkipped = _stN0 - chunks.length;\n"
     "  rep.plainDocs = plain.length; rep.pieces = pieces.length;")
# ESTDEDUPE live set and unmatched
once("plain.concat(v2).forEach(function(r){ var id = idOf(r); if (!id) return;",
     "var _stDeadE = " + DEAD + ", _stDE = function(id){ return _stDeadE('estimates', id) || _stDeadE('estimate', id); };   " + MARK + " */\n"
     "    var _stPlainIds = {}; plain.forEach(function(r){ var id = idOf(r); if (id) _stPlainIds[id] = 1; });\n"
     "    rep.deletedSkipped = 0;\n"
     "    plain.concat(v2).forEach(function(r){ var id = idOf(r); if (!id) return; if (!_stPlainIds[id] && _stDE(id)) { rep.deletedSkipped++; return; }")
once("chunks.forEach(function(r){ var id = idOf(r); if (!id || liveIds[id]) return;",
     "chunks.forEach(function(r){ var id = idOf(r); if (!id || liveIds[id] || _stDE(id)) return;")
# _gcEstOneNow: a deleted builder estimate is not "missing"
once("  var miss = arr(v2).filter(function(e){ return e && e.id != null && !have[String(e.id)]; });",
     "  var _stDeadO = " + DEAD + ";   " + MARK + " */\n"
     "  var miss = arr(v2).filter(function(e){ return e && e.id != null && !have[String(e.id)] && !(_stDeadO('estimates', String(e.id)) || _stDeadO('estimate', String(e.id))); });")
assert t.count(MARK) == 3
open(p, 'w', encoding='utf-8').write(t)
print('STORECUTTOMB: patched')
