#!/usr/bin/env python3
"""Idempotent patch CCBTNOFF: the "📸 CompanyCam sync status" button that GrayCo Photos added above itself stayed on every
page after you left Photos (owner 10/30: "this is on every page dont want"). It is no longer added; the window is still
in Admin → ⚙ Admin settings → 📸 CompanyCam sync status, on the To-Do line, and beside a CompanyCam "Test Connection".
Usage: python3 tools/patch_CCBTNOFF.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch CCBTNOFF'
if MARK in t: print('CCBTNOFF: already patched'); sys.exit(0)
old = """        if (allowed() && el && el.parentElement && !el.parentElement.querySelector('[data-ccs-photos]')) {"""
new = """        """ + MARK + """: no button above GrayCo Photos (it stayed on every page) */
        try { var _ob = D.querySelectorAll('[data-ccs-photos]'); for (var _i = 0; _i < _ob.length; _i++) _ob[_i].remove(); } catch (e) {}
        if (false && allowed() && el && el.parentElement && !el.parentElement.querySelector('[data-ccs-photos]')) {"""
assert t.count(old) == 1, ('CCBTNOFF anchor', t.count(old))
t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('CCBTNOFF: patched', p)
