#!/usr/bin/env python3
"""patch PAYEDIT2 (owner 11/03):
 1. "owners do no commission this shouldn't be here" — tools/payedit2_tail.js (after the last </script>): owners / admins
    (role, payType owner, _gcOwnerNames) and anyone let go (gc_fired_users) are never queued a commission check
    (_gcDraftCheck), earn none in payroll (_gcCommissionForPM), are not on the checks due (_gcQueuedChecksDue); a
    condition-gated self-heal takes their unpaid commission checks off gc_check_queue, copies in gc_owner_comm_removed.
 2. "want to see and edit any approvals for reapproval if needed" — Payroll → Approvals: every approved / paid run gets
    "✏️ Edit" (admin). Runs from paystubs (source paystub-entry) open 📥 Enter past payroll with that run loaded (saving
    replaces it: PASTPAYEDIT). Any other run is reopened: back to pending ("reopened for edit by <me>" in its history),
    its book rows come out, each line has ✏️ Edit (_gcEditPayLine), and ✓ Approve puts it back (paid stays paid; booked
    again only if it was booked). A reopened run is never retired / folded by PAYREPLACE.
usage: python3 tools/patch_PAYEDIT2.py [index.html]     (in place; idempotent). Also patches tools/pastpay_tail.js and
tools/paymanual_tail.js (the copies of those blocks)."""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
INDEX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, '..', 'index.html')
MARK = '/* patch PAYEDIT2 */'

PASTPAY = [
 ("W._gcPastPayOpen = async function(){\n",
  "W._gcPastPayOpen = async function(_pe2){ _pe2=(_pe2&&_pe2.runId)?_pe2:null; var _only='';   " + MARK + "\n"),
 ("x.source==='paystub-entry' && !x.tombstoned && !x.deleted && (!a || s(x.payDate)>=a) && (!b || s(x.payDate)<=b) && !_loaded[x.id]; });",
  "x.source==='paystub-entry' && !x.tombstoned && !x.deleted && (!a || s(x.payDate)>=a) && (!b || s(x.payDate)<=b) && !_loaded[x.id] && (!_only || String(x.id)===_only); });"),
 ("  if(rows.length){ draw(); await recalc(); paint(); } else draw();\n};\n})(window);",
  "  if(rows.length){ draw(); await recalc(); paint(); } else draw();\n"
  "  if(_pe2){   " + MARK + "   // ✏️ Edit from Approvals: just this run, loaded\n"
  "    var _er=runs.filter(function(x){ return x && String(x.id)===String(_pe2.runId); })[0];\n"
  "    if(_er){ $('first').value=s(_er.payDate); $('last').value=s(_er.payDate); _only=String(_er.id); try{ await $('load').onclick(); }finally{ _only=''; } }\n"
  "    else { $('msg').style.color='#b91c1c'; $('msg').textContent='That saved run is not here any more.'; }\n"
  "  }\n"
  "};\n"
  "W._gcPastPayEditRun = function(runId){ return W._gcPastPayOpen({ runId:runId }); };   " + MARK + "\n"
  "})(window);"),
]

PAYMANUAL = [
 ("/* what has been entered by hand, voided or deleted (this computer's delete log + each run's history) */\n",
  "/* ── ✏️ Edit a saved run: reopen it for re-approval ── */   " + MARK + "\n"
  "W._gcPayRunUnbook = unbook;\n"
  "W._gcPayRunReopen = async function(runId, opts){\n"
  "  opts = opts || {};\n"
  "  var p = P(); if(!p) return { ok:false, why:'Payroll is still loading.' };\n"
  "  if(!isAdmin()){ if(!opts.quiet) alert('Only an admin can reopen payroll.'); return { ok:false, why:'Only an admin can reopen payroll.' }; }\n"
  "  var all = await allRuns();\n"
  "  var r = all.filter(function(x){ return x && String(x.id) === String(runId); })[0];\n"
  "  if(!r){ if(!opts.quiet) alert('That payroll run is not here any more.'); return { ok:false, why:'not found' }; }\n"
  "  var st = low(r.status);\n"
  "  if(st !== 'approved' && st !== 'paid'){ var w0 = 'Only an approved or paid run is reopened — this one is '+stLabel(r)+'.'; if(!opts.quiet) alert(w0); return { ok:false, why:w0 }; }\n"
  "  var t = runTotals(r), n = (r.lines||[]).length;\n"
  "  var written = !!r.checksWritten || (r.lines||[]).some(function(L){ return L && (L.paidOut === true || low(L.status) === 'paid'); });\n"
  "  var q = 'Edit the '+stLabel(r).toUpperCase()+' payroll run for the week '+runWeekLabel(r)+'?'\n"
  "    + (written ? '\\n\\n⚠ Its checks were already written. Editing does not void or reprint them — make the figures match what was really paid.' : '')\n"
  "    + '\\n\\n'+n+' check'+(n===1?'':'s')+' · total '+money(t.net)+' net ('+money(t.gross)+' gross).\\n\\n'\n"
  "    + 'It goes back to Waiting on admin: change any line, then it has to be approved again. Its wages come out of the books until it is.';\n"
  "  if(!opts.noAsk && !confirm(q)) return { ok:false, why:'cancelled' };\n"
  "  var now = nowISO(), who = me();\n"
  "  var booked = await unbook(r);\n"
  "  r.reopenedFrom = st; r.reopenedForEdit = now; r.reopenedBy = who; r.reopenBooked = !!(booked && (booked.register || booked.payments)); r.status = 'pending'; r.updatedAt = now;\n"
  "  (r.lines||[]).forEach(function(L){ if(L && low(L.status) !== 'denied'){ L.statusBeforeReopen = L.status; L.status = 'pending'; } });\n"
  "  r.history = (Array.isArray(r.history) ? r.history : []).concat([{ at:now, by:who, action:'reopened for edit', from:st, note:'reopened for edit by '+who+(written ? ' · checks were already written' : '') }]);\n"
  "  await p.saveRuns(all);\n"
  "  try{ console.log('[GC] Payroll run reopened for edit: '+runWeekLabel(r)+' (was '+st+', by '+who+')'); }catch(e){}\n"
  "  rerender();\n"
  "  return { ok:true, run:r, booked:booked, written:written };\n"
  "};\n"
  "W._gcPayRunEdit = async function(runId){\n"
  "  if(!isAdmin()){ alert('Only an admin can edit a saved payroll run.'); return { ok:false, why:'admin only' }; }\n"
  "  var r = (await allRuns()).filter(function(x){ return x && String(x.id) === String(runId); })[0];\n"
  "  if(r && r.source === 'paystub-entry' && W._gcPastPayEditRun) return W._gcPastPayEditRun(r.id);\n"
  "  return W._gcPayRunReopen(runId);\n"
  "};\n"
  "/* what has been entered by hand, voided or deleted (this computer's delete log + each run's history) */\n"),
]

INDEX_ONLY = [
 # PAYREPLACE never retires / folds a run reopened for edit
 ("    if(!r || _prRunDone(r) || !Array.isArray(r.lines)){ res.push(r); return; }",
  "    if(!r || _prRunDone(r) || !Array.isArray(r.lines) || r.reopenedForEdit){ res.push(r); return; }   " + MARK),
 # approve again: paid stays paid; booked again only if it was booked
 ("  r.status='approved'; r.approvedBy=P.me(); r.approvedAt=new Date().toISOString(); r.totals=t;",
  "  r.status='approved'; r.approvedBy=P.me(); r.approvedAt=new Date().toISOString(); r.totals=t;\n"
  "  var _pe2Skip=false; if(r.reopenedForEdit && !(String(r.reapprovedAt||'')>String(r.reopenedForEdit))){ r.reapprovedAt=r.approvedAt; if(r.reopenedFrom==='paid'){ r.status='paid'; live.forEach(function(L){ L.status='paid'; }); } _pe2Skip=!r.reopenBooked;   " + MARK + "\n"
  "    r.history=(Array.isArray(r.history)?r.history:[]).concat([{ at:r.approvedAt, by:r.approvedBy, action:'approved again', note:'after edit (reopened '+String(r.reopenedForEdit).slice(0,10)+')' }]); r.reopenedForEdit=''; r.reopenBooked=false; }"),
 ("  try{ await postToBooks(r, live, t); }catch(e){ console.warn('payroll posting', e); }",
  "  if(!_pe2Skip) try{ await postToBooks(r, live, t); }catch(e){ console.warn('payroll posting', e); }"),
 ("  var t=r.totals||{}, open=(S.openRun===r.id);",
  "  var t=(r.reopenedForEdit&&r.status==='pending')?totalsOf(r.lines):(r.totals||{}), open=(S.openRun===r.id);   " + MARK),
 ("              +(c.voidIt?('<button data-void=\"'+esc(r.id)+'\" title=\"A paid run is not deleted — void it: it stays on record and stops counting\" style=\"'+CSS.btn2+'color:#991b1b;\">⊘ Void</button>'):''); })()",
  "              +(c.voidIt?('<button data-void=\"'+esc(r.id)+'\" title=\"A paid run is not deleted — void it: it stays on record and stops counting\" style=\"'+CSS.btn2+'color:#991b1b;\">⊘ Void</button>'):''); })()\n"
  "        +((P.isAdmin()&&window._gcPayRunEdit&&(r.status==='approved'||r.status==='paid'))?('<button data-redit=\"'+esc(r.id)+'\" title=\"'+(r.source==='paystub-entry'?'Open it in Enter past payroll to fix and replace it':'Back to Waiting on admin: change any line, then approve it again')+'\" style=\"'+CSS.btn2+'color:#1d4ed8;\">✏️ Edit</button>'):'')   " + MARK + "\n"
  "        +((r.reopenedForEdit&&r.status==='pending')?('<span style=\"background:#dbeafe;border:1px solid #93c5fd;color:#1d4ed8;border-radius:20px;padding:3px 9px;font-size:10px;font-weight:800;\">✏️ reopened for edit by '+esc(r.reopenedBy||'')+' — approve it again</span>'):'')"),
 ("            +(P.isAdmin()&&r.status==='pending'?('<button data-line=\"'+r.id+'\"",
  "            +((P.isAdmin()&&r.status==='pending'&&r.reopenedForEdit&&window._gcEditPayLine)?('<button data-ledit=\"'+esc(r.id)+'\" data-idx=\"'+i+'\" style=\"'+CSS.btn2+'padding:4px 9px;font-size:11px;color:#1d4ed8;\">✏️ Edit</button> '):'')   " + MARK + "\n"
  "            +(P.isAdmin()&&r.status==='pending'?('<button data-line=\"'+r.id+'\""),
 ("  Array.prototype.forEach.call(body.querySelectorAll('[data-void]'), function(b){",
  "  Array.prototype.forEach.call(body.querySelectorAll('[data-redit]'), function(b){   " + MARK + "\n"
  "    b.onclick=function(){ if(window._gcPayRunEdit) window._gcPayRunEdit(b.getAttribute('data-redit')); };\n"
  "  });\n"
  "  Array.prototype.forEach.call(body.querySelectorAll('[data-ledit]'), function(b){\n"
  "    b.onclick=function(){ if(window._gcEditPayLine) window._gcEditPayLine(b.getAttribute('data-ledit'), +b.getAttribute('data-idx')); };\n"
  "  });\n"
  "  Array.prototype.forEach.call(body.querySelectorAll('[data-void]'), function(b){"),
]

def apply(t, R, where):
    for a, b in R:
        n = t.count(a)
        if n != 1: print('anchor count', n, 'in', where, 'for', a[:90]); sys.exit(1)
    for a, b in R: t = t.replace(a, b, 1)
    return t

done = 0
t = open(INDEX, encoding='utf-8').read()
if MARK not in t:
    t = apply(t, PASTPAY + PAYMANUAL + INDEX_ONLY, INDEX)
    tail = open(os.path.join(H, 'payedit2_tail.js'), encoding='utf-8').read().rstrip('\n')
    assert tail.startswith('<script>') and tail.endswith('</script>') and tail.count('</script>') == 1
    i = t.rfind('</script>'); assert i > 0; i += len('</script>')
    t = t[:i] + '\n' + tail + t[i:]
    open(INDEX, 'w', encoding='utf-8').write(t); done += 1
for name, R in (('pastpay_tail.js', PASTPAY), ('paymanual_tail.js', PAYMANUAL)):
    P = os.path.join(H, name); u = open(P, encoding='utf-8').read()
    if MARK in u: continue
    open(P, 'w', encoding='utf-8').write(apply(u, R, P)); done += 1
print('patched PAYEDIT2 (%d file(s))' % done if done else 'already patched')
