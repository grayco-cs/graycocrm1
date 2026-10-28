#!/usr/bin/env python3
"""Idempotent patch RTPUT: saving the 13,350-row schedule blocked the page 400-1,000 ms, many times a minute.

Measured (two computers, real data + ~13,350 schedule rows, CPU profiles of every block over 300 ms): after the
live-feed fix (RTFAST) the longest blocks were every save of the schedule to this computer's disk and every
upload of it, in two places that did a lot of work per row for rows that had not changed:

1. The keep-forever guard (repair) under every IndexedDB write: for every row on disk it looked the incoming row
   up with out.indexOf(row) (a scan of the whole list per row: 13,350 x 13,350) and built a merged copy plus two
   JSON texts per row, also when the incoming row is the very same object as the one on disk. Now: the same
   object is skipped (merging a row with itself changes nothing), and the position is found in an index built
   once (it gives exactly what indexOf gave: the first place that still holds that object).
2. The "a save the cloud already holds is not sent again" check (SYNCPERF, spSig) put every row of every upload
   into its sorted-key text again (a 1.2 MB schedule chunk = 3,000 rows, five chunks per save). The sorted-key
   text of a row is now remembered by the row's plain text (same text, same sorted text), bounded in size.
Nothing that is saved or sent changes."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch RTPUT'
if MARK in t: print('RTPUT: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('RTPUT anchor count != 1', n, old[:90])
    t = t.replace(old, new)

# 1. repair: same object -> nothing to merge; positions from an index instead of indexOf per row
once("""  var out = incoming.slice();
  var putBack = 0, melded = 0;

  /* anything here that the sync does not mention is KEPT */
  mine.forEach(function(r){""", """  var out = incoming.slice();
  var putBack = 0, melded = 0;
  """ + MARK + """: where each incoming row sits, built once (out.indexOf per row was 13,350 x 13,350 on the schedule) */
  var _pos = (typeof Map === 'function') ? new Map() : null;
  if(_pos){ for(var _pi = 0; _pi < out.length; _pi++){ var _po = out[_pi]; if(_po && typeof _po === 'object'){ var _pl = _pos.get(_po); if(_pl) _pl.push(_pi); else _pos.set(_po, [_pi]); } } }
  function _posOf(o){ if(!_pos) return out.indexOf(o); var l = _pos.get(o); if(!l) return -1; for(var q = 0; q < l.length; q++){ if(out[l[q]] === o) return l[q]; } return -1; }

  /* anything here that the sync does not mention is KEPT */
  mine.forEach(function(r){""")
once("""    /* it is in both — take the newer, and never let a blank win */
    var merged = meld(r, byId[id]);
    var at = out.indexOf(byId[id]);""", """    /* it is in both — take the newer, and never let a blank win */
    if(r === byId[id]) return;                          /* patch RTPUT: the very same row — merging it with itself changes nothing */
    var merged = meld(r, byId[id]);
    var at = _posOf(byId[id]);""")

# 2. SYNCPERF: a row's sorted-key text remembered by its plain text
once("""function spSig(v){
  try {
    if (Array.isArray(v) && v.length > 1 && v.every(spIsRec)) return 'R' + spHash('[' + v.map(spCanon).sort().join(',') + ']');""",
"""/* patch RTPUT: the sorted-key text of a row, remembered by the row's plain text (same text, same sorted text) */
var SP_CC = (typeof Map === 'function') ? new Map() : null;
function spCanonRow(r){
  if (!SP_CC || !r || typeof r !== 'object' || typeof r.toJSON === 'function') return spCanon(r);
  var j, tj = false; try { j = JSON.stringify(r, function(k, x){ var o = this[k]; if (o && typeof o === 'object' && typeof o.toJSON === 'function') tj = true; return x; }); } catch (e) { return spCanon(r); }
  if (typeof j !== 'string' || tj) return spCanon(r);   /* a Date (toJSON) inside: its plain text is not its sorted text */
  var c = SP_CC.get(j); if (c !== undefined) return c;
  c = spCanon(r); if (SP_CC.size >= 40000) SP_CC.clear(); SP_CC.set(j, c); return c;
}
function spSig(v){
  try {
    if (Array.isArray(v) && v.length > 1 && v.every(spIsRec)) return 'R' + spHash('[' + v.map(spCanonRow).sort().join(',') + ']');""")
open(p, 'w', encoding='utf-8').write(t); print('RTPUT: patched')
