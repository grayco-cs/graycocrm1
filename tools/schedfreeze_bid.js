/* __GC_PATCH_SCHEDFREEZE__ (owner 11/20): "If I schedule job walks, meetings etc on bid portal or in schedule etc it should
   automatically go into my schedule."  window._gcBidDates — the bid dates of the bids a person works (the lead's PM / estimator /
   assigned / creator): 🚶 pre-bid meeting / site walk, ❓ questions due, ⏰ bid due, 💵 bid bond (goes in with the bid), 📦 sealed bid
   delivery — the same dates the bid reminders use (netlify/functions/_lib/bidremind.js itemsOf). They show as events (time + place,
   linked to the lead / job) on 📅 My Schedule (GrayCo Field), the Field "My schedule" strip / sheet and the Desk "My schedule" card.
   A date that already has a real schedule entry (same lead or job + same kind + same day) is not shown twice.
   And the bid portal's 💾 Save (bid job details) with a site walk / pre-bid date makes a REAL schedule entry (the gc schedule list),
   assigned to the person who saved it — on the CRM Schedule, the calendar feed (Google Calendar) and every My Schedule. */
(function(W){
'use strict';
var D = W.document;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function warn(e){ try { console.warn('[GC SCHEDFREEZE]', e && e.message || e); } catch (x) {} }
function C(){ return W._crm || {}; }
function leads(){ var l = []; try { if (typeof W._gcLaLeads === 'function') l = arr(W._gcLaLeads()); } catch (e) {} if (!l.length) l = arr(C().leads); return l; }
function prOf(l){ return obj((l && l.leadExtra && l.leadExtra.planRoom) || (l && l.planRoom)); }
/* "2026-11-25", "2026-11-25T10:00", {date, time} → { d, t } (t "HH:MM" or '') */
function when(v, t2){
  if (v && typeof v === 'object') return when(s(v.date), s(v.time));
  var m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s(v)); if (!m) return null;
  var t = m[2] ? m[2] + ':' + m[3] : (/^\d{1,2}:\d{2}$/.test(s(t2)) ? ('0' + s(t2)).slice(-5) : '');
  return { d: m[1], t: t === '00:00' && !m[2] ? '' : t };
}
function t12(t){ var m = /^(\d{2}):(\d{2})$/.exec(s(t)); if (!m) return s(t); var h = +m[1], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + m[2] + ' ' + ap; }
var CLOSED = /\b(won|lost|dead|closed|declined|no[- ]?bid|not bidding|archived|deleted|dismissed|spam)\b/i;
function open(l){ return !!l && !!l.id && !l.deleted && !l.archived && !l.mergedInto && !l.notBidding && !CLOSED.test(s(l.stage) + ' ' + s(l.status) + ' ' + s(l.bidStatus)); }
function people(l){ return [l.pm, l.estimator, l.assignedTo, l.owner, l.createdBy, l.by, l.salesRep].map(low).filter(Boolean); }
function mine(l, n){ return !!n && people(l).indexOf(n) >= 0; }
/* the kind of a real schedule entry (for "already on the schedule") */
function kindOf(x){
  if (!x) return '';
  if (x.bidKind) return s(x.bidKind);
  var t = low(x.type) + ' ' + low(x.apptKind) + ' ' + low(x.title);
  if (/pre-?bid|site walk|job walk|walkthrough|walk-through|walk through/.test(t)) return 'prebid';
  if (/question|rfi/.test(t)) return 'questions';
  if (/bid bond/.test(t)) return 'bond';
  if (/sealed/.test(t)) return 'sealed';
  if (/bid due|bids? due/.test(t)) return 'biddue';
  return '';
}
/* one lead's dates */
function datesOf(l){
  var pr = prOf(l), F = obj(pr.fields), out = [], name = s(l.name || l.title || l.client || 'Bid');
  var bid = when(l.bidDue) || when(F.bidDue);
  var pbv = obj(F.preBid), pb = when(l.preBid) || (s(pbv.date) ? when(pbv) : null) || when(l.preBidDate);
  var mand = l.preBidMandatory === true || pbv.mandatory === true, place = s(l.preBidLocation || pbv.place);
  if (pb) out.push({ kind: 'prebid', w: pb, title: '🚶 ' + (mand ? 'MANDATORY ' : '') + 'Pre-bid / site walk — ' + name, where: place || s(l.address) });
  var q = when(l.questionsDue) || when(F.questionsDue);
  if (q) out.push({ kind: 'questions', w: q, title: '❓ Questions / RFIs due — ' + name, where: '' });
  if (bid) {
    var bonds = arr(F.bonds), ck = arr(pr.checklist);
    if (s(F.bidBond) || bonds.some(function(x){ return /bid (bond|security|guarant)/i.test(s(x)); }) || ck.some(function(x){ return x && x.kind === 'bond'; }))
      out.push({ kind: 'bond', w: bid, title: '💵 Bid bond goes in with the bid — ' + name, where: '' });
    var del = s(F.delivery);
    if (/sealed/i.test(del) || /sealed|hand[- ]deliver|physical/i.test(s(l.submitMethod))) {
      var to = (/delivered to ([^;]+)/i.exec(del) || [])[1] || s(l.submitWhere);
      out.push({ kind: 'sealed', w: bid, title: '📦 Sealed bid — deliver by hand — ' + name, where: s(to) });
    }
    out.push({ kind: 'biddue', w: bid, title: '⏰ Bid due — ' + name + (s(l.dueToCompany || l.gc) ? ' (to ' + s(l.dueToCompany || l.gc) + ')' : ''), where: '' });
  }
  return out;
}
/* list({ name, all, from, to, sched }) → schedule-shaped events (virtual: never saved) */
var LC = { k: '', L: null, S: null, at: 0, v: [] };
function list(o){
  o = o || {}; var n = low(o.name), from = s(o.from) || '0000', to = s(o.to) || '9999', out = [], seen = {};
  if (!n && !o.all) return out;
  var LL = leads(), S0 = o.sched || C().schedule, ck = n + '|' + !!o.all + '|' + from + '|' + to;
  if (LC.k === ck && LC.L === LL && LC.S === S0 && Date.now() - LC.at < 5000) return LC.v.slice();   /* the strip / sheets ask often: the same answer for 5 s */
  var S = arr(S0).filter(function(x){ return x && !x.deleted && x.deleted !== true; });
  LL.forEach(function(l){
    try {
      if (!open(l) || !(o.all || mine(l, n))) return;
      var pid = s(l.jobId || l.projectId || l.convertedProjectId || l.pid);
      datesOf(l).forEach(function(x){
        var d = x.w.d; if (d < from || d > to) return;
        var k = (pid || l.id) + '|' + x.kind + '|' + d; if (seen[k]) return;
        var dup = S.some(function(y){ return s(y.date).slice(0, 10) === d && kindOf(y) === x.kind && ((s(y.leadId) && s(y.leadId) === s(l.id)) || (pid && s(y.pid) === pid) || (s(y.bidLeadId) && s(y.bidLeadId) === s(l.id))); });
        if (dup) return; seen[k] = 1;
        out.push({ id: 'bid:' + l.id + ':' + x.kind, virtual: true, bidKind: x.kind, leadId: s(l.id), pid: pid, title: x.title, date: d, time: t12(x.w.t), time24: x.w.t, address: x.where,
          type: x.kind === 'prebid' ? 'meeting' : 'reminder', apptKind: x.kind === 'prebid' ? 'Site walk' : '', assignee: s(l.estimator || l.pm || l.assignedTo), scope: 'company', source: 'Bid dates' });
      });
    } catch (e) { warn(e); }
  });
  LC = { k: ck, L: LL, S: S0, at: Date.now(), v: out };
  return out.slice();
}
function openLead(id){ try { if (typeof W._gcOpenLead === 'function') { W._gcOpenLead(id); return true; } } catch (e) { warn(e); } try { if (typeof W._setView === 'function') W._setView('leads'); } catch (e) {} return false; }
W._gcBidDates = { list: list, kindOf: kindOf, datesOf: datesOf, openLead: openLead };

/* ── the bid portal: a site walk / pre-bid date on the bid job → a real schedule entry for the person who saved it ── */
function meName(){ try { var m = W._gcMeNow; if (m && m.name) return s(m.name); } catch (e) {} try { return s(localStorage.getItem('grayco_user')); } catch (e) { return ''; } }
function upsert(up, rm){
  try { if (W._gcPmField && typeof W._gcPmField.saveSched === 'function') return Promise.resolve(W._gcPmField.saveSched(up, rm)); } catch (e) { warn(e); }
  /* no Field kit: the screen's own setter + the same pushes */
  try {
    var by = {}; up.forEach(function(x){ by[x.id] = x; }); var gone = {}; arr(rm).forEach(function(id){ gone[id] = 1; try { if (W._gcTombstone) W._gcTombstone('schedule', id); } catch (e) {} });
    var ap = function(L){ var seen = {}, out = arr(L).filter(function(x){ return !(x && gone[x.id]); }).map(function(x){ if (x && by[x.id]) { seen[x.id] = 1; return Object.assign({}, x, by[x.id]); } return x; }); up.forEach(function(x){ if (!seen[x.id]) out.push(x); }); return out; };
    var out = ap(C().schedule);
    if (typeof W._setSchedule === 'function') W._setSchedule(function(prev){ return Array.isArray(prev) ? ap(prev) : out; });
    try { if (W.idbSet) W.idbSet('schedule', out); } catch (e) {}
    try { var f = W._supaUpsertNow || W._supaUpsert; if (f) f('schedule', out); } catch (e) {}
    try { if (typeof W._gcSyncDirty === 'function') W._gcSyncDirty(['schedule']); } catch (e) {}
  } catch (e) { warn(e); return Promise.resolve(false); }
  return Promise.resolve(true);
}
/* body: the details save's body (title, address, siteWalk, crmLeadId); jobId: the bid job; pid: the CRM job linked */
function fromBidJob(jobId, body, pid){
  jobId = s(jobId); if (!jobId || !body) return Promise.resolve(null);
  var w = obj(body.siteWalk), id = 'SCHbw-' + jobId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60), me = meName(), at = new Date().toISOString();
  var had = arr(C().schedule).filter(function(x){ return x && s(x.id) === id && !x.deleted; })[0] || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s(w.date))) return had ? upsert([], [id]) : Promise.resolve(null);
  var title = '🚶 ' + (w.mandatory ? 'MANDATORY ' : '') + 'Site walk / pre-bid — ' + (s(body.title) || 'Bid job');
  var x = { id: id, type: 'appointment', apptKind: 'Site walk', bidKind: 'prebid', title: title, date: s(w.date), time: /^\d{2}:\d{2}$/.test(s(w.time)) ? t12(w.time) : s(w.time),
    address: s(w.location) || s(body.address), location: s(w.location) || s(body.address), notes: w.mandatory ? 'MANDATORY site walk (bid portal)' : 'Site walk (bid portal)',
    pid: s(pid), leadId: s(body.crmLeadId), bidLeadId: s(body.crmLeadId), bidJobId: jobId, scope: 'company', source: 'Bid portal',
    assignee: had && s(had.assignee) ? s(had.assignee) : me, by: had ? s(had.by) || me : me, createdBy: had ? s(had.createdBy) || me : me, createdAt: had ? s(had.createdAt) || at : at, updatedAt: at };
  if (had && ['date', 'time', 'title', 'address', 'pid', 'leadId'].every(function(k){ return s(had[k]) === s(x[k]); })) return Promise.resolve(had);
  return upsert([x], []).then(function(){ return x; });
}
W._gcBidDates.fromBidJob = fromBidJob;
})(window);
/* SCHEDFREEZE — the freeze guards (GrayCo Field on a phone; owner 11/20 8:06 PM "It's frozen here", 8:22 PM "New appointment and other
   buttons don't work", after a 5G → Wi-Fi switch and a resume of the installed app):
   1. 📅 My Schedule follows the data while it is open (a list that arrives late after the network drop, a save, the network coming back)
   2. "⏳ Saved on phone, sending…" tries again the moment the phone is back online or the app is opened again (and on a tap of the pill)
   3. a tap on a My Schedule / Home / time-off button always does something: when the browser drops the click (the button was redrawn
      under the finger, a touch handler ate it) the button is pressed for the person; an invisible full-screen layer left on top
      (opacity 0 / an empty transparent cover a fade never removed while the app was in the background) stops taking taps
   4. the Field Home is never left blank: a home with no content says "⚠️ Couldn't load — tap to retry" (and retries by itself) */
(function(W){
'use strict';
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function warn(e){ try { console.warn('[GC SCHEDFREEZE]', e && e.message || e); } catch (x) {} }
function later(f, ms){ return ST.call(W, function(){ try { f(); } catch (e) { warn(e); } }, ms || 0); }
var LOG = [];
function note(t){ LOG.push(new Date().toISOString().slice(11, 19) + ' ' + t); if (LOG.length > 40) LOG.shift(); }
var lastPtr = 0;
function typing(){ var a = D.activeElement; return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest && a.closest('.gc-ra-sheet,.gc-to-ov')); }

/* 1 + 2: refresh the open My Schedule; resend what is waiting */
function refresh(){ if (Date.now() - lastPtr < 900 || typing()) return; try { if (W._gcPmField && W._gcPmField.sfRefresh && W._gcPmField.sfRefresh()) note('my schedule redrawn (new data)'); } catch (e) { warn(e); } }
SI.call(W, function(){ if (!D.hidden) refresh(); }, 1500);
function waiting(){ var n = 0; try { n += (W._gcUnsent ? W._gcUnsent().length : 0) + (W._gcSending ? W._gcSending().length : 0); } catch (e) {} try { if (W._gcSyncQ && W._gcSyncQ.waiting) n += W._gcSyncQ.waiting().length; } catch (e) {} return n; }
var pushAt = 0;
function resend(why){
  if (navigator.onLine === false || Date.now() - pushAt < 4000) return false;
  if (!waiting()) return false;
  pushAt = Date.now(); note('resend (' + why + ')');
  try { if (typeof W._gcPushAll === 'function') W._gcPushAll(); } catch (e) { warn(e); }
  try { if (W._gcSyncQ && typeof W._gcSyncQ.flush === 'function') W._gcSyncQ.flush(); } catch (e) {}
  try { if (W._gcClaims && typeof W._gcClaims.flush === 'function') W._gcClaims.flush(); } catch (e) {}
  return true;
}
/* the lists did not load (the network dropped while the app opened): the people list is the built-in one — I am not on it, and
   everything keyed to me (🏖 Time off, 📅 Availability, 🗂 My requests, my schedule) does nothing. Read the lists again as soon as the
   network answers (and every 15 s until they are in) */
var pullAt = 0;
function authEmail(){ try { var A = W.__GC_AUTH__; return String(A && A.email && A.email() || '').toLowerCase(); } catch (e) { return ''; } }
function listsMissing(){ var e = authEmail(); if (!e || !W._crm) return false; var U = W._crm.users; return !Array.isArray(U) || !U.some(function(u){ return u && String(u.email || '').toLowerCase() === e; }); }
function repull(why){
  if (navigator.onLine === false || !listsMissing() || Date.now() - pullAt < 15000 || typeof W._gcPullNow !== 'function') return false;
  pullAt = Date.now(); note('lists re-read (' + why + '): I was not on the people list');
  try { Promise.resolve(W._gcPullNow(true)).catch(function(e){ warn(e); }); } catch (e) { warn(e); }
  return true;
}
SI.call(W, function(){ if (!D.hidden) repull('timer'); }, 5000);
function back(why){ later(function(){ repull(why); }, 800); later(function(){ resend(why); }, 1500); later(refresh, 2500); later(homeCheck, 2000); }
W.addEventListener('online', function(){ back('online'); });
D.addEventListener('visibilitychange', function(){ if (!D.hidden) { back('resume'); later(sweep, 300); } });
W.addEventListener('pageshow', function(){ back('pageshow'); later(sweep, 300); });
W.addEventListener('focus', function(){ later(sweep, 300); });
D.addEventListener('click', function(e){ var t = e.target; if (t && t.closest && t.closest('#gc-fh-sync[data-k="wait"],#gc-fh-sync[data-k="off"]')) { pushAt = 0; if (!resend('tap')) later(function(){ resend('tap'); }, 800); } }, true);

/* 3a: an invisible layer on top takes no taps */
var KEEP = /^(_gcJobPick|gc-fh-tabs|gc-auth-gate)$/;
function topOf(e){ while (e && e.parentElement && e.parentElement !== D.body && e.parentElement !== D.documentElement) e = e.parentElement; return e; }
function ghost(e){
  try {
    if (!e || e.nodeType !== 1 || e === D.body || KEEP.test(e.id || '') || (e.classList && (e.classList.contains('gc-ra-sheet') || e.classList.contains('gc-to-ov')))) return false;
    var cs = W.getComputedStyle(e); if (cs.position !== 'fixed' || cs.pointerEvents === 'none' || cs.display === 'none') return false;
    var r = e.getBoundingClientRect(), vw = W.innerWidth || 1, vh = W.innerHeight || 1;
    if (r.width * r.height < 0.3 * vw * vh) return false;
    if (cs.visibility === 'hidden') return false;   /* takes no taps anyway (a closed side panel) */
    if (+cs.opacity <= 0.05) return true;
    var clear = /^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor) && cs.backgroundImage === 'none';
    return clear && !(e.innerText || '').trim() && !e.querySelector('img,canvas,video,iframe,svg,input,button');
  } catch (x) { return false; }
}
function sweep(){
  try { Array.prototype.forEach.call(D.body ? D.body.children : [], function(e){ if (ghost(e)) { e.style.pointerEvents = 'none'; e.setAttribute('data-sf-ghost', '1'); note('invisible layer stopped taking taps: ' + (e.id || e.className || e.tagName)); } }); } catch (e) { warn(e); }
}

/* 3b: the tap that lost its click */
var WATCH = '.gc-pmf-sheet,.gc-to-ov,#_gcJobPick,#gc-fh-tabs,#gc-to-strip';
var BTN = '[data-pmf-a],[data-to-a],[data-x],[data-to-x],[data-ra-a],[data-sf],#gc-fh-tabs [data-t]';
var T = null;
function same(b){
  try {
    var sel = ['data-pmf-a', 'data-to-a', 'data-v', 'data-id', 'data-t', 'data-k', 'data-ra-a'].filter(function(a){ return b.hasAttribute(a); }).map(function(a){ return '[' + a + '="' + String(b.getAttribute(a)).replace(/"/g, '\\"') + '"]'; }).join('');
    if (!sel) return null; var L = D.querySelectorAll(sel); return L.length ? L[L.length - 1] : null;
  } catch (e) { return null; }
}
W.addEventListener('pointerdown', function(e){
  lastPtr = Date.now(); T = null;
  try {
    var x = e.clientX, y = e.clientY, hit = D.elementFromPoint ? D.elementFromPoint(x, y) : e.target, top = topOf(hit);
    if (top && ghost(top)) { top.style.pointerEvents = 'none'; top.setAttribute('data-sf-ghost', '1'); note('tap through an invisible layer: ' + (top.id || top.className || top.tagName)); hit = D.elementFromPoint(x, y); }
    var b = hit && hit.closest ? hit.closest(BTN) : null;
    if (!b || !b.closest(WATCH) || b.disabled) return;
    T = { b: b, x: x, y: y, at: Date.now(), clicked: false };
  } catch (x2) { T = null; }
}, true);
W.addEventListener('click', function(e){ if (T && e.target && (T.b === e.target || T.b.contains(e.target) || (e.target.closest && same(T.b) === e.target.closest(BTN)))) T.clicked = true; }, true);
W.addEventListener('pointerup', function(e){
  var t = T; if (!t) return;
  if (Math.abs(e.clientX - t.x) > 12 || Math.abs(e.clientY - t.y) > 12 || Date.now() - t.at > 1500) { T = null; return; }
  later(function(){
    if (t.clicked || T !== t) return; T = null;
    var b = t.b.isConnected ? t.b : same(t.b); if (!b || b.disabled) return;
    note('tap without a click → pressed: ' + (b.getAttribute('data-pmf-a') || b.getAttribute('data-to-a') || b.getAttribute('data-t') || b.textContent.trim().slice(0, 20)));
    b.click();
  }, 450);
}, true);
W.addEventListener('pointercancel', function(){ T = null; }, true);

/* 4: the Field Home is never blank */
var blankSince = 0;
function homeCheck(){
  var h = D.querySelector('#_gcJobPick.gc-fh'), w = h && h.querySelector('.fh-wrap'), f = D.getElementById('gc-sf-homefail');
  if (!w) { blankSince = 0; return; }
  var has = Array.prototype.some.call(w.children, function(c){ return c.id !== 'gc-to-strip' && c.id !== 'gc-sf-homefail' && c.getClientRects().length && c.getBoundingClientRect().height > 8; });
  if (has) { blankSince = 0; if (f) f.remove(); return; }
  if (!blankSince) { blankSince = Date.now(); try { if (W._gcRA && W._gcRA.sync) W._gcRA.sync(); } catch (e) {} return; }
  if (Date.now() - blankSince < 2500 || f) return;
  f = D.createElement('div'); f.id = 'gc-sf-homefail'; f.setAttribute('role', 'alert');
  f.style.cssText = 'margin:12px 0;padding:14px;border:1px solid #fcd34d;background:#fffbeb;border-radius:14px;color:#92400e;font:600 14px Inter,sans-serif;display:flex;flex-direction:column;gap:10px';
  f.innerHTML = '<b>⚠️ Couldn’t load your home</b><span style="font-weight:500">' + (navigator.onLine === false ? 'No connection right now — it fills in by itself when you are back online.' : 'It is trying again by itself.') + '</span>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-sf="homeretry" style="min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid #d97706;background:#fff;font:700 14px Inter,sans-serif">↻ Tap to retry</button>' +
    '<button type="button" data-sf="sched" style="min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid #d1d5db;background:#fff;font:700 14px Inter,sans-serif">📅 My Schedule</button></div>';
  w.appendChild(f); note('home blank → retry card');
}
function homeRetry(){ blankSince = 0; try { if (W._gcRA && W._gcRA.sync) W._gcRA.sync(); } catch (e) { warn(e); } try { if (W._gcField && W._gcField.render) W._gcField.render(true); } catch (e) { warn(e); } }
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-sf]') : null; if (!b) return;
  var k = b.getAttribute('data-sf');
  if (k === 'homeretry') { homeRetry(); resend('retry'); }
  else if (k === 'sched') { try { if (W._gcPmField && W._gcPmField.open) W._gcPmField.open({ reset: true }); else if (W._gcTimeOff && W._gcTimeOff.open) W._gcTimeOff.open(); } catch (x) { warn(x); } }
}, true);
SI.call(W, function(){ if (!D.hidden) { homeCheck(); if (blankSince && Date.now() - blankSince > 2500 && (Date.now() - blankSince) % 6000 < 1600) homeRetry(); } }, 1500);
try { var cs0 = D.createElement('style'); cs0.id = 'gc-sf-css'; cs0.textContent = '.gc-pmf-sferr{margin:10px 0;padding:12px;border:1px solid #fcd34d;background:#fffbeb;border-radius:12px;color:#92400e;display:flex;flex-direction:column;gap:6px;font:600 14px Inter,sans-serif}.gc-pmf-sferr small{font-weight:500;color:#78350f}.gc-pmf-sferr button{align-self:flex-start;min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid #d97706;background:#fff;color:#92400e;font:700 14px Inter,sans-serif}#gc-fh-sync[data-k="wait"],#gc-fh-sync[data-k="off"]{cursor:pointer}'; (D.head || D.documentElement).appendChild(cs0); } catch (e) {}
later(sweep, 1500);
W._gcSF = { log: function(){ return LOG.slice(); }, repull: repull, listsMissing: listsMissing, sweep: sweep, resend: resend, homeCheck: homeCheck, waiting: waiting, ghost: ghost,
  pull: function(){ try { if (navigator.onLine !== false && typeof W._gcPullNow === 'function') Promise.resolve(W._gcPullNow()).catch(function(){}); } catch (e) {} } };
})(window);
