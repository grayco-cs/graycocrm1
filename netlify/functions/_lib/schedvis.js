// netlify/functions/_lib/schedvis.js — patch SCHEDPICK (owner 11/01: "that schedule is completely made up … it should
// be chosen to be on there when making schedule"; "the templates DON'T APPLY AUTOMATICALLY UNLESS I CLICK APPLY").
//
// A schedule row made from a template is a SUGGESTION until a person adds it: draft === true, or (older rows) a
// template row (tpl) whose author is the automations. A suggestion is never the schedule: no portal (customer, GC,
// sub), no calendar feed, no sub text, no reminder, no plan, no field "today". Accepting it on the job clears draft and
// stamps the person (by / acceptedBy).
// The automatic Start / Finish milestones (_autoBookend) are hidden — not deleted — when a person-made start / end item
// ("… — Project Start", "… — End Date") is on the same day for the same job.
// The CRM page carries the same rule (index.html, patch SCHEDPICK core: window._gcSchedVisible); test_SCHEDPICK checks
// the two agree.
'use strict';
const AUTO_BY = /^(auto|automations?|automatic|system|template)$/i;
const START_T = /\b(project start|start date|job start)\b/i;
const END_T = /\b(end date|project end|project finish|job end|finish date|completion date)\b/i;
function s(v){ return v == null ? '' : String(v).trim(); }
function d10(v){ return s(v).slice(0, 10); }
function isDraft(r){
  if (!r || typeof r !== 'object') return false;
  if (r.draft === true) return true;
  if (r.draft === false || r.acceptedBy) return false;
  return !!(r.tpl && AUTO_BY.test(s(r.by)));
}
function personMade(r){ return !!(r && typeof r === 'object' && !r._autoBookend && !isDraft(r) && r.deleted !== true && !AUTO_BY.test(s(r.by))); }
function kindOf(r){ const t = s(r && r.title); return START_T.test(t) ? 'start' : (END_T.test(t) ? 'finish' : ''); }
function pidOf(r){ return s(r && (r.pid != null && r.pid !== '' ? r.pid : (r.projectId || r.jobId))); }
/* pid|kind and pid|kind|date of every person-made start / end item */
function personIndex(list){
  const ix = {};
  (Array.isArray(list) ? list : []).forEach(function(r){ if (!personMade(r)) return; const p = pidOf(r), k = kindOf(r); if (!p || !k) return; ix[p + '|' + k] = 1; ix[p + '|' + k + '|' + d10(r.date)] = 1; });
  return ix;
}
function hiddenBookend(r, ix){ const k = r && r._autoBookend; return (k === 'start' || k === 'finish') && !!ix[pidOf(r) + '|' + k + '|' + d10(r.date)]; }
/* the schedule as people see it; the same array back when nothing is hidden */
function visible(list){
  if (!Array.isArray(list)) return list;
  let ix = null, out = null;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    let hide = isDraft(r);
    if (!hide && r && r._autoBookend) { if (!ix) ix = personIndex(list); hide = hiddenBookend(r, ix); }
    if (hide) { if (!out) out = list.slice(0, i); } else if (out) out.push(r);
  }
  return out || list;
}
module.exports = { isDraft, personMade, kindOf, personIndex, hiddenBookend, visible, AUTO_BY, START_T, END_T };
