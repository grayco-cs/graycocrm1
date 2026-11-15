/* __GC_PATCH_LEADASB3__ — ☣️ LEAD & ASBESTOS follow-ups (owner's 11/15 list, item 2; builds on LEADASB / LEADASB2 / JOBSTEPS)
   a. LEADSTART: a lead job can't start until Lead 01 is given — a job that needs Lead 01 (☣️ card) and moves to started on THIS
      computer (progress above 0 %, or a status that says in progress / started / underway) is put back, and the person sees
      "📄 Give the customer Lead 01 first" (📤 Send Lead 01 · ✓ It was given · admin: Start anyway). Lead 01 counts as given when it is
      marked ✓ Given on the card OR a signed copy is uploaded to the job's files (a file whose name says Lead 01 / Renovate Right /
      pre-renovation — not the blank one the CRM makes). A job that started on another computer is left alone (the card's red Stop
      line still shows).
   b. LEADALERT: To-Dos for the job's PM (office + admins see them): ⏰ 7 days before the start date while a before-start paper
      (Lead 01 / 02 / 07, Asbestos 01) is not given; ⏰ day 20 and 🚨 day 28 after completion while Lead 03 / 05 or Asbestos 02 is
      not given (30-day rule). Each closes by itself when the papers are marked given.
   c. LEADCERT90 lives in Company documents (tools/companydocs.js + _lib/gcp.js): slots for the EPA RRP firm certificate and two
      certified renovators, with reminders from 90 days out.
   d. LEADSEND: on each paper of the ☣️ card — 👁 Filled in (opens the library paper filled in with the job, customer and address)
      and 📤 Send (the same paper through ✅ Approvals → the customer's e-mail + portal; ⏸ data-entry mode holds it). The send is
      written on the job (leadAsb.sent) and shown on the card; ✓ Given is still the person's call.
   API: window._gcLeadAsb3 = { lead01Given(p), started(p), sweep(), decorate(), PAPERS } */
(function(W){
'use strict';
if (W.__GC_PATCH_LEADASB3__) return; W.__GC_PATCH_LEADASB3__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
var PAPERS = { L01: 'gcb_lead_01', L02: 'gcb_lead_02', L03: 'gcb_lead_03', L05: 'gcb_lead_05', A01: 'gcb_asb_01', A02: 'gcb_asb_02' };
var NAMES = { L01: 'Lead 01', L02: 'Lead 02', L03: 'Lead 03', L05: 'Lead 05', L07: 'Lead 07', A01: 'Asbestos 01', A02: 'Asbestos 02' };
var BEFORE = ['L01', 'L02', 'L07', 'A01'], AFTER = ['L03', 'L05', 'A02'];
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ymd(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function today(){ return ymd(new Date()); }
function plus(day, n){ var d = new Date(s(day).slice(0, 10) + 'T12:00:00'); if (isNaN(d)) return ''; d.setDate(d.getDate() + n); return ymd(d); }
function nice(day){ var d = new Date(s(day).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? s(day) : (d.getMonth() + 1) + '/' + d.getDate(); }
function me(){ try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return s(u.name) || s(u.email); } catch (e) { return ''; } }
function admin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /admin/i.test(s(u.role)) || /owner/i.test(s(u.payType)); } catch (e) { return false; } }
function office(){ if (admin()) return true; try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /office/i.test(s(u.role) + ' ' + s(u.profile)); } catch (e) { return false; } }
function proj(pid){ return arr(W._crm && W._crm.projects).find(function(p){ return p && s(p.id) === s(pid); }) || null; }
function LA(){ return W._gcLeadAsb; }
function need(p){ try { return LA() ? arr(LA().need(p)) : []; } catch (e) { return []; } }
function setLA(pid, fn){
  var now = new Date().toISOString();
  var f = function(list){ var out = arr(list).map(function(p){ if (!p || s(p.id) !== s(pid)) return p; var a = Object.assign({}, (p.leadAsb && typeof p.leadAsb === 'object') ? p.leadAsb : {}); return Object.assign({}, p, { leadAsb: fn(a), updatedAt: now }); }); try { if (W._gcApplySync) W._gcApplySync('projects', out); } catch (e) {} return out; };
  if (typeof W._setProjects === 'function') W._setProjects(f); else if (W._crm) W._crm.projects = f(W._crm.projects);
}
/* a signed Lead 01 uploaded to the job's files (not a blank one the CRM made) */
function lead01File(pid){
  var L = arr(W._gcProjectDocs).length ? W._gcProjectDocs : arr(W._crm && W._crm.projectDocs);   /* the screen's live list */
  return arr(L).some(function(d){ return d && [d.pid, d.projectId, d.jobId].some(function(x){ return s(x) === s(pid); }) && !d.deleted && !d.removed && !d.fromTemplate && /lead[\s_-]*0?1\b|renovate[\s_-]*right|pre[\s_-]*renovation/i.test(s(d.name) + ' ' + s(d.label) + ' ' + s(d.cat)); });
}
function lead01Given(p){
  if (!p) return true;
  var n = need(p).filter(function(x){ return x.k === 'L01'; })[0]; if (!n) return true;   /* not a lead job (or Lead 01 not needed) */
  return !!n.given || lead01File(p.id);
}
/* a. LEADSTART */
var PF = ['pct', 'ccProgressPct', 'progress'];
function pctOf(p){ for (var i = 0; i < PF.length; i++) { var v = parseFloat(p && p[PF[i]]); if (!isNaN(v)) return v; } return 0; }
function started(p){ return pctOf(p) > 0 || /in.?progress|started|underway|work.?begun/i.test(s(p && p.status)); }
var LAST_INPUT = 0; ['pointerdown', 'keydown', 'input', 'change'].forEach(function(ev){ D.addEventListener(ev, function(){ LAST_INPUT = Date.now(); }, true); });
var SEEN = null;
function snap(p){ var o = { status: p.status }; PF.forEach(function(k){ o[k] = p[k]; }); return o; }
function revert(p, was){ if (typeof W._setProjects !== 'function') return; var patch = Object.assign({}, was, { updatedAt: new Date().toISOString() }); W._setProjects(function(prev){ return arr(prev).map(function(x){ return x && s(x.id) === s(p.id) ? Object.assign({}, x, patch) : x; }); }); }
function gateAsk(p, want){
  var old = D.getElementById('gc-la3-gate'); if (old) old.remove();
  var o = D.createElement('div'); o.id = 'gc-la3-gate'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Lead 01 first'); o.setAttribute('data-gc-keep', '1');
  o.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  var B = 'min-height:42px;border-radius:10px;font:700 14px Inter,Arial,sans-serif;cursor:pointer;';
  o.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:14px;max-width:460px;width:100%;padding:18px;font:15px Inter,Arial,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.3)">'
    + '<div style="font-weight:800;font-size:18px;margin-bottom:6px">📄 Give the customer Lead 01 first</div>'
    + '<div style="margin-bottom:12px"><b>' + esc(p.name || p.client || 'This job') + '</b> is a lead-safe job. EPA says the owner gets the <b>Renovate Right</b> pamphlet and signs Lead 01 <b>before work starts</b>. Mark it given (or upload the signed copy to the job\'s files), then start the job again.</div>'
    + '<div style="display:flex;flex-direction:column;gap:8px">'
    + '<button type="button" data-g3="send" style="' + B + 'border:0;background:#241968;color:#fff">📤 Send Lead 01 (e-mail + portal)</button>'
    + '<button type="button" data-g3="given" style="' + B + 'border:1px solid #166534;background:#f0fdf4;color:#166534">✓ It was given</button>'
    + (admin() ? '<button type="button" data-g3="waive" style="' + B + 'border:1px solid #cbd5e1;background:#fff;font-weight:600">Start anyway (admin)</button>' : '')
    + '<button type="button" data-g3="close" style="' + B + 'border:1px solid #cbd5e1;background:#fff;font-weight:600">Not now</button></div></div>';
  o.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-g3]'); if (!b && e.target !== o) return;
    var a = b ? b.getAttribute('data-g3') : 'close'; o.remove();
    if (a === 'send') sendPaper('L01', p.id);
    if (a === 'given') { var how = W.prompt('How was Lead 01 given?\n1 = signed by the customer\n2 = mailed (keep the receipt)\n3 = e-mailed\n4 = customer portal\n5 = handed over', '1'); if (how == null) return; var H = { 1: 'signed', 2: 'mailed', 3: 'e-mailed', 4: 'portal', 5: 'handed over' }[s(how)] || s(how); setLA(p.id, function(x){ x.given = Object.assign({}, x.given || {}); x.given.L01 = { on: today(), how: H, by: me(), at: new Date().toISOString() }; return x; }); try { W._gcToast && W._gcToast('✓ Lead 01 marked given — you can start the job now.'); } catch (x) {} }
    if (a === 'waive') { setLA(p.id, function(x){ x.startWaived = { by: me(), at: new Date().toISOString() }; return x; }); if (want) ST.call(W, function(){ W._setProjects(function(prev){ return arr(prev).map(function(x){ return x && s(x.id) === s(p.id) ? Object.assign({}, x, want, { updatedAt: new Date().toISOString() }) : x; }); }); }, 250); }
  });
  D.body.appendChild(o);
}
function gate(){
  try {
    var list = arr(W._crm && W._crm.projects); if (!list.length || !LA()) return;
    if (!SEEN) { SEEN = {}; list.forEach(function(p){ if (p && p.id) SEEN[p.id] = snap(p); }); return; }
    list.forEach(function(p){
      if (!p || !p.id) return;
      var was = SEEN[p.id], now = snap(p);
      if (was && !started(was) && started(p) && Date.now() - LAST_INPUT < 10000 && !p.importedHistory && !(p.leadAsb && p.leadAsb.startWaived) && !lead01Given(p)) { revert(p, was); gateAsk(p, now); return; }
      SEEN[p.id] = now;
    });
  } catch (e) {}
}
/* b. LEADALERT */
function tasks(){ try { var l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function saveTasks(l){ try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {} }
function doneDay(p){ return s(p.completionDate || p.completedAt || p.endDate).slice(0, 10); }
function alertsFor(p, t){
  var N = need(p), out = [], open = function(keys){ return N.filter(function(x){ return keys.indexOf(x.k) >= 0 && !x.given && !(x.k === 'L01' && lead01File(p.id)); }); };
  var who = s(p.client || p.name), start = s(p.startDate).slice(0, 10), fin = /complete|closed|warrant/i.test(s(p.status)) ? doneDay(p) : '';
  var b = open(BEFORE);
  if (b.length && start && t >= plus(start, -7) && !(p.leadAsb && p.leadAsb.startWaived)) out.push({ id: 'LEADASB7_' + p.id, prio: 'high', label: '⏰ ' + (t >= start ? 'Work started — ' : '7 days to start (' + nice(start) + ') — ') + 'give ' + who + ' ' + b.map(function(x){ return NAMES[x.k]; }).join(', ') + ' before work starts', note: 'Job ' + s(p.name) + ' → ☣️ Lead & asbestos card: 📤 Send or ✓ Given. EPA: the owner signs Lead 01 (Renovate Right) before day 1 — or mail it 7+ days before and keep the receipt.' });
  var a = open(AFTER);
  if (a.length && fin) {
    var list = a.map(function(x){ return NAMES[x.k]; }).join(', ');
    if (t >= plus(fin, 20)) out.push({ id: 'LEADASB20_' + p.id, prio: 'high', label: '⏰ Day 20 of 30 — give ' + who + ' ' + list + ' by ' + nice(plus(fin, 30)), note: 'Job ' + s(p.name) + ' was finished ' + nice(fin) + '. The completion papers are due within 30 days (☣️ Lead & asbestos card).' });
    if (t >= plus(fin, 28)) out.push({ id: 'LEADASB28_' + p.id, prio: 'high', label: '🚨 Day 28 of 30 — 2 days left: give ' + who + ' ' + list + ' by ' + nice(plus(fin, 30)), note: 'Job ' + s(p.name) + ' was finished ' + nice(fin) + '. Last chance for the 30-day rule — send it today.' });
  }
  return out;
}
function sweep(){
  try {
    if (!office()) return 0; var P = arr(W._crm && W._crm.projects); if (!P.length || !LA()) return 0;
    var l = tasks(), t = today(), now = new Date().toISOString(), ch = 0, want = {};
    P.forEach(function(p){ if (!p || !p.id || p.deleted || !p.leadAsb) return; alertsFor(p, t).forEach(function(x){ want[x.id] = { x: x, p: p }; }); });
    Object.keys(want).forEach(function(id){
      var w = want[id], x = w.x, cur = l.find(function(y){ return y && y.id === id; });
      if (!cur) { l.push({ id: id, kind: 'leadasb', pid: w.p.id, label: x.label, note: x.note, assignee: s(w.p.pm), prio: x.prio, addedBy: 'CRM', addedAt: now, updatedAt: now, done: false }); ch++; }
      else if (cur.done || cur.label !== x.label) { cur.label = x.label; cur.done = false; cur.updatedAt = now; ch++; }
    });
    l.forEach(function(y){ if (y && !y.done && /^LEADASB(7|20|28)_/.test(s(y.id)) && !want[y.id]) { y.done = true; y.doneAt = y.updatedAt = now; y.resolution = 'papers given'; ch++; } });
    if (ch) saveTasks(l);
    return ch;
  } catch (e) { return 0; }
}
/* d. LEADSEND */
function sendPaper(k, pid){
  var id = PAPERS[k]; if (!id || !W._gcDocLib || typeof W._gcDocLib.send !== 'function') { W.alert('That paper is not in the document library yet — use 📄 Form.'); return Promise.resolve(null); }
  return Promise.resolve(W._gcDocLib.send(id, pid)).then(function(j){
    if (j && j.ok) setLA(pid, function(a){ a.sent = Object.assign({}, a.sent || {}); a.sent[k] = { on: today(), by: me(), at: new Date().toISOString(), via: 'approvals → e-mail + portal' }; return a; });
    return j;
  });
}
function decorate(){
  try {
    var c = D.getElementById('gc-la'); if (!c) return; var pid = c.getAttribute('data-pid'), p = proj(pid); if (!p) return;
    var sent = (p.leadAsb && p.leadAsb.sent) || {};
    [].forEach.call(c.querySelectorAll('.p[data-k]'), function(r){
      var k = r.getAttribute('data-k'); if (!PAPERS[k] || r.querySelector('[data-la3]')) return;
      var box = r.querySelector('span[style*="margin-left:auto"]') || r;
      var given = !!r.querySelector('.ok');
      var h = '<button type="button" data-la3="view" title="Opens the paper filled in with the job, customer and address">👁 Filled in</button>' + (given ? '' : '<button type="button" data-la3="send" title="Through ✅ Approvals to the customer\'s e-mail and portal">📤 Send</button>');
      var w = D.createElement('span'); w.style.cssText = 'display:inline-flex;gap:6px'; w.innerHTML = h; box.insertBefore(w, box.firstChild);
      if (sent[k] && !given) { var m = D.createElement('div'); m.className = 'm'; m.setAttribute('data-la3', 'sent'); m.style.cssText = 'flex-basis:100%;font-size:12px;color:#1d4ed8'; m.textContent = '📤 Sent ' + nice(sent[k].on) + (sent[k].by ? ' by ' + sent[k].by : '') + ' — goes out once approved in ✅ Approvals. Mark ✓ Given when the customer has it.'; r.appendChild(m); }
    });
  } catch (e) {}
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('#gc-la [data-la3]') : null; if (!b) return;
  e.preventDefault(); e.stopPropagation();
  var c = D.getElementById('gc-la'), pid = c && c.getAttribute('data-pid'), r = b.closest('[data-k]'), k = r && r.getAttribute('data-k'); if (!pid || !k) return;
  if (b.getAttribute('data-la3') === 'view') { try { W._gcDocLib.open(PAPERS[k], pid); } catch (x) {} return; }
  if (b.getAttribute('data-la3') === 'send') { b.disabled = true; sendPaper(k, pid).then(function(){ b.disabled = false; }); }
}, true);
SI.call(W, gate, 1200); SI.call(W, decorate, 1000); ST.call(W, sweep, 35000); SI.call(W, sweep, 300000);
W._gcLeadAsb3 = { lead01Given: lead01Given, started: started, sweep: sweep, decorate: decorate, alertsFor: alertsFor, sendPaper: sendPaper, PAPERS: PAPERS };
})(window);
