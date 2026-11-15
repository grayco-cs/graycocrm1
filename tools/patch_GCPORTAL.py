#!/usr/bin/env python3
"""patch GCPORTAL — the CRM side of the GC-client portal variant (owner 11/03: "this is A&B and this is commercial … this is
also a sub, so we won't offer maintenance for jobs we're working for big GCs. Make this portal template different for when
we're subbing for a big GC.").

The job's Customer portal card → More: "Portal style: Automatic / Homeowner / GC (we're the sub)" (job.portalStyle '' |
'home' | 'gc'). Automatic = the server's rule (netlify/functions/portal.js portalStyle: a GC job / the client is a GC
account / we bid it as the sub (PRIMESUB) / a commercial job for a contractor). Nothing is sent.
Idempotent: run it again and nothing changes. Usage: python3 tools/patch_GCPORTAL.py [index.html]"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'index.html')
t = open(path, encoding='utf-8').read()
MARK = 'patch GCPORTAL'
if MARK in t:
    print('GCPORTAL: already patched'); sys.exit(0)
A = """  h += '<label style="display:flex;align-items:center;gap:8px">Stage the customer sees <select data-q="stage" """
A2 = """  h += '<label style="display:flex;align-items:center;gap:8px" title="Automatic: a GC job, a GC client account or a bid we made as the sub gets the GC style (no maintenance plans, My home, referral or review asks; commercial sub stages)">Portal style <select data-q="pstyle" style="flex:1;min-height:36px;border-radius:8px;border:1px solid #C9C2B2;font-size:14px">' +   /* patch GCPORTAL */
    [['', 'Automatic'], ['home', 'Homeowner'], ['gc', 'GC (we\\u2019re the sub)']].map(function(o){ return '<option value="' + o[0] + '"' + (String(p.portalStyle || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
""" + A
B = """    if (q === 'stage') saveProject(pid, function(x){ x.portalStage = t.value === 'auto' ? '' : Number(t.value); })"""
B2 = """    if (q === 'pstyle') saveProject(pid, function(x){ x.portalStyle = t.value === 'gc' || t.value === 'home' ? t.value : ''; }).then(function(){ toast('Portal style: ' + (t.value === 'gc' ? 'GC (we\\u2019re the sub)' : t.value === 'home' ? 'Homeowner' : 'Automatic')); });   /* patch GCPORTAL */
""" + B
for old, new in ((A, A2), (B, B2)):
    if t.count(old) != 1:
        print('GCPORTAL: anchor found %d times: %s' % (t.count(old), old[:80])); sys.exit(1)
    t = t.replace(old, new)
open(path, 'w', encoding='utf-8').write(t)
print('GCPORTAL: applied')
