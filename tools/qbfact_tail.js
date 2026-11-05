<script id="gc-patch-qbfact">
/* __GC_PATCH_QBFACT__ — QuickBooks is fact (owner 11/05: "all csv from quickbooks is fact, i dont need to approve anything
   from quickbooks"; "invoices before 11/4 count as paid, let's keep the last month for approval").
   A record imported from QuickBooks (source quickbooks / a QB: key / by "QuickBooks import") is final:
     • it never makes a to-do, a collections line, a payment reminder, a "Confirm" / "Check cost" line or an approval;
     • a QuickBooks invoice dated before qbFactPaidBefore (2026-10-05) counts as PAID unless QuickBooks says it is open
       (qbOpen === true, e.g. from an Open Invoices / A/R Aging import);
     • a QuickBooks customer invoice dated on / after qbFactPaidBefore waits for the owner ONCE, in one grouped approval
       "QuickBooks invoices — confirm Paid / Still owed": ✓ Paid marks it paid; Still owed makes it a normal open
       invoice (from then on the usual rules: collections lines; it stays history, so nothing is e-mailed by itself);
     • its money still counts on the job's P&L (nothing here changes an amount).
   The QuickBooks "needs a home" list stays for the office (placing a record on a job), but is not on the owner's To-Do.
   Admin card: "Remove N bad imported invoices" — QuickBooks bills with no number and no job that are the lines of one
   receipt split into separate bills (the $2 / $3 / $4 / $32 "customer · job" lines). One tap moves them to the trash
   (status void, amount 0, the original kept on the record) with Undo.
   Settings (payrollSettings): qbFactPaidBefore (default 2026-10-05), qbFactCutoff (default 2026-11-04).
   API: window._gcQbFact = { is, state, silent, paid, cfg, review, junk, openReview, openJunk, setPaid, setOwed, trashJunk, undoJunk } */
(function(W){
'use strict';
if (W.__GC_PATCH_QBFACT__) return; W.__GC_PATCH_QBFACT__ = true;
var D = W.document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ n = +n || 0; return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function day10(v){ var m = /(\d{4}-\d{2}-\d{2})/.exec(s(v)); return m ? m[1] : ''; }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function crm(){ return W._crm || {}; }
function invs(){ var c = crm(); return arr(c.invs && c.invs.length ? c.invs : c.invoices); }
function exps(){ return arr(crm().expenses); }
function me(){ try { var u = JSON.parse(localStorage.getItem('grayco_user') || 'null'); if (u && typeof u === 'object') return s(u.name); return s(u); } catch (e) { return s(localStorage.getItem('grayco_user')); } }

var DEF = { qbFactPaidBefore: '2026-10-05', qbFactCutoff: '2026-11-04' };
function cfg(){
  var o = {};
  try { var c = crm().payrollSettings; if (c && typeof c === 'object' && !Array.isArray(c)) o = c; } catch (e) {}
  if (!o.qbFactPaidBefore) { try { var l = JSON.parse(localStorage.getItem('payrollSettings') || 'null'); if (l && typeof l === 'object') o = l; } catch (e) {} }
  var pb = day10(o.qbFactPaidBefore) || DEF.qbFactPaidBefore, co = day10(o.qbFactCutoff) || DEF.qbFactCutoff;
  return { qbFactPaidBefore: pb, qbFactCutoff: co };
}
/* a record that came from a QuickBooks import */
function is(r){
  if (!r || typeof r !== 'object') return false;
  return /quickbooks/i.test(s(r.source)) || /^QB:/.test(s(r.qbKey)) || (Array.isArray(r.qbKeys) && r.qbKeys.length > 0) || /quickbooks/i.test(s(r.by)) || /quickbooks/i.test(s(r.sentNote));
}
function isClientInv(r){ return !/^(sub|bill|mpo|expense|purchase|payment)$/i.test(s(r.type)); }
function dateOf(r){ return day10(r.date || r.invDate || r.txnDate || r.recvDate || r.sentDate || r.created); }
/* 'paid' (counts as paid) · 'review' (waits for the owner: Paid / Still owed) · 'open' (a normal invoice) · 'fact' (final, no to-dos) · '' not QuickBooks */
function state(r){
  if (!is(r)) return '';
  if (r.qbJunk) return 'fact';
  if (r.qbConfirmed === 'paid') return 'paid';
  if (r.qbConfirmed === 'owed' || r.qbOpen === true) return 'open';
  var c = cfg(), d = dateOf(r);
  if (d && d < c.qbFactPaidBefore) return 'paid';
  if (r.paid === true || /^paid$/i.test(s(r.status))) return 'paid';
  if (/void|cancel|deleted/i.test(s(r.status)) || r.deleted) return 'fact';
  if (isClientInv(r) && (r.type == null || /client|customer|invoice|draw|progress|final/i.test(s(r.type) || 'client'))) return 'review';
  return 'fact';
}
function silent(r){ var st = state(r); return !!st && st !== 'open'; }
function paid(r){ return state(r) === 'paid'; }
function invById(id){ id = s(id); if (!id) return null; var l = invs(); for (var i = 0; i < l.length; i++) if (l[i] && s(l[i].id) === id) return l[i]; return null; }
function expById(id){ id = s(id); if (!id) return null; var l = exps(); for (var i = 0; i < l.length; i++) if (l[i] && s(l[i].id) === id) return l[i]; return null; }
function recById(id){ return invById(id) || expById(id); }
function nk(v){ return low(v).replace(/[^a-z0-9]+/g, ' ').trim(); }
/* every vendor / sub record with this name came from a QuickBooks import (customers / vendors are fact too) */
function qbOnlyParty(name){
  var n = nk(name); if (!n) return false;
  var l = arr(crm().vendors).concat(arr(crm().subs)).filter(function(v){ return v && nk(v.name || v.company) === n; });
  return l.length > 0 && l.every(function(v){ return /quickbooks/i.test(s(v.source)) || is(v); });
}
function review(){ return invs().filter(function(r){ return state(r) === 'review'; }).sort(function(a, b){ return dateOf(a) < dateOf(b) ? -1 : 1; }); }
/* the lines of one receipt split into separate "bills": QuickBooks bill, no number, no job, keyed date:cents:vendor, 2+ of them for one vendor and day */
function junkCand(r){ return r && is(r) && !r.qbJunk && /^(sub|bill)$/i.test(s(r.type)) && !s(r.invNum || r.num || r.number) && !s(r.pid) && /^QB:bill:\d{4}-\d{2}-\d{2}:-?\d+:/.test(s(r.qbKey)); }
function junk(){
  var g = {}, l = invs().filter(junkCand);
  l.forEach(function(r){ var k = s(r.qbKey).split(':').slice(2, 3).join('') + '|' + s(r.qbKey).split(':').slice(4).join(':'); (g[k] = g[k] || []).push(r); });
  var out = []; Object.keys(g).forEach(function(k){ if (g[k].length >= 2) out = out.concat(g[k]); });
  return out;
}
function trashed(){ return invs().filter(function(r){ return r && r.qbJunk && r.qbJunk.was; }); }

/* ── read-time filters on every generator (nothing in the data changes) ── */
function idOfKey(k, re){ var m = re.exec(s(k)); return m ? m[1] : ''; }
function wrapTodoCompute(){
  var f = W._todoCompute; if (typeof f !== 'function' || f.__qbf) return;
  var g = function(){
    var cats = f.apply(this, arguments) || {};
    try {
      ['overdue', 'confirm'].forEach(function(c){
        if (!Array.isArray(cats[c])) return;
        cats[c] = cats[c].filter(function(it){ var id = idOfKey(it && it.key, /^(?:ovd|confinv|confexp):(.+)$/); return !(id && silent(recById(id))); });
      });
    } catch (e) {}
    return cats;
  };
  g.__qbf = true; g.__orig = f; W._todoCompute = g;
}
function keepTask(t){
  var id = s(t && t.id), m = /^(?:coll|qbconfirm|costreview)_(.+)$/.exec(id);
  if (m && silent(recById(m[1]))) return false;
  return true;
}
function wrapList(name){
  var f = W[name]; if (typeof f !== 'function' || f.__qbf) return;
  var g = function(){ var l = f.apply(this, arguments); try { if (Array.isArray(l)) return l.filter(keepTask); } catch (e) {} return l; };
  g.__qbf = true; g.__orig = f; W[name] = g;
}
function wrapOm(){
  var f = W.buildTodoItems; if (typeof f !== 'function' || f.__qbf) return;
  var g = function(){
    var l = f.apply(this, arguments);
    try {
      if (Array.isArray(l)) return l.filter(function(it){
        if (!it || s(it.tag) !== 'Invoice' || !/^Overdue invoice/i.test(s(it.text))) return true;
        var amt = parseFloat(String(s(it.text).split('$')[1] || '').replace(/,/g, '')) || 0;
        var hit = invs().filter(function(i){ return i && s(i.pid) === s(it.pid) && Math.abs((parseFloat(i.amt) || 0) - amt) < 1; });
        return !hit.length || hit.some(function(i){ return !silent(i); });
      });
    } catch (e) {}
    return l;
  };
  g.__qbf = true; g.__orig = f; W.buildTodoItems = g;
}
function wrapPaid(){
  var f = W._gcInvIsPaid; if (typeof f !== 'function' || f.__qbf) return;
  var g = function(inv){ try { if (paid(inv)) return true; } catch (e) {} return f.apply(this, arguments); };
  g.__qbf = true; g.__orig = f; W._gcInvIsPaid = g;
}
function wrapAll(){ wrapTodoCompute(); wrapList('_gcOfficeBuildTasks'); wrapList('_gcJOfficeTasks'); wrapOm(); wrapPaid(); }
/* the one To-Do's last filter (patch_QBFACT.py puts the call in its build) */
W._gcQbFactDrop = function(r, ctx){
  if (!r) return false;
  var m, id = '';
  if ((m = /^ar\|(.+)$/.exec(s(r.thing)))) id = m[1];
  else if (r.inv) id = s(r.inv);
  else if ((m = /^tab:(?:ovd|confinv|confexp):(.+)$/.exec(s(r.key)))) id = m[1];
  else if ((m = /^otd:(?:coll|qbconfirm|costreview)_(.+)$/.exec(s(r.key)))) id = m[1];
  if (id && silent(recById(id))) return true;
  if (/^sub\|/.test(s(r.thing)) && r.subName && qbOnlyParty(r.subName)) return true;   /* a vendor that only came from QuickBooks: no papers chase */
  if (r.src === 'st' && r.rec) {
    var t = r.rec;
    if (t.kind === 'qb_home') return !!(ctx && ctx.owner);                  /* the office places it; not the owner's to-do */
    var rid = s(t.invId || t.invoiceId || t.recordId || (t.meta && t.meta.invoiceId));
    if (rid && silent(recById(rid))) return true;
  }
  if (r.src === 'otd' && /^QuickBooks import/i.test(s(r.cat)) && ctx && ctx.owner) return true;
  if (ctx && ctx.owner && /^otd:alert_/.test(s(r.key)) && /subs? to match to a job/i.test(s(r.title))) return true;   /* matching is the office's (QuickBooks bills with no job), not an owner approval */
  return false;
};

/* ── saving one invoice change (same path the CRM's own invoice fixes use) ── */
function saveInvs(list, why){
  try { if (W._gcManualNow) W._gcManualNow(why); } catch (e) {}
  try { if (W._crm) { W._crm.invs = list; W._crm.invoices = list; } } catch (e) {}
  try { if (typeof W.idbSet === 'function') W.idbSet('invs', list); } catch (e) {}
  try { if (typeof W._setInvoices === 'function') W._setInvoices(list.slice()); } catch (e) {}
  try { var up = W._supaUpsertNow || W._supaUpsert; if (up) up('invs', list); } catch (e) {}
  try { if (W._gcTD2) W._gcTD2.paint(); } catch (e) {}
}
function change(ids, fn, why){
  var want = {}; arr(ids).forEach(function(i){ want[s(i)] = 1; });
  var now = new Date().toISOString(), n = 0;
  var list = invs().map(function(r){ if (!r || !want[s(r.id)]) return r; var x = Object.assign({}, r); fn(x, now); x.updatedAt = now; n++; return x; });
  if (n) saveInvs(list, why);
  return n;
}
function setPaid(ids){
  return change(ids, function(x, now){ x.qbConfirmed = 'paid'; x.qbConfirmedAt = now; x.qbConfirmedBy = me(); x.status = 'paid'; x.paid = true; x.paidDate = x.paidDate || dateOf(x) || today(); }, 'QuickBooks invoice confirmed paid');
}
function setOwed(ids){
  return change(ids, function(x, now){ x.qbConfirmed = 'owed'; x.qbConfirmedAt = now; x.qbConfirmedBy = me(); if (/^paid$/i.test(s(x.status))) x.status = 'sent'; x.paid = false; }, 'QuickBooks invoice confirmed still owed');
}
function trashJunk(ids){
  ids = ids || junk().map(function(r){ return r.id; });
  return change(ids, function(x, now){ x.qbJunk = { at: now, by: me(), why: 'a line of one QuickBooks receipt split into its own bill', was: { status: x.status, amt: x.amt, amount: x.amount, paid: x.paid } }; x.status = 'void'; x.voided = true; x.amt = 0; if (x.amount != null) x.amount = 0; x.paid = false; }, 'Removed bad imported QuickBooks lines');
}
function undoJunk(ids){
  ids = ids || trashed().map(function(r){ return r.id; });
  return change(ids, function(x){ var w = x.qbJunk && x.qbJunk.was; if (!w) return; x.status = w.status; x.amt = w.amt; if (w.amount !== undefined) x.amount = w.amount; else delete x.amount; if (w.paid !== undefined) x.paid = w.paid; else delete x.paid; delete x.voided; delete x.qbJunk; }, 'Put back imported QuickBooks lines');
}

/* ── the two cards (one grouped approval; one admin cleanup) ── */
function isOwner(){
  try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {}
  var n = low(me()); var u = arr(crm().users).filter(function(x){ return x && (low(x.name) === n || low(x.email) === n); })[0];
  return !!u && (u.role === 'Admin' || low(u.payType) === 'owner');
}
function overlay(id, html){
  var o = D.getElementById(id); if (o) o.remove();
  o = D.createElement('div'); o.id = id;
  o.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto';
  o.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:12px;max-width:760px;width:100%;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.3);font:14px/1.4 system-ui,sans-serif">' + html + '</div>';
  o.addEventListener('click', function(e){ if (e.target === o) o.remove(); });
  D.body.appendChild(o); return o;
}
function party(r){ return s(r.client || r.customer || r.customerName || r.sub || r.vendor) || '—'; }
function openReview(){
  var l = review(), c = cfg();
  var rows = l.map(function(r){ return '<tr data-id="' + esc(r.id) + '"><td style="padding:6px 4px;white-space:nowrap">' + esc(dateOf(r)) + '</td><td style="padding:6px 4px">' + (s(r.invNum) ? '#' + esc(r.invNum) + ' ' : '') + esc(party(r)) + '</td><td style="padding:6px 4px;text-align:right;white-space:nowrap">' + esc(money(r.amt || r.amount)) + '</td>'
    + '<td style="padding:6px 4px;white-space:nowrap;text-align:right"><button type="button" data-qbf="paid" style="padding:5px 10px;border-radius:7px;border:0;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">✓ Paid</button> <button type="button" data-qbf="owed" style="padding:5px 10px;border-radius:7px;border:1px solid #d97706;background:#fff7ed;color:#9a3412;font-weight:700;cursor:pointer">Still owed</button></td></tr>'; }).join('');
  var o = overlay('_gcQbfReview', '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:16px">📒 QuickBooks invoices — confirm Paid / Still owed</b><button type="button" data-qbf="x" style="border:0;background:none;font-size:20px;cursor:pointer">✕</button></div>'
    + '<div style="color:#475569;font-size:12.5px;margin:6px 0 10px">QuickBooks is the record. Invoices before ' + esc(c.qbFactPaidBefore) + ' count as paid. These are from the last month: tell the CRM once. <b>✓ Paid</b> marks it paid. <b>Still owed</b> makes it a normal open invoice (nothing is e-mailed by itself).</div>'
    + (l.length ? '<div style="margin-bottom:8px"><button type="button" data-qbf="allpaid" style="padding:6px 12px;border-radius:7px;border:0;background:#0f766e;color:#fff;font-weight:700;cursor:pointer">✓ All ' + l.length + ' paid</button></div><table style="width:100%;border-collapse:collapse">' + rows + '</table>' : '<div style="padding:10px 0">Nothing to confirm.</div>'));
  o.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-qbf]'); if (!b) return;
    var k = b.getAttribute('data-qbf'), tr = b.closest('tr'), id = tr && tr.getAttribute('data-id');
    if (k === 'x') { o.remove(); return; }
    if (k === 'allpaid') { setPaid(review().map(function(r){ return r.id; })); openReview(); return; }
    if (k === 'paid' && id) { setPaid([id]); tr.remove(); }
    if (k === 'owed' && id) { setOwed([id]); tr.remove(); }
  });
  return o;
}
function openJunk(){
  var l = junk(), t = trashed();
  var row = function(r){ return '<tr><td style="padding:5px 4px;white-space:nowrap">' + esc(dateOf(r)) + '</td><td style="padding:5px 4px">' + esc(party(r)) + ' — ' + esc(s(r.desc).replace(/^QuickBooks bill\s*—?\s*/, '') || '(no memo)') + '</td><td style="padding:5px 4px;text-align:right">' + esc(money(r.qbJunk && r.qbJunk.was ? r.qbJunk.was.amt : r.amt)) + '</td></tr>'; };
  var o = overlay('_gcQbfJunk', '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:16px">🧹 Bad imported invoices</b><button type="button" data-qbj="x" style="border:0;background:none;font-size:20px;cursor:pointer">✕</button></div>'
    + '<div style="color:#475569;font-size:12.5px;margin:6px 0 10px">QuickBooks bills with no number and no job — the lines of one receipt, each imported as its own "invoice" (they showed as "$2 — customer · job"). Removing moves them to the trash: void, $0, the original kept on the record — <b>Undo</b> puts them back.</div>'
    + (l.length ? '<table style="width:100%;border-collapse:collapse">' + l.map(row).join('') + '</table><div style="margin-top:10px"><button type="button" data-qbj="rm" style="padding:7px 14px;border-radius:8px;border:0;background:#dc2626;color:#fff;font-weight:700;cursor:pointer">Remove ' + l.length + ' bad imported invoice' + (l.length === 1 ? '' : 's') + '</button></div>' : '<div>None left to remove.</div>')
    + (t.length ? '<div style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:10px"><b>In the trash (' + t.length + ')</b><table style="width:100%;border-collapse:collapse">' + t.map(row).join('') + '</table><button type="button" data-qbj="undo" style="margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid #334155;background:#fff;cursor:pointer;font-weight:700">↩ Undo — put them back</button></div>' : ''));
  o.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-qbj]'); if (!b) return;
    var k = b.getAttribute('data-qbj');
    if (k === 'x') { o.remove(); return; }
    if (k === 'rm') { trashJunk(l.map(function(r){ return r.id; })); openJunk(); }
    if (k === 'undo') { undoJunk(); openJunk(); }
  });
  return o;
}
/* To-Do lines: ONE grouped approval and the cleanup card (admins only) */
W._gcTodoExt = Array.isArray(W._gcTodoExt) ? W._gcTodoExt : [];
W._gcTodoExt.push(function(){
  if (!isOwner()) return [];
  var out = [], n = review().length, j = junk().length;
  if (n) out.push({ key: 'qbfact:review', thing: 'qbfact|review', cat: 'appr', prio: 'med', vis: 'company', title: '📒 QuickBooks invoices — confirm Paid / Still owed (' + n + ')', sub: 'Last month’s QuickBooks invoices — one tap each', act: { l: 'Review', f: openReview } });
  if (j) out.push({ key: 'qbfact:junk', thing: 'qbfact|junk', cat: 'setup', prio: 'low', vis: 'company', title: '🧹 Remove ' + j + ' bad imported invoice' + (j === 1 ? '' : 's'), sub: 'QuickBooks receipt lines with no number and no job', act: { l: 'Review', f: openJunk } });
  return out;
});
W._gcQbFact = { is: is, state: state, silent: silent, paid: paid, cfg: cfg, review: review, junk: junk, trashed: trashed, openReview: openReview, openJunk: openJunk,
  setPaid: setPaid, setOwed: setOwed, trashJunk: trashJunk, undoJunk: undoJunk, wrapAll: wrapAll,
  stats: function(){ var c = { paid: 0, review: 0, open: 0, fact: 0 }; invs().forEach(function(r){ var x = state(r); if (x) c[x]++; }); c.junk = junk().length; return c; } };
wrapAll(); ST(wrapAll, 0); ST(wrapAll, 1500); RI(wrapAll, 3000);
try { console.log('[GC] QuickBooks is fact (patch QBFACT) — window._gcQbFact'); } catch (e) {}
})(window);
</script>
