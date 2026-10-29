#!/usr/bin/env python3
"""Idempotent patch TODOPHONE: the phone To-Do no longer freezes the page for 4-5 seconds.

Found 10/29 (sweep: admin at 390 px, 4x CPU, 37 MB seed: one 4.8 s task, 5.5 s block on To-Do; desktop 0.6 s).
CPU profile (wR15/proftodo.mjs): 4.0-4.6 s of every long task is the phone-only "Fix Safari input zoom" observer
(LOGOALL2 block, runs only when isMobile).  Each time a direct child of <body> changes, it walks every input / select /
textarea not yet marked and, one by one, sets the gc-ios-fixed attribute (a style change) and then reads
getComputedStyle(el).fontSize (forces a full style recalculation of the ~5,500-node page).  The To-Do has ~330 check boxes,
and the list is rebuilt whenever its data changes, so every rebuild = ~330 forced recalculations = 4-5 s at 4x CPU,
repeated every few seconds while the screen is open.

Fix: (1) check boxes, radios, file / range / color / hidden / button inputs are skipped -- iOS zooms only on text entry;
(2) all font sizes are read first (one recalculation), then the marks and the 16 px are written.  Same result for
text fields, selects and text areas.  Kill switch: localStorage gc_todophone_off = '1' (old loop).
Usage: python3 tools/patch_TODOPHONE.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch TODOPHONE'
if MARK in src:
    print('TODOPHONE: already patched'); sys.exit(0)
OLD = ("var inputObserver = new MutationObserver(function(){\n"
       "  document.querySelectorAll('input:not([gc-ios-fixed]), select:not([gc-ios-fixed]), textarea:not([gc-ios-fixed])').forEach(function(el){\n"
       "    el.setAttribute('gc-ios-fixed','1');\n"
       "    if(parseFloat(window.getComputedStyle(el).fontSize) < 16){\n"
       "      el.style.fontSize = '16px';\n"
       "    }\n"
       "  });\n"
       "});\n")
NEW = ("var inputObserver = new MutationObserver(function(){\n"
       "  " + MARK + ": text fields only (iOS zooms on text entry, not on check boxes), all reads first, then the writes --\n"
       "     the old loop forced one full style recalculation per field: ~330 To-Do check boxes = 4-5 s on a phone */\n"
       "  var _tpOff = false; try{ _tpOff = localStorage.getItem('gc_todophone_off') === '1'; }catch(_e){}\n"
       "  if(!_tpOff){\n"
       "    var _tpEls = document.querySelectorAll('input:not([gc-ios-fixed]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=range]):not([type=color]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image]), select:not([gc-ios-fixed]), textarea:not([gc-ios-fixed])');\n"
       "    if(!_tpEls.length) return;\n"
       "    var _tpSmall = [];\n"
       "    for(var _i = 0; _i < _tpEls.length; _i++){ _tpSmall.push(parseFloat(window.getComputedStyle(_tpEls[_i]).fontSize) < 16); }\n"
       "    for(var _j = 0; _j < _tpEls.length; _j++){ _tpEls[_j].setAttribute('gc-ios-fixed','1'); if(_tpSmall[_j]) _tpEls[_j].style.fontSize = '16px'; }\n"
       "    return;\n"
       "  }\n"
       "  document.querySelectorAll('input:not([gc-ios-fixed]), select:not([gc-ios-fixed]), textarea:not([gc-ios-fixed])').forEach(function(el){\n"
       "    el.setAttribute('gc-ios-fixed','1');\n"
       "    if(parseFloat(window.getComputedStyle(el).fontSize) < 16){\n"
       "      el.style.fontSize = '16px';\n"
       "    }\n"
       "  });\n"
       "});\n")
assert src.count(OLD) == 1, ('TODOPHONE anchor count', src.count(OLD))
src = src.replace(OLD, NEW)
assert src.count(MARK) == 1
open(path, 'w', encoding='utf-8').write(src)
print('TODOPHONE: patched', path)
