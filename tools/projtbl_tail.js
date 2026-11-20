<script id="gc-patch-projtbl">
/* __GC_PATCH_PROJTBL__ — desk tables (owner 11/20, Projects list): "put the message bubble under and make the project name
   bigger spot" + "let me be able to make my columns however wide I want for each one".
   · Projects (desk, ≥ 641 px): the 💬 sits under the blue PO pill; the PO pill never wraps and the PO# column is the widest
     pill + padding (also the least a drag can make it); PROJECT takes the room the others leave (smaller shares for the
     rest in DESKFIT's FIT and the 33.x sizer's DEFAULTS); the job name has its own line(s), the 🏢 ▾ / 📸 chips a row under it.
     When its box is narrow, Finish date / Spent / Alert (< 1250 px) and Type / Address (< 1060 px) are hidden; still too
     wide → the box scrolls sideways. The 💬 list button also finds hyphenated POs (C1024-2).
   · DESKFIT's tables (Projects, Invoices) never break a word in two: content layout, one-line headers and cells, only
     name / address / description columns wrap, at spaces.
   · Every desk table in #root with a header row: a grab handle on each header's right edge; drag to set that column's
     width, double-click resets it. Widths are kept per table (by its header names) on this device for this user
     (localStorage gc_colw:<user>), and put back on every render. The old projects-only ._gcRz handle is hidden on a desk.
   Phones (< 641 px) are untouched. */
(function(W){
'use strict';
if (W.__GC_PATCH_PROJTBL__) return; W.__GC_PATCH_PROJTBL__ = true;
var D = W.document, SI = W.__GC_REAL_SETINTERVAL__ || W.__GC_NATIVE_SETINTERVAL__ || W.setInterval, T3 = '[data-gccw][data-gccw][data-gccw]';
var st = D.createElement('style'); st.id = 'gc-projtbl-css';
st.textContent = '@media (min-width:641px){'
  + '#root table[data-gcx-projects]>thead>tr>th:first-child{width:var(--gcpo,84px)!important}'
  + '#root table[data-gcx-projects]>tbody>tr>td:first-child>span:first-child{white-space:nowrap;display:inline-block}'
  + '#root table[data-gcx-projects]>thead>tr>th:nth-child(2){width:auto!important}'   /* PROJECT takes what the others leave (columns hidden under 1200 px included) */
  + '#root table[data-gcx-projects]>tbody>tr>td:first-child{text-align:center}'
  + '#root table[data-gcx-projects] .__gcListMsgBtn{display:block;margin:3px auto 0!important}'
  + '#root table[data-gcx-projects]>tbody>tr>td:nth-child(2)>b:first-child{display:block;margin-bottom:2px}'
  + '#root table[data-gcx-projects]>tbody>tr>td:nth-child(2):not(._){white-space:nowrap!important}'
  + '#root table[data-gcx-projects]>tbody>tr>td:nth-child(2)>b:first-child{white-space:normal}'
  /* never a word broken in two (DESKFIT's break-word gave "SP EN T", "$13,0 00.00"): its tables lay out by content, headers and
     cells on one line, only name / address / description columns wrap (at spaces); too wide → the box scrolls sideways */
  + '#root table.gc-fit{table-layout:auto!important}'
  + '#root table.gc-fit>thead>tr>th{width:auto!important;white-space:nowrap!important}'
  + '#root table.gc-fit>thead>tr>th,#root table.gc-fit>tbody>tr>td{overflow-wrap:normal!important;word-break:normal!important}'
  + '#root table.gc-fit>tbody>tr>td{white-space:nowrap!important}'
  + '#root table.gc-fit>tbody>tr>td[data-gcw]{white-space:normal!important;min-width:110px}'
  + '#root table[data-gcx-projects]>tbody>tr>td:nth-child(2)[data-gcw]{min-width:200px}'
  + '#root table.gc-fit>tbody>tr>td[data-gcw] button{white-space:nowrap}'
  + '#root table.gc-fit [data-gcopt]{display:none!important}'
  + '._gcRz{display:none!important}'
  + '#root table' + T3 + '{table-layout:fixed!important;width:var(--gccwt)!important;min-width:100%!important;max-width:none!important}'
  + '#root table' + T3 + '>thead>tr>th:nth-child(n){width:var(--gccw,auto)!important;max-width:none!important;min-width:0!important}'
  + '#root table[data-gccw]>tbody>tr>td{max-width:none!important}'
  + '.gccw-h{position:absolute;top:0;right:0;width:7px;height:100%;cursor:col-resize;z-index:6;user-select:none;touch-action:none}'
  + '.gccw-h:hover,.gccw-h.on{background:rgba(37,99,235,.35)}}';
(D.head || D.documentElement).appendChild(st);

function desk(){ return W.innerWidth >= 641; }
function who(){ try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return String(u.email || u.id || u.name || '').toLowerCase(); } catch (e) { return ''; } }
function LK(){ return 'gc_colw:' + who(); }
function load(){ try { return JSON.parse(localStorage.getItem(LK()) || '{}') || {}; } catch (e) { return {}; } }
function save(o){ try { var ks = Object.keys(o); while (ks.length > 40) delete o[ks.shift()]; localStorage.setItem(LK(), JSON.stringify(o)); } catch (e) {} }
function ckey(th){ return String(th.textContent || '').replace(/[▲▼↑↓⇅]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 30) || '#'; }
function ths(t){ return [].slice.call(t.querySelectorAll(':scope>thead>tr:first-child>th')); }
function tkey(t){ var s = ths(t).map(ckey).join('|'), h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }

/* pin every visible column to px: the saved width, else its width as laid out without pins */
function pin(t, saved){
  var hs = ths(t); t.removeAttribute('data-gccw');
  var nat = hs.map(function(th){ return th.offsetWidth; }), sum = 0;
  hs.forEach(function(th, i){ var w = nat[i] ? Math.max(saved[ckey(th)] || nat[i], +th.getAttribute('data-gcmin') || 0) : 0; sum += w; th.style.setProperty('--gccw', w + 'px'); });
  t.style.setProperty('--gccwt', sum + 'px'); t.setAttribute('data-gccw', '1');
}
function total(t){ return ths(t).reduce(function(a, th){ return a + (th.offsetWidth ? parseFloat(th.style.getPropertyValue('--gccw')) || th.offsetWidth : 0); }, 0); }
/* Projects: the PO# column is never narrower than its widest PO pill (owner: "J99/8" wrapped in a squeezed column) */
function poMin(t){
  if (!t.hasAttribute('data-gcx-projects')) return '';
  var m = 0; [].forEach.call(t.querySelectorAll(':scope>tbody>tr>td:first-child>span:first-child'), function(sp){ m = Math.max(m, sp.offsetWidth); });
  var th = ths(t)[0], w = Math.max(64, Math.ceil(m) + 16); if (!m || !th) return '';
  if (th.getAttribute('data-gcmin') !== String(w)) { th.setAttribute('data-gcmin', w); t.style.setProperty('--gcpo', w + 'px'); }
  return w;
}
var WRAP = /^(project|client|address|description|name|job|customer|notes?|title|scope|vendor|actions)$/;   /* actions: its buttons stack, a button is never split */
/* Projects: the least-used columns go when its box is narrower than this many px (no squeezed letters, Project stays wide) */
var OPT = { 'finish date': 1250, spent: 1250, alert: 1250, type: 1060, address: 1060 };
function mark(el, a, on){ if (on !== el.hasAttribute(a)) { if (on) el.setAttribute(a, '1'); else el.removeAttribute(a); } }
function wrapCols(t){   /* mark the cells of the columns that may wrap at spaces, and the ones hidden for room */
  if (!t.classList.contains('gc-fit')) return;
  var hs = ths(t), box = t.parentElement ? t.parentElement.clientWidth : 9999, pj = t.hasAttribute('data-gcx-projects');
  var on = hs.map(function(th){ return WRAP.test(ckey(th)); }), off = hs.map(function(th){ return pj && (OPT[ckey(th)] || 0) > box; });
  hs.forEach(function(th, i){ mark(th, 'data-gcopt', off[i]); });
  [].forEach.call(t.querySelectorAll(':scope>tbody>tr'), function(tr){ var cs = tr.children; if (cs.length !== on.length) return;
    for (var i = 0; i < cs.length; i++) { mark(cs[i], 'data-gcw', on[i]); mark(cs[i], 'data-gcopt', off[i]); } });
}
function apply(t){
  wrapCols(t);
  var po = poMin(t), k = tkey(t), saved = load()[k] || {}, sig = k + JSON.stringify(saved) + ':' + ths(t).filter(function(th){ return th.offsetWidth; }).length + ':' + t.className + (t.getAttribute('data-gcfit-sig') || '') + (t.getAttribute('data-gcrz-sig') || '') + po;   /* re-measure when DESKFIT / the 33.x sizer lay it out again */
  ths(t).forEach(function(th){
    if (th.querySelector(':scope>.gccw-h')) return;
    if (W.getComputedStyle(th).position === 'static') th.style.position = 'relative';
    var h = D.createElement('div'); h.className = 'gccw-h'; h.title = 'Drag to resize · double-click to reset'; th.appendChild(h);
  });
  if (!Object.keys(saved).length) { if (t.hasAttribute('data-gccw')) { t.removeAttribute('data-gccw'); t.removeAttribute('data-gccw-sig'); } return; }
  if (t.getAttribute('data-gccw-sig') === sig && t.hasAttribute('data-gccw')) return;
  pin(t, saved); t.setAttribute('data-gccw-sig', sig);
}
function tick(){
  if (D.hidden || !desk() || DRAG) return;   /* not mid-drag: the new width is not saved yet */
  [].forEach.call(D.querySelectorAll('#root table'), function(t){ try { if (ths(t).length >= 3 && t.getClientRects().length) apply(t); } catch (e) {} });
}
var DRAG = false;
function stop(e){ e.preventDefault(); e.stopPropagation(); }
D.addEventListener('mousedown', function(e){
  var h = e.target; if (!h || !h.classList || !h.classList.contains('gccw-h') || !desk()) return; stop(e);
  var th = h.parentElement, t = th.closest('table'), x0 = e.pageX, w0 = th.offsetWidth, moved = false; DRAG = true;
  function mv(ev){
    if (!moved) { moved = true; if (!t.hasAttribute('data-gccw')) pin(t, load()[tkey(t)] || {}); h.classList.add('on'); }
    th.style.setProperty('--gccw', Math.max(+th.getAttribute('data-gcmin') || 36, Math.round(w0 + ev.pageX - x0)) + 'px'); t.style.setProperty('--gccwt', total(t) + 'px');
  }
  function up(){
    D.removeEventListener('mousemove', mv, true); D.removeEventListener('mouseup', up, true); h.classList.remove('on'); DRAG = false;
    if (!moved) return;
    var all = load(), k = tkey(t); all[k] = all[k] || {}; all[k][ckey(th)] = Math.round(parseFloat(th.style.getPropertyValue('--gccw')) || th.offsetWidth);
    var keep = all[k]; delete all[k]; all[k] = keep; save(all);   /* newest table last: the oldest go first past 40 */
    t.setAttribute('data-gccw-sig', ''); apply(t);
  }
  D.addEventListener('mousemove', mv, true); D.addEventListener('mouseup', up, true);
}, true);
D.addEventListener('click', function(e){ if (e.target && e.target.classList && e.target.classList.contains('gccw-h')) stop(e); }, true);   /* not a sort */
D.addEventListener('dblclick', function(e){
  var h = e.target; if (!h || !h.classList || !h.classList.contains('gccw-h')) return; stop(e);
  var th = h.parentElement, t = th.closest('table'), all = load(), k = tkey(t);
  if (all[k]) { delete all[k][ckey(th)]; if (!Object.keys(all[k]).length) delete all[k]; save(all); }
  t.removeAttribute('data-gccw'); t.removeAttribute('data-gccw-sig'); apply(t);
}, true);
SI.call(W, tick, 1000);
W._gcColW = { tick: tick, load: load, key: tkey, reset: function(){ try { localStorage.removeItem(LK()); } catch (e) {} tick(); } };
})(window);
</script>
