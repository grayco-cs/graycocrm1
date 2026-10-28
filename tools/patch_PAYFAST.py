#!/usr/bin/env python3
"""Idempotent patch PAYFAST: ✅ Approvals → Approve on a sub invoice that fails the pay check opens the "⚠ Sub pay check —
approval stopped" window at once (owner 10/27, Joel Cabrera $4,650: "very slow").

It came ~5.7 s after the tap: the card first ran the 5-second "✓ Approved — ↩ Undo" wait, and only then the pay check
stopped it; the window also waited for the flag to be saved (the whole sub-approvals list written to the device and the
cloud). Now a sub invoice the pay check will stop skips the Undo wait (nothing is approved anyway) and the window opens
on the tap; the flag is saved half a second after the window is on screen. window._gcSubPayBlocked(invId) answers from
the same check (kept 30 s). Usage: python3 tools/patch_PAYFAST.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch PAYFAST'
if MARK in src:
    print('PAYFAST: already patched'); sys.exit(0)
E = [
("""      if (!r.ok) { flag(invId, r); var self = this, args = arguments; stopWindow(invId, r, 'approval',""",
 """      if (!r.ok) { """ + MARK + """: the window first, the flag saved after it is on screen */ (function(id0, r0){ later(function(){ var rw = rowOf(id0); if (rw && rw.payOverride) return; flag(id0, r0); }, 500); })(invId, r); var self = this, args = arguments; stopWindow(invId, r, 'approval',"""),
("""W._gcSubPayFlags = function(){""",
 MARK + """: would the pay check stop this sub invoice? (kept 30 s) */
var PB = { at: 0, m: {} };
W._gcSubPayBlocked = function(invId){ var id = s(invId); if (Date.now() - PB.at > 30000) PB = { at: Date.now(), m: {} }; if (!(id in PB.m)) { try { var r = check(id); PB.m[id] = !r.ok && !r.overridden; } catch (e) { PB.m[id] = false; } } return PB.m[id]; };
W._gcSubPayFlags = function(){"""),
("""    approve: mine || adminLike() ? { l: '✅ Approve', mode: 'defer', f: function(){ return call('_gcPmDecideSub', id, true, ''); } } : null, jobPick: s(a.pid) ? '' : 'sub',""",
 """    approve: mine || adminLike() ? { l: '✅ Approve', mode: (typeof W._gcSubPayBlocked === 'function' && W._gcSubPayBlocked(id)) ? undefined : 'defer', f: function(){ return call('_gcPmDecideSub', id, true, ''); } } : null, jobPick: s(a.pid) ? '' : 'sub',   """ + MARK + """: a stopped one opens the pay-check window at once */"""),
]
for a, b in E:
    assert src.count(a) == 1, ('PAYFAST find-string count != 1', src.count(a), a[:80])
    src = src.replace(a, b)
open(path, 'w', encoding='utf-8').write(src)
print('PAYFAST: patched', path)
