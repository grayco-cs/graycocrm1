#!/usr/bin/env python3
"""Idempotent patch LFQUIET: the red "N Lead Inbox items are on a lead that is not theirs ... _gcLeadFixRepair in the
console" message showed on every page load. Now it says it in plain words, at most once a day per computer (and again
only when the list changes); the console line and _gcLeadInboxClash stay. Usage: python3 tools/patch_LFQUIET.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch LFQUIET'
if MARK in t: print('LFQUIET: already patched'); sys.exit(0)
old = """  if (isAdmin()) toast('⚠ ' + LF_CLASH.length + ' Lead Inbox item' + (LF_CLASH.length === 1 ? ' is' : 's are') + ' on a lead that is not theirs — left alone. Admin: _gcLeadFixRepair({dryRun:true}) in the console', true);"""
new = """  """ + MARK + """: plain words, once a day per computer (or when the list changes) */
  var _lq = null; try { _lq = JSON.parse(localStorage.getItem('gc_lf_told') || 'null'); } catch (e) {}
  if (_lq && _lq.sig === sig && Date.now() - (_lq.at || 0) < 864e5) return;
  try { localStorage.setItem('gc_lf_told', JSON.stringify({ sig: sig, at: Date.now() })); } catch (e) {}
  if (isAdmin()) toast('⚠ ' + LF_CLASH.length + ' bid e-mail' + (LF_CLASH.length === 1 ? ' is' : 's are') + ' attached to the wrong lead. Those leads are protected (not changed) until the lead repair is run.', true);"""
assert t.count(old) == 1, ('LFQUIET anchor', t.count(old))
t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('LFQUIET: patched', p)
