#!/usr/bin/env python3
"""Idempotent adapter R17ADAPT_MKTFIX1 (release r17): lets patch MKTFIX1 (claude/mktaudit, built on r16) apply after
patch OFFICEFULL (claude/officefull).

Both patches edit the same line of the sign-in layer's staff check (the Marketing Manager / role line):
  r16:        S.role = ...; S.marketing = mkt; S.roleKnown = true; store(S);
  OFFICEFULL: S.role = ...; S.marketing = mkt; S.profile = low(row.profile || ''); S.roleKnown = true; store(S);   /* patch OFFICEFULL: the profile too */
  MKTFIX1 looks for the r16 line and adds "if (mkt) S.mmName = ..." before store(S).
This adapter moves OFFICEFULL's S.profile assignment onto its own line just before, so the r16 line is back as it was and
MKTFIX1 finds it. Same behaviour: S.profile is still set before store(S) (nothing between reads it).
Run after OFFICEFULL, before MKTFIX1. Usage: python3 tools/patch_R17ADAPT_MKTFIX1.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch R17ADAPT_MKTFIX1'
if MARK in t:
    print('R17ADAPT_MKTFIX1: already patched'); sys.exit(0)
assert 'patch MKTFIX1' not in t, 'R17ADAPT_MKTFIX1 runs before MKTFIX1'
old = ("      S.role = mkt ? 'marketing' : low(row.role || 'staff'); S.marketing = mkt; S.profile = low(row.profile || ''); "
       "S.roleKnown = true; store(S);   /* patch OFFICEFULL: the profile too */\n")
new = ("      S.profile = low(row.profile || '');   /* patch OFFICEFULL: the profile too */ " + MARK + ": own line, so MKTFIX1 finds the r16 line */\n"
       "      S.role = mkt ? 'marketing' : low(row.role || 'staff'); S.marketing = mkt; S.roleKnown = true; store(S);\n")
n = t.count(old)
assert n == 1, ('R17ADAPT_MKTFIX1 anchor', n)
t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('R17ADAPT_MKTFIX1: patched', p)
