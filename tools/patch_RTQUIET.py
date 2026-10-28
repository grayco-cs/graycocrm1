#!/usr/bin/env python3
"""Idempotent patch RTQUIET: the schedule de-dupe sweep re-sent the whole schedule when nothing was duplicated.

_gcSchedSweep (load + every 5 minutes on every computer) puts the screen's list, this computer's list and the
cloud's single "schedule" row together (3 x 13,350 rows) and folds the duplicates. It then compared the size of
the three lists put together with the folded result, so it ALWAYS found "duplicates" (the three copies of each
row) and wrote: the whole list to this computer's disk, to the screen, and the whole ~5 MB "schedule" row to the
cloud, which the live feed then hands to every other open computer (each one reads, signs, merges and saves
5 MB). Measured: 14 such 5 MB updates in 10 minutes with two computers open.

Now, before writing, it checks whether there is anything to clean: when the folded list has exactly the rows
this computer already has (same ids, same text) and the cloud row holds exactly those ids too, no row was a
duplicate anywhere and nothing is written. Any duplicate, any row only one side has, any difference in a row
on this computer: it cleans exactly as before. The 💎 button (loud) always runs as before."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch RTQUIET'
if MARK in t: print('RTQUIET: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('RTQUIET anchor count != 1', n, old[:90])
    t = t.replace(old, new)

once("""    var combined = live.concat(local, cloud);
    var before = combined.length;
    var res = window._gcSchedCollapse(combined);
    var clean = res.out;
""", """    var combined = live.concat(local, cloud);
    var before = combined.length;
    var res = window._gcSchedCollapse(combined);
    var clean = res.out;
    """ + MARK + """: nothing to clean (the folded list is exactly this computer's rows, and the cloud row has exactly
       those ids): nothing is written — not to this disk, the screen, or the cloud */
    if(!loud && cloudOk && cloud.length && clean.length === local.length && clean.length === cloud.length){
      try{
        var _qId = function(r){ return (r && typeof r === 'object' && r.id != null && r.id !== '') ? String(r.id) : null; };
        var _qL = {}, _qOk = true, _qi;
        for(_qi = 0; _qi < local.length && _qOk; _qi++){ var _qk = _qId(local[_qi]); if(_qk == null || (_qk in _qL)) _qOk = false; else _qL[_qk] = local[_qi]; }
        for(_qi = 0; _qi < clean.length && _qOk; _qi++){ var _qc = clean[_qi], _qk2 = _qId(_qc); if(_qk2 == null || !(_qk2 in _qL)) _qOk = false; else if(_qL[_qk2] !== _qc && JSON.stringify(_qL[_qk2]) !== JSON.stringify(_qc)) _qOk = false; }
        var _qC = {};
        for(_qi = 0; _qi < cloud.length && _qOk; _qi++){ var _qk3 = _qId(cloud[_qi]); if(_qk3 == null || !(_qk3 in _qL) || (_qk3 in _qC)) _qOk = false; else _qC[_qk3] = 1; }
        if(_qOk) return { before: before, after: clean.length, removed: 0, quiet: true };
      }catch(_qe){}
    }
""")
open(p, 'w', encoding='utf-8').write(t); print('RTQUIET: patched')
