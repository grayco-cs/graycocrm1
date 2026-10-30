#!/usr/bin/env python3
"""Idempotent patch FIELDFIX2: a phone on a weak signal does not lock itself out of the cloud for minutes.

Found by the field-view audit (10/30): a crew member works with no signal (punch item, problem, materials, progress,
message, receipt, daily log, photo), the phone reloads the page while the cloud is still out of reach (iOS drops a
background tab), then the signal comes back. Five minutes later NOTHING had gone up and the field header said
"All sent". The cloud brake (patch "sync backoff") counted every request that could not reach the cloud as "the cloud
is struggling" and climbed to its 2-minute level; on a phone with no signal that is dozens of failures, and once the
signal is back it eased off one level per success while refusing almost every request (so successes were rare), and
the save queue waits while the brake is on.

Fix: a request that got NO answer (status 0: no signal) is not the database struggling. It holds the brake at the
8-second level at most (a real 429 / 5xx answer still climbs to 2 minutes as before), so the phone tries again within
seconds of the signal coming back. No new timers.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* FIELDFIX2 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:80], s.count(old))
    return s.replace(old, new)

OLD = """      state.failStreak++;
      if(state.failStreak>=1){
        state.level = Math.min(STEPS.length-1, state.level+1);
        state.backoffUntil = Date.now()+STEPS[state.level];"""
NEW = """      state.failStreak++;
      if(state.failStreak>=1){
        """ + MARK + """ /* no answer at all (status 0) = no signal, not a struggling database: at most the 8 s level */
        if(status || state.level < 2) state.level = Math.min(status ? STEPS.length-1 : 2, state.level+1);
        state.backoffUntil = Date.now()+STEPS[state.level];"""
src = once(src, OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFIX2')
