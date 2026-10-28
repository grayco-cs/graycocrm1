#!/usr/bin/env python3
"""Idempotent patch DENYKEEP: a full browser storage no longer makes saves on this computer fail
(release check 10/28: now and then ✕ Deny said "Could not save that on this computer … try again" and the card came back).

Cause: this computer's storage (localStorage, ~5.2 M characters) is shared by everything the CRM keeps here.
Three schedule backups (gc_sched_backup, gc_safenet_schedule, gc_bak_schedule) each try to store the whole schedule
(~5 M characters with a production-size schedule). Normally that write fails and nothing happens, but when a backup ran
before the estimates (2.5 M) were stored, it fitted, the storage was full, and from then on every save here failed:
estimates, approvals, expenses, the To-Do list, a Deny. The copy also stayed across reloads (the schedule backup
is only replaced by a bigger one, which can never fit), so a browser could stay stuck like that.
Now: a backup bigger than 1 M characters is not kept in browser storage (the schedule is safe in IndexedDB and the
cloud; these copies were failing anyway); such a copy already stored is removed when the page opens; and a ✕ Deny
whose save meets a full storage frees the backup copies and tries once more.
Usage: python3 tools/patch_DENYKEEP.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch DENYKEEP'
if MARK in src:
    print('DENYKEEP: already patched'); sys.exit(0)
R = []
# 1. the schedule guardian's rolling copy
R.append(("""        var _txt=JSON.stringify(sched);
        localStorage.setItem(key, _txt);
        _bkList=sched; _bkN=sched.length; _bkLen=_txt.length;""",
"""        var _txt=JSON.stringify(sched);
        if(_txt.length>1000000){ _bkList=sched; _bkN=sched.length; _bkLen=raw.length; if(raw.length>1000000){ try{ localStorage.removeItem(key); }catch(e){} _bkLen=2; } return; }   """ + MARK + """: too big for browser storage (it is in IndexedDB and the cloud) */
        localStorage.setItem(key, _txt);
        _bkList=sched; _bkN=sched.length; _bkLen=_txt.length;"""))
# 2. the safety net's per-list snapshot
R.append(("""  function writeSnap(k, arr){ try{ localStorage.setItem(SNAP_PREFIX+k, JSON.stringify(arr)); }catch(e){} }""",
"""  function writeSnap(k, arr){ try{ var _t = JSON.stringify(arr); if(_t.length > 1000000){ if(localStorage.getItem(SNAP_PREFIX+k) != null) localStorage.removeItem(SNAP_PREFIX+k); return; } localStorage.setItem(SNAP_PREFIX+k, _t); }catch(e){} }   """ + MARK + """: no list bigger than 1 M characters in browser storage */"""))
# 3. the rolling backups (up to 10 copies per list)
R.append(("""        snaps.push({ at: stamp, count: data.length, data: data });
        while(snaps.length > MAX_SNAPS) snaps.shift();
        try{ localStorage.setItem(snapKey(k), JSON.stringify(snaps)); }catch(e){}""",
"""        snaps.push({ at: stamp, count: data.length, data: data });
        while(snaps.length > MAX_SNAPS) snaps.shift();
        var _t = JSON.stringify(snaps); while(_t.length > 1000000 && snaps.length > 1){ snaps.shift(); _t = JSON.stringify(snaps); }   """ + MARK + """: at most 1 M characters per list */
        if(_t.length > 1000000){ try{ localStorage.removeItem(snapKey(k)); }catch(e){} return; }
        try{ localStorage.setItem(snapKey(k), _t); }catch(e){}"""))
# 4. a Deny meeting a full storage: free the backup copies, try once more
R.append(("""    localStorage.setItem('gc_office_tasks', JSON.stringify(ot));
  } catch (e) { warn(e); toast('Could not save that on this computer (' + s(e && e.message).slice(0, 80) + ') — try again.'); return; }""",
"""    try { localStorage.setItem('gc_office_tasks', JSON.stringify(ot)); }
    catch (e0) { if (!(W._gcFreeLocalSpace && W._gcFreeLocalSpace())) throw e0; localStorage.setItem('gc_office_tasks', JSON.stringify(ot)); }   """ + MARK + """: full storage → free the backup copies, once more */
  } catch (e) { warn(e); toast('Could not save that on this computer (' + s(e && e.message).slice(0, 80) + ') — try again.'); return; }"""))
R.append(("""function denyKeep(tk){ try { var l = denyKept().filter(function(x){ return x && x.id !== tk.id; }); l.push(tk); localStorage.setItem('gc_apx_denies', JSON.stringify(l.slice(-200))); } catch (e) { warn(e); } }""",
"""function denyKeep(tk){ try { var l = denyKept().filter(function(x){ return x && x.id !== tk.id; }); l.push(tk); var v = JSON.stringify(l.slice(-200)); try { localStorage.setItem('gc_apx_denies', v); } catch (e0) { if (W._gcFreeLocalSpace && W._gcFreeLocalSpace()) localStorage.setItem('gc_apx_denies', v); else throw e0; } } catch (e) { warn(e); } }   """ + MARK + """ */"""))
for i, (o, n) in enumerate(R, 1):
    assert src.count(o) == 1, ('DENYKEEP find-string %d count != 1' % i, src.count(o))
    src = src.replace(o, n)
# 5. the helper + clean-up when the page opens (first script after <head>)
HELPER = """<script>
""" + MARK + """: browser storage is never filled by backup copies (see tools/patch_DENYKEEP.py) */
(function(){
  var BAK = /^(gc_sched_backup|gc_safenet_[a-zA-Z]+|gc_bak_[a-zA-Z]+|gc_projects_backup)$/;
  function len(k){ try { var v = localStorage.getItem(k); return v == null ? 0 : v.length; } catch (e) { return 0; } }
  /* frees the backup copies (biggest first; the data is in IndexedDB and the cloud). true when something was freed */
  window._gcFreeLocalSpace = function(){
    var ks = [], freed = 0; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && BAK.test(k) && k !== 'gc_safenet_meta') ks.push([k, len(k)]); } } catch (e) { return false; }
    ks.sort(function(a, b){ return b[1] - a[1]; });
    ks.forEach(function(x){ if (x[1] > 20000) { try { localStorage.removeItem(x[0]); freed += x[1]; } catch (e) {} } });
    try { if (freed) console.warn('[GC] Browser storage was full: removed ' + Math.round(freed / 1000) + 'k characters of backup copies (the data itself is in IndexedDB and the cloud).'); } catch (e) {}
    return freed > 0;
  };
  /* a backup copy too big for browser storage, left by an earlier visit, is removed */
  try { var big = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && BAK.test(k) && len(k) > 1000000) big.push(k); } big.forEach(function(k){ try { localStorage.removeItem(k); } catch (e) {} });
    if (big.length) console.warn('[GC] Removed ' + big.length + ' oversized backup cop' + (big.length === 1 ? 'y' : 'ies') + ' from browser storage: ' + big.join(', ')); } catch (e) {}
})();
</script>
"""
i = src.find('<head>')
assert i >= 0 and src.count('<head>') >= 1
j = i + len('<head>')
src = src[:j] + '\n' + HELPER + src[j:]
open(path, 'w', encoding='utf-8').write(src)
print('DENYKEEP: patched')
