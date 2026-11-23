#!/usr/bin/env python3
"""Idempotent patch QUIET: GrayCo Field home on a phone is quiet — the desk-only scans do not run while it is on screen
(owner 11/20: "The app has got to work quickly while I'm in the field."; docs/FASTOPEN.md plan item (d)).

Measured (owner-iPhone profile, CPU x4, real-data snapshot): with nobody touching the phone, Field home kept the page busy
most of the time, a good part of it desk-only DOM work — NAV's "way back" scans, AP3's e-mail buttons, the To-Do badge
(TODOPERF), DESKFIT / PROJTBL (desk tables), QBCSV's QuickBooks decorations, MULTICO-UI's company switcher, JOBFILL's job tabs,
the environmental compliance panels (ENVCOMP / ENVDOCS / EPAHUD) — re-scanning a page whose desk screens are not there. A tap
on Field home waited behind them.

The patch (a script before every other one, so it sees every timer / page-watcher the patches make):
  * each timer and page watcher (MutationObserver) is tagged with the script that made it (document.currentScript; a timer
    made inside another's callback inherits its tag). Untagged ones are left exactly as they are.
  * for the scripts in QUIET (desk-only UI), while GrayCo Field HOME is on screen on a phone (html._fieldmode, the Field home
    #_gcJobPick.gc-fh, no job page, a phone by _gcDevice.phone(), page visible): a repeating timer of <= 5 s skips its tick
    (the last skipped tick is kept) and a page watcher's callback is skipped. One-shot timers, slow timers (their cloud reads
    and sweeps), events and promises run as before.
  * the moment Field home is left (a job page, the desk, another screen), every kept tick runs once, one per 40 ms.
  * a desk, a tablet, a Field job page and every other screen: nothing changes.
  * everywhere: a DOM write that changes nothing is not made (a title / class / aria / data / role / style attribute set to
    the value it has, a class added that is there or removed that is not, an element's text set to the text it has). The
    page is the same; the page-watcher wave and re-layout each such write caused go away.
Off on a device: localStorage gc_quiet_off = '1'.  Console: __gcQuiet.state()
Usage: python3 tools/patch_QUIET.py [index.html]   (before or after patch_RESUME.py; QUIET goes in front of RESUME)
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

QUIET = ['nav', 'ap3', 'todoperf', 'deskfit', 'projtbl', 'qbcsv', 'multico-ui', 'jobfill', 'envcomp', 'envdocs', 'epahud']

SCRIPT = r'''<script id="gc-patch-quiet">
/* __GC_PATCH_QUIET__ — GrayCo Field home on a phone is quiet (tools/patch_QUIET.py). While Field home is on screen on a phone,
   the desk-only scripts' fast repeating timers (<= 5 s) skip their ticks and their page watchers are skipped; leaving Field
   home runs each kept tick once. Every timer / watcher is tagged with the script that made it; untagged ones, one-shot and
   slow timers, events, a desk, a tablet and every other screen: as before. Off: localStorage gc_quiet_off = '1'.
   Console: __gcQuiet.state() */
(function(){
'use strict';
var W = window, D = document;
if (W.__gcQuiet) return;
var LIST = {}; __LIST__.forEach(function(k){ LIST['gc-patch-' + k] = 1; });
var off = false; try { off = W.localStorage.getItem('gc_quiet_off') === '1'; } catch (e) {}
var S = { skips: {}, moSkips: {}, flushes: 0, flushed: 0, home: false, homeMs: 0, since: Date.now() };
W.__gcQuiet = { off: off, list: Object.keys(LIST), state: function(){ var o = JSON.parse(JSON.stringify(S)); o.off = off; o.held = held.size; o.homeNow = home(); return o; } };
var held = new Map();
if (off) return;
var nST = W.setTimeout, nSI = W.setInterval, NMO = W.MutationObserver;
var cur = '';
function owner(){ if (cur) return cur; try { var s = D.currentScript; return (s && s.id) || ''; } catch (e) { return ''; } }
var hAt = 0, hV = false;
function home(){
  var n = Date.now(); if (n - hAt < 250) return hV; hAt = n;
  try {
    var h = D.documentElement;
    hV = !!(h.classList.contains('_fieldmode') && D.visibilityState !== 'hidden' && W._gcDevice && typeof W._gcDevice.phone === 'function' && W._gcDevice.phone() &&
      D.querySelector('#_gcJobPick.gc-fh') && !D.getElementById('_gcJobDash'));
  } catch (e) { hV = false; }
  return hV;
}
function run(o, f, self, args){ var prev = cur; cur = o; try { return f.apply(self, args); } finally { cur = prev; } }
/* timers: tagged; a desk-only script's fast repeating timer skips its tick on Field home (the last one is kept) */
function timer(native, repeat){
  return function(fn, ms){
    var o = typeof fn === 'function' ? owner() : '';
    if (!o) return native.apply(W, arguments);
    var a = Array.prototype.slice.call(arguments), f = fn, gate = repeat && LIST[o] && +ms <= 5000, box = {};
    a[0] = function(){
      if (gate && home()) { held.set(box, { o: o, f: f, self: this, args: arguments }); S.skips[o] = (S.skips[o] || 0) + 1; return; }
      return run(o, f, this, arguments);
    };
    return native.apply(W, a);
  };
}
var qST = timer(nST, false), qSI = timer(nSI, true);
W.setTimeout = qST; W.setInterval = qSI;
/* the "native" timers (the ones patches use so the interval governors leave them alone) are tagged the same way */
try { if (!W.__GC_NATIVE_SETINTERVAL__) W.__GC_NATIVE_SETINTERVAL__ = qSI; if (!W.__GC_NATIVE_SETTIMEOUT__) W.__GC_NATIVE_SETTIMEOUT__ = qST; if (!W.__GC_NATIVE_CLEARINTERVAL__) W.__GC_NATIVE_CLEARINTERVAL__ = W.clearInterval; } catch (e) {}
/* page watchers */
if (typeof NMO === 'function') {
  try {
    var QMO = function(cb){
      var o = owner(), g = !!LIST[o], f = cb;
      if (o && typeof cb === 'function') f = function(muts, obs){
        if (g && home()) { S.moSkips[o] = (S.moSkips[o] || 0) + 1; return; }
        return run(o, cb, this, arguments);
      };
      return new NMO(f);
    };
    QMO.prototype = NMO.prototype;
    W.MutationObserver = QMO;
  } catch (e) {}
}
/* a write that changes nothing does not touch the page: a title / class / aria / data / role / style attribute set to the
   value it already has, a class added that is there (removed that is not), a text set to the text already there. The page
   looks and behaves the same; what goes away is the page-watcher wave (~35 watchers on the body) and the re-layout each such
   write caused — measured on Field home: badges re-setting the same title / aria-label / class every second */
try {
  var EP = W.Element && W.Element.prototype, SAFE = /^(title|class|role|style|tabindex|hidden|aria-[\w-]+|data-[\w-]+)$/i;
  S.same = 0;
  /* not on <html> / <body>: a class set again there can be a signal other scripts watch for */
  var top2 = function(el){ return el === D.documentElement || el === D.body; };
  if (EP && EP.setAttribute) { var sA = EP.setAttribute; EP.setAttribute = function(n, v){ try { if (!top2(this) && SAFE.test(n) && this.getAttribute(n) === String(v)) { S.same++; return; } } catch (e) {} return sA.apply(this, arguments); }; }
  var same = function(proto, prop){
    var d = proto && Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.set || !d.get || !d.configurable) return;
    Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get: d.get, set: function(v){ try { if (!top2(this) && d.get.call(this) === String(v)) { S.same++; return; } } catch (e) {} return d.set.call(this, v); } });
  };
  same(W.HTMLElement && W.HTMLElement.prototype, 'title');
  same(EP, 'className');
  same(EP, 'ariaLabel');
  var TL = W.DOMTokenList && W.DOMTokenList.prototype;
  if (TL && TL.add && TL.remove && TL.toggle && TL.contains) {
    var tA = TL.add, tR = TL.remove, tT = TL.toggle, tC = TL.contains;
    var tlTop = function(tl){ try { return tl === D.documentElement.classList || (D.body && tl === D.body.classList); } catch (e) { return true; } };
    TL.add = function(){ try { var all = !tlTop(this); for (var i = 0; i < arguments.length; i++) if (!tC.call(this, arguments[i])) { all = false; break; } if (all && arguments.length) { S.same++; return; } } catch (e) {} return tA.apply(this, arguments); };
    TL.remove = function(){ try { var none = !tlTop(this); for (var i = 0; i < arguments.length; i++) if (tC.call(this, arguments[i])) { none = false; break; } if (none && arguments.length) { S.same++; return; } } catch (e) {} return tR.apply(this, arguments); };
    TL.toggle = function(t, force){ try { if (!tlTop(this) && arguments.length > 1 && force !== undefined && tC.call(this, t) === !!force) { S.same++; return !!force; } } catch (e) {} return tT.apply(this, arguments); };
  }
  var NP = W.Node && W.Node.prototype, dTC = NP && Object.getOwnPropertyDescriptor(NP, 'textContent');
  if (dTC && dTC.set && dTC.get && dTC.configurable) Object.defineProperty(NP, 'textContent', { configurable: true, enumerable: dTC.enumerable, get: dTC.get, set: function(v){
    try { if (this.nodeType === 1) { var s = v == null ? '' : String(v), c = this.childNodes;
      if ((c.length === 1 && c[0].nodeType === 3 && c[0].data === s) || (c.length === 0 && s === '')) { S.same++; return; } } } catch (e) {}
    return dTC.set.call(this, v); } });
} catch (e) {}
/* leaving Field home: every kept tick once, one per 40 ms */
function flush(){
  if (!held.size) return;
  var items = []; held.forEach(function(v){ items.push(v); }); held.clear(); S.flushes++;
  items.forEach(function(it, i){ nST.call(W, function(){ if (home()) return; S.flushed++; try { run(it.o, it.f, it.self, it.args); } catch (e) { try { nST.call(W, function(){ throw e; }, 0); } catch (x) {} } }, 40 * i); });
}
var t0 = 0;
nSI.call(W, function(){
  var h = home();
  if (h && !S.home) t0 = Date.now();
  if (!h && S.home) { S.homeMs += Date.now() - t0; flush(); }
  S.home = h;
}, 300);
})();
</script>
'''

# LEADWATCH's Field card and the time-off strip (and ENVCOMP's health button) each wanted the place right under the Field
# home top: they swapped places every tick (a remove + insert each, the page watchers and a re-layout each time)
LW_OLD = """    place('gc-lw-field', home, ra ? ra.nextSibling : (home ? home.firstChild : null), L, 'field');
"""
LW_NEW = """    /* patch QUIET: after the strips that also sit under the top (time off, health records), not fighting them for the place */
    var anc = ra; while (anc && anc.nextSibling && (anc.nextSibling.id === 'gc-to-strip' || anc.nextSibling.id === 'gc-ec-minebtn')) anc = anc.nextSibling;
    var lwb = D.getElementById('gc-lw-field');
    if (lwb && anc && lwb.parentElement === home && lwb.previousSibling === anc) place('gc-lw-field', home, lwb.nextSibling, L, 'field');
    else place('gc-lw-field', home, anc ? anc.nextSibling : (home ? home.firstChild : null), L, 'field');
"""
# STORECUT's kept copies of big rows (answered only when the row's stamps are EXACTLY the same — asked first, every time)
# expired after 10 minutes: a return to the app after a longer time away downloaded estimates__chunkN (1-2 MB each),
# gc_office_tasks, leads, projects again although nothing had changed. The stamp check is what keeps them right; the age
# limit only bounds memory (VC_MAX still does that): 6 hours.
VC_OLD = """var VC = new Map(), VC_TTL = 10 * 60e3, VC_MIN = 50000, VC_MAX = 16e6, vcBytes = 0;"""
VC_NEW = """var VC = new Map(), VC_TTL = 6 * 3600e3, VC_MIN = 50000, VC_MAX = 16e6, vcBytes = 0;   /* patch QUIET: 10 min -> 6 h (the stamps decide) */"""
EDITS = ((LW_OLD, LW_NEW, 'leadwatch field card'), (VC_OLD, VC_NEW, 'storecut kept copies'))

ANCHOR = '<script id="gc-patch-resume">'
ALT = '<script id="gc-patch-supply">'

def main():
    p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
    t = open(p, encoding='utf-8').read()
    if '__GC_PATCH_QUIET__' in t:
        print('QUIET: already applied'); return
    a = ANCHOR if t.count(ANCHOR) == 1 else ALT
    if t.count(a) != 1:
        sys.exit('QUIET: anchor not found once')
    t = t.replace(a, SCRIPT.replace('__LIST__', repr(QUIET).replace("'", '"')) + a, 1)
    for old, new, name in EDITS:
        if t.count(old) != 1:
            sys.exit('QUIET: ' + name + ' not found once')
        t = t.replace(old, new, 1)
    open(p, 'w', encoding='utf-8').write(t)
    print('QUIET: applied to ' + p)

if __name__ == '__main__':
    main()
