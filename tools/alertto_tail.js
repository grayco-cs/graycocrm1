/* __GC_PATCH_ALERTTO__ ═══════════════════════════════════════════════════
   GrayCo — "⚙ Lead & bid alert e-mails go to:" in the Lead settings.   (patch ALERTTO)
   The new-lead / new-bid e-mail, the bid-due reminder and the 4 h / 24 h assign reminders go to this list (default
   office@grayco-cs.com) — not to every admin. Whoever a lead is assigned to still gets their own e-mails. The 🚨
   emergency alert is not affected. Kept by bid-inbox ?settings=1 → gc_lead_inbox_settings.alertTo. Admins change it. */
(function(){
'use strict';
var W = window, ID = 'gc-alertto-set', DEF = ['office@grayco-cs.com'];
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function cache(){ try { return JSON.parse(localStorage.getItem('gc_ldi_cache_v2') || 'null') || {}; } catch (e) { return {}; } }
function saveCache(k){ try { localStorage.setItem('gc_ldi_cache_v2', JSON.stringify(k)); } catch (e) {} }
function alertTo(){ var k = cache(), a = k.settings && k.settings.alertTo; a = Array.isArray(a) ? a.map(low).filter(Boolean) : []; return a.length ? a : DEF; }
function isAdmin(){
  try { if (W._gcVAS && W._gcVAS.active()) return false; } catch (e) {}
  try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {}
  try { var me = W._gcMeNow || {}; return me.role === 'Admin' || low(me.payType) === 'owner'; } catch (e) { return false; }
}
function barHtml(){
  return '<span style="font-weight:700">⚙ Lead &amp; bid alert e-mails go to:</span> '
    + alertTo().map(function(e){ return '<span style="display:inline-block;margin:0 4px 0 0;padding:1px 8px;border-radius:10px;background:#eef2ff;border:1px solid #c7d2fe">' + esc(e) + '</span>'; }).join('')
    + ' <span style="color:#64748b">— new leads and bids, bid-due and assign reminders. The assigned person is e-mailed too.</span>'
    + (isAdmin() ? ' <button type="button" data-at="pick" style="margin-left:6px;padding:2px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer">Change</button>' : '');
}
function mount(){
  var d = document.getElementById('gcl-settings'), body = d && d.querySelector('.gcl-set-body'), html = barHtml();
  if (!body || !body.parentNode) return;
  var cur = document.getElementById(ID), parent = body.parentNode;
  if (cur && cur.parentNode === parent) { if (cur.getAttribute('data-sig') !== html) { cur.innerHTML = html; cur.setAttribute('data-sig', html); } return; }
  if (cur) cur.remove();
  cur = document.createElement('div'); cur.id = ID; cur.setAttribute('data-gc-keep', '1'); cur.setAttribute('data-sig', html); cur.innerHTML = html;
  cur.style.cssText = 'font-size:13px;padding:10px 14px;border-bottom:1px solid #e7e3f5;background:#fbfaff';
  parent.insertBefore(cur, body);
}
var POP = null;
function close(){ if (POP) { try { POP.remove(); } catch (e) {} POP = null; } }
function pick(btn){
  if (!isAdmin()) return;
  close();
  var r = btn.getBoundingClientRect(), z = 2147483002;
  var p = document.createElement('div'); p.id = 'gc-alertto-pop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Lead and bid alert e-mails go to'); p.setAttribute('data-gc-keep', '1');
  p.style.cssText = 'position:fixed;z-index:' + z + ';background:#fff;color:#1a1a1a;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:14px;width:min(360px,calc(100vw - 24px));left:' + Math.max(12, Math.min(W.innerWidth - 372, r.left)) + 'px;top:' + Math.max(12, Math.min(W.innerHeight - 260, r.bottom + 6)) + 'px';
  p.innerHTML = '<div style="font-weight:700;margin-bottom:6px">⚙ Lead &amp; bid alert e-mails go to</div>'
    + '<div style="font-size:12px;color:#475569;margin-bottom:8px">One or more e-mail addresses, separated by commas. Emergency alerts are not changed (on-call PM, admins and office).</div>'
    + '<input class="gc-at-in" type="text" aria-label="Alert e-mail addresses" style="width:100%;padding:6px;box-sizing:border-box" value="' + esc(alertTo().join(', ')) + '">'
    + '<div class="gc-at-err" role="alert" style="color:#b91c1c;font-size:12px;min-height:16px;margin-top:6px"></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-at="save" style="padding:5px 14px;background:#241968;color:#fff;border:0;border-radius:6px;cursor:pointer">Save</button><button type="button" data-at="x" style="padding:5px 12px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">Cancel</button></div>';
  document.body.appendChild(p); POP = p;
}
function save(){
  var p = POP; if (!p) return;
  var list = s(p.querySelector('.gc-at-in').value).split(/[,;\s]+/).map(low).filter(Boolean), err = p.querySelector('.gc-at-err');
  var bad = list.filter(function(e){ return !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e); });
  if (bad.length) { err.textContent = '"' + bad[0] + '" does not look like an e-mail address.'; return; }
  if (!list.length) list = DEF.slice();
  var btn = p.querySelector('[data-at="save"]'); btn.disabled = true; btn.textContent = 'Saving…';
  W.fetch('/.netlify/functions/bid-inbox?settings=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alertTo: list }), cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok) throw new Error(j.error || 'The setting could not be saved (' + r.status + ').'); return j; }); })
    .then(function(){ var k = cache(); k.settings = Object.assign({}, k.settings || {}, { alertTo: list }); saveCache(k); close(); mount(); },
      function(e){ btn.disabled = false; btn.textContent = 'Save'; err.textContent = s(e && e.message); });
}
document.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('[data-at]'); if (!b) { if (POP && !POP.contains(e.target)) close(); return; }
  var a = b.getAttribute('data-at'); if (a === 'pick') pick(b); else if (a === 'save') save(); else if (a === 'x') close();
}, true);
var asked = false;
function load(){
  if (asked) return; var k0 = cache(); if (k0.settings && Array.isArray(k0.settings.alertTo)) return; asked = true;
  try { W.fetch('/.netlify/functions/bid-inbox?list=1', { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
    var a = j && j.settings && j.settings.alertTo; if (Array.isArray(a) && a.length) { var k = cache(); k.settings = Object.assign({}, k.settings || {}, { alertTo: a }); saveCache(k); mount(); }
  }, function(){}); } catch (e) {}
}
W._gcAlertTo = { get: alertTo, mount: mount };
function tick(){ try { mount(); load(); } catch (e) {} }
(W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval).call(W, tick, 1000);
})();
