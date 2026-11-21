/* __GC_PATCH_FIELDFAST_BOOT__ — a phone with no saved copy shows the jobs as soon as the cloud answers (tools/patch_FIELDFAST.py).
   Owner 11/21: "New appointment and other buttons don't work" · "It's so slow". Measured (test_FIELDTAPS, iPhone, CPU x4):
   after the first open Field Home had NO jobs for 10-13 s (office / PM / estimator / crew): the cloud answered in ~0.3 s,
   but the answer waited behind the rest of the page being read (the sync's merge steps each wait their turn), then the
   whole pull, then a redraw. A phone that has the lists saved (IndexedDB) already opens with them; this is for one that
   has NOT (a first sign-in, a phone whose storage was cleared):
   • as the page starts, on a phone that is signed in and has no saved job list, ONE read asks the cloud for the lists the
     Field's screens need (jobs, schedule, people, leads — and the delete lists, so a deleted job never shows), through the
     page's own sign-in / access layers (a person gets only what they may read);
   • until the app's own lists arrive, window._crm shows that copy (jobs, schedule, people added to the built-in ones;
     leads through the app's own lead mirror) — Home, Jobs, Approvals, the pickers and a job page draw from it at once;
   • nothing is saved from it: it is never written to the phone or sent anywhere; the moment the app's own list for a
     key has anything in it, that list is shown again (the sync then applies the cloud's copy exactly as before).
   Off on this device: localStorage gc_fieldfast_off = '1'.  Console: _gcBootLists.state() */
(function(){
'use strict';
var W = window, D = document;
if (W._gcBootLists) return;
var NST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
var ST = { off: false, phone: false, saved: null, asked: 0, got: 0, ms: 0, err: '', used: {}, keys: {} };
var L = null;   /* the cloud's lists: { projects, schedule, users, leads } */
W._gcBootLists = { state: function(){ var o = JSON.parse(JSON.stringify(ST)); o.have = L ? Object.keys(L).map(function(k){ return k + ':' + (Array.isArray(L[k]) ? L[k].length : '-'); }) : []; return o; },
  lists: function(){ return L; }, active: function(k){ return !!(L && ST.used[k]); } };
function lsGet(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } }
function arr(v){ return Array.isArray(v) ? v : []; }
function s(v){ return v == null ? '' : String(v); }
try { if (lsGet('gc_fieldfast_off') === '1') { ST.off = true; return; } } catch (e) {}
function phone(){
  try { if (D.documentElement.classList.contains('gc-boot-field')) return true; } catch (e) {}
  try { if (W._gcFieldBoot && W._gcFieldBoot.phone) return !!W._gcFieldBoot.phone(); } catch (e) {}
  return false;
}
function signed(){ try { var j = JSON.parse(lsGet('gc_auth_v1') || 'null'); return !!(j && j.access_token && j.email); } catch (e) { return false; } }
ST.phone = phone();
if (!ST.phone || !signed()) return;

/* the app's own list is empty (or only the built-in people) — then the cloud's copy is shown */
function appEmpty(o, k){ var v = o && o[k]; return !Array.isArray(v) || v.length === 0; }
function uKey(u){ return u ? s(u.email).toLowerCase() || s(u.id) || s(u.name).toLowerCase() : ''; }
function withPeople(mine){
  var a = arr(mine), seen = {}; a.forEach(function(u){ var k = uKey(u); if (k) seen[k] = 1; });
  var add = arr(L && L.users).filter(function(u){ var k = uKey(u); return k && !seen[k] && (seen[k] = 1); });
  return add.length ? a.concat(add) : a;
}
function fill(o){
  if (!L || !o || typeof o !== 'object') return o;
  try {
    if (L.projects && L.projects.length && appEmpty(o, 'projects')) { o.projects = L.projects.slice(); ST.used.projects = 1; } else if (!appEmpty(o, 'projects')) ST.used.projects = 0;
    if (L.schedule && L.schedule.length && appEmpty(o, 'schedule')) { o.schedule = L.schedule.slice(); ST.used.schedule = 1; } else if (!appEmpty(o, 'schedule')) ST.used.schedule = 0;
    /* people: the app starts with a few built-in ones; the cloud's are added until the app's own list has arrived */
    if (L.users && L.users.length && !W.__gcUsersLoaded) { var u = withPeople(o.users); if (u.length !== arr(o.users).length) { o.users = u; ST.used.users = 1; } }
  } catch (e) {}
  return o;
}
function leadsNow(){
  try {
    if (!L || !L.leads || !L.leads.length) return;
    var cur = W.__gcLeadsLive;
    if (Array.isArray(cur) && cur.length && !cur.__gcBoot) return;   /* the app's own leads are there */
    if (Array.isArray(cur) && cur.__gcBoot) return;
    var c = L.leads.slice(); try { Object.defineProperty(c, '__gcBoot', { value: true }); } catch (e) {}
    W.__gcLeadsLive = c; ST.used.leads = 1;
  } catch (e) {}
}
/* the CRM's data object goes through __gcCrmBox each time it is rebuilt */
(function(){
  var prev = W.__gcCrmBox;
  W.__gcCrmBox = function(o){ var r = typeof prev === 'function' ? prev(o) : o; return fill(r || o); };
})();
/* the app's own people list has arrived when the sync applied it (it is then the cloud's merged with this phone's) */
function poke(){
  try { if (W._crm) fill(W._crm); } catch (e) {}
  leadsNow();
  try { if (W._gcField && W._gcField.render && D.querySelector('#_gcJobPick.gc-fh')) W._gcField.render(); } catch (e) {}
  try { if (W._gcRA && W._gcRA.sync) W._gcRA.sync(); } catch (e) {}
  try { W.dispatchEvent(new Event('gc-boot-lists')); } catch (e) {}
}

/* is a job list saved on this phone? (IndexedDB grayco_crm / kv: projects) — never creates the database */
function savedCopy(){
  return new Promise(function(res){
    var done = function(v){ if (done.d) return; done.d = 1; res(v); };
    NST.call(W, function(){ done(null); }, 1500);
    try {
      var q = W.indexedDB.open('grayco_crm');
      q.onupgradeneeded = function(){ try { q.transaction.abort(); } catch (e) {} done(false); };
      q.onerror = function(){ done(false); };
      q.onblocked = function(){ done(null); };
      q.onsuccess = function(){
        var db = q.result;
        try {
          if (!db.objectStoreNames.contains('kv')) { db.close(); return done(false); }
          var g = db.transaction('kv', 'readonly').objectStore('kv').get('projects');
          g.onsuccess = function(){ var v = g.result, n = 0; try { if (Array.isArray(v)) n = v.length; else if (v && typeof v === 'object' && typeof v.v === 'string') n = v.v.length > 2 ? 1 : 0; else if (typeof v === 'string') n = v.length > 2 ? 1 : 0; else if (v && typeof v === 'object') n = 1; } catch (e) {} db.close(); done(n > 0); };
          g.onerror = function(){ db.close(); done(null); };
        } catch (e) { try { db.close(); } catch (x) {} done(null); }
      };
    } catch (e) { done(null); }
  });
}
var KEYS = ['projects', 'schedule', 'users', 'leads', 'projects__manifest', 'schedule__manifest', 'gc_deleted_projects', 'gc_deleted_schedule', 'gc_deleted_leads', 'gc_tombstones'];
function ask(){
  ST.asked = Date.now();
  var u = 'https://ieeonhpfahmwwecizdut.supabase.co/rest/v1/gc_kv?key=in.(' + KEYS.map(function(k){ return '"' + k + '"'; }).join(',') + ')&select=key,value,updated_at';
  return W.fetch(u, { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(function(r){ if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status)); return r.json(); });
}
function dead(rows, k){
  var d = {};
  rows.forEach(function(r){
    if (!r) return;
    if (r.key === 'gc_deleted_' + k) arr(r.value).forEach(function(id){ d[s(id && typeof id === 'object' ? id.id : id)] = 1; });
    if (r.key === 'gc_tombstones' && r.value && typeof r.value === 'object') Object.keys(r.value).forEach(function(t){ if (t.indexOf(k + ':') === 0) d[t.slice(k.length + 1)] = 1; });
  });
  try { (JSON.parse(lsGet('gc_deleted_' + k) || '[]') || []).forEach(function(id){ d[s(id)] = 1; }); } catch (e) {}
  return d;
}
function take(rows){
  if (!Array.isArray(rows)) return;
  var by = {}; rows.forEach(function(r){ if (r && r.key) by[r.key] = r.value; });
  var out = {};
  ['projects', 'schedule', 'leads', 'users'].forEach(function(k){
    if (by[k + '__manifest']) return;               /* a big list kept in pieces: the sync reads it whole */
    var v = by[k]; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
    if (!Array.isArray(v)) return;
    var d = k === 'users' ? {} : dead(rows, k);
    v = v.filter(function(x){ return x && typeof x === 'object' && !x.deleted && !x.tombstoned && !(x.id != null && d[s(x.id)]); });
    if (k === 'projects') { try { if (typeof W._gcStripDeletedProjects === 'function') v = arr(W._gcStripDeletedProjects(v)); } catch (e) {} }
    out[k] = v; ST.keys[k] = v.length;
  });
  L = out; ST.got = Date.now(); ST.ms = ST.got - ST.asked;
  poke();
  /* the app's data object may be rebuilt before the Field is drawn: look again a few times while the copy is in use */
  [300, 1000, 2500, 5000].forEach(function(ms){ NST.call(W, poke, ms); });
}
savedCopy().then(function(has){
  ST.saved = has;
  if (has !== false) return;                         /* a saved copy (or unknown): the app opens from it, nothing is asked */
  ask().then(take, function(e){ ST.err = s(e && e.message || e).slice(0, 120); });
});
})();
