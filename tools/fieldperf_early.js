/* __GC_PATCH_FIELDPERF_EARLY__ — FIELDPERF: GrayCo Field answers a tap at once on a phone.   (patch FIELDPERF)
   Owner 11/16: "It's lagging very bad we're testing field view this week it needs to be tested heavy."
   Measured (an emulated iPhone, CPU ×4, a company-sized data set: 550 jobs, 400 leads, 400 expense approvals…): sitting on
   the Field home kept the phone busy 4.5 s of every 10 s and a tap took 0.5–2.5 s. The biggest costs were background loops
   that looked a record up by id with a full scan of the list, once per row of another list (550 × 550 every 1–2 s), and
   a loop that never remembered a row it had already looked at.
   window.__gcById(list, id): the record with that id (the FIRST one, as list.filter(...)[0] gave), from an index kept per
   list (a WeakMap; rebuilt when the list changed: the row at the remembered place must still have that id, else the index
   is made again). The same answer as the scan, without the scan. */
(function(){
'use strict';
var W = window;
if (W.__gcById) return;
var IX = typeof WeakMap === 'function' ? new WeakMap() : null;
function build(list){ var m = new Map(); for (var i = 0; i < list.length; i++) { var r = list[i]; if (r && typeof r === 'object' && r.id != null) { var k = String(r.id).trim(); if (!m.has(k)) m.set(k, i); } } var o = { m: m, n: list.length }; IX.set(list, o); return o; }
W.__gcById = function(list, id){
  if (!Array.isArray(list) || id == null) return null;
  var k = String(id).trim(); if (!k) return null;
  if (!IX || typeof Map !== 'function') { for (var j = 0; j < list.length; j++) { var x = list[j]; if (x && typeof x === 'object' && String(x.id == null ? '' : x.id).trim() === k) return x; } return null; }
  var o = IX.get(list) || build(list), i = o.m.get(k), r;
  if (i != null) { r = list[i]; if (r && typeof r === 'object' && String(r.id == null ? '' : r.id).trim() === k && o.n === list.length) return r; }
  o = build(list);   /* a miss or a moved row: index again (a miss costs one scan, as before) */ i = o.m.get(k); return i != null ? list[i] : null;
};
/* window.__gcFpTouch(): when a finger / the mouse last went down or came up (GrayCo Field holds a re-render until it is off) */
var touchAt = 0;
var mark = function(e){ if (e && e.isTrusted === false) return; touchAt = Date.now(); };
try { ['pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(function(ev){ document.addEventListener(ev, mark, { capture: true, passive: true }); }); } catch (e) {}
W.__gcFpTouch = function(){ return touchAt; };
})();
