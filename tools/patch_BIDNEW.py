#!/usr/bin/env python3
# BIDNEW (owner 11/23: "want to be able to enter a project into the portal from here"): "＋ New bid job" on the 🏗 Bid portal screen —
# an inline form (title, address, bid due date + time, trades, scope / notes, Private / Public, an optional CRM lead / job link, plans:
# upload or a Drive / Dropbox link) → bid-hub op postjob (the 📢 Put on bid portal path) → its 📂 Manage sheet. Appends tools/bidnew_tail.js
# right after the last script of index.html (the anchor below must occur exactly once).
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
s = open(p, encoding='utf-8').read()
assert 'BIDNEW' not in s, 'already patched'
a = "W._gcSubflow = { btn: btn, what: what, sheet: sheet, addenda: addenda };\ntry { console.log('[GC] ↩ Reply to the sub from the job thread (patch SUBFLOW): _gcSubflow'); } catch (e) {}\n})(window, document);\n</script>\n"
assert s.count(a) == 1, s.count(a)
tail = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bidnew_tail.js'), encoding='utf-8').read()
assert tail.count('BIDNEW') >= 1
s = s.replace(a, a + tail)
open(p, 'w', encoding='utf-8').write(s); print('BIDNEW applied')
