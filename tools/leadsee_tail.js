/* __GC_PATCH_LEADSEE__ */
/* GrayCo — NEW LEADS SHOW AT ONCE on the Leads screen (patch LEADSEE, owner 10/28: "make sure the leads go in to crm, i dont
   see any text leads from earlier or website inquiries").
   · "📥 Lead Inbox (N)" — the number of new, unassigned inbox leads on the Leads screen's tab;
   · a strip above the list: "📥 N new leads — not assigned yet · Open Lead Inbox", when the inbox was last checked, and
     why it could not be checked (with ↻ Check now) — a failure is never silent again;
   · a "📥 New" chip ("📥 New · held until 5:00 PM today" while LEADHOLD holds it) next to the lead's Assigned cell;
   · window._gcLeadSee.fresh(l): a new lead from the inbox (text, website, missed call, e-mail) nobody is assigned to yet,
     under 3 days old or held — the Leads list puts these first in its default (soonest-due) sort.
   The collecting itself is patch LD2 (with LEADSEE's small list, the 30-second marker check and the 100-per-pass import). */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_LEADSEE__) return; W.__GC_LEADSEE__ = true;
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function assignee(l){ return s(l.pm) || s(l.estimator) || s(l.assignedTo); }
function closed(l){ return /^(won|lost)$/i.test(s(l.stage)) || !!l.archived || !!l.deleted || /^(converted|lost|closed)$/i.test(s(l.status)); }
function isHeld(l){ try { return !!(W._gcLeadHold && W._gcLeadHold.isHeld && W._gcLeadHold.isHeld(l)); } catch (e) { return false; } }
function fromInbox(l){ return !!(l && (l.inboxId || l.textMessage || (l.websiteLead && l.receivedAt))); }
function fresh(l){
  if (!l || !fromInbox(l) || closed(l) || assignee(l) || l.pid) return false;
  if (isHeld(l)) return true;
  var t = Date.parse(l.createdAt || l.receivedAt || 0);
  return isFinite(t) && Date.now() - t < 72 * 36e5;
}
function heldLabel(l){ try { return W._gcLeadHold.core.whenLabel(l.hold.until, Date.now()); } catch (e) { return '5 PM'; } }
function newChip(l){ return '<span class="gcl-chip gcls-new" data-gcls-new="1" title="New lead from the Lead Inbox — not assigned yet">📥 New' + (isHeld(l) ? ' · held until ' + esc(heldLabel(l)) : '') + '</span> '; }
/* the chip rides on LEADHOLD's chip (the Leads list asks for it in the Assigned cell) */
function wrapChip(){
  var H = W._gcLeadHold; if (!H || typeof H.chip !== 'function' || H.chip.__leadsee) return;
  var c0 = H.chip;
  var f = function(l){ var base = ''; try { base = s(c0.apply(H, arguments)); } catch (e) {} try { return fresh(l) ? newChip(l) + base : base; } catch (e) { return base; } };
  f.__leadsee = 1; H.chip = f;
}
function css(){
  if (D.getElementById('gc-leadsee-css')) return;
  var st = D.createElement('style'); st.id = 'gc-leadsee-css';
  st.textContent = '#root:has(#gc-leads-tabs:not([data-tab="leads"])) #gc-leadsee{display:none!important}'
    + '#gc-leadsee{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px;padding:8px 12px;border-radius:10px;border:1px solid #c7d2fe;background:#eef2ff;color:#1e1b4b;font:13px/1.4 inherit}'
    + '#gc-leadsee.none{background:#f8fafc;border-color:#e2e8f0;color:#475569}#gc-leadsee.bad{background:#fef2f2;border-color:#fecaca;color:#7f1d1d}'
    + '#gc-leadsee b{font-weight:700}#gc-leadsee button{border:1px solid #241968;background:#241968;color:#fff;border-radius:8px;padding:4px 10px;font:600 12px inherit;cursor:pointer}'
    + '#gc-leadsee button.l{background:#fff;color:#241968}#gc-leadsee .t{color:#64748b;font-size:12px;margin-left:auto}'
    + '.gcls-badge{display:inline-block;min-width:18px;margin-left:6px;padding:0 6px;border-radius:9px;background:#dc2626;color:#fff;font:700 11px/18px Arial,sans-serif;text-align:center}'
    + '.gcl-chip.gcls-new{background:#dbeafe!important;color:#1e3a8a!important}';
  (D.head || D.documentElement).appendChild(st);
}
function when(iso){ var t = Date.parse(iso || 0); if (!isFinite(t)) return ''; return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
var LAST = '';
function tick(){
  if (D.hidden) return;
  wrapChip();
  var LI = W._gcLeadInbox, tabs = D.getElementById('gc-leads-tabs'); if (!LI || !tabs) return;
  css();
  var n = 0; try { n = +LI.count() || 0; } catch (e) {}
  var held = 0; try { held = W._gcLeadHold && W._gcLeadHold.held ? W._gcLeadHold.held().filter(function(l){ return l && l.inboxId; }).length : 0; } catch (e) {}
  /* the tab's count */
  var tb = tabs.querySelector('[data-gc-tab="bidboard"]');
  if (tb) { var bd = tb.querySelector('.gcls-badge');
    if (n > 0) { if (!bd) { bd = D.createElement('span'); bd.className = 'gcls-badge'; tb.appendChild(bd); } if (bd.textContent !== String(n)) bd.textContent = String(n); tb.setAttribute('title', n + ' new lead' + (n === 1 ? '' : 's') + ' not assigned yet'); }
    else if (bd) bd.remove(); }
  /* the strip above the list */
  var hub = D.getElementById('gc-leads-hub'); if (!hub || !hub.parentNode) return;
  var el = D.getElementById('gc-leadsee');
  if (!el) { el = D.createElement('div'); el.id = 'gc-leadsee'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status'); el.addEventListener('click', onClick); }
  if (el.parentNode !== hub.parentNode || el.nextElementSibling !== hub) hub.parentNode.insertBefore(el, hub);
  var st = {}; try { st = LI.status() || {}; } catch (e) {}
  var err = s(st.error), at = s(st.at), busy = !!st.busy;
  var cls = err ? 'bad' : n ? '' : 'none', h;
  if (err) h = '⚠ <b>The Lead Inbox could not be checked</b> (' + esc(err) + '). New text / website / missed-call / e-mail leads may be missing here. <button type="button" data-gcls="check">↻ Check now</button>';
  else if (n) h = '📥 <b>' + n + ' new lead' + (n === 1 ? '' : 's') + '</b> — not assigned yet' + (held ? ' (' + held + ' held until 5 PM for an admin)' : '') + '. They are at the top of the list below. <button type="button" data-gcls="open">Open Lead Inbox</button> <button type="button" class="l" data-gcls="check">↻ Check now</button>';
  else h = '📥 Lead Inbox: no new leads waiting. <button type="button" class="l" data-gcls="check">↻ Check now</button>';
  h += '<span class="t">' + (busy ? 'Checking the Lead Inbox…' : at ? 'Checked ' + esc(when(at)) : 'Not checked yet') + '</span>';
  var sig = cls + '|' + h;
  if (sig !== LAST || el.className !== cls) { LAST = sig; el.className = cls; el.innerHTML = h; }
}
function onClick(e){
  var b = e.target && e.target.closest && e.target.closest('[data-gcls]'); if (!b) return;
  e.preventDefault();
  var a = b.getAttribute('data-gcls');
  if (a === 'check') { b.disabled = true; b.textContent = 'Checking…'; try { Promise.resolve(W._gcLeadInbox.refresh()).then(function(){ LAST = ''; tick(); }, function(){ LAST = ''; tick(); }); } catch (x) {} }
  if (a === 'open') { var t = D.querySelector('#gc-leads-tabs [data-gc-tab="bidboard"]'); if (t) t.click(); }
}
W._gcLeadSee = { fresh: fresh, tick: tick, state: function(){ var st = {}; try { st = W._gcLeadInbox.status(); } catch (e) {} return { inbox: st, sig: W._gcLeadInbox && W._gcLeadInbox.sig ? W._gcLeadInbox.sig() : null }; } };
(W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval).call(W, function(){ try { tick(); } catch (e) {} }, 1500);
try { console.log('[GC] New leads show at once (patch LEADSEE): window._gcLeadSee.state()'); } catch (e) {}
})();
