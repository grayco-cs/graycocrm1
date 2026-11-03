<script>
/* __GC_MSCONTAX__ — 🏛 MS contractor tax worksheet (patch MSCONTAX, owner 11/03: "account for ms contractor tax from all ms
   invoices in this little tax thing that we pay quarterly whether its a different deal or whatever").
   Payroll → 🏛 MS contractor tax (next to 🧾 Form 941). READ-ONLY: reads projects / invoices / estimates, writes nothing,
   sends nothing. A job is a Mississippi job by WHERE it is (job state, the estimate's job state, the address' state or zip,
   then a MS city name) — never by a per-deal flag — so prime, sub-to-a-GC, insurance, small and large jobs all land here.
   Miss. Code 27-65-21: 3.5% of the gross contract on contracts over $10,000; over $75,000 a Material Purchase
   Certificate + contractor's tax bond. A worksheet for the CPA, not a return. The pure core (MSTAX.compute) is run by
   tools/tests/test_MSCONTAX_fn.mjs in Node. */
(function(W){
'use strict';
if(W.__GC_MSCONTAX__) return; W.__GC_MSCONTAX__ = true;

var RATE = 0.035, THRESH = 10000, MPC_AT = 75000;
function s(v){ return v == null ? '' : String(v); }
function n2(v){ var x = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(x) ? x : 0; }
function r2(v){ return Math.round(v * 100 + (v >= 0 ? 1e-7 : -1e-7)) / 100; }
function arr(v){ return Array.isArray(v) ? v : []; }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function money(v){ var x = r2(n2(v)), neg = x < 0; x = Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (neg ? '-$' : '$') + x; }

var MS_CITIES = /\b(senatobia|hernando|southaven|olive branch|horn lake|walls|nesbit|byhalia|holly springs|tunica|robinsonville|tupelo|oxford|starkville|columbus|meridian|hattiesburg|gulfport|biloxi|jackson|clarksdale|batesville|corinth|greenville|vicksburg|natchez|pascagoula|laurel|desoto)\b/i;
var OTHER_ST = /\b(TN|AR|AL|GA|KY|MO|LA|TX|FL)\b|tennessee|arkansas|alabama|georgia|kentucky|missouri|louisiana/i;
function zipIsMS(z){ var m = s(z).match(/^\s*(\d{3})\d{2}(?:-\d{4})?\s*$/); if(!m) return false; var p = +m[1]; return p >= 386 && p <= 397; }
/* the zip at the END of an address ("…, Southaven, MS 38671" / "… 38671, USA") — not a house number */
function tailZip(t){ var m = s(t).replace(/,?\s*(USA|US|United States)\.?\s*$/i, '').match(/\b(\d{5})(?:-\d{4})?\s*$/); return m ? m[1] : ''; }
function stateOf(t){ var x = s(t).trim(); if(!x) return ''; if(/^(MS|miss\.?|mississippi)$/i.test(x)) return 'MS'; return x.toUpperCase().slice(0, 2); }

/* why a job counts as Mississippi ('' = it does not) */
function jobMsWhy(p, ests){
  p = p || {};
  var st = stateOf(p.state || p.jobState || p.addrState);
  if(st === 'MS') return 'job state MS';
  var e = arr(ests).filter(function(x){ return x && ((p.id && x.pid === p.id) || (x.id && (x.id === p.estimateId || x.id === p.estId))); });
  for(var i = 0; i < e.length; i++){
    if(stateOf(e[i].jobState) === 'MS' || stateOf(e[i].settings && e[i].settings.jobState) === 'MS' || stateOf(e[i].state) === 'MS') return 'estimate job state MS';
  }
  if(zipIsMS(p.zip)) return 'zip ' + s(p.zip).trim();
  var addr = [p.address, p.city, p.addr, p.jobAddress, p.location].filter(Boolean).join(', ');
  if(/\bMS\b/.test(addr) || /mississippi/i.test(addr)) return 'address says MS';
  var z = tailZip(p.address) || tailZip(addr); if(z && zipIsMS(z)) return 'address zip ' + z;
  if(st || OTHER_ST.test(addr) || (z && !zipIsMS(z))) return '';     /* a stated other state / zip wins over a city name */
  var c = (addr.match(MS_CITIES) || [])[0]; if(c) return 'MS city (' + c + ') — check';
  return '';
}

var NOT_CLIENT = /^(sub|supplier|vendor|expense|bill|payable)$/i;
var DEAD = /^(draft|void|voided|deleted|cancel+ed|rejected|denied)$/i;
function isClientInvoice(iv){ return !!iv && !iv.tombstoned && !iv.deleted && !iv._deleted && !NOT_CLIENT.test(s(iv.type).trim()) && !DEAD.test(s(iv.status).trim()); }
function invAmount(iv){ return r2(n2(iv.amt != null && iv.amt !== '' ? iv.amt : (iv.amount != null && iv.amount !== '' ? iv.amount : iv.total))); }
function lineAmt(l){ if(!l) return 0; if(l.amt != null || l.amount != null || l.total != null) return n2(l.amt != null ? l.amt : (l.amount != null ? l.amount : l.total)); return n2(l.qty || 1) * n2(l.rate || l.price || l.unitPrice); }
var TAXRX = /contractor'?s?\s*tax|\bms\s*(contractor'?s?\s*)?tax|mississippi.*tax|3\.5\s*%\s*(ms|contractor)/i;
/* the MS tax already on the invoice: a separate amount / line (collected), only mentioned, or none */
function taxOnInvoice(iv){
  var amt = n2(iv.msTax || iv.msContractorTax || iv.contractorTax);
  if(amt > 0) return { how:'separate amount', collected:r2(amt) };
  var t = 0, hit = false;
  arr(iv.lines).forEach(function(l){ if(l && TAXRX.test(s(l.desc || l.description || l.name))){ hit = true; t += lineAmt(l); } });
  if(hit && t > 0) return { how:'tax line', collected:r2(t) };
  if(hit || TAXRX.test(s(iv.desc) + ' ' + s(iv.notes) + ' ' + s(iv.memo))) return { how:'mentioned (no amount)', collected:0 };
  if(iv._msTaxApplied === true) return { how:'built into prices', collected:0 };
  return { how:'', collected:0 };
}

function qInfo(year, q){ var m1 = (q - 1) * 3 + 1, endM = m1 + 2, last = new Date(Date.UTC(year, endM, 0)).getUTCDate();
  return { year:year, q:q, from:year + '-' + pad(m1) + '-01', to:year + '-' + pad(endM) + '-' + pad(last), dueDate:(q === 4 ? (year + 1) + '-01-20' : year + '-' + pad(endM + 1) + '-20') }; }
function lastEndedQuarter(today){ var y = +today.slice(0, 4), m = +today.slice(5, 7), q = Math.floor((m - 1) / 3); return q === 0 ? { year:y - 1, q:4 } : { year:y, q:q }; }
function dOf(v){ return s(v).slice(0, 10); }
function paidDateOf(iv){ return dOf(iv.paidDate || iv.paidAt || (/^paid$/i.test(s(iv.status)) ? (iv.paidOn || '') : '')); }

/* in: { projects, invoices, estimates, year, q, basis:'invoiced'|'paid' } */
function compute(o){
  var Q = qInfo(o.year, o.q), basis = o.basis === 'paid' ? 'paid' : 'invoiced';
  var projs = arr(o.projects), ests = arr(o.estimates), byId = {}, why = {};
  projs.forEach(function(p){ if(p && p.id){ byId[p.id] = p; why[p.id] = jobMsWhy(p, ests); } });
  var invs = arr(o.invoices).filter(isClientInvoice);
  /* the contract size per job: contract (+ any change orders the caller added) or every invoice on it ever, whichever is bigger */
  var billed = {}; invs.forEach(function(iv){ var k = s(iv.pid); if(k) billed[k] = r2((billed[k] || 0) + invAmount(iv)); });
  var rows = [], jobs = {}, hasPaid = false;
  invs.forEach(function(iv){
    if(paidDateOf(iv)) hasPaid = true;
    var p = byId[s(iv.pid)] || null;
    var w = p ? why[p.id] : '';
    if(!w){ var own = jobMsWhy({ address:iv.address || iv.jobAddress || iv.projAddress, state:iv.jobState || iv.state }, []); if(own) w = 'invoice ' + own; }
    if(!w) return;
    var d = basis === 'paid' ? paidDateOf(iv) : dOf(iv.date || iv.sentDate || iv.createdAt);
    if(!d || d < Q.from || d > Q.to) return;
    var amt = basis === 'paid' ? r2(n2(iv.paidAmt) > 0 ? n2(iv.paidAmt) : invAmount(iv)) : invAmount(iv);
    var key = p ? p.id : ('inv:' + s(iv.id));
    var contract = p ? r2(Math.max(n2(p.contractWithCOs) || n2(p.contract || p.contractAmount || p.contractAmt || p.contractValue || p.value), billed[p.id] || 0)) : amt;
    var tx = taxOnInvoice(iv);
    var over10 = contract > THRESH;
    var row = { job:p ? s(p.name) : s(iv.desc || 'no job'), pid:p ? p.id : '', customer:s(iv.client || iv.customer || (p && (p.client || p.customer))),
      invNum:s(iv.invNum || iv.num || iv.number || iv.id), date:d, amount:amt, why:w, contract:contract, over10k:over10,
      taxDue:over10 ? r2(amt * RATE) : 0, taxHow:tx.how, collected:tx.collected,
      residential:!!(p && /residential|home|house/i.test(s(p.type || p.jobType))) };
    rows.push(row);
    var j = jobs[key] || (jobs[key] = { job:row.job, pid:row.pid, customer:row.customer, contract:contract, gross:0, taxDue:0, collected:0, invoices:0, why:w,
      needsMpc:contract > MPC_AT, mpc:s(p && (p.mpc || p.mpcNumber || p.materialPurchaseCert || p.materialPurchaseCertificate)), over10k:over10 });
    j.gross = r2(j.gross + amt); j.taxDue = r2(j.taxDue + row.taxDue); j.collected = r2(j.collected + row.collected); j.invoices++;
  });
  rows.sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.job < b.job ? -1 : 1); });
  var J = Object.keys(jobs).map(function(k){ return jobs[k]; }).sort(function(a, b){ return b.gross - a.gross; });
  var T = { gross:0, taxable:0, under10k:0, taxDue:0, collected:0, notCollected:0 };
  rows.forEach(function(r){ T.gross = r2(T.gross + r.amount); if(r.over10k) T.taxable = r2(T.taxable + r.amount); else T.under10k = r2(T.under10k + r.amount);
    T.taxDue = r2(T.taxDue + r.taxDue); T.collected = r2(T.collected + r.collected); });
  T.notCollected = r2(Math.max(0, T.taxDue - T.collected));
  return { quarter:Q, basis:basis, hasPaidDates:hasPaid, rows:rows, jobs:J, totals:T,
    mpcJobs:J.filter(function(j){ return j.needsMpc; }), weakJobs:J.filter(function(j){ return /check$/.test(j.why); }) };
}
function csv(R){
  var q = function(v){ v = s(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var L = [['Job', 'Customer', 'Invoice #', (R.basis === 'paid' ? 'Paid date' : 'Invoice date'), 'Amount', 'Contract size', 'Over $10k', 'MS tax 3.5%', 'MS tax on invoice', 'Collected', 'Why MS'].join(',')];
  R.rows.forEach(function(r){ L.push([r.job, r.customer, r.invNum, r.date, r.amount.toFixed(2), r.contract.toFixed(2), r.over10k ? 'yes' : 'no', r.taxDue.toFixed(2), r.taxHow || 'no', r.collected.toFixed(2), r.why].map(q).join(',')); });
  L.push(['TOTAL', '', '', '', R.totals.gross.toFixed(2), '', '', R.totals.taxDue.toFixed(2), '', R.totals.collected.toFixed(2), ''].map(q).join(','));
  return L.join('\n');
}
var MSTAX = { RATE:RATE, THRESH:THRESH, MPC_AT:MPC_AT, jobMsWhy:jobMsWhy, zipIsMS:zipIsMS, tailZip:tailZip, isClientInvoice:isClientInvoice,
  invAmount:invAmount, taxOnInvoice:taxOnInvoice, qInfo:qInfo, lastEndedQuarter:lastEndedQuarter, compute:compute, csv:csv, money:money };
W._gcMsTax = MSTAX;
if(typeof document === 'undefined') return;

/* ── the page (Payroll → 🏛 MS contractor tax) ─────────────────────────── */
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function canSee(){ try{ var p = W.__GC_PAY; return !!(p && p.isAdmin && p.isAdmin()); }catch(e){ return false; } }
function todayStr(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
var CARD = 'background:#fff;border:1px solid #dde5ef;border-radius:10px;padding:14px 16px;margin-bottom:12px;';
var TD = 'padding:6px 8px;border-bottom:1px solid #eef2f7;font-size:13px;vertical-align:top;';
var TH = TD + 'font-size:11px;color:#64748b;text-transform:uppercase;text-align:left;';
var BTN = 'padding:7px 12px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-weight:700;font-size:12px;margin-right:6px;';
var AMB = 'background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:9px 12px;margin:0 0 8px;font-size:12.5px;color:#92400e;';
var UI = { sel:null, basis:'invoiced' };
function data(){ var c = W._crm || {}; var e = W._gcEstimatesState || c.estimates || [];
  var pr = arr(c.projects).map(function(p){ if(!p || !p.id || !W._gcContractWithCOs) return p; try{ return Object.assign({}, p, { contractWithCOs:W._gcContractWithCOs(p.id) }); }catch(x){ return p; } });
  return { projects:pr, invoices:arr(c.invoices), estimates:arr(e) }; }
function tile(l, v, sub, col){ return '<div style="flex:1;min-width:150px;border:1px solid #e2e8f0;border-radius:9px;padding:10px 12px"><div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">' + esc(l) + '</div><div style="font-size:20px;font-weight:800;color:' + (col || '#0f172a') + '">' + v + '</div><div style="font-size:11px;color:#64748b">' + sub + '</div></div>'; }
function render(body){
  if(!body) return;
  if(!canSee()){ body.innerHTML = '<div style="' + CARD + '"><b>The MS contractor tax worksheet is for admins / owners only.</b></div>'; return; }
  if(!UI.sel) UI.sel = lastEndedQuarter(todayStr());
  var d = data(), R;
  try{ R = compute({ projects:d.projects, invoices:d.invoices, estimates:d.estimates, year:UI.sel.year, q:UI.sel.q, basis:UI.basis }); }
  catch(e){ body.innerHTML = '<div style="' + AMB + '">The MS tax worksheet could not be worked out: ' + esc(e && e.message) + '</div>'; return; }
  if(UI.basis === 'paid' && !R.hasPaidDates) { UI.basis = 'invoiced'; return render(body); }
  var q = R.quarter, T = R.totals, m = money;
  var opts = []; var ty = +todayStr().slice(0, 4); for(var y = ty; y >= ty - 2; y--) for(var k = 4; k >= 1; k--) opts.push([y, k]);
  var rows = R.rows.length ? R.rows.map(function(r){
      return '<tr data-mstax-row="1"><td style="' + TD + '">' + esc(r.job) + (r.residential ? ' <span style="font-size:11px;color:#b45309">(residential)</span>' : '') + '<div style="font-size:11px;color:#94a3b8">' + esc(r.why) + '</div></td><td style="' + TD + '">' + esc(r.customer) + '</td><td style="' + TD + '">' + esc(r.invNum) + '</td><td style="' + TD + 'white-space:nowrap">' + esc(r.date) + '</td>'
        + '<td style="' + TD + 'text-align:right">' + m(r.amount) + '</td><td style="' + TD + 'text-align:right">' + (r.over10k ? m(r.taxDue) : '<span style="color:#b45309" title="contract ' + esc(m(r.contract)) + ' is $10,000 or less">$0 (≤ $10k)</span>') + '</td>'
        + '<td style="' + TD + '">' + (r.taxHow ? ('✅ ' + esc(r.taxHow) + (r.collected ? ' ' + m(r.collected) : '')) : '<span style="color:#991b1b;font-weight:700">not on invoice</span>') + '</td></tr>'; }).join('')
    : '<tr><td colspan="7" style="' + TD + 'color:#475569">No invoices on Mississippi jobs ' + (R.basis === 'paid' ? 'paid' : 'dated') + ' in this quarter.</td></tr>';
  var mpc = R.mpcJobs.length ? '<div style="' + AMB + '" data-mstax-mpc="1">⚠ <b>Over $75,000 — Material Purchase Certificate + contractor’s tax bond needed:</b> ' + R.mpcJobs.map(function(j){ return esc(j.job) + ' (' + m(j.contract) + (j.mpc ? ', MPC ' + esc(j.mpc) : '') + ')'; }).join('; ') + '. The CRM has no field to record the MPC number yet — keep it with the job’s paperwork.</div>' : '';
  var weak = R.weakJobs.length ? '<div style="' + AMB + '">Counted only by a city name (no state or zip on the job) — check these are really in MS: ' + R.weakJobs.map(function(j){ return esc(j.job); }).join(', ') + '.</div>' : '';
  body.innerHTML = '<div data-mstax="1">'
    + '<div style="' + CARD + 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">'
      + '<div><div style="font-size:18px;font-weight:800">🏛 MS contractor tax worksheet — Q' + q.q + ' ' + q.year + '</div>'
      + '<div style="font-size:12px;color:#64748b">' + esc(q.from) + ' to ' + esc(q.to) + ' · every client invoice on a Mississippi job (by the job’s state, estimate, address state or zip — prime, sub-to-a-GC, insurance, any size) · 3.5% of gross on contracts over $10,000 (Miss. Code 27-65-21). <b>A worksheet, not a return — confirm with the CPA.</b> Nothing is saved, filed or sent.</div></div>'
      + '<div><select data-mstax-q style="padding:6px;border-radius:6px;border:1px solid #cbd5e1">' + opts.map(function(o){ return '<option value="' + o[0] + '-' + o[1] + '"' + (o[0] === q.year && o[1] === q.q ? ' selected' : '') + '>Q' + o[1] + ' ' + o[0] + '</option>'; }).join('') + '</select> '
      + (R.hasPaidDates ? '<select data-mstax-basis style="padding:6px;border-radius:6px;border:1px solid #cbd5e1;margin-right:6px"><option value="invoiced"' + (R.basis === 'invoiced' ? ' selected' : '') + '>by invoice date</option><option value="paid"' + (R.basis === 'paid' ? ' selected' : '') + '>by paid date</option></select>' : '')
      + '<button data-mstax-csv style="' + BTN + '">⬇ Download CSV</button></div></div>'
    + mpc + weak
    + '<div style="' + CARD + 'display:flex;flex-wrap:wrap;gap:10px">'
      + tile('MS gross', m(T.gross), R.rows.length + ' invoice(s) on ' + R.jobs.length + ' job(s)')
      + tile('MS tax 3.5%', m(T.taxDue), 'on ' + m(T.taxable) + (T.under10k ? (' · ' + m(T.under10k) + ' on jobs ≤ $10k not taxed') : ''), '#b45309')
      + tile('Already on invoices', m(T.collected), 'MS tax shown as its own amount')
      + tile('Not collected', m(T.notCollected), 'tax − amount on invoices', T.notCollected ? '#991b1b' : '#166534')
    + '</div>'
    + '<div style="' + CARD + 'overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:640px"><tr><th style="' + TH + '">Job</th><th style="' + TH + '">Customer</th><th style="' + TH + '">Invoice #</th><th style="' + TH + '">' + (R.basis === 'paid' ? 'Paid' : 'Date') + '</th><th style="' + TH + 'text-align:right">Amount</th><th style="' + TH + 'text-align:right">MS tax 3.5%</th><th style="' + TH + '">MS tax on invoice</th></tr>' + rows
    + '<tr><td colspan="4" style="' + TD + 'font-weight:800">Total</td><td style="' + TD + 'text-align:right;font-weight:800">' + m(T.gross) + '</td><td style="' + TD + 'text-align:right;font-weight:800">' + m(T.taxDue) + '</td><td style="' + TD + 'font-weight:800">' + m(T.collected) + '</td></tr></table>'
    + '<div style="font-size:11.5px;color:#64748b;margin-top:8px">"Built into prices" = the estimate added 3.5% inside the line prices, so no separate amount shows. On a job where GrayCo is the sub, the prime contractor usually owes the tax on the whole contract — the CPA decides; it is listed so nothing is missed.</div></div>'
    + '</div>';
  var qs = body.querySelector('[data-mstax-q]'); if(qs) qs.onchange = function(){ var v = qs.value.split('-'); UI.sel = { year:+v[0], q:+v[1] }; render(body); };
  var bs = body.querySelector('[data-mstax-basis]'); if(bs) bs.onchange = function(){ UI.basis = bs.value; render(body); };
  var cv = body.querySelector('[data-mstax-csv]'); if(cv) cv.onclick = function(){ try{ var b = new Blob([csv(R)], { type:'text/csv' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'GrayCo_MS_contractor_tax_Q' + q.q + '_' + q.year + '.csv'; a.click(); }catch(e){ alert('CSV failed: ' + (e && e.message)); } };
}
W._gcMsTaxRender = render;
})(window);
</script>
