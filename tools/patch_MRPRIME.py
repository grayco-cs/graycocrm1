#!/usr/bin/env python3
"""patch MRPRIME (owner 11/9: "all mrplanroom is bids as a prime"): Memphis Reprographics' plan room (mrplanroom.com) and its
"Public projects out for bid" e-mails (memphisreprographics.com) are PRIME bids — checked before the "a plan room → sub" rule.
Changed in _lib/bid-role.js AND its word-for-word copy in index.html (patch PRIMESUB inlines it)."""
import sys
a = """  if (SUB_SRC.test(st)) return out('sub', 'came from ' + srcName(x) + ' (a plan room / GC)');"""
b = """  /* MRPRIME (owner 11/9): Memphis Reprographics' plan room / e-mails are public projects GrayCo bids as the prime */
  var mrHosts = arr(x.plansLinks).map(function(l){ return l ? (low(l.host) || hostOf(l.url)) : ''; }), mrFrom = domOf(x.fromEmail || x.from || (x.contact && x.contact.email) || (arr(x.emails)[0] || {}).from);
  if (/mr\\s*plan\\s*room|mrplanroom|memphis\\s*reprographics/i.test(st) || /(^|\\.)(mrplanroom|memphisreprographics)\\.com$/.test(mrFrom) || mrHosts.some(function(h){ return /(^|\\.)mrplanroom\\.com$/.test(h); })) return out('prime', 'Memphis Reprographics plan room — public projects, bid as the prime');
  if (SUB_SRC.test(st)) return out('sub', 'came from ' + srcName(x) + ' (a plan room / GC)');"""
for P in ['netlify/functions/_lib/bid-role.js', 'index.html']:
    src = open(P, encoding='utf-8').read()
    if 'MRPRIME' in src: print(P, 'already patched'); continue
    assert src.count(a) == 1, (P, src.count(a)); open(P, 'w', encoding='utf-8').write(src.replace(a, b)); print(P, 'patched')
