#!/usr/bin/env python3
"""patch TVPHOTO (owner 11/03: "every photo on office tv should change with the screen changing").
Before: only Golf changed photo with each slide (in a fixed order); National parks and Office photos changed every 2 minutes
(personal photo screens every 30 s), whatever the slide. Now every photo look on the back office TV (#gc-otv) changes photo
each time the screen (slide) changes, in a shuffled order that goes through the whole set before repeating and never shows
the photo just shown; the next photo is preloaded, and the change is the existing 2 s cross-fade (a new photo goes on only
once loaded). Personal photos + clock screens (no slides) keep their 30 s timer. Only the photo choice in tools/tvfix.js
(and its inlined copy in index.html) changes. Idempotent."""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = '/* patch TVPHOTO */'
REPL = [
  ("    if (th === 'golf' ? (BG.slide !== sl || BG.at === 0) : Date.now() - BG.at >= every) { BG.at = Date.now(); BG.slide = sl; BG.i++; showPhoto(bg, th, refs); }",
   "    var perSlide = !(CUR && CUR.mode !== 'office'); " + MARK + " try { sl = s(tv.__state && tv.__state().slide); } catch (e) {}\n"
   "    if (perSlide ? (BG.slide !== sl || BG.at === 0) : Date.now() - BG.at >= every) { BG.at = Date.now(); BG.slide = sl; BG.i++; showPhoto(bg, th, refs); }"),
  ("    if (BG.k !== key) { BG.k = key; BG.i = -1; BG.at = 0; }",
   "    if (BG.k !== key) { BG.k = key; BG.i = -1; BG.at = 0; BG.ord = null; }"),
  ("function showPhoto(bg, th, refs){\n",
   "/* patch TVPHOTO: the next photo of n — a shuffled pass through all n, never the one just shown */\n"
   "function bgPick(n){\n"
   "  if (!BG.ord || BG.ord.n !== n || !BG.ord.length) { var o = [], i, j, t; for (i = 0; i < n; i++) o.push(i);\n"
   "    for (i = n - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = o[i]; o[i] = o[j]; o[j] = t; }\n"
   "    if (n > 1 && o[0] === BG.last) { t = o[0]; o[0] = o[n - 1]; o[n - 1] = t; } o.n = n; BG.ord = o; }\n"
   "  BG.last = BG.ord.shift(); return BG.last; }\n"
   "function bgPre(url){ try { (new Image()).src = url; } catch (e) {} }\n"
   "function showPhoto(bg, th, refs){\n"),
  ("  if (th === 'parks') { var p = PARKS[BG.i % PARKS.length]; put('/img/tv/parks/' + p[0] + '.jpg', '📍 ' + p[1] + ' · NPS photo'); return; }",
   "  var n = th === 'parks' ? PARKS.length : th === 'golf' ? GOLF.length : refs.length, k = bgPick(n), nx = BG.ord.length ? BG.ord[0] : -1;\n"
   "  if (th === 'parks') { var p = PARKS[k]; put('/img/tv/parks/' + p[0] + '.jpg', '📍 ' + p[1] + ' · NPS photo'); if (nx >= 0) bgPre('/img/tv/parks/' + PARKS[nx][0] + '.jpg'); return; }"),
  ("  if (th === 'golf') { var g = GOLF[BG.i % GOLF.length]; put(",
   "  if (th === 'golf') { if (nx >= 0) bgPre('/img/tv/golf/' + GOLF[nx].f); var g = GOLF[k]; put("),
  ("  var ref = refs[BG.i % refs.length];",
   "  var ref = refs[k]; if (nx >= 0 && typeof W._gcFileUrl === 'function') Promise.resolve(W._gcFileUrl(refs[nx])).then(bgPre, function(){});"),
]
def patch(path):
    src = open(path, encoding='utf-8').read()
    if MARK in src: print(os.path.relpath(path, ROOT) + ': already patched'); return
    for a, b in REPL:
        c = src.count(a)
        assert c == 1, '%s: anchor found %d times: %r' % (path, c, a[:80])
        src = src.replace(a, b)
    open(path, 'w', encoding='utf-8').write(src); print(os.path.relpath(path, ROOT) + ': patched')
for f in ('tools/tvfix.js', 'index.html'): patch(os.path.join(ROOT, f))
