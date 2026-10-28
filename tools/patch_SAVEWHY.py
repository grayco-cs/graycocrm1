#!/usr/bin/env python3
"""Idempotent patch SAVEWHY: the save note says WHAT could not be sent and WHY (owner 10/27: "Saved on this computer —
sending…" then "could not save, try again" on Leads, with no reason).

The note (patch PERFCLICK) now names the list that is stuck and the cloud's own answer from the save queue
(window._gcSyncQ.state().lastError, e.g. "leads: cloud answered 413" / "… 500" / "Failed to fetch"), in the note and in
its tooltip, and console.warn's it once per new reason so it shows in the browser console / CRM health.
Nothing about saving changes. Usage: python3 tools/patch_SAVEWHY.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch SAVEWHY'
if MARK in src:
    print('SAVEWHY: already patched'); sys.exit(0)
OLD = """      if (tries >= 2 || (!navigator.onLine)) show('\\u26a0 ' + n + (n === 1 ? ' save is' : ' saves are') + ' kept on this computer \\u2014 not sent yet, trying again', 'warn');"""
NEW = """      """ + MARK + """: which list and the cloud's own answer */
      var why = ''; try { why = String(st.lastError || '').slice(0, 140); var wk = (q.waiting() || []).map(function(w){ return w.key; }).slice(0, 3).join(', '); if (!why && wk) why = wk; if (why && why !== W.__gcSaveWhyLast) { W.__gcSaveWhyLast = why; try { console.warn('[GC] save not sent yet: ' + why + ' (waiting: ' + wk + ')'); } catch (e2) {} } } catch (e) {}
      if (tries >= 2 || (!navigator.onLine)) { show('\\u26a0 ' + n + (n === 1 ? ' save is' : ' saves are') + ' kept on this computer \\u2014 not sent yet, trying again' + (why ? ' (' + why + ')' : ''), 'warn'); try { box().title = why; } catch (e) {} }"""
assert src.count(OLD) == 1, ('SAVEWHY find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('SAVEWHY: patched', path)
