/* __GC_PATCH_LSA2__ — 📞 GOOGLE LSA follow-ups (owner's 11/15 list, item 4; builds on LSACHECK / LSAVET / LSADISPUTE / LSATEXT)
   a. LSACOUNT: a Google LSA lead counts as a lead only once it is ✓ good (or won / made a job). Waiting for the PM's / owner's check
      (pending, no answer, the PM's mark waiting on the owner) or ✕ bad, it is left out of the lead counts: Leads "New today · this
      week", the TV / Field scorecards ("New leads"), the office TV goal, and the weekly report e-mail (scheduled-reports.js). It still
      shows on the Leads list — the PM must call it. window._gcLsaPend(lead) → true = not counted.
   b. LSANUDGE: an LSA lead assigned to a PM and still not marked 👍 / 👎 24 hours after it was assigned → a high To-Do for that PM
      "👉 Google LSA lead <name> — 24 hours: call and mark it Good or Bad". Closes by itself once it is marked (or closed).
   c. LSADISPUTE2: a bad LSA lead not yet disputed → "⏰ 2 days left to dispute <name> in Google Ads (by <date>)" 2 days before the
      30-day line (30 days from the owner's ✕ Bad). "✓ Disputed in Ads" on the lead's 📍 Google LSA bar (and ticking the "⚖️ Dispute
      … in Google Ads" To-Do) writes it on the lead (lsaDisputedAt / By) and closes both To-Dos.
   d. LSAPANEL: 📊 LSA by month (Leads → the views row; admins + office): per month — LSA leads, 👍 good, 👎 bad, ⏳ pending,
      ⚖️ disputed (of the bad), 🔁 repeats folded in; the open disputes with their last day.
   e. LSADEDUPE lives on the server (website-intake.js): the same Google LSA lead again (same LSA lead id from Google's link, or the
      same phone within 30 days) is added to the first one (a 🔁 note), not a second lead.
   API: window._gcLsa2 = { pend(l), sweep(), panel(), months(n), disputed(id) } */
(function(W){
'use strict';
if (W.__GC_PATCH_LSA2__) return; W.__GC_PATCH_LSA2__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function me(){ try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return s(u.name) || s(u.email); } catch (e) { return ''; } }
function admin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /admin/i.test(s(u.role)) || /owner/i.test(s(u.payType)); } catch (e) { return false; } }
function office(){ if (admin()) return true; try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /office/i.test(s(u.role) + ' ' + s(u.profile)); } catch (e) { return false; } }
function leads(){ return arr(W._crm && W._crm.leads); }
function lead(id){ return leads().find(function(l){ return l && s(l.id) === s(id); }) || null; }
function isLsa(l){ var ex = (l && l.leadExtra) || {}; return !!l && (!!l.lsaCheck || !!ex.lsaCheck || /google\s*lsa|local\s*services/i.test([l.source, l.leadSource, ex.leadSource, ex.mkSource === 'Google LSA' ? 'google lsa' : ''].join(' '))); }
function chk(l){ return s(l.lsaCheck || (l.leadExtra || {}).lsaCheck); }
function wonOrJob(l){ return /won|convert|job/i.test(s(l.stage) + ' ' + s(l.status)) || !!s(l.projectId || l.convertedTo); }
function closed(l){ return !!(l.deleted || l.archived || l.mergedInto) || /lost|dead|closed|dismiss/i.test(s(l.stage) + ' ' + s(l.status)); }
/* a. not counted: an LSA lead that is not ✓ good (pending / no answer / PM's mark waiting / bad) and not won or a job */
function pend(l){ return !!l && isLsa(l) && chk(l) !== 'good' && !wonOrJob(l); }
W._gcLsaPend = pend;
function born(l){ var t = Date.parse(l.createdAt || l.receivedAt || l.created || (l.leadExtra && l.leadExtra.receivedAt) || (s(l.date) ? s(l.date) + 'T12:00:00' : '')); return isFinite(t) ? t : 0; }
function saveLead(id, patch){
  var now = new Date().toISOString();
  var f = function(list){ var out = arr(list).map(function(l){ return l && s(l.id) === s(id) ? Object.assign({}, l, patch, { updatedAt: now }) : l; }); try { if (W._gcApplySync) W._gcApplySync('leads', out); } catch (e) {} return out; };
  if (typeof W._setLeads === 'function') W._setLeads(f); else if (W._crm) W._crm.leads = f(W._crm.leads);
}
function tasks(){ try { var l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function saveTasks(l){ try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {} }
function ymd(t){ var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function nice(t){ var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate(); }
function pmOf(l){ return s(l.pm || l.assignedTo || l.assignee || l.estimator); }
function deadline(l){ var t = Date.parse(l.lsaDecidedAt || l.updatedAt || 0); return isFinite(t) && t ? t + 30 * 864e5 : 0; }
/* b + c. the To-Dos */
function sweep(){
  try {
    if (!office()) return 0; var L = leads(); if (!L.length) return 0;
    var T = tasks(), now = Date.now(), at = new Date().toISOString(), ch = 0, want = {};
    L.forEach(function(l){
      if (!l || !l.id || !isLsa(l)) return; var c = chk(l);
      /* b. 24 hours with the PM, not marked */
      var pm = pmOf(l), since = Date.parse(l.assignedAt || l.lsaSentAt || '') || born(l);
      if (pm && !closed(l) && !wonOrJob(l) && /^(pending|no_answer|)$/.test(c) && since && now - since >= 24 * 3600e3)
        want['LSANUDGE_' + l.id] = { id: 'LSANUDGE_' + l.id, kind: 'lsa_nudge', leadId: l.id, assignee: pm, prio: 'high', label: '👉 Google LSA lead ' + s(l.name || l.phone) + ' — 24 hours: call and mark it 👍 Good or 👎 Bad', note: 'It was given to ' + pm + ' ' + nice(since) + ' and is not marked yet. Open the lead → 👍 Good lead / 👎 Bad lead (📵 No answer if nobody picks up). Bad leads get disputed in Google Ads within 30 days.' };
      /* c. 2 days before the dispute line */
      var dl = deadline(l);
      if (c === 'bad' && !l.lsaDisputedAt && dl && now >= dl - 2 * 864e5)
        want['LSADISPUTE2_' + l.id] = { id: 'LSADISPUTE2_' + l.id, kind: 'lsa_dispute', leadId: l.id, prio: 'high', label: (now > dl ? '⚠️ Past the 30 days — ' : '⏰ 2 days left to dispute ') + s(l.name || l.phone) + ' in Google Ads (by ' + nice(dl) + ')', note: 'Google Ads → Local Services → Leads → find the lead → Dispute. Then press ✓ Disputed in Ads on the lead (or tick this).' };
      /* the "⚖️ Dispute … in Google Ads" To-Do ticked by a person → the lead says disputed */
      var dt = T.find(function(x){ return x && x.id === 'LSADISPUTE_' + l.id; });
      if (c === 'bad' && !l.lsaDisputedAt && dt && dt.done && !/lead gone/.test(s(dt.resolution))) { saveLead(l.id, { lsaDisputedAt: s(dt.doneAt) || at, lsaDisputedBy: s(dt.doneBy) || 'To-Do' }); }
    });
    Object.keys(want).forEach(function(id){
      var x = want[id], cur = T.find(function(y){ return y && y.id === id; });
      if (!cur) { T.push(Object.assign({ addedBy: 'CRM', addedAt: at, updatedAt: at, done: false }, x)); ch++; }
      else if (cur.done || cur.label !== x.label) { cur.label = x.label; cur.done = false; cur.updatedAt = at; ch++; }
    });
    T.forEach(function(y){ if (y && !y.done && /^(LSANUDGE|LSADISPUTE2)_/.test(s(y.id)) && !want[y.id]) { y.done = true; y.doneAt = y.updatedAt = at; y.resolution = /^LSANUDGE/.test(y.id) ? 'marked' : 'disputed'; ch++; } });
    if (ch) saveTasks(T);
    return ch;
  } catch (e) { return 0; }
}
function disputed(id){
  var at = new Date().toISOString();
  saveLead(id, { lsaDisputedAt: at, lsaDisputedBy: me() });
  var T = tasks(), ch = false;
  T.forEach(function(y){ if (y && !y.done && (y.id === 'LSADISPUTE_' + id || y.id === 'LSADISPUTE2_' + id)) { y.done = true; y.doneAt = y.updatedAt = at; y.doneBy = me(); y.resolution = 'disputed in Google Ads'; ch = true; } });
  if (ch) saveTasks(T);
}
/* c. the button on the lead's 📍 Google LSA bar */
function bar(){
  try {
    var b = D.getElementById('gc-lsa-dispute'); if (!b) return;
    var l = lead(b.getAttribute('data-id')); if (!l) return;
    var bad = chk(l) === 'bad' || /not a real lead/i.test(s(l.lostReason)), cur = b.querySelector('[data-lsa2]');
    var want = !bad ? '' : l.lsaDisputedAt ? 'done' : 'btn';
    if ((cur ? cur.getAttribute('data-lsa2') : '') === want) return; if (cur) cur.remove(); if (!want) return;
    var e = D.createElement(want === 'btn' ? 'button' : 'span'); e.setAttribute('data-lsa2', want);
    if (want === 'btn') { e.type = 'button'; e.textContent = '✓ Disputed in Ads'; e.style.cssText = 'min-height:38px;padding:0 12px;border-radius:9px;border:1px solid #166534;background:#f0fdf4;color:#166534;font:700 14px Inter,Arial,sans-serif;cursor:pointer'; }
    else { e.textContent = '✓ Disputed in Ads ' + nice(Date.parse(l.lsaDisputedAt)) + (l.lsaDisputedBy ? ' by ' + l.lsaDisputedBy : ''); e.style.cssText = 'font-weight:700;color:#166534'; }
    var dl = deadline(l); if (want === 'btn' && dl) e.title = 'Last day to dispute: ' + nice(dl);
    b.appendChild(e);
  } catch (x) {}
}
D.addEventListener('click', function(e){ var t = e.target && e.target.closest ? e.target.closest('#gc-lsa-dispute [data-lsa2="btn"]') : null; if (!t) return; e.preventDefault(); e.stopPropagation(); var id = t.closest('#gc-lsa-dispute').getAttribute('data-id'); disputed(id); ST.call(W, bar, 300); }, true);
/* d. 📊 LSA by month */
function months(n){
  n = n || 6; var out = [], d0 = new Date(); d0.setDate(1); d0.setHours(0, 0, 0, 0);
  for (var i = 0; i < n; i++) { var a = new Date(d0.getFullYear(), d0.getMonth() - i, 1), b = new Date(d0.getFullYear(), d0.getMonth() - i + 1, 1); out.push({ key: ymd(a).slice(0, 7), label: a.toLocaleString('en-US', { month: 'short', year: 'numeric' }), from: a.getTime(), to: b.getTime(), n: 0, good: 0, bad: 0, pending: 0, disputed: 0, repeats: 0 }); }
  leads().forEach(function(l){
    if (!l || !l.id || l.deleted || !isLsa(l)) return; var t = born(l), m = out.find(function(x){ return t >= x.from && t < x.to; }); if (!m) return;
    var c = chk(l); m.n++; m.repeats += +((l.leadExtra || {}).lsaRepeats || l.lsaRepeats || 0) || 0;
    if (c === 'good' || wonOrJob(l)) m.good++; else if (c === 'bad') { m.bad++; if (l.lsaDisputedAt) m.disputed++; } else m.pending++;
  });
  return out;
}
function panel(){
  var old = D.getElementById('gc-lsa2-ov'); if (old) old.remove();
  var M = months(6), open = leads().filter(function(l){ return l && isLsa(l) && chk(l) === 'bad' && !l.lsaDisputedAt && !l.deleted; }).sort(function(a, b){ return deadline(a) - deadline(b); });
  var TH = 'padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right', TL = TH.replace('right', 'left');
  var h = '<div role="dialog" aria-label="Google LSA leads by month" style="background:#fff;color:#0f172a;border-radius:14px;width:min(760px,100%);max-height:90vh;overflow:auto;padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">📊 Google LSA leads by month</b><button type="button" data-lsa2x style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer">Close</button></div>'
    + '<div style="color:#64748b;font-size:12.5px;margin:4px 0 8px">Only 👍 good ones count as leads in the CRM\'s numbers. Bad ones get disputed in Google Ads within 30 days.</div>'
    + '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:13.5px"><thead><tr style="background:#f1f5f9"><th style="' + TL + '">Month</th><th style="' + TH + '">LSA leads</th><th style="' + TH + '">👍 Good</th><th style="' + TH + '">👎 Bad</th><th style="' + TH + '">⏳ Pending</th><th style="' + TH + '">⚖️ Disputed</th><th style="' + TH + '">🔁 Repeats</th></tr></thead><tbody>'
    + M.map(function(m){ return '<tr data-m="' + m.key + '"><td style="' + TL + '">' + esc(m.label) + '</td><td style="' + TH + '"><b>' + m.n + '</b></td><td style="' + TH + '">' + m.good + '</td><td style="' + TH + '">' + m.bad + '</td><td style="' + TH + '">' + m.pending + '</td><td style="' + TH + '">' + m.disputed + (m.bad ? ' of ' + m.bad : '') + '</td><td style="' + TH + '">' + m.repeats + '</td></tr>'; }).join('')
    + '</tbody></table></div>'
    + '<div style="font-weight:800;margin:12px 0 4px">⚖️ Still to dispute (' + open.length + ')</div>'
    + (open.length ? open.slice(0, 40).map(function(l){ var dl = deadline(l), left = dl ? Math.ceil((dl - Date.now()) / 864e5) : null; return '<div style="display:flex;gap:8px;align-items:center;border-top:1px solid #e2e8f0;padding:6px 0"><span style="flex:1">' + esc(l.name || l.phone || 'LSA lead') + ' <span style="color:#64748b;font-size:12px">' + esc(s(l.lsaReason)) + '</span></span><span style="font-size:12.5px;color:' + (left != null && left <= 2 ? '#b91c1c' : '#475569') + '">' + (dl ? 'by ' + nice(dl) + (left != null ? ' (' + (left < 0 ? 'past' : left + ' day' + (left === 1 ? '' : 's')) + ')' : '') : '') + '</span><button type="button" data-lsa2d="' + esc(l.id) + '" style="border:1px solid #166534;background:#f0fdf4;color:#166534;border-radius:8px;padding:5px 10px;font-weight:700;cursor:pointer">✓ Disputed in Ads</button></div>'; }).join('') : '<div style="color:#64748b">Nothing to dispute. 👍</div>')
    + '</div>';
  var ov = D.createElement('div'); ov.id = 'gc-lsa2-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483400;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:12px;font:14px Inter,Arial,sans-serif';
  ov.innerHTML = h; D.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if (e.target === ov || (e.target.closest && e.target.closest('[data-lsa2x]'))) { ov.remove(); return; } var b = e.target.closest && e.target.closest('[data-lsa2d]'); if (b) { var id = b.getAttribute('data-lsa2d'); disputed(id);
    /* patch BTNFIX: the row says so at once; the table is redrawn only while this panel is still open (it used to come back by itself
       400 ms later, even after Close — a panel left on the page over the next screen) */
    var ok = D.createElement('span'); ok.setAttribute('data-lsa2done', id); ok.style.cssText = 'font-weight:700;color:#166534'; ok.textContent = '✓ Disputed — saved'; b.parentNode.replaceChild(ok, b);
    ST.call(W, function(){ if (D.body.contains(ov) && D.getElementById('gc-lsa2-ov') === ov) panel(); }, 1500); } });
  return M;
}
/* patch BTNFIX: an emptied panel (its window taken away) never stays over the page */
function noEmpty(){ var o = D.getElementById('gc-lsa2-ov'); if (o && !o.querySelector('[role=dialog]')) o.remove(); }
(function(){ try { var st = D.createElement('style'); st.id = 'gc-lsa2-empty-css'; st.textContent = '#gc-lsa2-ov:empty,#gc-lc-ov:empty{display:none!important;pointer-events:none!important}'; (D.head || D.documentElement).appendChild(st); } catch (e) {} })();
function panelBtn(){
  try {
    var hub = D.getElementById('gc-leads-hub'), views = hub && hub.getClientRects().length ? hub.querySelector('.gclu-views') : null, btn = D.getElementById('gc-lsa2-btn');
    if (!views || !office() || !leads().some(isLsa)) { if (btn) btn.remove(); return; }
    if (btn && btn.parentElement === views) return; if (btn) btn.remove();
    btn = D.createElement('button'); btn.type = 'button'; btn.id = 'gc-lsa2-btn'; btn.setAttribute('data-gc-keep', '1'); btn.textContent = '📊 LSA by month'; btn.title = 'Google LSA leads per month: good / bad / pending / disputed';
    views.appendChild(btn);
  } catch (e) {}
}
D.addEventListener('click', function(e){ var t = e.target && e.target.closest ? e.target.closest('#gc-lsa2-btn') : null; if (!t) return; e.preventDefault(); e.stopPropagation(); panel(); }, true);
SI.call(W, function(){ noEmpty(); if (D.hidden) return; bar(); panelBtn(); }, 900); ST.call(W, sweep, 40000); SI.call(W, sweep, 300000);
W._gcLsa2 = { pend: pend, sweep: sweep, panel: panel, months: months, disputed: disputed };
})(window);
