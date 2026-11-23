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
5. Fewer early redraws of Home: an unforced redraw waits until 1.5 s after the last one (one trailing draw); opening Home
   while it is up redraws it in place (it was thrown away and made again).
6. At a first sign-in on a phone the person is looked up in the cloud's people list when this phone's lists do not have
   them: the CRM opens as that person at once (it opened as nobody and reloaded 7-10 s later).
7. A pulled lead list is merged with the screen's own when it is applied: a lead entered here that the pulled copy lacks
   (or has older) stays on the list.
8. 🎤 Speak → ➕ Lead says "✓ Leads — …" once the lead is on the Leads list (at most 3 s).
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

# 1. the network layer: the very first fetch wrapper (right after RESUME — RESUME stays the page's 2nd script)
once('<script id="gc-patch-supply">',
     '<script id="gc-patch-fieldfast-net">\n/* patch FIELDFAST: the network layer (tools/fieldfast_net.js) */\n' + js('fieldfast_net.js') + '</script>\n<script id="gc-patch-supply">')

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

# 5. fewer early redraws of Home (patch FIELD). Measured (office, first open): Home made twice and #_gcJobPick drawn 14
#    times in its first 17 s — each _crm rebuild / count change drew it again. A redraw that is not forced now waits until
#    1.5 s after the last one (one trailing draw with the newest data); opening Home while it is up draws it again in
#    place instead of throwing it away and making a new one.
once("""  var sig = sigOf(m); if (!force && sig === lastSig) { paintSync(); paintTabs(m.n); return; }""",
     """  var sig = sigOf(m); if (!force && sig === lastSig) { paintSync(); paintTabs(m.n); return; }
  var _ffAgo = Date.now() - (render.__ffAt || 0);   /* patch FIELDFAST: at most one redraw per 1.5 s unless forced — the newest data, drawn once */
  if (!force && el.firstChild && _ffAgo < 1500) { if (!render.__ffQ) render.__ffQ = later(function(){ render.__ffQ = 0; render(false); }, 1500 - _ffAgo); paintSync(); return; }
  render.__ffAt = Date.now();""")
once("""  Array.prototype.forEach.call(D.querySelectorAll('._gcSheetOv,#_gcJobDash,#_gcJobPick'), function(o){ o.remove(); });
  W._gcCurrentJob = null;
  var ov = D.createElement('div'); ov.id = '_gcJobPick'; ov.className = 'gc-fh'; D.body.appendChild(ov);
  ov.addEventListener('click', onClick); pressWire(ov);   /* patch FIELDTAP */""",
     """  var keep = D.querySelector('#_gcJobPick.gc-fh');   /* patch FIELDFAST: Home already up — drawn again in place, not made anew */
  Array.prototype.forEach.call(D.querySelectorAll('._gcSheetOv,#_gcJobDash,#_gcJobPick'), function(o){ if (o !== keep) o.remove(); });
  W._gcCurrentJob = null;
  var ov = keep;
  if (!ov) { ov = D.createElement('div'); ov.id = '_gcJobPick'; ov.className = 'gc-fh'; D.body.appendChild(ov);
    ov.addEventListener('click', onClick); pressWire(ov); }   /* patch FIELDTAP */""")

# 6. the person, at the sign-in (the auth block). At a sign-in the CRM looks for the person in this phone's people
#    lists and, found, opens again as them. A first sign-in on a phone has only the built-in people: a PM / estimator /
#    crew member was not found, the page opened without knowing who they were (no name, no role — "No jobs assigned to you
#    yet") and reloaded ~7-10 s later once the people list came. Now, not found here, the cloud's people list is asked
#    (at most 6 s) — the CRM opens as that person at once. Only once the whole page has arrived: a sign-in while it is
#    still downloading (a weak signal) keeps the old way (no reload that would start the download again).
once("""  lists.push(await idb('get', 'users'));
  try { lists.push(window._uDef); } catch (e) {}""",
     """  lists.push(await idb('get', 'users'));
  try { lists.push(window._uDef); } catch (e) {}
  try {   /* patch FIELDFAST: not on this phone's lists — the cloud's people list (a first sign-in on this phone) */
    var here = lists.some(function(L){ return Array.isArray(L) && L.some(function(u){ return u && low(u.email) === email && u.active !== false; }); });
    if (!here && document.readyState === 'complete') {   /* the whole page is here: a reload now is quick (on a weak signal, still downloading, it would start the download again — as before, the CRM opens and finds the person later) */
      var cr = await Promise.race([window.fetch(SB_URL + '/rest/v1/gc_kv?key=eq.users&select=value', { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(function(r){ return r && r.ok ? r.json() : null; }, function(){ return null; }), new Promise(function(res){ nST(function(){ res(null); }, 6000); })]);
      var cv = cr && cr[0] && cr[0].value; if (typeof cv === 'string') { try { cv = JSON.parse(cv); } catch (e) { cv = null; } }
      if (Array.isArray(cv)) lists.push(cv);
    }
  } catch (e) {}""")

# 7. a lead entered on this phone never leaves its list (the sync's apply of a pulled lead list). Found by test_SPEAKTILE
#    once Home is usable sooner: a lead posted while the open's first pull was on its way was not in that pull's copy (nor
#    yet on the disk the pull merges with), and the apply replaced the screen's list with it — the lead was in the cloud but
#    gone from the phone's Leads until the next pull. Now the pulled list is merged with the screen's own: a lead on the
#    screen that the pulled copy does not have is kept, and one changed here later than the pulled copy's is kept as it is
#    here (deleted leads still go: the tombstone filter runs on the merged list as before).
once("""      else { try{ if(window._gcApplySync) window._gcApplySync(k, _pendingApply[k]); }catch(e){} }""",
     """      else { try{ if(window._gcApplySync) window._gcApplySync(k, k === 'leads' ? _ffKeepLocalLeads(_pendingApply[k]) : _pendingApply[k]); }catch(e){} }   /* patch FIELDFAST: leads — merged with the screen's */""")
once("""function _flushPendingSync(){""",
     """/* patch FIELDFAST: the pulled leads + every lead on this screen the pulled copy lacks or has older */
function _ffKeepLocalLeads(v){
  try{
    var inc = (typeof v === 'string') ? JSON.parse(v) : v; if(!Array.isArray(inc)) return v;
    var mine = Array.isArray(window.__gcLeadsLive) ? window.__gcLeadsLive : []; if(!mine.length) return v;
    var at = function(r){ return Date.parse(String((r && (r.updatedAt || r.createdAt || r.receivedAt)) || '')) || 0; };
    var byId = {}, out = inc.slice(), kept = 0;
    inc.forEach(function(r, i){ if(r && r.id != null) byId[String(r.id)] = i; });
    mine.forEach(function(r){
      if(!r || r.id == null) return; var i = byId[String(r.id)];
      if(i === undefined){ out.push(r); kept++; }
      else if(at(r) > at(out[i])){ out[i] = r; kept++; }
    });
    if(kept){ try{ window.__gcLeadsKeptLocal = (window.__gcLeadsKeptLocal || 0) + kept; }catch(_k){} }
    return kept ? out : v;
  }catch(e){ return v; }
}
function _flushPendingSync(){""")
# 8. SPEAKTILE ➕ → Leads: "✓ Leads — …" once the lead is on the Leads list (the app has drawn it), not the moment it was
#    handed over (at most 3 s). Measured (test_SPEAKTILE debug): with Home usable sooner the Post lands while the open's
#    first sync is still being applied; the lead was on the list (window.__gcLeadsLive) but the app had not drawn it yet.
once("""  return Promise.resolve({ ok: true, lead: L, where: 'Leads — ' + L.name + ' · New lead (nobody was contacted)' });""",
     """  var res = { ok: true, lead: L, where: 'Leads — ' + L.name + ' · New lead (nobody was contacted)' };
  return new Promise(function(done){ var t0 = Date.now(); (function look(){ var on = false; try { on = (Array.isArray(W.__gcLeadsLive) ? W.__gcLeadsLive : []).some(function(x){ return x && x.id === L.id; }); } catch (e) {} if (on || Date.now() - t0 > 3000) { ST(function(){ done(res); }, on ? 50 : 0); return; } ST(look, 60); })(); });   /* patch FIELDFAST: ✓ once it is on the list */""")
open(p, 'w', encoding='utf-8').write(t)
print('FIELDFAST: patched')
