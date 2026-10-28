/* __GC_PATCH_MAILFIX__ — 📬 MAIL RECEIVED (owner 10/27: an invoice forwarded to invoices@ vanished without a trace)
   The last 50 e-mails that reached invoices@ / receipts@ / leads@ / bids@: when, from, subject and what the CRM did with
   it (saved on job X · waiting to match · ignored: why). Kept by the server (bid-inbox.js, the inbox's private table key
   "gc_mail_recv" — never gc_kv) and read through /.netlify/functions/bid-inbox?mailrecv=1 (signed in; admins and the
   office). "↻ Run again" reads a dropped e-mail again from Resend (POST { op: 'rerun', id }).
   Shown at the bottom of ✅ Approvals (admin / office) and on ⚙ Admin. API: window._gcMailRecv = { load, open } */
(function(){
'use strict';
if (window.__GC_PATCH_MAILFIX__) return; window.__GC_PATCH_MAILFIX__ = true;
var W = window, D = document;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function me(){ try { if (typeof W._gcMeUser === 'function') { var u = W._gcMeUser(); if (u) return u; } } catch (e) {} return {}; }
function allowed(){ var u = me(); return /^(admin|office)/i.test(s(u.role)) || /^office/i.test(s(u.profile)) || s(u.payType).toLowerCase() === 'owner'; }
var FN = '/.netlify/functions/bid-inbox?mailrecv=1';
var M = { rows: [], at: 0, busy: false, err: '', denied: false, open: false, msg: '' };
var els = [];

function api(body){
  return W.fetch(FN, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' } : { cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (r.status === 403) M.denied = true; if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
}
function load(force){
  if (M.busy || M.denied) return Promise.resolve(M);
  if (!force && Date.now() - M.at < 60000) return Promise.resolve(M);
  M.busy = true;
  return api().then(function(j){ M.rows = Array.isArray(j.rows) ? j.rows : []; M.err = ''; }, function(e){ M.err = s(e && e.message); })
    .then(function(){ M.busy = false; M.at = Date.now(); paint(); return M; });
}
function when(v){ var d = new Date(v); if (isNaN(d)) return ''; return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function color(r){ return r.stored ? '#16a34a' : /^waiting/.test(s(r.what)) ? '#d97706' : '#dc2626'; }
function rowsHtml(){
  if (M.err) return '<div style="color:#fca5a5;padding:6px 0">Could not read the list: ' + esc(M.err) + '</div>';
  if (!M.rows.length) return '<div style="color:#8fa8c4;padding:6px 0">' + (M.busy || !M.at ? 'Loading…' : 'No e-mail to invoices@, receipts@, leads@ or bids@ yet (the list starts with this update).') + '</div>';
  return M.rows.map(function(r){
    var dropped = !r.stored && r.retry;
    return '<div style="border-left:3px solid ' + color(r) + ';padding:6px 8px;margin:6px 0;background:rgba(255,255,255,.04);border-radius:6px">' +
      '<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="color:#e2e8f0">' + esc(r.inbox) + '@</b><span style="color:#8fa8c4;font-size:12px">' + esc(when(r.at)) + '</span>' +
      '<span style="color:#cbd5e1;font-size:12px;overflow-wrap:anywhere">' + esc(r.fromName ? r.fromName + ' <' + r.from + '>' : r.from) + '</span></div>' +
      '<div style="color:#fff;font-size:13px;overflow-wrap:anywhere">' + esc(r.subject || '(no subject)') + '</div>' +
      '<div style="color:' + color(r) + ';font-size:12px;overflow-wrap:anywhere">' + esc(r.what) + (r.reruns ? ' · run again ×' + esc(r.reruns) : '') + '</div>' +
      (dropped ? '<button type="button" data-mr-rerun="' + esc(r.id) + '" style="margin-top:4px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;padding:5px 10px;font-weight:700;cursor:pointer">↻ Run again</button>' : '') +
      '</div>';
  }).join('');
}
function make(){
  var d = D.createElement('details'); d.className = 'gc-mailrecv';
  d.style.cssText = 'margin:14px 0;padding:10px 12px;border-radius:12px;background:#0f2440;border:1px solid rgba(255,255,255,.1);color:#e2e8f0;font-family:inherit;max-width:860px';
  d.innerHTML = '<summary style="cursor:pointer;font-weight:800;font-size:14px">📬 Mail received <span data-mr-n style="color:#8fa8c4;font-weight:600;font-size:12px"></span></summary>' +
    '<div style="color:#8fa8c4;font-size:12px;margin:6px 0">The last 50 e-mails to invoices@, receipts@, leads@ and bids@, and what the CRM did with each. ' +
    '<a href="#" data-mr-reload style="color:#60a5fa">Refresh</a></div><div data-mr-msg style="color:#86efac;font-size:12px"></div><div data-mr-list></div>';
  d.addEventListener('toggle', function(){ M.open = d.open; if (d.open) load(true); });
  d.addEventListener('click', function(e){
    var t = e.target; if (!t || !t.closest) return;
    if (t.closest('[data-mr-reload]')) { e.preventDefault(); load(true); return; }
    var b = t.closest('[data-mr-rerun]'); if (!b) return;
    b.disabled = true; b.textContent = 'Running…';
    api({ op: 'rerun', id: b.getAttribute('data-mr-rerun') }).then(function(j){ M.msg = j.queued ? 'Reading it again — refresh in a minute.' : ('Done: ' + s(j.outcome)); }, function(e){ M.msg = 'Could not run it again: ' + s(e && e.message); })
      .then(function(){ paint(); W.setTimeout(function(){ load(true); }, 1500); });
  });
  return d;
}
function paint(){
  var bad = M.rows.filter(function(r){ return !r.stored; }).length;
  els.forEach(function(d){
    if (d.open !== M.open) d.open = M.open;
    var n = d.querySelector('[data-mr-n]'); if (n) n.textContent = M.rows.length ? '(' + M.rows.length + (bad ? ' · ' + bad + ' not kept' : '') + ')' : '';
    var m = d.querySelector('[data-mr-msg]'); if (m) m.textContent = M.msg;
    var l = d.querySelector('[data-mr-list]'); if (l && d.open) { var h = rowsHtml(); if (l.__h !== h) { l.innerHTML = h; l.__h = h; } }
  });
}
/* ✅ Approvals (the overlay re-renders its list: the card is put back at the bottom) and ⚙ Admin */
var A = null, B = null;
function mount(){
  if (M.denied || !allowed()) { els.forEach(function(d){ if (d.parentNode) d.parentNode.removeChild(d); }); return; }
  var list = D.querySelector('#_gcApprOv ._apList');
  if (list) { if (!A) { A = make(); els.push(A); } if (A.parentNode !== list || list.lastElementChild !== A) list.appendChild(A); }
  var main = D.querySelector('main'), h1 = null;
  if (main) { var hs = main.querySelectorAll('h1'); for (var i = 0; i < hs.length; i++) if (s(hs[i].textContent) === 'Admin') { h1 = hs[i]; break; } }
  if (h1) {
    if (!B) { B = make(); B.style.background = '#0f2440'; els.push(B); }
    if (!B.isConnected) { var x9 = D.getElementById('gc-x9-admin'); if (x9 && x9.parentNode) x9.parentNode.insertBefore(B, x9.nextSibling); else h1.parentNode.insertBefore(B, h1.nextSibling); }
  } else if (B && B.isConnected) B.parentNode.removeChild(B);
}
RI.call(W, function(){ try { mount(); } catch (e) {} }, 1000);
W._gcMailRecv = { load: load, open: function(){ M.open = true; load(true); paint(); }, state: M };
try { console.log('[GC] 📬 Mail received: the last 50 e-mails to invoices@ / receipts@ / leads@ / bids@ (patch MAILFIX)'); } catch (e) {}
})();
