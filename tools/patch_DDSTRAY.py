#!/usr/bin/env python3
"""Idempotent patch DDSTRAY: the "🧹 Duplicates (n)" button belongs to ✅ Approvals only (release sweep 10/28: after a visit
to Approvals it stayed at the top of Launch Job, RoofScout, Insurance, Mitigation, Site Book, Cordova Club …, half under
those screens' search box — a tap there hit the box, not the button).

The button is put next to the Approvals list (#gc-apx-mount) and marked to stay; when another screen was drawn in the same
place the button stayed behind. Now, whenever the Approvals list is not on screen, the button is taken away (it comes
back with the list). Usage: python3 tools/patch_DDSTRAY.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch DDSTRAY'
if MARK in src:
    print('DDSTRAY: already patched'); sys.exit(0)
OLD = """  var m = D.getElementById('gc-apx-mount'); if (!m || !m.parentNode) return;
  if (m.previousElementSibling && m.previousElementSibling.hasAttribute('data-gcdd-btn')) return;"""
NEW = """  var m = D.getElementById('gc-apx-mount');
  if (!m || !m.parentNode || !m.offsetParent) { Array.prototype.forEach.call(D.querySelectorAll('[data-gcdd-btn]'), function(x){ x.remove(); }); return; }   """ + MARK + """: only next to the Approvals list */
  if (m.previousElementSibling && m.previousElementSibling.hasAttribute('data-gcdd-btn')) return;"""
assert src.count(OLD) == 1, ('DDSTRAY find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('DDSTRAY: patched', path)
