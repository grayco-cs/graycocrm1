/* patch OFFICETAB (owner 10/30): "what is this office tab … can this be like monitoring the office todo list being able to add
   todo and tasks and see everything office does within this tab" + "see performance from the estimator … for people in the CRM"
   + "the office to help estimators stay on top of stuff, PMs keep up with job progressions" + "leads to PMs not contacted too".
   The 🏢 Office tab (gcOfficeManager) gets new tabs in its own tab bar; the old ones (📊 Overview = "What needs you today",
   ✅ To-Do, 🚩 Flagged, 💰 Invoices, 📷 Photos) stay as they were:
     🏢 Office (admins)    the office person's own ✅ To-Do, as she sees it (the same TD2 engine, host "as": open, due today,
                           overdue, done today; tick / reassign / snooze / note / due date with the To-Do's own actions),
                           "＋ Task for the office" (the gc_office_tasks store, the shape 📣 Marketing's "＋ Task for marketing"
                           writes), and "What the office did" (below).
     📰 Activity (office)  "What the office did": built only from what the records already keep (…By + …At / Date fields,
                           job updates, lead activity, approvals, job messages, time clock, finished to-dos, the schedule
                           history). Person / kind / day filters, 50 at a time.
     🧭 Helpers            "Estimators: what's slipping" and "PMs: job progression" (+ leads not contacted), each line with
                           Remind (a To-Do for that person, never a text) and Open.
     👥 Team (admins only) a person picker: their activity, this week / last week numbers for their role, and "When they're
                           working" (first / last activity per day and the active hours, from the record times and the device
                           check-ins gc_adm_dev_*).
   PERFORMANCE: nothing runs unless the Office page is drawn and one of these tabs is open — no interval, no observer, no
   polling. The lists are read from memory (window._crm, localStorage); the only network read is the device check-ins
   (one request when 👥 Team opens, kept 5 minutes). Each step is its own short task.
   Who: admins (gc_staff) see all four; the office (role office) sees 📰 Activity and 🧭 Helpers on top of her page as
   before; PMs, the Marketing Manager and "View as" previews see nothing new. Console: _gcOfficeTab.state() */
(function(){
'use strict';
if (window.__GC_PATCH_OFFICETAB__) return; window.__GC_PATCH_OFFICETAB__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } } return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lsRaw(k){ try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsList(k){ return arr(lsRaw(k)); }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today(){ return ymd(new Date()); }
function dayStart(ms){ var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function crm(){ return W._crm || {}; }
function users(){ return arr(crm().users); }
function projects(){ return arr(crm().projects); }
function invoicesL(){ var c = crm(); var a = arr(c.invs); return a.length ? a : arr(c.invoices); }
function leadsL(){ var l = arr(crm().leads); if (!l.length && typeof W._gcLaLeads === 'function') { try { l = arr(W._gcLaLeads()); } catch (e) {} } return l; }
function estimatesL(){ return arr(crm().estimates); }
function call(name){ var f = W[name]; if (typeof f !== 'function') return false; try { f.apply(W, Array.prototype.slice.call(arguments, 1)); } catch (e) {} return true; }
function go(v){ try { if (typeof W._setView === 'function') W._setView(v); } catch (e) {} }
/* a time: ms number, ISO text, or a plain date (then .d = date only, at noon) */
function when(v){
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 1e11 && v < 4e12 ? { t: v, d: false } : null;
  var x = s(v); if (!x) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) { var t0 = Date.parse(x + 'T12:00:00'); return isFinite(t0) ? { t: t0, d: true } : null; }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(x)) return null;
  var t = Date.parse(x); return isFinite(t) ? { t: t, d: false } : null;
}

/* ── who is looking ── */
function authEmail(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function authAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function vas(){ try { return !!(W._gcVAS && W._gcVAS.active()); } catch (e) { return false; } }
function isMM(){ try { return typeof W._gcIsMM === 'function' && !!W._gcIsMM(); } catch (e) { return false; } }
var ROLE_C = { e: null, r: '' };
function staffRole(){ var e = authEmail(); if (ROLE_C.e === e) return ROLE_C.r; var r = ''; try { var se = W.__GC_AUTH__.session(); r = low(se && se.role); } catch (e2) {} ROLE_C = { e: e, r: r }; return r; }
function isOfficeMe(){
  var e = authEmail(); if (!e) return false;
  if (e === 'office@grayco-cs.com' || staffRole() === 'office') return true;
  return users().some(function(u){ return u && low(u.email) === e && /office/i.test(s(u.role)); });
}
/* 'admin' | 'office' | 'none' — the office keeps the office level even when it is given admin-level access (patch OFFICEFULL) */
function level(){ if (vas() || isMM()) return 'none'; if (isOfficeMe()) return 'office'; if (authAdmin()) return 'admin'; return 'none'; }
function myName(){ var e = authEmail(); var u = users().filter(function(x){ return x && low(x.email) === e && s(x.name) && !/^office$/i.test(s(x.name)); })[0] || users().filter(function(x){ return x && low(x.email) === e; })[0]; return s(u && u.name) || (e ? e.split('@')[0] : 'Admin'); }

/* ── people: one per e-mail (the users list), with every name / e-mail / id the records use for them ── */
var PP = { ref: null, list: [], map: {}, by: {} };
function roleOf(roles){
  var r = roles.join(' | ');
  if (/office/i.test(r)) return 'office'; if (/estimat/i.test(r)) return 'estimator'; if (/admin|owner/i.test(r)) return 'admin';
  if (/project\s*manager|\bpm\b|superint/i.test(r)) return 'pm'; if (/field|crew|tech|labor/i.test(r)) return 'field'; return low(roles[0] || 'staff') || 'staff';
}
function people(){
  var U = crm().users; if (PP.ref === U && PP.list.length) return PP;
  var list = [], map = {}, by = {};
  function alias(p, v){ v = low(v); if (v && !map[v]) map[v] = p.key; }
  arr(U).forEach(function(u){
    if (!u || u.departed || u.deleted || /^(inactive|disabled|terminated|offboarded)$/i.test(s(u.status))) return;
    var em = low(u.email), nm = s(u.name), key = em || low(nm); if (!key) return;
    var p = by[key]; if (!p) { p = by[key] = { key: key, email: em, name: '', roles: [], role: '' }; list.push(p); }
    if (nm && (!p.name || /^office$/i.test(p.name))) p.name = nm;
    if (s(u.role)) p.roles.push(s(u.role));
    alias(p, nm); alias(p, em); if (em) alias(p, em.split('@')[0]); if (u.id) alias(p, 'id:' + u.id);
  });
  list.forEach(function(p){ p.role = roleOf(p.roles); if (!p.name) p.name = p.email ? p.email.split('@')[0] : p.key; });
  list.forEach(function(p){ var f = low(p.name.split(/\s+/)[0]); if (f && f.length > 2 && !map[f] && list.filter(function(q){ return low(q.name.split(/\s+/)[0]) === f; }).length === 1) map[f] = p.key; });
  if (!by['office@grayco-cs.com'] && map['office']) { /* nothing: "Office" belongs to whoever has it */ }
  PP = { ref: U, list: list, map: map, by: by };
  return PP;
}
function whoKey(v){ var k = low(v).replace(/\s+—.*$/, '').replace(/\s*\(.*\)$/, ''); if (!k) return ''; return people().map[k] || ''; }
function person(k){ return people().by[k] || null; }
function officePeople(){ var l = people().list.filter(function(p){ return p.role === 'office'; }); if (!l.length && people().by['office@grayco-cs.com']) l = [people().by['office@grayco-cs.com']]; return l; }
var ROLE_L = { office: 'Office', estimator: 'Estimator', admin: 'Admin', pm: 'Project Manager', field: 'Field' };

/* ═══ THE ACTIVITY: every "…By" with its time, from the records the CRM keeps ═══ */
var VERB = { createdBy: 'created', addedBy: 'added', updatedBy: 'edited', savedBy: 'saved', by: 'saved', approvedBy: 'approved', _approvedBy: 'approved',
  decidedBy: 'decided', pmDecidedBy: 'decided (PM step)', _pmDecidedBy: 'decided (PM step)', rejectedBy: 'rejected', sentBy: 'sent', doneBy: 'finished',
  confirmedBy: 'confirmed', archivedBy: 'archived', contactedBy: 'contacted', assignedBy: 'assigned', writtenBy: 'wrote', finalizedBy: 'finalized',
  completedBy: 'completed', deletedBy: 'deleted', resolvedBy: 'resolved', acceptedBy: 'accepted', postedBy: 'posted', paidBy: 'recorded payment on',
  prioritySetBy: 'set the priority of', escalatedBy: 'escalated', signedBy: 'signed', uploadedBy: 'uploaded', receivedBy: 'received', closedBy: 'closed',
  enteredBy: 'entered', submittedBy: 'submitted', bidRoleBy: 'set the bid role of', movedBy: 'moved', reviewedBy: 'reviewed', checkedBy: 'checked', noteBy: 'added a note to' };
var KINDS = [['job', '🏗 Jobs'], ['lead', '🎯 Leads'], ['estimate', '📐 Estimates'], ['invoice', '🧾 Invoices'], ['expense', '💳 Expenses & payments'], ['approval', '✅ Approvals'],
  ['schedule', '🗓 Schedule'], ['message', '💬 Messages & texts'], ['todo', '✔️ To-dos'], ['time', '⏱ Time clock'], ['other', '📁 Other']];
var KINDN = {}; KINDS.forEach(function(k){ KINDN[k[0]] = k[1]; });
var HORIZON = 36 * 864e5;
function atFor(r, f){
  var b = f === 'by' ? '' : f.replace(/By$/, '');
  /* updatedAt is stamped again by every sync: an edit's time is the record's savedAt when it has one */
  var c = f === 'by' ? ['savedAt', 'at', 'createdAt', 'date'] : f === 'updatedBy' || f === 'savedBy' ? ['savedAt', 'updatedAt'] : [b + 'At', b + 'Date', b + 'On', b === 'added' ? 'createdAt' : '', b === 'created' ? 'created' : ''];
  for (var i = 0; i < c.length; i++) { if (!c[i]) continue; var w = when(r[c[i]]); if (w) return w; }
  return null;
}
function jobName(pid){ var p = PJ[pid]; return p ? s(p.name || p.address || p.client) : ''; }
var PJ = {};
function money(n){ var x = parseFloat(n); return isFinite(x) && x ? '$' + x.toLocaleString('en-US', { maximumFractionDigits: 0 }) : ''; }
function addEv(out, cut, who, w, kind, verb, what, open, id){
  if (!who || !w || w.t < cut) return;
  out.push({ who: who, t: w.t, d: w.d, kind: kind, verb: verb, what: what, open: open || '', id: id || '' });
}
/* one list: every "xxxBy" field of each record (or only `fields`), plus the nested logs (job updates, lead activity …) */
function scan(out, cut, kind, list, label, open, fields){
  for (var i = 0; i < list.length; i++) {
    var r = list[i]; if (!r || typeof r !== 'object') continue;
    var ks = fields || Object.keys(r), seen = null;
    for (var j = 0; j < ks.length; j++) {
      var f = ks[j], v = r[f];
      if (typeof v !== 'string' || !v || !(f === 'by' || (f.length > 2 && f.charCodeAt(f.length - 1) === 121 && /By$/.test(f)))) continue;
      if (f === '_supersededBy' || f === 'sourceSetBy' || f === 'insuranceTaggedBy' || f === 'broughtInBy' || f === 'soldBy' || f === 'estimatedBy' || f === '_draftBy') continue;
      var who = whoKey(f === 'by' && r.byEmail ? r.byEmail : (r[f + 'Email'] || v)); if (!who) continue;
      var w = atFor(r, f); if (!w || w.t < cut) continue;
      var sig = who + '|' + Math.round(w.t / 60000); if (seen && seen[sig]) continue; (seen = seen || {})[sig] = 1;
      addEv(out, cut, who, w, kind, VERB[f] || f.replace(/By$/, ''), label(r), open(r), s(r.id));
    }
    ['updates', 'activity', 'stageHistory', 'dailyLogs'].forEach(function(nk){
      var nl = r[nk]; if (!Array.isArray(nl) || !nl.length) return;
      for (var k = nl.length - 1; k >= 0; k--) {
        var x = nl[k]; if (!x || typeof x !== 'object') continue;
        var w2 = when(x.at || x.date); if (!w2 || w2.t < cut) continue;
        var who2 = whoKey(x.byEmail || x.by || x.author); if (!who2) continue;
        var txt = nk === 'stageHistory' ? 'moved ' + label(r) + ' to ' + s(x.to) : (nk === 'activity' ? s(x.text).slice(0, 90) + ' — ' + label(r) : (nk === 'dailyLogs' ? 'daily log on ' : 'job update on ') + label(r) + (x.text ? ': ' + s(x.text).slice(0, 80) : ''));
        addEv(out, cut, who2, w2, nk === 'updates' || nk === 'dailyLogs' ? 'job' : kind, nk === 'updates' || nk === 'dailyLogs' ? 'log' : (nk === 'stageHistory' ? 'stage' : 'note'), txt, open(r), s(r.id));
      }
    });
  }
}
function oJob(pid){ return pid ? 'job|' + pid : ''; }
var EV = { sig: '', at: 0, list: [], ms: 0 };
function evSig(){ return [projects().length, leadsL().length, invoicesL().length, arr(crm().expenses).length, arr(crm().schedule).length, estimatesL().length,
  lsRaw('gc_office_tasks').length, lsRaw('gc_sched_history').length, lsRaw('gc_job_messages').length, lsRaw('gc_approval_queue').length, lsRaw('gc_sub_approvals').length, lsRaw('timesheets').length].join('|'); }
function events(force){
  var sig = evSig();
  if (!force && EV.sig === sig && Date.now() - EV.at < 60000) return EV.list;
  var t0 = Date.now(), cut = t0 - HORIZON, out = [];
  PJ = {}; projects().forEach(function(p){ if (p && p.id) PJ[p.id] = p; });
  var jl = function(r){ return s(r.name || r.address || r.client) || 'a job'; };
  scan(out, cut, 'job', projects(), jl, function(r){ return oJob(r.id); });
  scan(out, cut, 'lead', leadsL(), function(r){ return s(r.name || r.company || r.address) || 'a lead'; }, function(r){ return 'lead|' + s(r.id); });
  scan(out, cut, 'estimate', estimatesL(), function(r){ return 'estimate ' + (s(r.name || r.client || r.address) || s(r.id)); }, function(r){ return r.pid ? oJob(r.pid) : 'view|estimates'; });
  var invL = function(r){ return (r.type === 'sub' ? 'sub invoice ' : 'invoice ') + (s(r.invNum || r.num) ? '#' + s(r.invNum || r.num) + ' ' : '') + money(r.amt || r.amount) + ' — ' + (s(r.client || r.sub || r.vendor) || jobName(r.pid) || ''); };
  scan(out, cut, 'invoice', invoicesL(), invL, function(r){ return r.pid ? 'jobinv|' + r.pid : 'view|invoices'; });
  var exL = function(r){ return 'expense ' + money(r.amt || r.amount) + ' — ' + (s(r.vendor || r.payee || r.merchant || r.desc) || jobName(r.pid) || ''); };
  scan(out, cut, 'expense', arr(crm().expenses), exL, function(r){ return r.pid ? oJob(r.pid) : 'view|expenses'; });
  scan(out, cut, 'expense', Array.isArray(W._gcRegisterCache) && W._gcRegisterCache.length ? W._gcRegisterCache : lsList('gcAcctRegister'), exL, function(r){ return r.pid ? oJob(r.pid) : 'view|expenses'; });
  scan(out, cut, 'expense', arr(crm().projectPayments), function(r){ return 'payment ' + money(r.amt || r.amount) + ' — ' + (jobName(r.pid) || s(r.client)); }, function(r){ return r.pid ? oJob(r.pid) : 'view|payments'; });
  scan(out, cut, 'job', arr(crm().changeOrders), function(r){ return 'change order ' + (s(r.title || r.desc) || '') + ' ' + money(r.amt || r.amount) + ' — ' + jobName(r.pid); }, function(r){ return r.pid ? oJob(r.pid) : 'view|changeorders'; });
  scan(out, cut, 'job', arr(crm().punchlist).length ? arr(crm().punchlist) : lsList('punch'), function(r){ return 'punch item "' + s(r.item || r.title).slice(0, 60) + '" — ' + jobName(r.pid); }, function(r){ return oJob(r.pid); });
  scan(out, cut, 'schedule', arr(crm().schedule), function(r){ return 'schedule: ' + s(r.title).slice(0, 70) + (r.date ? ' (' + s(r.date) + ')' : ''); }, function(r){ return r.pid ? oJob(r.pid) : 'view|schedule'; }, ['by']);
  scan(out, cut, 'customer', arr(crm().customers), function(r){ return 'customer ' + s(r.name); }, function(){ return 'view|customers'; });
  var apL = function(r){ return s(r.title || r.subject || (r.subName ? 'sub invoice — ' + r.subName : '') || (r.kind || 'approval').replace(/_/g, ' ')) + (r.jobName ? ' — ' + s(r.jobName) : (r.pid ? ' — ' + jobName(r.pid) : '')) + (r.amt || r.amount ? ' ' + money(r.amt || r.amount) : ''); };
  ['gc_approval_queue', 'gc_sub_approvals', 'gc_expense_approvals', 'gc_invoice_approvals', 'gc_check_queue'].forEach(function(k){ scan(out, cut, 'approval', lsList(k), apL, function(){ return 'appr|'; }); });
  scan(out, cut, 'todo', lsList('gc_office_tasks').concat(lsList('gc_admin_tasks')), function(r){ return 'to-do "' + s(r.label).slice(0, 80) + '"'; }, function(r){ return 'todo|' + s(r.id); }, ['addedBy', 'doneBy', 'deletedBy']);
  lsList('gc_sched_history').forEach(function(h){ if (!h) return; var w = when(h.at); var who = whoKey(h.byEmail || h.by); if (!w || !who) return; addEv(out, cut, who, w, 'schedule', s(h.kind) || 'changed', 'schedule: ' + s(h.title).slice(0, 70) + (h.text ? ' — ' + s(h.text).slice(0, 60) : ''), h.pid ? oJob(h.pid) : 'view|schedule', s(h.id)); });
  lsList('gc_job_messages').forEach(function(m){
    if (!m) return; var w = when(m.at); if (!w) return;
    var a = s(m.authorId), who = a && a !== 'me' && !/^sms:/.test(a) ? whoKey('id:' + a) || whoKey(a) : '';
    if (!who) who = whoKey(s(m.authorName).replace(/^\W+/, '').replace(/\s*\(text\)$/, ''));
    if (!who) return;
    addEv(out, cut, who, w, 'message', /^sms:/.test(a) || /\(text\)/.test(s(m.authorName)) ? 'texted' : 'messaged', jobName(m.pid) + ': “' + s(m.text).slice(0, 80) + '”', m.pid ? 'msg|' + m.pid : '', s(m.id));
  });
  lsList('gc_delete_log').forEach(function(x){ if (!x) return; var w = when(x.deletedAt), who = whoKey(x.by); if (w && who) addEv(out, cut, who, w, 'other', 'deleted', 'a record from ' + s(x.list) + (x.why ? ' (' + s(x.why).slice(0, 60) + ')' : ''), '', s(x.id)); });
  lsList('timesheets').forEach(function(r){
    if (!r || !r.date) return; var who = whoKey(r.user); if (!who) return;
    [['clockIn', 'clocked in'], ['clockOut', 'clocked out']].forEach(function(x){ var hm = s(r[x[0]]); if (!/^\d{1,2}:\d{2}$/.test(hm)) return; var t = Date.parse(s(r.date) + 'T' + (hm.length === 4 ? '0' + hm : hm) + ':00'); if (isFinite(t)) addEv(out, cut, who, { t: t, d: false }, 'time', x[1], 'at ' + hm, 'view|payroll', s(r.id)); });
  });
  out.sort(function(a, b){ return b.t - a.t; });
  /* many records stamped by one person in the same minute (a bulk change, an import, a sync) are one line */
  var KN = { job: 'jobs', lead: 'leads', estimate: 'estimates', invoice: 'invoices', expense: 'expenses', approval: 'approvals', schedule: 'schedule items', message: 'messages', todo: 'to-dos', time: 'time entries', customer: 'customers' };
  var col = [];
  for (var i = 0; i < out.length;) {
    var e = out[i], m = Math.floor(e.t / 60000), j = i + 1;
    while (j < out.length && Math.floor(out[j].t / 60000) === m && out[j].who === e.who && out[j].kind === e.kind && out[j].verb === e.verb) j++;
    if (j - i >= 5) col.push({ who: e.who, t: e.t, d: e.d, kind: e.kind, verb: e.verb, what: (j - i) + ' ' + (KN[e.kind] || 'records') + ' at once (e.g. ' + e.what.slice(0, 50) + ')', open: '', id: '', n: j - i });
    else for (var k = i; k < j; k++) col.push(out[k]);
    i = j;
  }
  out = col;
  EV = { sig: sig, at: Date.now(), list: out, ms: Date.now() - t0 };
  return out;
}
var VERBTXT = { log: '', stage: '', note: '' };
function evText(e){ var v = VERBTXT[e.verb] !== undefined ? VERBTXT[e.verb] : e.verb; return (v ? v + ' ' : '') + e.what; }
function fmtTime(e){ var d = new Date(e.t); var td = dayStart(Date.now()); var day = dayStart(e.t) === td ? '' : dayStart(e.t) === td - 864e5 ? 'Yesterday ' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ';
  return day + (e.d ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })); }
function weekStart(off){ var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * (off || 0)); return d.getTime(); }
function range(day){ var t = dayStart(Date.now()); if (day === 'today') return [t, Infinity]; if (day === 'yesterday') return [t - 864e5, t]; if (day === 'week') return [weekStart(0), Infinity]; if (day === 'lastweek') return [weekStart(1), weekStart(0)]; return [Date.now() - 30 * 864e5, Infinity]; }

/* ── the feed (one per place: 'office' = the office people, 'team' = the picked person) ── */
var UI = { tab: '', feed: { office: { who: '', kind: '', day: 'week', n: 50 }, team: { kind: '', day: 'week', n: 50 } }, teamWho: '', asWho: '', form: false, help: { open: {} }, msg: '' };
function feedHtml(place, keys){
  var F = UI.feed[place], set = {}; keys.forEach(function(k){ set[k] = 1; });
  if (place === 'office' && F.who && set[F.who]) { set = {}; set[F.who] = 1; }
  var rg = range(F.day), all = events(), rows = [];
  for (var i = 0; i < all.length; i++) { var e = all[i]; if (e.t < rg[0]) break; if (e.t >= rg[1] || !set[e.who] || (F.kind && e.kind !== F.kind)) continue; rows.push(e); }
  var shown = rows.slice(0, F.n);
  var sel = function(name, opts, cur){ return '<select class="ot-sel" data-ot-f="' + place + '|' + name + '">' + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; };
  var h = '<div class="ot-filt">';
  if (place === 'office' && keys.length > 1) h += sel('who', [['', 'Everyone in the office']].concat(keys.map(function(k){ return [k, (person(k) || {}).name || k]; })), F.who);
  h += sel('kind', [['', 'Every kind']].concat(KINDS), F.kind) + sel('day', [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['lastweek', 'Last week'], ['30', 'Last 30 days']], F.day)
    + '<span class="ot-mut">' + rows.length + ' thing' + (rows.length === 1 ? '' : 's') + '</span></div>';
  if (!shown.length) h += '<div class="ot-empty">Nothing recorded ' + ({ today: 'today', yesterday: 'yesterday', week: 'this week', lastweek: 'last week', '30': 'in the last 30 days' }[F.day] || '') + (F.kind ? ' of this kind' : '') + '. Only what the CRM writes down shows here: records saved with who and when, approvals, messages, finished to-dos, the time clock and the schedule history.</div>';
  else h += '<div class="ot-feed">' + shown.map(function(e){ var p = person(e.who) || {};
    return '<div class="ot-ev"><span class="ot-t">' + esc(fmtTime(e)) + '</span><span class="ot-k" title="' + esc(KINDN[e.kind] || e.kind) + '">' + esc((KINDN[e.kind] || '📁').split(' ')[0]) + '</span>'
      + '<span class="ot-x">' + (keys.length > 1 || place === 'office' ? '<b>' + esc(s(p.name).split(' ')[0] || e.who) + '</b> ' : '') + esc(evText(e)) + '</span>'
      + (e.open ? '<button type="button" class="ot-b o" data-ot-open="' + esc(e.open) + '">Open ›</button>' : '') + '</div>'; }).join('') + '</div>';
  if (rows.length > shown.length) h += '<button type="button" class="ot-more" data-ot-more="' + place + '">Show more (' + (rows.length - shown.length) + ' older)</button>';
  return h;
}
function openThing(o){
  var p = s(o).split('|'), k = p[0], id = p.slice(1).join('|');
  if (k === 'job' && id) { if (!call('_navToJob', id)) call('_gcOpenJobProfile', id); return; }
  if (k === 'jobinv' && id) { if (!call('_gcOpenJobTab', id, 'invoices')) call('_navToJob', id); return; }
  if (k === 'lead') { go('leads'); later(function(){ try { if (W._gcLA && W._gcLA.edit) W._gcLA.edit(id); } catch (e) {} }, 450); return; }
  if (k === 'msg' && id) { if (!call('_gcOpenJobMessages', id)) call('_navToJob', id); return; }
  if (k === 'appr') { if (!call('_gcOpenApprovals')) go('approvals'); return; }
  if (k === 'todo') { var host = D.getElementById('gc-td2-as'); if (host) { try { host.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {} return; } if (W._gcTD2 && W._gcTD2.open) W._gcTD2.open(); return; }
  if (k === 'view' && id) go(id);
}

/* ═══ ＋ Task for the office: the gc_office_tasks store, the To-Do's own add (the shape "＋ Task for marketing" writes) ═══ */
function addTask(rec){
  try { if (W._gcTD2 && typeof W._gcTD2.addRec === 'function') return !!W._gcTD2.addRec(rec); } catch (e) {}
  var l = lsList('gc_office_tasks'); l.push(rec);
  try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) { return false; }
  try { if (W._gcApplySync) W._gcApplySync('gc_office_tasks', l); } catch (e) {}
  try { if (typeof W._gcOfficeTasksPush === 'function') W._gcOfficeTasksPush(); else if (typeof W._supaUpsertNow === 'function') W._supaUpsertNow('gc_office_tasks', JSON.stringify(l)); } catch (e) {}
  return true;
}
function newTask(o){
  var at = new Date().toISOString(), p = o.who ? person(o.who) : null;
  var rec = { id: 'T' + Date.now() + Math.floor(Math.random() * 1000), label: s(o.label).slice(0, 200), note: s(o.note).slice(0, 1000), addedBy: myName(), addedByEmail: authEmail(), addedAt: at, updatedAt: at, done: false,
    kind: 'assigned', assignees: [p ? (p.email || p.key) : s(o.whoName)], assignee: p ? p.name : s(o.whoName), personal: true, shared: false, self: false, prio: /^(high|med|low)$/.test(o.prio) ? o.prio : 'med', source: o.source || 'office tab' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s(o.due))) rec.due = s(o.due);
  if (s(o.pid)) rec.pid = s(o.pid);
  if (s(o.leadId)) { rec.leadId = s(o.leadId); var l = leadsL().filter(function(x){ return x && s(x.id) === s(o.leadId); })[0]; if (l) rec.note = (rec.note ? rec.note + ' · ' : '') + 'Lead: ' + s(l.name || l.company || l.address); }
  if (o.remindKey) rec.remindKey = o.remindKey;
  return addTask(rec) ? rec : null;
}
function formHtml(){
  var op = officePeople(), live = projects().filter(function(p){ return p && p.id && !/^(lost|completed|closed|cancell?ed|dead)$/i.test(s(p.status)) && !p.deleted; })
    .sort(function(a, b){ return s(a.name).localeCompare(s(b.name)); });
  var ld = leadsL().filter(function(l){ return l && l.id && !l.archived && !l.dismissed && !l.converted && !/^(won|lost|archived|dead)$/i.test(s(l.stage || l.status)); })
    .sort(function(a, b){ return s(a.name).localeCompare(s(b.name)); });
  return '<div class="ot-form" data-ot-form>'
    + '<div class="ot-row"><label>For<select id="ot-f-who">' + op.map(function(p){ return '<option value="' + esc(p.key) + '"' + (p.key === UI.asWho ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label>'
    + '<label>Priority<select id="ot-f-prio"><option value="med">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>'
    + '<label>Due<input type="date" id="ot-f-due" min="' + today() + '"></label></div>'
    + '<label class="ot-wide">Title<input id="ot-f-label" maxlength="200" placeholder="e.g. Call the Smiths about the final invoice"></label>'
    + '<label class="ot-wide">Notes<textarea id="ot-f-note" rows="2" maxlength="1000"></textarea></label>'
    + '<div class="ot-row"><label>Job (optional)<select id="ot-f-pid"><option value="">— none —</option>' + live.map(function(p){ return '<option value="' + esc(p.id) + '">' + esc((p.autoPO ? '[' + p.autoPO + '] ' : '') + s(p.name || p.address).slice(0, 60)) + '</option>'; }).join('') + '</select></label>'
    + '<label>Lead (optional)<select id="ot-f-lead"><option value="">— none —</option>' + ld.map(function(l){ return '<option value="' + esc(l.id) + '">' + esc(s(l.name || l.company || l.address).slice(0, 60)) + '</option>'; }).join('') + '</select></label></div>'
    + '<div class="ot-row"><button type="button" class="ot-b g" data-ot-a="task-save">Add the task</button><button type="button" class="ot-b o" data-ot-a="task-cancel">Cancel</button>'
    + '<span class="ot-mut">It goes on her ✅ To-Do under 📌 Yours (and on yours under Waiting on others until she finishes it).</span></div></div>';
}

/* ═══ 🏢 Office (admins) ═══ */
function officeHtml(){
  var op = officePeople(); if (!UI.asWho || !person(UI.asWho)) UI.asWho = op[0] ? op[0].key : '';
  var p = person(UI.asWho);
  var h = apcHtml() + '<div class="ot-card"><div class="ot-hd"><h3>✅ The office’s To-Do' + (p ? ' — ' + esc(p.name) : '') + '</h3>'
    + (op.length > 1 ? '<select class="ot-sel" data-ot-f="as|who">' + op.map(function(x){ return '<option value="' + esc(x.key) + '"' + (x.key === UI.asWho ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' : '')
    + '<button type="button" class="ot-b g" data-ot-a="task-new">＋ Task for the office</button></div>'
    + (UI.msg ? '<div class="ot-ok">' + esc(UI.msg) + '</div>' : '')
    + (UI.form ? formHtml() : '')
    + (p ? '<div class="ot-mut" style="margin:0 0 6px">The same list she sees. Tick it done, ⋯ to reassign, snooze, add a note or set the due date — it changes for her too.</div><div id="gc-td2-as" data-as="' + esc(p.email || p.key) + '" data-as-name="' + esc(p.name) + '"><div class="ot-empty">Loading her To-Do…</div></div>'
         : '<div class="ot-empty">No office person on the team list yet: ⚙ Admin → 👤 Employees → role "Office".</div>')
    + '</div>';
  h += '<div class="ot-card"><div class="ot-hd"><h3>📰 What the office did</h3></div><div data-ot-feed="office"><div class="ot-empty">Reading the records…</div></div></div>';
  return h;
}
function activityHtml(){ return '<div class="ot-card"><div class="ot-hd"><h3>📰 What the office did</h3></div><div data-ot-feed="office"><div class="ot-empty">Reading the records…</div></div></div>'; }

/* ═══ 🧭 Helpers: estimators slipping, PM job progression, leads not contacted ═══ */
function stageOf(l){ try { if (W._gcLeadNC && W._gcLeadNC.stage) return W._gcLeadNC.stage(l); } catch (e) {} var st = s(l.stage); if (/^(new|lead|new lead|)$/i.test(st)) return 'New Lead'; if (/won/i.test(st)) return 'Won'; if (/lost|dead|no ?bid|declin/i.test(st)) return 'Lost'; if (/submit|sent|bid/i.test(st)) return 'Estimate Sent'; return st || 'Contacted'; }
function shutL(l){ try { if (W._gcLeadNC && W._gcLeadNC.shut) return !!W._gcLeadNC.shut(l); } catch (e) {} var st = stageOf(l); return st === 'Won' || st === 'Lost' || !!(l.converted || l.notBidding || l.noBid || l.dismissed || l.archived); }
function contactedL(l){ try { if (W._gcLeadNC && W._gcLeadNC.contacted) return !!W._gcLeadNC.contacted(l); } catch (e) {} return !!(s(l.contactedAt) || s(l.lastContact) || stageOf(l) !== 'New Lead'); }
function importedL(l){ try { if (W._gcLeadNC && W._gcLeadNC.imported) return !!W._gcLeadNC.imported(l); } catch (e) {} return false; }
function openLeads(){ return leadsL().filter(function(l){ return l && l.id && !l.deleted && !l.archived && !l.mergedInto && !importedL(l) && !shutL(l); }); }
function estName(l){ return s(l.estimator).replace(/\s+—.*$/, ''); }
function sentL(l){ return stageOf(l) === 'Estimate Sent' || /submit/i.test(s(l.bidStatus)); }
function ageD(v){ var w = when(v); return w ? Math.floor((Date.now() - w.t) / 864e5) : null; }
function workDaysSince(ms){ var n = 0, d = new Date(ms); d.setHours(12, 0, 0, 0); var end = new Date(); end.setHours(12, 0, 0, 0); while (d < end && n < 60) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++; } return n; }
var X_NOT_SENT = 7;
function line(o){ return o; }
function estBoard(){
  var est = {}, ests = estimatesL(), t0 = Date.now();
  var hasEst = {}; ests.forEach(function(e){ if (!e) return; [e.leadId, e.lead, e.fromLead].forEach(function(x){ if (x) hasEst['l:' + s(x)] = 1; }); if (e.pid) hasEst['p:' + s(e.pid)] = 1; });
  function add(name, g, it){ var k = whoKey(name) || low(name); if (!k) return; var e = est[k] || (est[k] = { key: k, name: (person(k) || {}).name || name, g: { due: [], notsent: [], nofu: [], nc: [] } }); e.g[g].push(it); }
  openLeads().forEach(function(l){
    var en = estName(l); if (!en) return;
    var nm = s(l.name || l.company || l.address) || 'Lead', w;
    var due = when(l.bidDue), noEst = !l.estimateId && !hasEst['l:' + s(l.id)] && !(l.pid && hasEst['p:' + s(l.pid)]) && !(l.fromProjectId && hasEst['p:' + s(l.fromProjectId)]);
    if (due && due.t >= dayStart(t0) && due.t <= t0 + 3 * 864e5 && noEst && !sentL(l)) add(en, 'due', { id: l.id, t: due.t, title: nm, sub: 'bid due ' + new Date(due.t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' — no estimate yet', what: 'Start the estimate for ' + nm + ' (bid due ' + s(l.bidDue).slice(0, 10) + ')' });
    var asg = ageD(l.assignedAt || l.autoAssignedAt);
    if (asg != null && asg >= X_NOT_SENT && !sentL(l) && stageOf(l) !== 'Won') add(en, 'notsent', { id: l.id, t: -asg, title: nm, sub: 'assigned ' + asg + ' days ago — estimate not sent', what: 'Send the estimate for ' + nm + ' (assigned ' + asg + ' days ago)' });
    if (sentL(l)) { var last = 0; [l.contactedAt, l.lastContact, l.stageChangedAt, l.sentAt, l.submittedAt].concat(arr(l.activity).map(function(a){ return a && a.at; })).forEach(function(v){ var x = when(v); if (x && x.t > last) last = x.t; }); var dd = last ? Math.floor((t0 - last) / 864e5) : null; if (dd == null || dd > 5) add(en, 'nofu', { id: l.id, t: -(dd || 999), title: nm, sub: dd == null ? 'sent — no follow-up on record' : 'sent — no follow-up in ' + dd + ' days', what: 'Follow up on the estimate sent for ' + nm }); }
    if (!contactedL(l)) { var a2 = ageD(l.assignedAt || l.createdAt || l.created); add(en, 'nc', { id: l.id, t: -(a2 || 0), title: nm, sub: 'assigned' + (a2 != null ? ' ' + a2 + ' days ago' : '') + ' — not contacted yet', what: 'Contact ' + nm + ' (assigned' + (a2 != null ? ' ' + a2 + ' days ago' : '') + ')' }); }
  });
  return Object.keys(est).map(function(k){ return est[k]; });
}
function isActiveJob(p){ return !!p && !p.deleted && /^(active|in progress|approved|started)$/i.test(s(p.status)); }
function pmBoard(){
  var pm = {}, t0 = Date.now(), td = today();
  function add(name, g, it){ var k = whoKey(name) || low(name); if (!k) return; var e = pm[k] || (pm[k] = { key: k, name: (person(k) || {}).name || s(name), g: { behind: [], nolog: [], punch: [], stale: [], nc: [] } }); e.g[g].push(it); }
  var lastLog = {}; function seeLog(pid, v){ var w = when(v); if (pid && w && (!lastLog[pid] || w.t > lastLog[pid])) lastLog[pid] = w.t; }
  lsList('gc_daily_logs').forEach(function(l){ if (l) seeLog(l.pid, l.at || l.date); });
  var byJob = {};
  projects().forEach(function(p){ if (!isActiveJob(p) || !s(p.pm)) return; byJob[p.id] = p; arr(p.dailyLogs).forEach(function(x){ if (x) seeLog(p.id, x.at || x.date); }); arr(p.updates).forEach(function(x){ if (x) seeLog(p.id, x.at); }); });
  Object.keys(byJob).forEach(function(id){
    var p = byJob[id], nm = s(p.name || p.address) || 'Job', pct = Math.round(parseFloat(p.pct || p.ccProgressPct) || 0); if (pct >= 100) return;
    var st = when(p.startDate), en = when(p.endDate);
    if (en && s(p.endDate).slice(0, 10) < td) add(p.pm, 'behind', { id: id, t: en.t, title: nm, sub: 'end date ' + s(p.endDate).slice(0, 10) + ' has passed — ' + pct + '% done', what: 'Behind schedule: ' + nm + ' (end date ' + s(p.endDate).slice(0, 10) + ', ' + pct + '%) — update the dates or the %' });
    else if (st && en && en.t > st.t && t0 > st.t) { var exp = Math.round(100 * (t0 - st.t) / (en.t - st.t)); if (exp - pct >= 25) add(p.pm, 'behind', { id: id, t: -(exp - pct), title: nm, sub: pct + '% done, ' + exp + '% of the time used', what: 'Behind: ' + nm + ' is ' + pct + '% done with ' + exp + '% of the time gone' }); }
    if (!st || st.t <= t0) { var ll = lastLog[id], wd = ll ? workDaysSince(ll) : null; if (wd == null || wd >= 3) add(p.pm, 'nolog', { id: id, t: ll ? ll : 0, title: nm, sub: ll ? 'last daily log ' + wd + ' working days ago' : 'no daily log on record', what: 'Post a daily log for ' + nm }); }
    var last = p._pctUpdatedAt ? Date.parse(p._pctUpdatedAt) : (p._createdAt ? Date.parse(p._createdAt) : 0);
    if (!last || t0 - last >= 7 * 864e5) add(p.pm, 'stale', { id: id, t: last || 0, title: nm, sub: last ? 'no update in ' + Math.floor((t0 - last) / 864e5) + ' days' : 'never updated', what: 'Update the progress % on ' + nm + ' (no update in 7 days)' });
  });
  (arr(crm().punchlist).length ? arr(crm().punchlist) : lsList('punch')).forEach(function(x){
    if (!x || !/^(open|todo|pending|)$/i.test(s(x.status)) || x.done || x.deleted) return;
    var p = byJob[x.pid]; if (!p) return; var a = ageD(x.createdAt || x.date); if (a == null || a <= 7) return;
    add(p.pm, 'punch', { id: p.id, t: -a, title: s(p.name) + ': ' + s(x.item || x.title).slice(0, 60), sub: 'open ' + a + ' days', what: 'Close the punch item "' + s(x.item || x.title).slice(0, 60) + '" on ' + s(p.name) + ' (open ' + a + ' days)' });
  });
  openLeads().forEach(function(l){
    if (!s(l.pm) || contactedL(l) || stageOf(l) !== 'New Lead') return;
    var nm = s(l.name || l.company || l.address) || 'Lead', a = when(l.assignedAt || l.autoAssignedAt || l.createdAt || l.created), hrs = a ? Math.max(0, Math.floor((t0 - a.t) / 36e5)) : null;
    var ago = hrs == null ? '' : hrs < 48 ? hrs + ' h' : Math.floor(hrs / 24) + ' days';
    add(l.pm, 'nc', { id: l.id, lead: true, t: a ? a.t : 0, title: nm, sub: 'assigned ' + (ago ? ago + ' ago' : '(no date)') + ' — not contacted', what: 'Contact the lead ' + nm + (ago ? ' (assigned ' + ago + ' ago)' : '') });
  });
  return Object.keys(pm).map(function(k){ return pm[k]; });
}
function remindKey(kind, id, who){ return 'otab:' + kind + ':' + id + ':' + who; }
function openReminders(){ var o = {}; lsList('gc_office_tasks').forEach(function(t){ if (t && t.remindKey && !t.done && !t.deleted) o[t.remindKey] = 1; }); return o; }
var GROUPS_E = [['due', '⏰ Bids due within 3 days — no estimate yet'], ['notsent', '📐 Estimates not sent ' + X_NOT_SENT + '+ days after assigned'], ['nofu', '📬 Sent — no follow-up for 5+ days'], ['nc', '📞 Assigned leads not contacted']];
var GROUPS_P = [['nc', '📞 Leads not contacted'], ['behind', '⏳ Behind schedule'], ['nolog', '📝 No daily log for 3+ working days'], ['punch', '🔧 Punch items open 7+ days'], ['stale', '🕒 No update in 7 days']];
function boardHtml(kind, rows, groups, label){
  var rem = openReminders(), CAP = 5;
  rows.sort(function(a, b){ return a.name.localeCompare(b.name); });
  var tot = 0; rows.forEach(function(r){ groups.forEach(function(g){ tot += r.g[g[0]].length; }); });
  if (!tot) return '<div class="ot-empty">Nothing slipping. 🎉</div>';
  return rows.map(function(r){
    var n = 0; groups.forEach(function(g){ n += r.g[g[0]].length; }); if (!n) return '';
    return '<div class="ot-pcard"><div class="ot-ph"><b>' + esc(r.name) + '</b><span class="ot-n">' + n + '</span></div>' + groups.map(function(g){
      var l = r.g[g[0]]; if (!l.length) return '';
      l.sort(function(a, b){ return a.t - b.t; });
      var ok = kind + ':' + r.key + ':' + g[0], all = !!UI.help.open[ok], sh = all ? l : l.slice(0, CAP);
      return '<div class="ot-g"><div class="ot-gh">' + g[1] + ' <span class="ot-n">' + l.length + '</span></div>' + sh.map(function(it){
        var rk = remindKey(g[0], it.id + (g[0] === 'punch' ? '|' + it.title.slice(0, 60) : ''), r.key), done = !!rem[rk];
        var isLead = kind === 'est' || it.lead;
        return '<div class="ot-li"><div class="ot-lt"><b>' + esc(it.title) + '</b><span class="ot-mut">' + esc(it.sub) + '</span></div>'
          + '<button type="button" class="ot-b' + (done ? ' o' : '') + '" data-ot-rem="' + esc(rk) + '" data-who="' + esc(r.key) + '" data-whon="' + esc(r.name) + '" data-what="' + esc(it.what) + '"' + (isLead ? ' data-lead="' + esc(it.id) + '"' : ' data-pid="' + esc(it.id) + '"') + (done ? ' disabled' : '') + '>' + (done ? 'Reminded ✓' : 'Remind ' + label) + '</button>'
          + '<button type="button" class="ot-b o" data-ot-open="' + esc(isLead ? 'lead|' + it.id : 'job|' + it.id) + '">Open</button></div>';
      }).join('') + (l.length > sh.length ? '<button type="button" class="ot-more" data-ot-gall="' + esc(ok) + '">Show all ' + l.length + '</button>' : '') + '</div>';
    }).join('') + '</div>';
  }).join('');
}
function helpersHtml(){
  return apcHtml() + '<div class="ot-card"><div class="ot-hd"><h3>📐 Estimators: what’s slipping</h3></div><div class="ot-mut" style="margin-bottom:8px">Remind = a To-Do on that person’s list (no text is sent). Open = the lead.</div><div data-ot-board="est"><div class="ot-empty">Reading the leads…</div></div></div>'
    + '<div class="ot-card"><div class="ot-hd"><h3>🏗 PMs: job progression &amp; leads not contacted</h3></div><div class="ot-mut" style="margin-bottom:8px">Active jobs per PM, and the leads given to them that nobody has contacted (the same test as the Leads page’s “Not contacted”).</div><div data-ot-board="pm"><div class="ot-empty">Reading the jobs…</div></div></div>';
}

/* ── "who hasn't checked ✅ Approvals today" (window._gcApprovalsCheckedToday, patch SUBPHOTOS: a Promise of
   [{ name, email, waiting, lastSeen, checkedToday }]); without it the line is simply not there ── */
function apcHtml(){ return typeof W._gcApprovalsCheckedToday === 'function' ? '<div class="ot-card ot-apc" data-ot-apc><span class="ot-mut">Looking at who opened ✅ Approvals today…</span></div>' : ''; }
function fillApc(){
  var f = W._gcApprovalsCheckedToday; if (typeof f !== 'function' || !D.querySelector('[data-ot-apc]')) return;
  var gone = function(){ var el = D.querySelector('[data-ot-apc]'); if (el) el.remove(); };
  var pr; try { pr = f(); } catch (e) { gone(); return; }
  Promise.resolve(pr).then(function(l){
    var el = D.querySelector('[data-ot-apc]'); if (!el) return;
    l = arr(l).filter(function(x){ return x && (x.name || x.email); });
    if (!l.length) { gone(); return; }
    var not = l.filter(function(x){ return !x.checkedToday; });
    var who = function(x){ var w = when(x.lastSeen); return '<span class="ot-apw">' + esc(s(x.name) || s(x.email)) + (+x.waiting ? ' <b>' + (+x.waiting) + ' waiting</b>' : '') + (w ? ' <span class="ot-mut">last ' + esc(fmtTime({ t: w.t, d: w.d })) + '</span>' : ' <span class="ot-mut">not opened yet</span>') + '</span>'; };
    el.innerHTML = not.length ? '<b>✅ Haven’t checked Approvals today:</b> ' + not.map(who).join(' · ') + ' <button type="button" class="ot-b o" data-ot-open="appr|">Open Approvals</button>'
      : '<b>✅ Everyone has checked Approvals today.</b>';
  }, gone);
}

/* ═══ 👥 Team (admins): a person's activity, their numbers, when they are working ═══ */
var DEV = { at: 0, rows: [], p: null };
function loadDevices(){
  if (DEV.p || Date.now() - DEV.at < 5 * 60e3) return DEV.p || Promise.resolve(DEV.rows);
  var u = s(lsRaw('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), k = s(lsRaw('grayco_sb_key'));
  if (!k) return Promise.resolve([]);
  DEV.p = W.fetch(u + '/rest/v1/gc_kv?key=like.gc_adm_dev_*&select=key,value', { headers: { apikey: k }, cache: 'no-store' })
    .then(function(r){ return r && r.ok ? r.json() : []; }).then(function(rows){ DEV.rows = arr(rows).map(function(x){ return x && x.value; }).filter(Boolean); DEV.at = Date.now(); DEV.p = null; return DEV.rows; }, function(){ DEV.p = null; DEV.at = Date.now(); return DEV.rows; });
  return DEV.p;
}
function inR(t, r){ return t >= r[0] && t < r[1]; }
function metrics(p){
  var R = [range('week'), range('lastweek')], ev = events().filter(function(e){ return e.who === p.key; }), out = [];
  function cnt(f){ return R.map(function(r){ return ev.filter(function(e){ return inR(e.t, r) && f(e); }).length; }); }
  function row(l, v, note){ out.push([l, v[0], v[1], note || '']); }
  var role = p.role;
  if (role === 'estimator' || role === 'admin') {
    var mine = leadsL().filter(function(l){ return l && whoKey(estName(l) || l.estimatorEmail) === p.key; });
    row('Leads assigned to them', R.map(function(r){ return mine.filter(function(l){ var w = when(l.assignedAt || l.autoAssignedAt); return w && inR(w.t, r); }).length; }), mine.filter(function(l){ return !shutL(l); }).length + ' open now');
    var es = estimatesL().filter(function(e){ return e && [e.by, e.createdBy, e.updatedBy, e.savedBy, estName(e)].some(function(x){ return x && whoKey(x) === p.key; }); });
    row('Estimates created', R.map(function(r){ return es.filter(function(e){ var w = when(e.firstSavedAt || e.createdAt || e.created); return w && inR(w.t, r); }).length; }));
    row('Estimates edited', R.map(function(r){ return es.filter(function(e){ var w = when(e.savedAt); return w && inR(w.t, r); }).length; }));
    function tStage(l, re, fld){ var h = arr(l.stageHistory).filter(function(x){ return x && re.test(s(x.to)); }).pop(); var w = when((h && h.at) || l[fld]); return w; }
    var sentAt = function(l){ return tStage(l, /sent|submit/i, 'sentAt') || (sentL(l) ? when(l.stageChangedAt || l.submittedAt) : null); };
    row('Bids / estimates sent', R.map(function(r){ return mine.filter(function(l){ var w = sentAt(l); return w && inR(w.t, r); }).length; }));
    var won = R.map(function(r){ return mine.filter(function(l){ if (stageOf(l) !== 'Won' && !l.converted) return false; var w = tStage(l, /won/i, 'wonAt') || when(l.convertedAt || l.stageChangedAt); return w && inR(w.t, r); }).length; });
    var lost = R.map(function(r){ return mine.filter(function(l){ if (stageOf(l) !== 'Lost') return false; var w = tStage(l, /lost/i, 'lostAt') || when(l.stageChangedAt); return w && inR(w.t, r); }).length; });
    var W90 = mine.filter(function(l){ return stageOf(l) === 'Won' || l.converted; }).length, L90 = mine.filter(function(l){ return stageOf(l) === 'Lost'; }).length;
    row('Won', won, ''); row('Lost', lost, (W90 + L90) ? 'win rate ' + Math.round(100 * W90 / (W90 + L90)) + '% (' + W90 + ' won / ' + L90 + ' lost, all time)' : 'no decided bids yet');
    var gaps = mine.map(function(l){ var a = when(l.assignedAt || l.autoAssignedAt), b = sentAt(l); return a && b && b.t >= a.t ? (b.t - a.t) / 864e5 : null; }).filter(function(x){ return x != null; });
    row('Average days from assigned to sent', ['', ''], gaps.length ? (gaps.reduce(function(a, b){ return a + b; }, 0) / gaps.length).toFixed(1) + ' days (' + gaps.length + ' bids)' : 'no sent bids with both dates');
  }
  if (role === 'pm' || role === 'admin' || role === 'field') {
    row('Active jobs (as PM)', ['', ''], projects().filter(function(j){ return isActiveJob(j) && whoKey(j.pm) === p.key; }).length + ' now');
    row('Daily logs & job updates', cnt(function(e){ return e.verb === 'log'; }));
    row('Punch items closed', cnt(function(e){ return /punch item/.test(e.what) && /closed|completed|finished|resolved/.test(e.verb); }));
    row('Schedule changes', cnt(function(e){ return e.kind === 'schedule'; }));
    row('Messages & texts sent', cnt(function(e){ return e.kind === 'message'; }));
  }
  if (role === 'office' || role === 'admin') {
    row('To-dos finished', cnt(function(e){ return e.kind === 'todo' && e.verb === 'finished'; }));
    row('Invoices entered / saved', cnt(function(e){ return e.kind === 'invoice' && /created|saved|added|entered/.test(e.verb); }));
    row('Expenses entered / saved', cnt(function(e){ return e.kind === 'expense' && /created|saved|added|entered/.test(e.verb); }));
    row('Approvals handled', cnt(function(e){ return /approved|decided|rejected|confirmed/.test(e.verb); }));
  }
  row('Everything they did (all kinds)', cnt(function(){ return true; }));
  return out;
}
function stripHtml(p){
  var days = [], t0 = dayStart(Date.now()), H0 = 5, H1 = 22;
  for (var i = 6; i >= 0; i--) days.push({ s: t0 - i * 864e5, first: 0, last: 0, hrs: {} });
  function see(t){ for (var i = 0; i < days.length; i++) { var d = days[i]; if (t >= d.s && t < d.s + 864e5) { if (!d.first || t < d.first) d.first = t; if (t > d.last) d.last = t; d.hrs[new Date(t).getHours()] = 1; return; } } }
  events().forEach(function(e){ if (e.who === p.key && !e.d) see(e.t); });
  DEV.rows.forEach(function(d){ if (!d || whoKey(d.email || d.name) !== p.key) return; [d.lastSeen, d.loadedAt].forEach(function(v){ var w = when(v); if (w) see(w.t); }); });
  var tm = function(t){ return t ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''; };
  var h = '<div class="ot-strip"><div class="ot-sr ot-sh"><span>Day</span><span>First – last</span><span>Hours</span><span class="ot-bar">' + (function(){ var x = ''; for (var hh = H0; hh <= H1; hh++) x += '<i>' + (hh % 3 === 0 ? (hh > 12 ? hh - 12 : hh) + (hh < 12 ? 'a' : 'p') : '') + '</i>'; return x; })() + '</span></div>';
  days.slice().reverse().forEach(function(d){
    var n = Object.keys(d.hrs).length, bar = '';
    for (var hh = H0; hh <= H1; hh++) bar += '<i class="' + (d.hrs[hh] ? 'on' : '') + '"></i>';
    h += '<div class="ot-sr"><span>' + esc(new Date(d.s + 12 * 36e5).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })) + '</span><span>' + (d.first ? esc(tm(d.first) + ' – ' + tm(d.last)) : '<span class="ot-mut">—</span>') + '</span><span>' + (n ? n + ' h' : '') + '</span><span class="ot-bar">' + bar + '</span></div>';
  });
  return h + '</div><div class="ot-mut" style="margin-top:4px">From the times on what they saved, approved, sent and finished, the time clock, and each computer’s check-in (when the CRM was opened / last seen). It is not a click log: time spent reading or typing without saving does not show.</div>';
}
function teamHtml(){
  var L = people().list.filter(function(p){ return p.email; }).sort(function(a, b){ return a.name.localeCompare(b.name); });
  if (!UI.teamWho || !person(UI.teamWho)) { var g = L.filter(function(p){ return p.role === 'estimator'; })[0] || L[0]; UI.teamWho = g ? g.key : ''; }
  return '<div class="ot-card"><div class="ot-hd"><h3>👥 Team</h3><select class="ot-sel" data-ot-f="team|who">' + L.map(function(p){ return '<option value="' + esc(p.key) + '"' + (p.key === UI.teamWho ? ' selected' : '') + '>' + esc(p.name + ' — ' + (ROLE_L[p.role] || p.role)) + '</option>'; }).join('') + '</select></div>'
    + '<div data-ot-team><div class="ot-empty">Reading…</div></div></div>';
}
function teamBody(){
  var p = person(UI.teamWho); if (!p) return '<div class="ot-empty">Pick a person.</div>';
  var m = metrics(p);
  return '<div class="ot-two"><div><h4>📊 ' + esc(ROLE_L[p.role] || p.role) + ' numbers</h4><table class="ot-tbl"><tr><th></th><th>This week</th><th>Last week</th><th></th></tr>' + m.map(function(r){ return '<tr><td>' + esc(r[0]) + '</td><td class="n">' + esc(String(r[1])) + '</td><td class="n">' + esc(String(r[2])) + '</td><td class="ot-mut">' + esc(r[3]) + '</td></tr>'; }).join('') + '</table></div>'
    + '<div><h4>🕘 When they’re working (last 7 days)</h4>' + stripHtml(p) + '</div></div>'
    + '<h4 style="margin-top:12px">📰 What ' + esc(p.name.split(' ')[0]) + ' did</h4><div data-ot-feed="team">' + feedHtml('team', [p.key]) + '</div>';
}

/* ═══ the page: our tabs in the Office page's own tab bar ═══ */
var TABS = { ot_office: { l: '🏢 Office', lv: { admin: 1 } }, ot_activity: { l: '📰 Activity', lv: { office: 1 } }, ot_help: { l: '🧭 Helpers', lv: { admin: 1, office: 1 } }, ot_team: { l: '👥 Team', lv: { admin: 1 } } };
var ORDER = ['ot_office', 'ot_activity', 'ot_help', 'ot_team'];
var STAT = { last: {} };
function timed(name, f){ var t = Date.now(); try { return f(); } finally { STAT.last[name] = Date.now() - t; } }
function fillLater(sel, f){ later(function(){ var el = D.querySelector(sel); if (!el || !el.isConnected) return; var h = timed(sel, f); if (el.isConnected) el.innerHTML = h; }, 0); }
function drawTab(name){
  var body = D.getElementById('om-body'); if (!body) return;
  var L = level(); if (!TABS[name] || !TABS[name].lv[L]) return;
  UI.tab = name;
  var h = name === 'ot_office' ? officeHtml() : name === 'ot_activity' ? activityHtml() : name === 'ot_help' ? helpersHtml() : teamHtml();
  body.innerHTML = '<div class="ot-wrap" data-ot-tab="' + name + '">' + h + '</div>';
  wire(body.firstElementChild);
  if (name === 'ot_office') later(function(){ try { if (W._gcTD2 && D.getElementById('gc-td2-as')) W._gcTD2.paint(); } catch (e) {} }, 0);
  if (name === 'ot_office' || name === 'ot_activity') fillLater('[data-ot-feed="office"]', function(){ return feedHtml('office', officePeople().map(function(p){ return p.key; })); });
  if (name === 'ot_office' || name === 'ot_help') later(fillApc, 0);
  if (name === 'ot_help') { fillLater('[data-ot-board="est"]', function(){ return boardHtml('est', estBoard(), GROUPS_E, 'estimator'); }); fillLater('[data-ot-board="pm"]', function(){ return boardHtml('pm', pmBoard(), GROUPS_P, 'PM'); }); }
  if (name === 'ot_team') { fillLater('[data-ot-team]', teamBody); loadDevices().then(function(){ if (UI.tab === 'ot_team') fillLater('[data-ot-team]', teamBody); }); }
}
function redrawPart(sel, f){ var el = D.querySelector(sel); if (el) el.innerHTML = timed(sel, f); }
function wire(root){
  if (!root || root.__ot) return; root.__ot = true;
  root.addEventListener('change', function(e){
    var t = e.target, f = t.getAttribute && t.getAttribute('data-ot-f'); if (!f) return;
    var p = f.split('|');
    if (p[0] === 'as') { UI.asWho = t.value; drawTab('ot_office'); return; }
    if (p[0] === 'team') { UI.teamWho = t.value; UI.feed.team.n = 50; redrawPart('[data-ot-team]', teamBody); return; }
    var F = UI.feed[p[0]]; if (!F) return; F[p[1]] = t.value; F.n = 50;
    if (p[0] === 'office') redrawPart('[data-ot-feed="office"]', function(){ return feedHtml('office', officePeople().map(function(x){ return x.key; })); });
    else redrawPart('[data-ot-feed="team"]', function(){ return feedHtml('team', [UI.teamWho]); });
  });
  root.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('button'); if (!b || !root.contains(b)) return;
    if (b.hasAttribute('data-ot-open')) { openThing(b.getAttribute('data-ot-open')); return; }
    var mo = b.getAttribute('data-ot-more');
    if (mo) { UI.feed[mo].n += 50; if (mo === 'office') redrawPart('[data-ot-feed="office"]', function(){ return feedHtml('office', officePeople().map(function(x){ return x.key; })); }); else redrawPart('[data-ot-feed="team"]', function(){ return feedHtml('team', [UI.teamWho]); }); return; }
    var ga = b.getAttribute('data-ot-gall');
    if (ga) { UI.help.open[ga] = 1; var k = ga.split(':')[0]; redrawPart('[data-ot-board="' + k + '"]', function(){ return k === 'est' ? boardHtml('est', estBoard(), GROUPS_E, 'estimator') : boardHtml('pm', pmBoard(), GROUPS_P, 'PM'); }); return; }
    var rk = b.getAttribute('data-ot-rem');
    if (rk) {
      if (openReminders()[rk]) { b.textContent = 'Reminded ✓'; b.disabled = true; return; }
      var r = newTask({ who: person(b.getAttribute('data-who')) ? b.getAttribute('data-who') : '', whoName: b.getAttribute('data-whon'), label: 'Reminder: ' + b.getAttribute('data-what'), note: 'From ' + myName() + ' (🏢 Office → 🧭 Helpers)', pid: b.getAttribute('data-pid') || '', leadId: b.getAttribute('data-lead') || '', remindKey: rk, prio: 'high', due: today(), source: 'office tab reminder' });
      b.textContent = r ? 'Reminded ✓' : 'Not added'; b.disabled = !!r; b.classList.add('o');
      toast(r ? 'On ' + r.assignee + '’s To-Do: ' + r.label.slice(0, 70) : 'The reminder was not added.');
      return;
    }
    var a = b.getAttribute('data-ot-a');
    if (a === 'task-new') { UI.form = !UI.form; UI.msg = ''; drawTab('ot_office'); later(function(){ var i = D.getElementById('ot-f-label'); if (i) i.focus(); }, 30); return; }
    if (a === 'task-cancel') { UI.form = false; drawTab('ot_office'); return; }
    if (a === 'task-save') {
      var v = function(id){ var el = D.getElementById(id); return el ? el.value : ''; };
      if (!s(v('ot-f-label'))) { toast('Type the task first.'); var i2 = D.getElementById('ot-f-label'); if (i2) i2.focus(); return; }
      var rec = newTask({ who: v('ot-f-who'), label: v('ot-f-label'), note: v('ot-f-note'), due: v('ot-f-due'), prio: v('ot-f-prio'), pid: v('ot-f-pid'), leadId: v('ot-f-lead') });
      UI.form = !rec; UI.msg = rec ? '✓ Added for ' + rec.assignee + ': ' + rec.label.slice(0, 80) : ''; if (!rec) toast('Not added.');
      drawTab('ot_office'); return;
    }
  });
}
function toast(m){ try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.className = 'ot-toast'; t.textContent = m; D.body.appendChild(t); later(function(){ if (t.parentNode) t.remove(); }, 4500); } catch (e) {} }
function buttons(){
  var bar = D.querySelector('#gc-om-page .om-tabs'); if (!bar) return;
  var L = level(), first = bar.firstElementChild;
  ORDER.forEach(function(k){
    var have = D.getElementById('om-tab-' + k);
    if (!TABS[k].lv[L]) { if (have) have.remove(); return; }
    if (have) return;
    var b = D.createElement('button'); b.className = 'om-tab'; b.id = 'om-tab-' + k; b.setAttribute('data-ot', k); b.textContent = TABS[k].l;
    b.onclick = function(){ if (W.gcOfficeManager) W.gcOfficeManager.tab(k); };
    bar.insertBefore(b, first);
  });
  var M = W.gcOfficeManager; if (M && TABS[M._activeTab]) { var on = D.getElementById('om-tab-' + M._activeTab); if (on) on.classList.add('on'); }
}
function hook(){
  var M = W.gcOfficeManager; if (!M || typeof M.tab !== 'function' || typeof M.render !== 'function') return false;
  if (M.__otHooked) return true; M.__otHooked = true;
  var t0 = M.tab;
  M.tab = function(name){
    if (TABS[name]) {
      var L = level(); if (!TABS[name].lv[L]) name = 'overview';
      else { this._activeTab = name; D.querySelectorAll('.om-tab').forEach(function(b){ b.classList.remove('on'); }); var bt = D.getElementById('om-tab-' + name); if (bt) bt.classList.add('on'); drawTab(name); return; }
    }
    UI.tab = '';
    return t0.apply(this, arguments);
  };
  var r0 = M.render;
  M.render = function(){
    var L = level();
    if (L === 'admin' && !M.__otFirst) { M.__otFirst = true; M._activeTab = 'ot_office'; }
    if (TABS[M._activeTab] && !TABS[M._activeTab].lv[L]) M._activeTab = 'overview';
    var r = r0.apply(this, arguments);
    try { buttons(); } catch (e) {}
    return r;
  };
  return true;
}
var CSS = '.ot-wrap{font:13.5px/1.4 Inter,-apple-system,Segoe UI,Arial,sans-serif;color:#0f172a}.ot-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:12px}'
 + '.ot-hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}.ot-hd h3{margin:0;font-size:15px;font-weight:800;flex:1;min-width:180px}.ot-wrap h4{margin:4px 0 6px;font-size:13px;font-weight:800}'
 + '.ot-b{border:none;background:#2563eb;color:#fff;border-radius:8px;padding:6px 11px;font-weight:700;font-size:12.5px;cursor:pointer;white-space:nowrap}.ot-b.g{background:#16a34a}.ot-b.o{background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1}.ot-b:disabled{opacity:.7;cursor:default}'
 + '.ot-sel{border:1px solid #cbd5e1;border-radius:8px;padding:5px 8px;font:13px Inter,Arial,sans-serif;background:#fff;color:#0f172a;max-width:100%}'
 + '.ot-mut{color:#64748b;font-size:12px}.ot-empty{padding:12px;color:#64748b;font-size:13px}.ot-ok{background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:8px;padding:7px 10px;margin-bottom:8px;font-weight:700}'
 + '.ot-filt{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}.ot-feed{border-top:1px solid #f1f5f9}'
 + '.ot-ev{display:flex;gap:8px;align-items:center;padding:6px 2px;border-bottom:1px solid #f1f5f9}.ot-t{flex:0 0 112px;color:#475569;font-size:12px;font-weight:700}.ot-k{flex:0 0 20px}.ot-x{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}'
 + '.ot-more{display:block;width:100%;border:none;background:#f8fafc;color:#2563eb;font-weight:800;padding:8px;border-radius:8px;margin-top:6px;cursor:pointer}'
 + '.ot-form{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-bottom:10px}.ot-form label{display:flex;flex-direction:column;font-size:12px;font-weight:700;color:#334155;gap:3px;margin-bottom:6px}'
 + '.ot-form input,.ot-form select,.ot-form textarea{border:1px solid #cbd5e1;border-radius:8px;padding:6px 8px;font:13px Inter,Arial,sans-serif;max-width:100%;box-sizing:border-box}.ot-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}.ot-row label{flex:1;min-width:150px}.ot-wide input,.ot-wide textarea{width:100%}'
 + '.ot-pcard{border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;overflow:hidden}.ot-ph{display:flex;gap:8px;align-items:center;background:#f8fafc;padding:8px 10px}.ot-n{background:#e2e8f0;border-radius:10px;padding:0 7px;font-size:11.5px;font-weight:800}'
 + '.ot-g{padding:4px 10px 6px}.ot-gh{font-size:12px;font-weight:800;color:#334155;margin:6px 0 2px}.ot-li{display:flex;gap:6px;align-items:center;padding:5px 0;border-top:1px solid #f1f5f9}.ot-lt{flex:1;min-width:0;display:flex;flex-direction:column}.ot-lt b{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
 + '.ot-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}@media(max-width:860px){.ot-two{grid-template-columns:1fr}}'
 + '.ot-tbl{width:100%;border-collapse:collapse;font-size:12.5px}.ot-tbl th{text-align:left;color:#64748b;font-size:11px;padding:4px 6px;border-bottom:1px solid #e2e8f0}.ot-tbl td{padding:5px 6px;border-bottom:1px solid #f1f5f9}.ot-tbl td.n{font-weight:800;text-align:center}'
 + '.ot-strip{font-size:12px}.ot-sr{display:grid;grid-template-columns:96px 130px 34px 1fr;gap:6px;align-items:center;padding:3px 0;border-bottom:1px solid #f8fafc}.ot-sh{color:#64748b;font-size:10.5px;font-weight:700}'
 + '.ot-bar{display:grid;grid-template-columns:repeat(18,1fr);gap:1px}.ot-bar i{height:12px;background:#eef2f7;border-radius:2px;font-style:normal;font-size:9px;text-align:center;line-height:12px;color:#64748b}.ot-sh .ot-bar i{background:none}.ot-bar i.on{background:#2563eb}'
 + '.ot-apc{padding:9px 12px;font-size:13px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:#fffbeb;border-color:#fde68a}.ot-apw{white-space:nowrap}'
 + '.ot-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147482600;background:#0f172a;color:#fff;border-radius:12px;padding:10px 16px;font:600 13px Inter,Arial,sans-serif;max-width:90vw}'
 + '@media(max-width:600px){.ot-t{flex-basis:78px}.ot-sr{grid-template-columns:72px 1fr 30px}.ot-sr .ot-bar{grid-column:1/-1}}';
function css(){ if (D.getElementById('gc-ot-css2')) return; var st = D.createElement('style'); st.id = 'gc-ot-css2'; st.textContent = CSS; (D.head || D.documentElement).appendChild(st); }
/* installs once, when the Office page object exists (it is defined long before this script) — no timer keeps running */
(function boot(n){ css(); if (hook()) { try { if (D.getElementById('gc-om-page')) buttons(); } catch (e) {} return; } if (n > 0) later(function(){ boot(n - 1); }, 1000); })(30);
W._gcOfficeTab = {
  state: function(){ return { level: level(), tab: UI.tab, office: officePeople().map(function(p){ return p.name + ' <' + p.email + '>'; }), events: EV.list.length, eventsMs: EV.ms, lastMs: STAT.last, devices: DEV.rows.length }; },
  events: function(){ return events(true).slice(0, 200); }, people: function(){ return people().list; }, addTask: newTask, estBoard: estBoard, pmBoard: pmBoard, metrics: function(k){ var p = person(k); return p ? metrics(p) : null; }
};
try { console.log('[GC] 🏢 Office tab: office To-Do, activity, helpers, team (patch OFFICETAB) — _gcOfficeTab.state()'); } catch (e) {}
})();
