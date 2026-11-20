/*__GC_PATCH_PAYDETAIL__ (owner 11/20: "show on invoices where we can edit / add check number, how we paid etc. if the pdf isn't in
  the system").
  💳 Payment details on every invoice / bill row (desk Invoices: Client, Sub, Supplier — the row and its inline editor) and on the job
  page's invoice list. A light sheet at the side (white, no blocking cover) shows and edits: paid date, amount paid (partial allowed),
  method (the CRM's list: check / ACH / card / cash / Venmo / Zelle / Cash App / wire / other), check # / reference, paid from /
  deposited to, note, and 📎 the invoice PDF (attach / replace / view — the sub-invoice attach code and its store, gc_sub_pdfs).
  Not paid yet → the same sheet records the payment (what "Mark paid" writes). Saving writes the same places "Mark paid" / LUMPSUM
  write: the invoice (status / paid / paidDate / amountPaid / openBalance / checkNo / payMethod, payments[] when partial), the job's
  cost row (subInvId) and the register row upserted by srcInvId — one row, never a second. Each save keeps a history entry on the
  invoice (payHistory: who, when, old → new, and what it was before) and ↩ Undo puts the invoice, the cost row and the register
  row back. Admins + the office only (window._gcFullAccess — by role). Nothing is sent to anyone.
  API: window._gcPayDetail = { open, close, get, save, undo, canUse } */
(function(W, D){
'use strict';
if (W.__GC_PATCH_PAYDETAIL__) return; W.__GC_PATCH_PAYDETAIL__ = true;
var ST = function(f, ms){ return (W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, f, ms || 0); };
var SI = function(f, ms){ return (W.__GC_NATIVE_SETINTERVAL__ || W.setInterval).call(W, f, ms); };
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2(v){ return Math.round(num(v) * 100) / 100; }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(ch){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
function money(n){ var v = r2(n); return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function nowIso(){ return new Date().toISOString(); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function clone(v){ try { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }
function crm(){ return W._crm || {}; }
function invoices(){ var a = arr(crm().invoices); return a.length ? a : arr(crm().invs); }
function findInv(id){ return invoices().filter(function(r){ return String(r.id) === String(id); })[0] || null; }
function proj(pid){ if (!pid) return null; return arr(crm().projects).filter(function(p){ return String(p.id) === String(pid); })[0] || null; }

/* the CRM's payment methods (Expenses: cc / cash / check / venmo / zelle / cashapp / wire / ach / other) */
var METHODS = [['check', 'Check'], ['ach', 'ACH'], ['cc', 'Card'], ['cash', 'Cash'], ['venmo', 'Venmo'], ['zelle', 'Zelle'], ['cashapp', 'Cash App'], ['wire', 'Wire'], ['other', 'Other']];
var MLABEL = {}; METHODS.forEach(function(m){ MLABEL[m[0]] = m[1]; });
var REFLABEL = { cc: 'Card / last 4', cash: 'Reference (optional)', check: 'Check #', venmo: 'Venmo reference', zelle: 'Zelle reference', cashapp: 'Cash App reference', wire: 'Wire reference', ach: 'Bank / ACH reference', other: 'Reference' };
function methodKey(v){
  var t = low(v); if (!t) return '';
  if (MLABEL[t]) return t;
  if (/card|credit|debit|amex|visa/.test(t)) return 'cc';
  if (/ach|bank transfer|direct dep|eft/.test(t)) return 'ach';
  if (/cash ?app/.test(t)) return 'cashapp';
  for (var i = 0; i < METHODS.length; i++) if (t.indexOf(METHODS[i][0]) === 0 || t.indexOf(low(METHODS[i][1])) === 0) return METHODS[i][0];
  return 'other';
}

/* ═════════════ who may (by role) ═════════════ */
function canUse(){
  try { if (typeof W._gcFullAccess === 'function') return !!W._gcFullAccess(); } catch (e) {}
  try { if (typeof W._gcIsOfficeFull === 'function' && W._gcIsOfficeFull()) return true; } catch (e) {}
  try { if (typeof W.__gcAuthIsAdmin === 'function') return !!W.__gcAuthIsAdmin(); } catch (e) {}
  return false;
}
function myName(){
  var em = ''; try { em = low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) {}
  var me = null; try { me = typeof W._gcMeUser === 'function' ? W._gcMeUser() : null; } catch (e) {}
  var u = arr(crm().users).filter(function(x){ return em && low(x.email) === em; })[0];
  return s(u && u.name) || s(me && me.name) || em || 'office';
}

/* ═════════════ reading one invoice ═════════════ */
function isBill(r){ return /^(sub|supplier)$/.test(low(r && r.type)); }
function amtOf(r){ return num(r && (r.amt != null && r.amt !== '' ? r.amt : r.amount)); }
function payAmt(p){ return num(p && (p.amount != null && p.amount !== '' ? p.amount : p.amt)); }
function isPaid(r){ return low(r.status) === 'paid' || r.paid === true; }
function paidOf(r){
  var p = arr(r.payments);
  if (p.length) return r2(p.reduce(function(a, x){ return a + payAmt(x); }, 0));
  if (isPaid(r)) return amtOf(r);
  if (num(r.amountPaid) > 0) return r2(r.amountPaid);
  if (/partial/.test(low(r.status)) && r.openBalance != null && r.openBalance !== '') return r2(Math.max(0, amtOf(r) - num(r.openBalance)));
  return 0;
}
function invNo(r){ return s(r.invNum || r.num || r.number || r.qbNum); }
function kindText(r){ var t = low(r.type); return t === 'sub' ? (r.isSupplier || /supplier/.test(low(r.subType)) ? 'Bill' : 'Sub invoice') : t === 'supplier' ? 'Supplier bill' : 'Customer invoice'; }
/* what the sheet shows: the latest payment (its row in payments[] when there are rows, else the invoice's own fields) */
function get(id){
  var r = typeof id === 'object' ? id : findInv(id); if (!r) return null;
  var pays = arr(r.payments), last = pays.length ? pays[pays.length - 1] : null, A = amtOf(r), pd = paidOf(r);
  var info = r.payInfo && typeof r.payInfo === 'object' && !r.payInfo.none ? r.payInfo : null;
  var mk = last ? (methodKey(last.methodKey || last.method) || methodKey(info ? info.method : r.payMethod)) : (info ? methodKey(info.method) : methodKey(r.payMethod || r.paidVia));
  var ref = last ? s(last.checkNo || last.ref) : (info ? s(info.ref) : s(r.checkNo || r.paidCheckNo));
  if (!mk && ref && (last ? last.checkNo : r.checkNo || r.paidCheckNo)) mk = 'check';
  return {
    id: r.id, kind: kindText(r), bill: isBill(r), amount: A, paid: pd, open: r2(Math.max(0, A - pd)), status: s(r.status) || 'open', isPaid: isPaid(r),
    nPay: pays.length, lump: !!(last && last.lumpId),
    date: s(last ? (last.date || last.paidDate) : r.paidDate).slice(0, 10), amountPaid: last ? payAmt(last) : pd,
    method: mk, ref: ref, paidFrom: s(last ? last.paidFrom : info && info.paidFrom), note: s(last ? (last.payNote || last.note) : info && info.note),
    history: arr(r.payHistory)
  };
}

/* ═════════════ writing ═════════════ */
function setInv(f){ if (typeof W._setInvoices !== 'function') return false; W._setInvoices(function(l){ return f(Array.isArray(l) ? l : []); }); return true; }
function setExp(f){ if (typeof W._setExpenses === 'function') { W._setExpenses(function(l){ return f(Array.isArray(l) ? l : []); }); return true; } if (W._crm && Array.isArray(W._crm.expenses)) { W._crm.expenses = f(W._crm.expenses); return true; } return false; }
function reg(row){ try { if (typeof W._gcAddToRegister === 'function') return W._gcAddToRegister(row); } catch (e) {} }
function regDel(id){ try { if (typeof W._gcRemoveFromRegister === 'function') return W._gcRemoveFromRegister(id); } catch (e) {} }
function regRead(){
  var p; try { p = typeof W._gcAc === 'function' ? W._gcAc('gcAcctRegister') : null; } catch (e) { p = null; }
  return Promise.resolve(p).then(function(v){ return Array.isArray(v) ? v : arr(W._gcRegisterCache); }, function(){ return arr(W._gcRegisterCache); });
}
/* what this sheet writes on the invoice. Its own details (method, reference, paid from, note) live in ONE object, payInfo, written
   whole: the sync never lets a blank value replace a filled one, so a cleared text field would come back — a cleared payInfo is
   {none:true}, which is not blank. checkNo / paidDate / payMethod are the CRM's shared fields (Mark paid, LUMPSUM, the lists). */
var FIELDS = ['status', 'paid', 'paidDate', 'openBalance', 'amountPaid', 'checkNo', 'payMethod', 'payInfo', 'payments'];
function snap(r){ var o = {}; FIELDS.forEach(function(k){ o[k] = r[k] === undefined ? null : clone(r[k]); }); return o; }
/* a field that was not there is written back EMPTY (never deleted): the sync's union merge keeps a key one copy still has */
var EMPTY = { paid: false, payments: [], payInfo: { none: true } };
function unsnap(y, p){
  FIELDS.forEach(function(k){ if (p[k] === null || p[k] === undefined) { if (y[k] !== undefined || k === 'payInfo') y[k] = k in EMPTY ? clone(EMPTY[k]) : (k === 'openBalance' || k === 'amountPaid' ? null : ''); } else y[k] = clone(p[k]); });
  if (y.openBalance === null || y.amountPaid === null) { var A = amtOf(y), pd = paidOf(Object.assign({}, y, { amountPaid: 0, openBalance: '' })); if (y.amountPaid === null) y.amountPaid = pd; if (y.openBalance === null) y.openBalance = r2(Math.max(0, A - pd)); }
}
function view(d){ return { 'Paid date': d.date, 'Amount paid': d.amountPaid ? money(d.amountPaid) : '', 'Method': MLABEL[d.method] || d.method, 'Check # / ref': d.ref, 'Paid from': d.paidFrom, 'Note': d.note, 'Status': d.status }; }
function diff(a, b){ var A = view(a), B = view(b), out = []; Object.keys(A).forEach(function(k){ if (s(A[k]) !== s(B[k])) out.push({ f: k, from: s(A[k]), to: s(B[k]) }); }); return out; }
function regRow(r, full, d, cl){
  var ref = d.ref ? (d.method === 'check' ? ' #' : ' ') + d.ref : '';
  return { srcInvId: r.id, pid: r.pid, payee: cl ? (r.client || 'Client') : (r.sub || r.vendor || ''), desc: (cl ? 'Client Payment' : 'Sub Paid') + ': ' + (r.desc || r.po || '—') + ' — ' + low(MLABEL[d.method] || 'payment') + ref,
    po: r.po, amount: amtOf(r), amt: amtOf(r), category: cl ? 'Client Invoice' : 'Subcontractor', date: d.date, source: cl ? 'clientinvoice' : 'subinvoice', method: 'payment', direction: cl ? 'in' : 'out', isIncome: cl, status: 'paid' };
}
function putBack(e, v){ var z = Object.assign({}, e); ['status', 'paidDate', 'statusWas'].forEach(function(k){ if (v[k] === null || v[k] === undefined) { if (z[k] !== undefined) z[k] = ''; } else z[k] = v[k]; }); return z; }
/* a customer invoice's row before it is paid (what sending it writes) */
function invoicedRegRow(r){ return { srcInvId: r.id, pid: r.pid, type: 'income', category: 'Invoice', desc: r.desc || ('Invoice ' + r.id), amt: amtOf(r), amount: amtOf(r), date: s(r.sentDate || r.date), paidDate: '', status: 'invoiced' }; }
function unpaidRegRow(r){ return { srcInvId: r.id, pid: r.pid, payee: r.sub || r.vendor || '', desc: 'Sub Invoice: ' + (r.desc || r.po || '—'), po: r.po, amount: amtOf(r), amt: amtOf(r), category: 'Subcontractor', date: s(r.date), source: 'subinvoice', method: 'invoice', direction: 'out', isIncome: false, status: 'pending' }; }

/* save(id, {date, amount, method, ref, paidFrom, note, add}) — add:true = a new payment (the invoice still has money open);
   otherwise the latest payment is edited. Resolves {ok, entry} | {ok:false, error}. */
function save(id, f){
  if (!canUse()) return Promise.resolve({ ok: false, error: 'Only admins and the office can change payment details.' });
  var r = findInv(id); if (!r) return Promise.resolve({ ok: false, error: 'That invoice is not loaded.' });
  if (typeof W._setInvoices !== 'function') return Promise.resolve({ ok: false, error: 'Invoices are not ready on this screen yet — try again in a moment.' });
  f = f || {};
  var A = amtOf(r), before = get(r), pays = arr(r.payments).map(clone), amt = r2(f.amount), date = s(f.date).slice(0, 10), mk = methodKey(f.method) || 'check';
  var add = !!f.add || before.paid <= 0.004;
  if (!(amt > 0)) return Promise.resolve({ ok: false, error: 'Enter the amount paid.' });
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return Promise.resolve({ ok: false, error: 'Enter the date it was paid.' });
  var others = add ? before.paid : r2(before.paid - before.amountPaid), newPaid = r2(others + amt);
  if (newPaid > A + 0.004) return Promise.resolve({ ok: false, error: money(amt) + ' is more than the ' + money(A - others) + ' ' + (others > 0 ? 'still open' : 'on this invoice') + '.' });
  var last = pays.length ? pays[pays.length - 1] : null;
  if (!add && last && last.lumpId && Math.abs(payAmt(last) - amt) > 0.004) return Promise.resolve({ ok: false, error: 'This payment is part of a lump-sum payment — change its amount there (🗂 Lump-sum payments). Date, check # and the rest can be changed here.' });
  var full = newPaid >= A - 0.004, at = nowIso(), by = myName(), cl = !isBill(r);
  var d = { date: date, amountPaid: amt, method: mk, ref: s(f.ref).slice(0, 80), paidFrom: s(f.paidFrom).slice(0, 80), note: s(f.note).slice(0, 500) };
  var row = { amount: amt, amt: amt, date: date, method: mk, methodKey: mk, checkNo: mk === 'check' ? d.ref : '', ref: d.ref, paidFrom: d.paidFrom, payNote: d.note, note: d.note, by: by, at: at };
  var y = Object.assign({}, r);
  /* the payment rows: kept when there are some, started when a payment leaves money open (so its date is kept) */
  if (!add && last) { pays[pays.length - 1] = Object.assign({}, last, row, { editedBy: by, editedAt: at }); y.payments = pays; }
  else if (!add) { if (!full) y.payments = [Object.assign({ id: uid('PD_'), source: 'paydetail' }, row)]; }
  else if (add && (pays.length || !full || before.paid > 0.004)) {
    if (!pays.length && before.paid > 0.004) pays.push({ id: 'PRIOR_' + r.id, amt: before.paid, amount: before.paid, date: s(r.paidDate), method: methodKey(r.payMethodKey || r.payMethod) || 'earlier', checkNo: s(r.checkNo), source: 'prior', note: 'paid before', at: at });
    pays.push(Object.assign({ id: uid('PD_'), source: 'paydetail' }, row)); y.payments = pays;
  }
  if (full) { y.status = 'paid'; y.paid = true; y.paidDate = date; y.openBalance = 0; y.amountPaid = A; }
  else { y.status = 'partial'; y.paid = false; y.paidDate = ''; y.openBalance = r2(A - newPaid); y.amountPaid = newPaid; }
  y.payMethod = MLABEL[mk]; y.payInfo = { method: mk, ref: d.ref, paidFrom: d.paidFrom, note: d.note, by: by, at: at };
  y.checkNo = mk === 'check' ? d.ref : '';
  var after = get(y), changes = diff(before, after);
  if (!changes.length) return Promise.resolve({ ok: true, unchanged: true });
  return regRead().then(function(R){
    /* the register line that stands for this invoice: its own id, SUB_<id>, or (a bill) its cost row's line EXPENSE_<row> — the
       register posts the payment ONTO that line, so that is the one to put back on undo */
    var keys = [String(r.id), 'SUB_' + r.id].concat(isBill(r) ? arr(crm().expenses).filter(function(e){ return String(e.subInvId || '') === String(r.id); }).map(function(e){ return 'EXPENSE_' + e.id; }) : []);
    var cur = null; keys.some(function(k){ cur = R.filter(function(x){ return x && String(x.srcInvId) === k; })[0] || null; return !!cur; });
    var expPrev = {}, expNew = {};
    /* the job's cost row (bills): worked out from what is on screen, then written in one go */
    if (isBill(r)) arr(crm().expenses).forEach(function(e){
      if (String(e.subInvId || '') !== String(r.id) || /^(rejected|denied|void)$/.test(low(e.status))) return;
      var pv = { status: e.status === undefined ? null : e.status, paidDate: e.paidDate === undefined ? null : e.paidDate, statusWas: e.statusWas === undefined ? null : e.statusWas };
      if (full) { expPrev[e.id] = pv; expNew[e.id] = { status: 'paid', paidDate: date, statusWas: e.statusWas || (low(e.status) === 'paid' ? null : e.status) }; }
      else if (low(e.status) === 'paid') { expPrev[e.id] = pv; expNew[e.id] = { status: e.statusWas || 'approved', paidDate: null, statusWas: null }; }
    });
    var entry = { id: uid('PH'), at: at, by: by, kind: add ? 'record' : 'edit', changes: changes, prev: snap(r), regPrev: cur ? clone(cur) : null, expPrev: expPrev };
    y.payHistory = arr(r.payHistory).concat([entry]).slice(-30); y.updatedAt = at;
    var wasFull = isPaid(r);
    if (Object.keys(expNew).length) setExp(function(E){ return E.map(function(e){ return e && expNew[e.id] ? putBack(e, expNew[e.id]) : e; }); });
    setInv(function(L){ return L.map(function(x){ return x && String(x.id) === String(r.id) ? y : x; }); });
    if (r.pid) { if (full) reg(regRow(y, true, d, cl)); else if (wasFull) reg(cl ? invoicedRegRow(r) : unpaidRegRow(r)); }
    return { ok: true, entry: entry, invoice: y };
  });
}

/* ↩ undo the latest change: the invoice, its cost row and its register row as they were */
function undo(id, hid){
  if (!canUse()) return Promise.resolve({ ok: false, error: 'Only admins and the office can undo payment changes.' });
  var r = findInv(id); if (!r) return Promise.resolve({ ok: false, error: 'That invoice is not loaded.' });
  var H = arr(r.payHistory), live = H.filter(function(h){ return !h.undone && h.kind !== 'undo' && h.prev; }), e = live[live.length - 1];
  if (!e || (hid && e.id !== hid)) return Promise.resolve({ ok: false, error: 'Only the latest change can be undone.' });
  var at = nowIso(), by = myName(), y = Object.assign({}, r);
  unsnap(y, e.prev);
  var back = get(y);
  y.payHistory = H.map(function(h){ return h.id === e.id ? Object.assign({}, h, { undone: true, undoneBy: by, undoneAt: at }) : h; })
    .concat([{ id: uid('PH'), at: at, by: by, kind: 'undo', undid: e.id, changes: diff(get(r), back) }]).slice(-30);
  y.updatedAt = at;
  setInv(function(L){ return L.map(function(x){ return x && String(x.id) === String(r.id) ? y : x; }); });
  var ep = e.expPrev || {};
  if (Object.keys(ep).length) setExp(function(E){ return E.map(function(x){ return x && ep[x.id] ? putBack(x, ep[x.id]) : x; }); });
  /* the register line as it was — with a new stamp (or the sync keeps the newer paid copy), and after the register's duplicate
     check has re-read the list (it holds what it read for 4 s, and the line as it was then would look like money already there) */
  if (r.pid) ST(function(){ if (e.regPrev) reg(Object.assign({}, e.regPrev, { updatedAt: nowIso(), savedAt: nowIso() })); else { regDel(r.id); regDel('SUB_' + r.id); } }, 4500);
  return Promise.resolve({ ok: true, undid: e.id });
}

/* a note in the history when the PDF is attached / replaced (not undoable: the old file is kept by no one) */
function notePdf(id, from, to){
  var r = findInv(id); if (!r) return;
  var y = Object.assign({}, r); y.payHistory = arr(r.payHistory).concat([{ id: uid('PH'), at: nowIso(), by: myName(), kind: 'pdf', changes: [{ f: 'Invoice PDF', from: s(from), to: s(to) }] }]).slice(-30);
  setInv(function(L){ return L.map(function(x){ return x && String(x.id) === String(id) ? y : x; }); });
}
function pdfOf(id){
  var p; try { p = W.idbGet ? W.idbGet('gc_sub_pdfs') : null; } catch (e) { p = null; }
  return Promise.resolve(p).then(function(v){ if (!v || typeof v !== 'object') { try { v = JSON.parse(localStorage.getItem('gc_sub_pdfs') || '{}'); } catch (e) { v = {}; } } var x = v && v[id]; return x && x.data ? { name: s(x.name) || 'invoice.pdf', at: s(x.at), by: s(x.by) } : null; }, function(){ return null; });
}

/* ═════════════ the sheet ═════════════ */
var CSS = '#gc-pd{position:fixed;top:64px;right:12px;width:400px;max-width:calc(100vw - 24px);max-height:calc(100vh - 80px);overflow:auto;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.16);z-index:100250;font:13px/1.45 Inter,Arial,sans-serif;padding:14px 16px}' +
  '#gc-pd h3{margin:0;font-size:15px;flex:1}#gc-pd .hd{display:flex;align-items:center;gap:8px;margin-bottom:4px}#gc-pd .sub{color:#64748b;font-size:12px;margin:0 0 10px}' +
  '#gc-pd .chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#f1f5f9;color:#334155}#gc-pd .chip.paid{background:#dcfce7;color:#166534}#gc-pd .chip.partial{background:#fef9c3;color:#854d0e}' +
  '#gc-pd label{display:block;font-size:11px;font-weight:600;color:#475569;margin:8px 0 3px}#gc-pd input,#gc-pd select,#gc-pd textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:7px 9px;font:13px Inter,Arial,sans-serif;background:#fff;color:#0f172a}' +
  '#gc-pd .g2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}#gc-pd button{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;font-size:12.5px;min-height:34px}' +
  '#gc-pd button.ok{background:#16a34a;border-color:#16a34a;color:#fff}#gc-pd button.x{border:0;font-size:16px;padding:2px 8px;min-height:0}#gc-pd button:disabled{opacity:.5;cursor:default}' +
  '#gc-pd .box{border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin:10px 0;background:#f8fafc}#gc-pd .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}' +
  '#gc-pd .msg{font-size:12px;margin-top:6px}#gc-pd .bad{color:#b91c1c}#gc-pd .good{color:#15803d}#gc-pd .warn{color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px 8px;font-size:12px;margin:8px 0}' +
  '#gc-pd .hist{font-size:12px;color:#334155;border-top:1px solid #f1f5f9;padding:5px 0}#gc-pd .hist s{color:#94a3b8}#gc-pd .tabs{display:flex;gap:6px;margin:4px 0 2px}#gc-pd .tabs button.on{background:#f1f5f9;border-color:#94a3b8}' +
  '.gc-pd-btn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;cursor:pointer;margin-left:4px;white-space:nowrap;font-family:inherit}' +
  '@media (max-width:600px){#gc-pd{top:auto;bottom:0;right:0;left:0;width:auto;max-width:none;max-height:85vh;border-radius:14px 14px 0 0}}';
function css(){ if (D.getElementById('gc-pd-css')) return; var st = D.createElement('style'); st.id = 'gc-pd-css'; st.textContent = CSS; (D.head || D.documentElement).appendChild(st); }
var UI = null;
function close(){ var el = D.getElementById('gc-pd'); if (el) el.remove(); UI = null; }
function open(id, opt){
  css(); close();
  var el = D.createElement('div'); el.id = 'gc-pd'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Payment details');
  D.body.appendChild(el);
  UI = { id: String(id), el: el, add: !!(opt && opt.add), pdf: null };
  el.addEventListener('click', onClick); el.addEventListener('change', onChange);
  draw(); loadPdf();
  return el;
}
function loadPdf(){ var u = UI; if (!u) return Promise.resolve(); return pdfOf(u.id).then(function(p){ if (UI !== u) return; u.pdf = p; var b = u.el.querySelector('[data-pd="pdfbox"]'); if (b) b.innerHTML = pdfHtml(); }); }
function pdfHtml(){
  var p = UI.pdf;
  return '<b>📎 Invoice PDF</b> ' + (p ? '<span data-pd="pdfname">' + esc(p.name) + '</span>' + (p.at ? ' <span style="color:#64748b">· ' + esc(p.at.slice(0, 10)) + (p.by ? ' · ' + esc(p.by) : '') + '</span>' : '') : '<span style="color:#64748b" data-pd="pdfname">none attached</span>') +
    '<div class="row" style="margin-top:6px"><button type="button" data-pd="attach">' + (p ? '📎 Replace PDF' : '📎 Attach PDF') + '</button>' + (p ? '<button type="button" data-pd="viewpdf">👁 View PDF</button>' : '') + '</div>';
}
function draw(){
  var u = UI; if (!u) return;
  var r = findInv(u.id), el = u.el;
  if (!canUse()) { el.innerHTML = '<div class="hd"><h3>💳 Payment details</h3><button type="button" class="x" data-pd="close" aria-label="Close">✕</button></div><p class="msg bad" data-pd="refused">Only admins and the office can see or change payment details.</p>'; return; }
  if (!r) { el.innerHTML = '<div class="hd"><h3>💳 Payment details</h3><button type="button" class="x" data-pd="close" aria-label="Close">✕</button></div><p class="msg bad">That invoice is not loaded.</p>'; return; }
  var d = get(r), p = proj(r.pid) || {}, add = u.add || d.paid <= 0.004;
  var who = d.bill ? s(r.sub || r.vendor) : s(r.client || p.client);
  var chip = '<span class="chip ' + (d.isPaid ? 'paid' : d.paid > 0 ? 'partial' : '') + '">' + (d.isPaid ? 'PAID' : d.paid > 0 ? 'PARTLY PAID' : esc(d.status.toUpperCase())) + '</span>';
  var f = add ? { date: today(), amountPaid: d.open, method: 'check', ref: '', paidFrom: d.paidFrom, note: '' } : d;
  var warn = '';
  if (add && d.bill && typeof W._gcSubPayCheck === 'function') { try { var ck = W._gcSubPayCheck(r.id); if (ck && ck.ok === false && arr([]).concat(ck.problems || []).length) warn = '<div class="warn">⚠ ' + esc([].concat(ck.problems).join(' · ')) + ' — record it only if it was really paid.</div>'; } catch (e) {} }
  var opts = METHODS.map(function(m){ return '<option value="' + m[0] + '"' + (f.method === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('');
  var H = d.history.slice().reverse(), live = d.history.filter(function(h){ return !h.undone && h.kind !== 'undo' && h.prev; }), lastId = live.length ? live[live.length - 1].id : '';
  var hist = H.length ? H.slice(0, 12).map(function(h){
    var what = h.kind === 'undo' ? '↩ undid a change' : h.kind === 'record' ? 'recorded a payment' : h.kind === 'pdf' ? 'PDF' : 'edited';
    return '<div class="hist" data-pd-h="' + esc(h.id) + '">' + (h.undone ? '<s>' : '') + '<b>' + esc(s(h.at).slice(0, 10)) + ' ' + esc(s(h.at).slice(11, 16)) + '</b> · ' + esc(h.by) + ' · ' + what + ': ' +
      arr(h.changes).map(function(c){ return esc(c.f) + ' ' + esc(c.from || '—') + ' → ' + esc(c.to || '—'); }).join('; ') + (h.undone ? '</s> (undone)' : '') +
      (h.id === lastId ? ' <button type="button" data-pd="undo" data-hid="' + esc(h.id) + '" style="min-height:0;padding:1px 8px;font-size:11px">↩ Undo</button>' : '') + '</div>';
  }).join('') : '<div class="hist" style="color:#94a3b8">No changes yet.</div>';
  el.innerHTML = '<div class="hd"><h3>💳 Payment details</h3><button type="button" class="x" data-pd="close" aria-label="Close">✕</button></div>' +
    '<p class="sub">' + esc(d.kind) + (invNo(r) ? ' #' + esc(invNo(r)) : '') + ' · ' + esc(who || '—') + '<br>' + esc(s(p.name) || 'no job') + (r.po || p.autoPO ? ' · PO ' + esc(r.po || p.autoPO) : '') + '<br>' +
      '<b>' + money(d.amount) + '</b> · paid ' + money(d.paid) + ' · open ' + money(d.open) + ' ' + chip + '</p>' +
    (d.paid > 0.004 && d.open > 0.004 ? '<div class="tabs"><button type="button" data-pd="mode" data-v="edit"' + (add ? '' : ' class="on"') + '>✏️ Edit last payment</button><button type="button" data-pd="mode" data-v="add"' + (add ? ' class="on"' : '') + '>＋ Record another payment</button></div>' : '') +
    (add ? '<p class="sub" style="margin:6px 0 0">' + (d.paid > 0.004 ? 'Record another payment on this invoice.' : 'Not paid yet — record the payment (same as Mark paid; less than the full amount = partly paid).') + '</p>' : '') + warn +
    '<div class="g2"><div><label for="gc-pd-date">Paid date</label><input type="date" id="gc-pd-date" data-pd-f="date" value="' + esc(f.date) + '"></div>' +
    '<div><label for="gc-pd-amt">Amount paid</label><input type="number" step="0.01" min="0" id="gc-pd-amt" data-pd-f="amount" value="' + esc(f.amountPaid ? r2(f.amountPaid) : '') + '"' + (!add && d.lump ? ' disabled title="Part of a lump-sum payment — change the amount there"' : '') + '></div>' +
    '<div><label for="gc-pd-m">Method</label><select id="gc-pd-m" data-pd-f="method">' + opts + '</select></div>' +
    '<div><label for="gc-pd-ref" data-pd="reflabel">' + esc(REFLABEL[f.method] || 'Check # / reference') + '</label><input id="gc-pd-ref" data-pd-f="ref" value="' + esc(f.ref) + '" autocomplete="off"></div></div>' +
    '<label for="gc-pd-from">' + (d.bill ? 'Paid from (account)' : 'Deposited to (account)') + '</label><input id="gc-pd-from" data-pd-f="paidFrom" list="gc-pd-accts" value="' + esc(f.paidFrom) + '" placeholder="e.g. Operating checking, company card">' +
    '<datalist id="gc-pd-accts"><option value="Operating checking"><option value="Payroll account"><option value="Company card"><option value="Cash"></datalist>' +
    '<label for="gc-pd-note">Note</label><textarea id="gc-pd-note" data-pd-f="note" rows="2">' + esc(f.note) + '</textarea>' +
    '<div class="row" style="margin-top:10px"><button type="button" class="ok" data-pd="save">' + (add ? '💵 Record payment' : '💾 Save changes') + '</button><button type="button" data-pd="close">Cancel</button></div>' +
    '<div class="msg" data-pd="msg" aria-live="polite"></div>' +
    '<div class="box" data-pd="pdfbox">' + pdfHtml() + '</div>' +
    '<div><b style="font-size:12px">History</b>' + hist + '</div>';
}
function val(k){ var x = UI && UI.el.querySelector('[data-pd-f="' + k + '"]'); return x ? x.value : ''; }
function msg(t, good){ var m = UI && UI.el.querySelector('[data-pd="msg"]'); if (m) { m.textContent = t; m.className = 'msg ' + (good ? 'good' : 'bad'); } }
function after(fn){ ST(function(){ if (UI) { fn(); } }, 350); }
function onChange(e){ var t = e.target; if (t && t.getAttribute('data-pd-f') === 'method') { var l = UI.el.querySelector('[data-pd="reflabel"]'); if (l) l.textContent = REFLABEL[t.value] || 'Reference'; } }
function onClick(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-pd]') : null; if (!b || !UI) return;
  var a = b.getAttribute('data-pd'), u = UI;
  if (a === 'close') return close();
  if (a === 'mode') { u.add = b.getAttribute('data-v') === 'add'; return draw(); }
  if (a === 'save') {
    b.disabled = true;
    var d0 = get(u.id) || {}, add = u.add || d0.paid <= 0.004;
    return save(u.id, { date: val('date'), amount: val('amount'), method: val('method'), ref: val('ref'), paidFrom: val('paidFrom'), note: val('note'), add: add }).then(function(r){
      if (UI !== u) return;
      if (!r.ok) { b.disabled = false; return msg(r.error); }
      if (r.unchanged) { b.disabled = false; return msg('Nothing changed.', true); }
      u.add = false; after(function(){ draw(); msg(add ? '✓ Payment recorded.' : '✓ Saved.', true); });
    });
  }
  if (a === 'undo') {
    return undo(u.id, b.getAttribute('data-hid')).then(function(r){ if (UI !== u) return; if (!r.ok) return msg(r.error); after(function(){ draw(); msg('↩ Undone.', true); }); });
  }
  if (a === 'attach') {
    var was = u.pdf ? u.pdf.name + (u.pdf.at ? '|' + u.pdf.at : '') : '';
    if (typeof W._gcAttachSubPDF !== 'function') return msg('PDF attach is not ready on this screen.');
    W._gcAttachSubPDF(u.id);
    var n = 0, t = SI(function(){
      n++; if (UI !== u || n > 120) { clearInterval(t); return; }
      pdfOf(u.id).then(function(p){
        var now = p ? p.name + (p.at ? '|' + p.at : '') : '';
        if (now && now !== was && UI === u) { clearInterval(t); notePdf(u.id, was.split('|')[0], p.name); u.pdf = p; after(function(){ draw(); msg('📎 Attached ' + p.name + '.', true); }); }
      });
    }, 500);
    return;
  }
  if (a === 'viewpdf') { try { var r0 = findInv(u.id) || {}; W._gcViewSubPDF(u.id, r0.pid); } catch (er) {} return; }
}
D.addEventListener('keydown', function(e){ if (e.key === 'Escape' && UI && UI.el.contains(D.activeElement || null)) close(); });

/* ═════════════ the 💳 buttons ═════════════ */
function fiberKey(el){ try { for (var k in el) if (k.indexOf('__reactFiber') === 0) { var f = el[k]; return f && f.key != null ? String(f.key) : null; } } catch (e) {} return null; }
function mkBtn(id){ var b = D.createElement('button'); b.type = 'button'; b.className = 'gc-pd-btn'; b.setAttribute('data-pd-open', id); b.title = 'Payment details — date, amount, method, check #, PDF'; b.textContent = '💳 Payment details'; return b; }
function paint(){
  if (W.__GC_IS_TYPING__ === true && D.activeElement && D.activeElement.closest && D.activeElement.closest('table')) return;
  var ok = canUse();
  if (!ok) { [].forEach.call(D.querySelectorAll('.gc-pd-btn'), function(x){ x.remove(); }); return; }
  var byId = null;
  var rows = D.querySelectorAll('main table tbody tr');
  for (var i = 0; i < rows.length; i++) {
    var tr = rows[i], k = fiberKey(tr); if (!k) continue;
    var have = tr.querySelector('.gc-pd-btn');
    if (have && have.getAttribute('data-pd-open') === k) continue;
    if (!byId) { byId = {}; invoices().forEach(function(r){ byId[String(r.id)] = r; }); }
    if (!byId[k]) { if (have) have.remove(); continue; }
    var cell = tr.lastElementChild; if (!cell || !/EDIT|Save/.test(cell.textContent || '')) continue;
    if (have) have.remove();
    cell.appendChild(mkBtn(k));
  }
  /* the job page's invoice list (patch APPRDOC's placeholders) */
  [].forEach.call(D.querySelectorAll('[data-apxd-line^="inv|"]'), function(sp){
    var id = s(sp.getAttribute('data-apxd-line')).slice(4), nx = sp.nextElementSibling;
    if (nx && nx.classList.contains('gc-pd-btn') && nx.getAttribute('data-pd-open') === id) return;
    if (nx && nx.classList.contains('gc-pd-btn')) nx.remove();
    sp.parentNode.insertBefore(mkBtn(id), sp.nextSibling);
  });
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-pd-open]') : null; if (!b) return;
  e.preventDefault(); e.stopPropagation(); open(b.getAttribute('data-pd-open'));
}, true);
SI(paint, 1500); ST(paint, 800);

W._gcPayDetail = { open: open, close: close, get: get, save: save, undo: undo, canUse: canUse, paint: paint };
try { console.log('[GC] patch PAYDETAIL: 💳 Payment details on invoices / bills — _gcPayDetail.open(invId)'); } catch (e) {}
})(window, document);
