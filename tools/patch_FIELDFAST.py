#!/usr/bin/env python3
"""Idempotent patch FIELDFAST (owner 11/21, GrayCo Field on the iPhone: "The app has got to work quickly while I'm in the
field" · "New appointment and other buttons don't work" · "It's so slow").

Measured by tools/tests/test_FIELDTAPS.mjs (iPhone 390x844, standalone, CPU x4) on r37j:
  • after the first open Field Home had NO jobs for 10-13 s (office / PM / estimator / crew; admin 6-7 s): the cloud's
    answer waited behind the rest of the page being read, then behind the whole pull, then a redraw;
  • after a network stall during the open it stayed empty 34-51 s: 127 requests hung until the phone's ~40 s socket timeout
    and nothing asked again sooner; meanwhile the pill said "✓ All sent", Update job / Clock in said "No open job", the
    New appointment pickers were empty — the app LOOKED broken.

1. tools/fieldfast_net.js (the first network layer, before every other fetch wrapper): reads of the database / functions
   have a time limit (8 / 10 / 15 s for the answer to start; functions and files longer) and are cancelled and asked again;
   at most 6 reads at once, the screen's lists first; back online / back in the app, a read hung from before is asked again
   at once; writes are never repeated (long limits, then the app's own save queue). __gcNet.stuck() for the pill.
2. tools/fieldfast_boot.js: a phone with NO saved job list (first sign-in, cleared storage) asks the cloud for the Field's
   lists (jobs, schedule, people, leads + the delete lists) as the page starts, and window._crm shows that copy until the
   app's own lists arrive — nothing of it is saved or sent. A phone with a saved copy opens from it, as before.
3. The sync pill tells the truth: "⏳ Loading…" until the jobs have loaded, "⚠️ Offline — showing saved data" while the
   network is not answering (offline, a read hung > 5 s, reads failing) — never "✓ All sent" then. It is looked at again
   every 2 s while Home is up (a stall changes nothing else on screen).
4. "No open job" / "No job for you today" / "No open job for you yet" / the empty Home sections / the New appointment
   pickers say "Loading jobs…" while the jobs have not loaded; a job button tapped then runs by itself once they have.
5. Fewer early redraws of Home (see the FIELDPERF render queue): a redraw that would draw the same thing is skipped.
"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
HERE = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
MARK = '/* patch FIELDFAST'
if MARK in t: print('FIELDFAST: already patched'); sys.exit(0)
def once(a, b):
    global t
    n = t.count(a); assert n == 1, ('FIELDFAST anchor', n, a[:90]); t = t.replace(a, b)
def js(name):
    s = open(os.path.join(HERE, name), encoding='utf-8').read()
    assert '</script' not in s.lower()
    return s

# 1. the network layer: the very first fetch wrapper (before RESUME and every other one)
once('<script id="gc-patch-resume">',
     '<script id="gc-patch-fieldfast-net">\n/* patch FIELDFAST: the network layer (tools/fieldfast_net.js) */\n' + js('fieldfast_net.js') + '</script>\n<script id="gc-patch-resume">')

# 2. the first-open copy: after the sign-in / access layers and the CRM's data box (patch R17FIX2), before FASTOPEN part 2
once('<script id="gc-patch-fastopen">',
     '<script id="gc-patch-fieldfast-boot">\n/* patch FIELDFAST: the first-open copy (tools/fieldfast_boot.js) */\n' + js('fieldfast_boot.js') + '</script>\n<script id="gc-patch-fastopen">')

# 3a. a pull that got through (not one that failed) — "the jobs have loaded"
once("""    try{ if(await pullDocs()) updated = true; }catch(e){ console.warn('[GC Sync] Document pull failed:', e.message); }""",
     """    try{ window.__gcPulledOkAt = Date.now(); }catch(_pk){}   /* patch FIELDFAST: a pull got through — the lists have loaded */
    try{ if(await pullDocs()) updated = true; }catch(e){ console.warn('[GC Sync] Document pull failed:', e.message); }""")

# 3c. the pill (patch FIELD)
once("""  if (!navigator.onLine) return { k: 'off', t: '📴 Saved on phone, will send' };
  if (waiting || sbDirty) return { k: 'wait', t: '⏳ Saved on phone, sending…' };
  return { k: 'ok', t: '✓ All sent' };
}""",
"""  if (!navigator.onLine) return (waiting || sbDirty) ? { k: 'off', t: '📴 Saved on phone, will send' } : { k: 'off', t: '⚠️ Offline — showing saved data' };   /* patch FIELDFAST */
  if (waiting || sbDirty) return { k: 'wait', t: '⏳ Saved on phone, sending…' };
  try { if (W.__gcNet && W.__gcNet.stuck()) return { k: 'off', t: '⚠️ Offline — showing saved data' }; } catch (e) {}   /* patch FIELDFAST: requests hung — never "All sent" */
  try { if (W._gcDataLoaded && !W._gcDataLoaded()) return { k: 'wait', t: '⏳ Loading…' }; } catch (e) {}   /* patch FIELDFAST: the jobs have not loaded yet */
  return { k: 'ok', t: '✓ All sent' };
}
(W.__GC_NATIVE_SETINTERVAL__ || W.setInterval).call(W, function(){ try { if (!D.hidden && D.getElementById('gc-fh-sync')) paintSync(); } catch (e) {} }, 2000);   /* patch FIELDFAST: a stall changes nothing else on screen — the pill is looked at again */""")

# 4a. Home's own sections (patch FIELD) while the jobs have not loaded
once("""      h += m.J.list.length ? (W._gcFPSort ? W._gcFPSort(m.J.list) : m.J.list).map(jobCard).join('')   /* patch FIELDPORTAL */ : '<div class="fh-empty">' + (m.J.company ?""",
     """      h += m.J.list.length ? (W._gcFPSort ? W._gcFPSort(m.J.list) : m.J.list).map(jobCard).join('')   /* patch FIELDPORTAL */ : (W._gcDataLoaded && !W._gcDataLoaded()) ? '<div class="fh-empty">⏳ Loading jobs…</div>' /* patch FIELDFAST */ : '<div class="fh-empty">' + (m.J.company ?""")
once(""": '<div class="fh-empty">✓ Nothing is waiting on you.</div>';""",
     """: (W._gcDataLoaded && !W._gcDataLoaded()) ? '<div class="fh-empty">⏳ Loading…</div>' /* patch FIELDFAST */ : '<div class="fh-empty">✓ Nothing is waiting on you.</div>';""")

# 4b. ROLEAPPS: a job button with no job yet waits for the jobs instead of saying "No open job"
once("""    if (!list.length) { toast(a === 'crew' || a === 'pm' ? 'No job for you today.' : 'No open job for that.'); return false; }""",
     """    if (!list.length && W._gcDataLoaded && !W._gcDataLoaded()) { toast('⏳ Loading jobs…'); var _ffT = Date.now(); (function _ffW(){ later(function(){ if (W._gcDataLoaded()) { run(id, pid); return; } if (Date.now() - _ffT < 25000) _ffW(); }, 400); })(); return true; }   /* patch FIELDFAST: the jobs have not loaded yet — it runs by itself once they have */
    if (!list.length) { toast(a === 'crew' || a === 'pm' ? 'No job for you today.' : 'No open job for that.'); return false; }""")
once("""      (L.length > CAP ? '<button type="button" class="gc-ra-allbtn" data-fa="alljobs">All ' + L.length + ' jobs ›</button>' : '') : '<div class="fh-empty">No open jobs.</div>');""",
     """      (L.length > CAP ? '<button type="button" class="gc-ra-allbtn" data-fa="alljobs">All ' + L.length + ' jobs ›</button>' : '') : (W._gcDataLoaded && !W._gcDataLoaded()) ? '<div class="fh-empty">⏳ Loading jobs…</div>' /* patch FIELDFAST */ : '<div class="fh-empty">No open jobs.</div>');""")

# 4c. PMFIELD: ✏️ Update job & co. — "No open job for you yet" only once the jobs have loaded
once("""  var J = myJobs(); if (!J.length) { toast('No open job for you yet.'); return; }""",
     """  var J = myJobs();
  if (!J.length && W._gcDataLoaded && !W._gcDataLoaded()) { toast('⏳ Loading jobs…'); var _ffT = Date.now(); (function _ffW(){ later(function(){ if (W._gcDataLoaded()) { pickMyJob(title, cb); return; } if (Date.now() - _ffT < 25000) _ffW(); }, 400); })(); return; }   /* patch FIELDFAST */
  if (!J.length) { toast('No open job for you yet.'); return; }""")
# 4d. PMFIELD: 📅 New appointment's job / lead picker while nothing has loaded
once("""      '<label>With</label><select data-f="with"><option value="">— pick a job or lead —</option>' + (J.length ?""",
     """      '<label>With</label><select data-f="with"><option value="">— pick a job or lead —</option>' + (!J.length && !LL.length && W._gcDataLoaded && !W._gcDataLoaded() ? '<option value="" disabled>⏳ Loading jobs and leads…</option>' : '') /* patch FIELDFAST */ + (J.length ?""")

open(p, 'w', encoding='utf-8').write(t)
print('FIELDFAST: patched')
