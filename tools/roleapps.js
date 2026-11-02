/* __GC_PATCH_ROLEAPPS__ — ROLE APPS: one sign-in, one set of data, and each role opens on its own home with its own buttons.   (patch ROLEAPPS)
   Owner 11/01: every role keeps the same login and data, but opens on its own home screen with its own buttons, chosen from
   the role / profile set in 💎 Team access. Phone → the role's FIELD app; computer → its DESK app; crews always get Field.
   "View as…" keeps working, so the owner can preview each role. The clean white look, app-like, not a long scrolling page.
   • Which app: GrayCo Field's own role key (window._gcField.state().rk, which follows patch RP's role: 💎 Team access
     profile, else Admin → Employees role, and the admin's 👁 View as…):
       admin → Admin · pm / roof → PM · est → Estimator · ins / mit → Insurance / Mitigation · super → Crew · office → Office.
       Marketing (mkt) has no role app: Marketing only, exactly as before.
   • FIELD (a phone, or a crew member anywhere): GrayCo Field's home (#_gcJobPick.gc-fh) with the role's quick buttons on
     top, the role's sections (the Field's own sections, in the role's order) and the role's bottom bar:
       Admin  Home · Jobs · Approvals · Photos · More        PM      Home · My Jobs · Approvals · Photos · More
       Est.   Home · Leads · Estimates · Photos · More       Ins/Mit Home · Claims · Leads · Photos · More
       Crew   Home · Today · Photos · Messages               Office  Home · Approvals · Messages · More
   • DESK (a computer): #gc-ra-desk, a full-window home (header, quick buttons, the role's cards; only the cards scroll) and
     a dock (#gc-ra-dock) with the same bar. Any screen the CRM opens (window._setView) puts the home away; the dock's
     Home brings it back; "Full CRM ›" shows the CRM as before.
   • Every button opens an EXISTING screen or function (GrayCo Field's tools, patch FIELDPORTAL's portals / photos /
     messages / daily log / schedule, approvals, leads, the claims app, On call, 📥 Needs a job, To-Do, View as…).
     "More" lists the role's other buttons and every menu item the person already has (the CRM's own left menu, the
     💎 menu) — nothing is added to anyone's permissions; a screen the person cannot open is not offered.
   • Kill switch: localStorage gc_roleapps_off = "1" (this device) → the CRM exactly as before.
   API: window._gcRA = { state(), app(), mode(), actions(app, where), bar(app, where), run(id, pid), open(), hide(), sync() } */
(function(){
'use strict';
if (window.__GC_PATCH_ROLEAPPS__) return; window.__GC_PATCH_ROLEAPPS__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function C(){ return W._crm || {}; }
function num(v){ var n = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function usd(n){ return (n < 0 ? '-$' : '$') + Math.abs(Math.round(num(n))).toLocaleString('en-US'); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function warn(e){ try { console.warn('[GC ROLEAPPS]', e && e.message || e); } catch (x) {} }
function toast(t){
  var el = D.getElementById('gc-ra-toast'); if (!el) { el = D.createElement('div'); el.id = 'gc-ra-toast'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('data-gcnav-ignore', '1'); D.body.appendChild(el); }
  el.textContent = t; el.style.display = 'block'; clearTimeout(el.__t); el.__t = later(function(){ el.style.display = 'none'; }, 3500);
}

/* ── who, which app, which device ── */
function F(){ return W._gcField || null; }
function FP(){ return W._gcFP || null; }
function signedIn(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return false; } }
function realAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function inField(){ return D.documentElement.classList.contains('_fieldmode'); }
function phone(){ try { if (F() && F().phone) return !!F().phone(); } catch (e) {} var sw = (W.screen && Math.min(W.screen.width || 9999, W.screen.height || 9999)) || 9999; return sw <= 500 || Math.min(W.innerWidth || 9999, W.innerHeight || 9999) <= 500; }
function off(){ return lsGet('gc_roleapps_off') === '1'; }
function gateUp(){ var g = D.getElementById('gc-auth-email'); return !!(g && g.getClientRects().length); }
/* ready: signed in, the person known (the app's own user and the team list), the sign-in screen gone */
function ready(){ return signedIn() && !gateUp() && !!F() && (realAdmin() || (!!W._gcMeNow && arr(C().users).length > 0)); }
function rk(){ try { return s(F().state().rk); } catch (e) { return ''; } }
var APPOF = { admin: 'admin', pm: 'pm', roof: 'pm', est: 'est', ins: 'ins', mit: 'ins', super: 'crew', office: 'office' };
var APPNAME = { admin: 'Admin', pm: 'Project Manager', est: 'Estimator', ins: 'Insurance & Mitigation', crew: 'Crew', office: 'Office' };
function app(){ if (off() || !ready()) return ''; return APPOF[rk()] || ''; }
function mode(a){ a = a === undefined ? app() : a; if (!a) return ''; if (a === 'crew') return 'field'; return phone() ? 'field' : 'desk'; }
function myName(){ try { return s(F().state().me); } catch (e) { return ''; } }
function vas(){ try { return W._gcVAS && W._gcVAS.active() ? s(W._gcVAS.label()) : ''; } catch (e) { return ''; } }
function viewOk(v){ try { return typeof W._gcViewAllowed !== 'function' || !!W._gcViewAllowed(v); } catch (e) { return true; } }

/* ── jobs ── */
function activeJob(p){ return !!p && !p.deleted && !p.tombstoned && !p.history && !p.recordOnly && !/(complete|closed|lost|cancel|archiv|history|dead|void)/i.test(s(p.status)); }
function fpSort(l){ try { return typeof W._gcFPSort === 'function' ? arr(W._gcFPSort(l)) : arr(l); } catch (e) { return arr(l); } }
function allMine(){ var l = []; try { l = typeof W._gcFPJobs === 'function' ? arr(W._gcFPJobs()) : arr(C().projects); } catch (e) {} return l; }
function proj(pid){ var x = arr(C().projects).filter(function(p){ return p && s(p.id) === s(pid); })[0]; if (x) return x; return allMine().filter(function(p){ return p && s(p.id) === s(pid); })[0] || null; }
/* the role's jobs: PM / crew — GrayCo Field's own list (today's, else their active ones); everyone else — every job they may open */
function jobsOf(a){
  var J = null; try { J = F() && F().jobs ? F().jobs() : null; } catch (e) {}
  if ((a === 'pm' || a === 'crew') && J) return { today: !!J.today, list: fpSort(arr(J.list)) };
  return { today: false, list: fpSort(allMine().filter(activeJob)) };
}
function dayOf(pid){ try { return F().day(pid) || {}; } catch (e) { return {}; } }

/* ── leads, claims, money (read through the existing APIs) ── */
function allLeads(){ var l = []; try { if (typeof W._gcLaLeads === 'function') l = arr(W._gcLaLeads()); } catch (e) {} if (!l.length) l = arr(C().leads); return l; }
function openLead(l){ return !!l && !l.deleted && !l.converted && !l.notBidding && !/won|lost|dead|declined|converted|spam/i.test(s(l.stage) + ' ' + s(l.status)); }
function leadSeen(l){ try { return !W._gcLeadScope || W._gcLeadScope.has(l); } catch (e) { return true; } }
function leadAt(l){ return Date.parse(s(l.createdAt || l.date || l.updatedAt)) || 0; }
/* the leads the person sees (patch LEADSCOPE's rule — the same list as their Leads tab), newest first */
function myLeads(){ return allLeads().filter(function(l){ return openLead(l) && leadSeen(l); }).sort(function(a, b){ return leadAt(b) - leadAt(a); }); }
function dueOf(l){ var d = s(l.bidDue); if (!d) return NaN; return Date.parse(d.length === 10 ? d + 'T17:00:00' : d); }
function bidsDue(){ return myLeads().filter(function(l){ return isFinite(dueOf(l)) || /bid|commercial|government/i.test(s(l.type || l.leadKind)); }).sort(function(a, b){ var x = dueOf(a), y = dueOf(b); return (isFinite(x) ? x : 9e15) - (isFinite(y) ? y : 9e15); }); }
function isEmerg(l){ try { if (W._gcLeadHoldCore && W._gcLeadHoldCore.isEmergency) return !!W._gcLeadHoldCore.isEmergency(l); } catch (e) {} return !!(l && (l.emergency === true || /^emergency$/i.test(s(l.urgency)))); }
function emergLeads(){ return myLeads().filter(isEmerg); }
function claimsApi(){ return W._gcClaims && typeof W._gcClaims.list === 'function' ? W._gcClaims : null; }
function claimsVis(){ var A = claimsApi(); if (!A) return []; try { return arr(A.visible ? A.visible() : A.list()).filter(function(c){ return c && !/closed/i.test(s(c.phase)); }); } catch (e) { return []; } }
function claimTitle(c){ var p = proj(c.projectId) || {}; return s(c.title) || s(p.name) || s(c.insured) || 'Claim'; }
function mitList(){ var A = claimsApi(); if (!A) return []; try { return arr(A.mit && A.mit.claims ? A.mit.claims() : []).filter(function(c){ return c && !/closed/i.test(s(c.phase)); }); } catch (e) { return []; } }
function mitK(){ var A = claimsApi(); try { return A && A.mit && A.mit.kpis ? A.mit.kpis(mitList()) : null; } catch (e) { return null; } }
function tpaDates(){
  var A = claimsApi(), out = []; if (!A || !A.more || !A.more.milestones) return out;
  claimsVis().forEach(function(c){ try { arr(A.more.milestones(c)).forEach(function(m){ if (m && m.due && !m.at) out.push({ c: c, l: s(m.l), due: s(m.due), late: !!m.late }); }); } catch (e) {} });
  return out.sort(function(a, b){ return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
}
function apprCount(){ try { return typeof W._gcApprovalCount === 'function' ? (+W._gcApprovalCount() || 0) : 0; } catch (e) { return 0; } }
function apprItems(){ try { return F() && F().approvals ? arr(F().approvals()) : []; } catch (e) { return []; } }
function needs(){ try { return W._gcMoney && W._gcMoney.needs ? arr(W._gcMoney.needs()) : []; } catch (e) { return []; } }
function todoN(){ try { var c = W._gcTodoBadge && W._gcTodoBadge.counts ? W._gcTodoBadge.counts() : null; return c ? +(c.n || c.total || c.todo || 0) || 0 : null; } catch (e) { return null; } }
function moneyNums(){ try { return W._gcA8 && W._gcA8.tvNumbers ? W._gcA8.tvNumbers() : null; } catch (e) { return null; } }

/* ── opening things (existing screens only) ── */
var SELF = false;
function go(v){
  if (!viewOk(v)) { toast('That screen is not part of your profile.'); return false; }
  deskHide();
  try { var h = D.querySelector('#_gcJobPick.gc-fh'); if (h) h.remove(); } catch (e) {}
  try { if (typeof W._setView === 'function') W._setView(v); } catch (e) { warn(e); }
  return true;
}
function openPhotos(pid){ try { if (W._gcPhotos && W._gcPhotos.open) { W._gcPhotos.open(pid); return; } } catch (e) {} go('allphotos'); }
function openApprovals(){
  if (mode() === 'desk' && viewOk('approvals')) { go('approvals'); return; }
  try { if (typeof W._gcOpenPmApprovals === 'function') { W._gcOpenPmApprovals(); return; } } catch (e) {}
  go('approvals');
}
function openClaims(o){ var A = claimsApi(); if (!A) { toast('Claims are not on this device yet.'); return; } A.open(o || {}); }
function openDrying(screen){ var A = claimsApi(); if (!A) { toast('Mitigation is not on this device yet.'); return; } var l = mitList(); A.open(l.length === 1 ? { claimId: l[0].id, mode: 'mitigation', screen: screen || 'drying' } : { mode: 'mitigation' }); }
function tool(id, p){ try { if (W._gcFieldTools && W._gcFieldTools.run(id, p.id)) return true; } catch (e) { warn(e); } toast('That is not on this device yet.'); return false; }
function fpRun(a, p){ try { if (FP() && FP().run && FP().run(a, p)) return true; } catch (e) { warn(e); } toast('Not on this job for you.'); return false; }
function openJob(p){ if (!p) return; W._gcCurrentJob = p; try { if (typeof W._gcJobDashboard === 'function') { W._gcJobDashboard(p.id); return; } } catch (e) {} try { W._gcOpenJobProfile(p.id); } catch (e) {} }
function clockLabel(){ var p = jobsOf('crew').list[0]; if (!p) return 'Clock in'; var d = dayOf(p.id); return d.ended ? 'Clocked out ✓' : d.started ? 'Clock out' : 'Clock in'; }

/* ── the buttons: one list for the Field and the Desk apps ──
   job: true → the button needs a job (the only one, or a pick from the role's jobs) */
var A = {
  appr:      { ic: '✅', l: 'Approvals', n: apprCount, run: openApprovals },
  leads:     { ic: '📥', l: 'Leads', view: 'leads', run: function(){ go('leads'); } },
  myleads:   { ic: '📥', l: 'My leads', view: 'leads', n: function(){ return myLeads().length; }, run: function(){ go('leads'); } },
  money:     { ic: '💵', l: 'Money', show: function(){ return !!moneyNums(); }, run: function(){ moneySheet(); } },
  viewas:    { ic: '👁', l: 'View as…', show: realAdmin, run: function(){ if (W._gcVASOpen) W._gcVASOpen(); } },
  systems:   { ic: '▦', l: 'All systems', run: function(){ moreSheet(); } },
  photos:    { ic: '📸', l: 'Photos', run: function(){ openPhotos(); } },
  addjob:    { ic: '＋', l: 'Add job', show: function(){ return !!(F() && F().addJob); }, run: function(){ F().addJob(); } },
  log:       { ic: '📒', l: 'Daily log', job: true, run: function(p){ fpRun('fp-log', p); } },
  punch:     { ic: '☐', l: 'Punch list', job: true, run: function(p){ tool('punch', p); } },
  sched:     { ic: '📅', l: 'Schedule', job: true, run: function(p){ if (FP() && FP().sched) FP().sched(p.id); else go('schedule'); } },
  msgs:      { ic: '💬', l: 'Messages', run: function(){ if (mode() === 'desk' && viewOk('messages')) { go('messages'); return; } if (W._gcPickJobForMessages) W._gcPickJobForMessages(); else go('messages'); } },
  cust:      { ic: '👤', l: 'Customer portal', job: true, jobOk: function(p){ return !!(FP() && FP().perms(p.id).cust); }, run: function(p){ fpRun('fp-cust', p); } },
  sub:       { ic: '🔧', l: 'Sub portal', job: true, jobOk: function(p){ return !!(FP() && FP().perms(p.id).sub); }, run: function(p){ fpRun('fp-sub', p); } },
  visit:     { ic: '📍', l: 'Site visit', run: function(){ visitSheet(); } },
  roofscout: { ic: '🏠', l: 'RoofScout', view: 'roofscout', run: function(){ go('roofscout'); } },
  quickest:  { ic: '📐', l: 'Quick estimate', show: function(){ return !!(F() && F().estimate); }, run: function(){ F().estimate({}); } },
  estimates: { ic: '🧮', l: 'Estimates', view: 'estimates', run: function(){ go('estimates'); } },
  bids:      { ic: '⏰', l: 'Bids due', n: function(){ return bidsDue().filter(function(l){ return isFinite(dueOf(l)) && dueOf(l) - Date.now() < 3 * 864e5; }).length; }, run: function(){ bidsSheet(); } },
  emerg:     { ic: '🚨', l: 'Emergency leads', n: function(){ return emergLeads().length; }, run: function(){ emergSheet(); } },
  oncall:    { ic: '📟', l: 'On call', show: function(){ return !!(W._gcX10 && W._gcX10.oncall); }, run: function(){ W._gcX10.oncall(); } },
  drying:    { ic: '💧', l: 'Drying logs', show: claimsApi, n: function(){ var k = mitK(); return k ? k.readingsDue : 0; }, run: function(){ openDrying('drying'); } },
  equip:     { ic: '🌀', l: 'Equipment', show: claimsApi, n: function(){ var k = mitK(); return k ? k.equipmentOut : 0; }, run: function(){ openDrying('equipment'); } },
  claims:    { ic: '🛡', l: 'Claim info', show: claimsApi, n: function(){ return claimsVis().length; }, run: function(){ openClaims({}); } },
  tpa:       { ic: '📆', l: 'TPA dates', show: claimsApi, n: function(){ return tpaDates().filter(function(x){ return x.late; }).length; }, run: function(){ tpaSheet(); } },
  clock:     { ic: '⏱', l: clockLabel, job: true, run: function(p){ var d = dayOf(p.id); if (!d.started) { try { if (W._gcClockInNow) W._gcClockInNow(); } catch (e) {} } tool('day', p); } },
  match:     { ic: '🧾', l: 'Invoices to match', show: function(){ return !!(W._gcMoney && W._gcMoney.openNeeds); }, n: function(){ return needs().length; }, run: function(){ W._gcMoney.openNeeds(); } },
  todo:      { ic: '☑', l: "Today's to-dos", view: 'todo', n: todoN, run: function(){ go('todo'); } },
  receipt:   { ic: '🧾', l: 'Snap a receipt', show: function(){ return typeof W._gcFieldLogExpense === 'function'; }, run: function(){ W._gcFieldLogExpense(); } },
  maint:     { ic: '🛠', l: 'Maintenance', view: 'maint', show: function(){ try { return typeof W._gcMaintCanSee === 'function' && !!W._gcMaintCanSee(); } catch (e) { return false; } }, run: function(){ go('maint'); } },   /* patch MAINTTAB's tab (admin / office / PM) */
  search:    { ic: '🔍', l: 'Search', show: function(){ return typeof W._gcUniversalSearch === 'function'; }, run: function(){ W._gcUniversalSearch(); } }
};
/* the role's buttons: on the home (Field quick buttons / Desk tiles) and the extra ones in More */
var HOME = {
  admin:  ['appr', 'leads', 'money', 'viewas', 'systems', 'addjob'],
  pm:     ['log', 'photos', 'punch', 'sched', 'msgs', 'appr'],
  est:    ['bids', 'visit', 'roofscout', 'myleads', 'quickest', 'photos'],
  ins:    ['emerg', 'oncall', 'drying', 'equip', 'photos', 'claims', 'tpa'],
  crew:   ['clock', 'photos', 'log', 'punch'],
  office: ['appr', 'msgs', 'match', 'todo']
};
var MORE = {
  admin:  ['maint', 'search', 'photos', 'msgs', 'receipt', 'oncall', 'claims', 'match', 'todo'],
  pm:     ['maint', 'cust', 'sub', 'leads', 'estimates', 'receipt', 'todo', 'search'],
  est:    ['estimates', 'leads', 'appr', 'msgs', 'todo', 'search'],
  ins:    ['msgs', 'appr', 'addjob', 'receipt', 'todo', 'search'],
  crew:   ['punch', 'log'],
  office: ['maint', 'photos', 'receipt', 'leads', 'search']
};
/* the bottom bar: [key, icon, label]; Field keys home / jobs / appr / photos / msgs / more are GrayCo Field's own */
var BAR = {
  admin:  [['home', '▣', 'Home'], ['jobs', '◫', 'Jobs'], ['appr', '✅', 'Approvals'], ['photos', '📸', 'Photos'], ['more', '☰', 'More']],
  pm:     [['home', '▣', 'Home'], ['jobs', '◫', 'My Jobs'], ['appr', '✅', 'Approvals'], ['photos', '📸', 'Photos'], ['more', '☰', 'More']],
  est:    [['home', '▣', 'Home'], ['ra-leads', '📥', 'Leads'], ['ra-estimates', '🧮', 'Estimates'], ['photos', '📸', 'Photos'], ['more', '☰', 'More']],
  ins:    [['home', '▣', 'Home'], ['ra-claims', '🛡', 'Claims'], ['ra-leads', '📥', 'Leads'], ['photos', '📸', 'Photos'], ['more', '☰', 'More']],
  crew:   [['home', '▣', 'Home'], ['ra-today', '📍', 'Today'], ['photos', '📸', 'Photos'], ['msgs', '💬', 'Messages']],
  office: [['home', '▣', 'Home'], ['appr', '✅', 'Approvals'], ['msgs', '💬', 'Messages'], ['more', '☰', 'More']]
};
/* GrayCo Field's home sections, in the role's order (the Field's own sections; the quick buttons replace its tiles) */
var FIELD_SECTIONS = {
  admin: ['approvals', 'scorecard'], pm: ['jobs', 'approvals', 'estimates', 'commission'], roof: ['jobs', 'bids', 'approvals', 'estimates', 'commission'],
  est: ['bids', 'jobs', 'approvals'], ins: ['claims', 'dry', 'jobs', 'approvals'], mit: ['dry', 'claims', 'jobs', 'approvals'],
  super: ['jobs', 'approvals'], office: ['approvals', 'todos', 'jobs']
};
function shown(id){ var x = A[id]; if (!x) return false; if (x.view && !viewOk(x.view)) return false; try { return typeof x.show !== 'function' || !!x.show(); } catch (e) { return false; } }
function label(id){ var x = A[id]; return typeof x.l === 'function' ? x.l() : x.l; }
function count(id){ var x = A[id]; if (!x || typeof x.n !== 'function') return null; try { var n = x.n(); return n == null ? null : +n || 0; } catch (e) { return null; } }
function actions(a, where){ return arr((where === 'more' ? MORE : HOME)[a]).filter(shown); }

/* run a button: a job button asks which job when the role has several */
function run(id, pid){
  var x = A[id]; if (!x) return false;
  try {
    if (!x.job) { x.run(); return true; }
    var p = pid ? proj(pid) : null;
    if (p) { x.run(p); return true; }
    var a = app(), list = jobsOf(a).list.filter(function(q){ return !x.jobOk || x.jobOk(q); });
    if (!list.length) { toast(a === 'crew' || a === 'pm' ? 'No job for you today.' : 'No open job for that.'); return false; }
    if (list.length === 1) { x.run(list[0]); return true; }
    pickJob(label(id), list, function(q){ x.run(q); });
    return true;
  } catch (e) { warn(e); toast('That did not open: ' + (e && e.message || e)); return false; }
}

/* ═════ sheets (light, one at a time) ═════ */
function sheet(title, html, cls){
  css();
  Array.prototype.forEach.call(D.querySelectorAll('.gc-ra-sheet'), function(o){ o.remove(); });
  var o = D.createElement('div'); o.className = 'gc-ra-sheet' + (cls ? ' ' + cls : ''); o.setAttribute('data-gc-keep', '1'); o.setAttribute('data-gcnav-ignore', '1');
  o.innerHTML = '<div class="in" role="dialog" aria-label="' + esc(title) + '"><div class="hd"><b>' + esc(title) + '</b><button type="button" data-x aria-label="Close">✕</button></div><div class="bd">' + html + '</div></div>';
  o.addEventListener('click', function(e){ if (e.target === o || (e.target.closest && e.target.closest('[data-x]'))) o.remove(); });
  D.body.appendChild(o);
  return o;
}
function closeSheets(){ Array.prototype.forEach.call(D.querySelectorAll('.gc-ra-sheet'), function(o){ o.remove(); }); }
function pickJob(what, list, cb){
  var o = sheet(what + ' — which job?', list.slice(0, 60).map(function(p){ return '<button type="button" class="gc-ra-row" data-pj="' + esc(p.id) + '"><b>' + esc(p.name || p.address) + '</b><small>' + esc([p.address, p.client, p.status].filter(Boolean).join(' · ')) + '</small></button>'; }).join(''));
  o.addEventListener('click', function(e){ var b = e.target.closest('[data-pj]'); if (!b) return; var p = proj(b.getAttribute('data-pj')); o.remove(); if (p) cb(p); });
}
function moneySheet(){
  var S = moneyNums(); if (!S) { toast('The money numbers are not loaded yet.'); return; }
  sheet('💵 Money snapshot', moneyHtml(S) + '<div class="gc-ra-two"><button type="button" class="gc-ra-btn" data-ra-a="go" data-v="pnl">P&L</button><button type="button" class="gc-ra-btn" data-ra-a="go" data-v="payments">Payments</button></div>');
}
function moneyHtml(S){
  var cell = function(l, v){ return '<div class="gc-ra-num"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>'; };
  return '<div class="gc-ra-nums">' + cell('Collected (week)', usd(S.collected || 0)) + cell('Owed to us', usd(S.ar || 0)) + cell('Jobs going', S.jobs == null ? '—' : S.jobs) +
    cell('New leads (week)', S.newWeek == null ? '—' : S.newWeek) + cell('Close rate', S.close == null ? '—' : S.close + '%') + cell('Bids due 7 days', S.bids == null ? '—' : S.bids) + '</div>';
}
function dueChip(l){
  var d = dueOf(l); if (!isFinite(d)) return '<span class="gc-ra-chip w">Due: not set</span>';
  var h = (d - Date.now()) / 36e5; if (h < 0) return '<span class="gc-ra-chip r">Past due</span>';
  if (h < 24) return '<span class="gc-ra-chip r">Due in ' + Math.max(1, Math.round(h)) + ' h</span>';
  if (h < 72) return '<span class="gc-ra-chip o">Due ' + new Date(d).toLocaleDateString('en-US', { weekday: 'short' }) + '</span>';
  return '<span class="gc-ra-chip w">Due ' + new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</span>';
}
function leadRow(l, btns){ return '<div class="gc-ra-item"><div class="t"><b>' + esc(l.client || l.name || 'Lead') + '</b><small>' + esc([l.type || l.leadKind, l.address].filter(Boolean).join(' · ')) + '</small></div>' + (btns || '') + '</div>'; }
function bidsHtml(L){ return L.length ? L.slice(0, 25).map(function(l){ return leadRow(l, '<div class="b">' + dueChip(l) + '<button type="button" class="gc-ra-sm" data-ra-a="lead" data-id="' + esc(l.id) + '">Open</button><button type="button" class="gc-ra-sm" data-ra-a="visit" data-id="' + esc(l.id) + '">📍 Visit</button><button type="button" class="gc-ra-sm pri" data-ra-a="est" data-id="' + esc(l.id) + '">📐 Estimate</button></div>'); }).join('') : '<div class="gc-ra-empty">No bids waiting on you.</div>'; }
function bidsSheet(){ sheet('⏰ Bids due', bidsHtml(bidsDue())); }
function emergHtml(L){ return L.length ? L.slice(0, 20).map(function(l){ var ph = s(l.phone || (l.contact && l.contact.phone)).replace(/[^0-9+]/g, ''); return leadRow(l, '<div class="b">' + (ph ? '<a class="gc-ra-sm" href="tel:' + esc(ph) + '">📞 Call</a>' : '') + '<button type="button" class="gc-ra-sm pri" data-ra-a="lead" data-id="' + esc(l.id) + '">Open</button></div>'); }).join('') : '<div class="gc-ra-empty">No emergency leads right now.</div>'; }
function emergSheet(){ sheet('🚨 Emergency leads', emergHtml(emergLeads())); }
function tpaHtml(L){ return L.length ? L.slice(0, 20).map(function(x){ return '<div class="gc-ra-item"><div class="t"><b>' + esc(claimTitle(x.c)) + '</b><small>' + esc(x.l) + '</small></div><div class="b"><span class="gc-ra-chip ' + (x.late ? 'r' : 'w') + '">' + (x.late ? 'Late · ' : 'Due ') + esc(new Date(x.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) + '</span><button type="button" class="gc-ra-sm" data-ra-a="claim" data-id="' + esc(x.c.id) + '">Open</button></div></div>'; }).join('') : '<div class="gc-ra-empty">No TPA dates coming up.</div>'; }
function tpaSheet(){ sheet('📆 TPA dates', tpaHtml(tpaDates())); }
function visitSheet(leadId){
  var l = leadId ? allLeads().filter(function(x){ return x && s(x.id) === s(leadId); })[0] : null;
  var h = (l ? '<div class="gc-ra-note">' + esc(l.client || l.name) + (l.address ? ' · ' + esc(l.address) : '') + '</div>' : '<div class="gc-ra-note">Photos, notes and measurements from the site — saved with the lead or job.</div>') +
    '<button type="button" class="gc-ra-big" data-ra-a="v-photos"><span>📸</span>Photos<small>GrayCo Photos — the camera, the customer-can-see question</small></button>' +
    '<button type="button" class="gc-ra-big" data-ra-a="v-measure"' + (l ? ' data-id="' + esc(l.id) + '"' : '') + '><span>📏</span>Measurements & notes<small>Rooms, roof squares, notes — the estimate reads them</small></button>' +
    (l ? '<button type="button" class="gc-ra-big" data-ra-a="lead" data-id="' + esc(l.id) + '"><span>📝</span>The lead\'s notes<small>Open the lead</small></button>' : '');
  sheet('📍 Site visit', h);
}

/* ═════ More: the role's other buttons + everything the person already has ═════ */
function navItems(){
  var seen = {}, out = [];
  Array.prototype.forEach.call(D.querySelectorAll('aside nav button'), function(b, i){ var t = s(b.innerText || b.textContent).replace(/\s+/g, ' '); if (!t || seen[t] || !b.getClientRects().length && !b.offsetParent) return; seen[t] = 1; out.push({ i: i, t: t }); });
  return out;
}
function moreSheet(){
  var a = app(), ex = actions(a, 'more'), mob = mode() === 'field';
  if (mob && F() && F().more) {
    /* GrayCo Field's own ☰ More (Search · Photos · Other tools = every menu item · Settings), the role's buttons on top */
    try { F().more(); } catch (e) { warn(e); }
    var o = D.querySelectorAll('.gc-fh-sheet'); o = o[o.length - 1]; var pk = o && o.querySelector('.pick');
    if (pk && ex.length) {
      var box = D.createElement('div'); box.className = 'gc-ra-mx';
      box.innerHTML = ex.filter(function(id){ return id !== 'search' && id !== 'photos'; }).map(function(id){ var n = count(id); return '<button type="button" data-ra-a="' + id + '" data-ra-close><span class="e">' + A[id].ic + '</span><span>' + esc(label(id)) + (n ? ' <b class="gc-ra-n">' + n + '</b>' : '') + '</span></button>'; }).join('');
      while (box.firstChild) pk.insertBefore(box.lastChild, pk.firstChild);
      o.setAttribute('data-ra-more', a);
    }
    return o;
  }
  var nav = navItems();
  var h = (ex.length ? '<div class="gc-ra-k">' + esc(APPNAME[a] || '') + '</div><div class="gc-ra-grid">' + ex.map(function(id){ return tileHtml(id); }).join('') + '</div>' : '') +
    '<div class="gc-ra-k">All systems</div><div class="gc-ra-grid sys">' + nav.map(function(x){ return '<button type="button" class="gc-ra-sys" data-ra-a="nav" data-i="' + x.i + '">' + esc(x.t) + '</button>'; }).join('') +
    (D.getElementById('gc-hub-btn') ? '<button type="button" class="gc-ra-sys" data-ra-a="hub">💎 The 💎 menu</button>' : '') + '<button type="button" class="gc-ra-sys" data-ra-a="full">🖥 Full CRM</button></div>';
  return sheet('☰ More', h, 'wide');
}

/* ═════ FIELD: GrayCo Field's home, the role's way ═════ */
var LAY0 = {};
function fieldLayout(on){
  var f = F(); if (!f || !f.layout) return false;
  var k = rk(), L = f.layout(k); if (!L) return false;
  if (!LAY0[k] && on) LAY0[k] = { tiles: arr(L.tiles).slice(), sections: arr(L.sections).slice() };
  var want = on ? { tiles: [], sections: FIELD_SECTIONS[k] || LAY0[k].sections } : LAY0[k];
  if (!want) return false;
  if (arr(L.tiles).join() === want.tiles.join() && arr(L.sections).join() === want.sections.join()) return false;
  L.tiles = want.tiles.slice(); L.sections = want.sections.slice();
  return true;
}
function tileHtml(id, cls){ var n = count(id); return '<button type="button" class="' + (cls || 'gc-ra-tile') + '" data-ra-a="' + id + '"><span class="e">' + A[id].ic + '</span><span class="l">' + esc(label(id)) + '</span>' + (n ? '<b class="gc-ra-n">' + n + '</b>' : '') + '</button>'; }
function fieldTop(a){
  var ids = actions(a, 'home');
  var h = '<div class="gc-ra-q" data-app="' + a + '" data-n="' + ids.length + '">' + ids.map(function(id){ return tileHtml(id, 'gc-ra-qb'); }).join('') + '</div>';
  if (a === 'ins') {
    var E = emergLeads(); if (E.length) h += '<div class="fh-sec"><span>🚨 Emergency leads (' + E.length + ')</span></div>' + emergHtml(E.slice(0, 3));
    var T = tpaDates(); if (T.length) h += '<div class="fh-sec"><span>📆 TPA dates (' + T.length + ')</span><button type="button" data-ra-a="tpa">All ›</button></div>' + tpaHtml(T.slice(0, 3));
  }
  if (a === 'office') { var N = needs(); if (N.length) h += '<div class="fh-sec"><span>🧾 Invoices to match (' + N.length + ')</span><button type="button" data-ra-a="match">Open ›</button></div>'; }
  return h;
}
function fieldBottom(a){
  if (a !== 'admin') return '';
  /* Admin: every job, each with 👤 Customer portal · 🔧 Sub portal · 📸 Photos · 💬 Message (patch FIELDPORTAL's row) */
  var L = jobsOf('admin').list, CAP = 30;
  return '<div class="fh-sec"><span>All jobs (' + L.length + ')</span><button type="button" data-fa="alljobs">Find a job ›</button></div>' +
    (L.length ? L.slice(0, CAP).map(function(p){ var r = ''; try { r = FP() && FP().row ? FP().row(p) : ''; } catch (e) {} return '<div class="fh-job" data-job="' + esc(p.id) + '"><button type="button" class="fh-n" data-fa="open" data-pid="' + esc(p.id) + '">' + esc(p.name) + '</button><div class="fh-a">' + esc([p.address, p.client, p.status].filter(Boolean).join(' · ')) + '</div>' + r + '</div>'; }).join('') +
      (L.length > CAP ? '<button type="button" class="gc-ra-allbtn" data-fa="alljobs">All ' + L.length + ' jobs ›</button>' : '') : '<div class="fh-empty">No open jobs.</div>');
}
var homeObs = null, homeEl = null, injecting = false;
function fieldInject(){
  var el = D.querySelector('#_gcJobPick.gc-fh'); if (!el) return;
  if (el !== homeEl) { homeEl = el; try { if (homeObs) homeObs.disconnect(); homeObs = new MutationObserver(function(){ if (!injecting) fieldInject(); }); homeObs.observe(el, { childList: true }); } catch (e) {} }
  var a = app(), wrap = el.querySelector('.fh-wrap'); if (!wrap) return;
  if (a) css();
  injecting = true;
  try {
    var top = wrap.querySelector('.gc-ra-top'), bot = wrap.querySelector('.gc-ra-bot');
    if (!a && !ready()) return;   /* the person not known for a moment (a re-render): leave the home as it is */
    if (!a || mode(a) !== 'field') { if (top) top.remove(); if (bot) bot.remove(); el.removeAttribute('data-ra'); return; }
    fieldBar(a);
    if (el.getAttribute('data-ra') !== a) el.setAttribute('data-ra', a);
    var th = fieldTop(a), bh = fieldBottom(a);
    if (!top) { top = D.createElement('div'); top.className = 'gc-ra-top'; wrap.insertBefore(top, wrap.firstChild); }
    if (top.__h !== th) { top.innerHTML = th; top.__h = th; }
    var tiles = wrap.querySelector('.fh-tiles'); if (tiles && !tiles.children.length && tiles.style.display !== 'none') tiles.style.display = 'none';
    if (bh) { if (!bot) { bot = D.createElement('div'); bot.className = 'gc-ra-bot'; wrap.appendChild(bot); } if (bot.__h !== bh) { bot.innerHTML = bh; bot.__h = bh; } }
    else if (bot) bot.remove();
  } finally { injecting = false; }
}
var BAR0 = null;
function barHtml(a, where){
  return arr(BAR[a]).map(function(b){
    var k = b[0], cls = '';
    if (k === 'appr') return '<button type="button" data-t="appr" class="ap" aria-label="Approvals"><span class="c">✅<span class="gc-fh-badge" id="' + (where === 'desk' ? 'gc-ra-badge' : 'gc-fh-badge') + '" style="display:none"></span></span>' + esc(b[2]) + '</button>';
    if (k === 'home') cls = ' class="on"';
    return '<button type="button" data-t="' + k + '"' + cls + '><span class="e">' + b[1] + '</span>' + esc(b[2]) + '</button>';
  }).join('');
}
function fieldBar(a){
  var t = D.getElementById('gc-fh-tabs'); if (!t) return;
  if (BAR0 === null && !t.hasAttribute('data-ra-bar')) BAR0 = t.innerHTML;
  var want = a && mode(a) === 'field' ? a : '';
  if ((t.getAttribute('data-ra-bar') || '') === want) return;
  if (want) { t.innerHTML = barHtml(want, 'field'); t.setAttribute('data-ra-bar', want); t.setAttribute('data-n', String(arr(BAR[want]).length)); }
  else if (BAR0 !== null) { t.innerHTML = BAR0; t.removeAttribute('data-ra-bar'); t.removeAttribute('data-n'); }
  paintBadge();
}
function paintBadge(){
  var n = apprCount(), tx = n > 0 ? String(n) : '';
  ['gc-fh-badge', 'gc-ra-badge'].forEach(function(id){ var b = D.getElementById(id); if (!b) return; if (b.textContent !== tx) b.textContent = tx; var w = n > 0 ? 'inline-block' : 'none'; if (b.style.display !== w) b.style.display = w; });
}
/* a crew member on a computer: GrayCo Field there too — its job list opens GrayCo Field's home, as on a phone */
function wrapPicker(){
  var f = W._gcJobPicker; if (typeof f !== 'function' || f.__gcRA) return;
  var w = function(){ if (D.documentElement.classList.contains('gc-ra-field') && !W.__gcFhAll && F() && F().open) return F().open(); return f.apply(this, arguments); };
  try { Object.keys(f).forEach(function(k){ w[k] = f[k]; }); } catch (e) {}
  w.__gcRA = true; W._gcJobPicker = w;
}
var crewOpened = false, crewSetField = false;
function crewDesk(a){
  var want = a === 'crew' && !phone();
  if (D.documentElement.classList.contains('gc-ra-field') !== want) D.documentElement.classList.toggle('gc-ra-field', want);
  if (!want) {
    crewOpened = false;
    /* we put this computer in Field view for the crew app (e.g. the owner's 👁 View as Superintendent): put it back */
    if (crewSetField) { crewSetField = false; try { var h = D.querySelector('#_gcJobPick.gc-fh'); if (h) h.remove(); if (inField() && typeof W._gcSetFieldMode === 'function') W._gcSetFieldMode(false); } catch (e) { warn(e); } }
    return;
  }
  wrapPicker();
  if (crewOpened) return; crewOpened = true;
  try { if (!inField() && typeof W._gcSetFieldMode === 'function') { crewSetField = true; W._gcSetFieldMode(true); } } catch (e) { warn(e); }
  /* the switch itself (👁 View as… goes to the dashboard) can close the home a moment later: make sure it is up */
  [300, 1300, 2600].forEach(function(ms){ later(function(){ try { if (crewOpened && !D.querySelector('#_gcJobPick.gc-fh,#_gcJobDash,._gcSheetOv,.gc-fh-sheet,.gcfp-sheet') && F()) F().open(); } catch (e) { warn(e); } }, ms); });
}

/* ═════ DESK: the role's home on a computer ═════ */
var DESK = { shown: false, auto: false, app: '', h: '', at: 0 };
function deskEl(){ return D.getElementById('gc-ra-desk'); }
function card(id, title, body, more){ return '<section class="gc-ra-card" data-card="' + id + '"><div class="ch"><b>' + title + '</b>' + (more || '') + '</div><div class="cb">' + body + '</div></section>'; }
function jobBtns(p, list){
  var pm = {}; try { pm = FP() ? FP().perms(p.id) : {}; } catch (e) {}
  var B = { log: ['📒', 'Daily log', pm.photos], photos: ['📸', 'Photos', pm.photos !== false], punch: ['☐', 'Punch', pm.photos], sched: ['📅', 'Schedule', pm.photos], msg: ['💬', 'Message', pm.msg !== false], cust: ['👤', 'Customer portal', pm.cust], sub: ['🔧', 'Sub portal', pm.sub] };
  return list.filter(function(k){ return B[k] && B[k][2]; }).map(function(k){ return '<button type="button" class="gc-ra-sm' + (k === 'cust' ? ' c' : k === 'sub' ? ' s' : '') + '" data-ra-a="j-' + k + '" data-pid="' + esc(p.id) + '">' + B[k][0] + ' ' + B[k][1] + '</button>'; }).join('');
}
function jobRow(p, btns){ return '<div class="gc-ra-item job"><div class="t"><button type="button" class="gc-ra-jn" data-ra-a="openjob" data-pid="' + esc(p.id) + '">' + esc(p.name || p.address) + '</button><small>' + esc([p.address, p.client, p.status].filter(Boolean).join(' · ')) + '</small></div><div class="b">' + btns + '</div></div>'; }
function apprHtml(){
  var L = apprItems();
  return L.length ? L.slice(0, 8).map(function(x){ var t = x.tier === 0 ? '<span class="gc-ra-chip r">ASAP</span>' : x.tier === 1 ? '<span class="gc-ra-chip o">Soon</span>' : '<span class="gc-ra-chip w">Routine</span>';
    var inPlace = false; try { inPlace = !!(W._gcCanApproveInPlace && W._gcCanApproveInPlace(x.id)); } catch (e) {}
    return '<div class="gc-ra-item"><div class="t">' + t + ' <b>' + esc(x.title) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</div><div class="b">' + (inPlace ? '<button type="button" class="gc-ra-sm ok" data-ra-a="apprnow" data-id="' + esc(x.id) + '">✅ Approve</button>' : '') + '<button type="button" class="gc-ra-sm" data-ra-a="approne" data-id="' + esc(x.id) + '">Review</button></div></div>'; }).join('')
    : '<div class="gc-ra-empty">✓ Nothing is waiting on you.</div>';
}
function deskCards(a){
  var h = '', n = apprCount(), all = '<button type="button" class="gc-ra-link" data-ra-a="appr">All ›</button>';
  if (a === 'admin') {
    var J = jobsOf('admin').list, S = moneyNums();
    h += card('jobs', 'All jobs (' + J.length + ')', J.length ? J.slice(0, 60).map(function(p){ return jobRow(p, jobBtns(p, ['cust', 'sub', 'photos', 'msg'])); }).join('') + (J.length > 60 ? '<div class="gc-ra-empty">' + (J.length - 60) + ' more — <button type="button" class="gc-ra-link" data-ra-a="go" data-v="projects">Projects ›</button></div>' : '') : '<div class="gc-ra-empty">No open jobs.</div>', '<button type="button" class="gc-ra-link" data-ra-a="go" data-v="projects">Projects ›</button>');
    h += card('appr', 'Approvals (' + n + ')', apprHtml(), all);
    var Lz = myLeads();
    h += card('leads', 'Leads (' + Lz.length + ')', Lz.length ? Lz.slice(0, 10).map(function(l){ return leadRow(l, '<div class="b">' + (isEmerg(l) ? '<span class="gc-ra-chip r">Emergency</span>' : '') + '<button type="button" class="gc-ra-sm" data-ra-a="lead" data-id="' + esc(l.id) + '">Open</button></div>'); }).join('') : '<div class="gc-ra-empty">No open leads.</div>', '<button type="button" class="gc-ra-link" data-ra-a="leads">All ›</button>');
    if (S) h += card('money', 'Money snapshot', moneyHtml(S), '<button type="button" class="gc-ra-link" data-ra-a="go" data-v="pnl">P&L ›</button>');
    if (shown('maint')) h += card('maint', '🛠 Maintenance', '<div class="gc-ra-item"><div class="t"><b>Plans, the maintenance schedule, prospects</b></div><div class="b"><button type="button" class="gc-ra-sm pri" data-ra-a="maint">Open</button></div></div>');   /* patch MAINTTAB's tab */
  } else if (a === 'pm') {
    var P = jobsOf('pm');
    h += card('jobs', (P.today ? 'My jobs today' : 'My active jobs') + ' (' + P.list.length + ')', P.list.length ? P.list.slice(0, 40).map(function(p){ return jobRow(p, jobBtns(p, ['log', 'photos', 'punch', 'sched', 'msg', 'cust', 'sub'])); }).join('') : '<div class="gc-ra-empty">No jobs assigned to you yet.</div>', '<button type="button" class="gc-ra-link" data-ra-a="go" data-v="projects">All my jobs ›</button>');
    h += card('appr', 'Approvals (' + n + ')', apprHtml(), all);
  } else if (a === 'est') {
    var B = bidsDue(), M = myLeads();
    h += card('bids', 'Bids due (' + B.length + ')', bidsHtml(B));
    h += card('leads', 'My leads (' + M.length + ')', M.length ? M.slice(0, 12).map(function(l){ return leadRow(l, '<div class="b"><button type="button" class="gc-ra-sm" data-ra-a="lead" data-id="' + esc(l.id) + '">Open</button><button type="button" class="gc-ra-sm" data-ra-a="visit" data-id="' + esc(l.id) + '">📍 Visit</button><button type="button" class="gc-ra-sm pri" data-ra-a="est" data-id="' + esc(l.id) + '">📐 Estimate</button></div>'); }).join('') : '<div class="gc-ra-empty">No open leads for you.</div>', '<button type="button" class="gc-ra-link" data-ra-a="leads">All ›</button>');
  } else if (a === 'ins') {
    var E = emergLeads(), CL = claimsVis(), DR = mitList(), T = tpaDates();
    h += card('emerg', '🚨 Emergency leads (' + E.length + ')', emergHtml(E));
    h += card('dry', '💧 Drying & equipment (' + DR.length + ')', DR.length ? DR.slice(0, 12).map(function(c){ return '<div class="gc-ra-item"><div class="t"><b>' + esc(claimTitle(c)) + '</b><small>' + esc(s(c.phase)) + '</small></div><div class="b"><button type="button" class="gc-ra-sm" data-ra-a="dry" data-id="' + esc(c.id) + '">💧 Readings</button><button type="button" class="gc-ra-sm" data-ra-a="dryeq" data-id="' + esc(c.id) + '">🌀 Equipment</button></div></div>'; }).join('') : '<div class="gc-ra-empty">No drying jobs right now.</div>');
    h += card('claims', '🛡 Claims (' + CL.length + ')', CL.length ? CL.slice(0, 15).map(function(c){ return '<div class="gc-ra-item"><div class="t"><b>' + esc(claimTitle(c)) + '</b><small>' + esc([s(c.phase), s(c.nextStep || c.next) ? 'next: ' + s(c.nextStep || c.next) : ''].filter(Boolean).join(' · ')) + '</small></div><div class="b"><button type="button" class="gc-ra-sm" data-ra-a="claim" data-id="' + esc(c.id) + '">Open</button></div></div>'; }).join('') : '<div class="gc-ra-empty">No open claims.</div>');
    h += card('tpa', '📆 TPA dates (' + T.length + ')', tpaHtml(T));
  } else if (a === 'office') {
    var N = needs(), td = todoN();
    h += card('appr', 'Approvals (' + n + ')', apprHtml(), all);
    h += card('match', '🧾 Invoices to match (' + N.length + ')', N.length ? N.slice(0, 10).map(function(x){ return '<div class="gc-ra-item"><div class="t"><b>' + esc(s(x.what) + (x.who ? ' · ' + s(x.who) : '')) + '</b><small>' + esc([x.amt ? usd(x.amt) : '', s(x.why)].filter(Boolean).join(' · ')) + '</small></div><div class="b"><button type="button" class="gc-ra-sm" data-ra-a="match">Match</button></div></div>'; }).join('') : '<div class="gc-ra-empty">✓ Nothing to match.</div>');
    h += card('todo', "Today's to-dos", '<div class="gc-ra-item"><div class="t"><b>' + (td == null ? '—' : td) + '</b> to-do' + (td === 1 ? '' : 's') + ' open</div><div class="b"><button type="button" class="gc-ra-sm pri" data-ra-a="todo">Open To-Do</button></div></div>');
    h += card('msgs', '💬 Messages', '<div class="gc-ra-item"><div class="t"><b>Job messages, texts and the customer / sub threads</b></div><div class="b"><button type="button" class="gc-ra-sm pri" data-ra-a="msgs">Open</button></div></div>');
  }
  try { (Array.isArray(W._gcRaCards) ? W._gcRaCards : []).forEach(function(f){ var x = typeof f === 'function' ? f(a, card) : ''; if (x) h += x; }); } catch (e) { warn(e); }   /* patch TAXALERTS: other patches' Desk cards (🧾 Taxes) */
  return h;
}
function deskHtml(a){
  var dt = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), v = vas();
  var head = '<div class="ra-top"><img class="ra-logo" src="grayco-logo.jpg" alt="GrayCo"><div class="ra-tt"><div class="ra-h">GrayCo · ' + esc(APPNAME[a]) + '</div><div class="ra-s">' + esc(myName()) + ' · ' + esc(dt) + '</div></div><span class="sp"></span>' +
    (v ? '<span class="gc-ra-vas">👁 Viewing as ' + esc(v) + ' <button type="button" data-ra-a="vasexit">Exit</button></span>' : '') +
    (realAdmin() ? '<button type="button" class="gc-ra-hb" data-ra-a="viewas">👁 View as…</button>' : '') +
    (shown('search') ? '<button type="button" class="gc-ra-hb" data-ra-a="search">🔍 Search</button>' : '') +
    '<button type="button" class="gc-ra-hb pri" data-ra-a="full">Full CRM ›</button></div>';
  return head + '<div class="ra-body"><div class="ra-in"><div class="gc-ra-tiles">' + actions(a, 'home').map(function(id){ return tileHtml(id); }).join('') + '</div><div class="gc-ra-cards" data-app="' + a + '">' + deskCards(a) + '</div></div></div>';
}
function deskRender(force){
  var el = deskEl(); if (!el || !DESK.shown) return;
  var a = DESK.app, h; try { h = deskHtml(a); } catch (e) { warn(e); return; }
  if (!force && h === DESK.h) return;
  var body = el.querySelector('.ra-body'), keep = body ? body.scrollTop : 0;
  el.innerHTML = h; DESK.h = h; DESK.at = Date.now(); el.setAttribute('data-app', a);
  if (keep) { var b2 = el.querySelector('.ra-body'); if (b2) b2.scrollTop = keep; }
}
function curView(){ return lsGet('grayco_view') || ''; }
function deskOpen(){
  var a = app(); if (!a || mode(a) !== 'desk') return false;
  css(); closeSheets(); DESK.view = curView();
  var el = deskEl();
  if (!el) { el = D.createElement('div'); el.id = 'gc-ra-desk'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('data-gcnav-ignore', '1'); D.body.appendChild(el); }
  DESK.shown = true; DESK.app = a; el.style.display = '';
  D.documentElement.classList.add('gc-ra-home');
  deskRender(true); deskTop(); dockPaint();
  return true;
}
/* the CRM's own top banner (🔗 Connect Google, above every layer): the desk home starts below it */
function deskTop(){ var el = deskEl(); if (!el) return; var g = D.getElementById('_gConnBar'), h = g && g.getClientRects().length ? Math.round(g.getBoundingClientRect().bottom) : 0; var v = h > 0 && h < 200 ? h + 'px' : ''; if (el.style.top !== v) el.style.top = v; }
function deskHide(){
  if (!DESK.shown) return;
  DESK.shown = false; var el = deskEl(); if (el) el.style.display = 'none';
  D.documentElement.classList.remove('gc-ra-home'); dockPaint();
}
function deskRemove(){ DESK.shown = false; var el = deskEl(); if (el) el.remove(); var d = D.getElementById('gc-ra-dock'); if (d) d.remove(); D.documentElement.classList.remove('gc-ra-home', 'gc-ra-desk-on'); }
function dockPaint(){
  var a = app(), want = a && mode(a) === 'desk';
  D.documentElement.classList.toggle('gc-ra-desk-on', !!want);
  var d = D.getElementById('gc-ra-dock');
  if (!want) { if (d) d.remove(); return; }
  if (!d) { css(); d = D.createElement('nav'); d.id = 'gc-ra-dock'; d.setAttribute('data-gc-keep', '1'); d.setAttribute('data-gcnav-ignore', '1'); d.setAttribute('aria-label', 'Role app'); D.body.appendChild(d); }
  if (d.getAttribute('data-app') !== a) { d.innerHTML = barHtml(a, 'desk'); d.setAttribute('data-app', a); }
  Array.prototype.forEach.call(d.querySelectorAll('[data-t]'), function(b){ var on = b.getAttribute('data-t') === 'home' && DESK.shown; if (b.classList.contains('on') !== on) b.classList.toggle('on', on); });
  paintBadge();
}

/* ═════ taps ═════ */
function barKey(k, where){
  if (where === 'field') {
    if (k === 'more') { moreSheet(); return true; }
    if (k === 'ra-leads') { go('leads'); return true; }
    if (k === 'ra-estimates') { go('estimates'); return true; }
    if (k === 'ra-claims') { if (rk() === 'mit') openDrying(); else openClaims({}); return true; }
    if (k === 'ra-today') { var p = jobsOf('crew').list[0]; if (p) openJob(p); else { W.__gcFhAll = true; if (W._gcJobPicker) W._gcJobPicker(); } return true; }
    return false;   /* home / jobs / appr / photos / msgs: GrayCo Field's own */
  }
  if (k === 'home') { deskOpen(); return true; }
  if (k === 'jobs') { go('projects'); return true; }
  if (k === 'appr') { openApprovals(); return true; }
  if (k === 'photos') { openPhotos(); return true; }
  if (k === 'msgs') { run('msgs'); return true; }
  if (k === 'more') { moreSheet(); return true; }
  if (k === 'ra-leads') { go('leads'); return true; }
  if (k === 'ra-estimates') { go('estimates'); return true; }
  if (k === 'ra-claims') { if (viewOk(rk() === 'mit' ? 'mitigation' : 'insurance')) go(rk() === 'mit' ? 'mitigation' : 'insurance'); else openClaims({}); return true; }
  return false;
}
function tap(b, ev){
  var a = b.getAttribute('data-ra-a'), id = b.getAttribute('data-id'), pid = b.getAttribute('data-pid');
  if (b.hasAttribute('data-ra-close')) { var sh = b.closest('.gc-fh-sheet,.gc-ra-sheet'); if (sh) sh.remove(); }
  var inSheet = b.closest('.gc-ra-sheet'); if (inSheet && !/^(v-|lead$|est$|claim$)/.test(a) && a !== 'visit') inSheet.remove();
  var p = pid ? proj(pid) : null;
  switch (a) {
    case 'full': closeSheets(); deskHide(); return;
    case 'hub': closeSheets(); deskHide(); var hb = D.getElementById('gc-hub-btn'); if (hb) hb.click(); return;
    case 'nav': closeSheets(); deskHide(); var nb = D.querySelectorAll('aside nav button')[+b.getAttribute('data-i')]; if (nb) nb.click(); return;
    case 'go': closeSheets(); go(b.getAttribute('data-v')); return;
    case 'vasexit': try { W._gcVAS.set(''); } catch (e) {} return;
    case 'openjob': if (p) { deskHide(); openJob(p); } return;
    case 'lead': closeSheets(); deskHide(); try { if (typeof W._gcOpenLead === 'function') W._gcOpenLead(id); else go('leads'); } catch (e) { go('leads'); } return;
    case 'est': closeSheets(); var l = allLeads().filter(function(x){ return x && s(x.id) === s(id); })[0]; try { F().estimate({ leadId: l && l.id, name: l ? s(l.client || l.name) : '', lead: l }); } catch (e) { warn(e); } return;
    case 'visit': visitSheet(id); return;
    case 'v-photos': closeSheets(); openPhotos(); return;
    case 'v-measure': closeSheets(); try { F().measure(id ? { leadId: id } : {}); } catch (e) { warn(e); } return;
    case 'claim': closeSheets(); openClaims({ claimId: id }); return;
    case 'dry': openClaims({ claimId: id, mode: 'mitigation', screen: 'drying' }); return;
    case 'dryeq': openClaims({ claimId: id, mode: 'mitigation', screen: 'equipment' }); return;
    case 'approne': var x = apprItems().filter(function(y){ return y.id === id; })[0]; if (x && typeof x.act === 'function') { try { x.act(); return; } catch (e) {} } openApprovals(); return;
    case 'apprnow': try { if (W._gcApproveInPlace && W._gcApproveInPlace(id)) { b.disabled = true; b.textContent = '✓ Approved'; later(function(){ deskRender(true); }, 5600); return; } } catch (e) {} openApprovals(); return;
  }
  if (/^j-/.test(a) && p) {
    var k = a.slice(2);
    if (k === 'log') return run('log', p.id); if (k === 'punch') return run('punch', p.id); if (k === 'sched') return run('sched', p.id);
    if (k === 'photos') return openPhotos(p.id); if (k === 'msg') return fpRun('fp-msg', p); if (k === 'cust') return fpRun('fp-cust', p); if (k === 'sub') return fpRun('fp-sub', p);
  }
  if (A[a]) { closeSheets(); run(a, pid); }
}
function onClick(ev){
  if (!app()) return;
  var t = ev.target; if (!t || !t.closest) return;
  var bar = t.closest('#gc-fh-tabs[data-ra-bar] [data-t], #gc-ra-dock [data-t]');
  if (bar) {
    var where = bar.closest('#gc-ra-dock') ? 'desk' : 'field', k = bar.getAttribute('data-t');
    if (barKey(k, where)) {
      ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      if (where === 'field') Array.prototype.forEach.call(bar.parentNode.querySelectorAll('[data-t]'), function(x){ x.classList.toggle('on', x === bar && k !== 'more'); });
      later(dockPaint, 0);
    }
    return;
  }
  var b = t.closest('[data-ra-a]'); if (!b || b.tagName === 'A') return;
  ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
  try { tap(b, ev); } catch (e) { warn(e); }
}
D.addEventListener('click', onClick, true);
D.addEventListener('keydown', function(e){ if (e.key === 'Escape' && DESK.shown && !D.querySelector('.gc-ra-sheet')) deskHide(); });

/* ═════ the CRM opened a screen: the desk home steps aside ═════ */
function wrapSetView(){
  var f = W._setView; if (typeof f !== 'function' || f.__gcRA) return;
  var w = function(){ try { if (DESK.shown) deskHide(); } catch (e) {} return f.apply(this, arguments); };
  try { Object.keys(f).forEach(function(k){ w[k] = f[k]; }); } catch (e) {}
  w.__gcRA = true; W._setView = w;
}

/* ═════ keep it right: role (View as…), device, data ═════ */
var last = { app: null, mode: null, rk: null }, busy = false;
function sync(){
  if (busy) return; busy = true;
  try {
    wrapSetView();
    var a = app(), m = mode(a), k = rk();
    var changed = a !== last.app || m !== last.mode || k !== last.rk;
    if (changed) { last.app = a; last.mode = m; last.rk = k; }
    /* GrayCo Field */
    var relaid = fieldLayout(!!a && m === 'field');
    if ((relaid || changed) && F() && D.querySelector('#_gcJobPick.gc-fh')) { try { F().render(); } catch (e) {} }
    else if (changed && last.seen && a && m === 'field' && inField() && phone() && F() && !D.getElementById('_gcJobPick')) { try { F().open(); } catch (e) {} }   /* 👁 View as… on a phone: the new role's home */
    if (a) last.seen = true;
    fieldBar(a); fieldInject(); crewDesk(a);
    /* the desk */
    if (m === 'desk') {
      dockPaint();
      if (!DESK.readyAt) DESK.readyAt = Date.now();
      if (!DESK.auto && Date.now() - DESK.readyAt < 1500) { /* let the CRM settle on its first screen */ }
      else if (!DESK.auto || changed) { DESK.auto = true; deskOpen(); }   /* first time, or the role changed (👁 View as…) */
      else if (DESK.shown && curView() !== DESK.view) deskHide();   /* a screen opened underneath (a call made before our wrapper was back) */
      else if (DESK.shown && Date.now() - DESK.at > 2500) deskRender(false);
      if (DESK.shown) deskTop();
    } else if (deskEl() || D.getElementById('gc-ra-dock')) deskRemove();
    paintBadge();
  } catch (e) { warn(e); } finally { busy = false; }
}
/* GrayCo Field's home is made again each time it opens: put the role's buttons on it at once (no flash without them) */
try { new MutationObserver(function(ms){ for (var i = 0; i < ms.length; i++) { var ad = ms[i].addedNodes; for (var j = 0; j < ad.length; j++) { var n = ad[j]; if (n.id === '_gcJobPick' || n.id === 'gc-fh-tabs') { fieldBar(app()); fieldInject(); return; } } } }).observe(D.body || D.documentElement, { childList: true }); } catch (e) {}
var pend = null;
function soon(){ if (pend) return; pend = later(function(){ pend = null; sync(); }, 250); }
(function(){ var prev = W.__gcCrmBox; W.__gcCrmBox = function(o){ var r = typeof prev === 'function' ? prev(o) : o; soon(); return r; }; })();
W.addEventListener('gc-approvals-changed', soon); W.addEventListener('resize', soon); W.addEventListener('storage', soon);
D.addEventListener('visibilitychange', function(){ if (!D.hidden) soon(); });
D.addEventListener('click', function(){ later(soon, 450); }, true);
RI.call(W, function(){ if (!D.hidden) sync(); }, 900);
later(sync, 600);

/* ═════ the look: white, light grey page, blue accent ═════ */
function css(){
  if (D.getElementById('gc-ra-css')) return;
  var st = D.createElement('style'); st.id = 'gc-ra-css';
  st.textContent = [
    '#gc-ra-desk{position:fixed;inset:0;z-index:9000;background:#f5f6f8;color:#111827;font:14px/1.4 Inter,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column}',
    '#gc-ra-desk .ra-top{flex:0 0 auto;display:flex;align-items:center;gap:10px;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 20px;box-shadow:0 1px 2px rgba(16,24,40,.04)}',
    '#gc-ra-desk .ra-logo{width:40px;height:40px;border-radius:9px;object-fit:contain;border:1px solid #e5e7eb;background:#fff}',
    '#gc-ra-desk .ra-h{font-size:19px;font-weight:800;letter-spacing:-.01em}#gc-ra-desk .ra-s{color:#6b7280;font-size:12.5px}#gc-ra-desk .sp{flex:1}',
    '.gc-ra-hb{border:1px solid #d1d5db;background:#fff;color:#1f2937;border-radius:10px;padding:8px 12px;font:700 13px Inter,sans-serif;cursor:pointer;white-space:nowrap}.gc-ra-hb.pri{background:#2563eb;border-color:#2563eb;color:#fff}',
    '.gc-ra-vas{background:#fffbeb;border:1px solid #fcd34d;color:#92400e;border-radius:999px;padding:5px 6px 5px 12px;font-weight:700;font-size:12.5px;white-space:nowrap}.gc-ra-vas button{border:none;background:#92400e;color:#fff;border-radius:999px;padding:3px 10px;margin-left:6px;cursor:pointer;font-weight:700}',
    '#gc-ra-desk .ra-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:18px 20px 110px}',
    '#gc-ra-desk .ra-in{max-width:1240px;margin:0 auto}',
    '.gc-ra-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:16px}',
    '.gc-ra-tile{position:relative;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;min-height:62px;font:800 14.5px Inter,sans-serif;color:#111827;cursor:pointer;text-align:left;box-shadow:0 1px 2px rgba(16,24,40,.05)}',
    '.gc-ra-tile:hover{border-color:#93c5fd;box-shadow:0 4px 12px rgba(37,99,235,.10)}.gc-ra-tile .e{font-size:24px;line-height:1}',
    '.gc-ra-n{display:inline-block;background:#dc2626;color:#fff;border-radius:999px;font-size:11.5px;font-weight:800;padding:1px 7px;margin-left:auto;line-height:1.5}',
    '.gc-ra-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px;align-items:start}',
    '.gc-ra-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.05);display:flex;flex-direction:column;min-width:0}',
    '.gc-ra-card[data-card="jobs"]{grid-row:span 2}',
    '.gc-ra-card .ch{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;border-bottom:1px solid #f1f5f9;font-size:15px}',
    '.gc-ra-card .cb{max-height:420px;overflow-y:auto;padding:4px 12px 10px}.gc-ra-card[data-card="jobs"] .cb{max-height:calc(100vh - 300px);min-height:200px}',
    '.gc-ra-link{border:none;background:none;color:#2563eb;font:800 12.5px Inter,sans-serif;cursor:pointer;padding:4px}',
    '.gc-ra-item{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid #f3f4f6}.gc-ra-item:last-child{border-bottom:none}',
    '.gc-ra-item .t{flex:1;min-width:0}.gc-ra-item .t b{overflow-wrap:anywhere}.gc-ra-item .t small{display:block;color:#6b7280;font-size:12px;margin-top:1px}',
    '.gc-ra-item .b{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-items:center}.gc-ra-item.job{flex-wrap:wrap}.gc-ra-item.job .b{justify-content:flex-start;flex-basis:100%}',
    '.gc-ra-jn{border:none;background:none;padding:0;font:800 14.5px Inter,sans-serif;color:#111827;cursor:pointer;text-align:left}.gc-ra-jn:hover{color:#2563eb}',
    '.gc-ra-sm{border:1px solid #d1d5db;background:#fff;color:#1f2937;border-radius:9px;padding:6px 10px;font:700 12.5px Inter,sans-serif;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-block}',
    '.gc-ra-sm:hover{border-color:#93c5fd}.gc-ra-sm.pri{background:#2563eb;border-color:#2563eb;color:#fff}.gc-ra-sm.ok{background:#16a34a;border-color:#16a34a;color:#fff}.gc-ra-sm.c{border-color:#D4A017;background:#fffbeb}.gc-ra-sm.s{border-color:#93c5fd;background:#eff6ff}',
    '.gc-ra-chip{font-size:11px;font-weight:800;border-radius:999px;padding:2px 8px;white-space:nowrap}.gc-ra-chip.r{background:#fee2e2;color:#b91c1c}.gc-ra-chip.o{background:#ffedd5;color:#c2410c}.gc-ra-chip.w{background:#f3f4f6;color:#4b5563}',
    '.gc-ra-empty{color:#6b7280;padding:14px 4px;font-size:13.5px}',
    '.gc-ra-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:6px 0}.gc-ra-num{background:#f9fafb;border:1px solid #eef0f3;border-radius:12px;padding:10px}.gc-ra-num span{display:block;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.gc-ra-num b{font-size:19px}',
    /* the dock */
    '#gc-ra-dock{position:fixed;left:50%;transform:translateX(-50%);bottom:12px;z-index:9001;display:flex;gap:2px;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:6px 8px;box-shadow:0 10px 30px rgba(16,24,40,.16);font-family:Inter,-apple-system,sans-serif}',
    '#gc-ra-dock button{border:none;background:none;min-width:84px;padding:6px 10px;border-radius:12px;display:flex;flex-direction:column;align-items:center;gap:2px;font:700 12px Inter,sans-serif;color:#4b5563;cursor:pointer;position:relative}',
    '#gc-ra-dock button .e,#gc-ra-dock button .c{font-size:20px;line-height:1.1}#gc-ra-dock button:hover{background:#f3f4f6}#gc-ra-dock button.on{color:#2563eb;background:#eff6ff}',
    '#gc-ra-dock button.ap{color:#dc2626}#gc-ra-dock .gc-fh-badge{position:absolute;top:-4px;right:-8px;background:#dc2626;color:#fff;border-radius:999px;font-size:11px;font-weight:800;padding:1px 6px;border:2px solid #fff;line-height:1.3}',
    '#gc-ra-dock button .c{position:relative}',
    'html.gc-ra-desk-on body{padding-bottom:84px}',
    /* sheets */
    '.gc-ra-sheet{position:fixed;inset:0;z-index:100085;background:rgba(17,24,39,.42);display:flex;align-items:flex-end;justify-content:center;font-family:Inter,-apple-system,sans-serif}',
    '.gc-ra-sheet .in{background:#fff;color:#111827;width:100%;max-width:640px;border-radius:18px 18px 0 0;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 -8px 30px rgba(0,0,0,.18)}',
    '.gc-ra-sheet.wide .in{max-width:880px}',
    '@media (min-width:700px){.gc-ra-sheet{align-items:center}.gc-ra-sheet .in{border-radius:18px}}',
    '.gc-ra-sheet .hd{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #f1f5f9;font-size:16px}.gc-ra-sheet .hd button{border:none;background:#f3f4f6;border-radius:9px;width:34px;height:34px;font-size:16px;cursor:pointer}',
    '.gc-ra-sheet .bd{overflow-y:auto;padding:10px 16px calc(16px + env(safe-area-inset-bottom,0px))}',
    '.gc-ra-row{display:block;width:100%;text-align:left;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin:6px 0;font:14px Inter,sans-serif;color:#111827;cursor:pointer}.gc-ra-row small{display:block;color:#6b7280;font-size:12px}',
    '.gc-ra-big{display:block;width:100%;text-align:left;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:12px 14px;margin:8px 0;font:800 15px Inter,sans-serif;color:#111827;cursor:pointer}.gc-ra-big span{font-size:22px;margin-right:10px}.gc-ra-big small{display:block;font-weight:500;color:#6b7280;font-size:12.5px;margin-top:2px}',
    '.gc-ra-note{color:#4b5563;font-size:13.5px;margin:4px 0 6px}.gc-ra-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.gc-ra-btn{border:1px solid #2563eb;color:#2563eb;background:#fff;border-radius:10px;padding:10px;font:800 13.5px Inter,sans-serif;cursor:pointer}',
    '.gc-ra-k{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin:12px 2px 8px}',
    '.gc-ra-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}.gc-ra-grid.sys{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}',
    '.gc-ra-sys{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:9px 10px;text-align:left;font:600 13px Inter,sans-serif;color:#1f2937;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gc-ra-sys:hover{background:#eff6ff;border-color:#bfdbfe}',
    /* GrayCo Field: the role's quick buttons */
    '.gc-fh .gc-ra-q{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:2px 0 6px}',
    '.gc-fh .gc-ra-qb{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;min-height:72px;padding:6px 4px;font:800 12.5px Inter,sans-serif;color:#1f2a37;cursor:pointer;text-align:center;box-shadow:0 1px 2px rgba(16,24,40,.05)}',
    '.gc-fh .gc-ra-q[data-n="4"],.gc-fh .gc-ra-q[data-n="7"],.gc-fh .gc-ra-q[data-n="8"]{grid-template-columns:repeat(4,1fr);gap:6px}.gc-fh .gc-ra-q[data-n="4"] .gc-ra-qb,.gc-fh .gc-ra-q[data-n="7"] .gc-ra-qb{font-size:11.5px;min-height:68px}',
    '.gc-fh .gc-ra-qb .e{font-size:24px;line-height:1}.gc-fh .gc-ra-qb .gc-ra-n{position:absolute;top:5px;right:6px;margin:0}',
    '.gc-fh .gc-ra-top .gc-ra-item{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin-bottom:8px}',
    '.gc-fh .gc-ra-allbtn{display:block;width:100%;background:#fff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:12px;padding:12px;font:800 14px Inter,sans-serif;cursor:pointer;margin-bottom:12px}',
    '#gc-fh-tabs[data-n="4"] button{flex:1}',
    '.gc-fh-sheet .gc-ra-n{margin-left:6px}',
    /* a crew member on a computer: GrayCo Field, centred */
    'html.gc-ra-field #_gcAppTabs,html.gc-ra-field #_gcApprovalsBtn,html.gc-ra-field #_gcDeskBtn,html.gc-ra-field #_jpDesk,html.gc-ra-field #_fhDesk,html.gc-ra-field ._fmToggleBtn{display:none!important}',
    'html.gc-ra-field #gc-fh-tabs{display:flex!important;left:50%!important;right:auto!important;transform:translateX(-50%);width:100%;max-width:430px;border-radius:0}',
    'html.gc-ra-field #_gcJobPick.gc-fh .fh-wrap{max-width:760px;margin:0 auto;padding-bottom:120px}html.gc-ra-field #_gcJobPick.gc-fh .fh-top{padding-left:max(14px,calc(50% - 380px));padding-right:max(14px,calc(50% - 380px))}',
    '#gc-ra-toast{display:none;position:fixed;left:50%;transform:translateX(-50%);bottom:calc(110px + env(safe-area-inset-bottom,0px));z-index:2147483000;background:#111827;color:#fff;border-radius:12px;padding:12px 16px;font:600 14px Inter,sans-serif;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:calc(100% - 32px)}',
    '@media (max-width:700px){.gc-ra-cards{grid-template-columns:1fr}#gc-ra-dock button{min-width:62px}}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
}

W._gcRA = {
  state: function(){ return { app: app(), mode: mode(), rk: rk(), ready: ready(), phone: phone(), desk: DESK.shown, deskApp: DESK.app, vas: vas(), off: off(),
    fieldBar: (D.getElementById('gc-fh-tabs') || { getAttribute: function(){ return null; } }).getAttribute('data-ra-bar') }; },
  app: app, mode: function(){ return mode(); }, actions: function(a, where){ return actions(a || app(), where); },
  bar: function(a){ return arr(BAR[a || app()]).map(function(b){ return { k: b[0], label: b[2] }; }); },
  run: run, open: deskOpen, hide: deskHide, sync: sync, more: moreSheet, label: function(id){ return A[id] ? label(id) : ''; }
};
try { console.log('[GC] 📱🖥 Role apps: each role opens on its own home — Field on a phone, Desk on a computer (patch ROLEAPPS) — _gcRA.state()'); } catch (e) {}
})();
