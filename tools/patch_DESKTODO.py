#!/usr/bin/env python3
"""Idempotent patch DESKTODO: the Desk home (patch ROLEAPPS) steps aside whenever any other screen opens, by any path
(a code call, a link or notification, the menu, a search result). See tools/desktodo.js.
1. tools/desktodo.js goes in as <script id="gc-patch-desktodo"> at the end of the page (replaced when it changes).
2. The CRM's own window._setView (handed out again on every screen change) asks the Desk to step aside first, so a
   code call or a link to the screen that is already under the Desk (no change of screen) also shows it.
Usage: python3 tools/patch_DESKTODO.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
t = open(p, encoding='utf-8').read()
orig = t
js = open(os.path.join(HERE, 'desktodo.js'), encoding='utf-8').read()
assert '</script' not in js.lower(), 'DESKTODO: a closing script tag in tools/desktodo.js'
assert '<script id="gc-patch-roleapps">' in t, 'DESKTODO: patch ROLEAPPS must be in first'
TAG = '<script id="gc-patch-desktodo">'
if TAG in t:
    assert t.count(TAG) == 1, 'DESKTODO: script twice'
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != js: t = t[:i] + js + t[j:]; print('DESKTODO: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'DESKTODO: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'
    print('DESKTODO: script added')
A2 = "window._setView=function(_v){ try{ localStorage.setItem('grayco_view', _v); }catch(e){}"
H2 = " try{ if(window._gcDeskToDo) window._gcDeskToDo.hide('screen: '+_v); }catch(_dt){} /* patch DESKTODO */"
if A2 + H2 not in t:
    assert t.count(A2) == 1, ('DESKTODO: _setView anchor', t.count(A2))
    t = t.replace(A2, A2 + H2); print('DESKTODO: _setView asks the Desk to step aside')
if t == orig:
    print('DESKTODO: already patched'); sys.exit(0)
open(p, 'w', encoding='utf-8').write(t)
