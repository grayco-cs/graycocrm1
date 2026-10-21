/* ============================================================================
   GrayCo Business Brain — what it can look up, and what it can offer to do.   netlify/functions/_lib/brain-tools.js
   (patch WEB, part B)

   The Brain (brain.js) answers from the CRM's LIVE records (gc_kv, read with the service key on the server — the
   browser sends nothing but the question). Every tool here gets the records already narrowed to what the person
   asking may see (SEC2):
     · admins (gc_staff role 'admin')      — everything, including payroll;
     · the office (office@, or a CRM role with "office") — every job, no payroll;
     · everyone else (PMs, estimators, field) — ONLY their own jobs (PM / estimator on the job), their own leads
       and bids, the invoices / costs / change orders / schedule of those jobs. No payroll, no other PM's numbers.
   Read-only. The only "doing" tool is propose_action: it returns a preview the person must tap to carry out
   (brain.js → execute, which checks the same rules again).
   ========================================================================== */
'use strict';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2(n){ return Math.round(num(n) * 100) / 100; }
function ymd(v){ const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); const d = new Date(t); return t && !isNaN(d) ? d.toISOString().slice(0, 10) : ''; }
function todayStr(now){ return new Date(now || Date.now()).toISOString().slice(0, 10); }
function addDays(day, n){ const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween(a, b){ return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
function pidOf(r){ return s(r && (r.pid || r.projectId || r.jobId || r.project_id)); }

/* the CRM keys the Brain reads (payroll keys only for admins) */
const KEYS = ['projects', 'invs', 'invoices', 'expenses', 'cos', 'changeOrders', 'estimates', 'leads', 'schedule', 'customers', 'users', 'gc_deleted_projects', 'gc_office_tasks', 'gcAcctRegister', 'projectPayments'];
const PAYROLL_KEYS = ['payrollRuns', 'timesheets'];

/* ── who is asking ─────────────────────────────────────────────────────────── */
function viewerOf(who, users){
  const email = low(who.email);
  const u = arr(users).find(x => low(x.email) === email) || null;
  const name = s(u && u.name) || s(who.name) || email;
  const admin = low(who.role) === 'admin';
  const office = !admin && (/^office@/.test(email) || /office/i.test(s(u && (u.role || u.title))));
  return { email, name, admin, office, role: admin ? 'admin' : office ? 'office' : (s(u && u.role) || 'staff'), seesAll: admin || office, payroll: admin };
}
function samePerson(a, b){ a = low(a); b = low(b); if (!a || !b) return false; if (a === b) return true; const fa = a.split(/\s+/), fb = b.split(/\s+/); return fa[0] === fb[0] && fa[fa.length - 1] === fb[fb.length - 1]; }
function isMineJob(p, v){ return samePerson(p.pm, v.name) || samePerson(p.estimator, v.name) || samePerson(p.pm2, v.name) || samePerson(p.superintendent, v.name) || (v.email && low(p.pmEmail) === v.email); }
function isMineLead(l, v){ return samePerson(l.pm, v.name) || samePerson(l.estimator, v.name) || samePerson(l.owner, v.name) || samePerson(l.assignedTo, v.name) || (v.email && (low(l.pmEmail) === v.email || low(l.estimatorEmail) === v.email)); }

/* ── the records, narrowed (SEC2) ──────────────────────────────────────────── */
function uniq(list){ const seen = {}, out = []; list.forEach(r => { const id = s(r.id); if (id && seen[id]) return; if (id) seen[id] = 1; out.push(r); }); return out; }
function scope(raw, v){
  const dead = {}; arr(raw.gc_deleted_projects).forEach(x => { dead[s(typeof x === 'object' ? x.id : x)] = 1; });
  if (Array.isArray(raw.gc_deleted_projects)) raw.gc_deleted_projects.forEach(x => { if (typeof x !== 'object') dead[s(x)] = 1; });
  const allJobs = arr(raw.projects).filter(p => p.id && !dead[s(p.id)] && p.deleted !== true);
  const jobs = v.seesAll ? allJobs : allJobs.filter(p => isMineJob(p, v));
  const ids = {}; jobs.forEach(p => { ids[s(p.id)] = 1; });
  const ofJobs = list => list.filter(r => r.deleted !== true && (v.seesAll ? true : ids[pidOf(r)]));
  const leads = arr(raw.leads).filter(l => l.deleted !== true && (v.seesAll || isMineLead(l, v) || ids[pidOf(l)]));
  const out = {
    viewer: v, jobs, leads,
    invoices: ofJobs(uniq(arr(raw.invs).concat(arr(raw.invoices)))),
    expenses: ofJobs(arr(raw.expenses)),
    cos: ofJobs(uniq(arr(raw.cos).concat(arr(raw.changeOrders)))),
    estimates: arr(raw.estimates).filter(e => v.seesAll || ids[pidOf(e)] || jobs.some(p => s(p.estimateId) && s(p.estimateId) === s(e.id)) || samePerson(e.estimator, v.name)),
    schedule: arr(raw.schedule).filter(e => v.seesAll || ids[pidOf(e)] || samePerson(e.assignee, v.name)),
    tasks: arr(raw.gc_office_tasks).filter(t => v.seesAll || samePerson(t.assignee, v.name) || samePerson(t.addedBy, v.name) || ids[pidOf(t)]),
    customers: v.seesAll ? arr(raw.customers) : [],
    people: arr(raw.users).filter(u => u.active !== false && u.active !== 'False').map(u => ({ name: s(u.name), role: s(u.role || u.title) })),
    register: v.seesAll ? arr(raw.gcAcctRegister) : [],
    payroll: v.payroll ? { runs: arr(raw.payrollRuns), timesheets: arr(raw.timesheets) } : null
  };
  return out;
}

/* ── money on a job ────────────────────────────────────────────────────────── */
function isClientInv(r){
  const ty = low(r.type);
  if (r.needsReview === true || ty === 'client-review') return false;
  if (/sub|vendor|bill|expense|cost/.test(ty)) return false;
  if (!ty && (r.sub || r.subId || r.vendor)) return false;
  if (/draft|pm_review|void|deleted|declined|denied|cancel/.test(low(r.status))) return false;
  return true;
}
function isSubInv(r){ return /sub|vendor|bill/.test(low(r.type)) || (!s(r.type) && !!(r.sub || r.subId)); }
function invAmt(r){ return num(r.amt != null ? r.amt : (r.amount != null ? r.amount : r.total)); }
function invPaid(r){ return (/paid/.test(low(r.status)) && !/unpaid|partial/.test(low(r.status))) || r.paidInFull === true || r.paid === true || r.paid === 'True'; }
function invBal(r){
  if (invPaid(r)) return 0;
  if (r.openBalance != null && r.openBalance !== '') return num(r.openBalance);
  if (r.balance != null && r.balance !== '') return num(r.balance);
  return Math.max(0, invAmt(r) - num(r.amountPaid || r.paidAmount || (typeof r.paid === 'number' ? r.paid : 0)));
}
function invDue(r){ return ymd(r.dueDate || r.due) || (ymd(r.date) ? addDays(ymd(r.date), 30) : ''); }
function invDate(r){ return ymd(r.date || r.invDate || r.created || r.sentAt); }
function paidDate(r){ return ymd(r.paidDate || r.payDate || r.paidAt) || (invPaid(r) ? invDate(r) : ''); }
function coAmt(c){ return num(c.amt != null ? c.amt : (c.amount != null ? c.amount : c.total)); }
function coApproved(c){ return /approv|sign|accept|complete|execut/.test(low(c.status)); }
function jobType(p){ return s(p.type || p.projectType || p.jobType) || (p.isInsurance ? 'Insurance claim' : 'Other'); }
function jobStatus(p){ return low(p.status) || 'unknown'; }
function isActive(p){ return /active|approved|progress|scheduled|contract|on_hold|hold/.test(jobStatus(p)); }
function isBidding(p){ return /bid|estimat|lead|proposal/.test(jobStatus(p)); }
function isDone(p){ return /complete|closed|done|paid|finished/.test(jobStatus(p)); }
function jobMoney(d, p){
  const pid = s(p.id);
  const inv = d.invoices.filter(r => pidOf(r) === pid);
  const client = inv.filter(isClientInv), subs = inv.filter(isSubInv);
  const exp = d.expenses.filter(r => pidOf(r) === pid && !/denied|rejected|void/.test(low(r.status)));
  const cos = d.cos.filter(c => pidOf(c) === pid);
  const contract = num(p.contract), coApprovedAmt = cos.filter(coApproved).reduce((t, c) => t + coAmt(c), 0);
  const invoiced = client.reduce((t, r) => t + invAmt(r), 0), open = client.reduce((t, r) => t + invBal(r), 0);
  const costs = exp.reduce((t, r) => t + num(r.amt != null ? r.amt : r.amount), 0) + subs.reduce((t, r) => t + invAmt(r), 0);
  const value = contract + coApprovedAmt;
  const est = d.estimates.find(e => (s(p.estimateId) && s(e.id) === s(p.estimateId)) || pidOf(e) === pid) || null;
  const estCost = est ? num(est.totalCost) : 0, estPrice = est ? num(est.totalCharge || est.total) : 0;
  return { contract: r2(contract), approvedCOs: r2(coApprovedAmt), value: r2(value), invoiced: r2(invoiced), collected: r2(invoiced - open), openAR: r2(open), costToDate: r2(costs),
    grossProfitToDate: r2(invoiced - costs), marginPct: value > 0 ? Math.round((value - costs) / value * 1000) / 10 : null,
    estimate: est ? { id: s(est.id), num: s(est.num), estCost: r2(estCost), estPrice: r2(estPrice), estMarginPct: estPrice > 0 ? Math.round((estPrice - estCost) / estPrice * 1000) / 10 : null,
      costVariance: estCost ? r2(costs - estCost) : null, costUsedPct: estCost ? Math.round(costs / estCost * 1000) / 10 : null } : null,
    pendingCOs: cos.filter(c => !coApproved(c) && !/reject|declin|void/.test(low(c.status))).length };
}
/* behind schedule: past its end date and not done; or the % complete is 20+ points behind the time used */
function behind(p, today){
  if (!isActive(p)) return null;
  const st = ymd(p.startDate), en = ymd(p.endDate || p.completionDate || p.dueDate), pct = num(p.pct || p.percentComplete);
  if (en && en < today && pct < 100) return { why: 'past its end date (' + en + ')', daysLate: daysBetween(en, today), pct };
  if (st && en && st < today && en > st) {
    const used = Math.min(100, daysBetween(st, today) / Math.max(1, daysBetween(st, en)) * 100);
    if (used - pct >= 20) return { why: Math.round(used) + '% of the time used, ' + pct + '% complete', pct, timeUsedPct: Math.round(used) };
  }
  return null;
}
function jobRow(d, p, today, deep){
  const m = jobMoney(d, p), b = behind(p, today);
  const row = { id: s(p.id), po: s(p.autoPO || p.po), name: s(p.name), client: s(p.client), status: s(p.status), type: jobType(p), pm: s(p.pm), address: s(p.address),
    start: ymd(p.startDate), end: ymd(p.endDate), pctComplete: num(p.pct) || null, leadSource: s(p.leadSource), contract: m.contract, value: m.value, invoiced: m.invoiced, collected: m.collected,
    openAR: m.openAR, costToDate: m.costToDate, marginPct: m.marginPct, behindSchedule: b ? b.why : '' };
  if (deep) row.money = m;
  return row;
}
function findJob(d, q){
  q = low(q); if (!q) return null;
  return d.jobs.find(p => low(p.id) === q || low(p.autoPO) === q) || d.jobs.find(p => low(p.name) === q)
    || d.jobs.find(p => low(p.name).indexOf(q) >= 0 || low(p.client).indexOf(q) >= 0 || low(p.address).indexOf(q) >= 0) || null;
}
function inRange(day, from, to){ return !!day && (!from || day >= from) && (!to || day <= to); }
function period(a){ const today = todayStr(a.now); return { from: ymd(a.from) || today.slice(0, 4) + '-01-01', to: ymd(a.to) || today }; }
function keyOf(day, by){ return by === 'week' ? (function(){ const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return 'week of ' + d.toISOString().slice(0, 10); })() : day.slice(0, 7); }
function leadSourceOf(x){ return s(x.leadSource || x.source || x.commissionSource) || 'Unknown'; }
function cap(list, n){ return list.length > n ? list.slice(0, n) : list; }

/* ── the tools ─────────────────────────────────────────────────────────────── */
const T = {};
T.overview = function(d, a){
  const today = todayStr(a.now);
  const active = d.jobs.filter(isActive), bidding = d.jobs.filter(isBidding);
  const open = d.invoices.filter(isClientInv).filter(r => invBal(r) > 0);
  const overdue = open.filter(r => invDue(r) && invDue(r) < today);
  const soon = addDays(today, 7);
  const bids = d.leads.filter(l => ymd(l.bidDue) && ymd(l.bidDue) >= today && ymd(l.bidDue) <= soon && !/won|lost|dead|converted/i.test(s(l.stage) + ' ' + s(l.status)));
  const weekAgo = addDays(today, -7);
  return { asOf: today, seeing: d.viewer.seesAll ? 'all of GrayCo' : 'only ' + d.viewer.name + '\'s jobs and leads',
    activeJobs: active.length, activeContractValue: r2(active.reduce((t, p) => t + jobMoney(d, p).value, 0)), biddingJobs: bidding.length,
    openReceivables: r2(open.reduce((t, r) => t + invBal(r), 0)), overdueInvoices: overdue.length, overdueAmount: r2(overdue.reduce((t, r) => t + invBal(r), 0)),
    bidsDueNext7Days: bids.length, jobsBehindSchedule: active.filter(p => behind(p, today)).length,
    newLeadsLast7Days: d.leads.filter(l => ymd(l.createdAt || l.date || l.created) >= weekAgo).length,
    openTodos: d.tasks.filter(t => !t.done).length };
};
T.money_by_period = function(d, a){
  const { from, to } = period(a), by = ['month', 'week', 'job_type', 'pm', 'customer', 'lead_source'].indexOf(a.group_by) >= 0 ? a.group_by : 'month';
  const job = {}; d.jobs.forEach(p => { job[s(p.id)] = p; });
  const groups = {};
  const g = (k) => groups[k] || (groups[k] = { group: k, invoiced: 0, collected: 0, costs: 0, newContracts: 0, jobsSold: 0 });
  const keyFor = (day, pid, fallback) => {
    const p = job[pid] || {};
    if (by === 'job_type') return jobType(p);
    if (by === 'pm') return s(p.pm) || '(no PM)';
    if (by === 'customer') return s(p.client) || s(fallback) || '(no customer)';
    if (by === 'lead_source') return leadSourceOf(p);
    return keyOf(day, by);
  };
  d.invoices.forEach(r => {
    if (isClientInv(r)) {
      const di = invDate(r); if (inRange(di, from, to)) g(keyFor(di, pidOf(r), r.client)).invoiced += invAmt(r);
      const dp = paidDate(r); if (invPaid(r) && inRange(dp, from, to)) g(keyFor(dp, pidOf(r), r.client)).collected += invAmt(r);
    } else if (isSubInv(r)) { const di = invDate(r); if (inRange(di, from, to)) g(keyFor(di, pidOf(r), '')).costs += invAmt(r); }
  });
  d.expenses.forEach(r => { const di = ymd(r.date); if (inRange(di, from, to) && !/denied|rejected|void/.test(low(r.status))) g(keyFor(di, pidOf(r), '')).costs += num(r.amt != null ? r.amt : r.amount); });
  d.jobs.forEach(p => { const di = ymd(p.contractDate || p.signedDate || p.startDate); if (num(p.contract) > 0 && inRange(di, from, to) && !isBidding(p)) { const x = g(keyFor(di, s(p.id), p.client)); x.newContracts += num(p.contract); x.jobsSold++; } });
  const rows = Object.keys(groups).sort().map(k => { const x = groups[k]; return { group: k, invoiced: r2(x.invoiced), collected: r2(x.collected), costs: r2(x.costs), grossProfit: r2(x.invoiced - x.costs), marginPct: x.invoiced > 0 ? Math.round((x.invoiced - x.costs) / x.invoiced * 1000) / 10 : null, newContracts: r2(x.newContracts), jobsSold: x.jobsSold }; });
  const tot = rows.reduce((t, x) => { ['invoiced', 'collected', 'costs', 'newContracts', 'jobsSold'].forEach(k => { t[k] = r2((t[k] || 0) + x[k]); }); return t; }, {});
  tot.grossProfit = r2((tot.invoiced || 0) - (tot.costs || 0));
  return { from, to, groupedBy: by, rows, totals: tot, notes: 'invoiced = client invoices dated in the period; collected = paid ones by paid date; costs = expenses + sub invoices; newContracts = jobs with a contract that started / were signed in the period' };
};
T.receivables = function(d, a){
  const today = todayStr(a.now), job = {}; d.jobs.forEach(p => { job[s(p.id)] = p; });
  let list = d.invoices.filter(isClientInv).filter(r => invBal(r) > 0).map(r => {
    const due = invDue(r), late = due && due < today ? daysBetween(due, today) : 0, p = job[pidOf(r)] || {};
    return { invoice: s(r.invNum || r.num || r.number) || ('INV-' + s(r.id).slice(-6)), job: s(p.name || r.projectName), jobId: pidOf(r), customer: s(r.client || p.client), pm: s(p.pm), date: invDate(r), due, balance: r2(invBal(r)), daysOverdue: late, status: s(r.status) };
  });
  if (a.overdue_only) list = list.filter(x => x.daysOverdue > 0);
  if (num(a.min_days)) list = list.filter(x => x.daysOverdue >= num(a.min_days));
  list.sort((x, y) => y.daysOverdue - x.daysOverdue || y.balance - x.balance);
  const b = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  list.forEach(x => { const k = x.daysOverdue <= 0 ? 'current' : x.daysOverdue <= 30 ? 'd1_30' : x.daysOverdue <= 60 ? 'd31_60' : x.daysOverdue <= 90 ? 'd61_90' : 'd90plus'; b[k] = r2(b[k] + x.balance); });
  return { asOf: today, total: r2(list.reduce((t, x) => t + x.balance, 0)), count: list.length, aging: b, invoices: cap(list, 60) };
};
T.find_jobs = function(d, a){
  const today = todayStr(a.now), q = low(a.query), st = low(a.status);
  let list = d.jobs.filter(p => {
    if (st === 'active' && !isActive(p)) return false;
    if (st === 'bidding' && !isBidding(p)) return false;
    if (st === 'complete' && !isDone(p)) return false;
    if (st && ['active', 'bidding', 'complete', 'all'].indexOf(st) < 0 && jobStatus(p).indexOf(st) < 0) return false;
    if (a.pm && !samePerson(p.pm, a.pm)) return false;
    if (a.type && low(jobType(p)).indexOf(low(a.type)) < 0) return false;
    if (q && [p.name, p.client, p.address, p.autoPO, p.id].map(low).join(' ').indexOf(q) < 0) return false;
    if (a.behind_schedule && !behind(p, today)) return false;
    return true;
  }).map(p => jobRow(d, p, today, false));
  const sort = a.sort_by || 'value';
  list.sort((x, y) => sort === 'margin' ? (num(x.marginPct) - num(y.marginPct)) : sort === 'end' ? s(x.end).localeCompare(s(y.end)) : (y.value - x.value));
  return { count: list.length, jobs: cap(list, num(a.limit) || 40) };
};
T.job_detail = function(d, a){
  const p = findJob(d, a.job); if (!p) return { error: 'No job matches "' + s(a.job) + '"' + (d.viewer.seesAll ? '' : ' among ' + d.viewer.name + '\'s jobs') + '.' };
  const today = todayStr(a.now), pid = s(p.id), row = jobRow(d, p, today, true);
  row.invoices = d.invoices.filter(r => pidOf(r) === pid).map(r => ({ kind: isClientInv(r) ? 'client' : isSubInv(r) ? 'sub' : s(r.type), number: s(r.invNum || r.num), who: s(r.client || r.sub || r.vendor), date: invDate(r), due: invDue(r), amount: r2(invAmt(r)), balance: r2(invBal(r)), status: s(r.status) })).slice(0, 40);
  row.changeOrders = d.cos.filter(c => pidOf(c) === pid).map(c => ({ title: s(c.title || c.desc || c.description || c.scope).slice(0, 120), amount: r2(coAmt(c)), status: s(c.status), date: ymd(c.date || c.createdAt) })).slice(0, 30);
  const cats = {}; d.expenses.filter(r => pidOf(r) === pid).forEach(r => { const k = s(r.category || r.cat) || 'Other'; cats[k] = r2((cats[k] || 0) + num(r.amt != null ? r.amt : r.amount)); });
  row.costsByCategory = cats;
  row.upcomingSchedule = d.schedule.filter(e => pidOf(e) === pid && ymd(e.date) >= today).sort((x, y) => s(x.date).localeCompare(s(y.date))).slice(0, 10).map(e => ({ date: ymd(e.date), title: s(e.title), who: s(e.assignee || e.vendor) }));
  row.recentNotes = arr(p.updates).slice(0, 6).map(u => ({ at: s(u.at || u.date).slice(0, 10), by: s(u.by), text: s(u.text).slice(0, 300) }));
  row.clientContact = { email: s(p.clientEmail), phone: s(p.clientPhone) };
  row.scope = s(p.scope || p.description).slice(0, 800);
  return row;
};
T.bids_due = function(d, a){
  const today = todayStr(a.now), days = Math.max(1, Math.min(120, num(a.days) || 14)), end = addDays(today, days);
  const open = l => !/won|lost|dead|converted|declined|no bid|not bidding/i.test(s(l.stage) + ' ' + s(l.status) + ' ' + s(l.bidStatus)) && !l.notBidding;
  const rows = d.leads.filter(open).map(l => ({ name: s(l.name || l.title), due: s(l.bidDue), dueTo: s(l.dueToCompany || l.gc), assigned: s(l.pm || l.estimator) || '(unassigned)', source: leadSourceOf(l), type: s(l.leadKind || l.type), estValue: num(l.estVal || l.estValue) || null, status: s(l.bidStatus || l.stage || l.status) }));
  const due = rows.filter(x => ymd(x.due) && ymd(x.due) >= today && ymd(x.due) <= end).sort((x, y) => s(x.due).localeCompare(s(y.due)));
  const past = rows.filter(x => ymd(x.due) && ymd(x.due) < today && /review|estimat/i.test(x.status)).slice(0, 10);
  return { asOf: today, window: days + ' days', due: cap(due, 50), pastDueStillOpen: past, noDueDate: rows.filter(x => !ymd(x.due) && /commercial|government/i.test(x.type)).length };
};
T.pm_workload = function(d, a){
  const today = todayStr(a.now), soon = addDays(today, 14), by = {};
  const P = n => by[n] || (by[n] = { pm: n, activeJobs: 0, activeValue: 0, biddingJobs: 0, behindSchedule: 0, openLeads: 0, bidsDue14d: 0, openTodos: 0, openAR: 0 });
  d.jobs.forEach(p => { const n = s(p.pm) || '(no PM)'; const x = P(n); if (isActive(p)) { x.activeJobs++; const m = jobMoney(d, p); x.activeValue = r2(x.activeValue + m.value); x.openAR = r2(x.openAR + m.openAR); if (behind(p, today)) x.behindSchedule++; } else if (isBidding(p)) x.biddingJobs++; });
  d.leads.forEach(l => { if (/won|lost|dead|converted/i.test(s(l.stage) + ' ' + s(l.status))) return; const n = s(l.pm || l.estimator) || '(unassigned)'; const x = P(n); x.openLeads++; if (ymd(l.bidDue) >= today && ymd(l.bidDue) <= soon) x.bidsDue14d++; });
  d.tasks.forEach(t => { if (t.done) return; const n = s(t.assignee); if (n) P(n).openTodos++; });
  return { asOf: today, people: Object.keys(by).map(k => by[k]).sort((x, y) => y.activeValue - x.activeValue) };
};
T.estimate_vs_actual = function(d, a){
  const today = todayStr(a.now);
  let jobs = a.job ? [findJob(d, a.job)].filter(Boolean) : d.jobs.filter(p => isActive(p) || isDone(p));
  const rows = jobs.map(p => { const m = jobMoney(d, p); return m.estimate ? { job: s(p.name), id: s(p.id), pm: s(p.pm), status: s(p.status), estCost: m.estimate.estCost, actualCost: m.costToDate, costVariance: m.estimate.costVariance, costUsedPct: m.estimate.costUsedPct, pctComplete: num(p.pct) || null, estMarginPct: m.estimate.estMarginPct, currentMarginPct: m.marginPct } : null; }).filter(Boolean);
  rows.sort((x, y) => num(y.costVariance) - num(x.costVariance));
  return { asOf: today, jobsWithEstimates: rows.length, jobsWithoutEstimate: jobs.length - rows.length, rows: cap(rows, 40), note: 'costUsedPct well above pctComplete = running over budget' };
};
T.leads_by_source = function(d, a){
  const { from, to } = period(a), by = {};
  d.leads.forEach(l => { const day = ymd(l.createdAt || l.date || l.created); if (!inRange(day, from, to)) return; const k = leadSourceOf(l); const x = by[k] || (by[k] = { source: k, leads: 0, won: 0, lost: 0, open: 0, estValue: 0 }); x.leads++; const st = s(l.stage) + ' ' + s(l.status) + ' ' + s(l.bidStatus); if (/won|converted/i.test(st) || l.pid || l.converted) x.won++; else if (/lost|dead|declin|no bid/i.test(st)) x.lost++; else x.open++; x.estValue = r2(x.estValue + num(l.estVal || l.estValue)); });
  d.jobs.forEach(p => { const day = ymd(p.created || p.createdAt || p.startDate); if (!inRange(day, from, to) || isBidding(p)) return; const k = leadSourceOf(p); const x = by[k] || (by[k] = { source: k, leads: 0, won: 0, lost: 0, open: 0, estValue: 0 }); x.soldJobs = (x.soldJobs || 0) + 1; x.soldValue = r2((x.soldValue || 0) + num(p.contract)); });
  const rows = Object.keys(by).map(k => Object.assign(by[k], { winRatePct: by[k].won + by[k].lost ? Math.round(by[k].won / (by[k].won + by[k].lost) * 100) : null })).sort((x, y) => y.leads - x.leads);
  return { from, to, rows };
};
T.get_estimate = function(d, a){
  const q = low(a.estimate || a.job);
  const p = a.job ? findJob(d, a.job) : null;
  const e = d.estimates.find(x => (p && (s(p.estimateId) === s(x.id) || pidOf(x) === s(p.id))) || low(x.id) === q || low(x.num) === q) || d.estimates.find(x => q && low(x.name).indexOf(q) >= 0);
  if (!e) return { error: 'No estimate found for "' + s(a.estimate || a.job) + '".' };
  const lines = arr(e.lines).concat(arr(e.items)).slice(0, 80).map(l => ({ cat: s(l.cat || l.category), desc: s(l.desc || l.name || l.description).slice(0, 140), qty: num(l.qty || l.q) || null, unit: s(l.unit || l.u), price: r2(num(l.charge || l.total || l.price || l.ext)) || null }));
  let scopeTxt = e.scope; if (typeof scopeTxt === 'object') scopeTxt = JSON.stringify(scopeTxt);
  return { id: s(e.id), num: s(e.num), name: s(e.name), customer: s(e.gc || e.client || e.customer), address: s(e.address), date: ymd(e.date), status: s(e.status),
    totalPrice: r2(num(e.totalCharge || e.total)), totalCost: r2(num(e.totalCost)), marginPct: num(e.margin) || null, tax: r2(num(e.taxAmt)), notes: s(e.notes).slice(0, 1200), scope: s(scopeTxt).slice(0, 1500), lines };
};
T.payroll_summary = function(d, a){
  if (!d.payroll) return { error: 'Payroll is admin-only.' };
  const { from, to } = period(a);
  const runs = d.payroll.runs.filter(r => inRange(ymd(r.payDate || r.date || r.weekEnding || r.periodEnd), from, to)).map(r => ({ date: ymd(r.payDate || r.date || r.weekEnding || r.periodEnd), status: s(r.status), gross: r2(num(r.gross || r.totalGross || r.total)), net: r2(num(r.net || r.totalNet)), employees: arr(r.lines || r.employees || r.items).length || null }));
  const hours = {}; d.payroll.timesheets.forEach(t => { const day = ymd(t.date || t.day || t.weekStart); if (!inRange(day, from, to)) return; const n = s(t.name || t.employee || t.user) || '?'; hours[n] = r2((hours[n] || 0) + num(t.hours || t.hrs || t.total)); });
  return { from, to, runs: cap(runs, 60), totalGross: r2(runs.reduce((t, r) => t + r.gross, 0)), hoursByPerson: hours };
};
T.search = function(d, a){
  const q = low(a.query); if (q.length < 2) return { error: 'Search for at least 2 letters.' };
  const hit = o => Object.keys(o).some(k => typeof o[k] !== 'object' && low(o[k]).indexOf(q) >= 0);
  return { jobs: d.jobs.filter(hit).slice(0, 10).map(p => ({ id: s(p.id), name: s(p.name), client: s(p.client), status: s(p.status), pm: s(p.pm) })),
    leads: d.leads.filter(hit).slice(0, 10).map(l => ({ id: s(l.id), name: s(l.name), source: leadSourceOf(l), stage: s(l.stage || l.status), assigned: s(l.pm) })),
    customers: d.customers.filter(hit).slice(0, 10).map(c => ({ name: s(c.name || c.company), email: s(c.email), phone: s(c.phone) })) };
};

/* ── tool definitions for Claude (payroll only offered to admins) ─────────── */
const OBJ = (props, req) => ({ type: 'object', properties: props, required: req || [], additionalProperties: false });
const STR = (d) => ({ type: 'string', description: d });
const DEFS = [
  { name: 'overview', description: 'Today\'s snapshot of the business the person can see: active jobs and value, open and overdue receivables, bids due this week, jobs behind schedule, new leads, open to-dos. Start here for broad questions.', input_schema: OBJ({}) },
  { name: 'money_by_period', description: 'Money in a date range: invoiced, collected, costs, gross profit, margin, new contracts — grouped by month, week, job_type, pm, customer or lead_source. Use for revenue / profit / "how much did we make" questions.', input_schema: OBJ({ from: STR('YYYY-MM-DD, default Jan 1 this year'), to: STR('YYYY-MM-DD, default today'), group_by: { type: 'string', enum: ['month', 'week', 'job_type', 'pm', 'customer', 'lead_source'] } }) },
  { name: 'receivables', description: 'Accounts receivable: every open client invoice with balance, due date and days overdue, plus aging buckets.', input_schema: OBJ({ overdue_only: { type: 'boolean' }, min_days: { type: 'number', description: 'only invoices at least this many days overdue' } }) },
  { name: 'find_jobs', description: 'List jobs with contract value, invoiced, collected, cost to date, margin and behind-schedule flag. Filter by status (active|bidding|complete|all), pm, type, text, or behind_schedule.', input_schema: OBJ({ status: STR('active | bidding | complete | all'), pm: STR('PM name'), type: STR('job type text'), query: STR('name / customer / address / PO text'), behind_schedule: { type: 'boolean' }, sort_by: { type: 'string', enum: ['value', 'margin', 'end'] }, limit: { type: 'number' } }) },
  { name: 'job_detail', description: 'Everything on one job: money, estimate vs actual, invoices, change orders, costs by category, upcoming schedule, recent notes, customer contact, scope. Use before drafting anything about a specific job.', input_schema: OBJ({ job: STR('job id, PO, or part of its name / customer / address') }, ['job']) },
  { name: 'bids_due', description: 'Bids / leads with a bid due date in the next N days (who it is due to, who has it), plus open bids already past due.', input_schema: OBJ({ days: { type: 'number', description: 'default 14' } }) },
  { name: 'pm_workload', description: 'Per person: active jobs and value, bidding jobs, jobs behind schedule, open leads, bids due in 14 days, open to-dos, open A/R.', input_schema: OBJ({}) },
  { name: 'estimate_vs_actual', description: 'Estimated cost vs actual cost to date per job (variance, % of budget used vs % complete, estimated vs current margin). Optionally one job.', input_schema: OBJ({ job: STR('optional job') }) },
  { name: 'leads_by_source', description: 'Leads by lead source in a date range: count, won, lost, open, win rate, estimated value, and jobs sold by source.', input_schema: OBJ({ from: STR('YYYY-MM-DD'), to: STR('YYYY-MM-DD') }) },
  { name: 'get_estimate', description: 'An estimate\'s line items, totals, scope and notes — for writing a proposal or scope write-up.', input_schema: OBJ({ job: STR('job'), estimate: STR('estimate id / number / name') }) },
  { name: 'search', description: 'Find jobs, leads and customers by any text.', input_schema: OBJ({ query: STR('text') }, ['query']) },
  { name: 'propose_action', description: 'Offer to DO something in the CRM. Nothing happens until the person taps "Do it" on the preview card. Types: todo (a to-do), approval_email (a customer e-mail put on the ✅ Approvals list, never sent directly), lead (a new lead), appointment (an entry on the schedule). Always explain the preview in your reply.',
    input_schema: OBJ({ type: { type: 'string', enum: ['todo', 'approval_email', 'lead', 'appointment'] }, summary: STR('one line: what will happen'), job: STR('job id or name, when it is about a job'),
      label: STR('todo: what to do'), assignee: STR('todo/appointment: person (default: me)'), due: STR('todo: YYYY-MM-DD'), note: STR('todo/lead/appointment: details'),
      to: STR('approval_email: customer e-mail address'), subject: STR('approval_email: subject'), body: STR('approval_email: the e-mail text'),
      name: STR('lead: customer / project name'), phone: STR('lead: phone'), email: STR('lead: e-mail'), address: STR('lead/appointment: address'), lead_type: { type: 'string', enum: ['residential', 'commercial', 'insurance', 'government'] },
      date: STR('appointment: YYYY-MM-DD'), time: STR('appointment: HH:MM 24h'), title: STR('appointment: title') }, ['type', 'summary']) }
];
const PAYROLL_DEF = { name: 'payroll_summary', description: 'ADMIN ONLY: payroll runs (gross / net) and timesheet hours by person in a date range.', input_schema: OBJ({ from: STR('YYYY-MM-DD'), to: STR('YYYY-MM-DD') }) };
function toolDefs(v){ return v.payroll ? DEFS.concat([PAYROLL_DEF]) : DEFS.slice(); }

/* run one tool; the answer is kept small (it goes back to Claude) */
function runTool(name, input, d, now){
  const a = Object.assign({}, input || {}, { now });
  if (name === 'payroll_summary' && !d.viewer.payroll) return { error: 'Payroll is admin-only — this person cannot see it.' };
  const f = T[name]; if (!f || name === 'propose_action') return { error: 'unknown tool ' + name };
  try { return f(d, a); } catch (e) { return { error: 'tool failed: ' + s(e && e.message) }; }
}
function clipJson(o, max){ let t = JSON.stringify(o); if (t.length <= max) return t; return t.slice(0, max) + '… [cut — ask for a narrower question]'; }

/* ── a proposal: checked and normalised (again at execute) ──────────────────── */
function proposal(input, d, now){
  const a = input || {}, type = s(a.type), id = 'BRP' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const p = a.job ? findJob(d, a.job) : null;
  if (a.job && !p) return { error: 'That job is not one ' + d.viewer.name + ' can see.' };
  const job = p ? { id: s(p.id), name: s(p.name), pm: s(p.pm) } : null;
  const me = d.viewer.name;
  const ok = x => Object.assign({ id, type, summary: s(a.summary).slice(0, 200), job, by: me, at: new Date(now || Date.now()).toISOString() }, x);
  if (type === 'todo') {
    if (!s(a.label)) return { error: 'A to-do needs a label.' };
    return ok({ fields: { label: s(a.label).slice(0, 200), note: s(a.note).slice(0, 1000), assignee: s(a.assignee) || me, due: ymd(a.due) } });
  }
  if (type === 'approval_email') {
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s(a.to))) return { error: 'An e-mail needs a valid "to" address.' };
    if (!s(a.body)) return { error: 'An e-mail needs a body.' };
    return ok({ fields: { to: low(a.to), subject: s(a.subject).slice(0, 200) || 'GrayCo Construction', body: s(a.body).slice(0, 8000) } });
  }
  if (type === 'lead') {
    if (!s(a.name)) return { error: 'A lead needs a name.' };
    return ok({ fields: { name: s(a.name).slice(0, 160), phone: s(a.phone), email: low(a.email), address: s(a.address).slice(0, 200), lead_type: ['residential', 'commercial', 'insurance', 'government'].indexOf(s(a.lead_type)) >= 0 ? s(a.lead_type) : 'residential', note: s(a.note).slice(0, 1000) } });
  }
  if (type === 'appointment') {
    if (!ymd(a.date)) return { error: 'An appointment needs a date (YYYY-MM-DD).' };
    return ok({ fields: { title: s(a.title || a.summary).slice(0, 120), date: ymd(a.date), time: /^\d{1,2}:\d{2}$/.test(s(a.time)) ? s(a.time).padStart(5, '0') : '08:00', assignee: s(a.assignee) || me, address: s(a.address) || (p ? s(p.address) : ''), note: s(a.note).slice(0, 1000) } });
  }
  return { error: 'Unknown action type.' };
}
/* may this person do this? (execute time, against the records as they are now) */
function allowed(prop, d){
  if (!prop || !prop.type) return 'Nothing to do.';
  if (prop.job && prop.job.id && !d.jobs.some(p => s(p.id) === s(prop.job.id))) return 'That job is not one you can see.';
  const f = prop.fields || {};
  if (!d.viewer.seesAll && (prop.type === 'todo' || prop.type === 'appointment') && f.assignee && !samePerson(f.assignee, d.viewer.name) && !prop.job) return 'Only an admin or the office can give someone else a to-do or appointment that is not on one of your jobs.';
  return '';
}

module.exports = { KEYS, PAYROLL_KEYS, viewerOf, scope, toolDefs, runTool, clipJson, proposal, allowed, findJob, jobMoney, behind, T, _h: { isClientInv, invBal, invDue, samePerson } };
