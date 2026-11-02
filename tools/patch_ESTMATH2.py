#!/usr/bin/env python3
"""Idempotent patch ESTMATH2: a builder tab linked to a SAVED estimate never silently overrides the saved record.

Production: Hyatt Studios (mvpngqx4tzo) was saved 10/26 as v1 (x1.3, $781,536.29, estimator Glenn Miller). On 11/02 the
owner's page saved v2 at x1.25, $763,689.82, estimator Brittany Pucket. Opening a saved estimate (loadEst) and saving it
changes nothing (main and ESTMATH, tools/tests/test_ESTMATH2_fn.mjs). What can: loadSlotState() takes the job fields and
the margin from the open-tab copy, never from the saved record, and the builder replaces its open tabs with the copy kept
on this computer at start-up and with a newer copy of the company's synced open tabs ("gc_builder_slots": another
computer's tabs, their estimator, their margin). The next Save, or the Estimates hub's silent autosave, then writes that
copy into the estimate as a new version. Offline, a synced Hyatt tab holding x1.25 / Brittany gives exactly the v2 seen.

Fix: when a tab linked to a saved estimate is loaded (restore, sync, tab switch), the saved record's estimator, job type
and job margin win over the tab copy, unless that field was changed by hand in this tab during this session (estimator
or job type typed / picked, the margin bar, "Apply N%", the Override switch) or an older version was opened in it. One
short note says which fields were kept. The builder has no PM field: Save now carries the record's PM forward (it was
dropped from the builder's record on every save).
"""
import sys

p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch ESTMATH2 */'
if MARK in t:
    print('ESTMATH2: already patched'); sys.exit(0)


def once(src, a, b):
    c = src.count(a)
    assert c == 1, 'ESTMATH2: expected 1 of %r, found %d' % (a[:90], c)
    return src.replace(a, b)


GUARD = r"""/* patch ESTMATH2: a tab linked to a SAVED estimate carries the saved estimator, job type and job margin, unless the field
   was changed by hand in this tab this session (or an older version was opened). Open tabs are restored from this
   computer and replaced by the company's synced open tabs (another computer's copy); the job fields and the margin used
   to come from that copy, silently, and the next save made them the estimate's. */
window.__gcHandSet = window.__gcHandSet || {};   /* this session only: slotId -> { estimator, jobType, margin, version } */
function _gcHandKey(s){ return String((s && (s.slotId || s.id)) || ''); }
function _gcHandMark(f, s){ try{ s = s || openSlots[activeSlot]; var k = _gcHandKey(s); if(!k) return; (window.__gcHandSet[k] = window.__gcHandSet[k] || {})[f] = true; }catch(x){} }
function _gcHandClear(s){ try{ delete window.__gcHandSet[_gcHandKey(s)]; }catch(x){} }
window._gcHandMark = _gcHandMark;
try{ document.addEventListener('change', function(ev){ try{ if(!ev.isTrusted) return; var id = ev.target && ev.target.id;
  if(id === 'ej-est') _gcHandMark('estimator'); else if(id === 'ej-type') _gcHandMark('jobType'); else if(id === 'ovr-chk') _gcHandMark('margin'); }catch(x){} }, true);
  document.addEventListener('input', function(ev){ try{ if(ev.isTrusted && ev.target && ev.target.id === 'ej-est') _gcHandMark('estimator'); }catch(x){} }, true); }catch(x){}
function _gcSavedFieldsGuard(s){
  try{
    if(!s || !s._savedEstId) return null;
    var e = (estimates || []).find(function(x){ return x && x.id === s._savedEstId; }); if(!e || e._isDraft) return null;
    var h = window.__gcHandSet[_gcHandKey(s)] || {}; if(h.version) return null;
    var kept = [], f = s.fields = s.fields || {};
    if(!h.estimator && e.estimator && f.estimator !== e.estimator){ kept.push({ f: 'estimator', from: f.estimator || '', to: e.estimator }); f.estimator = e.estimator; }
    if(!h.jobType && e.jobType && f.jobType !== e.jobType){ kept.push({ f: 'job type', from: f.jobType || '', to: e.jobType }); f.jobType = e.jobType; }
    if(!h.margin){
      var want = e.jobMult || 'mat', pin = false;
      if(want === 'mat' && !e.useOvr){ var pm = _gcSavedMult(e, (s.lines && s.lines.length) ? s.lines : (e.lines || [])); if(pm){ want = pm; pin = true; } }
      var same = (want === 'mat' || s.jobMult === 'mat') ? String(want) === String(s.jobMult) : Math.abs(parseFloat(want) - parseFloat(s.jobMult)) < 1e-9;
      if(!same){ kept.push({ f: 'margin', from: s.jobMult, to: want }); s.jobMult = want; s._pinned = pin; }
      if(!!s.useOvr !== !!e.useOvr || (e.useOvr && parseFloat(s.ovrMult) !== parseFloat(e.ovrMult))){ kept.push({ f: 'override', from: s.useOvr ? s.ovrMult : 'off', to: e.useOvr ? e.ovrMult : 'off' }); s.useOvr = !!e.useOvr; s.ovrMult = e.ovrMult || 1.5; }
    }
    if(!kept.length) return null;
    var txt = 'Kept the saved ' + kept.map(function(k){ return k.f === 'margin' ? 'margin x' + k.to : k.f === 'override' ? 'override (' + k.to + ')' : k.f + ' (' + k.to + ')'; }).join(', ') + ' — this tab held another copy.';
    s._keptSaved = { at: Date.now(), kept: kept, note: txt };
    try{ console.warn('[ESTMATH2] "' + (e.name || e.id) + '": ' + JSON.stringify(kept)); }catch(x){}
    try{ setTimeout(function(){ var m = qs('save-msg'); if(m){ m.textContent = txt; m.style.color = 'var(--amber)'; setTimeout(function(){ if(m.textContent === txt){ m.textContent = ''; m.style.color = ''; } }, 9000); } }, 0); }catch(x){}
    return kept;
  }catch(x){ return null; }
}
window._gcSavedFieldsGuard = _gcSavedFieldsGuard;
"""
# 1. the guard, applied whenever a tab is loaded (restore at start-up, the synced copy, a tab switch)
t = once(t, "function loadSlotState(){\n", GUARD + "function loadSlotState(){\n")
t = once(t, "  jobMult=s.jobMult||'mat';ovrMult=s.ovrMult||1.5;useOvr=s.useOvr||false;\n  const f=s.fields||{};\n",
         "  try{ _gcSavedFieldsGuard(s); }catch(_g){}   " + MARK + "\n"
         "  jobMult=s.jobMult||'mat';ovrMult=s.ovrMult||1.5;useOvr=s.useOvr||false;\n  const f=s.fields||{};\n")
# 2. what counts as "changed by hand in this tab"
t = once(t, "function setJM(m,el){try{if(el&&openSlots[activeSlot]){openSlots[activeSlot]._priceByHand=true;",
         "function setJM(m,el){try{if(el&&openSlots[activeSlot]){_gcHandMark('margin');openSlots[activeSlot]._priceByHand=true;")
t = once(t, "function setOM(m,el){ovrMult=m;", "function setOM(m,el){try{if(el)_gcHandMark('margin');}catch(_h){}ovrMult=m;")
t = once(t, "jobMult=m;s.jobMult=m;s._pinned=false;s._marginRule=r.pct;",
         "jobMult=m;s.jobMult=m;s._pinned=false;s._marginRule=r.pct;_gcHandMark('margin',s);")
t = once(t, "if(byHand)s._typeByHand=true;", "if(byHand){s._typeByHand=true;_gcHandMark('jobType',s);}")
t = once(t, "s.jobMult=v.jobMult||s.jobMult;",
         "s.jobMult=v.jobMult||s.jobMult; _gcHandMark('version',s); /* patch ESTMATH2: an older version keeps its own fields */")
# 3. opening a saved estimate starts the tab fresh from the record
t = once(t, "  s._savedEstId=e.id;   // link this slot to the saved record so edits persist back to it\n",
         "  _gcHandClear(s);   /* patch ESTMATH2: opened from the record, nothing changed by hand yet */\n"
         "  s._savedEstId=e.id;   // link this slot to the saved record so edits persist back to it\n")
# 4. Save keeps the record's PM (the builder has no PM field; it was dropped on every save)
t = once(t, "'contractId','jobId','winner','won','_winner'].forEach(function(k){ if(_prev[k]!==undefined && est[k]===undefined) _carry[k]=_prev[k]; });",
         "'contractId','jobId','winner','won','_winner','pm','pmName','pmEmail'].forEach(function(k){ if(_prev[k]!==undefined && est[k]===undefined) _carry[k]=_prev[k]; });   " + MARK)
open(p, 'w', encoding='utf-8').write(t)
print('ESTMATH2: patched')
