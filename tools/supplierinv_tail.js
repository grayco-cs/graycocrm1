<script>/*__GC_PATCH_SUPPLIERINV__ (owner 11/9, screenshot of Sub Invoices: "a lot of these are suppliers — let's make supplier invoices so
  the material invoices can be separate from my subs").
  Sub Invoices gets two tabs: 👷 Sub invoices · 🧱 Supplier invoices. A bill is a supplier's when its payee is not in the Subs list
  and is on the Vendors list, or its name reads like a supplier (supply, lumber, building products, hardware, paint, rental,
  Home Depot, Lowe's, ABC, Beacon, Ferguson, Sherwin, Farrell Calhoun, media / marketing …). Supplier rows no longer say
  "not in your sub list". Picking a sub in a row's Sub box makes it a sub invoice again; "🧱 Supplier" / "👷 Sub" on the tab bar's
  list of names changes one payee for good (saved with the vendors list). API: window._gcIsSupplierInv(inv) */
(function(W){
'use strict';
var D = W.document;
var SUP = /\b(suppl(y|ies|ier)|lumber|building products|materials?|hardware|home ?depot|lowe'?s|menards|ferguson|beacon|srs distribution|abc supply|gates|84 lumber|sherwin|farrell[- ]?calhoun|paint|ppg|benjamin moore|rentals?|sunbelt|united rentals|herc|equipment|electric(al)? supply|plumbing supply|hd supply|grainger|fastenal|white cap|tile shop|floor ?& ?decor|lansing|alside|abc|aagm|media|marketing|advertis|printing|sign(s| shop)|dumpster|waste|disposal|concrete supply|ready ?mix|stone|block)\b/i;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase().replace(/&amp;/g, '&'); }
function crm(){ return W._crm || {}; }
function names(list, pred){ var o = {}; (list || []).forEach(function(x){ if (x && x.name && (!pred || pred(x))) o[low(x.name)] = 1; }); return o; }
function overrides(){ try { return JSON.parse(localStorage.getItem('gc_payee_kind') || '{}') || {}; } catch (e) { return {}; } }
function kindOf(name){
  var n = low(name); if (!n) return '';
  var o = overrides(); if (o[n]) return o[n];
  var v = (crm().vendors || []).find(function(x){ return x && low(x.name) === n; }); if (v && v.payeeKind) return v.payeeKind;
  if (names(crm().subs, function(x){ return x.isSub !== false; })[n]) return 'sub';
  if (names(crm().vendors)[n] || names(crm().subs, function(x){ return x.isSub === false; })[n]) return 'supplier';
  return SUP.test(n) ? 'supplier' : '';
}
function isSupplier(inv){ if (!inv) return false; if (inv.payeeType === 'supplier') return true; if (inv.payeeType === 'sub') return false; return kindOf(inv.sub || inv.vendor || inv.payee) === 'supplier'; }
W._gcIsSupplierInv = isSupplier;
W._gcInvTab = W._gcInvTab || 'subs';
function setKind(name, kind){
  var o = overrides(); o[low(name)] = kind; try { localStorage.setItem('gc_payee_kind', JSON.stringify(o)); } catch (e) {}
  /* shared: on the vendor record (the vendors list syncs to everyone) */
  try {
    var V = (crm().vendors || []).slice(), i = V.findIndex(function(x){ return x && low(x.name) === low(name); }), now = new Date().toISOString();
    if (i > -1) V[i] = Object.assign({}, V[i], { payeeKind: kind, updatedAt: now }); else if (kind === 'supplier') V.push({ id: 'V' + Date.now().toString(36), name: s(name).replace(/&amp;/g, '&'), payeeKind: 'supplier', addedFrom: 'Sub Invoices', createdAt: now, updatedAt: now });
    if (W._setVendors) W._setVendors(V); else if (W._crm) W._crm.vendors = V;
    if (W._gcApplySync) W._gcApplySync('vendors', V);
  } catch (e) {}
  redraw();
}
function redraw(){ try { if (W._setInvoices) W._setInvoices(function(p){ return Array.isArray(p) ? p.slice() : p; }); } catch (e) {} SIG = ''; }
function subInvs(){ return (crm().invoices || crm().invs || []).filter(function(x){ return x && x.type === 'sub'; }); }
function table(){
  var ths = D.querySelectorAll('th'); for (var i = 0; i < ths.length; i++) { if (s(ths[i].textContent).toUpperCase() === 'PO#') { var tr = ths[i].parentElement, t = tr && tr.textContent.toUpperCase(); if (t && t.indexOf('SUB') > -1 && t.indexOf('ON TIME') > -1) return ths[i].closest('table'); } }
  return null;
}
var SIG = '';
function paint(){
  try {
    var t = table(), bar = D.getElementById('gc-supbar');
    if (!t) { if (bar) bar.remove(); return; }
    var L = subInvs(), nSup = L.filter(isSupplier).length, nSub = L.length - nSup, tab = W._gcInvTab;
    var sig = tab + '|' + nSub + '|' + nSup;
    if (!bar) { bar = D.createElement('div'); bar.id = 'gc-supbar'; bar.setAttribute('data-gc-keep', '1'); bar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px;font:13px Inter,Arial,sans-serif'; }
    var host = t.parentElement; if (bar.parentElement !== host.parentElement || bar.nextElementSibling !== host) host.parentElement.insertBefore(bar, host);
    if (sig === SIG) return; SIG = sig;
    var b = function(k, lab, n){ var on = tab === k; return '<button type="button" data-supt="' + k + '" style="border:1px solid ' + (on ? '#0F1D2F' : '#cbd5e1') + ';background:' + (on ? '#0F1D2F' : '#fff') + ';color:' + (on ? '#fff' : '#0f172a') + ';border-radius:999px;padding:7px 14px;font-weight:700;cursor:pointer;min-height:36px">' + lab + ' (' + n + ')</button>'; };
    bar.innerHTML = b('subs', '👷 Sub invoices', nSub) + b('suppliers', '🧱 Supplier invoices', nSup) +
      '<span style="color:#64748b;font-size:12px">' + (tab === 'suppliers' ? 'Material and supplier bills — kept apart from your subs. Wrong one? Pick the sub in its Sub box, or ' : 'A supplier landed here? ') + '<button type="button" data-supfix style="border:0;background:none;color:#1d4ed8;font-weight:700;cursor:pointer;padding:0">fix a name</button></span>';
  } catch (e) {}
}
function fixSheet(){
  var L = subInvs(), seen = {}, rows = [];
  L.forEach(function(x){ var n = s(x.sub); if (n && !seen[low(n)]) { seen[low(n)] = 1; rows.push({ n: n.replace(/&amp;/g, '&'), sup: isSupplier(x) }); } });
  rows.sort(function(a, b){ return a.n.localeCompare(b.n); });
  var ov = D.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;z-index:100010;background:rgba(15,29,47,.5);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';
  ov.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:560px;width:100%;padding:16px;font:14px Inter,Arial,sans-serif;color:#0f172a"><b style="font-size:16px">Who is a sub, who is a supplier?</b><div style="color:#64748b;font-size:12.5px;margin:4px 0 10px">Changes every bill from that name, now and later.</div>' +
    rows.map(function(r, i){ return '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #f1f5f9;padding:6px 0"><span>' + r.n.replace(/</g, '&lt;') + '</span><span><button type="button" data-k="sub" data-i="' + i + '" style="border:1px solid #cbd5e1;border-radius:8px;padding:5px 10px;font-weight:700;cursor:pointer;background:' + (r.sup ? '#fff' : '#0F1D2F;color:#fff') + '">👷 Sub</button> <button type="button" data-k="supplier" data-i="' + i + '" style="border:1px solid #cbd5e1;border-radius:8px;padding:5px 10px;font-weight:700;cursor:pointer;background:' + (r.sup ? '#0F1D2F;color:#fff' : '#fff') + '">🧱 Supplier</button></span></div>'; }).join('') +
    '<div style="text-align:right;margin-top:10px"><button type="button" data-close style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer">Done</button></div></div>';
  ov.addEventListener('click', function(e){ var t = e.target; if (t === ov || t.hasAttribute('data-close')) { ov.remove(); return; } if (t.hasAttribute('data-k')) { setKind(rows[+t.getAttribute('data-i')].n, t.getAttribute('data-k')); ov.remove(); fixSheet(); } });
  D.body.appendChild(ov);
}
D.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target.closest('#gc-supbar [data-supt], #gc-supbar [data-supfix]') : null; if (!t) return;
  if (t.hasAttribute('data-supfix')) { fixSheet(); return; }
  W._gcInvTab = t.getAttribute('data-supt'); redraw();
});
setInterval(paint, 1500);
W._gcSupplierInv = { kindOf: kindOf, isSupplier: isSupplier, setKind: setKind, paint: paint };
})(window);
</script>
