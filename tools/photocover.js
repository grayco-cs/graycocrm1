/* ═══════════════════════════════════════════════════════════════════════════
   GrayCo — 📸 PHOTO COVERAGE (patch PHOTOCOVER). tools/photocover.js, put in the page by tools/patch_PHOTOCOVER.py as
   <script id="gc-patch-photocover">.

   Owner 11/01: "all my GrayCo Photos aren't CompanyCam photos yet, some jobs have 0 photos, some are in though" — and the copy
   rules: "we only want active jobs or jobs not lost photos taking up GrayCo photo space", "there are some jobs I do want to keep
   if I lost them, so yes let me click keep or delete completely after the 30 days".

   For admins and the office (window._gcPhotoCover.allowed()):
     • every active and bidding job: its CompanyCam project (or none), photos indexed, photos copied to GrayCo, the last photo —
       problems first (the linked project was deleted in CompanyCam · the project has 0 photos · could not be read · not linked);
     • 🔗 Link CompanyCam project: matches by address and name from CompanyCam's project list (?proxy=recent), a confirm step,
       never linked by itself; ⟳ Re-index this job (?proxy=photojob reindex); Not a job (QuickBooks company / vendor records,
       gc_kv ccidx_notjob — out of coverage, never copied; "It is a job" takes it back);
     • the copy switch in plain words, the storage meter (active / bidding / completed / lost jobs, freed, waiting);
     • lost jobs: archived (the CRM's own archived flag, restorable — a job taken out of lost is un-archived), GrayCo copies stay;
       30 days after, the admin's decision card (To-Do) → 📌 Keep photos / 🗑 Delete photos (asks first; only GrayCo's copies,
       never CompanyCam; the job stays archived). No decision = nothing deleted. Select all + Keep / Delete. 📌 Keep works any
       time before, also from the banner on the open job.
   Where: Admin → ⚙ Admin settings → 📸 Photo coverage, a "📸 Photo coverage" button on the 📸 GrayCo Photos home, the To-Do.
   No polling: the server is asked when the window opens; the To-Do / job banner use the last answer (refreshed at most every
   30 minutes while the CRM is open). Never a secret; CompanyCam is only read (through the server).
   API: window._gcPhotoCover = { open(sec), allowed(), rows(), load(force), suggest(jobId, list), state() }
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_PHOTOCOVER__) return; window.__GC_PATCH_PHOTOCOVER__ = true;
var W = window, D = document;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var FN = '/.netlify/functions/companycam-webhook', LS = 'gc_photocover_last', LSCC = 'gc_photocover_ccp';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function day(v){ var t = typeof v === 'number' ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v); if (!t) return '—'; try { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return '—'; } }
function gbTxt(b){ b = +b || 0; return b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : b ? Math.max(1, Math.round(b / 1e3)) + ' KB' : '0 MB'; }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function isOffice(){ try { if (W._gcRP && typeof W._gcRP.role === 'function' && /office/i.test(s(W._gcRP.role()))) return true; } catch (e) {} try { return /office/i.test(s(W._gcMeNow && (W._gcMeNow.role || W._gcMeNow.title))); } catch (e) { return false; } }
function allowed(){ return isAdmin() || isOffice(); }
function me(){ try { return s(W.__GC_AUTH__ && W.__GC_AUTH__.session && (W.__GC_AUTH__.session() || {}).email) || s(W._gcMeNow && (W._gcMeNow.email || W._gcMeNow.name)) || 'staff'; } catch (e) { return 'staff'; } }
function projects(){ return arr(W._crm && W._crm.projects); }

/* ── the same rules as the server (netlify/functions/_lib/cc-photos.js) ── */
var LOST = /\b(lost|dead|cancel+ed|void|spam|junk|duplicate|declined)\b/i;
function classOf(r){
  var st = low(r.status) + ' ' + low(r.stage) + (r.archived === true ? ' ' + low(r.statusBeforeArchive) + ' ' + low(r.archivedWhy) : '');
  if (LOST.test(st)) return 'lost';
  if (r.archived === true || /\barchived\b/.test(st)) return 'archived';
  if (/complete|closed|done|paid in full|finished|warranty/.test(st) || r.paidInFull === true) return 'completed';
  if (/active|approved|progress|hold|contract|scheduled|won|started|punch|final/.test(st)) return 'active';
  return 'bidding';
}
var IDF = ['ccProjectId', 'companyCamId', 'companycamId', 'ccId', 'ccamId', 'ccProjectUrl', 'companyCamUrl', 'ccamUrl', 'ccUrl', 'sourceUrl'];
function ccIdFromAny(v){
  if (v == null || v === '') return '';
  var t = String(v), m = t.match(/companycam\.com\/projects\/(\d+)/i) || t.match(/^PRJcc_(\d+)$/) || t.match(/^cc:(\d+)$/);
  if (m) return m[1];
  if (/[\/:]/.test(t)) return '';
  return /^\d{3,}$/.test(t.trim()) ? t.trim() : '';
}
function ccIdsOf(r){
  var out = []; if (!r) return out;
  if (/^PRJcc_\d+$/.test(s(r.id))) out.push(ccIdFromAny(r.id));
  IDF.forEach(function(f){ var id = ccIdFromAny(r[f]); if (id && out.indexOf(id) < 0) out.push(id); });
  arr(r.ccMoreIds).forEach(function(v){ var id = ccIdFromAny(v); if (id && out.indexOf(id) < 0) out.push(id); });
  return out;
}

/* ── the server ── */
var S = { data: null, at: 0, busy: null, err: '', msg: '', ccp: null, ccpAt: 0, ccpBusy: null, ccpErr: '', showHidden: false, link: null, sel: {}, q: '', sec: 'all', archiving: false };
try { var lc = JSON.parse(localStorage.getItem(LS) || 'null'); if (lc && lc.data && typeof lc.data === 'object') { S.data = lc.data; S.at = 0; S.cacheAt = +lc.at || 0; } } catch (e) {}
function load(force){
  if (!allowed()) return Promise.resolve(S);
  if (S.busy) return S.busy;
  if (!force && S.at && Date.now() - S.at < 30 * 60e3) return Promise.resolve(S);
  S.busy = W.fetch(FN + '?proxy=photocover', { headers: { 'x-gc-cc': '1' }, cache: 'no-store' }).then(function(r){
    return r.text().then(function(t){ var j = null; try { j = JSON.parse(t); } catch (e) {}
      if (W._gcCCGated && W._gcCCGated(r)) return;
      if (r.ok && j && j.ok) { S.data = j; S.err = ''; try { localStorage.setItem(LS, JSON.stringify({ at: Date.now(), data: j })); } catch (e) {} }
      else S.err = (j && j.error) || ('The server answered ' + r.status + '.'); });
  }, function(){ S.err = 'Could not reach the server.'; }).then(function(){ S.at = Date.now(); S.busy = null; try { archiveLost(); } catch (e) {} return S; });
  return S.busy;
}
function loadCC(force){
  if (S.ccpBusy) return S.ccpBusy;
  if (!S.ccp) { try { var c = JSON.parse(localStorage.getItem(LSCC) || 'null'); if (c && Array.isArray(c.list)) { S.ccp = c.list; S.ccpAt = +c.at || 0; } } catch (e) {} }
  if (!force && S.ccp && Date.now() - S.ccpAt < 30 * 60e3) return Promise.resolve(S.ccp);
  S.ccpBusy = W.fetch(FN + '?proxy=recent&days=3650', { headers: { 'x-gc-cc': '1' }, cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('The server answered ' + r.status + '.')); })
    .then(function(j){
      var l = arr(j && j.projects).map(function(p){ return { id: s(p.id), name: s(p.name), address: s(p.address), street: s(p.street), zip: s(p.zip), photos: p.photo_count != null ? +p.photo_count || 0 : null, contact: s(p.contact && p.contact.name), updated: +p.updated_at || 0 }; }).filter(function(p){ return p.id; });
      S.ccp = l; S.ccpAt = Date.now(); S.ccpErr = ''; try { localStorage.setItem(LSCC, JSON.stringify({ at: S.ccpAt, list: l })); } catch (e) {}
    }, function(e){ S.ccpErr = (e && e.message) || 'Could not read CompanyCam\'s project list.'; })
    .then(function(){ S.ccpBusy = null; return S.ccp; });
  return S.ccpBusy;
}
function post(act, body){
  return W.fetch(FN + '?proxy=photojob', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gc-cc': '1' }, body: JSON.stringify(Object.assign({ act: act }, body || {})) })
    .then(function(r){ return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch (e) { j = { ok: false, error: t.slice(0, 160) }; } if (!r.ok && !j.error) j.error = 'The server answered ' + r.status + '.'; return j; }); },
      function(){ return { ok: false, error: 'Could not reach the server.' }; });
}

/* ── a job saved on this computer and to the cloud (the same path as GrayCo Photos' Link) ── */
function saveJobs(ids, put){
  var want = {}; ids.forEach(function(id){ want[String(id)] = 1; });
  function map(list){ return Array.isArray(list) ? list.map(function(p){ if (!p || !want[String(p.id)]) return p; var o = put(Object.assign({}, p)); return o || p; }) : list; }
  try { W.__GC_MANUAL_SAVE__ = true; } catch (e) {}
  try { if (W._setProjects) W._setProjects(function(prev){ return map(prev); }); } catch (e) {}
  return Promise.resolve(typeof W._gcProjectsRaw === 'function' ? W._gcProjectsRaw() : (W.idbGet ? W.idbGet('projects') : null)).then(function(all){
    if (!Array.isArray(all)) return;
    var next = map(all);
    return Promise.resolve(W.idbSet ? W.idbSet('projects', next) : null).then(function(){ try { if (W._supaUpsert) W._supaUpsert('projects', next); } catch (e) {} });
  }).catch(function(){}).then(function(){ setTimeout(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500); });
}
/* lost → archived (the CRM's own flag: out of the job lists, restorable); taken out of lost → back (only what this archived) */
function archiveLost(){
  if (S.archiving || !allowed()) return;
  var now = new Date().toISOString(), arch = [], back = [];
  projects().forEach(function(p){
    if (!p || p.deleted === true || !p.id) return;
    var lost = LOST.test(low(p.status) + ' ' + low(p.stage));
    if (lost && p.archived !== true && !p.archiveRestoredAt) arch.push(p.id);
    else if (!lost && p.archived === true && p.archivedWhy === 'lost') back.push(p.id);
  });
  if (!arch.length && !back.length) return;
  S.archiving = true;
  var a = {}, b = {}; arch.forEach(function(id){ a[id] = 1; }); back.forEach(function(id){ b[id] = 1; });
  return saveJobs(arch.concat(back), function(o){
    if (a[o.id] && o.archived !== true) return Object.assign(o, { archived: true, archivedAt: now, archivedBy: 'Photo coverage (job lost)', archivedWhy: 'lost', updatedAt: now, savedAt: now });
    if (b[o.id] && o.archivedWhy === 'lost') { var x = Object.assign(o, { archived: false, archiveRestoredAt: now, updatedAt: now, savedAt: now }); delete x.archivedWhy; return x; }
    return null;
  }).then(function(){ S.archiving = false; S.archived = arch.length; S.restored = back.length; });
}
function linkSave(jobId, cc){
  var now = new Date().toISOString(), url = 'https://app.companycam.com/projects/' + cc;
  return saveJobs([jobId], function(o){
    if (ccIdsOf(o).indexOf(cc) >= 0) return null;
    var own = IDF.some(function(f){ return !!ccIdFromAny(o[f]); });
    if (!own) Object.assign(o, { ccProjectId: cc, ccamId: cc, ccamUrl: url, companyCamUrl: url });
    else o.ccMoreIds = arr(o.ccMoreIds).concat([cc]);   /* never replacing a link: beside it */
    return Object.assign(o, { ccLinkedBy: me(), ccLinkedAt: now, savedAt: now, updatedAt: now });
  });
}

/* ── coverage rows ── */
var RANK = { gone: 0, empty: 1, err: 2, none: 3, pending: 4, ok: 5 };
function rows(){
  var d = S.data || {}, P = obj(d.p), nj = obj(d.notjob), qd = obj(d.queued), ra = obj(d.reindexAsked), out = [], hidden = 0, copyOn = !!(d.status && d.status.copy && d.status.copy.on);
  projects().forEach(function(x){
    if (!x || x.deleted === true || !x.id) return;
    var c = classOf(x); if (c !== 'active' && c !== 'bidding') return;
    var hid = !!nj[x.id]; if (hid) { hidden++; if (!S.showHidden) return; }
    var ids = ccIdsOf(x), n = 0, g = 0, last = 0, gone = 0, idx = 0, err = '', pend = 0;
    ids.forEach(function(id){ var e = P[id]; if (qd[id] || ra[id]) pend++; if (!e) { pend++; return; } idx++; n += +e.n || 0; g += +e.g || 0; if (+e.last > last) last = +e.last; if (e.gone) gone++; if (e.err) err = s(e.err); });
    var st = !ids.length ? 'none' : (pend && !n) ? 'pending' : (gone === ids.length) ? 'gone' : n ? 'ok' : err ? 'err' : 'empty';
    out.push({ id: s(x.id), name: s(x.name) || s(x.client) || x.id, address: s(x.address || x.jobAddress), cls: c, ids: ids, n: n, g: g, last: last, gone: gone, st: st, err: err, hidden: hid, copyOn: copyOn });
  });
  out.sort(function(a, b){ return (RANK[a.st] - RANK[b.st]) || (a.cls === b.cls ? 0 : a.cls === 'active' ? -1 : 1) || (low(a.name) < low(b.name) ? -1 : low(a.name) > low(b.name) ? 1 : 0); });
  out.hidden = hidden;
  return out;
}
/* ── link suggestions: the same place (house number + street) first, then the name ── */
var SUF = { street: 'st', st: 'st', road: 'rd', rd: 'rd', avenue: 'ave', ave: 'ave', drive: 'dr', dr: 'dr', lane: 'ln', ln: 'ln', court: 'ct', ct: 'ct', cove: 'cv', cv: 'cv', circle: 'cir', cir: 'cir', boulevard: 'blvd', blvd: 'blvd', place: 'pl', pl: 'pl', trace: 'trce', trce: 'trce', parkway: 'pkwy', pkwy: 'pkwy', highway: 'hwy', hwy: 'hwy', way: 'way', trail: 'trl', trl: 'trl', terrace: 'ter', ter: 'ter' };
function addrKey(a){
  var t = low(a).split(',')[0].replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  var i = 0; while (i < t.length && !/^\d+[a-z]?$/.test(t[i])) i++;   /* "Joe Smith 123 Main St" → from the number */
  if (i >= t.length) return '';
  var num = t[i], w = []; for (var k = i + 1; k < t.length && w.length < 3; k++) { var x = t[k]; if (/^(n|s|e|w|north|south|east|west)$/.test(x) && !w.length) continue; if (SUF[x] && w.length) break; if (/^\d{5}$/.test(x)) break; w.push(x.replace(/(memphis|bartlett|cordova|germantown|collierville|atoka|arlington|lakeland|millington|oakland|southaven|olive)$/, '') || x); if (w.length >= 2) break; }
  return w.length ? num + ' ' + w.join(' ') : '';
}
function words(v){ return low(v).replace(/&/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function(x){ return x.length >= 3 && !/^(the|and|llc|inc|job|roof|house|home|project|repair|tn|ms|ar)$/.test(x); }); }
function suggest(jobId, list){
  var j = projects().filter(function(p){ return p && String(p.id) === String(jobId); })[0]; if (!j) return [];
  var have = ccIdsOf(j), ak = addrKey(j.address || j.jobAddress) || addrKey(j.name), jw = words(j.name + ' ' + s(j.client));
  return arr(list).filter(function(c){ return c && c.id && have.indexOf(c.id) < 0; }).map(function(c){
    var sc = 0, why = [];
    var ck = addrKey(c.address || c.street) || addrKey(c.name);
    if (ak && ck && ak === ck) { sc += 100; why.push('same address'); }
    var cw = words(c.name + ' ' + c.contact), hit = jw.filter(function(w){ return cw.indexOf(w) >= 0; }).length;
    if (jw.length && hit) { var f = hit / jw.length; sc += Math.round(60 * f); why.push(hit === jw.length ? 'same name' : 'name looks alike'); }
    return { c: c, score: sc, why: why.join(' · ') };
  }).filter(function(x){ return x.score >= 30; }).sort(function(a, b){ return b.score - a.score || ((+b.c.photos || 0) - (+a.c.photos || 0)); }).slice(0, 8);
}

/* ── the window ── */
var B = 'padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-weight:600;cursor:pointer;font-size:13px';
var BP = 'padding:6px 10px;border-radius:8px;border:0;background:#1B1452;color:#fff;font-weight:700;cursor:pointer;font-size:13px';
function copyLine(d){
  var c = d && d.status && d.status.copy;
  if (!c || !c.on) return 'GrayCo copies are OFF until Supabase Pro — photos show from CompanyCam links';
  return 'GrayCo copies are ON — ' + (+c.copied || 0).toLocaleString() + ' of ' + (+c.total || 0).toLocaleString() + ' photos copied (' + gbTxt(c.bytes) + ')' + (c.stop === 'cap' ? ' · ⛔ paused at the ' + c.capGB + ' GB safety cap' : '');
}
function meterHtml(d){
  var m = d && d.status && d.status.copy && d.status.copy.meter; if (!m) return '';
  var b = obj(m.bytes), p = obj(m.pending);
  return '<div data-pc-meter style="font-size:13px;color:#334155;margin-top:4px">GrayCo storage: active jobs ' + gbTxt(b.active) + ' · bidding ' + gbTxt(b.bidding) + ' · completed ' + gbTxt(b.completed) + ' · lost ' + gbTxt(b.lost)
    + ' · freed by lost-job removals ' + gbTxt(m.freedBytes) + ' (' + (+m.freedPhotos || 0) + ' photos) · waiting for a decision: ' + (+p.projects || 0) + ' lost job' + ((+p.projects || 0) === 1 ? '' : 's') + ', ' + gbTxt(p.bytes) + (p.due ? ' (' + p.due + ' due now)' : '') + '</div>';
}
function lostList(){
  var d = S.data || {}, byJob = {};
  arr(d.lost).forEach(function(L){ arr(L.jobs).forEach(function(j, i){
    var e = byJob[j] = byJob[j] || { job: j, name: s(arr(L.names)[i]) || j, pids: [], n: 0, g: 0, gb: 0, since: L.since, dueAt: L.dueAt, due: false, kept: false, deletedAt: '', freed: 0 };
    e.pids.push(L.pid); e.n += +L.n || 0; e.g += +L.g || 0; e.gb += +L.gb || 0; if (L.due) e.due = true; if (L.kept) e.kept = true; if (L.deletedAt) { e.deletedAt = L.deletedAt; e.freed += +obj(L.deleted).bytes || 0; }
    if (s(L.since) < s(e.since)) { e.since = L.since; e.dueAt = L.dueAt; } }); });
  var asked = obj(d.deleteAsked);
  return Object.keys(byJob).map(function(k){ var e = byJob[k]; e.asked = !!asked[k]; e.decide = e.due && !e.kept && !e.deletedAt && e.g > 0 && !e.asked; return e; })
    .sort(function(a, b){ return (b.decide - a.decide) || (s(a.since) < s(b.since) ? -1 : 1); });
}
function lostHtml(){
  var l = lostList(); if (!l.length) return '<div style="color:#64748b;font-size:13px">No lost job has CompanyCam photos.</div>';
  var dec = l.filter(function(e){ return e.decide; }), h = '';
  if (dec.length) h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0 8px"><label style="font-size:13px"><input type="checkbox" data-pc-selall' + (dec.every(function(e){ return S.sel[e.job]; }) ? ' checked' : '') + '> Select all (' + dec.length + ')</label>'
    + '<button type="button" data-pc="keepsel" style="' + BP + '">📌 Keep photos (selected)</button>' + (isAdmin() ? '<button type="button" data-pc="delsel" style="' + B + ';color:#991b1b">🗑 Delete photos (selected)</button>' : '') + '</div>';
  l.forEach(function(e){
    var line = e.deletedAt ? 'GrayCo copies removed ' + day(e.deletedAt) + ' (' + gbTxt(e.freed) + ') — the photos still show from CompanyCam while CompanyCam has them.'
      : e.kept ? '📌 Photos kept — they stay in GrayCo storage.'
      : e.asked ? '🗑 Delete asked — the GrayCo copies are removed on the next run (CompanyCam is not touched).'
      : !e.g ? 'No GrayCo copies (nothing to decide).'
      : e.due ? '📷 Lost 30+ days ago — ' + e.g + ' photos, ' + gbTxt(e.gb) + ' in GrayCo storage. Keep them or delete them (nothing is deleted without your click).'
      : 'Job lost ' + day(e.since) + ' — GrayCo photo copies stay; you decide on ' + day(e.dueAt) + ' (📌 Keep photos now to keep them for good).';
    h += '<div data-pc-lost="' + esc(e.job) + '" style="border:1px solid ' + (e.decide ? '#f59e0b' : '#e2e8f0') + ';border-radius:10px;padding:8px 10px;margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      + (e.decide ? '<input type="checkbox" data-pc-sel="' + esc(e.job) + '"' + (S.sel[e.job] ? ' checked' : '') + ' aria-label="Select ' + esc(e.name) + '">' : '')
      + '<div style="flex:1 1 240px;min-width:0"><b>' + esc(e.name) + '</b> <span style="color:#64748b;font-size:12px">lost · archived</span><div style="font-size:13px;color:#334155">' + esc(line) + '</div></div>'
      + (!e.kept && !e.deletedAt && e.g ? '<button type="button" data-pc="keep" data-job="' + esc(e.job) + '" style="' + BP + '">📌 Keep photos</button>' : '')
      + (e.decide && isAdmin() ? '<button type="button" data-pc="del" data-job="' + esc(e.job) + '" style="' + B + ';color:#991b1b">🗑 Delete photos</button>' : '')
      + '</div>';
  });
  return h;
}
var ST = { gone: ['#991b1b', '⚠ Linked CompanyCam project was deleted in CompanyCam — link the right one'], empty: ['#b45309', '⚠ Its CompanyCam project has 0 photos — the photos may be in another CompanyCam project'],
  err: ['#991b1b', '⚠ Could not be read'], none: ['#475569', 'Not linked to CompanyCam'], pending: ['#1d4ed8', 'Being read…'], ok: ['#166534', 'OK'] };
function rowHtml(r){
  var st = ST[r.st] || ST.ok, open = S.link && S.link.job === r.id;
  var cc = r.ids.length ? r.ids.map(function(id){ var e = obj(obj(S.data && S.data.p)[id]); return '<a href="https://app.companycam.com/projects/' + esc(id) + '" target="_blank" rel="noopener">#' + esc(id) + '</a>' + (e.gone ? ' (deleted)' : ''); }).join(', ') : 'none';
  var h = '<div data-pc-row="' + esc(r.id) + '" data-st="' + r.st + '" style="border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-top:6px;background:' + (r.st === 'ok' ? '#fff' : '#fffbeb') + '">'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:baseline"><b style="flex:1 1 200px;min-width:0">' + esc(r.name) + '</b><span style="font-size:12px;color:#64748b">' + (r.cls === 'active' ? 'Active' : 'Bidding') + (r.hidden ? ' · hidden (not a job)' : '') + '</span></div>'
    + (r.address ? '<div style="font-size:12px;color:#64748b">' + esc(r.address) + '</div>' : '')
    + '<div style="font-size:13px;margin-top:2px">CompanyCam: ' + cc + ' · indexed: <b data-pc-n>' + r.n + '</b> · copied to GrayCo: <b data-pc-g>' + (r.copyOn || r.g ? r.g : 'off') + '</b> · last photo: ' + (r.last ? day(r.last) : '—') + '</div>'
    + '<div data-pc-st style="font-size:13px;color:' + st[0] + ';font-weight:600">' + esc(st[1]) + (r.st === 'err' && r.err ? ': ' + esc(r.err) : '') + '</div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">'
    + '<button type="button" data-pc="link" data-job="' + esc(r.id) + '" style="' + (r.st === 'ok' ? B : BP) + '">🔗 ' + (r.ids.length ? 'Link another CompanyCam project' : 'Link CompanyCam project') + '</button>'
    + (r.ids.length ? '<button type="button" data-pc="reindex" data-job="' + esc(r.id) + '" style="' + B + '">⟳ Re-index this job</button>' : '')
    + (r.hidden ? '<button type="button" data-pc="isjob" data-job="' + esc(r.id) + '" style="' + B + '">It is a job</button>' : '<button type="button" data-pc="notjob" data-job="' + esc(r.id) + '" title="A QuickBooks company or vendor record, not a job: left out of coverage and never copied" style="' + B + '">Not a job</button>')
    + '</div>';
  if (open) h += linkBox(r);
  return h + '</div>';
}
function linkBox(r){
  var L = S.link, h = '<div data-pc-linkbox style="margin-top:8px;padding:8px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0">';
  if (L.pick) {
    var c = L.pick;
    return h + '<div data-pc-confirm style="font-size:14px">Link CompanyCam project <b>' + esc(c.name || ('#' + c.id)) + '</b>' + (c.address ? ' (' + esc(c.address) + ')' : '') + (c.photos != null ? ' · ' + c.photos + ' photos' : '')
      + ' to the job <b>' + esc(r.name) + '</b>? Its photos will show on this job. Nothing changes in CompanyCam.</div>'
      + '<div style="display:flex;gap:6px;margin-top:8px"><button type="button" data-pc="linkyes" style="' + BP + ';background:#16a34a">✓ Yes, link it</button><button type="button" data-pc="linkback" style="' + B + '">Back</button><button type="button" data-pc="linkno" style="' + B + '">Cancel</button></div></div>';
  }
  if (!S.ccp && S.ccpBusy) return h + 'Reading CompanyCam\'s project list…</div>';
  if (!S.ccp) return h + esc(S.ccpErr || 'CompanyCam\'s project list could not be read.') + ' <button type="button" data-pc="linkno" style="' + B + '">Close</button></div>';
  var sug = suggest(r.id, S.ccp), q = low(L.q), list = q ? S.ccp.filter(function(c){ return low(c.name + ' ' + c.address + ' ' + c.contact + ' ' + c.id).indexOf(q) >= 0; }).slice(0, 12).map(function(c){ return { c: c, why: 'search' }; }) : sug;
  h += '<div style="font-weight:700;font-size:13px">' + (q ? 'CompanyCam projects matching “' + esc(L.q) + '”' : sug.length ? 'Suggested by address and name — choose one, then confirm:' : 'No close match by address or name — search CompanyCam\'s projects:') + '</div>'
    + '<input type="search" data-pc-q placeholder="Search CompanyCam projects (name, address)" value="' + esc(L.q || '') + '" style="width:100%;box-sizing:border-box;margin:6px 0;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px">';
  list.forEach(function(x){ var c = x.c;
    h += '<div data-pc-sug="' + esc(c.id) + '" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:4px 0;border-top:1px solid #eef2f7"><div style="flex:1 1 220px;min-width:0"><b>' + esc(c.name || ('#' + c.id)) + '</b> <span style="font-size:12px;color:#64748b">' + esc(c.address) + (c.photos != null ? ' · ' + c.photos + ' photos' : '') + (x.why ? ' · ' + esc(x.why) : '') + '</span></div>'
      + '<button type="button" data-pc="choose" data-cc="' + esc(c.id) + '" style="' + B + '">Choose</button></div>'; });
  return h + '<div style="margin-top:6px"><button type="button" data-pc="linkno" style="' + B + '">Cancel</button></div></div>';
}
function body(){
  var d = S.data, rs = rows(), probs = rs.filter(function(r){ return r.st !== 'ok'; }).length;
  var h = '<div style="font-weight:800;font-size:18px;margin-bottom:4px">📸 Photo coverage</div>'
    + '<div data-pc-copy style="margin:6px 0;padding:8px 10px;border-radius:8px;background:' + (d && d.status && d.status.copy && d.status.copy.on ? '#f0fdf4;border:1px solid #bbf7d0' : '#fff7ed;border:1px solid #fed7aa') + ';font-weight:700">' + esc(copyLine(d)) + '</div>'
    + meterHtml(d)
    + '<div style="font-size:12px;color:#64748b;margin:6px 0">Lost jobs: GrayCo copies stay 30 days after the job is lost, then you choose 📌 Keep photos or 🗑 Delete photos — nothing is deleted without your click. Once CompanyCam is cancelled, deleted photos can\'t be recovered.</div>';
  if (S.err) h += '<div style="color:#991b1b;margin:4px 0">' + esc(S.err) + '</div>';
  if (!d) return h + '<div style="color:#64748b">' + (S.busy ? 'Reading…' : 'Nothing read yet.') + '</div>';
  if (S.msg) h += '<div data-pc-msg role="status" style="color:#166534;font-weight:600;margin:4px 0">' + esc(S.msg) + '</div>';
  var tabs = [['all', 'Active & bidding jobs (' + rs.length + ', ' + probs + ' to fix)'], ['lost', 'Lost jobs (' + lostList().length + ')']];
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">' + tabs.map(function(t){ return '<button type="button" data-pc="sec" data-v="' + t[0] + '" style="' + (S.sec === t[0] ? BP : B) + '">' + esc(t[1]) + '</button>'; }).join('')
    + '<button type="button" data-pc="refresh" style="' + B + '">Refresh</button></div>';
  if (S.sec === 'lost') return h + lostHtml();
  h += '<div style="font-size:12px;color:#64748b">Problems first. Last index ' + esc(day(d.status && d.status.last && d.status.last.at)) + ' · ' + (+(d.status && d.status.photos) || 0).toLocaleString() + ' photos in ' + (+(d.status && d.status.indexed) || 0) + ' CompanyCam projects.'
    + (rs.hidden ? ' <button type="button" data-pc="hidden" style="border:0;background:none;color:#1d4ed8;cursor:pointer;text-decoration:underline">' + (S.showHidden ? 'Hide' : 'Show') + ' the ' + rs.hidden + ' marked "Not a job"</button>' : '') + '</div>';
  rs.forEach(function(r){ h += rowHtml(r); });
  return h;
}
var OV = null, ADM = null;
function paint(){
  if (ADM && !ADM.isConnected) ADM = null;
  var q = D.activeElement && D.activeElement.getAttribute && D.activeElement.getAttribute('data-pc-q') != null, pos = q ? D.activeElement.selectionStart : 0;
  if (ADM && !OV) ADM.innerHTML = body();
  if (OV) { var box = OV.querySelector('[data-pc-box]'); if (box) box.innerHTML = body() + '<div style="text-align:right;margin-top:12px"><button type="button" data-pc="close" style="' + B + '">Close</button></div>'; }
  if (q) { var i = (OV || ADM || D).querySelector('[data-pc-q]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) {} } }
}
function open(sec){
  if (!allowed()) return;
  if (!OV) {
    OV = D.createElement('div'); OV.id = 'gc-photocover-ov'; OV.setAttribute('data-gc-keep', '1'); OV.setAttribute('role', 'dialog'); OV.setAttribute('aria-label', 'Photo coverage');
    OV.style.cssText = 'position:fixed;inset:0;z-index:100050;background:rgba(15,23,42,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px';
    OV.innerHTML = '<div data-pc-box style="background:#fff;color:#0f172a;max-width:820px;width:100%;border-radius:14px;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.25);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif"></div>';
    OV.addEventListener('click', onClick); OV.addEventListener('input', onInput); OV.addEventListener('change', onChange);
    D.body.appendChild(OV);
  }
  if (sec) S.sec = sec;
  S.msg = ''; paint();
  return load(true).then(paint);
}
function close(){ if (OV) { OV.remove(); OV = null; } S.link = null; }
function done(r, okMsg){ S.msg = r && r.ok ? (okMsg || r.message || 'Saved.') : ('Could not save: ' + s(r && r.error)); return load(true).then(paint); }
function onInput(e){ var t = e.target; if (t && t.getAttribute && t.getAttribute('data-pc-q') != null && S.link) { S.link.q = t.value; paint(); } }
function onChange(e){
  var t = e.target; if (!t || !t.getAttribute) return;
  if (t.getAttribute('data-pc-selall') != null) { lostList().filter(function(x){ return x.decide; }).forEach(function(x){ if (t.checked) S.sel[x.job] = 1; else delete S.sel[x.job]; }); paint(); return; }
  var j = t.getAttribute('data-pc-sel'); if (j) { if (t.checked) S.sel[j] = 1; else delete S.sel[j]; paint(); }
}
function delJobs(jobs){
  var l = lostList().filter(function(x){ return jobs.indexOf(x.job) >= 0 && x.decide; }); if (!l.length) { S.msg = 'Select a lost job first.'; paint(); return; }
  var n = l.reduce(function(a, x){ return a + x.g; }, 0), b = l.reduce(function(a, x){ return a + x.gb; }, 0);
  if (!W.confirm('Delete the GrayCo copies of ' + n + ' photos (' + gbTxt(b) + ') of ' + l.length + ' lost job' + (l.length === 1 ? '' : 's') + '?\n\n' + l.map(function(x){ return '• ' + x.name; }).slice(0, 12).join('\n')
    + '\n\nOnly GrayCo\'s copies are deleted — CompanyCam is not touched and the jobs stay archived. Once CompanyCam is cancelled, these photos can\'t be recovered.')) return;
  S.msg = 'Deleting…'; paint();
  post('delete', { jobs: l.map(function(x){ return x.job; }), confirm: true }).then(function(r){ l.forEach(function(x){ delete S.sel[x.job]; }); return done(r); });
}
function onClick(e){
  var t = e.target;
  if (OV && t === OV) { close(); return; }
  var b = t.closest && t.closest('[data-pc]'); if (!b) return;
  var a = b.getAttribute('data-pc'), job = b.getAttribute('data-job') || '';
  var rowOf = function(id){ return rows().filter(function(r){ return r.id === id; })[0] || null; };
  switch (a) {
    case 'close': close(); return;
    case 'refresh': S.msg = ''; load(true).then(paint); return;
    case 'sec': S.sec = b.getAttribute('data-v') || 'all'; S.link = null; paint(); return;
    case 'hidden': S.showHidden = !S.showHidden; paint(); return;
    case 'link': S.link = { job: job, q: '', pick: null }; paint(); loadCC(false).then(paint); return;
    case 'linkno': S.link = null; paint(); return;
    case 'linkback': if (S.link) S.link.pick = null; paint(); return;
    case 'choose': { var cc = b.getAttribute('data-cc'); var c = arr(S.ccp).filter(function(x){ return x.id === cc; })[0]; if (S.link && c) S.link.pick = c; paint(); return; }
    case 'linkyes': {
      var L = S.link; if (!L || !L.pick) return; var r0 = rowOf(L.job), pid = L.pick.id, nm = L.pick.name;
      S.link = null; S.msg = 'Linking…'; paint();
      linkSave(L.job, pid).then(function(){
        return Promise.all([
          W.fetch(FN + '?proxy=review', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gc-cc': '1' }, body: JSON.stringify({ cc: pid, act: 'link', job: L.job, kind: '' }) }).catch(function(){}),
          post('reindex', { pids: [pid], job: L.job })
        ]);
      }).then(function(x){ return done({ ok: true }, 'Linked “' + (nm || pid) + '” to ' + (r0 ? r0.name : L.job) + ' — its photos are read in now (refresh in a minute).' + (x && x[1] && !x[1].ok ? ' (' + s(x[1].error) + ')' : '')); });
      return;
    }
    case 'reindex': { var r1 = rowOf(job); if (!r1) return; S.msg = 'Asking…'; paint(); post('reindex', { pids: r1.ids, job: job }).then(function(r){ return done(r); }); return; }
    case 'notjob': case 'isjob': { var r2 = rowOf(job); S.msg = 'Saving…'; paint(); post(a, { job: job, name: r2 ? r2.name : '' }).then(function(r){ return done(r, a === 'notjob' ? '“' + (r2 ? r2.name : job) + '” is marked "Not a job" — left out of coverage, never copied.' : 'Back in coverage.'); }); return; }
    case 'keep': S.msg = 'Saving…'; paint(); post('keep', { jobs: [job] }).then(function(r){ return done(r); }); return;
    case 'keepsel': { var ks = Object.keys(S.sel); if (!ks.length) { S.msg = 'Select a lost job first.'; paint(); return; } S.msg = 'Saving…'; paint(); post('keep', { jobs: ks }).then(function(r){ ks.forEach(function(k){ delete S.sel[k]; }); return done(r); }); return; }
    case 'del': delJobs([job]); return;
    case 'delsel': delJobs(Object.keys(S.sel)); return;
  }
}

/* Admin → ⚙ Admin settings → 📸 Photo coverage */
function addSection(){
  if (typeof W._gcAdmAddSection !== 'function') return false;
  W._gcAdmAddSection({ id: 'photocover', after: 'ccsync', ic: '📸', t: 'Photo coverage', d: 'Every active and bidding job: its CompanyCam project, photos indexed / copied, the last photo · Link · Re-index · Not a job · lost jobs\' photos',
    render: function(box){ ADM = box; box.addEventListener('click', onClick); box.addEventListener('input', onInput); box.addEventListener('change', onChange); box.innerHTML = body(); load(true).then(paint); },
    count: function(){ var n = lostList().filter(function(x){ return x.decide; }).length; return n ? n + ' to decide' : ''; } });
  return true;
}
if (!addSection()) { var tries = 0, iv0 = RI.call(W, function(){ if (addSection() || ++tries > 120) clearInterval(iv0); }, 500); }

/* the admin's To-Do: one decision card per lost job, 30 days after (no fetch from the To-Do: the last answer, refreshed at most
   every 30 minutes) */
(function wrapTodo(){
  var n = 0, iv = RI.call(W, function(){
    var f = W._gcJOfficeTasks; if (typeof f !== 'function') { if (n++ > 120) clearInterval(iv); return; }
    if (f.__photocover) { clearInterval(iv); return; } clearInterval(iv);
    var w = function(){
      var out = []; try { out = f.apply(this, arguments) || []; } catch (e) {}
      try {
        if (isAdmin()) {
          if (!S.busy && Date.now() - Math.max(S.at, S.cacheAt || 0) > 30 * 60e3) load(false);
          lostList().filter(function(x){ return x.decide; }).forEach(function(x){
            out.push({ id: 'photocover_lost_' + x.job, cat: 'Photos', label: '📷 ' + x.name + ' was lost 30 days ago — ' + x.g + ' photos, ' + gbTxt(x.gb) + ' in GrayCo storage',
              sub: '📌 Keep photos or 🗑 Delete photos (only GrayCo\'s copies; nothing is deleted without your click)', color: '#f59e0b', action: function(){ open('lost'); } });
          });
        }
      } catch (e) {}
      return out;
    };
    Object.keys(f).forEach(function(k){ try { w[k] = f[k]; } catch (e) {} });
    w.__photocover = true; W._gcJOfficeTasks = w;
  }, 1000);
})();

/* the open job: a lost job with GrayCo copies says when the decision comes, with 📌 Keep photos (no fetch: the last answer) */
function jobBanner(){
  try {
    var ban = D.getElementById('gc-photocover-job'), p = W._gcOpenProject, e = null;
    if (allowed() && p && p.id && S.data && !OV) e = lostList().filter(function(x){ return x.job === String(p.id) && x.g > 0 && !x.deletedAt; })[0] || null;
    if (!e) { if (ban) ban.remove(); return; }
    var txt = e.kept ? '📌 GrayCo photo copies kept (job lost ' + day(e.since) + ').' : e.asked ? '🗑 GrayCo photo copies are being deleted (asked).' : e.due ? '📷 This job was lost 30+ days ago — ' + e.g + ' photos, ' + gbTxt(e.gb) + ' in GrayCo storage: keep or delete them.' : '📷 Job lost — GrayCo photo copies stay; you decide on ' + day(e.dueAt) + '.';
    var key = e.job + '|' + txt;
    if (ban && ban.getAttribute('data-k') === key) return;
    if (!ban) { ban = D.createElement('div'); ban.id = 'gc-photocover-job'; ban.setAttribute('data-gc-keep', '1'); ban.setAttribute('role', 'status'); ban.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:99990;max-width:min(680px,calc(100vw - 24px));background:#fffbeb;border:1px solid #f59e0b;border-radius:12px;padding:8px 12px;box-shadow:0 6px 20px rgba(0,0,0,.15);display:flex;gap:8px;align-items:center;flex-wrap:wrap;font:14px system-ui,sans-serif;color:#0f172a'; ban.addEventListener('click', function(ev){ var b = ev.target.closest('[data-pcj]'); if (!b) return; var k = b.getAttribute('data-pcj'), j = b.getAttribute('data-job'); if (k === 'keep') { b.disabled = true; post('keep', { jobs: [j] }).then(function(r){ return done(r); }).then(function(){ ban.removeAttribute('data-k'); jobBanner(); }); } else open('lost'); }); D.body.appendChild(ban); }
    ban.setAttribute('data-k', key);
    ban.innerHTML = '<span style="flex:1 1 260px">' + esc(txt) + '</span>' + (!e.kept && !e.asked ? '<button type="button" data-pcj="keep" data-job="' + esc(e.job) + '" style="' + BP + '">📌 Keep photos</button>' : '') + (e.decide && isAdmin() ? '<button type="button" data-pcj="open" style="' + B + '">Decide…</button>' : '');
  } catch (x) {}
}
RI.call(W, function(){ if (!D.hidden) jobBanner(); }, 2000);

W._gcPhotoCover = { open: open, close: close, allowed: allowed, rows: rows, load: load, loadCC: loadCC, suggest: suggest, lost: lostList, classOf: classOf, ccIdsOf: ccIdsOf, addrKey: addrKey,
  state: function(){ return { at: S.at, err: S.err, msg: S.msg, link: S.link ? { job: S.link.job, pick: S.link.pick && S.link.pick.id } : null, sec: S.sec, archived: S.archived || 0, restored: S.restored || 0, hasData: !!S.data }; } };
try { console.log('[GC] 📸 Photo coverage (patch PHOTOCOVER) — _gcPhotoCover.open()'); } catch (e) {}
})();
