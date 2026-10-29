#!/usr/bin/env python3
"""Idempotent patch SCHEDQUIET2 (on top of SCHEDQUIET): the job-address fill's quiet check looks at window._crm.schedule,
but that mirror is only rebuilt when projects / invoices / expenses / users change, so a schedule item added through the
schedule setter alone could stay without its job address (test_SCHEDFILL 3/4 on r14). Now:
  - a direct call window._gcFillScheduleAddresses() always looks at the live list (the setter chain), as before SCHEDQUIET;
  - the 30-second timer keeps the quiet check, but every 10th tick (~5 min) it looks at the live list anyway.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch SCHEDQUIET2'
if MARK in t:
    print('SCHEDQUIET2: already patched'); sys.exit(0)
def rep(name, old, new):
    global t
    assert t.count(old) == 1, (name, t.count(old))
    t = t.replace(old, new)
rep('sig', "  function fill(){\n    try{\n      if(window.__GC_IS_TYPING__) return;\n      if(!window._setSchedule) return;\n      if(document.hidden) return;\n",
           "  function fill(force){\n    try{\n      if(window.__GC_IS_TYPING__) return;\n      if(!window._setSchedule) return;\n      if(document.hidden && !force) return;\n")
rep('skip', "      if(Array.isArray(_sqS) && !_sqS.some(function(s){ return s && !(s.address && String(s.address).trim()) && s.pid && byId[s.pid] && byId[s.pid].address; })) return;\n",
            "      " + MARK + ": _crm.schedule can lag the live list -- a direct call or every 10th tick looks at the live list */\n"
            "      if(force !== true && Array.isArray(_sqS) && !_sqS.some(function(s){ return s && !(s.address && String(s.address).trim()) && s.pid && byId[s.pid] && byId[s.pid].address; })) return;\n")
rep('timers', "  setTimeout(fill, 8000);\n  setInterval(fill, 30000);\n  window._gcFillScheduleAddresses = fill;\n",
              "  var _sq2n = 0;\n  setTimeout(function(){ fill(true); }, 8000);\n  setInterval(function(){ _sq2n++; fill(_sq2n % 10 === 0); }, 30000);\n  window._gcFillScheduleAddresses = function(){ return fill(true); };\n")
open(p, 'w', encoding='utf-8').write(t)
print('SCHEDQUIET2: patched')
