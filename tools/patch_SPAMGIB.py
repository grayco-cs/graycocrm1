#!/usr/bin/env python3
"""Idempotent patch SPAMGIB (index.html) — owner 11/02: a "NEW LEAD: IOwirBRUMGvsiaemuM … aElwvnTekCEguDEsBXoSmdl
Project location: Peuhzbszn" text ("Seems like a lead that should've never reached me").
The server holds a bot's random-letter form in 🧹 Sales & spam (netlify/functions/_lib/salesguard.js sgBotWhy). The page:
  1. the detector block (RULES-BEGIN … RULES-END) is refreshed VERBATIM from _lib/salesguard.js (it now carries sgBotWhy);
  2. the lead drawer line (🚫 Block sender) shows "🤖 Looks like a bot (random text)" on a lead that already came in, and
     its button reads "🚫 Not a real lead — block sender".
Every anchor must occur exactly once; a re-run prints "already patched".
Usage: python3 tools/patch_SPAMGIB.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(path, encoding='utf-8').read()
MARK = '/* patch SPAMGIB */'

lib = open(os.path.join(HERE, '..', 'netlify', 'functions', '_lib', 'salesguard.js'), encoding='utf-8').read()
def block(t, what):
    a, b = t.find('/* RULES-BEGIN'), t.find('/* RULES-END */')
    assert a >= 0 and b > a and t.count('/* RULES-BEGIN') == 1 and t.count('/* RULES-END */') == 1, ('rules block markers', what)
    return a, b + len('/* RULES-END */')
la, lb = block(lib, 'salesguard.js')
rules = lib[la:lb]
assert 'function sgBotWhy(' in rules and '</script' not in rules.lower(), 'the bot detector is in the rules block'

if MARK in src:
    pa, pb = block(src, path)
    if src[pa:pb] == rules: print('already patched'); sys.exit(0)
    src = src[:pa] + rules + src[pb:]   # the rules changed since: refresh the copy
    open(path, 'w', encoding='utf-8').write(src); print('patched', path, '(rules refreshed)'); sys.exit(0)

assert src.count('__GC_PATCH_SALESBLOCK__') >= 1, 'patch SALESBLOCK first'
pa, pb = block(src, path)
src = src[:pa] + rules + src[pb:]

DRAWER = [
    ("  var why = sgWhy(leadText(l), { email: email, company: s((l.said || {}).company) });\n",
     "  var why = sgWhy(leadText(l), { email: email, company: s((l.said || {}).company) });\n"
     "  " + MARK + " var bot = sgBotWhy({ name: s(l.contactName || (l.contact && l.contact.name) || l.name), message: leadText(l), location: [l.address, l.city, l.state].filter(Boolean).join(', '), company: s(l.company || (l.said || {}).company || (l.leadExtra && l.leadExtra.company)), email: email });\n"),
    ("el.innerHTML = (why ? '<span class=\"gcsb-chip\" title=\"' + esc(why) + '\">🧹 Looks like a sales pitch</span>' : '') + '<button type=\"button\" class=\"gcsb-btn stop\" data-gcsb-lead=\"1\">🚫 Block sender</button>",
     "el.innerHTML = (bot ? '<span class=\"gcsb-chip\" title=\"' + esc(bot) + '\">🤖 Looks like a bot (random text)</span>' : why ? '<span class=\"gcsb-chip\" title=\"' + esc(why) + '\">🧹 Looks like a sales pitch</span>' : '') + '<button type=\"button\" class=\"gcsb-btn stop\" data-gcsb-lead=\"1\">' + (bot ? '🚫 Not a real lead — block sender' : '🚫 Block sender') + '</button>"),
]
for old, new in DRAWER:
    assert src.count(old) == 1, ('drawer anchor count', old[:70], src.count(old))
    src = src.replace(old, new)
assert src.count(MARK) == 1 and src.count('function sgBotWhy(') == 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
