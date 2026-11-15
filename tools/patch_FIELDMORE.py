#!/usr/bin/env python3
"""Idempotent patch FIELDMORE (owner 11/03, on his iPhone, a screenshot of GrayCo Field's ☰ More):
"I feel these aren't the BEST More buttons for the field. Can we make sure the buttons here are the ones used in the
field the most." + "If it's an insurance claim it should have a different field view than a roof, residential or
commercial. Commercial should probably have a different set of buttons in the main screen and in this [More] too." +
"the More for this job buttons still need to make sense too for the type of job."

Only existing actions; nothing is added to anyone's permissions.

  1. ☰ More (GrayCo Field, ROLEAPPS' roles): two groups.
       AT THE JOB — big tiles, the role's field actions, first the ones for the type of the job in hand (the job that
         is open, else the person's job scheduled today): 📷 Camera (GrayCo Photos' camera, on that job when there is
         one) · 🧾 Snap a receipt · 📅 Schedule · 📒 Daily log · 💬 Messages · ☑ Today's to-dos · 🔍 Search · …;
         an insurance job brings 🛡 Claim info and 💧 Drying logs (this job's claim) up; commercial puts 📅 / 📒 first.
       OFFICE — rows: Claim info (all claims) · Invoices to match · Maintenance · Leads / Estimates … · 🧰 Other tools ·
         ⚙ Settings · 🖥 Desk view.
     Nothing the bottom bar already has (Home, Jobs, Approvals, Photos / Messages for the roles whose bar has them).
  2. The Field JOB screen (#_gcJobDash, FIELDPORTAL's tile grid): the job's type decides the order and the set —
       🛡 Insurance claim · 🏢 Commercial (type starts "Commercial" / "New Construction", or marked commercial) ·
       🏠 Residential (everything else, roofing included). The type's tiles on top; "➕ More for this job" opens the
       rest, grouped (On site · People · Paperwork · Money) and ordered for that type; what never applies to the type
       is not offered (Claim info / drying log only on an insurance claim, Pay apps only on commercial).
     Existing tiles are never removed. Added tiles run existing field tools / screens for this job:
       🛡 Claim info (the claims app: carrier, claim #, adjuster — staff only) · 💧 Moisture / drying log ·
       🔁 Change order · ☐ Punch / final · 🦺 Safety · 📐 Estimate · 🏗 Pay apps (AIA G702/G703) —
     each only for the roles that have that tool (⚙ Apps by role) / may see it.
  API: window._gcFieldMore = { kind(job), layout, jobGrid(grid, job, mk) }
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '__GC_PATCH_FIELDMORE__'
if MARK in t:
    print('FIELDMORE: already patched'); sys.exit(0)


def rep(t, old, new, n=1):
    c = t.count(old)
    assert c == n, ('FIELDMORE anchor found %d times (want %d): %r' % (c, n, old[:120]))
    return t.replace(old, new)


# ════ 1. ROLEAPPS: the ☰ More sheet ════════════════════════════════════════════════════════════════════════════════
# the actions: 📷 Camera (new button for GrayCo Photos' own camera); receipt / claims / drying take the job in hand
t = rep(t, """  receipt:   { ic: '🧾', l: 'Snap a receipt', show: function(){ return typeof W._gcFieldLogExpense === 'function'; }, run: function(){ W._gcFieldLogExpense(); } },""",
"""  receipt:   { ic: '🧾', l: 'Snap a receipt', show: function(){ return typeof W._gcFieldLogExpense === 'function'; }, run: function(p){ W._gcFieldLogExpense(p || undefined); } },   /* patch FIELDMORE: on the job in hand */""")
t = rep(t, """  claims:    { ic: '🛡', l: 'Claim info', show: claimsApi, n: function(){ return claimsVis().length; }, run: function(){ openClaims({}); } },""",
"""  claims:    { ic: '🛡', l: 'Claim info', show: claimsApi, n: function(){ return claimsVis().length; }, run: function(p){ var c = fmClaim(p); openClaims(c ? { claimId: c.id } : {}); } },   /* patch FIELDMORE: this job's claim */""")
t = rep(t, """  drying:    { ic: '💧', l: 'Drying logs', show: claimsApi, n: function(){ var k = mitK(); return k ? k.readingsDue : 0; }, run: function(){ openDrying('drying'); } },""",
"""  drying:    { ic: '💧', l: 'Drying logs', show: claimsApi, n: function(){ var k = mitK(); return k ? k.readingsDue : 0; }, run: function(p){ var c = fmClaim(p); if (c) openClaims({ claimId: c.id, mode: 'mitigation', screen: 'drying' }); else openDrying('drying'); } },   /* patch FIELDMORE */""")
t = rep(t, """  search:    { ic: '🔍', l: 'Search', show: function(){ return typeof W._gcUniversalSearch === 'function'; }, run: function(){ W._gcUniversalSearch(); } }
};""", """  search:    { ic: '🔍', l: 'Search', show: function(){ return typeof W._gcUniversalSearch === 'function'; }, run: function(){ W._gcUniversalSearch(); } },
  camera:    { ic: '📷', l: 'Camera', show: function(){ return !!(W._gcPhotos && W._gcPhotos.open); }, run: function(p){ fmCamera(p); } }   /* patch FIELDMORE: GrayCo Photos' camera */
};
/* __GC_PATCH_FIELDMORE__ — ☰ More in GrayCo Field: AT THE JOB (big tiles, the role's field actions, the job type's first)
   and OFFICE (rows). The job in hand: the job page that is open, else the person's job scheduled today. */
var FM_JOB = {
  admin:  ['camera', 'receipt', 'sched', 'log', 'msgs', 'todo', 'search', 'addjob', 'quickest', 'oncall'],
  pm:     ['camera', 'receipt', 'sched', 'log', 'msgs', 'todo', 'search', 'cust', 'sub', 'sendest'],
  est:    ['camera', 'receipt', 'msgs', 'todo', 'search'],
  ins:    ['camera', 'receipt', 'log', 'msgs', 'todo', 'search', 'addjob'],
  crew:   ['camera', 'receipt', 'log', 'punch'],
  office: ['camera', 'receipt', 'photos', 'todo', 'search']
};
var FM_OFF = { admin: ['claims', 'match', 'maint'], pm: ['leads', 'estimates', 'maint'], est: ['appr', 'leads', 'estimates'], ins: ['appr'], crew: [], office: ['leads', 'maint'] };
var FM_FIRST = {
  ins: ['camera', 'claims', 'drying', 'receipt', 'sched', 'log'],
  com: ['sched', 'log', 'camera', 'receipt', 'sub'],
  res: ['camera', 'receipt', 'sched', 'log', 'cust', 'sub'],
  '':  ['camera', 'receipt', 'sched', 'log']
};
var FM_CLAIM = ['admin', 'office', 'pm', 'roof', 'ins', 'mit'];   /* role keys that see a job's claim (staff, never the customer) */
var FM_KIND = { ins: '🛡 Insurance claim', com: '🏢 Commercial', res: '🏠 Residential' };
var FM_PID = { camera: 1, receipt: 1, sched: 1, log: 1, cust: 1, sub: 1, claims: 1, drying: 1 };   /* these act on the job in hand */
var FM_BAR = { 'ra-leads': 'leads', 'ra-estimates': 'estimates', 'ra-claims': 'claims' };
function fmClaim(p){ var A = claimsApi(); if (!p || !A || !A.forProject) return null; try { return A.forProject(p.id) || null; } catch (e) { return null; } }
function fmCamera(p){
  var P = W._gcPhotos; if (!P || !P.open) { toast('GrayCo Photos is not on this phone yet.'); return; }
  if (p && p.id) { P.open(p.id, { camera: true }); return; }
  P.open(); later(function(){ var f = D.querySelector('#gcuOv .gcu-fab'); if (f) f.click(); }, 60);   /* its own 📷 button: the camera asks which job */
}
function fmKind(p){ try { return p && W._gcFieldMore && W._gcFieldMore.kind ? W._gcFieldMore.kind(p) : ''; } catch (e) { return ''; } }
function fmJob(){
  var p = null;
  try { if (D.getElementById('_gcJobDash') && W._gcCurrentJob && W._gcCurrentJob.id) p = proj(W._gcCurrentJob.id) || W._gcCurrentJob; } catch (e) {}
  if (!p) try { var J = F() && F().jobs ? F().jobs() : null; if (J && J.today && !J.company && arr(J.list).length) p = fpSort(arr(J.list))[0] || null; } catch (e) {}
  return p;
}
function fmIds(a, kind, p){
  var bar = arr(BAR[a]).map(function(b){ return FM_BAR[b[0]] || b[0]; });
  var set = arr(FM_JOB[a]).slice(), off = arr(FM_OFF[a]).slice();
  var add = function(id){ if (set.indexOf(id) < 0) set.push(id); };
  if (kind === 'ins' && p && FM_CLAIM.indexOf(rk()) >= 0) { add('claims'); add('drying'); off = off.filter(function(x){ return x !== 'claims'; }); }
  if (p && a === 'admin') { add('cust'); add('sub'); }
  var first = FM_FIRST[kind] || FM_FIRST[''];
  var order = first.filter(function(id){ return set.indexOf(id) >= 0; }).concat(set.filter(function(id){ return first.indexOf(id) < 0; }));
  var ok = function(id){ if (!shown(id)) return false; if (bar.indexOf(id) >= 0 && !(id === 'claims' && p)) return false; var x = A[id]; if (x.jobOk && p) { try { return !!x.jobOk(p); } catch (e) { return false; } } return true; };
  return { job: order.filter(ok), off: off.filter(function(id){ return ok(id) && order.indexOf(id) < 0; }) };
}
function fieldMore(a, o, pk){
  var p = fmJob(), kind = fmKind(p), L = fmIds(a, kind, p), pid = p ? ' data-pid="' + esc(p.id) + '"' : '';
  var tile = function(id){ var n = count(id); return '<button type="button" class="gc-fm-t" data-ra-a="' + id + '" data-ra-close' + (FM_PID[id] ? pid : '') + '><span class="e">' + A[id].ic + '</span><span class="l">' + esc(label(id)) + '</span>' + (n ? '<b class="gc-ra-n">' + n + '</b>' : '') + '</button>'; };
  var row = function(id){ var n = count(id); return '<button type="button" class="gc-fm-r" data-ra-a="' + id + '" data-ra-close><span class="e">' + A[id].ic + '</span><span>' + esc(label(id)) + (n ? ' <b class="gc-ra-n">' + n + '</b>' : '') + '</span></button>'; };
  /* GrayCo Field's own rows: 🔍 Search is the tile now; 📸 GrayCo Photos only when the bar has no Photos */
  var own = {}, other = [];
  Array.prototype.slice.call(pk.children).forEach(function(b){ var k = b.getAttribute('data-m') || (b.hasAttribute('data-gc-view') ? 'desk' : ''); if (k && !own[k]) own[k] = b; else other.push(b); pk.removeChild(b); });
  var keep = [];
  if (own.search && L.job.indexOf('search') < 0) keep.push(own.search);
  if (own.photos && arr(BAR[a]).every(function(b){ return b[0] !== 'photos'; }) && L.job.indexOf('photos') < 0) keep.push(own.photos);
  ['tools', 'settings', 'desk'].forEach(function(k){ if (own[k]) keep.push(own[k]); });
  pk.innerHTML = '<div class="gc-fm-k" data-fm="job">At the job' + (p ? ' <span>· ' + esc(s(p.name).slice(0, 40)) + (kind ? ' · ' + FM_KIND[kind] : '') + '</span>' : '') + '</div>' +
    '<div class="gc-fm-g">' + L.job.map(tile).join('') + '</div><div class="gc-fm-k" data-fm="office">Office</div>' + L.off.map(row).join('');
  keep.concat(other).forEach(function(b){ pk.appendChild(b); });
  pk.classList.add('gc-fm');
  o.setAttribute('data-ra-more', a); o.setAttribute('data-fm-kind', kind || 'none'); if (p) o.setAttribute('data-fm-job', s(p.id));
}""")
# a non-job button gets the job in hand (camera, receipt, claims, drying); the others ignore it
t = rep(t, """    if (!x.job) { x.run(); return true; }""", """    if (!x.job) { x.run(pid ? proj(pid) : undefined); return true; }   /* patch FIELDMORE */""")
t = rep(t, """    if (pk && ex.length) {
      var box = D.createElement('div'); box.className = 'gc-ra-mx';
      box.innerHTML = ex.filter(function(id){ return id !== 'search' && id !== 'photos'; }).map(function(id){ var n = count(id); return '<button type="button" data-ra-a="' + id + '" data-ra-close><span class="e">' + A[id].ic + '</span><span>' + esc(label(id)) + (n ? ' <b class="gc-ra-n">' + n + '</b>' : '') + '</span></button>'; }).join('');
      while (box.firstChild) pk.insertBefore(box.lastChild, pk.firstChild);
      o.setAttribute('data-ra-more', a);
    }""", """    if (pk) { try { css(); fieldMore(a, o, pk); } catch (e) { warn(e); } }   /* patch FIELDMORE: At the job · Office */""")
t = rep(t, """    '.gc-fh-sheet .gc-ra-n{margin-left:6px}',
""", """    '.gc-fh-sheet .gc-ra-n{margin-left:6px}',
    /* patch FIELDMORE: ☰ More — At the job (big tiles) · Office (rows) */
    '.gc-fh-sheet .gc-fm-k{font:800 11.5px Inter,-apple-system,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin:6px 2px 0}.gc-fh-sheet .gc-fm-k[data-fm="office"]{margin-top:12px}.gc-fh-sheet .gc-fm-k span{text-transform:none;letter-spacing:0;font-weight:700;color:#374151}',
    '.gc-fh-sheet .gc-fm-g{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.gc-fh-sheet .pick .gc-fm-g button{position:relative;flex-direction:column;align-items:flex-start;justify-content:center;gap:6px;min-height:78px;padding:10px 12px;font-size:15px;line-height:1.2}',
    '.gc-fh-sheet .pick .gc-fm-g button .e{font-size:26px;line-height:1}.gc-fh-sheet .gc-fm-g .gc-ra-n{position:absolute;top:8px;right:8px;margin:0}',
    '.gc-fh-sheet .pick .gc-fm-r,.gc-fh-sheet .pick.gc-fm>button:not(.gc-fm-t){min-height:50px;padding:9px 12px}',
""")

# ════ 2. FIELDPORTAL: the job page's tiles, by the job's type ═══════════════════════════════════════════════════════
t = rep(t, """  order.forEach(function(b){ grid.appendChild(b); });
  if (by.photo && pm.photos)""", """  order.forEach(function(b){ grid.appendChild(b); });
  try { if (W._gcFieldMore && W._gcFieldMore.jobGrid) W._gcFieldMore.jobGrid(grid, p, mk); } catch (e) {}   /* patch FIELDMORE: by the job's type */
  if (by.photo && pm.photos)""")

JS = r"""<script id="gc-patch-fieldmore">
/* __GC_PATCH_FIELDMORE_JOB__ — the Field job page by the job's type (owner 11/03: "If it's an insurance claim it should
   have a different field view than a roof, residential or commercial. Commercial should probably have a different set of
   buttons" · "the More for this job buttons still need to make sense too for the type of job").
   kind(job): 'ins' an insurance claim (window._gcIsInsuranceJob: claim #, carrier words, type "Insurance Claim" /
   "Fire Damage" / "Water Damage", or a claim in the claims app) · 'com' commercial (type starts "Commercial" or
   "New Construction", job.isCommercial, a commercial service / tag) · 'res' everything else (roofing included).
   jobGrid(grid, job, mk): called by FIELDPORTAL right after it lays out the tiles. The type's tiles on top, then
   "➕ More for this job" with the rest in short groups, ordered for the type. Existing tiles are never removed; added
   tiles run existing field tools for this job, only for the roles that have them. */
(function(){
'use strict';
if (window.__GC_PATCH_FIELDMORE_JOB__) return; window.__GC_PATCH_FIELDMORE_JOB__ = true;
var W = window, D = document;
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function rk(){ try { return s(W._gcField.state().rk); } catch (e) { return ''; } }
function roleTools(k){ try { return arr(W._gcField.roleTools(k)); } catch (e) { return []; } }
function claimsApi(){ return W._gcClaims && typeof W._gcClaims.list === 'function' ? W._gcClaims : null; }
function kind(p){
  if (!p) return '';
  try { if (typeof W._gcIsInsuranceJob === 'function' && W._gcIsInsuranceJob(p)) return 'ins'; } catch (e) {}
  if (p.isInsurance !== false) {
    if (s(p.claimNo || p.claimNumber || p.insCarrier || p.carrier)) return 'ins';
    try { var A = claimsApi(); if (A && A.forProject && A.forProject(p.id)) return 'ins'; } catch (e) {}
  }
  var ty = s(p.type || p.jobType), tags = [p.service, p.market, p.category].concat(arr(p.tags)).map(s).join(' ');
  if (p.isCommercial === true || /^(commercial|new construction)/i.test(ty) || /🏢|\bcommercial\b/i.test(tags)) return 'com';
  return 'res';
}
var LAYOUT = {
  ins: { top: ['claim', 'photo', 'share', 'dry', 'sched', 'log', 'cust', 'co', 'docs', 'upest', 'est'],
         more: [['On site', ['progress', 'update', 'punch', 'safety']], ['People', ['msg', 'sub', 'info']], ['Paperwork', ['create']], ['Money', ['money', 'invoice', 'jobfin']]],
         hide: ['payapp'] },
  res: { top: ['progress', 'photo', 'log', 'sched', 'sub', 'cust', 'co', 'upest', 'est', 'money', 'punch'],
         more: [['On site', ['update', 'share']], ['People', ['msg', 'info']], ['Paperwork', ['docs', 'create']], ['Money', ['invoice', 'jobfin']]],
         hide: ['claim', 'dry', 'payapp', 'safety'] },
  com: { top: ['sched', 'log', 'docs', 'sub', 'co', 'payapp', 'safety', 'photo', 'info', 'upest', 'est'],
         more: [['On site', ['progress', 'update', 'share', 'punch']], ['People', ['msg', 'cust']], ['Paperwork', ['create']], ['Money', ['money', 'invoice', 'jobfin']]],
         hide: ['claim', 'dry'] }
};
var KIND_L = { ins: '🛡 Insurance claim', com: '🏢 Commercial', res: '🏠 Residential' };
var CLAIM_RK = ['admin', 'office', 'pm', 'roof', 'ins', 'mit'], DRY_RK = ['admin', 'office', 'pm', 'roof', 'ins', 'mit', 'super'], MONEY_RK = ['admin', 'office', 'pm', 'roof'];
function tool(id, p){ try { if (W._gcFieldTools && W._gcFieldTools.run(id, p.id)) return; } catch (e) {} try { console.warn('[GC FIELDMORE] no tool', id); } catch (x) {} }
/* the added tiles: [icon, label, may this person have it on this job?, run] */
var EXTRA = {
  claim:  ['🛡', 'Claim info', function(k, r){ return k === 'ins' && !!claimsApi() && CLAIM_RK.indexOf(r) >= 0; }, function(p){ tool('xact', p); }],
  dry:    ['💧', 'Moisture / drying log', function(k, r){ return k === 'ins' && !!claimsApi() && DRY_RK.indexOf(r) >= 0; }, function(p){ tool('readings', p); }],
  co:     ['🔁', 'Change order', function(k, r, T){ return T.indexOf('co') >= 0; }, function(p){ tool('co', p); }],
  punch:  ['☐', 'Punch / final', function(k, r, T){ return T.indexOf('punch') >= 0; }, function(p){ tool('punch', p); }],
  safety: ['🦺', 'Safety', function(k, r, T){ return T.indexOf('safety') >= 0 || ['admin', 'pm', 'roof', 'super'].indexOf(r) >= 0; }, function(p){ tool('safety', p); }],
  est:    ['📐', 'Estimate', function(k, r, T){ return T.indexOf('est') >= 0; }, function(p){ tool('est', p); }],
  payapp: ['🏗', 'Pay apps', function(k, r){ return k === 'com' && !!(W._gcA8 && W._gcA8.payApp && W._gcA8.payApp.open) && MONEY_RK.indexOf(r) >= 0; }, function(p){ W._gcA8.payApp.open(p.id); }]
};
function listed(L, k){ return L.top.indexOf(k) >= 0 || L.more.some(function(g){ return g[1].indexOf(k) >= 0; }); }
function jobGrid(grid, p, mk){
  if (!grid || !p || grid.getAttribute('data-fm-kind')) return false;
  var k = kind(p) || 'res', L = LAYOUT[k], r = rk(), T = roleTools(r);
  var tiles = {}, unknown = [];
  Array.prototype.slice.call(grid.children).forEach(function(b){
    var key = b.getAttribute('data-fp') || b.getAttribute('data-fn') || (/upload estimate/i.test(b.textContent || '') ? 'upest' : '');
    if (!key || tiles[key]) unknown.push(b); else tiles[key] = b;
  });
  Object.keys(EXTRA).forEach(function(key){
    var x = EXTRA[key]; if (tiles[key] || L.hide.indexOf(key) >= 0 || !listed(L, key) || typeof mk !== 'function') return;
    var ok = false; try { ok = !!x[2](k, r, T); } catch (e) {}
    if (!ok) return;
    var b = mk(key, x[0], x[1]); b.className = 'gcfm-t'; b.removeAttribute('data-fp'); b.setAttribute('data-fm', key); tiles[key] = b;
  });
  var used = {}, top = [], groups = [];
  L.top.forEach(function(key){ if (tiles[key] && !used[key]) { top.push(tiles[key]); used[key] = 1; } });
  L.more.forEach(function(g){ var l = g[1].filter(function(key){ return tiles[key] && !used[key]; }).map(function(key){ used[key] = 1; return tiles[key]; }); if (l.length) groups.push([g[0], l]); });
  var rest = Object.keys(tiles).filter(function(key){ return !used[key]; }).map(function(key){ return tiles[key]; }).concat(unknown);   /* never removed */
  if (rest.length) groups.push(['Other', rest]);
  while (grid.firstChild) grid.removeChild(grid.firstChild);
  top.forEach(function(b){ grid.appendChild(b); });
  var n = groups.reduce(function(a, g){ return a + g[1].length; }, 0);
  if (n) {
    var m = D.createElement('button'); m.type = 'button'; m.className = 'gcfm-more'; m.setAttribute('data-fm-more', '1');
    m.innerHTML = '<span>➕</span><span>More for this job (' + n + ')</span>'; grid.appendChild(m);
    groups.forEach(function(g){
      var h = D.createElement('div'); h.className = 'gcfm-k gcfm-ov'; h.setAttribute('data-fm-g', g[0]); h.textContent = g[0]; grid.appendChild(h);
      g[1].forEach(function(b){ b.classList.add('gcfm-ov'); grid.appendChild(b); });
    });
  }
  grid.setAttribute('data-fm-kind', k);
  var lab = grid.previousElementSibling;
  if (lab && /FOR THIS JOB/i.test(lab.textContent || '') && !lab.querySelector('.gcfm-kind')) { var sp = D.createElement('span'); sp.className = 'gcfm-kind'; sp.textContent = ' · ' + KIND_L[k]; lab.appendChild(sp); }
  grid.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-fm],[data-fm-more]'); if (!b || !grid.contains(b)) return;
    e.stopPropagation();
    if (b.hasAttribute('data-fm-more')) { var on = grid.classList.toggle('gcfm-open'); b.lastChild.textContent = on ? 'Less for this job' : 'More for this job (' + n + ')'; b.firstChild.textContent = on ? '▴' : '➕'; if (on) try { b.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (x) {} return; }
    var x = EXTRA[b.getAttribute('data-fm')]; var q = null; try { q = (W._crm && arr(W._crm.projects).filter(function(j){ return j && s(j.id) === s(p.id); })[0]) || p; } catch (er) { q = p; }
    if (x) { try { x[3](q); } catch (er) { try { console.warn('[GC FIELDMORE]', er); } catch (z) {} } }
  });
  css();
  return true;
}
var cssDone = false;
function css(){
  if (cssDone || D.getElementById('gc-fieldmore-css')) return; cssDone = true;
  var st = D.createElement('style'); st.id = 'gc-fieldmore-css';
  st.textContent = [
    '.gcfp-top .gcfp-grid:not(.gcfm-open)>.gcfm-ov{display:none!important}',
    '.gcfp-top .gcfp-grid>.gcfm-k{grid-column:1/-1;font:800 11px Inter,-apple-system,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin:8px 2px 0}',
    '.gcfp-top .gcfp-grid>.gcfm-more{grid-column:1/-1;min-height:48px!important;justify-content:center!important;gap:8px!important;cursor:pointer;border-style:dashed!important}',
    '.gcfp-top .gcfp-grid>.gcfm-more>span:first-child{font-size:16px!important}.gcfp-top .gcfp-grid>.gcfm-more>span:last-child{font-size:14px!important}',
    '.gcfp-top .gcfm-kind{font-weight:700;text-transform:none;letter-spacing:0}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
}
W._gcFieldMore = { kind: kind, layout: LAYOUT, jobGrid: jobGrid };
})();
</script>
"""
t = rep(t, '<script id="gc-patch-fieldportal">', JS + '<script id="gc-patch-fieldportal">')

open(p, 'w', encoding='utf-8').write(t)
print('FIELDMORE: patched')
