#!/usr/bin/env python3
"""Idempotent patch FIELDLAG: GrayCo Field scrolls smoothly on a phone (owner 11/04: "it's lagging on Biffle field view
right now scrolling through it").

1. tools/fieldlag_early.js becomes a script right after LSSLIM2 (before BOOTSAFE): __gcFL (scroll-in-progress pacing,
   Field-on-screen test, unchanged-large-value localStorage skip, builder mirrors kept in memory, _gcApprovalSet reuse).
2. The paced setInterval governor skips a tick while a scroll is in progress (__gcFL.pace).
3. NAV: the floating-button dodge runs once a scroll has stopped (not every 150 ms of it), from a passive listener;
   its 0.7 s loop does not re-measure during a scroll, and its desk table un-clip skips while Field is on screen;
   the "check once a scroll stops" waits 400 ms (200 ms fired between the steps of one scroll).
4. TODOPERF: with Field on screen and no To-Do item in sight, the To-Do state is not rebuilt for a badge nobody sees.
5. AP3: the desk job-header e-mail button scan skips while Field is on screen.
6. The page-wide touchmove listener (iOS root bounce) is replaced by CSS overscroll-behavior, so touch scrolling never
   waits on the page's script.
Kill switch: localStorage gc_fieldlag_off = '1'.
Usage: python3 tools/patch_FIELDLAG.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_FIELDLAG__'
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_LSSLIM2__' in src, 'FIELDLAG goes after LSSLIM2'

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

EARLY = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fieldlag_early.js'), encoding='utf-8').read()
assert MARK in EARLY and '</script' not in EARLY

# 1. right after LSSLIM2
src = once(src, '</script>\n<script id="gc-patch-bootsafe">',
  '</script>\n<script id="gc-patch-fieldlag">\n' + EARLY.rstrip('\n') + '\n</script>\n<script id="gc-patch-bootsafe">')

# 2. the paced setInterval governor
A = "          if(!(_ms >= 29000) && _n-(window.__GC_LAST_INPUT_AT__||0) > 60000 && _n-_lastRun < 29000) return;   /* a loop slower than that keeps its own pace */\n"
src = once(src, A, A + "          if(window.__gcFL && window.__gcFL.pace(_n-_lastRun, _ms)) return;   /* patch FIELDLAG: not while a scroll is in progress */\n")

# 3. NAV
src = once(src, "function dodgeSoon(){ if (dq) return; dq = true; RT(function(){ dq = false; dodgeAll(); }, 150); }\nW.addEventListener('scroll', dodgeSoon, true);",
  "function dodgeSoon(){ if (W.__gcFL) { clearTimeout(dq); dq = RT(function(){ dq = false; dodgeAll(); }, 300); return; } if (dq) return; dq = true; RT(function(){ dq = false; dodgeAll(); }, 150); }   /* patch FIELDLAG: once the scroll stops */\n"
  "W.addEventListener('scroll', dodgeSoon, { capture: true, passive: true });")
src = once(src, "W.addEventListener('scroll', function(){ try { clearTimeout(_nfS); } catch (e) {} _nfS = RT(soon, 200); }, { capture: true, passive: true });",
  "W.addEventListener('scroll', function(){ try { clearTimeout(_nfS); } catch (e) {} _nfS = RT(soon, W.__gcFL ? 400 : 200); }, { capture: true, passive: true });   /* patch FIELDLAG: 400 ms */")
src = once(src, "RI(function(){ if (W._gcIdleSkip && W._gcIdleSkip(_gcNavIdle, 5000)) return; try { sync(); } catch (e) {} try { ensureTabs(); } catch (e) {} if (Date.now() - _gcNavHeavy < 4000) return; _gcNavHeavy = Date.now(); try { unclipActions(); } catch (e) {} try { dodgeAll(); } catch (e) {} }, 700);",
  "RI(function(){ if (W.__gcFL && W.__gcFL.scrolling()) return; /* patch FIELDLAG: the scroll's own stop-check re-measures */ if (W._gcIdleSkip && W._gcIdleSkip(_gcNavIdle, 5000)) return; try { sync(); } catch (e) {} try { ensureTabs(); } catch (e) {} if (Date.now() - _gcNavHeavy < 4000) return; _gcNavHeavy = Date.now(); if (!(W.__gcFL && W.__gcFL.desk('NAV-unclip'))) try { unclipActions(); } catch (e) {} try { dodgeAll(); } catch (e) {} }, 700);")

# 4. TODOPERF
src = once(src, "    if (D.hidden) return;\n    var k = counts(); if (!k) return;\n    if (!els.length || els.some(function(e){ return !e.isConnected; })) els = findEls();\n",
  "    if (D.hidden) return;\n"
  "    if (W.__gcFL && W.__gcFL.fieldUp()) { if (!els.length || els.some(function(e){ return !e.isConnected; })) els = findEls(); if (!els.some(function(e){ return e.offsetParent !== null; })) { W.__gcFL.desk('TODOPERF'); return; } }   /* patch FIELDLAG: no To-Do item in sight */\n"
  "    var k = counts(); if (!k) return;\n    if (!els.length || els.some(function(e){ return !e.isConnected; })) els = findEls();\n")

# 5. AP3
src = once(src, "if(_ap3Dirty){ _ap3Dirty = false; try{ scanText(); }catch(e){} } try{ deskJob(); }catch(e){} try{ fieldCards(); }catch(e){} }",
  "if(_ap3Dirty){ _ap3Dirty = false; try{ scanText(); }catch(e){} } if(!(window.__gcFL && window.__gcFL.desk('AP3'))) try{ deskJob(); }catch(e){} try{ fieldCards(); }catch(e){} }   /* patch FIELDLAG: deskJob only on Desk view */")

# 6. the document-wide touchmove listener (iOS bounce on the page root) was not passive: every finger move on the
#    phone waited for the page's script before the screen could scroll, so any busy moment froze the scroll.
#    Now passive, and the root bounce is stopped by CSS (overscroll-behavior) instead. Off: the old listener.
src = once(src, "document.addEventListener('touchmove', function(e){\n  if(e.target === document.body || e.target === document.documentElement){\n    e.preventDefault();\n  }\n}, {passive: false});",
  "if(window.__gcFL){ try{ var _flOb = document.createElement('style'); _flOb.id = 'gc-fieldlag-ob'; _flOb.textContent = 'html,body{overscroll-behavior-y:none}'; (document.head || document.documentElement).appendChild(_flOb); }catch(_e){} }   /* patch FIELDLAG: CSS stops the bounce; the finger never waits for script */\n"
  "else document.addEventListener('touchmove', function(e){\n  if(e.target === document.body || e.target === document.documentElement){\n    e.preventDefault();\n  }\n}, {passive: false});")

open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDLAG')
