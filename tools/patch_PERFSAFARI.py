#!/usr/bin/env python3
"""Idempotent patch PERFSAFARI: the freeze reporter (PERFREP) also sees stalls on iPhone / Safari.

The owner's iPhone (iOS 18.7 Safari, Home Screen app, Field view) sends gc_perfrep_<device> rows with
stats {n1s:0, n3s:0, worst:0} and empty lt / loaf / prof while he feels a lot of lag: Safari (and Firefox) do not
support the 'longtask' / 'long-animation-frame' PerformanceObserver entry types, so PERFREP sections 1-2 never fire.

When PerformanceObserver.supportedEntryTypes has no 'longtask' (or the list is missing), PERFREP runs a fallback:
  * a 100 ms heartbeat (setInterval) while the page is visible, plus a requestAnimationFrame gap check for 10 s after
    each tap / key / scroll (the moments lag is felt; no frame loop running all day on a phone's battery);
  * a stall = a gap that is >= 300 ms longer than expected (100 ms tick / one frame). Gaps while the page is hidden
    (visibilitychange / pagehide; on a phone also the app losing focus) never count: the detector stops then and starts
    afresh; a gap over 30 s (the phone slept) is ignored and counted as "slept". A stall seen by both checks is ONE stall;
  * each stall goes into the existing fields: lt gets { t, v, at, ms, src: 'hb', via, act, actMs, scr, lsw } and stats
    gets n1s / n3s / worst / totalMs (+ stats.det = 'hb'), so the watcher and the admin perf screen read it as before.
    act = the last tap / key within 2 s before the stall: data-a, a button's / tab's label (digits and e-mail addresses
    masked, 24 chars), or the element's tag.class — never what was typed, never a row's text.
    lsw = the large localStorage writes (>= 20,000 chars) started in those 2 s up to the end of the stall: name, size and
    how long the write took — from LSGUARD, which now keeps a ring of the last 30 large writes and per-name counts
    while (and only while) this fallback asks for it (__gcLsGuard.bigW).
  * the report gains hb: { det, since, n, slept, why, lsw } (per-name totals of large writes, top 10).
  * caps as today: lt holds 60 and the report sends the last 40; of those, at most 20 are short (< 1 s) stalls (the oldest
    short one goes first), so they never push the >= 1 s ones out of the report.
Chrome / Edge (longtask supported): nothing changes — no heartbeat, no frame check, no write log, no hb field.
localStorage gc_perfsafari = 'on' forces the fallback (to try it on a desktop), 'off' turns it off.

Usage: python3 tools/patch_PERFSAFARI.py [index.html]   (also keeps tools/lsguard_early.js, LSGUARD's source, in step)
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
MARK = 'patch PERFSAFARI'


def once(s, old, new, what):
    assert s.count(old) == 1, ('PERFSAFARI anchor count != 1', what, s.count(old))
    return s.replace(old, new)


# ── LSGUARD: a ring of large writes (only when PERFSAFARI asks for it) ────────────────────────────────────────────────
G_OLD = "  var G = W.__gcLsGuard = { events: [], count: 0, freed: 0, evicted: 0, refused: 0, viewHeld: 0, toasted: false, onEvent: null, tierOf: tierOf };\n"
G_NEW = G_OLD + (
    "  /* patch PERFSAFARI: while the iPhone / Safari lag detector asks (G.bigW = a size), each localStorage write of at least\n"
    "     that many characters is noted — name, size, when it started, how long it held the page (the last 30, and totals per\n"
    "     name, at most 20 names) — so a stall can be tied to storage churn. Off (0) everywhere else: one comparison per write. */\n"
    "  var PF = W.performance; function pnow(){ try { return PF.now(); } catch (e) { return Date.now(); } }\n"
    "  G.bigW = 0; G.writes = []; G.bigK = {};\n"
    "  function bigNote(k, n, t0){\n"
    "    try { var ms = Math.round(pnow() - t0), kk = String(k).slice(0, 60);\n"
    "      G.writes.push({ k: kk, n: n, ms: ms, t: t0 }); if (G.writes.length > 30) G.writes.shift();\n"
    "      var a = G.bigK[kk]; if (!a) { if (Object.keys(G.bigK).length >= 20) return; a = G.bigK[kk] = { n: 0, chars: 0, ms: 0 }; }\n"
    "      a.n++; a.chars += n; a.ms += ms; } catch (e) {}\n"
    "  }\n")
SET_OLD = "    try { var r = nSet.apply(this, arguments); if (isView) ssView(MEM.v, true); return r; }\n"
SET_NEW = (
    "    var bw = G.bigW && typeof v === 'string' && v.length >= G.bigW ? pnow() : -1;   /* patch PERFSAFARI */\n"
    "    try { var r = nSet.apply(this, arguments); if (isView) ssView(MEM.v, true); if (bw >= 0) bigNote(key, v.length, bw); return r; }\n")


def patch_lsguard(s, what):
    if MARK in s:
        return s, False
    s = once(s, G_OLD, G_NEW, what + ' G')
    s = once(s, SET_OLD, SET_NEW, what + ' setItem')
    return s, True


# ── PERFREP: the fallback detector ────────────────────────────────────────────────────────────────────────────────────
DET = r"""/* patch PERFSAFARI: Safari / iPhone (and Firefox) have no 'longtask' / 'long-animation-frame' report, so 1-2 above never
   fire there. Instead: a 100 ms heartbeat while the page is visible, plus a frame-gap check for 10 s after each tap / key /
   scroll. A gap >= 300 ms longer than expected is a stall: it goes into lt (src 'hb') and stats like a long task, with the
   screen, the last tap within 2 s (a short label, no personal data) and the large localStorage writes in those 2 s.
   Hidden page / app in the background: stopped; a gap over 30 s (the phone slept): ignored. Chrome / Edge: not run.
   localStorage gc_perfsafari = 'on' forces it, 'off' turns it off. */
var HB = null;
(function(){
  var force = ''; try { force = localStorage.getItem('gc_perfsafari') || ''; } catch (e) {}
  if (force === 'off') return;
  var sup = null; try { sup = W.PerformanceObserver && W.PerformanceObserver.supportedEntryTypes; } catch (e) {}
  if (force !== 'on' && sup && typeof sup.indexOf === 'function' && sup.indexOf('longtask') >= 0) return;   /* the browser reports long tasks itself */
  var D = W.document, PF = W.performance, RAF = W.requestAnimationFrame, CI = W.clearInterval;
  if (!D || typeof SI !== 'function') return;
  function now(){ try { return PF.now(); } catch (e) { return Date.now(); } }
  var INT = 100, FRAME = 17, OVER = 300, SLEEP = 30000, ACTW = 2000, RAFW = 10000, BIGW = 20000;
  var iv = null, run = false, last = 0, fOn = false, fLast = 0, fUntil = 0, act = null, scr = -1e9, cur = null;
  var LSG = W.__gcLsGuard; if (LSG && 'bigW' in LSG) LSG.bigW = BIGW;
  var H = HB = { det: 'hb', since: new Date().toISOString(), n: 0, slept: 0, why: force === 'on' ? 'forced' : (sup ? 'no longtask' : 'no entry-type list') };
  stats.det = 'hb';
  function mask(t){ return s(t).replace(/\s+/g, ' ').trim().replace(/\S+@\S+/g, '@').replace(/\d/g, '#').slice(0, 24); }
  function label(el){
    try {
      var first = el;
      for (var i = 0; el && el.nodeType === 1 && i < 6; i++, el = el.parentElement) {
        var a = el.getAttribute('data-a'); if (a) return 'a:' + mask(a);
        var tg = el.tagName.toLowerCase(), r = el.getAttribute('role') || '';
        if (tg === 'input' || tg === 'textarea' || tg === 'select') return tg + ':' + mask(el.getAttribute('name') || el.getAttribute('type') || '');
        if (tg === 'button' || r === 'button' || r === 'tab' || r === 'menuitem') return tg + ':' + mask(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent);
      }
      if (first && first.nodeType === 1) { var c = s(first.getAttribute('class')).trim().split(/\s+/)[0]; return first.tagName.toLowerCase() + (first.id ? '#' + mask(first.id) : '') + (c ? '.' + mask(c) : ''); }
    } catch (e) {}
    return '';
  }
  var KIND = { pointerdown: 'tap', click: 'click', keydown: 'key', change: 'change' };
  function onAct(ev){
    try { act = { t: now(), l: KIND[ev.type] + (ev.type === 'keydown' ? '' : ' ' + label(ev.target)) }; } catch (e) {}
    wake();
  }
  function add(ms, sg){ if (ms >= 1000) stats.n1s += sg; if (ms >= 3000) stats.n3s += sg; stats.totalMs += sg * ms; if (sg > 0 && ms > stats.worst) stats.worst = ms; }
  function record(a, b, ms, via){
    var e;
    if (cur && a < cur.e) {                       /* the same stall, seen by the other check */
      e = cur.rec; cur.e = Math.max(cur.e, b); if (e.via !== via) e.via = 'both';
      if (ms > e.ms) { add(e.ms, -1); e.ms = ms; add(ms, 1); }
      dirty = true; return;
    }
    e = { t: Math.round(a), ms: ms, v: view(), at: Date.now(), src: 'hb', via: via };
    if (act && act.t >= a - ACTW && act.t <= b) { e.act = act.l; e.actMs = Math.round(a - act.t); }
    if (scr >= a - ACTW && scr <= b) e.scr = 1;
    try { if (LSG && LSG.writes && LSG.writes.length) {
      var w = LSG.writes.filter(function(x){ return x.t >= a - ACTW && x.t <= b; }).sort(function(p, q){ return q.n - p.n; }).slice(0, 3)
        .map(function(x){ return { k: s(x.k).slice(0, 40), n: x.n, ms: x.ms }; });
      if (w.length) e.lsw = w; } } catch (x) {}
    cur = { e: b, rec: e }; H.n++; add(ms, 1);
    LT.push(e);
    if (ms < LIM) { var sm = 0, i0 = -1; for (var i = 0; i < LT.length; i++) if (LT[i].ms < LIM) { sm++; if (i0 < 0) i0 = i; }
      if (sm > 20) LT.splice(i0, 1); }          /* at most 20 short (< 1 s) ones: they never push the >= 1 s ones out of the report */
    if (LT.length > 60) LT.shift();               /* as today */
    dirty = true;
  }
  function check(a, b, exp, via){
    var gap = b - a; if (gap - exp < OVER) return;
    if (gap > SLEEP) { H.slept++; return; }      /* the phone slept / the app was frozen: not lag */
    record(a, b, Math.round(gap - exp), via);
  }
  function tick(){
    if (!run) return;
    if (D.hidden) { stop(); return; }
    var t = now(); if (last) check(last, t, INT, 'tick'); last = t;
  }
  function frame(){
    var t = now();
    if (!run || t > fUntil) { fOn = false; fLast = 0; return; }
    if (fLast) check(fLast, t, FRAME, 'frame'); fLast = t;
    try { RAF.call(W, frame); } catch (e) { fOn = false; }
  }
  function wake(){
    fUntil = now() + RAFW;
    if (run && !fOn && typeof RAF === 'function') { fOn = true; fLast = 0; try { RAF.call(W, frame); } catch (e) { fOn = false; } }
  }
  function start(){ if (run || D.hidden) return; run = true; last = now(); fLast = 0; cur = null; if (!iv) iv = SI.call(W, tick, INT); }
  function stop(){ run = false; last = 0; fLast = 0; cur = null; if (iv) { try { CI.call(W, iv); } catch (e) {} iv = null; } }
  try {
    ['pointerdown', 'click', 'keydown', 'change'].forEach(function(t){ W.addEventListener(t, onAct, { capture: true, passive: true }); });
    D.addEventListener('scroll', function(){ scr = now(); if (now() > fUntil - RAFW + 500) wake(); }, { capture: true, passive: true });
    D.addEventListener('visibilitychange', function(){ if (D.hidden) stop(); else start(); });
    W.addEventListener('pagehide', stop); W.addEventListener('pageshow', start);
    if (MOBILE || (navigator.maxTouchPoints || 0) > 1) { W.addEventListener('blur', stop); W.addEventListener('focus', start); }   /* app switcher / Control Center */
  } catch (e) {}
  start();
  H.rep = function(){
    var o = { det: H.det, since: H.since, n: H.n, slept: H.slept, why: H.why };
    try { var k = LSG && LSG.bigK; if (k) o.lsw = Object.keys(k).sort(function(p, q){ return k[q].ms - k[p].ms || k[q].n - k[p].n; }).slice(0, 10)
      .map(function(x){ return { k: x.slice(0, 40), n: k[x].n, chars: k[x].chars, ms: k[x].ms }; }); } catch (e) {}
    return o;
  };
})();

"""
DET_ANCHOR = "/* 3. sampling profile of the stalled seconds (Chromium / Edge, only when the page is served with Document-Policy: js-profiling) */\n"
REP_ANCHOR = "function signedIn(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return false; } }\n"
REP_WRAP = ("/* patch PERFSAFARI: the fallback's summary (only where it runs) */\n"
            "if (HB) { var report0 = report; report = function(){ var r = report0(); try { r.hb = HB.rep(); } catch (e) {} return r; }; }\n")

src = open(path, encoding='utf-8').read()
changed = False

# 1. PERFREP (only inside its own <script>)
OPEN = '<script id="gc-patch-perfrep">'
i = src.index(OPEN); j = src.index('</script>', i)
blk = src[i:j]
if MARK not in blk:
    assert '</script' not in DET
    blk = once(blk, DET_ANCHOR, DET + DET_ANCHOR, 'perfrep detector')
    blk = once(blk, REP_ANCHOR, REP_WRAP + REP_ANCHOR, 'perfrep report')
    src = src[:i] + blk + src[j:]
    changed = True

# 2. LSGUARD in the page (its own <script>)
OPEN = '<script id="gc-patch-lsguard">'
i = src.index(OPEN); j = src.index('</script>', i)
blk, ch = patch_lsguard(src[i:j], 'index.html lsguard')
if ch:
    src = src[:i] + blk + src[j:]
    changed = True

if changed:
    open(path, 'w', encoding='utf-8').write(src)
    print('PERFSAFARI: patched', path)
else:
    print('PERFSAFARI: already patched', path)

# 3. LSGUARD's source file stays the same as the page
early = os.path.join(HERE, 'lsguard_early.js')
if os.path.exists(early):
    t = open(early, encoding='utf-8').read()
    t2, ch = patch_lsguard(t, 'lsguard_early.js')
    if ch:
        open(early, 'w', encoding='utf-8').write(t2)
        print('PERFSAFARI: patched', early)
