<script>/*__GC_PATCH_SAMEJOB__ (owner 11/9, screenshot: "Coahoma CC - New Dormitory" and "New Female Dormitory - Coahoma Community College"
  from two GCs: "these are same jobs, just came in different — if something is like this ask if they are same jobs when entering if they
  seem very very similar; sometimes they would be different and not same job, just at same place").
  BIDMERGE joins a project's leads by itself only when it is sure (same board id / bid # / address / name). This asks about the
  ones that are VERY similar but not sure (different street lines, different city words): two open bid leads whose project names share
  2+ telling words (not "school", "building"…) or most of their words, bid due within 5 days, no different bid numbers.
  Leads page, on top: "❓ Same job?" A ⟷ B — ✓ Same job (combine: one lead, every GC and trade kept, the copy in 🗑 Recently deleted,
  ↩ Undo) · ✗ Different jobs (never asked again for that pair). Only admins / the office (who may merge) are asked. */
(function(W){
'use strict';
var D = W.document;
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function leads(){ return (W._crm && W._crm.leads) || []; }
function core(){ return W._gcBidMergeCore || (W._gcBidMerge && W._gcBidMerge.core) || null; }
function arr(v){ return Array.isArray(v) ? v : []; }
function pairs(){
  var C = core(); if (!C) return [];
  var L = leads().filter(function(l){ return l && l.id && C.liveLead(l) && C.isBidLead(l); });
  var sure = {}; try { arr(W._gcBidMerge && W._gcBidMerge.groups()).forEach(function(g){ arr(g.ids).forEach(function(a){ arr(g.ids).forEach(function(b){ sure[a + '|' + b] = 1; }); }); }); } catch (e) {}
  var I = L.map(function(l){ return C.info(l); }), out = [];
  for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) {
    var a = L[i], b = L[j], A = I[i], B = I[j];
    if (sure[a.id + '|' + b.id]) continue;
    if (arr(a.notSameAs).indexOf(b.id) > -1 || arr(b.notSameAs).indexOf(a.id) > -1) continue;
    if (A.no && B.no && A.no !== B.no) continue;
    var gap = C.gapDays(A.due, B.due); if (gap != null && gap > 5) continue;
    var ta = C.titleInfo(a.name || a.title || '', '').tokens, tb = C.titleInfo(b.name || b.title || '', '').tokens;   /* place words kept: "Coahoma" */
    var t = C.titleSim(ta, tb); t = { shared: t.shared + acro(ta, tb) + acro(tb, ta), j: t.j };
    if (!(t.shared >= 2 || (t.shared >= 1 && t.j >= 0.5))) continue;
    var r = C.same(a, b, A, B); if (r && r.ok) continue;   /* BIDMERGE is sure — it joins them itself */
    out.push({ a: a, b: b, why: 'names share ' + t.shared + ' telling word' + (t.shared === 1 ? '' : 's') + (gap != null ? ', due ' + (gap ? gap + ' day' + (gap === 1 ? '' : 's') + ' apart' : 'the same day') : '') + (A.street && B.street && A.street !== B.street ? ', different street lines' : '') });
  }
  return out.slice(0, 5);
}
/* "cc" in one name ~ "community college" in the other */
function acro(x, y){ var n = 0; x.forEach(function(w){ if (!/^[a-z]{2,4}$/.test(w) || y.indexOf(w) > -1) return; for (var i = 0; i + w.length <= y.length; i++) { if (y.slice(i, i + w.length).map(function(z){ return z[0]; }).join('') === w) { n++; return; } } }); return n; }
function can(){ try { return W._gcBidMerge && W._gcBidMerge.can ? !!W._gcBidMerge.can() : false; } catch (e) { return false; } }
function notSame(a, b){
  var now = new Date().toISOString();
  var f = function(list){ return (list || []).map(function(l){ if (!l || (l.id !== a && l.id !== b)) return l; var n = Object.assign({}, l), o = arr(n.notSameAs).slice(), other = l.id === a ? b : a; if (o.indexOf(other) < 0) o.push(other); n.notSameAs = o; n.updatedAt = now; return n; }); };
  if (W._setLeads) W._setLeads(f); else if (W._crm) W._crm.leads = f(W._crm.leads);
  try { if (W._gcApplySync && W._crm) W._gcApplySync('leads', W._crm.leads); } catch (e) {}
}
function line(l){ return '<b>' + esc(l.name || l.title || 'Lead') + '</b><div style="font-size:12px;color:#64748b">' + esc([l.address, l.gc || l.dueToCompany].filter(Boolean).join(' · ')) + '</div>'; }
var SIG = '';
function paint(){
  try {
    var hub = D.getElementById('gc-leads-hub'), cur = D.getElementById('gc-sj');
    if (!hub || !can()) { if (cur) cur.remove(); return; }
    var P = pairs(), sig = P.map(function(p){ return p.a.id + '~' + p.b.id; }).join(',');
    if (!P.length) { if (cur) cur.remove(); SIG = ''; return; }
    if (!cur) { cur = D.createElement('div'); cur.id = 'gc-sj'; cur.setAttribute('data-gc-keep', '1'); cur.style.cssText = 'background:#fffbeb;border:1px solid #fcd34d;border-left:4px solid #d97706;border-radius:12px;padding:10px 14px;margin:0 0 10px;font:14px Inter,Arial,sans-serif;color:#0f172a'; }
    if (sig !== SIG || !cur.innerHTML) {
      SIG = sig; cur._p = P;
      cur.innerHTML = '<div style="font-weight:800;margin-bottom:4px">❓ Same job? ' + P.length + ' pair' + (P.length === 1 ? '' : 's') + ' of bid leads look very alike</div>' + P.map(function(p, i){
        return '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;border-top:1px solid #fde68a;padding:8px 0"><div>' + line(p.a) + '</div><div style="color:#b45309">⟷</div><div>' + line(p.b) + '</div>' +
          '<div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span style="font-size:12px;color:#92400e">' + esc(p.why) + '</span><span style="flex:1"></span>' +
          '<button type="button" data-sj-same="' + i + '" style="border:0;background:#0F1D2F;color:#fff;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;min-height:36px">✓ Same job — combine</button>' +
          '<button type="button" data-sj-diff="' + i + '" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;min-height:36px">✗ Different jobs</button></div></div>'; }).join('');
    }
    if (cur.parentElement !== hub) hub.insertBefore(cur, hub.firstChild);
  } catch (e) {}
}
D.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target.closest('#gc-sj [data-sj-same], #gc-sj [data-sj-diff]') : null; if (!t) return;
  var cur = D.getElementById('gc-sj'), P = (cur && cur._p) || [], same = t.hasAttribute('data-sj-same'), p = P[+t.getAttribute(same ? 'data-sj-same' : 'data-sj-diff')]; if (!p) return;
  if (!same) { notSame(p.a.id, p.b.id); SIG = ''; setTimeout(paint, 300); return; }
  var C = core(), ra = C.received(p.a) || 9e15, rb = C.received(p.b) || 9e15, keep = ra <= rb ? p.a : p.b;
  t.disabled = true; t.textContent = 'Combining…';
  Promise.resolve(W._gcBidMerge.apply([{ keeper: keep.id, ids: [p.a.id, p.b.id] }])).then(function(){ SIG = ''; setTimeout(paint, 400); }, function(){ t.disabled = false; });
});
setInterval(paint, 2500);
W._gcSameJob = { pairs: pairs, notSame: notSame, paint: paint };
})(window);
</script>
