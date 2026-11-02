#!/usr/bin/env python3
r"""Idempotent patch AUTOPANEL: ⚙ Admin → ⚡ Automations (owner 11/02: "make sure nothing is automatic in my CRM until I tell
it to be auto, I have a lot of stuff to add, fix and test this week").

What it does in index.html (the server side is netlify/functions/_lib/automations.js + automations.js and a one-line check in
every scheduled function / webhook):
  1. inlines netlify/functions/_lib/automations.js word for word (window._gcAutoReg) + tools/autopanel_core.js
     (window._gcAutoOn / _gcAutoGate / _gcAutoSince / _gcAutomations) EARLY in the page, before every automation;
  2. tools/autopanel_ui.js: ⚙ Admin → ⚡ Automations and 💎 → ⚡ Automations (admins switch, the office reads);
  3. the one check at the start of every page automation that sends or changes records (default OFF): invoice 1-day
     auto-post, expense 5-day auto-post (both count their days from when they were switched ON — no burst), progress-slider
     auto-draw, the legacy progress-billing timer and its AUTO-FLAG notes (+ the other legacy note writers and PO route),
     AUT3 job stages (stage changes, kickoff / draws, schedule shifts, Certificate of Completion, check-ups), auto-100 %,
     closeout autopilot, the commission sweep, e-mailed invoice auto-booking (OFF: it waits in 📥 Needs a job), the
     duplicate sub-invoice / $0-row deletes (OFF: only the 💎 Duplicates review, by hand), Mississippi tax auto-add, the 5 PM
     lead auto-assign, CompanyCam "make new jobs", appointment confirmations, the job-complete thank-you, the proposal maker,
     the old insurance-reminder drafts.
Usage: python3 tools/patch_AUTOPANEL.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
src = open(path, encoding='utf-8').read()
MARK = '/* __GC_PATCH_AUTOPANEL_TOOL__ */'
if MARK in src:
    print('AUTOPANEL: already patched'); sys.exit(0)

def once(s, old, new):
    n = s.count(old)
    assert n == 1, ('AUTOPANEL anchor count != 1', n, old[:160])
    return s.replace(old, new)

reg = open(os.path.join(here, '..', 'netlify', 'functions', '_lib', 'automations.js'), encoding='utf-8').read()
core = open(os.path.join(here, 'autopanel_core.js'), encoding='utf-8').read()
ui = open(os.path.join(here, 'autopanel_ui.js'), encoding='utf-8').read()
assert '</script>' not in reg and '</script>' not in core and '</script>' not in ui
assert '/* AUTOREG-BEGIN */' not in src

G = "(window._gcAutoGate ? window._gcAutoGate"   # the one check (missing core → OFF)
P = "   /* patch AUTOPANEL */"
EDITS = [
# ── 1 + 2. the list, the check, the panel ──
('<script id="gc-patch-schedpick-core">',
 '<script id="gc-patch-autopanel-core">\n' + MARK + '\n/* AUTOREG-BEGIN */\n' + reg + '/* AUTOREG-END */\n' + core + '</script>\n<script id="gc-patch-schedpick-core">'),
('<script src="legal2.js"></script>   <!-- LEGAL2-patch -->',
 '<script id="gc-patch-autopanel">\n' + ui + '</script>\n<script src="legal2.js"></script>   <!-- LEGAL2-patch -->'),
# ── 3. legacy timers ──
("""  if (!crm || !crm.invoices || !crm.projects) return;
  var changed = false;
  crm.invoices.forEach(function(inv) {
    if (inv.pid || !inv.po) return; // already matched or no PO""",
 """  if (!crm || !crm.invoices || !crm.projects) return;
  if (!""" + G + """('legacy_po_route', function(){ return crm.invoices.filter(function(i){ return i && !i.pid && i.po; }).length; }) : false)) return;""" + P + """
  var changed = false;
  crm.invoices.forEach(function(inv) {
    if (inv.pid || !inv.po) return; // already matched or no PO"""),
("""  var now = new Date();
  crm.projects.forEach(function(p) {
    if (p.status !== "active" && p.status !== "approved") return;
    if (!p.pm) return;""",
 """  var now = new Date();
  if (!""" + G + """('legacy_autoflag_notes', function(){ return crm.projects.filter(function(p){ return p && (p.status === "active" || p.status === "approved") && p.pm && !p._pmFlagged; }).length; }) : false)) return;""" + P + """
  crm.projects.forEach(function(p) {
    if (p.status !== "active" && p.status !== "approved") return;
    if (!p.pm) return;"""),
("""    if (p.status !== "active" || p._autoCompleteSuggested) return;""",
 """    if (p.status !== "active" || p._autoCompleteSuggested) return;
    if (!(window._gcAutoOn && window._gcAutoOn('legacy_autoflag_notes'))) return;""" + P),
("""  var flagged = JSON.parse(localStorage.getItem("_overdueFlags") || "{}");""",
 """  if (!(window._gcAutoOn && window._gcAutoOn('legacy_autoflag_notes'))) return;""" + P + """
  var flagged = JSON.parse(localStorage.getItem("_overdueFlags") || "{}");"""),
("""    if (p._autoAssignChecked) return;""",
 """    if (p._autoAssignChecked) return;
    if (!(window._gcAutoOn && window._gcAutoOn('legacy_autoflag_notes'))) return;""" + P),
("""  if (!crm || !crm.subs) return;
  var now = new Date();
  crm.subs.forEach(function(s) {
    if (!s.email || !s.isSub) return;""",
 """  if (!crm || !crm.subs) return;
  if (!(window._gcAutoOn && window._gcAutoOn('coi_requests'))) return;""" + P + """
  var now = new Date();
  crm.subs.forEach(function(s) {
    if (!s.email || !s.isSub) return;"""),
("""  var drawFlags = JSON.parse(localStorage.getItem("_drawFlags") || "{}");""",
 """  if (!""" + G + """('legacy_progress_billing', function(){ return crm.projects.filter(function(p){ return p && p.status === "active" && p.contract; }).length; }) : false)) return;""" + P + """
  var drawFlags = JSON.parse(localStorage.getItem("_drawFlags") || "{}");"""),
("""      p.customerNotes = (p.customerNotes || "") + "\\n[$] AUTO-FLAG " + now.toLocaleDateString() +""",
 """      if (window._gcAutoOn && window._gcAutoOn('legacy_autoflag_notes'))""" + P + """
      p.customerNotes = (p.customerNotes || "") + "\\n[$] AUTO-FLAG " + now.toLocaleDateString() +"""),
# ── invoice 1-day auto-post ──
("""    var q=[]; try{ q=JSON.parse(localStorage.getItem('gc_invoice_approvals')||'[]'); }catch(e){ return; }
    var now=Date.now(); var changed=false;
    q.forEach(function(a){
      if(a.status==='pending' && (now - a.createdAt) >= DAY_MS){""",
 """    var q=[]; try{ q=JSON.parse(localStorage.getItem('gc_invoice_approvals')||'[]'); }catch(e){ return; }
    var now=Date.now(); var changed=false;
    /* patch AUTOPANEL: "Invoice 1-day auto-post" (default OFF). ON: the day counts from when it was switched on — no burst */
    var _apSince = window._gcAutoSince ? window._gcAutoSince('invoice_autopost') : 0;
    if(!""" + G + """('invoice_autopost', function(){ var invs=(window._crm&&window._crm.invoices)||[]; var due=q.filter(function(a){ if(a.status!=='pending'||(now-a.createdAt)<DAY_MS) return false; var iv=invs.find(function(x){return x&&x.id===a.invId;}); return !!iv&&(iv.status==='draft'||iv.status==='pm_review'||iv.status==='pending'); }); return { n: due.length, sample: due.slice(0,3).map(function(a){ return a.desc||a.invId; }) }; }) : false)) return;
    q.forEach(function(a){
      if(a.status==='pending' && (now - Math.max(+a.createdAt||0, _apSince)) >= DAY_MS){"""),
# ── expense 5-day auto-post ──
("""    var q=loadQ(); var now=Date.now(); var changed=false;
    q.forEach(function(a){
      if(a.status!=='pending_pm') return;
      var ageDays=(now - new Date(a.enteredAt).getTime())/(1000*60*60*24);""",
 """    var q=loadQ(); var now=Date.now(); var changed=false;
    /* patch AUTOPANEL: "Expense 5-day auto-post" (default OFF). ON: the 5 days count from when it was switched on — no burst */
    var _exSince = window._gcAutoSince ? window._gcAutoSince('expense_autopost') : 0;
    if(!""" + G + """('expense_autopost', function(){ var due=q.filter(function(a){ return a.status==='pending_pm' && (now-new Date(a.enteredAt).getTime())/864e5>=5; }); return { n: due.length, sample: due.slice(0,3).map(function(a){ return a.payee||a.desc||a.expId; }) }; }) : false)) return;
    q.forEach(function(a){
      if(a.status!=='pending_pm') return;
      var ageDays=(now - Math.max(new Date(a.enteredAt).getTime()||0, _exSince))/(1000*60*60*24);"""),
# ── progress-slider auto-draw ──
("""  if(!due.length) return;
  if(!parseFloat(proj.contract)){
    alert((proj.name||'This job') + ' reached ' + pct + '%, but it has no contract amount, so no invoice was created.');""",
 """  if(!due.length) return;
  if(!""" + G + """('progress_autodraw', due.length, [proj.name||pid]) : false)) return;   /* patch AUTOPANEL: the % is saved; no draw invoice while it is OFF */
  if(!parseFloat(proj.contract)){
    alert((proj.name||'This job') + ' reached ' + pct + '%, but it has no contract amount, so no invoice was created.');"""),
# ── AUT3 job stages ──
("""function stageTick(){
  if (D.hidden || W.__GC_IS_TYPING__) return;""",
 """function stageTick(){
  if (D.hidden || W.__GC_IS_TYPING__) return;
  if (!""" + G + """('job_stages') : false)) return;   /* patch AUTOPANEL: stages, schedule shifts, inspections, SLA to-dos, progress */"""),
("""function ensureDraws(pid){
  var p = A.proj(pid);""",
 """function ensureDraws(pid){
  if (!""" + G + """('job_stages', 1, [s(pid)]) : false)) return null;""" + P + """
  var p = A.proj(pid);"""),
("""  var p = A.proj(pid); if (!p || running[pid]) return;
  var d = derive(p); if (!d) return;""",
 """  if (!""" + G + """('job_stages') : false)) return;""" + P + """
  var p = A.proj(pid); if (!p || running[pid]) return;
  var d = derive(p); if (!d) return;"""),
("""function closeoutWarranty(pid){
  var p = A.proj(pid);""",
 """function closeoutWarranty(pid){
  if (!""" + G + """('job_stages', 1, [s(pid)]) : false)) return Promise.resolve(null);   /* patch AUTOPANEL: the Certificate / warranty papers */
  var p = A.proj(pid);"""),
("""function checkupTick(){
  var t = today();
  A.projects().forEach(function(p){""",
 """function checkupTick(){
  if (!""" + G + """('job_stages') : false)) return;""" + P + """
  var t = today();
  A.projects().forEach(function(p){"""),
("""function checkupTick(){
  if (!signedIn()) return 0;""",
 """function checkupTick(){
  if (!signedIn()) return 0;
  if (!""" + G + """('closeout_autopilot') : false)) return 0;   /* patch AUTOPANEL: the 11-month check-up after a closeout */"""),
# ── auto-100 % ──
("""      if(completed || finalSent) toBump.push(job.id);
    });
    if(toBump.length && window._setProjects){""",
 """      if(completed || finalSent) toBump.push(job.id);
    });
    if(toBump.length && !""" + G + """('auto_100', toBump.length, toBump.slice(0,3)) : false)) return;""" + P + """
    if(toBump.length && window._setProjects){"""),
# ── closeout autopilot ──
("""function closeout(pid, paid){
  var p = A.proj(pid); if (!p || p.closeout) return Promise.resolve(null);""",
 """function closeout(pid, paid){
  var p = A.proj(pid); if (!p || p.closeout) return Promise.resolve(null);
  if (!""" + G + """('closeout_autopilot', 1, [s(p.name || pid)]) : false)) return Promise.resolve(null);   /* patch AUTOPANEL: no complete + archive by itself */"""),
# ── commission sweep ──
("""window._gcSweepCommissions = async function(quiet){""",
 """window._gcSweepCommissions = async function(quiet){
  if(quiet && !""" + G + """('commission_sweep') : false)) return [];   /* patch AUTOPANEL: the automatic sweep (a person's run still works) */"""),
# ── job-complete chain (thank-you, commission unlocked) ──
("""  window._gcRunJobCompleteChain = function(){
    if(window.__GC_IS_TYPING__ || document.hidden) return;""",
 """  window._gcRunJobCompleteChain = function(){
    if(window.__GC_IS_TYPING__ || document.hidden) return;
    if(!""" + G + """('thank_you_queue') : false)) return;""" + P),
# ── e-mailed invoice auto-booking ──
("""  try { if (W._gcSubInv) W._gcSubInv.load(MM.list, MM.done); } catch (e) {}   /* patch SUBINV */
  MM.list.filter(function(x){ return x.kind === 'sub_invoice'; }).forEach(function(x){""",
 """  try { if (W._gcSubInv) W._gcSubInv.load(MM.list, MM.done); } catch (e) {}   /* patch SUBINV */
  if (!""" + G + """('mailed_invoice_booking', function(){ var l = MM.list.filter(function(x){ return x.kind === 'sub_invoice' && !have[x.mailId || x.id] && !have['INVM-' + s(x.id).replace(/^MM-/, '')]; }); return { n: l.length, sample: l.slice(0, 3).map(function(x){ return x.subject || x.from; }) }; }) : false)) return 0;   /* patch AUTOPANEL: OFF → they wait in 📥 Needs a job */
  MM.list.filter(function(x){ return x.kind === 'sub_invoice'; }).forEach(function(x){"""),
("""  P.list = arr(list); P.done = obj(done); P.at = Date.now();
  if (!moneyPerson() || typeof W._setExpenses !== 'function') return 0;""",
 """  P.list = arr(list); P.done = obj(done); P.at = Date.now();
  if (!moneyPerson() || typeof W._setExpenses !== 'function') return 0;
  if (!""" + G + """('mailed_invoice_booking', function(){ var l = P.list.filter(function(r){ return r.si && r.si.route === 'book' && r.si.job && !isDone(r, P.done) && (r.kind === 'receipt' || r.si.payee === 'supplier' || r.kind === 'client_invoice' || r.si.payee === 'client'); }); return { n: l.length, sample: l.slice(0, 3).map(function(r){ return s(r.si.read && r.si.read.vendor) || r.from; }) }; }) : false)) return 0;   /* patch AUTOPANEL: OFF → 📥 Needs a job */"""),
("""if (x.si.route === 'book' && !SI.held[x.id]) return;""",
 """if (x.si.route === 'book' && !SI.held[x.id] && W._gcAutoOn && W._gcAutoOn('mailed_invoice_booking')) return;   /* patch AUTOPANEL: OFF → listed here */"""),
("""    if (si && si.route === 'book' && si.job && proj(si.job.pid)) return;   /* booked by process() */""",
 """    if (si && si.route === 'book' && si.job && proj(si.job.pid) && W._gcAutoOn && W._gcAutoOn('mailed_invoice_booking')) return;   /* booked by process() (patch AUTOPANEL: OFF → listed here) */"""),
("""      var pending=queue.filter(function(q){return q&&!q._processed;});
      if(!pending.length) return;""",
 """      var pending=queue.filter(function(q){return q&&!q._processed;});
      if(!pending.length) return;
      if(!""" + G + """('mailed_invoice_booking', pending.length) : false)) return;""" + P),
# ── duplicate / $0 deletes ──
("""  setTimeout(function(){ try{ window._gcDedupeSubInvoices(true); }catch(e){} }, 6000);""",
 """  setTimeout(function(){ if(!""" + G + """('dup_invoice_delete') : false)) return; try{ window._gcDedupeSubInvoices(true); }catch(e){} }, 6000);""" + P),
("""    if(window.__GC_IS_TYPING__ || window.__GC_IS_ACTIVE__) return;
    try{ window._gcDedupeSubInvoices(true); }catch(e){}""",
 """    if(window.__GC_IS_TYPING__ || window.__GC_IS_ACTIVE__) return;
    if(!""" + G + """('dup_invoice_delete') : false)) return;""" + P + """
    try{ window._gcDedupeSubInvoices(true); }catch(e){}"""),
("""  setTimeout(function(){ try{ window._gcPurgeZeroRegister(true); }catch(e){} }, 3000);
  setInterval(function(){ try{ if(!window.__GC_IS_TYPING__) window._gcPurgeZeroRegister(true); }catch(e){} }, 30000);""",
 """  setTimeout(function(){ if(!""" + G + """('dup_invoice_delete') : false)) return; try{ window._gcPurgeZeroRegister(true); }catch(e){} }, 3000);""" + P + """
  setInterval(function(){ if(!""" + G + """('dup_invoice_delete') : false)) return; try{ if(!window.__GC_IS_TYPING__) window._gcPurgeZeroRegister(true); }catch(e){} }, 30000);"""),
("""  setTimeout(purgeZeros, 5000);
  setInterval(function(){ if(!window.__GC_IS_TYPING__) purgeZeros(); }, 60000);""",
 """  setTimeout(function(){ if(""" + G + """('dup_invoice_delete') : false)) purgeZeros(); }, 5000);""" + P + """
  setInterval(function(){ if(!window.__GC_IS_TYPING__ && """ + G + """('dup_invoice_delete') : false)) purgeZeros(); }, 60000);"""),
("""    last=Date.now();
    window._gcNoDupesSweep(true);
  }catch(e){}
}, 5000);
setTimeout(function(){ window._gcNoDupesSweep(false); }, 9000);""",
 """    last=Date.now();
    if(!""" + G + """('dup_invoice_delete') : false)) return;""" + P + """
    window._gcNoDupesSweep(true);
  }catch(e){}
}, 5000);
setTimeout(function(){ if(""" + G + """('dup_invoice_delete') : false)) window._gcNoDupesSweep(false); }, 9000);"""),
("""        last=0; window._gcNoDupesSweep(true);""",
 """        last=0; if(""" + G + """('dup_invoice_delete') : false)) window._gcNoDupesSweep(true);""" + P),
# ── Mississippi tax ──
("""      var missing=window._gcMSTaxMissing();
      if(!missing.length) return;""",
 """      var missing=window._gcMSTaxMissing();
      if(!missing.length) return;
      if(!""" + G + """('ms_tax_add', missing.length, missing.slice(0,3).map(function(e){ return e.name||e.num||e.id; })) : false)) return;""" + P),
# ── 5 PM lead auto-assign (the page's copy) ──
("""    return C.isDue(l, Date.now() - late) ? { r: { release: true, field: l.hold.field, name: l.hold.name, email: l.hold.email, label: l.hold.label, k: l.hold.k } } : { r: null };""",
 """    if (C.isDue(l, Date.now() - late) && !""" + G + """('lead_auto_assign', 1, [String(l.name || l.id || '')]) : false)) return { r: null };   /* patch AUTOPANEL: stays "Suggested" until an admin acts */
    return C.isDue(l, Date.now() - late) ? { r: { release: true, field: l.hold.field, name: l.hold.name, email: l.hold.email, label: l.hold.label, k: l.hold.k } } : { r: null };"""),
# ── CompanyCam "make new jobs" (the page's copies) ──
("""    await compute();
    if (!lastNew.length) return 0;
    var n = await makeJobs(lastNew, false);""",
 """    await compute();
    if (!lastNew.length) return 0;
    if (!""" + G + """('companycam_new_jobs', lastNew.length, lastNew.slice(0, 3).map(function(p){ return p.name || p.address || p.id; })) : false)) return 0;""" + P + """
    var n = await makeJobs(lastNew, false);"""),
("""if(_t.ccAutoCreate===false){ continue; } }catch(e){}""",
 """if(_t.ccAutoCreate===false){ continue; } }catch(e){}
        if(!""" + G + """('companycam_new_jobs', 1, [item.name||'']) : false)) continue;""" + P),
# ── appointment confirmations ──
("""function apptTick(force, at){   /* at: a Date to run as (tests) */
  if (!force && (D.hidden || W.__GC_IS_TYPING__)) return;""",
 """function apptTick(force, at){   /* at: a Date to run as (tests) */
  if (!force && (D.hidden || W.__GC_IS_TYPING__)) return;
  if (!""" + G + """('appt_confirmations') : false)) return;""" + P),
# ── proposal maker ──
("""  if (!force && tpl().autoSend === false && e.estinNow !== true) {""",
 """  if (!force && e.estinNow !== true && (tpl().autoSend === false || !""" + G + """('proposal_maker', 1, [String(e.name || e.id || '')]) : false))) {   /* patch AUTOPANEL */"""),
]
for o, n in EDITS:
    src = once(src, o, n)
open(path, 'w', encoding='utf-8').write(src)
print('AUTOPANEL: patched (%d edits)' % len(EDITS))
