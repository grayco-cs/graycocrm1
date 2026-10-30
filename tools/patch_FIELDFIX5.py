#!/usr/bin/env python3
"""Idempotent patch FIELDFIX5: a daily log written with no signal goes up soon after the signal is back.

Found by the field-view audit (10/30): Site Book (daily logs, problems, inspections the field writes) keeps its
"not sent yet" flag only in memory. After a reload with no signal, it learns there is something to send only from a
successful read of the cloud, and a failed read waited a full minute before the next one: the log went up 60-100 s
after the signal came back. Now a failed read is tried again on the next 4-second tick (in place of the small
"anything new?" check that tick already makes, so no extra requests and no new timers).
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* FIELDFIX5 */'
if MARK in src:
    print('already patched'); sys.exit(0)
OLD = "if (ahead) { dirty = true; } err = ''; }).catch(function(e){ err = e.message; }); }"
NEW = "if (ahead) { dirty = true; } err = ''; }).catch(function(e){ err = e.message; lastPull = 0; " + MARK + " }); }"
assert src.count(OLD) == 1, src.count(OLD)
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFIX5')
