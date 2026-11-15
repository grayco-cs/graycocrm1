/* __GC_PATCH_SUBCONFIRM__ — 👷 CONFIRM SUBS ON JOBS (owner's sub portal plan, 11/15 list item 5.1: "a one-tap 'confirm these subs on
   these jobs' list — existing links are offered once, never auto-added; adding a sub to a job / bid is the only thing that decides which
   jobs a sub sees").
   • The links the CRM already has between a sub (a CRM sub record) and a job they are NOT on yet (job.subs):
       🧾 a sub invoice on the job (Sub Invoices) · 📝 a sub agreement stored on the job · 📅 a company-schedule item for the job with
       that sub as the vendor.
   • ✅ admins + the office get ONE To-Do "👷 N subs to confirm on their jobs" → 👷 Confirm them: the list by job, each sub with why,
     ticked; "✓ Put the ticked subs on their jobs" adds them to the job as Awarded (the CRM's own job save; via "confirmed — invoice /
     agreement / schedule"); "Not on this job" is remembered (gc_kv gc_subconfirm_no) and never offered again. Nothing is added by
     itself. A sub on the job sees it in their portal (portal-access: job.subs) — that is the only door.
   API: window._gcSubConfirmSheet() · window._gcSubConfirm = { list(), add(pairs), no(pid, subId), sweep() } */
(function(W){
'use strict';
if (W.__GC_PATCH_SUBCONFIRM__) return; W.__GC_PATCH_SUBCONFIRM__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
var NOKEY = 'gc_subconfirm_no';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function norm(v){ return low(v).replace(/\b(llc|inc|co|corp|company|the|ltd)\b/g, '').replace(/[^a-z0-9]+/g, ''); }
function crm(){ return W._crm || {}; }
function me(){ try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return s(u.name) || s(u.email); } catch (e) { return ''; } }
function office(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /admin|office/i.test(s(u.role) + ' ' + s(u.profile)) || /owner/i.test(s(u.payType)); } catch (e) { return false; } }
function subs(){ var seen = {}, out = []; arr(crm().subs).concat(arr(crm().vendors)).forEach(function(r){ if (!r.id || seen[r.id]) return; if (!(r.isSub === true || (r.isSub === undefined && (r.trade || r.cat === 'Sub')))) return; seen[r.id] = 1; out.push(r); }); return out; }
function subOf(id, name){ var L = subs(), n = norm(name); return (s(id) && L.find(function(r){ return s(r.id) === s(id); })) || (n && L.find(function(r){ return norm(r.name) === n || norm(r.company) === n; })) || null; }
function onJob(p, sub){ return arr(p.subs).some(function(r){ return (s(r.subId) && s(r.subId) === s(sub.id)) || (norm(r.name) && (norm(r.name) === norm(sub.name) || norm(r.name) === norm(sub.company))); }); }
/* the "Not on this job" answers */
var NO = null, PULLED = false;
function noMap(){ if (NO) return NO; try { NO = JSON.parse(localStorage.getItem(NOKEY) || '{}') || {}; } catch (e) { NO = {}; } return NO; }
function pull(){
  if (PULLED) return; PULLED = true;
  try { var u = (localStorage.getItem('grayco_sb_url') || '').replace(/\/$/, ''), k = localStorage.getItem('grayco_sb_key') || ''; if (!u || !k) return;
    W.fetch(u + '/rest/v1/gc_kv?key=eq.' + NOKEY + '&select=value', { headers: { apikey: k, Authorization: 'Bearer ' + k }, cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; }).then(function(rows){
      if (!Array.isArray(rows) || !rows[0]) return; var v = rows[0].value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } }
      var m = noMap(); Object.keys(v || {}).forEach(function(k2){ if (!m[k2]) m[k2] = v[k2]; }); try { localStorage.setItem(NOKEY, JSON.stringify(m)); } catch (e) {} });
  } catch (e) {}
}
function no(pid, subId){ var m = noMap(); m[s(pid) + '|' + s(subId)] = { at: new Date().toISOString(), by: me() }; try { localStorage.setItem(NOKEY, JSON.stringify(m)); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u(NOKEY, m); } catch (e) {} }
/* the list: [{ pid, job, subId, sub, trade, why: [..] }] */
function list(){
  pull();
  var P = arr(crm().projects).filter(function(p){ return p.id && !p.deleted && !p.mergedInto; }), byId = {}; P.forEach(function(p){ byId[s(p.id)] = p; });
  var out = {}, m = noMap();
  function add(pid, sub, why){
    var p = byId[s(pid)]; if (!p || !sub || onJob(p, sub) || m[s(pid) + '|' + s(sub.id)]) return;
    var k = s(pid) + '|' + s(sub.id); var x = out[k] || (out[k] = { pid: s(pid), job: p, subId: s(sub.id), sub: sub, trade: s(sub.trade), why: [] });
    if (x.why.indexOf(why) < 0 && x.why.length < 4) x.why.push(why);
  }
  var seenInv = {};
  arr(crm().invoices).concat(arr(crm().invs)).forEach(function(i){ if (seenInv[i.id] || !s(i.pid) || i.deleted || /void/i.test(s(i.status))) return; seenInv[i.id] = 1; if (!(s(i.type) === 'sub' || s(i.sub) || s(i.subId))) return; var sb = subOf(i.subId, i.sub || i.vendor); if (sb) add(i.pid, sb, '🧾 sub invoice' + (s(i.invNum) ? ' #' + s(i.invNum) : '')); });
  P.forEach(function(p){ arr(p.subAgreements).forEach(function(a){ if (a.deleted) return; var sb = subOf(a.subId, a.sub || a.subName); if (sb) add(p.id, sb, '📝 sub agreement'); }); });
  arr(crm().schedule).forEach(function(x){ if (!s(x.pid) || x.deleted || /^sub portal$/i.test(s(x.source))) return; var sb = subOf(x.subId, x.vendor); if (sb) add(x.pid, sb, '📅 on the schedule' + (s(x.date) ? ' ' + s(x.date).slice(5).replace('-', '/') : '')); });
  return Object.keys(out).map(function(k){ return out[k]; }).sort(function(a, b){ return s(a.job.name).localeCompare(s(b.job.name)) || s(a.sub.name).localeCompare(s(b.sub.name)); });
}
/* put them on their jobs (the CRM's own job save: idb → screen → cloud, a person's edit) */
function add(pairs){
  pairs = arr(pairs); if (!pairs.length) return Promise.resolve(0);
  return Promise.resolve(W.idbGet ? W.idbGet('projects') : null).then(function(L){
    L = arr(L).length ? arr(L) : arr(crm().projects);
    var at = new Date().toISOString(), n = 0, by = me();
    var outL = L.map(function(p){
      var mine = pairs.filter(function(x){ return s(x.pid) === s(p.id); }); if (!mine.length) return p;
      var q = Object.assign({}, p), rows = arr(p.subs).slice();
      mine.forEach(function(x){ var sb = subOf(x.subId); if (!sb || onJob({ subs: rows }, sb)) return; rows.push({ id: 'SR' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: s(sb.company || sb.name), trade: s(x.trade || sb.trade), status: 'Awarded', subId: s(sb.id), addedAt: at, addedBy: by, via: 'confirmed — ' + (Array.isArray(x.why) ? x.why : []).map(function(w){ return s(w).replace(/^\S+\s/, ''); }).join(', ') }); n++; });
      q.subs = rows; q.updatedAt = at; return q;
    });
    if (!n) return 0;
    try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('subs confirmed on jobs'); } catch (e) {}
    return Promise.resolve(W.idbSet ? W.idbSet('projects', outL) : null).then(function(){
      try { if (W._setProjects) W._setProjects(outL.slice()); } catch (e) {}
      try { if (W._crm) W._crm.projects = outL; } catch (e) {}
      try { var f = W._supaUpsertNow || W._supaUpsert; if (f) f('projects', outL); } catch (e) {}
      ST.call(W, function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} sweep(); }, 2000);
      return n;
    });
  });
}
function tasks(){ try { var l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function saveTasks(l){ try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {} }
function sweep(){
  try {
    if (!office() || !arr(crm().projects).length) return -1;
    var n = list().length, l = tasks(), t = l.find(function(x){ return x && x.id === 'SUBCONFIRM'; }), now = new Date().toISOString(), lab = '👷 ' + n + ' sub' + (n === 1 ? '' : 's') + ' to confirm on their jobs', ch = false;
    if (n && !t) { l.push({ id: 'SUBCONFIRM', kind: 'sub_confirm', label: lab, note: 'The CRM sees these subs on jobs (a sub invoice, an agreement or the schedule) but they are not on the job yet. A sub only sees a job in their portal once they are on it. One tap to confirm, or "Not on this job".', addedBy: 'CRM', addedAt: now, updatedAt: now, done: false }); ch = true; }
    else if (t && n && (t.done || t.label !== lab)) { t.label = lab; t.done = false; t.updatedAt = now; ch = true; }
    else if (t && !n && !t.done) { t.done = true; t.doneAt = t.updatedAt = now; t.resolution = 'all confirmed'; ch = true; }
    if (ch) saveTasks(l);
    return n;
  } catch (e) { return -1; }
}
W._gcSubConfirmSheet = function(){
  var old = D.getElementById('gc-sc-ov'); if (old) old.remove();
  var L = list(), by = {}; L.forEach(function(x){ (by[x.pid] = by[x.pid] || []).push(x); });
  var ov = D.createElement('div'); ov.id = 'gc-sc-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483400;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:12px;font:14px Inter,Arial,sans-serif';
  var h = '<div role="dialog" aria-label="Confirm subs on jobs" style="background:#fff;color:#0f172a;border-radius:14px;width:min(820px,100%);max-height:90vh;overflow:auto;padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:17px">👷 Confirm subs on jobs (' + L.length + ')</b><button type="button" data-sc="x" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer">Close</button></div>'
    + '<div style="color:#64748b;margin:4px 0 10px">The CRM sees these subs on these jobs, but they are not on the job yet. Nothing is added by itself. A sub sees a job in their portal only once they are on it.</div>';
  if (!L.length) h += '<div>✓ Nothing to confirm.</div>';
  Object.keys(by).forEach(function(pid){
    var p = by[pid][0].job;
    h += '<div data-pid="' + esc(pid) + '" style="border-top:1px solid #e2e8f0;padding:8px 0"><b>' + esc(p.name || pid) + '</b> <span style="color:#64748b;font-size:12.5px">' + esc([p.autoPO ? 'PO ' + p.autoPO : '', p.address, p.status].filter(Boolean).join(' · ')) + '</span>';
    by[pid].forEach(function(x){
      h += '<div data-sc-row data-pid="' + esc(pid) + '" data-sub="' + esc(x.subId) + '" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0 0 6px">'
        + '<label style="display:flex;gap:6px;align-items:center;flex:1 1 260px;cursor:pointer"><input type="checkbox" data-sc-tick checked style="width:18px;height:18px"><span><b>' + esc(x.sub.company || x.sub.name) + '</b>' + (x.trade ? ' · ' + esc(x.trade) : '') + '<br><span style="color:#64748b;font-size:12px">' + esc(x.why.join(' · ')) + '</span></span></label>'
        + '<button type="button" data-sc="no" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12.5px">Not on this job</button></div>';
    });
    h += '</div>';
  });
  if (L.length) h += '<div style="position:sticky;bottom:-16px;background:#fff;padding:10px 0 0;margin-top:8px;border-top:1px solid #e2e8f0"><button type="button" data-sc="ok" style="width:100%;min-height:46px;border:0;border-radius:10px;background:#166534;color:#fff;font:700 15px Inter,Arial,sans-serif;cursor:pointer">✓ Put the ticked subs on their jobs</button><div data-sc="msg" style="font-size:12.5px;color:#166534;margin-top:4px"></div></div>';
  ov.innerHTML = h + '</div>'; D.body.appendChild(ov);
  ov.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-sc]'); if (e.target === ov || (b && b.getAttribute('data-sc') === 'x')) { ov.remove(); return; } if (!b) return;
    var a = b.getAttribute('data-sc');
    if (a === 'no') { var r = b.closest('[data-sc-row]'); no(r.getAttribute('data-pid'), r.getAttribute('data-sub')); r.remove(); ST.call(W, sweep, 300); return; }
    if (a === 'ok') {
      var pairs = [].map.call(ov.querySelectorAll('[data-sc-row]'), function(r){ if (!r.querySelector('[data-sc-tick]').checked) return null; var x = L.find(function(y){ return y.pid === r.getAttribute('data-pid') && y.subId === r.getAttribute('data-sub'); }); return x ? { pid: x.pid, subId: x.subId, trade: x.trade, why: x.why } : null; }).filter(Boolean);
      if (!pairs.length) { ov.querySelector('[data-sc="msg"]').textContent = 'Tick at least one.'; return; }
      b.disabled = true; b.textContent = 'Saving…';
      add(pairs).then(function(n){ ov.remove(); try { if (W._gcToast) W._gcToast('✓ ' + n + ' sub' + (n === 1 ? '' : 's') + ' put on their jobs.'); } catch (x) {} });
    }
  });
  return L;
};
ST.call(W, sweep, 45000); SI.call(W, sweep, 300000);
W._gcSubConfirm = { list: list, add: add, no: no, sweep: sweep };
})(window);
