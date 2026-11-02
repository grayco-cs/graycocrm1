// netlify/functions/maint-scheduled.js — patch X9: MAINTENANCE PLANS, once a day (netlify.toml; 13:20 UTC ≈ 8 AM Central).
// Owner 10/21: "always do maintenance contracts and try to sell those."
//   · a signed plan's visit coming up (21 days ahead): an office to-do (the visit is also on the CRM schedule, patch X9),
//     and a note to the PM — once per visit date;
//   · the yearly invoice: one ✅ Approvals item per plan year (kind maint_invoice: the PM, then an admin) — the first
//     year right after signing, then on each anniversary; it is sent with its PDF only once approved (portal-plus.js);
//   · selling: a residential job finished in the last 45 days with no plan → "Offer a maintenance plan" on the office
//     to-do for its PM (once per job).
// Netlify does not let anyone call a scheduled function by its URL in production; any other call must be an admin.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const M = require('./_lib/maint.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function usd(n){ return '$' + (Math.round(M.num(n) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function core(){ return require('./portal.js')._core; }
function px(){ return require('./portal-plus.js'); }
function isScheduled(event){ try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; } }
function addMonths(iso, n){ const d = new Date(iso); if (isNaN(d)) return null; d.setUTCMonth(d.getUTCMonth() + n); return d; }
function niceDay(d){ try { return new Date(s(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return s(d); } }
const DONE = /^(completed?|closed|paid|paid in full|finished|done|warranty|archived)$/i;

async function run(now){
  now = now || Date.now();
  const C = core(), A = await px()._x9.readAll();
  const out = { visits: 0, invoices: 0, offers: 0, reminders: 0, renewAsk: 0 };
  const today = new Date(now).toISOString().slice(0, 10);
  const TB = require('./_lib/maint-tab.js');
  let XV = {}; try { XV = await C.kvRead([TB.VISITS_KEY, TB.PORT_KEY]); } catch (e) {}
  const PORTS = {}; arr(XV[TB.PORT_KEY]).forEach(function(x){ if (x && x.id) PORTS[s(x.id)] = x; });
  const combos = {};   /* a portfolio with one combined invoice: its parts, by billing month */
  const batches = {};  /* monthly subscriptions, by month */
  for (const c of A.list) {
    if (c.status !== 'signed') continue;
    const p = C.findProject(A.data, c.pid); if (!p) continue;
    if ((p.importedHistory === true || p.noSend === true || p.historyOnly === true) || c.importedHistory === true) continue;   /* patch LCLEAN-H: no maintenance visits / invoices for history */
    const pm = C.pmOf(A.data, p), job = s(p.name) || 'the job';
    /* patch MAINTPLUS: the visit reminders come from the 🗓 Maintenance Schedule (below), not from here */
    /* the yearly invoice: year k is due at signedAt + k years (14 days early for k ≥ 1).
       patch MAINTPLANS: a twice-a-year / quarterly plan bills its share of the yearly price every 6 / 3 months (periods
       "1.1", "1.2", "2.1" …);
       every plan on a job has its own invoices. */
    const signed = s(c.signedAt); if (!signed || !(M.num(c.price) > 0)) continue;
    const bills = M.billsPerYear(c), step = 12 / bills, amount = bills === 12 ? M.monthlyOf(c) : Math.round(M.num(c.price) / bills * 100) / 100;
    for (let k = 0; k < 30 * bills; k++) {
      const due = addMonths(signed, step * k); if (!due) break;
      if (due.getTime() - (k ? 14 * 864e5 : 0) > now) break;
      const year = bills === 1 ? String(k + 1) : String(Math.floor(k / bills) + 1) + '.' + String(k % bills + 1);
      const label = bills === 1 ? 'year ' + year : 'year ' + year.split('.')[0] + ', part ' + (k % bills + 1) + ' of ' + bills;
      if (arr(c.invoices).some(function(v){ return s(v.year) === year; })) continue;
      if (k > 0 && due.getTime() < now - 60 * 864e5) continue;   /* never back-bill an old year by itself */
      if (Math.floor(k / bills) >= 1 && c.autoRenew === false) {   /* patch MAINTPLUS: no auto-renew OK → ask, never bill by itself (older plans: as before) */
        if (k % bills === 0 && await C.officeTodo('maint_renew_' + c.id + '_' + year, '🔁 Ask to renew — ' + s(c.planName) + ' · ' + job, 'The plan year ends ' + due.toISOString().slice(0, 10) + '. The customer did not choose auto-renew: call / e-mail them to renew, then quote it again on the job (🛠 Maintenance).')) out.renewAsk++;
        break;
      }
      const port = c.portfolioId && PORTS[s(c.portfolioId)] && PORTS[s(c.portfolioId)].combined ? PORTS[s(c.portfolioId)] : null;
      if (port) { const key = port.id + '|' + due.toISOString().slice(0, 7); (combos[key] = combos[key] || { port: port, month: due.toISOString().slice(0, 7), parts: [] }).parts.push({ contractId: c.id, year: year, amount: amount, planName: s(c.planName), job: job, period: due.toISOString().slice(0, 10) }); continue; }
      const to = s(p.clientEmail || p.customerEmail || p.email);
      const id = 'appr_mti_' + c.id + '_' + year.replace('.', '_'), period = due.toISOString().slice(0, 10) + ' – ' + addMonths(due.toISOString(), step).toISOString().slice(0, 10);
      const html = '<p>Hi ' + (s(p.client).split(/\s+/)[0] || 'there') + ',</p><p>Here is the invoice for ' + label + ' of your <b>' + s(c.planName) + '</b> (' + period + '): <b>' + usd(amount) + '</b>' + (bills > 1 ? ' (part ' + (k % bills + 1) + ' of ' + bills + ' of the ' + usd(c.price) + ' yearly price)' : '') + '. The invoice is attached.</p><p>Thank you for letting GrayCo take care of your home! Questions? Call ' + (pm ? pm.name : 'us') + ' or the office at 901-585-0944.</p>';
      if (bills === 12 && to) {   /* owner: monthly subscriptions → ONE approval a month for all of them */
        const mo = due.toISOString().slice(0, 7);
        (batches[mo] = batches[mo] || []).push({ contractId: c.id, year: year, amount: amount, period: period, to: to, job: job, planName: s(c.planName), subject: 'Your GrayCo maintenance plan invoice — ' + s(c.planName) + ', ' + mo, html: html.replace(/<b>[^<]*<\/b>\. The invoice/, '<b>' + usd(amount) + '</b> (your monthly subscription, ' + mo + '). The invoice') });
        continue;
      }
      let queued = false;
      if (to) queued = await C.queueApproval({ id: id, kind: 'maint_invoice', pid: c.pid, jobName: job, pm: pm, to: to, subject: 'Your GrayCo maintenance plan invoice — ' + s(c.planName) + ', ' + label, html: html,
        attachments: [{ name: 'Invoice PDF (made when approved)', kind: 'maint-pdf' }], meta: { contractId: c.id, planName: s(c.planName), year: year, amount: amount, period: period } });
      else queued = await C.officeTodo('maint_inv_noemail_' + c.id + '_' + year, '🧾 Bill the maintenance plan, ' + label + ' — ' + job, s(c.planName) + ' ' + usd(amount) + ' (' + period + '). No customer e-mail on file — send the invoice by hand.');
      if (queued) {
        await C.kvListUpdate(M.LIST_KEY, function(l){
          const i = l.findIndex(function(x){ return s(x.id) === s(c.id); }); if (i < 0 || arr(l[i].invoices).some(function(v){ return s(v.year) === year; })) return null;
          l[i].invoices = arr(l[i].invoices).concat([{ year: year, amount: amount, period: period, approvalId: to ? id : '', at: new Date(now).toISOString(), status: to ? 'waiting' : 'by hand' }]); l[i].updatedAt = new Date(now).toISOString();
          return { list: l, check: function(a){ return a.some(function(x){ return s(x.id) === s(c.id) && arr(x.invoices).some(function(v){ return s(v.year) === year; }); }); } };
        });
        out.invoices++;
      }
    }
  }
  for (const mo of Object.keys(batches)) {
    const parts = batches[mo], id = 'appr_mtib_' + mo + '_' + require('crypto').createHash('sha256').update(parts.map(function(x){ return x.contractId + ':' + x.year; }).sort().join('|')).digest('hex').slice(0, 10);
    const label = new Date(mo + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), total = Math.round(parts.reduce(function(t, x){ return t + x.amount; }, 0) * 100) / 100;
    const q = await C.queueApproval({ id: id, kind: 'maint_invoice', pid: '', jobName: 'Maintenance subscriptions', pm: null, to: parts.length + ' customers', title: '🧾 Send all ' + parts.length + ' subscription invoices for ' + label,
      subject: 'Send all ' + parts.length + ' subscription invoices for ' + label, html: '<p>Monthly maintenance subscription invoices for ' + label + ' (' + usd(total) + ' in all):</p><ul>' + parts.map(function(x){ return '<li>' + x.job + ' — ' + x.planName + ': ' + usd(x.amount) + ' → ' + x.to + '</li>'; }).join('') + '</ul><p>Approve once: each customer gets their own invoice (PDF) with the usual ways to pay.</p>',
      attachments: [{ name: parts.length + ' invoice PDFs (made when approved)', kind: 'maint-pdf' }], meta: { batch: true, month: mo, parts: parts, amount: total } });
    if (!q) continue;
    for (const x of parts) await C.kvListUpdate(M.LIST_KEY, function(l){ const i = l.findIndex(function(y){ return s(y.id) === s(x.contractId); }); if (i < 0 || arr(l[i].invoices).some(function(v){ return s(v.year) === x.year; })) return null;
      l[i].invoices = arr(l[i].invoices).concat([{ year: x.year, amount: x.amount, period: x.period, approvalId: id, batch: true, at: new Date(now).toISOString(), status: 'waiting' }]); return { list: l }; });
    out.invoices++;
  }
  /* patch MAINTPLUS: one combined invoice per portfolio and month (each part stays on its own plan) */
  for (const key of Object.keys(combos)) {
    const cb = combos[key], to = s(cb.port.email); if (!to) continue;
    const id = 'appr_mtic_' + s(cb.port.id).replace(/[^A-Za-z0-9_-]/g, '') + '_' + cb.month, total = Math.round(cb.parts.reduce(function(t, x){ return t + x.amount; }, 0) * 100) / 100;
    const html = '<p>Hi ' + (s(cb.port.contact).split(/\s+/)[0] || 'there') + ',</p><p>Here is the combined maintenance invoice for your properties (' + cb.month + '):</p><ul>' + cb.parts.map(function(x){ return '<li>' + x.job + ' — ' + x.planName + ': ' + usd(x.amount) + '</li>'; }).join('') + '</ul><p>Total: <b>' + usd(total) + '</b>. The invoice is attached.</p>';
    const q = await C.queueApproval({ id: id, kind: 'maint_invoice', pid: '', jobName: s(cb.port.name), pm: null, to: to, subject: 'Your GrayCo maintenance invoice — ' + s(cb.port.name) + ' (' + cb.month + ')', html: html,
      attachments: [{ name: 'Invoice PDF (made when approved)', kind: 'maint-pdf' }], meta: { combined: true, portfolioId: cb.port.id, parts: cb.parts, amount: total } });
    if (!q) continue;
    for (const x of cb.parts) await C.kvListUpdate(M.LIST_KEY, function(l){ const i = l.findIndex(function(y){ return s(y.id) === s(x.contractId); }); if (i < 0 || arr(l[i].invoices).some(function(v){ return s(v.year) === x.year; })) return null;
      l[i].invoices = arr(l[i].invoices).concat([{ year: x.year, amount: x.amount, approvalId: id, combined: true, at: new Date(now).toISOString(), status: 'waiting' }]); return { list: l }; });
    out.invoices++;
  }
  /* patch MAINTPLUS: the 🗓 MAINTENANCE SCHEDULE (gc_kv "gc_maint_visits"): a signed plan with no rows gets its year (older plans);
     1 month ahead → the person who SOLD the plan: a To-Do "Get <plan> at <property> done this month" + an e-mail, and the
     customer's "we'll be there" note on ✅ Approvals (maint_reminder); 14 days ahead and on the day → a To-Do for the PM */
  let visits = arr(XV[TB.VISITS_KEY]);
  for (const c of A.list) {
    if (c.status !== 'signed' || visits.some(function(v){ return s(v.contractId) === s(c.id); })) continue;
    const p = C.findProject(A.data, c.pid); if (!p || p.importedHistory === true || p.noSend === true || p.historyOnly === true) continue;
    const rows = TB.visitRows(c, p, c.nextVisit ? new Date(Date.parse(c.nextVisit + 'T12:00:00Z') - 864e5 * 182).toISOString() : c.signedAt).slice(0, 1).map(function(v){ return Object.assign(v, { date: s(c.nextVisit) || v.date, id: 'mv_' + c.id + '_' + (s(c.nextVisit) || v.date) }); });
    if (rows.length) { await C.kvListUpdate(TB.VISITS_KEY, function(l){ return l.some(function(v){ return s(v.contractId) === s(c.id); }) ? null : { list: l.concat(rows) }; }); visits = visits.concat(rows); }
  }
  const users = arr(A.data.users), mark = {};
  for (const v of visits) {
    if (v.status !== 'planned' || !/^\d{4}-\d{2}-\d{2}$/.test(s(v.date))) continue;
    const c = A.list.find(function(x){ return s(x.id) === s(v.contractId); }); if (!c || c.status !== 'signed') continue;
    const p = C.findProject(A.data, v.pid); if (!p || p.importedHistory === true || p.noSend === true || p.historyOnly === true) continue;
    const d = Date.parse(v.date + 'T12:00:00Z') - now, prop = s(v.property) || s(p.address) || s(p.name), pm = C.pmOf(A.data, p);
    if (d > 31 * 864e5 || d < -30 * 864e5) continue;
    const sb = s(c.soldBy || v.soldBy), seller = users.find(function(u){ return low(u.email) === low(sb) || low(u.name) === low(sb); }) || (pm ? { name: pm.name, email: pm.email } : null);
    if (d > 14 * 864e5 && !v.monthAt) {
      const ok = await C.officeTodo('maint_month_' + v.id, '🛠 Get ' + s(v.planName) + ' at ' + prop + ' done this month' + (seller ? ' (' + s(seller.name || seller.email) + ')' : ''), (v.oncall ? 'On call from ' : 'Due ') + niceDay(v.date) + '. Call the customer to set the time; when it is done: 🛠 Maintenance → 📝 Post visit update.');
      if (ok) { out.reminders++; mark[v.id] = { monthAt: new Date(now).toISOString() };
        if (seller && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(seller.email))) { try { await px()._x9.resendStaff({ to: seller.email, subject: 'This month: ' + s(v.planName) + ' at ' + prop, html: '<p>The ' + s(v.planName) + ' visit at <b>' + prop + '</b> is ' + (v.oncall ? 'on call from ' : 'due ') + niceDay(v.date) + '. You sold this plan — please get it done this month (🛠 Maintenance → Schedule).</p>' }); } catch (e) {} }
        const to = s(p.clientEmail || p.customerEmail || p.email);
        if (to && !v.oncall) await C.queueApproval({ id: 'appr_mtrm_' + v.id, kind: 'maint_reminder', pid: s(v.pid), jobName: s(p.name), pm: pm, to: to, subject: 'Your GrayCo maintenance visit — ' + s(v.planName),
          html: '<p>Hi ' + (s(p.client).split(/\s+/)[0] || 'there') + ',</p><p>Your <b>' + s(v.planName) + '</b> visit is coming up — we will be there around <b>' + niceDay(v.date) + '</b> and will call to set the time. Questions? Call 901-585-0944.</p>', meta: { visitId: v.id, contractId: c.id } });
      }
    }
    if (d <= 14 * 864e5 && d > 0 && !v.twoWeekAt) { if (await C.officeTodo('maint_visit14_' + v.id, '🛠 Maintenance visit ' + niceDay(v.date) + ' — ' + prop + (pm ? ' (' + pm.name + ')' : ''), s(v.planName) + ' — in 2 weeks. Call the customer to set the time.')) { out.visits++; mark[v.id] = Object.assign(mark[v.id] || {}, { twoWeekAt: new Date(now).toISOString() }); } }
    if (d <= 864e5 && !v.dueAt) { if (await C.officeTodo('maint_due_' + v.id, '🛠 Due today: ' + s(v.planName) + ' — ' + prop + (pm ? ' (' + pm.name + ')' : ''), 'The maintenance visit is due' + (d < -864e5 ? ' (overdue since ' + niceDay(v.date) + ')' : ' today') + '. Done? 🛠 Maintenance → 📝 Post visit update.')) { out.visits++; mark[v.id] = Object.assign(mark[v.id] || {}, { dueAt: new Date(now).toISOString() }); } }
  }
  if (Object.keys(mark).length) await C.kvListUpdate(TB.VISITS_KEY, function(l){ let n = 0; l.forEach(function(v, i){ if (mark[v.id]) { l[i] = Object.assign({}, v, mark[v.id]); n++; } }); return n ? { list: l } : null; });
  /* selling: finished residential jobs with no plan, once per job */
  const has = {}; A.list.forEach(function(c){ if (!/^(cancelled)$/.test(s(c.status))) has[s(c.pid)] = 1; });
  for (const p of arr(A.data.projects)) {
    if (!p || !p.id || has[s(p.id)] || !DONE.test(s(p.status)) || !M.eligible(p, A.settings)) continue;
    if (p.importedHistory === true || p.noSend === true || p.historyOnly === true) continue;   /* patch LCLEAN-H: no maintenance-plan offer for a history job */
    const at = Date.parse(p.completedAt || p.completionDate || p.endDate || p.closedAt || p.updatedAt || ''); if (!isFinite(at) || now - at > 45 * 864e5 || at > now + 864e5) continue;
    const pm = C.pmOf(A.data, p);
    const ok = await C.officeTodo('maint_offer_' + p.id, '🛠 Offer a maintenance plan — ' + s(p.name) + (pm ? ' (' + pm.name + ')' : ''),
      'This job is finished. Offer the customer a yearly plan (' + M.plansFor(p, A.settings).map(function(x){ return x.name; }).join(', ') + '): the job → 🛠 Maintenance → Quote, or they can ask in their portal (Home → Maintenance plans). Prices are set per home.');
    if (ok) out.offers++;
  }
  return out;
}

exports.handler = async function(event){
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!isScheduled(event)) {
    const who = await require('./bid-inbox.js')._test.staffAuth(event);
    if (!who.ok || !who.admin) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  }
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  if (isScheduled(event)) { const h = await require('./_lib/automations.js').gate('maint_plans'); if (h) return { statusCode: 200, headers, body: JSON.stringify(Object.assign({ ok: true }, h)) }; }   /* patch AUTOPANEL */
  try { const out = await run(); try { console.log('[maint-scheduled]', JSON.stringify(out)); } catch (e) {} return { statusCode: 200, headers, body: JSON.stringify(Object.assign({ ok: true }, out)) }; }
  catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Maintenance run failed: ' + (e && e.message || e) }) }; }
};
exports._run = run;
