/* __GC_PATCH_DIAMOND__ — the 💎 menu, cleaned up (owner 11/28).   (patch DIAMOND)
   Owner: "take off clean up job list button, take out 3 company cam imports — they should be imported through integrations —
   and company cam email[queue] and project hubs, we don't want any duplicate button, those red ones delete them … ok add portals,
   emails, don't add sales and spam, add bid portal … data health and job health can go there, crm health saves duplicates add".
   • A small "Shortcuts" group near the top of the 💎 (before Daily Work), each item only for the roles that can use its screen
     (by role, never by name):
       👤 Customer portals        — the Customer portals tab (the roles that post to customers: SUPERPORTAL's canTab)
       ✉ Customer e-mails & texts — the approval list of e-mails / texts to customers (gc_approval_queue; not the PM / expense
                                     "Approvals"): admins, the office, PMs
       🏗 Bid portal              — the SYS tab: admins, the office, and a role whose tab list has it (the Estimator)
       🩺 CRM health · ☁ Cloud saves · 🔁 Duplicates — ⚙ Admin sections (admins and the office: whoever may open ⚙ Admin)
   • ⚙ Admin → 🩺 CRM health starts with a row of links: 🩺 Job health (⚙ Admin → Job health), 📋 Data health (read-only) and
     🖥 System check (this computer) — the two 💎 health items moved here.
   Nothing here runs on a timer and nothing is written. API: window._gcDiamond = { items(), healthStrip(), state() } */
(function(){
'use strict';
if (window.__GC_PATCH_DIAMOND__) return; window.__GC_PATCH_DIAMOND__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function warn(e){ try { console.warn('[GC DIAMOND]', e && e.message || e); } catch (x) {} }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ── who (roles only) ── */
function realAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function vas(){ try { return !!(W._gcVAS && W._gcVAS.active && W._gcVAS.active()); } catch (e) { return false; } }
function role(){
  try { if (W._gcRP && typeof W._gcRP.role === 'function') { var r = s(W._gcRP.role()); if (r) return r; } } catch (e) {}
  try { var m = W._gcMeNow || (typeof W._gcMeUser === 'function' ? W._gcMeUser() : null); return s(m && m.role); } catch (e) { return ''; }
}
/* admins and the office — the people ⚙ Admin opens for (👁 View as… shows the role being viewed) */
function staff(){
  if (vas()) { var r = role(); return /^admin$/i.test(r) || /^office/i.test(r); }
  try { if (typeof W._gcAdmCanOpen === 'function') return !!W._gcAdmCanOpen(); } catch (e) {}
  return realAdmin();
}
function pmRole(){ return /project manager|\bapm\b|assistant p/i.test(role()); }
function uxHas(id){ try { var U = W._gcUx || {}, r = role(); return arr(U[r] || U[r.trim()]).indexOf(id) >= 0; } catch (e) { return false; } }
function construction(){ try { var f = W._gcCo && W._gcCo.filter ? s(W._gcCo.filter()) : ''; return f !== 'mitigation' && f !== 'environmental'; } catch (e) { return true; } }
function adm(sec){ return function(){ if (W._gcAdm && typeof W._gcAdm.open === 'function') W._gcAdm.open(sec); }; }
function view(v){ return function(){ if (typeof W._setView === 'function') W._setView(v); }; }

var ITEMS = [
  { id: 'gc-dm-portals', ic: '👤', l: 'Customer portals',
    can: function(){ try { return !!(W._gcSuperPortal && W._gcSuperPortal.canTab()); } catch (e) { return false; } }, run: view('custportals') },
  { id: 'gc-dm-custmail', ic: '✉', l: 'Customer e-mails & texts to approve',
    can: function(){ return typeof W._gcOpenApprovals === 'function' && (staff() || pmRole()); }, run: function(){ W._gcOpenApprovals(); } },
  { id: 'gc-dm-bidportal', ic: '🏗', l: 'Bid portal',
    can: function(){ return construction() && (staff() || uxHas('bidportal')); }, run: view('bidportal') },
  { id: 'gc-dm-crmhealth', ic: '🩺', l: 'CRM health (job health, data health)', can: staff, run: adm('crmhealth') },
  { id: 'gc-dm-syncq', ic: '☁', l: 'Cloud saves', can: staff, run: adm('syncq') },
  { id: 'gc-dm-dedupe', ic: '🔁', l: 'Duplicates (merge, 7-day Undo)', can: staff, run: adm('dedupe') }
];
function mine(){ return ITEMS.filter(function(it){ try { return !!it.can(); } catch (e) { return false; } }); }

var ITEM_CSS = 'display:flex;align-items:center;gap:10px;padding:10px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;color:#1f2937;border-bottom:1px solid #f1f5f9;';
function build(list){
  var box = D.createElement('div'); box.id = 'gc-dm-shortcuts';
  var h = D.createElement('div'); h.className = 'gc-hub-sec'; h.textContent = 'Shortcuts';
  h.style.cssText = 'padding:8px 12px 4px;font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b8ab5;';
  box.appendChild(h);
  list.forEach(function(it){
    var el = D.createElement('div'); el.id = it.id; el.className = 'gc-hub-item'; el.setAttribute('data-label', it.l); el.style.cssText = ITEM_CSS;
    el.innerHTML = '<span class="gc-hub-icon" style="font-size:18px">' + it.ic + '</span><span>' + esc(it.l) + '</span>';
    el.addEventListener('click', function(){
      try { if (typeof W._gcCloseHub === 'function') W._gcCloseHub(); } catch (e) {}
      try { it.run(); } catch (e) { warn(e); }
    });
    box.appendChild(el);
  });
  return box;
}
/* right after the menu's title, before Daily Work (the items other patches put at the very top stay above it) */
function place(panel){
  try {
    if (!panel || !panel.isConnected) return;
    var box = panel.querySelector('#gc-dm-shortcuts');
    if (!box) { var l = mine(); if (!l.length) return; box = build(l); }
    var first = null; for (var c = panel.firstChild; c; c = c.nextSibling) { if (c !== box && c.classList && c.classList.contains('gc-hub-sec')) { first = c; break; } }
    if (first) { if (box.nextSibling !== first) panel.insertBefore(box, first); }
    else if (!box.parentNode) panel.appendChild(box);
  } catch (e) { warn(e); }
}
D.addEventListener('gc-hub-open', function(e){
  var p = e && e.detail && e.detail.panel; if (!p) p = D.querySelector('.gc-hub-panel');
  place(p); later(function(){ place(p); }, 0); later(function(){ place(p); }, 300);
});

/* ── ⚙ Admin → 🩺 CRM health: the job health and data health doors ── */
var BTN = 'border:1px solid #cbd5e1;background:#f8fafc;color:#1f2937;border-radius:8px;padding:7px 12px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit';
function healthStrip(){
  var b = [['job', '🩺 Job health — every open job scored'], ['data', '📋 Data health (read-only)'], ['sys', '🖥 System check (this computer)']];
  return '<div id="gc-dm-health" style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px">' + b.map(function(x){
    return '<button type="button" data-gcdm-h="' + x[0] + '" style="' + BTN + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>';
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('[data-gcdm-h]'); if (!b) return;
  var k = b.getAttribute('data-gcdm-h');
  try {
    if (k === 'job') adm('health')();
    else if (k === 'data' && typeof W._gcDataHealthCheck === 'function') W._gcDataHealthCheck();
    else if (k === 'sys' && typeof W._gcOpenSystemHealth === 'function') W._gcOpenSystemHealth();
  } catch (x) { warn(x); }
}, false);

W._gcDiamond = { items: function(){ return mine().map(function(it){ return it.id; }); }, healthStrip: healthStrip,
  state: function(){ return { role: role(), staff: staff(), pm: pmRole(), items: mine().map(function(it){ return it.l; }) }; } };
try { console.log('[GC] 💎 Shortcuts (patch DIAMOND) — _gcDiamond.state()'); } catch (e) {}
})();
