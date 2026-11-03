#!/usr/bin/env python3
"""patch BIDMERGE — one lead per project (owner 11/02: "9 invitations for the same job but different trades … only alert us
the one time … just have it list for 2 GCs etc.").

  python3 tools/patch_BIDMERGE.py [index.html]

The page code is tools/bidmerge_tail.js; the matching rules (the CORE-BEGIN … CORE-END block of
netlify/functions/_lib/bid-merge.js) are copied VERBATIM into it, so the CRM's "🔗 Merge duplicate bid leads" groups leads
exactly the way the server files new invitations. Small hooks, each marked /* patch BIDMERGE */:
  · LD2 fromItem: the item's gcs + "+1 GC" history lines onto the lead;   · LD2 window._gcLeadInbox: + act (the merge tells the inbox);
  · INBOXLIST row: "· 3 GCs · 9 trades";   · INBOXLIST detail panel: the GCs section;
  · Leads hub: the "Bid to" count reads gcs; the name shows "🔗 3 GCs · 9 trades"; ⋯ More + the classic bar: the merge button.
Every anchor must occur exactly once; a re-run prints "already patched".
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'index.html')
MARK = '/* patch BIDMERGE */'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_BIDMERGE__' in src:
    print('already patched')
    sys.exit(0)

lib = open(os.path.join(HERE, '..', 'netlify', 'functions', '_lib', 'bid-merge.js'), encoding='utf-8').read()
a, b = lib.find('/* CORE-BEGIN'), lib.find('/* CORE-END */')
assert a >= 0 and b > a and lib.count('/* CORE-BEGIN') == 1 and lib.count('/* CORE-END */') == 1, 'core block markers'
core = lib[a:b + len('/* CORE-END */')]
tail = open(os.path.join(HERE, 'bidmerge_tail.js'), encoding='utf-8').read().rstrip('\n')
assert tail.count('/*__BM_CORE__*/') == 1
tail = tail.replace('/*__BM_CORE__*/', core)
assert '</script' not in tail.lower(), 'no </script> inside the patch'

HOOKS = [
    # LD2 fromItem: the GC list and the quiet history lines
    ("l.matchNotes = arr(it.notes).slice(-6); l.needsReview = !!it.needsReview; l.origin = s(it.origin);",
     "l.matchNotes = arr(it.notes).slice(-6); l.needsReview = !!it.needsReview; l.origin = s(it.origin);"
     " if (window._gcBidMerge) { try { window._gcBidMerge.fromItem(l, it, prev); } catch (e) {} }   " + MARK),
    # LD2: the merge tells the inbox through the same queue as every other action
    ("  list: listOut, assignList: assignList,\n",
     "  list: listOut, assignList: assignList, act: act,   " + MARK + "\n"),
    # INBOXLIST row
    ("    + '<span class=\"c-nm\" title=\"' + esc(l.name) + '\">' + esc(l.name) + '</span>'",
     "    + '<span class=\"c-nm\" title=\"' + esc(l.name) + '\">' + esc(l.name) + (window._gcBidMerge ? window._gcBidMerge.rowTag(l) : '') + '</span>'   " + MARK),
    # INBOXLIST detail panel: the GCs, before Links
    ("    + (lk && (lk.main || lk.more) ? '<section class=\"px-sec\"><h4>Links</h4>'",
     "    + (!rs && window._gcBidMerge ? window._gcBidMerge.paneHtml(l) : '')   " + MARK + "\n"
     "    + (lk && (lk.main || lk.more) ? '<section class=\"px-sec\"><h4>Links</h4>'"),
    # Leads hub: "Bid to N GCs" counts the lead's own GC list too
    ("    r.gc.forEach(add);\n",
     "    r.gc.forEach(add); arr(l.gcs).forEach(function(g){ add(g && g.name); });   " + MARK + "\n"),
    # Leads hub row: the name
    ("+ '<b>' + r.ic + ' ' + r.name + '</b> ' + roleChip(l) + (r.addr ?",
     "+ '<b>' + r.ic + ' ' + r.name + '</b> ' + roleChip(l) + (W._gcBidMerge ? W._gcBidMerge.chip(l) : '') /* patch BIDMERGE */ + (r.addr ?"),
    # Leads hub ⋯ More menu
    ("    + (adm ? it('data-gcl-clean', '🧹 Clean up' + (nCl ? ' (' + nCl + ')' : ''), 'Duplicates, imported, stale and already-a-job leads') : '')\n",
     "    + (adm ? it('data-gcl-clean', '🧹 Clean up' + (nCl ? ' (' + nCl + ')' : ''), 'Duplicates, imported, stale and already-a-job leads') : '')\n"
     "    + (W._gcBidMerge && W._gcBidMerge.show() ? it('data-gcl-bidmerge', W._gcBidMerge.label(), 'One project that came in as several leads (other trades, other GCs, another board) — a dry run first, then merge; Undo for 30 days') : '')   " + MARK + "\n"),
    # Leads hub classic bar
    ("🧹 Clean up (' + nCl + ')</button>' : ''); })(); })()",
     "🧹 Clean up (' + nCl + ')</button>' : '') + (W._gcBidMerge && W._gcBidMerge.show() ? '<button type=\"button\" class=\"gcl-mv\" data-gcl-bidmerge title=\"One project that came in as several leads — a dry run first\">' + W._gcBidMerge.label() + '</button>' : '') /* patch BIDMERGE */; })(); })()"),
]
for old, new in HOOKS:
    assert src.count(old) == 1, ('anchor count', old[:70], src.count(old))
for old, new in HOOKS:
    src = src.replace(old, new)

# the script itself: right after the 🧹 Clean up (LCLEAN) script
lc = 'if (window.__GC_PATCH_LCLEAN__) return;'
assert src.count(lc) == 1, ('LCLEAN script', src.count(lc))
end = src.index('</script>', src.index(lc)) + len('</script>')
assert src[end:end + 1] == '\n', 'LCLEAN script end'
src = src[:end + 1] + '<script id="gc-patch-bidmerge">\n' + MARK + '\n' + tail + '\n</script>\n' + src[end + 1:]

assert src.count('__GC_PATCH_BIDMERGE__') >= 1 and src.count('<script id="gc-patch-bidmerge">') == 1
assert src.count(MARK) == 1 + len(HOOKS), ('marker count', src.count(MARK))
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
