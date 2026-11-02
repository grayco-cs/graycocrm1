#!/usr/bin/env python3
"""Idempotent patch BARSTILL: the bars above the Leads list stay still.

Owner (11/02, a live screenshot, Leads on a computer): "🧹 Sales & spam: nothing waiting [Review]" and
"📥 32 new leads — not assigned yet (7 held until 5 PM for an admin) … [Open Lead Inbox] [↻ Check now] · Checked 11:33 AM"
were "lagging back and forth".

Cause: two patches each insisted that THEIR bar sit DIRECTLY above the Leads list (#gc-leads-hub):
  * SALESBLOCK's paint():  if (el.nextElementSibling !== hub) hub.parentNode.insertBefore(el, hub)   (#gcsb-strip, 1.5 s tick)
  * LEADSEE's tick():      the same line                                                          (#gc-leadsee, 1.5 s tick)
With both on screen only one of them can be "directly above the list", so every tick each one moved itself under the
other: the two bars swapped places every 1.5 s (and the list below jumped with them).

Now (patch BARSTILL):
  * one small helper, window._gcLeadsBar.place(el, hub): each bar has ONE fixed slot and order above the list —
    🧹 Sales & spam first, then 📥 the new-leads banner, then the list. A bar already above the list in the right order
    relative to the other bar is NEVER re-inserted (other blocks may sit between them; nothing is moved for them);
    a bar that is missing / below the list / in the wrong order is put back once, before the next bar of a later rank
    (or the list).
  * SALESBLOCK's line is rewritten only when its HTML really changes (its own copy, not the browser's re-serialized
    innerHTML).
  * LEADSEE's banner: the "Checked 11:33 AM" corner is updated by itself (text only, no rewrite of the bar and its
    buttons); a background check (every ~45 s) keeps showing "Checked …" instead of flashing "Checking the Lead
    Inbox…" (the ↻ Check now button itself says "Checking…" when a person asked); the corner never wraps.
No new timers, no observers.

Usage: python3 tools/patch_BARSTILL.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch BARSTILL */'
if MARK in src:
    print('BARSTILL: already patched'); sys.exit(0)

def once(s, old, new):
    n = s.count(old)
    assert n == 1, ('BARSTILL anchor count != 1', n, old[:120])
    return s.replace(old, new)

# 0. the helper: one fixed slot and order for the bars above the Leads list (before LEADSEE's script, which uses it)
OLD = """<script id="gc-patch-leadsee">"""
NEW = """<script id="gc-patch-barstill">
""" + MARK + """
/* GrayCo — THE BARS ABOVE THE LEADS LIST STAY STILL (patch BARSTILL, owner 11/02: the Sales & spam line and the new-leads
   banner were "lagging back and forth"). Each bar has one fixed slot and order above #gc-leads-hub:
   🧹 Sales & spam (#gcsb-strip), then 📥 the new-leads banner (#gc-leadsee), then the list. A bar that is already above
   the list in the right order is never re-inserted; one that is missing, below the list or out of order is put back once.
   window._gcLeadsBar.place(el, hub) → true when it moved the bar. */
(function(){
'use strict';
var W = window;
if (W._gcLeadsBar) return;
var ORDER = ['gcsb-strip', 'gc-leadsee'];
function rank(el){ var i = ORDER.indexOf(el && el.id); return i < 0 ? ORDER.length : i; }
function place(el, hub){
  var par = hub && hub.parentNode; if (!el || !par) return false;
  var r = rank(el), bars = [], i, n;
  for (n = par.firstElementChild; n && n !== hub; n = n.nextElementSibling) if (ORDER.indexOf(n.id) >= 0) bars.push(n);
  var at = bars.indexOf(el);
  if (at >= 0) {   /* above the list already: in place unless a later-rank bar sits above it or an earlier-rank one below it */
    var good = true;
    for (i = 0; i < bars.length; i++) if (i !== at && (i < at ? rank(bars[i]) > r : rank(bars[i]) < r)) { good = false; break; }
    if (good) return false;
  }
  var ref = hub;
  for (i = 0; i < bars.length; i++) if (bars[i] !== el && rank(bars[i]) > r) { ref = bars[i]; break; }
  if (el.nextElementSibling === ref && el.parentNode === par) return false;
  par.insertBefore(el, ref);
  return true;
}
W._gcLeadsBar = { place: place, order: ORDER.slice() };
})();
</script>
<script id="gc-patch-leadsee">"""
src = once(src, OLD, NEW)

# 1. LEADSEE: its slot (no more "directly above the list" every tick)
OLD = """  if (!el) { el = D.createElement('div'); el.id = 'gc-leadsee'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status'); el.addEventListener('click', onClick); }
  if (el.parentNode !== hub.parentNode || el.nextElementSibling !== hub) hub.parentNode.insertBefore(el, hub);"""
NEW = """  if (!el) { el = D.createElement('div'); el.id = 'gc-leadsee'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status'); el.addEventListener('click', onClick); }
  if (W._gcLeadsBar) W._gcLeadsBar.place(el, hub); else if (el.parentNode !== hub.parentNode) hub.parentNode.insertBefore(el, hub);   /* patch BARSTILL: one fixed slot, never re-inserted when in place */"""
src = once(src, OLD, NEW)

# 2. LEADSEE: the "Checked …" corner by itself; a background check does not flash "Checking the Lead Inbox…"
OLD = """  h += '<span class="t">' + (busy ? 'Checking the Lead Inbox…' : at ? 'Checked ' + esc(when(at)) : 'Not checked yet') + '</span>';
  var sig = cls + '|' + h;
  if (sig !== LAST || el.className !== cls) { LAST = sig; el.className = cls; el.innerHTML = h; }"""
NEW = """  var tl = at ? 'Checked ' + when(at) : busy ? 'Checking the Lead Inbox…' : 'Not checked yet';   /* patch BARSTILL: a background check keeps "Checked …" */
  var sig = cls + '|' + h, te = el.querySelector('.t');
  if (sig !== LAST || el.className !== cls || !te) { LAST = sig; if (el.className !== cls) el.className = cls; el.innerHTML = h + '<span class="t">' + esc(tl) + '</span>'; }
  else if (te.textContent !== tl) te.textContent = tl;   /* only the time changed: only the time is written */"""
src = once(src, OLD, NEW)

OLD = """#gc-leadsee .t{color:#64748b;font-size:12px;margin-left:auto}'"""
NEW = """#gc-leadsee .t{color:#64748b;font-size:12px;margin-left:auto;white-space:nowrap}'"""
src = once(src, OLD, NEW)

# 3. SALESBLOCK: its slot (first), and its line rewritten only when its own HTML changes
OLD = """  if (!el) { el = D.createElement('div'); el.id = 'gcsb-strip'; el.setAttribute('data-gc-keep', '1'); el.addEventListener('click', function(e){ if (e.target && e.target.getAttribute('data-gcsb') === 'open') { e.preventDefault(); openList(); } }); }
  if (el.parentNode !== hub.parentNode || el.nextElementSibling !== hub) hub.parentNode.insertBefore(el, hub);
  var h = '🧹 <b>Sales &amp; spam</b>: ' + (COUNT ? COUNT + ' held for review (no one was alerted)' : 'nothing waiting') + ' <button type="button" data-gcsb="open">Review</button>';
  if (el.innerHTML !== h) el.innerHTML = h;"""
NEW = """  if (!el) { el = D.createElement('div'); el.id = 'gcsb-strip'; el.setAttribute('data-gc-keep', '1'); el.addEventListener('click', function(e){ if (e.target && e.target.getAttribute('data-gcsb') === 'open') { e.preventDefault(); openList(); } }); }
  if (W._gcLeadsBar) W._gcLeadsBar.place(el, hub); else if (el.parentNode !== hub.parentNode) hub.parentNode.insertBefore(el, hub);   /* patch BARSTILL: one fixed slot (first), never re-inserted when in place */
  var h = '🧹 <b>Sales &amp; spam</b>: ' + (COUNT ? COUNT + ' held for review (no one was alerted)' : 'nothing waiting') + ' <button type="button" data-gcsb="open">Review</button>';
  if (el.__gcH !== h || !el.firstChild) { el.__gcH = h; el.innerHTML = h; }   /* patch BARSTILL: only a real change is written */"""
src = once(src, OLD, NEW)

open(path, 'w', encoding='utf-8').write(src)
print('BARSTILL: patched')
