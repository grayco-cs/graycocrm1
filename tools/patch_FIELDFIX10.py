#!/usr/bin/env python3
"""Idempotent patch FIELDFIX10: a save that waited across a reload is really sent (not just put back on the disk).

Found by the field-view audit (10/30), after FIELDFIX4: a punch item and a progress change saved on a phone with no
signal, page reloaded, signal back -- the punch item was still not in the cloud after 4 minutes and the job change
came up only with the 3-minute idle sync. The save queue (SYNCQ) keeps waiting saves across a reload, but for the
company lists it only merges them into this phone's disk and expects "the regular upload" to carry them; after a
reload that upload compares against a snapshot taken from the same disk, so it sees nothing new and sends nothing.

Same when the save is handled while the cloud cannot be reached (no signal: the queue used to merge it into the disk
and drop it, so whether it survived a reload was a matter of seconds).
Fix: such a save (restored after a reload, or handled while the last cloud request failed) is, after the merge into
the disk, sent the way the queue sends any other list (toCloud: read the cloud copy, union by id -- a newer save stamp wins, deletes stay deleted -- then write).
If that fails it stays in the queue and is tried again by the queue's existing 5-second loop. Needs FIELDFIX4.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* FIELDFIX10 */'
if MARK in src:
    print('already patched'); sys.exit(0)
OLD = "var p = (sk[key] && Array.isArray(item.v) && !item.recover) ? intoLocal(key, item.v) : toCloud(key, item);\n"
assert src.count(OLD) == 1, src.count(OLD)
NEW = OLD + "          if((item.restored || item.mustSend || (function(){ try{ return !navigator.onLine || !!(window.__gcSyncBackoff && window.__gcSyncBackoff.failStreak > 0); }catch(e){ return false; } })()) && sk[key] && Array.isArray(item.v) && !item.recover){ item.mustSend = 1; p = p.then(function(){ return idGet(key).then(function(cur){ return toCloud(key, { v: Array.isArray(cur) ? cur : item.v }); }); }); }   " + MARK + " /* saved before a reload: really send it */\n"
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFIX10')
