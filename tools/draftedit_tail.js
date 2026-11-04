<script id="gc-patch-draftedit">
/* __GC_PATCH_DRAFTEDIT__ (owner 11/04, Payroll → Approvals → "See every check"):
   "need to be able to edit these payrolls from here for brittany because her hourly always changes" —
   every line of a draft / pending run gets ✏️ Edit (admin). Hourly people: type the hours; the line is worked out again
   by the payroll engine (computeLine, manual gross = reg × rate + OT × rate × 1.5) so federal / SS / Medicare / state
   are right. Anyone else: the line editor (_gcEditPayLine). Either way the run becomes Waiting on admin (pending) and
   stops being the automatic draft (auto:false), so the weekly auto draft leaves it alone. */
(function(W){
'use strict';
if (W.__GC_DRAFTEDIT__) return; W.__GC_DRAFTEDIT__ = true;
var D = document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function P(){ return W.__GC_PAY || null; }
function n2(v){ var x = parseFloat(String(v == null ? '' : v).replace(/[$,]/g, '')); return isFinite(x) ? x : 0; }
function r2(v){ return Math.round(n2(v) * 100) / 100; }
function s(v){ return v == null ? '' : String(v); }
function low(v){ return s(v).trim().toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(v){ return '$' + n2(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function who(){ var p = P(); try { return s(p && p.me && p.me()) || 'admin'; } catch (e) { return 'admin'; } }
function totals(lines){ if (typeof W._gcPayTotalsOf === 'function') return W._gcPayTotalsOf(lines);
  var t = { gross: 0, fed: 0, ss: 0, med: 0, addlMed: 0, state: 0, otherDed: 0, net: 0, employerSS: 0, employerMed: 0, futa: 0, suta: 0, hours: 0 };
  (lines || []).forEach(function(L){ if (!L || L.status === 'denied') return; Object.keys(t).forEach(function(k){ t[k] = r2(t[k] + n2(k === 'hours' ? n2(L.hours) + n2(L.otHours) : L[k])); }); });
  return t; }
function rerender(){ try { if (W._gcOpenPayrollTab) W._gcOpenPayrollTab('approvals'); } catch (e) {} }
/* the run is somebody's work now: Waiting on admin, never again the automatic draft */
function touched(run, note){
  var now = new Date().toISOString();
  run.totals = totals(run.lines); run.status = 'pending'; run.auto = false; run.editedByHand = now; run.updatedAt = now;
  (run.lines || []).forEach(function(L){ if (L && L.status !== 'denied') L.status = 'pending'; });
  run.history = (Array.isArray(run.history) ? run.history : []).concat([{ at: now, by: who(), action: 'line edited', note: note }]);
}

W._gcDraftEditLine = async function(runId, idx){
  var p = P(); if (!p) return;
  if (!p.isAdmin()) { alert('Only an admin can edit payroll.'); return; }
  var all = await p.runs(), run = all.filter(function(r){ return r && String(r.id) === String(runId); })[0], L = run && (run.lines || [])[idx];
  if (!L) { alert('Could not find that pay line.'); return; }
  var profs = []; try { profs = await p.profiles(); } catch (e) {}
  var key = low(L.empId || L.userId), prof = (profs || []).filter(function(x){ return x && ((key && (low(x.userId) === key || low(x.id) === key)) || low(x.name) === low(L.name)); })[0];
  if (!prof || s(prof.payType) !== 'hourly') return otherEdit(runId, idx);
  var rate = n2(prof.hourlyRate) || n2(L.rate), after = n2(prof.otAfter) || 40, mult = n2(prof.otMultiplier) || 1.5;
  var was = r2(n2(L.hours) + n2(L.otHours));
  var old = D.getElementById('gc-draftedit-ov'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gc-draftedit-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483550;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;padding:16px';
  ov.innerHTML = '<div style="background:#fff;color:#111;border-radius:12px;width:min(440px,96vw);max-height:92vh;overflow:auto;padding:20px">'
    + '<div style="font-size:17px;font-weight:800">✏️ ' + esc(L.name) + ' — hours</div>'
    + '<div style="font-size:12px;color:#556;margin:2px 0 12px">Week ' + esc(run.from) + ' → ' + esc(run.to) + ' · ' + money(rate) + '/hr (from the profile)</div>'
    + '<label style="font-size:11px;font-weight:700">Hours worked this week</label>'
    + '<input data-de="hrs" type="number" step="0.01" min="0" inputmode="decimal" value="' + was + '" style="width:100%;padding:10px;border:1px solid #ccd;border-radius:7px;font-size:16px;text-align:right;margin:3px 0 10px">'
    + '<div data-de="calc" style="background:#f1f5f9;border-radius:8px;padding:10px;font-size:13px;margin-bottom:12px"></div>'
    + '<div style="display:flex;gap:8px"><button data-de="save" style="flex:1;background:#166534;color:#fff;border:none;border-radius:8px;padding:11px;font-weight:800;cursor:pointer;font-size:14px">Save &amp; recalculate taxes</button>'
    + '<button data-de="cancel" style="background:#e5e7eb;border:none;border-radius:8px;padding:11px 16px;font-weight:700;cursor:pointer">Cancel</button></div>'
    + '<div data-de="msg" style="color:#b91c1c;font-size:12.5px;font-weight:700;margin-top:8px"></div></div>';
  D.body.appendChild(ov);
  var q = function(k){ return ov.querySelector('[data-de="' + k + '"]'); };
  function split(){ var h = Math.max(0, n2(q('hrs').value)), ot = r2(Math.max(0, h - after)); return { reg: r2(h - ot), ot: ot, total: r2(h) }; }
  function paint(){ var h = split(), g = r2(h.reg * rate + h.ot * rate * mult);
    q('calc').innerHTML = 'Regular ' + h.reg.toFixed(2) + ' h × ' + money(rate) + (h.ot > 0 ? '<br>Overtime ' + h.ot.toFixed(2) + ' h × ' + money(rate) + ' × ' + mult : '') + '<br><b>Gross ' + money(g) + '</b> (was ' + money(L.gross) + ') — taxes are worked out again when you save.'; }
  ov.addEventListener('input', paint); paint();
  ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
  q('cancel').onclick = function(){ ov.remove(); };
  q('save').onclick = async function(){
    var b = q('save'); if (b.disabled) return; b.disabled = true; b.textContent = 'Working it out…';
    try {
      var h = split(), gross = r2(h.reg * rate + h.ot * rate * mult);
      var fresh = await p.runs(), R = fresh.filter(function(r){ return r && String(r.id) === String(runId); })[0], X = R && (R.lines || [])[idx];
      if (!X) throw new Error('that run is not here any more');
      if (['draft', 'pending'].indexOf(s(R.status)) < 0) throw new Error('this run is ' + s(R.status) + ' now');
      var set = await p.settings(), yr = (p.yearOf && p.yearOf(R.payDate)) || s(R.payDate).slice(0, 4);
      var ytd = X.ytdBefore || (p.ytdFor ? p.ytdFor(fresh.filter(function(r){ return r !== R; }), prof.userId || prof.name, yr, R.payDate) : null);
      var extras = {}; if (n2(X.bonus) > 0) extras.bonus = X.bonus; if (n2(X.reimbursement) > 0) extras.reimbursement = X.reimbursement;
      var N = await p.computeLine(prof, R.from, R.to, set, ytd, gross, extras);
      if (!N) throw new Error('the payroll engine gave nothing back');
      var parts = [{ label: 'Regular hours', amount: r2(h.reg * rate) }]; if (h.ot > 0) parts.push({ label: 'Overtime', amount: r2(h.ot * rate * mult) });
      (N.grossParts || []).forEach(function(g){ if (g && g.label !== 'Manual amount') parts.push(g); });
      var before = { hours: X.hours, otHours: X.otHours, gross: X.gross, fed: X.fed, ss: X.ss, med: X.med, state: X.state, net: X.net };
      var keep = { status: X.status, checkNo: X.checkNo, edits: X.edits };
      Object.assign(X, N, keep, { hours: h.reg, otHours: h.ot, rate: rate, grossParts: parts, ytdBefore: ytd });
      X.edits = (Array.isArray(X.edits) ? X.edits : []).concat([{ at: new Date().toISOString(), by: who(), note: 'hours ' + was + ' → ' + h.total, before: before }]);
      touched(R, 'hours changed by ' + who() + ' for ' + s(X.name) + ' from ' + was + ' to ' + h.total + ' (gross ' + money(before.gross) + ' → ' + money(X.gross) + ', net ' + money(before.net) + ' → ' + money(X.net) + ')');
      await p.saveRuns(fresh);
      ov.remove(); rerender();
    } catch (e) { b.disabled = false; b.textContent = 'Save & recalculate taxes'; q('msg').textContent = 'Not saved: ' + (e && e.message || e); }
  };
};

/* not hourly: the existing line editor; once it saves, the run is pending and no longer the auto draft */
async function otherEdit(runId, idx){
  var p = P(); if (!W._gcEditPayLine) { alert('The line editor is still loading — try again in a moment.'); return; }
  var all0 = await p.runs(), r0 = all0.filter(function(r){ return r && String(r.id) === String(runId); })[0], n0 = ((r0 && r0.lines[idx] && r0.lines[idx].edits) || []).length;
  await W._gcEditPayLine(runId, idx);
  var tries = 0;
  (function wait(){
    if (D.getElementById('_pe_save') && ++tries < 6000) { ST(wait, 300); return; }
    p.runs().then(function(all){
      var R = all.filter(function(r){ return r && String(r.id) === String(runId); })[0], X = R && R.lines[idx];
      if (!X || ((X.edits || []).length <= n0)) return;
      var e = X.edits[X.edits.length - 1] || {};
      touched(R, 'line edited by ' + who() + ' for ' + s(X.name) + ': ' + s(e.note) + ' (net ' + money(e.before && e.before.net) + ' → ' + money(X.net) + ')');
      return p.saveRuns(all).then(rerender);
    });
  })();
}
})(window);
</script>
