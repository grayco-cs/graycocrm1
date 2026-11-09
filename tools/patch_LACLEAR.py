#!/usr/bin/env python3
"""patch LACLEAR (owner 11/9: the ☣️ Lead & asbestos card "wasn't working well, glitching, need to be more specific"): copies
tools/leadasb_tail.js (one plain question per line in 3 numbered parts + "Papers this job needs"; its own style id 'gc-lasb-css' —
'gc-la-css' was the bid-lead module's, so the card never had its styles; a fresh card is swapped in on each change so the papers
appear as soon as the answers call for them; the cursor stays where the person is) over the LEADASB block in index.html."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
tail = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'leadasb_tail.js'), encoding='utf-8').read().strip()
i = src.index('<script id="gc-patch-leadasb">'); j = src.index('</script>', i) + 9
if src[i:j] == tail: print('already patched'); sys.exit(0)
open(P, 'w', encoding='utf-8').write(src[:i] + tail + src[j:]); print('patched')
