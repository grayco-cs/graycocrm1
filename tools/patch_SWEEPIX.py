#!/usr/bin/env python3
"""Idempotent patch SWEEPIX: the once-a-minute "no duplicates anywhere" sweep froze the page ("page not responding").

collapse() compared every schedule row with every row kept before it (sameDated), working out the wording key of both
rows again on each comparison. That is n x n: 1,000 schedule rows ~0.3 s, 3,000 rows ~1.7 s, 6,000 rows 8-11 s of a
frozen page, every 60 s, on every open computer (the schedule has one row per work day, so it grows fast). The same
for punch lists, job payments, inspections, change orders and bid lists.

Two dated rows can only be the same when their wording AND their day match (sameDated checks both first), so the kept
rows are now looked up in an index by wording + day, like patch LEADFREEZE-7 does for people. The same rule
(sameDated) still decides inside that bucket, and the first matching kept row wins as before, so the result is
identical; it is just linear. 6,000 rows: ~10 s -> well under 0.1 s."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch SWEEPIX'
if MARK in t: print('SWEEPIX: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('SWEEPIX anchor count != 1', n, old[:90])
    t = t.replace(old, new)

once("""function collapse(rows, L){
  if(!Array.isArray(rows) || rows.length<2) return null;
  var keepers=[], dropped=[], review=[];
  var IX = (L.same===samePerson && !L.careful) ? personIndex() : null;   /* patch LEADFREEZE-7 */
""", """""" + MARK + """: dated rows (schedule, punch, payments ...) can only match on the same wording AND day, so the kept
   rows are bucketed by that key; sameDated still decides inside the bucket and the lowest kept index wins, as before */
function datedIndex(keepers, same){
  var B={}, K=[];
  function key(r){ return descKey(r)+'\\u0001'+dateKey(r); }
  return {
    add: function(i, r){ var k=key(r), a=(B[k]||(B[k]=[])); K[i]=k; a.push(i); if(a.length>1 && a[a.length-2]>i) a.sort(function(x,y){ return x-y; }); },
    remove: function(i){ var k=K[i]; if(k==null) return; var a=B[k]; if(a){ var j=a.indexOf(i); if(j>=0) a.splice(j,1); } K[i]=null; },
    find: function(r){ var a=B[key(r)]; if(!a) return -1; for(var x=0;x<a.length;x++){ var ok=false; try{ ok=same(keepers[a[x]], r); }catch(e){ ok=false; } if(ok) return a[x]; } return -1; }
  };
}
function collapse(rows, L){
  if(!Array.isArray(rows) || rows.length<2) return null;
  var keepers=[], dropped=[], review=[];
  var IX = (L.same===samePerson && !L.careful) ? personIndex() : (L.same===sameDated ? datedIndex(keepers, sameDated) : null);   /* patch LEADFREEZE-7 + SWEEPIX */
""")
open(p, 'w', encoding='utf-8').write(t); print('SWEEPIX: patched')
