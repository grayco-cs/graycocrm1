#!/usr/bin/env python3
"""Idempotent patch TOMBFIX2: deleting on a computer that still held the old 21 MB delete list never freezes the page.

Live, owner's PC on r36c (16:30-16:35Z): the cloud list was already clean (21 MB -> 169K), but the Leads view froze for
7.6 s and 6.5 s, again and again (and once 32 s right after load). Profile: IDBRequest.onsuccess -> tombstone ->
removeLinkLosers -> sweep -> repairLS (2.6 s) -> changed -> lsWrite -> guardedSet -> lsText -> compact/garbage (2.8 s).
Cause: the delete-list module "FIX_INV" (M, the one that answers "is this deleted?") unions EVERY localStorage write of
gc_tombstones into its memory BEFORE the TOMBFIX door cleans it, and keeps it for good. Once M held the runaway entries,
repairLS() -- run on every delete and every 1.5 s -- wrote the 21 MB list back; the door cleaned it; the copy then lacked
M's entries, so the next repairLS wrote it again. Each round: two parses of 21 MB, a compaction, a stringify.
Fix:
1. (tools/tombfix_early.js) window._gcTombGarbage = the runaway rule; the localStorage door only cleans a text that carries
   a runaway entry (one text search) and remembers the last answer; it never trims a write that fits (the 1 M cap applies
   only when the browser refuses the write); a big old IndexedDB copy is written back clean once, in the background; the
   "every row is the list" reading of a cloud answer is only for key=eq.gc_tombstones (a key=in.(...) answer was cleaned
   row by row only when the row is gc_tombstones -- before, a single in.() filter made every map row look like the list).
2. Every in-memory delete list refuses the runaway entries when it takes anything in: FIX_INV (absorbMap), the universal
   tombstones (absorb), the fix-pack writer (_gcTombstoneMany and the IndexedDB read-back), the cloud delete-list sync.
3. FIX_INV's repairLS runs once per burst (120 ms after the last change), not once per deleted id.
4. The universal tombstones module writes localStorage / IndexedDB / the cloud once per burst (60 ms; at once on page
   close) -- a sweep that deletes 20 rows makes one write, not 20.
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '/* TOMBFIX2:'
if 'TOMBFIX2 (r36c' in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_TOMBFIX__' in src, 'TOMBFIX2 goes on top of TOMBFIX'


def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)


# 0. the early script = tools/tombfix_early.js (TOMBFIX2 version)
EARLY = open(os.path.join(here, 'tombfix_early.js'), encoding='utf-8').read()
assert 'TOMBFIX2 (r36c' in EARLY
i = src.index('<script id="gc-patch-tombfix">\n') + len('<script id="gc-patch-tombfix">\n')
j = src.index('</script>\n', i)
src = src[:i] + EARLY.rstrip('\n') + '\n' + src[j:]

G = "(window._gcTombGarbage && window._gcTombGarbage(%s))"
# 1. FIX_INV: memory refuses runaway entries; repairLS once per burst
src = once(src, "    var k = normKey(k0), v = src[k0] || 1;\n",
           "    var k = normKey(k0), v = src[k0] || 1;\n"
           "    if(" + G % 'k' + ") return;   /* TOMBFIX2: a runaway payroll-profile mark never enters memory */\n")
src = once(src, "function changed(){\n  repairLS();\n",
           "var repT = null;\n"
           "function changed(){\n"
           "  /* TOMBFIX2: the browser copy is repaired once per burst (a sweep deletes many rows in one go), not once per id */\n"
           "  if(!repT) repT = ST.call(window, function(){ repT = null; try{ repairLS(); }catch(e){} }, 120);\n")
# 2. universal tombstones: absorb refuses runaway entries; one write per burst
src = once(src, "    Object.keys(src).forEach(function(k){ if(!(k in m)){ m[k]=src[k]; added++; } });\n",
           "    Object.keys(src).forEach(function(k){ if(" + G % 'k' + ") return; if(!(k in m)){ m[k]=src[k]; added++; } });   /* TOMBFIX2 */\n")
src = once(src, "  function save(v){\n    absorb(v);\n    v = load();\n    /* the store with room, first */\n",
           "  /* TOMBFIX2: one write (localStorage, IndexedDB, the cloud) per burst of deletes -- memory has them at once */\n"
           "  var saveT = null;\n"
           "  function save(v){\n"
           "    absorb(v);\n"
           "    if(saveT) return;\n"
           "    saveT = setTimeout(function(){ saveT = null; saveNow(); }, 60);\n"
           "  }\n"
           "  try{ window.addEventListener('beforeunload', function(){ if(saveT){ clearTimeout(saveT); saveT = null; saveNow(); } }); }catch(e){}\n"
           "  function saveNow(){\n    var v = load();\n    /* the store with room, first */\n")
# 3. fix-pack writer: never marks or reads back a runaway entry
src = once(src, "    var id = ids[i]; if(!id) continue;\n",
           "    var id = ids[i]; if(!id) continue;\n"
           "    if(" + G % "type+':'+id" + ") continue;   /* TOMBFIX2 */\n")
src = once(src, "      Object.keys(saved).forEach(function(k){ if(!(k in t)){ t[k] = saved[k]; added++; } });\n",
           "      Object.keys(saved).forEach(function(k){ if(" + G % 'k' + ") return; if(!(k in t)){ t[k] = saved[k]; added++; } });   /* TOMBFIX2 */\n")
# 4. the cloud delete-list sync
src = once(src, "  Object.keys(map||{}).forEach(function(k){ if(!(k in have) && !_ck[k]) fresh.push(k); });\n",
           "  Object.keys(map||{}).forEach(function(k){ if(!(k in have) && !_ck[k] && !" + G % 'k' + ") fresh.push(k); });   /* TOMBFIX2 */\n")
open(path, 'w', encoding='utf-8').write(src)
print('patched TOMBFIX2')
