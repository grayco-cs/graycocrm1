#!/usr/bin/env python3
"""Idempotent patch CCNAG: the "🔑 CompanyCam needs its key" corner note stops flickering in and out
(release sweep 10/28: on a computer without a working CompanyCam key the note was put back every 2.5 s and taken away
again by the page's banner clean-up, so the whole page kept changing while nobody touched it).

The note is put up once; if something else on the page takes it away, it stays away for this visit (it is shown again
after the next page load while the key is still missing — and the Integrations card always tells the truth).
Usage: python3 tools/patch_CCNAG.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CCNAG'
if MARK in src:
    print('CCNAG: already patched'); sys.exit(0)
OLD = """      if(get('gc_cc_nag_off','')==='1'){ if(p) p.remove(); return; }
      if(p) return;
      p=document.createElement('div');
      p.id='_gcCCNag';"""
NEW = """      if(get('gc_cc_nag_off','')==='1'){ if(p) p.remove(); return; }
      if(p) return;
      """ + MARK + """: put up once per visit — taken away by the page, it stays away (no flicker every 2.5 s) */
      if(window.__gcCCNagShown) return; window.__gcCCNagShown = true;
      p=document.createElement('div');
      p.id='_gcCCNag';"""
assert src.count(OLD) == 1, ('CCNAG find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('CCNAG: patched', path)
