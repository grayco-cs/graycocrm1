#!/usr/bin/env python3
"""Idempotent patch APPRLOOP: signing in froze the page ("page not responding") on the real data.

APPRFAST's idx() built one index of the queue + sub approvals + invoices, and invById() went through it. Building
it calls queueAll() -> _gcCustApprovals() -> mine() -> _gcApprovalSortItems() -> tierOf() -> invById() -> idx()
again, before IDX is set. With a queue item that has meta.invoiceId (real data has them, the test seed did not)
that recursion grows without end until the stack overflows, the try/catch swallows it, and every level starts
over: minutes of a frozen page right after sign-in.
Fix: invoices get their own index (they never needed the queue), and idx() refuses to re-enter itself while it is
being built (it answers the last index, or an empty one). Order and chips stay the same."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch APPRLOOP'
if MARK in t: print('APPRLOOP: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('APPRLOOP anchor count != 1', n, old[:90])
    t = t.replace(old, new)

once("""var IDX = null;
function idx(){
  var now = Date.now(), inv = (W._crm || {}).invoices;
  if (IDX && now - IDX.at < 300 && IDX.invL === inv) return IDX;
  var q = {}, sub = {}, iv = {};
  queueAll().forEach(function(x){ var k = s(x && x.id); if (!(k in q)) q[k] = x; });
  lsList('gc_sub_approvals').forEach(function(x){ if (!x) return; var a = s(x.id), b = s(x.invId); if (!(a in sub)) sub[a] = x; if (!(b in sub)) sub[b] = x; });
  arr(inv).forEach(function(x){ if (!x) return; var k = s(x.id); if (!(k in iv)) iv[k] = x; });
  IDX = { at: now, invL: inv, q: q, sub: sub, inv: iv };
  return IDX;
}
function invById(id){ return idx().inv[s(id)] || null; }""",
"""var IDX = null;
""" + MARK + """: invoices have their own index, and idx() never re-enters itself (the queue read sorts, the sort reads invoices) */
var IDXI = null, IDX_BUSY = false, IDX_EMPTY = { at: 0, invL: null, q: {}, sub: {}, inv: {} };
function invIdx(){
  var now = Date.now(), inv = (W._crm || {}).invoices;
  if (IDXI && now - IDXI.at < 300 && IDXI.invL === inv) return IDXI.inv;
  var iv = {}; arr(inv).forEach(function(x){ if (!x) return; var k = s(x.id); if (!(k in iv)) iv[k] = x; });
  IDXI = { at: now, invL: inv, inv: iv };
  return iv;
}
function idx(){
  var now = Date.now(), inv = (W._crm || {}).invoices;
  if (IDX && now - IDX.at < 300 && IDX.invL === inv) return IDX;
  if (IDX_BUSY) return IDX || IDX_EMPTY;
  IDX_BUSY = true;
  try {
    var q = {}, sub = {};
    queueAll().forEach(function(x){ var k = s(x && x.id); if (!(k in q)) q[k] = x; });
    lsList('gc_sub_approvals').forEach(function(x){ if (!x) return; var a = s(x.id), b = s(x.invId); if (!(a in sub)) sub[a] = x; if (!(b in sub)) sub[b] = x; });
    IDX = { at: now, invL: inv, q: q, sub: sub, inv: invIdx() };
  } finally { IDX_BUSY = false; }
  return IDX;
}
function invById(id){ return invIdx()[s(id)] || null; }""")

open(p, 'w', encoding='utf-8').write(t)
print('APPRLOOP: patched')
