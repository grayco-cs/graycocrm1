#!/usr/bin/env python3
"""patch LATEBID - the CRM side of late bids (owner 11/23: "when jobs are past due they come off our bid list, subs can still send us a
bid if they have it on their bid list ... then they can send a late bid in").

  * 🏗 Bid portal (📊 Bids & invites): a job past its sub due date (the server's rule: due date + time, Central; bid-hub sends pastDue)
    leaves the default "Open" list; a new "⏰ Past due (n)" filter finds them. The red "Subs due …" stays on those rows.
  * A ⏰ late bid is marked in both bids lists (📊 Bids in the 🏗 Bid portal screen and the 📊 Bids compare / estimate view), and the
    row shows "⏰ n late" next to the bid count.
Idempotent: a second run prints "already patched". Every anchor must occur exactly once or nothing is written.

usage: python3 tools/patch_LATEBID.py [path/to/index.html]
"""
import os, sys

P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
src = open(P, encoding='utf-8').read()
if 'patch LATEBID' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    n = s.count(old)
    assert n == 1, (n, old[:90])
    return s.replace(old, new)

# 1. the filter: past due off "Open", "⏰ Past due" finds them
src = once(src,
    "    if (BP.f === 'open' && /^(closed|won|lost|awarded)$/i.test(j.status)) return false;\n",
    "    if (BP.f === 'open' && /^(closed|won|lost|awarded)$/i.test(j.status)) return false;\n"
    "    if (BP.f === 'open' && pastDue(j)) return false;   /* patch LATEBID: past the sub due date → off the default list */\n"
    "    if (BP.f === 'pastdue' && (!pastDue(j) || j.visibility === 'draft' || /^(closed|won|lost|awarded)$/i.test(j.status))) return false;\n")
src = once(src,
    "  fbar.innerHTML = [['open', 'Open'], ['private', '🔒 Private'], ['public', '🌐 Public'], ['draft', '📝 Drafts'], ['all', 'All'],",
    "  fbar.innerHTML = [['open', 'Open'], ['pastdue', '⏰ Past due'], ['private', '🔒 Private'], ['public', '🌐 Public'], ['draft', '📝 Drafts'], ['all', 'All'],")
# 2. one rule for "past due": the server's flag (Central, the due time); an older server → the date alone
src = once(src,
    "function dueCell(j){\n  var past = j.due && j.due < new Date().toISOString().slice(0, 10) && !/^(closed|won|lost|awarded)$/i.test(s(j.status));",
    "function pastDue(j){ return j && j.pastDue != null ? !!j.pastDue : !!(j && j.due && j.due < new Date().toISOString().slice(0, 10)); }   /* patch LATEBID */\n"
    "function dueCell(j){\n  var past = pastDue(j) && !/^(closed|won|lost|awarded)$/i.test(s(j.status));")
# 3. the row: "⏰ n late" by the bid count
src = once(src,
    "'</td><td class=\"num\" data-l=\"Invited\">' + j.invited + '</td><td class=\"num\" data-l=\"Bids\">' + j.bids + '</td>'",
    "'</td><td class=\"num\" data-l=\"Invited\">' + j.invited + '</td><td class=\"num\" data-l=\"Bids\">' + j.bids + (j.lateBids ? '<div data-sys-late=\"' + esc(j.id) + '\" style=\"color:#b45309;font-weight:700;font-size:12px\">⏰ ' + j.lateBids + ' late</div>' : '') + '</td>'")
# 4. 📊 Bids in the 🏗 Bid portal screen
src = once(src,
    "        + '<td class=\"mut\">' + esc(when(b.at)) + '</td><td>' + srcTag(b.source) + '</td>'\n",
    "        + '<td class=\"mut\">' + esc(when(b.at)) + (b.late ? '<div data-sys-latebid=\"' + esc(b.id) + '\" style=\"color:#b45309;font-weight:800\" title=\"' + esc(b.lateChangedAt ? 'Changed after the due date ' + when(b.lateChangedAt) : 'Sent after the due date') + '\">⏰ Late bid</div>' : '') + '</td><td>' + srcTag(b.source) + '</td>'   /* patch LATEBID */\n")
# 5. the 📊 Bids compare / estimate view
src = once(src,
    "          + '<td class=\"mut\">' + src[0] + ' ' + esc(src[1]) + (b.at ? '<br>' + esc(when(b.at)) : '') + '</td>'\n",
    "          + '<td class=\"mut\">' + src[0] + ' ' + esc(src[1]) + (b.at ? '<br>' + esc(when(b.at)) : '') + (b.late ? '<div data-be-late=\"' + esc(k) + '\" style=\"color:#b45309;font-weight:800\">⏰ Late bid</div>' : '') + '</td>'   /* patch LATEBID */\n")
open(P, 'w', encoding='utf-8').write(src)
print('patched LATEBID')
