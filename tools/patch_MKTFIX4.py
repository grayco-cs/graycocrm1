#!/usr/bin/env python3
"""Idempotent patch MKTFIX4 (Marketing audit, the click-every-button run): buttons that did nothing or answered in
words meant for someone else.

    python3 tools/patch_MKTFIX4.py [index.html]

  1. 🎃 Events & community: "+ Add an event", "Open" and "Save" did nothing for anyone — 🏠 Free roof check events
     (patch MKT2) reused the same three button names and took them over. Each now does its own section's job.
  2. 🎁 Referral program (admins / the office): "Look up" with an empty box answered "Method not allowed", and
     "Add member" with no name "Please add your name." — they ask for the last 4 / the member's name.
  3. 🎟 Coupons (the Marketing Manager): no "Redeem ($100 off)" button (the office redeems on the job; the server
     refuses him) — "Check" stays.
  4. 🖨 Print pack (the Marketing Manager): "✉️ E-mail link" opens his own e-mail app; the CRM's e-mail window
     sends through a staff function that refuses him.
Every find-string must match exactly once; a file that already carries the marker is left alone.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = 'patch MKTFIX4'
if MARK in t:
    print('MKTFIX4: already patched'); sys.exit(0)
R = []
# 1. events: the two sections' buttons
R.append(("""ACT['ev-new'] = function(){ EV.form = evForm('roofcheck'); draw(); };""",
"""var MKEV = { n: ACT['ev-new'], e: ACT['ev-edit'], s: ACT['ev-save'] };   /* patch MKTFIX4: 🎃 Events & community keeps its own buttons */
ACT['ev-new'] = function(b){ if (UI.sec !== 'events2' && MKEV.n) return MKEV.n(b); EV.form = evForm('roofcheck'); draw(); };"""))
R.append(("""ACT['ev-edit'] = function(b){ var e = MK.get('roofevents', b.getAttribute('data-id')); if (!e) return; EV.form""",
"""ACT['ev-edit'] = function(b){ if (UI.sec !== 'events2' && MKEV.e) return MKEV.e(b); var e = MK.get('roofevents', b.getAttribute('data-id')); if (!e) return; EV.form"""))
R.append(("""ACT['ev-save'] = function(){
  var f = EV.form, g = function(k){""",
"""ACT['ev-save'] = function(b){
  if (UI.sec !== 'events2' && MKEV.s) return MKEV.s(b);
  var f = EV.form, g = function(k){"""))
# 2. referral program: empty look-up / member
R.append(("""  if (a === 'lookup') { busy(api('?lookup=' + encodeURIComponent(S.last4))""",
"""  if (a === 'lookup' && !/^[A-Za-z0-9]{4}$/.test(String(S.last4 || '').trim())) { toast('Type the last 4 characters of the gift code.', true); return; }   /* patch MKTFIX4 */
  if (a === 'member' && !String(S.f.mName || '').trim()) { toast('Type the member\\'s name.', true); return; }
  if (a === 'lookup') { busy(api('?lookup=' + encodeURIComponent(S.last4))"""))
# 3. coupons: his view
R.append(("""<button class="gmt-btn g" data-a="cp-redeem">Redeem ($100 off)</button>""",
"""' + (W._gcMMData ? '<span class="gmt-muted">— the office redeems it on the job</span>' : '<button class="gmt-btn g" data-a="cp-redeem">Redeem ($100 off)</button>') + '"""))
# 4. print pack: his e-mail app
R.append(("""  if (typeof W._gcCompose === 'function') { if (W._gcCompose({ to: '', subject: t.subj, body: body, about: 'print' }) !== null) return; }""",
"""  if (typeof W._gcCompose === 'function' && !W._gcMMData) { if (W._gcCompose({ to: '', subject: t.subj, body: body, about: 'print' }) !== null) return; }   /* patch MKTFIX4: the Marketing Manager: his own e-mail app */"""))
for old, new in R:
    n = t.count(old)
    assert n == 1, (n, old[:90])
    t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('MKTFIX4: patched')
