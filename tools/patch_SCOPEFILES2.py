#!/usr/bin/env python3
"""patch SCOPEFILES2 (owner's sub portal plan, 11/15 list item 5.1d): 📎 Add scope files → one 📋 scope DRAFT per trade (SCOPESEND
records, with the 💲 budget twin), drag & drop, 👁 Preview, 👷 pick the subs (pre-ticked in 📤 Send), the same name + trade replaces
(a new version, never a duplicate). The CRM block is tools/scopefiles2_tail.js. Idempotent. Usage: python3 tools/patch_SCOPEFILES2.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(here), 'index.html')
src = open(P, encoding='utf-8').read()
o = "  var picked = {}, cands = jobSubs(pid, d.leadId), extra = [], q = '';\n  function ckey(c){ return c.id ? 'i:' + c.id : (c.email ? 'e:' + low(c.email) : 'n:' + norm(c.name)); }\n"
n = o + ("  /* patch SCOPEFILES2: the subs picked with the scope files are pre-ticked (nothing is sent until Send) */\n"
         "  arr(d.forSubs).forEach(function(fid){ var r = subsList().find(function(x){ return s(x.id) === s(fid); }); if (!r) return; var c = cands.find(function(y){ return s(y.id) === s(fid); }) || { id: s(r.id), name: s(r.name), email: low(r.email), trade: s(r.trade), why: 'picked with the scope files', rank: 5 }; if (cands.indexOf(c) < 0) cands.push(c); picked[ckey(c)] = c; });\n")
if n not in src:
    assert src.count(o) == 1, src.count(o); src = src.replace(o, n)
TAG = '<script id="gc-patch-scopefiles2">'
js = open(os.path.join(here, 'scopefiles2_tail.js'), encoding='utf-8').read(); assert '</script' not in js.lower()
if TAG in src:
    i = src.index(TAG) + len(TAG); j = src.index('</script>', i); src = src[:i] + '\n' + js + src[j:]
else:
    src = src.rstrip('\n') + '\n' + TAG + '\n' + js + '</script>\n'
open(P, 'w', encoding='utf-8').write(src); print('SCOPEFILES2 applied')
