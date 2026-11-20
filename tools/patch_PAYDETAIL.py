#!/usr/bin/env python3
"""Idempotent patch PAYDETAIL (owner 11/20: "show on invoices where we can edit / add check number, how we paid etc. if the pdf
isn't in the system").  Adds tools/paydetail_tail.js as <script id="gc-patch-paydetail"> after the last patch (PROJTBL):
a "Payment details" button on every customer invoice / sub invoice / supplier bill row (desk Invoices tab, its inline editor,
and the job page's invoice list) that opens a light side sheet to see / edit / record the payment (date, amount -- partial
allowed --, method, check # / reference, paid from, note) and attach / replace / view the invoice PDF (the sub-invoice PDF
store).  Saving writes what Mark paid writes (invoice, the job's cost row, the register row by srcInvId), keeps a history
entry, and the latest change can be undone.  Admins + office only (by role).
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_PAYDETAIL__'
if MARK in src:
    print('already patched'); sys.exit(0)
JS = open(os.path.join(here, 'paydetail_tail.js'), encoding='utf-8').read()
assert JS.startswith('/*' + MARK)
def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)
A = ("W._gcColW = { tick: tick, load: load, key: tkey, reset: function(){ try { localStorage.removeItem(LK()); } catch (e) {} tick(); } };\n"
     "})(window);\n</script>\n")
src = once(src, A, A + '<script id="gc-patch-paydetail">' + JS.rstrip('\n') + '\n</script>\n')
open(path, 'w', encoding='utf-8').write(src)
print('patched PAYDETAIL')
