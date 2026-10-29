#!/usr/bin/env python3
"""Idempotent patch AUTOCLAIMS: claim & field automations (owner-approved 10/29: "yes 8", "10 yes", "yes 11", "12 yes").

  8.  Permit & inspection tracker on the Site Book's "Codes & permits" (+ the job inspections list of patch AUT3):
      permit status, Rescheduled as a result, dated inspections on the schedule, PM reminder the day before, a
      "Passed / Failed / Rescheduled?" prompt after the date, Failed -> a fix + reschedule To-Do, and the list of
      everything open (📋 All open permits & inspections).
  10. Drying log reminders: "Take moisture readings + photos (Day N)" on the To-Do until drying is complete; missed days
      flagged on the claim's Drying tab and the To-Do.
  11. Supplement tracker: the claim's "🧾 Field supplements" tab, CSV / PDF export for the adjuster.
  12. Claim status nudges: the approval card of a server-drafted adjuster follow-up says it goes to the adjuster.

The page gets ONE script (<script id="gc-patch-autoclaims">) holding a copy of netlify/functions/_lib/auto-claims.js (the
rules, window.GCAC) and tools/autoclaims_tail.js (the CRM side), placed before gc-patch-apptconf; and five small edits in
the Site Book (patch RP) so it exposes its edit helpers and asks the rules on a result. Every find-string must occur
exactly once. Usage: python3 tools/patch_AUTOCLAIMS.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
if os.path.isdir(path): path = os.path.join(path, 'index.html')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_AUTOCLAIMS__'
if MARK in src:
    print('AUTOCLAIMS: already patched'); sys.exit(0)
LIB = open(os.path.join(ROOT, 'netlify', 'functions', '_lib', 'auto-claims.js'), encoding='utf-8').read().rstrip('\n')
TAIL = open(os.path.join(HERE, 'autoclaims_tail.js'), encoding='utf-8').read().rstrip('\n')
assert '</script' not in LIB and '</script' not in TAIL

PAIRS = [
# the Site Book exposes its edit helpers (the rules change an inspection where it lives)
("push: push, pull: pull, state: function(){ return { job: st.job, sec: st.sec, dirty: dirty, err: err }; }, QC: QC };",
 "push: push, pull: pull, edit: edit, setIn: setIn, addTo: addTo /* AUTOCLAIMS */, state: function(){ return { job: st.job, sec: st.sec, dirty: dirty, err: err }; }, QC: QC };"),
# the permit gets a status
("f('codeNotes', 'Code notes (what the inspector wants on this job)', pm.codeNotes, 'textarea')",
 "'<label class=\"sb-f\">Permit status<select name=\"status\">' + ((W.GCAC && W.GCAC.PERMIT_STATUSES) || ['Needed', 'Applied', 'Issued', 'Inspections open', 'Finaled / closed', 'Not needed']).map(function(o){ return '<option' + (o === (pm.status || (pm.number ? 'Issued' : 'Needed')) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>' /* AUTOCLAIMS */ + f('codeNotes', 'Code notes (what the inspector wants on this job)', pm.codeNotes, 'textarea')"),
("r.permit = { number: s(v.number), jurisdiction: s(v.jurisdiction), codeNotes: s(v.codeNotes), updatedAt: nowIso(), by: myName() };",
 "r.permit = { number: s(v.number), jurisdiction: s(v.jurisdiction), status: s(v.status) /* AUTOCLAIMS */, codeNotes: s(v.codeNotes), updatedAt: nowIso(), by: myName() };"),
# Rescheduled is a result; the list of everything open
("['Scheduled', 'Passed', 'Failed', 'Partial', 'Cancelled']",
 "['Scheduled', 'Passed', 'Failed', 'Rescheduled' /* AUTOCLAIMS */, 'Partial', 'Cancelled']"),
("'<div class=\"sb-card wide\"><h3>🔎 Inspections</h3>'",
 "'<div class=\"sb-card wide\"><h3>🔎 Inspections <button type=\"button\" class=\"gc-rp-btn\" style=\"margin-left:auto;font-size:12px\" onclick=\"window._gcAutoClaims&&window._gcAutoClaims.openList()\">📋 All open permits & inspections</button></h3>' /* AUTOCLAIMS */"),
# a result picked in the Site Book goes through the rules (Failed → fix To-Do + re-inspection, Rescheduled → new date)
("if (t.getAttribute('data-sb-insp')) setIn(pid, 'inspections', t.getAttribute('data-sb-insp'), function(x){ x.result = t.value; });",
 "if (t.getAttribute('data-sb-insp')) { if (W._gcAutoClaims && W._gcAutoClaims.sbResult) W._gcAutoClaims.sbResult(pid, t.getAttribute('data-sb-insp'), t.value); else setIn(pid, 'inspections', t.getAttribute('data-sb-insp'), function(x){ x.result = t.value; }); }   /* AUTOCLAIMS */"),
]
for a, b in PAIRS:
    n = src.count(a)
    assert n == 1, ('AUTOCLAIMS find-string count != 1', n, a[:90])
    src = src.replace(a, b)

anchor = '<script id="gc-patch-apptconf">'
assert src.count(anchor) == 1, ('anchor count != 1', src.count(anchor))
block = '<script id="gc-patch-autoclaims">\n' + LIB + '\n</script>\n<script id="gc-patch-autoclaims-ui">\n' + TAIL + '\n</script>\n'
src = src.replace(anchor, block + anchor)
assert src.count(MARK) >= 1
open(path, 'w', encoding='utf-8').write(src)
print('AUTOCLAIMS: patched', path)
