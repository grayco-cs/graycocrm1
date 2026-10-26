/* __GC_PATCH_CLAIMLEAD__ ═══════════════════════════════════════════════════
   GrayCo — "⚙ Insurance claims go to:" in the Lead settings.   (patch CLAIMLEAD)
   A claims@ e-mail for a NEW claim is also a Lead Inbox lead (netlify/functions/_lib/claim-lead.js); it is assigned to
   this person. Empty: the Senior Insurance PM of the lead roles (Admin → Team roles). The choice is kept on the server
   (bid-inbox ?settings=1 → gc_lead_inbox_settings.claimsTo). Admins change it; everyone sees it. */
(function(){
'use strict';
var W = window, ID = 'gc-claimlead-set';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function cache(){ try { return JSON.parse(localStorage.getItem('gc_ldi_cache_v2') || 'null') || {}; } catch (e) { return {}; } }
function saveCache(k){ try { localStorage.setItem('gc_ldi_cache_v2', JSON.stringify(k)); } catch (e) {} }
function claimsTo(){ var k = cache(), c = k.settings && k.settings.claimsTo; return c && low(c.email) ? { name: s(c.name), email: low(c.email) } : null; }
function people(){
  var seen = {}, list = (W._crm && Array.isArray(W._crm.users)) ? W._crm.users : [];
  return list.filter(function(u){ return u && s(u.name) && s(u.email) && u.active !== false && !seen[low(u.email)] && (seen[low(u.email)] = 1); })
    .sort(function(a, b){ return (/insur/i.test(s(b.role) + s(b.title)) - /insur/i.test(s(a.role) + s(a.title))) || s(a.name).localeCompare(s(b.name)); });
}
function isAdmin(){
  try { if (W._gcVAS && W._gcVAS.active()) return false; } catch (e) {}
  try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {}
  try { var me = W._gcMeNow || {}; return me.role === 'Admin' || low(me.payType) === 'owner'; } catch (e) { return false; }
}
/* who gets a claim: the setting, else the Senior Insurance PM of the lead roles */
function who(){
  var c = claimsTo(); if (c) return { name: c.name || c.email, from: 'setting' };
  try { var h = W._gcLeadRoles && W._gcLeadRoles.holder && W._gcLeadRoles.holder('insurance'); if (h && s(h.name)) return { name: s(h.name), from: 'role' }; } catch (e) {}
  /* no lead-roles mapping: the one person whose role / title says insurance PM (the server does the same) */
  var c2 = people().filter(function(u){ var x = s(u.role) + ' ' + s(u.profile) + ' ' + s(u.title); return /insur/i.test(x) && /(\bpm\b|project\s*manager|manager)/i.test(x); });
  if (c2.length > 1) { var sr = c2.filter(function(u){ return /\b(senior|sr\.?)\b/i.test(s(u.role) + ' ' + s(u.title)); }); if (sr.length) c2 = sr; }
  if (c2.length === 1) return { name: s(c2[0].name), from: 'title' };
  return null;
}
function barHtml(){
  var w = who(), adm = isAdmin();
  return '<span style="font-weight:700">⚙ Insurance claims go to:</span> '
    + (w ? '<b>' + esc(w.name) + '</b> <span style="color:#64748b">(' + (w.from === 'role' ? 'Senior Insurance PM' : w.from === 'title' ? 'by role' : 'picked here') + ')</span>' : '<span style="color:#b45309">Set the senior insurance PM in Lead settings</span>')
    + ' <span style="color:#64748b">— new claims from claims@ also land in the Lead Inbox, assigned to them.</span>'
    + (adm ? ' <button type="button" data-cl="pick" style="margin-left:6px;padding:2px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer">Change</button>' : '');
}
function mount(){
  /* ⚙ Lead settings (the drawer an admin opens from the Lead Inbox), above the bid boards; and the Leads ⚙ bar under "Commercial bids go to:" */
  var d = document.getElementById('gcl-settings'), body = d && d.querySelector('.gcl-set-body'), la = document.getElementById('gc-la-set'), html = barHtml();
  [[body, ID, body && body.parentNode, body, 'padding:10px 14px;border-bottom:1px solid #e7e3f5;background:#fbfaff'], [la, ID + '-bar', la && la.parentNode, la && la.nextSibling, 'margin:0 0 8px;padding:6px 12px']].forEach(function(x){
    var anchor = x[0], id = x[1], parent = x[2], before = x[3]; if (!anchor || !parent) return;
    var cur = document.getElementById(id);
    if (cur && cur.parentNode === parent && cur.nextSibling === before) { if (cur.getAttribute('data-sig') !== html) { cur.innerHTML = html; cur.setAttribute('data-sig', html); } return; }
    if (cur) cur.remove();
    cur = document.createElement('div'); cur.id = id; cur.setAttribute('data-gc-keep', '1'); cur.setAttribute('data-sig', html); cur.innerHTML = html;
    cur.style.cssText = 'font-size:13px;' + x[4];
    parent.insertBefore(cur, before);
  });
}
var POP = null;
function close(){ if (POP) { try { POP.remove(); } catch (e) {} POP = null; } }
function pick(btn){
  if (!isAdmin()) return;
  close();
  var cur = claimsTo(), list = people(), r = btn.getBoundingClientRect();
  var z = 2147483002;
  var p = document.createElement('div'); p.id = 'gc-claimlead-pop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Insurance claims go to'); p.setAttribute('data-gc-keep', '1');
  p.style.cssText = 'position:fixed;z-index:' + z + ';background:#fff;color:#1a1a1a;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:14px;width:min(340px,calc(100vw - 24px));left:' + Math.max(12, Math.min(W.innerWidth - 352, r.left)) + 'px;top:' + Math.max(12, Math.min(W.innerHeight - 260, r.bottom + 6)) + 'px';
  p.innerHTML = '<div style="font-weight:700;margin-bottom:6px">⚙ Insurance claims go to</div>'
    + '<div style="font-size:12px;color:#475569;margin-bottom:8px">A new claim e-mailed to claims@ becomes a lead in the Lead Inbox, assigned to this person. Admins can reassign it there.</div>'
    + '<select class="gc-cl-sel" style="width:100%;padding:6px"><option value="">— the Senior Insurance PM (lead roles) —</option>' + list.map(function(u){ return '<option value="' + esc(low(u.email)) + '" data-n="' + esc(u.name) + '"' + (cur && cur.email === low(u.email) ? ' selected' : '') + '>' + esc(u.name) + (u.role ? ' · ' + esc(u.role) : '') + '</option>'; }).join('') + '</select>'
    + '<div class="gc-cl-err" role="alert" style="color:#b91c1c;font-size:12px;min-height:16px;margin-top:6px"></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-cl="save" style="padding:5px 14px;background:#241968;color:#fff;border:0;border-radius:6px;cursor:pointer">Save</button><button type="button" data-cl="x" style="padding:5px 12px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">Cancel</button></div>';
  document.body.appendChild(p); POP = p;
}
function save(){
  var p = POP; if (!p) return;
  var sel = p.querySelector('.gc-cl-sel'), o = sel.options[sel.selectedIndex], email = sel.value, name = email ? s(o.getAttribute('data-n')) : '';
  var btn = p.querySelector('[data-cl="save"]'); btn.disabled = true; btn.textContent = 'Saving…';
  W.fetch('/.netlify/functions/bid-inbox?settings=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claimsTo: { name: name, email: email } }), cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok) throw new Error(j.error || 'The setting could not be saved (' + r.status + ').'); return j; }); })
    .then(function(){
      var k = cache(); k.settings = Object.assign({}, k.settings || {}, { claimsTo: { name: name, email: email } }); saveCache(k);
      close(); mount();
    }, function(e){ btn.disabled = false; btn.textContent = 'Save'; p.querySelector('.gc-cl-err').textContent = s(e && e.message); });
}
document.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('[data-cl]'); if (!b) { if (POP && !POP.contains(e.target)) close(); return; }
  var a = b.getAttribute('data-cl'); if (a === 'pick') pick(b); else if (a === 'save') save(); else if (a === 'x') close();
}, true);
/* the server's copy of the setting, once, for a sign-in that has no cache yet */
var asked = false;
function load(){
  if (asked || claimsTo()) return; asked = true;
  try { W.fetch('/.netlify/functions/bid-inbox?list=1', { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
    var c = j && j.settings && j.settings.claimsTo; if (c && low(c.email)) { var k = cache(); k.settings = Object.assign({}, k.settings || {}, { claimsTo: { name: s(c.name), email: low(c.email) } }); saveCache(k); mount(); }
  }, function(){}); } catch (e) {}
}
W._gcClaimsTo = { get: claimsTo, who: who, mount: mount };
function tick(){ try { mount(); load(); } catch (e) {} }
/* the page slows plain timers down; the Leads patches use the native one (W.__GC_NATIVE_SETINTERVAL__), so do the same */
(W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval).call(W, tick, 1000);
})();
