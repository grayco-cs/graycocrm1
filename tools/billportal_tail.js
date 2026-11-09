<script>/*__GC_PATCH_BILLPORTAL__ (owner 11/9: "make sure I can enter links for customer-supplied portals — if they have a way to enter info to
  get paid; Enterprise has a Coupa portal, it's new").
  Job page → "💳 Customer billing portal": the customer's own supplier / AP portal (Coupa, Ariba, Oracle iSupplier, Jaggaer…):
  name, link, our supplier / vendor ID, the login e-mail, how invoices are submitted, PO required, notes. Saved on the CUSTOMER
  (so every job for that customer shows it) — or on the job when the customer is not in the Customers list. No passwords are
  kept here (a password manager is the place). "✓ Invoice submitted in the portal" records who / when on the job. */
(function(W){
'use strict';
var D = W.document;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function proj(pid){ return ((W._crm && W._crm.projects) || []).find(function(p){ return p && s(p.id) === s(pid); }) || null; }
function cust(p){ var C = (W._crm && W._crm.customers) || [], n = low(p.client || p.customer || p.clientName);
  return C.find(function(c){ return c && p.customerId && s(c.id) === s(p.customerId); }) || (n ? C.find(function(c){ return c && low(c.name || c.company) === n; }) : null) || null; }
function portals(p){ var c = cust(p); return (c && Array.isArray(c.billingPortals) ? c.billingPortals : []).map(function(x){ return Object.assign({ _on: 'customer' }, x); }).concat((Array.isArray(p.billingPortals) ? p.billingPortals : []).map(function(x){ return Object.assign({ _on: 'job' }, x); })).filter(function(x){ return x && !x.removed; }); }
function me(){ try { return s(JSON.parse(localStorage.getItem('grayco_user') || '{}').name) || 'someone'; } catch (e) { return 'someone'; } }
function urlOk(u){ return /^https:\/\/[^\s"'<>]{4,500}$/i.test(s(u)); }
function saveOn(p, rec, remove){
  var c = cust(p), now = new Date().toISOString();
  var upd = function(arr){ arr = Array.isArray(arr) ? arr.slice() : []; var i = arr.findIndex(function(x){ return x && x.id === rec.id; }); if (remove) { if (i > -1) arr[i] = Object.assign({}, arr[i], { removed: true, updatedAt: now }); } else if (i > -1) arr[i] = Object.assign({}, arr[i], rec, { updatedAt: now }); else arr.push(Object.assign({}, rec, { at: now, by: me(), updatedAt: now })); return arr; };
  if (c && (rec._on !== 'job')) {
    var fc = function(list){ return (list || []).map(function(x){ return x && s(x.id) === s(c.id) ? Object.assign({}, x, { billingPortals: upd(x.billingPortals), updatedAt: now }) : x; }); };
    var nextC = fc((W._crm && W._crm.customers) || []);
    try { if (W._setCustomers) W._setCustomers(function(prev){ return fc(Array.isArray(prev) && prev.length ? prev : nextC); }); } catch (e) {}
    if (W._crm) W._crm.customers = nextC;
    try { if (W._gcApplySync && W._crm) W._gcApplySync('customers', W._crm.customers); } catch (e) {}
  } else {
    var fp = function(list){ return (list || []).map(function(x){ return x && s(x.id) === s(p.id) ? Object.assign({}, x, { billingPortals: upd(x.billingPortals), updatedAt: now }) : x; }); };
    if (W._setProjects) W._setProjects(fp); else if (W._crm) W._crm.projects = fp(W._crm.projects);
    try { if (W._gcApplySync && W._crm) W._gcApplySync('projects', W._crm.projects); } catch (e) {}
  }
}
function submitted(p, x){
  var now = new Date().toISOString(), f = function(list){ return (list || []).map(function(q){ if (!q || s(q.id) !== s(p.id)) return q; var a = (Array.isArray(q.portalSubmits) ? q.portalSubmits : []).concat([{ portal: s(x.name), at: now, by: me() }]).slice(-50); return Object.assign({}, q, { portalSubmits: a, updatedAt: now }); }); };
  if (W._setProjects) W._setProjects(f); else if (W._crm) W._crm.projects = f(W._crm.projects);
  try { if (W._gcApplySync && W._crm) W._gcApplySync('projects', W._crm.projects); } catch (e) {}
}
var FIELDS = [['name', 'Portal name (e.g. Coupa — Enterprise)'], ['url', 'Link (https://…)'], ['supplierId', 'Our supplier / vendor ID'], ['login', 'Login e-mail / user (no password)'], ['how', 'How invoices go in (e.g. flip the PO into an invoice, attach the PDF)'], ['notes', 'Notes (terms, contact, where the password is kept)']];
function form(p, rec){
  rec = rec || { id: 'bp_' + Date.now().toString(36), name: '', url: '' };
  var old = D.getElementById('gc-bp-f'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gc-bp-f'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:100010;background:rgba(15,29,47,.5);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';
  var c = cust(p);
  ov.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:560px;width:100%;padding:16px;font:14px Inter,Arial,sans-serif;color:#0f172a"><b style="font-size:16px">💳 Customer billing portal</b>'
    + '<div style="color:#64748b;font-size:12.5px;margin:4px 0 10px">' + (c ? 'Saved on the customer <b>' + esc(c.name || c.company) + '</b> — every job for them shows it.' : 'This customer is not in the Customers list yet — saved on this job.') + ' Do not type passwords here.</div>'
    + FIELDS.map(function(f){ return '<label style="display:block;font-size:12px;font-weight:700;color:#475569;margin:8px 0 3px">' + esc(f[1]) + '</label>' + (f[0] === 'how' || f[0] === 'notes' ? '<textarea data-bp="' + f[0] + '" rows="2" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit">' + esc(rec[f[0]]) + '</textarea>' : '<input data-bp="' + f[0] + '" value="' + esc(rec[f[0]]) + '" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit">'); }).join('')
    + '<label style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" data-bp="poRequired"' + (rec.poRequired ? ' checked' : '') + '> Their PO is required on every invoice</label>'
    + '<div data-bp-msg style="color:#b91c1c;font-size:13px;min-height:18px;margin-top:6px"></div><div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px">'
    + (rec.at ? '<button type="button" data-bp-del style="border:1px solid #fca5a5;background:#fff;color:#b91c1c;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer">Remove</button>' : '<span></span>')
    + '<span><button type="button" data-bp-x style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer">Cancel</button> <button type="button" data-bp-save style="border:0;background:#0F1D2F;color:#fff;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer">Save</button></span></div></div>';
  D.body.appendChild(ov);
  ov.addEventListener('click', function(e){
    var t = e.target; if (t === ov || t.hasAttribute('data-bp-x')) { ov.remove(); return; }
    if (t.hasAttribute('data-bp-del')) { if (W.confirm('Remove this portal?')) { saveOn(p, rec, true); ov.remove(); setTimeout(function(){ paint(true); }, 400); } return; }
    if (!t.hasAttribute('data-bp-save')) return;
    var v = { id: rec.id, _on: rec._on };
    [].forEach.call(ov.querySelectorAll('[data-bp]'), function(i){ v[i.getAttribute('data-bp')] = i.type === 'checkbox' ? i.checked : s(i.value).slice(0, i.tagName === 'TEXTAREA' ? 1000 : 300); });
    var msg = ov.querySelector('[data-bp-msg]');
    if (!v.name) { msg.textContent = 'Give it a name (e.g. Coupa — Enterprise).'; return; }
    if (v.url && !urlOk(v.url)) { msg.textContent = 'The link must start with https://'; return; }
    if (/pass(word)?\s*[:=]/i.test((v.notes || '') + ' ' + (v.how || '') + ' ' + (v.login || ''))) { msg.textContent = 'Looks like a password — keep passwords in a password manager, not here.'; return; }
    delete v._on; if (rec._on === 'job') v._on = 'job';
    saveOn(p, Object.assign({}, v, { _on: rec._on }), false); ov.remove(); setTimeout(function(){ paint(true); }, 400);
  });
}
function findBack(){ var m = D.querySelector('main'); if (!m) return null; var bs = m.getElementsByTagName('button'); for (var i = 0; i < bs.length && i < 80; i++) if (/^\s*←\s*All Projects\s*$/.test(bs[i].textContent || '')) return bs[i]; return null; }
var LAST = {};
function paint(force){
  try {
    var op = W._gcOpenProject, p = op && op.id ? proj(op.id) : null, cur = D.getElementById('gc-bp');
    if (!p) { if (cur) cur.remove(); return; }
    var back = findBack(); if (!back || typeof W._gcJobBox !== 'function') return;
    var box = W._gcJobBox(back); if (!box) return;
    var P = portals(p), last = (Array.isArray(p.portalSubmits) ? p.portalSubmits : []).slice(-1)[0];
    var body = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:15px">💳 Customer billing portal</b><button type="button" data-bp-add style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:5px 10px;font:700 12.5px Inter,Arial,sans-serif;cursor:pointer">＋ Add a portal</button></div>'
      + (P.length ? P.map(function(x, i){ return '<div style="border-top:1px solid #f1f5f9;padding:8px 0;font-size:13.5px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><b>' + esc(x.name) + '</b><span>'
          + (urlOk(x.url) ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" style="border:0;background:#0F1D2F;color:#fff;border-radius:8px;padding:6px 12px;font-weight:700;text-decoration:none;display:inline-block">🔗 Open portal</a> ' : '')
          + '<button type="button" data-bp-sub="' + i + '" style="border:1px solid #86efac;background:#f0fdf4;color:#166534;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer">✓ Invoice submitted</button> <button type="button" data-bp-edit="' + i + '" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer">✏️</button></span></div>'
          + '<div style="color:#475569;font-size:12.5px;margin-top:3px">' + [x.supplierId ? 'Supplier ID: <b>' + esc(x.supplierId) + '</b>' : '', x.login ? 'Login: ' + esc(x.login) : '', x.poRequired ? '<b style="color:#b45309">Their PO required on every invoice</b>' : ''].filter(Boolean).join(' · ') + '</div>'
          + (x.how ? '<div style="font-size:12.5px;margin-top:3px">📤 ' + esc(x.how) + '</div>' : '') + (x.notes ? '<div style="color:#64748b;font-size:12px;margin-top:2px">' + esc(x.notes) + '</div>' : '') + '</div>'; }).join('')
        + '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px 9px;font-size:12.5px;margin-top:4px">Invoices for this customer get paid only when they are entered in their portal' + (last ? ' · last submitted ' + esc(s(last.at).slice(0, 10)) + ' by ' + esc(last.by) : '') + '.</div>'
        : '<div style="color:#64748b;font-size:12.5px;margin-top:4px">Does this customer pay through their own portal (Coupa, Ariba, iSupplier…)? Add it so everyone knows where invoices go.</div>');
    if (!cur) { cur = D.createElement('div'); cur.id = 'gc-bp'; cur.setAttribute('data-gc-keep', '1'); cur.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-left:4px solid #0F1D2F;border-radius:12px;padding:12px 14px;margin:0 0 10px;font:14px Inter,Arial,sans-serif;color:#0f172a'; }
    if (force || cur.__b !== body || cur.getAttribute('data-pid') !== s(p.id)) { var nu = cur.cloneNode(false); nu.innerHTML = body; nu.__b = body; nu.setAttribute('data-pid', p.id); nu.__P = P; if (cur.parentElement) cur.parentElement.replaceChild(nu, cur); cur = nu; }
    else cur.__P = P;
    if (cur.parentElement !== box) box.appendChild(cur);
  } catch (e) {}
}
D.addEventListener('click', function(e){
  var c = D.getElementById('gc-bp'); if (!c || !c.contains(e.target)) return; var t = e.target.closest('button'); if (!t) return;
  var p = proj(c.getAttribute('data-pid')); if (!p) return; var P = portals(p);
  if (t.hasAttribute('data-bp-add')) form(p, null);
  else if (t.hasAttribute('data-bp-edit')) form(p, P[+t.getAttribute('data-bp-edit')]);
  else if (t.hasAttribute('data-bp-sub')) { var x = P[+t.getAttribute('data-bp-sub')]; if (x && W.confirm('Record that the invoice was entered in ' + x.name + '?')) { submitted(p, x); setTimeout(function(){ paint(true); }, 400); } }
});
setInterval(function(){ paint(false); }, 1500);
W._gcBillPortal = { portals: portals, paint: paint, form: form };
})(window);
</script>
