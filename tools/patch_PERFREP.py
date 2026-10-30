#!/usr/bin/env python3
"""Idempotent patch PERFREP: the freeze reporter (tools/perfrep.js) goes in right after the PERFCLICK speed watchdog,
so it sees the whole start-up; _headers gains Document-Policy: js-profiling so Edge/Chrome allow the sampling
profile. Usage: python3 tools/patch_PERFREP.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
MARK = '<script id="gc-patch-perfrep">'
js_new = open(os.path.join(here, 'perfrep.js'), encoding='utf-8').read()
if MARK in t:
    i = t.index(MARK) + len(MARK) + 1; j = t.index('</script>', i)
    if t[i:j] == js_new:
        print('PERFREP: already patched')
    else:   # patch PERFREP2: an older reporter is replaced by the current tools/perfrep.js
        assert '</script' not in js_new
        t = t[:i] + js_new + t[j:]
        open(p, 'w', encoding='utf-8').write(t)
        print('PERFREP: reporter updated', p)
else:
    anchor = '<script id="gc-patch-perfclick-watch">'
    assert t.count(anchor) == 1, ('PERFREP anchor count', t.count(anchor))
    i = t.index(anchor); j = t.index('</script>', i) + len('</script>')
    js = open(os.path.join(here, 'perfrep.js'), encoding='utf-8').read()
    assert '</script' not in js
    t = t[:j] + '\n' + MARK + '\n' + js + '</script>' + t[j:]
    open(p, 'w', encoding='utf-8').write(t)
    print('PERFREP: patched', p)
h = os.path.join(os.path.dirname(os.path.abspath(p)), '_headers')
if os.path.exists(h):
    ht = open(h, encoding='utf-8').read()
    if 'Document-Policy: js-profiling' in ht:
        print('PERFREP: _headers already has Document-Policy')
    else:
        a = '  Permissions-Policy:'
        assert ht.count(a) == 1, ('PERFREP _headers anchor', ht.count(a))
        ht = ht.replace(a, '  Document-Policy: js-profiling\n' + a)
        open(h, 'w', encoding='utf-8').write(ht)
        print('PERFREP: _headers + Document-Policy: js-profiling')
