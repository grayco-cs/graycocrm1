/* ============================================================================
   GrayCo — CLAIM & FIELD AUTOMATIONS, shared rules (patch AUTOCLAIMS).   netlify/functions/_lib/auto-claims.js
   The SAME file runs on the server (require) and in the CRM (index.html carries a copy in its "gc-patch-autoclaims"
   script, written there by tools/patch_AUTOCLAIMS.py), so the CRM, the To-Do, the morning digest and the e-mails agree.
   Pure functions: no fetch, no storage, no clock unless one is passed in.

   Owner-approved (10/29):
   8.  PERMIT & INSPECTION TRACKER — built on what is already there: the Site Book's "Codes & permits" (gc_kv
       "gc_sitebook": r.permit { number, jurisdiction, status } and r.inspections [{ id, type, date, result }]) and the
       job inspections list of patch AUT3 (gc_kv "gc_job_inspections": { pid: [{ id, label, date, done }] }).
       A dated inspection goes on the schedule; the PM is reminded the day before; after the date the PM is asked
       "Passed / Failed / Rescheduled?"; Failed → a to-do to fix + reschedule. openTracker() = the list of everything open.
   10. DRYING LOG REMINDERS — a claim with drying equipment on site and no "Drying complete" gets
       "Take moisture readings + photos (Day N)" every day; a day with no reading is a missed day (flag + digest).
       It ends when the claim's drying is marked complete (dry standard met: claim.drying.completeAt).
   11. SUPPLEMENT TRACKER — what was added in the field (change orders, notes / photos tagged "supplement", items marked
       on the claim, field line items) and is NOT on the imported Xactimate (carrier) estimate → one list per claim
       (item, reason, qty, photos) → CSV / PDF for the adjuster.
   12. CLAIM STATUS NUDGES — no adjuster reply / status change for N days (default 5, the INS4 "Nudge the adjuster
       after" setting) → a polite follow-up drafted for the adjuster into ✅ Approvals. Never sent by itself.
       The carrier's name is never in anything the homeowner sees (carrierWords / scrubCarrier).
   ========================================================================== */
(function(root, factory){
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.GCAC = m;
})(typeof window !== 'undefined' ? window : this, function(){
'use strict';
var DAY = 864e5;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2(n){ return Math.round(num(n) * 100) / 100; }
function ymd(v){ var t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); if (!t) return ''; var d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
function addDays(d, n){ var t = new Date(ymd(d) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function days(a, b){ var x = Date.parse(ymd(a) + 'T12:00:00Z'), y = Date.parse(ymd(b) + 'T12:00:00Z'); return isFinite(x) && isFinite(y) ? Math.round((y - x) / DAY) : null; }
function clip(v, n){ var t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pidOf(x){ return s(x && (x.pid || x.projectId || x.jobId || x.project_id)); }
function live(l){ return arr(l).filter(function(x){ return x.deleted !== true && x._deleted !== true; }); }
function byPid(projects){ var m = {}; arr(projects).forEach(function(p){ if (p.id) m[s(p.id)] = p; }); return m; }
function jobClosed(p){ return !p || p.deleted === true || p.archived === true || /^(closed|archived|cancell?ed|lost|dead|complete|completed)$/i.test(s(p.status)); }
function niceDay(d){ d = ymd(d); if (!d) return ''; return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }

/* ══ 8. PERMITS & INSPECTIONS ═══════════════════════════════════════════════════════════════════════ */
/* a result in plain words → one of: passed | failed | resched | cancelled | partial | '' (still scheduled) */
function normResult(v){
  var t = low(v);
  if (!t || /^sched/.test(t)) return '';
  if (/^pass|^ok$|approv|^green/.test(t)) return 'passed';
  if (/^fail|reject|^red/.test(t)) return 'failed';
  if (/resched|moved|postpon/.test(t)) return 'resched';
  if (/cancel|not needed|n\/a/.test(t)) return 'cancelled';
  if (/partial/.test(t)) return 'partial';
  return '';
}
var RESULT_LABEL = { passed: 'Passed', failed: 'Failed', resched: 'Rescheduled', cancelled: 'Cancelled', partial: 'Partial', '': 'Scheduled' };
/* the Site Book records (an array, or the CRM's { pid: record } map) → a { pid: record } map */
function sbMap(sitebook){
  var m = {};
  if (Array.isArray(sitebook) || typeof sitebook === 'string') arr(sitebook).forEach(function(r){ if (r.id) m[s(r.id)] = r; });
  else Object.keys(obj(sitebook)).forEach(function(k){ var r = sitebook[k]; if (r && typeof r === 'object') m[s(r.id || k)] = r; });
  return m;
}
/* every inspection in one shape: { key, src: 'sitebook' | 'jobins', pid, id, type, date, time, result, notes, fixTodo, reinspOf } */
function inspections(o){
  o = o || {}; var out = [], sb = sbMap(o.sitebook), ji = obj(o.jobInspections);
  Object.keys(sb).forEach(function(pid){
    live(sb[pid].inspections).forEach(function(x){
      if (!x.id) return;
      out.push({ key: 'sb:' + pid + ':' + s(x.id), src: 'sitebook', pid: pid, id: s(x.id), type: s(x.type) || 'Inspection', date: ymd(x.date), time: s(x.time),
        result: normResult(x.result), notes: s(x.notes), reinspOf: s(x.reinspOf), rescheduledTo: s(x.rescheduledTo), answeredAt: s(x.answeredAt), answeredBy: s(x.answeredBy) });
    });
  });
  Object.keys(ji).forEach(function(pid){
    live(ji[pid]).forEach(function(x){
      if (!x.id) return;
      var res = normResult(x.result); if (!res && x.done === true) res = 'passed';
      out.push({ key: 'ji:' + pid + ':' + s(x.id), src: 'jobins', pid: s(pid), id: s(x.id), type: s(x.label || x.type) || 'Inspection', date: ymd(x.date), time: s(x.time),
        result: res, notes: s(x.notes), reinspOf: s(x.reinspOf), rescheduledTo: s(x.rescheduledTo), answeredAt: s(x.answeredAt), answeredBy: s(x.answeredBy) });
    });
  });
  return out.sort(function(a, b){ return (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : a.key < b.key ? -1 : 1; });
}
/* where an inspection stands on `today`: done (it has an answer) · undated · upcoming · tomorrow · today · ask (the date passed, no answer) */
function inspState(i, today){
  if (i.result) return i.result === 'failed' ? 'failed' : 'done';
  if (!i.date) return 'undated';
  if (i.date > today) return i.date === addDays(today, 1) ? 'tomorrow' : 'upcoming';
  if (i.date === today) return 'today';
  return 'ask';
}
/* the work for `today`: remind (the PM, the day before) · ask (after the date: Passed / Failed / Rescheduled?) ·
   fix (a failed inspection with no re-inspection booked: fix + reschedule). askDays: how far back a missing answer
   is still asked (older ones stay on the open list, but are not pushed every day). */
function inspActions(list, today, opts){
  opts = opts || {}; var askDays = opts.askDays || 21, out = { remind: [], ask: [], fix: [], today: [] };
  var reinsp = {}; arr(list).forEach(function(i){ if (i.reinspOf) reinsp[i.pid + ':' + i.reinspOf] = 1; });
  arr(list).forEach(function(i){
    var st = inspState(i, today);
    if (st === 'tomorrow') out.remind.push(i);
    else if (st === 'today') out.today.push(i);
    else if (st === 'ask' && days(i.date, today) <= askDays) out.ask.push(i);
    else if (st === 'failed' && !reinsp[i.pid + ':' + i.id] && !i.rescheduledTo) out.fix.push(i);
  });
  return out;
}
var PERMIT_STATUSES = ['Needed', 'Applied', 'Issued', 'Inspections open', 'Finaled / closed', 'Not needed'];
function permitOpen(st){ return !/final|closed|complete|not needed|n\/a|void|expired/i.test(s(st)); }
/* every permit: the Site Book's (one per job) and the job's permit rows (patch AUT3 p.permits) */
function permits(o){
  o = o || {}; var out = [], sb = sbMap(o.sitebook), P = byPid(o.projects);
  Object.keys(sb).forEach(function(pid){
    var pm = sb[pid].permit; if (!pm || !(s(pm.number) || s(pm.status) || s(pm.jurisdiction))) return;
    out.push({ key: 'sbp:' + pid, src: 'sitebook', pid: pid, type: s(pm.type) || 'Building permit', number: s(pm.number), jurisdiction: s(pm.jurisdiction),
      status: s(pm.status) || (s(pm.number) ? 'Issued' : 'Needed') });
  });
  Object.keys(P).forEach(function(pid){
    live(P[pid].permits).forEach(function(x){
      out.push({ key: 'jp:' + pid + ':' + s(x.id || x.type), src: 'job', pid: pid, id: s(x.id), type: s(x.type) || 'Permit', number: s(x.number), jurisdiction: s(x.office || x.jurisdiction),
        status: s(x.status) || (s(x.number) ? 'Issued' : 'Needed'), expires: ymd(x.expires) });
    });
  });
  return out;
}
/* the list view: every open permit and every inspection still open (no answer yet, or failed with nothing booked) */
function openTracker(o, today){
  o = o || {}; var P = byPid(o.projects), list = inspections(o), act = inspActions(list, today, { askDays: 3650 });
  var fixKeys = {}; act.fix.forEach(function(i){ fixKeys[i.key] = 1; });
  var job = function(pid){ var p = P[pid]; return p ? { name: s(p.name), pm: s(p.pm), address: s(p.address || p.jobAddress), closed: jobClosed(p) } : { name: '(job not found)', pm: '', address: '', closed: false }; };
  var ins = list.filter(function(i){ var st = inspState(i, today); return st !== 'done' && (st !== 'failed' || fixKeys[i.key]); })
    .map(function(i){ var j = job(i.pid); return Object.assign({}, i, { state: inspState(i, today), job: j.name, pm: j.pm, address: j.address, jobClosed: j.closed }); })
    .filter(function(i){ return !i.jobClosed || i.state === 'ask' || i.state === 'failed'; });
  var per = permits(o).filter(function(x){ return permitOpen(x.status); })
    .map(function(x){ var j = job(x.pid); return Object.assign({}, x, { job: j.name, pm: j.pm, address: j.address, jobClosed: j.closed }); })
    .filter(function(x){ return !x.jobClosed; });
  return { permits: per.sort(function(a, b){ return a.job < b.job ? -1 : 1; }), inspections: ins, counts: { permits: per.length, inspections: ins.length, ask: ins.filter(function(i){ return i.state === 'ask'; }).length, failed: ins.filter(function(i){ return i.state === 'failed'; }).length } };
}
/* the schedule row of a dated Site Book inspection (patch AUT3 already puts the job inspections list on it) — internal:
   never in the customer portal */
function schedRow(i, p){
  p = p || {};
  return { id: 'SB_INS_' + s(i.pid) + '_' + s(i.id), title: (s(p.name) ? s(p.name) + ' — ' : '') + '🔎 ' + s(i.type) + ' inspection', pid: s(i.pid), date: i.date, time: s(i.time) || '09:00', endTime: '10:00',
    type: 'inspection', assignee: s(p.pm), address: s(p.address || p.jobAddress), notes: 'From the Site Book (Codes & permits)' + (i.notes ? ' — ' + i.notes : ''), insId: s(i.id),
    internal: true, portal: false, showInPortal: false, by: 'Automations (Site Book)' };
}
/* the to-do ids, the same on the server and in the CRM (so the two never make a second one) */
function fixTodoId(i){ return 'acinsp_fix_' + s(i.pid).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) + '_' + s(i.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40); }
function fixTodo(i, p, pmEmail, today){
  p = p || {};
  return { id: fixTodoId(i), label: '🔧 Fix + reschedule: failed ' + s(i.type) + ' inspection — ' + clip(p.name || 'job', 70),
    note: 'The ' + s(i.type) + ' inspection on ' + niceDay(i.date) + ' failed' + (i.notes ? ' (' + clip(i.notes, 160) + ')' : '') + '. Fix what the inspector wrote up, then book the re-inspection (Site Book → Codes & permits, or the To-Do\'s Reschedule).',
    assignees: pmEmail ? [low(pmEmail)] : [], pid: s(i.pid), due: today, prio: 'high', kind: 'insp_fix', insKey: i.key, addedBy: 'Automations', done: false };
}

/* ══ 10. DRYING LOG REMINDERS ═══════════════════════════════════════════════════════════════════════ */
function liveEquip(c){ return live(c && c.equipment); }
function dryingComplete(c){ return !!(c && c.drying && s(c.drying.completeAt)); }
/* the days with a reading (moisture or atmospherics), plus photo days when given */
function loggedDays(c, extraDays){
  var d = {};
  live(c && c.moisture).concat(live(c && c.atmos)).forEach(function(x){ var k = ymd(x.date || x.at); if (k) d[k] = 1; });
  (Array.isArray(extraDays) ? extraDays : []).forEach(function(k){ k = ymd(k); if (k) d[k] = 1; });
  return d;
}
/* one claim's drying: null when it is not drying. day = Day N (the first equipment day is Day 1). missed = the days
   from Day 1 to yesterday with no reading while equipment was on site (newest last, at most 30). */
function dryingOf(c, today, opts){
  opts = opts || {};
  if (!c || c.deleted || dryingComplete(c) || /^closed$/i.test(s(c.phase))) return null;
  if (c.importedHistory === true || c.historyOnly === true) return null;
  var eq = liveEquip(c), onsite = eq.filter(function(e){ return !s(e.removedAt) && ymd(e.placedAt) && ymd(e.placedAt) <= today; });
  if (!onsite.length && !(c.drying && c.drying.active === true)) return null;
  var starts = eq.map(function(e){ return ymd(e.placedAt); }).filter(Boolean).sort();
  var start = starts[0] || ymd(c.drying && c.drying.startAt) || today;
  var logged = loggedDays(c, opts.photoDays), missed = [];
  var onOn = function(d){ return eq.some(function(e){ var a = ymd(e.placedAt), b = ymd(e.removedAt); return a && a <= d && (!b || b > d); }) || (c.drying && c.drying.active === true); };
  for (var d = start, n = 0; d < today && n < 400; d = addDays(d, 1), n++) if (!logged[d] && onOn(d)) missed.push(d);
  var last = Object.keys(logged).sort().pop() || '';
  return { claimId: s(c.id), pid: pidOf(c), start: start, day: (days(start, today) || 0) + 1, loggedToday: !!logged[today], missed: missed.slice(-30), lastLog: last,
    onsite: onsite.reduce(function(t, e){ return t + Math.max(1, num(e.qty) || 1); }, 0) };
}
function dryingJobs(claims, today, opts){ return arr(claims).map(function(c){ return dryingOf(c, today, opts); }).filter(Boolean); }
/* who takes the readings: the claim's mitigation tech, else the job's, else the PM */
function dryingWho(c, p){ c = c || {}; p = p || {}; return [s(c.mitTech || c.tech || (c.drying || {}).tech), s(p.mitigationTech || p.mitTech), s(c.pm || p.pm)].filter(Boolean).filter(function(v, i, a){ return a.indexOf(v) === i; }); }
function dryingTitle(d, jobName){ return '💧 Take moisture readings + photos (Day ' + d.day + ') — ' + clip(jobName || 'drying job', 70); }
function missedText(d){ var n = d.missed.length; if (!n) return ''; return '⚠ ' + n + ' drying day' + (n > 1 ? 's' : '') + ' with no readings (' + d.missed.slice(-3).map(niceDay).join(', ') + (n > 3 ? ' …' : '') + ') — log them before the adjuster asks'; }

/* ══ 11. SUPPLEMENT TRACKER ═════════════════════════════════════════════════════════════════════════ */
var STOP = { the: 1, and: 1, for: 1, with: 1, from: 1, per: 1, all: 1, new: 1, add: 1, item: 1, items: 1, each: 1, labor: 1, only: 1, room: 1, area: 1 };
var SYN = [[/\bdrywall|sheetrock|gypsum\b/g, 'drywall'], [/\bshingles?|laminated|comp(osition)?\b/g, 'shingle'], [/\bunderlayment|felt|synthetic\b/g, 'underlay'], [/\bdetach (&|and) reset|d&r|r&r|remove (&|and) replace\b/g, 'dr'], [/\bbaseboards?\b/g, 'baseboard'], [/\bcarpet pad|padding\b/g, 'pad'], [/\bpaint(ing|ed)?\b/g, 'paint']];
function words(t){
  t = low(t); SYN.forEach(function(x){ t = t.replace(x[0], x[1]); });
  return t.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function(w){ return w.length >= 3 && !STOP[w] && !/^\d+$/.test(w); });
}
/* is this field item already on the carrier's estimate? (same words, or most of them) */
function onEstimate(desc, carrierLines){
  var a = words(desc); if (!a.length) return false;
  var A = {}; a.forEach(function(w){ A[w] = 1; });
  return arr(carrierLines).some(function(l){
    var b = words(l.desc || l.description), hit = 0, B = {};
    b.forEach(function(w){ if (!B[w]) { B[w] = 1; if (A[w]) hit++; } });
    var n = Math.min(Object.keys(A).length, Object.keys(B).length);
    return n > 0 && hit >= Math.min(2, n) && hit / n >= 0.75;
  });
}
function hasSuppTag(x){
  if (!x) return false;
  if (x.supplement === true || x.isSupplement === true) return true;
  var tags = Array.isArray(x.tags) ? x.tags : (s(x.tags) ? s(x.tags).split(/[,;]/) : []);
  if (tags.some(function(t){ return /^#?supp(lement)?$/i.test(s(t && typeof t === 'object' ? (t.name || t.label || t.tag) : t)); })) return true;
  return /#supp(lement)?\b|\[supp(lement)?\]|^\s*supp(lement)?\s*:/i.test(s(x.text || x.note || x.body || x.caption || x.desc));
}
/* the carrier's (imported Xactimate) lines: the newest carrier-side version, else the newest imported version */
function carrierLines(c){
  var v = live(c && c.estimates).filter(function(e){ return arr(e.lines).length; });
  var car = v.filter(function(e){ return /carrier/i.test(s(e.side)) || /carrier|adjuster/i.test(s(e.source)); });
  var pick = (car.length ? car : v.filter(function(e){ return /xact|pdf|esx|import/i.test(s(e.source || e.kind || e.from)) || e.importedAt; })).sort(function(a, b){ return num(a.version) - num(b.version) || (s(a.importedAt || a.createdAt) < s(b.importedAt || b.createdAt) ? -1 : 1); }).pop();
  return pick ? arr(pick.lines) : [];
}
/* o: { claim, project, changeOrders, photos (GrayCo Photos records of the job), notes (more field notes: Site Book logs …),
   carrierLines (default: carrierLines(claim)) } → [{ key, src, item, reason, qty, unit, photos[], at, by, amount, include }] */
function suppCollect(o){
  o = o || {}; var c = o.claim || {}, p = o.project || {}, pid = s(c.projectId || p.id), out = [], seen = {};
  var lines = o.carrierLines || carrierLines(c), fs = obj(c.fieldSupp), marks = obj(fs.marks);
  function add(x){
    if (!x.item) return; var k = x.key; if (seen[k]) return; seen[k] = 1;
    x.onEstimate = onEstimate(x.item, lines);
    var m = marks[k] || {};
    x.include = m.include != null ? m.include !== false : !x.onEstimate;
    if (m.qty != null && s(m.qty) !== '') x.qty = num(m.qty);
    if (s(m.reason)) x.reason = s(m.reason);
    if (s(m.item)) x.item = s(m.item);
    x.qty = num(x.qty) || 1; x.unit = s(x.unit) || 'EA'; x.photos = arr(x.photos).slice(0, 12);
    out.push(x);
  }
  live(fs.items).forEach(function(x){ add({ key: 'f:' + s(x.id), src: 'Added in the field', item: s(x.item || x.desc), reason: s(x.reason), qty: x.qty, unit: x.unit, photos: arr(x.photos), at: s(x.at), by: s(x.by) }); });
  live(c.suppMarks).forEach(function(x){ add({ key: 'm:' + s(x.id), src: 'Marked on the job', item: s(x.desc || x.item), reason: s(x.what || x.reason) || 'Found during the job', qty: x.qty, unit: x.unit, photos: arr(x.photos), at: s(x.at), by: s(x.by), amount: r2(x.amount) }); });
  arr(o.changeOrders).forEach(function(co){
    if (!co || co.deleted || pidOf(co) !== pid || /void|cancel|reject|declin/i.test(s(co.status))) return;
    if (co.ownerPay === true || /customer pays|owner pays|homeowner pays|upgrade|not covered/i.test(s(co.desc || co.description || co.title) + ' ' + s(co.notes) + ' ' + s(co.reason))) return;   /* the customer's upgrade is not the carrier's */
    add({ key: 'co:' + s(co.id), src: 'Change order' + (s(co.status) ? ' (' + low(co.status) + ')' : ''), item: s(co.desc || co.description || co.title || co.name), reason: s(co.reason) || 'Found during the work — change order', qty: co.qty || 1, unit: co.unit, photos: arr(co.photos), at: s(co.date || co.createdAt), by: s(co.by || co.createdBy), amount: r2(co.amt != null ? co.amt : co.amount) });
  });
  live(c.notes).concat(arr(o.notes)).forEach(function(n){
    if (!hasSuppTag(n)) return;
    var t = s(n.text || n.note || n.body).replace(/#supp(lement)?\b|\[supp(lement)?\]|^\s*supp(lement)?\s*:/ig, '').trim();
    var q = /(?:^|\s)(\d+(?:\.\d+)?)\s*(sf|lf|sq|ea|sy|hr|hrs|each)\b/i.exec(t);
    add({ key: 'n:' + s(n.id || n.at), src: 'Field note', item: clip(t.split(/\n/)[0], 140), reason: clip(t, 400), qty: q ? num(q[1]) : 1, unit: q ? q[2].toUpperCase().replace(/^EACH$/, 'EA').replace(/^HRS$/, 'HR') : 'EA', photos: arr(n.photos || n.files), at: s(n.at || n.date), by: s(n.by) });
  });
  var tagged = arr(o.photos).filter(function(ph){ return !ph.deleted && hasSuppTag(ph); });
  var used = {}; out.forEach(function(x){ x.photos.forEach(function(ph){ used[s(ph.id || ph.ref || ph)] = 1; }); });
  tagged.forEach(function(ph){
    var id = s(ph.id || ph.ref); if (used[id]) return;
    var cap = s(ph.caption || ph.note || ph.desc || ph.text).replace(/#supp(lement)?\b/ig, '').trim();
    add({ key: 'ph:' + id, src: 'Photo tagged "supplement"', item: cap ? clip(cap, 140) : 'Supplement photo' + (s(ph.room) ? ' — ' + s(ph.room) : ''), reason: cap || 'Photo taken in the field', qty: 1, unit: 'EA', photos: [{ id: id, ref: s(ph.ref || ph.url || ph.path), name: s(ph.name || cap || 'photo') }], at: s(ph.takenAt || ph.at || ph.createdAt), by: s(ph.by) });
  });
  return out.sort(function(a, b){ return (a.include === b.include ? 0 : a.include ? -1 : 1) || (s(a.at) < s(b.at) ? -1 : 1); });
}
function csvCell(v){ var t = s(v).replace(/\r?\n/g, ' '); if (/^[=+\-@]/.test(t)) t = "'" + t; return /[",]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
/* the export for the adjuster (only the included items): Item, Reason, Qty, Unit, Photos, Source, Date */
function suppCsv(items, meta){
  meta = meta || {};
  var rows = [['Item', 'Reason', 'Qty', 'Unit', 'Photos', 'Source', 'Date']];
  arr(items).filter(function(x){ return x.include !== false; }).forEach(function(x){ rows.push([x.item, x.reason, x.qty, x.unit, arr(x.photos).map(function(p){ return s(p.name || p.ref || p.id); }).join(' | '), x.src, ymd(x.at)]); });
  var head = meta.claimNumber || meta.insured ? ['# Supplement request' + (meta.claimNumber ? ' — claim ' + meta.claimNumber : '') + (meta.insured ? ' — ' + meta.insured : '')] : [];
  return head.concat(rows.map(function(r){ return r.map(csvCell).join(','); })).join('\r\n') + '\r\n';
}

/* ══ 12. CLAIM STATUS NUDGES ════════════════════════════════════════════════════════════════════════ */
function adjusterOf(c){ c = c || {}; var d = c.deskAdjuster || {}, a = c.adjuster || {}, L = c.links || {}; return { name: s(d.name || a.name), email: low(d.email || a.email || (L.email || {}).to) }; }
/* the newest sign of life on the claim: a status (phase / stage) change, an adjuster e-mail or any note that is not
   internal, a follow-up, an estimate / supplement / payment change, the adjuster's last contact (INS4) */
function lastActivity(c){
  c = c || {}; var x = c.ins4 || {}, l = [s(c.createdAt), s(x.adjLast), s(x.stageAt), s(c.adjReplyAt), s(c.lastAdjusterReplyAt)];
  arr(c.phaseHistory).forEach(function(h){ l.push(s(h.at)); });
  arr(x.log).forEach(function(h){ if (h && /stage|moved|adjuster|answer|repl/i.test(s(h.what || h.text))) l.push(s(h.at)); });
  live(c.notes).forEach(function(n){ if (!n.internal || /^in$|inbound|received/i.test(s(n.dir || n.direction || n.kind))) l.push(s(n.at)); });
  arr(c.followups).forEach(function(f){ l.push(s(f.at)); });
  live(c.estimates).forEach(function(e){ l.push(s(e.importedAt), s(e.statusAt), s(e.approvedAt)); });
  live(c.supplements).forEach(function(e){ l.push(s(e.sentAt), s(e.statusAt), s(e.approvedAt)); });
  live(c.payments).forEach(function(e){ l.push(s(e.receivedAt || e.at || e.date)); });
  return l.filter(function(t){ return t && isFinite(Date.parse(t)); }).sort().pop() || '';
}
/* is a nudge due? opts: { days (default 5), lastNudge (ISO: the newest nudge drafted for this claim, sent or not) } */
function nudgeDue(c, now, opts){
  opts = opts || {}; var n = Math.max(1, num(opts.days) || 5), a = adjusterOf(c);
  if (!c || c.deleted) return { due: false, why: 'deleted' };
  if (c.importedHistory === true || c.noSend === true || c.historyOnly === true) return { due: false, why: 'history' };
  if (c.autoNudge === false) return { due: false, why: 'switched off on this claim' };
  if (/^(closed|new loss)$/i.test(s(c.phase)) || /^(closed|fnol)$/i.test(s((c.ins4 || {}).stage))) return { due: false, why: 'not waiting on the adjuster (' + (s(c.phase) || 'new') + ')' };
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(a.email)) return { due: false, why: 'no adjuster e-mail on the claim' };
  var last = [lastActivity(c), s(opts.lastNudge)].filter(Boolean).sort().pop();
  if (!last) return { due: false, why: 'no dates' };
  var d = Math.floor((now - Date.parse(last)) / DAY);
  return { due: d >= n, days: d, since: last, after: n, why: d >= n ? 'no reply / status change for ' + d + ' days' : 'quiet for ' + d + ' of ' + n + ' days' };
}
var PHASE_ASK = { 'Inspection': 'the inspection and the next steps', 'Estimate written': 'our estimate', 'Submitted to carrier': 'your review of our estimate', 'Approved': 'the approval and the first payment', 'Supplement': 'the supplement we sent', 'Work': 'the claim while the work is under way', 'Final invoice': 'the final invoice and the release of the recoverable depreciation', 'Depreciation released': 'the final payment' };
function nudgeDraft(c, p, pm, opts){
  c = c || {}; p = p || {}; pm = pm || {}; opts = opts || {};
  var a = adjusterOf(c), first = s(a.name).split(/\s+/)[0] || 'there';
  var ref = [s(c.claimNumber) ? 'claim #' + s(c.claimNumber) : '', s(c.insured || p.client), s(c.address || p.address)].filter(Boolean).join(' — ');
  var what = PHASE_ASK[s(c.phase)] || 'this claim';
  var sign = [s(pm.name) || 'GrayCo Construction Services', 'GrayCo Construction Services · 901-585-0944'].concat(s(pm.phone) ? [s(pm.phone)] : []);
  var text = 'Hi ' + first + ',\n\nI hope your week is going well. I wanted to follow up on ' + what + ' for ' + (ref || 'this claim') + '. ' +
    'We have not heard back in ' + (num(opts.days) || 5) + ' days, so I wanted to make sure nothing is held up on our side.\n\n' +
    'Is there anything else you need from us — photos, measurements, documents or a re-inspection? Any update on where it stands would be a big help.\n\nThank you for your time,\n' + sign.join('\n');
  var subject = 'Following up' + (s(c.claimNumber) ? ' — claim #' + s(c.claimNumber) : '') + (s(c.insured || p.client) ? ' — ' + s(c.insured || p.client) : '') + (s(c.address || p.address) ? ' — ' + clip(c.address || p.address, 60) : '');
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#14202E">' + esc(text).replace(/\n/g, '<br>') + '</div>';
  return { to: a.email, toName: a.name, subject: subject, text: text, html: html };
}
/* the carrier / program / adjusting company / policy words of a claim + its job — never shown to the homeowner */
function carrierWords(c, p){
  c = c || {}; p = p || {};
  return [s(c.carrier), s(c.program && !/^none/i.test(s(c.program)) ? c.program : ''), s((c.adjuster || {}).company), s((c.deskAdjuster || {}).company), s(c.policyNumber), s(p.carrier), s(p.insuranceCarrier), s(p.insuranceCompany)]
    .filter(function(w){ return w.length > 2; }).filter(function(v, i, a){ return a.indexOf(v) === i; });
}
function scrubCarrier(text, words){ var t = s(text); (words || []).map(s).filter(function(w){ return w.length > 2; }).forEach(function(w){ t = t.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'your insurance company'); }); return t; }

return {
  normResult: normResult, RESULT_LABEL: RESULT_LABEL, sbMap: sbMap, inspections: inspections, inspState: inspState, inspActions: inspActions, PERMIT_STATUSES: PERMIT_STATUSES, permitOpen: permitOpen,
  permits: permits, openTracker: openTracker, schedRow: schedRow, fixTodoId: fixTodoId, fixTodo: fixTodo,
  dryingOf: dryingOf, dryingJobs: dryingJobs, dryingWho: dryingWho, dryingTitle: dryingTitle, missedText: missedText, dryingComplete: dryingComplete, loggedDays: loggedDays,
  words: words, onEstimate: onEstimate, hasSuppTag: hasSuppTag, carrierLines: carrierLines, suppCollect: suppCollect, suppCsv: suppCsv,
  adjusterOf: adjusterOf, lastActivity: lastActivity, nudgeDue: nudgeDue, nudgeDraft: nudgeDraft, carrierWords: carrierWords, scrubCarrier: scrubCarrier,
  ymd: ymd, addDays: addDays, days: days, niceDay: niceDay, arr: arr, obj: obj, s: s, low: low, num: num, clip: clip, esc: esc, jobClosed: jobClosed
};
});
