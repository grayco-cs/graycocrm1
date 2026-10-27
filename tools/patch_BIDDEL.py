#!/usr/bin/env python3
"""patch BIDDEL — a bid taken off the Bid Board stays off, on every computer.
usage: python3 tools/patch_BIDDEL.py [index.html]      (in place; idempotent: a patched file is left as it is)
Why: the card's red DELETE (top) only filtered the screen's list and wrote no delete mark, so the next union push
put the bid back from the cloud copy and every other computer kept it. Both delete buttons now go through one
in-page question (tools/biddel_tail.js): remove from the bid list (default) / + mark the job Lost / + delete the job,
and the removal is written to the synced delete list. Launch Job never re-adds a bid for a job/PO taken off the list.
  1. the board's bid setter is reachable (window._gcSetBids)
  2. top DELETE and bottom 🗑 Delete ask through window._gcBidDel; the old confirm paths (kept as a fallback) mark too
  3. Launch Job skips a bid for a PO/job that was taken off the list
  4. tools/biddel_tail.js after the last </script>"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
t = open(path, encoding='utf-8').read()
if '__GC_BIDDEL__' in t:
    print('already patched (BIDDEL) — nothing changed'); sys.exit(0)

def rep(a, b, n=1):
    global t
    c = t.count(a)
    assert c == n, (c, n, a[:100])
    t = t.replace(a, b)

# 1. the bid list's setter
rep('window._setLeads=__gcS("_setLeads",$r);',
    'window._setLeads=__gcS("_setLeads",$r);window._gcSetBids=tt;')
# 2a. top red DELETE
rep('onClick:()=>ke(M.id),children:"DELETE"',
    'onClick:()=>{if(window._gcBidDel){window._gcBidDel(M,tt);return}ke(M.id)},children:"DELETE"')
# 2b. its old confirm path (fallback) now writes the delete mark
rep('ke=M=>{confirm("Delete this bid opportunity?")&&tt(N=>N.filter(Ee=>Ee.id!==M))}',
    'ke=M=>{confirm("Delete this bid opportunity?")&&(window._gcxDel&&window._gcxDel("bidLists",M),window._gcTombstone&&window._gcTombstone("bidLists",M),tt(N=>N.filter(Ee=>Ee.id!==M)))}')
# 2c. bottom 🗑 Delete
rep('onClick:()=>{if(window.confirm("Remove \\""+(M.title||"this bid")+"\\" from the Bid Board? This can\'t be undone."))(window._gcxDel&&window._gcxDel("bidLists",M.id),tt(_p=>_p.filter(_b=>_b.id!==M.id)))}',
    'onClick:()=>{if(window._gcBidDel){window._gcBidDel(M,tt);return}if(window.confirm("Remove \\""+(M.title||"this bid")+"\\" from the Bid Board? This can\'t be undone."))(window._gcxDel&&window._gcxDel("bidLists",M.id),tt(_p=>_p.filter(_b=>_b.id!==M.id)))}')
# 3. Launch Job: no bid for a PO / job someone took off the list
rep('tt(Ee=>[...Ee,{id:$t("BID"),title:L,client:Le.client',
    'tt(Ee=>(window._gcBidDismissed&&window._gcBidDismissed({id:"",pid:T,notes:"PO: "+y+" — Auto-added from Launch Job"}))?Ee:[...Ee,{id:$t("BID"),title:L,client:Le.client')
# 4. the tail
tail = open(os.path.join(here, 'biddel_tail.js'), encoding='utf-8').read().rstrip('\n')
assert tail.startswith('<script>') and tail.endswith('</script>') and tail.count('</script>') == 1
i = t.rfind('</script>'); assert i > 0
i += len('</script>')
t = t[:i] + '\n' + tail + t[i:]
open(path, 'w', encoding='utf-8').write(t)
print('patched (BIDDEL)')
