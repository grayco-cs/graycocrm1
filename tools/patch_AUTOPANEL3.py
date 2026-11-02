#!/usr/bin/env python3
r"""Idempotent patch AUTOPANEL3 (on top of AUTOPANEL + AUTOPANEL2): the last two page automations that ran with no ⚡ switch.

  1. "CompanyCam % → job %" (cc_pct_sync, default OFF): the accounting timer (every 2 min, first after 15 s) copied the
     progress % read from CompanyCam notes (p.ccProgressPct) into the job % of every active job. OFF: the job % is left
     alone and "held: would have done N" is recorded. ON: as before (a draw then still needs "Progress-slider auto-draw").
  2. "Invoice auto-mark-paid (amount match)" (auto_mark_paid, default OFF): the same timer marked an open client invoice
     PAID (status paid, paidDate today, _autoPaid) when a payment recorded on the same job (projectPayments: a person's
     "record payment" entry, no invoice named on it) had exactly the same amount. That is a guess: the first open invoice
     of that amount wins (two equal draws → the wrong one can be marked), and the payment's link (_linkedInv) is only set
     in memory, never saved, so after a reload — or on another computer — the same payment can mark a SECOND invoice of
     the same amount paid. Marking paid then puts the invoice on the books (_gcPostPaidInvoices). OFF: nothing is marked,
     "held" is recorded; invoices are marked paid by hand.
  3. "AUT3 job stages" says what it now does (a draw because the % moved also needs "Progress-slider auto-draw").
The registry rows are changed the same way in netlify/functions/_lib/automations.js and in the page's word-for-word copy.
Usage: python3 tools/patch_AUTOPANEL3.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
reg_path = os.path.join(os.path.dirname(os.path.abspath(path)), 'netlify', 'functions', '_lib', 'automations.js')
if not os.path.exists(reg_path):
    reg_path = os.path.join(here, '..', 'netlify', 'functions', '_lib', 'automations.js')
MARK = '/* __GC_PATCH_AUTOPANEL3__ */'

def once(s, old, new, what):
    n = s.count(old)
    assert n == 1, ('AUTOPANEL3 anchor count != 1', what, n, old[:160])
    return s.replace(old, new)

G = "(window._gcAutoGate ? window._gcAutoGate"
REG = [
("""  ['progress_autodraw', 'rec', 'C', 0, 0, 'page', 'Progress-slider auto-draw', 'Dragging progress past a draw milestone makes a draw invoice.'],
""",
 """  ['progress_autodraw', 'rec', 'C', 0, 0, 'page', 'Progress-slider auto-draw', 'Dragging progress past a draw milestone makes a draw invoice.'],
  ['cc_pct_sync', 'rec', 'C', 0, 0, 'page', 'CompanyCam % -> job %', 'Every 2 minutes copies the progress % read from CompanyCam notes into the job % of each active job (a draw then still needs "Progress-slider auto-draw"). OFF: the job % is left alone.'],
  ['auto_mark_paid', 'rec', 'C', 0, 0, 'page', 'Invoice auto-mark-paid (amount match)', 'Every 2 minutes marks an open client invoice PAID (and puts it on the books) when a payment recorded on the same job has the same amount. A guess: the payment names no invoice and the match is not saved. OFF: nothing is marked; mark invoices paid by hand.'],
"""),
("""  ['job_stages', 'rec', 'C', 0, 0, 'page', 'AUT3 job stages', 'Kickoff (deposit draft, welcome), milestone / final draws, stage changes, schedule shifts, Certificate of Completion, check-ups.'],""",
 """  ['job_stages', 'rec', 'C', 0, 0, 'page', 'AUT3 job stages', 'Kickoff (deposit draft, welcome), stage changes, schedule shifts and the % from the schedule, the final invoice at Complete, Certificate of Completion, check-ups. A draw because the % moved also needs "Progress-slider auto-draw" ON.'],"""),
]
PAGE = [
# ── 1. CompanyCam % → job % ──
("""      var projs = (window._crm && window._crm.projects) || [];
      projs.forEach(function(p){
        if(!p || p.status!=='active') return;""",
 """      var projs = (window._crm && window._crm.projects) || [];
      """ + MARK + """ /* "CompanyCam % -> job %" (cc_pct_sync, default OFF): OFF → the job % is left alone, "held" */
      var _ccDue = projs.filter(function(p){ return p && p.status==='active' && typeof p.ccProgressPct==='number' && (p.pct||0) < p.ccProgressPct; });
      if(!_ccDue.length) return;
      if(!""" + G + """('cc_pct_sync', { n: _ccDue.length, sample: _ccDue.slice(0,3).map(function(p){ return (p.name||p.id) + ' ' + (p.pct||0) + '% -> ' + p.ccProgressPct + '%'; }) }) : false)) return;
      projs.forEach(function(p){
        if(!p || p.status!=='active') return;"""),
# ── 2. invoice auto-mark-paid ──
("""      if(changed.length && window._setInvoices){""",
 """      /* patch AUTOPANEL3: "Invoice auto-mark-paid (amount match)" (auto_mark_paid, default OFF): a guess → OFF, "held" */
      if(changed.length && !""" + G + """('auto_mark_paid', { n: changed.length, sample: changed.slice(0,3).map(function(c){ return (c.iv.desc||c.iv.id) + ' $' + (parseFloat(c.iv.amt||c.iv.amount)||0); }) }) : false)) return;
      if(changed.length && window._setInvoices){"""),
# ── the panel: both act on what is waiting when switched on ──
("""var STATE = { job_stages: 'draw invoices / stage steps',""",
 """var STATE = { cc_pct_sync: 'job % updates from CompanyCam', auto_mark_paid: 'invoices marked paid', job_stages: 'draw invoices / stage steps',"""),
]

# the registry file (server) — idempotent on its own
reg = open(reg_path, encoding='utf-8').read()
if "['cc_pct_sync'," not in reg:
    for o, n in REG:
        reg = once(reg, o, n, 'automations.js')
    open(reg_path, 'w', encoding='utf-8').write(reg)
    print('AUTOPANEL3: automations.js updated')

src = open(path, encoding='utf-8').read()
if MARK in src:
    print('AUTOPANEL3: already patched'); sys.exit(0)
assert '/* __GC_PATCH_AUTOPANEL2__ */' in src, 'AUTOPANEL3 needs patch AUTOPANEL2 first'
for o, n in REG + PAGE:
    src = once(src, o, n, 'index.html')
b = src.index('/* AUTOREG-BEGIN */\n') + len('/* AUTOREG-BEGIN */\n'); e = src.index('/* AUTOREG-END */')
assert src[b:e] == reg, 'AUTOPANEL3: the page copy of _lib/automations.js is not word for word'
open(path, 'w', encoding='utf-8').write(src)
print('AUTOPANEL3: patched (%d edits)' % len(REG + PAGE))
