#!/usr/bin/env python3
"""Idempotent patch APPRFAST: the Approvals tab answers a tap in well under 100 ms with ~100-150 approvals.

The order of importance (patch APPRORDER) looked each row's own record up again for every row: rawFor() asked
_gcCustApprovals() for the whole customer queue (a copy of it, plus the "waiting on me" list SORTED again) and
re-read gc_sub_approvals from this computer's storage, once per row, and twice per row per sort (tier + date), so a
sort of n rows was n x (copy + sort of the queue). 140 approvals: 150-250 ms per tap on the tab's chips plus 300-600 ms
of busy page. The queue, the sub approvals and the invoices are now indexed by id once (kept 300 ms, so one paint
reads them once); the same first match wins as before, so the order and the chips are exactly the same."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch APPRFAST'
if MARK in t: print('APPRFAST: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('APPRFAST anchor count != 1', n, old[:90])
    t = t.replace(old, new)

once("""function queueAll(){ try { var c = W._gcCustApprovals ? W._gcCustApprovals() : null; return arr(c && c.all); } catch (e) { return []; } }
function invById(id){ var l = arr((W._crm || {}).invoices); for (var i = 0; i < l.length; i++) if (l[i] && s(l[i].id) === s(id)) return l[i]; return null; }
function rawFor(r){
  if (!r) return null;
  if (r.__raw) return r.__raw;
  var id = s(r.id);
  if (r.src === 'queue') return queueAll().filter(function(x){ return s(x.id) === id; })[0] || null;
  if (r.src === 'sub') return lsList('gc_sub_approvals').filter(function(x){ return s(x.id) === id || s(x.invId) === id; })[0] || null;
  if (r.src === 'inv') return invById(id);""",
"""function queueAll(){ try { var c = W._gcCustApprovals ? W._gcCustApprovals() : null; return arr(c && c.all); } catch (e) { return []; } }
""" + MARK + """: one index of the queue / sub approvals / invoices per paint (300 ms), the first match wins as before */
var IDX = null;
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
function invById(id){ return idx().inv[s(id)] || null; }
function rawFor(r){
  if (!r) return null;
  if (r.__raw) return r.__raw;
  var id = s(r.id);
  if (r.src === 'queue') return idx().q[id] || null;
  if (r.src === 'sub') return idx().sub[id] || null;
  if (r.src === 'inv') return invById(id);""")
open(p, 'w', encoding='utf-8').write(t); print('APPRFAST: patched')
