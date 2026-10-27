#!/usr/bin/env python3
"""Idempotent patch REGDUP: stop the register duplicate ping-pong.

1. CONTINUOUS MONEY DEDUP: when it drops same-link register rows it now tombstones the losers (the app's own
   _gcTombstone + the legacy gc_deleted_gcAcctRegister list), keeps the row with a vendor/payee and the earlier date,
   and if the exact same set of rows was removed last round and came back it does nothing more (log once; no redraw,
   no _gcPushAll). sig: (unlinked) rows keep exactly their old behaviour: removed, never tombstoned.
2. A one-time admin migration (flag gc_regdup_mig_v1) deletes the extra copy of each QuickBooks income row that has a
   same-link twin that is kept, through the register's own delete path, then cleans the cloud copy.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* REGDUP-FIX v1 */'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:70], s.count(old))
    return s.replace(old, new)

# ---- 1. dedupeArray: report the losers, optional chooser -------------------------------------------------------
OLD_DEDUPE = """  function dedupeArray(arr){
    if(!Array.isArray(arr)) return {out:arr, removed:0};
    var best={}, order=[], removed=0;
    arr.forEach(function(r){
      var k=moneyKey(r);
      if(k===null){ order.push(r); return; }         // unkeyable — leave as-is
      if(!best[k]){ best[k]=r; order.push(k); }
      else { best[k]=better(best[k], r); removed++; } // merge: keep the better row
    });
    if(!removed) return {out:arr, removed:0};
    var out=order.map(function(o){ return (typeof o==='string') ? best[o] : o; });
    return {out:out, removed:removed};
  }
"""
NEW_DEDUPE = MARK + """
  function cents(r){ return Math.round(Math.abs(parseFloat(r.amt!=null?r.amt:r.amount)||0)*100); }
  function hasWho(r){ return !!(((r.vendor||r.payee||'')+'').trim()); }
  // Register only: same rule as better(), but between two linked copies the owner keeps the one that has a
  // vendor/payee and the earlier date (the original), before looking at the job.
  function betterReg(a, b){
    var aAmt=cents(a), bAmt=cents(b);
    if((aAmt>0)!==(bAmt>0)) return aAmt>0 ? a : b;
    var aLink=(a.subInvId||a.srcInvId)?1:0, bLink=(b.subInvId||b.srcInvId)?1:0;
    if(aLink!==bLink) return aLink>bLink ? a : b;
    if(hasWho(a)!==hasWho(b)) return hasWho(a) ? a : b;
    var ad=(a.date||'')+'', bd=(b.date||'')+'';
    if(ad && bd && ad!==bd) return ad<bd ? a : b;
    var aJob=a.pid?1:0, bJob=b.pid?1:0;
    if(aJob!==bJob) return aJob>bJob ? a : b;
    return a;
  }

  function dedupeArray(arr, pick){
    if(!Array.isArray(arr)) return {out:arr, removed:0, losers:[]};
    var choose=pick||better, best={}, order=[], removed=0, losers=[];
    arr.forEach(function(r){
      var k=moneyKey(r);
      if(k===null){ order.push(r); return; }         // unkeyable — leave as-is
      if(!best[k]){ best[k]=r; order.push(k); }
      else { var w=choose(best[k], r); losers.push({row:(w===r?best[k]:r), key:k}); best[k]=w; removed++; } // merge: keep the better row
    });
    if(!removed) return {out:arr, removed:0, losers:[]};
    losers.forEach(function(l){ l.keep=best[l.key]; });
    var out=order.map(function(o){ return (typeof o==='string') ? best[o] : o; });
    return {out:out, removed:removed, losers:losers};
  }

  // A loser that shares a source link with the row we keep is the same money: delete it for good through the
  // register's own delete path (window._gcRegDeleteRows, defined by the REGDUP tail: tombstone in gc_tombstones +
  // the register delete list, local write, purge of the backup copies, cloud write), so a sync cannot put it back.
  // sig: groups are left exactly as before (removed, never tombstoned).
  var TRIED={};
  async function removeLinkLosers(losers){
    var list=[];
    try{
      losers.forEach(function(l){
        var r=l.row, k=l.keep;
        if(!r || !k || String(l.key).indexOf('link:')!==0) return;
        var tid=(r.id!=null&&r.id!=='')?String(r.id):((r._id!=null&&r._id!=='')?String(r._id):'');
        if(!tid) return;
        if((r.id!=null&&r.id!==''&&String(r.id)===String(k.id)) || (r._id&&String(r._id)===String(k._id))) return;  // same row twice: never kill the keeper
        var a=cents(r), b=cents(k); if(a!==0 && a!==b) return;       // a different amount is not a copy
        if((TRIED[tid]||0)>=2) return;                                // tried twice and it keeps coming back: stop, do not loop
        TRIED[tid]=(TRIED[tid]||0)+1; list.push(r);
      });
      if(!list.length) return 0;
      if(typeof window._gcRegDeleteRows==='function') await window._gcRegDeleteRows(list);
      else if(typeof window._gcTombstone==='function') list.forEach(function(r){ window._gcTombstone('gcAcctRegister', (r.id!=null&&r.id!=='')?r.id:r._id); });
    }catch(e){}
    return list.length;
  }

  // The same rows removed last round and back again: acting again only redraws and pushes for nothing.
  var LAST={}, TOLD={};
  function cameBack(store, losers){
    var sg=losers.map(function(l){ var r=l.row; return String(r._id||r.id||moneyKey(r)); }).sort().join('|');
    if(LAST[store]===sg){
      if(TOLD[store]!==sg){ TOLD[store]=sg; try{ console.log('[GC] Money dedup: the same '+losers.length+' '+store+' row(s) came back after being removed; leaving them alone (no redraw, no push).'); }catch(e){} }
      return true;
    }
    LAST[store]=sg; return false;
  }
"""
src = once(src, OLD_DEDUPE, NEW_DEDUPE)

# ---- 2. the sweep ------------------------------------------------------------------------------------------------
src = once(src, """    if(_busy) return; _busy=true;
    try{
      // 1) EXPENSES store""", """    if(_busy) return; _busy=true;
    var changed=false, held=false;
    try{
      // 1) EXPENSES store""")
src = once(src, """          var r1 = dedupeArray(exps);
          if(r1.removed>0){
            if(window._gcApplySync)""", """          var r1 = dedupeArray(exps);
          if(r1.removed<1) LAST.expenses='';
          if(r1.removed>0 && cameBack('expenses', r1.losers)) held=true;
          else if(r1.removed>0){
            changed=true;
            if(window._gcApplySync)""")
src = once(src, """          var r2 = dedupeArray(reg);
          if(r2.removed>0){
            if(window._gcApplySync) window._gcApplySync('gcAcctRegister', r2.out);""", """          var r2 = dedupeArray(reg, betterReg);
          if(r2.removed<1) LAST.gcAcctRegister='';
          if(r2.removed>0) await removeLinkLosers(r2.losers);
          if(r2.removed>0 && cameBack('gcAcctRegister', r2.losers)) held=true;
          else if(r2.removed>0){
            changed=true;
            if(window._gcApplySync) window._gcApplySync('gcAcctRegister', r2.out);""")
src = once(src, """          var r3 = dedupeArray(invs);
          if(r3.removed>0){
            if(window._gcApplySync)""", """          var r3 = dedupeArray(invs);
          if(r3.removed<1) LAST.invs='';
          if(r3.removed>0 && cameBack('invs', r3.losers)) held=true;
          else if(r3.removed>0){
            changed=true;
            if(window._gcApplySync)""")
src = once(src, """      try{ if(window._gcPushAll) window._gcPushAll(); }catch(e){}
    }catch(e){ console.warn('[GC] money dedup sweep failed', e); }""", """      if(!(held && !changed)){ try{ if(window._gcPushAll) window._gcPushAll(); }catch(e){} }
    }catch(e){ console.warn('[GC] money dedup sweep failed', e); }""")

# ---- 3. the one-time admin migration (appended as its own patch tail) ------------------------------------------------
MIG = r'''
<script id="gc-patch-regdup">
/* patch REGDUP (migration): the extra copy of each QuickBooks income row that has a same-link twin is deleted for good.
   Rule: same srcInvId/subInvId link ('QB...'), type income; KEEP the row that has a vendor/payee and the earlier date;
   DELETE the other copy only when its amount is the same and it has no vendor/payee (or the same payee, later date).
   Never deletes a row that has no kept twin. Runs for an admin, once (flag gc_regdup_mig_v1), through the register's
   own delete path (tombstone + purge + cloud write), then cleans the cloud copy so other computers stop getting it. */
(function(){
'use strict';
var W = window; if (W.__gcRegDupMig) return; W.__gcRegDupMig = 1;
var KEY = 'gcAcctRegister', LEG = 'gc_deleted_gcAcctRegister', FLAG = 'gc_regdup_mig_v1';
var SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function isAdmin(){ try { return !!(W.__gcAuthIsAdmin && W.__gcAuthIsAdmin()); } catch (e) { return false; } }
function cents(r){ return Math.round(Math.abs(parseFloat(r.amt != null ? r.amt : r.amount) || 0) * 100); }
function who(r){ return String(r.vendor || r.payee || '').trim(); }
function link(r){ return String(r.srcInvId || r.subInvId || ''); }
function rid(r){ return String(r.id != null && r.id !== '' ? r.id : (r._id != null ? r._id : '')); }
/* the plan: [{keep, del}]; a row is only ever in del when its keep twin exists and is not itself deleted */
function plan(rows){
  var groups = {}, out = [];
  (rows || []).forEach(function(r, i){
    if (!r || String(r.type).toLowerCase() !== 'income' || !/^QB/.test(link(r))) return;
    (groups[link(r)] = groups[link(r)] || []).push({ r: r, i: i });
  });
  Object.keys(groups).forEach(function(k){
    var g = groups[k]; if (g.length < 2) return;
    var cand = g.filter(function(x){ return who(x.r) && rid(x.r); });
    if (!cand.length) return;
    cand.sort(function(a, b){ var ad = String(a.r.date || '9999'), bd = String(b.r.date || '9999'); return ad < bd ? -1 : ad > bd ? 1 : a.i - b.i; });
    var keep = cand[0].r;
    g.forEach(function(x){
      var r = x.r; if (r === keep || !rid(r) || rid(r) === rid(keep)) return;
      if (cents(r) !== cents(keep)) return;
      if (who(r) && (who(r) !== who(keep) || String(r.date || '') < String(keep.date || ''))) return;
      out.push({ keep: keep, del: r });
    });
  });
  return out;
}
function cloudCreds(){ return { u: String(lsGet('grayco_sb_url') || '').replace(/\/+$/, ''), k: lsGet('grayco_sb_key') || '' }; }
async function cloudRegister(){
  var c = cloudCreds(); if (!c.u || !c.k) return null;
  try {
    var r = await fetch(c.u + '/rest/v1/gc_kv?key=eq.' + KEY + '&select=value', { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k } });
    if (!r.ok) return null; var j = await r.json();
    return (Array.isArray(j) && j.length && Array.isArray(j[0].value)) ? j[0].value : null;
  } catch (e) { return null; }
}
function flags(on){ try { if (on && W._gcManualNow) W._gcManualNow('delete register row'); W.__GC_EXPLICIT_DELETE__ = on; W.__GC_MANUAL_SAVE__ = on; } catch (e) {} }
/* the register's own delete, for rows given by the caller (no question asked; the caller has already decided).
   Same steps as gcExpCenter.deleteRow, except it does NOT tombstone the source link: the kept twin uses it. */
W._gcRegDeleteRows = async function(rowsIn){
  var ids = {}, list = [];
  (rowsIn || []).forEach(function(r){ if (!r) return; var any = false; [r.id, r._id].forEach(function(v){ if (v != null && v !== '') { ids[String(v)] = 1; any = true; } }); if (any) list.push(r); });
  if (!list.length) return { ids: ids, rows: list };
  flags(true);
  /* 1. the delete lists: gc_tombstones (synced, grow-only) + the register's own list */
  Object.keys(ids).forEach(function(k){ try { if (W._gcTombstone) W._gcTombstone(KEY, k); } catch (e) {} });
  var leg = []; try { leg = JSON.parse(lsGet(LEG) || '[]') || []; } catch (e) {}
  Object.keys(ids).forEach(function(k){ if (leg.indexOf(k) < 0) leg.push(k); });
  lsSet(LEG, JSON.stringify(leg)); try { if (W.idbSet) await W.idbSet(LEG, leg); } catch (e) {}
  /* 2. the local register */
  var fresh = await W.idbGet(KEY); fresh = Array.isArray(fresh) ? fresh : [];
  var kept = fresh.filter(function(r){ return !(r && (ids[String(r._id)] || ids[String(r.id)])); });
  var w = W._gcAcW || W.idbSet; await w(KEY, kept);
  try { if (W._gcRegisterFlush) await W._gcRegisterFlush(); } catch (e) {}
  try { W._gcRegisterCache = kept; } catch (e) {}
  try { if (W._gcRefreshSpend) W._gcRefreshSpend(); } catch (e) {}
  try { if (W._gcPurgeEverywhere) Object.keys(ids).forEach(function(k){ W._gcPurgeEverywhere(KEY, k); }); } catch (e) {}
  /* 3. the cloud copy: the register's own cloud write */
  try { if (W._supaUpsertNow) W._supaUpsertNow(KEY, kept); else if (W._supaUpsert) W._supaUpsert(KEY, kept); } catch (e) {}
  ST.call(W, function(){ flags(false); }, 2500);
  try { var E = W.gcExpCenter; if (E) { E.renderStats && E.renderStats(); E.renderRegister && E.renderRegister(); } } catch (e) {}
  return { ids: ids, rows: list };
};
var running = false, tries = 0;
async function run(opts){
  opts = opts || {};
  if (running) return { skipped: 'running' }; running = true;
  try {
    if (lsGet(FLAG) && !opts.force) return { skipped: 'already done' };
    if (!isAdmin()) return { skipped: 'not an admin here' };
    var rows = await W.idbGet(KEY);
    if (!Array.isArray(rows) || !rows.length) return { skipped: 'register not loaded yet' };
    var P = plan(rows);
    if (opts.dry) return { plan: P.map(function(p){ return { keep: rid(p.keep), del: rid(p.del), link: link(p.del), amt: p.del.amt }; }) };
    if (!P.length) { if (++tries >= 12) lsSet(FLAG, new Date().toISOString() + ' none'); return { deleted: 0 }; }
    var del = await W._gcRegDeleteRows(P.map(function(p){ return p.del; }));
    var ids = del.ids, list = del.rows, cloudLeft = -1;
    for (var i = 0; i < 4; i++) {
      await new Promise(function(r){ ST.call(W, r, 2500); });
      var cl = await cloudRegister();
      if (!cl) { cloudLeft = -1; continue; }
      var left = cl.filter(function(r){ return r && (ids[String(r._id)] || ids[String(r.id)]); });
      cloudLeft = left.length;
      if (!left.length) break;
      flags(true);
      var clean = cl.filter(function(r){ return !(r && (ids[String(r._id)] || ids[String(r.id)])); });
      try { if (W._supaUpsertNow) W._supaUpsertNow(KEY, clean); } catch (e) {}
    }
    ST.call(W, function(){ flags(false); }, 2500);
    var res = { deleted: list.length, cloudLeft: cloudLeft, ids: Object.keys(ids) };
    try { console.log('[GC] Register clean-up (REGDUP): deleted ' + list.length + ' extra copy(ies) of money already on the books (kept the original of each); cloud copies left: ' + cloudLeft + '.'); } catch (e) {}
    if (cloudLeft === 0) lsSet(FLAG, new Date().toISOString() + ' ' + list.length);
    return res;
  } catch (e) { try { console.warn('[GC] REGDUP migration failed', e); } catch (_e) {} return { error: String(e) }; }
  finally { running = false; }
}
W._gcRegDupMigrate = run;
var n = 0;
ST.call(W, function(){
  SI.call(W, function(){
    if (lsGet(FLAG) || ++n > 60) return;
    if (W.__GC_IS_TYPING__ || !isAdmin()) return;
    run();
  }, 30000);
  run();
}, 25000);
try { console.log('[GC] Register clean-up ready (patch REGDUP): _gcRegDupMigrate({dry:true}) shows the plan.'); } catch (e) {}
})();
</script>
'''
assert 'id="gc-patch-regdup"' not in src
src = src.rstrip('\n') + '\n' + MIG
for k in (MARK, 'function betterReg(', 'async function removeLinkLosers(', 'id="gc-patch-regdup"'):
    assert src.count(k) == 1, k
open(path, 'w', encoding='utf-8').write(src)
print('patched')
