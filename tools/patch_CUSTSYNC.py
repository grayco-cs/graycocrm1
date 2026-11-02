#!/usr/bin/env python3
"""Idempotent patch CUSTSYNC (on top of CUSTALL): the Customers list after the first sign-in, and CUSTALL's safety.

THE RACE (why the Customers list could stay EMPTY after the first sign-in) — measured in the offline harness:
  * The cloud pull downloads the customers, writes them to this computer's disk and hands them to the screen through
    window._gcApplySync. On the way, a guard ("no-jump") remembers the list's fingerprint as "what is on the screen"
    BEFORE the hand-over is done. Further down, the hand-over is held or refused — the sign-in click counts as "she is
    working", and outside a deliberate tab-change sync the governor refuses cloud lists — and the held copy is dropped
    once it is older than 8 s ("the next pull brings it").
  * The next pull does bring it, but the no-jump guard says "same as on screen" and throws it away, and the pull's
    own note (_idbSnapshot) says "already have it". The screen's customer list stays EMPTY for that page.
  * Customers are hit hardest: they are the last list the CRM reads at start-up, so the start-up read (made before
    the pull wrote the disk) can also put an empty list over one that did arrive. A heavier page (FIELDPORTAL2 +
    PORTALAPP) reads more slowly and holds the screen longer, so it loses the race more often.

THE FIX (customers only; nothing else in the sync changes)
  * window.__gcCloudSeen.customers = { at, n, ids }: the pulls note the cloud's copy as it comes in this session.
  * If the screen's customer list is then still missing most of the cloud's customers (more than half, and more than
    2; deleted ones aside), the cloud's list is put together with the screen's (union, never fewer) straight through
    the CRM's own list setter. Checked when the cloud copy comes in and each time the CRM saves the list; no timer.
    An empty list on the screen with customers in the cloud is therefore always filled.
  * The CRM's start-up read of the customers never puts an empty (or older) disk list over a cloud list that reached
    the screen first: the two are put together.
  * CUSTALL never writes the Customers list until the cloud's customers came in this session and the list in hand
    has them (at most 2 or 5 % missing, deleted ones aside); until then its queue waits, and the backfill and
    "＋ Add to Customers" say to try again. tools/custall_client.js is re-inlined (patch CUSTALL's copy is swapped).
Usage: python3 tools/patch_CUSTSYNC.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '/* patch CUSTSYNC */'
src = open(path, encoding='utf-8').read()
client = open(os.path.join(HERE, 'custall_client.js'), encoding='utf-8').read()
assert '</script' not in client

def once(s, old, new, label):
    n = s.count(old); assert n == 1, ('CUSTSYNC: anchor count != 1', label, n)
    return s.replace(old, new)

done = MARK in src
# 0. CUSTALL's page side, the current file (the region patch CUSTALL inlined)
B = '/* CUSTALL-CORE-END */\n'; E = '</script>\n<script id="gc-patch-primesub">'
assert src.count(B) == 1 and src.count(E) == 1, 'CUSTSYNC: patch CUSTALL must be in first'
i = src.index(B) + len(B); j = src.index(E)
assert i < j
client_changed = src[i:j] != client
if client_changed: src = src[:i] + client + src[j:]

HELP = r'''<script id="gc-patch-custsync">
/* patch CUSTSYNC */
/* The cloud's customer list reaches the screen (see tools/patch_CUSTSYNC.py for the race).
   window._gcCloudSeen(key, value)  a pull got the cloud's copy of a list this session (window.__gcCloudSeen[key]).
   window._gcCloudHeal(key)          customers: the screen's list missing most of the cloud's -> the two put together.
   window._gcLoadKeep(key, disk)     the start-up read of customers never puts an empty / older list over the cloud's. */
(function(){
  var W = window;
  function arr(v){ return Array.isArray(v) ? v : []; }
  function idOf(r){ return r && r.id != null ? String(r.id) : ''; }
  function dead(k, id){
    try { var t = typeof W._gcTombstones === 'function' ? W._gcTombstones() : null; if (t && t[k + ':' + id]) return true; } catch (e) {}
    try { var d = JSON.parse(localStorage.getItem('gc_deleted_' + k) || '[]'); return Array.isArray(d) && d.indexOf(id) >= 0; } catch (e) { return false; }
  }
  function clean(k, list){ try { if (typeof W._gcApplyTombstoneFilter === 'function') return W._gcApplyTombstoneFilter(k, list) || list; } catch (e) {} return list; }
  function union(k, mine, theirs){
    var m = null; try { if (W._gcUnionMerge) m = W._gcUnionMerge(k, mine, theirs); } catch (e) { m = null; }
    if (!Array.isArray(m)) { var seen = {}; m = []; arr(mine).concat(arr(theirs)).forEach(function(r){ var id = idOf(r); if (id && seen[id]) return; if (id) seen[id] = 1; m.push(r); }); }
    return clean(k, m);
  }
  W._gcCloudSeen = function(k, v){
    try {
      (W.__gcCloudSeen = W.__gcCloudSeen || {})[k] = { at: Date.now(), n: Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0),
        ids: Array.isArray(v) ? v.map(idOf).filter(Boolean) : [], list: k === 'customers' && Array.isArray(v) ? v : null };
    } catch (e) {}
    if (k !== 'customers') return;
    Promise.resolve().then(function(){ W._gcCloudHeal(k); });
    if (typeof W._gcCustAllKick === 'function') { try { W._gcCustAllKick(); } catch (e) {} }
  };
  W._gcCloudHeal = function(k, shown){
    var s = W.__gcCloudSeen && W.__gcCloudSeen[k];
    if (k !== 'customers' || !s || !s.list || !s.ids.length) return false;
    function behind(list){
      var have = {}; arr(list).forEach(function(r){ var id = idOf(r); if (id) have[id] = 1; });
      var miss = s.ids.filter(function(id){ return !have[id] && !dead(k, id); }).length;
      return miss > Math.max(2, Math.floor(s.ids.length / 2));
    }
    if (shown && !behind(shown)) return false;
    var set = W.__gcSetCustomersNow || W._setCustomers;
    if (typeof set !== 'function') return false;
    try {
      set(function(prev){
        if (!behind(prev)) return prev;
        var m = union(k, arr(prev), s.list);
        if (!Array.isArray(m) || m.length < arr(prev).length) return prev;
        try { console.log('[CUSTSYNC] customers: the screen had ' + arr(prev).length + ', the cloud ' + s.ids.length + ' - put together (' + m.length + ')'); } catch (e) {}
        return m;
      });
    } catch (e) { return false; }
    return true;
  };
  W._gcLoadKeep = function(k, disk){
    return function(prev){
      if (!Array.isArray(prev) || !prev.length) return disk;
      if (!Array.isArray(disk) || !disk.length) { try { console.log('[CUSTSYNC] ' + k + ': the start-up read found none on this computer - the ' + prev.length + ' from the cloud stay'); } catch (e) {} return prev; }
      var m = union(k, disk, prev);
      return Array.isArray(m) && m.length >= disk.length ? m : disk;
    };
  };
})();
</script>
'''

if not done:
    src = once(src, '<script id="gc-patch-custall">', HELP + '<script id="gc-patch-custall">', 'helper script')
    # 1. the pulls note what came in (GC Sync pullAll, the cross-browser pullMerge)
    src = once(src, "      var _val = row.value;\n      if(window._gcPullSkip && window._gcPullSkip(row.key)) continue;   /* patch D: per-computer key */",
      "      var _val = row.value;\n      try{ if(window._gcCloudSeen) window._gcCloudSeen(row.key, _val); }catch(_cs){}   " + MARK + "\n"
      "      if(window._gcPullSkip && window._gcPullSkip(row.key)) continue;   /* patch D: per-computer key */", 'pullAll seen')
    src = once(src, "          if(CORE.indexOf(key)<0) continue;\n          if(key==='gc_tombstones'){",
      "          if(CORE.indexOf(key)<0) continue;\n          try{ if(window._gcCloudSeen) window._gcCloudSeen(key, val); }catch(_cs){}   " + MARK + "\n"
      "          if(key==='gc_tombstones'){", 'pullMerge seen')
    # 2. the CRM's start-up read of the customers (the last list it reads): a cloud copy that reached the screen first stays
    src = once(src, 'const K=await g("customers",[]);Jt(K);',
      'const K=await g("customers",[]);Jt(window._gcLoadKeep?window._gcLoadKeep("customers",K):K);' + MARK, 'loader keep')
    # 3. the profile's "+ Add to Customers" waits for the list too
    src = once(src, "    else if (a === 'create') { c = (typeof W._gcCustAllAdd === 'function' ? W._gcCustAllAdd(c) : null) ||",
      "    else if (a === 'create') { if (typeof W._gcCustAllCloudOk === 'function' && !W._gcCustAllCloudOk()) { toast('The customer list is still coming in from the cloud — try again in a moment.'); return; }   " + MARK + "\n"
      "      c = (typeof W._gcCustAllAdd === 'function' ? W._gcCustAllAdd(c) : null) ||", 'd1 create')

if done and not client_changed:
    print('CUSTSYNC: already patched'); sys.exit(0)
open(path, 'w', encoding='utf-8').write(src)
print('CUSTSYNC: patched' + ('' if not done else ' (CUSTALL page side refreshed)'))
