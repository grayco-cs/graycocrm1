#!/usr/bin/env python3
"""patch OPENJOBFIX (owner 11/9): the "marked as ACTIVE — Open project to complete setup now?" pop-up opens the job (window._navToJob);
it was clicking a [data-projid] row that no longer exists. And no pop-up for a status the CRM moved by itself (STATUSAUTO)."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if 'OPENJOBFIX' in src: print('already patched'); sys.exit(0)
pairs = [("""    if(prev && prev !== curr && ['active','approved','won'].includes(curr)){""",
"""    var _auto = Array.isArray(p.statusLog) && p.statusLog.length && p.statusLog[p.statusLog.length-1].by === 'auto' && p.statusLog[p.statusLog.length-1].to === curr;   /* STATUSAUTO: no pop-up for a move the CRM made by itself */
    if(prev && prev !== curr && ['active','approved','won'].includes(curr) && !_auto){"""),
("""          if(go && window._setView){
            window._setView('projects');
            setTimeout(function(){
              var pe = document.querySelector('[data-projid="'+p.id+'"]') || null;
              if(pe) pe.click();
            },500);
          }""",
"""          if(go){   /* OPENJOBFIX (owner 11/9: "clicked it and it didn't open the job"): open the job itself */
            try { if (typeof window._navToJob === 'function') { window._navToJob(p.id); return; } } catch(e) {}
            if(window._setView){ window._setView('projects'); setTimeout(function(){ try { if (typeof window._navToJob === 'function') window._navToJob(p.id); } catch(e) {} },600); }
          }""")]
for a, b in pairs:
    assert src.count(a) == 1, a[:50]; src = src.replace(a, b)
open(P, 'w', encoding='utf-8').write(src); print('patched')
