/* ============================================================================
   GrayCo — A JOB GOES ACTIVE WITH ITS DATES.   (patch ACTIVEDATES)

   Owner 10/30: "when marking job active require start and finish date for job in roofing residential or
   commercial estimated and for insurance do what TPA says but we don't have finish dates just we log the
   actual start date of construction".

   Every place a person sets a job Active asks first (a small box, phone-width too):
     · roofing / residential / commercial (not insurance): Start date + Estimated finish date (finish on or
       after the start);
     · insurance (window._gcIsInsuranceJob, or a claim / carrier / TPA on the job): only the ACTUAL
       construction start (saved as startDate and constructionStart). No finish date: the TPA sets it.
   Dates already on the job fill the box. Save writes the dates and the Active status in the same save;
   Cancel leaves the status as it was. A job already Active, or a change to any other status, is not asked.
   Admins get "Skip for now": the job goes Active and the PM gets a To-Do "Add start/finish dates for <job>".
   The schedule's automatic Start / Finish rows (_autoBookend, one per job — patch BOOKDEDUPE) follow the
   job's startDate / endDate; they are refreshed right after the save.
   ============================================================================ */
(function(){
'use strict';
var W = window, D = document;
if (W._gcAD) return;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function ymd(v){ var x = s(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : ''; }
function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function nowIso(){ return new Date().toISOString(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function crm(){ return W._crm || {}; }
function isActive(st){ return /^(active|in[ _-]?progress)$/i.test(s(st)); }
function isIns(p){
  if (!p) return false;
  try { if (typeof W._gcIsInsuranceJob === 'function') { if (W._gcIsInsuranceJob(p)) return true; if (p.isInsurance === false) return false; } } catch (e) {}
  if (p.isInsurance === true) return true;
  if (p.isInsurance === false) return false;
  if (s(p.claimId) || s(p.claimNo) || s(p.claimNumber) || s(p.tpa) || s(p.tpaName) || s(p.carrier) || s(p.insuranceCarrier)) return true;
  return /insur|\btpa\b|claim/i.test(s(p.type) + ' ' + s(p.jobType) + ' ' + s(p.category));
}
/* what the job still needs before it can be Active: null = nothing */
function needs(p){
  if (!p) return null;
  if (isIns(p)) return ymd(p.constructionStart) ? null : { ins: true };
  var sd = ymd(p.startDate), ed = ymd(p.endDate);
  if (sd && ed && ed >= sd) return null;
  return { ins: false };
}
function me(){ try { var u = W._gcMeUserJSON ? W._gcMeUserJSON('{}') : JSON.parse(localStorage.getItem('grayco_user') || '{}'); return u || {}; } catch (e) { return {}; } }
function myName(){ return s(me().name) || 'Admin'; }
function isAdmin(){
  try { if (W.__gcAuthIsAdmin && W.__gcAuthIsAdmin()) return true; } catch (e) {}
  try { var a = W.__GC_SEC2 && W.__GC_SEC2.access && W.__GC_SEC2.access(); if (a && a.known) return !!a.admin; } catch (e) {}
  return false;
}

/* ── the PM's To-Do (the shared office list, gc_office_tasks — same store as every other task) ── */
function tasks(){ try { var l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function addTask(rec){
  try { if (W._gcTD2 && typeof W._gcTD2.addRec === 'function') { W._gcTD2.addRec(rec); return true; } } catch (e) {}
  var l = tasks(); l.push(rec);
  try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) { return false; }
  try { if (W._gcApplySync) W._gcApplySync('gc_office_tasks', l); } catch (e) {}
  try { if (typeof W._gcOfficeTasksPush === 'function') W._gcOfficeTasksPush(); else if (typeof W._supaUpsertNow === 'function') W._supaUpsertNow('gc_office_tasks', JSON.stringify(l)); } catch (e) {}
  return true;
}
function pmTodo(job, why){
  if (!job) return null;
  var name = s(job.name || job.n) || 'job';
  var id = 'TAD-' + (s(job.id) || name).replace(/[^\w-]/g, '').slice(0, 48);
  var have = tasks().filter(function(t){ return t && t.id === id && !t.done; })[0];
  if (have) return have;
  var pm = s(job.pm), users = Array.isArray(crm().users) ? crm().users : [];
  var u = users.filter(function(x){ return x && pm && (low(x.name) === low(pm) || low(x.email) === low(pm)); })[0];
  var em = u ? low(u.email) : (/@/.test(pm) ? low(pm) : '');
  var at = nowIso(), ins = isIns(job);
  var rec = { id: id, label: 'Add start/finish dates for ' + name, pid: s(job.id),
    note: (why || 'Set Active without its dates.') + ' ' + (ins ? 'Insurance job: follow the TPA’s schedule; log the actual start date of construction.' : 'Enter the start date and the estimated finish date.'),
    due: today(), addedBy: myName(), addedAt: at, updatedAt: at, done: false, kind: 'assigned',
    assignees: em ? [em] : [], assignee: u ? s(u.name) : pm, prio: 'high', source: 'activedates' };
  return addTask(rec) ? rec : null;
}

/* ── the box ── */
function css(){
  if (D.getElementById('gc-ad-css')) return;
  var st = D.createElement('style'); st.id = 'gc-ad-css';
  st.textContent = '#gc-ad-ov{position:fixed;inset:0;background:rgba(10,20,35,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}' +
    '#gc-ad-box{background:#fff;color:#14233a;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);width:100%;max-width:420px;max-height:calc(100vh - 32px);overflow:auto;padding:18px 18px 14px;box-sizing:border-box;font:14px/1.4 Inter,-apple-system,Segoe UI,Arial,sans-serif}' +
    '#gc-ad-box h3{margin:0 0 4px;font-size:17px}#gc-ad-box .sub{color:#4a5a70;font-size:12.5px;margin:0 0 12px}' +
    '#gc-ad-box label{display:block;font-weight:700;font-size:12.5px;margin:10px 0 4px}' +
    '#gc-ad-box input[type=date]{width:100%;box-sizing:border-box;font-size:16px;padding:9px 10px;border:1px solid #b8c4d4;border-radius:8px;background:#fff;color:#14233a}' +
    '#gc-ad-box .hint{background:#eef5ff;border:1px solid #c9dcf7;border-radius:8px;padding:8px 10px;font-size:12.5px;margin-top:10px}' +
    '#gc-ad-box .err{color:#b91c1c;font-weight:700;font-size:12.5px;min-height:18px;margin-top:8px}' +
    '#gc-ad-box .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px}' +
    '#gc-ad-box button{font:inherit;font-weight:700;border-radius:8px;padding:9px 14px;cursor:pointer;border:1px solid #b8c4d4;background:#fff;color:#14233a}' +
    '#gc-ad-box button.go{background:#16a34a;border-color:#16a34a;color:#fff}' +
    '#gc-ad-box .skip{display:inline-block;margin-top:10px;font-size:12px;color:#4a5a70;text-decoration:underline;cursor:pointer;background:none;border:none;padding:0}' +
    '@media (max-width:480px){#gc-ad-box .row button{flex:1 1 100%}}';
  (D.head || D.documentElement).appendChild(st);
}
var OPEN = null;
function ask(job){
  return new Promise(function(done){
    if (OPEN) { try { OPEN(null); } catch (e) {} }
    css();
    var ins = isIns(job), name = s(job && (job.name || job.n)) || 'this job';
    var sd0 = ins ? (ymd(job.constructionStart) || ymd(job.startDate)) : ymd(job.startDate), ed0 = ymd(job.endDate);
    var ov = D.createElement('div'); ov.id = 'gc-ad-ov';
    ov.innerHTML = '<div id="gc-ad-box" role="dialog" aria-modal="true" aria-labelledby="gc-ad-h">' +
      '<h3 id="gc-ad-h">Set “' + esc(name) + '” Active</h3>' +
      '<p class="sub">' + (ins ? 'Insurance job — log the date construction actually started.' : 'A job goes Active with its start date and estimated finish date.') + '</p>' +
      (ins
        ? '<label for="gc-ad-sd">Actual construction start date</label><input type="date" id="gc-ad-sd" value="' + esc(sd0) + '">' +
          '<div class="hint" data-ad-hint>Follow the TPA’s schedule; log the actual start date of construction.</div>'
        : '<label for="gc-ad-sd">Start date</label><input type="date" id="gc-ad-sd" value="' + esc(sd0) + '">' +
          '<label for="gc-ad-ed">Estimated finish date</label><input type="date" id="gc-ad-ed" value="' + esc(ed0) + '">') +
      '<div class="err" data-ad-err></div>' +
      '<div class="row"><button type="button" data-ad="cancel">Cancel</button><button type="button" class="go" data-ad="save">Save &amp; set Active</button></div>' +
      (isAdmin() ? '<button type="button" class="skip" data-ad="skip">Skip for now (the PM gets a To-Do to add the dates)</button>' : '') +
      '</div>';
    D.body.appendChild(ov);
    var err = ov.querySelector('[data-ad-err]');
    function close(r){ OPEN = null; try { ov.remove(); } catch (e) {} D.removeEventListener('keydown', key, true); done(r); }
    function key(e){ if (e.key === 'Escape') { e.stopPropagation(); close(null); } }
    OPEN = close;
    D.addEventListener('keydown', key, true);
    ov.addEventListener('click', function(e){
      var b = e.target && e.target.closest ? e.target.closest('[data-ad]') : null;
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var a = b.getAttribute('data-ad');
      if (a === 'cancel') return close(null);
      if (a === 'skip') return close({ skip: true, patch: { activeDatesSkipped: { by: myName(), at: nowIso() } } });
      var sd = ymd((ov.querySelector('#gc-ad-sd') || {}).value), edEl = ov.querySelector('#gc-ad-ed'), ed = edEl ? ymd(edEl.value) : '';
      if (!sd) { err.textContent = ins ? 'Enter the actual construction start date.' : 'Enter the start date.'; return; }
      if (ins) return close({ patch: { startDate: sd, constructionStart: sd, activeDatesBy: myName(), activeDatesAt: nowIso() } });
      if (!ed) { err.textContent = 'Enter the estimated finish date.'; return; }
      if (ed < sd) { err.textContent = 'The finish date can’t be before the start date.'; return; }
      close({ patch: { startDate: sd, endDate: ed, activeDatesBy: myName(), activeDatesAt: nowIso() } });
    });
    setTimeout(function(){ try { var f = ov.querySelector('#gc-ad-sd'); if (f && !f.value) f.focus(); } catch (e) {} }, 30);
  });
}
function kickBookends(){
  [1200, 5000].forEach(function(ms){ setTimeout(function(){ try { if (typeof W._gcSyncBookends === 'function') W._gcSyncBookends(); } catch (e) {} }, ms); });
}
function after(job, r, isNew){
  if (!r) return;
  if (r.skip && job && !isNew && s(job.id)) pmTodo(job, 'Set Active by ' + myName() + ' without its dates (Skip for now).');
  kickBookends();
}

/* askFor(job, nextStatus [, prevStatus]) → Promise: {patch} to save with the Active status ({} when nothing is
   needed), or null when the person cancelled. */
function askFor(job, next, prev){
  if (!job || !isActive(next) || isActive(prev === undefined ? job.status : prev) || !needs(job)) return Promise.resolve({ patch: {} });
  return ask(job).then(function(r){ if (r) after(job, r); return r; });
}

/* the dates the box returned, merged into the projects list of the very save that sets the job Active
   (the projects setter calls prep() on the list it hands its updater) */
var PENDING = {};
function prep(list){
  if (!Array.isArray(list)) return list;
  var ids = Object.keys(PENDING); if (!ids.length) return list;
  var t = Date.now(), any = false;
  ids.forEach(function(id){ if (PENDING[id].until < t) delete PENDING[id]; });
  var out = list.map(function(p){ var q = p && PENDING[p.id]; if (!q) return p; any = true; return Object.assign({}, p, q.patch); });
  return any ? out : list;
}
function post(list){
  if (!Array.isArray(list)) return;
  for (var i = 0; i < list.length; i++) { var p = list[i]; if (p && PENDING[p.id] && isActive(p.status)) delete PENDING[p.id]; }
}

/* block(job, nextStatus, replay, opts) — for a handler that changes an existing job's status (a select / a
   button): true = the box is open and the handler must stop; on Save the dates wait in PENDING and replay()
   runs the handler again (it saves dates + status together); on Cancel opts.onCancel(). */
function block(job, next, replay, opts){
  opts = opts || {};
  var prev = opts.prevStatus === undefined ? (job && job.status) : opts.prevStatus;
  if (!job || !isActive(next) || isActive(prev) || !needs(job)) return false;
  ask(job).then(function(r){
    if (!r) { try { if (opts.onCancel) opts.onCancel(); } catch (e) {} return; }
    if (job.id != null) PENDING[job.id] = { patch: r.patch, until: Date.now() + 20000 };
    try { replay(r.patch); } catch (e) { try { console.warn('[GC] ACTIVEDATES replay', e); } catch (_) {} }
    after(job, r);
  });
  return true;
}

/* form(orig, form, setForm, ev) — for an edit / new-job form with its own status select: true = stop; on
   Save the form gets the dates and its save button is pressed again. orig = the job as saved (null: new job). */
function form(orig, f, setForm, ev){
  f = f || {};
  var merged = Object.assign({}, orig || {}, f);
  var prev = orig ? orig.status : '';
  var sk = f.activeDatesSkipped; if (sk && sk.at && Date.now() - Date.parse(sk.at) < 120000) return false;   /* this form's own "Skip for now" */
  if (!isActive(f.status) || isActive(prev) || !needs(merged)) return false;
  var btn = ev && (ev.currentTarget || ev.target);
  ask(merged).then(function(r){
    if (!r) { try { if (orig) setForm({ status: prev }); } catch (e) {} return; }
    try { setForm(r.patch); } catch (e) {}
    if (r.skip && !orig) GRANT['form:new'] = r;
    after(orig, r, !orig);
    setTimeout(function(){ try { if (btn && btn.isConnected) btn.click(); } catch (e) {} }, 80);
  });
  return true;
}

/* fresh(key, pseudoJob, ev) / take(key, job) — a button that CREATES a job already Active (Activate an
   estimate, a job for a PO): the box first; on Save the button is pressed again and take() hands the dates
   to the new job record. */
var GRANT = {};
function fresh(key, pseudo, ev){
  if (GRANT[key]) return false;
  if (!needs(pseudo)) return false;
  var btn = ev && (ev.currentTarget || ev.target);
  ask(pseudo).then(function(r){
    if (!r) return;
    GRANT[key] = r;
    setTimeout(function(){ try { if (btn && btn.isConnected) btn.click(); else delete GRANT[key]; } catch (e) {} }, 60);
  });
  return true;
}
function take(key, job){
  var r = GRANT[key]; delete GRANT[key];
  if (!r) return {};
  if (r.skip && job) setTimeout(function(){ pmTodo(job, 'Set Active by ' + myName() + ' without its dates (Skip for now).'); }, 0);
  kickBookends();
  return r.patch || {};
}
/* a job a form made Active with "Skip for now": the To-Do once the form is saved (the new job has its id then) */
function formSaved(key, job){ var r = GRANT[key]; delete GRANT[key]; if (r && r.skip && job) setTimeout(function(){ pmTodo(job, 'Set Active by ' + myName() + ' without its dates (Skip for now).'); }, 0); }

/* a job that goes Active with no person at the screen (the customer signed in the portal): the PM's To-Do */
function autoTodo(job){
  if (!job || !needs(job)) return;
  var j = Object.assign({}, job);
  setTimeout(function(){ try { pmTodo(j, 'Went Active on its own (' + 'the customer signed' + ') without its dates.'); } catch (e) {} }, 0);
}

W._gcAD = { isActive: isActive, isIns: isIns, needs: needs, ask: ask, askFor: askFor, block: block, form: form, formSaved: formSaved,
  fresh: fresh, take: take, prep: prep, post: post, autoTodo: autoTodo, pmTodo: pmTodo, _pending: PENDING, _grant: GRANT };
try { console.log('[GC] ACTIVEDATES: a job goes Active with its start / finish (insurance: construction start) dates.'); } catch (e) {}
})();
