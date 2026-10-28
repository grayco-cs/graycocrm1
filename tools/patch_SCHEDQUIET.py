#!/usr/bin/env python3
"""Idempotent patch SCHEDQUIET: the schedule stops re-checking itself in the background when nothing changed, and a
save shows "Sent" within about two seconds.

Owner (10/28): "what is this about schedule running a lot at once ... it feels like its whats slowing me down" —
(a) the schedule re-checking / syncing itself every few minutes, (b) "Saved on this computer — sending…" staying up.

1. SAVE NOTE. The save queue (patch SYNCQ) would not send while _gcShouldHoldSync() was true — and the NO-JUMP block
   makes that true for 12 s after ANY click or key. Pressing Save is a click, so every save sat in the queue for 12-15 s
   with "Saved on this computer — sending…" on screen, and kept sitting there for as long as he kept clicking. The
   queue now waits only for the cloud's own back-off (the busy-database brake), and "typing" ends at the click that
   follows the last keystroke (pressing Save). The first send is tried 0.6 s after the save instead of 1.5 s.
   A failed send still waits in the queue and retries quietly (15 s, then every 5 s), nothing on screen blocks clicks.
2. QUIET WHEN NOTHING CHANGED (each compares the list it looked at last time — same list = no work):
   - the Start/Finish bookend writer (every 15 s: copied every row, JSON of every row, read grayco_schedule)
   - the job-address fill (every 30 s: ran the schedule setter chain over the whole list)
   - the schedule guardian's backup copy (every 20 s: read gc_sched_backup back from browser storage)
   - the keep-forever floor (every 5 s: copied six whole lists)
   and none of them works while the tab is hidden.
Further items are appended below as they are measured (tools: scratchpad wSQ/sq.mjs).
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch SCHEDQUIET'
if MARK in t:
    print('SCHEDQUIET: already patched'); sys.exit(0)

def rep(name, old, new, count=1):
    global t
    n = t.count(old)
    assert n == count, 'SCHEDQUIET %s: expected %d, found %d' % (name, count, n)
    t = t.replace(old, new)

# 1a. the cloud's back-off on its own (without the 12 s click hold NO-JUMP adds on top)
rep('backoff-only',
    "  window._gcShouldHoldSync = function(){\n    return Date.now() < state.backoffUntil;\n  };",
    "  window._gcShouldHoldSync = function(){\n    return Date.now() < state.backoffUntil;\n  };\n"
    "  window._gcSyncBackoffHold = function(){ return Date.now() < state.backoffUntil; };   " + MARK + ": the database brake alone (no click hold) */")

# 1b. the save queue: typing ends at the click after the last key; only the database brake holds a send
rep('queue-busy',
    "    function busy(){\n"
    "      try{ if(isTyping()) return true; }catch(e){}\n"
    "      try{ if(window._gcShouldHoldSync && window._gcShouldHoldSync()) return true; }catch(e){}\n"
    "      return false;\n"
    "    }\n"
    "    var kickT = null;",
    "    " + MARK + ": a save is sent as soon as it is made. \"Typing\" ends at the click that follows the last key (Save), and only\n"
    "       the database's own back-off holds a send — the 12 s after-any-click hold kept every save waiting 12-15 s with\n"
    "       \"Saved on this computer — sending…\" on screen, longer while he kept clicking. */\n"
    "    var _sqPtrAt = 0; try{ document.addEventListener('pointerdown', function(){ _sqPtrAt = Date.now(); }, true); }catch(e){}\n"
    "    function busy(){\n"
    "      try{ if(isTyping() && !(_sqPtrAt > _lastKeyAt)) return true; }catch(e){}\n"
    "      try{ if(typeof window._gcSyncBackoffHold === 'function'){ if(window._gcSyncBackoffHold()) return true; }\n"
    "           else if(window._gcShouldHoldSync && window._gcShouldHoldSync()) return true; }catch(e){}\n"
    "      return false;\n"
    "    }\n"
    "    var kickT = null;")
rep('queue-kick',
    "      persist();\n      kick(1500);\n      return Promise.resolve({ deferred:true, queued:true });",
    "      persist();\n      kick(600);   " + MARK + " */\n      return Promise.resolve({ deferred:true, queued:true });")

# 2a. bookend writer: same schedule + same jobs as the last pass that changed nothing = nothing to do
rep('bookends',
    "  function sync(){\n"
    "    // Don't fight the user while they're editing or the tab is hidden.\n"
    "    if(window.__GC_IS_TYPING__ || window.__GC_IS_ACTIVE__ || document.hidden) return;\n"
    "    var projects=(crm().projects)||[];\n"
    "    if(!projects.length) return;\n",
    "  var _sqSeen=null;   " + MARK + ": the schedule + jobs the last pass found nothing to do for */\n"
    "  function sync(){\n"
    "    // Don't fight the user while they're editing or the tab is hidden.\n"
    "    if(window.__GC_IS_TYPING__ || window.__GC_IS_ACTIVE__ || document.hidden) return;\n"
    "    var projects=(crm().projects)||[];\n"
    "    if(!projects.length) return;\n"
    "    var _sqLs=0; try{ _sqLs=(localStorage.getItem('grayco_schedule')||'').length; }catch(e){}\n"
    "    if(_sqSeen && _sqSeen.p===projects && _sqSeen.s===crm().schedule && _sqSeen.l===_sqLs) return;\n"
    "    var _sqNow={ p:projects, s:crm().schedule, l:_sqLs };\n")
rep('bookends-nochange',
    "      try{ localStorage.setItem('grayco_schedule', JSON.stringify(sched)); }catch(e){}\n    }\n  }\n",
    "      try{ localStorage.setItem('grayco_schedule', JSON.stringify(sched)); }catch(e){}\n      _sqSeen=null;\n    } else _sqSeen=_sqNow;\n  }\n")

# 2b. job-address fill: look at the list first; the setter chain only runs when a row is missing an address
rep('addrfill',
    "      if(window.__GC_IS_TYPING__) return;\n"
    "      if(!window._setSchedule) return;\n"
    "      var projects=((window._crm&&window._crm.projects)||[]).filter(Boolean);\n"
    "      if(!projects.length) return;\n"
    "      var byId={}; projects.forEach(function(p){ byId[p.id]=p; });\n",
    "      if(window.__GC_IS_TYPING__) return;\n"
    "      if(!window._setSchedule) return;\n"
    "      if(document.hidden) return;\n"
    "      var projects=((window._crm&&window._crm.projects)||[]).filter(Boolean);\n"
    "      if(!projects.length) return;\n"
    "      var byId={}; projects.forEach(function(p){ byId[p.id]=p; });\n"
    "      " + MARK + ": nothing to fill on the list on screen = the setter is not called at all */\n"
    "      var _sqS=(window._crm&&window._crm.schedule)||[];\n"
    "      if(Array.isArray(_sqS) && !_sqS.some(function(s){ return s && !(s.address && String(s.address).trim()) && s.pid && byId[s.pid] && byId[s.pid].address; })) return;\n")

# 2c. schedule guardian backup: the same list as last time = do not even read the stored copy back
rep('guardian',
    "      var sched=(window._crm&&window._crm.schedule)||[];\n"
    "      if(!Array.isArray(sched)||!sched.length) return;\n"
    "      var key='gc_sched_backup';\n",
    "      var sched=(window._crm&&window._crm.schedule)||[];\n"
    "      if(!Array.isArray(sched)||!sched.length) return;\n"
    "      if(sched===_bkList && sched.length===_bkN && (document.hidden || _bkLen>=0)) return;   " + MARK + ": the same list = nothing to copy */\n"
    "      var key='gc_sched_backup';\n")

# 2d. keep-forever floor: only lists that changed are copied
rep('floor',
    "        var v=c[p[1]];\n"
    "        if(Array.isArray(v) && v.length >= (LAST[p[0]]||[]).length){\n"
    "          LAST[p[0]]=v.slice();",
    "        var v=c[p[1]];\n"
    "        if(Array.isArray(v) && window.__gcFloorSrc && window.__gcFloorSrc[p[0]]===v) return;   " + MARK + ": the same list as last look */\n"
    "        if(Array.isArray(v) && v.length >= (LAST[p[0]]||[]).length){\n"
    "          (window.__gcFloorSrc=window.__gcFloorSrc||{})[p[0]]=v;\n"
    "          LAST[p[0]]=v.slice();")

# 2e. the data safety net (gc_safenet_<list>, every 30 s): read every stored copy back, JSON of every list, wrote
#     them all again — on every tick, changed or not. A list that is the same list as the one it copied last time
#     cannot have lost anything since: it is skipped (nothing read, nothing written).
rep('safenet',
    "      var restoredAny=null;\n"
    "      LISTS.forEach(function(k){\n"
    "        var live=getList(k);\n"
    "        var snap=readSnap(k);\n"
    "        // If snapshot has records the live list lost, restore them.",
    "      var restoredAny=null, _sqDid=0;\n"
    "      var _sqSeen=window.__gcSafenetSeen||(window.__gcSafenetSeen={});   " + MARK + ": the list each pass last copied */\n"
    "      LISTS.forEach(function(k){\n"
    "        var _sqRaw=crm()[k]; if(Array.isArray(_sqRaw) && _sqSeen[k]===_sqRaw) return;\n"
    "        _sqDid++;\n"
    "        var live=getList(k);\n"
    "        var snap=readSnap(k);\n"
    "        // If snapshot has records the live list lost, restore them.")
rep('safenet-mark',
    "        if(live.length >= snap.length){ writeSnap(k, live); }\n"
    "        meta[k]={ count:Math.max(live.length, snap.length), at:Date.now() };\n"
    "      });\n"
    "      try{ localStorage.setItem(META_KEY, JSON.stringify(meta)); }catch(e){}",
    "        if(live.length >= snap.length){ writeSnap(k, live); }\n"
    "        meta[k]={ count:Math.max(live.length, snap.length), at:Date.now() };\n"
    "        if(Array.isArray(_sqRaw) && live.length >= snap.length && !(restoredAny && restoredAny[k])) _sqSeen[k]=_sqRaw; else delete _sqSeen[k];\n"
    "      });\n"
    "      if(_sqDid){ try{ localStorage.setItem(META_KEY, JSON.stringify(meta)); }catch(e){} }")

# 2f. the schedule change history (SCHEDHIST, every 1.5 s): looked at the list through the whole setter chain every
#     tick. Now: nothing while the tab is hidden, and the setter is asked only when the CRM's own list moved or every
#     4th tick (6 s) — a change is still recorded, at most a few seconds later.
rep('schedhist',
    "    peek(); var list = LIVE || crm().schedule; if (!Array.isArray(list)) return;",
    "    if (D.hidden) return;   " + MARK + " */\n"
    "    var _sqC = crm().schedule; if (!SNAP || _sqC !== W.__gcSchedHistC || !((W.__gcSchedHistN = (W.__gcSchedHistN | 0) + 1) % 4)) { W.__gcSchedHistC = _sqC; peek(); }\n"
    "    var list = LIVE || crm().schedule; if (!Array.isArray(list)) return;")

open(p, 'w', encoding='utf-8').write(t)
print('SCHEDQUIET: patched')
