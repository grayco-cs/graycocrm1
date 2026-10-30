#!/usr/bin/env python3
"""Idempotent patch DRAFTPILL: the orange "Unsaved estimate draft -- click Save" bubble showed on every screen (the
estimate builder stays in the page after it is closed), sat over the menu's Sign out, and came and went every 2 s.
Now it shows only while the estimate builder is open, a draft counts as saved once its estimate was saved at or
after the draft's time (deleting lines and saving no longer leaves it "unsaved" forever), and the bubble is only
touched when what it says changes. The restore-on-start bar is unchanged. Usage: python3 tools/patch_DRAFTPILL.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch DRAFTPILL'
if MARK in t: print('DRAFTPILL: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('DRAFTPILL anchor count != 1', n, old[:80]); t = t.replace(old, new)

once("""      var inBuilder = !!(document.getElementById('ej-name') || document.getElementById('est-lines'));
      var ind=document.getElementById('_gcSavedInd');""",
"""      """ + MARK + """: only while the builder is on screen (it stays in the page after it is closed) */
      var _ov=document.getElementById('gc-est-overlay'), _en=document.getElementById('ej-name')||document.getElementById('est-lines');
      var inBuilder = _ov ? !!_ov.getClientRects().length : !!(_en && _en.getClientRects().length);
      var ind=document.getElementById('_gcSavedInd');""")
once("""        return !saved.some(function(e){
          return e && e.id===id && Array.isArray(e.lines) && e.lines.length>=s.lines.length;
        });
      });
      if(!unsaved.length){ if(ind) ind.remove(); return; }""",
"""        return !saved.some(function(e){
          if(!e || e.id!==id) return false;
          if(Array.isArray(e.lines) && e.lines.length>=s.lines.length) return true;
          var es=Date.parse(e.savedAt||e.updatedAt||e.updated_at||''), ss=Date.parse(s.savedAt||'');
          return !!(es && ss && es>=ss-5000);   /* saved at or after the draft (lines deleted, then saved) */
        });
      });
      if(!unsaved.length){ if(ind) ind.remove(); return; }""")
once("""      ind.textContent='\\u26a0 Unsaved estimate draft'+(t?(' \\u00b7 '+t):'')+' \\u2014 click Save';
    }catch(e){}""",
"""      var _tx='\\u26a0 Unsaved estimate draft'+(t?(' \\u00b7 '+t):'')+' \\u2014 click Save';
      if(ind.textContent!==_tx) ind.textContent=_tx;
    }catch(e){}""")
open(p, 'w', encoding='utf-8').write(t)
print('DRAFTPILL: patched', p)
