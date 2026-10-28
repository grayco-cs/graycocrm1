#!/usr/bin/env python3
"""Idempotent patch MAILTAB: the 📬 Mail received card shows on the 📋 Approvals TAB (release check 10/27).

MAILFIX put the card only inside the old full-screen customer e-mail overlay (#_gcApprOv ._apList), which the left-menu
Approvals tab does not use (it draws into #gc-apx-mount), so admins and the office never saw the card on Approvals.
The card now also goes right AFTER #gc-apx-mount (a sibling, like the 🧹 Duplicates button before it, so the tab's own
redraws of the mount never remove it) and leaves when that tab is not on screen. The old overlay keeps it as before;
the role check (admins / office only, PM never) and the ⚙ Admin card are unchanged.
Every find-string must occur exactly once. Usage: python3 tools/patch_MAILTAB.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch MAILTAB'
if MARK in src:
    print('MAILTAB: already patched'); sys.exit(0)
OLD = """  var list = D.querySelector('#_gcApprOv ._apList');
  if (list) { if (!A) { A = make(); els.push(A); } if (A.parentNode !== list || list.lastElementChild !== A) list.appendChild(A); }
"""
NEW = """  var list = D.querySelector('#_gcApprOv ._apList');
  if (list) { if (!A) { A = make(); els.push(A); } if (A.parentNode !== list || list.lastElementChild !== A) list.appendChild(A); }
  """ + MARK + """: the left-menu Approvals tab draws into #gc-apx-mount: the card goes right after it (a sibling) */
  else {
    var apx = D.getElementById('gc-apx-mount');
    if (apx && apx.parentNode && apx.offsetParent) { if (!A) { A = make(); A.setAttribute('data-gc-keep', '1'); els.push(A); } if (A.parentNode !== apx.parentNode || apx.nextSibling !== A) apx.parentNode.insertBefore(A, apx.nextSibling); }
    else if (A && A.isConnected) A.parentNode.removeChild(A);
  }
"""
assert src.count(OLD) == 1, ('MAILTAB find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('MAILTAB: patched', path)
