/* __GC_PATCH_AUTOPANEL__ — ⚙ Admin → ⚡ Automations (owner 11/02: "make sure nothing is automatic in my CRM until I tell
   it to be auto, I have a lot of stuff to add, fix and test this week").
   Every automation of the CRM (window._gcAutoReg), grouped: Customer sends · Sub sends · Record changes · Staff alerts ·
   Safety · Sync / backups / lead intake. Each line: what it does in plain words, its switch, when it last ran, and
   "held N times since …" (what it would have done while OFF). Safety items show 🔒 ON — switching one off asks first.
   "↺ Turn on everything I had before" puts every automation back ON (how the CRM ran before this panel).
   Admins change it (the server checks too); the office sees it read-only (💎 → ⚡ Automations, or Admin).
   API: window._gcAutoPanel = { open(), render(box) } */
(function(){
'use strict';
if (window.__GC_PATCH_AUTOPANEL__) return; window.__GC_PATCH_AUTOPANEL__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var A = W._gcAutomations, R = W._gcAutoReg;
if (!A || !R) return;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function isOffice(){ try { if (W._gcRP && typeof W._gcRP.role === 'function' && /office/i.test(s(W._gcRP.role()))) return true; } catch (e) {} try { return /office/i.test(s(W._gcMeNow && (W._gcMeNow.role || W._gcMeNow.title))); } catch (e) { return false; } }
function when(iso){ var t = Date.parse(iso || ''); if (!t) return ''; try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return s(iso); } }
/* patch AUTOPANEL (coordinator 11/02): automations that act on what is waiting NOW when switched on (not on a clock) — the
   switch-on asks first and says how many items are waiting: the page counts the draws itself; otherwise the last
   "would have done N" the automation recorded while it was OFF */
var STATE = { job_stages: 'draw invoices / stage steps', legacy_progress_billing: 'progress draws', progress_autodraw: 'draw invoices', appt_confirmations: 'appointment messages', bid_result_emails: 'bid-result e-mails to GCs',
  auto_100: 'jobs set to 100 %', closeout_autopilot: 'job closeouts', mailed_invoice_booking: 'e-mailed invoices / receipts', ms_tax_add: 'Mississippi estimates', lead_auto_assign: 'held leads', companycam_new_jobs: 'new CompanyCam projects' };
function drawsWaiting(){
  try {
    if (typeof W._gcDrawMilestones !== 'function' || typeof W._gcClientInvoiced !== 'function') return null;
    var n = 0;
    ((W._crm && W._crm.projects) || []).forEach(function(p){
      if (!p || p.deleted || p.importedHistory || p.noAutomations || /lost|dead|cancel|complete|closed/i.test(s(p.status))) return;
      var c = parseFloat(String(p.contract || '').replace(/[$,]/g, '')) || 0, pct = parseFloat(p.pct) || 0; if (!c || !pct) return;
      var sur = W._gcDrawMilestones(p).filter(function(m){ return pct >= m.at; }); if (!sur.length) return;
      if (Math.round(c * sur[sur.length - 1].at) / 100 - (W._gcClientInvoiced(p.id) || 0) > 0.01) n++;
    });
    return n;
  } catch (e) { return null; }
}
function waiting(key, st){
  if (!STATE[key]) return null;
  var n = null;
  if (key === 'job_stages' || key === 'legacy_progress_billing' || key === 'progress_autodraw') n = drawsWaiting();
  if (n == null) { var h = (st.held || {})[key] || {}, l = (st.localHeld || {})[key] || {}; n = h.would != null ? h.would : l.would != null ? l.would : null; }
  return { n: n, what: STATE[key] };
}
function waitingText(w){ return w ? (w.n == null ? 'an unknown number of waiting ' + w.what : w.n + ' waiting ' + w.what) : ''; }
var EFFECT = { A: 'sends to customers / subs', B: 'staff only', C: 'changes records', D: 'sync / read' };
function toast(msg, bad){
  try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100200;background:' + (bad ? '#7f1d1d' : '#14532d') + ';color:#fff;padding:10px 16px;border-radius:10px;font:600 13px Inter,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3);max-width:90vw';
    D.body.appendChild(t); later(function(){ try { t.remove(); } catch (e) {} }, 4500); } catch (e) {}
}
function css(){
  if (D.getElementById('gcap-css')) return;
  var st = D.createElement('style'); st.id = 'gcap-css';
  st.textContent = '.gcap{font:14px Inter,sans-serif;color:#0f172a}.gcap h4{margin:16px 0 6px;font-size:15px}.gcap .gcap-gd{color:#64748b;font-size:12px;margin:-4px 0 6px}' +
    '.gcap-row{display:flex;gap:10px;align-items:flex-start;padding:8px 6px;border-bottom:1px solid #eef2f7}.gcap-row:hover{background:#f8fafc}' +
    '.gcap-main{flex:1;min-width:0}.gcap-name{font-weight:700}.gcap-desc{color:#475569;font-size:12.5px;margin-top:2px}.gcap-meta{color:#64748b;font-size:11.5px;margin-top:3px}' +
    '.gcap-held{color:#92400e}.gcap-tag{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;background:#eef2ff;color:#3730a3;margin-left:6px;vertical-align:1px}' +
    '.gcap-sw{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:12px;white-space:nowrap;cursor:pointer}.gcap-sw input{width:18px;height:18px;cursor:pointer}' +
    '.gcap-on{color:#166534}.gcap-off{color:#991b1b}.gcap-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}' +
    '.gcap-bar button{border:none;border-radius:8px;padding:8px 12px;font:700 13px Inter,sans-serif;cursor:pointer}.gcap-b1{background:#16a34a;color:#fff}.gcap-b2{background:#e2e8f0;color:#0f172a}' +
    '.gcap-note{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;font-size:13px;color:#78350f;margin:8px 0}' +
    '.gcap-cc{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:6px 8px;font-size:12px;color:#1e3a8a;margin-top:4px}';
  (D.head || D.documentElement).appendChild(st);
}
function lineFor(a, st, adm){
  var on = !!st.settings[a.key], h = st.held[a.key] || {}, loc = st.localHeld[a.key] || {};
  var lock = a.group === 'safety', ro = !adm || a.fixed;
  var meta = [];
  if (h.ran) meta.push('last run ' + esc(when(h.ran)));
  if (h.n) meta.push('<span class="gcap-held">held ' + h.n + ' time' + (h.n === 1 ? '' : 's') + ' since ' + esc(when(h.since)) + (h.would != null ? ' · last time it would have done ' + h.would : '') + (h.sample && h.sample.length ? ' (' + esc(h.sample.join('; ')) + ')' : '') + '</span>');
  else if (loc.n && !on) meta.push('<span class="gcap-held">held on this computer since ' + esc(when(loc.since)) + '</span>');
  if (!meta.length) meta.push(on ? 'no run recorded yet' : 'nothing held yet');
  if (!on && STATE[a.key]) meta.push('<span class="gcap-held">⚠ switching it on acts on ' + esc(waitingText(waiting(a.key, st))) + ' at once</span>');
  return '<div class="gcap-row" data-gcap-key="' + esc(a.key) + '"><div class="gcap-main"><div class="gcap-name">' + (lock ? '🔒 ' : '') + esc(a.name) +
    '<span class="gcap-tag">' + esc(EFFECT[a.effect] || a.effect) + '</span>' + (a.where === 'page' ? '<span class="gcap-tag" style="background:#f1f5f9;color:#334155">in the CRM page</span>' : '') + '</div>' +
    '<div class="gcap-desc">' + esc(a.desc) + '</div>' +
    (a.key === 'companycam_new_jobs' ? '<div class="gcap-cc">📸 This is how PM jobs arrive from CompanyCam. While it is OFF, new CompanyCam projects wait on the 📸 CompanyCam review list (＋ Make it a new job). Reading, linking and photo copies keep running.</div>' : '') +
    '<div class="gcap-meta">' + meta.join(' · ') + '</div></div>' +
    '<label class="gcap-sw ' + (on ? 'gcap-on' : 'gcap-off') + '"><input type="checkbox" data-gcap-sw="' + esc(a.key) + '"' + (on ? ' checked' : '') + (ro ? ' disabled' : '') + '> ' + (a.fixed ? 'Always ON' : on ? 'ON' : 'OFF') + '</label></div>';
}
function render(box){
  css();
  var st = A.state(), adm = isAdmin() && st.admin !== false;
  if (!st.loaded) { box.innerHTML = '<div class="gcap">Loading the automations…</div>'; A.load().then(function(){ if (A.state().loaded) render(box); else box.innerHTML = '<div class="gcap gcap-note">Could not read the automations: ' + esc(A.state().err || 'not signed in') + '</div>'; }); return; }
  var onN = R.LIST.filter(function(a){ return st.settings[a.key]; }).length;
  var html = '<div class="gcap">' +
    '<div class="gcap-note"><b>Nothing runs by itself unless it is ON here.</b> An automation that is OFF does nothing and notes what it would have done ("held") — nothing is saved up to go out later. Safety (missed calls, emergencies, on-call), lead intake, sync and backups stay ON. ' + onN + ' of ' + R.LIST.length + ' are ON.</div>' +
    (adm ? '<div class="gcap-bar"><button type="button" class="gcap-b1" data-gcap="before">↺ Turn on everything I had before</button><button type="button" class="gcap-b2" data-gcap="defaults">Back to the safe defaults</button><span class="gcap-gd">Changes are saved at once and logged (who / when).</span></div>'
         : '<div class="gcap-gd" style="margin:6px 0">You can see the automations; only an admin (Wesley or Nick) can switch them.</div>');
  R.GROUPS.forEach(function(g){
    var list = R.LIST.filter(function(a){ return a.group === g[0]; }); if (!list.length) return;
    html += '<h4>' + esc(g[1]) + ' <span class="gcap-gd">(' + list.filter(function(a){ return st.settings[a.key]; }).length + ' / ' + list.length + ' ON)</span></h4><div class="gcap-gd">' + esc(g[2]) + '</div>' +
      list.map(function(a){ return lineFor(a, st, adm); }).join('');
  });
  var log = (st.log || []).slice(0, 12);
  if (log.length) html += '<h4>Recent changes</h4>' + log.map(function(x){ var a = R.BY[x.key]; return '<div class="gcap-meta">' + esc(when(x.at)) + ' — ' + esc(x.byName || x.by) + ' turned <b>' + esc(a ? a.name : x.key) + '</b> ' + (x.on ? 'ON' : 'OFF') + (x.op && x.op !== 'set' ? ' (' + esc(x.op === 'before' ? 'everything I had before' : 'defaults') + ')' : '') + '</div>'; }).join('');
  html += '</div>';
  box.innerHTML = html;
  box.onchange = function(ev){
    var k = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-gcap-sw'); if (!k) return;
    var a = R.BY[k], want = !!ev.target.checked;
    if (!adm) { ev.target.checked = !want; return; }
    if (!want && a.critical && !confirm('Turn OFF "' + a.name + '"?\n\nThis is a ' + (a.group === 'safety' ? 'SAFETY' : 'lead-intake / backup') + ' automation. While it is off: ' + a.desc + ' — will NOT happen.' + (a.group === 'sync' && /intake|inbox/i.test(a.name + a.key) ? '\nLeads sent while it is off are refused (the sender may try again later).' : ''))) { ev.target.checked = true; return; }
    var wt = want ? waiting(k, st) : null;
    if (want && (a.effect === 'A' || a.effect === 'C') && !a.critical && !confirm('Turn ON "' + a.name + '"?\n\n' + a.desc + '\n\n' + (wt ? '⚠ Turning this on will act on ' + waitingText(wt) + ' NOW (what piled up while it was off), then keep running by itself.' : 'It will run by itself from now on.'))) { ev.target.checked = false; return; }
    var ch = {}; ch[k] = want; ev.target.disabled = true;
    A.set(ch).then(function(o){ if (o && o.__status === 200) toast('⚡ ' + a.name + ' is ' + (want ? 'ON' : 'OFF')); else { toast('Could not change it: ' + ((o && o.error) || (o && o.__status)), true); } render(box); });
  };
  box.onclick = function(ev){
    var t = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-gcap'); if (!t || !adm) return;
    var pile = Object.keys(STATE).filter(function(k){ return !st.settings[k]; }).map(function(k){ return '• ' + R.BY[k].name + ': ' + waitingText(waiting(k, st)); });
    if (t === 'before' && confirm('Turn on EVERYTHING the CRM did before this panel?\n\nEvery automation goes back ON: invoice and expense auto-posts, draws, job stages, closeout, reminders, sub texts, the monthly price update, CompanyCam new jobs …' + (pile.length ? '\n\n⚠ These will act NOW on what is waiting:\n' + pile.join('\n') : ''))) {
      A.before().then(function(o){ toast(o && o.__status === 200 ? '↺ Everything is ON again, as before.' : 'Could not change it: ' + ((o && o.error) || (o && o.__status)), !(o && o.__status === 200)); render(box); });
    }
    if (t === 'defaults' && confirm('Back to the safe defaults?\n\nSafety, lead intake, sync, backups and staff alerts ON; everything that sends to customers / subs or changes records by itself OFF.')) {
      A.defaults().then(function(o){ toast(o && o.__status === 200 ? 'Back to the safe defaults.' : 'Could not change it: ' + ((o && o.error) || (o && o.__status)), !(o && o.__status === 200)); render(box); });
    }
  };
}
function open(){
  css();
  var ov = D.createElement('div'); ov.setAttribute('data-gc-keep', '1'); ov.id = 'gcap-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100100;background:rgba(6,12,20,.8);display:flex;align-items:center;justify-content:center;padding:16px';
  var card = D.createElement('div'); card.style.cssText = 'background:#fff;color:#0f172a;width:100%;max-width:760px;border-radius:12px;padding:20px;max-height:90vh;overflow:auto;box-sizing:border-box';
  card.innerHTML = '<button type="button" data-gcap-x style="float:right;border:none;background:#e2e8f0;border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:700">Close</button><div style="font:800 18px Inter,sans-serif;margin-bottom:10px">⚡ Automations</div><div data-gcap-body></div>';
  ov.appendChild(card); D.body.appendChild(ov);
  card.querySelector('[data-gcap-x]').onclick = function(){ ov.remove(); };
  ov.addEventListener('click', function(ev){ if (ev.target === ov) ov.remove(); });
  var body = card.querySelector('[data-gcap-body]'); body.innerHTML = '<div class="gcap">Loading…</div>';
  A.load().then(function(){ render(body); });
}
/* 💎 menu item (admins and the office) */
function hubItem(){
  try {
    if (!isAdmin() && !isOffice()) return;
    var all = D.querySelectorAll('.gc-hub-panel'), panel = null;
    for (var i = 0; i < all.length; i++) if (all[i].getClientRects().length) { panel = all[i]; break; }
    if (!panel || panel.querySelector('#gc-autopanel-hub')) return;
    var it = D.createElement('div'); it.id = 'gc-autopanel-hub'; it.className = 'gc-hub-item'; it.textContent = '⚡ Automations — what runs by itself';
    it.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;color:#1e3a8a;border-bottom:1px solid #f1f5f9;background:#eff6ff';
    it.onclick = open;
    var first = panel.querySelector('#gc-pause-hub') || panel.firstElementChild;
    if (first && first.parentNode === panel) panel.insertBefore(it, first.nextSibling); else panel.appendChild(it);
  } catch (e) {}
}
D.addEventListener('click', function(){ later(hubItem, 180); }, true);
function addSection(){
  if (typeof W._gcAdmAddSection !== 'function') return false;
  W._gcAdmAddSection({ id: 'automations', after: 'pause', ic: '⚡', t: 'Automations', d: 'Every automation, one switch each — nothing runs by itself unless it is ON',
    render: function(box){ box.innerHTML = '<div class="gcap">Loading…</div>'; A.load().then(function(){ render(box); }); },
    count: function(){ var st = A.state(); return st.loaded ? R.LIST.filter(function(a){ return st.settings[a.key]; }).length + ' ON' : ''; } });
  return true;
}
if (!addSection()) { var tries = 0, iv = RI.call(W, function(){ if (addSection() || ++tries > 120) clearInterval(iv); }, 500); }
W._gcAutoPanel = { open: open, render: render };
try { console.log('[GC] ⚡ Automations panel (patch AUTOPANEL): _gcAutoPanel.open()'); } catch (e) {}
})();
