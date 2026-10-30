#!/usr/bin/env python3
"""Idempotent patch PICKZ (owner 10/30, 📎 "Read 1 invoice" window: the Subcontractor list opened BEHIND the window —
"the pull downs should be on there not in background").

Cause: the searchable dropdown (#_gcOnePicker, and the older ._gcSelPop) is drawn on <body> at a fixed layer
(z-index 2147483001 / 2147483000). The invoice review window (#_gcInvReview) sits at 2147483002, so its own
Subcontractor / Job pull-downs opened underneath it, dimmed by its backdrop. Any window above 2147483001 had the same
problem.

Fix: when the dropdown opens it takes the layer just above the highest layer among its <select>'s parents (never lower
than before, never above the browser's maximum), so it is always on top of the window its pull-down is in.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch PICKZ'
if MARK in t: print('PICKZ: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('PICKZ anchor', n, old[:90]); t = t.replace(old, new)

HELPER = """window._gcPickZ = window._gcPickZ || function(sel, base){   """ + MARK + """: above the window the <select> is in */
  var z = base;
  try{ for(var n = sel; n && n.nodeType === 1 && n !== document.body; n = n.parentElement){
    var v = parseInt(getComputedStyle(n).zIndex, 10); if(isFinite(v) && v >= z) z = v + 1; } }catch(e){}
  return String(Math.min(z, 2147483647));
};
"""

# 1. the dark picker (#_gcOnePicker)
once("""  pop.appendChild(search); pop.appendChild(list);
  document.body.appendChild(pop);
""",
"""  pop.appendChild(search); pop.appendChild(list);
  document.body.appendChild(pop);
  try{ pop.style.zIndex = window._gcPickZ(sel, 2147483001); }catch(e){}   """ + MARK + """ */
""")
once("""  pop = document.createElement('div');
  pop.id = '_gcOnePicker';
""",
HELPER + """  pop = document.createElement('div');
  pop.id = '_gcOnePicker';
""")

# 2. the older picker (._gcSelPop), still used where the newer one is off
once("""    pop.className = '_gcSelPop';
""",
HELPER + """    pop.className = '_gcSelPop';
""")
once("""    pop.style.top = Math.max(8, top)+'px';
    pop.style.left = Math.max(8, left)+'px';
""",
"""    pop.style.top = Math.max(8, top)+'px';
    pop.style.left = Math.max(8, left)+'px';
    try{ pop.style.zIndex = window._gcPickZ(sel, 2147483000); }catch(e){}   """ + MARK + """ */
""")

open(p, 'w', encoding='utf-8').write(t); print('PICKZ: patched', p)
