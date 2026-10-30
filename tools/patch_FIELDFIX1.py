#!/usr/bin/env python3
"""Idempotent patch FIELDFIX1: a punch item / daily log / inspection / change order made on a phone shows up on the
office's open CRM without a reload.

Found by the field-view audit (10/30): a crew member adds a punch item in GrayCo Field; it reaches the cloud and the
office computer's disk within seconds, but the office's Punch List stayed "No punch list" until the page was reloaded.
The live feed (patch N) lays another computer's save over the screen only for lists that have a window._setX setter
(projects, invoices, expenses, schedule, ...). The lists the CRM keeps only inside its React state -- punch, logs,
inspections, cos, warrs, scopes -- were left to "the company sync's own queue", but that queue's apply
(_gcApplySync) is held by the sync governor outside a tab-change sync, and the next tab-change sync finds nothing new
on the disk, so the screen never got it.

Fix: in the live feed's apply step, those lists use the CRM's own raw state setter (window._gcApplySyncRaw) with the
same record-by-record overlay the other lists use (adds and newer copies only; deleted ids stay out; a save made here a
moment ago is never replaced by an older copy). Same hold rules (never while typing). No new timers.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* FIELDFIX1 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:80], s.count(old))
    return s.replace(old, new)

OLD = """      if(lsBacked(k)){ await applyLS(k); continue; }
      if(typeof set !== 'function') continue;                  /* no screen setter: the company sync's own queue draws it */"""
NEW = """      if(lsBacked(k)){ await applyLS(k); continue; }
      if(typeof set !== 'function' && RAWSET[k] && typeof window._gcApplySyncRaw === 'function') set = (function(kk){ return function(fn){ window._gcApplySyncRaw(kk, fn); }; })(k);   """ + MARK + """
      if(typeof set !== 'function') continue;                  /* no screen setter: the company sync's own queue draws it */"""
src = once(src, OLD, NEW)

OLD2 = """var CRMPROP = { invs:'invoices' };
var toApply = {}, applyT = null, appliedSig = {};"""
NEW2 = """var CRMPROP = { invs:'invoices' };
/* FIELDFIX1: lists that live only in the CRM's React state (no window._setX): laid over the screen through its raw setter */
var RAWSET = { punch:1, logs:1, inspections:1, cos:1, warrs:1, scopes:1 };
var toApply = {}, applyT = null, appliedSig = {};"""
src = once(src, OLD2, NEW2)

open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFIX1')
