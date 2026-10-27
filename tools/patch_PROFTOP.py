#!/usr/bin/env python3
"""Idempotent patch PROFTOP: My Profile shows the person's profile card and tabs first; pay stubs, the 6 AM plan e-mail
and 📊 My data go below them (owner 10/27: "this should be up top on profile")."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '<script id="gc-proftop">'
if MARK in t: print('PROFTOP: already patched'); sys.exit(0)
assert t.rstrip().endswith('</script>'), 'unexpected file end'
tail = MARK + r"""
/* patch PROFTOP — the extra My Profile cards are added right under the "My Profile" heading by other patches;
   move them to the end of the page so the person's own card (photo, name, tabs) is on top. Cheap: one check per 1.5 s,
   only while My Profile is open, and only when a card is out of place. */
(function(){
var IDS = ['gc-pay-mystubs', 'gc-plan-prof', 'gc-x10-mydata'];
function h1(){ var hs = document.querySelectorAll('main h1'); for (var i = 0; i < hs.length; i++) if ((hs[i].textContent || '').trim() === 'My Profile') return hs[i]; return null; }
function fix(){
  var h = h1(); if (!h) return; var par = h.parentNode; if (!par) return;
  IDS.forEach(function(id){ var c = document.getElementById(id); if (!c || c.parentNode !== par) return;
    var n = c.nextSibling, tail = true; while (n) { if (n.nodeType === 1 && IDS.indexOf(n.id) < 0) { tail = false; break; } n = n.nextSibling; }
    if (!tail) par.appendChild(c); });
}
setInterval(fix, 1500); window._gcProfTop = fix;
console.log('[GC] PROFTOP: My Profile shows your profile card first.');
})();
</script>
"""
t = t.rstrip() + '\n' + tail
open(p, 'w', encoding='utf-8').write(t); print('PROFTOP: patched')
