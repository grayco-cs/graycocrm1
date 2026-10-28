#!/usr/bin/env python3
"""Idempotent patch APXOPEN: on Approvals, the ✕ Deny box, the 📝 Note box and the ✏️ Edit form open (and Cancel
closes them) at once. Release check 10/28: while the page was still syncing the Deny box took 120–490 ms to show
after the click, so a reason typed right away could go nowhere.

Cause: opening or closing a box threw away the built list of approval cards and waited 250 ms for a full rebuild of
every card. A box changes only what is shown, not the cards, so it now repaints right away from the cards already
built (saving a note, a deny or an edit still rebuilds as before). Usage: python3 tools/patch_APXOPEN.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch APXOPEN'
if MARK in src:
    print('APXOPEN: already patched'); sys.exit(0)
OLD1 = """function build(){
  if (buildMemo && Date.now() - buildMemo.at < 500) return buildMemo.v;"""
NEW1 = """var UIONLY = 0;   """ + MARK + """: a repaint for the deny box alone reuses the cards already built */
function paintBox(){ UIONLY = 1; try { if (view() === 'approvals') drawTab(true); pinRoots(); } catch (e) { warn(e); } UIONLY = 0; }
function build(){
  if (buildMemo && (UIONLY || Date.now() - buildMemo.at < 500)) return buildMemo.v;"""
OLD2 = """b('denyx', { l: 'Cancel', f: function(){ delete DENYBOX[r.key]; fresh(); paintSoon(); } }, 'op')"""
NEW2 = """b('denyx', { l: 'Cancel', f: function(){ delete DENYBOX[r.key]; paintBox(); } }, 'op')"""
OLD3 = """f: function(){ DENYBOX[r.key] = 1; fresh(); paintSoon(); later(function(){ var i = D.querySelector('[data-apx-deny-in="' + cssq(r.key) + '"]'); if (i) try { i.focus(); } catch (e) {} }, 300); }"""
NEW3 = """f: function(){ DENYBOX[r.key] = 1; paintBox(); var i = D.querySelector('[data-apx-deny-in="' + cssq(r.key) + '"]'); if (i) try { i.focus(); } catch (e) {} else { paintSoon(); later(function(){ var j = D.querySelector('[data-apx-deny-in="' + cssq(r.key) + '"]'); if (j) try { j.focus(); } catch (e) {} }, 300); } }"""
OLD4 = """f: function(){ NOTEBOX[r.key] = 1; fresh(); paintSoon(); later(function(){ var i = D.querySelector('[data-apx-note-in="' + cssq(r.key) + '"]'); if (i) try { i.focus(); } catch (e) {} }, 300); }"""
NEW4 = """f: function(){ NOTEBOX[r.key] = 1; paintBox(); var i = D.querySelector('[data-apx-note-in="' + cssq(r.key) + '"]'); if (i) try { i.focus(); } catch (e) {} else { paintSoon(); later(function(){ var j = D.querySelector('[data-apx-note-in="' + cssq(r.key) + '"]'); if (j) try { j.focus(); } catch (e) {} }, 300); } }"""
OLD5 = """b('notex', { l: 'Cancel', f: function(){ delete NOTEBOX[r.key]; fresh(); paintSoon(); } }, 'op')"""
NEW5 = """b('notex', { l: 'Cancel', f: function(){ delete NOTEBOX[r.key]; paintBox(); } }, 'op')"""
OLD6 = """f: function(){ EDIT = EDIT.key === r.key ? { key: '' } : { key: r.key }; fresh(); paintSoon(); }"""
NEW6 = """f: function(){ EDIT = EDIT.key === r.key ? { key: '' } : { key: r.key }; paintBox(); }"""
for o, n, tag in ((OLD1, NEW1, 1), (OLD2, NEW2, 2), (OLD3, NEW3, 3), (OLD4, NEW4, 4), (OLD5, NEW5, 5), (OLD6, NEW6, 6)):
    assert src.count(o) == 1, ('APXOPEN find-string %d count != 1' % tag, src.count(o))
    src = src.replace(o, n)
open(path, 'w', encoding='utf-8').write(src)
print('APXOPEN: patched')
