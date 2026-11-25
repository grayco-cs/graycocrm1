<script id="gc-patch-superportal">
/* __GC_PATCH_SUPERPORTAL__ — THE SUPERINTENDENT AND THE PORTALS / PAPERWORK (owner 11/25: "Make sure the superintendent can post
   updates to the customer or sub portal, have on his left tabs the portals." · "superintendent is responsible for all of the
   paperwork to be filled out etc."). By ROLE and the job's team fields — never by a person's name.
   • A Superintendent (role Superintendent / Field Supervisor) gets the PM's portal powers on HIS jobs — the jobs where he is the
     superintendent, the PM or the APM: FIELDPORTAL's perms (👤 Customer portal · 🔧 Sub portal on the Field job cards and the job
     page; PORTALED's full-screen portal and the desk 🏠 Portal card's ✏️ Open portal follow it) and the 📒 Site Book job page.
     Posts go through the existing code (patch Q's 📣 post, patch SUB's sub thread): the same rules and Approvals as a PM's.
   • Left tabs: 🔨 Sub Portal merged into the Superintendent / Field Supervisor tab lists (the role table, saved or built-in), and
     👤 Customer portals (view custportals) for admin / office / PM / APM / Superintendent: the person's open jobs (admin / office:
     every open job) — 📣 Post to customer · 👁 See what they see · 🏠 Make portal · 🔧 Sub portal, all existing functions.
   • Paperwork To-Dos: window._gcPaperTo(job) — the job's superintendent when one is set and is an active person on the team,
     else the PM; _gcPaperCc(job) — the PM's name when the To-Do went to the superintendent instead (one person nagged, never two).
   API: window._gcSuperPortal = { isSuper(), can(p), superOn(p), hisJob(p), jobs(), canTab(), mount(el), sbBtns(p), state() } */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_SUPERPORTAL__) return; W.__GC_PATCH_SUPERPORTAL__ = true;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function warn(e){ try { console.warn('[GC SUPERPORTAL]', e && e.message || e); } catch (x) {} }
var STATS = { mounts: 0, posts: 0, made: 0, errs: [] };
function oops(e){ warn(e); try { STATS.errs.push(String(e && e.message || e).slice(0, 160)); if (STATS.errs.length > 20) STATS.errs.shift(); } catch (x) {} }

/* ── who ── */
function role(){ try { return W._gcRP && typeof W._gcRP.role === 'function' ? s(W._gcRP.role()) : ''; } catch (e) { return ''; } }
function seesAll(){ try { if (typeof W._gcProjSeesAll === 'function') return !!W._gcProjSeesAll(); } catch (e) {} return false; }
function isSuper(){ var r = role(); return /^(superintendent|field supervisor)$/i.test(r) || (/super/i.test(r) && !/office|admin|owner|assistant|\bapm\b|project manager/i.test(r)); }
function isPm(){ return /project manager|\bapm\b|assistant p/i.test(role()); }
function viewer(){ try { if (typeof W._gcProjViewer === 'function') return W._gcProjViewer(); } catch (e) {} return W._gcMeNow || null; }
function users(){ return arr(W._crm && W._crm.users); }
function names(v){ var out = []; (Array.isArray(v) ? v : [v]).forEach(function(x){ x = x && typeof x === 'object' ? (x.name || x.email) : x; if (typeof x === 'string' && s(x)) out.push(s(x)); }); return out; }
function isMe(n, vo){
  if (!n || !vo) return false;
  try { if (typeof W._gcSamePM === 'function' && W._gcSamePM(n, vo, null)) return true; } catch (e) {}
  return low(n) === low(vo.name) || (!!s(vo.email) && low(n) === low(vo.email));
}
function superNames(p){ return p ? names([p.superintendent, p.superName, p.super]) : []; }
function superOn(p){ var vo = viewer(); return !!p && !!vo && superNames(p).some(function(n){ return isMe(n, vo); }); }
function teamOn(p){
  var vo = viewer(); if (!p || !vo) return false;
  if (names([p.pm, p.projectManager, p.apm, p.assistantPm]).concat(names(arr(p.apms))).some(function(n){ return isMe(n, vo); })) return true;
  var em = low(vo.email); return !!em && [p.pmEmail, p.apmEmail].some(function(x){ return low(x) === em; });
}
function scoped(p){ try { return typeof W._gcProjScope === 'function' && arr(W._gcProjScope([p])).length > 0; } catch (e) { return false; } }
/* his jobs: the jobs where he is the superintendent, the PM or the APM (myJobsOf's rule) and the jobs the Projects list gives him */
function hisJob(p){ return !!p && !p.deleted && (superOn(p) || teamOn(p) || scoped(p)); }
function can(p){ return isSuper() && !seesAll() && hisJob(p); }
function canTab(){ return seesAll() || isPm() || isSuper(); }

/* ── the paperwork To-Dos: the job's superintendent (an active person on the team), else the PM ── */
function activeUser(n){
  n = low(n); if (!n) return null;
  return users().filter(function(u){ return u && u.active !== false && !u.departed && !u.tombstoned && !u.deleted && (low(u.name) === n || low(u.email) === n || arr(u.aka).some(function(a){ return low(a) === n; })); })[0] || null;
}
function paperSuper(p){ var l = superNames(p); for (var i = 0; i < l.length; i++) { var u = activeUser(l[i]); if (u) return s(u.name) || l[i]; } return ''; }
W._gcPaperTo = function(p){ try { return paperSuper(p) || s(p && p.pm); } catch (e) { return s(p && p.pm); } };
W._gcPaperCc = function(p){ try { var sp = paperSuper(p); return sp && low(sp) !== low(p && p.pm) ? s(p && p.pm) : ''; } catch (e) { return ''; } };

/* ── the left menu: 🔨 Sub Portal for the Superintendent, 👤 Customer portals for the roles that post to customers ── */
var SUPER_ROLES = ['Superintendent', 'Field Supervisor'];
function mergeUx(){
  var U = W._gcUx; if (!U || typeof U !== 'object') return false;
  SUPER_ROLES.forEach(function(r){
    var l = U[r]; if (!Array.isArray(l)) return;
    if (l.indexOf('subportal') < 0) { var i = l.indexOf('subs'); if (i >= 0) l.splice(i + 1, 0, 'subportal'); else l.push('subportal'); }   /* a saved table too: new defaults merge in */
    if (l.indexOf('custportals') < 0) { var j = l.indexOf('subportal'); l.splice(j + 1, 0, 'custportals'); }
  });
  return true;
}
var CP = { id: 'custportals', l: 'Customer portals', ic: '👤' };
function wrapMenu(){
  var RP = W._gcRP; if (!RP || typeof RP.menu !== 'function') { later(wrapMenu, 400); return; }
  if (RP.menu.__spx) return;
  var orig = RP.menu;
  var m = function(Uf, list){
    var r = orig.apply(this, arguments);
    try {
      mergeUx();
      r = arr(r);
      var ids = r.map(function(g){ return g && g.id; });
      if (isSuper() && ids.indexOf('subportal') < 0) {
        var sp = arr(Uf).filter(function(g){ return g && g.id === 'subportal'; })[0] || { id: 'subportal', l: 'Sub Portal', ic: '🔨' };
        var at = ids.indexOf('subs'); r = at < 0 ? r.concat([sp]) : r.slice(0, at + 1).concat([sp], r.slice(at + 1)); ids = r.map(function(g){ return g && g.id; });
      }
      if (!canTab()) r = r.filter(function(g){ return g && g.id !== 'custportals'; });
      else if (ids.indexOf('custportals') < 0) {
        var a2 = -1; ['subportal', 'messages', 'sitebook', 'projects'].some(function(k){ var i = ids.indexOf(k); if (i >= 0) { a2 = i + 1; return true; } return false; });
        r = a2 < 0 ? r.concat([CP]) : r.slice(0, a2).concat([CP], r.slice(a2));
      }
    } catch (e) { oops(e); }
    return r;
  };
  m.__spx = true; RP.menu = m;
}
wrapMenu();
(function arm(n){ if (!mergeUx() && n < 120) later(function(){ arm(n + 1); }, 500); })(0);

/* ── the jobs on the 👤 Customer portals tab: open jobs the person may post on (FIELDPORTAL's own rule) ── */
function allJobs(){ var l = arr(W._crm && W._crm.projects); if (!l.length) { try { l = arr(W._gcFPJobs && W._gcFPJobs()); } catch (e) {} } return l.filter(function(p){ return p && p.id && !p.deleted && !p.tombstoned; }); }
function open_(p){ var st = low(p.status); return !(p.history || p.recordOnly || /complete|closed|lost|cancel|archiv|dead|void|history/.test(st)); }
function custOk(p){ try { if (W._gcFP && typeof W._gcFP.perms === 'function') return !!W._gcFP.perms(p.id).cust; } catch (e) {} return seesAll() || can(p); }
function subOk(p){ try { if (W._gcFP && typeof W._gcFP.perms === 'function') return !!W._gcFP.perms(p.id).sub; } catch (e) {} return seesAll() || can(p); }
function jobs(){
  if (!canTab()) return [];
  var l = allJobs().filter(open_).filter(custOk);
  try { if (typeof W._gcFPSort === 'function') l = W._gcFPSort(l); } catch (e) {}
  return l;
}
var LINK = /^https:\/\/[^\s]+\/portal\.html#t=[A-Za-z0-9_-]{43}$/, MADE = {};
function linkOf(p){ if (!p || p.portalOff) return ''; var u = s(p.portalUrl); if (!LINK.test(u)) u = s(MADE[p.id]); return LINK.test(u) ? u : ''; }
function proj(pid){ return allJobs().filter(function(p){ return s(p.id) === s(pid); })[0] || null; }

/* ── 👤 Customer portals (the tab) ── */
var UI = { q: '', el: null };
function css(){
  if (D.getElementById('gc-spx-css')) return;
  var st = D.createElement('style'); st.id = 'gc-spx-css';
  st.textContent = [
    '#gc-cpx-mount{background:#f7f5f0;color:#14202e;font-family:Inter,-apple-system,sans-serif;box-sizing:border-box;padding:16px;min-height:calc(100vh - 60px)}',
    '#gc-cpx-mount *{box-sizing:border-box}',
    '.spx-hd{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 12px}.spx-hd h2{margin:0;font-size:20px;font-weight:800;color:#14202e}',
    '.spx-hd .n{font-size:13px;color:#55626f}',
    '.spx-q{flex:1 1 220px;min-width:0;max-width:360px;border:1px solid #d8d2c4;border-radius:10px;padding:9px 12px;font:15px inherit;background:#fff;color:#14202e}',
    '.spx-note{font-size:13px;color:#55626f;margin:0 0 12px;line-height:1.45}',
    '.spx-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}',
    '.spx-job{background:#fff;border:1px solid #e2dccd;border-left:4px solid #d4a017;border-radius:12px;padding:12px;min-width:0}',
    '.spx-job b{display:block;font-size:15px;color:#14202e;overflow-wrap:anywhere}.spx-job .m{display:block;font-size:12.5px;color:#55626f;margin:2px 0 8px;overflow-wrap:anywhere}',
    '.spx-acts{display:flex;flex-wrap:wrap;gap:6px}',
    '.spx-b{display:inline-flex;align-items:center;gap:4px;min-height:40px;padding:8px 12px;border-radius:10px;border:1px solid #d8d2c4;background:#fff;color:#14202e;font:600 13.5px Inter,-apple-system,sans-serif;cursor:pointer;text-decoration:none}',
    '.spx-b.pri{background:#d4a017;border-color:#d4a017;color:#14202e}.spx-b:disabled{opacity:.6;cursor:default}',
    '.spx-empty{background:#fff;border:1px dashed #d8d2c4;border-radius:12px;padding:18px;color:#55626f;font-size:14px}',
    '.spx-chip{display:inline-block;font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 8px;background:#fef3c7;color:#92400e;margin-left:6px;vertical-align:middle}',
    '.spx-sb{display:inline-flex;gap:6px;flex-wrap:wrap}',
    '#gc-spx-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100300;background:#fff;color:#14202e;border:1px solid #d4a017;border-radius:10px;padding:10px 16px;font:14px Inter,-apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.15);display:none;max-width:calc(100vw - 32px)}',
    '@media (max-width:600px){#gc-cpx-mount{padding:12px 16px}.spx-list{grid-template-columns:1fr}.spx-b{flex:1 1 auto;justify-content:center}}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
}
function toast(t){
  var el = D.getElementById('gc-spx-toast'); if (!el) { el = D.createElement('div'); el.id = 'gc-spx-toast'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status'); D.body.appendChild(el); }
  el.textContent = t; el.style.display = 'block'; clearTimeout(el.__t); el.__t = later(function(){ el.style.display = 'none'; }, 3500);
}
function jobHtml(p){
  var P = W._gcPortal || {}, url = linkOf(p), h = '';
  if (typeof P.post === 'function') h += '<button type="button" class="spx-b pri" data-spx-a="post" data-pid="' + esc(p.id) + '">📣 Post to customer</button>';
  if (url) h += '<a class="spx-b" data-spx-a="see" href="' + esc(url + '&p=1') + '" target="_blank" rel="noopener">👁 See what they see</a>';
  else if (!p.portalOff && typeof P.link === 'function') h += '<button type="button" class="spx-b" data-spx-a="make" data-pid="' + esc(p.id) + '">🏠 Make portal</button>';
  if (subOk(p) && W._gcFP && typeof W._gcFP.sub === 'function') h += '<button type="button" class="spx-b" data-spx-a="sub" data-pid="' + esc(p.id) + '">🔧 Sub portal</button>';
  var meta = [s(p.client || p.customer), s(p.address), s(p.status)].filter(Boolean).join(' · ');
  return '<div class="spx-job" data-spx-pid="' + esc(p.id) + '"><b>' + esc(p.name || p.address || 'Job') + (p.portalOff ? '<span class="spx-chip">portal off</span>' : !url ? '<span class="spx-chip">no portal yet</span>' : '') + '</b><span class="m">' + esc(meta) + '</span><div class="spx-acts">' + h + '</div></div>';
}
function paint(){
  var el = UI.el; if (!el || !D.body.contains(el)) return;
  var all = jobs(), q = low(UI.q), l = q ? all.filter(function(p){ return low([p.name, p.client, p.customer, p.address, p.po].join(' ')).indexOf(q) >= 0; }) : all;
  var list = el.querySelector('.spx-list'), n = el.querySelector('.spx-hd .n');
  if (n) n.textContent = all.length + ' job' + (all.length === 1 ? '' : 's');
  if (!list) return;
  list.innerHTML = !canTab() ? '<div class="spx-empty">The customer portals are for the office, admins, PMs and superintendents.</div>'
    : l.length ? l.map(jobHtml).join('') : '<div class="spx-empty">' + (all.length ? 'No job matches “' + esc(UI.q) + '”.' : (allJobs().length ? 'No open jobs of yours yet — the jobs where you are the superintendent, PM or APM show here.' : 'Loading your jobs…')) + '</div>';
}
function mount(el){
  if (!el) return;
  css(); STATS.mounts++;
  if (UI.el === el && el.querySelector('.spx-list')) { paint(); return; }
  UI.el = el;
  el.innerHTML = '<div class="spx-hd"><h2>👤 Customer portals</h2><span class="n"></span><input type="search" class="spx-q" placeholder="Search jobs" aria-label="Search jobs" value="' + esc(UI.q) + '"></div>' +
    '<p class="spx-note">📣 Post an update or photos to the customer’s page (the same post as the job’s 🏠 Portal card — the same rules and ✅ Approvals). 👁 See what they see opens the preview (not counted as the customer opening it). 🏠 Make portal makes the link — nothing is sent.</p>' +
    '<div class="spx-list"></div>';
  el.querySelector('.spx-q').addEventListener('input', function(){ UI.q = this.value; paint(); });
  el.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-spx-a]'); if (!b || !el.contains(b)) return;
    var a = b.getAttribute('data-spx-a'), pid = b.getAttribute('data-pid'), p = pid ? proj(pid) : null;
    if (a === 'see') return;   /* the link opens the tab itself */
    if (!p || !custOk(p)) { toast('This job is not one of yours.'); return; }
    var P = W._gcPortal || {};
    try {
      if (a === 'post' && typeof P.post === 'function') { STATS.posts++; P.post(p.id); return; }
      if (a === 'sub' && subOk(p) && W._gcFP && W._gcFP.sub) { W._gcFP.sub(p.id); return; }
      if (a === 'make' && typeof P.link === 'function') {
        b.disabled = true; b.textContent = 'Making the link…';
        Promise.resolve(P.link(p.id)).then(function(u){
          if (u && LINK.test(u)) { MADE[p.id] = u; STATS.made++; toast('🏠 Portal made — nothing was sent to the customer.'); }
          else toast('The portal link was not made — try again with a signal.');
          paint();
        }, function(x){ oops(x); toast('The portal link was not made — try again.'); paint(); });
      }
    } catch (x) { oops(x); }
  });
  paint();
  [800, 2500, 6000].forEach(function(ms){ later(paint, ms); });   /* the jobs arriving after the tab opened */
}

/* ── 📒 Site Book job page: 👤 Customer portal · 🔧 Sub portal (FIELDPORTAL's sheets; PORTALED's full-screen portal) ── */
function sbBtns(p){
  try {
    if (!p || !W._gcFP || typeof W._gcFP.perms !== 'function') return '';
    var pm = W._gcFP.perms(p.id) || {}, h = '';
    if (pm.cust) h += '<button type="button" class="gc-rp-btn" data-spx-sb="cust" data-pid="' + esc(p.id) + '">👤 Customer portal</button>';
    if (pm.sub) h += '<button type="button" class="gc-rp-btn" data-spx-sb="sub" data-pid="' + esc(p.id) + '">🔧 Sub portal</button>';
    return h ? '<span class="spx-sb">' + h + '</span>' : '';
  } catch (e) { oops(e); return ''; }
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('[data-spx-sb]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  var pid = b.getAttribute('data-pid'), a = b.getAttribute('data-spx-sb'), F = W._gcFP;
  try {
    var p = proj(pid); if (!F || !p) return;
    if (a === 'cust') { if (typeof F.run === 'function' && F.run('fp-cust', p)) return; if (F.cust) F.cust(pid); }
    else if (a === 'sub') { if (typeof F.run === 'function' && F.run('fp-sub', p)) return; if (F.sub) F.sub(pid); }
  } catch (x) { oops(x); }
}, true);

W._gcSuperPortal = { isSuper: isSuper, can: can, superOn: superOn, hisJob: hisJob, jobs: jobs, canTab: canTab, mount: mount, sbBtns: sbBtns, paint: paint,
  state: function(){ return { role: role(), isSuper: isSuper(), canTab: canTab(), jobs: jobs().map(function(p){ return p.id; }), stats: JSON.parse(JSON.stringify(STATS)) }; } };
try { console.log('[GC] 👤 Superintendent: customer / sub portals on his jobs, 👤 Customer portals tab, paperwork To-Dos (patch SUPERPORTAL) — _gcSuperPortal.state()'); } catch (e) {}
})();
</script>
