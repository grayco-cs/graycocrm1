/* __GC_PATCH_AUTOCLAIMS__ ═══════════════════════════════════════════════════════════════════════════
   GrayCo — CLAIM & FIELD AUTOMATIONS in the CRM (patch AUTOCLAIMS). The rules are window.GCAC (the same file as
   netlify/functions/_lib/auto-claims.js, copied in above by tools/patch_AUTOCLAIMS.py); the clock-driven part is
   netlify/functions/claims-auto.js; the 2 AM "Today's plan" (morning digest) carries the same items (plan.js).

   8.  🔎 PERMITS & INSPECTIONS (on the Site Book's "Codes & permits" and the job inspections list of patch AUT3):
       permit status on the Site Book permit; a dated Site Book inspection goes on the schedule (internal); To-Do for the
       PM: "Tomorrow: …", "Today: …", and after the date "Passed / Failed / Rescheduled?" (a small corner card asks too);
       Failed → a To-Do to fix + reschedule (the same id the server uses) and the re-inspection date can be booked at once;
       📋 Open permits & inspections = the list of everything open (Site Book button, _gcAutoClaims.openList()).
   10. 💧 DRYING: every drying claim (equipment on site, drying not complete) → "Take moisture readings + photos (Day N)"
       on the To-Do of the mitigation tech / PM until today's readings are in; a missed day is flagged on the claim's
       Drying tab and on the To-Do (and in the morning digest). It ends with "Drying complete" (dry standard met).
   11. 🧾 FIELD SUPPLEMENTS (a claim tab): change orders, notes and GrayCo Photos tagged "supplement", items marked on the
       claim and field items added here, minus what is already on the imported Xactimate (carrier) estimate; tick / qty /
       reason per item; ⬇ CSV and ⬇ PDF for the adjuster. Stored on the claim (claim.fieldSupp), synced like the rest.
   12. 🛡 ADJUSTER NUDGES: drafted by the server into ✅ Approvals (kind claim_nudge); here the approval card says plainly
       that Approve sends it to the ADJUSTER from claims@ (never to the homeowner).
   Console: _gcAutoClaims.status() · .openList() · .tracker() · .drying() · .supp(claimId) · .answer(key, result, opts)
   ═══════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_AUTOCLAIMS__) return; W.__GC_PATCH_AUTOCLAIMS__ = true;
var AC = W.GCAC; if (!AC) { try { console.warn('[GC] AUTOCLAIMS: rules missing'); } catch (e) {} return; }
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var SI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function every(f, ms){ return SI.call(W, f, ms); }
var s = AC.s, low = AC.low, arr = AC.arr, esc = AC.esc, num = AC.num, clip = AC.clip;
function warn(e){ try { console.warn('[GC AUTOCLAIMS]', e); } catch (x) {} }
function nowIso(){ return new Date().toISOString(); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function crm(){ return W._crm || {}; }
function projects(){ return arr(crm().projects).filter(function(p){ return p.id && p.deleted !== true; }); }
function proj(pid){ pid = s(pid); return projects().filter(function(p){ return s(p.id) === pid; })[0] || null; }
function users(){ return arr(crm().users).filter(function(u){ return u.active !== false; }); }
function myEmail(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.email()) return low(W.__GC_AUTH__.email()); } catch (e) {} return ''; }
function myName(){ var e = myEmail(), u = users().filter(function(x){ return e && low(x.email) === e; })[0]; return u && u.name ? s(u.name) : (e ? e.split('@')[0] : 'Me'); }
function effRole(){ try { return s(W._gcRP && W._gcRP.role && W._gcRP.role()); } catch (e) { return ''; } }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function paused(){ try { return !!(W._gcPause && W._gcPause.state && W._gcPause.state().on); } catch (e) { return false; } }
function G(){ return W._gcClaims || null; }
function SB(){ try { return W._gcRP && W._gcRP.site ? W._gcRP.site() : null; } catch (e) { return null; } }
function pmEmailOf(p){ var n = low(p && p.pm); if (!n) return ''; var u = users().filter(function(x){ return low(x.name) === n || low(x.email) === n; })[0]; return low(u && u.email || (p && p.pmEmail)); }
function mineJob(p){ var n = low(myName()), e = myEmail(); if (!p) return false; return low(p.pm) === n || low(p.pm) === e || low(p.apm || p.assistantPm) === n || low(p.superintendent || p.super) === n; }
function toast(msg, bad){
  var t = D.createElement('div'); t.className = 'gcac-toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
  D.body.appendChild(t); later(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 3600);
}

/* ══ CSS ══ */
var CSS = '.gcac-ov{position:fixed;inset:0;z-index:99080;background:rgba(15,23,42,.5);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto;font-family:Inter,Arial,sans-serif}' +
  '.gcac-box{background:#fff;border-radius:14px;width:min(980px,100%);max-width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:16px 18px;color:#0f172a;box-sizing:border-box}' +
  '.gcac-box.sm{width:min(460px,100%)}.gcac-box h2{margin:0 0 4px;font-size:18px;color:#1B1452;display:flex;gap:8px;align-items:center}.gcac-box h2 .x{margin-left:auto}' +
  '.gcac-muted{color:#64748b;font-size:12.5px}.gcac-sec{margin:14px 0 0}.gcac-sec h3{font-size:14px;margin:0 0 6px;color:#1B1452}' +
  '.gcac-tbl{width:100%;border-collapse:collapse;font-size:13px}.gcac-tbl th{text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;padding:5px 6px;border-bottom:1px solid #e2e8f0}.gcac-tbl td{padding:6px;border-bottom:1px solid #f1f5f9;vertical-align:top}' +
  '.gcac-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}' +
  '.gcac-chip{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#3730a3;white-space:nowrap}.gcac-chip.bad{background:#fee2e2;color:#991b1b}.gcac-chip.warn{background:#fef3c7;color:#92400e}.gcac-chip.ok{background:#dcfce7;color:#166534}' +
  '.gcac-btn{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 11px;font-weight:700;font-size:13px;cursor:pointer;color:#1B1452;min-height:36px}.gcac-btn.pri{background:#1B1452;color:#fff;border-color:#1B1452}.gcac-btn.ok{background:#16a34a;border-color:#16a34a;color:#fff}.gcac-btn.bad{background:#dc2626;border-color:#dc2626;color:#fff}.gcac-btn.gold{background:#F2A51A;border-color:#F2A51A}' +
  '.gcac-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}.gcac-in{padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;min-width:0;max-width:100%;box-sizing:border-box}' +
  '.gcac-big{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.gcac-big .gcac-btn{min-height:52px;font-size:15px}' +
  '.gcac-flag{background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:10px;padding:10px 12px;margin:0 0 10px;font-size:13.5px;font-weight:600}.gcac-flag.ok{background:#f0fdf4;border-color:#86efac;color:#166534}' +
  '.gcac-corner{position:fixed;right:14px;bottom:14px;z-index:9990;background:#1B1452;color:#fff;border-radius:12px;padding:10px 12px;max-width:min(340px,calc(100vw - 28px));box-shadow:0 8px 24px rgba(0,0,0,.25);font:13px Arial,sans-serif;display:flex;gap:8px;align-items:center}' +
  '.gcac-corner button{border:0;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer}.gcac-corner .go{background:#F2A51A;color:#1B1452}.gcac-corner .no{background:transparent;color:#d8d4f5}' +
  '.gcac-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99090;background:#0f172a;color:#fff;padding:10px 16px;border-radius:10px;font:600 13.5px Arial,sans-serif;max-width:calc(100vw - 32px)}.gcac-toast.bad{background:#b91c1c}' +
  '.gcac-supp td input[type=number]{width:70px}.gcac-supp td input.r{width:100%;min-width:140px}.gcac-supp tr.off td{opacity:.55}' +
  '@media (max-width:640px){.gcac-big{grid-template-columns:1fr}.gcac-tbl.cards thead{display:none}.gcac-tbl.cards tr{display:block;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 8px;padding:6px}.gcac-tbl.cards td{display:block;border:0;padding:3px 4px}}';
function ensureCss(){ if (D.getElementById('gcac-css')) return; var st = D.createElement('style'); st.id = 'gcac-css'; st.textContent = CSS; D.head.appendChild(st); }
function modal(html, sm){
  ensureCss();
  var ov = D.createElement('div'); ov.className = 'gcac-ov'; ov.innerHTML = '<div class="gcac-box' + (sm ? ' sm' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
  D.body.appendChild(ov);
  var close = function(){ if (ov.parentNode) ov.parentNode.removeChild(ov); D.removeEventListener('keydown', key); };
  var key = function(e){ if (e.key === 'Escape') close(); };
  D.addEventListener('keydown', key);
  ov.addEventListener('click', function(e){ if (e.target === ov || (e.target.closest && e.target.closest('[data-gcac-x]'))) close(); });
  return { ov: ov, close: close };
}

/* ══ DATA ══ */
var JI_KEY = 'gc_job_inspections';
function jobIns(){ try { var v = JSON.parse(localStorage.getItem(JI_KEY) || '{}'); if (typeof v === 'string') v = JSON.parse(v); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
function jobInsSave(v){ try { localStorage.setItem(JI_KEY, JSON.stringify(v)); } catch (e) {} try { if (W._gcApplySync) W._gcApplySync(JI_KEY, v); } catch (e) {} try { if (W._supaUpsert) W._supaUpsert(JI_KEY, v); } catch (e) {} }
function sbAll(){ var b = SB(); try { return b && b.all ? b.all() : {}; } catch (e) { return {}; } }
function src(){ return { sitebook: sbAll(), jobInspections: jobIns(), projects: projects() }; }
function allInspections(){ return AC.inspections(src()); }
function findInsp(key){ return allInspections().filter(function(i){ return i.key === key; })[0] || null; }
/* the office To-Do store (the same list the server writes) */
function tasks(){ try { var v = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); if (typeof v === 'string') v = JSON.parse(v); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function tasksSave(l){ try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} }
function taskAdd(t){ var l = tasks(); if (l.some(function(x){ return x && x.id === t.id; })) return false; var at = nowIso(); l.push(Object.assign({}, t, { addedAt: at, updatedAt: at, addedBy: myName() + ' (Automations)' })); tasksSave(l); return true; }
function taskDone(id, why){ var l = tasks(), at = nowIso(), ch = false; l.forEach(function(t){ if (t && t.id === id && !t.done) { t.done = true; t.doneAt = at; t.updatedAt = at; t.doneBy = why || myName(); ch = true; } }); if (ch) tasksSave(l); return ch; }

/* ══ 8. INSPECTIONS: answer, reschedule, the schedule ══ */
/* change one inspection where it lives (the Site Book, or the job inspections list) */
function inspEdit(i, fn){
  if (i.src === 'sitebook') { var b = SB(); if (!b || !b.setIn) throw new Error('The Site Book is not loaded yet.'); b.setIn(i.pid, 'inspections', i.id, fn); return; }
  var m = jobIns(), l = arr(m[i.pid]).slice(); l.forEach(function(x){ if (x && s(x.id) === i.id) { fn(x); x.updatedAt = nowIso(); } }); m[i.pid] = l; jobInsSave(m);
}
function inspAdd(pid, srcKind, item){
  if (srcKind === 'sitebook') { var b = SB(); if (!b || !b.addTo) throw new Error('The Site Book is not loaded yet.'); b.addTo(pid, 'inspections', item); return; }
  var m = jobIns(); m[pid] = arr(m[pid]).concat([Object.assign({ id: 'INS' + Date.now().toString(36), label: item.type, done: false }, item)]); jobInsSave(m);
}
/* result: passed | failed | resched. opts: { date (the new date, for resched or the re-inspection), notes } */
function answer(key, result, opts){
  opts = opts || {}; var i = findInsp(key); if (!i) throw new Error('That inspection is not on the list any more.');
  var p = proj(i.pid) || {}, at = nowIso(), by = myName(), nd = s(opts.date);
  if (result === 'resched') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) throw new Error('Pick the new date.');
    inspEdit(i, function(x){ x.reschedLog = arr(x.reschedLog).concat([{ from: s(x.date), to: nd, at: at, by: by, notes: s(opts.notes) }]); x.date = nd; x.result = 'Scheduled'; if (i.src === 'jobins') x.done = false; x.answeredAt = at; x.answeredBy = by; });
    return { ok: true, text: '📅 Moved to ' + AC.niceDay(nd) + ' — the schedule follows' };
  }
  if (result === 'passed') {
    inspEdit(i, function(x){ x.result = 'Passed'; if (i.src === 'jobins') x.done = true; x.answeredAt = at; x.answeredBy = by; if (opts.notes) x.notes = s(opts.notes); });
    if (i.reinspOf) taskDone(AC.fixTodoId({ pid: i.pid, id: i.reinspOf }), by + ' (re-inspection passed)');
    return { ok: true, text: '✅ Passed — marked on the job' };
  }
  if (result === 'failed') {
    inspEdit(i, function(x){ x.result = 'Failed'; if (i.src === 'jobins') x.done = false; x.answeredAt = at; x.answeredBy = by; if (opts.notes) x.notes = s(opts.notes); });
    var fi = Object.assign({}, i, { notes: s(opts.notes) || i.notes });
    taskAdd(AC.fixTodo(fi, p, pmEmailOf(p), today()));
    if (/^\d{4}-\d{2}-\d{2}$/.test(nd)) { inspAdd(i.pid, i.src, { type: 'Re-inspection: ' + i.type.replace(/^Re-inspection:\s*/i, ''), date: nd, notes: 'After the failed ' + i.type + ' inspection of ' + AC.niceDay(i.date), result: 'Scheduled', reinspOf: i.id }); inspEdit(i, function(x){ x.rescheduledTo = nd; }); }
    return { ok: true, text: '❌ Failed — a To-Do to fix it' + (nd ? ' and the re-inspection on ' + AC.niceDay(nd) : ' and book the re-inspection') + ' is on ' + (s(p.pm) || 'the PM') + '’s list' };
  }
  throw new Error('Unknown answer');
}
function bookReinsp(key, date){
  var i = findInsp(key); if (!i) throw new Error('That inspection is not on the list any more.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s(date))) throw new Error('Pick the date.');
  inspAdd(i.pid, i.src, { type: 'Re-inspection: ' + i.type.replace(/^Re-inspection:\s*/i, ''), date: date, notes: 'After the failed ' + i.type + ' inspection of ' + AC.niceDay(i.date), result: 'Scheduled', reinspOf: i.id });
  inspEdit(i, function(x){ x.rescheduledTo = date; });
  return { ok: true, text: '📅 Re-inspection booked ' + AC.niceDay(date) };
}
/* the Site Book's result menu (patched to call this): the same rules as the dialog */
function sbResult(pid, id, value){
  var r = AC.normResult(value), key = 'sb:' + pid + ':' + id;
  if (r === 'failed' || r === 'resched') { later(function(){ askDialog(key, r); }, 0); return; }
  try { var b = SB(); b.setIn(pid, 'inspections', id, function(x){ x.result = value; if (r) { x.answeredAt = nowIso(); x.answeredBy = myName(); } }); if (r === 'passed') { var i = findInsp(key); if (i && i.reinspOf) taskDone(AC.fixTodoId({ pid: pid, id: i.reinspOf }), myName()); } } catch (e) { warn(e); }
}
/* the dialog: Passed / Failed / Rescheduled */
function askDialog(key, pre){
  var i = findInsp(key); if (!i) { toast('That inspection is not on the list any more.', true); return; }
  var p = proj(i.pid) || {};
  var m = modal('<h2>🔎 ' + esc(i.type) + ' inspection<button type="button" class="gcac-btn x" data-gcac-x aria-label="Close">✕</button></h2>' +
    '<div class="gcac-muted">' + esc(p.name || 'Job') + (p.address ? ' · ' + esc(p.address) : '') + ' · ' + esc(AC.niceDay(i.date) || 'no date') + '</div>' +
    '<p style="margin:12px 0 0;font-weight:700">How did it go?</p>' +
    '<div class="gcac-big"><button type="button" class="gcac-btn ok" data-r="passed">✅ Passed</button><button type="button" class="gcac-btn bad" data-r="failed">❌ Failed</button><button type="button" class="gcac-btn gold" data-r="resched">📅 Rescheduled</button></div>' +
    '<div data-more style="display:none"><label class="gcac-muted" data-dl>New date</label><div class="gcac-row"><input class="gcac-in" type="date" data-date min="' + today() + '"><input class="gcac-in" data-notes placeholder="What the inspector said (optional)" style="flex:1"></div>' +
    '<div class="gcac-row"><button type="button" class="gcac-btn pri" data-save>Save</button><span class="gcac-muted" data-hint></span></div></div>', true);
  var pick = '';
  function choose(r){
    pick = r; var more = m.ov.querySelector('[data-more]');
    if (r === 'passed') return save();
    more.style.display = '';
    m.ov.querySelector('[data-dl]').textContent = r === 'resched' ? 'New date (required)' : 'Re-inspection date (optional — book it now or later)';
    m.ov.querySelector('[data-hint]').textContent = r === 'failed' ? 'A To-Do "Fix + reschedule" goes to the PM.' : 'The schedule moves with it.';
    m.ov.querySelectorAll('[data-r]').forEach(function(b){ b.style.outline = b.getAttribute('data-r') === r ? '3px solid #1B1452' : ''; });
    try { m.ov.querySelector('[data-date]').focus(); } catch (e) {}
  }
  function save(){
    try { var r = answer(key, pick, { date: m.ov.querySelector('[data-date]').value, notes: m.ov.querySelector('[data-notes]').value }); m.close(); toast(r.text); repaint(); }
    catch (e) { toast(s(e && e.message) || 'Could not save', true); }
  }
  m.ov.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-r]'); if (b) choose(b.getAttribute('data-r')); if (e.target.closest && e.target.closest('[data-save]')) save(); });
  if (pre) choose(pre);
  return m;
}
function reinspDialog(key){
  var i = findInsp(key); if (!i) return;
  var m = modal('<h2>📅 Book the re-inspection<button type="button" class="gcac-btn x" data-gcac-x aria-label="Close">✕</button></h2><div class="gcac-muted">' + esc(i.type) + ' — ' + esc((proj(i.pid) || {}).name || '') + '</div>' +
    '<div class="gcac-row"><input class="gcac-in" type="date" data-date min="' + today() + '"><button type="button" class="gcac-btn pri" data-save>Book it</button></div>', true);
  m.ov.addEventListener('click', function(e){ if (e.target.closest && e.target.closest('[data-save]')) { try { var r = bookReinsp(key, m.ov.querySelector('[data-date]').value); m.close(); toast(r.text); repaint(); } catch (x) { toast(s(x.message), true); } } });
}
/* dated Site Book inspections → the schedule (internal; the job inspections list is already done by patch AUT3) */
var schedApplied = {};
function schedTick(){
  if (typeof W._setSchedule !== 'function' || !myEmail()) return;
  var rows = arr(crm().schedule), have = {}; rows.forEach(function(r){ if (r.id) have[r.id] = r; });
  var add = [], move = {}, t0 = AC.addDays(today(), -1);
  AC.inspections({ sitebook: sbAll() }).forEach(function(i){
    if (!i.date || i.result === 'cancelled') return;
    var p = proj(i.pid); if (!p) return;
    var row = AC.schedRow(i, p), r = have[row.id];
    if (!r) { if (i.date >= t0 && !schedApplied[row.id]) { schedApplied[row.id] = 1; add.push(Object.assign(row, { createdAt: nowIso() })); } }
    else if (s(r.date) !== i.date && !r.deleted) move[row.id] = i.date;
  });
  if (!add.length && !Object.keys(move).length) return;
  try { W._setSchedule(function(prev){ var l = Array.isArray(prev) ? prev : [], ids = {}; l.forEach(function(x){ if (x && x.id) ids[x.id] = 1; });
    return l.map(function(x){ return x && move[x.id] ? Object.assign({}, x, { date: move[x.id], updatedAt: nowIso() }) : x; }).concat(add.filter(function(x){ return !ids[x.id]; })); }); } catch (e) { warn(e); }
}

/* ══ the list of everything open ══ */
function tracker(){ return AC.openTracker(src(), today()); }
var STATE_CHIP = { ask: ['bad', 'Answer: passed / failed?'], failed: ['bad', 'Failed — fix + reschedule'], today: ['warn', 'Today'], tomorrow: ['warn', 'Tomorrow'], upcoming: ['', 'Scheduled'], undated: ['warn', 'No date yet'] };
function openList(){
  var T = tracker(), mineOnly = /^(Project Manager|Superintendent)$/i.test(effRole());
  function draw(){
    var ins = T.inspections.filter(function(i){ return !mineOnly || mineJob(proj(i.pid)); }), per = T.permits.filter(function(x){ return !mineOnly || mineJob(proj(x.pid)); });
    return '<h2>📋 Open permits & inspections<button type="button" class="gcac-btn x" data-gcac-x aria-label="Close">✕</button></h2>' +
      '<div class="gcac-row"><span class="gcac-muted">' + ins.length + ' inspection' + (ins.length === 1 ? '' : 's') + ' open · ' + per.length + ' permit' + (per.length === 1 ? '' : 's') + ' open</span><label class="gcac-muted" style="margin-left:auto"><input type="checkbox" data-mine' + (mineOnly ? ' checked' : '') + '> My jobs only</label></div>' +
      '<div class="gcac-sec"><h3>🔎 Inspections</h3>' + (ins.length ? '<div class="gcac-wrap"><table class="gcac-tbl cards"><thead><tr><th>Date</th><th>Job</th><th>Inspection</th><th>Where it stands</th><th>PM</th><th></th></tr></thead><tbody>' + ins.map(function(i){
        var ch = STATE_CHIP[i.state] || ['', i.state];
        var act = i.state === 'ask' ? '<button type="button" class="gcac-btn pri" data-ask="' + esc(i.key) + '">Answer</button>' : i.state === 'failed' ? '<button type="button" class="gcac-btn" data-reinsp="' + esc(i.key) + '">📅 Book re-inspection</button>' : '<button type="button" class="gcac-btn" data-ask="' + esc(i.key) + '">Result…</button>';
        return '<tr><td>' + esc(AC.niceDay(i.date) || '—') + '</td><td><b>' + esc(i.job) + '</b>' + (i.address ? '<div class="gcac-muted">' + esc(clip(i.address, 50)) + '</div>' : '') + '</td><td>' + esc(i.type) + '<div class="gcac-muted">' + (i.src === 'sitebook' ? 'Site Book' : 'Job inspections') + '</div></td><td><span class="gcac-chip ' + ch[0] + '">' + esc(ch[1]) + '</span></td><td>' + esc(i.pm || '—') + '</td><td>' + act + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="gcac-muted">Nothing open. 👍</p>') + '</div>' +
      '<div class="gcac-sec"><h3>🧾 Permits</h3>' + (per.length ? '<div class="gcac-wrap"><table class="gcac-tbl cards"><thead><tr><th>Job</th><th>Permit</th><th>Number</th><th>Jurisdiction</th><th>Status</th><th>PM</th></tr></thead><tbody>' + per.map(function(x){
        return '<tr><td><b>' + esc(x.job) + '</b></td><td>' + esc(x.type) + '</td><td>' + esc(x.number || '—') + '</td><td>' + esc(x.jurisdiction || '—') + '</td><td><span class="gcac-chip ' + (/need/i.test(x.status) ? 'warn' : '') + '">' + esc(x.status) + '</span>' + (x.expires ? '<div class="gcac-muted">expires ' + esc(AC.niceDay(x.expires)) + '</div>' : '') + '</td><td>' + esc(x.pm || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="gcac-muted">No open permits.</p>') + '</div>' +
      '<p class="gcac-muted">Add or change permits and inspections on the job’s Site Book → Codes & permits. Dated inspections are on the schedule; the PM is reminded the day before and asked for the result after.</p>';
  }
  var m = modal(draw());
  m.ov.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('[data-ask]'), r = e.target.closest && e.target.closest('[data-reinsp]');
    if (a) { m.close(); askDialog(a.getAttribute('data-ask')); } else if (r) { m.close(); reinspDialog(r.getAttribute('data-reinsp')); }
  });
  m.ov.addEventListener('change', function(e){ if (e.target.hasAttribute && e.target.hasAttribute('data-mine')) { mineOnly = e.target.checked; T = tracker(); m.ov.querySelector('.gcac-box').innerHTML = draw(); } });
  return m;
}

/* ══ 10. DRYING ══ */
function photoDays(c){ var out = []; try { var P = W._gcPhotos; if (P && typeof P.records === 'function') arr(P.records()).forEach(function(r){ if (!r.deleted && s(r.jobId) === s(c.projectId)) out.push(AC.ymd(r.takenAt || r.createdAt || r.at)); }); } catch (e) {} return out.filter(Boolean); }
function claims(){ try { return G() ? arr(G().list()) : []; } catch (e) { return []; } }
function drying(){ var t = today(); return claims().map(function(c){ var d = AC.dryingOf(c, t); if (d) { d.claim = c; d.project = proj(c.projectId) || {}; d.who = AC.dryingWho(c, d.project); } return d; }).filter(Boolean); }
function openClaim(id, tab){ try { if (W._gcIns4 && W._gcIns4.open) return W._gcIns4.open(id, tab); var A = G().open({ claimId: id }); if (A && A.S) { A.S.tab = tab; A.S.easy = false; A.render(true); } } catch (e) { warn(e); } }
function dryBanner(c){
  var d = AC.dryingOf(c, today()); if (!d) return AC.dryingComplete(c) ? '<div class="gcac-flag ok">✓ Drying complete ' + esc(AC.niceDay(c.drying.completeAt)) + ' — the daily reading reminders have stopped.</div>' : '';
  return (d.missed.length ? '<div class="gcac-flag" data-gcac-drymiss>' + esc(AC.missedText(d)) + '.</div>' : '') +
    '<div class="gcac-flag' + (d.loggedToday ? ' ok' : '') + '">' + (d.loggedToday ? '✓ Day ' + d.day + ': today’s readings are in.' : '💧 Day ' + d.day + ' of drying: take today’s moisture readings + photos.') + ' <span class="gcac-muted">Reminders stop when you press “Drying complete” (dry standard met).</span></div>';
}

/* ══ TO-DO (patch TD2 reads window._gcTodoExt) ══ */
function todoItems(){
  var out = [], t = today(), me = myName();
  drying().forEach(function(d){
    var p = d.project, title = s(p.name) || s(d.claim.insured) || 'drying job', who = d.who.length ? d.who : [s(p.pm)].filter(Boolean);
    var go = { l: '💧 Drying log', f: function(){ openClaim(d.claimId, 'drying'); } };
    if (!d.loggedToday) out.push({ key: 'acdry:' + d.claimId + ':' + t, thing: 'acdry|' + d.claimId, cat: 'jobs', prio: d.missed.length ? 'high' : 'med', pid: d.pid, due: t, title: AC.dryingTitle(d, title), sub: d.onsite + ' piece(s) of equipment on site · until drying is marked complete', who: who, vis: who.length ? 'who' : 'company', act: go });
    if (d.missed.length) out.push({ key: 'acdrymiss:' + d.claimId + ':' + d.missed[d.missed.length - 1], thing: 'acdrymiss|' + d.claimId, cat: 'jobs', prio: 'high', pid: d.pid, due: d.missed[d.missed.length - 1], title: '⚠ Missed drying readings — ' + clip(title, 60), sub: AC.missedText(d), who: who, vis: who.length ? 'who' : 'company', act: go });
  });
  var IA = AC.inspActions(allInspections(), t);
  function insItem(i, kind){
    var p = proj(i.pid); if (!p || (kind !== 'ask' && AC.jobClosed(p))) return;
    var who = [s(p.pm)].filter(Boolean);
    var o = { thing: 'acinsp|' + i.key, cat: 'jobs', pid: i.pid, due: i.date, who: who, vis: who.length ? 'who' : 'company' };
    if (kind === 'ask') out.push(Object.assign(o, { key: 'acinspq:' + i.key + ':' + i.date, prio: 'high', title: '🔎 Passed / Failed / Rescheduled? ' + i.type + ' inspection (' + AC.niceDay(i.date) + ') — ' + clip(p.name, 60), sub: 'Answer it: a fail puts a fix + reschedule To-Do on the list', act: { l: '✅ Answer', f: function(){ askDialog(i.key); } } }));
    else out.push(Object.assign(o, { key: 'acinsp' + kind[0] + ':' + i.key + ':' + i.date, prio: 'med', title: '🔎 ' + (kind === 'today' ? 'Today' : 'Tomorrow') + ': ' + i.type + ' inspection — ' + clip(p.name, 60), sub: 'Work ready, permit card posted, someone to let the inspector in', act: { l: '📒 Site Book', f: function(){ try { var b = SB(); if (b && b.open) b.open(i.pid, 'codes'); else if (W._setView) W._setView('sitebook'); } catch (e) { warn(e); } } } }));
  }
  IA.remind.forEach(function(i){ insItem(i, 'tomorrow'); }); IA.today.forEach(function(i){ insItem(i, 'today'); }); IA.ask.forEach(function(i){ insItem(i, 'ask'); });
  return out;
}
var TODO_C = { sig: '', v: [] };
function sig(){
  var cl = claims(), m = ''; cl.forEach(function(c){ var u = s(c.updatedAt); if (u > m) m = u; });
  var sb = ''; try { sb = JSON.stringify(sbAll()).length + ''; } catch (e) {}
  var ji = ''; try { ji = (localStorage.getItem(JI_KEY) || '').length + ''; } catch (e) {}
  return cl.length + '|' + m + '|' + sb + '|' + ji + '|' + projects().length + '|' + nowIso().slice(0, 13) + '|' + myEmail();
}
W._gcTodoExt = Array.isArray(W._gcTodoExt) ? W._gcTodoExt : []; W._gcTodoExt.push(function(){ try { var g = sig(); if (g !== TODO_C.sig) TODO_C = { sig: g, v: todoItems() }; return TODO_C.v; } catch (e) { warn(e); return []; } });

/* the corner card: the PM's inspections waiting for an answer (once a session, non-blocking, dismissible) */
var cornerSeen = {};
function corner(){
  if (!myEmail() || D.hidden) return;
  var mine = AC.inspActions(allInspections(), today()).ask.filter(function(i){ var p = proj(i.pid); return p && (mineJob(p) || (isAdmin() && !s(p.pm))); }).filter(function(i){ return !cornerSeen[i.key]; });
  var el = D.getElementById('gcac-corner');
  if (!mine.length) { if (el) el.remove(); return; }
  if (el) return;
  ensureCss(); el = D.createElement('div'); el.id = 'gcac-corner'; el.className = 'gcac-corner'; el.setAttribute('role', 'status');
  var i = mine[0], p = proj(i.pid) || {};
  el.innerHTML = '<span>🔎 <b>' + esc(i.type) + '</b> inspection ' + esc(AC.niceDay(i.date)) + ' — ' + esc(clip(p.name, 40)) + (mine.length > 1 ? ' (+' + (mine.length - 1) + ' more)' : '') + ': passed, failed or rescheduled?</span><button type="button" class="go">Answer</button><button type="button" class="no" aria-label="Later">Later</button>';
  el.querySelector('.go').addEventListener('click', function(){ el.remove(); askDialog(i.key); });
  el.querySelector('.no').addEventListener('click', function(){ mine.forEach(function(x){ cornerSeen[x.key] = 1; }); el.remove(); });
  D.body.appendChild(el);
}

/* ══ 11. FIELD SUPPLEMENTS (a claim tab) ══ */
function claimById(id){ try { return G().get(id); } catch (e) { return null; } }
function suppItems(c){
  var p = proj(c.projectId) || {}, photos = [];
  try { var P = W._gcPhotos; if (P && typeof P.records === 'function') photos = arr(P.records()).filter(function(r){ return !r.deleted && s(r.jobId) === s(c.projectId); }); } catch (e) {}
  var notes = []; try { var r = sbAll()[s(c.projectId)]; arr(r && r.logs).concat(arr(r && r.dailyLogs)).forEach(function(l){ if (l && !l.deleted) notes.push({ id: 'sbl:' + s(l.id), text: [s(l.work), s(l.delays), s(l.notes)].filter(Boolean).join('\n'), at: s(l.date || l.createdAt), by: s(l.by), photos: arr(l.photos) }); }); } catch (e) {}
  return AC.suppCollect({ claim: c, project: p, changeOrders: arr(crm().changeOrders), photos: photos, notes: notes });
}
function mutate(id, fn){ return G().update(id, fn); }
function fsMark(id, key, patch){ return mutate(id, function(x){ x.fieldSupp = Object.assign({}, x.fieldSupp || {}); var m = Object.assign({}, x.fieldSupp.marks || {}); m[key] = Object.assign({}, m[key] || {}, patch, { by: myName(), at: nowIso() }); x.fieldSupp.marks = m; x.fieldSupp.updatedAt = nowIso(); }); }
function fsAdd(id, item){ return mutate(id, function(x){ x.fieldSupp = Object.assign({}, x.fieldSupp || {}); x.fieldSupp.items = arr(x.fieldSupp.items).concat([Object.assign({ id: 'FS' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: nowIso(), by: myName() }, item)]); x.fieldSupp.updatedAt = nowIso(); }); }
function fsLog(id, kind, n){ return mutate(id, function(x){ x.fieldSupp = Object.assign({}, x.fieldSupp || {}); x.fieldSupp.exports = arr(x.fieldSupp.exports).concat([{ at: nowIso(), by: myName(), kind: kind, items: n }]).slice(-50); }); }
var lastA = null;
function suppTab(A, c){
  lastA = A; ensureCss();
  var items = suppItems(c), inc = items.filter(function(x){ return x.include; }), lines = AC.carrierLines(c);
  var ex = arr((c.fieldSupp || {}).exports).slice(-1)[0];
  return '<div class="gcbb-panel gcac-supp" data-gcac-supp="' + esc(c.id) + '"><h3>🧾 Field supplements<span class="gcbb-sp"></span><span class="gcbb-tag ' + (inc.length ? 'warn' : 'ok') + '">' + inc.length + ' item' + (inc.length === 1 ? '' : 's') + ' to request</span></h3>' +
    '<p class="gcac-muted">Collected by itself from what was added in the field — change orders, notes and photos tagged <b>supplement</b>, items marked on the claim, and items added below — and checked against the imported Xactimate estimate' + (lines.length ? ' (' + lines.length + ' carrier lines)' : ' (<b>no carrier estimate imported yet</b>: nothing can be checked off)') + '. Untick what should not go to the adjuster.</p>' +
    (items.length ? '<div class="gcac-wrap"><table class="gcac-tbl cards"><thead><tr><th>Ask</th><th>Item</th><th>Reason</th><th>Qty</th><th>Photos</th><th>From</th></tr></thead><tbody>' + items.map(function(x){
      return '<tr class="' + (x.include ? '' : 'off') + '"><td><input type="checkbox" aria-label="Include" data-fs-inc="' + esc(x.key) + '"' + (x.include ? ' checked' : '') + '></td><td><b>' + esc(x.item) + '</b>' + (x.onEstimate ? '<div><span class="gcac-chip ok">looks like it is on the estimate</span></div>' : '') + '</td>' +
        '<td><input class="gcac-in r" data-fs-reason="' + esc(x.key) + '" value="' + esc(x.reason) + '" aria-label="Reason"></td><td><input class="gcac-in" type="number" min="0" step="any" data-fs-qty="' + esc(x.key) + '" value="' + esc(x.qty) + '" aria-label="Quantity"> ' + esc(x.unit) + '</td>' +
        '<td>' + (x.photos.length ? '📷 ' + x.photos.length : '<span class="gcac-muted">none</span>') + '</td><td class="gcac-muted">' + esc(x.src) + (x.at ? '<br>' + esc(AC.niceDay(x.at)) : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="gcac-muted">Nothing yet. Tag a note or a GrayCo photo with <b>#supplement</b>, mark items on the claim, or add one below.</p>') +
    '<form data-fs-add class="gcac-row"><input class="gcac-in" name="item" placeholder="Item found in the field (e.g. Replace rotted roof decking)" required style="flex:2 1 220px"><input class="gcac-in" name="reason" placeholder="Reason" style="flex:2 1 180px"><input class="gcac-in" name="qty" type="number" min="0" step="any" placeholder="Qty" style="width:80px"><input class="gcac-in" name="unit" placeholder="Unit" style="width:70px"><button class="gcac-btn">+ Add item</button></form>' +
    '<div class="gcac-row"><button type="button" class="gcac-btn pri" data-fs-csv>⬇ CSV for the adjuster</button><button type="button" class="gcac-btn" data-fs-pdf>⬇ PDF for the adjuster</button>' + (ex ? '<span class="gcac-muted">last export ' + esc(ex.kind) + ' ' + esc(AC.niceDay(ex.at)) + ' by ' + esc(ex.by) + '</span>' : '') + '</div>' +
    '<p class="gcac-muted">To send it: the Compare / supplement builder prepares the e-mail, which waits for approval. Nothing here is sent by itself.</p></div>';
}
function dl(name, blob){ var a = D.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; D.body.appendChild(a); a.click(); later(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function fname(c, ext){ return ('Supplement items - ' + (s(c.claimNumber) ? 'claim ' + s(c.claimNumber) : s(c.insured) || 'claim') + ' - ' + today()).replace(/[^\w .#()-]+/g, '-') + '.' + ext; }
function exportCsv(id){ var c = claimById(id); if (!c) return; var items = suppItems(c), n = items.filter(function(x){ return x.include; }).length; dl(fname(c, 'csv'), new Blob([AC.suppCsv(items, { claimNumber: c.claimNumber, insured: c.insured })], { type: 'text/csv' })); fsLog(id, 'CSV', n); return n; }
function exportPdf(id){
  var c = claimById(id); if (!c) return Promise.resolve(0); var E = G().ext, items = suppItems(c).filter(function(x){ return x.include; });
  var o = { title: 'Supplement items', subtitle: [s(c.claimNumber) ? 'Claim #' + s(c.claimNumber) : '', s(c.insured), today()].filter(Boolean).join(' · '), blocks: [
    { kv: [['Insured', s(c.insured) || '—'], ['Loss address', s(c.address || (proj(c.projectId) || {}).address) || '—'], ['Claim #', s(c.claimNumber) || '—'], ['Items', String(items.length)]] },
    { h: 'Items found in the field (not on the estimate)' },
    { table: { cols: [{ l: '#', w: 24 }, { l: 'Item', w: 200 }, { l: 'Reason', w: 200 }, { l: 'Qty', w: 50, align: 'right' }, { l: 'Photos', w: 50, align: 'right' }], rows: items.map(function(x, k){ return { cells: [String(k + 1), x.item, x.reason, x.qty + ' ' + x.unit, String(x.photos.length)], sub: x.photos.length ? ['Photos: ' + x.photos.map(function(ph){ return s(ph.name || ph.ref || ph.id); }).join(', ')] : [] }; }) } },
    { p: 'Photos are in the claim file and can be sent with this list. Please review and let us know if you need anything else.', size: 9.5 } ] };
  return (E.logoJpeg ? E.logoJpeg().catch(function(){ return null; }) : Promise.resolve(null)).then(function(logo){ var bytes = E.pdfReport(o, logo); dl(fname(c, 'pdf'), new Blob([bytes], { type: 'application/pdf' })); return fsLog(id, 'PDF', items.length); }).then(function(){ return items.length; });
}
function wireSupp(){
  D.addEventListener('change', function(e){
    var t = e.target; if (!t || !t.closest) return; var box = t.closest('[data-gcac-supp]'); if (!box) return; var id = box.getAttribute('data-gcac-supp'), k;
    var re = function(){ if (lastA) lastA.render(true); };
    if ((k = t.getAttribute('data-fs-inc'))) fsMark(id, k, { include: t.checked }).then(re, warn);
    else if ((k = t.getAttribute('data-fs-qty'))) fsMark(id, k, { qty: num(t.value) }).then(re, warn);
    else if ((k = t.getAttribute('data-fs-reason'))) fsMark(id, k, { reason: s(t.value) }).then(re, warn);
  });
  D.addEventListener('submit', function(e){
    var f = e.target; if (!f || !f.hasAttribute || !f.hasAttribute('data-fs-add')) return; e.preventDefault();
    var box = f.closest('[data-gcac-supp]'), id = box && box.getAttribute('data-gcac-supp'); if (!id) return;
    var v = {}; Array.prototype.forEach.call(f.elements, function(el){ if (el.name) v[el.name] = el.value; });
    if (!s(v.item)) return;
    fsAdd(id, { item: s(v.item), reason: s(v.reason) || 'Found during the work', qty: num(v.qty) || 1, unit: s(v.unit).toUpperCase() || 'EA' }).then(function(){ toast('✓ Added to the supplement list'); if (lastA) lastA.render(true); }, function(x){ toast(s(x && x.message) || 'Could not save', true); });
  });
  D.addEventListener('click', function(e){
    var t = e.target; if (!t || !t.closest) return; var box = t.closest('[data-gcac-supp]'); if (!box) return; var id = box.getAttribute('data-gcac-supp');
    if (t.closest('[data-fs-csv]')) { var n = exportCsv(id); toast('⬇ CSV with ' + n + ' item' + (n === 1 ? '' : 's')); }
    if (t.closest('[data-fs-pdf]')) exportPdf(id).then(function(n){ toast('⬇ PDF with ' + n + ' item' + (n === 1 ? '' : 's')); }, function(x){ warn(x); toast('Could not make the PDF', true); });
  });
}

/* ══ 12. the approval card of an adjuster nudge says who gets it ══ */
function hookSay(){
  var f = W._gcApprSay; if (typeof f !== 'function' || f.__gcac) return !!(f && f.__gcac);
  var g = function(x, last){
    if (x && x.kind === 'claim_nudge') { var to = s(x.to), what = 'sends this follow-up to the ADJUSTER' + (to ? ' (' + to + ')' : '') + ' from claims@grayco-cs.com: “' + s(x.subject) + '” — never to the homeowner'; return 'Approve ' + what + '. Edit it first if you like. Don’t approve: nothing is sent.'; }
    return f.apply(this, arguments);
  };
  g.__gcac = true; W._gcApprSay = g; if (W._gcApptConf) W._gcApptConf.say = g; return true;
}

/* ══ HOOK UP: the claim tabs, the drying banner ══ */
function hookClaims(){
  var g = G(); if (!g || !g.ext || !g.ext.P2TABS) return false;
  var T = g.ext.P2TABS;
  if (!T.fsupp) T.fsupp = function(A, c){ try { return suppTab(A, c); } catch (e) { warn(e); return '<div class="gcbb-err">' + esc(e && e.message) + '</div>'; } };
  if (T.drying && !T.drying.__gcac) { var od = T.drying; T.drying = function(A, c){ var b = ''; try { ensureCss(); b = dryBanner(c); } catch (e) { warn(e); } return b + od.apply(this, arguments); }; T.drying.__gcac = true; }
  W._gcIns4 = W._gcIns4 || {};
  if (!W._gcIns4.tabs || !W._gcIns4.tabs.__gcac) {
    var prev = W._gcIns4.tabs;
    var tf = function(tabs, c, A){ tabs = typeof prev === 'function' ? prev(tabs, c, A) : tabs; if (tabs.some(function(t){ return t[0] === 'fsupp'; })) return tabs; var n = 0; try { n = suppItems(c).filter(function(x){ return x.include; }).length; } catch (e) {} var at = tabs.map(function(t){ return t[0]; }).indexOf('estimate'); var t2 = tabs.slice(); t2.splice(at >= 0 ? at + 1 : t2.length, 0, ['fsupp', '🧾 Field supplements' + (n ? ' (' + n + ')' : '')]); return t2; };
    tf.__gcac = true; W._gcIns4.tabs = tf;
  }
  return true;
}
var hooked = false;
(function tryHook(n){ if (hookClaims()) { hooked = true; return; } if (n < 300) later(function(){ tryHook(n + 1); }, 400); })(0);
(function trySay(n){ if (hookSay()) return; if (n < 200) later(function(){ trySay(n + 1); }, 500); })(0);
wireSupp();

function repaint(){ TODO_C.sig = ''; try { if (W._gcTodoRefresh) W._gcTodoRefresh(); } catch (e) {} try { var b = SB(); if (b && b.draw) b.draw(true); } catch (e) {} }
every(function(){ if (D.hidden) return; try { schedTick(); } catch (e) { warn(e); } try { corner(); } catch (e) { warn(e); } }, 15000);
later(function(){ try { schedTick(); corner(); } catch (e) { warn(e); } }, 9000);

W._gcAutoClaims = {
  status: function(){ var T = tracker(); return { hooked: hooked, inspectionsOpen: T.counts.inspections, toAnswer: T.counts.ask, failed: T.counts.failed, permitsOpen: T.counts.permits, drying: drying().length, paused: paused() }; },
  openList: openList, tracker: tracker, inspections: allInspections, answer: answer, bookReinsp: bookReinsp, ask: askDialog, sbResult: sbResult, schedTick: schedTick,
  drying: drying, dryBanner: dryBanner, supp: function(id){ var c = claimById(id); return c ? suppItems(c) : []; }, csv: function(id){ var c = claimById(id); return c ? AC.suppCsv(suppItems(c), { claimNumber: c.claimNumber, insured: c.insured }) : ''; },
  exportCsv: exportCsv, exportPdf: exportPdf, todoItems: todoItems, corner: corner, rules: AC
};
try { console.log('[GC] Claim & field automations (patch AUTOCLAIMS) — _gcAutoClaims.status()'); } catch (e) {}
})();
