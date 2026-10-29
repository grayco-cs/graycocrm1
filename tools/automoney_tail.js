/* __GC_PATCH_AUTOMONEY__ — THE OWNER'S MONEY RULES (10/29), the CRM side. The rules: netlify/functions/_lib/money-core.js
   (embedded below as is — tools/tests/test_AUTOMONEY.js checks they are the same text). Server: money-rules.js, lien.js.
   1. 💰 DEPOSIT BEFORE SCHEDULING ("yes … pm can override before admin but admin office gets a note")
      ⚡ Automation defaults → "💰 Deposit before scheduling" per job type (on: residential / remodel / retail roofing;
      off: insurance, commercial, program work) and per job (⚙ Automations). On such a job, crew / sub days can't be
      added to the schedule until the deposit is recorded paid (a paid deposit invoice, any paid customer invoice or
      payment, or "deposit paid" on the job). The job's PM — or an admin — gets "Schedule anyway — reason" in the
      same box: one tap and the add goes through; the office and the admins get a To-Do note, a phone push and a line in
      the 7 AM digest e-mail. Meetings, inspections and walk-throughs are never held. Jobs already on the schedule
      before 10/29 are left as they were. (Hook: window._gcScheduleDupCheck — every "add to schedule" asks it first.)
   2. 📝 SUB LIEN WAIVERS by job type ("default for residential to not have … default on commercial to have …")
      "📝 Sub lien waivers required" per job type (on: commercial) and per job (the switch on the job bar / closeout
      panel). When on, a sub's check moves to "Held back" on the Friday pay list (🖊 Checks to write) until the sub signs
      the waiver in the Sub Portal (or on the e-mailed link); the office / an admin can press "📄 Received on paper" and
      attach the scan. Sub invoices received before 10/29 are never held by this.
   3. 📊 JOB PROFIT ALERT ("yes alert") — every 10 minutes, for the open jobs this login may see, job costing (patch
      DEPTH2: job costs, sub invoices, expenses, materials vs the estimate's cost budget, else contract less the target
      margin) is checked; at 80 % and again at 100 % (⚙ Admin → 💰 Money rules) the server alerts the PM + admins ONCE
      (push + e-mail + To-Do) and the job bar shows the notice.
   API: window._gcMoney = { core, state(), load(), gateFor(pid, title), depositOf(pid), lienReq(p, subId, sub), open(pid) } */
(function(){
'use strict';
if (window.__GC_PATCH_AUTOMONEY__) return; window.__GC_PATCH_AUTOMONEY__ = true;
var W = window, D = document, FN = '/.netlify/functions/money-rules', LFN = '/.netlify/functions/lien';
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
/*@@MONEY_CORE@@*/
var MC = GCMoneyCore;
var S = { overrides: [], alerts: [], settings: { warnPct: 80, overPct: 100 }, at: 0, busy: false, sent: {} };
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money0(n){ return '$' + Math.round(parseFloat(n) || 0).toLocaleString('en-US'); }
function crm(){ return W._crm || {}; }
function me(){ var e = ''; try { e = low(localStorage.getItem('grayco_user') || ''); } catch (x) {} return arr(crm().users).filter(function(u){ return low(u.email) === e || low(u.name) === e; })[0] || null; }
function myName(){ var u = me(); if (u && u.name) return s(u.name); try { return s(localStorage.getItem('grayco_user')); } catch (e) { return ''; } }
function isAdmin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} var u = me(); return !!(u && (u.role === 'Admin' || low(u.payType) === 'owner')); }
function isOffice(){ var u = me(); return !!(u && /office/i.test(s(u.role))); }
function proj(pid){ return arr(crm().projects).filter(function(p){ return String(p.id) === String(pid); })[0] || null; }
function post(fn, b){
  return W.fetch(fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    .then(function(r){ return r.json().catch(function(){ return { ok: false, error: 'No answer (' + r.status + ')' }; }); }, function(){ return { ok: false, error: 'No internet' }; });
}
function load(force){
  if (S.busy || (!force && Date.now() - S.at < 150e3)) return Promise.resolve(S);
  S.busy = true;
  return post(FN, { action: 'state' }).then(function(j){ S.busy = false; if (j && j.ok) { S.overrides = arr(j.overrides); S.alerts = arr(j.alerts); S.settings = j.settings || S.settings; S.at = Date.now(); } return S; }, function(){ S.busy = false; return S; });
}
function toast(t, bad){ try { var d = D.createElement('div'); d.setAttribute('data-gc-keep', '1'); d.textContent = t; d.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:' + (bad ? '#7f1d1d' : '#0f2440') + ';color:#fff;padding:10px 16px;border-radius:10px;z-index:2147483600;font:600 14px Arial;max-width:90vw'; D.body.appendChild(d); ST.call(W, function(){ d.remove(); }, 5000); } catch (e) {} }

/* ── the job's settings (patch JA: its own switch, else its type's default) ── */
function eff(p){ try { return W._gcJA && p ? W._gcJA.effective(p) : null; } catch (e) { return null; } }
function typeDefault(p, key){ try { return !!W._gcJobAutoDefaults.get(W._gcJA.groupOf(p || {}))[key]; } catch (e) { return false; } }
function depRequired(p){ var e = eff(p); return !!(e && e.depositGate === true); }
function depositOf(pid){ var p = typeof pid === 'object' ? pid : proj(pid); return p ? MC.depositState(p, arr(crm().invoices).concat(arr(crm().invs)), crm().projectPayments) : { paid: false, how: '' }; }
function hasWork(pid){ return arr(crm().schedule).some(function(x){ return String(x.pid) === String(pid) && x.deleted !== true && MC.isWorkDay(x); }); }
function gateFor(pid, title){
  var p = proj(pid); if (!p) return { ok: true, why: 'job not loaded' };
  return MC.gate({ p: p, required: depRequired(p), dep: depositOf(p), overrides: S.overrides, item: { title: title, type: 'work' }, hasWork: hasWork(pid) });
}
function subKey(subId, name){ return s(subId) ? 'id:' + s(subId) : 'n:' + low(name).replace(/\s+/g, ' '); }
function lienSettings(){ try { return (W._gcLien && W._gcLien.state().settings) || { subs: {}, jobs: {} }; } catch (e) { return { subs: {}, jobs: {} }; } }
function lienReq(p, subId, sub){
  if (!p) return false;
  var st = lienSettings(), own = p.auto && typeof p.auto === 'object' && typeof p.auto.subLien === 'boolean' ? p.auto.subLien : undefined;
  return MC.lienRequired({ own: own, typeDefault: typeDefault(p, 'subLien'), legacyJob: !!(st.jobs || {})[s(p.id)], legacySub: !!((st.subs || {})[subKey(subId, sub)] || (sub && (st.subs || {})[subKey('', sub)])) });
}
function lienJobOn(p){ var st = lienSettings(), own = p && p.auto && typeof p.auto.subLien === 'boolean' ? p.auto.subLien : undefined; return MC.lienRequired({ own: own, typeDefault: typeDefault(p, 'subLien'), legacyJob: !!(st.jobs || {})[s(p && p.id)] }); }
function waivers(){ try { return arr(W._gcLien.state().waivers); } catch (e) { return []; } }
function wFor(id){ return waivers().filter(function(w){ return s(w.id) === id; })[0] || null; }

/* ── 1 · the deposit gate on every "add to schedule" ── */
var LAST = { btn: null, at: 0 };
D.addEventListener('click', function(e){ var b = e.target && e.target.closest ? e.target.closest('button') : null; if (b && !b.closest('#gcam-ov')) { LAST.btn = b; LAST.at = Date.now(); } }, true);
function css(){
  if (D.getElementById('gcam-css')) return;
  var st = D.createElement('style'); st.id = 'gcam-css';
  st.textContent = '#gcam-ov{position:fixed;inset:0;background:rgba(6,12,20,.66);z-index:2147483300;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}' +
    '#gcam-ov .gcam-box{background:#fff;color:#0f172a;border-radius:14px;max-width:460px;width:100%;padding:16px 18px;font:14px/1.45 Inter,Arial,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.4);box-sizing:border-box}' +
    '#gcam-ov h3{margin:0 0 6px;font-size:17px}#gcam-ov textarea{width:100%;box-sizing:border-box;min-height:64px;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:14px Inter,Arial,sans-serif;margin-top:6px}' +
    '#gcam-ov .gcam-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}#gcam-ov button{min-height:40px;padding:8px 14px;border-radius:9px;font-weight:800;cursor:pointer;font-family:inherit}' +
    '.gcam-go{background:#b45309;color:#fff;border:none}.gcam-x{background:#fff;color:#0f2440;border:1px solid #cbd5e1}' +
    '.gcam-bar{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin:6px 0 8px;padding:7px 12px;border-radius:10px;background:#0f2440;border:1px solid #2a4a7f;border-left:3px solid #d4a017;color:#e2e8f0;font:12.5px/1.4 Inter,Arial,sans-serif;box-sizing:border-box;max-width:100%}' +
    '.gcam-bar b{color:#fff}.gcam-bar .gcam-warn{color:#fbbf24;font-weight:700}.gcam-bar .gcam-bad{color:#fca5a5;font-weight:700}.gcam-bar .gcam-ok{color:#86efac;font-weight:700}' +
    '.gcam-bar label{cursor:pointer;display:inline-flex;gap:5px;align-items:center}.gcam-bar input{width:16px;height:16px;margin:0}';
  D.head.appendChild(st);
}
function blockBox(pid, title, g, btn){
  css();
  var p = proj(pid) || {}, old = D.getElementById('gcam-ov'); if (old) old.remove();
  var can = MC.canOverride({ admin: isAdmin(), me: myName(), pm: p.pm || p.projectManager });
  var ov = D.createElement('div'); ov.id = 'gcam-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div class="gcam-box" role="dialog" aria-label="Deposit first"><h3>💰 Deposit first — ' + esc(p.name || 'this job') + '</h3>' +
    '<div>Crew and sub days go on the schedule once the deposit is paid (rule for ' + esc((W._gcJA && W._gcJA.groupOf(p)) || 'this job type') + ' jobs).</div>' +
    '<div style="margin-top:6px;color:#92400e;font-weight:700">' + esc(g.text || 'No deposit recorded yet.') + '</div>' +
    (can ? '<div style="margin-top:10px"><b>Schedule anyway?</b> Type why — the office and the admins get a note with your reason.<textarea data-gcam-why placeholder="e.g. customer paying the deposit Monday; materials window"></textarea></div>'
      : '<div style="margin-top:10px">Only the job’s PM (' + esc(p.pm || 'none set') + ') or an admin can schedule before the deposit. Record the deposit (💰 Invoices &amp; Payments → mark the deposit invoice paid), or ask them.</div>') +
    '<div class="gcam-btns">' + (can ? '<button type="button" class="gcam-go" data-gcam-go>Schedule anyway</button>' : '') + '<button type="button" class="gcam-x" data-gcam-x>' + (can ? 'Not now' : 'OK') + '</button></div>' +
    '<div data-gcam-msg style="margin-top:6px;color:#b91c1c;font-weight:700"></div></div>';
  D.body.appendChild(ov);
  ov.querySelector('[data-gcam-x]').onclick = function(){ ov.remove(); };
  var go = ov.querySelector('[data-gcam-go]');
  if (go) go.onclick = function(){
    var why = MC.cleanReason(ov.querySelector('[data-gcam-why]').value), msg = ov.querySelector('[data-gcam-msg]');
    if (!why) { msg.textContent = 'Type the reason (a few words).'; return; }
    go.disabled = true; go.textContent = 'Saving…';
    post(FN, { action: 'override', pid: pid, reason: why, what: title }).then(function(j){
      if (!j || !j.ok) { go.disabled = false; go.textContent = 'Schedule anyway'; msg.textContent = (j && j.error) || 'Not saved — try again.'; return; }
      S.overrides.push(j.override); ov.remove(); paintBars(true);
      toast('💰 Scheduled before the deposit — the office and the admins got a note.');
      if (btn && btn.isConnected && Date.now() - LAST.at < 10 * 60e3) ST.call(W, function(){ try { btn.click(); } catch (e) {} }, 60);
      else toast('Now press Add again.');
    });
  };
}
function wrapDup(){
  var f = W._gcScheduleDupCheck; if (typeof f !== 'function' || f.__gcam) return;
  var w = function(pid, dates, title){
    try { var g = gateFor(pid, title); if (!g.ok) { blockBox(pid, title, g, LAST.btn && Date.now() - LAST.at < 20000 ? LAST.btn : null); return false; } } catch (e) {}
    return f.apply(this, arguments);
  };
  try { Object.keys(f).forEach(function(k){ if (!(k in w)) w[k] = f[k]; }); } catch (e) {}
  w.__gcam = true; W._gcScheduleDupCheck = w;
}

/* ── 2 · lien waivers: the pay hold, "received on paper", the job switch ── */
function invById(id){ return arr(crm().invoices).concat(arr(crm().invs)).filter(function(r){ return String(r.id) === String(id); })[0] || null; }
function holdFor(inv){ if (!inv) return null; var p = proj(inv.pid); return MC.payHold({ required: lienReq(p, inv.subId, inv.sub), waiver: wFor('LWc_' + s(inv.id)), inv: inv }); }
var LAST_DUE = null;
function wrapDue(){
  var f = W._gcChecksDue; if (typeof f !== 'function' || f.__lienhold) return;
  var w = async function(onDate){
    var out = await f.apply(this, arguments);
    try {
      if (W._gcLien) await W._gcLien.load(false);
      if (out && Array.isArray(out.subs)) {
        var keep = [];
        out.subs.forEach(function(r){ var why = holdFor(invById(r.id)); if (why) { r.why = why; r.lienHold = true; out.blocked = out.blocked || []; out.blocked.push(r); out.total = Math.round(((parseFloat(out.total) || 0) - (parseFloat(r.amt) || 0)) * 100) / 100; } else keep.push(r); });
        out.subs = keep;
      }
      LAST_DUE = out;
    } catch (e) {}
    return out;
  };
  try { Object.keys(f).forEach(function(k){ if (/^__/.test(k)) w[k] = f[k]; }); } catch (e) {}
  w.__lienhold = true; W._gcChecksDue = w;
}
/* the held rows: 📝 request + 📄 received on paper */
function decorateHeld(){
  if (!LAST_DUE || !arr(LAST_DUE.blocked).length) return;
  var rows = [].slice.call(D.querySelectorAll('tr')).filter(function(tr){ return /fffbeb|255, 251, 235/.test(tr.getAttribute('style') || '') && !tr.closest('#gcam-ov'); });
  arr(LAST_DUE.blocked).forEach(function(r, i){
    var tr = rows[i]; if (!tr || !r.lienHold || tr.querySelector('[data-gcam-paper]')) return;
    var td = tr.lastElementChild; if (!td) return;
    var sp = D.createElement('span');
    sp.innerHTML = ' <button type="button" data-gclien-req="inv" data-inv="' + esc(r.id) + '" data-sub="' + esc(r.sub) + '" style="background:#fff;border:1px solid #0f766e;color:#0f766e;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">📝 Request</button>' +
      ((isAdmin() || isOffice()) ? ' <button type="button" data-gcam-paper="' + esc(r.id) + '" style="background:#fff;border:1px solid #92400e;color:#92400e;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">📄 Received on paper</button>' : '');
    td.appendChild(sp);
  });
}
function hookRun(){
  var f = W._gcOpenCheckRun; if (typeof f !== 'function' || f.__gcam) return;
  var w = function(){ var self = this, args = arguments; return Promise.resolve(f.apply(self, args)).then(function(x){ try { decorateHeld(); } catch (e) {} ST.call(W, function(){ try { decorateHeld(); } catch (e) {} }, 300); return x; }); };
  try { Object.keys(f).forEach(function(k){ if (/^__/.test(k)) w[k] = f[k]; }); } catch (e) {}
  w.__gcam = true; W._gcOpenCheckRun = w;
}
/* a "Check written" press on a held sub check (belt and braces: held rows have no such button) */
D.addEventListener('click', function(ev){
  var b = ev.target && ev.target.closest ? ev.target.closest('button[data-paid]') : null; if (!b) return;
  var why = null; try { why = holdFor(invById(b.getAttribute('data-paid'))); } catch (e) {}
  if (!why) return;
  ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
  toast('⛔ ' + why, true);
}, true);
function pickFile(cb){
  var inp = D.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,image/jpeg,image/png'; inp.style.display = 'none';
  inp.onchange = function(){ var f = inp.files && inp.files[0]; inp.remove(); if (!f) return; if (f.size > 8 * 1024 * 1024) { toast('That file is over 8 MB.', true); return; } var r = new FileReader(); r.onload = function(){ cb(r.result, f.name); }; r.readAsDataURL(f); };
  D.body.appendChild(inp); inp.click();
}
D.addEventListener('click', function(ev){
  var t = ev.target && ev.target.closest ? ev.target.closest('[data-gcam-paper],[data-gcam-paperid]') : null; if (!t) return;
  ev.preventDefault(); ev.stopPropagation();
  var body = t.hasAttribute('data-gcam-paper') ? { invId: t.getAttribute('data-gcam-paper') } : { id: t.getAttribute('data-gcam-paperid') };
  pickFile(function(file, name){
    t.disabled = true; t.textContent = 'Uploading…';
    post(LFN, Object.assign({ action: 'paper', file: file, name: name }, body)).then(function(j){
      if (j && j.ok) { toast('📄 Lien waiver marked received on paper — the check can be written.'); t.textContent = '✅ On paper'; try { W._gcLien.load(true); } catch (e) {} }
      else { t.disabled = false; t.textContent = '📄 Received on paper'; toast('⚠ ' + ((j && j.error) || 'Not saved'), true); }
    });
  });
}, true);
/* the job switch (job bar + closeout panel): "📝 Sub lien waivers required on this job" — stored on the job (patch JA) */
function setLienJob(pid, on){
  var p = proj(pid); if (!p || !W._gcJA) return;
  if (!(isAdmin() || isOffice() || low(myName()) === low(p.pm))) { toast('Only the job’s PM, the office or an admin can change this.', true); paintBars(true); return; }
  var vals = Object.assign({}, W._gcJA.effective(p), { subLien: !!on });
  Promise.resolve(W._gcJA.set(pid, vals)).then(function(){
    if (!on && (lienSettings().jobs || {})[s(pid)] && W._gcLien) W._gcLien.toggle('job', pid, false);
    toast(on ? '📝 Sub lien waivers are required on this job' : 'Sub lien waivers are not required on this job'); ST.call(W, function(){ paintBars(true); }, 400);
  });
}
D.addEventListener('change', function(ev){ var t = ev.target; if (!t || !t.hasAttribute || !t.hasAttribute('data-gcam-lienjob')) return; ev.stopPropagation(); setLienJob(t.getAttribute('data-gcam-lienjob'), t.checked); }, true);
function wrapLien(){
  var L = W._gcLien; if (!L || L.__gcam) return;
  var t = L._t || {};
  L.status = function(pid){
    var p = proj(pid), subs = {}, on = false, missing = [];
    (t.subInvs ? t.subInvs(pid) : []).forEach(function(r){ var k = subKey(r.subId, r.sub); if (!subs[k]) subs[k] = { sub: s(r.sub), subId: s(r.subId) }; });
    Object.keys(subs).forEach(function(k){ var b = subs[k]; if (!lienReq(p, b.subId, b.sub)) return; on = true; if (!MC.lienDone(wFor(t.finalId ? t.finalId(pid, b.subId, b.sub) : ''))) missing.push(b.sub || 'a sub'); });
    if (!on) return null;
    var ovr = wFor('LWo_' + s(pid));
    return { ok: !missing.length || !!ovr, missing: missing, override: ovr };
  };
  var panel = L.panel;
  L.panel = function(p){
    var h = panel.apply(this, arguments); if (!h || !p) return h;
    var on = lienJobOn(p), dflt = typeDefault(p, 'subLien'), grp = (W._gcJA && W._gcJA.groupOf(p)) || '';
    h = h.replace(/<span style="color:#475569">— optional; off unless you turn it on<\/span>/, '<span style="color:#475569">— ' + (on ? 'required on this job (a sub’s check waits for it)' : 'not required on this job') + '</span>');
    h = h.replace(/<div style="margin-top:4px"><label style="cursor:pointer"><input type="checkbox" data-gclien-tog="job"[^>]*> Every sub on this job must sign one<\/label><\/div>/,
      '<div style="margin-top:4px"><label style="cursor:pointer"><input type="checkbox" data-gcam-lienjob="' + esc(p.id) + '"' + (on ? ' checked' : '') + '> Lien waivers required on this job</label> <span style="color:#64748b">(' + esc(grp) + ' default: ' + (dflt ? 'on' : 'off') + ')</span></div>');
    var paper = arr(waivers()).filter(function(w){ return s(w.pid) === s(p.id) && w.kind === 'final' && !MC.lienDone(w) && w.status !== 'no_email'; });
    if (paper.length && (isAdmin() || isOffice())) h = h.replace(/<\/div>$/, '<div style="margin-top:6px">' + paper.map(function(w){ return '<button type="button" data-gcam-paperid="' + esc(w.id) + '" style="border:1px solid #92400e;background:#fff;color:#92400e;border-radius:8px;padding:3px 9px;font-weight:700;cursor:pointer;margin:2px 4px 0 0">📄 ' + esc(w.sub) + ' — received on paper</button>'; }).join('') + '</div></div>');
    return h;
  };
  L.__gcam = true;
}

/* ── the job bar: deposit · lien waivers · profit, under the ⚡ Automations bar ── */
function barHtml(p){
  var out = [], dep = depRequired(p);
  if (dep) {
    var d = depositOf(p), ov = MC.overrideFor(p.id, S.overrides);
    out.push(d.paid ? '<span>💰 Deposit: <span class="gcam-ok">paid</span></span>'
      : ov ? '<span>💰 <span class="gcam-warn">Scheduled before the deposit</span> by ' + esc(ov.by) + ': “' + esc(ov.reason) + '”</span>'
      : '<span>💰 <span class="gcam-bad">No deposit yet</span> — crew / sub days wait for it (' + esc(d.how) + ')</span>');
  }
  var lien = lienJobOn(p), canL = isAdmin() || isOffice() || low(myName()) === low(p.pm);
  out.push('<span>📝 Sub lien waivers: ' + (canL ? '<label><input type="checkbox" data-gcam-lienjob="' + esc(p.id) + '"' + (lien ? ' checked' : '') + '>required</label>' : (lien ? '<b>required</b>' : 'not required')) + '</span>');
  var al = S.alerts.filter(function(a){ return s(a.pid) === s(p.id); }).sort(function(a, b){ return (b.level || 0) - (a.level || 0); })[0];
  if (al) out.push('<span class="' + (al.over ? 'gcam-bad' : 'gcam-warn') + '">' + (al.over ? '🔴 Over budget' : '🟠 Costs at ' + esc(al.pct) + '% of budget') + ' (' + money0(al.actual) + ' of ' + money0(al.budget) + ', ' + esc(s(al.at).slice(0, 10)) + ')</span>');
  return out.join('');
}
function paintBars(force){
  try {
    var bars = D.querySelectorAll('.gcja-bar[data-pid]:not([data-gc-ja-admin])');
    [].forEach.call(D.querySelectorAll('.gcam-bar'), function(x){ var prev = x.previousElementSibling; if (!prev || !prev.classList.contains('gcja-bar') || prev.getAttribute('data-pid') !== x.getAttribute('data-pid')) x.remove(); });
    [].forEach.call(bars, function(b){
      var pid = b.getAttribute('data-pid'), p = proj(pid); if (!p) return;
      var h = barHtml(p), nx = b.nextElementSibling;
      if (nx && nx.classList.contains('gcam-bar') && nx.getAttribute('data-pid') === String(pid)) { if (force || nx.__h !== h) { nx.innerHTML = h; nx.__h = h; } return; }
      css(); var el = D.createElement('div'); el.className = 'gcam-bar'; el.setAttribute('data-pid', pid); el.setAttribute('data-gc-keep', '1'); el.innerHTML = h; el.__h = h;
      b.parentNode.insertBefore(el, b.nextSibling);
    });
  } catch (e) {}
}

/* ── 3 · profit alerts ── */
function profitPass(){
  if (D.hidden || !W._gcDP2 || !W._gcDP2.jc || typeof W._gcDP2.jc.jobs !== 'function') return;
  var list = []; try { list = W._gcDP2.jc.jobs() || []; } catch (e) { return; }
  list.forEach(function(r){
    if (!r || !r.pid || !(r.budget > 0)) return;
    var fired = {}; S.alerts.forEach(function(a){ if (s(a.pid) === s(r.pid)) [].concat(a.mark || [], [a.level]).forEach(function(l){ fired[l] = true; }); });
    var c = MC.profitCheck({ actual: r.actual, budget: r.budget, set: S.settings, fired: fired });
    if (!c.fire || S.sent[r.pid + ':' + c.fire]) return;
    S.sent[r.pid + ':' + c.fire] = 1;
    post(FN, { action: 'profit', pid: r.pid, actual: r.actual, budget: r.budget, noEstimate: !!r.noEstimate }).then(function(j){ if (j && j.alert) { S.alerts.push(j.alert); paintBars(true); } });
  });
}

/* ── ⚙ Admin → 💰 Money rules ── */
function renderAdmin(box){
  var st = S.settings || {};
  var ov = S.overrides.slice(-8).reverse(), al = S.alerts.slice(-8).reverse();
  box.innerHTML = '<div style="font:13px/1.5 Inter,sans-serif;color:#0f172a">' +
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-bottom:10px">' +
    '<b>💰 Deposit before scheduling</b> and <b>📝 Sub lien waivers required</b> are set per job type in <b>⚡ Automation defaults</b> (Internal alerts) — residential: deposit on, waivers off; commercial: deposit off, waivers on; insurance / program: both off — and per job (⚙ Automations, or the switch on the job bar).' +
    ' <button type="button" data-gcam-ja style="border:1px solid #7c3aed;background:#fff;color:#5b21b6;border-radius:8px;padding:4px 10px;font-weight:700;cursor:pointer">Open Automation defaults</button></div>' +
    '<b>📊 Job profit alert</b> — the PM and the admins are alerted once when a job’s costs reach:' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0">' +
    '<label>first alert at <input data-gcam-w type="number" min="10" max="300" value="' + esc(st.warnPct || 80) + '" style="width:70px;padding:5px;border:1px solid #cbd5e1;border-radius:6px"> %</label>' +
    '<label>over budget at <input data-gcam-o type="number" min="10" max="300" value="' + esc(st.overPct || 100) + '" style="width:70px;padding:5px;border:1px solid #cbd5e1;border-radius:6px"> %</label> of the job’s budget' +
    (isAdmin() ? ' <button type="button" data-gcam-save style="border:0;border-radius:8px;padding:7px 14px;background:#16a34a;color:#fff;font-weight:800;cursor:pointer">Save</button>' : '') + '</div>' +
    '<div style="font-size:12px;color:#475569">Budget = the job’s estimate cost (plus approved change orders), else the contract less the target margin (Accounting → 📊 Job costing).</div>' +
    '<div style="margin-top:10px"><b>Scheduled before the deposit (latest)</b>' + (ov.length ? '<ul style="margin:4px 0;padding-left:18px">' + ov.map(function(x){ return '<li>' + esc(s(x.at).slice(0, 10)) + ' · ' + esc(x.jobName) + ' — ' + esc(x.by) + ': “' + esc(x.reason) + '”</li>'; }).join('') + '</ul>' : ' <span style="color:#64748b">none</span>') + '</div>' +
    '<div style="margin-top:6px"><b>Profit alerts sent (latest)</b>' + (al.length ? '<ul style="margin:4px 0;padding-left:18px">' + al.map(function(x){ return '<li>' + esc(s(x.at).slice(0, 10)) + ' · ' + esc(x.jobName) + ' — ' + esc(x.pct) + '% (' + money0(x.actual) + ' of ' + money0(x.budget) + ')</li>'; }).join('') + '</ul>' : ' <span style="color:#64748b">none</span>') + '</div></div>';
  var ja = box.querySelector('[data-gcam-ja]'); if (ja) ja.onclick = function(){ try { W._gcJobAutoDefaults.open(); } catch (e) {} };
  var sv = box.querySelector('[data-gcam-save]');
  if (sv) sv.onclick = function(){
    sv.disabled = true;
    post(FN, { action: 'settings', warnPct: box.querySelector('[data-gcam-w]').value, overPct: box.querySelector('[data-gcam-o]').value }).then(function(j){
      sv.disabled = false; if (j && j.ok) { S.settings = j.settings; toast('✅ Profit alert levels saved.'); } else toast('Not saved: ' + ((j && j.error) || ''), true);
    });
  };
}
function addSection(){
  if (typeof W._gcAdmAddSection !== 'function') return false;
  W._gcAdmAddSection({ id: 'moneyrules', after: 'security', ic: '💰', t: 'Money rules', d: 'Deposit before scheduling · sub lien waivers · job profit alerts (80 % / 100 % of budget)',
    render: function(box){ renderAdmin(box); load(true).then(function(){ if (box.isConnected) renderAdmin(box); }); }, count: function(){ return (S.settings.warnPct || 80) + '% / ' + (S.settings.overPct || 100) + '%'; } });
  return true;
}

/* ── JA: the two rules are not "automations" — All on / All off leave them alone (see the patch's NOT_ALL edit) ── */
function tick(){ try { wrapDup(); wrapDue(); hookRun(); wrapLien(); paintBars(false); } catch (e) {} }
tick(); RI.call(W, tick, 1500);
if (!addSection()) { var tries = 0, iv = RI.call(W, function(){ if (addSection() || ++tries > 120) clearInterval(iv); }, 500); }
ST.call(W, function(){ load(true).then(function(){ paintBars(true); }); }, 5000);
RI.call(W, function(){ if (!D.hidden) load(false).then(function(){ paintBars(false); }); }, 180e3);
ST.call(W, profitPass, 60e3); RI.call(W, function(){ load(false).then(profitPass); }, 10 * 60e3);
W._gcMoney = { core: MC, state: function(){ return S; }, load: load, gateFor: gateFor, depositOf: depositOf, lienReq: lienReq, holdFor: holdFor, profitPass: profitPass, paint: paintBars, open: blockBox };
try { console.log('[GC] 💰 Money rules: deposit before scheduling · sub lien waivers by job type · profit alerts (patch AUTOMONEY) — _gcMoney'); } catch (e) {}
})();
