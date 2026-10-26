/* __GC_PATCH_LEADSUX__ — THE LEADS SCREEN, REDESIGNED (owner approved: "build it").
   Leads · Bids · Website & ads. Leads = a greeting, 4 clickable chips, search, pills and a card list grouped by what needs
   doing; a side panel for the lead. Bids = a clean list, soonest due first. Website & ads = the existing strip + lead-form note.
   This block is the whole UI. It reads the lead list and every action (assign, contacted, stage, priority, saving) from the
   existing Leads engine (window._gcLeadsEngine, exported by patch LEADS) — nothing is copied, so the rules (BIDROLE
   estimator-vs-PM, role scopes, tombstones, sync) are the same as before.
   PERFORMANCE RULES (the reason for this redesign):
     • no MutationObserver, no setInterval under 5 s; one 6 s timer chain that only runs while a Leads screen is on and the tab is visible
     • the grouped lists are memoized per lead-data version + filter signature; a sync tick that changes nothing draws nothing;
       a hidden tab draws nothing (it catches up when it becomes visible)
     • at most 30 cards per group, then "Show more"
     • the old hub's renderers / watchers are switched off while this screen is on (see window._gcLux.disabled)
   Turn it off for one browser: localStorage gc_lux_off = 1 (the old hub comes back).
   API: window._gcLux = { on, state, dirty(), mount(), version(), disabled[], panel(), match(), keep(), openSettings() } */
(function(){
'use strict';
if (window.__GC_LEADSUX__) return; window.__GC_LEADSUX__ = true;
var W = window, D = document, H = D.documentElement;
var NST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
function later(f, ms){ return NST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v); }
function low(v){ return s(v).trim().toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function E(){ return W._gcLeadsEngine || null; }
function warn(e){ try { console.warn('[GC LEADSUX]', e && e.message || e); } catch (x) {} }
function lsGet(k, d){ try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function ssGet(k){ try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function ssSet(k, v){ try { sessionStorage.setItem(k, v); } catch (e) {} }
function view(){ try { return localStorage.getItem('grayco_view') || ''; } catch (e) { return ''; } }
function pad2(n){ return ('0' + n).slice(-2); }
function ymd(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function digits(v){ return s(v).replace(/\D/g, ''); }
var MD = {}, MDN = 0;
function monthDay(ms){ var k = Math.floor(ms / 36e5); if (MD[k]) return MD[k]; if (++MDN > 3000) { MD = {}; MDN = 0; } return (MD[k] = new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })); }
function ago(ms){ if (!ms) return ''; var m = Math.max(0, (Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? Math.round(m) + 'm ago' : m < 2880 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; }
function toast(msg){ var e = E(); if (e) e.toast(msg); }

var LUX = { on: true, active: false, root: null, bids: null, tab: '', disabled: [
  'old Leads hub renderer mount()/redraw()/hubHtml()/kpis()/cardHtml() (gc-patch-leads) — returns at once while this screen is on',
  'old hub tick interval 1500 ms -> 6000 ms, navBadge only (the hub no longer repaints on it)',
  'old hub autoLoop (head-estimator backfill) 3000 ms -> 8000 ms',
  'old hub 4 s idb poll (pullLeads) — now asked for by this screen on its own 6 s timer, only while visible',
  'patch HOT2b-early sync() interval 250 ms -> 5000 ms (plus the grayco_view storage hook and this screen\'s own checks)',
  'patch LD2 Lead Inbox MutationObserver on document.body + the click/popstate schedule() — disconnected while Leads is the view',
  'patch CLAIMLEAD / ALERTTO / MITTO / EMERGTO 1000 ms interval each — gone; their bars are mounted when Lead settings opens',
  'patch RSO 1500 ms interval -> 6000 ms (outreach opens from the ⋯ menu)',
  'old hub KPI strip, view tabs, filter bar, per-card selects, "Classic table" fold — replaced by this screen',
  'classic React Lead Pipeline table: draws no rows unless the admin opens "Old table" (one row while Edit / Delete is used) — was ~18,000 hidden DOM nodes',
  'patch AP3 text scan: skips <script>/<style> text and this screen (no mail icon on every card name)',
  'page-wide search-box debouncer: no longer re-sends its own input event every 150 ms for ever',
  'page-wide click handlers (3): skip <html>/<body>/page-sized targets before reading textContent'
] };
var UX = { chip: '', v: 'cards', more: { na: 30, ip: 30, bd: 30, cl: 30 }, closedOpen: false, bulk: false, filters: false, menu: false, bq: '', bMine: false, bdue: '', bShowHidden: false, bMore: 50 };
var DV = 0, LAST_RAW = null, LAST_SIG = '', LAST_KEY = '', RQ = 0, PEND = false, FORCE = false;

/* ── persistence of this screen's own choices ── */
function uxKey(){ var e = E(); return 'gc_lux_ui_v1:' + (e ? e.myEmail() : 'me'); }
function uxLoad(){ var u = lsGet(uxKey(), null) || {}; UX.v = /^(cards|board|map|cal)$/.test(u.v) ? u.v : 'cards'; UX.chip = /^(new|bids|un|fu)$/.test(u.chip) ? u.chip : ''; }
function uxSave(){ lsSet(uxKey(), { v: UX.v, chip: UX.chip }); }

/* ── data: one version number per change of the lead list ── */
function quickSig(list){ var a = new Array(list.length); for (var i = 0; i < list.length; i++) { var l = list[i]; a[i] = l ? s(l.id) + ':' + s(l.updatedAt || l.savedAt) + ':' + s(l.pm || l.estimator) + ':' + s(l.stage) + ':' + s(l.followUp) + ':' + arr(l.coAssignees).length : ''; } return list.length + '|' + a.join(','); }
function version(){
  var e = E(); if (!e) return DV;
  var raw = e.rawLeads();
  if (raw !== LAST_RAW) { LAST_RAW = raw; var sg = quickSig(raw); if (sg !== LAST_SIG) { LAST_SIG = sg; DV++; } }
  return DV;
}
function dirty(why){
  if (!LUX.active) return;
  version();
  if (RQ) return; RQ = later(render, 30);
}

/* ── lead facts ── */
function isOpen(l){ return !E().shut(l); }
function fuOf(l){ var v = s(l.followUp || l.nextFollowUp || l.followUpDate || l.nextDate || l.nextContact).trim(); if (!v) return ''; var m = /^\d{4}-\d\d-\d\d/.exec(v); if (m) return m[0]; var t = Date.parse(v); return isFinite(t) ? ymd(new Date(t)) : ''; }
function contactOf(l){
  var e = E(), it = e.inboxOf(l) || {}, cobj = l.contact && typeof l.contact === 'object' ? l.contact : null;
  return { name: s(l.client || (cobj ? cobj.name : l.contact) || l.contactName), phone: s(l.phone || l.clientPhone || (cobj && cobj.phone) || it.phone || (it.contact && it.contact.phone)), email: s(l.email || l.clientEmail || (cobj && cobj.email) || (it.contact && it.contact.email)) };
}
function typeLabel(l){
  var e = E(); if (e.isBidL(l)) return 'Bid';
  var t = e.typesOf(l);
  if (t.indexOf('Insurance claim') >= 0 || t.indexOf('Restoration – Storm') >= 0 && /insur/.test(low(l.leadKind || l.type))) return 'Insurance';
  if (t.indexOf('Commercial') >= 0 || t.indexOf('Government') >= 0) return 'Commercial';
  if (/insur|claim/.test(low(l.leadKind || l.type))) return 'Insurance';
  return 'Residential';
}
function first(n){ n = s(n).trim().split(/\s+/); return n[0] || ''; }
function shortName(n){ n = s(n).trim().split(/\s+/); return n.length > 1 ? n[0] + ' ' + n[n.length - 1][0] + '.' : (n[0] || ''); }
function bidDueTxt(l){ var e = E(), t = e.dueMs(l); return isFinite(t) ? monthDay(t) : ''; }
function stepOf(l){ var st = E().stageOf(l); return st === 'New Lead' ? 0 : (st === 'Contacted' || st === 'Site Visit') ? 1 : (st === 'Estimate Sent' || st === 'Negotiating') ? 2 : 3; }

/* chips: counted over the leads this person can see, open ones only */
var CH = {
  'new': function(l){ return isOpen(l) && !E().contacted(l); },
  'bids': function(l, c){ var e = E(); if (!isOpen(l) || !e.isBidL(l)) return false; var t = e.dueMs(l); return isFinite(t) && t >= c.day0 && t <= c.now + 7 * 864e5; },
  'un': function(l){ return isOpen(l) && !E().assignee(l); },
  'fu': function(l, c){ var f = fuOf(l); return isOpen(l) && !!f && f <= c.today; }
};
function ctx(){ var d0 = new Date(); d0.setHours(0, 0, 0, 0); return { now: Date.now(), day0: d0.getTime(), today: ymd(new Date()) }; }
var CNT = { k: '', v: null };
function counts(){
  var e = E(), key = DV + '|' + e.myScope().kind + '|' + ymd(new Date()); if (CNT.k === key) return CNT.v;
  var c = ctx(), v = { 'new': 0, 'bids': 0, 'un': 0, 'fu': 0 };
  e.scoped().forEach(function(l){ if (e.importedL(l)) return; for (var k in v) if (CH[k](l, c)) v[k]++; });
  CNT = { k: key, v: v }; return v;
}
/* the engine's filter() asks us two things for every lead */
function match(l, q){
  var e = E(), it = e.inboxOf(l) || {}, c = contactOf(l);
  var hay = low([l.name, l.title, l.client, c.name, c.email, c.phone, l.address, l.city, e.srcOf(l), e.assignee(l), l.gc, l.dueToCompany, l.bidNumber, l.notes, l.note, it.title].join(' '));
  if (hay.indexOf(q) >= 0) return true;
  var qd = digits(q); if (qd.length >= 3) { if (digits(c.phone).indexOf(qd) >= 0 || digits(l.phone).indexOf(qd) >= 0) return true; }
  return false;
}
function keep(l){ if (!LUX.active || LUX.tab !== 'leads' || !UX.chip) return true; return CH[UX.chip](l, ctx()); }

/* groups: Needs action now · In progress · Bids · Recently closed — memoized per data version + filters */
var GM = { k: '', g: null };
function fsig(){
  var e = E(), u = e.ui(), pk = e.pick(), npk = 0; for (var k in pk) if (pk[k]) npk++;
  return JSON.stringify([DV, UX.v, UX.chip, u.v, u.who, u.src, u.type, u.stage, u.due, u.un, u.q, u.closed, u.exp, u.imp, u.arch, u.prio, u.preset, u.cal, u.mapSel, u.sort, u.dir, e.more(), npk, e.myScope().kind]);
}
function groups(){
  var e = E(), u = e.ui(), key = fsig(); if (GM.k === key && GM.g) return GM.g;
  var c = ctx(), g = { na: [], ip: [], bd: [], cl: [], total: 0 };
  e.filtered({ closed: true }).forEach(function(l){
    var stageClosed = e.closed(l), shut = e.shut(l);
    if (stageClosed) {
      var t = Date.parse(s(l.stageChangedAt || l.wonAt || l.lostAt || l.updatedAt)); var recent = !isFinite(t) || c.now - t <= 30 * 864e5;
      if (recent || u.closed) g.cl.push(l);
      return;
    }
    if (shut) { if (u.closed || u.exp) g.cl.push(l); return; }
    var bid = e.isBidL(l), due = e.dueMs(l), soon = bid && isFinite(due) && due - c.now <= 3 * 864e5, fu = fuOf(l);
    var need = bid ? (!e.assignee(l) || soon) : (!e.contacted(l) || !e.assignee(l) || (fu && fu <= c.today));
    if (need) g.na.push(l); else if (bid) g.bd.push(l); else g.ip.push(l);
  });
  var byBorn = function(a, b){ return e.receivedMs(b) - e.receivedMs(a); };
  var dueAsc = function(a, b){ var x = e.dueMs(a), y = e.dueMs(b); x = isFinite(x) ? x : 9e15; y = isFinite(y) ? y : 9e15; return x - y || byBorn(a, b); };
  g.na.sort(function(a, b){ var x = e.isBidL(a) ? 0 : 1, y = e.isBidL(b) ? 0 : 1; return x - y || (x === 0 ? dueAsc(a, b) : byBorn(a, b)); });
  g.ip.sort(function(a, b){ return s(b.updatedAt).localeCompare(s(a.updatedAt)); });
  g.bd.sort(dueAsc);
  g.cl.sort(function(a, b){ return s(b.stageChangedAt || b.updatedAt).localeCompare(s(a.stageChangedAt || a.updatedAt)); });
  g.total = g.na.length + g.ip.length + g.bd.length + g.cl.length;
  GM = { k: key, g: g }; return g;
}

/* the classic React table draws only the rows asked for: every row for the admin's "Old table", else just the lead being edited / deleted */
var ALLOW = {};
function classicOn(){ var e = E(); return !!e && e.isAdmin() && ssGet('gcl_classic_ok') === '1'; }
W._gcLuxRows = function(r){ if (!W.__GC_LUX__ || W.__GC_LUX_FAIL__ || classicOn()) return true; return !!(r && ALLOW[r.id]); };
function rerenderClassic(){   /* the page redraws the table when its tab is shown again */
  var bar = tabBar(), a = bar && bar.querySelector('[data-gc-tab="website"]'), b = bar && bar.querySelector('[data-gc-tab="leads"]');
  if (a && b) { a.click(); b.click(); }
}
function withRow(id, then){
  ALLOW[id] = 1; var e = E();
  if (e.classicRow(id)) return then();
  rerenderClassic(); var n = 0;
  (function wait(){ if (e.classicRow(id)) return then(); if (++n < 40) later(wait, 100); else toast('Not ready yet — try again in a moment.'); })();
}
/* ── the Leads screen ── */
function greet(){ var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function myFirst(){ var e = E(), n = first(e.myName()); if (!n) { n = s(e.myEmail()).split('@')[0].replace(/[._-].*$/, ''); } return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'there'; }
var TYPE_MAP = { Residential: 'Residential', Commercial: 'Commercial', Insurance: 'Insurance claim', Bid: 'Bid invitation' };
function skeleton(){
  var e = E();
  return '<div class="lux-top"><div><div class="lux-h1" role="heading" aria-level="1" data-lux="hi"></div><p class="lux-sub" data-lux="sub"></p></div><button type="button" class="lux-btn gold lux-new" data-lux-act="new">+ New lead</button></div>'
    + '<div class="lux-classicbar" data-lux="cbar" hidden><b>Classic Lead Pipeline table is showing below.</b><button type="button" class="lux-btn ghost" data-lux-act="classic-off">Back to the new Leads screen</button></div>'
    + '<div class="lux-nonclassic"><div class="lux-chips" data-lux="chips"></div>'
    + '<div class="lux-bar"><input type="search" class="lux-search" data-lux="q" placeholder="Search name, address, phone, e-mail, notes…" aria-label="Search leads" autocomplete="off">'
    + '<select class="lux-pill" data-lux-sel="who" aria-label="All or mine"><option value="">All</option><option value="__me">Mine</option></select>'
    + '<select class="lux-pill" data-lux-sel="type" aria-label="Type"><option value="">Type</option><option>Residential</option><option>Commercial</option><option>Insurance</option><option>Bid</option></select>'
    + '<select class="lux-pill" data-lux-sel="stage" aria-label="Stage"><option value="">Stage</option>' + e.STAGES.map(function(x){ return '<option>' + esc(x) + '</option>'; }).join('') + '</select>'
    + '<button type="button" class="lux-more" data-lux-act="filters" aria-expanded="false">More filters</button>'
    + '<div class="lux-seg" data-lux="views" role="group" aria-label="View"><button type="button" data-lux-view="cards" title="List" aria-label="List">☰</button><button type="button" data-lux-view="board" title="Board" aria-label="Board">▥</button><button type="button" data-lux-view="map" title="Map" aria-label="Map">⌖</button><button type="button" data-lux-view="cal" title="Calendar" aria-label="Calendar">▦</button></div>'
    + '<div class="lux-menu"><button type="button" class="lux-dots" data-lux-act="menu" aria-label="More actions" aria-haspopup="true">⋯</button><div class="lux-dd" data-lux="dd" hidden></div></div></div>'
    + '<div class="lux-filters" data-lux="filters" hidden></div><div data-lux="body"></div></div>';
}
function q1(sel, el){ return (el || LUX.root).querySelector(sel); }
function setHtml(el, h){ if (el && el.__h !== h) { el.__h = h; el.innerHTML = h; } }
function setText(el, t){ if (el && el.textContent !== t) el.textContent = t; }
function chipsHtml(){
  var c = counts(), items = [['new', 'New (not contacted)', 'hot'], ['bids', 'Bids due this week', 'hot'], ['un', 'Unassigned', ''], ['fu', 'Follow-ups today', '']];
  return items.map(function(x){ return '<button type="button" class="lux-chip ' + (c[x[0]] && x[2] ? x[2] : '') + (UX.chip === x[0] ? ' on' : '') + '" data-lux-chip="' + x[0] + '" aria-pressed="' + (UX.chip === x[0]) + '"><b>' + c[x[0]] + '</b><span>' + x[1] + '</span></button>'; }).join('');
}
function whoOptions(u){
  var base = '<option value="">All</option><option value="__me">Mine</option>';
  if (u.who && u.who !== '__me') base += '<option value="' + esc(u.who) + '">' + esc(u.who === '__mybids' ? 'My bids' : u.who) + '</option>';
  return base;
}
function typeOptions(u){
  var cur = u.type, rev = ''; for (var k in TYPE_MAP) if (TYPE_MAP[k] === cur) rev = k;
  var base = '<option value="">Type</option>' + ['Residential', 'Commercial', 'Insurance', 'Bid'].map(function(x){ return '<option>' + x + '</option>'; }).join('');
  if (cur && !rev) base += '<option value="' + esc(cur) + '">' + esc(cur) + '</option>';
  return { html: base, val: rev || cur || '' };
}
function filtersHtml(){
  var e = E(), u = e.ui(), srcs = W._gcLeadSources ? W._gcLeadSources.list() : [];
  var opt = function(list, sel, all){ return '<option value="">' + esc(all) + '</option>' + list.map(function(x){ var v = typeof x === 'string' ? x : x.v, t = typeof x === 'string' ? x : x.t; return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join(''); };
  var base = e.scoped().filter(function(l){ return !e.importedL(l); }), nShut = base.filter(e.shut).length, nExp = base.filter(e.expired).length;
  var all0 = e.rawLeads().filter(function(l){ return !e.dead(l); }), nImp = all0.filter(function(l){ return !e.archivedL(l) && e.importedL(l); }).length, nArch = all0.filter(e.archivedL).length;
  var who = [{ v: '__me', t: 'Mine' }, { v: '__mybids', t: 'My bids (estimator)' }].concat(e.people().map(function(n){ return { v: n, t: n }; }));
  return '<label>Assignee<select data-gcl-f="who">' + opt(who, u.who, 'Everyone') + '</select></label>'
    + '<label>Source<select data-gcl-f="src">' + opt(srcs, u.src, 'All sources') + '</select></label>'
    + '<label>Priority<select data-gcl-f="prio">' + opt([{ v: 'hi', t: '8–10 (high)' }, { v: 'md', t: '5–7' }, { v: 'lo', t: '1–4' }, { v: 'none', t: 'No priority yet' }], u.prio, 'Any priority') + '</select></label>'
    + '<label>Bid due date<select data-gcl-f="due">' + opt([{ v: '7', t: 'Due in 7 days' }, { v: '30', t: 'Due in 30 days' }, { v: 'past', t: 'Past due' }], u.due, 'Any due date') + '</select></label>'
    + '<label class="lux-cb"><input type="checkbox" data-gcl-f="un"' + (u.un ? ' checked' : '') + '> Unassigned only</label>'
    + '<label class="lux-cb"><input type="checkbox" data-gcl-f="closed"' + (u.closed ? ' checked' : '') + '> Show lost / closed (' + nShut + ')</label>'
    + '<button type="button" class="lux-tg' + (u.exp ? ' on' : '') + '" data-lux-act="expired" aria-pressed="' + !!u.exp + '">Expired (' + nExp + ')</button>'
    + '<button type="button" class="lux-tg' + (u.imp ? ' on' : '') + '" data-lux-act="imported" aria-pressed="' + !!u.imp + '">Imported (' + nImp + ')</button>'
    + (nArch || u.arch ? '<button type="button" class="lux-tg' + (u.arch ? ' on' : '') + '" data-lux-act="archived" aria-pressed="' + !!u.arch + '">Archived (' + nArch + ')</button>' : '');
}
function menuHtml(){
  var e = E(), u = e.ui(), adm = e.isAdmin(), h = '';
  var all0 = e.rawLeads().filter(function(l){ return !e.dead(l); }), nImp = all0.filter(function(l){ return !e.archivedL(l) && e.importedL(l); }).length;
  var nCl = 0; if (adm) { try { nCl = W._gcLeadClean ? W._gcLeadClean.count() : 0; } catch (x) {} }
  var item = function(act, label, small){ return '<button type="button" data-lux-act="' + act + '">' + label + (small ? '<small>' + small + '</small>' : '') + '</button>'; };
  if (adm) h += item('settings', 'Lead settings');
  var rso = false; try { rso = !!(W._gcRSO && W._gcRSO._allowed && W._gcRSO._allowed()); } catch (x) {} if (rso) h += item('outreach', 'Outreach');
  if (adm && W._gcLeadClean) h += item('clean', 'Clean up', nCl ? String(nCl) : '');
  h += item('imported', 'Imported', (u.imp ? 'showing · ' : '') + nImp);
  if (e.canAssignAll()) h += item('bulk', UX.bulk ? 'Bulk assign: on' : 'Bulk assign', '');
  h += item('numbers', 'Pipeline numbers');
  if (adm) { h += '<hr>' + item('classic', 'Old table (admin)'); }
  return h;
}
function cardHtml(l, g){
  var e = E(), a = e.assignee(l), bid = e.isBidL(l), c = contactOf(l), tl = typeLabel(l), due = bid ? bidDueTxt(l) : '', fu = fuOf(l), cx = ctx(), adm = e.canAssignAll();
  var addr = s(l.address || l.city), srcTxt = e.srcCanon(l), when = ago(e.receivedMs(l));
  var closedL = e.closed(l), meta = esc(srcTxt) + (when ? '<i class="lux-dot"></i>' + esc(when) : '');
  if (!closedL && fu && fu <= cx.today && !bid) meta += '<i class="lux-dot"></i><span class="lux-due">Follow up ' + (fu === cx.today ? 'today' : 'overdue') + '</span>';
  if (due && !closedL) meta += '<i class="lux-dot"></i><span class="lux-due">Bid due ' + esc(due) + '</span>';
  var btn = '';
  if (closedL) btn = '<button type="button" class="lux-act alt">Open</button>';
  else if (!a && adm) btn = '<button type="button" class="lux-act assign" data-gcl-asg="' + esc(l.id) + '">Assign</button>';
  else if (bid) btn = '<button type="button" class="lux-act alt">Open bid</button>';
  else if (!a) btn = c.phone ? '<a class="lux-act" data-lux-call="' + esc(l.id) + '" href="tel:' + esc(c.phone.replace(/[^0-9+]/g, '')) + '">Call</a>' : '';
  else if (e.stageOf(l) === 'New Lead' && !s(l.contactedAt)) btn = !e.contacted(l) && c.phone ? '<a class="lux-act" data-lux-call="' + esc(l.id) + '" href="tel:' + esc(c.phone.replace(/[^0-9+]/g, '')) + '">Call</a>' : '<button type="button" class="lux-act" data-gcl-contact="' + esc(l.id) + '">Mark contacted</button>';
  else btn = '<button type="button" class="lux-act alt">Open</button>';
  var who = a ? '<span class="lux-av" title="' + esc(a) + '">' + esc(e.initials(a)) + '</span><span>' + esc(shortName(a)) + '</span>' : '<span class="lux-av un">?</span><span class="lux-un">Unassigned</span>';
  var pick = UX.bulk && adm ? '<input type="checkbox" class="lux-pick" data-gcl-pick="' + esc(l.id) + '"' + (e.pick()[l.id] ? ' checked' : '') + ' aria-label="Select for bulk assign">' : '';
  return '<article class="lux-card' + (e.ui().open === l.id ? ' sel' : '') + '" data-gcl-id="' + esc(l.id) + '" tabindex="0">' + pick
    + '<div class="lux-r1"><div><div class="lux-nm">' + esc(s(l.name || l.title) || 'Lead') + '</div>' + (addr ? '<div class="lux-ad">' + esc(addr) + '</div>' : '') + '</div><span class="lux-badge lux-b-' + tl + '">' + tl + '</span></div>'
    + '<div class="lux-meta">' + meta + '</div><div class="lux-r3"><div class="lux-who">' + who + '</div>' + btn + '</div></article>';
}
function groupHtml(key, title, list, red, collapsible){
  if (!list.length) return '';
  var shown = collapsible && !UX.closedOpen ? [] : list.slice(0, UX.more[key]);
  var h = '<section class="lux-grp"><div class="lux-gh' + (red ? ' red' : '') + '"><span>' + esc(title) + '</span><i>' + list.length + '</i>' + (collapsible ? '<button type="button" class="lux-tg2" data-lux-grp="' + key + '" aria-expanded="' + UX.closedOpen + '">' + (UX.closedOpen ? 'Hide ▾' : 'Show ▸') + '</button>' : '') + '</div>';
  if (shown.length) h += '<div class="lux-cards">' + shown.map(function(l){ return cardHtml(l); }).join('') + '</div>';
  if (shown.length < list.length && !(collapsible && !UX.closedOpen)) h += '<button type="button" class="lux-showmore" data-lux-more="' + key + '">Show ' + Math.min(30, list.length - shown.length) + ' more (' + (list.length - shown.length) + ' not shown)</button>';
  return h + '</section>';
}
function listHtml(){
  var e = E(), g = groups(), h = '';
  if (e.canAssignAll() && UX.bulk) {
    var pk = e.pick(), n = 0; for (var k in pk) if (pk[k]) n++;
    h += '<div class="lux-bar" style="margin-top:12px"><button type="button" class="lux-btn ghost" data-gcl-pickall>Select all shown / none</button><button type="button" class="lux-btn" data-gcl-bulkasg' + (n ? '' : ' disabled') + '>Assign selected (' + n + ')…</button><button type="button" class="lux-btn ghost" data-lux-act="bulk">Done</button></div>';
  }
  h += groupHtml('na', 'Needs action now', g.na, true) + groupHtml('ip', 'In progress', g.ip) + groupHtml('bd', 'Bids', g.bd) + groupHtml('cl', 'Recently closed', g.cl, false, true);
  if (!g.total) h += '<div class="lux-empty">No leads match. Clear a filter or a chip to see more.</div>';
  return h;
}
function update(){
  var e = E(), u = e.ui(), r = LUX.root; if (!r) return;
  var n = new Date(), classic = e.isAdmin() && ssGet('gcl_classic_ok') === '1';
  setText(q1('[data-lux=hi]'), greet() + ', ' + myFirst());
  setText(q1('[data-lux=sub]'), 'What needs your attention today? ' + n.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));
  var cb = q1('[data-lux=cbar]'); if (cb.hidden !== !classic) cb.hidden = !classic;
  r.classList.toggle('lux-classicmode', classic); H.classList.toggle('lux-classic', classic);
  setHtml(q1('[data-lux=chips]'), chipsHtml());
  var ws = q1('[data-lux-sel=who]'), wh = whoOptions(u); if (ws.__h !== wh) { ws.__h = wh; ws.innerHTML = wh; } ws.value = u.who || ''; ws.classList.toggle('on', !!u.who);
  var ts = q1('[data-lux-sel=type]'), to = typeOptions(u); if (ts.__h !== to.html) { ts.__h = to.html; ts.innerHTML = to.html; } ts.value = to.val; ts.classList.toggle('on', !!u.type);
  var ss = q1('[data-lux-sel=stage]'); ss.value = u.stage || ''; ss.classList.toggle('on', !!u.stage);
  var qi = q1('[data-lux=q]'); if (D.activeElement !== qi && qi.value !== u.q) qi.value = u.q;
  Array.prototype.forEach.call(r.querySelectorAll('[data-lux-view]'), function(b){ b.classList.toggle('on', b.getAttribute('data-lux-view') === UX.v); b.setAttribute('aria-pressed', String(b.getAttribute('data-lux-view') === UX.v)); });
  var fb = q1('[data-lux-act=filters]'); fb.setAttribute('aria-expanded', String(UX.filters)); fb.textContent = UX.filters ? 'Hide filters' : 'More filters';
  var ff = q1('[data-lux=filters]'); if (ff.hidden !== !UX.filters) ff.hidden = !UX.filters;
  if (UX.filters && !(D.activeElement && ff.contains(D.activeElement) && /SELECT|INPUT/.test(D.activeElement.tagName))) setHtml(ff, filtersHtml());
  var dd = q1('[data-lux=dd]'); dd.hidden = !UX.menu; if (UX.menu) setHtml(dd, menuHtml());
  var body = q1('[data-lux=body]');
  if (UX.v === 'cards') setHtml(body, listHtml());
  else { u.v = UX.v; var h = '<div class="lux-viewbody">' + e.bodyHtml() + '</div>'; setHtml(body, h); }
}
function render(){
  RQ = 0;
  var e = E(); var host = LUX.tab === 'leads' ? LUX.root : LUX.bids; if (!LUX.active || !e || !host || !host.isConnected) return;
  if (D.hidden) { PEND = true; return; }
  PEND = false;
  try {
    e.syncUI(); version();
    var key = fsig() + '|' + UX.filters + '|' + UX.menu + '|' + UX.closedOpen + '|' + UX.bulk + '|' + JSON.stringify(UX.more) + '|' + ssGet('gcl_classic_ok') + '|' + ymd(new Date());
    if (key === LAST_KEY && !FORCE) return;
    LAST_KEY = key; FORCE = false;
    if (LUX.tab === 'leads') update(); else if (LUX.tab === 'bidboard') updateBids();
    padPanel();
  } catch (x) { warn(x); }
}

/* ── the ⋯ menu, dialogs, Lead settings ── */
function closeModal(){ var m = D.getElementById('lux-modal'), b = D.getElementById('lux-back'); if (m) m.remove(); if (b) b.remove();
  ['gc-bw-watch', 'gc-ldi'].forEach(function(id){ var x = D.getElementById(id); if (x) x.classList.remove('lux-open'); }); }
function modal(html){
  closeModal();
  var b = D.createElement('div'); b.id = 'lux-back'; b.setAttribute('data-gc-keep', '1'); b.onclick = closeModal;
  var m = D.createElement('div'); m.id = 'lux-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('data-gc-keep', '1'); m.innerHTML = html;
  D.body.appendChild(b); D.body.appendChild(m);
  m.addEventListener('click', function(ev){ if (ev.target.closest('[data-lux-x]')) closeModal(); });
  return m;
}
function openSettings(opts){
  var e = E(); if (!e || !e.isAdmin()) return null;
  var d = e.openSettings(); if (!d) return null;
  [W._gcClaimsTo, W._gcAlertTo, W._gcMitTo, W._gcEmergTo].forEach(function(x){ try { if (x && x.tick) x.tick(); else if (x && x.mount) x.mount(); } catch (err) {} });
  var row = D.createElement('div'); row.className = 'lux-setrow';
  var la = D.getElementById('gc-la-set');
  row.innerHTML = '<button type="button" data-lux-set="est">Commercial bids go to…</button><button type="button" data-lux-set="new">+ Enter a bid</button>';
  if (la || true) { var hd = d.firstElementChild; if (hd && hd.nextSibling) d.insertBefore(row, hd.nextSibling); }
  row.addEventListener('click', function(ev){ var b = ev.target.closest('[data-lux-set]'); if (!b) return; var t = D.querySelector('#gc-la-set [data-la="' + b.getAttribute('data-lux-set') + '"]'); if (t) { e.closeSettings(); t.click(); } else toast('Not ready yet — try again in a moment.'); });
  if (opts && opts.cleanup) { var tries = 0; (function look(){ var b = d.querySelector('[data-bw="hidepreview"]'); if (b) { try { b.scrollIntoView({ block: 'center' }); } catch (x) {} b.click(); return; } if (++tries < 25) later(look, 250); })(); }
  return d;
}
function menuAct(a){
  var e = E(), u = e.ui();
  UX.menu = false;
  if (a === 'settings') openSettings();
  else if (a === 'outreach') { try { W._gcRSO.open(); } catch (x) { warn(x); } }
  else if (a === 'clean') { try { W._gcLeadClean.open(); } catch (x) { warn(x); } }
  else if (a === 'imported') { u.imp = !u.imp; if (u.imp) u.arch = false; e.saveUI(); }
  else if (a === 'archived') { u.arch = !u.arch; if (u.arch) u.imp = false; e.saveUI(); }
  else if (a === 'expired') { u.exp = !u.exp; e.saveUI(); }
  else if (a === 'bulk') { UX.bulk = !UX.bulk; }
  else if (a === 'classic') { if (e.isAdmin() && typeof W._gcLeadsClassic === 'function') { W._gcLeadsClassic(true); later(rerenderClassic, 60); } }
  else if (a === 'classic-off') { if (typeof W._gcLeadsClassic === 'function') { W._gcLeadsClassic(false); later(rerenderClassic, 60); } }
  else if (a === 'numbers') {
    var ks = []; try { ks = e.kpis(); } catch (x) { warn(x); }
    var m = modal('<h3>Pipeline numbers</h3><div class="lux-hint" style="color:#64708a;margin-bottom:10px">What the old Leads strip showed: unassigned, new today / this week, bids due in 7 days, not contacted over 4 h, win rate (90 days), open pipeline, sources (30 days).</div>'
      + ks.map(function(k){ return '<div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid #e6e8ec"><span>' + esc(k.l) + '</span><b>' + esc(k.n) + '</b></div>'; }).join('')
      + '<div style="text-align:right;margin-top:14px"><button type="button" class="lux-btn ghost" data-lux-x>Close</button></div>');
  }
  else if (a === 'new') { e.newLead(); }
  else if (a === 'filters') { UX.filters = !UX.filters; }
  else if (a === 'menu') { UX.menu = true; }
  FORCE = true; dirty(a);
}

/* ── events on the Leads screen ── */
var QT = 0, QV = '';
function bindLeads(r){
  E().bind(r);   /* the engine's own handlers: open a lead, board drag & drop, Board / Calendar / Map buttons, filter selects, "Show more" */
  r.addEventListener('click', function(ev){
    var t = ev.target.closest ? ev.target.closest('[data-lux-call],[data-lux-chip],[data-lux-view],[data-lux-act],[data-lux-more],[data-lux-grp]') : null;
    if (!t) return;
    var e = E();
    if (t.hasAttribute('data-lux-call')) {
      ev.stopPropagation();   /* the tel: link still dials; the card does not open */
      var id = t.getAttribute('data-lux-call');
      e.patchLead(id, function(x){ e.logAct(x, 'call', 'Called from the Leads tab'); if (!s(x.lastContact)) x.lastContact = e.nowIso(); }).then(function(){ dirty('call'); });
      return;
    }
    ev.stopPropagation();
    if (t.hasAttribute('data-lux-chip')) { var k = t.getAttribute('data-lux-chip'); UX.chip = UX.chip === k ? '' : k; uxSave(); dirty('chip'); return; }
    if (t.hasAttribute('data-lux-view')) { UX.v = t.getAttribute('data-lux-view'); if (UX.v !== 'cards') e.ui().v = UX.v; uxSave(); e.saveUI(); dirty('view'); return; }
    if (t.hasAttribute('data-lux-more')) { var g = t.getAttribute('data-lux-more'); UX.more[g] += 30; dirty('more'); return; }
    if (t.hasAttribute('data-lux-grp')) { UX.closedOpen = !UX.closedOpen; dirty('grp'); return; }
    menuAct(t.getAttribute('data-lux-act'));
  }, true);
  r.addEventListener('change', function(ev){
    var t = ev.target, k = t.getAttribute && t.getAttribute('data-lux-sel'); if (!k) return;
    var e = E(), u = e.ui();
    if (k === 'who') u.who = t.value;
    else if (k === 'type') u.type = TYPE_MAP[t.value] || t.value;
    else if (k === 'stage') u.stage = t.value;
    e.saveUI(); dirty('pill');
  });
  r.addEventListener('input', function(ev){
    var t = ev.target; if (!t.getAttribute || t.getAttribute('data-lux') !== 'q') return;
    var want = t.value; if (want === QV) return;   /* (a re-sent input event with the same text must not restart the 250 ms) */
    QV = want; if (QT) W.clearTimeout(QT);
    QT = later(function(){ QT = 0; var u = E().ui(); if (u.q !== QV) { u.q = QV; dirty('q'); } }, 250);
  });
  r.addEventListener('keydown', function(ev){ if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('lux-card')) { ev.preventDefault(); E().openDrawer(ev.target.getAttribute('data-gcl-id')); } });
}

/* ── the side panel (the old lead drawer element, laid out the new way) ── */
function sectionsOf(old){
  var box = D.createElement('div'); box.innerHTML = old; var out = { by: {}, rest: [] };
  Array.prototype.forEach.call(box.children, function(sec){
    if (sec.tagName !== 'SECTION') return;
    var h = sec.querySelector('h4'), t = h ? s(h.textContent) : '', k = /^Overview/.test(t) ? 'overview' : /Assigned to|Estimator/.test(t) ? 'assign' : /^Contact/.test(t) ? 'contact' : /⏰ Bid/.test(t) ? 'bid' : /Plans/.test(t) ? 'plans' : /Sub bid portal/.test(t) ? 'portal' : /Estimate & job/.test(t) ? 'est' : /Activity/.test(t) ? 'activity' : '';
    if (k) out.by[k] = sec.outerHTML; else out.rest.push(sec.outerHTML);
  });
  return out;
}
function nextStep(l){
  var e = E(), st = e.stageOf(l);
  return st === 'New Lead' ? (e.contacted(l) ? 'Next step: mark it contacted, then book the site visit.' : 'Next step: contact them today.') : st === 'Contacted' ? 'Next step: book the site visit.' : st === 'Site Visit' ? 'Next step: write the estimate.' : st === 'Estimate Sent' ? 'Next step: follow up on the estimate.' : st === 'Negotiating' ? 'Next step: close it out.' : st === 'Won' ? 'Won. Convert it to a job under More.' : 'Lost' + (l.lostReason ? ': ' + s(l.lostReason) : '.');
}
function panel(l, old){
  var e = E(), S = sectionsOf(old), c = contactOf(l), bid = e.isBidL(l), a = e.assignee(l), stp = stepOf(l), st = e.stageOf(l), tl = typeLabel(l);
  var steps = ['New', 'Contacted', 'Estimate', st === 'Lost' ? 'Lost' : st === 'Won' ? 'Won' : 'Won / Lost'].map(function(n, i){
    return '<button type="button" class="lux-st' + (i < stp ? ' done' : '') + (i === stp ? ' cur' : '') + (i === 3 && st === 'Lost' ? ' lost' : '') + '" data-lux-stage="' + i + '" aria-label="' + esc(n) + '"' + (i === stp ? ' aria-current="step"' : '') + '>' + n + '</button>';
  }).join('');
  var tel = c.phone.replace(/[^0-9+]/g, '');
  var A = c.phone ? '<a data-d="log" data-k="call" href="tel:' + esc(tel) + '">Call</a><a data-d="log" data-k="text" href="sms:' + esc(tel) + '">Text</a>' : '<span class="on">Call</span><span>Text</span>';
  A += c.email ? '<a data-d="log" data-k="email" target="_blank" rel="noopener" href="https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(c.email) + '&su=' + encodeURIComponent(s(l.name || l.title)) + '">E-mail</a>' : '<span>E-mail</span>';
  var notes = []; s(l.notes).split(/\n+/).forEach(function(x){ x = x.trim(); if (x) notes.push({ t: x, at: '' }); });
  arr(l.activity).forEach(function(h){ if (h && h.type === 'note' && s(h.text) && !notes.some(function(n){ return n.t === s(h.text); })) notes.push({ t: s(h.text), at: h.at }); });
  var noteHtml = notes.slice(-6).map(function(n){ return '<div class="lux-note">' + esc(n.t) + (n.at ? '<small>Added ' + esc(ago(Date.parse(n.at))) + '</small>' : '') + '</div>'; }).join('') || '<div class="lux-hint">No notes yet.</div>';
  var cus = typeof W._gcCustomer360 === 'function', vis = typeof W._gcVisitNotes === 'function', haveRow = true;
  var canC = !e.closed(l) && st === 'New Lead' && !s(l.contactedAt);
  var moreHtml = '<section><h4>Details</h4><div class="lux-kvs">'
    + '<div class="lux-kv"><span>Value</span><b>' + (e.value(l) ? e.money(e.value(l)) : '—') + '</b></div>'
    + '<div class="lux-kv"><span>Came in</span><b>' + (e.born(l) ? esc(new Date(e.born(l)).toLocaleString()) : '—') + '</b></div>'
    + '<div class="lux-kv"><span>Source</span><b>' + esc(e.srcCanon(l)) + '</b></div></div>'
    + '<div class="lux-row"><select data-d="stage" aria-label="Stage">' + e.STAGES.map(function(x){ return '<option' + (x === st ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>'
    + '<button type="button" class="b gold" data-d="won">Won</button>'
    + '<button type="button" class="b" data-d="lognote">Log a call / note</button>' + (cus ? '<button type="button" class="b" data-d="cust">Customer</button>' : '') + (vis ? '<button type="button" class="b" data-d="visit">Visit notes (talk or type)</button>' : '') + '</div>'
    + '<div class="lux-hint">Calls, texts and e-mails you start here are logged on the lead.</div></section>'
    + (bid ? '' : (S.by.bid || '')) + (S.by.plans || '') + (S.by.portal || '') + (S.by.est || '') + (S.by.activity || '') + S.rest.join('');
  return '<div class="lux-ph"><div class="lux-meta" style="gap:8px"><span class="lux-badge lux-b-' + tl + '">' + tl + '</span><span>' + esc(st) + '</span></div><button type="button" class="lux-x" data-d="x" aria-label="Close">✕</button>'
    + '<h3>' + esc(s(l.name || l.title) || 'Lead') + '</h3><div class="lux-ad lux-addr">' + esc([l.address, l.city, l.state, l.zip].filter(Boolean).join(', ')) + '</div></div>'
    + '<div class="lux-pb"><div class="lux-steps" role="group" aria-label="Progress">' + steps + '</div><div class="lux-hint">' + esc(nextStep(l)) + '</div>'
    + '<div class="lux-pa" role="group" aria-label="Contact">' + A + '</div>'
    + '<div class="lux-assign">' + (S.by.assign || '') + '</div>'
    + '<div class="lux-lbl">Contact</div><div class="lux-kvs"><div class="lux-kv"><span>Name</span><b>' + esc(c.name || '—') + '</b></div><div class="lux-kv"><span>Phone</span><b>' + esc(c.phone || '—') + '</b></div><div class="lux-kv"><span>E-mail</span><b>' + esc(c.email || '—') + '</b></div><div class="lux-kv"><span>Source</span><b>' + esc(e.srcCanon(l)) + '</b></div></div>'
    + '<div class="lux-lbl">Priority</div><div class="lux-pri">' + e.prioChip(l) + ' ' + (e.canPrio(l) ? e.prioPicker(l) : '<span class="lux-hint" style="margin:0">An admin sets the priority' + (bid ? ' (or the estimator, on a bid)' : '') + '.</span>') + '</div>'
    + '<div class="lux-lbl">Notes</div>' + noteHtml
    + '<textarea data-lux-p="note" placeholder="Add a note…" aria-label="Add a note"></textarea>'
    + '<div class="lux-row"><button type="button" class="b" data-lux-p="addnote">Add note</button>' + (vis ? '<button type="button" class="b" data-d="visit">Visit notes</button>' : '') + '</div>'
    + '<div class="lux-lbl">Follow up on</div><div class="lux-row"><input type="date" data-lux-p="fu" value="' + esc(fuOf(l)) + '" aria-label="Follow-up date"></div>'
    + (bid ? '<div class="lux-lbl">Bid</div><div class="lux-bidbox">' + (S.by.bid || '') + '</div>' : '')
    + '<div class="lux-prim">' + (canC ? '<button type="button" class="go" data-d="contacted">Mark contacted</button>' : '<span style="flex:1"></span>') + (e.closed(l) ? '' : '<button type="button" class="lostbtn" data-d="lost">Mark lost</button>') + '</div>'
    + '<div class="lux-foot">' + '<a data-d="editfull" role="button" tabindex="0">Edit details</a><a data-d="delfull" role="button" tabindex="0">Delete</a>' + '</div>'
    + (l.lostReason ? '<div class="lux-hint" style="margin-top:12px">Lost because: ' + esc(l.lostReason) + '</div>' : '')
    + '<details class="lux-moredet"' + (LUX.moreOpen ? ' open' : '') + '><summary>More</summary>' + moreHtml + '</details></div>';
}
function bindPanel(d){
  if (d.__lux) return; d.__lux = true;
  d.addEventListener('toggle', function(ev){ if (ev.target.classList && ev.target.classList.contains('lux-moredet')) LUX.moreOpen = ev.target.open; }, true);
  d.addEventListener('click', function(ev){
    var ed = ev.target.closest ? ev.target.closest('[data-d="editfull"],[data-d="delfull"]') : null;
    if (ed) {
      ev.stopPropagation(); var e0 = E(), id0 = e0.ui().open, edit = ed.getAttribute('data-d') === 'editfull'; if (!id0) return;
      withRow(id0, function(){ var rb = e0.classicRow(id0, edit ? /✏/ : /🗑/); if (!rb) { toast('Not available for this lead.'); return; } e0.closeDrawer(); rb.click(); if (edit) later(function(){ e0.focusForm(); }, 250); });
      return;
    }
  }, true);
  d.addEventListener('click', function(ev){
    var e = E(), t = ev.target.closest ? ev.target.closest('[data-lux-stage],[data-lux-p]') : null; if (!t) return;
    var id = e.ui().open; if (!id) return;
    if (t.hasAttribute('data-lux-stage')) {
      var i = +t.getAttribute('data-lux-stage'), to = ['New Lead', 'Contacted', 'Estimate Sent', 'Won'][i];
      if (to && e.stageOf(e.leads().filter(function(x){ return x.id === id; })[0] || {}) !== to) e.moveStage(id, to);
      return;
    }
    if (t.getAttribute('data-lux-p') === 'addnote') {
      var ta = d.querySelector('[data-lux-p="note"]'), txt = s(ta && ta.value).trim(); if (!txt) return;
      e.patchLead(id, function(x){ e.logAct(x, 'note', txt); x.notes = (s(x.notes) ? s(x.notes) + '\n' : '') + txt; }).then(function(){ e.openDrawer(id); dirty('note'); });
    }
  });
  d.addEventListener('change', function(ev){
    var t = ev.target; if (!t.getAttribute || t.getAttribute('data-lux-p') !== 'fu') return;
    var e = E(), id = e.ui().open; if (!id) return;
    e.patchLead(id, function(x){ x.followUp = s(t.value); if (!t.value) delete x.followUp; }).then(function(ok){ toast(ok ? (t.value ? 'Follow-up set for ' + t.value : 'Follow-up cleared') : 'Could not save — try again'); dirty('fu'); });
  });
}
function afterOpen(l){
  var d = D.getElementById('gcl-drawer'); if (d) bindPanel(d);
  padPanel();
  var e = E(); if (!LUX.root) return;
  Array.prototype.forEach.call(LUX.root.querySelectorAll('.lux-card.sel'), function(c){ c.classList.remove('sel'); });
  var c = LUX.root.querySelector('.lux-card[data-gcl-id="' + String(l.id).replace(/["\\]/g, '') + '"]'); if (c) c.classList.add('sel');
}
function afterClose(){ ALLOW = {}; padPanel(); if (LUX.root) Array.prototype.forEach.call(LUX.root.querySelectorAll('.lux-card.sel'), function(c){ c.classList.remove('sel'); }); }
function padPanel(){ var has = !!D.getElementById('gcl-drawer'); [LUX.root, LUX.bids].forEach(function(r){ if (r) r.classList.toggle('lux-pad', has); }); }

/* ── Bids ── */
function bidsSkeleton(){
  return '<div class="lux-top"><div><div class="lux-h1" role="heading" aria-level="1">Bids</div><p class="lux-sub" data-lux="bsub"></p></div><button type="button" class="lux-btn gold lux-new" style="margin-left:auto" data-lux-bact="new">+ New lead</button></div>'
    + '<div class="lux-bar"><input type="search" class="lux-search" data-lux="bq" placeholder="Search bids, agencies…" aria-label="Search bids" autocomplete="off">'
    + '<select class="lux-pill" data-lux-bsel="mine" aria-label="Mine or all"><option value="">All</option><option value="1">Mine</option></select>'
    + '<select class="lux-pill" data-lux-bsel="due" aria-label="Due date"><option value="">Due date</option><option value="7">Due in 7 days</option><option value="30">Due in 30 days</option><option value="past">Past due</option></select>'
    + '<div class="lux-menu"><button type="button" class="lux-dots" data-lux-bact="menu" aria-label="More actions" aria-haspopup="true">⋯</button><div class="lux-dd" data-lux="bdd" hidden></div></div></div>'
    + '<div data-lux="bbody"></div>';
}
function bidList(){
  var e = E(), now = Date.now(), q = low(UX.bq), me = low(e.myName()), hidden = 0, list = [];
  e.scoped().forEach(function(l){
    if (!e.isBidL(l) || e.importedL(l)) return;
    var sh = e.shut(l); if (sh && !UX.bShowHidden) { hidden++; return; }
    if (UX.bMine && low(e.assignee(l)) !== me && !e.mineL(l)) return;
    var t = e.dueMs(l);
    if (UX.bdue) { if (!isFinite(t)) return; var d = (t - now) / 864e5; if (UX.bdue === 'past' ? d >= 0 : UX.bdue === '7' ? (d < 0 || d > 7) : (d < 0 || d > 30)) return; }
    if (q && !match(l, q)) return;
    list.push(l);
  });
  list.sort(function(a, b){ var x = e.dueMs(a), y = e.dueMs(b); x = isFinite(x) ? x : 9e15; y = isFinite(y) ? y : 9e15; return x - y || e.receivedMs(b) - e.receivedMs(a); });
  return { list: list, hidden: hidden };
}
function bidsHtml(){
  var e = E(), r = bidList(), now = Date.now(), adm = e.canAssignAll();
  var rows = r.list.slice(0, UX.bMore).map(function(l){
    var t = e.dueMs(l), a = e.assignee(l), days = isFinite(t) ? Math.ceil((t - now) / 864e5) : null;
    var due = isFinite(t) ? '<div class="lux-dd2' + (days != null && days <= 3 ? ' soon' : '') + '">' + esc(monthDay(t)) + '<small>' + (days < 0 ? Math.abs(days) + (Math.abs(days) === 1 ? ' day ago' : ' days ago') : days === 0 ? 'today' : 'in ' + days + (days === 1 ? ' day' : ' days')) + '</small></div>' : '<div class="lux-dd2">No date<small>add it on the bid</small></div>';
    var agency = s(l.dueToCompany || l.gc || l.agency || l.owner || l.client) || e.srcCanon(l);
    var who = a ? '<span class="lux-av">' + esc(e.initials(a)) + '</span><span>' + esc(shortName(a)) + '</span>' : '<span class="lux-av un">?</span><span class="lux-un">Unassigned</span>';
    var act = !a && adm ? '<button type="button" class="lux-act assign" data-gcl-asg="' + esc(l.id) + '">Assign</button>' : '<button type="button" class="lux-act alt">Open bid</button>';
    return '<div class="lux-br" data-lux-open="' + esc(l.id) + '" tabindex="0">' + due + '<div class="lux-t">' + esc(s(l.name || l.title) || 'Bid') + '<small>' + esc(s(l.city || l.address)) + '</small></div><div>' + esc(agency) + '</div><div class="lux-who">' + who + '</div><div>' + act + '</div></div>';
  }).join('');
  var more = r.list.length > UX.bMore ? '<button type="button" class="lux-showmore" data-lux-bact="more">Show ' + Math.min(50, r.list.length - UX.bMore) + ' more (' + (r.list.length - UX.bMore) + ' not shown)</button>' : '';
  return (r.list.length ? '<div class="lux-tbl"><div class="lux-bh"><div>Due</div><div>Title</div><div>Owner / agency</div><div>Estimator</div><div></div></div>' + rows + '</div>' + more : '<div class="lux-empty">No bids match.</div>')
    + '<div class="lux-foot2">Non-construction bids (supplies, janitorial, IT) are hidden automatically. ' + (r.hidden || UX.bShowHidden ? '<button type="button" data-lux-bact="hidden">' + (UX.bShowHidden ? 'Hide closed / hidden' : 'Show hidden (' + r.hidden + ')') + '</button>' : '') + '</div>';
}
function updateBids(){
  var e = E(), b = LUX.bids; if (!b) return;
  setText(b.querySelector('[data-lux=bsub]'), 'Construction bids only, soonest due first.');
  var ms = b.querySelector('[data-lux-bsel=mine]'); ms.value = UX.bMine ? '1' : ''; ms.classList.toggle('on', UX.bMine);
  var ds = b.querySelector('[data-lux-bsel=due]'); ds.value = UX.bdue; ds.classList.toggle('on', !!UX.bdue);
  var dd = b.querySelector('[data-lux=bdd]'); dd.hidden = !UX.menu;
  if (UX.menu) { var adm = e.isAdmin(), item = function(a, l){ return '<button type="button" data-lux-bact="' + a + '">' + l + '</button>'; };
    setHtml(dd, (adm ? item('settings', 'Lead settings') + item('cleanup', 'Hide non-construction bids') : '') + item('watch', 'Watched boards') + item('inbox', 'Full Lead Inbox (classic cards)') + (adm ? '<hr>' + item('classic', 'Classic bid board (switch tabs to come back)') : '')); }
  setHtml(b.querySelector('[data-lux=bbody]'), bidsHtml());
}
var BQT = 0, BQV = '';
function bindBids(b){
  E().bind(b);
  b.addEventListener('click', function(ev){
    var e = E(), a = ev.target.closest ? ev.target.closest('[data-lux-bact]') : null;
    if (a) {
      ev.stopPropagation(); var k = a.getAttribute('data-lux-bact'); UX.menu = false;
      if (k === 'menu') UX.menu = true;
      else if (k === 'new') e.newLead();
      else if (k === 'more') UX.bMore += 50;
      else if (k === 'hidden') UX.bShowHidden = !UX.bShowHidden;
      else if (k === 'settings') openSettings();
      else if (k === 'cleanup') openSettings({ cleanup: true });
      else if (k === 'watch') showWatch();
      else if (k === 'inbox') showInbox();
      else if (k === 'classic') { LUX.bClassic = true; H.classList.add('lux-classic'); b.hidden = true; }
      FORCE = true; dirty(k); return;
    }
    var row = ev.target.closest ? ev.target.closest('[data-lux-open]') : null;
    if (row && !ev.target.closest('[data-gcl-asg]')) { e.openDrawer(row.getAttribute('data-lux-open')); }
  }, true);
  b.addEventListener('change', function(ev){ var t = ev.target, k = t.getAttribute && t.getAttribute('data-lux-bsel'); if (!k) return; if (k === 'mine') UX.bMine = t.value === '1'; else UX.bdue = t.value; UX.bMore = 50; dirty('bsel'); });
  b.addEventListener('input', function(ev){ var t = ev.target; if (!t.getAttribute || t.getAttribute('data-lux') !== 'bq') return; var w = t.value; if (w === BQV) return; BQV = w; if (BQT) W.clearTimeout(BQT); BQT = later(function(){ BQT = 0; if (UX.bq !== BQV) { UX.bq = BQV; UX.bMore = 50; dirty('bq'); } }, 250); });
  b.addEventListener('keydown', function(ev){ if (ev.key === 'Enter' && ev.target.hasAttribute && ev.target.hasAttribute('data-lux-open')) E().openDrawer(ev.target.getAttribute('data-lux-open')); });
}
function showWatch(){
  try { if (W._gcLeadInbox && W._gcLeadInbox.mountNow) W._gcLeadInbox.mountNow(); } catch (x) {}
  var tries = 0; (function go(){
    try { if (W._gcBidWatchCard) W._gcBidWatchCard(); } catch (x) {}
    var c = D.getElementById('gc-bw-watch');
    if (c) { var b = D.createElement('div'); b.id = 'lux-back'; b.setAttribute('data-gc-keep', '1'); b.onclick = closeModal; D.body.appendChild(b); c.classList.add('lux-open'); return; }
    if (++tries < 12) later(go, 150); else toast('Watched boards are not ready yet — try again in a moment.');
  })();
}
function showInbox(){
  try { if (W._gcLeadInbox && W._gcLeadInbox.mountNow) W._gcLeadInbox.mountNow(); } catch (x) {}
  var tries = 0; (function go(){
    var c = D.getElementById('gc-ldi');
    if (c) { var b = D.createElement('div'); b.id = 'lux-back'; b.setAttribute('data-gc-keep', '1'); b.onclick = closeModal; D.body.appendChild(b); c.classList.add('lux-open'); return; }
    if (++tries < 12) later(go, 150); else toast('The Lead Inbox is not ready yet — try again in a moment.');
  })();
}

/* ── mounting: only the screen of the tab that is open; nothing is watched ── */
var BEAT = 0, TRIES = 0, BEATS = 0, LAST_CRM = null;
function tabBar(){ return D.getElementById('gc-leads-tabs'); }
function unmount(){
  if (LUX.root) { LUX.root.remove(); LUX.root = null; } if (LUX.bids) { LUX.bids.remove(); LUX.bids = null; }
  LUX.active = false; LUX.tab = ''; LUX.bClassic = false; H.classList.remove('lux-on'); H.classList.remove('lux-classic'); closeModal();
  try { if (W._gcLeadInbox && W._gcLeadInbox.wake) W._gcLeadInbox.wake(); } catch (x) {}
  var d = D.getElementById('gcl-drawer'); if (d && view() !== 'leads') { var e = E(); if (e) e.closeDrawer(); }
}
function roleDefaults(e, bar){
  var key = 'gc_lux_init_v1:' + (e.myEmail() || 'me'); if (ssGet(key)) return; ssSet(key, '1');
  var sc = e.myScope();
  if (sc.kind === 'bids' && e.amEstimator()) { var b = bar.querySelector('[data-gc-tab="bidboard"]'); if (b && bar.getAttribute('data-tab') === 'leads') { later(function(){ b.click(); }, 0); } }
  else if (sc.kind !== 'all') { var u = e.ui(); u.who = '__me'; e.saveUI(); }
}
function ensure(){
  var e = E();
  if (!e || !W.__GC_LUX__ || W.__GC_LUX_FAIL__) return;
  try {
    var bar = tabBar();
    if (view() !== 'leads') { if (LUX.active || LUX.root || LUX.bids) unmount(); return; }
    if (!bar || !bar.parentElement) { if (TRIES++ < 12) later(ensure, [0, 60, 150, 300, 600, 1000, 1600, 2400, 3000, 4000, 5000, 6000][TRIES - 1] || 4000); return; }
    TRIES = 0;
    var tab = bar.getAttribute('data-tab') || 'leads';
    if (!LUX.active) { uxLoad(); e.css(); roleDefaults(e, bar); }
    if (tab !== 'bidboard' && LUX.bClassic) { LUX.bClassic = false; H.classList.remove('lux-classic'); }
    if (tab !== 'leads' && tab !== 'bidboard') { if (LUX.root) { LUX.root.remove(); LUX.root = null; } if (LUX.bids) { LUX.bids.remove(); LUX.bids = null; } LUX.active = false; LUX.tab = ''; H.classList.remove('lux-on'); closeModal();
      if (tab === 'website') { try { if (W._gcLeadInbox && W._gcLeadInbox.mountNow) W._gcLeadInbox.mountNow(); } catch (y) {} }   /* the website strip hangs off the inbox container */
      return; }
    if (tab === 'bidboard' && LUX.root) { LUX.root.remove(); LUX.root = null; }
    if (tab === 'leads' && LUX.bids) { LUX.bids.remove(); LUX.bids = null; }
    LUX.active = true; LUX.tab = tab; H.classList.add('lux-on');
    if (tab === 'leads') {
      if (!LUX.root || !LUX.root.isConnected || LUX.root.parentElement !== bar.parentElement || !(bar.compareDocumentPosition(LUX.root) & 4)) {
        if (LUX.root) LUX.root.remove();
        var r = D.createElement('div'); r.id = 'gc-lux'; r.className = 'lux-keep'; r.setAttribute('data-gc-keep', '1'); r.innerHTML = skeleton();
        bar.parentElement.insertBefore(r, bar.nextSibling); LUX.root = r; bindLeads(r); LAST_KEY = '';
      }
    } else {
      if (!LUX.bids || !LUX.bids.isConnected || LUX.bids.parentElement !== bar.parentElement || !(bar.compareDocumentPosition(LUX.bids) & 4)) {
        if (LUX.bids) LUX.bids.remove();
        var b = D.createElement('div'); b.id = 'gc-lux-bids'; b.className = 'lux-keep'; b.setAttribute('data-gc-keep', '1'); b.innerHTML = bidsSkeleton();
        bar.parentElement.insertBefore(b, bar.nextSibling); LUX.bids = b; bindBids(b); LAST_KEY = '';
      }
      LUX.bids.hidden = !!LUX.bClassic;
    }
    version(); FORCE = true; render();
    if (!BEAT) { BEAT = 1; later(beat, 6000); }
  } catch (x) {
    warn(x); W.__GC_LUX_FAIL__ = true; try { unmount(); H.classList.remove('lux-on'); if (W._gcLeadsHub && W._gcLeadsHub.redraw) W._gcLeadsHub.redraw(); } catch (y) {}
  }
}
/* the only timer: every 6 s, only while a Leads screen is up and the tab is visible: is the mount still there, did the lead list change? */
function beat(){
  BEAT = 0;
  if (!LUX.active || view() !== 'leads') return;
  BEAT = 1; later(beat, 6000);
  if (D.hidden) return;
  try {
    var e = E(), cl = W._crm && W._crm.leads; BEATS++;
    if (e && (cl !== LAST_CRM || BEATS % 10 === 0)) { LAST_CRM = cl; e.pull(); }   /* the saved copy is read when the page's list changed (a sync arrived), else once a minute - never every beat */
    ensure(); if (LUX.active) dirty('beat');
  } catch (x) { warn(x); }
}

/* what wakes it up: a view change, a click on the tab bar, the tab becoming visible (no observers) */
try {
  var set0 = W.Storage.prototype.setItem;
  W.Storage.prototype.setItem = function(k, v){ var r = set0.apply(this, arguments); if (k === 'grayco_view') later(ensure, 0), later(ensure, 250); return r; };
} catch (x) {}
D.addEventListener('click', function(ev){ var t = ev.target; if (!t || !t.closest) return; if (t.closest('#gc-leads-tabs')) { later(ensure, 40); later(ensure, 300); if (typeof W._gcHot2bSync === 'function') later(W._gcHot2bSync, 60); } else if (UX.menu && !t.closest('.lux-menu')) { UX.menu = false; FORCE = true; dirty('menu-x'); } }, true);
D.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') { if (UX.menu) { UX.menu = false; FORCE = true; dirty('esc'); } if (D.getElementById('lux-modal') || D.getElementById('lux-back')) closeModal(); } });
D.addEventListener('visibilitychange', function(){ if (!D.hidden && LUX.active) { if (!BEAT) { BEAT = 1; later(beat, 6000); } ensure(); dirty('visible'); } });
W.addEventListener('popstate', function(){ later(ensure, 60); });
W.addEventListener('gc:leads-changed', function(){ if (LUX.active) dirty('leads-changed'); });
later(ensure, 400);

W._gcLux = LUX; LUX.state = UX; LUX.panel = panel; LUX.dirty = dirty; LUX.mount = ensure; LUX.version = function(){ return version(); }; LUX.match = match; LUX.keep = keep;
LUX.afterOpen = afterOpen; LUX.afterClose = afterClose; LUX.openSettings = openSettings; LUX.groups = function(){ var g = groups(); return { na: g.na.length, ip: g.ip.length, bd: g.bd.length, cl: g.cl.length }; };
W._gcLuxOn = function(){ return LUX.active; };
try { console.log('[GC] Leads · Bids · Website & ads (patch LEADSUX) — _gcLux'); } catch (x) {}
})();
