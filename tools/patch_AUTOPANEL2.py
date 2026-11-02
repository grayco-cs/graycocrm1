#!/usr/bin/env python3
r"""Idempotent patch AUTOPANEL2 (on top of AUTOPANEL): the progress auto-draw can never run while it is OFF, and its "held"
record is never lost; a 🔒 safety switch asks before it is turned ON as well as OFF.

  1. ⚡ core: the "held" records of THIS computer (and the batch not sent yet) are kept in localStorage
     (gc_auto_held_local), so a page reload — the CRM reloads itself after "the cloud is the truth", an admin's
     "Refresh this computer", a sync … — no longer wipes them. Before, a one-time automation (the progress auto-draw
     fires once, when the % is moved) lost its "held" record if the page reloaded before the panel was read, and lost
     the server copy too if the reload came within the 4-second send delay.
  2. Progress-slider auto-draw (_gcSetProjectPct): the switch is asked, and "held" recorded, BEFORE the new % is saved —
     nothing in the save can skip the record. The % is still saved; no draw invoice while it is OFF (as before).
  3. AUT3 drafted a draw invoice by itself 1.5 s after ANY progress move (gc:job-pct, and the schedule-driven %), checked
     only against "AUT3 job stages". With job stages ON and "Progress-slider auto-draw" OFF, moving the % still made a
     draw invoice (createdBy "auto-draw (milestone)"). A draw made because the % moved now needs "Progress-slider
     auto-draw" ON too (OFF → "held"). The final invoice made when a job reaches the Complete stage stays under job stages.
  4. ⚡ panel: switching a 🔒 safety automation ON asks first too (it already asked before OFF). Missed-call text-back
     texts a caller — a customer — by itself, so either direction is confirmed.
Usage: python3 tools/patch_AUTOPANEL2.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* __GC_PATCH_AUTOPANEL2__ */'
if MARK in src:
    print('AUTOPANEL2: already patched'); sys.exit(0)
assert '/* __GC_PATCH_AUTOPANEL_TOOL__ */' in src, 'AUTOPANEL2 needs patch AUTOPANEL first'

def once(s, old, new):
    n = s.count(old)
    assert n == 1, ('AUTOPANEL2 anchor count != 1', n, old[:160])
    return s.replace(old, new)

G = "(window._gcAutoGate ? window._gcAutoGate"
EDITS = [
# ── 1. the core: held records survive a reload ──
("""var lastHeld = {}, lastRan = {}, pendHeld = {}, pendRan = {}, flushT = 0;
function flushSoon(){ if (flushT) return; flushT = T(flush, 4000); }""",
 """var lastHeld = {}, lastRan = {}, pendHeld = {}, pendRan = {}, flushT = 0;
function flushSoon(){ if (flushT) return; flushT = T(flush, 4000); }
""" + MARK + """ /* this computer's "held" records and the batch not sent yet are kept across a page reload */
var HK = 'gc_auto_held_local';
function saveHeld(){ try { localStorage.setItem(HK, JSON.stringify({ held: S.held, pend: pendHeld, last: lastHeld })); } catch (e) {} }
(function(){
  try {
    var o = JSON.parse(localStorage.getItem(HK) || 'null'); if (!o || typeof o !== 'object') return;
    var now = Date.now(), cut = now - 30 * 864e5;
    Object.keys(o.held || {}).forEach(function(k){ var h = o.held[k]; if (R.BY[k] && h && typeof h === 'object' && Date.parse(h.last || '') > cut) S.held[k] = h; });
    Object.keys(o.pend || {}).forEach(function(k){ if (R.BY[k] && o.pend[k] && typeof o.pend[k] === 'object') pendHeld[k] = o.pend[k]; });
    Object.keys(o.last || {}).forEach(function(k){ var t = +o.last[k]; if (R.BY[k] && t > now - HELD_MS && t <= now) lastHeld[k] = t; });
    if (Object.keys(pendHeld).length) flushSoon();
  } catch (e) {}
})();"""),
("""  pendHeld = {}; pendRan = {};
  var post = function(body){""",
 """  pendHeld = {}; pendRan = {}; saveHeld();   /* patch AUTOPANEL2 */
  var post = function(body){"""),
("""  if (lastHeld[key] && now - lastHeld[key] < HELD_MS) return;
  lastHeld[key] = now;""",
 """  if (lastHeld[key] && now - lastHeld[key] < HELD_MS) { saveHeld(); return; }   /* patch AUTOPANEL2 */
  lastHeld[key] = now;"""),
("""  try { console.log('[GC] ⚡ held ' + key + ': would have done ' + (n == null ? '?' : n)); } catch (e) {}
  flushSoon();""",
 """  try { console.log('[GC] ⚡ held ' + key + ': would have done ' + (n == null ? '?' : n)); } catch (e) {}
  saveHeld();   /* patch AUTOPANEL2 */
  flushSoon();"""),
# ── 2. the slider: ask (and record "held") before the % is saved ──
("""  var due = window._gcDrawMilestones(proj).filter(function(m){
    return pct >= m.at && !window._gcDrawInvoiced(pid, m.n);
  });
""",
 """  var due = window._gcDrawMilestones(proj).filter(function(m){
    return pct >= m.at && !window._gcDrawInvoiced(pid, m.n);
  });
  /* patch AUTOPANEL2: "Progress-slider auto-draw" is asked — and "held" recorded — BEFORE the % is saved below */
  var _gcAdOn = due.length ? """ + G + """('progress_autodraw', due.length, [proj.name||pid]) : false) : false;
"""),
("""  if(!(window._gcAutoGate ? window._gcAutoGate('progress_autodraw', due.length, [proj.name||pid]) : false)) return;   /* patch AUTOPANEL: the % is saved; no draw invoice while it is OFF */""",
 """  if(!_gcAdOn) return;   /* patch AUTOPANEL (+2): the % is saved; no draw invoice while it is OFF */"""),
# ── 3. AUT3: a draw made because the % moved needs "Progress-slider auto-draw" ON too ──
("""function ensureDraws(pid){""",
 """function ensureDraws(pid, why){   /* patch AUTOPANEL2: why 'pct' = the progress moved (needs progress_autodraw ON too) */"""),
("""  DRAFTED[id] = Date.now();   /* this session: never twice, even before the CRM's copy shows it */""",
 """  if (why === 'pct' && !""" + G + """('progress_autodraw', 1, [s(p.name || pid)]) : false)) return null;   /* patch AUTOPANEL2: OFF → held, no draw */
  DRAFTED[id] = Date.now();   /* this session: never twice, even before the CRM's copy shows it */"""),
("""ST(function(){ ensureDraws(d.pid); }, 1500);""",
 """ST(function(){ ensureDraws(d.pid, 'pct'); }, 1500);"""),
("""ST(function(){ ensureDraws(pid); }, 800);""",
 """ST(function(){ ensureDraws(pid, 'pct'); }, 800);"""),
# ── 4. the panel: a safety switch asks before ON too ──
("""    var wt = want ? waiting(k, st) : null;""",
 """    /* patch AUTOPANEL2: a 🔒 safety switch asks before it is turned ON as well */
    if (want && a.group === 'safety' && !confirm('Turn ON "' + a.name + '"?\\n\\nThis is a SAFETY automation' + (a.effect === 'A' ? ' that sends to customers by itself' : '') + '. From now on: ' + a.desc + (a.effect === 'A' ? '\\nNobody approves each message — it goes out at once.' : ''))) { ev.target.checked = false; return; }
    var wt = want ? waiting(k, st) : null;"""),
]
for o, n in EDITS:
    src = once(src, o, n)
open(path, 'w', encoding='utf-8').write(src)
print('AUTOPANEL2: patched (%d edits)' % len(EDITS))
