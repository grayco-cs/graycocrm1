#!/usr/bin/env python3
"""Idempotent patch DESKTODO: the Desk home (patch ROLEAPPS) steps aside whenever any other screen opens, by any path
(a code call, a link or notification, a To-Do card's window, a search result). See tools/desktodo.js.
tools/desktodo.js goes in as <script id="gc-patch-desktodo"> at the end of the page (replaced when it changes).
Usage: python3 tools/patch_DESKTODO.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
t = open(p, encoding='utf-8').read()
js = open(os.path.join(HERE, 'desktodo.js'), encoding='utf-8').read()
assert '</script' not in js.lower(), 'DESKTODO: a closing script tag in tools/desktodo.js'
assert '<script id="gc-patch-roleapps">' in t, 'DESKTODO: patch ROLEAPPS must be in first'
TAG = '<script id="gc-patch-desktodo">'
if TAG in t:
    assert t.count(TAG) == 1, 'DESKTODO: script twice'
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == js: print('DESKTODO: already patched'); sys.exit(0)
    t = t[:i] + js + t[j:]; print('DESKTODO: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'DESKTODO: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'
    print('DESKTODO: script added')
open(p, 'w', encoding='utf-8').write(t)
