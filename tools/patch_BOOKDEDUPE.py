#!/usr/bin/env python3
"""Idempotent patch BOOKDEDUPE: the schedule is ~123 real rows, not 13,298.

Production data (read-only check): of 13,298 schedule rows only 123 are unique by (job, date, title, time).
13,202 are the automatic "Start — <job>" / "Finish — <job>" rows (_autoBookend 'start' / 'finish', by 'Auto',
type milestone) of 14 active jobs, each copied ~470-1,308 times. They were made 2026-08-14..19 by a race in the
bookend writer (two computers / two tabs each adding the job's bookend before seeing the other's), each copy under
its own id, so every union by id kept all of them and no sweep removed them. Every slow thing measured on the
schedule (signing, merging, saving, sending 13k rows) is 99% these copies.

THE RULE (applied wherever the delete list is applied — patch FIX's filterList: every write to this computer's
disk, every screen setter, every pull to the screen, every upload to the cloud):
  1. a job has at most ONE automatic Start row and ONE automatic Finish row (rows carrying _autoBookend). The one
     kept is the one on the job's current start/end date, else the lowest id (the oldest); every computer picks
     the same one from the same rows, so computers agree without writing anything.
  2. two rows that are the same in every field except their id and their save stamps are one row (lowest id kept).
     A row a person made that differs in anything (job, date, title, time, who, notes ...) is never touched.
No delete markers are written for the copies (13k markers would be a new problem); the rule itself keeps them out,
on every computer that has this build. The keep-forever guard and the floor ("never drop more than a quarter of a
list") are told that a drop the rule explains is not a loss; any other drop is still refused as before.

THE CLOUD (once, on an admin's computer, 90 s after load, recorded in gc_kv 'gc_bookdedupe_v1'; also
window._gcBookDedupeNow()): the cloud's schedule (its pieces schedule__chunkN + schedule__manifest, and the plain
"schedule" row) is read, the rule applied, and it is written back as the plain "schedule" row (the format of every
list under 3.5 MB); the manifest says "not chunked" and the old pieces are emptied, so older builds read the plain
row too. Safety checks before anything is written: the cloud read must be complete (no torn piece); every row
that is not an automatic bookend must still be there (only exact copies may go); every job's bookend keeps one
row; the result must not be empty. Any check failing: nothing is written, the reason is logged.

THE WRITER: the bookend writer already finds a job's bookend by marker or by job + title before adding one; with
the rule, two computers that still race each add one, and the rule folds them back to the same one.
Also: the live feed (patch RTFEED) listens to the plain "schedule" row again (it is small now)."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch BOOKDEDUPE'
if MARK in t: print('BOOKDEDUPE: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('BOOKDEDUPE anchor count != 1', n, old[:90])
    t = t.replace(old, new)

# 1. the rule, where the delete list is applied (patch FIX filterList)
once("""  var any = false, out = v.filter(function(r){ if(!r || typeof r !== 'object') return true; var id = idOf(r); var d = dead(type, id) || (id && as[id]); if(d) any = true; return !d; });
  return any ? out : v;
}""", """  var any = false, out = v.filter(function(r){ if(!r || typeof r !== 'object') return true; var id = idOf(r); var d = dead(type, id) || (id && as[id]); if(d) any = true; return !d; });
  """ + MARK + """: one automatic Start / Finish row per job, exact copies are one row */
  if(typeOf(type) === 'schedule' && typeof window._gcSchedDedupe === 'function'){ try{ var dd = window._gcSchedDedupe(any ? out : v); if(dd !== (any ? out : v)){ out = dd; any = true; } }catch(e){} }
  return any ? out : v;
}""")

# 2. the floor: a shrink the rule explains is not a loss
once("""  var n=incoming.length, hw=HW[key]|0;
  if(n>=hw){""", """  var n=incoming.length, hw=HW[key]|0;
  """ + MARK + """: the schedule's copies the rule folds away do not count toward its high-water mark */
  if(key==='schedule' && n<hw && LAST[key] && typeof window._gcSchedDedupe==='function'){ try{ var _hw2=window._gcSchedDedupe(LAST[key]).length; if(_hw2<hw){ hw=_hw2; HW[key]=_hw2; saveHW(); LAST[key]=window._gcSchedDedupe(LAST[key]); } }catch(_d){} }
  if(n>=hw){""")

# 3. the live feed listens to the (small again) plain schedule row
once("""return /^[A-Za-z0-9_]+$/.test(k) && k !== 'schedule'; }).concat(['schedule__manifest']).sort();""",
     """return /^[A-Za-z0-9_]+$/.test(k); }).concat(['schedule__manifest']).sort();   """ + MARK + """: the plain row is small again */""")

JS = r"""
<script>
""" + MARK + r""": the rule, the guards told about it, and the one-time cloud clean-up */
(function(){
'use strict';
if (window.__GC_BOOKDEDUPE__) return; window.__GC_BOOKDEDUPE__ = true;
var ST = window.__GC_NATIVE_SETTIMEOUT__ || setTimeout;
var STAMPX = /^(updatedAt|updated_at|savedAt|lastSeen|modified|modifiedAt|lastModified|createdAt|created|_\w*UpdatedAt)$/;
var DROP = {};                 /* ids the rule folded away this session (the keep-forever guard and the delete recorder are told) */
var stats = window._gcBookDedupeStats = { runs: 0, autoDropped: 0, exactDropped: 0, last: null };
function idOf(r){ return (r && typeof r === 'object') ? (r.id != null && r.id !== '' ? String(r.id) : (r._id != null && r._id !== '' ? String(r._id) : '')) : ''; }
function d10(x){ return String(x || '').slice(0, 10); }
function canon(r){
  var ks = Object.keys(r).sort(), p = [];
  for (var i = 0; i < ks.length; i++) { var k = ks[i]; if (k === 'id' || k === '_id' || STAMPX.test(k)) continue; var v = r[k]; if (v === undefined || typeof v === 'function') continue; var j; try { j = JSON.stringify(v); } catch (e) { return null; } p.push(JSON.stringify(k) + ':' + j); }
  return '{' + p.join(',') + '}';
}
function projDates(){
  var m = {};
  try { (window._crm && window._crm.projects || []).forEach(function(p){ if (p && p.id != null) m[String(p.id)] = { start: d10(p.startDate), finish: d10(p.endDate) }; }); } catch (e) {}
  return m;
}
/* returns the same array when nothing is folded */
function dedupe(list){
  if (!Array.isArray(list) || list.length < 2) return list;
  var P = null, best = {}, groups = {}, drop = null, i, r, id;
  for (i = 0; i < list.length; i++) {
    r = list[i]; if (!r || typeof r !== 'object') continue; id = idOf(r); if (!id) continue;
    var kind = r._autoBookend;
    if ((kind === 'start' || kind === 'finish') && r.pid != null && r.pid !== '') {
      var k = String(r.pid) + '|' + kind, cur = best[k];
      if (cur == null) { best[k] = i; continue; }
      if (!P) P = projDates();
      var want = (P[String(r.pid)] || {})[kind] || '', b = list[cur];
      var ra = !!want && d10(r.date) === want, rb = !!want && d10(b.date) === want;
      var rWins = ra !== rb ? ra : (id < idOf(b));
      (drop || (drop = {}))[rWins ? cur : i] = 1; if (rWins) best[k] = i;
    } else {
      var ck = [r.pid, d10(r.date), r.title, r.time, r.assignee].join('\u0001');
      (groups[ck] || (groups[ck] = [])).push(i);
    }
  }
  for (var ck2 in groups) {
    var g = groups[ck2]; if (g.length < 2) continue;
    var byC = {};
    for (var q = 0; q < g.length; q++) {
      var row = list[g[q]], c = canon(row); if (c == null) continue;
      var at = byC[c];
      if (at == null) { byC[c] = g[q]; continue; }
      var keepNew = idOf(row) < idOf(list[at]);
      (drop || (drop = {}))[keepNew ? at : g[q]] = 1; if (keepNew) byC[c] = g[q];
    }
  }
  if (!drop) return list;
  var keptIds = {}, out = [], nA = 0, nE = 0;
  for (i = 0; i < list.length; i++) { if (!drop[i]) { out.push(list[i]); var kid = idOf(list[i]); if (kid) { keptIds[kid] = 1; delete DROP[kid]; } } }
  for (var di in drop) { var dr = list[+di], did = idOf(dr); if (did && !keptIds[did]) DROP[did] = 1; if (dr && (dr._autoBookend === 'start' || dr._autoBookend === 'finish')) nA++; else nE++; }
  stats.runs++; stats.autoDropped += nA; stats.exactDropped += nE; stats.last = { at: new Date().toISOString(), before: list.length, after: out.length, auto: nA, exact: nE };
  return out;
}
window._gcSchedDedupe = dedupe;
window._gcSchedDupIds = function(){ return Object.keys(DROP).length; };
/* the keep-forever guard (repair -> mergedAway) and the delete recorder ask _gcIsFolded: a copy the rule folded away
   is not a record a sync lost */
(function wrapFolded(){
  var f = window._gcIsFolded;
  var w = function(list, id){ try { if ((list === 'schedule') && id != null && DROP[String(id)]) return true; } catch (e) {} return typeof f === 'function' ? f.apply(this, arguments) : false; };
  w.__gcBook = true; window._gcIsFolded = w;
})();

/* ── the cloud, once ─────────────────────────────────────────────────────────────── */
function creds(){ try { return { u: (localStorage.getItem('grayco_sb_url') || '').replace(/\/$/, ''), k: localStorage.getItem('grayco_sb_key') || '' }; } catch (e) { return { u: '', k: '' }; } }
function H(c){ return { apikey: c.k, Authorization: 'Bearer ' + c.k }; }
async function getRow(c, key){
  var r = await fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value', { headers: H(c), cache: 'no-store' });
  if (!r || !r.ok) throw new Error('read ' + key + ' ' + (r && r.status));
  var rows = await r.json(); if (!Array.isArray(rows)) throw new Error('read ' + key);
  if (!rows.length) return undefined;
  var v = rows[0].value; if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { v = JSON.parse(v); } catch (e) {} }
  return v;
}
async function putRow(c, key, value){
  var r = await fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, H(c)), body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
  if (!r || !r.ok) throw new Error('write ' + key + ' ' + (r && r.status));
}
var running = false;
window._gcBookDedupeNow = async function(opt){
  opt = opt || {};
  if (running) return { skipped: 'already running' };
  running = true;
  var rep = { at: new Date().toISOString(), by: '' };
  try {
    try { rep.by = (window.__GC_AUTH__ && window.__GC_AUTH__.email()) || ''; } catch (e) {}
    var c = creds(); if (!c.u || !c.k) throw new Error('not connected to the cloud');
    var man = await getRow(c, 'schedule__manifest');
    var chunks = [];
    if (man && man.chunked) {
      if (typeof window._gcSbReadChunked !== 'function') throw new Error('no chunk reader');
      chunks = await window._gcSbReadChunked('schedule');
      if (!Array.isArray(chunks)) throw new Error('the cloud schedule pieces are not one complete set right now');
    }
    var single = await getRow(c, 'schedule'); if (!Array.isArray(single)) single = [];
    /* the union by id (the newer save of an id wins) */
    var at = {}, union = [];
    chunks.concat(single).forEach(function(r){ var id = idOf(r); if (!id) { union.push(r); return; }
      if (!(id in at)) { at[id] = union.length; union.push(r); return; }
      var o = union[at[id]]; if (String((r && r.updatedAt) || '') > String((o && o.updatedAt) || '')) union[at[id]] = r; });
    var out = dedupe(union);
    rep.cloudPieces = chunks.length; rep.cloudPlainRow = single.length; rep.before = union.length; rep.after = out.length;
    /* safety checks */
    var isAuto = function(r){ return !!(r && (r._autoBookend === 'start' || r._autoBookend === 'finish')); };
    var keptIds = {}; out.forEach(function(r){ var id = idOf(r); if (id) keptIds[id] = 1; });
    var nonAutoBefore = {}, lostNonAuto = [];
    union.forEach(function(r){ if (!isAuto(r) && idOf(r)) nonAutoBefore[idOf(r)] = r; });
    var outCanon = {}; out.forEach(function(r){ if (!isAuto(r)) { var cc = canon(r); if (cc) outCanon[cc] = 1; } });
    Object.keys(nonAutoBefore).forEach(function(id){ if (keptIds[id]) return; var cc = canon(nonAutoBefore[id]); if (!cc || !outCanon[cc]) lostNonAuto.push(id); });
    var groupsBefore = {}, groupsAfter = {};
    union.forEach(function(r){ if (isAuto(r) && r.pid != null) groupsBefore[r.pid + '|' + r._autoBookend] = 1; });
    out.forEach(function(r){ if (isAuto(r) && r.pid != null) groupsAfter[r.pid + '|' + r._autoBookend] = (groupsAfter[r.pid + '|' + r._autoBookend] || 0) + 1; });
    var badGroups = Object.keys(groupsBefore).filter(function(k){ return groupsAfter[k] !== 1; });
    rep.nonAutoRows = Object.keys(nonAutoBefore).length; rep.exactCopiesFolded = Object.keys(nonAutoBefore).length - out.filter(function(r){ return !isAuto(r) && idOf(r); }).length;
    rep.autoRowsBefore = union.filter(isAuto).length; rep.autoRowsAfter = out.filter(isAuto).length; rep.bookendGroups = Object.keys(groupsBefore).length;
    if (lostNonAuto.length) throw new Error('safety: ' + lostNonAuto.length + ' rows a person made would be lost (' + lostNonAuto.slice(0, 5).join(', ') + ')');
    if (badGroups.length) throw new Error('safety: ' + badGroups.length + ' jobs would not keep exactly one Start/Finish row');
    if (!out.length && union.length) throw new Error('safety: the result is empty');
    if (out.length === union.length && !(man && man.chunked)) { rep.result = 'nothing to clean'; return rep; }
    if (opt.dryRun) { rep.result = 'dry run: nothing written'; return rep; }
    var txt = JSON.stringify(out); if (txt.length > 3400000) throw new Error('safety: still too big for one row (' + txt.length + ' bytes) — nothing written');
    /* write: the plain row first (complete), then the manifest says "not chunked", then the old pieces are emptied */
    await putRow(c, 'schedule', out);
    var oldN = (man && man.count) || 0;
    if (man && man.chunked) await putRow(c, 'schedule__manifest', { chunked: false, count: 0, total: out.length, at: new Date().toISOString(), gen: 'bookdedupe' + Date.now().toString(36), note: 'schedule is one row again (patch BOOKDEDUPE)' });
    for (var ci = 0; ci < oldN; ci++) await putRow(c, 'schedule__chunk' + ci, []);
    /* this computer: its own list through the rule, and the counts its guards remember */
    try { var loc = await window.idbGet('schedule'); if (Array.isArray(loc)) { var lo = dedupe(loc); if (lo !== loc) await window.idbSet('schedule', lo); rep.thisComputer = { before: loc.length, after: lo.length }; try { localStorage.setItem('gc_lastgood_count_schedule', String(lo.length)); } catch (e) {} } } catch (e) {}
    try { if (typeof window._setSchedule === 'function') window._setSchedule(function(prev){ return Array.isArray(prev) ? dedupe(prev) : prev; }); } catch (e) {}
    rep.result = 'cleaned';
    await putRow(c, 'gc_bookdedupe_v1', rep);
    return rep;
  } catch (e) {
    rep.result = 'stopped: ' + (e && e.message || e);
    return rep;
  } finally {
    running = false; window._gcBookDedupeReport = rep;
    try { console.log('%c[GC] schedule copies clean-up: ' + rep.result, 'background:#0f2440;color:#fff;padding:2px 6px', rep); } catch (e) {}
  }
};
/* every computer: the bookend writer's own copy in this browser (grayco_schedule) goes through the rule once */
ST.call(window, function(){
  try { var raw = localStorage.getItem('grayco_schedule'); if (!raw || raw.length < 200000) return; var l = JSON.parse(raw); if (!Array.isArray(l)) return; var o = dedupe(l); if (o !== l) localStorage.setItem('grayco_schedule', JSON.stringify(o)); } catch (e) {}
}, 60000);
/* once, on an admin's computer: 90 s after load, when the cloud has no record of it being done */
ST.call(window, async function(){
  try {
    if (!(window.__GC_AUTH__ && typeof window.__GC_AUTH__.isAdmin === 'function' && window.__GC_AUTH__.isAdmin())) return;
    var c = creds(); if (!c.u || !c.k) return;
    var done = await getRow(c, 'gc_bookdedupe_v1');
    if (done && done.result === 'cleaned') return;
    await window._gcBookDedupeNow();
  } catch (e) {}
}, 90000);
})();
</script>"""
t = t.rstrip('\n') + JS + '\n'
open(p, 'w', encoding='utf-8').write(t); print('BOOKDEDUPE: patched')
