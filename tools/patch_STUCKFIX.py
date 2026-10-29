#!/usr/bin/env python3
"""Idempotent patch STUCKFIX: the CRM froze after sign-in (owner 10/29: "stuck on screen" -- greeting popup, nothing clickable).

Cause (measured): a fresh / after-update load pulled the whole gc_kv table (41.6 MB in production) on the main thread:
  * estimates__chunk0..11 (~13 MB) and projectDocs__chunk0..12 (~15 MB of base64 PDFs) are OLD chunk generations that no
    reader can use (estimates: manifest says 11 chunks / 119 rows, 12 chunks / 147 rows exist -> "torn", the reader reads
    every chunk, fails, and retries 3x; projectDocs has been a plain row since patch D). They still came down in every
    whole-table pull and in the start-up manifest scan, then went through the IndexedDB put wrappers and the signatures.
  * estimates (2.7 MB), __est__gc_ests_v2 (2.7 MB) and gc_folded (1.3 MB) were parsed, stored and signed during start-up.

Fix (one early script, the innermost window.fetch, before every other wrapper):
  1. Reads that pull values with a time stamp (select ... value ... updated_at: the start-up pull, the change pull, the
     manifest scan) never include the old chunk rows (projectDocs__*, estimates__chunk*); estimates__manifest only after the
     estimates are loaded (until _gcEstDedupeNow has cleaned it, that scan still reads the torn pieces every 10 minutes). A read of one
     named key (key=eq.) and the exports / deep-scan tools (select=key,value without updated_at) are unchanged.
  2. Until this computer has loaded them, those reads also leave out estimates, __est__gc_ests_v2 and gc_folded.
     They load when 📐 Estimates / a document / estimate screen opens, or when the person has been idle for 20 s after the
     first 75 s -- one list at a time through the app's own pull (window._gcPullChanged), with pauses in between.
  3. Until they are loaded, nothing writes them (or the old chunks) to the cloud: such a write could only come from a
     computer that has not seen the cloud's copy. A write that was held back is pushed again (window._gcPushAll) once
     everything is loaded, as the app's own union with the cloud.
  4. The "GrayCo automations active" toast is gone (owner 10/29).
  5. (r13 / rel-tonight only) APOFFICE3: the To-Do pin builds the approvals list only for the office.
Kill switch: localStorage gc_stuckfix_off = '1' (the old behaviour). Console: _gcHeavy.state(), _gcHeavy.load().
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_STUCKFIX__'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:80], s.count(old))
    return s.replace(old, new)

EARLY = r"""<script id="gc-patch-stuckfix">
/* __GC_PATCH_STUCKFIX__ — start-up never pulls the old estimate / document chunks, and estimates, __est__gc_ests_v2 and
   gc_folded load after the CRM is usable (see tools/patch_STUCKFIX.py). Kill switch: localStorage gc_stuckfix_off = '1'. */
(function(){
'use strict';
if (window.__GC_PATCH_STUCKFIX__) return; window.__GC_PATCH_STUCKFIX__ = true;
var W = window, NF = W.fetch, NST = W.setTimeout;
if (typeof NF !== 'function') return;
var OFF = false; try { OFF = localStorage.getItem('gc_stuckfix_off') === '1'; } catch (e) {}
if (OFF) { try { console.log('[GC] STUCKFIX off (gc_stuckfix_off)'); } catch (e) {} return; }
var HEAVY = ['gc_folded', 'estimates', '__est__gc_ests_v2'];
var OLDCHUNK = /^(estimates|projectDocs)__(chunk\d+|manifest)$/;
var H = { phase: 'startup', allowed: {}, seen: {}, loaded: false, t0: Date.now(), lastInput: Date.now(), filtered: 0, held: [], why: '', at: {} };
function sleep(ms){ return new Promise(function(r){ NST.call(W, r, ms); }); }
function urlOf(input){ try { return typeof input === 'string' ? input : (input && input.url) ? input.url : String(input); } catch (e) { return ''; } }
function methodOf(input, init){ var m = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET'; return String(m).toUpperCase(); }
function heldKey(k){ return !H.loaded && (HEAVY.indexOf(k) >= 0 || OLDCHUNK.test(k)); }
function qs(u){ var i = u.indexOf('?'); return i < 0 ? '' : u.slice(i + 1); }
function selOf(q){ var m = /(?:^|&)select=([^&]*)/.exec(q); try { return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return m ? m[1] : ''; } }
function rewrite(u){
  var q = qs(u); if (!q || /(?:^|&)key=eq\./.test(q)) return u;
  var sel = selOf(q); if (!/\bvalue\b/.test(sel) || !/\bupdated_at\b/.test(sel)) return u;
  var add = '&key=not.like.projectDocs__*&key=not.like.estimates__chunk*';   /* old chunk generations: never in a bulk read */
  var pend = HEAVY.filter(function(k){ return !H.allowed[k]; });
  if (!H.allowed.estimates) pend = pend.concat(['estimates__manifest']);      /* the start-up manifest scan: not before the estimates load */
  if (pend.length) add += '&key=not.in.(' + pend.map(function(k){ return '%22' + k + '%22'; }).join(',') + ')';
  var bulk = !/(?:^|&)key=/.test(q);
  HEAVY.forEach(function(k){ if (H.allowed[k] && (bulk || q.indexOf('%22' + k + '%22') >= 0 || q.indexOf('"' + k + '"') >= 0)) H.seen[k] = Date.now(); });
  H.filtered++;
  return u + add;
}
function fake(status){ return Promise.resolve(new Response(status === 204 ? null : '[]', { status: status, headers: { 'content-type': 'application/json' } })); }
function keyOfUrl(q){ var m = /(?:^|&)key=eq\.([^&]*)/.exec(q); try { return m ? decodeURIComponent(m[1]).replace(/^"|"$/g, '') : ''; } catch (e) { return ''; } }
W.fetch = function(input, init){
  try {
    var u = urlOf(input);
    if (u.indexOf('/rest/v1/gc_kv') >= 0) {
      var m = methodOf(input, init);
      if (m === 'GET' || m === 'HEAD') {
        var u2 = rewrite(u);
        if (u2 !== u) { if (typeof input === 'string') input = u2; else { try { input = new Request(u2, input); } catch (e) { input = u2; } } }
      } else if (!H.loaded) {
        var q = qs(u), k = keyOfUrl(q);
        if (k && heldKey(k)) { H.held.push([Date.now(), m, k]); return fake(m === 'POST' ? 201 : 204); }
        var b = init && init.body;
        if (typeof b === 'string' && /"key"\s*:\s*"(gc_folded|estimates(__chunk\d+|__manifest)?|__est__gc_ests_v2|projectDocs__(chunk\d+|manifest))"/.test(b)) {
          var j = null; try { j = JSON.parse(b); } catch (e) { j = null; }
          if (j && typeof j === 'object') {
            var arr = Array.isArray(j) ? j : [j], keep = arr.filter(function(r){ return !(r && r.key && heldKey(String(r.key))); });
            if (keep.length !== arr.length) {
              arr.forEach(function(r){ if (r && r.key && heldKey(String(r.key))) H.held.push([Date.now(), m, String(r.key)]); });
              if (!keep.length) return fake(m === 'POST' ? 201 : 204);
              init = Object.assign({}, init, { body: JSON.stringify(Array.isArray(j) ? keep : keep[0]) });
            }
          }
        }
      }
    }
  } catch (e) {}
  return NF.call(W, input, init);
};
try { W.fetch.__gcStuckfix = true; } catch (e) {}
function screenWants(){
  try {
    var v = String(localStorage.getItem('grayco_view') || '');
    if (/estim|bid|proposal|doc|file|takeoff/i.test(v)) return 'view ' + v;
    var o = document.getElementById('gc-est-overlay'); if (o && (o.classList.contains('gcv') || (o.style && o.style.display === 'flex'))) return 'estimate builder';
  } catch (e) {}
  return '';
}
async function pullFor(k){
  for (var a = 0; a < 3; a++) {
    var t = Date.now();
    try { if (typeof W._gcPullChanged === 'function') await W._gcPullChanged(); else if (typeof W._gcPullNow === 'function') await W._gcPullNow(); } catch (e) {}
    if (H.seen[k] >= t) return true;
    await sleep(1500);
  }
  return false;   /* unchanged since this computer's last pull: its own copy is the cloud's */
}
function load(why){
  if (H.p) return H.p;
  H.phase = 'loading'; H.why = why || 'asked'; H.at.start = Date.now() - H.t0;
  try { console.log('[GC] STUCKFIX: loading estimates / folded invoices now (' + H.why + ')'); } catch (e) {}
  H.p = (async function(){
    for (var i = 0; i < HEAVY.length; i++) { H.allowed[HEAVY[i]] = true; await pullFor(HEAVY[i]); await sleep(600); }
    H.loaded = true; H.phase = 'loaded'; H.at.done = Date.now() - H.t0;
    try { W.dispatchEvent(new CustomEvent('gc-heavy-loaded')); } catch (e) {}
    if (H.held.length) { await sleep(1500); try { if (typeof W._gcPushAll === 'function') W._gcPushAll(); } catch (e) {} }
    try { console.log('[GC] STUCKFIX: estimates / folded invoices loaded (' + Math.round(H.at.done / 1000) + ' s after start, ' + H.held.length + ' early write(s) pushed again)'); } catch (e) {}
  })();
  return H.p;
}
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function(ev){ try { W.addEventListener(ev, function(){ H.lastInput = Date.now(); }, true); } catch (e) {} });
(function watch(){
  if (H.p) return;
  var w = screenWants(), now = Date.now();
  if (w) { load(w); return; }
  if (now - H.t0 > 75000 && now - H.lastInput > 20000) { load('idle'); return; }
  NST.call(W, watch, 1000);
})();
W._gcHeavy = { state: function(){ return { phase: H.phase, why: H.why, allowed: Object.keys(H.allowed), loaded: H.loaded, filteredReads: H.filtered, held: H.held.slice(-20), at: H.at }; }, load: load, loaded: function(){ return H.loaded; } };
try { console.log('[GC] STUCKFIX: start-up skips the old estimate / document chunks; estimates load when needed — _gcHeavy.state()'); } catch (e) {}
})();
</script>
"""

src = once(src, '<html lang="en">\n  <head>\n', '<html lang="en">\n  <head>\n' + EARLY)

# 4. the "GrayCo automations active" toast: gone
src = once(src, "toast('⚡ GrayCo automations active','#1a3a5f');", "/* patch STUCKFIX: no \"automations active\" toast (owner 10/29) */")

# 5. APOFFICE3 (present on r13 / rel-tonight only): the pin builds the approvals list only for the office
AP_OLD = "var po = 0; try { var B = build(); if (B.scope.kind === 'office') po = pmOptN(B.rows); } catch (e) { warn(e); }"
AP_NEW = "var po = 0; try { if (scope().kind === 'office') { var B = build(); po = pmOptN(B.rows); } } catch (e) { warn(e); }   /* patch STUCKFIX: build only for the office */"
n = src.count(AP_OLD)
if n == 1:
    src = src.replace(AP_OLD, AP_NEW); print('APOFFICE3 pin guard: applied')
elif n == 0:
    print('APOFFICE3 pin guard: not present (r12) — skipped')
else:
    raise SystemExit('APOFFICE3 anchor count %d' % n)

open(path, 'w', encoding='utf-8').write(src)
print('patched STUCKFIX')
