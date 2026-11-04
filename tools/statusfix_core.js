<script id="gc-patch-statusfix-core">
/* patch STATUSFIX (owner 11/04): "nobody changed these" — completed / lost jobs came back as active / approved / bidding.
   Found: two computers opened with an old copy of the jobs (an iPhone at 16:54Z, the Office PC at 18:12Z / 18:14Z, each
   within a minute of signing in). The "a manual save always wins" writers stamped EVERY job of the list with
   updatedAt = now on any save made while someone was clicking or typing (the password box counts), so the old copy
   looked newer than the cloud; the person-edit ledger (SYNC_A) then took the old values as that person's edits
   (7 and 8 jobs in one save) and they won on every computer. 19:33:47Z: the same writer re-stamped 382 jobs at once.
   Here:
   · stampChanged(key, list): a save stamps only the records that changed since the last write of that list
     (updatedAt / savedAt / jobYear do not count as a change); every write, stamped or not, is remembered.
   · holdTerminal(): a job that was completed / lost / cancelled / closed only leaves that status by a person's
     explicit status change (a status picker, a status / reopen / mark button, a drag on the board, the CRM's own
     job-status writer) or a copy carrying a newer person status edit.
   · firstYear(): a job dated by its schedule or its own dates belongs to the year it starts. */
(function(W){
'use strict';
if (W.__GC_STATUSFIX__) return;
var TERM = { completed:1, complete:1, lost:1, cancelled:1, canceled:1, closed:1 };
function norm(v){ return v == null ? '' : String(v).trim().toLowerCase(); }
function isTerm(v){ return !!TERM[norm(v)]; }
function ts(v){ if (!v) return 0; if (typeof v === 'number') return v; var d = Date.parse(v); return isFinite(d) ? d : 0; }
function idOf(r){ return (r && typeof r === 'object' && r.id != null && r.id !== '') ? String(r.id) : null; }
var VOL = { updatedAt:1, updated_at:1, savedAt:1, updatedBy:1, jobYear:1, jobYearFrom:1, _fe:1, _lastEdit:1 };
var HOP = Object.prototype.hasOwnProperty;
function sig(r){ var o = {}, k; for (k in r) if (HOP.call(r, k) && !VOL[k]) o[k] = r[k]; try { return JSON.stringify(o); } catch (e) { return 'x' + Math.random(); } }
var LAST = {}, stats = { writes:0, stamped:0, kept:0, held:0 };

/* a save stamps only what it changed. seedOnly: a background write — remember it, stamp nothing. */
function stampChanged(key, list, now, seedOnly){
  if (!Array.isArray(list)) return 0;
  key = String(key || '?');
  var prev = LAST[key], next = {}, n = 0;
  now = now || new Date().toISOString();
  for (var i = 0; i < list.length; i++){
    var r = list[i]; if (!r || typeof r !== 'object') continue;
    var id = idOf(r);
    if (id == null){ if (prev && !seedOnly){ r.updatedAt = now; if (!r.savedAt) r.savedAt = now; n++; } continue; }
    var g = sig(r); next[id] = g;
    if (seedOnly || !prev) continue;                 /* first write seen here: the baseline, not a change */
    if (prev[id] === g){ stats.kept++; continue; }   /* unchanged: keeps the stamp of its last real change */
    r.updatedAt = now; if (!r.savedAt) r.savedAt = now; n++;
  }
  LAST[key] = next; stats.writes++; stats.stamped += n;
  return n;
}

/* prev: id -> { status } as last written here. o: { gesture, forced:{id:1}, fe:{id:{status:E}}, max } */
function holdTerminal(prev, list, o){
  o = o || {}; var held = [], allowed = 0, max = o.max == null ? 3 : o.max;
  if (!prev || !Array.isArray(list)) return held;
  for (var i = 0; i < list.length; i++){
    var r = list[i], id = idOf(r); if (id == null || !prev[id]) continue;
    var was = prev[id].status; if (!isTerm(was) || norm(r.status) === norm(was)) continue;
    if (o.forced && o.forced[id]) continue;                                   /* the CRM's own status writer, for this job */
    var own = r._fe && r._fe.status, L = o.fe && o.fe[id] && o.fe[id].status;
    if (own && own.at && norm(own.v) === norm(r.status) && (!L || ts(own.at) >= ts(L.at))) continue;   /* a newer person status edit */
    if (o.gesture && allowed < max){ allowed++; continue; }                    /* a person just changed a status */
    held.push({ id:id, name:r.name || '', from:was, to:r.status });
    try { r.status = was; } catch (e) {}
    stats.held++;
  }
  return held;
}

function yr(v){ var m = String(v || '').match(/(20\d{2})/); var y = m ? parseInt(m[1], 10) : 0; return y >= 2000 && y <= 2100 ? y : 0; }
function firstYear(dates){ var ys = (dates || []).map(yr).filter(Boolean); return ys.length ? Math.min.apply(null, ys) : 0; }
function lastYear(dates){ var ys = (dates || []).map(yr).filter(Boolean); return ys.length ? Math.max.apply(null, ys) : 0; }
/* money (payments / invoices): the most recent real activity. The calendar and the job's own dates: the year it starts
   (the year bar put ROTC Cordova, starting 2026-11-16, in 2027 because its punch list is in January). */
function jobYearOf(dates, src){ return /^(schedule|job dates)$/.test(String(src || '')) ? firstYear(dates) : lastYear(dates); }

W.__GC_STATUSFIX__ = { isTerm:isTerm, norm:norm, sig:sig, stampChanged:stampChanged, holdTerminal:holdTerminal,
  firstYear:firstYear, jobYearOf:jobYearOf, stats:function(){ return Object.assign({}, stats); }, _last:LAST };
})(window);
</script>
