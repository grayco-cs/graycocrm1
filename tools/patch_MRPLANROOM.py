#!/usr/bin/env python3
"""patch MRPLANROOM (owner 11/9: "mrplanroom.com/projects/public — I want these jobs in my CRM"): Memphis Reprographics' public plan
room (the same planroom software as RKA's — parseRka reads it) joins the morning bid watch. Its "company" is the architect / owner
(Allen & Hoshall, A2H, Memphis Housing Authority…), so it goes in the lead's owner, not the GC (source.companyIs = 'owner').
Plain reader, no AI (robots.txt: Content-Signal ai-input=no; "User-agent: *" allows reading)."""
import sys
P = 'netlify/functions/bid-watch.js'
src = open(P, encoding='utf-8').read()
if '/*MRPLANROOM*/' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) == 1, (src.count(a), a[:70]); src = src.replace(a, b)
rep("""  /*RKAROOM*/ { id: 'rka-planroom',""", """  /*MRPLANROOM*/ { id: 'mr-planroom', name: 'Memphis Reprographics — public plan room (mrplanroom.com)', label: 'MR plan room', owner: '', city: '', state: '', type: 'commercial',
    auto: true, kind: 'rka', companyIs: 'owner', url: 'https://www.mrplanroom.com/projects/public', noAi: true },
  /*RKAROOM*/ { id: 'rka-planroom',""")
rep("""    owner: src.owner || '', gc: it.gc || '', address: '',""", """    owner: (src.companyIs === 'owner' ? it.gc : '') || src.owner || '', gc: src.companyIs === 'owner' ? '' : (it.gc || ''), address: '',""")
open(P, 'w', encoding='utf-8').write(src); print('patched')
