#!/usr/bin/env python3
"""Idempotent patch APXHOLD: a click on an Approvals button is never lost to a redraw
(release check 10/28: now and then ✕ Deny did nothing in the first seconds after sign-in; a second click worked).

Cause: while the page syncs, the Approvals tab redraws its cards (new HTML) whenever something changes. A redraw that
lands between pressing the mouse button and letting it go replaces the button under the pointer, so the browser's
click goes to no button and nothing happens. Now the tab does not redraw while a pointer is pressed on it (at most
2 s); the redraw follows right after the button is let go. Usage: python3 tools/patch_APXHOLD.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch APXHOLD'
if MARK in src:
    print('APXHOLD: already patched'); sys.exit(0)
OLD = """function drawTab(force){
  var m = D.getElementById('gc-apx-mount'); if (!m || !m.isConnected) return;"""
NEW = """var PRESS = 0, PRESSLATE = false;   """ + MARK + """: no redraw under a pressed pointer */
D.addEventListener('pointerdown', function(ev){ try { var m = D.getElementById('gc-apx-mount'); if (m && ev.target && m.contains(ev.target)) PRESS = Date.now(); } catch (e) {} }, true);
['pointerup', 'pointercancel'].forEach(function(n){ D.addEventListener(n, function(){ if (!PRESS) return; PRESS = 0; if (PRESSLATE) { PRESSLATE = false; later(function(){ try { drawTab(true); } catch (e) { warn(e); } }, 60); } }, true); });
function drawTab(force){
  var m = D.getElementById('gc-apx-mount'); if (!m || !m.isConnected) return;
  if (PRESS && Date.now() - PRESS < 2000 && m.firstElementChild) { PRESSLATE = true; return; }   """ + MARK + """ */"""
assert src.count(OLD) == 1, ('APXHOLD find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('APXHOLD: patched')
