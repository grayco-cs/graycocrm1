#!/usr/bin/env python3
"""Idempotent patch TEAMACTIVITY: 👥 Team activity — an activity log for the admins (owner 11/18: "can I see in my admin how
long people were on CRM etc.").

1. tools/teamact.js (copied into index.html; run again to refresh it): a light heartbeat on every signed-in staff device (not
   the Marketing Manager: his sign-in cannot write gc_kv) — a tap / key / scroll marks the minute (no keystroke content, no
   screen recording); every 5 minutes the day goes to gc_kv gc_activity_<yyyy-mm-dd>__<e-mail> (the person's devices inside);
   kept for good. ⚙ Admin / 💎 → 👥 Team activity (the admin role only): per person last seen, active today / this week (idle
   gaps over 5 minutes not counted), sign-ins, devices, version (old flagged), last screen, saves, errors / slow taps, failed
   sign-ins (BOOTWATCH), and a day timeline (active blocks + key actions).
2. STUCKFIX's bulk-read filter: the "what changed" pulls of every computer skip gc_activity_* and gc_problem_* (only the admin
   screens read them) — a read that names its keys is not changed.
Usage: python3 tools/patch_TEAMACTIVITY.py [index.html]
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
JS = open(os.path.join(here, 'teamact.js'), encoding='utf-8').read().rstrip('\n')
assert '__GC_PATCH_TEAMACT__' in JS and '</script' not in JS
changed = False

OLD = "  var add = '&key=not.like.projectDocs__*&key=not.like.estimates__chunk*';   /* old chunk generations: never in a bulk read */\n"
NEW = OLD + "  if (!/(?:^|&)key=/.test(q)) add += '&key=not.like.gc_activity_*&key=not.like.gc_problem_*';   /* patch TEAMACTIVITY: the activity log / problem reports — only the admin screens read them */\n"
if NEW not in src:
    assert src.count(OLD) == 1, 'STUCKFIX anchor'
    src = src.replace(OLD, NEW); changed = True

OPEN = '<script id="gc-patch-teamact">\n'
if OPEN in src:
    i = src.index(OPEN) + len(OPEN); j = src.index('</script>', i)
    if src[i:j].rstrip('\n') != JS:
        src = src[:i] + JS + '\n' + src[j:]; changed = True
else:
    src = src.rstrip('\n') + '\n' + OPEN + JS + '\n</script>\n'; changed = True
if changed:
    open(path, 'w', encoding='utf-8').write(src); print('TEAMACTIVITY: patched')
else:
    print('TEAMACTIVITY: already patched')
