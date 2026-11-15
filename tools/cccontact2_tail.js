/* __GC_PATCH_CCCONTACT2__ — 🚀 Convert to job needs a phone or e-mail (owner 11/5: "to enter the job in the crm at all a phone number
   or email has to be in the crm"; 11/15 list, item 3b). A lead with no 10-digit phone and no e-mail (its own, its contact's, the number
   that texted / called in, or its linked customer's) stops at 🚀 Convert to job with a small box: Phone / E-mail → saved on the lead,
   then it goes on to Launch Job as before (Launch Job's own JOBCONTACT check still runs). API: window._gcLeadContact = { has(lead), ask(id) } */
(function(W){
'use strict';
if (W.__GC_PATCH_CCCONTACT2__) return; W.__GC_PATCH_CCCONTACT2__ = true;
var D = W.document;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ph10(v){ var d = s(v).replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? d : ''; }
function okEmail(v){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(v)); }
function leads(){ return (W._crm && W._crm.leads) || []; }
function lead(id){ return leads().find(function(l){ return l && s(l.id) === s(id); }) || null; }
function has(l){
  if (!l) return true;
  var c = l.contact || {}, ex = l.leadExtra || {};
  if ([l.phone, l.clientPhone, l.mobile, c.phone, ex.smsFrom, l.smsFrom].some(ph10) || [l.email, l.clientEmail, c.email].some(okEmail)) return true;
  var C = (W._crm && W._crm.customers) || [], cu = C.find(function(x){ return x && ((l.customerId && s(x.id) === s(l.customerId)) || (s(l.client || l.name) && low(x.name) === low(l.client || l.name))); });
  return !!(cu && (ph10(cu.phone || cu.mobile) || okEmail(cu.email)));
}
function save(id, ph, em){
  var now = new Date().toISOString();
  var f = function(list){ var out = (list || []).map(function(l){ if (!l || s(l.id) !== s(id)) return l; var o = Object.assign({}, l, { updatedAt: now }); if (ph) o.phone = ph; if (em) o.email = em; if (o.contact && typeof o.contact === 'object') o.contact = Object.assign({}, o.contact, ph ? { phone: ph } : {}, em ? { email: em } : {}); return o; }); try { if (W._gcApplySync) W._gcApplySync('leads', out); } catch (e) {} return out; };
  if (typeof W._setLeads === 'function') W._setLeads(f); else if (W._crm) W._crm.leads = f(W._crm.leads);
}
function ask(id, then){
  var l = lead(id); if (!l) return;
  var old = D.getElementById('gc-lc-ov'); if (old) old.remove();
  var o = D.createElement('div'); o.id = 'gc-lc-ov'; o.setAttribute('data-gc-keep', '1'); o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Phone or e-mail first');
  o.style.cssText = 'position:fixed;inset:0;z-index:2147483300;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;font:14px Inter,Arial,sans-serif';
  var I = 'width:100%;box-sizing:border-box;min-height:42px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:9px;font:15px Inter,Arial,sans-serif;margin-top:4px';
  o.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:14px;max-width:420px;width:100%;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.3)">'
    + '<div style="font-weight:800;font-size:17px;margin-bottom:4px">📇 Add the customer\'s phone or e-mail first</div>'
    + '<div style="color:#475569;margin-bottom:8px"><b>' + esc(l.name || l.client || 'This lead') + '</b> has no phone or e-mail. Every job needs one — one is enough.</div>'
    + '<label style="display:block;font-weight:600">Phone<input data-lc="ph" type="tel" inputmode="tel" style="' + I + '"></label>'
    + '<label style="display:block;font-weight:600;margin-top:8px">or e-mail<input data-lc="em" type="email" style="' + I + '"></label>'
    + '<div data-lc="err" role="alert" style="color:#b91c1c;font-size:12.5px;min-height:16px;margin-top:6px"></div>'
    + '<div style="display:flex;gap:8px;margin-top:6px"><button type="button" data-lc="ok" style="flex:1;min-height:44px;border:0;border-radius:10px;background:#241968;color:#fff;font:700 15px Inter,Arial,sans-serif;cursor:pointer">Save and convert</button>'
    + '<button type="button" data-lc="x" style="min-height:44px;padding:0 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;cursor:pointer">Cancel</button></div></div>';
  D.body.appendChild(o);
  try { o.querySelector('[data-lc="ph"]').focus(); } catch (e) {}
  o.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-lc]');
    if (e.target === o || (b && b.getAttribute('data-lc') === 'x')) { o.remove(); return; }
    if (!b || b.getAttribute('data-lc') !== 'ok') return;
    var ph = s(o.querySelector('[data-lc="ph"]').value), em = s(o.querySelector('[data-lc="em"]').value);
    if (!ph10(ph) && !okEmail(em)) { o.querySelector('[data-lc="err"]').textContent = 'A 10-digit phone or an e-mail, please.'; return; }
    save(id, ph10(ph) ? ph : '', okEmail(em) ? em : ''); o.remove();
    if (then) W.setTimeout(then, 250);
  });
}
D.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target.closest('#gcl-drawer [data-d="convert"]') : null; if (!t) return;
  var H = W._gcLeadsHub, id = H && H.ui && H.ui().open, l = id && lead(id); if (!l || has(l)) return;
  e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  ask(id, function(){ var b = D.querySelector('#gcl-drawer [data-d="convert"]'); if (b) b.click(); });
}, true);
W._gcLeadContact = { has: has, ask: ask };
})(window);
