#!/usr/bin/env python3
"""patch APPRINPLACE - approve an expense right where it is listed (owner 10/30: "approving here shouldnt go to approvals somewhere else").

Accounting -> To Match: the "Approve..." button on an "Expense waiting for approval" row, and "Approve -> P&L" in its
Expense Details, approve the expense in place - the same _gcApproveExpense the Expenses to Approve card calls (P&L post,
job charge, approval record), the expense itself marked approved, the approval list saved to the cloud (live push) -
then the row leaves the list, the counts drop, and the screen stays. An expense with no job first shows the card's own
"Charge this expense to job" pick in the row / the details.

Stale lists: an expense already approved / not approved / deleted no longer shows on any list (To Match, Expenses to
Approve, the Approvals tab, the approval counts) - one rule, window._gcExpDecided(expId), read by all of them.
Why they stayed: the approval only flipped the queue entry and two flags on the expense (no status), the flags were
lost to the next copy of the expense list, To Match reads the expense status, Expenses to Approve reads the queue, and
the queue kept entries for expenses approved in the Expense Center or deleted since.

Idempotent: a second run prints "already patched" and changes nothing. Every find-string must occur exactly once.

usage: python3 tools/patch_APPRINPLACE.py [path/to/index.html]
"""
import os, sys

P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
src = open(P, encoding='utf-8').read()
if 'patch APPRINPLACE' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    n = s.count(old)
    assert n == 1, (n, old[:90])
    return s.replace(old, new)

JS = r"""<script id="gc-patch-apprinplace">
/* patch APPRINPLACE (owner 10/30: "approving here shouldnt go to approvals somewhere else").
   Accounting -> To Match: "Approve..." on an expense row (and "Approve -> P&L" in its Expense Details) approves it right
   there with the same _gcApproveExpense the Expenses to Approve card calls; no job yet -> the card's job pick, in place.
   Every approval also marks the expense itself approved and saves the approval list to the cloud, so it stays approved
   on every computer. window._gcExpDecided(expId): approved / not approved / deleted -> off every list.
   Console: _gcApprInPlace.state() */
(function(){
'use strict';
if (window.__GC_PATCH_APPRINPLACE__) return; window.__GC_PATCH_APPRINPLACE__ = true;
var W = window, D = document, done = [];
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function crm(){ return W._crm || {}; }
function lsQ(){ try { var v = JSON.parse(localStorage.getItem('gc_expense_approvals') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function toast(m){ try { if (typeof W.showToast === 'function') { W.showToast(m); return; } } catch (e) {} }
var DECIDED = /^(approved|rejected|denied)$/;

/* one read of the queue + the expense list per task (the lists call this once per row) */
var memo = null;
function snap(){
  if (memo) return memo;
  var dq = {}, em = {}, ex = crm().expenses;
  lsQ().forEach(function(a){ if (a && DECIDED.test(low(a.status))) dq[s(a.expId)] = a; });
  arr(ex).forEach(function(e){ if (e) { var k = s(e.id || e._id); if (k) em[k] = e; } });
  memo = { dq: dq, em: em, n: arr(ex).length };
  try { Promise.resolve().then(function(){ memo = null; }); } catch (e) { memo = null; }
  return memo;
}
function expDone(e){
  if (!e) return false;
  if (e.rejected || /^(approved|invoiced|paid|rejected|denied|void|voided)$/.test(low(e.status))) return true;
  return e.approved === true && (/^approved/i.test(s(e.postedHow)) || !!s(e.approvedBy));
}
/* true = nothing left to approve: decided in the approval list, the expense approved / rejected, or the expense is gone */
W._gcExpDecided = function(id, rec){
  try {
    id = s(id); if (!id) return false;
    var m = snap();
    if (m.dq[id]) return true;
    var e = rec || m.em[id];
    if (e) return expDone(e);
    if (typeof W._gcIsTombstoned === 'function' && W._gcIsTombstoned('expenses', id)) return true;
    return m.n > 0;
  } catch (x) { return false; }
};

/* after any approval (the card, Approvals, here): the expense itself says approved, the approval list goes to the cloud */
var pend = null;
function settle(id){
  memo = null;
  var q = lsQ(), hit = null, rej = false, now = new Date().toISOString(), my = pend && pend.id === id ? pend : null;
  q.forEach(function(a){ if (!a || s(a.expId) !== id) return; var st = low(a.status); if (st === 'approved') hit = a; else if (DECIDED.test(st)) rej = true; });
  if (!hit && rej) return false;
  var e = snap().em[id] || {};
  var by = s(hit && hit.approvedBy) || s(W._gcMeNow && W._gcMeNow.name); try { by = by || s(localStorage.getItem('grayco_user')); } catch (x) {}
  if (!hit) {
    hit = { id: 'expId:' + id, expId: id, jobId: my && my.has ? my.pid : (s(e.pid) || null), pm: null, amount: e.amt != null ? e.amt : (e.amount || 0),
      payee: s(e.vendor || e.payee || e.sub), desc: s(e.desc || e.description || e.category), matched: !!s(e.pid), status: 'approved',
      enteredAt: s(e.enteredAt || e.createdAt || e.date) || now, source: s(e.source) || 'crm', approvedBy: by, approvedAt: now };
    q.unshift(hit);
  }
  hit.updatedAt = now;
  try { localStorage.setItem('gc_expense_approvals', JSON.stringify(q)); } catch (x) {}
  try { if (W.idbSet) W.idbSet('gc_expense_approvals', q); } catch (x) {}
  try { if (typeof W._supaUpsert === 'function') W._supaUpsert('gc_expense_approvals', q); } catch (x) {}
  var pid; if (my && my.has) pid = my.pid || ''; else if (s(hit.jobId) && hit.jobId !== '__overhead__' && !s(e.pid)) pid = s(hit.jobId);
  var set = W._setExpenses;
  if (typeof set === 'function') {
    try {
      set(function(prev){
        if (!Array.isArray(prev)) return prev;
        return prev.map(function(x){
          if (!x || s(x.id || x._id) !== id) return x;
          var up = { approved: true, _posted: true, postedHow: x.postedHow || ('approved by ' + by), postedAt: x.postedAt || now, approvedBy: s(x.approvedBy) || by, approvedAt: x.approvedAt || now, updatedAt: now };
          if (!s(x.status) || /^pending/.test(low(x.status))) up.status = 'approved';
          if (pid !== undefined) { up.pid = pid; up._jobSetBy = 'approval'; }
          return Object.assign({}, x, up);
        });
      });
    } catch (x) {}
  }
  memo = null;
  done.push({ id: id, by: by, at: now, pid: pid });
  return true;
}
function wrapApprove(){
  var f = W._gcApproveExpense; if (typeof f !== 'function' || f.__gcAPIP) return;
  var w = function(id){ var r = f.apply(this, arguments); try { settle(s(id)); } catch (e) {} return r; };
  try { Object.keys(f).forEach(function(k){ w[k] = f[k]; }); } catch (e) {}
  w.__gcAPIP = true; W._gcApproveExpense = w;
}
wrapApprove();

function queueEntry(id){ return lsQ().filter(function(a){ return a && s(a.expId) === id; })[0] || null; }
function needsJob(id){
  var e = snap().em[id] || {}, a = queueEntry(id) || {};
  return !s(e.pid) && !e.overhead && !s(a.jobId);
}
function approveNow(id, pid, has, after){
  wrapApprove();
  if (typeof W._gcApproveExpense !== 'function') return false;
  pend = { id: id, pid: pid || '', has: !!has };
  var r;
  try {
    if (has && typeof W._gcSetExpenseJob === 'function') W._gcSetExpenseJob(id, pid || '');
    r = W._gcApproveExpense(id);
  } finally { pend = null; memo = null; }
  if (r !== false) toast('Approved → P&L');
  try { if (typeof after === 'function') after(r !== false); } catch (e) {}
  try { if (typeof W._gcAcctRedraw === 'function') W._gcAcctRedraw(); } catch (e) {}
  return r !== false;
}
/* the card's "Charge this expense to job" pick, in the row (or the details) */
function jobOptions(){
  return '<option value="">-- no job (general overhead) --</option>' + arr(crm().projects).filter(function(p){ return p && p.status !== 'lost'; }).map(function(p){
    return '<option value="' + esc(p.id) + '">' + ((p.autoPO || p.po) ? '[' + esc(p.autoPO || p.po) + '] ' : '') + esc(p.name || p.address || p.id) + '</option>'; }).join('');
}
function showPick(id, el, after){
  var light = !!(el && el.closest && el.closest('#gck-root'));
  var host = (el && el.closest && (el.closest('td') || el.parentNode)) || null; if (!host) return false;
  var old = host.parentNode && host.parentNode.querySelector('.gc-aip-pick[data-id="' + id.replace(/"/g, '') + '"]');
  if (old) { var os = old.querySelector('select'); if (os) os.focus(); return false; }
  var box = D.createElement('div'); box.className = 'gc-aip-pick'; box.setAttribute('data-id', id);
  box.style.cssText = light ? 'margin-top:6px;display:flex;flex-direction:column;gap:4px;min-width:200px' : 'margin-top:10px;display:flex;flex-direction:column;gap:6px';
  box.innerHTML = '<label style="font-size:11px;color:' + (light ? '#5b6b82' : '#8fa8c4') + '">No job matched — charge this expense to job:</label>'
    + '<select class="gc-aip-sel' + (light ? ' gck-in' : '') + '" style="' + (light ? 'width:100%;font-size:12px' : 'width:100%;padding:9px;border-radius:8px;border:1px solid #2a4a7f;background:#0a1628;color:#fff;font-size:13px') + '">' + jobOptions() + '</select>'
    + '<span style="display:flex;gap:4px">'
    + '<button type="button" class="gc-aip-go' + (light ? ' gck-btn s p' : '') + '" style="' + (light ? '' : 'flex:1;padding:11px;border-radius:10px;border:none;background:#16a34a;color:#fff;font-weight:800;font-size:13px;cursor:pointer') + '">✓ Approve → P&amp;L</button>'
    + '<button type="button" class="gc-aip-no' + (light ? ' gck-btn s' : '') + '" style="' + (light ? '' : 'padding:11px;border-radius:10px;border:1px solid #2a4a7f;background:#13294a;color:#93c5fd;font-weight:700;font-size:13px;cursor:pointer') + '">Cancel</button></span>';
  if (host.tagName === 'TD') host.appendChild(box); else host.parentNode.insertBefore(box, host.nextSibling);
  box.addEventListener('click', function(ev){
    var b = ev.target && ev.target.closest && ev.target.closest('button'); ev.stopPropagation(); if (!b) return;
    if (b.classList.contains('gc-aip-no')) { box.remove(); return; }
    if (b.classList.contains('gc-aip-go')) { var v = box.querySelector('select').value; box.remove(); approveNow(id, v, true, after); }
  });
  try { box.querySelector('select').focus(); } catch (e) {}
  return false;
}
/* the one entry: To Match's row button and the details' button */
W._gcExpApproveHere = function(id, el, after){
  id = s(id); if (!id) return false;
  if (needsJob(id)) return showPick(id, el, after);
  return approveNow(id, '', false, after);
};
W._gcApprInPlace = { state: function(){ return { approved: done.slice(-20) }; }, decided: W._gcExpDecided, approve: W._gcExpApproveHere, settle: settle };
try { console.log('[GC] Approve expenses in place (patch APPRINPLACE): _gcApprInPlace.state()'); } catch (e) {}
})();
</script>
"""

# 1. To Match: "Approve..." approves this row in place (the old way, opening Expenses to Approve, only without an id)
src = once(src, """data-act="expok">Approve…</button>""", """data-act="expok:'+esc(x.id)+'">Approve…</button>""")
src = once(src, "    case 'expok': try{ if(window._gcOpenExpenseApprovals) return window._gcOpenExpenseApprovals(); }catch(e){} return;",
                "    case 'expok': try{ if(v && window._gcExpApproveHere) return window._gcExpApproveHere(v, el); if(window._gcOpenExpenseApprovals) return window._gcOpenExpenseApprovals(); }catch(e){} return;   /* patch APPRINPLACE */")
src = once(src, "window._gcAcctCsv = function(t){ var f=CSV[t||tab()]; return f ? csvText(f()) : ''; };",
                "window._gcAcctCsv = function(t){ var f=CSV[t||tab()]; return f ? csvText(f()) : ''; };\nwindow._gcAcctRedraw = function(){ try{ if(V.root && document.contains(V.root)) render(); }catch(e){} };   /* patch APPRINPLACE */")
# 2. To Match: an expense already decided (or deleted) is not waiting for approval
src = once(src, "    if(RULES.tomb('expenses', e.id)) return;\n",
                "    if(RULES.tomb('expenses', e.id)) return;\n    if(window._gcExpDecided && window._gcExpDecided(e.id, e)) return;   /* patch APPRINPLACE */\n")
# 3. Expense Details: Approve -> P&L approves in place; it only reopens Expenses to Approve when it was opened from there
src = once(src, "document.getElementById('_edApprove').onclick=function(){ if(window._gcApproveExpense)",
                "document.getElementById('_edApprove').onclick=function(){ if(window._gcExpApproveHere){ window._gcExpApproveHere(expId, this, function(){ ov.remove(); var eov=document.querySelector('._gcSheetOv'); if(eov){ eov.remove(); if(window._gcOpenExpenseApprovals) window._gcOpenExpenseApprovals(); } }); return; }   /* patch APPRINPLACE */ if(window._gcApproveExpense)")
src = once(src, "if(window._gcRejectExpense) window._gcRejectExpense(expId, note); ov.remove(); var eov=document.querySelector('._gcSheetOv'); if(eov) eov.remove(); if(window._gcOpenExpenseApprovals) window._gcOpenExpenseApprovals(); };",
                "if(window._gcRejectExpense) window._gcRejectExpense(expId, note); ov.remove(); var eov=document.querySelector('._gcSheetOv'); if(eov){ eov.remove(); if(window._gcOpenExpenseApprovals) window._gcOpenExpenseApprovals(); } try{ if(window._gcAcctRedraw) window._gcAcctRedraw(); }catch(e){} };   /* patch APPRINPLACE */")
# 4. Expenses to Approve, the Approvals tab and the approval counts: decided / deleted expenses drop off
src = once(src, "var q=loadQ(); var admin=isAdmin(); var name=myName();",
                "var q=loadQ().filter(function(a){ return !(a && window._gcExpDecided && window._gcExpDecided(a.expId)); }); var admin=isAdmin(); var name=myName();   /* patch APPRINPLACE */")
src = once(src, "    if (a.status !== 'pending_pm' && a.status !== 'escalated') return false;\n",
                "    if (a.status !== 'pending_pm' && a.status !== 'escalated') return false;\n    if (W._gcExpDecided && W._gcExpDecided(a.expId)) return false;   /* patch APPRINPLACE */\n")
src = once(src, "lsList('gc_expense_approvals').forEach(function(a){ if (!a || a.status !== 'pending_pm' || subCost(a.expId)) return;",
                "lsList('gc_expense_approvals').forEach(function(a){ if (!a || a.status !== 'pending_pm' || subCost(a.expId) || (W._gcExpDecided && W._gcExpDecided(a.expId))) return;   /* patch APPRINPLACE */")
# 5. the script (right after patch APOFFICE, which wraps _gcApproveExpense first)
src = once(src, '<style id="gc-apoffice2-css">', JS + '<style id="gc-apoffice2-css">')

open(P, 'w', encoding='utf-8').write(src)
print('patched')
