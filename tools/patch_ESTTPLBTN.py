#!/usr/bin/env python3
"""Idempotent patch ESTTPLBTN (owner 11/02): the Estimates page header.
• "📋 Templates" right after "＋ New estimate" (outlined), opening the same Templates view as 🔍 Search tabs → Templates
  (the estimate templates: gcEstSubtabs.show('templates') → _setView('templates')).
• Owner: "put From a similar job in the More, I don't know what that even is" — the header is now
  ＋ New estimate → 📋 Templates → ⋯ More, and ⋯ More starts with "Copy from a similar job" with the hint
  "start a new estimate from an old one's lines". It works as before (patch X12's fromSimilar, now window._gcFromSimilar).
• The header wraps (flex-wrap) at 1093 px and on a phone; the buttons keep one line each.
• The More menu can show a one-line hint under an item (third element of the item)."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch ESTTPLBTN'
if MARK in t: print('ESTTPLBTN: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('ESTTPLBTN anchor', n, old[:90]); t = t.replace(old, new)

# 1. the header: New estimate → 📋 Templates → More
once("""<button type="button" class="new" data-l="new">＋ New estimate</button><button type="button" class="mor" data-l="more" aria-haspopup="menu">⋯ More</button></div>' +""",
     """<button type="button" class="new" data-l="new">＋ New estimate</button><button type="button" class="tpl" data-l="tpl" title="Estimate templates">📋 Templates</button><button type="button" class="mor" data-l="more" aria-haspopup="menu">⋯ More</button></div>' +   """ + MARK + """ */""")
once("""if (a === 'new') newEst(); else if (a === 'more') listMore(l); return; }""",
     """if (a === 'new') newEst(); else if (a === 'tpl') openTemplates(); else if (a === 'more') listMore(l); return; }   """ + MARK + """ */""")
# 2. its look: outlined (the look "＋ From a similar job" had), one line, wraps with the row
once("""    '#gc-est3-list .mor{background:#fff;""",
     """    '#gc-est3-list .tpl{background:#fff;color:#4c1d95;border:1px solid #c4b5fd;border-radius:8px;padding:8px 12px;min-height:38px;font:700 13px Inter,Arial,sans-serif;cursor:pointer;white-space:nowrap}#gc-est3-list .new,#gc-est3-list .mor{white-space:nowrap}',   """ + MARK + """ */
    '#gc-est3-more button small{display:block;font-weight:500;font-size:11.5px;color:#64748b;margin-top:1px}',
    '#gc-est3-list .mor{background:#fff;""")
# 3. the More menu: a hint line under an item; "Copy from a similar job" first
once("""'<button type="button" role="menuitem" data-i="' + i + '">' + esc(it[0]) + '</button>'; }).join('');""",
     """'<button type="button" role="menuitem" data-i="' + i + '">' + esc(it[0]) + (it[2] ? '<small>' + esc(it[2]) + '</small>' : '') + '</button>'; }).join('');   """ + MARK + """: a hint line */""")
once("""function listMore(anchor){
  menuEl(anchor, [
    ['📋 Templates', function(){ if (W.gcEstSubtabs) W.gcEstSubtabs.show('templates'); else if (W._setView) W._setView('templates'); }],""",
     """function openTemplates(){ if (W.gcEstSubtabs) W.gcEstSubtabs.show('templates'); else if (W._setView) W._setView('templates'); }   """ + MARK + """ */
function listMore(anchor){
  menuEl(anchor, [
    ['⧉ Copy from a similar job', function(){ if (typeof W._gcFromSimilar === 'function') W._gcFromSimilar(); else toast('Not available on this computer yet.'); }, 'start a new estimate from an old one\\'s lines'], '-',   """ + MARK + """ */
    ['📋 Templates', openTemplates],""")
# 4. patch X12: no "＋ From a similar job" button on the header any more; the same window from the More menu
once("""function estBar(){
  var main = D.querySelector('main'); if (!main || main.querySelector('.gcx12-simbtn')) return;""",
     """W._gcFromSimilar = fromSimilar;   """ + MARK + """: ⋯ More → Copy from a similar job */
function estBar(){
  Array.prototype.forEach.call(D.querySelectorAll('.gcx12-simbtn'), function(x){ x.remove(); }); return;   """ + MARK + """: not on the header */
  var main = D.querySelector('main'); if (!main || main.querySelector('.gcx12-simbtn')) return;""")

open(p, 'w', encoding='utf-8').write(t); print('ESTTPLBTN: patched', p)
