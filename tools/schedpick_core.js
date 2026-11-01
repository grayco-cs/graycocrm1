/* patch SCHEDPICK (core) — SUGGESTIONS ARE NOT THE SCHEDULE (owner 11/01, ROTC Cordova: "how did all of this get in
   there … it should be chosen to be on there when making schedule, that schedule is completely made up").
   A schedule row made from a template is a suggestion until a person adds it on the job (📋 Suggested schedule):
   draft === true, or an older template row (tpl) whose author is the automations. Suggestions never show on the
   schedule list, the calendars, the dashboard, Field "today", the office TV, the portals, sub texts, reminders or
   notifications. The automatic Start / Finish milestone (_autoBookend) is HIDDEN (kept, never deleted) when a
   person-made start / end item ("… — Project Start", "… — End Date") is on the same day for the same job.
   The same rule runs on the server (netlify/functions/_lib/schedvis.js).
     window._gcSchedDraft(row)                   → true for a suggestion
     window._gcSchedVisible(list)                → the list people see (the same array when nothing is hidden; cached)
     window._gcSchedHiddenBookend(row, list)     → true for a hidden duplicate Start / Finish
     window._gcSchedPersonBookend(list, pid, k)  → the job has a person-made start ('start') / end ('finish') item */
(function(){
'use strict';
if (window._gcSchedVisible) return;
var AUTO_BY = /^(auto|automations?|automatic|system|template)$/i;
var START_T = /\b(project start|start date|job start)\b/i, END_T = /\b(end date|project end|project finish|job end|finish date|completion date)\b/i;
function s(v){ return v == null ? '' : String(v).trim(); }
function d10(v){ return s(v).slice(0, 10); }
function pidOf(r){ return s(r && (r.pid != null && r.pid !== '' ? r.pid : (r.projectId || r.jobId))); }
function isDraft(r){
  if (!r || typeof r !== 'object') return false;
  if (r.draft === true) return true;
  if (r.draft === false || r.acceptedBy) return false;
  return !!(r.tpl && AUTO_BY.test(s(r.by)));
}
function personMade(r){ return !!(r && typeof r === 'object' && !r._autoBookend && !isDraft(r) && r.deleted !== true && !AUTO_BY.test(s(r.by))); }
function kindOf(r){ var t = s(r && r.title); return START_T.test(t) ? 'start' : (END_T.test(t) ? 'finish' : ''); }
function personIndex(list){
  var ix = {};
  for (var i = 0; i < list.length; i++) { var r = list[i]; if (!personMade(r)) continue; var p = pidOf(r), k = kindOf(r); if (!p || !k) continue; ix[p + '|' + k] = 1; ix[p + '|' + k + '|' + d10(r.date)] = 1; }
  return ix;
}
function hiddenBookend(r, ix){ var k = r && r._autoBookend; return (k === 'start' || k === 'finish') && !!ix[pidOf(r) + '|' + k + '|' + d10(r.date)]; }
var WM = typeof WeakMap === 'function' ? new WeakMap() : null;
function visible(list){
  if (!Array.isArray(list)) return list;
  if (WM) { var c = WM.get(list); if (c) return c; }
  var ix = null, out = null;
  for (var i = 0; i < list.length; i++) {
    var r = list[i], hide = isDraft(r);
    if (!hide && r && r._autoBookend) { if (!ix) ix = personIndex(list); hide = hiddenBookend(r, ix); }
    if (hide) { if (!out) out = list.slice(0, i); } else if (out) out.push(r);
  }
  var res = out || list;
  if (WM) { try { WM.set(list, res); } catch (e) {} }
  return res;
}
window._gcSchedDraft = isDraft;
window._gcSchedVisible = visible;
window._gcSchedHiddenBookend = function(r, list){ return hiddenBookend(r, personIndex(Array.isArray(list) ? list : [])); };
window._gcSchedPersonBookend = function(list, pid, k){ return !!personIndex(Array.isArray(list) ? list : [])[s(pid) + '|' + k]; };
window._gcSchedVis = { isDraft: isDraft, personMade: personMade, kindOf: kindOf, visible: visible, AUTO_BY: AUTO_BY };
})();
