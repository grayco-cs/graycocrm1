#!/usr/bin/env python3
"""Idempotent patch SCHEDFILL: the "auto-fill the job address on schedule items" check runs every 30 s and handed the
schedule back as a NEW list every time, even when no address was missing. A new list is a change to the CRM, so every
30 s, all day, on every open computer, the whole schedule was redrawn and saved again (this computer's disk, the save
queue, and a write to the old app_data table that answers with an error in production) — QA 10/27 overnight (r10 and
r8: 2 schedule saves a minute with nobody at the computer). It now hands back the same list when nothing was filled,
so nothing is redrawn or saved; a filled address is saved exactly as before."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch SCHEDFILL'
if MARK in t: print('SCHEDFILL: already patched'); sys.exit(0)
OLD = ("          console.log('[GC] Filled job address on schedule items (safe, live state).');\n"
       "        }\n"
       "        return out;")
NEW = ("          console.log('[GC] Filled job address on schedule items (safe, live state).');\n"
       "        }\n"
       "        return touched ? out : prev;   " + MARK + ": nothing filled = the same list, so nothing is redrawn or saved */")
assert t.count(OLD) == 1, 'SCHEDFILL: expected 1 of the address fill return, found %d' % t.count(OLD)
t = t.replace(OLD, NEW)
open(p, 'w', encoding='utf-8').write(t); print('SCHEDFILL: patched')
