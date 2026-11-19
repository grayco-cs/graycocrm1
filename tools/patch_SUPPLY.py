#!/usr/bin/env python3
"""Idempotent patch SUPPLY: the CRM's outside scripts are pinned and checked.

1. supabase-js: the floating https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2 tag -> our own copy
   /vendor/supabase-js-2.119.0.min.js (the 2.119.0 UMD build, dist/umd/supabase.js; byte-identical on jsdelivr, unpkg and in the
   npm tarball, whose sha512 matches the registry). It is the version "@2" served on 11/19, so nothing changes in the app.
2. tools/supply_block.html goes in right after LSGUARD: the SRI table for every pinned CDN file, a hook that adds integrity +
   crossorigin="anonymous" to a script / stylesheet for one of those exact addresses before it is added to the page (dynamic
   loaders included), and window.__gcMammoth() (mammoth 1.6.0 from cdnjs, checked).
3. React / ReactDOM 18.3.1 tags: integrity + crossorigin="anonymous".
4. The two mammoth "+esm" imports (esm.sh, jsdelivr: generated on the fly, not checkable) -> window.__gcMammoth().
5. docx 8.5.0: cdnjs has no docx library (the old link answers 404, so the schedule's Word export never loaded) -> the npm file
   on jsdelivr (build/index.umd.js, the same bytes as unpkg), checked.
Usage: python3 tools/patch_SUPPLY.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_SUPPLY__' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'supply_block.html'), encoding='utf-8').read().rstrip('\n')
a = src.index('<script id="gc-patch-lsguard">'); b = src.index('</script>', a) + len('</script>')
src = src[:b] + '\n' + BLOCK + src[b:]
src = once(src, '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
                '<script src="/vendor/supabase-js-2.119.0.min.js"></script>')
src = once(src, '<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js" crossorigin></script>',
                '<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js" integrity="sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z" crossorigin="anonymous"></script>')
src = once(src, '<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js" crossorigin></script>',
                '<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js" integrity="sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1" crossorigin="anonymous"></script>')
src = once(src, 'const _mn=await import("https://esm.sh/mammoth@1.6.0/+esm");', 'const _mn=await window.__gcMammoth();')
src = once(src, 'Lv(()=>import("https://cdn.jsdelivr.net/npm/mammoth@1.6.0/+esm"),void 0)', 'Lv(()=>window.__gcMammoth(),void 0)')
src = once(src, 's.src = "https://cdnjs.cloudflare.com/ajax/libs/docx/8.5.0/docx.umd.min.js";',
                's.src = "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js";   /* patch SUPPLY: cdnjs has no docx (404); the npm file, SRI-checked */')
open(path, 'w', encoding='utf-8').write(src)
print('patched')
