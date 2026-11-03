#!/usr/bin/env python3
"""Idempotent patch TVMUSIC — 🎵 YouTube or Spotify music in the background of the office TVs (owner 11/03: "make sure i can
play youtube or spotify in background of office tvs"). See the header of tools/tvmusic.js.

1. index.html: tools/tvmusic.js as <script id="gc-patch-tvmusic"> right after patch TVFIX's script (the back office TV, the
   personal TV screens, the old navy slideshow; ⚙ Admin → 📺 TVs → 🎵 Music for the company music).
2. lobby.html (the front room TV): the same script, told it is on the lobby page, just before </body>.
   Each script is replaced when tools/tvmusic.js changes; a rerun with nothing to do prints "already patched".
(netlify/functions/lobby.js serves gc_tv_goals.lobbyMusic; _headers lets the lobby page frame only the players.)
Usage: python3 tools/patch_TVMUSIC.py [index.html] [lobby.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
P_INDEX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'index.html')
P_LOBBY = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, 'lobby.html')
MARK = '/* patch TVMUSIC'
TAG = '<script id="gc-patch-tvmusic">'
js = open(os.path.join(here, 'tvmusic.js'), encoding='utf-8').read()
assert '</script' not in js, 'TVMUSIC: tvmusic.js must not contain </script'
assert 'patch TVMUSIC' in js[:600], 'TVMUSIC: tvmusic.js header'
LOBBY_PRE = "window.__GC_TVM_PAGE__ = 'lobby';   " + MARK + ": this is the front room (lobby) TV */\n"


def count1(t, s, what):
    n = t.count(s)
    assert n == 1, ('TVMUSIC anchor count != 1', what, n, s[:90])


def put(t, body, anchor_after=None, anchor_before=None, name=''):
    """the script once: replaced when it changed; else added after / before its anchor (each exactly once)"""
    if TAG in t:
        count1(t, TAG, name + ' script tag')
        i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
        if t[i:j] == body: print('TVMUSIC: ' + name + ' script already current'); return t, False
        print('TVMUSIC: ' + name + ' script updated'); return t[:i] + body + t[j:], True
    block = TAG + '\n' + body + '</script>'
    if anchor_after:
        count1(t, anchor_after, name + ' anchor')
        i = t.index(anchor_after); j = t.index('</script>', i) + len('</script>')
        t = t[:j] + '\n' + block + t[j:]
    else:
        count1(t, anchor_before, name + ' anchor')
        t = t.replace(anchor_before, block + '\n' + anchor_before)
    print('TVMUSIC: ' + name + ' script added'); return t, True


done = 0
# 1. index.html — after patch TVFIX's script (which itself sits right after OFFICETV's)
t = open(P_INDEX, encoding='utf-8').read()
count1(t, '<script id="gc-patch-officetv">', 'index OFFICETV')
t, ch = put(t, js, anchor_after='<script id="gc-patch-tvfix">', name='index.html')
if ch:
    open(P_INDEX, 'w', encoding='utf-8').write(t); done += 1

# 2. lobby.html — its own copy, before </body> (after the lobby's own script, so window.__lobby is there)
t = open(P_LOBBY, encoding='utf-8').read()
count1(t, 'W.__lobby = {', 'lobby __lobby')
count1(t, '</script>\n</body>', 'lobby page end')
t, ch = put(t, LOBBY_PRE + js, anchor_before='</body>', name='lobby.html')
if ch:
    open(P_LOBBY, 'w', encoding='utf-8').write(t); done += 1

if not done:
    print('TVMUSIC: already patched')
