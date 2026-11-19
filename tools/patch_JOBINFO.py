#!/usr/bin/env python3
"""Idempotent patch JOBINFO: the GrayCo Field job page — ✏️ Job info you can edit (project + customer, ▶ Mark Active),
progress above 0 % means active, every tile shown (no More toggle), the job's 📄 Documents and 📅 Schedule as white pages.

1. tools/jobinfo_block.html is appended as <script id="gc-patch-jobinfo"> after the last script (it wraps the job page,
   the Job Profile, the Field Documents list and the progress save last, so it is the outermost wrapper).
3. No blocking boxes in the progress / stage flow: FINISHPHOTO (100 % always saves; a note + a To-Do for the PM), the DOCAUTO2
   hazard-paper alert and the Field progress "updated" alert become notes; LEADSTART's Lead 01 / Asbestos 01 box becomes a bar
   (the EPA hold itself stays).
2. PMFIELD: window._gcPmField also hands out its schedule writer (saveSched) and its "may this person change this item"
   rule (canEditRec), so the job's schedule page saves exactly where My Schedule saves.
Usage: python3 tools/patch_JOBINFO.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_JOBINFO__' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jobinfo_block.html'), encoding='utf-8').read().rstrip('\n')
src = once(src, "W._gcPmField = {\n  state: function(){", "W._gcPmField = {\n  saveSched: saveSched, canEditRec: canEdit,   /* patch JOBINFO: the job's own schedule page saves through this same writer and rule */\n  state: function(){")
# 3. no blocking boxes in the progress / stage flow (owner 11/19: "I don't like these popups")
#    a. FINISHPHOTO: 100 % always saves; no "Add the finish photos first" box — a note + a To-Do for the job's PM (JOBINFO)
src = once(src, "SEEN['__want_' + p.id] = now; revert(p, was); ask(p); return;   /* keep the old snapshot */",
  "try { if (W._gcStageNote && W._gcStageNote.finish) W._gcStageNote.finish(p); else { SEEN['__want_' + p.id] = now; revert(p, was); ask(p); return; } } catch (e) {}   /* patch JOBINFO (owner 11/19 \"I don't like these popups\"): 100 % saves; a note + a To-Do for the PM instead of the box */")
#    b. DOCAUTO2 hazard hold: the job still waits for the papers, the alert box is a note
src = once(src, """try { W.alert('⛔ "' + s(p.name) + '" cannot be '""", """try { (W._gcStageNote ? W._gcStageNote.alert : W.alert)('⛔ "' + s(p.name) + '" cannot be '""")
#    c. LEADSTART (Lead 01 / Asbestos 01 before work starts — EPA): the hold stays, the box is a bar at the bottom, not a modal
i = src.index("o.id = 'gc-la3-gate';"); seg = src[i:i + 1400]
seg2 = seg.replace("o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');", "o.setAttribute('role', 'status');", 1)
seg2 = seg2.replace("o.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px';",
  "o.style.cssText = 'position:fixed;left:0;right:0;bottom:calc(92px + env(safe-area-inset-bottom,0px));z-index:2147483000;display:flex;justify-content:center;padding:0 12px;pointer-events:none';   /* patch JOBINFO: a bar, not a modal */", 1)
assert seg2 != seg and seg2.count('pointer-events:none') == 1, 'LEADSTART anchors'
src = src[:i] + seg2 + src[i + 1400:]
src = once(src, '<div style="background:#fff;color:#0f172a;border-radius:14px;max-width:460px;width:100%;padding:18px;font:15px Inter,Arial,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.3)">',
  '<div style="pointer-events:auto;max-height:55vh;overflow:auto;border:1px solid #cbd5e1;border-left:4px solid #F2A51A;background:#fff;color:#0f172a;border-radius:14px;max-width:460px;width:100%;padding:14px 16px;font:15px Inter,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.18)">')
#    d. the Field progress save: "✅ … updated to N %" is a note, not an alert
src = once(src, "setTimeout(function(){ alert('\\u2705 '+(j.name||'Job')+' updated to '", "setTimeout(function(){ (window._gcStageNote?window._gcStageNote.alert:alert)('\\u2705 '+(j.name||'Job')+' updated to '")
src = src.rstrip('\n') + '\n' + BLOCK + '\n'
open(path, 'w', encoding='utf-8').write(src)
print('patched')
