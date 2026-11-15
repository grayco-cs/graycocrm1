/* __GC_PATCH_FOLLOW1__ — small follow-ups (owner's 11/15 list, item 1)
   a. NLBADGE: GrayCo Field's bottom bar — the 🏠 Home button carries a red count of MY new leads (the same list as the
      📥 New lead card, window._gcNewLead.mine()); 0 → no badge.
   b. NOCELL: ⚙ Admin → 📱 Text alerts — a person switched ON with no 10-digit cell is flagged on their row ("⚠ no cell —
      gets no texts") and counted at the top of the table, as you type.
   c. TEXTEDPM: the text to a PM that a lead was assigned to them goes on that lead's timeline as "📱 texted <PM>" (server:
      _lib/smsalert.js assigned() now logs the lead id; the TEXTLOG reader shows it).
   d. TWLIVE: 🔎 Check Twilio now on the Text alerts card (admins): texts.js ?status=1&live=1 — read-only look at the Twilio
      account (active?), each GrayCo number (on the account? its text webhook pointing at the CRM?) and the last 20 texts
      (delivered / failed, the last error). Nothing is sent or changed.
   API: window._gcFollow1 = { badge(), nocell(), twilio() } */
(function(W){
'use strict';
if (W.__GC_PATCH_FOLLOW1__) return; W.__GC_PATCH_FOLLOW1__ = true;
var D = W.document, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function d10(v){ var d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }

/* a. the Field bar's Home badge */
function badge(){
  try {
    var btn = D.querySelector('#gc-fh-tabs [data-t="home"]'); if (!btn) return 0;
    var n = 0; try { n = (W._gcNewLead && W._gcNewLead.mine) ? W._gcNewLead.mine().length : 0; } catch (e) { n = 0; }
    var e = btn.querySelector('.e'), b = btn.querySelector('.gc-nl-badge');
    if (!n) { if (b) b.remove(); return 0; }
    if (!b) { b = D.createElement('span'); b.className = 'gc-fh-badge gc-nl-badge'; b.style.cssText = 'background:#dc2626;font-size:11px;top:-6px;right:-12px'; if (e) { e.style.position = 'relative'; e.appendChild(b); } else btn.appendChild(b); }
    var t = n > 99 ? '99+' : String(n); if (b.textContent !== t) b.textContent = t;
    var lab = n + ' new lead' + (n === 1 ? '' : 's') + ' for you'; if (btn.getAttribute('aria-label') !== 'Home — ' + lab) { btn.setAttribute('aria-label', 'Home — ' + lab); btn.title = lab; }
    return n;
  } catch (x) { return 0; }
}

/* b. on but no cell */
function nocell(){
  var box = D.querySelector('.gcsa'); if (!box) return [];
  var bad = [];
  [].forEach.call(box.querySelectorAll('tr.gcsa-row'), function(tr){
    if (tr.getAttribute('data-role') === '1') return;
    var on = tr.querySelector('input[data-k="on"]'), ph = tr.querySelector('input[data-k="phone"]');
    var nm = s((tr.querySelector('b') || {}).textContent), flag = tr.querySelector('.gc-nocell');
    var miss = !!(on && on.checked && (!ph || d10(ph.value).length !== 10));
    if (miss) bad.push(nm);
    if (miss && !flag) { flag = D.createElement('div'); flag.className = 'gc-nocell'; flag.style.cssText = 'font-size:11.5px;font-weight:700;color:#b45309'; flag.textContent = '⚠ no cell — gets no texts'; var td = tr.querySelector('b') && tr.querySelector('b').parentElement; if (td) td.appendChild(flag); }
    if (!miss && flag) flag.remove();
    if (ph) ph.style.borderColor = miss ? '#f59e0b' : '';
  });
  var top = box.querySelector('#gc-nocell-sum');
  if (bad.length) {
    if (!top) { top = D.createElement('div'); top.id = 'gc-nocell-sum'; top.style.cssText = 'background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:8px 10px;margin:0 0 10px;color:#92400e;font-weight:600'; var tbl = box.querySelector('table'); var host = tbl && tbl.parentElement; if (host && host.parentElement) host.parentElement.insertBefore(top, host); else box.insertBefore(top, box.firstChild); }
    var t = '⚠ ' + bad.length + ' ' + (bad.length === 1 ? 'person is' : 'people are') + ' switched on but ' + (bad.length === 1 ? 'has' : 'have') + ' no cell number: ' + bad.join(', ') + '. Add their cell or they get no texts.';
    if (top.textContent !== t) top.textContent = t;
  } else if (top) top.remove();
  return bad;
}
D.addEventListener('input', function(e){ if (e.target && e.target.closest && e.target.closest('.gcsa')) nocell(); }, true);
D.addEventListener('change', function(e){ if (e.target && e.target.closest && e.target.closest('.gcsa')) nocell(); }, true);

/* d. 🔎 Check Twilio now */
function twHtml(o){
  if (!o || !o.ok) return '<span style="color:#b91c1c">Could not check: ' + esc((o && o.error) || 'no answer') + '</span>';
  var L = o.live || {};
  if (!L.ready) return '⚠ Twilio is not set up on Netlify (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).';
  var h = [];
  if (L.account) h.push((L.account.ok ? (L.account.status === 'active' ? '✅' : '⚠') : '❌') + ' Account ' + esc(L.account.sid || '') + ': ' + esc(L.account.ok ? (L.account.status || '?') + (L.account.type ? ' (' + L.account.type + ')' : '') : (L.account.error || 'not reached')));
  (L.numbers || []).forEach(function(n){ h.push((n.found ? (n.smsHook ? '✅' : '⚠') : '❌') + ' ' + esc(n.label) + ' ' + esc(n.number) + ': ' + esc(n.found ? (n.smsHook ? 'on the account, texts come to the CRM' : 'on the account, but its text webhook is not the CRM (' + (n.smsUrl || 'empty') + ')') : (n.error || 'not on this Twilio account'))); });
  if (L.recent) { var r = L.recent; h.push((r.failed ? '⚠' : '✅') + ' Last ' + r.n + ' text' + (r.n === 1 ? '' : 's') + ': ' + Object.keys(r.by || {}).map(function(k){ return r.by[k] + ' ' + k; }).join(', ') + (r.lastError ? ' — last error ' + esc(r.lastError.code) + (r.lastError.at ? ' (' + esc(r.lastError.at.slice(0, 10)) + ')' : '') : '')); }
  if (o.paused) h.push('⏸ Data-entry mode is on — the CRM holds outside texts.');
  h.push('<span style="color:#64748b">Checked ' + esc(new Date().toLocaleString()) + ' · read-only, nothing was sent.</span>');
  return h.join('<br>');
}
function twilio(){
  var out = D.getElementById('gc-tw-out'); if (out) out.innerHTML = 'Checking Twilio…';
  return W.fetch('/.netlify/functions/texts?status=1&live=1', { cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return { ok: false, error: 'HTTP ' + r.status }; }); }, function(){ return { ok: false, error: 'no signal' }; })
    .then(function(o){ var el = D.getElementById('gc-tw-out'); if (el) el.innerHTML = twHtml(o); return o; });
}
function twMount(){
  var box = D.querySelector('.gcsa'); if (!box || box.querySelector('#gc-tw-live')) return;
  var first = box.firstElementChild; if (!first) return;
  var d = D.createElement('div'); d.id = 'gc-tw-live'; d.style.cssText = 'border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin:0 0 10px;line-height:1.5';
  d.innerHTML = '<button type="button" id="gc-tw-btn" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer">🔎 Check Twilio now</button> <span style="font-size:12px;color:#64748b">account, numbers and the last texts — read-only</span><div id="gc-tw-out" style="margin-top:6px;font-size:12.5px"></div>';
  first.insertAdjacentElement('afterend', d);
}
D.addEventListener('click', function(e){ var b = e.target && e.target.closest ? e.target.closest('#gc-tw-btn') : null; if (!b) return; e.preventDefault(); twilio(); }, true);

SI.call(W, function(){ if (D.hidden) return; badge(); if (D.querySelector('.gcsa')) { nocell(); twMount(); } }, 1500);
W._gcFollow1 = { badge: badge, nocell: nocell, twilio: twilio, twHtml: twHtml };
})(window);
