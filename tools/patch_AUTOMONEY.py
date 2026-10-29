#!/usr/bin/env python3
"""Idempotent patch AUTOMONEY (owner 10/29): deposit before scheduling, sub lien waivers by job type, job profit alerts.

1. ⚡ Automations (patch JA): two new per-job-type switches in the CRM's option table — 💰 Deposit before scheduling
   (depositGate) and 📝 Sub lien waivers required (subLien) — the same table as netlify/functions/_lib/job-auto.js;
   All on / All off leave them alone (NOT_ALL).
2. tools/automoney_tail.js as <script id="gc-patch-automoney">, right after the sub lien waivers script (gc-patch-auto-lien),
   with netlify/functions/_lib/money-core.js embedded as is (the server runs the same text).

Every find-string must occur exactly once. Usage: python3 tools/patch_AUTOMONEY.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'automoney_tail.js'), encoding='utf-8').read().rstrip('\n')
CORE = open(os.path.join(HERE, '..', 'netlify', 'functions', '_lib', 'money-core.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_AUTOMONEY__'
if MARK in src:
    print('already patched'); sys.exit(0)

# 1 · the JA option table (client copy)
old_opt = ("  ['equipment', 'internal', '🚛 Dumpster & equipment tracker', 'Track dumpsters and rentals on this job: rental days, swap / pick-up reminders, cost to the job.', false]   /* patch AUTO8 */\n"
           "];")
assert src.count(old_opt) == 1, ('JA OPTS anchor', src.count(old_opt))
new_opt = ("  ['equipment', 'internal', '🚛 Dumpster & equipment tracker', 'Track dumpsters and rentals on this job: rental days, swap / pick-up reminders, cost to the job.', false],   /* patch AUTO8 */\n"
           "  ['depositGate', 'internal', '💰 Deposit before scheduling', 'No crew / sub days on the schedule until the deposit is paid. The PM (or an admin) can schedule anyway with a reason — the office and the admins get a note.', { residential: true, other: false }],   /* patch AUTOMONEY */\n"
           "  ['subLien', 'internal', '📝 Sub lien waivers required', 'Each sub signs a lien waiver (Sub Portal) before their check is written; the office can mark one received on paper.', { commercial: true, other: false }]   /* patch AUTOMONEY */\n"
           "];")
src = src.replace(old_opt, new_opt)
old_na = "var NOT_ALL = { showCarrier: 1, apptAuto: 1 };"
assert src.count(old_na) == 1, ('NOT_ALL', src.count(old_na))
src = src.replace(old_na, "var NOT_ALL = { showCarrier: 1, apptAuto: 1, depositGate: 1, subLien: 1 };   /* patch AUTOMONEY: money rules, not automations */")

# 2 · the tail, with the shared core
assert TAIL.count('/*@@MONEY_CORE@@*/') == 1
assert CORE.startswith('/* MONEY-CORE-START') and CORE.endswith('/* MONEY-CORE-END */')
body = TAIL.replace('/*@@MONEY_CORE@@*/', CORE)
assert '</script>' not in body
anchor = '<script id="gc-patch-auto-digest">'
assert src.count(anchor) == 1, ('anchor', src.count(anchor))
assert src.count('<script id="gc-patch-auto-lien">') == 1
assert src.index('<script id="gc-patch-auto-lien">') < src.index(anchor)
src = src.replace(anchor, '<script id="gc-patch-automoney">\n' + body + '\n</script>\n' + anchor)
assert src.count(MARK) >= 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
