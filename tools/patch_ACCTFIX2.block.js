/* __GC_PATCH_ACCTFIX2__ — patch ACCTFIX2: THE BOOKS COUNT WHAT WAS APPROVED (owner / coordinator 11/02, from test_ACCTGATE).
   1. ONE RULE FOR "IS THIS A COST YET?" — window._gcCostGate(row) → 'ok' | 'pending' | 'denied':
        · denied: status denied / rejected / void / cancelled / deleted, rejected:true, its approval entry rejected, or an
          open "↩ Fix and resend" To-Do from ✕ Deny (gc_office_tasks _deny.key exp:<id> / sub:<id>) — out of every total;
        · pending: an expense still "pending" (or its approval entry pending_pm / escalated / needs_office_match), a sub
          invoice still "received" (its sub approval pending_pm) — shown apart as "⏳ Waiting for approval", not in cost;
        · everything else counts (approved, paid, posted, imported, typed in by the office, history …): no record changes.
        A register line that stands for a sub invoice / an expense (srcInvId SUB_<id> / EXPENSE_<id>) follows that record.
      window._gcCostCounts(row) = gate is 'ok'. Every place that adds up costs asks it: the accounting P&L (accrual and
      cash — _gcSpendRows), the dashboard / job "Spent" (_gcJobSpent / _gcTotalSpent / the job strip), job costing and
      budget alerts (X12, the To-Do over-budget alert, JC), the commission engine (_gcJobCostsSync / _gcJobExpenses),
      the expense inbox job P&L, the Projects screen cost and marketing's cost per job.
      window._gcCostPending(pid?) → { total, rows } — the "⏳ Waiting for approval $X" line on the job and the P&L.
   2. CARD REFUNDS / CREDITS take money OFF the job and the P&L: a negative row of type refund / credit (the card statement
      import saves them with direction 'in') is a cost credit, not money in — window._gcIsCostCredit(row).
   3. BANK DEPOSITS MATCH OPEN INVOICES — window._gcDepositMatch(deposits): the exact amount (open balance or total) AND the
      invoice # or the customer's name in the bank line, dated from 10 days before the invoice to 10 days after it was due
      → CERTAIN: on 💵 Payment matches (one tap: paid → A/R and cash move, the receipt goes); anything less → listed as
      "check by hand", never applied.
   4. 🧾 CUSTOMER STATEMENT — window._gcStatement.open({ customer, pid }): a date range, invoices / payments / credits, the
      balance due, aging (current · 1–30 · 31–60 · 61–90 · 90+) on the GrayCo letterhead (built by the server:
      office-board action 'statement'); 🖨 Print · 📄 PDF · ✉ Email to customer (ONE item on ✅ Approvals; quiet hours as
      every customer e-mail). From the customer's profile and the job's 🧰 Job tools. Office + admins. */
(function(){
'use strict';
if (window.__GC_PATCH_ACCTFIX2__) return; window.__GC_PATCH_ACCTFIX2__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout, RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2(v){ return Math.round(num(v) * 100) / 100; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ n = r2(n); return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function crm(){ return W._crm || {}; }
function ls(k){ try { return arr(JSON.parse(localStorage.getItem(k) || '[]')); } catch (e) { return []; } }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function ymd(v){ var m = s(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ''; }

/* ═══════════ 1. the gate ═══════════ */
var DEN = /^(denied|rejected|void|voided|cancell?ed|deleted|excluded|pm_denied)$/;
var OKST = /^(approved|paid|posted|auto_posted|invoiced|reconciled|recorded|scheduled|check_drafted|check_printed|partial|partially_paid|cleared|done|complete|completed)$/;
var PEND = /^(pending|pending_pm|pending_approval|needs_review|needs_office_match|submitted|waiting|escalated|awaiting_approval|in_review|review)$/;
var SUBPEND = /^(received|new|uploaded|pending|pending_pm|submitted|waiting|in_review|review|needs_review)$/;
var G = { at: 0, sig: '', exp: {}, sub: {}, deny: {}, inv: {}, ex: {} };
W.__gcCostGateVer = W.__gcCostGateVer || 1;
function refresh(){
  var now = Date.now(); if (now - G.at < 1500) return G; G.at = now;
  var ea = ls('gc_expense_approvals'), sa = ls('gc_sub_approvals'), ot = ls('gc_office_tasks');
  try { if (Array.isArray(crm().gc_expense_approvals)) ea = ea.concat(arr(crm().gc_expense_approvals)); } catch (e) {}
  var exp = {}, sub = {}, deny = {};
  ea.forEach(function(a){ var id = s(a.expId) || s(a.id).replace(/^expId:/, ''); if (id) exp[id] = low(a.status); });
  sa.forEach(function(a){ var id = s(a.invId) || s(a.id).replace(/^invId:/, ''); if (id) sub[id] = low(a.status); });
  ot.forEach(function(t){ var d = t._deny; if (!d || !d.key || t.done || t.completed) return; deny[s(d.key).replace(/#\d+$/, '')] = 1; });
  try { if (typeof W._gcDenyKept === 'function') arr(W._gcDenyKept()).forEach(function(t){ var d = t && t._deny; if (d && d.key && !t.done) deny[s(d.key)] = 1; }); } catch (e) {}
  var inv = {}, ex = {};
  arr(crm().invoices).concat(arr(crm().invs)).forEach(function(r){ var id = s(r.id); if (id && !inv[id]) inv[id] = r; });
  arr(crm().expenses).forEach(function(e){ var id = s(e.id || e._id); if (id) ex[id] = e; });
  var sig = JSON.stringify(exp).length + '|' + JSON.stringify(sub).length + '|' + Object.keys(deny).sort().join(',') + '|' + ea.length + '|' + sa.length;
  var sig2 = JSON.stringify([exp, sub]);
  if (sig2 + Object.keys(deny).join() !== G.sig) { G.sig = sig2 + Object.keys(deny).join(); W.__gcCostGateVer++; }
  G.exp = exp; G.sub = sub; G.deny = deny; G.inv = inv; G.ex = ex;
  return G;
}
function isSubInv(r){ return /^(sub|supplier)$/.test(low(r.type)); }
function subGate(iv){
  var g = refresh(), id = s(iv.id), st = low(iv.status), a = g.sub[id] || '';
  if (iv.rejected === true || iv._pmDenied === true || DEN.test(st)) return 'denied';
  if (g.deny['sub:' + id] || g.deny['inv:' + id]) return 'denied';
  if (OKST.test(st) || iv.paid === true) return 'ok';
  if (/^(approved|pm_approved|office_approved|auto_posted|posted|paid)$/.test(a)) return 'ok';
  if (/^(rejected|denied|pm_denied)$/.test(a)) return 'denied';
  if (SUBPEND.test(st) || /^(pending_pm|escalated|needs_office_match|pending)$/.test(a)) return 'pending';
  return 'ok';
}
function expGate(e){
  var g = refresh(), id = s(e.id || e._id), st = low(e.status), a = g.exp[id] || '';
  if (e.rejected === true || DEN.test(st)) return 'denied';
  if (id && g.deny['exp:' + id]) return 'denied';
  if (e.subInvId) { var iv = g.inv[s(e.subInvId)]; if (iv) return subGate(iv); }
  if (OKST.test(st)) return 'ok';
  if (/^(approved|auto_posted|posted)$/.test(a)) return 'ok';
  if (/^(rejected|denied|pm_denied)$/.test(a)) return 'denied';
  if (PEND.test(st) || /^(pending_pm|escalated|needs_office_match|pending)$/.test(a)) return 'pending';
  return 'ok';
}
W._gcCostGate = function(e){
  try {
    if (!e || typeof e !== 'object') return 'ok';
    var src = s(e.srcInvId);
    if (src && (e.__reg || /^(SUB|EXPENSE)_/.test(src))) {
      var g = refresh();
      if (/^SUB_/.test(src)) { var iv = g.inv[src.slice(4)]; if (iv) return subGate(iv); }
      else if (/^EXPENSE_/.test(src)) { var ex = g.ex[src.slice(8)]; if (ex) return expGate(ex); }
    }
    if (isSubInv(e) && !e.__reg) return subGate(e);
    return expGate(e);
  } catch (x) { return 'ok'; }
};
W._gcCostCounts = function(e){ return W._gcCostGate(e) === 'ok'; };
/* 2. a refund / credit on a cost (negative), not money coming in from a customer */
W._gcIsCostCredit = function(e){
  if (!e || typeof e !== 'object') return false;
  var a = num(e.amt != null ? e.amt : e.amount); if (!(a < 0)) return false;
  var ty = low(e.type), txt = low([e.desc, e.category, e.cat].join(' '));
  if (/^(payment|income|deposit|draw|client|customer|invoice)$/.test(ty) || /customer|client|draw|deposit|payment received|retainage|check from/.test(txt)) return false;
  return /^(refund|credit|vendorcredit|vendor_credit|return)$/.test(ty) || (/creditcard|credit ?card|card/.test(low(e.source) + ' ' + low(e.payMethod)) && /refund|credit|return/.test(txt));
};
/* ⏳ waiting for approval (not in cost): expenses + sub invoices (a sub invoice's own cost row counted once) */
W._gcCostPending = function(pid){
  var out = { total: 0, rows: [] }, seenSub = {};
  arr(crm().expenses).forEach(function(e){
    if (e.deleted || (pid && s(e.pid) !== s(pid))) return;
    var ty = low(e.type); if (/^(payment|mpo|cardpayment|income)$/.test(ty)) return;
    var a = num(e.amt != null ? e.amt : e.amount); if (!a) return;
    if (W._gcCostGate(e) !== 'pending') return;
    if (e.subInvId) seenSub[s(e.subInvId)] = 1;
    out.rows.push({ id: s(e.id), pid: s(e.pid), amt: r2(a), who: s(e.vendor || e.payee), kind: 'expense' }); out.total += a;
  });
  var seen = {};
  arr(crm().invoices).concat(arr(crm().invs)).forEach(function(r){
    var id = s(r.id); if (!id || seen[id]) return; seen[id] = 1;
    if (!isSubInv(r) || r.deleted || (pid && s(r.pid) !== s(pid)) || seenSub[id]) return;
    var a = num(r.amt != null ? r.amt : r.amount); if (!a) return;
    if (subGate(r) !== 'pending') return;
    out.rows.push({ id: id, pid: s(r.pid), amt: r2(a), who: s(r.sub || r.vendor), kind: 'sub invoice' }); out.total += a;
  });
  out.total = r2(out.total);
  return out;
};
/* the job's money strip: "⏳ Waiting for approval" next to Spent */
function wrapTiles(){
  var f = W._gcJobMoneyTiles; if (typeof f !== 'function' || f.__acctfix2) return;
  var w = function(j, kt, ue){
    var t = f.apply(this, arguments);
    try { var p = j && j.id ? W._gcCostPending(j.id) : null; if (p && p.total && Array.isArray(t)) { var i = t.findIndex(function(x){ return x && x.l === 'Spent'; }); t.splice(i < 0 ? t.length : i + 1, 0, { l: '⏳ Waiting for approval', v: typeof ue === 'function' ? ue(p.total) : money(p.total), c: '#b45309' }); } } catch (e) {}
    return t;
  };
  w.__acctfix2 = true; W._gcJobMoneyTiles = w;
}
RI.call(W, function(){ wrapTiles(); refresh(); }, 2000); ST.call(W, wrapTiles, 500);

/* ═══════════ 3. bank deposits → open invoices ═══════════ */
function nk(v){ return low(v).replace(/[^a-z0-9]+/g, ' ').trim(); }
function proj(id){ return arr(crm().projects).filter(function(p){ return s(p.id) === s(id); })[0] || null; }
function openInvs(){
  var seen = {}, out = [];
  arr(crm().invoices).concat(arr(crm().invs)).forEach(function(r){
    var id = s(r.id); if (!id || seen[id]) return; seen[id] = 1;
    var ty = low(r.type) || 'client'; if (!/client|customer|draw|progress|final|invoice/.test(ty) || /sub|supplier|vendor/.test(ty)) return;
    if (r.deleted || r.paid === true || /paid|void|cancel|draft|deleted|denied/.test(low(r.status)) && !/partial|unpaid/.test(low(r.status))) return;
    if (r.needsReview === true || ty === 'client-review') return;
    out.push(r);
  });
  return out;
}
function balOf(r){ if (r.openBalance != null && r.openBalance !== '') return num(r.openBalance); var a = num(r.amt != null ? r.amt : r.amount); return Math.max(0, a - num(typeof r.paid === 'number' ? r.paid : (r.amountPaid || r.paidAmount))); }
function hash(t){ var h = 0; t = s(t); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function addDays(d, n){ var t = Date.parse(d + 'T12:00:00Z'); return isFinite(t) ? new Date(t + n * 864e5).toISOString().slice(0, 10) : ''; }
/* deposits: [{ date, amount, desc }] → { certain: [match], unsure: [{ dep, cands, why }] } */
W._gcDepositMatch = function(deps){
  var invs = openInvs(), certain = [], unsure = [];
  arr(deps).forEach(function(dep){
    var amt = r2(dep.amount != null ? dep.amount : dep.amt), d = ymd(dep.date), desc = ' ' + nk(dep.desc || dep.payee) + ' ';
    if (!(amt > 0)) return;
    var byAmt = invs.filter(function(r){ return Math.abs(r2(balOf(r)) - amt) < 0.005 || Math.abs(r2(r.amt != null ? r.amt : r.amount) - amt) < 0.005; });
    if (!byAmt.length) return;
    var scored = byAmt.map(function(r){
      var p = proj(r.pid) || {}, why = [], no = nk(r.invNum || r.num || r.qbNum || r.number);
      if (no && no.length >= 3 && desc.indexOf(' ' + no + ' ') >= 0) why.push('invoice #');
      var nm = nk(r.client || r.customer || p.client).split(' ').filter(function(w){ return w.length > 2 && !/^(llc|inc|the|and|mr|mrs|co|company)$/.test(w); });
      if (nm.length && nm.some(function(w){ return desc.indexOf(' ' + w + ' ') >= 0; })) why.push('customer name');
      var start = addDays(ymd(r.date || r.sentDate) || d, -10), due = ymd(r.dueDate || r.due) || addDays(ymd(r.date || r.sentDate) || d, 30), end = addDays(due, 10);
      var inWin = !d || ((!start || d >= start) && (!end || d <= end));
      return { inv: r, why: why, inWin: inWin, due: due };
    });
    var sure = scored.filter(function(x){ return x.why.length && x.inWin; });
    if (sure.length === 1) {
      var x = sure[0], r = x.inv, p = proj(r.pid) || {}, key = 'BANKDEP-' + hash(d + '|' + amt.toFixed(2) + '|' + nk(dep.desc));
      certain.push({ id: 'pm_' + key + '_' + s(r.id), regId: key, noReg: true, invId: s(r.id), pid: s(r.pid), amt: amt, date: d, desc: s(dep.desc), score: 9, why: 'amount = ' + (Math.abs(r2(balOf(r)) - amt) < 0.005 ? 'balance' : 'invoice') + ' · ' + x.why.join(' · ') + ' · within 10 days of the invoice / due date (bank statement)',
        invNum: s(r.invNum || r.num || r.qbNum || r.id), client: s(r.client || p.client), status: 'new', source: 'bank-statement', at: new Date().toISOString() });
    } else unsure.push({ dep: { date: d, amount: amt, desc: s(dep.desc) }, cands: scored.map(function(x){ return { invId: s(x.inv.id), invNum: s(x.inv.invNum || x.inv.id), client: s(x.inv.client || (proj(x.inv.pid) || {}).client), why: x.why.join(' · ') || 'amount only', inWin: x.inWin }; }),
      why: sure.length > 1 ? 'more than one invoice fits' : (scored.some(function(x){ return x.why.length; }) ? 'outside 10 days of the invoice / due date' : 'the amount only — no invoice # or customer name in the bank line') });
  });
  return { certain: certain, unsure: unsure };
};
/* the bank import hands its deposits here: certain ones → 💵 Payment matches; the panel lists the rest */
W._gcDepositsFromStatement = function(rows){
  var deps = arr(rows).filter(function(r){ return r.dir === 'in' && (r.kind === 'deposit' || !r.kind); }).map(function(r){ return { date: r.date, amount: r.amount, desc: r.desc }; });
  var m = W._gcDepositMatch(deps);
  var addP = (m.certain.length && W._gcAUTAI && typeof W._gcAUTAI.addMatches === 'function') ? Promise.resolve(W._gcAUTAI.addMatches(m.certain)) : Promise.resolve(0);
  return addP.then(function(n){ m.added = n || 0; return m; }, function(){ m.added = 0; return m; });
};
W._gcDepositHtml = function(m){
  if (!m || (!m.certain.length && !m.unsure.length)) return '';
  return '<div data-c="depmatch" style="margin-top:10px;padding:10px 12px;border-radius:9px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-size:13px;line-height:1.5">' +
    (m.certain.length ? '<b>💵 ' + m.certain.length + ' deposit' + (m.certain.length === 1 ? '' : 's') + ' match an open invoice</b> — on 💵 Payment matches for one tap: ' + m.certain.map(function(x){ return money(x.amt) + ' ' + esc(x.date) + ' → #' + esc(x.invNum) + ' ' + esc(x.client); }).join(' · ') + '<br>' : '') +
    (m.unsure.length ? '<b>Check by hand (not applied):</b> ' + m.unsure.map(function(u){ return money(u.dep.amount) + ' ' + esc(u.dep.date) + ' "' + esc(u.dep.desc.slice(0, 50)) + '" — ' + esc(u.why) + (u.cands.length ? ' (could be #' + u.cands.slice(0, 3).map(function(c){ return esc(c.invNum) + ' ' + esc(c.client); }).join(', #') + ')' : ''); }).join(' · ') : '') + '</div>';
};

/* ═══════════ 4. 🧾 the customer statement ═══════════ */
function canStatement(){ try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; if (W._gcFullAccess && W._gcFullAccess()) return true; } catch (e) {} var u = {}; try { u = (W._gcMeUser && W._gcMeUser()) || {}; } catch (e) {} return /admin|owner|office/i.test(s(u.role) + ' ' + s(u.profile)) || low(u.payType) === 'owner'; }
function fnPost(body){ return W.fetch('/.netlify/functions/office-board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ j.__status = r.status; return j; }); }, function(e){ return { ok: false, error: 'No connection — ' + s(e && e.message) }; }); }
function printPage(html, title, pdf){
  var doc = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>@page{margin:14mm}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>' + html + '</body></html>';
  var w = W.open('', '_blank'); if (!w) { alert('The print window was blocked — allow pop-ups for the CRM.'); return false; }
  w.document.open(); w.document.write(doc); w.document.close();
  try { if (pdf) w.document.title = title; ST.call(W, function(){ try { w.focus(); w.print(); } catch (e) {} }, 400); } catch (e) {}
  return true;
}
function savePdf(html, title){
  function viaLib(){ var box = D.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff'; box.innerHTML = html; D.body.appendChild(box);
    return W.html2pdf().set({ margin: 10, filename: title + '.pdf', image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'letter' } }).from(box).save().then(function(){ box.remove(); return 'pdf'; }, function(){ box.remove(); return printPage(html, title, true) ? 'print' : ''; }); }
  if (W.html2pdf) return viaLib();
  return new Promise(function(res){
    var sc = D.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    sc.onload = function(){ viaLib().then(res); }; sc.onerror = function(){ res(printPage(html, title, true) ? 'print' : ''); };   /* no PDF tool: the print window (Save as PDF) */
    D.head.appendChild(sc);
  });
}
function openStatement(o){
  o = o || {};
  if (!canStatement()) { alert('Statements are for the office or an admin.'); return null; }
  var old = D.getElementById('gc-stmt-ov'); if (old) old.remove();
  var y0 = today().slice(0, 4) + '-01-01';
  var ov = D.createElement('div'); ov.id = 'gc-stmt-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(6,12,20,.82);overflow:auto;padding:14px;font-family:Inter,-apple-system,Arial,sans-serif';
  var B = 'border:1px solid #1d4ed8;border-radius:8px;padding:8px 12px;font-weight:700;font-size:13px;cursor:pointer;background:#fff;color:#1d4ed8';
  ov.innerHTML = '<div style="max-width:860px;margin:0 auto;background:#f8fafc;border-radius:14px;padding:14px;color:#0f172a">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:18px">🧾 Statement — ' + esc(o.customer || (proj(o.pid) || {}).client || 'customer') + '</b><button type="button" data-st="x" style="' + B + ';border-color:#334155;color:#334155">✕ Close</button></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0;font-size:13px">From <input type="date" data-st="from" value="' + y0 + '" style="padding:6px;border:1px solid #cbd5e1;border-radius:7px"> to <input type="date" data-st="to" value="' + today() + '" style="padding:6px;border:1px solid #cbd5e1;border-radius:7px">' +
    '<button type="button" data-st="show" style="' + B + '">🔄 Show</button><span style="flex:1"></span><button type="button" data-st="print" style="' + B + '">🖨 Print</button><button type="button" data-st="pdf" style="' + B + '">📄 PDF</button><button type="button" data-st="mail" style="' + B + ';background:#1d4ed8;color:#fff">✉ Email to customer</button></div>' +
    '<div data-st="msg" style="font-size:13px;min-height:18px;margin-bottom:6px"></div><div data-st="page" style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;min-height:120px">Loading…</div></div>';
  D.body.appendChild(ov);
  var q = function(k){ return ov.querySelector('[data-st="' + k + '"]'); }, cur = null;
  function body(extra){ return Object.assign({ action: 'statement', customer: s(o.customer), pid: s(o.pid), from: q('from').value, to: q('to').value }, extra || {}); }
  function msg(t, bad){ var m = q('msg'); m.textContent = t || ''; m.style.color = bad ? '#b91c1c' : '#166534'; }
  function load(){ msg(''); q('page').textContent = 'Loading…'; return fnPost(body()).then(function(j){ if (!j.ok) { cur = null; q('page').textContent = ''; msg(j.error || 'Could not build the statement.', true); return j; } cur = j; q('page').innerHTML = j.html; ov.__statement = j.statement; return j; }); }
  ov.addEventListener('click', function(ev){
    var t = ev.target.closest && ev.target.closest('[data-st]'); if (ev.target === ov) { ov.remove(); return; } if (!t) return;
    var a = t.getAttribute('data-st'), title = 'GrayCo Statement — ' + s((cur && cur.statement && cur.statement.customer.name) || o.customer) + ' — ' + q('to').value;
    if (a === 'x') ov.remove();
    else if (a === 'show') load();
    else if (a === 'print') { if (cur) printPage(cur.html, title); }
    else if (a === 'pdf') { if (cur) savePdf(cur.html, title).then(function(how){ msg(how === 'pdf' ? '📄 PDF saved.' : how === 'print' ? 'Pick "Save as PDF" in the print window.' : 'Could not make the PDF.', !how); }); }
    else if (a === 'mail') { t.disabled = true; msg('Putting it on ✅ Approvals…'); fnPost(body({ send: true })).then(function(j){ t.disabled = false;
      if (j.ok) { msg(j.already ? 'This statement is already waiting on ✅ Approvals.' : '✉ On ✅ Approvals — it goes to the customer once approved (customer e-mails wait for quiet hours).'); try { if (W._gcApprovalsRefresh) W._gcApprovalsRefresh(); } catch (e) {} }
      else msg(j.error || 'Not put on Approvals — try again.', true); }); }
  });
  ov.__ready = load();
  return ov;
}
W._gcStatement = { open: openStatement, print: printPage, pdf: savePdf };
/* the doors: the customer's profile, and the job's 🧰 Job tools */
function wrapProfile(){
  var f = W._gcOpenCustomerProfile; if (typeof f !== 'function' || f.__acctfix2) return;
  var w = function(idOrName){
    var r = f.apply(this, arguments);
    try { if (canStatement()) { var ovs = D.querySelectorAll('._gcSheetOv'), ov = ovs[ovs.length - 1]; var c = arr(crm().customers).filter(function(x){ return String(x.id) === String(idOrName); })[0]; var name = c ? (c.name || c.company) : s(idOrName);
      if (ov && !ov.querySelector('[data-acctstmt]')) { var b = D.createElement('button'); b.type = 'button'; b.setAttribute('data-acctstmt', name); b.textContent = '🧾 Statement'; b.style.cssText = 'margin:10px 16px 0;padding:9px 14px;border:none;border-radius:9px;background:#D4A017;color:#0F1D2F;font-weight:800;cursor:pointer;align-self:flex-start'; var hd = ov.children[0]; if (hd && hd.nextSibling) ov.insertBefore(b, hd.nextSibling); else ov.appendChild(b); } } } catch (e) {}
    return r;
  };
  Object.keys(f).forEach(function(k){ try { w[k] = f[k]; } catch (e) {} });
  w.__acctfix2 = true; W._gcOpenCustomerProfile = w;
}
function wrapDeco(){
  var f = W._gcMkt2Deco; if (typeof f !== 'function' || f.__acctfix2) return;
  var w = function(b){ var r = f.apply(this, arguments); try { if (b && !b.hasAttribute('data-field') && !b.querySelector('[data-mkt2="acctstmt"]') && canStatement()) { var pid = b.getAttribute('data-pid'); if (pid) { var x = D.createElement('span'); x.setAttribute('data-mkt2', 'acctstmt'); x.style.display = 'contents'; x.innerHTML = '<button type="button" data-acctstmt-pid="' + esc(pid) + '">🧾 Customer statement</button>'; b.appendChild(x); } } } catch (e) {} return r; };
  Object.keys(f).forEach(function(k){ try { w[k] = f[k]; } catch (e) {} });
  w.__acctfix2 = true; W._gcMkt2Deco = w;
}
D.addEventListener('click', function(ev){
  var t = ev.target && ev.target.closest && ev.target.closest('[data-acctstmt],[data-acctstmt-pid]'); if (!t) return;
  ev.preventDefault(); ev.stopPropagation();
  if (t.hasAttribute('data-acctstmt-pid')) openStatement({ pid: t.getAttribute('data-acctstmt-pid') }); else openStatement({ customer: t.getAttribute('data-acctstmt') });
}, true);
RI.call(W, function(){ wrapProfile(); wrapDeco(); }, 2000); ST.call(W, function(){ wrapProfile(); wrapDeco(); }, 600);
try { console.log('[GC] ACCTFIX2: costs count once approved (_gcCostGate), refunds take money off, bank deposits match invoices, 🧾 customer statement'); } catch (e) {}
})();
