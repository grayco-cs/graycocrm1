#!/usr/bin/env python3
"""Idempotent patch FIELDGUARD: a GrayCo Field phone never rewrites the company's lists by itself (11/18: a PM's iPhone,
first open in 16 days, uploaded ~40 shared lists with no tap and restamped 380 of 480 jobs).

1. tools/fieldguard_block.html becomes a script right after LSGUARD (before the sign-in layer captures fetch): on a Field
   phone of a person who is not an admin / the office, a gc_kv write of a shared key goes up only when a person changed
   that key (marked at the edit, kept until the database answers OK: offline, busy retries and slow saves still go);
   stamp-only records are sent as the cloud has them; office-sized local copies (gc_snap_* / gc_safenet_* / gc_bak_* /
   gc_projects_backup / gc_sched_backup) are kept off the phone's localStorage.
2. KEEPFOREVER: gc_kept_log is written at most once every 5 s (it was rewritten on every repair).
Kill switch: localStorage gc_fieldguard_off = '1'.
Usage: python3 tools/patch_FIELDGUARD.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_FIELDGUARD__' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fieldguard_block.html'), encoding='utf-8').read().rstrip('\n')
a = src.index('<script id="gc-patch-lsguard">'); b = src.index('</script>', a) + len('</script>')
src = src[:b] + '\n' + BLOCK + src[b:]
src = once(src, """    var h=JSON.parse(localStorage.getItem('gc_kept_log')||'[]');
    h.push(rec); if(h.length>300) h=h.slice(-300);
    localStorage.setItem('gc_kept_log', JSON.stringify(h));
  }catch(e){}
}""", """    /* patch FIELDGUARD: the log is written at most once every 5 s (a phone's first open wrote this 300-entry log 97 times
       in 2 minutes, 2.6 M characters into a full localStorage); every repair is still in it */
    keptPend.push(rec);
    if(!keptT) keptT = (window.__GC_NATIVE_SETTIMEOUT__ || setTimeout).call(window, flushKept, 5000);
  }catch(e){}
}
var keptPend = [], keptT = 0;
function flushKept(){
  keptT = 0; if(!keptPend.length) return;
  try{
    var h=JSON.parse(localStorage.getItem('gc_kept_log')||'[]'); if(!Array.isArray(h)) h=[];
    h = h.concat(keptPend); keptPend = []; if(h.length>300) h=h.slice(-300);
    localStorage.setItem('gc_kept_log', JSON.stringify(h));
  }catch(e){ keptPend = []; }
}
try{ window.addEventListener('pagehide', flushKept); }catch(e){}""")
open(path, 'w', encoding='utf-8').write(src)
print('patched')
