/* __GC_PATCH_AUTOC__ — owner-approved automations 10/29 (patch AUTOC), the CRM's side:
   1. Subs tab → the picked sub's card: "🚨 No-show alert at 9 AM" (default OFF; its own switch next to 📱 Schedule texts).
      On: a sub who has not checked in by 9 AM on a scheduled day (sub portal "📍 I'm here", a "here" text, or 🟢 Crew
      arrived) → the PM gets a text + push + To-Do, the sub gets "are you on the way?". Server: sub-texts.js ?noshow=1.
   2. ⚙ Admin → 📊 Weekly owner report: last week's report as the Monday e-mail shows it (scheduled-reports.js ?view=1),
      and "Send it to the admins now". The Monday 7 AM e-mail goes by itself.
   The other automations (estimate text on day 5, review requests, check-up drafts, referral thank-yous, speed-to-lead)
   run on the server only. */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_AUTOC__) return; W.__GC_AUTOC__ = 1;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function arr(v){ return Array.isArray(v) ? v : []; }
function j(path, opts){
  return W.fetch(path, opts).then(function(r){ return r.text().then(function(t){ var o = {}; try { o = JSON.parse(t); } catch (e) { o = { error: t.slice(0, 200) }; } o.__status = r.status; return o; }); },
    function(e){ return { error: 'Cannot reach the server (' + e.message + ').', __status: 0 }; });
}
function signedIn(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.email()); } catch (e) { return false; } }

/* ── 1. the no-show switch on the sub card ── */
var NS = { list: null, at: 0, busy: null };
function loadNs(force){
  if (!force && NS.list && Date.now() - NS.at < 60000) return Promise.resolve(NS.list);
  if (NS.busy) return NS.busy;
  return (NS.busy = j('/.netlify/functions/sub-texts?list=1').then(function(o){ NS.busy = null; if (o.ok) { NS.list = o; NS.at = Date.now(); } return NS.list; }));
}
function nsHtml(sb){
  return '<div class="gcns-set" data-gcns="' + esc(sb.id) + '"><label class="gcst-l"><input type="checkbox" data-gcns-on' + (sb.noShow ? ' checked' : '') + '> <b>🚨 No-show alert at 9 AM</b></label>' +
    '<button type="button" class="gcsub-btn" data-gcns-save>Save</button>' +
    '<div class="gcsub-muted gcst-help">Off unless you turn it on for this sub. On: if they have not checked in by 9 AM on a scheduled day (sub portal “📍 I’m here”, a “here” text, or 🟢 Crew arrived on the job), the job’s PM gets a text, a phone push and a To-Do, and the sub gets one text: “are you on the way?”.</div></div>';
}
function decorateSub(){
  var panel = D.querySelector('.gcsub-panel'); if (!panel || !signedIn()) return;
  var card = panel.querySelector('.gcsub-card[data-sub]'); if (!card) return;
  var id = card.getAttribute('data-sub'); if (card.querySelector('.gcns-set[data-gcns="' + id + '"]')) return;
  if (card.__gcnsLoading === id) return; card.__gcnsLoading = id;
  loadNs(false).then(function(L){
    card.__gcnsLoading = '';
    if (!L || !card.isConnected || card.querySelector('.gcns-set')) return;
    var sb = arr(L.subs).filter(function(x){ return x.id === id; })[0] || { id: id, noShow: false };
    var box = D.createElement('div'); box.innerHTML = nsHtml(sb); card.appendChild(box.firstChild);
  });
}
D.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('[data-gcns-save]'); if (!b) return;
  var row = b.closest('.gcns-set'), id = row.getAttribute('data-gcns'), on = row.querySelector('[data-gcns-on]').checked;
  b.disabled = true; b.textContent = 'Saving…';
  j('/.netlify/functions/sub-texts?noshow=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subId: id, on: on }) }).then(function(o){
    b.disabled = false; b.textContent = o.ok ? 'Saved ✓' : 'Save';
    if (!o.ok) { var m = row.querySelector('.gcst-err'); if (!m) { m = D.createElement('div'); m.className = 'gcst-err'; m.setAttribute('role', 'alert'); row.appendChild(m); } m.textContent = o.error || 'Could not save.'; return; }
    NS.at = 0; ST.call(W, function(){ if (b.isConnected) b.textContent = 'Save'; }, 2500);
  });
}, true);

/* ── 2. ⚙ Admin → 📊 Weekly owner report ── */
function renderWeekly(el){
  el.innerHTML = '<div class="gcow"><div class="gcow-bar"><button type="button" class="gcsub-btn" data-gcow="reload">↻ Refresh</button> <button type="button" class="gcsub-btn" data-gcow="send">✉️ Send it to the admins now</button> <span class="gcow-note">Goes by itself every Monday at 7 AM Central to Wesley and Nick.</span></div><div class="gcow-msg" role="status">Loading last week’s report…</div><iframe class="gcow-frame" title="Weekly owner report" sandbox=""></iframe></div>';
  var msg = el.querySelector('.gcow-msg'), fr = el.querySelector('.gcow-frame');
  function load(){
    msg.textContent = 'Loading last week’s report…';
    j('/.netlify/functions/scheduled-reports?view=1').then(function(o){
      if (!o.ok) { msg.textContent = o.error || 'Could not load the report.'; return; }
      var last = o.lastSent && o.lastSent.week ? ' Last Monday e-mail: week of ' + o.lastSent.week + (o.lastSent.ok ? ' ✓ sent' : ' — not sent' + (o.lastSent.why ? ' (' + o.lastSent.why + ')' : '')) + '.' : '';
      msg.textContent = 'Week: ' + (o.week && o.week.label || '') + '.' + last;
      fr.srcdoc = o.html; W._gcOwnerWeeklyLast = o;
    });
  }
  el.querySelector('[data-gcow="reload"]').onclick = load;
  el.querySelector('[data-gcow="send"]').onclick = function(){
    var b = this; b.disabled = true; b.textContent = 'Sending…';
    j('/.netlify/functions/scheduled-reports?send=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(function(o){
      b.disabled = false; b.textContent = '✉️ Send it to the admins now';
      msg.textContent = o.ok ? 'Sent to ' + arr(o.to).join(', ') + '.' : 'Not sent: ' + (o.why || o.error || 'unknown');
    });
  };
  load();
}
var addTries = 0;
function addSection(){
  if (typeof W._gcAdmAddSection === 'function') {
    W._gcAdmAddSection({ id: 'ownerweekly', after: 'referral', ic: '📊', t: 'Weekly owner report', d: 'Every Monday 7 AM: leads by source, close rate, jobs, money, approvals, who is behind, emergencies, calls', render: renderWeekly });
    return;
  }
  if (++addTries < 60) ST.call(W, addSection, 1000);
}
W._gcOwnerWeekly = { render: renderWeekly };

function tick(){
  var view = ''; try { view = localStorage.getItem('grayco_view') || ''; } catch (e) {}
  if (!D.hidden && view === 'subs') { try { decorateSub(); } catch (e) {} }
  ST.call(W, tick, view === 'subs' ? 1300 : 2600);
}
var css = D.createElement('style');
css.textContent = '.gcns-set{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0}' +
  '.gcow-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}.gcow-note{font-size:12px;color:#64748b}.gcow-msg{font-size:13px;color:#334155;margin:4px 0 8px}' +
  '.gcow-frame{width:100%;min-height:900px;height:80vh;border:1px solid #e2e8f0;border-radius:12px;background:#f3f4f6}';
(D.head || D.documentElement).appendChild(css);
ST.call(W, tick, 1700);
addSection();
try { console.log('[GC] Owner automations 10/29: sub no-show switch + 📊 Weekly owner report (patch AUTOC)'); } catch (e) {}
})();
