#!/usr/bin/env python3
"""Idempotent patch LSSLIM2: the estimate builder's rate book / material log / estimate list are not copied into
localStorage when IndexedDB holds them (owner's iPhones 11/03: gc_matlog_v2 829 K + gc_rates_v3 154 K of a ~2.5-2.75 M
character limit; gc_ests_v2 2.7 M on a desktop).

1. tools/lsslim2_early.js becomes a script right after LSGUARD (before BOOTSAFE): at load, a plain copy whose list the
   builder's IndexedDB store (window.storage) holds is moved into page memory and removed from localStorage;
   localStorage.getItem of those names falls back to that memory, so every synchronous reader still reads it.
   IndexedDB empty or unreadable: nothing changes.
2. The company-sync pull (the __est__ merge) keeps its merged value in memory (__gcEstMirror.hold) instead of writing the
   plain copy when IndexedDB holds the key; otherwise it writes the copy as before.
Usage: python3 tools/patch_LSSLIM2.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_LSSLIM2__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_LSGUARD__' in src, 'LSSLIM2 goes after LSGUARD'

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:80], s.count(old))
    return s.replace(old, new)

EARLY = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lsslim2_early.js'), encoding='utf-8').read()
assert MARK in EARLY and '</script' not in EARLY

# 1. right after the LSGUARD script
src = once(src, '</script>\n<script id="gc-patch-bootsafe">',
  '</script>\n<script id="gc-patch-lsslim2">\n' + EARLY.rstrip('\n') + '\n</script>\n<script id="gc-patch-bootsafe">')

# 2. the pull's plain copy
src = once(src, "          // or emptied list after a sync.\n          try{ localStorage.setItem(_plainKey, _val); }catch(e){}\n",
  "          // or emptied list after a sync.\n"
  "          try{ if(!(window.__gcEstMirror && window.__gcEstMirror.hold(_plainKey, _val))) localStorage.setItem(_plainKey, _val); }catch(e){}   /* patch LSSLIM2: memory, not localStorage, when IndexedDB holds it */\n")

open(path, 'w', encoding='utf-8').write(src)
print('patched LSSLIM2')
