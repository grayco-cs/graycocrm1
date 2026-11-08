#!/usr/bin/env python3
"""patch LSACHECK: Google LSA leads — the PM marks Good / Bad on the 📥 New lead card, the owner decides on ✅ Approvals,
a bad one becomes a "Dispute in Google Ads by <date>" To-Do (the CRM never touches Ads). Appends tools/lsacheck_tail.js,
adds the approvals / To-Do kinds, and the e-mail intake marks LSA leads lsaCheck 'pending'."""
import sys, os
R = sys.argv[1] if len(sys.argv) > 1 else '.'
P = os.path.join(R, 'index.html'); src = open(P, encoding='utf-8').read()
if '__GC_PATCH_LSACHECK__' not in src:
    def rep(o, n):
        global src
        assert src.count(o) == 1, o[:60]; src = src.replace(o, n)
    rep("  if (t.kind === 'paid_before') return 'money';   /* PAIDBEFORE */", "  if (t.kind === 'paid_before') return 'money';   /* PAIDBEFORE */\n  if (t.kind === 'lsa_check') return 'appr';   /* LSACHECK */\n  if (t.kind === 'lsa_dispute') return 'leads';")
    rep("      else if (t.kind === 'paid_before') o.act = { l: '✓ Review & mark paid', f: function(){ call('_gcPaidBeforeSheet'); } };   /* PAIDBEFORE */",
        "      else if (t.kind === 'paid_before') o.act = { l: '✓ Review & mark paid', f: function(){ call('_gcPaidBeforeSheet'); } };   /* PAIDBEFORE */\n      else if (t.kind === 'lsa_check') o.act = { l: '🔎 Decide', f: function(){ call('_gcLsaDecide', id); } };   /* LSACHECK */")
    tail = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lsacheck_tail.js'), encoding='utf-8').read()
    src = src.rstrip('\n') + '\n' + tail
    open(P, 'w', encoding='utf-8').write(src); print('index.html patched')
else: print('index.html already patched')
F = os.path.join(R, 'netlify/functions/website-intake.js'); w = open(F, encoding='utf-8').read()
o = "leadExtra: lsa ? { mkSource: 'Google Ads', leadSource: 'Google LSA' } : undefined"
if 'LSACHECK' not in w:
    assert w.count(o) == 1
    w = w.replace(o, "leadExtra: lsa ? { mkSource: 'Google Ads', leadSource: 'Google LSA', lsaCheck: 'pending' } : undefined /* LSACHECK */")
    open(F, 'w', encoding='utf-8').write(w); print('website-intake.js patched')
else: print('website-intake.js already patched')
