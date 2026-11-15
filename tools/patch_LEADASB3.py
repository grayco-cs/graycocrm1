#!/usr/bin/env python3
"""patch LEADASB3 (owner's 11/15 list, item 2): LEADSTART (no start without Lead 01), LEADALERT (7 days before start, day 20 / 28
after completion), LEADCERT90 (Company documents: EPA RRP firm + certified renovators, reminders from 90 days out), LEADSEND
(👁 Filled in / 📤 Send on the ☣️ card). The CRM block is tools/leadasb3_tail.js. Idempotent.
Usage: python3 tools/patch_LEADASB3.py [repo-root]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
R = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(here)
def edit(fn, pairs):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read(); n0 = src
    for o, n, mark in pairs:
        if mark in src: continue
        assert src.count(o) == 1, (fn, src.count(o), o[:80]); src = src.replace(o, n)
    if src != n0: open(p, 'w', encoding='utf-8').write(src)
    return src
SLOTS = ("  /* LEADCERT90 (owner 11/15): the EPA lead-safe firm certificate and the certified renovators — reminders from 90 days out */\n"
         "  slot({ id: 'epa_rrp_firm', folder: 'licenses', title: 'EPA RRP Lead-Safe Certified Firm', desc: 'EPA lead-safe firm certificate (TN & AR). Upload it with its expiry date — reminders start 90 days before (EPA asks for the renewal about 90 days ahead).', kind: 'license', expiry: true, warn: 90, access: 'all', shareGc: true });\n"
         "  slot({ id: 'rrp_renovator_1', folder: 'licenses', title: 'EPA RRP Certified Renovator — 1', desc: 'A certified renovator\\'s course certificate (the name is on it). Every lead-safe job needs one on the job. Reminders start 90 days before it runs out.', kind: 'license', expiry: true, warn: 90, access: 'all', shareGc: false });\n"
         "  slot({ id: 'rrp_renovator_2', folder: 'licenses', title: 'EPA RRP Certified Renovator — 2', desc: 'A second certified renovator, if you have one. Reminders start 90 days before it runs out.', kind: 'license', expiry: true, warn: 90, access: 'all', shareGc: false });\n")
A_LICS = "  LICS.forEach(function(l){ slot({ id: l[0], folder: 'licenses',"
def cd_pairs(src):
    i = src.index(A_LICS); j = src.index('\n', i) + 1
    line = src[i:j]
    return [(line, line + SLOTS, 'LEADCERT90 (owner 11/15)'),
            ("  if (n <= 30) return { k: 'warn', t: 'Expires in ' + n + ' day' + (n === 1 ? '' : 's') };",
             "  if (n <= (+e.warn || 30)) return { k: 'warn', t: 'Expires in ' + n + ' day' + (n === 1 ? '' : 's') };   /* LEADCERT90 */", "(+e.warn || 30)) return { k: 'warn'"),
            ("days(d.expires) <= 30 ? bd('warn'", "days(d.expires) <= ((entry(d.slot) || {}).warn || 30) ? bd('warn'", "((entry(d.slot) || {}).warn || 30)")]
for fn in ['index.html', 'tools/companydocs.js']:
    src = open(os.path.join(R, fn), encoding='utf-8').read()
    edit(fn, cd_pairs(src))
edit('netlify/functions/_lib/gcp.js', [(
    "    const step = days < 0 ? 'expired' : days <= 7 ? '7d' : days <= 30 ? '30d' : '';   /* owner 11/10: COIs and licenses only need the 30-day warning */",
    "    const step = days < 0 ? 'expired' : days <= 7 ? '7d' : days <= 30 ? '30d' : (days <= 90 && /^(epa_rrp_firm|rrp_renovator_\\d+)$/.test(s(d.slot))) ? '90d' : '';   /* owner 11/10: COIs and licenses only need the 30-day warning; LEADCERT90 (11/15): the EPA firm + renovators from 90 days */",
    'LEADCERT90 (11/15)')])
# the CRM block
P = os.path.join(R, 'index.html'); TAG = '<script id="gc-patch-leadasb3">'
js = open(os.path.join(here, 'leadasb3_tail.js'), encoding='utf-8').read(); assert '</script' not in js.lower()
src = open(P, encoding='utf-8').read()
if TAG in src:
    i = src.index(TAG) + len(TAG); j = src.index('</script>', i); src = src[:i] + '\n' + js + src[j:]
else:
    src = src.rstrip('\n') + '\n' + TAG + '\n' + js + '</script>\n'
open(P, 'w', encoding='utf-8').write(src); print('LEADASB3 applied')
