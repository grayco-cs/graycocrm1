#!/usr/bin/env python3
"""Idempotent patch APOFFICE (owner 10/28): "customer tasks waiting on pm can also go to office immediately for approval
either or can approve" — widened the same day: "anything a pm can approve office can approve too".

Every approval a PM can give now shows to the office (office profile / Office Admin, office@) AT ONCE, next to the PM's,
and either one (or an admin, as before) can Approve / Don't approve / Edit / Note it. First action wins: the server's
claim (portal.js approvalAction) and the "already decided" guards here stop a second send / second post; the other
side's card leaves its list on the next redraw. What needs Wesley or Nick still needs them (the office takes the PM's
step only; a money / legal paper still goes on to the admin step, and that step still goes to the office only after 24 h).
  * customer sends (gc_approval_queue, PM step): the office's "waiting on me" list (APPR, AP4's wrapper, AP2 cards,
    📋 Approvals tab); the card says who it waits on: "Needs PM Steven or the office".
  * job costs (gc_sub_approvals sub invoices, gc_expense_approvals job expenses): to the office at once (was after 24 h).
  * field material requests (pending_pm): the office too.
  * guards: a sub invoice / expense / material request someone already decided is not decided again on this computer.
The server half: netlify/functions/portal.js (approvalAction: the office may take the PM step) and _lib/auto-digest.js.
Usage: python3 tools/patch_APOFFICE.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch APOFFICE'
if MARK in src:
    print('APOFFICE: already patched'); sys.exit(0)
R = []
def rep(old, new, n=1):
    global src
    c = src.count(old)
    assert c == n, ('APOFFICE find-string count', c, '!=', n, old[:90])
    src = src.replace(old, new)

# 1. patch APPR (the base list): the office's "waiting on me", who may act, who may see
rep("""function waitingOnMe(x){
  if(x.status !== 'waiting') return false;
  if(isAdmin()) return x.step === 'admin' || pmIsMe(x);
  return x.step === 'pm' && pmIsMe(x);
}
function canAct(x){ return x.status === 'waiting' && (isAdmin() || (x.step === 'pm' && pmIsMe(x))); }
function visible(x){ return isAdmin() || pmIsMe(x); }""",
"""function officeMe(){ if(isAdmin()) return false; var u = myUser(); return myEmail() === 'office@grayco-cs.com' || !!(u && u.active !== false && /office/i.test(s(u.role))); }   """ + MARK + """: the office takes any PM step too */
window._gcApOfficeMe = officeMe;
function waitingOnMe(x){
  if(x.status !== 'waiting') return false;
  if(isAdmin()) return x.step === 'admin' || pmIsMe(x);
  return x.step === 'pm' && (pmIsMe(x) || officeMe());
}
function canAct(x){ return x.status === 'waiting' && (isAdmin() || (x.step === 'pm' && (pmIsMe(x) || officeMe()))); }
function visible(x){ return isAdmin() || pmIsMe(x) || officeMe(); }""")
rep("""  var who = x.step === 'admin' ? 'Admin (Wesley or Nick)' : 'PM — ' + esc(x.pm || '?');""",
"""  var who = x.step === 'admin' ? 'Admin (Wesley or Nick)' : 'PM ' + esc(x.pm || '?') + ' or the office';   """ + MARK + """ */""")

# 2. patch AP4's wrapper: the office's list = escalated admin items + every PM-step item
rep("""   * PM-step items are never escalated.
   * The CRM notices""", """   * PM-step items are never escalated — the office has them at once anyway (patch APOFFICE).
   * The CRM notices""")
rep("""        var add = (r.all || []).filter(function(x){ return due(x) && !have[x.id]; });""",
"""        var add = (r.all || []).filter(function(x){ return (due(x) || (x && x.status === 'waiting' && x.step === 'pm')) && !have[x.id]; });   """ + MARK + """: the PM step is the office's at once */""")

# 3. patch AP2's card: who it waits on
rep("""  var who = x.step === 'admin' ? 'Needs an admin (Wesley or Nick)' : 'Needs the PM' + (x.pm ? ' — ' + esc(x.pm) : '');""",
"""  var who = x.step === 'admin' ? 'Needs an admin (Wesley or Nick)' : 'Needs PM ' + (x.pm ? esc(x.pm) + ' ' : '') + 'or the office';   """ + MARK + """ */""")

# 4. patch APX (📋 Approvals tab)
rep("""     The office sees what is escalated to it plus the office items: Waiting on me · Escalated · All.""",
"""     The office sees what is escalated to it, every PM step (patch APOFFICE) and the office items: Waiting on me · Escalated · All.""")
rep("""  var waits = step === 'sending' ? 'Sending now…' : step === 'pm' ? 'PM — ' + (s(x.pm) || 'no PM') :""",
"""  var waits = step === 'sending' ? 'Sending now…' : step === 'pm' ? 'PM ' + (s(x.pm) ? s(x.pm) + ' ' : '') + 'or the office' :   """ + MARK + """ */""")
rep("""    pid: s(a.pid), job: jobLine(p, a.jobName), pm: s(a.pmName) || s(p && p.pm), step: 'pm', waits: 'PM — ' + (s(a.pmName) || s(p && p.pm) || 'no PM'),""",
"""    pid: s(a.pid), job: jobLine(p, a.jobName), pm: s(a.pmName) || s(p && p.pm), step: 'pm', waits: 'PM ' + ((s(a.pmName) || s(p && p.pm)) ? (s(a.pmName) || s(p && p.pm)) + ' ' : '') + 'or the office',   """ + MARK + """ */""")
rep("""pid: pid, job: jobLine(p, ''), pm: s(a.pm) || s(p && p.pm), step: a.status === 'escalated' ? 'office' : 'pm', waits: a.status === 'escalated' ? 'Escalated — needs attention' : 'PM — ' + (s(a.pm) || 'no PM'),""",
"""pid: pid, job: jobLine(p, ''), pm: s(a.pm) || s(p && p.pm), step: a.status === 'escalated' ? 'office' : 'pm', waits: a.status === 'escalated' ? 'Escalated — needs attention' : 'PM ' + (s(a.pm) ? s(a.pm) + ' ' : '') + 'or the office',   """ + MARK + """ */""")
rep("""    var vis = sc.kind === 'admin' ? true : sc.kind === 'office' ? (escalatedQ(x, now) || x.status === 'sending') :""",
"""    var vis = sc.kind === 'admin' ? true : sc.kind === 'office' ? (escalatedQ(x, now) || x.status === 'sending' || x.step === 'pm') :   """ + MARK + """ */""")
rep("""    var mine = sc.preview ? (sc.kind === 'pm' ? x.step === 'pm' : escalatedQ(x, now)) : false;""",
"""    var mine = sc.preview ? (sc.kind === 'pm' ? x.step === 'pm' : (escalatedQ(x, now) || (x.status === 'waiting' && x.step === 'pm'))) : false;   """ + MARK + """ */""")

# 5. patch SUBINV's job-cost routing: the office at once (was after 24 h)
rep("""/* ── JOB-COST APPROVAL ROUTING: PM → office after 24 h (or no PM) (an admin only as the job's PM) ── */""",
"""/* ── JOB-COST APPROVAL ROUTING: the PM and the office at once (patch APOFFICE; was: office after 24 h) (an admin only as the job's PM) ── */""")
rep("""    return mine || (off && (!pm || now - since(a.createdAt) >= DAY));""",
"""    return mine || off;   """ + MARK + """: "anything a PM can approve, the office can approve too" */""")
rep("""    return mine || (off && (!pm || a.status === 'escalated' || now - since(a.enteredAt) >= DAY));""",
"""    return mine || off;   """ + MARK + """ */""")
rep("""job-cost approvals: PM → office after 24 h (patch SUBINV)');""", """job-cost approvals: PM and office at once (patch SUBINV, APOFFICE)');""")

# 6. field material requests: the office too; a request someone already decided is not decided again
rep("""  arr(C().projects).forEach(function(p){ if (!p) return; arr(p.materialRequests).forEach(function(m){ if (m && m.status === 'pending_pm' && (adm || low(p.pm) === n || low(p.apm) === n)) out.push({ p: p, m: m }); }); });""",
"""  if (/^office/i.test(role()) || low(lsGet('grayco_user')) === 'office@grayco-cs.com') adm = true;   """ + MARK + """: the office approves what a PM can */
  arr(C().projects).forEach(function(p){ if (!p) return; arr(p.materialRequests).forEach(function(m){ if (m && m.status === 'pending_pm' && (adm || low(p.pm) === n || low(p.apm) === n)) out.push({ p: p, m: m }); }); });""")
rep("""  o.querySelector('[data-ok]').onclick = function(){
    this.disabled = true;
    set('approved')""", """  function decided(){ var still = false; arr(C().projects).some(function(q){ var x = arr(q && q.materialRequests).filter(function(y){ return y && y.id === mid; })[0]; if (x) { still = x.status === 'pending_pm'; return true; } return false; }); if (still) return false; o.remove(); toast('Already decided by someone else.'); lastSig = ''; render(true); return true; }   """ + MARK + """: first one wins */
  o.querySelector('[data-ok]').onclick = function(){
    if (decided()) return;
    this.disabled = true;
    set('approved')""")
rep("""  o.querySelector('[data-no]').onclick = function(){ this.disabled = true; set('declined')""",
"""  o.querySelector('[data-no]').onclick = function(){ if (decided()) return; this.disabled = true; set('declined')""")

# 7. first one wins on this computer: a sub invoice / job expense already decided is not decided again
GUARD = """<script id="gc-patch-apoffice">
""" + MARK + """ (owner 10/28): "anything a PM can approve, the office can approve too" — the PM and the office see the same
   approvals at once; whoever acts first wins. Here: a sub invoice (gc_sub_approvals) or a job expense (gc_expense_approvals)
   that is already approved / not approved is not decided a second time (no second check draft, no second P&L post).
   Console: _gcApOffice.state() */
(function(){
'use strict';
if (window.__GC_PATCH_APOFFICE__) return; window.__GC_PATCH_APOFFICE__ = true;
var W = window, RI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function ls(k){ try { var v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function toast(m){ try { if (typeof W.showToast === 'function') { W.showToast(m); return; } } catch (e) {} try { var t = document.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.textContent = m; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483600;background:#0f172a;color:#fff;padding:10px 16px;border-radius:10px;font:600 14px Inter,Arial,sans-serif'; document.body.appendChild(t); (W.__GC_NATIVE_SETTIMEOUT__ || setTimeout)(function(){ t.remove(); }, 4000); } catch (e) {} }
var blocked = [];
function subDone(id){ var a = ls('gc_sub_approvals').filter(function(x){ return x && (s(x.invId) === s(id) || s(x.id) === s(id)); })[0]; return a && /^(pm_approved|pm_denied|approved|paid)$/.test(s(a.status)) ? a : null; }
function expDone(id){ var a = ls('gc_expense_approvals').filter(function(x){ return x && s(x.expId) === s(id); })[0]; return a && /^(approved|rejected)$/.test(s(a.status)) ? a : null; }
function wrap(name, done){
  var f = W[name]; if (typeof f !== 'function' || f.__gcApOff) return;
  var w = function(id){
    var d = done(id);
    if (d) { blocked.push({ fn: name, id: s(id), status: s(d.status), at: Date.now() }); toast('Already ' + (/denied|rejected/.test(s(d.status)) ? 'not approved' : 'approved') + ((d.pmDecidedBy || d.decidedBy || d.approvedBy) ? ' by ' + s(d.pmDecidedBy || d.decidedBy || d.approvedBy) : '') + ' — nothing more to do.'); try { if (W.__GC_REFRESH_UI__) W.__GC_REFRESH_UI__(); } catch (e) {} return false; }
    return f.apply(this, arguments);
  };
  try { Object.keys(f).forEach(function(k){ w[k] = f[k]; }); } catch (e) {}
  w.__gcApOff = true; W[name] = w;
}
function tick(){ wrap('_gcPmDecideSub', subDone); wrap('_gcApproveExpense', expDone); wrap('_gcRejectExpense', expDone); }
tick(); RI.call(W, tick, 2000);
W._gcApOffice = { state: function(){ return { blocked: blocked.slice(-20), officeMe: typeof W._gcApOfficeMe === 'function' ? W._gcApOfficeMe() : null }; }, subDone: subDone, expDone: expDone };
})();
</script>
<script id="gc-patch-apx">"""
rep("""<script id="gc-patch-apx">""", GUARD)

open(path, 'w', encoding='utf-8').write(src)
print('APOFFICE: patched', path)
