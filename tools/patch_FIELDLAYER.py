#!/usr/bin/env python3
"""Idempotent patch FIELDLAYER: two GrayCo Field (phone) job-card tiles opened their window BEHIND the field home, so a
tap looked like it did nothing (QA 10/27 overnight, r10, 390 px, every role):
  * 🔁 Change order — the change-order form (#gc-addco-overlay, z 9800) sat under the field home (z 99980).
    In the field view it now opens on top (z 100060); the desk view is unchanged.
  * 🎤 Voice note — it pressed the old voice-COMMANDS button (#_voiceBtn: "🎤 Listening…" overlay, z 9999, hidden under the
    field home, with the microphone on). It now opens the 🎤 Voice note sheet for THAT job (window._gcAUTAI.mic(job id),
    the same sheet the red 🎤 button and the 📅 Schedule tile open); the old button is only the fallback."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch FIELDLAYER */'
if MARK in t: print('FIELDLAYER: already patched'); sys.exit(0)

def once(src, a, b):
    c = src.count(a)
    assert c == 1, 'FIELDLAYER: expected 1 of %r, found %d' % (a[:90], c)
    return src.replace(a, b)

t = once(t, "  R({ id: 'voice', icon: '🎤', label: 'Voice note', hideUnsigned: true, run: function(){ var vb = D.getElementById('_voiceBtn') || D.getElementById('_gcMicBtn');",
            "  R({ id: 'voice', icon: '🎤', label: 'Voice note', hideUnsigned: true, run: function(p){ " + MARK + " if (W._gcAUTAI && typeof W._gcAUTAI.mic === 'function') { try { W._gcAUTAI.mic(p && p.id); return; } catch (e) {} } var vb = D.getElementById('_gcMicBtn') || D.getElementById('_voiceBtn');")
t = once(t, "'#_gcJobPick.gc-fh{position:fixed;inset:0;z-index:99980;",
            "'html._fieldmode #gc-addco-overlay{z-index:100060 !important}' + '#_gcJobPick.gc-fh{position:fixed;inset:0;z-index:99980;")
open(p, 'w', encoding='utf-8').write(t); print('FIELDLAYER: patched')
