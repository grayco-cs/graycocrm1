#!/usr/bin/env python3
"""Idempotent patch APOFFICE2 (owner 10/28, on top of patch APOFFICE): "FOR OFFICE MAKE SURE TO HAVE PM APPROVALS AS A BUTTON
so pms approvals that they are supposed to approve anyway dont cloud up her approvals, those approvals are optional approvals
for office, i want her more important approvals first".

For the OFFICE (office profile / Office Admin, office@): what waits on a PM — customer sends at the PM step, sub invoices and
job expenses the PM approves (until they reach the office after 24 h / with no PM, as before), field material requests —
is NOT in her main lists any more (To-Do cards, the main 📋 Approvals list, the APPROVE badge / "N waiting on you" count).
Her own approvals come first; a separate button "👷 PM approvals (N)" on 📋 Approvals (and a one-line link on the To-Do pin)
opens the PM-step items she MAY approve (Approve / Deny / Edit / Note as before; first action wins). PMs and admins see what
they saw before. Needs patch APOFFICE first. Usage: python3 tools/patch_APOFFICE2.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch APOFFICE2'
if MARK in src:
    print('APOFFICE2: already patched'); sys.exit(0)
assert '/* patch APOFFICE' in src, 'APOFFICE2 needs patch APOFFICE first'
def rep(old, new, n=1):
    global src
    c = src.count(old)
    assert c == n, ('APOFFICE2 find-string count', c, '!=', n, old[:100])
    src = src.replace(old, new)

# 1. patch APPR: a PM step is not "waiting on" the office (she may still act on it: canAct / visible stay)
rep("""  return x.step === 'pm' && (pmIsMe(x) || officeMe());
}""", """  return x.step === 'pm' && pmIsMe(x);   """ + MARK + """: the office's PM-step items are optional — behind "👷 PM approvals", not in her list */
}""")

# 2. patch AP4's wrapper: the office's list = what the admins left for 24 h (again); the PM steps are kept apart (r.pmOptional)
rep("""        var add = (r.all || []).filter(function(x){ return (due(x) || (x && x.status === 'waiting' && x.step === 'pm')) && !have[x.id]; });   /* patch APOFFICE: the PM step is the office's at once */""",
"""        var add = (r.all || []).filter(function(x){ return due(x) && !have[x.id]; });
        r.pmOptional = (r.all || []).filter(function(x){ return x && x.status === 'waiting' && x.step === 'pm' && !have[x.id]; });   """ + MARK + """: optional for the office, behind "👷 PM approvals" */""")
rep("""   * PM-step items are never escalated — the office has them at once anyway (patch APOFFICE).""",
"""   * PM-step items are never escalated — the office may take them at once from "👷 PM approvals" (patch APOFFICE / APOFFICE2).""")

# 3. patch SUBINV: job costs reach the office's OWN list after 24 h / with no PM (as before APOFFICE); sooner = optional
rep("""/* ── JOB-COST APPROVAL ROUTING: the PM and the office at once (patch APOFFICE; was: office after 24 h) (an admin only as the job's PM) ── */""",
"""/* ── JOB-COST APPROVAL ROUTING: PM → office after 24 h (or no PM) (an admin only as the job's PM); before that the office may take them from "👷 PM approvals" (patch APOFFICE2) ── */""")
rep("""    return mine || off;   /* patch APOFFICE: "anything a PM can approve, the office can approve too" */""",
"""    return mine || (off && (!pm || now - since(a.createdAt) >= DAY));   """ + MARK + """: sooner = optional, behind "👷 PM approvals" */""")
rep("""    return mine || off;   /* patch APOFFICE */""",
"""    return mine || (off && (!pm || a.status === 'escalated' || now - since(a.enteredAt) >= DAY));   """ + MARK + """ */""")
rep("""job-cost approvals: PM and office at once (patch SUBINV, APOFFICE)');""",
"""job-cost approvals: PM → office after 24 h; sooner from 👷 PM approvals (patch SUBINV, APOFFICE2)');""")

# 4. field material requests: not in the office's own list (the 📋 Approvals "👷 PM approvals" button has them)
rep("""  if (/^office/i.test(role()) || low(lsGet('grayco_user')) === 'office@grayco-cs.com') adm = true;   /* patch APOFFICE: the office approves what a PM can */
""", "")

# 5. patch APX: the office's PM-step rows are r.pmOpt — only under the "👷 PM approvals" button
rep("""    var mine = sc.preview ? (sc.kind === 'pm' ? x.step === 'pm' : (escalatedQ(x, now) || (x.status === 'waiting' && x.step === 'pm'))) : false;   /* patch APOFFICE */""",
"""    var mine = sc.preview ? (sc.kind === 'pm' ? x.step === 'pm' : escalatedQ(x, now)) : false;   """ + MARK + """: PM steps are optional for the office */""")
rep("""    approve: x.status === 'waiting' && (mine || realAdmin()) ?""",
"""    approve: x.status === 'waiting' && (mine || realAdmin() || (x.step === 'pm' && isOfficePerson())) ?""")
rep("""  return { scope: sc, rows: denyFilter(out), now: now };""",
"""  if (sc.kind === 'office') pmOptRows(out, add, Q, now);   """ + MARK + """ */
  return { scope: sc, rows: denyFilter(out), now: now };""")
rep("""/* patch DENY: deny = a To-Do for the PM that holds the card back until it is done */""",
"""""" + MARK + """: the office's OPTIONAL approvals — what waits on a PM (she may take it; the PM still can). Never "mine", never in the
   main list or the counts: only under the "👷 PM approvals (N)" button. */
function pmOptRows(out, add, Q, now){
  out.forEach(function(r){
    if (r.mine) return;
    if (r.src === 'queue') { var x = Q.filter(function(y){ return s(y.id) === s(r.id); })[0]; if (x && x.status === 'waiting' && x.step === 'pm') r.pmOpt = true; }
    else if (r.src === 'sub' || r.src === 'exp') r.pmOpt = true;
  });
  var subCost = function(id){ return arr(crm().expenses).some(function(e){ return e && s(e.id) === s(id) && (e._fromSub === true || e.subInvId); }); };
  lsList('gc_expense_approvals').forEach(function(a){ if (!a || a.status !== 'pending_pm' || subCost(a.expId)) return; var r = rowExp(a, false, now); r.pmOpt = true; add(r); });
  projects().forEach(function(p){ if (!p) return; arr(p.materialRequests).forEach(function(m){ if (m && m.status === 'pending_pm' && m.id) add(rowMat(p, m, now)); }); });
}
function rowMat(p, m, now){
  var go = function(){ var F = W._gcField; if (F && F.mat && typeof F.mat.open === 'function') F.mat.open(s(m.id)); else toast('Open it from the job.'); };
  return { key: 'mat:' + s(m.id), id: s(m.id), src: 'mat', kind: 'material', kindL: 'Materials', icon: '📦', title: 'Materials: ' + s(m.item) + (m.qty ? ' × ' + s(m.qty) : ''),
    pid: s(p.id), job: jobLine(p, ''), pm: s(p.pm), step: 'pm', waits: 'PM ' + (s(p.pm) ? s(p.pm) + ' ' : '') + 'or the office', since: Date.parse(m.at || 0) || now, clock: '', amount: 0,
    mine: false, escalated: false, chain: m.by ? 'asked by ' + s(m.by) : '', pmOpt: true,
    approve: { l: '✅ Approve / don\\'t…', f: go }, open: { l: 'Open', f: go }, edit: null, doc: null };
}
function pmOptN(rows){ return arr(rows).filter(function(r){ return r.pmOpt; }).length; }
/* patch DENY: deny = a To-Do for the PM that holds the card back until it is done */""")
rep("""  if (r.approve && r.src !== 'pay' && denyTo(r) !== null) h += b('deny'""",
"""  if (r.approve && r.src !== 'pay' && r.src !== 'mat' && denyTo(r) !== null) h += b('deny'""")
rep("""  c.push(['all', 'All', rows.length]);""",
"""  var po = pmOptN(rows);   """ + MARK + """ */
  c.push(['all', 'All', rows.length - po]);
  if (sc.kind === 'office') c.push(['pmopt', '👷 PM approvals — optional', po]);""")
rep("""    if (f === 'office' && !r.escalated) return false;""",
"""    if (f === 'office' && !r.escalated) return false;
    if ((f === 'pmopt') !== !!r.pmOpt) return false;   """ + MARK + """: the PM steps only under their button */""")
rep("""  h += '<div class="apx-chips">' + chips.map(function(c){ return '<button type="button" class="apx-chip' + (UI.f === c[0] ? ' on' : '') + (c[2] ? '' : ' zero') + '" data-apx-f="' + c[0] + '">""",
"""  if (UI.f === 'pmopt') h += '<div class="apx-pv" data-apx-pmopt-note="1">👷 <b>PM approvals — optional for you.</b> These wait on the job’s PM; you may approve, deny, edit or note any of them, and whoever acts first wins. Your own approvals: <button type="button" class="apx-lnk" data-apx-f="">Waiting on me ›</button></div>';   """ + MARK + """ */
  h += '<div class="apx-chips">' + chips.map(function(c){ return '<button type="button" class="apx-chip' + (c[0] === 'pmopt' ? ' pmopt' : '') + (UI.f === c[0] ? ' on' : '') + (c[2] ? '' : ' zero') + '" data-apx-f="' + c[0] + '">""")
rep("""  if (!n && !mine.length) return { n: 0, h: '<div class="apx-pin-h empty">""",
"""  var poN = sc.kind === 'office' ? pmOptN(B.rows) : 0, poH = poN ? '<div class="apx-pin-n apx-pin-po"><button type="button" class="apx-lnk" data-apx-pmopt="1">👷 PM approvals (' + poN + ') — waiting on PMs, optional for you ›</button></div>' : '';   """ + MARK + """ */
  if (!n && !mine.length) return { n: 0, h: poH + '<div class="apx-pin-h empty">""")
rep("""    + (!withQueue && q > 0 ? '<div class="apx-pin-n">""",
"""    + poH + (!withQueue && q > 0 ? '<div class="apx-pin-n">""")
rep("""  if (t.closest('[data-apx-go]')) { ev.preventDefault(); ev.stopPropagation(); open(''); return; }""",
"""  if (t.closest('[data-apx-pmopt]')) { ev.preventDefault(); ev.stopPropagation(); open('pmopt'); return; }   """ + MARK + """ */
  if (t.closest('[data-apx-go]')) { ev.preventDefault(); ev.stopPropagation(); open(''); return; }""")
rep("""mine: r.mine, escalated: r.escalated, amount: r.amount, approve: !!r.approve, doc: !!r.doc }; }); },""",
"""mine: r.mine, escalated: r.escalated, amount: r.amount, approve: !!r.approve, doc: !!r.doc, pmOpt: !!r.pmOpt }; }); },""")
# the button's look: set apart from the other chips
rep("""<script id="gc-patch-apx">""", """<style id="gc-apoffice2-css">.apx-chip.pmopt{margin-left:auto;border-style:dashed!important}.apx-pin-po{margin:4px 0 6px}</style>
<script id="gc-patch-apx">""")
open(path, 'w', encoding='utf-8').write(src)
print('APOFFICE2: patched', path)
