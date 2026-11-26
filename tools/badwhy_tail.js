/* __GC_PATCH_BADWHY__ — 👎 WHY IS IT A BAD LEAD? (tools/patch_BADWHY.py).
   Owner 11/26: "when we comment bad lead for lsa we can type bad, didnt want to schedule appointment or whatever reason and marketing or
   office sees that when they qualify the lead".
   · Every 👎 Bad lead button (the PM's bar on his Google lead, 📞 Google calls / the lead's LSA bar, the 📥 New lead card) opens a small
     box RIGHT UNDER IT — no pop-up: quick picks ("Didn't want to schedule an appointment", "Wrong service / not our work", "Spam / wrong
     number", "Out of area", "Price shopping only") + type your own; Save bad lead / Cancel. A reason is needed.
   · The reason is saved on the lead with who and when (lsaReason, lsaReasonBy, lsaReasonAt; the server keeps the same on the Lead Inbox
     item and gc_lsa_decisions, and puts it in the dispute To-Dos for the office and marketing: "Reason (paste into Google's dispute form)").
   · Shown where the office and marketing qualify leads: a red "👎 Bad lead — <reason>" box at the top of the open lead (who, when,
     📋 Copy reason for Google's dispute form), a line on each row of 📞 Google calls, and a "👎 <reason>" chip on the Leads list rows.
   API: window._gcBadWhy = { open(button, { after }) → Promise<reason | null>, line(x), reasonOf(lead), PICKS } */
(function(W){
'use strict';
if (W.__GC_PATCH_BADWHY__) return; W.__GC_PATCH_BADWHY__ = true;
var D = W.document, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
var PICKS = ["Didn't want to schedule an appointment", 'Wrong service / not our work', 'Spam / wrong number', 'Out of area', 'Price shopping only'];
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function when(v){ var t = Date.parse(s(v)); if (!isFinite(t)) return ''; try { return new Date(t).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return s(v).slice(0, 16); } }
function css(){
  if (D.getElementById('gc-badwhy-css')) return;
  var st = D.createElement('style'); st.id = 'gc-badwhy-css';
  st.textContent = '.gc-bw{margin:8px 0;padding:10px 12px;border:2px solid #fca5a5;border-radius:12px;background:#fff7f7;font:14px Inter,Arial,sans-serif;color:#0f172a;box-sizing:border-box;max-width:100%}'
    + '.gc-bw-h{font-weight:800;color:#991b1b;margin-bottom:6px}.gc-bw-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}'
    + '.gc-bw-chips button{min-height:40px;padding:0 12px;border-radius:999px;border:1px solid #fca5a5;background:#fff;color:#7f1d1d;font:600 13.5px Inter,Arial,sans-serif;cursor:pointer;max-width:100%;white-space:normal;text-align:left}'
    + '.gc-bw-chips button[aria-pressed=true]{background:#991b1b;color:#fff;border-color:#991b1b}'
    + '.gc-bw input{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #cbd5e1;border-radius:9px;padding:0 10px;font:15px Inter,Arial,sans-serif}'
    + '.gc-bw-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.gc-bw-acts button{flex:1 1 140px;min-height:44px;border-radius:10px;font:800 14.5px Inter,Arial,sans-serif;cursor:pointer}'
    + '.gc-bw-msg{font-size:12.5px;color:#b91c1c;margin-top:4px;min-height:1em}'
    + '#gc-bad-why{margin:0 0 10px;padding:10px 12px;border-radius:12px;border:2px solid #dc2626;background:#fef2f2;font:14px Inter,Arial,sans-serif;color:#0f172a;box-sizing:border-box;max-width:100%}'
    + '#gc-bad-why .r{font-size:16px;font-weight:800;color:#991b1b;margin:2px 0;overflow-wrap:anywhere}#gc-bad-why button{min-height:38px;padding:0 12px;border-radius:9px;border:1px solid #991b1b;background:#fff;color:#991b1b;font:700 13.5px Inter,Arial,sans-serif;cursor:pointer;margin-top:6px}'
    + '.gc-bw-line{margin-top:6px;padding:6px 10px;border-radius:9px;background:#fef2f2;border:1px solid #fca5a5;color:#7f1d1d;font-size:13.5px;overflow-wrap:anywhere}'
    + '.gc-bw-chip{display:inline-block;margin-left:6px;border-radius:999px;padding:0 8px;font:700 11px Inter,Arial,sans-serif;line-height:18px;vertical-align:middle;background:#fee2e2;color:#991b1b;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';
  (D.head || D.documentElement).appendChild(st);
}
/* the inline box: resolves with the reason (Save) or null (Cancel); never a pop-up */
var OPEN = null;
function open(btn, o){
  o = o || {}; css();
  if (OPEN && OPEN.box && OPEN.box.isConnected) { try { OPEN.done(null); } catch (e) {} }
  var after = o.after || (btn && btn.closest ? (btn.closest('[data-lc-row],[data-id],.gc-nl-r') || btn) : null);
  return new Promise(function(resolve){
    var box = D.createElement('div'); box.className = 'gc-bw'; box.setAttribute('data-gc-keep', '1'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Why is it a bad lead?');
    box.innerHTML = '<div class="gc-bw-h">👎 Why is it a bad lead?</div><div class="gc-bw-chips">' + PICKS.map(function(p, i){ return '<button type="button" data-bw-pick="' + i + '" aria-pressed="false">' + esc(p) + '</button>'; }).join('') + '</div>'
      + '<input data-bw-txt type="text" maxlength="200" autocomplete="off" placeholder="Tap one above, or type the reason" aria-label="Reason">'
      + '<div class="gc-bw-acts"><button type="button" data-bw-save style="border:1px solid #991b1b;background:#991b1b;color:#fff">👎 Save bad lead</button><button type="button" data-bw-cancel style="border:1px solid #cbd5e1;background:#fff;color:#334155">Cancel</button></div><div class="gc-bw-msg" data-bw-msg aria-live="polite"></div>';
    var inp = box.querySelector('[data-bw-txt]'), msg = box.querySelector('[data-bw-msg]'), fin = false;
    function done(v){ if (fin) return; fin = true; try { box.remove(); } catch (e) {} if (OPEN && OPEN.box === box) OPEN = null; resolve(v); }
    function save(){ var v = s(inp.value).replace(/\s+/g, ' ').slice(0, 200); if (!v) { msg.textContent = 'Pick a reason or type one.'; inp.focus(); return; } done(v); }
    box.addEventListener('click', function(e){
      var t = e.target && e.target.closest ? e.target.closest('button') : null; if (!t || !box.contains(t)) return;
      e.preventDefault(); e.stopPropagation();
      if (t.hasAttribute('data-bw-pick')) { var p = PICKS[+t.getAttribute('data-bw-pick')] || ''; inp.value = p; [].forEach.call(box.querySelectorAll('[data-bw-pick]'), function(x){ x.setAttribute('aria-pressed', x === t ? 'true' : 'false'); }); msg.textContent = ''; inp.focus(); return; }
      if (t.hasAttribute('data-bw-save')) { save(); return; }
      if (t.hasAttribute('data-bw-cancel')) done(null);
    });
    inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { e.preventDefault(); done(null); } });
    inp.addEventListener('input', function(){ msg.textContent = ''; [].forEach.call(box.querySelectorAll('[data-bw-pick]'), function(x){ x.setAttribute('aria-pressed', PICKS[+x.getAttribute('data-bw-pick')] === s(inp.value) ? 'true' : 'false'); }); });
    if (after && after.parentNode) after.insertAdjacentElement('afterend', box); else if (btn && btn.parentNode) btn.insertAdjacentElement('afterend', box); else { done(null); return; }
    OPEN = { box: box, done: done };
    try { inp.focus({ preventScroll: true }); box.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  });
}
/* the reason on a CRM lead (any of the places the marks keep it) */
function reasonOf(l){
  if (!l) return null; var ex = l.leadExtra || {}, br = ex.badReason || {};
  var chk = s(l.lsaCheck || ex.lsaCheck), lost = s(l.lostReason), bad = chk === 'bad' || chk === 'pm_bad' || /not a real lead/i.test(lost);
  if (!bad) return null;
  var r = s(l.lsaReason) || s(br.text) || ((/not a real lead \((.*)\)\s*$/i.exec(lost) || [])[1] || '');
  if (/^(bad|no reason given)$/i.test(r)) r = '';
  return { reason: r, by: s(l.lsaReasonBy) || s(br.by) || (chk === 'pm_bad' ? s(l.lsaPmBy) : '') || s(l.lsaDecidedBy), at: s(l.lsaReasonAt) || s(br.at) || (chk === 'pm_bad' ? s(l.lsaPmAt) : '') || s(l.lsaDecidedAt), pm: chk === 'pm_bad', disputed: s(l.lsaDisputedAt) };
}
/* one line for a 📞 Google calls row: x = { reason, by, at, check } */
function line(x){
  x = x || {}; if (!/^(bad|pm_bad)$/.test(s(x.check)) || !s(x.reason) || /^no reason given$/i.test(s(x.reason))) return '';
  css(); return '<div class="gc-bw-line" data-bw-line>👎 <b>Bad lead — ' + esc(x.reason) + '</b>' + (s(x.by) || s(x.at) ? ' <span style="color:#64748b">(' + esc([s(x.by), when(x.at)].filter(Boolean).join(', ')) + ')</span>' : '') + '</div>';
}
function leads(){ return (W._crm && Array.isArray(W._crm.leads)) ? W._crm.leads : []; }
function copy(t, btn){
  var okF = function(){ if (btn) { btn.textContent = '✓ Copied'; ST.call(W, function(){ btn.textContent = '📋 Copy reason'; }, 1800); } };
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(okF, function(){ fallback(); }); return; } } catch (e) {}
  fallback();
  function fallback(){ try { var a = D.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.cssText = 'position:fixed;left:-9999px;top:0'; D.body.appendChild(a); a.select(); D.execCommand('copy'); a.remove(); okF(); } catch (e) {} }
}
/* the open lead: the red box at the top */
function drawer(){
  try {
    var d = D.getElementById('gcl-drawer'); if (!d || !d.getClientRects().length) return;
    var H = W._gcLeadsHub, id = H && H.ui && H.ui().open, l = id && leads().find(function(y){ return y && s(y.id) === s(id); }), have = d.querySelector('#gc-bad-why');
    var R = reasonOf(l); if (!R) { if (have) have.remove(); return; }
    var lsa = !!(l.lsaCheck || (l.leadExtra || {}).lsaCheck || /google\s*lsa|local\s*services/i.test(s(l.source) + ' ' + s(l.leadSource)));
    var h = '<div style="font-size:12px;font-weight:800;color:#991b1b">👎 ' + (R.pm ? 'THE PM SAYS BAD LEAD' : 'BAD LEAD') + (R.disputed ? ' · ✓ disputed in Google' : '') + '</div>'
      + '<div class="r" data-bw-reason>' + (R.reason ? esc(R.reason) : '<span style="font-weight:600;color:#64748b">No reason was given.</span>') + '</div>'
      + '<div style="font-size:12.5px;color:#475569">' + esc([R.by ? 'by ' + R.by : '', when(R.at)].filter(Boolean).join(' · ')) + (lsa && R.reason && !R.disputed ? (R.by || R.at ? ' · ' : '') + 'paste it into Google\'s dispute form' : '') + '</div>'
      + (R.reason ? '<button type="button" data-bw-copy>📋 Copy reason</button>' : '');
    if (have && have.getAttribute('data-id') === s(l.id) && have.__h === h) return;
    if (!have) { css(); have = D.createElement('div'); have.id = 'gc-bad-why'; have.setAttribute('data-gc-keep', '1'); have.setAttribute('role', 'note'); }
    have.setAttribute('data-id', s(l.id)); have.__h = h; have.innerHTML = h; have.__r = R.reason;
    var dis = d.querySelector('#gc-lsa-dispute');
    if (dis && dis.parentElement === d) { if (dis.nextSibling !== have) dis.insertAdjacentElement('afterend', have); }
    else if (have.parentElement !== d || d.firstChild !== have) d.insertBefore(have, d.firstChild);
  } catch (e) {}
}
/* the Leads list rows: a "👎 <reason>" chip */
function chips(){
  try {
    var hub = D.getElementById('gc-leads-hub'); if (!hub || !hub.getClientRects().length) return;
    var by = {}; leads().forEach(function(l){ if (l && l.id) by[s(l.id)] = l; });
    [].forEach.call(hub.querySelectorAll('[data-gcl-id]'), function(row){
      var R = reasonOf(by[row.getAttribute('data-gcl-id')]), ch = row.querySelector('.gc-bw-chip'), txt = R && R.reason ? '👎 ' + R.reason : '';
      if (!txt) { if (ch) ch.remove(); return; }
      if (ch && ch.textContent === txt) return;
      if (!ch) { css(); ch = D.createElement('span'); ch.className = 'gc-bw-chip'; (row.querySelector('td.c-name') || row.querySelector('.gcl-card-name,.gcl-nm,b,strong') || row).appendChild(ch); }
      ch.textContent = txt; ch.title = 'Bad lead — ' + R.reason + (R.by ? ' (' + R.by + (R.at ? ', ' + when(R.at) : '') + ')' : '');
    });
  } catch (e) {}
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('#gc-bad-why [data-bw-copy]') : null; if (!b) return;
  e.preventDefault(); e.stopPropagation(); var box = b.closest('#gc-bad-why'); copy(s(box && box.__r), b);
}, true);
SI.call(W, function(){ if (!D.hidden) { drawer(); chips(); } }, 900);
W._gcBadWhy = { open: open, line: line, reasonOf: reasonOf, PICKS: PICKS.slice(), paint: function(){ drawer(); chips(); } };
try { console.log('[GC] 👎 bad-lead reason, inline (patch BADWHY) — _gcBadWhy'); } catch (e) {}
})(window);
