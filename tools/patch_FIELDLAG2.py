#!/usr/bin/env python3
"""Idempotent patch FIELDLAG2: the owner's GrayCo Field Home stops lagging (owner 11/24, iPhone, admin: "Definitely very laggy
here"; the phones' own reports: gc_tombstones written 54 times a minute, ~18M characters of localStorage writes a minute).
(patch FIELDLAG — tools/patch_FIELDLAG.py — is the earlier 11/04 scroll work; this is its second round.)

Measured with the real data snapshot, the owner signed in on an emulated iPhone (CPU x4), Field Home (tools/tests/test_FIELDLAG.mjs):
1. PURGE: every deletion learned from the cloud (or a sweep) ran the full "delete for good" once per record, one after the other:
   read + rewrite the whole delete list (170K chars) in localStorage, send the whole list to the cloud, read whole lists and today's
   daily backup out of IndexedDB — ~1 s of main thread at x4 each, 85 of them in a row after an open (34-43 writes of gc_tombstones a
   minute, 8M characters). Now the records queued at the same time are purged together: the delete list read and written once, each
   list / snapshot / backup read and written once for the whole batch. Same result, same order guarantee (one batch at a time).
2. TD2SEEN: the To-Do "cleared on its own" memory (gc_td2_seen) was rewritten on every To-Do rebuild because each line's "last seen"
   moved to now; the Home's ☑ To-dos badge asks for that rebuild. It is written when it changed (a new line, a line gone, a title) and
   a line's "last seen" moves at most every 10 minutes (it is only compared to 36 hours).
3. FIELDTOP: the Home's top was built again every 0.9 s, including the role's tile row (tile counts, the money numbers, the approval
   set) that the PM / admin dashboard throws away; the dashboard says so (window._gcRaFieldTop.takes) and that row is not built.
4. NOTUNDER: that 0.9 s re-check does not rebuild / replace the Home while a finger is on it or a scroll is moving (the Home's own redraw
   already waited, FIELDPERF); it runs again right after. A tap never lands on a button that was replaced under it.
0. LSDIET (tools/fieldlag2_early.js, every device and role): an unchanged value is not written again; a big value rewritten within
   8 s waits and only its newest value is written (everything waiting goes when the page is hidden / closed); a refused write is
   kept (memory + IndexedDB) and written later, never dropped.
Usage: python3 tools/patch_FIELDLAG2.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
t = open(p, encoding='utf-8').read()

# 0. LSDIET — the storage layer (tools/fieldlag2_early.js) right after FIELDLAG's early script, under every later wrapper
js = open(os.path.join(HERE, 'fieldlag2_early.js'), encoding='utf-8').read()
assert '</script' not in js.lower()
TAG = '<script id="gc-patch-fieldlag2-early">'
if TAG in t:
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != js: t = t[:i] + js + t[j:]; print('FIELDLAG2: early script updated')
else:
    a = '<script id="gc-patch-fieldlag">'
    assert t.count(a) == 1
    e = t.index('</script>\n', t.index(a)) + len('</script>\n')
    t = t[:e] + TAG + '\n' + js + '</script>\n' + t[e:]
    print('FIELDLAG2: early script added')

def sub(name, old, new):
    global t
    if new in t:
        return
    assert t.count(old) == 1, ('FIELDLAG2 anchor', name, t.count(old))
    t = t.replace(old, new)
    print('FIELDLAG2:', name)

# 1. PURGE — one batch at a time
sub('PURGE batch',
"""  var _purgeChain = Promise.resolve();
  window._gcPurgeEverywhere = function(type, id){
    var run = function(){ return _gcPurgeOne(type, id); };
    var p = _purgeChain.then(run, run);
    _purgeChain = p.catch(function(){});
    return p;
  };
""",
"""  var _purgeChain = Promise.resolve();
  /* FIELDLAG2: the records asked for while a batch runs (a cloud sync names hundreds at once) wait and go together in the next one:
     the delete list is read and written once, each list / snapshot / today's backup read and written once, for the whole batch */
  var _purgeQ = [], _purgeOn = false;
  window._gcPurgeEverywhere = function(type, id){
    if(!type || id==null) return Promise.resolve();
    var job = { type: type, id: String(id) };
    var pr = new Promise(function(res){ job.res = res; });
    _purgeQ.push(job);
    if(!_purgeOn){
      _purgeOn = true;
      var drain = function(){
        if(!_purgeQ.length){ _purgeOn = false; return; }
        var batch = _purgeQ.splice(0, _purgeQ.length);
        var done = function(r){ batch.forEach(function(j){ try{ j.res((r && r[j.type+':'+j.id]) || []); }catch(e){} }); };
        _purgeChain = _purgeChain.then(function(){ return _gcPurgeBatch(batch); }).then(done, function(){ done(null); }).then(drain, drain);
      };
      Promise.resolve().then(drain);   /* the rest of this burst (a forEach of calls) joins the batch */
    }
    return pr;
  };
  async function _gcPurgeBatch(batch){
    var out = {}, by = {}, now = Date.now();
    batch.forEach(function(j){ out[j.type+':'+j.id] = []; (by[j.type] = by[j.type] || {})[j.id] = 1; });
    var note = function(type, sid, what){ var r = out[type+':'+sid]; if(r && r.indexOf(what) < 0) r.push(what); };
    // 1) permanent tombstones, shared with every computer — one read, one write
    try{
      var t = readTombs();
      batch.forEach(function(j){
        t[tombKey(j.type, j.id)] = now;
        if(j.type==='invoices') t[tombKey('invs', j.id)] = now;
        if(j.type==='invs')     t[tombKey('invoices', j.id)] = now;
        note(j.type, j.id, 'tombstone');
      });
      writeTombs(t);
    }catch(e){}
    var keysOf = function(type){ return [type, type==='invs'?'invoices':(type==='invoices'?'invs':null)].filter(Boolean); };
    // 2) the rolling safety snapshots
    try{
      Object.keys(by).forEach(function(type){
        keysOf(type).forEach(function(k){
          var raw = localStorage.getItem(SNAP_PREFIX+k); if(!raw) return;
          var arr = JSON.parse(raw); if(!Array.isArray(arr)) return;
          var hit = {}, out1 = arr.filter(function(x){ var i = String(idOf(x)); if(by[type][i]){ hit[i] = 1; return false; } return true; });
          if(out1.length !== arr.length){ localStorage.setItem(SNAP_PREFIX+k, JSON.stringify(out1)); Object.keys(hit).forEach(function(i){ note(type, i, 'safety snapshot'); }); }
        });
      });
    }catch(e){}
    // 3) the live lists + IndexedDB
    var types = Object.keys(by);
    for(var ti=0; ti<types.length; ti++){
      var type = types[ti], keys = [type]; if(type==='invoices') keys.push('invs'); if(type==='invs') keys.push('invoices');
      for(var i=0; i<keys.length; i++){
        try{
          var k = keys[i], cur = await window.idbGet(k);
          if(Array.isArray(cur)){
            var hit2 = {}, out2 = cur.filter(function(x){ var s0 = String(idOf(x)); if(by[type][s0]){ hit2[s0] = 1; return false; } return true; });
            if(out2.length !== cur.length){
              await window.idbSet(k, out2);
              try{ if(window._gcApplySync) window._gcApplySync(k, out2); }catch(e){}
              try{ if(window._supaUpsert) window._supaUpsert(k, out2); }catch(e){}
              Object.keys(hit2).forEach(function(s1){ note(type, s1, k); });
            }
          }
        }catch(e){}
      }
    }
    // 4) today's daily backup, so tomorrow's recovery cannot resurrect them (every list in it, as before)
    try{
      var all = {}; batch.forEach(function(j){ all[j.id] = j.type; });
      var today='gc_dailybackup_'+new Date().toISOString().slice(0,10);
      var snap=await window.idbGet(today);
      if(snap && snap.lists){
        var changed=false;
        Object.keys(snap.lists).forEach(function(k){
          if(!Array.isArray(snap.lists[k])) return;
          var out3=snap.lists[k].filter(function(x){ var s2 = String(idOf(x)); if(all[s2] !== undefined){ note(all[s2], s2, 'today\\'s backup'); return false; } return true; });
          if(out3.length!==snap.lists[k].length){ snap.lists[k]=out3; changed=true; }
        });
        if(changed){ await window.idbSet(today, snap); }
      }
    }catch(e){}
    try{ console.warn('[GC] Deleted for good ('+batch.length+': '+batch.slice(0, 6).map(function(j){ return j.type+' '+j.id; }).join(', ')+(batch.length > 6 ? ' …' : '')+') — cleared from: '+(batch.length === 1 ? (out[batch[0].type+':'+batch[0].id].join(', ')||'nothing found') : 'tombstones and the copies that held them')); }catch(e){}
    return out;
  }
""")

# 2. TD2SEEN — written when it changed; "last seen" moves at most every 10 minutes
sub('TD2SEEN gone',
"""    var cleared = [];
    Object.keys(seenMap).forEach(function(k){
      var x = seenMap[k];
      if (!nowKeys[k] && !metaGet(k) && x && x.last && Date.now() - x.last < 36 * 3600e3 && Date.now() - lastBuild < 120000 && !x.gone) { x.gone = Date.now(); cleared.push(x); }
      if (x && x.gone && Date.now() - x.gone > 86400e3) delete seenMap[k];
    });
    vis.forEach(function(g){ [g].concat(g.children || []).forEach(function(c){ if (c.src === 'st' || c.src === 'roll') return; seenMap[c.key] = { t: c.title, last: Date.now() }; }); });
    var ks = Object.keys(seenMap); if (ks.length > 1500) ks.slice(0, ks.length - 1500).forEach(function(k){ delete seenMap[k]; });
    lsSet('gc_td2_seen', JSON.stringify(seenMap));
""",
"""    var cleared = [], seenDirty = false;   /* FIELDLAG2: written when it changed */
    Object.keys(seenMap).forEach(function(k){
      var x = seenMap[k];
      if (!nowKeys[k] && !metaGet(k) && x && x.last && Date.now() - x.last < 36 * 3600e3 && Date.now() - lastBuild < 120000 && !x.gone) { x.gone = Date.now(); cleared.push(x); seenDirty = true; }
      if (x && x.gone && Date.now() - x.gone > 86400e3) { delete seenMap[k]; seenDirty = true; }
    });
    var seenNow = Date.now();   /* FIELDLAG2: "last seen" moves at most every 10 min (it is only compared to 36 h) */
    vis.forEach(function(g){ [g].concat(g.children || []).forEach(function(c){ if (c.src === 'st' || c.src === 'roll') return; var o = seenMap[c.key]; if (o && !o.gone && o.t === c.title && o.last && seenNow - o.last < 600000 && seenNow >= o.last) return; seenMap[c.key] = { t: c.title, last: seenNow }; seenDirty = true; }); });
    var ks = Object.keys(seenMap); if (ks.length > 1500) { ks.slice(0, ks.length - 1500).forEach(function(k){ delete seenMap[k]; }); seenDirty = true; }
    if (seenDirty) lsSet('gc_td2_seen', JSON.stringify(seenMap));
""")

# 3. FIELDTOP — the dashboard says it takes the Home; the tile row it would throw away is not built
sub('FIELDTOP takes',
"""W._gcRaFieldTop = function(a, h0, kit){
  if (kit) KIT = kit;
  if (!dashApp(a) || !KIT) return h0;
  css(); flags();
  try { return dashHtml(a, h0); } catch (e) { warn(e); return h0; }
};
""",
"""W._gcRaFieldTop = function(a, h0, kit){
  if (kit) KIT = kit;
  if (!dashApp(a) || !KIT) return h0;
  css(); flags();
  try { return dashHtml(a, h0); } catch (e) { warn(e); return h0; }
};
W._gcRaFieldTop.takes = function(a){ try { return !!KIT && dashApp(a); } catch (e) { return false; } };   /* FIELDLAG2: the role's quick-button row is not shown under the dashboard */
""")
sub('FIELDTOP row',
"""function fieldTop(a){
  var ids = actions(a, 'home');
  var h = '<div class="gc-ra-q" data-app="' + a + '" data-n="' + ids.length + '">' + ids.map(function(id){ return tileHtml(id, 'gc-ra-qb'); }).join('') + '</div>';
""",
"""function fieldTop(a){
  var _flTake = false; try { _flTake = typeof W._gcRaFieldTop === 'function' && typeof W._gcRaFieldTop.takes === 'function' && !!W._gcRaFieldTop.takes(a); } catch (e) {}   /* FIELDLAG2: the dashboard drops this row — not built (tile counts, the money numbers, every 0.9 s) */
  var ids = _flTake ? [] : actions(a, 'home');
  var h = '<div class="gc-ra-q" data-app="' + a + '" data-n="' + ids.length + '">' + ids.map(function(id){ return tileHtml(id, 'gc-ra-qb'); }).join('') + '</div>';
""")

# 4. NOTUNDER — the 0.9 s re-check does not rebuild the Home under a finger / a moving scroll
sub('NOTUNDER sync',
"""    fieldBar(a); fieldInject(); crewDesk(a);
""",
"""    fieldBar(a); if (!flBusy()) fieldInject(); else flLater(); crewDesk(a);   /* FIELDLAG2: not under a finger / a moving scroll */
""")
sub('NOTUNDER helpers',
"""var last = { app: null, mode: null, rk: null }, busy = false;
function sync(){
""",
"""var last = { app: null, mode: null, rk: null }, busy = false;
/* FIELDLAG2: a finger down / up in the last 0.8 s, or a scroll still moving: the Home is not rebuilt under it (the tap would land on a
   replaced button, the scroll would stutter) — it is looked at again right after */
function flBusy(){ try { if (W.__gcFpTouch && Date.now() - W.__gcFpTouch() < 800) return true; if (W.__gcFL && W.__gcFL.scrolling && W.__gcFL.scrolling()) return true; } catch (e) {} return false; }
var flT = null;
function flLater(){ if (flT) return; flT = later(function(){ flT = null; if (flBusy()) { flLater(); return; } try { fieldInject(); } catch (e) { warn(e); } }, 400); }
function sync(){
""")

open(p, 'w', encoding='utf-8').write(t)
print('FIELDLAG2: done')
