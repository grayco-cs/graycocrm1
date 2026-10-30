#!/usr/bin/env python3
"""Idempotent patch LEADFLAP: the lead list stops swapping between copies; no writer hands the screen an old copy.

Found 10/30 on the live mirror (the owner signed in, nobody touching anything): the lead list (React's list, which
window._crm.leads mirrors) swapped between copies of 116 / 149 / 175 leads every 4-10 s, the disk copy between 149 and
108, and the Approvals "Assign this lead" count drifted (62 -> 66).  Every lead write was logged with its stack:
  * LDEL's disk guard (every 10 s) took off the disk the 41 leads that share a CompanyCam / QuickBooks / inbox id with a
    deleted lead -- 9 of them assigned by a person after that delete, 4 on the list long before it -- while the screen
    and the cloud kept them (the sync's union put them back on the disk at every pull);
  * the "file as leads" importer (THE JOB BOARD IS THE REAL JOBS, 33.136) ran every 4-5 s; its "already a lead?" check
    read only that disk copy, which also leaves out the deleted leads, so every run filed 26 deleted rows again and
    the 41 under their OWN ids as blank copies dated today (no PM), wrote that over the disk, set it on the screen and
    on window._crm.leads as the whole list and sent it to the cloud;
  * the tombstone sweeps took the 26 deleted ones off again: sweepScreen, and sweepLive -- which hands the screen
    window._crm.leads (an old copy: the app does not keep leads on window._crm) minus the deleted ones, by value;
  * the data safety net does the same when window._crm.leads is missing: it put its snapshot back as the whole list;
  * the automatic de-dupe sweep merged 17 same-name leads away on this computer, and the sync's union put them back.
Fix (no new timers; the importer now reads the disk only when the held-off rows change):
  LEADFLAP-1  the importer is idempotent: a held-off row is filed only when no lead has it -- on the screen, on disk,
              deleted (the delete list, or _gcLDEL.blocked: deleted under another id), merged into another lead or
              merged away by the de-dupe sweep -- and new rows are only ADDED (React's list by an updater, the disk as
              read again, the cloud); nothing already there is replaced.
  LEADFLAP-2  LDEL's "the deleted lead brought in again under another id" check is for a lead being brought in
              (_gcLDEL.blocked, which the importer asks); a lead already on the list is no longer taken off the disk or
              the screen by it (the screen and the cloud keep it either way).  A deleted lead's own id stays blocked.
  LEADFLAP-3  sweepLive takes deleted leads off React's own list (an updater), never hands it an old copy.
  LEADFLAP-4  the safety net only ADDS missing leads to React's own list (an updater), never sets its snapshot.
              LEADFLAP-4b: and when the app has no lead list on window._crm (it keeps none there) it does not count
              every lead as missing.
  LEADFLAP-5  the automatic de-dupe sweep leaves leads alone: a lead it merged away (17 on the live data, by name) is not
              deleted, so the sync's union put it back from the cloud at every pull -- another swap.  Leads are merged
              by the owner's lead cleanup (it archives the copy, on every computer).
Usage: python3 tools/patch_LEADFLAP.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch LEADFLAP'
if MARK in src:
    print('LEADFLAP: already patched'); sys.exit(0)
here = os.path.dirname(os.path.abspath(__file__))
NEW_FAL = open(os.path.join(here, 'leadflap_fal.js'), encoding='utf-8').read()   # the importer's filing step, as it is now
# LEADFLAP-1: the old filing step, start to end (each end found exactly once, the old body checked by what it held)
A = 'async function fileAsLeads(){\n  filingT = null;\n'
Z = "Leads → source CompanyCam / QuickBooks.'); }catch(e){}\n}\n"
assert src.count(A) == 1 and src.count(Z) == 1, ('LEADFLAP-1 anchors', src.count(A), src.count(Z))
i = src.index(A); j = src.index(Z) + len(Z)
OLD_FAL = src[i:j]
assert 0 < len(OLD_FAL) < 2600 and "var next = leads.concat(added);" in OLD_FAL and "window._crm.leads = next" in OLD_FAL, len(OLD_FAL)
EDITS = [
    (OLD_FAL, NEW_FAL),
    # LEADFLAP-2 (LDEL)
    ("function blocked(l){\n  if (!l || typeof l !== 'object') return false;\n",
     "function blocked(l, asNew){\n  if (!l || typeof l !== 'object') return false;\n"),
    ('  var m = fpMap(), f = fps(l);\n',
     '  /* patch LEADFLAP-2: "the same lead brought in again under another id" is asked of a lead being brought in\n'
     '     (_gcLDEL.blocked). A lead already on the list is not taken off the disk or the screen by it: the screen and the\n'
     '     cloud kept it anyway (9 of the 41 on the live data were assigned by a person after that delete), so the disk\n'
     '     and the screen swapped copies every 10 s. */\n'
     '  if (asNew !== true) return false;\n'
     '  var m = fpMap(), f = fps(l);\n'),
    ('  ask: ask, remove: remove, restore: restore, trash: trash, rsDeleted: rsDeleted, blocked: blocked,\n',
     '  ask: ask, remove: remove, restore: restore, trash: trash, rsDeleted: rsDeleted, blocked: function(l){ return blocked(l, true); },   /* patch LEADFLAP-2 */\n'),
    # LEADFLAP-3 (universal tombstones: sweepLive)
    ('          try{ if(setter) setter(filtered.slice()); }catch(e){}\n',
     "          /* patch LEADFLAP-3: window._crm.leads is a copy (the app does not keep leads there): take the deleted\n"
     "             leads off React's own list, never hand it that copy */\n"
     "          if(prop==='leads'){ try{ if(setter) setter(function(prev){ return Array.isArray(prev) ? window._gcApplyTombstoneFilter(key, prev) : prev; }); }catch(e){} }\n"
     '          else { try{ if(setter) setter(filtered.slice()); }catch(e){} }\n'),
    # LEADFLAP-4 (data safety net)
    ('            if(setter){ try{ setter(merged.slice()); }catch(e){} }\n            if(window._gcApplySync){ try{ window._gcApplySync(k, merged); }catch(e){} }\n',
     "            if(k==='leads' && setter){   /* patch LEADFLAP-4: add what React's own list lacks; never set the snapshot (an old copy) over it */\n"
     "              (function(add0){ try{ setter(function(prev){ var a = Array.isArray(prev) ? prev : [], h = {}; a.forEach(function(x){ var id=idFor(x); if(id!=null) h[id]=1; });\n"
     "                var add = add0.filter(function(x){ var id=idFor(x); return id!=null && !h[id]; }); return add.length ? a.concat(add) : prev; }); }catch(e){} })(missing);\n"
     '            } else {\n'
     '            if(setter){ try{ setter(merged.slice()); }catch(e){} }\n            if(window._gcApplySync){ try{ window._gcApplySync(k, merged); }catch(e){} }\n'
     '            }\n'),
    # LEADFLAP-4b (data safety net): no lead list on window._crm is not "every lead went missing"
    ('        _sqDid++;\n        var live=getList(k);\n',
     "        if(k==='leads' && !Array.isArray(crm()[k])) return;   /* patch LEADFLAP-4b: the app keeps no lead list on window._crm; none there is not 132 missing leads */\n"
     '        _sqDid++;\n        var live=getList(k);\n'),
    # LEADFLAP-5 (de-dupe sweep): leads are left to the owner's lead cleanup
    ('      var L=LISTS[i];\n      var rows=null;\n      try{ rows=await window.idbGet(L.key); }catch(e){}\n',
     '      var L=LISTS[i];\n'
     "      if(L.key==='leads') continue;   /* patch LEADFLAP-5: a lead merged away here is not deleted, so the sync's union put it straight\n"
     "                                         back from the cloud (17 on the live data, at every pull): the list swapped copies. Leads are\n"
     "                                         merged by the lead cleanup (it archives the copy, on every computer); _gcDupesAnywhere() still shows them. */\n"
     '      var rows=null;\n      try{ rows=await window.idbGet(L.key); }catch(e){}\n'),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('LEADFLAP anchor count != 1', a[:70], src.count(a))
    src = src.replace(a, b)
assert src.count(MARK) == 7, src.count(MARK)
open(path, 'w', encoding='utf-8').write(src)
print('LEADFLAP: patched', path)
