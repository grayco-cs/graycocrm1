#!/usr/bin/env python3
"""Idempotent patch REACTLOAD: the CDN react-dom never starts with the app's own React as window.React
(intermittent page error "Cannot read properties of undefined (reading 'unstable_scheduleCallback')" from
cdnjs react-dom 18.3.1 — seen on the live build too; a broken or blank page on load).

Cause: the app is bundled with its own React and, in an effect, sets window.React to it (patches draw with the app's
React). That effect can run while the page is still loading the two CDN scripts (a parser-blocking script still lets
the page's own tasks run while it downloads). When it lands between the CDN react.js and react-dom.js, react-dom.js
reads window.React = the app's bundled React, whose internals carry no Scheduler → the error, and no window.ReactDOM.
The same happens to the in-file fallback ReactDOM when the CDN is down.

Now the effect only remembers its React (window.__GC_APP_REACT__) until the React scripts (CDN or in-file fallback)
have run; a one-line script right after them then sets window.React to the app's React — the same end state as before.
Usage: python3 tools/patch_REACTLOAD.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_REACT_READY__'
if MARK in src:
    print('REACTLOAD: already patched'); sys.exit(0)
E = [
("""try{if(ce&&ce.useState){window.React=ce;}}catch(_re){}""",
 """try{if(ce&&ce.useState){window.__GC_APP_REACT__=ce;if(window.__GC_REACT_READY__)window.React=ce;}}catch(_re){}"""),
("""}catch(e){ console.error('[GC] bundled ReactDOM failed', e); } }</script>""",
 """}catch(e){ console.error('[GC] bundled ReactDOM failed', e); } }</script>
<script>/* patch REACTLOAD: React / ReactDOM (CDN or in-file) have run: now patches may use the app's own React */ window.__GC_REACT_READY__=1; if(window.__GC_APP_REACT__) window.React=window.__GC_APP_REACT__;</script>"""),
]
for a, b in E:
    assert src.count(a) == 1, ('REACTLOAD find-string count != 1', src.count(a), a[:70])
    src = src.replace(a, b)
open(path, 'w', encoding='utf-8').write(src)
print('REACTLOAD: patched', path)
