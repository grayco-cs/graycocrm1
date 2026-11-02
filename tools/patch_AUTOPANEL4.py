#!/usr/bin/env python3
r"""Idempotent patch AUTOPANEL4 (on top of AUTOPANEL … AUTOPANEL3): the ESTIN background proposal maker and supplier-order
drafter do nothing while their ⚡ switch is OFF.

The ESTIN background run (20 s after load, every 5 minutes, 5 s after any estimate save — it wraps _gcSetEstimates) took up
to 6 estimates per run. It was registered (proposal_maker, default OFF) but the switch was only asked inside process(), per
estimate, AFTER the run had read the lists; and an estimate a person had asked for (estinNow: an upload, "Accept", "Send for
approval now") skipped the switch — so when that PDF failed, the background retried it every 5 minutes (html2canvas over the
whole proposal, a storage upload, a bidding job, a sign request) with the switch OFF. The same run also drafted supplier
purchase orders after a signature, with no switch at all.

  1. scan(): asks "proposal_maker" and the new "supplier_po_drafts" (default OFF) FIRST. Both OFF → no list reads, no PDF, no
     upload, nothing written; "held: would have done N" from the estimates already in memory. One ON → only that part runs.
  2. On demand is unchanged (it never went through scan()): "📨 Send for approval now", "✓ Accept", an upload, the Field
     app's upload, "🚚 Draft supplier orders", and 📤 Send estimate (patch ESTPDF, its own PDF).
  3. The estimate's chip says "Automatic proposals are OFF (⚡ Automations) — 📨 Send for approval now" instead of
     "Proposal comes after 10 quiet minutes" while it is OFF.
  4. Registry: proposal_maker says what it does; supplier_po_drafts added; the panel warns how many are waiting before
     either is switched ON.
pdfBlob() is not touched (patch DESKFRAME changes its holder).
Usage: python3 tools/patch_AUTOPANEL4.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
reg_path = os.path.join(os.path.dirname(os.path.abspath(path)), 'netlify', 'functions', '_lib', 'automations.js')
if not os.path.exists(reg_path):
    reg_path = os.path.join(here, '..', 'netlify', 'functions', '_lib', 'automations.js')
MARK = '/* __GC_PATCH_AUTOPANEL4__ */'

def once(s, old, new, what):
    n = s.count(old)
    assert n == 1, ('AUTOPANEL4 anchor count != 1', what, n, old[:160])
    return s.replace(old, new)

REG = [
("""  ['proposal_maker', 'cust', 'C', 0, 0, 'page', 'Proposal maker', 'Makes the proposal PDF for every finished estimate → ✅ Approvals.'],
""",
 """  ['proposal_maker', 'cust', 'C', 0, 0, 'page', 'Proposal maker', 'In the background (after load, every 5 minutes, after an estimate is saved) makes the GrayCo proposal PDF for each finished estimate, stores it on the job (a bidding job if it has none) and puts ONE "Put proposal in customer portal + send" item on ✅ Approvals. Sends nothing by itself. OFF: nothing runs in the background; "📨 Send for approval now", uploads and 📤 Send estimate still make it.'],
  ['supplier_po_drafts', 'rec', 'C', 0, 0, 'page', 'Supplier order drafts', 'After an estimate or its job is signed, drafts one purchase order per supplier from its material lines and puts each PO e-mail on ✅ Approvals. OFF: nothing in the background; "🚚 Draft supplier orders" still makes them.'],
"""),
]
PAGE = [
("""function scan(){
  if (!signedIn() || D.hidden) return Promise.resolve();
  return loadLists().then(function(){
    var list = estList(), jobs = [];
    list.forEach(function(e){
      if (!e || startedAt(e) < BOOT) return;
      if (e.estin && e.estin.sig === sigOf(e) && e.estin.state && e.estin.state !== 'error' && !(signedEstimate(e) && !e.estinPO)) return;
      if (signedEstimate(e) && !e.estinPO && canRun(e) && !paused()) { jobs.push(function(){ return makePOs(e); }); return; }
      if (eligible(e) === 'ok') jobs.push(function(){ return process(e); });
    });
""",
 """function scan(){
  if (!signedIn() || D.hidden) return Promise.resolve();
  """ + MARK + """ /* the ⚡ switches are asked FIRST: OFF → no list reads, no PDF, no upload, nothing written ("held") */
  var pmOn = !!(W._gcAutoOn && W._gcAutoOn('proposal_maker')), poOn = !!(W._gcAutoOn && W._gcAutoOn('supplier_po_drafts'));
  function pick(list){
    var pm = [], po = [];
    list.forEach(function(e){
      if (!e || startedAt(e) < BOOT) return;
      if (e.estin && e.estin.sig === sigOf(e) && e.estin.state && e.estin.state !== 'error' && !(signedEstimate(e) && !e.estinPO)) return;
      if (signedEstimate(e) && !e.estinPO && canRun(e) && !paused()) { po.push(e); return; }
      if (eligible(e) === 'ok') pm.push(e);
    });
    return { pm: pm, po: po };
  }
  function hold(w){
    var nm = function(e){ return s(e.name || e.id); };
    if (!pmOn && w.pm.length && W._gcAutoGate) W._gcAutoGate('proposal_maker', { n: w.pm.length, sample: w.pm.slice(0, 3).map(nm) });
    if (!poOn && w.po.length && W._gcAutoGate) W._gcAutoGate('supplier_po_drafts', { n: w.po.length, sample: w.po.slice(0, 3).map(nm) });
  }
  if (!pmOn && !poOn) { try { hold(pick(estList())); } catch (x) {} return Promise.resolve(); }
  return loadLists().then(function(){
    var w = pick(estList()), jobs = [];
    hold(w);
    if (poOn) w.po.forEach(function(e){ jobs.push(function(){ return makePOs(e); }); });
    if (pmOn) w.pm.forEach(function(e){ jobs.push(function(){ return process(e); }); });
"""),
("""  var why = eligible(e); return ['', why === 'ok' ? 'Proposal comes after 10 quiet minutes' : why];""",
 """  var why = eligible(e); return ['', why === 'ok' ? (W._gcAutoOn && W._gcAutoOn('proposal_maker') ? 'Proposal comes after 10 quiet minutes' : 'Automatic proposals are OFF (⚡ Automations) — 📨 Send for approval now') : why];   /* patch AUTOPANEL4 */"""),
("""var STATE = { cc_pct_sync: 'job % updates from CompanyCam',""",
 """var STATE = { proposal_maker: 'estimates (proposal PDFs)', supplier_po_drafts: 'signed estimates (supplier orders)', cc_pct_sync: 'job % updates from CompanyCam',"""),
]

reg = open(reg_path, encoding='utf-8').read()
if "['supplier_po_drafts'," not in reg:
    for o, n in REG:
        reg = once(reg, o, n, 'automations.js')
    open(reg_path, 'w', encoding='utf-8').write(reg)
    print('AUTOPANEL4: automations.js updated')

src = open(path, encoding='utf-8').read()
if MARK in src:
    print('AUTOPANEL4: already patched'); sys.exit(0)
assert '/* __GC_PATCH_AUTOPANEL3__ */' in src, 'AUTOPANEL4 needs patch AUTOPANEL3 first'
for o, n in REG + PAGE:
    src = once(src, o, n, 'index.html')
b = src.index('/* AUTOREG-BEGIN */\n') + len('/* AUTOREG-BEGIN */\n'); e = src.index('/* AUTOREG-END */')
assert src[b:e] == reg, 'AUTOPANEL4: the page copy of _lib/automations.js is not word for word'
open(path, 'w', encoding='utf-8').write(src)
print('AUTOPANEL4: patched (%d edits)' % len(REG + PAGE))
