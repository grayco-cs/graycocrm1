/* patch PRIMESUB: the page side. window._gcPrimeSub = { of(lead) → 'prime' | 'sub' | '', info(lead) → { role, why },
   badge(lead, opt) → html, can() → may this person change it, set(id, role) → Promise, menu(el, id) }.
   of() is remembered per lead id + updatedAt (+ the fields it reads), so a redraw costs a look-up, not a re-read. */
(function(){
'use strict';
var W = window, D = document, C = W._gcBidRoleCore;
if (!C || W._gcPrimeSub) return;
var NST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
var M = {}, N = 0;
function key(l){ return [l.id, l.updatedAt || l.savedAt, l.bidRole, l.bidRoleManual ? 1 : 0, l.source, l.leadKind, l.type, l.inboxRev, l.gc, l.owner].join('|'); }
function calc(l){
  if (l.bidRoleManual) return C.roleOf(l);
  var st = low(l.bidRole);
  if (st === 'prime' || st === 'sub') { var c = C.roleOf({ type: l.type, leadKind: l.leadKind, websiteLead: l.websiteLead, origin: l.origin, leadExtra: l.leadExtra, isInsurance: l.isInsurance, claimId: l.claimId, claimNumber: l.claimNumber });
    if (/not a bid/.test(c.why)) return c;   /* stored when it came in, but the lead is now a homeowner / insurance lead */
    return { role: st, why: s(l.bidRoleWhy) || 'decided when it came in' }; }
  return C.roleOf(l);
}
function info(l){
  if (!l || typeof l !== 'object') return { role: '', why: '' };
  if (!l.id) return calc(l);
  var k = key(l), v = M[k]; if (v) return v;
  if (++N > 5000) { M = {}; N = 0; }
  return (M[k] = calc(l));
}
function of(l){ return info(l).role; }
function isBid(l){ try { return typeof W._gcIsBidLead === 'function' && !!W._gcIsBidLead(l); } catch (e) { return false; } }
var CAN = { at: 0, v: false };
function can(){ if (Date.now() - CAN.at < 2000) return CAN.v; CAN.v = can0(); CAN.at = Date.now(); return CAN.v; }   /* asked once per badge: looked up at most every 2 s */
function can0(){
  try { if (W._gcVAS && W._gcVAS.active()) { var r0 = s(W._gcRP && W._gcRP.role && W._gcRP.role()); return /admin|estimat/i.test(r0); } } catch (e) {}
  try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {}
  try { if (W._gcRP && typeof W._gcRP.role === 'function' && /admin|estimat/i.test(s(W._gcRP.role()))) return true; } catch (e) {}
  try { var u = (typeof W._gcMeUser === 'function' && W._gcMeUser()) || W._gcMeNow || {}; return u.role === 'Admin' || low(u.payType) === 'owner' || /estimat/i.test(s(u.role) + ' ' + s(u.profile)); } catch (e) { return false; }
}
var LABEL = { prime: '🏛 PRIME', sub: '🔧 SUB' };
var SAYS = { prime: 'PRIME: we bid straight to the owner', sub: 'SUB: we bid to a general contractor' };
function css(){
  if (D.getElementById('gc-role-css')) return;
  var st = D.createElement('style'); st.id = 'gc-role-css';
  st.textContent = '.gc-role{display:inline-flex;align-items:center;gap:2px;border-radius:999px;padding:1px 8px;margin:0 4px 2px 0;font:800 11px/18px Arial,sans-serif;letter-spacing:.3px;white-space:nowrap;border:1px solid;vertical-align:middle;user-select:none}'
    + '.gc-role-prime{background:#e3edff;color:#123d8a;border-color:#8fb0ec}.gc-role-sub{background:#fff0d9;color:#8a4600;border-color:#eebd6e}'
    + '.gc-role-unset{background:transparent;color:#6b7280;border:1px dashed #b6bfcc;font-weight:700}.gc-role[data-can="1"]{cursor:pointer}.gc-role[data-can="1"]:hover{filter:brightness(.95)}'
    + '#gc-role-menu{position:fixed;z-index:2147483200;background:#fff;color:#1b1640;border:1px solid #cfc8ea;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:8px;width:260px;max-width:calc(100vw - 24px);font:13px Arial,sans-serif}'
    + '#gc-role-menu .h{font-weight:800;margin:2px 4px 6px}#gc-role-menu button{display:block;width:100%;text-align:left;border:1px solid #e5e1f5;background:#fff;color:#1b1640;border-radius:7px;padding:8px 10px;margin:0 0 5px;font:700 13px Arial,sans-serif;cursor:pointer;min-height:36px}'
    + '#gc-role-menu button.on{background:#1b1640;color:#fff;border-color:#1b1640}#gc-role-menu button:hover{border-color:#8f86c9}#gc-role-menu .w{color:#6b7280;font-size:11px;margin:2px 4px 0}';
  (D.head || D.documentElement).appendChild(st);
}
/* opt.always: draw the "＋ Prime / Sub" chip on any lead a person may mark (the lead's own page) */
function badge(l, opt){
  if (!l) return '';
  var i = info(l), r = i.role, c = can() ? '1' : '0'; css();
  if (r) return '<span class="gc-role gc-role-' + r + '" data-gc-role="' + esc(l.id) + '" data-can="' + c + '" title="' + esc(SAYS[r] + ' (' + i.why + ')' + (c === '1' ? '. Tap to change.' : '')) + '">' + LABEL[r] + '</span>';
  if (c !== '1' || !l.id || /not a bid/.test(i.why) || !((opt && opt.always) || isBid(l))) return '';
  return '<span class="gc-role gc-role-unset" data-gc-role="' + esc(l.id) + '" data-can="1" title="Prime or sub not known (' + esc(i.why) + '). Tap to mark it.">＋ Prime / Sub</span>';
}
function leadList(){ try { if (W._gcLeadsHubKit) return W._gcLeadsHubKit.all(); } catch (e) {} try { return (W._crm && W._crm.leads) || []; } catch (e) { return []; } }
function find(id){ var L = leadList(); for (var i = 0; i < L.length; i++) if (L[i] && L[i].id === id) return L[i]; return null; }
function me(){ try { if (W._gcLeadsHubKit) return s(W._gcLeadsHubKit.me()); } catch (e) {} try { return s((W._gcMeNow && W._gcMeNow.name) || ''); } catch (e) { return ''; } }
function toast(msg){ try { var t = D.createElement('div'); t.setAttribute('role', 'status'); t.setAttribute('data-gc-keep', '1'); t.textContent = msg; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b1640;color:#fff;padding:10px 16px;border-radius:8px;font:14px Arial;z-index:2147483300;max-width:90vw'; D.body.appendChild(t); NST.call(W, function(){ try { t.remove(); } catch (e) {} }, 3000); } catch (e) {} }
/* role: 'prime' | 'sub' | 'none' (no badge) | 'auto' (the CRM decides again) — saved on that one lead */
function set(id, role){
  if (!can()) { toast('Only an admin or an estimator marks prime / sub'); return Promise.resolve(false); }
  if (!/^(prime|sub|none|auto)$/.test(role)) return Promise.resolve(false);
  var kit = W._gcLeadsHubKit, at = new Date().toISOString(), who = me(), pushed = null;
  var mut = function(list){
    var i = -1; for (var k = 0; k < list.length; k++) if (list[k] && list[k].id === id) { i = k; break; }
    if (i < 0) return null;
    var x = Object.assign({}, list[i]), was = info(list[i]).role || 'none';
    if (role === 'auto') { x.bidRole = ''; x.bidRoleManual = false; x.bidRoleWhy = ''; }
    else { x.bidRole = role; x.bidRoleManual = true; x.bidRoleWhy = ''; }
    x.bidRoleBy = who; x.bidRoleAt = at; x.updatedAt = at;
    var a = Array.isArray(x.activity) ? x.activity.slice() : [];
    a.push({ type: 'role', text: 'Prime / sub: ' + ({ prime: '🏛 Prime', sub: '🔧 Sub', none: 'no badge', auto: 'automatic' }[role]) + ' (was ' + (was === 'none' ? 'not marked' : was) + ')', at: at, by: who });
    x.activity = a.slice(-200);
    list[i] = x; pushed = list; return list;
  };
  var p = kit && kit.setLeads ? kit.setLeads(mut) : new Promise(function(res){ try { W._setLeads(function(prev){ var n = mut((prev || []).slice()); if (!n) { res(false); return prev; } res(true); try { W.idbSet && W.idbSet('leads', n); W._supaUpsert && W._supaUpsert('leads', n); } catch (e) {} return n; }); } catch (e) { res(false); } });
  return Promise.resolve(p).then(function(ok){
    if (!ok) { toast('Could not save — try again'); return false; }
    toast(role === 'prime' ? '🏛 Marked PRIME' : role === 'sub' ? '🔧 Marked SUB' : role === 'none' ? 'No prime / sub badge' : 'Prime / sub: automatic');
    try { if (Array.isArray(pushed) && typeof W._supaUpsertNow === 'function') NST.call(W, function(){ W._supaUpsertNow('leads', pushed); }, 300); } catch (e) {}   /* one tap: to the cloud now */
    repaint(id);
    return true;
  });
}
function repaint(id){
  try { if (W._gcLeadsHub && W._gcLeadsHub.redraw) W._gcLeadsHub.redraw(); } catch (e) {}
  try { if (W._gcLeadInbox && W._gcLeadInbox.repaint) W._gcLeadInbox.repaint(); } catch (e) {}
  try { var u = W._gcLeadsHub && W._gcLeadsHub.ui && W._gcLeadsHub.ui(); if (u && u.open === id && D.getElementById('gcl-drawer') && W._gcLeadsHub.open) W._gcLeadsHub.open(id); } catch (e) {}
}
var menuEl = null;
function closeMenu(){ if (!menuEl) return; try { menuEl.remove(); } catch (e) {} menuEl = null; D.removeEventListener('mousedown', outside, true); D.removeEventListener('touchstart', outside, true); D.removeEventListener('keydown', onKey, true); }
function outside(e){ if (menuEl && !menuEl.contains(e.target) && !(e.target.closest && e.target.closest('[data-gc-role]'))) closeMenu(); }
function onKey(e){ if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } }
function menu(el, id){
  closeMenu(); css();
  var l = find(id) || {}, i = info(l), cur = l.bidRoleManual ? (low(l.bidRole) || 'none') : 'auto';
  var m = D.createElement('div'); m.id = 'gc-role-menu'; m.setAttribute('role', 'menu'); m.setAttribute('data-gc-keep', '1');
  var b = function(r, t){ return '<button type="button" role="menuitemradio" aria-checked="' + (cur === r) + '" data-r="' + r + '" class="' + (cur === r ? 'on' : '') + '">' + t + '</button>'; };
  m.innerHTML = '<div class="h">' + esc(s(l.name || l.title) || 'This lead') + '</div>'
    + b('prime', '🏛 Prime: we bid to the owner') + b('sub', '🔧 Sub: we bid to a GC') + b('none', 'No badge') + b('auto', '↺ Automatic')
    + '<div class="w">Now: ' + (i.role ? LABEL[i.role] : 'no badge') + ' (' + esc(i.why) + ')</div>';
  D.body.appendChild(m); menuEl = m;
  try { var r = el.getBoundingClientRect(), mw = m.offsetWidth || 260, mh = m.offsetHeight || 220; var x = Math.max(12, Math.min(r.left, W.innerWidth - mw - 12)), y = r.bottom + 6; if (y + mh > W.innerHeight - 8) y = Math.max(8, r.top - mh - 6); m.style.left = x + 'px'; m.style.top = y + 'px'; } catch (e) {}
  m.addEventListener('click', function(e){ var t = e.target.closest && e.target.closest('[data-r]'); if (!t) return; e.preventDefault(); e.stopPropagation(); var r2 = t.getAttribute('data-r'); closeMenu(); set(id, r2); });
  D.addEventListener('mousedown', outside, true); D.addEventListener('touchstart', outside, true); D.addEventListener('keydown', onKey, true);
  try { var f = m.querySelector('button.on') || m.querySelector('button'); f.focus(); } catch (e) {}
}
/* one listener for every badge (Leads board / list, the lead's page, the Bids tab): a tap opens the menu instead of the lead */
D.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target.closest('[data-gc-role]') : null; if (!t || t.getAttribute('data-can') !== '1') return;
  if (!can()) return;
  e.preventDefault(); e.stopPropagation(); menu(t, t.getAttribute('data-gc-role'));
}, true);
W._gcPrimeSub = { of: of, info: info, badge: badge, can: can, set: set, menu: menu, core: C, _memo: function(){ return N; } };
})();
