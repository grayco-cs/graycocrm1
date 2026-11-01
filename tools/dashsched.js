/* patch DASHSCHED (owner 11/01, on the 🏠 Dashboard: "put this farther down, put schedule here").
   1. 📅 Schedule card where the "Budget Alerts / Insurance Expiring" grid was (above Active jobs): today and the next 6 days
      from the CRM's schedule (the Schedule screen's own list, window._crm.schedule: job work, sub work, inspections,
      appointments, meetings, milestones; plus the per-job inspection dates), and "Coming up" when the week is light. Each
      item opens its job; "Full schedule →" opens the Schedule screen. Who sees what follows the Schedule screen: the company
      dashboard (admins / office) every company item; "My Dashboard" (a PM, or an admin's 👤 My Jobs) and "<name>'s
      Dashboard" (an admin viewing a person) only that person's jobs and items; personal (🔒) items only their owner's.
      The two old schedule cards lower down ("📅 My Week" and the 14-day "📅 Company / My Schedule") are the same items:
      they are folded away, so the dashboard has ONE schedule card, at the top.
   2. The alerts grid (Budget Alerts + sub insurance) goes BELOW Active jobs.
   3. The insurance card is "Sub insurance — expired / expiring": expired rows in red with "expired", soonest / most overdue
      first, suppliers left out (patch SUPPLIERPAY's rule: isSub === false or type supplier / vendor / material). Its rows
      (and anything other patches put on them, e.g. ✉) stay the React rows; only their order, colour and a tag change.
   How: nothing in the React bundle changes and no React-owned node is moved. The dashboard's root div becomes a flex column
   and the grid + everything after it get CSS order 1 (the jobs card keeps 0), so React's own inserts / removes keep working.
   Mutation observers (childList only, no subtree) on the dashboard root, its parent, the grid and the insurance card run the
   placement in the same task as React's commit (no flicker); the #root-wide observer is only armed until the dashboard is
   found, then disconnected. Every step is idempotent (writes only when something differs), so it cannot loop.
   Kill switch: localStorage gc_dashsched_off = '1'.   Console: _gcDashSched.state(). */
(function(){
'use strict';
if (window.__GC_PATCH_DASHSCHED__) return; window.__GC_PATCH_DASHSCHED__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var MO = W.MutationObserver;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function C(){ return W._crm || {}; }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function warn(e){ try { console.warn('[GC DASHSCHED]', e && e.message || e); } catch (x) {} }
function off(){ return lsGet('gc_dashsched_off') === '1'; }
function ymd(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function addDays(n){ var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); }
function dayDiff(a, b){ return Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5); }
var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayLabel(d, t){
  var x = new Date(d + 'T12:00:00'); if (isNaN(x)) return d;
  var n = dayDiff(t, d), w = DN[x.getDay()] + ' ' + MN[x.getMonth()] + ' ' + x.getDate();
  return n === 0 ? 'Today · ' + w : n === 1 ? 'Tomorrow · ' + w : w;
}
function time12(t){ var m = /^(\d{1,2}):(\d{2})/.exec(s(t)); if (!m) return ''; var h = +m[1], ap = h >= 12 ? 'p' : 'a'; h = h % 12 || 12; return h + (m[2] === '00' ? '' : ':' + m[2]) + ap; }

/* ── who the dashboard is about (the same three cases as the React dashboard's own title) ── */
function seesAll(){ try { return typeof W._gcProjSeesAll === 'function' ? !!W._gcProjSeesAll() : !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function viewer(){ try { if (typeof W._gcProjViewer === 'function') return W._gcProjViewer() || null; } catch (e) {} return W._gcMeNow || null; }
function userByName(n){ n = low(n); return arr(C().users).filter(function(u){ return u && low(u.name) === n; })[0] || null; }
/* mode: 'all' (Company Dashboard) or the person: { name, u } */
function scopeOf(h1txt){
  var m = /^(.+)'s Dashboard$/.exec(s(h1txt));
  if (m) { var u = userByName(m[1]) || { name: s(m[1]) }; return { all: false, u: u, name: s(u.name) }; }
  if (/^Company Dashboard$/.test(s(h1txt)) && seesAll()) return { all: true, u: viewer(), name: s((viewer() || {}).name) };
  var v = viewer() || {};
  if (!/Dashboard$/.test(s(h1txt)) && seesAll()) return { all: true, u: v, name: s(v.name) };   /* the Desk home: the admin's company view */
  return { all: false, u: v, name: s(v.name) };
}
function jobVisibleTo(p, u){
  if (!p || !u) return false;
  try { if (typeof W._gcProjVisible === 'function') return !!W._gcProjVisible(p, u); } catch (e) {}
  try { if (typeof W._gcSamePM === 'function') return !!W._gcSamePM(p.pm, u, p); } catch (e) {}
  return low(p.pm) === low(u.name);
}
function projMap(){ var m = {}; arr(C().projects).forEach(function(p){ if (p && p.id) m[p.id] = p; }); return m; }
function deadJob(p){ return !!p && (p.deleted || p.tombstoned); }

/* ── the items: the Schedule screen's list (company / mine rules) + the per-job inspection dates ── */
var INSK = { raw: null, val: {} };
function jobInspections(){
  var raw = lsGet('gc_job_inspections') || '';
  if (raw !== INSK.raw) { INSK.raw = raw; try { INSK.val = JSON.parse(raw || '{}') || {}; } catch (e) { INSK.val = {}; } }
  return INSK.val;
}
function items(sc, from, to){
  var P = projMap(), me = low(sc.name), out = [], seen = {};
  var mineJob = {}; if (!sc.all) arr(C().projects).forEach(function(p){ if (p && p.id && jobVisibleTo(p, sc.u)) mineJob[p.id] = 1; });
  arr(C().schedule).forEach(function(x){
    if (!x || !x.date || x.deleted || x._deleted) return;
    var d = s(x.date).slice(0, 10); if (d < from || d > to) return;
    var p = x.pid ? P[x.pid] : null; if (deadJob(p)) return;
    var personal = x.scope === 'personal', tentBid = !!(p && x.scope === 'tentative' && p.status === 'bidding');
    if (personal) { if (low(x.by) !== me) return; }
    else if (sc.all) { if (x.scope === 'tentative' || tentBid) return; }
    else { if (tentBid) return; if (!(low(x.assignee) === me || low(x.by) === me || (x.pid && mineJob[x.pid]))) return; }
    var k = s(x.pid) + '|' + d + '|' + low(x.title); if (seen[k]) return; seen[k] = 1;
    out.push({ id: s(x.id), d: d, t: s(x.time), title: s(x.title) || s(x.vendor) || 'Scheduled', type: low(x.type), pid: s(x.pid), job: p ? s(p.name) : '', who: personal ? '' : s(x.assignee || x.vendor), personal: personal });
  });
  var I = jobInspections();
  Object.keys(I).forEach(function(pid){
    var p = P[pid]; if (!p || deadJob(p)) return;
    if (!sc.all && !mineJob[pid]) return;
    arr(I[pid]).forEach(function(n){
      if (!n || n.done || !n.date) return; var d = s(n.date).slice(0, 10); if (d < from || d > to) return;
      var title = s(p.name) + ' — ' + (s(n.label) || 'Inspection'), k = pid + '|' + d + '|' + low(title);
      if (seen[k] || out.some(function(o){ return o.pid === pid && o.d === d && o.type === 'inspection'; })) return; seen[k] = 1;
      out.push({ id: s(n.id), d: d, t: '', title: title, type: 'inspection', pid: pid, job: s(p.name), who: '', personal: false });
    });
  });
  return out.sort(function(a, b){ return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.t || '99') < (b.t || '99') ? -1 : (a.t || '99') > (b.t || '99') ? 1 : 0; });
}
var ICON = { inspection: '🔎', appointment: '🤝', meeting: '👥', milestone: '🏁', sub_work: '🔧', work: '🔨', reminder: '⏰', delivery: '🚚' };
function icon(x){ return x.personal ? '🔒' : (ICON[x.type] || '📌'); }
/* today + 6 days; "Coming up" (to 30 days) when the week has fewer than 4 */
var MAXROWS = 10;
function model(sc){
  var t = addDays(0), wk = items(sc, t, addDays(6)), next = [];
  if (wk.length < 4) next = items(sc, addDays(7), addDays(30)).slice(0, 4 - wk.length);
  return { t: t, wk: wk, next: next };
}
function sub(x){ var j = x.job && low(x.title).indexOf(low(x.job)) < 0 ? x.job : ''; return [j, x.who].filter(Boolean).join(' · '); }
function rowHtml(x){
  var tm = time12(x.t);
  return '<button type="button" class="gc-ds-row" data-gc-ds-pid="' + esc(x.pid) + '" title="' + esc(x.pid ? 'Open the job' : 'Open the schedule') + '">'
    + '<span class="tm">' + esc(tm) + '</span><span class="ic" aria-hidden="true">' + icon(x) + '</span>'
    + '<span class="tt"><b>' + esc(x.title) + '</b>' + (sub(x) ? '<small>' + esc(sub(x)) + '</small>' : '') + '</span>'
    + (x.pid ? '<span class="go" aria-hidden="true">›</span>' : '') + '</button>';
}
function groupHtml(list, t){
  var h = '', last = '';
  list.forEach(function(x){ if (x.d !== last) { last = x.d; h += '<div class="gc-ds-day' + (x.d === t ? ' today' : '') + '">' + esc(dayLabel(x.d, t)) + '</div>'; } h += rowHtml(x); });
  return h;
}
function cardHtml(sc){
  var M = model(sc), wk = M.wk.slice(0, MAXROWS), more = M.wk.length - wk.length;
  var head = '<div class="gc-ds-hd"><b>📅 ' + (sc.all ? 'Schedule' : (sc.name && low(sc.name) !== low((viewer() || {}).name) ? esc(sc.name.split(' ')[0]) + "'s schedule" : 'My schedule')) + '</b>'
    + '<span class="gc-ds-sub">today + next 6 days · ' + M.wk.length + ' item' + (M.wk.length === 1 ? '' : 's') + '</span><span class="sp"></span>'
    + '<button type="button" class="gc-ds-full" data-gc-ds-full="1">Full schedule →</button></div>';
  var body = wk.length ? groupHtml(wk, M.t) : '<div class="gc-ds-empty">Nothing on the schedule today or in the next 6 days.</div>';
  if (more > 0) body += '<button type="button" class="gc-ds-more" data-gc-ds-full="1">+ ' + more + ' more this week — Full schedule →</button>';
  if (M.next.length) body += '<div class="gc-ds-next">Coming up</div>' + groupHtml(M.next, M.t);
  return head + '<div class="gc-ds-list">' + body + '</div>';
}
/* the admin Desk home (patch ROLEAPPS) asks for the same list in its own card style */
function deskHtml(){
  var sc = scopeOf(''), M = model(sc), L = M.wk.slice(0, MAXROWS).concat(M.next);
  if (!L.length) return '<div class="gc-ra-empty">Nothing on the schedule today or in the next 6 days.</div>';
  var last = '';
  return L.map(function(x){
    var dh = x.d !== last ? (last = x.d, '<div class="gc-ra-empty" style="padding:8px 4px 2px;font-weight:800;color:#374151">' + esc(dayLabel(x.d, M.t)) + '</div>') : '';
    var t = (time12(x.t) ? esc(time12(x.t)) + ' · ' : '') + esc(sub(x));
    return dh + '<div class="gc-ra-item"><div class="t">' + icon(x) + ' ' + (x.pid ? '<button type="button" class="gc-ra-jn" data-ra-a="openjob" data-pid="' + esc(x.pid) + '">' + esc(x.title) + '</button>' : '<b>' + esc(x.title) + '</b>') + (t ? '<small>' + t + '</small>' : '') + '</div></div>';
  }).join('');
}

/* ── the insurance rows ── */
function isSupplier(r){ return !!r && (r.isSub === false || /supplier|vendor|material/i.test(s(r.type || r.kind || r.vendorType))); }
function recsByName(n){ n = low(n); return arr(C().subs).filter(function(r){ return r && low(r.name) === n; }); }
function decorateIns(card){
  var t = addDays(0), rows = [];
  Array.prototype.forEach.call(card.children, function(el){
    if (el.tagName === 'B') { if (el.textContent !== 'Sub insurance — expired / expiring') el.textContent = 'Sub insurance — expired / expiring'; if (el.style.order !== '-1') el.style.order = '-1'; return; }
    if (el.tagName !== 'DIV') return;
    var nb = el.querySelector('b'); if (!nb) return;
    var R = recsByName(nb.textContent), withExp = R.filter(function(r){ return s(r.insExp); });
    var rec = withExp.filter(function(r){ return !isSupplier(r); })[0] || withExp[0] || R[0] || null;
    var sup = !!rec && R.length > 0 && R.every(isSupplier);
    var exp = rec ? s(rec.insExp).slice(0, 10) : '', n = exp ? dayDiff(t, exp) : null;
    setAttr(el, 'data-gc-ds-sup', sup ? '1' : null);
    setAttr(el, 'data-gc-ds-exp', n != null && n < 0 ? '1' : null);
    var tag = el.querySelector(':scope > .gc-ds-tag');
    var txt = n == null ? '' : n < 0 ? 'expired' : n === 0 ? 'expires today' : 'in ' + n + ' day' + (n === 1 ? '' : 's');
    if (txt) { if (!tag) { tag = D.createElement('span'); tag.className = 'gc-ds-tag'; el.appendChild(tag); } if (tag.textContent !== txt) tag.textContent = txt; setAttr(tag, 'data-x', n < 0 ? '1' : null); }
    else if (tag) tag.remove();
    rows.push({ el: el, k: exp || '9999', sup: sup });
  });
  rows.sort(function(a, b){ return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; }).forEach(function(r, i){ var o = String(i); if (r.el.style.order !== o) r.el.style.order = o; });
  var vis = rows.filter(function(r){ return !r.sup; }).length;
  setAttr(card, 'data-gc-ds-hide', rows.length && !vis ? '1' : null);
  return vis;
}
function setAttr(el, a, v){ if (v == null) { if (el.hasAttribute(a)) el.removeAttribute(a); } else if (el.getAttribute(a) !== v) el.setAttribute(a, v); }

/* ── finding the dashboard and its cards ── */
function firstB(el){ var b = el.querySelector('b'); return b ? s(b.textContent) : ''; }
function findHost(){
  var h = D.querySelector('#root h1'); if (!h || !/^(Company Dashboard|My Dashboard|.+'s Dashboard)$/.test(s(h.textContent))) return null;
  var head = h.parentElement && h.parentElement.parentElement; return head && head.parentElement ? { host: head.parentElement, h1: s(h.textContent) } : null;
}
function isGrid(el){
  if (el.hasAttribute('data-gc-ds-grid')) return true;
  if (el.tagName !== 'DIV' || el.children.length > 2 || el.style.display !== 'grid') return false;
  for (var i = 0; i < el.children.length; i++) { var t = firstB(el.children[i]); if (t === 'Budget Alerts' || t === 'Insurance Expiring (30 days)' || t === 'Sub insurance — expired / expiring') return true; }
  return false;
}
function classify(host){
  var o = { jobs: null, grid: null, old: [] };
  Array.prototype.forEach.call(host.children, function(el){
    if (el.id === 'gc-dsched') return;
    if (!o.jobs && el.hasAttribute('data-gc-jobs')) { o.jobs = el; return; }
    if (!o.grid && isGrid(el)) { o.grid = el; return; }
    if (el.hasAttribute('data-gc-ds-old')) { o.old.push(el); return; }
    var t = firstB(el);
    if (/^📅 /.test(t) && (/ Week — /.test(t) || /^📅 (Company|My) Schedule$/.test(t))) o.old.push(el);
  });
  return o;
}

/* ── the observers ── */
var S = { host: null, par: null, grid: null, ins: null, card: null, sig: '', h1: '', ref: null, applied: 0, runs: 0, ms: 0, maxMs: 0 };
var obsRoot = null, obsHost = null, obsPar = null, obsGrid = null, obsIns = null, busy = false;
function watch(o, el){ if (!el || !MO) return null; if (o && o.__el === el) return o; if (o) o.disconnect(); var n = new MO(onMut); n.observe(el, { childList: true }); n.__el = el; return n; }
function onMut(){ if (!busy) apply(); }
function armRoot(on){
  if (!MO) return;
  if (on && !obsRoot) { var r = D.getElementById('root'); if (!r) return; obsRoot = new MO(onMut); obsRoot.observe(r, { childList: true, subtree: true }); }
  else if (!on && obsRoot) { obsRoot.disconnect(); obsRoot = null; }
}
function stopNarrow(){ [obsHost, obsGrid, obsIns].forEach(function(o){ if (o) o.disconnect(); }); obsHost = obsGrid = obsIns = null; }
function restore(){
  stopNarrow(); armRoot(false); if (obsPar) { obsPar.disconnect(); obsPar = null; }
  var c = D.getElementById('gc-dsched'); if (c) c.remove();
  Array.prototype.forEach.call(D.querySelectorAll('[data-gc-ds-ins]'), function(k){
    Array.prototype.forEach.call(k.children, function(el){ el.style.order = ''; if (el.tagName === 'B' && el.textContent === 'Sub insurance — expired / expiring') el.textContent = 'Insurance Expiring (30 days)'; });
  });
  Array.prototype.forEach.call(D.querySelectorAll('[data-gc-ds-host],[data-gc-ds-late],[data-gc-ds-old],[data-gc-ds-grid],[data-gc-ds-ins],[data-gc-ds-hide],[data-gc-ds-one],[data-gc-ds-sup],[data-gc-ds-exp]'), function(el){
    ['data-gc-ds-host', 'data-gc-ds-late', 'data-gc-ds-old', 'data-gc-ds-grid', 'data-gc-ds-ins', 'data-gc-ds-hide', 'data-gc-ds-one', 'data-gc-ds-sup', 'data-gc-ds-exp'].forEach(function(a){ el.removeAttribute(a); });
  });
  Array.prototype.forEach.call(D.querySelectorAll('.gc-ds-tag'), function(t){ t.remove(); });
  S.host = S.par = S.grid = S.ins = S.card = null; S.sig = '';
}
function css(){
  if (D.getElementById('gc-dsched-css')) return;
  var st = D.createElement('style'); st.id = 'gc-dsched-css'; st.setAttribute('data-gc-keep', '1');
  st.textContent = [
    '[data-gc-ds-host]{display:flex;flex-direction:column}',
    '[data-gc-ds-host]>[data-gc-ds-late]{order:1}',
    '[data-gc-ds-hide],[data-gc-ds-old]{display:none!important}',
    '[data-gc-ds-grid][data-gc-ds-one]{grid-template-columns:1fr!important}',
    '[data-gc-ds-ins]{display:flex;flex-direction:column}',
    '[data-gc-ds-ins]>[data-gc-ds-sup]{display:none!important}',
    '[data-gc-ds-ins]>[data-gc-ds-exp],[data-gc-ds-ins]>[data-gc-ds-exp] b{color:#b91c1c}',
    '.gc-ds-tag{margin-left:6px;font-size:10.5px;font-weight:700;border-radius:999px;padding:1px 7px;background:#fef3c7;color:#92400e;white-space:nowrap}',
    '.gc-ds-tag[data-x]{background:#fee2e2;color:#b91c1c;text-transform:uppercase;letter-spacing:.02em}',
    '#gc-dsched{margin-bottom:14px;border-left:3px solid #2563eb;padding:12px 14px}',
    '#gc-dsched .gc-ds-hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}#gc-dsched .gc-ds-hd b{font-size:13px}',
    '#gc-dsched .gc-ds-sub{font-size:11px;color:#64748b}#gc-dsched .sp{flex:1}',
    '#gc-dsched .gc-ds-full{border:1px solid #cbd5e1;background:#fff;color:#1d4ed8;border-radius:6px;padding:4px 10px;font:600 11.5px inherit;font-family:inherit;cursor:pointer}',
    '#gc-dsched .gc-ds-full:hover{background:#eff6ff}',
    '#gc-dsched .gc-ds-list{display:grid;grid-template-columns:1fr;gap:0}',
    '#gc-dsched .gc-ds-day{font-size:10.5px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.03em;padding:8px 2px 3px;border-bottom:1px solid #eef2f7}',
    '#gc-dsched .gc-ds-day.today{color:#1d4ed8}',
    '#gc-dsched .gc-ds-next{font-size:11px;font-weight:800;color:#475569;padding:10px 2px 0}',
    '#gc-dsched .gc-ds-row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:none;border-bottom:1px solid #f1f5f9;background:none;padding:6px 4px;font:12px/1.35 inherit;font-family:inherit;color:inherit;cursor:pointer;border-radius:4px}',
    '#gc-dsched .gc-ds-row:hover{background:#f1f5f9}',
    '#gc-dsched .gc-ds-row .tm{flex:0 0 44px;font-size:11px;font-weight:700;color:#475569;text-align:right}',
    '#gc-dsched .gc-ds-row .ic{flex:0 0 18px;text-align:center}',
    '#gc-dsched .gc-ds-row .tt{flex:1;min-width:0;overflow:hidden}#gc-dsched .gc-ds-row .tt b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}',
    '#gc-dsched .gc-ds-row .tt small{display:block;color:#64748b;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#gc-dsched .gc-ds-row .go{color:#94a3b8;font-size:16px;font-weight:700}',
    '#gc-dsched .gc-ds-empty{color:#64748b;font-size:12px;padding:8px 4px}',
    '#gc-dsched .gc-ds-more{border:none;background:none;color:#1d4ed8;font:600 11.5px inherit;font-family:inherit;cursor:pointer;padding:6px 4px;text-align:left}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
}
function schedCard(like){
  var c = D.getElementById('gc-dsched');
  if (!c) { S.sig = ''; c = D.createElement('div'); c.id = 'gc-dsched'; c.setAttribute('data-gc-keep', '1'); c.setAttribute('data-gcnav-ignore', '1'); c.setAttribute('role', 'region'); c.setAttribute('aria-label', 'Schedule'); }
  /* the dashboard's own card look (theme colours), from the jobs card when there is one */
  if (like && like.style) {
    var want = ['background', 'border', 'border-radius', 'box-shadow'].map(function(k){ var v = like.style.getPropertyValue(k); return v ? k + ':' + v : ''; }).filter(Boolean).join(';');
    if (c.getAttribute('data-look') !== want) { c.setAttribute('data-look', want); c.style.cssText = want; c.style.borderLeft = '3px solid #2563eb'; }
  } else if (!c.hasAttribute('data-look')) { c.setAttribute('data-look', ''); c.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:8px;border-left:3px solid #2563eb'; }
  return c;
}
function apply(){
  if (busy) return; busy = true; var t0 = Date.now();
  try { applyIn(); } catch (e) { warn(e); }
  finally { busy = false; var ms = Date.now() - t0; S.runs++; S.ms += ms; if (ms > S.maxMs) S.maxMs = ms; }
}
function applyIn(){
  if (off()) { if (S.host || D.getElementById('gc-dsched')) restore(); return; }
  var f = findHost();
  if (!f) {
    stopNarrow(); S.host = S.grid = S.ins = null;
    var c0 = D.getElementById('gc-dsched'); if (c0 && !c0.isConnected) c0.remove();
    /* off the dashboard: the parent observer (if any) sees it come back; else the #root watcher until it does */
    if (!(obsPar && obsPar.__el && obsPar.__el.isConnected)) armRoot(true);
    return;
  }
  var host = f.host;
  if (S.host !== host) { S.host = host; S.sig = ''; }
  S.h1 = f.h1;
  armRoot(false);
  obsPar = watch(obsPar, host.parentElement); obsHost = watch(obsHost, host);
  var o = classify(host);
  /* the schedule card: where the grid was (just above it), else just above the jobs card / the old schedule cards */
  var anchor = o.grid || o.jobs || o.old[0] || null;
  if (!anchor) { var c1 = D.getElementById('gc-dsched'); if (c1) c1.remove(); setAttr(host, 'data-gc-ds-host', null); return; }   /* not drawn yet */
  css(); setAttr(host, 'data-gc-ds-host', '1');
  var card = schedCard(o.jobs);
  o.old.forEach(function(el){ setAttr(el, 'data-gc-ds-old', '1'); });
  if (card.parentElement !== host || card.nextElementSibling !== anchor) host.insertBefore(card, anchor);
  /* the grid and everything after it (the jobs card excepted) go after Active jobs */
  var late = false;
  Array.prototype.forEach.call(host.children, function(el){
    if (el === o.grid) late = true;
    setAttr(el, 'data-gc-ds-late', late && el !== o.jobs && el !== card ? '1' : null);
  });
  /* the insurance card */
  S.grid = o.grid; S.ins = null;
  if (o.grid) {
    setAttr(o.grid, 'data-gc-ds-grid', '1'); obsGrid = watch(obsGrid, o.grid);
    var vis = 0;
    Array.prototype.forEach.call(o.grid.children, function(k){
      var t = firstB(k);
      if (t === 'Insurance Expiring (30 days)' || t === 'Sub insurance — expired / expiring' || k.hasAttribute('data-gc-ds-ins')) { S.ins = k; setAttr(k, 'data-gc-ds-ins', '1'); if (decorateIns(k)) vis++; }
      else if (!k.hasAttribute('data-gc-ds-hide')) vis++;
    });
    setAttr(o.grid, 'data-gc-ds-one', vis === 1 ? '1' : null);
    setAttr(o.grid, 'data-gc-ds-hide', vis === 0 ? '1' : null);
    obsIns = S.ins ? watch(obsIns, S.ins) : (obsIns && obsIns.disconnect(), null);
  } else { if (obsGrid) { obsGrid.disconnect(); obsGrid = null; } if (obsIns) { obsIns.disconnect(); obsIns = null; } }
  /* the card's contents: only when the items (or the person) changed */
  var html = cardHtml(scopeOf(f.h1));
  if (html !== S.sig) { card.innerHTML = html; S.sig = html; }
  S.applied = Date.now();
}
/* data changed (a new _crm object) or the day turned over: redraw. A reference check every 2.5 s, only while the
   dashboard is up and the tab is visible; it also re-arms the observers if the page was rebuilt underneath. */
var lastRef = null, lastDay = '', lastIns = null;
RI.call(W, function(){
  try {
    if (D.hidden) return;
    if (off()) { if (S.host || D.getElementById('gc-dsched')) restore(); return; }
    var ref = W._crm || null, day = addDays(0), ins = lsGet('gc_job_inspections');
    var hostOk = S.host && S.host.isConnected;
    if (!hostOk) {
      var parOk = obsPar && obsPar.__el && obsPar.__el.isConnected;
      if (!parOk && obsPar) { obsPar.disconnect(); obsPar = null; }
      if (low(lsGet('grayco_view')) === 'dashboard' || (!obsRoot && !parOk)) apply();
      return;
    }
    if (ref !== lastRef || day !== lastDay || ins !== lastIns) { lastRef = ref; lastDay = day; lastIns = ins; apply(); }
  } catch (e) { warn(e); }
}, 2500);

/* clicks on the card */
D.addEventListener('click', function(ev){
  var t = ev.target && ev.target.closest && ev.target.closest('#gc-dsched [data-gc-ds-pid],#gc-dsched [data-gc-ds-full]'); if (!t) return;
  ev.preventDefault();
  var pid = t.getAttribute('data-gc-ds-pid');
  if (pid) { var p = projMap()[pid]; if (p) { openJob(p); return; } }
  goSchedule();
}, false);
function goSchedule(){ try { if (typeof W._setView === 'function') W._setView('schedule'); } catch (e) { warn(e); } }
function openJob(p){
  W._gcCurrentJob = p;
  try { if (typeof W._gcJobDashboard === 'function') { W._gcJobDashboard(p.id); return; } } catch (e) { warn(e); }
  try { if (typeof W._gcOpenJobProfile === 'function') { W._gcOpenJobProfile(p.id); return; } } catch (e) { warn(e); }
  goSchedule();
}

W._gcDashSched = {
  deskHtml: deskHtml, apply: apply, restore: restore,
  items: function(h1){ var sc = scopeOf(h1 == null ? S.h1 : h1); return model(sc); },
  isSupplier: isSupplier,
  state: function(){ return { off: off(), host: !!(S.host && S.host.isConnected), h1: S.h1, grid: !!S.grid, ins: !!S.ins, card: !!D.getElementById('gc-dsched'), rootObs: !!obsRoot, parObs: !!obsPar, runs: S.runs, avgMs: S.runs ? +(S.ms / S.runs).toFixed(2) : 0, maxMs: S.maxMs }; }
};
if (MO) { if (D.getElementById('root')) apply(); else ST.call(W, apply, 500); }
try { console.log('[GC] 📅 Dashboard schedule on top, sub insurance below Active jobs (patch DASHSCHED) — _gcDashSched.state()'); } catch (e) {}
})();
