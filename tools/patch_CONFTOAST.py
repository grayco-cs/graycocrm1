#!/usr/bin/env python3
"""Idempotent patch CONFTOAST: the sub-availability watcher (patch X10) says it once, not once per booking.

Found on the idle Leads screen with a production-size schedule (13.3k rows): once a minute the watcher compared the
conflicts (a sub booked on a day they marked busy, or two jobs the same day) with the ones it had already warned
about, and put up one ⚠️ toast for every new one. Its first look happens 7 s after the page opens, before the whole
schedule is on this computer, so a minute later hundreds of bookings were "new": ~1,200 toasts at once, each one
taken off again by the page's notice clean-up — 90 % of all the page changes in an idle minute.
Now: up to 2 new conflicts → one toast each, as before; more → ONE toast "⚠️ N new booking conflicts — Sub
availability" (the list is where it always was). The first look waits until the schedule has stopped growing.
Every find-string must occur exactly once. Usage: python3 tools/patch_CONFTOAST.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CONFTOAST'
if MARK in src:
    print('CONFTOAST: already patched'); sys.exit(0)
OLD = """    var c = conflicts(), first = !AV.seeded; AV.seeded = true;
    c.forEach(function(x){ if (AV.warned[x.id]) return; AV.warned[x.id] = 1; if (first) return;
      toast('⚠️ ' + x.sub + ' — ' + day(x.date) + ': ' + (x.kind === 'busy' ? 'marked this day busy in the sub portal' : 'already booked on another job that day') + '. (A warning only.)', true); });"""
NEW = """    var nS = arr(crm().schedule).length; if (!AV.seeded && AV.nS !== nS) { AV.nS = nS; return; }   """ + MARK + """: the first look once the schedule stopped growing */
    var c = conflicts(), first = !AV.seeded; AV.seeded = true;
    var fresh = c.filter(function(x){ if (AV.warned[x.id]) return false; AV.warned[x.id] = 1; return !first; });
    if (fresh.length > 2) toast('⚠️ ' + fresh.length + ' new booking conflicts (a sub booked on a busy day, or twice the same day) — see 🗓 Sub availability. A warning only.', true);   /* patch CONFTOAST: one notice, not one per booking */
    else fresh.forEach(function(x){
      toast('⚠️ ' + x.sub + ' — ' + day(x.date) + ': ' + (x.kind === 'busy' ? 'marked this day busy in the sub portal' : 'already booked on another job that day') + '. (A warning only.)', true); });"""
assert src.count(OLD) == 1, ('CONFTOAST find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('CONFTOAST: patched', path)
