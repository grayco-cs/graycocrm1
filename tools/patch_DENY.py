#!/usr/bin/env python3
"""Idempotent patch DENY: every ✅ Approvals card gets "✕ Deny" next to Approve (owner 10/27).

Deny opens a small box "✕ Deny — why? (sent back to <PM>)" with a required reason, and:
  * NOTHING is sent or approved. A customer e-mail / text / portal item is marked "rejected" on the server's queue
    (the existing reject, so the automatic run never sends it); every other kind is simply held back.
  * The item goes back to the job's PM (or whoever made it when there is no PM): a To-Do for them
    "↩ Fix and resend: <item> — <reason> (from <me>)" (gc_office_tasks, assigned to them, the deny kept on it as _deny)
    and an in-app notification (window._gcNotify).
  * While that To-Do is open the card is off Approvals ("sent back"). When the PM ticks it done (fixed), the item is back on
    Approvals with its history ("↩ sent back by X <date>: <reason>"); a customer queue item is put back to "waiting" at its
    first step by the new server op approval/resubmit (netlify/functions/portal.js), keeping every deny in x.denials.
One small write (the To-Do list) per deny. Usage: python3 tools/patch_DENY.py [repo dir]
"""
import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else '.'
if root.endswith('index.html'): root = os.path.dirname(root) or '.'
P_HTML = os.path.join(root, 'index.html'); P_FN = os.path.join(root, 'netlify', 'functions', 'portal.js')
MARK = '/* patch DENY'
def edit(path, pairs, label):
    src = open(path, encoding='utf-8').read()
    if MARK in src:
        print('DENY: ' + label + ' already patched'); return
    for a, b in pairs:
        assert src.count(a) == 1, ('DENY find-string count != 1', label, src.count(a), a[:80])
        src = src.replace(a, b)
    open(path, 'w', encoding='utf-8').write(src); print('DENY: patched ' + label)

HTML = [
("""  h += b('approve', r.approve ? { l: busy[r.id] ? 'Working…' : r.approve.l, f: r.approve.mode ? function(){ inlineApprove(r); } : r.approve.f } : null, 'go');""",
 """  """ + MARK + """: the "why?" box in place of the buttons, and ✕ Deny next to Approve */
  if (r.approve && DENYBOX[r.key]) {
    return '<div class="apx-deny" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;padding:8px;border:1px solid #fca5a5;border-radius:9px;background:#fff5f5">'
      + '<b style="width:100%;font-size:13px;color:#991b1b">✕ Deny — why? (sent back to ' + esc(denyTo(r) || 'the PM') + ')</b>'
      + '<input type="text" data-apx-deny-in="' + esc(r.key) + '" value="' + esc(DREASON[r.key] || '') + '" placeholder="What needs fixing (the PM sees this)" style="flex:1;min-width:220px;padding:7px 9px;border:1px solid #d1d5db;border-radius:7px;font:14px Arial">'
      + b('denygo', { l: '✕ Deny & send back', f: function(){ doDeny(r); } }, 'dn') + b('denyx', { l: 'Cancel', f: function(){ delete DENYBOX[r.key]; fresh(); paintSoon(); } }, 'op')
      + '<span style="width:100%;font-size:12px;color:#6b7280">Nothing is sent to the customer.</span></div>';
  }
  h += b('approve', r.approve ? { l: busy[r.id] ? 'Working…' : r.approve.l, f: r.approve.mode ? function(){ inlineApprove(r); } : r.approve.f } : null, 'go');
  if (r.approve && r.src !== 'pay' && denyTo(r) !== null) h += b('deny', { l: '✕ Deny', f: function(){ DENYBOX[r.key] = 1; fresh(); paintSoon(); later(function(){ var i = D.querySelector('[data-apx-deny-in="' + cssq(r.key) + '"]'); if (i) try { i.focus(); } catch (e) {} }, 300); } }, 'dn');"""),
("""  return { scope: sc, rows: out, now: now };
}
function stub(e, src){""",
 """  return { scope: sc, rows: denyFilter(out), now: now };
}
""" + MARK + """: deny = a To-Do for the PM that holds the card back until it is done */
var DENYBOX = {}, DREASON = {}, DENYC = { at: 0, open: {}, done: {} };
function denyTodos(){
  if (Date.now() - DENYC.at < 1000) return DENYC;
  var open = {}, done = {}, l = []; try { l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); } catch (e) {}
  arr(l).forEach(function(t){ var d = t && t._deny; if (!d || !d.key) return; if (t.done || t.completed) (done[d.key] = done[d.key] || []).push(d); else open[d.key] = d; });
  DENYC = { at: Date.now(), open: open, done: done }; return DENYC;
}
function denyFilter(rows){
  var c = denyTodos();
  return rows.filter(function(r){ return !(r && c.open[r.key.replace(/#\\d+$/, '')]); }).map(function(r){
    var h = c.done[r.key]; if (!h || !h.length) return r;
    var x = Object.assign({}, r); x.chain = (r.chain ? r.chain + ' · ' : '') + h.map(function(d){ return '↩ sent back by ' + s(d.by) + ' ' + when(d.at) + ': “' + s(d.reason).slice(0, 80) + '”, fixed and resubmitted'; }).join(' · ');
    return x;
  });
}
function denyTo(r){
  var p = proj(r.pid); var pm = s(r.pm) || s(p && (p.pm || p.projectManager));
  var raw = null; try { raw = r.src === 'queue' ? queue().filter(function(y){ return s(y.id) === s(r.id); })[0] : null; } catch (e) {}
  return pm || s(raw && (raw.pm || (raw.meta && raw.meta.by))) || s(r.by || r.createdBy) || '';
}
function doDeny(r){
  var inp = D.querySelector('[data-apx-deny-in="' + cssq(r.key) + '"]'), why = s((inp && inp.value) || DREASON[r.key]);
  if (!why) { toast('Write why first — the PM sees it.'); if (inp) try { inp.focus(); } catch (e) {} return; }
  var to = denyTo(r) || 'the office', me = myName() || myEmail(), at = new Date().toISOString(), title = s(r.title).slice(0, 120);
  var d = { key: r.key.replace(/#\\d+$/, ''), src: r.src, id: s(r.id), title: title, pid: s(r.pid), by: me, at: at, reason: why.slice(0, 500), to: to };
  try {
    var ot = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); if (!Array.isArray(ot)) ot = [];
    ot.push({ id: 'DENY' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: '↩ Fix and resend: ' + title + ' — ' + why.slice(0, 160) + ' (from ' + me + ')', note: 'Sent back from Approvals by ' + me + '. Fix it, then tick this done: it goes back on Approvals.', assignee: to === 'the office' ? '' : to, pid: d.pid, addedBy: me, addedAt: at, at: at, done: false, _deny: d });
    localStorage.setItem('gc_office_tasks', JSON.stringify(ot));
    if (typeof W._gcOfficeTasksPush === 'function') W._gcOfficeTasksPush(); else if (typeof W._supaUpsert === 'function') W._supaUpsert('gc_office_tasks', ot);
  } catch (e) { warn(e); toast('Could not save that — try again.'); return; }
  if (r.src === 'queue' && typeof W._gcApprovalAct === 'function') { try { Promise.resolve(W._gcApprovalAct(s(r.id), 'reject', { reason: why.slice(0, 500) })).catch(function(){}); } catch (e) {} }
  try { if (typeof W._gcNotify === 'function' && to !== 'the office') W._gcNotify(to, { kind: 'approval', link: '#todo', title: '↩ Sent back to you: ' + title, body: why + ' — from ' + me }); } catch (e) {}
  delete DENYBOX[r.key]; delete DREASON[r.key]; DENYC.at = 0; fresh(); paintSoon();
  toast('↩ Sent back to ' + to + ' — nothing was sent.');
}
/* a customer queue item whose "fix and resend" To-Do is done goes back to "waiting" (server op resubmit), once */
function denyResubmit(){
  var c = denyTodos(), sent = {}; try { sent = JSON.parse(localStorage.getItem('gc_deny_resub') || '{}') || {}; } catch (e) {}
  Object.keys(c.done).forEach(function(k){ c.done[k].forEach(function(d){
    if (d.src !== 'queue' || sent[d.id + '|' + d.at] || typeof W._gcApprovalAct !== 'function') return;
    if (!(realAdmin() || samePerson(d.to, myName()))) return;
    var x = queue().filter(function(y){ return s(y.id) === d.id; })[0]; if (x && x.status !== 'rejected') { sent[d.id + '|' + d.at] = Date.now(); return; }
    sent[d.id + '|' + d.at] = Date.now(); try { localStorage.setItem('gc_deny_resub', JSON.stringify(sent)); } catch (e) {}
    try { Promise.resolve(W._gcApprovalAct(d.id, 'resubmit', {})).catch(function(){}); } catch (e) {}
  }); });
}
(W.__GC_NATIVE_SETINTERVAL__ || W.setInterval).call(W, function(){ try { denyResubmit(); } catch (e) {} }, 15000);
D.addEventListener('input', function(ev){ var t = ev.target; if (t && t.getAttribute && t.hasAttribute('data-apx-deny-in')) DREASON[t.getAttribute('data-apx-deny-in')] = t.value; }, true);
D.addEventListener('keydown', function(ev){ var t = ev.target; if (ev.key === 'Enter' && t && t.getAttribute && t.hasAttribute('data-apx-deny-in')) { var g = t.parentNode && t.parentNode.querySelector('[data-apx-act$="|denygo"]'); if (g) { ev.preventDefault(); g.click(); } } }, true);
function stub(e, src){"""),
]
FN = [
("""  const stale = it0.status === 'sending' && Date.now() - Date.parse(it0.updatedAt || 0) > 10 * 60e3;""",
 """  """ + MARK + """: a sent-back (rejected) item, fixed by the PM, goes back to "waiting" at its first step; every deny is kept */
  if (op === 'resubmit') {
    if (it0.status !== 'rejected') return { status: 200, out: { ok: true, unchanged: true, item: it0 } };
    if (!admin && !isPm && !(await isOffice(who))) return { status: 403, out: { ok: false, error: 'Only the job\\'s PM, the office or an admin can resend it.' } };
    const nowR = new Date().toISOString();
    const rr = await kvListUpdate(AQ_KEY, function(l){ const x = l.find(function(y){ return s(y.id) === id; }); if (!x || x.status !== 'rejected') return null;
      x.denials = (Array.isArray(x.denials) ? x.denials : []).concat([{ by: x.rejectedBy, email: x.rejectedEmail, at: x.rejectedAt, reason: x.reason }]).slice(-20);
      x.status = 'waiting'; x.step = (Array.isArray(x.steps) && x.steps[0]) || 'pm'; x.resubmittedAt = nowR; x.resubmittedBy = low(who.email); x.updatedAt = nowR;
      return { list: l, check: function(l2){ const z = l2.find(function(y){ return s(y.id) === id; }); return !!(z && z.resubmittedAt === nowR); }, result: x }; });
    return { status: rr && rr.ok ? 200 : 409, out: { ok: !!(rr && rr.ok), item: rr && rr.result } };
  }
  const stale = it0.status === 'sending' && Date.now() - Date.parse(it0.updatedAt || 0) > 10 * 60e3;"""),
]
edit(P_HTML, HTML, 'index.html')
edit(P_FN, FN, 'portal.js')
