#!/usr/bin/env python3
"""Idempotent patch OFFICETV — 📺 the Office TV (goals, PM leaderboard, scoreboard, this week; admin + office; #tv link)
and the 📺 Lobby TV editor (owner 11/01). See the header of tools/officetv.js; the lobby itself is lobby.html +
lobby-types.js + lobby-qr.js + netlify/functions/lobby.js.

1. 🧭 GrayCo Systems tiles: "📺 Office TV scoreboard" only for admin / office; a "📺 Lobby TV" tile (Website & marketing —
   admin, office, the Marketing Manager) that opens the lobby editor.
2. ⚙ Admin's "📺 Office TV scoreboard → Open" (patch AUTO8) opens the new Office TV.
3. tools/officetv.js goes in as <script id="gc-patch-officetv"> at the end of the page (replaced when it changes).
4. netlify/functions/_lib/lobby-types.js is kept identical to lobby-types.js (the function bundles its own copy).
Usage: python3 tools/patch_OFFICETV.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
t = open(p, encoding='utf-8').read()
MARK = '/* patch OFFICETV'


def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('OFFICETV anchor count != 1', n, old[:90])
    t = t.replace(old, new)


changed = False
if MARK + ': tiles */' not in t:
    once("    { g: 'The office', k: 'tv', ic: '📺', b: 'Office TV scoreboard', d: 'Big numbers for the office TV' },\n",
         "    { g: 'The office', k: 'tv', ic: '📺', b: 'Office TV scoreboard', d: 'Big numbers for the office TV' },\n"
         "    { g: 'Website & marketing', k: 'lobby', ic: '📺', b: 'Lobby TV', d: 'The front-room screen for customers' },\n")
    once("  if (W._gcIsMM && W._gcIsMM()) return t.filter(function(x){ return x.g === 'Website & marketing'; });",
         "  t = t.filter(function(x){ return x.k === 'tv' ? !!(W._gcOTV && W._gcOTV.allowed()) : x.k === 'lobby' ? !!(W._gcLobbyAdmin && W._gcLobbyAdmin.canSee()) : true; });   " + MARK + ": tiles */\n"
         "  if (W._gcIsMM && W._gcIsMM()) return t.filter(function(x){ return x.g === 'Website & marketing'; });")
    once("  if (k === 'tv') { try { if (W._gcA8 && W._gcA8.tv) return W._gcA8.tv(); }",
         "  if (k === 'lobby') { try { if (W._gcLobbyAdmin) return W._gcLobbyAdmin.open(); } catch (e) { warn(e); } return toast('📺 Lobby TV is not loaded on this computer.', true); }   " + MARK + ": lobby tile */\n"
         "  if (k === 'tv') { try { if (W._gcA8 && W._gcA8.tv) return W._gcA8.tv(); }")
    once("  if (adm === 'tv') return tv();",
         "  if (adm === 'tv') return (W._gcOTV ? W._gcOTV.open() : tv());   " + MARK + ": the new Office TV */")
    changed = True
    print('OFFICETV: tiles + AUTO8 entry patched')
else:
    print('OFFICETV: tiles already patched')

TAG = '<script id="gc-patch-officetv">'
js = open(os.path.join(here, 'officetv.js'), encoding='utf-8').read()
assert '</script' not in js
if TAG in t:
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == js: print('OFFICETV: script already current')
    else: t = t[:i] + js + t[j:]; changed = True; print('OFFICETV: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'OFFICETV: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'
    changed = True
    print('OFFICETV: script added')

src = os.path.join(root, 'lobby-types.js'); dst = os.path.join(root, 'netlify', 'functions', '_lib', 'lobby-types.js')
a = open(src, encoding='utf-8').read()
if not os.path.exists(dst) or open(dst, encoding='utf-8').read() != a:
    open(dst, 'w', encoding='utf-8').write(a); print('OFFICETV: _lib/lobby-types.js synced')

if changed:
    open(p, 'w', encoding='utf-8').write(t)
else:
    print('OFFICETV: already patched')
