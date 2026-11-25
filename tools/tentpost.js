<script id="gc-patch-tentpost">
/* __GC_PATCH_TENTPOST__ — 📅 A JOB GOES ACTIVE WITH A TENTATIVE SCHEDULE (owner 11/25: "when I change a job to active and it has a
   tentative schedule, ask if we want to post that as the schedule or edit it before posting the schedule").
   • When a PERSON sets a job Active / Approved / In progress (the desk job page, the Projects list, Field — SYNC-A's person-edit
     stamp _fe.status made on this computer, or the desk job page's own save) and the job has schedule items still tentative
     (scope "tentative" / tentative:true — what the Schedule's 📋 Tentative tab shows), an inline card asks once per activation:
       "📅 <Job> has N tentative schedule items — ✅ Post as the schedule · ✏️ Edit first · Later"
     On the job's desk page / Field job page the card sits under the 🏠 Portal card; anywhere else (the Projects list) it is a
     light strip at the bottom of the screen. Never a popup. A status that arrived by sync (no person stamp here) asks nothing.
   • The desk job page no longer turns the tentative items into the schedule by itself on Active / Approved — it asks
     (_gcSyncScheduleToStatus keeps its old behaviour for every other status, and when nothing is tentative).
   • ✅ Post: those items become the schedule exactly like that function did (tentative:false, scope "company"), stamped
     postedBy / postedAt, and a line in the job's scheduleHistory. No new customer / sub message here.
   • ✏️ Edit first: 📅 Schedule on the 📋 Tentative tab, filtered to the job, with "✅ Post all for <job>" in a strip.
   • Later: a To-Do "📅 Post the tentative schedule for <job>" for the job's superintendent (_gcPaperTo) or PM — closed by itself
     once nothing is tentative on the job.
   API: window._gcTentPost = { tentOf(pid), ask(pid, why), post(pid), edit(pid), later(pid), tick(), state() } */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_TENTPOST__) return; W.__GC_PATCH_TENTPOST__ = true;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout, RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowIso(){ return new Date().toISOString(); }
function ms(v){ var t = Date.parse(s(v)); return isFinite(t) ? t : 0; }
var STATS = { asked: 0, posted: 0, edits: 0, laters: 0, deskHeld: 0, errs: [] };
function oops(e){ try { console.warn('[GC TENTPOST]', e && e.message || e); STATS.errs.push(String(e && e.message || e).slice(0, 160)); if (STATS.errs.length > 20) STATS.errs.shift(); } catch (x) {} }
var GO = /^(active|approved|in[ _-]?progress)$/i;
function projects(){ return arr(W._crm && W._crm.projects); }
function proj(pid){ return projects().filter(function(p){ return s(p.id) === s(pid); })[0] || null; }
function sched(){ return arr(W._crm && W._crm.schedule); }
function isTent(x){ return !!x && !x.deleted && (x.tentative === true || s(x.scope) === 'tentative'); }
function tentOf(pid){ return sched().filter(function(x){ return isTent(x) && s(x.pid) === s(pid); }); }
function myName(){ try { var u = typeof W._gcMeUser === 'function' ? W._gcMeUser() : null; if (u && u.name) return s(u.name); } catch (e) {} try { var j = JSON.parse(localStorage.getItem('grayco_user') || '{}'); if (j && j.name) return s(j.name); } catch (e) {} return s(localStorage.getItem('grayco_user')) || 'GrayCo'; }
function meKeys(){ var k = {}; try { var e = W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email(); if (e) k[low(e)] = 1; } catch (x) {} try { var g = localStorage.getItem('grayco_user'); if (g) k[low(g)] = 1; } catch (x) {} var n = myName(); if (n) k[low(n)] = 1; return k; }
function lsJ(k, d){ try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
function lsS(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

/* ── which activation was asked about (once each) ── */
var SEEN = lsJ('gc_tentpost_seen', {}), OPEN = {}, RECENT = {};
function seen(k){ return !!SEEN[k]; }
function markSeen(k){ SEEN[k] = Date.now(); var ks = Object.keys(SEEN); if (ks.length > 300) ks.sort(function(a, b){ return SEEN[a] - SEEN[b]; }).slice(0, ks.length - 300).forEach(function(x){ delete SEEN[x]; }); lsS('gc_tentpost_seen', SEEN); }

function ask(pid, why){
  var p = proj(pid); if (!p) return false;
  var n = tentOf(pid).length; if (!n) return false;
  OPEN[s(pid)] = { at: Date.now(), why: why || '' }; STATS.asked++;
  paint(); return true;
}

/* ── the desk job page's save: hold the tentative items for the question instead of posting them by itself ── */
function wrapSync(){
  var f = W._gcSyncScheduleToStatus; if (typeof f !== 'function') { later(wrapSync, 500); return; }
  if (f.__tp) return;
  var w = function(pid, st){
    try {
      if (pid && GO.test(s(st)) && tentOf(pid).length) {
        STATS.deskHeld++; RECENT[s(pid)] = Date.now();
        later(function(){ ask(pid, 'desk'); }, 300);
        return;
      }
    } catch (e) { oops(e); }
    return f.apply(this, arguments);
  };
  w.__tp = true; W._gcSyncScheduleToStatus = w;
}
wrapSync();

/* ── a person's status change seen in the job list (SYNC-A's stamp made by this person) ── */
function scan(){
  var me = meKeys(), now = Date.now();
  projects().forEach(function(p){
    if (!p || !p.id || p.deleted || !GO.test(s(p.status))) return;
    var fe = p._fe && p._fe.status; if (!fe || low(fe.v) !== low(p.status)) return;
    var at = ms(fe.at); if (!at || now - at > 10 * 60e3) return;
    if (!me[low(fe.by)]) return;                                       /* someone else's change (synced here): not asked here */
    var was = arr(fe.was).map(low); if (was.length && GO.test(was[0])) return;   /* Active → Approved is no activation */
    var key = s(p.id) + '|' + s(fe.at); if (seen(key)) return;
    markSeen(key);
    var r = RECENT[s(p.id)]; if (r && Math.abs(r - at) < 180e3 && OPEN[s(p.id)]) return;   /* the desk save already asked */
    ask(p.id, 'status');
  });
}

/* ── ✅ Post ── */
function post(pid, via){
  pid = s(pid); var p = proj(pid); var n0 = tentOf(pid).length; if (!n0) { close(pid); return Promise.resolve(0); }
  var at = nowIso(), by = myName(), n = 0;
  try {
    var apply = function(prev){
      var out = arr(prev).map(function(x){ if (isTent(x) && s(x.pid) === pid) { n++; return Object.assign({}, x, { tentative: false, scope: 'company', postedAt: at, postedBy: by, updatedAt: at }); } return x; });
      try { if (W.idbSet) W.idbSet('schedule', out); } catch (e) {}
      try { var up = W._supaUpsertNow || W._supaUpsert; if (up) up('schedule', out); } catch (e) {}
      return out;
    };
    if (typeof W._setSchedule === 'function') W._setSchedule(apply);
    else if (W._crm) W._crm.schedule = apply(W._crm.schedule);
    if (W._crm && Array.isArray(W._crm.schedule) && tentOf(pid).length) W._crm.schedule = W._crm.schedule.map(function(x){ return isTent(x) && s(x.pid) === pid ? Object.assign({}, x, { tentative: false, scope: 'company', postedAt: at, postedBy: by, updatedAt: at }) : x; });
  } catch (e) { oops(e); }
  STATS.posted++;
  var cnt = n0;   /* React may run the updater twice: count what was tentative before */
  try { if (p && typeof W._gcxPatchJob === 'function') W._gcxPatchJob(pid, { scheduleHistory: arr(p.scheduleHistory).concat([{ at: at, by: by, what: 'Posted the tentative schedule (' + cnt + ' item' + (cnt === 1 ? '' : 's') + ')', via: via || 'activation' }]).slice(-40) }, 'tentative schedule posted'); } catch (e) { oops(e); }
  todoClose(pid, 'posted');
  close(pid); toast('📅 Posted — ' + cnt + ' item' + (cnt === 1 ? '' : 's') + ' of ' + s(p && p.name || 'the job') + ' are on the schedule.');
  return Promise.resolve(cnt);
}
/* ── ✏️ Edit first: the Schedule's 📋 Tentative tab, this job only ── */
var EDIT = null;
function edit(pid){
  pid = s(pid); STATS.edits++; close(pid, true);
  EDIT = { pid: pid, at: Date.now() };
  W.__gcSchedOpen = { pid: pid, scope: 'tentative', at: Date.now() };
  try { if (typeof W._gcSchedSet === 'function' && view() === 'schedule') W._gcSchedSet({ pid: pid, scope: 'tentative' }); } catch (e) {}
  try { if (typeof W._setView === 'function') W._setView('schedule'); } catch (e) { oops(e); }
  later(function(){ try { if (typeof W._gcSchedSet === 'function') W._gcSchedSet({ pid: pid, scope: 'tentative' }); } catch (e) {} paint(); }, 400);
  paint();
}
/* ── Later: a To-Do for the job's superintendent (or PM) ── */
function tasksGet(){ var l = lsJ('gc_office_tasks', []); return Array.isArray(l) ? l : []; }
function tasksPut(l){
  lsS('gc_office_tasks', l);
  try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {}
  try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {}
  try { if (typeof W._gcSyncDirty === 'function') W._gcSyncDirty('gc_office_tasks'); } catch (e) {}
}
function todoId(pid){ return 'TENTPOST_' + s(pid); }
function laterTodo(pid){
  pid = s(pid); var p = proj(pid); if (!p) return; STATS.laters++;
  var l = tasksGet(), id = todoId(pid), t = l.filter(function(x){ return x && x.id === id; })[0], now = nowIso();
  var who = (W._gcPaperTo ? W._gcPaperTo(p) : '') || s(p.pm), cc = W._gcPaperCc ? W._gcPaperCc(p) : '';
  var label = '📅 Post the tentative schedule for ' + s(p.name || 'the job'), note = tentOf(pid).length + ' tentative item(s) on the job — 📅 Schedule → 📋 Tentative (filtered to the job) → ✅ Post all, or the job\'s card.';
  if (!t) l.push({ id: id, kind: 'tentpost', pid: pid, label: label, note: note, assignee: who, pmCc: cc, forRole: who ? '' : 'office', addedBy: 'CRM', addedAt: now, updatedAt: now, done: false, prio: 'med' });
  else { t.label = label; t.note = note; t.done = false; t.updatedAt = now; if (!t.assignee) t.assignee = who; }
  tasksPut(l);
  close(pid); toast('📅 Later — a To-Do is on ' + (who || 'the office') + '\'s list until it is posted.');
}
function todoClose(pid, why){
  var l = tasksGet(), id = todoId(pid), ch = false, now = nowIso();
  l.forEach(function(x){ if (x && x.id === id && !x.done) { x.done = true; x.doneAt = x.updatedAt = now; x.resolution = why === 'posted' ? 'the tentative schedule was posted' : 'nothing tentative left on the job'; ch = true; } });
  if (ch) tasksPut(l);
}
function todoSweep(){
  var l = tasksGet(); l.forEach(function(x){ if (x && x.kind === 'tentpost' && !x.done && x.pid && proj(x.pid) && sched().length && !tentOf(x.pid).length) todoClose(x.pid, 'none'); });
}
function close(pid, keepEdit){ delete OPEN[s(pid)]; if (!keepEdit && EDIT && EDIT.pid === s(pid)) EDIT = null; paint(); }

/* ── drawing: the card on the job's page, else a strip at the bottom ── */
function view(){ try { return localStorage.getItem('grayco_view') || ''; } catch (e) { return ''; } }
function css(){
  if (D.getElementById('gc-tp-css')) return;
  var st = D.createElement('style'); st.id = 'gc-tp-css';
  st.textContent = [
    '.gc-tp-card{background:#fffbeb;color:#14202e;border:1px solid #f0d58a;border-left:4px solid #d4a017;border-radius:12px;padding:10px 12px;margin:8px 0 10px;font:14px Inter,-apple-system,sans-serif;box-sizing:border-box}',
    '.gc-tp-card b{font-weight:800}.gc-tp-card .t{line-height:1.4;overflow-wrap:anywhere}',
    '.gc-tp-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.gc-tp-b{min-height:40px;padding:8px 12px;border-radius:10px;border:1px solid #d8d2c4;background:#fff;color:#14202e;font:600 13.5px Inter,-apple-system,sans-serif;cursor:pointer}',
    '.gc-tp-b.pri{background:#d4a017;border-color:#d4a017}',
    '#gc-tp-dock{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100250;width:min(620px,calc(100vw - 32px));box-shadow:0 8px 24px rgba(0,0,0,.16);margin:0}',
    'html._fieldmode #gc-tp-dock{bottom:84px}',
    '#gc-tp-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100300;background:#fff;color:#14202e;border:1px solid #d4a017;border-radius:10px;padding:10px 16px;font:14px Inter,-apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.15);display:none;max-width:calc(100vw - 32px)}',
    '@media (max-width:600px){.gc-tp-b{flex:1 1 auto}}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
}
function toast(t){
  css(); var el = D.getElementById('gc-tp-toast'); if (!el) { el = D.createElement('div'); el.id = 'gc-tp-toast'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status'); D.body.appendChild(el); }
  el.textContent = t; el.style.display = 'block'; clearTimeout(el.__t); el.__t = later(function(){ el.style.display = 'none'; }, 3800);
}
function cardHtml(pid, mode){
  var p = proj(pid) || {}, n = tentOf(pid).length, nm = esc(p.name || 'This job');
  if (mode === 'edit') return '<div class="t">📋 Tentative schedule of <b>' + nm + '</b> — ' + n + ' item' + (n === 1 ? '' : 's') + '. Change dates here, then post.</div><div class="gc-tp-acts"><button type="button" class="gc-tp-b pri" data-tp="postall" data-pid="' + esc(pid) + '">✅ Post all for ' + nm + '</button><button type="button" class="gc-tp-b" data-tp="done" data-pid="' + esc(pid) + '">✕ Close</button></div>';
  return '<div class="t">📅 <b>' + nm + '</b> has ' + n + ' tentative schedule item' + (n === 1 ? '' : 's') + '.</div><div class="gc-tp-acts"><button type="button" class="gc-tp-b pri" data-tp="post" data-pid="' + esc(pid) + '">✅ Post as the schedule</button><button type="button" class="gc-tp-b" data-tp="edit" data-pid="' + esc(pid) + '">✏️ Edit first</button><button type="button" class="gc-tp-b" data-tp="later" data-pid="' + esc(pid) + '">Later</button></div>';
}
function anchorFor(pid){
  var c = D.querySelector('#_gcJobDash .gcq-card[data-field][data-pid="' + pid + '"]') || D.querySelector('main .gcq-card:not([data-field])[data-pid="' + pid + '"]');
  return c && c.parentNode ? c : null;
}
var painting = false;
function paint(){
  if (painting) return; painting = true;
  try {
    css();
    var want = {};
    Object.keys(OPEN).forEach(function(pid){ if (!tentOf(pid).length) { delete OPEN[pid]; return; } want[pid] = 'ask'; });
    if (EDIT && (view() !== 'schedule' || !tentOf(EDIT.pid).length || Date.now() - EDIT.at > 30 * 60e3) && Date.now() - EDIT.at > 3000) EDIT = null;
    /* old cards */
    Array.prototype.forEach.call(D.querySelectorAll('.gc-tp-card'), function(el){
      var pid = el.getAttribute('data-pid'), m = el.getAttribute('data-mode');
      if (m === 'edit' ? !(EDIT && EDIT.pid === pid) : want[pid] !== 'ask') el.remove();
    });
    var dockPid = '';
    Object.keys(want).forEach(function(pid){
      var a = anchorFor(pid), html = cardHtml(pid, 'ask');
      var have = D.querySelector('.gc-tp-card[data-mode="ask"][data-pid="' + pid + '"]:not(#gc-tp-dock)');
      if (a) {
        if (!have || have.previousElementSibling !== a) { if (have) have.remove(); have = D.createElement('div'); have.className = 'gc-tp-card'; have.setAttribute('data-pid', pid); have.setAttribute('data-mode', 'ask'); have.setAttribute('role', 'region'); have.setAttribute('aria-label', 'Tentative schedule'); a.parentNode.insertBefore(have, a.nextSibling); }
        if (have.__h !== html) { have.innerHTML = html; have.__h = html; }
      } else { if (have) have.remove(); if (!dockPid) dockPid = pid; }
    });
    var dock = D.getElementById('gc-tp-dock'), mode = 'ask';
    if (!dockPid && EDIT && view() === 'schedule') { dockPid = EDIT.pid; mode = 'edit'; }
    if (!dockPid) { if (dock) dock.remove(); }
    else {
      if (!dock) { dock = D.createElement('div'); dock.id = 'gc-tp-dock'; dock.className = 'gc-tp-card'; dock.setAttribute('data-gc-keep', '1'); dock.setAttribute('data-gcnav-ignore', '1'); dock.setAttribute('role', 'region'); dock.setAttribute('aria-label', 'Tentative schedule'); D.body.appendChild(dock); }
      dock.setAttribute('data-pid', dockPid); dock.setAttribute('data-mode', mode);
      var h = cardHtml(dockPid, mode); if (dock.__h !== h) { dock.innerHTML = h; dock.__h = h; }
    }
  } catch (e) { oops(e); }
  painting = false;
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('[data-tp]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  var a = b.getAttribute('data-tp'), pid = b.getAttribute('data-pid');
  try {
    if (a === 'post') post(pid, 'activation');
    else if (a === 'postall') post(pid, 'schedule (tentative tab)');
    else if (a === 'edit') edit(pid);
    else if (a === 'later') laterTodo(pid);
    else if (a === 'done') { EDIT = null; paint(); }
  } catch (x) { oops(x); }
}, true);

function tick(){ if (D.hidden) return; try { scan(); paint(); } catch (e) { oops(e); } }
RI.call(W, tick, 1500);
RI.call(W, function(){ try { todoSweep(); } catch (e) { oops(e); } }, 60000);
later(tick, 1500);

W._gcTentPost = { tentOf: tentOf, ask: ask, post: post, edit: edit, later: laterTodo, tick: tick,
  state: function(){ return { open: Object.keys(OPEN), edit: EDIT, stats: JSON.parse(JSON.stringify(STATS)) }; } };
try { console.log('[GC] 📅 Active with a tentative schedule → ✅ Post · ✏️ Edit first · Later (patch TENTPOST) — _gcTentPost.state()'); } catch (e) {}
})();
</script>
