/* GrayCo — JOB HEALTH SCORE (patch X12). One function, the same in the CRM page (inlined by wAUTO12/patch_X12.py)
   and in the node tests. score(job, ctx, weights) → { score 0–100, level green/amber/red, reasons[] }.
   ctx: { today 'YYYY-MM-DD', invoices[], schedule[], expenses[], punch[], tickets[], approvals n, photoMissing n,
          contractWithCOs n }. Weights are points taken off per problem; an admin edits them (gc_kv gc_health_weights). */
(function(root){
  var DEFAULT_WEIGHTS = { lateTask: 6, lateTaskMax: 24, overBudget: 25, budgetAhead: 12, overdueInvoice: 10, overdueInvoiceMax: 30, unpaid60: 10,
    approvals: 3, approvalsMax: 12, photos: 2, photosMax: 8, sadMood: 25, okMood: 8, punch: 2, punchMax: 10, ticket: 10, ticketMax: 20, noContract: 15, staleDays: 7, stale: 10, veryStaleDays: 14, veryStale: 20 };
  function s(v){ return v == null ? '' : String(v).trim(); }
  function low(v){ return s(v).toLowerCase(); }
  function num(v){ if (v == null || v === '') return 0; var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
  function arr(v){ return Array.isArray(v) ? v : []; }
  function ymd(v){ v = s(v); return /^\d{4}-\d\d-\d\d/.test(v) ? v.slice(0, 10) : (function(){ var d = Date.parse(v); return isFinite(d) ? new Date(d).toISOString().slice(0, 10) : ''; })(); }
  function days(a, b){ var x = Date.parse(a + 'T12:00:00Z'), y = Date.parse(b + 'T12:00:00Z'); return isFinite(x) && isFinite(y) ? Math.round((y - x) / 864e5) : 0; }
  function pidOf(r){ return s(r && (r.pid || r.projectId || r.jobId)); }
  function done(r){ return r && (r.done === true || r.completed === true || /^(done|complete|completed|closed|resolved|finished)$/i.test(s(r.status)) || num(r.pct) >= 100); }
  function money(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
  function isOpenJob(p){ return p && !p.deleted && !/^(complete|completed|closed|done|lost|dead|cancell?ed|archived|bidding|lead|estimate|estimating|proposal)$/i.test(s(p.status)) && p.archived !== true; }
  function score(p, ctx, W0){
    ctx = ctx || {}; var W = {}, k; for (k in DEFAULT_WEIGHTS) W[k] = DEFAULT_WEIGHTS[k]; if (W0) for (k in W0) if (isFinite(+W0[k])) W[k] = +W0[k];
    var today = ctx.today || new Date().toISOString().slice(0, 10), pid = s(p && p.id), off = 0, why = [];
    function hit(pts, text){ if (pts > 0) { off += pts; why.push({ pts: Math.round(pts), text: text }); } }
    /* late schedule tasks */
    var late = arr(ctx.schedule).filter(function(r){ var end = ymd(r.end || r.endDate || r.due || r.date); return pidOf(r) === pid && end && end < today && !done(r); });
    if (late.length) hit(Math.min(W.lateTask * late.length, W.lateTaskMax), late.length + ' schedule task' + (late.length > 1 ? 's' : '') + ' past due');
    /* budget used vs % complete */
    var contract = num(ctx.contractWithCOs || (p && p.contract)), spent = arr(ctx.expenses).filter(function(e){ return pidOf(e) === pid; }).reduce(function(t, e){ return t + num(e.amount || e.amt || e.total); }, 0);
    var budget = num(p && (p.budget || p.costBudget)) || contract * 0.7, pct = num(p && p.pct);
    if (budget > 0 && spent > budget) hit(W.overBudget, 'Costs ' + money(spent) + ' are over the budget ' + money(budget));
    else if (budget > 0 && spent / budget * 100 > pct + 25) hit(W.budgetAhead, Math.round(spent / budget * 100) + '% of the budget used at ' + Math.round(pct) + '% complete');
    /* unpaid / overdue invoices */
    var od = arr(ctx.invoices).filter(function(i){ if (pidOf(i) !== pid || s(i.type) === 'sub' || /draft|void|paid|cancel/i.test(s(i.status))) return false; var due = ymd(i.due || i.dueDate); return due && due < today && num(i.amt || i.amount) - num(i.paid || i.amtPaid) > 0.5; });
    if (od.length) { var worst = od.reduce(function(m, i){ return Math.max(m, days(ymd(i.due || i.dueDate), today)); }, 0); hit(Math.min(W.overdueInvoice * od.length, W.overdueInvoiceMax), (od.length > 1 ? od.length + ' invoices' : 'Invoice') + ' ' + worst + ' days overdue'); if (worst > 60) hit(W.unpaid60, 'Unpaid over 60 days'); }
    /* approvals waiting */
    var ap = num(ctx.approvals); if (ap) hit(Math.min(W.approvals * ap, W.approvalsMax), ap + ' approval' + (ap > 1 ? 's' : '') + ' waiting');
    /* photos (soft) */
    var ph = num(ctx.photoMissing); if (ph) hit(Math.min(W.photos * ph, W.photosMax), ph + ' photo' + (ph > 1 ? 's' : '') + ' missing for this stage');
    /* customer mood (the mid-job 😀😐😟, patch GCP) — the last 30 days */
    var moods = arr(p && p.checkinLog).concat(arr(p && p.moodLog)).filter(function(m){ return m && days(ymd(m.at), today) <= 30; });
    var last = moods.sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; })[0], mood = low(last && (last.mood || last.face));
    if (/sad|😟|bad|unhappy/.test(mood)) hit(W.sadMood, '😟 customer check-in'); else if (/ok|meh|😐|neutral/.test(mood) && s(last.comment)) hit(W.okMood, '😐 customer check-in with a comment');
    /* open punch items, warranty tickets */
    var pu = arr(ctx.punch).filter(function(r){ return pidOf(r) === pid && !done(r); }).length; if (pu) hit(Math.min(W.punch * pu, W.punchMax), pu + ' open punch item' + (pu > 1 ? 's' : ''));
    var tk = arr(ctx.tickets).filter(function(t){ return pidOf(t) === pid && !/^(closed|resolved|done|fixed)$/i.test(s(t.status)); }).length; if (tk) hit(Math.min(W.ticket * tk, W.ticketMax), tk + ' warranty ticket' + (tk > 1 ? 's' : '') + ' open');
    /* signed contract */
    if (p && !(p.contractSigned || p.contractSignedAt || p.signedAt || p.contractSignedBy)) hit(W.noContract, 'No signed contract on file');
    /* days since the last update */
    var lastAt = ymd(p && (p.updatedAt || p.lastActivity || p.modified)); if (lastAt) { var d = days(lastAt, today); if (d >= W.veryStaleDays) hit(W.veryStale, 'No update ' + d + ' days'); else if (d >= W.staleDays) hit(W.stale, 'No update ' + d + ' days'); }
    var sc = Math.max(0, Math.min(100, Math.round(100 - off)));
    why.sort(function(a, b){ return b.pts - a.pts; });
    return { score: sc, level: sc >= 80 ? 'green' : sc >= 60 ? 'amber' : 'red', reasons: why };
  }
  var api = { score: score, isOpenJob: isOpenJob, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root._gcHealth = api;
})(typeof window !== 'undefined' ? window : this);
