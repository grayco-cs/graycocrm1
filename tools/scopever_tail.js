/* __GC_PATCH_SCOPEVER__ — 🔄 SCOPE VERSIONS (owner's sub portal plan, 11/15 list item 5.1b: "scope version history; 'Scope updated'
   shown to the sub with what changed; 'Proposal changed — review <sub>'s scope?' when the job's proposal / estimate changes after
   sharing. Never auto-push.")
   • A sub scope already keeps every version (SCOPESEND: version + 🕘 hist). Each send now also keeps a small copy of what was sent
     (sends[].ls: the lines, included / not included / notes), so the next send to that sub says what changed:
     "🔄 Scope updated (v1 → v2) — what changed: + Added … − Taken out … ~ Changed …" on top of the portal message / e-mail.
     Words only — a sub scope never has prices. A scope signed in the portal (gc_sub_scope) shows the same box in the portal
     (server: _lib/scopediff.js, scopeOut().changes).
   • 📝 "Proposal changed — review <sub>'s scope?": when the job's estimate / proposal is saved AFTER the scope was sent to a sub, the
     job's PM gets a To-Do (office + admins see it) with 📋 Open the scope. Nothing is sent again by itself. Ticking the To-Do (or
     sending the scope again) settles it until the estimate changes again.
   API: window._gcScopeDiff(prev, cur) → { added, removed, changed, other, any } · _gcScopeDiff.text(c, from, to) · window._gcScopeVer = { sweep(), flags() } */
(function(W){
'use strict';
if (W.__GC_PATCH_SCOPEVER__) return; W.__GC_PATCH_SCOPEVER__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
var RKEY = 'gc_scope_reviewed';
function s(v){ return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function crm(){ return W._crm || {}; }
function key(l){ return s(l.desc || l.description).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function q(l){ var v = l.qty; return v === '' || v == null ? '' : String(+v === +v ? +v : v); }
function clip(t, n){ t = s(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
/* the same rule as netlify/functions/_lib/scopediff.js */
function diff(prev, cur){
  prev = prev || {}; cur = cur || {};
  var A = {}, B = {}, out = { added: [], removed: [], changed: [], other: [] };
  arr(prev.lines).forEach(function(l){ var k = key(l); if (k && !A[k]) A[k] = l; });
  arr(cur.lines).forEach(function(l){ var k = key(l); if (k && !B[k]) B[k] = l; });
  Object.keys(B).forEach(function(k){
    var b = B[k], a = A[k], d = clip(b.desc || b.description, 120);
    if (!a) { out.added.push(d + (q(b) ? ' — ' + q(b) + (s(b.unit) ? ' ' + s(b.unit) : '') : '')); return; }
    var ch = [];
    if (q(a) !== q(b) || s(a.unit) !== s(b.unit)) ch.push('qty ' + (q(a) || '—') + (s(a.unit) ? ' ' + s(a.unit) : '') + ' → ' + (q(b) || '—') + (s(b.unit) ? ' ' + s(b.unit) : ''));
    var ar = s(a.room || a.area || a.sec), br = s(b.room || b.area || b.sec); if (ar !== br) ch.push('area ' + (ar || '—') + ' → ' + (br || '—'));
    var an = s(a.meas || a.note || a.measurement), bn = s(b.meas || b.note || b.measurement); if (an !== bn) ch.push('note changed');
    if (ch.length) out.changed.push(d + ': ' + ch.join(', '));
  });
  Object.keys(A).forEach(function(k){ if (!B[k]) out.removed.push(clip(A[k].desc || A[k].description, 120)); });
  [['included', 'What is included'], ['excluded', 'What is not included'], ['notes', 'Notes']].forEach(function(f){ if (s(prev[f[0]]) !== s(cur[f[0]])) out.other.push(f[1] + ' changed'); });
  out.any = !!(out.added.length || out.removed.length || out.changed.length || out.other.length);
  return out;
}
function text(c, from, to){
  if (!c || !c.any) return '';
  var L = ['🔄 Scope updated' + (from && to ? ' (v' + from + ' → v' + to + ')' : '') + ' — what changed:'];
  c.added.forEach(function(x){ L.push('+ Added: ' + x); }); c.removed.forEach(function(x){ L.push('− Taken out: ' + x); }); c.changed.forEach(function(x){ L.push('~ Changed: ' + x); }); c.other.forEach(function(x){ L.push('~ ' + x); });
  return L.join('\n');
}
diff.text = text;
/* the small copy of what was sent (sends[].ls) */
function compact(d){ return { lines: arr(d.lines).slice(0, 150).map(function(l){ return { sec: s(l.sec), desc: s(l.desc), qty: l.qty, unit: s(l.unit), note: s(l.note) }; }), included: s(d.included), excluded: s(d.excluded), notes: s(d.notes) }; }
diff.compact = compact;
/* what this sub got last time (a send with its copy, else the scope's own history snapshot of that version) → the change text */
diff.forSub = function(d, subId){
  var last = arr(d.sends).filter(function(x){ return x && x.ok && s(x.subId) === s(subId); }).slice(-1)[0]; if (!last) return '';
  if (+last.version >= +d.version) return '';
  var prev = last.ls || arr(d.hist).filter(function(h){ return +h.v === +last.version; })[0] || null;
  if (!prev) return '🔄 Scope updated (v' + last.version + ' → v' + d.version + ').';
  return text(diff(prev, d), last.version, d.version) || '';
};
W._gcScopeDiff = diff;

/* 📝 Proposal changed — review the scope? */
function scopes(L){ return arr(L).filter(function(d){ return d && d.kind === 'sub' && !d.internal && !d.deleted && s(d.pid) && arr(d.sends).some(function(x){ return x && x.ok; }); }); }
function ests(){ var E = []; try { E = (W._gcEST && W._gcEST.all) ? W._gcEST.all() : (W._gcEstimatesState || crm().estimates || []); } catch (e) { E = crm().estimates || []; } return arr(E); }
function estAt(pid, p){ var codes = [p && p.po, p && p.autoPO].filter(Boolean).map(function(c){ return s(c).toLowerCase(); }), t = 0;
  ests().forEach(function(e){ if (!e || e._isDraft || e.deleted) return; if (!(s(e.pid || e.projectId) === s(pid) || (e.po && codes.indexOf(s(e.po).toLowerCase()) > -1))) return; var x = Date.parse(e.savedAt || e.updatedAt || ''); if (isFinite(x) && x > t) t = x; });
  return t; }
function reviewed(){ try { return JSON.parse(localStorage.getItem(RKEY) || '{}') || {}; } catch (e) { return {}; } }
function setReviewed(id, at){ var m = reviewed(); m[id] = at; try { localStorage.setItem(RKEY, JSON.stringify(m)); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u(RKEY, m); } catch (e) {} }
function flags(L){
  var P = {}; arr(crm().projects).forEach(function(p){ if (p && p.id) P[s(p.id)] = p; });
  var R = reviewed(), out = [];
  scopes(L).forEach(function(d){
    var p = P[s(d.pid)]; if (!p || p.deleted) return;
    var sent = 0; arr(d.sends).forEach(function(x){ if (x && x.ok) { var t = Date.parse(x.at); if (t > sent) sent = t; } });
    var base = Math.max(sent, Date.parse(R[d.id] || 0) || 0), e = estAt(d.pid, p);
    if (e && e > base + 1000) { var who = []; arr(d.sends).forEach(function(x){ if (x && x.ok && who.indexOf(s(x.subName)) < 0) who.push(s(x.subName)); }); out.push({ d: d, p: p, subs: who, estAt: e }); }
  });
  return out;
}
function tasks(){ try { var l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function saveTasks(l){ try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {} }
function office(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /admin|office/i.test(s(u.role) + ' ' + s(u.profile)) || /owner/i.test(s(u.payType)); } catch (e) { return false; } }
function sweep(){
  if (!office()) return Promise.resolve(-1);
  return Promise.resolve(typeof W.idbGet === 'function' ? W.idbGet('scopes') : crm().scopes).then(function(SL){ return sweep0(arr(SL).length ? SL : arr(crm().scopes)); }, function(){ return sweep0(arr(crm().scopes)); });
}
function sweep0(SL){
  try {
    var l = tasks(), now = new Date().toISOString(), ch = 0;
    /* a ticked To-Do = reviewed (until the estimate changes again) */
    l.forEach(function(t){ if (t && t.done && /^SCOPEREVIEW_/.test(s(t.id)) && t.doneAt) { var id = s(t.id).slice(12), r = reviewed()[id]; if (!r || r < t.doneAt) setReviewed(id, t.doneAt); } });
    var F = flags(SL), want = {};
    F.forEach(function(f){
      var id = 'SCOPEREVIEW_' + f.d.id, who = f.subs.join(', ') || 'the sub';
      want[id] = 1;
      var lab = "📝 Proposal changed — review " + who + "'s scope? (" + clip(f.d.title || 'scope', 50) + ' — ' + clip(f.p.name, 40) + ')';
      var t = l.find(function(x){ return x && x.id === id; });
      if (!t) { l.push({ id: id, kind: 'scope_review', pid: s(f.p.id), scopeId: s(f.d.id), label: lab, note: "The job's estimate / proposal was saved after this scope went to " + who + '. Open the scope, change it if needed, and send it again — nothing is sent by itself. Tick this when it is fine as it is.', assignee: s(f.p.pm), prio: 'med', addedBy: 'CRM', addedAt: now, updatedAt: now, done: false }); ch++; }
      else if (t.done || t.label !== lab) { t.label = lab; t.done = false; t.updatedAt = now; ch++; }
    });
    l.forEach(function(t){ if (t && !t.done && /^SCOPEREVIEW_/.test(s(t.id)) && !want[t.id]) { t.done = true; t.doneAt = t.updatedAt = now; t.resolution = 'scope sent again / reviewed'; ch++; } });
    if (ch) saveTasks(l);
    return F.length;
  } catch (e) { return -1; }
}
W._gcScopeReviewOpen = function(taskId){ var t = tasks().find(function(x){ return x && x.id === taskId; }); var id = t ? s(t.scopeId) : s(taskId).replace(/^SCOPEREVIEW_/, ''); try { if (W._gcScopeSend && W._gcScopeSend.edit) W._gcScopeSend.edit(id); } catch (e) {} };
ST.call(W, sweep, 50000); SI.call(W, sweep, 300000);
W._gcScopeVer = { sweep: sweep, flags: flags, reviewed: reviewed };
})(window);
