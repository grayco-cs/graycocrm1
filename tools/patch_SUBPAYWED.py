#!/usr/bin/env python3
"""patch SUBPAYWED (owner 11/4: "sub invoices are due by wednesday to be paid that friday, if its after wednesday then its
paid the following friday"). The CRM paid a week later (cut-off Wednesday → the Friday of the FOLLOWING week). Now:
in by Wednesday 11:59 PM Central → that Friday; Thursday–Sunday → the next Friday. The page's check-run rule
(weeksAfter 0), the sub-invoice server (_lib/subinv.js), the help text and the templates for NEW agreements / scope
letters / sub info say the same. Agreements subs already signed are stored copies and keep their wording.
Sub bills that already have a pay date keep it (nothing is moved earlier by itself)."""
import sys, os, re
R = sys.argv[1] if len(sys.argv) > 1 else '.'
def edit(fn, pairs, mark, allow_multi=()):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read()
    if mark in src: print(fn, 'already patched'); return
    for o, n in pairs:
        c = src.count(o)
        assert c >= 1 and (c == 1 or o in allow_multi), (fn, c, o[:70])
        src = src.replace(o, n)
    open(p, 'w', encoding='utf-8').write(src); print(fn, 'patched')
T = [
 ('paid the Friday of the following week; later invoices the Friday after that', 'paid that Friday; later invoices the following Friday'),
 ('are paid the Friday of the following week; later invoices the Friday after that', 'are paid that Friday; later invoices the following Friday'),
 ('is paid the <b>Friday of the following week</b>', 'is paid <b>that Friday</b>'),
 ('is paid the Friday of the following week', 'is paid that Friday'),
 ('in by Wednesday: paid the Friday of the following week', 'in by Wednesday: paid that Friday'),
 ('Friday after next', 'following Friday'),
]
p = os.path.join(R, 'index.html'); src = open(p, encoding='utf-8').read()
if '/*SUBPAYWED*/' not in src:
    def one(o, n):
        global src
        assert src.count(o) == 1, (src.count(o), o[:60]); src = src.replace(o, n)
    one("var d={ cutoffDay:3, payDay:5, weeksAfter:1, requireApproval:true, requireCompliance:true };", "var d={ cutoffDay:3, payDay:5, weeksAfter:0, requireApproval:true, requireCompliance:true };/*SUBPAYWED*/")
    one("var CUT=3, PAY=5, WEEKS_AFTER=1;      // Wednesday, Friday, one week later", "var CUT=3, PAY=5, WEEKS_AFTER=0;      // Wednesday, that Friday (owner 11/4, patch SUBPAYWED)")
    one("rule: made ? 'in by Wed '+iso(cut).slice(5)+', pays the following Friday'", "rule: made ? 'in by Wed '+iso(cut).slice(5)+', paid that Friday'")
    n = 0
    for o, nw in T:
        n += src.count(o); src = src.replace(o, nw)
    print('index.html text fixes:', n)
    open(p, 'w', encoding='utf-8').write(src); print('index.html patched')
else: print('index.html already patched')
edit('netlify/functions/_lib/subinv.js', [
 ("  const pay = addDays(cut, 2 + 7);\n  return { cutoff: cut, payDate: pay, made: made, rule: made ? 'in by Wednesday ' + cut + ' → paid the Friday of the following week, ' + pay",
  "  const pay = addDays(cut, 2);   /* SUBPAYWED: that Friday (owner 11/4) */\n  return { cutoff: cut, payDate: pay, made: made, rule: made ? 'in by Wednesday ' + cut + ' → paid that Friday, ' + pay"),
 ("in by Wednesday (Central) → paid the Friday of the following week; later → the", "in by Wednesday (Central) → paid that Friday; later → the"),
], 'SUBPAYWED')

# part 2: the other wordings of the old rule (help, agreements for NEW subs, sub info, check-run note)
for fn in ('index.html', 'netlify/functions/_lib/subinv.js'):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read(); before = src
    src = src.replace('paid on the <b>Friday of the following week</b>', 'paid on <b>that Friday</b>')
    src = src.replace('the Friday of the following week', 'that Friday')
    src = src.replace('Friday of the following week', 'that Friday')
    src = src.replace('the Friday after that', 'the following Friday')
    src = src.replace('Friday after that', 'following Friday')
    if src != before: open(p, 'w', encoding='utf-8').write(src); print(fn, 'part 2 wording fixed')
