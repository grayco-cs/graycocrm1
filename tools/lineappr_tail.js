<script id="gc-patch-lineappr">
/* __GC_PATCH_LINEAPPR__ (owner 11/05, Payroll → Approvals → "See every check"):
   "need to approve checks and runs by themself and deny by themself if something is wrong and edit hours or one if i need to change it".
   Each line of a pending run (admin): ✓ Approve this check / ✕ Deny this check (with a reason), beside Pay stub and ✏️ Edit.
   APPROVE ONE: the line moves out of the run into its own run (same from / to / payDate, history "approved alone by <me>")
   and that run goes through the page's own approveRun (check number, payroll register, employer taxes, payroll account,
   payment history, PAYREPLACE) — nothing is booked here. The line LEAVES the original run, so every reader (941, PMPAY,
   YTD, withholding) sees it once. The last waiting line is approved with the run itself (approveRun).
   DENY ONE: the line is denied with a reason. When nothing is left waiting, the run closes: approved if any check of it
   was approved alone, denied if every check was denied.
   SHADOW DRAFT: an automatic draft (status 'draft', auto:true) for a payDate that already has a pending / approved / paid
   run is retired on read (the engine's runs(), archived in payrollRetired + tombstoned) — condition-gated, a no-op otherwise. */
(function(W){
'use strict';
function s(v){ return v == null ? '' : String(v); }
function n2(v){ var x = parseFloat(s(v).replace(/[$,]/g, '')); return isFinite(x) ? x : 0; }
function r2(v){ return Math.round(n2(v) * 100) / 100; }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
var BUSY = { pending: 1, approved: 1, paid: 1 };

/* pure: auto drafts whose payday is already being paid -> { list, retired, deadIds, changed } (PAYREPLACE's shape) */
function shadowDrafts(list){
  var out = { retired: [], deadIds: [], changed: false }, busy = {};
  (list || []).forEach(function(r){ if (r && r.payDate && BUSY[s(r.status)]) busy[s(r.payDate)] = 1; });
  out.list = (list || []).filter(function(r){
    if (!(r && s(r.status) === 'draft' && r.auto === true && busy[s(r.payDate)])) return true;
    out.changed = true; out.deadIds.push(s(r.id));
    (r.lines || []).forEach(function(L){ if (L) out.retired.push({ runId: r.id, payDate: r.payDate, from: r.from, to: r.to, status: r.status, why: 'automatic draft for a payday that already has a pending / approved / paid run', line: L }); });
    return false;
  });
  return out;
}
function totals(lines){
  var t = { gross: 0, fed: 0, ss: 0, med: 0, addlMed: 0, state: 0, otherDed: 0, net: 0, employerSS: 0, employerMed: 0, futa: 0, suta: 0, hours: 0 };
  (lines || []).forEach(function(L){ if (!L || L.status === 'denied') return; Object.keys(t).forEach(function(k){ t[k] += k === 'hours' ? n2(L.hours) + n2(L.otHours) : n2(L[k]); }); });
  Object.keys(t).forEach(function(k){ t[k] = r2(t[k]); });
  t.irs941 = r2(t.fed + t.ss * 2 + t.med * 2 + t.addlMed); t.employerTotal = r2(t.employerSS + t.employerMed + t.futa + t.suta); t.totalCost = r2(t.gross + t.employerTotal);
  return t;
}
function hist(r, h){ r.history = (Array.isArray(r.history) ? r.history : []).concat([h]); }
/* pure: take line idx out of run R (in list) into its own pending run, placed right after R -> the new run */
function splitLine(list, runId, idx, me, now){
  var R = (list || []).filter(function(r){ return r && s(r.id) === s(runId); })[0], L = R && (R.lines || [])[idx];
  if (!L) throw new Error('could not find that check');
  if (s(R.status) !== 'pending') throw new Error('this run is ' + s(R.status) + ', not waiting on admin');
  if (L.status === 'denied') throw new Error('that check is denied — Undo it first');
  now = now || new Date().toISOString();
  var N = clone(R), X = clone(L); X.status = 'pending';
  ['approvedBy', 'approvedAt', 'deniedBy', 'deniedAt', 'denyReason', 'reopenedForEdit', 'reopenedBy', 'reopenedFrom', 'reopenBooked', 'reapprovedAt', 'splitOff', 'approvedByOffice', 'reviewedAt', 'problems'].forEach(function(k){ delete N[k]; });
  N.id = s(R.id) + '-L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  N.lines = [X]; N.status = 'pending'; N.auto = false; N.splitFrom = s(R.id); N.approvedAlone = true; N.createdAt = now; N.updatedAt = now;
  N.history = [{ at: now, by: me, action: 'approved alone', note: 'approved alone by ' + me + ' — ' + s(X.name) + ' (net ' + r2(X.net).toFixed(2) + ') taken from run ' + s(R.id) }];
  N.totals = totals(N.lines);
  R.lines.splice(idx, 1);
  R.splitOff = (Array.isArray(R.splitOff) ? R.splitOff : []).concat([{ runId: N.id, name: s(X.name), empId: s(X.empId), net: r2(X.net), at: now, by: me }]);
  R.totals = totals(R.lines); R.updatedAt = now;
  hist(R, { at: now, by: me, action: 'check approved alone', note: s(X.name) + ' approved alone by ' + me + ' → run ' + N.id });
  list.splice(list.indexOf(R) + 1, 0, N);
  return N;
}
/* pure: nothing left waiting -> close: approved if any check went out alone, else denied. Returns the new status or '' */
function closeIfDone(R, me, now){
  if (!R || s(R.status) !== 'pending') return '';
  if ((R.lines || []).some(function(L){ return L && L.status !== 'denied'; })) return '';
  now = now || new Date().toISOString(); R.totals = totals(R.lines); R.updatedAt = now;
  if ((R.splitOff || []).length){
    R.status = 'approved'; R.approvedBy = me; R.approvedAt = now; R.closedByLines = true;
    hist(R, { at: now, by: me, action: 'closed', note: 'every check decided — ' + R.splitOff.length + ' approved alone, the rest denied' });
  } else {
    R.status = 'denied'; R.deniedBy = me; R.deniedAt = now; R.closedByLines = true;
    R.denyReason = (R.lines || []).map(function(L){ return s(L.name) + (L.denyReason ? ': ' + s(L.denyReason) : ''); }).join('; ');
    hist(R, { at: now, by: me, action: 'closed', note: 'every check denied' });
  }
  return R.status;
}
function denyLine(R, idx, why, me, now){
  var L = R && (R.lines || [])[idx]; if (!L) throw new Error('could not find that check');
  if (s(R.status) !== 'pending') throw new Error('this run is ' + s(R.status) + ', not waiting on admin');
  now = now || new Date().toISOString();
  L.status = 'denied'; L.denyReason = s(why); L.deniedBy = me; L.deniedAt = now;
  R.totals = totals(R.lines); R.updatedAt = now;
  hist(R, { at: now, by: me, action: 'check denied', note: s(L.name) + ' denied by ' + me + (why ? ' — ' + s(why) : '') });
  return closeIfDone(R, me, now);
}
W._gcLineAppr = { shadowDrafts: shadowDrafts, splitLine: splitLine, closeIfDone: closeIfDone, denyLine: denyLine, totals: totals };
if (typeof document === 'undefined') return;

function P(){ return W.__GC_PAY || null; }
function who(){ var p = P(); try { return s(p && p.me && p.me()) || 'admin'; } catch (e) { return 'admin'; } }
function money(v){ return '$' + n2(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function rerender(){ try { if (W._gcOpenPayrollTab) W._gcOpenPayrollTab('approvals'); } catch (e) {} }
function find(all, id){ return all.filter(function(r){ return r && s(r.id) === s(id); })[0]; }
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout, busyNow = false;

W._gcLineApprove = async function(runId, idx){
  var p = P(); if (!p) return; if (!p.isAdmin()) { alert('Only an admin can approve payroll.'); return; }
  if (busyNow) return; busyNow = true;
  try {
    var all = await p.runs(), R = find(all, runId), L = R && (R.lines || [])[idx];
    if (!L || s(R.status) !== 'pending' || L.status === 'denied') { alert('That check is not waiting on admin any more.'); rerender(); return; }
    var waiting = R.lines.filter(function(x){ return x && x.status !== 'denied'; });
    if (!W._gcPayApproveRun) { alert('Payroll is still loading — try again in a moment.'); return; }
    if (waiting.length === 1) { await W._gcPayApproveRun(R.id); return; }   /* the last one: the run itself (its own confirm) */
    if (!confirm('Approve only ' + s(L.name) + '\'s check — net ' + money(L.net) + ' (gross ' + money(L.gross) + ')?\n\n'
      + 'It is recorded and booked now (check number, wages, employer taxes, payroll account) as its own run for ' + s(R.from) + ' → ' + s(R.to) + ', checks dated ' + s(R.payDate) + '.\n'
      + 'The other ' + (waiting.length - 1) + ' check' + (waiting.length > 2 ? 's stay' : ' stays') + ' Waiting on admin.')) return;
    var me = who(), N = splitLine(all, R.id, idx, me);
    await p.saveRuns(all);
    try { await W._gcPayApproveRun(N.id, { yes: true, quiet: true }); }
    catch (e) { console.warn('[GC LINEAPPR] approve', e); }
    var after = find(await p.runs(), N.id), X = after && after.lines[0];
    if (!after || ['approved', 'paid'].indexOf(s(after.status)) < 0) { alert('Not approved: ' + s(L.name) + '\'s check is in its own run, still Waiting on admin.'); rerender(); return; }
    alert('Approved ' + s(X.name) + ' — check ' + s(X.checkNo) + ', net ' + money(X.net) + '. Recorded and booked.\n\nThe other checks are still Waiting on admin.');
    rerender();
  } catch (e) { alert('Not approved: ' + (e && e.message || e)); rerender(); }
  finally { busyNow = false; }
};

W._gcLineDeny = async function(runId, idx){
  var p = P(); if (!p) return; if (!p.isAdmin()) { alert('Only an admin can deny payroll.'); return; }
  var all = await p.runs(), R = find(all, runId), L = R && (R.lines || [])[idx];
  if (!L || s(R.status) !== 'pending') { alert('That check is not waiting on admin any more.'); rerender(); return; }
  var why = prompt('Deny ' + s(L.name) + '\'s check (' + money(L.net) + ') — what is wrong?'); if (why === null) return;
  try { var st = denyLine(R, idx, why.trim(), who()); await p.saveRuns(all);
    if (st) alert(st === 'denied' ? 'Every check on this run is denied — the run is closed as Denied.' : 'Every check on this run is decided — the run is closed (the approved ones went out alone).');
  } catch (e) { alert('Not denied: ' + (e && e.message || e)); }
  rerender();
};

/* on load: retire a shadow auto draft once (the engine's runs() does it; nothing is written when there is none) */
(function heal(n){ var p = P(); if (!p || !p.runs || !p.isAdmin) { if (n < 120) ST(function(){ heal(n + 1); }, 1000); return; }
  ST(function(){ try { p.runs(); } catch (e) {} }, 5000); })(0);
})(window);
</script>
