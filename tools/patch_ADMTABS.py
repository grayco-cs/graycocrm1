#!/usr/bin/env python3
"""Idempotent patch ADMTABS: the Admin tabs (Employees / Pay Structures / Hiring / Sub Invoices / ...) look dead (owner 10/27).

The tabs did switch, but the tab's content was drawn ~730 px further down, below the screen: the admin setting cards
(🎯 Company goal, ⚡ Automation defaults, 🗓 Schedule templates, 🗄 Year-end archive, 💬 E-mail & chat history) were put
in front of #gc-adm-hub, and the page draws every tab's content in front of that same #gc-adm-hub, so the cards
always ended up between the tab row and the content. The underline moved; what you saw (the cards) did not.
Now the cards are kept right AFTER #gc-adm-hub (with the other admin settings), so the content of the chosen tab is
straight under the tab row. A tap on a tab also brings the tab row to the top of the screen (the setup warnings above it are ~600 px tall).
Nothing else changes: same cards, same buttons, same order among them.
Usage: python3 tools/patch_ADMTABS.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_ADMTABS__'
if MARK in src:
    print('ADMTABS: already patched'); sys.exit(0)
JS = r"""
<script id="gc-patch-admtabs">
/* __GC_PATCH_ADMTABS__ — the Admin setting cards go after #gc-adm-hub, so a tab's content sits right under the tab row */
(function(){
'use strict';
if (window.__GC_PATCH_ADMTABS__) return; window.__GC_PATCH_ADMTABS__ = true;
var D = document, W = window;
var SI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var IDS = ['gc-x10-admin', 'gc-ja-admin', 'gc-aut3-admin', 'gc-auto5-admin', 'gc-x9-admin'];
function fix(){
  var hub = D.getElementById('gc-adm-hub'); if (!hub || !hub.parentNode) return;
  var par = hub.parentNode, after = hub;
  for (var i = 0; i < IDS.length; i++) {
    var el = D.getElementById(IDS[i]); if (!el || el.parentNode !== par) continue;
    if (el.previousSibling !== after) par.insertBefore(el, after.nextSibling);
    after = el;
  }
}
SI.call(W, function(){ try { fix(); } catch (e) {} }, 250);
/* a tab tap brings the tab row to the top of the screen, so the chosen tab's content is in view (the setup warnings above
   the row are ~600 px tall) */
D.addEventListener('click', function(e){
  try {
    var b = e.target && e.target.closest ? e.target.closest('main button') : null; if (!b || !D.getElementById('gc-adm-hub')) return;
    var row = b.parentNode; if (!row || row.parentNode !== D.getElementById('gc-adm-hub').parentNode) return;
    if (!/Pay Structures/.test(row.textContent || '') || !/Employees/.test(row.textContent || '')) return;
    W.setTimeout(function(){ try { fix(); row.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (x) {} }, 60);
  } catch (x) {}
}, true);
W._gcAdmTabsFix = fix;
try { console.log('[GC] ADMTABS: Admin setting cards under the settings hub, tab content right under the tabs'); } catch (e) {}
})();
</script>"""
assert JS.count('</script>') == 1
src = src.rstrip('\n') + JS + '\n'
open(path, 'w', encoding='utf-8').write(src)
print('ADMTABS: patched', path)
