#!/usr/bin/env python3
"""patch FOLLOW1 (owner's 11/15 list, item 1): Field Home badge with my new leads (NLBADGE), Text alerts flag for people
switched on with no cell (NOCELL), "📱 texted <PM>" on the lead timeline (TEXTEDPM), 🔎 Check Twilio now (TWLIVE).
The script is tools/follow1_tail.js; idempotent (re-running replaces the block with the current file).
Usage: python3 tools/patch_FOLLOW1.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(here), 'index.html')
TAG = '<script id="gc-patch-follow1">'
js = open(os.path.join(here, 'follow1_tail.js'), encoding='utf-8').read()
assert '</script' not in js.lower()
src = open(P, encoding='utf-8').read()
# TEXTEDPM: the PM's "assigned to you" text reads "📱 texted <PM>" on the lead timeline
o = "'📤 GrayCo text to ' + (nm || 'staff') + ': ' + s(x.text)) }; });"
n = "(x.type === 'assigned' ? '📱 texted ' + (nm || 'the PM') + ' (lead assigned): ' : '📤 GrayCo text to ' + (nm || 'staff') + ': ') + s(x.text)) }; });   /* TEXTEDPM */"
if n not in src:
    assert src.count(o) == 1, src.count(o)
    src = src.replace(o, n)
# TEXTEDPM: a staff alert logs the person by e-mail — show their name
o2 = "var nameOf = function(x){ if (s(x.who)) return s(x.who);"
n2 = "var nameOf = function(x){ if (s(x.who)) { var w0 = s(x.who), u0 = /@/.test(w0) ? users.find(function(z){ return z && low(z.email) === low(w0); }) : null; return u0 && s(u0.name) ? s(u0.name) : w0; }   /* TEXTEDPM */"
if n2 not in src:
    assert src.count(o2) == 1, src.count(o2)
    src = src.replace(o2, n2)
if TAG in src:
    i = src.index(TAG) + len(TAG); j = src.index('</script>', i)
    src = src[:i] + '\n' + js + src[j:]
else:
    src = src.rstrip('\n') + '\n' + TAG + '\n' + js + '</script>\n'
open(P, 'w', encoding='utf-8').write(src); print('FOLLOW1 applied')
