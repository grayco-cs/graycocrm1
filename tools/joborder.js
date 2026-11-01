/* patch JOBORDER (owner 11/01: "I don't even want on the PMs to have jobs showing that they lost, only show jobs active or
   bidding default, jobs finished you can show but far down the list, always show jobs up top and first as active/bidding").
   One order for every job list (display only: no job is changed):
     active-type (active, approved, in progress, on hold) → bidding (bidding, estimating) → anything else → finished
     (completed / complete / closed) → lost; inside each group the most recent activity first. Status case does not matter.
   * finished jobs sit under a collapsed "▸ Finished (n)" row at the bottom of the list;
   * lost jobs: a PM never sees them; admins / office see them only behind a small "Show lost (n)" at the very bottom;
   * the job pickers in drop-downs list lost jobs last (a lost job already chosen still shows).
   Where: the desk Projects table (the React list: its order, its tab counts, a PM's list without lost), the dashboard's
   Active jobs card (order; a PM's card also lists his bidding jobs), the React job drop-downs, the message job picker, and
   every list that uses GrayCo Field's sort hook window._gcFPSort (Field "Pick a Job", the Field home, the role apps' desks),
   which this patch replaces with the same order. The folds are drawn by a small DOM layer (childList observers on each
   list, idempotent). API: window._gcJobOrder (cls, rank, sort, cmp, visible, pick, fold, state). */
(function(){
'use strict';
if (window.__GC_PATCH_JOBORDER__) return; window.__GC_PATCH_JOBORDER__ = true;
var W = window, D = document, MO = W.MutationObserver;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function warn(e){ try { console.warn('[GC JOBORDER]', e && e.message || e); } catch (x) {} }

/* ── the order ── */
var RANK = { active: 0, bidding: 1, other: 2, finished: 3, lost: 4 };
function cls(p){
  if (!p) return 'other';
  var st = low(p.status).replace(/[\s_-]+/g, ' ');
  if (/\blost\b|\bdead\b|cancel/.test(st)) return 'lost';
  if (/^(active|approved|in progress|inprogress|on hold|onhold|started|underway|production|working|scheduled|signed)$/.test(st)) return 'active';
  if (/^(bidding|estimating|estimate|pipeline|proposal|quoted|bid)$/.test(st)) return 'bidding';
  if (/complete|closed|finished|^done$|archiv/.test(st)) return 'finished';
  return 'other';
}
function rank(p){ return RANK[cls(p)]; }
function lastAt(p){
  if (!p) return 0;
  var best = 0; [p.updatedAt, p.savedAt, p.lastPhotoAt, p.lastLogAt, p.lastActivityAt, p.portalAt, p.jobStageAt].forEach(function(v){ var t = Date.parse(s(v)); if (t > best) best = t; });
  if (!best) [p.startDate, p.start, p.createdAt, p.created, p.dateCreated].some(function(v){ var t = Date.parse(s(v)); if (t) { best = t; return true; } return false; });
  return best;
}
/* xe: the Projects table's sort ({ k, d }); null / its default (start date, newest) = recency inside a group, else the column decides */
function cmp(a, b, xe){
  var r = rank(a) - rank(b); if (r) return r;
  if (!xe || (xe.k === 'startDate' && xe.d === 'desc')) return lastAt(b) - lastAt(a);
  return 0;
}
function sort(list){ return arr(list).map(function(p, i){ return { p: p, r: rank(p), t: lastAt(p), i: i }; }).sort(function(a, b){ return (a.r - b.r) || (b.t - a.t) || (a.i - b.i); }).map(function(x){ return x.p; }); }
function seesAll(){ try { if (typeof W._gcProjSeesAll === 'function') return !!W._gcProjSeesAll(); } catch (e) {} try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
/* a PM never sees lost jobs; admins / office keep them (folded behind "Show lost") */
function visible(list){ return seesAll() ? arr(list) : arr(list).filter(function(p){ return cls(p) !== 'lost'; }); }
/* drop-down pickers: the same order, lost last; one sorted copy per list (React hands the same array until it changes) */
var PICK = { src: null, out: null };
function pick(list){ if (!Array.isArray(list)) return list; if (PICK.src === list && PICK.out && PICK.out.length === list.length) return PICK.out; PICK.src = list; PICK.out = sort(list); return PICK.out; }

/* GrayCo Field's sort hook (Pick a Job, the Field home, the role apps' desks): this order, lost only for admins (last) */
var fpOld = W._gcFPSort;
W._gcFPSort = function(list){ try { return sort(visible(list)); } catch (e) { warn(e); return typeof fpOld === 'function' ? fpOld(list) : arr(list); } };

/* ── the folds: "▸ Finished (n)" and "Show lost (n)" at the bottom of a list ── */
function css(){
  if (D.getElementById('gc-jo-css')) return;
  var st = D.createElement('style'); st.id = 'gc-jo-css'; st.setAttribute('data-gc-keep', '1');
  st.textContent = '[data-gc-jo-box]:not([data-jo-fin]) > [data-gc-jo-f="finished"],[data-gc-jo-box]:not([data-jo-lost]) > [data-gc-jo-f="lost"],[data-gc-jo-f="hide"]{display:none!important}'
    + '.gc-jo-h{cursor:pointer;user-select:none}.gc-jo-h td,.gc-jo-hd{font:700 12px Inter,-apple-system,Segoe UI,sans-serif;color:#475569;background:#f8fafc;padding:7px 10px;border-top:1px solid #e2e8f0}'
    + '.gc-jo-hd{display:block;width:100%;text-align:left;border:1px dashed #cbd5e1;border-radius:10px;margin:6px 0;box-sizing:border-box}'
    + '#_gcJobPick .gc-jo-hd{background:#0f2440;color:#8fa8c4;border-color:#1e3a5f;padding:12px 14px;font-size:14px}'
    + '.gc-jo-h.lost td,.gc-jo-hd.lost{background:none;border:none;color:#94a3b8;font-weight:600;font-size:11px;text-decoration:underline}';
  (D.head || D.documentElement).appendChild(st);
}
function label(kind, n, open){ return kind === 'finished' ? (open ? '▾ ' : '▸ ') + 'Finished (' + n + ')' : (open ? 'Hide lost (' + n + ')' : 'Show lost (' + n + ')'); }
function setAttr(el, a, v){ if (v == null) { if (el.hasAttribute(a)) el.removeAttribute(a); } else if (el.getAttribute(a) !== v) el.setAttribute(a, v); }
/* box: the list element; items: its job rows (direct children) with their class; tr: table rows */
function fold(box, items){
  if (!box) return;
  css(); setAttr(box, 'data-gc-jo-box', '1');
  var tr = box.tagName === 'TBODY', admin = seesAll(), n = { finished: 0, lost: 0 }, first = {}, lower = false;
  items.forEach(function(x){
    var k = x.k;
    if (k === 'lost' && !admin) { setAttr(x.el, 'data-gc-jo-f', 'hide'); return; }
    if (k === 'finished' || k === 'lost') { n[k]++; if (!first[k]) first[k] = x.el; }
    else lower = true;
  });
  ['finished', 'lost'].forEach(function(kind){
    var on = lower || (kind === 'lost' && n.finished > 0);   /* a list of only finished (or only lost) jobs is not folded */
    var head = box.querySelector(':scope > [data-gc-jo-head="' + kind + '"]');
    items.forEach(function(x){ if (x.k === kind && (kind !== 'lost' || admin)) setAttr(x.el, 'data-gc-jo-f', on ? kind : null); });
    if (!on || !n[kind]) { if (head) head.remove(); return; }
    var open = box.hasAttribute(kind === 'finished' ? 'data-jo-fin' : 'data-jo-lost'), t = label(kind, n[kind], open);
    if (!head) {
      head = D.createElement(tr ? 'tr' : 'button'); head.setAttribute('data-gc-jo-head', kind); head.setAttribute('data-gc-keep', '1');
      if (tr) { head.className = 'gc-jo-h ' + kind; head.innerHTML = '<td colspan="40"></td>'; } else { head.type = 'button'; head.className = 'gc-jo-hd ' + kind; }
    }
    var tx = tr ? head.firstChild : head; if (tx.textContent !== t) tx.textContent = t;
    if (head.nextSibling !== first[kind]) box.insertBefore(head, first[kind]);
  });
}
D.addEventListener('click', function(ev){
  var h = ev.target && ev.target.closest && ev.target.closest('[data-gc-jo-head]'); if (!h) return;
  ev.preventDefault(); ev.stopPropagation();
  var box = h.parentElement, a = h.getAttribute('data-gc-jo-head') === 'finished' ? 'data-jo-fin' : 'data-jo-lost';
  if (box.hasAttribute(a)) box.removeAttribute(a); else box.setAttribute(a, '1');
  refold(box);
}, true);

/* the lists */
function projById(id){ var l = arr((W._crm || {}).projects); for (var i = 0; i < l.length; i++) if (l[i] && s(l[i].id) === s(id)) return l[i]; return null; }
function refold(box){
  try {
    if (box.tagName === 'TBODY') fold(box, Array.prototype.filter.call(box.children, function(r){ return r.hasAttribute('data-gc-jo'); }).map(function(r){ return { el: r, k: r.getAttribute('data-gc-jo') }; }));
    else fold(box, Array.prototype.filter.call(box.children, function(r){ return r.matches('._jpItem[data-id],.gc-ra-item.job'); }).map(function(r){ var b = r.matches('[data-id]') ? r : r.querySelector('[data-pid]'); return { el: r, k: cls(projById(b && (b.getAttribute('data-id') || b.getAttribute('data-pid')))) }; }));
  } catch (e) { warn(e); }
}
var boxes = [], busy = false;
function watchBox(box){
  if (!box || box.__gcJO) return; box.__gcJO = new MO(function(){ if (busy) return; busy = true; try { refold(box); } finally { busy = false; } });
  box.__gcJO.observe(box, { childList: true }); boxes.push(box); refold(box);
}
function scan(){
  boxes = boxes.filter(function(b){ if (b.isConnected) return true; if (b.__gcJO) b.__gcJO.disconnect(); b.__gcJO = null; return false; });
  var r = D.querySelector('#root tbody > tr[data-gc-jo]'); if (r) watchBox(r.parentElement);
  var jp = D.querySelector('#_gcJobPick ._jpItem'); if (jp) watchBox(jp.parentElement);
  var dj = D.querySelector('#gc-ra-desk .gc-ra-card[data-card="jobs"] .cb'); if (dj) watchBox(dj);
}
/* finding the lists: #root (React commits) and the page's top level (overlays); the callbacks only look for a new list */
var pend = false;
function soon(){ if (pend) return; pend = true; Promise.resolve().then(function(){ pend = false; try { scan(); } catch (e) { warn(e); } }); }
function start(){
  if (!MO) return;
  var root = D.getElementById('root');
  if (root) new MO(soon).observe(root, { childList: true, subtree: true });
  new MO(soon).observe(D.body, { childList: true });
  var desk = null; (W.__GC_NATIVE_SETINTERVAL__ || W.setInterval).call(W, function(){ var d = D.getElementById('gc-ra-desk'); if (d && d !== desk) { desk = d; new MO(soon).observe(d, { childList: true, subtree: true }); } }, 3000);
  scan();
}
if (D.body) start(); else D.addEventListener('DOMContentLoaded', start);

W._gcJOCls = cls; W._gcJORank = rank; W._gcJOCmp = cmp; W._gcJOPick = pick; W._gcJOVisible = visible;
W._gcJobOrder = { cls: cls, rank: rank, sort: sort, cmp: cmp, visible: visible, pick: pick, fold: refold, state: function(){ return { boxes: boxes.length, admin: seesAll() }; } };
try { console.log('[GC] Job lists: active → bidding → finished (folded) → lost (admins, folded) (patch JOBORDER) — _gcJobOrder'); } catch (e) {}
})();
