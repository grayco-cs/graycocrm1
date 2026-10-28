#!/usr/bin/env python3
"""Idempotent patch STPLUI (owner 10/27): Admin → 🗓 Schedule templates bar looks like the other Admin bars (white card,
purple edge, purple Open button), and the editor's Close is a ✕ at the top right instead of beside the template picker."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch STPLUI */'
if MARK in t: print('STPLUI: already patched'); sys.exit(0)
a = "'.gcst-bar b{color:#fff}.gcst-bar button,.gcst-ov button{background:#d4a017;color:#0a1628;border:0;border-radius:8px;padding:7px 14px;font-weight:800;cursor:pointer}' +"
assert t.count(a) == 1, ('a', t.count(a))
t = t.replace(a, a + "\n    " + MARK + " '.gcst-bar{background:#fff;border-color:#e2e8f0;border-left:3px solid #7c3aed;color:#0f172a}.gcst-bar b{color:#0f172a}.gcst-bar button{background:#7c3aed;color:#fff;min-height:36px}.gcst-ov #gcst-close{background:transparent;color:#334155;font-size:22px;line-height:1;padding:2px 10px;border-radius:8px}.gcst-ov #gcst-close:hover{background:#f1f5f9}' +")
b = "<div style=\"display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center\"><div><h2>🗓 Schedule templates</h2>"
assert t.count(b) == 1, ('b', t.count(b))
t = t.replace(b, "<div style=\"display:flex;justify-content:space-between;gap:10px;align-items:flex-start\"><h2>🗓 Schedule templates</h2><button type=\"button\" class=\"gcst-sec\" id=\"gcst-close\" aria-label=\"Close\" title=\"Close\">✕</button></div><div style=\"display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center\"><div>")
c = " <button type=\"button\" class=\"gcst-sec\" id=\"gcst-close\">Close</button></div></div>' +"
assert t.count(c) == 1, ('c', t.count(c))
t = t.replace(c, "</div></div>' +")
open(p, 'w', encoding='utf-8').write(t); print('STPLUI: patched')
