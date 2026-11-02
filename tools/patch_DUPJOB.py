"""Idempotent patch DUPJOB: one job per estimate, only real PMs as PM, and a job type that is never a silent default.

  Owner 11/02 (Projects list): "S251 Hyatt Studios" (PM "Glenn Miller — 0 jobs · 16 leads · $0") and "P276 Hyatt Studios"
  (PM "Brittany Pucket") — "should never be 2, and I know it shouldn't have Brittany, she's office. It should have Glenn as
  estimator, no PM selected." Also G851 Shelby Farms with PM "Office"; X694 Studio Res / U932 Autozone with Glenn's stats
  line as PM; all of Glenn's jobs typed "Residential" though Glenn is the commercial estimator; "Head Start, when I added
  manually, I needed to add the commercial tag to it"; "when Nick or Wesley create leads into CompanyCam then they are
  GrayCo leads because we are owners; we will then assign PM".

  What happened (production gc_kv, read-only):
    • ESTIN (the background proposal maker) makes a bidding job for an estimate "that has none". Its only test was the
      in-memory window._crm.projects (estimate pid / estimateId). On 11/02 19:06:26 UTC, on the admin's computer, that list
      did not hold S251 at that moment, so a second job P276 was made for estimate mvpngqx4tzo, which already pointed at
      S251 (pid + S251.estimateId). 30 s later the same estimate's proposal went onto S251 again.
    • ESTIN set pm = e.pm || lead.pm || e.by || e.estimator: the ESTIMATOR became the PM. On 10/26 the estimator text was the
      workload hint "Glenn Miller — 0 jobs · 16 leads · $0" (saved as the name before OFFICEFIX 11/01); on 11/02 the
      builder re-opened that estimate, the hint matched no option, the select fell back to its FIRST option — the first
      employee, Brittany Pucket (office) — and the re-save made her the estimator, so P276 got her as PM. Shelby Farms'
      08/17 estimate had estimator "Office" (the builder lists every employee) → PM "Office".
    • Type: ESTIN copied the builder's job-type field ("Residential" is its first, default option) or 'Construction'.

  This patch:
  1. Helpers (window): _gcCanPM / _gcCanPMUser (a PM-role person or an owner/admin; never office / marketing, never a
     workload line), _gcIsOfficeUser, _gcCanEstimate, _gcCleanPerson (drops "— 3 jobs · …"), _gcJobTypeFor (lead / estimate
     type, bid invite or the commercial estimator → Commercial; the builder's default "Residential" and 'Construction'
     are not trusted; unknown → blank), _gcNewJobPeople (pm only a real PM; the estimator goes to estimator),
     _gcJobForEstimate (find the job by estimate pid / estimateId, lead link, PO, then normalized name + address — in the
     screen's list, this computer's saved list, and any list handed in), _gcJobsNotReady, _gcPmCell / _gcTypeCell,
     _gcCcCreatorRule (CompanyCam: an owner's project is a GrayCo lead with no PM; a non-PM creator is the estimator).
     Every job made by code (window._gcJA.stamp) passes _gcFixNewJob: a non-PM in pm moves to estimator; a missing or
     default type is filled from the best source or left blank with needsType.
  2. ESTIN: before it makes a job it also reads this computer's saved job list and the cloud's; no job while the list has
     not loaded, or while an estimate that names a job cannot be checked; pm / estimator / type from the helpers.
     The 📤 Send estimate path (ESTPDF) uses the same finder.
  3. PM pickers: the job's PM select (_pmList), "Who is the PM on this job?" (_gcChoosePM, no preselected PM), the
     workload lists, the lead assign dialog, the data "Fix" dialog, the insurance board and the lead form leave out office
     and marketing staff; any other PM select hides them (never the one already chosen). Launch Job no longer makes the
     office person who launches it the PM.
  4. Estimate builder: the estimator list leaves out office staff and workload lines; a saved estimator always re-opens
     as itself (never the first employee); a blank estimator is the signed-in person.
  5. Projects list: the PM cell shows the pm field only, a non-PM there is shown as "⚠ <name> (not a PM)"; an empty type
     is "⚠ Pick job type".
  6. A person adding a job picks the type (Launch Job / New Project / Field "＋ New project"): no preselected Residential.
  7. 🧾 Missing job data (netlify/functions/_lib/jobdata.js and its copy in this page): "Job type (pick one)" from the
     bidding stage; the builder's raw "Residential" / "Commercial" / "Construction" do not count as a type.
  8. CompanyCam import (page side; the server side is netlify/functions/companycam-sync.js): no default "Residential Reno";
     owners' projects are GrayCo leads with no PM; an estimator's are theirs as estimator, not PM.

Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_DUPJOB.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_DUPJOB__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)


def once(old, new, label, count=1):
    global src
    n = src.count(old)
    assert n == count, ('anchor count != %d' % count, label, n)
    src = src.replace(old, new)


# ── 1. helpers, before the first PM list (_pmList) ─────────────────────────────────────────────────────────────────────
HELPERS = r"""/* __GC_PATCH_DUPJOB__ — one job per estimate; only real PMs as PM; a job type is never a silent default (tools/patch_DUPJOB.py) */
(function(){
if (window.__GC_DUPJOB_H__) return; window.__GC_DUPJOB_H__ = true;
var W = window;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function norm(v){ return low(v).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
var STATS = /\s+[—–-]+\s+\d+\s+jobs?\b.*$/;
function clean(n){ return s(n).replace(STATS, '').replace(/\s+/g, ' ').trim(); }
function users(){ var u = arr(W._crm && W._crm.users); if (!u.length) u = arr(W.__gcDupUsers); else W.__gcDupUsers = u; return u; }
function userOf(n){ var k = low(clean(n)); if (!k) return null; return users().filter(function(u){ return low(clean(u.name)) === k || (k.indexOf('@') > 0 && low(u.email) === k); })[0] || null; }
function roleText(u){ return low(u && u.role) + ' ' + low(u && u.title); }
function isOfficeUser(u){ if (!u) return false; return /office|marketing|bookkeep|accounting|reception/.test(roleText(u)) || low(u.email).indexOf('office@') === 0 || /^office$/i.test(s(u.name)); }
function canPMUser(u){ if (!u || u.active === false || isOfficeUser(u)) return false; var r = low(u.role); return /project manager|\bpm\b|\bapm\b|assistant pm/.test(r) || /^(admin|owner)$/.test(r); }
function isOwnerUser(u){ return !!u && u.active !== false && !isOfficeUser(u) && /^(admin|owner)$/.test(low(u.role)); }
function canPM(n){ n = s(n); if (!n || STATS.test(n)) return false; return canPMUser(userOf(n)); }
/* for pick-lists built from names already on jobs: true only for what is surely not a PM (an unknown old name stays) */
function notPM(n){ n = s(n); if (!n) return false; if (STATS.test(n) || /^office$/i.test(n)) return true; var u = userOf(n); return !!u && !canPMUser(u); }
function canEstimate(n){ var u = userOf(n); return !!u && u.active !== false && !isOfficeUser(u); }
function commercialPerson(n){ var u = userOf(n); return !!u && /commercial/.test(roleText(u)); }
W._gcCleanPerson = clean; W._gcCanPM = canPM; W._gcCanPMUser = canPMUser; W._gcIsOfficeUser = isOfficeUser; W._gcNotPM = notPM;
W._gcCanEstimate = canEstimate; W._gcIsOwnerUser = isOwnerUser; W._gcUserOf = userOf;

/* ── job type ── */
var COMMERCIAL_TYPE = 'Commercial Reno';      /* the type the owner's commercial bids get (patch BIDROLE uses the same) */
var CRM_TYPES = ['Residential Reno', 'Commercial Reno', 'Commercial TI', 'New Construction', 'Fire Damage', 'Water Damage', 'Insurance Claim', 'Program Work', 'Whole-Home Reno', 'Roofing', 'Addition', 'Kitchen', 'Bath', 'Repair', 'Other'];
var RAW = /^(residential|commercial|insurance|construction)$/i;   /* the estimate builder's own field / ESTIN's old default */
function mapType(t){
  t = s(t); if (!t) return '';
  for (var i = 0; i < CRM_TYPES.length; i++) if (low(CRM_TYPES[i]) === low(t)) return CRM_TYPES[i];
  if (/commercial|tenant|\bti\b|retail|industrial|government|municipal/i.test(t)) return COMMERCIAL_TYPE;
  if (/insur|claim/i.test(t)) return 'Insurance Claim';
  if (/water/i.test(t)) return 'Water Damage';
  if (/fire|smoke/i.test(t)) return 'Fire Damage';
  if (/roof/i.test(t)) return 'Roofing';
  if (/new (build|construction)/i.test(t)) return 'New Construction';
  return '';
}
function isBidInvite(l){
  if (!l) return false;
  var t = [l.leadKind, l.kind, l.source, l.leadSource, l.via, l.origin].map(s).join(' ');
  return /\bbid\b|bid invite|invitation to bid|buildingconnected|planhub|isqft|constructconnect|dodge|bid ?board|bid portal/i.test(t) || !!s(l.bidPortalJob) || l.isBid === true;
}
/* o: { est, lead, people: [names] } → a CRM job type, or '' when nothing says it */
function jobTypeFor(o){
  o = o || {}; var e = o.est || {}, l = o.lead || null;
  var people = [e.estimator, e.by, e.author, l && l.estimator, l && l.pm].concat(Array.isArray(o.people) ? o.people : []).map(clean).filter(Boolean);
  if (people.some(commercialPerson) || isBidInvite(l) || /commercial/i.test(s(e.jobType) + ' ' + s(l && (l.projectType || l.type || l.leadKind)))) return COMMERCIAL_TYPE;
  var lt = l ? mapType(l.projectType || l.type) : ''; if (lt) return lt;
  var et = s(e.jobType || e.type); if (et && !/^(residential|construction)$/i.test(et)) { var m = mapType(et); if (m) return m; }
  return '';
}
W._gcJobTypeFor = jobTypeFor; W._gcMapJobType = mapType; W._gcCommercialPerson = commercialPerson;
/* a new job's people: pm only a real PM (an estimator is never made the PM); the estimator goes to estimator */
W._gcNewJobPeople = function(e, l){
  e = e || {};
  var pm = [e.pm, l && l.pm].map(clean).filter(canPM)[0] || '';
  var est = [l && l.estimator, e.estimator, e.by].map(clean).filter(canEstimate)[0] || '';
  return { pm: pm, estimator: est };
};

/* ── the job an estimate belongs to — wherever the job list is ── */
var IDBP = { list: [], at: 0 };
function refreshIdb(){ try { if (typeof W.idbGet === 'function') Promise.resolve(W.idbGet('projects')).then(function(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (x) { v = null; } } if (Array.isArray(v)) { IDBP.list = arr(v); IDBP.at = Date.now(); } }, function(){}); } catch (e) {} }
W._gcDupIdbProjects = function(){ return IDBP.list; };
function dead(id){ try { return typeof W._gcIsTombstoned === 'function' && W._gcIsTombstoned('projects', id); } catch (e) { return false; } }
function leadsNow(){ var l = []; try { l = arr(W.__gcLeadsLive); } catch (e) {} if (!l.length) l = arr(W._crm && W._crm.leads); return l; }
W._gcJobForEstimate = function(e, extra){
  if (!e) return null;
  var seen = {}, all = [];
  [arr(W._crm && W._crm.projects), arr(extra), IDBP.list].forEach(function(L){ L.forEach(function(p){ var id = s(p.id); if (id && !seen[id] && p.deleted !== true && !dead(id)) { seen[id] = 1; all.push(p); } }); });
  if (!all.length) return null;
  var byId = function(id){ id = s(id); return id ? all.filter(function(p){ return s(p.id) === id; })[0] || null : null; };
  var hit = byId(e.pid) || byId(e.projectId) || byId(e.jobId);
  if (hit) return hit;
  var eid = s(e.id);
  if (eid) { hit = all.filter(function(p){ return s(p.estimateId) === eid || s(p._lastEstId) === eid || s(p.estId) === eid; })[0]; if (hit) return hit; }
  var lid = s(e.leadId || e.gdocLeadId || e.estinLeadId);
  if (lid) {
    hit = all.filter(function(p){ return s(p.leadId) === lid || s(p.fromLeadId) === lid; })[0]; if (hit) return hit;
    var ld = leadsNow().filter(function(l){ return s(l.id) === lid; })[0];
    if (ld) { hit = byId(ld.projectId) || byId(ld.pid) || byId(ld.convertedTo) || byId(ld.jobId); if (hit) return hit; }
  }
  var po = s(e.autoPO); if (po) { hit = all.filter(function(p){ return s(p.autoPO) === po; })[0]; if (hit) return hit; }
  var nm = norm(e.name), ad = norm(e.address);
  if (nm && ad) {
    var same = all.filter(function(p){ return norm(p.name) === nm && norm(p.address || p.jobAddress) === ad && !/lost|dead|cancel|archiv/i.test(s(p.status)) && p.archived !== true; });
    if (same.length) return same.sort(function(a, b){ return s(a.createdAt || a.created) < s(b.createdAt || b.created) ? -1 : 1; })[0];
  }
  return null;
};
/* the screen's job list is not there yet (start-up), or is much shorter than this computer's saved one */
W._gcJobsNotReady = function(a, b){
  var live = arr(W._crm && W._crm.projects).length;
  var real = function(L){ return arr(L).filter(function(p){ try { return !(typeof W._gcNotAJob === 'function' && W._gcNotAJob(p)) && p.deleted !== true; } catch (e) { return true; } }).length; };
  var saved = Math.max(real(IDBP.list), real(a), real(b));
  return !live || (saved > 20 && live < saved * 0.8);
};

/* ── every job made by code: a non-PM in pm becomes the estimator; the type from the best source ── */
function estOf(id){ id = s(id); if (!id) return null; var l = arr(W._gcEstimatesState); if (!l.length) l = arr(W._crm && W._crm.estimates); return l.filter(function(e){ return s(e.id) === id; })[0] || null; }
function leadOf(id){ id = s(id); return id ? leadsNow().filter(function(l){ return s(l.id) === id; })[0] || null : null; }
W._gcFixNewJob = function(p, via){
  if (!p || typeof p !== 'object') return p;
  var pm = s(p.pm);
  if (pm && !canPM(pm) && (STATS.test(pm) || userOf(pm))) {
    var c = clean(pm);
    if (!s(p.estimator) && canEstimate(c)) p.estimator = c;
    p.pmCleared = { was: pm, at: new Date().toISOString(), why: 'not a PM (patch DUPJOB)' };
    p.pm = '';
  }
  var t = s(p.type);
  if (!t || RAW.test(t)) {
    var e = estOf(p.estimateId || p._lastEstId || p.estId), l = leadOf(p.leadId || p.fromLeadId);
    var nt = jobTypeFor({ est: e || { jobType: t }, lead: l, people: [p.estimator, p.pmCleared && p.pmCleared.was, p.ccCreator] });
    if (!nt && t && !/^(residential|construction)$/i.test(t)) nt = mapType(t);
    p.type = nt;
  }
  if (/commercial/i.test(s(p.type))) p.isCommercial = true;
  if (s(p.type)) delete p.needsType; else p.needsType = true;
  return p;
};
/* CompanyCam: an owner's project is a GrayCo lead (no PM until an owner assigns one); a non-PM creator is its estimator */
W._gcCcCreatorRule = function(j){
  if (!j || typeof j !== 'object') return j;
  var who = s(j.pmSourced === true ? j.pm : '') || s(j.ccCreator), u = userOf(who);
  if (j.pmSourced === true && s(j.pm)) {
    if (isOwnerUser(u)) {
      Object.assign(j, { pm: '', estimator: '', commissionSource: 'company', leadSource: 'GrayCo', broughtInBy: '', pmSourced: false, selfGenerated: false, owner: 'GrayCo',
        leadIsMine: false, ownLead: false, graycoOrigin: true, leadOwner: '', leadSourceTag: 'GrayCo lead', ccOwnerMade: clean(who), createdBy: clean(who) || j.createdBy });
    } else if (u && !canPMUser(u)) { j.estimator = clean(j.pm); j.pm = ''; }
  }
  if (!s(j.type)) { var t = commercialPerson(who) || commercialPerson(j.estimator) ? COMMERCIAL_TYPE : ''; j.type = t; if (t) j.isCommercial = true; else j.needsType = true; }
  return j;
};
/* ── the Projects list cells ── */
W._gcPmCell = function(p){ var v = s(p && p.pm); if (!v) return ''; if (canPM(v)) return clean(v); if (!STATS.test(v) && !/^office$/i.test(v) && !userOf(v)) return v; return '⚠ ' + clean(v) + ' (not a PM)'; };
W._gcTypeCell = function(p){ return '⚠ Pick job type'; };
/* the estimate builder's estimator select: the saved name, never the first employee */
W._gcSetEstPick = function(el, v){
  if (!el) return; v = clean(v);
  if (el.options && v && !Array.prototype.some.call(el.options, function(o){ return o.value === v || clean(o.text) === v; })) { var o = document.createElement('option'); o.value = v; o.text = v; el.appendChild(o); }
  if (el.options && !v && !Array.prototype.some.call(el.options, function(o){ return o.value === ''; })) { var b = document.createElement('option'); b.value = ''; b.text = ''; el.insertBefore(b, el.firstChild); }
  try { el.value = v; } catch (e) {}
};

var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
/* the stamp every code-made job passes through (patch JA): fix it there */
function hookStamp(){
  var JA = W._gcJA; if (!JA || typeof JA.stamp !== 'function' || JA.stamp.__dupjob) return;
  var orig = JA.stamp;
  var f = function(p, ctx){ var r = orig.apply(this, arguments); try { W._gcFixNewJob(r && typeof r === 'object' ? r : p, ctx); } catch (e) {} return r; };
  Object.keys(orig).forEach(function(k){ if (!(k in f)) f[k] = orig[k]; });
  f.__dupjob = true; if (orig.__df) f.__df = true; JA.stamp = f;
}
/* any PM select not already filtered: office / marketing people are hidden (never the chosen one) */
function hidePickers(){
  var sels = document.querySelectorAll('select'); if (!sels.length) return;
  for (var i = 0; i < sels.length; i++) {
    var sel = sels[i], opts = sel.options; if (!opts || opts.length < 2 || opts.length > 80) continue;
    var hint = low((sel.id || '') + ' ' + (sel.name || '') + ' ' + (sel.getAttribute('aria-label') || '') + ' ' + ((sel.previousElementSibling && sel.previousElementSibling.textContent) || '') + ' ' + ((sel.parentElement && sel.parentElement.firstChild && sel.parentElement.firstChild.textContent) || '').slice(0, 60));
    if (!/\bpm\b|project manager|_gcpmsel|ldi-pm/.test(hint) || /estimat|filter|every pm|everyone/.test(hint)) continue;
    for (var k = 0; k < opts.length; k++) { var o = opts[k], v = o.value || o.text; if (!v || o.selected) continue; if (notPM(clean(v)) || notPM(v)) { if (!o.hidden) { o.hidden = true; o.disabled = true; } } }
  }
}
refreshIdb();
RI.call(W, function(){ try { hookStamp(); } catch (e) {} }, 1500);
RI.call(W, function(){ try { if (!document.hidden) refreshIdb(); } catch (e) {} }, 60000);
RI.call(W, function(){ try { hidePickers(); } catch (e) {} }, 2500);
})();
"""

once('window._pmList=function(An){var have=(An||[]).filter(function(u){return u&&u.active;});',
     HELPERS + 'window._pmList=function(An){var have=(An||[]).filter(function(u){return u&&u.active&&(!window._gcCanPMUser||window._gcCanPMUser(u));});',
     '_pmList')

# ── 2. ESTIN: find the job everywhere before making one ─────────────────────────────────────────────────────────────────
once("""function jobOf(e){
  if (!e) return null;
  return proj(e.pid) || projects().filter(function(p){ return s(p.estimateId) === s(e.id) || s(p._lastEstId) === s(e.id); })[0] || null;
}""", """var PROJ_IDB = [], PROJ_CLOUD = [], CLOUD_OK = false;   /* patch DUPJOB: this computer's saved job list + the cloud's, read before a job is made */
function jobOf(e){
  if (!e) return null;
  return proj(e.pid) || projects().filter(function(p){ return s(p.estimateId) === s(e.id) || s(p._lastEstId) === s(e.id); })[0]
    || (W._gcJobForEstimate ? W._gcJobForEstimate(e, PROJ_IDB.concat(PROJ_CLOUD)) : null) || null;
}
function cloudJobs(){ CLOUD_OK = false; return kvRead('projects').then(function(v){ PROJ_CLOUD = arr(v); CLOUD_OK = PROJ_CLOUD.length > 0; }, function(){ PROJ_CLOUD = []; }); }""", 'ESTIN jobOf')

once("function loadLists(){ return Promise.all([idb('estimates'), idb('projectDocs'), idb(REQ_KEY), idb('leads')]).then(function(v){ if (Array.isArray(v[0])) EST_IDB = v[0];",
     "function loadLists(){ return Promise.all([idb('estimates'), idb('projectDocs'), idb(REQ_KEY), idb('leads'), idb('projects')]).then(function(v){ if (Array.isArray(v[4])) PROJ_IDB = arr(v[4]); /* patch DUPJOB */ if (Array.isArray(v[0])) EST_IDB = v[0];",
     'ESTIN loadLists')

once("""function ensureJob(e){
  var p = jobOf(e); if (p) return p;
  var l = leadOf(e), list = projects().slice();""", """function ensureJob(e){
  var p = jobOf(e); if (p) return p;
  /* patch DUPJOB: never a second job because this screen's list is not all there */
  if (W._gcJobsNotReady && W._gcJobsNotReady(PROJ_IDB, PROJ_CLOUD)) return null;
  if (!CLOUD_OK && (s(e.pid) || s(e.autoPO))) return null;
  var l = leadOf(e), list = projects().slice();
  var NJ = W._gcNewJobPeople ? W._gcNewJobPeople(e, l) : { pm: s(e.pm) || s(l && l.pm), estimator: s(l && l.estimator) };""", 'ESTIN ensureJob head')

once("address: s(e.address) || s(l && l.address), autoPO: po, status: 'bidding', type: s(e.jobType || e.type) || s(l && l.projectType) || 'Construction', contract: 0, estimateId: s(e.id), _lastEstId: s(e.id),\n    pm: s(e.pm) || s(l && l.pm) || s(e.by || e.estimator), estimator: s(l && l.estimator),",
     "address: s(e.address) || s(l && l.address), autoPO: po, status: 'bidding', type: W._gcJobTypeFor ? W._gcJobTypeFor({ est: e, lead: l }) : (s(e.jobType || e.type) || s(l && l.projectType)), contract: 0, estimateId: s(e.id), _lastEstId: s(e.id),\n    pm: NJ.pm, estimator: NJ.estimator,   /* patch DUPJOB: the estimator is never made the PM */",
     'ESTIN ensureJob fields')

once("""  return loadLists().then(function(){ return go(); });
  function go(){
  var p = ensureJob(e);""", """  return loadLists().then(function(){ return jobOf(e) ? null : cloudJobs(); }).then(function(){ return go(); });   /* patch DUPJOB */
  function go(){
  var p = ensureJob(e);
  if (!p) { delete S.busy[e.id]; note('Proposal for "' + s(e.name) + '" waits: its job could not be checked on this computer yet (job list loading)'); return { skip: 'jobs not loaded' }; }""", 'ESTIN process')

# ESTPDF (📤 Send estimate) makes a job the same way
once("""function ensureJob(e){
  var p = jobOf(e); if (p) return p;
  var l = leadOf(e), pos = projects()""", """function ensureJob(e){
  var p = jobOf(e) || (W._gcJobForEstimate ? W._gcJobForEstimate(e) : null); if (p) return p;   /* patch DUPJOB */
  if (W._gcJobsNotReady && W._gcJobsNotReady()) throw new Error('The job list is still loading on this computer — try again in a moment.');
  var l = leadOf(e), pos = projects()""", 'ESTPDF ensureJob')
once("address: s(e.address) || s(l && l.address), autoPO: po, status: 'bidding', type: s(e.jobType) || s(l && l.projectType) || 'Construction', contract: 0, estimateId: s(e.id), _lastEstId: s(e.id),\n    pm: s(e.pm) || s(l && l.pm), clientEmail:",
     "address: s(e.address) || s(l && l.address), autoPO: po, status: 'bidding', type: W._gcJobTypeFor ? W._gcJobTypeFor({ est: e, lead: l }) : (s(e.jobType) || s(l && l.projectType)), contract: 0, estimateId: s(e.id), _lastEstId: s(e.id),\n    pm: W._gcNewJobPeople ? W._gcNewJobPeople(e, l).pm : (s(e.pm) || s(l && l.pm)), estimator: W._gcNewJobPeople ? W._gcNewJobPeople(e, l).estimator : '', clientEmail:",
     'ESTPDF fields')

# React "make a job from this estimate": no default Residential, the estimate's maker is not the PM by default
once('type:T.type||"Residential Reno"', 'type:T.type||""/* patch DUPJOB */', 'estimate→job type', count=2)

# ── 3. PM pickers ───────────────────────────────────────────────────────────────────────────────────────────────────────
once("""        if(role.indexOf('manager')>-1 || role.indexOf('estimator')>-1 || role.indexOf('admin')>-1 || role.indexOf('owner')>-1){
          out.push(u.name||u.email);""", """        if(window._gcCanPMUser ? window._gcCanPMUser(u) : (role.indexOf('manager')>-1 || role.indexOf('admin')>-1 || role.indexOf('owner')>-1)){   /* patch DUPJOB: PMs and owners only */
          out.push(u.name||u.email);""", '_gcPMList')
once("        var def=defaultPM||currentUserName()||pms[0]||'';",
     "        var def=(pms.indexOf(defaultPM)>=0?defaultPM:'')||(pms.indexOf(currentUserName())>=0?currentUserName():'');   /* patch DUPJOB: an estimator is never preselected as PM */",
     '_gcChoosePM default')
once("        var opts=pms.map(function(n){", "        var opts='<option value=\"\"'+(def?'':' selected')+'>— no PM yet —</option>'+pms.map(function(n){", '_gcChoosePM blank')
once("  var list = users().filter(function(u){ return u.active !== false && /pm|project manager|superintendent|estimator|admin|owner/i.test(s(u.role) + ' ' + s(u.payType) + ' ' + s(u.title)); }).map(function(u){ return s(u.name); });",
     "  var list = users().filter(function(u){ return u.active !== false && !(W._gcIsOfficeUser && W._gcIsOfficeUser(u)) && /pm|project manager|superintendent|estimator|admin|owner/i.test(s(u.role) + ' ' + s(u.payType) + ' ' + s(u.title)); }).map(function(u){ return s(u.name); });   /* patch DUPJOB: never office / marketing */",
     'workload pms')
once("function pmNames(){ var seen = {}; return users().filter(function(u){ return u && u.name && u.active !== false && !seen[u.name] && (seen[u.name] = 1); }).map(function(u){ return u.name; }).sort(); }",
     "function pmNames(){ var seen = {}; return users().filter(function(u){ return u && u.name && u.active !== false && !(window._gcIsOfficeUser && window._gcIsOfficeUser(u)) && !seen[u.name] && (seen[u.name] = 1); }).map(function(u){ return u.name; }).sort(); }   /* patch DUPJOB */",
     'lead assign pmNames')
once("/manager|pm\\b|admin|owner|super|estimat|office/i.test(s(u.role) + ' ' + s(u.payType) + ' ' + s(u.title))) { seen[low(n)] = 1; out.push(n); } }); arr(C().projects).forEach(function(p){ var n = s(p.pm); if (n && !seen[low(n)]) {",
     "/manager|pm\\b|admin|owner|super|estimat/i.test(s(u.role) + ' ' + s(u.payType) + ' ' + s(u.title)) && !(W._gcIsOfficeUser && W._gcIsOfficeUser(u))) { seen[low(n)] = 1; out.push(n); } }); arr(C().projects).forEach(function(p){ var n = s(p.pm); if (n && !(W._gcNotPM && W._gcNotPM(n)) && !seen[low(n)]) {",
     'datafull fix pmNames')
once("users().forEach(function(u){ if (/project manager|pm\\b|admin|insurance/i.test(s(u.role) + ' ' + s(u.profile))) o[s(u.name)] = 1; }); ROWS.forEach(function(r){ if (r.pm) o[r.pm] = 1; });",
     "users().forEach(function(u){ if (/project manager|pm\\b|admin|insurance/i.test(s(u.role) + ' ' + s(u.profile)) && !(W._gcIsOfficeUser && W._gcIsOfficeUser(u))) o[s(u.name)] = 1; }); ROWS.forEach(function(r){ if (r.pm && !(W._gcNotPM && W._gcNotPM(r.pm))) o[r.pm] = 1; });   /* patch DUPJOB */",
     'insurance pms')
once('{k:"pm",l:"Assigned PM / estimator",type:"select",opts:["",...An.filter(M=>M.active).map(M=>M.name)]}',
     '{k:"pm",l:"Assigned PM / estimator",type:"select",opts:["",...An.filter(M=>M.active&&!(window._gcIsOfficeUser&&window._gcIsOfficeUser(M))).map(M=>M.name)]}',
     'lead form pm')
once('pm:Le.pm||n.name,', 'pm:Le.pm||(window._gcCanPM&&!window._gcCanPM(n.name)?"":n.name)/* patch DUPJOB */,', 'launch pm', count=2)

# ── 4. estimate builder estimator ───────────────────────────────────────────────────────────────────────────────────────
once("    users.forEach(function(u){ if(u && u.name && u.active===false) firedNames[u.name]=1; });",
     "    users.forEach(function(u){ if(u && u.name && (u.active===false || (window._gcIsOfficeUser && window._gcIsOfficeUser(u)))) firedNames[u.name]=1; });   /* patch DUPJOB: office staff are not estimators */",
     'builder estimators office')
once("        if(pm && !firedNames[pm]) list.push(pm);",
     "        if(window._gcCleanPerson) pm=window._gcCleanPerson(pm);   /* patch DUPJOB: a workload line is not a name */\n        if(pm && !firedNames[pm] && (!window._gcUserOf || window._gcUserOf(pm))) list.push(pm);",
     'builder estimators from jobs')
once("    sel.innerHTML = names.map(function(n){ return '<option>'+n.replace(/</g,'&lt;')+'</option>'; }).join('');",
     "    if(window._gcCleanPerson) cur=window._gcCleanPerson(cur);\n    sel.innerHTML = '<option value=\"\"></option>' + names.map(function(n){ return '<option>'+n.replace(/</g,'&lt;')+'</option>'; }).join('');   /* patch DUPJOB: no silent first employee */",
     'builder estimator fill')
once("  qs('ej-est').value=f.estimator||'Wesley';qs('ej-date')",
     "  if(window._gcSetEstPick) window._gcSetEstPick(qs('ej-est'), f.estimator); else qs('ej-est').value=f.estimator||'Wesley';qs('ej-date')",
     'builder loadSlotState')

# ── 5. Projects list cells ──────────────────────────────────────────────────────────────────────────────────────────────
once('children:jt.pm||e.jsx("span",{style:{color:u.tx3},children:"—"})}),e.jsx("td",{style:{padding:"6px 10px"},children:jt.type||"—"})',
     'children:(window._gcPmCell?window._gcPmCell(jt):jt.pm)||e.jsx("span",{style:{color:u.tx3},children:"—"})}),e.jsx("td",{style:{padding:"6px 10px"},children:jt.type||(window._gcTypeCell?e.jsx("span",{style:{color:"#b45309",fontWeight:700},children:window._gcTypeCell(jt)}):"—")})',
     'projects list cells')

# ── 6. a person adding a job picks the type ────────────────────────────────────────────────────────────────────────────
once('type:"Residential Reno",pm:"",soldBy:""', 'type:"",pm:"",soldBy:""', 'launch default type')
once('defaultValue:Le.type,onBlur:y=>dn({...Le,type:y.target.value}),children:nd.map(y=>e.jsx("option",{children:y},y))',
     'defaultValue:Le.type,onBlur:y=>dn({...Le,type:y.target.value}),onChange:y=>dn({...Le,type:y.target.value}),children:[e.jsx("option",{value:"",children:"— pick the job type —"},"_pick")].concat(nd.map(y=>e.jsx("option",{children:y},y)))',
     'launch type select')
once('if(!Le.name){se("Project name required");return}', 'if(!Le.name){se("Project name required");return}if(!Le.type){se("Pick the job type first (Residential, Commercial …)");return}', 'launch type required', count=2)
once("<select id=\"gc-cc2-type\" style=\"' + inp + '\"><option>Residential Reno</option>",
     "<select id=\"gc-cc2-type\" style=\"' + inp + '\"><option value=\"\">— pick the kind of work —</option><option>Residential Reno</option><option>Commercial Reno</option><option>Commercial TI</option>",
     'field type select')
once("    if (!name && !addr) { q('gc-cc2-err').textContent = 'Add a customer name or an address.'; return; }",
     "    if (!name && !addr) { q('gc-cc2-err').textContent = 'Add a customer name or an address.'; return; }\n    if (!s(q('gc-cc2-type').value)) { q('gc-cc2-err').textContent = 'Pick the kind of work (job type).'; return; }   /* patch DUPJOB */",
     'field type required')

# ── 7. Missing job data: the type from the bidding stage (the page's copy of _lib/jobdata.js) ──────────────────────────
JD_OLD = "{ key: 'type', label: 'Job type', group: 'Job', from: 'won', test: function(p){ return !!s(p.type || p.jobType); }, fix: { field: 'type', input: 'type' } },"
JD_NEW = "{ key: 'type', label: 'Job type (pick one)', group: 'Job', from: 'bidding', test: function(p){ var t = s(p.type || p.jobType); return !!t && !/^(residential|commercial|insurance|construction)$/i.test(t); }, fix: { field: 'type', input: 'type' } },"
once(JD_OLD, JD_NEW, 'jobdata copy')
once("     bidding   (bid / lead / estimating …)    job name + job address. Nothing else is asked (photos are optional).",
     "     bidding   (bid / lead / estimating …)    job name + job address + job type (patch DUPJOB, owner 11/02: every job has its type). Nothing else is asked (photos are optional).",
     'jobdata copy comment')

# ── 8. CompanyCam import, page side ─────────────────────────────────────────────────────────────────────────────────────
once("    address: p.address || '', type: 'Residential Reno', status: 'bidding', contract: 0, source: 'companycam',\n    ccamId: String(p.id),",
     "    address: p.address || '', type: '', status: 'bidding', contract: 0, source: 'companycam',   /* patch DUPJOB: no default type */\n    ccamId: String(p.id),",
     'cc client type')
once("  if (pm) { j.pm = pm; j.leadSource = 'Self-generated (' + pm + ')';",
     "  if (pm) { try { var _cu = window._gcUserOf && window._gcUserOf(pm); if (_cu && window._gcIsOwnerUser && window._gcIsOwnerUser(_cu)) { j.ccOwnerMade = pm; j.createdBy = pm; pm = ''; } } catch (e) {} }   /* patch DUPJOB: an owner's project is a GrayCo lead */\n  if (pm) { j.pm = pm; j.leadSource = 'Self-generated (' + pm + ')';",
     'cc client owner')
once("  return j;\n}\nasync function makeJobs(items, byHand){",
     "  try { if (window._gcCcCreatorRule) window._gcCcCreatorRule(j); } catch (e) {}   /* patch DUPJOB */\n  return j;\n}\nasync function makeJobs(items, byHand){",
     'cc client rule')

open(path, 'w', encoding='utf-8').write(src)
print('patched DUPJOB')
