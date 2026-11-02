#!/usr/bin/env python3
"""Idempotent patch DELKEY: in the lead delete boxes, Delete is the default button -- Enter deletes, Esc cancels.

Owner (11/01): "delete button I should hit enter and that's default, not enter and that's cancel."

The "Delete this lead?" box (Leads list, one lead) and the "Delete N leads?" box (Leads -> Select -> Delete) both come
with Undo (5 seconds) and "Recently deleted" (30 days). In both, the dark Cancel was the focused, primary button (the
bulk box even mapped Enter to Cancel) and Delete was a light red outline.
Now, in both:
  * 🗑 Delete is solid red, the primary button, and has the focus when the box opens;
  * Enter = Delete (Enter on a Cancel the person tabbed to still cancels), Esc = Cancel, a click outside = Cancel;
  * Cancel is the secondary (outline) button.
The 5-second Undo and Recently deleted are unchanged.

Left as they are (Cancel stays the default): deletes that cannot be undone --
  * "Delete this job?" (_gcAskDeleteJob: "It is removed for good on every computer.");
  * the browser's own OK/Cancel boxes (customers, subs, vendors, invoices, payments, expenses, estimates, schedule
    items ...): the browser draws those, the CRM cannot restyle them.
Usage: python3 tools/patch_DELKEY.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch DELKEY'
if MARK in t:
    print('DELKEY: already patched'); sys.exit(0)

def rep(name, old, new, count=1):
    global t
    n = t.count(old)
    assert n == count, 'DELKEY %s: expected %d, found %d' % (name, count, n)
    t = t.replace(old, new)

# 1. the look: Delete solid red (primary), Cancel outline (secondary) -- shared by both lead boxes
rep('css',
    "#gcl-delq [data-a=cancel]{background:#0f2440;color:#fff;border:0}#gcl-delq [data-a=delete]{background:#fff;color:#b91c1c;border:1px solid #fca5a5}',",
    "#gcl-delq [data-a=cancel]{background:#fff;color:#0f2440;border:1px solid #cbd5e1}#gcl-delq [data-a=delete]{background:#dc2626;color:#fff;border:1px solid #dc2626}#gcl-delq .a button:focus-visible{outline:3px solid #fbbf24;outline-offset:2px}',   " + MARK + ": Delete is the primary button, Cancel the outline one */")

# 2. one lead: Enter = Delete, Esc = Cancel, focus on Delete
rep('one-key',
    "  function key(e){ if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } }\n"
    "  function done(yes){ D.removeEventListener('keydown', key, true); ov.remove(); if (yes) lcDelete(id); }",
    "  function key(e){ if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); var ae = D.activeElement; done(!(ae && ae.getAttribute && ae.getAttribute('data-a') === 'cancel' && ov.contains(ae))); } }   " + MARK + ": Enter = Delete (Undo + Recently deleted follow), Esc = Cancel */\n"
    "  function done(yes){ D.removeEventListener('keydown', key, true); ov.remove(); if (yes) lcDelete(id); }")
rep('one-focus',
    "  D.body.appendChild(ov);\n  try { ov.querySelector('[data-a=cancel]').focus(); } catch (e) {}\n}\nfunction lcDelete(id){",
    "  D.body.appendChild(ov);\n  try { ov.querySelector('[data-a=delete]').focus(); } catch (e) {}   " + MARK + " */\n}\nfunction lcDelete(id){")

# 3. several leads: the same (it mapped Enter to Cancel)
rep('bulk-key',
    "  function key(e){ if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(false); } }\n"
    "  function done(yes){ D.removeEventListener('keydown', key, true); ov.remove(); if (yes) bkDelete(ids); }",
    "  function key(e){ if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); var ae = D.activeElement; done(!(ae && ae.getAttribute && ae.getAttribute('data-a') === 'cancel' && ov.contains(ae))); } }   " + MARK + ": Enter = Delete, Esc = Cancel */\n"
    "  function done(yes){ D.removeEventListener('keydown', key, true); ov.remove(); if (yes) bkDelete(ids); }")
rep('bulk-focus',
    "  D.body.appendChild(ov);\n  try { ov.querySelector('[data-a=cancel]').focus(); } catch (e) {}\n}\n/* the CRM's own lead delete (one call for all of them)",
    "  D.body.appendChild(ov);\n  try { ov.querySelector('[data-a=delete]').focus(); } catch (e) {}   " + MARK + " */\n}\n/* the CRM's own lead delete (one call for all of them)")

open(p, 'w', encoding='utf-8').write(t)
print('DELKEY: patched')
