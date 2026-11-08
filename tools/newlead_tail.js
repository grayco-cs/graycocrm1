<script id="gc-patch-newlead">
/* __GC_PATCH_NEWLEAD__ — 📥 NEW LEAD FOR YOU (owner 11/5: "i want a notification in their field view app and in the leads tab").
   • Field Home (#_gcJobPick.gc-fh): a "📥 New lead for you (N)" card on top for every open lead assigned to me that I have
     not opened yet — name, tap-to-call phone, tap-for-maps address, type / source and the lead's message, "Open lead" and
     "✓ Got it". • Leads tab: the same strip "🔔 Assigned to you — N new" above the leads.
   • Seen: per person, gc_kv "gc_lead_seen__<e-mail>" (synced, so the phone and the desk agree); opening the lead or
     ✓ Got it clears it; a lead past "New" (contacted / estimate / won / lost …) never shows.
   • Texts to the PM's cell stay the owner's choice (Admin → 📱 Text alerts, "New leads assigned to me").
   API: window._gcNewLead = { mine(), seen(id), paint() } */
(function(W){
'use strict';
if (W.__GC_PATCH_NEWLEAD__) return; W.__GC_PATCH_NEWLEAD__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function email(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function myName(){ try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); if (s(u.name)) return s(u.name); } catch (e) {} var e = email(), U = (W._crm && W._crm.users) || []; var x = U.find(function(u){ return u && low(u.email) === e; }); return x ? s(x.name) : ''; }
var KEY = function(){ return 'gc_lead_seen__' + email(); };
var SEEN = null;
function seenMap(){ if (SEEN) return SEEN; try { SEEN = JSON.parse(localStorage.getItem(KEY()) || '{}') || {}; } catch (e) { SEEN = {}; } return SEEN; }
function markSeen(id){ var m = seenMap(); m[id] = new Date().toISOString(); var k = Object.keys(m); if (k.length > 400) k.sort(function(a, b){ return m[a] < m[b] ? -1 : 1; }).slice(0, k.length - 400).forEach(function(x){ delete m[x]; }); try { localStorage.setItem(KEY(), JSON.stringify(m)); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u(KEY(), m); } catch (e) {} paint(); }
var pulled = false;
function pull(){ if (pulled || !email()) return; pulled = true; try { var u = (localStorage.getItem('grayco_sb_url') || '').replace(/\/$/, ''), k = localStorage.getItem('grayco_sb_key') || ''; if (!u || !k) return; W.fetch(u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(KEY()) + '&select=value', { headers: { apikey: k, Authorization: 'Bearer ' + k }, cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){ var v = rows && rows[0] && rows[0].value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } if (v && typeof v === 'object') { SEEN = Object.assign({}, v, seenMap()); try { localStorage.setItem(KEY(), JSON.stringify(SEEN)); } catch (e) {} paint(); } }).catch(function(){}); } catch (e) {} }
var OPEN_STAGE = /^(|new|new lead|unassigned|assigned|incoming|to call|uncontacted)$/i;
function who(l){ return s(l.assignedTo || l.pm || l.estimator || l.assignee || l.salesRep); }
function mine(){
  var me = low(myName()); if (!me) return [];
  var m = seenMap(), wk = Date.now() - 21 * 864e5;
  return ((W._crm && W._crm.leads) || []).filter(function(l){
    if (!l || !l.id || l.archived || l.deleted || l.mergedInto || l.spam || l.isSpam) return false;
    if (low(who(l)) !== me) return false;
    if (!OPEN_STAGE.test(s(l.stage || l.status))) return false;
    if (m[l.id]) return false;
    var t = Date.parse(l.assignedAt || l.updatedAt || l.createdAt || l.created || 0); if (t && t < wk) return false;
    if (s(l.assignedBy) && low(l.assignedBy) === me) return false;
    return true;
  }).sort(function(a, b){ return s(b.assignedAt || b.createdAt) < s(a.assignedAt || a.createdAt) ? -1 : 1; });
}
function digits(v){ return s(v).replace(/\D/g, '').slice(-10); }
function cardHtml(L, field){
  var h = '<div class="gc-nl-h">📥 New lead' + (L.length === 1 ? '' : 's') + ' for you (' + L.length + ')</div>';
  L.slice(0, field ? 3 : 6).forEach(function(l){
    var msg = s(l.message || l.notes || l.scope || l.description), ph = s(l.phone || l.clientPhone), ad = s(l.address);
    h += '<div class="gc-nl-r" data-id="' + esc(l.id) + '"><b>' + esc(l.name || l.client || 'New lead') + '</b>'
      + '<div class="gc-nl-m">' + esc([l.leadKind || l.type, l.source || l.leadSource].filter(Boolean).join(' · ')) + '</div>'
      + (ph ? '<a class="gc-nl-a" href="tel:' + esc(digits(ph)) + '">📞 ' + esc(ph) + '</a>' : '') + (ad ? '<a class="gc-nl-a" target="_blank" rel="noreferrer" href="https://maps.google.com/?q=' + encodeURIComponent(ad) + '">📍 ' + esc(ad) + '</a>' : '')
      + (msg ? '<div class="gc-nl-msg">' + esc(msg.length > 220 ? msg.slice(0, 220) + '…' : msg) + '</div>' : '')
      + '<div class="gc-nl-b"><button type="button" data-nl="open">Open lead</button><button type="button" data-nl="got" class="g">✓ Got it</button></div></div>';
  });
  if (field && L.length > 3) h += '<div class="gc-nl-m">+ ' + (L.length - 3) + ' more on the Leads tab</div>';
  return h;
}
function css(){
  if (D.getElementById('gc-nl-css')) return;
  var st = D.createElement('style'); st.id = 'gc-nl-css';
  st.textContent = '.gc-nl{background:#fffbeb;border:2px solid #f59e0b;border-radius:14px;padding:10px 12px;margin:8px 0 10px;font:14px Inter,Arial,sans-serif;color:#0f172a}'
    + '.gc-nl-h{font-weight:800;font-size:15px;margin-bottom:4px}.gc-nl-r{border-top:1px solid #fde68a;padding:8px 0}.gc-nl-r:first-of-type{border-top:0}'
    + '.gc-nl-m{color:#64748b;font-size:12.5px}.gc-nl-a{display:inline-block;margin:4px 10px 0 0;color:#1d4ed8;text-decoration:none;font-weight:600;min-height:32px;line-height:32px}'
    + '.gc-nl-msg{white-space:pre-wrap;margin-top:4px;font-size:13px}.gc-nl-b{display:flex;gap:8px;margin-top:6px}'
    + '.gc-nl-b button{flex:1;min-height:40px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;font:700 14px Inter,Arial,sans-serif;cursor:pointer}.gc-nl-b button.g{background:#166534;color:#fff;border-color:#166534}';
  D.head.appendChild(st);
}
function mount(host, id, before, field){
  var L = mine(), cur = D.getElementById(id);
  if (!host || !L.length) { if (cur) cur.remove(); return; }
  css();
  var sig = L.map(function(l){ return l.id + (l.updatedAt || ''); }).join('|');
  if (cur && cur.parentElement === host && cur.getAttribute('data-sig') === sig) return;
  if (!cur) { cur = D.createElement('div'); cur.id = id; cur.className = 'gc-nl'; cur.setAttribute('data-gc-keep', '1'); cur.setAttribute('role', 'region'); cur.setAttribute('aria-label', 'New leads for you'); }
  cur.setAttribute('data-sig', sig); cur.innerHTML = cardHtml(L, field);
  if (cur.parentElement !== host || (before && cur.nextSibling !== before)) host.insertBefore(cur, before || host.firstChild);
}
function paint(){
  try {
    if (D.hidden || !email()) return; pull();
    var fh = D.querySelector('#_gcJobPick.gc-fh .fh-wrap');
    if (fh) mount(fh, 'gc-nl-field', fh.querySelector('.gc-ra-top') ? fh.querySelector('.gc-ra-top').nextSibling : fh.firstChild, true);
    var hub = D.getElementById('gc-leads-hub');
    if (hub && hub.getClientRects().length) mount(hub, 'gc-nl-leads', hub.firstChild, false); else { var c = D.getElementById('gc-nl-leads'); if (c && !hub) c.remove(); }
  } catch (e) {}
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('.gc-nl [data-nl]') : null; if (!b) return;
  var r = b.closest('[data-id]'), id = r && r.getAttribute('data-id'); if (!id) return;
  e.preventDefault(); e.stopPropagation();
  markSeen(id);
  if (b.getAttribute('data-nl') === 'open') {
    try { if (typeof W._gcOpenLead === 'function') W._gcOpenLead(id); else if (W._gcLeadsHub && W._gcLeadsHub.open) { if (W._setView) W._setView('leads'); ST.call(W, function(){ W._gcLeadsHub.open(id); }, 400); } } catch (x) {}
  }
}, true);
/* opening a lead anywhere counts as seen */
(function hookOpen(n){ var H = W._gcLeadsHub; if (H && typeof H.open === 'function' && !H.open.__nl) { var o = H.open; var f = function(id){ try { if (id) markSeen(s(id && id.id || id)); } catch (e) {} return o.apply(this, arguments); }; f.__nl = true; H.open = f; } if (n < 60) ST.call(W, function(){ hookOpen(n + 1); }, 2000); })(0);
SI.call(W, paint, 1500);
W._gcNewLead = { mine: mine, seen: markSeen, paint: paint };
})(window);
</script>
