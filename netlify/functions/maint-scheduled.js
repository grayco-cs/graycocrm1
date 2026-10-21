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
  const out = { visits: 0, invoices: 0, offers: 0 };
  const today = new Date(now).toISOString().slice(0, 10);
  for (const c of A.list) {
    if (c.status !== 'signed') continue;
    const p = C.findProject(A.data, c.pid); if (!p) continue;
    const pm = C.pmOf(A.data, p), job = s(p.name) || 'the job';
    /* the visit, 21 days ahead */
    if (c.nextVisit && Date.parse(c.nextVisit + 'T12:00:00Z') - now <= 21 * 864e5 && Date.parse(c.nextVisit + 'T12:00:00Z') - now > -30 * 864e5) {
      const ok = await C.officeTodo('maint_visit_' + c.id + '_' + c.nextVisit, '🛠 Maintenance visit ' + niceDay(c.nextVisit) + ' — ' + job,
        s(c.planName) + ' (signed ' + s(c.signedAt).slice(0, 10) + '). Call the customer to set the time' + (pm ? '; ' + pm.name + ' or the crew does the visit' : '') + '. When it is done: the job → 🛠 Maintenance → ✓ Visit done (the next one is planned by itself).');
      if (ok) out.visits++;
    }
    /* the yearly invoice: year k is due at signedAt + k years (14 days early for k ≥ 1) */
    const signed = s(c.signedAt); if (!signed || !(M.num(c.price) > 0)) continue;
    for (let k = 0; k < 30; k++) {
      const due = addMonths(signed, 12 * k); if (!due) break;
      if (due.getTime() - (k ? 14 * 864e5 : 0) > now) break;
      const year = String(k + 1);
      if (arr(c.invoices).some(function(v){ return s(v.year) === year; })) continue;
      if (k > 0 && due.getTime() < now - 60 * 864e5) continue;   /* never back-bill an old year by itself */
      const to = s(p.clientEmail || p.customerEmail || p.email);
      const id = 'appr_mti_' + c.id + '_' + year, period = due.toISOString().slice(0, 10) + ' – ' + addMonths(due.toISOString(), 12).toISOString().slice(0, 10);
      const html = '<p>Hi ' + (s(p.client).split(/\s+/)[0] || 'there') + ',</p><p>Here is the invoice for year ' + year + ' of your <b>' + s(c.planName) + '</b> (' + period + '): <b>' + usd(c.price) + '</b>. The invoice is attached.</p><p>Thank you for letting GrayCo take care of your home! Questions? Call ' + (pm ? pm.name : 'us') + ' or the office at 901-585-0944.</p>';
      let queued = false;
      if (to) queued = await C.queueApproval({ id: id, kind: 'maint_invoice', pid: c.pid, jobName: job, pm: pm, to: to, subject: 'Your GrayCo maintenance plan invoice — year ' + year, html: html,
        attachments: [{ name: 'Invoice PDF (made when approved)', kind: 'maint-pdf' }], meta: { contractId: c.id, year: year, amount: M.num(c.price), period: period } });
      else queued = await C.officeTodo('maint_inv_noemail_' + c.id + '_' + year, '🧾 Bill the maintenance plan, year ' + year + ' — ' + job, s(c.planName) + ' ' + usd(c.price) + ' (' + period + '). No customer e-mail on file — send the invoice by hand.');
      if (queued) {
        await C.kvListUpdate(M.LIST_KEY, function(l){
          const i = l.findIndex(function(x){ return s(x.id) === s(c.id); }); if (i < 0 || arr(l[i].invoices).some(function(v){ return s(v.year) === year; })) return null;
          l[i].invoices = arr(l[i].invoices).concat([{ year: year, amount: M.num(c.price), period: period, approvalId: to ? id : '', at: new Date(now).toISOString(), status: to ? 'waiting' : 'by hand' }]); l[i].updatedAt = new Date(now).toISOString();
          return { list: l, check: function(a){ return a.some(function(x){ return s(x.id) === s(c.id) && arr(x.invoices).some(function(v){ return s(v.year) === year; }); }); } };
        });
        out.invoices++;
      }
    }
  }
  /* selling: finished residential jobs with no plan, once per job */
  const has = {}; A.list.forEach(function(c){ if (!/^(cancelled)$/.test(s(c.status))) has[s(c.pid)] = 1; });
  for (const p of arr(A.data.projects)) {
    if (!p || !p.id || has[s(p.id)] || !DONE.test(s(p.status)) || !M.eligible(p, A.settings)) continue;
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
  try { const out = await run(); try { console.log('[maint-scheduled]', JSON.stringify(out)); } catch (e) {} return { statusCode: 200, headers, body: JSON.stringify(Object.assign({ ok: true }, out)) }; }
  catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Maintenance run failed: ' + (e && e.message || e) }) }; }
};
exports._run = run;
