#!/usr/bin/env python3
"""Idempotent patch TVFIX — every "Office TV" entry point opens the NEW office TV (patch OFFICETV); ⚙ Admin's OFFICETV row
becomes "📺 TVs · back office and front room screens" (📺 Back office TV · 🖥 Front room (lobby) TV side by side), patch AUTO8's
"📺 Office TV scoreboard" goes; the back office TV gets 🔵 Blue (default) / ⚪ White; 🧭 GrayCo Systems → The office gets the
same two tiles. Owner 11/02. See the header of tools/tvfix.js.

1. patch AUTO8: its ⚙ Admin bar loses the "📺 Office TV scoreboard → Open" part; its button handler goes through
   _gcTVFIX.office().
2. 🧭 GrayCo Systems: "📺 Back office TV" + "🖥 Front room (lobby) TV" under The office; both go through _gcTVFIX.
3. <script id="gc-patch-tvfix-pre"> just before OFFICETV's script (catches an error thrown while it runs) and
   tools/tvfix.js as <script id="gc-patch-tvfix"> just after it (replaced when it changes).
Usage: python3 tools/patch_TVFIX.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
t = open(p, encoding='utf-8').read()
MARK = '/* patch TVFIX'
changed = False


def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('TVFIX anchor count != 1', n, old[:100])
    t = t.replace(old, new)


if MARK + ': entry points */' not in t:
    # 1. patch AUTO8's ⚙ Admin bar + its button
    once("  var html = '<span><b>📺 Office TV scoreboard</b> · big numbers for the office TV</span><button type=\"button\" data-a8adm=\"tv\">Open</button>' +\n"
         "    '<span style=\"margin-left:14px\"><b>🦺 Toolbox talk topics</b></span>",
         "  var html = '<span><b>🦺 Toolbox talk topics</b></span>")
    once("  if (adm === 'tv') return (W._gcOTV ? W._gcOTV.open() : tv());",
         "  if (adm === 'tv') return (W._gcTVFIX ? W._gcTVFIX.office() : W._gcOTV ? W._gcOTV.open() : tv());   " + MARK + ": entry points */")
    # 2. 🧭 GrayCo Systems → The office
    once("    { g: 'The office', k: 'tv', ic: '📺', b: 'Office TV scoreboard', d: 'Big numbers for the office TV' },\n",
         "    { g: 'The office', k: 'tv', ic: '📺', b: 'Back office TV', d: 'Goals, PM leaderboard, scoreboard — the office screen' },\n"
         "    { g: 'The office', k: 'lobbyed', ic: '🖥', b: 'Front room (lobby) TV', d: 'The customers\\' screen: slides, offers, its link' },   " + MARK + ": systems */\n")
    once("  t = t.filter(function(x){ return x.k === 'tv' ? !!(W._gcOTV && W._gcOTV.allowed()) :",
         "  t = t.filter(function(x){ return x.k === 'tv' || x.k === 'lobbyed' ? (W._gcTVFIX ? (x.k === 'tv' ? W._gcTVFIX.canTV() : W._gcTVFIX.canTV() && W._gcTVFIX.canLobby()) : x.k === 'tv' && !!(W._gcOTV && W._gcOTV.allowed())) :")
    once("  if (k === 'tv') { try { if (W._gcA8 && W._gcA8.tv) return W._gcA8.tv(); }",
         "  if ((k === 'tv' || k === 'lobbyed') && W._gcTVFIX) { try { return k === 'tv' ? W._gcTVFIX.office() : W._gcTVFIX.lobby(); } catch (e) { warn(e); } }   " + MARK + ": systems tiles */\n"
         "  if (k === 'tv') { try { if (W._gcA8 && W._gcA8.tv) return W._gcA8.tv(); }")
    changed = True
    print('TVFIX: AUTO8 admin bar + Systems tiles patched')
else:
    print('TVFIX: entry points already patched')

# 3. the scripts, around OFFICETV's
OTV = '<script id="gc-patch-officetv">'
assert t.count(OTV) == 1, 'TVFIX: OFFICETV script not on the page (run tools/patch_OFFICETV.py first)'
PRE = '<script id="gc-patch-tvfix-pre">'
pre = ("/* patch TVFIX (pre): an error thrown while the OFFICETV script just below runs is kept here (window._gcOTV would be missing;\n"
       "   tools/tvfix.js reports it). Stopped by tvfix.js, which runs right after OFFICETV. */\n"
       "(function(){ var E = [], W = window; function on(ev){ try { E.push(String((ev && (ev.message || (ev.error && ev.error.message))) || 'error') + (ev && ev.lineno ? ' @' + ev.lineno + ':' + ev.colno : '')); } catch (e) {} }\n"
       "  try { W.addEventListener('error', on, true); } catch (e) {}\n"
       "  W.__GC_TVFIX_PRE__ = { errs: E, stop: function(){ try { W.removeEventListener('error', on, true); } catch (e) {} } }; })();\n")
if PRE not in t:
    once(OTV, PRE + '\n' + pre + '</script>\n' + OTV)
    changed = True
    print('TVFIX: pre script added')
TAG = '<script id="gc-patch-tvfix">'
js = open(os.path.join(here, 'tvfix.js'), encoding='utf-8').read()
assert '</script' not in js
if TAG in t:
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == js: print('TVFIX: script already current')
    else: t = t[:i] + js + t[j:]; changed = True; print('TVFIX: script updated')
else:
    i = t.index(OTV); j = t.index('</script>', i) + len('</script>')
    t = t[:j] + '\n' + TAG + '\n' + js + '</script>' + t[j:]
    changed = True
    print('TVFIX: script added')

if changed:
    open(p, 'w', encoding='utf-8').write(t)
else:
    print('TVFIX: already patched')
