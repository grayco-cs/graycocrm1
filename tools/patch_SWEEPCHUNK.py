#!/usr/bin/env python3
"""Idempotent patch SWEEPCHUNK: a sync no longer re-downloads every chunked list (estimates__chunk0..N) when nothing changed.

Found by the 10/29 sweep (37 MB production-shape data, 4x CPU, offline harness): the CRM kept downloading 30-150 MB per
screen visit, 1.2 MB/s steady, and the main thread spent seconds parsing it.

Cause (measured with a stack on every request): pullAll() scans the *__manifest rows and, for each chunked list, calls
sbReadChunked(), which reads the manifest again and every chunk.  The scan was meant to run "at most once every 10
minutes" -- but that gate is skipped when force is true, and every pull is forced now (_gcPullChanged = pullAll(true),
the tab-change sync, the 3-minute idle sync, every realtime change).  With production's torn estimates manifest (12 chunks /
147 rows, manifest says 11 / 119) the PJX reader also tries 3 times before it gives up, so one pull = ~36 reads of ~1.1 MB.
That ran on every tab change and every change another computer saved.

Fix: the cheap manifest scan still runs on every pull (a few hundred bytes), but the chunks of a list are read only when
that list's manifest changed (its updated_at / at / count / total), or the last good read is more than 10 minutes old.
An unchanged manifest re-uses the list read last time (same merge as before, nothing skipped).  A manifest whose read
failed (torn) is not tried again until it changes (or 60 minutes pass) -- a torn set of chunks does not heal by itself.
Kill switch: localStorage gc_sweepchunk_off = '1'.  Console: window.__gcManifestMemo.
Usage: python3 tools/patch_SWEEPCHUNK.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch SWEEPCHUNK'
if MARK in src:
    print('SWEEPCHUNK: already patched'); sys.exit(0)

OLD = "          var _full = await sbReadChunked(_mkey);\n"
NEW = ("          var _full;   " + MARK + ": read the chunks only when this list's manifest changed */\n"
       "          try{\n"
       "            var _mOff = false; try{ _mOff = localStorage.getItem('gc_sweepchunk_off') === '1'; }catch(_lo){}\n"
       "            var _mMemo = window.__gcManifestMemo || (window.__gcManifestMemo = {});\n"
       "            var _mv = _manifests[_mi].value; if(typeof _mv === 'string'){ try{ _mv = JSON.parse(_mv); }catch(_mp){} }\n"
       "            var _mSig = String(_manifests[_mi].updated_at || '') + '|' + (_mv && typeof _mv === 'object' ? [_mv.at, _mv.count, _mv.total, _mv.chunked].join('/') : String(_mv));\n"
       "            var _mPrev = _mMemo[_mkey], _mAge = _mPrev ? Date.now() - _mPrev.t : 1e12;\n"
       "            if(!_mOff && _mPrev && _mPrev.sig === _mSig && ((_mPrev.full && _mAge < 600000) || (!_mPrev.full && _mAge < 3600000))){\n"
       "              _full = _mPrev.full ? _mPrev.full.slice() : null; _mPrev.hits = (_mPrev.hits || 0) + 1;\n"
       "            } else {\n"
       "              _full = await sbReadChunked(_mkey);\n"
       "              _mMemo[_mkey] = { sig: _mSig, t: Date.now(), full: Array.isArray(_full) ? _full.slice() : null, reads: ((_mPrev && _mPrev.reads) || 0) + 1, hits: 0 };\n"
       "            }\n"
       "          }catch(_me){ _full = await sbReadChunked(_mkey); }\n")
assert src.count(OLD) == 1, ('SWEEPCHUNK anchor count', src.count(OLD))
src = src.replace(OLD, NEW)
assert src.count(MARK) == 1
open(path, 'w', encoding='utf-8').write(src)
print('SWEEPCHUNK: patched', path)
