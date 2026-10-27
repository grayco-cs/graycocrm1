/* netlify/functions/_lib/auto-score.js — patch AUTO-SCORE: the Monday owner scorecard. Monday after 7 AM Central, one
   e-mail to the admins (Wesley and Nick) with last week (Monday → Sunday): new leads by source, bids submitted, wins,
   money collected, A/R by age, jobs at risk, approvals waiting, and the payroll drafts waiting. Staff only — no customer
   gets anything; data-entry mode lets it through. Read only: it changes nothing in the CRM. */
'use strict';
const A = require('./auto-common.js');
const { s, low, num, arr, ymd, esc, usd0, pidOf, daysBetween, addDays } = A;
function inWin(d, a, b){ d = ymd(d); return !!d && d >= a && d <= b; }
function leadSource(l){ return s(l.source || l.leadSource || l.src) || 'Other'; }
function won(l){ return /won|signed|sold/.test(low(l.stage || l.status)); }
function td(v, right){ return '<td style="padding:5px 8px;border-bottom:1px solid #eee' + (right ? ';text-align:right' : '') + '">' + v + '</td>'; }
function table(rows, heads){ return '<table style="border-collapse:collapse;width:100%;font-size:13px;margin:4px 0 12px"><tr>' + heads.map(function(h, i){ return '<th style="text-align:' + (i ? 'right' : 'left') + ';padding:5px 8px;background:#F5F1E8">' + esc(h) + '</th>'; }).join('') + '</tr>' + rows.join('') + '</table>'; }
function build(data, extra, today){
  const C = A.core();
  const to = addDays(today, -1), from = addDays(today, -7);
  const leads = arr(data.leads).filter(function(l){ return !l.deleted; });
  const newLeads = leads.filter(function(l){ return inWin(l.createdAt || l.created || l.date || l.dateAdded, from, to); });
  const bySrc = {}; newLeads.forEach(function(l){ const k = leadSource(l); bySrc[k] = (bySrc[k] || 0) + 1; });
  const bids = leads.filter(function(l){ return /submitted/.test(low(l.stage || l.status)) && inWin(l.submittedAt || l.bidSubmittedAt || l.updatedAt, from, to); }).length;
  const wins = leads.filter(function(l){ return won(l) && inWin(l.wonAt || l.closedAt || l.updatedAt, from, to); }).length;
  const projects = arr(data.projects).filter(function(p){ return !p.deleted && p.importedHistory !== true; });
  const newJobs = projects.filter(function(p){ return inWin(p.createdAt || p.created, from, to) && !/lead|bid|estimat/.test(low(p.status)); });
  /* collected: payments recorded last week (job payments + draw payments, the same payment counted once) */
  const seen = {}; let collected = 0;
  const pay = function(pid, d, amt){ const k = s(pid) + '|' + ymd(d) + '|' + Math.round(num(amt) * 100); if (seen[k] || !inWin(d, from, to) || !(num(amt) > 0)) return; seen[k] = 1; collected += num(amt); };
  arr(data.projectPayments).forEach(function(x){ pay(pidOf(x), x.date || x.paidDate, x.amount != null ? x.amount : x.amt); });
  projects.forEach(function(p){ arr(p.drawPayments).forEach(function(x){ pay(p.id, x.date, x.amt != null ? x.amt : x.amount); }); });
  /* A/R by age */
  const ar = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 }, late30 = {};
  C.listOf(data, ['invs', 'invoices']).forEach(function(r){
    if (!C.isCustomerInvoice(r) || r.importedHistory === true || r.noSend === true || r.historyOnly === true || r.recordOnly === true) return;   /* history imports are records, not money owed */
    const bal = C.invBalance(r); if (!(bal > 0)) return;
    const due = ymd(r.dueDate || r.due); const dd = due ? daysBetween(due, today) : 0;
    if (dd <= 0) ar.current += bal; else if (dd <= 30) ar.d30 += bal; else if (dd <= 60) ar.d60 += bal; else if (dd <= 90) ar.d90 += bal; else ar.d90p += bal;
    if (dd > 30) late30[pidOf(r)] = (late30[pidOf(r)] || 0) + bal;
  });
  /* jobs at risk */
  const spent = {}; arr(extra.expenses).forEach(function(x){ if (!x.deleted) spent[pidOf(x)] = (spent[pidOf(x)] || 0) + num(x.amt != null ? x.amt : x.amount); });
  const risk = [];
  projects.forEach(function(p){
    if (!/active|progress|approved|scheduled|contract|on_hold|hold/.test(low(p.status))) return;
    const why = [], end = ymd(p.endDate || p.dueDate || p.completionTarget), contract = num(p.contract || p.contractAmount);
    if (end && end < today && num(p.pct) < 100) why.push('past its end date (' + end + '), ' + Math.round(num(p.pct)) + '% done');
    if (late30[s(p.id)]) why.push(usd0(late30[s(p.id)]) + ' invoiced 30+ days late');
    if (contract > 0 && spent[s(p.id)] > contract) why.push('costs ' + usd0(spent[s(p.id)]) + ' over the ' + usd0(contract) + ' contract');
    if (why.length) risk.push({ name: s(p.name) || s(p.id), pm: s(p.pm), why: why });
  });
  const q = arr(extra.gc_approval_queue).filter(function(x){ return x.status === 'waiting'; }).length;
  const subs = arr(extra.gc_sub_approvals).filter(function(a){ return a.status === 'pending_pm'; }).length;
  const runs = arr(extra.payrollRuns).filter(function(r){ return r.status === 'pending' || r.status === 'draft'; });
  return { from: from, to: to, newLeads: newLeads.length, bySrc: bySrc, bids: bids, wins: wins, newJobs: newJobs.length, newJobsValue: newJobs.reduce(function(t, p){ return t + num(p.contract || p.contractAmount); }, 0),
    collected: collected, ar: ar, arTotal: ar.current + ar.d30 + ar.d60 + ar.d90 + ar.d90p, risk: risk, approvals: q, subInvoices: subs,
    payroll: runs.map(function(r){ return { payDate: s(r.payDate), status: s(r.status), checks: arr(r.lines).filter(function(L){ return L.status !== 'denied'; }).length, gross: num(r.totals && r.totals.gross), net: num(r.totals && r.totals.net), auto: r.auto === true }; }) };
}
function html(sc){
  const src = Object.keys(sc.bySrc).sort(function(a, b){ return sc.bySrc[b] - sc.bySrc[a]; }).map(function(k){ return '<tr>' + td(esc(k)) + td(sc.bySrc[k], 1) + '</tr>'; });
  return '<p><b>Last week, ' + esc(sc.from) + ' → ' + esc(sc.to) + '</b></p>' +
    table(['<tr>' + td('New leads') + td(sc.newLeads, 1) + '</tr>', '<tr>' + td('Bids submitted') + td(sc.bids, 1) + '</tr>', '<tr>' + td('Leads won') + td(sc.wins, 1) + '</tr>',
      '<tr>' + td('New jobs') + td(sc.newJobs + ' · ' + usd0(sc.newJobsValue), 1) + '</tr>', '<tr>' + td('<b>Collected</b>') + td('<b>' + usd0(sc.collected) + '</b>', 1) + '</tr>'], ['', 'Count / $']) +
    (src.length ? '<p><b>New leads by source</b></p>' + table(src, ['Source', 'Leads']) : '') +
    '<p><b>Money owed to us (A/R) — ' + usd0(sc.arTotal) + '</b></p>' + table(['<tr>' + td('Not due yet') + td(usd0(sc.ar.current), 1) + '</tr>', '<tr>' + td('1–30 days late') + td(usd0(sc.ar.d30), 1) + '</tr>',
      '<tr>' + td('31–60 days late') + td(usd0(sc.ar.d60), 1) + '</tr>', '<tr>' + td('61–90 days late') + td(usd0(sc.ar.d90), 1) + '</tr>', '<tr>' + td('Over 90 days late') + td(usd0(sc.ar.d90p), 1) + '</tr>'], ['Age', 'Open']) +
    '<p><b>Jobs at risk (' + sc.risk.length + ')</b></p>' + (sc.risk.length ? '<ul style="padding-left:18px">' + sc.risk.slice(0, 12).map(function(r){ return '<li>' + esc(r.name) + (r.pm ? ' (' + esc(r.pm) + ')' : '') + ': ' + esc(r.why.join('; ')) + '</li>'; }).join('') + '</ul>' : '<p>None.</p>') +
    '<p><b>Waiting on a person</b>: ' + sc.approvals + ' approval' + (sc.approvals === 1 ? '' : 's') + ' · ' + sc.subInvoices + ' sub invoice' + (sc.subInvoices === 1 ? '' : 's') + ' on a PM</p>' +
    (sc.payroll.length ? '<p><b>Payroll waiting for approval</b></p>' + table(sc.payroll.map(function(r){ return '<tr>' + td(esc(r.payDate) + (r.auto ? ' (made Thursday)' : '') + ' · ' + esc(r.status)) + td(r.checks + ' checks · gross ' + usd0(r.gross) + ' · net ' + usd0(r.net), 1) + '</tr>'; }), ['Payday', 'Checks']) : '') +
    '<p><a href="' + esc(A.crmBase() + '/#todo') + '">Open the CRM</a></p>';
}
async function run(opts){
  opts = opts || {};
  const C = A.core(), now = opts.now != null ? opts.now : Date.now(), c = A.central(now);
  if (c.wd !== 'Mon' && !opts.anyDay) return { ok: true, skipped: 'not Monday' };
  const data = await C.crmData(true);
  const extra = await C.kvRead(['expenses', 'payrollRuns', 'gc_sub_approvals', C.AQ_KEY]);
  const sc = build(data, extra, c.ymd);
  const admins = C.adminEmails(data).filter(A.staffEmail);
  const m = await A.staffMail(admins, '📊 GrayCo weekly scorecard — ' + sc.from + ' → ' + sc.to + ' · collected ' + usd0(sc.collected), A.shell('📊 Weekly scorecard', html(sc)));
  return { ok: true, to: admins, mailed: !!m.ok, score: { newLeads: sc.newLeads, bids: sc.bids, wins: sc.wins, collected: sc.collected, arTotal: sc.arTotal, risk: sc.risk.length, approvals: sc.approvals } };
}
module.exports = { run, build, html };
