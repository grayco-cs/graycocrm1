#!/usr/bin/env python3
"""Idempotent patch PAINT50: paint labor defaults to $50 a gallon (owner) for interior, exterior, primer-only and
custom zones (spray DTM and epoxy floors keep their own rates). Each zone's Labor $/gal box still changes it; zones
already saved keep their rate. Usage: python3 tools/patch_PAINT50.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = "/* patch PAINT50: paint labor $50/gal by default */"
if MARK in t: print('PAINT50: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('PAINT50 anchor count != 1', n, old[:80]); t = t.replace(old, new)

once("""const PT_TYPES={
  interior:  {label:'Interior walls / ceilings',laborRate:75, matRate:25, cov:350, matLabel:'Interior paint'},
  exterior:  {label:'Exterior',                 laborRate:75, matRate:30, cov:300, matLabel:'Exterior paint'},""",
MARK + """
const PT_TYPES={
  interior:  {label:'Interior walls / ceilings',laborRate:50, matRate:25, cov:350, matLabel:'Interior paint'},
  exterior:  {label:'Exterior',                 laborRate:50, matRate:30, cov:300, matLabel:'Exterior paint'},""")
once("""  primer:    {label:'Primer coat only',          laborRate:60, matRate:20, cov:350, matLabel:'Primer'},""",
     """  primer:    {label:'Primer coat only',          laborRate:50, matRate:20, cov:350, matLabel:'Primer'},""")
once("""  custom:    {label:'Custom / other',            laborRate:75, matRate:25, cov:300, matLabel:'Paint'},""",
     """  custom:    {label:'Custom / other',            laborRate:50, matRate:25, cov:300, matLabel:'Paint'},""")
once("""cov:350,laborRate:75,matRate:25,chargeRate:150,mult:'type'});
  renderPtZones();""", """cov:350,laborRate:50,matRate:25,chargeRate:150,mult:'type'});
  renderPtZones();""")
open(p, 'w', encoding='utf-8').write(t)
print('PAINT50: patched', p)
