#!/usr/bin/env python3
"""Idempotent patch BOOTWATCH: the sign-in watch -- people who CANNOT get in are seen.

Why (11/18): a PM could not open GrayCo Field on his phone and nobody knew. The device report (PERFREP) only goes out
after sign-in, and only when something is dirty; his phone's last report was 11/04 on 33.164 (an old cached copy, or a
sign-in that failed). This patch:
  * puts tools/bootwatch_early.js right after LSGUARD (tools/bootwatch_late.js just before it as text, compiled only when needed) (the first script of the page): every open, signed in or not, records
    its steps (page read, scripts loaded, sign-in screen, Sign in pressed -- e-mail domain + hash only, the sign-in error
    text, signed in, first screen Desk / Field) with page errors before the first screen, "stuck" conditions and an old
    build (older than /version.txt), and sends it to netlify/functions/bootwatch.js (gc_kv gc_bootrep_<device>) only when
    something went wrong, plus one heartbeat a day per device;
  * an old cached copy: "A newer version is ready -- Tap to update" (caches emptied, old service workers removed, ONE reload,
    at most once per 10 minutes);
  * the CRM's own version check (auto-update bar) reuses the early script's answer and its update: "Yes, update" now
    empties the caches too, and the bar never shows twice;
  * the Marketing Manager's page may call bootwatch (his sign-in problems are seen too).
Kill switch (a device): localStorage gc_bootwatch_off = '1'.  Console: _gcBootWatch.state()
Usage: python3 tools/patch_BOOTWATCH.py [index.html]
"""
import sys, os, re
HERE = os.path.dirname(os.path.abspath(__file__))

def strip_comments(js):
    """Drop the block comments that START a line (the long notes; the page's copy only needs the code). A comment that starts
    a line can never be inside a string or a regex, so this is safe; comments after code on a line are kept."""
    out, i, lines = [], 0, js.split('\n')
    while i < len(lines):
        ln = lines[i]; t = ln.lstrip()
        if t.startswith('/*'):
            rest = t[2:]; j = i
            while '*/' not in rest:
                j += 1; rest = lines[j]
            after = rest[rest.index('*/') + 2:].strip()
            if after: out.append(ln[:len(ln) - len(t)] + after)
            i = j + 1; continue
        out.append(ln); i += 1
    return '\n'.join(out)

def scripts():
    """(early, late): exactly what goes into the page (tests compare against this)."""
    early = open(os.path.join(HERE, 'bootwatch_early.js'), encoding='utf-8').read()
    late = open(os.path.join(HERE, 'bootwatch_late.js'), encoding='utf-8').read()
    assert '</script' not in early and '</script' not in late
    # the header note stays (it says what this is); the other notes are dropped from the page's copy
    head_end = early.index('*/') + 2
    early = early[:head_end] + strip_comments(early[head_end:])
    return early.rstrip('\n'), strip_comments(late).strip('\n')

if len(sys.argv) > 1 and sys.argv[1] == '--print':
    e, l = scripts(); sys.stdout.write(e + '\n\u0000\n' + l); sys.exit(0)
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_BOOTWATCH__'
if MARK in src:
    print('BOOTWATCH: already patched'); sys.exit(0)
EARLY, LATE = scripts()
assert MARK in EARLY

def rep(old, new):
    global src
    assert src.count(old) == 1, ('BOOTWATCH anchor count != 1', old[:80], src.count(old))
    src = src.replace(old, new)

# 1. the early script, right after LSGUARD (which must stay the first script of the page)
#    The rarely needed part (tools/bootwatch_late.js) goes in just before it as TEXT (type="text/plain": the browser does not
#    compile it); the early script compiles it only when first needed.
rep('</script>\n<script id="gc-patch-saves-lsheld">\n',
    '</script>\n<script type="text/plain" id="gc-bw-late">\n' + LATE + '\n</script>\n<script id="gc-patch-bootwatch">\n' + EARLY + '\n</script>\n<script id="gc-patch-saves-lsheld">\n')

# 2. the CRM's own version check: one update path, one bar, one request at open
rep("""  function showUpdateBar(remote){
    if(barShown) return;
    barShown = true;""",
"""  function showUpdateBar(remote){
    if(barShown) return;
    /* patch BOOTWATCH: its "Tap to update" banner is already up (a cached copy / the sign-in screen) */
    try{ if(window._gcBootWatch && window._gcBootWatch.banner()) return; }catch(e){}
    barShown = true;""")
rep("""    if(btn) btn.onclick = function(){ location.reload(true); };""",
"""    /* patch BOOTWATCH: the same update as its banner — caches emptied, old service workers removed, one reload (≤ 1 per 10 min) */
    if(btn) btn.onclick = function(){ try{ if(window._gcBootWatch && window._gcBootWatch.update()) return; }catch(e){} location.reload(true); };""")
rep("""    if(document.hidden) return;
    fetch('/version.txt?t=' + Date.now(), {cache:'no-store'})
      .then(function(r){ return r.ok ? r.text() : null; })""",
"""    if(document.hidden) return;
    /* patch BOOTWATCH: the answer the early script got in the last minute (it asks once at open) */
    var bwv = ''; try{ bwv = window._gcBootWatch ? window._gcBootWatch.live(60000) : ''; }catch(e){}
    (bwv ? Promise.resolve({ ok: true, text: function(){ return bwv; } }) : fetch('/version.txt?t=' + Date.now(), {cache:'no-store'}))
      .then(function(r){ return r.ok ? r.text() : null; })""")

# 3. the Marketing Manager's page may report a sign-in problem too
rep("""var MM_FNS = { soc: 1, mkt: 1, mkt2: 1, referral: 1, 'mkt-public': 1, go: 1, 'track-call': 1, 'website-intake': 1, 'claude-proxy': 1 };""",
    """var MM_FNS = { soc: 1, mkt: 1, mkt2: 1, referral: 1, 'mkt-public': 1, go: 1, 'track-call': 1, 'website-intake': 1, 'claude-proxy': 1, bootwatch: 1 };   /* patch BOOTWATCH */""")

assert src.count('<script id="gc-patch-bootwatch">') == 1
open(path, 'w', encoding='utf-8').write(src)
print('BOOTWATCH: patched', path)
