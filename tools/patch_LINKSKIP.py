#!/usr/bin/env python3
"""Idempotent patch LINKSKIP: the app-wide phone / e-mail / address linker leaves the lists that redraw themselves alone
(release sweep 10/28: the Leads screen changed ~80 times in 5 s while nobody touched it).

The linker (every 45 s, up to 80 text nodes a pass) turned addresses / phones in the Leads rows into links by
re-writing the row's text nodes. The Leads hub redraws its rows from its own data, so the next pass did it all again —
for ever, on every open Leads screen (and on the lead panel, the Lead Inbox cards, the Approvals tab and the To-Do,
which also redraw themselves and draw their own 📞 / ✉️ / map buttons). Now the linker skips those areas (the same
"data-gc-linked" rule it already has, by id / class). Elsewhere nothing changes. Usage: python3 tools/patch_LINKSKIP.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch LINKSKIP'
if MARK in src:
    print('LINKSKIP: already patched'); sys.exit(0)
OLD = """      if(el.getAttribute && el.getAttribute('data-gc-linked')==='1') return true;
      el=el.parentNode;"""
NEW = """      if(el.getAttribute && el.getAttribute('data-gc-linked')==='1') return true;
      """ + MARK + """: lists that redraw themselves (and draw their own call / e-mail / map buttons) are left alone */
      if(el.id && LS_IDS[el.id]) return true;
      if(el.classList && (el.classList.contains('gcl-list') || el.classList.contains('gcl-classic-body') || el.classList.contains('gcl-card') || el.classList.contains('apx-row') || el.classList.contains('td2'))) return true;
      el=el.parentNode;"""
assert src.count(OLD) == 1, ('LINKSKIP find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
OLD2 = """  // Elements we must never touch.
  function skip(node){"""
NEW2 = """  var LS_IDS = { 'gc-leads-hub': 1, 'gcl-drawer': 1, 'gc-ldi': 1, 'gc-apx-mount': 1, '_todoMount': 1, '_gcApprOv': 1 };   """ + MARK + """ */
  // Elements we must never touch.
  function skip(node){"""
assert src.count(OLD2) == 1, ('LINKSKIP find-string 2 count != 1', src.count(OLD2))
src = src.replace(OLD2, NEW2)
open(path, 'w', encoding='utf-8').write(src)
print('LINKSKIP: patched', path)
