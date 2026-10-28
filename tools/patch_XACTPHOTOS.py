#!/usr/bin/env python3
"""Idempotent patch XACTPHOTOS: "📦 Photos for Xactimate" — a job's photos as one ZIP Xactimate imports as-is.

Owner: "make sure when i add photos into google photos that they transfer into xactimate easily" (GrayCo Photos).
tools/xactphotos_core.js (pure: order, names, CSV, EXIF, CRC-32, STORE ZIP — tested by tools/tests/test_XACTPHOTOS.mjs)
+ tools/xactphotos_ui.js (the picker, inside GrayCo Photos' closure: jobPhotos / dlTry / decode / ccLoad) go in right
before vProjectsOld. Buttons: the project page's photo bar (next to ⬇ Download all) and the insurance claim's 📸 Photos tab.
Every find-string must occur exactly once. Usage: python3 tools/patch_XACTPHOTOS.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
CORE = open(os.path.join(HERE, 'xactphotos_core.js'), encoding='utf-8').read().rstrip('\n')
UI = open(os.path.join(HERE, 'xactphotos_ui.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_XACTPHOTOS__'
if MARK in src:
    print('already patched'); sys.exit(0)
for t in (CORE, UI):
    assert '</script>' not in t and '<script' not in t
EDITS = [
  # 1. the code, inside GrayCo Photos' closure
  ('function vProjectsOld(){', CORE + '\n' + UI + '\nfunction vProjectsOld(){'),
  # 2. CompanyCam labels (room / area tags) kept on the photo
  ('tag: ccTag(ph), note: s(ph.description).slice(0, 500),', 'tag: ccTag(ph), labels: xpLabels(ph), note: s(ph.description).slice(0, 500),'),
  # 3. CompanyCam photos load for the picker even when it was opened from a claim (GrayCo Photos not on screen)
  ('if (!ids.length || !shown()) return Promise.resolve([]);', 'if (!ids.length || !(shown() || XPW.on)) return Promise.resolve([]);   /* XACTPHOTOS: or the Xactimate picker asked */'),
  # 4. the project page's photo bar
  ('''<button class="dl-b" data-a="dlsel">☑ Select</button></div>';''', '''<button class="dl-b" data-a="dlsel">☑ Select</button>' + xpBtn() + '</div>';'''),
  ("    case 'dlsel': S.dlm = true;", "    case 'xpopen': return xpOpen(S.jobId);   /* XACTPHOTOS */\n    case 'dlsel': S.dlm = true;"),
  # 5. the door for other screens
  ('  open: open, close: close, openRef: openRef, mountTab: mountTab,',
   "  xact: function(jobId, o){ return xpOpen(jobId, o); }, xactOk: xpAllowed, xactCore: XPC, xactState: function(){ return { open: !!XP.ov, running: !!XP.run, rows: XP.rows.length, selected: xpChosen().length, last: XP.lastZip || null }; },   /* XACTPHOTOS */\n"
   '  open: open, close: close, openRef: openRef, mountTab: mountTab,'),
  # 6. the insurance claim's 📸 Photos tab
  ('''<button class="gcbb-btn sm" data-a="i3reload">↻ Refresh</button>' +''',
   '''<button class="gcbb-btn sm" data-a="i3reload">↻ Refresh</button>' + (pid && W._gcPhotos && W._gcPhotos.xactOk && W._gcPhotos.xactOk() ? '<button class="gcbb-btn sm pri" data-a="xpzip" title="' + esc(W._gcPhotos.xactCore.HOWTO) + '">📦 Photos for Xactimate</button>' : '') /* XACTPHOTOS */ +'''),
  ('  var E = g.ext, P = E.P2TABS, X = E.EXT_ACT;',
   '  var E = g.ext, P = E.P2TABS, X = E.EXT_ACT;\n'
   '  X.xpzip = function(A, v, t, ev, c){ c = c || (A.S && A.S.claimId ? g.get(A.S.claimId) : null); if (!c || !c.projectId || !W._gcPhotos || !W._gcPhotos.xact) return; var sel = UI.sel[s(c.projectId)] || {}; W._gcPhotos.xact(s(c.projectId), { claim: c, ids: Object.keys(sel).filter(function(k){ return sel[k]; }) }); };   /* XACTPHOTOS */'),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('find-string count != 1', a[:80], src.count(a))
    src = src.replace(a, b)
assert src.count(MARK) == 1 and src.count('__GC_XACTPHOTOS_CORE__') == 1
assert src.count('data-a="xpzip"') == 1 and src.count("case 'xpopen'") == 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
