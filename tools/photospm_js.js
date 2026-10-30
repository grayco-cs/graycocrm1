/* ══ PHOTOSPM (__GC_PATCH_PHOTOSPM__): whose projects GrayCo Photos shows ══
   Everyone but an admin / owner / office sees only the jobs the CRM's own Projects list shows them, through the very
   same function (window._gcProjVisible: a PM / APM / super / crew / insurance / mitigation person — the jobs where they
   are the PM, window._gcSamePM; an estimator — the jobs they estimated, or every job when their Projects list is on
   "All company projects"); a lead or CompanyCam-only project also when it is assigned to / was made by them.
   That covers the home, the feed, search, Map, Activity, a project's page and photo viewer and the Team tab's photo strips.
   Adding photos is NOT limited: the camera's job list keeps every job, the upload goes into that job's data and syncs as
   always ("Added 3 photos to <job>"), and the job's gallery still only shows to its own people.
   An admin / owner / office sees everything and picks one PM ("All PMs" by default, remembered on this computer), or
   "No PM": jobs whose PM is empty or is not a current person in Admin → Employees. They can also set a job's PM here
   ("PM: <name> ▾" on a project card and on the project page): the same write as the job panel's Edit Project → PM → Save.
   The filter is display only: items(), the sync, the CompanyCam fetches, uploads, the sub portal and the "shared" flag
   never read it. Memoized on pvVer like the rest of PHOTOS2 (+ the CRM's project list itself); no timers, no observers. */
var PMF_NONE = '__none', pmMemo = null, pmfC = { k: null, v: '' }, pmP = null, pmGen = 0;
function pmCss(){ return '\n' + __PM_CSS__; }
function pmRole(){
  try { if (window._gcRP && typeof window._gcRP.role === 'function') { var r = s(window._gcRP.role()); if (r) return r; } } catch (e) {}
  var u = myUser(); return s(u && u.role);
}
function pmVas(){ try { return !!(window._gcVAS && typeof window._gcVAS.active === 'function' && window._gcVAS.active()); } catch (e) { return false; } }
/* admin, owner or office: every project + the PM switcher (an admin's "View as" follows the role being viewed) */
function pmSeesAll(){ var r = pmRole(); if (pmVas()) return /^(admin|office)/i.test(r); return isOffice() || /^(admin|office)/i.test(r); }
function pmLimited(){ return !pmSeesAll(); }
/* the Projects list's own rule for one job (patch HOT2 / PMG: _gcProjVisible → _gcSamePM, or an estimator's jobs) */
function pmJobVisible(raw, me){
  try { if (typeof window._gcProjVisible === 'function') return !!window._gcProjVisible(raw, me); } catch (e) {}
  return pmSame(raw && raw.pm, me, raw);
}
function pmEstMode(){ try { return window._gcEstProjects && typeof window._gcEstProjects.mode === 'function' ? s(window._gcEstProjects.mode()) : ''; } catch (e) { return ''; } }
function pmMe(){
  var u = null; try { if (typeof window._gcMeUser === 'function') u = window._gcMeUser(); } catch (e) {}
  u = u || myUser() || { name: myName(), email: myEmail() };
  try { if (typeof window._gcVASUser === 'function') u = window._gcVASUser(u) || u; } catch (e) {}
  return u;
}
function pmSame(pm, u, raw){
  try { if (typeof window._gcSamePM === 'function') return !!window._gcSamePM(pm, u, raw); } catch (e) {}
  var p = low(pm); return !!p && (p === low(u && u.name) || p === low(u && u.email));
}
/* the admin's pick: '' = All PMs, PMF_NONE = no PM set, else the PM's name (lower case) */
function pmfKey(){ return 'gcu_pmf:' + (myKey() || 'me'); }
function pmfGet(){ var k = pmfKey(); if (pmfC.k !== k) pmfC = { k: k, v: s(jGet(k, '')) }; return pmfC.v; }
function pmfSet(v){ pmfC = { k: pmfKey(), v: s(v) }; jSet(pmfC.k, pmfC.v); }
/* the projects this person's Photos home shows (+ the switcher's PMs for an admin); re-made only when pvVer or the pick changes */
function pmScope(its){
  var all = pmSeesAll(), lim = !all, me = lim ? pmMe() : null, f = all ? pmfGet() : '';
  var P = crm().projects; if (P !== pmP) { pmP = P; pmGen++; }   /* a job's PM changed (here or on another computer) */
  var k = pvVer + '|' + pmGen + '|' + its.length + '|' + (all ? 'a:' + f : 'l:' + low(me && me.name) + '|' + low(me && me.email) + '|' + pmRole() + '|' + pmEstMode());
  if (pmMemo && pmMemo.k === k) return pmMemo;
  var out = its, pms = [], none = 0;
  if (all) {
    /* a chip per current person who is the PM of at least one job; the rest of the jobs are "No PM" */
    var canon = {}, label = {}, act = {}, cnt = {}, isJob = {}, c = function(pm){ var p = low(pm); return p ? canon[p] || p : ''; };
    arr(crm().users).forEach(function(u){ var n = low(u && u.name); if (!n) return; if (!label[n]) label[n] = s(u.name); if (u.active !== false && !u.tombstoned && !u.departed) act[n] = 1; [u.name, u.email].concat(arr(u.aka)).forEach(function(x){ var t = low(x); if (t && !canon[t]) canon[t] = n; }); });
    var noPm = function(it){ var p = c(it.pm); return it.kind === 'job' && !(p && act[p]); };
    its.forEach(function(it){ var p = c(it.pm); if (p && act[p]) { cnt[p] = (cnt[p] || 0) + 1; if (it.kind === 'job') isJob[p] = 1; } else if (it.kind === 'job') none++; });
    pms = Object.keys(isJob).map(function(p){ return { k: p, name: label[p], n: cnt[p] }; }).sort(function(a, b){ return low(a.name) < low(b.name) ? -1 : 1; });
    if (f === PMF_NONE && none) out = its.filter(noPm);
    else if (f && f !== PMF_NONE && isJob[f]) out = its.filter(function(it){ return c(it.pm) === f; });
    else f = '';
  } else out = its.filter(function(it){ return pmJobVisible(it.raw, me) || (it.kind !== 'job' && pmSame(it.pm, me, it.raw)); });
  var ids = {}; out.forEach(function(it){ ids[it.id] = 1; });
  pmMemo = { k: k, list: out, ids: ids, admin: all, lim: lim, f: f, pms: pms, none: none, total: its.length };
  return pmMemo;
}
/* Map / Activity / project page / Team: the person's own jobs only (an admin's pick is for the home screen) */
function pmOwn(){ var its = items(); return pmLimited() ? pmScope(its).list : its; }
function pmOnly(list){ if (!pmLimited()) return list; var ids = pmScope(items()).ids; return list.filter(function(r){ return r && ids[r.jobId]; }); }
function pmHidden(jobId){ return !!jobId && pmLimited() && !pmScope(items()).ids[String(jobId)]; }
function pmHiddenHtml(jobId){
  var it = itemById(jobId);
  return '<div class="gcu-pad"><div class="gcu-box" data-pmhidden="1"><b>Not one of your jobs</b><span class="gcu-sm">' + (it ? 'Photos you add to ' + esc(it.name) + ' are saved to that job for the company. ' : '') +
    'Its photos show to the job’s PM and the office.</span><button class="gcu-btn ghost" data-a="tab" data-v="projects">Back to my projects</button></div></div>';
}
function pmAddedText(n, it){ return 'Added ' + n + ' photo' + (n === 1 ? '' : 's') + ' to ' + (it ? it.name : 'the job'); }
function pmPickName(sc){ if (!sc || !sc.admin || !sc.f) return ''; if (sc.f === PMF_NONE) return 'No PM'; var p = sc.pms.filter(function(x){ return x.k === sc.f; })[0]; return p ? p.name : ''; }
function pmSub(d){
  var n = pmPickName(d.sc);
  if (!n) return 'Here is what is happening across your projects.';
  return n === 'No PM' ? 'These jobs need a PM.' : 'Here is what is happening across ' + first(n) + '’s projects.';
}
function pmBar(d){
  var sc = d.sc; if (!sc || !sc.admin || (!sc.pms.length && !sc.none)) return '';
  var b = function(k, label, full, n, color){
    var on = sc.f === k;
    return '<button class="pv-fc pv-pmc' + (on ? ' on' : '') + '" data-a="pmf" data-v="' + esc(k) + '" aria-pressed="' + on + '" title="' + esc(full) + '">' + (color ? '<i style="background:' + color + '"></i>' : '') + esc(label) + ' <em>' + n + '</em></button>';
  };
  return '<div class="pv-pms" role="group" aria-label="Show the projects of one PM"><span class="pv-pml">PM</span>' + b('', 'All PMs', 'Every project', sc.total, '') +
    sc.pms.map(function(p){ return b(p.k, short(p.name), p.name + ' — projects where they are the PM', p.n, colorOf(p.name)); }).join('') +
    (sc.none ? b(PMF_NONE, 'No PM', 'Jobs with no PM, or a PM who is not on the team any more', sc.none, '#cfd2dd') : '') + '</div>';
}
/* ── set a job's PM from here (admins / office only; a PM never sees it) ──
   The job panel's Edit Project → PM → Save is Wn(list → list.map(job → {...job, ...edited})) + the open item; the same
   write goes through window._setProjects (the J-safe setter of that very state), stamped like the panel's other edits.
   From there the CRM does what it does for any PM change: IndexedDB, the live push to the cloud (tombstone-aware union),
   other computers, and the PM-assignment alert / PM feed (both watch window._crm.projects for a new PM). */
function pmPeople(){ var U = arr(crm().users); try { if (typeof window._pmList === 'function') return arr(window._pmList(U)).filter(function(u){ return u && s(u.name); }); } catch (e) {} return U.filter(function(u){ return u && u.active && s(u.name); }); }
function pmAttr(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pmPick(it, cls){
  if (!it || it.kind !== 'job' || !pmSeesAll()) return '';
  var cur = s(it.raw && it.raw.pm), have = false;
  /* the value is the name exactly as Admin → Employees has it (the job panel writes that, trailing space and all) */
  var o = pmPeople().map(function(u){ var on = cur && s(u.name) === cur; if (on) have = true; return '<option value="' + pmAttr(u.name) + '"' + (on ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('');
  if (cur && !have) o = '<option value="' + pmAttr(it.raw.pm) + '" selected>' + esc(cur) + ' (as recorded)</option>' + o;
  return '<label class="pv-pmpick' + (cls ? ' ' + cls : '') + '"><span>PM:</span><select data-pmset="' + esc(it.id) + '" aria-label="Project manager of ' + esc(it.name) + '"><option value=""' + (cur ? '' : ' selected') + '>Unassigned</option>' + o + '</select></label>';
}
function pmCard(it, d){ var c = pvCard(it, d, false); return d.sc && d.sc.admin && it.kind === 'job' ? '<div class="pv-cw">' + c + pmPick(it) + '</div>' : c; }
function pmAssign(jobId, name){
  if (!pmSeesAll()) return;
  var it = itemById(jobId); if (!it || it.kind !== 'job') return;
  name = s(name) === '' ? '' : String(name);
  if (s(it.raw && it.raw.pm) === s(name)) return;
  if (typeof window._setProjects !== 'function') { toast('Open the CRM to change the PM.', '#b42318'); return; }
  var st = nowIso(), id = String(jobId), patch = { pm: name, updatedAt: st, savedAt: st };
  try {
    window._setProjects(function(list){ return arr(list).map(function(p){ return p && String(p.id) === id ? Object.assign({}, p, patch) : p; }); });
    var op = window._gcOpenProject; if (op && String(op.id) === id && typeof window._gcSetOpenItem === 'function') window._gcSetOpenItem(Object.assign({}, op, patch));
  } catch (e) { toast('The PM was not changed: ' + s(e && e.message || e), '#b42318'); return; }
  itemsMemo = null; emit('any');
  toast(name ? s(name) + ' is now the PM of ' + it.name : it.name + ' has no PM now');
}
