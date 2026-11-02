/* __GC_PATCH_SCHEDPICK__ ═══════════════════════════════════════════════════════════════════════════════════
   GrayCo — TEMPLATES ARE CHOSEN, NEVER APPLIED BY THEMSELVES (patch SCHEDPICK, owner 11/01 on ROTC Cordova: "how did
   all of this get in there … it should be chosen to be on there when making schedule, that schedule is completely made
   up"; then: "the templates DON'T APPLY AUTOMATICALLY UNLESS I CLICK APPLY TEMPLATES").

   On the job (desk: under the job header; field: the job screen) a "📋 Templates" bar:
     • 📋 Suggested schedule (N) — review: the template's tasks waiting for a person. Each with a checkbox, its dates,
       the assignee, the sub and "customer sees it" (off for anything internal). "Add selected" puts the ticked ones on
       the schedule (draft cleared, by = the person, "added by <name>"); "Dismiss all" removes the suggestions.
       ⚠ marks a task that lands after the job's end date; "Fit to the job's dates" squeezes the ticked ones in.
     • 🗓 Start from a template: the picker (residential roof, large commercial, mitigation, …; the job type's one is
       marked). Picking one makes SUGGESTIONS only and opens the same review.
     • 📎 Other templates: permit & inspection checklist, the draw-schedule default, the kickoff papers (contract, work
       authorization) — each with its own Apply / Make.
     • 🧾 Added automatically (N) — keep / remove: once per job, what the older automations put there by themselves
       (permit rows, inspections, punch items, a draw schedule, kickoff papers nobody touched) — kept or removed by the
       person, never deleted silently.
   Suggestions are not the schedule anywhere (patch SCHEDPICK core: window._gcSchedVisible).
   API: window._gcSchedPick = { open(pid), pick(pid), offers(pid), auto(pid), drafts(pid), accept(pid, picks),
        dismiss(pid), state() }
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_SCHEDPICK__) return; window.__GC_PATCH_SCHEDPICK__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowIso(){ return new Date().toISOString(); }
function ymd(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function today(){ return ymd(new Date()); }
function d10(v){ var t = s(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''; }
function addDays(iso, n){ var d = new Date(s(iso).slice(0, 10) + 'T12:00:00'); if (isNaN(d)) d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
function dayDiff(a, b){ return Math.round((new Date(s(b).slice(0, 10) + 'T12:00:00') - new Date(s(a).slice(0, 10) + 'T12:00:00')) / 864e5); }
function nice(iso){ var d = new Date(s(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? s(iso) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function isDraft(r){ return !!(W._gcSchedDraft && W._gcSchedDraft(r)); }
function crm(){ return W._crm || {}; }
function proj(pid){ try { if (W._gcAut && W._gcAut.proj) { var p = W._gcAut.proj(pid); if (p) return p; } } catch (e) {} return arr(crm().projects).filter(function(p){ return p && String(p.id) === String(pid); })[0] || null; }
function me(){ try { if (W._gcAut && W._gcAut.util && W._gcAut.util.me) { var n = s(W._gcAut.util.me()); if (n) return n; } } catch (e) {} try { return s(localStorage.getItem('grayco_user')) || 'someone'; } catch (e) { return 'someone'; } }
function saveProject(pid, fn){ try { if (W._gcAut && W._gcAut.saveProject) return Promise.resolve(W._gcAut.saveProject(pid, fn)); } catch (e) {} return Promise.resolve(null); }
function note(q, text){ try { if (W._gcAut && W._gcAut.jobNote) W._gcAut.jobNote(q, text); } catch (e) {} }
var LOG = [];
function log(what, o){ LOG.push(Object.assign({ at: nowIso(), what: what }, o || {})); if (LOG.length > 40) LOG.shift(); }

/* ── the schedule rows as they are now: the CRM's copy (_crm.schedule follows its state a few seconds late) with what
   this page just changed laid over it for 2 minutes ── */
var PEND = {};
function rows(){
  var base = arr(crm().schedule), ids = Object.keys(PEND); if (!ids.length) return base;
  var now = Date.now(), at = {}, out = base.slice();
  out.forEach(function(r, i){ if (r && r.id) at[r.id] = i; });
  ids.forEach(function(id){ var x = PEND[id]; if (now - x.t > 120e3) { delete PEND[id]; return; } var i = at[id]; if (x.r === null) { if (i != null) out[i] = null; } else if (i == null) out.push(x.r); else out[i] = x.r; });
  return out.filter(Boolean);
}
function write(fn, changed){
  Object.keys(changed || {}).forEach(function(id){ PEND[id] = { r: changed[id], t: Date.now() }; });
  try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('schedule suggestions'); } catch (e) {}
  try { if (W._setSchedule) W._setSchedule(function(prev){ return fn(Array.isArray(prev) ? prev : []); }); } catch (e) { log('write failed', { e: String(e && e.message || e) }); }
  later(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
  BAR_SIG = {};
}
function drafts(pid){
  return rows().filter(function(r){ return r && String(r.pid) === String(pid) && r.deleted !== true && isDraft(r); })
    .sort(function(a, b){ return s(a.date) < s(b.date) ? -1 : s(a.date) > s(b.date) ? 1 : 0; });
}
function tplRows(pid){ return rows().filter(function(r){ return r && String(r.pid) === String(pid) && r.tpl && r.deleted !== true; }); }
function internal(r){ return !!r.internal; }
function taskName(r){ return s(r.tplName) || s(r.title).replace(/^.*? — /, ''); }
function users(){ return arr(crm().users).filter(function(u){ return u && u.active !== false && s(u.name); }).map(function(u){ return s(u.name); }); }
function subs(){ var o = {}; arr(crm().subs).concat(arr(crm().vendors)).forEach(function(x){ var n = s(x && (x.company || x.name)); if (n) o[n] = 1; }); return Object.keys(o).sort(); }

/* ── accept / dismiss ── */
function accept(pid, picks){
  var who = me(), at = nowIso(), by = {}, changed = {}, cur = {};
  arr(picks).forEach(function(k){ if (k && k.id) by[k.id] = k; });
  rows().forEach(function(r){ if (r && r.id && by[r.id] && isDraft(r)) cur[r.id] = r; });
  var ids = Object.keys(cur); if (!ids.length) return Promise.resolve({ added: 0 });
  var patch = {};
  ids.forEach(function(id){
    var r = cur[id], k = by[id], date = d10(k.date) || d10(r.date), end = d10(k.endDate) || date;
    if (end < date) end = date;
    var cv = k.customerVisible != null ? !!k.customerVisible : (!internal(r) && r.customerVisible !== false);
    patch[id] = { date: date, endDate: end, days: dayDiff(date, end) + 1, assignee: k.assignee != null ? s(k.assignee) : s(r.assignee), vendor: k.vendor != null ? s(k.vendor) : s(r.vendor),
      customerVisible: cv, portal: cv, draft: false, by: who, acceptedBy: who, acceptedAt: at, updatedAt: at,
      notes: s(r.notes).replace(/ — (added|suggested) .*$/, '') + ' — added by ' + who + ' (' + nice(at.slice(0, 10)) + ')' };
    changed[id] = Object.assign({}, r, patch[id]);
  });
  /* the template's "move one, the ones after it follow" remembers these dates as the person's own */
  try { var dk = 'gc_tpl_dates', dm = JSON.parse(localStorage.getItem(dk) || '{}') || {}; ids.forEach(function(id){ dm[id] = patch[id].date; }); localStorage.setItem(dk, JSON.stringify(dm)); } catch (e) {}
  write(function(l){ return l.map(function(r){ return r && patch[r.id] ? Object.assign({}, r, patch[r.id]) : r; }); }, changed);
  log('accept', { pid: pid, n: ids.length, by: who });
  var all = tplRows(pid);
  return Promise.resolve(W._gcTplOffer && W._gcTplOffer.replan ? W._gcTplOffer.replan(pid, all) : null).then(function(){
    return saveProject(pid, function(q){ note(q, who + ' added ' + ids.length + ' suggested schedule task' + (ids.length === 1 ? '' : 's') + ' to the schedule: ' + ids.map(function(id){ return taskName(cur[id]); }).join(', ').slice(0, 200) + '.'); });
  }).then(function(){ return { added: ids.length }; });
}
function dismiss(pid, onlyIds){
  var who = me(), list = drafts(pid).filter(function(r){ return !onlyIds || onlyIds.indexOf(r.id) >= 0; }), gone = {}, changed = {};
  if (!list.length) return Promise.resolve({ dismissed: 0 });
  list.forEach(function(r){ gone[r.id] = 1; changed[r.id] = null; try { if (W._gcTombstone) W._gcTombstone('schedule', r.id); } catch (e) {} });
  write(function(l){ return l.filter(function(r){ return !(r && gone[r.id]); }); }, changed);
  log('dismiss', { pid: pid, n: list.length, by: who });
  var left = tplRows(pid).filter(function(r){ return !gone[r.id]; });
  return Promise.resolve(W._gcTplOffer && W._gcTplOffer.replan ? W._gcTplOffer.replan(pid, left) : null).then(function(){
    return saveProject(pid, function(q){ note(q, who + ' dismissed ' + list.length + ' suggested schedule task' + (list.length === 1 ? '' : 's') + ' (template “' + s(list[0].tpl) + '”).'); });
  }).then(function(){ return { dismissed: list.length }; });
}

/* ── the overlay ── */
function css(){
  if (D.getElementById('gcsp-css')) return;
  var st = D.createElement('style'); st.id = 'gcsp-css';
  st.textContent = '#gcsp-ov{position:fixed;inset:0;z-index:1000400;background:rgba(6,12,20,.72);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto;font:14px Inter,-apple-system,Segoe UI,Arial,sans-serif}' +
    '#gcsp-ov .sp-card{background:#fff;color:#0f172a;border-radius:14px;max-width:1060px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35)}' +
    '#gcsp-ov .sp-hd{padding:16px 20px 10px;border-bottom:1px solid #e2e8f0}#gcsp-ov .sp-hd h2{margin:0;font-size:18px}#gcsp-ov .sp-sub{color:#475569;font-size:13px;margin-top:4px}' +
    '#gcsp-ov .sp-bd{padding:10px 20px;max-height:62vh;overflow:auto}#gcsp-ov .sp-ft{padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
    '#gcsp-ov table{width:100%;border-collapse:collapse;font-size:13px}#gcsp-ov th{text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;padding:6px 4px;border-bottom:1px solid #e2e8f0}' +
    '#gcsp-ov td{padding:6px 4px;border-bottom:1px solid #f1f5f9;vertical-align:middle}#gcsp-ov input[type=date],#gcsp-ov input[type=text]{padding:5px 6px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;font-size:12.5px;max-width:150px}' +
    '#gcsp-ov button{padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-weight:700;cursor:pointer;font:inherit;font-weight:700}' +
    '#gcsp-ov button.sp-go{background:#16a34a;border-color:#16a34a;color:#fff}#gcsp-ov button.sp-no{color:#b91c1c;border-color:#fca5a5}#gcsp-ov .sp-warn{color:#b45309;font-size:11.5px;font-weight:700}' +
    '#gcsp-ov .sp-tag{font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:5px;background:#f1f5f9;color:#475569;margin-left:4px}#gcsp-ov .sp-msg{font-size:13px;font-weight:700;margin-left:auto}' +
    '#gcsp-ov .sp-sec{margin:12px 0 4px;font-weight:800}#gcsp-ov label.sp-ln{display:flex;gap:8px;align-items:center;padding:4px 0}' +
    '.gcsp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#fffbeb;border:1px solid #fcd34d;border-left:3px solid #d97706;border-radius:10px;padding:8px 12px;margin:8px 0;color:#0f172a;font:13px Inter,-apple-system,Segoe UI,Arial,sans-serif}' +
    '.gcsp-bar button{padding:7px 12px;border-radius:8px;border:1px solid #d97706;background:#fff;color:#92400e;font-weight:800;cursor:pointer;min-height:34px}.gcsp-bar button.sp-hot{background:#d97706;color:#fff}' +
    '@media (max-width:700px){#gcsp-ov td,#gcsp-ov th{display:block;border:none;padding:2px 0}#gcsp-ov tr{display:block;border-bottom:1px solid #e2e8f0;padding:6px 0}#gcsp-ov thead{display:none}}';
  (D.head || D.documentElement).appendChild(st);
}
function overlay(title, sub){
  css(); close();
  var ov = D.createElement('div'); ov.id = 'gcsp-ov';
  ov.innerHTML = '<div class="sp-card" role="dialog" aria-modal="true"><div class="sp-hd"><h2></h2><div class="sp-sub"></div></div><div class="sp-bd"></div><div class="sp-ft"></div></div>';
  ov.querySelector('h2').textContent = title; ov.querySelector('.sp-sub').innerHTML = sub || '';
  ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
  D.body.appendChild(ov);
  return { ov: ov, bd: ov.querySelector('.sp-bd'), ft: ov.querySelector('.sp-ft') };
}
function close(){ var o = D.getElementById('gcsp-ov'); if (o) o.remove(); }
function msg(O, t, bad){ var m = O.ft.querySelector('.sp-msg'); if (!m) { m = D.createElement('span'); m.className = 'sp-msg'; O.ft.appendChild(m); } m.textContent = t; m.style.color = bad ? '#b91c1c' : '#15803d'; }
function btn(O, label, cls, fn){ var b = D.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', fn); O.ft.appendChild(b); return b; }
function lists(O){
  if (O.ov.querySelector('#gcsp-users')) return;
  var a = D.createElement('datalist'); a.id = 'gcsp-users'; a.innerHTML = users().map(function(n){ return '<option value="' + esc(n) + '">'; }).join('');
  var b = D.createElement('datalist'); b.id = 'gcsp-subs'; b.innerHTML = subs().map(function(n){ return '<option value="' + esc(n) + '">'; }).join('');
  O.ov.appendChild(a); O.ov.appendChild(b);
}

/* 📋 the suggested schedule */
function openReview(pid){
  var p = proj(pid); if (!p) return null;
  var list = drafts(pid), sd = d10(p.startDate), ed = d10(p.endDate);
  var tn = list.length ? (function(){ var id = s(list[0].tpl), t = W._gcSchedTemplates && W._gcSchedTemplates.get ? W._gcSchedTemplates.get(id) : null; return t ? t.name : id; })() : '';
  var O = overlay('📋 Suggested schedule — ' + s(p.name) + ' (' + list.length + ')',
    (tn ? 'From the “' + esc(tn) + '” template. ' : '') + 'None of these is on the schedule, the calendar, the customer portal or any text until you add it. Tick the ones that are real, fix the dates, then <b>Add selected</b>.' +
    (sd || ed ? '<br>Job dates: <b>' + (sd ? nice(sd) : '?') + ' – ' + (ed ? nice(ed) : '?') + '</b>' : ''));
  O.ov.setAttribute('data-gcsp', 'review'); O.ov.setAttribute('data-pid', s(pid));
  if (!list.length) { O.bd.innerHTML = '<p>No suggested tasks on this job. Use <b>🗓 Start from a template</b> to see one.</p>'; btn(O, 'Close', '', close); return O; }
  lists(O);
  O.bd.innerHTML = '<table><thead><tr><th><input type="checkbox" data-sp-all title="Select all"></th><th>Task</th><th>Start</th><th>End</th><th>Assignee</th><th>Sub</th><th>Customer sees it</th></tr></thead><tbody>' +
    list.map(function(r){
      var inn = internal(r), cv = !inn && r.customerVisible !== false;
      return '<tr data-id="' + esc(r.id) + '"><td><input type="checkbox" data-k="on"></td>' +
        '<td><b>' + esc(taskName(r)) + '</b>' + (r.recurring ? '<span class="sp-tag">every ' + esc(r.recurring) + ' days</span>' : '') + (inn ? '<span class="sp-tag">internal</span>' : '') + '<div class="sp-warn" data-k="warn"></div></td>' +
        '<td><input type="date" data-k="date" value="' + esc(d10(r.date)) + '"></td><td><input type="date" data-k="endDate" value="' + esc(d10(r.endDate) || d10(r.date)) + '"></td>' +
        '<td><input type="text" data-k="assignee" list="gcsp-users" value="' + esc(r.assignee) + '" placeholder="—"></td><td><input type="text" data-k="vendor" list="gcsp-subs" value="' + esc(r.vendor) + '" placeholder="—"></td>' +
        '<td><input type="checkbox" data-k="cv"' + (cv ? ' checked' : '') + '></td></tr>';
    }).join('') + '</tbody></table>';
  function warn(){
    Array.prototype.forEach.call(O.bd.querySelectorAll('tr[data-id]'), function(tr){
      var a = tr.querySelector('[data-k=date]').value, b = tr.querySelector('[data-k=endDate]').value || a, w = tr.querySelector('[data-k=warn]'), t = [];
      if (ed && a && a > ed) t.push('⚠ starts after the job’s end date (' + nice(ed) + ')'); else if (ed && b && b > ed) t.push('⚠ ends after the job’s end date (' + nice(ed) + ')');
      if (sd && a && a < sd) t.push('⚠ before the job’s start (' + nice(sd) + ')');
      w.textContent = t.join(' · ');
    });
  }
  warn();
  O.bd.addEventListener('change', function(e){
    if (e.target.hasAttribute('data-sp-all')) Array.prototype.forEach.call(O.bd.querySelectorAll('[data-k=on]'), function(c){ c.checked = e.target.checked; });
    warn(); count();
  });
  function picked(){ return Array.prototype.filter.call(O.bd.querySelectorAll('tr[data-id]'), function(tr){ return tr.querySelector('[data-k=on]').checked; }); }
  var add = btn(O, 'Add selected', 'sp-go', function(){
    var trs = picked(); if (!trs.length) return msg(O, 'Tick the tasks to add first.', true);
    var picks = trs.map(function(tr){ return { id: tr.getAttribute('data-id'), date: tr.querySelector('[data-k=date]').value, endDate: tr.querySelector('[data-k=endDate]').value, assignee: tr.querySelector('[data-k=assignee]').value, vendor: tr.querySelector('[data-k=vendor]').value, customerVisible: tr.querySelector('[data-k=cv]').checked }; });
    if (picks.some(function(k){ return !d10(k.date); })) return msg(O, 'Every ticked task needs a start date.', true);
    add.disabled = true;
    accept(pid, picks).then(function(r){ paintSoon(); var left = drafts(pid).length; msg(O, '✓ Added ' + r.added + ' to the schedule' + (left ? ' — ' + left + ' still suggested' : '') + '.'); later(function(){ if (left) openReview(pid); else close(); }, 900); }, function(){ add.disabled = false; msg(O, 'Not saved — try again.', true); });
  });
  function count(){ add.textContent = 'Add selected (' + picked().length + ')'; }
  count();
  if (sd && ed && ed >= sd) btn(O, 'Fit ticked tasks to the job’s dates', '', function(){
    var trs = picked(); if (!trs.length) return msg(O, 'Tick the tasks to fit first.', true);
    var a0 = null, b0 = null;
    trs.forEach(function(tr){ var a = tr.querySelector('[data-k=date]').value, b = tr.querySelector('[data-k=endDate]').value || a; if (a && (!a0 || a < a0)) a0 = a; if (b && (!b0 || b > b0)) b0 = b; });
    if (!a0) return;
    var span = Math.max(1, dayDiff(a0, b0) + 1), room = dayDiff(sd, ed) + 1, f = Math.min(1, room / span);
    trs.forEach(function(tr){ var ia = tr.querySelector('[data-k=date]'), ib = tr.querySelector('[data-k=endDate]'), a = ia.value, b = ib.value || a;
      var off = Math.min(room - 1, Math.round(dayDiff(a0, a) * f)), len = Math.max(1, Math.min(Math.round((dayDiff(a, b) + 1) * f), room - off));
      ia.value = addDays(sd, off); ib.value = addDays(sd, off + len - 1); });
    warn(); msg(O, 'Dates fitted between ' + nice(sd) + ' and ' + nice(ed) + ' — check them, then Add selected.');
  });
  btn(O, 'Dismiss all', 'sp-no', function(){
    if (!confirm('Dismiss all ' + list.length + ' suggested tasks for ' + s(p.name) + '?\n\nThey were never on the schedule; this removes the suggestions.')) return;
    dismiss(pid).then(function(r){ paintSoon(); msg(O, '✓ Dismissed ' + r.dismissed + '.'); later(close, 900); });
  });
  btn(O, 'Close', '', close);
  return O;
}

/* 🗓 Start from a template */
function openPicker(pid){
  var p = proj(pid); if (!p) return null;
  var T = W._gcSchedTemplates; if (!T || !T.list) { alert('The schedule templates are still loading — try again in a moment.'); return null; }
  var sug = T.pick ? T.pick(pid) : null, l = T.list().sort(function(a, b){ return (b.id === sug) - (a.id === sug) || s(a.name).localeCompare(s(b.name)); });
  var sd = d10(p.startDate), ed = d10(p.endDate), have = drafts(pid).length;
  var O = overlay('🗓 Start from a template — ' + s(p.name), 'Pick the template that fits this job. Its tasks come up as <b>suggestions</b> to review — nothing goes on the schedule until you add them.' + (have ? '<br><b>This job already has ' + have + ' suggested tasks</b> — they stay until you add or dismiss them.' : ''));
  O.ov.setAttribute('data-gcsp', 'pick'); O.ov.setAttribute('data-pid', s(pid));
  O.bd.innerHTML = l.map(function(t){ return '<label class="sp-ln"><input type="radio" name="gcsp-tpl" value="' + esc(t.id) + '"' + (t.id === sug ? ' checked' : '') + '> <span><b>' + esc(t.name) + '</b> <span class="sp-tag">' + esc(t.tasks) + ' tasks</span>' + (t.id === sug ? ' <span class="sp-tag" style="background:#dcfce7;color:#166534">fits this job type (' + esc(p.type || '') + ')</span>' : '') + '</span></label>'; }).join('') +
    '<div class="sp-sec">Dates</div><label class="sp-ln">Start on <input type="date" data-k="start" value="' + esc(sd && sd >= today() ? sd : today()) + '"></label>' +
    (ed ? '<label class="sp-ln"><input type="checkbox" data-k="fit" checked> Fit the tasks between the job’s start and end dates (' + (sd ? nice(sd) : 'start') + ' – ' + nice(ed) + ')</label>' : '');
  btn(O, 'Show the suggested tasks', 'sp-go', function(){
    var r = O.bd.querySelector('input[name=gcsp-tpl]:checked'); if (!r) return msg(O, 'Pick a template.', true);
    var fitEl = O.bd.querySelector('[data-k=fit]'), st = O.bd.querySelector('[data-k=start]').value;
    var made = W._gcTplOffer && W._gcTplOffer.apply ? W._gcTplOffer.apply(pid, r.value, fitEl ? fitEl.checked : false, st) : null;
    if (!made || !made.length) return msg(O, 'Nothing was made from that template.', true);
    made.forEach(function(x){ PEND[x.id] = { r: x, t: Date.now() }; });
    log('template', { pid: pid, tpl: r.value, n: made.length, by: me() });
    BAR_SIG = {}; paintSoon(); openReview(pid);
  });
  btn(O, 'Cancel', '', close);
  return O;
}

/* 📎 the job's other templates — each applied only by its own button */
function openOffers(pid){
  var p = proj(pid), o = W._gcTplOffer && W._gcTplOffer.offers ? W._gcTplOffer.offers(pid) : null; if (!p || !o) return null;
  var O = overlay('📎 Templates for ' + s(p.name), 'Nothing here is on the job until you apply it.');
  O.ov.setAttribute('data-gcsp', 'offers'); O.ov.setAttribute('data-pid', s(pid));
  var h = '';
  if (o.permits.permits.length || o.permits.inspections.length) h += '<div class="sp-sec">📄 Permit & inspection checklist (' + esc(o.permits.kind) + (o.permits.office ? ' — ' + esc(o.permits.office) : '') + ')</div>' +
    o.permits.permits.map(function(t){ return '<label class="sp-ln"><input type="checkbox" data-perm="' + esc(t) + '"> Permit: ' + esc(t) + '</label>'; }).join('') +
    o.permits.inspections.map(function(t){ return '<label class="sp-ln"><input type="checkbox" data-insp="' + esc(t) + '"> Inspection: ' + esc(t) + '</label>'; }).join('') +
    '<button type="button" data-sp-act="permits">Apply the ticked ones</button>';
  if (o.draws) h += '<div class="sp-sec">🧾 Draw schedule</div><div>' + esc(o.draws.value) + ' — the “' + esc(o.draws.from) + '” default. <button type="button" data-sp-act="draws">Apply</button></div>';
  if (o.docs.length) h += '<div class="sp-sec">✍️ Kickoff papers</div>' + o.docs.map(function(d){ return '<div class="sp-ln">' + esc(d.name) + ' <span class="sp-tag">' + esc(d.note) + '</span> <button type="button" data-sp-act="doc" data-kind="' + esc(d.kind) + '">Make</button></div>'; }).join('');
  h += '<div class="sp-sec">✅ Punch list</div><div class="sp-sub">The suggestions (and the final walkthrough) wait on the job’s Punch tab — tick the ones that apply.</div>';
  h += '<div class="sp-sec">🔧 PM checklist</div><div class="sp-sub">PM Field Controls offers the job-type checklist with its own “Apply the checklist”.</div>';
  O.bd.innerHTML = h;
  O.bd.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-sp-act]'); if (!b) return;
    var a = b.getAttribute('data-sp-act'); b.disabled = true;
    var pr = a === 'permits' ? W._gcTplOffer.applyPermits(pid, { permits: Array.prototype.filter.call(O.bd.querySelectorAll('[data-perm]'), function(c){ return c.checked; }).map(function(c){ return c.getAttribute('data-perm'); }),
        inspections: Array.prototype.filter.call(O.bd.querySelectorAll('[data-insp]'), function(c){ return c.checked; }).map(function(c){ return c.getAttribute('data-insp'); }) })
      : a === 'draws' ? W._gcTplOffer.applyDraws(pid) : W._gcTplOffer.makeDoc(pid, b.getAttribute('data-kind'));
    Promise.resolve(pr).then(function(r){ b.textContent = r ? '✓ Done' : 'Nothing to apply'; if (!r) b.disabled = false; BAR_SIG = {}; paintSoon(); }, function(){ b.disabled = false; msg(O, 'Not saved — try again.', true); });
  });
  btn(O, 'Close', '', close);
  return O;
}

/* 🧾 added automatically — keep / remove (once per job) */
function openAuto(pid){
  var p = proj(pid); if (!p || !W._gcTplOffer) return Promise.resolve(null);
  return W._gcTplOffer.autoAdded(pid).then(function(items){
    var O = overlay('🧾 Added automatically — ' + s(p.name), 'The older automations put these on the job by themselves, from a template. Keep them, or tick the ones to remove. You are asked once.');
    O.ov.setAttribute('data-gcsp', 'auto'); O.ov.setAttribute('data-pid', s(pid));
    if (!items.length) { O.bd.innerHTML = '<p>Nothing left to review on this job.</p>'; btn(O, 'Close', '', close); return O; }
    O.bd.innerHTML = '<div class="sp-sub" style="margin-bottom:6px">Ticked = remove.</div>' + items.map(function(x){ return '<label class="sp-ln"><input type="checkbox" data-key="' + esc(x.key) + '"> <span class="sp-tag">' + esc(x.kind) + '</span> ' + esc(x.label) + '</label>'; }).join('');
    function done(keys){ W._gcTplOffer.review(pid, keys).then(function(r){ AUTO_C[pid] = { at: Date.now(), n: 0 }; BAR_SIG = {}; paintSoon(); msg(O, '✓ Kept ' + r.kept + ', removed ' + r.removed + '.'); later(close, 900); }); }
    btn(O, 'Keep all', 'sp-go', function(){ done([]); });
    btn(O, 'Remove the ticked ones', 'sp-no', function(){ var k = Array.prototype.filter.call(O.bd.querySelectorAll('[data-key]'), function(c){ return c.checked; }).map(function(c){ return c.getAttribute('data-key'); }); if (!k.length) return msg(O, 'Tick the ones to remove (or Keep all).', true); done(k); });
    btn(O, 'Later', '', close);
    return O;
  });
}

/* ── the bar on the job ── */
var AUTO_C = {}, BAR_SIG = {};
function autoCount(pid){
  var c = AUTO_C[pid];
  if (!c || Date.now() - c.at > 60e3) { AUTO_C[pid] = { at: Date.now(), n: c ? c.n : 0 }; if (W._gcTplOffer) W._gcTplOffer.autoAdded(pid).then(function(l){ var n = l.length; if (AUTO_C[pid].n !== n) { AUTO_C[pid] = { at: Date.now(), n: n }; BAR_SIG = {}; paintSoon(); } else AUTO_C[pid].n = n; }, function(){}); }
  return AUTO_C[pid].n;
}
function offerCount(pid){ var o = W._gcTplOffer && W._gcTplOffer.offers ? W._gcTplOffer.offers(pid) : null; return o ? o.permits.permits.length + o.permits.inspections.length + (o.draws ? 1 : 0) + o.docs.length : 0; }
function barHtml(pid){
  var n = drafts(pid).length, a = autoCount(pid), o = offerCount(pid);
  return '<b>📋 Templates</b>' +
    (n ? '<button type="button" class="sp-hot" data-sp="review">📋 Suggested schedule (' + n + ') — review</button>' : '') +
    '<button type="button" data-sp="pick">🗓 Start from a template</button>' +
    (o ? '<button type="button" data-sp="offers">📎 Other templates (' + o + ')</button>' : '') +
    (a ? '<button type="button" class="sp-hot" data-sp="auto">🧾 Added automatically (' + a + ') — keep / remove</button>' : '');
}
function makeBar(pid){
  var b = D.createElement('div'); b.className = 'gcsp-bar'; b.setAttribute('data-pid', s(pid));
  b.addEventListener('click', function(e){ var t = e.target.closest && e.target.closest('[data-sp]'); if (!t) return; var k = t.getAttribute('data-sp'), id = b.getAttribute('data-pid');
    if (k === 'review') openReview(id); else if (k === 'pick') openPicker(id); else if (k === 'offers') openOffers(id); else if (k === 'auto') openAuto(id); });
  return b;
}
function fill(b, pid){ var h = barHtml(pid); if (b.__h !== h) { b.innerHTML = h; b.__h = h; } }
function deskBar(){
  if (D.hidden || D.documentElement.classList.contains('_fieldmode')) return;
  var main = D.querySelector('main'); if (!main) return;
  var op = W._gcOpenProject, p = op && op.id ? proj(op.id) : null, bars = main.querySelectorAll('.gcsp-bar:not([data-field])');
  if (!p) { Array.prototype.forEach.call(bars, function(x){ x.remove(); }); return; }
  var back = null, bs = main.getElementsByTagName('button');
  for (var i = 0; i < bs.length && i < 80; i++) if (/^\s*←\s*All Projects\s*$/.test(bs[i].textContent || '')) { back = bs[i]; break; }
  if (!back) { Array.prototype.forEach.call(bars, function(x){ x.remove(); }); return; }
  var root = back.parentElement, have = root.querySelector(':scope > .gcsp-bar');
  Array.prototype.forEach.call(bars, function(x){ if (x !== have) x.remove(); });
  if (have && have.getAttribute('data-pid') === String(p.id)) { fill(have, p.id); return; }
  if (have) have.remove();
  var ja = root.querySelector(':scope > .gcja-bar'), card = root.querySelector(':scope > .gcq-card'), head = back.nextElementSibling;
  var after = ja || card || (head && !head.classList.contains('gcsp-bar') ? head : back);
  var b = makeBar(p.id); fill(b, p.id); root.insertBefore(b, after.nextSibling);
}
function fieldBar(){
  var ov = D.getElementById('_gcJobDash'), ja = ov && ov.querySelector('.gcja-bar[data-field]'), pid = ja && ja.getAttribute('data-pid');
  if (!ov || !pid) return;
  var have = ov.querySelector('.gcsp-bar[data-field]');
  if (have && have.getAttribute('data-pid') === pid) { fill(have, pid); return; }
  if (have) have.remove();
  var b = makeBar(pid); b.setAttribute('data-field', '1'); b.style.margin = '8px 12px'; fill(b, pid);
  ja.parentNode.insertBefore(b, ja.nextSibling);
}
var pq = false;
function paintSoon(){ if (pq) return; pq = true; later(function(){ pq = false; paint(); }, 60); }
function paint(){ try { deskBar(); } catch (e) { log('desk', { e: String(e && e.message || e) }); } try { fieldBar(); } catch (e) { log('field', { e: String(e && e.message || e) }); } }
try { (W.__gcJobPaint = W.__gcJobPaint || []).push(function(){ paint(); }); } catch (e) {}
SI.call(W, function(){ if (!D.hidden) paint(); }, 1500);

W._gcSchedPick = {
  open: openReview, review: openReview, pick: openPicker, offers: openOffers, auto: openAuto, drafts: drafts, accept: accept, dismiss: dismiss, close: close, paint: paint,
  state: function(pid){ var o = { log: LOG.slice(-10), pend: Object.keys(PEND).length }; if (pid) { o.drafts = drafts(pid).length; o.auto = AUTO_C[pid] ? AUTO_C[pid].n : null; o.offers = offerCount(pid); } return o; }
};
try { console.log('[GC] 📋 Templates are chosen, never applied by themselves; suggestions are not the schedule (patch SCHEDPICK) — _gcSchedPick.state(pid)'); } catch (e) {}
})();
