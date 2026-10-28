#!/usr/bin/env python3
"""Idempotent patch RTSAVE: every save of the 13,350-row schedule spent 100-250 ms in the keep-forever guard.

repair() (under every IndexedDB write) built a merged copy of every row that is on disk and in the write
(meld: a new object per row, every field copied twice), then compared that copy's text with the incoming
row's text. For a row whose text is the same as the copy on disk, the merged copy always has that same text
(same fields, same values, same order), so nothing was ever taken from it. Now the two rows' texts are
compared first; only rows that differ are merged, exactly as before. Same answer, no copy per unchanged row."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch RTSAVE'
if MARK in t: print('RTSAVE: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('RTSAVE anchor count != 1', n, old[:90])
    t = t.replace(old, new)

once("""    if(r === byId[id]) return;                          /* patch RTPUT: the very same row — merging it with itself changes nothing */
    var merged = meld(r, byId[id]);
    var at = _posOf(byId[id]);
    if(at >= 0 && merged !== byId[id]){
      var changed=false;
      try{ changed = JSON.stringify(merged) !== JSON.stringify(byId[id]); }catch(e){ changed=true; }""",
"""    if(r === byId[id]) return;                          /* patch RTPUT: the very same row — merging it with itself changes nothing */
    """ + MARK + """: the same text on both sides: the merged copy would have that text too — nothing to take */
    var _tIn = null; try{ _tIn = JSON.stringify(byId[id]); if(_tIn === JSON.stringify(r)) return; }catch(e){ _tIn = null; }
    var merged = meld(r, byId[id]);
    var at = _posOf(byId[id]);
    if(at >= 0 && merged !== byId[id]){
      var changed=false;
      try{ changed = JSON.stringify(merged) !== (_tIn != null ? _tIn : JSON.stringify(byId[id])); }catch(e){ changed=true; }""")
open(p, 'w', encoding='utf-8').write(t); print('RTSAVE: patched')
