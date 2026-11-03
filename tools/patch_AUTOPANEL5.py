#!/usr/bin/env python3
r"""Idempotent patch AUTOPANEL5 (on top of AUTOPANEL … AUTOPANEL4): JOBFILL's automatic "put an expense on the job whose PO
is in its memo" gets a ⚡ switch (default OFF), and a link (by hand, or by the switch when ON) sticks.

JOBFILL autofill() (patch JOBFILL 10/23) ran every 5 s while the CRM loaded, then every 60 s, on every computer whose role
matches /admin|owner/ (so "Office Admin" too): an expense on no job (not overhead) whose text (memo, description, vendor,
ref …) carries exactly ONE job's PO was put on that job (up to 12 tries per expense). It had no switch.

  1. Registry: "expense_job_autofill" — "Put card charges on a job by PO in the memo", record change, page, default OFF
     (netlify/functions/_lib/automations.js and the page's word-for-word copy).
  2. autofill(): the expenses it would move are collected first; OFF → nothing moves, "held: would have done N" with
     examples (vendor, amount → PO); ON → linked as before. The estimate-PDF filing in the same function is not changed.
     The panel warns how many are waiting before it is switched ON.
  3. By hand still works: the job's 💸 Expenses tab lists the expense under "🔗 Unmatched expenses" (a PO in the memo
     scores 60 — always suggested) and an admin's Link calls the same link(); the tab's help line says which applies.
  4. link() went through the CRM's own setter (screen → disk → the sync's union upload), but it did not change the
     record's save stamp. Every list merge (_gcUnionMerge) keeps the copy with the newer updatedAt and, on a tie, the
     INCOMING copy — so the next upload of the expense list from a computer that still had the unlinked copy (same
     stamp) put the expense back on no job, and the autofill linked it again (flapping, up to 12 times). link() now
     stamps updatedAt with the link, so the linked copy is the newer one everywhere.
Usage: python3 tools/patch_AUTOPANEL5.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
reg_path = os.path.join(os.path.dirname(os.path.abspath(path)), 'netlify', 'functions', '_lib', 'automations.js')
if not os.path.exists(reg_path):
    reg_path = os.path.join(here, '..', 'netlify', 'functions', '_lib', 'automations.js')
MARK = '/* __GC_PATCH_AUTOPANEL5__ */'

def once(s, old, new, what):
    n = s.count(old)
    assert n == 1, ('AUTOPANEL5 anchor count != 1', what, n, old[:160])
    return s.replace(old, new)

REG = [
("""  ['supplier_po_drafts', 'rec', 'C', 0, 0, 'page',""",
 """  ['expense_job_autofill', 'rec', 'C', 0, 0, 'page', 'Put card charges on a job by PO in the memo', 'Every minute (every 5 s while the CRM loads) an expense on no job whose memo carries exactly one job\\'s PO is put on that job. OFF: nothing moves; the job\\'s Expenses tab lists it under "🔗 Unmatched expenses" to link with one tap.'],
  ['supplier_po_drafts', 'rec', 'C', 0, 0, 'page',"""),
]
PAGE = [
# ── link(): the linked copy is the newer one ──
("""  var f = { pid: pid, jobLinkedAt: new Date().toISOString(), jobLinkedBy: s(me().name), jobLinkedHow: how || 'manual' };""",
 """  """ + MARK + """ /* the link stamps updatedAt: every list merge keeps the newer copy (a tie keeps the INCOMING one), so an
     unlinked copy from another computer can no longer undo it */
  var _at = new Date().toISOString();
  var f = { pid: pid, jobLinkedAt: _at, jobLinkedBy: s(me().name), jobLinkedHow: how || 'manual', updatedAt: _at };"""),
# ── autofill(): the expense part asks the switch ──
("""  /* an unlinked expense whose memo carries exactly ONE job's PO → that job */
  expenses().forEach(function(x){
    if (s(x.pid) || x.overhead || (FILLED['e' + x.id] || 0) >= 12) return;
    var hits = posIn(textOf(x)); if (hits.length !== 1) return;
    FILLED['e' + x.id] = (FILLED['e' + x.id] || 0) + 1;
    if (link('expenses', x.id, hits[0].id, 'auto: PO ' + poOf(hits[0]))) n++;
  });
  return n;
}""",
 """  /* an unlinked expense whose memo carries exactly ONE job's PO → that job — patch AUTOPANEL5: only while ⚡ "Put card
     charges on a job by PO in the memo" (expense_job_autofill) is ON; OFF → "held", it waits in 🔗 Unmatched expenses */
  var dueE = [];
  expenses().forEach(function(x){
    if (s(x.pid) || x.overhead || (FILLED['e' + x.id] || 0) >= 12) return;
    var hits = posIn(textOf(x)); if (hits.length !== 1) return;
    dueE.push({ x: x, job: hits[0] });
  });
  if (dueE.length && (W._gcAutoGate ? W._gcAutoGate('expense_job_autofill', { n: dueE.length, sample: dueE.slice(0, 3).map(function(d){
      return (s(d.x.vendor || d.x.payee || d.x.desc || d.x.description) || s(d.x.id)) + ' ' + money(d.x.amt != null ? d.x.amt : d.x.amount) + ' → PO ' + poOf(d.job); }) }) : false)) {
    dueE.forEach(function(d){
      FILLED['e' + d.x.id] = (FILLED['e' + d.x.id] || 0) + 1;
      if (link('expenses', d.x.id, d.job.id, 'auto: PO ' + poOf(d.job))) n++;
    });
  }
  return n;
}"""),
# ── the panel: switching it on acts on what is waiting ──
("""var STATE = { proposal_maker: 'estimates (proposal PDFs)',""",
 """var STATE = { expense_job_autofill: 'expenses to put on jobs', proposal_maker: 'estimates (proposal PDFs)',"""),
# ── the Expenses tab says which applies ──
("""goes on this job by itself. Card charges wait in 🔗 Match to Jobs.'""",
 """' + (W._gcAutoOn && W._gcAutoOn('expense_job_autofill') ? 'goes on this job by itself' : 'is listed below to link (⚡ Automations: putting it on the job by itself is OFF)') + '. Card charges wait in 🔗 Match to Jobs.'"""),
]

reg = open(reg_path, encoding='utf-8').read()
if "['expense_job_autofill'," not in reg:
    for o, n in REG:
        reg = once(reg, o, n, 'automations.js')
    open(reg_path, 'w', encoding='utf-8').write(reg)
    print('AUTOPANEL5: automations.js updated')

src = open(path, encoding='utf-8').read()
if MARK in src:
    print('AUTOPANEL5: already patched'); sys.exit(0)
assert '/* __GC_PATCH_AUTOPANEL4__ */' in src, 'AUTOPANEL5 needs patch AUTOPANEL4 first'
for o, n in REG + PAGE:
    src = once(src, o, n, 'index.html')
b = src.index('/* AUTOREG-BEGIN */\n') + len('/* AUTOREG-BEGIN */\n'); e = src.index('/* AUTOREG-END */')
assert src[b:e] == reg, 'AUTOPANEL5: the page copy of _lib/automations.js is not word for word'
open(path, 'w', encoding='utf-8').write(src)
print('AUTOPANEL5: patched (%d edits)' % len(REG + PAGE))
