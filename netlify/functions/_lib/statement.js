// netlify/functions/_lib/statement.js — patch ACCTFIX2: the CUSTOMER STATEMENT (owner: the office prints / e-mails a
// statement of account). Pure: build(data, opts) → the statement; html(st, brand) → the letterhead page (print / PDF /
// e-mail body). One builder for the screen, the PDF and the e-mail (office-board action 'statement').
//   · the customer's invoices (by job client / invoice client / the job asked for), payments (inv.payments[], else the paid
//     amount on its paid date), credits (credit memos / negative customer invoices);
//   · a date range: activity before "from" is the opening balance; the balance due is as of "to";
//   · aging of what is still open on "to": Current (not yet due) · 1–30 · 31–60 · 61–90 · 90+ days past due;
//   · NOTHING internal: no descriptions / notes / costs / margins — invoice number, date, job, amounts only.
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2(v){ return Math.round(num(v) * 100) / 100; }
function ymd(v){ const m = s(v).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; const u = s(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return u ? u[3] + '-' + ('0' + u[1]).slice(-2) + '-' + ('0' + u[2]).slice(-2) : ''; }
function nk(v){ return low(v).replace(/[^a-z0-9]+/g, ' ').trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function usd(n){ n = r2(n); return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function days(a, b){ return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
function addDays(d, n){ return new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }

function isCustomerInvoice(r){
  const ty = low(r.type);
  if (r.needsReview === true || r.reviewHold === true || ty === 'client-review') return false;
  if (/sub|vendor|bill|expense|cost|supplier/.test(ty)) return false;
  if (ty && !/client|customer|draw|progress|final|invoice|credit/.test(ty)) return false;
  if (!ty && (r.sub || r.subId || r.vendor)) return false;
  if (/draft|pm_review|void|deleted|declined|denied|cancel/.test(low(r.status))) return false;
  if (r._pmDenied === true || r.deleted === true) return false;
  return true;
}
function invNumber(r){ const n = s(r.invNum || r.num || r.number || r.docNumber || r.qbNum); if (n) return n.slice(0, 30); return s(r.po) ? 'INV-' + s(r.po) : 'INV-' + s(r.id).slice(-6); }
function invAmount(r){ return r2(r.amt != null ? r.amt : (r.amount != null ? r.amount : r.total)); }
function isPaid(r){ return (/paid/.test(low(r.status)) && !/unpaid|partial/.test(low(r.status))) || r.paidInFull === true || r.paid === true; }
function isCredit(r){ return /credit/.test(low(r.type)) || invAmount(r) < 0; }
/* the payments on one invoice: [{ date, amount, ref }] */
function paymentsOf(r){
  const amt = invAmount(r), list = arr(r.payments).map(function(p){ return { date: ymd(p.date || p.at || p.paidDate), amount: r2(p.amt != null ? p.amt : p.amount), ref: s(p.method || p.ref || 'Payment') }; }).filter(function(p){ return p.amount; });
  if (list.length) return list;
  if (isPaid(r)) return [{ date: ymd(r.paidDate || r.recvDate || r.date), amount: amt, ref: s(r.payMethod || r.paidMethod || 'Payment') }];
  const pd = num(r.amountPaid || r.paidAmount || (typeof r.paid === 'number' ? r.paid : 0));
  if (pd > 0) return [{ date: ymd(r.lastPaymentDate || r.paidDate || r.date), amount: r2(Math.min(pd, amt)), ref: 'Payment' }];
  if (r.openBalance != null && r.openBalance !== '' && num(r.openBalance) < amt) return [{ date: ymd(r.lastPaymentDate || r.paidDate || r.date), amount: r2(amt - num(r.openBalance)), ref: 'Payment' }];
  return [];
}
function dueOf(r){ return ymd(r.dueDate || r.due) || (ymd(r.date || r.sentDate) ? addDays(ymd(r.date || r.sentDate), 30) : ''); }

/* data: { invs | invoices, projects, customers }; opts: { customer, pid, from, to, today } */
function build(data, opts){
  opts = opts || {};
  const today = ymd(opts.today) || new Date().toISOString().slice(0, 10);
  const to = ymd(opts.to) || today, from = ymd(opts.from) || '';
  const P = arr(data.projects).filter(function(p){ return !p.deleted; });
  const job = opts.pid ? P.find(function(p){ return s(p.id) === s(opts.pid); }) : null;
  const custName = s(opts.customer) || s(job && (job.client || job.customer)) || '';
  const cn = nk(custName);
  const cust = arr(data.customers).find(function(c){ return cn && nk(c.name || c.company) === cn; }) || null;
  const jobsOf = job ? [job] : P.filter(function(p){ return cn && (nk(p.client || p.customer) === cn || (cust && s(p.customerId) && s(p.customerId) === s(cust.id))); });
  const jobIds = {}; jobsOf.forEach(function(p){ jobIds[s(p.id)] = p; });
  const seen = {}, invs = [];
  const all = arr(data.invs).concat(arr(data.invoices));
  all.forEach(function(r){
    const id = s(r.id); if (!id || seen[id]) return; seen[id] = 1;
    if (!isCustomerInvoice(r)) return;
    const pid = s(r.pid || r.projectId);
    if (job ? pid !== s(job.id) : !(jobIds[pid] || (cn && nk(r.client || r.customer) === cn))) return;
    invs.push(r);
  });
  const lines = [];
  invs.forEach(function(r){
    const p = jobIds[s(r.pid || r.projectId)] || P.find(function(x){ return s(x.id) === s(r.pid); }) || {};
    const d = ymd(r.date || r.sentDate || r.recvDate) || today, amt = invAmount(r), no = invNumber(r), jobName = s(p.name || p.address);
    if (isCredit(r)) { lines.push({ date: d, kind: 'Credit', ref: 'Credit memo ' + no, job: jobName, charge: 0, credit: Math.abs(amt), invId: s(r.id) }); return; }
    lines.push({ date: d, kind: 'Invoice', ref: 'Invoice #' + no, job: jobName, charge: amt, credit: 0, invId: s(r.id), due: dueOf(r) });
    paymentsOf(r).forEach(function(pm){ lines.push({ date: pm.date || d, kind: 'Payment', ref: 'Payment — invoice #' + no + (pm.ref && !/^payment$/i.test(pm.ref) ? ' (' + pm.ref + ')' : ''), job: jobName, charge: 0, credit: pm.amount, invId: s(r.id) }); });
  });
  lines.sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === 'Invoice' ? -1 : 1); });
  let opening = 0;
  lines.forEach(function(l){ if (from && l.date < from) opening = r2(opening + l.charge - l.credit); });
  let bal = opening; const rows = [];
  lines.forEach(function(l){ if ((from && l.date < from) || l.date > to) return; bal = r2(bal + l.charge - l.credit); rows.push(Object.assign({}, l, { balance: bal })); });
  /* aging: each invoice's balance open on "to" (charges up to "to" minus its payments up to "to") */
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 }, open = [];
  invs.forEach(function(r){
    if (isCredit(r)) return;
    const d = ymd(r.date || r.sentDate || r.recvDate) || today; if (d > to) return;
    const paid = paymentsOf(r).filter(function(p){ return !p.date || p.date <= to; }).reduce(function(a, p){ return a + p.amount; }, 0);
    const left = r2(invAmount(r) - paid); if (left <= 0.004) return;
    const due = dueOf(r) || d, late = days(due, to);
    const k = late <= 0 ? 'current' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'd90p';
    aging[k] = r2(aging[k] + left); open.push({ invId: s(r.id), ref: invNumber(r), date: d, due: due, daysLate: Math.max(0, late), open: left });
  });
  const credits = invs.filter(isCredit).filter(function(r){ const d = ymd(r.date) || today; return d <= to; }).reduce(function(a, r){ return a + Math.abs(invAmount(r)); }, 0);
  const totalOpen = r2(aging.current + aging.d30 + aging.d60 + aging.d90 + aging.d90p);
  const balanceDue = r2(Math.max(0, totalOpen - credits));
  const inRange = function(l){ return (!from || l.date >= from) && l.date <= to; };
  return {
    customer: { name: s(cust && (cust.name || cust.company)) || custName || s(job && job.client) || 'Customer', email: s(cust && cust.email) || s(job && (job.clientEmail || job.customerEmail || job.email)), address: s(cust && cust.address) || s(job && job.address) },
    job: job ? { id: s(job.id), name: s(job.name), address: s(job.address), po: s(job.autoPO) } : null,
    from: from, to: to, today: today, opening: r2(opening), rows: rows,
    invoiced: r2(rows.filter(inRange).reduce(function(a, l){ return a + l.charge; }, 0)),
    paid: r2(rows.filter(function(l){ return l.kind === 'Payment'; }).reduce(function(a, l){ return a + l.credit; }, 0)),
    credits: r2(rows.filter(function(l){ return l.kind === 'Credit'; }).reduce(function(a, l){ return a + l.credit; }, 0)),
    closing: r2(bal), balanceDue: balanceDue, aging: aging, open: open, invoiceCount: invs.length
  };
}

function niceDay(d){ try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } }
/* the letterhead page; brand = _lib/brand.js BRAND (+ address, logo URL) */
function html(st, brand){
  brand = brand || {}; const B = brand.BRAND || brand;
  const logo = s(brand.logo) || '', addr = s(brand.address) || '', mail = s(brand.email || B.email);
  const th = 'style="text-align:left;padding:6px 8px;border-bottom:2px solid #0F1D2F;font-size:12px;color:#334155"', thr = th.replace('text-align:left', 'text-align:right');
  const td = 'style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12.5px"', tdr = td.replace('padding:6px 8px', 'padding:6px 8px;text-align:right');
  const ag = st.aging;
  return '<div data-gc-statement="1" style="font-family:Inter,Arial,Helvetica,sans-serif;color:#14202E;max-width:760px;margin:0 auto;padding:18px">' +
    '<table style="width:100%;border-collapse:collapse"><tr><td style="vertical-align:top">' + (logo ? '<img src="' + esc(logo) + '" alt="' + esc(B.name || 'GrayCo') + '" style="height:64px">' : '<div style="font-size:22px;font-weight:800">' + esc(B.name || 'GrayCo Construction Services') + '</div>') +
    '<div style="font-size:11.5px;color:#475569;margin-top:4px;line-height:1.5">' + esc(B.legalName || B.name || '') + (addr ? '<br>' + esc(addr) : '') + '<br>' + esc(B.phone || '') + (mail ? ' · ' + esc(mail) : '') + (B.licenses ? '<br>' + esc(B.licenses) : '') + '</div></td>' +
    '<td style="vertical-align:top;text-align:right"><div style="font-size:24px;font-weight:800;color:#0F1D2F">STATEMENT</div><div style="font-size:12.5px;color:#334155;margin-top:4px;line-height:1.6">Statement date: <b>' + esc(niceDay(st.today)) + '</b><br>Period: ' + (st.from ? esc(niceDay(st.from)) : 'Beginning') + ' – ' + esc(niceDay(st.to)) + '</div>' +
    '<div style="margin-top:8px;display:inline-block;background:#0F1D2F;color:#fff;border-radius:8px;padding:8px 12px;font-size:13px">Balance due <b style="font-size:17px;color:#D4A017">' + usd(st.balanceDue) + '</b></div></td></tr></table>' +
    '<div style="margin:16px 0 10px;font-size:13px;line-height:1.5"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Bill to</div><b>' + esc(st.customer.name) + '</b>' + (st.customer.address ? '<br>' + esc(st.customer.address) : '') + (st.job ? '<br>Job: ' + esc(st.job.name) + (st.job.po ? ' (PO ' + esc(st.job.po) + ')' : '') : '') + '</div>' +
    '<table style="width:100%;border-collapse:collapse"><thead><tr><th ' + th + '>Date</th><th ' + th + '>Activity</th><th ' + th + '>Job</th><th ' + thr + '>Charges</th><th ' + thr + '>Payments / credits</th><th ' + thr + '>Balance</th></tr></thead><tbody>' +
    (st.from ? '<tr><td ' + td + '>' + esc(st.from) + '</td><td ' + td + ' colspan="2"><i>Opening balance</i></td><td ' + tdr + '></td><td ' + tdr + '></td><td ' + tdr + '>' + usd(st.opening) + '</td></tr>' : '') +
    (st.rows.length ? st.rows.map(function(l){ return '<tr data-kind="' + esc(l.kind) + '"><td ' + td + '>' + esc(l.date) + '</td><td ' + td + '>' + esc(l.ref) + '</td><td ' + td + '>' + esc(l.job) + '</td><td ' + tdr + '>' + (l.charge ? usd(l.charge) : '') + '</td><td ' + tdr + '>' + (l.credit ? usd(l.credit) : '') + '</td><td ' + tdr + '>' + usd(l.balance) + '</td></tr>'; }).join('') : '<tr><td ' + td + ' colspan="6">No activity in this period.</td></tr>') +
    '</tbody></table>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:14px"><tr>' + [['Current', ag.current], ['1–30 days', ag.d30], ['31–60 days', ag.d60], ['61–90 days', ag.d90], ['Over 90 days', ag.d90p], ['Balance due', st.balanceDue]].map(function(c, i){ return '<td style="border:1px solid #cbd5e1;padding:7px 8px;text-align:center;font-size:12px' + (i === 5 ? ';background:#0F1D2F;color:#fff' : '') + '"><div style="color:' + (i === 5 ? '#D4A017' : '#64748b') + ';font-size:10.5px;text-transform:uppercase">' + c[0] + '</div><b data-age="' + i + '">' + usd(c[1]) + '</b></td>'; }).join('') + '</tr></table>' +
    '<div style="margin-top:14px;font-size:12px;color:#334155;line-height:1.6">Please make checks payable to <b>' + esc(B.legalName || B.name || 'GrayCo Construction Services, LLC') + '</b>' + (addr ? ', ' + esc(addr) : '') + '. Questions about this statement: ' + esc(B.phone || '') + (mail ? ' · ' + esc(mail) : '') + '. Thank you for your business.</div></div>';
}
module.exports = { build, html, _t: { isCustomerInvoice, paymentsOf, invNumber } };
