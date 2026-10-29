#!/usr/bin/env python3
"""Idempotent patch IDLETRIM: less main-thread work while the CRM just sits on the screen (phone first).

Found 10/29 (wR15 idle CPU profiles, admin, 37 MB seed, 4x CPU, 390 px): with nobody touching anything the main thread
was busy most of the time.  Safe cuts, each one giving the same answers as before:

1. FOLDED LOOK-UP (CCS2): every read of invoices / expenses / the register asked "is this record folded?" per record by
   walking the whole undo list (gc_folded, ~1,700 entries) -- hundreds of records x 1,700 = ~0.5 M comparisons per read.
   Now one index (list + record id -> entries) is built when the undo list changes (a new list or a new length); the
   "unfolded" flag is still checked live on each entry, so an Undo shows at once.
2. FOLDED REFRESH (CCS2): the undo list (1.3 MB) was read back from IndexedDB every 20 s.  Now it is read again only when
   this page wrote it since the last read (the storage version counter of patch X), or 2 minutes passed (another tab /
   the sync), and not while the tab is hidden (it is read the moment the tab is visible again).
3. SAME ANSWER, SAME RESULT (BOOKDEDUPE / TRAIN2): every list answer from the cloud was hashed character by character
   (quickHash) and scanned for file data (bodyNeeds) -- also when the answer was exactly the text of the last answer for
   that request (the stamp-first reads of STORECUT hand back the kept copy).  An answer identical to the last one for the
   same request (compared as text, natively) gets the last result; anything else is hashed / scanned as before.  Only
   answers up to 3 MB are kept for the comparison (4 per kind).
Kill switch: localStorage gc_idletrim_off = '1' (all three back to the old way).
Usage: python3 tools/patch_IDLETRIM.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch IDLETRIM'
if MARK in src:
    print('IDLETRIM: already patched'); sys.exit(0)

def rep(name, old, new):
    global src
    assert src.count(old) == 1, ('IDLETRIM anchor count != 1', name, src.count(old))
    src = src.replace(old, new)

OFF = "(function(){ try{ return localStorage.getItem('gc_idletrim_off') === '1'; }catch(_e){ return false; } })()"

# 1 + 2. folded index and the 20 s refresh
rep('folded',
    "function folded(list, id){\n"
    "  if(!foldCache) return false;\n"
    "  for(var i=0;i<foldCache.length;i++){ var f=foldCache[i]; if(f && !f.unfolded && f.recordId===String(id) && (f.list===list || (list==='invs'&&f.list==='invoices'))) return true; }\n"
    "  return false;\n"
    "}\n"
    "window._gcIsFolded = folded;\n"
    "foldList(); RI.call(window, function(){ foldList(); }, 20000);\n",
    "function folded(list, id){\n"
    "  if(!foldCache) return false;\n"
    "  " + MARK + ": one index of the undo list (rebuilt when the list or its length changes); unfolded is checked live */\n"
    "  if(!_itOff()){\n"
    "    if(_itSrc !== foldCache || _itLen !== foldCache.length){ _itIdx = new Map(); _itSrc = foldCache; _itLen = foldCache.length;\n"
    "      for(var j=0;j<foldCache.length;j++){ var g=foldCache[j]; if(!g) continue; var gk=String(g.list) + '\\u0001' + String(g.recordId); var ga=_itIdx.get(gk); if(ga) ga.push(g); else _itIdx.set(gk, [g]); } }\n"
    "    var sid=String(id), hit=function(l){ var a=_itIdx.get(l + '\\u0001' + sid); if(!a) return false; for(var q=0;q<a.length;q++){ var e=a[q]; if(e && !e.unfolded && e.recordId===sid && e.list===l) return true; } return false; };\n"
    "    return hit(list) || (list==='invs' && hit('invoices'));\n"
    "  }\n"
    "  for(var i=0;i<foldCache.length;i++){ var f=foldCache[i]; if(f && !f.unfolded && f.recordId===String(id) && (f.list===list || (list==='invs'&&f.list==='invoices'))) return true; }\n"
    "  return false;\n"
    "}\n"
    "var _itSrc=null, _itLen=-1, _itIdx=null, _itVer=-1;\n"
    "function _itOff(){ return " + OFF + "; }\n"
    "function _itFoldVer(){ try{ return window._gcPerfX && window._gcPerfX.version ? window._gcPerfX.version(FOLDK) : -2; }catch(_e){ return -2; } }\n"
    "window._gcIsFolded = folded;\n"
    "foldList(); _itVer=_itFoldVer(); RI.call(window, function(){\n"
    "  /* patch IDLETRIM: read the 1.3 MB undo list again only when this page wrote it, or after 2 min; not while hidden */\n"
    "  if(!_itOff()){\n"
    "    try{ if(document.hidden) return; }catch(_h){}\n"
    "    var v=_itFoldVer(); if(v >= 0 && v === _itVer && foldCache && Date.now() - foldAt < 120000) return;\n"
    "    _itVer=v;\n"
    "  }\n"
    "  foldList();\n"
    "}, 20000);\n"
    "try{ document.addEventListener('visibilitychange', function(){ try{ if(!document.hidden && !_itOff() && Date.now() - foldAt > 20000){ _itVer=_itFoldVer(); foldList(); } }catch(_v){} }); }catch(_ve){}\n")

# 3a. BOOKDEDUPE: an answer identical to the last one for the same request is not hashed again
rep('learnLater',
    "  var kk = String(url).replace(/[?&](limit|offset|order)=[^&]*/g,''), hsh = quickHash(txt);\n"
    "  if(lastAnswer[kk] === hsh) return; lastAnswer[kk] = hsh;\n",
    "  var kk = String(url).replace(/[?&](limit|offset|order)=[^&]*/g,''), hsh;\n"
    "  /* patch IDLETRIM: the same text as the last answer for this request = the same hash, without walking it */\n"
    "  var _itT = (window.__gcItLast || (window.__gcItLast = {}));\n"
    "  if(_itT[kk] !== undefined && _itT[kk] === txt && lastAnswer[kk] !== undefined && !" + OFF + ") return;\n"
    "  hsh = quickHash(txt);\n"
    "  if(txt.length <= 3000000){ var _itK = Object.keys(_itT); if(_itK.length >= 4 && !(kk in _itT)) delete _itT[_itK[0]]; _itT[kk] = txt; } else delete _itT[kk];\n"
    "  if(lastAnswer[kk] === hsh) return; lastAnswer[kk] = hsh;\n")

# 3b. TRAIN2: the file-data scan of a cloud answer identical to the last one for the same request gives the same result
rep('bodyNeedsGet',
    "          if (!bodyNeeds(t)) return mk(t);\n",
    "          if (!_itNeeds(u, t)) return mk(t);   /* patch IDLETRIM */\n")
rep('bodyNeedsDef',
    "function bodyNeeds(s){\n",
    "var _itNeedC = new Map();\n"
    "function _itNeeds(u, s){\n"
    "  /* patch IDLETRIM: bodyNeeds depends only on the text and on whether any blob is registered */\n"
    "  if (typeof s !== 'string' || s.length < 100000 || s.length > 3000000 || " + OFF + ") return bodyNeeds(s);\n"
    "  var bz = blobReg.size > 0, c = _itNeedC.get(u);\n"
    "  if (c && c.bz === bz && c.s === s) return c.r;\n"
    "  var r = bodyNeeds(s);\n"
    "  _itNeedC['delete'](u); _itNeedC.set(u, { s: s, bz: bz, r: r });\n"
    "  if (_itNeedC.size > 4) _itNeedC['delete'](_itNeedC.keys().next().value);\n"
    "  return r;\n"
    "}\n"
    "function bodyNeeds(s){\n")

assert src.count(MARK) >= 3
open(path, 'w', encoding='utf-8').write(src)
print('IDLETRIM: patched', path)
