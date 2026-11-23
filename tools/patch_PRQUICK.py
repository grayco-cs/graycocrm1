# PRQUICK (owner 11/23: "i answered this and its still here but now it went away, took a couple seconds maybe make it quicker"):
# answering / marking sent a 📩 plan / info request now takes its ✅ Approvals card down at once (no wait for the 2-minute bid-hub pull).
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'PRQUICK' not in s
a = "W._gcBpAppr = { rows: function(){ return rows({ kind: 'admin' }, Date.now()); }, refresh: function(){ refresh(true); },"
assert s.count(a) == 1
s = s.replace(a, a + """
  answered: function(jid){ arr(JOBS).forEach(function(j){ if (j && s(j.id) === s(jid) && j.openReq > 0) j.openReq--; });   /* PRQUICK: the card goes at once */
    try { if (W._gcApprovalSetFresh) W._gcApprovalSetFresh(); } catch (e) {} try { if (W._gcApprovalsRefresh) W._gcApprovalsRefresh(); } catch (e) {}
    setTimeout(function(){ refresh(true); }, 1500); },""")
b = "function(r){ toast(a === 'prreply' ? '↩ Reply sent to the sub'"
assert s.count(b) == 1
s = s.replace(b, "function(r){ try { if (W._gcBpAppr && W._gcBpAppr.answered) W._gcBpAppr.answered(M.jobId); } catch (e) {} /* PRQUICK */ toast(a === 'prreply' ? '↩ Reply sent to the sub'")
open(p, 'w', encoding='utf-8').write(s); print('PRQUICK applied')
