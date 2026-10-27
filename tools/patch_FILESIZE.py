#!/usr/bin/env python3
"""Idempotent patch FILESIZE: a file saved without its size (field photos, company documents, files added by later
patches) showed "NaNKB ·" on the job's Files & Docs tab and in the upload lists (QA 10/27 overnight, r10 job page).
The size is shown only when it is known."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/*FILESIZE*/'
if MARK in t: print('FILESIZE: already patched'); sys.exit(0)
R = [
  ('children:[(_f.size/1024).toFixed(0),"KB · ",_f.date]', 'children:[' + MARK + '_f.size>0?(_f.size/1024).toFixed(0)+"KB · ":"",_f.date]', 1),
  ('children:["(",(M.size/1024).toFixed(0),"KB)"]', 'children:[M.size>0?"("+(M.size/1024).toFixed(0)+"KB)":""]', 1),
  ('children:["(",(xe.size/1024).toFixed(0),"KB)"]', 'children:[xe.size>0?"("+(xe.size/1024).toFixed(0)+"KB)":""]', 1),
  ('children:[(y.size/1024).toFixed(0),"KB"]', 'children:[y.size>0?(y.size/1024).toFixed(0)+"KB":""]', 1),
]
for a, b, n in R:
    c = t.count(a)
    assert c == n, 'FILESIZE: expected %d of %r, found %d' % (n, a, c)
    t = t.replace(a, b)
open(p, 'w', encoding='utf-8').write(t); print('FILESIZE: patched')
