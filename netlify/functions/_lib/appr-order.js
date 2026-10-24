// netlify/functions/_lib/appr-order.js — patch APPRORDER (owner, 10/24): "approvals for everyone need to be in order of
// importance, things that require asap attention need to always be at top and most recent things put into approvals
// need to show at top as well." The same tiers as the CRM's window._gcApprovalSort (index.html, gc-patch-approrder),
// for server lists such as the 7 AM approvals digest:
//   0 ASAP     — marked urgent · escalated · overdue · bid due within 24 h · a contract / signature work waits on ·
//                money stuck · an insurance / safety deadline within 4 h · a customer waiting 4+ work hours
//   1 Soon     — due within 3 days · anything that goes to a customer / GC (gc_approval_queue items) · a sub invoice
//   2 Routine  — the rest
// Inside a tier: newest first. tierOf(item, now) → { t, why, label }; sort(items, now) → a new sorted array.
'use strict';
const H = 3600e3, DAY = 24 * H;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function ms(v){ if (typeof v === 'number') return v > 1e11 ? v : 0; const t = Date.parse(s(v)); return isFinite(t) ? t : 0; }
function hrs(x){ x = Math.max(0, x); return x >= 48 * H ? Math.round(x / DAY) + ' days' : Math.max(1, Math.round(x / H)) + ' h'; }
function day(t){ try { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }); } catch (e) { return ''; } }
function workHours(a, b){
  if (!a || !b || b <= a) return 0;
  let n = 0, t = Math.max(a, b - 40 * DAY);
  while (t < b && n < 200) {
    const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'America/Chicago' })), wd = d.getDay(), h = d.getHours();
    if (wd > 0 && wd < 6 && h >= 8 && h < 17) n += Math.min(1, (b - t) / H);
    t += H;
  }
  return n;
}
const LABEL = ['🔴 ASAP', '🟠 Soon', '⚪ Routine'];
const STAFF_ONLY = /announcement|^mkt|social|news/;
function createdOf(x){ return ms(x.createdAt) || ms(x.submittedAt) || ms(x.created) || ms(x.enteredAt) || ms(x.at) || 0; }
function tierOf(x, now){
  x = x || {}; now = now || Date.now();
  const m = x.meta || {}, kind = low(x.kind), title = s(x.title), urg = low(m.urgency || x.urgency);
  const r = function(t, why){ return { t: t, why: why, label: LABEL[t] }; };
  if (urg === 'asap' || m.urgent === true || x.urgent === true || (Array.isArray(x.flags) && x.flags.some(function(f){ return /urgent/i.test(s(f)); }))) return r(0, 'Marked urgent');
  if (x.escalated) return r(0, 'Waiting over 24 h — the office can take it');
  const due = ms(m.dueAt) || ms(m.dueDate) || ms(x.dueAt) || ms(x.dueDate) || ms(x.due);
  if (due && due < now - H) return r(0, 'Overdue since ' + day(due));
  const bid = ms(m.bidDue) || ms(m.bidDueAt) || ms(x.bidDue);
  if (bid && bid > now && bid - now <= DAY) return r(0, 'Bid due in ' + hrs(bid - now));
  if (/sign_contract|^contract|contract_override|blocks?_?start/.test(kind) || m.blocksStart === true || /work can.?t start|override/i.test(title)) return r(0, 'Work can’t start until this is done');
  if (/final_invoice|payment_match|match_payment|deposit_match|check_sign|sign_check/.test(kind)) return r(0, 'Money waiting');
  const sla = ms(m.slaAt) || ms(x.slaAt);
  if (/sla|safety|mitig|claim|ins_/.test(kind) && sla && sla - now <= 4 * H) return r(0, sla < now ? 'Insurance / safety deadline passed' : 'Insurance / safety deadline in ' + hrs(sla - now));
  const made = createdOf(x);
  if (/reply|lead_first_contact|customer_message|cust_reply/.test(kind) && made && workHours(made, now) >= 4) return r(0, 'Customer waiting ' + Math.round(workHours(made, now)) + ' work hours');
  if (urg === 'soon' && kind !== 'portal_publish') return r(1, 'Needs a look soon');
  if (due && due - now <= 3 * DAY) return r(1, 'Due ' + day(due));
  if (kind === 'portal_publish') return r(1, 'Goes in the customer’s portal');
  if (kind === 'sub_invoice') return r(1, 'Sub pay list closes Wednesday');
  if (kind && !STAFF_ONLY.test(kind)) return r(1, x.channel === 'sms' ? 'Text to the customer' : 'Goes to the customer');
  return r(2, '');
}
function sort(items, now){
  now = now || Date.now();
  return (Array.isArray(items) ? items : []).map(function(x, i){ return { x: x, t: tierOf(x, now).t, c: createdOf(x), i: i }; })
    .sort(function(a, b){ return (a.t - b.t) || (b.c - a.c) || (a.i - b.i); }).map(function(d){ return d.x; });
}
module.exports = { tierOf, sort, LABEL, workHours };
