<script id="gc-patch-mmtabs">
/* ==========================================================================
   GrayCo CRM — patch MMTABS __GC_PATCH_MMTABS__ : the Marketing Manager's own left-menu tabs + admins' to-dos for him
   Owner (28 Oct 2026): "make sure i can add things for marketing manager to do from admin also, give him a couple more
   tabs than just 2 some ones hell use alot make them a tab like most of those i guess".
   1. His left menu (only his; admins keep theirs): 📣 Marketing, ✅ My To-Do, 📈 My leads, ✔️ Marketing approvals, ✉️ E-mail &
      newsletter, 📱 Social posts / Week plan, 🗓 Content calendar, ⭐ Reviews & referrals, 🎯 Ads, 🗂 Media library,
      💡 Ideas board, 🔗 Marketing logins, 🧭 GrayCo Systems. Each tab is the Marketing screen opened at that section (the same renderers,
      the same data through netlify/functions/soc.js — nothing new is visible to him). The tab ids are window._gcMMTabs
      (patch MM early script); the app draws them with the Marketing mount. ‹ Back inside a tab returns to the tab.
   2. Admins: ✅ To-Do "Give it to" / "@name" and 📣 Marketing → "＋ Task for marketing" can assign a to-do to him (he is
      not active staff: he comes from the users list role "Marketing Manager" and the gc_staff profile "marketing").
      He sees it in ✅ My To-Do (soc.js mm_tasks) and ticks it done there (soc.js mm_task — only tasks assigned to him).
   3. 🔗 Marketing logins (window._gcMktLogins: Google Analytics, Search Console, Ads, Business Profile, Tag Assistant, Meta
      Business Suite / Events Manager, website editor, review link, LinkedIn / Instagram / CallRail "set up soon"): a Marketing
      section (him, admins, the office) and tiles in 🧭 GrayCo Systems → Website & marketing. Links only, no password or key.
   Console: _gcMMTabs, _gcMMPeople(), _gcMMT.state()
   ========================================================================== */
(function(){
'use strict';
if (window.__GC_PATCH_MMTABS__) return; window.__GC_PATCH_MMTABS__ = true;
var W = window, D = document;
var nST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout.bind(W);
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function isMM(){ try { return typeof W._gcIsMM === 'function' && W._gcIsMM(); } catch (e) { return false; } }
function authAdmin(){ try { var A = W.__GC_AUTH__; return !!(A && typeof A.isAdmin === 'function' && A.isAdmin()); } catch (e) { return false; } }
var TABS = {}; arr(W._gcMMTabs).forEach(function(t){ TABS[t.id] = t; });

/* ── who is a Marketing Manager (for the admins' pickers): the users list role, and the gc_staff profile (admins) ── */
var STAFF = { rows: null, at: 0, p: null };
function loadStaff(){
  if (isMM() || !authAdmin() || STAFF.p || (STAFF.rows && Date.now() - STAFF.at < 10 * 60e3)) return;
  STAFF.p = W.fetch('/.netlify/functions/staff-admin?action=list').then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
    if (j && Array.isArray(j.staff)) { STAFF.rows = j.staff.filter(function(p){ return p && low(p.profile) === 'marketing' && p.mkt_active !== false && low(p.email); }).map(function(p){ return { name: s(p.name) || low(p.email).split('@')[0], email: low(p.email) }; }); STAFF.at = Date.now(); }
  }).catch(function(){}).then(function(){ STAFF.p = null; });
}
function gone(u){ return !!(u && (u.departed || u.deleted || u.tombstoned || /^(inactive|disabled|terminated|offboarded)$/i.test(s(u.status)))); }
W._gcMMPeople = function(){
  if (isMM()) return [];
  loadStaff();
  var seen = {}, out = [];
  arr((W._crm || {}).users).forEach(function(u){ if (!u || gone(u) || !/marketing\s*manager/i.test(s(u.role)) || !low(u.email) || seen[low(u.email)]) return; seen[low(u.email)] = 1; out.push({ name: s(u.name) || low(u.email), email: low(u.email) }); });
  arr(STAFF.rows).forEach(function(p){ if (seen[p.email]) return; seen[p.email] = 1; var u = arr((W._crm || {}).users).filter(function(x){ return x && low(x.email) === p.email; })[0]; out.push({ name: s(u && u.name) || p.name, email: p.email }); });
  return out;
};
nST(loadStaff, 4000);

/* ── the tabs: the app calls this from the Marketing mount on every draw with the current view ── */
var CUR = { v: '', el: null }, X = null, pending = null;
W._gcMMTabView = function(v, el){ if (!X) { pending = [v, el]; return; } apply(v, el); };
function inGroup(t, sec){ return !!t && (t.sec === sec || arr(t.also).indexOf(sec) >= 0); }
function have(sec){ return !!X && X.SECS.some(function(x){ return x.id === sec; }) && typeof X.VIEWS[sec] === 'function'; }
function groupOf(t){ return [t.sec].concat(arr(t.also)).filter(have); }
function strip(t){
  var g = groupOf(t); if (g.length < 2) return '';
  return '<div class="gmt-row" data-mmt-strip="' + esc(t.id) + '" style="gap:6px;margin:0 0 10px;flex-wrap:wrap">' + g.map(function(sec){ var x = X.SECS.filter(function(y){ return y.id === sec; })[0] || { ic: '', l: sec }; var on = X.UI.sec === sec;
    return '<button class="gmt-btn' + (on ? '' : ' o') + '" data-a="go" data-sec="' + esc(sec) + '"' + (on ? ' aria-current="page"' : '') + '>' + esc(x.ic + ' ' + x.l) + '</button>'; }).join('') + '</div>';
}
function wrapGroup(t){
  groupOf(t).forEach(function(sec){
    var f = X.VIEWS[sec]; if (!f || f.__mmt) return;
    var w = function(){ var h = f.apply(this, arguments); var tt = TABS[CUR.v]; return tt && inGroup(tt, X.UI.sec) ? strip(tt) + h : h; };
    w.__mmt = true; w.__orig = f; X.VIEWS[sec] = w;
  });
}
function fresh(sec){   /* his lists come again from the server when he opens the tab */
  try { var st = W._gcMM && W._gcMM._ST; if (!st) return; if (sec === 'mytodo') st.tasks = null; if (sec === 'mmappr') st.appr = null; } catch (e) {}
}
function apply(v, el){
  var prev = CUR.v, prevEl = CUR.el; CUR.v = v; CUR.el = el || null;
  if (v === prev && el === prevEl) return;
  var t = TABS[v];
  if (isMM()) { try { if (t) sessionStorage.setItem('gc_mmt_last', v); else if (v === 'marketing' && CUR.ready) sessionStorage.removeItem('gc_mmt_last'); } catch (e) {} }   /* a reload opens his tab again */
  if (t) {
    if (!have(t.sec)) return;
    wrapGroup(t);
    if (v !== prev || !inGroup(t, X.UI.sec)) { fresh(t.sec); X.go(t.sec); }
  } else if (v === 'marketing' && TABS[prev] && X.UI.sec !== 'home') X.go('home');
}
/* ‹ Back inside a tab: from another section (or a chip of the tab) back to the tab; on the tab itself, to 📣 Marketing */
D.addEventListener('click', function(ev){
  var b = ev.target && ev.target.closest && ev.target.closest('[data-a="back"]'); if (!b || !X) return;
  var m = b.closest('#gc-mk-mount'); if (!m || m !== X.UI.root || X.UI.overlay) return;
  var t = TABS[CUR.v]; if (!t || X.UI.form) return;
  ev.preventDefault(); ev.stopPropagation();
  if (X.UI.sec !== t.sec) X.go(t.sec);
  else if (typeof W._setView === 'function') W._setView('marketing');
}, true);

/* ── admins: "＋ Task for marketing" on 📣 Marketing, and his to-dos with their state ── */
var F = { open: false, msg: '' };
function adminNow(){ return !isMM() && !!X && X.role() === 'admin'; }
function tasks(){ var l; try { l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); } catch (e) { l = []; } if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { l = []; } } return arr(l).filter(function(t){ return t && typeof t === 'object' && !t.deleted; }); }
function forHim(t, ems){ return arr(t.assignees).map(low).some(function(e){ return ems.indexOf(e) >= 0; }) || ems.indexOf(low(t.assigneeEmail)) >= 0; }
function adminCard(){
  var ppl = W._gcMMPeople(), ems = ppl.map(function(p){ return p.email; });
  var mine = ems.length ? tasks().filter(function(t){ return forHim(t, ems); }) : [];
  var open = mine.filter(function(t){ return !t.done; }), done = mine.filter(function(t){ return t.done; }).sort(function(a, b){ return s(b.doneAt) < s(a.doneAt) ? -1 : 1; }).slice(0, 8);
  var h = '<div class="gmt-card" data-mmt-admin><div class="gmt-row" style="justify-content:space-between"><h2 style="margin:0">🧑‍💼 Marketing Manager — to-dos</h2>' +
    (ppl.length ? '<button class="gmt-btn" data-a="mmt-task-new">＋ Task for marketing</button>' : '') + '</div>';
  if (!ppl.length) return h + '<div class="gmt-muted">No Marketing Manager yet: ⚙ Admin → 👤 Employees → role "Marketing Manager", then 💎 → Team access → Profile "Marketing Manager".</div></div>';
  if (F.open) {
    h += '<div class="gmt-card" style="margin:8px 0" data-mmt-form><label>For</label><select id="mmt-f-who">' + ppl.map(function(p){ return '<option value="' + esc(p.email) + '">' + esc(p.name) + '</option>'; }).join('') + '</select>' +
      '<label>To do</label><input id="mmt-f-label" placeholder="e.g. Post the Germantown before / after on Friday" style="width:100%">' +
      '<label>Due (optional)</label><input type="date" id="mmt-f-due"><label>Detail (optional)</label><textarea id="mmt-f-note" rows="2" style="width:100%"></textarea>' +
      '<div class="gmt-row" style="margin-top:8px"><button class="gmt-btn g" data-a="mmt-task-save">Add the to-do</button><button class="gmt-btn o" data-a="mmt-task-cancel">Cancel</button></div>' +
      '<div class="gmt-muted">He sees it in ✅ My To-Do and ticks it there; it also shows on your ✅ To-Do (Team). Keep customer details out — he never sees jobs or customers.</div></div>';
  }
  h += '<div class="gmt-muted">' + esc(ppl.map(function(p){ return p.name; }).join(', ')) + ' · ' + open.length + ' open · ' + mine.filter(function(t){ return t.done; }).length + ' done</div>';
  h += open.map(function(t){ return '<div class="gmt-check" data-mmt-task="' + esc(t.id) + '" data-done="0"><span>☐</span><div><b>' + esc(t.label) + '</b>' + (t.due ? ' <span class="gmt-muted">due ' + esc(t.due) + '</span>' : '') + (t.addedBy ? ' <span class="gmt-muted">· from ' + esc(t.addedBy) + '</span>' : '') + '</div></div>'; }).join('');
  h += done.map(function(t){ return '<div class="gmt-check" data-mmt-task="' + esc(t.id) + '" data-done="1"><span>✅</span><div class="gmt-muted"><s>' + esc(t.label) + '</s>' + (t.doneBy ? ' — done by ' + esc(t.doneBy) : '') + (t.doneAt ? ' ' + esc(s(t.doneAt).slice(0, 10)) : '') + '</div></div>'; }).join('');
  return h + '</div>';
}
function addTask(rec){
  try { if (W._gcTD2 && typeof W._gcTD2.addRec === 'function') { W._gcTD2.addRec(rec); return true; } } catch (e) {}
  var l = tasks(); l.push(rec);
  try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) { return false; }
  try { if (W._gcApplySync) W._gcApplySync('gc_office_tasks', l); } catch (e) {}
  try { if (typeof W._gcOfficeTasksPush === 'function') W._gcOfficeTasksPush(); else if (typeof W._supaUpsertNow === 'function') W._supaUpsertNow('gc_office_tasks', JSON.stringify(l)); } catch (e) {}
  return true;
}
W._gcMMTaskAdd = function(o){
  o = o || {}; var em = low(o.email), label = s(o.label).slice(0, 200);
  var p = W._gcMMPeople().filter(function(x){ return x.email === em; })[0];
  if (!p || !label) return null;
  var at = new Date().toISOString(), me = ''; try { me = X && X.myName ? X.myName() : ''; } catch (e) {}
  var myE = ''; try { myE = X && X.myEmail ? X.myEmail() : ''; } catch (e) {}
  var rec = { id: 'T' + Date.now() + Math.floor(Math.random() * 1000), label: label, note: s(o.note).slice(0, 600), due: /^\d{4}-\d{2}-\d{2}$/.test(s(o.due)) ? s(o.due) : '', addedBy: me || 'Admin', addedByEmail: low(myE), addedAt: at, updatedAt: at, done: false,
    kind: 'assigned', assignees: [p.email], assignee: p.name, personal: true, shared: false, self: false, prio: 'med', forMarketing: true, source: 'marketing' };
  return addTask(rec) ? rec : null;
};

/* ── 🔗 Marketing logins: the sign-in pages he and the admins use (links only — no password or key is kept anywhere) ── */
function loginsHtml(){
  var L = arr(W._gcMktLogins);
  return '<div class="gmt-card" data-mkt-logins><div class="gmt-muted">Each opens the real sign-in page in a new tab. Sign in with your own GrayCo Google / Meta account — passwords and keys are never kept in the CRM. ' +
    'Admin-only systems (Netlify, Supabase, Resend, Google Admin, Google Cloud) stay in 🧭 GrayCo Systems for admins.</div></div>' +
    '<div class="gmt-gs">' + L.map(function(x){ return '<div class="gmt-card" data-login="' + esc(x.k) + '"><div class="gmt-row" style="justify-content:space-between"><b>' + esc(x.ic + ' ' + x.l) + '</b>' + (x.soon ? X.chip('set up soon') : '') + '</div>' +
      '<div class="gmt-muted" style="margin:4px 0 8px">' + esc(x.d) + '</div><a class="gmt-btn' + (x.soon ? ' o' : '') + '" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">Open ' + esc(x.l) + ' ↗</a></div>'; }).join('') + '</div>';
}

function install(){
  var VIEWS = X.VIEWS, ACT = X.ACT;
  (function addLogins(n){   /* the Marketing Manager, admins and the office (the role can arrive a moment later) */
    if (!X.SECS.some(function(x){ return x.id === 'logins'; }) && (isMM() || X.role() === 'admin' || X.role() === 'office')) {
      var gi = X.SECS.map(function(x){ return x.id; }).indexOf('google');
      X.SECS.splice(gi >= 0 ? gi + 1 : Math.max(0, X.SECS.length - 1), 0, { id: 'logins', ic: '🔗', l: 'Marketing logins', d: 'Google Analytics, Search Console, Google Ads, Business Profile, Tag Assistant, Meta Business Suite & pixel, website editor, review link' });
      if (X.UI.sec === 'home') X.redrawSoon();
    }
    if (n > 0) nST(function(){ addLogins(n - 1); }, 1000);
  })(60);
  VIEWS.logins = loginsHtml;
  var home0 = VIEWS.home;
  VIEWS.home = function(){ var h = home0.apply(this, arguments); return adminNow() ? adminCard() + h : h; };
  ACT['mmt-task-new'] = function(){ F.open = !F.open; X.draw(); nST(function(){ var i = D.getElementById('mmt-f-label'); if (i) i.focus(); }, 50); };
  ACT['mmt-task-cancel'] = function(){ F.open = false; X.draw(); };
  ACT['mmt-task-save'] = function(){
    if (!adminNow()) return;
    var v = function(id){ var e = D.getElementById(id); return e ? e.value : ''; };
    if (!s(v('mmt-f-label'))) { X.toast('Type the to-do first.', true); return; }
    var r = W._gcMMTaskAdd({ email: v('mmt-f-who'), label: v('mmt-f-label'), due: v('mmt-f-due'), note: v('mmt-f-note') });
    X.toast(r ? 'Added for ' + r.assignee + ': ' + r.label.slice(0, 60) : 'Not added.', !r);
    if (r) { F.open = false; X.draw(); }
  };
  /* his to-dos change on another computer (he ticks one): the admin card follows */
  var sig = '';
  (function watch(){ try { if (adminNow() && X.UI.sec === 'home' && X.UI.root && X.UI.root.isConnected && !F.open) { var ems = W._gcMMPeople().map(function(p){ return p.email; }); var n = tasks().filter(function(t){ return forHim(t, ems); }).map(function(t){ return t.id + (t.done ? 1 : 0); }).join(); if (sig && n !== sig) X.redrawSoon(); sig = n; } } catch (e) {} nST(watch, 2500); })();
  /* a reload: the app opens Marketing first — back to the tab he was on */
  try { var last = isMM() && sessionStorage.getItem('gc_mmt_last'); if (TABS[last]) nST(function(){ try { if (localStorage.getItem('grayco_view') === 'marketing' && typeof W._setView === 'function') W._setView(last); } catch (e) {} CUR.ready = true; }, 1500); else CUR.ready = true; } catch (e) { CUR.ready = true; }
  if (pending) { var p = pending; pending = null; apply(p[0], p[1]); }
  else { try { var lv = localStorage.getItem('grayco_view') || ''; var m = D.getElementById('gc-mk-mount'); if (TABS[lv] && m) apply(lv, m); } catch (e) {} }
}
var tries = 0;
(function boot(){ X = null; var x = W._gcMktExt; if (!x || !x.VIEWS || !x.VIEWS.home || !W._gcMM || (isMM() && !x.VIEWS.mytodo)) { if (tries++ < 200) nST(boot, 400); return; } X = x; install(); })();
W._gcMMT = { state: function(){ return { view: CUR.v, sec: X && X.UI.sec, tabs: Object.keys(TABS), people: W._gcMMPeople(), staffLoaded: !!STAFF.rows }; } };
try { console.log('[GC] patch MMTABS: the Marketing Manager\'s tabs + admins\' to-dos for him — _gcMMT.state()'); } catch (e) {}
})();
</script>
