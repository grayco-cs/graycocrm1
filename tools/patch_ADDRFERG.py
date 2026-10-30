#!/usr/bin/env python3
"""Idempotent patch ADDRFERG (owner 10/29: "address for GrayCo is now 5796 Ferguson Road, Bartlett 38134"): every
built-in company address (the Broadway Rd defaults, the 38135 company zip, the office map pin) becomes
5796 Ferguson Rd, Bartlett, TN 38134. Job / customer addresses that happen to be in 38135 are not touched."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
NEW = '5796 Ferguson Rd, Bartlett, TN 38134'
if "/* patch ADDRFERG */" in t: print('ADDRFERG: already patched'); sys.exit(0)
n0 = len(t)
for old in ['4007 Broadway Rd, Bartlett, TN 38135', '4014 Broadway Rd, Bartlett, TN 38135']:
    t = t.replace(old, NEW)
def once(old, new):
    global t
    c = t.count(old); assert c == 1, ('ADDRFERG anchor', c, old[:80]); t = t.replace(old, new)
def every(old, new, want):
    global t
    c = t.count(old); assert c == want, ('ADDRFERG count', c, want, old[:80]); t = t.replace(old, new)
once('"\\nBartlett, TN 38135\\n\\n"', '"\\nBartlett, TN 38134\\n\\n"')
once("city: 'Bartlett', state: 'TN', zip: '38135', get address()", "city: 'Bartlett', state: 'TN', zip: '38134', get address()")
every('at the mailing address shown at the top of this Agreement (Bartlett, TN 38135)', 'at the mailing address shown at the top of this Agreement (Bartlett, TN 38134)', 3)
once("var OFFICE_FALLBACK = { lat: 35.2046, lng: -89.8668,", "var OFFICE_FALLBACK = { lat: 35.2010, lng: -89.8703,")
t = t.replace('(we are on Broadway Rd in Bartlett)', '(we are on Ferguson Rd in Bartlett)')
t = t.replace('/GrayCo Construction|Broadway|Bartlett|', '/GrayCo Construction|Broadway|Ferguson|Bartlett|')
t = t.replace('/Construction Services|Broadway|Bartlett|', '/Construction Services|Broadway|Ferguson|Bartlett|')
t = t.replace('<script id="gc-addr2-early">', '<script id="gc-addr2-early">/* patch ADDRFERG */', 1)
assert 'Broadway Rd, Bartlett' not in t, 'a Broadway company address is left'
open(p, 'w', encoding='utf-8').write(t); print('ADDRFERG: patched')
