#!/usr/bin/env python3
"""Idempotent patch MKTFIX5 (Marketing audit): the customer's OK for marketing photos, and two silent buttons.

    python3 tools/patch_MKTFIX5.py [index.html]

  1. 🗞 Neighborhood flyers / 🎬 Reel kit: "The customer said OK to use photos of this job in marketing" is a box the
     office / an admin ticks. For the Marketing Manager it shows the answer but cannot be changed (a job he ticked
     himself opened that job's photos to him; the server ignores his change too — netlify/functions/_lib/mm.js).
  2. ⚙️ Focus & approvals: "Back to the default (60 / 20 / 12 / 8)" and "Back to restoration 100%" said nothing —
     they say "Back to the default." (or that it already is).
Every find-string must match exactly once; a file that already carries the marker is left alone.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = 'patch MKTFIX5'
if MARK in t:
    print('MKTFIX5: already patched'); sys.exit(0)
LOCK = " + (W._gcMMData ? ' disabled title=\"The office records the customer\\'s OK\"' : '') + '"
R = []
R.append(("""<input type="checkbox" id="fl-perm"' + (pOk ? ' checked' : '') + ' data-a="fl-perm">""",
"""<input type="checkbox" id="fl-perm"' + (pOk ? ' checked' : '')""" + LOCK + """ data-a="fl-perm">"""))
R.append(("""ACT['fl-perm'] = function(b){ if (!FL.form.pid) return;""",
"""ACT['fl-perm'] = function(b){ if (!FL.form.pid || W._gcMMData) return;   /* patch MKTFIX5: the office records the customer's OK */"""))
R.append(("""<input type="checkbox" data-a="rl-perm"' + (ok ? ' checked' : '') + '>""",
"""<input type="checkbox" data-a="rl-perm"' + (ok ? ' checked' : '')""" + LOCK + """>"""))
R.append(("""ACT['rl-perm'] = function(b){ setPerm(RL.pid, b.checked); nST(draw, 200); };""",
"""ACT['rl-perm'] = function(b){ if (W._gcMMData) return; setPerm(RL.pid, b.checked); nST(draw, 200); };"""))
R.append(("""ACT['adsfocus-reset'] = function(){ X.setCfg({ adsFocus: Object.assign({}, SC.ADS_FOCUS) }); draw(); };""",
"""ACT['adsfocus-reset'] = function(){ var was = JSON.stringify(SC.adsFocusOf ? SC.adsFocusOf(cfg().adsFocus) : cfg().adsFocus); X.setCfg({ adsFocus: Object.assign({}, SC.ADS_FOCUS) }); draw(); toast(was === JSON.stringify(SC.adsFocusOf ? SC.adsFocusOf(SC.ADS_FOCUS) : SC.ADS_FOCUS) ? 'It already is the default (restoration 100%).' : 'Back to the default: restoration 100%.'); };   /* patch MKTFIX5 */"""))
R.append(("""ACT['focus-reset'] = function(){ X.setCfg({ socFocus: Object.assign({}, SC.FOCUS) }); draw(); };""",
"""ACT['focus-reset'] = function(){ var was = JSON.stringify(SC.focusOf ? SC.focusOf(cfg().socFocus) : cfg().socFocus); X.setCfg({ socFocus: Object.assign({}, SC.FOCUS) }); draw(); toast(was === JSON.stringify(SC.focusOf ? SC.focusOf(SC.FOCUS) : SC.FOCUS) ? 'It already is the default (60 / 20 / 12 / 8).' : 'Back to the default: 60 / 20 / 12 / 8.'); };   /* patch MKTFIX5 */"""))
for old, new in R:
    n = t.count(old)
    assert n == 1, (n, old[:90])
    t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('MKTFIX5: patched')
