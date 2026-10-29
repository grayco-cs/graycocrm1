/* __GC_PATCH_LOSTNEWS__ — the lead panel's "📰 On GrayCo News (until they unsubscribe)" line + the per-lead switch
   (owner 10/29: "when leads are lost i still want to email them until they say stop emails"). The rules are
   netlify/functions/_lib/lostnews.js, pasted above this by tools/patch_LOSTNEWS.py (window.__gcLostNews) — the server
   uses the same file for every GrayCo News audience. The switch sets lead.newsOff (take off) / clears it; an admin can
   opt a bid-board / plan-room GC contact in (lead.newsOptIn). Unsubscribes (gc_news_suppress) and STOP are checked by
   the server at every send. */
(function(){
'use strict';
var W = window, D = document;
if (W._gcLostNews) return;
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function LN(){ return W.__gcLostNews; }
function isAdmin(){ try { return !!(W._gcAdm && W._gcAdm.state().admin); } catch (e) { return false; } }
function row(l){
  var M = LN(); if (!M || !l || !M.isLost(l)) return '';
  var why = M.why(l), id = esc(l.id), b = function(act, t){ return ' <button type="button" class="b" data-lostnews="' + act + '" data-id="' + id + '">' + t + '</button>'; };
  if (!why) return '<div class="row gcln-row" data-gcln="' + id + '"><span class="note gcln-on" style="color:#166534;font-weight:700">' + esc(M.LABEL) + '</span>' + b('off', 'Take off GrayCo News') + '</div>';
  if (/taken off/.test(why)) return '<div class="row gcln-row" data-gcln="' + id + '"><span class="note">📰 Not on GrayCo News — taken off on this lead</span>' + b('on', 'Put back on') + '</div>';
  if (/bid-board/.test(why)) return '<div class="row gcln-row" data-gcln="' + id + '"><span class="note">📰 Not on GrayCo News — ' + esc(why) + '</span>' + (isAdmin() ? b('optin', 'Add to GrayCo News (owner opt-in)') : '') + '</div>';
  return '<div class="row gcln-row" data-gcln="' + id + '"><span class="note">📰 Not on GrayCo News — ' + esc(why) + '</span></div>';
}
function save(id, fn){
  var set = W._setLeads; if (typeof set !== 'function') return false;
  set(function(list){ return (Array.isArray(list) ? list : []).map(function(l){ if (!l || String(l.id) !== String(id)) return l; var q = Object.assign({}, l); fn(q); q.updatedAt = new Date().toISOString(); return q; }); });
  return true;
}
function leadById(id){ try { return ((W._crm && W._crm.leads) || W.__gcLeadsNow || []).filter(function(l){ return l && String(l.id) === String(id); })[0] || null; } catch (e) { return null; } }
D.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('[data-lostnews]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  var id = b.getAttribute('data-id'), act = b.getAttribute('data-lostnews'), at = new Date().toISOString(), by = ''; try { by = W.__GC_AUTH__.email(); } catch (x) {}
  var ok = save(id, function(q){
    if (act === 'off') { q.newsOff = true; q.newsOffAt = at; q.newsOffBy = by; }
    else if (act === 'on') { delete q.newsOff; q.newsOnAt = at; q.newsOnBy = by; }
    else if (act === 'optin') { q.newsOptIn = true; q.newsOptInAt = at; q.newsOptInBy = by; }
    var cur = Object.assign({}, leadById(id) || { id: id, stage: 'Lost' }, q);
    var r = b.closest('[data-gcln]'); if (r) { var tmp = D.createElement('div'); tmp.innerHTML = row(cur); if (tmp.firstChild) r.parentNode.replaceChild(tmp.firstChild, r); }
  });
  if (!ok) b.textContent = 'Could not save — reload and try again';
}, true);
W._gcLostNews = { row: row };
try { console.log('[GC] 📰 Lost leads stay on GrayCo News until they unsubscribe (patch LOSTNEWS)'); } catch (e) {}
})();
