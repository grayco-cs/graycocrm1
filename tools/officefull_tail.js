<script id="gc-patch-officefull">
/* __GC_PATCH_OFFICEFULL__ ════════════════════════════════════════════════════════════
   GrayCo — THE OFFICE WORKS EVERY PART OF THE CRM (patch OFFICEFULL).

   Owner 10/30: "i want the office to help estimators stay on top of stuff, pms keep up with job progressions, she can
   also toggle for what job she wants auto texts or what services we want to do for that customer etc, need her to be
   able to have full reign of crm she can see projects everything for everything" — and, asked about the owner money
   screens (bank accounts, cash flow, P&L, owner draws, commissions): "Everything, money too".

   Who: window._gcIsOfficeFull() — the company sign-in (gc_staff profile 'office' or role 'office'), else, when no profile
   is set, the person's role on the people list (Office / Office Admin / Office Manager). Data decides, never a name.
   window._gcFullAccess() = an admin or the office.
   She gets (the menu, the screen gates, SEC2 and the cash vault are opened in place by tools/patch_OFFICEFULL.py):
     every left-menu tab an admin has (⚙ Admin too), all jobs, estimates, leads, schedule, invoices, expenses, payments,
     accounting, P&L, bank accounts, cash flow, owner draws, commissions, payroll, marketing, reports, the automation
     settings (defaults, text answers / alerts / templates, call order, document defaults, training, proposal template)
     and every job's automations. The owners-only money records come from the database once
     docs/office-full-access.sql has run (gc_my_access().office = true).
   Stays with the admins: 💎 Team access (sign-ins, roles, profiles, passwords), adding / editing / turning off / deleting
   staff, Hiring, 🛡 Security & system check, ⏸ Data-entry mode, the backups / restore / import / fresh start / make the
   cloud the truth / storage clean-up tools; approvals of owner-only kinds keep their own rules.
   This tail:
     1. ⚙ Admin for the office: the Employees list without + Add Employee / EDIT / Disable / 🗑 and without the Hiring /
        Storage tabs (the settings cards drop the admin-only rows themselves, patch ADM's officeCut).
     2. The job's ⚙ Automations window gets "More for this job": the switches the automations read from the job itself
        (project.autoX) that had no screen — draft schedule, stage from the schedule, draw invoices, permits, punch list,
        sub agreements, forms, jurisdiction look-up. An admin or the office changes them (saved at once on the job);
        everyone else sees them.
   Console: _gcOfficeFull.state()
   ═════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_OFFICEFULL__) return; window.__GC_PATCH_OFFICEFULL__ = true;
var W = window, D = document;
var ST = function(f, ms){ return (W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, f, ms || 0); };
var SI = function(f, ms){ return (W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval).call(W, f, ms); };
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function office(){ try { return !!(W._gcIsOfficeFull && W._gcIsOfficeFull()); } catch (e) { return false; } }
function full(){ try { return !!(W._gcFullAccess && W._gcFullAccess()); } catch (e) { return false; } }
function view(){ try { return Storage.prototype.getItem.call(localStorage, 'grayco_view') || ''; } catch (e) { return ''; } }
function myName(){ try { return s(localStorage.getItem('grayco_user')) || s(W.__GC_AUTH__ && W.__GC_AUTH__.email()) || 'someone'; } catch (e) { return 'someone'; } }
var LOG = [];
function log(what, o){ LOG.push(Object.assign({ at: new Date().toISOString(), what: what }, o || {})); if (LOG.length > 40) LOG.shift(); }

/* ── 1. ⚙ Admin for the office ──────────────────────────────────────────────────────────── */
var HIDE_ROW_BTN = /^(EDIT|Disable|Enable|🗑)$/, HIDE_TAB = /^(Hiring|Storage)$/;
function hide(b, why){ b.style.display = 'none'; b.setAttribute('data-gc-office-hidden', why); }
function inStaffTable(b){
  var t = b.closest && b.closest('table'); if (!t) return false;
  var h = t.querySelector('thead') || t.querySelector('tr'); var x = h ? h.textContent || '' : '';
  return /Pay Type/.test(x) && /Actions/.test(x);
}
function adminPage(){
  if (D.hidden || view() !== 'admin' || !office()) return 0;
  var main = D.querySelector('main'); if (!main) return 0;
  var n = 0, bs = main.getElementsByTagName('button');
  for (var i = 0; i < bs.length; i++) {
    var b = bs[i]; if (b.getAttribute('data-gc-office-hidden')) { if (b.style.display !== 'none') b.style.display = 'none'; continue; }
    var t = s(b.textContent);
    if (t === '+ Add Employee') { hide(b, 'add'); n++; }
    else if (HIDE_ROW_BTN.test(t) && inStaffTable(b)) { hide(b, 'staff'); n++; }
    else if (t.length < 30 && HIDE_TAB.test(t.replace(/^\S+\s+/, '')) && !b.closest('#gc-adm-hub')) { hide(b, 'tab'); n++; }
  }
  return n;
}

/* ── 2. "More for this job": the switches kept on the job (project.autoX) ─────────────────── */
var MORE = [
  ['draftSchedule', '🗓 Draft schedule from the job type', 'When the job is signed, its schedule is drafted from the template (Admin → 🗓 Schedule templates).'],
  ['autoProgress', '📈 The job moves its own stage', 'Schedule tasks started / finished move the stage and the progress %.'],
  ['drawInvoices', '🧾 Draw invoices at milestones', 'Drafted for approval when a draw milestone is reached (none when this AND “Invoices e-mailed” are off).'],
  ['permits', '📄 Permit & inspection checklist', 'Permit rows and inspections from the job kind and its jurisdiction.'],
  ['punchList', '✅ Punch list at substantial completion', 'Template items plus the final walkthrough.'],
  ['subAgreementFill', '🤝 Sub agreements filled in', 'The sub agreement filled with the job and the sub when a sub is added.'],
  ['formFill', '📝 Forms filled with the job’s details', 'Customer, address, PO and PM on the job’s forms.'],
  ['jurisdiction', '🗺 County / city look-up', 'The job address is looked up once (permit office, taxes).']
];
function proj(pid){ return arr(W._crm && W._crm.projects).filter(function(p){ return p && String(p.id) === String(pid); })[0] || null; }
function onFor(p, k){ var x = p && p.autoX; return !(x && typeof x === 'object' && x[k] === false); }
var RECENT = {};
function saveX(pid, key, on){
  var at = new Date().toISOString(), by = myName();
  function put(p){
    var q = Object.assign({}, p), x = Object.assign({}, q.autoX && typeof q.autoX === 'object' ? q.autoX : {});
    x[key] = !!on; x.updatedAt = at; x.by = by; q.autoX = x; q.updatedAt = at; q.savedAt = at; return q;
  }
  try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('job automations'); } catch (e) {}
  return Promise.resolve().then(function(){ try { return W._gcProjectsRaw ? W._gcProjectsRaw() : (W.idbGet ? W.idbGet('projects') : null); } catch (e) { return null; } })
    .catch(function(){ return null; }).then(function(all){
      var hit = false, next = null;
      if (Array.isArray(all)) next = all.map(function(p){ if (p && String(p.id) === String(pid)) { hit = true; return put(p); } return p; });
      var w = hit && W.idbSet ? Promise.resolve(W.idbSet('projects', next)).catch(function(){}) : Promise.resolve();
      return w.then(function(){
        try { if (W._setProjects) W._setProjects(function(prev){ return Array.isArray(prev) ? prev.map(function(p){ return p && String(p.id) === String(pid) ? put(p) : p; }) : prev; }); } catch (e) {}
        RECENT[pid + ':' + key] = { on: !!on, at: Date.now() };
        ST(function(){ try { if (W._supaUpsert) W._supaUpsert('projects', hit ? next : arr(W._crm && W._crm.projects)); } catch (e) {} }, hit ? 0 : 400);
        ST(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
        log('autoX', { pid: pid, key: key, on: !!on, hit: hit });
        return hit;
      });
    });
}
function moreHtml(p){
  var can = full();
  return '<div class="gcof-more" data-gcof-pid="' + esc(p.id) + '" style="margin:10px 0 4px;padding:10px 12px;border:1px solid #2a4a7f;border-radius:10px">' +
    '<div style="font-weight:800;font-size:14px;margin-bottom:2px">⚙ More for this job</div>' +
    '<div class="gcja-note" style="margin-bottom:6px">The other automations on this job — saved at once when you click.' + (can ? '' : ' <b>An admin or the office changes these.</b>') + '</div>' +
    MORE.map(function(m){
      var rk = RECENT[p.id + ':' + m[0]], on = rk && Date.now() - rk.at < 120000 ? rk.on : onFor(p, m[0]);
      return '<label style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;cursor:' + (can ? 'pointer' : 'default') + '"><input type="checkbox" data-gcof-k="' + m[0] + '"' + (on ? ' checked' : '') + (can ? '' : ' disabled') + ' style="margin-top:3px">' +
        '<span><b>' + esc(m[1]) + '</b><br><span style="font-size:12px;opacity:.75">' + esc(m[2]) + '</span></span></label>';
    }).join('') + '</div>';
}
function addMore(ov, pid){
  if (!ov || !ov.firstChild || ov.querySelector('.gcof-more')) return;
  var p = proj(pid); if (!p) return;
  var sh = ov.firstChild, act = sh.querySelector('.gcja-act');
  var box = D.createElement('div'); box.innerHTML = moreHtml(p); box = box.firstChild;
  if (act) sh.insertBefore(box, act); else sh.appendChild(box);
  box.addEventListener('change', function(e){
    var cb = e.target; if (!cb || !cb.getAttribute('data-gcof-k')) return;
    if (!full()) { cb.checked = !cb.checked; return; }
    cb.disabled = true;
    saveX(pid, cb.getAttribute('data-gcof-k'), cb.checked).then(function(){ cb.disabled = false; }, function(){ cb.disabled = false; });
  });
}
/* the window opens from the job's "Change" button (JA's own click, which knows the job) or from window._gcJA.open(pid) */
var LASTPID = null;
function wrapOpen(){
  var J = W._gcJA; if (!J || typeof J.open !== 'function' || J.open.__gcOF) return;
  var o = J.open;
  var w = function(pid){ LASTPID = pid; var ov = o.apply(this, arguments); try { addMore(ov, pid); } catch (e) { log('more failed', { e: String(e && e.message || e) }); } return ov; };
  w.__gcOF = true; J.open = w;
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('[data-ja-open]'); if (!b) return;
  var bar = b.closest('.gcja-bar'); if (bar && bar.getAttribute('data-pid')) LASTPID = bar.getAttribute('data-pid');
}, true);
try {
  new MutationObserver(function(ms){
    for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) {
      var n = ms[i].addedNodes[j];
      if (n && n.id === 'gcja-job' && LASTPID) { (function(ov, pid){ ST(function(){ try { addMore(ov, pid); } catch (e) {} }, 0); })(n, LASTPID); }
    }
  }).observe(D.body || D.documentElement, { childList: true });
} catch (e) {}

/* ── start ──────────────────────────────────────────────────────────────────────────────── */
wrapOpen();
SI(function(){ try { wrapOpen(); adminPage(); } catch (e) {} }, 800);
W._gcOfficeFull = {
  more: MORE.map(function(m){ return m[0]; }), saveX: saveX, adminPage: adminPage,
  state: function(){ var a = null; try { a = W.__GC_SEC2 && W.__GC_SEC2.access(); } catch (e) {} return { office: office(), full: full(), access: a, hidden: D.querySelectorAll('[data-gc-office-hidden]').length, log: LOG.slice(-10) }; }
};
try { console.log('[GC] patch OFFICEFULL: the office works every part of the CRM — _gcOfficeFull.state()'); } catch (e) {}
})();
</script>
