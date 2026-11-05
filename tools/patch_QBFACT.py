#!/usr/bin/env python3
"""patch QBFACT (owner 11/05, URGENT): "all csv from quickbooks is fact, i dont need to approve anything from quickbooks";
"invoices before 11/4 count as paid, let's keep the last month for approval".
 1. tools/qbfact_tail.js after the last </script>: window._gcQbFact — a QuickBooks-imported record never makes a to-do,
    collections line, reminder, confirm / check-cost line or approval; a QuickBooks invoice dated before qbFactPaidBefore
    (2026-10-05) counts as paid (read time; nothing in the data changes); last month's QuickBooks customer invoices wait
    in ONE grouped approval "confirm Paid / Still owed"; admin card "Remove N bad imported invoices" (trash + Undo).
 2. the one To-Do (TD2) build: its last filter calls window._gcQbFactDrop (also: the QuickBooks "needs a home" list and
    the "subs to match to a job" line are the office's, not on the owner's To-Do).
 3. version 33.165-2026-11-05-r17q24.
usage: python3 tools/patch_QBFACT.py [index.html]   (in place; idempotent)"""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
INDEX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, '..', 'index.html')
MARK = '/* patch QBFACT */'
OLD_V, NEW_V = '33.164-2026-11-04-r17q23', '33.165-2026-11-05-r17q24'
EDITS = [
 ("  raw = raw.filter(function(r){ return !(r.src === 'st' && r.rec && (r.rec.done || r.rec.deleted)); });\n",
  "  raw = raw.filter(function(r){ return !(r.src === 'st' && r.rec && (r.rec.done || r.rec.deleted)); });\n"
  "  try { if (typeof W._gcQbFactDrop === 'function') { var qbCtx = { owner: isAdmin() && !isOffice() }; raw = raw.filter(function(r){ return !W._gcQbFactDrop(r, qbCtx); }); } } catch (e) { warn(e); }   " + MARK + "\n"),
 ('<!-- GrayCo CRM Build: ' + OLD_V + ' -->', '<!-- GrayCo CRM Build: ' + NEW_V + ' -->'),
 ('  console.log("[GC] Build ' + OLD_V + '");', '  console.log("[GC] Build ' + NEW_V + '");'),
 ('  var BUILD_ID = "' + OLD_V + '";', '  var BUILD_ID = "' + NEW_V + '";'),
]
src = open(INDEX, encoding='utf-8').read()
if '__GC_PATCH_QBFACT__' in src:
    print('already patched'); sys.exit(0)
for a, b in EDITS:
    n = src.count(a); assert n == 1, ('anchor count', n, a[:90]); src = src.replace(a, b)
tail = open(os.path.join(H, 'qbfact_tail.js'), encoding='utf-8').read().rstrip('\n')
i = src.rfind('</script>'); assert i > 0; i += len('</script>')
src = src[:i] + '\n' + tail + src[i:]
open(INDEX, 'w', encoding='utf-8').write(src)
vt = os.path.join(H, '..', 'version.txt')
if os.path.exists(vt) and os.path.dirname(os.path.abspath(INDEX)) == os.path.dirname(os.path.abspath(vt)):
    open(vt, 'w').write(NEW_V + '\n')
print('patched QBFACT')
