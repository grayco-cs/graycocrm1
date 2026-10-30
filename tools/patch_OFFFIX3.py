#!/usr/bin/env python3
"""Idempotent patch OFFFIX3 (office audit, 10/30): "Open" on a lead opens the lead, not the bid-due editor.

Found in the office audit: on 🏢 Office → 🧭 Helpers (estimators' "what's slipping", PMs' "leads not contacted"), in
📰 Activity, and on a To-Do made by Remind (a saved to-do with leadId), "Open" / "Open lead" went to Leads and then called
window._gcLA.edit(leadId) — which is patch LA's "⏱ Bid due" date editor, so a small date pop-up opened instead of the
lead. The bid-due chips call edit(id, theChip) with the chip as its anchor; those Open buttons call it with the lead id
only. Now edit(id) with no anchor opens the lead itself (window._gcOpenLead, patch HOT1: Leads + the lead's panel);
the chips' edit(id, chip) is unchanged. Usage: python3 tools/patch_OFFFIX3.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch OFFFIX3'
if MARK in t:
    print('OFFFIX3: already patched'); sys.exit(0)
def once(a, b):
    global t
    n = t.count(a); assert n == 1, ('OFFFIX3 anchor', n, a[:90]); t = t.replace(a, b)

once("onLeads: onLeads, cell: cell, isNew: isNew, newTag: newTag, sort: sort, edit: edit, saveDue: saveDue,",
     "onLeads: onLeads, cell: cell, isNew: isNew, newTag: newTag, sort: sort, edit: function(id, anchor){ if (!anchor && typeof W._gcOpenLead === 'function') { try { W._gcOpenLead(id); return true; } catch (e) {} } return edit(id, anchor); },   "
     + MARK + ": Open on a lead (no anchor) opens the lead, the bid-due chips keep the editor */ saveDue: saveDue,")
open(p, 'w', encoding='utf-8').write(t)
print('OFFFIX3: patched ' + p)
