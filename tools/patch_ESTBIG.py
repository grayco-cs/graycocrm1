#!/usr/bin/env python3
"""Idempotent patch ESTBIG: one estimate ("Shelby Farms Park Operation Center") had grown to 6,440 lines (2.8 MB) that are
56 copies of the same 115 lines; opening it froze the CRM for 40-70 s.

Cause: the old "no duplicates anywhere" sweep (ALLNODUPES, build 33.94) merged copies of an estimate (same name, date and
lines) with absorbAll(), which joins two arrays and drops only entries that are byte-for-byte the same. Every copy of an
estimate gives its lines new ids, so no line was ever "the same" and the survivor got every copy's lines appended
(lines, mats, labor). Estimates were taken out of that sweep in 33.150, but absorbAll still appends line arrays for every
other list it merges, and the estimate heal / rescue still pick "the copy with the most lines", which would bring a
bloated copy back over a cleaned one.

  a) absorbAll never appends another record's line items (lines, mats, labor, materials, lineItems, items): the survivor
     keeps its own (it takes the other record's only when it has none). The heal (combine + second pass) and the
     rescue (_gcFindMyEstimates) count DIFFERENT lines, not raw lines, so a cleaned copy is never replaced by a copy
     that only has more duplicates.
  b) the Estimate Builder draws a long estimate (over 400 lines) 100 lines first, then "Show 100 more"; totals still
     count every line. The estimate detail overlay and the builder's Material List show the first 300 lines (subtotals and
     totals use every line).
  c) _gcEstDedupe({ dryRun: true }) -- admin console helper: lists estimates whose lines repeat and what one copy of each
     line would total. The real run needs confirm: "DEDUPE <n>", backs up each estimate in gc_kv
     (gc_estbig_backup__<date>__<id>) first, changes only estimates whose stored total equals the de-duplicated total
     (others are "owner to check"; pass include: [ids] to take them too), and saves through the estimate save path.
No new timers or polling.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch ESTBIG */'
if MARK in t:
    print('ESTBIG: already patched'); sys.exit(0)


def once(src, a, b):
    c = src.count(a)
    assert c == 1, 'ESTBIG: expected 1 of %r, found %d' % (a[:90], c)
    return src.replace(a, b)


# ── a1) ALLNODUPES absorbAll: line items are never appended from another record ──────────────────────────────
t = once(t, "function absorbAll(keep, gone){",
         "var ESTBIG_LINEF = { lines:1, mats:1, labor:1, materials:1, lineItems:1, items:1 };   " + MARK + "\n"
         "function absorbAll(keep, gone){")
t = once(t, "        /* merge the two lists without repeating anything */",
         "        /* patch ESTBIG: one record's line items are never appended to another's (each copy gives its lines new ids, so\n"
         "           nothing matched and one estimate grew to 6,440 lines from 56 copies of 115): the survivor keeps its own */\n"
         "        if(ESTBIG_LINEF[k] && kv.length) return;\n"
         "        /* merge the two lists without repeating anything */")

# ── a2) estimate heal: a copy with more lines only wins when it has more DIFFERENT lines ──────────────────────
t = once(t, "  function contentScore(e){",
         "  /* patch ESTBIG: how many DIFFERENT lines a list holds (what is shown and priced; never the id a copy was given) */\n"
         "  function ebDistinct(L){\n"
         "    var s={}, n=0;\n"
         "    (Array.isArray(L)?L:[]).forEach(function(l){\n"
         "      var k; try{ k = (l && typeof l==='object') ? JSON.stringify([String(l.desc||l.name||'').replace(/\\s+/g,' ').trim(), parseFloat(l.qty!=null?l.qty:l.hrs)||0,\n"
         "        parseFloat(l.cost!=null?l.cost:(l.uc!=null?l.uc:l.rate))||0, String(l.type||''), String(l.cat||''), String(l.mult||''), String(l.unit&&l.name?l.unit:'')]) : JSON.stringify(l); }catch(e){ k=String(Math.random()); }\n"
         "      if(!s[k]){ s[k]=1; n++; }\n"
         "    });\n"
         "    return n;\n"
         "  }\n"
         "  window._gcEstDistinctN = ebDistinct;\n"
         "  function contentScore(e){")
t = once(t, "      out[f] = (nv.length >= ov.length) ? nv : ov;",
         "      out[f] = (nv.length >= ov.length || (nv.length && ebDistinct(nv) >= ebDistinct(ov))) ? nv : ov;   " + MARK)
t = once(t, "            if(rich > have) m[f] = best[f];",
         "            if(rich > have && !(have && ebDistinct(m[f]) >= ebDistinct(best[f]))) m[f] = best[f];   " + MARK)

# ── a3) estimate rescue (_gcFindMyEstimates): the same rule ───────────────────────────────────────────────────
t = once(t, "        if(!prev || score(e) > score(prev)){",
         "        var _ebD = window._gcEstDistinctN, _ebMore = function(x){ return (_ebD ? _ebD(x.lines)+_ebD(x.mats)+_ebD(x.labor) : score(x)); };   " + MARK + "\n"
         "        if(!prev || (score(e) > score(prev) && _ebMore(e) > _ebMore(prev))){")
t = once(t, "            if(r>h) m[f]=best[f];",
         "            if(r>h && !(h && window._gcEstDistinctN && window._gcEstDistinctN(m[f]) >= window._gcEstDistinctN(best[f]))) m[f]=best[f];   " + MARK)

# ── b1) Estimate Builder: draw a long estimate 300 lines at a time ────────────────────────────────────────────
t = once(t, "  wrap.innerHTML=lines.map(l=>{try{",
         "  /* patch ESTBIG: an estimate of more than 400 lines draws its first 100, then 100 more per click (6,440 lines took 40 s+\n"
         "     to draw and froze the page); totals and the summary still count every line */\n"
         "  var _ebN=lines.length, _ebCap=_ebN>400?Math.min(_ebN,Math.max(100,parseInt(window.__gcEstShown,10)||100)):_ebN, _ebMore='';\n"
         "  if(_ebCap<_ebN){\n"
         "    for(var _ebi=_ebCap;_ebi<_ebN;_ebi++){ var _ebl=lines[_ebi]; if(_ebl&&_ebl.id){ _ebl.cost=parseFloat(_ebl.cost)||0; _ebl.qty=parseFloat(_ebl.qty)||1; _ebl.cat=_ebl.cat||'General'; _ebl.type=_ebl.type||'labor'; _ebl.desc=_ebl.desc||'(no description)'; } }\n"
         "    var _ebD=window._gcEstDistinctN?window._gcEstDistinctN(lines):_ebN;\n"
         "    _ebMore='<div class=\"el\" id=\"gc-estbig-more\" style=\"text-align:center;padding:.6rem;font-size:12px;color:var(--text2)\">Showing '+_ebCap+' of '+_ebN+' lines. '\n"
         "      +'<button class=\"btn sm\" onclick=\"window.__gcEstShown='+(_ebCap+100)+';renderLines()\">Show '+Math.min(100,_ebN-_ebCap)+' more</button>'\n"
         "      +(_ebD<_ebN?' <span style=\"color:var(--amber)\">Only '+_ebD+' of these lines are different; the rest are copies and the totals count every copy. Do not save or send this estimate until the office cleans it up.</span>':'')+'</div>';\n"
         "  }\n"
         "  wrap.innerHTML=lines.slice(0,_ebCap).map(l=>{try{")
t = once(t, "  }).join('');\n  // FOCUS RESTORE",
         "  }).join('')+_ebMore;   " + MARK + "\n  // FOCUS RESTORE")
t = once(t, "  sw('est',document.querySelectorAll('.tab')[0]);renderLines();renderSummary();updJM();",
         "  window.__gcEstShown=100;   " + MARK + "\n"
         "  sw('est',document.querySelectorAll('.tab')[0]);renderLines();renderSummary();updJM();")

# ── b2) estimate detail overlay: the first 300 lines (subtotals and the total still use every line) ──────────
t = once(t, "    var tradesHTML='';",
         "    var tradesHTML='', _ebLeft=300;   " + MARK)
t = once(t, "        var rows=info.byTrade[t].map(function(l){",
         "        var _ebAll=info.byTrade[t], _ebShow=_ebAll.slice(0,Math.max(0,_ebLeft)); _ebLeft-=_ebShow.length;\n"
         "        var rows=_ebShow.map(function(l){")
t = once(t, "        }).join('');\n        var sub=info.byTrade[t].reduce(",
         "        }).join('')+(_ebShow.length<_ebAll.length?'<tr><td colspan=\"3\" style=\"padding:4px 8px;color:#678;font-style:italic\">+ '+(_ebAll.length-_ebShow.length)+' more line(s) \\u2014 open in Estimate Builder to see every line</td></tr>':'');\n"
         "        var sub=info.byTrade[t].reduce(")

# ── b3) the builder's Material List (drawn with the estimate): the first 300 material lines; totals use every line ──
t = once(t, "  let grandTotal=0;\n  cats.forEach(cat=>{\n    const catLines=matLines.filter(l=>l.cat===cat);",
         "  let grandTotal=0, _ebRows=0;   " + MARK + "\n  cats.forEach(cat=>{\n    const catLines=matLines.filter(l=>l.cat===cat);")
t = once(t, "    catLines.forEach(l=>{\n      const lTotal=l.cost*l.qty,lTaxed=taxed(lTotal);\n      html+=`<div style=\"display:flex;justify-content:space-between;align-items:start;padding:5px 0;",
         "    catLines.forEach(l=>{\n      if(++_ebRows>300) return;\n      const lTotal=l.cost*l.qty,lTaxed=taxed(lTotal);\n      html+=`<div style=\"display:flex;justify-content:space-between;align-items:start;padding:5px 0;")
t = once(t, "  const grandTaxed=taxed(grandTotal);\n  html+=`<div style=\"display:flex;justify-content:space-between;font-weight:700;font-size:14px;border-top",
         "  const grandTaxed=taxed(grandTotal);\n  if(_ebRows>300) html+='<div style=\"padding:6px 0;font-size:11px;color:var(--text2);font-style:italic\">Showing the first 300 of '+_ebRows+' material lines (the totals count every line). Print the list to see every line.</div>';\n  html+=`<div style=\"display:flex;justify-content:space-between;font-weight:700;font-size:14px;border-top")

# ── c) the clean-up helper ─────────────────────────────────────────────────────────────────────────────────────
TOOL = r"""})();
</script>
<script id="gc-patch-estbig">
/* __GC_PATCH_ESTBIG__ — estimates whose lines are copies of themselves, admin-run only, dry run first:
   _gcEstDedupe({ dryRun: true })  then  _gcEstDedupe({ confirm: "DEDUPE <n>" })  (tools/patch_ESTBIG.py) */
(function(){
'use strict';
if (window.__GC_ESTBIG__) return; window.__GC_ESTBIG__ = true;
var W = window;
function creds(){ try { return { u: (localStorage.getItem('grayco_sb_url') || '').replace(/\/$/, ''), k: localStorage.getItem('grayco_sb_key') || '' }; } catch (e) { return { u: '', k: '' }; } }
function H(c){ return { apikey: c.k, Authorization: 'Bearer ' + c.k }; }
async function getRow(c, key){
  var r = await fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value,updated_at', { headers: H(c), cache: 'no-store' });
  if (!r || !r.ok) throw new Error('read ' + key + ' ' + (r && r.status));
  var rows = await r.json(); if (!Array.isArray(rows)) throw new Error('read ' + key);
  if (!rows.length) return undefined;
  var v = rows[0].value; if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { v = JSON.parse(v); } catch (e) {} }
  return v;
}
async function putRow(c, key, value){
  var r = await fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, H(c)), body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
  if (!r || !r.ok) throw new Error('write ' + key + ' ' + (r && r.status));
}
function arr(v){ if (typeof v === 'string' && /^\s*\[/.test(v)) { try { v = JSON.parse(v); } catch (e) {} } return Array.isArray(v) ? v : []; }
function num(v){ var x = parseFloat(v); return isFinite(x) ? x : 0; }
function sp(s){ return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function r2(x){ return Math.round(x * 100) / 100; }
/* the same line: everything that is shown or priced -- never the id a copy was given, never a note */
function keyLine(l){ return JSON.stringify([sp(l.desc), num(l.qty), num(l.cost), String(l.type || 'labor'), String(l.cat || 'General'), String(l.mult || 'type')]); }
function keyMat(m){ return JSON.stringify([sp(m.name || m.desc), num(m.qty), num(m.uc != null ? m.uc : m.cost), String(m.cat || 'General'), String(m.unit || '')]); }
function keyLab(l){ return JSON.stringify([sp(l.desc), num(l.hrs), num(l.rate), String(l.cat || 'General')]); }
var FILL = ['calcNote', 'unit', 'sku', 'notes', 'supplier'];
/* one copy of each line, in order, the first copy kept; a note only a later copy has is carried onto it; quantities are NOT added up */
function dedupe(list, keyf){
  var seen = {}, out = [];
  (Array.isArray(list) ? list : []).forEach(function(x){
    if (!x || typeof x !== 'object') { out.push(x); return; }
    var k; try { k = keyf(x); } catch (e) { out.push(x); return; }
    var at = seen[k];
    if (at === undefined) { seen[k] = out.length; out.push(x); return; }
    FILL.forEach(function(p){ var f = out[at]; if ((f[p] === undefined || f[p] === '') && x[p] != null && x[p] !== '') { if (!f.__ebCopy) { f = Object.assign({}, f); Object.defineProperty(f, '__ebCopy', { value: 1 }); out[at] = f; } f[p] = x[p]; } });
  });
  return out;
}
/* the builder's own sums (lineBaseCost / lineCharge), with this estimate's settings */
function sums(e, lines){
  var st = Object.assign({ tax: 9.75, matMult: 1.3, labMult: 1.5, subMult: 1.5, eqMult: 1.3, mhCost: 44.44, mhCharge: 75, jobState: '', msContractorTax: 3.5 }, e.settings || {});
  function tm(t){ return t === 'material' ? st.matMult : t === 'labor' ? st.labMult : t === 'sub' ? st.subMult : t === 'mh' ? 1 : t === 'equipment' ? st.eqMult : st.labMult; }
  function base(l){ var t = l.type || 'labor', q = num(l.qty), c = num(l.cost); if (t === 'mh') return q * (num(st.mhCost) || 44.44); var raw = c * q, b = t === 'material' ? raw * (1 + num(st.tax) / 100) : raw; return st.jobState === 'MS' ? b * (1 + (num(st.msContractorTax) || 3.5) / 100) : b; }
  function mult(l){ var t = l.type || 'labor'; if (t === 'mh') return 1; if (l.mult && l.mult !== 'type') { var m = parseFloat(l.mult); if (!isNaN(m) && m > 0) return m; } if (e.useOvr) return num(e.ovrMult) || 1.5; var jm = e.jobMult || 'mat'; return (jm === 'mat') ? tm(t) : (parseFloat(jm) || 1); }
  var cost = 0, charge = 0;
  (lines || []).forEach(function(l){ if (!l) return; var t = l.type || 'labor'; cost += base(l); charge += (t === 'mh') ? num(l.qty) * (num(st.mhCharge) || 75) : base(l) * mult(l); });
  return { cost: r2(cost), charge: r2(charge) };
}
function partsSum(mats, labor){ var s = 0; (mats || []).forEach(function(m){ if (m) s += num(m.qty) * num(m.uc != null ? m.uc : m.cost); }); (labor || []).forEach(function(l){ if (l) s += num(l.hrs) * num(l.rate); }); return r2(s); }
function size(v){ try { return JSON.stringify(v).length; } catch (e) { return 0; } }
function plan(list){
  var out = [];
  list.forEach(function(e){
    if (!e || typeof e !== 'object' || !e.id) return;
    var L = arr(e.lines), M = arr(e.mats), B = arr(e.labor);
    var L2 = dedupe(L, keyLine), M2 = dedupe(M, keyMat), B2 = dedupe(B, keyLab);
    if (L2.length === L.length && M2.length === M.length && B2.length === B.length) return;
    var stored = { cost: r2(num(e.totalCost)), charge: r2(num(e.totalCharge)) };
    var all = sums(e, L), one = sums(e, L2), why = '', changes;
    if (L.length && stored.charge > 0) {
      changes = Math.abs(one.charge - stored.charge) > 0.05 || (stored.cost > 0 && Math.abs(one.cost - stored.cost) > 0.05);
      why = changes ? ('one copy of each line totals $' + one.charge.toFixed(2) + ', the estimate says $' + stored.charge.toFixed(2) + ' -- the repeated lines may be real (owner to check)')
                    : ('the estimate\'s total ($' + stored.charge.toFixed(2) + ') is the total of one copy of each line: the repeats are copies');
    } else {
      var pa = partsSum(M, B), pb = partsSum(M2, B2);
      changes = Math.abs(pa - pb) > 0.05 || Math.abs(all.charge - one.charge) > 0.05;
      why = changes ? 'no stored total to compare; removing the repeats changes the sum of the items (owner to check)' : 'removing the repeats does not change the sum of the items';
    }
    out.push({ id: String(e.id), name: String(e.name || e.num || ''), lines: [L.length, L2.length], mats: [M.length, M2.length], labor: [B.length, B2.length],
      bytes: [size(e), size(Object.assign({}, e, { lines: L2, mats: M2, labor: B2 }))], totalStored: stored, totalAllLines: all, totalAfter: one,
      totalChanges: !!changes, ownerToCheck: !!changes, why: why, _new: { lines: L2, mats: M2, labor: B2 } });
  });
  return out;
}
function ymd(){ return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }
var running = false;
W._gcEstDedupe = async function(opt){
  opt = opt || {};
  if (running) return { result: 'skipped: already running' };
  running = true;
  var rep = { at: new Date().toISOString(), by: '', dryRun: opt.dryRun !== false && !opt.confirm, estimates: [] };
  try {
    if (!(W.__GC_AUTH__ && typeof W.__GC_AUTH__.isAdmin === 'function' && W.__GC_AUTH__.isAdmin())) throw new Error('admins only');
    try { rep.by = W.__GC_AUTH__.email() || ''; } catch (e) {}
    var c = creds(); if (!c.u || !c.k) throw new Error('not connected to the cloud');
    if (W._gcHeavy && !W._gcHeavy.loaded()) await W._gcHeavy.load('estimate line clean-up');
    var list = arr(await getRow(c, 'estimates'));
    if (!list.length) throw new Error('no estimates in the cloud row');
    var p = plan(list), inc = {}; arr(opt.include).forEach(function(id){ inc[String(id)] = 1; });
    var todo = p.filter(function(x){ return !x.ownerToCheck || inc[x.id]; });
    rep.estimates = p.map(function(x){ var o = Object.assign({}, x); delete o._new; o.willChange = todo.indexOf(x) >= 0; return o; });
    rep.n = todo.length; rep.confirmWith = 'DEDUPE ' + todo.length;
    if (rep.dryRun) { rep.result = 'dry run: nothing written (' + p.length + ' estimate(s) with repeated lines; ' + todo.length + ' would change; real run: _gcEstDedupe({ confirm: "DEDUPE ' + todo.length + '" }))'; return rep; }
    if (opt.confirm !== 'DEDUPE ' + todo.length) throw new Error('confirm must be exactly "DEDUPE ' + todo.length + '" -- nothing written');
    if (!todo.length) { rep.result = 'nothing to change'; return rep; }
    try { if (W._gcManualNow) W._gcManualNow('estimate line clean-up'); } catch (e) {}
    /* 1) a backup of each estimate, in the cloud, read back before anything is changed */
    var now = new Date().toISOString(), fixed = {};
    rep.backups = [];
    for (var i = 0; i < todo.length; i++) {
      var x = todo[i], orig = list.filter(function(e){ return e && String(e.id) === x.id; })[0];
      var bk = 'gc_estbig_backup__' + ymd() + '__' + x.id.replace(/[^A-Za-z0-9_-]/g, '_');
      await putRow(c, bk, { at: now, by: rep.by, why: 'estimate before the ESTBIG line clean-up (restore: put "estimate" back in the estimates list)', estimate: orig });
      var back = await getRow(c, bk);
      if (!back || !back.estimate || arr(back.estimate.lines).length !== arr(orig.lines).length) throw new Error('backup ' + bk + ' did not read back -- nothing changed');
      rep.backups.push(bk);
      fixed[x.id] = Object.assign({}, orig, x._new, { savedAt: now, updatedAt: now,
        _linesDeduped: { at: now, by: rep.by, lines: x.lines, mats: x.mats, labor: x.labor, backup: bk } });
    }
    var next = list.map(function(e){ return (e && fixed[String(e.id)]) || e; });
    /* 2) save the way an estimate save does: the builder's store (its save hook mirrors it everywhere), this computer's
          estimates list and screen, then the cloud now */
    var json = JSON.stringify(next);
    try { if (W.storage && typeof W.storage.set === 'function') await W.storage.set('gc_ests_v2', json, true); } catch (e) {}
    try { if (W.idbSet) await W.idbSet('estimates', next); } catch (e) {}
    try { if (W._gcApplySync) W._gcApplySync('estimates', next); } catch (e) {}
    try { if (W._crm) W._crm.estimates = next; } catch (e) {}
    try { if (W._gcSetEstimates) W._gcSetEstimates(next); } catch (e) {}
    W.__GC_FORCE_PUSH__ = true;
    try {
      if (W._gcSbPush) await W._gcSbPush('estimates', next);
      else if (W._supaUpsertNow) await W._supaUpsertNow('estimates', next);
    } catch (e) {} finally { W.__GC_FORCE_PUSH__ = false; }
    /* 3) read the cloud back: each cleaned estimate must be there with one copy of each line */
    var ok = function(rows){ var by = {}; arr(rows).forEach(function(e){ if (e && e.id) by[String(e.id)] = e; }); return todo.every(function(x){ var e = by[x.id]; return e && arr(e.lines).length === x.lines[1] && arr(e.mats).length === x.mats[1] && arr(e.labor).length === x.labor[1]; }); };
    rep.saved = 'estimate save path';
    if (!ok(await getRow(c, 'estimates'))) { await putRow(c, 'estimates', next); rep.saved = 'direct write (the save path did not reach the cloud)'; if (!ok(await getRow(c, 'estimates'))) throw new Error('the cleaned estimates did not reach the cloud (backups: ' + rep.backups.join(', ') + ')'); }
    try { if (W._gcReloadEstimatorData && !W.__GC_EST_BUILDER_OPEN__) await W._gcReloadEstimatorData(); } catch (e) {}
    rep.result = 'cleaned ' + todo.length + ' estimate(s)';
    try { await putRow(c, 'gc_estbig_v1', rep); } catch (e) {}
    return rep;
  } catch (e) {
    rep.result = 'stopped: ' + (e && e.message || e);
    return rep;
  } finally {
    running = false; W._gcEstDedupeReport = rep;
    try { console.log('%c[GC] estimate line clean-up: ' + rep.result, 'background:#0f2440;color:#fff;padding:2px 6px', rep); } catch (e) {}
  }
};
W._gcEstDedupe.plan = function(list){ return plan(arr(list)).map(function(x){ var o = Object.assign({}, x); delete o._new; return o; }); };
})();
</script>
<script id="gc-patch-storecut-tools">"""
t = once(t, '})();\n</script>\n<script id="gc-patch-storecut-tools">', TOOL)

open(p, 'w', encoding='utf-8').write(t)
print('ESTBIG: patched')
