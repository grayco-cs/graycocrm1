#!/usr/bin/env python3
"""Idempotent patch CHECKOPEN: ✅ Approvals → "To-Do approval · N check(s) to sign": "✏️ Open check" (and Open / the
green button) open the ✓ Checks window right there (owner 10/27: "Open check does nothing", only a "↩ Back to approvals"
pill appeared).

The card ran the To-Do line's own action through "go to another screen and come back": it changed the screen to ⚙ Admin
(where nothing about checks is on top) and the Checks window, when it opened, was not marked to stay, so the screen-change
clean-up took it away. Now a checks card calls window._gcOpenCheckApprovals() in place (no screen change, no Back pill) and
the window is marked to stay (data-gc-keep) until it is closed. Usage: python3 tools/patch_CHECKOPEN.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CHECKOPEN'
if MARK in src:
    print('CHECKOPEN: already patched'); sys.exit(0)
E = [
("""  if (what === 'lead' && lead) return { l: '✏️ Open lead', f: function(){ goAway('td:' + s(it.key || o.id), function(){ call('_gcOpenLead', lead); }); } };
  if (act && act.f) return { l: '✏️ Open ' + what,""",
 """  if (what === 'lead' && lead) return { l: '✏️ Open lead', f: function(){ goAway('td:' + s(it.key || o.id), function(){ call('_gcOpenLead', lead); }); } };
  """ + MARK + """: checks open the ✓ Checks window in place (no screen change that would close it) */
  if (what === 'check' && typeof W._gcOpenCheckApprovals === 'function') return { l: '✏️ Open check', f: openChecksHere };
  if (act && act.f) return { l: '✏️ Open ' + what,"""),
("""function rowOther(o, mine, now){
  var key = s(o.id).replace(/^td:/, ''), it = td2Items().filter(function(x){ return x && x.key === key; })[0] || {};
  var p = proj(it.pid), act = o.act || it.act;""",
 """function openChecksHere(){
  var before = D.body ? D.body.children.length : 0;
  try { W._gcOpenCheckApprovals(); } catch (e) { warn(e); return; }
  try { var kids = D.body.children; for (var i = before; i < kids.length; i++) if (getComputedStyle(kids[i]).position === 'fixed') kids[i].setAttribute('data-gc-keep', '1'); } catch (e) {}
}
function rowOther(o, mine, now){
  var key = s(o.id).replace(/^td:/, ''), it = td2Items().filter(function(x){ return x && x.key === key; })[0] || {};
  var p = proj(it.pid), act = o.act || it.act;
  if (/check\\(s\\) to (sign|write)|waiting on owner signature|^write check/i.test(s(o.title || it.title)) && typeof W._gcOpenCheckApprovals === 'function') act = { l: (act && act.l) || 'Open checks', f: openChecksHere };   /* patch CHECKOPEN */"""),
]
for a, b in E:
    assert src.count(a) == 1, ('CHECKOPEN find-string count != 1', src.count(a), a[:70])
    src = src.replace(a, b)
open(path, 'w', encoding='utf-8').write(src)
print('CHECKOPEN: patched', path)
