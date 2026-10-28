/* ═══ patch LEADHOLD (__GC_PATCH_LEADHOLD__) — hold-then-assign for new leads; a PM's own lead ═══════════════════════
   Owner (10/28): "before assigning automatically, give for the rest of the work day for admin to approve or assign to
   someone else, then automatically goes to who is assigned."

   • A NEW lead the routing (lead roles / Senior Estimator) gives to someone is HELD: "⏳ Suggested: <name> — assigns at
     5:00 PM" on its card and in its panel (work day ends 5:00 PM Central, Mon–Fri; after 5 PM / weekends → 5:00 PM the
     next work day). The rule is netlify/functions/_lib/lead-hold.js, inlined above word for word (window._gcLeadHoldCore).
   • ✅ Approvals: ONE card for all of them — "⏳ N new leads waiting to be assigned" (admins) → a short list, each with
     ✅ Approve (assigns to the suggested person now) or 👤 Pick someone (opens the lead at "Assigned to"; that assigns now).
   • Nobody acts → at the deadline the server (bid-alerts, every 10 min) assigns it and sends the normal notice; the
     Leads screen catches up any held lead whose deadline passed (no new timers: the Leads hub's own routing pass).
   • Not held: emergencies / mitigation, a bid due before the hold ends, an admin's own lead, a PM's own lead.
   • A PM's own lead (entered by hand by a PM, or from their own GrayCo Photos project) is theirs at once and tagged as
     their own lead (ownFields: commissionSource 'self', leadIsMine, ownLead, leadOwner); RoofScout / marketing / company
     channels and an earlier company lead at that address always make it a GrayCo lead.
   Console: _gcLeadHold.state()   _gcLeadHold.held()   _gcLeadHold.open()
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_LEADHOLD__) return; W.__GC_PATCH_LEADHOLD__ = true;
var C = W._gcLeadHoldCore; if (!C) return;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowIso(){ return new Date().toISOString(); }
var SINCE = Date.parse('2026-10-28T00:00:00Z');   /* leads already waiting before this release keep the old (immediate) routing */
var LOG = [];
function crm(){ return W._crm || {}; }
function meUser(){
  try { var em = low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()), me = low(localStorage.getItem('grayco_user') || '');
    return arr(crm().users).filter(function(u){ return u && ((em && low(u.email) === em) || (me && (low(u.email) === me || low(u.name) === me))); })[0] || null; } catch (e) { return null; }
}
function myName(){ var u = meUser(); if (u && u.name) return s(u.name); try { return s(localStorage.getItem('grayco_user')); } catch (e) { return ''; } }
function isAdmin(){
  try { if (W._gcVAS && W._gcVAS.active()) return /admin|owner/i.test(s(W._gcVAS.role())); } catch (e) {}
  try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {}
  var u = meUser(); return !!(u && (u.role === 'Admin' || low(u.payType) === 'owner'));
}
function kit(){ return W._gcLeadsHubKit || null; }
function all(){ var K = kit(); try { if (K && K.all) return arr(K.all()); } catch (e) {} return arr(crm().leads); }
function byId(id){ return all().filter(function(l){ return l && s(l.id) === s(id); })[0] || null; }
var CLOSED = /^(won|lost|dead|deleted|converted|declined|not\s*bidding|no\s*bid|archived|cancell?ed|closed|dismissed|merged)$/i;
function closed(l){ return !l || l.deleted || l._deleted || l.converted || l.pid || l.jobId || [l.stage, l.status, l.inboxState].some(function(v){ return CLOSED.test(s(v)); }); }
function born(l){ var t = Date.parse(s(l && (l.createdAt || l.receivedAt || l.created || l.dateAdded))); return isFinite(t) ? t : 0; }
function fresh(l){ var t = born(l); return t >= SINCE && Date.now() - t < 7 * 864e5; }
function fn(path, body){
  return W.fetch('/.netlify/functions/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }); }, function(){ return {}; });
}
function toast(t){
  try { var n = D.createElement('div'); n.textContent = t; n.setAttribute('data-gc-keep', '1');
    n.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b1640;color:#fff;padding:10px 16px;border-radius:8px;z-index:2147483300;font:600 14px Arial;max-width:90vw;box-shadow:0 6px 20px rgba(0,0,0,.25)';
    D.body.appendChild(n); ST.call(W, function(){ n.remove(); }, 4500); } catch (e) {}
}

/* ── the Leads hub's routing pass asks this, per lead with nobody on it ──
   null → the hub does what it always did · { r: null } → leave it alone (held, or a PM's own lead) ·
   { r: { release: true … } } → the deadline passed: assign the suggestion · { hold } → hold it instead of assigning */
function plan(l, r){
  if (!l || C.assignee(l)) return null;
  if (C.isHeld(l)) {   /* a Lead Inbox lead is released by the server (it sends the notice); the screen steps in only if that is 30 min late */
    var late = l.inboxId ? 30 * 60e3 : 0;
    return C.isDue(l, Date.now() - late) ? { r: { release: true, field: l.hold.field, name: l.hold.name, email: l.hold.email, label: l.hold.label, k: l.hold.k } } : { r: null };
  }
  if (C.ccWhy(l) || C.storedSource(l) === 'self') return { r: null };   /* a PM's own lead is never routed to someone else */
  if (!r || (l.hold && l.hold.state) || !fresh(l) || C.noHoldWhy(l, Date.now())) return null;
  return { r: null, hold: C.holdFor(r, Date.now()) };
}

/* ── the Lead Inbox import: the server's hold (and its release at 5 PM) onto the CRM lead ── */
function fromItem(l, it, isNew){
  var h = it && it.hold; if (!h || !h.state) return;
  if (isNew) { l.hold = Object.assign({}, h); return; }
  if (C.assignee(l)) { if (l.hold && l.hold.state === 'held') l.hold = Object.assign({}, l.hold, { state: 'manual' }); return; }
  if (h.state === 'held') { if (!l.hold) l.hold = Object.assign({}, h); return; }
  if (l.hold && l.hold.state !== 'held') return;   /* the CRM decided already */
  l.hold = Object.assign({}, h);
  var who = s(it.estimator) ? 'estimator' : 'pm', nm = s(it[who]);
  if (nm) { l[who] = nm; l[who + 'Email'] = low(it[who + 'Email']) || s(h.email); l.assignedBy = s(it.assignedBy) || 'Auto'; l.assignedAt = s(it.assignedAt) || nowIso(); if (it.autoAssignedAt) l.autoAssignedAt = it.autoAssignedAt; if (l.inboxState === 'new') l.inboxState = 'assigned'; }
}

/* ── what people see ── */
function label(l){ return C.whenLabel(l.hold.until, Date.now()); }
function chip(l){
  if (!l) return '';
  if (C.isHeld(l)) return '<span class="gcl-chip warn" title="Held for an admin: approve it or pick someone else before then">⏳ Suggested: ' + esc(l.hold.name) + ' — assigns at ' + esc(label(l)) + '</span>';
  if (C.storedSource(l) === 'self' && s(l.leadOwner || l.broughtInBy)) return '<span class="gcl-chip" style="background:#ede9fe;color:#5b21b6" title="' + esc(l.leadSourceWhy || 'Entered by the PM or started from their GrayCo Photos project') + '">👤 ' + esc(s(l.leadOwner || l.broughtInBy)) + '’s own lead</span>';
  return '';
}
function drawer(l){
  if (!C.isHeld(l)) return '';
  return '<div class="note" data-gclh-box style="margin:0 0 8px;padding:8px 10px;border-radius:8px;background:#fff7ed;color:#7c2d12;border:1px solid #fed7aa">⏳ <b>Suggested: ' + esc(l.hold.name) + '</b>' + (l.hold.label ? ' (' + esc(l.hold.label) + ')' : '') + ' — assigns at <b>' + esc(label(l)) + '</b> unless an admin changes it.'
    + (isAdmin() ? ' <button type="button" class="gcl-mv" data-gclh-approve="' + esc(l.id) + '" style="margin-left:6px">✅ Approve suggestion</button><br><span style="font-size:12px">Or pick someone else below — that assigns now.</span>' : '') + '</div>';
}
function held(){ return all().filter(function(l){ return C.isHeld(l) && !closed(l); }).sort(function(a, b){ return s(a.hold.until).localeCompare(s(b.hold.until)); }); }
/* the one approval card (patch HOT1's approval set, so the chip, the badge and the Approvals tab count it once) */
var MEMO = { ref: null, at: 0, items: [] };
function approvals(){
  if (!isAdmin()) return [];
  var ref = all(); if (MEMO.ref === ref && Date.now() - MEMO.at < 30000) return MEMO.items;
  var h = held(), items = [];
  if (h.length) items.push({ id: 'td:leadhold', title: '⏳ ' + h.length + ' new lead' + (h.length === 1 ? '' : 's') + ' waiting to be assigned',
    sub: 'Each goes to its suggested person at ' + label(h[0]) + ' unless you approve it or pick someone else', act: { l: '✅ Review', f: function(){ open(); } } });
  MEMO = { ref: ref, at: Date.now(), items: items };
  return items;
}

/* ── acting on it: one lead written, the Lead Inbox told, the person notified ── */
function saveOne(id, fx){
  var K = kit(); if (!K || !K.setLeads) return Promise.resolve(false);
  var out = null;
  return Promise.resolve(K.setLeads(function(list){ var i = -1; list.forEach(function(x, k){ if (x && s(x.id) === s(id)) i = k; }); if (i < 0) return null;
    var x = Object.assign({}, list[i]); if (fx(x) === false) return null; x.updatedAt = nowIso(); list[i] = x; out = x; return list; })).then(function(ok){ return ok ? out : null; });
}
function tellInbox(l, name, field){
  if (!l || !l.inboxId) return;
  fn('bid-inbox?act=1', { op: 'assigned', id: l.inboxId, pm: name, leadId: l.id, as: field === 'estimator' ? 'estimator' : '', email: field === 'estimator' ? s(l.estimatorEmail || (l.hold && l.hold.email)) : '' });
}
function approve(id){
  if (!isAdmin()) { toast('Only an admin approves a suggested lead.'); return Promise.resolve(false); }
  var me = myName() || 'Admin';
  return saveOne(id, function(x){ if (!C.isHeld(x)) return false; Object.assign(x, C.releaseFields(x, 'approved', me, Date.now()));
    var a = arr(x.activity).slice(); a.push({ type: 'assign', text: 'Approved the suggestion: ' + s(x.pm || x.estimator), at: nowIso(), by: me }); x.activity = a.slice(-200); })
    .then(function(x){
      if (!x) { toast('That lead is not waiting any more.'); return false; }
      LOG.push({ at: nowIso(), approved: id }); MEMO.ref = null;
      tellInbox(x, s(x.hold.name), x.hold.field);
      fn('bid-inbox?notify=1', { lead: x });
      toast('✅ Assigned to ' + s(x.hold.name));
      try { if (W._gcLeadsHub && W._gcLeadsHub.redraw) W._gcLeadsHub.redraw(); } catch (e) {}
      return true;
    });
}
/* the hub's own assign (the drawer / the picker) on a held lead: the server's hold ends too */
function picked(id, name){
  var l = byId(id); if (!l || !l.hold || l.hold.state !== 'held') return;
  var field = (W._gcBidRole && W._gcBidRole.isBid && W._gcBidRole.isBid(l)) ? 'estimator' : 'pm';
  tellInbox(l, name, field); MEMO.ref = null; LOG.push({ at: nowIso(), picked: id, name: name });
}

/* ── the short list behind the approval card ── */
function open(){
  var old = D.getElementById('gclh-ov'); if (old) old.remove();
  var h = held(), adm = isAdmin();
  var ov = D.createElement('div'); ov.id = 'gclh-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:100300;background:rgba(6,12,20,.6);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';
  ov.innerHTML = '<div role="dialog" aria-modal="true" style="background:#fff;color:#0f172a;border-radius:14px;max-width:680px;width:100%;padding:16px 18px;font:14px Arial,sans-serif;box-sizing:border-box">'
    + '<button type="button" data-gclh-x style="float:right;border:none;background:#e2e8f0;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer;min-height:40px">✕</button>'
    + '<h2 style="margin:0 0 4px;font-size:19px">⏳ New leads waiting to be assigned</h2>'
    + '<div style="color:#64748b;font-size:12.5px;margin-bottom:8px">Each goes to its suggested person at the time shown unless you approve it now or pick someone else.</div>'
    + (h.length ? h.map(function(l){ return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin:8px 0">'
        + '<b>' + esc(l.name || l.title || l.company || 'Lead') + '</b><div style="color:#475569;font-size:12.5px">' + esc([l.leadKind || l.type, l.source, s(l.address).split(',')[0]].filter(Boolean).join(' · ')) + '</div>'
        + '<div style="margin:4px 0">Suggested: <b>' + esc(l.hold.name) + '</b>' + (l.hold.label ? ' (' + esc(l.hold.label) + ')' : '') + ' — assigns at <b>' + esc(label(l)) + '</b></div>'
        + (adm ? '<button type="button" data-gclh-approve="' + esc(l.id) + '" style="padding:8px 14px;border-radius:8px;border:none;background:#0f766e;color:#fff;font-weight:700;cursor:pointer;min-height:40px;margin:4px 6px 0 0">✅ Approve</button>'
          + '<button type="button" data-gclh-pick="' + esc(l.id) + '" style="padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-weight:700;cursor:pointer;min-height:40px;margin:4px 6px 0 0">👤 Pick someone else</button>' : '')
        + '</div>'; }).join('') + (adm && h.length > 1 ? '<button type="button" data-gclh-all style="padding:8px 14px;border-radius:8px;border:none;background:#14532d;color:#fff;font-weight:700;cursor:pointer;min-height:40px;margin-top:6px">✅ Approve all ' + h.length + '</button>' : '')
      : '<div style="padding:12px 0">Nothing is waiting.</div>')
    + '</div>';
  ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
  D.body.appendChild(ov);
  return ov;
}
D.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target.closest('[data-gclh-approve],[data-gclh-pick],[data-gclh-all],[data-gclh-x]') : null; if (!t) return;
  e.preventDefault(); e.stopPropagation();
  var ov = D.getElementById('gclh-ov');
  if (t.hasAttribute('data-gclh-x')) { if (ov) ov.remove(); return; }
  if (t.hasAttribute('data-gclh-pick')) { if (ov) ov.remove(); try { W._gcOpenLead(t.getAttribute('data-gclh-pick'), 'assign'); } catch (x) {} return; }
  t.disabled = true;
  var ids = t.hasAttribute('data-gclh-all') ? held().map(function(l){ return l.id; }) : [t.getAttribute('data-gclh-approve')];
  ids.reduce(function(p, id){ return p.then(function(){ return approve(id); }); }, Promise.resolve()).then(function(){
    if (ov && ov.isConnected) open();
    try { var H = W._gcLeadsHub; if (H && H.ui && H.ui().open && H.open) H.open(H.ui().open); } catch (x) {}
  });
}, true);

W._gcLeadHold = { core: C, plan: plan, fromItem: fromItem, chip: chip, drawer: drawer, isHeld: C.isHeld, held: held, approvals: approvals, approve: approve, picked: picked, open: open,
  state: function(){ return { held: held().map(function(l){ return { id: l.id, name: l.name, suggested: l.hold.name, until: l.hold.until }; }), log: LOG.slice(-20) }; } };
try { console.log('[GC] Hold-then-assign for new leads + PM own leads (patch LEADHOLD): _gcLeadHold.state()'); } catch (e) {}
})();
