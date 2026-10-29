#!/usr/bin/env python3
"""Idempotent patch STORECUT: less stored, less downloaded (owner 10/29: "the storage space and amount of loads needs to be
lower for less lag" / "page not responding can't happen anymore").  Applies on top of STUCKFIX + ESTDEDUPE.

Production gc_kv (10/29, read-only copy): 41.6 MB.  27.8 MB of it are old copies no screen reads:
  * estimates__chunk0..11 (14.3 MB, 10-21, torn) - every estimate there is an older copy of one in "estimates";
  * projectDocs__chunk0..12 (13.6 MB, a 9-22 snapshot with the PDFs inside as base64) - "projectDocs" is a plain row since
    patch D and its files already live in file storage (bucket crm-files, patch G): 31 of the 33 PDFs in the old pieces are
    byte-for-byte (same SHA-256) files that projectDocs already points at; 2 are not.
  and the estimates are kept twice more: "estimates" (2.7 MB) and the builder's own "__est__gc_ests_v2" (2.7 MB, same 44).

1. ONE ESTIMATES STORE (automatic, this page):  "estimates" is the only estimate list in the cloud.  The builder's store
   "__est__gc_ests_v2" stays on each computer (the builder needs it) but is no longer uploaded: the builder <-> CRM heal
   (_gcHealEstimates, build 33.14) already fills it from "estimates" after every pull.  A read of it by name is answered
   from "estimates" (same records, as the builder's JSON text); bulk reads leave it out.  Kill switch: gc_storecut_off = '1'.
2. QUIET WHEN NOBODY LOOKS (automatic): identical reads in flight at the same moment share one download; while the tab is
   hidden, a repeat of the same read within 5 minutes is answered from the last answer (the change check, function
   status reads); the moment the tab is visible again those are fresh.  Writes always go out and clear the memory.
3. ONE-TIME CLEAN-UPS, admin-run only, dry run first (nothing automatic, nothing deleted from file storage):
     _gcStoreCutNow({ dryRun: true })   the report: what each step would do and the sizes before / after
     _gcStoreCutNow()                    a backup file of everything it changes is saved on this computer first, then:
       a. estimates: _gcEstDedupeNow (ESTDEDUPE) + the builder copy "__est__gc_ests_v2" emptied (one store);
       b. documents: every PDF in the old projectDocs pieces is checked in file storage by its SHA-256 (uploaded first
          when missing); documents found only in the old pieces are kept as references in "gc_docs_recovered";
          then the pieces are emptied and the manifest says "not chunked";
       c. gc_folded (the undo list of folded duplicates): the full copies of folds older than 3 days move into one
          JSON file in file storage; the list keeps the small entry (what was folded into what) + the file reference.
          Undo still works (the copy is fetched from the file).
   Each step can also run alone: _gcDocsCleanNow(opt), _gcFoldTrimNow(opt), _gcEstOneNow(opt).
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_STORECUT__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_STUCKFIX__' in src and '__GC_PATCH_ESTDEDUPE__' in src, 'STORECUT goes on top of STUCKFIX + ESTDEDUPE'

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:80], s.count(old))
    return s.replace(old, new)

EARLY = open(__file__.replace('patch_STORECUT.py', 'storecut_early.js'), encoding='utf-8').read()
LATE = open(__file__.replace('patch_STORECUT.py', 'storecut_tools.js'), encoding='utf-8').read()
assert MARK in EARLY

ANCHOR = "try { console.log('[GC] STUCKFIX: start-up skips the old estimate / document chunks; estimates load when needed — _gcHeavy.state()'); } catch (e) {}\n})();\n</script>\n"
src = once(src, ANCHOR, ANCHOR + '<script id="gc-patch-storecut">\n' + EARLY.rstrip('\n') + '\n</script>\n')
# 4. daily backup ("GrayCo Daily Backups"): every page load read all 21 lists from the cloud 12 s in (estimates 2.7 MB,
#    projectDocs ...), wrote ~7 MB into IndexedDB and uploaded the whole day (~7 MB) to gc_kv again -- per computer, per load.
#    Now: the start-up copy waits 2 minutes and is skipped when today's copy on this computer is under 3 hours old (the 3-hourly
#    copy and the 5 PM / midnight copies stay); the day is no longer uploaded to gc_kv: the server's nightly gc-backup keeps
#    30 protected copies of every table (gc_backups). localStorage gc_daily_cloud = '1' turns the upload back on.
src = once(src, "  setTimeout(snapshotToday, 12000);",
  "  /* patch STORECUT: not at every start-up -- after 2 min, and only when today's copy here is older than 3 h */\n"
  "  setTimeout(function(){ (async function(){ try{ var _sv = await _idbGet(keyFor(today())); if(_sv && _sv.savedAt && Date.now() - Date.parse(_sv.savedAt) < 3*3600e3){ console.log('[GC] Daily backup: today copy is fresh (patch STORECUT)'); return; } }catch(e){} try{ await snapshotToday(); }catch(e){} })(); }, 120000);")
src = once(src, "  async function pushDayToCloud(date, data){\n    try{\n",
  "  async function pushDayToCloud(date, data){\n    try{\n"
  "      /* patch STORECUT: the nightly server backup (gc-backup -> gc_backups, 30 per table) is the cloud copy; this ~7 MB upload per load is off */\n"
  "      try{ if(localStorage.getItem('gc_daily_cloud') !== '1') return; }catch(e){ return; }\n")
src = src.rstrip('\n') + '\n<script id="gc-patch-storecut-tools">\n' + LATE.rstrip('\n') + '\n</script>\n'
open(path, 'w', encoding='utf-8').write(src)
print('patched STORECUT')
