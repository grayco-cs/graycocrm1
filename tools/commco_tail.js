/* __GC_PATCH_COMMCO__ ════════════════════════════════════════════════════════════════════════════════════════════════
   GrayCo — COMMERCIAL JOBS (patch COMMCO). Owner 10/26: "Commercial: we get change orders signed for any new work no
   matter what; the job cannot continue until the change order is signed. We also need to initial all materials we are
   using in commercial on site for their supers — before we start we have supers initial a checklist of materials we
   are using." Then: "all change orders, links, submittals, approvals for commercial go through GC portal and email."

   Which job is commercial: patch AUTOCOM's one rule (window._gcJA.groupOf — type, from a bid, a GC / company customer).
   Residential / insurance / program jobs: nothing here changes them (the $2,500 signature line stays).

   A. CHANGE ORDERS. Every change order on a commercial job needs the GC's signature, whatever the amount (the Add
      Change Order form says so). It goes through the GC portal: priced → ✅ Approvals (PM, then an admin — the existing
      rule) → e-mailed to the GC contacts (office@ copied) with the link → the GC signs on their project page. While one
      (made since 10/26) is not signed — sent, approved without a signature, or a draft with work in it — the job is ON
      HOLD: a red "⛔ Work stopped — waiting on signed Change Order #N from <GC>" on the job page, the GrayCo Field job
      cards (Today), the Schedule, the GC's project page and the sub's portal ("Stop: do not start the added work",
      never a price). Daily log / Start day, progress, "mark done", and new crew days on the schedule ask for an admin
      override with a reason (logged on the job: commcoLog). Signed → the hold lifts by itself; the PM + office@ get
      "CO #N signed — job can continue". Unsigned: a reminder to the GC after 24 hours, then daily (server, hourly).
   B. MATERIALS APPROVAL. 🏗 GC portal → 🧱 Materials: the lines are filled from the job's estimate (materials) and its
      selections; the PM edits / adds / removes. The GC superintendent initials each line and signs — on the PM's phone
      or tablet ("📱 Sign on this device": name, title / company, an initials box per line, the signature, the date / time,
      an optional photo of the labels) or through "✉️ Send to the super" (the GC project page, no login, this job only).
      The signed PDF (centered logo header) goes on the job's documents and by e-mail to the super + office@. A
      commercial job cannot move to In Progress (Active, progress, the first crew day, Start day) until every line is
      initialed and the checklist signed (admin override with a reason, logged). A line added later (a change order, an
      approved submittal) needs its own initials: "N materials awaiting super initials" on the job.
   C. SUBMITTALS + APPROVAL REQUESTS in the same panel (the GC answers on their project page; PM + office@ told).
   D. ⚙ Automations: "🏗 Make the GC portal link" and "✉️ Send the GC portal invite" (PM approves) — on for commercial.

   Same rules as the server: netlify/functions/_lib/commco.js (the RULES block below is copied from it).
   API: window._gcCommco = { isComm, hold, gate, mats, blocked, guard, check, open(pid, tab), signMode(pid), pull(), state() }
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_COMMCO__) return; window.__GC_PATCH_COMMCO__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function every(f, ms){ return RI.call(W, f, ms); }
/*__RULES__*/
var FN = '/.netlify/functions/gc-portal';
var STAGES = ['lead', 'signed', 'materials', 'in_progress', 'inspection', 'substantial', 'complete'];
function s(v){ return ccS(v); }
function low(v){ return ccLow(v); }
function arr(v){ return ccArr(v); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowIso(){ return new Date().toISOString(); }
function crm(){ return W._crm || {}; }
function proj(pid){ if (pid && typeof pid === 'object') return pid; return arr(crm().projects).filter(function(p){ return String(p.id) === String(pid); })[0] || null; }
function users(){ return arr(crm().users).filter(function(u){ return u && u.name; }); }
function me(){ try { return low(localStorage.getItem('grayco_user')); } catch (e) { return ''; } }
function authEmail(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function meUser(){ var m = me(), a = authEmail(); return users().filter(function(u){ return (a && low(u.email) === a) || (m && (low(u.email) === m || low(u.name) === m)); })[0] || null; }
function isAdmin(){ var u = meUser(); return !!u && (low(u.payType) === 'owner' || /^admin/i.test(s(u.role))); }
function myName(){ var u = meUser(); return u ? s(u.name) : (authEmail() || me()); }
function toast(msg, bad){
  try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.className = 'gccc-toast'; t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483600;background:' + (bad ? '#b91c1c' : '#111827') + ';color:#fff;border-radius:10px;padding:10px 16px;font:600 13px Inter,Arial,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.35);max-width:calc(100vw - 32px)';
    D.body.appendChild(t); later(function(){ try { t.remove(); } catch (e) {} }, 5000); } catch (e) {}
}

/* ── what the CRM knows ─────────────────────────────────────────────────────────────────────────────────────── */
function isComm(p){ p = proj(p); if (!p) return false; try { if (W._gcJA && typeof W._gcJA.groupOf === 'function') return W._gcJA.groupOf(p) === 'commercial'; } catch (e) {} return false; }
var CO_IDB = [];
function loadCOs(){ try { if (typeof W.idbGet === 'function') Promise.resolve(W.idbGet('cos')).then(function(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } if (Array.isArray(v)) CO_IDB = v; }, function(){}); } catch (e) {} }
function cosAll(){ var l = arr(crm().changeOrders); var seen = {}; l.forEach(function(c){ seen[s(c.id)] = 1; }); return l.concat(arr(CO_IDB).filter(function(c){ return !seen[s(c.id)]; })); }
function custOf(p){ var n = low(p.client || p.customer); return arr(crm().customers).concat(arr(W._graycoCustomers)).filter(function(c){ return c && n && low(c.name || c.company) === n; })[0] || null; }
function gcName(p){ var c = custOf(p); return s((c && (c.company || c.name)) || p.gc || p.gcCompany || p.company || p.client); }
var REMOTE = {};   /* cc-pull: { pid: { mats, remote:[GC portal change orders not on the job yet], subm, apprs } } */
function hold(pid){ var p = proj(pid); if (!p) return { on: false, cos: [] }; return holdOf(isComm(p), p.id, cosAll(), (REMOTE[p.id] || {}).remote); }
function mats(pid){ var p = proj(pid); if (!p) return null; var r = REMOTE[p.id] && REMOTE[p.id].mats; var m = p.commcoMats; if (r && (!m || s(r.updatedAt) >= s(m.updatedAt) || s(r.lastSignedAt) > s(m.lastSignedAt))) return r; return m || r || null; }
function gate(pid){ var p = proj(pid); if (!p) return { ok: true }; return startGate(isComm(p), mats(p)); }
function rank(st){ var i = STAGES.indexOf(s(st)); return i < 0 ? -1 : i; }
function crewish(e){ return !/inspect|meeting|walk|appoint|deliver|estimate|\bbid\b|site visit|consult|measure|walkthrough/i.test(s(e.title) + ' ' + s(e.type) + ' ' + s(e.kind)); }
function started(p, sched){
  if (ccNum(p.pct) > 0 || rank(p.jobStage) >= rank('in_progress') || s(p.commcoStartedAt)) return true;
  return arr(sched || crm().schedule).some(function(e){ return e && String(e.pid) === String(p.id) && !e.deleted && crewish(e) && s(e.date) && s(e.date) <= nowIso().slice(0, 10); });
}

/* ── overrides (admin, with a reason, logged on the job) ─────────────────────────────────────────────────────── */
var OV = {};
function ovActive(pid, action){
  var k = pid + '|' + action; if (OV[k] && OV[k] > Date.now()) return true;
  var p = proj(pid); if (!p) return false;
  return arr(p.commcoLog).some(function(x){ return x.kind === 'override' && (x.action === action || x.action === 'all') && Date.parse(x.until || 0) > Date.now(); });
}
var LABEL = { log: 'a daily log / Start day', progress: 'progress', task: 'marking work done', schedule: 'a new crew day', start: 'starting the job (In Progress / first crew day)' };
/* null when allowed, else { why, text } */
function blocked(p, action){
  p = proj(p); if (!p || !isComm(p)) return null;
  if (ovActive(p.id, action)) return null;
  var h = hold(p.id), g = gate(p);
  var ht = { why: 'hold', text: holdText(h, gcName(p)), hold: h };
  if (action === 'start') { if (h.on) return ht; if (!g.ok) return { why: 'gate', text: '🧱 ' + g.text, gate: g }; return null; }
  return h.on ? ht : null;
}

/* ── the stop sheet ──────────────────────────────────────────────────────────────────────────────────────────── */
function ask(p, action, info, cont){
  p = proj(p); if (!p) return;
  var key = p.id + '|' + action;
  if (D.getElementById('gccc-stop')) return;
  css();
  var admin = isAdmin();
  var ov = D.createElement('div'); ov.id = 'gccc-stop'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = '<div class="gccc-dlg"><div class="gccc-red">' + esc(info.text) + '</div>'
    + '<p><b>' + esc(p.name) + '</b> — ' + esc(LABEL[action] || action) + ' is stopped' + (info.why === 'hold' ? ' until the change order is signed by the GC. Sign-off comes through the GC portal (🏗 GC portal on the job).' : ' until the GC superintendent has initialed every material and signed the checklist (🏗 GC portal → 🧱 Materials).') + '</p>'
    + (admin ? '<label class="gccc-l" for="gccc-why">Admin override — why? (logged on the job)</label><textarea id="gccc-why" maxlength="400" placeholder="e.g. GC super approved by phone, signature coming tonight"></textarea>'
      + '<div class="gccc-acts"><button type="button" class="g" data-x="close">Cancel</button><button type="button" data-x="gcp">Open GC portal</button><button type="button" class="r" data-x="ov">Override &amp; continue</button></div>'
      : '<p class="gccc-m">Only an admin can override this (with a reason).</p><div class="gccc-acts"><button type="button" class="g" data-x="close">OK</button><button type="button" data-x="gcp">Open GC portal</button></div>')
    + '</div>';
  ov.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('[data-x]') : null; if (!b) return;
    var x = b.getAttribute('data-x');
    if (x === 'close') return ov.remove();
    if (x === 'gcp') { ov.remove(); open(p.id, info.why === 'gate' ? 'mats' : 'co'); return; }
    if (x === 'ov') {
      var why = s((D.getElementById('gccc-why') || {}).value);
      if (why.length < 4) { toast('Say why (a few words) — it is logged on the job.', true); return; }
      var until = new Date(Date.now() + 12 * 3600e3).toISOString();
      OV[key] = Date.now() + 12 * 3600e3;
      var entry = { kind: 'override', action: action, reason: why, by: myName(), at: nowIso(), until: until, why: info.why, cos: info.hold ? info.hold.cos.map(function(c){ return '#' + c.number; }) : [], gate: info.gate ? info.gate.why : '' };
      logOn(p.id, entry);
      ov.remove(); toast('Override logged on the job — ' + (LABEL[action] || action) + ' allowed for 12 hours.');
      if (action === 'start') { OV[p.id + '|schedule'] = OV[key]; }
      try { if (typeof cont === 'function') cont(); } catch (e2) {}
    }
  });
  D.body.appendChild(ov);
  var ta = D.getElementById('gccc-why'); if (ta) try { ta.focus(); } catch (e) {}
}
function logOn(pid, entry){
  var p = proj(pid); if (!p) return Promise.resolve(false);
  var next = arr(p.commcoLog).concat([entry]).slice(-120);
  if (typeof W._gcxPatchJob === 'function') return Promise.resolve(W._gcxPatchJob(pid, { commcoLog: next }, entry.kind === 'override' ? 'commercial hold override' : 'commercial')).catch(function(){ return false; });
  return Promise.resolve(false);
}
/* a person's action on a job: true when it was stopped (the sheet is open; cont runs after an admin override) */
var GESTURE = 0;
['pointerdown', 'mousedown', 'touchstart', 'keydown'].forEach(function(n){ D.addEventListener(n, function(){ GESTURE = Date.now(); }, true); });
function userNow(){ return Date.now() - GESTURE < 5000; }
function guard(pid, action, cont){
  var p = proj(pid); var info = p && blocked(p, action);
  if (!info) { if (typeof cont === 'function') cont(); return false; }
  ask(p, action, info, cont); return true;
}
function blockNow(pid, action, cont){ if (!userNow()) return false; var p = proj(pid), info = p && blocked(p, action); if (!info) return false; ask(p, action, info, cont); return true; }

/* ── the lists: a person's change that would start / continue a stopped job is held back and asked about ─────────── */
function checkProjects(prev, next){
  var by = {}; arr(prev).forEach(function(p){ by[String(p.id)] = p; });
  var list = arr(next);
  for (var i = 0; i < list.length; i++) {
    var n = list[i], o = by[String(n.id)]; if (!o || n === o || !isComm(n)) continue;
    var acts = [];
    var wasStarted = started(o);
    if (ccNum(n.pct) > ccNum(o.pct)) acts.push(wasStarted ? 'progress' : 'start');
    if (/^(active|in.?progress|started)$/i.test(s(n.status)) && !/^(active|in.?progress|started|completed?|closed)$/i.test(s(o.status)) && !wasStarted) acts.push('start');
    if (rank(n.jobStage) >= rank('in_progress') && rank(o.jobStage) < rank('in_progress')) acts.push('start');
    var dn = function(l){ return arr(l).filter(function(x){ return x.done === true || x.checked === true || /^(done|complete|completed)$/i.test(s(x.status)); }).length; };
    if (dn(n.checklist) > dn(o.checklist) || dn(n.tasks) > dn(o.tasks)) acts.push('task');
    if (arr(n.updates).length > arr(o.updates).length || arr(n.dailyLogs).length > arr(o.dailyLogs).length) acts.push('log');
    for (var k = 0; k < acts.length; k++) { var info = blocked(n, acts[k]); if (info) return { pid: n.id, action: acts[k], info: info }; }
  }
  return null;
}
function checkSchedule(prev, next){
  var by = {}; arr(prev).forEach(function(e){ by[String(e.id)] = e; });
  var list = arr(next);
  for (var i = 0; i < list.length; i++) {
    var e = list[i]; if (!e || !s(e.pid)) continue;
    var p = proj(e.pid); if (!p || !isComm(p)) continue;
    var o = by[String(e.id)], act = '';
    if (!o && !e.deleted && crewish(e)) {
      var crewBefore = arr(prev).some(function(x){ return x && String(x.pid) === String(p.id) && !x.deleted && crewish(x); });
      act = !crewBefore && !started(p, prev) ? 'start' : 'schedule';
    } else if (o && !(o.done === true || /^(done|complete|completed)$/i.test(s(o.status))) && (e.done === true || /^(done|complete|completed)$/i.test(s(e.status)))) act = 'task';
    if (!act) continue;
    var info = blocked(p, act);
    if (!info && act === 'start') info = blocked(p, 'schedule');
    if (info) return { pid: p.id, action: act, info: info };
  }
  return null;
}
function check(name, prev, next){ try { return name === '_setSchedule' ? checkSchedule(prev, next) : checkProjects(prev, next); } catch (e) { return null; } }
var stats = { held: 0, passed: 0, asked: 0 };
var SEEN = typeof WeakSet === 'function' ? new WeakSet() : null;
function heldBack(b, name, v){
  stats.held++;
  if (v && typeof v === 'object' || typeof v === 'function') { if (SEEN && SEEN.has(v)) return; if (SEEN) SEEN.add(v); }   /* the same change seen twice (an updater run twice) */
  later(function(){ stats.asked++; ask(b.pid, b.action, b.info, function(){ try { var f = W[name]; if (typeof f === 'function') f(v); } catch (e) {} }); }, 0);
}
var WR = new WeakMap();
function wrapSetter(name, f){
  if (typeof f !== 'function' || f.__gcccWrapped) return f;
  var have = WR.get(f); if (have) return have;
  var w = function(v){
    if (!userNow()) return f.apply(this, arguments);
    if (typeof v === 'function') {
      return f.call(this, function(prev){ var next = v(prev); var b = check(name, prev, next); if (b) { heldBack(b, name, v); return prev; } stats.passed++; return next; });
    }
    var b2 = Array.isArray(v) ? check(name, name === '_setSchedule' ? crm().schedule : crm().projects, v) : null;
    if (b2) { heldBack(b2, name, v); return; }
    return f.apply(this, arguments);
  };
  w.__gcccWrapped = true; w.__gcSafe = f.__gcSafe;
  WR.set(f, w); return w;
}
(function(){
  var orig = W.__gcSafeSetter;
  W.__gcSafeSetter = function(name, raw){
    var f = typeof orig === 'function' ? orig(name, raw) : raw;
    return name === '_setProjects' || name === '_setSchedule' ? wrapSetter(name, f) : f;
  };
  ['_setProjects', '_setSchedule'].forEach(function(n){ if (typeof W[n] === 'function') W[n] = wrapSetter(n, W[n]); });
})();
/* GrayCo Field: Start day / Progress / Punch / Final walkthrough on a stopped job */
var FIELD_ACT = { day: 'log', progress: 'progress', punch: 'task', walk: 'task' };
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-fa]') : null; if (!b) return;
  var id = b.getAttribute('data-fa'), pid = b.getAttribute('data-pid'), act = FIELD_ACT[id]; if (!act || !pid) return;
  var p = proj(pid); if (!p || !isComm(p)) return;
  if (id === 'day' && !started(p)) act = 'start';
  var info = blocked(p, act); if (!info) return;
  e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  ask(p, act, info, function(){ try { if (W._gcFieldTools && W._gcFieldTools.run) W._gcFieldTools.run(id, pid); } catch (x) {} });
}, true);

/* ── the red banner: the job page (desk), the GrayCo Field job cards (Today), the Schedule ───────────────────── */
var CSS = '.gccc-ban{margin:8px 0;padding:10px 14px;border-radius:10px;background:#FDE2E2;border:2px solid #B91C1C;color:#7F1D1D;font:700 14px Inter,Arial,sans-serif;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}'
  + '.gccc-ban.amber{background:#FEF3C7;border-color:#B45309;color:#78350F}.gccc-ban button{padding:6px 12px;border-radius:7px;border:none;background:#7F1D1D;color:#fff;font:700 12px Inter,Arial,sans-serif;cursor:pointer;min-height:32px}.gccc-ban.amber button{background:#78350F}'
  + '.gccc-fban{margin:6px 0 2px;padding:6px 10px;border-radius:8px;background:#FDE2E2;border:1px solid #B91C1C;color:#7F1D1D;font:700 13px Inter,Arial,sans-serif}.gccc-fban.amber{background:#FEF3C7;border-color:#B45309;color:#78350F}'
  + '.gccc-sch{display:inline-block;margin-left:6px;padding:0 6px;border-radius:5px;background:#B91C1C;color:#fff;font:700 10px Inter,Arial,sans-serif;vertical-align:middle}'
  + '#gccc-stop,#gccc-sign{position:fixed;inset:0;z-index:2147483400;background:rgba(6,12,20,.72);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}'
  + '.gccc-dlg{background:#fff;color:#0f172a;width:100%;max-width:560px;border-radius:14px;padding:18px;box-sizing:border-box;font:14px/1.45 Inter,Arial,sans-serif}.gccc-dlg.wide{max-width:760px}'
  + '.gccc-red{background:#FDE2E2;border:2px solid #B91C1C;color:#7F1D1D;font-weight:800;border-radius:10px;padding:10px 12px;font-size:15px}'
  + '.gccc-dlg textarea,.gccc-dlg input[type=text],.gccc-dlg input[type=email]{width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font:15px Inter,Arial,sans-serif;min-height:42px}.gccc-dlg textarea{min-height:70px}'
  + '.gccc-l{display:block;font-size:12px;font-weight:700;color:#475569;margin:10px 0 4px}.gccc-m{color:#64748b;font-size:13px}.gccc-acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px}'
  + '.gccc-dlg button{padding:9px 14px;border-radius:8px;border:none;background:#0f2440;color:#fff;font:700 13px Inter,Arial,sans-serif;cursor:pointer;min-height:42px}.gccc-dlg button.g{background:#e2e8f0;color:#0f2440}.gccc-dlg button.r{background:#B91C1C}'
  + '.gccc-line{border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin:8px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.gccc-line .w{flex:1 1 240px}.gccc-line .ini{width:110px;font:800 22px Inter,Arial,sans-serif;text-align:center;text-transform:uppercase;min-height:52px}'
  + '.gccc-line.ok{background:#f0fdf4;border-color:#bbf7d0}.gccc-pad{width:100%;max-width:600px;aspect-ratio:3/1;border:1px solid #94a3b8;border-radius:10px;background:#fff;touch-action:none;display:block}'
  + '#gcgp .cc-t td,#gcgp .cc-t th{padding:4px;border-bottom:1px solid #f1f5f9;vertical-align:top;text-align:left}#gcgp .cc-t input{width:100%;min-width:70px}#gcgp .cc-t{width:100%;border-collapse:collapse}';
function css(){ if (D.getElementById('gccc-css')) return; var st = D.createElement('style'); st.id = 'gccc-css'; st.textContent = CSS; D.head.appendChild(st); }
function banState(p){
  if (!isComm(p)) return null;
  var h = hold(p.id), m = mats(p), g = startGate(true, m), pend = matsPending(m).length, out = { red: '', amber: '' };
  if (h.on) out.red = holdText(h, gcName(p));
  if (!started(p) && !g.ok) out.amber = '🧱 ' + g.text;
  else if (pend) out.amber = '🧱 ' + pend + ' material' + (pend === 1 ? '' : 's') + ' awaiting super initials — initial before use.';
  return out.red || out.amber ? out : null;
}
function deskBan(){
  if (D.hidden) return;
  var main = D.querySelector('main'); if (!main) return;
  var op = W._gcOpenProject, p = op && op.id ? proj(op.id) : null, st = p ? banState(p) : null;
  var bans = main.querySelectorAll('.gccc-ban');
  var back = null, bs = main.getElementsByTagName('button');
  if (st) for (var i = 0; i < bs.length && i < 80; i++) if (/^\s*←\s*All Projects\s*$/.test(bs[i].textContent || '')) { back = bs[i]; break; }
  if (!st || !back) { Array.prototype.forEach.call(bans, function(x){ x.remove(); }); return; }
  var root = back.parentElement, sig = JSON.stringify([p.id, st]);
  var have = root.querySelector(':scope > .gccc-wrap');
  if (have && have.__sig === sig) return;
  if (have) have.remove();
  Array.prototype.forEach.call(bans, function(x){ if (!root.contains(x)) x.remove(); });
  css();
  var wrap = D.createElement('div'); wrap.className = 'gccc-wrap'; wrap.__sig = sig; wrap.setAttribute('data-pid', p.id);
  wrap.innerHTML = (st.red ? '<div class="gccc-ban" role="alert" data-gccc="hold"><span>' + esc(st.red) + '</span><button type="button" data-ccb="co">Open GC portal</button></div>' : '')
    + (st.amber ? '<div class="gccc-ban amber" data-gccc="mats"><span>' + esc(st.amber) + '</span><button type="button" data-ccb="mats">🧱 Materials approval</button></div>' : '');
  wrap.addEventListener('click', function(e){ var b = e.target && e.target.closest ? e.target.closest('[data-ccb]') : null; if (b) open(p.id, b.getAttribute('data-ccb')); });
  var after = root.querySelector(':scope > .gcgp-bar') || root.querySelector(':scope > .gcja-bar') || back;
  root.insertBefore(wrap, after.nextSibling);
}
function fieldBans(){
  Array.prototype.forEach.call(D.querySelectorAll('.fh-job[data-job]'), function(card){
    var p = proj(card.getAttribute('data-job')), st = p ? banState(p) : null, have = card.querySelector('.gccc-fban'), sig = JSON.stringify(st);
    if (have && have.__sig === sig) return;
    if (have) have.remove(); if (!st) return;
    css(); var d = D.createElement('div'); d.className = 'gccc-fban' + (st.red ? '' : ' amber'); d.__sig = sig; d.setAttribute('role', 'alert'); d.textContent = st.red || st.amber;
    card.insertBefore(d, card.firstChild ? card.firstChild.nextSibling : null);
  });
}
function schedBadges(){
  var v = ''; try { v = localStorage.getItem('grayco_view') || ''; } catch (e) {}
  if (!/sched|calendar|today/i.test(v)) return;
  var main = D.querySelector('main'); if (!main) return;
  var held = arr(crm().projects).filter(function(p){ return p && s(p.name).length >= 5 && isComm(p) && hold(p.id).on; });
  if (!held.length) { Array.prototype.forEach.call(main.querySelectorAll('.gccc-sch'), function(x){ x.remove(); }); return; }
  var names = held.map(function(p){ return low(p.name); });
  var els = main.querySelectorAll('div,span,b,strong,td,a'), n = 0;
  for (var i = 0; i < els.length && n < 4000; i++) {
    var el = els[i]; n++;
    if (el.childElementCount > 1 || el.classList.contains('gccc-sch') || el.querySelector('.gccc-sch')) continue;
    var t = low(el.textContent); if (!t || t.length > 140) continue;
    if (!names.some(function(x){ return t.indexOf(x) >= 0; })) continue;
    var bdg = D.createElement('span'); bdg.className = 'gccc-sch'; bdg.textContent = '⛔ ON HOLD — CO unsigned'; el.appendChild(bdg);
  }
}
function paintAll(){ try { css(); deskBan(); fieldBans(); schedBadges(); } catch (e) {} }
try { (W.__gcJobPaint = W.__gcJobPaint || []).push(function(){ try { deskBan(); } catch (e) {} }); } catch (e) {}
every(paintAll, 1500);

/* ── the server (gc-portal) ──────────────────────────────────────────────────────────────────────────────────── */
function token(){
  var A = W.__GC_AUTH__;
  if (!A || typeof A.fresh !== 'function') return Promise.reject(new Error('Sign in to the CRM first.'));
  return Promise.resolve(A.fresh()).then(function(x){ if (!x || !x.access_token) throw new Error('Sign in to the CRM first.'); return x.access_token; });
}
function api(body){
  return token().then(function(t){ return W.fetch(FN, { method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); })
    .then(function(r){ return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch (e) { j = { error: 'The server answered ' + r.status + '.' }; } if (!r.ok || !j.ok) throw new Error(j.error || ('The server answered ' + r.status + '.')); return j; }); });
}
function patchJob(pid, patch, why){ if (typeof W._gcxPatchJob === 'function') return Promise.resolve(W._gcxPatchJob(pid, patch, why)); return Promise.reject(new Error('Reload the page and try again.')); }
function mirror(pid, raw){
  var p = proj(pid); if (!p || !raw) return Promise.resolve(false);
  var m = { lines: arr(raw.lines), signedAt: s(raw.signedAt), lastSignedAt: s(raw.lastSignedAt), updatedAt: s(raw.updatedAt) || nowIso(), super: raw.super || null,
    signoffs: arr(raw.signoffs).map(function(x){ return { id: x.id, at: x.at, name: x.name, title: x.title, company: x.company, via: x.via, lines: arr(x.lines).length, pdfRef: x.pdfRef || '' }; }) };
  m.lines = m.lines.map(function(l){ return { id: l.id, product: l.product, spec: l.spec, qty: l.qty, where: l.where, src: l.src, coId: l.coId, removed: l.removed || undefined, init: l.init || undefined, addedAt: l.addedAt }; });
  if (JSON.stringify(p.commcoMats || null) === JSON.stringify(m)) return Promise.resolve(false);
  return patchJob(pid, { commcoMats: m }, 'materials approval');
}
/* a signed checklist PDF → the job's documents (once, every computer agrees on the id) */
function fileDoc(pid, f){
  var id = 'ccmats_' + f.id;
  var cur = arr(crm().projectDocs || W._gcProjectDocs);
  return Promise.resolve(typeof W.idbGet === 'function' ? W.idbGet('projectDocs') : null).then(function(all){
    if (typeof all === 'string') { try { all = JSON.parse(all); } catch (e) { all = null; } }
    if (!Array.isArray(all)) all = cur.slice();
    if (all.concat(cur).some(function(d){ return d && d.id === id; })) return false;
    var t = nowIso(), doc = { id: id, pid: String(pid), name: f.fileName || ('Materials approval - signed ' + s(f.at).slice(0, 10) + '.pdf'), cat: 'Commercial — materials approval', type: 'application/pdf', ref: f.ref,
      hash: s(f.ref).slice(13, 77), uploaded: s(f.at).slice(0, 10), uploadedAt: s(f.at), by: s(f.name) + ' (GC superintendent)', source: 'commco-materials', signedBy: s(f.name), signedAt: s(f.at), savedAt: t, updatedAt: t };
    var docs = [doc]; if (f.photoRef) docs.push({ id: id + '_photo', pid: String(pid), name: 'Material labels photo - ' + s(f.at).slice(0, 10) + '.jpg', cat: 'Commercial — materials approval', type: 'image/jpeg', ref: f.photoRef, uploaded: s(f.at).slice(0, 10), uploadedAt: s(f.at), by: s(f.name) + ' (GC superintendent)', source: 'commco-materials', savedAt: t, updatedAt: t });
    var next = all.concat(docs);
    try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('materials approval'); } catch (e) {}
    try { if (W.idbSet) W.idbSet('projectDocs', next); } catch (e) {}
    try { if (W._setProjectDocs) W._setProjectDocs(function(prev){ return Array.isArray(prev) ? prev.filter(function(d){ return !(d && (d.id === id || d.id === id + '_photo')); }).concat(docs) : next; }); } catch (e) {}
    try { if (W._crm) W._crm.projectDocs = arr(W._crm.projectDocs).filter(function(d){ return d.id !== id && d.id !== id + '_photo'; }).concat(docs); } catch (e) {}
    try { if (W._supaUpsert) W._supaUpsert('projectDocs', next); } catch (e) {}
    later(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
    return true;
  });
}

/* every minute: what the GC portal knows (materials, signed PDFs, the GC's own open change orders); change orders to send */
var PUSHED = {}; try { PUSHED = JSON.parse(localStorage.getItem('gccc_pushed') || '{}') || {}; } catch (e) { PUSHED = {}; }
var lastPull = 0, pulling = null, AUTO = {};
function staffish(){ var u = meUser(); return !!u && (isAdmin() || /office|pm|project|super|manager/i.test(s(u.role) + ' ' + s(u.profile))); }
function commJobs(){ return arr(crm().projects).filter(function(p){ return p && p.id && !p.deleted && !/lost|dead|cancel|closed|completed?$/i.test(s(p.status)) && isComm(p); }); }
function pull(force){
  if (pulling) return pulling;
  if (!authEmail() || !staffish()) return Promise.resolve(null);
  if (!force && Date.now() - lastPull < 55000) return Promise.resolve(null);
  lastPull = Date.now(); loadCOs();
  var jobs = commJobs(); if (!jobs.length) return Promise.resolve(null);
  pulling = api({ action: 'cc-pull', pids: jobs.map(function(p){ return p.id; }) }).then(function(j){
    var got = j.jobs || {};
    jobs.forEach(function(p){ REMOTE[p.id] = got[p.id] || {}; });
    var work = Promise.resolve();
    Object.keys(got).forEach(function(pid){
      var r = got[pid];
      if (r.mats) work = work.then(function(){ return mirror(pid, r.mats); });
      if (arr(r.files).length) work = work.then(function(){ return Promise.all(r.files.map(function(f){ return fileDoc(pid, f); })).then(function(){ return api({ action: 'cc-filed', projectId: pid, ids: r.files.map(function(f){ return f.id; }) }).catch(function(){}); }); });
    });
    return work.then(function(){ return pushCOs(jobs); }).then(function(){ return autoLinks(jobs); }).then(function(){ paintAll(); return got; });
  }).then(function(x){ pulling = null; return x; }, function(e){ pulling = null; stats.err = s(e && e.message || e); return null; });
  return pulling;
}
/* a commercial job's change order → the GC portal (priced → ✅ Approvals → the GC signs). Once per version. */
function proofOk(co){ return !W._gcCoProof || W._gcCoProof.ready(co); }
function pushCOs(jobs){
  var ids = {}; jobs.forEach(function(p){ ids[String(p.id)] = p; });
  var all = cosAll();
  var want = all.filter(function(c){ return c && ids[coPid(c)] && coHolds(c) && low(c.status) !== 'draft' && proofOk(c); }).filter(function(c){ var k = s(c.id), v = coAmt(c) + '|' + s(c.desc || c.title); return PUSHED[k] !== v; }).slice(0, 5);
  return want.reduce(function(pr, c){
    return pr.then(function(){
      var p = ids[coPid(c)];
      return api({ action: 'cc-co-push', projectId: p.id, crmId: s(c.id), number: coNo(c, all), title: s(c.desc || c.title || ('Change order ' + coNo(c, all))).slice(0, 120), description: [s(c.reason), s(c.notes).replace(/^\[[^\]]*\]\s*/, '')].filter(Boolean).join('\n').slice(0, 3000), amount: coAmt(c) })
        .then(function(){ PUSHED[s(c.id)] = coAmt(c) + '|' + s(c.desc || c.title); try { localStorage.setItem('gccc_pushed', JSON.stringify(PUSHED)); } catch (e) {} }, function(e){ stats.pushErr = s(e && e.message); });
    });
  }, Promise.resolve());
}
/* ⚙ Automations: the GC portal link + its invite (PM approves) for a new commercial job, once */
function autoLinks(jobs){
  if (!(isAdmin() || /pm|project/i.test(s((meUser() || {}).role)))) return Promise.resolve();
  var JA = W._gcJA; if (!JA || typeof JA.effective !== 'function') return Promise.resolve();
  var todo = jobs.filter(function(p){ return s(p.createdAt || p.created).slice(0, 10) >= CC_BOOT && !(AUTO[p.id] && Date.now() - AUTO[p.id] < 3600e3); }).slice(0, 3);
  return todo.reduce(function(pr, p){
    return pr.then(function(){
      var eff = {}; try { eff = JA.effective(p) || {}; } catch (e) {}
      var patch = {}, steps = Promise.resolve();
      AUTO[p.id] = Date.now();
      if (eff.gcPortalLink !== false && !p.commcoGcLinkAt) steps = steps.then(function(){ return api({ action: 'gcp-link', projectId: p.id, op: 'create' }).then(function(){ patch.commcoGcLinkAt = nowIso(); }, function(){}); });
      if (eff.gcPortalInvite !== false && !p.commcoGcInviteAt) steps = steps.then(function(){ return api({ action: 'gcp-send-link', projectId: p.id }).then(function(j){ if (j.queued) patch.commcoGcInviteAt = nowIso(); }, function(){}); });
      return steps.then(function(){ if (Object.keys(patch).length) return patchJob(p.id, patch, 'GC portal automation').catch(function(){}); });
    });
  }, Promise.resolve());
}
every(function(){ if (!D.hidden) pull(false); }, 15000);
later(function(){ pull(true); }, 9000);
loadCOs(); every(loadCOs, 30000);

/* ── the GC portal panel (patch GCP): 🧱 Materials · 📑 Submittals · ✅ Approvals ─────────────────────────────── */
function G(){ return W._gcGCP || {}; }
function gP(){ return G()._p || {}; }
function gPaint(){ try { G()._paint(); } catch (e) {} }
function gLoad(){ try { return G()._load(); } catch (e) { return Promise.resolve(); } }
function open(pid, tab){
  var g = G(); if (!g.open) { toast('The GC portal panel is not ready — reload the page.', true); return; }
  g.open(pid); var P = gP(); P.tab = tab === 'co' ? 'co' : (tab || 'mats'); P.cc = null; later(gPaint, 30);
}
function gcpTabs(p, S){
  if (!isComm(p)) return [];
  var m = S.mats || {}, pend = matsPending(m).length, sub = arr(S.subm), ap = arr(S.apprs);
  var subOpen = sub.filter(function(x){ return x.status === 'submitted'; }).length, apOpen = ap.filter(function(x){ return x.status === 'open'; }).length;
  return [['mats', '🧱 Materials' + (pend ? ' · ' + pend + ' to initial' : matsLive(m).length && m.signedAt ? ' ✓' : '')], ['subm', '📑 Submittals' + (subOpen ? ' · ' + subOpen + ' out' : '')], ['appr', '✅ Approvals' + (apOpen ? ' · ' + apOpen + ' open' : '')]];
}
/* the materials the job already names: its estimate's material lines, its customer choices */
function prefill(p){
  var out = [], seen = {};
  function add(l){ var k = low(l.product) + '|' + low(l.spec); if (!s(l.product) || seen[k]) return; seen[k] = 1; out.push(l); }
  var ests = arr(W._gcEstimatesState).length ? arr(W._gcEstimatesState) : arr(crm().estimates);
  var mine = ests.filter(function(e){ return e && e.deleted !== true && (String(e.pid) === String(p.id) || (p.estimateId && String(e.id) === String(p.estimateId)) || (p._lastEstId && String(e.id) === String(p._lastEstId))); });
  mine.sort(function(a, b){ return s(a.updatedAt || a.savedAt) < s(b.updatedAt || b.savedAt) ? 1 : -1; });
  var e = mine.filter(function(x){ return /signed|won|approved|accepted|final/i.test(s(x.status)); })[0] || mine[0];
  if (e) arr(e.lines).filter(function(l){ return /^mat/i.test(s(l.type)); }).slice(0, 150).forEach(function(l){
    add({ product: noMoney(s(l.desc).replace(/^[A-Z]{1,3}-\d{1,3}\s+/, '')), spec: noMoney([s(l.sku) ? 'SKU ' + s(l.sku) : '', s(l.notes)].filter(Boolean).join(' · ')), qty: s(l.qty) ? s(l.qty) + (s(l.unit) ? ' ' + s(l.unit) : '') : '', where: s(l.cat), src: 'estimate' });
  });
  try { arr(W._gcCH && W._gcCH.choices ? W._gcCH.choices(p.id) : []).forEach(function(c){
    var pr = [s(c.brand), s(c.line || c.product || c.name)].filter(Boolean).join(' '); if (!pr) return;
    add({ product: noMoney(pr), spec: noMoney(s(c.color || c.pick || c.option || c.choice)), qty: s(c.qty) ? s(c.qty) + (s(c.unit) ? ' ' + s(c.unit) : '') : '', where: s(c.area || c.where || c.category || c.cat), src: 'selections' });
  }); } catch (x) {}
  return out;
}
function work(P, p){
  if (!P.cc || P.cc.pid !== p.id) {
    var m = (P.st && P.st.state && P.st.state.mats) || mats(p) || {};
    P.cc = { pid: p.id, lines: matsLive(m).map(function(l){ return Object.assign({}, l); }), dirty: false, sub: { files: [] }, ap: { files: [] } };
  }
  return P.cc;
}
function pane(tab, p, st, P){
  if (!isComm(p)) return '';
  var S = (st && st.state) || {};
  if (tab === 'mats') {
    var w = work(P, p), m = S.mats || {}, g = startGate(true, { lines: w.lines, signedAt: m.signedAt });
    var h = '<div class="box"><b>🧱 Materials approval — the GC superintendent initials every material before work starts</b><div class="w">' + esc(g.ok ? 'Every material is initialed and the checklist is signed' + (m.signedAt ? ' (' + new Date(m.signedAt).toLocaleDateString() + ')' : '') + '. Materials added later need their own initials.' : g.text) + '</div>'
      + '<div class="f" style="margin-top:6px"><button type="button" data-cc="fill">＋ Fill from the estimate / selections</button><button type="button" class="g" data-cc="add">＋ Add a line</button><button type="button" data-cc="save"' + (w.dirty ? '' : ' class="g"') + '>💾 Save' + (w.dirty ? ' (changed)' : '') + '</button>'
      + '<button type="button" data-cc="sign">📱 Sign on this device (super on site)</button></div></div>';
    h += '<div class="gcgp-tbl"><table class="cc-t"><thead><tr><th>#</th><th>Product</th><th>Spec / color</th><th>Qty</th><th>Where used</th><th>Super\'s initials</th><th></th></tr></thead><tbody>'
      + (w.lines.length ? w.lines.map(function(l, i){ return '<tr data-cc-i="' + i + '"><td>' + (i + 1) + '</td>' + ['product', 'spec', 'qty', 'where'].map(function(f){ return '<td><input type="text" data-cc-f="' + f + '" data-cc-i="' + i + '" value="' + esc(l[f]) + '" maxlength="' + (f === 'qty' ? 40 : 200) + '"></td>'; }).join('')
        + '<td>' + (lineOk(l) ? '<span class="tag ok">✓ ' + esc(l.init.initials) + '</span>' : '<span class="tag now">needed</span>') + '</td><td><button type="button" class="r" data-cc="del" data-i="' + i + '">✕</button></td></tr>'; }).join('') : '<tr><td colspan="7" class="w">No materials yet — fill from the estimate or add lines.</td></tr>')
      + '</tbody></table></div>';
    var sup = m.super || {};
    h += '<div class="box"><b>✉️ Send to the superintendent</b> <span class="w">— a link to their project page (no login, this job only) + the PDF; office@ copied.</span><div class="f" style="margin-top:6px"><label>Name<input type="text" id="cc-sn" value="' + esc(sup.name) + '"></label><label>E-mail<input type="email" id="cc-se" value="' + esc(sup.email) + '"></label><button type="button" data-cc="send">Send</button></div></div>';
    arr(m.signoffs).slice().reverse().forEach(function(x){ h += '<div class="box"><div class="row"><span>✍️ Signed by <b>' + esc(x.name) + '</b>' + (x.title ? ', ' + esc(x.title) : '') + (x.company ? ' — ' + esc(x.company) : '') + ' · ' + esc(new Date(x.at).toLocaleString()) + ' · ' + arr(x.lines).length + ' line' + (arr(x.lines).length === 1 ? '' : 's') + ' · ' + (x.via === 'onsite' ? 'on site' : 'through the link') + '</span>' + (x.pdfRef ? '<button type="button" class="g" data-cc="pdf" data-id="' + esc(x.id) + '">📄 PDF</button>' : '') + '</div></div>'; });
    return h;
  }
  if (tab === 'subm') {
    var list = arr(S.subm), sw = work(P, p).sub;
    var h2 = '<div class="box"><b>＋ New submittal</b><div class="w">Product data, shop drawings, sample photos. Submit → e-mailed to the GC (link + files, office@ copied) and on their project page; they approve / approve as noted / return for revision / reject.</div>'
      + '<div class="f" style="margin-top:6px"><label>Spec section<input type="text" id="cc-ss" maxlength="60" style="width:110px" placeholder="e.g. 09 30 00"></label><label style="flex:1">Item<input type="text" id="cc-si" maxlength="160" style="width:100%"></label><label>Review by<input type="date" id="cc-sd"></label></div>'
      + '<textarea id="cc-sx" maxlength="3000" placeholder="Description (manufacturer, model, color, where used)" style="margin-top:6px"></textarea>'
      + '<div class="f" style="margin-top:6px"><label>Files<input type="file" id="cc-sf" multiple accept="application/pdf,image/*"></label><label>Kind<select id="cc-sk"><option value="product">Product data</option><option value="shop">Shop drawings</option><option value="sample">Sample photos</option><option value="other">Other</option></select></label>'
      + '<button type="button" class="g" data-cc="sdraft">Save draft</button><button type="button" data-cc="ssubmit">Submit to the GC</button></div></div>';
    if (!list.length) h2 += '<div class="w">No submittals yet.</div>';
    list.slice().reverse().forEach(function(x){
      h2 += '<div class="box"><div class="row"><b>#' + esc(x.number) + (x.rev ? ' rev ' + x.rev : '') + ' — ' + esc(x.item) + '</b><span class="tag ' + (/approved/.test(x.status) ? 'ok' : 'now') + '">' + esc((x.superseded ? 'superseded · ' : '') + ({ draft: 'Draft', submitted: 'Submitted — with the GC', approved: 'Approved', approved_as_noted: 'Approved as noted', revise: 'Revise & resubmit', rejected: 'Rejected' }[x.status] || x.status)) + '</span></div>'
        + '<div class="w">' + esc([x.spec ? 'Spec ' + x.spec : '', x.submittedAt ? 'submitted ' + new Date(x.submittedAt).toLocaleDateString() : '', x.due ? 'review by ' + x.due : '', x.returnedAt ? 'returned ' + new Date(x.returnedAt).toLocaleDateString() + ' by ' + x.reviewer : ''].filter(Boolean).join(' · ')) + '</div>'
        + (x.comments ? '<div style="white-space:pre-wrap">GC: ' + esc(x.comments) + '</div>' : '')
        + '<div class="f" style="margin-top:4px">' + arr(x.files).concat(x.markup ? [x.markup] : []).map(function(f){ return '<button type="button" class="g" data-cc="file" data-id="' + esc(f.id) + '">📄 ' + esc(f.name) + '</button>'; }).join('')
        + (x.status === 'draft' ? '<button type="button" data-cc="ssend" data-id="' + esc(x.id) + '">Submit to the GC</button>' : '')
        + (/^(revise|rejected)$/.test(x.status) && !x.superseded ? '<button type="button" data-cc="sresub" data-id="' + esc(x.id) + '">Resubmit (rev ' + ((x.rev || 0) + 1) + ')</button>' : '') + '</div></div>';
    });
    return h2;
  }
  if (tab === 'appr') {
    var al = arr(S.apprs);
    var h3 = '<div class="box"><b>＋ New approval request</b><div class="w">A question or an approval the GC answers on their project page (and by e-mail, office@ copied).</div><div class="f" style="margin-top:6px"><label style="flex:1">Subject<input type="text" id="cc-as" maxlength="140" style="width:100%"></label><label>Needed by<input type="date" id="cc-ad"></label></div>'
      + '<textarea id="cc-aq" maxlength="4000" placeholder="What do you need approved / answered?" style="margin-top:6px"></textarea><div class="f" style="margin-top:6px"><label>Attachment<input type="file" id="cc-af" multiple accept="application/pdf,image/*"></label><button type="button" data-cc="anew">Send to the GC</button></div></div>';
    if (!al.length) h3 += '<div class="w">No approval requests yet.</div>';
    al.slice().reverse().forEach(function(x){
      h3 += '<div class="box"><div class="row"><b>#' + esc(x.number) + ' — ' + esc(x.subject) + '</b><span class="tag ' + (x.status === 'open' ? 'now' : 'ok') + '">' + esc(x.status === 'open' ? 'Waiting on the GC' : x.status) + '</span></div><div style="white-space:pre-wrap">' + esc(x.question) + '</div>'
        + (x.answer || x.status !== 'open' ? '<div class="w">Answer (' + esc(x.answeredBy) + '): ' + esc(x.answer || x.status) + '</div>' : '<div class="f" style="margin-top:6px"><textarea data-cc-ans="' + esc(x.id) + '" placeholder="Type in an answer that came by phone / e-mail"></textarea><button type="button" class="g" data-cc="aans" data-id="' + esc(x.id) + '">Save answer</button></div>') + '</div>';
    });
    return h3;
  }
  return '';
}
function val(id){ var e = D.getElementById(id); return e ? e.value : ''; }
function storeFiles(input, pid, kind){
  var fl = input && input.files ? Array.prototype.slice.call(input.files, 0, 8) : [];
  var st = G()._store; if (!fl.length) return Promise.resolve([]);
  if (typeof st !== 'function') return Promise.reject(new Error('The file storage is not ready — reload the page.'));
  return Promise.all(fl.map(function(f){ return st(f, pid).then(function(m){ return { ref: m.ref, name: m.name, kind: kind || 'other' }; }); }));
}
function busy(pr, okMsg){ return pr.then(function(j){ if (okMsg) toast(typeof okMsg === 'function' ? okMsg(j) : okMsg); return gLoad(); }, function(e){ toast(e.message, true); }); }
function saveMats(P, p){
  var w = work(P, p);
  return api({ action: 'cc-mats-save', projectId: p.id, lines: w.lines.map(function(l){ return { id: l.id, product: l.product, spec: l.spec, qty: l.qty, where: l.where, src: l.src, coId: l.coId }; }) })
    .then(function(j){ w.dirty = false; w.lines = arr(j.mats && j.mats.lines).map(function(l){ return { id: l.id, product: l.product, spec: l.spec, qty: l.qty, where: l.where, src: l.src, coId: l.coId, init: l.ok ? { initials: l.init.initials, sig: lineSig(l) } : null }; }); return mirror(p.id, j.raw).then(function(){ return j; }); });
}
D.addEventListener('input', function(e){
  var t = e.target; if (!t || !t.getAttribute || !t.closest || !t.closest('#gcgp')) return;
  var f = t.getAttribute('data-cc-f'); if (!f) return;
  var P = gP(), w = P.cc; if (!w) return; var l = w.lines[+t.getAttribute('data-cc-i')]; if (!l) return;
  l[f] = t.value; if (!w.dirty) { w.dirty = true; var sb = D.querySelector('#gcgp [data-cc="save"]'); if (sb) { sb.className = ''; sb.textContent = '💾 Save (changed)'; } }
}, true);
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('#gcgp [data-cc]') : null; if (!b) return;
  var P = gP(), p = proj(P.pid); if (!p) return;
  var a = b.getAttribute('data-cc'), id = b.getAttribute('data-id'), w = work(P, p);
  if (a === 'fill') { var have = {}; w.lines.forEach(function(l){ have[low(l.product) + '|' + low(l.spec)] = 1; }); var add = prefill(p).filter(function(l){ return !have[low(l.product) + '|' + low(l.spec)]; }); if (!add.length) return toast('Nothing new in the estimate / selections — add lines by hand.'); w.lines = w.lines.concat(add); w.dirty = true; gPaint(); return toast(add.length + ' material' + (add.length === 1 ? '' : 's') + ' added — check them and Save.'); }
  if (a === 'add') { w.lines.push({ product: '', spec: '', qty: '', where: '', src: 'PM' }); w.dirty = true; gPaint(); return; }
  if (a === 'del') { w.lines.splice(+b.getAttribute('data-i'), 1); w.dirty = true; gPaint(); return; }
  if (a === 'save') { if (w.lines.some(function(l){ return !s(l.product); })) return toast('Every line needs a product (or remove the empty line).', true); return busy(saveMats(P, p), 'Materials saved'); }
  if (a === 'sign') { var go = function(){ signMode(p.id); }; if (w.dirty) return saveMats(P, p).then(go, function(x){ toast(x.message, true); }); return go(); }
  if (a === 'send') { var send = function(){ return busy(api({ action: 'cc-mats-send', projectId: p.id, name: val('cc-sn'), email: val('cc-se') }), function(j){ return j.mailed ? 'Sent to ' + j.to.join(', ') + ' (office@ copied)' : 'Link made — e-mail did not go: ' + (j.mailError || ''); }); }; return w.dirty ? saveMats(P, p).then(send, function(x){ toast(x.message, true); }) : send(); }
  if (a === 'pdf' || a === 'file') { return api({ action: 'cc-file', projectId: p.id, id: id }).then(function(j){ try { W.open(j.url, '_blank', 'noopener'); } catch (x) {} }, function(x){ toast(x.message, true); }); }
  if (a === 'sdraft' || a === 'ssubmit') {
    if (!s(val('cc-si'))) return toast('What is the submittal for? (item)', true);
    return busy(storeFiles(D.getElementById('cc-sf'), p.id, val('cc-sk')).then(function(files){ return api({ action: 'cc-sub-save', projectId: p.id, spec: val('cc-ss'), item: val('cc-si'), desc: val('cc-sx'), due: val('cc-sd'), files: files, submit: a === 'ssubmit' }); }),
      function(j){ return a === 'ssubmit' ? 'Submittal #' + j.submittal.number + ' sent to the GC' + (j.mailed ? '' : ' (on their page — e-mail: ' + (j.mailError || 'not sent') + ')') : 'Draft saved'; });
  }
  if (a === 'ssend') return busy(api({ action: 'cc-sub-submit', projectId: p.id, id: id }), 'Sent to the GC');
  if (a === 'sresub') { var nf = D.createElement('input'); nf.type = 'file'; nf.multiple = true; nf.accept = 'application/pdf,image/*';
    var doIt = function(files){ return busy(api({ action: 'cc-sub-resubmit', projectId: p.id, id: id, files: files }), function(j){ return 'Resubmitted — rev ' + j.submittal.rev; }); };
    if (!W.confirm('Resubmit as the next revision? OK = pick the revised files (Cancel in the file picker keeps the same files).')) return;
    nf.onchange = function(){ storeFiles(nf, p.id, 'product').then(doIt, function(x){ toast(x.message, true); }); };
    nf.addEventListener('cancel', function(){ doIt([]); });
    nf.click(); return; }
  if (a === 'anew') {
    if (!s(val('cc-as')) || !s(val('cc-aq'))) return toast('Subject and question, please.', true);
    return busy(storeFiles(D.getElementById('cc-af'), p.id, 'other').then(function(files){ return api({ action: 'cc-appr-new', projectId: p.id, subject: val('cc-as'), question: val('cc-aq'), due: val('cc-ad'), files: files }); }), function(j){ return 'Approval request #' + j.approval.number + ' sent'; });
  }
  if (a === 'aans') { var ta = D.querySelector('[data-cc-ans="' + id + '"]'); if (!ta || !s(ta.value)) return toast('Type the answer.', true); return busy(api({ action: 'cc-appr-answer', projectId: p.id, id: id, answer: ta.value, decision: 'answered' }), 'Answer saved'); }
}, true);

/* ── 📱 sign mode on the PM's phone / tablet ─────────────────────────────────────────────────────────────────── */
function signMode(pid){
  var p = proj(pid); if (!p) return;
  css();
  var m = (gP().st && gP().pid === pid && gP().st.state && gP().st.state.mats) || mats(p) || {};
  var live = matsLive(m), pend = live.filter(function(l){ return !lineOk(l); });
  if (!live.length) { toast('Add the materials first (🧱 Materials → Save).', true); return; }
  if (!pend.length && matsSigned(m)) { toast('Every material is initialed and signed already.'); return; }
  var ov = D.createElement('div'); ov.id = 'gccc-sign'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  var gc = gcName(p), when = new Date().toLocaleString();
  ov.innerHTML = '<div class="gccc-dlg wide"><div style="font-size:18px;font-weight:800">🧱 Materials approval — ' + esc(p.name) + '</div><div class="gccc-m">' + esc([p.autoPO ? 'PO ' + p.autoPO : '', p.address, gc ? 'GC: ' + gc : ''].filter(Boolean).join(' · ')) + ' · ' + esc(when) + '</div>'
    + '<p>Superintendent: please check each material and write your initials in its box, then sign at the bottom.</p>'
    + live.map(function(l, i){ var ok = lineOk(l); return '<div class="gccc-line' + (ok ? ' ok' : '') + '"><div class="w"><b>' + (i + 1) + '. ' + esc(l.product) + '</b><div class="gccc-m">' + esc([l.spec, l.qty ? 'Qty ' + l.qty : '', l.where].filter(Boolean).join(' · ')) + '</div></div>'
      + (ok ? '<span class="gccc-m">✓ ' + esc(l.init.initials) + '</span>' : '<input type="text" class="ini" maxlength="5" autocapitalize="characters" aria-label="Initials for ' + esc(l.product) + '" data-ini="' + esc(l.id) + '" placeholder="Initials">') + '</div>'; }).join('')
    + '<label class="gccc-l" for="gccc-n">Superintendent\'s name</label><input type="text" id="gccc-n" maxlength="80" autocomplete="name">'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap"><div style="flex:1 1 200px"><label class="gccc-l" for="gccc-t">Title</label><input type="text" id="gccc-t" maxlength="60" value="Superintendent"></div><div style="flex:1 1 200px"><label class="gccc-l" for="gccc-c">Company</label><input type="text" id="gccc-c" maxlength="80" value="' + esc(gc) + '"></div></div>'
    + '<label class="gccc-l" for="gccc-e">E-mail (their signed copy)</label><input type="email" id="gccc-e" maxlength="120" value="' + esc((m.super || {}).email) + '">'
    + '<label class="gccc-l">Signature</label><canvas class="gccc-pad" id="gccc-pad" width="600" height="200" aria-label="Signature box"></canvas><button type="button" class="g" data-x="clr" style="margin-top:6px">Clear signature</button>'
    + '<label class="gccc-l" for="gccc-ph">Photo of the material labels (optional)</label><input type="file" id="gccc-ph" accept="image/*" capture="environment">'
    + '<div class="gccc-acts"><button type="button" class="g" data-x="close">Cancel</button><button type="button" data-x="sign">✍️ Initial &amp; sign</button></div><div id="gccc-msg" class="gccc-m" role="status"></div></div>';
  D.body.appendChild(ov);
  var c = D.getElementById('gccc-pad'), ctx = c.getContext('2d'), strokes = [], cur = null;
  function pt(e){ var r = c.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * 600 / r.width), Math.round((e.clientY - r.top) * 200 / r.height)]; }
  c.addEventListener('pointerdown', function(e){ e.preventDefault(); cur = [pt(e)]; strokes.push(cur); try { c.setPointerCapture(e.pointerId); } catch (x) {} });
  c.addEventListener('pointermove', function(e){ if (!cur) return; var q = pt(e), l = cur[cur.length - 1]; cur.push(q); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#0F1D2F'; ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(n){ c.addEventListener(n, function(){ cur = null; }); });
  ov.__strokes = strokes;
  var msg = function(t, bad){ var el = D.getElementById('gccc-msg'); if (el) { el.textContent = t; el.style.color = bad ? '#b91c1c' : '#166534'; el.style.fontWeight = '700'; } };
  ov.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('[data-x]') : null; if (!b) return;
    var x = b.getAttribute('data-x');
    if (x === 'close') return ov.remove();
    if (x === 'clr') { strokes.length = 0; ctx.clearRect(0, 0, 600, 200); return; }
    if (x !== 'sign') return;
    var ini = {}, miss = 0;
    Array.prototype.forEach.call(ov.querySelectorAll('[data-ini]'), function(i){ var v = s(i.value).toUpperCase(); ini[i.getAttribute('data-ini')] = v; if (v.replace(/[^A-Z]/g, '').length < 2) { miss++; i.style.borderColor = '#b91c1c'; } else i.style.borderColor = ''; });
    if (miss) return msg('Initials needed on ' + miss + ' material' + (miss === 1 ? '' : 's') + '.', true);
    var nm = s(val('gccc-n')); if (nm.length < 2) return msg('Type the superintendent\'s name.', true);
    if (!strokes.filter(function(z){ return z.length; }).length) return msg('Sign in the box.', true);
    b.disabled = true; msg('Saving…');
    var ph = D.getElementById('gccc-ph'), f = ph && ph.files && ph.files[0];
    var up = f && typeof G()._store === 'function' ? G()._store(f, pid).then(function(r){ return r.ref; }, function(){ return ''; }) : Promise.resolve('');
    up.then(function(photoRef){ return api({ action: 'cc-mats-sign', projectId: pid, initials: ini, name: nm, title: val('gccc-t'), company: val('gccc-c'), email: val('gccc-e'), strokes: strokes.filter(function(z){ return z.length; }), photoRef: photoRef }); })
      .then(function(j){
        if (j.already) { ov.remove(); toast('Already signed.'); return; }
        var so = j.signoff || {};
        return mirror(pid, j.raw).then(function(){ return so.pdfRef ? fileDoc(pid, { id: so.id, ref: so.pdfRef, at: so.at, name: so.name, fileName: so.fileName }).then(function(){ return api({ action: 'cc-filed', projectId: pid, ids: [so.id] }).catch(function(){}); }) : null; })
          .then(function(){ logOn(pid, { kind: 'materials', action: 'signed', by: myName(), at: nowIso(), reason: nm + ' initialed ' + so.lines + ' material(s) on site' }); ov.remove(); toast('✍️ Signed — the PDF is on the job\'s documents' + (j.mailed ? ' and e-mailed to ' + j.mailTo.join(', ') + ' (office@ copied)' : '') + '.'); if (gP().pid === pid) { gP().cc = null; gLoad(); } paintAll(); });
      }, function(err){ b.disabled = false; msg(err.message, true); });
  });
}

/* the patch-GCP panel's GC-job test: a commercial job is a GC job */
W._gcCommco = { isComm: isComm, cos: cosAll, hold: hold, gate: gate, mats: mats, blocked: blocked, guard: guard, blockNow: blockNow, check: check, open: open, signMode: signMode, pull: pull, gcpTabs: gcpTabs, gcpPane: pane, prefill: prefill, mirror: mirror, gcName: gcName,
  holdText: holdText, coHolds: coHolds, coNo: coNo, coNeedsSign: coNeedsSign, coSignLimit: coSignLimit, startGate: startGate, lineSig: lineSig, lineOk: lineOk, noMoney: noMoney, CC_BOOT: CC_BOOT,
  state: function(){ return { stats: stats, remote: REMOTE, pushed: PUSHED, ov: OV }; }, _paint: paintAll };
try { console.log('[GC] Commercial jobs: change orders signed, hold, materials approval, GC portal (patch COMMCO): _gcCommco.state()'); } catch (e) {}
})();
