#!/usr/bin/env python3
"""patch MOREFIX (owner 11/5 screenshot "looks weird"): the job form's "＋ More details" panel showed as a skinny
column with the job tabs beside it. The panel is now always full width (grid / flex rows wrap around it, its fields flow
2–3 across on a wide screen), and a panel whose form is gone (React re-used the spot for the job page) is removed."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*MOREFIX*/' in src: print('already patched'); sys.exit(0)
def rep(o, n):
    global src
    assert src.count(o) == 1, o[:60]; src = src.replace(o, n)
rep("'.gc-df-more{margin:10px 0 4px;grid-column:1/-1}',",
    "'.gc-df-more{margin:10px 0 4px;grid-column:1/-1;flex:1 1 100%;width:100%;max-width:100%;box-sizing:border-box;min-width:0}',/*MOREFIX*/"
    "':has(> .gc-df-more:not([data-ctx=\"field\"])){flex-wrap:wrap}',"
    "'.gc-df-more:not([data-ctx=\"field\"]) .gc-df-morex{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;align-items:start}',"
    "'.gc-df-more:not([data-ctx=\"field\"]) .gc-df-morex>.gc-df-mnote{grid-column:1/-1}',")
rep("  try { decorateDesk('proj'); decorateDesk('launch'); } catch (e) { warn(e); }",
    "  try { [].forEach.call(D.querySelectorAll('.gc-df-more[data-ctx=\"proj\"],.gc-df-more[data-ctx=\"launch\"]'), function(b){ var p = b.parentElement; if (!p || !p.querySelector(':scope > [data-gc-ja]')) b.remove(); }); } catch (e) {}   /* MOREFIX: an orphan panel goes */\n"
    "  try { decorateDesk('proj'); decorateDesk('launch'); } catch (e) { warn(e); }")
open(P, 'w', encoding='utf-8').write(src); print('patched')
