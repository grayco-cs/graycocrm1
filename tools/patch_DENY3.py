#!/usr/bin/env python3
"""Idempotent patch DENY3: a ✕ Deny made while the To-Do list is still loading is not lost
(release check 10/28: now and then the card came back and no "Fix and resend" To-Do was there).

Cause: right after the page opens, this computer's copy of the To-Do list (gc_office_tasks) can still be the short,
not-yet-synced one; the deny's To-Do was added to it, and the cloud's list arriving a moment later replaced it — the
deny was gone (and the card back on Approvals). Now every deny is also kept in its own list on this computer
(gc_apx_denies): it holds the card back by itself, and every few seconds a deny whose To-Do is missing from the To-Do list
is put back (once the To-Do is ticked done, it is forgotten here). Usage: python3 tools/patch_DENY3.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch DENY3'
if MARK in src:
    print('DENY3: already patched'); sys.exit(0)
OLD1 = """    ot.push({ id: 'DENY' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: '↩ Fix and resend: ' + title + ' — ' + why.slice(0, 160) + ' (from ' + me + ')', note: 'Sent back from Approvals by ' + me + '. Fix it, then tick this done: it goes back on Approvals.', assignee: to === 'the office' ? '' : to, pid: d.pid, addedBy: me, addedAt: at, at: at, done: false, _deny: d });"""
NEW1 = """    var tk = { id: 'DENY' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: '↩ Fix and resend: ' + title + ' — ' + why.slice(0, 160) + ' (from ' + me + ')', note: 'Sent back from Approvals by ' + me + '. Fix it, then tick this done: it goes back on Approvals.', assignee: to === 'the office' ? '' : to, pid: d.pid, addedBy: me, addedAt: at, at: at, done: false, _deny: d };
    ot.push(tk); denyKeep(tk);   """ + MARK + """: kept in its own list too */"""
assert src.count(OLD1) == 1, ('DENY3 find-string 1 count != 1', src.count(OLD1))
src = src.replace(OLD1, NEW1)
OLD2 = """  arr(l).forEach(function(t){ var d = t && t._deny; if (!d || !d.key) return; if (t.done || t.completed) (done[d.key] = done[d.key] || []).push(d); else open[d.key] = d; });
  DENYC = { at: Date.now(), open: open, done: done }; return DENYC;
}"""
NEW2 = """  arr(l).forEach(function(t){ var d = t && t._deny; if (!d || !d.key) return; if (t.done || t.completed) (done[d.key] = done[d.key] || []).push(d); else open[d.key] = d; });
  var seen = {}; arr(l).forEach(function(t){ if (t && t.id) seen[t.id] = 1; });
  denyKept().forEach(function(t){ if (t && t._deny && t._deny.key && !seen[t.id]) open[t._deny.key] = t._deny; });   """ + MARK + """: a deny whose To-Do is not (yet) in the list still holds the card back */
  DENYC = { at: Date.now(), open: open, done: done }; return DENYC;
}
function denyKept(){ try { var v = JSON.parse(localStorage.getItem('gc_apx_denies') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function denyKeep(tk){ try { var l = denyKept().filter(function(x){ return x && x.id !== tk.id; }); l.push(tk); localStorage.setItem('gc_apx_denies', JSON.stringify(l.slice(-200))); } catch (e) { warn(e); } }
/* every 5 s: a kept deny whose To-Do is missing from the To-Do list is put back; one ticked done is forgotten here */
function denyRepair(){
  var kept = denyKept(); if (!kept.length) return;
  var ot = []; try { ot = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); } catch (e) { return; } if (!Array.isArray(ot)) return;
  var byId = {}; ot.forEach(function(t){ if (t && t.id) byId[t.id] = t; });
  var keep = [], add = [];
  kept.forEach(function(tk){ var t = byId[tk.id]; if (t) { if (!(t.done || t.completed)) keep.push(tk); } else { keep.push(tk); add.push(tk); } });
  if (add.length) { try { localStorage.setItem('gc_office_tasks', JSON.stringify(ot.concat(add))); } catch (e) { warn(e); return; }
    try { if (typeof W._gcOfficeTasksPush === 'function') W._gcOfficeTasksPush(); else if (W._gcSyncQ && W._gcSyncQ.add) W._gcSyncQ.add('gc_office_tasks', ot.concat(add)); } catch (e) { warn(e); } DENYC.at = 0; }
  if (keep.length !== kept.length) { try { localStorage.setItem('gc_apx_denies', JSON.stringify(keep)); } catch (e) {} }
}
(W.__GC_NATIVE_SETINTERVAL__ || W.setInterval).call(W, function(){ try { denyRepair(); } catch (e) {} }, 5000);"""
assert src.count(OLD2) == 1, ('DENY3 find-string 2 count != 1', src.count(OLD2))
src = src.replace(OLD2, NEW2)
open(path, 'w', encoding='utf-8').write(src)
print('DENY3: patched', path)
