<script>/*__GC_PATCH_STATUSAUTO__ (owner 11/9: "once we start estimating in crm for one of these jobs it auto turns to estimating — these
  status buttons should all be auto: when steps get made they get changed").
  The job's status moves FORWARD by itself as the work does (never back, never changes On hold / Lost / Completed):
    bidding → estimating   an estimate for the job exists in the CRM (even a draft)
    → approved             the contract / estimate was signed (CRM, portal e-sign) or the job was won
    → active               work started: the start date has come, or progress is above 0 %
  Completed stays a person's choice (the "🏁 job at 100 % — mark it complete?" approval). Each move is written on the job
  (statusLog: from, to, when, why). Nothing is sent to anyone. */
(function(W){
'use strict';
var ORDER = ['bidding', 'estimating', 'approved', 'active'];
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function ests(){ try { var E = (W._gcEST && W._gcEST.all) ? W._gcEST.all() : (W._gcEstimatesState || (W._crm && W._crm.estimates) || []); return Array.isArray(E) ? E : []; } catch (e) { return []; } }
function estsFor(p, E){
  var codes = [p.po, p.autoPO].filter(Boolean).map(low), nm = low(p.name);
  return E.filter(function(e){ return e && (s(e.pid || e.projectId) === s(p.id) || (e.po && codes.indexOf(low(e.po)) > -1) || (nm && low(e.name) === nm)); });
}
function signed(p, mine){
  if (p.contractSignedAt || low(p.contractStatus) === 'signed' || p.signedAt || p.wonAt || /won|signed|awarded/.test(low(p.bidResult || p.result))) return 'the contract was signed';
  if (mine.some(function(e){ return /approved|accepted|signed|won/.test(low(e.status || e.clientStatus)) || e.signedAt || e.acceptedAt; })) return 'the estimate was signed';
  return '';
}
function next(p, E){
  var st = low(p.status) || 'bidding', i = ORDER.indexOf(st); if (i < 0) return null;   /* on_hold, completed, lost, anything else: hands off */
  var mine = estsFor(p, E), pct = parseFloat(p.pct != null ? p.pct : p.progress) || 0, start = s(p.startDate).slice(0, 10);
  var to = null, why = '';
  if (i < 3 && (pct > 0 || (start && start <= today() && i >= 2))) { to = 'active'; why = pct > 0 ? 'progress is ' + pct + ' %' : 'the start date ' + start + ' came'; }
  else if (i < 2 && signed(p, mine)) { to = 'approved'; why = signed(p, mine); }
  else if (i < 1 && mine.length) { to = 'estimating'; why = 'an estimate was started in the CRM'; }
  if (to === 'active' && i < 2 && !signed(p, mine) && pct <= 0) to = null;   /* a bid with a start date is not started work */
  return to && ORDER.indexOf(to) > i ? { to: to, why: why, from: st } : null;
}
var LAST = 0;
function run(){
  if (Date.now() - LAST < 45000) return; LAST = Date.now();
  try { if (!(W.__GC_AUTH__ && W.__GC_AUTH__.email())) return; } catch (e) { return; }
  try { var st = W._gcPause && W._gcPause.state(); if (st && st.paused) return; } catch (e) {}
  var P = (W._crm && W._crm.projects) || [], E = ests(), ch = {};
  P.forEach(function(p){ if (p && p.id && !p.deleted) { var n = next(p, E); if (n) ch[p.id] = n; } });
  var ids = Object.keys(ch); if (!ids.length) return 0;
  var now = new Date().toISOString();
  var f = function(list){ return (list || []).map(function(p){ var n = p && ch[p.id]; if (!n || low(p.status || 'bidding') !== n.from) return p;
    var q = Object.assign({}, p, { status: n.to, updatedAt: now }); q.statusLog = (Array.isArray(p.statusLog) ? p.statusLog : []).concat([{ from: n.from, to: n.to, at: now, why: n.why, by: 'auto' }]).slice(-30); return q; }); };
  if (W._setProjects) W._setProjects(f); else if (W._crm) W._crm.projects = f(W._crm.projects);
  try { if (W._gcApplySync && W._crm) W._gcApplySync('projects', W._crm.projects); } catch (e) {}
  return ids.length;
}
setTimeout(function(){ run(); setInterval(run, 60000); }, 20000);
W._gcStatusAuto = { next: next, run: function(){ LAST = 0; return run(); } };
})(window);
</script>
