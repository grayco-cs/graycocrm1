#!/usr/bin/env python3
"""Idempotent patch RTBIG: the whole schedule is no longer sent as one ~5.4 MB "schedule" row.

A schedule this big is kept in the cloud in pieces: schedule__chunk0..N (~1.2 MB each) plus schedule__manifest,
written by the company sync (sbWriteChunked; it splits any list over _MAX_SYNC_BYTES = 3.5 MB). Several other
save paths (the save queue's toCloud -> _supaUpsertNow, _supaUpsert after a schedule edit, the 5-minute de-dupe
sweep) still sent the whole list as the single "schedule" row on every change. In the production database that
row holds only ~40 rows (the rest live in the pieces), so those 5.4 MB uploads do not land there; they only cost
this computer the work of building, checking (SYNCPERF signs every row) and sending 5.4 MB, again and again.
In the two-computer test, where the upload is accepted, every one of them also reached every other computer
over the live feed (500-900 ms to decode each).

Here, at the one door every database request goes through (spSend), an upload of the single "schedule" row
larger than the company sync's own limit is answered "done" without going out. The schedule's pieces and
manifest, every smaller list, and a small "schedule" row are sent exactly as before."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch RTBIG'
if MARK in t: print('RTBIG: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('RTBIG anchor count != 1', n, old[:90])
    t = t.replace(old, new)

once("""function spSend(input, init){
  var u = urlOf(input), rows = spRows(u, init), t = now();""",
"""function spSend(input, init){
  """ + MARK + """: the whole schedule as ONE row (over the 3.5 MB the company sync chunks at) is not sent: the schedule
     goes up as schedule__chunkN + schedule__manifest */
  try {
    if (init && typeof init.body === 'string' && init.body.length > 3600000 && /^\\{"key":"schedule","value":/.test(init.body.slice(0, 40)) && methodOf(urlOf(input), init) === 'POST' && /\\/rest\\/v1\\/gc_kv(\\?|$)/.test(urlOf(input))) {
      window._gcBigRowSkipped = (window._gcBigRowSkipped || 0) + 1;
      return Promise.resolve(new Response(null, { status: 201, statusText: 'Created' }));
    }
  } catch (e) {}
  var u = urlOf(input), rows = spRows(u, init), t = now();""")
open(p, 'w', encoding='utf-8').write(t); print('RTBIG: patched')
