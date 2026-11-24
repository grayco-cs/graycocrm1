#!/usr/bin/env python3
"""Idempotent patch CCLINKSTAT: the CompanyCam status line says how much is linked and what is waiting (owner 11/23: "I'm not
so sure my CompanyCam has been linking jobs into the CRM").

The line (patch CCS / CCBANNER: GrayCo Systems tile, every CompanyCam bar, Admin's CompanyCam setup) said only
"Last sync: … — OK, n projects read, n jobs made". It never said how many jobs carry a CompanyCam project, that new
CompanyCam projects were waiting on the list because "Make new jobs" is OFF in Automations, or that many CompanyCam-made
Bidding jobs are second copies of a job already here (the September browser imports). companycam-sync now writes those
counts into gc_cc_sync_health (jobsLinked, ccJobs, ccDupes, waitingNew, newJobsOn); this patch adds them to the OK line:

  ✅ Token accepted (checked 11:42 PM) · Last sync: Nov 23, 2:15 AM — OK, 0 projects read, 0 jobs made · 169 jobs linked
  · ⚠ 3 new CompanyCam projects waiting on 📷 Photos ("Make new jobs" is OFF in ⚡ Automations) · 166 CompanyCam-made
  Bidding jobs are copies of a project another job already has

A rejected key keeps its own line ("❌ Token not accepted (401) · make a new token …"). Counts only; nothing is changed.
Usage: python3 tools/patch_CCLINKSTAT.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CCLINKSTAT'
if MARK in src:
    print('CCLINKSTAT: already patched'); sys.exit(0)


def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('CCLINKSTAT anchor count != 1', label, n)
    src = src.replace(old, new)


once("""  if (h.ccError && +h.ccError.status >= 500) line += ' · CompanyCam had a server error (' + h.ccError.status + ') — retried another way';
""", """  if (h.ccError && +h.ccError.status >= 500) line += ' · CompanyCam had a server error (' + h.ccError.status + ') — retried another way';
  /* patch CCLINKSTAT: how much is linked, what waits for a person, how many CompanyCam-made jobs are copies (counts only) */
  if (h.jobsLinked != null) line += ' · ' + (+h.jobsLinked || 0) + ' job' + (+h.jobsLinked === 1 ? '' : 's') + ' linked';
  if (+h.waitingNew > 0) line += ' · ⚠ ' + (+h.waitingNew) + ' new CompanyCam project' + (+h.waitingNew === 1 ? '' : 's') + ' waiting on 📷 Photos'
    + (h.newJobsOn === false ? ' ("Make new jobs" is OFF in ⚡ Automations)' : '');
  if (+h.ccDupes > 0) line += ' · ' + (+h.ccDupes) + ' CompanyCam-made Bidding job' + (+h.ccDupes === 1 ? ' is a copy' : 's are copies') + ' of a project another job already has';
""", 'judge OK line')

open(path, 'w', encoding='utf-8').write(src)
print('CCLINKSTAT: patched ' + path)
