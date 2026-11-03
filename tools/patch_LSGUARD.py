#!/usr/bin/env python3
"""Idempotent patch LSGUARD: a full browser storage never fails a save silently (ACCTGATE 11/03: localStorage at
5,242,855 of ~5,242,880 characters after the QuickBooks imports; every setItem threw QuotaExceededError and was swallowed:
a 💵 payment match vanished, grayco_view stayed old so Approvals would not open).

1. tools/lsguard_early.js becomes the FIRST script of the page (before BOOTSAFE): Storage.prototype.setItem on a
   "storage full" error removes only the listed copies (mirrors / local backup copies of data that also lives in IndexedDB
   and the cloud; the list with the reason for each key is in that file), biggest first, until the write fits, and tries
   ONCE more; otherwise it throws as before. grayco_view: memory is the truth for the page, sessionStorage the backup.
2. PERFREP: each event (key, size, freed, removed keys) is counted in the report's "err" map, and the report carries the
   computer's total localStorage use (characters) and the biggest names ("ls").
Usage: python3 tools/patch_LSGUARD.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_LSGUARD__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_BOOTSAFE__' in src and 'gc-patch-perfrep' in src, 'LSGUARD goes on top of BOOTSAFE + PERFREP'

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:80], s.count(old))
    return s.replace(old, new)

EARLY = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lsguard_early.js'), encoding='utf-8').read()
assert MARK in EARLY and '</script' not in EARLY

# 1. the guard: first script of the page
HEAD = '<html lang="en">\n  <head>\n<script id="gc-patch-bootsafe">'
src = once(src, HEAD, '<html lang="en">\n  <head>\n<script id="gc-patch-lsguard">\n' + EARLY.rstrip('\n') + '\n</script>\n<script id="gc-patch-bootsafe">')

# 2. PERFREP: the events and the storage use
src = once(src, "/* 5. every signed-in computer sends the summary to the cloud */\n",
  "/* patch LSGUARD: browser storage full — key, size, characters freed, copies removed — counted like the page errors */\n"
  "function lsUse(){ try { return W.__gcLsGuard && W.__gcLsGuard.usage ? W.__gcLsGuard.usage() : null; } catch (e) { return null; } }\n"
  "try { var LSG = W.__gcLsGuard; if (LSG) { var lsRec = function(ev){ bump(ERR, 'browser storage full: ' + s(ev.key).slice(0, 80) + (ev.ok ? '' : ' (not saved)'), "
  "{ key: s(ev.key).slice(0, 80), size: ev.size, freed: ev.freed, evicted: (ev.evicted || []).join(' ').slice(0, 300), ok: !!ev.ok }, 60); };\n"
  "  (LSG.events || []).forEach(lsRec); LSG.onEvent = lsRec; } } catch (e) {}\n\n"
  "/* 5. every signed-in computer sends the summary to the cloud */\n")
src = once(src, "  err: ERR, net: NET }; }", "  err: ERR, net: NET, ls: lsUse() }; }")

open(path, 'w', encoding='utf-8').write(src)
print('patched LSGUARD')
