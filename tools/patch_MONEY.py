#!/usr/bin/env python3
"""Idempotent patch MONEY (owner 10/30): e-mailed money in by itself, card statements, job matching, marketing spend.

1. tools/money_tail.js goes in as <script id="gc-patch-money"> right AFTER gc-patch-ownertodo (before gc-patch-approrder);
2. patch OWNERTODO reads the e-mailed invoices / receipts through window._gcMoneyMailFetch (bid-inbox ?moneymail=1 — the office
   cannot read the admin-only gc_kv "gc_mail_money") and marks one done through window._gcMoneyDone;
3. patch SUBINV's markDone uses window._gcMoneyDone too;
4. 📣 Marketing's numbers take the ad spend from Expenses / card charges as well (window._gcMoneyMkSpend: typed-in spend wins);
5. 💎 hub: "💳 Import card statement" and "📥 Needs a job" next to 🔗 Match to Jobs.
Every find-string must occur exactly once. Usage: python3 tools/patch_MONEY.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'money_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_MONEY__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '</script>' not in TAIL
EDITS = [
  ('<script id="gc-patch-approrder">', '<script id="gc-patch-money">\n' + TAIL + '\n</script>\n<script id="gc-patch-approrder">'),
  ("return Promise.all([kvGet('gc_mail_money'), kvGet('gc_mail_money_done')]).then(function(r){",
   "return (W._gcMoneyMailFetch ? W._gcMoneyMailFetch(kvGet) : Promise.all([kvGet('gc_mail_money'), kvGet('gc_mail_money_done')])).then(function(r){   /* patch MONEY: the office reads it through bid-inbox */"),
  ("function mapWrite(key, id, val){\n  return kvGet(key)",
   "function mapWrite(key, id, val){\n  if (key === 'gc_mail_money_done' && W._gcMoneyDone) return W._gcMoneyDone(id, val);   /* patch MONEY: the office cannot write the admin-only key */\n  return kvGet(key)"),
  ("  S.done[id] = val;\n  return kvGet('gc_mail_money_done')",
   "  S.done[id] = val;\n  if (W._gcMoneyDone) return W._gcMoneyDone(id, val);   /* patch MONEY */\n  return kvGet('gc_mail_money_done')"),
  ("spend: MK.all('spend'), srcfix: srcfixMap()",
   "spend: (window._gcMoneyMkSpend ? window._gcMoneyMkSpend(MK.all('spend')) : MK.all('spend')), srcfix: srcfixMap()"),
  ('{ icon: "🔗", label: "Match to Jobs", fn: function(){ window._gcOpenMatchToJobs && window._gcOpenMatchToJobs(); } },',
   '{ icon: "🔗", label: "Match to Jobs", fn: function(){ window._gcOpenMatchToJobs && window._gcOpenMatchToJobs(); } },\n'
   '        { icon: "💳", label: "Import card statement", fn: function(){ window._gcOpenCardImport && window._gcOpenCardImport(); } },\n'
   '        { icon: "📥", label: "Needs a job", fn: function(){ window._gcOpenNeedsJob && window._gcOpenNeedsJob(); } },'),
  ('"Match to Jobs": "Money & Invoices",', '"Match to Jobs": "Money & Invoices", "Import card statement": "Money & Invoices", "Needs a job": "Money & Invoices",'),
]
for a, b in EDITS:
    assert src.count(a) == 1, ('find-string count != 1', a[:80], src.count(a))
    src = src.replace(a, b)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
