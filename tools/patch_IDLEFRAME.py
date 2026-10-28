#!/usr/bin/env python3
"""Idempotent patch IDLEFRAME: two "frame-driven" checks asked the browser for a new animation frame 60 times a second,
forever, even with nobody at the computer (the Products / choices chips every 600 ms and the AUTO5 strips every 800 ms).
That keeps the page drawing frames all day and costs CPU and battery on laptops and phones. Both now re-arm with the
browser's own (ungoverned) timer at their real pace: same checks, same timing, about 60x fewer wake-ups.
QA 10/27 overnight (r10): idle main-thread time on the dashboard measured before / after with S/wR10/idle.mjs."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch IDLEFRAME */'
if MARK in t: print('IDLEFRAME: already patched'); sys.exit(0)

def once(src, a, b):
    c = src.count(a)
    assert c == 1, 'IDLEFRAME: expected 1 of %r, found %d' % (a[:90], c)
    return src.replace(a, b)

# 1) the Products / customer-choices chips (patch SYNCPERF's frame check): every 600 ms (30 s when idle)
t = once(t, "/* patch SYNCPERF: every 30 s when nobody has touched the computer for a minute */ try { window.requestAnimationFrame(frame); } catch (e) {} }",
            "/* patch SYNCPERF: every 30 s when nobody has touched the computer for a minute */ " + MARK + " nST(function(){ frame(performance.now()); }, document.hidden ? 5000 : 300); }")
# 2) the AUTO5 strips: every 800 ms
t = once(t, "var lastF = 0; function frame(t){ if (t - lastF > 800) { lastF = t; try { strips(); } catch (e) {} } try { W.requestAnimationFrame(frame); } catch (e) {} }",
            "var lastF = 0; function frame(t){ if (t - lastF > 800) { lastF = t; if (!D.hidden) { try { strips(); } catch (e) {} } } ST.call(W, function(){ frame(performance.now()); }, 400); }   " + MARK)
open(p, 'w', encoding='utf-8').write(t); print('IDLEFRAME: patched')
