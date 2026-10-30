#!/usr/bin/env python3
"""Idempotent patch OFFFIX5 (office audit, 10/30): the 🛡 Sub Compliance Board lists each sub once.

Found in the office audit: 💎 → Sub compliance (window._gcOpenSubCompliance) read the subs list AND the vendors list, and on
the live data the vendors list holds a copy of every sub (65 of 65 share their id), so the board said "126 subs need
attention" and showed every sub twice (two "Request docs" buttons for the same person). Now a record whose id (or, with
no id, whose name) was already listed is skipped; the subs list's copy wins. Nothing else changes.
Usage: python3 tools/patch_OFFFIX5.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch OFFFIX5'
if MARK in t:
    print('OFFFIX5: already patched'); sys.exit(0)
def once(a, b):
    global t
    n = t.count(a); assert n == 1, ('OFFFIX5 anchor', n, a[:90]); t = t.replace(a, b)

once("  function subs(){ var c=crm(); var all=(c.subs||[]).concat(c.vendors||[]); return all.filter(function(s){ return s && (s.isSub || s.trade || (c.subs||[]).indexOf(s)>=0); }); }",
     "  function subs(){ var c=crm(); var all=(c.subs||[]).concat(c.vendors||[]); var seen={}; return all.filter(function(s){ if(!(s && (s.isSub || s.trade || (c.subs||[]).indexOf(s)>=0))) return false; var k=s.id!=null&&s.id!==''?'i:'+s.id:'n:'+String(s.name||s.company||'').trim().toLowerCase(); if(seen[k]) return false; seen[k]=1; return true; }); }   "
     + MARK + ": each sub once (the vendors list holds a copy of every sub) */")
open(p, 'w', encoding='utf-8').write(t)
print('OFFFIX5: patched ' + p)
