#!/usr/bin/env python3
"""patch PROJTBL: appends tools/projtbl_tail.js (see its header) to index.html, and gives the desk Projects table's
PROJECT column a bigger share (the 33.x sizer's DEFAULTS and DESKFIT's FIT), taken from Address / Client."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '__GC_PATCH_PROJTBL__' in src: print('already patched'); sys.exit(0)
def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:70], s.count(old))
    return s.replace(old, new)
src = once(src, "'PO#':70,'PROJECT':170,'CLIENT':130,'ADDRESS':150,'PM':90,'TYPE':90,", "'PO#':70,'PROJECT':330,'CLIENT':110,'ADDRESS':110,'PM':80,'TYPE':80,")
src = once(src, "cols: { 'po#': [6], project: [13], client: [11], address: [11, 1, 1], pm: [8], type: [7, 1], status: [8], started: [7], 'finish date': [7], contract: [7], spent: [5], profit: [6], alert: [4] } },", "cols: { 'po#': [6], project: [24], client: [9], address: [9, 1, 1], pm: [7], type: [5, 1], status: [7], started: [7], 'finish date': [6], contract: [7], spent: [4], profit: [7], alert: [3] } },")
tail = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'projtbl_tail.js'), encoding='utf-8').read()
open(P, 'w', encoding='utf-8').write(src.rstrip('\n') + '\n' + tail); print('patched')
