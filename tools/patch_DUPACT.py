#!/usr/bin/env python3
"""Idempotent patch DUPACT (owner 10/30, 💎 → Duplicate check: "wont let me look and approve or click these").
The "look at it — not folded automatically" groups (I5 same job + client + amount within 40 days, C4, P2) had no
buttons at all: patch J only gave the STRONG groups a Fold button, and patch B (SWEEP) only dressed the I4
"same number, different amount" groups. Now every look-alike group has:
  * Open on every row — the invoice in the CRM's own invoice view (the same document the Invoices screen opens from
    its PO link), or the record's details for a sub bill / cost, on a sheet over the Duplicate check (Close = back);
  * "keep this one" on the rows that are not ✔ — moves the ✔;
  * "Fold — keep ✓" — window._gcFold(list, keep, drops, rule, 'by <name>: <rule>', {by:<name>, ...}), the same call
    the automatic folds make, so the Folded list's Undo puts it back;
  * "Not duplicates — keep both" — written on the records themselves (dupNotSame: the ids of the others), like patch
    B's dupKeepBoth, so it syncs with invs / expenses and every computer stops showing the group.
After a click only that group leaves the screen and the counts change; the scan is not run again (it is heavy).
Undo in the Folded list also works in place now. Fold / Keep both: admins and the office (a PM never)."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '<script id="gc-patch-dupact">'
if MARK in t: print('DUPACT: already patched'); sys.exit(0)
def once(a, b):
    global t
    n = t.count(a); assert n == 1, ('DUPACT anchor', n, a[:70]); t = t.replace(a, b)

JS = r"""
<script id="gc-patch-dupact">
/* ============================================================================
   GrayCo — DUPACT: the Duplicate check's "look at it" groups can be opened and settled.   (patch DUPACT)
   Owner 10/30: "wont let me look and approve or click these". Each look-alike group (I5 / C4 / P2) gets Open on
   every row, "keep this one", "Fold — keep ✓" (window._gcFold, Undo in the Folded list) and "Not duplicates —
   keep both" (dupNotSame on the records, synced with them). Only the clicked group changes on screen — no re-scan.
   Kill switch: localStorage gc_dupact_off = '1'.
   ========================================================================== */
(function(){
'use strict';
if (window.__GC_DUPACT__) return; window.__GC_DUPACT__ = true;
try { if (localStorage.getItem('gc_dupact_off') === '1') return; } catch (e) {}
var OV = '_gcDupCheckOv', SHEET = '_gcDupActSheet', ZTOP = 2147483500;
var BTN = 'border:none;border-radius:7px;padding:6px 12px;font-weight:700;font-size:12px;cursor:pointer;';
var SBTN = 'border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:6px;padding:2px 9px;font-weight:700;font-size:11.5px;cursor:pointer;';
var LNK = 'border:none;background:none;padding:0 2px;color:#1d4ed8;text-decoration:underline;font-size:11.5px;cursor:pointer;';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; var x = parseFloat(s(v).replace(/[^0-9.\-]/g, '')); return isFinite(x) ? x : 0; }
function money(n){ n = num(n); return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function amtOf(r){ return r ? (r.amt != null && r.amt !== '' ? r.amt : (r.amount != null ? r.amount : r.total)) : 0; }
function meU(){ try { return (typeof window._gcMeUser === 'function' && window._gcMeUser()) || {}; } catch (e) { return {}; } }
function who(){
  var u = meU(); if (u && u.name) return s(u.name);
  try { var raw = localStorage.getItem('grayco_user') || ''; try { var j = JSON.parse(raw); if (j && j.name) return s(j.name); } catch (x) {} if (raw && raw.charAt(0) !== '{') return raw; } catch (e) {}
  return 'a person';
}
/* who may fold / keep both: an admin or the office (owner too); a PM never. Nobody known = as before (the panel's
   own Fold and Undo never checked a role). */
function canAct(){
  try { if (typeof window.__gcAuthIsAdmin === 'function' && window.__gcAuthIsAdmin()) return true; } catch (e) {}
  try { if (typeof window._gcIsPM === 'function' && window._gcIsPM()) return false; } catch (e) {}
  var u = meU(), r = s(u && u.role);
  if (!r) return true;
  return /admin|office|owner/i.test(r) || low(u.payType) === 'owner';
}
var SETTER = { invs: '_setInvoices', expenses: '_setExpenses' };
function idOf(list, r){ return s(r && (list === 'gcAcctRegister' ? (r._id || r.id) : (r.id || r._id))); }
async function getList(k){ try { var v = await window.idbGet(k); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
async function saveList(k, list, why){
  try { if (window._gcManualNow) window._gcManualNow(why); } catch (e) {}
  try { await window.idbSet(k, list); } catch (e) {}
  try { var f = window[SETTER[k]]; if (typeof f === 'function') f(list.slice()); } catch (e) {}
  try { if (window._crm) { if (k === 'invs') { window._crm.invs = list; window._crm.invoices = list; } else window._crm[k] = list; } } catch (e) {}
  try { var up = window._supaUpsertNow || window._supaUpsert; if (up) up(k, list); } catch (e) {}
}
function isI4(g){ return g && g.list === 'invs' && /^I4\b/.test(s(g.rule)); }
function lookAt(g){ return g && !g.strong && Array.isArray(g.rows) && g.rows.length >= 2 && (g.list === 'invs' || g.list === 'expenses'); }

/* ── "Not duplicates — keep both": remembered on the records (they sync), so every computer stops asking ── */
function settled(g, byId){
  for (var i = 0; i < g.rows.length; i++) for (var j = i + 1; j < g.rows.length; j++) {
    var a = g.rows[i].id, b = g.rows[j].id, A = byId[a], B = byId[b];
    var na = (A && Array.isArray(A.dupNotSame)) ? A.dupNotSame : [], nb = (B && Array.isArray(B.dupNotSame)) ? B.dupNotSame : [];
    if (na.indexOf(b) < 0 && nb.indexOf(a) < 0) return false;
  }
  return true;
}
function wrapCheck(){
  var f = window._gcDupCheck;
  if (typeof f !== 'function' || f.__dupact) return;
  var w = async function(){
    var r = await f.apply(this, arguments);
    try {
      if (r && Array.isArray(r.groups)) {
        var need = {}; r.groups.forEach(function(g){ if (lookAt(g) && !isI4(g)) need[g.list] = 1; });
        var maps = {}, any = false;
        for (var k in need) { var L = await getList(k), m = {}, n = 0; L.forEach(function(x){ if (x && Array.isArray(x.dupNotSame) && x.dupNotSame.length) { m[idOf(k, x)] = x; n++; } }); if (n) { maps[k] = m; any = true; } }
        if (any) r.groups = r.groups.filter(function(g){ return !(lookAt(g) && !isI4(g) && maps[g.list] && settled(g, maps[g.list])); });
      }
    } catch (e) {}
    return r;
  };
  w.__dupact = true; w.__sweep = f.__sweep; window._gcDupCheck = w;
}
window._gcDupKeepBoth = async function(list, ids){
  ids = (ids || []).map(s).filter(Boolean); if (ids.length < 2) return 0;
  var L = await getList(list), n = 0, by = who(), at = new Date().toISOString();
  L.forEach(function(r){
    var id = idOf(list, r); if (!r || ids.indexOf(id) < 0) return;
    var cur = Array.isArray(r.dupNotSame) ? r.dupNotSame.slice() : [];
    ids.forEach(function(o){ if (o !== id && cur.indexOf(o) < 0) cur.push(o); });
    r.dupNotSame = cur; r.dupNotSameBy = by; r.dupNotSameAt = at; r.updatedAt = at; n++;
  });
  if (n) await saveList(list, L, 'not duplicates — kept both');
  return n;
};
window._gcDupFoldKeep = async function(g, keepId){
  if (typeof window._gcFold !== 'function') return 0;
  var by = who(), drops = g.rows.map(function(x){ return x.id; }).filter(function(i){ return i !== keepId; });
  return await window._gcFold(g.list, keepId, drops, g.rule, 'by ' + by + ': ' + g.rule, { by: by, person: true, allowHand: true });
};

/* ── Open: the record on a sheet over the Duplicate check ── */
var FIRST = ['date','recvDate','sentDate','dueDate','due','amt','amount','total','type','status','client','customer','sub','vendor','payee','pid','projName','po','qbNum','invNum','desc','category','source','by','enteredBy','created','updatedAt','id'];
function fieldRows(rec){
  var keys = Object.keys(rec || {}), seen = {}, out = [];
  FIRST.concat(keys.sort()).forEach(function(k){
    if (seen[k] || !(k in rec)) return; seen[k] = 1;
    var v = rec[k]; if (v == null || v === '') return;
    var t;
    if (typeof v === 'string' && /^data:/.test(v)) t = '(file attached)';
    else if (typeof v === 'object') { try { t = JSON.stringify(v); } catch (e) { t = '[…]'; } if (t.length > 240) t = t.slice(0, 240) + '…'; }
    else { t = String(v); if (t.length > 400) t = t.slice(0, 400) + '…'; }
    out.push('<tr><td style="padding:3px 10px 3px 0;color:#64748b;white-space:nowrap;vertical-align:top">' + esc(k) + '</td><td style="padding:3px 0;word-break:break-word">' + esc(t) + '</td></tr>');
  });
  return '<table style="border-collapse:collapse;font-size:12px;width:100%">' + out.join('') + '</table>';
}
function jobName(pid){ try { var p = ((window._crm || {}).projects || []).find(function(x){ return x && x.id === pid; }); return p ? (p.name || pid) : (pid ? pid + ' (no such job)' : '(no job)'); } catch (e) { return s(pid); } }
function closeSheet(){ var o = document.getElementById(SHEET); if (o) o.remove(); document.removeEventListener('keydown', onKey, true); }
function onKey(e){ if (e.key === 'Escape' && document.getElementById(SHEET)) { e.stopPropagation(); closeSheet(); } }
function invoiceHTML(rec){
  if (typeof window._gcViewInvoicePDF !== 'function') return '';
  /* the viewer reads _crm.invoices first; without the row there it goes async and opens a tab — offer a button then */
  try { if (!((window._crm || {}).invoices || []).some(function(i){ return i && i.id === rec.id; })) return ''; } catch (e) { return ''; }
  var html = '';
  try {
    window.__gcInvoiceReturnHTML = true; window.__gcInvoiceLastHTML = '';
    try { window._gcViewInvoicePDF(rec.id, rec.pid); } catch (e) {}
    html = window.__gcInvoiceLastHTML || '';
  } finally { window.__gcInvoiceReturnHTML = false; }
  return html;
}
window._gcDupOpen = async function(list, id){
  list = list === 'invoices' ? 'invs' : list;
  var L = await getList(list), rec = L.find(function(x){ return idOf(list, x) === s(id); });
  if (!rec) { try { rec = ((window._crm || {})[list === 'invs' ? 'invoices' : list] || []).find(function(x){ return idOf(list, x) === s(id); }); } catch (e) {} }
  closeSheet();
  var sh = document.createElement('div'); sh.id = SHEET;
  sh.style.cssText = 'position:fixed;inset:0;z-index:' + ZTOP + ';background:rgba(6,12,20,.6);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:Arial,sans-serif';
  var box = '<div style="background:#fff;color:#111;border-radius:13px;width:min(860px,98vw);padding:18px;margin:auto">';
  if (!rec) {
    sh.innerHTML = box + '<div style="display:flex;gap:10px;align-items:center"><b style="flex:1;font-size:16px">Not found</b><button class="_daX" style="' + BTN + 'background:#e5e7eb">Close</button></div><div style="font-size:13px;margin-top:8px">' + esc(id) + ' is no longer in the list — it may have been folded already.</div></div>';
  } else {
    var party = s(rec.client || rec.customer || rec.sub || rec.vendor || rec.payee || rec.supplier);
    var kind = list === 'invs' ? (low(rec.type) === 'sub' || low(rec.type) === 'supplier' ? 'Sub bill' : 'Client invoice') : 'Cost / payment';
    var head = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:240px"><div style="font-size:12px;color:#64748b">' + esc(kind) + ' · ' + esc(idOf(list, rec)) + '</div>'
      + '<div style="font-size:18px;font-weight:800">' + money(amtOf(rec)) + ' · ' + esc(party || '—') + '</div>'
      + '<div style="font-size:12.5px;color:#334155">' + esc(rec.date || rec.recvDate || '') + ' · ' + esc(jobName(rec.pid)) + ' · ' + esc(rec.status || 'no status') + '</div>'
      + (s(rec.desc) ? '<div style="font-size:12.5px;margin-top:2px">' + esc(rec.desc) + '</div>' : '') + '</div>'
      + '<button class="_daX" style="' + BTN + 'background:#e5e7eb">Close</button></div>';
    var file = s(rec.fileUrl || rec.fileData || rec.pdfUrl || rec.receipt || rec.photo || rec.receiptPhoto || '');
    var doc = '';
    if (list === 'invs' && low(rec.type) !== 'sub' && low(rec.type) !== 'supplier') doc = '<div style="margin-top:12px"><div style="font-size:12px;font-weight:700;margin-bottom:4px">The invoice (as the Invoices screen opens it)</div><div class="_daDoc"></div></div>';
    else if (file) doc = '<div style="margin-top:12px"><div style="font-size:12px;font-weight:700;margin-bottom:4px">The file</div>'
      + (/^data:image\//.test(file) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(file) ? '<img src="' + esc(file) + '" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px">'
        : '<a href="' + esc(file) + '" target="_blank" rel="noopener" style="' + BTN + 'background:#1d4ed8;color:#fff;text-decoration:none;display:inline-block">Open the file' + (rec.fileName ? ' — ' + esc(rec.fileName) : '') + '</a>') + '</div>';
    sh.innerHTML = box + head + doc
      + '<details open style="margin-top:12px"><summary style="cursor:pointer;font-size:12px;font-weight:700">Everything on this record</summary><div style="margin-top:6px">' + fieldRows(rec) + '</div></details></div>';
  }
  document.body.appendChild(sh);
  Array.prototype.forEach.call(sh.querySelectorAll('._daX'), function(b){ b.onclick = closeSheet; });
  sh.addEventListener('click', function(e){ if (e.target === sh) closeSheet(); });
  document.addEventListener('keydown', onKey, true);
  var slot = sh.querySelector('._daDoc');
  if (slot) {
    var html = invoiceHTML(rec);
    if (html) {
      var f = document.createElement('iframe'); f.className = '_daDocFrame';
      f.style.cssText = 'width:100%;height:70vh;border:1px solid #e2e8f0;border-radius:8px;background:#060b16';
      slot.appendChild(f);
      try { f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close(); } catch (e) { f.srcdoc = html; }
    } else {
      slot.innerHTML = '<button class="_daPdf" style="' + BTN + 'background:#1d4ed8;color:#fff">Open the invoice document</button>';
      slot.querySelector('._daPdf').onclick = function(){ try { window._gcViewInvoicePDF(rec.id, rec.pid); } catch (e) {} };
    }
  }
  return sh;
};

/* ── the panel: dress the look-alike groups ── */
function bump(h, d){ if (!h) return; h.textContent = h.textContent.replace(/\((\d+)\)/, function(m, n){ return '(' + Math.max(0, +n + d) + ')'; }); if (d > 0) h.style.display = ''; }
function rowLine(x){
  return esc(x.date) + ' · ' + money(x.amount) + ' · ' + esc(x.who || '—') + (x.number ? ' · #' + esc(x.number) : '') + ' · ' + esc(jobName(x.pid)) + ' · ' + esc(x.desc)
    + ' <span style="color:#94a3b8">[' + esc(x.status) + (x.hand ? ' · entered by hand' : '') + ' · ' + esc(x.id) + ']</span>';
}
function plainWhy(g){
  if (/^I5\b/.test(g.rule)) return 'Same job, same client, about the same amount, dates close together. Open each one and look.';
  if (/^C4\b/.test(g.rule)) return 'Same job, amount and day, but different payees — usually two real payments.';
  if (/^P2\b/.test(g.rule)) return 'Same payment day and amount, but the words name different draws.';
  return 'These look alike. Open each one and look.';
}
function dress(el, g, ctx){
  var act = canAct(), keep = g.keep && g.rows.some(function(x){ return x.id === g.keep; }) ? g.keep : g.rows[0].id;
  el.innerHTML = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="flex:1;font-size:13px;min-width:240px">' + esc(g.rule) + ' <span style="color:#64748b;font-weight:400">· ' + esc(g.list) + ' · ' + g.rows.length + ' rows</span></b>'
    + (act ? '<button class="_daFold" style="' + BTN + 'background:#166534;color:#fff">Fold — keep ✓</button><button class="_daBoth" style="' + BTN + 'background:#e5e7eb;color:#111">Not duplicates — keep both</button>'
           : '<span style="font-size:11px;color:#92400e">look at it — an admin or the office folds it</span>') + '</div>'
    + '<div style="font-size:11.5px;color:#64748b;margin:2px 0 4px">' + esc(plainWhy(g)) + (act ? ' “Fold” keeps the ✓ one and moves the other' + (g.rows.length > 2 ? 's' : '') + ' to the Folded list (Undo puts it back). “Not duplicates” keeps both and stops asking.' : '') + '</div>'
    + g.rows.map(function(x){
        return '<div class="_daRow" data-id="' + esc(x.id) + '" style="font-size:12px;padding:3px 0;display:flex;gap:8px;align-items:center"><span class="_daTxt" style="flex:1"><span class="_daMk"></span>' + rowLine(x) + '</span>'
          + '<button class="_daOpen" data-id="' + esc(x.id) + '" style="' + SBTN + '">Open</button>'
          + (act ? '<button class="_daKeep" data-id="' + esc(x.id) + '" style="' + LNK + '">keep this one</button>' : '') + '</div>';
      }).join('')
    + '<div class="_daMsg" style="font-size:11.5px;color:#b91c1c"></div>';
  function mark(){
    Array.prototype.forEach.call(el.querySelectorAll('._daRow'), function(rw){
      var k = rw.getAttribute('data-id') === keep;
      rw.style.color = k ? '#14532d' : '#334155'; rw.querySelector('._daMk').textContent = k ? '✔ keep ' : '• ';
      var kb = rw.querySelector('._daKeep'); if (kb) kb.style.display = k ? 'none' : '';
    });
  }
  mark();
  Array.prototype.forEach.call(el.querySelectorAll('._daOpen'), function(b){ b.onclick = function(){ window._gcDupOpen(g.list, this.getAttribute('data-id')); }; });
  Array.prototype.forEach.call(el.querySelectorAll('._daKeep'), function(b){ b.onclick = function(){ keep = this.getAttribute('data-id'); mark(); }; });
  var msg = el.querySelector('._daMsg');
  function busy(on, b, txt){ Array.prototype.forEach.call(el.querySelectorAll('._daFold,._daBoth,._daKeep'), function(x){ x.disabled = on; }); if (b && txt) b.textContent = txt; }
  function gone(){ g.__dupact = 'done'; el.remove(); bump(ctx.dh, -1); if (ctx.dh && /\(0\)/.test(ctx.dh.textContent) && !ctx.ov.querySelector('._daAll')) ctx.dh.insertAdjacentHTML('afterend', '<div class="_daAll" style="padding:8px 4px;color:#166534;font-weight:700;font-size:12.5px">No duplicates left to look at.</div>'); }
  var fb = el.querySelector('._daFold');
  if (fb) fb.onclick = async function(){
    var b = this; busy(true, b, 'Folding…'); msg.textContent = '';
    var n = 0; try { n = await window._gcDupFoldKeep(g, keep); } catch (e) { msg.textContent = 'Could not fold: ' + (e && e.message || e); }
    if (!n) { busy(false, b, 'Fold — keep ✓'); if (!msg.textContent) msg.textContent = 'Nothing was folded — the other row may already be gone. Close and open the Duplicate check again.'; return; }
    var by = who(), drops = g.rows.filter(function(x){ return x.id !== keep; });
    drops.forEach(function(x){ addFolded(ctx, g, x, keep, 'by ' + by + ': ' + g.rule); });
    gone();
  };
  var bb = el.querySelector('._daBoth');
  if (bb) bb.onclick = async function(){
    var b = this; busy(true, b, 'Saving…'); msg.textContent = '';
    var n = 0; try { n = await window._gcDupKeepBoth(g.list, g.rows.map(function(x){ return x.id; })); } catch (e) { msg.textContent = 'Could not save: ' + (e && e.message || e); }
    if (!n) { busy(false, b, 'Not duplicates — keep both'); if (!msg.textContent) msg.textContent = 'Those rows are no longer in the list — close and open the Duplicate check again.'; return; }
    gone();
  };
}
function addFolded(ctx, g, x, keep, reason){
  var fh = ctx.fh; if (!fh) return;
  var fid = 'FOLD_' + (g.list === 'invoices' ? 'invs' : g.list) + '_' + x.id;
  var d = document.createElement('div'); d.className = '_daFolded';
  d.style.cssText = 'font-size:12px;padding:3px 0;display:flex;gap:8px;align-items:center';
  d.innerHTML = '<span style="flex:1">' + esc(g.list) + ' · ' + esc(x.date) + ' · ' + money(x.amount) + ' · ' + esc(x.who || '') + ' · ' + esc(s(x.desc).slice(0, 50)) + ' <span style="color:#94a3b8">— ' + esc(reason) + ' (kept ' + esc(keep) + ')</span></span>'
    + '<button class="_jUndo" data-id="' + esc(fid) + '" style="' + BTN + 'background:#e5e7eb">Undo</button>';
  fh.insertAdjacentElement('afterend', d);
  var n = fh.nextElementSibling; while (n && n.tagName !== 'H3') { if (/^Nothing folded\.$/.test(s(n.textContent))) n.style.display = 'none'; n = n.nextElementSibling; }
  bump(fh, +1); undoInPlace(ctx, d.querySelector('._jUndo'));
}
/* Undo in the Folded list: put it back without scanning everything again */
function undoInPlace(ctx, b){
  if (!b || b.__dupact) return; b.__dupact = true;
  b.onclick = async function(){
    var me = this, row = me.parentElement; me.disabled = true; me.textContent = 'Undoing…';
    var ok = false; try { ok = await window._gcUnfold(me.getAttribute('data-id')); } catch (e) {}
    if (!ok) { me.disabled = false; me.textContent = 'Undo'; return; }
    row.style.opacity = '.6'; me.remove();
    row.firstElementChild.insertAdjacentHTML('beforeend', ' <b class="_daBack" style="color:#166534">· put back (shows in Duplicates again next time you open this)</b>');
    bump(ctx.fh, -1);
  };
}
function addOpenLine(el, g){
  var d = document.createElement('div'); d.className = '_daOpenLine';
  d.style.cssText = 'font-size:11.5px;margin-top:5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap';
  d.innerHTML = '<span style="color:#64748b">Look at them:</span>' + g.rows.map(function(x){ return '<button class="_daOpen" data-id="' + esc(x.id) + '" style="' + SBTN + '">Open ' + money(x.amount) + ' ' + esc(low(x.status) || '') + '</button>'; }).join('');
  el.appendChild(d);
  Array.prototype.forEach.call(d.querySelectorAll('._daOpen'), function(b){ b.onclick = function(){ window._gcDupOpen(g.list, this.getAttribute('data-id')); }; });
}
function polish(r){
  var ov = document.getElementById(OV); if (!ov || !r || !Array.isArray(r.groups)) return;
  var hs = Array.prototype.slice.call(ov.querySelectorAll('h3'));
  var ctx = { ov: ov, dh: hs.find(function(h){ return /^Duplicates \(/.test(h.textContent); }), fh: hs.find(function(h){ return /^Folded \(/.test(h.textContent); }) };
  if (ctx.dh) {
    var el = ctx.dh.nextElementSibling, gi = 0, pairs = [];
    while (el && el.tagName !== 'H3' && gi < r.groups.length) { pairs.push([el, r.groups[gi]]); el = el.nextElementSibling; gi++; }
    pairs.forEach(function(pr){
      var el = pr[0], g = pr[1];
      if (!lookAt(g) || el.getAttribute('data-dupact')) return;
      el.setAttribute('data-dupact', '1');
      try { if (isI4(g)) addOpenLine(el, g); else dress(el, g, ctx); } catch (e) { try { console.warn('[GC] dupact group', e); } catch (x) {} }
    });
  }
  Array.prototype.forEach.call(ov.querySelectorAll('._jUndo'), function(b){ undoInPlace(ctx, b); });
}
var waited = 0;
function wrapPanel(){
  var f = window._gcOpenDupCheck;
  if (typeof f !== 'function' || f.__dupact) return;
  if (!f.__sweep && waited++ < 20) return;   /* patch B (SWEEP) dresses the I4 groups first; this goes on top of it */
  var w = async function(){
    var r = await f.apply(this, arguments);
    try { polish(r); } catch (e) { try { console.warn('[GC] dupact panel', e); } catch (x) {} }
    return r;
  };
  w.__dupact = true; w.__sweep = f.__sweep; window._gcOpenDupCheck = w;
}
wrapCheck(); wrapPanel();
var tries = 0, iv = setInterval(function(){ wrapCheck(); wrapPanel(); if (++tries > 120) clearInterval(iv); }, 500);
window._gcDupAct = { version: 1, canAct: canAct, polish: polish };
console.log('[GC] DUPACT: Duplicate check look-alike groups have Open / Fold — keep ✓ / Not duplicates — keep both.');
})();
</script>"""

once("""console.log('[GC] SWEEP: floating buttons keep off the page, duplicate check said plainly.');
})();

</script>
""", """console.log('[GC] SWEEP: floating buttons keep off the page, duplicate check said plainly.');
})();

</script>""" + JS + "\n")
open(p, 'w', encoding='utf-8').write(t); print('DUPACT: patched')
