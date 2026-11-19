#!/usr/bin/env python3
"""patch LEADWATCH — 🚨 leads at risk + To-Do only from now on (owner 11/19).
   Inserts tools/leadwatch_block.html after the PAPERS block, with netlify/functions/_lib/lead-watch.js inlined word for word,
   and hooks TD2's build (after the PAPERS drop). Run again after lead-watch.js changes: the inlined copy is replaced."""
import io, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html')
t = io.open(IDX, encoding='utf-8').read()
core = io.open(os.path.join(ROOT, 'netlify/functions/_lib/lead-watch.js'), encoding='utf-8').read().rstrip('\n')
blk = io.open(os.path.join(ROOT, 'tools/leadwatch_block.html'), encoding='utf-8').read().rstrip('\n').replace('__LEADWATCH_CORE__', core)
if '</script' in core: sys.exit('lead-watch.js must not contain </script')
m = re.search(r'<script id="gc-patch-leadwatch">.*?</script>', t, re.S)
if m:
    t = t[:m.start()] + blk + t[m.end():]
else:
    a = t.index('<script id="gc-patch-papers">'); b = t.index('</script>', a) + len('</script>')
    t = t[:b] + '\n' + blk + t[b:]
HOOK = "  try { if (W._gcPapers && W._gcPapers.todoDrop) raw = raw.filter(function(r){ return !W._gcPapers.todoDrop(r, proj); }); } catch (e) { warn(e); }   /* PAPERS: an older job's auto To-Dos are off */\n"
ADD = "  try { if (W._gcLeadWatch && W._gcLeadWatch.filterRaw) raw = W._gcLeadWatch.filterRaw(raw, proj); } catch (e) { warn(e); }   /* LEADWATCH: an automatic To-Do about a record from before OLDER_BEFORE is not shown (only from now on) */\n"
if ADD not in t:
    if t.count(HOOK) != 1: sys.exit('TD2 PAPERS hook not found once')
    t = t.replace(HOOK, HOOK + ADD)
io.open(IDX, 'w', encoding='utf-8').write(t)
print('LEADWATCH patched')
