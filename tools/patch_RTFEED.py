#!/usr/bin/env python3
"""Idempotent patch RTFEED: two schedule jobs that froze every open computer.

1. Every schedule change anywhere (a person's edit, a sweep) also saves the whole schedule as one ~5.4 MB row
   ("schedule", _supaUpsert), and the live feed (patch N) handed that row to every other open computer. Just
   reading that message (the browser decodes the whole 5.4 MB frame in one go, before any of our code runs) took
   500-900 ms of one block on the receiving computer, each time (CPU profiles: "(program)" + supabase decode
   under onEvent). The company sync saves the same schedule in ~1.2 MB pieces and then a small note
   (schedule__manifest) naming them. The live feed now listens to that small note instead of the 5.4 MB row:
   when another computer's note arrives, this computer reads the pieces (five smaller reads, one at a time,
   checked as one complete set by the reader of patch PJX) and lays the schedule over the screen exactly as the
   5.4 MB message was laid over it (same overlay, same holds). A note this computer wrote itself is not read
   back. Nothing that is saved changes.
2. The schedule guardian copied the whole schedule into localStorage every 20 seconds (parse ~5 MB, write
   ~5 MB, on the page's thread) even when nothing had changed. It now skips the copy when the schedule on the
   screen is the very same list it copied last time and the stored copy is the one it wrote; otherwise it
   copies exactly as before (same rule: never over a bigger backup)."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch RTFEED'
if MARK in t: print('RTFEED: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('RTFEED anchor count != 1', n, old[:90])
    t = t.replace(old, new)

once("""function filters(){
  var ks = Object.keys(keys()).filter(function(k){ return /^[A-Za-z0-9_]+$/.test(k); }).sort();""",
"""function filters(){
  """ + MARK + """: the ~5 MB schedule row is not taken from the live feed (decoding it froze every other computer);
     the small note the company sync writes after the schedule's pieces is taken instead (schedOnNote) */
  var ks = Object.keys(keys()).filter(function(k){ return /^[A-Za-z0-9_]+$/.test(k) && k !== 'schedule'; }).concat(['schedule__manifest']).sort();""")

once("""function onEvent(payload){
  try{
    var rec = (payload && (payload['new'] || payload.record)) || {};
    var k = rec.key || (payload && payload.old && payload.old.key);
    if(!k || !isShared(k)) return;""",
"""/* patch RTFEED: another computer saved the schedule's pieces: read them (one ~1.2 MB piece at a time) and lay
   them over the screen through the same overlay the whole-row message used */
var ownNote = {}, noteT = null, noteBusy = false, noteAgain = false;
function schedOnNote(rec){
  try{
    var v = rec && rec.value; if(typeof v === 'string'){ try{ v = JSON.parse(v); }catch(e){ v = null; } }
    if(v && v.gen && ownNote[v.gen]) return;                       /* this computer's own save */
    stats.events++; stats.lastEventAt = Date.now(); stats.evByKey = stats.evByKey || {}; stats.evByKey.schedule__manifest = (stats.evByKey.schedule__manifest||0) + 1;
    healthy = true;
    if(!noteT) noteT = ST.call(window, schedReadNote, 400);       /* notes that arrive together are read once */
  }catch(e){}
}
async function schedReadNote(){
  noteT = null;
  if(noteBusy){ noteAgain = true; return; }
  noteBusy = true;
  try{
    if(typeof window._gcSbReadChunked !== 'function') return;
    var v = await window._gcSbReadChunked('schedule');
    if(!Array.isArray(v) || !v.length || !isRecList(v)) return;
    var k = 'schedule';
    learnSoon(k, v, null);
    if(!firstEventAt) firstEventAt = Date.now();
    evVal[k] = v;
    if(!toApply[k]) toApply[k] = Date.now();
    scheduleApply(300);
  }catch(e){}
  finally{ noteBusy = false; if(noteAgain){ noteAgain = false; if(!noteT) noteT = ST.call(window, schedReadNote, 400); } }
}
function onEvent(payload){
  try{
    var rec = (payload && (payload['new'] || payload.record)) || {};
    var k = rec.key || (payload && payload.old && payload.old.key);
    if(k === 'schedule__manifest'){ schedOnNote(rec); return; }   /* patch RTFEED */
    if(!k || !isShared(k)) return;""")

once("""          if(!r || !r.key || !isShared(r.key)) return;""",
"""          if(r && r.key === 'schedule__manifest' && r.value && typeof r.value === 'object' && r.value.gen) ownNote[r.value.gen] = 1;   /* patch RTFEED: this page's own note */
          if(!r || !r.key || !isShared(r.key)) return;""")

once("""  function backupSchedule(){
    try{
      var sched=(window._crm&&window._crm.schedule)||[];
      if(!Array.isArray(sched)||!sched.length) return;
      var key='gc_sched_backup';
      var prev=[]; try{ prev=JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){}
      // only overwrite the backup if the current schedule is as big or bigger (never back up a shrunk one)
      if(sched.length>=prev.length){
        localStorage.setItem(key, JSON.stringify(sched));
      }
    }catch(e){}
  }""", """  var _bkList=null, _bkLen=-1, _bkN=-1;   """ + MARK + """: what this guardian last copied (the list, and the stored text's length) */
  function backupSchedule(){
    try{
      var sched=(window._crm&&window._crm.schedule)||[];
      if(!Array.isArray(sched)||!sched.length) return;
      var key='gc_sched_backup';
      var raw=localStorage.getItem(key)||'[]';
      if(sched===_bkList && sched.length===_bkN && raw.length===_bkLen) return;   /* the same list, and the copy is the one written from it */
      var prev=[]; try{ prev=JSON.parse(raw); }catch(e){}
      // only overwrite the backup if the current schedule is as big or bigger (never back up a shrunk one)
      if(sched.length>=prev.length){
        var _txt=JSON.stringify(sched);
        localStorage.setItem(key, _txt);
        _bkList=sched; _bkN=sched.length; _bkLen=_txt.length;
      }
    }catch(e){}
  }""")
open(p, 'w', encoding='utf-8').write(t); print('RTFEED: patched')
