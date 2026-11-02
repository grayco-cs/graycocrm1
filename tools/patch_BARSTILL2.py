#!/usr/bin/env python3
"""Idempotent patch BARSTILL2 (on top of BARSTILL): no cards above the Leads header -- two small chips IN it.

Owner (11/02, live r17l, a screenshot of Leads): above the "Leads [search] Board / List / Calendar / Map / Outreach"
header, the big "📥 30 new leads — not assigned yet (3 held until 5 PM for an admin)… [Open Lead Inbox] [↻ Check now]
Checked 12:40 PM" card, then "🧹 Sales & spam: nothing waiting [Review]": "lagging back and forth and why is it up here".

Now:
  * 🧹 Sales & spam (SALESBLOCK, #gcsb-strip): NOTHING when nothing is waiting. When something is: a small chip
    "🧹 2 to review" in the Leads header row; pressing it opens the same Sales & spam list (Review).
  * 📥 New leads (LEADSEE, #gc-leadsee): one small chip in the same row, "📥 30 new · 3 held [Open]" (the hover says
    "30 new leads — not assigned yet (3 held until 5 PM for an admin)…"), plus a small ↻ icon button (Check now) whose
    tooltip is the checked time. No new leads: only the ↻. The inbox could not be checked: "⚠ Inbox not checked" + ↻.
  * Both chips live in ONE fixed slot of the header row (#gc-leads-chips, drawn by the Leads hub itself, right of the
    views, left of ⋯ More / ＋ New lead), in a fixed order (🧹 then 📥). The chip elements are kept: a redraw of the
    hub puts the same elements back into the new header's slot in the same synchronous step (no gap, no jump); a tick
    only changes a chip's contents when its text changes, and never moves it.
  * Nothing is placed above the header any more (BARSTILL's place() stays, unused by these two).
Counts, the hold-until-5-PM numbers, Review / Open / Check now: unchanged.

Usage: python3 tools/patch_BARSTILL2.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch BARSTILL2 */'
if MARK in src:
    print('BARSTILL2: already patched'); sys.exit(0)
assert '/* patch BARSTILL */' in src, 'BARSTILL2 needs BARSTILL first'

def once(s, old, new):
    n = s.count(old)
    assert n == 1, ('BARSTILL2 anchor count != 1', n, old[:120])
    return s.replace(old, new)

# 0. the chip slot helper (next to BARSTILL's helper)
OLD = """W._gcLeadsBar = { place: place, order: ORDER.slice() };
})();"""
NEW = """W._gcLeadsBar = { place: place, order: ORDER.slice() };
})();
""" + MARK + """
/* the Leads header's chip slot (#gc-leads-chips, in the hub's own header row): 🧹 Sales & spam, then 📥 new leads.
   on(el, hub): the chip is shown there (put in once, in its order; never moved when in place). off(el): not shown.
   mount(hub): right after the hub draws its header, the same chip elements go into the new slot. */
(function(){
'use strict';
var W = window, D = document;
if (W._gcLeadsChips) return;
var ORDER = ['gcsb-strip', 'gc-leadsee'], els = {}, want = {};
function rank(id){ var i = ORDER.indexOf(id); return i < 0 ? ORDER.length : i; }
function slot(hub){ hub = hub || D.getElementById('gc-leads-hub'); return hub ? hub.querySelector('#gc-leads-chips') : null; }
function put(sl, el){
  if (el.parentNode === sl) {
    var p = el.previousElementSibling, n = el.nextElementSibling;
    if ((!p || rank(p.id) <= rank(el.id)) && (!n || rank(n.id) >= rank(el.id))) return false;   /* in place */
  }
  var ref = null;
  for (var c = sl.firstElementChild; c; c = c.nextElementSibling) if (c !== el && rank(c.id) > rank(el.id)) { ref = c; break; }
  sl.insertBefore(el, ref); return true;
}
function css(){
  if (D.getElementById('gc-leads-chips-css')) return;
  var st = D.createElement('style'); st.id = 'gc-leads-chips-css';
  st.textContent = '#gc-leads-chips{display:inline-flex;align-items:center;gap:6px;flex-wrap:nowrap}#gc-leads-chips:empty{display:none}'
    + '#gc-leads-chips>#gcsb-strip,#gc-leads-chips>#gc-leadsee{display:inline-flex;align-items:center;gap:4px;margin:0;padding:0;border:0;background:none;font:600 12px/1.2 Inter,Arial,sans-serif;white-space:nowrap;width:auto}'
    + '#gc-leads-chips>#gcsb-strip button{margin:0;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;border-radius:999px;padding:4px 10px;font:700 12px Inter,Arial,sans-serif;cursor:pointer}'
    + '#gc-leads-chips>#gc-leadsee .c{display:inline-flex;align-items:center;gap:6px;border:1px solid #c7d2fe;background:#eef2ff;color:#1e1b4b;border-radius:999px;padding:3px 4px 3px 10px}'
    + '#gc-leads-chips>#gc-leadsee.bad .c{border-color:#fecaca;background:#fef2f2;color:#7f1d1d;padding-right:10px}'
    + '#gc-leads-chips>#gc-leadsee .c button{border:0;background:#241968;color:#fff;border-radius:999px;padding:2px 9px;font:700 11px Inter,Arial,sans-serif;cursor:pointer}'
    + '#gc-leads-chips>#gc-leadsee button.ic{border:1px solid #d6d3ea;background:#fff;color:#241968;border-radius:999px;width:26px;height:26px;padding:0;font:700 13px Arial,sans-serif;cursor:pointer;line-height:1}';
  (D.head || D.documentElement).appendChild(st);
}
function on(el, hub){
  if (!el || !el.id) return false;
  els[el.id] = el; want[el.id] = true;
  var sl = slot(hub); if (!sl) { if (el.parentNode) el.remove(); return false; }   /* no header (another tab): nowhere else */
  css(); put(sl, el); return true;
}
function off(el){ if (!el || !el.id) return; els[el.id] = el; want[el.id] = false; if (el.parentNode) el.remove(); }
function mount(hub){
  var sl = slot(hub); if (!sl) return;
  ORDER.forEach(function(id){ var el = els[id]; if (el && want[id]) { css(); put(sl, el); } });
}
W._gcLeadsChips = { on: on, off: off, mount: mount, slot: slot, els: els, order: ORDER.slice() };
})();"""
src = once(src, OLD, NEW)

# 1. the Leads hub's header row: the slot, and the same chips back into it right after a redraw
OLD = """    + '<span class="gclu-sp"></span>' + bkBtn()   /* patch LEADBULK */"""
NEW = """    + '<span class="gclu-sp"></span><span id="gc-leads-chips" data-gc-keep="1"></span>' + bkBtn()   /* patch LEADBULK */   /* patch BARSTILL2: the chips' fixed slot */"""
src = once(src, OLD, NEW)
OLD = """held(function(){ hub.innerHTML = hh; });"""
NEW = """held(function(){ hub.innerHTML = hh; try { if (W._gcLeadsChips) W._gcLeadsChips.mount(hub); } catch (e) {} });   /* patch BARSTILL2: the same chips, same step */"""
src = once(src, OLD, NEW)

# 2. LEADSEE: one small chip in the header (no card above it); ↻ with the checked time as its tooltip
OLD = """  /* the strip above the list */
  var hub = D.getElementById('gc-leads-hub'); if (!hub || !hub.parentNode) return;
  var el = D.getElementById('gc-leadsee');
  if (!el) { el = D.createElement('div'); el.id = 'gc-leadsee'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status'); el.addEventListener('click', onClick); }"""
NEW = """  /* patch BARSTILL2: one small chip in the Leads header row (no card above the header) */
  var hub = D.getElementById('gc-leads-hub'), CH = W._gcLeadsChips; if (!hub || !hub.parentNode || !CH) return;
  var el = D.getElementById('gc-leadsee') || CH.els['gc-leadsee'];
  if (!el) { el = D.createElement('span'); el.id = 'gc-leadsee'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status'); el.addEventListener('click', onClick); }"""
src = once(src, OLD, NEW)
OLD = """  if (W._gcLeadsBar) W._gcLeadsBar.place(el, hub); else if (el.parentNode !== hub.parentNode) hub.parentNode.insertBefore(el, hub);   /* patch BARSTILL: one fixed slot, never re-inserted when in place */
  var st = {}; try { st = LI.status() || {}; } catch (e) {}"""
NEW = """  var st = {}; try { st = LI.status() || {}; } catch (e) {}"""
src = once(src, OLD, NEW)
OLD = """  var cls = err ? 'bad' : n ? '' : 'none', h;
  if (err) h = '⚠ <b>The Lead Inbox could not be checked</b> (' + esc(err) + '). New text / website / missed-call / e-mail leads may be missing here. <button type="button" data-gcls="check">↻ Check now</button>';
  else if (n) h = '📥 <b>' + n + ' new lead' + (n === 1 ? '' : 's') + '</b> — not assigned yet' + (held ? ' (' + held + ' held until 5 PM for an admin)' : '') + '. They are at the top of the list below. <button type="button" data-gcls="open">Open Lead Inbox</button> <button type="button" class="l" data-gcls="check">↻ Check now</button>';
  else h = '📥 Lead Inbox: no new leads waiting. <button type="button" class="l" data-gcls="check">↻ Check now</button>';
  var tl = at ? 'Checked ' + when(at) : busy ? 'Checking the Lead Inbox…' : 'Not checked yet';   /* patch BARSTILL: a background check keeps "Checked …" */
  var sig = cls + '|' + h, te = el.querySelector('.t');
  if (sig !== LAST || el.className !== cls || !te) { LAST = sig; if (el.className !== cls) el.className = cls; el.innerHTML = h + '<span class="t">' + esc(tl) + '</span>'; }
  else if (te.textContent !== tl) te.textContent = tl;   /* only the time changed: only the time is written */
}"""
NEW = """  var cls = err ? 'bad' : n ? '' : 'none', h = '', tip;
  var tl = at ? 'Checked ' + when(at) : busy ? 'Checking the Lead Inbox…' : 'Not checked yet';   /* patch BARSTILL: a background check keeps "Checked …" */
  if (err) { h = '⚠ <b>Inbox not checked</b>'; tip = 'The Lead Inbox could not be checked (' + err + '). New text / website / missed-call / e-mail leads may be missing here.'; }
  else if (n) { h = '📥 <b>' + n + ' new</b>' + (held ? ' · ' + held + ' held' : '') + ' <button type="button" data-gcls="open" title="Open the Lead Inbox">Open</button>';
    tip = n + ' new lead' + (n === 1 ? '' : 's') + ' — not assigned yet' + (held ? ' (' + held + ' held until 5 PM for an admin)' : '') + '. They are at the top of the list below.'; }
  else tip = 'Lead Inbox: no new leads waiting.';
  h = (h ? '<span class="c" title="' + esc(tip) + '">' + h + '</span>' : '') + '<button type="button" class="ic" data-gcls="check" aria-label="Check the Lead Inbox now">↻</button>';
  var sig = cls + '|' + h, ic = el.querySelector('.ic');
  if (sig !== LAST || el.className !== cls || !ic) { LAST = sig; if (el.className !== cls) el.className = cls; el.innerHTML = h; ic = el.querySelector('.ic'); }
  var tt = '↻ Check now · ' + tl + (n || err ? '' : ' · ' + tip); if (ic && ic.title !== tt) ic.title = tt;   /* only the tooltip changes with the time */
  CH.on(el, hub);
}"""
src = once(src, OLD, NEW)
OLD = """  if (a === 'check') { b.disabled = true; b.textContent = 'Checking…';"""
NEW = """  if (a === 'check') { b.disabled = true; b.textContent = b.classList.contains('ic') ? '…' : 'Checking…';   /* patch BARSTILL2: the ↻ icon stays small */"""
src = once(src, OLD, NEW)

# 3. SALESBLOCK: nothing when nothing waits; a small "🧹 2 to review" chip in the header when something does
OLD = """  var hub = D.getElementById('gc-leads-hub'); if (!hub || !hub.parentNode || COUNT == null) return;
  var el = D.getElementById('gcsb-strip');
  if (!el) { el = D.createElement('div'); el.id = 'gcsb-strip'; el.setAttribute('data-gc-keep', '1'); el.addEventListener('click', function(e){ if (e.target && e.target.getAttribute('data-gcsb') === 'open') { e.preventDefault(); openList(); } }); }
  if (W._gcLeadsBar) W._gcLeadsBar.place(el, hub); else if (el.parentNode !== hub.parentNode) hub.parentNode.insertBefore(el, hub);   /* patch BARSTILL: one fixed slot (first), never re-inserted when in place */
  var h = '🧹 <b>Sales &amp; spam</b>: ' + (COUNT ? COUNT + ' held for review (no one was alerted)' : 'nothing waiting') + ' <button type="button" data-gcsb="open">Review</button>';
  if (el.__gcH !== h || !el.firstChild) { el.__gcH = h; el.innerHTML = h; }   /* patch BARSTILL: only a real change is written */"""
NEW = """  var hub = D.getElementById('gc-leads-hub'), CH = W._gcLeadsChips; if (!hub || !hub.parentNode || COUNT == null || !CH) return;
  var el = D.getElementById('gcsb-strip') || CH.els['gcsb-strip'];   /* patch BARSTILL2: a small chip in the Leads header row */
  if (!el) { el = D.createElement('span'); el.id = 'gcsb-strip'; el.setAttribute('data-gc-keep', '1'); el.addEventListener('click', function(e){ if (e.target && e.target.getAttribute('data-gcsb') === 'open') { e.preventDefault(); openList(); } }); }
  if (!COUNT) { CH.off(el); return; }   /* nothing waiting: nothing shown */
  var h = '<button type="button" data-gcsb="open" title="Sales &amp; spam: ' + COUNT + ' held for review (no one was alerted). Review">🧹 ' + COUNT + ' to review</button>';
  if (el.__gcH !== h || !el.firstChild) { el.__gcH = h; el.innerHTML = h; }   /* patch BARSTILL: only a real change is written */
  CH.on(el, hub);"""
src = once(src, OLD, NEW)

open(path, 'w', encoding='utf-8').write(src)
print('BARSTILL2: patched')
